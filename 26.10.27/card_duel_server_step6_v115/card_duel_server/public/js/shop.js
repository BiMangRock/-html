// shop.js — 카드 팩 규칙 (브라우저·서버 공용)
//  - 가격·확률·중복 환급·천장 수치는 전부 여기 한 곳에 있다. 밸런스를 바꾸려면 SHOP 만 고치면 된다.
//  - rollPack() 은 "난수 함수(rng)"를 받는 순수 함수라서, 서버는 암호학적 난수(crypto)를 넣고 테스트는 시드 난수를 넣는다.
//  - 실제 개봉(난수·골드 차감·컬렉션 반영)은 서버만 한다. 브라우저는 확률표를 보여주는 데만 이 파일을 쓴다.
const SHOP = {
  PACK_PRICE: 100,                 // 1팩 가격(골드)
  PACK_SIZE: 5,                    // 1팩 카드 장수
  MAX_BUY: 10,                     // 한 번에 살 수 있는 최대 팩 수
  // 카드 한 장이 각 등급일 확률 (합 1000 = 100%). 아래 숫자는 1000분율.
  RATES: { '일반': 700, '희귀': 220, '특급': 65, '전설': 15 },
  GUARANTEE_MIN: '희귀',           // 한 팩에는 이 등급 이상이 최소 1장 (없으면 마지막 한 장을 다시 뽑는다)
  PITY_EPIC: 10,                   // 특급 이상이 연속 이 팩 수 동안 안 나오면 이번 팩에 특급 이상 1장 확정
  PITY_LEGEND: 30,                 // 전설이 연속 이 팩 수 동안 안 나오면 이번 팩에 전설 1장 확정
  DUP_CAP: 2,                      // 한 카드를 이 장수만큼 가지면, 그 이상 나온 카드는 환급 (덱에 넣을 수 있는 한도 = engine 의 CONFIG.COPIES)
  REFUND: { '일반': 5, '희귀': 15, '특급': 40, '전설': 100 },   // 중복 카드 1장당 환급 골드
};
const SHOP_RARITIES = ['일반', '희귀', '특급', '전설'];       // collection.js 의 RARITY_ORDER 와 같은 순서

// rng(n) → 0 이상 n 미만의 정수.
function shopPickRarity(rng, minRarity) {
  const from = minRarity ? SHOP_RARITIES.indexOf(minRarity) : 0;
  const list = SHOP_RARITIES.slice(from);
  const total = list.reduce((s, r) => s + SHOP.RATES[r], 0);
  let x = rng(total);
  for (const r of list) { if (x < SHOP.RATES[r]) return r; x -= SHOP.RATES[r]; }
  return list[list.length - 1];
}

// 카드 풀을 등급별로 나눈다.
function shopPoolsByRarity(pool) {
  const by = {}; SHOP_RARITIES.forEach(r => { by[r] = []; });
  pool.forEach(c => { if (by[c.rarity]) by[c.rarity].push(c); });
  return by;
}

// 팩 1개를 연다.
//  pool   : CARD_POOL
//  owned  : { 카드이름: 보유 장수 }  — 이 함수가 직접 갱신한다 (같은 팩 안의 중복도 반영하려고)
//  pity   : { sinceEpic, sinceLegend }  — 직전까지 특급 이상 / 전설이 안 나온 연속 팩 수
//  반환   : { cards:[{name, rarity, isNew, dup, refund}], refund, pity:{…새 값}, pityHit:null|'epic'|'legend' }
function rollPack(pool, owned, pity, rng) {
  const by = shopPoolsByRarity(pool);
  const idx = r => SHOP_RARITIES.indexOf(r);
  // 1) 장마다 등급 추첨
  const slots = [];
  for (let i = 0; i < SHOP.PACK_SIZE; i++) slots.push(shopPickRarity(rng));
  // 2) 보장 등급: 희귀 이상이 하나도 없으면 마지막 한 장을 희귀 이상으로 다시 뽑는다
  if (!slots.some(r => idx(r) >= idx(SHOP.GUARANTEE_MIN))) slots[slots.length - 1] = shopPickRarity(rng, SHOP.GUARANTEE_MIN);
  // 3) 천장: 가장 낮은 등급 한 장을 올려서, 이미 나온 좋은 카드를 깎지 않는다
  const upgrade = to => {
    let lo = Infinity; slots.forEach(r => { lo = Math.min(lo, idx(r)); });
    const cand = []; slots.forEach((r, i) => { if (idx(r) === lo) cand.push(i); });
    slots[cand[rng(cand.length)]] = to;
  };
  let pityHit = null;
  const has = r => slots.some(s => idx(s) >= idx(r));
  if (pity.sinceLegend + 1 >= SHOP.PITY_LEGEND && !slots.includes('전설')) { upgrade('전설'); pityHit = 'legend'; }
  else if (pity.sinceEpic + 1 >= SHOP.PITY_EPIC && !has('특급')) { upgrade(shopPickRarity(rng, '특급')); pityHit = 'epic'; }
  // 4) 보기 좋게 낮은 등급부터 (가장 좋은 카드가 마지막에 공개된다). 같은 등급 안에서는 추첨 순서 유지
  slots.sort((a, b) => idx(a) - idx(b));
  // 5) 등급 안에서 카드 한 장 추첨 + 중복 환급
  const cards = []; let refund = 0;
  for (const rar of slots) {
    const list = by[rar]; if (!list.length) throw new Error('등급에 카드가 없어요: ' + rar);
    const c = list[rng(list.length)];
    const have = owned[c.name] || 0;
    if (have >= SHOP.DUP_CAP) { const g = SHOP.REFUND[rar]; refund += g; cards.push({ name: c.name, rarity: rar, isNew: false, dup: true, refund: g }); }
    else { owned[c.name] = have + 1; cards.push({ name: c.name, rarity: rar, isNew: have === 0, dup: false, refund: 0 }); }
  }
  // 6) 천장 카운터
  const gotLegend = cards.some(c => c.rarity === '전설'), gotEpic = cards.some(c => idx(c.rarity) >= idx('특급'));
  const next = gotLegend ? { sinceEpic: 0, sinceLegend: 0 }
    : gotEpic ? { sinceEpic: 0, sinceLegend: pity.sinceLegend + 1 }
    : { sinceEpic: pity.sinceEpic + 1, sinceLegend: pity.sinceLegend + 1 };
  return { cards, refund, pity: next, pityHit };
}

// 화면용: 확률(%)과 천장까지 남은 팩 수
const shopRatePercent = r => SHOP.RATES[r] / 10;
const shopPityLeft = pity => ({
  epic: Math.max(1, SHOP.PITY_EPIC - pity.sinceEpic),         // 1 이면 다음 팩이 확정
  legend: Math.max(1, SHOP.PITY_LEGEND - pity.sinceLegend),
});

if (typeof module !== 'undefined') { module.exports = { SHOP, SHOP_RARITIES, rollPack, shopPickRarity, shopPoolsByRarity, shopRatePercent, shopPityLeft }; }
