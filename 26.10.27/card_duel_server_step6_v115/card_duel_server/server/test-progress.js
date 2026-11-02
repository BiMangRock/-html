// test-progress.js — v132 카드 제작·분해(가루) · 일일 퀘스트 · 감정 표현 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const { PROGRESS, craftableCard } = require(path.join(JS, 'progress.js'));
const auth = require('./auth'), saves = require('./saves'), progress = require('./progress'), db = require('./db');

assert(!craftableCard(E.CARD_POOL.find(c => c.name === '학사모')), '학사모는 제작 불가');
assert(!craftableCard(E.CARD_POOL.find(c => c.scope === 'boss')), '보스 전용 제작 불가');
assert(craftableCard(E.CARD_POOL.find(c => c.name === '데스윙')), '전설 일반 카드 제작 가능');

const app = express(); app.use(express.json());
app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', progress.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  try {
    await call('POST', '/api/signup', { username: 'crafter1', nickname: 'crafter1', password: 'password1' });
    let r = await call('GET', '/api/save'); const col0 = r.data.collection; let rev = r.data.wallet.rev, gold = r.data.wallet.gold;
    r = await call('GET', '/api/progress'); assert.strictEqual(r.data.dust, 0); assert.strictEqual(r.data.quests.list.length, PROGRESS.PER_DAY);
    // 제작: 가루 부족
    r = await call('POST', '/api/craft', { name: '데스윙' }); assert.strictEqual(r.status, 400);
    // 분해: 덱(추천 덱)에 쓰는 장수는 못 분해
    const deck = E.defaultDeckList(); const used = deck[0]; const usedN = deck.filter(n => n === used).length;
    r = await call('POST', '/api/disenchant', { name: used, count: col0[used] }); assert.strictEqual(r.status, 400, '덱에 쓰는 카드');
    // 덱에 안 쓰는 일반 카드 분해
    const free = Object.keys(col0).find(n => !deck.includes(n) && craftableCard(E.CARD_POOL.find(c => c.name === n)));
    const freeN = col0[free];                                               // v140 스타터 일반 카드는 1장씩
    r = await call('POST', '/api/disenchant', { name: free, count: freeN }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.dust, PROGRESS.DISENCHANT['일반'] * freeN); assert(!r.data.collection[free]);
    // 가루를 넣어 두고 제작
    db.prepare('UPDATE player_progress SET dust=5000').run();
    r = await call('POST', '/api/craft', { name: '데스윙' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.collection['데스윙'], 1); assert.strictEqual(r.data.dust, 5000 - 1600);
    r = await call('POST', '/api/craft', { name: '데스윙' }); r = await call('POST', '/api/craft', { name: '데스윙' }); assert.strictEqual(r.status, 400, '2장 넘게는 못 만듦');
    r = await call('POST', '/api/craft', { name: '학사모' }); assert.strictEqual(r.status, 400);
    // 남는 카드 한꺼번에 분해
    { const uid = db.prepare("SELECT id FROM users WHERE username='crafter1'").get().id, n = free === '들쥐' ? '책벌레' : '들쥐';   // v140 스타터에 없을 수도 있어서 넣어 둔다
      db.prepare("INSERT INTO collection(user_id,card_name,count) VALUES (?,?,5) ON CONFLICT(user_id,card_name) DO UPDATE SET count=5").run(uid, n); }
    r = await call('POST', '/api/disenchant-extra'); assert.strictEqual(r.status, 200); assert(r.data.count >= 3, JSON.stringify(r.data));
    // 퀘스트: 진행 · 완료 골드
    db.prepare("UPDATE player_progress SET quests_json=?").run(JSON.stringify([{ id: 'play3', prog: 0, done: false }, { id: 'spell10', prog: 0, done: false }, { id: 'win2', prog: 0, done: false }]));
    r = await call('GET', '/api/save'); rev = r.data.wallet.rev; gold = r.data.wallet.gold;
    r = await call('POST', '/api/quests/report', { rev: rev + 5, stats: { games: 1 } }); assert.strictEqual(r.status, 409, '낡은 rev');
    r = await call('POST', '/api/quests/report', { rev, stats: { games: 1, wins: 1, spells: 5000 } }); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.completed.map(q => q.id), ['spell10'], '주문 10 넘음'); assert.strictEqual(r.data.wallet.gold, gold + 50); rev = r.data.wallet.rev;
    r = await call('POST', '/api/quests/report', { rev, stats: { games: 1, wins: 1 } }); rev = r.data.wallet.rev;
    assert.deepStrictEqual(r.data.completed.map(q => q.id), ['win2']);
    r = await call('POST', '/api/quests/report', { rev, stats: { games: 1 } }); assert.deepStrictEqual(r.data.completed.map(q => q.id), ['play3']); assert.strictEqual(r.data.wallet.gold, gold + 150);
    // 바꾸기: 끝난 건 못 바꿈, 하루 1번
    r = await call('POST', '/api/quests/reroll', { index: 0 }); assert.strictEqual(r.status, 400);
    db.prepare("UPDATE player_progress SET quests_json=?").run(JSON.stringify([{ id: 'face40', prog: 3, done: false }]));
    r = await call('POST', '/api/quests/reroll', { index: 0 }); assert.strictEqual(r.status, 200); assert.notStrictEqual(r.data.quests.list[0].id, 'face40');
    r = await call('POST', '/api/quests/reroll', { index: 0 }); assert.strictEqual(r.status, 400, '두 번째는 안 됨');
    // 날짜가 바뀌면 새 퀘스트
    db.prepare("UPDATE player_progress SET quest_day='2000-01-01', rerolls=1").run();
    r = await call('GET', '/api/progress'); assert.strictEqual(r.data.quests.rerollsLeft, PROGRESS.REROLLS); assert.strictEqual(r.data.quests.list.length, PROGRESS.PER_DAY);
    console.log('✔ 제작·분해 · 일일 퀘스트');
    // 감정 표현 (유저 대전 코어)
    const { createPvp } = require('./pvp-core');
    const core = createPvp({ cfg: { turnMs: 5000, mulliganMs: 5000, reconnectMs: 5000, graceMs: 0 }, loadDeck: () => E.defaultDeckList(), settle: () => [{ reward: 0 }, { reward: 0 }] });
    const box = { 1: [], 2: [] };
    [1, 2].forEach(u => core.connect(u, 'u' + u, { send: m => box[u].push(JSON.parse(JSON.stringify(m))) }));
    core.queueJoin(1); core.queueJoin(2);
    await new Promise(r => setTimeout(r, 50));
    const mid = box[1].filter(m => m.t === 'match').pop().matchId;
    assert.ok(core.emote(1, mid, 'hello').ok); assert.ok(!core.emote(1, mid, 'hello').ok, '너무 빠름'); assert.ok(!core.emote(2, mid, 'hack').ok);
    const got = box[2].find(m => m.t === 'emote'); assert(got && got.id === 'hello' && got.seat !== undefined); assert(!box[1].some(m => m.t === 'emote'), '보낸 사람에게는 안 감');
    core.shutdown && core.shutdown();
    console.log('✔ 감정 표현');
    console.log('✔ 진행(제작·퀘스트·감정 표현) 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e); process.exitCode = 1; }
  finally { server.close(); setTimeout(() => process.exit(), 50); }
});
