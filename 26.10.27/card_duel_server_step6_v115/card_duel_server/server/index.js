// index.js — 서버 시작점
//   npm start  →  http://localhost:3000
const path = require('path');
const fs = require('fs');
const express = require('express');
const auth = require('./auth');
const saves = require('./saves');
const shop = require('./shop');
const pvp = require('./pvp');
require('./db');                                         // DB 연결·테이블 생성

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';            // 같은 와이파이의 다른 기기에서 접속하려면 HOST=0.0.0.0
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const IMAGES = path.join(ROOT, 'images');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY);  // 터널/프록시 뒤에서 실제 IP·https 인식
app.use('/api/bosses', express.json({ limit: '1mb' }));      // 보스 목록은 덱이 여러 개라 크다 (개발자 전용 저장 경로만 크게 허용)
app.use(express.json({ limit: '20kb' }));

// 기본 보안 헤더
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', auth.router);
app.use('/api', saves.router);
app.use('/api', require('./bosses').router);           // v116: 보스 목록 (읽기: 로그인 / 쓰기: 개발자)
app.use('/api', shop.router);
app.use('/api', pvp.router);                             // 유저 대전: /api/pvp/stream(SSE) · queue · cancel · mulligan · action · status
app.use('/api', (req, res) => res.status(404).json({ error: '없는 API예요.' }));

// 게임 화면은 로그인한 사람만. 아니면 로그인 화면으로.
const sendIndex = (req, res) => auth.getSessionUser(req) ? res.sendFile(path.join(PUBLIC, 'index.html')) : res.redirect('/login.html');
app.get(['/', '/index.html'], (req, res) => { res.set('Cache-Control', 'no-store'); sendIndex(req, res); });

app.use('/images', express.static(IMAGES, { maxAge: '7d' }));
app.use(express.static(PUBLIC, { index: false, maxAge: 0, etag: true }));

app.use((err, req, res, next) => {                       // 마지막 안전망
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? '잘못된 요청이에요.' : '서버 오류가 났어요.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`카드 결투 서버: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!fs.existsSync(IMAGES)) console.warn('⚠ images/ 폴더가 없어요. 기존 프로젝트의 images 폴더를 이 폴더(프로젝트 루트)에 복사해 주세요.');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { pvp.core.shutdown(); } catch (_) {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); });
