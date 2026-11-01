// adventure.js — 모험 모드 공용 규칙 (브라우저·서버 공용, v117)
//  - BOSS_DEFAULT : 서버에 저장된 보스 목록이 없을 때 쓰는 기본 보스 (예전엔 ui.js 에 있었음)
//  - ADV_CHAPTERS : 도장깨기 챕터 목록 (영남대 입학 등). 챕터를 늘리려면 여기에 한 줄 추가
//  - 보스의 챕터 필드: chapter(챕터 id, ''=자유 보스전) · stage(단계 1~99, 0=없음) · rewardCards(첫 클리어 보상 카드 이름 배열)
//  - 잠금 규칙: 같은 챕터에서 자기보다 낮은 단계의 보스를 전부 깨야 열린다 (서버도 같은 함수로 다시 검사)
if (typeof module !== 'undefined' && typeof require === 'function' && typeof CARD_POOL === 'undefined') { globalThis.CARD_POOL = require('./cards.js').CARD_POOL; }

const ADV_CHAPTERS = [
  { id: 'ynu', name: '영남대 입학', icon: '🎓', desc: '1학년 1학기부터 졸업 시험까지, 한 단계씩 깨며 올라가는 도장깨기' },
];
const ADV_MAX_STAGE = 99, ADV_MAX_REWARD_CARDS = 10, ADV_REWARD_COPIES = 2;   // 보상 카드: 보스당 최대 10줄, 같은 카드는 최대 2장(덱 한도)
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
  return { chapter, stage, rewardCards };
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
// 개발자용: 영남대 9단계 틀 (보스 편집 화면의 [영남대 틀 추가] 버튼). 덱은 추천 덱으로 채워 두니 하나씩 바꾸면 된다.
// 덱이 정해진 단계는 deck 을 같이 적는다 (없으면 추천 덱으로 채움). 이미 같은 id 의 보스가 있으면 건너뛴다
const SUNEUNG_CARDS = ['다리 떠는 옆자리 수험생', '훌쩍거리는 앞자리 (비염 빌런)', '시험지 팍팍 넘기는 N수생', '엄격한 복도 순찰 감독관', '샤프심 똑 부러진 수능 샤프',
  '체증을 유발하는 보온도시락', '아랍어 로또 괴물 (5교시의 악령)', 'OMR 카드 밀려쓰기', '4교시 탐구영역 응시 규정 위반', '듣기평가 시간 비행기 소음 통제 실패',
  '수정테이프 빌리기 (손들기)', '가채점표 멘탈 붕괴', '비문학 3연타 (철학+경제+양자역학)', '종료령 5분 전 (마킹 타임어택)', '물수능 컷 폭발'];
const ADV_TEMPLATES = {
  ynu: [   // [id, 이름, 아이콘, 소개, 덱(선택)]
    ['ynu_suneung', '수능', 'images/boss/ynu_suneung.jpg', '대학수학능력시험 — 시험장의 모든 악몽이 한꺼번에 덮쳐 온다', SUNEUNG_CARDS.flatMap(n => [n, n])],
    ['ynu_1a', '1학년 · 수강신청 대참사', '⏰', '09:00:00, 새로고침을 누른 순간 시간표는 전부 1교시가 되었다'],
    ['ynu_1b', '1학년 · 학사경고 우편물', '✉️', '족보만 믿었던 1학기, 집으로 낯선 봉투가 날아왔다'],
    ['ynu_2a', '2학년 · 잠수 타는 팀플 조원', '🫥', '발표 전날 밤, 단톡방의 1이 사라지지 않는다'],
    ['ynu_2b', '2학년 · 곰팡이 자취방 집주인', '🏚️', '벽지 뒤 곰팡이, 돌려받지 못한 보증금'],
    ['ynu_3a', '3학년 · 토익 800의 벽', '📝', '이번엔 될 줄 알았다. 지난번에도 그렇게 생각했다'],
    ['ynu_3b', '3학년 · 대학원 권유하는 교수님', '🔬', '"자네, 석사 생각 없나?" 랩실 문이 닫혔다'],
    ['ynu_4a', '4학년 · 서류 50곳 연속 탈락', '📄', '"귀하의 우수한 역량에도 불구하고..."'],
    ['ynu_4b', '4학년 · 압박 면접관', '👔', '"그래서 본인의 장점이 뭐죠?" 머릿속이 하얘진다'],
    ['ynu_final', '졸업', '🎓', '최종 보스 — 졸업 학점, 졸업 논문, 그리고 최종 합격 발표'],
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

if (typeof module !== 'undefined') { module.exports = { SUNEUNG_CARDS, advIsImgIcon, advCleanIcon, ADV_CHAPTERS, ADV_MAX_STAGE, ADV_MAX_REWARD_CARDS, ADV_REWARD_COPIES, ADV_TEMPLATES, BOSS_DEFAULT, advCleanFields, advChapterInfo, advChapterBosses, advBlocker }; }
