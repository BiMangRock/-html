// tut-logic.js (v140) — 3·4부 튜토리얼의 화면 없는 규칙 도우미 (브라우저·Node 공용)
//  - 게임 규칙은 전부 실제 엔진(public/js/engine.js)이 처리한다. 여기서는 "대본"(정해진 시작 상태·상대 행동)을 엔진 행동으로 바꿔 줄 뿐
//  - server/test-tutorial-play.js 가 같은 대본을 화면 없이 끝까지 돌려서 대본이 엔진과 맞는지 검사한다
(function (root) {
  'use strict';
  const TL = {};
  TL.card = (E, n) => { const c = E.CARD_POOL.find(x => x.name === n); if (!c) throw new Error('카드 없음: ' + n); return c; };
  TL.mk = (E, s, n) => ({ ...structuredClone(TL.card(E, n)), inDeck: true, id: s.nextId++ });
  TL.minion = (E, s, n) => { const c = TL.mk(E, s, n); return { ...c, maxHp: c.hp, attacked: false, summoned: false }; };
  TL.findMin = (S, seat, name) => S.seats[seat].board.find(m => m.name === name && m.hp > 0);
  // 대본의 대상 {hero:0|1} | {seat, name} | {seat, any:true} → 엔진 대상
  TL.target = (S, t) => {
    if (!t) return null;
    if (t.hero != null) return { kind: 'hero', seat: t.hero };
    const m = t.any ? S.seats[t.seat].board.find(x => x.hp > 0 && !x.elusive) : TL.findMin(S, t.seat, t.name);   // any: 대상이 될 수 있는(모면 아닌) 첫 하수인
    if (!m) throw new Error('대상 하수인 없음: ' + JSON.stringify(t));
    return { kind: 'minion', seat: t.seat, id: m.id };
  };
  // 대본 대상과 실제 대상이 같은지 (any 는 그 편 하수인이면 다 맞음)
  TL.sameTarget = (S, want, got) => {
    if (!want && !got) return true;
    if (!want || !got) return false;
    if (want.hero != null) return got.kind === 'hero' && got.seat === want.hero;
    if (got.kind !== 'minion' || got.seat !== want.seat) return false;
    if (want.any) return true;
    const m = S.seats[got.seat].board.find(x => x.id === got.id);
    return !!m && m.name === want.name;
  };
  // 멀리건: swap 이름의 카드를 덱 맨 아래로 돌려보내고, get 이름의 카드를 덱에서 꺼내 같은 자리에 넣는다 (대본과 결과가 늘 같게)
  TL.mulligan = (S, seat, swap, get) => {
    const P = S.seats[seat];
    swap.forEach((n, i) => {
      const hi = P.hand.findIndex(c => c.name === n); if (hi < 0) throw new Error('멀리건: 손에 없음 ' + n);
      const di = P.deck.findIndex(c => c.name === get[i]); if (di < 0) throw new Error('멀리건: 덱에 없음 ' + get[i]);
      const [out] = P.hand.splice(hi, 1, P.deck.splice(di, 1)[0]);
      P.deck.unshift(out);
    });
  };
  // 상대 대본 한 줄 → 엔진 행동
  TL.enemyAction = (S, act) => {
    const P = S.seats[1];
    if (act.play || act.blockedPlay) {
      const n = act.play || act.blockedPlay, c = P.hand.find(x => x.name === n); if (!c) throw new Error('상대 손에 없음: ' + n);
      return { type: 'PLAY_CARD', cardId: c.id, target: act.target ? TL.target(S, act.target) : null };
    }
    if (act.attack || act.blockedAttack) {
      const n = act.attack || act.blockedAttack, m = TL.findMin(S, 1, n); if (!m) throw new Error('상대 하수인 없음: ' + n);
      return { type: 'ATTACK', attackerId: m.id, target: TL.target(S, act.target) };
    }
    if (act.power) return { type: 'HERO_POWER', target: act.target ? TL.target(S, act.target) : null };
    throw new Error('알 수 없는 상대 행동: ' + JSON.stringify(act));
  };
  // 막히는 행동(blockedPlay/blockedAttack)의 대상 검사 — 엔진이 거부해야 정상
  TL.isBlocked = act => !!(act.blockedPlay || act.blockedAttack);
  // 단계 → 정답 행동 (테스트·자동 진행용)
  TL.stepAction = (S, st) => {
    const P = S.seats[0];
    if (st.type === 'play') { const c = P.hand.find(x => x.name === st.card); if (!c) throw new Error('손에 없음: ' + st.card); return { type: 'PLAY_CARD', cardId: c.id, target: TL.target(S, st.target), ...(st.pos != null ? { pos: st.pos } : {}) }; }
    if (st.type === 'attack') { const m = TL.findMin(S, 0, st.attacker); if (!m) throw new Error('내 하수인 없음: ' + st.attacker); return { type: 'ATTACK', attackerId: m.id, target: TL.target(S, st.target) }; }
    if (st.type === 'power') return { type: 'HERO_POWER', target: TL.target(S, st.target) };
    if (st.type === 'end') return { type: 'END_TURN' };
    return null;
  };
  // 지금 공격할 수 있는 내 하수인 (엔진 규칙과 같은 조건)
  TL.canAttack = (S, m) => S.turn === 0 && !S.over && m.hp > 0 && m.atk > 0 && !m.frozen && !m.cantAttack &&
    !m.attacked && (!m.summoned || m.charge || m.rush);   // 질풍은 엔진이 첫 공격에 wfUsed 만 켜고 attacked 는 두 번째에 켠다

  if (typeof module !== 'undefined' && module.exports) module.exports = TL; else root.TL = TL;
})(typeof window !== 'undefined' ? window : globalThis);
