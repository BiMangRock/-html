// saves.js — 계정별 저장 API (3단계): 골드(wallet) · 내 덱 · 모험 클리어 기록
//  - 전부 로그인 필수. 요청은 항상 "내 계정" 기준이라 남의 데이터는 건드릴 수 없다.
//  - 값 검증은 클라이언트와 같은 코드(economy.js 의 sanitize, engine.js 의 validateDeckList)를 쓴다.
//  - ⚠ 아직 골드 계산은 클라이언트가 한다 (서버는 형식만 검증). 서버가 직접 판정하는 건 6단계.
const path = require('path');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const JS = path.join(__dirname, '..', 'public', 'js');
const { Economy } = require(path.join(JS, 'economy.js'));
const { validateDeckList, CARD_POOL, CONFIG } = require(path.join(JS, 'engine.js'));
const { validateDeckOwned, validateDeckScope } = require(path.join(JS, 'collection.js'));
const { advBlocker } = require(path.join(JS, 'adventure.js'));
const { ensureCollection, collectionOf } = require('./collection');
const { walletRow, walletOut, ensureWallet } = require('./wallet');
const { readBosses, currentBosses } = require('./bosses');

const router = express.Router();
router.use(requireAuth);

// ---------- wallet ----------
// 지갑 조회·생성은 wallet.js (유저 대전 정산도 같이 씀)

// 덱 검사 (공통): 30장·같은 카드 2장 · 내가 가진 카드만 · 사용 범위(일반 덱엔 모험 카드 X, 보스 전용은 어디에도 X). 문제 없으면 null
function deckProblem(list, collection, mode) {
  return validateDeckList(list) || validateDeckOwned(list, collection) || validateDeckScope(list, CARD_POOL, mode);
}
function storedDeck(table, uid, collection, mode) {
  const d = db.prepare(`SELECT deck_json FROM ${table} WHERE user_id=?`).get(uid);
  if (!d) return null;
  try { const l = JSON.parse(d.deck_json); return deckProblem(l, collection, mode) ? null : l; } catch (_) { return null; }
}
function saveDeck(table, mode) {
  return (req, res) => {
    const list = (req.body || {}).deck;
    const bad = validateDeckList(list);
    if (bad) return res.status(400).json({ error: bad });
    ensureCollection(req.user.id);
    const prob = deckProblem(list, collectionOf(req.user.id), mode);      // 가진 카드로만 · 사용 범위 (서버가 최종 검사)
    if (prob) return res.status(400).json({ error: prob });
    db.prepare(`INSERT INTO ${table}(user_id,deck_json,updated_at) VALUES (?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET deck_json=excluded.deck_json, updated_at=excluded.updated_at`)
      .run(req.user.id, JSON.stringify(list), Date.now());
    res.json({ ok: true });
  };
}

// ---------- 전체 불러오기 (게임 시작할 때 한 번) ----------
router.get('/save', (req, res) => {
  const uid = req.user.id;
  const w = ensureWallet(uid);
  ensureCollection(uid);                                    // 스타터 카드 (처음 한 번만)
  const collection = collectionOf(uid);
  // 저장된 덱이 규칙·보유 카드·사용 범위에 안 맞으면 null → 클라이언트가 추천 덱(모험 덱은 일반 덱)을 쓴다
  const deck = storedDeck('decks', uid, collection, 'normal');
  const advDeck = storedDeck('adventure_decks', uid, collection, 'adventure');
  const cleared = {};
  for (const r of db.prepare('SELECT boss_id, cleared_at FROM adventure_progress WHERE user_id=?').all(uid)) cleared[r.boss_id] = r.cleared_at;
  res.set('Cache-Control', 'no-store');
  res.json({ wallet: walletOut(w), deck, advDeck, collection, adventure: { cleared }, isAdmin: !!req.user.isAdmin, bosses: readBosses() });
});

// ---------- 골드 저장 ----------
// 요청: {gold,pool,poolDay,bet, rev}  rev = 클라이언트가 마지막으로 본 번호.
// 서버의 rev 와 다르면(다른 기기/탭에서 먼저 저장함) 409 로 거부하고 서버의 현재 값을 돌려준다.
router.put('/wallet', (req, res) => {
  const uid = req.user.id, body = req.body || {};
  if (!Number.isInteger(body.rev)) return res.status(400).json({ error: '잘못된 요청이에요.' });
  const cur = ensureWallet(uid);
  if (body.rev !== cur.rev) return res.status(409).json({ error: '다른 기기에서 먼저 저장되었어요. 새로고침해 주세요.', wallet: walletOut(cur) });
  const w = Economy.sanitize(body, new Date());
  const upd = db.prepare('UPDATE wallets SET gold=?,pool=?,pool_day=?,bet=?,rev=rev+1,updated_at=? WHERE user_id=? AND rev=?')
    .run(w.gold, w.pool, w.poolDay, w.bet, Date.now(), uid, cur.rev);
  if (!upd.changes) return res.status(409).json({ error: '다른 기기에서 먼저 저장되었어요. 새로고침해 주세요.', wallet: walletOut(walletRow(uid)) });
  res.json({ wallet: walletOut(walletRow(uid)) });
});

// ---------- 내 덱 (AI 대전·유저 대전) / 모험 덱 (v117) ----------
router.put('/deck', saveDeck('decks', 'normal'));
router.put('/adventure/deck', saveDeck('adventure_decks', 'adventure'));

// ---------- 모험 클리어 기록 ----------
// v117: 챕터(도장깨기) 보스는 이전 단계를 모두 깨야 기록된다. 첫 클리어면 보스의 보상 카드(rewardCards)를 지급한다.
//  응답: {ok, first, granted:[카드 이름…], collection}
//  ⚠ 승패 판정은 아직 클라이언트가 한다(골드 보상과 같음). 서버는 순서·중복만 막는다.
const BOSS_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
router.post('/adventure/clear', (req, res) => {
  const uid = req.user.id, id = (req.body || {}).bossId;
  if (typeof id !== 'string' || !BOSS_ID_RE.test(id)) return res.status(400).json({ error: '보스 번호가 올바르지 않아요.' });
  const list = currentBosses(), boss = list.find(b => b.id === id);
  const cleared = new Set(db.prepare('SELECT boss_id FROM adventure_progress WHERE user_id=?').all(uid).map(r => r.boss_id));
  const block = boss && advBlocker(boss, list, x => cleared.has(x));
  if (block && !cleared.has(id)) return res.status(400).json({ error: `이전 단계(${block.name})를 먼저 클리어해야 해요.` });
  ensureCollection(uid);
  const granted = [];
  db.exec('BEGIN');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO adventure_progress(user_id,boss_id,cleared_at) VALUES (?,?,?)').run(uid, id, Date.now());   // 이미 있으면 첫 클리어 시각 유지
    if (ins.changes && boss && boss.rewardCards && boss.rewardCards.length) {
      const add = {}; boss.rewardCards.forEach(n => { add[n] = (add[n] || 0) + 1; });
      const up = db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,?)
                             ON CONFLICT(user_id,card_name) DO UPDATE SET count=MIN(?, count + excluded.count)`);
      for (const [n, k] of Object.entries(add)) { up.run(uid, n, Math.min(CONFIG.COPIES, k), CONFIG.COPIES); for (let i = 0; i < k; i++) granted.push(n); }
    }
    db.exec('COMMIT');
    res.json({ ok: true, first: !!ins.changes, granted, collection: collectionOf(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
});

module.exports = { router, ensureWallet, walletOut };
