// analyze.js — 카드별 승률 분석. 사용법: node analyze.js [판수=3000] [봇=rule] [--no-save]
// 결과는 화면에 나오는 동시에 같은 폴더의 '분석결과.txt' 맨 아래에 이어붙는다 (덮어쓰기 아님). 저장을 끄려면 --no-save.
// 매 판 양쪽에 랜덤 덱을 주고 봇끼리 대전시킨 뒤, "카드가 덱에 있을 때 vs 없을 때" 승률을 비교한다.
const E = require('./engine.js');
const fs = require('fs'), path = require('path'), util = require('util');
const args  = process.argv.slice(2).filter(x => x !== '--no-save');
const SAVE  = !process.argv.includes('--no-save');
const GAMES = +args[0] || 3000;
const BOT   = E.BotPlayers[args[1] || 'rule'];
if (!BOT) { console.error('없는 봇:', Object.keys(E.BotPlayers).join(', ')); process.exit(1); }

// 화면 출력을 그대로 복사해 두었다가 마지막에 txt 에 이어붙인다
const buf = [], _log = console.log, _table = console.table;
console.log   = (...x) => { buf.push(util.format(...x)); _log(...x); };
console.table = (x)    => {
  // console.table 의 모양을 텍스트로 얻는다 (콘솔 Console 인스턴스 이용)
  const { Console } = require('console'), { Writable } = require('stream');
  let t = ''; new Console(new Writable({ write(c, e, cb){ t += c; cb(); } })).table(x);
  buf.push(t.trimEnd()); _table(x);
};

const names = E.CARD_POOL.map(c => c.name);
const card  = {};                       // 이름 → {withG, withW}
names.forEach(n => card[n] = {withG:0, withW:0});
const pair  = {};                       // "A|B" → {g, w}
let total = 0, totalW = 0, errors = 0, stalled = 0, firstWins = 0, played = 0;

function record(deck, won){
  const set = [...new Set(deck)];       // 같은 카드 2장이어도 한 번만 센다
  total++; if (won) totalW++;
  for (const n of set){ card[n].withG++; if (won) card[n].withW++; }
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++){
    const k = set[i] < set[j] ? set[i] + '|' + set[j] : set[j] + '|' + set[i];
    const p = pair[k] || (pair[k] = {g:0, w:0}); p.g++; if (won) p.w++;
  }
}

for (let g = 0; g < GAMES; g++){
  const decks = [E.buildRandomDeck(), E.buildRandomDeck()];
  let s = E.newGame(Math.random, {decks});
  while (!s.over && s.turnNo <= 200){
    const r = E.apply(s, BOT.decide(E.viewFor(s, s.turn)), s.turn);
    if (!r.ok){ errors++; break; }
    s = r.state;
  }
  if (!s.over){ stalled++; continue; }
  if (s.winner === null) continue;      // 무승부는 제외
  played++; if (s.winner === s.first) firstWins++;
  record(decks[s.winner], true);
  record(decks[1 - s.winner], false);
}

const base = totalW / total;            // 항상 0.5 (한 판에 승자 1, 패자 1)
const pct = x => (x * 100).toFixed(1) + '%';
const rows = names.map(n => {
  const c = card[n], wo = total - c.withG, woW = totalW - c.withW;
  const withRate = c.withW / c.withG, woRate = woW / wo;
  const cd = E.CARD_POOL.find(x => x.name === n);
  return {카드:n, 코스트:cd.cost, 종류:cd.type === 'spell' ? '주문' : '하수인',
          '덱에 있을 때':pct(withRate), '없을 때':pct(woRate),
          '차이(%p)':+((withRate - woRate) * 100).toFixed(1), 표본:c.withG};
}).sort((a, b) => b['차이(%p)'] - a['차이(%p)']);

console.log(`\n##### ${E.VERSION} · ${new Date().toLocaleString('ko-KR')} · 봇=${args[1] || 'rule'} · ${GAMES}판 #####`);
console.log(`\n== 카드별 승률 (${played}판, 봇=${args[1] || 'rule'}, 선공 승률 ${pct(firstWins / played)}, 오류 ${errors}, 멈춤 ${stalled}) ==`);
console.table(rows);

// 시너지: 두 카드가 같이 있을 때의 승률이 "각자의 차이 합"으로 예상한 값보다 얼마나 높은가
const dev = {};   // 카드 하나만 있을 때 50%에서 얼마나 벗어나는가 (있을 때 승률 - 50)
names.forEach(n => dev[n] = card[n].withW / card[n].withG * 100 - 50);
const syn = Object.entries(pair).filter(([, p]) => p.g >= 150).map(([k, p]) => {
  const [a, b] = k.split('|');
  const expected = 50 + dev[a] + dev[b];
  return {조합:k.replace('|', ' + '), 실제:+(p.w / p.g * 100).toFixed(1), 예상:+expected.toFixed(1),
          '시너지(%p)':+((p.w / p.g * 100) - expected).toFixed(1), 표본:p.g};
}).sort((a, b) => b['시너지(%p)'] - a['시너지(%p)']);
console.log('\n== 시너지 상위 10 (예상보다 잘 이기는 조합) ==');   console.table(syn.slice(0, 10));
console.log('\n== 시너지 하위 5 (같이 쓰면 오히려 손해) ==');       console.table(syn.slice(-5));
console.log('\n※ 표본이 작거나 차이가 ±2%p 이내면 우연일 수 있다. 판수를 늘려 다시 돌려 볼 것.');

if (SAVE){
  const file = path.join(__dirname, '분석결과.txt');
  fs.appendFileSync(file, buf.join('\n') + '\n\n\n', 'utf8');
  _log(`\n→ ${file} 에 이어붙였습니다.`);
}
