// test-friends.js — v136 닉네임 · 친구 요청(수락/거절/취소/삭제) · 친구 대전 신청 · 관전(손패 가림) · 친구 대전 보상 없음 · HTTP (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP } = require(path.join(JS, 'pvp.js'));
const db = require('./db');
const F = require('./friends-db');
const pvpdb = require('./pvp-db');
const { walletRow } = require('./wallet');
const { createPvp } = require('./pvp-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 5000, what = '') => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('시간 초과 대기: ' + what); await sleep(10); } };
const mkUser = name => Number(db.prepare('INSERT INTO users(username,pw_hash,created_at) VALUES (?,?,?)').run(name, 'x', Date.now()).lastInsertRowid);

(async () => {
  // ===== 닉네임 =====
  const A = mkUser('alice'), B = mkUser('bob'), C = mkUser('carol');
  assert.ok(F.setNickname(A, '앨리스').ok);
  assert.strictEqual(F.userRow(A).nickname, '앨리스');
  assert.ok(!F.setNickname(B, '앨리스').ok, '같은 닉네임은 한 명만');
  assert.ok(!F.setNickname(B, 'ALICE').ok, '남의 아이디와 같은 닉네임 금지 (대소문자 무시)');
  assert.ok(F.setNickname(A, 'alice').ok, '내 아이디와 같은 닉네임은 괜찮다');
  assert.ok(F.setNickname(A, '앨리스').ok);
  assert.ok(!F.setNickname(B, 'a').ok, '너무 짧음'); assert.ok(!F.setNickname(B, '공백 있음').ok, '공백 금지'); assert.ok(!F.setNickname(B, 'x'.repeat(13)).ok, '너무 김');
  assert.ok(F.setNickname(B, 'Bobby').ok); assert.ok(!F.setNickname(C, 'bobby').ok, '대소문자만 다른 닉네임도 중복');
  assert.ok(F.setNickname(B, null).ok); assert.strictEqual(F.userRow(B).nickname, null, '닉네임 지우기');
  assert.ok(F.setNickname(C, 'bobby').ok, '지운 닉네임은 다른 사람이 쓸 수 있다');
  assert.throws(() => db.prepare('UPDATE users SET nickname=? WHERE id=?').run('BOBBY', A), /UNIQUE/, 'DB 인덱스도 중복을 막는다');
  assert.ok(F.nicknameTaken('앨리스') && !F.nicknameTaken('없는닉'));
  assert.strictEqual(F.findUser('앨리스').id, A, '닉네임으로 찾기'); assert.strictEqual(F.findUser('BOB').id, B, '아이디로 찾기');
  console.log('✔ 닉네임 (중복 금지 · 아이디 사칭 금지 · 지우기)');

  // ===== 친구 요청 =====
  let r = F.sendRequest(A, 'bob'); assert.ok(r.ok && r.status === 'sent');
  assert.ok(!F.sendRequest(A, 'bob').ok, '두 번 보내기 거부');
  assert.ok(!F.sendRequest(A, 'alice').ok, '나 자신 거부'); assert.ok(!F.sendRequest(A, 'nobody').ok, '없는 사람');
  let L = F.listOf(B); assert.strictEqual(L.incoming.length, 1); assert.strictEqual(L.incoming[0].name, '앨리스');
  assert.strictEqual(F.listOf(A).outgoing.length, 1);
  assert.ok(!F.answerRequest(C, A, true).ok, '나에게 온 요청이 아니면 수락 못 함');
  r = F.answerRequest(B, A, true); assert.ok(r.ok && r.status === 'accepted');
  assert.ok(F.areFriends(A, B) && F.areFriends(B, A), '양쪽 다 친구');
  assert.strictEqual(F.listOf(A).outgoing.length, 0); assert.strictEqual(F.listOf(B).incoming.length, 0);
  assert.ok(!F.sendRequest(B, '앨리스').ok, '이미 친구');
  // 거절
  assert.ok(F.sendRequest(C, '앨리스').ok); r = F.answerRequest(A, C, false); assert.ok(r.ok && r.status === 'declined');
  assert.ok(!F.areFriends(A, C)); assert.strictEqual(F.listOf(C).outgoing.length, 0);
  // 취소
  assert.ok(F.sendRequest(C, 'bob').ok); assert.ok(F.cancelRequest(C, B).ok); assert.strictEqual(F.listOf(B).incoming.length, 0); assert.ok(!F.cancelRequest(C, B).ok);
  // 서로 보내면 바로 친구
  assert.ok(F.sendRequest(C, 'alice').ok); r = F.sendRequest(A, 'bobby'); assert.ok(r.ok && r.status === 'accepted'); assert.ok(F.areFriends(A, C));
  // 삭제
  assert.ok(F.removeFriend(C, A).ok); assert.ok(!F.areFriends(A, C) && !F.areFriends(C, A)); assert.ok(!F.removeFriend(C, A).ok);
  console.log('✔ 친구 요청 · 수락 · 거절 · 취소 · 서로 요청 · 삭제');

  // ===== 친구 대전 보상 없음 (DB) =====
  const g0 = walletRow(A) ? walletRow(A).gold : null;
  const res = pvpdb.settle({ matchId: 'f1', uids: [A, B], winnerSeat: 0, reason: 'normal', turns: 20, startedAt: Date.now(), friendly: true, ranked: true });
  assert.strictEqual(res[0].reward, 0, '친구 대전은 골드 없음'); assert.strictEqual(res[0].rank, undefined, '랭크 변화 없음');
  assert.strictEqual(walletRow(A) ? walletRow(A).gold : null, g0);
  assert.strictEqual(pvpdb.statsOf(A).record.wins, 0, '전적에 안 들어감');
  assert.strictEqual(db.prepare('SELECT friendly, ranked FROM pvp_matches WHERE match_id=?').get('f1').friendly, 1);
  assert.strictEqual(pvpdb.fullBoard().find(x => x.id === A).name, '앨리스', '순위표에는 닉네임');
  console.log('✔ 친구 대전: 골드·랭크·전적 없음 · 순위표 닉네임');

  // ===== 코어: 친구 대전 신청 · 관전 =====
  const deck = E.defaultDeckList();
  const settled = [];
  const core = createPvp({ cfg: { turnMs: 5000, mulliganMs: 5000, reconnectMs: 5000, graceMs: 0, inviteMs: 400 }, loadDeck: () => deck.slice(),
    settle: g => { settled.push(g); return [{ reward: 0 }, { reward: 0 }]; } });
  const mk = (uid, name) => { const c = { uid, msgs: [], last: null }; c.conn = { send: raw => { const m = JSON.parse(JSON.stringify(raw)); c.msgs.push(m); if (m.t === 'match') c.last = m; } }; c.join = () => core.connect(uid, name, c.conn); c.find = t => [...c.msgs].reverse().find(m => m.t === t); return c; };
  const a = mk(1, '앨리스'), b = mk(2, 'bob'), s = mk(3, '관전자'), d = mk(4, 'dave');
  [a, b, s].forEach(c => c.join());
  assert.ok(!core.invite(1, 4).ok, '접속 안 한 친구에게는 신청 불가');
  assert.deepStrictEqual(core.presenceOf(4), { online: false, state: 'offline' });
  assert.strictEqual(core.presenceOf(2).state, 'idle');
  // 신청 → 거절
  r = core.invite(1, 2); assert.ok(r.ok);
  assert.ok(b.find('invite') && b.find('invite').from.name === '앨리스', '받은 사람에게 신청이 간다'); assert.ok(a.find('inviteSent'));
  assert.ok(!core.respond(3, r.id, true).ok, '남이 대신 수락 못 함');
  assert.ok(core.respond(2, r.id, false).ok); assert.strictEqual(a.find('inviteGone').why, 'declined');
  // 시간 초과
  r = core.invite(1, 2); await sleep(500); core._tick(); assert.strictEqual(a.find('inviteGone').why, 'expired'); assert.ok(!core.respond(2, r.id, true).ok);
  // 대기열에 있던 사람도 신청을 받고 수락하면 대기열에서 빠진다
  assert.ok(core.queueJoin(2).ok);
  r = core.invite(1, 2); assert.ok(r.ok);
  assert.ok(core.respond(2, r.id, true).ok);
  await until(() => a.last && b.last, 2000, '친구 대전 시작');
  assert.strictEqual(a.last.friendly, true); assert.strictEqual(a.last.ranked, false); assert.strictEqual(core.stateOf(2), 'match');
  assert.strictEqual(core._queue().length, 0, '대기열에서 빠짐');
  assert.ok(!core.invite(3, 1).ok, '대전 중인 친구에게는 신청 불가');
  assert.strictEqual(core.presenceOf(1).state, 'match'); assert.strictEqual(core.presenceOf(1).mode, 'friend');
  // 관전
  r = core.spectate(3, 1); assert.ok(r.ok);
  const sv = s.last; assert.ok(sv.spectate, '관전 화면'); assert.strictEqual(sv.seat, a.last.seat, '친구 쪽 시점');
  assert.deepStrictEqual(sv.view.me.hand, [], '관전자에게 친구 손패 내용은 안 보낸다');
  assert.strictEqual(sv.view.me.handCount, a.last.view.me.hand.length, '장수만');
  assert.strictEqual(sv.view.opp.hand, undefined); assert.strictEqual(sv.view.me.deckCards, undefined, '덱 구성 안 보냄'); assert.strictEqual(sv.deck, undefined);
  assert.deepStrictEqual(sv.view.legal, [], '관전자는 할 수 있는 행동이 없다');
  await until(() => a.msgs.some(m => m.t === 'spectators' && m.count === 1), 1000, '관전 인원 알림');
  assert.ok(!core.spectate(1, 2).ok, '내 판은 관전 불가');
  const mid = a.last.matchId;
  assert.ok(!core.action(3, mid, a.last.seq, { type: 'END_TURN' }).ok, '관전자는 행동 불가');
  assert.ok(!core.mulligan(3, mid, []).ok, '관전자는 멀리건 불가');
  assert.ok(core.mulligan(1, mid, []).ok && core.mulligan(2, mid, []).ok);
  await until(() => a.last.phase === 'play' && s.last.phase === 'play', 2000, '관전자도 판 진행을 받는다');
  // 이벤트 가림: 관전자에게 가는 이벤트는 양쪽 다 가린다
  const { scrubEvents } = require('./pvp-core');
  const ev = scrubEvents([{ type: 'generated', seat: 0, name: '비밀', cost: 1 }, { type: 'generated', seat: 1, name: '비밀2', cost: 1 }], -1);
  assert.ok(ev.every(e => e.name === '카드'));
  // 턴 넘기기 → 관전자에게도 전달
  const turnC = [a, b].find(c => c.last.turnSeat === c.last.seat), seq0 = turnC.last.seq;
  assert.ok(core.action(turnC.uid, mid, seq0, { type: 'END_TURN' }).ok);
  await until(() => s.last.seq === seq0 + 1, 1000, '관전자 갱신');
  assert.deepStrictEqual(s.last.view.me.hand, []);
  // 관전 그만두기 → 다시 보기
  assert.ok(core.spectateLeave(3).ok); assert.strictEqual(core._matches.get(mid).spectators.size, 0);
  assert.ok(core.spectate(3, 2).ok); assert.strictEqual(s.last.seat, b.last.seat, '다른 친구 쪽 시점으로');
  // 항복 → 끝: 관전자는 결과를 받는다
  assert.ok(core.action(1, mid, a.last.seq, { type: 'SURRENDER' }).ok);
  await until(() => s.last.result, 1000, '관전자 결과');
  assert.ok(s.last.result.spectate); assert.strictEqual(s.last.result.winnerName, 'bob'); assert.strictEqual(s.last.result.reward, 0);
  assert.strictEqual(settled[0].friendly, true, '정산에 친구 대전 표시');
  assert.strictEqual(core._users.get(3).spectating, null);
  // 서로 신청하면 바로 시작
  r = core.invite(1, 2); assert.ok(r.ok); a.last = b.last = null;
  r = core.invite(2, 1); assert.ok(r.ok);
  await until(() => a.last && b.last && a.last.matchId === b.last.matchId, 1000, '맞신청으로 시작');
  assert.strictEqual(core._invites.size, 0);
  core.shutdown();
  console.log('✔ 친구 대전 신청 (거절 · 시간 초과 · 대기열에서 수락 · 맞신청) · 관전 (손패 가림 · 행동 불가 · 결과)');

  // ===== HTTP =====
  const auth = require('./auth'), pvpMod = require('./pvp'), social = require('./social');
  const app = express(); app.use(express.json());
  app.use('/api', auth.router); app.use('/api', pvpMod.router); app.use('/api', social.createSocialRouter({ core: pvpMod.core }));
  const server = http.createServer(app); await new Promise(rs => server.listen(0, rs));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = name => {
    let cookie = ''; const u = { msgs: [], ac: new AbortController() };
    u.call = async (method, url, body) => {
      const rr = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = rr.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: rr.status, data: await rr.json().catch(() => ({})) };
    };
    u.signup = () => u.call('POST', '/api/signup', { username: name, password: 'password123' });
    u.stream = async () => {
      const rr = await fetch(base + '/api/pvp/stream', { headers: { cookie }, signal: u.ac.signal });
      (async () => { const rd = rr.body.getReader(), dec = new TextDecoder(); let buf = '';
        try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) { const ch = buf.slice(0, i); buf = buf.slice(i + 2); const line = ch.split('\n').find(l => l.startsWith('data: ')); if (line) u.msgs.push(JSON.parse(line.slice(6))); } } } catch (_) {} })();
    };
    return u;
  };
  try {
    const X = client('httpx'), Y = client('httpy'), Z = client('httpz');
    await X.signup(); await Y.signup(); await Z.signup();
    assert.strictEqual((await X.call('PUT', '/api/profile/nickname', { nickname: '엑스맨' })).status, 200);
    assert.strictEqual((await Y.call('PUT', '/api/profile/nickname', { nickname: '엑스맨' })).status, 409, '중복 닉네임 409');
    assert.strictEqual((await Y.call('PUT', '/api/profile/nickname', { nickname: 'httpx' })).status, 409, '남의 아이디 409');
    assert.strictEqual((await Z.call('POST', '/api/signup', { username: '엑스맨', password: 'password123' })).status, 409, '남의 닉네임으로 가입 불가');
    assert.strictEqual((await X.call('GET', '/api/me')).data.user.name, '엑스맨', '/api/me 에 닉네임');
    await X.stream(); await Y.stream();
    let q = await X.call('POST', '/api/friends/request', { to: 'httpy' }); assert.strictEqual(q.status, 200); assert.strictEqual(q.data.status, 'sent');
    await until(() => Y.msgs.some(m => m.t === 'friends' && m.why === 'request' && m.name === '엑스맨'), 2000, '요청 실시간 알림');
    q = await Y.call('GET', '/api/friends'); assert.strictEqual(q.data.incoming.length, 1); assert.strictEqual(q.data.incoming[0].name, '엑스맨');
    const xid = q.data.incoming[0].id;
    assert.strictEqual((await Y.call('POST', '/api/pvp/invite', { to: xid })).status, 400, '친구가 아니면 대전 신청 불가');
    assert.strictEqual((await Y.call('POST', '/api/friends/accept', { id: xid })).status, 200);
    await until(() => X.msgs.some(m => m.t === 'friends' && m.why === 'accepted'), 2000, '수락 알림');
    q = await X.call('GET', '/api/friends'); assert.strictEqual(q.data.friends.length, 1); assert.strictEqual(q.data.friends[0].online, true); assert.strictEqual(q.data.friends[0].state, 'idle');
    const yid = q.data.friends[0].id;
    q = await X.call('POST', '/api/pvp/invite', { to: yid }); assert.strictEqual(q.status, 200);
    await until(() => Y.msgs.some(m => m.t === 'invite'), 2000, '대전 신청 도착');
    const iv = Y.msgs.find(m => m.t === 'invite');
    assert.strictEqual((await Y.call('POST', '/api/pvp/invite/respond', { id: iv.id, accept: true })).status, 200);
    await until(() => X.msgs.some(m => m.t === 'match' && m.friendly) && Y.msgs.some(m => m.t === 'match'), 2000, 'HTTP 친구 대전 시작');
    assert.strictEqual(X.msgs.find(m => m.t === 'match').opp.name, 'httpy');
    assert.strictEqual(Y.msgs.find(m => m.t === 'match').opp.name, '엑스맨', '대전 상대 이름은 닉네임');
    assert.strictEqual((await Z.call('POST', '/api/pvp/spectate', { friendId: xid })).status, 400, '친구가 아니면 관전 불가');
    q = await Y.call('GET', '/api/friends'); assert.strictEqual(q.data.friends[0].state, 'match');
    assert.strictEqual((await X.call('POST', '/api/friends/remove', { id: yid })).status, 200);
    assert.strictEqual((await X.call('GET', '/api/friends')).data.friends.length, 0);
    console.log('✔ HTTP: 닉네임 · 친구 요청/수락 · 실시간 알림 · 친구 대전 신청 · 권한 확인');
  } finally { server.closeAllConnections && server.closeAllConnections(); server.close(); pvpMod.core.shutdown(); }
  console.log('✔ 친구 테스트 통과');
  process.exit(0);
})().catch(e => { console.error('✘ 실패:', e); process.exit(1); });
