// test-decks.js — v135 덱 슬롯 · 사용 중 덱 · 덱 코드 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { DeckCode } = require(path.join(JS, 'deckcode.js'));
const auth = require('./auth'), saves = require('./saves'), decks = require('./decks'), db = require('./db');

const app = express(); app.use(express.json());
app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', decks.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  try {
    // 덱 코드: 만들고 읽기 (압축 · 비압축 · 모르는 카드 · 깨진 코드)
    const def = E.defaultDeckList();
    const code = await DeckCode.encode(def, '내 덱', 'fireblast'); assert(/^CD1\./.test(code), code);
    const back = await DeckCode.decode('### 아무 글\n' + code + '\n# 끝', E.CARD_POOL);
    assert.deepStrictEqual(back.deck.slice().sort(), def.slice().sort()); assert.strictEqual(back.name, '내 덱'); assert.strictEqual(back.heroPower, 'fireblast'); assert.deepStrictEqual(back.unknown, []);
    const raw = 'CD0.' + Buffer.from(JSON.stringify({ n: 'x', h: '', c: [['들쥐', 2], ['없는카드', 1]] })).toString('base64url');
    const r0 = await DeckCode.decode(raw, E.CARD_POOL); assert.deepStrictEqual(r0.deck, ['들쥐', '들쥐']); assert.deepStrictEqual(r0.unknown, ['없는카드']);
    assert((await DeckCode.decode('CD1.zzzz', E.CARD_POOL)).error); assert((await DeckCode.decode('안녕', E.CARD_POOL)).error);
    console.log('✔ 덱 코드', code.length + '자');

    await call('POST', '/api/signup', { username: 'decker1', nickname: 'decker1', password: 'password1' });
    let r = await call('GET', '/api/decks');
    assert.strictEqual(r.data.slots.length, 1, '처음엔 1번 "내 덱"'); assert.strictEqual(r.data.active, 1); assert.deepStrictEqual(r.data.slots[0].deck, def);
    // 새 덱 (미완성 · 없는 카드 포함도 저장 가능)
    r = await call('POST', '/api/decks', { name: '데스윙 덱', deck: ['데스윙', '들쥐'], heroPower: 'armorUp' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); const s2 = r.data.slot; assert.strictEqual(s2, 2);
    assert.strictEqual(r.data.slots.find(s => s.slot === 2).heroPower, 'armorUp');
    r = await call('POST', '/api/decks', { name: 'x', deck: ['없는카드'] }); assert.strictEqual(r.status, 400);
    r = await call('POST', '/api/decks', { name: 'x', deck: ['들쥐', '들쥐', '들쥐'] }); assert.strictEqual(r.status, 400, '3장');
    r = await call('POST', '/api/decks', { name: 'x', deck: ['학사모'] }); assert.strictEqual(r.status, 200, '학사모는 일반 카드(잠금)라 슬롯엔 저장 가능');
    // 미완성 덱은 사용 불가
    r = await call('POST', `/api/decks/${s2}/activate`); assert.strictEqual(r.status, 400); assert(/2\/30/.test(r.data.error), r.data.error);
    // 30장이지만 없는 카드 → 사용 불가
    const withLegend = def.slice(0, 29).concat(['데스윙']);
    r = await call('PUT', `/api/decks/${s2}`, { deck: withLegend, name: '  바뀐 이름  ' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.slots.find(s => s.slot === 2).name, '바뀐 이름');
    r = await call('POST', `/api/decks/${s2}/activate`); assert.strictEqual(r.status, 400); assert(/없는 카드/.test(r.data.error), r.data.error);
    // 완성 덱 → 사용 중 → /api/save 의 덱이 바뀜
    const alt = def.slice().reverse();
    r = await call('POST', '/api/decks', { name: '두 번째', deck: alt }); const s3 = r.data.slot;
    r = await call('POST', `/api/decks/${s3}/activate`); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.active, s3);
    r = await call('GET', '/api/save'); assert.deepStrictEqual(r.data.deck, alt, '사용 중 덱');
    // 사용 중 덱은 미완성으로 못 바꾸고, 못 지움
    r = await call('PUT', `/api/decks/${s3}`, { deck: ['들쥐'] }); assert.strictEqual(r.status, 400);
    r = await call('DELETE', `/api/decks/${s3}`, {}); assert.strictEqual(r.status, 400);
    // 예전 방식 덱 저장(PUT /api/deck) → 사용 중 슬롯에도 반영
    r = await call('PUT', '/api/deck', { deck: def }); assert.strictEqual(r.status, 200);
    r = await call('GET', '/api/decks'); assert.deepStrictEqual(r.data.slots.find(s => s.slot === s3).deck, def, '동기화');
    // 지우기 · 최대 개수
    r = await call('DELETE', '/api/decks/1', {}); assert.strictEqual(r.status, 200); assert(!r.data.slots.some(s => s.slot === 1));
    for (let i = 0; i < 20; i++) r = await call('POST', '/api/decks', { name: 'n' + i, deck: [] });
    assert.strictEqual(r.status, 400, '최대 ' + decks.MAX_SLOTS); r = await call('GET', '/api/decks'); assert.strictEqual(r.data.slots.length, decks.MAX_SLOTS);
    r = await call('PUT', '/api/decks/99', { name: 'x' }); assert.strictEqual(r.status, 400);
    console.log('✔ 덱 슬롯 · 사용 중 덱');
    console.log('✔ 덱 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(), 50); }
});
