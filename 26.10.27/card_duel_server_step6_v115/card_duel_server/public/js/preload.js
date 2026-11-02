// preload.js — v138 게임 이미지 미리 불러오기 (프리로딩)
//
//   카드를 낼 때마다 그림을 그때그때 받아 오면 첫 등장 때 멈칫한다(다운로드 + 디코딩).
//   그래서 판을 시작하기 전에 게임에 나올 수 있는 그림을 전부 new Image() 로 받아 두고(Promise.all),
//   100% 끝나야 게임 화면을 연다. 받은 Image 객체는 여기 붙잡아 두므로 브라우저 메모리 캐시에 그대로 남는다
//   → 판 안에서는 같은 주소를 쓰는 <img>/background-image 가 네트워크 없이 바로 뜬다.
//
//   한 번 받은 그림은 이 탭이 열려 있는 동안 다시 받지 않는다 (두 번째 판부터는 로딩 화면이 아예 안 뜬다).
//   서버는 /images 를 7일 캐시로 보내므로(server/index.js) 새로고침·다음 접속 때도 디스크 캐시에서 바로 나온다.
//
//   쓰는 곳: ui.js startGame / startBoss / startTest · pvpclient.js 대기열·친구 대전·관전 · replay.js
//   API:
//     Preload.ensure()        → Promise. 필요한 그림이 다 받아질 때까지 로딩 화면을 띄우고 기다린다 (이미 다 있으면 즉시)
//     Preload.warmup()        → 로딩 화면 없이 뒤에서 조용히 받아 두기 (메뉴에 있는 동안)
//     Preload.isReady()       → 지금 모든 그림이 준비됐는지
const Preload = (() => {
  const TIMEOUT_MS = 20000;        // 그림 한 장이 이 시간 안에 안 오면 포기하고 넘어간다 (로딩 화면에 영원히 갇히지 않게)
  const MIN_SHOW_MS = 350;         // 로딩 화면이 번쩍하고 사라지지 않게 최소 표시 시간
  const done = new Map();          // 절대 URL → Promise<boolean>  (한 번 시작한 그림은 다시 요청하지 않는다)
  const ok = new Set();            // 다 받아진 절대 URL
  const keep = [];                 // Image 객체를 붙잡아 둬서 메모리 캐시에서 밀려나지 않게
  let busy = null;                 // 진행 중인 ensure() (여러 번 눌러도 한 번만)

  const abs = u => { try { return new URL(u, location.href).href; } catch (_) { return null; } };
  const isImg = s => typeof s === 'string' && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(s);

  // ---------- 게임에 나올 수 있는 그림 목록 ----------
  //   카드 그림(전체 카드 풀 — 발견·변신·무작위 생성으로 덱에 없는 카드도 나올 수 있으므로) + 이펙트 + 판 화면 UI + 보스 초상화
  function gameImages() {
    const s = new Set(), add = u => { if (isImg(u)) s.add(u.replace(/^\/+/, '')); };
    try { if (typeof CARD_ART !== 'undefined') Object.values(CARD_ART).forEach(add); } catch (_) {}
    try { if (typeof CARD_POOL !== 'undefined') CARD_POOL.forEach(c => add(c && c.art)); } catch (_) {}
    try { if (typeof FX_DIM !== 'undefined') Object.keys(FX_DIM).forEach(n => add('images/fx_' + n + '.png')); } catch (_) {}
    try { if (typeof FX_ANIM !== 'undefined') Object.keys(FX_ANIM).forEach(n => add('images/fx_a_' + n + '.png')); } catch (_) {}
    try { if (typeof BossBook !== 'undefined') (BossBook.get() || []).forEach(b => { add(b && b.icon); (b && b.deck || []).forEach(n => { const c = typeof cardByName === 'function' && cardByName(n); if (c) add(c.art); }); }); } catch (_) {}
    // 판 화면에서 CSS·HTML 로 쓰는 그림 (style.css · index.html)
    ['fx_frozen.png', 'fx_holy_shield.png', 'fx_stealth.png', 'fx_taunt.png', 'stat_atk.webp', 'stat_hp.webp', 'deck_pile.webp',
     'pvp/pvp_table.webp', 'pvp/avatar_frame.webp', 'pvp/timer_opp.webp', 'pvp/timer_mine.webp', 'pvp/timer_low.webp', 'pvp/rope.webp', 'pvp/rope_tile.webp', 'intro/tavern.webp', 'intro/slash.webp']
      .forEach(n => add('images/' + n));
    return [...s];
  }

  // ---------- 한 장 받기 ----------
  function loadOne(url) {
    const key = abs(url); if (!key) return Promise.resolve(false);
    if (done.has(key)) return done.get(key);
    const p = new Promise(resolve => {
      const im = new Image();
      let finished = false;
      const end = good => {
        if (finished) return; finished = true; clearTimeout(t);
        if (good) ok.add(key); else done.delete(key);          // 실패한 그림은 다음 판 때 다시 시도
        resolve(good);
      };
      const t = setTimeout(() => end(false), TIMEOUT_MS);
      im.decoding = 'async';
      im.onload = () => {
        // decode() 까지 해 두면 처음 화면에 그릴 때 생기는 디코딩 멈칫도 없앤다
        const d = im.decode ? im.decode().catch(() => {}) : Promise.resolve();
        d.then(() => end(true));
      };
      im.onerror = () => { console.warn('[preload] 그림을 못 불러왔어요:', url); end(false); };
      im.src = url;
      keep.push(im);
    });
    done.set(key, p);
    return p;
  }

  // 목록 전체를 Promise.all 로 받는다. 한 장 끝날 때마다 onProgress(끝난 수, 전체 수)
  function loadAll(urls, onProgress) {
    let n = 0; const total = urls.length;
    if (onProgress) onProgress(0, total);
    return Promise.all(urls.map(u => loadOne(u).then(r => { n++; if (onProgress) onProgress(n, total); return r; })));
  }

  const pending = () => gameImages().filter(u => !ok.has(abs(u)));
  const isReady = () => pending().length === 0;

  // ---------- 로딩 화면 ----------
  let box = null;
  function ui() {
    if (box) return box;
    box = document.createElement('div'); box.id = 'loadScreen';
    box.innerHTML = '<div class="ld-card"><div class="ld-title">게임 로딩 중</div>'
      + '<div class="ld-bar"><i></i></div><div class="ld-pct">0%</div><div class="ld-sub">카드 그림을 미리 불러오고 있어요. 첫 판만 조금 기다리면 다음 판부터는 바로 시작돼요.</div></div>';
    document.body.appendChild(box);
    return box;
  }
  function setProgress(n, total) {
    const b = ui(), pct = total ? Math.floor(n * 100 / total) : 100;
    b.querySelector('.ld-bar i').style.width = pct + '%';
    b.querySelector('.ld-pct').textContent = `${pct}%  (${n} / ${total})`;
  }

  // 필요한 그림이 전부 준비될 때까지 기다린다. 이미 다 있으면 로딩 화면 없이 바로 끝난다.
  function ensure() {
    if (busy) return busy;
    const list = gameImages();
    const todo = list.filter(u => !ok.has(abs(u)));
    if (!todo.length) return Promise.resolve();
    const base = list.length - todo.length;                     // 뒤에서 미리 받아 둔 만큼은 이미 채워진 상태로 시작
    const b = ui(), t0 = Date.now();
    setProgress(base, list.length); b.classList.add('show');
    busy = loadAll(todo, n => setProgress(base + n, list.length))
      .then(r => {
        const failed = r.filter(x => !x).length;
        if (failed) console.warn(`[preload] ${failed}장은 못 불러왔어요 — 게임은 그대로 시작하고, 그 그림은 필요할 때 다시 받아요.`);
        return new Promise(res => setTimeout(res, Math.max(0, MIN_SHOW_MS - (Date.now() - t0))));
      })
      .finally(() => { b.classList.remove('show'); busy = null; });
    return busy;
  }

  // 메뉴에 있는 동안 뒤에서 조용히 받아 두기 (데이터 절약 모드면 하지 않는다 → 그때는 판 시작 때 받는다)
  function warmup() {
    try { const c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return; } catch (_) {}
    const go = () => { const todo = pending(); if (todo.length) loadAll(todo); };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
  }

  return { ensure, warmup, isReady, gameImages, loadAll };
})();
