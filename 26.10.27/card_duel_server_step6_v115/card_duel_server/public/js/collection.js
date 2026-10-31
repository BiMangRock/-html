// collection.js — 카드 희귀도 순서 · 스타터 카드 · 덱 보유 검사 (브라우저·서버 공용)
// 희귀도 자체는 cards.js 의 각 카드(rarity)에 적혀 있다. 바꾸고 싶으면 거기서 고친다.
const RARITY_ORDER = ['일반', '희귀', '특급', '전설'];
const STARTER_COMMON_COPIES = 2;      // 새 계정: 일반 등급 카드는 전부 이만큼씩 지급 (추천 덱 카드는 등급과 상관없이 덱에 필요한 만큼 추가)

// 새 계정이 받는 카드: { 카드이름: 장수 }
function starterCollection(pool, deckList) {
  const col = {};
  pool.forEach(c => { if (c.rarity === '일반') col[c.name] = STARTER_COMMON_COPIES; });
  const need = {}; deckList.forEach(n => { need[n] = (need[n] || 0) + 1; });
  for (const n of Object.keys(need)) col[n] = Math.max(col[n] || 0, need[n]);
  return col;
}
// 덱이 내 보유 카드 안에서 만들어졌는지. 문제가 없으면 null, 있으면 오류 문장.
function validateDeckOwned(names, owned) {
  const need = {};
  for (const n of names) need[n] = (need[n] || 0) + 1;
  for (const n of Object.keys(need)) if (((owned && owned[n]) || 0) < need[n]) return `보유하지 않은 카드가 있습니다: ${n}`;
  return null;
}
if (typeof module !== 'undefined') { module.exports = { RARITY_ORDER, STARTER_COMMON_COPIES, starterCollection, validateDeckOwned }; }
