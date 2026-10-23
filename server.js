// SafeReport UG - e-Crime reporting system (backend)
// Database: MySQL/MariaDB from XAMPP (default) or SQLite. See config.js and db.js.
// Run:  npm install   (once)   then   node server.js     then open http://localhost:3000
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const openDb = require('./db');
const rag = require('./rag');

const PORT = config.port;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- database (opened in start() at the bottom) ----------
let db;

// ---------- constants ----------
const DISTRICTS = ['Kampala','Wakiso','Mukono','Entebbe','Jinja','Mbarara','Gulu','Lira','Mbale','Masaka','Fort Portal','Arua','Kabale','Soroti','Hoima','Kasese','Tororo','Iganga','Busia','Luwero','Mityana','Mpigi','Kayunga','Buikwe','Kamuli','Masindi','Moroto','Kitgum','Adjumani','Kotido'];
const CATEGORIES = ['Theft','Motorcycle (boda) or vehicle theft','Cattle theft','Burglary or break-in','Robbery','Armed robbery (gun or panga)','Assault','Murder or killing','Mob justice','Kidnapping or abduction','Threats or harassment','Extortion or blackmail','Arson or fire outbreak','Vandalism','Domestic violence','Sexual violence','Defilement or child abuse','Human trafficking','Missing person','Fraud or scam','Mobile money fraud','Cybercrime','Forgery or counterfeit','Drug-related','Illegal firearms','Corruption','Land dispute','Public disorder or riot','Traffic or road crime','Other'];
const STATUSES = ['Received','Under review','Assigned to officer','Resolved','Rejected'];
const URGENT_WORDS = ['gun','weapon','knife','kidnap','abduct','rape','kill','murder','shot','stab','bomb','hostage','child','defile','bleeding','armed','threaten'];
const HIGH_WORDS = ['robbery','assault','beaten','violence','stolen','motorcycle','boda','car','blackmail','hack','fraud','scam','threat'];

// ---------- helpers ----------
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');          // UTC 'YYYY-MM-DD HH:MM:SS'
const ago = sec => new Date(Date.now() - sec * 1000).toISOString().slice(0, 19).replace('T', ' ');
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const clean = (s, max = 2000) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
function triage(text, category) {
  const t = (text + ' ' + category).toLowerCase();
  if (URGENT_WORDS.some(w => t.includes(w)) || ['Sexual violence', 'Defilement or child abuse', 'Child abuse', 'Murder or killing', 'Mob justice', 'Kidnapping or abduction', 'Arson or fire outbreak', 'Armed robbery (gun or panga)', 'Human trafficking'].includes(category)) return 'urgent';
  if (HIGH_WORDS.some(w => t.includes(w)) || ['Robbery', 'Assault', 'Domestic violence', 'Burglary or break-in', 'Illegal firearms', 'Threats or harassment', 'Extortion or blackmail'].includes(category)) return 'high';
  return 'normal';
}
async function newRef() {
  for (let i = 0; i < 60; i++) {
    const digits = i < 40 ? 4 : 6;
    const ref = 'UG-' + String(crypto.randomInt(0, 10 ** digits)).padStart(digits, '0');
    if (!(await db.get('SELECT 1 AS x FROM reports WHERE ref=?', ref))) return ref;
  }
  throw new Error('ref generation failed');
}
async function audit(userId, action, detail) {
  await db.run('INSERT INTO audit_log(user_id,action,detail) VALUES(?,?,?)', userId ?? null, action, detail ?? null);
}

// simple in-memory rate limiter
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = key + ip, t = Date.now();
  const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(k, arr);
  return arr.length > max;
}

// ---------- seed ----------
async function seed() {
  if ((await db.get('SELECT COUNT(*) AS c FROM users')).c) return;
  const add = (u, n, r, st, pw, nin) => db.run('INSERT INTO users(username,full_name,role,station,password_hash,nin) VALUES(?,?,?,?,?,?)', u, n, r, st, hashPw(pw), nin);
  await add('admin', 'System Administrator', 'admin', 'Police HQ, Naguru', 'Admin@123', 'CM00000000AD01');
  await add('commander', 'Cmdr. Nakato Sarah', 'commander', 'Kampala Central', 'Commander@123', 'CM00000000CM01');
  const o1 = (await add('officer1', 'Det. Okello James', 'officer', 'Kampala Central', 'Officer@123', 'CM00000000OF01')).insertId;
  await add('officer2', 'Det. Namutebi Grace', 'officer', 'Mukono Central', 'Officer@123', 'CM00000000OF02');
  const samples = [
    ['Theft', 'A man in a black hoody snatched my phone', 'Mukono', 'UCU', 0.3533, 32.7553, 2, 'Received'],
    ['Theft', 'A man in all black snatched a lady\'s purse', 'Kampala', 'Mapera house', 0.3136, 32.5811, 2, 'Received'],
    ['Theft', 'Motorcycle stolen outside the market around midday.', 'Kampala', 'Nakawa market', 0.3317, 32.6145, 6, 'Under review'],
    ['Mobile money fraud', 'Fake mobile money agent asked for my PIN and took my money.', 'Wakiso', 'Entebbe Road', 0.2, 32.5, 5, 'Received'],
    ['Vandalism', 'Street lights broken near the school gate.', 'Mukono', 'Kakoba', 0.35, 32.75, 9, 'Resolved'],
    ['Robbery', 'Armed men robbed a shop at night, one had a gun.', 'Jinja', 'Main Street', 0.4244, 33.2041, 1, 'Assigned to officer'],
    ['Cybercrime', 'Someone hacked my Facebook and is blackmailing me.', 'Kampala', 'Online', 0.3476, 32.5825, 3, 'Under review'],
    ['Assault', 'Beaten by a group outside a bar.', 'Gulu', 'Laroo', 2.7746, 32.2990, 4, 'Received'],
  ];
  for (const s of samples) {
    const d = new Date(Date.now() - s[6] * 86400000).toISOString().slice(0, 16).replace('T', ' ');
    const ref = await newRef();
    const assigned = ['Assigned to officer', 'Under review'].includes(s[7]) ? o1 : null;
    const r = await db.run(`INSERT INTO reports(ref,pin_hash,category,description,district,place,lat,lng,occurred_at,anonymous,priority,status,assigned_to,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)`, ref, hashPw('000000'), s[0], s[1], s[2], s[3], s[4], s[5], d, triage(s[1], s[0]), s[7], assigned, d + ':00', d + ':00');
    await db.run('INSERT INTO status_history(report_id,status,created_at) VALUES(?,?,?)', r.insertId, 'Received', d + ':00');
    if (s[7] !== 'Received') await db.run('INSERT INTO status_history(report_id,status,user_id,created_at) VALUES(?,?,?,?)', r.insertId, s[7], o1, d + ':00');
  }
  console.log('Seeded DEMO users (NIN / password): CM00000000AD01 / Admin@123, CM00000000CM01 / Commander@123, CM00000000OF01 / Officer@123. Sign in with the NIN and password.');
}

// ---------- upgrade older databases (adds voice, live location, suspect, SMS) ----------
async function migrate() {
  const cols = { audio_transcript: 'TEXT', suspect_details: 'TEXT', rag_json: 'TEXT', live_lat: 'REAL', live_lng: 'REAL', live_at: 'VARCHAR(19)', live_share: 'INTEGER DEFAULT 0' };
  for (const [c, t] of Object.entries(cols)) {
    try { await db.run(`ALTER TABLE reports ADD COLUMN ${c} ${t}`); } catch (e) { if (!/duplicate/i.test(String(e.message))) throw e; }
  }
  for (const [c, t] of Object.entries({ station_id: 'INTEGER', station_at: 'VARCHAR(19)' })) {
    try { await db.run(`ALTER TABLE reports ADD COLUMN ${c} ${t}`); } catch (e) { if (!/duplicate/i.test(String(e.message))) throw e; }
  }
  for (const [c, t] of Object.entries({ source: "VARCHAR(12) DEFAULT 'online'", ob_number: 'VARCHAR(40)', complainant_id: 'VARCHAR(50)', intake_by: 'INTEGER', signature_data: 'TEXT', signed_at: 'VARCHAR(19)' })) {
    try { await db.run(`ALTER TABLE reports ADD COLUMN ${c} ${t}`); } catch (e) { if (!/duplicate/i.test(String(e.message))) throw e; }
  }
  const my = db.kind === 'mysql';
  await db.run(`CREATE TABLE IF NOT EXISTS stations (id ${my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, name VARCHAR(100) NOT NULL, district VARCHAR(60), lat REAL, lng REAL, radius_km REAL DEFAULT 5, phone VARCHAR(30), active INTEGER DEFAULT 1, created_by INTEGER, created_at VARCHAR(19) NOT NULL)`);
  if (!(await db.get('SELECT id FROM stations LIMIT 1'))) for (const [n, d, la, ln] of [['Kampala Central', 'Kampala', 0.3136, 32.5811], ['Entebbe', 'Wakiso', 0.0512, 32.4637], ['Jinja', 'Jinja', 0.4244, 33.2041], ['Mukono Central', 'Mukono', 0.3533, 32.7553]]) await db.run('INSERT INTO stations(name,district,lat,lng,radius_km,created_at) VALUES(?,?,?,?,?,?)', n, d, la, ln, 8, now());
  await db.run(`CREATE TABLE IF NOT EXISTS sms_outbox (id ${my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, report_id INTEGER, to_phone VARCHAR(20) NOT NULL, body TEXT NOT NULL, created_at VARCHAR(19) NOT NULL)`);
}
const km = (a, b, c, d) => { const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
// GPS first: nearest post whose radius covers the point. Otherwise a post in the same district (nearest if GPS is known).
async function pickStation(lat, lng, district) {
  const all = await db.all('SELECT * FROM stations WHERE active=1'); const gps = lat != null && lng != null && Number.isFinite(+lat) && Number.isFinite(+lng);
  const dist = x => gps && x.lat != null ? km(+lat, +lng, x.lat, x.lng) : Infinity;
  if (gps) { const inside = all.filter(x => dist(x) <= (x.radius_km || 5)).sort((a, b) => dist(a) - dist(b)); if (inside.length) return { st: inside[0], how: 'GPS' }; }
  const same = all.filter(x => x.district && x.district === district).sort((a, b) => dist(a) - dist(b));
  return same.length ? { st: same[0], how: 'district' } : null;
}
const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-9);
async function sms(reportId, phone, body) { if (phoneKey(phone).length === 9) await db.run('INSERT INTO sms_outbox(report_id,to_phone,body,created_at) VALUES(?,?,?,?)', reportId, phoneKey(phone), body, now()); }

// ---------- http plumbing ----------
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, {
    'Content-Type': isObj ? 'application/json' : 'text/plain',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers
  });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(Object.assign(new Error('Bad JSON'), { code: 400 })); } });
  });
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
async function authUser(req) {
  const tok = cookie(req, 'sid'); if (!tok) return null;
  const row = await db.get(`SELECT u.id,u.username,u.full_name,u.role,u.station FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>? AND u.active=1`, tok, now());
  return row || null;
}

// ---------- API ----------
const routes = [];
const route = (method, pattern, opts, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), opts, fn });

route('GET', '/api/meta', {}, (ctx) => ({ districts: DISTRICTS, categories: CATEGORIES, statuses: STATUSES }));

route('GET', '/api/public/stats', {}, async () => ({
  total: (await db.get('SELECT COUNT(*) n FROM reports')).n,
  resolved: (await db.get("SELECT COUNT(*) n FROM reports WHERE status='Resolved'")).n,
  byCategory: await db.all('SELECT category, COUNT(*) n FROM reports GROUP BY category ORDER BY n DESC LIMIT 8'),
}));

route('POST', '/api/reports', {}, async (ctx) => {
  if (limited(ctx.ip, 'submit', 10, 3600000)) throw { code: 429, msg: 'Too many reports from this device. Try again later.' };
  const b = ctx.body;
  const category = clean(b.category, 40), description = clean(b.description, 4000);
  const district = clean(b.district, 40), place = clean(b.place, 120);
  if (!CATEGORIES.includes(category)) throw { code: 400, msg: 'Choose what happened.' };
  if (description.length < 10) throw { code: 400, msg: 'Please describe what happened (at least 10 characters).' };
  if (!DISTRICTS.includes(district)) throw { code: 400, msg: 'Choose a district.' };
  const occurred = clean(b.occurred_at, 20).replace('T', ' ');
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(occurred)) throw { code: 400, msg: 'Enter when it happened.' };
  if (new Date(occurred.replace(' ', 'T')) > new Date(Date.now() + 3600000)) throw { code: 400, msg: 'Date cannot be in the future.' };
  const anonymous = b.anonymous === false ? 0 : 1;
  const name = anonymous ? null : clean(b.name, 80), phone = anonymous ? null : clean(b.phone, 20);
  if (!anonymous && !/^\+?\d[\d\s-]{7,16}$/.test(phone || '')) throw { code: 400, msg: 'Enter a valid phone number or choose anonymous.' };
  const lat = Number.isFinite(+b.lat) && b.lat !== null && b.lat !== '' ? +b.lat : null;
  const lng = Number.isFinite(+b.lng) && b.lng !== null && b.lng !== '' ? +b.lng : null;
  const files = Array.isArray(b.evidence) ? b.evidence.slice(0, 5) : [];
  for (const f of files) {
    if (!/^(image\/(jpeg|png|webp)|video\/mp4)$/.test(f.mime || '')) throw { code: 400, msg: 'Only JPG, PNG, WEBP or MP4 evidence is allowed.' };
    if (typeof f.data !== 'string' || f.data.length > 14 * 1024 * 1024) throw { code: 400, msg: 'Evidence file too large (max ~10 MB).' };
  }
  const transcript = clean(b.audio_transcript, 4000), suspect = clean(b.suspect, 1000);
  const audio = b.audio && typeof b.audio.data === 'string' ? { mime: String(b.audio.mime || '').split(';')[0], data: b.audio.data } : null;
  if (audio && (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a)$/.test(audio.mime) || audio.data.length > 14 * 1024 * 1024)) throw { code: 400, msg: 'Audio must be a recording under ~10 MB.' };
  const analysis = rag.analyse(description + ' ' + transcript + ' ' + suspect, category);
  let priority = triage(description + ' ' + transcript, category); if (analysis.emergency) priority = 'urgent';
  const shareLive = b.share_live ? 1 : 0;
  const dup = await db.get(`SELECT ref FROM reports WHERE district=? AND category=? AND created_at>?
    AND (lower(place)=lower(?) OR ?='') ORDER BY id DESC LIMIT 1`, district, category, ago(2 * 86400), place, place);
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const ref = await newRef();
  const r = await db.run(`INSERT INTO reports(ref,pin_hash,category,description,district,place,lat,lng,occurred_at,anonymous,reporter_name,reporter_phone,priority,duplicate_of,audio_transcript,suspect_details,rag_json,live_share)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, hashPw(pin), category, description, district, place, lat, lng, occurred, anonymous, name, phone, priority, dup ? dup.ref : null, transcript, suspect, JSON.stringify(analysis), shareLive);
  const id = r.insertId;
  if (b.kiosk) await db.run("UPDATE reports SET source='kiosk' WHERE id=?", id);
  await db.run('INSERT INTO status_history(report_id,status) VALUES(?,?)', id, 'Received');
  for (const f of files) {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' }[f.mime];
    const fname = crypto.randomBytes(12).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOADS, fname), Buffer.from(f.data, 'base64'));
    await db.run('INSERT INTO evidence(report_id,filename,mime) VALUES(?,?,?)', id, fname, f.mime);
  }
  if (audio) {
    const fname = crypto.randomBytes(12).toString('hex') + '.' + (audio.mime.split('/')[1] || 'webm').replace('x-m4a', 'm4a');
    fs.writeFileSync(path.join(UPLOADS, fname), Buffer.from(audio.data, 'base64'));
    await db.run('INSERT INTO evidence(report_id,filename,mime) VALUES(?,?,?)', id, fname, audio.mime);
  }
  rag.summarise(description + ' ' + transcript, analysis).then(t => t && db.run('UPDATE reports SET rag_json=? WHERE id=?', JSON.stringify({ ...analysis, summary: t }), id)).catch(() => {});
  const pick = await pickStation(lat, lng, district);
  if (pick) await db.run('UPDATE reports SET station_id=?,station_at=? WHERE id=?', pick.st.id, now(), id);
  if (!anonymous) await sms(id, phone, `Uganda Police: report ${ref} received. Tracking PIN ${pin}. Priority: ${priority}.`);
  return { ref, pin, priority, station: pick ? pick.st.name : null, emergency: analysis.emergency, advice: analysis.advice, laws: analysis.laws.slice(0, 3).map(l => ({ source: l.source, ref: l.ref })), ask: analysis.incidents.flatMap(i => i.ask).slice(0, 4) };
});

async function loadForCitizen(ctx) {
  if (limited(ctx.ip, 'track', 20, 600000)) throw { code: 429, msg: 'Too many attempts. Wait a few minutes.' };
  const ref = clean(ctx.body.ref, 20).toUpperCase(), pin = clean(ctx.body.pin, 12);
  const r = await db.get('SELECT * FROM reports WHERE ref=?', ref);
  if (!r || !checkPw(pin, r.pin_hash)) throw { code: 404, msg: 'Reference number or PIN not correct.' };
  return r;
}
route('POST', '/api/track', {}, async (ctx) => {
  const r = await loadForCitizen(ctx);
  return {
    ref: r.ref, category: r.category, district: r.district, place: r.place, occurred_at: r.occurred_at,
    description: r.description, status: r.status, anonymous: !!r.anonymous, created_at: r.created_at, updated_at: r.updated_at,
    history: await db.all('SELECT status,created_at FROM status_history WHERE report_id=? ORDER BY id', r.id),
    messages: await db.all('SELECT sender,body,created_at FROM messages WHERE report_id=? ORDER BY id', r.id),
    evidence_count: (await db.get('SELECT COUNT(*) AS c FROM evidence WHERE report_id=?', r.id)).c,
    advice: (() => { try { return JSON.parse(r.rag_json || 'null').advice || null; } catch { return null; } })(),
    officer: r.assigned_to ? ((await db.get('SELECT full_name FROM users WHERE id=?', r.assigned_to)) || {}).full_name || null : null,
    station: r.station_id ? ((await db.get('SELECT name FROM stations WHERE id=?', r.station_id)) || {}).name || null : null,
  };
});
route('POST', '/api/track/message', {}, async (ctx) => {
  const r = await loadForCitizen(ctx);
  const body = clean(ctx.body.body, 1500); if (!body) throw { code: 400, msg: 'Type a message.' };
  await db.run('INSERT INTO messages(report_id,sender,body) VALUES(?,?,?)', r.id, 'citizen', body);
  await db.run('UPDATE reports SET updated_at=? WHERE id=?', now(), r.id);
  return { ok: true };
});

// --- police auth ---
// ---- identity checks: National ID + ID-card photo + live face + location ----
// Face distance limits (Euclidean distance between 128-number face descriptors; lower = more similar).
// Same person measured 0.07-0.13 in tests, different people 0.55-0.79. Override with env vars if too strict/loose.
const FACE_LIVE_MAX = +process.env.FACE_LIVE_MAX || 0.50;    // live selfie vs enrolled face
const FACE_ID_MAX = +process.env.FACE_ID_MAX || 0.50;        // ID-card photo vs enrolled ID photo
const FACE_CROSS_MAX = +process.env.FACE_CROSS_MAX || 0.50;  // live selfie vs photo printed on the ID card
const FACE_DUP_MAX = +process.env.FACE_DUP_MAX || 0.45;      // another officer already has this face
const UG = { lat: [-1.9, 4.6], lng: [29.3, 35.2] };   // generous bounding box around Uganda
const NIN_RE = /^C[MF][A-Z0-9]{12}$/;
const challenges = new Map();   // one-time tokens between step 1 (NIN+password) and step 2 (face+location)
const faceDist = (a, b) => Math.sqrt(a.reduce((t, v, i) => t + (v - b[i]) ** 2, 0));
const goodDesc = d => Array.isArray(d) && d.length === 128 && d.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 5);
function savePhoto(b64) {
  if (typeof b64 !== 'string' || b64.length > 2.5 * 1024 * 1024) throw { code: 400, msg: 'Photo missing or too large.' };
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 1000 || buf[0] !== 0xFF || buf[1] !== 0xD8) throw { code: 400, msg: 'Photos must be JPEG.' };
  const f = crypto.randomBytes(12).toString('hex') + '.jpg';
  fs.writeFileSync(path.join(UPLOADS, f), buf); return f;
}
async function loginEvent(u, nin, ctx, e) {
  await db.run(`INSERT INTO login_events(user_id,nin,success,reason,kind,lat,lng,accuracy_m,outside_ug,dist_live,dist_id,dist_cross,liveness,photo,ip,user_agent)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, u ? u.id : null, nin, e.success ? 1 : 0, e.reason, e.kind ?? null, e.lat ?? null, e.lng ?? null, e.acc ?? null, e.outside ? 1 : 0,
    e.dLive ?? null, e.dId ?? null, e.dCross ?? null, e.liveness ? 1 : 0, e.photo ?? null, clean(ctx.ip, 64), clean(ctx.req.headers['user-agent'], 200));
}

const LOCK_MSG = 'Account locked for 15 minutes after repeated face mismatches. Contact your administrator.';
const isLocked = async id => {
  const u = await db.get('SELECT unlock_at FROM users WHERE id=?', id), since = ago(15 * 60);
  const from = u && u.unlock_at && String(u.unlock_at) > since ? String(u.unlock_at) : since;
  return (await db.get("SELECT COUNT(*) AS c FROM login_events WHERE user_id=? AND success=0 AND reason IN ('face_mismatch','id_mismatch','cross_mismatch') AND created_at>?", id, from)).c >= 5;
};

// Step 1: National ID number + password -> short-lived challenge
route('POST', '/api/login/start', {}, async (ctx) => {
  if (limited(ctx.ip, 'login', 10, 600000)) throw { code: 429, msg: 'Too many login attempts. Wait 10 minutes.' };
  const nin = clean(ctx.body.nin, 20).toUpperCase().replace(/\s/g, '');
  const u = NIN_RE.test(nin) ? await db.get('SELECT * FROM users WHERE nin=? AND active=1', nin) : null;
  if (!u || !checkPw(String(ctx.body.password || ''), u.password_hash)) { await loginEvent(u, nin, ctx, { success: 0, reason: 'bad_nin_or_password' }); throw { code: 401, msg: 'National ID number or password is wrong.' }; }
  if (await isLocked(u.id)) throw { code: 429, msg: LOCK_MSG };
  const last = (await db.get('SELECT created_at,lat,lng FROM login_events WHERE user_id=? AND success=1 ORDER BY id DESC LIMIT 1', u.id)) || null;
  await loginEvent(u, u.nin, ctx, { success: 1, reason: 'ok', kind: 'password' });
  const tok = crypto.randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)', tok, u.id, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' '));
  await audit(u.id, 'login', 'password');
  return { __headers: { 'Set-Cookie': `sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}` },
    user: { username: u.username, full_name: u.full_name, role: u.role, station: u.station }, enrolled: false, outside_ug: false, last_login: last };
});

// (Removed) face / ID-card verification step. Sign-in is now National ID number + password only.
route('POST', '/api/login/verify', {}, async (ctx) => {
  throw { code: 410, msg: 'Face and ID-card sign-in has been removed. Sign in with your National ID number and password.' };
  if (limited(ctx.ip, 'verify', 15, 600000)) throw { code: 429, msg: 'Too many attempts. Wait 10 minutes.' };
  const b = ctx.body, ch = challenges.get(b.challenge);
  if (!ch || ch.exp < Date.now()) throw { code: 401, msg: 'Session expired. Enter your National ID number and password again.' };
  const u = await db.get('SELECT * FROM users WHERE id=? AND active=1', ch.userId);
  if (!u) throw { code: 401, msg: 'Account is not active.' };
  if (await isLocked(u.id)) throw { code: 429, msg: LOCK_MSG };
  const fail = async (code, reason, msg, extra = {}) => { await loginEvent(u, u.nin, ctx, { success: 0, reason, kind: u.face_enrolled_at ? 'verify' : 'enrol', ...loc, ...extra }); throw { code, msg }; };
  // location is mandatory
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.accuracy);
  const hasLoc = b.lat !== null && b.lat !== '' && b.lng !== null && b.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const loc = hasLoc ? { lat, lng, acc: Number.isFinite(acc) ? acc : null, outside: !(lat >= UG.lat[0] && lat <= UG.lat[1] && lng >= UG.lng[0] && lng <= UG.lng[1]) } : {};
  if (!hasLoc) await fail(400, 'no_location', 'Location is required to log in. Allow location access and try again.');
  if (!goodDesc(b.id_descriptor) || !goodDesc(b.live_descriptor)) await fail(400, 'no_face', 'We could not read a face from the ID card and from your camera. Try again in good light.');
  const idPhoto = savePhoto(b.id_photo), livePhoto = savePhoto(b.live_photo);
  const liveness = b.liveness === true;
  const dCross = faceDist(b.id_descriptor, b.live_descriptor);
  const base = { dCross, liveness, photo: livePhoto };
  if (dCross > FACE_CROSS_MAX) await fail(403, 'cross_mismatch', 'Wrong Face ID: your face does not match the photo on the National ID.', base);
  const kind = u.face_enrolled_at ? 'verify' : 'enrol';
  let dLive = null, dId = null;
  if (kind === 'verify') {
    const ef = JSON.parse(u.face_descriptor), ei = JSON.parse(u.id_descriptor);
    dLive = Math.min(faceDist(b.live_descriptor, ef), faceDist(b.live_descriptor, ei));
    dId = faceDist(b.id_descriptor, ei);
    if (dLive > FACE_LIVE_MAX) await fail(403, 'face_mismatch', 'Wrong Face ID: this is not the officer enrolled on this account.', { ...base, dLive, dId });
    if (dId > FACE_ID_MAX) await fail(403, 'id_mismatch', 'The National ID shown is not the one enrolled on this account.', { ...base, dLive, dId });
  } else {
    // first login: make sure this face is not already enrolled for another officer
    for (const o of await db.all('SELECT id,full_name,nin,face_descriptor,id_descriptor FROM users WHERE face_enrolled_at IS NOT NULL AND id<>?', u.id)) {
      const d = Math.min(faceDist(b.live_descriptor, JSON.parse(o.face_descriptor)), faceDist(b.live_descriptor, JSON.parse(o.id_descriptor)), faceDist(b.id_descriptor, JSON.parse(o.id_descriptor)));
      if (d < FACE_DUP_MAX) await fail(409, 'duplicate_face', `This face appears to already be enrolled for ${o.full_name} (${o.nin}).`, base);
    }
    await db.run('UPDATE users SET face_descriptor=?,id_descriptor=?,id_photo=?,face_photo=?,face_enrolled_at=? WHERE id=?',
      JSON.stringify(b.live_descriptor), JSON.stringify(b.id_descriptor), idPhoto, livePhoto, now(), u.id);
  }
  challenges.delete(b.challenge);
  const last = (await db.get('SELECT created_at,lat,lng FROM login_events WHERE user_id=? AND success=1 ORDER BY id DESC LIMIT 1', u.id)) || null;
  await loginEvent(u, u.nin, ctx, { success: 1, reason: kind === 'enrol' ? 'enrolled' : 'ok', kind, ...loc, ...base, dLive, dId });
  const tok = crypto.randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)', tok, u.id, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' '));
  await audit(u.id, 'login', `${kind} @ ${loc.lat},${loc.lng}${loc.outside ? ' OUTSIDE UGANDA' : ''}`);
  return { __headers: { 'Set-Cookie': `sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}` },
    user: { username: u.username, full_name: u.full_name, role: u.role, station: u.station }, enrolled: kind === 'enrol', outside_ug: !!loc.outside, last_login: last };
});
route('POST', '/api/logout', { auth: true }, async (ctx) => {
  await db.run('DELETE FROM sessions WHERE token=?', cookie(ctx.req, 'sid'));
  return { __headers: { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' }, ok: true };
});
route('GET', '/api/me', {}, (ctx) => ({ user: ctx.user }));

// --- police reports ---
const REPORT_COLS = `r.ref,r.category,r.description,r.district,r.place,r.lat,r.lng,r.occurred_at,r.anonymous,r.priority,r.status,r.duplicate_of,r.created_at,r.updated_at,u.full_name assigned_name,r.assigned_to,r.station_id,st.name station_name,r.source,r.ob_number`;
route('GET', '/api/police/reports', { auth: true }, async (ctx) => {
  const q = ctx.query, where = [], args = [];
  if (q.status) { where.push('r.status=?'); args.push(q.status); }
  if (q.district) { where.push('r.district=?'); args.push(q.district); }
  if (q.category) { where.push('r.category=?'); args.push(q.category); }
  if (q.priority) { where.push('r.priority=?'); args.push(q.priority); }
  if (q.mine === 's') { where.push('r.station_id IN (SELECT id FROM stations WHERE name=?)'); args.push(ctx.user.station || ''); }
  if (q.mine === 'w') where.push("r.source='walk_in'");
  if (q.mine === '1') { where.push('r.assigned_to=?'); args.push(ctx.user.id); }
  if (q.q) { where.push('(r.ref LIKE ? OR r.description LIKE ? OR r.place LIKE ?)'); const l = '%' + q.q + '%'; args.push(l, l, l); }
  const rows = await db.all(`SELECT ${REPORT_COLS} FROM reports r LEFT JOIN users u ON u.id=r.assigned_to LEFT JOIN stations st ON st.id=r.station_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, CASE WHEN r.status='Resolved' THEN 1 ELSE 0 END, r.created_at DESC LIMIT 500`, ...args);
  return { reports: rows };
});
// ---- walk-in reports: an officer records a complaint made in person (replaces the paper Occurrence Book entry) ----
route('POST', '/api/police/analyse', { auth: true }, async (ctx) => {
  const a = rag.analyse(clean(ctx.body.text, 6000), clean(ctx.body.category, 40)); const cat = clean(ctx.body.category, 40), prio = a.emergency ? 'urgent' : triage(clean(ctx.body.text, 6000), cat); return { emergency: a.emergency, priority: prio, serious: a.emergency || prio !== 'normal', incidents: a.incidents, laws: a.laws.slice(0, 4), advice: a.advice };
});
route('POST', '/api/police/walkin', { auth: true }, async (ctx) => {
  const b = ctx.body, name = clean(b.name, 80), phone = clean(b.phone, 20), idType = clean(b.id_type, 24), idNo = clean(b.id_no, 30);
  const category = clean(b.category, 40), description = clean(b.description, 4000), district = clean(b.district, 40), place = clean(b.place, 120), suspect = clean(b.suspect, 1000);
  if (!name) throw { code: 400, msg: 'Enter the complainant\u2019s name.' };
  if (phone && !/^\+?\d[\d\s-]{7,16}$/.test(phone)) throw { code: 400, msg: 'Phone number is not valid.' };
  if (idType && idType !== 'None' && (!idNo || !b.id_seen)) throw { code: 400, msg: 'Enter the ID number and confirm you have seen the original ID.' };
  if (!CATEGORIES.includes(category)) throw { code: 400, msg: 'Choose the crime category.' };
  if (description.length < 10) throw { code: 400, msg: 'Type or dictate the statement (at least 10 characters).' };
  if (!DISTRICTS.includes(district)) throw { code: 400, msg: 'Choose a district.' };
  const occurred = clean(b.occurred_at, 20).replace('T', ' ');
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(occurred)) throw { code: 400, msg: 'Enter when it happened.' };
  const lat = b.lat !== '' && b.lat != null && Number.isFinite(+b.lat) ? +b.lat : null, lng = b.lng !== '' && b.lng != null && Number.isFinite(+b.lng) ? +b.lng : null;
  const sig = typeof b.signature === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.signature) && b.signature.length < 600000 ? b.signature : null;
  const audio = b.audio && typeof b.audio.data === 'string' ? { mime: String(b.audio.mime || '').split(';')[0], data: b.audio.data } : null;
  if (audio && (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a)$/.test(audio.mime) || audio.data.length > 14 * 1024 * 1024)) throw { code: 400, msg: 'Audio must be a recording under ~10 MB.' };
  const analysis = rag.analyse(description + ' ' + suspect, category);
  let priority = triage(description, category); if (analysis.emergency) priority = 'urgent';
  let st = ctx.user.station ? await db.get('SELECT * FROM stations WHERE active=1 AND name=?', ctx.user.station) : null;
  if (!st) { const p = await pickStation(lat, lng, district); st = p && p.st; }
  const yr = new Date().getFullYear(), code = (st ? st.name : 'HQ').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'HQ';
  const n = st ? (await db.get("SELECT COUNT(*) c FROM reports WHERE source='walk_in' AND station_id=? AND created_at>=?", st.id, yr + '-01-01')).c + 1 : 1;
  const ob = `OB/${code}/${yr}/${String(n).padStart(4, '0')}`;
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), ref = await newRef();
  const r = await db.run(`INSERT INTO reports(ref,pin_hash,category,description,district,place,lat,lng,occurred_at,anonymous,reporter_name,reporter_phone,priority,suspect_details,rag_json,source,ob_number,complainant_id,intake_by,signature_data,signed_at,assigned_to,status,station_id,station_at)
    VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,'walk_in',?,?,?,?,?,?,'Assigned to officer',?,?)`, ref, hashPw(pin), category, description, district, place, lat, lng, occurred, name, phone || null, priority, suspect, JSON.stringify(analysis), ob, idType && idType !== 'None' ? idType + ': ' + idNo : 'No ID', ctx.user.id, sig, sig ? now() : null, ctx.user.id, st ? st.id : null, st ? now() : null);
  const id = r.insertId;
  await db.run('INSERT INTO status_history(report_id,status,user_id) VALUES(?,?,?)', id, 'Received', ctx.user.id);
  await db.run('INSERT INTO status_history(report_id,status,user_id) VALUES(?,?,?)', id, 'Assigned to officer', ctx.user.id);
  if (audio) {
    const fname = crypto.randomBytes(12).toString('hex') + '.' + (audio.mime.split('/')[1] || 'webm').replace('x-m4a', 'm4a');
    fs.writeFileSync(path.join(UPLOADS, fname), Buffer.from(audio.data, 'base64'));
    await db.run('INSERT INTO evidence(report_id,filename,mime) VALUES(?,?,?)', id, fname, audio.mime);
  }
  if (phone) await sms(id, phone, `Uganda Police: your complaint ${ob} was recorded. Reference ${ref}, PIN ${pin}. Track it on the police e-Crime portal.`);
  await audit(ctx.user.id, 'walkin_report', `${ref} ${ob}`);
  return { ref, pin, ob_number: ob, station: st ? st.name : null, officer: ctx.user.full_name, created_at: now(), priority, emergency: analysis.emergency, category, name, id_label: idType && idType !== 'None' ? idType + ' ' + idNo.slice(-4).padStart(idNo.length, '*') : 'No ID', phone, signature: sig, advice: analysis.advice };
});
// ---- police posts: register, list, retire; alerts for new cases in your area ----
route('GET', '/api/police/stations', { auth: true }, async () => ({ stations: await db.all(`SELECT s.id,s.name,s.district,s.lat,s.lng,s.radius_km,s.phone,
  (SELECT COUNT(*) FROM reports r WHERE r.station_id=s.id AND r.status<>'Resolved') open_cases FROM stations s WHERE s.active=1 ORDER BY s.name`) }));
route('POST', '/api/police/stations', { auth: true }, async (ctx) => {
  const b = ctx.body, name = clean(b.name, 100), lat = Number(b.lat), lng = Number(b.lng), radius = Math.min(50, Math.max(0.5, Number(b.radius_km) || 5));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw { code: 400, msg: 'Name and a valid location are required.' };
  const r = await db.run('INSERT INTO stations(name,district,lat,lng,radius_km,phone,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)', name, clean(b.district, 60), lat, lng, radius, clean(b.phone, 30), ctx.user.id, now());
  if (!ctx.user.station) await db.run('UPDATE users SET station=? WHERE id=?', name, ctx.user.id);
  let moved = 0;   // pull in open reports that had no station
  for (const x of await db.all("SELECT id,lat,lng,district FROM reports WHERE station_id IS NULL AND status<>'Resolved'")) { const p = await pickStation(x.lat, x.lng, x.district); if (p) { await db.run('UPDATE reports SET station_id=?,station_at=? WHERE id=?', p.st.id, now(), x.id); moved++; } }
  await audit(ctx.user.id, 'station_register', name);
  return { ok: true, id: r.insertId || r.lastID, moved, station: ctx.user.station || name };
});
route('DELETE', '/api/police/stations/:id', { auth: true, roles: ['commander', 'admin'] }, async (ctx) => {
  await db.run('UPDATE stations SET active=0 WHERE id=?', +ctx.params[0]); await db.run('UPDATE reports SET station_id=NULL WHERE station_id=?', +ctx.params[0]);
  await audit(ctx.user.id, 'station_remove', ctx.params[0]); return { ok: true };
});
route('GET', '/api/police/alerts', { auth: true }, async (ctx) => {
  const max = (await db.get('SELECT COALESCE(MAX(id),0) m FROM reports')).m;
  if (ctx.query.since === undefined) return { alerts: [], max };
  const all = ctx.user.role === 'admin' || !ctx.user.station;
  const rows = await db.all(`SELECT r.id,r.ref,r.category,r.priority,r.district,r.place,r.lat,r.lng,st.name station FROM reports r LEFT JOIN stations st ON st.id=r.station_id
    WHERE r.id>? AND r.status<>'Resolved' ${all ? '' : (ctx.user.role === 'commander' ? 'AND (st.name=? OR r.station_id IS NULL)' : 'AND st.name=?')} ORDER BY r.id LIMIT 20`, +ctx.query.since || 0, ...(all ? [] : [ctx.user.station]));
  return { alerts: rows, max };
});
// reporter shares live location after submitting (needs ref + PIN)
route('POST', '/api/live', {}, async (ctx) => {
  const r = await loadForCitizen(ctx);
  const lat = Number(ctx.body.lat), lng = Number(ctx.body.lng);
  if (!r.live_share || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw { code: 400, msg: 'Live location not enabled.' };
  await db.run('UPDATE reports SET live_lat=?,live_lng=?,live_at=?,updated_at=? WHERE id=?', lat, lng, now(), now(), r.id);
  return { ok: true };
});
// DEMO phone: shows texts sent to a number (stand-in for a real SMS gateway)
route('GET', '/api/inbox', {}, async (ctx) => {
  if (limited(ctx.ip, 'inbox', 120, 600000)) throw { code: 429, msg: 'Slow down.' };
  const k = phoneKey(ctx.query.phone); if (k.length !== 9) throw { code: 400, msg: 'Enter the phone number used in the report.' };
  return { messages: await db.all('SELECT body,created_at FROM sms_outbox WHERE to_phone=? ORDER BY id DESC LIMIT 50', k) };
});
route('GET', '/api/police/reports/:ref', { auth: true }, async (ctx) => {
  const r = await db.get('SELECT r.*,u.full_name assigned_name,st.name station_name FROM reports r LEFT JOIN users u ON u.id=r.assigned_to LEFT JOIN stations st ON st.id=r.station_id WHERE r.ref=?', ctx.params[0]);
  if (!r) throw { code: 404, msg: 'Not found' };
  delete r.pin_hash; try { r.rag = JSON.parse(r.rag_json || 'null'); } catch { r.rag = null; } delete r.rag_json;
  await audit(ctx.user.id, 'view_report', r.ref);
  return {
    report: r,
    evidence: await db.all('SELECT id,mime FROM evidence WHERE report_id=?', r.id),
    messages: await db.all('SELECT sender,body,created_at FROM messages WHERE report_id=? ORDER BY id', r.id),
    notes: await db.all('SELECT n.body,n.created_at,u.full_name FROM notes n JOIN users u ON u.id=n.user_id WHERE n.report_id=? ORDER BY n.id', r.id),
    history: await db.all('SELECT h.status,h.created_at,u.full_name FROM status_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.report_id=? ORDER BY h.id', r.id),
  };
});
route('PATCH', '/api/police/reports/:ref', { auth: true }, async (ctx) => {
  const r = await db.get('SELECT * FROM reports WHERE ref=?', ctx.params[0]);
  if (!r) throw { code: 404, msg: 'Not found' };
  const b = ctx.body;
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) throw { code: 400, msg: 'Bad status' };
    if (b.status !== r.status) {
      await db.run('UPDATE reports SET status=?,updated_at=? WHERE id=?', b.status, now(), r.id);
      await db.run('INSERT INTO status_history(report_id,status,user_id) VALUES(?,?,?)', r.id, b.status, ctx.user.id);
      await audit(ctx.user.id, 'status_change', `${r.ref}: ${r.status} -> ${b.status}`);
    }
  }
  if (b.priority !== undefined && ['normal', 'high', 'urgent'].includes(b.priority)) {
    await db.run('UPDATE reports SET priority=?,updated_at=? WHERE id=?', b.priority, now(), r.id);
    await audit(ctx.user.id, 'priority_change', `${r.ref}: ${b.priority}`);
  }
  if (b.station_id !== undefined && ctx.user.role !== 'officer') {
    await db.run('UPDATE reports SET station_id=?,station_at=?,updated_at=? WHERE id=?', b.station_id ? +b.station_id : null, now(), now(), r.id);
    await audit(ctx.user.id, 'reassign_station', `${r.ref} -> ${b.station_id || 'none'}`);
  }
  if (b.assigned_to !== undefined) {
    if (ctx.user.role === 'officer' && b.assigned_to !== ctx.user.id && b.assigned_to !== null) throw { code: 403, msg: 'Only commanders can assign to others.' };
    const aid = b.assigned_to === null ? null : +b.assigned_to;
    if (aid && !(await db.get('SELECT 1 AS x FROM users WHERE id=? AND active=1', aid))) throw { code: 400, msg: 'Unknown officer' };
    await db.run('UPDATE reports SET assigned_to=?,updated_at=? WHERE id=?', aid, now(), r.id);
    if (aid && r.status !== 'Assigned to officer' && r.status !== 'Resolved') {
      await db.run("UPDATE reports SET status='Assigned to officer' WHERE id=?", r.id);
      await db.run('INSERT INTO status_history(report_id,status,user_id) VALUES(?,?,?)', r.id, 'Assigned to officer', ctx.user.id);
    }
    await audit(ctx.user.id, 'assign', `${r.ref} -> user ${aid}`);
  }
  return { ok: true };
});
route('POST', '/api/police/reports/:ref/message', { auth: true }, async (ctx) => {
  const r = await db.get('SELECT id,ref FROM reports WHERE ref=?', ctx.params[0]); if (!r) throw { code: 404, msg: 'Not found' };
  const body = clean(ctx.body.body, 1500); if (!body) throw { code: 400, msg: 'Type a message.' };
  await db.run('INSERT INTO messages(report_id,sender,body) VALUES(?,?,?)', r.id, 'police', body);
  const full = await db.get('SELECT reporter_phone,anonymous FROM reports WHERE id=?', r.id);
  if (full && !full.anonymous && full.reporter_phone) await sms(r.id, full.reporter_phone, `Uganda Police (${r.ref}): ${body}`);
  await audit(ctx.user.id, 'message_citizen', r.ref);
  return { ok: true };
});
route('POST', '/api/police/reports/:ref/note', { auth: true }, async (ctx) => {
  const r = await db.get('SELECT id,ref FROM reports WHERE ref=?', ctx.params[0]); if (!r) throw { code: 404, msg: 'Not found' };
  const body = clean(ctx.body.body, 3000); if (!body) throw { code: 400, msg: 'Type a note.' };
  await db.run('INSERT INTO notes(report_id,user_id,body) VALUES(?,?,?)', r.id, ctx.user.id, body);
  await audit(ctx.user.id, 'add_note', r.ref);
  return { ok: true };
});
route('GET', '/api/police/stats', { auth: true }, async () => {
  const one = async (sql, ...a) => (await db.get(sql, ...a)).c;
  return {
    total: await one('SELECT COUNT(*) AS c FROM reports'),
    open: await one("SELECT COUNT(*) AS c FROM reports WHERE status NOT IN ('Resolved','Rejected')"),
    resolved: await one("SELECT COUNT(*) AS c FROM reports WHERE status='Resolved'"),
    urgent: await one("SELECT COUNT(*) AS c FROM reports WHERE priority='urgent' AND status NOT IN ('Resolved','Rejected')"),
    byCategory: await db.all('SELECT category AS k, COUNT(*) AS n FROM reports GROUP BY category ORDER BY n DESC'),
    byDistrict: await db.all('SELECT district AS k, COUNT(*) AS n FROM reports GROUP BY district ORDER BY n DESC LIMIT 10'),
    byStatus: await db.all('SELECT status AS k, COUNT(*) AS n FROM reports GROUP BY status'),
    byDay: await db.all('SELECT DATE(created_at) AS k, COUNT(*) AS n FROM reports WHERE created_at>? GROUP BY DATE(created_at) ORDER BY k', ago(14 * 86400)),
    points: await db.all('SELECT ref,category,lat,lng,priority FROM reports WHERE lat IS NOT NULL AND lng IS NOT NULL'),
  };
});
route('GET', '/api/police/officers', { auth: true }, async () => ({ officers: await db.all('SELECT id,full_name,station,role FROM users WHERE active=1 ORDER BY full_name') }));
route('GET', '/api/police/export.csv', { auth: true, roles: ['commander', 'admin'] }, async (ctx) => {
  const rows = await db.all(`SELECT ${REPORT_COLS} FROM reports r LEFT JOIN users u ON u.id=r.assigned_to LEFT JOIN stations st ON st.id=r.station_id ORDER BY r.id`);
  const cols = ['ref', 'category', 'district', 'place', 'occurred_at', 'priority', 'status', 'assigned_name', 'created_at', 'description'];
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  await audit(ctx.user.id, 'export_csv', rows.length + ' rows');
  return { __raw: [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'), __type: 'text/csv', __headers: { 'Content-Disposition': 'attachment; filename="reports.csv"' } };
});

// --- admin ---
route('GET', '/api/admin/users', { auth: true, roles: ['admin'] }, async () => {
  const users = await db.all('SELECT id,username,full_name,role,station,nin,face_enrolled_at,active,created_at FROM users ORDER BY id');
  for (const u of users) u.locked = await isLocked(u.id);
  return { users };
});
route('POST', '/api/admin/users', { auth: true, roles: ['admin'] }, async (ctx) => {
  const b = ctx.body, username = clean(b.username, 40).toLowerCase(), pw = String(b.password || '');
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw { code: 400, msg: 'Username: 3-40 letters/numbers.' };
  if (pw.length < 8) throw { code: 400, msg: 'Password must be at least 8 characters.' };
  if (!['officer', 'commander', 'admin'].includes(b.role)) throw { code: 400, msg: 'Bad role' };
  const nin = clean(b.nin, 20).toUpperCase().replace(/\s/g, '');
  if (!NIN_RE.test(nin)) throw { code: 400, msg: 'National ID number must be 14 characters, starting with CM or CF.' };
  if (await db.get('SELECT 1 AS x FROM users WHERE username=? OR nin=?', username, nin)) throw { code: 409, msg: 'Username or National ID number already exists.' };
  await db.run('INSERT INTO users(username,full_name,role,station,password_hash,nin) VALUES(?,?,?,?,?,?)', username, clean(b.full_name, 80), b.role, clean(b.station, 80), hashPw(pw), nin);
  await audit(ctx.user.id, 'create_user', username);
  return { ok: true };
});
route('PATCH', '/api/admin/users/:id', { auth: true, roles: ['admin'] }, async (ctx) => {
  const id = +ctx.params[0]; if (id === ctx.user.id) throw { code: 400, msg: 'You cannot change your own account here.' };
  if (ctx.body.active !== undefined) await db.run('UPDATE users SET active=? WHERE id=?', ctx.body.active ? 1 : 0, id);
  if (ctx.body.unlock) { await db.run('UPDATE users SET unlock_at=? WHERE id=?', now(), id); await audit(ctx.user.id, 'unlock_user', String(id)); }
  if (ctx.body.reset_face) { await db.run('UPDATE users SET face_descriptor=NULL,id_descriptor=NULL,face_enrolled_at=NULL,unlock_at=? WHERE id=?', now(), id); await db.run('DELETE FROM sessions WHERE user_id=?', id); await audit(ctx.user.id, 'reset_face', String(id)); }
  if (ctx.body.password) { if (String(ctx.body.password).length < 8) throw { code: 400, msg: 'Password too short.' }; await db.run('UPDATE users SET password_hash=? WHERE id=?', hashPw(String(ctx.body.password)), id); }
  await audit(ctx.user.id, 'update_user', String(id));
  return { ok: true };
});
route('GET', '/api/admin/audit', { auth: true, roles: ['admin'] }, async () => ({ log: await db.all('SELECT a.created_at,a.action,a.detail,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200') }));

route('GET', '/api/admin/logins', { auth: true, roles: ['admin', 'commander'] }, async (ctx) => {
  const rows = await db.all(`SELECT e.id,e.created_at,e.success,e.reason,e.kind,e.lat,e.lng,e.accuracy_m,e.outside_ug,e.dist_live,e.dist_id,e.dist_cross,e.liveness,e.ip,
    CASE WHEN e.photo IS NULL THEN 0 ELSE 1 END AS has_photo,e.nin,u.full_name
    FROM login_events e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 300`);
  return { logins: rows };
});
route('GET', '/api/admin/loginphoto/:id', { auth: true, roles: ['admin', 'commander'] }, async (ctx) => {
  const e = await db.get('SELECT photo FROM login_events WHERE id=?', +ctx.params[0]); if (!e || !e.photo) throw { code: 404, msg: 'Not found' };
  await audit(ctx.user.id, 'view_login_photo', ctx.params[0]);
  return { __raw: fs.readFileSync(path.join(UPLOADS, path.basename(e.photo))), __type: 'image/jpeg' };
});

// evidence download (police only)
route('GET', '/api/evidence/:id', { auth: true }, async (ctx) => {
  const e = await db.get('SELECT * FROM evidence WHERE id=?', +ctx.params[0]); if (!e) throw { code: 404, msg: 'Not found' };
  return { __raw: fs.readFileSync(path.join(UPLOADS, path.basename(e.filename))), __type: e.mime };
});

// ---------- static files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.bin': 'application/octet-stream' };
function serveStatic(req, res, pathname) {
  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...(p.startsWith('/vendor/') ? { 'Cache-Control': 'public, max-age=604800' } : {}) });
  fs.createReadStream(file).pipe(res);
}

setInterval(() => { const t = Date.now(); for (const [k, v] of challenges) if (v.exp < t) challenges.delete(k); }, 60000).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  try {
    const rt = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!rt) return send(res, 404, { error: 'Not found' });
    const ctx = { req, ip: req.socket.remoteAddress, query: Object.fromEntries(url.searchParams), params: url.pathname.match(rt.re).slice(1).map(decodeURIComponent), user: await authUser(req) };
    if (rt.opts.auth && !ctx.user) return send(res, 401, { error: 'Please log in.' });
    if (rt.opts.roles && !rt.opts.roles.includes(ctx.user.role)) return send(res, 403, { error: 'Not allowed for your role.' });
    ctx.body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const out = await rt.fn(ctx, req, res);
    if (out && out.__raw !== undefined) return send(res, 200, out.__raw, { 'Content-Type': out.__type, ...(out.__headers || {}) });
    const headers = out && out.__headers; if (out) delete out.__headers;
    send(res, 200, out, headers || {});
  } catch (e) {
    if (e && e.code && e.msg) return send(res, e.code, { error: e.msg });
    if (e && e.code === 413) return send(res, 413, { error: 'Upload too large.' });
    if (e && e.code === 400) return send(res, 400, { error: e.message });
    console.error(e); send(res, 500, { error: 'Server error' });
  }
});
(async () => {
  try {
    db = await openDb(config.db);
    await migrate();
    await seed();
    for (const x of await db.all('SELECT id,lat,lng,district FROM reports WHERE station_id IS NULL')) { const p = await pickStation(x.lat, x.lng, x.district); if (p) await db.run('UPDATE reports SET station_id=?,station_at=? WHERE id=?', p.st.id, now(), x.id); }
    server.listen(PORT, () => console.log(`SafeReport UG running on http://localhost:${PORT}  (database: ${db.kind}${db.kind === 'mysql' ? ' ' + config.db.name : ''})`));
  } catch (e) {
    console.error('\nCould not start: ' + e.message + '\n');
    process.exit(1);
  }
})();
