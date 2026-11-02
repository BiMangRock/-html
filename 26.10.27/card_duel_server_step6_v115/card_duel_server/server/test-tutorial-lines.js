// test-tutorial-lines.js — v143 튜토리얼 1~4부 대사 길이 검사 (화면 없이)
//  한 말풍선은 한 문장, 폰 가로 화면(말풍선 폭 약 180px)에서도 2줄을 넘지 않아야 읽기 편하다.
//  글자 폭 어림: 한글 1 · 영문·숫자 0.58 · 공백 0.3 · 기호 0.4 → 말풍선 하나에 24 이하
//  1·2부(index.html · advanced.html)는 HTML 안의 대본을, 3·4부는 part1.js · part2.js 를 읽는다. 3·4부·2부는 화면에서 문장마다 나눠 띄우므로(tut-drama.js 의 split) 나눈 뒤를 잰다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'public', 'tutorial');
const LIMIT = 24;
const width = s => { s = s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, 'x'); let n = 0; for (const ch of s) { if (/[ㄱ-힝…·→]/.test(ch)) n += 1; else if (ch === ' ') n += 0.3; else if (/[A-Za-z0-9]/.test(ch)) n += 0.58; else n += 0.4; } return n; };
require(path.join(DIR, 'tut-drama.js')); const D = globalThis.DRAMA;
let bad = [], total = 0;
function check(name, lines, split) {
  for (const [c, t] of (split ? D.split(lines) : lines)) {
    if (c === 'D') continue; total++;
    assert(/^[JG][1-4]$/.test(c), `${name}: 얼굴 코드가 이상함 ${c}`);
    const w = width(t); if (w > LIMIT) bad.push(`${name} (${w.toFixed(1)}): ${t.replace(/<[^>]+>/g, '')}`);
  }
}
// 1·2부: <script id="tutorial"> 안에서 대본 부분만 꺼내 실행
function htmlScript(file, from, to, names) {
  const s = fs.readFileSync(path.join(DIR, file), 'utf8');
  const a = s.indexOf(from), b = s.indexOf(to, a); assert(a > 0 && b > a, `${file}: 대본 위치를 못 찾음`);
  return new Function(`const KW='<span class="kw">', K2='<span class="kw2">', E='</span>';\n${s.slice(a, b).replace(/^const KW=.*$/m, '')}\nreturn {${names}};`)();
}
{
  const B = htmlScript('index.html', 'const CHAPS=', 'const KW2=KW;', 'STEPS, ENEMY_TALK, WIN_SAY, CHAPS');
  B.STEPS.forEach((st, i) => check(`기본 #${i} ${st.title || st.type}`, st.say || [], false));
  B.ENEMY_TALK.forEach((t, i) => check(`기본 상대 턴 ${i}`, t, false));
  check('기본 승리', B.WIN_SAY, false);
  assert(B.STEPS.some(s => s.type === 'play' && s.pos != null), '기본: 하수인 놓을 자리 단계가 있어야 함');
  assert(B.STEPS.filter(s => s.type === 'look').length >= 2, '기본: 꾹 눌러 보기 단계가 있어야 함');
  assert(B.STEPS.every(s => s.type === 'enemy' || s.type === 'win' || (s.say && s.say.length)), '기본: 대사 없는 단계가 있음');
  console.log(`✔ 기본 튜토리얼 대사 검사 (단계 ${B.STEPS.length}개)`);
}
{
  const A = htmlScript('advanced.html', 'const DIALOG=', '/* 대화 큐', 'DIALOG, ENEMY_TALK, WIN_SAY');
  Object.entries(A.DIALOG).forEach(([k, v]) => check(`고급 #${k}`, v, true));
  A.ENEMY_TALK.forEach((t, i) => check(`고급 상대 턴 ${i}`, t, true));
  check('고급 승리', A.WIN_SAY, true);
  console.log('✔ 고급 튜토리얼 대사 검사');
}
const LOADED = {};
for (const f of ['part1.js', 'part2.js']) {
  delete globalThis.TUT; require(path.join(DIR, f)); const T = LOADED[f] = globalThis.TUT; delete globalThis.TUT;
  T.steps.forEach((st, i) => check(`${f} #${i} ${st.title || st.type}`, st.say || [], true));
  T.enemyTurns.forEach((t, i) => check(`${f} 상대 턴 ${i}`, t.say || [], true));
  check(`${f} 승리`, T.win.say, true);
  console.log(`✔ ${f} 대사 검사`);
}
{
  const T = LOADED['part1.js'];
  assert(T.steps.some(s => s.type === 'look' && s.look === 'power'), '3부: 영웅 능력 꾹 눌러 보기 단계가 있어야 함');
}
if (bad.length) { console.error('✘ 2줄을 넘을 수 있는 대사:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`✔ 튜토리얼 대사 ${total}개 모두 짧음 (한도 ${LIMIT})`);
