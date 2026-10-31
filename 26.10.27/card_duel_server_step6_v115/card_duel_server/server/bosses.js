// bosses.js — 보스 목록 (v116). 모든 유저가 읽고, 개발자(is_admin)만 고친다.
//  - 저장 위치: app_config 테이블의 key='bosses' (JSON 배열). 아직 한 번도 저장하지 않았으면 null → 클라이언트가 코드의 BOSS_DEFAULT 를 쓴다.
//  - 덱은 클라이언트와 같은 검사(validateDeckList)를 서버가 다시 한다.
const path = require('path');
const express = require('express');
const db = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const JS = path.join(__dirname, '..', 'public', 'js');
const { validateDeckList } = require(path.join(JS, 'engine.js'));

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_BOSSES = 60;

function readBosses() {
  const r = db.prepare("SELECT value FROM app_config WHERE key='bosses'").get();
  if (!r) return null;
  try { const v = JSON.parse(r.value); return Array.isArray(v) ? v : null; } catch (_) { return null; }
}

// 클라이언트 BossBook.clean 과 같은 모양으로 정리. 잘못된 값이면 문자열(오류), 정상이면 정리된 객체
function cleanBoss(b, i) {
  if (!b || typeof b !== 'object') return `${i + 1}번째 보스가 올바르지 않아요.`;
  if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return `${i + 1}번째 보스의 id 는 영문·숫자·_- 1~40자여야 해요.`;
  const bad = validateDeckList(b.deck);
  if (bad) return `보스 ${b.id}: ${bad}`;
  const high = b.tier === 'high' || (b.tier == null && b.bot === 'model');
  return {
    id: b.id,
    name: String(b.name || '이름 없음').slice(0, 20),
    icon: String(b.icon || '👹').slice(0, 4),
    desc: String(b.desc || '').slice(0, 80),
    cheats: [...new Set((Array.isArray(b.cheats) ? b.cheats : []).map(x => String(x).slice(0, 40)))].slice(0, 30),
    reward: Math.max(0, Math.min(1000000, Math.floor(Number(b.reward) || 0))),
    tier: high ? 'high' : 'mid',
    bot: high ? 'model' : (b.bot === 'rule' ? 'rule' : 'rule2'),
    model: String(b.model || '').slice(0, 200),
    deck: b.deck.map(String),
  };
}

const router = express.Router();

router.get('/bosses', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ bosses: readBosses() });
});

// 요청: {bosses:[...]} 저장 / {bosses:null} 코드 기본값으로 되돌리기 (둘 다 개발자만)
router.put('/bosses', requireAdmin, (req, res) => {
  const list = (req.body || {}).bosses;
  if (list === null) {
    db.prepare("DELETE FROM app_config WHERE key='bosses'").run();
    return res.json({ bosses: null });
  }
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_BOSSES) return res.status(400).json({ error: `보스는 1~${MAX_BOSSES}명이어야 해요.` });
  const out = [], seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const c = cleanBoss(list[i], i);
    if (typeof c === 'string') return res.status(400).json({ error: c });
    if (seen.has(c.id)) return res.status(400).json({ error: `보스 id 가 겹쳐요: ${c.id}` });
    seen.add(c.id); out.push(c);
  }
  db.prepare(`INSERT INTO app_config(key,value,updated_at) VALUES ('bosses',?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(JSON.stringify(out), Date.now());
  res.json({ bosses: out });
});

module.exports = { router, readBosses, cleanBoss };
