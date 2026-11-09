// GPS: real road routing from OSRM, drawn as a glowing arrow ribbon laid on the streets ahead of you.
import * as THREE from 'three';

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const AHEAD = 650, BEHIND = 12, STEP = 2.5, MAXS = Math.ceil((AHEAD + BEHIND) / STEP) + 4, WIDTH = 2.6;

function arrowTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(40,150,255,0.55)'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(150,215,255,0.95)'; g.fillRect(0, 0, 6, 128); g.fillRect(58, 0, 6, 128);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(14, 84); g.lineTo(32, 50); g.lineTo(50, 84); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function stepText(s) {
  if (!s) return '';
  const onto = s.name ? ' onto ' + s.name : '', m = s.modifier || '';
  if (s.type === 'arrive') return 'Arrive at your destination';
  if (s.type === 'roundabout' || s.type === 'rotary') return `Take exit ${s.exit || 1} at the roundabout${onto}`;
  if (m === 'uturn') return 'Make a U-turn' + onto;
  if (m === 'straight' || s.type === 'new name' || s.type === 'continue' && !/left|right/.test(m)) return 'Continue straight' + onto;
  const side = m.includes('left') ? 'left' : 'right';
  if (s.type === 'fork') return `Keep ${side}${onto}`;
  if (s.type === 'merge') return `Merge ${side}${onto}`;
  if (s.type === 'on ramp') return `Take the ramp on the ${side}${onto}`;
  if (s.type === 'off ramp') return `Take the exit on the ${side}${onto}`;
  if (m.startsWith('slight')) return `Bear ${side}${onto}`;
  if (m.startsWith('sharp')) return `Sharp ${side}${onto}`;
  return `Turn ${side}${onto}`;
}
export function stepArrow(s) {
  if (!s) return '↑'; const m = s.modifier || '';
  if (s.type === 'arrive') return '◎';
  if (s.type === 'roundabout' || s.type === 'rotary') return '↻';
  if (m === 'uturn') return '↶';
  if (m.includes('left')) return m.startsWith('slight') ? '↖' : '↰';
  if (m.includes('right')) return m.startsWith('slight') ? '↗' : '↱';
  return '↑';
}

export class Gps {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.active = false; this.pts = []; this.cum = []; this.steps = []; this.req = 0; this.version = 0;
    this.tex = arrowTex();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, toneMapped: false, fog: false });
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(MAXS * 2 * 3); this.uvA = new Float32Array(MAXS * 2 * 2);
    const idx = []; for (let i = 0; i < MAXS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uvA, 2)); g.setIndex(idx);
    this.ribbon = new THREE.Mesh(g, this.mat); this.ribbon.frustumCulled = false; this.ribbon.renderOrder = 3; this.ribbon.visible = false; scene.add(this.ribbon);
    const bg = new THREE.CylinderGeometry(2.2, 2.2, 160, 20, 1, true); bg.translate(0, 80, 0);
    this.beacon = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: '#3aa8ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    this.beacon.visible = false; scene.add(this.beacon);
    this.buildT = 0; this.along = 0; this.idx = 0; this.offT = 0; this.lastRoute = 0; this.onReroute = null;
  }
  // from/to are [lat, lon]
  async route(from, to, label = 'Map pick', keep = {}) {
    const id = ++this.req; this.active = true; this.loading = true; this.dest = to; this.label = label; Object.assign(this, { meta: keep.meta ?? this.meta });
    this.lastRoute = performance.now();
    let coords = null, steps = [], fallback = false;
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 9000);
      const r = await fetch(`${OSRM}${from[1].toFixed(6)},${from[0].toFixed(6)};${to[1].toFixed(6)},${to[0].toFixed(6)}?overview=full&geometries=geojson&steps=true`, { signal: ac.signal });
      clearTimeout(tm); const j = await r.json();
      if (j.code === 'Ok' && j.routes && j.routes[0]) {
        coords = j.routes[0].geometry.coordinates;
        for (const leg of j.routes[0].legs) for (const s of leg.steps) steps.push({ ll: [s.maneuver.location[1], s.maneuver.location[0]], type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, name: s.name || s.ref || '' });
      }
    } catch (e) { /* offline or blocked: fall back to a straight line */ }
    if (id !== this.req) return false;
    if (!coords || coords.length < 2) { coords = [[from[1], from[0]], [to[1], to[0]]]; fallback = true; steps = [{ ll: to, type: 'arrive' }]; }
    const W = this.world, pts = [];
    // start from the car itself so the line connects to where you are
    pts.push(W.proj(from[0], from[1]));
    for (const [lo, la] of coords) { const p = W.proj(la, lo), q = pts[pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) pts.push(p); }
    if (pts.length < 2) pts.push(W.proj(to[0], to[1]));
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    // place each manoeuvre at its distance along the line
    let k = 0;
    for (const s of steps) {
      const [sx, sz] = W.proj(s.ll[0], s.ll[1]); let best = 1e18, bi = k;
      for (let i = k; i < pts.length; i++) { const d = (pts[i][0] - sx) ** 2 + (pts[i][1] - sz) ** 2; if (d < best) { best = d; bi = i; } if (best < 4 && d > 400) break; }
      s.at = cum[bi]; k = bi;
    }
    Object.assign(this, { pts, cum, steps: steps.filter(s => s.type !== 'depart'), total: cum[cum.length - 1], fallback, idx: 0, along: 0, offT: 0, loading: false, buildT: 0 });
    this.endPt = pts[pts.length - 1]; this.version++;
    this.beacon.position.set(this.endPt[0], W.groundY(this.endPt[0], this.endPt[1]), this.endPt[1]); this.beacon.visible = true;
    return true;
  }
  clear() { this.req++; this.active = false; this.loading = false; this.pts = []; this.cum = []; this.steps = []; this.ribbon.visible = false; this.beacon.visible = false; this.meta = null; this.version++; }
  // point on the line at distance d
  at(d) {
    const { pts, cum } = this; let i = this._seek || 0;
    if (d <= 0) return [pts[0][0], pts[0][1], pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
    while (i > 0 && cum[i] > d) i--; while (i < pts.length - 2 && cum[i + 1] < d) i++; this._seek = i;
    const l = cum[i + 1] - cum[i] || 1, t = Math.min(1, (d - cum[i]) / l), a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1]];
  }
  // returns 'arrive' when you reach the end
  update(dt, x, z, y) {
    this.tex.offset.y -= dt * 1.1;
    if (!this.active || this.loading || this.pts.length < 2) return null;
    const { pts, cum } = this;
    // progress: nearest point on the line near where we were (whole line if we jumped)
    let best = 1e18, bi = this.idx, bt = 0;
    const scan = (i0, i1) => { for (let i = Math.max(0, i0); i < Math.min(pts.length - 1, i1); i++) { const a = pts[i], b = pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1; let t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2; t = Math.max(0, Math.min(1, t)); const d = (x - a[0] - ex * t) ** 2 + (z - a[1] - ez * t) ** 2; if (d < best) { best = d; bi = i; bt = t; } } };
    scan(this.idx - 6, this.idx + 120); if (best > 80 * 80) scan(0, pts.length);
    this.idx = bi; this.along = cum[bi] + (cum[bi + 1] - cum[bi]) * bt; this.off = Math.sqrt(best);
    this.remain = Math.max(0, this.total - this.along);
    const ex = this.endPt[0] - x, ez = this.endPt[1] - z;
    if (Math.hypot(ex, ez) < 25 || (this.remain < 20 && this.off < 30)) return 'arrive';
    // reroute when you wander off the line
    if (this.off > 55 && !this.fallback) this.offT += dt; else this.offT = 0;
    if (this.offT > 2 && performance.now() - this.lastRoute > 8000 && this.onReroute) { this.offT = 0; this.onReroute(); }
    this.next = this.steps.find(s => s.at > this.along + 4) || this.steps[this.steps.length - 1];
    this.nextIn = this.next ? Math.max(0, this.next.at - this.along) : this.remain;
    this.buildT -= dt; if (this.buildT <= 0) { this.buildT = 0.3; this.build(y); }
    return null;
  }
  build(y0) {
    const W = this.world, P = this.posA, U = this.uvA; let n = 0, py = y0, d = Math.max(0, this.along - BEHIND); const end = Math.min(this.total, this.along + AHEAD);
    this._seek = Math.max(0, this.idx - 2);
    while (n < MAXS) {
      const [x, z, dx, dz] = this.at(d), l = Math.hypot(dx, dz) || 1, nx = -dz / l * WIDTH / 2, nz = dx / l * WIDTH / 2;
      let gy = W.groundY(x, z, py); if (!isFinite(gy)) gy = py; py = gy; const yy = gy + 0.16;
      P.set([x + nx, yy, z + nz, x - nx, yy, z - nz], n * 6); U.set([0, d / 5, 1, d / 5], n * 4);
      n++; if (d >= end) break; d = Math.min(d + STEP, end);
    }
    const g = this.ribbon.geometry; g.setDrawRange(0, Math.max(0, n - 1) * 6); g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
    this.ribbon.visible = n > 1;
    const bx = this.beacon.position.x, bz = this.beacon.position.z; this.beacon.position.y = W.groundY(bx, bz, this.beacon.position.y);
  }
}
