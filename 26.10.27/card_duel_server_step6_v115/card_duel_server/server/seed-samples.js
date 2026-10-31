// seed-samples.js — 샘플 계정 sample1 ~ sample20 을 만든다 (모든 카드 2장씩 보유 + 시작 골드).
//   npm run seed                 → 기본: 20개, 비밀번호 11111111, 골드 1000
//   node server/seed-samples.js [개수=20] [비밀번호=11111111] [골드=1000]
// 이미 있는 계정은 비밀번호·골드는 그대로 두고, 카드만 전부 갖게 다시 맞춥니다 (여러 번 실행해도 안전).
// ⚠ 비밀번호가 다 같고 공개돼 있으니, 인터넷에 공개하는 서버에서는 쓰지 마세요 (친구들과 로컬/테스트용).
// 서버가 켜져 있어도 됩니다.
const db = require('./db');
const { hashPassword } = require('./auth');
const { ensureWallet } = require('./saves');
const { ensureCollection, ensureAtLeast, CARD_POOL } = require('./collection');

const COUNT = Number(process.argv[2] || 20), PASSWORD = process.argv[3] || '11111111', GOLD = Number(process.argv[4] ?? 1000);
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 200) { console.error('개수는 1~200 사이 정수여야 해요.'); process.exit(1); }
if (PASSWORD.length < 8) { console.error('비밀번호는 8자 이상이어야 해요.'); process.exit(1); }
if (!Number.isInteger(GOLD) || GOLD < 0) { console.error('골드는 0 이상 정수여야 해요.'); process.exit(1); }

(async () => {
  const pwHash = await hashPassword(PASSWORD);
  let created = 0;
  for (let i = 1; i <= COUNT; i++) {
    const name = 'sample' + i;
    let u = db.prepare('SELECT id FROM users WHERE username=?').get(name);
    if (!u) {
      const id = db.prepare('INSERT INTO users(username,pw_hash,created_at) VALUES (?,?,?)').run(name, pwHash, Date.now()).lastInsertRowid;
      u = { id: Number(id) }; created++;
      ensureWallet(u.id); db.prepare('UPDATE wallets SET gold=? WHERE user_id=?').run(GOLD, u.id);
    }
    ensureCollection(u.id);
    db.exec('BEGIN');
    for (const c of CARD_POOL) ensureAtLeast(u.id, c.name, 2);
    db.exec('COMMIT');
  }
  console.log(`sample1 ~ sample${COUNT}: 새로 만든 계정 ${created}개, 나머지는 카드만 보충. 비밀번호 ${PASSWORD} · 새 계정 골드 ${GOLD} · 모든 카드 ${CARD_POOL.length}종 2장씩`);
})();
