// friends.js — v136 친구 화면 · 닉네임 · 친구 대전 신청 알림 · 관전 시작.  로드 순서: … → ui.js → pvpclient.js → friends.js
//  서버 API: /api/friends · /api/profile/nickname · /api/friends/{request,accept,decline,cancel,remove}
//  실시간 알림(친구 요청·대전 신청)은 유저 대전 스트림으로 온다 → pvpclient.js 가 Friends.onMsg 로 넘겨 준다
const Friends = (() => {
  'use strict';
  const J = { 'Content-Type': 'application/json' };
  const $id = id => document.getElementById(id);
  const S = { data: null, poll: null, invites: new Map(), sent: null, armed: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const sec = ms => Math.max(0, Math.ceil(ms / 1000));

  async function call(method, url, body) {
    try {
      const r = await fetch(url, { method, headers: J, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { location.replace('/login.html'); await new Promise(() => {}); }
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
    } catch (_) { return { ok: false, status: 0, data: { error: '서버에 연결할 수 없어요.' } }; }
  }
  const shown = () => { const s = $id('screen-friends'); return !!(s && s.classList.contains('show')) && !$id('menu').classList.contains('hidden'); };
  function msg(t, good) { const p = $id('frMsg'); if (!p) return; p.textContent = t || ''; p.style.display = t ? '' : 'none'; p.classList.toggle('good', !!good); p.classList.toggle('warn', !good); }

  // ---------- 불러오기 · 그리기 ----------
  async function load() {
    const r = await call('GET', '/api/friends');
    if (!r.ok) { if (shown()) msg(r.data.error || '친구 목록을 불러오지 못했어요.'); return; }
    S.data = r.data; badge(); if (shown()) render();
  }
  function badge() {
    const n = S.data ? S.data.incoming.length : 0, b = $id('friendBadge');
    if (b) { b.textContent = n; b.hidden = !n; }
    const d = $id('friendMenuDesc');
    if (d && S.data) { const on = S.data.friends.filter(f => f.online).length; d.textContent = `친구 ${S.data.friends.length}명 · 접속 중 ${on}명${n ? ` · 받은 요청 ${n}개` : ''}`; }
  }
  const STATE = { idle: '접속 중', queue: '대전 상대 찾는 중', spectate: '관전 중', match: '대전 중', offline: '오프라인' };
  const MODE = { normal: '일반전', rank: '랭크전', friend: '친구 대전' };
  const who = u => `<b>${esc(u.name)}</b>${u.nickname ? ` <small class="fr-id">@${esc(u.username)}</small>` : ''}`;
  function render() {
    const D = S.data; if (!D) return;
    $id('frMyId').textContent = D.me.username; $id('frMyName').textContent = D.me.name;
    const nick = $id('frNick'); if (document.activeElement !== nick) nick.value = D.me.nickname || '';
    $id('frNickClear').disabled = !D.me.nickname;
    // 받은 요청
    $id('frIncomingSec').hidden = !D.incoming.length;
    $id('frIncoming').innerHTML = D.incoming.map(u => `<div class="fr-item"><span class="fr-who">${who(u)}</span><span class="fr-btns">
      <button type="button" class="end-turn" data-act="accept" data-id="${u.id}">수락</button><button type="button" class="end-turn sub" data-act="decline" data-id="${u.id}">거절</button></span></div>`).join('');
    // 보낸 요청
    $id('frOutgoingSec').hidden = !D.outgoing.length;
    $id('frOutgoing').innerHTML = D.outgoing.map(u => `<div class="fr-item"><span class="fr-who">${who(u)}</span><span class="fr-btns">
      <button type="button" class="end-turn sub" data-act="cancel" data-id="${u.id}">요청 취소</button></span></div>`).join('');
    // 친구
    $id('frCount').textContent = `${D.friends.length} / ${D.max}`;
    $id('frList').innerHTML = D.friends.length ? D.friends.map(f => {
      const st = f.state || 'offline', on = st !== 'offline';
      const label = st === 'match' ? `대전 중 · ${MODE[f.mode] || ''}${f.spectators ? ` · 👁 ${f.spectators}` : ''}` : STATE[st] || st;
      const sent = S.sent && S.sent.toId === f.id;
      const btns = [];
      if (st === 'match') btns.push(`<button type="button" class="end-turn" data-act="watch" data-id="${f.id}">👁 관전</button>`);
      else if (f.online) btns.push(sent ? `<button type="button" class="end-turn sub" data-act="uninvite">신청 취소 (${sec(S.sent.until - Date.now())})</button>`
                                         : `<button type="button" class="end-turn" data-act="invite" data-id="${f.id}">⚔ 대전 신청</button>`);
      btns.push(`<button type="button" class="end-turn sub fr-del${S.armed === f.id ? ' armed' : ''}" data-act="remove" data-id="${f.id}">${S.armed === f.id ? '정말 삭제?' : '삭제'}</button>`);
      return `<div class="fr-item${on ? ' on' : ''}"><span class="fr-dot ${st}"></span><span class="fr-who">${who(f)}<small class="fr-st">${esc(label)}</small></span><span class="fr-btns">${btns.join('')}</span></div>`;
    }).join('') : '<p class="fr-empty">아직 친구가 없어요. 위에서 아이디나 닉네임으로 친구 요청을 보내 보세요.</p>';
  }

  // ---------- 버튼 ----------
  async function onAct(act, id) {
    msg('');
    let r;
    if (act === 'accept' || act === 'decline' || act === 'cancel') {
      r = await call('POST', '/api/friends/' + act, { id });
      if (!r.ok) msg(r.data.error || '처리하지 못했어요.');
      else if (act === 'accept') msg(`${r.data.user.name}님과 친구가 되었어요!`, true);
      return load();
    }
    if (act === 'remove') {
      if (S.armed !== id) { S.armed = id; render(); setTimeout(() => { if (S.armed === id) { S.armed = null; render(); } }, 3000); return; }
      S.armed = null; r = await call('POST', '/api/friends/remove', { id });
      if (!r.ok) msg(r.data.error || '삭제하지 못했어요.');
      return load();
    }
    if (act === 'invite') { const e = await PvpClient.invite(id); if (e) msg(e); return; }
    if (act === 'uninvite') { await PvpClient.cancelInvite(); return; }
    if (act === 'watch') { const e = await PvpClient.spectate(id); if (e) { msg(e); load(); } return; }
  }
  $id('screen-friends').addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[data-act]'); if (!b) return; b.disabled = true; onAct(b.dataset.act, Number(b.dataset.id)).finally(() => { b.disabled = false; }); });
  $id('frAddForm').onsubmit = async e => {
    e.preventDefault(); const inp = $id('frAdd'), to = inp.value.trim(); if (!to) return;
    msg(''); const r = await call('POST', '/api/friends/request', { to });
    if (!r.ok) msg(r.data.error || '요청을 보내지 못했어요.');
    else { inp.value = ''; msg(r.data.status === 'accepted' ? `${r.data.user.name}님도 요청을 보냈었어요. 바로 친구가 되었어요!` : `${r.data.user.name}님에게 친구 요청을 보냈어요.`, true); }
    load();
  };
  async function saveNick(nickname) {
    msg(''); const r = await call('PUT', '/api/profile/nickname', { nickname });
    if (!r.ok) { msg(r.data.error || '닉네임을 저장하지 못했어요.'); return; }
    msg(r.data.me.nickname ? `닉네임을 「${r.data.me.nickname}」(으)로 정했어요.` : '닉네임을 지웠어요. 이제 아이디로 보여요.', true);
    if (window.CURRENT_USER) Object.assign(window.CURRENT_USER, r.data.me);
    const un = document.querySelector('#userBar .uname'); if (un) un.textContent = '👤 ' + r.data.me.name;
    if (PvpClient._state) PvpClient._state.meName = r.data.me.name;
    load();
  }
  $id('frNickForm').onsubmit = e => { e.preventDefault(); const v = $id('frNick').value.trim(); if (!v) { msg('닉네임을 입력해 주세요.'); return; } saveNick(v); };
  $id('frNickClear').onclick = () => saveNick(null);

  function open() {
    showScreen('friends'); msg(''); render(); load(); PvpClient.open();
    clearInterval(S.poll); S.poll = setInterval(() => { if (shown()) load(); else { clearInterval(S.poll); S.poll = null; } }, 8000);
  }
  function close() { clearInterval(S.poll); S.poll = null; showScreen('main'); }

  // ---------- 알림 (오른쪽 위) ----------
  function toastBox() { let b = $id('frToasts'); if (!b) { b = document.createElement('div'); b.id = 'frToasts'; document.body.appendChild(b); } return b; }
  function toast(html, ms = 4000) {
    const t = document.createElement('div'); t.className = 'fr-toast'; t.innerHTML = html; toastBox().appendChild(t);
    if (ms) setTimeout(() => t.remove(), ms);
    return t;
  }
  // 지금 AI 대전·모험 판을 하는 중인지 (그 판을 버리고 친구 대전을 시작하지 않도록)
  const busyInGame = () => typeof game !== 'undefined' && game && game.mode !== 'pvp' && typeof view !== 'undefined' && view && !view.over && $id('menu').classList.contains('hidden');
  function showInvite(m) {
    if (S.invites.has(m.id)) S.invites.get(m.id).el.remove();
    const until = Date.now() + (m.remainMs || 0);
    const el = toast(`<div class="ft-title">⚔ <b>${esc(m.from.name)}</b>님이 친구 대전을 신청했어요</div><div class="ft-sub"></div>
      <div class="ft-btns"><button type="button" class="end-turn" data-v="1">수락</button><button type="button" class="end-turn sub" data-v="0">거절</button></div>`, 0);
    el.classList.add('invite');
    const iv = { id: m.id, until, el, from: m.from };
    S.invites.set(m.id, iv);
    el.querySelectorAll('button').forEach(b => b.onclick = async () => {
      const accept = b.dataset.v === '1';
      if (accept && busyInGame()) { iv.note = '지금 하는 판을 끝낸 뒤에 수락할 수 있어요.'; tickInvites(); return; }
      el.querySelectorAll('button').forEach(x => { x.disabled = true; });
      const e = await PvpClient.respondInvite(m.id, accept);
      if (e) { iv.note = e; tickInvites(); el.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
    });
    tickInvites();
  }
  function tickInvites() {
    const now = Date.now();
    for (const iv of S.invites.values()) {
      const left = iv.until - now; const sub = iv.el.querySelector('.ft-sub');
      if (left <= 0) { iv.el.remove(); S.invites.delete(iv.id); continue; }
      sub.textContent = `${iv.note ? iv.note + ' · ' : ''}${sec(left)}초 안에 답해 주세요${iv.note ? '' : ' · 골드·랭크 변동 없는 연습 대전'}`;
    }
    if (S.sent) {
      const left = S.sent.until - now;
      if (left <= 0) { S.sent.el.remove(); S.sent = null; if (shown()) render(); }
      else { S.sent.el.querySelector('.ft-sub').textContent = `수락을 기다리는 중… ${sec(left)}초`; if (shown()) { const b = document.querySelector('#frList button[data-act="uninvite"]'); if (b) b.textContent = `신청 취소 (${sec(left)})`; } }
    }
  }
  setInterval(tickInvites, 500);
  const GONE = { declined: '님이 대전 신청을 거절했어요.', expired: '님이 답하지 않아 신청이 끝났어요.', busy: '님이 다른 대전을 시작했어요.', offline: '님의 연결이 끊겼어요.', cancelled: '' };
  function onMsg(m) {
    if (m.t === 'invite') showInvite(m);
    else if (m.t === 'inviteSent') {
      if (S.sent) S.sent.el.remove();
      const el = toast(`<div class="ft-title">⚔ <b>${esc(m.to.name)}</b>님에게 친구 대전 신청</div><div class="ft-sub"></div><div class="ft-btns"><button type="button" class="end-turn sub">취소</button></div>`, 0);
      el.querySelector('button').onclick = () => PvpClient.cancelInvite();
      S.sent = { id: m.id, toId: m.to.id, until: Date.now() + (m.remainMs || 0), el };
      tickInvites(); if (shown()) render();
    } else if (m.t === 'inviteGone') {
      const iv = S.invites.get(m.id); if (iv) { iv.el.remove(); S.invites.delete(m.id); }
      if (S.sent && S.sent.id === m.id) { S.sent.el.remove(); S.sent = null; if (shown()) render(); }
      if (m.mine && GONE[m.why]) toast(`<div class="ft-title">${esc(m.name)}${GONE[m.why]}</div>`);
      if (!m.mine && m.why === 'cancelled') toast(`<div class="ft-title">${esc(m.name)}님이 대전 신청을 취소했어요.</div>`, 2500);
    } else if (m.t === 'friends') {
      if (m.why === 'request') toast(`<div class="ft-title">📩 <b>${esc(m.name)}</b>님이 친구 요청을 보냈어요</div><div class="ft-btns"><button type="button" class="end-turn sub">친구 화면</button></div>`, 6000)
        .querySelector('button').onclick = e => { e.target.closest('.fr-toast').remove(); if ($id('menu').classList.contains('hidden')) return; open(); };
      else if (m.why === 'accepted') toast(`<div class="ft-title">🤝 <b>${esc(m.name)}</b>님과 친구가 되었어요!</div>`);
      load();
    }
  }

  ServerStore.ready.then(load);
  setInterval(() => { if (!shown() && !$id('menu').classList.contains('hidden')) load(); }, 60000);   // 메뉴에 있으면 1분마다 배지 갱신
  return { open, close, load, onMsg, _state: S };
})();
