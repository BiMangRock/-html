// analyze_v87.js — 카드 결투 최신 HTML 엔진용 분석기
// 실행: node analyze_v87.js [판수=1000] [봇=rule] [--no-save]
// 엔진은 같은 폴더의 engine_v87.js를 사용합니다. 버전은 엔진의 VERSION 값을 표시합니다.
'use strict';
const E = require('./engine_v87.js');
const fs = require('fs'), path = require('path'), util = require('util');
const args = process.argv.slice(2);
const GAMES = Math.max(1, Math.floor(Number(args.find(x => /^\d+$/.test(x))) || 1000));
const BOT_NAME = args.find(x => !x.startsWith('--') && !/^\d+$/.test(x)) || 'rule';
const BOT = E.BotPlayers[BOT_NAME], SAVE = !args.includes('--no-save');
if (!BOT) { console.error('없는 봇:', Object.keys(E.BotPlayers).join(', ')); process.exit(1); }
const names=E.CARD_POOL.map(c=>c.name), defs=Object.fromEntries(E.CARD_POOL.map(c=>[c.name,c]));
const stats=Object.fromEntries(names.map(n=>[n,{name:n,deckGames:0,deckWins:0,absentGames:0,absentWins:0,openingGames:0,openingWins:0,drawnGames:0,drawnWins:0,laterDrawGames:0,laterDrawWins:0,playedGames:0,playedWins:0,plays:0,deckCopies:0}]));
const pairs=new Map(), costStats=new Map(), typeStats=new Map(), actionCounts=new Map(), eventCounts=new Map(), turnFlow=new Map();
const outcome={games:GAMES,completed:0,draws:0,stalled:0,errors:0,firstWins:0,secondWins:0,turnSum:0};
const pct=(n,d)=>d?(100*n/d).toFixed(1)+'%':'n/a';
function ci95(w,n){if(!n)return 'n/a';const z=1.96,p=w/n,den=1+z*z/n,mid=(p+z*z/(2*n))/den,rad=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/den;return `${(Math.max(0,mid-rad)*100).toFixed(1)}–${(Math.min(1,mid+rad)*100).toFixed(1)}%`;}
function table(title,rows){console.log('\n== '+title+' ==');if(!rows.length){console.log('(표본 없음)');return;}console.table(rows);}
function gameOnce(){
  let s=E.newGame(), game={first:s.first,decks:[],openingHands:[],cardDraws:[],cardPlays:[],actions:[],events:[],turns:[],errors:[],over:false,winner:null,stalled:false,final:null};
  for(let seat=0;seat<2;seat++){
    game.decks[seat]=s.seats[seat].deck.map(c=>c.name).concat(s.seats[seat].hand.map(c=>c.name));
    game.openingHands[seat]=s.seats[seat].hand.map(c=>({name:c.name,id:c.id}));
  }
  // Snapshot original deck composition (hand cards are part of the starting deck).
  for(let seat=0;seat<2;seat++){
    const all=new Map(); for(const n of game.decks[seat]) all.set(n,(all.get(n)||0)+1);
    game.decks[seat]=[...all.entries()].flatMap(([n,k])=>Array(k).fill(n));
  }
  let guard=0, lastTurn=-1;
  while(!s.over && guard++<20000 && s.turnNo<=200){
    const seat=s.turn, view=E.viewFor(s,seat);
    if(s.turnNo!==lastTurn){lastTurn=s.turnNo; const me=s.seats[seat],op=s.seats[1-seat];game.turns.push({turnNo:s.turnNo,seat,hp:me.hp,oppHp:op.hp,mana:me.mana,hand:me.hand.length,board:me.board.length});}
    let a;
    try { a=BOT.decide(view); } catch(e){game.errors.push(String(e));break;}
    if(!a){game.errors.push('봇이 행동을 반환하지 않음');break;}
    const before=s, r=E.apply(s,a,seat);
    if(!r.ok){game.errors.push(r.error||'유효하지 않은 행동');break;}
    s=r.state; game.actions.push({...a,seat,turnNo:before.turnNo});
    for(const ev of (r.events||[])){
      game.events.push(ev);
      if(ev.type==='draw'){
        const cards=ev.burnedCards||[];
        // Exact draw names are not consistently included by all engine events; use the post-action hand/deck delta when available.
        const afterHand=s.seats[ev.seat].hand, beforeHand=before.seats[ev.seat].hand;
        const oldIds=new Set(beforeHand.map(c=>c.id));
        for(const c of afterHand) if(!oldIds.has(c.id)) game.cardDraws.push({seat:ev.seat,name:c.name,turnNo:before.turnNo});
      }
    }
    // PLAY_CARD actions provide exact card identity even when event names vary by engine revision.
    if(a.type==='PLAY_CARD'){
      const c=before.seats[seat].hand.find(x=>x.id===a.cardId);
      if(c) game.cardPlays.push({seat,name:c.name,type:c.type,turnNo:before.turnNo});
    }
  }
  game.over=s.over;game.winner=s.winner;game.stalled=!s.over;game.final={turnNo:s.turnNo,hp:s.seats.map(x=>x.hp),mana:s.seats.map(x=>x.mana)};
  return game;
}
const rawPath=path.join(__dirname,`경기기록_${E.VERSION}.txt`);
for(let g=0;g<GAMES;g++){
 const game=gameOnce();
 if(SAVE) fs.appendFileSync(rawPath,'\n'+'='.repeat(80)+`\n경기 ${g+1}/${GAMES} · ${new Date().toLocaleString('ko-KR')}\n`+util.inspect(game,{depth:null,maxArrayLength:null,compact:false,breakLength:120})+'\n','utf8');
 outcome.errors+=game.errors.length;
 if(game.stalled){outcome.stalled++;continue;}
 if(game.winner===null){outcome.draws++;continue;}
 outcome.completed++;if(game.winner===game.first)outcome.firstWins++;else outcome.secondWins++;
 outcome.turnSum+=game.final.turnNo;
 for(const a of game.actions){actionCounts.set(a.type,(actionCounts.get(a.type)||0)+1);}
 for(const ev of game.events){eventCounts.set(ev.type,(eventCounts.get(ev.type)||0)+1);}
 for(const t of game.turns){const k=String(t.turnNo);let f=turnFlow.get(k);if(!f){f={turn:t.turnNo,n:0,hp:0,oppHp:0,mana:0,hand:0,board:0};turnFlow.set(k,f);}f.n++;f.hp+=t.hp;f.oppHp+=t.oppHp;f.mana+=t.mana;f.hand+=t.hand;f.board+=t.board;}
 const played=[new Set(),new Set()], seen=[new Set(),new Set()];
 for(let seat=0;seat<2;seat++){
   const deckSet=new Set(game.decks[seat]), openSet=new Set(game.openingHands[seat].map(c=>c.name));
   for(const n of deckSet) if(stats[n]){stats[n].deckGames++;stats[n].deckCopies+=game.decks[seat].filter(x=>x===n).length;if(seat===game.winner)stats[n].deckWins++;}
   for(const n of names) if(!deckSet.has(n)){stats[n].absentGames++;if(seat===game.winner)stats[n].absentWins++;}
   for(const n of openSet) if(stats[n]){stats[n].openingGames++;if(seat===game.winner)stats[n].openingWins++;seen[seat].add(n);}
   for(const d of game.cardDraws.filter(x=>x.seat===seat)){if(stats[d.name]){seen[seat].add(d.name);}}
   for(const n of seen[seat]) if(stats[n]){stats[n].drawnGames++;if(seat===game.winner)stats[n].drawnWins++;}
   for(const p of game.cardPlays.filter(x=>x.seat===seat)){if(stats[p.name]){played[seat].add(p.name);stats[p.name].plays++;}}
   for(const n of played[seat]) if(stats[n]){stats[n].playedGames++;if(seat===game.winner)stats[n].playedWins++;}
   for(const n of deckSet){const d=defs[n];if(!d)continue;let c=costStats.get(String(d.cost))||{cost:d.cost,games:0,wins:0};c.games++;if(seat===game.winner)c.wins++;costStats.set(String(d.cost),c);const tk=d.type==='spell'?'주문':'하수인';let t=typeStats.get(tk)||{type:tk,games:0,wins:0};t.games++;if(seat===game.winner)t.wins++;typeStats.set(tk,t);}
   const list=[...deckSet].sort();for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const key=list[i]+'\0'+list[j];let p=pairs.get(key);if(!p){p={a:list[i],b:list[j],games:0,wins:0};pairs.set(key,p);}p.games++;if(seat===game.winner)p.wins++;}
 }
}
const cardTable=names.map(n=>{const s=stats[n],d=defs[n],wr=s.deckGames?s.deckWins/s.deckGames:0,abs=s.absentGames?s.absentWins/s.absentGames:0;return {카드:n,코스트:d.cost,종류:d.type==='spell'?'주문':'하수인',덱포함승률:pct(s.deckWins,s.deckGames),미포함승률:pct(s.absentWins,s.absentGames),'차이(%p)':s.deckGames&&s.absentGames?+((wr-abs)*100).toFixed(1):'n/a',포함표본:s.deckGames,신뢰구간95:ci95(s.deckWins,s.deckGames),초기손패경기:s.openingGames,초기손패승률:pct(s.openingWins,s.openingGames),관측경기:s.drawnGames,관측승률:pct(s.drawnWins,s.drawnGames),사용경기:s.playedGames,사용승률:pct(s.playedWins,s.playedGames),사용횟수:s.plays};}).sort((a,b)=>(Number(b['차이(%p)'])||-999)-(Number(a['차이(%p)'])||-999));
console.log(`\n##### ${E.VERSION} 심층 분석 · ${new Date().toLocaleString('ko-KR')} · 봇=${BOT_NAME} · 요청 ${GAMES}판 #####`);
console.log(`완료 ${outcome.completed}, 무승부 ${outcome.draws}, 멈춤 ${outcome.stalled}, 오류 ${outcome.errors}`);
console.log(`선공 승률 ${pct(outcome.firstWins,outcome.completed)} (${outcome.firstWins}/${outcome.completed}), 후공 승률 ${pct(outcome.secondWins,outcome.completed)}; 평균 경기 턴 ${outcome.completed?(outcome.turnSum/outcome.completed).toFixed(1):'n/a'}`);
table('카드별 성능 (덱 포함/미포함 · 초기 손패/관측/실제 사용)',cardTable);
const minSample=Math.max(50,Math.floor(outcome.completed*.1));
table(`표본 ${minSample} 이상 카드 후보 (연관성 탐색용)`,cardTable.filter(r=>r.포함표본>=minSample&&r['차이(%p)']!=='n/a').sort((a,b)=>a['차이(%p)']-b['차이(%p)']).slice(0,10));
table('코스트별 덱 포함 성적',[...costStats.values()].sort((a,b)=>a.cost-b.cost).map(x=>({코스트:x.cost,표본:x.games,승률:pct(x.wins,x.games),신뢰구간95:ci95(x.wins,x.games)})));
table('카드 종류별 덱 포함 성적',[...typeStats.values()].map(x=>({종류:x.type,표본:x.games,승률:pct(x.wins,x.games),신뢰구간95:ci95(x.wins,x.games)})));
table('턴별 전황 평균',[...turnFlow.values()].sort((a,b)=>a.turn-b.turn).map(x=>({턴:x.turn,기록수:x.n,내영웅체력:+(x.hp/x.n).toFixed(1),상대영웅체력:+(x.oppHp/x.n).toFixed(1),남은마나:+(x.mana/x.n).toFixed(1),손패:+(x.hand/x.n).toFixed(1),내하수인:+(x.board/x.n).toFixed(1)})));
table('행동 종류 집계',[...actionCounts].map(([행동,횟수])=>({행동,횟수})).sort((a,b)=>b.횟수-a.횟수));
table('이벤트 종류 집계',[...eventCounts].map(([이벤트,횟수])=>({이벤트,횟수})).sort((a,b)=>b.횟수-a.횟수).slice(0,30));
const pairRows=[...pairs.values()].filter(p=>p.games>=Math.max(30,Math.floor(outcome.completed*.05))).map(p=>{const a=stats[p.a],b=stats[p.b],actual=p.wins/p.games*100,ba=a.deckGames?a.deckWins/a.deckGames*100:50,bb=b.deckGames?b.deckWins/b.deckGames*100:50;return {조합:p.a+' + '+p.b,실제승률:+actual.toFixed(1),개별기준평균:+((ba+bb)/2).toFixed(1),'시너지추정(%p)':+(actual-(ba+bb)/2).toFixed(1),표본:p.games};}).sort((a,b)=>b['시너지추정(%p)']-a['시너지추정(%p)']);
table('시너지 상위 15 (탐색용 추정치)',pairRows.slice(0,15));table('시너지 하위 10',pairRows.slice(-10).reverse());
console.log('\n※ 무작위 기본 덱/선택한 봇 환경의 연관성 분석이며 인과효과를 확정하지 않습니다.');
console.log('※ ZIP 파일명은 v87이지만 HTML 제목과 내장 엔진 VERSION은 v82입니다. 보고서 버전 표시는 엔진 내부 VERSION을 따릅니다.');
const report=util.format('%s 심층 분석 · %s · 봇=%s · 요청=%d\n완료=%d 무승부=%d 멈춤=%d 오류=%d 선공승률=%s 후공승률=%s 평균턴=%s\n',E.VERSION,new Date().toLocaleString('ko-KR'),BOT_NAME,GAMES,outcome.completed,outcome.draws,outcome.stalled,outcome.errors,pct(outcome.firstWins,outcome.completed),pct(outcome.secondWins,outcome.completed),outcome.completed?(outcome.turnSum/outcome.completed).toFixed(1):'n/a')+'\n[카드별 성능]\n'+util.inspect(cardTable,{depth:null,maxArrayLength:null,compact:false})+'\n\n[시너지 상위]\n'+util.inspect(pairRows.slice(0,30),{depth:null,maxArrayLength:null,compact:false})+'\n';
if(SAVE){const rp=path.join(__dirname,`분석결과_${E.VERSION}.txt`);fs.appendFileSync(rp,report+'\n'+'='.repeat(80)+'\n','utf8');console.log('\n→ '+rp+' 에 이어붙였습니다.');}
