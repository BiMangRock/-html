// intro.js — v147 연출 두 가지
//   1) 로그인 직후 인트로: 칼이 날아와 「CARD BATTLE」 로고를 한 줄씩 써 내려가고, 번쩍! → 제작자 표시 → 메인 화면
//      · login.js 가 로그인 성공 때 sessionStorage 에 표시(cardDuel.intro)를 남기면, index.html 이 열릴 때 한 번만 재생
//      · 화면을 누르면 건너뜀. 그림을 못 받으면 조용히 건너뜀 (메인 화면을 막지 않는다)
//      · 이 파일은 index.html <body> 맨 위(#introSplash 바로 뒤)에서 읽는다 → 메뉴가 먼저 번쩍 보이지 않게
//   2) 유저 대전 「매칭 성공!」 화면: MatchIntro.play(info, ms, onReveal)
//      · pvpclient.js 의 handleMatch 가 부른다. 끝나기 0.5초 전에 onReveal()(판 화면 준비) → 덮개가 서서히 사라지며 판이 드러난다
//      · 서버는 이 시간만큼 멀리건 제한 시간을 늦게 시작한다 (PVP.INTRO_MS)
(() => {
  'use strict';
  const IMG = '/images/intro/';
  const FLAG = 'cardDuel.intro';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function loadImg(src, ms = 4000) {
    return new Promise(resolve => {
      const im = new Image(); let done = false;
      const end = ok => { if (!done) { done = true; resolve(ok ? im : null); } };
      setTimeout(() => end(false), ms);
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => end(true));
      im.onerror = () => end(false);
      im.src = src;
    });
  }

  // ======================= 1) 로그인 인트로 =======================
  const splash = document.getElementById('introSplash');
  let want = false;
  try { want = sessionStorage.getItem(FLAG) === '1'; sessionStorage.removeItem(FLAG); } catch (_) {}
  if (splash) { if (want) runSplash(splash); else splash.remove(); }

  async function runSplash(root) {
    root.classList.add('on');
    let skipped = false, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      root.classList.add('out');
      setTimeout(() => root.remove(), 600);
    };
    root.addEventListener('pointerdown', () => { skipped = true; finish(); });
    setTimeout(finish, 9000);                                      // 안전장치: 무슨 일이 있어도 9초 안에는 걷힌다

    const [sword, logo, slash] = await Promise.all(['sword.webp', 'logo.webp', 'slash.webp'].map(n => loadImg(IMG + n)));
    if (skipped) return;
    if (!sword || !logo) { finish(); return; }

    const stage = root.querySelector('.is-stage');
    const top = root.querySelector('.is-logo.top'), bot = root.querySelector('.is-logo.bot'), ghost = root.querySelector('.is-logo.ghost');
    [top, bot, ghost].forEach(e => { e.src = logo.src; });
    const sw = root.querySelector('.is-sword'), swImg = sw.querySelector('img'); swImg.src = sword.src;
    const spark = root.querySelector('.is-spark');
    const fx = root.querySelector('.is-slash'); if (slash) fx.src = slash.src;
    await wait(30);                                                // 크기가 잡힌 뒤에 위치를 잰다

    // --- 위치 계산 (로고 그림 안에서의 비율 → 화면 좌표) ---
    const R = ghost.getBoundingClientRect(), S = stage.getBoundingClientRect();
    const lx = R.left - S.left, ly = R.top - S.top, lw = R.width, lh = R.height;
    const P = (fx_, fy_) => ({ x: lx + lw * fx_, y: ly + lh * fy_ });
    const L1 = { y: 0.38, x0: 0.15, x1: 0.88 }, L2 = { y: 0.62, x0: 0.06, x1: 0.95 }, SPLIT = 0.495;
    // 칼: 그림 크기 500×700, 칼끝은 왼쪽 아래 (1, 697). 칼끝이 (x,y) 에 오도록 감싼 상자를 옮긴다
    const swH = Math.max(120, lh * 0.62), sc = swH / 700;
    swImg.style.height = swH + 'px';
    swImg.style.left = (-1 * sc) + 'px'; swImg.style.top = (-697 * sc) + 'px';
    const setSword = (x, y, rot = 0, s = 1, o = 1) => { sw.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg) scale(${s})`; sw.style.opacity = o; };
    const setSpark = (x, y, o) => { spark.style.transform = `translate(${x}px,${y}px)`; spark.style.opacity = o; };
    const clipTop = p => { top.style.clipPath = `inset(0 ${100 - p}% ${100 - SPLIT * 100}% 0)`; };
    const clipBot = p => { bot.style.clipPath = `inset(${SPLIT * 100}% ${100 - p}% 0 0)`; };
    clipTop(0); clipBot(0); setSword(S.width + 200, -200, 25, 1.6, 0); setSpark(0, 0, 0);

    // --- 시간표 (ms) ---
    const T = { in0: 250, in1: 750, w1: 1450, hop: 1620, w2: 2350, out: 2650, credit: 2800, end: 4400 };
    const ease = t => 1 - Math.pow(1 - t, 3), easeIn = t => t * t * t, lerp = (a, b, t) => a + (b - a) * t, cl = t => Math.max(0, Math.min(1, t));
    const a1 = P(L1.x0, L1.y), b1 = P(L1.x1, L1.y), a2 = P(L2.x0, L2.y), b2 = P(L2.x1, L2.y);
    const toPct = x => cl((x - lx) / lw) * 100;
    let boomed = false, credited = false;
    const t0 = performance.now();

    await new Promise(resolve => {
      function frame(now) {
        if (finished) return resolve();
        const t = now - t0;
        if (t < T.in0) {
          setSword(S.width + 200, -200, 25, 1.6, 0);
        } else if (t < T.in1) {                                     // 날아 들어오기 (오른쪽 위 → 첫 줄 시작점)
          const k = ease((t - T.in0) / (T.in1 - T.in0));
          setSword(lerp(S.width + 200, a1.x, k), lerp(-200, a1.y, k), lerp(25, 0, k), lerp(1.6, 1, k), cl(k * 3));
          if (k > 0.85) setSpark(a1.x, a1.y, 1);
        } else if (t < T.w1) {                                      // 첫 줄 쓰기 (CARD)
          const k = (t - T.in1) / (T.w1 - T.in1), x = lerp(a1.x, b1.x, k), y = a1.y + Math.sin(k * Math.PI * 6) * lh * 0.05;
          setSword(x, y, Math.sin(k * Math.PI * 6) * 6); setSpark(x, y, 1); clipTop(toPct(x));
        } else if (t < T.hop) {                                     // 다음 줄로 넘어가기
          const k = ease((t - T.w1) / (T.hop - T.w1)), x = lerp(b1.x, a2.x, k), y = lerp(b1.y, a2.y, k) - Math.sin(k * Math.PI) * lh * 0.12;
          clipTop(100); setSword(x, y, lerp(0, -8, k)); setSpark(x, y, 0.3);
        } else if (t < T.w2) {                                      // 둘째 줄 쓰기 (BATTLE)
          const k = (t - T.hop) / (T.w2 - T.hop), x = lerp(a2.x, b2.x, k), y = a2.y + Math.sin(k * Math.PI * 7) * lh * 0.05;
          setSword(x, y, Math.sin(k * Math.PI * 7) * 6 - 8 * (1 - k)); setSpark(x, y, 1); clipBot(toPct(x));
        } else if (t < T.out) {                                     // 칼이 휙 빠져나가고 번쩍!
          const k = easeIn((t - T.w2) / (T.out - T.w2));
          clipBot(100); setSword(lerp(b2.x, S.width + 260, k), lerp(b2.y, -260, k), lerp(0, -30, k), lerp(1, 1.4, k), 1 - k); setSpark(0, 0, 0);
          if (!boomed) { boomed = true; root.classList.add('boom'); }
        } else {
          setSword(S.width + 400, -400, 0, 1, 0);
          if (!credited && t >= T.credit) { credited = true; root.classList.add('credit'); }
          if (t >= T.end) { finish(); return resolve(); }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // ======================= 2) 매칭 성공 화면 =======================
  const MatchIntro = {
    // info: { me, opp, mode: '일반전'|'랭크전'|'친구 대전' }
    async play(info, ms, onReveal) {
      ms = Math.max(1200, Math.min(ms || 2500, 4000));
      const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; };
      const first = s => ([...String(s || '?').trim()][0] || '?').toUpperCase();
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const box = document.createElement('div');
      box.id = 'matchIntro';
      box.innerHTML = `
        <div class="mi-bg" style="background-image:url('${IMG}tavern.webp')"></div>
        <div class="mi-shade"></div>
        <div class="mi-title">매칭 성공!</div>
        <div class="mi-mode">${esc(info.mode || '')}</div>
        <div class="mi-row">
          <div class="mi-side me"><div class="mi-av" style="--ah:${hue(info.me)}">${esc(first(info.me))}</div><div class="mi-name">${esc(info.me)}</div></div>
          <div class="mi-vs"><img class="mi-fx" src="${IMG}slash.webp" alt=""><b>VS</b></div>
          <div class="mi-side opp"><div class="mi-av" style="--ah:${hue(info.opp)}">${esc(first(info.opp))}</div><div class="mi-name">${esc(info.opp)}</div></div>
        </div>
        <div class="mi-sub">곧 대전이 시작됩니다…</div>`;
      document.body.appendChild(box);
      requestAnimationFrame(() => box.classList.add('on'));
      setTimeout(() => box.classList.add('slam'), 450);
      await wait(ms - 500);
      try { onReveal && onReveal(); } catch (e) { console.error('[intro]', e); }
      box.classList.add('out');                                     // 0.5초 동안 서서히 사라지며 판 화면이 드러난다
      setTimeout(() => box.remove(), 600);
    },
  };
  window.MatchIntro = MatchIntro;
})();
