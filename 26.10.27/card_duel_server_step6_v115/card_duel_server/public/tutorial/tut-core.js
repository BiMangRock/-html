// tut-core.js (v140) — 3·4부 튜토리얼 공용 진행기 (화면 · 입력 · 대화 · 연출)
//  - 기본·고급 튜토리얼(index.html · advanced.html)의 진행 방식(제이나와 가로쉬의 대화, 노란 테두리 안내, 끌어서 내기)을 그대로 따른다
//  - 규칙은 실제 게임 엔진(/js/engine.js)이 처리한다. 대본은 window.TUT (part1.js · part2.js), 대본 도우미는 window.TL (tut-logic.js)
//  - 새로 다루는 것: 멀리건 창 · 영웅 능력 버튼 · 방어도 · 하수인 놓을 자리 · 선택/발견 창 · 막히는 상대 행동(모면·은신) · 과부하 잠금 표시
(function () {
  'use strict';
  const T = window.TUT, $ = q => document.querySelector(q), sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ENG = { newGame, apply, CARD_POOL };
  const NAME = { J: '제이나', G: '가로쉬' }, MOOD = { 0: 'J1', 1: 'G1' };
  const face = k => `images/${k}.jpg`;
  const FX_SPELL = { '불꽃 화살': 'fx_fire_arrow.png', '화염구': 'fx_fireball.png', '치유의 빛': 'fx_holy_heal.png' };
  const byName = new Map(CARD_POOL.map(c => [c.name, c]));
  const artHtml = n => { if (n === '동전') return '<div class="coinart">🪙</div>'; const a = artOf(n); return a ? `<img src="${a}" alt="" onerror="this.remove()">` : ''; };
  const artOf = n => { const p = (typeof CARD_ART !== 'undefined' && CARD_ART[n]) || (byName.get(n) || {}).art || ''; return p ? (p.startsWith('/') || p.startsWith('http') ? p : '/' + p) : ''; };

  let S = null, stepIdx = 0, sel = null, busy = false, enemyRun = false, lastHand = new Set(), Q = [], QT = null;
  const stepNow = () => T.steps[stepIdx];
  const findMin = (seat, id) => S.seats[seat].board.find(m => m.id === id);
  const canAttack = m => TL.canAttack(S, m);
  const keyOf = t => t.kind === 'hero' ? `h:${t.seat}` : `m:${t.seat}:${t.id}`;
  const heroPw = () => { const id = S.seats[0].heroPower; return id ? heroPowerInfo(id) : null; };
  const powerReady = () => { const P = S.seats[0], h = heroPw(); return !!h && S.turn === 0 && !S.over && !P.powerUsed && P.mana >= h.cost; };

  /* ---------- 대화 ---------- */
  function addMsg(l) {
    const box = $('#cbody .chat'); if (!box) return; box.querySelectorAll('.typing').forEach(x => x.remove());
    const [c, txt] = l;
    if (c === 'D') box.appendChild(el('div', 'msg d', '<span>' + txt + '</span>'));
    else {
      const w = c[0], d = el('div', 'msg ' + (w === 'G' ? 'g' : 'j'));
      d.innerHTML = `<img src="${face(c)}" alt=""><div class="bub"><span class="who">${NAME[w]}</span>${txt}</div>`; box.appendChild(d);
      MOOD[w === 'G' ? 1 : 0] = c; document.querySelectorAll(`.hero[data-seat="${w === 'G' ? 1 : 0}"] .av`).forEach(i => { i.src = face(c); });
    }
    const b = $('#cbody'); b.scrollTop = b.scrollHeight;
  }
  function pump() {
    clearTimeout(QT); if (!Q.length) return; const l = Q[0], box = $('#cbody .chat');
    if (l[0] !== 'D' && box && !box.querySelector('.typing')) { box.appendChild(el('div', 'msg typing' + (l[0][0] === 'G' ? ' g' : ''), '<img src="' + face(l[0]) + '" alt=""><div class="bub">•••</div>')); $('#cbody').scrollTop = 1e6; }
    QT = setTimeout(() => { addMsg(Q.shift()); pump(); }, l[0] === 'D' ? 60 : 350 + Math.min(800, l[1].replace(/<[^>]+>/g, '').length * 7));
  }
  const say = lines => { Q.push(...(lines || [])); pump(); };
  function flushSay() { clearTimeout(QT); while (Q.length) addMsg(Q.shift()); }

  /* ---------- 카드 표시 ---------- */
  const KWS = [['taunt', '도발'], ['shield', '보호막'], ['elusive', '모면'], ['lifesteal', '생명력 흡수'], ['revive', '환생'], ['stealth', '은신'], ['poison', '독성'], ['windfury', '질풍']];
  function kwList(c) { const k = KWS.filter(([f]) => c[f]).map(([, n]) => n); if (c.charge) k.push('돌진'); else if (c.rush) k.push('속공'); if (c.echo) k.push('잔상'); if (c.twin) k.push('이중 주문'); return k; }
  function effText(c) { if (c.effect && c.effect.type === 'mana') return '이번 턴 마나 +' + c.effect.value; try { return effectText(c) || ''; } catch (e) { return ''; } }
  function cardText(c) { const k = kwList(c), tx = effText(c); return [k.length ? '<b>' + k.join(' · ') + '</b>' : '', tx].filter(Boolean).join('<br>'); }
  function runeTag(c) { let r = []; try { r = runeOf(c); } catch (e) {} return r.length ? `<div class="rune">${r.map(x => x + ' 룬').join(' · ')}</div>` : ''; }
  function tagsOf(m) {
    const t = []; if (m.taunt) t.push(['taunt', '도발']); if (m.shield) t.push(['shield', '보호막']); if (m.charge) t.push(['charge', '돌진']); else if (m.rush) t.push(['rush', '속공']);
    if (m.frozen) t.push(['frz', '얼음']); if (m.elusive) t.push(['elu', '모면']); if (m.lifesteal) t.push(['ls', '흡수']); if (m.revive) t.push(['rev', '환생']);
    if (m.stealth) t.push(['st', '은신']); if (m.poison) t.push(['po', '독성']); if (m.windfury) t.push(['wf', '질풍']); if (m.silenced) t.push(['sil', '침묵']);
    return t;
  }
  function handCard(c) {
    const d = el('div', 'hc' + (c.type === 'spell' ? ' spell' : '') + (c.echoTemp ? ' echo' : ''));
    d.dataset.name = c.name; d.dataset.id = c.id;
    const cost = effCost(S.seats[0], c);
    if (cost > S.seats[0].mana || S.turn !== 0) d.classList.add('poor');
    d.innerHTML = `<div class="cost">${cost}</div><div class="art">${artHtml(c.name)}</div><div class="nm">${c.name}</div><div class="ty">${c.type === 'spell' ? '주문' : '하수인'}${c.echoTemp ? ' · 잔상' : ''}</div><div class="tx">${cardText(c)}</div>${runeTag(c)}${c.type === 'minion' ? `<div class="st a">${c.atk}</div><div class="st h">${c.hp}</div>` : ''}`;
    d.onclick = ev => { ev.stopPropagation(); onHand(c); };
    d.onmouseenter = () => inspect(c); d.onmouseleave = () => inspect(null);
    return d;
  }
  function minionEl(m, seat) {
    const d = el('div', 'mn'); d.dataset.seat = seat; d.dataset.name = m.name; d.dataset.id = m.id; d.dataset.key = `m:${seat}:${m.id}`;
    if (m.taunt) d.classList.add('taunt'); if (m.shield) d.classList.add('shielded'); if (m.frozen) d.classList.add('frozen'); if (m.stealth) d.classList.add('stealthy');
    if (seat === 0 && S.turn === 0) { if (canAttack(m)) d.classList.add('ready'); else if (m.summoned && !m.charge && !m.rush) d.classList.add('sleep'); }
    const a = artOf(m.name);
    d.innerHTML = `<div class="art">${a ? `<img src="${a}" alt="" onerror="this.remove()">` : ''}</div>` +
      (m.taunt ? '<div class="fxo" style="background-image:url(images/fx_taunt.png);opacity:.55"></div>' : '') +
      (m.shield ? '<div class="fxo" style="background-image:url(images/fx_holy_shield.png);opacity:.45"></div>' : '') +
      `<div class="tags">${tagsOf(m).map(([k, t]) => `<span class="tg ${k}">${t}</span>`).join('')}</div><div class="nm">${m.name}</div><div class="st a">${m.atk}</div><div class="st h${m.hp < m.maxHp ? ' hurt' : ''}">${m.hp}</div>`;
    d.onclick = ev => { ev.stopPropagation(); onMinion(m, seat); };
    d.onmouseenter = () => inspect(m); d.onmouseleave = () => inspect(null);
    return d;
  }
  function inspect(c, force) {
    const b = $('#inspect'); if (!c) { b.classList.remove('show', 'force'); return; }
    const isM = c.type !== 'spell';
    b.innerHTML = `<b>${c.name}</b><div class="s">${isM ? `하수인 · 공격력 ${c.atk} / 체력 ${c.hp}` : '주문'} · 비용 ${c.cost}</div>${cardText(c) || '<span style="color:var(--dim)">특수 능력 없음</span>'}${runeTag(c)}`;
    b.classList.add('show'); b.classList.toggle('force', !!force);
  }

  /* ---------- 렌더 ---------- */
  function heroPanel(seat) {
    const P = S.seats[seat], d = el('div', 'hero' + (seat === 1 ? ' foe' : ''));
    d.dataset.seat = seat; d.dataset.key = `h:${seat}`;
    if (sel && ((sel.kind === 'atk' && seat === 1) || ((sel.kind === 'cast' || sel.kind === 'power') && sel.targets.some(t => t.kind === 'hero' && t.seat === seat)))) d.classList.add('t-ok');
    let sp = 0; try { sp = seat === 0 ? spellPower(S, 0) : 0; } catch (e) {}
    d.innerHTML = `<img class="av" src="${face(MOOD[seat])}" alt=""><div class="nm">${T.heroName[seat]}</div><div class="hp">${Math.max(0, P.hp)}<small> / ${P.maxHp}</small></div>${P.armor ? `<div class="arm">🛡 방어도 ${P.armor}</div>` : ''}${sp > 0 ? `<div class="sp">주문 공격력 +${sp}</div>` : ''}`;
    d.onclick = ev => { ev.stopPropagation(); onHero(seat); };
    return d;
  }
  function powerBtn() {
    const h = heroPw(); if (!h) return null;
    const P = S.seats[0], b = el('button', 'hpw' + (P.powerUsed ? ' used' : '') + (sel && sel.kind === 'power' ? ' picked' : ''));
    b.id = 'hpBtn'; b.type = 'button';
    b.innerHTML = `<span class="ic">${h.icon}</span><span class="tx"><b>${h.name}</b><small>${P.powerUsed ? '이번 턴 사용함' : `비용 ${h.cost} · ${h.text}`}</small></span>`;
    b.disabled = !powerReady() && !(sel && sel.kind === 'power');
    b.onclick = ev => { ev.stopPropagation(); onPower(); };
    return b;
  }
  function manaRow(seat) {
    const P = S.seats[seat], w = el('div'), m = el('div', 'mana'), lock = P.locked || 0;
    for (let i = 0; i < P.maxMana; i++) m.appendChild(el('i', i < P.mana ? 'on' : (i >= P.maxMana - lock ? 'lock' : '')));
    w.appendChild(m); w.appendChild(el('div', 'mnum', `마나 ${P.mana} / ${P.maxMana}` + (lock ? ` <span class="lk">🔒${lock} 과부하</span>` : '')));
    return w;
  }
  function render() {
    const E_ = S.seats[1], M_ = S.seats[0];
    const es = $('#eSide'); es.innerHTML = ''; es.appendChild(heroPanel(1));
    const ei = $('#eInfo'); ei.innerHTML = ''; const eb = el('div', 'eback'); for (let i = 0; i < Math.min(E_.hand.length, 6); i++) eb.appendChild(el('i')); ei.appendChild(eb); ei.appendChild(el('div', 'mini', `상대 손패 ${E_.hand.length}장 · 덱 ${E_.deck.length}`));
    const ms = $('#mSide'); ms.innerHTML = ''; ms.appendChild(heroPanel(0)); const pb = powerBtn(); if (pb) ms.appendChild(pb);
    const mi = $('#mInfo'); mi.innerHTML = ''; mi.appendChild(manaRow(0)); mi.appendChild(el('div', 'mini', `덱 ${M_.deck.length}장`));
    for (const [id, seat] of [['#eBoard', 1], ['#mBoard', 0]]) {
      const b = $(id); b.innerHTML = '';
      const L = S.seats[seat].board, placing = seat === 0 && sel && sel.kind === 'place';
      if (!L.length && !placing) b.appendChild(el('span', 'empty', seat ? '상대 전장이 비었습니다' : '내 전장이 비었습니다'));
      L.forEach((m, i) => {
        if (placing) b.appendChild(gapEl(i));
        const e = minionEl(m, seat);
        if (sel && sel.kind === 'atk' && seat === 0 && sel.id === m.id) e.classList.add('picked');
        if (sel && sel.kind === 'atk' && seat === 1) e.classList.add('t-ok');
        if (sel && (sel.kind === 'cast' || sel.kind === 'power') && sel.targets.some(t => t.kind === 'minion' && t.seat === seat && t.id === m.id)) e.classList.add('t-ok');
        b.appendChild(e);
      });
      if (placing) b.appendChild(gapEl(L.length));
    }
    const h = $('#hand'); h.innerHTML = '';
    M_.hand.forEach(c => { const e = handCard(c); if (!lastHand.has(c.id)) e.classList.add('new'); if (sel && (sel.kind === 'cast' || sel.kind === 'place') && sel.card.id === c.id) e.classList.add('picked'); h.appendChild(e); });
    lastHand = new Set(M_.hand.map(c => c.id));
    const tl = $('#turnLbl'); tl.textContent = S.over ? '게임 종료' : S.turn === 0 ? '내 턴' : '상대 턴'; tl.className = 'turn' + (S.turn === 0 && !S.over ? ' me' : '');
    $('#endBtn').disabled = busy || S.turn !== 0 || S.over;
    applyHL();
  }
  function gapEl(pos) { const g = el('div', 'gap', '<i>＋</i>'); g.dataset.pos = pos; g.onclick = ev => { ev.stopPropagation(); placeAt(pos); }; return g; }
  function applyHL() {
    document.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
    const st = stepNow(); if (!st || busy) return;
    const add = q => q && document.querySelectorAll(q).forEach(e => e.classList.add('hl'));
    const tgtSel = t => !t ? null : t.hero != null ? `.hero[data-seat="${t.hero}"]` : t.any ? `.mn[data-seat="${t.seat}"].t-ok` : `.mn[data-seat="${t.seat}"][data-name="${t.name}"]`;
    if (st.type === 'play') {
      if (sel && sel.kind === 'cast') add(tgtSel(st.target));
      else if (sel && sel.kind === 'place') add(`.gap[data-pos="${st.pos}"]`);
      else add(`.hc[data-name="${st.card}"]`);
    } else if (st.type === 'attack') {
      if (sel && sel.kind === 'atk') add(tgtSel(st.target)); else add(`.mn[data-seat="0"][data-name="${st.attacker}"]`);
    } else if (st.type === 'attackAll') {
      if (sel && sel.kind === 'atk') add('.hero[data-seat="1"]'); else S.seats[0].board.forEach(m => { if (canAttack(m)) add(`.mn[data-seat="0"][data-id="${m.id}"]`); });
    } else if (st.type === 'power') {
      if (sel && sel.kind === 'power') add(tgtSel(st.target)); else add('#hpBtn');
    } else if (st.type === 'end') add('#endBtn');
  }

  /* ---------- 코치 패널 ---------- */
  function renderChap() {
    const st = T.steps.slice(0, stepIdx + 1).reverse().find(s => s.ch != null) || T.steps[0];
    const c = $('#chap'); c.innerHTML = '';
    T.chaps.forEach((n, i) => c.appendChild(el('i', i < st.ch ? 'done' : i === st.ch ? 'cur' : '')));
    $('#chapname').textContent = `${st.ch + 1}/${T.chaps.length} · ${T.chaps[st.ch]}`;
  }
  const visibleSteps = () => T.steps.filter(s => s.type !== 'enemy' && s.type !== 'win');
  function showStep() {
    const st = stepNow(); if (!st) return;
    if (st.type === 'win') return showWin();
    renderChap();
    $('#cbadge').textContent = `${visibleSteps().indexOf(st) + 1} / ${visibleSteps().length}`;
    $('#ctitle').textContent = st.title;
    say([['D', st.title], ...(st.say || [])]);
    const task = $('#ctask'); if (st.task) { task.innerHTML = '<b>해 보기</b> · ' + st.task; task.style.display = ''; } else task.style.display = 'none';
    $('#cerr').className = 'err'; $('#cnudge').className = 'nudge';
    const nb = $('#cnext'); nb.style.display = st.type === 'info' ? '' : 'none'; nb.disabled = busy;
    sel = null; render();
    if (st.coinToss) coinToss();
    if (st.type === 'mulligan') openMulligan(st);
  }
  function nudge(msg) { const n = $('#cnudge'); n.textContent = msg || '안내를 따라 주세요.'; n.classList.add('show'); const c = $('#coach'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  function toast(msg) { const t = el('div', 'toast', msg); document.body.appendChild(t); setTimeout(() => t.remove(), 2500); }
  function banner(msg) { const b = el('div', 'banner', msg); document.body.appendChild(b); setTimeout(() => b.remove(), 1200); }
  function bcb(text, cls, p) { const b = el('div', 'bcb ' + (cls || ''), text); b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; $('#fxl').appendChild(b); setTimeout(() => b.remove(), 1550); }
  const infoNudge = st => st.type === 'info' ? '"다음" 버튼을 눌러 주세요.' : (st.nudge || '안내를 따라 주세요.');

  /* ---------- 동전 던지기 · 멀리건 ---------- */
  function coinToss() {
    const o = el('div', 'coinfx', '<div class="coin"><b>🪙</b></div><div class="lbl">동전 던지기…</div>'); $('#stage').appendChild(o);
    setTimeout(() => { o.querySelector('.lbl').innerHTML = '<b>가로쉬 선공</b> · 제이나 후공 <small>(카드 +1 · 동전)</small>'; }, 1300);
    setTimeout(() => o.classList.add('out'), 3600); setTimeout(() => o.remove(), 4200);
  }
  function openMulligan(st) {
    const P = S.seats[0], pick = new Set();
    const ov = el('div', 'disc mull'); ov.innerHTML = '<h4>멀리건 — 바꿀 카드를 고르세요</h4><div class="opts"></div><div class="sub">고른 카드는 덱으로 돌아가고 새 카드를 뽑습니다 · 후공이라 <b>동전</b>도 받아요</div><div class="mbtns"><button class="cbtn" id="mullGo">바꾸기</button></div>';
    const box = ov.querySelector('.opts');
    P.hand.filter(c => c.name !== '동전').forEach(c => {
      const d = handCard(c); d.onclick = ev => { ev.stopPropagation(); if (pick.has(c.name)) pick.delete(c.name); else pick.add(c.name); d.classList.toggle('swap', pick.has(c.name)); upd(); };
      if (st.swap.includes(c.name)) d.classList.add('hl');
      box.appendChild(d);
    });
    const go = ov.querySelector('#mullGo'), upd = () => { go.textContent = pick.size ? `바꾸기 (${pick.size}장)` : '바꾸기'; };
    go.onclick = async ev => {
      ev.stopPropagation();
      const ok = pick.size === st.swap.length && st.swap.every(n => pick.has(n));
      if (!ok) return nudge(st.nudge);
      busy = true; go.disabled = true;
      box.querySelectorAll('.hc.swap').forEach(x => x.classList.add('gone'));
      await sleep(500);
      TL.mulligan(S, 0, st.swap, st.get); ov.remove(); render();   // busy 는 advance() 가 푼다
      const p = center(rectOf('h:0')); floatTxt(st.get.join(', ') + ' 받음!', 'txt', { x: p.x + 60, y: p.y - 30 });
      await sleep(600); advance();
    };
    $('#stage').appendChild(ov);
  }

  /* ---------- 입력 ---------- */
  function onHand(c) {
    if (busy || S.over) return;
    const st = stepNow();
    if (st.type !== 'play') return nudge(infoNudge(st));
    if (c.name !== st.card) return nudge(st.nudge);
    if (effCost(S.seats[0], c) > S.seats[0].mana) return toast('마나가 부족합니다.');
    if (sel && sel.kind === 'place' && sel.card.id === c.id) { sel = null; render(); return; }
    const ts = cardTargets(S, 0, c);
    if (ts.length) { sel = { kind: 'cast', card: c, targets: ts }; render(); return; }
    if (c.type === 'minion' && st.pos != null && S.seats[0].board.length) { sel = { kind: 'place', card: c }; render(); return; }
    dispatch({ type: 'PLAY_CARD', cardId: c.id, target: null });
  }
  function placeAt(pos) { if (!sel || sel.kind !== 'place') return; dispatch({ type: 'PLAY_CARD', cardId: sel.card.id, target: null, pos }); }
  function onPower() {
    if (busy || S.over) return;
    const st = stepNow();
    if (sel && sel.kind === 'power') { sel = null; render(); return; }
    if (st.type !== 'power') return nudge(infoNudge(st));
    const P = S.seats[0], h = heroPw();
    if (P.powerUsed) return toast('영웅 능력은 턴마다 한 번만 쓸 수 있습니다.');
    if (P.mana < h.cost) return toast('마나가 부족합니다.');
    const ts = heroPowerTargets(S, 0);
    if (ts.length) { sel = { kind: 'power', targets: ts }; render(); return; }
    dispatch({ type: 'HERO_POWER', target: null });
  }
  function onMinion(m, seat) {
    if (busy || S.over) return;
    const st = stepNow();
    if (sel && (sel.kind === 'cast' || sel.kind === 'power')) return aimAt({ kind: 'minion', seat, id: m.id });
    if (seat === 0) {
      if (st.type !== 'attack' && st.type !== 'attackAll') return nudge(infoNudge(st));
      if (!canAttack(m)) return toast(m.summoned && !m.charge && !m.rush ? '소환 직후라 공격할 수 없습니다. (zZ)' : '지금은 공격할 수 없습니다.');
      if (st.type !== 'attackAll' && m.name !== st.attacker) return nudge(st.nudge);
      sel = (sel && sel.kind === 'atk' && sel.id === m.id) ? null : { kind: 'atk', id: m.id }; render();
    } else {
      if (sel && sel.kind === 'atk') return dispatch({ type: 'ATTACK', attackerId: sel.id, target: { kind: 'minion', seat: 1, id: m.id } });
      nudge(st.type === 'info' ? '"다음" 버튼을 눌러 주세요.' : (st.nudge || '먼저 공격할 내 하수인을 고르세요.'));
    }
  }
  function onHero(seat) {
    if (busy || S.over) return;
    if (sel && (sel.kind === 'cast' || sel.kind === 'power')) return aimAt({ kind: 'hero', seat });
    if (sel && sel.kind === 'atk' && seat === 1) return dispatch({ type: 'ATTACK', attackerId: sel.id, target: { kind: 'hero', seat: 1 } });
    if (seat === 1) nudge(infoNudge(stepNow()));
  }
  function aimAt(t) {
    if (!sel.targets.some(x => keyOf(x) === keyOf(t))) return toast('그 대상은 고를 수 없습니다.');
    if (sel.kind === 'power') return dispatch({ type: 'HERO_POWER', target: t });
    dispatch({ type: 'PLAY_CARD', cardId: sel.card.id, target: t });
  }
  $('#endBtn').onclick = () => { if (busy || S.over || S.turn !== 0) return; dispatch({ type: 'END_TURN' }); };
  $('#cnext').onclick = () => { if (busy) return; if (stepNow().type === 'info') advance(); };
  $('#stage').onclick = () => { if (sel) { sel = null; render(); } };
  $('#restart').onclick = () => init();

  function verdictOf(st, a) {
    const P = S.seats[0];
    if (st.type === 'play') {
      if (a.type !== 'PLAY_CARD') return false;
      const c = P.hand.find(x => x.id === a.cardId);
      if (!c || c.name !== st.card || !TL.sameTarget(S, st.target || null, a.target || null)) return false;
      if (st.pos != null && P.board.length && a.pos !== st.pos) return 'pos';
      return true;
    }
    if (st.type === 'attack') { if (a.type !== 'ATTACK') return false; const m = findMin(0, a.attackerId); return !!m && m.name === st.attacker && TL.sameTarget(S, st.target, a.target); }
    if (st.type === 'attackAll') return a.type === 'ATTACK' && a.target.kind === 'hero' && a.target.seat === 1;
    if (st.type === 'power') return a.type === 'HERO_POWER' && TL.sameTarget(S, st.target || null, a.target || null);
    if (st.type === 'end') return a.type === 'END_TURN';
    return false;
  }
  async function dispatch(a) {
    if (busy) return;
    const st = stepNow(), v = verdictOf(st, a);
    if (v !== true) { sel = null; render(); return nudge(v === 'pos' ? '반짝이는 자리에 놓아 보세요.' : st.nudge); }
    sel = null;
    try { await perform(a, 0); } catch (e) { return; }
    if (S.pending) await runPick(st);
    if (st.type === 'attackAll' && !S.over) { render(); return; }
    advance();
  }

  /* ---------- 선택·발견 창 ---------- */
  function runPick(st) {
    return new Promise(res => {
      const P = S.pending; if (!P) { res(); return; }
      busy = true;
      const isChoice = P.kind === 'choice';
      const ov = el('div', 'disc'); ov.innerHTML = `<h4>${isChoice ? '선택 — 하나를 고르세요' : '발견 — 하나를 고르세요'}</h4><div class="opts"></div><div class="sub">${isChoice ? '고른 효과 하나만 발동합니다' : '고르지 않은 카드는 사라집니다'}</div>`;
      const box = ov.querySelector('.opts');
      P.options.forEach((o, i) => {
        const d = isChoice ? el('div', 'choice', `<b>${o.name}</b>`) : handCard({ ...o, id: -1 - i });
        if (o.name === st.pick) d.classList.add('hl');
        d.onclick = async ev => {
          ev.stopPropagation();
          if (st.pick && o.name !== st.pick) return nudge(st.pickNudge || ('이번엔 ' + st.pick + '을(를) 골라 보세요.'));
          const r = apply(S, { type: 'CHOOSE', index: i }, 0); if (!r.ok) { toast(r.error); return; }
          const rects = snapRects(); S = r.state; ov.remove(); render();   // busy 는 다음 단계로 넘어갈 때(advance) 풀린다
          await playEvents(r.events, rects.rects, rects.clones, null);
          render(); await sleep(300); res();
        };
        box.appendChild(d);
      });
      $('#stage').appendChild(ov);
    });
  }

  /* ---------- 실행 + 연출 ---------- */
  function rectOf(key) { const e = document.querySelector(`[data-key="${key}"]`); return e ? e.getBoundingClientRect() : null; }
  const center = r => r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
  function fxImg(file, pos, size = 140) { const i = el('img', 'fximg'); i.src = 'images/' + file; i.style.left = pos.x + 'px'; i.style.top = pos.y + 'px'; i.style.width = size + 'px'; $('#fxl').appendChild(i); setTimeout(() => i.remove(), 1000); }
  function floatTxt(txt, cls, pos) { const f = el('div', 'flt ' + cls, txt); f.style.left = pos.x + 'px'; f.style.top = pos.y + 'px'; $('#fxl').appendChild(f); setTimeout(() => f.remove(), 1150); }
  async function lunge(atkKey, tgtKey) {
    const a = document.querySelector(`[data-key="${atkKey}"]`), t = document.querySelector(`[data-key="${tgtKey}"]`); if (!a || !t) return;
    const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect(), dx = (rt.left + rt.width / 2) - (ra.left + ra.width / 2), dy = (rt.top + rt.height / 2) - (ra.top + ra.height / 2);
    a.style.zIndex = 30; a.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx * 0.85}px,${dy * 0.85}px) scale(1.12)`, offset: 0.55 }, { transform: 'translate(0,0)' }], { duration: 420, easing: 'ease-in-out' });
    await sleep(230);
  }
  function snapRects() { const rects = {}, clones = {}; document.querySelectorAll('[data-key]').forEach(e => { rects[e.dataset.key] = e.getBoundingClientRect(); if (e.classList.contains('mn')) clones[e.dataset.key] = e.cloneNode(true); }); return { rects, clones }; }
  async function perform(a, actor) {
    busy = true; $('#endBtn').disabled = true; applyHL();
    const { rects, clones } = snapRects();
    const played = a.type === 'PLAY_CARD' ? S.seats[actor].hand.find(c => c.id === a.cardId) : null;
    if (a.type === 'ATTACK') await lunge(`m:${actor}:${a.attackerId}`, keyOf(a.target));
    const r = apply(S, a, actor);
    if (!r.ok) { busy = enemyRun; toast(r.error); render(); throw new Error(r.error); }
    S = r.state; render();
    await playEvents(r.events, rects, clones, played, actor);
    busy = enemyRun; render();                         // 상대 턴 동안은 계속 잠가 둔다
  }
  async function playEvents(evs, rects, clones, played) {
    for (const e of evs) {
      const at = k => center(rectOf(k) || rects[k]);
      if (e.type === 'spell' && e.card) {
        const wrap = el('div', 'spellshow'), hc = el('div', 'hc spell'), c = e.card;
        hc.innerHTML = `<div class="cost">${c.cost}</div><div class="art">${artHtml(c.name)}</div><div class="nm">${c.name}</div><div class="ty">주문</div><div class="tx">${cardText(c)}</div>`;
        wrap.appendChild(hc); document.body.appendChild(wrap); setTimeout(() => wrap.remove(), 1200); await sleep(650);
      } else if (e.type === 'summon') {
        const p = at(`m:${e.seat}:${e.id}`); fxImg('fx_summon_crack.png', p, 150);
        if (played && played.effect && played.type === 'minion' && played.name === e.name) bcb('전투의 함성!', '', { x: p.x, y: p.y - (e.seat ? -10 : 10) });
        await sleep(420);
      } else if (e.type === 'draw') {
        if (e.count > 0 && e.seat === 0 && e.src) { const p = at('h:0'); floatTxt(`카드 ${e.count}장 뽑기`, 'txt', { x: p.x + 60, y: p.y - 30 }); await sleep(420); }
      } else if (e.type === 'damage') {
        const k = keyOf(e.target), p = center(rects[k] || rectOf(k)), sp = e.src && e.src.spell ? e.src.name : null;
        if (e.absorbed) { fxImg('fx_a_shield.png', p, 130); floatTxt('보호막!', 'sh', p); }
        else if (e.amount > 0) { if (sp && FX_SPELL[sp]) fxImg(FX_SPELL[sp], p, 170); else fxImg('fx_a_slash.png', p, 110); floatTxt('-' + e.amount, 'dmg', p); }
        if (e.armorHit) floatTxt('🛡-' + e.armorHit, 'sh', { x: p.x, y: p.y + 34 });
        await sleep(e.absorbed || e.amount > 0 ? 400 : 0);
      } else if (e.type === 'heal') {
        if (e.amount > 0) { const p = at(keyOf(e.target)); fxImg('fx_holy_heal.png', p, 130); floatTxt('+' + e.amount, 'heal', p); await sleep(420); }
      } else if (e.type === 'armor') {
        const p = at(`h:${e.seat}`); floatTxt('🛡 +' + e.amount, 'sh', p); await sleep(420);
      } else if (e.type === 'death') {
        const k = `m:${e.seat}:${e.id}`, c = clones[k], r = rects[k];
        if (e.dr && r) bcb('죽음의 메아리!', 'dr', center(r));
        if (c && r) { c.className += ' ghost'; Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0 }); document.body.appendChild(c); setTimeout(() => c.remove(), 800); }
        await sleep(e.dr ? 650 : 300);
      } else if (e.type === 'revive') {
        bcb('환생!', 'rev', at(`m:${e.seat}:${e.id}`)); await sleep(700);
      } else if (e.type === 'freeze') { floatTxt('얼음!', 'sh', at(keyOf(e.target))); await sleep(350); }
      else if (e.type === 'silence') { bcb('침묵!', 'sil', at(keyOf(e.target))); await sleep(650); }
      else if (e.type === 'transform') { bcb(`변신! → ${e.to || ''}`, 'rev', at(keyOf(e.target))); await sleep(750); }
      else if (e.type === 'overload' && e.seat === 0) { bcb(`과부하 (${e.amount})`, 'ovl', { x: innerWidth / 2, y: innerHeight * 0.55 }); await sleep(650); }
      else if (e.type === 'mana' && e.seat === 0) { const p = at('h:0'); floatTxt('마나 +' + (e.amount || e.value || ''), 'txt', { x: p.x + 60, y: p.y - 30 }); await sleep(420); }
      else if ((e.type === 'generated' || e.type === 'twin' || e.type === 'echoCopy' || e.type === 'echo') && e.seat === 0) { const p = at('h:0'); floatTxt((e.name || '카드') + ' 복사본!', 'txt', { x: p.x + 60, y: p.y - 30 }); await sleep(450); }
      else if (e.type === 'heroPower') { const p = at(`h:${e.seat}`); bcb((e.name || '영웅 능력') + '!', '', { x: p.x, y: p.y - 50 }); await sleep(450); }
      else if (e.type === 'turn_start' && e.seat === 0) { banner('내 턴'); await sleep(500); }
    }
  }

  /* ---------- 상대 턴 (고정 대본) ---------- */
  async function runEnemy(n) {
    const turn = T.enemyTurns[n];
    busy = enemyRun = true; render(); banner('상대 턴'); await sleep(1000);
    for (const act of turn.acts) {
      const a = TL.enemyAction(S, act);
      if (TL.isBlocked(act)) {
        if (a.type === 'PLAY_CARD') {
          const c = S.seats[1].hand.find(x => x.id === a.cardId), wrap = el('div', 'spellshow');
          wrap.innerHTML = `<div class="lbl">가로쉬: ${c.name} → ${act.target.name || '영웅'}?</div>`; document.body.appendChild(wrap); setTimeout(() => wrap.remove(), 1200);
          await sleep(700);
        } else await lunge(keyOf(TL.target(S, { seat: 1, name: act.blockedAttack })), keyOf(a.target));
        const r = apply(S, a, 1);
        if (!r.ok) { bcb(act.why || r.error, 'frz', center(rectOf(keyOf(a.target)))); toast(act.why || r.error); await sleep(1400); }
        continue;
      }
      await perform(a, 1); await sleep(450);
    }
    await perform({ type: 'END_TURN' }, 1); await sleep(300);
    enemyRun = false;
  }
  async function advance() {
    flushSay(); stepIdx++; sel = null;
    while (stepNow() && stepNow().type === 'enemy') { const n = stepNow().turn; await runEnemy(n); say(T.enemyTurns[n].say || []); stepIdx++; }
    busy = false; showStep();
  }

  /* ---------- 승리 · 보상 ---------- */
  let tutDone = null;
  function reportDone() {
    tutDone = { state: 'saving' };
    fetch('/api/tutorial/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ tutorial: T.id }) })
      .then(r => r.status === 401 ? { state: 'login' } : r.ok ? r.json().then(d => ({ state: (d.state && d.state[T.id]) || 'ready', reward: d.rewardText })) : { state: 'net' })
      .catch(() => ({ state: 'net' })).then(x => { tutDone = x; paintReward(); });
  }
  function paintReward() {
    const box = $('#tutReward'); if (!box || !tutDone) return;
    const st = tutDone.state, rw = tutDone.reward || T.rewardText || '보상';
    box.innerHTML = st === 'ready' ? `🎁 <b>첫 완료 보상(${rw})</b>이 준비됐어요!<br><small>메인 메뉴 → 📜 퀘스트 → 🌱 첫 걸음에서 받을 수 있어요.</small><br><a class="cbtn" style="display:inline-block;margin-top:8px;text-decoration:none" href="/#quests">🎁 보상 받으러 가기</a>`
      : st === 'claimed' ? '<small>첫 완료 보상은 이미 받았어요.</small>'
      : st === 'login' ? `<small>로그인하고 끝내면 첫 완료 보상을 받을 수 있어요. <a href="/login.html" style="color:var(--gold)">로그인</a></small>`
      : st === 'net' ? '<small>⚠ 서버에 연결하지 못해 완료 기록을 남기지 못했어요. 다시 끝내면 기록돼요.</small>'
      : '<small>완료 기록 저장 중…</small>';
  }
  function showWin() {
    reportDone(); flushSay(); MOOD[1] = 'G4'; say(T.win.say);
    renderChap(); $('#ctitle').textContent = '승리!'; $('#ctask').style.display = 'none'; $('#cbadge').textContent = '완료'; $('#cnext').style.display = 'none';
    const next = T.next ? (T.next.menuTour ? `<a class="cbtn" style="flex:none;text-decoration:none" href="/#tour">${T.next.name} ▶</a>` : `<a class="cbtn" style="flex:none;text-decoration:none" href="${T.next.url}">${T.next.name} ▶</a>`) : '';
    setTimeout(() => {
      modal(`<div class="vict"><img src="images/fx_victory.png" alt=""><h3>${T.win.title}</h3><ul>${T.win.items.map(x => `<li>${x}</li>`).join('')}</ul>
        <div id="tutReward" class="tut-reward"></div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap"><button class="cbtn alt" style="flex:none" onclick="closeModal()">전장 보기</button><button class="cbtn alt" style="flex:none" onclick="document.getElementById('gloss').click()">규칙 도감</button><button class="cbtn alt" style="flex:none" onclick="closeModal();TUTCORE.init()">다시 하기</button>${next}</div></div>`);
      paintReward();
    }, 900);
  }
  function modal(html) { $('#modal').innerHTML = html; $('#over').classList.add('show'); }
  function closeModal() { $('#over').classList.remove('show'); }
  $('#over').onclick = e => { if (e.target.id === 'over') closeModal(); };
  $('#gloss').onclick = () => modal(`<button class="tbtn x" onclick="closeModal()">닫기</button><h3>규칙 도감</h3><dl>${T.gloss.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`);

  /* ---------- 끌어서 내기·공격·영웅 능력 + 길게 눌러 설명 (클릭도 그대로 된다) ---------- */
  (function drag() {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('id', 'dragArrow');
    svg.innerHTML = '<defs><marker id="dah" markerWidth="10" markerHeight="9" refX="7" refY="4.5" orient="auto"><polygon points="0 0,10 4.5,0 9" fill="#e8c36a"/></marker></defs><line x1="0" y1="0" x2="0" y2="0" stroke="#e8c36a" stroke-width="5" stroke-linecap="round" marker-end="url(#dah)"/>';
    document.body.appendChild(svg); const line = svg.querySelector('line');
    let st = null, eat = 0, lpT = null, lpAt = null, lpOn = false;
    const handOf = id => S.seats[0].hand.find(x => x.id === id);
    const cardAt = t => { const hc = t.closest && t.closest('.hc'), mn = t.closest && t.closest('.mn'); if (hc && hc.closest('#hand')) return handOf(Number(hc.dataset.id)); if (mn) return findMin(Number(mn.dataset.seat), Number(mn.dataset.id)); return null; };
    const fromEl = () => st.kind === 'atk' ? document.querySelector(`.mn[data-seat="0"][data-id="${st.m.id}"]`) : st.kind === 'power' ? $('#hpBtn') : document.querySelector(`#hand .hc[data-id="${st.c.id}"]`);
    function arrow(x, y) { const a = fromEl(); if (!a) return; const r = a.getBoundingClientRect(); svg.style.display = 'block'; line.setAttribute('x1', r.left + r.width / 2); line.setAttribute('y1', r.top + r.height * 0.3); line.setAttribute('x2', x); line.setAttribute('y2', y); }
    function down(e) {
      eat = 0; clearTimeout(lpT); lpAt = null;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target; if (!t.closest || t.closest('.disc') || t.closest('.over')) return;
      if (e.pointerType !== 'mouse') { const c = cardAt(t); if (c) { lpAt = { x: e.clientX, y: e.clientY }; lpT = setTimeout(() => { lpOn = true; cancel(); inspect(c, true); }, 430); } }
      if (busy || S.over || S.turn !== 0 || st) return;
      const hc = t.closest('#hand .hc'), mn = t.closest('.mn[data-seat="0"]'), pw = t.closest('#hpBtn');
      if (hc) { const c = handOf(Number(hc.dataset.id)); if (c) st = { kind: 'hand', c, x0: e.clientX, y0: e.clientY, pid: e.pointerId }; }
      else if (mn) { const m = findMin(0, Number(mn.dataset.id)); if (m) st = { kind: 'atk', m, x0: e.clientX, y0: e.clientY, pid: e.pointerId }; }
      else if (pw && !pw.disabled) st = { kind: 'power', x0: e.clientX, y0: e.clientY, pid: e.pointerId };
    }
    function begin() {
      st.on = true; document.body.classList.add('dragging');
      if (st.kind === 'atk') { if (!(sel && sel.kind === 'atk' && sel.id === st.m.id)) onMinion(st.m, 0); if (!(sel && sel.kind === 'atk' && sel.id === st.m.id)) st.dead = true; return; }
      if (st.kind === 'power') { if (!(sel && sel.kind === 'power')) onPower(); if (!(sel && sel.kind === 'power')) st.dead = true; return; }
      const c = st.c;
      if (cardTargets(S, 0, c).length) { if (!(sel && sel.kind === 'cast' && sel.card.id === c.id)) onHand(c); if (!(sel && sel.kind === 'cast' && sel.card.id === c.id)) { st.dead = true; return; } st.aim = true; return; }
      const src = document.querySelector(`#hand .hc[data-id="${c.id}"]`); if (!src) { st.dead = true; return; }
      const r = src.getBoundingClientRect(), g = src.cloneNode(true);
      g.classList.add('drag-float'); g.classList.remove('hl', 'new', 'picked'); g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      document.body.appendChild(g); st.float = g; st.fw = r.width; st.fh = r.height; src.classList.add('dragging');
    }
    const overField = (x, y) => { const s = $('#stage').getBoundingClientRect(), h = $('#hand').getBoundingClientRect(); return x >= s.left && x <= s.right && y >= s.top && y <= s.bottom && !(y >= h.top - 4 && x >= h.left && x <= h.right); };
    const dropPos = x => { const L = [...document.querySelectorAll('#mBoard .mn')]; let p = 0; L.forEach(m => { const r = m.getBoundingClientRect(); if (x > r.left + r.width / 2) p++; }); return p; };
    function move(e) {
      if (lpAt && Math.hypot(e.clientX - lpAt.x, e.clientY - lpAt.y) > 9) { clearTimeout(lpT); lpAt = null; }
      if (!st || e.pointerId !== st.pid) return;
      if (!st.on) { if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < 8 || lpOn) return; begin(); }
      if (st.dead) return;
      e.preventDefault();
      if (st.kind !== 'hand' || st.aim) { arrow(e.clientX, e.clientY); return; }
      st.float.style.transform = `translate(${e.clientX - st.fw / 2}px,${e.clientY - st.fh * 0.6}px) rotate(-4deg) scale(1.05)`;
      st.float.classList.toggle('drop-ok', overField(e.clientX, e.clientY));
    }
    function clear() { if (st && st.float) st.float.remove(); document.querySelectorAll('.hc.dragging').forEach(x => x.classList.remove('dragging')); svg.style.display = 'none'; document.body.classList.remove('dragging'); st = null; }
    function up(e) {
      clearTimeout(lpT); lpAt = null;
      if (lpOn) { lpOn = false; inspect(null); eat = Date.now() + 600; }
      if (!st || e.pointerId !== st.pid) return;
      const s = st; if (!s.on) { st = null; return; }
      eat = Date.now() + 600; if (s.float) s.float.style.display = 'none'; svg.style.display = 'none';
      const elx = document.elementFromPoint(e.clientX, e.clientY); clear();
      if (s.dead) return;
      const mn = elx && elx.closest && elx.closest('.mn'), he = elx && elx.closest && elx.closest('.hero');
      if (s.kind !== 'hand' || s.aim) {
        const t = mn ? { kind: 'minion', seat: Number(mn.dataset.seat), id: Number(mn.dataset.id) } : he ? { kind: 'hero', seat: Number(he.dataset.seat) } : null;
        if (t && s.kind === 'atk') { if (t.seat === 1) return dispatch({ type: 'ATTACK', attackerId: s.m.id, target: t }); }
        else if (t) return aimAt(t);
        sel = null; render(); return;
      }
      if (!overField(e.clientX, e.clientY)) return;
      const stp = stepNow();
      if (s.c.type === 'minion' && stp && stp.type === 'play' && stp.pos != null && S.seats[0].board.length && s.c.name === stp.card) return dispatch({ type: 'PLAY_CARD', cardId: s.c.id, target: null, pos: dropPos(e.clientX) });
      onHand(s.c);
    }
    function cancel() { if (!st) return; const s = st; clear(); if (s.on && !s.dead) { sel = null; render(); } }
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, { passive: false, capture: true });
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', () => { clearTimeout(lpT); if (lpOn) { lpOn = false; inspect(null); } cancel(); }, true);
    window.addEventListener('click', e => { if (Date.now() < eat) { eat = 0; e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.hc,.mn')) e.preventDefault(); });
    document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.hc,.mn,.hero,#hpBtn')) e.preventDefault(); });
  })();

  function init() {
    closeModal(); flushSay(); Q = []; MOOD[0] = 'J1'; MOOD[1] = 'G1';
    $('#cbody').innerHTML = '<div class="chat"></div>';
    document.querySelectorAll('#stage .disc,#stage .coinfx').forEach(x => x.remove());
    S = T.buildState(ENG, TL); stepIdx = 0; sel = null; busy = false; lastHand = new Set(S.seats[0].hand.map(c => c.id));
    document.querySelectorAll('#fxl>*').forEach(e => e.remove());
    $('#ttl').textContent = T.title;
    showStep();
  }
  window.closeModal = closeModal;
  window.TUTCORE = { init, get S() { return S; }, get stepIdx() { return stepIdx; }, get busy() { return busy; }, showWin };
  init();
})();
