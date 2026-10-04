const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('card-duel.html', 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) throw new Error('engine script not found');
const ctx = {console, structuredClone};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.E={newGame,apply,validate,legalActions,viewFor,selfPlay,BotPlayers,CONFIG,CARD_POOL,other};', ctx);
const E = ctx.E;
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL:', msg); } else console.log('ok  :', msg); };

// 1. 초기 상태 / 마나 버그 수정
let s = E.newGame();
ok(s.turn === 0 && s.seats[0].maxMana === 1 && s.seats[0].mana === 1, '선공 첫 턴 마나 1');
ok(s.seats[0].hp === 30 && s.seats[1].hp === 30, '영웅 체력 30');
ok(s.seats[0].hand.length === 4 && s.seats[1].hand.length === 3, '손패 4/3');
let r = E.apply(s, {type: 'END_TURN'}, 0);
ok(r.ok && r.state.seats[1].maxMana === 1 && r.state.seats[0].maxMana === 1, '후공 첫 턴 마나 1, 선공 유지');
r = E.apply(r.state, {type: 'END_TURN'}, 1);
ok(r.state.seats[0].maxMana === 2 && r.state.seats[1].maxMana === 1, '라운드당 마나 +1 (공유 아님)');

// 2. 불변성
s = E.newGame(); const snap = JSON.stringify(s);
const act = E.legalActions(s, 0).find(a => a.type === 'PLAY_CARD') || {type: 'END_TURN'};
E.apply(s, act, 0);
ok(JSON.stringify(s) === snap, 'apply 는 입력 상태를 수정하지 않음');

// 3. 규칙 위반 거부
s = E.newGame();
ok(!E.apply(s, {type: 'END_TURN'}, 1).ok, '상대 턴 행동 거부');
ok(!E.apply(s, {type: 'PLAY_CARD', cardId: 99999, target: null}, 0).ok, '존재하지 않는 카드 거부');
const expensive = {cost: 7, name: 'x', atk: 1, hp: 1, id: 7777};
s.seats[0].hand.push(expensive);
ok(!E.apply(s, {type: 'PLAY_CARD', cardId: 7777, target: null}, 0).ok, '마나 부족 거부');
ok(!E.apply(s, {type: 'ATTACK', attackerId: 1, target: {kind: 'hero', seat: 1}}, 0).ok, '없는 하수인 공격 거부');
ok(!E.apply(s, {type: 'WHATEVER'}, 0).ok && !E.apply(s, null, 0).ok, '알 수 없는 행동/null 거부');
// 소환 직후 공격, 도발 우회, 중복 공격
s = E.newGame();
s.seats[0].mana = 10;
s.seats[0].board = [{id: 501, name: 'a', cost: 1, atk: 2, hp: 2, maxHp: 2, attacked: false, summoned: true}];
ok(!E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'hero', seat: 1}}, 0).ok, '소환 직후 공격 거부');
s.seats[0].board[0].summoned = false;
s.seats[1].board = [{id: 601, name: 't', cost: 1, atk: 1, hp: 3, maxHp: 3, taunt: true, attacked: false, summoned: false},
                    {id: 602, name: 'n', cost: 1, atk: 1, hp: 3, maxHp: 3, attacked: false, summoned: false}];
ok(!E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'hero', seat: 1}}, 0).ok, '도발 있을 때 영웅 공격 거부');
ok(!E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'minion', seat: 1, id: 602}}, 0).ok, '도발 무시하고 일반 하수인 공격 거부');
r = E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'minion', seat: 1, id: 601}}, 0);
ok(r.ok && r.state.seats[1].board.find(x => x.id === 601).hp === 1, '도발 하수인 공격 성공/피해 적용');
ok(!E.apply(r.state, {type: 'ATTACK', attackerId: 501, target: {kind: 'minion', seat: 1, id: 601}}, 0).ok, '중복 공격 거부');
// 보호막
s = E.newGame(); s.seats[0].board = [{id: 501, name: 'a', atk: 5, hp: 5, maxHp: 5, attacked: false, summoned: false}];
s.seats[1].board = [{id: 601, name: 's', atk: 1, hp: 1, maxHp: 1, shield: true, attacked: false, summoned: false}];
r = E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'minion', seat: 1, id: 601}}, 0);
ok(r.state.seats[1].board.length === 1 && !r.state.seats[1].board[0].shield && r.state.seats[0].board[0].hp === 4, '보호막은 피해 1회 흡수');
// 치유 상한
s = E.newGame();
s.seats[0].mana = 10; s.seats[0].hp = 29;
s.seats[0].hand = [{id: 801, name: 'h', cost: 1, atk: 1, hp: 1, effect: {type: 'heal', value: 3}}];
r = E.apply(s, {type: 'PLAY_CARD', cardId: 801, target: {kind: 'hero', seat: 0}}, 0);
ok(r.ok && r.state.seats[0].hp === 30, '영웅 치유 상한 30');
ok(!E.apply(s, {type: 'PLAY_CARD', cardId: 801, target: null}, 0).ok, '대상 필요한 카드에 대상 없음 거부');
ok(!E.apply(s, {type: 'PLAY_CARD', cardId: 801, target: {kind: 'hero', seat: 1}}, 0).ok, '치유를 적 영웅에 사용 거부');
// 영웅 사망 → 게임 종료
s = E.newGame(); s.seats[1].hp = 2;
s.seats[0].board = [{id: 501, name: 'a', atk: 3, hp: 3, maxHp: 3, attacked: false, summoned: false}];
r = E.apply(s, {type: 'ATTACK', attackerId: 501, target: {kind: 'hero', seat: 1}}, 0);
ok(r.state.over && r.state.winner === 0, '영웅 사망 시 승리 판정');
ok(!E.apply(r.state, {type: 'END_TURN'}, 0).ok, '종료 후 행동 거부');
// GameView
s = E.newGame(); const v = E.viewFor(s, 0);
ok(v.opp.hand === undefined && typeof v.opp.handCount === 'number' && v.opp.deck === undefined, 'GameView 에 상대 손패/덱 내용 없음');
ok(v.opp.deckCards === undefined, 'GameView 에 상대 덱 구성 없음');
ok(v.me.deckCards.length === v.me.deckCount && v.me.deckCards.every(c => c.id === undefined), '내 덱 구성 제공(개수 일치, id 숨김)');
ok(v.me.deckCards.every((c, i, a) => i === 0 || a[i - 1].cost <= c.cost), '내 덱 구성은 코스트순 정렬(뽑는 순서 비공개)');
// 피해 카드: 아군도 대상 가능
s = E.newGame(); s.seats[0].mana = 10;
s.seats[0].board = [{id: 501, name: 'a', atk: 1, hp: 5, maxHp: 5, attacked: false, summoned: false}];
s.seats[0].hand = [{id: 802, name: 'd', cost: 1, atk: 1, hp: 1, effect: {type: 'damage', value: 2}}];
r = E.apply(s, {type: 'PLAY_CARD', cardId: 802, target: {kind: 'minion', seat: 0, id: 501}}, 0);
ok(r.ok && r.state.seats[0].board.find(x => x.id === 501).hp === 3, '피해 카드로 아군 하수인 공격 가능');
r = E.apply(s, {type: 'PLAY_CARD', cardId: 802, target: {kind: 'hero', seat: 0}}, 0);
ok(r.ok && r.state.seats[0].hp === 28, '피해 카드로 아군 영웅 공격 가능');
ok(!E.apply(s, {type: 'PLAY_CARD', cardId: 802, target: {kind: 'minion', seat: 0, id: 9999}}, 0).ok, '존재하지 않는 대상 거부');
ok(E.legalActions(s, 0).filter(a => a.type === 'PLAY_CARD').length === 3, '피해 카드 합법 대상 = 적 영웅 + 내 영웅 + 내 하수인');
const botAct = E.BotPlayers.rule.decide(E.viewFor(s, 0));
ok(botAct.type === 'PLAY_CARD' && botAct.target.seat === 1, '규칙 봇은 피해 카드를 적에게 사용');
s.seats[1].board = [{id: 601, name: 'e', atk: 1, hp: 2, maxHp: 2, attacked: false, summoned: false}];
const botAct2 = E.BotPlayers.rule.decide(E.viewFor(s, 0));
ok(botAct2.target.seat === 1 && botAct2.target.kind === 'minion', '규칙 봇은 적 약한 하수인 우선');
// 자해로 영웅이 죽으면 상대 승리
s = E.newGame(); s.seats[0].mana = 10; s.seats[0].hp = 2;
s.seats[0].hand = [{id: 803, name: 'd', cost: 1, atk: 1, hp: 1, effect: {type: 'damage', value: 5}}];
r = E.apply(s, {type: 'PLAY_CARD', cardId: 803, target: {kind: 'hero', seat: 0}}, 0);
ok(r.state.over && r.state.winner === 1, '자기 영웅을 죽이면 패배');

// 4. 자동 대전
for (const [name, a, b] of [['rule vs random', E.BotPlayers.rule, E.BotPlayers.random],
                            ['rule vs rule', E.BotPlayers.rule, E.BotPlayers.rule],
                            ['random vs random', E.BotPlayers.random, E.BotPlayers.random]]) {
  const t0 = Date.now(); const st = E.selfPlay(300, a, b);
  console.log(name, JSON.stringify(st), (Date.now() - t0) + 'ms');
  ok(st.errors === 0, name + ': 불법 행동 0건');
}
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
