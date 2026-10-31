// test-pvp.js — 유저 대전 확인: 판 진행 · 숨겨진 정보 · 턴 제한 시간 · 시간 초과 패배 · 접속 끊김 · 항복 · 잘못된 행동 · HTTP(SSE) 통신 (임시 DB 사용)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP } = require(path.join(JS, 'pvp.js'));
const { createPvp, cleanAction, scrubEvents } = require('./pvp-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 5000, what = '') => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('시간 초과 대기: ' + what); await sleep(10); } };
const deck = E.defaultDeckList();

// 가짜 연결: 받은 메시지를 모아 둔다
function mkClient(core, uid) {
  const c = { uid, msgs: [], last: null, conn: null };
  c.conn = { send: raw => { const m = JSON.parse(JSON.stringify(raw)); c.msgs.push(m); if (m.t === 'match') c.last = m; } };
  c.join = () => core.connect(uid, 'u' + uid, c.conn);
  c.status = () => [...c.msgs].reverse().find(m => m.t === 'status');
  return c;
}
function mkCore(extra = {}, cfg = {}) {
  const settled = [];
  const core = createPvp({
    cfg: { turnMs: 5000, mulliganMs: 5000, reconnectMs: 5000, graceMs: 0, ...cfg }, loadDeck: () => deck.slice(),
    settle: g => { settled.push(g); return [{ reward: g.winnerSeat === 0 ? 50 : 0 }, { reward: g.winnerSeat === 1 ? 50 : 0 }]; }, ...extra,
  });
  return { core, settled };
}
async function startMatch(core, ...uids) {
  const cs = uids.map(u => mkClient(core, u)); cs.forEach(c => c.join());
  uids.forEach(u => assert.ok(core.queueJoin(u).ok));
  await until(() => cs.every(c => c.last), 2000, '매칭');
  const mid = cs[0].last.matchId;
  uids.forEach((u, i) => assert.ok(core.mulligan(u, mid, []).ok, '멀리건'));
  await until(() => cs.every(c => c.last.phase === 'play'), 2000, '멀리건 끝');
  return cs;
}
const turnClient = cs => cs.find(c => c.last.turnSeat === c.last.seat);

(async () => {
  // ===== 행동 정리 =====
  assert.strictEqual(cleanAction({ type: 'HACK' }), null);
  assert.strictEqual(cleanAction({ type: 'PLAY_CARD', cardId: 'x' }), null, '정수가 아닌 값은 거부');
  assert.strictEqual(cleanAction(null), null);
  assert.deepStrictEqual(cleanAction({ type: 'END_TURN', junk: { a: 1 } }), { type: 'END_TURN' }, '모르는 필드는 버린다');
  console.log('✔ 행동 정리');

  // ===== 판 시작 · 숨겨진 정보 =====
  {
    const { core } = mkCore();
    const [a, b] = await startMatch(core, 1, 2);
    assert.notStrictEqual(a.last.seat, b.last.seat);
    for (const c of [a, b]) {
      const m = c.last, v = m.view;
      assert.strictEqual(v.opp.hand, undefined, '상대 손패 내용은 안 보낸다');
      assert.ok(typeof v.opp.handCount === 'number');
      assert.ok(Array.isArray(m.deck) && m.deck.length === 30, '내 덱만 보낸다');
      assert.strictEqual(v.opp.deckCards, undefined, '상대 덱 구성은 안 보낸다');
      assert.ok(m.remainMs > 0 && m.remainMs <= 5000, '남은 시간이 온다');
    }
    const ev = scrubEvents([{ type: 'generated', seat: 1, name: '비밀카드', cost: 3, card: {} }, { type: 'generated', seat: 0, name: '내카드', cost: 2 }], 0);
    assert.strictEqual(ev[0].name, '카드'); assert.strictEqual(ev[1].name, '내카드', '내 카드는 그대로');
    console.log('✔ 판 시작 · 상대 정보 가림');

    // 내 차례가 아닐 때 / 낡은 seq / 이상한 행동
    const mine = turnClient(a === turnClient([a, b]) ? [a, b] : [a, b]), other = mine === a ? b : a, mid = mine.last.matchId;
    let r = core.action(other.uid, mid, other.last.seq, { type: 'END_TURN' }); assert.ok(!r.ok, '내 턴이 아니면 거부');
    r = core.action(mine.uid, mid, mine.last.seq + 5, { type: 'END_TURN' }); assert.ok(!r.ok && r.stale, '낡은 seq 거부');
    r = core.action(mine.uid, mid, mine.last.seq, { type: 'NOPE' }); assert.ok(!r.ok);
    r = core.action(mine.uid, 'wrong', mine.last.seq, { type: 'END_TURN' }); assert.ok(!r.ok, '다른 판 번호 거부');
    const seq0 = mine.last.seq;
    r = core.action(mine.uid, mid, seq0, { type: 'END_TURN' }); assert.ok(r.ok);
    await until(() => other.last.seq === seq0 + 1 && mine.last.seq === seq0 + 1, 1000, '턴 종료 전달');
    assert.strictEqual(other.last.view.turn, other.last.seat, '턴이 넘어감');
    r = core.action(mine.uid, mid, seq0, { type: 'END_TURN' }); assert.ok(!r.ok && r.stale, '같은 요청 재전송은 거부 (더블 클릭)');
    console.log('✔ 순서 · 낡은 요청 · 잘못된 행동 거부');

    // 항복
    r = core.action(mine.uid, mid, mine.last.seq, { type: 'SURRENDER' }); assert.ok(r.ok);
    await until(() => a.last.result && b.last.result, 1000, '항복 결과');
    assert.strictEqual(mine.last.result.reason, 'surrender'); assert.strictEqual(other.last.result.youWon, true);
    assert.strictEqual(other.last.result.reward, 50, '정산 결과가 메시지에 들어간다');
    assert.strictEqual(core.stateOf(1), 'idle'); core.shutdown();
    console.log('✔ 항복');
  }

  // ===== 턴 제한 시간: 넘어가고, 연속으로 쌓이면 패배 =====
  {
    const { core, settled } = mkCore({}, { turnMs: 300, maxTimeouts: 2 });
    const cs = await startMatch(core, 11, 12);
    const first = turnClient(cs), mid = first.last.matchId, seq0 = first.last.seq;
    await until(() => first.last.seq > seq0, 2000, '시간 초과로 턴 넘김');
    const t = first.msgs.find(m => m.t === 'match' && m.timeoutSeat !== undefined);
    assert.ok(t && t.timeoutSeat === first.last.seat || cs.some(c => c.msgs.some(m => m.timeoutSeat === first.last.seat)), '시간 초과 알림');
    assert.ok(core._matches.get(mid).timeouts[first.last.seat] >= 1);
    await until(() => cs.every(c => c.last.result), 4000, '연속 시간 초과 패배');   // 둘 다 가만있으면 먼저 2번 쌓인 쪽(=먼저 두던 쪽)이 진다
    const loser = cs.find(c => !c.last.result.youWon);
    assert.strictEqual(loser.last.result.reason, 'timeout'); assert.strictEqual(settled.length, 1); assert.strictEqual(settled[0].reason, 'timeout');
    core.shutdown(); console.log('✔ 턴 제한 시간 · 연속 시간 초과 패배');
  }
  // 직접 행동하면 연속 횟수가 0 으로
  {
    const { core } = mkCore({}, { turnMs: 400, maxTimeouts: 3 });
    const cs = await startMatch(core, 21, 22);
    const first = turnClient(cs), mid = first.last.matchId;
    await until(() => core._matches.get(mid).timeouts[first.last.seat] === 1, 2000, '1회 초과');
    const p = cs.find(c => c.last.turnSeat === c.last.seat);
    assert.ok(core.action(p.uid, mid, p.last.seq, { type: 'END_TURN' }).ok);
    assert.strictEqual(core._matches.get(mid).timeouts[p.last.seat], 0, '직접 행동하면 초기화');
    core.shutdown(); console.log('✔ 직접 행동 시 시간 초과 횟수 초기화');
  }

  // ===== 접속 끊김: 돌아오면 이어서, 못 돌아오면 패배 =====
  {
    const { core, settled } = mkCore({}, { reconnectMs: 400 });
    const [a, b] = await startMatch(core, 31, 32);
    core.disconnect(a.uid, a.conn);
    await until(() => b.msgs.some(m => m.t === 'presence' && m.oppOnline === false), 1000, '상대 끊김 알림');
    const re = mkClient(core, a.uid); re.join();
    await until(() => re.last, 1000, '재접속 상태 수신');
    assert.strictEqual(re.last.phase, 'play'); assert.strictEqual(re.last.seat, a.last.seat, '같은 자리로 이어짐');
    await until(() => b.msgs.some(m => m.t === 'presence' && m.oppOnline === true), 1000, '복귀 알림');
    core.disconnect(a.uid, re.conn);
    await until(() => b.last.result, 3000, '끊김 패배');
    assert.strictEqual(b.last.result.youWon, true); assert.strictEqual(b.last.result.reason, 'disconnect'); assert.strictEqual(settled[0].reason, 'disconnect');
    const back = mkClient(core, a.uid); back.join();       // 끊긴 사이에 끝난 판의 결과는 돌아왔을 때 한 번 보여 준다
    await until(() => back.last && back.last.result, 1000, '못 본 결과');
    assert.strictEqual(back.last.result.youWon, false);
    core.shutdown(); console.log('✔ 접속 끊김 · 재접속 · 끊김 패배');
  }
  // 둘 다 끊기면 무효 판 (전적·보상 없음)
  {
    const { core, settled } = mkCore({}, { reconnectMs: 300 });
    const [a, b] = await startMatch(core, 41, 42);
    core.disconnect(a.uid, a.conn); core.disconnect(b.uid, b.conn);
    await until(() => settled.length === 1, 2000, '무효 판');
    assert.strictEqual(settled[0].reason, 'void'); core.shutdown(); console.log('✔ 둘 다 끊기면 무효');
  }

  // ===== 멀리건 시간 =====
  {
    const { core } = mkCore({}, { mulliganMs: 300 });
    const cs = [51, 52].map(u => mkClient(core, u)); cs.forEach(c => c.join()); cs.forEach(c => core.queueJoin(c.uid));
    await until(() => cs.every(c => c.last), 1000);
    assert.strictEqual(cs[0].last.phase, 'mulligan');
    await until(() => cs.every(c => c.last.phase === 'play'), 2000, '멀리건 시간이 지나면 그대로 시작');
    core.shutdown(); console.log('✔ 멀리건 제한 시간');
  }

  // ===== 대기열 =====
  {
    const { core } = mkCore();
    const a = mkClient(core, 61); a.join();
    assert.ok(core.queueJoin(61).ok); assert.strictEqual(core.stateOf(61), 'queue');
    assert.ok(core.queueJoin(61).already, '두 번 눌러도 한 번만');
    assert.ok(core.queueCancel(61).ok); assert.strictEqual(core.stateOf(61), 'idle'); assert.ok(!core.queueCancel(61).ok);
    assert.ok(!core.queueJoin(999).ok, '연결 없이는 대기열에 못 들어감');
    core.shutdown(); console.log('✔ 대기열');
  }

  // ===== HTTP + SSE: 실제 서버로 두 사람이 붙어서 한 판 =====
  const dbRaw = require('./db'); void dbRaw;
  const auth = require('./auth'), saves = require('./saves');
  const pvpMod = require('./pvp');
  const app = express(); app.use(express.json());
  app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', pvpMod.router);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const mkUser = name => {
    let cookie = ''; const u = { msgs: [], last: null, ac: new AbortController(), cookie: () => cookie };
    u.call = async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => ({})) };
    };
    u.signup = () => u.call('POST', '/api/signup', { username: name, password: 'password123' });
    u.stream = async () => {
      const res = await fetch(base + '/api/pvp/stream', { headers: { cookie }, signal: u.ac.signal });
      assert.strictEqual(res.status, 200); assert.ok(/text\/event-stream/.test(res.headers.get('content-type')));
      (async () => {
        const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
        try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find(l => l.startsWith('data: ')); if (line) { const m = JSON.parse(line.slice(6)); u.msgs.push(m); if (m.t === 'match') u.last = m; } } } } catch (_) {}
      })();
    };
    return u;
  };
  try {
    const A = mkUser('pvpalice'), B = mkUser('pvpbob');
    const nostream = await fetch(base + '/api/pvp/stream'); assert.strictEqual(nostream.status, 401, '로그인 전엔 스트림 거부');
    await A.signup(); await B.signup();
    assert.strictEqual((await A.call('GET', '/api/pvp/status')).data.state, 'idle');
    await A.stream(); await B.stream();
    await until(() => A.msgs.some(m => m.t === 'status') && B.msgs.some(m => m.t === 'status'), 2000, '첫 상태');
    assert.strictEqual(A.msgs.find(m => m.t === 'status').winGold, PVP.WIN_GOLD);
    assert.strictEqual((await A.call('POST', '/api/pvp/queue')).status, 200);
    assert.strictEqual((await B.call('POST', '/api/pvp/queue')).status, 200);
    await until(() => A.last && B.last, 3000, 'HTTP 매칭');
    const mid = A.last.matchId;
    assert.strictEqual((await A.call('POST', '/api/pvp/mulligan', { matchId: mid, ids: [] })).status, 200);
    assert.strictEqual((await B.call('POST', '/api/pvp/mulligan', { matchId: mid, ids: [] })).status, 200);
    await until(() => A.last.phase === 'play' && B.last.phase === 'play', 2000, '대전 시작');
    assert.strictEqual((await A.call('GET', '/api/pvp/status')).data.state, 'match', '새로고침해도 판이 이어진다');
    const p = [A, B].find(u => u.last.turnSeat === u.last.seat), q = p === A ? B : A;
    let r = await q.call('POST', '/api/pvp/action', { matchId: mid, seq: q.last.seq, action: { type: 'END_TURN' } });
    assert.strictEqual(r.status, 400, '내 턴이 아니면 400');
    r = await p.call('POST', '/api/pvp/action', { matchId: mid, seq: p.last.seq + 9, action: { type: 'END_TURN' } });
    assert.strictEqual(r.status, 409, '낡은 화면은 409');
    r = await p.call('POST', '/api/pvp/action', { matchId: mid, seq: p.last.seq, action: { type: 'END_TURN' } }); assert.strictEqual(r.status, 200);
    await until(() => q.last.turnSeat === q.last.seat, 2000, '상대 행동이 스트림으로 도착');
    // 항복 → 짧은 판이어도 이긴 쪽은 보상을 받고, 기록도 남음
    r = await q.call('POST', '/api/pvp/action', { matchId: mid, seq: q.last.seq, action: { type: 'SURRENDER' } }); assert.strictEqual(r.status, 200);
    await until(() => A.last.result && B.last.result, 2000, 'HTTP 결과');
    assert.strictEqual(p.last.result.youWon, true); assert.strictEqual(p.last.result.reward, PVP.WIN_GOLD); assert.strictEqual(p.last.result.why, undefined);
    const st = [...p.msgs].reverse().find(m => m.t === 'status'); assert.strictEqual(st.state, 'idle'); assert.strictEqual(st.record.wins, 1);
    // 한 계정이 열 수 있는 스트림은 4개까지 → 5번째는 429
    const acs = []; let code = 0;
    for (let i = 0; i < 4; i++) { const ac = new AbortController(); acs.push(ac); const rs = await fetch(base + '/api/pvp/stream', { headers: { cookie: p.cookie() }, signal: ac.signal }); code = rs.status; if (i < 3) assert.strictEqual(code, 200); }
    assert.strictEqual(code, 429, '탭이 너무 많으면 거부'); acs.forEach(a => a.abort());
    console.log('✔ HTTP(SSE) 통신: 매칭 · 멀리건 · 행동 · 거부 코드 · 결과');
  } finally {
    server.closeAllConnections && server.closeAllConnections(); server.close(); pvpMod.core.shutdown();
  }
  console.log('✔ PvP 서버 테스트 통과');
  process.exit(0);
})().catch(e => { console.error('✘ 실패:', e); process.exit(1); });
