// deckcode.js (공용, v135) — 덱 코드: 덱을 한 줄 문자열로 바꿔 친구에게 보내고, 받은 코드로 덱을 가져온다
//  형식: "CD1." + base64url( deflate-raw( JSON {n:덱 이름, h:영웅 능력 id, c:[[카드 이름, 장수], ...]} ) )
//        압축을 못 쓰는 브라우저는 "CD0." + base64url(JSON) (가져오기는 둘 다 읽는다)
//  카드는 이름으로 적기 때문에 카드 순서가 바뀌거나 새 카드가 추가돼도 예전 코드가 그대로 읽힌다.
const DeckCode = (() => {
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
  const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function pipe(bytes, Stream) { const r = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))); return new Uint8Array(await r.arrayBuffer()); }
  async function encode(deck, name, heroPower) {
    const cnt = new Map(); for (const n of deck) cnt.set(n, (cnt.get(n) || 0) + 1);
    const json = JSON.stringify({ n: String(name || '').slice(0, 24), h: heroPower || '', c: [...cnt.entries()] });
    const raw = new TextEncoder().encode(json);
    if (canZip) { try { return 'CD1.' + b64u(await pipe(raw, CompressionStream)); } catch (_) {} }
    return 'CD0.' + b64u(raw);
  }
  // 텍스트 어디에 있든 코드를 찾아 읽는다. 반환 {name, heroPower, deck, unknown:[모르는 카드 이름]} 또는 {error}
  async function decode(text, pool) {
    const m = String(text || '').match(/CD([01])\.([A-Za-z0-9_-]+)/);
    if (!m) return { error: '덱 코드를 찾지 못했어요. "CD1." 로 시작하는 코드를 붙여 넣어 주세요.' };
    let obj;
    try {
      let bytes = unb64u(m[2]);
      if (m[1] === '1') { if (!canZip) return { error: '이 브라우저는 압축된 덱 코드를 읽을 수 없어요.' }; bytes = await pipe(bytes, DecompressionStream); }
      obj = JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) { return { error: '덱 코드가 깨졌어요. 처음부터 끝까지 빠짐없이 복사했는지 확인해 주세요.' }; }
    if (!obj || !Array.isArray(obj.c)) return { error: '덱 코드가 올바르지 않아요.' };
    const names = new Set((pool || []).map(c => c.name)), deck = [], unknown = [];
    for (const e of obj.c) {
      if (!Array.isArray(e)) continue;
      const nm = String(e[0]), k = Math.max(0, Math.min(10, Math.floor(Number(e[1]) || 0)));
      if (!names.has(nm)) { unknown.push(nm); continue; }
      for (let i = 0; i < k; i++) deck.push(nm);
    }
    return { name: String(obj.n || '가져온 덱').slice(0, 24), heroPower: String(obj.h || ''), deck, unknown };
  }
  return { encode, decode };
})();
if (typeof module !== 'undefined') { module.exports = { DeckCode }; }
