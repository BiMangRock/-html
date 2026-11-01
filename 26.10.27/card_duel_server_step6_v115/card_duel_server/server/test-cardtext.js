// test-cardtext.js — v120 카드 앞면 짧은 문구 (cardtext.js) : 모든 카드의 앞면이 30자 이하인지, 표에 없는 카드 이름이 없는지
const assert = require('assert');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { CARD_SHORT } = require(path.join(JS, 'cardtext.js'));
for (const n of Object.keys(CARD_SHORT)) assert(E.CARD_POOL.some(c => c.name === n), '없는 카드 이름: ' + n);
const front = c => CARD_SHORT[c.name] || E.effectText(c) || '';
const long = E.CARD_POOL.filter(c => front(c).length > 30).map(c => `${c.name}: ${front(c)}`);
assert.deepStrictEqual(long, [], '앞면 문구가 30자를 넘는 카드');
for (const [n, t] of Object.entries(CARD_SHORT)) { const full = E.effectText(E.CARD_POOL.find(c => c.name === n)); assert(t.length < full.length, n + ': 짧은 문구가 원래보다 짧아야 함'); }
console.log(`test-cardtext: 모두 통과 (카드 ${E.CARD_POOL.length}장 · 짧은 문구 ${Object.keys(CARD_SHORT).length}장)`);
