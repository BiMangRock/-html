// test-ynu2.js — v117 영남대 2학년 보스 카드 14장 (동아리 회장은 3학년)
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
for (const n of Adv.YNU_2_CARDS) card(n);
{ const d = Adv.ADV_TEMPLATES.ynu.find(t => t[0] === 'ynu_2')[4]; assert.strictEqual(E.validateDeckList(d), null);
  assert(Adv.YNU_2_CARDS.slice(0, 13).every(n => d.filter(x => x === n).length === 2), '전용 13종 2장'); assert(Adv.YNU_COMMON.every(n => d.filter(x => x === n).length === 1), '공통 4종 1장'); }
function setup() {
  let seed = 9; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, n) => { const c = { ...card(n), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const atk = (s, seat, id, target) => ok(E.apply(s, { type: 'ATTACK', attackerId: id, target }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const bear = { name: '시험 곰', atk: 5, hp: 5 };

// 입대 직전의 광기: 돌진, 내 턴 끝에 내 영웅 2
{ let s = setup(); const m = put(s, 0, card('입대 직전의 광기'), { summoned: true }); const hp = s.seats[1].hp; s = atk(s, 0, m.id, ht(1)); assert.strictEqual(s.seats[1].hp, hp - 3, '돌진');
  const mine = s.seats[0].hp; s = end(s, 0); assert.strictEqual(s.seats[0].hp, mine - 2); }
// 독박 쓴 조장: 아군 대신 맞고, 받는 피해 1 고정, 죽메로 아군 하나 처치
{ let s = setup(); const g = put(s, 0, card('독박 쓴 조장')); const a = put(s, 0, { name: '팀원', atk: 1, hp: 3 }); put(s, 0, { name: '팀원2', atk: 1, hp: 3 }); const e = put(s, 1, { name: '적', atk: 7, hp: 9 });
  s = end(s, 0); s = atk(s, 1, e.id, mt(0, a.id));
  assert.strictEqual(s.seats[0].board.find(x => x.name === '팀원').hp, 3, '팀원은 멀쩡'); assert.strictEqual(s.seats[0].board.find(x => x.name === '독박 쓴 조장').hp, 4, '조장이 1만 맞음');
  s.seats[0].board.find(x => x.name === '독박 쓴 조장').hp = 1; const e2 = put(s, 1, { name: '적2', atk: 3, hp: 9 }); s = atk(s, 1, e2.id, mt(0, a.id));
  assert(!s.seats[0].board.some(x => x.name === '독박 쓴 조장'), '조장 사망'); assert.strictEqual(s.seats[0].board.length, 1, '죽메로 무임승차 1명 처치'); }
// 전 CC: 양옆 침묵 + 턴 끝 내 영웅 2
{ let s = setup(); put(s, 0, bear, { taunt: true }); put(s, 0, bear, { taunt: true }); const c = give(s, 0, '전공 필수에서 마주친 전 CC');
  s.seats[0].board.splice(1, 0); s = play(s, 0, c); s.seats[0].board = [s.seats[0].board[0], s.seats[0].board[2], s.seats[0].board[1]];
  let t = setup(); const l = put(t, 0, bear, { taunt: true }); const r = put(t, 0, bear, { taunt: true }); t.seats[0].board = [l];
  const cc = give(t, 0, '전공 필수에서 마주친 전 CC'); t = play(t, 0, cc); t.seats[0].board.push(r);   // [곰, 전CC] 상태에서 냈으므로 왼쪽만
  assert(!t.seats[0].board[0].taunt, '옆 하수인 침묵'); const hp = t.seats[0].hp; t = end(t, 0); assert.strictEqual(t.seats[0].hp, hp - 2); }
// 외계어 전공 강의: +4/+4 + 영구 혼란 (공격 후에도 유지)
{ let s = setup(); put(s, 0, { name: 'm', atk: 1, hp: 1 }); s = play(s, 0, give(s, 0, '외계어 전공 강의'));
  const m = s.seats[0].board[0]; assert.deepStrictEqual([m.atk, m.hp, m.confused, m.confusedPerm], [5, 5, true, true]);
  s = end(s, 0); assert(s.seats[0].board.length === 0 || s.seats[0].board[0].confused, '영구 혼란 유지'); }
// 읍소 메일: 주문 발견
{ let s = setup(); s = play(s, 0, give(s, 0, '증원 요청 읍소 메일')); assert(s.pending && s.pending.kind === 'discover'); }
// 21학점: 4장 뽑고 6 피해, 턴 즉시 종료
{ let s = setup(); const hp = s.seats[0].hp; s = play(s, 0, give(s, 0, '21학점의 무리수'));
  assert.strictEqual(s.seats[0].hp, hp - 6); assert.strictEqual(s.turn, 1, '상대 턴으로'); assert.strictEqual(s.seats[0].hand.length, 4); }
// 개편된 족보: 손의 주문 버리고 그 수만큼 무작위 하수인 처치
{ let s = setup(); give(s, 0, '지식의 서'); give(s, 0, '불꽃 화살'); give(s, 0, '들쥐'); put(s, 1, bear); put(s, 1, bear); put(s, 1, bear);
  s = play(s, 0, give(s, 0, '10년 만에 개편된 족보')); assert.deepStrictEqual(s.seats[0].hand.map(c => c.name), ['들쥐']); assert.strictEqual(s.seats[1].board.length, 1); }
// 밥약: 적 하수인 뺏고 내 마나 수정 2 파괴
{ let s = setup(); const e = put(s, 1, bear); s = play(s, 0, give(s, 0, '후배의 밥약 공격'), mt(1, e.id));
  assert.strictEqual(s.seats[0].board.length, 1); assert.strictEqual(s.seats[1].board.length, 0); assert.strictEqual(s.seats[0].maxMana, 8); }
// 필름 끊긴 선배: 무작위 아군의 흑기사 (대신 맞음) + 다음 턴 빙결
{ let s = setup(); const a = put(s, 0, { name: '후배', atk: 1, hp: 2 }); s = play(s, 0, give(s, 0, '필름 끊긴 멋진 선배'));
  assert.strictEqual(s.seats[0].board[0].knightBy, s.seats[0].board[1].id); const e = put(s, 1, { name: 'e', atk: 3, hp: 9 });
  s = end(s, 0); s = atk(s, 1, e.id, mt(0, a.id)); assert.strictEqual(s.seats[0].board[0].hp, 2, '후배 대신'); assert.strictEqual(s.seats[0].board[1].hp, 5);
  s = end(s, 1); assert(s.seats[0].board[1].frozen, '선배는 빙결'); }
// 지식 밑천 선배: 아군 1학년(원래 비용 1) 소환 시 공격력 0
{ let s = setup(); put(s, 0, card('지식 밑천 드러난 선배')); s.seats[0].seenIds = s.seats[0].board.map(x => x.id);
  s = play(s, 0, give(s, 0, '들쥐')); assert.strictEqual(s.seats[0].board[0].atk, 0); }
// 입영 통지서: 3턴 휴면 후 3배로
{ let s = setup(); const m = put(s, 0, { ...card('들쥐') }); s = play(s, 0, give(s, 0, '입영 통지서'), mt(0, m.id)); assert.strictEqual(s.seats[0].board.length, 0);
  for (let t = 0; t < 3; t++) { s = end(s, 0); s = end(s, 1); }
  const x = s.seats[0].board.find(y => y.name === '들쥐'); assert(x, '전역'); assert.deepStrictEqual([x.atk, x.hp], [3, 6]); }
// 겜태기: 공격 불가 + 상대 전장에 게임 불감증 (죽으면 그 주인 손의 하수인 제거)
{ let s = setup(); s = play(s, 0, give(s, 0, '지독한 겜태기')); const tok = s.seats[1].board.find(x => x.name === '게임 불감증'); assert(tok && s.seats[0].board[0].cantAttack);
  s = end(s, 0); s.seats[1].hand = []; give(s, 1, '들쥐'); give(s, 1, '지식의 서'); const k = put(s, 0, { name: 'k', atk: 5, hp: 5 });
  s = end(s, 1); s = atk(s, 0, k.id, mt(1, tok.id)); assert(!s.seats[1].hand.some(c => c.name === '들쥐'), '손의 하수인 제거'); }
// 3대3 미팅: 내 3/3 오크 셋(속공) + 상대 3/3 엘프 셋
{ let s = setup(); s = play(s, 0, give(s, 0, '어색해진 3대3 미팅'));
  assert.strictEqual(s.seats[0].board.filter(x => x.name === '오크' && x.rush).length, 3); assert.strictEqual(s.seats[1].board.filter(x => x.name === '블러드 엘프').length, 3); }
// 동아리 회장(3학년): 과부하 3, 턴 끝 신입생 +1/+1, 자신 생명력 -1
{ let s = setup(); s = play(s, 0, give(s, 0, '영혼 탈곡된 동아리 회장')); assert.strictEqual(s.seats[0].overloadNext, 3); put(s, 0, { ...card('들쥐') }, { maxHp: 2 });
  s = end(s, 0); assert.strictEqual(s.seats[0].board[0].hp, 5); assert.deepStrictEqual([s.seats[0].board[1].atk, s.seats[0].board[1].hp], [2, 3]); }
console.log('✔ 2학년 보스 카드 14장');

const d2 = Adv.ADV_TEMPLATES.ynu.find(t => t[0] === 'ynu_2')[4];
const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [d2, E.defaultDeckList()] });
console.log('봇 대전 (2학년 보스 vs 추천 덱)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 38);
console.log('test-ynu2: 모두 통과');
