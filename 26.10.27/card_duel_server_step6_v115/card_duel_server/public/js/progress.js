// progress.js (공용, v132) — 카드 제작·분해(가루) · 일일 퀘스트 · 감정 표현 규칙. 서버와 화면이 같은 값을 쓴다.
//  숫자를 바꾸고 싶으면 이 파일만 고치면 된다.
const PROGRESS = {
  // ---- 카드 제작 / 분해 (가루) ----
  CRAFT:      { '일반': 40, '희귀': 100, '특급': 400, '전설': 1600 },   // 카드 1장 만드는 데 드는 가루
  DISENCHANT: { '일반': 10, '희귀': 40,  '특급': 200, '전설': 800 },    // 카드 1장 분해하면 받는 가루 (v133: 2배)
  // ---- 일일 퀘스트 ----
  PER_DAY: 3,                 // 하루에 받는 퀘스트 수
  REROLLS: 1,                 // 하루에 바꿀 수 있는 횟수
  MAX_GAMES_PER_DAY: 0,       // 하루에 퀘스트 진행으로 세는 판 수 (0 = 제한 없음)
  QUESTS: [
    { id: 'win2',     text: '게임에서 2번 승리하기',            stat: 'wins',    goal: 2,  gold: 60 },
    { id: 'play3',    text: '게임 3판 하기 (승패 상관없음)',     stat: 'games',   goal: 3,  gold: 40 },
    { id: 'spell10',  text: '주문 카드 10장 쓰기',              stat: 'spells',  goal: 10, gold: 50 },
    { id: 'minion15', text: '하수인 15마리 내기',               stat: 'minions', goal: 15, gold: 50 },
    { id: 'attack20', text: '하수인으로 20번 공격하기',         stat: 'attacks', goal: 20, gold: 50 },
    { id: 'face40',   text: '적 영웅에게 피해 40 주기',         stat: 'face',    goal: 40, gold: 50 },
    { id: 'power8',   text: '영웅 능력 8번 쓰기',               stat: 'powers',  goal: 8,  gold: 40 },
    { id: 'big6',     text: '비용 5 이상 카드 6장 내기',         stat: 'big',     goal: 6,  gold: 50 },
    { id: 'pvp1',     text: '유저 대전 1판 하기',               stat: 'pvp',     goal: 1,  gold: 60 },
    { id: 'adv1',     text: '모험 모드 보스전 1판 하기',         stat: 'adv',     goal: 1,  gold: 50 },
  ],
  // ---- 첫 걸음 (v140): 튜토리얼 첫 완료 보상. 계정당 한 번만, 받으면 목록에서 사라진다. 일일 퀘스트 칸·바꾸기와 무관 ----
  //  reward: {gold:N} 골드 / {legend:1} 아직 없는 전설 중 무작위 1장 (다 있으면 전체 전설 중 무작위). 모험·보스 전용 카드는 안 나옴
  TUTORIALS: [
    { id: 'basic',    name: '기본 튜토리얼', text: '기본 튜토리얼 완료하기', url: '/tutorial/index.html',
      desc: '처음이라면 · 대사와 함께 마나·도발·주문·돌진 등 기본 규칙을 직접 해 보며 배웁니다', reward: { gold: 1000 }, rewardText: '1,000골드' },
    { id: 'advanced', name: '고급 튜토리얼', text: '고급 튜토리얼 완료하기', url: '/tutorial/advanced.html', needs: 'basic',
      desc: '기본을 익혔다면 · 죽음의 메아리·발견·동결·주문 공격력 등 심화 규칙을 배웁니다', reward: { legend: 1 }, rewardText: '무작위 전설 카드 1장' },
  ],
  // 한 판에서 인정하는 최대치 (이상한 값을 막는 상한)
  STAT_CAP: { games: 1, wins: 1, spells: 999, minions: 999, attacks: 999, face: 9999, powers: 999, big: 999, pvp: 1, adv: 1 },   // v133 판당 상한 사실상 없음 (판 수·승리만 1)
  // ---- 감정 표현 ----
  EMOTES: [
    { id: 'hello',   text: '안녕하세요!' },
    { id: 'wp',      text: '잘했어요!' },
    { id: 'thanks',  text: '고마워요!' },
    { id: 'wow',     text: '대단해요!' },
    { id: 'oops',    text: '이런…' },
    { id: 'threat',  text: '두고 보자!' },
  ],
  EMOTE_GAP_MS: 1500,         // 감정 표현 사이 최소 간격
};
const craftableCard = c => !!(c && c.type && PROGRESS.CRAFT[c.rarity] != null && !(c.scope === 'adventure' || c.scope === 'boss') && !c.unlock);   // 상점 팩에서 나오는 일반 카드만
function cleanStats(raw) {                                   // 화면이 보낸 한 판 기록 → 상한을 넘지 않는 정수
  const out = {};
  for (const [k, cap] of Object.entries(PROGRESS.STAT_CAP)) { const v = Math.floor(Number(raw && raw[k]) || 0); out[k] = Math.max(0, Math.min(cap, v)); }
  return out;
}
if (typeof module !== 'undefined') { module.exports = { PROGRESS, craftableCard, cleanStats }; }
