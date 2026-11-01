// test-reward3.js — v121 영남대 3학년 클리어 보상 카드 10장 + 절대평가 주문 5종
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
assert.strictEqual(Adv.YNU3_REWARDS.length, 10); assert.deepStrictEqual(Adv.ADV_TEMPLATE_REWARDS.ynu_3, Adv.YNU3_REWARDS);
for (const n of Adv.YNU3_REWARDS) { const c = card(n); assert.strictEqual(c.scope, 'adventure', n); assert(c.art && c.desc, n); assert(E.effectText(c).length <= 30, n); }
for (const g of E.ABS_GRADE) { assert(g.desc && g.flavor, g.name); assert(!E.CARD_POOL.some(c => c.name === g.name)); }
{ const b = Adv.advMakeBundles(Adv.YNU3_REWARDS, n => 0); assert.deepStrictEqual(b.map(x => x.length).sort(), [6, 6, 8]); }

function setup(seed0 = 3) {
  let seed = seed0; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, c0) => { const c = { ...(typeof c0 === 'string' ? card(c0) : structuredClone(c0)), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const abs = n => E.ABS_GRADE.find(x => x.name === n);
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const bad = (s, seat, a) => assert(!E.apply(s, a, seat).ok, '막혀야 함');
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const atk = (s, seat, id, target) => ok(E.apply(s, { type: 'ATTACK', attackerId: id, target }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const find = (s, seat, id) => s.seats[seat].board.find(x => x.id === id);

// 첫 연애!: 공격력 1 + 받는 피해 +1
{ let s = setup(); const e = put(s, 1, { name: 'e', atk: 6, hp: 5 }); s = play(s, 0, give(s, 0, '첫 연애!'), mt(1, e.id));
  assert.strictEqual(find(s, 1, e.id).atk, 1); s = play(s, 0, give(s, 0, '불꽃 화살'), mt(1, e.id)); assert.strictEqual(find(s, 1, e.id).hp, 1, '3+1 피해'); }
// 꿀교양 줍줍: 절대평가 2장, 이번 턴 -1, 턴이 끝나면 원래 비용
{ let s = setup(); s = play(s, 0, give(s, 0, '꿀교양 줍줍')); const H = s.seats[0].hand; assert.strictEqual(H.length, 2);
  for (const c of H) { const base = abs(c.name); assert(base); assert.strictEqual(c.cost, Math.max(0, base.cost - 1)); }
  s = end(s, 0); for (const c of s.seats[0].hand.filter(x => abs(x.name))) assert.strictEqual(c.cost, abs(c.name).cost, '할인 끝'); }
// 절대평가 5종
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 2 }); const h = s.seats[0].hand.length;
  s = play(s, 0, give(s, 0, abs('단순 출석 체크')), mt(0, a.id)); const m = find(s, 0, a.id); assert.deepStrictEqual([m.hp, !!m.taunt], [5, true]); assert.strictEqual(s.seats[0].hand.length, h + 1); }
{ let s = setup(); s.seats[0].deck = [{ ...card('불꽃 화살'), id: s.nextId++, inDeck: true }, { ...card('들쥐'), id: s.nextId++, inDeck: true }];
  s = play(s, 0, give(s, 0, abs('오픈북 테스트'))); assert.strictEqual(s.pending.options.length, 1);
  s = ok(E.apply(s, { type: 'CHOOSE', index: 0 }, 0)); assert.strictEqual(s.seats[0].hand[0].name, '불꽃 화살'); assert.strictEqual(s.seats[0].hand[0].cost, 1);
  assert.strictEqual(s.seats[0].deck.length, 1, '덱에서 꺼내 옴'); }
{ let s = setup(); s.seats[0].hp = 20; s = play(s, 0, give(s, 0, abs('교수님의 너그러운 자비'))); assert.strictEqual(s.seats[0].hp, 24);
  const f = give(s, 0, '불꽃 화살'), f2 = give(s, 0, '불꽃 화살'); const e = put(s, 1, { name: 'e', atk: 1, hp: 9 }); s.seats[0].mana = 2;
  s = play(s, 0, f, mt(1, e.id)); assert.strictEqual(s.seats[0].mana, 2, '첫 주문 공짜'); s = play(s, 0, f2, mt(1, e.id)); assert.strictEqual(s.seats[0].mana, 0, '두 번째는 원래 비용'); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 6 }); const e = put(s, 1, { name: 'e', atk: 2, hp: 9 });
  s = play(s, 0, give(s, 0, abs('P/F (패스 앤 페일)')), mt(0, a.id)); s = atk(s, 0, a.id, mt(1, e.id));
  const m = find(s, 0, a.id); assert.deepStrictEqual([m.atk, !!m.shield, m.hp], [5, true, 4], 'Pass'); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 6 }, { hp: 1 }); s = play(s, 0, give(s, 0, abs('전원 A+ 확정')));
  assert.deepStrictEqual([find(s, 0, a.id).atk, find(s, 0, a.id).hp], [3, 8]); }
// 휴학: 다음 내 턴까지 면역 + 4 회복
{ let s = setup(); s.seats[0].hp = 20; s = play(s, 0, give(s, 0, '휴학')); assert.strictEqual(s.seats[0].hp, 24); s = end(s, 0);
  const e = put(s, 1, { name: 'e', atk: 5, hp: 5 }); s = atk(s, 1, e.id, ht(0)); s = play(s, 1, give(s, 1, '불꽃 화살'), ht(0)); assert.strictEqual(s.seats[0].hp, 24, '면역');
  s = end(s, 1); assert(!s.seats[0].heroImmune, '내 턴이 오면 끝'); }
// 교환학생의 꿈: 덱 맨 위 교환
{ let s = setup(); const a = s.seats[0].deck[s.seats[0].deck.length - 1].id, b = s.seats[1].deck[s.seats[1].deck.length - 1].id;
  s = play(s, 0, give(s, 0, '교환학생의 꿈')); assert.strictEqual(s.seats[0].deck.at(-1).id, b); assert.strictEqual(s.seats[1].deck.at(-1).id, a); }
// 공모전 나가기: 1/1 넷, 좋은 효과·나쁜 효과
{ let s = setup(); s = play(s, 0, give(s, 0, '공모전 나가기')); const B = s.seats[0].board; assert.strictEqual(B.length, 4); assert(B.every(m => m.name === '밤샘 개발자'));
  assert(B.every(m => m.frozen || m.burnout || m.mutiny || m.probation || m.stunned), '나쁜 효과'); }
// 캠퍼스 잔디밭 돗자리: 은신 + 3 회복, 턴 끝에 손으로 (내구도 3번)
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 9 }, { hp: 2 });
  for (let k = 0; k < 3; k++) { const mat = k === 0 ? give(s, 0, '캠퍼스 잔디밭 돗자리') : s.seats[0].hand.find(c => c.name === '캠퍼스 잔디밭 돗자리'); assert(mat, '손에 있음 ' + k);
    s = play(s, 0, mat, mt(0, a.id)); assert(find(s, 0, a.id).stealth); s = end(s, 0); s = end(s, 1); }
  assert.strictEqual(find(s, 0, a.id).hp, 9); assert(!s.seats[0].hand.some(c => c.name === '캠퍼스 잔디밭 돗자리'), '3번 쓰면 사라짐'); }
// 수강신청 올클: 3장 뽑고 이번 턴 -1
{ let s = setup(); s = play(s, 0, give(s, 0, '수강신청 올클')); assert.strictEqual(s.seats[0].hand.length, 3); assert(s.seats[0].hand.every(c => c.tempDisc || c.cost === 0)); }
// 판 엎기: 모든 하수인 영구 제거(죽메 없음), 양쪽 손패 버림
{ let s = setup(); put(s, 0, card('부정한 알')); put(s, 1, { name: 'e', atk: 1, hp: 1 }); give(s, 1, '들쥐'); give(s, 0, '들쥐');
  s = play(s, 0, give(s, 0, '판 엎기: 자퇴서 제출')); assert.strictEqual(s.seats[0].board.length + s.seats[1].board.length, 0, '닭도 안 나옴');
  assert.strictEqual(s.seats[0].hand.length + s.seats[1].hand.length, 0); }
// 쓰레기 산: 매 턴 끝에 다른 모든 캐릭터 2 피해
{ let s = setup(); put(s, 0, card('자취방의 거대 쓰레기 산')); const a = put(s, 0, { name: 'a', atk: 1, hp: 9 }); const e = put(s, 1, { name: 'e', atk: 1, hp: 9 });
  const h0 = s.seats[0].hp, h1 = s.seats[1].hp; s = end(s, 0); assert.deepStrictEqual([s.seats[0].hp, s.seats[1].hp, find(s, 0, a.id).hp, find(s, 1, e.id).hp], [h0 - 2, h1 - 2, 7, 7]);
  s = end(s, 1); assert.strictEqual(find(s, 0, a.id).hp, 5, '상대 턴 끝에도'); assert.strictEqual(s.seats[0].board[0].hp, 10, '자신은 안 맞음'); }
// 전과/편입 엑소더스: 내 하수인 전부 파괴 → 그 수만큼 8코 하수인
{ let s = setup(); put(s, 0, { name: 'a', atk: 1, hp: 1 }); put(s, 0, { name: 'b', atk: 1, hp: 1 }); s = play(s, 0, give(s, 0, '전과 / 편입 엑소더스'));
  assert.strictEqual(s.seats[0].board.length, 2); assert(s.seats[0].board.every(m => m.cost === 8)); }
console.log('✔ 3학년 보상 카드 10장 + 절대평가 주문 5종');

const deck = [...Adv.YNU3_REWARDS.flatMap(n => [n, n]), ...E.defaultDeckList().slice(0, 10)];
assert.strictEqual(E.validateDeckList(deck), null);
const d3 = Adv.ADV_TEMPLATES.ynu.find(t => t[0] === 'ynu_3')[4];
const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [deck, d3] });
console.log('봇 대전 (3학년 보상 덱 vs 3학년 보스)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 36);
console.log('test-reward3: 모두 통과');
