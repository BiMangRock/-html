// social.js (server) — v136 닉네임 · 친구 API (모두 로그인 필수)
//   GET  /api/friends                      내 프로필 + 친구(접속 상태 포함) + 받은 요청 + 보낸 요청
//   PUT  /api/profile/nickname {nickname}  닉네임 정하기 — v141 닉네임이 아직 없는 계정만, 한 번만 (바꾸기·지우기 없음)
//   POST /api/friends/request {to}         아이디 또는 닉네임으로 친구 요청
//   POST /api/friends/accept  {id}         받은 요청 수락
//   POST /api/friends/decline {id}         받은 요청 거절
//   POST /api/friends/cancel  {id}         보낸 요청 취소
//   POST /api/friends/remove  {id}         친구 삭제 (둘의 대화도 지운다)
//   v141 친구 채팅
//   GET  /api/chat/:id?before=메시지id     친구와의 대화 (최근 50개씩, 오래된 것이 앞)
//   POST /api/chat/send {to, text}         메시지 보내기 → 받는 사람(과 내 다른 탭)에게 스트림으로 {t:'chat', msg, from}
//   POST /api/chat/read {id, upTo?}        친구가 보낸 메시지 읽음 처리 → 보낸 사람에게 {t:'chatRead', by, upTo}
//  접속 상태·실시간 알림은 유저 대전 스트림(pvp-core)을 쓴다 → createSocialRouter({ core })
const express = require('express');
const { requireAuth } = require('./auth');
const F = require('./friends-db');

function makeBucket(max, windowMs) {
  const hits = new Map();
  return key => {
    const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < windowMs);
    if (a.length >= max) { hits.set(key, a); return false; }
    a.push(t); hits.set(key, a); return true;
  };
}

function createSocialRouter({ core, onRename } = {}) {
  const router = express.Router();
  const nickOk = makeBucket(10, 60 * 60 * 1000);        // 닉네임 변경: 1시간에 10번
  const reqOk = makeBucket(30, 10 * 60 * 1000);         // 친구 요청: 10분에 30번
  const actOk = makeBucket(60, 60 * 1000);
  const chatOk = makeBucket(20, 10 * 1000);             // v141 채팅: 10초에 20개
  const chatReadOk = makeBucket(120, 60 * 1000);
  const tooMany = res => res.status(429).json({ error: '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.' });
  const idOf = b => Number.isInteger(b && b.id) ? b.id : Number.isInteger(Number(b && b.id)) ? Number(b.id) : NaN;
  const ping = (uid, why, name) => { if (core) core.notify(uid, { t: 'friends', why, name }); };
  const presence = uid => core ? core.presenceOf(uid) : { online: false, state: 'offline' };
  const ORDER = { match: 0, queue: 1, spectate: 1, idle: 1, offline: 2 };

  router.use(['/friends', '/profile', '/chat'], requireAuth);

  router.get('/friends', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const uid = req.user.id, L = F.listOf(uid), me = F.userRow(uid);
    const friends = L.friends.map(f => ({ ...f, ...presence(f.id) }))
      .sort((a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || a.name.localeCompare(b.name, 'ko'));
    res.json({ me: F.publicUser(me), friends, incoming: L.incoming, outgoing: L.outgoing, max: F.FRIENDS.MAX_FRIENDS });
  });

  router.put('/profile/nickname', (req, res) => {
    if (!nickOk(req.user.id)) return tooMany(res);
    const nick = (req.body || {}).nickname;
    if (typeof nick !== 'string' || !nick.trim()) return res.status(400).json({ error: '닉네임을 입력해 주세요.' });
    const r = F.setNickname(req.user.id, nick.trim());
    if (!r.ok) return res.status(r.locked || r.error.includes('이미') || r.error.includes('같은') ? 409 : 400).json(r);
    const me = F.publicUser(F.userRow(req.user.id));
    if (core) core.rename(req.user.id, me.name);
    if (onRename) onRename(req.user.id);
    for (const fid of F.friendIds(req.user.id)) ping(fid, 'rename', me.name);
    res.json({ ok: true, me });
  });

  router.post('/friends/request', (req, res) => {
    if (!reqOk(req.user.id)) return tooMany(res);
    const r = F.sendRequest(req.user.id, (req.body || {}).to);
    if (!r.ok) return res.status(r.error.includes('없어요') ? 404 : 400).json(r);
    ping(r.user.id, r.status === 'accepted' ? 'accepted' : 'request', req.user.name || req.user.username);
    res.json(r);
  });
  const answer = accept => (req, res) => {
    if (!actOk(req.user.id)) return tooMany(res);
    const id = idOf(req.body); if (!Number.isInteger(id)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = F.answerRequest(req.user.id, id, accept);
    if (!r.ok) return res.status(400).json(r);
    ping(id, accept ? 'accepted' : 'declined', req.user.name || req.user.username);
    res.json(r);
  };
  router.post('/friends/accept', answer(true));
  router.post('/friends/decline', answer(false));
  router.post('/friends/cancel', (req, res) => {
    if (!actOk(req.user.id)) return tooMany(res);
    const id = idOf(req.body); if (!Number.isInteger(id)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = F.cancelRequest(req.user.id, id);
    if (r.ok) ping(id, 'cancelled', req.user.name || req.user.username);
    res.status(r.ok ? 200 : 400).json(r);
  });
  router.post('/friends/remove', (req, res) => {
    if (!actOk(req.user.id)) return tooMany(res);
    const id = idOf(req.body); if (!Number.isInteger(id)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = F.removeFriend(req.user.id, id);
    if (r.ok) ping(id, 'removed', req.user.name || req.user.username);
    res.status(r.ok ? 200 : 400).json(r);
  });
  // ---------- v141 친구 채팅 ----------
  router.get('/chat/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const fid = Number(req.params.id), before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (!Number.isInteger(fid)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = F.chatHistory(req.user.id, fid, before);
    if (!r.ok) return res.status(403).json(r);
    const f = F.userRow(fid);
    res.json({ ...r, friend: F.publicUser(f), me: req.user.id, ...presence(fid) });
  });
  router.post('/chat/send', (req, res) => {
    if (!chatOk(req.user.id)) return res.status(429).json({ error: '메시지를 너무 빨리 보내고 있어요. 잠시 뒤 다시 해 주세요.' });
    const b = req.body || {}, to = Number(b.to);
    const r = F.sendChat(req.user.id, to, b.text);
    if (!r.ok) return res.status(r.error.includes('친구') ? 403 : 400).json(r);
    const from = { id: req.user.id, name: req.user.name || req.user.username };
    if (core) {
      core.notify(to, { t: 'chat', msg: r.msg, from });
      core.notify(req.user.id, { t: 'chat', msg: r.msg, from, mine: true });   // 내 다른 탭·기기에도 보이게
    }
    res.json(r);
  });
  router.post('/chat/read', (req, res) => {
    if (!chatReadOk(req.user.id)) return tooMany(res);
    const b = req.body || {}, fid = idOf(b), upTo = Number.isInteger(Number(b.upTo)) ? Number(b.upTo) : undefined;
    if (!Number.isInteger(fid)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const n = F.markRead(req.user.id, fid, upTo);
    if (n && core) {
      core.notify(fid, { t: 'chatRead', by: req.user.id, upTo: upTo || null });
      core.notify(req.user.id, { t: 'chatRead', self: true, friend: fid });       // 내 다른 탭의 안 읽음 표시도 지운다
    }
    res.json({ ok: true, read: n });
  });
  return router;
}

module.exports = { createSocialRouter };
