// collection.js — 카드 희귀도 순서 · 스타터 카드 · 덱 보유 검사 (브라우저·서버 공용)
// 희귀도 자체는 cards.js 의 각 카드(rarity)에 적혀 있다. 바꾸고 싶으면 거기서 고친다.
const RARITY_ORDER = ['일반', '희귀', '특급', '전설'];
const STARTER_COMMON_COPIES = 1;      // 새 계정: 고른 일반 카드를 이만큼씩 지급 (추천 덱 카드는 등급과 상관없이 덱에 필요한 만큼 추가)
const STARTER_COMMON_SHARE = 0.5;     // v140 새 계정이 받는 일반 카드 종류 비율 (전체 일반 카드 중 절반). 나머지는 팩·제작으로 모은다

// ---------- 카드 사용 범위 (v117, cards.js 의 scope) ----------
const CARD_SCOPE_LABEL = { normal: '', adventure: '모험 전용', boss: '보스 전용' };
const cardScope = c => (c && (c.scope === 'adventure' || c.scope === 'boss')) ? c.scope : 'normal';
// 유저 덱 종류별로 넣을 수 있는 카드인지 검사. deckMode: 'normal'(AI 대전·유저 대전 덱) | 'adventure'(모험 덱)
//   일반 덱 → 일반 카드만 / 모험 덱 → 일반 + 모험 전용 / 보스 전용은 유저 덱에 절대 못 넣음.  문제가 없으면 null
function validateDeckScope(names, pool, deckMode) {
  const by = new Map(pool.map(c => [c.name, c]));
  for (const n of names) {
    const sc = cardScope(by.get(n));
    if (sc === 'boss') return `보스 전용 카드는 덱에 넣을 수 없습니다: ${n}`;
    if (sc === 'adventure' && deckMode !== 'adventure') return `모험 전용 카드는 모험 덱에만 넣을 수 있습니다: ${n}`;
  }
  return null;
}

// 새 계정이 받는 카드: { 카드이름: 장수 }  (일반 카드만)
//  v140: 일반 카드 전부(2장씩) → 절반만 1장씩.  고르는 법 (같은 카드 목록이면 항상 같은 결과):
//   1) 추천 덱에 들어가는 일반 카드는 꼭 넣는다  2) 나머지는 비용 순으로 줄 세워 하나 걸러 하나씩 → 비용이 고르게 섞인다
function starterCommons(pool, deckList) {
  const commons = pool.filter(c => c.rarity === '일반' && cardScope(c) === 'normal' && !c.unlock && c.type);
  const want = Math.round(commons.length * STARTER_COMMON_SHARE), inDeck = new Set(deckList);
  const picked = commons.filter(c => inDeck.has(c.name)).map(c => c.name);
  const rest = commons.filter(c => !inDeck.has(c.name)).map((c, i) => ({ c, i })).sort((a, b) => (a.c.cost - b.c.cost) || (a.i - b.i)).map(x => x.c.name);
  const left = Math.max(0, want - picked.length), step = rest.length / Math.max(1, left);
  for (let k = 0; k < left && k < rest.length; k++) picked.push(rest[Math.floor(k * step)]);
  return picked;
}
function starterCollection(pool, deckList) {
  const col = {};
  starterCommons(pool, deckList).forEach(n => { col[n] = STARTER_COMMON_COPIES; });
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
if (typeof module !== 'undefined') { module.exports = { RARITY_ORDER, STARTER_COMMON_COPIES, STARTER_COMMON_SHARE, starterCommons, starterCollection, validateDeckOwned, CARD_SCOPE_LABEL, cardScope, validateDeckScope }; }
