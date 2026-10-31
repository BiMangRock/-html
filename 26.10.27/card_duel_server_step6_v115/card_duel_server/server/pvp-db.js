// pvp-db.js (server) — 유저 대전의 DB 쪽: 내 덱 불러오기 · 승리 보상 · 하루/같은 상대 한도 · 전적.
//  express·소켓과 무관. pvp-core.js 가 판이 끝나면 settle() 을, 판이 시작될 때 loadDeck() 을 부른다.
//  보상 지급과 판 기록은 한 트랜잭션이다 (골드만 오르거나 기록만 남는 일이 없다).
const path = require('path');
const db = require('./db');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP } = require(path.join(JS, 'pvp.js'));
const { Economy } = require(path.join(JS, 'economy.js'));
const { validateDeckOwned } = require(path.join(JS, 'collection.js'));
const { ensureCollection, collectionOf } = require('./collection');
const { walletRow, walletOut, ensureWallet } = require('./wallet');

// 대전에 쓸 덱: 서버에 저장된 내 덱. 없거나 규칙·보유 카드에 안 맞으면(조작 포함) 추천 덱.
function loadDeck(uid) {
  ensureCollection(uid);
  const d = db.prepare('SELECT deck_json FROM decks WHERE user_id=?').get(uid);
  if (d) {
    try {
      const list = JSON.parse(d.deck_json);
      if (!E.validateDeckList(list) && !validateDeckOwned(list, collectionOf(uid))) return list;
    } catch (_) {}
  }
  return E.defaultDeckList();
}

const today = (now = Date.now()) => Economy.dayKey(new Date(now));
const rewardsToday = (uid, day) => db.prepare('SELECT COUNT(*) AS n FROM pvp_matches WHERE winner=? AND day=? AND reward>0').get(uid, day).n;

// g: {matchId, uids:[p0,p1], winnerSeat: 0|1|null, reason, turns, startedAt}
// 보상: 이긴 판이면 항상 WIN_GOLD (턴 수·하루 횟수·상대 제한 없음). 무승부·무효 판만 0.
// 반환: 좌석 순서대로 [{reward, rewardsToday, wallet?}, …]   (wallet 은 보상을 받은 사람만)
function settle(g) {
  const now = Date.now(), day = today(now), [p0, p1] = g.uids;
  const isVoid = g.reason === 'void';
  const winnerSeat = !isVoid && (g.winnerSeat === 0 || g.winnerSeat === 1) ? g.winnerSeat : null;
  const winner = winnerSeat === null ? null : g.uids[winnerSeat];
  db.exec('BEGIN');
  try {
    const reward = winner !== null ? PVP.WIN_GOLD : 0;
    db.prepare('INSERT INTO pvp_matches(match_id,p0,p1,winner,reason,turns,reward,day,started_at,ended_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(String(g.matchId), p0, p1, winner, String(g.reason), g.turns | 0, reward, day, g.startedAt || now, now);
    let wallet;
    if (reward > 0) {
      ensureWallet(winner);
      db.prepare('UPDATE wallets SET gold=gold+?, rev=rev+1, updated_at=? WHERE user_id=?').run(reward, now, winner);   // rev 를 올려서, 낡은 화면(다른 탭)이 골드를 덮어쓰지 못하게
      wallet = walletOut(walletRow(winner));
    }
    const out = g.uids.map(uid => {
      const o = { reward: uid === winner ? reward : 0, rewardsToday: rewardsToday(uid, day) };
      if (uid === winner && wallet) o.wallet = wallet;
      return o;
    });
    db.exec('COMMIT');
    return out;
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

// 전적 (무효 판은 뺀다) + 오늘 거둔 승리 수(= 보상을 받은 판 수, 한도 없음)
function statsOf(uid) {
  const day = today();
  const q = sql => db.prepare(sql).get(uid, uid).n;
  const mine = '(p0=? OR p1=?)';
  const wins = db.prepare("SELECT COUNT(*) AS n FROM pvp_matches WHERE winner=? AND reason!='void'").get(uid).n;
  const losses = db.prepare(`SELECT COUNT(*) AS n FROM pvp_matches WHERE ${mine} AND winner IS NOT NULL AND winner!=? AND reason!='void'`).get(uid, uid, uid).n;
  const draws = q(`SELECT COUNT(*) AS n FROM pvp_matches WHERE ${mine} AND winner IS NULL AND reason!='void'`);
  return { record: { wins, losses, draws }, winGold: PVP.WIN_GOLD, rewardsToday: rewardsToday(uid, day) };
}

module.exports = { loadDeck, settle, statsOf };
