const ECON = {
  VERSION:1,
  START_GOLD:100,
  EASY_WIN:10,                       // 초급: 승리 시 고정 보상
  POOL_START:100, POOL_MIN:20, POOL_MAX:300,
  POOL_UP:1.05, POOL_DOWN:0.95,      // 중급 일반: 승리 ×1.05 / 패배 ×0.95
  RESET_HOUR:5,                      // 새벽 5시 기준으로 하루가 바뀐다
  BET_MAX_RATIO:1.0,                 // 배팅 최대 = 보유 골드의 100% (전액 배팅 가능). 한도를 다시 두려면 0.5 등으로
  BET_TIERS:[150,200,300,400,500],   // 선택 가능한 배당(%): 승리 시 순이익 = 건 금액 × 배당%
  BET_DEFAULT:150,
};
const Economy = (() => {
  const pad = n => String(n).padStart(2,'0');
  function dayKey(now=new Date()){
    const d=new Date(now.getTime() - ECON.RESET_HOUR*3600*1000);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  const clampPool = x => Math.min(ECON.POOL_MAX, Math.max(ECON.POOL_MIN, x));
  const fresh = (now) => ({v:ECON.VERSION, gold:ECON.START_GOLD, pool:ECON.POOL_START, poolDay:dayKey(now), bet:0});

  // 날짜가 바뀌었으면 풀 초기화
  function refresh(save, now=new Date()){
    const k=dayKey(now);
    return save.poolDay===k ? save : {...save, pool:ECON.POOL_START, poolDay:k};
  }
  function sanitize(raw, now){
    const base=fresh(now);
    if(!raw || typeof raw!=='object') return base;
    const num=(x,d)=>Number.isFinite(x)?x:d;
    return {v:ECON.VERSION,
      gold:Math.max(0, Math.floor(num(raw.gold, base.gold))),
      pool:clampPool(num(raw.pool, base.pool)),
      poolDay:typeof raw.poolDay==='string'?raw.poolDay:base.poolDay,
      bet:Math.max(0, Math.floor(num(raw.bet, 0)))};
  }
  const poolNow = save => Math.round(clampPool(save.pool));
  function maxBet(save){
    if(save.gold<1) return 0;
    return Math.max(1, Math.floor(save.gold*ECON.BET_MAX_RATIO));
  }
  const betWinNet = (amount, pct=ECON.BET_DEFAULT) => Math.round(amount*pct/100);   // 승리 시 순이익

  // 배팅 시작: 즉시 차감. 잘못된 금액이면 null.
  function placeBet(save, amount){
    if(!Number.isInteger(amount) || amount<1 || amount>maxBet(save)) return null;
    return {...save, gold:save.gold-amount, bet:amount};
  }
  // ctx: {difficulty:'easy'|'normal', mode:'normal'|'bet', bet:number, payoutPct:number, pool:number, winner:0|1|null}  (winner 0 = 나)
  function settle(save, ctx){
    const win = ctx.winner===0, draw = ctx.winner===null;
    let next={...save}, payout=0, net=0, poolFrom=Math.round(save.pool), poolTo=poolFrom, kind='none';
    if(ctx.difficulty==='easy'){
      kind='easy'; if(win){ payout=ECON.EASY_WIN; net=payout; }
    } else if(ctx.mode==='bet'){
      kind='bet'; const bet=ctx.bet||0;
      if(win){ payout=bet+betWinNet(bet, ctx.payoutPct); net=payout-bet; }
      else if(draw){ payout=bet; net=0; }            // 무승부는 환불
      else { payout=0; net=-bet; }
      next.bet=0;                                      // 풀은 건드리지 않는다
    } else {
      kind='normal';
      if(win){ payout=Math.round(clampPool(ctx.pool)); net=payout; next.pool=clampPool(save.pool*ECON.POOL_UP); }
      else if(!draw){ next.pool=clampPool(save.pool*ECON.POOL_DOWN); }
      poolTo=Math.round(next.pool);
    }
    next.gold=save.gold+payout;
    return {save:next, summary:{kind, win, draw, payout, net, poolFrom, poolTo, bet:ctx.bet||0, payoutPct:ctx.payoutPct||ECON.BET_DEFAULT}};
  }

  // ---- 저장소 ----
  // 기본은 메모리뿐이다(서버·테스트에서 그대로 쓸 수 있게). 브라우저에서는 serverstore.js 가 useStore() 로 서버 저장소를 꽂는다.
  //   store = { read(): 저장된 값 또는 null, write(save) }
  let Store = (() => { let mem=null; return { read(){ return mem; }, write(save){ mem=save; } }; })();
  const useStore = s => { Store = s; };
  let cur=null, forfeited=0;
  function load(now=new Date()){
    const raw=Store.read();
    let sv=refresh(sanitize(raw, now), now);
    if(sv.bet>0){ forfeited=sv.bet; sv={...sv, bet:0}; }   // 게임 도중 종료된 배팅은 잃은 것으로 처리
    cur=sv; Store.write(cur); return cur;
  }
  const get = () => { cur=refresh(cur||load()); return cur; };
  const set = sv => { cur=sv; Store.write(cur); return cur; };
  const takeForfeited = () => { const f=forfeited; forfeited=0; return f; };
  return {dayKey, refresh, sanitize, poolNow, maxBet, betWinNet, placeBet, settle, load, get, set, takeForfeited, useStore};
})();

if (typeof module !== 'undefined') { module.exports = { ECON, Economy }; }
