// test-suneung.js — v117 영남대 모험 0단계 「수능」 보스 전용 카드 15장의 효과 + 보스 덱으로 봇 대전
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));
const Adv = require(path.join(JS, 'adventure.js'));

const BOSS_DECK = Adv.SUNEUNG_CARDS.flatMap(n => [n, n]);
assert.strictEqual(E.validateDeckList(BOSS_DECK), null, '수능 보스 덱 30장 규칙');
assert(Col.validateDeckScope(BOSS_DECK, E.CARD_POOL, 'adventure'), '유저 덱에는 못 넣음');
for (const n of Adv.SUNEUNG_CARDS) assert.strictEqual(E.CARD_POOL.find(c => c.name === n).scope, 'boss', n + ' 보스 전용');
const tpl = Adv.ADV_TEMPLATES.ynu; assert.strictEqual(tpl.length, 10, '영남대 10단계'); assert.deepStrictEqual(tpl[0][4], BOSS_DECK, '수능 틀에 덱 포함');
assert.strictEqual(Adv.advCleanIcon('images/boss/ynu_suneung.jpg'), 'images/boss/ynu_suneung.jpg', '그림 아이콘 허용');
assert.strictEqual(Adv.advCleanIcon('images/../secret.png').length <= 4, true, '경로 탈출 거부');

// ---------- 시험용 상태 만들기 ----------
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
function setup() {
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [BOSS_DECK, E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, n) => { const c = { ...card(n), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const mt = (seat, id) => ({ kind: 'minion', seat, id }), ht = seat => ({ kind: 'hero', seat });
const bear = { name: '시험 곰', atk: 5, hp: 5 };

// OMR 카드 밀려쓰기: 하수인 주인 교체, 넘어온 하수인은 이번 턴 공격 불가
{ let s = setup(); put(s, 0, bear); put(s, 1, bear); put(s, 1, { name: '시험 늑대', atk: 3, hp: 3 });
  s = play(s, 0, give(s, 0, 'OMR 카드 밀려쓰기'));
  assert.strictEqual(s.seats[0].board.length, 2); assert.strictEqual(s.seats[1].board.length, 1);
  assert(s.seats[0].board.every(m => m.summoned), '넘어온 하수인은 소환 직후 상태'); }
// 규정 위반: 보호막 무시 제거
{ let s = setup(); const m = put(s, 1, bear, { shield: true });
  s = play(s, 0, give(s, 0, '4교시 탐구영역 응시 규정 위반'), mt(1, m.id)); assert.strictEqual(s.seats[1].board.length, 0); }
// 비행기 소음: 상대의 다음 턴 주문 금지 (동전은 허용), 그 턴이 끝나면 풀림
{ let s = setup(); s = play(s, 0, give(s, 0, '듣기평가 시간 비행기 소음 통제 실패'));
  const sp = give(s, 1, '지식의 서'); s = end(s, 0); s.seats[1].mana = 10;
  const r = E.apply(s, { type: 'PLAY_CARD', cardId: sp.id, target: null }, 1); assert(!r.ok && /비행기/.test(r.error), '주문 금지');
  assert(E.viewFor(s, 1).me.noSpell, '화면에 표시할 값');
  s = end(s, 1); assert(!s.seats[1].noSpell, '한 턴 뒤 풀림'); }
// 수정테이프: 회복 4 + 상대 손패 카드 비용 +1
{ let s = setup(); s.seats[0].hp = 20; const x = give(s, 1, '지식의 서'), before = x.cost;
  s = play(s, 0, give(s, 0, '수정테이프 빌리기 (손들기)'), ht(0));
  assert.strictEqual(s.seats[0].hp, 24); assert.strictEqual(s.seats[1].hand[0].cost, before + 1); }
// 가채점표: 적 하수인 공격력 1 + 빙결 → 상대 턴에 공격 못 함
{ let s = setup(); const m = put(s, 1, bear); s = play(s, 0, give(s, 0, '가채점표 멘탈 붕괴'));
  const t = s.seats[1].board[0]; assert.strictEqual(t.atk, 1); assert(t.frozen);
  s = end(s, 0); assert(!E.apply(s, { type: 'ATTACK', attackerId: m.id, target: ht(0) }, 1).ok, '번아웃: 공격 불가');
  s = end(s, 1); assert(!s.seats[1].board[0].frozen, '한 턴 뒤 풀림'); }
// 비문학 3연타: 도발 1/1·3/3·5/5, 공격 불가
{ let s = setup(); s = play(s, 0, give(s, 0, '비문학 3연타 (철학+경제+양자역학)'));
  const b = s.seats[0].board; assert.deepStrictEqual(b.map(m => m.atk + '/' + m.hp), ['1/1', '3/3', '5/5']); assert(b.every(m => m.taunt && m.cantAttack));
  s = end(s, 0); s = end(s, 1);
  const r = E.apply(s, { type: 'ATTACK', attackerId: b[2].id, target: ht(1) }, 0); assert(!r.ok && /공격할 수 없/.test(r.error)); }
// 종료령 5분 전: 4장 뽑고 1장 버림
{ let s = setup(); const d0 = s.seats[0].deck.length; s = play(s, 0, give(s, 0, '종료령 5분 전 (마킹 타임어택)'));
  assert.strictEqual(s.seats[0].hand.length, 3); assert.strictEqual(s.seats[0].deck.length, d0 - 4); }
// 물수능 컷 폭발: 다 죽을 때까지 3씩 반복, 살아남은 수만큼 방어도 2
{ let s = setup(); put(s, 1, { name: 'a', atk: 2, hp: 2 }); put(s, 1, { name: 'b', atk: 4, hp: 8 });
  s = play(s, 0, give(s, 0, '물수능 컷 폭발')); assert.strictEqual(s.seats[1].board.length, 0); assert.strictEqual(s.seats[0].armor, 4); }
// N수생: 속공 + 빈 마나 수정
{ let s = setup(); s.seats[0].maxMana = 5; s = play(s, 0, give(s, 0, '시험지 팍팍 넘기는 N수생'));
  assert.strictEqual(s.seats[0].maxMana, 6); assert(s.seats[0].board[0].rush); }
// 감독관: 상대는 턴당 2장까지 (동전 제외)
{ let s = setup(); put(s, 0, card('엄격한 복도 순찰 감독관')); s = end(s, 0); s.seats[1].mana = 10; s.seats[1].hand = [];
  const a = give(s, 1, '들쥐'), b = give(s, 1, '들쥐'), c = give(s, 1, '책벌레');
  s = play(s, 1, a); s = play(s, 1, b);
  const r = E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: null }, 1); assert(!r.ok && /감독관/.test(r.error), '3장째 거부');
  assert.strictEqual(E.viewFor(s, 1).me.playLimit, 2); s = end(s, 1); s = end(s, 0); s.seats[1].mana = 10; s = play(s, 1, s.seats[1].hand.find(x => x.id === c.id)); }
// 수능 샤프: 죽으면 무작위 적 하수인에게 독성 피해 → 처치
{ let s = setup(); const sh = put(s, 0, card('샤프심 똑 부러진 수능 샤프')); put(s, 1, { name: '큰 곰', atk: 1, hp: 9 }); const killer = put(s, 1, bear);
  s = end(s, 0); s = ok(E.apply(s, { type: 'ATTACK', attackerId: killer.id, target: mt(0, sh.id) }, 1));
  assert.strictEqual(s.seats[1].board.length, 0, '독성: 큰 곰은 죽메로, 공격한 곰은 독성 반격으로'); }
// 보온도시락: 죽으면 상대의 다음 턴 드로우 -1 + 무작위 하수인 기절
{ let s = setup(); const lb = put(s, 0, card('체증을 유발하는 보온도시락')); const att = put(s, 1, { name: '큰 곰', atk: 9, hp: 9 }); put(s, 1, bear);
  s = end(s, 0); s = ok(E.apply(s, { type: 'ATTACK', attackerId: att.id, target: mt(0, lb.id) }, 1)); s = end(s, 1);
  const h = s.seats[1].hand.length; s = end(s, 0);
  assert.strictEqual(s.seats[1].hand.length, h, '드로우 1장 막힘'); assert.strictEqual(s.seats[1].board.filter(m => m.frozen).length, 1, '식곤증 1기'); }
// 다리 떠는 옆자리: 공격할 때마다 무작위 적에게 1
{ let s = setup(); const lg = put(s, 0, card('다리 떠는 옆자리 수험생')); const hp0 = s.seats[1].hp;
  s = ok(E.apply(s, { type: 'ATTACK', attackerId: lg.id, target: ht(1) }, 0)); assert.strictEqual(s.seats[1].hp, hp0 - 2, '공격 1 + 진동 1 (적이 영웅뿐)'); }
// 비염 빌런: 내 턴 종료 시 모든 적 하수인 1 피해
{ let s = setup(); put(s, 0, card('훌쩍거리는 앞자리 (비염 빌런)')); put(s, 1, bear); put(s, 1, bear);
  s = end(s, 0); assert(s.seats[1].board.every(m => m.hp === 4)); }
// 아랍어 로또 괴물: 1~4 또는 10 피해
{ const seen = new Set();
  for (let k = 0; k < 40; k++) { let s = setup(); s.seed = k * 7919 + 1; const hp0 = s.seats[1].hp; s = play(s, 0, give(s, 0, '아랍어 로또 괴물 (5교시의 악령)')); seen.add(hp0 - s.seats[1].hp); }
  assert([...seen].every(d => [1, 2, 3, 4, 10].includes(d)), '피해 ' + [...seen]); assert(seen.size >= 3); }
// 침묵하면 보스 키워드가 사라짐
{ let s = setup(); const m = put(s, 1, card('엄격한 복도 순찰 감독관')); s = play(s, 0, give(s, 0, '침묵'), mt(1, m.id)); assert(!s.seats[1].board[0].cardLimit); }
console.log('✔ 수능 보스 카드 15장 효과');

// ---------- 보스 덱(중급2 AI) vs 추천 덱: 오류·멈춤 없이 끝나는지 ----------
const R = E.selfPlay(60, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [BOSS_DECK, E.defaultDeckList()] });
console.log('봇 대전 (수능 보스 vs 추천 덱)', JSON.stringify(R));
assert.strictEqual(R.errors, 0, '봇이 불법 행동을 하면 안 됨'); assert(R.wins[0] + R.wins[1] + R.draws >= 58);
console.log('test-suneung: 모두 통과');
