// login.js — 로그인/회원가입 화면 동작
(() => {
  const $ = id => document.getElementById(id);
  const form = $('form'), err = $('err'), go = $('go');
  let mode = 'login';

  // 이미 로그인돼 있으면 바로 게임으로
  fetch('/api/me').then(r => { if (r.ok) location.replace('/'); }).catch(() => {});

  function setMode(m) {
    mode = m;
    $('tabLogin').classList.toggle('on', m === 'login');
    $('tabSignup').classList.toggle('on', m === 'signup');
    form.classList.toggle('signup', m === 'signup');
    $('password').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    $('password2').required = m === 'signup';
    go.textContent = m === 'signup' ? '가입하고 시작' : '로그인';
    err.textContent = '';
  }
  $('tabLogin').onclick = () => setMode('login');
  $('tabSignup').onclick = () => setMode('signup');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    const username = $('username').value.trim(), password = $('password').value;
    if (mode === 'signup' && password !== $('password2').value) { err.textContent = '비밀번호 확인이 달라요.'; return; }
    go.disabled = true;
    try {
      const r = await fetch(mode === 'signup' ? '/api/signup' : '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = data.error || '문제가 생겼어요. 잠시 후 다시 해 주세요.'; return; }
      location.replace('/');
    } catch (_) {
      err.textContent = '서버에 연결할 수 없어요.';
    } finally { go.disabled = false; }
  });
})();
