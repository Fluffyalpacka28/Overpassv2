import * as THREE from 'three';

// ---------- blue nitrous flames out of the exhaust ----------
let _shared = null;
function shared() {
  if (_shared) return _shared;
  const cone = (r, h) => new THREE.ConeGeometry(r, h, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -h / 2); // base at the pipe, tip pointing backwards
  const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(210,235,255,1)'); g.addColorStop(0.3, 'rgba(70,140,255,0.7)'); g.addColorStop(1, 'rgba(30,80,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _shared = {
    outerG: cone(0.2, 1.9), midG: cone(0.13, 1.4), coreG: cone(0.07, 0.9), dia: new THREE.SphereGeometry(0.09, 8, 6),
    outerM: mat('#2e6bff', 0.55), midM: mat('#5fb0ff', 0.75), coreM: mat('#e4f6ff', 0.95), diaM: mat('#cfeaff', 0.9),
    glowM: new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  };
  return _shared;
}

export class NitroFlames {
  constructor() { this.mesh = null; this.group = null; this.flames = []; this.lvl = 0; }
  attach(car) {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    const S = shared(), m = car.mesh, ud = m.userData || {}, ws = ud.wheels || [];
    const rz = ws.length ? Math.min(...ws.map(w => w.pivot.position.z)) - 0.95 : -2.2, bike = car.model === 'bike';
    this.group = new THREE.Group(); this.flames = [];
    for (const x of (bike ? [0.14] : [-0.5, 0.5])) {
      const f = new THREE.Group(); f.position.set(x, bike ? 0.5 : 0.45, rz);
      const outer = new THREE.Mesh(S.outerG, S.outerM), mid = new THREE.Mesh(S.midG, S.midM), core = new THREE.Mesh(S.coreG, S.coreM);
      const d1 = new THREE.Mesh(S.dia, S.diaM), d2 = new THREE.Mesh(S.dia, S.diaM); d1.position.z = -0.42; d2.position.z = -0.95; d1.scale.set(1, 1, 1.8); d2.scale.set(0.8, 0.8, 1.6);
      const glow = new THREE.Sprite(S.glowM); glow.position.z = -0.1;
      for (const o of [outer, mid, core, d1, d2, glow]) { o.frustumCulled = false; o.renderOrder = 8; f.add(o); }
      this.group.add(f); this.flames.push({ f, outer, mid, core, d1, d2, glow });
    }
    this.group.visible = false; m.add(this.group); this.mesh = m;
  }
  update(dt, car, active) {
    if (this.mesh !== car.mesh) this.attach(car);
    const want = active && car.boosting ? 1 : 0;
    this.lvl += (want - this.lvl) * Math.min(1, dt * (want ? 18 : 9));
    const on = this.lvl > 0.03; this.group.visible = on; if (!on) return;
    const sp = Math.min(1, Math.abs(car.speed) / 45), L = this.lvl, R = Math.random;
    for (const o of this.flames) {
      const len = L * (0.85 + 0.5 * sp) * (0.82 + R() * 0.36), w = (0.6 + 0.4 * L) * (0.9 + R() * 0.2);
      o.f.scale.set(w, w, len);
      o.mid.scale.set(1, 1, 0.85 + R() * 0.3); o.core.scale.set(1, 1, 0.8 + R() * 0.4);
      o.d1.visible = o.d2.visible = L > 0.5; o.d1.scale.z = 1.5 + R() * 0.7; o.d2.scale.z = 1.3 + R() * 0.6;
      o.glow.scale.setScalar((0.7 + 0.5 * L) * (0.9 + R() * 0.2) / Math.max(0.5, w)); // sprite is a child of the scaled group: keep it round
      o.glow.scale.z = 1;
    }
  }
  hide() { this.lvl = 0; if (this.group) this.group.visible = false; }
}

// ---------- speed lines (screen-space streaks over 70) ----------
export class SpeedLines {
  constructor(parent) {
    this.c = document.createElement('canvas'); this.c.id = 'speedFx';
    Object.assign(this.c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    parent.prepend(this.c); this.ctx = this.c.getContext('2d'); this.k = 0; this.drawn = false; this.w = this.h = 0;
    this.lines = Array.from({ length: 64 }, () => this.make(true));
    addEventListener('resize', () => { this.w = 0; });
  }
  make(init) { return { a: Math.random() * Math.PI * 2, r: 0.34 + Math.random() * 0.3, p: init ? Math.random() : 0, len: 0.08 + Math.random() * 0.2, sp: 0.8 + Math.random() * 0.9, wd: 0.8 + Math.random() * 1.6 }; }
  fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } this.w = w; this.h = h; this.dpr = dpr;
  }
  // units: speed as shown on the speedometer. Lines start at 70 and are fully there by 130.
  update(dt, units, boosting) {
    const target = Math.min(1, Math.max(0, (units - 70) / 60)) * (boosting ? 1 : 0.85), ease = Math.min(1, dt * 4);
    this.k += (target - this.k) * ease;
    if (this.k < 0.015) { if (this.drawn) { this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.drawn = false; } return; }
    if (!this.w) this.fit();
    const ctx = this.ctx, w = this.w, h = this.h, k = this.k, cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2;
    ctx.clearRect(0, 0, w, h); ctx.lineCap = 'round'; this.drawn = true;
    const col = boosting ? '150,200,255' : '255,255,255';
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i]; l.p += dt * l.sp * (0.5 + 1.8 * k);
      if (l.p >= 1) { this.lines[i] = this.make(false); continue; }
      const r0 = (l.r + l.p * (1 - l.r)) * R, r1 = r0 + l.len * R * (0.35 + k), a = k * 0.5 * Math.sin(Math.PI * l.p), co = Math.cos(l.a), si = Math.sin(l.a);
      ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`; ctx.lineWidth = l.wd * this.dpr * (0.6 + k);
      ctx.beginPath(); ctx.moveTo(cx + co * r0, cy + si * r0); ctx.lineTo(cx + co * r1, cy + si * r1); ctx.stroke();
    }
  }
  hide() { this.k = 0; if (this.drawn) { this.ctx.clearRect(0, 0, this.c.width, this.c.height); this.drawn = false; } }
}

// ---------- headlights, tail lights ----------
// Real spotlights light up the road ahead; glow sprites make the lamps themselves shine.
const HL_INTENSITY = 26;   // per headlight (two of them; a single wide one on "Fast" graphics gets 1.7x)
let _lamp = null;
function lampShared() {
  if (_lamp) return _lamp;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(cv), mk = c => new THREE.SpriteMaterial({ map, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  _lamp = { head: mk('#fff1c8'), tail: mk('#ff2a2a'), headT: mk('#fff1c8'), tailT: mk('#ff2a2a') }; // *T = shared by all traffic cars
  return _lamp;
}
function lampLayout(car) {
  const ws = (car.mesh.userData && car.mesh.userData.wheels) || [], bike = car.model === 'bike';
  return { zf: ws.length ? Math.max(...ws.map(w => w.pivot.position.z)) + 0.95 : 2.3, zr: ws.length ? Math.min(...ws.map(w => w.pivot.position.z)) - 0.95 : -2.2, xs: bike ? [0] : [-0.6, 0.6], y: bike ? 0.9 : 0.72 };
}
export class Headlights {
  constructor() { this.mesh = null; this.group = null; this.lvl = 0; this.count = 0; this.spots = []; this.brake = 0; }
  attach(car, count) {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    const S = lampShared(), L = lampLayout(car); this.group = new THREE.Group(); this.spots = []; this.count = count;
    const xs = count === 1 ? [0] : L.xs;
    for (const x of xs) {
      const sp = new THREE.SpotLight('#fff3d6', 0, 85, count === 1 ? 0.62 : 0.5, 0.65, 1.3); sp.position.set(x, L.y, L.zf);
      const tg = new THREE.Object3D(); tg.position.set(x * 0.5, L.y - 0.7, L.zf + 20); this.group.add(sp, tg); sp.target = tg; this.spots.push(sp);
    }
    for (const x of L.xs) {
      const gf = new THREE.Sprite(S.head); gf.position.set(x, L.y, L.zf + 0.1); gf.scale.setScalar(1.5); gf.renderOrder = 8; this.group.add(gf);
      const gr = new THREE.Sprite(S.tail); gr.position.set(x, L.y + 0.04, L.zr - 0.1); gr.scale.setScalar(1.0); gr.renderOrder = 8; this.group.add(gr);
    }
    car.mesh.add(this.group); this.mesh = car.mesh;
  }
  // on: 0..1 how much the lights should be on; low: one wide beam instead of two (cheaper)
  update(dt, car, on, low) {
    const want = low ? 1 : 2; if (this.mesh !== car.mesh || this.count !== want) this.attach(car, want);
    this.lvl += (on - this.lvl) * Math.min(1, dt * 5);
    const S = lampShared(), per = HL_INTENSITY * (this.count === 1 ? 1.7 : 1) * this.lvl;
    for (const sp of this.spots) sp.intensity = per;
    this.brake += ((car.input && car.input.brake > 0.2 ? 1 : 0) - this.brake) * Math.min(1, dt * 12);
    S.head.opacity = this.lvl * 0.95; S.tail.opacity = this.lvl * (0.4 + 0.6 * this.brake) + this.brake * 0.35 * Math.min(1, 0.25 + this.lvl);
  }
}
// glow-only lamps for traffic cars (no real light, so it stays cheap); call setTrafficLamps(level) once a frame
export function addLampGlows(car) {
  const S = lampShared(), L = lampLayout(car), g = new THREE.Group();
  for (const x of L.xs) {
    const gf = new THREE.Sprite(S.headT); gf.position.set(x, L.y, L.zf + 0.1); gf.scale.setScalar(1.4); gf.renderOrder = 8; g.add(gf);
    const gr = new THREE.Sprite(S.tailT); gr.position.set(x, L.y + 0.04, L.zr - 0.1); gr.scale.setScalar(0.9); gr.renderOrder = 8; g.add(gr);
  }
  g.visible = false; car.mesh.add(g); return g;
}
export function setTrafficLamps(level) { const S = lampShared(); S.headT.opacity = level * 0.9; S.tailT.opacity = level * 0.7; }
