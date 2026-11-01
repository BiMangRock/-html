// test-ynu1.js — v117 혼란 상태이상 + 영남대 1학년 보스 카드 7장 + 공통 보스 하수인 4장
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Adv = require(path.join(JS, 'adventure.js'));

const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
for (const n of Adv.YNU_1_CARDS) card(n);
for (const n of ['F폭격기 교수님', '군기반장 복학생', '본가로 직배송된 학사경고 통지서', ...Adv.YNU_COMMON]) { assert.strictEqual(card(n).scope, 'boss', n); assert(card(n).art, n + ' 그림'); }
function setup() {
  let seed = 5; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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

// 혼란: 무작위 대상에 아군·적 하수인과 양쪽 영웅이 모두 나온다
{ const hits = new Set();
  for (let k = 0; k < 60; k++) { let s = setup(); s.seed = k * 977 + 1; const c = put(s, 1, { name: '혼란 곰', atk: 1, hp: 50 }, { confused: true }); put(s, 1, { name: '아군', atk: 0, hp: 9 }); put(s, 0, { name: '적', atk: 0, hp: 9 });
    s = end(s, 0); const b = [s.seats[0].hp, s.seats[1].hp, s.seats[1].board[1].hp, s.seats[0].board[0].hp]; s = end(s, 1);
    const a = [s.seats[0].hp, s.seats[1].hp, s.seats[1].board[1].hp, s.seats[0].board[0].hp];
    ['적 영웅', '자기 영웅', '아군 하수인', '적 하수인'].forEach((nm, i) => { if (a[i] < b[i]) hits.add(nm); }); }
  assert.strictEqual(hits.size, 4, '네 종류 대상 모두: ' + [...hits]); }
console.log('✔ 혼란 상태이상');

// F폭격기 교수님: 다른 모든 하수인 처치 (보호막 무시)
{ let s = setup(); put(s, 0, bear); put(s, 1, bear, { shield: true }); s = play(s, 0, give(s, 0, 'F폭격기 교수님'));
  assert.deepStrictEqual(s.seats[0].board.map(m => m.name), ['F폭격기 교수님']); assert.strictEqual(s.seats[1].board.length, 0); }
// 잠수탄 조원: 매 턴 끝에 다른 아군 2 피해 + 그만큼 회복 / 죽메 상대 영웅 6
{ let s = setup(); const g = put(s, 0, card('발표 10분 전 잠수탄 조원'), { hp: 3 }); put(s, 0, { name: 'a', atk: 1, hp: 5 }); put(s, 0, { name: 'b', atk: 1, hp: 1 });
  s = end(s, 0); assert.strictEqual(s.seats[0].board.find(m => m.name === 'a').hp, 3); assert(!s.seats[0].board.some(m => m.name === 'b'));
  assert.strictEqual(s.seats[0].board[0].hp, 6, '준 피해 2+1 회복');
  s = end(s, 1); assert.strictEqual(s.seats[0].board.find(m => m.name === 'a').hp, 1, '상대 턴 끝에도 발동');
  const killer = put(s, 1, { name: 'k', atk: 20, hp: 20 }); s.seats[0].board.find(m => m.name === 'a').hp = 1; s = end(s, 0); const hp1 = s.seats[1].hp;
  s = atk(s, 1, killer.id, mt(0, g.id)); assert.strictEqual(s.seats[1].hp, hp1 - 6, '죽음의 메아리 6'); }
// 군기반장 복학생: 비용 4 이하 적 하수인 침묵+처치, 상대는 턴당 1장
{ let s = setup(); put(s, 1, { name: 'cheap', atk: 1, hp: 9, cost: 4 }, { shield: true }); put(s, 1, { name: 'big', atk: 1, hp: 9, cost: 6 });
  s = play(s, 0, give(s, 0, '군기반장 복학생')); assert.deepStrictEqual(s.seats[1].board.map(m => m.name), ['big']);
  s = end(s, 0); s.seats[1].mana = 10; s.seats[1].hand = []; const a = give(s, 1, '들쥐'), b = give(s, 1, '들쥐'); s = play(s, 1, a);
  assert(/1장/.test(E.apply(s, { type: 'PLAY_CARD', cardId: b.id, target: null }, 1).error || ''), '턴당 1장'); }
// 수강신청 대참사: 마나 수정 2개 파괴 + 다음 턴 영웅 공격·주문 불가
{ let s = setup(); s.seats[1].maxMana = 6; s = play(s, 0, give(s, 0, '수강신청 대참사와 8시간 우주공강')); assert.strictEqual(s.seats[1].maxMana, 4);
  const sp = give(s, 1, '지식의 서'); s = end(s, 0); assert.strictEqual(s.seats[1].maxMana, 5, '턴 시작에 1 회복');
  assert(!E.apply(s, { type: 'PLAY_CARD', cardId: sp.id, target: null }, 1).ok, '주문 불가'); s.seats[1].heroAtk = 3;
  assert(!E.apply(s, { type: 'HERO_ATTACK', target: ht(0) }, 1).ok, '영웅 공격 불가'); s = end(s, 1); s = end(s, 0);
  assert(E.apply(s, { type: 'PLAY_CARD', cardId: sp.id, target: null }, 1).ok, '다음 턴엔 풀림'); }
// 숙취 출석 체크: 적 하수인 빙결 + 다음 턴 카드 낼 때마다 비용만큼 피해
{ let s = setup(); put(s, 1, bear); s = play(s, 0, give(s, 0, '숙취 속 월요일 아침 9시 출석 체크')); assert(s.seats[1].board[0].frozen);
  s = end(s, 0); s.seats[1].mana = 10; const hp = s.seats[1].hp; s = play(s, 1, give(s, 1, '돌 골렘')); assert.strictEqual(s.seats[1].hp, hp - 4);
  s = end(s, 1); s = end(s, 0); s.seats[1].mana = 10; const hp2 = s.seats[1].hp; s = play(s, 1, give(s, 1, '돌 골렘')); assert.strictEqual(s.seats[1].hp, hp2, '한 턴만'); }
// 붕붕드링크: 상대 하수인 공격력 +4, 상대 턴이 끝나면 전원 처치
{ let s = setup(); const m = put(s, 1, bear); s = play(s, 0, give(s, 0, '핫식스+레드불 붕붕드링크의 부작용')); assert.strictEqual(s.seats[1].board[0].atk, 9);
  s = end(s, 0); assert.strictEqual(s.seats[1].board.length, 1, '내 턴 끝에는 아직 살아 있음'); const hp = s.seats[0].hp;
  s = atk(s, 1, m.id, ht(0)); assert.strictEqual(s.seats[0].hp, hp - 9); s = end(s, 1); assert.strictEqual(s.seats[1].board.length, 0, '상대 턴 끝에 기절'); }
// 학사경고 통지서: 전멸 + 상대 손·덱에서 가장 비싼 3장 파괴 + 10 피해
{ let s = setup(); put(s, 0, bear); put(s, 1, bear); s.seats[1].hand = [give(s, 1, '고대 용')].slice(0, 0); give(s, 1, '고대 용'); give(s, 1, '들쥐');
  const maxDeck = Math.max(...s.seats[1].deck.map(c => c.cost)), n0 = s.seats[1].hand.length + s.seats[1].deck.length, hp = s.seats[1].hp;
  s = play(s, 0, give(s, 0, '본가로 직배송된 학사경고 통지서'));
  assert.strictEqual(s.seats[0].board.length + s.seats[1].board.length, 0); assert.strictEqual(s.seats[1].hp, hp - 10);
  assert.strictEqual(s.seats[1].hand.length + s.seats[1].deck.length, n0 - 3); assert(!s.seats[1].hand.some(c => c.name === '고대 용'), '가장 비싼 카드부터'); }
// 과잠 새내기: 덱 맨 위 비용 5 이상이면 다음 내 턴 빙결
{ let s = setup(); s.seats[0].deck.push({ ...card('고대 용'), id: s.nextId++ }); s = play(s, 0, give(s, 0, '과잠 뽕에 취한 새내기'));
  s.seats[0].deck.push({ ...card('들쥐'), id: s.nextId++ }); s = end(s, 0); s = end(s, 1); assert(s.seats[0].board[0].frozen, '겁먹음');
  let t = setup(); t.seats[0].deck.push({ ...card('들쥐'), id: t.nextId++ }); t = play(t, 0, give(t, 0, '과잠 뽕에 취한 새내기')); t = end(t, 0); t = end(t, 1); assert(!t.seats[0].board[0].frozen); }
// 전공 벽 2학년: 맞을 때마다 내 영웅 +1
{ let s = setup(); s.seats[0].hp = 20; const m = put(s, 0, card('전공 벽에 부딪힌 2학년')); const a = put(s, 1, { name: 'a', atk: 1, hp: 9 });
  s = end(s, 0); s = atk(s, 1, a.id, mt(0, m.id)); assert.strictEqual(s.seats[0].hp, 21); }
// 사망년: 내 턴 시작에 자기 1 피해, 죽으면 카페인 충전
{ let s = setup(); put(s, 0, card('영혼까지 갈려 나가는 사망년'), { hp: 1 }); s = end(s, 0); s.seats[0].hand = []; s = end(s, 1);
  assert(!s.seats[0].board.length, '번아웃'); assert(s.seats[0].hand.some(c => c.name === '카페인 충전')); }
// 취준 화석: 아군 소환될 때마다 공격력 +1, 은신 (다음 내 턴까지)
{ let s = setup(); const f = put(s, 0, card('츄리닝 삼디다스 취준 화석')); delete f.stealth; s.seats[0].seenIds = [f.id]; s = play(s, 0, give(s, 0, '들쥐'));
  const x = s.seats[0].board.find(m => m.name === '츄리닝 삼디다스 취준 화석'); assert.strictEqual(x.atk, 3); assert(x.stealth && x.stealthTemp); }
console.log('✔ 1학년 보스 카드 7장 + 공통 보스 하수인 4장');

for (const t of Adv.ADV_TEMPLATES.ynu.slice(1)) {
  const R = E.selfPlay(30, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [t[4], E.defaultDeckList()] });
  console.log(`봇 대전 (${t[1]} 보스 vs 추천 덱)`, JSON.stringify(R)); assert.strictEqual(R.errors, 0); assert(R.wins[0] + R.wins[1] + R.draws >= 28);
}
console.log('test-ynu1: 모두 통과');
