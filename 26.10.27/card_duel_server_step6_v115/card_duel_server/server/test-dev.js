// test-dev.js — v122 개발자(is_admin) 덱: 모험·보스 전용 카드 포함 모든 카드 · 보유 무관 / 일반 유저는 그대로 막힘 / 유저 대전은 그대로 엄격 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const auth = require('./auth');
const saves = require('./saves');
const db = require('./db');
const pvpDb = require('./pvp-db');
const E = require(path.join(__dirname, '..', 'public', 'js', 'engine.js'));
const Adv = require(path.join(__dirname, '..', 'public', 'js', 'adventure.js'));

const app = express(); app.use(express.json()); app.use('/api', auth.router); app.use('/api', saves.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, data: await res.json().catch(() => ({})) }; }; };
  const Dev = mk(), User = mk();
  try {
    assert.ok([200, 201].includes((await Dev('POST', '/api/signup', { username: 'devguy', password: 'password1' })).status));
    assert.ok([200, 201].includes((await User('POST', '/api/signup', { username: 'normal1', password: 'password1' })).status));
    db.prepare("UPDATE users SET is_admin=1 WHERE username='devguy'").run();
    const special = ['연구실의 군주 지도교수', '수강신청 서버 대폭발', 'F폭격기 교수님', '지옥의 중간고사', '데스윙'];   // 모험 전용 · 보스 전용 · 안 가진 전설
    const deck = [...special.flatMap(n => [n, n]), ...E.defaultDeckList().filter(n => !special.includes(n))].slice(0, 30);
    assert.strictEqual(E.validateDeckList(deck), null);
    for (const url of ['/api/deck', '/api/adventure/deck']) {
      assert.strictEqual((await Dev('PUT', url, { deck })).status, 200, '개발자 ' + url);
      assert.strictEqual((await User('PUT', url, { deck })).status, 400, '일반 유저 ' + url);
    }
    const sv = (await Dev('GET', '/api/save')).data; assert.strictEqual(sv.isAdmin, true); assert.deepStrictEqual(sv.deck, deck, '불러와도 그대로'); assert.deepStrictEqual(sv.advDeck, deck);
    const bad = deck.slice(0, 29); assert.strictEqual((await Dev('PUT', '/api/deck', { deck: bad })).status, 400, '30장 규칙은 그대로');
    const devId = db.prepare("SELECT id FROM users WHERE username='devguy'").get().id;
    assert.deepStrictEqual(pvpDb.loadDeck(devId), E.defaultDeckList(), '유저 대전은 특수 카드 덱 대신 추천 덱');
    console.log('test-dev: 모두 통과');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { server.close(); }
});
