// test-reward2.js — v118 영남대 2학년 클리어 보상 카드 9장 「캠퍼스의 은인들」 + 만물상 응원 주문 9종
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };

// 카드 데이터: 모험 전용 · 그림 · 짧은 앞면 문구 · 자세한 설명
assert.strictEqual(Adv.YNU2_REWARDS.length, 9);
assert.deepStrictEqual(Adv.ADV_TEMPLATE_REWARDS.ynu_2, Adv.YNU2_REWARDS);
for (const n of Adv.YNU2_REWARDS) {
  const c = card(n); assert.strictEqual(c.scope, 'adventure', n); assert(c.art, n + ' 그림'); assert(c.desc && c.desc.length > 20, n + ' 설명');
  const t = E.effectText(c); assert(t && t.length <= 45, `${n} 앞면 문구는 짧게: ${t}`);
}
assert(!E.GEN_POOL.some(c => Adv.YNU2_REWARDS.includes(c.name)), '무작위 생성 풀에 없음');
assert.strictEqual(E.YNU2_GADGETS.length, 9);
for (const g of E.YNU2_GADGETS) { assert.strictEqual(g.cost, 1); assert(g.desc && g.flavor, g.name); assert(!E.CARD_POOL.some(c => c.name === g.name), '응원 주문은 덱용 카드가 아님'); }
{ const b = Adv.advMakeBundles(Adv.YNU2_REWARDS, n => 0); assert.strictEqual(b.length, 3); assert(b.every(x => x.length === 6), '묶음마다 3종 × 2장'); }

function setup() {
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, c0) => { const c = { ...(typeof c0 === 'string' ? card(c0) : c0), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const gadget = n => E.YNU2_GADGETS.find(g => g.name === n);
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const bad = (s, seat, a) => { const r = E.apply(s, a, seat); assert(!r.ok, '막혀야 함'); return r.error; };
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const atk = (s, seat, id, target) => ok(E.apply(s, { type: 'ATTACK', attackerId: id, target }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const byName = (s, seat, n) => s.seats[seat].board.find(x => x.name === n);
const bear = { name: '시험 곰', atk: 5, hp: 5 };

// 길고양이: 내 턴 종료마다 무작위 아군 생명력 +2
{ let s = setup(); s = play(s, 0, give(s, 0, '캠퍼스 명예 총장 길고양이')); s = end(s, 0);
  const c = byName(s, 0, '캠퍼스 명예 총장 길고양이'); assert.deepStrictEqual([c.hp, c.maxHp], [5, 5], '혼자면 자기 자신 +2'); }

// 천사 교수님: 적의 빙결·혼란·침묵·소심함을 막는다 (교수님이 없으면 걸린다)
{ for (const prof of [true, false]) {
    let s = setup(); if (prof) put(s, 0, card('출석 안 부르는 천사 교수님'));
    const a = put(s, 0, { name: '아군', atk: 4, hp: 6 }, { taunt: true }); s = end(s, 0);
    s = play(s, 1, give(s, 1, '가채점표 멘탈 붕괴'));                                           // 번아웃(빙결) + 소심함
    let m = s.seats[0].board.find(x => x.id === a.id);
    assert.strictEqual(m.frozen, prof ? undefined : true, '빙결'); assert.strictEqual(m.atk, prof ? 4 : 1, '소심함');
    s = play(s, 1, give(s, 1, '침묵'), mt(0, a.id)); m = s.seats[0].board.find(x => x.id === a.id);
    assert.strictEqual(!!m.taunt, prof, '침묵');
    s = play(s, 1, give(s, 1, '인생 첫 술')); m = s.seats[0].board.find(x => x.id === a.id);
    assert.strictEqual(!!m.confused, !prof, '혼란');
  } }
// 교수님 자신도 침묵에 면역, 교수님이 죽으면 효과가 사라진다
{ let s = setup(); const p = put(s, 0, card('출석 안 부르는 천사 교수님')); const a = put(s, 0, { name: '아군', atk: 4, hp: 6 }); s = end(s, 0);
  s = play(s, 1, give(s, 1, '침묵'), mt(0, p.id)); assert(s.seats[0].board.find(x => x.id === p.id).statusAura, '자기 자신도 보호');
  s.seats[0].board.find(x => x.id === p.id).hp = 1; s = play(s, 1, give(s, 1, '불꽃 화살'), mt(0, p.id)); s = play(s, 1, give(s, 1, '가채점표 멘탈 붕괴'));
  assert.strictEqual(s.seats[0].board.find(x => x.id === a.id).atk, 1, '교수님이 죽으면 걸림'); }

// PPT의 신: 양옆 +2 공격력·도발, 적 하나 이번 턴 소심함 → 내 턴 끝나면 원래대로
{ let s = setup(); const l = put(s, 0, { name: '왼', atk: 1, hp: 3 }); const r = put(s, 0, { name: '오', atk: 1, hp: 3 }); const e = put(s, 1, bear);
  s.seats[0].board = [l]; const c = give(s, 0, 'PPT의 신 & 발표 장인'); s = play(s, 0, c, mt(1, e.id)); s.seats[0].board.push({ ...r });
  const L = s.seats[0].board[0]; assert.deepStrictEqual([L.atk, !!L.taunt], [3, true], '왼쪽 +2·도발');
  assert.strictEqual(s.seats[1].board[0].atk, 1, '적 소심함'); s = end(s, 0); assert.strictEqual(s.seats[1].board[0].atk, 5, '턴 끝나면 원래대로'); }
{ let s = setup(); const c = give(s, 0, 'PPT의 신 & 발표 장인'); s = play(s, 0, c); assert.strictEqual(s.seats[0].board.length, 1, '적이 없어도 낼 수 있음'); }

// 욕쟁이 이모님: 서비스 계란말이(0) 2장 → 하수인 생명력 +3
{ let s = setup(); s = play(s, 0, give(s, 0, '단골 술집 욕쟁이 이모님'));
  const eggs = s.seats[0].hand.filter(c => c.name === '서비스 계란말이'); assert.strictEqual(eggs.length, 2); assert.strictEqual(eggs[0].cost, 0);
  const m = s.seats[0].board[0]; s = play(s, 0, eggs[0], mt(0, m.id)); assert.deepStrictEqual([s.seats[0].board[0].hp, s.seats[0].board[0].maxHp], [7, 7]); }

// 만물상: 전투의 함성 + 죽음의 메아리로 응원 주문 1장씩
{ let s = setup(); s = play(s, 0, give(s, 0, '과방 붙박이 만물상'));
  const names = E.YNU2_GADGETS.map(g => g.name); assert.strictEqual(s.seats[0].hand.filter(c => names.includes(c.name)).length, 1);
  s.seats[0].board[0].hp = 1; s = play(s, 0, give(s, 0, '불꽃 화살'), mt(0, s.seats[0].board[0].id));
  assert.strictEqual(s.seats[0].board.length, 0); assert.strictEqual(s.seats[0].hand.filter(c => names.includes(c.name)).length, 2, '죽음의 메아리'); }

// 전역 복학생: 속공, 처치하면 남은 공격력만큼 방어도 (영웅 공격은 낸 턴에 불가)
{ let s = setup(); const e = put(s, 1, { name: '적', atk: 2, hp: 3 }); s = play(s, 0, give(s, 0, '의욕 넘치는 전역 복학생'));
  const v = s.seats[0].board[0]; bad(s, 0, { type: 'ATTACK', attackerId: v.id, target: ht(1) });
  s = atk(s, 0, v.id, mt(1, e.id)); assert.strictEqual(s.seats[0].armor, 4, '7 - 3 = 4'); }
{ let s = setup(); const e = put(s, 1, { name: '단단', atk: 1, hp: 20 }); s = play(s, 0, give(s, 0, '의욕 넘치는 전역 복학생'));
  s = atk(s, 0, s.seats[0].board[0].id, mt(1, e.id)); assert.strictEqual(s.seats[0].armor || 0, 0, '못 잡으면 없음'); }

// 쪽잠: 이번 턴 공격 불가, 생명력 완전 회복, 내 영웅 방어도 +3 → 다음 턴엔 공격 가능
{ let s = setup(); const m = put(s, 0, { name: '피곤', atk: 3, hp: 8 }, { hp: 2 }); s = play(s, 0, give(s, 0, '과방 소파에서의 쪽잠'), mt(0, m.id));
  assert.strictEqual(s.seats[0].board[0].hp, 8); assert.strictEqual(s.seats[0].armor, 3); bad(s, 0, { type: 'ATTACK', attackerId: m.id, target: ht(1) });
  s = end(s, 0); s = end(s, 1); s = atk(s, 0, m.id, ht(1)); }

// 지도교수: 적 하수인을 데려와 석박통합 연구원으로 (능력치 유지, 능력 제거) → 내 턴 끝에 영웅 3 회복 + 주문 1장
{ let s = setup(); const e = put(s, 1, { name: '적 에이스', atk: 6, hp: 6 }, { taunt: true, shield: true }); s.seats[0].hp = 20;
  s = play(s, 0, give(s, 0, '연구실의 군주 지도교수'), mt(1, e.id));
  assert.strictEqual(s.seats[1].board.length, 0); const lab = byName(s, 0, '석박통합 연구원'); assert(lab);
  assert.deepStrictEqual([lab.atk, lab.hp, !!lab.taunt, !!lab.shield], [6, 6, false, false]); assert(lab.desc);
  const h = s.seats[0].hand.length; s = end(s, 0); assert.strictEqual(s.seats[0].hp, 23); assert.strictEqual(s.seats[0].hand.length, h + 1);
  assert.strictEqual(s.seats[0].hand[s.seats[0].hand.length - 1].type, 'spell'); }
{ let s = setup(); for (let i = 0; i < 6; i++) put(s, 0, { name: 'x' + i, atk: 1, hp: 1 }); put(s, 1, bear);
  s = play(s, 0, give(s, 0, '연구실의 군주 지도교수')); assert.strictEqual(s.seats[1].board.length, 1, '자리가 없으면 그냥 소환'); }

// 수강신청 서버 대폭발: 적 하수인 빙결 + 적 영웅 행동 불가 (다음 내 턴까지) + 올클리어(0)
{ let s = setup(); const e = put(s, 1, bear); s.seats[1].heroAtk = 0;
  s = play(s, 0, give(s, 0, '수강신청 서버 대폭발')); assert(s.seats[1].board[0].frozen); assert(s.seats[1].heroFrozen);
  const ac = s.seats[0].hand.find(c => c.name === '올클리어'); assert(ac && ac.cost === 0);
  const hand = s.seats[0].hand.length; s.seats[0].mana = 0; s = play(s, 0, ac); assert.strictEqual(s.seats[0].mana, 2); assert.strictEqual(s.seats[0].hand.length, hand - 1 + 2);
  s = end(s, 0); bad(s, 1, { type: 'ATTACK', attackerId: e.id, target: ht(0) }); s.seats[1].heroAtk = 3; bad(s, 1, { type: 'HERO_ATTACK', target: ht(0) });
  s = end(s, 1); s = end(s, 0); assert(!s.seats[1].board[0].frozen && !s.seats[1].heroFrozen, '적 턴이 지나면 풀림'); }

// ---- 응원 주문 9종 ----
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 4, hp: 6 }, { hp: 2 }); s = end(s, 0); s = play(s, 1, give(s, 1, '가채점표 멘탈 붕괴')); s = end(s, 1);
  let m = s.seats[0].board[0]; assert.strictEqual(m.atk, 1);
  s = play(s, 0, give(s, 0, gadget('타이레놀 한 알')), mt(0, a.id)); m = s.seats[0].board[0];
  assert.deepStrictEqual([m.atk, m.hp, !!m.frozen], [4, 4, false], '타이레놀: 소심함·번아웃 해제 + 2 회복'); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 5 }, { taunt: true }); s = play(s, 0, give(s, 0, gadget('에어팟 노이즈 캔슬링')), mt(0, a.id)); s = end(s, 0);
  const sil = give(s, 1, '침묵'); bad(s, 1, { type: 'PLAY_CARD', cardId: sil.id, target: mt(0, a.id) });
  s = play(s, 1, give(s, 1, '인생 첫 술')); assert(!s.seats[0].board[0].confused, '에어팟: 상태이상 차단'); s = end(s, 1);
  assert(!s.seats[0].board[0].airpods, '내 턴이 오면 끝'); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 2 }); s = play(s, 0, give(s, 0, gadget('비타민C 한 포 (레모나)')), mt(0, a.id)); assert(s.seats[0].board[0].shield); }
{ let s = setup(); const c = give(s, 0, '들쥐'); s = play(s, 0, c); const m = s.seats[0].board[0]; const e = put(s, 1, { name: 'e', atk: 0, hp: 3 });
  s = play(s, 0, give(s, 0, gadget('메가커피 1L 아메리카노')), mt(0, m.id)); s = atk(s, 0, m.id, mt(1, e.id)); assert.strictEqual(s.seats[1].board.length, 0, '낸 턴에 3 공격력으로 처치');
  s = end(s, 0); assert.strictEqual(s.seats[0].board[0].atk, 1, '이번 턴만'); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 2 }); s = play(s, 0, give(s, 0, gadget('포스트잇 응원 쪽지')), mt(0, a.id)); assert.deepStrictEqual([s.seats[0].board[0].atk, s.seats[0].board[0].hp], [3, 3]); }
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 2, hp: 2 }, { frozen: true }); s = play(s, 0, give(s, 0, gadget('보조배터리 대여')), mt(0, a.id));
  assert.deepStrictEqual([s.seats[0].board[0].hp, !!s.seats[0].board[0].frozen], [5, false]); }
{ let s = setup(); s = play(s, 0, give(s, 0, gadget('A4 한 장 요약본'))); assert(s.pending && s.pending.options.length === 3);
  assert(s.pending.options.every(o => o.name !== 'A4 한 장 요약본' && E.YNU2_GADGETS.some(g => g.name === o.name)));
  s = ok(E.apply(s, { type: 'CHOOSE', index: 0 }, 0)); assert.strictEqual(s.seats[0].hand.length, 1); }
{ let s = setup(); s.seats[0].deck.push({ ...card('들쥐'), id: s.nextId++, inDeck: true }); s = play(s, 0, give(s, 0, gadget('편의점 1+1 쿠폰')));
  assert.strictEqual(s.seats[0].hand.filter(c => c.name === '들쥐').length, 2, '비용 1이면 1+1'); }
{ let s = setup(); s.seats[0].deck.push({ ...card('데스윙'), id: s.nextId++, inDeck: true }); s = play(s, 0, give(s, 0, gadget('편의점 1+1 쿠폰')));
  assert.strictEqual(s.seats[0].hand.length, 1, '비싸면 1장만'); }
{ let s = setup(); s.seats[0].hp = 20; s.seats[0].mana = 1; s = play(s, 0, give(s, 0, gadget('선배 찬스 (커피 기프티콘)'))); assert.deepStrictEqual([s.seats[0].mana, s.seats[0].hp], [1, 22]); }
console.log('✔ 2학년 보상 카드 9장 + 응원 주문 9종');

// 봇 대전: 보상 카드를 넣은 덱으로 오류 없이 돌아가는지
const deck = [...Adv.YNU2_REWARDS.flatMap(n => [n, n]), ...E.defaultDeckList().slice(0, 12)];
assert.strictEqual(E.validateDeckList(deck), null);
const R = E.selfPlay(60, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [deck, E.defaultDeckList()] });
console.log('봇 대전 (보상 카드 덱 vs 추천 덱)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 57);
const R2 = E.selfPlay(30, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [deck, deck] });
assert.strictEqual(R2.errors, 0);
console.log('test-reward2: 모두 통과');
