// advstory.js — v148 모험모드 스토리 연출 (영남대 입학 · 수능 보스 앞)
//   메이플스토리식 대화창: 아래 대사 상자 + 오른쪽 초상화 + 이름표, [다음 ▶]으로 한 줄씩. 장면이 바뀌면 배경이 페이드
//   · 독백은 (괄호) 안 하늘색 글씨 — 초상화가 있으면 주인공 얼굴, 없으면 장면 그림만
//   · 마지막은 필적 확인란: 연필이 문구를 한 글자씩 써 내려가고 → 본령(차임) → 보스전 시작
//   · 한 번 끝까지 본 사람(계정별, localStorage)은 오른쪽 위 [건너뛰기 ⏭] 가 보인다. 처음 보는 사람은 [다음]만
//   쓰는 곳: ui.js startBoss → AdvStory.has(boss.id) 이면 await AdvStory.play(boss.id) 뒤에 판을 시작한다
//   대사를 고치려면 아래 STORIES 만 고치면 된다. 그림은 images/ynu/story/
const AdvStory = (() => {
  'use strict';
  const IMG = 'images/ynu/story/';
  const ME = '나';
  // 한 줄 = 한 번 [다음]. 종류:
  //   {bg}            배경 바꾸기 (페이드). title 이 있으면 장면 제목 자막
  //   {black}         암전 (잠깐 쉼)
  //   {who, face, t}  대사 (face 없으면 초상화 없음)
  //   {mono, face}    독백 (괄호 · 하늘색)
  //   {say:'방송', t} 방송 (📢, 노란 글씨)
  //   {write}         필적 확인란 쓰기 → 본령 → 끝
  const STORIES = {
    ynu_suneung: {
      title: '수능 전야',
      lines: [
        { bg: 's1_living', title: 'D-1 · 저녁' },
        { mono: '학원에서 돌아오니, 거실에 초콜릿이며 떡이며 찹쌀모찌가 한가득 쌓여 있었다.' },
        { who: '엄마', face: 'mom_happy', t: '아들 왔니~?' },
        { bg: 's1_choco' },
        { who: '엄마', t: '이거 봐, 이모가 초콜릿 보내왔단다. 이게 그 유명하다던 두바이 초콜릿 아니겠니?' },
        { bg: 's1_living' },
        { mono: '원래는 무덤덤하게 넘기려고 했는데. 아무렇지 않은 척하려고 했는데…', face: 'me_calm' },
        { mono: '거실에 놓인 선물상자들을 보니까, 그제야 실감이 났다.', face: 'me_calm' },
        { who: '엄마', face: 'mom_calm', t: '부담 갖지는 말고, 원래 하던 대로 해, 아들~' },
        { mono: '원래 하던 대로…', face: 'me_calm' },
        { black: true },
        { bg: 's2_room', title: 'D-1 · 밤' },
        { mono: '깜깜한 내 방. 침대에 누워 천장만 바라보고 있다.' },
        { mono: '째깍, 째깍… 시계 소리가 유난히 크게 들린다.' },
        { mono: '역시… 잠이 오지 않는다.' },
        { black: true },
        { bg: 's3_cheer', title: '수능 당일 · 아침' },
        { mono: '결국 거의 한숨도 못 잤다. 눈이 뻑뻑하다.', face: 'me_tired' },
        { who: '후배들', t: '선배님 힘내세요! 찍는 것도 다 정답일 거예요! 파이팅!' },
        { bg: 's3_gate' },
        { mono: '……', face: 'me_nervous' },
        { mono: '정신 차리자. 원래 하던 대로.', face: 'me_calm' },
        { black: true, bg: 'dark' },
        { say: '방송', t: '수험생 여러분, 본령이 울릴 때까지 문제지를 넘기지 마시고…' },
        { say: '방송', t: '먼저 답안지의 필적 확인란에 다음 문구를 정자로 기재하십시오.' },
        { write: '잘 있거라 나의 짧았던 밤들아', after: '1교시 · 국어 영역' },
      ],
    },
  };
  const FACES = ['mom_happy', 'mom_calm', 'me_calm', 'me_tired', 'me_nervous'];

  const has = id => !!STORIES[id];
  const seenKey = id => `cardDuel.story.${id}.${(window.CURRENT_USER && (window.CURRENT_USER.username || window.CURRENT_USER.id)) || 'guest'}`;
  const seen = id => { try { return localStorage.getItem(seenKey(id)) === '1'; } catch (_) { return false; } };
  const markSeen = id => { try { localStorage.setItem(seenKey(id), '1'); } catch (_) {} };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(src, ms = 8000) {
    return new Promise(res => {
      const im = new Image(); let done = false; const end = ok => { if (!done) { done = true; res(ok); } };
      setTimeout(() => end(false), ms); im.onload = () => end(true); im.onerror = () => end(false); im.src = src;
    });
  }
  function preload(story) {
    const set = new Set([IMG + 'pencil.webp', IMG + 's4_sheet.jpg', ...FACES.map(f => IMG + f + '.webp')]);
    story.lines.forEach(l => { if (l.bg && l.bg !== 'dark') set.add(IMG + l.bg + '.jpg'); });
    const fonts = document.fonts && document.fonts.load ? document.fonts.load('40px "AdvPen"', '잘 있거라').catch(() => {}) : Promise.resolve();
    return Promise.all([...[...set].map(s => load(s)), fonts]);
  }

  // 본령 차임 (딩-동-댕-동). 소리 파일 없이 WebAudio 로 만든다. 실패해도 조용히 넘어간다
  function chime() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = new AC(), notes = [659.25, 523.25, 587.33, 392.0], t0 = ac.currentTime + 0.05;
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * 0.55;
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.start(t); o.stop(t + 1.5);
      });
      setTimeout(() => ac.close().catch(() => {}), 4000);
    } catch (_) {}
  }

  function build(story, canSkip) {
    const w = document.createElement('div');
    w.id = 'advStory';
    w.innerHTML = `
      <div class="as-bg a"></div><div class="as-bg b"></div><div class="as-shade"></div>
      <div class="as-title"></div>
      <img class="as-face" alt="">
      <div class="as-box">
        <div class="as-name"></div>
        <div class="as-text"></div>
        <button type="button" class="as-next">다음 ▶</button>
      </div>
      <div class="as-write"><div class="as-paper">
        <div class="as-label">필적 확인란</div>
        <div class="as-line"><span class="as-ink"></span><img class="as-pencil" src="${IMG}pencil.webp" alt=""></div>
      </div></div>
      <div class="as-big"></div>
      <div class="as-black"></div>
      ${canSkip ? '<button type="button" class="as-skip">건너뛰기 ⏭</button>' : ''}
      <div class="as-load">불러오는 중…</div>`;
    document.body.appendChild(w);
    return w;
  }

  async function play(id) {
    const story = STORIES[id]; if (!story) return;
    const canSkip = seen(id);
    const w = build(story, canSkip), q = s => w.querySelector(s);
    requestAnimationFrame(() => w.classList.add('on'));
    let skipped = false, onSkip = null;
    if (canSkip) q('.as-skip').addEventListener('click', e => { e.stopPropagation(); skipped = true; if (onSkip) onSkip(); });
    await preload(story);
    q('.as-load').remove();

    // ---- 배경: 두 장을 번갈아 쓰며 크로스페이드 ----
    let front = q('.as-bg.a'), back = q('.as-bg.b'), curBg = '';
    const setBg = name => {
      if (name === curBg) return; curBg = name;
      back.style.backgroundImage = name === 'dark' ? 'none' : `url("${IMG}${name}.jpg")`;
      back.classList.remove('kb'); void back.offsetWidth; if (!reduce()) back.classList.add('kb');
      back.classList.add('show'); front.classList.remove('show'); [front, back] = [back, front];
    };
    const face = q('.as-face'), box = q('.as-box'), name = q('.as-name'), text = q('.as-text'), title = q('.as-title'), black = q('.as-black');
    let curFace = '';
    const setFace = f => {
      if (f === curFace) return; curFace = f || '';
      face.classList.remove('show');
      if (f) { face.src = IMG + f + '.webp'; void face.offsetWidth; face.classList.add('show'); }
      box.classList.toggle('has-face', !!f);
    };
    const showTitle = t => { title.textContent = t; title.classList.remove('show'); void title.offsetWidth; title.classList.add('show'); };

    // [다음] / 화면 누르기 / 스페이스·엔터: 글자가 나오는 중이면 한 번에 다 보이고, 다 나왔으면 다음 줄
    let advance = null;
    const tap = e => { if (e && e.target && e.target.closest && e.target.closest('.as-skip')) return; if (advance) advance(); };
    w.addEventListener('pointerup', tap);
    const key = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); }
      else if (e.key === 'Escape' && canSkip) { skipped = true; if (onSkip) onSkip(); }
    };
    document.addEventListener('keydown', key, true);

    const typeLine = (html, plain) => new Promise(res => {
      // 글자를 하나씩: 전체 텍스트를 span 으로 쪼개 보이게만 바꾼다 (줄바꿈 위치가 흔들리지 않게)
      text.innerHTML = [...plain].map(ch => `<i>${esc(ch)}</i>`).join('');
      const chars = [...text.children]; let i = 0, timer = null, done = false;
      const finish = () => { if (done) return; done = true; clearInterval(timer); chars.forEach(c => c.classList.add('v')); box.classList.add('ready'); advance = () => { advance = null; res(); }; };
      box.classList.remove('ready');
      advance = finish; onSkip = () => { finish(); res(); };
      if (reduce()) { finish(); return; }
      timer = setInterval(() => { if (i >= chars.length) { finish(); return; } chars[i++].classList.add('v'); }, 38);
    });

    const pause = ms => new Promise(res => { const t = setTimeout(res, ms); onSkip = () => { clearTimeout(t); res(); }; });

    for (const L of story.lines) {
      if (skipped) break;
      if (L.black) {
        box.classList.remove('show'); setFace('');
        black.classList.add('show'); await pause(900); if (skipped) break;
        if (L.bg) setBg(L.bg);
        black.classList.remove('show'); continue;
      }
      if (L.bg) {
        const first = !curBg; setBg(L.bg);
        if (L.title) showTitle(L.title);
        if (first || L.title) { box.classList.remove('show'); setFace(''); await pause(L.title ? 1400 : 700); }
        continue;
      }
      if (L.write) { box.classList.remove('show'); setFace(''); await writeScene(L); break; }
      // 대사 줄
      const isMono = L.mono != null, isCast = L.say === '방송';
      setFace(L.face || '');
      name.textContent = isMono ? (L.face ? ME : '') : isCast ? '📢 방송' : (L.who || '');
      name.style.display = name.textContent ? '' : 'none';
      box.classList.toggle('mono', isMono); box.classList.toggle('cast', isCast);
      box.classList.add('show');
      const plain = isMono ? `(${L.mono})` : L.t;
      await typeLine(null, plain);
    }

    async function writeScene(L) {
      const wr = q('.as-write'), ink = q('.as-ink'), pen = q('.as-pencil'), line = q('.as-line');
      setBg('s4_sheet'); wr.classList.add('show');
      await pause(900); if (skipped) return;
      ink.innerHTML = [...L.write].map(ch => `<i>${ch === ' ' ? '&nbsp;' : esc(ch)}</i>`).join('');
      const chars = [...ink.children];
      pen.classList.add('show');
      const placePen = el => {
        const pr = line.getBoundingClientRect(), r = el ? el.getBoundingClientRect() : { right: pr.left, bottom: pr.bottom - 6 };
        pen.style.transform = `translate(${r.right - pr.left}px, ${r.bottom - pr.top - 6}px)`;
      };
      placePen(null); await pause(300);
      for (const c of chars) {
        if (skipped) return;
        c.classList.add('v'); placePen(c);
        pen.classList.remove('wig'); void pen.offsetWidth; pen.classList.add('wig');
        await pause(c.textContent.trim() ? 230 : 120);
      }
      await pause(700); if (skipped) return;
      pen.classList.add('away');
      await pause(500); if (skipped) return;
      chime();
      const big = q('.as-big'); big.innerHTML = `<small>본령이 울렸다</small><b>${esc(L.after || '시작!')}</b>`; big.classList.add('show');
      await pause(2200);
    }

    // 끝: 다 본 사람만 다음부터 건너뛸 수 있게 (건너뛰기로 끝나도 이미 본 사람이므로 그대로)
    if (!skipped) markSeen(id);
    document.removeEventListener('keydown', key, true);
    w.classList.add('out');
    await wait(500);
    w.remove();
  }

  return { has, play, seen, STORIES };
})();
