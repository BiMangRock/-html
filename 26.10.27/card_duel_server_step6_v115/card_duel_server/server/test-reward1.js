// test-reward1.js — v117 영남대 1단계(수능) 클리어 보상 카드 15장 효과 + 보상 묶음 만들기 규칙
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));
const Adv = require(path.join(JS, 'adventure.js'));

// ---------- 묶음 규칙 ----------
for (const n of Adv.SUNEUNG_REWARDS) { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); assert.strictEqual(c.scope, 'adventure', n); assert(c.art, n + ' 그림'); }
for (let k = 1; k <= 40; k++) {
  let seed = k; const rint = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
  const b = Adv.advMakeBundles(Adv.SUNEUNG_REWARDS, rint);
  assert.strictEqual(b.length, 3); assert(b.every(x => x.length === 10), '5종 × 2장');
  assert.strictEqual(new Set(b.flat()).size, 15, '15종이 겹치지 않게 전부 나뉨');
  const b7 = Adv.advMakeBundles(Adv.SUNEUNG_REWARDS.slice(0, 7), rint).map(x => x.length / 2).sort();
  assert.deepStrictEqual(b7, [2, 2, 3], '7종 → 2·2·3 (남는 1종은 무작위 묶음)');
  const b8 = Adv.advMakeBundles(Adv.SUNEUNG_REWARDS.slice(0, 8), rint).map(x => x.length / 2).sort();
  assert.deepStrictEqual(b8, [2, 3, 3], '8종 → 남는 2종은 서로 다른 묶음');
}
assert.deepStrictEqual(Adv.advMakeBundles(['들쥐'], () => 0), [['들쥐', '들쥐']], '1종이면 묶음 1개');
const deck = Adv.SUNEUNG_REWARDS.flatMap(n => [n, n]);
assert.strictEqual(Col.validateDeckScope(deck, E.CARD_POOL, 'adventure'), null, '모험 덱에는 들어감');
assert(Col.validateDeckScope(deck, E.CARD_POOL, 'normal'), '일반 덱에는 못 들어감');
console.log('✔ 보상 묶음 규칙 (3등분 · 남는 종류 무작위 · 2장씩)');
{ const run = [...E.defaultDeckList(), ...Adv.SUNEUNG_REWARDS.slice(0, 5).flatMap(n => [n, n])];   // 입학 덱: 30 + 보상 10 = 40장
  const g = E.newGame(Math.random, { decks: [run, Adv.SUNEUNG_CARDS.flatMap(n => [n, n])], freeDeck: [true, false] });
  const P = g.seats[0]; assert.strictEqual(P.deck.length + P.hand.length - (P.hand.some(c => c.name === '동전') ? 1 : 0), 40, '40장 입학 덱으로 시작');
  const R = E.selfPlay(10, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [run, Adv.SUNEUNG_CARDS.flatMap(n => [n, n])], freeDeck: [true, false] }); assert.strictEqual(R.errors, 0); }
console.log('✔ 30장 넘는 입학 덱으로 대전');

// ---------- 시험용 상태 ----------
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, n); return c; };
function setup() {
  let seed = 11; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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

// 멘붕의 카페 알바생: 내 턴 시작 → 동전 2개 또는 내 영웅 3 피해
{ const seen = new Set();
  for (let k = 0; k < 30; k++) { let s = setup(); s.seed = k * 7 + 1; put(s, 0, card('멘붕의 카페 알바생')); s = end(s, 0); s.seats[1].hand = []; s = end(s, 1);
    const coins = s.seats[0].hand.filter(c => c.name === '동전').length; seen.add(coins === 2 ? 'coin' : (s.seats[0].hp === 27 ? 'hurt' : '?')); }
  assert(seen.has('coin') && seen.has('hurt') && !seen.has('?'), [...seen]); }
// 야간 편의점 근무자: 피해를 입을 때마다 상대 전장에 만취한 손님 (공격 불가, 양옆 공격력 -1)
{ let s = setup(); const w = put(s, 0, card('야간 편의점 근무자')); const a = put(s, 1, { name: '늑대', atk: 3, hp: 3 }); put(s, 1, { name: '곰2', atk: 4, hp: 9 });
  s = end(s, 0); s = atk(s, 1, a.id, mt(0, w.id));
  const drunk = s.seats[1].board.find(m => m.name === '만취한 손님'); assert(drunk && drunk.cantAttack, '만취한 손님 소환');
  const i = s.seats[1].board.indexOf(drunk), nb = s.seats[1].board[i - 1]; assert.strictEqual(nb.atk, 3, '옆 하수인 공격력 -1 (곰2 4→3)'); }
// 일당 15만 원: 마나 전부 회복, 다음 내 2턴 동안 아군 전부 빙결 + 영웅 공격 불가
{ let s = setup(); s.seats[0].mana = 2; const m = put(s, 0, bear); s = play(s, 0, give(s, 0, '일당 15만 원의 유혹'));
  assert.strictEqual(s.seats[0].mana, 10);
  for (let t = 0; t < 2; t++) { s = end(s, 0); s = end(s, 1); assert(s.seats[0].board[0].frozen, `${t + 1}번째 턴 근육통`);
    s.seats[0].heroAtk = 2; assert(!E.apply(s, { type: 'HERO_ATTACK', target: ht(1) }, 0).ok, '영웅도 빙결'); }
  s = end(s, 0); s = end(s, 1); assert(!s.seats[0].board[0].frozen, '3번째 턴엔 풀림'); }
// 불판 세척 특공대: 적 하수인 침묵
{ let s = setup(); const t = put(s, 1, bear, { taunt: true, shield: true }); s = play(s, 0, give(s, 0, '불판 세척 특공대'), mt(1, t.id));
  const x = s.seats[1].board[0]; assert(!x.taunt && !x.shield); }
// 마의 T자 코스: 적 하수인을 손으로 + 하수인을 낼 때 50% 실격 + 턴마다 내구도 -1
{ let s = setup(); const t = put(s, 1, { ...card('들쥐'), hp: 2 }); s = play(s, 0, give(s, 0, '마의 T자 코스'), mt(1, t.id));
  assert.strictEqual(s.seats[1].board.length, 0); assert(s.seats[1].hand.some(c => c.name === '들쥐'), '손으로 돌아감');
  const course = s.seats[0].board[0]; assert(course.cantAttack && course.tCourse);
  let fail = 0, pass = 0;
  for (let k = 0; k < 40; k++) { let x = structuredClone(s); x.seed = k * 131 + 3; x = play(x, 0, give(x, 0, '들쥐')); x.seats[0].board.some(m => m.name === '들쥐') ? pass++ : fail++; }
  assert(fail > 5 && pass > 5, `50% 실격 (실격 ${fail}, 성공 ${pass})`);
  s = end(s, 0); assert.strictEqual(s.seats[0].board[0].hp, 2, '내구도 -1');
  s = end(s, 1); s = end(s, 0); s = end(s, 1); s = end(s, 0); assert(!s.seats[0].board.some(m => m.tCourse), '내구도 0 → 사라짐'); }
// 파격적인 탈색: 아군 하수인이 무작위 하수인으로
{ let s = setup(); const m = put(s, 0, { name: '시험 쥐', atk: 1, hp: 1 }); s = play(s, 0, give(s, 0, '파격적인 탈색 3연타'), mt(0, m.id));
  assert.notStrictEqual(s.seats[0].board[0].name, '시험 쥐'); assert(E.GEN_POOL.some(c => c.name === s.seats[0].board[0].name)); }
// 안경 탈출 수술: 적 은신 해제
{ let s = setup(); put(s, 1, bear, { stealth: true }); s = play(s, 0, give(s, 0, '안경 탈출 수술')); assert(!s.seats[1].board[0].stealth); }
// 헬스장 3개월: 3장 뽑고, 안 낸 카드는 턴 종료에 버리고 1장당 방어도 +1
{ let s = setup(); s = play(s, 0, give(s, 0, '헬스장 3개월 등록')); assert.strictEqual(s.seats[0].hand.length, 3);
  const one = s.seats[0].hand.find(c => c.cost <= 10 && (c.type === 'minion' ? s.seats[0].board.length < 7 : true) && !E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: null }, 0).error);
  if (one) s = play(s, 0, one);
  const left = s.seats[0].hand.filter(c => c.gymTemp).length; s = end(s, 0);
  assert.strictEqual(s.seats[0].hand.filter(c => c.gymTemp).length, 0); assert.strictEqual(s.seats[0].armor, left, '버린 수만큼 방어도'); }
// 방구석 통기타: 3턴 뒤 내 턴 시작에 파괴 + 당근마켓 정산금 2장
{ let s = setup(); s = play(s, 0, give(s, 0, '방구석 통기타'));
  for (let t = 1; t <= 3; t++) { s = end(s, 0); s.seats[0].hand = []; s = end(s, 1); }
  assert(!s.seats[0].board.some(m => m.name === '방구석 통기타'), '파괴됨'); assert.strictEqual(s.seats[0].hand.filter(c => c.name === '당근마켓 정산금').length, 2); }
// 청춘의 내일로 티켓: 아군 전부 버프
{ let s = setup(); for (let i = 0; i < 4; i++) put(s, 0, { name: 'm' + i, atk: 1, hp: 1 });
  s = play(s, 0, give(s, 0, '청춘의 내일로 티켓'));
  assert(s.seats[0].board.every(m => m.hp === 3 || m.atk === 3 || m.windfury || m.taunt || m.shield || m.lifesteal), '모두 버프'); }
// 당당한 주민등록증: 영웅 빙결 해제 + 방어도 5 + 이번 턴 공격력 2
{ let s = setup(); s.seats[0].heroFrozen = true; s = play(s, 0, give(s, 0, '당당한 주민등록증'));
  assert.strictEqual(s.seats[0].armor, 5); const hp1 = s.seats[1].hp; s = ok(E.apply(s, { type: 'HERO_ATTACK', target: ht(1) }, 0)); assert.strictEqual(s.seats[1].hp, hp1 - 2); }
// 인생 첫 술: 모든 적 하수인 혼란 (조종 불가, 그 주인의 턴이 끝날 때 무작위 공격 → 해제)
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 2, hp: 7 }); s = play(s, 0, give(s, 0, '인생 첫 술'));
  assert(s.seats[1].board[0].confused); s = end(s, 0);
  const r = E.apply(s, { type: 'ATTACK', attackerId: a.id, target: ht(0) }, 1); assert(!r.ok && /혼란/.test(r.error), '조종 불가');
  const hp = [s.seats[0].hp, s.seats[1].hp]; s = end(s, 1);
  assert.notDeepStrictEqual([s.seats[0].hp, s.seats[1].hp], hp, '턴 끝에 어느 영웅이든 맞음 (전장에 다른 하수인 없음)');
  assert(!s.seats[1].board[0].confused, '한 번 공격하면 혼란 해제'); }
// 캐리 머신: 적 하수인을 처치하면 다시 공격
{ let s = setup(); const c = put(s, 0, card('롤 다이아 승급전: 캐리 머신')); const a = put(s, 1, { name: 'a', atk: 1, hp: 2 }); const b = put(s, 1, { name: 'b', atk: 1, hp: 2 });
  s = atk(s, 0, c.id, mt(1, a.id)); s = atk(s, 0, c.id, mt(1, b.id)); assert.strictEqual(s.seats[1].board.length, 0, '연속 킬');
  const hp1 = s.seats[1].hp; s = atk(s, 0, c.id, ht(1)); assert.strictEqual(s.seats[1].hp, hp1 - 6);
  assert(!E.apply(s, { type: 'ATTACK', attackerId: c.id, target: ht(1) }, 0).ok, '영웅을 쳤으면 끝'); }
// PC방 올나잇: 빈자리를 4/4 속공으로 + 3장 뽑기
{ let s = setup(); put(s, 0, bear); s = play(s, 0, give(s, 0, 'PC방 30시간 올나잇 파티'));
  assert.strictEqual(s.seats[0].board.filter(m => m.name === 'PC방 올빼미' && m.rush).length, 6); assert.strictEqual(s.seats[0].hand.length, 3); }
// 무한 백수 라이프: 적 하수인 전멸 + 풀피 + 비용 -1 로 덱에
{ let s = setup(); put(s, 1, bear, { shield: true }); put(s, 1, bear); s.seats[0].hp = 9; const d0 = s.seats[0].deck.length;
  s = play(s, 0, give(s, 0, '봉인 해제: 무한 백수 라이프'));
  assert.strictEqual(s.seats[1].board.length, 0); assert.strictEqual(s.seats[0].hp, 30); assert.strictEqual(s.seats[0].deck.length, d0 + 1);
  assert.strictEqual(s.seats[0].deck.find(c => c.name === '봉인 해제: 무한 백수 라이프').cost, 9); }
console.log('✔ 보상 카드 15장 효과');

// 보상 카드로 만든 모험 덱 vs 수능 보스: 오류 없이 끝나는지 (봇이 내 쪽 카드도 쓴다)
const advDeck = [...Adv.SUNEUNG_REWARDS.flatMap(n => [n, n])];
const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [advDeck, Adv.SUNEUNG_CARDS.flatMap(n => [n, n])] });
console.log('봇 대전 (보상 카드 덱 vs 수능 보스)', JSON.stringify(R));
assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 38);
console.log('test-reward1: 모두 통과');
