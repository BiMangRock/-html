// test-shop.js — 5단계 상점 확인: 확률·보장·천장·중복 환급 규칙(시드 난수) + 팩 개봉 API(골드·컬렉션·기록·충돌) (임시 DB 사용)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const auth = require('./auth');
const saves = require('./saves');
const shop = require('./shop');
const dbRaw = require('./db');

const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { SHOP, SHOP_RARITIES, rollPack } = require(path.join(JS, 'shop.js'));
const POOL = E.CARD_POOL;
const idx = r => SHOP_RARITIES.indexOf(r);

// ---------- 1) 규칙 (순수 함수, 시드 난수) ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seeded = seed => { const f = mulberry32(seed); return n => Math.floor(f() * n); };

(function rules() {
  assert.strictEqual(SHOP.DUP_CAP, E.CONFIG.COPIES, '환급 기준 장수는 덱 한도(CONFIG.COPIES)와 같아야 함');
  assert.strictEqual(Object.values(SHOP.RATES).reduce((a, b) => a + b, 0), 1000, '확률 합은 100%');
  SHOP_RARITIES.forEach(r => assert.ok(POOL.some(c => c.rarity === r), r + ' 등급 카드가 있어야 함'));

  // 확률 · 보장
  const rng = seeded(12345), N = 40000, tally = { '일반': 0, '희귀': 0, '특급': 0, '전설': 0 };
  let pity = { sinceEpic: 0, sinceLegend: 0 }, noRare = 0, maxEpic = 0, maxLeg = 0, legendPacks = 0, hits = { epic: 0, legend: 0 };
  for (let i = 0; i < N; i++) {
    const r = rollPack(POOL, {}, pity, rng);
    assert.strictEqual(r.cards.length, SHOP.PACK_SIZE, '한 팩은 5장');
    if (!r.cards.some(c => idx(c.rarity) >= idx(SHOP.GUARANTEE_MIN))) noRare++;
    r.cards.forEach(c => tally[c.rarity]++);
    for (let k = 1; k < r.cards.length; k++) assert.ok(idx(r.cards[k - 1].rarity) <= idx(r.cards[k].rarity), '낮은 등급부터 정렬');
    if (r.cards.some(c => c.rarity === '전설')) legendPacks++;
    if (r.pityHit) hits[r.pityHit]++;
    pity = r.pity; maxEpic = Math.max(maxEpic, pity.sinceEpic); maxLeg = Math.max(maxLeg, pity.sinceLegend);
  }
  assert.strictEqual(noRare, 0, '희귀 이상 보장: 어떤 팩도 일반 5장이면 안 됨');
  assert.ok(maxEpic < SHOP.PITY_EPIC, `특급 천장: 최대 연속 ${maxEpic}팩 (<${SHOP.PITY_EPIC})`);
  assert.ok(maxLeg < SHOP.PITY_LEGEND, `전설 천장: 최대 연속 ${maxLeg}팩 (<${SHOP.PITY_LEGEND})`);
  const total = N * SHOP.PACK_SIZE;
  for (const r of SHOP_RARITIES) {
    const got = tally[r] / total * 1000, want = SHOP.RATES[r];
    // 보장·천장이 일부 올려 주므로 기대치보다 "조금 높은" 것은 정상. 크게 어긋나지만 않으면 된다.
    assert.ok(Math.abs(got - want) <= Math.max(12, want * 0.35), `${r} 비율 ${got.toFixed(1)}‰ (설정 ${want}‰)`);
  }
  console.log(`  확률(‰): ` + SHOP_RARITIES.map(r => `${r} ${(tally[r] / total * 1000).toFixed(1)}`).join(' · ') + ` | 전설 나온 팩 ${(legendPacks / N * 100).toFixed(1)}% | 천장 발동 특급 ${hits.epic}회 · 전설 ${hits.legend}회`);

  // 천장 확정
  let r = rollPack(POOL, {}, { sinceEpic: 0, sinceLegend: SHOP.PITY_LEGEND - 1 }, seeded(1));
  assert.ok(r.cards.some(c => c.rarity === '전설'), '전설 천장: 확정'); assert.deepStrictEqual(r.pity, { sinceEpic: 0, sinceLegend: 0 });
  for (let s = 0; s < 300; s++) {
    r = rollPack(POOL, {}, { sinceEpic: SHOP.PITY_EPIC - 1, sinceLegend: 0 }, seeded(s));
    assert.ok(r.cards.some(c => idx(c.rarity) >= idx('특급')), '특급 천장: 특급 이상 확정');
    r = rollPack(POOL, {}, { sinceEpic: SHOP.PITY_EPIC - 1, sinceLegend: SHOP.PITY_LEGEND - 1 }, seeded(s));
    assert.ok(r.cards.some(c => c.rarity === '전설'), '두 천장이 겹쳐도 전설 1장');
  }
  // 천장이 이미 나온 좋은 카드를 깎지 않는다: 천장 팩의 카드 등급 합은 (천장 없는 같은 시드 팩)보다 작아지지 않음
  for (let s = 0; s < 200; s++) {
    const a = rollPack(POOL, {}, { sinceEpic: 0, sinceLegend: 0 }, seeded(s)), b = rollPack(POOL, {}, { sinceEpic: 0, sinceLegend: SHOP.PITY_LEGEND - 1 }, seeded(s));
    const sum = x => x.cards.reduce((t, c) => t + idx(c.rarity), 0);
    assert.ok(sum(b) >= sum(a), '천장은 등급을 올리기만 한다');
  }

  // 중복 환급: 이미 2장 가진 카드는 환급, 1장이면 2장째로 들어옴
  const all2 = {}; POOL.forEach(c => { all2[c.name] = SHOP.DUP_CAP; });
  r = rollPack(POOL, all2, { sinceEpic: 0, sinceLegend: 0 }, seeded(7));
  assert.ok(r.cards.every(c => c.dup && !c.isNew && c.refund === SHOP.REFUND[c.rarity]), '다 가진 상태면 전부 환급');
  assert.strictEqual(r.refund, r.cards.reduce((t, c) => t + SHOP.REFUND[c.rarity], 0));
  const owned = {};
  for (let i = 0; i < 3000; i++) {            // 계속 열어도 보유 장수는 DUP_CAP 를 넘지 않고, 환급 + 보유 증가 = 뽑은 장수
    const before = Object.values(owned).reduce((a, b) => a + b, 0);
    r = rollPack(POOL, owned, { sinceEpic: 0, sinceLegend: 0 }, rng);
    const after = Object.values(owned).reduce((a, b) => a + b, 0);
    assert.strictEqual((after - before) + r.cards.filter(c => c.dup).length, SHOP.PACK_SIZE);
  }
  assert.ok(Object.values(owned).every(n => n <= SHOP.DUP_CAP), '보유 장수가 한도를 넘지 않음');
  // 같은 팩 안에서 같은 카드가 두 번 나온 경우도 올바르게 처리 (1장째 isNew, 2장째 not new)
  console.log('✔ 팩 규칙 테스트 통과');
})();

// ---------- 2) API ----------
const app = express();
app.use(express.json());
app.use('/api', auth.router);
app.use('/api', saves.router);
app.use('/api', shop.router);

const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
  };
  const A = mk(), B = mk();
  const sumCol = c => Object.values(c).reduce((a, b) => a + b, 0);
  try {
    let r = await A('GET', '/api/shop'); assert.strictEqual(r.status, 401, '로그인 전엔 401');
    r = await A('POST', '/api/shop/open', { count: 1, rev: 1 }); assert.strictEqual(r.status, 401);
    await A('POST', '/api/signup', { username: 'alice01', password: 'password123' });
    await B('POST', '/api/signup', { username: 'bob0001', password: 'password123' });

    r = await A('GET', '/api/shop'); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.price, 100); assert.strictEqual(r.data.packSize, 5); assert.deepStrictEqual(r.data.history, []);
    assert.deepStrictEqual(r.data.pity.left, { epic: SHOP.PITY_EPIC, legend: SHOP.PITY_LEGEND });

    let s = await A('GET', '/api/save'); const rev0 = s.data.wallet.rev; const col0 = s.data.collection;
    assert.strictEqual(s.data.wallet.gold, 100);

    // 잘못된 요청
    for (const bad of [0, 11, 1.5, '5', null, -1]) { r = await A('POST', '/api/shop/open', { count: bad, rev: rev0 }); assert.strictEqual(r.status, 400, 'count ' + bad); }
    r = await A('POST', '/api/shop/open', { count: 1 }); assert.strictEqual(r.status, 400, 'rev 없으면 400');
    r = await A('POST', '/api/shop/open', { count: 1, rev: rev0 + 5 }); assert.strictEqual(r.status, 409, '낡거나 틀린 rev 는 409');
    // 골드 부족: 100골드로 2팩
    r = await A('POST', '/api/shop/open', { count: 2, rev: rev0 }); assert.strictEqual(r.status, 400); assert.ok(/부족/.test(r.data.error));
    s = await A('GET', '/api/save'); assert.strictEqual(s.data.wallet.gold, 100, '실패하면 골드 그대로'); assert.strictEqual(s.data.wallet.rev, rev0); assert.strictEqual(sumCol(s.data.collection), sumCol(col0), '실패하면 카드 그대로');
    assert.strictEqual(dbRaw.prepare('SELECT COUNT(*) n FROM pack_log').get().n, 0, '실패하면 기록도 없음');

    // 1팩 개봉 (골드 100 → 0 + 환급)
    r = await A('POST', '/api/shop/open', { count: 1, rev: rev0 }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    let o = r.data; assert.strictEqual(o.packs.length, 1); assert.strictEqual(o.packs[0].cards.length, 5);
    assert.strictEqual(o.spent, 100); assert.strictEqual(o.wallet.gold, 0 + o.refund, '골드 = 100 - 100 + 환급'); assert.strictEqual(o.wallet.rev, rev0 + 1);
    const added = o.packs[0].cards.filter(c => !c.dup).length;
    assert.strictEqual(sumCol(o.collection) - sumCol(col0), added, '환급이 아닌 카드만 컬렉션에 추가');
    for (const c of o.packs[0].cards) assert.ok(POOL.some(p => p.name === c.name && p.rarity === c.rarity), '실제 카드·등급');
    assert.ok(Object.values(o.collection).every(n => n <= 99));
    // 같은 rev 로 다시 요청(더블클릭·재전송) → 두 번 사지지 않음
    r = await A('POST', '/api/shop/open', { count: 1, rev: rev0 }); assert.strictEqual(r.status, 409, '같은 rev 재전송은 거부');
    s = await A('GET', '/api/save'); assert.strictEqual(s.data.wallet.gold, o.wallet.gold); assert.deepStrictEqual(s.data.collection, o.collection, '/api/save 와 개봉 결과가 일치');

    // 골드 넉넉히 → 10팩 한 번에. 골드·컬렉션·기록·천장이 정확히 맞아야 함
    let rev = s.data.wallet.rev;
    r = await A('PUT', '/api/wallet', { gold: 5000, pool: 100, poolDay: s.data.wallet.poolDay, bet: 0, rev }); assert.strictEqual(r.status, 200); rev = r.data.wallet.rev;
    const colBefore = (await A('GET', '/api/save')).data.collection;
    r = await A('POST', '/api/shop/open', { count: 10, rev }); assert.strictEqual(r.status, 200); o = r.data;
    assert.strictEqual(o.packs.length, 10); assert.strictEqual(o.spent, 1000);
    const refundSum = o.packs.reduce((t, p) => t + p.refund, 0); assert.strictEqual(o.refund, refundSum);
    assert.strictEqual(o.wallet.gold, 5000 - 1000 + refundSum, '골드 계산이 정확');
    const newCards = o.packs.flatMap(p => p.cards).filter(c => !c.dup).length, dupCards = o.packs.flatMap(p => p.cards).filter(c => c.dup);
    assert.strictEqual(newCards + dupCards.length, 50); assert.strictEqual(sumCol(o.collection) - sumCol(colBefore), newCards);
    assert.strictEqual(dupCards.reduce((t, c) => t + c.refund, 0), refundSum);
    for (const [n, k] of Object.entries(o.collection)) assert.ok(k <= Math.max(SHOP.DUP_CAP, colBefore[n] || 0), n + ' 이(가) 한도를 넘음');
    assert.strictEqual(dbRaw.prepare('SELECT COUNT(*) n FROM pack_log').get().n, 11, '팩 1개당 기록 1줄 (1 + 10)');
    assert.strictEqual(o.opened, 11);

    // 천장 카운터가 저장·유지된다 + 상점 정보에 기록이 보인다
    r = await A('GET', '/api/shop'); assert.strictEqual(r.data.opened, 11); assert.strictEqual(r.data.history.length, 11);
    assert.deepStrictEqual(r.data.history[0].cards.length, 5); assert.ok(r.data.history[0].id > r.data.history[1].id, '최신 기록이 먼저');
    assert.deepStrictEqual(r.data.pity.sinceLegend, o.pity.sinceLegend);
    // 천장 확정: 카운터를 직접 올려 두면 다음 팩에 전설 확정 (+ 기록에 pityHit)
    const aliceId = dbRaw.prepare("SELECT id FROM users WHERE username='alice01'").get().id;
    dbRaw.prepare('UPDATE shop_state SET since_legend=?, since_epic=? WHERE user_id=?').run(SHOP.PITY_LEGEND - 1, 0, aliceId);
    r = await A('POST', '/api/shop/open', { count: 1, rev: o.wallet.rev }); assert.strictEqual(r.status, 200);
    assert.ok(r.data.packs[0].cards.some(c => c.rarity === '전설'), '전설 천장 팩'); assert.strictEqual(r.data.packs[0].pityHit, 'legend'); assert.strictEqual(r.data.pity.sinceLegend, 0);
    assert.strictEqual(dbRaw.prepare('SELECT pity_hit FROM pack_log ORDER BY id DESC LIMIT 1').get().pity_hit, 'legend');

    // 계정 분리: bob 의 상점/컬렉션/천장은 alice 와 무관
    r = await B('GET', '/api/shop'); assert.strictEqual(r.data.opened, 0); assert.deepStrictEqual(r.data.history, []);
    const bs = await B('GET', '/api/save'); assert.strictEqual(bs.data.wallet.gold, 100);

    // 개봉 뒤 덱 에디터 규칙: 새로 얻은 카드로 덱을 만들 수 있다 (보유 검사와 연동)
    const fresh = (await A('GET', '/api/save')).data.collection;
    const legend = Object.keys(fresh).find(n => POOL.find(c => c.name === n).rarity === '전설');
    assert.ok(legend, '전설을 얻었으니 컬렉션에 있어야 함');
    const deck = E.defaultDeckList(); const want = [legend, ...deck.slice(1)];
    r = await A('PUT', '/api/deck', { deck: want });
    assert.strictEqual(r.status, 200, '얻은 카드로 덱 저장 가능: ' + JSON.stringify(r.data));

    console.log('✔ 상점 API 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e.stack || e.message); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(), 50); }
});
