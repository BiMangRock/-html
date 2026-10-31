// make-admin.js — 개발자(관리자) 권한 주기/빼기
//   node server/make-admin.js <아이디>          개발자로 지정
//   node server/make-admin.js <아이디> off      개발자 해제
// 개발자만 보스 덱 편집·테스트 메뉴를 볼 수 있고, 보스 목록을 서버에 저장할 수 있다. 서버가 켜져 있어도 되고, 적용은 다시 로그인/새로고침하면 된다.
const db = require('./db');
const [, , username, off] = process.argv;
if (!username) { console.log('사용법: node server/make-admin.js <아이디> [off]'); process.exit(1); }
const u = db.prepare('SELECT id, username FROM users WHERE username=?').get(username);
if (!u) { console.error('없는 아이디예요: ' + username); process.exit(1); }
db.prepare('UPDATE users SET is_admin=? WHERE id=?').run(off === 'off' ? 0 : 1, u.id);
console.log(`${u.username}: 개발자 권한 ${off === 'off' ? '해제' : '부여'}`);
