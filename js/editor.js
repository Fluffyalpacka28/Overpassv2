// Level editor: custom race tracks, saved on this device, shareable as files.
//  - A map is a closed loop of control points (metres) plus a scenery theme, laps, rivals, rival skill and how hilly it is.
//  - The editor is a top-down canvas: drag points to shape the track, tap the road to add a point, select a point and
//    delete it, drag empty space to pan, pinch / scroll to zoom.
//  - Maps are saved to this device (localStorage) and can be exported to / imported from .json files (".overpass-map.json").
// Imported files land in the same list, so they can be raced, edited and picked for multiplayer like your own.

const KEY = 'osm.maps.v1';
export const MAP_KIND = 'overpass-map';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- storage ----------
export function loadMaps() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.map(m => cleanMap(m)).filter(Boolean) : []; } catch { return []; }
}
export function saveMaps(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.map(m => cleanMap(m)).filter(Boolean))); return true; } catch { return false; }
}
export function upsertMap(m) { const list = loadMaps(), i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else list.unshift(m); saveMaps(list); return list; }
export function deleteMap(id) { saveMaps(loadMaps().filter(m => m.id !== id)); }
const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// a fresh map: a rounded rectangle-ish loop, ~1.2 km
export function newMap(themes) {
  const pts = []; const n = 10;
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push([Math.round(Math.cos(t) * 230), Math.round(Math.sin(t) * 140 * (1 + 0.15 * Math.sin(2 * t)))]); }
  return cleanMap({ id: newId(), name: 'My Track', place: 'Anywhere', theme: (themes && themes[0]) || 'lakeside', laps: 3, rivals: 4, skill: 0.95, hills: 1, pts, created: Date.now() });
}
// sanitise anything that comes from storage or a file (it's untrusted)
export function cleanMap(m, themes) {
  if (m && typeof m === 'object' && m.kind === 'model') return cleanModelMap(m);
  if (!m || typeof m !== 'object' || !Array.isArray(m.pts)) return null;
  const pts = m.pts.filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).slice(0, 80).map(p => [clamp(Math.round(+p[0] * 10) / 10, -2500, 2500), clamp(Math.round(+p[1] * 10) / 10, -2500, 2500)]);
  if (pts.length < 4) return null;
  const str = (v, d, n) => (typeof v === 'string' && v.trim() ? v.trim() : d).replace(/[<>]/g, '').slice(0, n);
  const theme = typeof m.theme === 'string' && (!themes || themes.includes(m.theme)) ? m.theme : (themes ? themes[0] : 'lakeside');
  let seed = Math.floor(+m.seed); if (!Number.isFinite(seed) || seed <= 0) { seed = 1; for (const p of pts) seed = (seed * 31 + Math.round(p[0] * 7 + p[1] * 13)) % 100000 + 1; }
  return {
    id: typeof m.id === 'string' && /^[a-z0-9]{4,24}$/i.test(m.id) ? m.id : newId(), name: str(m.name, 'Custom Track', 40), place: str(m.place, 'Custom map', 40), theme,
    laps: clamp(Math.round(+m.laps || 3), 1, 20), rivals: clamp(Math.round(+m.rivals || 0), 0, 7), skill: clamp(+m.skill || 0.95, 0.75, 1.2), hills: clamp(m.hills == null ? 1 : +m.hills, 0, 2),
    pts, seed, created: +m.created || Date.now(), edited: +m.edited || Date.now(), imported: !!m.imported, author: str(m.author, '', 24),
  };
}
// a 3D model map (a driveable world made from an uploaded model; the file itself lives in IndexedDB as 'mapm:<h>')
export function cleanModelMap(m) {
  const str = (v, d, n) => (typeof v === 'string' && v.trim() ? v.trim() : d).replace(/[<>]/g, '').slice(0, n);
  if (typeof m.h !== 'string' || !/^[a-z0-9]{1,24}$/i.test(m.h) || !['glb', 'gltf', 'obj', 'stl'].includes(m.ext)) return null;
  return {
    id: typeof m.id === 'string' && /^[a-z0-9]{4,24}$/i.test(m.id) ? m.id : newId(), kind: 'model', name: str(m.name, '3D Map', 40), place: str(m.place, '3D model', 40),
    h: m.h, ext: m.ext, bytes: Math.max(0, +m.bytes || 0), mult: clamp(+m.mult || 1, 0.1, 10), rot: ((m.rot | 0) % 4 + 4) % 4, zup: !!m.zup,
    created: +m.created || Date.now(), edited: +m.edited || Date.now(), imported: !!m.imported, author: str(m.author, '', 24),
  };
}
// a map as a race level (what story.js / storyland.js build from)
export function mapLevel(m) {
  return { id: 'c:' + m.id, rev: m.edited, custom: true, map: m, name: m.name, place: m.place, theme: m.theme, laps: m.laps, rivals: m.rivals, skill: m.skill, hills: m.hills, seed: m.seed, radius: 200, pts: m.pts, lat: 0, lon: 0 };
}
// ---------- files ----------
export function exportMap(m) {
  const data = { kind: MAP_KIND, v: 1, ...cleanMap(m), imported: undefined };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (m.name || 'track').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.overpass-map.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// read one or more files; returns { added: [maps], bad: n }
export async function importFiles(files, themes) {
  const added = []; let bad = 0;
  for (const f of files) {
    try {
      if (f.size > 400000) { bad++; continue; }
      const j = JSON.parse(await f.text()), arr = Array.isArray(j) ? j : Array.isArray(j.maps) ? j.maps : [j];
      for (const x of arr) { const m = cleanMap({ ...x, id: undefined, imported: true, edited: Date.now() }, themes); if (m) added.push(m); else bad++; }
    } catch { bad++; }
  }
  if (added.length) { const list = loadMaps(); saveMaps([...added, ...list]); }
  return { added, bad };
}

// ---------- geometry helpers ----------
// closed centripetal Catmull-Rom through the control points (same family as the race track), n samples
export function smoothLoop(pts, n = 240) {
  const P = pts, N = P.length, out = [];
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-3, 0.5);
  for (let i = 0; i < N; i++) {
    const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), steps = Math.max(4, Math.round(n / N));
    for (let s = 0; s < steps; s++) {
      const t = t1 + (t2 - t1) * s / steps;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}
function segX(a, b, c, d) { // do segments ab and cd cross?
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
export function selfCrossing(loop) {
  const n = loop.length;
  for (let i = 0; i < n; i += 2) for (let j = i + 4; j < n - 1; j += 2) { if (i === 0 && j >= n - 4) continue; if (segX(loop[i], loop[(i + 2) % n], loop[j], loop[(j + 2) % n])) return true; }
  return false;
}

// ---------- the editor ----------
export class MapEditor {
  // ui: { canvas, onChange(map) } — the screen around it (fields, buttons) is wired up by main.js
  constructor(canvas, onChange) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.onChange = onChange || (() => { });
    this.map = null; this.sel = -1; this.view = { x: 0, z: 0, s: 1 }; this.ptrs = new Map(); this.drag = null; this.pinch = 0; this.theme = { ground: '#5f8a4e' };
    const C = canvas;
    C.addEventListener('pointerdown', e => this.down(e)); C.addEventListener('pointermove', e => this.move(e));
    C.addEventListener('pointerup', e => this.up(e)); C.addEventListener('pointercancel', e => this.up(e));
    C.addEventListener('wheel', e => { e.preventDefault(); const p = this.local(e); this.zoomAt(p, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    C.addEventListener('dblclick', e => { const i = this.hitPoint(this.local(e)); if (i >= 0) this.removePoint(i); });
    new ResizeObserver(() => this.draw()).observe(C);
  }
  open(map, theme) { this.map = map; this.sel = -1; if (theme) this.theme = theme; this.fit(); this.draw(); }
  // view: metres <-> canvas pixels
  size() { const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } return { w: r.width, h: r.height, dpr }; }
  toPx(x, z) { const { w, h } = this.size(); return [w / 2 + (x - this.view.x) * this.view.s, h / 2 + (z - this.view.z) * this.view.s]; }
  toM(px, py) { const { w, h } = this.size(); return [this.view.x + (px - w / 2) / this.view.s, this.view.z + (py - h / 2) / this.view.s]; }
  local(e) { const r = this.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  fit() {
    const P = this.map.pts, { w, h } = this.size(); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    this.view.x = (x0 + x1) / 2; this.view.z = (z0 + z1) / 2; this.view.s = Math.min((w - 70) / Math.max(60, x1 - x0), (h - 70) / Math.max(60, z1 - z0));
  }
  zoomAt(p, k) { const [mx, mz] = this.toM(p[0], p[1]); this.view.s = clamp(this.view.s * k, 0.05, 6); const [nx, nz] = this.toM(p[0], p[1]); this.view.x += mx - nx; this.view.z += mz - nz; this.draw(); }
  hitPoint(p) { let best = -1, bd = 26; this.map.pts.forEach(([x, z], i) => { const [px, py] = this.toPx(x, z), d = Math.hypot(px - p[0], py - p[1]); if (d < bd) { bd = d; best = i; } }); return best; }
  // tapping the road between two points adds one there
  hitRoad(p) {
    const P = this.map.pts, n = P.length; let best = -1, bd = Math.max(16, 9 * this.view.s);
    for (let i = 0; i < n; i++) { const a = this.toPx(...P[i]), b = this.toPx(...P[(i + 1) % n]); const ax = b[0] - a[0], ay = b[1] - a[1], l2 = ax * ax + ay * ay || 1, u = clamp(((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / l2, 0, 1), d = Math.hypot(p[0] - a[0] - ax * u, p[1] - a[1] - ay * u); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  down(e) {
    if (!this.map) return; this.cv.setPointerCapture?.(e.pointerId); const p = this.local(e); this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); this.drag = null; return; }
    const i = this.hitPoint(p);
    if (i >= 0) { this.sel = i; this.drag = { kind: 'pt', i, moved: false }; }
    else this.drag = { kind: 'pan', p, t: performance.now(), moved: false };
    this.draw(); this.onChange(this.map, 'select');
  }
  move(e) {
    const p = this.local(e), prev = this.ptrs.get(e.pointerId); if (!prev) return; this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (this.pinch) this.zoomAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d / this.pinch); this.pinch = d; return; }
    const D = this.drag; if (!D) return;
    if (D.kind === 'pt') { const [x, z] = this.toM(p[0], p[1]); this.map.pts[D.i] = [Math.round(clamp(x, -2500, 2500)), Math.round(clamp(z, -2500, 2500))]; D.moved = true; this.draw(); this.onChange(this.map, 'live'); }
    else { if (Math.hypot(p[0] - D.p[0], p[1] - D.p[1]) > 6) D.moved = true; this.view.x -= (p[0] - prev[0]) / this.view.s; this.view.z -= (p[1] - prev[1]) / this.view.s; this.draw(); }
  }
  up(e) {
    const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = 0;
    const D = this.drag; this.drag = null; if (!D || !p) return;
    if (D.kind === 'pt' && D.moved) this.onChange(this.map, 'edit');
    if (D.kind === 'pan' && !D.moved && performance.now() - D.t < 400) {
      const seg = this.hitRoad(p);
      if (seg >= 0 && this.map.pts.length < 80) { const [x, z] = this.toM(p[0], p[1]); this.map.pts.splice(seg + 1, 0, [Math.round(x), Math.round(z)]); this.sel = seg + 1; this.onChange(this.map, 'edit'); }
      else { this.sel = -1; this.onChange(this.map, 'select'); }
      this.draw();
    }
  }
  removePoint(i = this.sel) { if (i < 0 || this.map.pts.length <= 4) return false; this.map.pts.splice(i, 1); this.sel = -1; this.draw(); this.onChange(this.map, 'edit'); return true; }
  // flip the driving direction (and keep the start line on the same point)
  reverse() { const P = this.map.pts; this.map.pts = [P[0], ...P.slice(1).reverse()]; this.sel = -1; this.draw(); this.onChange(this.map, 'edit'); }
  // scale the whole track around its centre
  scale(k) { let cx = 0, cz = 0; const P = this.map.pts; for (const [x, z] of P) { cx += x; cz += z; } cx /= P.length; cz /= P.length; this.map.pts = P.map(([x, z]) => [Math.round(cx + (x - cx) * k), Math.round(cz + (z - cz) * k)]); this.draw(); this.onChange(this.map, 'edit'); }
  draw() {
    if (!this.map) return; const { w, h, dpr } = this.size(), c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = this.theme.ground || '#5f8a4e'; c.fillRect(0, 0, w, h);
    // grid every 50 m (100 m lines stronger)
    const step = this.view.s * 50 < 14 ? 250 : 50, [gx0, gz0] = this.toM(0, 0), [gx1, gz1] = this.toM(w, h);
    for (let x = Math.floor(gx0 / step) * step; x <= gx1; x += step) { const [px] = this.toPx(x, 0); c.strokeStyle = x % (step * 2) === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, h); c.stroke(); }
    for (let z = Math.floor(gz0 / step) * step; z <= gz1; z += step) { const [, py] = this.toPx(0, z); c.strokeStyle = z % (step * 2) === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(0, py); c.lineTo(w, py); c.stroke(); }
    // the road (16 m wide), kerbs and centre line
    const loop = smoothLoop(this.map.pts), path = () => { c.beginPath(); loop.forEach(([x, z], i) => { const [px, py] = this.toPx(x, z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); };
    c.lineJoin = 'round'; c.lineCap = 'round';
    path(); c.strokeStyle = '#e8e2d6'; c.lineWidth = Math.max(6, 19 * this.view.s); c.stroke();
    path(); c.strokeStyle = '#3b3d44'; c.lineWidth = Math.max(4, 16 * this.view.s); c.stroke();
    path(); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = Math.max(1, 0.6 * this.view.s); c.setLineDash([8, 10]); c.stroke(); c.setLineDash([]);
    // direction arrows along the road
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 8; i < loop.length; i += 24) { const [x, z] = loop[i], [x2, z2] = loop[(i + 1) % loop.length], a = Math.atan2(z2 - z, x2 - x), [px, py] = this.toPx(x, z), s = Math.max(5, Math.min(10, 5 * this.view.s)); c.save(); c.translate(px, py); c.rotate(a); c.beginPath(); c.moveTo(s, 0); c.lineTo(-s, -s * 0.8); c.lineTo(-s, s * 0.8); c.closePath(); c.fill(); c.restore(); }
    // start / finish: a chequered bar across the road at point 0
    { const [x, z] = loop[0], [x2, z2] = loop[1], a = Math.atan2(z2 - z, x2 - x) + Math.PI / 2, [px, py] = this.toPx(x, z), L = Math.max(10, 16 * this.view.s), cw = L / 8; c.save(); c.translate(px, py); c.rotate(a); for (let k = 0; k < 8; k++) for (let r = 0; r < 2; r++) { c.fillStyle = (k + r) % 2 ? '#111' : '#fff'; c.fillRect(-L / 2 + k * cw, -cw + r * cw, cw, cw); } c.restore(); }
    // control points
    this.map.pts.forEach(([x, z], i) => {
      const [px, py] = this.toPx(x, z), sel = i === this.sel;
      c.beginPath(); c.arc(px, py, sel ? 11 : 8, 0, 7); c.fillStyle = i === 0 ? '#ffc531' : sel ? '#ff5a3c' : '#fff'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,.6)'; c.stroke();
      if (i === 0) { c.fillStyle = '#111'; c.font = '700 10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', px, py + 0.5); }
    });
    // scale bar
    const bar = step * 2, bpx = bar * this.view.s; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(12, h - 30, bpx + 16, 20); c.fillStyle = '#fff'; c.fillRect(20, h - 22, bpx, 3); c.font = '600 11px system-ui'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(bar + ' m', 22, h - 25 + 0);
  }
}
