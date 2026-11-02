// test-tutorial-play.js — v140 3·4부 튜토리얼 대본을 실제 엔진으로 끝까지 돌려 본다 (화면 없이)
//  대본(public/tutorial/part*.js)이 정한 행동이 엔진에서 전부 성공하고, 막혀야 할 행동은 막히고, 마지막에 이기는지 확인한다.
const assert = require('assert');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const E = require(path.join(PUB, 'js', 'engine.js'));
const TL = require(path.join(PUB, 'tutorial', 'tut-logic.js'));

function load(file) { delete globalThis.TUT; delete require.cache[require.resolve(file)]; require(file); const T = globalThis.TUT; delete globalThis.TUT; return T; }
function run(T, log = () => {}) {
  let S = T.buildState(E, TL);
  const act = (a, seat) => { const r = E.apply(S, a, seat); if (!r.ok) throw new Error(`행동 실패 (${JSON.stringify(a)}): ${r.error}`); S = r.state; return r; };
  const choose = st => {                                       // 발견·선택 대기 → 대본의 pick
    while (S.pending) {
      const P = S.pending; assert(st.pick, `선택 대기인데 pick 이 없음: ${P.kind} @ ${st.title}`);
      const i = P.options.findIndex(o => o.name === st.pick); assert(i >= 0, `선택지에 ${st.pick} 없음: ${P.options.map(o => o.name)}`);
      act({ type: 'CHOOSE', index: i }, 0);
    }
  };
  for (const [i, st] of T.steps.entries()) {
    if (st.type === 'info' || st.type === 'look') { if (st.check) assert(st.check(S, E), `확인 실패 @${i} ${st.title}`); continue; }
    if (st.type === 'win') break;
    if (st.type === 'mulligan') { TL.mulligan(S, 0, st.swap, st.get); continue; }
    if (st.type === 'enemy') {
      for (const a of T.enemyTurns[st.turn].acts) {
        const ea = TL.enemyAction(S, a);
        if (TL.isBlocked(a)) { const r = E.apply(S, ea, 1); assert(!r.ok, `막혀야 하는 상대 행동이 성공함: ${JSON.stringify(a)}`); log(`  (막힘) ${r.error}`); continue; }
        act(ea, 1);
      }
      act({ type: 'END_TURN' }, 1); assert.strictEqual(S.turn, 0, '상대 턴 뒤 내 턴');
      continue;
    }
    if (st.type === 'attackAll') {
      for (let g = 0; g < 20 && !S.over; g++) {
        const m = S.seats[0].board.find(x => TL.canAttack(S, x)); if (!m) break;
        act({ type: 'ATTACK', attackerId: m.id, target: { kind: 'hero', seat: 1 } }, 0);
      }
      assert(S.over && S.winner === 0, `마무리 공격으로 이기지 못함 (상대 체력 ${S.seats[1].hp})`);
      continue;
    }
    if (st.blocked) { const r = E.apply(S, TL.stepAction(S, st), 0); assert(!r.ok, '막혀야 하는 행동이 성공함 @' + st.title); continue; }
    act(TL.stepAction(S, st), 0); choose(st);
    if (st.check) assert(st.check(S, E), `확인 실패 @${i} ${st.title}`);
    log(`  ${i} ${st.title} · 나 ${S.seats[0].hp}(+${S.seats[0].armor || 0}) 마나 ${S.seats[0].mana} · 상대 ${S.seats[1].hp}`);
  }
  assert(S.over && S.winner === 0, '대본 끝에서 승리해야 함');
  return S;
}
module.exports = { load, run };

if (require.main === module) {
  const verbose = process.argv.includes('-v');
  for (const f of ['part1.js', 'part2.js']) {
    const file = path.join(PUB, 'tutorial', f);
    if (!require('fs').existsSync(file)) continue;
    const T = load(file);
    for (let k = 0; k < 3; k++) run(T, verbose && k === 0 ? console.log : () => {});   // 같은 대본은 늘 같은 결과 (3번 돌려 확인)
    const visible = T.steps.filter(s => s.type !== 'enemy' && s.type !== 'win').length;
    console.log(`✔ ${f} 대본 끝까지 진행 · 승리 (단계 ${visible}개)`);
  }
  console.log('✔ 튜토리얼 대본 테스트 통과');
}
