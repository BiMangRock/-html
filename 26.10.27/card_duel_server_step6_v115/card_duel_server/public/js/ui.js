let MY=0, OPP=1;                  // 유저 대전에서는 서버가 정해 준 좌석으로 바뀐다 (pvpclient.js)
const Host = {
  state:null,
  startTest(cfg){ this.state=newGame(Math.random, {mods:[{hp:cfg.hp-CONFIG.HERO_HP, startMana:cfg.mana}, {}], decks:[cfg.deck, buildRandomDeck()], freeDeck:[true,false]}); },   // v54 테스트: 내 체력·시작 마나·자유 덱, 상대는 치트 없음
  start(mods, deck){ this.state=newGame(Math.random, {mods:[{}, mods||{}], decks:[deck||null, buildRandomDeck()]}); },   // AI(좌석 1)에게만 치트 적용 / 내 덱은 편집한 덱 / AI 덱은 매 판 랜덤 30장 (v17)
  startBoss(boss, myDeck){ this.state=newGame(Math.random, {mods:[{}, bossMods(boss)], decks:[myDeck||null, boss.deck.slice()]}); },   // v114 모험: 보스 좌석(1)은 보스 고정 덱
  view(seat){ return viewFor(this.state, seat); },
  submit(seat, action){
    const r=apply(this.state, action, seat);
    if(r.ok) this.state=r.state;
    return {ok:r.ok, error:r.error, events:r.events};
  }
};
// 난이도 → 상대 Player. bot:null 이면 아직 구현 전이라 선택할 수 없다.
const DIFFICULTY = {
  easy:   {label:'초급', desc:'완전 무작위로 행동하는 AI',      bot:BotPlayers.random},
  normal: {label:'중급', desc:'규칙 기반으로 행동하는 AI',      bot:BotPlayers.rule},
  normal2:{label:'중급2', desc:'한 수 앞을 보고 교환·마무리를 계산하는 AI (중급보다 강함)', bot:BotPlayers.rule2},
  hard:   {label:'상급', desc:'강화학습 기반 AI',               bot:null},   // TODO: 학습한 정책(BotPlayer)이 준비되면 연결
};
function showMulligan(done){                                  // v77 멀리건: 시작 카드를 클릭해 ✕ 표시 → 확정하면 그 카드만 덱에 섞고 새로 뽑는다
  const P=Host.state.seats[MY], cards=P.hand.filter(c=>(P.startIds||[]).includes(c.id)), out=new Set();
  const m=$('mulliganModal'), g=$('mulliganGrid'), ok=$('mulliganOk');
  $('mulliganTitle').textContent=`멀리건 — 시작 카드 ${cards.length}장`;
  const upd=()=>{ ok.textContent = out.size ? `${out.size}장 바꾸고 시작` : '바꾸지 않고 시작'; };
  g.innerHTML='';
  cards.forEach(c=>{ const el=cardEl(c,{}); el.onclick=()=>{ if(out.has(c.id)){ out.delete(c.id); el.classList.remove('mull-out'); } else { out.add(c.id); el.classList.add('mull-out'); } upd(); }; g.appendChild(el); });
  upd(); m.classList.add('show');
  ok.onclick=()=>{ m.classList.remove('show'); const n=mulliganHand(Host.state, MY, [...out]); view=Host.view(MY); if(n) logLine(`멀리건: 시작 카드 ${n}장을 바꿨습니다.`); done(); };
}
function beginMatch(){                                           // 멀리건을 거친 뒤 첫 화면·상대 선공 진행
  const go=()=>{ ui.busy=false; render();
    if(Host.state.turn===OPP){ ui.busy=true; render(); runOpponentTurn().then(()=>{ if(Host.state.over) finishGame(); ui.busy=false; render(); }); } };
  const P=Host.state.seats[MY];
  if(!(P.startIds||[]).length){ go(); return; }
  ui.busy=true; render(); showMulligan(go);
}
let Bot = null;                    // 상대 좌석을 움직이는 Player (나중에 원격 사람으로 교체)
let game = null;                   // {key, mode, bet, tier, cheats, pool, settled, result} 현재 판의 보상 정보
let curKey = 'normal';           // 일반/배팅 선택 화면에서 고른 중급 계열 난이도 (normal | normal2)
let betTier = ECON.BET_DEFAULT;    // 배팅 화면에서 고른 배당(%)
const fmt = n => Number(n).toLocaleString('ko-KR');

let view=null;
const ui={selected:null, pending:null, busy:false};
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const $ = id => document.getElementById(id);

// ---------- 툴팁: data-tip 속성이 있는 요소에 마우스를 올리거나(터치는 탭) 포커스하면 설명을 띄운다 ----------
const tipEl=document.createElement('div'); tipEl.id='tip'; document.body.appendChild(tipEl);
function showTip(el){
  tipEl.textContent=el.dataset.tip; tipEl.style.display='block';
  const r=el.getBoundingClientRect(), w=tipEl.offsetWidth, h=tipEl.offsetHeight;
  const x=Math.max(6, Math.min(innerWidth-w-6, r.left+r.width/2-w/2));
  let y=r.top-h-8; if(y<6) y=r.bottom+8;                 // 위에 자리가 없으면 아래로
  tipEl.style.left=x+'px'; tipEl.style.top=y+'px';
}
function hideTip(){ tipEl.style.display='none'; }
const tipOwner = e => (e.target.closest && e.target.closest('[data-tip]')) || null;
document.addEventListener('mouseover', e=>{ const c=tipOwner(e); if(c) showTip(c); });
document.addEventListener('mouseout',  e=>{ if(tipOwner(e)) hideTip(); });
document.addEventListener('focusin',   e=>{ const c=tipOwner(e); if(c) showTip(c); });
document.addEventListener('focusout',  e=>{ if(tipOwner(e)) hideTip(); });
document.addEventListener('click',     e=>{ const c=tipOwner(e); if(c) showTip(c); else hideTip(); });   // 터치 기기용

// ---------- 로그 / 이벤트 문장 ----------
function logLine(msg){
  const list=$('logList'), item=document.createElement('div');
  item.textContent=msg; list.appendChild(item);
  while(list.children.length>60) list.removeChild(list.firstChild);
}
const who = seat => seat===MY ? '내' : '상대';
const heroLabel = seat => seat===MY ? '내 영웅' : '상대 영웅';
const tLabel = (t,name) => t.kind==='hero' ? heroLabel(t.seat) : name;
function eventText(ev){
  switch(ev.type){
    case 'turn_start': return ev.seat===MY ? '당신의 턴입니다.' : '상대의 턴입니다.';
    case 'spell': return `${ev.tag?`(${ev.tag}) `:ev.chaos?'(혼돈) ':''}${ev.seat===MY?'당신이':'상대가'} 주문 「${ev.name}」 사용` + (ev.card.effect.type==='mana' ? `: 이번 턴 마나 +${ev.gain}` : '');
    case 'draw':
      if(ev.src) return `${who(ev.src.seat)} ${ev.src.name}: 카드 ${ev.count+ev.burned}장 뽑기`;
      return ev.burned ? `${who(ev.seat)} 손패가 가득 차 카드 ${ev.burned}장이 소멸했습니다.` : null;
    case 'summon': return ev.seat===MY ? `${ev.name} 소환!` : `상대가 ${ev.name}을(를) 소환!`;
    case 'attack': return `${who(ev.seat)} ${ev.name} → ${ev.targetName || heroLabel(ev.target.seat)} 공격!`;
    case 'damage':
      if(ev.immune) return `${ev.name}은(는) 화염 주문에 면역입니다!`;
      if(ev.absorbed) return `${ev.name}의 보호막이 파괴됐습니다!`;
      if(ev.cause==='battlecry') return `${who(ev.src.seat)} ${ev.src.name}: ${tLabel(ev.target,ev.name)}에게 ${ev.amount} 피해`;
      return ev.target.kind==='hero' ? `${heroLabel(ev.target.seat)}에게 ${ev.amount} 피해` : null;
    case 'heal': return `${who(ev.src.seat)} ${ev.src.name}: ${tLabel(ev.target,ev.name)} 체력 ${ev.amount} 회복`;
    case 'buff': return ev.temp ? `${who(ev.src.seat)} ${ev.src.name}: ${ev.name} 이번 턴 공격력 +${ev.value}` : `${who(ev.src.seat)} ${ev.src.name}: ${ev.name} +${ev.value}/+${ev.hpValue ?? ev.value}`;
    case 'handDiscount': return ev.seat===MY ? `${ev.src.name}: 손패 주문 ${ev.count}장의 비용 -${ev.amount}` : `상대 손패 주문의 비용이 감소했습니다`;
    case 'deckTransform': return `${who(ev.seat)} ${ev.src.name}: 덱의 주문 ${ev.count}장이 변신했습니다`;
    case 'deckAdd': return ev.count ? `${who(ev.src.seat)} ${ev.src.name}: 무작위 주문 ${ev.count}장을 덱에 섞어 넣음` : (ev.seat===MY ? `${ev.src.name}: 덱에 ${ev.name}을(를) 섞어 넣었습니다` : `상대가 덱에 카드를 섞어 넣었습니다`);   // v73: 중복돼 있던 두 줄을 합침
    case 'grant': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}에게 ${ev.kws.join('·')} 부여`;
    case 'mount': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}에게 도발과 죽음의 메아리 부여`;
    case 'cardsDiscount': return ev.seat===MY ? `${ev.src.name}: 얻은 주문 ${ev.count}장의 비용 -${ev.amount}` : `상대가 얻은 주문 ${ev.count}장의 비용이 감소했습니다`;
    case 'haste': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name} 바로 공격 가능!`;
    case 'fatigue': return `${who(ev.seat)} 덱이 비어 탈진! (${ev.amount} 피해)`;
    case 'freeze': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name} 빙결 — 다음 턴 공격 불가`;
    case 'copy': return ev.seat===MY ? `${ev.src.name}: ${ev.name}을(를) 복제해 손패에 추가` : `상대가 손패의 하수인 한 장을 복제했습니다.`;
    case 'silence': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}의 모든 추가 효과가 사라졌습니다`;
    case 'shieldGain': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}에게 보호막 부여`;
    case 'twin': return ev.seat===MY ? `이중 주문: 「${ev.name}」 사본을 손패에 추가${ev.burned?' — 손패가 가득 차 소각':''}` : `상대가 이중 주문 사본을 얻었습니다${ev.burned?' (손패가 가득 차 소각)':''}`;
    case 'eclipse': return `${who(ev.src.seat)} ${ev.src.name}: 이번 턴 다음 주문을 2번 시전`;
    case 'eclipseUse': return `일식: 「${ev.name}」을(를) 2번 시전합니다 (${who(ev.seat)} 턴)`;
    case 'recast': return `${who(ev.seat)} 「${ev.name}」 두 번째 시전`;
    case 'crystal': return `${who(ev.src.seat)} ${ev.src.name}: 빈 마나 수정 ${ev.amount}개 획득`;
    case 'nextMana': return `${who(ev.src.seat)} ${ev.src.name}: 다음 턴에만 마나 수정 ${ev.amount}개 획득`;
    case 'armorLater': return `${who(ev.src.seat)} ${ev.src.name}: 다음 턴 시작에 방어도 +${ev.amount} 예약`;
    case 'compost': return `${who(ev.src.seat)} ${ev.src.name}: 하수인 ${ev.count}기에게 죽음의 메아리 부여`;
    case 'ascend': return `${who(ev.src.seat)} ${ev.src.name}: 빈 마나 수정 +${ev.amount} (최대 마나 ${ev.now}), 다음 턴 시작에 최대 마나 +${ev.later}`;
    case 'forestSoul': return `${who(ev.src.seat)} ${ev.src.name}: 하수인 ${ev.count}기에게 죽음의 메아리 부여`;
    case 'recycle': return `${who(ev.src.seat)} ${ev.src.name}: 손패 ${ev.count}장을 덱에 섞고, 덱의 모든 카드 비용 -${ev.amount}`;
    case 'shrink': return `${who(ev.src.seat)} ${ev.src.name}: 덱의 하수인 ${ev.count}장의 비용·공격력 -${ev.amount}`;
    case 'toDeck': return ev.vanish ? `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}은(는) 카드가 될 수 없어 사라졌습니다` : `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}을(를) ${ev.seat===MY?'내':'상대'} 덱에 섞어 넣음`;   // v71
    case 'bounce': return ev.burned ? `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}이(가) ${ev.seat===MY?'내':'상대'} 손으로 돌아가려 했으나 손패가 가득 차 소멸` : `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}을(를) ${ev.seat===MY?'내':'상대'} 손으로 돌려보냄`;   // v72
    case 'deckCopy': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name} ${ev.count}장을 복사해 ${ev.seat===MY?'내':'상대'} 덱에 섞어 넣음`;   // v71
    case 'reveal': return `${who(ev.seat)} ${ev.src.name}: 덱의 주문 「${ev.name}」(비용 ${ev.cost}) 공개`;
    case 'spellTax': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.seat===MY?'내':'상대'} 다음 턴 주문 비용 +${ev.amount}`;
    case 'board': return null;
    case 'generated': if(ev.returned) return `${who(ev.seat)} 「${ev.name}」이(가) 대상이 죽어 손패로 돌아왔습니다${ev.burned?' — 손패가 가득 차 소각':''}`;
      return ev.seat===MY ? `${ev.src.name}: 「${ev.name}」 획득${ev.burned?' — 손패가 가득 차 소각':''}` : `상대가 ${ev.src.name}(으)로 카드를 얻었습니다${ev.burned?' (손패가 가득 차 소각)':''}`;
    case 'overload': return `${who(ev.seat)} 「${ev.name}」: 다음 턴 마나 수정 ${ev.amount}개 과부하`;
    case 'growth': return `${who(ev.src.seat)} ${ev.src.name}: 각 플레이어가 마나 수정 ${ev.amount}개를 얻음`;
    case 'fruit': return `${who(ev.seat)} 금단의 과일: 마나 ${ev.amount}를 모두 소모`;
    case 'fruitPick': return `${who(ev.seat)} 선택: ${ev.name}`;
    case 'fruitWait': return ev.seat===MY ? '하나를 선택하세요.' : null;
    case 'fruitTargetWait': return ev.seat===MY ? '공격력을 얻을 아군 하수인을 선택하세요.' : null;
    case 'shrinkStat': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}에게서 공격력 ${ev.atk}·생명력 ${ev.hp} 가져옴`;
    case 'corpseGain': return `${who(ev.seat)} ${ev.src.name}: 시체 ${ev.amount}개 획득`;
    case 'corpseSpend': return `${who(ev.seat)} ${ev.src.name}: 시체 ${ev.amount}개 소모`;
    case 'armor': return `${who(ev.src.seat)} ${ev.src.name}: 방어도 +${ev.amount}`;
    case 'handBuff': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.hand?'손패':'손과 덱'}의 하수인 +${ev.amount}/+${ev.amount}`;
    case 'handDouble': return `${who(ev.src.seat)} ${ev.src.name}: 손패 하수인 ${ev.count}장의 공격력·생명력 2배`;
    case 'storm': return `${who(ev.seat)} ${ev.src.name}: 이번 게임 동안 주문을 시전할 때마다 같은 비용의 하수인을 소환`;
    case 'heroAtk': return `${who(ev.src.seat)} ${ev.src.name}: 영웅 공격력 +${ev.amount} (이번 턴)`;
    case 'spellburst': return `${who(ev.seat)} ${ev.name}: 주문폭주 발동!`;
    case 'targetWait': return ev.seat===MY ? '두 번째 시전의 대상을 선택하세요.' : null;
    case 'discover': return `${who(ev.seat)} ${ev.src.name}: 카드 중 하나를 발견합니다`;
    case 'choicePick': return `${who(ev.seat)} 선택: ${ev.name}${ev.auto?' (혼돈의 주문서 자동 선택)':''}`;
    case 'discoverPick': return ev.seat===MY ? `발견: ${ev.name} 획득 (비용 ${ev.cost})${ev.burned?' — 손패가 가득 차 소각':''}` : '상대가 발견한 카드를 손에 넣었습니다';
    case 'recall': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}을(를) 손패로 되돌림`;
    case 'deckCopy': return `${who(ev.src.seat)} ${ev.src.name}: 상대 덱 ${ev.count}장을 복사해 내 덱에 섞어 넣음`;
    case 'statSet': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}의 ${ev.hp!=null?`공격력·생명력이 ${ev.atk}/${ev.hp}`:`공격력이 ${ev.atk}`}(으)로 바뀜`;
    case 'transform': return `${who(ev.src.seat)} ${ev.src.name}: ${ev.name}이(가) ${ev.to||'양'}(으)로 변했습니다`;
    case 'ignored': return ev.fizzle ? `${who(ev.seat)} ${ev.src.name}: 자리·대상이 없어 불발` : `${who(ev.seat)} ${ev.src.name}: 대상이 없어 효과 무시`;
    case 'mana': return `${who(ev.src.seat)} ${ev.src.name}: 이번 턴 마나 +${ev.amount}`;
    case 'revive': return `${who(ev.seat)} ${ev.name}: 환생! (체력 1)`;
    case 'phoenix': return `${who(ev.seat)} 불굴! 쓰러지지 않고 체력 ${ev.hp}(으)로 되살아났습니다`;
    case 'refund': return `${who(ev.seat)} ${ev.name}: 마나 환급 (+1)`;
    case 'eggGrow': return `${who(ev.seat)} ${ev.name}: 죽으면 나올 닭이 +${ev.bonus}/+${ev.bonus}`;
    case 'totemAtk': return `${who(ev.seat)} ${ev.src.name}: 이번 게임 동안 내 토템 공격력 +${ev.amount}`;
    case 'deckBuff': return `${who(ev.seat)} ${ev.src.name}: 덱의 하수인 ${ev.count}장 +${ev.amount}/+${ev.amount}`;
    case 'discard': return ev.count ? `${who(ev.seat)} ${ev.src.name}: 손패 ${ev.count}장을 모두 버렸습니다` : null;
    case 'echoCopy': return `${who(ev.seat)} ${ev.name}: 잔상 — 이번 턴에 한 장 더 낼 수 있습니다`;
    case 'dmgDouble': return `${who(ev.seat)} ${ev.src&&ev.src.name||'타르막'}: 이번 턴 동안 하수인이 받는 피해가 2배!`;
    case 'echo': return `${who(ev.seat)} ${ev.name}: 전투의 함성이 한 번 더 발동!`;
    case 'surrender': return `${who(ev.seat)} 항복했습니다.`;
    case 'death': return `${who(ev.seat)} ${ev.name} 파괴됨`;
    case 'game_over': return ev.winner===null ? '무승부' : (ev.winner===MY ? '승리!' : '패배...');
    default: return null;
  }
}

// ---------- 연출 ----------
const zoneEl = seat => $(seat===MY ? 'playerZone' : 'aiZone');
const heroEl = seat => $(seat===MY ? 'playerHero' : 'aiHero');
function elOf(t){
  if(t.kind==='hero') return heroEl(t.seat);
  return zoneEl(t.seat).querySelector(`.card[data-id="${t.id}"]`);
}
function floatOn(t, text, cls){
  const el=elOf(t); if(!el) return;
  const r=el.getBoundingClientRect(), f=document.createElement('div');
  f.className='float '+cls; f.textContent=text;
  f.style.left=(r.left+r.width/2)+'px'; f.style.top=(r.top+r.height/2)+'px';
  document.body.appendChild(f); setTimeout(()=>f.remove(), 950);
}
function showEffect(ev){
  if(ev.type==='damage'){
    if(ev.immune) floatOn(ev.target,'면역','shield'); else if(ev.absorbed) floatOn(ev.target, ev.shieldLeft ? '🛡 남은 '+ev.shieldLeft : '🛡', 'shield'); else floatOn(ev.target,'-'+ev.amount,'dmg');
  } else if(ev.type==='heal'){ floatOn(ev.target,'+'+ev.amount,'heal'); }
  else if(ev.type==='shrinkStat'){ floatOn(ev.target, `-${ev.atk}/-${ev.hp}`, 'buff'); }
  else if(ev.type==='buff'){ floatOn(ev.target, ev.temp ? `공격력 +${ev.value}` : `+${ev.value}/+${ev.hpValue ?? ev.value}`,'buff'); }
  else if(ev.type==='mount'){ floatOn(ev.target,'도발','shield'); const el=elOf(ev.target); if(el) el.classList.add('taunt'); }
  else if(ev.type==='death'){ const el=elOf(minionT(ev.seat, ev.id)); if(el) el.classList.add('dead'); }
  else if(ev.type==='revive'){ floatOn(minionT(ev.seat, ev.id),'환생!','heal'); }
  else if(ev.type==='mana'){ floatOn(heroT(ev.seat),'마나 +'+ev.amount,'buff'); }
  else if(ev.type==='heroAtk'){ floatOn(heroT(ev.seat),'공격력 +'+ev.amount,'buff'); }
  else if(ev.type==='spellburst'){ floatOn(minionT(ev.seat, ev.id),'주문폭주!','buff'); }
  else if(ev.type==='haste'){ floatOn(ev.target,'급습!','buff'); const el=elOf(ev.target); if(el) el.classList.remove('sick'); }
  else if(ev.type==='freeze'){ floatOn(ev.target,'❄ 빙결','shield'); const el=elOf(ev.target); if(el) el.classList.add('frozen'); }
  else if(ev.type==='silence'){ floatOn(ev.target,'침묵','shield'); const el=elOf(ev.target); if(el) el.classList.remove('taunt','shielded','frozen','stealthed'); }
  else if(ev.type==='shieldGain'){ floatOn(ev.target,'🛡 보호막','shield'); }
  else if(ev.type==='recall'){ floatOn(ev.target,'↩ 회수','shield'); }
  else if(ev.type==='statSet'){ floatOn(ev.target, ev.hp!=null ? `${ev.atk}/${ev.hp}` : `공격력 ${ev.atk}`, 'buff'); }
  else if(ev.type==='transform'){ floatOn(ev.target,'🐑 변이','shield'); }
  else if(ev.type==='toDeck'){ floatOn(ev.target, ev.vanish ? '✕' : '↩ 덱', 'shield'); }   // v71
  else if(ev.type==='bounce'){ floatOn(ev.target, ev.burned ? '🔥 소멸' : '↩ 손', 'shield'); }   // v72
  else if(ev.type==='deckCopy'){ floatOn(ev.target,'×'+ev.count+' 복사','buff'); }
}
const attackerElOf = ev => ev.attackerId==='hero' ? heroEl(ev.seat) : elOf(minionT(ev.seat, ev.attackerId));   // v80: 영웅도 공격자
async function lungeApproach(ev){
  const a=attackerElOf(ev), t=elOf(ev.target);
  if(!a||!t) return;
  const r1=a.getBoundingClientRect(), r2=t.getBoundingClientRect();
  const dx=(r2.left+r2.width/2)-(r1.left+r1.width/2), dy=(r2.top+r2.height/2)-(r1.top+r1.height/2);
  a.setAttribute('data-attacking','1');
  a.style.transition='transform .15s ease-in';
  a.style.transform=`translate(${dx*0.7}px,${dy*0.7}px) scale(1.08)`;
  await sleep(160);
}
async function lungeRetract(ev){
  const a=attackerElOf(ev); if(!a) return;
  a.style.transition='transform .15s ease-out';
  a.style.transform='translate(0,0) scale(1)';
  await sleep(160);
  a.removeAttribute('data-attacking');
}
// 현재 DOM 은 "행동 직전" 상태. 이벤트를 연출한 뒤 호출자가 최종 상태로 render 한다.
// 주문을 쓰면 화면 가운데에 카드를 2초간 크게 보여준다 (상대가 쓴 것도 똑같이 보여줘서 무슨 주문인지 알 수 있게)
async function showSpellCast(ev){
  const ov=document.createElement('div'); ov.id='spellCast';
  ov.appendChild(cardEl(ev.card));
  const cap=document.createElement('div'); cap.className='cap';
  cap.textContent=ev.caption || (ev.tag ? `${ev.seat===MY?'당신의':'상대의'} ${ev.tag} 효과로 주문을 시전합니다` : `${ev.seat===MY?'당신이':'상대가'} 주문을 사용했습니다`);
  ov.appendChild(cap);
  document.body.appendChild(ov);
  fxAura(ov, ev.card);          // v88
  await sleep(2000);
  ov.remove();
}
// v60: 손패가 가득 차 카드가 소멸하면 그 카드를 가운데에 보여 준 뒤 불타 사라지게 한다 (상대의 소멸 카드도 공개)
async function showBurn(card, seat){
  const ov=document.createElement('div'); ov.id='burnCast';
  const wrap=document.createElement('div'); wrap.className='wrap';
  if(card){ wrap.appendChild(cardEl(card)); } else { const back=document.createElement('div'); back.className='card'; back.style.background='linear-gradient(160deg,#3a3358,#1c1930)'; wrap.appendChild(back); }
  const cap=document.createElement('div'); cap.className='cap';
  cap.textContent=`${seat===MY?'당신의':'상대의'} 손패가 가득 차 ${card?`「${card.name}」이(가) `:'카드가 '}소멸했습니다`;
  ov.appendChild(wrap); ov.appendChild(cap); document.body.appendChild(ov);
  fxBurnFire(wrap); await sleep(1750); ov.remove();
}
function burnedOf(ev){                                          // 이벤트에서 소멸한 카드 목록 (없으면 정보 없는 카드 한 장)
  if(ev.type==='draw') return ev.burned ? (ev.burnedCards&&ev.burnedCards.length ? ev.burnedCards : Array(ev.burned).fill(null)) : [];
  if((ev.type==='generated'||ev.type==='twin'||ev.type==='discoverPick'||ev.type==='bounce') && ev.burned) return [ev.card||null];
  return [];
}
// ============ v88: 이펙트 이미지 연출 ============
// images/fx_*.png (투명 PNG, 오른쪽을 향한 투사체는 날아갈 방향으로 회전). 주문 속성에 따라 투사체·피격 이미지를 고른다.
const FX_DIM = {"arcane_book":[256,258],"arcane_circle":[260,284],"ash":[360,276],"blizzard":[314,388],"blood":[292,258],"bolt_arrow":[340,168],"bolt_strike":[244,284],"claw":[242,262],"ember_smoke":[226,284],"fire_arrow":[312,238],"fire_burst":[330,280],"fire_rain":[314,370],"fire_spirit":[282,358],"frozen":[264,382],"hellfire":[246,280],"holy_beam":[272,294],"holy_heal":[282,292],"holy_shield":[306,290],"ice_lance":[360,204],"ice_shatter":[314,374],"leaves":[268,272],"mana_gem":[278,280],"mana_ring":[214,258],"plague":[298,280],"scythe":[294,280],"shadow_bolt":[332,182],"silence":[304,294],"spirit_revive":[264,282],"summon_crack":[350,272],"supernova":[258,282],"thorns":[294,282],"rush":[288,113],"slam":[256,190],"vampirism":[337,192],"herocrack":[264,184],"discover":[184,138],"copycard":[129,133],"recall":[152,138],"todeck":[147,132],"stealth":[105,132],"taunt":[128,136],"weaken":[144,137],"empower":[131,127],"boardclear":[439,135],"spellburst":[146,127],"eclipse":[137,134],"plaguetrail":[278,122],"polymorph":[127,123],"deathecho":[98,125],"victory":[134,135],"defeat":[147,139],"fireball":[340, 185],"bolt_big":[380, 263],"ice_burst":[340, 332],"heal_pillar":[199, 360]};   // v90: 새 정지 이미지
const FX_DARK = new Set(['shadow_bolt','scythe','blood','ash','ember_smoke','silence','thorns','summon_crack','herocrack','plaguetrail','defeat']);   // 어두운 이미지는 일반 합성, 나머지는 빛 합성(screen)
const FX_SCH = {                         // 속성별: proj=날아가는 투사체, hit=명중, aoe=전장 광역, pre=시전 전 준비, up=명중 이미지를 위로 올리는 비율
  '화염':{proj:['fire_arrow','fireball'], hit:['fire_burst','fireboom'], aoe:['fire_rain','fireboom']},   // v90: 기존+신규 이미지 섞어 쓰기
  '냉기':{proj:'ice_lance',   hit:['ice_shatter','ice','ice_burst'], aoe:'blizzard'},
  '비전':{proj:'bolt_arrow',  hit:['bolt_strike','lightning','bolt_big'], pre:'arcane_circle', up:.34},
  '신성':{hit:['holy_beam','goldburst'], up:.3},
  '암흑':{proj:'shadow_bolt', hit:'scythe'},
  '지옥':{hit:['hellfire','poison'], up:.12},
  '혈기':{hit:'blood'},
  '자연':{hit:'thorns', up:.1},
};
const FX_AURA = {                        // 주문 시전 카드 뒤에 깔리는 속성 이미지와 카드 광채 색
  '화염':{img:'fire_burst',  glow:'rgba(255,140,50,.85)'},
  '냉기':{img:['ice_shatter','ice_burst'], glow:'rgba(130,205,255,.85)'},
  '비전':{img:'arcane_circle', glow:'rgba(90,150,255,.85)', spin:true},
  '신성':{img:['holy_beam','heal_pillar'], glow:'rgba(255,215,110,.85)'},
  '암흑':{img:'scythe',      glow:'rgba(150,80,220,.85)'},
  '지옥':{img:'hellfire',    glow:'rgba(110,230,90,.85)'},
  '혈기':{img:'blood',       glow:'rgba(220,50,60,.85)'},
  '자연':{img:'leaves',      glow:'rgba(110,210,100,.85)', spin:true},
};
// ============ v90: 애니메이션 이펙트 (images/fx_a_*.png = 가로로 이어 붙인 프레임 스트립, 투명 PNG) ============
// n=프레임 수, w/h=프레임 크기, dur=기본 재생 ms, ax/ay=기준점(0~1, 대상 중심에 맞춰짐)
const FX_ANIM = {"slash":{"n":9,"w":336,"h":184,"dur":520,"ax":0.5,"ay":0.5,"blend":"glow"},"goldburst":{"n":9,"w":256,"h":256,"dur":620,"ax":0.5,"ay":0.5,"blend":"glow"},"shield":{"n":17,"w":208,"h":208,"dur":900,"ax":0.5,"ay":0.5,"blend":"glow"},"poison":{"n":17,"w":208,"h":208,"dur":1000,"ax":0.5,"ay":0.5,"blend":"glow"},"lightning":{"n":9,"w":384,"h":206,"dur":620,"ax":0.5,"ay":0.82,"blend":"glow"},"ice":{"n":9,"w":256,"h":256,"dur":720,"ax":0.5,"ay":0.5,"blend":"glow"},"heal":{"n":17,"w":208,"h":208,"dur":1000,"ax":0.5,"ay":0.8,"blend":"glow"},"fireboom":{"n":9,"w":256,"h":256,"dur":760,"ax":0.5,"ay":0.5,"blend":"glow"},"burn":{"n":15,"w":256,"h":256,"dur":1500,"ax":0.496996996996997,"ay":0.5045045045045045,"blend":"glow","cardw":0.5135135135135135,"cardh":0.7267267267267267}};
const FX_STATIC_NEW = ['fireball','bolt_big','ice_burst','heal_pillar'];
const fxV = a => Array.isArray(a) ? a[Math.floor(Math.random()*a.length)] : a;     // 배열이면 무작위로 하나 (여러 이미지 섞어 쓰기)
const FX_HM = {holy_beam:1.9, bolt_strike:1.9, lightning:2.6, bolt_big:2.3, fireboom:2.2, ice:2.1, ice_burst:2.0, goldburst:2.1, poison:2.1};   // 명중 이미지 크기 배율
const FX_UP = {lightning:0, fireboom:0, ice:0, goldburst:0, poison:0, ice_burst:0, bolt_big:.3};                                              // 명중 이미지를 위로 올리는 비율 (신규 이미지별)
const FX_PB = {fireball:200};                                                                                                                   // 투사체 크기
(function(){ try{ for(const n in FX_ANIM){ const i=new Image(); i.src='images/fx_a_'+n+'.png'; }
  for(const n of FX_STATIC_NEW){ const i=new Image(); i.src='images/fx_'+n+'.png'; } }catch(e){} })();   // 미리 불러오기
function fxAnim(name, x, y, box, o={}){              // 프레임 스트립 재생. o.from/o.to = 프레임 구간, o.bw/bh = 가로·세로 직접 지정
  const m=FX_ANIM[name]; if(!m) return null;
  const from=o.from||0, to=(o.to==null?m.n-1:o.to), cnt=to-from+1;
  const k=box/Math.max(m.w,m.h), w=o.bw||m.w*k, h=o.bh||m.h*k;
  const d=document.createElement('div'); d.className='fxs glow'+(o.cls?' '+o.cls:'');
  d.style.width=w+'px'; d.style.height=h+'px'; d.style.backgroundImage='url(images/fx_a_'+name+'.png)';
  d.style.backgroundSize=(m.n*w)+'px '+h+'px'; d.style.backgroundRepeat='no-repeat'; d.style.transformOrigin=(m.ax*100)+'% '+(m.ay*100)+'%';
  if(o.z) d.style.zIndex=o.z;
  y -= (o.up||0)*h;
  const rot=o.rot||0, T=sc=>`translate(${x-m.ax*w}px,${y-m.ay*h}px) rotate(${rot}rad) scale(${sc})`;
  const dur=o.dur || Math.round(m.dur*cnt/m.n);
  const kf=[]; for(let i=0;i<cnt;i++) kf.push({backgroundPosition:(-(from+i)*w)+'px 0px', offset:i/cnt, easing:'step-end'});
  kf.push({backgroundPosition:(-(from+cnt-1)*w)+'px 0px', offset:1});
  document.body.appendChild(d);
  d.animate(kf,{duration:dur, easing:'linear', fill:'forwards'});
  const a=d.animate([{opacity:0,transform:T(.88)},{opacity:1,transform:T(1),offset:.08},{opacity:1,transform:T(1.04),offset:.86},{opacity:0,transform:T(1.07)}],{duration:dur, easing:'linear', fill:'forwards'});
  a.finished.then(()=>d.remove(), ()=>d.remove());
  return a;
}
function fxBurnFire(wrap){                           // 손패 초과로 소멸하는 카드 위에 불길 (카드가 자리 잡은 뒤 크기를 재서 맞춘다)
  setTimeout(()=>{ try{ const el=wrap.querySelector('.card'); if(!el||!el.isConnected) return;
    const r=el.getBoundingClientRect(), m=FX_ANIM.burn;
    fxAnim('burn', r.left+r.width/2, r.top+r.height/2, 0, {bw:r.width/m.cardw, bh:r.height/m.cardh, z:80, dur:1450});
  }catch(e){ console.warn('burn fx',e); } }, 200);
}
// v91: 주문 피해 판정. 엔진은 대부분의 주문 피해를 cause:'battlecry' 로 내보내므로(src.name = 주문 이름) 주문 이름으로 판별한다
const fxIsSpellDmg = (ev,ctx) => !!ctx && ev.type==='damage' && ev.cause!=='combat' && ev.cause!=='fatigue' && ev.cause!=='lifecost' && (ev.cause==='spell' || (!!ev.src && !!ctx.name && ev.src.name===ctx.name));
const fxByName = n => /번개/.test(n||'') ? {proj:undefined, pre:undefined, hit:['lightning','bolt_big','bolt_strike'], aoe:'lightning', up:0} : {};   // v91: 이름에 '번개'가 든 주문(자연 속성)은 번개 이펙트
const fxPending = [];                                  // 소환 연출은 화면이 다시 그려져 하수인이 생긴 뒤에 재생
const fxSchoolOf = card => (card && ((card.school&&card.school[0]) || ((CARD_POOL.find(x=>x.name===card.name)||{}).school||[])[0])) || null;
function fxCenterOf(t){ const el=elOf(t); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height, s:Math.max(r.width,r.height)}; }
function fxMake(name, box, cls){
  const d=FX_DIM[name]; if(!d) return null;
  const k=box/Math.max(d[0],d[1]), im=document.createElement('img');
  im.src='images/fx_'+name+'.png'; im.draggable=false; im.className='fxs'+(FX_DARK.has(name)?'':' glow')+(cls?' '+cls:'');
  im.style.width=(d[0]*k)+'px'; im.style.height=(d[1]*k)+'px';
  return {im, h:d[1]*k};
}
function fxSprite(name, x, y, box, o={}){            // 제자리에서 팡 나타났다 사라지는 이미지
  if(FX_ANIM[name]) return fxAnim(name, x, y, box, o);   // v90: 애니메이션 스트립이면 프레임 재생
  const m=fxMake(name, box); if(!m) return null;
  y -= m.h*(o.up||0);
  const rot=o.rot||0, T=(sc,dy=0)=>`translate(${x}px,${y+dy}px) translate(-50%,-50%) rotate(${rot}rad) scale(${sc})`;
  if(o.z) m.im.style.zIndex=o.z;
  document.body.appendChild(m.im);
  const a=m.im.animate(o.kf?o.kf(T):[{opacity:0,transform:T(.45)},{opacity:1,transform:T(1.08),offset:.22},{opacity:1,transform:T(1),offset:.65},{opacity:0,transform:T(1.12)}],
                       {duration:o.dur||600, easing:'ease-out', fill:'forwards'});
  a.finished.then(()=>m.im.remove(), ()=>m.im.remove());
  return a;
}
function fxShoot(name, from, to, box, ms){           // 시전자 → 대상으로 날아가는 투사체
  const m=fxMake(name, box); if(!m) return Promise.resolve();
  const ang=Math.atan2(to.y-from.y, to.x-from.x), T=(x,y,sc)=>`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${ang}rad) scale(${sc})`;
  document.body.appendChild(m.im);
  const dx=to.x-from.x, dy=to.y-from.y;
  const a=m.im.animate([{opacity:0,transform:T(from.x,from.y,.55)},{opacity:1,transform:T(from.x+dx*.1,from.y+dy*.1,1),offset:.1},
                        {opacity:1,transform:T(to.x,to.y,1),offset:.92},{opacity:0,transform:T(to.x,to.y,1.15)}], {duration:ms, easing:'ease-in', fill:'forwards'});
  const done=a.finished.then(()=>m.im.remove(), ()=>m.im.remove());
  return done;
}
const fxRise = T=>[{opacity:0,transform:T(.7,20)},{opacity:1,transform:T(1,-6),offset:.3},{opacity:1,transform:T(1,-30),offset:.7},{opacity:0,transform:T(1.05,-60)}];
const fxPop = T=>[{opacity:0,transform:T(.5)},{opacity:1,transform:T(1.05),offset:.15},{opacity:1,transform:T(1),offset:.8},{opacity:0,transform:T(1)}];
function fxExtra(ev,c){ if(ev.absorbed||!(ev.amount>0)) return;      // v89: 영웅 피격 = 붉은 균열, 피해 5 이상 = 강타 충격파
  if(ev.target.kind==='hero') fxSprite('herocrack',c.x,c.y,c.s*1.35,{dur:650});
  if(ev.amount>=5){ if(Math.random()<.5) fxSprite('slam',c.x,c.y,c.s*1.9,{dur:560}); else fxSprite('goldburst',c.x,c.y,c.s*2.1); } }
async function fxWide(ev){ try{                       // v89: 전장 전체 연출 (전장 정리·역병 전염)
  const e=ev.card&&ev.card.effect&&ev.card.effect.type;
  if(['wipe','destroyAll','vanishAll'].includes(e)){ const a=zoneEl(MY).getBoundingClientRect(), b=zoneEl(OPP).getBoundingClientRect();
    fxSprite('boardclear',(a.left+a.right)/2,(a.top+a.bottom+b.top+b.bottom)/4,Math.min(innerWidth*.95,1000),{dur:1000}); await sleep(380); }
  else if(e==='spreadPlague'||e==='ultPlague'){ const z=zoneEl(ev.seat).getBoundingClientRect();
    if(Math.random()<.5) fxSprite('plaguetrail',(z.left+z.right)/2,(z.top+z.bottom)/2,Math.min(z.width*.9,800),{dur:1000}); else fxSprite('poison',(z.left+z.right)/2,(z.top+z.bottom)/2,Math.min(z.width*.6,420)); await sleep(300); }
}catch(x){ console.warn('fxWide',x); } }
async function fxPlay(ev, ctx){                      // 이벤트 하나에 맞는 이펙트. 투사체는 날아갈 동안 기다린다 (숫자는 명중 시점에 뜨도록)
  try{
    const school=ctx && ctx.school, S=Object.assign({}, FX_SCH[school]||{}, fxByName(ctx&&ctx.name));
    const at=(t,name,mul,o)=>{ const c=fxCenterOf(t); if(c) fxSprite(name,c.x,c.y,c.s*mul,o||{}); };
    switch(ev.type){
      case 'damage': {
        const c=fxCenterOf(ev.target); if(!c) break;
        if(ev.immune){ fxSprite('holy_shield',c.x,c.y,c.s*1.5,{dur:500}); break; }
        if(ev.absorbed){ if(Math.random()<.5) fxSprite('holy_shield',c.x,c.y,c.s*1.5,{dur:500}); else fxSprite('shield',c.x,c.y,c.s*1.6,{from:8,to:14,dur:520}); break; }
        if(fxIsSpellDmg(ev,ctx)){
          if(ctx.nd>=2){                               // 광역 주문: 전장 전체 이미지 한 번 + 대상마다 명중
            if(!ctx.aoeDone){ ctx.aoeDone=true;
              const aoeN=fxV(S.aoe); if(aoeN){ const z=zoneEl(ev.target.seat).getBoundingClientRect(); fxSprite(aoeN, z.left+z.width/2, z.top+z.height/2, Math.min(Math.max(z.width*.6,300),520), {dur:900}); await sleep(260); } }
          } else {
            const fh=fxCenterOf(heroT(ctx.seat));
            if(S.pre && !ctx.preDone && fh){ ctx.preDone=true; fxSprite(S.pre, fh.x, fh.y, 150, {dur:520}); await sleep(200); }
            { const pj=fxV(S.proj); if(pj && fh) await fxShoot(pj, fh, c, FX_PB[pj]||140, 300); }
          }
          { const hit=fxV(S.hit||'claw'); fxSprite(hit, c.x, c.y, c.s*(FX_HM[hit]||1.7), {dur:FX_ANIM[hit]?undefined:560, up:(hit in FX_UP)?FX_UP[hit]:(S.up||0)}); }
        } else if(Math.random()<.5) fxSprite('claw', c.x, c.y, c.s*1.5, {dur:420, rot:(Math.random()-.5)*.8});
        else fxSprite('slash', c.x, c.y, c.s*2.1, {rot:(Math.random()-.5)*1.1});   // v90: 전투 피해 = 발톱 / 검격 섞어서   // 전투·함성 등 일반 피해
        fxExtra(ev,c);
        break; }
      case 'heal': if(ev.ls) at(ev.target,'vampirism',2.1,{dur:760}); else { const hv=fxV(['holy_heal','heal','heal_pillar']); if(hv==='heal') at(ev.target,'heal',2.3); else if(hv==='heal_pillar') at(ev.target,'heal_pillar',2.1,{dur:900,up:.2}); else at(ev.target,'holy_heal',1.8,{dur:760,up:.1}); } break;
      case 'freeze': at(ev.target,fxV(['ice_shatter','ice_burst']),1.5,{dur:620}); at(ev.target,'frozen',1.25,{dur:900}); break;
      case 'silence': at(ev.target,'silence',1.3,{dur:820}); break;
      case 'shieldGain': if(Math.random()<.5) at(ev.target,'holy_shield',1.5,{dur:820}); else at(ev.target,'shield',1.7,{dur:900}); break;
      case 'mount': at(ev.target,'thorns',1.5,{dur:820,up:.1}); at(ev.target,'taunt',1.3,{dur:900}); break;
      case 'transform': at(ev.target,'polymorph',1.7,{dur:800}); break;
      case 'revive': if(Math.random()<.5) at(ev.target,'spirit_revive',1.9,{dur:900}); else at(ev.target,'heal',2.3); break;
      case 'buff': at(ev.target,'empower',1.6,{dur:700,up:.05}); break;
      case 'death': at(minionT(ev.seat,ev.id),'ash',1.5,{dur:760}); if(ev.dr) at(minionT(ev.seat,ev.id),'deathecho',1.5,{dur:1000,kf:fxRise}); break;
      case 'armor': if(Math.random()<.5) at(heroT(ev.seat),'holy_shield',1.25,{dur:760}); else at(heroT(ev.seat),'shield',1.4,{dur:850}); break;
      case 'crystal': at(heroT(ev.seat),'mana_ring',1.3,{dur:820}); break;
      case 'mana': at(heroT(ev.seat),'mana_gem',1.2,{dur:700}); break;
      case 'draw': if(ctx && ctx.school==='비전' && ctx.seat===ev.seat) at(heroT(ev.seat),'arcane_book',1.3,{dur:760}); break;
      case 'haste': at(ev.target,'rush',1.7,{dur:520}); break;
      case 'recall': case 'bounce': at(ev.target,'recall',1.6,{dur:760}); break;
      case 'toDeck': case 'recycle': case 'deckAdd': case 'deckCopy': at(ev.target||heroT(ev.seat!=null?ev.seat:ev.src.seat),'todeck',ev.target?1.6:1.5,{dur:800}); break;
      case 'copy': case 'twin': case 'deckCopy': at(ev.target||heroT(ev.seat),'copycard',ev.target?1.6:1.4,{dur:760}); break;
      case 'grant': for(const k of (ev.kws||[])){ if(k==='은신') at(ev.target,'stealth',1.5,{dur:900}); else if(k==='도발') at(ev.target,'taunt',1.3,{dur:900}); } break;
      case 'compost': case 'forestSoul': { const sd=ev.src.seat; for(const m of Host.state.seats[sd].board) at(minionT(sd,m.id),'deathecho',1.4,{dur:900,kf:fxRise}); break; }
      case 'shrinkStat': at(ev.target,'weaken',1.6,{dur:760}); break;
      case 'shrink': at(heroT(ev.seat!=null?ev.seat:ev.src.seat),'weaken',1.3,{dur:760}); break;
      case 'heroAtk': case 'handBuff': case 'totemAtk': at(heroT(ev.seat!=null?ev.seat:ev.src.seat),'empower',1.3,{dur:700}); break;
      case 'spellburst': if(Math.random()<.5) at(minionT(ev.seat,ev.id),'spellburst',1.7,{dur:760}); else at(minionT(ev.seat,ev.id),'goldburst',2.0); break;
      case 'deckTransform': at(heroT(ev.seat),'polymorph',1.3,{dur:800}); break;
      case 'discover': if(ev.seat!==MY) at(heroT(ev.seat),'discover',2.2,{dur:900}); break;
      case 'eclipse': fxSprite('eclipse',innerWidth/2,innerHeight/2,Math.min(innerWidth,innerHeight)*.7,{dur:1300,z:60}); await sleep(450); break;
      case 'eclipseUse': fxSprite('eclipse',innerWidth/2,innerHeight/2,Math.min(innerWidth,innerHeight)*.4,{dur:800,z:60}); break;
      case 'summon': fxPending.push({seat:ev.seat,id:ev.id}); break;
    }
  }catch(e){ console.warn('fx',e); }
}
function fxFlush(){                                   // 화면이 그려진 뒤 소환된 하수인 자리에 땅 균열
  if(!fxPending.length) return;
  for(const p of fxPending.splice(0)){
    const c=fxCenterOf(minionT(p.seat,p.id)); if(c) fxSprite('summon_crack', c.x, c.y+c.h*.2, c.s*2, {dur:720});
  }
}
function fxAura(ov, card){                            // 주문 시전 카드 뒤 속성 이미지 + 카드 광채
  const sc=fxSchoolOf(card), a=FX_AURA[sc]; if(!a) return;
  const cardEl=ov.querySelector('.card'); if(!cardEl) return;
  cardEl.style.boxShadow=`0 0 30px ${a.glow}`;
  requestAnimationFrame(()=>{
    if(!ov.isConnected) return;
    const r=cardEl.getBoundingClientRect(), m=fxMake(fxV(a.img), 380, 'aura'); if(!m) return;
    const x=r.left+r.width/2, y=r.top+r.height/2, T=(sc2,rot)=>`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${rot}deg) scale(${sc2})`;
    ov.insertBefore(m.im, ov.firstChild);
    const an=m.im.animate([{opacity:0,transform:T(.6,0)},{opacity:.95,transform:T(1,a.spin?25:0),offset:.15},{opacity:.95,transform:T(1.06,a.spin?120:0),offset:.8},{opacity:0,transform:T(1.1,a.spin?160:0)}],
                          {duration:1950, easing:'linear', fill:'forwards'});
    an.finished.catch(()=>{});
  });
}
{ const _render=render; render=function(){ const r=_render.apply(this,arguments); try{ fxFlush(); }catch(e){} return r; }; }   // 화면이 다시 그려질 때마다 대기 중인 소환 연출 재생
async function playEvents(evs){
  let spellSeen=false, dv=null, fxc=null;   // v88: fxc = 지금 시전 중인 주문의 이펙트 정보     // v30: 주문으로 소환된 하수인은 그 시전 직후 전장에 바로 나타나게 한다 (혼돈의 주문서 안에서도 시전 즉시)
  for(let i=0;i<evs.length;i++){
    const ev=evs[i];
    if(ev.type==='spell') spellSeen=true;
    if(ev.type==='board'){        // v39: 혼돈의 주문서 중간 상태. 하수인 소환·버프·피해·죽음이 주문 순서대로 화면에 반영된다
      if(!dv){ dv=structuredClone(view); dv.pending=null; dv.legal=[]; view=dv; }
      for(const [sd,side] of [[MY,dv.me],[OPP,dv.opp]]){ const sn=ev.seats[sd]; side.board=structuredClone(sn.board); side.hp=sn.hp; side.armor=sn.armor; side.heroAtk=sn.heroAtk||0;
        side.mana=sn.mana; side.maxMana=sn.maxMana; side.deckCount=sn.deckCount;      // v55: 혼돈의 주문서 중간에도 손패·마나·덱 장수가 바로 갱신된다
        if(sd===MY) side.hand=structuredClone(sn.hand); else side.handCount=sn.hand.length; }
      render();
    }
    if(ev.type==='summon' && spellSeen){
      const fin=Host.state.seats[ev.seat].board.find(x=>x.id===ev.id);        // 최종 상태에 남아 있는 하수인만 (나중에 죽었으면 건너뜀)
      if(fin){
        if(!dv){ dv=structuredClone(view); dv.pending=null; dv.legal=[]; view=dv; }
        const side=ev.seat===MY ? dv.me : dv.opp;
        if(!side.board.some(x=>x.id===ev.id) && side.board.length<CONFIG.MAX_BOARD){
          const sn=structuredClone(fin); sn.summoned=true; delete sn.deathDraw; delete sn.deathSummon; delete sn.deathStego;   // v36: 나중 효과(죽음의 메아리 부여·이번 턴 공격력)는 그 이벤트가 재생될 때 붙는다
          if(sn.tempAtk){ sn.atk-=sn.tempAtk; sn.tempAtk=0; }
          side.board.push(sn); render();
        }
      }
    }
    if(ev.type==='compost' || ev.type==='forestSoul'){     // v36: 죽음의 메아리 부여는 그 주문이 시전되는 즉시 하수인 태그에 나타난다 (혼돈의 주문서 안에서도)
      if(!dv){ dv=structuredClone(view); dv.pending=null; dv.legal=[]; view=dv; }
      const key=ev.type==='compost' ? 'deathDraw' : 'deathSummon', side=ev.seat===MY ? dv.me : dv.opp;
      side.board.forEach(m=>{ m[key]=(m[key]||0)+1; }); render();
    }
    if(ev.type==='mount'){      // v61: 죽음의 메아리 태그·도발은 그 주문이 시전되는 즉시 나타난다 (혼돈의 주문서 안에서도)
      if(!dv){ dv=structuredClone(view); dv.pending=null; dv.legal=[]; view=dv; }
      const side=ev.target.seat===MY ? dv.me : dv.opp, mm=side.board.find(x=>x.id===ev.target.id);
      if(mm){ mm.taunt=true; mm.deathStego=(mm.deathStego||0)+1; render(); }
    }
    if(ev.type==='spell'){ logLine(eventText(ev));
      let nd=0; for(let j=i+1;j<evs.length && evs[j].type!=='spell';j++) if(!evs[j].absorbed && fxIsSpellDmg(evs[j],{name:ev.card&&ev.card.name})) nd++;   // v88: 피해 대상이 2 이상이면 광역 연출
      fxc={school:fxSchoolOf(ev.card), seat:ev.seat, name:ev.card&&ev.card.name, nd, aoeDone:false, preDone:false};
      await showSpellCast(ev); await fxWide(ev); continue; }
    if(ev.type==='fatigue'){      // 탈진: 주문처럼 카드를 2초간 보여 준 뒤, 이어지는 피해 이벤트가 영웅에게 표시된다
      logLine(eventText(ev));
      await showSpellCast({seat:ev.seat, card:{type:'spell', name:'탈진', cost:0, fatigue:true, effect:{type:'fatigue', value:ev.amount}},
        caption:`${ev.seat===MY?'당신의':'상대의'} 덱이 비었습니다! 탈진 ${ev.amount} 피해`});
      continue;
    }
    if(ev.type==='attack'){
      const group=[];
      while(i+1<evs.length && (evs[i+1].type==='damage'||evs[i+1].type==='death'||evs[i+1].type==='revive')) group.push(evs[++i]);
      logLine(eventText(ev));
      try{ const am=ev.attackerId!=='hero' && Host.state.seats[ev.seat].board.find(x=>x.id===ev.attackerId), ac=fxCenterOf(minionT(ev.seat,ev.attackerId)), tc=fxCenterOf(ev.target);   // v89: 돌진·급습 하수인의 공격 = 속도선
        if(am && (am.charge||am.rush) && ac && tc) fxSprite('rush',(ac.x+tc.x)/2,(ac.y+tc.y)/2,Math.max(140,Math.hypot(tc.x-ac.x,tc.y-ac.y)*.9),{rot:Math.atan2(tc.y-ac.y,tc.x-ac.x),dur:380}); }catch(e){}
      await lungeApproach(ev);
      for(const g of group){ const t=eventText(g); if(t) logLine(t); showEffect(g); fxPlay(g,null); }
      await sleep(240);
      await lungeRetract(ev);
      continue;
    }
    const t=eventText(ev); if(t) logLine(t);
    await fxPlay(ev, fxc);          // v88
    showEffect(ev);
    for(const bc of burnedOf(ev)) await showBurn(bc, ev.seat);   // v60 소멸 연출
    await sleep(ev.type==='summon'?250 : (ev.type==='damage'||ev.type==='heal'||ev.type==='buff'||ev.type==='death'||ev.type==='silence'||ev.type==='shieldGain'||ev.type==='haste'||ev.type==='freeze'||ev.type==='copy'||ev.type==='recall'||ev.type==='transform'||ev.type==='toDeck'||ev.type==='deckCopy'||ev.type==='bounce')?320 : 80);
  }
}

// ---------- 행동 실행 ----------
async function perform(seat, action){
  const r=Host.submit(seat, action);
  if(!r.ok) return r;
  await playEvents(r.events);
  view=Host.view(MY);
  render();
  return r;
}
async function playerAction(action){
  if(ui.busy) return;
  ui.busy=true; ui.selected=null; ui.pending=null; stopArrow();
  if(game && game.mode==='pvp'){ await PvpClient.act(action); render(); return; }   // 유저 대전: 판은 서버가 진행한다 → 행동만 보내고, 결과·연출은 서버 메시지로 받는다
  const r=await perform(MY, action);
  if(!r.ok){ logLine('⚠ '+r.error); ui.busy=false; render(); return; }
  if(!Host.state.over && Host.state.turn===OPP) await runOpponentTurn();
  if(Host.state.over) finishGame();
  ui.busy=false; render();
}
// 게임 종료 시 정확히 한 번만 정산
function finishGame(){
  if(!game || game.settled) return;
  game.settled=true;
  const winner=Host.state.winner;
  if(game.mode==='adventure'){                         // v114 모험: 이기면 등급별 골드 보상 (첫 클리어 전액, 재도전은 일부)
    if(winner===MY){
      if(game.devTest){ logLine('시험 대전 종료: 승리 (기록·보상 없음)'); }
      else {
        const first=!AdventureBook.has(game.boss.id), full=bossReward(game.boss), amount=first?full:Math.max(1,Math.round(full*BOSS_REPEAT_RATIO));
        const sv=Economy.get(); Economy.set({...sv, gold:sv.gold+amount}); updateWallet();
        AdventureBook.clear(game.boss.id);
        game.advReward=`<span class="plus">+${fmt(amount)}골드</span><span class="sub2">${first?'첫 클리어 보상':'재도전 보상 (첫 클리어 보상의 '+Math.round(BOSS_REPEAT_RATIO*100)+'%)'}</span><span class="sub2">보유 골드 ${fmt(Economy.get().gold)}</span>`;
        logLine(`보스 격파! ${first?'첫 클리어':'재도전'} 보상 +${fmt(amount)}골드`);
      }
    } else logLine(winner===null?'무승부':'패배... 다시 도전해 보세요.');
    return;
  }
  if(game.mode==='test'){ logLine(winner===null?'테스트 종료: 무승부':winner===MY?'테스트 종료: 승리 (골드 변동 없음)':'테스트 종료: 패배 (골드 변동 없음)'); return; }   // v54
  const r=Economy.settle(Economy.get(), {difficulty:game.key, mode:game.mode, bet:game.bet, payoutPct:game.tier, pool:game.pool, winner});
  Economy.set(r.save);
  game.result=r.summary;
  updateWallet();
  const m=r.summary;
  if(m.kind==='easy') logLine(m.win?`보상 +${m.payout}골드`:'보상 없음');
  else if(m.kind==='bet') logLine(m.win?`배팅 성공! (${m.payoutPct}%) +${fmt(m.net)}골드`:m.draw?'무승부: 배팅 금액 환불':`배팅 실패... -${fmt(m.bet)}골드`);
  else logLine(m.win?`보상 +${fmt(m.payout)}골드 (풀 ${m.poolFrom}→${m.poolTo})`:m.draw?'무승부: 변동 없음':`풀 ${m.poolFrom}→${m.poolTo}`);
}
function rewardHTML(){
  if(game && game.mode==='pvp') return game.pvpHTML||'';
  if(game && game.mode==='adventure') return game.advReward||'';
  const m=game && game.result; if(!m) return '';
  const sign=n=>n>0?`<span class="plus">+${fmt(n)}골드</span>`:n<0?`<span class="minus">${fmt(n)}골드</span>`:'<span>±0골드</span>';
  let top, sub='';
  if(m.kind==='easy') top=m.win?sign(m.payout):'<span>획득 골드 없음</span>';
  else if(m.kind==='bet'){ top=sign(m.net); sub=m.win?`배팅 ${fmt(m.bet)}골드 × 배당 ${m.payoutPct}% → ${fmt(m.payout)}골드 반환`:m.draw?'무승부로 배팅 금액이 환불되었습니다':`배팅 ${fmt(m.bet)}골드를 잃었습니다`; }
  else { top=m.win?sign(m.payout):'<span>획득 골드 없음</span>'; sub=m.draw?'':`오늘의 보상 풀 ${m.poolFrom} → ${m.poolTo}`; }
  return `${top}<span class="sub2">${sub}</span><span class="sub2">보유 골드 ${fmt(Economy.get().gold)}</span>`;
}
async function runOpponentTurn(){
  while(!Host.state.over && Host.state.turn===OPP){
    await sleep(450);
    let act=Bot.decide(Host.view(OPP));
    let r=await perform(OPP, act);
    if(!r.ok){ console.error('봇이 불법 행동 시도:', act, r.error); act={type:'END_TURN'}; r=await perform(OPP, act); }
    if(act.type==='END_TURN') break;
  }
}

// ---------- 입력 → 행동 ----------
function playCard(c){
  if(ui.busy || view.turn!==MY || view.over) return;
  if(view.pending){ logLine('먼저 선택을 마쳐야 합니다.'); return; }
  const entries=view.legal.filter(a=>a.type==='PLAY_CARD' && a.cardId===c.id);
  if(!entries.length){
    logLine(c.lifeCost ? (view.me.hp<=c.cost ? '체력이 부족합니다.' : '지금은 낼 수 없는 카드입니다.') : c.cost>view.me.mana ? '마나가 부족합니다.' : c.type==='spell' ? '이 주문을 쓸 대상이 없습니다.' : view.me.board.length>=CONFIG.MAX_BOARD ? '전장이 가득 찼습니다.' : '지금은 낼 수 없는 카드입니다.');
    return;
  }
  ui.selected=null; stopArrow();
  if(entries.length===1 && !entries[0].target){ playerAction(entries[0]); return; }   // 대상이 없는 카드만 바로 낸다. 대상이 있으면 (후보가 하나뿐이어도) 직접 지정
  ui.pending={cardId:c.id, entries};
  logLine('대상을 선택하세요.');
  render();
}
function isPendingTarget(t){ return !!ui.pending && ui.pending.entries.some(a=>tkey(a.target)===tkey(t)); }
function resolvePending(t){
  if(!isPendingTarget(t)) return;
  playerAction(ui.pending.entries.find(a=>tkey(a.target)===tkey(t)));
}
function cancelPending(){ ui.pending=null; render(); }
document.addEventListener('click', e=>{
  if(!ui.pending) return;
  if(e.target.closest && (e.target.closest('.card')||e.target.closest('.hero'))) return;
  ui.pending=null; render();
}, true);

function selectMinion(m, canAttack){
  if(ui.busy) return;
  if(!canAttack){ if(m.frozen && view.turn===MY) logLine('얼어 있어 이번 턴에는 공격할 수 없습니다.'); return; }
  if(ui.selected===m.id){ ui.selected=null; stopArrow(); render(); return; }
  ui.selected=m.id; render();
  const el=zoneEl(MY).querySelector(`.card[data-id="${m.id}"]`);
  if(el) startArrow(el);
}
function findAtk(sel, t){     // v80: sel 이 'hero' 면 영웅 공격(HERO_ATTACK), 아니면 하수인 공격
  return view.legal.find(x=>(sel==='hero' ? x.type==='HERO_ATTACK' : (x.type==='ATTACK' && x.attackerId===sel)) && tkey(x.target)===tkey(t));
}
function selectHero(){
  if(ui.busy) return;
  if(ui.selected==='hero'){ ui.selected=null; stopArrow(); render(); return; }
  ui.selected='hero'; render();
  startArrow($('playerHero'));
}
function attackTarget(t){
  if(ui.busy || ui.selected===null) return;
  const a=findAtk(ui.selected, t);
  if(!a){ logLine(view.opp.board.some(m=>m.taunt) ? '상대 도발 하수인을 먼저 공격해야 합니다.' : '공격할 수 없습니다.'); return; }
  playerAction(a);
}
$('endTurnBtn').onclick=()=>{ if(!ui.busy && view.turn===MY && !view.over && !ui.pending) playerAction({type:'END_TURN'}); };

// 항복: 실수 방지를 위해 두 번 눌러야 한다 (첫 클릭 → 3초간 "정말 항복?" → 한 번 더 누르면 항복)
let surrenderTimer=null;
function resetSurrenderBtn(){
  clearTimeout(surrenderTimer); surrenderTimer=null;
  const b=$('surrenderBtn'); b.textContent='항복'; b.classList.remove('armed');
}
$('surrenderBtn').onclick=()=>{
  if(ui.busy || !view || view.over) return;
  if(!surrenderTimer){
    const b=$('surrenderBtn');
    b.textContent = game && game.mode==='bet' ? `정말 항복? (−${fmt(game.bet)}G)` : '정말 항복?';
    b.classList.add('armed');
    surrenderTimer=setTimeout(resetSurrenderBtn, 3000);
    return;
  }
  resetSurrenderBtn();
  playerAction({type:'SURRENDER'});
};

// ---------- 조준 화살표 ----------
function outsideCancel(e){
  if(e.target.closest && (e.target.closest('.card')||e.target.closest('#aiHero')||e.target.closest('#playerHero'))) return;
  ui.selected=null; stopArrow(); render();
}
function startArrow(attackerEl){
  $('arrowSvg').style.display='block';
  document.addEventListener('mousemove', onArrowMove);
  document.addEventListener('touchmove', onArrowTouchMove, {passive:false});
  document.addEventListener('click', outsideCancel, true);
  const r=attackerEl.getBoundingClientRect();
  drawArrow(r.left+r.width/2, r.top, r.left+r.width/2, r.top);
}
function stopArrow(){
  $('arrowSvg').style.display='none';
  document.removeEventListener('mousemove', onArrowMove);
  document.removeEventListener('touchmove', onArrowTouchMove);
  document.removeEventListener('click', outsideCancel, true);
}
function onArrowMove(e){ moveArrowTip(e.clientX, e.clientY); }
function onArrowTouchMove(e){ if(e.touches[0]){ moveArrowTip(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }
function moveArrowTip(x,y){
  if(ui.selected===null) return;
  const el=ui.selected==='hero' ? $('playerHero') : zoneEl(MY).querySelector(`.card[data-id="${ui.selected}"]`); if(!el) return;
  const r=el.getBoundingClientRect();
  drawArrow(r.left+r.width/2, r.top, x, y);
}
function drawArrow(x1,y1,x2,y2){
  const line=$('arrowLine');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
}

// ---------- 렌더 (view 만 읽는다) ----------
// 사용자가 제공한 스크린샷에서 추출한 하수인 이미지를 로컬 파일로 사용합니다. 인터넷 연결이 필요 없습니다.
const CARD_ART = {
  "피의 기록관 말라코르": "images/art_malakor.jpg",
  "거머리 어미 발토라": "images/art_valtora.jpg",
  "피의 소용돌이": "images/art_vortex.jpg",
  "시초자": "images/art_originator.jpg",
  "전장의 강령술사": "images/art_necro.jpg",
  "소리치는 요들러": "images/art_yodler.jpg",
  "악성 공포물": "images/art_horror.jpg",
  "어둠가시 바느질꾼": "images/art_seamster.jpg",
  "시체 폭발": "images/art_corpseblast.jpg",
  "불어오른 거머리": "images/token_leech.jpg",   // v95: 피의 역병·흉측한 허물이 소환하는 0/2 토큰
  "흉측한 허물": "images/minion_01.jpg",
  "혈기술사": "images/card_85.png",
  "마우와 파우": "images/card_86.png",
  "그훈": "images/card_87.png",
  "분노의 여사제": "images/card_88.png",
  "신화의 공포": "images/card_89.png",
  "타락심장 심문관": "images/card_90_0.png",
  "고대의 공허 사냥개": "images/card_90_1.png",
  "분열하는 점액": "images/card_i2_98.png",
  "대마법학자 롬메스": "images/card_0.png",
  "일식": "images/card_1.jpg",
  "고대의 축복": "images/card_2.jpg",
  "숲의 지원군": "images/card_3.jpg",
  "금단의 과일": "images/card_4.jpg",
  "번개 개화": "images/card_5.jpg",
  "생물학 프로젝트": "images/card_6.jpg",
  "대지의 비늘": "images/card_9.jpg",
  "급속 성장": "images/card_10.jpg",
  "등산용 간식": "images/card_11.jpg",
  "새로운 경지": "images/card_13.jpg",
  "숲의 영혼": "images/card_14.jpg",
  "야생의 포효": "images/card_15.jpg",
  "휘둘러치기": "images/card_16.jpg",
  "줄이기": "images/card_17.jpg",
  "흉포한 울음소리": "images/card_18.jpg",
  "대지의 수호": "images/card_19.jpg",
  "육성": "images/card_20.jpg",
  "딱정벌레술": "images/card_21.jpg",
  "숨겨진 오아시스": "images/card_22.jpg",
  "영원의 불화살": "images/card_25.jpg",
  "아달의 수호자": "images/card_26.jpg",
  "시간대 수선": "images/card_27.jpg",
  "가시가 돋친 탈것": "images/card_29.jpg",
  "분파": "images/card_30.jpg",
  "저지해라!": "images/card_31.jpg",
  "아마라의 이야기": "images/card_32.jpg",
  "데자뷔": "images/card_33.jpg",
  "번개 폭풍": "images/card_34.jpg",
  "뒤틀린 황천": "images/card_35.jpg",
  "일거리가 있다던데": "images/card_36.jpg",
  "물 공급지": "images/card_37.jpg",
  "적자생존": "images/card_39.jpg",
  "야생의 선물": "images/card_40.jpg",
  "궁극의 역병": "images/card_41.jpg",
  "퍼져나가는 역병": "images/card_42.jpg",
  "톨비르 대적": "images/card_43.jpg",
  "되감기": "images/card_45.jpg",
  "극한 반복": "images/card_46.jpg",
  "박학다식": "images/card_47.jpg",
  "마나 흡수": "images/card_48.jpg",
  "열광의 덱": "images/card_49.jpg",
  "점화": "images/card_50.jpg",
  "얼음 회오리": "images/card_51.jpg",
  "초신성": "images/card_52.jpg",
  "은하계 투영 구슬": "images/card_53.jpg",
  "왕의 축복": "images/card_54.jpg",
  "망자 되살리기": "images/card_55.jpg",
  "방부 의식": "images/card_56.jpg",
  "유령 출몰": "images/card_57.jpg",
  "빛폭탄": "images/card_58.jpg",
  "영혼의 절규": "images/card_59.jpg",
  "패거리": "images/card_60.jpg",
  "소멸": "images/card_61.jpg",
  "파괴의 정기": "images/card_62.jpg",
  "선조의 부름": "images/card_63.jpg",
  "용의자 줄 세우기": "images/card_64.jpg",
  "방패 올리기": "images/card_65.jpg",
  "태양샘": "images/card_66.jpg",
  "흡혈": "images/card_82.jpg",
  "피의 역병": "images/card_83.jpg",
  "공기 누출": "images/card_84.jpg",
  "교도소 마나스톰": "images/card_67.png",
  "대마법사 안토니다스": "images/card_68.png",
  "속임수 토템": "images/card_69.png",
  "대마법사 바르고스": "images/card_75.png",
  "로데브": "images/card_76.png",
  "원한 맺힌 소환사": "images/card_77.png",
  "가젯잔 경매인": "images/card_78.png",
  "비전 거인": "images/card_79.png",
  "노움 쩝쩝이": "images/card_80.png",
  "별 관측자": "images/card_91.png",
  "지저왕": "images/card_92.png",
  "지진발": "images/card_93.png",
  "하드로녹스": "images/card_94.png",
  "아비아나": "images/card_95.png",
  "티란투스": "images/card_96.png",
  "잊힌 왕 쿤": "images/card_97.png",
  "방패병": "images/card_104.png",
  "키틴질 껍질": "images/card_12_0.jpg",
  "퇴비 만들기": "images/card_12_1.jpg",
  "요그사론": "images/card_i3_0.png",
  "대지 정령": "images/card_i3_1.png",
  "떠돌이 치유사": "images/card_i3_2.png",
  "매의 눈 궁수": "images/card_i3_4.png",
  "탈란지의 최후의 저항": "images/card_i3_5.jpg",
  "엄폐": "images/card_i3_6.jpg",
  "혼돈의 주문서": "images/card_i3_7.jpg",
  "철벽 소집": "images/card_i3_8.jpg",
  "치유의 빛": "images/card_i3_9.jpg",
  "사냥개 떼": "images/card_i3_10.jpg",
  "냉혹한 겨울": "images/card_i3_11.jpg",
  "눈보라": "images/card_i3_12.jpg",
  "매서운 한파": "images/card_i3_13.jpg",
  "화염구": "images/card_i3_14.jpg",
  "첫 번째 불꽃": "images/card_i3_15.jpg",
  "불꽃 화살": "images/card_i3_16.jpg",
  "비전 수호자": "images/card_i3_17.jpg",
  "주문술사의 흐름": "images/card_i3_18.jpg",
  "주머니 차원": "images/card_i3_19.jpg",
  "신비술사의 고서": "images/card_i3_20.jpg",
  "변이": "images/card_i3_21.jpg",
  "복제": "images/card_i3_22.jpg",
  "지식의 서": "images/card_i3_23.jpg",
  "들쥐": "images/card_i2_101.png",
  "은빛 신병": "images/card_i2_99.png",
  "책벌레": "images/card_i2_100.png",
  "날쌘 척후병": "images/card_i2_103.png",
  "성소의 수습사제": "images/card_i2_105.png",
  "시간의 마법사": "images/art_time_mage.jpg",
  "벼락 마법사": "images/art_lightning_mage.jpg",
  "늙은 사자": "images/art_old_lion.jpg",
  "불사조": "images/art_phoenix.jpg",
  "빛의 수호자": "images/art_light_guardian.jpg",
  "용병대장": "images/art_mercenary_captain.jpg",
  "돌 골렘": "images/art_stone_golem.jpg",
  "강철 파수대장": "images/art_steel_sentinel.jpg",
  "수정 골렘": "images/art_crystal_golem.jpg",
  "부족의 주술사": "images/art_tribal_shaman.jpg",
  "화염 정령": "images/art_fire_spirit.jpg",
  "숲 늑대": "images/art_forest_wolf.jpg",
  "빛나는 파수병": "images/art_radiant_sentry.jpg",
  "훈련 교관": "images/art_drill_instructor.jpg",
  "약초꾼": "images/art_herbalist.jpg",
  "견습 검사": "images/art_apprentice_swordsman.jpg",
  "돌담 견습병": "images/art_stonewall_apprentice.jpg",
  "고대의 수호룡": "images/art_ancient_guardian_dragon.jpg",
  "신비한 양초맨": "images/art_candle_kobold.jpg",
  "명암의 사도": "images/art_light_shadow_apostle.jpg",
  "유물 수집가": "images/art_relic_collector.jpg",
  "회귀의 사서": "images/art_recurrence_librarian.jpg",
  "주문 직조사": "images/art_spell_weaver.jpg",
  "서리 거인": "images/art_frost_giant.jpg",
  "고대 용": "images/art_ancient_dragon.jpg",
  "심판관": "images/art_judge.jpg",
  "폭풍 부르는 자": "images/art_storm_caller.jpg",
  "침묵": "images/spell_silence.jpg",
  "공중활강": "images/spell_glider_swarm.jpg",
  "대폭발": "images/spell_big_explosion.jpg",
  "불의 비": "images/spell_fire_rain.jpg",
  "불꽃 점괘": "images/spell_flame_omen.jpg",
  "냉기 돌풍": "images/spell_frost_gust.jpg",
  "처형": "images/spell_execute.jpg",
  "대마법 보호막": "images/spell_antimagic_shell.jpg",
  "덱 탐색": "images/spell_deck_search.jpg",
  "피의 서약": "images/spell_blood_pact.jpg",
  "회수": "images/spell_recall.jpg",
  "강화": "images/spell_empower.jpg",
  "서리": "images/spell_frost.jpg",
  "급습": "images/spell_ambush.jpg",
  "번개": "images/spell_lightning.jpg",
  "주문 발견": "images/spell_spell_discover.jpg",
  "수호의 장벽": "images/spell_guardian_barrier.jpg",
  "뱀사육사": "images/art113_002.png",
  "공허의 영혼": "images/art113_003.png",
  "카인 선퓨리": "images/art113_004.png",
  "강철나무 골렘": "images/art113_005.png",
  "여름의 평화수호자": "images/art113_006.png",
  "늘푸른 수사슴": "images/art113_007.png",
  "재생의 드루이드": "images/art113_008.png",
  "토이란투스": "images/art113_009.png",
  "날개 달린 수호자": "images/art113_010.png",
  "실탄 장전": "images/art113_011.png",
  "성게 가시": "images/art113_012.png",
  "사스퀙": "images/art113_014.png",
  "골드린": "images/art113_015L.png",
  "왕 크루쉬": "images/art113_015R.png",
  "밴조사우루스": "images/art113_016L.png",
  "에메리스": "images/art113_016R.png",
  "불꽃꼬리 전사": "images/art113_017.png",
  "주문사수": "images/art113_018.png",
  "깊은물 기원사": "images/art113_019.png",
  "바르덴 던그래스프": "images/art113_020.png",
  "요그사론의 종복": "images/art113_021.png",
  "진눈깨비 스케이터": "images/art113_022.png",
  "시프": "images/art113_024.png",
  "회색 현자 앵무새": "images/art113_025.png",
  "대규모 변이": "images/art113_026.png",
  "용소환사 알라나": "images/art113_027.png",
  "화염용": "images/art113_028.png",
  "불굴의 토레스": "images/art113_029.png",
  "태양지기 타림": "images/art113_030.png",
  "성기사 에드릭": "images/art113_031.png",
  "안녕극단": "images/art113_032.png",
  "정신의 창조술사": "images/art113_033.png",
  "세데크 장막직공": "images/art113_034.png",
  "생각 훔치기": "images/art113_035.png",
  "영혼 채찍": "images/art113_036.png",
  "정신 분열": "images/art113_037.png",
  "천상의 정신": "images/art113_038.png",
  "대주교 베네딕투스": "images/art113_039.png",
  "암흑의 정수": "images/art113_040.png",
  "그훈의 피": "images/art113_041.png",
  "흑요석 석상": "images/art113_042.png",
  "대규모 부활": "images/art113_043.png",
  "무덤괴수": "images/art113_044.png",
  "칼날 부채": "images/art113_045.png",
  "타르막": "images/art113_046.png",
  "얼굴 수집가": "images/art113_047.png",
  "소냐 워터댄서": "images/art113_048.png",
  "엘프 음악가": "images/art113_049.png",
  "무역왕 갤리윅스": "images/art113_050.png",
  "전력 질주": "images/art113_051.png",
  "환영의 물약": "images/art113_052.png",
  "오메가 조립 시설": "images/art113_053.png",
  "겁에 질린 조합원": "images/art113_054.png",
  "용의 포효": "images/art113_055.png",
  "대장군 분": "images/art113_056.png",
  "앙심": "images/art113_058.png",
  "다리우스 크롤리": "images/art113_059.png",
  "대지조각가 이프": "images/art113_060.png",
  "토르톨라": "images/art113_061.png",
  "문제아": "images/art113_062.png",
  "두억시니": "images/art113_063.png",
  "해일": "images/art113_064.png",
  "걸어 다니는 샘": "images/art113_065.png",
  "눈사태 수호자": "images/art113_066.png",
  "퇴화": "images/art113_067.png",
  "불안정한 진화": "images/art113_068.png",
  "깊은무쇠 트로그": "images/art113_069.png",
  "교단 수련사": "images/art113_070.png",
  "보석 박힌 딱정벌레": "images/art113_071.png",
  "비겁한 밀고자": "images/art113_072.png",
  "안녕로봇": "images/art113_073.png",
  "데스윙": "images/art113_074.png",
  "광염의 피락": "images/art113_075.png",
  "해방된 분노 이샤라즈": "images/art113_076.png",
  "허기진 포식자": "images/art113_077.png",
  "부상당한 크발디르": "images/art113_078.png",
  "부정한 알": "images/art113_079.png",
  "불안정한 프로토타입": "images/art113_080.png",
  "검 제작의 대가": "images/art113_081.png",
  "공작 켈레세스": "images/art113_082.png",
  "곰팡이술사": "images/art113_083.png",
  "깔깔대는 발명가": "images/art113_084.png",
  "기사대장": "images/art113_086.png",
  "누더기골렘": "images/art113_087.png",
  "공격대장": "images/art113_088.png",
  "공중급수체": "images/art113_089.png",
  "나무정령": "images/art113_090.png",
  "지하군주": "images/art113_091.png",
  "마력 깃든 까마귀": "images/art113_092.png",
  "부화장 도우미": "images/art113_093.png",
  "비명익룡 알": "images/art113_094.png",
  "엘룬의 예언자": "images/art113_095.png",
  "오늘의 월척": "images/art113_096.png",
  "브롤 베어맨틀": "images/art113_097.png",
  "그물거미": "images/art113_098.png",
  "여명회 파수병": "images/art113_099.png",
  "채광 사상자": "images/art113_100.png",
  "평등": "images/art113_101.png",
  "대사제 데칼": "images/art113_102.png",
  "병력 소집": "images/art113_103.png",
  "신의 은총": "images/art113_104.png",
  "거품로봇": "images/art113_105.png",
  "창심장 파수병": "images/art113_106.png",
  "부두 토템": "images/art113_107.png",
  "거대한 토템 아이스오르": "images/art113_108.png",
  "불꽃의 토템": "images/art113_109.png",
  "물 공급 토템": "images/art113_110.png",
  "스테레오 토템": "images/art113_111.png",
  "죄악석 토템": "images/art113_112.png",
  "토템 골렘": "images/art113_113.png",
  "돌장인": "images/art113_114.png",
  "칼바람 폭풍소환사": "images/art113_115.png",
  "바람의 군주 알아키르": "images/art113_116.png",
  "왕궁정원사": "images/art113_117.png",
  "독사 떼": "images/art113_118.png",
  "치명적인 독사": "images/art113_119.png",
  "피어오르는 연꽃": "images/art113_120.png",
  "양": "images/art113_121.png",
  "질주 사냥개": "images/art113_122.png",
  "딱정벌레": "images/art113_123.png",
  "새끼 비명익룡": "images/art113_124.png",
  "활강병": "images/art113_125.png",
  "이름 없는 하수인": "images/art113_126.png",
  "보초병": "images/art113_127.png",
  "병사": "images/art113_128.png",
  "되살아난 보병": "images/art113_129.png",
  "지렁이": "images/art113_130.png",
  "언데드 닭": "images/art113_131.png",
  "불량배": "images/art113_132.png",
  "언데드": "images/art113_133.png",
  "용": "images/art113_134.png",
  "기계": "images/art113_135.png",
  "다 자란 비명익룡": "images/art113_136.png",
  "취약한 구울": "images/art113_137.png",
  "구울": "images/art113_138.png",
  "스테고돈": "images/art113_139.png",
  "비전 골렘": "images/art113_140.png",
  "은빛 성기사단 신병": "images/art113_141.png",
  "고대정령": "images/art113_142.png"
};
function cardEl(c, opts={}){
  const el=document.createElement('div');
  el.className='card'+(opts.extra?(' '+opts.extra):'');
  el.dataset.id=c.id;
  if(c.lifeCost) el.classList.add('lifecost');
  if(c.stealth) el.classList.add('stealthed');
  let tags='';
  if(c.taunt) tags+='<span class="tag taunt">도발</span>';
  if(c.windfury) tags+='<span class="tag" style="background:#2a5a4a;color:#c8ffe8">질풍</span>';
  if(c.echo) tags+='<span class="tag" style="background:#3a3a6a;color:#d8d8ff">잔상</span>';
  if(c.shield) tags+='<span class="tag shield">보호막</span>';
  if(c.charge) tags+='<span class="tag charge">돌진</span>';
  if(c.rush) tags+='<span class="tag rush">속공</span>';
  if(c.revive) tags+='<span class="tag revive">환생</span>';
  if(c.elusive) tags+='<span class="tag elusive">모면</span>';
  if(c.spellburst) tags+='<span class="tag" style="background:#6a3a14;color:#ffd9a0">주문폭주</span>';
  if(c.lifesteal) tags+='<span class="tag lifesteal">생명력 흡수</span>';
  if(c.poison) tags+='<span class="tag poison">독성</span>';
  if(c.deathSummonCost) tags+='<span class="tag revive">죽음의 메아리</span>'; 
  if(c.deathCopy||c.deathGain) tags+='<span class="tag revive">죽음의 메아리</span>';
  if(c.deathDraw||c.deathSummon||c.deathStego||c.deathArmor||c.deathBuffAll||c.deathGrave||c.eggChicken||c.deathProto||c.deathAdjBuff||c.deathAoe||c.deathPtero||c.deathBeast||c.deathGhoul) tags+='<span class="tag revive">죽음의 메아리</span>';
  if(c.mini) tags+='<span class="tag" style="background:#2a4a5c;color:#c8ecff">미니미</span>';
  if(c.isMini) tags+='<span class="tag" style="background:#2a4a5c;color:#c8ecff">미니</span>';
  if(c.stealth) tags+='<span class="tag" style="background:#2c2c3c;color:#c8c8e8">은신</span>';
  if(c.frozen) tags+='<span class="tag frozen">빙결</span>';
  if(c.infect) tags+='<span class="tag" style="background:#5a1a3a;color:#ffb8d4">감염</span>';
  const eff=effectText(c);
  if(c.type==='spell'){
    el.classList.add('spell');
    if(c.fatigue) el.classList.add('fatigue');
    el.innerHTML=`${c.fatigue?'':`<div class="cost">${c.cost}</div>`}<div class="cname">${c.name}</div>${CARD_ART[c.name]?`<div class="card-art"><img src="${CARD_ART[c.name]}" alt="${c.name}" loading="lazy"></div>`:''}<div class="effect">${eff}</div><div class="stats spelltype"><span>✦ ${c.fatigue?'탈진':((c.school&&c.school.length?c.school.join('·'):'')+'주문')} ✦</span>${runeOf(c).length?`<small class="rn">${runeOf(c).join('·')} 룬</small>`:''}</div>`;
  } else {
    el.innerHTML=`<div class="cost">${c.cost}</div><div class="cname">${c.name}</div>${CARD_ART[c.name]?`<div class="card-art"><img src="${CARD_ART[c.name]}" alt="${c.name}" loading="lazy"></div>`:''}<div class="effect">${tags}${tags&&eff?'<br>':''}${eff}</div><div class="stats"><span class="atk">${c.atk}</span>${(c.tribe||runeOf(c).length)?`<span class="race">${c.tribe?c.tribe.replace(/ \/ /g,'·'):''}${runeOf(c).length?`<small class="rn">${runeOf(c).join('·')} 룬</small>`:''}</span>`:''}<span class="life">${c.hp}</span></div>`;
  }
  if(opts.onClick) el.onclick=opts.onClick;
  return el;
}

// 마나 표시 (내 쪽·상대 쪽 공통). '매 턴 마나 +N' 치트가 있으면 그 추가분까지 총량에 포함한다.
function renderMana(textId, crystalsId, p){
  const total=Math.max(1, p.maxMana+((p.mods&&p.mods.manaBonus)||0));
  $(textId).textContent=`마나 ${p.mana} / ${total}`+(p.locked?` · 과부하 ${p.locked}`:'')+(p.overloadNext?` · 다음 턴 과부하 ${p.overloadNext}`:'')+(p.nextMana?` · 다음 턴 마나 +${p.nextMana}`:'')+(p.ascendNext?` · 다음 턴 최대 마나 +${p.ascendNext}`:'')+(p.spellTax?` · 주문 비용 +${p.spellTax}`:'')+(p.taxNext?` · 다음 턴 주문 비용 +${p.taxNext}`:'');
  const cz=$(crystalsId); cz.innerHTML='';
  for(let i=0;i<Math.max(total, p.mana);i++){     // 동전 등으로 최대치를 넘긴 마나도 수정으로 보여준다
    const d=document.createElement('div'); d.className='crystal'+(i<p.mana?'':' empty'); cz.appendChild(d);
  }
}
function renderOppHand(n){
  const box=$('aiHand'); box.innerHTML='';
  for(let i=0;i<n;i++){ const b=document.createElement('div'); b.className='card-back'; box.appendChild(b); }   // 내용은 알 수 없으므로 뒷면만
}
function renderCheats(){
  const box=$('aiCheats'); box.innerHTML='';
  hideTip();   // 칩을 다시 만들면 마우스 아웃 이벤트가 안 오므로 남아 있는 툴팁을 치운다
  ((game&&game.cheats)||[]).forEach(c=>{ const el=document.createElement('span'); el.className='chip'; el.textContent=(c.icon?c.icon+' ':'')+c.name; el.dataset.tip=c.desc; el.tabIndex=0; box.appendChild(el); });
}
function render(){
  const v=view, me=v.me, op=v.opp;
  if(v.pending && v.pending.seat===MY && v.pending.kind==='target' && !ui.busy && !ui.pending && !v.over)      // v28 일식의 두 번째 대상: 기존 대상 선택 모드를 그대로 쓴다
    ui.pending={cardId:-1, entries:v.legal.filter(a=>a.type==='TARGET')};
  renderCheats();
  { const dm=$('discoverModal'), pd=v.pending;                                      // 발견: 내가 고를 차례면 3장 선택 창을 띄운다
    if(pd && pd.seat===MY && pd.options){
      const fruit=pd.kind==='fruit', choice=pd.kind==='choice', pocket=pd.kind==='pocketDimension'; $('discoverTitle').textContent=fruit?'금단의 과일 — 하나를 고르세요':choice?'선택 — 둘 중 하나를 고르세요':pocket?'주머니 차원 — 주문 발견':'발견 — 한 장을 고르세요'; $('discoverNote').textContent=fruit?'마나를 모두 소모했습니다. 공격력을 고르면 이어서 아군 하수인 1기를 선택합니다.':choice?'원하는 효과 하나를 선택합니다.':pocket?`선택한 주문의 비용이 4 감소합니다. 이미 발견한 주문이 다시 나올 때까지 반복합니다. (현재 ${(pd.seen||[]).length}장 선택함)`:'고른 카드의 비용이 줄어든 채로 손패에 들어옵니다.';
      const g=$('discoverGrid'); g.innerHTML='';
      pd.options.forEach((c,i)=>{ const el=cardEl(c,{}); el.onclick=()=>{ dm.classList.remove('show'); playerAction({type:'CHOOSE', index:i}); }; g.appendChild(el); });
      if(!dm.classList.contains('show')) fxSprite('discover',innerWidth/2,innerHeight/2,Math.min(innerWidth*.7,460),{dur:1100,z:70});   // v89
      dm.classList.add('show');
    } else dm.classList.remove('show'); }
  renderOppHand(op.handCount);
  $('playerHp').textContent=Math.max(0, me.hp);
  { const el=$('playerArmor'); el.textContent=me.armor||''; el.classList.toggle('show', me.armor>0); $('playerArmorNext').textContent=me.armorNext?`다음 턴 방어도 +${me.armorNext}`:''; }   // v37: 방어도가 있을 때만 방패 모양으로 표시
  { const el=$('playerAtk'); el.textContent=me.heroAtk||''; el.classList.toggle('show', (me.heroAtk||0)>0); el.classList.toggle('used', !!me.heroAttacked); }   // v80: 영웅 공격력은 칼 모양
  { const el=$('aiAtk'); el.textContent=op.heroAtk||''; el.classList.toggle('show', (op.heroAtk||0)>0); el.classList.toggle('used', !!op.heroAttacked); }
  $('aiHp').textContent=Math.max(0, op.hp);
  { const el=$('playerCorpse'); el.textContent=me.corpses||''; el.classList.toggle('show', (me.corpses||0)>0); }   // v76
  { const el=$('aiCorpse'); el.textContent=op.corpses||''; el.classList.toggle('show', (op.corpses||0)>0); }
  { const el=$('aiArmor'); el.textContent=op.armor||''; el.classList.toggle('show', op.armor>0); $('aiArmorNext').textContent=op.armorNext?`다음 턴 방어도 +${op.armorNext}`:''; }
  renderMana('manaText','crystals',me);
  renderMana('aiManaText','aiCrystals',op);
  $('aiHandCnt').textContent=op.handCount; $('aiDeckCnt').textContent=op.deckCount+(op.deckCount===0?` (다음 탈진 ${op.fatigue+1})`:''); $('myDeckCnt').textContent=me.deckCount+(me.deckCount===0?` (다음 탈진 ${me.fatigue+1})`:'');

  const active = v.turn===MY && !v.over && !ui.busy;
  const legal = active ? v.legal : [];
  const pending = ui.pending;

  const hand=$('hand'); hand.innerHTML='';
  me.hand.forEach(c=>{
    const isPending = !!pending && pending.cardId===c.id;
    const playable = legal.some(a=>a.type==='PLAY_CARD' && a.cardId===c.id) && (!pending || isPending);
    const ht={kind:'hand', seat:MY, id:c.id}, isTarget=isPendingTarget(ht);      // 복제 같은 주문은 손패 카드가 대상이 된다
    const extra=(playable||isTarget?'':'unaffordable')+(isPending?' selected':'')+(isTarget?' targetable':'');
    hand.appendChild(cardEl(c, {extra, onClick:()=> isPending ? cancelPending() : isTarget ? resolvePending(ht) : playCard(c)}));
  });

  const pz=zoneEl(MY); pz.innerHTML='';
  me.board.forEach(m=>{
    const canAttack = !pending && legal.some(a=>a.type==='ATTACK' && a.attackerId===m.id);
    const t=minionT(MY, m.id), isTarget=isPendingTarget(t);
    const extra=(ui.selected===m.id?'selected':'')+(canAttack?' attackable':'')+(m.summoned&&!m.charge&&!m.rush?' sick':'')+(isTarget?' targetable':'')+(m.taunt?' taunt':'')+(m.shield?' shielded':'')+(m.frozen?' frozen':'');
    pz.appendChild(cardEl(m, {extra, onClick: pending ? ()=>resolvePending(t) : ()=>selectMinion(m, canAttack)}));
  });

  const az=zoneEl(OPP); az.innerHTML='';
  op.board.forEach(m=>{
    const t=minionT(OPP, m.id);
    const isTarget=isPendingTarget(t) || (ui.selected!==null && !!findAtk(ui.selected, t));
    const extra=(m.summoned&&!m.charge&&!m.rush?'sick':'')+(isTarget?' targetable':'')+(m.taunt?' taunt':'')+(m.shield?' shielded':'')+(m.frozen?' frozen':'');
    az.appendChild(cardEl(m, {extra, onClick: pending ? ()=>resolvePending(t) : ()=>attackTarget(t)}));
  });

  $('endTurnBtn').disabled = !active || !!pending;
  $('surrenderBtn').disabled = v.over || ui.busy;
  if(v.over || ui.busy) resetSurrenderBtn();

  const myHeroT=heroT(MY), opHeroT=heroT(OPP);
  const myHeroTarget=isPendingTarget(myHeroT);
  const opHeroTarget=isPendingTarget(opHeroT) || (ui.selected!==null && !!findAtk(ui.selected, opHeroT));
  $('playerHero').classList.toggle('targetable', myHeroTarget);
  $('aiHero').classList.toggle('targetable', opHeroTarget);
  const canHeroAtk = !pending && legal.some(a=>a.type==='HERO_ATTACK');   // v80
  $('playerHero').classList.toggle('attackable', canHeroAtk);
  $('playerHero').classList.toggle('selected', ui.selected==='hero');
  $('playerHero').onclick = myHeroTarget ? ()=>resolvePending(myHeroT) : (canHeroAtk ? ()=>selectHero() : null);
  $('aiHero').onclick = pending ? (opHeroTarget ? ()=>resolvePending(opHeroT) : null) : ()=>attackTarget(opHeroT);

  if(v.over){
    if(!$('overlay').classList.contains('show') && v.winner!==null) fxSprite(v.winner===MY?'victory':'defeat',innerWidth/2,innerHeight*.26,Math.min(innerWidth*.8,520),{dur:3400,z:300,kf:fxPop});   // v89: 승리·패배 연출
    $('overlay').classList.add('show');
    $('overlayText').textContent = (game && game.mode==='pvp') ? game.pvpTitle : v.winner===null ? '무승부' : (v.winner===MY ? '승리했습니다!' : '패배했습니다...');
    $('overlayReward').innerHTML = rewardHTML();
    $('overlayArt').innerHTML = (game && game.mode==='pvp') ? (game.pvpArt||'') : '';   // 유저 대전 결과 일러스트 (골드·보상 없음·무승부·무효)
  }
  if($('deckModal').classList.contains('show')) renderDeckModal();
}

// ---------- 내 덱 보기 ----------
// 덱 목록에서 하수인 / 주문을 나누는 제목 줄
function sectionLabel(type){
  const d=document.createElement('div');
  d.textContent = type==='spell' ? '✦ 주문' : '하수인';
  d.style.cssText='flex-basis:100%; grid-column:1/-1; width:100%; font-family:var(--font-d); color:var(--gold); font-size:1rem; padding:.2rem 0; border-bottom:1px solid rgba(201,162,39,.3);';
  return d;
}
function renderDeckModal(){
  if(!view) return;
  const rem={};
  for(const c of view.me.deckCards) rem[c.name]=(rem[c.name]||0)+1;
  const mine=countsOf((game&&game.deckNames)||defaultDeckList());      // 이번 판에 넣은 내 덱 구성
  const total=Object.values(mine).reduce((a,b)=>a+b,0);
  $('deckTitle').textContent=`내 덱 — 남은 카드 ${view.me.deckCount}장 / 전체 ${total}장`;
  const grid=$('deckGrid'); grid.innerHTML='';
  let lastType=null;
  CARD_POOL.forEach(c=>{
    const k=mine[c.name]||0; if(!k && !(rem[c.name]>0)) return;         // 덱에 넣지 않은 카드는 보여주지 않는다 (v57: 효과로 덱에 섞여 들어온 카드는 남은 장수가 있으면 표시)
    if(c.type!==lastType){ lastType=c.type; grid.appendChild(sectionLabel(c.type)); }
    const n=rem[c.name]||0;
    const el=cardEl(c, {extra:(n||!k)?'':'drawn'});
    const badge=document.createElement('div');
    badge.className='copies'; badge.textContent= n>k ? `${n}` : `${n}/${k}`;      // 구성보다 많이 섞여 들어왔으면 남은 장수만 표시
    el.appendChild(badge);
    grid.appendChild(el);
  });
}
function openDeck(){ if(!view) return; renderDeckModal(); $('deckModal').classList.add('show'); }
function closeDeck(){ $('deckModal').classList.remove('show'); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeDeck(); closeDeckEditor(); } });

// ---------- 내 덱 저장소 (서버, 내 계정에 저장 — serverstore.js) ----------
const DeckBook = {
  get(){ const raw=ServerStore.getDeck(); return (raw && !validateDeckList(raw) && !validateDeckOwned(raw, ServerStore.collection)) ? raw.slice() : defaultDeckList(); },   // 없거나 규칙·보유 카드에 안 맞으면 추천 덱
  set(list){ if(validateDeckList(list) || validateDeckOwned(list, ServerStore.collection)) return false; ServerStore.setDeck(list.slice()); return true; },
};

// ---------- 덱 편집 ----------
const ed={counts:{}};
function countsOf(list){ const c={}; list.forEach(n=>c[n]=(c[n]||0)+1); return c; }
function listOf(counts){ const out=[]; CARD_POOL.forEach(c=>{ for(let k=0;k<(counts[c.name]||0);k++) out.push(c.name); }); return out; }
const edTotal = () => Object.values(ed.counts).reduce((a,b)=>a+b,0);
const TEST_COPIES=10, TEST_MAX_DECK=60;                 // v54 테스트 덱: 같은 카드 최대 10장, 전체 최대 60장, 최소 1장
// 한 카드를 덱에 넣을 수 있는 최대 장수. 일반 덱은 "가진 장수"까지만 (4단계), 테스트·보스 덱은 전체 카드풀을 그대로 쓴다.
const edOwnedMode = () => !ed.test && !ed.boss;
const edCap = name => ed.test ? TEST_COPIES : edOwnedMode() ? Math.min(CONFIG.COPIES, ServerStore.owned(name)) : CONFIG.COPIES;
function edAdjust(name, d){
  const n=(ed.counts[name]||0)+d;
  if(n<0 || n>edCap(name)) return;
  if(d>0 && edTotal()>=(ed.test?TEST_MAX_DECK:CONFIG.DECK_SIZE)) return;
  ed.counts[name]=n; renderDeckEditor();
}
// 낮은 가로 화면에서는 패널 전체가 스크롤된다 → 필터를 바꾸면 카드 목록 맨 위가 보이도록 맞춘다
function edScrollTop(){
  const grid=$('edGrid'); grid.scrollTop=0;
  const panel=document.querySelector('#deckEditor .deck-panel');
  if(panel && getComputedStyle(grid).overflowY==='visible'){
    const head=panel.querySelector('.deck-head');
    panel.scrollTop=Math.min(panel.scrollTop, Math.max(0, grid.offsetTop-(head?head.offsetHeight:0)));
  }
}
// 낮은 가로 화면: 마나 곡선·필터를 접었다 펼 수 있다 (접으면 카드 목록이 넓게 보인다)
function edUpdateFilterBtn(){
  const col=$('deckEditor').classList.contains('filters-collapsed'), b=$('edFilterToggle'); if(!b) return;
  const act=(ed.tab&&ed.tab!=='all')||ed.cost!=null||ed.ownedOnly;
  b.textContent=`🔍 필터${act?' ●':''} ${col?'▾':'▴'}`;
}
$('edFilterToggle').onclick=()=>{ $('deckEditor').classList.toggle('filters-collapsed'); edUpdateFilterBtn(); };
function renderDeckEditor(){
  const total=edTotal(), size=CONFIG.DECK_SIZE, T=!!ed.test, maxCopies=T?TEST_COPIES:CONFIG.COPIES, saveOk=T?total>=1:total===size, atCap=T?total>=TEST_MAX_DECK:total>=size;
  const spellCnt=CARD_POOL.reduce((n,c)=>n+(c.type==='spell'?(ed.counts[c.name]||0):0),0);
  $('edTitle').textContent=T ? `테스트 덱 편집 — ${total}장 (주문 ${spellCnt}장)` : `덱 편집 — ${total} / ${size}장 (주문 ${spellCnt}장)`;
  $('edNote').textContent = T
    ? `테스트 전용 덱입니다 (일반 덱과 따로 저장). 1~${TEST_MAX_DECK}장, 같은 카드 최대 ${TEST_COPIES}장. 카드를 누르면 1장 추가됩니다.`
    : saveOk
      ? '저장할 수 있습니다. 카드를 누르면 1장 추가되고, +/− 버튼으로 조절할 수 있습니다. 가진 카드만 넣을 수 있어요.'
      : `정확히 ${size}장을 채워야 저장할 수 있습니다 (같은 카드는 최대 ${CONFIG.COPIES}장).`;
  const byCost={}; CARD_POOL.forEach(c=>{ byCost[c.cost]=(byCost[c.cost]||0)+(ed.counts[c.name]||0); });
  // 마나 곡선: 코스트(0~최대)별 장수를 막대그래프로. 카드를 넣고 뺄 때마다 바로 갱신된다.
  const maxCost=Math.max(...CARD_POOL.map(c=>c.cost)), peak=Math.max(1,...Object.values(byCost));
  let bars='';
  for(let k=0;k<=maxCost;k++){
    const n=byCost[k]||0;
    bars+=`<div class="cv-col${ed.cost===k?' on':''}" data-cost="${k}" title="${k}코 ${n}장 (클릭: ${k}코스트 카드만 보기)"><span class="cv-n">${n}</span><div class="cv-bar" style="height:${n?Math.max(4,Math.round(n/peak*60)):2}px"></div><span class="cv-k">${k}</span></div>`;
  }
  $('edCurve').innerHTML=`<div class="cv-title">마나 곡선 <small>(코스트별 장수 · 막대를 누르면 해당 코스트만 표시)</small></div><div class="cv-chart">${bars}</div>`;
  $('edCurve').querySelectorAll('.cv-col').forEach(el=>el.onclick=()=>{ const k=+el.dataset.cost; ed.cost=(ed.cost===k?null:k); edScrollTop(); renderDeckEditor(); });
  if(ed.boss){ $('edTitle').textContent=`보스 덱 — ${ed.bossName||''} ${total} / ${size}장 (주문 ${spellCnt}장)`; $('edNote').textContent = saveOk ? '저장할 수 있습니다. 이 덱이 보스가 쓰는 덱입니다.' : `정확히 ${size}장을 채워야 저장할 수 있습니다 (같은 카드는 최대 ${CONFIG.COPIES}장).`; }
  $('edSave').disabled=!saveOk;
  const grid=$('edGrid'), st=grid.scrollTop; grid.innerHTML='';
  // 카드 종류(주문/하수인)로 먼저 나누고, 각 종류 안에서 속성별로 묶은 뒤 코스트 오름차순 정렬
  const typeOrder=['spell','minion'];
  const schoolOrder=['비전','화염','냉기','자연','신성','암흑','지옥','혈기','부정','무속성'];
  const typeNames={spell:'✦ 주문',minion:'하수인'};
  const schoolOf=c=>(c.school&&c.school.length)?c.school[0]:'무속성';
  const tribeOrder=['야수','언데드','악마','용족','정령','해적','토템','기계','무종족'];   // v106 하수인은 종족별로 묶는다 (종족이 둘이면 첫 번째)
  const tribeOf=c=>((c.tribe||'').split('/')[0].trim())||'무종족';
  const groupOf=c=>c.type==='spell' ? schoolOf(c) : tribeOf(c);
  const groupIdx=c=>{ const o=c.type==='spell'?schoolOrder:tribeOrder, i=o.indexOf(groupOf(c)); return i<0?99:i; };
  const TABS=[['all','전체'],['minion','하수인'],['spell','주문'],['tribe:야수','야수'],['tribe:언데드','언데드'],['tribe:악마','악마'],['tribe:용족','용족'],['tribe:정령','정령'],['tribe:해적','해적'],['tribe:토템','토템'],['tribe:기계','기계'],['rune:부정','부정 룬'],['rune:냉기','냉기 룬'],['rune:혈기','혈기 룬'],['rar:일반','일반'],['rar:희귀','희귀'],['rar:특급','특급'],['rar:전설','전설']];
  const tabOk=(c,t)=> t==='all' || (t==='minion'||t==='spell' ? c.type===t : t.startsWith('tribe:') ? (c.type==='minion' && (c.tribe||'').includes(t.slice(6))) : t.startsWith('rar:') ? c.rarity===t.slice(4) : runeOf(c).includes(t.slice(5)));
  if(!ed.tab) ed.tab='all';
  $('edTabs').innerHTML=TABS.map(([k,l])=>`<button data-tab="${k}" class="${ed.tab===k?'on':''}">${l}<span class="n">${CARD_POOL.filter(c=>tabOk(c,k)).length}</span></button>`).join('');
  $('edTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{ ed.tab=b.dataset.tab; edScrollTop(); renderDeckEditor(); });
  if(edOwnedMode()){      // 4단계: 보유 카드만 보기 (일반 덱 편집에서만)
    const ob=document.createElement('button'); ob.className=ed.ownedOnly?'on':''; ob.textContent='보유 카드만'; ob.onclick=()=>{ ed.ownedOnly=!ed.ownedOnly; edScrollTop(); renderDeckEditor(); };
    $('edTabs').appendChild(ob);
  }
  // 코스트 필터: 전체 / 0~10 버튼 (탭과 함께 적용). 같은 버튼을 다시 누르면 해제.
  if(ed.cost==null) ed.cost=null;
  const costMax=Math.max(10,maxCost), costOk=c=>ed.cost==null || c.cost===ed.cost;
  const inTab=CARD_POOL.filter(c=>tabOk(c,ed.tab));
  let cb=`<span class="lbl">코스트</span><button data-cost="all" class="${ed.cost==null?'on':''}">전체<span class="n">${inTab.length}</span></button>`;
  for(let k=0;k<=costMax;k++){ const cnt=inTab.filter(c=>c.cost===k).length; cb+=`<button data-cost="${k}" class="${ed.cost===k?'on':''}${cnt?'':' empty'}">${k}<span class="n">${cnt}</span></button>`; }
  $('edCosts').innerHTML=cb;
  $('edCosts').querySelectorAll('button').forEach(b=>b.onclick=()=>{ const v=b.dataset.cost==='all'?null:+b.dataset.cost; ed.cost=(v!==null && ed.cost===v)?null:v; edScrollTop(); renderDeckEditor(); });
  const sorted=CARD_POOL.filter(c=>tabOk(c,ed.tab) && costOk(c) && !(edOwnedMode() && ed.ownedOnly && !ServerStore.owned(c.name))).sort((a,b)=>{
    const ti=typeOrder.indexOf(a.type)-typeOrder.indexOf(b.type); if(ti) return ti;
    const si=groupIdx(a)-groupIdx(b);
    return si || a.cost-b.cost || a.name.localeCompare(b.name,'ko');
  });
  if(!sorted.length){ const e=document.createElement('div'); e.className='ed-type-label'; e.textContent='해당 코스트의 카드가 없습니다'; grid.appendChild(e); }
  let lastType=null, lastSchool=null;
  sorted.forEach(c=>{
    const n=ed.counts[c.name]||0, school=groupOf(c);
    if(c.type!==lastType){
      lastType=c.type; lastSchool=null;
      const h=document.createElement('div'); h.className='ed-type-label'; h.textContent=typeNames[c.type]||c.type; grid.appendChild(h);
    }
    if(school!==lastSchool && !String(ed.tab).startsWith('rune:') && !String(ed.tab).startsWith('tribe:')){
      lastSchool=school;
      const h=document.createElement('div'); h.className='ed-school-label'; h.textContent=`◆ ${school} ${c.type==='spell'?'속성':'종족'} · 코스트순`; grid.appendChild(h);
    }
    const cap=edCap(c.name), own=ServerStore.owned(c.name), locked=edOwnedMode() && own<=0;
    const item=document.createElement('div'); item.className='ed-item'+(n?'':' zero')+(locked?' locked':'');
    item.appendChild(cardEl(c, {onClick:()=>edAdjust(c.name, +1)}));
    const rar=document.createElement('div'); rar.className='ed-rar r-'+RARITY_ORDER.indexOf(c.rarity); rar.textContent=c.rarity||''; item.appendChild(rar);
    const ctl=document.createElement('div'); ctl.className='ed-ctl';
    const minus=document.createElement('button'); minus.textContent='−'; minus.disabled=n<=0; minus.onclick=()=>edAdjust(c.name, -1);
    const plus=document.createElement('button');  plus.textContent='+';  plus.disabled=n>=cap || atCap; plus.onclick=()=>edAdjust(c.name, +1);
    const num=document.createElement('b'); num.textContent=n;
    ctl.append(minus, num, plus); item.appendChild(ctl);
    if(edOwnedMode()){ const o=document.createElement('div'); o.className='ed-own'; o.textContent=locked?'🔒 미보유':`보유 ${own}장`; item.appendChild(o); }
    grid.appendChild(item);
  });
  grid.scrollTop=st;      // 다시 그려도 스크롤 위치 유지
  edUpdateFilterBtn();
}
function updateDeckMenuDesc(){ $('deckMenuDesc').textContent=`내 덱을 직접 구성합니다 (${CONFIG.DECK_SIZE}장, 같은 카드 최대 ${CONFIG.COPIES}장)`; }
function openDeckEditor(){ ed.test=false; ed.boss=false; $('edClear').style.display='none'; ed.counts=countsOf(DeckBook.get()); renderDeckEditor(); $('deckEditor').classList.add('show'); }
function closeDeckEditor(){ $('deckEditor').classList.remove('show'); }
$('edSave').onclick=()=>{
  if(ed.boss){ if(edTotal()!==CONFIG.DECK_SIZE) return; bossDeckSaved(listOf(ed.counts)); return; }   // v114 보스 덱
  if(ed.test){ if(edTotal()<1) return; testCfg.deck=listOf(ed.counts); TestBook.set(testCfg); refreshTestUI(); closeDeckEditor(); return; }
  if(edTotal()!==CONFIG.DECK_SIZE) return; DeckBook.set(listOf(ed.counts)); closeDeckEditor(); };
$('edReset').onclick=()=>{ ed.counts=countsOf(defaultDeckList()); renderDeckEditor(); };
$('edClear').onclick=()=>{ ed.counts={}; renderDeckEditor(); };

// ---------- v54 테스트 모드: 내 체력·시작 마나·덱(별도 저장)을 정하고 중급2 AI 와 대전. 골드·보상 없음 ----------
const TestBook = (() => {
  const KEY='cardDuel.test'; let memory=null;
  const read=()=>{ try{ const t=localStorage.getItem(KEY); return t?JSON.parse(t):memory; }catch(e){ return memory; } };
  const write=o=>{ memory=o; try{ localStorage.setItem(KEY, JSON.stringify(o)); }catch(e){} };
  const okDeck=l=>Array.isArray(l) && l.length>=1 && l.length<=TEST_MAX_DECK && l.every(n=>CARD_POOL.some(c=>c.name===n)) && Object.values(countsOf(l)).every(k=>k<=TEST_COPIES);
  const num=(x,lo,hi,d)=>Number.isFinite(Number(x)) && x!=='' && x!==null ? Math.min(hi, Math.max(lo, Math.floor(Number(x)))) : d;
  return {
    clamp:{hp:x=>num(x,1,999,CONFIG.HERO_HP), mana:x=>num(x,1,10,1)},
    get(){ const raw=read()||{}; return {hp:num(raw.hp,1,999,CONFIG.HERO_HP), mana:num(raw.mana,1,10,1), deck:okDeck(raw.deck)?raw.deck.slice():DeckBook.get()}; },   // 처음엔 내 일반 덱을 복사해 시작
    set(c){ write({hp:c.hp, mana:c.mana, deck:c.deck.slice()}); },
  };
})();
let testCfg=null;
function refreshTestUI(){
  $('tHpLabel').textContent=testCfg.hp; $('tManaLabel').textContent=testCfg.mana; $('tDeckCnt').textContent=`${testCfg.deck.length}장`;
  $('tDeckDesc').textContent=`${testCfg.deck.length}장 · 일반 덱과 따로 저장됩니다 (1~${TEST_MAX_DECK}장, 같은 카드 최대 ${TEST_COPIES}장)`;
}
function readTestCfg(){
  if(!testCfg) testCfg=TestBook.get();
  testCfg.hp=TestBook.clamp.hp($('tHp').value===''?testCfg.hp:$('tHp').value);
  testCfg.mana=TestBook.clamp.mana($('tMana').value===''?testCfg.mana:$('tMana').value);
  $('tHp').value=testCfg.hp; $('tMana').value=testCfg.mana;
  TestBook.set(testCfg); return testCfg;
}
function openTestScreen(){ if(!isDev()) return; testCfg=TestBook.get(); $('tHp').value=testCfg.hp; $('tMana').value=testCfg.mana; refreshTestUI(); showScreen('test'); }
function openTestDeckEditor(){ if(!isDev()) return; readTestCfg(); refreshTestUI(); ed.test=true; ed.boss=false; $('edClear').style.display=''; ed.counts=countsOf(testCfg.deck); renderDeckEditor(); $('deckEditor').classList.add('show'); }
$('tHp').addEventListener('change', ()=>{ readTestCfg(); refreshTestUI(); });
$('tMana').addEventListener('change', ()=>{ readTestCfg(); refreshTestUI(); });
function startTest(){
  const cfg=readTestCfg(), d=DIFFICULTY.normal2;
  game={key:'test', mode:'test', bet:0, tier:0, cheats:[], pool:0, settled:false, result:null, deckNames:cfg.deck.slice()};
  Bot=d.bot;
  Host.startTest(cfg);
  view=Host.view(MY);
  ui.selected=null; ui.pending=null; ui.busy=false; stopArrow(); closeDeck(); resetSurrenderBtn();
  $('logList').innerHTML='';
  $('overlay').classList.remove('show');
  $('overlayReward').innerHTML='';
  const iFirst=Host.state.first===MY;
  $('verBadge').textContent=VERSION;
  $('diffBadge').textContent=`테스트 · ${d.label} · 체력 ${cfg.hp} · 시작 마나 ${cfg.mana} · 덱 ${cfg.deck.length}장`+(iFirst?' · 선공':' · 후공');
  $('menu').classList.add('hidden');
  updateWallet();
  logLine(`테스트 시작 (${d.label} 상대) · 내 체력 ${cfg.hp} · 시작 마나 ${cfg.mana} · 덱 ${cfg.deck.length}장. `+(iFirst?'당신이 선공입니다.':'상대가 선공입니다.'));
  beginMatch();
}
$('edClose').onclick=()=>{ closeDeckEditor(); if(ed.boss) refreshBossForm(); };

// ---------- 메뉴 / 게임 시작·종료 ----------

// ---------- v95 가이드 ----------
const GUIDE_FX=[
 {n:'도발', d:'rush', t:'상대는 도발 하수인을 먼저 공격해야 합니다. 도발이 있는 한 영웅과 다른 하수인은 공격할 수 없습니다.', demo:'<i class="me">3</i><i class="en2">1</i><i class="en">2</i><em>도발 먼저!</em>'},
 {n:'보호막', d:'shield', t:'첫 피해를 한 번 완전히 막고 사라집니다.', demo:'<i class="me">3</i><i class="en">2</i><b class="ov"></b><em>피해 0 · 보호막 파괴</em>'},
 {n:'돌진', d:'charge', t:'낸 턴에 바로 공격할 수 있습니다. 영웅도 공격 가능!', demo:'<i class="me">4</i><i class="hr">♥</i><em>소환 즉시 영웅 공격</em>'},
 {n:'속공', d:'charge', t:'낸 턴에 바로 공격하지만 하수인만 공격할 수 있습니다. 영웅은 다음 턴부터.', demo:'<i class="me">3</i><i class="en">2</i><em>하수인만 공격</em>'},
 {n:'환생', d:'revive', t:'처음 죽을 때 체력 1로 되살아납니다(1회).', demo:'<i class="me">2</i><i class="en">2</i><em>죽음 → 체력 1로 부활</em>'},
 {n:'모면', d:'spell', t:'주문·효과의 대상으로 지정할 수 없습니다. (일반 공격은 받습니다)', demo:'<i class="me">·</i><i class="en">6</i><span class="bolt">⚡</span><span class="nope">✕</span><em>주문 대상 불가</em>'},
 {n:'은신', d:'stealth', t:'상대가 공격하거나 지정할 수 없습니다. 이 하수인이 공격할 때까지 유지됩니다. (엄폐로 얻은 은신은 내 다음 턴 시작까지)', demo:'<i class="me">3</i><i class="en">2</i><em>은신 중 · 지정 불가</em>'},
 {n:'빙결', d:'frozen', t:'얼어 있는 동안 공격할 수 없습니다.', demo:'<i class="me">3</i><b class="ov" style="left:8px;right:auto;top:14px;height:46px;width:34px"></b><em>❄ 공격 불가</em>'},
 {n:'독성', d:'poison', t:'이 하수인이 하수인에게 피해를 주면, 그 하수인은 체력과 상관없이 처치됩니다. (보호막이 막은 피해는 제외)', demo:'<i class="me">1</i><i class="en">8</i><em>피해를 입히면 처치</em>'},
 {n:'생명력 흡수', d:'ls', t:'이 하수인이 준 피해만큼 내 영웅이 회복됩니다.', demo:'<i class="me">3</i><i class="en">2</i><em>피해 = 회복</em>'},
 {n:'죽음의 메아리', d:'death', t:'이 하수인이 죽을 때 효과가 발동합니다.', demo:'<i class="me">·</i><i class="en">2</i><em>죽으면 효과 발동</em>'},
];
const GUIDE_TXT=[
 ['전투의 함성','카드를 손에서 낼 때 한 번 발동하는 효과입니다. 대상을 고르는 경우도 있습니다.'],
 ['주문폭주','내가 주문을 시전한 뒤 딱 한 번 발동하고, 발동하면 키워드가 사라집니다.'],
 ['과부하 (N)','이 카드를 내면 <b>다음 턴</b> 마나 수정 N개가 잠겨 쓸 수 없습니다.'],
 ['방어도','영웅이 받는 피해를 먼저 흡수합니다. 체력이 아니라 방패 역할입니다.'],
 ['시체','내 하수인이 죽을 때마다 1개씩 쌓입니다. 혈기 카드가 시체를 소모해 강력한 효과를 냅니다.'],
 ['증가','생명력 <b>증가</b>는 회복과 달리 최대 체력을 넘어 영웅 생명력을 늘립니다.'],
 ['발견','카드 3장 중 1장을 골라 손으로 가져옵니다.'],
];
// ---- v113 가이드: 새 키워드 + 그림 설명 페이지 ----
GUIDE_FX.unshift({h:'기본 키워드'});
GUIDE_FX.push({h:'추가된 키워드'},
 {n:'질풍', d:'wind', t:'턴마다 <span class="hl">두 번</span> 공격할 수 있습니다. (걸어 다니는 샘, 바람의 군주 알아키르)', demo:'<i class="me">3</i><i class="en">4</i><em>한 턴에 두 번 공격</em>'},
 {n:'과부하 (N)', d:'lock', t:'이 카드를 내면 <span class="hl">다음 턴</span> 마나 수정 N개가 잠겨 쓸 수 없습니다. (토템 골렘, 번개 폭풍 등)', demo:'<span class="cr">💎</span><span class="cr" style="left:30px">💎</span><span class="cr" style="left:52px">💎</span><span class="cr lk" style="left:74px">🔒</span><span class="cr lk" style="left:96px">🔒</span><em>다음 턴 마나 N개 잠김</em>'},
 {n:'잔상', d:'echo', t:'이 카드를 내면 <span class="hl">같은 카드가 한 장 더</span> 손에 들어옵니다. 이번 턴에 또 낼 수 있고, 내 턴이 끝나면 사라집니다.', demo:'<i class="me">✦</i><i class="en">✦</i><em>복사본이 손에 · 턴 끝에 사라짐</em>'},
 {n:'이중 주문', d:'twin', t:'이 주문을 쓸 때마다 <span class="hl">이중 주문이 없는 복사본</span>이 손패로 들어옵니다. 손패가 가득이면 소각됩니다.', demo:'<i class="me">✦</i><i class="en">✦</i><em>쓸 때마다 사본 1장 획득</em>'},
 {n:'연계', d:'spell', t:'이번 턴에 <span class="hl">앞서 다른 카드를 냈을 때만</span> 발동합니다. (엘프 음악가)', demo:'<i class="me">1</i><i class="en2" style="background:linear-gradient(160deg,#cfe9e6,#6fc2ba)">3</i><em>앞에 낸 카드가 있으면 발동</em>'},
 {n:'미니미', d:'twin', t:'이 카드를 내면 <span class="hl">1/1 · 비용 (1)</span>의 작은 복사본(미니)이 손패로 들어옵니다. 전투의 함성도 그대로입니다.', demo:'<i class="me">5</i><i class="en">1</i><em>작은 복사본이 손으로</em>'},
 {n:'주입 (N)', d:'death', t:'이 카드를 <span class="hl">손에 들고 있는 동안</span> 하수인이 (양쪽 합쳐) N마리 죽으면 강화됩니다. 카드에 [현재/N]으로 표시됩니다.', demo:'<i class="me">·</i><i class="en">2</i><em>죽을 때마다 [n/N] 증가</em>'},
 {n:'소각', d:'burn', t:'손패가 가득(<span class="hl">${CONFIG.MAX_HAND}장</span>)일 때 카드를 얻으면 그 카드는 불타 사라집니다.', demo:'<i class="me">🔥</i><i class="en">+1</i><em>손패 가득 → 카드 소각</em>'}
);
GUIDE_TXT.push(
 ['내 턴이 끝날 때','내가 [턴 종료]를 누르면 발동하는 효과입니다. 토템·정령 같은 필드 유지형 카드가 많이 씁니다.'],
 ['이번 게임 동안','한 번 발동하면 게임이 끝날 때까지 유지되는 효과입니다. (돌장인: 내 토템 공격력 +2)'],
 ['양옆','하수인 줄에서 바로 왼쪽·오른쪽에 붙어 있는 하수인입니다. 위치를 잘 배치하세요. (불꽃의 토템, 물 공급 토템)'],
 ['토템','종족입니다. 대부분 공격력이 0이지만 턴 종료 때 아군을 돕습니다. (스테레오 토템, 죄악석 토템 등)'],
 ['주문 공격력','주문이 주는 피해를 늘려줍니다. 시프는 내가 시전한 주문의 속성 종류만큼 강해집니다.'],
 ['침묵','하수인의 모든 추가 능력(도발·보호막 등)을 지웁니다. 능력치와 종족은 그대로입니다.'],
 ['변신','다른 하수인으로 바뀝니다. 기존 능력과 강화 효과가 모두 사라집니다.'],
 ['사냥꾼 카드','사냥꾼 표시가 붙은 주문과 모든 야수 하수인을 가리킵니다. 실탄 장전 같은 카드가 찾습니다.'],
 ['룬 (부정·냉기·혈기)','카드 맨 아래에 적히는 계열입니다. 덱 편집에서 룬 탭으로 따로 모아 볼 수 있습니다.']
);
function guideFx(){
  return '<p class="dim">예시 화면은 반복 재생되는 간단한 애니메이션입니다. (파란 카드 = 내 하수인, 붉은 카드 = 상대)</p>'
   + GUIDE_FX.map(f=> f.h ? `<h4>${f.h}</h4>` : `<div class="g-fx"><div class="gd d-${f.d}">${f.demo}</div><div class="txt"><b>${f.n}</b>${f.t.replace('${CONFIG.MAX_HAND}', CONFIG.MAX_HAND)}</div></div>`).join('')
   + '<h4>그 밖의 용어</h4><ul>'+GUIDE_TXT.map(x=>`<li><b>${x[0]}</b> — ${x[1]}</li>`).join('')+'</ul>';
}
// ---- 그림 도우미 ----
const gImg=n=> (typeof CARD_ART!=='undefined' && CARD_ART[n]) ? `<img src="${CARD_ART[n]}" alt="" onerror="this.style.display='none'">` : '';
function gmc(o){   // {cls, art(카드이름), emo, nm, c, a, h, x, zz}
  return `<div class="mc ${o.cls||''}"><div class="art">${o.art?gImg(o.art):''}${o.art?'':(o.emo||'')}</div>${o.nm?`<div class="n">${o.nm}</div>`:''}${o.c!=null?`<span class="st c">${o.c}</span>`:''}${o.a!=null?`<span class="st a">${o.a}</span>`:''}${o.h!=null?`<span class="st h">${o.h}</span>`:''}${o.x?'<div class="x">✕</div>':''}${o.zz?'<span class="zz">z z z</span>':''}</div>`;
}
const gcol=(inner,lbl)=>`<div class="gp-col">${inner}${lbl?`<div class="gp-lbl">${lbl}</div>`:''}</div>`;
const ghero=(emo,hp,o={})=>`<div class="hero-o ${o.dead?'dead':''}">${emo}${o.atk?`<span class="atkb">${o.atk}</span>`:''}${o.arm!=null?`<span class="arm">${o.arm}</span>`:''}<span class="hpb">${hp}</span></div>`;
const gback=n=>`<div class="stack">${'<div class="mc back"></div>'.repeat(n)}</div>`;
const gdots=(i,n)=>'<span class="gp-dots">'+Array.from({length:n},(_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')+'</span>';
const guidePg={rule:0, card:0};
function gpGo(kind,d){ guidePg[kind]+=d; guideTab(kind); }
function gPager(kind, pages){
  const i=Math.max(0,Math.min(pages.length-1,guidePg[kind])); guidePg[kind]=i; const p=pages[i];
  return `<div class="gp-head"><span>${i+1} / ${pages.length}</span><b>${p.t}</b></div><div class="gp-stage">${p.s}</div><div class="gp-text">${p.x}</div>
   <div class="gp-nav"><button ${i?'':'disabled'} onclick="gpGo('${kind}',-1)">◀ 이전</button>${gdots(i,pages.length)}<button ${i<pages.length-1?'':'disabled'} onclick="gpGo('${kind}',1)">다음 ▶</button></div>`;
}
function guideCard(){
  const M=CONFIG.MAX_MANA;
  const pages=[
   {t:'하수인 카드', s:`<div class="g-card" style="background:none"><div class="g-sample"><span class="c">3</span><span class="nm">예시 하수인</span><span class="ef">도발. 전투의 함성: 카드를 1장 뽑는다</span><span class="a">2</span><span class="r">야수</span><span class="l">4</span></div>
      <ul class="g-legend" style="margin:0"><li><b>왼쪽 위(파랑)</b> 마나 비용</li><li><b>왼쪽 아래(노랑)</b> 공격력</li><li><b>오른쪽 아래(빨강)</b> 체력 — 0이 되면 죽습니다</li><li><b>아래 가운데</b> 종족</li><li><b>가운데 글</b> 키워드와 효과</li></ul></div>`,
    x:'<p>전장에 남아 싸우는 카드입니다. 낼 때 마나를 쓰고, 다음 턴부터 공격할 수 있습니다.</p>'},
   {t:'주문 카드', s:`<div class="g-card" style="background:none"><div class="g-sample sp"><span class="c">2</span><span class="nm">불꽃 화살</span><div class="art2"></div><span class="ef" style="top:60px">적 하나에게 피해 3</span><span class="r">✦ 화염 주문 ✦</span></div>
      <ul class="g-legend" style="margin:0"><li><b>왼쪽 위(파랑)</b> 마나 비용</li><li><b>공격력·체력 없음</b></li><li><b>아래</b> ✦ 속성 주문 ✦</li></ul></div>`,
    x:'<p>한 번 쓰면 효과를 내고 사라집니다. 보라색 카드로 구분하세요. <b>잔상</b>·<b>이중 주문</b>이 붙은 주문은 복사본이 손으로 들어옵니다.</p>'},
   {t:'종족과 룬', s:`<div class="gp-row">${gcol(gmc({cls:'me',art:'스테레오 토템',nm:'스테레오 토템',c:2,a:0,h:3}),'<span class="chip tr">토템</span> 종족')}${gcol(gmc({cls:'me',art:'카인 선퓨리',nm:'카인 선퓨리',c:4,a:3,h:5}),'종족 없음')}</div><div class="gp-sep"></div>
      <div class="gp-row"><span class="chip un">부정 룬</span><span class="chip fr">냉기 룬</span><span class="chip bl">혈기 룬</span></div>`,
    x:'<p><b>종족</b>은 카드 아래 가운데에 적힙니다(야수·토템·기계·정령·언데드 등). 같은 종족끼리 효과를 주고받습니다.</p><p><b>룬</b>은 카드 맨 아래에 적히는 계열 표시이고, 덱 편집에서 룬 탭으로 모아 볼 수 있습니다.</p>'},
   {t:'탈진', s:`<div class="gp-row">${gcol('<div class="slot" style="width:44px;height:60px"></div>','덱이 비었다!')}<span class="gp-arrow">→</span>${gcol(ghero('🙂',CONFIG.HERO_HP-1),'뽑을 때마다')}</div>
      <div class="gp-row"><span class="dmg">-1</span><span class="gp-arrow">›</span><span class="dmg">-2</span><span class="gp-arrow">›</span><span class="dmg">-3</span><span class="gp-arrow">›</span><span class="dmg">-4</span><span class="gp-arrow">…</span></div>`,
    x:'<p>덱이 비었는데 카드를 뽑아야 하면 영웅이 피해를 입습니다. 피해는 <b>1, 2, 3, 4…</b> 뽑을 때마다 커집니다. 덱 카드 수를 항상 확인하세요!</p>'},
   {t:'동전', s:`<div class="gp-row">${gcol('<div class="coin">동전</div>','0마나 주문 (후공이 받음)')}<span class="gp-arrow">→</span>${gcol('<span class="crys">💎💎💎💎</span> <span class="crys" style="color:#ffd89a">+💎💎</span>','이번 턴 마나 +2')}</div>`,
    x:'<p>후공 플레이어가 받는 0마나 주문입니다. 쓰면 <b>이번 턴만</b> 마나 +2. 마나 수정을 영구히 늘리지는 않습니다.</p>'}
  ];
  return gPager('card',pages);
}
function guideRule(){
  const C=CONFIG, ME='카인 선퓨리', EN='누더기골렘', TAUNT='강철나무 골렘';
  const pages=[
   {t:'🏆 승리 조건', s:`<div class="gp-row">${gcol(ghero('🙂',C.HERO_HP),'내 영웅 체력 '+C.HERO_HP)}${gcol(ghero('😈',C.HERO_HP),'상대 영웅 체력 '+C.HERO_HP)}</div><div class="gp-sep"></div>
      <div class="gp-row">${gcol(ghero('😈',0,{dead:true}),'상대 체력 0')}<span class="gp-arrow">=</span>${gcol('<div style="font-size:2rem">🏆</div>','승리!')}</div>`,
    x:`<p>상대 영웅의 체력을 <b>0</b>으로 만들면 승리! 반대로 내 체력이 0이 되면 패배입니다. 영웅 체력은 <b>${C.HERO_HP}</b>에서 시작합니다.</p>`},
   {t:'🃏 게임 준비', s:`<div class="gp-row">${gcol(gback(3),'덱 <b style="color:#f0c869">'+C.DECK_SIZE+'장</b>')}${gcol(`<div style="display:flex;gap:6px">${gmc({cls:'me',art:ME,nm:'같은 카드',c:4})}${gmc({cls:'me',art:ME,nm:'같은 카드',c:4})}</div>`,'같은 카드는 최대 '+C.COPIES+'장')}</div><div class="gp-sep"></div>
      <div class="gp-row">${gcol(gback(C.START_HAND),'선공 · 시작 손패 '+C.START_HAND+'장')}${gcol(`<div style="display:flex;align-items:center;gap:8px">${gback(C.START_HAND+C.SECOND_HAND)}<div class="coin">동전</div></div>`,'후공 · +'+C.SECOND_HAND+'장과 동전 1장')}</div>`,
    x:'<p>선공·후공은 <b>무작위</b>로 정해집니다. 후공은 카드를 더 받아 불리함을 보충합니다.</p>'},
   {t:'🔄 멀리건', s:`<div class="gp-row">${gmc({cls:'back'})}${gmc({cls:'me',art:ME,nm:'비싼 카드',c:9,x:true})}${gmc({cls:'back'})}<span class="gp-arrow">→</span>${gmc({cls:'me',art:TAUNT,nm:'새 카드',c:3})}</div>
      <div class="gp-lbl" style="max-width:none">마음에 안 드는 카드를 눌러 ✕ 표시 → 덱에 섞고 새 카드를 뽑음</div>`,
    x:'<p>시작 카드 중 원하지 않는 카드를 눌러 <b>✕</b> 표시하면 덱에 섞이고 새 카드를 뽑습니다. <b>한 번만</b> 가능하고, 바꾸지 않아도 됩니다. 보통 <b>비싼 카드</b>를 바꾸는 게 좋습니다.</p>'},
   {t:'⏱ 매 턴 순서', s:`<div class="gp-row"><div class="step"><i>💎</i><span>마나 +1<br>가득 채움</span></div><span class="gp-arrow">›</span><div class="step"><i>🃏</i><span>카드 1장<br>뽑기</span></div><span class="gp-arrow">›</span><div class="step"><i>⚔️</i><span>카드 내고<br>공격</span></div><span class="gp-arrow">›</span><div class="step"><i>⏭️</i><span>[턴 종료]<br>상대 차례</span></div></div><div class="gp-sep"></div>
      <div class="gp-row">${gcol('<span class="crys">💎💎💎💎</span><span class="crys off">💎💎💎💎💎💎</span>','4번째 턴 = 마나 4')}${gcol('<span class="crys">💎💎💎💎💎💎💎💎💎💎</span>','최대 '+C.MAX_MANA+'개')}</div>`,
    x:`<p>내 턴이 시작되면 <b>마나 수정 +1개</b>(최대 ${C.MAX_MANA}개)가 생기고 마나가 가득 찹니다. 카드 1장을 뽑은 뒤 마나 범위 안에서 카드를 내고 하수인으로 공격합니다. 끝나면 <b>[턴 종료]</b>를 누르세요.</p>`},
   {t:'📏 필드·손패 제한', s:`<div class="gp-lbl" style="max-width:none">필드 — 하수인 최대 ${C.MAX_BOARD}기</div><div class="slots">${'<div class="slot f"></div>'.repeat(C.MAX_BOARD)}<div class="slot no">✕</div></div>
      <div class="gp-lbl" style="max-width:none">손패 — 최대 ${C.MAX_HAND}장 (넘치면 소각 🔥)</div><div class="slots">${'<div class="slot h"></div>'.repeat(C.MAX_HAND)}<div class="slot no">🔥</div></div>
      <div class="gp-sep"></div><div class="gp-row">${gcol(gmc({cls:'me',art:ME,nm:'낸 턴',a:3,h:5,zz:true}),'낸 턴: 공격 불가')}<span class="gp-arrow">→</span>${gcol(gmc({cls:'me',art:ME,nm:'다음 턴',a:3,h:5}),'다음 턴부터 공격')}</div>`,
    x:`<p>필드에는 하수인을 최대 <b>${C.MAX_BOARD}기</b>까지 둘 수 있고, 가득 차면 더 소환되지 않습니다. 손패는 <b>${C.MAX_HAND}장</b>까지이며 넘치게 뽑으면 그 카드가 불타 사라집니다. 하수인은 턴마다 <b>한 번</b> 공격하고, 낸 턴에는 공격하지 못합니다(돌진·속공 제외).</p>`},
   {t:'⚔️ 공격 방법', s:`<div class="gp-row">${gcol(gmc({cls:'me',art:ME,nm:'내 하수인',a:3,h:4}),'① 내 하수인을 누른다')}<span class="gp-arrow">⚔</span>${gcol(gmc({cls:'en',art:EN,nm:'상대 하수인',a:2,h:3}),'② 대상을 고른다')}</div>
      <div class="gp-row">${gcol(gmc({cls:'me',art:ME,nm:'내 하수인',a:3,h:2}),'<span class="dmg">-2</span> 서로 공격력만큼<br>피해를 주고받음')}${gcol(gmc({cls:'en',art:EN,nm:'상대 하수인',a:2,h:0,x:true,}),'<span class="dmg">-3</span> 체력 0 → 처치')}</div>`,
    x:'<p>내 하수인을 누르고 대상을 고릅니다. 서로 <b>공격력만큼</b> 피해를 주고받으며, 체력이 0이 되면 죽습니다. 상대 영웅도 공격 대상이 될 수 있습니다.</p>'},
   {t:'🛡 도발', s:`<div class="gp-row">${gcol(gmc({cls:'me',art:ME,nm:'내 하수인',a:3,h:4}),'')}<span class="gp-arrow" style="color:#ff6a5a">🚫 →</span>${gcol(ghero('😈',C.HERO_HP),'영웅·다른 하수인')}</div>
      <div class="gp-row">${gcol(gmc({cls:'me',art:ME,nm:'내 하수인',a:3,h:4}),'')}<span class="gp-arrow">⚔ →</span>${gcol(gmc({cls:'en taunt',art:TAUNT,nm:'도발 하수인',a:3,h:6}),'도발부터 공격!')}</div>`,
    x:'<p>상대에게 <b>도발</b> 하수인(회색 테두리)이 있으면 영웅과 다른 하수인은 공격할 수 없고, <b>도발부터</b> 처리해야 합니다.</p>'},
   {t:'🦸 영웅 공격 · 방어도', s:`<div class="gp-row">${gcol(ghero('🙂',C.HERO_HP,{atk:2}),'영웅 공격력 2')}<span class="gp-arrow">⚔</span>${gcol(ghero('😈',C.HERO_HP-2),'<span class="dmg">-2</span>')}</div><div class="gp-sep"></div>
      <div class="gp-row">${gcol(ghero('🙂',C.HERO_HP,{arm:5}),'방어도 5')}<span class="dmg">피해 4</span><span class="gp-arrow">→</span>${gcol(ghero('🙂',C.HERO_HP,{arm:1}),'방어도 1 · 체력 그대로')}</div>`,
    x:'<p>카드 효과로 <b>영웅 공격력</b>이 생기면 그 턴에 한 번 영웅이 공격할 수 있습니다. <b>방어도</b>는 영웅이 받는 피해를 체력보다 먼저 흡수하는 방패입니다.</p>'}
  ];
  return gPager('rule',pages);
}
function openGuide(){ guidePg.rule=0; guidePg.card=0; showScreen('guide'); guideTab('fx'); }
function guideTab(t){
  document.querySelectorAll('.g-tabs button').forEach(b=>b.classList.toggle('on', b.dataset.t===t));
  const b=$('guideBody'); b.innerHTML = t==='fx'?guideFx():t==='card'?guideCard():guideRule(); b.scrollTop=0;
}
document.querySelectorAll('.g-tabs button').forEach(b=>b.addEventListener('click',()=>{ guidePg.rule=0; guidePg.card=0; guideTab(b.dataset.t); }));

function showScreen(name){
  document.querySelectorAll('#menu .screen').forEach(el=>el.classList.toggle('show', el.id==='screen-'+name));
}
function updateWallet(){
  const g=fmt(Economy.get().gold);
  document.querySelectorAll('.walletView').forEach(el=>el.textContent=`💰 ${g}`);
}
function rewardDesc(key){
  if(key==='easy') return `승리 시 ${ECON.EASY_WIN}골드 · 패배 시 0골드`;
  if(key==='normal' || key==='normal2') return '일반 / 배팅 모드 선택 가능';
  return '';
}
function buildDifficultyButtons(){
  const box=$('difficultyList'); box.innerHTML='';
  for(const [key,d] of Object.entries(DIFFICULTY)){
    const b=document.createElement('button');
    b.className='menu-btn';
    const rd=d.bot?rewardDesc(key):'';
    b.innerHTML=`${d.label}${d.bot?'':'<span class="soon">준비 중</span>'}<span class="desc">${d.desc}</span>${rd?`<span class="desc">💰 ${rd}</span>`:''}`;
    b.disabled=!d.bot;
    b.onclick=()=> (key==='normal' || key==='normal2') ? openPlayMode(key) : startGame(key,{mode:'normal'});
    box.appendChild(b);
  }
}
// ---- 중급: 일반 / 배팅 선택 ----
function openPlayMode(key='normal'){
  curKey=key;
  $('playmodeTitle').textContent=`${DIFFICULTY[key].label} AI — 방식 선택`;
  const sv=Economy.get(), pool=Economy.poolNow(sv);
  $('btnNormalMode').innerHTML=`일반 모드<span class="desc">참가비 없음 · 승리 시 오늘의 보상 <b>${pool}골드</b></span><span class="desc">승리하면 보상 +5%, 패배하면 −5% (매일 새벽 ${ECON.RESET_HOUR}시 ${ECON.POOL_START}골드로 초기화)</span>`;
  const mb=Economy.maxBet(sv);
  $('btnBetMode').disabled = mb<1;
  $('btnBetMode').innerHTML=`배팅 모드${mb<1?'<span class="soon">골드 부족</span>':''}<span class="desc">골드를 걸고 대전 · 배당 ${ECON.BET_TIERS[0]}~${ECON.BET_TIERS[ECON.BET_TIERS.length-1]}% 선택, 패배 시 건 골드를 모두 잃음</span><span class="desc">배당 200% 이상은 상대 AI가 치트를 받습니다 · 보상 풀과는 별개 (최대 ${fmt(mb)}골드)</span>`;
  showScreen('playmode');
}
// ---- 배팅 화면 ----
function betBounds(){ const sv=Economy.get(); return {gold:sv.gold, min:1, max:Economy.maxBet(sv)}; }
function readBet(){
  const {min,max}=betBounds();
  let v=Math.floor(Number($('betInput').value));
  if(!Number.isFinite(v)) v=min;
  return Math.min(max, Math.max(min, v));
}
function refreshBetUI(){
  const {gold,min,max}=betBounds(), v=readBet();
  $('betGold').textContent=fmt(gold)+'골드';
  $('betMax').textContent=fmt(max)+'골드';
  $('betRange').min=min; $('betRange').max=max; $('betRange').value=v;
  $('betInput').min=min; $('betInput').max=max;
  const net=Economy.betWinNet(v, betTier);
  $('betResult').innerHTML=`승리 시 <span class="win">+${fmt(net)}</span> (총 ${fmt(v+net)}골드 반환) · 패배 시 <span class="lose">−${fmt(v)}</span>`;
  buildTierToggle(); renderCheatInfo();
  $('betGo').disabled = max<1;
}
function buildTierToggle(){
  const box=$('tierToggle'); box.innerHTML='';
  ECON.BET_TIERS.forEach(t=>{
    const b=document.createElement('button'); b.textContent=t+'%'; b.className=t===betTier?'on':'';
    b.onclick=()=>{ betTier=t; refreshBetUI(); };
    box.appendChild(b);
  });
  $('betTierLabel').textContent=`${betTier}%`;
}
function renderCheatInfo(){
  const box=$('cheatInfo'), t=CHEAT_TIERS[betTier], cands=cheatCandidates(betTier);
  if(!t || t.count<=0){ box.textContent='치트 없음 — 기본 AI와 대전합니다.'; return; }
  box.innerHTML=`상대 AI가 치트 <b>${t.count}개</b>를 받습니다 (게임 시작 때 아래 후보에서 무작위 추첨)<br>`+cands.map(c=>`<span class="chip" tabindex="0" data-tip="${c.desc}">${c.icon?c.icon+' ':''}${c.name}</span>`).join('')+'<br><span style="font-size:.68rem;">이름에 마우스를 올리면(터치는 탭) 자세한 효과가 보입니다.</span>';
}
function setBet(x){
  const {min,max}=betBounds();
  $('betInput').value = x==='min'?min : x==='max'?max : Math.max(min, Math.min(max, Math.floor(max*x)));
  refreshBetUI();
}
function openBetScreen(){
  betTier=ECON.BET_DEFAULT;
  const {min,max}=betBounds();
  $('betInput').value=Math.min(max, Math.max(min, Math.floor(max/2)||min));
  refreshBetUI(); showScreen('bet');
}
$('betInput').addEventListener('input', refreshBetUI);
$('betInput').addEventListener('change', ()=>{ $('betInput').value=readBet(); refreshBetUI(); });
$('betRange').addEventListener('input', ()=>{ $('betInput').value=$('betRange').value; refreshBetUI(); });
function confirmBet(){
  const amount=readBet();
  const placed=Economy.placeBet(Economy.get(), amount);
  if(!placed){ refreshBetUI(); return; }
  Economy.set(placed);                         // 시작 시점에 차감하고 즉시 저장
  startGame(curKey, {mode:'bet', bet:amount, tier:betTier});
}

function startGame(key, opts={}){
  const d=DIFFICULTY[key];
  if(!d || !d.bot) return;
  const mode=opts.mode||'normal', sv=Economy.get();
  const tier = mode==='bet' ? (opts.tier||ECON.BET_DEFAULT) : 0;
  const roll = mode==='bet' ? rollCheats(tier) : {mods:{}, list:[]};
  game={key, mode, bet:mode==='bet'?(opts.bet||0):0, tier, cheats:roll.list, pool:Economy.poolNow(sv), settled:false, result:null};
  Bot=d.bot;
  game.deckNames=DeckBook.get();                 // 이번 판에 쓰는 내 덱(편집한 덱)
  Host.start(roll.mods, game.deckNames);
  view=Host.view(MY);
  ui.selected=null; ui.pending=null; ui.busy=false; stopArrow(); closeDeck(); resetSurrenderBtn();
  $('logList').innerHTML='';
  $('overlay').classList.remove('show');
  $('overlayReward').innerHTML='';
  const tag = key==='easy' ? `승리 +${ECON.EASY_WIN}G` : mode==='bet' ? `배팅 ${fmt(game.bet)}G · ${tier}%` : `보상 ${game.pool}G`;
  $('verBadge').textContent=VERSION;
  $('diffBadge').textContent=`${d.label} · ${tag}`;
  $('menu').classList.add('hidden');
  updateWallet();
  const iFirst = Host.state.first===MY;
  const bonusTxt = `시작 손패 +${CONFIG.SECOND_HAND}장 · 동전 1장`;
  logLine(`게임 시작! (${d.label} 상대${mode==='bet'?` · 배팅 ${fmt(game.bet)}골드`:''}) ` + (iFirst ? `당신이 선공입니다. 후공(상대) 보너스: ${bonusTxt}. 당신의 턴입니다.` : `상대가 선공입니다. 후공(당신) 보너스: ${bonusTxt}.`));
  $('diffBadge').textContent += iFirst ? ' · 선공' : ' · 후공';
  if(game.cheats.length) logLine('⚠ 상대 치트: '+game.cheats.map(c=>c.desc).join(' / '));
  beginMatch();
}
function goToMenu(){
  $('overlay').classList.remove('show');
  ui.selected=null; ui.pending=null; ui.busy=false; stopArrow(); closeDeck();
  buildDifficultyButtons(); updateWallet();
  document.querySelector('#aiHero .name').textContent='상대';
  if(game && game.mode==='pvp'){ PvpClient.afterMatch(); $('menu').classList.remove('hidden'); return; }   // 유저 대전이 끝나면 대전 화면으로
  if(game && game.mode==='adventure'){ if(game.devTest) openBossForm(game.bossIdx); else openAdventure(bossRank(game.boss)); }
  else if(game && game.mode==='test') openTestScreen(); else showScreen('main');   // v54: 테스트 판이 끝나면 테스트 설정 화면으로
  $('menu').classList.remove('hidden');
}


// ======================================================================
// v114 모험 모드 · 보스 · 보스 덱 편집 (개발자 전용)
//  - 보스 = 고정 덱 + 영웅 체력 보너스 + AI(규칙 봇 또는 학습 모델)
//  - v116: 보스 목록은 서버(/api/bosses)에 저장된 값을 모든 유저가 쓴다. 서버에 아직 저장된 게 없으면 코드의 BOSS_DEFAULT.
//  - 보스 덱 편집·테스트 메뉴는 개발자 계정(node server/make-admin.js 아이디)에게만 보인다. 저장 권한은 서버가 다시 검사한다.
// ======================================================================
const isDev = () => !!ServerStore.isAdmin;
const BOSS_DEFAULT = [
 {id:'boss1', name:'불꽃 약탈자', icon:'🔥', desc:'싼 하수인으로 몰아치는 어그로 덱', cheats:[], tier:'mid', bot:'rule2', model:'',
  deck:["책벌레", "방패병", "죄악석 토템", "보석 박힌 딱정벌레", "카인 선퓨리", "점화", "혈기술사", "명암의 사도", "주문사수", "부상당한 크발디르", "치유의 빛", "강철 파수대장", "검 제작의 대가", "공허의 영혼", "날쌘 척후병", "번개 폭풍", "복제", "성게 가시", "강화", "죄악석 토템", "분열하는 점액", "오늘의 월척", "날쌘 척후병", "수정 골렘", "강철 파수대장", "번개", "주문사수", "검 제작의 대가", "약초꾼", "대사제 데칼"]},
 {id:'boss2', name:'균형의 수호자', icon:'⚖️', desc:'중간 코스트 위주의 미드레인지 덱', cheats:['hp'], tier:'mid', bot:'rule2', model:'',
  deck:["불굴의 토레스", "채광 사상자", "시초자", "허기진 포식자", "바르덴 던그래스프", "채광 사상자", "벼락 마법사", "어둠가시 바느질꾼", "주문사수", "부화장 도우미", "거대한 토템 아이스오르", "검 제작의 대가", "공허의 영혼", "불꽃의 토템", "불꽃의 토템", "거머리 어미 발토라", "비겁한 밀고자", "견습 검사", "전장의 강령술사", "덱 탐색", "그훈의 피", "피의 소용돌이", "전력 질주", "스테레오 토템", "고대의 공허 사냥개", "비겁한 밀고자", "왕의 축복", "왕 크루쉬", "타르막", "거머리 어미 발토라"]},
 {id:'boss3', name:'고대의 지배자', icon:'👑', desc:'비싼 카드와 주문으로 버티는 컨트롤 덱', cheats:['hp','costDown'], tier:'mid', bot:'rule2', model:'',
  deck:["타락심장 심문관", "뱀사육사", "왕 크루쉬", "거품로봇", "카인 선퓨리", "기사대장", "대장군 분", "빛의 수호자", "비전 수호자", "적자생존", "영혼의 절규", "강철 파수대장", "대마법학자 롬메스", "대주교 베네딕투스", "퍼져나가는 역병", "영혼의 절규", "로데브", "브롤 베어맨틀", "요그사론의 종복", "에메리스", "저지해라!", "적자생존", "처형", "수호의 장벽", "곰팡이술사", "가시가 돋친 탈것", "변이", "여름의 평화수호자", "아마라의 이야기", "불사조"]},

 {id:'boss4', name:'심연의 군주', icon:'🐲', desc:'학습한 AI가 조종하는 상급 보스 (모델을 연결하기 전에는 임시로 중급2가 대신 싸웁니다)', cheats:[], tier:'high', bot:'model', model:'',
  deck:["불굴의 토레스", "채광 사상자", "시초자", "허기진 포식자", "바르덴 던그래스프", "채광 사상자", "벼락 마법사", "어둠가시 바느질꾼", "주문사수", "부화장 도우미", "거대한 토템 아이스오르", "검 제작의 대가", "공허의 영혼", "불꽃의 토템", "불꽃의 토템", "거머리 어미 발토라", "비겁한 밀고자", "견습 검사", "전장의 강령술사", "덱 탐색", "그훈의 피", "피의 소용돌이", "전력 질주", "스테레오 토템", "고대의 공허 사냥개", "비겁한 밀고자", "왕의 축복", "왕 크루쉬", "타르막", "거머리 어미 발토라"]},
];
// 난이도 등급: 치트가 없으면 AI 종류(중급/상급), 치트가 있으면 개수만큼 오른다 (롤 등급처럼)
//   1 브론즈 · 2 실버 · 3 골드 · 4 플래티넘 · 5 에메랄드 · 6 다이아 · 7 마스터 · 8 그랜드마스터 · 9개 이상 챌린저
// 보상(골드)은 아래 표에서만 고친다. 보스 설정에서 보스마다 직접 정할 수도 있다 (0 = 이 표 값).
const BOSS_RANKS=[['mid','중급','#9aa3b8',50],['high','상급','#c9c1ee',100],['bronze','브론즈','#c98a56',150],['silver','실버','#c4ccd6',250],['gold','골드','#e6bd3c',400],
  ['plat','플래티넘','#4fd1c0',600],['emerald','에메랄드','#3ecf74',900],['diamond','다이아몬드','#6fb0ff',1300],['master','마스터','#c071ff',1800],['gm','그랜드마스터','#ff6e6e',2500],['challenger','챌린저','#ffd44d',4000]];
const BOSS_REPEAT_RATIO=0.1;      // 이미 깬 보스를 다시 이기면 보상의 이 비율만 (반복 노가다 방지)
const bossRank=b=>{ const n=(b.cheats||[]).length; return n<=0 ? (b.tier==='high'?'high':'mid') : BOSS_RANKS[Math.min(n,9)+1][0]; };
const rankInfo=k=>BOSS_RANKS.find(r=>r[0]===k)||BOSS_RANKS[0];
const rankLabel=k=>rankInfo(k)[1];
const rankTag=k=>`<span class="tier-tag" style="color:${rankInfo(k)[2]};border-color:${rankInfo(k)[2]}">${rankInfo(k)[1]}</span>`;
const bossReward=b=>b.reward>0 ? b.reward : rankInfo(bossRank(b))[3];
const bossCheatList=b=>(b.cheats||[]).map(id=>CHEATS.find(c=>c.id===id)).filter(Boolean);
const bossMods=b=>{ const m={}; bossCheatList(b).forEach(c=>{ m[c.id]=cheatValue(c,0); }); return m; };
const BossBook = (() => {
  const clean=b=>({id:String(b.id), name:String(b.name||'이름 없음').slice(0,20), icon:String(b.icon||'👹').slice(0,4), desc:String(b.desc||'').slice(0,80),
    cheats:[...new Set((Array.isArray(b.cheats)?b.cheats:[]).map(String))].filter(id=>CHEATS.some(c=>c.id===id)), reward:Math.max(0,Math.min(1000000,Math.floor(Number(b.reward)||0))), tier:(b.tier==='high'||(b.tier==null&&b.bot==='model'))?'high':'mid',
    bot:(b.tier==='high'||(b.tier==null&&b.bot==='model'))?'model':(b.bot==='rule'?'rule':'rule2'), model:String(b.model||''),
    deck:Array.isArray(b.deck)?b.deck.map(String):[]});
  const ok=l=>Array.isArray(l) && l.length>0 && l.every(b=>b && typeof b.id==='string');
  return {
    get(){ return (ok(ServerStore.bosses)?ServerStore.bosses:BOSS_DEFAULT).map(clean); },     // 서버에 저장된 목록 (없으면 코드 기본값)
    set(list){ ServerStore.setBosses(list.map(clean)); },                                       // 개발자만 (서버가 다시 검사)
    reset(){ ServerStore.setBosses(null); },
    toJson(list){ return '[\n'+(list||this.get()).map(b=>' '+JSON.stringify(b)).join(',\n')+'\n]\n'; },
    deckError(b){ return validateDeckList(b.deck); },       // null 이면 정상
    clean, ok,
  };
})();
const AdventureBook = {                              // 보스 첫 클리어 기록 (서버, 내 계정에 저장)
  has(id){ return ServerStore.hasCleared(id); },
  clear(id){ ServerStore.markCleared(id); },
};


// ======================================================================
// v114 학습 모델 추론 (번호표 방식 v2 모델: game\features2.js + game\rl_bot.js 를 브라우저용으로 옮긴 것)
//  - 모델 파일 = 학습이 저장한 model.json / best.json (PyTorch 의 .pt 는 쓸 수 없음)
//  - 번호표(card_registry.json)는 아래에 내장. 학습 쪽 번호표가 바뀌면 보스 덱 편집 화면에서 새 파일을 불러올 수 있다.
// ======================================================================
const PolicyNet = (() => {
  const REG0 = {"_설명":"번호는 절대 바꾸지 말 것. 새 항목은 맨 뒤에만 추가됨 (tools\\update_registry.js). 배열 위치+1 = 번호(names, effs), 위치 = 칸 번호(kws).","caps":{"names":1024,"effs":512,"kws":160},"names":["들쥐","책벌레","은빛 신병","돌담 견습병","견습 검사","방패병","약초꾼","훈련 교관","빛나는 파수병","매의 눈 궁수","숲 늑대","화염 정령","부족의 주술사","수정 골렘","강철 파수대장","떠돌이 치유사","돌 골렘","용병대장","대지 정령","빛의 수호자","불사조","늙은 사자","벼락 마법사","시간의 마법사","서리 거인","폭풍 부르는 자","심판관","고대 용","고대의 수호룡","날쌘 척후병","대마법학자 롬메스","주문 직조사","회귀의 사서","유물 수집가","성소의 수습사제","명암의 사도","분열하는 점액","요그사론","대마법 보호막","탈란지의 최후의 저항","냉혹한 겨울","치유의 빛","침묵","불꽃 화살","지식의 서","수호의 장벽","급습","처형","불의 비","첫 번째 불꽃","매서운 한파","눈보라","냉기 돌풍","신비술사의 고서","주머니 차원","주문술사의 흐름","비전 수호자","서리","복제","강화","회수","변이","번개","화염구","대폭발","주문 발견","피의 서약","불꽃 점괘","사냥개 떼","철벽 소집","혼돈의 주문서","고대의 축복","숲의 지원군","일식","금단의 과일","번개 개화","생물학 프로젝트","대지의 비늘","급속 성장","등산용 간식","키틴질 껍질","퇴비 만들기","새로운 경지","숲의 영혼","야생의 포효","휘둘러치기","줄이기","흉포한 울음소리","대지의 수호","덱 탐색","공중활강","육성","딱정벌레술","숨겨진 오아시스","영원의 불화살","아달의 수호자","시간대 수선","가시가 돋친 탈것","분파","저지해라!","아마라의 이야기","데자뷔","번개 폭풍","뒤틀린 황천","일거리가 있다던데","물 공급지","적자생존","야생의 선물","궁극의 역병","퍼져나가는 역병","톨비르 대적","신비한 양초맨","되감기","극한 반복","박학다식","마나 흡수","열광의 덱","점화","얼음 회오리","초신성","은하계 투영 구슬","왕의 축복","망자 되살리기","방부 의식","유령 출몰","빛폭탄","영혼의 절규","패거리","소멸","파괴의 정기","선조의 부름","용의자 줄 세우기","방패 올리기","태양샘","교도소 마나스톰","대마법사 안토니다스","속임수 토템","대마법사 바르고스","로데브","노움 쩝쩝이","흉측한 허물","흡혈","피의 역병","공기 누출","혈기술사","마우와 파우","그훈","분노의 여사제","신화의 공포","타락심장 심문관","고대의 공허 사냥개","원한 맺힌 소환사","가젯잔 경매인","비전 거인","엄폐","별 관측자","지저왕","지진발","하드로녹스","아비아나","티란투스","잊힌 왕 쿤","전장의 강령술사","소리치는 요들러","악성 공포물","어둠가시 바느질꾼","시체 폭발","피의 기록관 말라코르","거머리 어미 발토라","피의 소용돌이","시초자","왕궁정원사","뱀사육사","공허의 영혼","카인 선퓨리","강철나무 골렘","여름의 평화수호자","늘푸른 수사슴","재생의 드루이드","토이란투스","날개 달린 수호자","독사 떼","실탄 장전","성게 가시","사스퀙","골드린","왕 크루쉬","밴조사우루스","에메리스","불꽃꼬리 전사","주문사수","깊은물 기원사","바르덴 던그래스프","요그사론의 종복","진눈깨비 스케이터","시프","회색 현자 앵무새","대규모 변이","용소환사 알라나","화염용","불굴의 토레스","태양지기 타림","성기사 에드릭","안녕극단","정신의 창조술사","세데크 장막직공","영혼 채찍","생각 훔치기","정신 분열","천상의 정신","대주교 베네딕투스","암흑의 정수","그훈의 피","흑요석 석상","대규모 부활","무덤괴수","칼날 부채","타르막","얼굴 수집가","소냐 워터댄서","엘프 음악가","무역왕 갤리윅스","전력 질주","환영의 물약","오메가 조립 시설","겁에 질린 조합원","용의 포효","대장군 분","앙심","다리우스 크롤리","대지조각가 이프","토르톨라","문제아","두억시니","해일","걸어 다니는 샘","눈사태 수호자","퇴화","불안정한 진화","깊은무쇠 트로그","교단 수련사","보석 박힌 딱정벌레","비겁한 밀고자","안녕로봇","데스윙","광염의 피락","해방된 분노 이샤라즈","허기진 포식자","부상당한 크발디르","부정한 알","불안정한 프로토타입","검 제작의 대가","공작 켈레세스","곰팡이술사","깔깔대는 발명가","기사대장","누더기골렘","공격대장","공중급수체","나무정령","지하군주","마력 깃든 까마귀","부화장 도우미","비명익룡 알","엘룬의 예언자","오늘의 월척","브롤 베어맨틀","그물거미","여명회 파수병","채광 사상자","평등","대사제 데칼","병력 소집","신의 은총","거품로봇","창심장 파수병","부두 토템","거대한 토템 아이스오르","불꽃의 토템","물 공급 토템","스테레오 토템","죄악석 토템","토템 골렘","돌장인","칼바람 폭풍소환사","바람의 군주 알아키르"],"effs":["adalGuardian","airLeak","amaraTale","ancestors","arcaneGuardian","arcaneTome","armorCry","ascend","blizzard","bloodDiscover","bloodDrain","bloodPlague","bloodSip","bloom","bolt","buff","carapace","chaos","choice","cleave","coldFront","compost","copy","cover","crystal","damage","damageDiscover","deckDiscover","destroyAll","discover","draw","eclipse","enemySweepDraw","enhance","essence","eternalBolt","execute","firstFlame","forestSoul","freeze","frenzyDeck","frostbite","fruit","furyCry","gainMana","galaxyOrb","gang","giveShield","glide","grantBuff","growth","guardian","handDiscover","haste","heal","healHoly","holdLine","iceTornado","ignite","kuhn","learned","leechSummon","lightBomb","lineUp","loopDiscover","manaDrain","manastorm","massDeathSummonCost","massElusive","massEnhance","muster","pocketDimension","rain","raiseDead","raiseShield","recall","recastLog","recycle","replayOne","resurrect","revealSummon","rewind","roar","scale","scatter","seedDeck","shrink","silence","snack","soulScream","spellFlow","spellTax","splitCopy","spreadPlague","summon","sunwell","supernova","survival","sweep","tauntDiscover","thornMount","timeMend","transform","ultPlague","vanishAll","wildGift","wipe","yogg","adjBuffCry","alana","avalancheFreeze","benedictus","bloodVortex","bubbleCry","bulletLoad","comboDraw","copyDragons","corpseBlast","crystalBuff","darkEssence","deathwing","decalCry","deckBuff","devolve","devour","discoverCost","divineFavor","divineSpirit","doubleHand","dragonRoar","drawSpellArmor","edric","equality","faceCollector","fanKnives","frostWarden","grudge","hatchCry","illusionPotion","machinesCry","malakor","massRaise","massTransform","mindBlast","mindCopy","mindSteal","natureCast","omegaFacility","originator","parrot","peaceDraw","pyroar","repeatAll","repeatLast","selfHurt","shieldCry","sleetFreeze","snitch","soulWhip","spellHunt","spellPoison","spiritsCry","stoneCry","stormCry","tarim","tarmak","tauntDiscoverBc","upgradeMinion","valtora","voidSoul","wormCry","yodel"],"kws":["shield","taunt","charge","revive","rush","deathCopy","deathGain","onAttackCopy","lifeCost","twin","overload","lifesteal","dynCost","onSpellFireball","endCast","elusive","endRecast","endAttack","leechBoost","endCorpses","startSpend","endScatter","endBait","spellAura","endSteal","onSpellDraw","spellburst","deathArmor","deathBuffAll","deathGrave","costOne","stealth","stealthTemp","poison","wfUsed","tempAtk","shieldHits","echoTemp","isMini","hatchLeft","infect","endRaise","endCopy","endLotus","endViper","ignoreTaunt","needArmor","reviveFull","hunter","beastDouble","onAttackBeast","onSpellScatter","endCastMin","mini","spellDmgSchools","shieldAura","deathMachines","spellWeave","endDeckCopy","deathKill","echo","sonya","gally","crowley","endArmorSummon","tortola","endBully","windfury","trogg","fireImmune","endDeckSummon","infuse","eggChicken","deathProto","endSword","deathAdjBuff","deathAoe","atkAura","deathSummon","lordGrow","deathPtero","pteroEgg","copyLow","fishHeal","onSpellBeast","deathBeast","endSpellGain","endTotemBuff","adjAtkAura","endAdjBuff","endHandBuff","endSelfHp"],"struct":["type","name","cost","atk","hp","maxHp","effect","school","runes","rc","tribe","rarity","id"]};
  const ALIASES = {};
  let REG = REG0, regSource = '내장';
  const ACTION_TYPES = ['END_TURN', 'PLAY_CARD', 'ATTACK', 'CHOOSE', 'TARGET', 'HERO_ATTACK'];
  const TK = { NONE: 0, HERO_ME: 1, HERO_OPP: 2, MINION_ME: 3, MINION_OPP: 4, HAND: 5 }, N_TK = 6;
  const GRP = { HAND: 0, MY_BOARD: 1, OPP_BOARD: 2, OTHER: 3 };
  const F0 = 24, G_TOTAL = 48;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const r4 = v => Math.round(v * 1e4) / 1e4;

  function sha1hex(str) {
    const bytes = new TextEncoder().encode(str), l = bytes.length, nb = (((l + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(nb); buf.set(bytes); buf[l] = 0x80;
    const dv = new DataView(buf.buffer); dv.setUint32(nb - 8, Math.floor(l * 8 / 4294967296)); dv.setUint32(nb - 4, (l * 8) >>> 0);
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0; const w = new Uint32Array(80);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = ((x << 1) | (x >>> 31)) >>> 0; }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; } else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; } else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const t = ((((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0); e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('');
  }
  const prefixHash = (reg, counts) => sha1hex(JSON.stringify([reg.names.slice(0, counts.names), reg.effs.slice(0, counts.effs), reg.kws.slice(0, counts.kws)])).slice(0, 16);

  function makeFeaturizer(reg) {
    const caps = reg.caps, aliases = ALIASES;
    const nameId = new Map(reg.names.map((n, i) => [n, i + 1]));
    const effId = new Map(reg.effs.map((t, i) => [t, i + 1]));
    const kws = reg.kws, struct = new Set(reg.struct || []), kwSet = new Set(kws);
    const idOfName = n => nameId.get(aliases[n] || n) || 0;
    const miss = new Set();
    for (const c of CARD_POOL) {
      if (!aliases[c.name] && !nameId.has(c.name)) miss.add(c.name);
      const et = c.effect && c.effect.type; if (et && !effId.has(et)) miss.add(et);
      for (const k of Object.keys(c)) if (c[k] && !struct.has(k) && !kwSet.has(k)) miss.add(k);
    }
    if (miss.size) throw new Error(`번호표에 없는 카드/효과/키워드가 있습니다 (${[...miss].slice(0, 5).join(', ')} ...). 학습 쪽에서 node tools\\update_registry.js 를 실행한 card_registry.json 을 불러오세요.`);
    const DEATH = ['deathCopy', 'deathGain', 'deathArmor', 'deathBuffAll', 'deathGrave'];
    const TRIG = ['spellburst', 'spellAura', 'onSpellDraw', 'onSpellFireball', 'endCast', 'endRecast', 'endAttack', 'endCorpses', 'endScatter', 'endBait', 'endSteal', 'startSpend', 'leechBoost', 'rc', 'runes'];
    function entity(c) {
      const e = c.effect;
      const x = [num(c.cost) / 10, num(c.atk) / 10, num(c.hp) / 10, num(c.maxHp) / 10, c.type === 'minion' ? 1 : 0, c.type === 'spell' ? 1 : 0,
        c.shield ? 1 : 0, c.taunt ? 1 : 0, c.charge ? 1 : 0, c.rush ? 1 : 0, c.lifesteal ? 1 : 0, c.elusive ? 1 : 0, c.revive ? 1 : 0,
        DEATH.some(k => c[k]) ? 1 : 0, c.onAttackCopy ? 1 : 0, c.twin ? 1 : 0, num(c.overload) / 5, num(c.lifeCost) / 5, e ? num(e.value) / 10 : 0,
        c.attacked ? 1 : 0, c.summoned ? 1 : 0, c.frozen ? 1 : 0, c.dynCost ? 1 : 0, TRIG.some(k => c[k]) ? 1 : 0];
      const kw = [];
      for (let s = 0; s < kws.length; s++) { const v = c[kws[s]]; if (!v) continue; kw.push([s, typeof v === 'number' ? Math.max(-1, Math.min(1, v / 5)) : 1]); }
      return { nm: idOfName(c.name), ef: (e && effId.get(e.type)) || 0, x, kw };
    }
    function globalVec(view) {
      const me = view.me, op = view.opp, p = view.pending;
      const g = [me.hp / 30, num(me.armor) / 20, num(me.mana) / 10, num(me.maxMana) / 10, me.hand.length / 10, num(me.deckCount) / 30, num(me.heroAtk) / 10, me.heroAttacked ? 1 : 0,
        num(me.fatigue) / 5, num(me.corpses) / 10, num(me.overloadNext) / 5, num(me.locked) / 5, me.board.length / 7, (me.grave ? me.grave.length : 0) / 10, me.eclipse ? 1 : 0, num(me.spellTax) / 5,
        op.hp / 30, num(op.armor) / 20, num(op.mana) / 10, num(op.maxMana) / 10, num(op.handCount) / 10, num(op.deckCount) / 30, num(op.heroAtk) / 10, num(op.fatigue) / 5,
        num(op.corpses) / 10, op.board.length / 7, op.eclipse ? 1 : 0, Math.min(view.turnNo, 60) / 60, view.first === view.seat ? 1 : 0,
        p && p.kind === 'discover' ? 1 : 0, p && p.kind === 'target' ? 1 : 0, view.legal.length / 30,
        p && p.kind === 'choice' ? 1 : 0, p && p.kind === 'pocketDimension' ? 1 : 0, p && p.kind === 'fruit' ? 1 : 0];
      while (g.length < G_TOTAL) g.push(0);
      return g.map(r4);
    }
    function encode(view) {
      const ents = [], grp = [], hand = new Map(), mine = new Map(), theirs = new Map();
      const add = (c, g, map) => { if (map && c.id != null) map.set(c.id, ents.length); ents.push(entity(c)); grp.push(g); return ents.length - 1; };
      for (const c of view.me.hand) add(c, GRP.HAND, hand);
      for (const c of view.me.board) add(c, GRP.MY_BOARD, mine);
      for (const c of view.opp.board) add(c, GRP.OPP_BOARD, theirs);
      const p = view.pending;
      const optIdx = p && p.options ? p.options.map(c => add(c, GRP.OTHER, null)) : [];
      const pendCard = p && p.card ? add(p.card, GRP.OTHER, null) : -1;
      const at = [], src = [], tgt = [], tk = [], seat = view.seat;
      const tgtOf = t => {
        if (!t) return [-1, TK.NONE];
        if (t.kind === 'hero') return [-1, t.seat === seat ? TK.HERO_ME : TK.HERO_OPP];
        if (t.kind === 'minion') { if (t.seat === seat) return [mine.has(t.id) ? mine.get(t.id) : -1, TK.MINION_ME]; return [theirs.has(t.id) ? theirs.get(t.id) : -1, TK.MINION_OPP]; }
        if (t.kind === 'hand') return [t.seat === seat && hand.has(t.id) ? hand.get(t.id) : -1, TK.HAND];
        return [-1, TK.NONE];
      };
      for (const l of view.legal) {
        const ti = Math.max(0, ACTION_TYPES.indexOf(l.type)); let s = -1;
        if (l.type === 'PLAY_CARD') s = hand.has(l.cardId) ? hand.get(l.cardId) : -1;
        else if (l.type === 'ATTACK') s = mine.has(l.attackerId) ? mine.get(l.attackerId) : -1;
        else if (l.type === 'CHOOSE') s = optIdx[l.index] != null ? optIdx[l.index] : -1;
        else if (l.type === 'TARGET') s = pendCard;
        const [t, k] = tgtOf(l.target); at.push(ti); src.push(s); tgt.push(t); tk.push(k);
      }
      return { g: globalVec(view), nm: ents.map(e => e.nm), ef: ents.map(e => e.ef), ents, grp, at, src, tgt, tk };
    }
    const F = F0 + caps.kws;
    function encodeDense(view) {
      const o = encode(view), n = o.nm.length, dense = new Float64Array(n * F);
      o.ents.forEach((e, i) => { for (let j = 0; j < F0; j++) dense[i * F + j] = r4(e.x[j]); for (const [s, v] of e.kw) dense[i * F + F0 + s] = r4(v); });
      return { ...o, x: dense };
    }
    const counts = { names: reg.names.length, effs: reg.effs.length, kws: reg.kws.length };
    const meta = { F, F0, G: G_TOTAL, nameCount: caps.names, effCount: caps.effs, nTypes: ACTION_TYPES.length, nTk: N_TK, fmt: 'v2' };
    function compat(m) {
      for (const k of ['F', 'F0', 'G', 'nameCount', 'effCount', 'nTypes', 'nTk']) if (m[k] !== meta[k]) return `모델의 ${k}(${m[k]})가 이 게임 설정(${meta[k]})과 다릅니다`;
      const r = m.reg; if (!r) return '번호표 정보가 없는 모델입니다';
      if (r.names > counts.names || r.effs > counts.effs || r.kws > counts.kws) return '모델이 지금 번호표보다 더 많은 항목을 알고 있습니다 (번호표 파일이 다릅니다 — 학습 쪽 card_registry.json 을 불러오세요)';
      if (prefixHash(reg, r) !== r.hash) return '번호표 앞부분이 모델 학습 때와 다릅니다 (학습 쪽 card_registry.json 을 불러오세요)';
      return null;
    }
    return { encode, encodeDense, meta, compat };
  }

  function loadNet(j) {
    const T = {}; for (const k in j.tensors) T[k] = Float64Array.from(j.tensors[k]);
    const m = j.meta, { D, S, A, Q, H, NE, EE } = j.dims, F = m.F, G = m.G;
    const relu = a => { for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0; return a; };
    const linear = (x, W, b, outD, inD) => { const y = new Float64Array(outD); for (let o = 0; o < outD; o++) { let s = b[o]; const base = o * inD; for (let i = 0; i < inD; i++) s += W[base + i] * x[i]; y[o] = s; } return y; };
    function encodeEnt(nm, ef, x, off) {
      const inp = new Float64Array(F + NE + EE);
      for (let i = 0; i < F; i++) inp[i] = x[off + i];
      const a = T['name_emb.weight'], b = T['eff_emb.weight'];
      for (let i = 0; i < NE; i++) inp[F + i] = a[nm * NE + i];
      for (let i = 0; i < EE; i++) inp[F + NE + i] = b[ef * EE + i];
      return relu(linear(relu(linear(inp, T['ent1.weight'], T['ent1.bias'], D, F + NE + EE)), T['ent2.weight'], T['ent2.bias'], D, D));
    }
    function scores(o) {
      const n = o.nm.length, enc = [];
      for (let i = 0; i < n; i++) enc.push(encodeEnt(o.nm[i], o.ef[i], o.x, i * F));
      const pools = [new Float64Array(D), new Float64Array(D), new Float64Array(D)];
      for (let i = 0; i < n; i++) { const g = o.grp[i]; if (g >= 0 && g < 3) for (let d = 0; d < D; d++) pools[g][d] += enc[i][d] / 5; }
      const sin = new Float64Array(G + 3 * D);
      for (let i = 0; i < G; i++) sin[i] = o.g[i];
      for (let g = 0; g < 3; g++) for (let d = 0; d < D; d++) sin[G + g * D + d] = pools[g][d];
      const s = relu(linear(relu(linear(sin, T['st1.weight'], T['st1.bias'], H, G + 3 * D)), T['st2.weight'], T['st2.bias'], S, H));
      const out = [];
      for (let k = 0; k < o.at.length; k++) {
        const ain = new Float64Array(m.nTypes + m.nTk + 2 * D);
        ain[o.at[k]] = 1; ain[m.nTypes + o.tk[k]] = 1;
        if (o.src[k] >= 0) for (let d = 0; d < D; d++) ain[m.nTypes + m.nTk + d] = enc[o.src[k]][d];
        if (o.tgt[k] >= 0) for (let d = 0; d < D; d++) ain[m.nTypes + m.nTk + D + d] = enc[o.tgt[k]][d];
        const a = relu(linear(ain, T['act1.weight'], T['act1.bias'], A, m.nTypes + m.nTk + 2 * D));
        const qin = new Float64Array(S + A); qin.set(s, 0); qin.set(a, S);
        out.push(linear(relu(linear(qin, T['q1.weight'], T['q1.bias'], Q, S + A)), T['q2.weight'], T['q2.bias'], 1, Q)[0]);
      }
      return out;
    }
    return { scores };
  }

  let fzCache = null;
  const featurizer = () => (fzCache && fzCache.reg === REG) ? fzCache.fz : (fzCache = { reg: REG, fz: makeFeaturizer(REG) }).fz;
  // 모델 JSON → 봇. 호환되지 않으면 이유를 담은 Error 를 던진다.
  function make(j) {
    if (!j || !j.meta || !j.tensors || !j.dims) throw new Error('모델 파일 형식이 아닙니다 (학습이 저장한 model.json / best.json 이어야 합니다)');
    if (j.meta.fmt !== 'v2') throw new Error('번호표 방식(v2) 모델이 아닙니다. 옛 v89 형식 모델은 python train\\migrate.py 로 옮긴 모델을 쓰세요');
    const FZ = featurizer(), why = FZ.compat(j.meta); if (why) throw new Error(why);
    const net = loadNet(j);
    return {
      info: j.info || {},
      decide(view) {
        if (!view.legal || !view.legal.length) return { type: 'END_TURN' };
        try {
          const q = net.scores(FZ.encodeDense(view)); let best = 0;
          for (let i = 1; i < q.length; i++) if (q[i] > q[best]) best = i;
          return view.legal[best];
        } catch (e) { console.warn('모델 추론 오류 → 중급2 규칙으로 대체', e); return BotPlayers.rule2.decide(view); }
      },
    };
  }
  function setRegistry(r, label) {
    if (!r || !Array.isArray(r.names) || !Array.isArray(r.effs) || !Array.isArray(r.kws) || !r.caps) throw new Error('card_registry.json 형식이 아닙니다');
    makeFeaturizer(r);               // 이 게임의 카드가 다 들어 있는지 확인 (없으면 Error)
    REG = r; regSource = label || '불러옴';
  }
  const regInfo = () => `번호표(${regSource}): 카드 ${REG.names.length} · 효과 ${REG.effs.length} · 키워드 ${REG.kws.length}`;
  return { make, setRegistry, regInfo, sha1hex, _featurizer: featurizer };
})();
window.makePolicyBot = j => PolicyNet.make(j);

// ---- 모델 파일 보관 (IndexedDB: 이 브라우저에만. 배포할 때는 모델 JSON 을 HTML 옆에 두고 보스의 모델 이름을 그 경로로 적는다) ----
const ModelStore = (() => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('cardDuelModels', 1); r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const tx = db.transaction('m', mode); const rq = fn(tx.objectStore('m')); tx.oncomplete = () => res(rq && rq.result); tx.onerror = () => rej(tx.error); }); };
  return {
    get: k => run('readonly', s => s.get(k)).catch(() => null),
    put: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => null),
    del: k => run('readwrite', s => s.delete(k)).catch(() => null),
  };
})();
ModelStore.get('registry').then(t => { if (t) { try { PolicyNet.setRegistry(JSON.parse(t), '불러옴'); } catch (e) { console.warn('저장된 번호표 사용 안 함:', e.message); } } });

// ---- 개발자: 보스 저장 상태 표시 (저장은 ServerStore 가 서버로 보낸다) ----
function bossEditRefresh(){ if(document.getElementById('screen-bossedit').classList.contains('show')) openBossEdit(); }
ServerStore.onBossMsg=m=>{ const el=document.getElementById('bossFileStat'); if(el) el.textContent=m; };

// ---- 보스 AI: 중급 = 규칙 봇 / 상급 = 학습 모델 ----
// 모델 찾는 순서: ① 이미 불러온 것 ② 이 브라우저에 넣어 둔 파일(편집 화면에서 선택) ③ boss.model 주소에서 fetch (서버로 열었을 때)
// 어느 것도 안 되면 중급2 규칙 봇으로 대신 싸운다 (로그에 이유를 표시).
window.BossModelBots = window.BossModelBots || {};
async function loadBossModel(key){
  if(window.BossModelBots[key]) return window.BossModelBots[key];
  let text=await ModelStore.get('model:'+key), from='이 브라우저에 저장된 파일';
  if(!text && /^https?:/.test(location.protocol)){
    try{ const r=await fetch(key,{cache:'no-store'}); if(r.ok){ text=await r.text(); from='서버 파일'; } }catch(e){}
  }
  if(!text) throw new Error(`모델 파일 '${key}' 을(를) 찾지 못했습니다`);
  const bot=PolicyNet.make(JSON.parse(text)); bot.from=from; window.BossModelBots[key]=bot; return bot;
}
async function resolveBossBot(boss){
  if(boss.tier!=='high') return {bot:boss.bot==='rule'?BotPlayers.rule:BotPlayers.rule2, note:''};
  if(!boss.model) return {bot:BotPlayers.rule2, note:'⚠ 이 상급 보스에 모델이 지정되지 않아 중급2 AI로 대신합니다'};
  try{ const bot=await loadBossModel(boss.model); return {bot, note:''}; }
  catch(e){ console.warn(e); return {bot:BotPlayers.rule2, note:'⚠ 학습 모델을 쓰지 못해 중급2 AI로 대신합니다: '+e.message}; }
}

// ---- 모험 화면 ----
function deckBrief(deck){
  const cards=deck.map(n=>CARD_POOL.find(c=>c.name===n)).filter(Boolean);
  if(!cards.length) return '';
  const avg=(cards.reduce((a,c)=>a+c.cost,0)/cards.length).toFixed(1), sp=cards.filter(c=>c.type==='spell').length;
  return `평균 코스트 ${avg} · 주문 ${sp}장`;
}
const escHtml=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
let advTier='mid';
function openAdventure(rank){
  const all=BossBook.get(), box=$('bossList'); box.innerHTML='';
  const present=BOSS_RANKS.filter(([k])=>all.some(b=>bossRank(b)===k));
  if(rank) advTier=rank;
  if(!present.some(([k])=>k===advTier)) advTier=present.length?present[0][0]:'mid';
  const tabs=$('advTabs'); tabs.innerHTML='';
  present.forEach(([k,l])=>{
    const of=all.filter(b=>bossRank(b)===k), done=of.filter(b=>AdventureBook.has(b.id)).length;
    const t=document.createElement('button'); t.className=advTier===k?'on':''; t.textContent=`${l} ${done}/${of.length}`; if(advTier!==k) t.style.color=rankInfo(k)[2]; t.onclick=()=>openAdventure(k); tabs.appendChild(t);
  });
  all.forEach((b,i)=>{
    if(bossRank(b)!==advTier) return;
    const bad=BossBook.deckError(b);
    const chips=bossCheatList(b).map(c=>`<span class="chip" tabindex="0" data-tip="${escHtml(c.desc(cheatValue(c,0)))}">${c.icon||''} ${escHtml(c.name)}</span>`).join(' ');
    const btn=document.createElement('button'); btn.className='menu-btn boss-btn'; btn.disabled=!!bad;
    btn.innerHTML=`<span class="ic">${escHtml(b.icon)}</span><span class="bt">${AdventureBook.has(b.id)?'<span class="clr">✔ 클리어</span>':''}${escHtml(b.name)}<span class="desc">${escHtml(b.desc)}</span><span class="tags">${deckBrief(b.deck)} · 🏆 ${AdventureBook.has(b.id)?'재도전 +'+Math.max(1,Math.round(bossReward(b)*BOSS_REPEAT_RATIO)):'첫 클리어 +'+bossReward(b)}골드${bad?' · ⚠ 덱 오류':''}</span>${chips?`<span class="tags">${chips}</span>`:''}</span>`;
    btn.onclick=()=>startBoss(i);
    box.appendChild(btn);
  });
  showScreen('adventure');
}
async function startBoss(idx, opts={}){
  const boss=BossBook.get()[idx]; if(!boss || BossBook.deckError(boss)) return;
  const r=await resolveBossBot(boss);
  const d=DIFFICULTY.normal2;
  game={key:'adventure', mode:'adventure', boss, bossIdx:idx, devTest:!!opts.devTest, bet:0, tier:0, cheats:[], pool:0, settled:false, result:null, deckNames:DeckBook.get()};
  Bot=r.bot;
  Host.startBoss(boss, game.deckNames);
  view=Host.view(MY);
  ui.selected=null; ui.pending=null; ui.busy=false; stopArrow(); closeDeck(); resetSurrenderBtn();
  $('logList').innerHTML='';
  $('overlay').classList.remove('show');
  $('overlayReward').innerHTML='';
  document.querySelector('#aiHero .name').textContent=`${boss.icon} ${boss.name}`;
  const iFirst=Host.state.first===MY;
  $('verBadge').textContent=VERSION;
  $('diffBadge').textContent=`모험 · ${rankLabel(bossRank(boss))} · ${boss.name}${opts.devTest?' (시험)':''}`+(iFirst?' · 선공':' · 후공');
  $('menu').classList.add('hidden');
  updateWallet();
  logLine(`보스 ${boss.name} 등장! [${rankLabel(bossRank(boss))}] `+(iFirst?'당신이 선공입니다.':'보스가 선공입니다.'));
  if(bossCheatList(boss).length) logLine('⚠ 보스 특성: '+bossCheatList(boss).map(c=>`${c.name}(${c.desc(cheatValue(c,0))})`).join(' / '));
  if(r.note) logLine(r.note);
  beginMatch();
}

// ---- 개발자: 보스 목록 / 폼 ----
let bossDraft=null, bossDraftIdx=-1;
function bossListSave(list){ BossBook.set(list); }
function openBossEdit(){
  if(!isDev()) return;
  const list=BossBook.get(), box=$('bossEditList'); box.innerHTML='';
  list.forEach((b,i)=>{
    const row=document.createElement('div'); row.className='boss-row';
    const bad=BossBook.deckError(b);
    const main=document.createElement('button'); main.className='menu-btn boss-btn';
    main.innerHTML=`<span class="ic">${escHtml(b.icon)}</span><span class="bt">${escHtml(b.name)}<span class="desc">${rankTag(bossRank(b))}${b.tier==='high'?'모델: '+escHtml(b.model||'(미지정)'):b.bot==='rule2'?'중급2 규칙':'중급 규칙'} · ${deckBrief(b.deck)}${bad?' · ⚠ 덱 오류':''}</span></span>`;
    main.onclick=()=>openBossForm(i);
    const up=document.createElement('button'); up.className='mini'; up.textContent='▲'; up.disabled=i===0; up.onclick=()=>{ [list[i-1],list[i]]=[list[i],list[i-1]]; bossListSave(list); openBossEdit(); };
    const dn=document.createElement('button'); dn.className='mini'; dn.textContent='▼'; dn.disabled=i===list.length-1; dn.onclick=()=>{ [list[i+1],list[i]]=[list[i],list[i+1]]; bossListSave(list); openBossEdit(); };
    const del=document.createElement('button'); del.className='mini'; del.textContent='🗑'; del.disabled=list.length<=1;
    del.onclick=()=>{ if(!confirm(`'${b.name}' 보스를 삭제할까요?`)) return; list.splice(i,1); bossListSave(list); openBossEdit(); };
    row.append(main, up, dn, del); box.appendChild(row);
  });
  $('bossJsonBox').style.display='none'; $('regDesc').textContent=PolicyNet.regInfo()+' · 학습 쪽 번호표가 바뀌면 새 파일을 불러오세요';
  $('bossFileStat').textContent=ServerStore.bosses?'서버에 저장된 보스 목록을 편집 중입니다. 저장하면 모든 유저에게 바로 적용돼요.':'아직 서버에 저장된 목록이 없어 코드 기본값을 보여줍니다. 무엇이든 저장하면 이 목록이 서버에 올라가요.';
  showScreen('bossedit');
}
function bossAdd(){
  const list=BossBook.get(); let n=list.length+1; while(list.some(b=>b.id==='boss'+n)) n++;
  list.push({id:'boss'+n, name:'새 보스 '+n, icon:'👹', desc:'', cheats:[], reward:0, tier:'mid', bot:'rule2', model:'', deck:defaultDeckList()});
  bossListSave(list); openBossForm(list.length-1);
}
function openBossForm(i){
  const list=BossBook.get(); if(!list[i]) return openBossEdit();
  bossDraftIdx=i; bossDraft=JSON.parse(JSON.stringify(list[i]));
  $('bfTitle').textContent=`보스 설정 — ${bossDraft.id}`;
  $('bfName').value=bossDraft.name; $('bfIcon').value=bossDraft.icon; $('bfDesc').value=bossDraft.desc;
  buildCheatChecks(); $('bfReward').value=bossDraft.reward||0; $('bfTier').value=bossDraft.tier; $('bfBot').value=bossDraft.bot==='rule'?'rule':'rule2'; $('bfModel').value=bossDraft.model;
  refreshBossForm(); showScreen('bossform');
}
function readBossForm(){
  bossDraft.name=$('bfName').value.trim()||'이름 없음'; bossDraft.icon=$('bfIcon').value.trim()||'👹'; bossDraft.desc=$('bfDesc').value.trim();
  bossDraft.reward=Math.max(0,Math.floor(Number($('bfReward').value)||0)); bossDraft.cheats=[...document.querySelectorAll('#bfCheats input:checked')].map(i=>i.value); bossDraft.tier=$('bfTier').value; bossDraft.bot=bossDraft.tier==='high'?'model':$('bfBot').value; bossDraft.model=$('bfModel').value.trim();
}
function buildCheatChecks(){
  const box=$('bfCheats'); box.innerHTML='';
  CHEATS.forEach(c=>{
    const l=document.createElement('label');
    l.innerHTML=`<input type="checkbox" value="${c.id}"${(bossDraft.cheats||[]).includes(c.id)?' checked':''}><span><b>${c.icon||''} ${escHtml(c.name)}</b><small>${escHtml(c.desc(cheatValue(c,0)))}</small></span>`;
    l.querySelector('input').addEventListener('change', ()=>{ readBossForm(); refreshBossForm(); });
    box.appendChild(l);
  });
}
function refreshBossForm(){
  if(!bossDraft) return;
  const cl=bossCheatList(bossDraft), groups={}; cl.forEach(c=>{ if(c.group) (groups[c.group]=groups[c.group]||[]).push(c.name); });
  const dup=Object.values(groups).filter(a=>a.length>1).map(a=>a.join('+'));
  $('bfReward').placeholder=`기본 ${rankInfo(bossRank(bossDraft))[3]}`;
  $('bfRank').textContent=`현재 등급: ${rankLabel(bossRank(bossDraft))} (치트 ${cl.length}개) · 첫 클리어 보상 ${bossReward(bossDraft)}골드`+(dup.length?` · ⚠ 같은 계열을 함께 골랐습니다: ${dup.join(', ')} (일반 판에서는 하나만 뽑는 조합이라 매우 셀 수 있음)`:'');
  const err=validateDeckList(bossDraft.deck);
  $('bfDeckDesc').textContent=`${bossDraft.deck.length}장 · ${deckBrief(bossDraft.deck)}${err?' · ⚠ '+err:''}`;
  const high=$('bfTier').value==='high';
  $('bfMidBox').style.display=high?'none':''; $('bfHighBox').style.display=high?'':'none';
  if(high) refreshModelStat();
}
async function refreshModelStat(){
  const key=$('bfModel').value.trim(), el=$('bfModelStat');
  if(!key){ el.textContent='모델 파일이 지정되지 않았습니다.'; return; }
  const text=await ModelStore.get('model:'+key);
  if(!text){ el.textContent=`'${key}' 은(는) 이 브라우저에 없습니다. (서버로 열면 같은 이름의 파일을 직접 불러옵니다)`; return; }
  try{ const bot=PolicyNet.make(JSON.parse(text)), i=bot.info||{}; const wr=i.winrate?Object.entries(i.winrate).map(([k,v])=>`${k} ${Math.round(v*100)}%`).join(' · '):'';
    el.textContent=`✔ 사용 가능 · ${i.algo||'?'} ${i.games||'?'}판${wr?' · 평가 승률 '+wr:''}`; }
  catch(e){ el.textContent='⚠ '+e.message; }
}
$('bfModel').addEventListener('input', ()=>{ clearTimeout(window.__bms); window.__bms=setTimeout(refreshModelStat,300); });
$('bfModelFile').addEventListener('change', async ev=>{
  const f=ev.target.files[0]; ev.target.value=''; if(!f) return;
  const el=$('bfModelStat'); el.textContent='불러오는 중…';
  try{
    const text=await f.text(), j=JSON.parse(text); PolicyNet.make(j);          // 호환 검사: 안 맞으면 여기서 Error
    await ModelStore.put('model:'+f.name, text); delete window.BossModelBots[f.name];
    $('bfModel').value=f.name; readBossForm(); bossFormSave(true); refreshBossForm();
  }catch(e){ el.textContent='⚠ 사용할 수 없는 모델입니다: '+e.message; }
});
async function bossLoadRegistry(file){
  const el=$('bossFileStat');
  try{ const r=JSON.parse(await file.text()); PolicyNet.setRegistry(r,'불러옴'); await ModelStore.put('registry', JSON.stringify(r)); window.BossModelBots={}; el.textContent='✔ '+PolicyNet.regInfo(); }
  catch(e){ el.textContent='⚠ 번호표를 쓸 수 없습니다: '+e.message; }
}
$('bfBot').addEventListener('change', refreshBossForm); $('bfTier').addEventListener('change', refreshBossForm);
function bossFormSave(quiet){
  readBossForm();
  const list=BossBook.get(); list[bossDraftIdx]=BossBook.clean(bossDraft); bossListSave(list);
  if(quiet!==true) openBossEdit();
}
function bossFormBack(){ openBossEdit(); }
function bossFormDeck(){
  readBossForm();
  ed.test=false; ed.boss=true; ed.bossName=bossDraft.name; $('edClear').style.display=''; ed.counts=countsOf(bossDraft.deck);
  renderDeckEditor(); $('deckEditor').classList.add('show');
}
function bossDeckSaved(list){ bossDraft.deck=list; closeDeckEditor(); bossFormSave(true); refreshBossForm(); }
function bossFormTest(){
  bossFormSave(true);
  if(BossBook.deckError(bossDraft)){ alert('덱이 규칙에 맞지 않습니다: '+BossBook.deckError(bossDraft)); return; }
  startBoss(bossDraftIdx, {devTest:true});
}
function bossExport(){
  const list=BossBook.get(), ta=$('bossJson');
  ta.value=BossBook.toJson(list); $('bossJsonBox').style.display='flex';
  ta.select(); let copied=false; try{ copied=document.execCommand('copy'); }catch(e){}
  $('bossJsonMsg').textContent=(copied?'클립보드에 복사했습니다. ':'')+'백업용으로 보관하세요. (가져오기로 다시 붙여 넣을 수 있어요)';
}
function bossImport(){
  const box=$('bossJsonBox'), ta=$('bossJson');
  if(box.style.display==='none'){ box.style.display='flex'; ta.value=''; $('bossJsonMsg').textContent='JSON 을 붙여 넣고 [가져오기] 를 한 번 더 누르세요.'; return; }
  try{
    const v=JSON.parse(ta.value); if(!BossBook.ok(v)) throw new Error('보스 배열(id 필수) 형식이 아닙니다');
    BossBook.set(v); openBossEdit();
  }catch(e){ $('bossJsonMsg').textContent='⚠ 가져오기 실패: '+e.message; }
}
function bossResetAll(){ if(!confirm('서버에 저장된 보스 목록을 지우고 코드의 기본값(BOSS_DEFAULT)으로 되돌릴까요? 모든 유저에게 적용됩니다.')) return; BossBook.reset(); openBossEdit(); }
if(isDev()) $('btnBossEdit').style.display='';
if(isDev()) $('btnTest').style.display='';

// ---------- 5단계: 상점 · 팩 개봉 ----------
// 난수·골드 차감·카드 지급은 전부 서버(/api/shop/open)가 한다. 여기서는 확률표를 보여 주고, 서버가 준 결과를 연출만 한다.
let shopInfo=null, shopWorking=false;
const RAR_CLASS = r => 'r'+RARITY_ORDER.indexOf(r);
const cardByName = (()=>{ let m=null; return n=>{ if(!m){ m=new Map(); CARD_POOL.forEach(c=>m.set(c.name,c)); } return m.get(n); }; })();
function shopCost(n){ return SHOP.PACK_PRICE*n; }
function renderShop(){
  const info=shopInfo, gold=Economy.get().gold;
  $('shopGold').textContent=`💰 ${fmt(gold)}`;
  $('shopPackSize').textContent=`${SHOP.PACK_SIZE}장`;
  $('shopSub').textContent=`1팩 ${fmt(SHOP.PACK_PRICE)}골드 · 카드 ${SHOP.PACK_SIZE}장 · ${SHOP.GUARANTEE_MIN} 이상 1장 보장`;
  // 등급별 확률 · 내 수집 현황 · 중복 환급
  const box=$('shopRates'); box.innerHTML='';
  SHOP_RARITIES.forEach(r=>{
    const all=CARD_POOL.filter(c=>c.rarity===r), have=all.filter(c=>ServerStore.owned(c.name)>0).length;
    const row=document.createElement('div'); row.className='shop-rate';
    const nm=document.createElement('span'); nm.className='ed-rar r-'+RARITY_ORDER.indexOf(r); nm.textContent=r;
    const pc=document.createElement('span'); pc.className='sr-pc'; pc.textContent=`${shopRatePercent(r)}%`;
    const own=document.createElement('span'); own.className='sr-own'; own.textContent=`수집 ${have}/${all.length}`;
    const rf=document.createElement('span'); rf.className='sr-rf'; rf.textContent=`중복 +${SHOP.REFUND[r]}💰`;
    row.append(nm,pc,own,rf); box.appendChild(row);
  });
  const left=info?info.pity.left:null;
  $('shopPityEpic').textContent=left?(left.epic<=1?'다음 팩 확정!':`${left.epic}팩`):'…';
  $('shopPityLegend').textContent=left?(left.legend<=1?'다음 팩 확정!':`${left.legend}팩`):'…';
  $('shopDupNote').textContent=`같은 카드를 ${SHOP.DUP_CAP}장 가지면 그다음부터 나온 카드는 카드 대신 골드로 환급됩니다. 천장은 특급 이상 ${SHOP.PITY_EPIC}팩 · 전설 ${SHOP.PITY_LEGEND}팩 연속으로 안 나오면 다음 팩에 확정입니다.`;
  [[1,'shopBuy1'],[5,'shopBuy5']].forEach(([n,id])=>{
    const b=$(id); b.textContent=`${n}팩 열기 · ${fmt(shopCost(n))}골드`; b.disabled=shopWorking||gold<shopCost(n)||!info;
  });
}
function renderShopHistory(){
  const box=$('shopHistory'); box.innerHTML='';
  const list=(shopInfo&&shopInfo.history)||[];
  if(!list.length){ box.textContent='아직 연 팩이 없어요.'; return; }
  list.forEach(h=>{
    const row=document.createElement('div'); row.className='sh-row';
    const t=document.createElement('div'); t.className='sh-t'; const d=new Date(h.openedAt);
    t.textContent=`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`+(h.refund?` · 환급 +${h.refund}💰`:'')+(h.pityHit?' · 천장 확정':'');
    row.appendChild(t);
    const cs=document.createElement('div'); cs.className='sh-c';
    h.cards.forEach(c=>{ const s=document.createElement('span'); s.className='sh-chip r'+RARITY_ORDER.indexOf(c.rarity)+(c.dup?' dup':''); s.textContent=(c.dup?'♻ ':c.isNew?'✨ ':'')+c.name; cs.appendChild(s); });
    row.appendChild(cs); box.appendChild(row);
  });
}
function toggleShopHistory(){ const b=$('shopHistory'); b.style.display=b.style.display==='none'?'':'none'; if(b.style.display==='') renderShopHistory(); }
async function openShop(){
  $('shopMsg').textContent=''; $('shopHistory').style.display='none';
  shopInfo=null; renderShop(); showScreen('shop');                 // 먼저 화면을 보여 주고, 서버 정보(천장 진행도·기록)는 도착하면 채운다
  const info=await ServerStore.loadShop();
  if(!info){ $('shopMsg').textContent='⚠ 상점 정보를 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.'; return; }
  shopInfo=info; renderShop();
}
async function shopBuy(count){
  if(shopWorking) return;
  shopWorking=true; $('shopMsg').textContent=''; renderShop();
  const r=await ServerStore.openPacks(count);
  shopWorking=false; updateWallet();
  if(!r.ok){ $('shopMsg').textContent='⚠ '+r.error; renderShop(); return; }
  shopInfo={...shopInfo, pity:r.pity, opened:r.opened};
  playPacks(r);
}

// ---- 개봉 연출 ----
// 팩을 탭 → 흔들림 → 카드 뒷면 N장 → 카드를 탭해 한 장씩 뒤집기 (낮은 등급부터, 가장 좋은 카드가 마지막)
let pk=null;
function playPacks(r){
  pk={r, i:0, flipped:0, total:0};
  $('packModal').classList.add('show'); showPack();
}
function showPack(){
  const p=pk.r.packs[pk.i], n=pk.r.packs.length;
  $('pkTitle').textContent=n>1?`팩 ${pk.i+1} / ${n}`:'카드 팩';
  $('pkInfo').textContent=''; $('pkNext').style.display='none'; $('pkFlipAll').style.display='none';
  const modal=$('packModal'); modal.classList.remove('flash0','flash1','flash2','flash3');
  const stage=$('pkStage'); stage.innerHTML='';
  const pack=document.createElement('button'); pack.className='pk-pack'; pack.type='button';
  pack.innerHTML='<i>✦</i><b>카드 팩</b><small>탭해서 열기</small>';
  pack.onclick=()=>{
    pack.disabled=true; pack.classList.add('opening');
    setTimeout(()=>revealSlots(p), 750);
  };
  stage.appendChild(pack); pack.focus();
}
function revealSlots(p){
  const stage=$('pkStage'); stage.innerHTML=''; pk.flipped=0;
  const row=document.createElement('div'); row.className='pk-row'; stage.appendChild(row);
  p.cards.forEach((c,i)=>{
    const slot=document.createElement('div'); slot.className='pk-slot '+RAR_CLASS(c.rarity); slot.tabIndex=0; slot.setAttribute('role','button'); slot.dataset.i=i;
    slot.style.setProperty('--d',(i*90)+'ms');
    const flip=document.createElement('div'); flip.className='pk-flip';
    const back=document.createElement('div'); back.className='pk-face pk-back'; back.textContent='✦';
    const front=document.createElement('div'); front.className='pk-face pk-front';
    const def=cardByName(c.name); if(def) front.appendChild(cardEl(def,{}));
    flip.append(back,front); slot.appendChild(flip);
    const tag=document.createElement('div'); tag.className='pk-tag';
    tag.innerHTML=`<span class="ed-rar r-${RARITY_ORDER.indexOf(c.rarity)}"></span><em></em>`;
    tag.firstChild.textContent=c.rarity;
    tag.lastChild.textContent=c.dup?`중복 +${c.refund}💰`:(c.isNew?'NEW':'');
    tag.lastChild.className=c.dup?'dup':'new';
    slot.appendChild(tag);
    const doFlip=()=>flipSlot(slot,c,p);
    slot.onclick=doFlip; slot.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); doFlip(); } };
    row.appendChild(slot);
  });
  $('pkInfo').textContent='카드를 눌러 한 장씩 뒤집어 보세요';
  $('pkFlipAll').style.display='';
}
function flipSlot(slot,c,p){
  if(slot.classList.contains('flipped')) return;
  slot.classList.add('flipped'); pk.flipped++;
  const rr=RARITY_ORDER.indexOf(c.rarity);
  if(rr>=2){ slot.classList.add('burst'); const m=$('packModal'); m.classList.remove('flash2','flash3'); void m.offsetWidth; m.classList.add('flash'+rr); }
  if(pk.flipped>=p.cards.length) finishPack(p);
}
function finishPack(p){
  $('pkFlipAll').style.display='none';
  const newN=p.cards.filter(c=>!c.dup).length, dupN=p.cards.length-newN;
  $('pkInfo').textContent=`새 카드 ${newN}장`+(dupN?` · 중복 ${dupN}장 → +${fmt(p.refund)}골드 환급`:'')+(p.pityHit==='legend'?' · 🌟 전설 천장 확정!':p.pityHit==='epic'?' · ✨ 특급 천장 확정!':'');
  const last=pk.i>=pk.r.packs.length-1, nx=$('pkNext');
  nx.textContent=last?(pk.r.packs.length>1?'결과 요약':'확인'):`다음 팩 (${pk.i+2}/${pk.r.packs.length})`;
  nx.style.display=''; nx.onclick=()=>{ if(!last){ pk.i++; showPack(); } else if(pk.r.packs.length>1 && !pk.summary){ showSummary(); } else closePacks(); };
}
function showSummary(){
  pk.summary=true;
  const all=pk.r.packs.flatMap(p=>p.cards), tally={};
  SHOP_RARITIES.forEach(r=>tally[r]={n:0,dup:0});
  all.forEach(c=>{ tally[c.rarity].n++; if(c.dup) tally[c.rarity].dup++; });
  $('pkTitle').textContent=`${pk.r.packs.length}팩 결과`;
  const stage=$('pkStage'); stage.innerHTML='';
  const box=document.createElement('div'); box.className='pk-sum';
  SHOP_RARITIES.slice().reverse().forEach(r=>{
    const t=tally[r]; if(!t.n) return;
    const row=document.createElement('div'); row.className='pk-sum-row';
    row.innerHTML=`<span class="ed-rar r-${RARITY_ORDER.indexOf(r)}"></span><b></b><small></small>`;
    row.firstChild.textContent=r; row.children[1].textContent=`${t.n}장`; row.lastChild.textContent=t.dup?`(중복 ${t.dup}장)`:'';
    box.appendChild(row);
  });
  const newCards=all.filter(c=>c.isNew);
  if(newCards.length){
    const nw=document.createElement('div'); nw.className='pk-sum-new'; nw.textContent='✨ 새로 얻은 카드: ';
    newCards.slice().sort((a,b)=>RARITY_ORDER.indexOf(b.rarity)-RARITY_ORDER.indexOf(a.rarity)).forEach(c=>{ const s=document.createElement('span'); s.className='sh-chip r'+RARITY_ORDER.indexOf(c.rarity); s.textContent=c.name; nw.appendChild(s); });
    box.appendChild(nw);
  }
  stage.appendChild(box);
  $('pkInfo').textContent=`${fmt(pk.r.spent)}골드 사용 · 중복 환급 +${fmt(pk.r.refund)}골드 · 보유 골드 ${fmt(Economy.get().gold)}`;
  $('pkNext').textContent='확인';
}
function closePacks(){
  $('packModal').classList.remove('show','flash0','flash1','flash2','flash3'); $('pkStage').innerHTML=''; pk=null;
  renderShop(); ServerStore.loadShop().then(i=>{ if(i){ shopInfo=i; renderShop(); if($('shopHistory').style.display!=='none') renderShopHistory(); } });   // 최근 기록·천장 진행도를 서버 기준으로 새로 받는다
  updateWallet(); updateDeckMenuDesc();
}
$('pkFlipAll').onclick=()=>{ if(!pk) return; const p=pk.r.packs[pk.i]; document.querySelectorAll('#pkStage .pk-slot:not(.flipped)').forEach(s=>flipSlot(s,p.cards[+s.dataset.i],p)); };

// ---------- 시작: 메뉴 화면부터 ----------
ServerStore.ready.then(() => {                       // 서버에서 내 저장 데이터를 불러온 뒤에 시작
Economy.load();
buildDifficultyButtons();
updateWallet();
updateDeckMenuDesc();
{ const f=Economy.takeForfeited();
  if(f>0){ const p=document.createElement('p'); p.className='notice warn'; p.textContent=`이전 판이 끝나기 전에 종료되어 배팅 ${fmt(f)}골드를 잃었습니다.`; $('screen-main').appendChild(p); } }
showScreen('main');
});

// ---------- v83: 카드 위에 마우스를 올리면 큰 미리보기 (하스스톤 방식) ----------
(function(){
  if(!window.matchMedia || !matchMedia('(hover:hover)').matches) return;     // 터치 기기는 제외
  const box=document.createElement('div'); box.id='cardPreview'; document.body.appendChild(box);
  const SKIP='#mulliganModal,#discoverModal,#spellCast,#burnCast,#cardPreview';
  let cur=null;
  function hide(){ box.style.display='none'; box.innerHTML=''; cur=null; }
  function show(el){
    cur=el; box.innerHTML='';
    const cl=el.cloneNode(true);
    cl.classList.remove('selected','attackable','dead','frozen-x'); cl.style.cssText='';
    box.appendChild(cl); box.style.display='block';
    const r=el.getBoundingClientRect(), p=cl.getBoundingClientRect(), w=p.width, h=p.height;
    let x=r.right+14; if(x+w>innerWidth-6) x=r.left-w-14; if(x<6) x=Math.max(6,Math.min(innerWidth-w-6, r.left+r.width/2-w/2));
    let y=r.top+r.height/2-h/2; y=Math.max(6, Math.min(innerHeight-h-6, y));
    box.style.left=x+'px'; box.style.top=y+'px';
  }
  document.addEventListener('mouseover', e=>{
    const c=e.target.closest && e.target.closest('.card');
    if(!c || c.closest(SKIP) || c.classList.contains('card-back') || !c.querySelector('.cname')){ if(cur) hide(); return; }
    if(c!==cur) show(c);
  });
  ['mousedown','wheel','dragstart'].forEach(t=>document.addEventListener(t, ()=>{ if(cur) hide(); }, true));
  setInterval(()=>{ if(cur && !document.body.contains(cur)) hide(); }, 250);     // 화면이 다시 그려져 카드가 사라지면 미리보기도 치운다
})();
