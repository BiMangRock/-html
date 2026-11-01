// replay.js — v137 지난 판 다시 보기.  로드 순서: engine.js · pvp.js · … · ui.js → pvpclient.js → friends.js → replay.js
//  서버는 판의 "시드 · 양쪽 덱 · 영웅 능력 · 멀리건 · 행동 목록"만 저장한다 (/api/pvp/replays/:id).
//  브라우저가 같은 엔진(engine.js)으로 판을 처음부터 다시 돌려서 단계별 상태와 이벤트를 만들고, 기존 연출 코드(playEvents · render)로 보여 준다.
//  끝난 판이라 양쪽 손패를 모두 앞면으로 보여 준다.
const Replay = (() => {
  'use strict';
  const $id = id => document.getElementById(id);
  const R = { rep: null, mySeat: 0, seat: 0, states: [], events: [], labels: [], i: 0, playing: false, speed: 1, token: 0, mismatch: false, names: ['', ''], game: null, matchId: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SPEEDS = [{ k: 1, label: '보통', gap: 900, anim: true }, { k: 2, label: '빠르게', gap: 250, anim: true }, { k: 3, label: '아주 빠르게', gap: 300, anim: false }];
  const ACT = { PLAY_CARD: '카드 내기', ATTACK: '공격', HERO_ATTACK: '영웅 공격', HERO_POWER: '영웅 능력', END_TURN: '턴 종료', TARGET: '대상 선택', CHOOSE: '선택', SURRENDER: '항복' };
  const REASON = { surrender: '항복', timeout: '시간 초과', disconnect: '연결 끊김', turnlimit: '턴 수 초과 무승부', normal: '' };

  // ---------- 판 다시 만들기 ----------
  function build(rep) {
    const states = [], events = [], labels = [];
    let st = newGame(pvpRng(rep.seed), { decks: rep.decks, heroPowers: rep.heroPowers }), bad = false;
    states.push(structuredClone(st)); events.push([]); labels.push('시작 손패');
    for (const step of rep.steps) {
      let evs = [], label = '';
      if (step.m !== undefined) {
        st = structuredClone(st); const n = mulliganHand(st, step.m, step.ids || []);
        label = `${R.names[step.m]} 멀리건: ${n ? n + '장 교체' : '그대로'}`;
      } else if (step.a) {
        const r = apply(st, step.a, step.s);
        if (!r.ok) { bad = true; break; }                                  // 카드·규칙이 바뀌어 기록대로 진행되지 않음
        st = r.state; evs = r.events;
        let what = ACT[step.a.type] || step.a.type;
        if (step.a.type === 'PLAY_CARD') { const prev = states[states.length - 1].seats[step.s].hand.find(c => c.id === step.a.cardId); if (prev) what = `「${prev.name}」`; }
        label = `${R.names[step.s]} · ${what}${step.auto ? ' (시간 초과 자동)' : ''}`;
      } else if (step.end) {
        st = structuredClone(st); st.over = true; st.winner = step.winner ?? null; label = step.end === 'turnlimit' ? '턴 수 초과 — 무승부' : '판 종료';
      } else continue;
      states.push(structuredClone(st)); events.push(evs); labels.push(label);
    }
    const e = rep.end || {};
    if (!bad && e.turnNo !== undefined && (st.turnNo !== e.turnNo || (st.winner ?? null) !== (e.winner ?? null))) bad = true;
    return { states, events, labels, bad };
  }
  // seat 시점의 화면 + 상대 손패 공개
  function viewAt(k) {
    const st = R.states[k], v = viewFor(st, R.seat), o = st.seats[1 - R.seat];
    v.opp.hand = o.hand.map(c => ({ ...c, cost: effCost(o, c) }));
    v.legal = []; v.pending = null;
    return v;
  }

  // ---------- 보여 주기 ----------
  function setAvatar(id, name) {
    const box = $id(id); if (!box) return; const sp = box.firstElementChild;
    let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    sp.textContent = ([...String(name || '?').trim()][0] || '?').toUpperCase(); box.style.setProperty('--ah', h);
  }
  function applySeat() {
    MY = R.seat; OPP = 1 - R.seat;
    document.querySelector('#playerHero .name').textContent = R.names[MY];
    document.querySelector('#aiHero .name').textContent = R.names[OPP];
    const lb = document.querySelectorAll('.board > .row .label'); if (lb.length >= 2) { lb[0].textContent = `${R.names[OPP]} 필드`; lb[1].textContent = `${R.names[MY]} 필드`; }
    setAvatar('playerAvatar', R.names[MY]); setAvatar('aiAvatar', R.names[OPP]);
  }
  function draw(k) {
    view = viewAt(k); Host.state = structuredClone(R.states[k]);
    ui.selected = null; ui.pending = null; ui.place = null; ui.busy = true;
    render(); $id('overlay').classList.remove('show');
    bar();
  }
  async function step(k, anim) {                                         // k = R.i + 1 이면 연출과 함께, 아니면 바로 그린다
    if (k < 0 || k >= R.states.length) return;
    const tok = R.token;
    if (anim && k === R.i + 1 && R.events[k].length) {
      view = viewAt(R.i); Host.state = structuredClone(R.states[k]); ui.busy = true;
      R.i = k; bar();
      try { await playEvents(R.events[k]); } catch (e) { console.error('[replay] 연출 오류', e); }
      if (tok !== R.token || game !== R.game) return;                     // 그 사이에 다른 단계로 옮겼거나 리플레이를 닫음
    } else {
      if (k !== R.i + 1) { $id('logList').innerHTML = ''; logLine(`⏩ ${k}단계로 이동`); }
      else if (R.events[k].length) for (const ev of R.events[k]) { const t = typeof eventText === 'function' ? eventText(ev) : null; if (t) logLine(t); }
    }
    R.i = k;
    if (R.labels[k] && !(anim && R.events[k].length)) logLine('▶ ' + R.labels[k]);
    draw(k);
  }
  async function play() {
    if (R.playing) { R.playing = false; bar(); return; }
    if (R.i >= R.states.length - 1) { R.token++; await step(0, false); }
    R.playing = true; bar();
    const tok = ++R.token;
    while (R.playing && tok === R.token && game === R.game && R.i < R.states.length - 1) {
      const sp = SPEEDS.find(x => x.k === R.speed);
      await step(R.i + 1, sp.anim);
      if (tok !== R.token) return;
      await sleep(sp.gap);
    }
    if (tok === R.token) { R.playing = false; bar(); }
  }
  const jump = k => { R.playing = false; R.token++; step(Math.max(0, Math.min(R.states.length - 1, k)), false); };

  // ---------- 조작 막대 ----------
  function barEl() {
    let b = $id('replayBar'); if (b) return b;
    b = document.createElement('div'); b.id = 'replayBar';
    b.innerHTML = `<div class="rb-top"><b class="rb-title"></b><span class="rb-step"></span></div>
      <input type="range" class="rb-range" min="0" value="0">
      <div class="rb-btns">
        <button type="button" data-k="first" title="처음">⏮</button><button type="button" data-k="prev" title="이전 단계">◀</button>
        <button type="button" data-k="play" class="rb-play">▶ 재생</button>
        <button type="button" data-k="next" title="다음 단계">▶</button><button type="button" data-k="last" title="끝">⏭</button>
        <button type="button" data-k="speed" class="rb-speed"></button><button type="button" data-k="turn" title="다음 턴으로">다음 턴 ⏩</button>
        <button type="button" data-k="flip" title="위아래 시점 바꾸기">⇅ 시점</button><button type="button" data-k="exit" class="rb-exit">나가기</button>
      </div><div class="rb-note"></div>`;
    document.body.appendChild(b);
    b.querySelector('.rb-range').oninput = e => jump(Number(e.target.value));
    b.addEventListener('click', e => {
      const k = e.target.closest && e.target.closest('button') && e.target.closest('button').dataset.k; if (!k) return;
      if (k === 'first') jump(0); else if (k === 'last') jump(R.states.length - 1);
      else if (k === 'prev') jump(R.i - 1);
      else if (k === 'next') { R.playing = false; R.token++; step(R.i + 1, SPEEDS.find(x => x.k === R.speed).anim); }
      else if (k === 'play') play();
      else if (k === 'speed') { R.speed = R.speed % SPEEDS.length + 1; bar(); }
      else if (k === 'turn') { const t = R.states[R.i].turnNo; let j = R.i + 1; while (j < R.states.length - 1 && R.states[j].turnNo === t) j++; jump(j); }
      else if (k === 'flip') { R.seat = 1 - R.seat; applySeat(); draw(R.i); }
      else if (k === 'exit') goToMenu();
    });
    return b;
  }
  function bar() {
    const b = barEl(), last = R.states.length - 1, st = R.states[R.i];
    b.querySelector('.rb-title').textContent = `🎞 ${R.names[0]} vs ${R.names[1]}`;
    let stepTxt = `${R.i} / ${last} · ${st ? st.turnNo : 0}턴`;
    if (st && st.over) stepTxt += st.winner === null || st.winner === undefined ? ' · 무승부' : ` · 🏆 ${R.names[st.winner]} 승리${REASON[R.rep.reason] ? ` (${REASON[R.rep.reason]})` : ''}`;
    else if (R.labels[R.i]) stepTxt += ' · ' + R.labels[R.i];
    b.querySelector('.rb-step').textContent = stepTxt;
    const rg = b.querySelector('.rb-range'); rg.max = last; rg.value = R.i;
    b.querySelector('.rb-play').textContent = R.playing ? '⏸ 멈춤' : '▶ 재생';
    b.querySelector('.rb-speed').textContent = '속도: ' + SPEEDS.find(x => x.k === R.speed).label;
    b.querySelector('.rb-note').textContent = R.mismatch ? '⚠ 그 판 이후 카드·규칙이 바뀌어서 실제 판과 다르게 재생될 수 있어요 (중간에 멈출 수 있어요).' : '양쪽 손패가 모두 보여요 · 시점 버튼으로 위아래를 바꿀 수 있어요';
    b.classList.toggle('warn', R.mismatch);
  }

  // ---------- 열기 · 닫기 ----------
  async function open(matchId) {
    let data;
    try {
      const r = await fetch('/api/pvp/replays/' + encodeURIComponent(matchId), { credentials: 'same-origin' });
      if (r.status === 401) { location.replace('/login.html'); return; }
      data = await r.json(); if (!r.ok) { alertMsg(data.error || '리플레이를 불러오지 못했어요.'); return; }
    } catch (_) { alertMsg('서버에 연결할 수 없어요.'); return; }
    const rep = data.replay;
    R.rep = rep; R.matchId = matchId; R.mySeat = data.mySeat; R.seat = data.mySeat; R.names = (rep.names || ['플레이어 1', '플레이어 2']).slice();
    let b; try { b = build(rep); } catch (e) { console.error('[replay]', e); alertMsg('이 리플레이를 다시 만들지 못했어요. (그 판 이후 카드·규칙이 바뀌었을 수 있어요)'); return; }
    R.states = b.states; R.events = b.events; R.labels = b.labels; R.mismatch = b.bad || (rep.engine && typeof VERSION !== 'undefined' && rep.engine !== VERSION);
    R.i = 0; R.playing = false; R.token++; R.speed = 1;
    closeList();
    game = { key: 'pvp', mode: 'pvp', replay: true, bet: 0, tier: 0, cheats: [], pool: 0, settled: true, result: null, deckNames: (rep.decks[R.seat] || []).slice(), pvpTitle: '', pvpHTML: '' };
    R.game = game;
    $id('menu').classList.add('hidden'); $id('overlay').classList.remove('show'); $id('logList').innerHTML = '';
    document.body.classList.add('pvp-mode', 'pvp-replay');
    $id('verBadge').textContent = typeof VERSION !== 'undefined' ? VERSION : '';
    $id('diffBadge').textContent = `🎞 리플레이 · ${rep.friendly ? '친구 대전' : rep.ranked ? '랭크전' : '일반전'}`;
    applySeat();
    logLine(`🎞 리플레이: ${R.names[0]} vs ${R.names[1]} — 양쪽 손패가 모두 보여요.`);
    barEl().style.display = '';
    draw(0);
  }
  function exit() {
    R.playing = false; R.token++; R.game = null;
    const b = $id('replayBar'); if (b) b.style.display = 'none';
    document.body.classList.remove('pvp-mode', 'pvp-replay'); $id('aiHand').classList.remove('open');
    MY = 0; OPP = 1; document.querySelector('#playerHero .name').textContent = '나'; document.querySelector('#aiHero .name').textContent = '상대';
    const lb = document.querySelectorAll('.board > .row .label'); if (lb.length >= 2) { lb[0].textContent = '상대 필드'; lb[1].textContent = '내 필드'; }
    PvpClient.openScreen(); list();
  }

  // ---------- 지난 판 목록 ----------
  function alertMsg(t) { const p = $id('pvpMsg'); if (p && $id('screen-pvp').classList.contains('show')) { p.textContent = t; p.style.display = ''; } else alert(t); }
  function modal() {
    let box = $id('replayModal');
    if (!box) { box = document.createElement('div'); box.id = 'replayModal'; box.className = 'rank-modal'; box.onclick = e => { if (e.target === box) closeList(); }; document.body.appendChild(box); }
    return box;
  }
  function closeList() { const b = $id('replayModal'); if (b) b.classList.remove('show'); }
  const RES = { win: '<b class="rp-win">승</b>', lose: '<b class="rp-lose">패</b>', draw: '<b class="rp-draw">무</b>' };
  const when = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  async function list() {
    const box = modal();
    box.innerHTML = '<div class="rank-panel"><h3>🎞 지난 판 다시 보기</h3><p class="sub">불러오는 중…</p></div>'; box.classList.add('show');
    let r; try { r = await fetch('/api/pvp/replays', { credentials: 'same-origin', cache: 'no-store' }).then(x => x.json()); } catch (_) { r = null; }
    if (!r || !r.list) { box.querySelector('.sub').textContent = '목록을 불러오지 못했어요.'; return; }
    const rows = r.list.map(x => `<tr><td>${when(x.at)}</td><td>${esc(x.oppName)}</td><td>${x.friendly ? '👥 친구' : x.ranked ? '🏆 랭크' : '⚔ 일반'}</td><td>${RES[x.result] || ''}${REASON[x.reason] ? ` <small>${REASON[x.reason]}</small>` : ''}</td><td>${x.turns}턴</td>
      <td><button type="button" class="end-turn rp-go" data-id="${esc(x.matchId)}">▶ 보기</button></td></tr>`).join('');
    box.innerHTML = `<div class="rank-panel replay-panel"><h3>🎞 지난 판 다시 보기</h3><p class="sub">최근 유저 대전 ${PVP.REPLAY_KEEP}판까지 보관해요. 끝난 판이라 양쪽 손패가 모두 보여요.</p>
      <table class="rank-table"><tr><th>날짜</th><th>상대</th><th>모드</th><th>결과</th><th>길이</th><th></th></tr>${rows || '<tr><td colspan="6">아직 다시 볼 판이 없어요. 유저 대전을 한 판 해 보세요.</td></tr>'}</table>
      <button type="button" class="menu-btn back">닫기</button></div>`;
    box.querySelector('.back').onclick = closeList;
    box.querySelectorAll('.rp-go').forEach(b => b.onclick = () => { b.disabled = true; open(b.dataset.id).finally(() => { b.disabled = false; }); });
  }
  { const k = $id('pvpReplayKeep'); if (k) k.textContent = PVP.REPLAY_KEEP; }
  return { open, exit, list, _state: R };
})();
