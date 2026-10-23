// engine.js — 규칙·카드·봇 (화면 없음, 브라우저/Node 공용). 작업용 최신 엔진이며 analyze.js 가 이 파일을 쓴다.
// 새 버전을 낼 때 이 내용 전체를 vNN.html 의 <script id="engine"> 안에 그대로 복사해 넣는다 (그래서 각 html 은 단독으로 열리고 그 버전의 규칙이 보존된다).
// 규칙·카드를 고칠 때는 이 파일에서 고친 뒤, 새 버전 html 에 통째로 복사해 넣는다.
const VERSION = 'v28';   // ★ 버전을 올릴 때는 여기 한 줄만 고친다 (분석 결과·화면 배지에 자동 반영)
const CONFIG = {HERO_HP:30, MAX_MANA:10, MAX_HAND:10, MAX_BOARD:7, START_HAND:3, START_HAND_MAX:7, COPIES:2, DECK_SIZE:30,
  SECOND_HAND:1, COIN_MANA:2};
// 후공 보정: 시작 손패 +SECOND_HAND장, 그리고 주문 카드 '동전'(이번 턴 마나 +COIN_MANA) 1장. 선·후공 승률은 selfPlay(N, bot, bot)의 firstWins 로 잰다.
// 측정(같은 봇끼리, 선공 승률 / 초급·중급·중급2): 손패+1·동전+1 → 51 / 50 / 62%,  손패+1·동전+2 → 50 / 46 / 52% (채택),  손패+2·동전+1 → 44 / 40 / 50%

const CARD_POOL = [
  {type:'minion', name:"들쥐", cost:1, atk:1, hp:2},
  {type:'minion', name:"책벌레", cost:1, atk:1, hp:1, effect:{type:'draw', value:1}},
  {type:'minion', name:"은빛 신병", cost:1, atk:1, hp:1, shield:true},
  {type:'minion', name:"돌담 견습병", cost:1, atk:1, hp:3, taunt:true},
  {type:'minion', name:"견습 검사", cost:2, atk:2, hp:2},
  {type:'minion', name:"방패병", cost:2, atk:1, hp:4},
  {type:'minion', name:"약초꾼", cost:2, atk:1, hp:3, effect:{type:'heal', value:3}},
  {type:'minion', name:"훈련 교관", cost:2, atk:2, hp:1, effect:{type:'buff', value:1}},
  {type:'minion', name:"빛나는 파수병", cost:2, atk:1, hp:4, taunt:true},
  {type:'minion', name:"매의 눈 궁수", cost:2, atk:2, hp:1, effect:{type:'damage', value:1}},
  {type:'minion', name:"숲 늑대", cost:3, atk:3, hp:3},
  {type:'minion', name:"화염 정령", cost:3, atk:4, hp:2, effect:{type:'damage', value:2}},
  {type:'minion', name:"부족의 주술사", cost:3, atk:2, hp:3, effect:{type:'buff', value:1}},
  {type:'minion', name:"수정 골렘", cost:3, atk:2, hp:4, shield:true},
  {type:'minion', name:"강철 파수대장", cost:3, atk:2, hp:5, taunt:true},
  {type:'minion', name:"떠돌이 치유사", cost:3, atk:2, hp:2, effect:{type:'heal', value:4}},
  {type:'minion', name:"돌 골렘", cost:4, atk:3, hp:6},
  {type:'minion', name:"용병대장", cost:4, atk:4, hp:4, effect:{type:'draw', value:1}},
  {type:'minion', name:"대지 정령", cost:4, atk:4, hp:6, taunt:true},
  {type:'minion', name:"빛의 수호자", cost:4, atk:3, hp:4, shield:true},
  {type:'minion', name:"불사조", cost:4, atk:3, hp:3, charge:true, revive:true},
  {type:'minion', name:"늙은 사자", cost:5, atk:5, hp:5},
  {type:'minion', name:"벼락 마법사", cost:5, atk:4, hp:4, effect:{type:'damage', value:4}},
  {type:'minion', name:"시간의 마법사", cost:5, atk:2, hp:3, effect:{type:'gainMana', value:3}},
  {type:'minion', name:"서리 거인", cost:6, atk:6, hp:7},
  {type:'minion', name:"폭풍 부르는 자", cost:6, atk:5, hp:5, effect:{type:'damage', value:5}},
  {type:'minion', name:"심판관", cost:6, atk:4, hp:5, effect:{type:'sweep', value:3}},
  {type:'minion', name:"고대 용", cost:7, atk:8, hp:8, effect:{type:'buff', value:2}},
  {type:'minion', name:"고대의 수호룡", cost:7, atk:6, hp:9, taunt:true, shield:true},
  {type:'minion', name:"날쌘 척후병", cost:2, atk:1, hp:3, rush:true},
  // ---- 주문: 전장에 남지 않고 효과만 쓰고 사라진다. 수치는 잠정치 — selfPlay 로 재 가며 조정할 것 ----
  {type:'spell', name:"치유의 빛",   cost:1, school:['신성'], effect:{type:'heal', value:5}},
  {type:'spell', name:"침묵",        cost:1, school:['신성'], effect:{type:'silence'}},
  {type:'spell', name:"불꽃 화살",   cost:2, school:['화염'], effect:{type:'damage', value:3}},
  {type:'spell', name:"지식의 서",   cost:2, school:['비전'], effect:{type:'draw', value:2}},
  {type:'spell', name:"수호의 장벽", cost:2, school:['신성'], effect:{type:'giveShield'}},
  {type:'spell', name:"급습",       cost:2, effect:{type:'haste'}},
  {type:'spell', name:"처형",       cost:3, school:['암흑'], effect:{type:'execute', value:5}},
  {type:'spell', name:"불의 비",    cost:4, school:['화염'], effect:{type:'rain', value:2}},
  {type:'spell', name:"서리",       cost:2, school:['냉기'], effect:{type:'freeze'}},
  {type:'spell', name:"복제",       cost:2, school:['비전'], effect:{type:'copy'}},
  {type:'spell', name:"강화",       cost:2, school:['비전'], effect:{type:'enhance', value:2}},
  {type:'spell', name:"회수",       cost:2, school:['비전'], effect:{type:'recall'}},
  {type:'spell', name:"변이",       cost:3, school:['비전'], effect:{type:'transform'}},
  {type:'spell', name:"번개",       cost:1, school:['자연'], effect:{type:'bolt', value:2}},
  {type:'spell', name:"화염구",     cost:4, school:['화염'], effect:{type:'damage', value:6}},
  {type:'spell', name:"대폭발",     cost:6, school:['비전'], effect:{type:'wipe', value:6}},
  {type:'spell', name:"주문 발견",  cost:1, school:['비전'], effect:{type:'discover', value:1}},   // value = 비용 할인
  {type:'spell', name:"피의 서약",  cost:2, school:['암흑'], lifeCost:true, effect:{type:'discover', min:5, value:2}},   // lifeCost: 마나 대신 생명력으로 지불 / min·max: 발견할 주문의 비용 범위
  {type:'spell', name:"불꽃 점괘",  cost:3, school:['화염'], effect:{type:'damageDiscover', value:2, max:3}},
  {type:'spell', name:"사냥개 떼",  cost:4, school:['자연'], effect:{type:'summon', count:3, atk:3, hp:1, token:'질주 사냥개'}},   // 속공 3/1 세 마리 소환 (이름은 임의로 정함)
  {type:'spell', name:"철벽 소집", cost:6, school:['신성'], effect:{type:'muster', total:6}},                                      // v26: 비용 합 6이 되도록 하수인 무작위 소환 + 도발 (이름은 임의로 정함)
  {type:'spell', name:"혼돈의 주문서", cost:10, school:['지옥'], effect:{type:'chaos', value:10}},                                  // v26: 무작위 주문 10회 사용 (이름은 임의로 정함)
  {type:'spell', name:"고대의 축복", cost:3, school:['자연'], twin:true, effect:{type:'enhance', value:1}},                         // v28: 이중 주문 — 아군 하수인 +1/+1
  {type:'spell', name:"숲의 지원군", cost:8, school:['자연'], twin:true, effect:{type:'summon', count:5, atk:2, hp:2, token:'나무정령', rush:false}},   // v28: 이중 주문 — 2/2 나무정령 5기 소환 (속공 아님)
  {type:'spell', name:"일식",       cost:2, school:['자연'], effect:{type:'eclipse'}},                                                         // v28: 이번 턴에 시전하는 다음 주문을 2번 시전
  {type:'spell', name:"공중활강",   cost:7, school:['자연'], effect:{type:'glide', atk:1, hp:1, token:'활강병'}},                    // 속공 1/1 로 전장을 가득 채움. 이번 턴에 모두 죽으면 같은 수만큼 다시 소환
];
const EFFECT_TEXT = {
  mana: v=>`주문: 이번 턴 마나 ${v} 얻기`,
  gainMana: v=>`전투의 함성: 이번 턴 마나 +${v}`,
  sweep: v=>`전투의 함성: 적 하수인 전체에 ${v} 피해`,
  draw: v=>`전투의 함성: 카드 ${v}장 뽑기`,
  damage: v=>`전투의 함성: 대상에게 ${v} 피해`,
  heal: v=>`전투의 함성: 대상 체력 ${v} 회복`,
  buff: v=>`전투의 함성: 아군 하수인 +${v}/+${v}`,
};
// ---- 주문 효과 레지스트리: 효과 하나 = 한 덩어리 ----------------------------------------------
// 새 주문 효과를 만들 때는 여기에 항목 하나만 추가하면 된다 (CARD_POOL 에 카드 한 줄은 별도).
//   text(v)                       카드에 표시되는 문구
//   needsTarget                   true 면 대상이 하나도 없을 때 낼 수 없다
//   targets(s, seat, e)           선택 가능한 대상 목록 (없으면 대상 없는 주문)
//   blocked(s, seat)              (선택) 지금 쓰면 안 되는 이유(문자열) — 낭비 방지용
//   cast(s, seat, c, target, ev, src)   실제 효과 적용
//   rank                          (선택) rule2 봇이 내는 순서: 낮을수록 먼저
//   worth(view, card, t, ctx, h)  (선택) rule2 봇의 대상 점수. 3 이상이면 낼 가치가 있다고 본다 (h = {val, W, m, mineSide})
//   ruleUse(view, acts, h)        (선택) rule 봇의 사용 규칙. 행동 하나 또는 null (h = {minionOf, cardOf})
// 아래 기존 10종(damage~copy)의 봇 로직은 아직 봇 안에 있고, 새 효과(enhance/recall/transform)부터 레지스트리에 둔다.
function nextRand(s){ let t=(s.seed=(s.seed+0x6D2B79F5)|0); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }   // 상태 안의 seed 로 만드는 난수 (mulberry32)
// ---- v27 주문 속성: 카드의 school 배열 (비어 있거나 없으면 무속성). 한 카드가 속성을 둘 이상 가질 수도 있다 ----
const SCHOOLS = ['비전','지옥','화염','냉기','신성','암흑','자연'];   // Arcane · Fel · Fire · Frost · Holy · Shadow · Nature
function spellPool(o={}){                                      // 주문 후보를 한 곳에서 고른다. o: {school, min, max, skip(제외할 효과 종류 배열)}
  return CARD_POOL.filter(x=>x.type==='spell' && x.effect && !(o.skip||[]).includes(x.effect.type)
    && (!o.school || (x.school||[]).includes(o.school)) && x.cost>=(o.min||0) && x.cost<=(o.max ?? 99));
}
const DISCOVER_FX = ['discover','damageDiscover'];            // 발견 카드끼리는 서로의 후보가 되지 않는다
function startDiscover(s, seat, e, ev, src, auto){             // e: {kind, min, max, value(비용 할인)} / auto: true 면 선택 창 없이 3장 중 무작위로 바로 고른다 (혼돈의 주문서 안에서)
  const all=spellPool({skip:DISCOVER_FX, school:e.school});   // 전체 주문풀 (발견 카드끼리는 제외. e.school 이 있으면 그 속성만)
  const lo=e.min||0, hi=e.max ?? 99, inRange=x=>x.cost>=lo && x.cost<=hi, opts=[];
  const take=bag=>{ const o={...bag.splice(Math.floor(nextRand(s)*bag.length),1)[0]}; delete o.lifeCost; opts.push(o); };   // 발견한 카드는 마나로 쓴다
  const main=all.filter(inRange);
  while(opts.length<3 && main.length) take(main);                // 1) 비용 범위 안의 주문에서 무작위로
  const rest=all.filter(x=>!inRange(x)), dist=x=>x.cost<lo ? lo-x.cost : x.cost-hi;
  while(opts.length<3 && rest.length){                           // 2) 범위 안이 3장보다 적으면, 범위에 가장 가까운(비싼) 주문으로 채워 항상 3장 중 선택하게 한다
    const near=Math.min(...rest.map(dist)), tier=rest.filter(x=>dist(x)===near);
    const pick=tier[Math.floor(nextRand(s)*tier.length)]; rest.splice(rest.indexOf(pick),1);
    const o={...pick}; delete o.lifeCost; opts.push(o);
  }
  if(!opts.length){ ev.push({type:'ignored', seat, src}); return; }
  if(auto){                                                      // 분기: 혼돈의 주문서 안에서는 pending 을 만들지 않고 무작위로 하나를 손에 넣는다 (CHOOSE 와 같은 처리)
    const o=opts[Math.floor(nextRand(s)*opts.length)], P=s.seats[seat], card={...o, cost:Math.max(0, o.cost-(e.value||0)), id:s.nextId++};
    const burned=P.hand.length>=CONFIG.MAX_HAND; if(!burned) P.hand.push(card);
    ev.push({type:'discoverPick', seat, name:card.name, cost:card.cost, burned, auto:true});
    return;
  }
  s.pending={kind:'discover', seat, discount:e.value||0, options:opts};
  ev.push({type:'discover', seat, src});
}
const boltTargets = board => [...board].sort((a,b)=>b.atk-a.atk).slice(0,2);   // 번개: 공격력이 높은 둘 (동률이면 먼저 낸 하수인)
const minsOf = (s, sd) => s.seats[sd].board.map(m=>minionT(sd, m.id));
const onMinion = fn => (s, seat, c, target, ev, src) => {           // 대상 하수인이 없으면 '효과 무시'
  const t = target && target.kind==='minion' ? findMinion(s, target.seat, target.id) : null;
  if(!t){ ev.push({type:'ignored', seat, src}); return; }
  fn(t, s, seat, c, target, ev, src);
};
const viaBattlecry = (s, seat, c, target, ev) => battlecry(s, seat, {name:c.name, effect:c.effect}, target, ev);   // 피해·회복·드로우는 전투의 함성과 같은 처리

// ---- v24 소환 주문 도우미 ----
const freeSlots = (s, seat) => CONFIG.MAX_BOARD - s.seats[seat].board.length;
function summonTokens(s, seat, n, tok, ev){                    // tok: {name, atk, hp}. 빈 자리만큼만 소환한다 (속공)
  const P=s.seats[seat], ids=[], bf=(P.mods&&P.mods.buff)||0;
  for(let i=0; i<n && P.board.length<CONFIG.MAX_BOARD; i++){
    const m={type:'minion', name:tok.name, cost:1, atk:tok.atk, hp:tok.hp+bf, maxHp:tok.hp+bf, id:s.nextId++, attacked:false, summoned:true};
    if(tok.rush!==false) m.rush=true;                          // tok.rush===false 면 속공 없는 토큰 (숲의 지원군)
    P.board.push(m); ids.push(m.id);
    ev.push({type:'summon', seat, id:m.id, name:m.name});
  }
  return ids;
}
function checkGlide(s, ev){                                    // 공중활강: 그 턴에 소환한 하수인이 모두 죽으면 같은 수만큼 한 번 더 소환
  for(const seat of [0,1]){
    const P=s.seats[seat], g=P.glide;
    if(!g) continue;
    if(g.turnNo!==s.turnNo){ delete P.glide; continue; }       // 턴이 넘어가면 효과 끝
    for(const x of ev) if(x.type==='death' && x.seat===seat && g.ids.includes(x.id) && !g.dead.includes(x.id)) g.dead.push(x.id);
    if(g.dead.length>=g.ids.length){
      delete P.glide;                                          // 한 번만
      ev.push({type:'glide', seat, count:g.n, name:g.src});
      summonTokens(s, seat, g.n, g.tok, ev);
    }
  }
}

// ---- v26 철벽 소집 / 혼돈의 주문서 도우미 ----
function musterPick(s, total, slots){                          // 비용 합이 정확히 total 이 되는 하수인 조합 (0코스트 제외, 최대 slots 기)
  const pool=CARD_POOL.filter(c=>c.type==='minion' && c.cost>=1), out=[];
  let rem=total, k=slots;
  const ok=(r,n)=> r===0 || (n>0 && r<=7*n);                   // 남은 비용을 남은 자리로 채울 수 있는가 (1~7코가 모두 있으므로 7*n 이하면 항상 가능)
  while(rem>0 && k>0){
    const cands=pool.filter(c=>c.cost<=rem && ok(rem-c.cost, k-1));
    if(!cands.length) break;
    const c=cands[Math.floor(nextRand(s)*cands.length)];
    out.push(c); rem-=c.cost; k--;
  }
  return out;
}
function summonMuster(s, seat, cards, ev){                      // 도발을 얻은 채 소환 (전투의 함성은 발동하지 않는다)
  const P=s.seats[seat], bf=(P.mods&&P.mods.buff)||0;
  for(const c of cards){
    if(P.board.length>=CONFIG.MAX_BOARD) break;
    const m={type:'minion', name:c.name, cost:c.cost, atk:c.atk, hp:c.hp+bf, maxHp:c.hp+bf, taunt:true, id:s.nextId++, attacked:false, summoned:true};
    if(c.shield) m.shield=true; if(c.charge) m.charge=true; if(c.rush) m.rush=true; if(c.revive) m.revive=true;
    P.board.push(m);
    ev.push({type:'summon', seat, id:m.id, name:m.name});
  }
}
const CHAOS_SKIP = ['chaos'];                                   // 혼돈의 주문서가 뽑지 않는 주문: 자기 자신뿐 (발견 계열도 뽑히되 auto 로 무작위 선택)
function castChaos(s, seat, c, ev){
  // v27: 후보는 자기 자신을 뺀 모든 주문. 자리·대상이 없어 쓸 수 없는 주문이 뽑히면 그 시전은 불발(1회로 센다)
  const times=c.effect.value, pool=spellPool({skip:CHAOS_SKIP});
  for(let i=0;i<times;i++){
    sweepDead(s, ev); checkGlide(s, ev);                        // 앞 주문으로 죽은 하수인을 치우고, 그 다음 주문을 고른다
    if(s.seats[0].hp<=0 || s.seats[1].hp<=0) break;             // 영웅이 쓰러지면 중단
    const sp=pool[Math.floor(nextRand(s)*pool.length)], fx=SPELL_FX[sp.effect.type], ts=cardTargets(s, seat, sp);
    ev.push({type:'spell', seat, name:sp.name, gain:0, chaos:true, card:{type:'spell', name:sp.name, cost:sp.cost, effect:sp.effect, twin:sp.twin}});
    const fizzle = (fx.needsTarget && ts.length===0) || (fx.blocked && fx.blocked(s, seat))
                || (sp.effect.type==='recall' && s.seats[seat].hand.length>=CONFIG.MAX_HAND);   // 대상 없음 · 전장이 가득/비어 있음 · 손패가 가득 찬 회수
    if(fizzle){ ev.push({type:'ignored', seat, fizzle:true, src:{seat, name:sp.name}}); continue; }
    const target=ts.length ? ts[Math.floor(nextRand(s)*ts.length)] : null;   // 대상도 무작위 (아군도 맞을 수 있다)
    castSpell(s, seat, {...sp, auto:true}, target, ev);         // auto: 발견 계열이 선택 창 대신 무작위로 고르게 한다
  }
}
// ---- v28 일식 도우미: 일식을 낸 뒤 2번 시전할 만한 주문이 손패에 있고 마나가 남는가 (봇 판단용) ----
const ECLIPSE_BAD = ['mana','eclipse','glide','haste'];       // 2번 시전해도 이득이 없는 주문
function eclipseHasPartner(view, c){
  if(view.me.eclipse) return false;                           // 이미 걸려 있으면 또 쓰지 않는다
  const left=view.me.mana-c.cost;
  return view.me.hand.some(x=>x.id!==c.id && x.type==='spell' && !x.lifeCost && x.effect && x.cost<=left && !ECLIPSE_BAD.includes(x.effect.type)
    && (!needsTarget(x) || view.legal.some(a=>a.type==='PLAY_CARD' && a.cardId===x.id)));
}
const SPELL_FX = {
  mana:   { text:v=>`주문: 이번 턴 마나 ${v} 얻기`, cast:(s,seat,c)=>{ s.seats[seat].mana+=c.effect.value; } },
  damage: { text:v=>`대상에게 ${v} 피해`, needsTarget:true, rank:1, cast:viaBattlecry,
            targets:(s,seat)=>[heroT(other(seat)), ...minsOf(s,other(seat)), heroT(seat), ...minsOf(s,seat)] },
  heal:   { text:v=>`대상 체력 ${v} 회복`, needsTarget:true, rank:3, cast:viaBattlecry,
            targets:(s,seat)=>[heroT(seat), ...minsOf(s,seat)] },
  draw:   { text:v=>`카드 ${v}장 뽑기`, rank:0, cast:viaBattlecry },
  silence:{ text:()=>`적 하수인의 도발·보호막 제거`, needsTarget:true, rank:1,
            targets:(s,seat)=>s.seats[other(seat)].board.filter(m=>m.taunt||m.shield).map(m=>minionT(other(seat), m.id)),   // 도발·보호막이 있는 적만
            cast:onMinion(t=>{ t.taunt=false; t.shield=false; }) },
  giveShield:{ text:()=>`아군 하수인에게 보호막 부여`, needsTarget:true, rank:4,
            targets:(s,seat)=>s.seats[seat].board.filter(m=>!m.shield).map(m=>minionT(seat, m.id)),                         // 보호막 없는 아군만
            cast:onMinion(t=>{ t.shield=true; }) },
  haste:  { text:()=>`방금 소환한 아군 하수인이 바로 공격 가능`, needsTarget:true, rank:5,
            targets:(s,seat)=>s.seats[seat].board.filter(m=>m.summoned && !m.charge).map(m=>minionT(seat, m.id)),          // 소환 직후 아군만
            cast:onMinion(t=>{ t.summoned=false; }) },
  execute:{ text:v=>`공격력 ${v} 이상인 적 하수인 처치 (보호막 무시)`, needsTarget:true, rank:1,
            targets:(s,seat,e)=>s.seats[other(seat)].board.filter(m=>m.atk>=e.value).map(m=>minionT(other(seat), m.id)),   // 공격력 기준 이상인 적만
            cast:onMinion((t,s,seat,c,target,ev,src)=>{ const amt=t.hp; t.shield=false; t.hp=0;                              // 보호막 무시 (부활은 sweepDead 에서 평소대로)
              ev.push({type:'damage', target, name:t.name, amount:amt, absorbed:false, cause:'battlecry', src}); }) },
  freeze: { text:()=>`적 하수인 하나를 얼린다 (다음 턴 공격 불가)`, needsTarget:true, rank:1,
            targets:(s,seat)=>s.seats[other(seat)].board.filter(m=>!m.frozen).map(m=>minionT(other(seat), m.id)),           // 아직 얼지 않은 적만
            cast:onMinion(t=>{ t.frozen=true; }) },
  copy:   { text:()=>`손패의 하수인 한 장을 복제`, needsTarget:true, rank:0,
            targets:(s,seat)=>s.seats[seat].hand.filter(c=>c.type!=='spell').map(c=>({kind:'hand', seat, id:c.id})),       // 손패의 하수인 (대상이 손패 카드)
            cast:(s,seat,c,target,ev,src)=>{
              const P=s.seats[seat], orig = target && target.kind==='hand' ? P.hand.find(x=>x.id===target.id) : null;
              if(!orig || P.hand.length>=CONFIG.MAX_HAND){ ev.push({type:'ignored', seat, src}); return; }
              P.hand.push({...orig, id:s.nextId++});
              ev.push({type:'copy', seat, name:orig.name, src}); } },            // name: 상대가 쓴 경우 화면에서 숨긴다
  rain:   { text:v=>`적 하수인 전체에 ${v} 피해`, rank:1,
            blocked:(s,seat)=> s.seats[other(seat)].board.length===0 ? '적 하수인이 없습니다.' : null,                         // 적 필드가 비면 낭비라 막는다
            cast:(s,seat,c,target,ev,src)=>{
              const foes=[...s.seats[other(seat)].board];
              if(!foes.length){ ev.push({type:'ignored', seat, src}); return; }
              foes.forEach(t=>hurtMinion(s, other(seat), t, c.effect.value, ev, 'battlecry', src)); } },
  fatigue:{ text:v=>`덱이 비어 영웅이 ${v} 피해를 입는다` },                       // 표시 전용 (탈진 연출 카드)

  // ---- v20 발견: 주문을 내면 무작위 3장이 제시되고, 하나를 고를 때까지 게임이 멈춘다 (state.pending) ----
  discover:{ text:(v,e)=>`${e.min?`비용 ${e.min} 이상 `:''}${e.max!==undefined?`비용 ${e.max} 이하 `:''}주문 1장을 발견합니다 (3장 중 선택${v?`, 비용 -${v}`:''})`, rank:0,
            cast:(s,seat,c,target,ev,src)=>startDiscover(s, seat, {kind:c.effect.kind, min:c.effect.min, max:c.effect.max, value:c.effect.value}, ev, src, c.auto),
            spellWorth:(c,view)=> view.me.hand.length<=8 && (!c.lifeCost || view.me.hp>c.cost+10) ? 4 : 0,                         // 생명력 비용 카드는 체력이 넉넉할 때만
            ruleUse:(view,acts)=> acts.find(a=>{ const c=view.me.hand.find(x=>x.id===a.cardId); return view.me.hand.length<=8 && (!c.lifeCost || view.me.hp>c.cost+10); }) || null },
  damageDiscover:{ text:(v,e)=>`대상에게 ${v} 피해를 주고, 비용 ${e.max} 이하 주문 1장을 발견합니다`, needsTarget:true, rank:1,
            targets:(s,seat)=>[heroT(other(seat)), ...minsOf(s,other(seat)), heroT(seat), ...minsOf(s,seat)],
            cast:(s,seat,c,target,ev,src)=>{ battlecry(s, seat, {name:c.name, effect:{type:'damage', value:c.effect.value}}, target, ev);
              startDiscover(s, seat, {kind:'spell', max:c.effect.max, value:0}, ev, src, c.auto); },
            worth:(view,card,t,ctx,h)=>{ if(h.mineSide) return -1000; const v=card.effect.value, bonus=view.me.hand.length<=8 ? 3 : 0;   // 피해 + 발견의 가치
              if(t.kind==='hero') return (v>=view.opp.hp ? 1000 : v*ctx.faceW)+bonus;
              if(h.m.shield) return 1+bonus;
              return (h.m.hp<=v ? h.val(h.m)+h.W.tempo : v*0.4)+bonus; },
            ruleUse:(view,acts,h)=>{ if(view.me.hand.length>8) return null;
              const foe=a=>a.target.seat!==view.seat;
              return acts.find(a=>a.target.kind==='minion' && foe(a) && !h.minionOf(a.target).shield && h.minionOf(a.target).hp<=2) || acts.find(a=>a.target.kind==='hero' && foe(a)) || null; } },

  // ---- v19 새 주문 (대상을 고르지 않는 광역형) ----
  bolt:   { text:v=>`적 하수인 중 공격력이 높은 둘에게 ${v} 피해`, rank:1,
            blocked:(s,seat)=> s.seats[other(seat)].board.length===0 ? '적 하수인이 없습니다.' : null,
            cast:(s,seat,c,target,ev,src)=>{
              boltTargets(s.seats[other(seat)].board).forEach(t=>hurtMinion(s, other(seat), t, c.effect.value, ev, 'battlecry', src)); },
            spellWorth:(c,view,ctx,h)=>{ const v=c.effect.value; let w=0;                                          // 맞는 둘 중 죽는 것의 가치
              for(const m of boltTargets(view.opp.board)) w+= (!m.shield && m.hp<=v) ? h.val(m)+h.W.tempo : v*0.4;
              return Math.min(20, w); },
            ruleUse:(view,acts)=>{ const v=view.me.hand.find(x=>x.id===acts[0]?.cardId)?.effect.value;
              return acts.length && boltTargets(view.opp.board).some(m=>!m.shield && m.hp<=v) ? acts[0] : null; } },
  wipe:   { text:v=>`모든 하수인(양쪽)에게 ${v} 피해`, rank:1,
            blocked:(s)=> s.seats[0].board.length+s.seats[1].board.length===0 ? '하수인이 없습니다.' : null,
            cast:(s,seat,c,target,ev,src)=>{
              for(const sd of [other(seat), seat]) [...s.seats[sd].board].forEach(t=>hurtMinion(s, sd, t, c.effect.value, ev, 'battlecry', src)); },
            spellWorth:(c,view,ctx,h)=>{ const v=c.effect.value, f=m=>(!m.shield && m.hp<=v) ? h.val(m)+h.W.tempo : v*0.4;   // 적이 입는 손해 - 내가 입는 손해
              return Math.min(20, view.opp.board.reduce((a,m)=>a+f(m),0) - view.me.board.reduce((a,m)=>a+f(m),0)); },
            ruleUse:(view,acts)=>{ const v=view.me.hand.find(x=>x.id===acts[0]?.cardId)?.effect.value, k=b=>b.filter(m=>!m.shield && m.hp<=v).length;
              return acts.length && k(view.opp.board)-k(view.me.board)>=2 ? acts[0] : null; } },

  // ---- v18 새 주문 ----
  enhance:{ text:v=>`아군 하수인 +${v}/+${v}`, needsTarget:true, rank:4,
            targets:(s,seat)=>minsOf(s,seat),
            cast:onMinion((t,s,seat,c,target,ev,src)=>{ const v=c.effect.value; t.atk+=v; t.hp+=v; t.maxHp+=v;
              ev.push({type:'buff', target, name:t.name, value:v, src}); }),
            worth:(view,card,t,ctx,h)=>{ if(!h.mineSide||!h.m) return -1000; const m=h.m, ready=!m.attacked&&!m.frozen&&(!m.summoned||m.charge||m.rush);
              return 2+(ready?1.5:0)+m.atk*0.4+m.hp*0.25+(m.taunt?0.5:0); },
            ruleUse:(view,acts,h)=>{ let best=null, ba=1;                            // 바로 공격할 수 있는 공격력 2 이상 하수인 중 가장 센 것
              for(const a of acts){ const m=h.minionOf(a.target); if(m && !m.attacked && !m.frozen && (!m.summoned||m.charge||m.rush) && m.atk>ba){ ba=m.atk; best=a; } }
              return best; } },
  recall: { text:()=>`아군 하수인 하나를 손패로 되돌린다`, needsTarget:true, rank:1,
            targets:(s,seat)=>minsOf(s,seat),
            cast:onMinion((t,s,seat,c,target,ev,src)=>{
              const P=s.seats[seat], base=CARD_POOL.find(x=>x.name===t.name);
              const card = base ? {...base} : {type:'minion', name:t.name, cost:t.cost, atk:t.atk, hp:t.maxHp};   // 원래 능력치로 돌아간다 (성장·피해는 사라짐)
              card.cost=t.cost; card.id=s.nextId++;                                                              // 비용 감소 같은 보정은 유지
              P.board=P.board.filter(x=>x.id!==t.id); P.hand.push(card);
              ev.push({type:'recall', target, name:t.name, src}); }),
            worth:(view,card,t,ctx,h)=>{ if(!h.mineSide||!h.m) return -1000; const m=h.m, base=CARD_POOL.find(x=>x.name===m.name);
              return (m.hp*2<=m.maxHp ? 2.5 : 0) + (base&&base.effect ? 2.5 : 0) + (m.hp<=1 ? 1 : 0); },       // 죽어 가는 하수인을 살리거나 전투의 함성을 다시 쓸 때
            ruleUse:(view,acts,h)=>{ const hurt=acts.filter(a=>{ const m=h.minionOf(a.target); return m && m.hp*2<=m.maxHp && m.cost>=2; });
              return hurt.length ? hurt.reduce((x,y)=>h.minionOf(x.target).cost>=h.minionOf(y.target).cost?x:y) : null; } },
  transform:{ text:()=>`적 하수인 하나를 1/1 양으로 바꾼다`, needsTarget:true, rank:1,
            targets:(s,seat)=>minsOf(s,other(seat)),
            cast:onMinion((t,s,seat,c,target,ev,src)=>{ const from=t.name;
              t.name='양'; t.atk=1; t.hp=1; t.maxHp=1; t.taunt=false; t.shield=false; t.charge=false; t.rush=false; t.revive=false; delete t.effect;
              ev.push({type:'transform', target, name:from, to:'양', src}); }),
            worth:(view,card,t,ctx,h)=>{ if(h.mineSide||!h.m) return -1000; const m=h.m;                         // 비싼 하수인일수록 가치가 크다
              return Math.max(0, h.val(m)-5) + (m.taunt&&ctx.readyAtk>0 ? 1 : 0) + (ctx.danger ? m.atk*h.W.killThreat : 0); },
            ruleUse:(view,acts,h)=>{ const big=acts.filter(a=>{ const m=h.minionOf(a.target); return m && m.atk+m.hp>=9; });
              return big.length ? big.reduce((x,y)=>{ const a=h.minionOf(x.target), b=h.minionOf(y.target); return a.atk+a.hp>=b.atk+b.hp?x:y; }) : null; } },

  // ---- v26 ----
  muster: { text:(v,e)=>`비용의 합이 ${e.total}이 되도록 하수인을 무작위로 소환하고, 모두 도발을 얻는다 (0코스트 제외, 전투의 함성 없음)`, rank:2.5, summons:true,
            blocked:(s,seat)=> freeSlots(s,seat)<=0 ? '전장이 가득 찼습니다.' : null,
            cast:(s,seat,c,target,ev,src)=>{ summonMuster(s, seat, musterPick(s, c.effect.total, freeSlots(s,seat)), ev); },
            spellWorth:(c,view)=>{ const n=CONFIG.MAX_BOARD-view.me.board.length; return n>=2 ? 5 : n===1 ? 3 : 0; },
            ruleUse:(view,acts)=> acts.length && CONFIG.MAX_BOARD-view.me.board.length>=2 ? acts[0] : null },
  chaos:  { text:v=>`무작위 주문을 ${v}회 사용한다 (대상도 무작위, 발견은 자동 선택, 자리·대상이 없으면 불발)`, rank:2,
            cast:(s,seat,c,target,ev,src)=>{ castChaos(s, seat, c, ev); },
            spellWorth:()=>4,
            ruleUse:(view,acts)=> acts[0] || null },
  // ---- v28 일식: 이번 턴에 손에서 내는 다음 주문을 2번 시전 (apply 의 PLAY_CARD 가 플래그를 소모하고 state.recast 를 만든다) ----
  eclipse:{ text:()=>`이번 턴에 시전하는 다음 주문을 2번 시전한다 (대상은 다시 고르고, 발견은 한 번 더 한다)`, rank:-0.5,
            cast:(s,seat,c,target,ev,src)=>{ s.seats[seat].eclipse=true; ev.push({type:'eclipse', seat, src}); },
            spellWorth:(c,view)=> eclipseHasPartner(view, c) ? 4 : 0,
            ruleUse:(view,acts)=>{ const c=acts.length && view.me.hand.find(x=>x.id===acts[0].cardId); return c && eclipseHasPartner(view, c) ? acts[0] : null; } },
  // ---- v24 소환 주문 (속공 하수인) ----
  summon: { text:(v,e)=>`${e.rush===false?'':'속공 '}${e.atk}/${e.hp} 「${e.token}」 ${e.count}마리를 소환한다 (빈 자리만큼만)`, rank:2.5, summons:true,
            blocked:(s,seat)=> freeSlots(s,seat)<=0 ? '전장이 가득 찼습니다.' : null,
            cast:(s,seat,c,target,ev,src)=>{ summonTokens(s, seat, c.effect.count, {name:c.effect.token, atk:c.effect.atk, hp:c.effect.hp, rush:c.effect.rush}, ev); },
            spellWorth:(c,view,ctx,h)=>{ const e=c.effect, n=Math.min(e.count, CONFIG.MAX_BOARD-view.me.board.length);
              return n>=2 ? Math.min(20, n*h.val({atk:e.atk, hp:e.hp})) : 0; },
            ruleUse:(view,acts)=> acts.length && CONFIG.MAX_BOARD-view.me.board.length>=2 ? acts[0] : null },
  glide:  { text:(v,e)=>`속공 ${e.atk}/${e.hp} 「${e.token}」으로 내 전장을 가득 채운다. 이번 턴에 모두 죽으면 같은 수만큼 다시 소환한다`, rank:2.5, summons:true,
            blocked:(s,seat)=> freeSlots(s,seat)<=0 ? '전장이 가득 찼습니다.' : null,
            cast:(s,seat,c,target,ev,src)=>{
              const e=c.effect, tok={name:e.token, atk:e.atk, hp:e.hp}, ids=summonTokens(s, seat, freeSlots(s,seat), tok, ev);
              if(ids.length) s.seats[seat].glide={turnNo:s.turnNo, ids, n:ids.length, tok, dead:[], src:c.name}; },
            spellWorth:(c,view,ctx,h)=>{ const e=c.effect, n=CONFIG.MAX_BOARD-view.me.board.length;
              return n>=3 ? Math.min(20, n*h.val({atk:e.atk, hp:e.hp})+2) : 0; },
            ruleUse:(view,acts)=> acts.length && CONFIG.MAX_BOARD-view.me.board.length>=3 ? acts[0] : null },
};
// 동전: 덱(CARD_POOL)에는 들어가지 않고, 후공이 시작할 때 손패로 받는다. (그 밖의 주문은 CARD_POOL 에 있어 덱에 넣을 수 있다)
function makeCoin(){ return {type:'spell', name:'동전', cost:0, effect:{type:'mana', value:CONFIG.COIN_MANA}}; }
function effectText(c){ return c.effect ? (c.twin ? '이중 주문. ' : '') + (c.lifeCost ? `마나 대신 생명력 ${c.cost} 지불. ` : '') + (c.type==='spell' ? SPELL_FX[c.effect.type].text : EFFECT_TEXT[c.effect.type])(c.effect.value, c.effect) : ''; }
const needsTarget = c => c.type==='spell' && !!(SPELL_FX[c.effect.type] && SPELL_FX[c.effect.type].needsTarget);   // 대상이 하나도 없으면 낼 수 없는 주문
const NO_TARGET_FX=['draw','sweep','gainMana'];   // 대상을 고르지 않는 전투의 함성

// ---- 덱 목록: 카드 이름의 배열 (같은 카드는 이름이 여러 번 나온다). 서버에서도 같은 검증을 쓴다 ----
function validateDeckList(names){
  if(!Array.isArray(names)) return '덱 형식이 올바르지 않습니다.';
  if(names.length!==CONFIG.DECK_SIZE) return `덱은 정확히 ${CONFIG.DECK_SIZE}장이어야 합니다.`;
  const cnt={};
  for(const n of names){
    if(!CARD_POOL.some(c=>c.name===n)) return '존재하지 않는 카드가 있습니다.';
    cnt[n]=(cnt[n]||0)+1;
    if(cnt[n]>CONFIG.COPIES) return `같은 카드는 최대 ${CONFIG.COPIES}장까지 넣을 수 있습니다.`;
  }
  return null;
}
// 추천 덱: 하수인 11종 × 2장 + 주문 8장 = 30장 (마나 곡선 1코 5 · 2코 9 · 3코 4 · 4코 4 · 5코 4 · 6코 2 · 7코 2)
const DEFAULT_DECK_PAIRS=["돌담 견습병","견습 검사","빛나는 파수병","숲 늑대","화염 정령",
  "불사조","대지 정령","늙은 사자","벼락 마법사","서리 거인","고대 용"];
const DEFAULT_DECK_SPELLS=["불꽃 화살","불꽃 화살","치유의 빛","치유의 빛","지식의 서","지식의 서","침묵","수호의 장벽"];
const defaultDeckList = () => [...DEFAULT_DECK_PAIRS.flatMap(n=>[n,n]), ...DEFAULT_DECK_SPELLS];   // DECK_SIZE 를 바꾸면 같이 맞출 것

// ---- AI 랜덤 덱 빌더 (v17) ----
// 카드 이름이 아니라 cost/type 속성만 본다 → CARD_POOL 에 카드를 추가해도 이 코드는 고칠 필요가 없다.
// 마나 곡선 틀(합 DECK_SIZE)을 게임마다 조금 흔든 뒤, 코스트별로 카드를 무작위 추첨한다.
const AI_CURVE = {1:5, 2:7, 3:6, 4:5, 5:3, 6:2, 7:2};      // 합 30, 평균 코스트 약 3.3 (DECK_SIZE 를 바꾸면 같이 맞출 것)
const AI_DECK_RULE = {minMinions:16, minCheap:18, cheapCost:4, tries:10};
function buildRandomDeck(rng=Math.random){
  const costs=[...new Set(CARD_POOL.map(c=>c.cost))].sort((a,b)=>a-b);
  let best=null;
  for(let t=0;t<AI_DECK_RULE.tries;t++){
    const curve={...AI_CURVE};
    for(let i=0;i<3;i++){                                    // 곡선 흔들기: 한 칸에서 빼서 다른 칸에 더함 (합 유지)
      const a=costs[Math.floor(rng()*costs.length)], b=costs[Math.floor(rng()*costs.length)];
      if((curve[a]||0)>1){ curve[a]--; curve[b]=(curve[b]||0)+1; }
    }
    const deck=[], used={};
    const take=c=>{ deck.push(c.name); used[c.name]=(used[c.name]||0)+1; };
    const free=c=>(used[c.name]||0)<CONFIG.COPIES;
    for(const cost of costs){
      for(let need=curve[cost]||0; need>0; need--){
        const pool=CARD_POOL.filter(c=>c.cost===cost && free(c));
        if(!pool.length) break;                              // 이 코스트 카드가 모자라면 아래에서 보충
        take(pool[Math.floor(rng()*pool.length)]);
      }
    }
    while(deck.length<CONFIG.DECK_SIZE){                     // 부족분 보충: 남은 카드 중 무작위
      const pool=CARD_POOL.filter(free);
      if(!pool.length) break;
      take(pool[Math.floor(rng()*pool.length)]);
    }
    best=deck;
    const cards=deck.map(n=>CARD_POOL.find(c=>c.name===n));
    const minions=cards.filter(c=>c.type==='minion').length;
    const cheap=cards.filter(c=>c.cost<=AI_DECK_RULE.cheapCost).length;
    if(deck.length===CONFIG.DECK_SIZE && minions>=AI_DECK_RULE.minMinions && cheap>=AI_DECK_RULE.minCheap) break;   // 합격
  }
  return best;
}

const other = seat => 1 - seat;
const tkey = t => t ? `${t.kind}:${t.seat}:${t.id ?? ''}` : 'none';
const heroT = seat => ({kind:'hero', seat});
const minionT = (seat, id) => ({kind:'minion', seat, id});
const findMinion = (s, seat, id) => s.seats[seat].board.find(m=>m.id===id);

function shuffle(a, rng){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

// ---- 게임 생성 ----
// opts.mods = [좌석0 치트, 좌석1 치트]. 치트는 좌석에 붙는 데이터일 뿐이고, 비어 있으면 기본 규칙과 완전히 같다.
//   hp(영웅 체력+N) startMana(첫 턴 마나 N) startHand(시작 손패+N, 최대 START_HAND_MAX) startBoard(시작 하수인 N기)
//   costDown(덱 하수인 비용-N) manaBonus(매 턴 추가 마나+N) buff(소환 시 체력 +N) armor(영웅 받는 피해-N)
//   extraDraw(N: 이 좌석의 첫 N턴 동안 매 턴 2장 / true: 영구) doubleBattlecry(true: 전투의 함성 두 번)
function newGame(rng=Math.random, opts={}){
  // 선공: opts.first(0|1)로 지정하지 않으면 무작위. 후공 좌석은 보정(시작 손패 +, 동전)을 받는다.
  const first = (opts.first===0 || opts.first===1) ? opts.first : (rng()<0.5 ? 0 : 1);
  const s = {turn:first, first, turnNo:0, over:false, winner:null, nextId:1, seats:[], seed:Math.floor(rng()*2147483646)+1, pending:null, recast:null};   // pending: 선택 대기 — 발견 {kind:'discover', seat, discount, options} / v28 대상 {kind:'target', seat, card, targets}. recast: 일식의 두 번째 시전 예약 {seat, card}
  for(let seat=0; seat<2; seat++){
    const mods={...((opts.mods && opts.mods[seat]) || {})};
    const deck=[];
    // opts.decks[seat] = 카드 이름 배열. 없거나 규칙에 어긋나면 기본 덱(모든 카드 COPIES장씩)을 쓴다.
    const wanted=(opts.decks && opts.decks[seat]) || null;
    const names=(wanted && !validateDeckList(wanted)) ? wanted : null;
    const src=names ? names.map(n=>CARD_POOL.find(c=>c.name===n)) : CARD_POOL.flatMap(c=>Array(CONFIG.COPIES).fill(c));
    src.forEach(c=>deck.push({...c, cost:c.type==='spell' ? c.cost : Math.max(0, c.cost-(mods.costDown||0)), id:s.nextId++}));   // costDown 은 하수인만
    shuffle(deck, rng);
    const maxHp=CONFIG.HERO_HP+(mods.hp||0);
    s.seats.push({hp:maxHp, maxHp, mana:0, maxMana:mods.startMana?Math.max(0, mods.startMana-1):0, deck, hand:[], board:[], mods});
  }
  for(let seat=0; seat<2; seat++){
    const P=s.seats[seat];
    drawCards(s, seat, Math.min(CONFIG.START_HAND_MAX, CONFIG.START_HAND+(seat===first ? 0 : CONFIG.SECOND_HAND)+(P.mods.startHand||0)), null);
    if(seat!==first) P.hand.push({...makeCoin(), id:s.nextId++});      // 후공: 동전 1장
    for(let k=0;k<(P.mods.startBoard||0) && P.board.length<CONFIG.MAX_BOARD;k++)
      P.board.push({id:s.nextId++, name:'보초병', cost:1, atk:1, hp:2, maxHp:2, attacked:false, summoned:false});
  }
  startTurn(s, first, []);      // 선공도 정상적으로 턴 시작 처리(마나 1)
  return s;
}

// ---- 내부 변경 함수 (복제본 s 에만 사용) ----
function drawCards(s, seat, n, ev, src){
  const P=s.seats[seat]; let drawn=0, burned=0;
  for(let i=0;i<n;i++){
    if(!P.deck.length){      // 탈진: 덱이 빈 채로 카드를 뽑아야 할 때마다 영웅이 피해를 입는다. 1, 2, 3, ... 으로 계속 늘어난다 (좌석별)
      P.fatigue=(P.fatigue||0)+1;
      const evs=ev||[];
      evs.push({type:'fatigue', seat, amount:P.fatigue});
      hurtHero(s, seat, P.fatigue, evs, 'fatigue', src);
      continue;
    }
    const c=P.deck.pop();
    if(P.hand.length<CONFIG.MAX_HAND){ P.hand.push(c); drawn++; } else burned++;
  }
  if(ev && (drawn||burned)) ev.push({type:'draw', seat, count:drawn, burned, src:src||null});
}
function startTurn(s, seat, ev){
  const P=s.seats[seat];
  s.turn=seat; s.turnNo++;
  P.maxMana=Math.min(CONFIG.MAX_MANA, P.maxMana+1);   // 마나는 플레이어별로 따로 관리
  const md=P.mods||{};
  P.turns=(P.turns||0)+1;                              // 이 좌석이 진행한 턴 수
  P.mana=P.maxMana+(md.manaBonus||0);                 // 추가 마나는 그 턴에만 (최대 마나는 늘리지 않음)
  P.board.forEach(m=>{ m.attacked=false; m.summoned=false; });
  ev.push({type:'turn_start', seat, turnNo:s.turnNo});
  drawCards(s, seat, (md.extraDraw && (md.extraDraw===true || P.turns<=md.extraDraw)) ? 2 : 1, ev);
}
function hurtHero(s, seat, amount, ev, cause, src){
  amount=Math.max(0, amount-((s.seats[seat].mods||{}).armor||0));
  s.seats[seat].hp -= amount;
  ev.push({type:'damage', target:heroT(seat), name:null, amount, absorbed:false, cause, src:src||null});
}
function hurtMinion(s, seat, m, amount, ev, cause, src){
  const target=minionT(seat, m.id);
  if(m.shield){
    m.shield=false;
    ev.push({type:'damage', target, name:m.name, amount:0, absorbed:true, cause, src:src||null});
    return;
  }
  m.hp -= amount;
  ev.push({type:'damage', target, name:m.name, amount, absorbed:false, cause, src:src||null});
}
function sweepDead(s, ev){
  for(const seat of [0,1]){
    const P=s.seats[seat];
    P.board = P.board.filter(m=>{
      if(m.hp>0) return true;
      if(m.revive){ m.revive=false; m.hp=1; m.shield=false; ev.push({type:'revive', seat, id:m.id, name:m.name}); return true; }   // 부활: 1회, 체력 1로 (돌진은 유지)
      ev.push({type:'death', seat, id:m.id, name:m.name});
      return false;
    });
  }
}
function checkEnd(s, ev){
  if(s.over) return;
  const d0=s.seats[0].hp<=0, d1=s.seats[1].hp<=0;
  if(d0||d1){
    s.over=true;
    s.winner = (d0&&d1) ? null : (d0 ? 1 : 0);
    ev.push({type:'game_over', winner:s.winner});
  }
}

// ---- 전투의 함성 ----
// 카드를 낼 때 선택 가능한 대상(소환 전 상태 기준). 비어 있으면 대상 없음.
function cardTargets(s, seat, card){
  const e=card.effect; if(!e) return [];
  const mins = sd => s.seats[sd].board.map(m=>minionT(sd, m.id));
  if(card.type==='spell'){ const fx=SPELL_FX[e.type]; return fx && fx.targets ? fx.targets(s, seat, e) : []; }
  if(e.type==='heal')   return [heroT(seat), ...mins(seat)];
  if(e.type==='buff')   return mins(seat);
  // 피해: 적·아군 모두 대상 가능 (소환 전 상태 기준이라 방금 낸 자기 자신은 대상이 아님)
  if(e.type==='damage') return [heroT(other(seat)), ...mins(other(seat)), heroT(seat), ...mins(seat)];
  return [];   // draw
}
function battlecry(s, seat, m, target, ev){
  const e=m.effect; if(!e) return;
  const src={seat, name:m.name};
  if(e.type==='draw'){ drawCards(s, seat, e.value, ev, src); return; }
  if(e.type==='sweep'){
    const foes=[...s.seats[other(seat)].board];
    if(!foes.length){ ev.push({type:'ignored', seat, src}); return; }
    foes.forEach(t=>hurtMinion(s, other(seat), t, e.value, ev, 'battlecry', src));
    return;
  }
  if(e.type==='gainMana'){ s.seats[seat].mana+=e.value; ev.push({type:'mana', seat, amount:e.value, src}); return; }
  if(!target){ ev.push({type:'ignored', seat, src}); return; }
  if(e.type==='damage'){
    if(target.kind==='hero') hurtHero(s, target.seat, e.value, ev, 'battlecry', src);
    else { const t=findMinion(s, target.seat, target.id); if(t) hurtMinion(s, target.seat, t, e.value, ev, 'battlecry', src); }
  } else if(e.type==='heal'){
    if(target.kind==='hero'){
      const P=s.seats[target.seat]; const before=P.hp;
      P.hp=Math.min(P.maxHp ?? CONFIG.HERO_HP, P.hp+e.value);
      ev.push({type:'heal', target, name:null, amount:P.hp-before, src});
    } else {
      const t=findMinion(s, target.seat, target.id);
      if(t){ const before=t.hp; t.hp=Math.min(t.maxHp, t.hp+e.value);
        ev.push({type:'heal', target, name:t.name, amount:t.hp-before, src}); }
    }
  } else if(e.type==='buff'){
    const t=findMinion(s, target.seat, target.id);
    if(t){ t.atk+=e.value; t.hp+=e.value; t.maxHp+=e.value;
      ev.push({type:'buff', target, name:t.name, value:e.value, src}); }
  }
}

// ---- 주문 ----
// 피해·회복·드로우는 전투의 함성과 같은 처리를 쓰고(이름만 주문 이름), 침묵·보호막 부여는 여기서 직접 처리한다.
function castSpell(s, seat, c, target, ev){
  const fx=SPELL_FX[c.effect.type];
  if(fx && fx.cast) fx.cast(s, seat, c, target, ev, {seat, name:c.name});
  if(c.twin) twinCopy(s, seat, c, ev);          // v28 이중 주문: 시전될 때마다(손에서 낸 것·혼돈·일식의 두 번째 시전 모두) 이중 주문이 없는 사본이 손패에 들어온다. 손패가 가득이면 소각
}
function twinCopy(s, seat, c, ev){
  const base=CARD_POOL.find(x=>x.name===c.name) || c, P=s.seats[seat];
  const copy={...base, cost:c.cost, id:s.nextId++}; delete copy.twin; delete copy.auto;
  const burned=P.hand.length>=CONFIG.MAX_HAND; if(!burned) P.hand.push(copy);
  ev.push({type:'twin', seat, name:c.name, burned});
}
// v28 일식의 두 번째 시전: 첫 시전(과 그 발견)이 끝나면 호출된다. 대상이 필요하면 선택 대기(kind:'target')를 만들고 플레이어가 TARGET 으로 고른다
function resolveRecast(s, ev){
  const rc=s.recast; if(!rc || s.pending) return;
  s.recast=null;
  const {seat, card}=rc, P=s.seats[seat];
  if(s.seats[0].hp<=0 || s.seats[1].hp<=0) return;
  const fx=SPELL_FX[card.effect.type], ts=cardTargets(s, seat, card);
  ev.push({type:'recast', seat, name:card.name});
  const fizzle=(fx.needsTarget && ts.length===0) || (fx.blocked && fx.blocked(s, seat)) || (card.effect.type==='recall' && P.hand.length>=CONFIG.MAX_HAND);
  if(fizzle){ ev.push({type:'ignored', seat, fizzle:true, src:{seat, name:card.name}}); return; }
  if(ts.length){ s.pending={kind:'target', seat, card, targets:ts}; ev.push({type:'targetWait', seat, name:card.name}); return; }
  castSpell(s, seat, card, null, ev);
}

// ---- 검증: 오류 문자열 또는 null(합법) ----
function validate(s, a, actor){
  if(!a || typeof a!=='object') return '잘못된 행동입니다.';
  if(s.over) return '게임이 끝났습니다.';
  if(a.type==='SURRENDER') return null;          // 항복은 어느 시점이든 가능. legalActions 에는 넣지 않는다 (봇은 항복하지 않음)
  if(actor!==s.turn) return '상대 턴입니다.';
  if(s.pending && s.pending.kind==='target'){      // v28 일식의 두 번째 대상 선택 중에는 TARGET 만 가능
    if(a.type!=='TARGET') return '먼저 두 번째 시전의 대상을 선택해야 합니다.';
    if(s.pending.seat!==actor || !a.target || !s.pending.targets.some(t=>tkey(t)===tkey(a.target))) return '올바른 대상을 선택해야 합니다.';
    return null;
  }
  if(s.pending){                                  // 발견 선택 중에는 CHOOSE 만 가능
    if(a.type!=='CHOOSE') return '먼저 발견할 카드를 선택해야 합니다.';
    if(s.pending.seat!==actor || !Number.isInteger(a.index) || !s.pending.options[a.index]) return '잘못된 선택입니다.';
    return null;
  }
  if(a.type==='CHOOSE' || a.type==='TARGET') return '선택할 것이 없습니다.';
  const P=s.seats[actor], O=s.seats[other(actor)];
  switch(a.type){
    case 'END_TURN': return null;
    case 'PLAY_CARD': {
      const c=P.hand.find(x=>x.id===a.cardId);
      if(!c) return '손패에 없는 카드입니다.';
      if(c.lifeCost ? P.hp<=c.cost : c.cost>P.mana) return c.lifeCost ? '체력이 부족합니다.' : '마나가 부족합니다.';   // 생명력 비용은 죽을 만큼은 낼 수 없다
      if(c.type!=='spell' && P.board.length>=CONFIG.MAX_BOARD) return '전장이 가득 찼습니다.';   // 하수인만 전장 자리 필요
      const ts=cardTargets(s, actor, c);
      if(ts.length===0){
        if(needsTarget(c)) return '대상이 될 수 있는 하수인이 없습니다.';   // 대상이 필수인 주문
        if(c.type==='spell'){ const b=SPELL_FX[c.effect.type].blocked; const why=b && b(s, actor); if(why) return why; }   // 광역 주문 등 '지금 쓰면 낭비'인 경우
        return a.target ? '대상이 필요 없는 카드입니다.' : null;
      }
      if(!a.target || !ts.some(t=>tkey(t)===tkey(a.target))) return '올바른 대상을 선택해야 합니다.';
      return null;
    }
    case 'ATTACK': {
      const m=P.board.find(x=>x.id===a.attackerId);
      if(!m) return '내 하수인이 아닙니다.';
      if(m.summoned && !m.charge && !m.rush) return '소환 직후에는 공격할 수 없습니다.';   // 속공(rush): 낸 턴에는 하수인만 공격 가능
      if(m.attacked) return '이미 공격했습니다.';
      if(m.frozen) return '얼어 있어 공격할 수 없습니다.';
      const t=a.target;
      if(!t || t.seat!==other(actor)) return '공격 대상이 올바르지 않습니다.';
      const taunts=O.board.filter(x=>x.taunt);
      if(t.kind==='hero'){
        if(m.summoned && !m.charge) return '속공 하수인은 낸 턴에 영웅을 공격할 수 없습니다.';
        return taunts.length ? '도발 하수인을 먼저 공격해야 합니다.' : null;
      }
      if(t.kind==='minion'){
        const d=O.board.find(x=>x.id===t.id);
        if(!d) return '존재하지 않는 대상입니다.';
        if(taunts.length && !d.taunt) return '도발 하수인을 먼저 공격해야 합니다.';
        return null;
      }
      return '공격 대상이 올바르지 않습니다.';
    }
    default: return '알 수 없는 행동입니다.';
  }
}

// ---- 합법 행동 목록 (서버 검증·봇·클라이언트 하이라이트 공통 사용 / AI 학습의 action mask 원천) ----
function legalActions(s, actor){
  if(s.over || s.turn!==actor) return [];
  if(s.pending) return s.pending.kind==='target' ? s.pending.targets.map(t=>({type:'TARGET', target:t})) : s.pending.options.map((_,i)=>({type:'CHOOSE', index:i}));
  const P=s.seats[actor], O=s.seats[other(actor)], out=[];
  for(const c of P.hand){
    const ts=cardTargets(s, actor, c);
    for(const t of (ts.length ? ts : [null])){
      const a={type:'PLAY_CARD', cardId:c.id, target:t};
      if(!validate(s,a,actor)) out.push(a);
    }
  }
  const targets=[heroT(other(actor)), ...O.board.map(m=>minionT(other(actor), m.id))];
  for(const m of P.board) for(const t of targets){
    const a={type:'ATTACK', attackerId:m.id, target:t};
    if(!validate(s,a,actor)) out.push(a);
  }
  out.push({type:'END_TURN'});
  return out;
}

// ---- 핵심: 행동 적용. 입력 state 는 수정하지 않고 새 state 를 반환 ----
function apply(state, a, actor){
  const err=validate(state, a, actor);
  if(err) return {ok:false, error:err, state, events:[]};
  const s=structuredClone(state), ev=[], P=s.seats[actor];
  if(a.type==='PLAY_CARD'){
    const c=P.hand.find(x=>x.id===a.cardId);
    if(c.lifeCost){ P.hp-=c.cost; ev.push({type:'damage', target:heroT(actor), name:null, amount:c.cost, absorbed:false, cause:'lifecost', src:{seat:actor, name:c.name}}); }   // 마나 대신 생명력 (방어 효과 무시)
    else P.mana-=c.cost;
    P.hand=P.hand.filter(x=>x.id!==c.id);
    if(c.type==='spell'){
      // 주문: 전장에 남지 않고 효과만 적용된 뒤 사라진다. card 는 화면에서 "무슨 주문을 썼는지" 보여주기 위한 사본.
      ev.push({type:'spell', seat:actor, name:c.name, gain:c.effect.type==='mana'?c.effect.value:0, card:{type:c.type, name:c.name, cost:c.cost, lifeCost:c.lifeCost, effect:c.effect, twin:c.twin}});
      if(P.eclipse && c.effect.type!=='mana'){        // v28 일식: 손에서 낸 다음 주문(동전 제외)을 2번 시전 — 두 번째는 첫 시전이 끝난 뒤 resolveRecast 가 처리
        P.eclipse=false; s.recast={seat:actor, card:{...c}};
        ev.push({type:'eclipseUse', seat:actor, name:c.name});
      }
      castSpell(s, actor, c, a.target, ev);
    } else {
    const m={...c, maxHp:c.hp, attacked:false, summoned:true};
    const bf=(P.mods&&P.mods.buff)||0;
    if(bf){ m.hp+=bf; m.maxHp+=bf; }
    P.board.push(m);
    ev.push({type:'summon', seat:actor, id:m.id, name:m.name});
    battlecry(s, actor, m, a.target, ev);
    if(P.mods && P.mods.doubleBattlecry && m.effect){
      const t=a.target, alive = !t || t.kind==='hero' || (findMinion(s, t.seat, t.id)?.hp>0);
      if(alive && (t || NO_TARGET_FX.includes(m.effect.type))){ ev.push({type:'echo', seat:actor, name:m.name}); battlecry(s, actor, m, t, ev); }
    }
    }   // end 하수인
  } else if(a.type==='ATTACK'){
    const m=P.board.find(x=>x.id===a.attackerId), t=a.target;
    if(t.kind==='hero'){
      ev.push({type:'attack', seat:actor, attackerId:m.id, name:m.name, target:t, targetName:null});
      hurtHero(s, t.seat, m.atk, ev, 'combat');
    } else {
      const d=findMinion(s, t.seat, t.id);
      ev.push({type:'attack', seat:actor, attackerId:m.id, name:m.name, target:t, targetName:d.name});
      const dAtk=d.atk;
      hurtMinion(s, t.seat, d, m.atk, ev, 'combat');
      hurtMinion(s, actor, m, dAtk, ev, 'combat');
    }
    m.attacked=true;
  } else if(a.type==='CHOOSE'){
    const pd=s.pending, o=pd.options[a.index], card={...o, cost:Math.max(0, o.cost-pd.discount), id:s.nextId++};
    s.pending=null;
    const burned=P.hand.length>=CONFIG.MAX_HAND; if(!burned) P.hand.push(card);
    ev.push({type:'discoverPick', seat:actor, name:card.name, cost:card.cost, burned});   // name: 상대에게는 화면에서 숨긴다 (서버로 옮길 때는 name 을 빼고 보낼 것)
  } else if(a.type==='TARGET'){                     // v28 일식의 두 번째 시전 대상 선택
    const pd=s.pending; s.pending=null;
    ev.push({type:'targetPick', seat:actor, name:pd.card.name});
    castSpell(s, actor, pd.card, a.target, ev);
  } else if(a.type==='SURRENDER'){
    s.over=true; s.winner=other(actor);              // 항복 = 즉시 패배 (체력은 건드리지 않음)
    ev.push({type:'surrender', seat:actor});
    ev.push({type:'game_over', winner:s.winner});
  } else if(a.type==='END_TURN'){
    ev.push({type:'turn_end', seat:actor});
    P.eclipse=false;                              // v28 일식은 그 턴이 끝나면 사라진다
    P.board.forEach(m=>{ m.frozen=false; });      // 얼음은 그 하수인 주인의 한 턴이 끝나면 풀린다
    startTurn(s, other(actor), ev);
  }
  sweepDead(s, ev);
  checkGlide(s, ev);
  resolveRecast(s, ev);                           // v28 일식: 첫 시전이 끝났으면 두 번째 시전 (대상 선택 대기가 생길 수 있다)
  sweepDead(s, ev);
  checkGlide(s, ev);
  checkEnd(s, ev);
  return {ok:true, state:s, events:ev};
}

// ---- GameView: 특정 좌석에게 보내는 시점 정보 (상대 손패·덱 내용 제외) ----
function viewFor(s, seat){
  const me=s.seats[seat], op=s.seats[other(seat)];
  return structuredClone({
    seat, turn:s.turn, turnNo:s.turnNo, first:s.first, over:s.over, winner:s.winner,
    // deckCards: 내 남은 덱 구성. 뽑는 순서가 드러나지 않도록 id 를 빼고 코스트·이름순으로 정렬해서 보낸다.
    me:{hp:me.hp, maxHp:me.maxHp, mods:me.mods, eclipse:!!me.eclipse, fatigue:me.fatigue||0, mana:me.mana, maxMana:me.maxMana, hand:me.hand, board:me.board, deckCount:me.deck.length,
        deckCards:me.deck.map(({id, ...rest})=>rest).sort((a,b)=>a.cost-b.cost || (a.name<b.name?-1:a.name>b.name?1:0))},
    opp:{hp:op.hp, maxHp:op.maxHp, mods:op.mods, eclipse:!!op.eclipse, fatigue:op.fatigue||0, mana:op.mana, maxMana:op.maxMana, handCount:op.hand.length, board:op.board, deckCount:op.deck.length},
    pending: s.pending ? (s.pending.seat===seat
      ? (s.pending.kind==='target'
          ? {kind:'target', seat, card:{name:s.pending.card.name, cost:s.pending.card.cost, effect:s.pending.card.effect, school:s.pending.card.school, twin:s.pending.card.twin}, targets:s.pending.targets}
          : {kind:'discover', seat, options:s.pending.options.map(o=>({...o, cost:Math.max(0, o.cost-s.pending.discount), id:-1}))})   // 고르는 본인에게만 선택지를 보여 준다
      : {kind:s.pending.kind||'discover', seat:s.pending.seat}) : null,
    legal:legalActions(s, seat)
  });
}

// ---- Player: decide(view) → action. 사람(소켓)·봇이 같은 인터페이스를 따른다 ----
function hpOfTarget(view, t){
  const list = t.seat===view.seat ? view.me.board : view.opp.board;
  const m=list.find(x=>x.id===t.id); return m ? m.hp : Infinity;
}
function pickCardTarget(entries, view){
  const card=view.me.hand.find(c=>c.id===entries[0].cardId), type=card.effect.type;
  const minionOf=t=>(t.seat===view.seat?view.me.board:view.opp.board).find(m=>m.id===t.id);
  let score;
  if(type==='heal')        score=a=>a.target.kind==='hero' ? ((view.me.maxHp||CONFIG.HERO_HP)-view.me.hp) : (minionOf(a.target).maxHp-minionOf(a.target).hp);
  else if(type==='buff')   score=a=>minionOf(a.target).atk;
  else                     score=a=> a.target.seat===view.seat ? -1000                               // 피해: 아군은 피하고
                                   : (a.target.kind==='minion' ? 100-minionOf(a.target).hp : 0);   // 적의 약한 하수인 우선
  return entries.reduce((best,a)=>score(a)>score(best)?a:best);
}
// 발견 선택: 지금 상황에 가장 쓸모 있어 보이는 카드를 고른다 (두 봇 공통)
function discoverScore(c, view){
  const me=view.me, op=view.opp, foes=op.board.length, mine=me.board.length, t=c.effect.type;
  if(['damage','bolt','execute','transform','freeze'].includes(t)) return foes ? 3+foes*0.5 : 0.5;
  if(t==='rain') return foes>=2 ? 4+foes : 0;
  if(t==='wipe') return foes-mine>=2 ? 5 : 0.5;
  if(t==='heal') return me.hp<=15 ? 4 : 1;
  if(t==='draw') return me.hand.length<=5 ? 3.5 : 1;
  if(['enhance','giveShield','haste'].includes(t)) return mine ? 3 : 0.5;
  if(t==='copy') return me.hand.some(x=>x.type!=='spell') ? 2.5 : 0.5;
  if(t==='silence') return op.board.some(m=>m.taunt) ? 3 : 0.5;
  if(t==='summon') return mine<=4 ? 4 : 1;
  if(t==='glide') return mine<=3 ? 4.5 : 1;
  if(t==='muster') return mine<=5 ? 4 : 1;
  if(t==='chaos') return 3;
  if(t==='eclipse') return 2;
  return 1;
}
function chooseTarget(view){                                    // v28 일식의 두 번째 시전 대상 (두 봇 공통). 후보 중 가장 점수 높은 것
  const pd=view.pending, e=pd.card.effect, ts=pd.targets, me=view.me, op=view.opp, ty=e.type;
  const mine=t=>t.seat===view.seat;
  const minion=t=>t.kind==='minion' ? (mine(t)?me.board:op.board).find(m=>m.id===t.id) : null;
  const sc=t=>{
    const m=minion(t);
    if(ty==='heal') return !mine(t) ? -1000 : t.kind==='hero' ? (me.maxHp||CONFIG.HERO_HP)-me.hp : m.maxHp-m.hp;
    if(['enhance','giveShield','haste'].includes(ty)) return mine(t)&&m ? m.atk*2+m.hp : -1000;
    if(ty==='recall') return mine(t)&&m ? (m.hp*2<=m.maxHp?5:0)-m.atk : -1000;
    if(ty==='copy'){ const c=me.hand.find(x=>x.id===t.id); return c ? c.cost : -1000; }
    if(['transform','freeze','silence','execute'].includes(ty)) return !mine(t)&&m ? m.atk+m.hp : -1000;
    if(mine(t)) return -1000;                                     // 피해 계열: 아군은 피하고
    if(t.kind==='hero') return (e.value>=op.hp) ? 1000 : 0;
    return m.shield ? 1 : (m.hp<=e.value ? 50+m.atk+m.hp : 20-m.hp);
  };
  let best=ts[0], bs=-Infinity;
  for(const t of ts){ const x=sc(t); if(x>bs){ bs=x; best=t; } }
  return {type:'TARGET', target:best};
}
function choosePending(view){ return view.pending.kind==='target' ? chooseTarget(view) : chooseDiscover(view); }
function chooseDiscover(view){
  const opts=view.pending.options; let bi=0, bs=-Infinity;
  opts.forEach((c,i)=>{ const sc=discoverScore(c, view); if(sc>bs){ bs=sc; bi=i; } });
  return {type:'CHOOSE', index:bi};
}
// 주문(동전) 보조: 동전은 "지금 마나로는 못 내는 하수인을 낼 수 있게 될 때"만 쓴다 (그냥 쓰면 마나가 낭비된다)
const isSpellCard = c => c.type==='spell';
const isCoin = c => c.type==='spell' && c.effect.type==='mana';
function coinUnlocks(view){
  const me=view.me, coin=me.hand.find(isCoin);
  if(!coin || me.board.length>=CONFIG.MAX_BOARD) return false;
  return me.hand.some(c=>!isSpellCard(c) && c.cost>me.mana && c.cost<=me.mana+coin.effect.value);
}
// 중급 봇의 주문 사용 규칙 (낼 만한 때만 낸다. 없으면 null)
//  불꽃 화살: 영웅을 쓰러뜨릴 수 있거나 적 하수인을 처치할 때 / 침묵: 도발 벽이 있고 공격할 하수인이 있을 때
//  치유의 빛: 내 영웅이 4 이상 다쳤을 때 / 수호의 장벽: 공격력 2 이상 하수인에게 / 지식의 서: 손패가 8장 이하일 때
function ruleSpell(view){
  const me=view.me, op=view.opp;
  const cardOf=a=>me.hand.find(c=>c.id===a.cardId);
  const acts=view.legal.filter(a=>a.type==='PLAY_CARD' && isSpellCard(cardOf(a)) && !isCoin(cardOf(a)));
  const ofType=t=>acts.filter(a=>cardOf(a).effect.type===t);
  const minionOf=t=>(t.seat===view.seat?me.board:op.board).find(m=>m.id===t.id);
  const dm=ofType('damage');
  if(dm.length){
    const v=cardOf(dm[0]).effect.value;
    const face=dm.find(a=>a.target.kind==='hero' && a.target.seat!==view.seat);
    if(face && v>=op.hp) return face;
    const kills=dm.filter(a=>a.target.kind==='minion' && a.target.seat!==view.seat && !minionOf(a.target).shield && minionOf(a.target).hp<=v);
    if(kills.length) return kills.reduce((x,y)=>minionOf(x.target).atk>=minionOf(y.target).atk?x:y);
  }
  const si=ofType('silence');
  if(si.length && me.board.some(m=>!m.attacked && !m.frozen && (!m.summoned || m.charge))){
    const walls=si.filter(a=>minionOf(a.target).taunt);
    if(walls.length) return walls.reduce((x,y)=>minionOf(x.target).hp<=minionOf(y.target).hp?x:y);
  }
  const he=ofType('heal').find(a=>a.target.kind==='hero');
  if(he && (me.maxHp||CONFIG.HERO_HP)-me.hp>=4) return he;
  const gs=ofType('giveShield').filter(a=>minionOf(a.target).atk>=2);
  if(gs.length) return gs.reduce((x,y)=>minionOf(x.target).atk>=minionOf(y.target).atk?x:y);
  const ex=ofType('execute');
  if(ex.length) return ex.reduce((x,y)=>minionOf(x.target).atk+minionOf(x.target).hp>=minionOf(y.target).atk+minionOf(y.target).hp?x:y);   // 가장 큰 카드부터
  const rn=ofType('rain');
  if(rn.length){
    const v=cardOf(rn[0]).effect.value;
    const kills=op.board.filter(m=>!m.shield && m.hp<=v).length;
    if(kills>=2 || (op.board.length>=3 && kills>=1)) return rn[0];
  }
  const hs=ofType('haste').filter(a=>minionOf(a.target).atk>=3);
  if(hs.length) return hs.reduce((x,y)=>minionOf(x.target).atk>=minionOf(y.target).atk?x:y);
  const fr=ofType('freeze').filter(a=>minionOf(a.target).atk>=3);          // 공격력 3 이상인 적을 얼린다
  if(fr.length) return fr.reduce((x,y)=>minionOf(x.target).atk>=minionOf(y.target).atk?x:y);
  const cp=ofType('copy');                                                 // 하수인을 다 낸 뒤 남는 마나로, 비싼(3코 이상) 하수인을 복제
  if(cp.length){
    const costOf=a=>me.hand.find(c=>c.id===a.target.id).cost;
    const b=cp.reduce((x,y)=>costOf(x)>=costOf(y)?x:y);
    if(costOf(b)>=3) return b;
  }
  const dr=ofType('draw');
  if(dr.length && me.hand.length<=8 && me.deckCount>=cardOf(dr[0]).effect.value) return dr[0];   // 덱이 모자라면 탈진 피해만 입는다
  for(const [type,fx] of Object.entries(SPELL_FX)){                        // 레지스트리에 규칙이 있는 주문 (강화·회수·변이 ...)
    if(!fx.ruleUse) continue;
    const a=fx.ruleUse(view, ofType(type), {minionOf, cardOf}); if(a) return a;
  }
  return null;
}
const BotPlayers = {
  // 규칙 기반: 가장 비싼 카드부터 내고, 약한 하수인을 우선 공격, 없으면 영웅 공격
  rule:{ decide(view){
    if(view.pending && view.pending.seat===view.seat) return choosePending(view);
    const L=view.legal;
    const cardOf=a=>view.me.hand.find(c=>c.id===a.cardId);
    const spellOf=a=>isSpellCard(cardOf(a));
    const coinAct=L.find(a=>a.type==='PLAY_CARD' && isCoin(cardOf(a)));
    if(coinAct && coinUnlocks(view)) return coinAct;                      // 동전을 써야 더 낼 수 있을 때만
    const plays=L.filter(a=>a.type==='PLAY_CARD' && !spellOf(a));        // 하수인만 (주문은 아래에서 따로 판단)
    if(plays.length){
      const costOf=a=>view.me.hand.find(c=>c.id===a.cardId).cost;
      const best=Math.max(...plays.map(costOf));
      const cardId=plays.find(a=>costOf(a)===best).cardId;
      const entries=plays.filter(a=>a.cardId===cardId);
      return entries.length===1 ? entries[0] : pickCardTarget(entries, view);
    }
    const sp=ruleSpell(view);          // 남은 마나로 쓸 만한 주문이 있으면 쓴다
    if(sp) return sp;
    const atks=L.filter(a=>a.type==='ATTACK');
    if(atks.length){
      const entries=atks.filter(a=>a.attackerId===atks[0].attackerId);
      const mt=entries.filter(a=>a.target.kind==='minion');
      if(mt.length) return mt.reduce((x,y)=>hpOfTarget(view,x.target)<=hpOfTarget(view,y.target)?x:y);
      return entries[0];
    }
    return {type:'END_TURN'};
  }},
  // 무작위: 합법 행동 중 하나 (엔진 시험·부하용)
  random:{ decide(view){ return view.legal[Math.floor(Math.random()*view.legal.length)]; } }
};

// ---- 규칙 봇 2 (중급2): 중급(rule)보다 한 수 앞을 보는 규칙 기반 봇 ----
//  1) 마무리: 이번 턴에 상대 영웅을 쓰러뜨릴 수 있으면 곧바로 영웅을 공격한다.
//  2) 카드: 마나를 가장 알차게 쓰는 조합을 고르고, 드로우 → 피해 → 하수인 → 회복 → 강화 순으로 낸다.
//  3) 공격: 모든 (공격자, 대상) 조합을 점수로 비교한다. 이득 보는 교환 > 영웅 공격 > 손해 보는 교환(생략).
//  4) 위기: 상대 필드의 공격력 합이 내 체력에 닿으면 영웅 공격을 줄이고 위협적인 하수인을 먼저 처리한다.
// 점수 가중치는 아래 W 한 곳에 모아두었다. selfPlay 로 승률을 재 가며 이 표만 고치면 된다.
const Rule2 = (()=>{
  const W = {
    atk:1.2, hp:0.8, taunt:1.5, shield:1.5,     // 하수인 가치 = 공격력·체력·도발·보호막
    face:0.9, faceLow:1.4, faceCrit:2.0,        // 영웅 공격 1당 점수 (상대 체력이 낮을수록 커짐)
    faceDanger:0.4,                             // 내가 위기일 때 영웅 공격 점수
    tempo:1.0, killThreat:1.0,                  // 처치 보너스 / 위기 때 처치한 하수인 공격력 보너스
  };
  const val = m => m.atk*W.atk + m.hp*W.hp + (m.taunt?W.taunt:0) + (m.shield?W.shield:0) + (m.revive?1.5:0) + (m.charge?0.8:0);

  function context(view){
    const me=view.me, op=view.opp;
    const threat=op.board.filter(m=>!m.frozen).reduce((s,m)=>s+m.atk,0);   // 얼린 하수인은 다음 턴 공격하지 못한다
    const danger = threat >= me.hp-2 && !me.board.some(m=>m.taunt);
    const faceW = danger ? W.faceDanger : op.hp<=6 ? W.faceCrit : op.hp<=12 ? W.faceLow : W.face;
    const ready = m => !m.attacked && !m.frozen && (!m.summoned || m.charge);
    const readyAtk = me.board.filter(ready).reduce((s,m)=>s+m.atk,0);   // 이번 턴 공격할 수 있는 공격력 합
    const taunts = op.board.filter(m=>m.taunt).length;
    return {danger, faceW, readyAtk, taunts};
  }

  // 카드 한 장의 가치 (낼지 말지가 아니라 "어떤 조합이 더 좋은가"를 비교하는 용도)
  const SPELL_MIN = 3;    // 주문은 "낼 가치"가 이 점수 이상일 때만 쓴다 (카드 한 장을 소모하므로 전투의 함성보다 기준이 높다)
  function spellWorth(c, view, ctx){
    const e=c.effect;
    if(e.type==='draw') return (view.me.hand.length-1+e.value<=CONFIG.MAX_HAND && view.me.deckCount>=e.value) ? 5 : 0;   // 손패가 넘치거나 덱이 모자라면 쓰지 않는다
    const entries=view.legal.filter(a=>a.type==='PLAY_CARD' && a.cardId===c.id);
    if(!entries.length) return -Infinity;                                                    // 지금은 낼 수 없음 (마나·대상)
    { const fx=SPELL_FX[e.type]; if(fx && fx.spellWorth) return fx.spellWorth(c, view, ctx, {val, W}); }   // 레지스트리의 대상 없는 주문
    if(e.type==='rain'){                                                                     // 광역: 처치한 수가 많을수록 가치가 크다
      let kills=0, sum=0;
      for(const m of view.opp.board){ if(!m.shield && m.hp<=e.value){ kills++; sum+=val(m)+W.tempo; } else sum+=e.value*0.4; }
      return Math.min(20, kills>=2 ? sum : sum*0.5);
    }
    return Math.min(20, Math.max(...entries.map(a=>targetScore(c, a.target, view, ctx))));
  }
  function cardValue(c, view, ctx){
    if(c.type==='spell') return spellWorth(c, view, ctx);
    const me=view.me, e=c.effect;
    let v=c.atk+c.hp+(c.shield?W.shield:0)+(c.taunt?(ctx.danger?3:1):0)+(c.revive?2:0)+(c.charge?1.5:0)+(c.rush?1:0);
    if(e){
      if(e.type==='draw')   v+= me.deckCount>=e.value ? 2.5 : -3;      // 덱이 비었으면 탈진 피해
      if(e.type==='damage') v+=e.value*1.2;
      if(e.type==='heal')   v+=Math.min(e.value, (me.maxHp||30)-me.hp)*0.8;
      if(e.type==='buff')   v+= me.board.length ? e.value*2 : 0;
      if(e.type==='sweep')  v+= view.opp.board.reduce((s,m)=>s+(m.shield?1:(m.hp<=e.value ? m.atk+m.hp : e.value*0.5)),0);
      if(e.type==='gainMana') v+= e.value;
    }
    return v;
  }

  // 마나 budget 안에서 낼 수 있는 하수인 조합 중 마나를 가장 많이 쓰고(1순위) 가치가 가장 큰(2순위) 것
  // (budget 을 mana+동전으로 넣어 보면 "동전을 쓰면 얼마나 더 쓰는지" 비교할 수 있다)
  const planCost = plan => plan.reduce((s,c)=>s+c.cost,0);
  function bestPlan(view, ctx, budget){
    const me=view.me;
    // 적 필드가 비어 있으면 광역 피해 카드는 아껴 둔다
    // (동전은 따로 판단하고, 그 밖의 주문은 낼 가치가 SPELL_MIN 이상일 때만 후보에 넣는다)
    const cards=me.hand.filter(c=>!isCoin(c) && !c.lifeCost && c.cost<=budget && !(c.effect&&c.effect.type==='sweep'&&view.opp.board.length===0)
                                  && (c.type!=='spell' || spellWorth(c, view, ctx)>=SPELL_MIN));
    const gain=c=>(c.effect&&c.effect.type==='gainMana')?c.effect.value:0;   // 마나를 돌려주는 카드는 실질 비용이 낮다
    const slots=CONFIG.MAX_BOARD-me.board.length, n=cards.length;
    const vals=cards.map(c=>cardValue(c, view, ctx));
    let best=null, bc=-1, bv=-1;
    for(let mask=1; mask<(1<<n); mask++){
      let cost=0, net=0, cnt=0, v=0;
      for(let i=0;i<n;i++) if(mask&(1<<i)){ cost+=cards[i].cost; net+=cards[i].cost-gain(cards[i]); if(cards[i].type!=='spell' || (SPELL_FX[cards[i].effect.type]||{}).summons) cnt++; v+=vals[i]; }   // 전장 자리는 하수인만 차지
      if(net>budget || cnt>slots) continue;
      if(cost>bc || (cost===bc && v>bv)){ bc=cost; bv=v; best=mask; }
    }
    if(best===null) return [];
    return cards.filter((_,i)=>best&(1<<i));
  }
  // 낼 순서: 드로우(선택지 늘리기) → 피해(적 정리) → 하수인 → 회복 → 강화(마지막에 낸 아군에게도 쓸 수 있게)
  const rankOf = c => { const t=c.effect&&c.effect.type; const fx=c.type==='spell'&&SPELL_FX[t]; if(fx&&fx.rank!==undefined) return fx.rank; return t==='gainMana'?-1 : (t==='draw'||t==='copy')?0 : (t==='damage'||t==='sweep'||t==='silence'||t==='rain'||t==='execute'||t==='freeze')?1 : t==='heal'?3 : (t==='buff'||t==='giveShield')?4 : t==='haste'?5 : 2; };   // 급습은 하수인을 다 낸 뒤에

  // 전투의 함성 대상 고르기
  function targetScore(card, t, view, ctx){
    const me=view.me, op=view.opp, e=card.effect, v=e.value;
    const mineSide = t.seat===view.seat;
    const list = mineSide ? me.board : op.board;
    const m = t.kind==='minion' ? list.find(x=>x.id===t.id) : null;
    if(e.type==='damage'){
      if(mineSide) return -1000;                                   // 아군은 때리지 않는다
      if(t.kind==='hero') return (v>=op.hp ? 1000 : v*ctx.faceW);  // 마무리가 되면 최우선
      if(m.shield) return 1.0;                                     // 보호막만 깬다
      if(m.hp<=v)  return val(m)+W.tempo+(ctx.danger?m.atk*W.killThreat:0);
      return v*0.4+(m.taunt?1:0);                                  // 못 죽이면 약하게 만들어 두기
    }
    if(e.type==='heal'){
      if(!mineSide) return -1000;
      if(t.kind==='hero') return Math.min(v,(me.maxHp||30)-me.hp)*(ctx.danger?1.5:0.8);
      return Math.min(v, m.maxHp-m.hp)*0.6;
    }
    if(e.type==='buff'){
      if(!mineSide) return -1000;
      const ready=!m.attacked&&!m.frozen&&(!m.summoned||m.charge||m.rush);
      return (ready?1.5:0)+(m.atk>=3?1:0)+m.atk*0.3+m.hp*0.2+(m.taunt?0.5:0);
    }
    if(e.type==='freeze'){                                         // 공격력이 높은 적을 얼릴수록 가치가 크다 (내가 위기면 더)
      if(mineSide) return -1000;
      return m.atk*0.9 + (ctx.danger ? m.atk*0.8 : 0) + (m.atk>=4 ? 1 : 0);
    }
    if(e.type==='copy'){                                           // 손패에서 가장 가치 있는 하수인의 복사본 (대상이 손패 카드)
      const hc=me.hand.find(c=>c.id===t.id);
      return hc ? cardValue(hc, view, ctx)*0.45 : -1000;
    }
    if(e.type==='execute'){                                        // 보호막을 무시하고 큰 카드를 처치
      if(mineSide) return -1000;
      return val(m)+W.tempo+(ctx.danger?m.atk*W.killThreat:0);
    }
    if(e.type==='haste'){                                          // 소환 직후 공격력이 높은 하수인일수록 가치가 크다. 영웅을 노릴 수 있으면 더 크다
      if(!mineSide) return -1000;
      return m.atk*0.9 + (ctx.taunts===0 ? m.atk*0.5 : 0) + (m.atk>=op.hp ? 10 : 0);
    }
    if(e.type==='silence'){                                        // 도발 벽을 뚫어 공격할 하수인이 있을 때 가치가 크다 (마지막 벽이면 영웅까지 열린다)
      if(mineSide) return -1000;
      return (m.taunt && ctx.readyAtk>0 ? 3+(ctx.taunts===1?1.5:0) : 0) + (m.shield?1:0);
    }
    if(e.type==='giveShield'){                                     // 공격력이 높고 바로 싸울 하수인일수록 보호막 가치가 크다
      if(!mineSide) return -1000;
      const ready=!m.attacked&&!m.frozen&&(!m.summoned||m.charge||m.rush);
      return 1+m.atk*0.6+m.hp*0.2+(ready?1:0)+(m.taunt?1:0);
    }
    const fx=SPELL_FX[e.type]; if(fx && fx.worth) return fx.worth(view, card, t, ctx, {val, W, m, mineSide});   // 레지스트리의 주문
    return 0;
  }

  // 공격 한 건의 점수
  function attackScore(a, view, ctx){
    const me=view.me, op=view.opp;
    const m=me.board.find(x=>x.id===a.attackerId);
    if(a.target.kind==='hero') return m.atk>=op.hp ? 1000 : m.atk*ctx.faceW;
    const d=op.board.find(x=>x.id===a.target.id);
    const kill=!d.shield && !d.revive && m.atk>=d.hp;
    const die =!m.shield && !m.revive && d.atk>=m.hp;
    let s=0;
    if(kill) s+=val(d)+W.tempo+(ctx.danger?d.atk*W.killThreat:0);
    else     s+= d.shield ? 0.8 : m.atk*0.25;
    if(die) s-=val(m);
    else if(m.shield && d.atk>0) s-=0.8;
    else s-=d.atk*0.3;
    return s;
  }

  function decide(view){
    if(view.pending && view.pending.seat===view.seat) return choosePending(view);
    const L=view.legal, me=view.me, op=view.opp;
    const allPlays=L.filter(a=>a.type==='PLAY_CARD'), atks=L.filter(a=>a.type==='ATTACK');
    const coinAct=allPlays.find(a=>isCoin(me.hand.find(c=>c.id===a.cardId)));
    const plays=allPlays.filter(a=>a!==coinAct);                         // 하수인 + 동전 외의 주문
    const ctx=context(view);

    // 1) 마무리 확인 (상대 도발이 없을 때만 영웅을 칠 수 있다). 불꽃 화살 같은 직접 피해도 마무리에 계산한다.
    const heroHits=atks.filter(a=>a.target.kind==='hero');
    const ids=[...new Set(heroHits.map(a=>a.attackerId))];
    const total=ids.reduce((s,id)=>s+me.board.find(m=>m.id===id).atk,0);
    if(heroHits.length && total>=op.hp) return heroHits[0];
    const burn=plays.filter(a=>a.target && a.target.kind==='hero' && a.target.seat!==view.seat);
    if(burn.length){
      const dmg=a=>me.hand.find(c=>c.id===a.cardId).effect.value;
      const b=burn.reduce((x,y)=>dmg(x)>=dmg(y)?x:y);
      if(total+dmg(b)>=op.hp) return b;
    }
    // 1-1) 급습으로 소환 직후 하수인이 공격할 수 있게 되어 이번 턴에 끝낼 수 있을 때
    if(ctx.taunts===0){
      const hs=plays.filter(a=>{ const e=me.hand.find(c=>c.id===a.cardId).effect; return e && e.type==='haste'; });
      const best=hs.reduce((b,a)=>{ const m=me.board.find(x=>x.id===a.target.id); return (!b || m.atk>me.board.find(x=>x.id===b.target.id).atk) ? a : b; }, null);
      if(best && total+me.board.find(x=>x.id===best.target.id).atk>=op.hp) return best;
    }
    // 1-2) 침묵으로 마지막 도발 벽을 걷어 내면 이번 턴에 끝낼 수 있을 때
    if(ctx.taunts===1 && ctx.readyAtk>=op.hp){
      const si=plays.find(a=>{ const e=me.hand.find(c=>c.id===a.cardId).effect; return e && e.type==='silence' && a.target && op.board.find(m=>m.id===a.target.id).taunt; });
      if(si) return si;
    }

    // 2) 동전: 쓰면 마나를 더 많이 쓸 수 있을 때만 (낭비 방지). 쓰고 나면 다음 판단에서 그 마나로 카드를 낸다.
    if(coinAct){
      const coin=me.hand.find(isSpellCard);
      if(planCost(bestPlan(view, ctx, me.mana+coin.effect.value)) > planCost(bestPlan(view, ctx, me.mana))) return coinAct;
    }

    // 2-1) 생명력 비용 주문: 체력이 넉넉할 때만 (마나 계획과 따로 판단)
    const lc=plays.find(a=>{ const c=me.hand.find(x=>x.id===a.cardId), fx=c.lifeCost && SPELL_FX[c.effect.type]; return fx && fx.spellWorth && fx.spellWorth(c, view, ctx, {val, W})>=SPELL_MIN; });
    if(lc) return lc;

    // 3) 카드 내기
    if(plays.length){
      const plan=bestPlan(view, ctx, me.mana);
      if(plan.length){
        plan.sort((x,y)=>rankOf(x)-rankOf(y) || y.cost-x.cost);
        const card=plan[0];
        const entries=plays.filter(a=>a.cardId===card.id);
        if(entries.length===1) return entries[0];
        return entries.reduce((b,a)=>targetScore(card,a.target,view,ctx)>targetScore(card,b.target,view,ctx)?a:b);
      }
    }

    // 4) 공격 (가장 점수 높은 한 건. 손해만 보는 공격은 하지 않는다)
    if(atks.length){
      let best=null, bs=-Infinity;
      for(const a of atks){ const s=attackScore(a, view, ctx); if(s>bs){ bs=s; best=a; } }
      if(best && bs>0) return best;
    }
    return {type:'END_TURN'};
  }
  return {decide, W};
})();
BotPlayers.rule2 = { decide: Rule2.decide };

// ---- 헤드리스 자동 대전 (엔진 검증 / 전적 데이터 생성용). 콘솔: selfPlay(1000) ----
function selfPlay(games=1000, botA=BotPlayers.rule, botB=BotPlayers.random, maxTurns=200, opts={}){
  const st={games, wins:[0,0], firstWins:0, draws:0, stalled:0, errors:0, avgTurns:0}; let turns=0;   // firstWins: 선공이 이긴 판 수
  for(let g=0; g<games; g++){
    let s=newGame(Math.random, opts.deckGen ? {...opts, decks:opts.deckGen()} : opts);   // opts.deckGen: 판마다 [덱0, 덱1] 을 만들어 주는 함수 (예: ()=>[buildRandomDeck(), buildRandomDeck()])
    while(!s.over && s.turnNo<=maxTurns){
      const bot = s.turn===0 ? botA : botB;
      const r=apply(s, bot.decide(viewFor(s, s.turn)), s.turn);
      if(!r.ok){ st.errors++; break; }
      s=r.state;
    }
    turns+=s.turnNo;
    if(s.over){ if(s.winner===null) st.draws++; else { st.wins[s.winner]++; if(s.winner===s.first) st.firstWins++; } } else if(st.errors===0 || s.turnNo>maxTurns) st.stalled++;
  }
  st.avgTurns=+(turns/games).toFixed(1);
  return st;
}

if (typeof module !== 'undefined') {
  module.exports = {VERSION, CONFIG, CARD_POOL, BotPlayers, newGame, apply, viewFor, selfPlay,
                    buildRandomDeck, validateDeckList, shuffle};
}
