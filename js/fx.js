import * as THREE from 'three';

// ---------- nitrous flames out of the exhaust ----------
// Each exhaust gets a few nested flame cones drawn with a small shader (flickering tongues that lick backwards, hot core to cooler edge),
// Mach diamonds in the jet, a glow, and flame puffs left behind in the world so the fire trails the car. Colours come from NITRO_COLORS.
export const NITRO_COLORS = [
  { id: 'blue', name: 'Blue', core: '#eef8ff', mid: '#5fb0ff', outer: '#2a5cff' },
  { id: 'fire', name: 'Fire', core: '#fff4c8', mid: '#ffae2e', outer: '#ff3c0a' },
  { id: 'purple', name: 'Purple', core: '#f7eaff', mid: '#c27dff', outer: '#7426ff' },
  { id: 'green', name: 'Green', core: '#ecffe9', mid: '#66ff74', outer: '#0fbf35' },
  { id: 'pink', name: 'Pink', core: '#ffeaf8', mid: '#ff78d4', outer: '#ff1f8f' },
  { id: 'red', name: 'Red', core: '#ffe6da', mid: '#ff5434', outer: '#cf0808' },
  { id: 'ice', name: 'Ice', core: '#ffffff', mid: '#d5f3ff', outer: '#79cfff' },
  { id: 'toxic', name: 'Toxic', core: '#fdffe2', mid: '#e3ff4f', outer: '#86d600' },
  { id: 'rainbow', name: 'Rainbow', core: '#ffffff', mid: '#ff5ad1', outer: '#5a7dff', rainbow: true },
];
export const nitroColor = id => NITRO_COLORS.find(c => c.id === id) || NITRO_COLORS[0];
let _shared = null;
function shared() {
  if (_shared) return _shared;
  // open cone, base at the pipe (z=0) and tip backwards (z=-h); 'k' = 0 at the base .. 1 at the tip
  const cone = (r, h) => { const g = new THREE.CylinderGeometry(r * 0.08, r, h, 18, 10, true).rotateX(-Math.PI / 2).translate(0, 0, -h / 2), p = g.attributes.position, k = new Float32Array(p.count); for (let i = 0; i < p.count; i++) k[i] = -p.getZ(i) / h; g.setAttribute('k', new THREE.BufferAttribute(k, 1)); return g; };
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.28, 'rgba(255,255,255,0.65)'); g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _shared = { outerG: cone(0.24, 1.75), midG: cone(0.15, 1.35), coreG: cone(0.075, 0.85), shellG: cone(0.17, 1.45), dia: new THREE.SphereGeometry(0.09, 10, 8), glowT: new THREE.CanvasTexture(cv) };
  return _shared;
}
const FLAME_V = `
attribute float k; uniform float uTime, uSeed, uAmp; varying float vK, vA;
void main() {
  vK = k; float a = atan(position.y, position.x); vA = a;
  // tongues: the cone bulges and twists more towards the tip
  float w = 1.0 + uAmp * k * (0.5 * sin(a * 3.0 + k * 9.0 - uTime * 31.0 + uSeed) + 0.3 * sin(a * 5.0 - k * 13.0 - uTime * 23.0 + uSeed * 2.0) + 0.25 * sin(k * 21.0 - uTime * 40.0 + uSeed));
  vec3 p = vec3(position.xy * w, position.z);
  p.xy += vec2(sin(uTime * 17.0 + uSeed + k * 4.0), cos(uTime * 13.0 + uSeed * 1.7 + k * 3.0)) * 0.05 * k * uAmp; // whole flame wavers
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const FLAME_F = `
uniform float uTime, uSeed, uAlpha, uHot, uRag; uniform vec3 uCore, uMid, uOuter; varying float vK, vA;
#include <logdepthbuf_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  #include <logdepthbuf_fragment>
  vec2 q = vec2(vA * 2.1 + uSeed, vK * 4.2 - uTime * 11.0);
  float n = noise(q * 2.0) * 0.55 + noise(q * 4.7 + 7.0) * 0.3 + noise(q * 9.1 + 3.0) * 0.15; // fire texture racing backwards
  float body = pow(1.0 - vK, 1.1) * smoothstep(0.0, 0.12, vK);               // fades to the tip, soft where it leaves the pipe
  float licks = mix(1.0, smoothstep(0.3, 0.72, n + 0.5 - vK * 0.95), uRag);     // ragged tongues that break up towards the end (the inner cone stays smooth)
  float a = body * licks * uAlpha;
  float heat = clamp(1.0 - vK * 1.45 + (n - 0.5) * 0.7 * uRag, 0.0, 1.0) * uHot;
  vec3 c = mix(uOuter, uMid, smoothstep(0.1, 0.55, heat)); c = mix(c, uCore, smoothstep(0.62, 1.0, heat));
  gl_FragColor = vec4(c * (0.85 + 0.75 * heat), a);
  #include <colorspace_fragment>
}`;
function flameMat(hot, alpha, seed, rag = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uAmp: { value: 1 }, uRag: { value: rag }, uAlpha: { value: alpha }, uHot: { value: hot }, uCore: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uOuter: { value: new THREE.Color() } },
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\n' + FLAME_V, fragmentShader: '#include <common>\n' + FLAME_F,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}
// the thruster: a dark housing with a nose cap and fins, a flared metal nozzle, a glowing ring inside it and a mounting plate.
// Local +z is the front; the nozzle opens towards -z.
let THR = null;
function buildThruster() {
  if (!THR) {
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.8, roughness: 0.35 }), metal = new THREE.MeshStandardMaterial({ color: '#b9a27a', metalness: 1, roughness: 0.28, side: THREE.DoubleSide }), steel = new THREE.MeshStandardMaterial({ color: '#8e979f', metalness: 0.9, roughness: 0.3 });
    const body = new THREE.CylinderGeometry(0.33, 0.36, 1.05, 20); body.rotateX(Math.PI / 2);
    const nose = new THREE.SphereGeometry(0.33, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1, 1, 0.8); nose.translate(0, 0, 0.52);
    const bell = new THREE.LatheGeometry([[0.24, 0], [0.27, -0.12], [0.36, -0.36], [0.46, -0.62], [0.49, -0.66], [0.43, -0.64], [0.31, -0.38], [0.2, -0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 24); bell.rotateX(Math.PI / 2); bell.translate(0, 0, -0.5); // opens out backwards, from -0.5 to -1.16
    const band = new THREE.TorusGeometry(0.36, 0.035, 6, 24); band.translate(0, 0, 0.2);
    const band2 = band.clone(); band2.translate(0, 0, -0.55);
    const fins = []; for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) { const f = new THREE.BoxGeometry(0.04, 0.28, 0.5); f.translate(0, 0.46, -0.25); f.rotateZ(a + Math.PI); fins.push(f); }
    const plate = new THREE.BoxGeometry(0.5, 0.12, 0.9); plate.translate(0, -0.38, 0);
    const ring = new THREE.TorusGeometry(0.3, 0.05, 8, 24); ring.translate(0, 0, -0.8);
    THR = { dark, metal, steel, body, nose, bell, band, band2, fins, plate, ring };
  }
  const T = THR, g = new THREE.Group(); g.name = 'booster';
  const ringM = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [geo, mat] of [[T.body, T.dark], [T.nose, T.steel], [T.bell, T.metal], [T.band, T.steel], [T.band2, T.steel], [T.plate, T.dark], ...T.fins.map(f => [f, T.dark]), [T.ring, ringM]]) { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== ringM; m.userData.noDispose = true; g.add(m); }
  g.userData.ringM = ringM; return g;
}
const PUFFS = 48, _v = new THREE.Vector3(), _c = new THREE.Color();
export class NitroFlames {
  constructor() { this.mesh = null; this.group = null; this.flames = []; this.lvl = 0; this.t = 0; this.color = 'blue'; this.preview = 0; this.puffs = []; this.puffGroup = null; this.emit = 0; this.mats = []; this.bcfg = null; this.booster = null; }
  // the second booster: a big thruster on the back of the car with its own huge flame. cfg: { dx, dy, dz, s, tilt } or null
  setBooster(cfg) { const k = cfg ? JSON.stringify(cfg) : ''; if (k === this.bkey) return; this.bkey = k; this.bcfg = cfg ? { ...cfg } : null; this.mesh = null; }
  setColor(id) { this.color = nitroColor(id).id; this.applyColor(0); }
  showOff(sec = 1.6) { this.preview = sec; } // fire the flames for a moment (garage colour picker)
  applyColor(dt) {
    const P = nitroColor(this.color); let core = _c.set(P.core).clone(), mid = new THREE.Color(P.mid), outer = new THREE.Color(P.outer);
    if (P.rainbow) { const h = (this.t * 0.25) % 1; mid.setHSL(h, 1, 0.62); outer.setHSL((h + 0.12) % 1, 1, 0.5); }
    for (const m of this.mats) { m.uniforms.uCore.value.copy(core); m.uniforms.uMid.value.copy(mid); m.uniforms.uOuter.value.copy(outer); }
    if (this.diaM) this.diaM.color.copy(core);
    if (this.glowM) this.glowM.color.copy(mid);
    if (this.ringM) this.ringM.color.copy(mid);
    this.cur = { core, mid, outer };
  }
  attach(car) {
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    if (this.booster && this.booster.parent) this.booster.parent.remove(this.booster); this.booster = null;
    for (const m of this.mats) m.dispose(); this.mats = [];
    const S = shared(), m = car.mesh, ud = m.userData || {}, ws = ud.wheels || [];
    const rz = ws.length ? Math.min(...ws.map(w => w.pivot.position.z)) - 0.95 : -2.2, bike = car.model === 'bike';
    this.group = new THREE.Group(); this.flames = [];
    if (!this.diaM) this.diaM = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    if (!this.glowM) this.glowM = new THREE.SpriteMaterial({ map: S.glowT, color: '#fff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    let seed = 0;
    for (const x of (bike ? [0.14] : [-0.5, 0.5])) {
      const f = new THREE.Group(); f.position.set(x, bike ? 0.5 : 0.45, rz);
      const mo = flameMat(0.55, 0.5, seed += 1.7), mm = flameMat(0.85, 0.62, seed += 2.3), mc = flameMat(1.15, 0.9, seed += 3.1), ms = flameMat(0.95, 0.55, seed += 1.1, 0);
      mo.uniforms.uAmp.value = 0.7; mm.uniforms.uAmp.value = 0.6; mc.uniforms.uAmp.value = 0.35; ms.uniforms.uAmp.value = 0; this.mats.push(mo, mm, mc, ms);
      // a clean cone in the middle of the jet; the ragged flame layers drawn after it half-cover it
      const shell = new THREE.Mesh(S.shellG, ms); shell.renderOrder = 7;
      const outer = new THREE.Mesh(S.outerG, mo), mid = new THREE.Mesh(S.midG, mm), core = new THREE.Mesh(S.coreG, mc);
      const d1 = new THREE.Mesh(S.dia, this.diaM), d2 = new THREE.Mesh(S.dia, this.diaM); d1.position.z = -0.42; d2.position.z = -0.95; d1.scale.set(1, 1, 1.8); d2.scale.set(0.8, 0.8, 1.6);
      const glow = new THREE.Sprite(this.glowM); glow.position.z = -0.12;
      f.add(shell); shell.frustumCulled = false;
      for (const o of [outer, mid, core, d1, d2, glow]) { o.frustumCulled = false; o.renderOrder = 8; f.add(o); }
      this.group.add(f); this.flames.push({ f, outer, mid, core, d1, d2, glow, shell, k: 1 });
    }
    if (this.bcfg) { // the thruster itself (always on the car) and its big flame (in the flame group)
      const B = this.bcfg, sc = B.s || 1, th = buildThruster(), y0 = bike ? 0.95 : 0.98;
      th.position.set(B.dx || 0, y0 + (B.dy || 0), rz + 0.75 + (B.dz || 0)); th.rotation.x = (B.tilt || 0) * Math.PI / 180; th.scale.setScalar(sc);
      m.add(th); this.booster = th; this.ringM = th.userData.ringM;
      const f = new THREE.Group(); f.position.copy(th.position); f.rotation.copy(th.rotation); f.translateZ(-1.1 * sc);
      const mo = flameMat(0.55, 0.5, seed += 1.7), mm = flameMat(0.85, 0.62, seed += 2.3), mc = flameMat(1.15, 0.9, seed += 3.1), ms = flameMat(0.95, 0.55, seed += 1.1, 0);
      mo.uniforms.uAmp.value = 0.8; mm.uniforms.uAmp.value = 0.65; mc.uniforms.uAmp.value = 0.4; ms.uniforms.uAmp.value = 0; this.mats.push(mo, mm, mc, ms);
      const shell = new THREE.Mesh(S.shellG, ms); shell.renderOrder = 7; shell.frustumCulled = false; f.add(shell);
      const outer = new THREE.Mesh(S.outerG, mo), mid = new THREE.Mesh(S.midG, mm), core = new THREE.Mesh(S.coreG, mc);
      const d1 = new THREE.Mesh(S.dia, this.diaM), d2 = new THREE.Mesh(S.dia, this.diaM), d3 = new THREE.Mesh(S.dia, this.diaM); d1.position.z = -0.42; d2.position.z = -0.95; d3.position.z = -1.35; d1.scale.set(1, 1, 1.8); d2.scale.set(0.8, 0.8, 1.6);
      const glow = new THREE.Sprite(this.glowM); glow.position.z = -0.12;
      for (const o of [outer, mid, core, d1, d2, d3, glow]) { o.frustumCulled = false; o.renderOrder = 8; f.add(o); }
      this.group.add(f); this.flames.push({ f, outer, mid, core, d1, d2, glow, shell, k: 2.3 * sc, big: true });
    }
    this.group.visible = false; m.add(this.group); this.mesh = m;
    // flame puffs live in the world (not on the car) so they stream out behind it
    if (this.puffGroup && this.puffGroup.parent) this.puffGroup.parent.remove(this.puffGroup);
    this.puffGroup = new THREE.Group(); this.puffs = [];
    for (let i = 0; i < PUFFS; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glowT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.visible = false; sp.renderOrder = 7; sp.frustumCulled = false; this.puffGroup.add(sp); this.puffs.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s: 1 }); }
    this.applyColor(0);
  }
  update(dt, car, active) {
    if (this.mesh !== car.mesh) this.attach(car);
    if (this.puffGroup && !this.puffGroup.parent && this.mesh.parent) this.mesh.parent.add(this.puffGroup);
    this.t += dt; if (this.preview > 0) this.preview -= dt;
    const want = (active && car.boosting) || this.preview > 0 ? 1 : 0;
    this.lvl += (want - this.lvl) * Math.min(1, dt * (want ? 18 : 9));
    this.applyColor(dt); this.updatePuffs(dt, car, want);
    if (this.ringM) this.ringM.opacity = 0.25 + 0.75 * this.lvl;
    const on = this.lvl > 0.03; this.group.visible = on; if (!on) return;
    const sp = Math.min(1, Math.abs(car.speed) / 45), L = this.lvl, R = Math.random;
    for (const m of this.mats) m.uniforms.uTime.value = this.t;
    for (const o of this.flames) {
      const len = L * (0.8 + 0.35 * sp) * (0.9 + R() * 0.2), w = (0.62 + 0.4 * L) * (0.94 + R() * 0.12);
      o.f.scale.set(w * o.k, w * o.k, len * o.k * (o.big ? 1.25 : 1));
      o.mid.scale.set(1, 1, 0.88 + R() * 0.24); o.core.scale.set(1, 1, 0.82 + R() * 0.3);
      o.shell.scale.set(1, 1, 0.97 + R() * 0.06); // the cone holds its shape, only a tiny shimmer
      o.d1.visible = o.d2.visible = L > 0.5; o.d1.scale.z = 1.5 + R() * 0.7; o.d2.scale.z = 1.3 + R() * 0.6;
      o.glow.scale.setScalar((0.8 + 0.6 * L) * (0.85 + R() * 0.3) / Math.max(0.5, w)); o.glow.scale.z = 1;
    }
  }
  updatePuffs(dt, car, want) {
    const P = this.puffs; if (!P.length) return;
    if (want && this.lvl > 0.4 && this.flames.length) {
      this.emit += dt * 38; const yaw = car.yaw || 0, bx = -Math.sin(yaw), bz = -Math.cos(yaw), v = car.speed || 0;
      while (this.emit >= 1) {
        this.emit -= 1; const p = P.find(q => q.life <= 0); if (!p) break;
        const fl = this.flames[(Math.random() * this.flames.length) | 0]; fl.f.updateWorldMatrix(true, false); _v.set(0, 0, -0.7 - Math.random() * 0.4).applyMatrix4(fl.f.matrixWorld);
        p.sp.position.copy(_v); p.max = p.life = 0.09 + Math.random() * 0.1; p.s = 0.28 + Math.random() * 0.2;
        // keep most of the car's speed so the puff hangs just behind the flame, then drifts back and up
        p.vx = (car.vx || Math.sin(yaw) * v) * 0.9 + bx * (1 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6; p.vz = (car.vz || Math.cos(yaw) * v) * 0.9 + bz * (1 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6; p.vy = 0.3 + Math.random() * 0.6;
        p.sp.visible = true;
      }
    } else this.emit = 0;
    const C = this.cur;
    for (const p of P) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
      const k = 1 - p.life / p.max; // 0 new .. 1 gone
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt; p.vx *= 1 - dt * 3; p.vz *= 1 - dt * 3;
      p.sp.scale.setScalar(p.s * (0.8 + k * 0.8));
      const m = p.sp.material; m.color.copy(C.core).lerp(C.mid, Math.min(1, k * 2.2)); if (k > 0.45) m.color.lerp(C.outer, (k - 0.45) / 0.55); m.opacity = (1 - k) * 0.85;
    }
  }
  hide() { this.lvl = 0; if (this.group) this.group.visible = false; for (const p of this.puffs) { p.life = 0; p.sp.visible = false; } }
}

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
