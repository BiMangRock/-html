// test-rank.js — v127 랭크전: 별 규칙(rank.js) · 강등 방지선 · 전설 승수 순위 · 대기열 분리 · 정산 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { RANK, ladderNew, ladderApply, ladderLabel, ladderStars } = require(path.join(JS, 'rank.js'));
const db = require('./db');
const pvpdb = require('./pvp-db');
const { createPvp } = require('./pvp-core');

// ---------- 별 규칙 ----------
const play = (s, results) => { for (const w of results) s = ladderApply(s, w, 1000).state; return s; };
{ let s = ladderNew(); assert.strictEqual(ladderLabel(s), '🥉 브론즈 3'); assert.strictEqual(ladderStars(s), '☆☆☆');
  s = play(s, [false, false]); assert.deepStrictEqual([s.tier, s.div, s.stars], [0, 3, 0], '브론즈는 져도 그대로');
  s = play(s, [true, true]); assert.deepStrictEqual([s.div, s.stars, s.streak], [3, 2, 2]);
  const r = ladderApply(s, true); assert.strictEqual(r.gained, 2, '3연승째부터 별 2개'); assert.deepStrictEqual([r.state.div, r.state.stars], [2, 1], '넘친 별은 다음 단계로'); assert(r.promoted);
  s = play(r.state, [false]); assert.deepStrictEqual([s.div, s.stars, s.streak], [2, 1, 0], '브론즈: 패배해도 별 유지, 연승 끊김'); }
{ // 실버 3단계 0별에서 지면: 강등 방지선 (실버 아래로 안 감)
  let s = { ...ladderNew(), tier: 1, div: 3, stars: 0, floor: 1 }; s = play(s, [false]); assert.deepStrictEqual([s.tier, s.div, s.stars], [1, 3, 0]);
  s = { ...ladderNew(), tier: 2, div: 2, stars: 0, floor: 2 }; s = play(s, [false]); assert.deepStrictEqual([s.tier, s.div, s.stars], [2, 3, 2], '단계는 내려감');
  s = { ...ladderNew(), tier: 1, div: 1, stars: 2, floor: 1, streak: 0 }; const r = ladderApply(s, true); assert.deepStrictEqual([r.state.tier, r.state.div, r.state.stars, r.state.floor], [2, 3, 0, 2], '골드 진입 + 방지선'); }
{ // 다이아 1 → 전설, 전설에서는 승수만
  let s = { ...ladderNew(), tier: 4, div: 1, stars: 2, floor: 4 }; const r = ladderApply(s, true, 5555); assert(r.toLegend); assert.deepStrictEqual([r.state.tier, r.state.legendAt], [5, 5555]);
  s = play(r.state, [true, false, true]); assert.strictEqual(s.legendWins, 2); assert.strictEqual(s.tier, 5); assert.strictEqual(ladderLabel(s), '👑 전설'); }
{ // 브론즈 3 → 전설까지 연승이면 몇 판? (15단계 × 별 3 = 45별)
  let s = ladderNew(), n = 0; while (s.tier < RANK.LEGEND) { s = ladderApply(s, true).state; n++; } assert(n >= 22 && n <= 25, '전부 연승이면 약 23판: ' + n); }
console.log('✔ 별 규칙 · 연승 보너스 · 강등 방지선 · 전설');

// ---------- DB: 정산 · 순위 ----------
const mkUser = name => Number(db.prepare('INSERT INTO users(username,pw_hash,created_at) VALUES (?,?,?)').run(name, 'x', Date.now()).lastInsertRowid);
const A = mkUser('alice'), B = mkUser('bob'), C = mkUser('carol'), D = mkUser('dave');
{ const res = pvpdb.settle({ matchId: 'r1', ranked: true, uids: [A, B], winnerSeat: 0, reason: 'normal', turns: 10, startedAt: Date.now() });
  assert.strictEqual(res[0].rank.gained, 1); assert.strictEqual(pvpdb.rankOf(A).stars, 1); assert.strictEqual(pvpdb.rankOf(B).stars, 0);
  const n = pvpdb.settle({ matchId: 'n1', ranked: false, uids: [A, B], winnerSeat: 0, reason: 'normal', turns: 10, startedAt: Date.now() });
  assert.strictEqual(n[0].rank, undefined, '일반전은 랭크 변화 없음'); assert.strictEqual(pvpdb.rankOf(A).stars, 1);
  pvpdb.settle({ matchId: 'r2', ranked: true, uids: [A, B], winnerSeat: null, reason: 'turnlimit', turns: 150, startedAt: Date.now() }); assert.strictEqual(pvpdb.rankOf(A).stars, 1, '무승부는 그대로');
  assert.strictEqual(db.prepare("SELECT ranked FROM pvp_matches WHERE match_id='r1'").get().ranked, 1); }
{ // 전설 순위: 승수 많은 순, 같으면 먼저 온 사람
  const put = (uid, wins, at) => db.prepare('INSERT INTO rank_state(user_id,tier,div,stars,streak,floor,legend_wins,legend_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET tier=excluded.tier, legend_wins=excluded.legend_wins, legend_at=excluded.legend_at').run(uid, 5, 0, 0, 0, 4, wins, at, Date.now());
  put(C, 5, 100); put(D, 5, 50); put(B, 9, 300);
  assert.deepStrictEqual(pvpdb.ranking().legends.map(x => [x.place, x.name, x.wins]), [[1, 'bob', 9], [2, 'dave', 5], [3, 'carol', 5]]);
  assert.strictEqual(pvpdb.legendPlace(C), 3); assert.strictEqual(pvpdb.statsOf(D).rank.place, 2);
  pvpdb.settle({ matchId: 'r3', ranked: true, uids: [C, B], winnerSeat: 0, reason: 'normal', turns: 9, startedAt: Date.now() });
  assert.strictEqual(pvpdb.legendPlace(C), 2, '전설에서 이기면 승수 +1 → 순위 상승'); assert.strictEqual(pvpdb.rankOf(B).legendWins, 9, '전설은 져도 승수 그대로');
  assert.strictEqual(pvpdb.ranking().counts[5], 3); }
console.log('✔ 정산 · 전설 순위');
{ // v128 전체 순위: 모든 계정 · 랭크 안 한 계정은 브론즈 3 · 승/패
  const E2 = mkUser('erin');                                     // 랭크전 0판
  pvpdb.invalidateBoard();
  const all = pvpdb.fullBoard();
  assert.strictEqual(all.length, 5, '가입한 모든 계정');
  assert.deepStrictEqual(all.slice(0, 3).map(x => x.name), ['bob', 'carol', 'dave'], '전설이 맨 위 (승수 순)');
  const e = all.find(x => x.name === 'erin'); assert.deepStrictEqual([e.tier, e.div, e.stars, e.wins, e.losses], [0, 3, 0, 0, 0], '안 한 계정 = 브론즈 3 · ★0 · 0승 0패');
  const a = all.find(x => x.name === 'alice'); assert.deepStrictEqual([a.wins, a.losses], [1, 0], '랭크전 승/패만 센다 (일반전 · 무승부 제외)');
  assert.ok(a.place < e.place, '별 1개가 0개보다 위');
  const c = all.find(x => x.name === 'carol'); assert.deepStrictEqual([c.wins, c.losses], [1, 0]);
  const pb = pvpdb.publicBoard({ limit: 2 }); assert.strictEqual(pb.total, 5); assert.strictEqual(pb.rows.length, 2); assert.strictEqual(pb.rows[0].id, undefined, '공개 응답에 내부 번호 없음');
  assert.strictEqual(pb.counts[0], 2); assert.strictEqual(pb.counts[5], 3);
  const qq = pvpdb.publicBoard({ q: 'ERI' }); assert.strictEqual(qq.matched, 1); assert.strictEqual(qq.rows[0].place, e.place, '검색해도 전체 순위 그대로');
  assert.strictEqual(pvpdb.myBoardRow(E2).name, 'erin');
  assert.strictEqual(pvpdb.publicBoard({ limit: 9999 }).rows.length, 5); }
console.log('✔ 전체 순위 · 공개 순위 · 승/패');

// ---------- 대기열 분리: 랭크전끼리만 만난다 ----------
(async () => {
  const pvp = createPvp({ loadDeck: () => E.defaultDeckList(), settle: g => g.uids.map(() => ({ reward: 0 })), statsOf: uid => ({ rank: pvpdb.rankOut(uid) }), log: () => {}, tickMs: 1000000 });
  const msgs = {}; const conn = uid => ({ send: m => (msgs[uid] = msgs[uid] || []).push(JSON.parse(JSON.stringify(m))) });
  for (const u of [101, 102, 103, 104]) pvp.connect(u, 'u' + u, conn(u));
  assert.ok(pvp.queueJoin(101, 'rank').ok); assert.ok(pvp.queueJoin(102, 'normal').ok);
  assert.strictEqual(pvp.stateOf(101), 'queue'); assert.strictEqual(pvp.stateOf(102), 'queue', '랭크 1명 + 일반 1명은 안 붙음');
  const st = msgs[101].filter(m => m.t === 'status').at(-1); assert.strictEqual(st.waitingRank, 1); assert.strictEqual(st.waiting, 1); assert.strictEqual(st.mode, 'rank');
  assert.ok(pvp.queueJoin(103, 'rank').ok); assert.strictEqual(pvp.stateOf(101), 'match'); assert.strictEqual(pvp.stateOf(103), 'match');
  const mm = msgs[101].filter(m => m.t === 'match').at(-1); assert.strictEqual(mm.ranked, true, '랭크전 표시');
  assert.ok(pvp.queueJoin(104, 'rank').ok); assert.ok(pvp.queueJoin(104, 'normal').ok, '랭크 → 일반 전환'); assert.strictEqual(pvp.stateOf(104), 'match'); assert.strictEqual(pvp.stateOf(102), 'match');
  assert.strictEqual(msgs[102].filter(m => m.t === 'match').at(-1).ranked, false);
  pvp.shutdown();
  console.log('✔ 대기열 분리 · 랭크→일반 전환');
  console.log('test-rank: 모두 통과');
  process.exit(0);
})().catch(e => { console.error('✘ 실패:', e); process.exit(1); });
