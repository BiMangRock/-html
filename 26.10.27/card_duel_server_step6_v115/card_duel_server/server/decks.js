// decks.js (server, v135) — 덱 슬롯 여러 개 + "사용 중" 덱
//  - 슬롯은 덱을 보관하는 곳이다. 미완성(30장 미만)이거나 아직 없는 카드가 들어 있어도 저장할 수 있다 (덱 코드로 가져온 덱 등).
//  - "사용 중" 슬롯을 고르면 그 덱이 예전부터 쓰던 decks 표(= AI 대전·유저 대전·분해 보호가 쓰는 덱)에 들어간다.
//    그래서 사용 중으로 고를 때만 30장·보유 카드 규칙을 검사한다.
//  - 예전 PUT /api/deck(덱 편집 저장)도 사용 중 슬롯에 같이 반영된다 (syncActive).
const path = require('path');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const { ensureCollection, collectionOf, CARD_POOL } = require('./collection');
const JS = path.join(__dirname, '..', 'public', 'js');
const { CONFIG, validateDeckList, defaultDeckList, HERO_POWERS } = require(path.join(JS, 'engine.js'));
const { validateDeckOwned, validateDeckScope, cardScope } = require(path.join(JS, 'collection.js'));

const MAX_SLOTS = 9;
db.exec(`
CREATE TABLE IF NOT EXISTS deck_slots (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        INTEGER NOT NULL,                        -- 1 ~ MAX_SLOTS
  name        TEXT    NOT NULL,
  deck_json   TEXT    NOT NULL,                        -- 카드 이름 배열 (0~30장)
  hero_power  TEXT    NOT NULL DEFAULT '',             -- 영웅 능력 id ('' = 따로 정하지 않음)
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, slot)
);
CREATE TABLE IF NOT EXISTS deck_meta (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_slot INTEGER
);
`);

const byName = new Map(CARD_POOL.map(c => [c.name, c]));
const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || '새 덱';
const cleanPower = h => (h && HERO_POWERS[h]) ? h : '';
// 슬롯에 넣을 수 있는 목록인지 (느슨한 검사): 있는 카드 · 30장 이하 · 같은 카드 2장 이하 · 일반 카드(개발자는 전부)
function slotListProblem(list, admin) {
  if (!Array.isArray(list)) return '덱이 올바르지 않아요.';
  if (list.length > CONFIG.DECK_SIZE) return `덱은 ${CONFIG.DECK_SIZE}장까지예요.`;
  const cnt = {};
  for (const n of list) {
    if (typeof n !== 'string' || !byName.has(n)) return `없는 카드예요: ${String(n).slice(0, 30)}`;
    cnt[n] = (cnt[n] || 0) + 1;
    if (cnt[n] > (admin ? CONFIG.COPIES : CONFIG.COPIES)) return `같은 카드는 ${CONFIG.COPIES}장까지예요: ${n}`;
    if (!admin && cardScope(byName.get(n)) !== 'normal') return `일반 덱에 넣을 수 없는 카드예요: ${n}`;
  }
  return null;
}
// 사용 중 덱으로 쓸 수 있는지 (엄격한 검사: 기존 PUT /api/deck 과 같은 기준)
function activeProblem(list, uid, admin) {
  if (admin) return validateDeckList(list);
  return validateDeckList(list) || validateDeckOwned(list, collectionOf(uid)) || validateDeckScope(list, CARD_POOL, 'normal');
}
const rowsOf = uid => db.prepare('SELECT slot, name, deck_json, hero_power, updated_at FROM deck_slots WHERE user_id=? ORDER BY slot').all(uid);
const activeOf = uid => { const r = db.prepare('SELECT active_slot FROM deck_meta WHERE user_id=?').get(uid); return r ? r.active_slot : null; };
const setActive = (uid, slot) => db.prepare('INSERT INTO deck_meta(user_id,active_slot) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET active_slot=excluded.active_slot').run(uid, slot);
// 처음 쓰는 계정: 지금 쓰던 덱(없으면 추천 덱)을 1번 슬롯 "내 덱"으로 옮기고 사용 중으로
function ensureSlots(uid) {
  if (db.prepare('SELECT 1 FROM deck_slots WHERE user_id=? LIMIT 1').get(uid)) return;
  const cur = db.prepare('SELECT deck_json FROM decks WHERE user_id=?').get(uid);
  let list = defaultDeckList(); if (cur) { try { const l = JSON.parse(cur.deck_json); if (Array.isArray(l)) list = l; } catch (_) {} }
  db.prepare('INSERT OR IGNORE INTO deck_slots(user_id,slot,name,deck_json,hero_power,updated_at) VALUES (?,1,?,?,?,?)').run(uid, '내 덱', JSON.stringify(list), '', Date.now());
  setActive(uid, 1);
}
function decksOut(uid) {
  ensureSlots(uid);
  let active = activeOf(uid);
  const slots = rowsOf(uid).map(r => ({ slot: r.slot, name: r.name, deck: JSON.parse(r.deck_json), heroPower: r.hero_power || '', updatedAt: r.updated_at }));
  if (!slots.some(s => s.slot === active)) { active = slots.length ? slots[0].slot : null; if (active) setActive(uid, active); }
  return { max: MAX_SLOTS, active, slots };
}
function writeActiveDeck(uid, list) {
  db.prepare(`INSERT INTO decks(user_id,deck_json,updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET deck_json=excluded.deck_json, updated_at=excluded.updated_at`).run(uid, JSON.stringify(list), Date.now());
}
// 예전 방식의 덱 저장(PUT /api/deck)이 들어오면 사용 중 슬롯에도 같은 덱을 넣는다
function syncActive(uid, list) {
  const a = activeOf(uid); if (!a) return;
  db.prepare('UPDATE deck_slots SET deck_json=?, updated_at=? WHERE user_id=? AND slot=?').run(JSON.stringify(list), Date.now(), uid, a);
}

const router = express.Router();
router.use('/decks', requireAuth);
const slotParam = req => { const n = Number(req.params.slot); return Number.isInteger(n) && n >= 1 && n <= MAX_SLOTS ? n : null; };
const fail = (res, code, msg) => res.status(code).json({ error: msg });

router.get('/decks', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(decksOut(req.user.id)); });

// 새 슬롯 {name, deck, heroPower}
router.post('/decks', (req, res) => {
  const uid = req.user.id, b = req.body || {}, list = Array.isArray(b.deck) ? b.deck : [];
  const bad = slotListProblem(list, !!req.user.isAdmin); if (bad) return fail(res, 400, bad);
  ensureSlots(uid);
  const used = new Set(rowsOf(uid).map(r => r.slot));
  let slot = 1; while (used.has(slot) && slot <= MAX_SLOTS) slot++;
  if (slot > MAX_SLOTS) return fail(res, 400, `덱은 ${MAX_SLOTS}개까지 저장할 수 있어요. 하나를 지운 뒤 다시 해 주세요.`);
  db.prepare('INSERT INTO deck_slots(user_id,slot,name,deck_json,hero_power,updated_at) VALUES (?,?,?,?,?,?)')
    .run(uid, slot, cleanName(b.name), JSON.stringify(list), cleanPower(b.heroPower), Date.now());
  res.json({ ok: true, slot, ...decksOut(uid) });
});

// 슬롯 고치기 {name?, deck?, heroPower?}. 사용 중 슬롯의 덱을 바꾸면 사용 중 덱(decks 표)도 바뀐다 → 그때는 30장·보유 규칙을 지켜야 한다
router.put('/decks/:slot', (req, res) => {
  const uid = req.user.id, slot = slotParam(req), b = req.body || {};
  if (!slot) return fail(res, 400, '잘못된 덱 번호예요.');
  ensureSlots(uid);
  const row = db.prepare('SELECT * FROM deck_slots WHERE user_id=? AND slot=?').get(uid, slot);
  if (!row) return fail(res, 404, '없는 덱이에요.');
  let list = null;
  if (b.deck !== undefined) {
    list = b.deck; const bad = slotListProblem(list, !!req.user.isAdmin); if (bad) return fail(res, 400, bad);
    if (activeOf(uid) === slot) { ensureCollection(uid); const p = activeProblem(list, uid, !!req.user.isAdmin); if (p) return fail(res, 400, '사용 중인 덱은 완성된 덱이어야 해요: ' + p); }
  }
  db.prepare('UPDATE deck_slots SET name=?, deck_json=?, hero_power=?, updated_at=? WHERE user_id=? AND slot=?')
    .run(b.name !== undefined ? cleanName(b.name) : row.name, list ? JSON.stringify(list) : row.deck_json,
         b.heroPower !== undefined ? cleanPower(b.heroPower) : row.hero_power, Date.now(), uid, slot);
  if (list && activeOf(uid) === slot) writeActiveDeck(uid, list);
  res.json({ ok: true, ...decksOut(uid) });
});

router.delete('/decks/:slot', (req, res) => {
  const uid = req.user.id, slot = slotParam(req);
  if (!slot) return fail(res, 400, '잘못된 덱 번호예요.');
  ensureSlots(uid);
  if (activeOf(uid) === slot) return fail(res, 400, '사용 중인 덱은 지울 수 없어요. 다른 덱을 먼저 사용해 주세요.');
  const r = db.prepare('DELETE FROM deck_slots WHERE user_id=? AND slot=?').run(uid, slot);
  if (!r.changes) return fail(res, 404, '없는 덱이에요.');
  res.json({ ok: true, ...decksOut(uid) });
});

// 이 슬롯을 사용 중 덱으로 (완성된 덱 · 가진 카드만)
router.post('/decks/:slot/activate', (req, res) => {
  const uid = req.user.id, slot = slotParam(req);
  if (!slot) return fail(res, 400, '잘못된 덱 번호예요.');
  ensureSlots(uid); ensureCollection(uid);
  const row = db.prepare('SELECT deck_json FROM deck_slots WHERE user_id=? AND slot=?').get(uid, slot);
  if (!row) return fail(res, 404, '없는 덱이에요.');
  const list = JSON.parse(row.deck_json);
  const p = activeProblem(list, uid, !!req.user.isAdmin);
  if (p) return fail(res, 400, list.length < CONFIG.DECK_SIZE ? `아직 ${list.length}/${CONFIG.DECK_SIZE}장이라 쓸 수 없어요.` : p.replace('보유하지 않은 카드가 있습니다', '아직 없는 카드가 있어요 (카드 제작에서 만들 수 있어요)'));
  db.exec('BEGIN IMMEDIATE');
  try { writeActiveDeck(uid, list); setActive(uid, slot); db.exec('COMMIT'); }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('decks/activate 실패:', e); return fail(res, 500, '서버 오류가 났어요.'); }
  res.json({ ok: true, deck: list, ...decksOut(uid) });
});

module.exports = { router, syncActive, decksOut, MAX_SLOTS, slotListProblem };
