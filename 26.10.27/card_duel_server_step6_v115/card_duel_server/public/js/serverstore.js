// serverstore.js — 골드 · 내 덱 · 모험 클리어 기록을 서버(내 계정)에 저장한다. (3단계)
//  - 게임이 시작되기 전에 /api/save 로 한 번 불러와서 메모리에 둔다. 게임 코드는 이전처럼 "동기"로 읽고 쓴다.
//  - 바뀐 값은 바로 서버로 보낸다(순서대로, 같은 종류가 밀려 있으면 최신 값만). 네트워크가 끊기면 3초마다 다시 시도한다.
//  - 골드는 저장 번호(rev)로 다른 기기/탭과의 충돌을 감지한다. 충돌하면 이 탭의 저장을 멈추고 새로고침을 안내한다.
//  - 로드 순서: economy.js 다음, ui.js 앞.  ui.js 는 ServerStore.ready 가 끝난 뒤에 시작한다.
(() => {
  'use strict';
  const S = { wallet: null, deck: null, cleared: {}, collection: {}, locked: false, isAdmin: false, bosses: null };
  window.ServerStore = S;

  let rev = 0, lastSnap = '', running = false;
  const pending = { wallet: null, deck: null, clears: new Set(), bosses: undefined };   // bosses: undefined=보낼 것 없음 / null=기본값으로 되돌리기 / 배열=저장
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const J = { 'Content-Type': 'application/json' };

  // ---------- 화면에 알림 ----------
  function box(id, css) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; el.style.cssText = css; document.body.appendChild(el); }
    return el;
  }
  const BANNER_CSS = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99999;max-width:92vw;padding:8px 14px;border-radius:8px;font:14px/1.4 sans-serif;color:#fff;box-shadow:0 2px 10px #0008;display:none';
  function banner(text, bad) {
    const el = box('saveBanner', BANNER_CSS);
    if (!text) { el.style.display = 'none'; return; }
    el.textContent = text; el.style.background = bad ? '#b3261e' : '#8a6d00'; el.style.display = 'block';
    if (bad) { const b = document.createElement('button'); b.textContent = '새로고침'; b.style.cssText = 'margin-left:10px;padding:3px 10px;cursor:pointer'; b.onclick = () => location.reload(); el.appendChild(b); }
  }
  const OVERLAY_CSS = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:#10131a;color:#dfe3ee;font:16px/1.5 sans-serif;text-align:center;padding:20px';
  const overlay = text => { const el = box('saveOverlay', OVERLAY_CSS); el.textContent = text; el.style.display = 'flex'; };
  const overlayOff = () => { const el = document.getElementById('saveOverlay'); if (el) el.remove(); };

  // ---------- 서버로 보내기 ----------
  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: J, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', keepalive: true });
    if (r.status === 401) { location.replace('/login.html'); throw new Error('로그인 필요'); }
    return { status: r.status, ok: r.ok, data: await r.json().catch(() => ({})) };
  }
  // 반환: 'ok' | 'retry'(잠시 뒤 재시도) | 'drop'(서버가 거부 — 다시 보내도 소용없음) | 'conflict'
  async function send(job) {
    let res;
    try {
      if (job.k === 'wallet') res = await call('PUT', '/api/wallet', { ...job.v, rev });
      else if (job.k === 'deck') res = await call('PUT', '/api/deck', { deck: job.v });
      else if (job.k === 'bosses') res = await call('PUT', '/api/bosses', { bosses: job.v });
      else res = await call('POST', '/api/adventure/clear', { bossId: job.v });
    } catch (e) { return 'retry'; }
    if (res.ok) { if (job.k === 'wallet' && res.data.wallet) rev = res.data.wallet.rev; return 'ok'; }
    if (res.status === 409) return 'conflict';
    if (res.status >= 500 || res.status === 429) return 'retry';
    console.warn('저장 거부됨:', job.k, res.status, res.data && res.data.error);
    banner('⚠ 저장이 거부되었어요: ' + ((res.data && res.data.error) || res.status), false);
    if (job.k === 'bosses') bossMsg('⚠ 저장 거부: ' + ((res.data && res.data.error) || res.status));
    return 'drop';
  }
  async function flush() {
    if (running || S.locked) return;
    running = true;
    let warned = false;                                // 재시도 알림을 띄웠는지
    try {
      for (;;) {
        let job = null;
        if (pending.wallet) job = { k: 'wallet', v: pending.wallet };
        else if (pending.deck) job = { k: 'deck', v: pending.deck };
        else if (pending.bosses !== undefined) job = { k: 'bosses', v: pending.bosses };
        else if (pending.clears.size) job = { k: 'clear', v: pending.clears.values().next().value };
        if (!job) break;
        const r = await send(job);
        if (r === 'retry') {
          warned = true;
          banner('⚠ 서버에 저장하지 못했어요. 다시 시도하는 중… (이 창을 닫으면 최근 변경이 사라질 수 있어요)', false);
          await sleep(3000); continue;
        }
        if (r === 'conflict') {
          S.locked = true;
          banner('⚠ 다른 기기나 탭에서 먼저 저장되었어요. 이 화면의 변경은 저장되지 않으니 새로고침해 주세요.', true);
          return;
        }
        if (job.k === 'wallet') { if (pending.wallet === job.v) pending.wallet = null; }
        else if (job.k === 'deck') { if (pending.deck === job.v) pending.deck = null; }
        else if (job.k === 'bosses') { if (pending.bosses === job.v) pending.bosses = undefined; if (r === 'ok') bossMsg('✔ 서버에 저장됨 (' + new Date().toLocaleTimeString() + ')'); }
        else pending.clears.delete(job.v);
      }
      if (warned) banner(null);                        // 재시도 끝에 다 저장됐으면 알림 지우기
    } finally { running = false; }
  }

  // ---------- 게임 코드가 쓰는 함수 ----------
  const strip = w => ({ gold: w.gold, pool: w.pool, poolDay: w.poolDay, bet: w.bet });
  S.getDeck = () => S.deck;
  S.setDeck = list => { S.deck = list.slice(); pending.deck = S.deck; flush(); };
  S.owned = name => S.collection[name] || 0;       // 내가 가진 카드 장수 (4단계)
  S.hasCleared = id => !!S.cleared[id];
  S.markCleared = id => { if (!S.cleared[id]) S.cleared[id] = Date.now(); pending.clears.add(id); flush(); };
  // 보스 목록 (v116): 읽기는 메모리, 쓰기는 개발자만 서버로 (서버가 한 번 더 권한·덱을 검사한다)
  S.onBossMsg = null;
  const bossMsg = t => { if (S.onBossMsg) S.onBossMsg(t); };
  S.setBosses = list => { if (!S.isAdmin) return; S.bosses = list === null ? null : list.slice(); pending.bosses = S.bosses; bossMsg('저장 중…'); flush(); };
  S.flushNow = flush;

  // Economy 에 꽂는 저장소: 읽기는 메모리, 쓰기는 서버로
  const walletStore = {
    read() { return S.wallet; },
    write(save) {
      if (S.locked) return;
      const w = strip(save), snap = JSON.stringify(w);
      if (snap === lastSnap) return;                 // 달라진 게 없으면 안 보냄
      lastSnap = snap; S.wallet = w; pending.wallet = w; flush();
    },
  };

  // ---------- 상점 (5단계) ----------
  // 팩 개봉은 서버가 전부 처리한다(난수·골드 차감·카드 지급). 여기서는 요청을 보내고 결과를 메모리에 반영만 한다.
  // 보내기 전에 밀려 있는 골드 저장을 먼저 끝내서, 서버가 "내가 아는 최신 골드(rev)" 기준으로 계산하게 한다.
  S.shopBusy = false;
  async function waitWalletSaved() {
    const t0 = Date.now();
    while (!S.locked && (running || pending.wallet)) {
      if (Date.now() - t0 > 15000) return false;
      if (!running) flush();
      await sleep(60);
    }
    return !S.locked;
  }
  // ---------- 유저 대전 (6단계) ----------
  // 대전은 서버에 저장된 내 덱으로 하므로, 밀려 있는 저장이 모두 끝날 때까지 기다린다. 반환: 저장 완료 여부
  S.waitSaved = async () => {
    const t0 = Date.now();
    while (!S.locked && (running || pending.wallet || pending.deck || pending.clears.size || pending.bosses !== undefined)) {
      if (Date.now() - t0 > 15000) return false;
      if (!running) flush();
      await sleep(60);
    }
    return !S.locked;
  };
  // 판이 끝나 서버가 지갑에 직접 넣은 보상: 새 저장 번호(rev)로 이어서 쓴다 (다시 보내지 않는다)
  S.adoptWallet = w => {
    if (!w || !Number.isInteger(w.rev)) return;
    rev = w.rev; S.wallet = strip(w); lastSnap = JSON.stringify(S.wallet);
    Economy.set({ ...Economy.get(), gold: w.gold, pool: w.pool, poolDay: w.poolDay, bet: w.bet });
  };
  S.loadShop = async () => {                         // 상점 화면용 정보 (확률·천장 진행도·최근 기록). 실패하면 null
    try { const r = await call('GET', '/api/shop'); return r.ok ? r.data : null; } catch (e) { return null; }
  };
  // 반환: {ok:true, packs, spent, refund, wallet, collection, pity, opened} | {ok:false, error}
  S.openPacks = async count => {
    if (S.shopBusy) return { ok: false, error: '처리 중이에요. 잠시만 기다려 주세요.' };
    if (S.locked) return { ok: false, error: '다른 기기나 탭에서 먼저 저장되었어요. 새로고침해 주세요.' };
    S.shopBusy = true;
    try {
      if (!(await waitWalletSaved())) return { ok: false, error: S.locked ? '다른 기기나 탭에서 먼저 저장되었어요. 새로고침해 주세요.' : '골드 저장이 아직 끝나지 않았어요. 잠시 뒤 다시 시도해 주세요.' };
      let res;
      try { res = await call('POST', '/api/shop/open', { count, rev }); }
      catch (e) { return { ok: false, error: '서버에 연결할 수 없어요. 골드가 이미 차감됐을 수 있으니 새로고침해서 확인해 주세요.' }; }
      if (res.status === 409) {
        S.locked = true; banner('⚠ 다른 기기나 탭에서 먼저 저장되었어요. 이 화면의 변경은 저장되지 않으니 새로고침해 주세요.', true);
        return { ok: false, error: '다른 기기나 탭에서 먼저 저장되었어요. 새로고침해 주세요.' };
      }
      if (!res.ok) return { ok: false, error: (res.data && res.data.error) || '팩을 열지 못했어요.' };
      const d = res.data;
      rev = d.wallet.rev; S.wallet = strip(d.wallet); lastSnap = JSON.stringify(S.wallet);   // 서버가 이미 저장한 값이므로 다시 보내지 않는다
      S.collection = d.collection || S.collection;
      Economy.set({ ...Economy.get(), gold: d.wallet.gold });
      return { ok: true, ...d };
    } finally { S.shopBusy = false; }
  };

  // ---------- 시작: 서버에서 불러오기 ----------
  S.ready = (async () => {
    overlay('불러오는 중…');
    for (;;) {
      try {
        const r = await fetch('/api/save', { credentials: 'same-origin', cache: 'no-store' });
        if (r.status === 401) { location.replace('/login.html'); await new Promise(() => {}); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        S.wallet = strip(d.wallet); rev = d.wallet.rev; lastSnap = JSON.stringify(S.wallet);
        S.deck = Array.isArray(d.deck) ? d.deck : null;
        S.cleared = (d.adventure && d.adventure.cleared) || {};
        S.collection = d.collection || {};
        S.isAdmin = !!d.isAdmin; S.bosses = Array.isArray(d.bosses) ? d.bosses : null;
        Economy.useStore(walletStore);
        overlayOff();
        return;
      } catch (e) {
        overlay('서버에 연결할 수 없어요. 다시 시도하는 중…');
        await sleep(3000);
      }
    }
  })();

  window.addEventListener('beforeunload', e => {     // 아직 못 보낸 변경이 있으면 닫기 전에 경고
    if (pending.wallet || pending.deck || pending.clears.size) { e.preventDefault(); e.returnValue = ''; }
  });
})();
