// wallet.js (server) — 지갑 DB 도우미. saves.js · shop.js · pvp-db.js 가 같이 쓴다. express 와 무관.
const path = require('path');
const db = require('./db');
const { Economy } = require(path.join(__dirname, '..', 'public', 'js', 'economy.js'));

const walletRow = uid => db.prepare('SELECT gold,pool,pool_day,bet,rev FROM wallets WHERE user_id=?').get(uid);
const walletOut = r => ({ gold: r.gold, pool: r.pool, poolDay: r.pool_day, bet: r.bet, rev: r.rev });
function ensureWallet(uid) {                                // 첫 접속이면 시작 골드로 새로 만든다
  let r = walletRow(uid);
  if (!r) {
    const w = Economy.sanitize(null, new Date());
    db.prepare('INSERT OR IGNORE INTO wallets(user_id,gold,pool,pool_day,bet,rev,updated_at) VALUES (?,?,?,?,?,1,?)')
      .run(uid, w.gold, w.pool, w.poolDay, w.bet, Date.now());
    r = walletRow(uid);
  }
  return r;
}
module.exports = { walletRow, walletOut, ensureWallet };
