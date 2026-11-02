// tutorial.js (server, v140) — 튜토리얼 첫 완료 보상 ("첫 걸음")
//  - 튜토리얼 페이지가 끝나면 POST /api/tutorial/complete 로 "완료"를 기록한다 (계정당 한 번, 이후 다시 해도 그대로)
//  - 보상은 메인 화면(일일 퀘스트 화면의 「첫 걸음」 칸)에서 POST /api/tutorial/claim 으로 받는다 → 계정당 한 번만
//    · 골드 보상은 지갑 저장 번호(rev)를 확인하고 넣는다 (일일 퀘스트·상점과 같은 방식)
//    · 카드 보상은 정해진 등급(또는 확률로 뽑은 등급)에서 아직 없는 카드 중 무작위 1장 (다 있으면 그 등급 전체 중 무작위). 모험·보스 전용·잠금 카드는 제외
//  - TODO(다음 단계): complete 요청에 튜토리얼 진행 기록을 같이 보내서 검사하기. 지금은 요청만 오면 완료로 본다
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const { ensureWallet, walletOut } = require('./wallet');
const { ensureCollection, collectionOf, CARD_POOL } = require('./collection');
const { PROGRESS, craftableCard } = require(path.join(__dirname, '..', 'public', 'js', 'progress.js'));

db.exec(`
CREATE TABLE IF NOT EXISTS tutorial_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutorial     TEXT NOT NULL,                     -- PROGRESS.TUTORIALS 의 id ('basic' | 'advanced')
  completed_at INTEGER NOT NULL,                  -- 처음 끝낸 시각
  claimed_at   INTEGER,                           -- 보상을 받은 시각 (NULL = 아직 안 받음)
  reward_json  TEXT,                              -- 실제로 준 보상 {gold} | {card, rarity}
  PRIMARY KEY (user_id, tutorial)
);
`);

const tdef = id => PROGRESS.TUTORIALS.find(t => t.id === id);
const POOLS = {};                                            // 등급 → 보상으로 줄 수 있는 카드 (상점·제작과 같은 기준: 모험·보스 전용·잠금 카드 제외)
for (const c of CARD_POOL) if (craftableCard(c)) (POOLS[c.rarity] = POOLS[c.rarity] || []).push(c);
const LEGENDS = POOLS['전설'] || [];

// 계정의 튜토리얼 상태: { basic: 'todo'|'ready'|'claimed', advanced: ... }
function tutorialState(uid) {
  const rows = db.prepare('SELECT tutorial, claimed_at FROM tutorial_progress WHERE user_id=?').all(uid);
  const out = {};
  for (const t of PROGRESS.TUTORIALS) {
    const r = rows.find(x => x.tutorial === t.id);
    out[t.id] = !r ? 'todo' : r.claimed_at ? 'claimed' : 'ready';
  }
  return out;
}
const rndInt = n => crypto.randomInt(n);
// 그 등급에서 줄 카드 고르기 (owned: 내 컬렉션). 아직 없는 카드 우선, 다 있으면 등급 전체에서
function pickCard(rarity, owned, rnd = rndInt) {
  const all = POOLS[rarity] || []; if (!all.length) return null;
  const fresh = all.filter(c => !(owned[c.name] > 0)), pool = fresh.length ? fresh : all;
  return pool[rnd(pool.length)];
}
const pickLegend = (owned, rnd) => pickCard('전설', owned, rnd);
// 보상 등급 정하기: {rarity} 그대로 / {odds:{등급:가중치}} 확률로
function rollRarity(reward, rnd = rndInt) {
  if (reward.rarity) return reward.rarity;
  const L = Object.entries(reward.odds || {}), total = L.reduce((t, [, w]) => t + w, 0);
  let x = rnd(total); for (const [r, w] of L) { if (x < w) return r; x -= w; }
  return L.length ? L[L.length - 1][0] : null;
}

const router = express.Router();
router.use('/tutorial', requireAuth);
const progressOut = uid => require('./progress').progressOut(uid);   // progress.js 가 이 파일을 불러오므로 늦게 불러온다

// 튜토리얼을 끝냈다 {tutorial}. 응답 {ok, state, first}  (first = 이번에 처음 완료)
router.post('/tutorial/complete', (req, res) => {
  const uid = req.user.id, id = String((req.body || {}).tutorial || '');
  if (!tdef(id)) return res.status(400).json({ error: '없는 튜토리얼이에요.' });
  const r = db.prepare('INSERT OR IGNORE INTO tutorial_progress(user_id,tutorial,completed_at) VALUES (?,?,?)').run(uid, id, Date.now());
  res.json({ ok: true, first: r.changes > 0, state: tutorialState(uid), rewardText: tdef(id).rewardText });
});

// 보상 받기 {tutorial, rev}. 응답 {ok, reward:{gold}|{card:{name,rarity,isNew}}, wallet, collection, dust, quests, tutorial}
router.post('/tutorial/claim', (req, res) => {
  const uid = req.user.id, b = req.body || {}, t = tdef(String(b.tutorial || ''));
  if (!t) return res.status(400).json({ error: '없는 튜토리얼이에요.' });
  if (t.reward.gold && !Number.isInteger(b.rev)) return res.status(400).json({ error: '잘못된 요청이에요.' });
  ensureCollection(uid);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT claimed_at FROM tutorial_progress WHERE user_id=? AND tutorial=?').get(uid, t.id);
    if (!row) { db.exec('ROLLBACK'); return res.status(400).json({ error: `${t.name}을 먼저 끝내 주세요.` }); }
    if (row.claimed_at) { db.exec('ROLLBACK'); return res.status(400).json({ error: '이미 받은 보상이에요.' }); }
    const w = ensureWallet(uid);
    let reward;
    if (t.reward.gold) {
      if (b.rev !== w.rev) { db.exec('ROLLBACK'); return res.status(409).json({ error: '다른 기기에서 먼저 저장되었어요. 새로고침해 주세요.', wallet: walletOut(w) }); }
      const upd = db.prepare('UPDATE wallets SET gold=gold+?, rev=rev+1, updated_at=? WHERE user_id=? AND rev=?').run(t.reward.gold, Date.now(), uid, w.rev);
      if (!upd.changes) throw new Error('wallet changed');
      reward = { gold: t.reward.gold };
    } else if (t.reward.rarity || t.reward.odds) {
      const owned = collectionOf(uid), c = pickCard(rollRarity(t.reward), owned);
      if (!c) throw new Error('보상 카드가 없어요');
      db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,1) ON CONFLICT(user_id,card_name) DO UPDATE SET count=count+1`).run(uid, c.name);
      reward = { card: { name: c.name, rarity: c.rarity, isNew: !(owned[c.name] > 0) } };
    }
    db.prepare('UPDATE tutorial_progress SET claimed_at=?, reward_json=? WHERE user_id=? AND tutorial=?').run(Date.now(), JSON.stringify(reward), uid, t.id);
    db.exec('COMMIT');
    res.json({ ok: true, reward, wallet: walletOut(ensureWallet(uid)), collection: collectionOf(uid), ...progressOut(uid) });
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} console.error('tutorial/claim 실패:', e); res.status(500).json({ error: '서버 오류가 났어요.' }); }
});

module.exports = { router, tutorialState, pickCard, pickLegend, rollRarity, LEGENDS, POOLS };
