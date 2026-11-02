// tut-drama.js (v143) — 튜토리얼 1~4부 공용 연출 (화면 효과만, 규칙·진행과 상관없음)
//  intro: 대결 오프닝(제이나 VS 가로쉬) · chapter: 장 제목 카드 · taunt: 가로쉬 대사를 전장 위 말풍선으로
//  impact: 타격 흔들림 · turn: 턴 배너 · big: 결정타/승리 글자 · split: 긴 대사를 한 문장씩 나누기
(function (root) {
  'use strict';
  const $ = q => document.querySelector(q);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduce = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = {};

  function shake(target, lvl) {
    const t = typeof target === 'string' ? $(target) : target; if (!t || reduce()) return;
    const c = lvl >= 2 ? 'dr-shake2' : 'dr-shake1';
    t.classList.remove('dr-shake1', 'dr-shake2'); void t.offsetWidth; t.classList.add(c);
    setTimeout(() => t.classList.remove(c), 600);
  }
  function flash(color) { const f = el('div', 'dr-flash'); f.style.background = color || '#fff'; document.body.appendChild(f); setTimeout(() => f.remove(), 500); }

  // 대결 오프닝: 누르면 건너뛴다
  D.intro = function (o) {
    return new Promise(res => {
      const w = el('div', 'dr-intro', `
        <div class="side l"><img src="${o.left.img}" alt=""><b>${o.left.name}</b><small>${o.left.sub || ''}</small></div>
        <div class="side r"><img src="${o.right.img}" alt=""><b>${o.right.name}</b><small>${o.right.sub || ''}</small></div>
        <div class="vs">VS</div>
        <div class="ttl"><b>${o.title || ''}</b><span>${o.sub || '화면을 누르면 시작'}</span></div>`);
      let done = false;
      const end = () => { if (done) return; done = true; w.classList.add('out'); setTimeout(() => { w.remove(); res(); }, 420); };
      w.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); end(); }, true);
      document.body.appendChild(w);
      setTimeout(() => { shake(w, 2); flash('#ffd27a'); }, 620);
      setTimeout(end, o.ms || 2900);
    });
  };

  // 장 제목 카드: 처음 들어가는 장에서만
  let chapSeen = -1;
  D.resetChapters = () => { chapSeen = -1; };
  D.chapter = function (i, total, name) {
    if (i == null || i <= chapSeen) return; chapSeen = i;
    document.querySelectorAll('.dr-chap').forEach(x => x.remove());
    const c = el('div', 'dr-chap', `<small>CHAPTER ${i + 1} / ${total}</small><b>${name}</b>`);
    document.body.appendChild(c); setTimeout(() => c.remove(), 2050);
  };

  // 가로쉬 대사 → 가로쉬 영웅 옆 말풍선. G3(호령)은 크게 + 전장 흔들림, G4(패배)는 영웅이 휘청
  let tauntT = null;
  D.taunt = function (code, html) {
    if (!code || code[0] !== 'G') return;
    const hero = $('.hero[data-seat="1"]'); if (!hero) return;
    document.querySelectorAll('.dr-taunt').forEach(x => x.remove()); clearTimeout(tauntT);
    const yell = code === 'G3' || code === 'G4';
    const b = el('div', 'dr-taunt' + (yell ? ' yell' : ''), html);
    document.body.appendChild(b);
    const r = hero.getBoundingClientRect(), bw = b.offsetWidth;
    if (r.right + 14 + bw < innerWidth - 6) { b.style.left = (r.right + 14) + 'px'; b.style.top = (r.top + 6) + 'px'; }
    else { b.classList.add('below'); b.style.left = Math.max(6, Math.min(innerWidth - bw - 6, r.left)) + 'px'; b.style.top = (r.bottom + 12) + 'px'; }
    hero.classList.remove('dr-angry'); void hero.offsetWidth; if (yell) hero.classList.add('dr-angry');
    if (code === 'G3') shake('#stage', 1);
    tauntT = setTimeout(() => b.remove(), 3300);
  };

  // 타격: 영웅이 맞으면 크게, 하수인이 쓰러지면 작게
  D.impact = function (lvl) { shake('#stage', lvl); if (lvl >= 2) flash('rgba(255,90,60,.35)'); };

  // 턴 배너 (기존 '상대 턴'/'내 턴' 글자 대신)
  D.turn = function (foe, face, name) {
    document.querySelectorAll('.dr-turn').forEach(x => x.remove());
    const b = el('div', 'dr-turn' + (foe ? ' foe' : ''), `<img src="${face}" alt=""><b>${name}</b>`);
    document.body.appendChild(b); setTimeout(() => b.remove(), 1300);
  };

  // 결정타 · 승리 같은 큰 글자
  D.big = async function (text, sub, opt) {
    opt = opt || {};
    const b = el('div', 'dr-big' + (opt.red ? ' red' : ''), text + (sub ? `<small>${sub}</small>` : ''));
    document.body.appendChild(b); if (opt.flash !== false) flash(opt.red ? 'rgba(255,80,60,.45)' : 'rgba(255,220,140,.55)');
    if (opt.shake) shake('#stage', 2);
    setTimeout(() => b.remove(), 1650);
    if (opt.wait) await sleep(opt.wait);
  };

  // 긴 대사 한 줄을 문장마다 한 말풍선으로 나눈다 (태그가 문장 사이에 걸치면 나누지 않는다)
  const balanced = s => { const st = []; const re = /<\/?([a-z0-9]+)[^>]*>/gi; let m; while ((m = re.exec(s))) { if (/^(br|img|i)$/i.test(m[1]) && m[0][1] !== '/') continue; if (m[0][1] === '/') { if (st.pop() !== m[1].toLowerCase()) return false; } else st.push(m[1].toLowerCase()); } return !st.length; };
  D.split = function (lines) {
    const out = [];
    (lines || []).forEach(l => {
      const [c, t] = l;
      if (c === 'D' || typeof t !== 'string') { out.push(l); return; }
      const parts = t.split(/(?<=[.!?…])\s+(?=\S)/);
      if (parts.length > 1 && parts.every(balanced)) parts.forEach(p => out.push([c, p])); else out.push(l);
    });
    return out;
  };

  root.DRAMA = D;
})(typeof window !== 'undefined' ? window : globalThis);
