// analyze_v80.js — 카드/경기 심층 분석기 (표본·초기 손패 지표 개선)
// 사용법: node analyze_v72.js [판수=1000] [봇=rule] [--no-save]
// 분석 결과와 경기별 상세 원본을 모두 TXT 파일로 저장한다.
// 같은 봇끼리 무작위 덱으로 대전. 결과는 분석결과_v80.txt에 누적 저장.
'use strict';
// Prefer the bundled v72 engine; fall back to v71 only for older installations.
const E = (() => { try { return require('./engine_v80.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return require('./engine_v80.js'); } })();
const fs = require('fs'), path = require('path'), util = require('util');
const args = process.argv.slice(2);
const GAMES = Math.max(1, Math.floor(Number(args.find(x => /^\d+$/.test(x))) || 1000));
const BOT_NAME = args.find(x => !x.startsWith('--') && !/^\d+$/.test(x)) || 'rule';
const BOT = E.BotPlayers[BOT_NAME];
const SAVE = !args.includes('--no-save');
if (!BOT) { console.error('없는 봇:', Object.keys(E.BotPlayers).join(', ')); process.exit(1); }
const names = E.CARD_POOL.map(c=>c.name), defs = Object.fromEntries(E.CARD_POOL.map(c=>[c.name,c]));
const stats = Object.fromEntries(names.map(n=>[n,{
  name:n,deckGames:0,deckWins:0,absentGames:0,absentWins:0,
  openingGames:0,openingWins:0,drawnGames:0,drawnWins:0,
  laterDrawGames:0,laterDrawWins:0,playedGames:0,playedWins:0,
  plays:0,draws:0,deckCopies:0,playedAsMinion:0,playedAsSpell:0
}]));
const pairs = new Map();
const costStats = new Map(), typeStats = new Map();
const outcome = {games:GAMES,completed:0,draws:0,stalled:0,errors:0,firstWins:0,secondWins:0,turnSum:0,turns:[],byTurn:[],playerTurns:[0,0],hpEnd:[0,0], manaWaste:[0,0]};
const actionCounts = new Map(), eventCounts = new Map(), turnFlow = new Map();
function pct(n,d){return d ? (100*n/d).toFixed(1)+'%' : 'n/a';}
function ci95(w,n){ if(!n)return 'n/a'; const z=1.96,p=w/n,den=1+z*z/n,mid=(p+z*z/(2*n))/den,rad=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/den; return `${(Math.max(0,mid-rad)*100).toFixed(1)}–${(Math.min(1,mid+rad)*100).toFixed(1)}%`; }
function table(title, rows){ console.log('\n== '+title+' =='); if(!rows.length){console.log('(표본 없음)');return;} console.table(rows); }
const cardRows=[];
for(let g=0;g<GAMES;g++){
  const game=E.playRecordedGame(BOT,BOT,{maxTurns:200});
  if (SAVE) {
    const rawPath=path.join(__dirname,'경기기록_v80.txt');
    // Every requested game is written immediately, including draws, stalled games, and errors.
    // Human-readable TXT only: no JSON/JSONL output.
    const fmt = (label, value) => label + ': ' + util.inspect(value, {depth:null, maxArrayLength:null, compact:true, breakLength:180, sorted:false});
    const rawText='\n'+'='.repeat(100)+'\n경기 '+(g+1)+' / '+GAMES+' · '+new Date().toLocaleString('ko-KR')+'\n'+'='.repeat(100)+'\n'
      +fmt('버전',game.version)+'\n'+fmt('선공 좌석',game.first)+'\n'+fmt('덱(좌석별 카드 목록)',game.decks)+'\n'
      +fmt('시작 손패',game.openingHands)+'\n'+fmt('승자 좌석(null=무승부)',game.winner)+'\n'+fmt('종료 여부',game.over)+'\n'+fmt('멈춤 여부',game.stalled)+'\n'
      +fmt('최종 상태',game.final)+'\n'+fmt('턴별 상태 기록',game.turns)+'\n'+fmt('모든 행동(카드/대상/성공 여부)',game.actions)+'\n'
      +fmt('실제 사용 카드',game.cardPlays)+'\n'+fmt('손패 유입/드로우 카드',game.cardDraws)+'\n'+fmt('전체 이벤트',game.events)+'\n'+fmt('오류',game.errors)+'\n';
    fs.appendFileSync(rawPath,rawText,'utf8');
  }
  if(game.errors && game.errors.length) outcome.errors += game.errors.length;
  if(game.stalled){outcome.stalled++;continue;}
  if(!game.over){outcome.stalled++;continue;}
  if(game.winner===null){outcome.draws++;continue;}
  outcome.completed++;
  const winner=game.winner, winSeat=winner;
  if(winner===game.first) outcome.firstWins++; else outcome.secondWins++;
  outcome.turnSum += game.final.turnNo; outcome.turns.push(game.final.turnNo);
  game.final.hp.forEach((v,i)=>outcome.hpEnd[i]+=v);
  for(const a of (game.actions||[])){const k=a.type;actionCounts.set(k,(actionCounts.get(k)||0)+1);}
  for(const ev of (game.events||[])){eventCounts.set(ev.type,(eventCounts.get(ev.type)||0)+1);}
  for(const t of (game.turns||[])){ outcome.playerTurns[t.seat]++; const k=String(t.turnNo); let f=turnFlow.get(k);if(!f){f={turn:t.turnNo,n:0,hp:0,oppHp:0,mana:0,hand:0,board:0};turnFlow.set(k,f);}f.n++;f.hp+=t.hp;f.oppHp+=t.oppHp;f.mana+=t.mana;f.hand+=t.hand;f.board+=t.board; }
  // deck-level card presence is measured per seat/game; two copies still count as one inclusion.
  const perSeatSeen=[new Set(),new Set()], perSeatPlayed=[new Set(),new Set()], perSeatDrawn=[new Set(),new Set()];
  for(let seat=0;seat<2;seat++){
    const deckSet=new Set(game.decks[seat]);
    for(const n of deckSet){ if(stats[n]){stats[n].deckGames++;stats[n].deckCopies+=game.decks[seat].filter(x=>x===n).length;if(seat===winner)stats[n].deckWins++;} }
    for(const n of names){if(!deckSet.has(n)){stats[n].absentGames++;if(seat===winner)stats[n].absentWins++;}}
    const openingSet=new Set();
    for(const c of game.openingHands[seat]||[]){
      if(c && c.name){openingSet.add(c.name);perSeatSeen[seat].add(c.name);}
    }
    for(const n of openingSet) if(stats[n]){stats[n].openingGames++;if(seat===winner)stats[n].openingWins++;}
    const laterDrawSet=new Set();
    for(const c of (game.cardDraws||[]).filter(x=>x.seat===seat)){
      if(c && c.name){laterDrawSet.add(c.name);perSeatDrawn[seat].add(c.name);perSeatSeen[seat].add(c.name);}
    }
    for(const n of laterDrawSet) if(stats[n]){stats[n].laterDrawGames++;if(seat===winner)stats[n].laterDrawWins++;}
    for(const c of (game.cardPlays||[]).filter(x=>x.seat===seat)){
      if(c && c.name){perSeatPlayed[seat].add(c.name);if(stats[c.name]){stats[c.name].plays++;if(c.type==='spell')stats[c.name].playedAsSpell++;else stats[c.name].playedAsMinion++;}}
    }
    for(const n of perSeatSeen[seat]) if(stats[n]){stats[n].drawnGames++;if(seat===winner)stats[n].drawnWins++;}
    for(const n of perSeatPlayed[seat]) if(stats[n]){stats[n].playedGames++;if(seat===winner)stats[n].playedWins++;}
    // cost/type outcome, per deck inclusion by card metadata and deck composition
    for(const n of deckSet){const d=defs[n]; if(!d)continue; const key=String(d.cost), c=costStats.get(key)||{cost:d.cost,games:0,wins:0};c.games++;if(seat===winner)c.wins++;costStats.set(key,c);const tk=d.type==='spell'?'주문':'하수인';const t=typeStats.get(tk)||{type:tk,games:0,wins:0};t.games++;if(seat===winner)t.wins++;typeStats.set(tk,t);}
    // card co-occurrence for synergy: pair in same deck and game, win/loss recorded per seat
    const list=[...deckSet].sort();
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const key=list[i]+'\u0000'+list[j];let p=pairs.get(key);if(!p){p={a:list[i],b:list[j],games:0,wins:0};pairs.set(key,p);}p.games++;if(seat===winner)p.wins++;}
  }
}
const totalSeats=outcome.completed*2;
console.log(`\n##### ${E.VERSION} 심층 분석 · ${new Date().toLocaleString('ko-KR')} · 봇=${BOT_NAME} · 요청 ${GAMES}판 #####`);
console.log(`완료 ${outcome.completed}, 무승부 ${outcome.draws}, 멈춤 ${outcome.stalled}, 오류 ${outcome.errors}`);
console.log(`선공 승률 ${pct(outcome.firstWins,outcome.completed)} (${outcome.firstWins}/${outcome.completed}), 후공 승률 ${pct(outcome.secondWins,outcome.completed)}; 평균 경기 턴 ${outcome.completed?(outcome.turnSum/outcome.completed).toFixed(1):'n/a'}`);
const cardTable=names.map(n=>{const s=stats[n], d=defs[n], wr=s.deckGames?s.deckWins/s.deckGames:0, absent=s.absentGames?s.absentWins/s.absentGames:0;const diff=s.deckGames&&s.absentGames?(wr-absent)*100:null;return {카드:n,코스트:d.cost,종류:d.type==='spell'?'주문':'하수인',덱포함승률:pct(s.deckWins,s.deckGames),미포함승률:pct(s.absentWins,s.absentGames),'차이(%p)':diff===null?'n/a':+diff.toFixed(1),포함표본:s.deckGames,신뢰구간95:ci95(s.deckWins,s.deckGames),초기손패경기:s.openingGames,초기손패승률:pct(s.openingWins,s.openingGames),뽑은경기:s.drawnGames,뽑았을때승률:pct(s.drawnWins,s.drawnGames),후속드로우경기:s.laterDrawGames,후속드로우승률:pct(s.laterDrawWins,s.laterDrawGames),사용경기:s.playedGames,사용했을때승률:pct(s.playedWins,s.playedGames),사용횟수:s.plays};}).sort((a,b)=>(Number(b['차이(%p)'])||-999)-(Number(a['차이(%p)'])||-999));
table('카드별 성능 (덱 포함/미포함 · 초기 손패/후속 드로우/실제 사용)',cardTable);
const minSample=Math.max(50,Math.floor(outcome.completed*0.1));
table(`표본 ${minSample} 이상 카드 후보 (인과관계 아님)`,cardTable
  .filter(r=>r.포함표본>=minSample && r['차이(%p)']!=='n/a')
  .sort((a,b)=>a['차이(%p)']-b['차이(%p)'])
  .slice(0,10));
table('코스트별 덱 포함 성적',[...costStats.values()].sort((a,b)=>a.cost-b.cost).map(x=>({코스트:x.cost,포함표본:x.games,승률:pct(x.wins,x.games),신뢰구간95:ci95(x.wins,x.games)})));
table('카드 종류별 덱 포함 성적',[...typeStats.values()].map(x=>({종류:x.type,표본:x.games,승률:pct(x.wins,x.games),신뢰구간95:ci95(x.wins,x.games)})));
table('턴별 전황 평균 (기록된 턴 종료 시점)',[...turnFlow.values()].sort((a,b)=>a.turn-b.turn).map(x=>({턴:x.turn,기록수:x.n,내영웅체력:+(x.hp/x.n).toFixed(1),상대영웅체력:+(x.oppHp/x.n).toFixed(1),남은마나:+(x.mana/x.n).toFixed(1),손패:+(x.hand/x.n).toFixed(1),내하수인:+(x.board/x.n).toFixed(1)})));
table('행동 종류 집계',[...actionCounts.entries()].map(([행동,횟수])=>({행동,횟수})).sort((a,b)=>b.횟수-a.횟수));
table('이벤트 종류 집계',[...eventCounts.entries()].map(([이벤트,횟수])=>({이벤트,횟수})).sort((a,b)=>b.횟수-a.횟수).slice(0,30));
const pairRows=[...pairs.values()].filter(p=>p.games>=Math.max(30,Math.floor(outcome.completed*0.05))).map(p=>{const ar=stats[p.a],br=stats[p.b];const actual=p.wins/p.games*100;const baseA=ar.deckGames?ar.deckWins/ar.deckGames*100:50,baseB=br.deckGames?br.deckWins/br.deckGames*100:50;return {조합:p.a+' + '+p.b,실제승률:+actual.toFixed(1),개별기준평균:+((baseA+baseB)/2).toFixed(1),'시너지추정(%p)':+(actual-(baseA+baseB)/2).toFixed(1),표본:p.games};}).sort((a,b)=>b['시너지추정(%p)']-a['시너지추정(%p)']);
table('시너지 상위 15 (탐색용 추정치 · 인과효과 아님)',pairRows.slice(0,15));
table('시너지 하위 10',pairRows.slice(-10).reverse());
const topWeak=cardTable.filter(r=>r.포함표본>=Math.max(50,outcome.completed*0.1)&&r['차이(%p)']!=='n/a');
table('밸런스 점검 후보 (인과관계가 아닌 조사 우선순위)',[
 ...topWeak.filter(r=>r['차이(%p)']>=5).sort((a,b)=>b['차이(%p)']-a['차이(%p)']).slice(0,8).map(r=>({분류:'강할 가능성',카드:r.카드,차이:r['차이(%p)'],표본:r.포함표본})),
 ...topWeak.filter(r=>r['차이(%p)']<=-5).sort((a,b)=>a['차이(%p)']-b['차이(%p)']).slice(0,8).map(r=>({분류:'약할 가능성',카드:r.카드,차이:r['차이(%p)'],표본:r.포함표본}))
]);
console.log('\n※ 승률 차이와 시너지는 무작위 덱/선택한 봇 환경에서의 연관성입니다. 카드의 인과적 기여를 확정하지 않습니다. 같은 봇 미러전에서는 카드 조합 추정치가 특히 탐색용이며, 덱 구성·선공 여부 등의 교란을 포함합니다.');
console.log('※ 초기 손패/후속 드로우/사용 승률은 해당 카드가 한 번 이상 관측된 경기 기준입니다. 멀리건으로 교체된 카드의 별도 기록이 엔진에 없으면 멀리건 전후 효과를 분리할 수 없습니다. 카드 복사본별 효과도 분리하지 않습니다.');
const report=util.format('v%s 심층 분석 · %s · 봇=%s · 요청=%d\n완료=%d 무승부=%d 멈춤=%d 오류=%d 선공승률=%s 후공승률=%s 평균턴=%s\n',E.VERSION,new Date().toLocaleString('ko-KR'),BOT_NAME,GAMES,outcome.completed,outcome.draws,outcome.stalled,outcome.errors,pct(outcome.firstWins,outcome.completed),pct(outcome.secondWins,outcome.completed),outcome.completed?(outcome.turnSum/outcome.completed).toFixed(1):'n/a')+
  '\n[카드별 성능]\n'+util.inspect(cardTable,{depth:null,maxArrayLength:null,compact:false})+'\n\n[턴별 전황]\n'+util.inspect([...turnFlow.values()].sort((a,b)=>a.turn-b.turn),{depth:null,maxArrayLength:null,compact:false})+'\n\n[행동 집계]\n'+util.inspect([...actionCounts.entries()],{depth:null,maxArrayLength:null,compact:false})+'\n\n[이벤트 집계]\n'+util.inspect([...eventCounts.entries()],{depth:null,maxArrayLength:null,compact:false})+'\n\n[시너지 상위]\n'+util.inspect(pairRows.slice(0,30),{depth:null,maxArrayLength:null,compact:false})+'\n\n[시너지 하위]\n'+util.inspect(pairRows.slice(-20).reverse(),{depth:null,maxArrayLength:null,compact:false})+'\n';
if(SAVE){const out=path.join(__dirname,'분석결과_v80.txt');fs.appendFileSync(out,report+'\n'+'='.repeat(80)+'\n','utf8');console.log('\n→ '+out+' 에 이어붙였습니다.');}

