// grant.js — 개발/테스트용: 계정에 카드를 지급한다 (상점이 생기기 전에 덱 에디터 제한을 시험해 볼 때 쓴다)
//   node server/grant.js <아이디> all [장수]          모든 카드를 최소 N장(기본 2)씩 갖게 함
//   node server/grant.js <아이디> rarity:전설 [장수]   그 등급 카드 전부를 최소 N장(기본 2)씩
//   node server/grant.js <아이디> "카드 이름" [장수]   한 장 (기본 2장)
// 서버가 켜져 있어도 됩니다. 지급 후 브라우저를 새로고침하면 반영돼요.
const db = require('./db');
const { ensureCollection, ensureAtLeast, CARD_POOL, RARITY_ORDER } = require('./collection');

const [, , username, what, nArg] = process.argv;
if (!username || !what) { console.log('사용법: node server/grant.js <아이디> all|rarity:전설|"카드 이름" [장수]'); process.exit(1); }
const user = db.prepare('SELECT id, username FROM users WHERE username=?').get(username);
if (!user) { console.error('없는 아이디예요: ' + username); process.exit(1); }
const n = nArg === undefined ? 2 : Number(nArg);
if (!Number.isInteger(n) || n < 1 || n > 99) { console.error('장수는 1~99 사이 정수여야 해요.'); process.exit(1); }

let targets;
if (what === 'all') targets = CARD_POOL;
else if (what.startsWith('rarity:')) {
  const r = what.slice(7);
  if (!RARITY_ORDER.includes(r)) { console.error('등급은 ' + RARITY_ORDER.join(' / ') + ' 중 하나예요.'); process.exit(1); }
  targets = CARD_POOL.filter(c => c.rarity === r);
} else {
  targets = CARD_POOL.filter(c => c.name === what);
  if (!targets.length) { console.error('없는 카드예요: ' + what); process.exit(1); }
}
ensureCollection(user.id);                 // 스타터를 먼저 받게 한 뒤 추가 (안 그러면 나중에 스타터가 따로 지급됨)
for (const c of targets) ensureAtLeast(user.id, c.name, n);
console.log(`${user.username}: ${targets.length}종을 최소 ${n}장씩 갖게 했어요.`);
