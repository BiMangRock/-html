// test-ynu3.js — v119 영남대 3학년 보스 카드 7장 + 파생 카드 8장
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
for (const n of [...Adv.YNU_3_CARDS, ...Adv.YNU_3_DERIVED]) { const c = card(n); assert.strictEqual(c.scope, 'boss', n); }
for (const n of [...Adv.YNU_3_CARDS.slice(1, 8), ...Adv.YNU_3_DERIVED]) { const c = card(n); assert(c.desc, n + ' 설명');
  const t = E.effectText(c); assert(t && t.length <= 40, `${n} 앞면은 짧게: ${t}`); }
{ const d = Adv.ADV_TEMPLATES.ynu.find(t => t[0] === 'ynu_3')[4]; assert.strictEqual(E.validateDeckList(d), null); assert.strictEqual(d.length, 30);
  assert(Adv.YNU_3_CARDS.every(n => d.filter(x => x === n).length === 2), '보스 카드 12종 2장씩');
  const fill = [...new Set(d)].filter(n => !Adv.YNU_3_CARDS.includes(n)); assert.strictEqual(fill.length, 3, '3종을 특급·전설로 채움');
  assert(fill.every(n => ['특급', '전설'].includes(card(n).rarity)), fill.join());
  assert(!Adv.YNU_3_DERIVED.some(n => d.includes(n)), '파생 카드는 덱에 없음'); }

function setup(seed0 = 11) {
  let seed = seed0; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, n) => { const c = { ...card(n), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const bad = (s, seat, a) => assert(!E.apply(s, a, seat).ok, '막혀야 함');
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const atk = (s, seat, id, target) => ok(E.apply(s, { type: 'ATTACK', attackerId: id, target }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const find = (s, seat, id) => s.seats[seat].board.find(x => x.id === id);

// 코딩테스트: 번아웃 — 주인 턴 시작마다 공격력 -1 (최소 0)
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 2, hp: 5 }); s = play(s, 0, give(s, 0, '코딩테스트')); assert(find(s, 1, a.id).burnout);
  s = end(s, 0); assert.strictEqual(find(s, 1, a.id).atk, 1); s = end(s, 1); s = end(s, 0); assert.strictEqual(find(s, 1, a.id).atk, 0); s = end(s, 1); s = end(s, 0); assert.strictEqual(find(s, 1, a.id).atk, 0, '최소 0'); }

// 조별과제 내부분열: 공격하면 무작위 아군을 때린다 / 아군이 없으면 원래 대상
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 3, hp: 5 }); const b = put(s, 1, { name: 'b', atk: 1, hp: 9 }); const boss = put(s, 0, { name: 'boss', atk: 0, hp: 9 });
  s = play(s, 0, give(s, 0, '조별과제 내부분열')); s = end(s, 0); const hp0 = s.seats[0].hp;
  s = atk(s, 1, a.id, ht(0)); assert.strictEqual(s.seats[0].hp, hp0, '영웅은 안 맞음'); assert.strictEqual(find(s, 1, b.id).hp, 6, '같은 편 b 가 맞음'); }
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 3, hp: 5 }); s = play(s, 0, give(s, 0, '조별과제 내부분열')); s = end(s, 0); const hp0 = s.seats[0].hp;
  s = atk(s, 1, a.id, ht(0)); assert.strictEqual(s.seats[0].hp, hp0 - 3, '혼자면 원래 대상'); }

// SNS: 상대 손 주문 비용 +2 (동전 제외), 상대 방어도 제거
{ let s = setup(); const sp = give(s, 1, '불꽃 화살'); const mn = give(s, 1, '들쥐'); s.seats[1].armor = 7;
  s = play(s, 0, give(s, 0, 'SNS 속 동기들의 합격 수기')); const H = s.seats[1].hand;
  assert.strictEqual(H.find(c => c.id === sp.id).cost, 4); assert.strictEqual(H.find(c => c.id === mn.id).cost, 1); assert.strictEqual(s.seats[1].armor, 0); }

// 쇼츠 알고리즘: 상대 턴 시작에 30% 확률로 턴을 통째로 넘김 (시드 여러 개로 확인)
{ let skipped = 0, kept = 0;
  for (let k = 1; k <= 60; k++) { let s = setup(k * 7 + 1); put(s, 0, card('쇼츠 알고리즘')); s = end(s, 0);
    if (s.turn === 0) skipped++; else kept++; }
  assert(skipped >= 8 && skipped <= 32, '대략 30%: ' + skipped); assert(kept > skipped); }

// 심각한 진로 방황: 양쪽 주문 비용 +1 (동전 제외), 주문 공격력 +3
{ let s = setup(); put(s, 0, card('심각한 진로 방황')); s = end(s, 0);   // 오라 갱신
  const fire = give(s, 1, '불꽃 화살'); const e = put(s, 1, { name: 'e', atk: 1, hp: 1 }); const tgt = put(s, 0, { name: 't', atk: 1, hp: 20 });
  s.seats[1].mana = 2; bad(s, 1, { type: 'PLAY_CARD', cardId: fire.id, target: mt(0, tgt.id) });
  s.seats[1].mana = 3; s = play(s, 1, fire, mt(0, tgt.id)); assert.strictEqual(find(s, 0, tgt.id).hp, 14, '3 + 3 피해'); assert.strictEqual(s.seats[1].mana, 0); }

// 기사 자격증 시험: 내 턴 끝에 상대 전장에 두꺼운 수험서 → 죽으면 그 주인 영웅 4 피해
{ let s = setup(); put(s, 0, card('기사 자격증 시험')); s = end(s, 0); const book = s.seats[1].board.find(x => x.name === '두꺼운 수험서'); assert(book);
  const hp = s.seats[1].hp; s = play(s, 1, give(s, 1, '불꽃 화살'), mt(1, book.id)); assert.strictEqual(s.seats[1].hp, hp - 4); }

// 지옥의 중간고사: 공격 불가, 내 턴이 끝날 때마다 6가지 중 하나 (여러 시드로 모든 결과가 나오는지)
{ const seen = new Set();
  for (let k = 1; k <= 120 && seen.size < 6; k++) { let s = setup(k * 13 + 5); const mid = put(s, 0, card('지옥의 중간고사')); put(s, 1, { name: '적', atk: 4, hp: 6 });
    if (k === 1) bad(s, 0, { type: 'ATTACK', attackerId: mid.id, target: ht(1) });
    const r = E.apply(s, { type: 'END_TURN' }, 0); assert(r.ok); const t = r.state, B = t.seats[1].board, en = B.find(x => x.name === '적');
    if (B.some(x => x.name === '스트레스성 폭식')) seen.add('폭식'); if (B.some(x => x.name === '마감 효과')) seen.add('마감');
    if (en && en.burnout) seen.add('번아웃'); if (en && (en.caffeineOD || en.stunned)) seen.add('카페인'); if (en && en.probation) seen.add('경고장');
    if (!en && t.seats[1].hand.some(c => c.name === '적')) seen.add('재수강'); }
  assert.strictEqual(seen.size, 6, [...seen].join()); }
{ let s = setup(); put(s, 0, card('지옥의 중간고사')); for (let i = 0; i < 7; i++) put(s, 1, { name: 'x' + i, atk: 1, hp: 1 }, { stealth: true }); s = end(s, 0); }   // 자리도 대상도 없으면 아무 일 없음

// 파생 카드들
{ let s = setup(); const l = put(s, 1, { name: 'l', atk: 5, hp: 3 }); const f = put(s, 1, card('스트레스성 폭식')); const r = put(s, 1, { name: 'r', atk: 2, hp: 4 });
  s = end(s, 0); s = end(s, 1); assert.deepStrictEqual([find(s, 1, l.id).atk, find(s, 1, l.id).hp, find(s, 1, r.id).atk, find(s, 1, r.id).hp], [2, 6, 1, 8], '양옆 비만');
  s = end(s, 0); s = end(s, 1); assert.strictEqual(find(s, 1, l.id).hp, 6, '비만은 한 번만'); }
{ let s = setup(); put(s, 1, card('마감 효과')); const hp = s.seats[1].hp; s = end(s, 0); s = end(s, 1); assert.strictEqual(s.seats[1].hp, hp - 1); s = end(s, 0); s = end(s, 1); assert.strictEqual(s.seats[1].hp, hp - 3, '1 → 2'); }
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 1, hp: 5 }); s = play(s, 0, give(s, 0, '카페인 과다복용'), mt(1, a.id)); assert.strictEqual(find(s, 1, a.id).atk, 4);
  s = end(s, 0); s = end(s, 1); const m = find(s, 1, a.id); assert.deepStrictEqual([m.hp, !!m.stunned], [3, true], '주인 턴 끝에 -2, 기절'); s = end(s, 0);
  const m2 = find(s, 1, a.id); if (m2.stunned) bad(s, 1, { type: 'ATTACK', attackerId: a.id, target: ht(0) }); }
{ let s = setup(); const a = put(s, 1, { name: '들쥐', atk: 1, hp: 2 }); s = play(s, 0, give(s, 0, '계절학기 재수강'), mt(1, a.id));
  assert.strictEqual(s.seats[1].board.length, 0); assert.strictEqual(s.seats[1].hand.find(c => c.name === '들쥐').cost, 3); }
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 1, hp: 9 }); s = play(s, 0, give(s, 0, '학사경고장'), mt(1, a.id)); s = end(s, 0);
  for (let i = 0; i < 2; i++) { s = end(s, 1); s = end(s, 0); assert(find(s, 1, a.id), '아직 살아 있음'); } s = end(s, 1); assert(!find(s, 1, a.id), '3번째 주인 턴 끝에 처치'); }
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 4, hp: 9 }); put(s, 1, card('출석 안 부르는 천사 교수님')); s.seats[0].mana = 30;
  s = play(s, 0, give(s, 0, '코딩테스트')); s = play(s, 0, give(s, 0, '학사경고장'), mt(1, a.id)); s = play(s, 0, give(s, 0, '조별과제 내부분열'));
  const m = find(s, 1, a.id); assert(!m.burnout && !m.probation && !m.mutiny, '천사 교수님: 3학년 상태이상 면역'); }
{ let s = setup(); const a = put(s, 1, { name: 'a', atk: 1, hp: 9 }, { burnout: true, mutiny: true, stunned: true, probation: 2 });
  s = play(s, 0, give(s, 0, '침묵'), mt(1, a.id)); const m = find(s, 1, a.id); assert(!m.burnout && !m.mutiny && !m.stunned && !m.probation, '침묵하면 풀림'); }
console.log('✔ 3학년 보스 카드 7장 + 파생 카드 8장');

const d3 = Adv.ADV_TEMPLATES.ynu.find(t => t[0] === 'ynu_3')[4];
const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [d3, E.defaultDeckList()] });
console.log('봇 대전 (3학년 보스 vs 추천 덱)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 38);
const deck2 = [...require(path.join(JS, 'adventure.js')).YNU2_REWARDS.flatMap(n => [n, n]), ...E.defaultDeckList().slice(0, 12)];
const R2 = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [d3, deck2] });
console.log('봇 대전 (3학년 보스 vs 2학년 보상 덱)', JSON.stringify(R2)); assert.strictEqual(R2.errors, 0);
console.log('test-ynu3: 모두 통과');
