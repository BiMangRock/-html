// test-gradcap.js — v124 학사모 · 졸업 사정회 · 수석 졸업생 발굽 · 학위수여식의 총장님 + 4학년(마지막 단계) 첫 클리어 → 학사모 컬렉션 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const JS = path.join(__dirname, '..', 'public', 'js');
const E = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));
const Shop = require(path.join(JS, 'shop.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const card = n => { const c = E.CARD_POOL.find(x => x.name === n); assert(c, '없는 카드 ' + n); return c; };
for (const n of ['학사모', '졸업 사정회', '수석 졸업생 발굽', '학위수여식의 총장님']) { assert(!card(n).scope, n + ' 일반 카드'); assert(card(n).desc); }
assert(!E.GEN_POOL.some(c => c.name === '학사모'), '무작위 생성에 학사모 없음');
assert(!Object.values(Shop.shopPoolsByRarity(E.CARD_POOL)).flat().some(c => c.name === '학사모'), '상점 팩에 없음');
assert(Object.values(Shop.shopPoolsByRarity(E.CARD_POOL)).flat().some(c => c.name === '졸업 사정회'), '사정회는 팩에서 나옴');
assert(!Col.starterCollection(E.CARD_POOL, E.defaultDeckList())['학사모'], '스타터에 없음');
assert.deepStrictEqual(Adv.ADV_TEMPLATE_REWARD_CARDS.ynu_4, ['학사모', '학사모']);

function setup(seed0 = 31) {
  let seed = seed0; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const s = E.newGame(rng, { first: 0, decks: [E.defaultDeckList(), E.defaultDeckList()] });
  for (const P of s.seats) { P.hand = []; P.board = []; P.mana = 10; P.maxMana = 10; }
  return s;
}
const give = (s, seat, c0) => { const c = { ...(typeof c0 === 'string' ? structuredClone(card(c0)) : c0), id: s.nextId++ }; s.seats[seat].hand.push(c); return c; };
const put = (s, seat, base, extra = {}) => { const m = { type: 'minion', cost: 1, ...base, maxHp: base.hp, attacked: false, summoned: false, id: s.nextId++, ...extra }; s.seats[seat].board.push(m); return m; };
const ok = r => { assert(r.ok, r.error); return r.state; };
const play = (s, seat, c, target) => ok(E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: target || null }, seat));
const end = (s, seat) => ok(E.apply(s, { type: 'END_TURN' }, seat));
const caps = (s, seat) => s.seats[seat].hand.filter(c => c.name === '학사모');

// 학사모: 무작위 효과 (비용+1)번 · 1장 뽑기 · 상대에게 비용 +1 → 상대가 들고 턴을 끝내면 2 피해 → 되던지면 다시 +1
{ let s = setup(); const a = put(s, 0, { name: 'a', atk: 1, hp: 5 }); put(s, 1, { name: 'e', atk: 5, hp: 9 });
  const c0 = give(s, 0, '학사모'), h0 = s.seats[0].hand.length; s = play(s, 0, c0);
  assert.strictEqual(s.seats[0].hand.length, h0, '쓴 1장 빠지고 1장 뽑음'); assert.strictEqual(caps(s, 1).length, 1); assert.strictEqual(caps(s, 1)[0].cost, 1);
  assert.strictEqual(s.seats[0].capsPlayed, 1);
  s = end(s, 0); const hp = s.seats[1].hp; s.seats[1].mana = 0; s = end(s, 1); assert.strictEqual(s.seats[1].hp, hp - 2, '들고 있으면 2 피해');
  s = end(s, 0); s.seats[1].mana = 10; s = play(s, 1, caps(s, 1)[0]); assert.strictEqual(caps(s, 0).length, 1); assert.strictEqual(caps(s, 0)[0].cost, 2, '되던지면 비용 2'); }
{ let s = setup(); const c = give(s, 0, '학사모'); c.capLv = 10; c.cost = 10; s = play(s, 0, c); assert.strictEqual(caps(s, 1)[0].cost, 10, '최대 10'); }
{ for (let k = 1; k <= 10; k++) { let s = setup(k); put(s, 0, { name: 'a', atk: 3, hp: 5 }); put(s, 1, { name: 'e', atk: 5, hp: 50 });
    const c = give(s, 0, '학사모'); c.capLv = 3; c.cost = 3; const r = E.apply(s, { type: 'PLAY_CARD', cardId: c.id, target: null }, 0); assert(r.ok, r.error);
    const note = r.events.find(e => e.type === 'note' && /학사모 효과 4번/.test(e.text)); assert(note, '비용 3이면 4번');
    assert.strictEqual(note.text.split('·').length, 4, note.text); } }
// 졸업 사정회: 마나를 남긴 채 턴 종료 → 1단계(1번) 학사모, 2단계(2번) 학사모 … 계속
{ let s = setup(); s = play(s, 0, give(s, 0, '졸업 사정회')); const hand = () => caps(s, 0).length;
  s = end(s, 0); assert.strictEqual(hand(), 1, '1단계 0/1 → 학사모'); s.seats[0].hand = s.seats[0].hand.filter(c => c.name !== '학사모');
  s = end(s, 1); s = end(s, 0); assert.strictEqual(hand(), 0, '2단계 1/2'); s = end(s, 1); s = end(s, 0); assert.strictEqual(hand(), 1, '2단계 2/2 → 학사모');
  assert.deepStrictEqual(s.seats[0].gradQuests[0], { stage: 3, prog: 0 });
  s.seats[0].hand = []; s = end(s, 1); s.seats[0].mana = 0; s = end(s, 0); assert.strictEqual(s.seats[0].gradQuests[0].prog, 0, '마나를 다 쓰면 진행 없음'); }
// 수석 졸업생 발굽: 낸 학사모 1장당 1 피해
{ let s = setup(); for (let i = 0; i < 3; i++) s = play(s, 0, give(s, 0, '학사모')); const hp = s.seats[1].hp; s = play(s, 0, give(s, 0, '수석 졸업생 발굽')); assert.strictEqual(s.seats[1].hp, hp - 3); }
// 학위수여식의 총장님: 손을 학사모로 가득
{ let s = setup(); give(s, 0, '들쥐'); s = play(s, 0, give(s, 0, '학위수여식의 총장님')); assert.strictEqual(s.seats[0].hand.length, 10); assert.strictEqual(caps(s, 0).length, 9);
  assert(caps(s, 0).every(c => c.cost === c.capLv && c.cost >= 0 && c.cost <= 10)); }
console.log('✔ 학사모 · 졸업 사정회 · 발굽 · 총장님');
{ const deck = [...['학사모', '졸업 사정회', '수석 졸업생 발굽', '학위수여식의 총장님'].flatMap(n => [n, n]), ...E.defaultDeckList().slice(0, 22)];
  const R = E.selfPlay(40, E.BotPlayers.rule2, E.BotPlayers.rule2, 200, { decks: [deck, E.defaultDeckList()] }); console.log('봇 대전 (학사모 덱 vs 추천 덱)', JSON.stringify(R)); assert.strictEqual(R.errors, 0); }

// 서버: 마지막 단계 첫 클리어 → 학사모 2장이 컬렉션에 (잠긴 덱이 아니라), 일반 덱에 넣을 수 있음
const auth = require('./auth'), saves = require('./saves'), bosses = require('./bosses'), db = require('./db');
const app = express(); app.use('/api/bosses', express.json({ limit: '1mb' })); app.use(express.json());
app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', bosses.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: res.status, data: await res.json().catch(() => ({})) }; }; };
  const dev = mk(), user = mk();
  try {
    await dev('POST', '/api/signup', { username: 'devx1', password: 'password1' }); await user('POST', '/api/signup', { username: 'userx1', password: 'password1' });
    db.prepare("UPDATE users SET is_admin=1 WHERE username='devx1'").run();
    const deck = E.defaultDeckList(); const boss = (id, extra) => ({ id, name: '보스 ' + id, icon: '🎓', desc: '', cheats: [], tier: 'mid', bot: 'rule2', model: '', deck, ...extra });
    let r = await dev('PUT', '/api/bosses', { bosses: [boss('y1', { chapter: 'ynu', stage: 1 }), boss('y4', { chapter: 'ynu', stage: 2, rewardCards: ['학사모', '학사모'] })] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    const withCap = deck.slice(0, 28).concat(['학사모', '학사모']);
    r = await user('PUT', '/api/deck', { deck: withCap }); assert.strictEqual(r.status, 400, '깨기 전에는 못 넣음');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); assert.strictEqual(r.status, 200);
    r = await user('POST', '/api/adventure/clear', { bossId: 'y1' }); assert.strictEqual(r.status, 200);
    r = await user('POST', '/api/adventure/clear', { bossId: 'y4' }); assert.strictEqual(r.status, 200); assert(r.data.graduated, '졸업');
    assert.deepStrictEqual(r.data.granted, ['학사모', '학사모']); assert.strictEqual(r.data.collection['학사모'], 2, '컬렉션에 2장');
    r = await user('PUT', '/api/deck', { deck: withCap }); assert.strictEqual(r.status, 200, '일반 덱에 넣을 수 있음');
    r = await user('GET', '/api/save'); assert.deepStrictEqual(r.data.deck, withCap, '불러와도 그대로');
    console.log('test-gradcap: 모두 통과');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { server.close(); }
});
