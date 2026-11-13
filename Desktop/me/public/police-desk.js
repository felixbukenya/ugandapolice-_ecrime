/* SafeReport UG - police "Walk-in desk" and "Occurrence Book".
   Loaded after the main script in index.html, so it can use its helpers ($app, api, esc, fmt, META, ME, openCase ...). */
'use strict';

/* ---------- small helpers ---------- */
const dq = id => document.getElementById(id);
const nowLocalInput = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const ID_LABEL = k => (META.id_types && META.id_types[k]) || k;
const publicBase = () => META.public_url || location.origin;
const trackUrl = ref => publicBase() + '/#track?ref=' + encodeURIComponent(ref);
const utcStr = d => d.toISOString().slice(0, 19).replace('T', ' ');
const maskId = s => !s ? '' : (s.length <= 6 ? s : s.slice(0, 3) + '…' + s.slice(-3));

// printing: the content goes into #printarea, and print CSS hides everything else
function printDoc(html) {
  let a = dq('printarea'); if (!a) { a = document.createElement('div'); a.id = 'printarea'; document.body.appendChild(a); }
  a.innerHTML = html; setTimeout(() => window.print(), 80);
}
async function imgData(url) {
  const b = await (await fetch(url)).blob();
  return new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(null); f.readAsDataURL(b); });
}
const PRINT_CSS = `<style>#printarea{font:13px/1.45 system-ui,Arial,sans-serif;color:#000}#printarea h1{font-size:18px;margin:0;text-align:center;letter-spacing:.5px}#printarea h2{font-size:14px;margin:2px 0 10px;text-align:center;font-weight:600}
#printarea table{width:100%;border-collapse:collapse;margin:8px 0}#printarea td,#printarea th{border:1px solid #999;padding:5px 7px;text-align:left;vertical-align:top;color:#000;font-size:12.5px}#printarea th{background:#eee;width:30%}
#printarea .box{border:1px solid #999;padding:10px;white-space:pre-wrap;min-height:80px;margin:6px 0}#printarea .sig{height:70px;border-bottom:1px solid #000;margin-top:24px}
#printarea .slip{width:300px;margin:0 auto;border:2px dashed #000;padding:14px;text-align:center}#printarea .slip .big{font-size:28px;font-weight:800;letter-spacing:2px;margin:2px 0}#printarea .slip .row2{display:flex;justify-content:space-between;text-align:left;font-size:12px;margin:3px 0;gap:8px}
#printarea .small{font-size:11px;color:#444}</style>`;

/* ---------- receipt slip (case number + OB number + QR) ---------- */
function receiptHtml(x) {
  let qr = ''; try { qr = QR.svg(trackUrl(x.ref), { scale: 4, margin: 2, size: 150 }); } catch {}
  return `${PRINT_CSS}<div class="slip"><h1>UGANDA POLICE FORCE</h1><h2>Acknowledgement of report</h2>
    <div class="small">${esc(x.station || '')}</div>
    <div class="row2"><span>Case no.</span></div><div class="big">${esc(x.ref)}</div>
    <div class="row2"><span>Tracking PIN</span></div><div class="big">${esc(x.pin)}</div>
    <div class="row2"><span>Station log (OB)</span><b>${esc(x.ob_no || '')}</b></div>
    ${x.name ? `<div class="row2"><span>Complainant</span><b>${esc(x.name)}</b></div>` : ''}
    ${x.category ? `<div class="row2"><span>Matter</span><b>${esc(x.category)}</b></div>` : ''}
    <div class="row2"><span>Recorded</span><b>${esc(fmt(x.created_at || new Date().toISOString().slice(0, 19)))}</b></div>
    ${x.officer ? `<div class="row2"><span>Received by</span><b>${esc(x.officer)}</b></div>` : ''}
    <div style="margin-top:8px">${qr}</div><div class="small">Scan to track your case, then enter your PIN.<br>${esc(trackUrl(x.ref))}</div>
    <hr><div class="small">Keep this slip. Quote the case number when you contact police. Emergency: 999 or 112.<br>Prototype slip, not an official Uganda Police form.</div></div>`;
}

/* ---------- signed statement (printable) ---------- */
async function statementHtml(r, evidence) {
  const w = r.walkin || {}, sig = (evidence || []).find(e => e.kind === 'signature');
  const sigImg = sig ? await imgData('/api/evidence/' + sig.id) : null;
  return `${PRINT_CSS}<h1>UGANDA POLICE FORCE</h1><h2>Statement of complainant${r.station_name ? ' · ' + esc(r.station_name) : ''}</h2>
  <table><tr><th>Case no.</th><td>${esc(r.ref)}</td><th>Station log (OB)</th><td>${esc(r.ob_no || '')}</td></tr>
  <tr><th>Recorded</th><td>${esc(fmt(r.created_at))}</td><th>Recorded by</th><td>${esc(r.received_by_name || '')}</td></tr>
  <tr><th>Complainant</th><td>${esc(r.reporter_name || '')}</td><th>Phone</th><td>${esc(r.reporter_phone || '')}</td></tr>
  <tr><th>ID shown</th><td>${esc(ID_LABEL(w.id_type))}${w.id_no ? ' · ' + esc(w.id_no) : ''}${w.no_id_reason ? ' · ' + esc(w.no_id_reason) : ''}</td><th>Address</th><td>${esc(w.address || '')}</td></tr>
  <tr><th>Matter</th><td>${esc(r.category)}</td><th>Place</th><td>${esc(r.place || '')}, ${esc(r.district)}</td></tr>
  <tr><th>Happened</th><td>${esc(fmt(r.occurred_at))}</td><th>Statement in</th><td>${esc(w.language || 'English')} (typed by ${w.typed_by === 'complainant' ? 'the complainant' : 'the officer'})</td></tr></table>
  <b>Statement</b><div class="box">${esc(r.description)}</div>
  ${r.suspect_details ? `<b>Suspect and witness details</b><div class="box" style="min-height:30px">${esc(r.suspect_details)}</div>` : ''}
  <p>This statement was read back to the complainant in ${esc(w.language || 'English')}, who confirmed that it is correct and true to the best of their knowledge. Knowingly giving false information to the police is an offence.${w.pf3_issued ? ' A PF3 medical form was issued.' : ''}</p>
  <table><tr><th>Complainant ${w.sign_mode === 'thumbprint' ? '(thumbprint on this paper copy)' : '(signature)'}</th><td style="height:80px">${sigImg ? `<img src="${sigImg}" style="max-height:70px;max-width:100%">` : ''}</td></tr>
  <tr><th>Recording officer</th><td style="height:50px">${esc(r.received_by_name || '')}</td></tr></table>
  <div class="small">Prototype printout, not an official Uganda Police form. Printed ${esc(fmt(new Date().toISOString().slice(0, 19)))}.</div>`;
}

/* ---------- case modal helpers (called from openCase in index.html) ---------- */
function evidenceHtml(ev) {
  const one = x => x.mime.startsWith('audio') ? `<audio src="/api/evidence/${x.id}" controls style="width:100%"></audio>` : x.mime.startsWith('video') ? `<video src="/api/evidence/${x.id}" controls></video>` : `<a href="/api/evidence/${x.id}" target="_blank" rel="noopener"><img src="/api/evidence/${x.id}" alt="Evidence"></a>`;
  const gen = ev.filter(x => !x.kind || x.kind === 'evidence'), aud = ev.filter(x => x.kind === 'statement_audio'), pic = ev.filter(x => x.kind === 'signature' || x.kind === 'id_card');
  return (gen.length ? `<h3>Evidence</h3><div class="evi">${gen.map(one).join('')}</div>` : '')
    + (aud.length ? `<h3>Recorded statement (audio)</h3>${aud.map(one).join('')}` : '')
    + (pic.length ? `<h3>Signature and ID photo</h3><div class="evi">${pic.map(x => `<div><a href="/api/evidence/${x.id}" target="_blank" rel="noopener"><img src="/api/evidence/${x.id}" alt="${x.kind === 'signature' ? 'Signature' : 'ID card'}" style="background:#fff;object-fit:contain"></a><div class="hint">${x.kind === 'signature' ? 'Signature' : 'ID card photo'}</div></div>`).join('')}</div>` : '');
}
function walkinHtml(r) {
  if (r.channel !== 'walk-in') return '';
  const w = r.walkin || {};
  return `<div class="card"><b>🚶 Walk-in report</b> <span class="badge">${esc(r.ob_no || 'no OB no.')}</span>
    <div class="hint">Complainant: <b>${esc(r.reporter_name || '')}</b>${r.reporter_phone ? ' · ' + esc(r.reporter_phone) : ''}${w.address ? ' · ' + esc(w.address) : ''}<br>
    ID shown: ${esc(ID_LABEL(w.id_type))}${w.id_no ? ' · ' + esc(w.id_no) : ''}${w.no_id_reason ? ' · ' + esc(w.no_id_reason) : ''}<br>
    Statement in ${esc(w.language || 'English')}, typed by ${w.typed_by === 'complainant' ? 'the complainant' : 'the officer'}; read back ${w.read_back ? '✓' : '✗'}; ${w.sign_mode === 'thumbprint' ? 'thumbprint on paper copy' : 'signed on screen'}${w.audio_consent ? '; audio recorded with consent' : ''}${w.pf3_issued ? '; PF3 issued' : ''}<br>
    Recorded by ${esc(r.received_by_name || '?')}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="pstmt" type="button">🖨 Print statement</button><button class="btn sm" id="pnewpin" type="button">🧾 New PIN slip</button></div></div>`;
}
function wireWalkin(d) {
  const r = d.report, a = dq('pstmt'), b = dq('pnewpin');
  if (a) a.onclick = async () => { a.disabled = true; try { printDoc(await statementHtml(r, d.evidence)); } finally { a.disabled = false; } };
  if (b) b.onclick = async () => {
    if (!confirm('Issue a new tracking PIN? The PIN on the old slip stops working.')) return;
    try { const n = await api(`/api/police/reports/${encodeURIComponent(r.ref)}/newpin`, 'POST', {}); printDoc(receiptHtml({ ref: n.ref, pin: n.pin, ob_no: r.ob_no, station: r.station_name, name: r.reporter_name, category: r.category, officer: ME && ME.full_name, created_at: r.created_at })); } catch (x) { alert(x.message); }
  };
}

/* =====================================================================
   WALK-IN DESK
   ===================================================================== */
const W0 = () => ({ step: 1, done: null, stations: null, station_id: null,
  c: { name: '', id_type: 'nin', id_no: '', no_id_reason: '', phone: '', address: '', id_photo: null },
  m: { category: '', district: '', place: '', when: nowLocalInput(), seriousness: null },
  s: { description: '', suspect: '', witnesses: '', typed_by: 'officer', language: 'English', pf3: false, consent_audio: false, audio: null, transcript: '' },
  g: { read_back: false, mode: 'signature' } });
let W = W0();
const STEPS = ['ID check', 'Matter', 'Statement', 'Read back & sign'];
const wsteps = () => `<div class="wsteps">${STEPS.map((t, i) => `<span class="${i + 1 === W.step ? 'on' : i + 1 < W.step ? 'done' : ''}">${i + 1}. ${t}</span>`).join('')}</div>`;

async function pWalkin() {
  const body = dq('pbody');
  if (W.done) return wReceipt();
  if (!W.stations) {
    try { W.stations = (await api('/api/police/stations')).stations; } catch { W.stations = []; }
    const own = W.stations.find(s => s.name === ME.station); W.station_id = own ? own.id : (W.stations[0] ? W.stations[0].id : null);
    const st = W.stations.find(s => s.id === W.station_id); if (st && !W.m.district && META.districts.includes(st.district)) W.m.district = st.district;
  }
  body.innerHTML = `<div class="card"><b>🚶 Walk-in desk</b><div class="hint">A citizen has come to the station. Check their ID, record the statement, read it back, get it signed, then give them the receipt. Nothing is written in a paper book first: the system opens the case and the Occurrence Book entry for you.</div></div>${wsteps()}<div id="wstep"></div>`;
  ({ 1: wStep1, 2: wStep2, 3: wStep3, 4: wStep4 }[W.step] || wStep1)();
}
const wErr = (m) => { const e = dq('werr'); if (e) { e.innerHTML = m ? err(m) : ''; if (m) e.scrollIntoView({ block: 'center' }); } };
const wNav = (back, next, nextLabel) => `<div id="werr"></div><div class="row" style="margin-top:14px">${back ? '<button class="btn" id="wback" type="button" style="justify-content:center">← Back</button>' : '<button class="btn" id="wcancel" type="button" style="justify-content:center">Start over</button>'}<button class="btn primary" id="wnext" type="button" style="justify-content:center">${nextLabel || 'Next →'}</button></div>`;

/* step 1: front desk, identity */
function wStep1() {
  const c = W.c, own = W.stations.find(s => s.name === ME.station), fixedStation = ME.role === 'officer' && own;
  dq('wstep').innerHTML = `<div class="card"><h3 style="margin-top:0">1. Front desk: who is reporting?</h3>
    ${fixedStation ? `<div class="hint">Station: <b>${esc(own.name)}</b></div>` : `<label for="wst">Station taking this report</label><select id="wst">${W.stations.map(s => `<option value="${s.id}" ${s.id === W.station_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('') || '<option value="">No station registered. Add one under Posts</option>'}</select>`}
    <div class="row"><div><label for="wname">Full name</label><input id="wname" maxlength="80" value="${esc(c.name)}" autocomplete="off"></div><div><label for="wphone">Phone (for the SMS slip)</label><input id="wphone" inputmode="tel" maxlength="20" placeholder="+2567…" value="${esc(c.phone)}"></div></div>
    <div class="row"><div><label for="wit">ID the complainant shows</label><select id="wit">${Object.entries(META.id_types || {}).map(([k, v]) => `<option value="${k}" ${c.id_type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <div id="widbox"><label for="wid">ID number (as printed)</label><input id="wid" maxlength="30" autocapitalize="characters" value="${esc(c.id_no)}" placeholder="CM…………"></div></div>
    <div id="wnoid" hidden><label for="wnr">Why is no ID shown?</label><input id="wnr" maxlength="200" placeholder="e.g. lost, left at home, victim of robbery" value="${esc(c.no_id_reason)}"><div class="hint">Never turn a complainant away because they have no ID. Record the reason and continue.</div></div>
    <label for="waddr">Home address or village</label><input id="waddr" maxlength="160" value="${esc(c.address)}">
    <label for="widph">Photo of the ID (optional)</label><input id="widph" type="file" accept="image/*" capture="environment">
    <div class="evi" id="widprev" style="margin-top:6px">${c.id_photo ? `<img alt="ID photo" src="data:image/jpeg;base64,${c.id_photo.data}">` : ''}</div>
    <div class="hint">ID check is to stop false reports and to know who to contact. Personal data is visible to police only.</div></div>${wNav(false)}`;
  const sync = () => { dq('widbox').hidden = dq('wit').value === 'none'; dq('wnoid').hidden = dq('wit').value !== 'none'; }; dq('wit').onchange = sync; sync();
  dq('widph').onchange = async () => { const f = dq('widph').files[0]; if (!f) return; try { c.id_photo = await prepFile(f); dq('widprev').innerHTML = `<img alt="ID photo" src="data:image/jpeg;base64,${c.id_photo.data}">`; } catch (x) { wErr(x.message); } };
  dq('wcancel').onclick = () => { if (confirm('Clear everything entered so far?')) { W = W0(); pWalkin(); } };
  dq('wnext').onclick = () => {
    Object.assign(c, { name: dq('wname').value.trim(), phone: dq('wphone').value.trim(), id_type: dq('wit').value, id_no: dq('wid').value.trim().toUpperCase(), no_id_reason: dq('wnr').value.trim(), address: dq('waddr').value.trim() });
    if (dq('wst')) W.station_id = +dq('wst').value || null;
    if (!W.station_id) return wErr('Choose the station taking this report (register one under Posts first).');
    if (c.name.length < 2) return wErr("Enter the complainant's full name.");
    if (c.id_type === 'none') { if (c.no_id_reason.length < 3) return wErr('Say why no ID was shown.'); }
    else if (c.id_type === 'nin' ? !/^C[MF][A-Z0-9]{12}$/.test(c.id_no) : c.id_no.length < 4) return wErr(c.id_type === 'nin' ? 'National ID number is 14 characters starting with CM or CF.' : 'Enter the ID number as printed.');
    W.step = 2; pWalkin();
  };
}

/* step 2: what happened + triage */
function wStep2() {
  const m = W.m, have = new Set(META.categories), seen = new Set();
  const groups = Object.entries(CATGROUPS).map(([g, l]) => [g, l.filter(x => have.has(x) && !seen.has(x) && (seen.add(x), true))]).filter(([, l]) => l.length);
  const rest = META.categories.filter(x => !seen.has(x)); if (rest.length) groups.push(['More', rest]);
  dq('wstep').innerHTML = `<div class="card"><h3 style="margin-top:0">2. What is the matter?</h3>
    <label for="wcat">Type of matter</label><select id="wcat"><option value="">Select…</option>${groups.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(x => `<option ${m.category === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}</select>
    <div class="hint" id="wcatd">${esc(CATDESC[m.category] || '')}</div>
    <div id="wtri"></div>
    <div class="row"><div><label for="wdist">District</label><select id="wdist"><option value="">Select…</option>${META.districts.map(x => `<option ${m.district === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div><label for="wplace">Place or landmark where it happened</label><input id="wplace" maxlength="120" value="${esc(m.place)}"></div></div>
    <label for="wwhen">When did it happen?</label><input type="datetime-local" id="wwhen" max="${nowLocalInput()}" value="${esc(m.when)}"></div>${wNav(true)}`;
  const tri = async () => {
    dq('wcatd').textContent = CATDESC[dq('wcat').value] || ''; if (!dq('wcat').value) { dq('wtri').innerHTML = ''; return; }
    try { const r = await api('/api/police/walkin/preview', 'POST', { category: dq('wcat').value, text: '' }); m.seriousness = r.seriousness; dq('wtri').innerHTML = triageHtml(r); } catch {}
  };
  dq('wcat').onchange = tri; tri();
  dq('wback').onclick = () => { saveStep2(); W.step = 1; pWalkin(); };
  const saveStep2 = () => Object.assign(m, { category: dq('wcat').value, district: dq('wdist').value, place: dq('wplace').value.trim(), when: dq('wwhen').value });
  dq('wnext').onclick = () => {
    saveStep2(); if (!m.category) return wErr('Choose the type of matter.'); if (!m.district) return wErr('Choose the district.'); if (!m.when) return wErr('Enter when it happened.');
    W.step = 3; pWalkin();
  };
}
function triageHtml(r) {
  if (r.emergency) return `<div class="sos"><b>Emergency indicators.</b> Alert the patrol or duty officer now (999 / 112 for the public). Take the statement after help is on the way.</div>`;
  return r.seriousness === 'serious'
    ? `<div class="caution"><b>Serious matter.</b> Take the complainant to a private room. The officer interviews and types the statement. Recording an audio statement (with consent) is recommended.</div>`
    : `<div class="info"><b>Minor matter.</b> The complainant may type the report themselves on this screen (hand over the device). The officer still reads it back before it is saved.</div>`;
}

/* step 3: the interview / statement */
function wStep3() {
  const s = W.s, big = s.typed_by === 'complainant';
  dq('wstep').innerHTML = `<div class="card"><h3 style="margin-top:0">3. Statement: ${esc(W.m.category)}</h3>
    <div class="row"><div><label>Who types the statement?</label><div class="chips"><button type="button" class="chip ${!big ? 'on' : ''}" data-tb="officer">Officer (interview)</button><button type="button" class="chip ${big ? 'on' : ''}" data-tb="complainant">Complainant (kiosk)</button></div></div>
    <div><label for="wlang">Language of the statement</label><input id="wlang" list="wlangs" maxlength="30" value="${esc(s.language)}"><datalist id="wlangs"><option>English</option><option>Luganda</option><option>Runyankole</option><option>Luo</option><option>Ateso</option><option>Swahili</option></datalist></div></div>
    ${big ? '<div class="info">Hand the device to the complainant. They type in their own words. The officer checks it and reads it back on the next screen.</div>' : ''}
    <label for="wdesc">What happened, in the complainant's words</label>
    <textarea id="wdesc" maxlength="4000" style="min-height:200px${big ? ';font-size:19px' : ''}" placeholder="Who, what, where, when, how. Names, descriptions, vehicle or boda number plates, phone numbers, direction they went.">${esc(s.description)}</textarea>
    <div class="hint"><span id="wcnt">${s.description.length}</span>/4000</div>
    <div id="wlive"></div>
    <label for="wsus">Suspect details (name, description, phone, vehicle)</label><textarea id="wsus" maxlength="1000" style="min-height:70px">${esc(s.suspect)}</textarea>
    <label for="wwit">Witnesses (names and phones)</label><input id="wwit" maxlength="600" value="${esc(s.witnesses)}">
    <label class="check"><input type="checkbox" id="wpf3" ${s.pf3 ? 'checked' : ''}> <span>A PF3 medical form was issued (injury, assault, sexual violence)</span></label>
    <div class="card" style="margin:12px 0 0"><b>🎙 Audio statement</b> <span class="hint">recommended for serious matters</span>
      <label class="check"><input type="checkbox" id="wcons" ${s.consent_audio ? 'checked' : ''}> <span>The complainant agrees to this interview being recorded and kept with the case.</span></label>
      <div class="row"><button type="button" class="btn sm" id="wrec">${s.audio ? '🎙 Record again' : '🎙 Start recording'}</button><span class="hint" id="wrecout">${s.audio ? 'Saved ✓' : ''}</span></div>
      <audio id="wplay" controls ${s.audio ? '' : 'hidden'} style="width:100%;margin-top:6px"></audio>
      <div class="hint">Speech to text works in Chrome with internet. If it is not available the audio is still saved with the case.</div></div></div>${wNav(true, true, 'Read back and sign →')}`;
  const save = () => Object.assign(s, { description: dq('wdesc').value, suspect: dq('wsus').value.trim(), witnesses: dq('wwit').value.trim(), language: dq('wlang').value.trim() || 'English', pf3: dq('wpf3').checked, consent_audio: dq('wcons').checked });
  document.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => { save(); s.typed_by = b.dataset.tb; wStep3(); });
  let tm; const live = () => { dq('wcnt').textContent = dq('wdesc').value.length; clearTimeout(tm); tm = setTimeout(async () => { try { const r = await api('/api/police/walkin/preview', 'POST', { category: W.m.category, text: dq('wdesc').value + ' ' + dq('wsus').value }); if (dq('wlive')) dq('wlive').innerHTML = liveHtml(r); } catch {} }, 600); };
  dq('wdesc').oninput = dq('wsus').oninput = live; live();
  if (s.audio && s.audioUrl) dq('wplay').src = s.audioUrl;
  setupWalkinRecorder(s);
  dq('wback').onclick = () => { save(); W.step = 2; pWalkin(); };
  dq('wnext').onclick = () => {
    save(); if (s.description.trim().length < 10) return wErr('Type the statement (at least 10 characters).');
    if (s.audio && !s.consent_audio) return wErr('Tick that the complainant agreed to the audio recording, or record again without it.');
    W.g = { read_back: false, mode: 'signature' }; W.step = 4; pWalkin();   // the statement may have changed, so the signature is always collected after the last edit
  };
}
function liveHtml(r) {
  const inc = r.incidents || [];
  return `<div class="card" style="margin:10px 0"><b>⚖ Law check and interview guide</b> ${badge(r.priority)} <span class="badge">${esc(r.seriousness)}</span>
    ${inc.map(i => `<div class="hint"><b>${esc(i.label)}</b><br><i>Ask:</i> ${i.ask.map(esc).join(' · ')}<br><i>Do first:</i> ${i.first.map(esc).join('; ')}</div>`).join('') || '<div class="hint">Keep typing; suggestions appear as the statement grows.</div>'}
    ${(r.laws || []).map(l => `<div class="hint"><b>${esc(l.source)} · ${esc(l.ref)}</b>: ${esc(l.text)}…</div>`).join('')}</div>`;
}
function setupWalkinRecorder(s) {
  let rec = null, sr = null, chunks = [];
  dq('wrec').onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!dq('wcons').checked) { dq('wrecout').textContent = 'Tick the consent box first.'; return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { dq('wrecout').textContent = 'Recording is not supported in this browser.'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; s.transcript = ''; rec = new MediaRecorder(stream);
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); if (sr) try { sr.stop(); } catch {}
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 9 * 1024 * 1024) { dq('wrecout').textContent = 'Recording too long (keep under about 8 minutes).'; return; }
        const fr = new FileReader(); fr.onload = () => { s.audio = { mime: blob.type.split(';')[0], data: fr.result.split(',')[1] }; }; fr.readAsDataURL(blob);
        s.audioUrl = URL.createObjectURL(blob); dq('wplay').src = s.audioUrl; dq('wplay').hidden = false;
        dq('wrec').textContent = '🎙 Record again'; dq('wrecout').textContent = 'Saved ✓' + (s.transcript ? ' (text captured)' : '');
        if (s.transcript && !dq('wdesc').value.trim()) { dq('wdesc').value = s.transcript; dq('wdesc').oninput(); }
      };
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) { sr = new SR(); sr.continuous = true; sr.interimResults = false; sr.lang = 'en-UG'; sr.onresult = e => { s.transcript = [...e.results].map(r => r[0].transcript).join(' '); }; try { sr.start(); } catch {} }
      rec.start(); dq('wrec').textContent = '⏹ Stop recording'; dq('wrecout').textContent = 'Recording…';
    } catch { dq('wrecout').textContent = 'Microphone permission was denied.'; }
  };
}

/* step 4: read back, sign, save */
function sigPad(canvas) {
  const ctx = canvas.getContext('2d'); let drawing = false, drawn = false, last = null;
  const r0 = canvas.getBoundingClientRect(); canvas.width = Math.round(r0.width * 2); canvas.height = Math.round(r0.height * 2);
  ctx.scale(2, 2); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.onpointerdown = e => { e.preventDefault(); drawing = true; last = pt(e); try { canvas.setPointerCapture(e.pointerId); } catch {} ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(last[0] + .1, last[1] + .1); ctx.stroke(); drawn = true; };
  canvas.onpointermove = e => { if (!drawing) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };
  return { clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }, isEmpty: () => !drawn,
    png() { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0); return c.toDataURL('image/png').split(',')[1]; } };
}
function wStep4() {
  const c = W.c, m = W.m, s = W.s, g = W.g, st = W.stations.find(x => x.id === W.station_id);
  dq('wstep').innerHTML = `<div class="card"><h3 style="margin-top:0">4. Read the statement back</h3>
    <div class="stmt-box"><div class="hint">${esc(st ? st.name : '')} · recorded by ${esc(ME.full_name)} · ${esc(fmt(new Date().toISOString().slice(0, 19)))}</div>
    <p><b>${esc(c.name)}</b> (${esc(ID_LABEL(c.id_type))}${c.id_no ? ' ' + esc(c.id_no) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}${c.address ? ' · ' + esc(c.address) : ''}) states:</p>
    <div class="hint">${esc(m.category)} · ${esc(m.place ? m.place + ', ' : '')}${esc(m.district)} · ${esc(fmt(m.when.replace('T', ' ')))}</div>
    <p style="white-space:pre-wrap;margin:8px 0">${esc(s.description)}</p>
    ${s.suspect ? `<div class="hint"><b>Suspect:</b> ${esc(s.suspect)}</div>` : ''}${s.witnesses ? `<div class="hint"><b>Witnesses:</b> ${esc(s.witnesses)}</div>` : ''}</div>
    <label class="check"><input type="checkbox" id="wrb" ${g.read_back ? 'checked' : ''}> <span>I read this statement back to the complainant in <b>${esc(s.language)}</b> and they confirm it is correct and true. They understand that knowingly giving false information to the police is an offence.</span></label>
    <label>How does the complainant sign?</label><div class="chips"><button type="button" class="chip ${g.mode === 'signature' ? 'on' : ''}" data-sm="signature">Sign on screen</button><button type="button" class="chip ${g.mode === 'thumbprint' ? 'on' : ''}" data-sm="thumbprint">Cannot write: thumbprint on paper copy</button></div>
    <div id="wsigbox" ${g.mode === 'signature' ? '' : 'hidden'}><canvas id="wsig" class="sigpad"></canvas><div class="row" style="margin-top:6px"><button type="button" class="btn sm" id="wsigclear">Clear signature</button><span class="hint">Complainant signs with a finger, stylus or mouse.</span></div></div>
    <div id="wthumb" class="hint" ${g.mode === 'thumbprint' ? '' : 'hidden'}>The statement will be saved now. Print it from the case and take the thumbprint in ink on the paper copy.</div></div>${wNav(true, true, 'Save report and issue receipt')}`;
  let pad = g.mode === 'signature' ? sigPad(dq('wsig')) : null;
  document.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { g.read_back = dq('wrb').checked; g.mode = b.dataset.sm; wStep4(); });
  if (dq('wsigclear')) dq('wsigclear').onclick = () => pad && pad.clear();
  dq('wback').onclick = () => { W.step = 3; pWalkin(); };
  dq('wnext').onclick = async () => {
    wErr(''); if (!dq('wrb').checked) return wErr('Read the statement back to the complainant and tick the box.');
    if (g.mode === 'signature' && pad.isEmpty()) return wErr('The complainant must sign in the box, or choose the thumbprint option.');
    const btn = dq('wnext'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await api('/api/police/walkin', 'POST', { station_id: W.station_id, complainant: { name: c.name, id_type: c.id_type, id_no: c.id_no, no_id_reason: c.no_id_reason, phone: c.phone, address: c.address },
        id_photo: c.id_photo ? { data: c.id_photo.data } : null, category: m.category, district: m.district, place: m.place, occurred_at: m.when, description: s.description, suspect: s.suspect, witnesses: s.witnesses,
        typed_by: s.typed_by, language: s.language, pf3_issued: s.pf3, audio: s.audio, consent_audio: s.consent_audio, audio_transcript: s.transcript, read_back: true, sign_mode: g.mode, signature: g.mode === 'signature' ? pad.png() : null });
      if (typeof alertSince !== 'undefined' && alertSince !== null) alertSince = Math.max(alertSince, r.id);   // do not pop an alert for the case this officer just created
      W.done = { ...r, name: c.name, category: m.category, phone: c.phone }; pWalkin();
    } catch (x) { btn.disabled = false; btn.textContent = 'Save report and issue receipt'; wErr(x.message); }
  };
}

/* receipt screen */
function wReceipt() {
  const r = W.done;
  dq('pbody').innerHTML = `<div class="card"><h2 style="margin-top:0">✓ Report recorded</h2>
    <div class="hint">The case is open and the Occurrence Book entry is written. Give the complainant the slip.</div>
    <div class="card refbox" style="margin:10px 0 6px">${esc(r.ref)}</div><div class="card pinbox">PIN ${esc(r.pin)}</div>
    <div class="grid2"><div class="card" style="margin:0"><div class="hint">Station log</div><b>${esc(r.ob_no)}</b><div class="hint">${esc(r.station)} · ${esc(r.officer)}</div></div>
    <div class="card" style="margin:0;text-align:center" id="wqr"></div></div>
    ${r.emergency ? '<div class="sos"><b>Emergency indicators.</b> Make sure a patrol or the duty officer has been alerted.</div>' : ''}
    ${r.duplicate_of ? `<div class="warn">⚠ Similar report ${esc(r.duplicate_of)} (same crime, district and place in the last 2 days). Consider linking the cases.</div>` : ''}
    ${r.phone ? `<div class="ok">A text with the case number and PIN was sent to ${esc(r.phone)} (demo inbox: /phone.html).</div>` : '<div class="hint">No phone number was given, so no text was sent. The printed slip is the only copy of the PIN.</div>'}
    <div class="row" style="margin-top:12px"><button class="btn primary" id="wpr" style="justify-content:center">🖨 Print receipt slip</button><button class="btn" id="wps" style="justify-content:center">🖨 Print statement</button></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="wopen" style="justify-content:center">Open the case</button><button class="btn" id="wnew" style="justify-content:center">New walk-in report</button></div></div>`;
  try { dq('wqr').innerHTML = QR.svg(trackUrl(r.ref), { scale: 4, margin: 2, size: 130 }) + '<div class="hint">Scan to track</div>'; } catch {}
  dq('wpr').onclick = () => printDoc(receiptHtml(r));
  dq('wps').onclick = async () => { const d = await api('/api/police/reports/' + encodeURIComponent(r.ref)); printDoc(await statementHtml(d.report, d.evidence)); };
  dq('wopen').onclick = () => openCase(r.ref);
  dq('wnew').onclick = () => { W = W0(); pWalkin(); };
}

/* =====================================================================
   OCCURRENCE BOOK
   ===================================================================== */
let OBF = { station_id: '', type: '', q: '', date: '' };
let OB_LAST = null;
async function pOB() {
  const body = dq('pbody');
  if (!dq('obf')) {
    body.innerHTML = `<div class="card"><b>📒 Occurrence Book</b><div class="hint">The station's official daily log. Reports (online and walk-in) and case closures are entered here automatically. Add patrols, arrests, incidents and enquiries yourself. <b>Entries cannot be edited or deleted.</b> Fix a mistake with a new "Correction" entry that quotes the OB number. Each entry is chained to the one before it so changes can be detected.</div></div>
    <details class="card" id="obnew"><summary style="cursor:pointer;font-weight:600">＋ New entry</summary><div id="obnewbody"></div></details>
    <div class="filters" id="obf"><select id="obst" ${ME.role === 'officer' ? 'hidden' : ''}></select>
      <select id="obty"><option value="">All entry types</option>${(META.ob_types || []).map(t => `<option ${OBF.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <input id="obq" placeholder="Search OB no., case, name, text" value="${esc(OBF.q)}"><input type="date" id="obd" value="${esc(OBF.date)}" title="Only this day"></div>
    <div class="row" style="margin-bottom:12px;flex-wrap:wrap"><button class="btn sm" id="obprint" type="button">🖨 Print this page</button>${ME.role !== 'officer' ? '<a class="btn sm" id="obcsv" href="#" style="text-decoration:none">⬇ Export CSV</a><button class="btn sm" id="obver" type="button">🔒 Check integrity</button>' : ''}</div>
    <div id="obverout"></div><div id="oblist" class="hint">Loading…</div>`;
    dq('obf').oninput = () => { OBF = { station_id: dq('obst').value, type: dq('obty').value, q: dq('obq').value, date: dq('obd').value }; fetchOB(); };
    dq('obprint').onclick = printOB;
    if (dq('obver')) dq('obver').onclick = verifyOB;
    dq('oblist').onclick = e => { const c = e.target.closest('[data-open]'); if (c) { e.preventDefault(); openCase(c.dataset.open); } };
  }
  fetchOB();
}
async function fetchOB() {
  const p = new URLSearchParams(); if (OBF.station_id) p.set('station_id', OBF.station_id); if (OBF.type) p.set('type', OBF.type); if (OBF.q) p.set('q', OBF.q);
  if (OBF.date) { const a = new Date(OBF.date + 'T00:00:00'), b = new Date(a.getTime() + 86400000); p.set('from', utcStr(a)); p.set('to', utcStr(b)); }
  const d = await api('/api/police/ob?' + p), el = dq('oblist'); if (!el) return;
  OB_LAST = d;
  const sel = dq('obst'); if (sel && !sel.dataset.ready) { sel.innerHTML = `<option value="">${d.station_id ? 'My station' : 'All stations'}</option>` + d.stations.map(s => `<option value="${s.id}" ${String(d.station_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join(''); sel.dataset.ready = 1; if (d.station_id && !OBF.station_id) { OBF.station_id = String(d.station_id); sel.value = OBF.station_id; } }
  const csv = dq('obcsv'); if (csv) csv.href = '/api/police/ob/export.csv' + (OBF.station_id ? '?station_id=' + encodeURIComponent(OBF.station_id) : '');
  obNewForm(d);
  el.className = ''; el.innerHTML = d.entries.length ? d.entries.map(e => `<div class="ob"><div class="obno">${esc(e.ob_no)}<small>${esc(fmt(e.created_at))}</small><small>${esc(e.station)}</small></div>
    <div><span class="badge">${esc(e.entry_type)}</span> ${e.report_ref ? `<a href="#" class="oblink" data-open="${esc(e.report_ref)}">${esc(e.report_ref)}</a>` : ''}<div class="obtxt">${esc(e.summary)}</div><div class="hint">${esc(e.officer_name || 'System')}${e.complainant ? ' · re: ' + esc(e.complainant) : ''}</div></div></div>`).join('') : '<div class="hint">No entries match.</div>';
}
function obNewForm(d) {
  const box = dq('obnewbody'); if (!box || box.dataset.ready) return; box.dataset.ready = 1;
  const needStation = ME.role !== 'officer' || !d.station_id;
  box.innerHTML = `<div class="hint">What the station would write in the book. No names or details beyond what is needed.</div>
    <div class="row"><div><label for="obnt">Type</label><select id="obnt">${(META.manual_ob_types || []).map(t => `<option>${esc(t)}</option>`).join('')}</select></div>${needStation && d.stations.length ? `<div><label for="obns">Station</label><select id="obns">${d.stations.map(s => `<option value="${s.id}" ${String(d.station_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}</div>
    <label for="obnx">Entry</label><textarea id="obnx" maxlength="3000" style="min-height:90px" placeholder="e.g. 14:20 Foot patrol Nakawa market, two boda riders cautioned for obstruction."></textarea>
    <div class="row"><div><label for="obnr">Related case (optional)</label><input id="obnr" maxlength="12" placeholder="UG-1234" autocapitalize="characters"></div><div><label for="obnc">Person involved (optional)</label><input id="obnc" maxlength="100"></div></div>
    <div id="obnerr"></div><button class="btn primary sm" id="obnsave" type="button" style="margin-top:10px">Write entry</button>`;
  dq('obnsave').onclick = async () => {
    dq('obnerr').innerHTML = '';
    try { const r = await api('/api/police/ob', 'POST', { entry_type: dq('obnt').value, summary: dq('obnx').value, report_ref: dq('obnr').value, complainant: dq('obnc').value, station_id: dq('obns') ? +dq('obns').value : (d.station_id || null) });
      dq('obnx').value = ''; dq('obnr').value = ''; dq('obnc').value = ''; dq('obnew').open = false; dq('obverout').innerHTML = `<div class="ok">Written as ${esc(r.ob_no)}.</div>`; fetchOB();
    } catch (x) { dq('obnerr').innerHTML = err(x.message); }
  };
}
async function verifyOB() {
  const out = dq('obverout'); out.innerHTML = '<div class="hint">Checking…</div>';
  try {
    const r = await api('/api/police/ob/verify' + (OBF.station_id ? '?station_id=' + encodeURIComponent(OBF.station_id) : ''));
    out.innerHTML = r.results.filter(x => x.entries || !OBF.station_id).map(x => x.ok ? `<div class="ok">🔒 <b>${esc(x.station)}</b>: ${x.entries} entr${x.entries === 1 ? 'y' : 'ies'}, chain intact.${x.last_hash ? ` Last hash <code>${esc(x.last_hash.slice(0, 12))}…</code> (write it on the signed daily page to anchor it).` : ''}</div>` : `<div class="err">⚠ <b>${esc(x.station)}</b>: the chain is broken at <b>${esc(x.first_bad)}</b>. An entry was changed, removed or inserted outside the system. Report to the commander.</div>`).join('') || '<div class="hint">No entries to check.</div>';
  } catch (x) { out.innerHTML = err(x.message); }
}
function printOB() {
  const d = OB_LAST; if (!d || !d.entries.length) return alert('Nothing to print.');
  const rows = [...d.entries].reverse();
  printDoc(`${PRINT_CSS}<h1>UGANDA POLICE FORCE · OCCURRENCE BOOK</h1><h2>${esc(rows[0].station)}${OBF.date ? ' · ' + esc(OBF.date) : ''}${OBF.type ? ' · ' + esc(OBF.type) : ''}</h2>
    <table><tr><th style="width:90px">OB no.</th><th style="width:100px">Time</th><th style="width:90px">Type</th><th>Entry</th><th style="width:100px">Officer</th></tr>${rows.map(e => `<tr><td>${esc(e.ob_no)}</td><td>${esc(fmt(e.created_at))}</td><td>${esc(e.entry_type)}</td><td>${esc(e.summary)}${e.report_ref ? ' <b>[' + esc(e.report_ref) + ']</b>' : ''}${e.complainant ? '<br>re: ' + esc(e.complainant) : ''}</td><td>${esc(e.officer_name || 'System')}</td></tr>`).join('')}</table>
    <div class="small">Printed ${esc(fmt(new Date().toISOString().slice(0, 19)))} by ${esc(ME.full_name)} · last entry hash ${esc(rows[rows.length - 1].entry_hash.slice(0, 16))}. Prototype printout.</div><div class="sig"></div><div class="small">Station commander (signature and date)</div>`);
}
