// test-pvp-db.js — 유저 대전의 DB 쪽 확인: 내 덱 불러오기 · 보상 · 하루 한도 · 같은 상대 한도 · 전적 (임시 DB 사용)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PVP } = require(path.join(JS, 'pvp.js'));
const db = require('./db');
const pvpdb = require('./pvp-db');
const { walletRow, ensureWallet } = require('./wallet');
const { ensureAtLeast, ensureCollection } = require('./collection');
const { createPvp } = require('./pvp-core');

const mkUser = name => Number(db.prepare('INSERT INTO users(username,pw_hash,created_at) VALUES (?,?,?)').run(name, 'x', Date.now()).lastInsertRowid);
const gold = uid => walletRow(uid).gold;
const rows = () => db.prepare('SELECT * FROM pvp_matches ORDER BY id').all();
const game = (a, b, o = {}) => ({ matchId: 'm', uids: [a, b], winnerSeat: 0, reason: 'normal', turns: 20, startedAt: Date.now() - 1000, ...o });
const saved = { ...PVP };
const reset = () => Object.assign(PVP, saved);

(async () => {
  const A = mkUser('alice'), B = mkUser('bob'), C = mkUser('carol');

  // ===== 덱 =====
  assert.deepStrictEqual(pvpdb.loadDeck(A), E.defaultDeckList(), '저장한 덱이 없으면 추천 덱');
  const own = E.defaultDeckList();
  db.prepare('INSERT INTO decks(user_id,deck_json,updated_at) VALUES (?,?,?)').run(A, JSON.stringify(own.slice().reverse()), Date.now());
  assert.deepStrictEqual(pvpdb.loadDeck(A), own.slice().reverse(), '저장한 덱을 쓴다');
  db.prepare('UPDATE decks SET deck_json=? WHERE user_id=?').run(JSON.stringify(own.slice(0, 29).concat(['데스윙'])), A);   // 안 가진 전설 카드가 섞인 덱 (조작)
  assert.deepStrictEqual(pvpdb.loadDeck(A), E.defaultDeckList(), '안 가진 카드가 든 덱은 추천 덱으로 대체');
  db.prepare('UPDATE decks SET deck_json=? WHERE user_id=?').run('not json', A);
  assert.deepStrictEqual(pvpdb.loadDeck(A), E.defaultDeckList(), '깨진 덱 데이터도 안전');
  console.log('✔ 대전용 덱 불러오기');

  // ===== 보상 =====
  assert.strictEqual(db.prepare('SELECT 1 FROM wallets WHERE user_id=?').get(A), undefined);
  let r = pvpdb.settle(game(A, B));
  assert.strictEqual(r[0].reward, PVP.WIN_GOLD); assert.strictEqual(r[1].reward, 0);
  assert.strictEqual(gold(A), 100 + PVP.WIN_GOLD, '지갑이 없던 승자는 시작 골드 100 + 보상');
  assert.strictEqual(r[0].wallet.gold, 100 + PVP.WIN_GOLD); assert.strictEqual(r[0].wallet.rev, walletRow(A).rev, '새 저장 번호를 돌려준다');
  assert.strictEqual(r[1].wallet, undefined, '진 사람은 지갑이 안 바뀐다');
  assert.strictEqual(walletRow(A).rev, 2, '보상 지급 때 rev 가 올라간다 (다른 탭이 낡은 값을 덮어쓰지 못하게)');
  assert.strictEqual(rows().length, 1); assert.strictEqual(rows()[0].winner, A); assert.strictEqual(rows()[0].reward, PVP.WIN_GOLD);
  // 좌석 1 이 이겨도 같다
  r = pvpdb.settle(game(A, B, { winnerSeat: 1 })); assert.strictEqual(r[1].reward, PVP.WIN_GOLD); assert.strictEqual(gold(B), 100 + PVP.WIN_GOLD);
  console.log('✔ 승리 보상 (지갑 생성 · rev 증가 · 기록)');

  // ===== 보상이 없는 경우 =====
  const g0 = gold(A);
  r = pvpdb.settle(game(A, C, { winnerSeat: null })); assert.strictEqual(r[0].reward + r[1].reward, 0, '무승부'); assert.strictEqual(gold(A), g0);
  r = pvpdb.settle(game(A, C, { reason: 'void', winnerSeat: null })); assert.strictEqual(r[0].reward, 0, '무효 판');
  r = pvpdb.settle(game(A, C, { reason: 'void' })); assert.strictEqual(r[0].reward, 0, '무효 판은 승자가 있어도 보상 없음');
  console.log('✔ 보상 없는 경우 (무승부 · 무효)');

  // ===== 보상 한도 없음: 짧은 판 · 하루 많이 · 같은 상대와 계속 =====
  const D = mkUser('dave'), F = mkUser('frank');
  const short = pvpdb.settle(game(D, F, { turns: 1 }));
  assert.strictEqual(short[0].reward, PVP.WIN_GOLD, '1턴 만에 끝난 판도 보상'); assert.strictEqual(short[0].why, undefined);
  const many = []; for (let i = 0; i < 30; i++) many.push(pvpdb.settle(game(i % 2 ? F : D, i % 2 ? D : F))[0]);
  assert.ok(many.every(w => w.reward === PVP.WIN_GOLD && w.why === undefined), '같은 두 사람이 하루 30판을 해도 매번 보상');
  assert.strictEqual(many[28].rewardsToday, 16, '하루 10승을 넘겨도 승리 수가 계속 쌓인다');
  assert.strictEqual(gold(D), 100 + PVP.WIN_GOLD * (1 + 15), '더해진 골드가 정확하다');
  assert.strictEqual(many[0].dailyCap, undefined, '더는 한도 값을 내려주지 않는다');
  reset();
  console.log('✔ 보상 한도 없음 (짧은 판 · 하루 여러 판 · 같은 상대)');

  // ===== 전적 =====
  const S1 = mkUser('s1'), S2 = mkUser('s2');
  pvpdb.settle(game(S1, S2)); pvpdb.settle(game(S1, S2)); pvpdb.settle(game(S2, S1)); pvpdb.settle(game(S1, S2, { winnerSeat: null })); pvpdb.settle(game(S1, S2, { reason: 'void', winnerSeat: null }));
  const st = pvpdb.statsOf(S1); assert.deepStrictEqual(st.record, { wins: 2, losses: 1, draws: 1 }, '무효 판은 전적에서 뺀다');
  assert.deepStrictEqual(pvpdb.statsOf(S2).record, { wins: 1, losses: 2, draws: 1 });
  assert.strictEqual(st.winGold, PVP.WIN_GOLD);
  console.log('✔ 전적 집계');

  // ===== 실패하면 전부 취소 (골드만 오르거나 기록만 남는 일 없음) =====
  const before = rows().length;
  assert.throws(() => pvpdb.settle(game(S1, 987654)), /constraint|FOREIGN/i);
  assert.strictEqual(rows().length, before, '실패한 정산은 기록도 남기지 않는다');
  console.log('✔ 정산 실패 시 롤백');

  // ===== 코어 + DB 를 이어서: 실제 봇 대전 → 지갑 · 기록 =====
  const P = mkUser('p1'), Q = mkUser('p2'); ensureCollection(P); ensureCollection(Q); ensureWallet(P); ensureWallet(Q);
  const pvp = createPvp({ cfg: { turnMs: 20000, mulliganMs: 20000, reconnectMs: 20000 }, loadDeck: pvpdb.loadDeck, settle: pvpdb.settle, statsOf: pvpdb.statsOf });
  const msgs = { [P]: [], [Q]: [] }, last = {};
  for (const [uid, bot] of [[P, E.BotPlayers.rule], [Q, E.BotPlayers.rule2]]) {
    pvp.connect(uid, 'u' + uid, { send: raw => {
      const m = JSON.parse(JSON.stringify(raw)); msgs[uid].push(m); if (m.t !== 'match') return; last[uid] = m;
      if (m.phase === 'mulligan' && !m.mulligan.done) setImmediate(() => pvp.mulligan(uid, m.matchId, []));
      if (m.phase === 'play' && !m.result && m.view.turn === m.seat) setImmediate(() => { if (last[uid].seq === m.seq && !last[uid].result) pvp.action(uid, m.matchId, m.seq, bot.decide(m.view)); });
    } });
  }
  const gP = gold(P), gQ = gold(Q);
  assert.ok(pvp.queueJoin(P).ok && pvp.queueJoin(Q).ok);
  const t0 = Date.now(); while (!(last[P] && last[P].result && last[Q] && last[Q].result)) { if (Date.now() - t0 > 20000) throw new Error('판이 안 끝남'); await new Promise(r => setTimeout(r, 5)); }
  const rp = last[P].result, rq = last[Q].result;
  if (rp.draw) assert.strictEqual(rp.reward + rq.reward, 0);
  else {
    const w = rp.youWon ? rp : rq, wuid = rp.youWon ? P : Q;
    assert.strictEqual(w.reward, PVP.WIN_GOLD); assert.strictEqual(gold(wuid), (rp.youWon ? gP : gQ) + PVP.WIN_GOLD, '이긴 사람 지갑에 실제로 반영');
    assert.strictEqual(gold(wuid === P ? Q : P), wuid === P ? gQ : gP, '진 사람 지갑은 그대로');
    assert.strictEqual(w.wallet.gold, gold(wuid), '결과 메시지에 새 지갑이 들어 있다');
    assert.strictEqual(w.rewardsToday, 1);
  }
  const row = rows().find(x => x.p0 === P || x.p1 === P); assert.ok(row && row.reason === 'normal');
  assert.strictEqual(msgs[P].find(m => m.t === 'status').record !== undefined, true, '상태 메시지에 전적이 들어 있다');
  pvp.shutdown();
  console.log('✔ 실제 대전 → 지갑·기록 반영');

  console.log('✔ PvP DB 테스트 통과');
  process.exit(0);
})().catch(e => { console.error('✘ 실패:', e); process.exit(1); });
