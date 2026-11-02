// test-adventure.js — v117 카드 사용 범위(scope) · 모험 덱 · 도장깨기 잠금 · 첫 클리어 보상 카드 (임시 DB)
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const http = require('http');
const path = require('path');
const JS = path.join(__dirname, '..', 'public', 'js');

// 시험용 카드 2장을 엔진이 읽기 전에 카드풀에 넣는다 (실제 cards.js 는 건드리지 않음)
const { CARD_POOL } = require(path.join(JS, 'cards.js'));
const ADV = '시험용 모험카드', BOSS = '시험용 보스카드';
CARD_POOL.push({ type: 'minion', name: ADV, cost: 2, rarity: '일반', atk: 2, hp: 3, scope: 'adventure' });
CARD_POOL.push({ type: 'minion', name: BOSS, cost: 1, rarity: '일반', atk: 9, hp: 9, scope: 'boss' });

const E = require(path.join(JS, 'engine.js'));
const Col = require(path.join(JS, 'collection.js'));
const Shop = require(path.join(JS, 'shop.js'));
const Adv = require(path.join(JS, 'adventure.js'));
const express = require('express');
const auth = require('./auth'), saves = require('./saves'), bosses = require('./bosses'), dbRaw = require('./db');
const { loadDeck } = require('./pvp-db');

// ---------- 순수 규칙 ----------
assert(!E.GEN_POOL.some(c => c.scope), '무작위 생성 풀에 모험·보스 카드 없음');
assert(E.CARD_POOL.some(c => c.name === BOSS), '전체 카드풀(이름 찾기)에는 있음');
const by = Shop.shopPoolsByRarity(E.CARD_POOL);
assert(!by['일반'].some(c => c.scope), '상점 팩에 안 나옴');
const starter = Col.starterCollection(E.CARD_POOL, E.defaultDeckList());
assert(!starter[ADV] && !starter[BOSS], '스타터로 안 줌');
assert(!E.defaultDeckList().some(n => n === ADV || n === BOSS), '추천 덱에 안 들어감');
const deckWith = n => { const d = E.defaultDeckList(); d[d.length - 1] = n; return d; };
assert(Col.validateDeckScope(deckWith(ADV), E.CARD_POOL, 'normal'), '일반 덱에 모험 카드 X');
assert.strictEqual(Col.validateDeckScope(deckWith(ADV), E.CARD_POOL, 'adventure'), null, '모험 덱에 모험 카드 O');
assert(Col.validateDeckScope(deckWith(BOSS), E.CARD_POOL, 'adventure'), '모험 덱에도 보스 카드 X');
assert.strictEqual(E.validateDeckList(deckWith(BOSS)), null, '보스 덱 검사는 보스 카드 허용');
assert.deepStrictEqual(Adv.advCleanFields({ chapter: 'ynu', stage: 2, rewardCards: [ADV, ADV, ADV, BOSS, '없는 카드'] }).rewardCards, [ADV, ADV], '보상 카드 정리');
assert.strictEqual(Adv.advCleanFields({ chapter: '', stage: 5 }).stage, 0, '챕터 없으면 단계 0');
// 잠금
const L = [{ id: 'a', chapter: 'ynu', stage: 1 }, { id: 'b', chapter: 'ynu', stage: 2 }, { id: 'c', chapter: 'ynu', stage: 3 }, { id: 'f', chapter: '', stage: 0 }];
assert.strictEqual(Adv.advBlocker(L[0], L, () => false), null, '1단계는 항상 열림');
assert.strictEqual(Adv.advBlocker(L[2], L, id => id === 'a').id, 'b', '3단계는 2단계에 막힘');
assert.strictEqual(Adv.advBlocker(L[2], L, () => true), null);
assert.strictEqual(Adv.advBlocker(L[3], L, () => false), null, '자유 보스는 잠금 없음');
console.log('✔ 사용 범위 · 상점/스타터/무작위 제외 · 잠금 규칙');

// ---------- API ----------
const app = express();
app.use('/api/bosses', express.json({ limit: '1mb' }));
app.use(express.json());
app.use('/api', auth.router); app.use('/api', saves.router); app.use('/api', bosses.router);
const server = http.createServer(app).listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const mk = () => { let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json().catch(() => ({})) };
    }; };
  const dev = mk(), user = mk();
  try {
    await dev('POST', '/api/signup', { username: 'devadv1', nickname: 'devadv1', password: 'password123' });
    await user('POST', '/api/signup', { username: 'useradv1', nickname: 'useradv1', password: 'password123' });
    dbRaw.prepare("UPDATE users SET is_admin=1 WHERE username='devadv1'").run();
    const uid = dbRaw.prepare("SELECT id FROM users WHERE username='useradv1'").get().id;
    const deck = E.defaultDeckList();
    const boss = (id, extra) => ({ id, name: '보스 ' + id, icon: '🎓', desc: '', cheats: [], tier: 'mid', bot: 'rule2', model: '', deck, ...extra });

    let r = await dev('PUT', '/api/bosses', { bosses: [
      boss('ynu1', { chapter: 'ynu', stage: 1, rewardCards: [ADV, ADV, BOSS] }),
      boss('ynu2', { chapter: 'ynu', stage: 2 }),
      boss('free1', { deck: deckWith(BOSS) }),                                 // 보스 덱에는 보스 전용 카드 OK
    ] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.deepStrictEqual(r.data.bosses[0].rewardCards, [ADV, ADV], '보스 전용 카드는 보상에서 빠짐');
    assert.strictEqual(r.data.bosses[2].chapter, '');

    r = await user('GET', '/api/save'); assert.strictEqual(r.data.advDeck, null, '처음엔 모험 덱 없음');
    r = await user('PUT', '/api/adventure/deck', { deck: deckWith(ADV) }); assert.strictEqual(r.status, 400, '없는 카드로 모험 덱 X');

    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu1' }); assert.strictEqual(r.status, 400, '입학 전에는 챕터 보스 기록 불가');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck: deckWith(ADV) }); assert.strictEqual(r.status, 400, '없는 카드로 입학 불가');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'nope', deck }); assert.strictEqual(r.status, 400, '없는 챕터');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.data.run.deck, deck, '덱 잠금');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); assert.strictEqual(r.status, 409, '이미 입학');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu2' }); assert.strictEqual(r.status, 400, '1단계 전에 2단계 클리어 불가');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu1' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.first, true);
    assert.deepStrictEqual(r.data.granted, [ADV, ADV], '첫 클리어 보상 카드'); assert.strictEqual(r.data.collection[ADV], 2);
    assert.deepStrictEqual(r.data.run.cleared, ['ynu1'], '이번 입학 진행');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu1' }); assert.strictEqual(r.status, 400, '이번 입학에서 이미 깬 단계는 다시 못 깸');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu2' }); assert.strictEqual(r.status, 200, '이제 2단계 기록 가능');
    assert.strictEqual(r.data.graduated, true, '마지막 단계 → 졸업'); assert.strictEqual(r.data.run, null);
    r = await user('GET', '/api/save'); assert.deepStrictEqual(r.data.adventure.runs, {}, '졸업하면 입학 기록 삭제');
    // 다시 입학 → 지면 처음부터 / 자퇴
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); assert.strictEqual(r.status, 200, '졸업 후 재입학');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu1' }); assert.strictEqual(r.data.first, false); assert.deepStrictEqual(r.data.granted, [], '재클리어는 고정 보상 카드 없음');
    r = await user('POST', '/api/adventure/lose', { bossId: 'ynu2' }); assert.strictEqual(r.data.ended, true, '지면 입학 끝');
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu2' }); assert.strictEqual(r.status, 400, '입학이 끝나면 기록 불가');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); r = await user('POST', '/api/adventure/drop', { chapter: 'ynu' });
    r = await user('GET', '/api/save'); assert.deepStrictEqual(r.data.adventure.runs, {}, '자퇴');
    r = await user('POST', '/api/adventure/lose', { bossId: 'free1' }); assert.strictEqual(r.data.ended, false, '자유 보스 패배는 상관없음');
    r = await user('POST', '/api/adventure/clear', { bossId: 'free1' }); assert.strictEqual(r.status, 200, '자유 보스는 잠금 없음');

    r = await user('PUT', '/api/deck', { deck: deckWith(ADV) }); assert.strictEqual(r.status, 400, '일반 덱엔 모험 카드 X');
    r = await user('PUT', '/api/adventure/deck', { deck: deckWith(BOSS) }); assert.strictEqual(r.status, 400, '모험 덱에 보스 카드 X');
    r = await user('PUT', '/api/adventure/deck', { deck: deckWith(ADV) }); assert.strictEqual(r.status, 200, '모험 덱에 모험 카드 O');
    r = await user('GET', '/api/save'); assert.deepStrictEqual(r.data.advDeck, deckWith(ADV), '모험 덱 불러오기');

    // DB 를 직접 조작해 일반 덱에 모험 카드를 넣어도: 불러오기는 null, 유저 대전은 추천 덱
    dbRaw.prepare('INSERT INTO decks(user_id,deck_json,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET deck_json=excluded.deck_json').run(uid, JSON.stringify(deckWith(ADV)), Date.now());
    r = await user('GET', '/api/save'); assert.strictEqual(r.data.deck, null, '조작된 일반 덱은 무시');
    assert.deepStrictEqual(loadDeck(uid), E.defaultDeckList(), '유저 대전에 모험 카드 덱 X');
    console.log('✔ 모험 덱 API · 클리어 순서 · 보상 카드 · 유저 대전 차단');
    // v117 보상 묶음: 첫 클리어 때 3묶음 → 하나 고르기
    r = await dev('PUT', '/api/bosses', { bosses: [
      boss('ynu1', { chapter: 'ynu', stage: 1 }), boss('ynu2', { chapter: 'ynu', stage: 2 }),
      boss('ynu3', { chapter: 'ynu', stage: 3, rewardChoice: [ADV, BOSS, '들쥐', '책벌레', '들쥐'] }) ] });
    assert.deepStrictEqual(r.data.bosses[2].rewardChoice, [ADV, '들쥐', '책벌레'], '보스 전용·중복 제외');
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); assert.strictEqual(r.status, 200);
    await user('POST', '/api/adventure/clear', { bossId: 'ynu1' }); await user('POST', '/api/adventure/clear', { bossId: 'ynu2' });
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu3' });
    assert.strictEqual(r.status, 200); assert(r.data.offer, '묶음 제안'); assert.strictEqual(r.data.offer.bundles.length, 3);
    assert(r.data.offer.bundles.every(b => b.length === 2), '1종 × 2장씩'); const offer = r.data.offer;
    r = await user('GET', '/api/save'); assert.strictEqual(r.data.adventure.offers.length, 1, '고르기 전까지 남아 있음');
    r = await user('POST', '/api/adventure/pick', { bossId: 'ynu3', index: 9 }); assert.strictEqual(r.status, 400);
    r = await user('POST', '/api/adventure/pick', { bossId: 'ynu3', index: 1 });
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.data.granted, offer.bundles[1]);
    assert.strictEqual(r.data.run, null, 'ynu3 이 마지막 단계라 이미 졸업 → 덱에 더할 입학 없음');
    r = await user('POST', '/api/adventure/pick', { bossId: 'ynu3', index: 0 }); assert.strictEqual(r.status, 409, '두 번 못 고름');
    r = await user('GET', '/api/save'); assert.strictEqual(r.data.adventure.offers.length, 0);
    // 입학 중에 고른 묶음은 잠긴 덱에 더해진다 (입학할 때마다 다시 묶음)
    r = await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck }); await user('POST', '/api/adventure/clear', { bossId: 'ynu1' });
    await dev('PUT', '/api/bosses', { bosses: [ boss('ynu1', { chapter: 'ynu', stage: 1, rewardChoice: ['들쥐', '책벌레', ADV] }), boss('ynu2', { chapter: 'ynu', stage: 2 }) ] });
    await user('POST', '/api/adventure/drop', { chapter: 'ynu' }); await user('POST', '/api/adventure/enroll', { chapter: 'ynu', deck });
    r = await user('POST', '/api/adventure/clear', { bossId: 'ynu1' }); assert(r.data.offer, '재입학해서 깨도 묶음 제안');
    r = await user('POST', '/api/adventure/pick', { bossId: 'ynu1', index: 0 });
    assert.strictEqual(r.data.run.deck.length, 32, '잠긴 덱 30 + 묶음 2장'); assert.deepStrictEqual(r.data.run.deck.slice(30), r.data.granted);
    r = await user('POST', '/api/adventure/pick', { bossId: 'free1', index: 0 }); assert.strictEqual(r.status, 404);
    console.log('✔ 보상 묶음 3개 중 하나 고르기 API');
    console.log('test-adventure: 모두 통과');
  } catch (e) { console.error(e); process.exitCode = 1; }
  server.close();
});
