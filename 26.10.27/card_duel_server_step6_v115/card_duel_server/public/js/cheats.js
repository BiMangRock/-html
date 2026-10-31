// Node(서버)에서는 엔진의 CONFIG 를 전역에 올려 둔다 (브라우저에서는 engine.js 가 먼저 로드되어 이미 전역이다)
if (typeof module !== 'undefined' && typeof require === 'function' && typeof CONFIG === 'undefined') { globalThis.CONFIG = require('./engine.js').CONFIG; }
const CHEAT_TIERS = {            // 배당% → 치트 개수. v98: 치트 값은 모두 고정(켜짐/꺼짐)이고, 난이도는 '몇 개 받느냐'로만 조절한다. (level 은 항상 0)
  150:{count:0, level:-1},
  200:{count:1, level:0},
  300:{count:2, level:0},
  400:{count:3, level:0},
  500:{count:5, level:0},
};
const CHEATS = [   // v98: 값 하나짜리 켜짐/꺼짐 치트. minTier 로 센 치트가 낮은 배당에 뜨지 않게 막는다. group 이 같으면 하나만 뽑는다.
  {id:'hp',              icon:'❤️', name:'강인한 영웅',   minTier:200, levels:[30],    desc:v=>`영웅 체력 +${v}`},
  {id:'startMana',       icon:'💧', name:'앞선 출발',     minTier:200, levels:[3],     desc:v=>`첫 턴부터 마나 ${v}`,          group:'economy'},
  {id:'manaBonus',       icon:'⛲', name:'마력의 샘',     minTier:200, levels:[1],     desc:v=>`매 턴 마나 +${v}`,             group:'economy'},
  {id:'costDown',        icon:'🏷️', name:'값싼 병력',     minTier:200, levels:[1],     desc:v=>`덱의 하수인 비용 −${v}`,        group:'discount'},
  {id:'firstMinion',     icon:'🎟️', name:'무료 입장',     minTier:300, levels:[2],     desc:v=>`매 턴 처음 내는 하수인 비용 −${v}`, group:'discount'},
  {id:'spellDown',       icon:'📜', name:'주문 할인',     minTier:300, levels:[1],     desc:v=>`주문 비용 −${v} (생명력 주문·동전 제외)`},
  {id:'refund',          icon:'🔄', name:'마나 환급',     minTier:300, levels:[0.3],   desc:v=>`하수인을 낼 때마다 ${Math.round(v*100)}% 확률로 마나 1 환급`},
  {id:'startHand',       icon:'🃏', name:'풍부한 손패',   minTier:200, levels:[2],     desc:v=>`시작 손패 +${v}장 (최대 ${CONFIG.START_HAND_MAX}장)`, group:'draw'},
  {id:'extraDraw',       icon:'📖', name:'속독',          minTier:300, levels:[2],     desc:v=>`첫 ${v}턴 동안 매 턴 카드 2장 뽑기`, group:'draw'},   // 값은 지속 턴 수
  {id:'noFatigue',       icon:'🌙', name:'피로 면역',     minTier:300, levels:[true],  desc:()=>'덱이 비어도 탈진 피해를 받지 않는다'},
  {id:'startBoard',      icon:'⚔️', name:'선발대',        minTier:200, levels:[2],     desc:v=>`시작 필드에 보초병(1/2) ${v}기`},
  {id:'buff',            icon:'💪', name:'튼튼한 병력',   minTier:300, levels:[1],     desc:v=>`소환되는 하수인 체력 +${v}`},
  {id:'atkUp',           icon:'🔥', name:'맹공',          minTier:300, levels:[1],     desc:v=>`소환되는 하수인 공격력 +${v}`},
  {id:'shieldAll',       icon:'🔰', name:'강철 갑옷',     minTier:400, levels:[true],  desc:()=>'소환되는 하수인이 보호막을 가진다'},
  {id:'chargeAll',       icon:'🐎', name:'돌진 부대',     minTier:400, levels:[true],  desc:()=>'소환되는 하수인이 돌진을 가진다 (낸 턴에 바로 영웅 공격 가능)'},
  {id:'legion',          icon:'🛡️', name:'군단',          minTier:300, levels:[1],     desc:v=>`하수인을 낼 때 1/1 「병사」 ${v}기를 함께 소환 (빈 자리가 있을 때)`},
  {id:'reinforce',       icon:'📨', name:'후속 지원',     minTier:300, levels:[true],  desc:()=>'내 하수인이 죽으면 그 카드의 복사본 1장을 손패로 (턴당 1회)'},
  {id:'armor',           icon:'🪨', name:'강철 피부',     minTier:200, levels:[1],     desc:v=>`영웅이 받는 피해 −${v}`},
  {id:'thorns',          icon:'🌵', name:'가시 갑옷',     minTier:300, levels:[1],     desc:v=>`내 영웅을 공격한 하수인이 ${v} 피해를 입는다`},
  {id:'regen',           icon:'🌿', name:'재생',          minTier:300, levels:[2],     desc:v=>`내 턴 시작마다 영웅 체력 +${v}`},
  {id:'burn',            icon:'☄️', name:'영웅 일격',     minTier:400, levels:[1],     desc:v=>`내 턴 시작마다 상대 영웅에게 ${v} 피해 (첫 턴 제외)`},
  {id:'phoenix',         icon:'🕊️', name:'불굴',          minTier:500, levels:[10],    desc:v=>`영웅이 쓰러지면 1회 한정으로 체력 ${v}(으)로 부활`},
  {id:'startArmor',      icon:'🧱', name:'방어도 시작',   minTier:200, levels:[4],     desc:v=>`시작부터 방어도 ${v}`},
  {id:'handUp',          icon:'📚', name:'도서관',        minTier:200, levels:[2],     desc:v=>`손패 상한 +${v}장 (소각이 줄어든다)`},
  {id:'bloodHeal',       icon:'🩸', name:'혈기 가속',     minTier:300, levels:[1],     desc:v=>`혈기 룬 카드를 낼 때마다 영웅 체력 +${v}`},
  {id:'frostArmor',      icon:'❄️', name:'냉기 갑옷',     minTier:300, levels:[1],     desc:v=>`냉기 룬 카드를 낼 때마다 방어도 +${v}`},
  {id:'unholyCorpse',    icon:'💀', name:'부정한 부활',   minTier:300, levels:[1],     desc:v=>`부정 룬 카드를 낼 때마다 시체 +${v}`},
  {id:'spellCopy',       icon:'🪞', name:'카드 복사',     minTier:400, levels:[true],  desc:()=>'매 턴 처음 쓰는 주문의 복사본 1장을 손패로 (가득 차면 소각)'},
  {id:'doubleBattlecry', icon:'🔁', name:'메아리',        minTier:400, levels:[true],  desc:()=>'전투의 함성이 두 번 발동'},
];
const cheatValue = (c, level) => c.levels[Math.min(Math.max(level,0), c.levels.length-1)];
function cheatCandidates(tier){
  const t=CHEAT_TIERS[tier]; if(!t || t.count<=0) return [];
  return CHEATS.filter(c=>c.minTier<=tier).map(c=>{ const v=cheatValue(c, t.level); return {id:c.id, icon:c.icon||'', name:c.name, value:v, desc:c.desc(v), group:c.group||null}; });
}
// → {mods:{...}, list:[{id,name,desc}]}
function rollCheats(tier, rng=Math.random){
  const t=CHEAT_TIERS[tier], out={mods:{}, list:[]};
  if(!t || t.count<=0) return out;
  const pool=cheatCandidates(tier);
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const usedGroups=new Set();
  for(const c of pool){
    if(out.list.length>=t.count) break;
    if(c.group && usedGroups.has(c.group)) continue;
    if(c.group) usedGroups.add(c.group);
    out.mods[c.id]=c.value; out.list.push({id:c.id, icon:c.icon, name:c.name, desc:c.desc});
  }
  return out;
}

if (typeof module !== 'undefined') { module.exports = { CHEAT_TIERS, CHEATS, cheatValue, cheatCandidates, rollCheats }; }
