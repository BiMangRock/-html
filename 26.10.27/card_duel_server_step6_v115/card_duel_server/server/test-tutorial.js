// test-tutorial.js — v140 튜토리얼 첫 완료 보상 (첫 걸음) · 새 계정 스타터 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));
const { PROGRESS } = require(path.join(JS, 'progress.js'));
const auth = require('./auth'), saves = require('./saves'), progress = require('./progress'), tutorial = require('./tutorial'), db = require('./db');

// ---------- 순수 규칙 ----------
{
  const commons = E.CARD_POOL.filter(c => c.rarity === '일반' && Col.cardScope(c) === 'normal' && !c.unlock);
  const st = Col.starterCollection(E.CARD_POOL, E.defaultDeckList());
  const got = commons.filter(c => st[c.name]);
  assert.strictEqual(got.length, Math.round(commons.length * Col.STARTER_COMMON_SHARE), '일반 카드 절반');
  assert.strictEqual(Col.validateDeckOwned(E.defaultDeckList(), st), null, '추천 덱은 그대로 만들 수 있음');
  const deck = new Set(E.defaultDeckList());
  assert(got.filter(c => !deck.has(c.name)).every(c => st[c.name] === 1), '덱 밖 일반 카드는 1장');
  assert.deepStrictEqual(Col.starterCommons(E.CARD_POOL, E.defaultDeckList()), Col.starterCommons(E.CARD_POOL, E.defaultDeckList()), '항상 같은 카드');
  // 전설 고르기: 모험·보스 전용 제외, 없는 것 우선, 다 있으면 아무거나
  assert(tutorial.LEGENDS.length > 0 && tutorial.LEGENDS.every(c => c.rarity === '전설' && !c.scope && !c.unlock), '전설 후보');
  const allButOne = {}; tutorial.LEGENDS.slice(1).forEach(c => { allButOne[c.name] = 1; });
  for (let i = 0; i < 20; i++) assert.strictEqual(tutorial.pickLegend(allButOne).name, tutorial.LEGENDS[0].name, '없는 전설만');
  const all = {}; tutorial.LEGENDS.forEach(c => { all[c.name] = 2; });
  assert(tutorial.pickLegend(all), '다 있으면 그중 하나');
  console.log('✔ 스타터 · 전설 고르기');
}

const app = express(); app.use(express.json());
app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', progress.router); app.use('/api', tutorial.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  try {
    let r = await call('POST', '/api/tutorial/complete', { tutorial: 'basic' }); assert.strictEqual(r.status, 401, '로그인 필요');
    await call('POST', '/api/signup', { username: 'newbie1', password: 'password1' });
    r = await call('GET', '/api/save'); let rev = r.data.wallet.rev; const gold0 = r.data.wallet.gold;
    r = await call('GET', '/api/progress'); assert.deepStrictEqual(r.data.tutorial, { basic: 'todo', advanced: 'todo' });

    // 끝내기 전에는 못 받음 · 없는 튜토리얼
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'basic', rev }); assert.strictEqual(r.status, 400, '완료 전');
    r = await call('POST', '/api/tutorial/complete', { tutorial: 'nope' }); assert.strictEqual(r.status, 400);

    // 기본: 완료 → 1000골드 (한 번만)
    r = await call('POST', '/api/tutorial/complete', { tutorial: 'basic' }); assert.strictEqual(r.data.first, true); assert.strictEqual(r.data.state.basic, 'ready');
    r = await call('POST', '/api/tutorial/complete', { tutorial: 'basic' }); assert.strictEqual(r.data.first, false, '두 번째 완료는 기록만 그대로');
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'basic', rev: rev + 3 }); assert.strictEqual(r.status, 409, '낡은 rev');
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'basic', rev }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.deepStrictEqual(r.data.reward, { gold: 1000 }); assert.strictEqual(r.data.wallet.gold, gold0 + 1000); assert.strictEqual(r.data.wallet.rev, rev + 1);
    assert.strictEqual(r.data.tutorial.basic, 'claimed'); assert(r.data.quests && r.data.quests.list, '진행 정보도 같이 옴');
    rev = r.data.wallet.rev;
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'basic', rev }); assert.strictEqual(r.status, 400, '두 번 못 받음');
    r = await call('GET', '/api/save'); assert.strictEqual(r.data.wallet.gold, gold0 + 1000, '골드는 한 번만');

    // 고급: 없는 전설 1장
    const owned0 = r.data.collection;
    r = await call('POST', '/api/tutorial/complete', { tutorial: 'advanced' });
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'advanced' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const card = r.data.reward.card; assert(card && card.rarity === '전설' && card.isNew, JSON.stringify(r.data.reward));
    assert(!owned0[card.name] && r.data.collection[card.name] === 1, '새 전설 1장');
    assert(tutorial.LEGENDS.some(c => c.name === card.name), '모험·보스 전용 아님');
    assert.deepStrictEqual(r.data.tutorial, { basic: 'claimed', advanced: 'claimed' });
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'advanced' }); assert.strictEqual(r.status, 400, '두 번 못 받음');

    // 다른 계정: 전설을 다 갖고 있으면 그중 하나 (한 장 더)
    cookie = ''; await call('POST', '/api/signup', { username: 'rich01', password: 'password1' }); await call('GET', '/api/save');
    const uid = db.prepare("SELECT id FROM users WHERE username='rich01'").get().id;
    const ins = db.prepare('INSERT INTO collection(user_id,card_name,count) VALUES (?,?,2) ON CONFLICT(user_id,card_name) DO UPDATE SET count=2');
    tutorial.LEGENDS.forEach(c => ins.run(uid, c.name));
    await call('POST', '/api/tutorial/complete', { tutorial: 'advanced' });
    r = await call('POST', '/api/tutorial/claim', { tutorial: 'advanced' }); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.reward.card.isNew, false); assert.strictEqual(r.data.collection[r.data.reward.card.name], 3);
    assert.strictEqual(r.data.tutorial.basic, 'todo', '기본은 따로 (고급만 끝낸 계정)');
    assert.strictEqual(PROGRESS.TUTORIALS.length, 2);
    console.log('✔ 튜토리얼 첫 완료 보상 API');
    console.log('✔ 튜토리얼 보상 테스트 통과');
  } catch (e) { console.error('✘ 실패:', e); process.exitCode = 1; }
  finally { server.close(); }
});
