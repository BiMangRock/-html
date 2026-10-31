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
const { validateDeckList } = require(path.join(JS, 'engine.js'));
const { validateDeckOwned } = require(path.join(JS, 'collection.js'));
const { ensureCollection, collectionOf } = require('./collection');
const { walletRow, walletOut, ensureWallet } = require('./wallet');

const router = express.Router();
router.use(requireAuth);

// ---------- wallet ----------
// 지갑 조회·생성은 wallet.js (유저 대전 정산도 같이 씀)

// ---------- 전체 불러오기 (게임 시작할 때 한 번) ----------
router.get('/save', (req, res) => {
  const uid = req.user.id;
  const w = ensureWallet(uid);
  ensureCollection(uid);                                    // 스타터 카드 (처음 한 번만)
  const collection = collectionOf(uid);
  const d = db.prepare('SELECT deck_json FROM decks WHERE user_id=?').get(uid);
  let deck = null;                                          // 저장된 덱이 규칙·보유 카드에 안 맞으면 null → 클라이언트가 추천 덱을 쓴다
  if (d) { try { const l = JSON.parse(d.deck_json); if (!validateDeckList(l) && !validateDeckOwned(l, collection)) deck = l; } catch (_) {} }
  const cleared = {};
  for (const r of db.prepare('SELECT boss_id, cleared_at FROM adventure_progress WHERE user_id=?').all(uid)) cleared[r.boss_id] = r.cleared_at;
  res.set('Cache-Control', 'no-store');
  res.json({ wallet: walletOut(w), deck, collection, adventure: { cleared } });
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

// ---------- 내 덱 ----------
router.put('/deck', (req, res) => {
  const list = (req.body || {}).deck;
  const bad = validateDeckList(list);
  if (bad) return res.status(400).json({ error: bad });
  ensureCollection(req.user.id);
  const notOwned = validateDeckOwned(list, collectionOf(req.user.id));      // 가진 카드로만 덱을 만들 수 있다 (서버가 최종 검사)
  if (notOwned) return res.status(400).json({ error: notOwned });
  db.prepare(`INSERT INTO decks(user_id,deck_json,updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET deck_json=excluded.deck_json, updated_at=excluded.updated_at`)
    .run(req.user.id, JSON.stringify(list), Date.now());
  res.json({ ok: true });
});

// ---------- 모험 클리어 기록 ----------
const BOSS_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
router.post('/adventure/clear', (req, res) => {
  const id = (req.body || {}).bossId;
  if (typeof id !== 'string' || !BOSS_ID_RE.test(id)) return res.status(400).json({ error: '보스 번호가 올바르지 않아요.' });
  db.prepare('INSERT OR IGNORE INTO adventure_progress(user_id,boss_id,cleared_at) VALUES (?,?,?)').run(req.user.id, id, Date.now());   // 이미 있으면 첫 클리어 시각 유지
  res.json({ ok: true });
});

module.exports = { router, ensureWallet, walletOut };
