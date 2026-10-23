// Usage: node import-laws.js "file.pdf=Source name:1-10,22,40-45" [more files...]
//   file   = PDF or .txt of an Act. `=Source name` labels it. `:ranges` keeps only those section/article numbers
//            (e.g. only the rights chapter of the Constitution). Omit ranges to keep everything.
// Writes data/laws.json (replaces the previous library) and keeps the built-in summaries for Acts you did not supply,
// tagged "[summary, verify]". Needs `npm install` (pdf-parse) or the `pdftotext` command for PDFs.
'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { LAWS_FILE, SEED } = require('./rag');
async function toText(file) {
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, 'utf8');
  try { return cp.execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 1 << 28 }).toString(); } catch {}
  try { return (await require('pdf-parse')(fs.readFileSync(file))).text; } catch {}
  throw new Error('Cannot read ' + file + '. Run: npm install   (installs pdf-parse) and try again.');
}
function parseRanges(s) {
  if (!s) return null; const set = new Set();
  for (const p of s.split(',')) { const [a, b] = p.split('-').map(Number); for (let i = a; i <= (b || a); i++) set.add(i); }
  return set;
}
async function load(spec) {
  const m = spec.match(/^(.*?)(?:=([^:]*))?(?::([\d,\- ]+))?$/);
  const file = m[1], source = (m[2] || path.basename(file).replace(/\.\w+$/, '')).trim(), only = parseRanges(m[3]);
  const text = (await toText(file)).replace(/\r/g, '').replace(/\ufb01/g, 'fi').replace(/\ufb02/g, 'fl').replace(/[ \t]+/g, ' ');
  const parts = text.split(/\n(?=\s*\d{1,3}\.\s+[A-Z][a-z])/), seen = new Set(), out = [];
  for (const p of parts) {
    const t = p.replace(/\s+/g, ' ').trim();
    if (t.length < 80 || /\.{6,}/.test(t)) continue;                 // skip table-of-contents lines
    const h = p.trim().split('\n')[0].replace(/\s+/g, ' ').match(/^(\d{1,3})\.\s+(.{3,90}?)\.?$/); if (!h) continue;
    const n = +h[1]; if (seen.has(n)) continue; seen.add(n);          // first occurrence only (later ones are schedules)
    if (only && !only.has(n)) continue;
    for (let i = 0; i < Math.min(t.length, 1800); i += 900) out.push({ source, ref: (i ? '(cont.) ' : '') + h[1] + '. ' + h[2].trim(), text: t.slice(i, i + 900) });
  }
  console.log(`  ${source}: ${out.length} passages`); return out;
}
(async () => {
  const specs = process.argv.slice(2); if (!specs.length) { console.log('Usage: node import-laws.js "file.pdf=Source name:1-10,22" ...'); process.exit(1); }
  let all = []; for (const s of specs) all = all.concat(await load(s));
  if (!all.length) throw new Error('No readable text found (scanned PDF? it needs OCR first).');
  const names = specs.map(s => (s.match(/=([^:]*)/) || [])[1]).filter(Boolean).map(x => x.trim().toLowerCase());
  for (const s of SEED) { const n = s.source.toLowerCase(); if (!names.some(x => x.includes(n) || n.includes(x))) all.push({ ...s, source: s.source + ' [summary, verify]' }); }
  fs.mkdirSync(path.dirname(LAWS_FILE), { recursive: true }); fs.writeFileSync(LAWS_FILE, JSON.stringify(all));
  console.log(`Saved ${all.length} passages to data/laws.json. Restart the server.`);
})().catch(e => { console.error(e.message); process.exit(1); });
