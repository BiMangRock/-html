// rank.js (공용) — v127 유저 대전 랭크전 규칙. 서버(pvp-db 정산)와 대전 화면(배지·결과)이 같은 함수를 쓴다.
//  등급: 브론즈 → 실버 → 골드 → 플래티넘 → 다이아 → 전설
//  · 전설 아래 등급은 3단계(3 → 2 → 1). 단계마다 별 STARS_PER_DIV 개를 채우면 다음 단계로 (넘친 별은 이어서)
//  · 이기면 별 +1, 3연승째부터는 이길 때마다 별 +2 (전설 제외). 지면 별 -1 (브론즈는 안 줄어듦)
//  · 강등 방지선: 실버·골드·플래티넘·다이아에 한 번 오르면 그 등급 아래로는 안 떨어짐 (등급 안에서 단계는 내려갈 수 있음)
//  · 전설: 더 오르내리지 않고 '전설 승수'만 센다. 순위 = 전설 승수가 많은 순 (같으면 먼저 전설에 온 사람이 위)
//  · 상대는 등급·승률과 상관없이 랭크전 대기열에서 아무나 (MMR 없음). 시즌 없음
const RANK = {
  TIERS: ['브론즈', '실버', '골드', '플래티넘', '다이아', '전설'],
  ICONS: ['🥉', '🥈', '🥇', '💠', '💎', '👑'],
  LEGEND: 5, DIVS: 3, STARS_PER_DIV: 3, STREAK_BONUS_FROM: 3,
  FALLBACK_MS: 30 * 1000,      // 랭크전 상대가 이 시간 동안 안 잡히면 일반전으로 바꿀지 물어본다
};
// 처음 상태: 브론즈 3단계, 별 0
const ladderNew = () => ({ tier: 0, div: RANK.DIVS, stars: 0, streak: 0, floor: 0, legendWins: 0, legendAt: null });
// 결과 반영: won = true(승) / false(패). 무승부·무효는 부르지 않는다. 반환: {state, gained, promoted, demoted, toLegend}
function ladderApply(st0, won, now = Date.now()) {
  const s = { ...ladderNew(), ...st0 }; let gained = 0, promoted = false, demoted = false, toLegend = false;
  if (s.tier >= RANK.LEGEND) { if (won) { s.legendWins++; gained = 1; } s.streak = won ? s.streak + 1 : 0; return { state: s, gained, promoted, demoted, toLegend }; }
  if (won) {
    s.streak++; gained = s.streak >= RANK.STREAK_BONUS_FROM ? 2 : 1; s.stars += gained;
    while (s.stars >= RANK.STARS_PER_DIV && s.tier < RANK.LEGEND) {
      s.stars -= RANK.STARS_PER_DIV; promoted = true;
      if (s.div > 1) s.div--;
      else { s.tier++; s.div = RANK.DIVS; if (s.tier > s.floor) s.floor = s.tier; }
      if (s.tier >= RANK.LEGEND) { s.stars = 0; s.div = 0; s.legendAt = now; toLegend = true; }
    }
  } else {
    s.streak = 0;
    if (s.tier > 0 || s.div < RANK.DIVS || s.stars > 0) {
      if (s.tier === 0) { /* 브론즈는 별이 안 줄어든다 */ }
      else { gained = -1; s.stars--;
        if (s.stars < 0) {
          if (s.div < RANK.DIVS) { s.div++; s.stars = RANK.STARS_PER_DIV - 1; demoted = true; }
          else if (s.tier > s.floor) { s.tier--; s.div = 1; s.stars = RANK.STARS_PER_DIV - 1; demoted = true; }
          else s.stars = 0;                                   // 강등 방지선
        } }
    }
  }
  return { state: s, gained, promoted, demoted, toLegend };
}
// 표시용 이름: "골드 2" / "전설"
const ladderLabel = s => !s ? '' : s.tier >= RANK.LEGEND ? `${RANK.ICONS[RANK.LEGEND]} 전설` : `${RANK.ICONS[s.tier]} ${RANK.TIERS[s.tier]} ${s.div}`;
const ladderStars = s => !s || s.tier >= RANK.LEGEND ? '' : '★'.repeat(s.stars) + '☆'.repeat(RANK.STARS_PER_DIV - s.stars);
// 브론즈 3단계 0별부터 센 별 개수 (진행도 막대용)
const ladderIndex = s => s.tier >= RANK.LEGEND ? RANK.LEGEND * RANK.DIVS * RANK.STARS_PER_DIV : (s.tier * RANK.DIVS + (RANK.DIVS - s.div)) * RANK.STARS_PER_DIV + s.stars;

if (typeof module !== 'undefined') { module.exports = { RANK, ladderNew, ladderApply, ladderLabel, ladderStars, ladderIndex }; }
