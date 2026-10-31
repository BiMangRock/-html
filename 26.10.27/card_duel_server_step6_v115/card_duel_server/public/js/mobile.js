// mobile.js — 모바일용 보조: 전체화면 + 가로 고정 시도, 전투 기록 토글  (v115)
//  - 안드로이드 크롬: 전체화면에 들어가면 screen.orientation.lock('landscape') 로 화면이 자동으로 가로가 된다.
//  - 아이폰(Safari): 웹페이지는 전체화면·방향 고정 API 가 막혀 있다. → 세로로 들면 "가로로 돌려 주세요" 안내(CSS #rotateHint)만 뜬다.
//  - 홈 화면에 추가(PWA)로 열면 주소창 없이 열리고, manifest 의 orientation 이 안드로이드에서 가로로 고정해 준다.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const coarse = matchMedia('(pointer:coarse)').matches;
  const root = document.documentElement;
  const canFs = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let userExited = false;                       // 사용자가 직접 전체화면을 나갔으면 다시 강제로 들어가지 않는다

  async function lockLandscape() {
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
  }
  async function enterFs() {
    try {
      if (!isFs() && canFs) await (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' });
    } catch (_) {}
    if (isFs()) lockLandscape();
  }
  async function exitFs() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    try { if (isFs()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) {}
  }
  function syncBtn() {
    const b = $('fsBtn'); if (!b) return;
    b.classList.toggle('can', canFs);
    b.textContent = isFs() ? '⛶ 전체화면 끄기' : '⛶ 전체화면';
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    if (!isFs()) { userExited = true; try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (_) {} }
    syncBtn();
  }));

  // 버튼들
  const fsBtn = $('fsBtn');
  if (fsBtn) fsBtn.addEventListener('click', () => { if (isFs()) { userExited = true; exitFs(); } else { userExited = false; enterFs(); } });
  const rBtn = $('rotateFsBtn');
  if (rBtn) rBtn.addEventListener('click', () => { userExited = false; enterFs(); });

  // 터치 기기에서 첫 터치(게임 시작 버튼 등)에 자동으로 전체화면 + 가로 고정 시도 (브라우저는 사용자 터치 안에서만 허용)
  if (coarse && canFs) {
    const auto = e => {
      if (userExited || isFs()) return;
      if (e.target && e.target.closest && e.target.closest('#fsBtn')) return;
      enterFs();
    };
    document.addEventListener('pointerup', auto, { passive: true });
  }

  // 전투 기록 토글 (낮은 가로 화면에서만 보이는 📜 버튼)
  const lt = $('logToggle');
  if (lt) lt.addEventListener('click', () => document.body.classList.toggle('log-open'));

  syncBtn();
})();
