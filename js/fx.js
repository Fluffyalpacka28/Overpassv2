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
    const rz = ws.length ? Math.min(...ws.map(w => w.pivot.position.z)) - 0.95 : -2.2, bike = ud.model === 'bike';
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
