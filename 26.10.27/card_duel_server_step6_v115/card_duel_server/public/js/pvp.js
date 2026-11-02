// pvp.js (공용) — 유저 대전 수치. 서버(pvp-core·pvp-db)와 대전 화면이 같은 값을 쓴다. 고치고 싶은 숫자는 여기만 바꾸면 된다.
const PVP = {
  WIN_GOLD: 50,                 // 이기면 받는 골드
  TURN_MS: 60 * 1000,           // 한 턴 제한 시간
  MULLIGAN_MS: 30 * 1000,       // 멀리건(시작 카드 교체) 제한 시간
  INTRO_MS: 2500,               // v147 「매칭 성공!」 연출 시간. 멀리건 제한 시간은 이만큼 늦게 시작한다
  RECONNECT_MS: 60 * 1000,      // 연결이 끊긴 사람을 기다려 주는 시간 (넘으면 패배)
  MAX_TIMEOUTS: 3,              // 시간 초과로 턴이 넘어가는 게 연속 이만큼 쌓이면 패배
  MAX_TURNS: 150,               // 이 턴(양쪽 합산)을 넘기면 무승부로 끝냄
  INVITE_MS: 30 * 1000,         // v136 친구 대전 신청을 기다려 주는 시간
  MAX_SPECTATORS: 10,           // v136 한 판을 동시에 관전할 수 있는 사람 수
  REPLAY_KEEP: 20,              // v137 계정마다 보관하는 리플레이 수 (오래된 것부터 지움)
  // v136 친구 대전은 골드·랭크·전적·일일 퀘스트에 반영되지 않는다 (부계정으로 골드를 모으는 것을 막기 위해)
  // 보상 한도는 없다: 판이 몇 턴에 끝났든, 하루 몇 판을 했든, 누구와 했든 이기면 매번 WIN_GOLD.
};
// v137 리플레이: 판을 시작할 때 쓰는 난수를 시드로 만든다 → 같은 시드 + 같은 행동이면 브라우저에서도 똑같은 판이 다시 만들어진다 (mulberry32)
function pvpRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
if (typeof module !== 'undefined') { module.exports = { PVP, pvpRng }; }
