// test-engine.js — 분리한 엔진이 Node(서버)에서 정상 동작하는지 확인
//   npm run test  (또는 node server/test-engine.js)
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { CARD_POOL } = require(path.join(JS, 'cards.js'));
const { Economy } = require(path.join(JS, 'economy.js'));
const Cheats = require(path.join(JS, 'cheats.js'));

assert.ok(Array.isArray(CARD_POOL) && CARD_POOL.length > 0, '카드풀이 비었어요');
assert.strictEqual(E.CARD_POOL, CARD_POOL, 'engine 과 cards 의 카드풀이 달라요');
console.log(`카드 ${CARD_POOL.length}장, 엔진 ${E.VERSION}`);

// 룬 헬퍼가 엔진 안에서 동작
assert.deepStrictEqual(E.runeOf({ runes: { blood: 2 } }), ['혈기']);

// 봇 대전 (룰 봇 vs 랜덤 봇).
// 랜덤 봇은 가끔 200턴 안에 못 끝내거나(stalled) 규칙에 안 맞는 행동을 내서(errors) 한두 판 빠질 수 있다 (분리 전 엔진도 같다).
// 그래서 "0건"이 아니라 "아주 드물어야 함"을 확인한다.
const N = 40, r = E.selfPlay(N, E.BotPlayers.rule, E.BotPlayers.random, 200, {});
console.log('selfPlay', JSON.stringify(r));
assert.strictEqual(r.games, N);
assert.ok(r.wins[0] + r.wins[1] + r.draws >= N - 3, `끝난 판이 너무 적어요 (stalled ${r.stalled}, errors ${r.errors})`);
assert.ok(r.wins[0] > r.wins[1], '룰 봇이 랜덤 봇을 못 이기면 엔진이 이상한 거예요');

// 경제·치트 모듈이 Node에서 로드되고 순수 함수가 동작
const base = Economy.sanitize(null, new Date());
const after = Economy.settle(base, { difficulty: 'easy', mode: 'normal', winner: 0 });
assert.strictEqual(after.save.gold, base.gold + 10);
assert.ok(typeof Cheats.rollCheats === 'function');

// 4단계: 모든 카드에 희귀도가 있고, 스타터 카드로 추천 덱을 만들 수 있어야 함
const Col = require(path.join(JS, 'collection.js'));
const bad = CARD_POOL.filter(c => !Col.RARITY_ORDER.includes(c.rarity));
assert.strictEqual(bad.length, 0, '희귀도가 없거나 잘못된 카드: ' + bad.map(c => c.name).join(', '));
const dist = {}; CARD_POOL.forEach(c => { dist[c.rarity] = (dist[c.rarity] || 0) + 1; });
console.log('희귀도 분포', JSON.stringify(dist));
const starter = Col.starterCollection(CARD_POOL, E.defaultDeckList());
assert.strictEqual(Col.validateDeckOwned(E.defaultDeckList(), starter), null, '스타터로 추천 덱을 못 만들어요');
assert.ok(Col.validateDeckOwned(['데스윙'], starter), '전설 카드는 스타터에 없어야 해요');
assert.strictEqual(E.validateDeckList(E.defaultDeckList()), null, '추천 덱이 규칙에 안 맞아요');

console.log('✔ 엔진 테스트 통과');
