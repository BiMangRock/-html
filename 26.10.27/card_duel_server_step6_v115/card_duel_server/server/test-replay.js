// test-replay.js — v137 리플레이: 저장된 시드·행동으로 판이 똑같이 다시 만들어지는지 · 계정당 보관 수 · 남의 리플레이 거부 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP, pvpRng } = require(path.join(JS, 'pvp.js'));
const db = require('./db');
const pvpdb = require('./pvp-db');
const { createPvp } = require('./pvp-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 5000, what = '') => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('시간 초과 대기: ' + what); await sleep(5); } };
const mkUser = name => Number(db.prepare('INSERT INTO users(username,pw_hash,created_at) VALUES (?,?,?)').run(name, 'x', Date.now()).lastInsertRowid);

// 리플레이 기록으로 판을 다시 만든다 (브라우저 replay.js 와 같은 순서)
function rebuild(rep) {
  let st = E.newGame(pvpRng(rep.seed), { decks: rep.decks, heroPowers: rep.heroPowers });
  for (const step of rep.steps) {
    if (step.m !== undefined) { st = structuredClone(st); E.mulliganHand(st, step.m, step.ids); }
    else if (step.a) { const r = E.apply(st, step.a, step.s); assert.ok(r.ok, '기록된 행동은 다시 해도 통과해야 한다: ' + r.error); st = r.state; }
    else if (step.end) { st = structuredClone(st); st.over = true; st.winner = step.winner; }
  }
  return st;
}

(async () => {
  const A = mkUser('ra'), B = mkUser('rb'), C = mkUser('rc');
  let seedN = 12345; const pick = n => { seedN = (seedN * 1103515245 + 12345) & 0x7fffffff; return seedN % n; };
  for (let game = 0; game < 4; game++) {
    const core = createPvp({ cfg: { turnMs: 60000, mulliganMs: 5000, graceMs: 0 }, loadDeck: pvpdb.loadDeck, settle: pvpdb.settle });
    const cs = [A, B].map(uid => { const c = { uid, last: null }; c.conn = { send: m => { if (m.t === 'match') c.last = structuredClone(m); } }; core.connect(uid, 'u' + uid, c.conn); return c; });
    cs.forEach(c => assert.ok(core.queueJoin(c.uid).ok));
    await until(() => cs.every(c => c.last), 2000, '매칭');
    const mid = cs[0].last.matchId;
    core.mulligan(A, mid, game % 2 ? cs.find(c => c.uid === A).last.mulligan.startIds.slice(0, 2) : []); core.mulligan(B, mid, []);
    await until(() => cs.every(c => c.last.phase === 'play'), 2000, '멀리건');
    // 무작위로 할 수 있는 행동을 골라 진행 (턴 종료는 가끔만 → 카드를 많이 내게)
    for (let i = 0; i < 400 && !cs[0].last.result; i++) {
      const c = cs.find(x => x.last.turnSeat === x.last.seat && !x.last.result); if (!c) break;
      const legal = c.last.view.legal; if (!legal.length) break;
      const nonEnd = legal.filter(a => a.type !== 'END_TURN' && a.type !== 'SURRENDER');
      const a = nonEnd.length && pick(5) ? nonEnd[pick(nonEnd.length)] : { type: 'END_TURN' };
      const seq = c.last.seq; const r = core.action(c.uid, mid, seq, a);
      if (r.ok) await until(() => c.last.seq > seq, 2000, '행동 반영');
    }
    if (!cs[0].last.result) { core.action(B, mid, cs[1].last.seq, { type: 'SURRENDER' }); await until(() => cs[0].last.result, 2000, '항복'); }
    core.shutdown();
    const got = pvpdb.replayGet(A, mid); assert.ok(got, '리플레이 저장됨');
    const rep = got.replay;
    assert.ok(rep.steps.length > 5, '행동이 기록됨'); assert.strictEqual(rep.engine, E.VERSION);
    const st = rebuild(rep);
    assert.strictEqual(st.over, true); assert.strictEqual(st.winner, rep.end.winner, '같은 승자'); assert.strictEqual(st.turnNo, rep.end.turnNo, '같은 턴 수');
    assert.deepStrictEqual(st.seats.map(x => x.hp), rep.end.hp, '같은 체력');
    for (const c of cs) {                                                           // 마지막 화면(서버가 보낸 것)과 다시 만든 판이 같다
      const v = E.viewFor(st, c.last.seat), lv = c.last.view;
      assert.deepStrictEqual(v.me.hand.map(x => x.name), lv.me.hand.map(x => x.name), '손패 같음');
      assert.deepStrictEqual(v.me.board.map(x => [x.name, x.atk, x.hp]), lv.me.board.map(x => [x.name, x.atk, x.hp]), '전장 같음');
      assert.strictEqual(v.opp.handCount, lv.opp.handCount);
    }
    assert.strictEqual(got.mySeat, cs.find(c => c.uid === A).last.seat, '내 좌석');
    assert.strictEqual(pvpdb.replayGet(C, mid), null, '남의 판 리플레이는 못 본다');
    console.log(`  판 ${game + 1}: 행동 ${rep.steps.length}개 · ${rep.end.turnNo}턴 · 저장 ${JSON.stringify(rep).length}바이트 — 똑같이 재현`);
  }
  console.log('✔ 시드 + 행동 목록으로 판 재현 (손패·전장·체력·승자)');

  // 보관 수: 계정마다 최근 REPLAY_KEEP 판
  const fake = { v: 1, seed: 1, decks: [], heroPowers: [], steps: [], end: {} };
  for (let i = 0; i < PVP.REPLAY_KEEP + 5; i++) pvpdb.settle({ matchId: 'aa' + i.toString(16).padStart(4, '0'), uids: [A, C], winnerSeat: 0, reason: 'normal', turns: 5, startedAt: Date.now(), replay: fake });
  const listA = pvpdb.replayList(A);
  assert.strictEqual(listA.length, PVP.REPLAY_KEEP, '최근 판만 보관');
  assert.strictEqual(listA[0].matchId, 'aa' + (PVP.REPLAY_KEEP + 4).toString(16).padStart(4, '0'), '최근 것부터');
  assert.strictEqual(listA[0].result, 'win'); assert.strictEqual(pvpdb.replayList(C)[0].result, 'lose');
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM pvp_replays').get().n <= PVP.REPLAY_KEEP * 2, '아무도 안 가진 리플레이는 지운다');
  assert.ok(pvpdb.replayList(B).length === 4, '다른 사람 목록은 그대로');
  // 무효 판은 리플레이 없음
  pvpdb.settle({ matchId: 'bb01', uids: [A, B], winnerSeat: null, reason: 'void', turns: 1, startedAt: Date.now(), replay: null });
  assert.strictEqual(pvpdb.replayGet(A, 'bb01'), null);
  console.log('✔ 보관 수 · 정리 · 결과 표시 · 무효 판');
  console.log('✔ 리플레이 테스트 통과');
  process.exit(0);
})().catch(e => { console.error('✘ 실패:', e); process.exit(1); });
