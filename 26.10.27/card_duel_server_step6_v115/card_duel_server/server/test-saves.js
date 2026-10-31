// test-saves.js — 3단계 저장 API 확인: 계정별 분리 · 값 검증 · 충돌 감지 (임시 DB 사용)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const auth = require('./auth');
const saves = require('./saves');

const E = require(path.join(__dirname, '..', 'public', 'js', 'engine.js'));
const colDb = require('./collection');
const dbRaw = require('./db');

const app = express();
app.use(express.json());
app.use('/api', auth.router);
app.use('/api', saves.router);

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
  const A = mk(), B = mk(), A2 = mk();
  // 정상 덱 30장 (2장씩 15종)
  const deck = E.defaultDeckList();              // 스타터 카드로 만들 수 있는 덱
  const LEGEND = E.CARD_POOL.find(c => c.rarity === '전설').name;
  const legendDeck = [LEGEND, LEGEND, ...deck.slice(2)];
  try {
    let r = await A('GET', '/api/save'); assert.strictEqual(r.status, 401, '로그인 전엔 401');
    await A('POST', '/api/signup', { username: 'alice01', password: 'password123' });
    await B('POST', '/api/signup', { username: 'bob0001', password: 'password123' });

    r = await A('GET', '/api/save'); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.wallet.gold, 100, '새 계정은 시작 골드 100'); assert.strictEqual(r.data.deck, null); assert.deepStrictEqual(r.data.adventure.cleared, {});
    const rev0 = r.data.wallet.rev;

    // 골드 저장
    r = await A('PUT', '/api/wallet', { gold: 250, pool: 105, poolDay: '2026-10-31', bet: 0, rev: rev0 }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.wallet.gold, 250);
    const rev1 = r.data.wallet.rev; assert.strictEqual(rev1, rev0 + 1, '저장할 때마다 rev 증가');
    // 이상한 값은 보정 (음수 골드 → 0, 풀 상한 300)
    r = await A('PUT', '/api/wallet', { gold: -50, pool: 99999, poolDay: 'x', bet: 5, rev: rev1 }); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.wallet.gold, 0); assert.strictEqual(r.data.wallet.pool, 300);
    // 오래된 rev → 충돌
    r = await A('PUT', '/api/wallet', { gold: 999, pool: 100, poolDay: '2026-10-31', bet: 0, rev: rev0 }); assert.strictEqual(r.status, 409, '낡은 rev 는 409');
    assert.strictEqual(r.data.wallet.gold, 0, '충돌 시 서버 값을 돌려줌');
    r = await A('PUT', '/api/wallet', { gold: 5 }); assert.strictEqual(r.status, 400, 'rev 없으면 400');

    // 덱
    r = await A('PUT', '/api/deck', { deck: deck.slice(1) }); assert.strictEqual(r.status, 400, '29장은 거부');
    r = await A('PUT', '/api/deck', { deck: ['없는카드', ...deck.slice(1)] }); assert.strictEqual(r.status, 400, '없는 카드는 거부');
    r = await A('PUT', '/api/deck', { deck: [deck[0], deck[0], deck[0], ...deck.slice(3)] }); assert.strictEqual(r.status, 400, '같은 카드 3장은 거부');
    r = await A('PUT', '/api/deck', { deck }); assert.strictEqual(r.status, 200);

    // ---- 4단계: 컬렉션 ----
    r = await A('GET', '/api/save'); const col = r.data.collection;
    const commons = E.CARD_POOL.filter(c => c.rarity === '일반');
    assert.ok(commons.every(c => col[c.name] >= 2), '일반 카드는 전부 2장 이상 지급');
    assert.ok(deck.every(n => col[n] >= 1), '추천 덱 카드는 등급과 상관없이 보유');
    assert.strictEqual(col[LEGEND], undefined, '전설은 스타터에 없음');
    r = await A('PUT', '/api/deck', { deck: legendDeck }); assert.strictEqual(r.status, 400, '미보유 카드가 든 덱은 거부'); assert.ok(/보유/.test(r.data.error));
    const aliceId = dbRaw.prepare("SELECT id FROM users WHERE username='alice01'").get().id;
    colDb.ensureAtLeast(aliceId, LEGEND, 2);                       // grant.js 가 하는 일
    r = await A('PUT', '/api/deck', { deck: legendDeck }); assert.strictEqual(r.status, 200, '지급받은 뒤에는 저장 가능');
    r = await A('GET', '/api/save'); assert.deepStrictEqual(r.data.deck, legendDeck);
    dbRaw.prepare('UPDATE collection SET count=1 WHERE user_id=? AND card_name=?').run(aliceId, LEGEND);   // 보유가 줄어든 상황
    r = await A('GET', '/api/save'); assert.strictEqual(r.data.deck, null, '저장된 덱이 보유와 안 맞으면 null (클라이언트는 추천 덱 사용)');
    r = await A('PUT', '/api/deck', { deck }); assert.strictEqual(r.status, 200);
    const again = await A('GET', '/api/save'); assert.strictEqual(again.data.collection[LEGEND], 1, '스타터는 한 번만 지급 (다시 받지 않음)');

    // 모험 기록
    r = await A('POST', '/api/adventure/clear', { bossId: 'boss1' }); assert.strictEqual(r.status, 200);
    r = await A('POST', '/api/adventure/clear', { bossId: 'boss1' }); assert.strictEqual(r.status, 200, '중복 기록도 에러 아님');
    r = await A('POST', '/api/adventure/clear', { bossId: '../x; drop' }); assert.strictEqual(r.status, 400, '이상한 보스 번호 거부');

    // 다시 불러오기 (새 로그인) — 저장된 값 그대로
    r = await A2('POST', '/api/login', { username: 'alice01', password: 'password123' }); assert.strictEqual(r.status, 200);
    r = await A2('GET', '/api/save');
    assert.strictEqual(r.data.wallet.gold, 0); assert.deepStrictEqual(r.data.deck, deck); assert.ok(r.data.adventure.cleared.boss1, '보스1 클리어 유지');

    // 계정 분리: bob 은 alice 의 데이터를 못 본다
    r = await B('GET', '/api/save');
    assert.strictEqual(r.data.wallet.gold, 100); assert.strictEqual(r.data.deck, null); assert.deepStrictEqual(r.data.adventure.cleared, {});

    console.log('✔ 저장 API 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e.message); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(), 50); }
});
