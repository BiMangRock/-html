// shop.js (server) — 상점 API (5단계): 팩 개봉 · 중복 환급 · 천장 · 개봉 기록
//  - 난수·골드 차감·카드 지급은 전부 서버가 한다. 클라이언트는 "몇 팩 열지"만 보내고 결과를 받아 보여 준다.
//  - 골드 차감 + 카드 지급 + 천장 갱신 + 기록은 한 트랜잭션이라, 중간에 실패하면 전부 취소된다.
//  - 골드 저장 번호(rev)를 같이 보내서, 다른 기기/탭이 먼저 골드를 바꿨으면 409 로 거부한다 (낡은 골드 기준으로 사지 못하게).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const { ensureWallet, walletOut } = require('./wallet');
const { ensureCollection, collectionOf, CARD_POOL } = require('./collection');
const { SHOP, rollPack, shopPityLeft } = require(path.join(__dirname, '..', 'public', 'js', 'shop.js'));

const router = express.Router();
router.use(requireAuth);

const rng = n => crypto.randomInt(n);                         // 암호학적 난수 (예측 불가)
const HISTORY_SHOWN = 20;

function pityOf(uid) {
  const r = db.prepare('SELECT since_epic, since_legend, packs_opened FROM shop_state WHERE user_id=?').get(uid);
  return r ? { sinceEpic: r.since_epic, sinceLegend: r.since_legend, opened: r.packs_opened } : { sinceEpic: 0, sinceLegend: 0, opened: 0 };
}
function infoOf(uid) {
  const p = pityOf(uid);
  return { pity: { sinceEpic: p.sinceEpic, sinceLegend: p.sinceLegend, left: shopPityLeft(p) }, opened: p.opened };
}
function historyOf(uid) {
  return db.prepare('SELECT id, opened_at, price, refund, cards_json, pity_hit FROM pack_log WHERE user_id=? ORDER BY id DESC LIMIT ?')
    .all(uid, HISTORY_SHOWN).map(r => ({ id: r.id, openedAt: r.opened_at, price: r.price, refund: r.refund, cards: JSON.parse(r.cards_json), pityHit: r.pity_hit }));
}

// ---------- 상점 정보 (상점 화면을 열 때) ----------
router.get('/shop', (req, res) => {
  const uid = req.user.id;
  res.set('Cache-Control', 'no-store');
  res.json({
    price: SHOP.PACK_PRICE, packSize: SHOP.PACK_SIZE, maxBuy: SHOP.MAX_BUY,
    rates: SHOP.RATES, refund: SHOP.REFUND, dupCap: SHOP.DUP_CAP,
    pityEpic: SHOP.PITY_EPIC, pityLegend: SHOP.PITY_LEGEND, guaranteeMin: SHOP.GUARANTEE_MIN,
    ...infoOf(uid), history: historyOf(uid),
  });
});

// ---------- 팩 개봉 ----------
// 요청 {count: 1~MAX_BUY, rev}.  응답 {packs:[{cards,refund,pityHit}], spent, refund, wallet, collection, pity, opened}
router.post('/shop/open', (req, res) => {
  const uid = req.user.id, body = req.body || {};
  const count = body.count;
  if (!Number.isInteger(count) || count < 1 || count > SHOP.MAX_BUY) return res.status(400).json({ error: `한 번에 1~${SHOP.MAX_BUY}팩까지 살 수 있어요.` });
  if (!Number.isInteger(body.rev)) return res.status(400).json({ error: '잘못된 요청이에요.' });

  ensureCollection(uid);                                      // 스타터를 먼저 받은 뒤에 팩 카드를 더한다 (순서가 바뀌면 스타터가 덮어쓸 수 있음)
  db.exec('BEGIN IMMEDIATE');
  try {
    const w = ensureWallet(uid);
    if (body.rev !== w.rev) { db.exec('ROLLBACK'); return res.status(409).json({ error: '다른 기기에서 먼저 저장되었어요. 새로고침해 주세요.', wallet: walletOut(w) }); }
    const cost = SHOP.PACK_PRICE * count;
    if (w.gold < cost) { db.exec('ROLLBACK'); return res.status(400).json({ error: `골드가 부족해요. (필요 ${cost} · 보유 ${w.gold})`, wallet: walletOut(w) }); }

    const before = collectionOf(uid), owned = { ...before };
    const st = pityOf(uid);
    let pity = { sinceEpic: st.sinceEpic, sinceLegend: st.sinceLegend }, refundTotal = 0;
    const packs = [], now = Date.now();
    const logIns = db.prepare('INSERT INTO pack_log(user_id,opened_at,price,refund,cards_json,pity_hit) VALUES (?,?,?,?,?,?)');
    for (let i = 0; i < count; i++) {
      const r = rollPack(CARD_POOL, owned, pity, rng);
      pity = r.pity; refundTotal += r.refund;
      packs.push({ cards: r.cards, refund: r.refund, pityHit: r.pityHit });
      logIns.run(uid, now, SHOP.PACK_PRICE, r.refund, JSON.stringify(r.cards), r.pityHit);
    }
    const upCol = db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,?)
                              ON CONFLICT(user_id,card_name) DO UPDATE SET count=excluded.count`);
    for (const [name, n] of Object.entries(owned)) if (n !== (before[name] || 0)) upCol.run(uid, name, n);
    db.prepare(`INSERT INTO shop_state(user_id,since_epic,since_legend,packs_opened) VALUES (?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET since_epic=excluded.since_epic, since_legend=excluded.since_legend, packs_opened=packs_opened+?`)
      .run(uid, pity.sinceEpic, pity.sinceLegend, count, count);
    const upd = db.prepare('UPDATE wallets SET gold=gold-?+?, rev=rev+1, updated_at=? WHERE user_id=? AND rev=?').run(cost, refundTotal, Date.now(), uid, w.rev);
    if (!upd.changes) throw new Error('wallet changed during purchase');
    db.exec('COMMIT');
    res.json({ packs, spent: cost, refund: refundTotal, wallet: walletOut(ensureWallet(uid)), collection: collectionOf(uid), ...infoOf(uid) });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('shop/open 실패:', e);
    res.status(500).json({ error: '서버 오류가 났어요. 골드는 차감되지 않았어요.' });
  }
});

module.exports = { router };
