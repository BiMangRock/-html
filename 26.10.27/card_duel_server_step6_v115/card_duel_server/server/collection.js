// collection.js (server) — 내 카드 컬렉션 DB 도우미. express 와 무관해서 grant.js 같은 도구에서도 쓴다.
const path = require('path');
const db = require('./db');
const JS = path.join(__dirname, '..', 'public', 'js');
const { CARD_POOL, defaultDeckList } = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));

// 스타터 카드를 아직 못 받은 계정이면 지급한다 (가입 직후 / 3단계까지 쓰던 기존 계정의 첫 접속 때). 한 번만.
function ensureCollection(uid) {
  if (db.prepare('SELECT 1 FROM collection_init WHERE user_id=?').get(uid)) return;
  const starter = Col.starterCollection(CARD_POOL, defaultDeckList());
  db.exec('BEGIN');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO collection(user_id,card_name,count) VALUES (?,?,?)');
    for (const [name, n] of Object.entries(starter)) ins.run(uid, name, n);
    db.prepare('INSERT OR IGNORE INTO collection_init(user_id,granted_at) VALUES (?,?)').run(uid, Date.now());
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}
function collectionOf(uid) {
  const out = {};
  for (const r of db.prepare('SELECT card_name,count FROM collection WHERE user_id=?').all(uid)) out[r.card_name] = r.count;
  return out;
}
// 카드를 "최소 n장" 갖게 한다 (이미 그 이상이면 그대로). 팩 개봉(5단계)에서도 이 자리에 +n 로직이 붙는다.
function ensureAtLeast(uid, cardName, n) {
  db.prepare(`INSERT INTO collection(user_id,card_name,count) VALUES (?,?,?)
              ON CONFLICT(user_id,card_name) DO UPDATE SET count=MAX(count, excluded.count)`).run(uid, cardName, n);
}
module.exports = { ensureCollection, collectionOf, ensureAtLeast, CARD_POOL, RARITY_ORDER: Col.RARITY_ORDER };
