/* Hotspot map: a small pan-and-zoom map (OpenStreetMap tiles) with the reports drawn as dots.
   Drag to move, scroll / pinch / double-click / + - buttons to zoom, tap a dot to see the case.
   Works without internet too: the dots and the blue background still show, only the street tiles are missing. */
'use strict';
function slippyMap(box, points, opts) {
  opts = opts || {};
  const COL = { urgent: '#d32f2f', high: '#ef8f00', normal: '#1f5fd6' }, MINZ = 5, MAXZ = 18;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  box.innerHTML = '';
  const tiles = document.createElement('div'), dots = document.createElement('div'), tip = document.createElement('div');
  tiles.style.cssText = dots.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  tip.className = 'tip'; tip.hidden = true;
  const mk = (t, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mbtn'; b.textContent = t; b.setAttribute('aria-label', f.label); b.onclick = e => { e.stopPropagation(); f.fn(); }; b.onpointerdown = e => e.stopPropagation(); return b; };
  const zin = mk('+', { label: 'Zoom in', fn: () => zoomBy(1) }), zout = mk('−', { label: 'Zoom out', fn: () => zoomBy(-1) }), fit = mk('⤢', { label: 'Show all reports', fn: () => fitAll() });
  zin.style.top = '8px'; zout.style.top = '48px'; fit.style.top = '88px';
  const attr = document.createElement('div'); attr.style.cssText = 'position:absolute;right:4px;bottom:2px;font-size:10px;background:#ffffffcc;padding:0 4px;border-radius:4px;color:#333'; attr.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="color:#1f3a93">OpenStreetMap</a>';
  box.append(tiles, dots, zin, zout, fit, attr, tip);

  const pts = points.filter(p => Number.isFinite(+p.lat) && Number.isFinite(+p.lng)).map(p => ({ ...p, lat: +p.lat, lng: +p.lng }));
  let W = box.clientWidth || 320, H = box.clientHeight || 340, z = 6, cx = 0, cy = 0;   // cx, cy = centre in world pixels at zoom z
  const world = zz => 256 * Math.pow(2, zz);
  const px = (lat, lng, zz) => { const s = world(zz), r = lat * Math.PI / 180; return [(lng + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s]; };
  const unpx = (x, y, zz) => { const s = world(zz), n = Math.PI - 2 * Math.PI * y / s; return [180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), x / s * 360 - 180]; };
  const setCenter = (lat, lng, zz) => { z = Math.max(MINZ, Math.min(MAXZ, zz)); [cx, cy] = px(Math.max(-85, Math.min(85, lat)), lng, z); };
  const centre = () => unpx(cx, cy, z);
  const cache = new Map();

  function draw() {
    W = box.clientWidth || W; H = box.clientHeight || H;
    const tz = Math.max(0, Math.min(19, Math.round(z))), k = Math.pow(2, z - tz), ts = 256 * k, n = Math.pow(2, tz);
    const left = cx - W / 2, top = cy - H / 2, want = new Set();
    const x0 = Math.floor(left / ts), x1 = Math.floor((left + W) / ts), y0 = Math.max(0, Math.floor(top / ts)), y1 = Math.min(n - 1, Math.floor((top + H) / ts));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const wx = ((x % n) + n) % n, key = tz + '/' + wx + '/' + y; want.add(key + '@' + x);
      let im = cache.get(key + '@' + x);
      if (!im) { im = new Image(); im.alt = ''; im.draggable = false; im.src = `https://tile.openstreetmap.org/${tz}/${wx}/${y}.png`; im.style.cssText = 'position:absolute;max-width:none;user-select:none'; im.onerror = () => { im.style.display = 'none'; }; cache.set(key + '@' + x, im); tiles.appendChild(im); }
      im.style.left = Math.round(x * ts - left) + 'px'; im.style.top = Math.round(y * ts - top) + 'px'; im.style.width = im.style.height = Math.ceil(ts) + 1 + 'px';
    }
    for (const [key, im] of cache) if (!want.has(key)) { im.remove(); cache.delete(key); }
    // dots
    dots.innerHTML = '';
    const r = z >= 11 ? 9 : z >= 8 ? 8 : 7;
    for (const p of pts) {
      const [x, y] = px(p.lat, p.lng, z), sx = x - left, sy = y - top; if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const d = document.createElement('div'), c = COL[p.priority] || COL.normal;
      d.style.cssText = `position:absolute;left:${sx - r}px;top:${sy - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${c}b3;border:2px solid ${c};box-shadow:0 0 0 2px #ffffffcc;cursor:pointer`;
      d.dataset.ref = p.ref; d.title = p.ref + ' · ' + p.category; d.setAttribute('role', 'button'); d.tabIndex = 0; dots.appendChild(d);
    }
  }
  const zoomAt = (dz, mx, my) => {   // zoom keeping the point under (mx,my) fixed
    const nz = Math.max(MINZ, Math.min(MAXZ, z + dz)); if (nz === z) return;
    const f = Math.pow(2, nz - z), left = cx - W / 2, top = cy - H / 2;
    cx = (left + mx) * f - (mx - W / 2); cy = (top + my) * f - (my - H / 2); z = nz; draw();
  };
  const zoomBy = dz => zoomAt(dz, W / 2, H / 2);
  function fitAll() {
    tip.hidden = true;
    if (!pts.length) return setCenter(1.37, 32.29, 6), draw();
    let a = 90, b = -90, c = 180, d = -180; pts.forEach(p => { a = Math.min(a, p.lat); b = Math.max(b, p.lat); c = Math.min(c, p.lng); d = Math.max(d, p.lng); });
    let zz = MAXZ - 3; for (; zz > MINZ; zz -= 0.25) { const [x0, y0] = px(b, c, zz), [x1, y1] = px(a, d, zz); if (x1 - x0 < W - 80 && y1 - y0 < H - 80) break; }
    setCenter((a + b) / 2, (c + d) / 2, Math.min(zz, 14)); draw();
  }

  // gestures: drag to pan, two fingers to pinch, wheel / double click to zoom
  const ptrs = new Map(); let moved = 0, pinch0 = 0, down = null;
  box.onpointerdown = e => { if (e.target.closest('.mbtn,.tip a,.tip button')) return; box.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; down = e.target; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
  box.onpointermove = e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), r = box.getBoundingClientRect(); if (pinch0) zoomAt(Math.log2(dist / pinch0), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch0 = dist; moved += 10; return; }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; moved += Math.abs(dx) + Math.abs(dy); cx -= dx; cy -= dy; draw();
  };
  const end = e => {
    const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
    if (was && moved < 6 && down) { const d = down.closest && down.closest('[data-ref]'); if (d) showTip(e); else tip.hidden = true; }
    down = null;
  };
  box.onpointerup = end; box.onpointercancel = e => { ptrs.delete(e.pointerId); };
  box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(-Math.sign(e.deltaY) * 0.6, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  box.ondblclick = e => { if (e.target.closest('.mbtn,.tip')) return; const r = box.getBoundingClientRect(); zoomAt(1, e.clientX - r.left, e.clientY - r.top); };
  dots.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.ref) { e.preventDefault(); showTip(null, e.target); } };

  function showTip(e, el) {
    const r = box.getBoundingClientRect(), mx = e ? e.clientX - r.left : el.offsetLeft + 8, my = e ? e.clientY - r.top : el.offsetTop + 8, left = cx - W / 2, top = cy - H / 2;
    const near = pts.filter(p => { const [x, y] = px(p.lat, p.lng, z); return Math.hypot(x - left - mx, y - top - my) < 16; }).slice(0, 5);
    if (!near.length) { tip.hidden = true; return; }
    tip.innerHTML = near.map(p => `<div style="margin:2px 0"><b style="color:${COL[p.priority] || COL.normal}">●</b> <b>${esc(p.ref)}</b> · ${esc(p.category)}<br><span style="color:#4f5f88">${esc(p.district || '')}${p.status ? ' · ' + esc(p.status) : ''} · ${esc(p.priority)}</span> <button type="button" class="btn sm" data-open="${esc(p.ref)}" style="padding:3px 10px;margin-left:6px">Open case</button></div>`).join('');
    tip.hidden = false;
    tip.querySelectorAll('[data-open]').forEach(b => b.onclick = ev => { ev.stopPropagation(); if (opts.onOpen) opts.onOpen(b.dataset.open); });
  }
  tip.onpointerdown = e => e.stopPropagation();
  new ResizeObserver(() => draw()).observe(box);
  fitAll();
  return { fitAll, zoomBy, state: () => ({ z, centre: centre() }), count: pts.length };
}
