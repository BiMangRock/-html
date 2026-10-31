// test-bosses.js — v116 보스 목록 API: 읽기(로그인) · 쓰기(개발자만) · 덱 검증 · 되돌리기 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const auth = require('./auth');
const saves = require('./saves');
const bosses = require('./bosses');
const dbRaw = require('./db');
const E = require(path.join(__dirname, '..', 'public', 'js', 'engine.js'));

const app = express();
app.use('/api/bosses', express.json({ limit: '1mb' }));
app.use(express.json());
app.use('/api', auth.router);
app.use('/api', saves.router);
app.use('/api', bosses.router);

const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => { let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => ({})) };
    }; };
  const dev = mk(), user = mk(), anon = mk();
  try {
    await dev('POST', '/api/signup', { username: 'devuser1', password: 'password123' });
    await user('POST', '/api/signup', { username: 'normal1', password: 'password123' });
    dbRaw.prepare("UPDATE users SET is_admin=1 WHERE username='devuser1'").run();

    const deck = E.defaultDeckList();
    const boss = (id, extra) => ({ id, name: '보스 ' + id, icon: '🔥', desc: '', cheats: [], tier: 'mid', bot: 'rule2', model: '', deck, ...extra });

    let r = await anon('GET', '/api/bosses'); assert.strictEqual(r.status, 401, '로그인 없이는 못 읽음');
    r = await user('GET', '/api/bosses'); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.bosses, null, '처음엔 null(코드 기본값)');
    r = await user('GET', '/api/save'); assert.strictEqual(r.data.isAdmin, false, '일반 유저는 isAdmin=false');
    r = await dev('GET', '/api/save'); assert.strictEqual(r.data.isAdmin, true, '개발자는 isAdmin=true');
    r = await dev('GET', '/api/me'); assert.strictEqual(r.data.user.isAdmin, true);

    r = await user('PUT', '/api/bosses', { bosses: [boss('b1')] }); assert.strictEqual(r.status, 403, '일반 유저는 저장 불가');
    r = await anon('PUT', '/api/bosses', { bosses: [boss('b1')] }); assert.strictEqual(r.status, 401);
    r = await dev('PUT', '/api/bosses', { bosses: [] }); assert.strictEqual(r.status, 400, '빈 목록 거부');
    r = await dev('PUT', '/api/bosses', { bosses: [boss('b1', { deck: deck.slice(1) })] }); assert.strictEqual(r.status, 400, '덱 장수 오류 거부');
    r = await dev('PUT', '/api/bosses', { bosses: [boss('bad id!')] }); assert.strictEqual(r.status, 400, 'id 형식 거부');
    r = await dev('PUT', '/api/bosses', { bosses: [boss('b1'), boss('b1')] }); assert.strictEqual(r.status, 400, 'id 중복 거부');

    r = await dev('PUT', '/api/bosses', { bosses: [boss('b1', { reward: 999999999, name: 'x'.repeat(50) }), boss('b2', { tier: 'high', model: '/models/a.json' })] });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.bosses.length, 2);
    assert.strictEqual(r.data.bosses[0].reward, 1000000, '보상 상한'); assert.strictEqual(r.data.bosses[0].name.length, 20, '이름 길이 제한');
    assert.strictEqual(r.data.bosses[1].bot, 'model');

    r = await user('GET', '/api/bosses'); assert.strictEqual(r.data.bosses.length, 2, '일반 유저도 바뀐 목록을 본다');
    r = await user('GET', '/api/save'); assert.strictEqual(r.data.bosses.length, 2, '/api/save 에도 포함');

    r = await user('PUT', '/api/bosses', { bosses: null }); assert.strictEqual(r.status, 403, '일반 유저는 되돌리기 불가');
    r = await dev('PUT', '/api/bosses', { bosses: null }); assert.strictEqual(r.status, 200);
    r = await user('GET', '/api/bosses'); assert.strictEqual(r.data.bosses, null, '되돌리면 다시 null');
    console.log('test-bosses: 모두 통과');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
});
