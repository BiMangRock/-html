// friends.js — v136 친구 화면 · 닉네임 · 친구 대전 신청 알림 · 관전 시작.  로드 순서: … → ui.js → pvpclient.js → friends.js
//  서버 API: /api/friends · /api/profile/nickname · /api/friends/{request,accept,decline,cancel,remove}
//  실시간 알림(친구 요청·대전 신청·v141 채팅)은 유저 대전 스트림으로 온다 → pvpclient.js 가 Friends.onMsg 로 넘겨 준다
//  v141 친구 채팅: /api/chat/:id · /api/chat/send · /api/chat/read. 채팅 창(#chatPanel)은 어느 화면에서나 열린다 (판 도중에도)
const Friends = (() => {
  'use strict';
  const J = { 'Content-Type': 'application/json' };
  const $id = id => document.getElementById(id);
  const S = { data: null, poll: null, invites: new Map(), sent: null, armed: null, chat: null };
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
    if (S.chat) chatHead();
  }
  const unreadTotal = () => S.data ? S.data.friends.reduce((a, f) => a + (f.unread || 0), 0) : 0;
  function badge() {
    const n = S.data ? S.data.incoming.length : 0, u = unreadTotal(), b = $id('friendBadge');
    if (b) { b.textContent = n + u > 99 ? '99+' : n + u; b.hidden = !(n + u); }
    const d = $id('friendMenuDesc');
    if (d && S.data) { const on = S.data.friends.filter(f => f.online).length; d.textContent = `친구 ${S.data.friends.length}명 · 접속 중 ${on}명${n ? ` · 받은 요청 ${n}개` : ''}${u ? ` · 💬 안 읽은 메시지 ${u}개` : ''}`; }
  }
  const STATE = { idle: '접속 중', queue: '대전 상대 찾는 중', spectate: '관전 중', match: '대전 중', offline: '오프라인' };
  const MODE = { normal: '일반전', rank: '랭크전', friend: '친구 대전' };
  const who = u => `<b>${esc(u.name)}</b>${u.nickname ? ` <small class="fr-id">@${esc(u.username)}</small>` : ''}`;
  function render() {
    const D = S.data; if (!D) return;
    $id('frMyId').textContent = D.me.username; $id('frMyName').textContent = D.me.name;
    $id('frNickForm').hidden = !!D.me.nickname;                     // v141 닉네임은 한 번 정하면 못 바꾼다
    $id('frNickNote').innerHTML = D.me.nickname ? '닉네임은 대전 상대·친구·순위표에 보이는 이름이에요. <b>닉네임은 바꿀 수 없어요.</b>'
      : '아직 닉네임이 없어서 아이디로 보여요. <b class="fr-warn">⚠ 한 번 정하면 바꿀 수 없어요.</b>';
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
      const btns = [`<button type="button" class="end-turn fr-chat" data-act="chat" data-id="${f.id}">💬 채팅${f.unread ? `<b class="fr-unread">${f.unread > 99 ? '99+' : f.unread}</b>` : ''}</button>`];
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
      else if (S.chat && S.chat.fid === id) closeChat();
      return load();
    }
    if (act === 'chat') { openChat(id); return; }
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
  let nickArmed = '';
  async function saveNick(nickname) {
    msg('');
    if (nickArmed !== nickname) { nickArmed = nickname; $id('frNickSave').textContent = `「${nickname}」 확정 (다시 누르기)`; msg('닉네임은 한 번 정하면 바꿀 수 없어요. 맞으면 버튼을 한 번 더 눌러 주세요.'); return; }
    nickArmed = ''; $id('frNickSave').textContent = '닉네임 정하기';
    const r = await call('PUT', '/api/profile/nickname', { nickname });
    if (!r.ok) { msg(r.data.error || '닉네임을 저장하지 못했어요.'); return; }
    msg(`닉네임을 「${r.data.me.nickname}」(으)로 정했어요.`, true);
    const gate = $id('nickGate'); if (gate) gate.remove();
    if (window.CURRENT_USER) Object.assign(window.CURRENT_USER, r.data.me);
    const un = document.querySelector('#userBar .uname'); if (un) un.textContent = '👤 ' + r.data.me.name;
    if (PvpClient._state) PvpClient._state.meName = r.data.me.name;
    load();
  }
  $id('frNickForm').onsubmit = e => { e.preventDefault(); const v = $id('frNick').value.trim(); if (!v) { msg('닉네임을 입력해 주세요.'); return; } saveNick(v); };
  $id('frNick').oninput = () => { nickArmed = ''; $id('frNickSave').textContent = '닉네임 정하기'; };

  function open() {
    showScreen('friends'); msg(''); render(); load(); PvpClient.open();
    clearInterval(S.poll); S.poll = setInterval(() => { if (shown()) load(); else { clearInterval(S.poll); S.poll = null; } }, 8000);
  }
  function close() { clearInterval(S.poll); S.poll = null; showScreen('main'); }

  // ---------- v141 친구 채팅 ----------
  const MAX_LEN = 300;
  const pad = n => String(n).padStart(2, '0');
  const hm = t => { const d = new Date(t); return `${d.getHours() < 12 ? '오전' : '오후'} ${(d.getHours() % 12) || 12}:${pad(d.getMinutes())}`; };
  const dayOf = t => { const d = new Date(t); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };
  function chatEls() {
    let p = $id('chatPanel');
    if (p) return p;
    p = document.createElement('div'); p.id = 'chatPanel'; p.hidden = true;
    p.innerHTML = `<div class="cp-head"><span class="cp-who"><b class="cp-name"></b><small class="cp-st"></small></span><button type="button" class="cp-x" title="닫기">✕</button></div>
      <div class="cp-body"><button type="button" class="cp-more" hidden>이전 메시지 더 보기</button><div class="cp-list"></div></div>
      <p class="cp-err" role="alert" hidden></p>
      <form class="cp-form" autocomplete="off"><textarea rows="1" maxlength="${MAX_LEN}" placeholder="메시지 입력" title="Enter 보내기 · Shift+Enter 줄바꿈"></textarea><button type="submit" class="end-turn">보내기</button></form>
      <div class="cp-count"></div>`;
    document.body.appendChild(p);
    p.querySelector('.cp-x').onclick = closeChat;
    p.querySelector('.cp-more').onclick = loadOlder;
    const ta = p.querySelector('textarea');
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; countLeft(); });
    p.querySelector('.cp-form').onsubmit = e => { e.preventDefault(); sendChat(); };
    // 판 화면의 끌기·단축키가 채팅 입력을 가로채지 않게
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'keyup', 'wheel']) p.addEventListener(ev, e => e.stopPropagation());
    return p;
  }
  function countLeft() {
    const p = chatEls(), n = [...p.querySelector('textarea').value].length;
    p.querySelector('.cp-count').textContent = n > MAX_LEN - 50 ? `${n} / ${MAX_LEN}` : '';
  }
  function chatErr(t) { const e = chatEls().querySelector('.cp-err'); e.textContent = t || ''; e.hidden = !t; }
  const chatOpen = () => !!(S.chat && !chatEls().hidden);
  function friendById(id) { return S.data && S.data.friends.find(f => f.id === id); }
  function chatHead() {
    const C = S.chat, p = chatEls(); if (!C) return;
    const f = friendById(C.fid) || C.friend || {};
    p.querySelector('.cp-name').textContent = f.name || C.name || '';
    const st = f.state || 'offline';
    p.querySelector('.cp-st').textContent = st === 'match' ? '대전 중' : STATE[st] || '';
    p.querySelector('.cp-st').className = 'cp-st ' + st;
  }
  function renderChat(keepScroll) {
    const C = S.chat; if (!C) return;
    const p = chatEls(), body = p.querySelector('.cp-body'), list = p.querySelector('.cp-list');
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    const oldH = body.scrollHeight, oldTop = body.scrollTop;
    p.querySelector('.cp-more').hidden = !C.more;
    let lastDay = '', html = '';
    const lastMine = [...C.msgs].reverse().find(m => m.from !== C.fid);
    if (!C.msgs.length) html = `<p class="cp-empty">${C.loading ? '불러오는 중…' : `${esc(C.name || '친구')}님에게 첫 메시지를 보내 보세요.`}</p>`;
    for (const m of C.msgs) {
      const day = dayOf(m.at); if (day !== lastDay) { html += `<div class="cp-day">${day}</div>`; lastDay = day; }
      const mine = m.from !== C.fid;
      const tail = mine && lastMine && m.id === lastMine.id && m.read ? '<span class="cp-read">읽음</span>' : '';
      html += `<div class="cp-msg${mine ? ' mine' : ''}${m.pending ? ' pending' : ''}"><div class="cp-bub">${esc(m.text)}</div><span class="cp-time">${tail}${m.pending ? '보내는 중…' : hm(m.at)}</span></div>`;
    }
    list.innerHTML = html;
    if (keepScroll === 'older') body.scrollTop = body.scrollHeight - oldH + oldTop;
    else if (keepScroll !== 'stay' || atBottom) body.scrollTop = body.scrollHeight;
  }
  function addMsg(m) {
    const C = S.chat; if (!C) return false;
    if (C.msgs.some(x => x.id === m.id)) return false;
    C.msgs.push(m); C.msgs.sort((a, b) => a.id - b.id);
    return true;
  }
  async function markRead() {
    const C = S.chat; if (!C || !chatOpen() || document.hidden) return;
    const last = [...C.msgs].reverse().find(m => m.from === C.fid && !m.read);
    if (!last) return;
    C.msgs.forEach(m => { if (m.from === C.fid) m.read = true; });
    const f = friendById(C.fid); if (f) { f.unread = 0; badge(); if (shown()) render(); }
    await call('POST', '/api/chat/read', { id: C.fid, upTo: last.id });
  }
  async function openChat(fid) {
    const f = friendById(fid);
    document.querySelectorAll(`.fr-toast[data-chat="${fid}"]`).forEach(t => t.remove());   // 이 친구의 메시지 알림은 치운다
    S.chat = { fid, name: f ? f.name : '', friend: f, msgs: [], more: false, loading: true };
    const p = chatEls(); p.hidden = false; chatErr(''); chatHead(); renderChat();
    document.body.classList.add('chat-open');
    const r = await call('GET', '/api/chat/' + fid);
    if (!S.chat || S.chat.fid !== fid) return;
    S.chat.loading = false;
    if (!r.ok) { chatErr(r.data.error || '대화를 불러오지 못했어요.'); renderChat(); return; }
    S.chat.name = r.data.friend.name; S.chat.friend = { ...r.data.friend, state: r.data.state };
    S.chat.more = r.data.more; r.data.messages.forEach(addMsg);
    chatHead(); renderChat(); markRead();
    if (matchMedia('(pointer:fine)').matches) p.querySelector('textarea').focus();
  }
  async function loadOlder() {
    const C = S.chat; if (!C || !C.msgs.length || C.loadingOlder) return;
    C.loadingOlder = true;
    const r = await call('GET', `/api/chat/${C.fid}?before=${C.msgs[0].id}`);
    C.loadingOlder = false;
    if (S.chat !== C || !r.ok) return;
    C.more = r.data.more; r.data.messages.forEach(addMsg); renderChat('older');
  }
  function closeChat() { S.chat = null; const p = $id('chatPanel'); if (p) p.hidden = true; document.body.classList.remove('chat-open'); }
  async function sendChat() {
    const C = S.chat; if (!C || C.sending) return;
    const ta = chatEls().querySelector('textarea'), text = ta.value.trim();
    if (!text) return;
    if ([...text].length > MAX_LEN) { chatErr(`메시지는 ${MAX_LEN}자까지예요.`); return; }
    C.sending = true; chatErr('');
    const tmp = { id: Number.MAX_SAFE_INTEGER, from: -1, to: C.fid, text, at: Date.now(), pending: true };
    C.msgs.push(tmp); ta.value = ''; ta.style.height = 'auto'; countLeft(); renderChat();
    const r = await call('POST', '/api/chat/send', { to: C.fid, text });
    C.sending = false;
    C.msgs = C.msgs.filter(m => m !== tmp);
    if (!r.ok) { chatErr(r.data.error || '메시지를 보내지 못했어요.'); if (!ta.value) ta.value = text; }
    else addMsg(r.data.msg);
    if (S.chat === C) renderChat();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) markRead(); });
  function onChat(m) {
    const other = m.mine ? m.msg.to : m.msg.from;
    if (S.chat && S.chat.fid === other) {
      if (addMsg(m.msg)) renderChat('stay');
      if (!m.mine) { if (chatOpen() && !document.hidden) markRead(); else bumpUnread(other); }
      return;
    }
    if (m.mine) return;
    bumpUnread(other);
    const t = toast(`<div class="ft-title">💬 <b>${esc(m.from.name)}</b></div><div class="ft-sub ft-chat">${esc(m.msg.text.length > 80 ? m.msg.text.slice(0, 80) + '…' : m.msg.text)}</div>
      <div class="ft-btns"><button type="button" class="end-turn">답장</button></div>`, 7000);
    t.dataset.chat = other;
    t.querySelector('button').onclick = () => { t.remove(); openChat(other); };
  }
  function bumpUnread(fid) {
    const f = friendById(fid);
    if (f) { f.unread = (f.unread || 0) + 1; badge(); if (shown()) render(); }
    else load();
  }
  function onChatRead(m) {
    if (m.self) { const f = friendById(m.friend); if (f) { f.unread = 0; badge(); if (shown()) render(); } return; }
    const C = S.chat; if (!C || C.fid !== m.by) return;
    C.msgs.forEach(x => { if (x.from !== C.fid && (!m.upTo || x.id <= m.upTo)) x.read = true; });
    renderChat('stay');
  }

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
    if (m.t === 'chat') return onChat(m);
    if (m.t === 'chatRead') return onChatRead(m);
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
      load().then(() => {                                           // 채팅 중인 친구가 나를 삭제했으면 창을 닫는다
        if (S.chat && S.data && !friendById(S.chat.fid)) { closeChat(); toast('<div class="ft-title">친구 목록에서 빠져서 대화를 닫았어요.</div>', 3000); }
        else if (S.chat) chatHead();
      });
      return;
    }
  }

  ServerStore.ready.then(load);
  setInterval(() => { if (!shown() && !$id('menu').classList.contains('hidden')) load(); }, 60000);   // 메뉴에 있으면 1분마다 배지 갱신
  return { open, close, load, onMsg, chat: openChat, closeChat, _state: S };
})();
