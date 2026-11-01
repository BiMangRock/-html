// pvp-core.js (server) — 유저 대전의 심장: 대기열 · 판 진행 · 멀리건 · 턴 제한 시간 · 연결 끊김 · 정산 호출.
//  express·DB 를 직접 모른다 (연결은 conn.send(obj), DB 는 loadDeck/settle/statsOf 로 받는다). 그래서 테스트에서 그대로 돌릴 수 있다.
//
//  원칙: 판의 진짜 상태(손패·덱 순서·난수)는 서버만 갖는다.
//   - 클라이언트는 "행동"만 보낸다 → 서버가 엔진(apply)으로 검증하고 적용한다.
//   - 클라이언트는 자기 시점의 화면(viewFor)과, 상대의 비공개 정보를 가린 이벤트만 받는다.
//   - 시간·승패·보상은 전부 서버가 정한다.
//
//  클라이언트로 가는 메시지 (conn.send):
//    {t:'status', state:'idle'|'queue'|'match', mode:'normal'|'rank', waiting, waitingRank, record, winGold, rewardsToday, rank, cfg}   (v127 랭크전: 대기열이 따로)
//    {t:'match', matchId, seat, phase:'mulligan'|'play'|'over', seq, opp:{name,online}, mulligan:{...}, view, events, remainMs, turnMs, result?}
//    {t:'presence', matchId, oppOnline, oppOfflineMs}     상대 연결 상태가 바뀜
//    {t:'error', error}
//   v136 친구 대전 · 관전
//    {t:'invite', id, from:{id,name}, remainMs}           친구가 대전을 신청함 (받은 사람)
//    {t:'inviteSent', id, to:{id,name}, remainMs}         내가 보낸 신청 (기다리는 중)
//    {t:'inviteGone', id, why, name}                      신청이 사라짐: declined | cancelled | expired | busy | offline | accepted
//    {t:'match', spectate:true, …}                        관전 화면 (양쪽 손패는 장수만, 선택지·덱 구성은 안 보냄)
//    {t:'friends', why, name}                             친구 목록이 바뀜 (요청·수락 등) → 화면이 목록을 다시 불러온다
const path = require('path');
const crypto = require('crypto');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP, pvpRng } = require(path.join(JS, 'pvp.js'));
const { PROGRESS } = require(path.join(JS, 'progress.js'));   // v132 감정 표현 목록
const EMOTE_IDS = PROGRESS.EMOTES.map(e => e.id);

const ALLOWED = new Set(['PLAY_CARD', 'ATTACK', 'HERO_ATTACK', 'HERO_POWER', 'END_TURN', 'TARGET', 'CHOOSE', 'SURRENDER']);   // v131 HERO_POWER
const cryptoRng = () => crypto.randomInt(0, 2 ** 30) / 2 ** 30;

// 클라이언트가 보낸 행동에서 엔진이 아는 필드만 골라낸다 (이상한 값·큰 객체를 엔진에 넘기지 않는다)
function cleanAction(a) {
  if (!a || typeof a !== 'object' || !ALLOWED.has(a.type)) return null;
  const c = { type: a.type };
  for (const k of ['cardId', 'attackerId', 'index', 'pos']) {   // pos: v129 하수인을 놓을 자리
    if (a[k] !== undefined) { if (!Number.isInteger(a[k])) return null; c[k] = a[k]; }
  }
  if (a.target !== undefined && a.target !== null) {
    const t = a.target;
    if (typeof t !== 'object' || typeof t.kind !== 'string' || t.kind.length > 12 || !Number.isInteger(t.seat)) return null;
    c.target = { kind: t.kind, seat: t.seat };
    if (t.id !== undefined) { if (!Number.isInteger(t.id)) return null; c.target.id = t.id; }
  }
  return c;
}

// 상대에게 보여 주면 안 되는 이벤트 정보를 가린다 (손에 들어온 카드 이름 · 상대 손패 내용)
function scrubEvents(events, viewer) {
  const evs = structuredClone(events);
  for (const ev of evs) {
    if (ev.type === 'board' && Array.isArray(ev.seats)) {               // 혼돈의 주문서 중간 상태: 상대 손패는 장수만
      ev.seats.forEach((sn, i) => { if (i !== viewer && sn && Array.isArray(sn.hand)) sn.hand = sn.hand.map(() => ({})); });
    } else if (ev.seat !== undefined && ev.seat !== viewer) {
      if ((ev.type === 'generated' && !ev.returned && !ev.burned) || (ev.type === 'discoverPick' && !ev.burned)) { ev.name = '카드'; delete ev.cost; delete ev.card; }
      else if (ev.type === 'copy' || ev.type === 'deckAdd') { if (ev.name !== undefined) ev.name = '카드'; }
    }
  }
  return evs;
}

function createPvp(opts = {}) {
  const cfg = {
    turnMs: PVP.TURN_MS, mulliganMs: PVP.MULLIGAN_MS, reconnectMs: PVP.RECONNECT_MS,
    maxTimeouts: PVP.MAX_TIMEOUTS, maxTurns: PVP.MAX_TURNS,
    graceMs: 4000,                      // 이벤트가 많은 턴(연출이 긴 턴)에 붙여 주는 여유 시간 상한
    queueGraceMs: 10000,                // 대기 중 연결이 끊겨도 이만큼은 자리를 지켜 준다 (새로고침·재접속 대비)
    queueMaxMs: 10 * 60 * 1000,         // 이 시간 동안 상대가 안 나타나면 대기 취소
    inviteMs: PVP.INVITE_MS || 30000,   // v136 친구 대전 신청이 유효한 시간
    maxSpectators: PVP.MAX_SPECTATORS || 10,   // v136 한 판을 동시에 관전할 수 있는 사람 수
    tickMs: 250,
    ...(opts.cfg || {}),
  };
  const log = opts.log || (() => {});
  const rng = opts.rng || cryptoRng;
  const { loadDeck, settle } = opts;
  const statsOf = opts.statsOf || (() => ({}));
  if (typeof loadDeck !== 'function' || typeof settle !== 'function') throw new Error('createPvp: loadDeck/settle 필요');

  const users = new Map();     // uid → {uid, username, conns:Set, matchId, queued, queuedAt, goneAt, unseen}
  const matches = new Map();   // matchId → 진행 중인 판
  let queue = [];              // 대기 중인 uid (먼저 온 순서)
  const invites = new Map();   // v136 inviteId → {id, from, to, at, until, power}

  // ---------- 사용자 ----------
  function getUser(uid, username) {
    let u = users.get(uid);
    if (!u) { u = { uid, username: username || ('user' + uid), conns: new Set(), matchId: null, queued: false, qmode: 'normal', queuedAt: 0, goneAt: null, unseen: null, spectating: null }; users.set(uid, u); }
    else if (username) u.username = username;
    return u;
  }
  function gc(u) { if (u && !u.conns.size && !u.matchId && !u.queued && !u.unseen && !u.spectating && !invitesOf(u.uid).length) users.delete(u.uid); }
  const stateOf = uid => { const u = users.get(uid); return u && u.matchId ? 'match' : u && u.queued ? 'queue' : 'idle'; };
  function sendTo(u, msg) {
    for (const c of [...u.conns]) { try { c.send(msg); } catch (_) { dropConn(u, c); } }
  }
  function statusMsg(u) {
    let st = {}; try { st = statsOf(u.uid) || {}; } catch (e) { log('statsOf 실패', e && e.message); }
    const waitingOf = md => queue.filter(id => { const x = users.get(id); return x && x.qmode === md; }).length;
    return { t: 'status', state: stateOf(u.uid), mode: u.qmode, waiting: waitingOf('normal'), waitingRank: waitingOf('rank'), spectating: u.spectating || null, ...st,
      cfg: { turnMs: cfg.turnMs, mulliganMs: cfg.mulliganMs, reconnectMs: cfg.reconnectMs, maxTimeouts: cfg.maxTimeouts } };
  }
  const pushStatus = u => sendTo(u, statusMsg(u));

  // ---------- 연결 ----------
  function connect(uid, username, conn) {
    const u = getUser(uid, username);
    u.conns.add(conn); u.goneAt = null;
    try { conn.send(statusMsg(u)); } catch (_) { dropConn(u, conn); return; }
    const m = u.matchId && matches.get(u.matchId);
    if (m && !m.over) {
      const seat = m.uids.indexOf(uid);
      if (m.offline[seat] != null) { m.offline[seat] = null; presence(m, 1 - seat); }
      try { conn.send(matchMsg(m, seat)); } catch (_) { dropConn(u, conn); }
    } else if (u.unseen) {                      // 연결이 없는 사이에 판이 끝났다면 결과를 한 번 보여 준다
      const msg = u.unseen; u.unseen = null;
      try { conn.send(msg); } catch (_) {}
    } else if (u.spectating) {                  // v136 관전 중이었으면 이어서 본다
      const sm = matches.get(u.spectating);
      if (sm && !sm.over && sm.spectators.has(uid)) { try { conn.send(specMsg(sm, uid)); } catch (_) {} } else u.spectating = null;
    }
    for (const iv of invitesOf(uid)) { try { conn.send(inviteMsgFor(iv, uid)); } catch (_) {} }   // v136 기다리는 친구 대전 신청
  }
  function dropConn(u, conn) {
    if (!u.conns.delete(conn)) return;
    if (u.conns.size) return;
    u.goneAt = Date.now();
    const m = u.matchId && matches.get(u.matchId);
    if (m && !m.over) {
      const seat = m.uids.indexOf(u.uid);
      if (m.offline[seat] == null) { m.offline[seat] = Date.now(); presence(m, 1 - seat); }
    }
    gc(u);
  }
  function disconnect(uid, conn) { const u = users.get(uid); if (u) dropConn(u, conn); }
  function presence(m, toSeat) {           // toSeat 에게 상대(1-toSeat)의 연결 상태를 알린다
    const u = users.get(m.uids[toSeat]); if (!u) return;
    const off = m.offline[1 - toSeat];
    sendTo(u, { t: 'presence', matchId: m.id, oppOnline: off == null, oppOfflineMs: off == null ? 0 : Date.now() - off, reconnectMs: cfg.reconnectMs });
  }

  // ---------- 대기열 ----------
  function queueJoin(uid, mode, heroPower) {
    const u = users.get(uid); const md = mode === 'rank' ? 'rank' : 'normal';   // v127 일반전 / 랭크전
    if (u) u.qpower = E.HERO_POWERS[heroPower] ? heroPower : null;            // v131 고른 영웅 능력 (없거나 잘못되면 판 시작 때 무작위)
    if (!u || !u.conns.size) return { ok: false, error: '서버와 연결되어 있지 않아요. 화면을 새로고침해 주세요.' };
    if (u.matchId) return { ok: false, error: '이미 대전 중이에요.' };
    if (u.queued && u.qmode === md) return { ok: true, already: true };
    stopSpectating(u);                                                // v136 관전 중이면 그만 본다
    for (const iv of invitesOf(uid)) if (iv.from === uid) dropInvite(iv, 'cancelled');   // v136 내가 보낸 친구 대전 신청은 취소
    if (u.queued) leaveQueue(u);                                   // 다른 대기열에 있었으면 옮긴다 (랭크전 → 일반전 전환)
    u.queued = true; u.qmode = md; u.queuedAt = Date.now(); queue.push(uid);
    pump();
    pushAllQueued();
    return { ok: true };
  }
  function queueCancel(uid) {
    const u = users.get(uid);
    if (!u || !u.queued) return { ok: false, error: '대기 중이 아니에요.' };
    leaveQueue(u); pushStatus(u); pushAllQueued(); gc(u);
    return { ok: true };
  }
  function leaveQueue(u) { u.queued = false; queue = queue.filter(x => x !== u.uid); }
  function pushAllQueued() { for (const uid of queue) { const u = users.get(uid); if (u) pushStatus(u); } }
  function pump() {
    for (;;) {
      queue = queue.filter(uid => { const u = users.get(uid); return u && u.queued && !u.matchId; });
      let pair = null;
      for (const md of ['normal', 'rank']) {                        // v127 같은 대기열끼리만 (랭크전은 등급·승률 상관없이 먼저 온 순서)
        const ready = queue.filter(uid => { const x = users.get(uid); return x.conns.size > 0 && x.qmode === md; });
        if (ready.length >= 2) { pair = [ready[0], ready[1], md]; break; }
      }
      if (!pair) return;
      const [a, b, md] = pair;
      leaveQueue(users.get(a)); leaveQueue(users.get(b));
      startMatch(a, b, md);
    }
  }

  // ---------- 판 시작 ----------
  function startMatch(a, b, mode) {
    const order = rng() < 0.5 ? [a, b] : [b, a];            // 좌석 배정 (선공은 엔진이 따로 무작위로 정한다)
    let decks;
    try { decks = order.map(uid => loadDeck(uid)); }
    catch (e) {
      log('덱 불러오기 실패', e && e.message);
      for (const uid of order) { const u = users.get(uid); if (u) { sendTo(u, { t: 'error', error: '덱을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.' }); pushStatus(u); } }
      return;
    }
    for (const uid of order) { const u = users.get(uid); if (u) { if (u.queued) leaveQueue(u); stopSpectating(u); } for (const iv of invitesOf(uid)) dropInvite(iv, 'busy'); }   // v136 대기열·관전·다른 신청 정리
    const heroPowers = order.map(uid => { const u = users.get(uid); return (u && u.qpower) || E.randomHeroPower(rng); });   // v131
    const seed = 1 + Math.floor(rng() * 2147483645);                   // v137 리플레이용: 판 시작 난수를 시드로
    const state = E.newGame(pvpRng(seed), { decks, heroPowers });
    const now = Date.now();
    const m = {
      id: crypto.randomBytes(8).toString('hex'), ranked: mode === 'rank', friendly: mode === 'friend', spectators: new Map(), uids: order, names: order.map(uid => users.get(uid).username),
      state, decks, seq: 0, phase: 'mulligan', over: false, startedAt: now,
      mull: [0, 1].map(s => ({ done: !(state.seats[s].startIds || []).length })), mullUntil: now + cfg.mulliganMs,
      deadline: null, timeouts: [0, 0], offline: [null, null], result: null,
      log: { v: 1, engine: E.VERSION, seed, decks: decks.map(d => d.slice()), heroPowers: heroPowers.slice(), names: order.map(uid => users.get(uid).username), ranked: mode === 'rank', friendly: mode === 'friend', steps: [] },   // v137 리플레이 기록
    };
    matches.set(m.id, m);
    for (const uid of order) { const u = users.get(uid); u.matchId = m.id; u.queued = false; }
    log('판 시작', m.id, m.friendly ? '[친구]' : m.ranked ? '[랭크]' : '[일반]', m.names.join(' vs '));
    if (m.mull[0].done && m.mull[1].done) beginPlay(m); else broadcast(m);
  }
  function beginPlay(m) {
    m.phase = 'play'; m.deadline = Date.now() + cfg.turnMs + cfg.graceMs;
    broadcast(m);
  }

  // ---------- 메시지 만들기 ----------
  function matchMsg(m, seat, extra) {
    const opp = 1 - seat, st = m.state, now = Date.now();
    return {
      t: 'match', matchId: m.id, seat, ranked: !!m.ranked, friendly: !!m.friendly, spectators: m.spectators.size, phase: m.over ? 'over' : m.phase, seq: m.seq,
      opp: { name: m.names[opp], online: m.offline[opp] == null }, oppOfflineMs: m.offline[opp] == null ? 0 : now - m.offline[opp],
      mulligan: { done: m.mull[seat].done, oppDone: m.mull[opp].done, startIds: m.mull[seat].done ? [] : (st.seats[seat].startIds || []), remainMs: m.phase === 'mulligan' ? Math.max(0, m.mullUntil - now) : 0 },
      turnMs: cfg.turnMs, remainMs: (m.phase === 'play' && !m.over) ? Math.max(0, m.deadline - now) : 0, turnSeat: st.turn,
      timeouts: m.timeouts[seat], maxTimeouts: cfg.maxTimeouts,
      deck: m.decks[seat],                                        // 내 덱 구성 ("덱 보기" 창용). 상대 덱은 보내지 않는다
      view: E.viewFor(st, seat), events: [], ...extra,
    };
  }
  function broadcast(m, events, extra) {
    for (let seat = 0; seat < 2; seat++) {
      const u = users.get(m.uids[seat]); if (!u) continue;
      sendTo(u, matchMsg(m, seat, { events: events ? scrubEvents(events, seat) : [], ...(extra || {}) }));
    }
    if (m.spectators.size) {                                       // v136 관전자: 양쪽 비공개 정보를 모두 가린 이벤트
      const sev = events ? scrubEvents(events, -1) : [];
      for (const sid of m.spectators.keys()) { const u = users.get(sid); if (u) sendTo(u, specMsg(m, sid, { events: sev, ...(extra || {}) })); }
    }
  }
  // ---------- v136 관전 ----------
  // 관전자 화면: 친구 쪽 좌석의 시점이지만 손패는 장수만, 덱 구성·선택지·할 수 있는 행동은 빼고 보낸다 (훈수로 상대 손패가 새지 않게 양쪽 모두 가림)
  function specView(st, seat) {
    const v = E.viewFor(st, seat);
    v.me.handCount = v.me.hand.length; v.me.hand = []; delete v.me.deckCards;
    v.legal = [];
    if (v.pending) v.pending = { kind: v.pending.kind, seat: v.pending.seat };
    v.spectate = true;
    return v;
  }
  function specMsg(m, uid, extra) {
    const seat = m.spectators.get(uid) ?? 0, st = m.state, now = Date.now();
    return {
      t: 'match', spectate: true, matchId: m.id, seat, ranked: !!m.ranked, friendly: !!m.friendly, spectators: m.spectators.size,
      phase: m.over ? 'over' : m.phase, seq: m.seq, names: m.names.slice(),
      opp: { name: m.names[1 - seat], online: m.offline[1 - seat] == null }, me: { name: m.names[seat], online: m.offline[seat] == null }, oppOfflineMs: 0,
      mulligan: { done: true, oppDone: m.mull[1 - seat].done, startIds: [], remainMs: m.phase === 'mulligan' ? Math.max(0, m.mullUntil - now) : 0 },
      turnMs: cfg.turnMs, remainMs: (m.phase === 'play' && !m.over) ? Math.max(0, m.deadline - now) : 0, turnSeat: st.turn,
      timeouts: 0, maxTimeouts: cfg.maxTimeouts,
      view: specView(st, seat), events: [], ...extra,
    };
  }
  function stopSpectating(u) {
    if (!u || !u.spectating) return;
    const m = matches.get(u.spectating); u.spectating = null;
    if (m && m.spectators.delete(u.uid)) pushSpecCount(m);
  }
  function pushSpecCount(m) { for (const uid of m.uids) { const u = users.get(uid); if (u) sendTo(u, { t: 'spectators', matchId: m.id, count: m.spectators.size }); } }
  // targetUid 가 하고 있는 판을 본다 (친구인지는 부르는 쪽이 확인한다)
  function spectate(uid, targetUid) {
    const u = users.get(uid);
    if (!u || !u.conns.size) return { ok: false, error: '서버와 연결되어 있지 않아요. 화면을 새로고침해 주세요.' };
    if (u.matchId) return { ok: false, error: '대전 중에는 관전할 수 없어요.' };
    const t = users.get(targetUid), m = t && t.matchId && matches.get(t.matchId);
    if (!m || m.over) return { ok: false, error: '친구가 지금 대전 중이 아니에요.' };
    if (m.uids.includes(uid)) return { ok: false, error: '내가 하는 판이에요.' };
    if (!m.spectators.has(uid) && m.spectators.size >= cfg.maxSpectators) return { ok: false, error: `이 판은 관전 인원이 가득 찼어요 (최대 ${cfg.maxSpectators}명).` };
    if (u.queued) { leaveQueue(u); pushStatus(u); pushAllQueued(); }
    if (u.spectating && u.spectating !== m.id) stopSpectating(u);
    u.spectating = m.id; m.spectators.set(uid, m.uids.indexOf(targetUid));
    sendTo(u, specMsg(m, uid)); pushSpecCount(m);
    return { ok: true, matchId: m.id };
  }
  function spectateLeave(uid) {
    const u = users.get(uid); if (!u || !u.spectating) return { ok: true };
    stopSpectating(u); pushStatus(u); gc(u);
    return { ok: true };
  }

  // ---------- v136 친구 대전 신청 ----------
  const invitesOf = uid => [...invites.values()].filter(iv => iv.from === uid || iv.to === uid);
  const nameOf = uid => { const u = users.get(uid); return u ? u.username : ''; };
  function inviteMsgFor(iv, uid) {
    const remainMs = Math.max(0, iv.until - Date.now());
    return iv.to === uid ? { t: 'invite', id: iv.id, from: { id: iv.from, name: nameOf(iv.from) }, remainMs }
                         : { t: 'inviteSent', id: iv.id, to: { id: iv.to, name: nameOf(iv.to) }, remainMs };
  }
  function dropInvite(iv, why) {
    if (!invites.delete(iv.id)) return;
    for (const uid of [iv.from, iv.to]) {
      const u = users.get(uid); if (!u) continue;
      sendTo(u, { t: 'inviteGone', id: iv.id, why, name: nameOf(uid === iv.from ? iv.to : iv.from), mine: uid === iv.from });
    }
    for (const uid of [iv.from, iv.to]) gc(users.get(uid));
  }
  // 친구에게 대전 신청 (친구인지는 부르는 쪽이 확인한다). 상대가 이미 나에게 신청했으면 바로 시작
  function invite(from, to, heroPower) {
    const u = users.get(from), t = users.get(to);
    if (!u || !u.conns.size) return { ok: false, error: '서버와 연결되어 있지 않아요. 화면을 새로고침해 주세요.' };
    if (from === to) return { ok: false, error: '나 자신과는 대전할 수 없어요.' };
    if (u.matchId) return { ok: false, error: '이미 대전 중이에요.' };
    if (!t || !t.conns.size) return { ok: false, error: '친구가 지금 접속해 있지 않아요.' };
    if (t.matchId) return { ok: false, error: '친구가 지금 대전 중이에요. 관전은 할 수 있어요.' };
    u.qpower = E.HERO_POWERS[heroPower] ? heroPower : null;
    const back = [...invites.values()].find(iv => iv.from === to && iv.to === from);
    if (back) return respond(from, back.id, true, heroPower);
    for (const iv of invitesOf(from)) if (iv.from === from) dropInvite(iv, 'cancelled');   // 신청은 한 번에 한 명에게만
    if (u.queued) { leaveQueue(u); pushStatus(u); pushAllQueued(); }
    const now = Date.now(), iv = { id: crypto.randomBytes(6).toString('hex'), from, to, at: now, until: now + cfg.inviteMs, power: u.qpower };
    invites.set(iv.id, iv);
    sendTo(t, inviteMsgFor(iv, to)); sendTo(u, inviteMsgFor(iv, from));
    return { ok: true, id: iv.id, remainMs: cfg.inviteMs };
  }
  function respond(uid, id, accept, heroPower) {
    const iv = invites.get(String(id || ''));
    if (!iv || iv.to !== uid) return { ok: false, error: '이미 끝났거나 없는 신청이에요.' };
    if (!accept) { dropInvite(iv, 'declined'); return { ok: true }; }
    const a = users.get(iv.from), b = users.get(iv.to);
    if (!b || !b.conns.size) return { ok: false, error: '서버와 연결되어 있지 않아요. 화면을 새로고침해 주세요.' };
    if (b.matchId) return { ok: false, error: '이미 대전 중이에요.' };
    if (!a || !a.conns.size || a.matchId) { dropInvite(iv, a && a.matchId ? 'busy' : 'offline'); return { ok: false, error: '친구가 지금 대전을 시작할 수 없어요.' }; }
    b.qpower = E.HERO_POWERS[heroPower] ? heroPower : null; a.qpower = iv.power;
    dropInvite(iv, 'accepted');
    startMatch(iv.from, iv.to, 'friend');
    pushAllQueued();
    return { ok: true };
  }
  function inviteCancel(uid) {
    let n = 0; for (const iv of invitesOf(uid)) if (iv.from === uid) { dropInvite(iv, 'cancelled'); n++; }
    return n ? { ok: true } : { ok: false, error: '보낸 신청이 없어요.' };
  }
  // 친구 목록에 보일 접속 상태
  function presenceOf(uid) {
    const u = users.get(uid);
    if (!u || !u.conns.size) {
      const m = u && u.matchId && matches.get(u.matchId);      // 판 도중 잠깐 끊긴 사람은 "대전 중"으로
      return m && !m.over ? { online: false, state: 'match', mode: m.friendly ? 'friend' : m.ranked ? 'rank' : 'normal' } : { online: false, state: 'offline' };
    }
    const m = u.matchId && matches.get(u.matchId);
    if (m && !m.over) return { online: true, state: 'match', mode: m.friendly ? 'friend' : m.ranked ? 'rank' : 'normal', spectators: m.spectators.size };
    return { online: true, state: u.queued ? 'queue' : u.spectating ? 'spectate' : 'idle' };
  }
  function notify(uid, msg) { const u = users.get(uid); if (u) sendTo(u, msg); }
  function rename(uid, name) { const u = users.get(uid); if (u && name) u.username = name; }

  // ---------- 멀리건 ----------
  function matchOf(uid, matchId) {
    const u = users.get(uid), m = u && u.matchId && matches.get(u.matchId);
    if (!m || m.over || (matchId && m.id !== matchId)) return null;
    return m;
  }
  function doMulligan(m, seat, ids) {
    m.log.steps.push({ m: seat, ids: ids.slice() });                  // v137
    E.mulliganHand(m.state, seat, ids);
    m.mull[seat].done = true;
    if (m.mull[0].done && m.mull[1].done) beginPlay(m); else broadcast(m);
  }
  // v132 감정 표현: 상대에게 말풍선만 전달 (게임 상태와 무관). 너무 자주 보내면 거절
  function emote(uid, matchId, id) {
    const m = matchOf(uid, matchId);
    if (!m || m.over) return { ok: false, error: '진행 중인 판이 없어요.' };
    if (!EMOTE_IDS.includes(id)) return { ok: false, error: '잘못된 감정 표현이에요.' };
    const seat = m.uids.indexOf(uid), now = Date.now();
    m.emoteAt = m.emoteAt || [0, 0];
    if (now - m.emoteAt[seat] < PROGRESS.EMOTE_GAP_MS) return { ok: false, error: '조금 뒤에 다시 보내 주세요.' };
    m.emoteAt[seat] = now;
    const o = users.get(m.uids[1 - seat]); if (o) sendTo(o, { t: 'emote', matchId: m.id, seat, id });
    for (const sid of m.spectators.keys()) { const x = users.get(sid); if (x) sendTo(x, { t: 'emote', matchId: m.id, seat, id }); }   // v136 관전자에게도
    return { ok: true };
  }
  function mulligan(uid, matchId, ids) {
    const m = matchOf(uid, matchId);
    if (!m) return { ok: false, error: '진행 중인 판이 없어요.' };
    if (m.phase !== 'mulligan') return { ok: false, error: '멀리건 시간이 지났어요.' };
    const seat = m.uids.indexOf(uid);
    if (m.mull[seat].done) return { ok: false, error: '이미 선택했어요.' };
    if (!Array.isArray(ids) || ids.length > 10 || !ids.every(Number.isInteger)) return { ok: false, error: '잘못된 선택이에요.' };
    doMulligan(m, seat, ids);
    return { ok: true };
  }

  // ---------- 행동 ----------
  function safeApply(state, action, seat) {
    try { return E.apply(state, action, seat); }
    catch (e) { log('apply 예외', e && e.stack || e); return { ok: false, error: '서버에서 처리하지 못했어요.', crashed: true }; }
  }
  function action(uid, matchId, seq, raw) {
    const m = matchOf(uid, matchId);
    if (!m) return { ok: false, error: '진행 중인 판이 없어요.' };
    const a = cleanAction(raw);
    if (!a) return { ok: false, error: '알 수 없는 행동이에요.' };
    const seat = m.uids.indexOf(uid);
    if (a.type !== 'SURRENDER') {
      if (m.phase !== 'play') return { ok: false, error: '아직 멀리건 중이에요.' };
      if (!Number.isInteger(seq) || seq !== m.seq) return { ok: false, stale: true, error: '화면이 최신이 아니에요. 잠시 뒤 다시 해 주세요.' };
    }
    const r = safeApply(m.state, a, seat);
    if (!r.ok) return { ok: false, error: r.error };
    m.log.steps.push({ s: seat, a });                   // v137 리플레이
    m.timeouts[seat] = 0;                               // 직접 행동했으면 "연속 시간 초과"는 처음부터
    commit(m, r.state, r.events, a.type === 'SURRENDER' ? { reason: 'surrender' } : null);
    return { ok: true, seq: m.seq };
  }
  // 엔진이 돌려준 새 상태를 판에 반영하고 양쪽에 알린다
  function commit(m, newState, events, o) {
    const prevTurn = m.state.turn;
    m.state = newState; m.seq++;
    if (!newState.over && newState.turnNo > cfg.maxTurns) {          // 끝나지 않는 판: 무승부로 마친다
      newState.over = true; newState.winner = null; m.log.steps.push({ end: 'turnlimit', winner: null });
      events = events.concat([{ type: 'game_over', winner: null }]);
      return finish(m, null, 'turnlimit', events);
    }
    if (newState.over) return finish(m, newState.winner, (o && o.reason) || 'normal', events);
    if (newState.turn !== prevTurn) m.deadline = Date.now() + cfg.turnMs + Math.min(cfg.graceMs, events.length * 120);   // 새 턴: 제한 시간 다시
    broadcast(m, events, o && o.extra);
  }
  // 한쪽이 포기·시간 초과·접속 끊김으로 지는 경우: 엔진의 항복 처리를 그대로 써서 화면 연출도 같게 한다
  function forfeit(m, loserSeat, reason) {
    const r = safeApply(m.state, { type: 'SURRENDER' }, loserSeat);
    if (r.ok) { m.log.steps.push({ s: loserSeat, a: { type: 'SURRENDER' } }); m.state = r.state; m.seq++; return finish(m, r.state.winner, reason, r.events); }
    m.state.over = true; m.state.winner = 1 - loserSeat; m.log.steps.push({ end: 'forfeit', winner: 1 - loserSeat });
    return finish(m, 1 - loserSeat, reason, [{ type: 'game_over', winner: 1 - loserSeat }]);
  }
  function voidMatch(m, why) {
    m.state.over = true; m.state.winner = null;
    log('무효 판', m.id, why);
    return finish(m, null, 'void', [{ type: 'game_over', winner: null }]);
  }

  // ---------- 판 끝 ----------
  function finish(m, winnerSeat, reason, events) {
    if (m.over) return;
    m.over = true; m.phase = 'over';
    const settleArg = { matchId: m.id, ranked: !!m.ranked, friendly: !!m.friendly, uids: m.uids.slice(), winnerSeat, reason, turns: m.state.turnNo, startedAt: m.startedAt,
      replay: reason === 'void' ? null : { ...m.log, reason, end: { turnNo: m.state.turnNo, winner: winnerSeat, hp: m.state.seats.map(x => x.hp) } } };   // v137 무효 판은 리플레이 없음
    let res = null;
    for (let i = 0; i < 2 && !res; i++) { try { res = settle(settleArg); } catch (e) { log('정산 실패', i, e && e.message); } }
    if (!res) res = [{ reward: 0, why: 'error' }, { reward: 0, why: 'error' }];      // 정산이 두 번 다 실패: 보상 없이 결과만 보여 준다 (기록·골드는 그대로 취소된 상태)
    m.result = res;
    matches.delete(m.id);
    log('판 끝', m.id, reason, winnerSeat);
    for (let seat = 0; seat < 2; seat++) {
      const u = users.get(m.uids[seat]); if (!u) continue;
      const rs = res[seat] || {};
      const result = {
        youWon: winnerSeat === seat, draw: winnerSeat === null && reason !== 'void', void: reason === 'void', ranked: !!m.ranked, friendly: !!m.friendly,
        reason, turns: m.state.turnNo, oppName: m.names[1 - seat], ...rs,
      };
      const msg = matchMsg(m, seat, { events: scrubEvents(events || [], seat), result });
      u.matchId = null;
      if (u.conns.size) { sendTo(u, msg); pushStatus(u); } else u.unseen = msg;
    }
    for (const [sid, seat] of [...m.spectators]) {                  // v136 관전자: 결과만 (보상 없음)
      const u = users.get(sid); if (!u) continue;
      const result = { spectate: true, winnerName: winnerSeat === null ? null : m.names[winnerSeat], youWon: winnerSeat === seat, draw: winnerSeat === null && reason !== 'void', void: reason === 'void',
        ranked: !!m.ranked, friendly: !!m.friendly, reason, turns: m.state.turnNo, names: m.names.slice(), reward: 0 };
      const msg = specMsg(m, sid, { events: scrubEvents(events || [], -1), result });
      u.spectating = null;
      if (u.conns.size) { sendTo(u, msg); pushStatus(u); }
      gc(u);
    }
    m.spectators.clear();
    for (const uid of m.uids) gc(users.get(uid));
  }

  // ---------- 시계: 멀리건·턴 제한·접속 끊김·대기 시간 ----------
  function onTurnTimeout(m) {
    const seat = m.state.turn;
    m.timeouts[seat]++;
    if (m.timeouts[seat] >= cfg.maxTimeouts) return forfeit(m, seat, 'timeout');
    // 선택(발견·대상)이 남아 있으면 첫 번째 선택지를 고르고, 턴을 넘긴다
    let st = m.state; const evs = [];
    for (let i = 0; i < 30 && !st.over && st.turn === seat; i++) {
      const act = st.pending ? (E.viewFor(st, seat).legal[0] || { type: 'END_TURN' }) : { type: 'END_TURN' };   // legal 목록은 viewFor 가 같이 준다
      const r = safeApply(st, act, seat);
      if (!r.ok) break;
      m.log.steps.push({ s: seat, a: act, auto: 1 });                  // v137 시간 초과로 자동 처리된 행동
      st = r.state; evs.push(...r.events);
    }
    if (!st.over && st.turn === seat) return voidMatch(m, '시간 초과 처리 실패');
    commit(m, st, evs, { extra: { timeoutSeat: seat } });
  }
  function tick() {
    const now = Date.now();
    for (const m of [...matches.values()]) {
      if (m.over) continue;
      if (m.phase === 'mulligan' && now >= m.mullUntil) {
        for (let s = 0; s < 2 && m.phase === 'mulligan'; s++) if (!m.mull[s].done) doMulligan(m, s, []);   // 시간 안에 안 고르면 그대로 시작
      }
      const gone = [0, 1].filter(s => m.offline[s] != null && now - m.offline[s] >= cfg.reconnectMs);
      if (gone.length === 2) { voidMatch(m, '둘 다 접속 끊김'); continue; }
      if (gone.length === 1) { forfeit(m, gone[0], 'disconnect'); continue; }
      if (m.phase === 'play' && now >= m.deadline) onTurnTimeout(m);
    }
    let changed = false;                                            // 대기열 정리
    for (const uid of [...queue]) {
      const u = users.get(uid); if (!u) { changed = true; continue; }
      const gone = !u.conns.size && u.goneAt && now - u.goneAt > cfg.queueGraceMs, tooLong = now - u.queuedAt > cfg.queueMaxMs;
      if (gone || tooLong) { leaveQueue(u); changed = true; if (u.conns.size) { sendTo(u, { t: 'error', error: '대기 시간이 길어져 대기를 취소했어요. 다시 눌러 주세요.' }); pushStatus(u); } gc(u); }
    }
    if (changed) pushAllQueued();
    for (const iv of [...invites.values()]) {                          // v136 친구 대전 신청: 시간이 지났거나 한쪽이 나갔으면 지운다
      if (now >= iv.until) { dropInvite(iv, 'expired'); continue; }
      const gone = [iv.from, iv.to].some(id => { const x = users.get(id); return !x || (!x.conns.size && x.goneAt && now - x.goneAt > cfg.queueGraceMs); });
      if (gone) dropInvite(iv, 'offline');
    }
    pump();
  }
  const timer = setInterval(() => { try { tick(); } catch (e) { log('tick 예외', e && e.stack || e); } }, cfg.tickMs);
  if (timer.unref) timer.unref();
  function shutdown() { clearInterval(timer); }

  return {
    connect, disconnect, queueJoin, queueCancel, mulligan, emote, action, stateOf, shutdown,
    invite, respond, inviteCancel, spectate, spectateLeave, presenceOf, notify, rename,   // v136
    _users: users, _matches: matches, _queue: () => queue, _invites: invites, _tick: tick, cfg,
  };
}

module.exports = { createPvp, cleanAction, scrubEvents };
