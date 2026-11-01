// adventure.js — 모험 모드 공용 규칙 (브라우저·서버 공용, v117)
//  - BOSS_DEFAULT : 서버에 저장된 보스 목록이 없을 때 쓰는 기본 보스 (예전엔 ui.js 에 있었음)
//  - ADV_CHAPTERS : 도장깨기 챕터 목록 (영남대 입학 등). 챕터를 늘리려면 여기에 한 줄 추가
//  - 보스의 챕터 필드: chapter(챕터 id, ''=자유 보스전) · stage(단계 1~99, 0=없음) · rewardCards(첫 클리어 보상 카드 이름 배열)
//  - 잠금 규칙: 같은 챕터에서 자기보다 낮은 단계의 보스를 전부 깨야 열린다 (서버도 같은 함수로 다시 검사)
if (typeof module !== 'undefined' && typeof require === 'function' && typeof CARD_POOL === 'undefined') { globalThis.CARD_POOL = require('./cards.js').CARD_POOL; }

const ADV_CHAPTERS = [
  { id: 'ynu', name: '영남대 입학', icon: '🎓', desc: '수능부터 1·2·3·4학년을 거쳐 졸업까지, 한 단계씩 깨며 올라가는 도장깨기' },
];
const ADV_MAX_STAGE = 99, ADV_MAX_REWARD_CARDS = 10, ADV_REWARD_COPIES = 2, ADV_MAX_CHOICE = 30, ADV_BUNDLES = 3;   // 보상 카드: 보스당 최대 10줄, 같은 카드는 최대 2장(덱 한도)
const ADV_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// 보스 객체에서 챕터 관련 값만 정리해서 돌려준다 (잘못된 값은 조용히 버린다)
function advCleanFields(b) {
  const chapter = (typeof b.chapter === 'string' && ADV_ID_RE.test(b.chapter)) ? b.chapter : '';
  const st = Math.floor(Number(b.stage) || 0);
  const stage = chapter ? Math.max(0, Math.min(ADV_MAX_STAGE, st)) : 0;
  const cnt = {}, rewardCards = [];
  for (const n of (Array.isArray(b.rewardCards) ? b.rewardCards : [])) {
    const name = String(n).trim();
    if (!CARD_POOL.some(c => c.name === name && c.scope !== 'boss')) continue;     // 없는 카드·보스 전용 카드는 보상으로 줄 수 없다
    if ((cnt[name] = (cnt[name] || 0) + 1) > ADV_REWARD_COPIES) continue;
    if (rewardCards.length >= ADV_MAX_REWARD_CARDS) break;
    rewardCards.push(name);
  }
  // v117 보상 묶음 후보: 첫 클리어 때 이 카드들을 3묶음으로 나눠 하나를 고르게 한다 (같은 이름은 한 번만, 보스 전용 제외, 최대 30종)
  const rewardChoice = [...new Set((Array.isArray(b.rewardChoice) ? b.rewardChoice : []).map(n => String(n).trim()))]
    .filter(n => CARD_POOL.some(c => c.name === n && c.scope !== 'boss')).slice(0, ADV_MAX_CHOICE);
  return { chapter, stage, rewardCards, rewardChoice };
}
// 보상 묶음 만들기: 카드 종류를 무작위로 섞어 3등분(종류 수/3 씩), 남는 종류는 무작위 묶음에 하나씩 더한다. 묶음 안의 카드는 종류마다 2장.
//  rint(n) → 0 이상 n 미만 정수 (서버는 crypto 난수, 테스트는 시드 난수). 반환: [[카드 이름…], …] (최대 3묶음)
function advMakeBundles(names, rint) {
  const kinds = [...new Set(names)];
  for (let i = kinds.length - 1; i > 0; i--) { const j = rint(i + 1); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const n = Math.min(ADV_BUNDLES, kinds.length); if (!n) return [];
  const per = Math.floor(kinds.length / n), groups = [];
  for (let g = 0; g < n; g++) groups.push(kinds.slice(g * per, (g + 1) * per));
  const left = kinds.slice(n * per), slots = groups.map((_, i) => i);
  for (const k of left) { const pick = slots.splice(rint(slots.length), 1)[0]; groups[pick].push(k); }   // 남는 종류는 서로 다른 무작위 묶음에
  return groups.map(g => g.flatMap(k => Array(ADV_REWARD_COPIES).fill(k)));
}
// 보스 아이콘: 이모지(최대 4자) 또는 그림 경로(images/… .png/.jpg/.webp). 그림이면 모험 목록과 대전 화면에 그림으로 나온다
const ADV_ICON_IMG_RE = /^\/?images\/[A-Za-z0-9_\-./]{1,100}\.(png|jpe?g|webp|gif)$/i;
const advIsImgIcon = icon => typeof icon === 'string' && ADV_ICON_IMG_RE.test(icon) && !icon.includes('..');
const advCleanIcon = icon => { const t = String(icon || '').trim(); return advIsImgIcon(t) ? t : ([...t].slice(0, 2).join('').slice(0, 4) || '👹'); };
const advChapterInfo = id => ADV_CHAPTERS.find(c => c.id === id) || { id, name: id, icon: '📘', desc: '' };
// 한 챕터의 보스들을 단계 순서로
const advChapterBosses = (list, chapter) => list.filter(b => b.chapter === chapter).sort((a, b) => (a.stage || 0) - (b.stage || 0));
// 이 보스가 잠겨 있으면 "먼저 깨야 하는 보스"를, 열려 있으면 null 을 돌려준다.  isCleared(id) → bool
function advBlocker(boss, list, isCleared) {
  if (!boss || !boss.chapter || !(boss.stage > 0)) return null;
  for (const b of advChapterBosses(list, boss.chapter)) {
    if (b.id === boss.id || !(b.stage > 0) || b.stage >= boss.stage) continue;
    if (!isCleared(b.id)) return b;
  }
  return null;
}
// ---- v117 입학(런): 입학하면 모험 덱이 잠기고, 단계를 순서대로 깬다. 지면 처음부터. ----
// run = {deck:[카드 이름…], cleared:[보스 id…], startedAt}. 다음 상대 = 이번 입학에서 아직 안 깬 가장 낮은 단계
function advRunNext(list, chapter, run) {
  if (!run) return null;
  const done = new Set(run.cleared || []);
  return advChapterBosses(list, chapter).find(b => b.stage > 0 && !done.has(b.id)) || null;
}
// 개발자용: 영남대 9단계 틀 (보스 편집 화면의 [영남대 틀 추가] 버튼). 덱은 추천 덱으로 채워 두니 하나씩 바꾸면 된다.
// 덱이 정해진 단계는 deck 을 같이 적는다 (없으면 추천 덱으로 채움). 이미 같은 id 의 보스가 있으면 건너뛴다
const SUNEUNG_CARDS = ['다리 떠는 옆자리 수험생', '훌쩍거리는 앞자리 (비염 빌런)', '시험지 팍팍 넘기는 N수생', '엄격한 복도 순찰 감독관', '샤프심 똑 부러진 수능 샤프',
  '체증을 유발하는 보온도시락', '아랍어 로또 괴물 (5교시의 악령)', 'OMR 카드 밀려쓰기', '4교시 탐구영역 응시 규정 위반', '듣기평가 시간 비행기 소음 통제 실패',
  '수정테이프 빌리기 (손들기)', '가채점표 멘탈 붕괴', '비문학 3연타 (철학+경제+양자역학)', '종료령 5분 전 (마킹 타임어택)', '물수능 컷 폭발'];
// ---- 보스 덱 채우기 규칙 (v117) ----
//  보스 카드(보스 전용 + 공통 보스 하수인)가 15종에 모자라는 만큼 일반 카드 중 특급·전설로 채운다 (종류마다 2장 → 30장).
//  학년이 오를수록 전설 비율이 높아진다. 아래 두 목록은 앞에서부터 차례로 뽑으니, 순서를 바꾸거나 카드를 바꾸면 덱이 바뀐다.
const ADV_FILL_EPIC = ['누더기골렘', '기사대장', '노움 쩝쩝이', '늘푸른 수사슴', '토이란투스', '고대의 수호룡', '날개 달린 수호자', '지저왕', '타락심장 심문관', '걸어 다니는 샘', '신화의 공포'];
const ADV_FILL_LEGEND = ['카인 선퓨리', '마우와 파우', '불굴의 토레스', '다리우스 크롤리', '무역왕 갤리윅스', '태양지기 타림', '시초자', '광염의 피락', '바람의 군주 알아키르', '골드린', '왕 크루쉬', '티란투스', '데스윙'];
const ADV_LEGEND_SHARE = { 1: 0, 2: 0.3, 3: 0.5, 4: 0.7, final: 1 };   // 채움 카드 중 전설 비율 (나머지는 특급)
function advFillDeck(bossKinds, legendShare) {                          // 반환: 30장 카드 이름 배열
  const kinds = [...new Set(bossKinds)];
  if (kinds.length > 15) {                                                // 보스 카드가 15종보다 많으면: 앞쪽(전용 카드)부터 2장씩, 뒤쪽(공통 하수인)은 1장씩 → 30장
    const twos = Math.max(0, 30 - kinds.length);
    return kinds.slice(0, 30).flatMap((n, i) => i < twos ? [n, n] : [n]);
  }
  const need = Math.max(0, 15 - kinds.length), nL = Math.round(need * legendShare), nE = need - nL;
  const take = (list, n) => list.filter(x => !kinds.includes(x) && CARD_POOL.some(c => c.name === x)).slice(0, n);
  return [...kinds, ...take(ADV_FILL_EPIC, nE), ...take(ADV_FILL_LEGEND, nL)].flatMap(n => [n, n]);
}
// 학년별 보스 카드 (보스 전용 + 공통 하수인). 보스 카드를 새로 만들면 여기에 이름을 넣으면 된다
const YNU_COMMON = ['과잠 뽕에 취한 새내기', '전공 벽에 부딪힌 2학년', '영혼까지 갈려 나가는 사망년', '츄리닝 삼디다스 취준 화석'];
const YNU_1_CARDS = ['F폭격기 교수님', '발표 10분 전 잠수탄 조원', '군기반장 복학생', '수강신청 대참사와 8시간 우주공강', '숙취 속 월요일 아침 9시 출석 체크',
  '핫식스+레드불 붕붕드링크의 부작용', '본가로 직배송된 학사경고 통지서', ...YNU_COMMON];
const YNU_2_CARDS = ['입대 직전의 광기', '독박 쓴 조장', '전공 필수에서 마주친 전 CC', '외계어 전공 강의', '증원 요청 읍소 메일', '21학점의 무리수', '10년 만에 개편된 족보',
  '후배의 밥약 공격', '필름 끊긴 멋진 선배', '지식 밑천 드러난 선배', '입영 통지서', '지독한 겜태기', '어색해진 3대3 미팅', ...YNU_COMMON];   // 17종 → 전용 13종 2장 + 공통 4종 1장
const YNU_3_CARDS = ['영혼 탈곡된 동아리 회장', ...YNU_COMMON];
const YNU_4_CARDS = [...YNU_COMMON], YNU_FINAL_CARDS = [...YNU_COMMON];   // 아직 전용 카드 없음
// 예전 틀이 넣어 둔 임시 덱 (공통 하수인 + 채움). 보스에 이 덱이 그대로 있으면 틀 버튼이 새 덱으로 바꿔 준다 (직접 고친 덱은 그대로)
const ADV_OLD_TEMPLATE_DECKS = { ynu_2: [advFillDeck(YNU_COMMON, ADV_LEGEND_SHARE[2])], ynu_3: [advFillDeck(YNU_COMMON, ADV_LEGEND_SHARE[3])],
  ynu_4: [advFillDeck(YNU_COMMON, ADV_LEGEND_SHARE[4])], ynu_final: [advFillDeck(YNU_COMMON, ADV_LEGEND_SHARE.final)] };
const ADV_LEGACY_IDS = ['ynu_1a', 'ynu_1b', 'ynu_2a', 'ynu_2b', 'ynu_3a', 'ynu_3b', 'ynu_4a', 'ynu_4b'];   // 예전 틀(학년별 2단계). 틀 추가 버튼이 정리해 준다
const SUNEUNG_REWARDS = ['멘붕의 카페 알바생', '야간 편의점 근무자', '일당 15만 원의 유혹', '불판 세척 특공대', '마의 T자 코스',
  '파격적인 탈색 3연타', '안경 탈출 수술', '헬스장 3개월 등록', '방구석 통기타', '청춘의 내일로 티켓',
  '당당한 주민등록증', '인생 첫 술', '롤 다이아 승급전: 캐리 머신', 'PC방 30시간 올나잇 파티', '봉인 해제: 무한 백수 라이프'];
const ADV_TEMPLATE_REWARDS = { ynu_suneung: SUNEUNG_REWARDS };   // 틀의 보상 묶음 후보 (이미 추가된 보스도 비어 있으면 채운다)
const ADV_TEMPLATES = {
  ynu: [   // [id, 이름, 아이콘, 소개, 덱(선택)]
    ['ynu_suneung', '수능', 'images/boss/ynu_suneung.jpg', '대학수학능력시험 — 시험장의 모든 악몽이 한꺼번에 덮쳐 온다', SUNEUNG_CARDS.flatMap(n => [n, n])],
    ['ynu_1', '1학년', 'images/boss/ynu_1a_statue.jpg', '새내기의 악몽 — 수강신청 대참사부터 본가로 날아온 학사경고 통지서까지', advFillDeck(YNU_1_CARDS, ADV_LEGEND_SHARE[1])],
    ['ynu_2', '2학년', '😵', '현실 자각 — 잠수 타는 팀플 조원, 전공 F 폭격, 곰팡이 핀 자취방', advFillDeck(YNU_2_CARDS, ADV_LEGEND_SHARE[2])],
    ['ynu_3', '3학년', '☕', '사망년 — 토익 800의 벽, 자격증 연쇄 탈락, 끝나지 않는 밤샘', advFillDeck(YNU_3_CARDS, ADV_LEGEND_SHARE[3])],
    ['ynu_4', '4학년', '👔', '취준생 — 서류 50곳 탈락, 압박 면접, 눈물의 졸업 유예', advFillDeck(YNU_4_CARDS, ADV_LEGEND_SHARE[4])],
    ['ynu_final', '졸업', '🎓', '최종 보스 — 졸업 학점, 졸업 논문, 그리고 최종 합격 발표', advFillDeck(YNU_FINAL_CARDS, ADV_LEGEND_SHARE.final)],
  ],
};

const BOSS_DEFAULT = [
 {id:'boss1', name:'불꽃 약탈자', icon:'🔥', desc:'싼 하수인으로 몰아치는 어그로 덱', cheats:[], tier:'mid', bot:'rule2', model:'',
  deck:["책벌레", "방패병", "죄악석 토템", "보석 박힌 딱정벌레", "카인 선퓨리", "점화", "혈기술사", "명암의 사도", "주문사수", "부상당한 크발디르", "치유의 빛", "강철 파수대장", "검 제작의 대가", "공허의 영혼", "날쌘 척후병", "번개 폭풍", "복제", "성게 가시", "강화", "죄악석 토템", "분열하는 점액", "오늘의 월척", "날쌘 척후병", "수정 골렘", "강철 파수대장", "번개", "주문사수", "검 제작의 대가", "약초꾼", "대사제 데칼"]},
 {id:'boss2', name:'균형의 수호자', icon:'⚖️', desc:'중간 코스트 위주의 미드레인지 덱', cheats:['hp'], tier:'mid', bot:'rule2', model:'',
  deck:["불굴의 토레스", "채광 사상자", "시초자", "허기진 포식자", "바르덴 던그래스프", "채광 사상자", "벼락 마법사", "어둠가시 바느질꾼", "주문사수", "부화장 도우미", "거대한 토템 아이스오르", "검 제작의 대가", "공허의 영혼", "불꽃의 토템", "불꽃의 토템", "거머리 어미 발토라", "비겁한 밀고자", "견습 검사", "전장의 강령술사", "덱 탐색", "그훈의 피", "피의 소용돌이", "전력 질주", "스테레오 토템", "고대의 공허 사냥개", "비겁한 밀고자", "왕의 축복", "왕 크루쉬", "타르막", "거머리 어미 발토라"]},
 {id:'boss3', name:'고대의 지배자', icon:'👑', desc:'비싼 카드와 주문으로 버티는 컨트롤 덱', cheats:['hp','costDown'], tier:'mid', bot:'rule2', model:'',
  deck:["타락심장 심문관", "뱀사육사", "왕 크루쉬", "거품로봇", "카인 선퓨리", "기사대장", "대장군 분", "빛의 수호자", "비전 수호자", "적자생존", "영혼의 절규", "강철 파수대장", "대마법학자 롬메스", "대주교 베네딕투스", "퍼져나가는 역병", "영혼의 절규", "로데브", "브롤 베어맨틀", "요그사론의 종복", "에메리스", "저지해라!", "적자생존", "처형", "수호의 장벽", "곰팡이술사", "가시가 돋친 탈것", "변이", "여름의 평화수호자", "아마라의 이야기", "불사조"]},

 {id:'boss4', name:'심연의 군주', icon:'🐲', desc:'학습한 AI가 조종하는 상급 보스 (모델을 연결하기 전에는 임시로 중급2가 대신 싸웁니다)', cheats:[], tier:'high', bot:'model', model:'',
  deck:["불굴의 토레스", "채광 사상자", "시초자", "허기진 포식자", "바르덴 던그래스프", "채광 사상자", "벼락 마법사", "어둠가시 바느질꾼", "주문사수", "부화장 도우미", "거대한 토템 아이스오르", "검 제작의 대가", "공허의 영혼", "불꽃의 토템", "불꽃의 토템", "거머리 어미 발토라", "비겁한 밀고자", "견습 검사", "전장의 강령술사", "덱 탐색", "그훈의 피", "피의 소용돌이", "전력 질주", "스테레오 토템", "고대의 공허 사냥개", "비겁한 밀고자", "왕의 축복", "왕 크루쉬", "타르막", "거머리 어미 발토라"]},
];

if (typeof module !== 'undefined') { module.exports = { ADV_OLD_TEMPLATE_DECKS, advRunNext, ADV_FILL_EPIC, ADV_FILL_LEGEND, ADV_LEGEND_SHARE, ADV_LEGACY_IDS, advFillDeck, YNU_COMMON, YNU_1_CARDS, YNU_2_CARDS, YNU_3_CARDS, YNU_4_CARDS, YNU_FINAL_CARDS, SUNEUNG_REWARDS, ADV_TEMPLATE_REWARDS, ADV_BUNDLES, advMakeBundles, SUNEUNG_CARDS, advIsImgIcon, advCleanIcon, ADV_CHAPTERS, ADV_MAX_STAGE, ADV_MAX_REWARD_CARDS, ADV_REWARD_COPIES, ADV_TEMPLATES, BOSS_DEFAULT, advCleanFields, advChapterInfo, advChapterBosses, advBlocker }; }
