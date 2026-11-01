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
const { advBlocker, advMakeBundles, advRunNext, advChapterBosses } = require(path.join(JS, 'adventure.js'));
const crypto = require('crypto');
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

// v117 입학(런)
const runRow = (uid, chapter) => db.prepare('SELECT deck_json, cleared_json, started_at FROM adventure_runs WHERE user_id=? AND chapter=?').get(uid, chapter);
const runOut = r => r ? { deck: JSON.parse(r.deck_json), cleared: JSON.parse(r.cleared_json), startedAt: r.started_at } : null;
function runsOf(uid) {
  const out = {};
  for (const r of db.prepare('SELECT chapter, deck_json, cleared_json, started_at FROM adventure_runs WHERE user_id=?').all(uid)) out[r.chapter] = runOut(r);
  return out;
}
// 입학이 끝나면(패배·자퇴) 그 챕터 보스들의 고르지 않은 묶음도 지운다
function dropChapterOffers(uid, chapter) {
  for (const b of advChapterBosses(currentBosses(), chapter)) db.prepare('DELETE FROM adventure_offers WHERE user_id=? AND boss_id=? AND picked_index IS NULL').run(uid, b.id);
}
// v117 아직 고르지 않은 보상 묶음
function pendingOffers(uid) {
  const names = new Map(currentBosses().map(b => [b.id, b.name]));
  return db.prepare('SELECT boss_id, bundles_json FROM adventure_offers WHERE user_id=? AND picked_index IS NULL ORDER BY created_at').all(uid)
    .map(r => ({ bossId: r.boss_id, bossName: names.get(r.boss_id) || r.boss_id, bundles: JSON.parse(r.bundles_json) }));
}
// 카드 지급: 같은 카드는 최대 COPIES(2)장까지. 반환: 실제로 받은 카드 이름 배열
function grantCards(uid, list) {
  const add = {}; list.forEach(n => { add[n] = (add[n] || 0) + 1; });
  const up = db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,?)
                         ON CONFLICT(user_id,card_name) DO UPDATE SET count=MIN(?, count + excluded.count)`);
  const got = [];
  for (const [n, k] of Object.entries(add)) { up.run(uid, n, Math.min(CONFIG.COPIES, k), CONFIG.COPIES); for (let i = 0; i < k; i++) got.push(n); }
  return got;
}

// ---------- 전체 불러오기 (게임 시작할 때 한 번) ----------
router.get('/save', (req, res) => {
  const uid = req.user.id;
  const w = ensureWallet(uid);
  ensureCollection(uid);                                    // 스타터 카드 (처음 한 번만)
  { const adv = CARD_POOL.filter(c => c.scope === 'adventure').map(c => c.name);      // v117: 모험 전용 카드는 입학 중 잠긴 덱에만 있다 → 예전에 컬렉션에 들어간 것은 정리
    if (adv.length) db.prepare(`DELETE FROM collection WHERE user_id=? AND card_name IN (${adv.map(() => '?').join(',')})`).run(uid, ...adv); }
  const collection = collectionOf(uid);
  // 저장된 덱이 규칙·보유 카드·사용 범위에 안 맞으면 null → 클라이언트가 추천 덱(모험 덱은 일반 덱)을 쓴다
  const deck = storedDeck('decks', uid, collection, 'normal');
  const advDeck = storedDeck('adventure_decks', uid, collection, 'normal');   // v117: 입학 때 들고 가는 덱 = 일반 카드만 (모험 전용 카드는 입학 중 보상으로만)
  const cleared = {};
  for (const r of db.prepare('SELECT boss_id, cleared_at FROM adventure_progress WHERE user_id=?').all(uid)) cleared[r.boss_id] = r.cleared_at;
  res.set('Cache-Control', 'no-store');
  res.json({ wallet: walletOut(w), deck, advDeck, collection, adventure: { cleared, offers: pendingOffers(uid), runs: runsOf(uid) }, isAdmin: !!req.user.isAdmin, bosses: readBosses() });
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
router.put('/adventure/deck', saveDeck('adventure_decks', 'normal'));     // v117: 모험 덱(입학 덱)도 일반 카드만

// ---------- 모험 클리어 기록 ----------
// v117: 챕터(도장깨기) 보스는 이전 단계를 모두 깨야 기록된다. 첫 클리어면 보스의 보상 카드(rewardCards)를 지급한다.
//  응답: {ok, first, granted:[카드 이름…], collection}
//  ⚠ 승패 판정은 아직 클라이언트가 한다(골드 보상과 같음). 서버는 순서·중복만 막는다.
const BOSS_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
router.post('/adventure/clear', (req, res) => {
  const uid = req.user.id, id = (req.body || {}).bossId;
  if (typeof id !== 'string' || !BOSS_ID_RE.test(id)) return res.status(400).json({ error: '보스 번호가 올바르지 않아요.' });
  const list = currentBosses(), boss = list.find(b => b.id === id);
  let run = null;
  if (boss && boss.chapter) {                                                         // v117 챕터 보스: 입학 중이고, 이번 입학의 다음 단계여야 한다
    run = runOut(runRow(uid, boss.chapter));
    if (!run) return res.status(400).json({ error: '먼저 입학해야 해요.' });
    const next = advRunNext(list, boss.chapter, run);
    if (!next || next.id !== id) return res.status(400).json({ error: next ? `지금은 ${next.name} 차례예요.` : '이미 모든 단계를 깼어요.' });
  }
  ensureCollection(uid);
  let granted = [], offer = null, graduated = false;
  db.exec('BEGIN');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO adventure_progress(user_id,boss_id,cleared_at) VALUES (?,?,?)').run(uid, id, Date.now());   // 첫 클리어 기록 (골드 보상 기준, 지워지지 않음)
    // 고정 보상 카드: 챕터 보스는 이번 입학의 잠긴 덱에만(매 입학), 자유 보스는 첫 클리어 때 컬렉션에
    if (boss && boss.rewardCards && boss.rewardCards.length) {
      if (run) { run.deck = run.deck.concat(boss.rewardCards); granted = boss.rewardCards.slice(); }
      else if (ins.changes) granted = grantCards(uid, boss.rewardCards);
    }
    const lastStage = !!(run && !advRunNext(list, boss.chapter, { ...run, cleared: run.cleared.concat([id]) }));
    const offerNow = boss && boss.rewardChoice && boss.rewardChoice.length && (boss.chapter ? !lastStage : ins.changes);   // 챕터 보스는 입학할 때마다(졸업 단계 제외), 자유 보스는 첫 클리어 때만
    if (offerNow) {
      const bundles = advMakeBundles(boss.rewardChoice, n => crypto.randomInt(n));
      db.prepare(`INSERT INTO adventure_offers(user_id,boss_id,bundles_json,created_at,picked_index,picked_at) VALUES (?,?,?,?,NULL,NULL)
                  ON CONFLICT(user_id,boss_id) DO UPDATE SET bundles_json=excluded.bundles_json, created_at=excluded.created_at, picked_index=NULL, picked_at=NULL`).run(uid, id, JSON.stringify(bundles), Date.now());
      offer = { bossId: id, bossName: boss.name, bundles };
    }
    if (run) {
      run.cleared.push(id);
      if (!advRunNext(list, boss.chapter, run)) { graduated = true; db.prepare('DELETE FROM adventure_runs WHERE user_id=? AND chapter=?').run(uid, boss.chapter); run = null; }   // 마지막 단계 → 졸업 (덱 잠금 해제)
      else db.prepare('UPDATE adventure_runs SET cleared_json=?, deck_json=? WHERE user_id=? AND chapter=?').run(JSON.stringify(run.cleared), JSON.stringify(run.deck), uid, boss.chapter);
    }
    db.exec('COMMIT');
    res.json({ ok: true, first: !!ins.changes, granted, offer, graduated, chapter: boss && boss.chapter || null, run, collection: collectionOf(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
});

// ---------- v117 입학하기 / 패배 / 자퇴 ----------
// 입학: {chapter, deck} — 덱은 모험 덱 규칙(30장·2장·보유·모험 전용 허용)으로 검사하고 잠근다
router.post('/adventure/enroll', (req, res) => {
  const uid = req.user.id, { chapter, deck } = req.body || {};
  if (typeof chapter !== 'string' || !BOSS_ID_RE.test(chapter) || !advChapterBosses(currentBosses(), chapter).length) return res.status(400).json({ error: '없는 챕터예요.' });
  if (runRow(uid, chapter)) return res.status(409).json({ error: '이미 입학했어요.', run: runOut(runRow(uid, chapter)) });
  const bad = validateDeckList(deck); if (bad) return res.status(400).json({ error: bad });
  ensureCollection(uid);
  const prob = deckProblem(deck, collectionOf(uid), 'normal'); if (prob) return res.status(400).json({ error: prob });   // 처음 입학할 때는 모험 전용 카드를 못 들고 간다
  db.prepare('INSERT INTO adventure_runs(user_id,chapter,deck_json,cleared_json,started_at) VALUES (?,?,?,?,?)').run(uid, chapter, JSON.stringify(deck), '[]', Date.now());
  res.json({ ok: true, run: runOut(runRow(uid, chapter)) });
});
// 패배: {bossId} — 챕터 보스에게 지면 입학이 끝난다 (처음부터)
router.post('/adventure/lose', (req, res) => {
  const uid = req.user.id, id = (req.body || {}).bossId;
  const boss = typeof id === 'string' ? currentBosses().find(b => b.id === id) : null;
  if (!boss || !boss.chapter) return res.json({ ok: true, ended: false });
  const n = db.prepare('DELETE FROM adventure_runs WHERE user_id=? AND chapter=?').run(uid, boss.chapter).changes; dropChapterOffers(uid, boss.chapter);
  res.json({ ok: true, ended: !!n, chapter: boss.chapter });
});
// 자퇴: {chapter}
router.post('/adventure/drop', (req, res) => {
  const uid = req.user.id, chapter = (req.body || {}).chapter;
  if (typeof chapter !== 'string' || !BOSS_ID_RE.test(chapter)) return res.status(400).json({ error: '없는 챕터예요.' });
  db.prepare('DELETE FROM adventure_runs WHERE user_id=? AND chapter=?').run(uid, chapter); dropChapterOffers(uid, chapter);
  res.json({ ok: true });
});

// ---------- v117 보상 묶음 고르기 ----------
// 요청: {bossId, index}  → 그 묶음의 카드를 지급. 한 번 고르면 끝 (다시 보내도 409)
router.post('/adventure/pick', (req, res) => {
  const uid = req.user.id, { bossId, index } = req.body || {};
  if (typeof bossId !== 'string' || !BOSS_ID_RE.test(bossId) || !Number.isInteger(index)) return res.status(400).json({ error: '잘못된 요청이에요.' });
  const row = db.prepare('SELECT bundles_json, picked_index FROM adventure_offers WHERE user_id=? AND boss_id=?').get(uid, bossId);
  if (!row) return res.status(404).json({ error: '받을 수 있는 보상이 없어요.' });
  if (row.picked_index !== null) return res.status(409).json({ error: '이미 보상을 골랐어요.', collection: collectionOf(uid) });
  const bundles = JSON.parse(row.bundles_json);
  if (!bundles[index]) return res.status(400).json({ error: '없는 묶음이에요.' });
  ensureCollection(uid);
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE adventure_offers SET picked_index=?, picked_at=? WHERE user_id=? AND boss_id=? AND picked_index IS NULL').run(index, Date.now(), uid, bossId);
    if (!upd.changes) { db.exec('ROLLBACK'); return res.status(409).json({ error: '이미 보상을 골랐어요.', collection: collectionOf(uid) }); }
    const boss = currentBosses().find(b => b.id === bossId); let run = null, granted;  // v117: 챕터 보스 묶음은 이번 입학의 잠긴 덱에만 (컬렉션에는 안 남음)
    if (boss && boss.chapter) { const r = runRow(uid, boss.chapter);
      if (!r) { db.prepare('DELETE FROM adventure_offers WHERE user_id=? AND boss_id=?').run(uid, bossId); db.exec('COMMIT'); return res.status(409).json({ error: '입학이 끝나서 이 보상은 받을 수 없어요.', collection: collectionOf(uid) }); }
      const d = JSON.parse(r.deck_json).concat(bundles[index]); db.prepare('UPDATE adventure_runs SET deck_json=? WHERE user_id=? AND chapter=?').run(JSON.stringify(d), uid, boss.chapter);
      run = runOut(runRow(uid, boss.chapter)); granted = bundles[index].slice(); }
    else granted = grantCards(uid, bundles[index]);                                     // 자유 보스 묶음은 컬렉션에
    db.exec('COMMIT');
    res.json({ ok: true, granted, run, chapter: boss && boss.chapter || null, collection: collectionOf(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
});

module.exports = { router, ensureWallet, walletOut };
