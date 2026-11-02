// pvp.js (server) — 유저 대전 API.
//  통신: 서버 → 브라우저는 SSE(서버가 계속 열어 두는 GET 한 줄기), 브라우저 → 서버는 평범한 POST.
//        추가 설치 없이 동작하고, 연결이 끊기면 브라우저(EventSource)가 알아서 다시 붙는다.
//  판 진행·타이머·끊김 처리는 pvp-core.js, 보상·기록은 pvp-db.js.
const express = require('express');
const { requireAuth } = require('./auth');
const { createPvp } = require('./pvp-core');
const pvpdb = require('./pvp-db');
const { areFriends } = require('./friends-db');   // v136 친구 대전 · 관전은 친구끼리만

const MAX_STREAMS_PER_USER = 4;       // 한 계정이 동시에 열 수 있는 탭 수
const HEARTBEAT_MS = 15000;           // 프록시(터널)가 놀고 있는 연결을 끊지 않게 주기적으로 신호

// 계정별 요청 횟수 제한 (행동 도배 방지)
function makeBucket(max, windowMs) {
  const hits = new Map();
  return uid => {
    const t = Date.now(), a = (hits.get(uid) || []).filter(x => t - x < windowMs);
    if (a.length >= max) { hits.set(uid, a); return false; }
    a.push(t); hits.set(uid, a); return true;
  };
}

function makeHandlers(pvp) {
  const actionOk = makeBucket(60, 10000), queueOk = makeBucket(20, 10000);
  const tooMany = res => res.status(429).json({ error: '요청이 너무 빨라요. 잠시 뒤 다시 해 주세요.' });
  return {
    // GET /pvp/stream — 계속 열려 있는 SSE. 접속하면 지금 상태(대기·진행 중인 판)를 먼저 보내 준다
    stream(req, res) {
      const uid = req.user.id;
      const cur = pvp._users.get(uid);
      if (cur && cur.conns.size >= MAX_STREAMS_PER_USER) return res.status(429).json({ error: '연결이 너무 많아요. 다른 탭을 닫아 주세요.' });
      res.status(200);
      res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      if (res.flushHeaders) res.flushHeaders();
      if (req.socket) { if (req.socket.setNoDelay) req.socket.setNoDelay(true); if (req.socket.setTimeout) req.socket.setTimeout(0); }
      res.write('retry: 2000\n\n');                            // 끊기면 2초 뒤 다시 접속
      let closed = false;
      const conn = { send(obj) { if (closed) throw new Error('closed'); res.write('data: ' + JSON.stringify(obj) + '\n\n'); } };
      const hb = setInterval(() => { try { if (!closed) res.write(': ping\n\n'); } catch (_) {} }, HEARTBEAT_MS);
      if (hb.unref) hb.unref();
      const cleanup = () => { if (closed) return; closed = true; clearInterval(hb); pvp.disconnect(uid, conn); };
      req.on('close', cleanup); res.on('error', cleanup);
      pvp.connect(uid, req.user.name || req.user.username, conn);   // v136 닉네임이 있으면 닉네임으로 보인다
    },
    // GET /pvp/status — 페이지를 새로 열었을 때 진행 중인 판이 있는지 (있으면 화면이 스트림을 열어 이어서 한다)
    status(req, res) { res.set('Cache-Control', 'no-store'); res.json({ state: pvp.stateOf(req.user.id) }); },
    // POST /pvp/queue · /pvp/cancel
    queue(req, res) { if (!queueOk(req.user.id)) return tooMany(res); const r = pvp.queueJoin(req.user.id, (req.body || {}).mode, (req.body || {}).heroPower); res.status(r.ok ? 200 : 400).json(r); },   // v127 {mode:'normal'|'rank'}
    cancel(req, res) { const r = pvp.queueCancel(req.user.id); res.status(r.ok ? 200 : 400).json(r); },
    // POST /pvp/mulligan {matchId, ids}
    mulligan(req, res) {
      if (!actionOk(req.user.id)) return tooMany(res);
      const b = req.body || {}; const r = pvp.mulligan(req.user.id, String(b.matchId || ''), b.ids);
      res.status(r.ok ? 200 : 400).json(r);
    },
    // POST /pvp/emote {matchId, id}   v132 감정 표현
    emote(req, res) {
      if (!actionOk(req.user.id)) return tooMany(res);
      const b = req.body || {}; const r = pvp.emote(req.user.id, String(b.matchId || ''), String(b.id || ''));
      res.status(r.ok ? 200 : 400).json(r);
    },
    // v136 POST /pvp/invite {to, heroPower} · /pvp/invite/respond {id, accept, heroPower} · /pvp/invite/cancel
    invite(req, res) {
      if (!queueOk(req.user.id)) return tooMany(res);
      const b = req.body || {}, to = Number(b.to);
      if (!Number.isInteger(to) || !areFriends(req.user.id, to)) return res.status(400).json({ ok: false, error: '친구에게만 대전을 신청할 수 있어요.' });
      const r = pvp.invite(req.user.id, to, b.heroPower); res.status(r.ok ? 200 : 400).json(r);
    },
    inviteRespond(req, res) {
      if (!queueOk(req.user.id)) return tooMany(res);
      const b = req.body || {}; const r = pvp.respond(req.user.id, String(b.id || ''), !!b.accept, b.heroPower);
      res.status(r.ok ? 200 : 400).json(r);
    },
    inviteCancel(req, res) { const r = pvp.inviteCancel(req.user.id); res.status(r.ok ? 200 : 400).json(r); },
    // v136 POST /pvp/spectate {friendId} · /pvp/spectate/leave
    spectate(req, res) {
      if (!queueOk(req.user.id)) return tooMany(res);
      const fid = Number((req.body || {}).friendId);
      if (!Number.isInteger(fid) || !areFriends(req.user.id, fid)) return res.status(400).json({ ok: false, error: '친구의 판만 관전할 수 있어요.' });
      const r = pvp.spectate(req.user.id, fid); res.status(r.ok ? 200 : 400).json(r);
    },
    spectateLeave(req, res) { res.json(pvp.spectateLeave(req.user.id)); },
    // POST /pvp/action {matchId, seq, action}   (결과 화면은 스트림으로 온다. 여기서는 접수 여부만)
    action(req, res) {
      if (!actionOk(req.user.id)) return tooMany(res);
      const b = req.body || {}; const r = pvp.action(req.user.id, String(b.matchId || ''), b.seq, b.action);
      res.status(r.ok ? 200 : r.stale ? 409 : 400).json(r);
    },
  };
}

const { PVP } = require(require('path').join(__dirname, '..', 'public', 'js', 'pvp.js'));   // v147
const core = createPvp({ cfg: { introMs: PVP.INTRO_MS }, loadDeck: pvpdb.loadDeck, settle: pvpdb.settle, statsOf: pvpdb.statsOf, log: (...a) => console.log('[pvp]', ...a) });
const h = makeHandlers(core);
const router = express.Router();
router.use('/pvp', requireAuth);
router.get('/pvp/stream', h.stream);
router.get('/pvp/status', h.status);
router.post('/pvp/emote', h.emote);
router.post('/pvp/queue', h.queue);
router.post('/pvp/cancel', h.cancel);
router.post('/pvp/mulligan', h.mulligan);
router.post('/pvp/action', h.action);
router.post('/pvp/invite', h.invite);
router.post('/pvp/invite/respond', h.inviteRespond);
router.post('/pvp/invite/cancel', h.inviteCancel);
router.post('/pvp/spectate', h.spectate);
router.post('/pvp/spectate/leave', h.spectateLeave);
// v137 리플레이: 내 지난 판 목록 · 하나 불러오기 (브라우저가 시드와 행동 목록으로 판을 다시 만들어 보여 준다)
router.get('/pvp/replays', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ list: pvpdb.replayList(req.user.id) }); });
router.get('/pvp/replays/:id', (req, res) => {
  const r = /^[0-9a-f]{1,32}$/.test(req.params.id) ? pvpdb.replayGet(req.user.id, req.params.id) : null;
  if (!r) return res.status(404).json({ error: '리플레이가 없어요. (계정마다 최근 판만 보관해요)' });
  res.set('Cache-Control', 'private, max-age=3600'); res.json(r);
});
router.get('/pvp/ranking', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ...pvpdb.ranking(100), board: pvpdb.publicBoard({ limit: 100 }), me: pvpdb.rankOut(req.user.id), myRow: pvpdb.myBoardRow(req.user.id) }); });   // v127 순위표 (v128 전체 순위 + 내 순위)
// v128 공개 순위 (로그인 없이): GET /api/public/ranking?offset=0&limit=50&q=이름
const publicRouter = express.Router();
const publicOk = makeBucket(60, 60000);
publicRouter.get('/public/ranking', (req, res) => {
  const ip = req.ip || 'x'; if (!publicOk(ip)) return res.status(429).json({ error: '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.' });
  res.set('Cache-Control', 'public, max-age=5');
  res.json(pvpdb.publicBoard({ offset: req.query.offset, limit: req.query.limit, q: req.query.q }));
});

module.exports = { router, publicRouter, core, makeHandlers };
