// menutour.js (v140) — 5부 튜토리얼 「메뉴 둘러보기」: 덱 만들기·덱 슬롯 · 상점 · 카드 제작 · 퀘스트 · 모드
//  - 기본~4부 튜토리얼처럼 제이나(와 가로쉬)의 대화로 진행한다. 실제 메인 메뉴 위에서 한다 (연습 화면이 아님)
//  - 안내하는 곳만 밝게 남기고 나머지는 어둡게 막는다. 안내한 행동을 실제로 하면(화면이 바뀌면) 다음 단계로
//  - 끝나면 서버에 'menu' 완료를 남기고, 그 자리에서 첫 완료 보상을 받을 수 있다 (📜 퀘스트 → 🌱 첫 걸음과 같은 보상, 한 번만)
//  - 시작: 튜토리얼 화면의 5부 [시작] · 4부 승리 창의 [5부 ▶] (/#tour) → MenuTour.start()
const MenuTour = (() => {
  'use strict';
  const NAME = { J: '제이나', G: '가로쉬' }, face = k => `/tutorial/images/${k}.jpg`;
  const KW = s => `<span class="mt-kw">${s}</span>`;
  const q = s => document.querySelector(s);
  const shown = id => { const e = document.getElementById(id); return !!e && e.classList.contains('show'); };
  const screenOn = n => shown('screen-' + n);
  const deckFull = () => { const d = ServerStore.decks; return !!d && d.slots.length >= d.max; };
  const edTotal30 = () => typeof ed !== 'undefined' && listOf(ed.counts).length === CONFIG.DECK_SIZE;
  const D = () => PROGRESS.DISENCHANT, C = () => PROGRESS.CRAFT;

  // 단계: info(다음 버튼) | do(안내한 곳을 실제로 누르면 until 이 참이 되어 다음으로)
  //  sel: 밝게 남길 곳 · until: 끝났는지 · lost: 엉뚱한 곳으로 빠졌으면 참 → back 단계로 돌아감 · skip: 참이면 건너뜀
  const STEPS = [
    { ch: 0, title: '메뉴 둘러보기', type: 'info',
      say: [['J1', `마지막 5부예요! 이번엔 싸움 밖에서 할 일들을 둘러봐요. ${KW('덱 만들기')}, ${KW('상점')}, ${KW('카드 제작')}, ${KW('퀘스트')}, 그리고 ${KW('모드')}예요.`],
            ['G2', '칼은 안 휘두르고 메뉴 구경이라니. 마법사다운 한가한 짓이군.'],
            ['J2', '준비가 반이에요, 가로쉬. 안내하는 곳만 밝게 남겨 둘게요. 거기를 직접 눌러 보세요.']] },
    // ---- 덱 ----
    { ch: 0, title: '내 덱', type: 'do', sel: 'button[onclick="openDeckList()"]', until: () => shown('deckListModal'),
      say: [['J1', `먼저 ${KW('📚 내 덱')}이에요. 대전에 들고 갈 카드 30장을 정하는 곳이죠.`]],
      task: '<b>📚 내 덱</b>을 누르세요.' },
    { ch: 0, title: '덱 슬롯', type: 'info', sel: '#deckListModal .deck-panel',
      say: [['J1', `덱은 여러 개 저장해 둘 수 있어요(${KW('덱 슬롯')}). <b>✔ 사용 중</b>인 덱이 AI 대전·유저 대전에 쓰여요.`],
            ['J3', '덱마다 <b>영웅 능력</b>을 따로 정할 수 있고, <b>📋 코드</b>로 친구에게 덱을 보내거나 <b>📥 코드로 가져오기</b>로 받을 수도 있어요.']] },
    { ch: 0, title: '새 덱 만들기', type: 'do', sel: '#dlNew', until: () => !!q('#confirmBox') || shown('deckEditor'), skip: deckFull,
      say: [['J2', '직접 하나 만들어 볼까요? <b>＋ 새 덱</b>을 눌러요.']],
      task: '<b>＋ 새 덱</b>을 누르세요.' },
    { ch: 0, title: '덱 이름', type: 'do', sel: '#confirmBox .cb-panel', until: () => shown('deckEditor'), skip: () => deckFull() && !q('#confirmBox'),
      lost: () => !q('#confirmBox') && !shown('deckEditor'), back: '새 덱 만들기',
      say: [['J1', '이름은 마음대로 지어도 돼요. 그대로 두고 <b>확인</b>을 눌러도 되고요.']],
      task: '덱 이름을 정하고 <b>확인</b>을 누르세요.' },
    { ch: 0, title: '덱 편집 화면', type: 'info', sel: '#edGrid', skip: () => !shown('deckEditor'),
      say: [['J1', '여기가 덱 편집 화면이에요. 카드를 누르거나 <b>＋ / −</b>로 넣고 빼요. 같은 카드는 <b>2장까지</b>, 모두 <b>30장</b>이어야 저장할 수 있어요.'],
            ['J3', `카드 아래 <b>보유 n장</b>을 보세요. 가진 만큼만 넣을 수 있어요. ${KW('🔒 미보유')} 카드는 상점이나 제작으로 얻어야 해요.`],
            ['J2', '<b>🔍 필터</b>를 열면 등급·비용·룬별로 골라 보고, 마나 곡선(비용 분포)도 볼 수 있어요.']] },
    { ch: 0, title: '추천 덱으로 채우기', type: 'do', sel: '#edReset', until: edTotal30, skip: () => !shown('deckEditor'),
      say: [['J1', '처음엔 30장을 다 고르기 어렵죠. <b>추천 덱</b>을 누르면 바로 쓸 수 있는 30장이 채워져요. 거기서 한두 장씩 바꿔 가며 내 덱으로 만들면 돼요.']],
      task: '<b>추천 덱</b>을 누르세요.' },
    { ch: 0, title: '저장', type: 'do', sel: '#edSave', until: () => !shown('deckEditor'), skip: () => !shown('deckEditor'),
      say: [['J2', '30장이 됐어요! <b>저장</b>을 눌러요.']],
      task: '<b>저장</b>을 누르세요.' },
    { ch: 0, title: '내 덱 완성', type: 'info', sel: '#deckSlots',
      say: [['J2', () => deckFull() && !MenuTour._made ? '덱 칸이 가득 차 있어서 이번엔 새로 만들지 않았어요. 기존 덱의 <b>편집</b>에서 똑같이 하면 돼요.' : '새 덱이 생겼어요! <b>사용하기</b>를 누르면 다음 대전부터 이 덱으로 싸워요.'],
            ['G1', '30장이든 300장이든, 호드의 도끼 앞에선 다 종이 쪼가리다.'],
            ['J3', '그 종이 쪼가리에 4부에서 졌잖아요?']] },
    { ch: 0, title: '닫기', type: 'do', sel: 'button[onclick="closeDeckList()"]', until: () => !shown('deckListModal'),
      say: [['J1', '덱은 됐어요. <b>닫기</b>로 메뉴로 돌아가요.']], task: '<b>닫기</b>를 누르세요.' },
    // ---- 상점 ----
    { ch: 1, title: '상점', type: 'do', sel: 'button[onclick="openShop()"]', until: () => screenOn('shop'),
      say: [['J1', `카드를 모으는 첫 번째 방법, ${KW('🛒 상점')}이에요.`]], task: '<b>🛒 상점</b>을 누르세요.' },
    { ch: 1, title: '카드 팩', type: 'info', sel: '#shopRates',
      say: [['J1', () => `카드 팩은 <b>${fmt(SHOP.PACK_PRICE)}골드</b>에 ${SHOP.PACK_SIZE}장. 등급별로 나올 확률과 <b>내가 모은 수(수집 n/전체)</b>가 여기 보여요.`],
            ['J3', '오래 안 나오면 <b>확정</b>으로 줘요. 아래 「특급 이상 확정까지」, 「전설 확정까지」가 남은 팩 수예요.']] },
    { ch: 1, title: '골드와 남는 카드', type: 'info', sel: '#shopDupNote',
      say: [['J1', '골드는 <b>대전 승리</b>, <b>일일 퀘스트</b>, <b>배팅</b>, 그리고 튜토리얼 보상으로 모여요.'],
            ['J3', `같은 카드가 2장을 넘게 나오면 ${KW('남는 카드')}로 쌓여요. 버려지는 게 아니라 카드 제작에서 <b>가루</b>로 바꿀 수 있어요.`],
            ['G2', '팩을 뜯는다고? 진짜 전사는 전리품을 빼앗는다!'],
            ['J2', '지금 팩을 사지 않아도 돼요. 나중에 골드가 모이면 와요.']] },
    { ch: 1, title: '메뉴로', type: 'do', sel: '#screen-shop .menu-btn.back', until: () => screenOn('main'),
      say: [['J1', '<b>뒤로</b>를 눌러 메뉴로 가요.']], task: '<b>뒤로</b>를 누르세요.' },
    // ---- 카드 제작 ----
    { ch: 2, title: '카드 제작', type: 'do', sel: 'button[onclick="openCraft()"]', until: () => shown('craftModal'),
      say: [['J1', `두 번째 방법은 ${KW('🔨 카드 제작')}이에요. 원하는 카드를 콕 집어서 만들 수 있어요.`]], task: '<b>🔨 카드 제작</b>을 누르세요.' },
    { ch: 2, title: '가루', type: 'info', sel: '#craftModal .deck-panel',
      say: [['J1', () => `카드를 <b>분해</b>하면 ${KW('가루')}가 나오고, 가루로 카드를 <b>제작</b>해요. 분해: 일반 ${D()['일반']} · 희귀 ${D()['희귀']} · 특급 ${D()['특급']} · 전설 ${D()['전설']}.`],
            ['J3', () => `제작은 일반 ${C()['일반']} · 희귀 ${C()['희귀']} · 특급 ${C()['특급']} · 전설 ${fmt(C()['전설'])}. 분해보다 비싸니까, 쓰지 않는 카드를 모아 정말 원하는 카드로 바꾸는 거예요.`],
            ['J2', '<b>⚒ 일괄 추출</b>은 덱 한도(2장)를 넘는 <b>남는 카드</b>만 한 번에 가루로 바꿔요. 덱에 쓰는 장수는 분해되지 않으니 안심하세요.']] },
    { ch: 2, title: '닫기', type: 'do', sel: 'button[onclick="closeCraft()"]', until: () => !shown('craftModal'),
      say: [['J1', '<b>닫기</b>를 눌러요.']], task: '<b>닫기</b>를 누르세요.' },
    // ---- 퀘스트 ----
    { ch: 3, title: '퀘스트', type: 'do', sel: 'button[onclick="openQuests()"]', until: () => screenOn('quests'),
      say: [['J1', `골드를 꾸준히 모으는 방법, ${KW('📜 퀘스트')}예요.`]], task: '<b>📜 퀘스트</b>를 누르세요.' },
    { ch: 3, title: '일일 퀘스트', type: 'info', sel: '#questList',
      say: [['J1', () => `매일 <b>새벽 5시</b>에 새 퀘스트 ${PROGRESS.PER_DAY}개가 나와요. "주문 10장 쓰기"처럼 하다 보면 채워지고, 끝나면 골드가 <b>바로</b> 들어와요.`],
            ['J3', () => `마음에 안 드는 퀘스트는 <b>↻ 바꾸기</b>로 하루 ${PROGRESS.REROLLS}번 바꿀 수 있어요. AI 대전·모험·유저 대전 모두 진행돼요.`],
            ['J2', '맨 위 🌱 <b>첫 걸음</b>은 튜토리얼 보상 칸이에요. 받으면 사라지는 한 번뿐인 보상이죠.']] },
    { ch: 3, title: '메뉴로', type: 'do', sel: '#screen-quests .menu-btn.back', until: () => screenOn('main'),
      say: [['J1', '<b>뒤로</b>를 눌러요.']], task: '<b>뒤로</b>를 누르세요.' },
    // ---- 모드 ----
    { ch: 4, title: '게임 시작', type: 'do', sel: '#screen-main .menu-btn.primary', until: () => screenOn('mode'),
      say: [['J1', `마지막은 ${KW('모드')}! <b>게임 시작</b>을 누르면 어떤 대전을 할지 골라요.`]], task: '<b>게임 시작</b>을 누르세요.' },
    { ch: 4, title: 'AI 대전 · 배팅', type: 'info', sel: '#screen-mode button[onclick="showScreen(\'difficulty\')"]',
      say: [['J1', `${KW('AI 대전')}: 컴퓨터와 1대1. 난이도를 고르고, 이기면 골드를 받아요. 연습하기 가장 좋아요.`],
            ['J3', `난이도를 고른 뒤 ${KW('배팅')}을 고르면 골드를 걸고 싸워요. 배당이 높을수록 상대 AI가 <b>치트</b>를 더 써요. 질 수도 있으니 조심!`]] },
    { ch: 4, title: '유저 대전', type: 'info', sel: '#screen-mode button[onclick="PvpClient.openScreen()"]',
      say: [['J1', `${KW('유저 대전')}: 다른 사람과 실시간으로! <b>일반전</b>과 점수가 걸린 <b>랭크전</b>이 있고, 턴마다 시간 제한이 있어요.`],
            ['J3', '메인 메뉴의 <b>👥 친구</b>에서 친구에게 대전을 신청하거나 친구 판을 <b>관전</b>할 수 있고, 지난 판은 <b>🎞 리플레이</b>로 다시 볼 수 있어요.'],
            ['G3', '유저 대전이라면 내가 기다리고 있으마. 거기선 봐주지 않는다!']] },
    { ch: 4, title: '모험 모드', type: 'info', sel: '#screen-mode button[onclick="openAdventure()"]',
      say: [['J1', `${KW('🗺 모험 모드')}: 정해진 덱을 쓰는 <b>보스</b>들에게 도전해요. 도장깨기 챕터는 앞 단계를 깨야 다음이 열려요.`],
            ['J2', '보스를 처음 깨면 <b>모험 전용 카드</b>를 줘요. 모험 전용 카드는 <b>모험 덱</b>에만 넣을 수 있어요.']] },
    { ch: 4, title: '메뉴로', type: 'do', sel: '#screen-mode .menu-btn.back', until: () => screenOn('main'),
      say: [['J1', '마지막으로 <b>뒤로</b>!']], task: '<b>뒤로</b>를 누르세요.' },
    { ch: 4, title: '그 밖의 메뉴', type: 'info', sel: '#screen-main',
      say: [['J1', '<b>🔮 영웅 능력</b>에서 기본 영웅 능력을 고르고, <b>📖 가이드</b>에서 효과·규칙·모드 설명을 언제든 다시 볼 수 있어요.'],
            ['J3', '튜토리얼은 <b>🎓 튜토리얼</b>에서 언제든 다시 할 수 있어요. 모르는 게 생기면 돌아와요.']] },
  ];
  const CHAPS = ['덱', '상점', '카드 제작', '퀘스트', '모드'];

  let on = false, idx = 0, timer = null, Q = [], QT = null, els = null, done = false, lostTicks = 0;
  const step = () => STEPS[idx];

  /* ---------- 화면 ---------- */
  function build() {
    if (els) return els;
    const mk = (id, cls) => { const e = document.createElement('div'); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
    els = { t: mk('mtB0', 'mt-block'), b: mk('mtB1', 'mt-block'), l: mk('mtB2', 'mt-block'), r: mk('mtB3', 'mt-block'), hole: mk('mtHole'), ring: mk('mtRing'), coach: mk('mtCoach') };
    els.coach.innerHTML = `<div class="mt-head"><span class="mt-badge"></span><b class="mt-title"></b><button type="button" class="mt-x" title="그만두기">✕</button></div>
      <div class="mt-chap"></div><div class="mt-chat"></div><div class="mt-task"></div>
      <div class="mt-btns"><button type="button" class="mt-next">다음</button></div>`;
    els.coach.querySelector('.mt-x').onclick = () => { if (done || confirm('메뉴 둘러보기를 그만둘까요? (처음부터 다시 할 수 있어요)')) stop(); };
    els.coach.querySelector('.mt-next').onclick = () => { if (Q.length) { flush(); return; } if (step() && step().type === 'info') next(); };
    [els.t, els.b, els.l, els.r, els.hole].forEach(e => { e.onclick = ev => { ev.stopPropagation(); ev.preventDefault(); poke(); }; });
    return els;
  }
  function poke() {                                   // 막힌 곳을 누르면 안내를 흔들어 보여 준다
    const t = els.coach.querySelector('.mt-task'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
    els.ring.classList.remove('flash'); void els.ring.offsetWidth; els.ring.classList.add('flash');
  }
  function place() {
    if (!on) return;
    const st = step(), tgt = st && st.sel ? q(st.sel) : null, W = innerWidth, H = innerHeight;
    let r = tgt && tgt.getClientRects().length ? tgt.getBoundingClientRect() : null;
    if (r && (r.width < 2 || r.height < 2)) r = null;
    const pad = 6, R = r ? { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), x2: Math.min(W, r.right + pad), y2: Math.min(H, r.bottom + pad) } : { x: W / 2, y: H / 2, x2: W / 2, y2: H / 2 };
    const set = (e, x, y, w, h) => { e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = Math.max(0, w) + 'px'; e.style.height = Math.max(0, h) + 'px'; };
    set(els.t, 0, 0, W, R.y); set(els.b, 0, R.y2, W, H - R.y2); set(els.l, 0, R.y, R.x, R.y2 - R.y); set(els.r, R.x2, R.y, W - R.x2, R.y2 - R.y);
    set(els.hole, R.x, R.y, R.x2 - R.x, R.y2 - R.y); set(els.ring, R.x, R.y, R.x2 - R.x, R.y2 - R.y);
    els.ring.style.display = r ? '' : 'none';
    els.hole.style.pointerEvents = st && st.type === 'do' && !done ? 'none' : 'auto';   // 해 볼 곳만 눌리게. 설명 단계는 전부 막는다
    // 코치 창은 안내하는 곳과 겹치지 않는 쪽으로
    const c = els.coach, wide = W >= 900, cy = r ? (r.top + r.bottom) / 2 : H / 2, cx = r ? (r.left + r.right) / 2 : W / 2;
    c.classList.toggle('wide', wide);
    if (wide) { c.classList.toggle('right', cx < W / 2); c.classList.remove('top'); c.style.maxHeight = ''; }
    else {                                            // 폰: 안내하는 곳 위·아래 중 넓은 쪽에, 그 틈에 맞게 줄여서 (가운데 뜨는 이름 창의 [확인]을 가리지 않게)
      const up = r ? r.top - 16 : H / 2, down = r ? H - r.bottom - 16 : H / 2, top = r ? up > down : cy > H * 0.5, room = Math.max(up, down);
      c.classList.toggle('top', top && room >= 240); c.classList.remove('right');
      c.style.maxHeight = (room >= 240 ? Math.min(H * 0.44, room) : H * 0.44) + 'px';   // 안내하는 곳이 화면을 거의 다 차지하면(설명 단계) 아래쪽에 겹쳐 띄운다
    }
  }
  /* ---------- 대화 ---------- */
  const txt = s => typeof s === 'function' ? s() : s;
  function addMsg(l) {
    const box = els.coach.querySelector('.mt-chat'); box.querySelectorAll('.typing').forEach(x => x.remove());
    const [c, s] = l, w = c[0], d = document.createElement('div'); d.className = 'mt-msg ' + (w === 'G' ? 'g' : 'j');
    d.innerHTML = `<img src="${face(c)}" alt=""><div class="mt-bub"><span class="mt-who">${NAME[w]}</span>${txt(s)}</div>`;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  function pump() {
    clearTimeout(QT); if (!Q.length) { syncBtn(); return; }
    const l = Q[0], box = els.coach.querySelector('.mt-chat');
    if (!box.querySelector('.typing')) { const t = document.createElement('div'); t.className = 'mt-msg typing ' + (l[0][0] === 'G' ? 'g' : 'j'); t.innerHTML = `<img src="${face(l[0])}" alt=""><div class="mt-bub">•••</div>`; box.appendChild(t); box.scrollTop = box.scrollHeight; }
    QT = setTimeout(() => { addMsg(Q.shift()); pump(); }, 320 + Math.min(750, String(txt(l[1])).replace(/<[^>]+>/g, '').length * 6));
    syncBtn();
  }
  function flush() { clearTimeout(QT); while (Q.length) addMsg(Q.shift()); syncBtn(); }
  function say(lines) { Q.push(...lines); pump(); }
  function syncBtn() {
    const b = els.coach.querySelector('.mt-next'), st = step();
    if (done) { b.style.display = 'none'; return; }
    b.style.display = (st && st.type === 'info') || Q.length ? '' : 'none';
    b.textContent = Q.length ? '빨리 보기 ▸' : '다음';
  }
  /* ---------- 진행 ---------- */
  function show() {
    let st = step();
    while (st && st.skip && st.skip()) { idx++; st = step(); }
    if (!st) return finish();
    const box = els.coach.querySelector('.mt-chat'), sep = document.createElement('div'); sep.className = 'mt-sep'; sep.textContent = st.title; box.appendChild(sep);
    els.coach.querySelector('.mt-title').textContent = st.title;
    els.coach.querySelector('.mt-badge').textContent = `5부 · ${idx + 1}/${STEPS.length}`;
    els.coach.querySelector('.mt-chap').innerHTML = CHAPS.map((n, i) => `<i class="${i < st.ch ? 'done' : i === st.ch ? 'cur' : ''}" title="${n}"></i>`).join('') + `<span>${st.ch + 1}/${CHAPS.length} · ${CHAPS[st.ch]}</span>`;
    const tk = els.coach.querySelector('.mt-task'); tk.innerHTML = st.task ? '해 보기 · ' + st.task : ''; tk.style.display = st.task ? '' : 'none';
    const t = st.sel && q(st.sel); if (t && t.scrollIntoView) try { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    say(st.say || []); place();
  }
  function next() { idx++; show(); }
  function tick() {
    if (!on || done) { place(); return; }
    const st = step(); if (!st) return;
    if (st.type === 'do') {
      if (st.until()) { if (st.title === '저장') MenuTour._made = true; flush(); next(); return; }
      // 엉뚱한 곳으로 빠졌는지: 잠깐(서버 응답을 기다리는 사이)은 봐준다. 3초 넘게 계속이면 앞 단계로
      if (st.lost && st.lost()) { if (++lostTicks > 20) { lostTicks = 0; const j = STEPS.findIndex(s => s.title === st.back); if (j >= 0) { idx = j; show(); return; } } }
      else lostTicks = 0;
    }
    place();
  }
  async function finish() {
    done = true; flush();
    els.coach.querySelector('.mt-title').textContent = '완료!'; els.coach.querySelector('.mt-badge').textContent = '5부 · 완료';
    els.coach.querySelector('.mt-task').style.display = 'none';
    els.coach.querySelector('.mt-chap').innerHTML = CHAPS.map(() => '<i class="done"></i>').join('') + '<span>모두 완료</span>';
    place(); els.ring.style.display = 'none';
    say([['G4', '덱에, 상점에, 가루에… 마법사들은 정말 준비만 하는군. 다음 판에서 보자!'], ['J2', '메뉴 둘러보기까지, 튜토리얼을 모두 마쳤어요! 이제 진짜 대전에서 만나요.']]);
    let state = 'net';
    try { const r = await fetch('/api/tutorial/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ tutorial: 'menu' }) }); if (r.ok) { const d = await r.json(); state = (d.state && d.state.menu) || 'ready'; } } catch (_) {}
    try { await ServerStore.loadProgress(); } catch (_) {}
    const t = PROGRESS.TUTORIALS.find(x => x.id === 'menu'), box = document.createElement('div'); box.className = 'mt-win';
    box.innerHTML = state === 'ready' ? `🎁 <b>첫 완료 보상(${t.rewardText})</b>이 준비됐어요!<div class="mt-wbtns"><button type="button" class="mt-claim">🎁 지금 받기</button><button type="button" class="mt-close">나중에 (첫 걸음에서)</button></div>`
      : state === 'claimed' ? '첫 완료 보상은 이미 받았어요.<div class="mt-wbtns"><button type="button" class="mt-close">닫기</button></div>'
      : '⚠ 서버에 완료 기록을 남기지 못했어요. 다시 해 주세요.<div class="mt-wbtns"><button type="button" class="mt-close">닫기</button></div>';
    const chat = els.coach.querySelector('.mt-chat'); setTimeout(() => { flush(); chat.appendChild(box); chat.scrollTop = chat.scrollHeight; }, 1600);
    const cl = box.querySelector('.mt-claim'); if (cl) cl.onclick = () => { stop(); claimTutorial('menu'); };
    box.querySelector('.mt-close').onclick = () => stop();
  }
  function start() {
    if (on) return;
    if (!window.ServerStore || !ServerStore.decks) { ServerStore.loadDecks && ServerStore.loadDecks(); }
    try { closeDeckList(); closeDeckEditor(); closeCraft(); } catch (_) {}
    document.querySelectorAll('#confirmBox,#modeIntro').forEach(e => e.remove());
    showScreen('main'); scrollTo(0, 0);
    build(); on = true; done = false; idx = 0; Q = []; MenuTour._made = false;
    els.coach.querySelector('.mt-chat').innerHTML = '';
    Object.values(els).forEach(e => { e.style.display = ''; });
    document.body.classList.add('mt-on');
    show(); timer = setInterval(tick, 150); addEventListener('resize', place);
  }
  function stop() {
    on = false; clearInterval(timer); clearTimeout(QT); Q = []; removeEventListener('resize', place);
    if (els) Object.values(els).forEach(e => { e.style.display = 'none'; });
    document.body.classList.remove('mt-on');
    try { updateTutorialMenuDesc(); updateQuestMenuDesc(); } catch (_) {}
  }
  return { start, stop, get on() { return on; }, get step() { return idx; }, STEPS, _made: false };
})();
