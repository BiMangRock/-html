// pvp.js (공용) — 유저 대전 수치. 서버(pvp-core·pvp-db)와 대전 화면이 같은 값을 쓴다. 고치고 싶은 숫자는 여기만 바꾸면 된다.
const PVP = {
  WIN_GOLD: 50,                 // 이기면 받는 골드
  TURN_MS: 60 * 1000,           // 한 턴 제한 시간
  MULLIGAN_MS: 30 * 1000,       // 멀리건(시작 카드 교체) 제한 시간
  RECONNECT_MS: 60 * 1000,      // 연결이 끊긴 사람을 기다려 주는 시간 (넘으면 패배)
  MAX_TIMEOUTS: 3,              // 시간 초과로 턴이 넘어가는 게 연속 이만큼 쌓이면 패배
  MAX_TURNS: 150,               // 이 턴(양쪽 합산)을 넘기면 무승부로 끝냄
  // 보상 한도는 없다: 판이 몇 턴에 끝났든, 하루 몇 판을 했든, 누구와 했든 이기면 매번 WIN_GOLD.
};
if (typeof module !== 'undefined') { module.exports = { PVP }; }
