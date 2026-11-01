// test-ynu4.js — v123 영남대 4학년(마지막 단계) 보스 카드 15장 + 파생 카드
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
const own4 = Adv.YNU_4_CARDS.filter(n => !Adv.YNU_COMMON.includes(n));
assert.strictEqual(own4.length, 15);
for (const n of [...own4, ...Adv.YNU_4_DERIVED]) { const c = card(n); assert.strictEqual(c.scope, 'boss', n); assert(/4학년/.test(c.tribe || (c.school || []).join()), n + ' 4학년 표시'); }
for (const n of own4) { assert(card(n).desc, n); if (n !== '무한동력 논문 발표!') assert(card(n).art, n + ' 그림'); }   // 논문 발표는 그림 없음
{ const tpl = Adv.ADV_TEMPLATES.ynu; assert.strictEqual(tpl.at(-1)[0], 'ynu_4', '4학년이 마지막'); assert(!tpl.some(t => t[0] === 'ynu_final'));
  const d = tpl.at(-1)[4]; assert.strictEqual(E.validateDeckList(d), null); assert(own4.every(n => d.includes(n))); assert(!Adv.YNU_4_DERIVED.some(n => d.includes(n))); }

function setup(seed0 = 21) {
  let seed = seed0; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, c0) => { const c = { ...(typeof c0 === 'string' ? card(c0) : structuredClone(c0)), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const atk = (s, seat, id, target) => ok(E.apply(s, { type: 'ATTACK', attackerId: id, target }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const find = (s, seat, id) => s.seats[seat].board.find(x => x.id === id);
const names = (s, seat) => s.seats[seat].board.map(x => x.name);

// 멍서스: 죽을 피해 → 1 남기고 최대 생명력 -5
{ let s = setup(); put(s, 0, card('졸업 유예자 멍서스')); s.seats[0].hp = 3; s = end(s, 0); s = play(s, 1, give(s, 1, '화염구'), ht(0));
  assert(!s.over); assert.strictEqual(s.seats[0].hp, 1); assert.strictEqual(s.seats[0].maxHp, 25); }
// 황금 시간표: 턴 끝에 남긴 마나만큼 +1/+1
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 1 }); s = play(s, 0, give(s, 0, '황금 시간표')); s.seats[0].mana = 3; s = end(s, 0);
  assert.deepStrictEqual([find(s, 0, a.id).atk, find(s, 0, a.id).hp], [4, 4]); }
// 잔디밭 낮잠터: 턴 끝 자동 발동 (은신·흡혈·4 회복), 내구도 3
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 9 }, { hp: 2 }); s = play(s, 0, give(s, 0, '잔디밭 낮잠터')); s = end(s, 0);
  const m = find(s, 0, a.id); assert.deepStrictEqual([m.hp, !!m.stealth, !!m.lifesteal], [6, true, true]);
  for (let i = 0; i < 2; i++) { s = end(s, 1); s = end(s, 0); } assert(!names(s, 0).includes('잔디밭 낮잠터'), '내구도 다하면 사라짐'); }
// 키키: 혼자면 도발·보호막, 턴 끝 회복·비만
{ let s = setup(); s = play(s, 0, give(s, 0, '당당한 혼밥러, 키키')); let k = s.seats[0].board[0]; assert(k.taunt && k.shield, '혼자면 도발·보호막');
  s = end(s, 0); k = s.seats[0].board[0]; assert.deepStrictEqual([k.atk, k.hp, k.maxHp], [1, 8, 8], '비만');
  s = end(s, 1); s = play(s, 0, give(s, 0, '들쥐')); k = s.seats[0].board[0]; assert(!k.taunt && !k.shield, '친구가 오면 꺼짐'); }
// 노련한 4학년 조장: 다른 아군 속공
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 1 }, { summoned: true }); s = play(s, 0, give(s, 0, '노련한 4학년 조장')); assert(find(s, 0, a.id).rush); }
// 교수님의 관용: 다음 주문 -2
{ let s = setup(); s = play(s, 0, give(s, 0, '교수님의 관용')); s.seats[0].mana = 2; s = play(s, 0, give(s, 0, '화염구'), ht(1)); assert.strictEqual(s.seats[0].mana, 0); }
// 캡스톤 → 조수 메카 둘 → 소형 기계
{ let s = setup(); const c = put(s, 0, card('캡스톤 걸작 메카')); c.hp = 1; s = play(s, 0, give(s, 0, '불꽃 화살'), mt(0, c.id));
  assert.deepStrictEqual(names(s, 0), ['특허 출원된 조수 메카', '특허 출원된 조수 메카']);
  const m = s.seats[0].board[0]; m.hp = 1; s = play(s, 0, give(s, 0, '불꽃 화살'), mt(0, m.id)); assert.strictEqual(names(s, 0).filter(n => n === '소형 기계').length, 2); }
// 무한동력 ↔ 아직 작동중
{ let s = setup(); const p = put(s, 0, card('무한동력 논문 발표!')); s = play(s, 0, give(s, 0, '불꽃 화살'), mt(0, p.id)); assert.deepStrictEqual(names(s, 0), ['아직 작동중!']);
  const q = s.seats[0].board[0]; q.hp = 1; s = play(s, 0, give(s, 0, '불꽃 화살'), mt(0, q.id)); assert.deepStrictEqual(names(s, 0), ['무한동력 논문 발표!']); assert(s.seats[0].board[0].rush); }
// 서류 전형 합격: 상대가 턴을 끝낼 때 마나 수정 +2 (10 초과 가능) · 2장
{ let s = setup(); s = play(s, 0, give(s, 0, '서류 전형 합격!')); s = end(s, 0); const h = s.seats[0].hand.length; s = end(s, 1);
  assert.strictEqual(s.seats[0].maxMana, 12); assert.strictEqual(s.seats[0].mana, 12); assert.strictEqual(s.seats[0].hand.length, h + 3, '2장 + 턴 시작 1장'); }
// 최종 면접 올패스: 방어도 8, +3, 이번 턴 면역
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 3 }); const e = put(s, 1, { name: 'e', atk: 9, hp: 9 }); s = play(s, 0, give(s, 0, '최종 면접 올패스'));
  assert.strictEqual(s.seats[0].armor, 8); s = atk(s, 0, a.id, mt(1, e.id)); assert.deepStrictEqual([find(s, 0, a.id).hp, find(s, 1, e.id).hp], [3, 4]); s = end(s, 0); assert.strictEqual(find(s, 0, a.id).atk, 2); }
// 마지막 벚꽃길: 아군 둘 +1/+1·죽메(영웅 3 회복), 6/6 4학년 소환
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 1 }); s = play(s, 0, give(s, 0, '마지막 벚꽃길')); s = end(s, 0);
  assert(names(s, 0).includes('4학년')); const m = find(s, 0, a.id); assert.strictEqual(m.deathHeroHeal, 3); s.seats[0].hp = 20;
  s = play(s, 1, give(s, 1, '불꽃 화살'), mt(0, a.id)); assert.strictEqual(s.seats[0].hp, 23); }
// 학사모 던지기: 이번 턴 소환 수만큼 +1
{ let s = setup(); s = play(s, 0, give(s, 0, '들쥐')); const e = put(s, 1, { name: 'e', atk: 1, hp: 9 }); const hp = s.seats[1].hp;
  s = play(s, 0, give(s, 0, '학사모 던지기')); assert.strictEqual(s.seats[1].hp, hp - 3); assert.strictEqual(find(s, 1, e.id).hp, 6); }
// 밤샘 종강 총회: 축하 음료 3장, 마나 2 회복
{ let s = setup(); s = play(s, 0, give(s, 0, '밤샘 종강 총회')); assert.strictEqual(s.seats[0].hand.length, 3); assert.strictEqual(s.seats[0].mana, 8);
  assert(s.seats[0].hand.every(c => E.DRINKS.some(d => d.name === c.name))); for (const c of [...s.seats[0].hand]) { const t = c.effect.type === 'postIt' ? (put(s, 0, { name: 'x', atk: 1, hp: 1 }), mt(0, s.seats[0].board.at(-1).id)) : null; s = play(s, 0, c, t); } }
// 판다렌 선배: 양쪽 마나 수정 1
{ let s = setup(); s = play(s, 0, give(s, 0, '캠퍼스의 신선, 판다렌 선배')); assert.deepStrictEqual([s.seats[0].maxMana, s.seats[1].maxMana, s.seats[0].mana], [1, 1, 1]); s = end(s, 0); assert.strictEqual(s.seats[1].maxMana, 2); }
// 사회 초년생: 손에 6코+ 있으면 +2/+2·돌진
{ let s = setup(); give(s, 0, '데스윙'); s = play(s, 0, give(s, 0, '어엿한 사회 초년생')); const m = s.seats[0].board[0]; assert.deepStrictEqual([m.atk, m.hp, !!m.charge], [7, 7, true]); s = atk(s, 0, m.id, ht(1)); }
{ let s = setup(); s = play(s, 0, give(s, 0, '어엿한 사회 초년생')); assert.strictEqual(s.seats[0].board[0].atk, 5); }
console.log('✔ 4학년 보스 카드 15장 + 파생 카드');

const d4 = Adv.ADV_TEMPLATES.ynu.at(-1)[4];
const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [d4, E.defaultDeckList()] });
console.log('봇 대전 (4학년 보스 vs 추천 덱)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 36);
console.log('test-ynu4: 모두 통과');
