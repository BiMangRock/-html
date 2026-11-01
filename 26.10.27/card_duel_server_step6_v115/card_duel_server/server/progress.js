// progress.js (server, v132) — 카드 제작·분해(가루) · 일일 퀘스트
//  - 가루·컬렉션·퀘스트·골드는 모두 서버가 바꾼다. 화면은 요청만 보내고 결과를 받는다.
//  - 퀘스트 보상 골드는 지갑 저장 번호(rev)를 확인하고 넣는다 (상점과 같은 방식: 낡은 화면 기준으로 골드가 꼬이지 않게).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const { ensureWallet, walletOut } = require('./wallet');
const { ensureCollection, collectionOf, CARD_POOL } = require('./collection');
const JS = path.join(__dirname, '..', 'public', 'js');
const { PROGRESS, craftableCard, cleanStats } = require(path.join(JS, 'progress.js'));
const { Economy } = require(path.join(JS, 'economy.js'));
const { CONFIG, defaultDeckList } = require(path.join(JS, 'engine.js'));

db.exec(`
CREATE TABLE IF NOT EXISTS player_progress (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dust         INTEGER NOT NULL DEFAULT 0,               -- 가루
  quest_day    TEXT,                                     -- 퀘스트를 받은 날 (Economy.dayKey, 새벽 5시 기준)
  quests_json  TEXT NOT NULL DEFAULT '[]',               -- [{id, prog, done}]
  rerolls      INTEGER NOT NULL DEFAULT 0,               -- 오늘 바꾼 횟수
  games_today  INTEGER NOT NULL DEFAULT 0,               -- 오늘 퀘스트 진행으로 센 판 수
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS craft_log (                    -- 제작·분해 기록 (문의·부정 확인용)
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, card_name TEXT NOT NULL, count INTEGER NOT NULL, dust INTEGER NOT NULL
);
`);

const byName = new Map(CARD_POOL.map(c => [c.name, c]));
const qdef = id => PROGRESS.QUESTS.find(q => q.id === id);
const rnd = n => crypto.randomInt(n);

function pickQuests(n, exclude = []) {
  const pool = PROGRESS.QUESTS.filter(q => !exclude.includes(q.id)), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(rnd(pool.length), 1)[0].id);
  return out.map(id => ({ id, prog: 0, done: false }));
}
// 계정의 진행 행 (오늘 퀘스트가 없으면 새로 뽑는다)
function rowOf(uid) {
  const today = Economy.dayKey(new Date());
  let r = db.prepare('SELECT * FROM player_progress WHERE user_id=?').get(uid);
  if (!r) {
    db.prepare('INSERT OR IGNORE INTO player_progress(user_id,dust,quest_day,quests_json,rerolls,games_today,updated_at) VALUES (?,0,?,?,0,0,?)')
      .run(uid, today, JSON.stringify(pickQuests(PROGRESS.PER_DAY)), Date.now());
    r = db.prepare('SELECT * FROM player_progress WHERE user_id=?').get(uid);
  } else if (r.quest_day !== today) {
    db.prepare('UPDATE player_progress SET quest_day=?, quests_json=?, rerolls=0, games_today=0, updated_at=? WHERE user_id=?')
      .run(today, JSON.stringify(pickQuests(PROGRESS.PER_DAY)), Date.now(), uid);
    r = db.prepare('SELECT * FROM player_progress WHERE user_id=?').get(uid);
  }
  let qs; try { qs = JSON.parse(r.quests_json); } catch (_) { qs = []; }
  return { dust: r.dust, day: r.quest_day, quests: qs.filter(q => qdef(q.id)), rerolls: r.rerolls, games: r.games_today };
}
const questsOut = r => ({
  day: r.day, rerollsLeft: Math.max(0, PROGRESS.REROLLS - r.rerolls), gamesLeft: PROGRESS.MAX_GAMES_PER_DAY > 0 ? Math.max(0, PROGRESS.MAX_GAMES_PER_DAY - r.games) : null,   // null = 제한 없음
  list: r.quests.map(q => { const d = qdef(q.id); return { id: q.id, text: d.text, goal: d.goal, gold: d.gold, prog: Math.min(d.goal, q.prog), done: !!q.done }; }),
});
const progressOut = uid => { const r = rowOf(uid); return { dust: r.dust, quests: questsOut(r) }; };

const router = express.Router();
router.use(requireAuth);

// 화면을 열 때: 가루 · 오늘의 퀘스트
router.get('/progress', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(progressOut(req.user.id)); });

// ---------- 카드 제작 ----------
// {name} → 가루를 내고 1장 만든다 (덱에 넣을 수 있는 장수까지만)
router.post('/craft', (req, res) => {
  const uid = req.user.id, name = String((req.body || {}).name || '');
  const c = byName.get(name);
  if (!craftableCard(c)) return res.status(400).json({ error: '만들 수 없는 카드예요.' });
  ensureCollection(uid);
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = rowOf(uid), have = collectionOf(uid)[name] || 0, cost = PROGRESS.CRAFT[c.rarity];
    if (have >= CONFIG.COPIES) { db.exec('ROLLBACK'); return res.status(400).json({ error: `이미 ${CONFIG.COPIES}장 가지고 있어요.` }); }
    if (r.dust < cost) { db.exec('ROLLBACK'); return res.status(400).json({ error: `가루가 부족해요. (필요 ${cost} · 보유 ${r.dust})` }); }
    db.prepare('UPDATE player_progress SET dust=dust-?, updated_at=? WHERE user_id=?').run(cost, Date.now(), uid);
    db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,1) ON CONFLICT(user_id,card_name) DO UPDATE SET count=count+1`).run(uid, name);
    db.prepare('INSERT INTO craft_log(user_id,at,kind,card_name,count,dust) VALUES (?,?,?,?,?,?)').run(uid, Date.now(), 'craft', name, 1, -cost);
    db.exec('COMMIT');
    res.json({ ok: true, ...progressOut(uid), collection: collectionOf(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('craft 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});

// 저장된 덱(일반 덱·모험 덱)이 쓰는 장수 — 그만큼은 분해할 수 없다 (덱이 깨지지 않게)
function deckNeeds(uid) {
  const need = {};
  for (const t of ['decks', 'adventure_decks']) {
    let row; try { row = db.prepare(`SELECT deck_json FROM ${t} WHERE user_id=?`).get(uid); } catch (_) { row = null; }
    let list = null;
    if (row) { try { list = JSON.parse(row.deck_json); } catch (_) { list = null; } }
    else if (t === 'decks') list = defaultDeckList();           // 덱을 저장한 적이 없으면 추천 덱을 쓴다 → 그 카드도 지킨다
    if (!Array.isArray(list)) continue;
    const cnt = {}; list.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
    for (const [n, k] of Object.entries(cnt)) need[n] = Math.max(need[n] || 0, k);
  }
  return need;
}
function disenchant(uid, plan) {                // plan: [[name, count]] → 성공하면 얻은 가루
  db.exec('BEGIN IMMEDIATE');
  try {
    const col = collectionOf(uid), need = deckNeeds(uid); let gain = 0;
    const up = db.prepare('UPDATE collection SET count=count-? WHERE user_id=? AND card_name=?');
    const log = db.prepare('INSERT INTO craft_log(user_id,at,kind,card_name,count,dust) VALUES (?,?,?,?,?,?)');
    for (const [name, n] of plan) {
      const c = byName.get(name);
      if (!craftableCard(c)) throw Object.assign(new Error('분해할 수 없는 카드예요: ' + name), { user: true });
      const have = col[name] || 0, keep = need[name] || 0;
      if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('잘못된 장수예요.'), { user: true });
      if (have - n < keep) throw Object.assign(new Error(keep ? `덱에 ${keep}장 쓰고 있어서 그만큼은 분해할 수 없어요: ${name}` : `가진 장수보다 많아요: ${name}`), { user: true });
      const v = PROGRESS.DISENCHANT[c.rarity] * n; gain += v;
      up.run(n, uid, name); log.run(uid, Date.now(), 'disenchant', name, n, v); col[name] = have - n;
    }
    db.prepare('DELETE FROM collection WHERE user_id=? AND count<=0').run(uid);
    db.prepare('UPDATE player_progress SET dust=dust+?, updated_at=? WHERE user_id=?').run(gain, Date.now(), uid);
    db.exec('COMMIT');
    return { gain };
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}
// {name, count} → 분해
router.post('/disenchant', (req, res) => {
  const uid = req.user.id, b = req.body || {};
  ensureCollection(uid); rowOf(uid);
  try { const r = disenchant(uid, [[String(b.name || ''), Number.isInteger(b.count) ? b.count : 1]]); res.json({ ok: true, gain: r.gain, ...progressOut(uid), collection: collectionOf(uid) }); }
  catch (e) { if (e.user) return res.status(400).json({ error: e.message }); console.error('disenchant 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});
// 덱 한도(2장)를 넘는 남는 카드를 한꺼번에 분해
router.post('/disenchant-extra', (req, res) => {
  const uid = req.user.id;
  ensureCollection(uid); rowOf(uid);
  const col = collectionOf(uid), plan = [];
  for (const [n, k] of Object.entries(col)) if (k > CONFIG.COPIES && craftableCard(byName.get(n))) plan.push([n, k - CONFIG.COPIES]);
  if (!plan.length) return res.json({ ok: true, gain: 0, count: 0, ...progressOut(uid), collection: col });
  try { const r = disenchant(uid, plan); res.json({ ok: true, gain: r.gain, count: plan.reduce((t, [, k]) => t + k, 0), ...progressOut(uid), collection: collectionOf(uid) }); }
  catch (e) { if (e.user) return res.status(400).json({ error: e.message }); console.error('disenchant-extra 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});

// ---------- 일일 퀘스트 ----------
// 한 판이 끝날 때 화면이 보낸다. {stats, rev}. 완료된 퀘스트의 골드를 지갑에 넣는다.
router.post('/quests/report', (req, res) => {
  const uid = req.user.id, b = req.body || {};
  if (!Number.isInteger(b.rev)) return res.status(400).json({ error: '잘못된 요청이에요.' });
  const st = cleanStats(b.stats);
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = rowOf(uid), w = ensureWallet(uid);
    if (PROGRESS.MAX_GAMES_PER_DAY > 0 && r.games >= PROGRESS.MAX_GAMES_PER_DAY) { db.exec('ROLLBACK'); return res.json({ ok: true, completed: [], capped: true, ...progressOut(uid), wallet: walletOut(w) }); }
    if (b.rev !== w.rev) { db.exec('ROLLBACK'); return res.status(409).json({ error: '다른 기기에서 먼저 저장되었어요. 새로고침해 주세요.', wallet: walletOut(w) }); }
    const completed = []; let gold = 0;
    for (const q of r.quests) {
      if (q.done) continue;
      const d = qdef(q.id); q.prog = Math.min(d.goal, (q.prog || 0) + (st[d.stat] || 0));
      if (q.prog >= d.goal) { q.done = true; gold += d.gold; completed.push({ id: q.id, text: d.text, gold: d.gold }); }
    }
    db.prepare('UPDATE player_progress SET quests_json=?, games_today=games_today+?, updated_at=? WHERE user_id=?').run(JSON.stringify(r.quests), st.games ? 1 : 0, Date.now(), uid);
    if (gold) {
      const upd = db.prepare('UPDATE wallets SET gold=gold+?, rev=rev+1, updated_at=? WHERE user_id=? AND rev=?').run(gold, Date.now(), uid, w.rev);
      if (!upd.changes) throw new Error('wallet changed');
    }
    db.exec('COMMIT');
    res.json({ ok: true, completed, gold, ...progressOut(uid), wallet: walletOut(ensureWallet(uid)) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('quests/report 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});
// {index} → 그 퀘스트를 다른 것으로 (하루 REROLLS 번, 끝난 퀘스트는 못 바꿈)
router.post('/quests/reroll', (req, res) => {
  const uid = req.user.id, i = (req.body || {}).index;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = rowOf(uid);
    if (!Number.isInteger(i) || !r.quests[i]) { db.exec('ROLLBACK'); return res.status(400).json({ error: '잘못된 퀘스트예요.' }); }
    if (r.rerolls >= PROGRESS.REROLLS) { db.exec('ROLLBACK'); return res.status(400).json({ error: '오늘은 더 바꿀 수 없어요.' }); }
    if (r.quests[i].done) { db.exec('ROLLBACK'); return res.status(400).json({ error: '이미 끝낸 퀘스트예요.' }); }
    const nq = pickQuests(1, r.quests.map(q => q.id))[0];
    if (!nq) { db.exec('ROLLBACK'); return res.status(400).json({ error: '바꿀 퀘스트가 없어요.' }); }
    r.quests[i] = nq;
    db.prepare('UPDATE player_progress SET quests_json=?, rerolls=rerolls+1, updated_at=? WHERE user_id=?').run(JSON.stringify(r.quests), Date.now(), uid);
    db.exec('COMMIT');
    res.json({ ok: true, ...progressOut(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('quests/reroll 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});

module.exports = { router, progressOut, deckNeeds };
