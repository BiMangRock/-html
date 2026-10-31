// test-auth.js — 회원가입/로그인/로그아웃 흐름을 임시 DB로 확인 (실제 data/ 는 건드리지 않음)
process.env.DB_PATH = ':memory:';
process.env.PORT = '0';
const assert = require('assert');
const http = require('http');
const express = require('express');
const auth = require('./auth');

const app = express();
app.use(express.json());
app.use('/api', auth.router);
app.get('/secret', auth.requireAuth, (req, res) => res.json({ me: req.user.username }));

const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body, opts = {}) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(opts.headers || {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})), setCookie: sc };
  };
  try {
    let r = await call('GET', '/api/me'); assert.strictEqual(r.status, 401, '로그인 전 /me 는 401');
    r = await call('POST', '/api/signup', { username: 'ab', password: 'password123' }); assert.strictEqual(r.status, 400, '너무 짧은 아이디');
    r = await call('POST', '/api/signup', { username: 'tester1', password: 'short' }); assert.strictEqual(r.status, 400, '너무 짧은 비밀번호');
    r = await call('POST', '/api/signup', { username: 'tester1', password: 'password123' }); assert.strictEqual(r.status, 201, '가입 성공');
    assert.ok(/HttpOnly/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie), '쿠키는 HttpOnly + SameSite');
    r = await call('GET', '/api/me'); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.user.username, 'tester1');
    r = await call('GET', '/secret'); assert.strictEqual(r.data.me, 'tester1', 'requireAuth 통과');
    r = await call('POST', '/api/logout', {}); assert.strictEqual(r.status, 200);
    cookie = '';
    r = await call('GET', '/secret'); assert.strictEqual(r.status, 401, '로그아웃 후 401');
    r = await call('POST', '/api/signup', { username: 'TESTER1', password: 'password123' }); assert.strictEqual(r.status, 409, '대소문자만 다른 아이디도 중복');
    r = await call('POST', '/api/login', { username: 'tester1', password: 'wrongpassword' }); assert.strictEqual(r.status, 401, '틀린 비밀번호');
    r = await call('POST', '/api/login', { username: 'nobody', password: 'password123' }); assert.strictEqual(r.status, 401, '없는 아이디도 같은 오류');
    r = await call('POST', '/api/login', { username: 'tester1', password: 'password123' }); assert.strictEqual(r.status, 200, '로그인 성공');
    r = await call('GET', '/api/me'); assert.strictEqual(r.status, 200);
    r = await call('POST', '/api/login', { username: 'tester1', password: 'password123' }, { headers: { Origin: 'http://evil.example' } });
    assert.strictEqual(r.status, 403, '다른 사이트에서 온 요청은 거부');
    // 연속 실패 → 잠금
    cookie = '';
    let last; for (let i = 0; i < 9; i++) last = await call('POST', '/api/login', { username: 'tester1', password: 'bad' + i + 'xxxxx' });
    assert.strictEqual(last.status, 429, '실패가 쌓이면 429');
    console.log('✔ 인증 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e.message); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(), 50); }
});
