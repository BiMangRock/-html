// cutscene.js — v150 컷신 엔진 (선택지 · 미니게임 · 숨은 수치 · 큰 초상화)
//   Cutscene.play(id)  → Promise. 끝나거나 건너뛰면 resolve. 그림을 못 받아도 글자만으로 진행한다
//   Cutscene.seen(id)  → 이 계정(이 기기)에서 끝까지 본 적이 있는지. 본 적이 있으면 [건너뛰기]가 보인다 (개발자는 항상)
//   StoryState         → 숨은 수치(🍺취기 ⭐평판 💌첫사랑 📝학점 💪컨디션 ✏️수능점수)와 선택 기록. 계정·기기별 localStorage
//
//   컷신은 보스에 들어갈 때마다 나온다 (ui.js startBoss)
//     · 'suneung' : 수능 스토리(advstory.js, 팀원 작업) 뒤 → 1교시 시험 문제 3개 + OMR 밀림 위기 → 보스전
//     · 'ynu1'    : 1학년 → 합격 발표 · 포차 · 007빵 · 소주병 잡기 · 춤 · 골목 · 아침 · 단톡방 · 첫사랑 카톡 · 출석 · 1학기 성적표
//   선택과 미니게임 결과는 StoryState 에 쌓여서 다음 장면(과 다음 학년)의 대사·그림을 바꾼다
//
//   대본 한 줄(step) — 공통: if(s => 조건) · bg · face · fx(['shake','flash','glare','slowmo','silence','spin','eyes','black','drunk','phone','phoneOff','fade','red','pink','cold'])
//     {t:'scene', no|kicker, title, time, bg}         장면 제목 카드
//     {t:'say', who, face, act, text} {t:'mono'} {t:'desc'}   대사 · 독백 · 지문 (text 는 문자열 또는 s => 문자열)
//     {t:'choice', q, opts:[{label, sub, img, set:{alc:+1}, flag:{k:v}, then:[...]}], def, style:'list'|'dance'|'kakao'}
//     {t:'game', g:'007'|'catch'|'attend'|'quiz'|'mash', ...}   미니게임 (결과는 수치·flag 로 남는다)
//     {t:'vs'} {t:'big'} {t:'dance'} {t:'video'} {t:'chat'} {t:'call'} {t:'ring'} {t:'kakao'} {t:'set'} {t:'calc'} {t:'report'}
(() => {
  'use strict';
  const DIR = '/images/cutscene/';
  const KEY = 'cardDuel.cut.';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const userKey = () => { const u = window.CURRENT_USER; return u && (u.username || u.id) ? String(u.username || u.id) : 'guest'; };
  const isDev = () => !!(window.ServerStore && ServerStore.isAdmin);
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===================== 숨은 수치 (StoryState) =====================
  //  장(chapter)마다 따로 쌓는다. 어떤 장을 다시 시작하면 그 장과 뒤의 장 기록만 지운다 (수능을 다시 보면 1학년 기록도 새로)
  const StoryState = (() => {
    const ORDER = ['suneung', 'ynu1'];
    const STATS = { alc: '🍺 취기', rep: '⭐ 평판', love: '💌 첫사랑', grade: '📝 학점', cond: '💪 컨디션', score: '✏️ 수능' };
    const k = () => 'cardDuel.storyState.' + userKey();
    const load = () => { try { const d = JSON.parse(localStorage.getItem(k()) || 'null'); if (d && d.ch) return d; } catch (_) {} return { ch: {}, cur: 'ynu1' }; };
    const save = d => { try { localStorage.setItem(k(), JSON.stringify(d)); } catch (_) {} };
    function begin(ch) {
      const d = load(), i = ORDER.indexOf(ch);
      (i < 0 ? [ch] : ORDER.slice(i)).forEach(c => delete d.ch[c]);
      d.cur = ch; d.ch[ch] = { d: {}, f: {} }; save(d);
    }
    function get() {
      const d = load(), s = { alc: 0, rep: 0, love: 0, grade: 0, cond: 0, score: 0 };
      ORDER.concat(Object.keys(d.ch).filter(c => !ORDER.includes(c))).forEach(c => {
        const x = d.ch[c]; if (!x) return;
        Object.entries(x.d || {}).forEach(([key, v]) => { s[key] = (s[key] || 0) + v; });
        Object.assign(s, x.f || {});
      });
      return s;
    }
    function apply(delta, flags, quiet) {
      const d = load(); const c = d.ch[d.cur] || (d.ch[d.cur] = { d: {}, f: {} });
      Object.entries(delta || {}).forEach(([key, v]) => { c.d[key] = (c.d[key] || 0) + v; });
      Object.assign(c.f, flags || {}); save(d);
      if (!quiet) popup(delta);
    }
    // 수치가 바뀌면 화면 위쪽에 「🍺 +2」 처럼 잠깐 떠올랐다 사라진다
    function popup(delta) {
      const list = Object.entries(delta || {}).filter(([key, v]) => v && STATS[key]);
      if (!list.length) return;
      let box = document.getElementById('ssPop');
      if (!box) { box = document.createElement('div'); box.id = 'ssPop'; document.body.appendChild(box); }
      list.forEach(([key, v], i) => {
        const e = document.createElement('div');
        e.className = 'ss-chip ' + (v > 0 ? 'up' : 'down') + (key === 'alc' ? ' alc' : '');
        e.textContent = `${STATS[key]} ${v > 0 ? '+' : ''}${v}`;
        e.style.animationDelay = (i * 0.15) + 's';
        box.appendChild(e); setTimeout(() => e.remove(), 2400 + i * 150);
      });
    }
    return { begin, get, apply, popup, STATS, get cur() { return load().cur; } };
  })();
  window.StoryState = StoryState;

  // ===================== 대본 =====================
  const ME = '나', HW = '현우', SB = '선배', CR = '첫사랑', PF = '교수님';
  const STORY = '/images/ynu/story/';
  const DANCES = {
    windmill: { name: '통제 불능의 윈드밀', frames: ['dance_flail', 'dance_windmill', 'dance_windmill2'], rep: 3, word: '윈드밀' },
    backspin: { name: '인간 팽이 백스핀', frames: ['dance_flail', 'dance_backspin'], rep: 2, word: '백스핀' },
    worm:     { name: '바닥 기어가는 지렁이 댄스', frames: ['dance_flail', 'dance_worm'], rep: 2, word: '지렁이 댄스' },
    freeze:   { name: '처절한 한 팔 프리즈', frames: ['dance_flail', 'dance_freeze'], rep: 1, word: '한 팔 프리즈' },
  };
  const drunk = s => s.alc >= 4;          // 만취 루트 (사고 · 전봇대 · 블랙아웃 · 숙취)
  const danced = s => s.dance && s.dance !== 'none';
  const snGrade = s => s.sn || 'A';

  const SCRIPTS = {
    // ---------------- 수능 1교시 (advstory 수능 스토리 바로 뒤) ----------------
    suneung: {
      dir: 'ynu1/', title: '수능 · 1교시',
      steps: [
        { t: 'scene', kicker: '수능 당일', title: '1교시 · 국어 영역', time: '오전 8:40', bg: 'bg_exam_room' },
        { t: 'desc', text: '감독관이 문제지를 나눠 준다. 펄럭— 종이 넘기는 소리만 가득하다.' },
        { t: 'mono', face: 'me_sn_calm', text: s => s.cond >= 2 ? '머리가 맑다. 오늘은… 할 수 있다.' : s.cond <= -1 ? '눈꺼풀이 천근만근이다… 정신 차리자, 강민수.' : '원래 하던 대로. 원래 하던 대로.' },
        { t: 'desc', text: '문제당 시간은 밧줄이 다 탈 때까지! 모르겠으면… 3번으로 찍어도 된다.' },
        { t: 'game', g: 'quiz', subj: '국어', no: 18,
          q: '다음 글에 드러난 화자의 정서로 가장 적절한 것은?',
          passage: '창밖엔 첫눈, 책상엔 수능 특강.\n펜은 지문 위를 걷는데, 마음은 이미\n수능 끝난 다음 날 늦잠 속에 누워 있다.',
          opts: ['학업에 대한 뜨거운 열정', '자연에 대한 경외감', '현실에서 벗어나고 싶은 마음', '첫눈을 기다리는 설렘', '출판사에 대한 감사'], ans: 2 },
        { t: 'game', g: 'quiz', subj: '수학', no: 21,
          q: '(전날 잔 시간) × (유튜브를 본 편수) = 12 이다.\n유튜브를 4편 봤다면, 전날 잔 시간은?',
          opts: ['2시간', '4시간', '6시간', '3시간', '12시간'], ans: 3 },
        { t: 'game', g: 'quiz', subj: '영어', no: 29,
          q: 'Choose the word that best fits the blank.',
          passage: 'After the exam, I will finally ______ my phone for twelve hours straight.',
          opts: ['study', 'stare at', 'ignore', 'recycle', 'fax'], ans: 1 },
        { t: 'desc', bg: 'bg_omr', text: '답안지에 옮겨 적다가… 어? 번호가 한 칸씩 밀린 것 같다!!', fx: ['shake', 'red'] },
        { t: 'choice', q: '(남은 시간은 얼마 없다. 어떻게 할까?)', def: 0, opts: [
          { label: '지우고 다시 마킹한다!', sub: '화면을 빠르게 연타!', then: [
            { t: 'game', g: 'mash', need: 12, ms: 3500, label: '다시 마킹!' },
          ] },
          { label: '설마… 그냥 낸다', sub: '✏️ −1', set: { score: -1 }, then: [
            { t: 'mono', face: 'me_sn_panic', text: '…불안하다. 너무 불안하다.' },
          ] },
        ] },
        { t: 'calc', fn: s => ({ sn: s.score + (s.cond >= 2 ? 1 : 0) >= 4 ? 'S' : s.score + (s.cond >= 2 ? 1 : 0) >= 2 ? 'A' : 'B' }) },
        { t: 'big', kicker: '딩- 동- 댕- 동-', text: '1교시 종료', sub: '결과는… 한 달 뒤에 나온다' },
      ],
    },

    // ---------------- 1학년 ----------------
    ynu1: {
      dir: 'ynu1/', title: '영남대 입학 · 1학년',
      preload: ['bg_phone', 'bg_room', 'bg_room_fresh', 'me_drunk', 'me_cool', 'me_hangover'],   // 조건에 따라 고르는 그림 (s => …) 은 여기서 미리 받는다
      steps: [
        // ---- 프롤로그 : 합격 발표 (수능 결과에 따라) ----
        { t: 'scene', kicker: 'PROLOGUE', title: '합격자 발표', time: '12월', bg: STORY + 's1_living.jpg' },
        { t: 'desc', text: '수능이 끝나고 한 달. 오늘은 합격자 발표 날이다. 떨리는 손으로 새로고침을 누른다.' },
        { if: s => snGrade(s) === 'S', t: 'say', who: ME, face: 'me_sn_happy', text: '자… 장학생?! 엄마!! 나 장학금 받는대!!', fx: ['flash'] },
        { if: s => snGrade(s) === 'S', t: 'say', who: '엄마', face: STORY + 'mom_happy', text: '어머 어머! 우리 아들 장하다!! 이모한테 전화해야겠네!' },
        { if: s => snGrade(s) === 'A', t: 'mono', face: 'me_sn_relief', text: '합격. …됐다. 진짜 됐다.' },
        { if: s => snGrade(s) === 'A', t: 'say', who: '엄마', face: STORY + 'mom_happy', text: '고생했어, 아들. 오늘은 맛있는 거 먹자!' },
        { if: s => snGrade(s) === 'B', t: 'say', who: ME, face: 'me_sn_panic', text: '예비 번호…? 추가합격… 마지막 차례로…?', fx: ['shake'] },
        { if: s => snGrade(s) === 'B', t: 'say', who: '엄마', face: STORY + 'mom_worried', text: '그, 그래도 붙었잖니… 붙은 게 어디야, 아들.' },
        { t: 'mono', text: '그렇게 나는, 영남대 새내기가 되었다.' },

        // ---- 씬 1 : 왁자지껄한 포차 ----
        { t: 'scene', no: 1, title: '왁자지껄한 포차', time: '오후 8:30', bg: 'bg_pocha_out' },
        { t: 'desc', text: '3월, 대학가 포차 골목. 오늘은 우리 과 신입생 환영회다.' },
        { t: 'desc', bg: 'bg_toast', text: '좁은 깡통 테이블에 과잠 입은 동기들이 다닥다닥. 쨍— 일제히 잔이 가운데로 모인다!', fx: ['flash'] },
        { t: 'say', who: SB, face: 'sb_smile', text: s => snGrade(s) === 'S' ? '자, 다들 입학 축하하고! 오~ 네가 그 장학생? 오늘 무리하지 마라~'
          : snGrade(s) === 'B' ? '자, 다들 입학 축하하고! 추합 막차 탄 친구도 왔네? 천천히 마셔~' : '자, 다들 입학 축하하고! 1학년들 오늘 무리하지 마라. 천천히 마셔~' },
        { t: 'say', who: HW, face: 'hw_hype', act: '신나서 안경을 치켜올리며', text: '선배님! 오늘 저희 1학년들 체력 완전 좋습니다! 끝까지 달릴 수 있습니다!' },
        { t: 'choice', q: '(첫 잔이다. 어떻게 마실까?)', def: 0, opts: [
          { label: '원샷! 허세 한 번 부린다', sub: '🍺 +2  ⭐ +1', set: { alc: 2, rep: 1 }, then: [
            { t: 'say', who: ME, face: 'me_cool', act: '소주잔을 단숨에 털어 넣고 세상 쿨한 척', text: '에이 선배님, 소주 쓰다고 누가 그래요? 완전 물맛인데? 그냥 달달한데요?' },
            { t: 'mono', face: 'me_cool', text: '스무 살 3월, 세상에 무서울 게 없던 시절. 내 주량이 소주 반 병이라는 슬픈 진실을 알기엔 내 패기가 너무 거대했다.' },
          ] },
          { label: '반만 마신다', sub: '🍺 +1', set: { alc: 1 }, then: [
            { t: 'say', who: ME, face: 'me_cool', text: '저는 천천히 가겠습니다! 장기전이니까요.' },
            { t: 'say', who: SB, face: 'sb_smile', text: '오~ 페이스 조절할 줄 아네?' },
          ] },
          { label: '몰래 사이다로 바꿔치기', sub: '🍺 0  ⭐ −1', set: { rep: -1 }, flag: { cider: true }, then: [
            { t: 'mono', face: 'me_cool', text: '테이블 밑에서 사이다로 슬쩍… 캬, 달다!' },
            { t: 'say', who: HW, face: 'hw_laugh', text: '…너 그거 사이다지? 다 보인다 ㅋㅋㅋ' },
          ] },
        ] },

        // ---- 씬 2 : 지옥의 술게임 ----
        { t: 'scene', no: 2, title: '지옥의 술게임', time: '오후 10:45', bg: 'bg_game_table' },
        { if: s => s.alc >= 2, t: 'fx', fx: ['drunk'] },
        { t: 'desc', text: '빈 소주병이 줄지어 쓰러져 있다. 「마시면서 배우는~ 랜덤게임! 게임 스타트!」' },
        { t: 'vs', left: { face: 'me_drunk', name: '강민수', sub: '새내기' }, right: { face: 'hw_hype', name: '동기들', sub: '+ 선배' }, title: '007빵', sub: '틀리면 벌주!' },
        { t: 'game', g: '007', rounds: 5, bg: 'bg_007_target' },
        { t: 'say', who: ME, face: s => drunk(s) ? 'me_drunk' : 'me_cool', text: s => drunk(s) ? '아~ 마시면서 배우는 랜덤게임! 선배님! 이번엔 제가 한 잔 채워드리겠습니다아!' : '흐흐, 이 정도면 선방이지! 선배님 한 잔 받으십쇼!', bg: 'bg_drinking_game' },
        { if: drunk, t: 'say', who: HW, face: 'hw_panic', act: '사색이 되어 내 팔을 다급하게 붙잡으며', text: '야, 야! 강민수 너 지금 물통에 소주 따르고 있어! 그만 마셔, 제발!' },
        { if: s => !drunk(s), t: 'say', who: HW, face: 'hw_hype', text: '오~ 민수 오늘 멀쩡한데? 술 좀 하네?' },
        { t: 'choice', q: '(현우가 걱정스럽게 쳐다본다. 어떻게 할까?)', def: 1, opts: [
          { label: '…물로 바꾼다', sub: '🍺 −1', set: { alc: -1 }, then: [
            { t: 'say', who: ME, face: 'me_relief', text: '…그래, 물 좀 마시자.' },
            { t: 'say', who: HW, face: 'hw_hype', text: '현명하다! 역시 내 친구!' },
          ] },
          { label: '한 잔만 더!', sub: '🍺 +2  ⭐ +1', set: { alc: 2, rep: 1 }, then: [
            { t: 'say', who: ME, face: 'me_drunk', act: '자신만만하게 손을 훠이훠이 내저으며', text: '아이 괜찮아~ 나 하나도 안 취했… 어?' },
          ] },
          { label: '선배님, 흑기사 해 주세요!', sub: '⭐ +1', set: { rep: 1 }, flag: { knight: true }, then: [
            { t: 'say', who: SB, face: 'sb_smile', text: '어휴, 이번 한 번만이다? (원샷)' },
          ] },
        ] },
        // 사고: 취했으면 팔꿈치가 테이블을 친다 → 3초 안에 병을 잡아라
        { if: drunk, t: 'desc', text: '휘청— 팔꿈치가 테이블 모서리를 강하게 친다!', fx: ['shake'] },
        { if: drunk, t: 'game', g: 'catch' },
        { if: s => drunk(s) && s.caught, t: 'desc', bg: 'bg_bottle_catch', text: '…탁. 바닥 직전, 소주병을 한 손으로 낚아챘다.', fx: ['flash'] },
        { if: s => drunk(s) && s.caught, t: 'say', who: HW, face: 'hw_panic', text: '미, 미친… 방금 봤어?! 저게 된다고?!' },
        { if: s => drunk(s) && s.caught, t: 'say', who: SB, face: 'sb_panic', text: '너 뭐야?! 반사신경 무슨 일이야?!' },
        { if: s => drunk(s) && s.caught, t: 'mono', face: 'me_proud', text: '취해도 반사신경은 살아 있다. 오늘 밤 나는 전설이 됐다. 좋은 쪽으로.' },
        { if: s => drunk(s) && !s.caught, t: 'desc', text: '슬로우 모션처럼… 초록색 소주병이 허공을 가른다.', bg: 'bg_crash1', fx: ['slowmo'] },
        { if: s => drunk(s) && !s.caught, t: 'desc', text: '와장창——!!', bg: 'bg_crash2', fx: ['flash', 'shake', 'big'] },
        { if: s => drunk(s) && !s.caught, t: 'desc', text: '순간, 술집 안의 웅성거림이 뚝 끊긴다. 모든 시선이 이쪽으로 쏠린다.', face: 'sb_panic', fx: ['silence'] },
        { if: s => drunk(s) && !s.caught, t: 'mono', face: 'me_drunk', text: '쨍그랑 소리와 함께… 내 마지막 이성의 끈도 산산조각 났다.', set: { rep: -1 }, flag: { crash: true } },
        { if: s => !drunk(s), t: 'desc', text: '다행히 오늘은 아무 사고도 없었다. 테이블 위 소주병들은 무사하다.' },
        // 춤
        { t: 'desc', bg: 'bg_toast', text: s => drunk(s) ? '어디선가 신나는 음악이 터진다. 흥이 끝까지 올랐다. 동기들이 박수를 치며 나를 부른다!' : '어디선가 신나는 음악이 터진다. 동기들이 박수를 치며 나를 부른다!', fx: ['shake'] },
        { t: 'choice', style: 'dance', q: '(어떤 춤을 출까…)', def: 0, opts: [
          ...Object.entries(DANCES).map(([key, d]) => ({ label: d.name, img: d.frames[d.frames.length - 1], set: { rep: d.rep }, flag: { dance: key }, then: [{ t: 'dance', key }] })),
          { label: '안 춘다 (박수 담당)', flag: { dance: 'none' }, then: [
            { t: 'say', who: ME, face: 'me_relief', text: '저는 박수 담당 하겠습니다!' },
            { t: 'say', who: HW, face: 'hw_sigh', text: '에이~ 재미없어~' },
          ] },
        ] },
        { if: danced, t: 'mono', text: '그리고 그 모든 순간을… 누군가 찍고 있었다.' },

        // ---- 씬 3 : 심야의 골목길 ----
        { t: 'scene', no: 3, title: '심야의 골목길', time: '새벽 1:10', bg: 'bg_alley_wide' },
        { if: drunk, t: 'desc', bg: 'bg_pole', fx: ['drunk'], text: '차가운 밤바람. 나는 전봇대에 이마를 박고, 한 손으로 기둥을 필사적으로 붙잡고 있다.' },
        { if: drunk, t: 'choice', q: '(전봇대를 붙잡고… 무슨 짓을 할까?)', def: 0, opts: [
          { label: '전봇대와 대화한다', then: [
            { t: 'say', who: ME, face: 'me_cry', act: '전봇대를 부둥켜안고 울먹거리며', text: '야… 전봇대야… 넌 왜 맨날 여기 서 있냐…? 다리 안 아프냐…? 인생 진짜 춥다, 그치…?' },
            { t: 'say', who: HW, face: 'hw_sigh', act: '깊은 한숨을 쉬며 다가와 등짝을 찰싹', text: '민수야, 제발 부탁인데 전봇대한테 말 걸지 마. 너 지금 사람 지나갈 때마다 통곡하고 있거든?', fx: ['shake'] },
          ] },
          { label: '현우에게 우정 고백', sub: '⭐ +1', set: { rep: 1 }, then: [
            { t: 'say', who: ME, face: 'me_cry', text: '현우야… 흑… 나는 니가 진짜… 진짜 좋다…' },
            { t: 'say', who: HW, face: 'hw_sigh', text: '…알았으니까 좀 놔. 사람들 쳐다봐.' },
          ] },
          { label: '첫사랑에게 전화한다', sub: '???', flag: { called: true }, then: [
            { t: 'ring', bg: 'bg_call', name: '고등학교 첫사랑', times: 3 },
            { t: 'mono', face: 'me_cry', text: '받지 않는다. …한 번 더. 딱 한 번만 더.' },
            { t: 'say', who: HW, face: 'hw_panic', text: '야!! 너 누구한테 전화하는 거야!! 폰 내놔!!', fx: ['shake'] },
          ] },
        ] },
        { if: drunk, t: 'desc', bg: 'bg_choco', text: '현우가 빨대 꽂힌 차가운 초코우유를 내 눈앞에 쑥 내민다.' },
        { if: drunk, t: 'say', who: HW, face: 'hw_sigh', text: '자, 이거 마시고 제발 정신 차려라. 택시 잡았으니까 타고 집에 가자, 응?' },
        { if: drunk, t: 'choice', q: '(초코우유를…)', def: 0, opts: [
          { label: '받아 마신다', sub: '🍺 −2', set: { alc: -2 }, flag: { choco: true }, then: [
            { t: 'say', who: ME, face: 'me_cry', act: '초코우유를 멍하니 바라보다가', text: '현우야… 흑… 너밖에 없다… 나 평생 너한테 충성한다…' },
          ] },
          { label: '됐어, 나 안 취했어!', sub: '🍺 +1', set: { alc: 1 }, then: [
            { t: 'say', who: ME, face: 'me_drunk', text: '됐거든~ 나 멀쩡하거든~?' },
            { t: 'say', who: HW, face: 'hw_sigh', text: '…그래. 내일 보자, 전설아.' },
          ] },
        ] },
        { if: s => !drunk(s), t: 'desc', text: '선선한 밤바람. 골목길을 걸으며 동기들과 오늘 얘기에 낄낄댄다.' },
        { if: s => !drunk(s), t: 'say', who: HW, face: 'hw_laugh', text: s => danced(s) ? `야 오늘 너 ${DANCES[s.dance].word} 진짜 레전드였다 ㅋㅋㅋㅋ` : '야 너 오늘 제일 멀쩡했다 ㅋㅋ 비결이 뭐냐?' },
        { if: s => !drunk(s), t: 'say', who: ME, face: 'me_proud', text: '자기 관리지 뭐. 내일 1교시도 끄떡없다!' },
        { t: 'desc', bg: 'bg_taxi', text: '현우가 잡아 준 택시. 창밖으로 불빛이 길게, 길게 번진다.' },

        // ---- 씬 4 : 블랙아웃 (아직 취해 있으면) ----
        { if: s => s.alc >= 4, t: 'scene', no: 4, title: '블랙아웃', time: '새벽 1:30', bg: 'bg_blackout' },
        { if: s => s.alc >= 4, t: 'desc', text: '가로등 불빛이 핑— 돌기 시작한다.', fx: ['spin'] },
        { if: s => s.alc >= 4, t: 'desc', text: '무거운 눈꺼풀이 스르륵… 친구 목소리가 물속처럼 먹먹해진다.', fx: ['eyes'] },
        { if: s => s.alc >= 4, t: 'desc', text: '삐———', fx: ['black'], auto: 1600 },
        { if: s => s.alc >= 4, t: 'mono', text: '그렇게 내 첫 성인식의 밤은… 어둠 속으로 로그아웃되었다.' },
        { if: s => s.alc < 4, t: 'desc', text: '집 도착. 씻고, 물 한 잔 마시고, 바로 잠들었다.', fx: ['fade'] },

        // ---- 씬 5 : 아침 ----
        { if: s => s.alc >= 4, t: 'scene', no: 5, title: '재앙의 아침', time: '오전 8:30', bg: 'bg_room_sun', fx: ['glare'] },
        { if: s => s.alc >= 4, t: 'desc', text: '창문 틈으로 잔인할 정도로 눈부신 아침 햇살이 정면으로 쏟아진다.' },
        { if: s => s.alc >= 4, t: 'desc', bg: 'bg_room', text: '자취방은 폭탄 맞은 아수라장. 구석엔 친구 둘이 시체처럼 뻗어 드르렁 코를 골고 있다.' },
        { if: s => s.alc >= 4, t: 'say', who: ME, face: 'me_hangover', act: '머리를 감싸 쥐며 바닥을 뒹군다', text: '으으윽… 으아아악… 머리 깨질 것 같아… 물… 물 마려워…', fx: ['shake'] },
        { if: s => s.alc >= 4, t: 'mono', face: 'me_hangover', text: '입안은 사막 모래를 씹은 것처럼 바짝 말라 있었고, 머릿속에서는 포크레인이 뇌를 파내는 것 같았다.' },
        { if: s => s.alc < 4, t: 'scene', no: 5, title: '상쾌한 아침', time: '오전 8:00', bg: 'bg_room_fresh', fx: ['glare'] },
        { if: s => s.alc < 4, t: 'desc', text: '알람이 울리기도 전에 눈이 떠졌다. 머리가 맑다. 새가 운다.' },
        { if: s => s.alc < 4, t: 'say', who: ME, face: 'me_proud', text: '개운하다! 역시 나는 페이스 조절의 신.' },

        // ---- 씬 6 : 단톡방 ----
        { t: 'scene', no: 6, title: s => (danced(s) || s.crash || s.called) ? '공포의 단톡방' : '평화로운 단톡방', time: '오전 8:42', bg: s => danced(s) ? 'bg_phone' : s.alc >= 4 ? 'bg_room' : 'bg_room_fresh' },
        { t: 'desc', text: s => danced(s) ? '떨리는 손으로 액정 깨진 스마트폰을 집어 든다. 카톡 알림 99+.' : '스마트폰을 집어 든다. 카톡 알림이 몇 개 와 있다.', fx: ['phone'] },
        { if: danced, t: 'video', text: s => `어제자 강민수 ${DANCES[s.dance].word}.mp4`, img: s => DANCES[s.dance].frames[DANCES[s.dance].frames.length - 1] },
        { if: danced, t: 'desc', text: s => `재생 ▶ … 영상 속 내가 선배 과잠을 머리에 뒤집어쓴 채 술집 바닥에서 「${DANCES[s.dance].name}」을 추고 있다.` },
        { if: danced, t: 'chat', who: '김준혁', text: 'ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ 강민수 살아있냨ㅋㅋㅋㅋ' },
        { if: s => s.caught, t: 'chat', who: '이동기', text: '어제 민수 소주병 캐치한 거 봤냐 ㅋㅋㅋ 국대 골키퍼냐고' },
        { if: s => s.crash, t: 'chat', who: '이동기', text: '사장님이 민수 이름 외우셨대 ㅋㅋㅋㅋ 레전드다 진짜' },
        { if: s => !danced(s), t: 'video', text: '어제자 신입생 환영회 건배샷.mp4', img: 'dance_toast' },
        { if: s => !danced(s) && !s.crash && !s.caught, t: 'chat', who: '김준혁', text: '어제 민수 젤 멀쩡했음 ㅋㅋ 신기하네' },
        { if: danced, t: 'say', who: ME, face: 'me_shock', act: '얼굴이 서서히 새파랗게 질리며', text: '거짓말… 거짓말이지…? 내가… 내가 저랬다고…?' },
        { if: s => danced(s) || s.crash, t: 'choice', style: 'kakao', q: '단톡방에 뭐라고 보낼까?', def: 1, opts: [
          { label: '제발 지워줘 ㅠㅠㅠ', sub: '⭐ −1', set: { rep: -1 }, then: [{ t: 'chat', who: '김준혁', text: '응 안 돼~ 이미 과 인스타에 올라감 ㅋ' }] },
          { label: 'ㅋㅋ 레전드 인정', sub: '⭐ +2', set: { rep: 2 }, then: [{ t: 'chat', who: '이동기', text: 'ㅋㅋㅋ 이 형 멘탈 뭐임 리스펙' }] },
          { label: '(단톡방을 나간다)', sub: '⭐ −2', set: { rep: -2 }, then: [
            { t: 'chat', who: '', text: '강민수님이 나갔습니다.', sys: true },
            { t: 'chat', who: '', text: '현우님이 강민수님을 초대했습니다.', sys: true },
            { t: 'chat', who: '현우', text: '도망 못 감 ㅋ' },
          ] },
        ] },
        // 첫사랑: 전화를 걸었으면 통화 기록 + 카톡 / 안 걸었으면 프로필 사진 알림
        { if: s => s.called, t: 'call', who: '고등학교 첫사랑', text: '새벽 02:14 · 발신 3회' },
        { if: s => s.called, t: 'say', who: ME, face: 'me_shock', act: '베개에 얼굴을 묻으며', text: '으아아아아악!! 차라리 날 죽여!! 죽여줘 제발!!!', fx: ['shake', 'big'] },
        { if: s => s.called, t: 'kakao', from: '고등학교 첫사랑', text: '어제 새벽에 전화 세 번 한 거 뭐야?' },
        { if: s => s.called, t: 'choice', style: 'kakao', q: '첫사랑에게 답장', def: 1, opts: [
          { label: '사귈래?', then: [
            { if: s => s.rep >= 4, t: 'say', who: CR, face: 'crush_flutter', text: '…술 깨고. 맨정신에 다시 말해 봐.', fx: ['pink'], set: { love: 2 } },
            { if: s => s.rep < 4, t: 'say', who: CR, face: 'crush_angry', text: '…술 깨고 다시 연락해.', fx: ['red'], set: { love: -1 } },
          ] },
          { label: '미안해, 잘못했어', set: { love: 2 }, then: [
            { t: 'say', who: CR, face: 'crush_flutter', text: 'ㅋㅋ 괜찮아. 오랜만에 목소리 들어서 좋았어.', fx: ['pink'] },
          ] },
          { label: '(읽씹한다)', set: { love: -2 }, flag: { ignored: true }, then: [
            { t: 'desc', text: '숫자 1이 사라졌다. 그리고… 아무 일도 일어나지 않았다.', fx: ['cold'] },
            { t: 'say', who: CR, face: 'crush_cold', text: '……' },
          ] },
          { label: '누구세요?', set: { love: -3 }, then: [
            { t: 'say', who: CR, face: 'crush_angry', text: '…차단할게.', fx: ['red', 'shake'] },
          ] },
        ] },
        { if: s => !s.called, t: 'kakao', from: '고등학교 첫사랑', notice: '고등학교 첫사랑님이 프로필 사진을 변경했습니다.', photo: 'crush_profile' },
        { if: s => !s.called, t: 'choice', style: 'kakao', q: '프로필 사진에…', def: 1, opts: [
          { label: '좋아요 ♥ 누른다', set: { love: 1 }, then: [
            { t: 'say', who: CR, face: 'crush_flutter', text: '(어? …민수가 좋아요 눌렀네?)', fx: ['pink'] },
          ] },
          { label: '그냥 넘긴다', then: [{ t: 'mono', face: s => s.alc >= 4 ? 'me_hangover' : 'me_cool', text: '…지금은 1교시가 더 급하다.' }] },
        ] },
        { t: 'fx', fx: ['phoneOff'] },

        // ---- 씬 7 : 1교시 ----
        { t: 'scene', no: 7, title: s => s.alc >= 4 ? '1교시 생존자들의 모임' : '1교시', time: '오전 9:05', bg: 'bg_lecture' },
        { if: s => s.alc >= 4, t: 'desc', text: '대형 계단식 강의실 맨 뒷자리. 모자 푹, 마스크 착용. 차가운 배 음료 캔을 생명줄처럼 쥐고 있다.' },
        { t: 'say', who: HW, face: 'hw_dead', act: '고개도 돌리지 않고 입만 겨우 뻐끔거리며', text: s => s.alc >= 4 ? '…살아는 있냐?' : '…넌 왜 멀쩡하냐?' },
        { if: s => s.alc >= 4, t: 'say', who: ME, face: 'me_hangover', act: '빨대를 문 채 영혼 없는 목소리로', text: '말 걸지 마라… 침 삼켜도 토 나올 것 같다…' },
        { if: s => s.alc < 4, t: 'say', who: ME, face: 'me_proud', text: '자기 관리지, 뭐.' },
        { t: 'say', who: HW, face: 'hw_dead', text: s => (danced(s) || s.crash || s.caught) ? '축하한다… 넌 오늘부로 과의 전설이 됐다…' : '…재수 없어.' },
        { if: s => s.alc >= 4, t: 'say', who: ME, face: 'me_hangover', act: '책상에 이마를 쾅 박으며', text: '자퇴할까… 수능 다시 볼까…', fx: ['shake'] },
        { t: 'say', who: PF, far: true, bg: 'bg_lecture_front', text: '자, 다들 활기찬 대학 생활의 첫 강의입니다! 출석 부르겠습니다!' },
        { t: 'game', g: 'attend' },
        { t: 'mono', text: '세상은 잔인할 정도로 평화로웠고, 나의 스무 살 1학기는 이제 막 시작되고 있었다.' },
        { t: 'report' },
      ],
    },
  };

  // ===================== 저장 (봤는지) =====================
  const seen = id => { try { return localStorage.getItem(KEY + id + '.' + userKey()) === '1'; } catch (_) { return false; } };
  const markSeen = id => { try { localStorage.setItem(KEY + id + '.' + userKey(), '1'); } catch (_) {} };

  // ===================== 그림 =====================
  function loadImg(src, ms = 8000) {
    return new Promise(resolve => {
      const im = new Image(); let done = false;
      const end = ok => { if (!done) { done = true; resolve(ok ? im : null); } };
      setTimeout(() => end(false), ms);
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => end(true));
      im.onerror = () => end(false);
      im.src = src;
    });
  }
  const urlOf = (sc, name) => !name ? '' : name.startsWith('/') ? (/\.(jpe?g|png|webp)$/.test(name) ? name : name + '.webp') : DIR + sc.dir + name + '.webp';
  function imagesOf(sc) {
    const s = new Set();
    const walk = list => (list || []).forEach(st => {
      ['bg', 'face', 'img', 'photo'].forEach(k => { if (typeof st[k] === 'string') s.add(urlOf(sc, st[k])); });
      if (st.t === 'dance' && DANCES[st.key]) DANCES[st.key].frames.forEach(f => s.add(urlOf(sc, f)));
      if (st.left) s.add(urlOf(sc, st.left.face)); if (st.right) s.add(urlOf(sc, st.right.face));
      (st.opts || []).forEach(o => { if (o.img) s.add(urlOf(sc, o.img)); walk(o.then); });
    });
    walk(sc.steps);
    (sc.preload || []).forEach(n => s.add(urlOf(sc, n)));
    const extra = { '007': ['bg_007_target', 'hand_point', 'hand_gun', 'hand_up', 'item_glass'], catch: ['item_bottle'], attend: ['prof_roll'], report: ['bg_report'] };
    const games = new Set(); const scan = list => (list || []).forEach(st => { if (st.t === 'game') games.add(st.g); if (st.t === 'report') games.add('report'); (st.opts || []).forEach(o => scan(o.then)); });
    scan(sc.steps);
    games.forEach(g => (extra[g] || []).forEach(n => s.add(urlOf(sc, n))));
    if (sc === SCRIPTS.ynu1) Object.values(DANCES).forEach(d => d.frames.forEach(f => s.add(urlOf(sc, f))));
    return [...s].filter(Boolean);
  }

  // ===================== 화면 =====================
  function build(sc, canSkip) {
    const root = document.createElement('div');
    root.id = 'cutscene';
    root.innerHTML = `
      <div class="cs-stage">
        <div class="cs-bg a"></div><div class="cs-bg b"></div>
        <div class="cs-tint"></div>
        <div class="cs-phone" hidden><div class="cs-ph-head"><b>🍺 새내기 동기방</b><span>99+</span></div><div class="cs-ph-body"></div></div>
        <div class="cs-call" hidden><span class="ic">📞</span><span class="tx"><b></b><small></small></span></div>
        <div class="cs-eye top"></div><div class="cs-eye bot"></div>
      </div>
      <img class="cs-face" alt="">
      <div class="cs-mood"></div>
      <div class="cs-flash"></div>
      <div class="cs-black"></div>
      <div class="cs-card"><small></small><b></b><span></span></div>
      <div class="cs-box">
        <div class="cs-name"></div>
        <div class="cs-act"></div><div class="cs-line"></div><i class="cs-next">다음 ▶</i>
      </div>
      <div class="cs-layer"></div>
      <div class="cs-top"><span class="cs-title"></span><button type="button" class="cs-auto">▶ 자동</button>${canSkip ? '<button type="button" class="cs-skip">건너뛰기 ⏭</button>' : ''}</div>
      <div class="cs-endcard"><small></small><b></b><span></span></div>
      <div class="cs-load">불러오는 중…</div>`;
    root.querySelector('.cs-title').textContent = '🎬 ' + sc.title;
    document.body.appendChild(root);
    return root;
  }

  let playing = null;
  function play(id) {
    const sc = SCRIPTS[id];
    if (!sc) return Promise.resolve();
    if (playing) return playing;
    playing = run(id, sc).finally(() => { playing = null; });
    return playing;
  }

  async function run(id, sc) {
    const canSkip = seen(id) || isDev();
    const root = build(sc, canSkip);
    const $ = s => root.querySelector(s);
    const layer = $('.cs-layer');
    const bgs = [$('.cs-bg.a'), $('.cs-bg.b')]; let bgi = 0, curBg = '';
    const box = $('.cs-box'), faceEl = $('.cs-face');
    const nameEl = $('.cs-name'), actEl = $('.cs-act'), lineEl = $('.cs-line');
    const card = $('.cs-card'), phone = $('.cs-phone'), phBody = $('.cs-ph-body'), call = $('.cs-call');
    const S = () => StoryState.get();
    const val = v => typeof v === 'function' ? v(S()) : v;

    // ---- 입력: 화면 누르기 / 스페이스·엔터 = 다음, Esc = 건너뛰기 ----
    let skipped = false, auto = false, tapResolve = null, typing = null, keyHook = null;
    const skipHooks = new Set();
    const tap = () => { if (typing) { typing(); return; } if (tapResolve) { const r = tapResolve; tapResolve = null; r(); } };
    const skip = () => {
      if (skipped) return; skipped = true;
      if (typing) typing(); if (tapResolve) { const r = tapResolve; tapResolve = null; r(); }
      [...skipHooks].forEach(f => f()); skipHooks.clear();
    };
    root.addEventListener('scroll', () => { root.scrollTop = 0; root.scrollLeft = 0; });   // 화면이 밀려 올라가지 않게
    root.addEventListener('pointerdown', e => { if (e.target.closest('.cs-top, .cs-layer .cs-ui')) return; tap(); });
    if (canSkip) $('.cs-skip').onclick = skip;
    $('.cs-auto').onclick = () => { auto = !auto; $('.cs-auto').classList.toggle('on', auto); $('.cs-auto').textContent = auto ? '⏸ 자동' : '▶ 자동'; if (auto && !typing) tap(); };
    const onKey = e => {
      if (keyHook && keyHook(e)) { e.preventDefault(); return; }
      if (e.key === 'Escape') { if (canSkip) { e.preventDefault(); skip(); } }
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); tap(); }
    };
    document.addEventListener('keydown', onKey, true);
    const waitTap = autoMs => new Promise(res => {
      if (skipped) return res();
      tapResolve = res;
      const ms = autoMs || (auto ? 1800 : 0);
      if (ms) setTimeout(() => { if (tapResolve === res) { tapResolve = null; res(); } }, ms);
    });
    const pause = ms => skipped ? Promise.resolve() : new Promise(res => { tapResolve = res; setTimeout(() => { if (tapResolve === res) { tapResolve = null; res(); } }, ms); });
    const sleep = ms => skipped ? Promise.resolve() : new Promise(res => { const t = setTimeout(done, ms); function done() { clearTimeout(t); skipHooks.delete(done); res(); } skipHooks.add(done); });
    // 미니게임·선택지: 건너뛰면 기본값으로 끝난다
    const until = (start, fallback) => new Promise(res => {
      if (skipped) return res(fallback);
      let done = false; let stop = () => {};
      const finish = v => { if (done) return; done = true; skipHooks.delete(onSkip); keyHook = null; try { stop(); } catch (_) {} res(v); };
      const onSkip = () => finish(fallback);
      skipHooks.add(onSkip);
      stop = start(finish) || (() => {});
    });

    // ---- 그림 미리 받기 (최대 8초, 실패해도 진행) ----
    root.classList.add('on');
    await Promise.all(imagesOf(sc).map(u => loadImg(u)));
    $('.cs-load').remove();

    const setBg = name => {
      name = val(name);
      if (!name || name === curBg) return;
      curBg = name; const next = bgs[1 - bgi];
      next.style.backgroundImage = `url("${urlOf(sc, name)}")`;
      next.classList.add('show'); bgs[bgi].classList.remove('show'); bgi = 1 - bgi;
    };
    let curFace = '';
    const setFace = f => {
      f = val(f) || '';
      if (f === curFace) { if (f) restart(faceEl, 'bump'); return; }
      curFace = f; faceEl.classList.remove('show');
      if (f) { faceEl.src = urlOf(sc, f); void faceEl.offsetWidth; faceEl.classList.add('show'); }
      box.classList.toggle('has-face', !!f);
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const mood = $('.cs-mood');
    const fx = list => (val(list) || []).forEach(f => {
      if (['shake', 'flash', 'glare', 'slowmo', 'red'].includes(f)) restart(root, 'fx-' + f);
      else if (['silence', 'drunk', 'spin', 'eyes', 'black', 'fade'].includes(f)) root.classList.add('fx-' + f);
      else if (f === 'pink' || f === 'cold') { mood.className = 'cs-mood ' + f; void mood.offsetWidth; mood.classList.add('on'); }
      else if (f === 'phone') { phone.hidden = false; phBody.innerHTML = ''; restart(root, 'fx-buzz'); }
      else if (f === 'phoneOff') { phone.hidden = true; call.hidden = true; }
    });
    const clearScene = () => {
      ['fx-silence', 'fx-drunk', 'fx-spin', 'fx-eyes', 'fx-black', 'fx-fade'].forEach(c => root.classList.remove(c));
      phone.hidden = true; call.hidden = true; mood.className = 'cs-mood'; setFace('');
    };

    const typeText = text => new Promise(res => {
      const chars = [...text]; let i = 0, timer = null;
      const done = () => { clearInterval(timer); typing = null; lineEl.textContent = text; box.classList.add('ready'); res(); };
      typing = done; lineEl.textContent = ''; box.classList.remove('ready');
      if (skipped || reduce()) return done();
      timer = setInterval(() => { i++; lineEl.textContent = chars.slice(0, i).join(''); if (i >= chars.length) done(); }, 32);
    });
    const showBox = st => {
      const kind = st.t;
      box.className = 'cs-box show ' + kind + (st.far ? ' far' : '') + ((val(st.fx) || []).includes('big') ? ' big' : '') + (curFace ? ' has-face' : '');
      nameEl.textContent = kind === 'say' ? val(st.who) : kind === 'mono' ? '나 (독백)' : '';
      nameEl.style.display = nameEl.textContent ? '' : 'none';
      actEl.textContent = st.act ? `(${st.act})` : '';
      actEl.style.display = st.act ? '' : 'none';
    };
    const hideBox = () => box.classList.remove('show');
    const ui = (cls, html) => { const e = document.createElement('div'); e.className = 'cs-ui ' + cls; e.innerHTML = html; layer.appendChild(e); return e; };
    const bigText = async (text, cls = '', ms = 900) => {
      const e = ui('cs-bigtxt ' + cls, `<b>${esc(text)}</b>`); e.style.pointerEvents = 'none';
      await sleep(ms); e.remove();
    };
    const addChat = (st) => {
      phone.hidden = false;
      const el = document.createElement('div');
      if (st.sys) { el.className = 'cs-msg sys'; el.innerHTML = `<span>${esc(val(st.text))}</span>`; }
      else if (st.mine) { el.className = 'cs-msg mine'; el.innerHTML = `<span>${esc(val(st.text))}</span><em>1</em>`; }
      else { el.className = 'cs-msg'; el.innerHTML = `<b>${esc(val(st.who))}</b><span>${esc(val(st.text))}</span>`; }
      phBody.appendChild(el); phBody.scrollTop = phBody.scrollHeight;
      restart(root, 'fx-buzz');
      return el;
    };

    // ===================== 선택지 =====================
    function choose(st) {
      const opts = st.opts.filter(o => !o.if || o.if(S()));
      const def = Math.min(st.def || 0, opts.length - 1);
      return until(finish => {
        hideBox();
        const style = st.style || 'list';
        let html;
        if (style === 'dance') {
          html = `<div class="cs-q">${esc(st.q)}</div><div class="cs-dcards">${opts.map((o, i) => `<button type="button" class="cs-dcard${o.img ? '' : ' none'}" data-i="${i}" style="animation-delay:${i * 0.08}s">${o.img ? `<img src="${urlOf(sc, o.img)}" alt="">` : '<i>👏</i>'}<b>${i + 1}. ${esc(o.label)}</b></button>`).join('')}</div>`;
        } else {
          html = `<div class="cs-q">${esc(st.q)}</div><div class="cs-opts">${opts.map((o, i) => `<button type="button" class="cs-opt" data-i="${i}" style="animation-delay:${i * 0.07}s"><span class="n">${i + 1}</span><span class="l">${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
        }
        const panel = ui('cs-choice ' + style, html);
        const pick = i => { if (!opts[i]) return; panel.querySelectorAll('button').forEach(b => b.disabled = true); panel.querySelector(`[data-i="${i}"]`).classList.add('picked'); setTimeout(() => finish(opts[i]), 380); };
        panel.querySelectorAll('button').forEach(b => b.onclick = () => pick(+b.dataset.i));
        keyHook = e => { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) { pick(n - 1); return true; } return e.key === ' ' || e.key === 'Enter'; };
        return () => panel.remove();
      }, opts[def]);
    }

    // ===================== 미니게임 =====================
    const GAMES = {};
    // 007빵: 공 → 공 → 칠 → 빵. 내 차례면 다음 말을, 옆 사람이 「빵」 맞으면 「으악」. 밧줄이 다 타면 벌주
    GAMES['007'] = async st => {
      if (st.bg) setBg(st.bg);
      hideBox(); setFace('');
      const WORDS = ['공', '공', '칠', '빵'];
      const NAMES = ['현우', '준혁', '동기', '선배'];
      const BTN = [{ k: '공', img: 'hand_point', txt: '공!' }, { k: '칠', img: 'hand_point', txt: '칠!' }, { k: '빵', img: 'hand_gun', txt: '빵!' }, { k: '으악', img: 'hand_up', txt: '으악!' }];
      let miss = 0, combo = 0;
      for (let r = 0; r < (st.rounds || 5); r++) {
        if (skipped) break;
        const alc = S().alc;
        const neighbor = Math.random() < 0.28;
        const pos = neighbor ? 3 : Math.floor(Math.random() * 3);   // 0~2: 앞 사람이 WORDS[pos] 를 말하고 나를 가리킴
        const who = NAMES[Math.floor(Math.random() * NAMES.length)];
        const chain = neighbor ? WORDS : WORDS.slice(0, pos + 1);
        const answer = neighbor ? '으악' : WORDS[pos + 1];
        const prompt = neighbor ? `${who}: 「빵!」 → <u>내 옆 사람</u>을 쐈다!` : `${who}: 「${WORDS[pos]}!」 → <u>나</u>를 가리켰다!`;
        const ms = Math.max(1300, 2800 - alc * 170);
        const res = await until(finish => {
          const p = ui('cs-g007', `
            <div class="g-head"><span>ROUND ${r + 1}/${st.rounds || 5}</span><span class="g-miss">벌주 ${'🍺'.repeat(miss) || '0'}</span></div>
            <div class="g-chain">${chain.map((w, i) => `<i style="animation-delay:${i * 0.06}s">${w}</i>`).join('<em>→</em>')}${neighbor ? '' : '<em>→</em><i class="q">?</i>'}</div>
            <div class="g-prompt">${prompt}</div>
            <div class="g-rope"><i style="animation-duration:${ms}ms"></i></div>
            <div class="g-btns">${BTN.map((b, i) => `<button type="button" data-k="${b.k}"><img src="${urlOf(sc, b.img)}" alt=""${b.k === '칠' ? ' class="flip"' : ''}><b>${i + 1}. ${b.txt}</b></button>`).join('')}</div>`);
          const t = setTimeout(() => finish('timeout'), ms);
          p.querySelectorAll('button').forEach(b => b.onclick = () => finish(b.dataset.k));
          keyHook = e => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 4) { finish(BTN[n - 1].k); return true; } return false; };
          return () => { clearTimeout(t); p.remove(); };
        }, answer);
        if (skipped) break;
        if (res === answer) {
          combo++; restart(root, 'fx-flash');
          await bigText(combo >= 2 ? `콤보 ×${combo}!` : '정답!', 'good', 650);
        } else {
          miss++; combo = 0; restart(root, 'fx-shake'); restart(root, 'fx-red');
          const g = ui('cs-shot', `<img src="${urlOf(sc, 'item_glass')}" alt="">`); g.style.pointerEvents = 'none';
          await bigText(res === 'timeout' ? '시간 초과! 벌주!' : `「${res}」 아니고 「${answer}」! 벌주!`, 'bad', 1100);
          g.remove();
          StoryState.apply({ alc: 1 });
        }
      }
      if (!skipped) { await bigText(miss ? `벌주 ${miss}잔…` : '무벌주 클리어!!', miss ? 'bad' : 'good', 1200); }
      StoryState.apply({}, { g007miss: miss }, true);
      if (!miss) StoryState.apply({ rep: 1 });
    };

    // 소주병 잡기: 위기! → 병이 흔들리며 떨어진다 → 3·2·1 안에 병을 눌러라. 취할수록 더 흔들리고, 6 이상이면 두 개로 보인다
    GAMES.catch = async () => {
      hideBox(); setFace('');
      root.classList.add('fx-silence'); restart(root, 'fx-slowmo');
      await bigText('위기!!', 'bad warn', 900);
      const alc = S().alc;
      const caught = await until(finish => {
        const sway = 8 + Math.min(alc, 8) * 2.2;   // vw
        const ghost = alc >= 6;
        const p = ui('cs-gcatch', `
          <div class="g-count"><b>3</b></div>
          <div class="g-hint">떨어지는 소주병을 눌러서 잡아라!</div>
          ${ghost ? `<div class="g-bottle ghost"><img src="${urlOf(sc, 'item_bottle')}" alt=""></div>` : ''}
          <div class="g-bottle real"><img src="${urlOf(sc, 'item_bottle')}" alt=""></div>
          <div class="g-floor"></div>`);
        const real = p.querySelector('.g-bottle.real'), gh = p.querySelector('.g-bottle.ghost'), cnt = p.querySelector('.g-count b');
        const T = 3000, t0 = performance.now(); let raf = 0, ended = false;
        const phase = Math.random() * Math.PI * 2, speed = 2.2 + alc * 0.25;
        const tick = now => {
          const k = Math.min(1, (now - t0) / T);
          const x = Math.sin(phase + k * Math.PI * 2 * speed) * sway;
          const y = 4 + k * 62;   // vh
          const rot = Math.sin(phase + k * 9) * 35 + k * 140;
          real.style.transform = `translate(calc(-50% + ${x}vw), ${y}vh) rotate(${rot}deg)`;
          if (gh) gh.style.transform = `translate(calc(-50% + ${-x * 0.8 + 6}vw), ${y + 2}vh) rotate(${-rot}deg)`;
          const left = Math.ceil((1 - k) * 3);
          if (cnt.textContent !== String(left) && left > 0) { cnt.textContent = left; restart(cnt, 'pop'); restart(root, 'fx-shake'); }
          if (k >= 1) { ended = true; finish(false); return; }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        real.onpointerdown = e => { e.stopPropagation(); if (!ended) { ended = true; real.classList.add('got'); finish(true); } };
        if (gh) gh.onpointerdown = e => { e.stopPropagation(); if (!ended) { ended = true; gh.classList.add('miss'); finish(false); } };
        p.onpointerdown = e => { if (e.target === p) { /* 허공을 누르면 그냥 헛손질 */ restart(p, 'whiff'); } };
        return () => { cancelAnimationFrame(raf); setTimeout(() => p.remove(), 350); };
      }, false);
      root.classList.remove('fx-silence');
      if (!skipped) {
        if (caught) { restart(root, 'fx-flash'); await bigText('나이스 캐치!!', 'good gold', 1300); }
        else await bigText('놓쳤다…', 'bad', 800);
      }
      StoryState.apply(caught ? { rep: 2 } : {}, { caught: !!caught });
    };

    // 출석: 「강민우!」(함정) → 「강민수!」 에서 1초 안에 [네!]
    GAMES.attend = async () => {
      hideBox(); setFace('prof_roll');
      const s0 = S(), win = Math.max(900, 1700 - s0.alc * 120);
      const calls = [{ n: '김준혁!', me: false, ans: '네~' }, { n: '강민우!', me: false, ans: '(…민우 씨?)' }, { n: '강민수!', me: true }];
      let result = 'absent', wrongName = false;
      for (const c of calls) {
        if (skipped) break;
        const r = await until(finish => {
          const p = ui('cs-gattend', `<div class="g-call">${esc(c.n)}</div>${c.me ? `<div class="g-rope"><i style="animation-duration:${win}ms"></i></div>` : ''}<button type="button" class="g-yes">네!</button><div class="g-tip">내 이름이 불리면 [네!] (스페이스)</div>`);
          restart(p.querySelector('.g-call'), 'pop');
          const t = setTimeout(() => finish(c.me ? 'late' : 'pass'), c.me ? win : 1300);
          p.querySelector('.g-yes').onclick = () => finish('yes');
          keyHook = e => { if (e.key === ' ' || e.key === 'Enter') { finish('yes'); return true; } return false; };
          return () => { clearTimeout(t); p.remove(); };
        }, c.me ? 'yes' : 'pass');
        if (skipped) break;
        if (!c.me) {
          if (r === 'yes') { wrongName = true; await bigText('…네? 저 민수인데요', 'bad', 1100); StoryState.apply({ rep: -1 }); }
          else await bigText(c.ans, 'soft', 600);
          continue;
        }
        result = r === 'yes' ? (wrongName ? 'wrong' : 'present') : 'absent';
      }
      if (skipped && result === 'absent') result = 'present';   // 건너뛰면 출석으로
      if (!skipped) {
        const stamp = ui('cs-stamp ' + (result === 'absent' ? 'no' : 'ok'), `<b>${result === 'absent' ? '결석' : '출석'}</b>`);
        stamp.style.pointerEvents = 'none'; restart(root, 'fx-shake');
        await sleep(1300); stamp.remove();
      }
      StoryState.apply({ grade: result === 'absent' ? -1 : 1 }, { attend: result });
      setFace('');
    };

    // 수능 문제: 밧줄 타이머 안에 고르기. [모르겠다, 3번] 은 3번으로 찍는다
    GAMES.quiz = async st => {
      hideBox(); setFace('');
      const s0 = S(), ms = Math.max(9000, 15000 + s0.cond * 2000);
      const pickN = await until(finish => {
        const p = ui('cs-gquiz', `
          <div class="g-paper">
            <div class="g-subj"><b>${esc(st.subj)}</b> 영역 · ${st.no}번</div>
            <div class="g-q">${esc(st.q).replace(/\n/g, '<br>')}</div>
            ${st.passage ? `<div class="g-pass">${esc(st.passage).replace(/\n/g, '<br>')}</div>` : ''}
            <div class="g-opts">${st.opts.map((o, i) => `<button type="button" data-i="${i}"><span>${'①②③④⑤'[i]}</span>${esc(o)}</button>`).join('')}</div>
            <div class="g-rope"><i style="animation-duration:${ms}ms"></i></div>
            <button type="button" class="g-guess" data-i="2">🎲 모르겠다… 3번으로 찍는다</button>
          </div>`);
        const t = setTimeout(() => finish(-1), ms);
        p.querySelectorAll('button').forEach(b => b.onclick = () => { b.classList.add('marked'); setTimeout(() => finish(+b.dataset.i), 250); });
        keyHook = e => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 5) { finish(n - 1); return true; } return false; };
        return () => { clearTimeout(t); p.remove(); };
      }, 2);
      const ok = pickN === st.ans;
      if (!skipped) await bigText(pickN < 0 ? '시간 초과…' : ok ? '확신의 정답! (아마도)' : '…찜찜하다', ok ? 'good' : 'bad', 900);
      StoryState.apply(ok ? { score: 1 } : {});
    };

    // 연타: 정해진 시간 안에 화면(또는 스페이스)을 need 번
    GAMES.mash = async st => {
      hideBox();
      const ok = await until(finish => {
        let n = 0;
        const p = ui('cs-gmash', `<div class="g-lbl">${esc(st.label || '연타!')}</div><div class="g-bar"><i></i></div><button type="button" class="g-hit">연타!!</button><div class="g-rope"><i style="animation-duration:${st.ms}ms"></i></div>`);
        const bar = p.querySelector('.g-bar i');
        const hit = () => { n++; bar.style.width = Math.min(100, n / st.need * 100) + '%'; restart(p.querySelector('.g-hit'), 'pop'); if (n >= st.need) finish(true); };
        p.querySelector('.g-hit').onpointerdown = e => { e.preventDefault(); hit(); };
        keyHook = e => { if (e.key === ' ' || e.key === 'Enter') { if (!e.repeat) hit(); return true; } return false; };
        const t = setTimeout(() => finish(false), st.ms);
        return () => { clearTimeout(t); p.remove(); };
      }, true);
      if (!skipped) await bigText(ok ? '휴… 다 고쳤다!' : '종이 울렸다…', ok ? 'good' : 'bad', 1000);
      if (!ok) StoryState.apply({ score: -1 });
    };

    // ===================== 연출 단계 =====================
    async function vs(st) {
      hideBox(); setFace('');
      const w = ui('cs-vs', `
        <div class="side l"><img src="${urlOf(sc, st.left.face)}" alt=""><b>${esc(st.left.name)}</b><small>${esc(st.left.sub || '')}</small></div>
        <div class="side r"><img src="${urlOf(sc, st.right.face)}" alt=""><b>${esc(st.right.name)}</b><small>${esc(st.right.sub || '')}</small></div>
        <div class="vs">VS</div>
        <div class="ttl"><b>${esc(st.title)}</b><span>${esc(st.sub || '')}</span></div>`);
      w.style.pointerEvents = 'none';
      await pause(2400); w.classList.add('out'); await sleep(400); w.remove();
    }
    async function dance(st) {
      const d = DANCES[st.key]; if (!d || skipped) return;
      hideBox(); setFace('');
      const w = ui('cs-dance', `<div class="spot"></div><div class="frame">${d.frames.map((f, i) => `<img src="${urlOf(sc, f)}" alt="" class="${i ? '' : 'on'}">`).join('')}</div><div class="crowd"><i>와아아!</i><i>미쳤다!!</i><i>ㅋㅋㅋㅋ</i></div><b class="nm">${esc(d.name)}!!</b>`);
      w.style.pointerEvents = 'none';
      const imgs = [...w.querySelectorAll('.frame img')];
      // 순서: 준비 동작 → 춤 컷들 → (마지막 두 컷을 한 번 더 번갈아) — 플립북처럼
      const seq = [...imgs.keys()].slice(1).concat(imgs.length > 2 ? [imgs.length - 2, imgs.length - 1] : [imgs.length - 1]);
      for (const i of seq) {
        if (skipped) break;
        await sleep(i === 1 ? 700 : 850);
        imgs.forEach(im => im.classList.remove('on')); imgs[i].classList.add('on');
        restart(root, 'fx-shake'); restart(root, 'fx-flash');
      }
      await pause(1200); w.remove();
    }
    async function ring(st) {
      hideBox(); setFace(''); if (st.bg) setBg(st.bg);
      const w = ui('cs-ring', `<div class="rg-name">📞 ${esc(st.name)}</div><div class="rg-txt">뚜르르…</div><div class="rg-cnt"></div>`);
      w.style.pointerEvents = 'none';
      for (let i = 1; i <= (st.times || 3) && !skipped; i++) {
        w.querySelector('.rg-cnt').textContent = `발신 ${i}회`;
        restart(w, 'buzz'); restart(root, 'fx-buzz'); await sleep(1100);
        w.querySelector('.rg-txt').textContent = '연결이 되지 않아…'; await sleep(700);
        w.querySelector('.rg-txt').textContent = '뚜르르…';
        root.style.setProperty('--tilt', (i * 1.5) + 'deg');
      }
      root.style.removeProperty('--tilt'); w.remove();
    }
    async function kakao(st) {
      hideBox(); setFace(''); phone.hidden = false;
      if (st.notice) {
        const el = document.createElement('div'); el.className = 'cs-msg notice';
        el.innerHTML = `<img src="${urlOf(sc, st.photo)}" alt=""><span>${esc(st.notice)}</span>`;
        phBody.appendChild(el); phBody.scrollTop = phBody.scrollHeight; restart(root, 'fx-buzz');
        await waitTap(st.auto || (auto ? 1600 : 0)); return;
      }
      const dots = document.createElement('div'); dots.className = 'cs-msg typing'; dots.innerHTML = `<b>${esc(st.from)}</b><span><i></i><i></i><i></i></span>`;
      phBody.appendChild(dots); phBody.scrollTop = phBody.scrollHeight;
      await sleep(1100); dots.remove();
      const el = addChat({ who: st.from, text: st.text }); el.classList.add('crush');
      await waitTap(st.auto || (auto ? 1600 : 0));
    }
    async function report() {
      hideBox(); setFace(''); setBg('bg_report'); root.classList.remove('fx-fade', 'fx-black');
      const s = S(), d = DANCES[s.dance];
      const nick = s.called ? '새벽 3회 발신남' : s.caught ? '소주병 캐치의 신' : d ? `${d.word} 강민수` : s.crash ? '와장창 강민수' : s.cider ? '사이다 위장술사' : '모범 새내기';
      const tier = v => v >= 5 ? 'S' : v >= 3 ? 'A' : v >= 1 ? 'B' : 'C';
      const love = s.love >= 3 ? '♥♥♥ 썸 시작?!' : s.love >= 1 ? '♥ 좋은 예감' : s.love === 0 ? '- 아직 모름' : s.love >= -2 ? '💔 멀어짐' : '🚫 차단됨';
      const sn = { S: '장학생 입학', A: '정시 합격', B: '추가합격 막차' }[snGrade(s)];
      const alc = s.alc >= 6 ? '만취 (전설)' : s.alc >= 4 ? '취함' : s.alc >= 2 ? '알딸딸' : '멀쩡';
      const att = { present: '출석 ✔', absent: '결석 ✘', wrong: '출석 (민망)' }[s.attend] || '-';
      const rows = [['수능', sn], ['별명', nick], ['어젯밤', alc], ['평판', tier(s.rep)], ['첫사랑', love], ['1교시', att]];
      const w = ui('cs-report', `<div class="rp-paper"><h3>📋 1학년 1학기 생활기록부</h3>${rows.map(([k, v], i) => `<div class="rp-row" style="animation-delay:${0.3 + i * 0.35}s"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
        <div class="rp-stamp" style="animation-delay:${0.5 + rows.length * 0.35}s">${tier(s.rep + s.grade + Math.max(0, s.love))}</div>
        <p class="rp-foot">이 선택들은 2학년 이야기로 이어집니다…</p></div>`);
      w.style.pointerEvents = 'none';
      setTimeout(() => restart(root, 'fx-shake'), (0.5 + rows.length * 0.35) * 1000 + 250);
      await pause(4200); await waitTap(); w.remove();
    }

    // ===================== 실행기 =====================
    async function step(st) {
      if (st.t === 'scene') {
        clearScene(); hideBox();
        setBg(st.bg); fx(st.fx);
        card.querySelector('small').textContent = st.kicker || `SCENE ${st.no}`;
        card.querySelector('b').textContent = val(st.title);
        card.querySelector('span').textContent = st.time || '';
        if (skipped) return;
        restart(card, 'show'); await pause(1900); card.classList.remove('show');
        return;
      }
      if (st.bg) setBg(st.bg);
      if (!['say', 'mono', 'desc'].includes(st.t) && st.fx) fx(st.fx);
      if (st.set || st.flag) { if (!['choice'].includes(st.t)) StoryState.apply(st.set, st.flag, skipped); }
      switch (st.t) {
        case 'fx': return;
        case 'set': return;
        case 'calc': StoryState.apply({}, st.fn(S()), true); return;
        case 'choice': {
          const o = await choose(st);
          if (!o) return;
          StoryState.apply(o.set, o.flag, skipped);
          if (st.style === 'kakao' && !skipped) {
            if (o.label.startsWith('(')) phBody.querySelectorAll('.cs-msg.crush').forEach(m => m.classList.add('read'));   // 읽씹 · 나가기: 보내는 말 없음
            else { addChat({ mine: true, text: o.label }); await sleep(500); }
          }
          await exec(o.then || []);
          return;
        }
        case 'game': if (GAMES[st.g]) await GAMES[st.g](st); return;
        case 'vs': if (!skipped) await vs(st); return;
        case 'big': if (!skipped) { hideBox(); const b = ui('cs-bigcard', `<small>${esc(st.kicker || '')}</small><b>${esc(st.text)}</b><span>${esc(st.sub || '')}</span>`); b.style.pointerEvents = 'none'; await pause(2300); b.remove(); } return;
        case 'dance': await dance(st); return;
        case 'ring': if (!skipped) await ring(st); return;
        case 'kakao': if (!skipped) await kakao(st); return;
        case 'report': if (!skipped) await report(); return;
        case 'video': case 'chat': {
          if (skipped) return;
          phone.hidden = false; hideBox(); setFace('');
          if (st.t === 'video') {
            const el = document.createElement('div'); el.className = 'cs-msg video';
            const img = val(st.img);
            el.innerHTML = `${img ? `<img src="${urlOf(sc, img)}" alt="">` : ''}<span class="play">▶</span><span class="nm">[${esc(val(st.text))}]</span>`;
            phBody.appendChild(el); phBody.scrollTop = phBody.scrollHeight; restart(root, 'fx-buzz');
          } else addChat(st);
          await waitTap(st.auto || (auto ? 1400 : 0));
          return;
        }
        case 'call': {
          if (skipped) return;
          call.hidden = false; hideBox(); setFace('');
          call.querySelector('b').textContent = st.who;
          call.querySelector('small').textContent = '통화 기록 · ' + st.text;
          restart(call, 'drop'); restart(root, 'fx-buzz');
          await waitTap(st.auto || (auto ? 1600 : 0));
          return;
        }
      }
      // 대사 · 독백 · 지문
      if (skipped) return;
      fx(st.fx);
      setFace(st.face);
      showBox(st);
      await typeText(val(st.text));
      await waitTap(st.auto);
    }
    async function exec(steps) {
      for (const st of steps) {
        if (st.if && !st.if(S())) continue;
        await step(st);
      }
    }

    await exec(sc.steps);
    if (!skipped && sc.end) {
      root.classList.add('fx-fade'); hideBox(); setFace('');
      await pause(900);
      const ec = $('.cs-endcard');
      ec.querySelector('small').textContent = sc.end.kicker; ec.querySelector('b').textContent = sc.end.title; ec.querySelector('span').textContent = sc.end.sub;
      ec.classList.add('show');
      await pause(2600);
    }
    markSeen(id);
    document.removeEventListener('keydown', onKey, true);
    root.classList.add('out');
    await wait(500);
    root.remove();
  }

  window.Cutscene = { play, seen, has: id => !!SCRIPTS[id], SCRIPTS, DANCES };
})();
