// auth.js — 게임 화면(index.html)용: 로그인 확인 + 메뉴 오른쪽 위에 사용자 이름/로그아웃 표시
// (골드 칩 옆 #userBar. 메뉴 화면 안에 있어서 게임이 시작되면 같이 가려진다)
// 서버가 이미 로그인 안 한 사람을 로그인 화면으로 보내지만, 세션이 만료된 채 열려 있는 경우를 위해 한 번 더 확인한다.
// v141 닉네임이 없는 옛 계정이면 닉네임을 정하는 창을 띄운다 (한 번 정하면 바꿀 수 없다)
(() => {
  window.CURRENT_USER = null;
  const setName = n => { const el = document.querySelector('#userBar .uname'); if (el) el.textContent = '👤 ' + n; };

  function askNickname(user) {
    const box = document.createElement('div');
    box.id = 'nickGate';
    box.innerHTML = `<form class="ng-panel" autocomplete="off">
      <h3>닉네임 정하기</h3>
      <p>닉네임은 대전 상대·친구·순위표에 보이는 이름이에요. 지금은 아이디 <b></b> 로 보이고 있어요.</p>
      <input maxlength="12" placeholder="2~12자 · 한글·영문·숫자·_" required>
      <p class="ng-warn">⚠ 닉네임은 한 번 정하면 바꿀 수 없어요.</p>
      <p class="ng-err" role="alert"></p>
      <button type="submit" class="end-turn">이 닉네임으로 정하기</button>
    </form>`;
    box.querySelector('b').textContent = user.username;
    document.body.appendChild(box);
    const form = box.querySelector('form'), inp = box.querySelector('input'), err = box.querySelector('.ng-err'), btn = box.querySelector('button');
    let armed = '';
    setTimeout(() => inp.focus(), 50);
    inp.oninput = () => { armed = ''; btn.textContent = '이 닉네임으로 정하기'; err.textContent = ''; };
    form.onsubmit = async e => {
      e.preventDefault();
      const nickname = inp.value.trim();
      if (!/^[A-Za-z0-9_가-힣]{2,12}$/.test(nickname)) { err.textContent = '닉네임은 2~12자의 한글·영문·숫자·밑줄(_)만 쓸 수 있어요.'; return; }
      if (armed !== nickname) { armed = nickname; btn.textContent = `「${nickname}」 확정 (다시 누르기)`; err.textContent = ''; return; }
      btn.disabled = true;
      try {
        const r = await fetch('/api/profile/nickname', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { err.textContent = d.error || '닉네임을 저장하지 못했어요.'; armed = ''; btn.textContent = '이 닉네임으로 정하기'; return; }
        Object.assign(window.CURRENT_USER, d.me); setName(d.me.name);
        if (typeof PvpClient !== 'undefined' && PvpClient._state) PvpClient._state.meName = d.me.name;
        if (typeof Friends !== 'undefined') Friends.load();
        box.remove();
      } catch (_) { err.textContent = '서버에 연결할 수 없어요.'; }
      finally { btn.disabled = false; }
    };
  }

  fetch('/api/me').then(async r => {
    if (r.status === 401) { location.replace('/login.html'); return; }
    if (!r.ok) return;
    const { user } = await r.json();
    window.CURRENT_USER = user;
    if (!user.nickname) askNickname(user);
    const bar = document.getElementById('userBar');
    if (!bar) return;
    const name = document.createElement('span'); name.className = 'uname'; name.textContent = '👤 ' + (user.name || user.username); name.title = '아이디: ' + user.username;   // v136 닉네임이 있으면 닉네임
    const out = document.createElement('button'); out.type = 'button'; out.textContent = '로그아웃';
    out.onclick = async () => {
      try { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (_) {}
      location.replace('/login.html');
    };
    bar.replaceChildren(name, out);
    bar.hidden = false;
  }).catch(() => {});
})();
