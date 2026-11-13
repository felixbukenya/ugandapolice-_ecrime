// Tiny QR code generator (byte mode, error-correction level M, versions 1-10 = up to 213 bytes).
// Written for SafeReport UG so the receipt QR works offline (no CDN). Usage: QR.svg('https://…', {scale:4, margin:4})
(function (g) {
  'use strict';
  const ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // error-correction codewords per block, level M, versions 1-10
  const BLK = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];              // number of blocks, level M, versions 1-10
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataWords = v => Math.floor(rawModules(v) / 8) - ECC[v - 1] * BLK[v - 1];
  const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
  function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => r[i] ^= gfMul(c, f)); } return r; }
  const utf8 = s => Array.from(new TextEncoder().encode(s));

  function interleave(data, v) {
    const nb = BLK[v - 1], el = ECC[v - 1], raw = Math.floor(rawModules(v) / 8), ns = nb - raw % nb, sl = Math.floor(raw / nb), div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + sl - el + (i < ns ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div); if (i < ns) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const out = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== sl - el || j >= ns) out.push(b[i]); });
    return out;
  }

  function build(text) {
    const bytes = utf8(text); let v = 1;
    for (; v <= 10; v++) if (4 + (v <= 9 ? 8 : 16) + 8 * bytes.length <= dataWords(v) * 8) break;
    if (v > 10) throw new Error('QR text too long');
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v <= 9 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataWords(v) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    const all = interleave(data, v), size = v * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    let pos = []; if (v > 1) { const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2; pos = [6]; for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p); }
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) { if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const bit = (x, i) => ((x >>> i) & 1) !== 0;
    const formatBits = mask => {   // level M = 00
      const d = mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i)); set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);
    };
    formatBits(0);
    if (v >= 7) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); const b = (v << 12) | rem; for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); } }
    // place data bits in the zig-zag order
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && k < all.length * 8) { mod[y][x] = bit(all[k >>> 3], 7 - (k & 7)); k++; }
      }
    }
    const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const flip = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const lines = []; for (let y = 0; y < size; y++) lines.push(mod[y].map(Number).join('')); for (let x = 0; x < size; x++) lines.push(mod.map(r => Number(r[x])).join(''));
      for (const s of lines) { const runs = s.match(/0{5,}|1{5,}/g) || []; runs.forEach(r => p += r.length - 2); p += 40 * ((s.match(/(?=00001011101|10111010000)/g) || []).length); }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      for (const r of mod) for (const c of r) if (c) dark++;
      return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { flip(m); formatBits(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } flip(m); }
    flip(best); formatBits(best);
    return mod;
  }

  function svg(text, o = {}) {
    const m = build(text), n = m.length, q = o.margin == null ? 4 : o.margin, s = o.scale || 4, W = (n + q * 2) * s;
    let d = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${(x + q) * s} ${(y + q) * s}h${s}v${s}h-${s}z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${o.size || W}" height="${o.size || W}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${W}" height="${W}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  g.QR = { svg, matrix: build };
})(typeof window !== 'undefined' ? window : globalThis);
