// cutscene.js — v148 컷신 (비주얼 노벨식 장면 연출)
//   Cutscene.play(id)  → Promise. 끝나거나 건너뛰면 resolve. 그림을 못 받아도 글자만으로 진행한다
//   Cutscene.seen(id)  → 이 계정(이 기기)에서 이미 봤는지 (localStorage)
//   Cutscene.has(id)   → 그런 컷신이 있는지
//
//   지금 있는 컷신: 'ynu1' — 영남대 입학 · 1학년 들어가기 전 (포차 → 골목 → 블랙아웃 → 아침 → 단톡방 → 1교시)
//     ui.js 의 startBoss 가 1학년 보스(id 'ynu_1')에 처음 도전할 때 한 번 틀어 준다. 모험 화면의 [🎬 1학년 입학 컷신] 으로 다시 보기
//
//   대본 한 줄(step) 모양
//     {t:'scene', no, title, time, bg}            장면 제목 카드 + 배경 바꾸기 (잠깐 보였다가 자동으로 넘어감)
//     {t:'say', who, face, act, text}             대사 (face = 얼굴 그림 이름, act = 지문 한 줄)
//     {t:'mono', face, text}                      독백 (나의 속마음, 기울임)
//     {t:'desc', text}                            지문 (화면 가운데 아래 자막)
//     {t:'chat', who, text} / {t:'video'} / {t:'call'}   단톡방 화면 (씬 6)
//     공통: bg(배경 바꾸기) · fx(['shake','flash','glare','slowmo','silence','spin','eyes','black','drunk','phone','phoneOff','fade']) · auto(ms 뒤 자동 진행)
(() => {
  'use strict';
  const DIR = '/images/cutscene/';
  const KEY = 'cardDuel.cut.';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ===================== 대본 =====================
  const ME = '나', HW = '현우', SB = '선배';
  const SCRIPTS = {
    ynu1: {
      dir: 'ynu1/',
      title: '영남대 입학 · 1학년',
      end: { kicker: '영남대 입학', title: '1학년', sub: '눈물겨운 스무 살 1학기, 시작' },
      steps: [
        // ---- 씬 1 : 왁자지껄한 포차 ----
        { t: 'scene', no: 1, title: '왁자지껄한 포차', time: '오후 8:30', bg: 'bg_toast' },
        { t: 'desc', text: '시끌벅적한 대학가 포차. 과잠 입은 동기들이 깡통 테이블에 다닥다닥 끼어 앉아 있다.' },
        { t: 'desc', text: '쨍— 일제히 잔이 가운데로 모인다!', fx: ['flash'] },
        { t: 'say', who: SB, face: 'sb_smile', text: '자, 다들 입학 축하하고! 1학년들 오늘 무리하지 마라. 천천히 마셔~' },
        { t: 'say', who: HW, face: 'hw_hype', act: '신나서 안경을 치켜올리며', text: '선배님! 오늘 저희 1학년들 체력 완전 좋습니다! 끝까지 달릴 수 있습니다!' },
        { t: 'say', who: ME, face: 'me_cool', act: '소주잔을 단숨에 털어 넣고 세상 쿨한 척', text: '에이 선배님, 소주 쓰다고 누가 그래요? 완전 물맛인데? 그냥 달달한데요?' },
        { t: 'mono', face: 'me_cool', text: '스무 살 3월, 세상에 무서울 게 없던 시절. 내 주량이 소주 반 병이라는 슬픈 진실을 알기엔 내 패기가 너무 거대했다.' },

        // ---- 씬 2 : 지옥의 술게임과 대형 사고 ----
        { t: 'scene', no: 2, title: '지옥의 술게임과 대형 사고', time: '오후 10:45', bg: 'bg_toast', fx: ['drunk'] },
        { t: 'desc', text: '쓰러진 빈 소주병들. 잔 부딪치는 소리와 함성. 내 얼굴은 이미 목덜미까지 시뻘겋다.' },
        { t: 'desc', text: '또 걸렸다. 벌주를 들이켜고 잔을 쾅!', fx: ['shake'] },
        { t: 'say', who: ME, face: 'me_drunk', act: '풀린 혀로 크게 웃으며', text: '아~ 마시면서 배우는 랜덤게임! 선배님! 이번엔 제가 한 잔 채워드리겠습니다아!' },
        { t: 'say', who: HW, face: 'hw_panic', act: '사색이 되어 내 팔을 다급하게 붙잡으며', text: '야, 야! 강민수 너 지금 물통에 소주 따르고 있어! 그만 마셔, 제발!' },
        { t: 'say', who: ME, face: 'me_drunk', act: '자신만만하게 손을 훠이훠이 내저으며', text: '아이 괜찮아~ 나 하나도 안 취했… 으악!', fx: ['shake'] },
        { t: 'desc', text: '휘청— 팔꿈치가 테이블 모서리를 강하게 친다.', bg: 'bg_crash1', fx: ['slowmo'] },
        { t: 'desc', text: '와장창——!!', bg: 'bg_crash2', fx: ['flash', 'shake', 'big'] },
        { t: 'desc', text: '순간, 술집 안의 웅성거림이 뚝 끊긴다. 모든 시선이 이쪽으로 쏠린다.', face: 'sb_panic', fx: ['silence'] },
        { t: 'mono', face: 'me_drunk', text: '쨍그랑 소리와 함께… 내 마지막 이성의 끈도 산산조각 났다.' },

        // ---- 씬 3 : 심야의 골목길 ----
        { t: 'scene', no: 3, title: '심야의 골목길', time: '새벽 1:10', bg: 'bg_pole', fx: ['drunk'] },
        { t: 'desc', text: '차가운 밤바람. 나는 전봇대에 이마를 박고, 한 손으로 기둥을 필사적으로 붙잡고 있다.' },
        { t: 'say', who: ME, face: 'me_cry', act: '전봇대를 부둥켜안고 울먹거리며', text: '야… 전봇대야… 넌 왜 맨날 여기 서 있냐…? 다리 안 아프냐…? 인생 진짜 춥다, 그치…?' },
        { t: 'say', who: HW, face: 'hw_sigh', act: '깊은 한숨을 쉬며 다가와 등짝을 찰싹', text: '민수야, 제발 부탁인데 전봇대한테 말 걸지 마. 너 지금 사람 지나갈 때마다 통곡하고 있거든?', fx: ['shake'] },
        { t: 'desc', text: '현우가 빨대 꽂힌 차가운 초코우유를 내 눈앞에 쑥 내민다.', bg: 'bg_choco' },
        { t: 'say', who: HW, face: 'hw_sigh', text: '자, 이거 마시고 제발 정신 차려라. 택시 잡았으니까 타고 집에 가자, 응?' },
        { t: 'say', who: ME, face: 'me_cry', act: '초코우유를 멍하니 바라보다가', text: '현우야… 흑… 너밖에 없다… 나 평생 너한테 충성한다…' },

        // ---- 씬 4 : 블랙아웃 ----
        { t: 'scene', no: 4, title: '블랙아웃', time: '새벽 1:30', bg: 'bg_blackout' },
        { t: 'desc', text: '가로등 불빛이 핑— 돌기 시작한다.', fx: ['spin'] },
        { t: 'desc', text: '무거운 눈꺼풀이 스르륵… 친구 목소리가 물속처럼 먹먹해진다.', fx: ['eyes'] },
        { t: 'desc', text: '삐———', fx: ['black'], auto: 1600 },
        { t: 'mono', text: '그렇게 내 첫 성인식의 밤은… 어둠 속으로 로그아웃되었다.' },

        // ---- 씬 5 : 재앙의 아침 ----
        { t: 'scene', no: 5, title: '재앙의 아침', time: '오전 8:30', bg: 'bg_room_sun', fx: ['glare'] },
        { t: 'desc', text: '창문 틈으로 잔인할 정도로 눈부신 아침 햇살이 정면으로 쏟아진다.' },
        { t: 'desc', text: '자취방은 폭탄 맞은 아수라장. 구석엔 친구 둘이 시체처럼 뻗어 드르렁 코를 골고 있다.', bg: 'bg_room' },
        { t: 'say', who: ME, face: 'me_hangover', act: '머리를 감싸 쥐며 바닥을 뒹군다', text: '으으윽… 으아아악… 머리 깨질 것 같아… 물… 물 마려워…', fx: ['shake'] },
        { t: 'mono', face: 'me_hangover', text: '입안은 사막 모래를 씹은 것처럼 바짝 말라 있었고, 머릿속에서는 포크레인이 뇌를 파내는 것 같았다. 여기가 대체 누구 집이지?' },

        // ---- 씬 6 : 공포의 단톡방 ----
        { t: 'scene', no: 6, title: '공포의 단톡방', time: '오전 8:42', bg: 'bg_phone' },
        { t: 'desc', text: '떨리는 손으로 액정 깨진 스마트폰을 집어 든다. 카톡 알림 99+.', fx: ['phone'] },
        { t: 'video', text: '어제자 강민수 쇼타임.mp4' },
        { t: 'desc', text: '재생 ▶ … 영상 속 내가 선배 과잠을 머리에 뒤집어쓴 채 술집 바닥에서 격렬하게 브레이크 댄스를 추고 있다.' },
        { t: 'chat', who: '김준혁', text: 'ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ 강민수 살아있냨ㅋㅋㅋㅋ' },
        { t: 'chat', who: '이동기', text: '야 얘 오늘 1교시 어떡햌ㅋㅋㅋㅋ 레전드다 진짜' },
        { t: 'say', who: ME, face: 'me_shock', act: '얼굴이 서서히 새파랗게 질리며', text: '거짓말… 거짓말이지…? 내가… 내가 저랬다고…?' },
        { t: 'call', who: '고등학교 첫사랑', text: '새벽 02:14 · 발신 3회' },
        { t: 'say', who: ME, face: 'me_shock', act: '스마트폰을 떨어뜨리고 베개에 얼굴을 묻으며', text: '으아아아아악!! 차라리 날 죽여!! 죽여줘 제발!!!', fx: ['shake', 'phoneOff', 'big'] },

        // ---- 씬 7 : 1교시 생존자들의 모임 ----
        { t: 'scene', no: 7, title: '1교시 생존자들의 모임', time: '오전 9:05', bg: 'bg_lecture' },
        { t: 'desc', text: '대형 계단식 강의실 맨 뒷자리. 모자 푹, 마스크 착용. 차가운 배 음료 캔을 생명줄처럼 쥐고 있다.' },
        { t: 'say', who: HW, face: 'hw_dead', act: '고개도 돌리지 않고 입만 겨우 뻐끔거리며', text: '…살아는 있냐?' },
        { t: 'say', who: ME, face: 'me_hangover', act: '빨대를 문 채 영혼 없는 목소리로', text: '말 걸지 마라… 침 삼켜도 토 나올 것 같다…' },
        { t: 'say', who: HW, face: 'hw_dead', text: '축하한다… 넌 오늘부로 과의 전설이 됐다…' },
        { t: 'say', who: ME, face: 'me_hangover', act: '책상에 이마를 쾅 박으며', text: '자퇴할까… 수능 다시 볼까…', fx: ['shake'] },
        { t: 'say', who: '교수님', far: true, text: '자, 다들 활기찬 대학 생활의 첫 강의입니다! 출석 부르겠습니다!' },
        { t: 'mono', text: '세상은 잔인할 정도로 평화로웠고, 나의 눈물겨운 스무 살 1학기는 이제 막 시작되고 있었다.', fx: ['fade'] },
      ],
    },
  };

  // ===================== 저장 (봤는지) =====================
  const userKey = () => { const u = window.CURRENT_USER; return u && (u.username || u.id) ? String(u.username || u.id) : 'guest'; };
  const seen = id => { try { return localStorage.getItem(KEY + id + '.' + userKey()) === '1'; } catch (_) { return false; } };
  const markSeen = id => { try { localStorage.setItem(KEY + id + '.' + userKey(), '1'); } catch (_) {} };

  // ===================== 그림 받기 =====================
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
  function imagesOf(sc) {
    const s = new Set();
    sc.steps.forEach(st => { if (st.bg) s.add(st.bg); if (st.face) s.add(st.face); });
    return [...s].map(n => DIR + sc.dir + n + '.webp');
  }

  // ===================== 화면 =====================
  function build(sc) {
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
      <div class="cs-flash"></div>
      <div class="cs-black"></div>
      <div class="cs-card"><small></small><b></b><span></span></div>
      <div class="cs-box">
        <div class="cs-face"><img alt=""></div>
        <div class="cs-text"><div class="cs-name"></div><div class="cs-act"></div><div class="cs-line"></div><i class="cs-next">▼</i></div>
      </div>
      <div class="cs-top"><span class="cs-title"></span><button type="button" class="cs-auto">▶ 자동</button><button type="button" class="cs-skip">건너뛰기 ⏭</button></div>
      <div class="cs-endcard"><small></small><b></b><span></span></div>
      <div class="cs-load">불러오는 중…</div>`;
    root.querySelector('.cs-title').textContent = '🎬 ' + sc.title;
    document.body.appendChild(root);
    return root;
  }

  let playing = null;
  async function play(id) {
    const sc = SCRIPTS[id];
    if (!sc) return;
    if (playing) return playing;
    playing = run(id, sc).finally(() => { playing = null; });
    return playing;
  }

  async function run(id, sc) {
    const root = build(sc);
    const $ = s => root.querySelector(s);
    const bgs = [$('.cs-bg.a'), $('.cs-bg.b')]; let bgi = 0, curBg = '';
    const box = $('.cs-box'), face = $('.cs-face'), faceImg = face.querySelector('img');
    const nameEl = $('.cs-name'), actEl = $('.cs-act'), lineEl = $('.cs-line');
    const card = $('.cs-card'), phone = $('.cs-phone'), phBody = $('.cs-ph-body'), call = $('.cs-call');
    let skipped = false, auto = false, tapResolve = null, typing = null;

    // ---- 입력: 화면 누르기 / 스페이스·엔터 = 다음, Esc = 건너뛰기 ----
    const tap = () => { if (typing) { typing(); return; } if (tapResolve) { const r = tapResolve; tapResolve = null; r(); } };
    const skip = () => { skipped = true; if (typing) typing(); if (tapResolve) { const r = tapResolve; tapResolve = null; r(); } };
    root.addEventListener('pointerdown', e => { if (e.target.closest('.cs-top')) return; tap(); });
    $('.cs-skip').onclick = skip;
    $('.cs-auto').onclick = () => { auto = !auto; $('.cs-auto').classList.toggle('on', auto); $('.cs-auto').textContent = auto ? '⏸ 자동' : '▶ 자동'; if (auto && !typing) tap(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); tap(); }
    };
    document.addEventListener('keydown', onKey, true);
    const waitTap = (autoMs) => new Promise(res => {
      if (skipped) return res();
      tapResolve = res;
      const ms = autoMs || (auto ? 1700 : 0);
      if (ms) setTimeout(() => { if (tapResolve === res) { tapResolve = null; res(); } }, ms);
    });
    const pause = ms => skipped ? Promise.resolve() : new Promise(res => { tapResolve = res; setTimeout(() => { if (tapResolve === res) { tapResolve = null; res(); } }, ms); });

    // ---- 그림 미리 받기 (최대 8초, 실패해도 진행) ----
    root.classList.add('on');
    await Promise.all(imagesOf(sc).map(u => loadImg(u)));
    $('.cs-load').remove();
    if (skipped) return finish();

    const setBg = name => {
      if (!name || name === curBg) return;
      curBg = name; const next = bgs[1 - bgi];
      next.style.backgroundImage = `url("${DIR + sc.dir + name}.webp")`;
      next.classList.add('show'); bgs[bgi].classList.remove('show'); bgi = 1 - bgi;
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const fx = list => (list || []).forEach(f => {
      if (f === 'shake') restart(root, 'fx-shake');
      else if (f === 'flash') restart(root, 'fx-flash');
      else if (f === 'glare') restart(root, 'fx-glare');
      else if (f === 'slowmo') restart(root, 'fx-slowmo');
      else if (f === 'silence') root.classList.add('fx-silence');
      else if (f === 'drunk') root.classList.add('fx-drunk');
      else if (f === 'spin') root.classList.add('fx-spin');
      else if (f === 'eyes') root.classList.add('fx-eyes');
      else if (f === 'black') root.classList.add('fx-black');
      else if (f === 'phone') { phone.hidden = false; phBody.innerHTML = ''; restart(root, 'fx-buzz'); }
      else if (f === 'phoneOff') { phone.hidden = true; call.hidden = true; }
      else if (f === 'fade') root.classList.add('fx-fade');
    });
    // 장면이 바뀌면 이전 장면의 지속 효과를 걷는다
    const clearScene = () => { ['fx-silence', 'fx-drunk', 'fx-spin', 'fx-eyes', 'fx-black', 'fx-fade'].forEach(c => root.classList.remove(c)); phone.hidden = true; call.hidden = true; };

    // 글자를 한 자씩. 누르면 한 번에 다 보인다
    const typeText = (text) => new Promise(res => {
      const chars = [...text]; let i = 0, timer = null;
      const done = () => { clearInterval(timer); typing = null; lineEl.textContent = text; box.classList.add('ready'); res(); };
      typing = done; lineEl.textContent = ''; box.classList.remove('ready');
      if (skipped) return done();
      timer = setInterval(() => { i++; lineEl.textContent = chars.slice(0, i).join(''); if (i >= chars.length) done(); }, 32);
    });

    const showBox = (st) => {
      const kind = st.t;
      box.className = 'cs-box show ' + kind + (st.far ? ' far' : '') + (st.fx && st.fx.includes('big') ? ' big' : '');
      const hasFace = !!st.face;
      face.style.display = hasFace ? '' : 'none';
      if (hasFace) { faceImg.src = DIR + sc.dir + st.face + '.webp'; restart(face, 'pop'); }
      nameEl.textContent = kind === 'say' ? st.who : kind === 'mono' ? '나 (독백)' : '';
      nameEl.style.display = nameEl.textContent ? '' : 'none';
      actEl.textContent = st.act ? `(${st.act})` : '';
      actEl.style.display = st.act ? '' : 'none';
    };

    for (const st of sc.steps) {
      if (skipped) break;
      if (st.t === 'scene') {
        clearScene(); box.classList.remove('show');
        setBg(st.bg); fx(st.fx);
        card.querySelector('small').textContent = `SCENE ${st.no}`;
        card.querySelector('b').textContent = st.title;
        card.querySelector('span').textContent = st.time || '';
        restart(card, 'show');
        await pause(1900);
        card.classList.remove('show');
        continue;
      }
      if (st.bg) setBg(st.bg);
      fx(st.fx);
      if (st.t === 'video' || st.t === 'chat') {
        phone.hidden = false;
        const el = document.createElement('div');
        if (st.t === 'video') { el.className = 'cs-msg video'; el.innerHTML = `<span class="play">▶</span><span>[${esc(st.text)}]</span>`; }
        else { el.className = 'cs-msg'; el.innerHTML = `<b>${esc(st.who)}</b><span>${esc(st.text)}</span>`; }
        phBody.appendChild(el); phBody.scrollTop = phBody.scrollHeight;
        restart(root, 'fx-buzz');
        box.classList.remove('show');
        await waitTap(st.auto || (auto ? 1400 : 0));
        continue;
      }
      if (st.t === 'call') {
        call.hidden = false;
        call.querySelector('b').textContent = st.who;
        call.querySelector('small').textContent = '통화 기록 · ' + st.text;
        restart(call, 'drop'); restart(root, 'fx-buzz');
        box.classList.remove('show');
        await waitTap(st.auto || (auto ? 1600 : 0));
        continue;
      }
      showBox(st);
      await typeText(st.text);
      await waitTap(st.auto);
    }
    if (!skipped) {                                                   // 끝 카드: 「영남대 입학 · 1학년」
      root.classList.add('fx-fade'); box.classList.remove('show');
      await pause(900);
      const ec = $('.cs-endcard');
      ec.querySelector('small').textContent = sc.end.kicker; ec.querySelector('b').textContent = sc.end.title; ec.querySelector('span').textContent = sc.end.sub;
      ec.classList.add('show');
      await pause(2600);
    }
    return finish();

    function finish() {
      markSeen(id);
      document.removeEventListener('keydown', onKey, true);
      root.classList.add('out');
      return new Promise(res => setTimeout(() => { root.remove(); res(); }, 500));
    }
  }

  window.Cutscene = { play, seen, has: id => !!SCRIPTS[id], SCRIPTS };
})();
