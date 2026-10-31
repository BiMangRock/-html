// auth.js — 게임 화면(index.html)용: 로그인 확인 + 메뉴 오른쪽 위에 사용자 이름/로그아웃 표시
// (골드 칩 옆 #userBar. 메뉴 화면 안에 있어서 게임이 시작되면 같이 가려진다)
// 서버가 이미 로그인 안 한 사람을 로그인 화면으로 보내지만, 세션이 만료된 채 열려 있는 경우를 위해 한 번 더 확인한다.
(() => {
  window.CURRENT_USER = null;
  fetch('/api/me').then(async r => {
    if (r.status === 401) { location.replace('/login.html'); return; }
    if (!r.ok) return;
    const { user } = await r.json();
    window.CURRENT_USER = user;
    const bar = document.getElementById('userBar');
    if (!bar) return;
    const name = document.createElement('span'); name.className = 'uname'; name.textContent = '👤 ' + user.username;
    const out = document.createElement('button'); out.type = 'button'; out.textContent = '로그아웃';
    out.onclick = async () => {
      try { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (_) {}
      location.replace('/login.html');
    };
    bar.replaceChildren(name, out);
    bar.hidden = false;
  }).catch(() => {});
})();
