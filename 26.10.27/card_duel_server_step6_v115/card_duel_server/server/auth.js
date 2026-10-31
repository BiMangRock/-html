// auth.js — 회원가입 / 로그인 / 로그아웃 / 내 정보
//  - 비밀번호: Node 내장 crypto.scrypt 로 해시 (외부 라이브러리 불필요), 비교는 timingSafeEqual
//  - 세션: 랜덤 토큰을 httpOnly 쿠키로 주고, DB에는 토큰의 sha256 만 저장
//  - 무차별 대입 방지: IP / 아이디 단위 실패 횟수 제한 (메모리, 서버 재시작 시 초기화)
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const COOKIE_NAME = 'cd_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;           // 30일
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ---------- 입력 검증 ----------
const USERNAME_RE = /^[A-Za-z0-9_가-힣]{3,16}$/;
function validateCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return '아이디는 3~16자의 한글·영문·숫자·밑줄(_)만 쓸 수 있어요.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return '비밀번호는 8~72자여야 해요.';
  if (password.toLowerCase() === username.toLowerCase())
    return '비밀번호를 아이디와 다르게 정해 주세요.';
  return null;
}

// ---------- 비밀번호 해시 ----------
function scryptAsync(password, salt, opts) {
  return new Promise((res, rej) => crypto.scrypt(password, salt, opts.keylen,
    { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(keyB64, 'base64');
  const got = await scryptAsync(password, Buffer.from(saltB64, 'base64'), { N: +N, r: +r, p: +p, keylen: want.length });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
// 없는 아이디로 로그인해도 같은 시간이 걸리게 하는 더미 해시 (아이디 존재 여부 노출 방지)
let DUMMY_HASH = null;
hashPassword('dummy-password-for-timing').then(h => { DUMMY_HASH = h; });

// ---------- 세션 ----------
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), userId, now, now + SESSION_MS);
  return token;
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
                          WHERE s.token_hash=?`).get(sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username };
}
function setCookie(req, res, token) {
  const secure = process.env.COOKIE_SECURE === '1' || req.secure;      // https(터널/프록시) 뒤에서는 Secure
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_MS, path: '/' });
}
function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

// ---------- 시도 횟수 제한 ----------
function makeLimiter(max, windowMs) {
  const hits = new Map();   // key -> [timestamps]
  return {
    blocked(key) {
      const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < windowMs);
      hits.set(key, a); return a.length >= max;
    },
    add(key) { const a = hits.get(key) || []; a.push(Date.now()); hits.set(key, a); },
    clear(key) { hits.delete(key); },
    sweep() { const now = Date.now(); for (const [k, a] of hits) { const f = a.filter(t => now - t < windowMs); f.length ? hits.set(k, f) : hits.delete(k); } },
  };
}
const loginFailIp   = makeLimiter(30, 10 * 60 * 1000);   // IP당 10분에 30번 실패까지
const loginFailUser = makeLimiter(8,  10 * 60 * 1000);   // 아이디당 10분에 8번 실패까지
const signupByIp    = makeLimiter(10, 60 * 60 * 1000);   // IP당 1시간에 가입 10번까지
setInterval(() => { loginFailIp.sweep(); loginFailUser.sweep(); signupByIp.sweep(); purgeExpiredSessions(); }, 10 * 60 * 1000).unref();

// ---------- 라우터 ----------
const router = express.Router();

// CSRF 1차 방어: 상태를 바꾸는 요청은 JSON 이어야 하고, Origin 이 있으면 같은 호스트여야 한다
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: '허용되지 않은 요청이에요.' }); } catch { return res.status(403).json({ error: '허용되지 않은 요청이에요.' }); } }
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON 요청만 받아요.' });
  next();
});

router.post('/signup', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const bad = validateCredentials(username, password);
    if (bad) return res.status(400).json({ error: bad });
    if (signupByIp.blocked(req.ip)) return res.status(429).json({ error: '가입 시도가 너무 많아요. 잠시 후 다시 해 주세요.' });
    signupByIp.add(req.ip);
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username))
      return res.status(409).json({ error: '이미 사용 중인 아이디예요.' });
    const pw_hash = await hashPassword(password);
    let id;
    try {
      id = db.prepare('INSERT INTO users(username,pw_hash,created_at,last_login) VALUES (?,?,?,?)')
        .run(username, pw_hash, Date.now(), Date.now()).lastInsertRowid;
    } catch (e) {                                          // 동시에 같은 아이디로 가입한 경우
      if (/UNIQUE constraint|constraint failed/i.test(String(e.message))) return res.status(409).json({ error: '이미 사용 중인 아이디예요.' });
      throw e;
    }
    setCookie(req, res, createSession(Number(id)));
    res.status(201).json({ user: { id: Number(id), username } });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200)
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
    const uKey = username.toLowerCase();
    if (loginFailIp.blocked(req.ip) || loginFailUser.blocked(uKey))
      return res.status(429).json({ error: '로그인 실패가 너무 많아요. 10분 뒤에 다시 시도해 주세요.' });
    const row = db.prepare('SELECT id, username, pw_hash FROM users WHERE username=?').get(username);
    const ok = await verifyPassword(password, row ? row.pw_hash : (DUMMY_HASH || 'x$x$x$x$x$x'));
    if (!row || !ok) {
      loginFailIp.add(req.ip); loginFailUser.add(uKey);
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않아요.' });
    }
    loginFailUser.clear(uKey);
    db.prepare('UPDATE users SET last_login=? WHERE id=?').run(Date.now(), row.id);
    setCookie(req, res, createSession(row.id));
    res.json({ user: { id: row.id, username: row.username } });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요해요.' });
  res.json({ user });
});

// 다른 라우트에서 로그인 필수로 쓰는 미들웨어 (3단계부터 사용)
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: '로그인이 필요해요.' });
  req.user = user; next();
}

module.exports = { router, requireAuth, getSessionUser, validateCredentials, hashPassword, verifyPassword };
