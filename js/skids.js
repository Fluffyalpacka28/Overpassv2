import * as THREE from 'three';

// Tyre effects for the player's car:
//  - tyre marks: dark rubber streaks laid on the ground under the rear wheels while you slide, drift, lock up or spin the
//    wheels; they stay for a while and fade away
//  - tyre smoke: white puffs from the rear wheels while sliding hard
//  - dust: brown clouds kicked up behind the wheels off-road (sand-coloured on beaches and deserts)
//  - spray: a fine grey mist off the tyres on wet roads
// Everything comes from fixed pools, so nothing is allocated while driving.

const MARKS = 1400, PUFFS = 110, MARK_LIFE = 28, MARK_FADE = 10;

let PUFF_TEX = null;
function puffTex() {
  if (PUFF_TEX) return PUFF_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  // a soft, slightly lumpy blob
  for (let i = 0; i < 7; i++) {
    const px = 32 + (Math.random() - 0.5) * 18, py = 32 + (Math.random() - 0.5) * 18, r = 14 + Math.random() * 12;
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  PUFF_TEX = new THREE.CanvasTexture(c); PUFF_TEX.colorSpace = THREE.SRGBColorSpace; return PUFF_TEX;
}

export class TyreFX {
  constructor(scene) {
    this.scene = scene;
    // marks: flat quads, darkened onto the ground with multiply blending (white = invisible, so fading is a fade to white)
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, toneMapped: false });
    this.marks = new THREE.InstancedMesh(g, m, MARKS); this.marks.frustumCulled = false; this.marks.renderOrder = 1;
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const white = new THREE.Color(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MARKS; i++) { this.marks.setMatrixAt(i, zero); this.marks.setColorAt(i, white); }
    this.age = new Float32Array(MARKS).fill(1e9); this.dark = new Float32Array(MARKS); this.mi = 0; this.fadeT = 0;
    scene.add(this.marks);
    // puffs: sprites with their own material each (own opacity / colour)
    this.puffs = []; const tex = puffTex();
    for (let i = 0; i < PUFFS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: true }));
      sp.visible = false; scene.add(sp); this.puffs.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 3, a: 0.5 });
    }
    this.pi = 0; this.prev = [null, null]; this.emitT = 0; this._v = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  clear() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MARKS; i++) { this.marks.setMatrixAt(i, zero); this.age[i] = 1e9; }
    this.marks.instanceMatrix.needsUpdate = true; this.prev = [null, null];
    for (const p of this.puffs) { p.life = 0; p.sp.visible = false; }
  }
  // one streak of rubber from a to b (world positions on the ground), darkness 0..1
  mark(a, b, w, dark) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz); if (len < 0.05 || len > 4) return;
    const i = this.mi; this.mi = (this.mi + 1) % MARKS;
    this._p.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.035, (a.z + b.z) / 2); this._q.setFromAxisAngle(this._up, Math.atan2(dx, dz));
    this._s.set(w, 1, len + 0.01); this._m.compose(this._p, this._q, this._s); this.marks.setMatrixAt(i, this._m);
    this.age[i] = 0; this.dark[i] = dark; const k = 1 - dark * 0.62; this.marks.setColorAt(i, new THREE.Color(k, k * 0.98, k * 0.96));
    this.marks.instanceMatrix.needsUpdate = true; this.marks.instanceColor.needsUpdate = true;
  }
  puff(x, y, z, vx, vy, vz, col, a, s0, s1, life) {
    const p = this.puffs[this.pi]; this.pi = (this.pi + 1) % PUFFS;
    p.sp.position.set(x, y, z); p.sp.material.color.set(col); p.sp.material.rotation = Math.random() * 6.28; p.sp.visible = true;
    Object.assign(p, { life, max: life, vx, vy, vz, s0, s1, a });
  }
  // ctx: { ground(x,z) -> y, slide 0..1, offroad, sand, wet 0..1, onWater, air, low }
  update(dt, car, ctx) {
    // age and fade the marks (a few times a second is plenty)
    this.fadeT -= dt;
    for (let i = 0; i < MARKS; i++) this.age[i] += dt;
    if (this.fadeT <= 0) {
      this.fadeT = 0.4; let any = false; const c = new THREE.Color(), zero = this._m.makeScale(0, 0, 0).clone();
      for (let i = 0; i < MARKS; i++) {
        const a = this.age[i]; if (a < MARK_LIFE || a > MARK_LIFE + MARK_FADE + 1) continue;
        if (a > MARK_LIFE + MARK_FADE) { this.marks.setMatrixAt(i, zero); this.age[i] = 1e9; any = true; continue; }
        const k = 1 - this.dark[i] * 0.62 * (1 - (a - MARK_LIFE) / MARK_FADE); c.setRGB(k, k * 0.98, k * 0.96); this.marks.setColorAt(i, c); any = true;
      }
      if (any) { this.marks.instanceMatrix.needsUpdate = true; this.marks.instanceColor.needsUpdate = true; }
    }
    // puffs drift, grow and fade
    for (const p of this.puffs) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
      const t = 1 - p.life / p.max; p.vx *= 1 - dt * 1.6; p.vz *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.2) + dt * 0.5;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(t); p.sp.scale.set(s, s, 1); p.sp.material.opacity = p.a * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    if (!car || !car.mesh || !car.mesh.userData.wheels) return;
    const W = car.mesh.userData.wheels, sp = Math.abs(car.speed), grounded = !ctx.air && !ctx.onWater;
    const rear = W.filter(w => !w.front); const wheels = rear.length ? rear.slice(0, 2) : W.slice(0, 2);
    // world positions of the rear tyres' contact patches
    const pos = wheels.map(w => { w.pivot.getWorldPosition(this._v); const y = ctx.ground(this._v.x, this._v.z); return { x: this._v.x, y: Number.isFinite(y) ? y : this._v.y - (w.r || 0.4), z: this._v.z }; });
    // marks while sliding, locking up or spinning the wheels away
    const slide = grounded && !ctx.offroad ? ctx.slide : 0;
    for (let k = 0; k < pos.length; k++) {
      const p = pos[k], prev = this.prev[k];
      if (slide > 0.15 && sp > 2.5) {
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) > 0.35) { this.mark(prev, p, 0.24, Math.min(1, 0.35 + slide * 0.7)); this.prev[k] = p; }
        else if (!prev) this.prev[k] = p;
      } else this.prev[k] = null;
    }
    // smoke, dust, spray
    this.emitT -= dt; if (this.emitT > 0 || !grounded) return;
    const busy = ctx.low ? 0.07 : 0.04; this.emitT = busy;
    const bx = -Math.sin(car.yaw) * 1.2, bz = -Math.cos(car.yaw) * 1.2;
    for (const p of pos) {
      const j = () => (Math.random() - 0.5);
      if (slide > 0.35 && sp > 4) this.puff(p.x + j() * 0.3, p.y + 0.35, p.z + j() * 0.3, car.vx * 0.15 + j() * 1.2, 0.6, car.vz * 0.15 + j() * 1.2, '#e8e8ea', 0.5 * Math.min(1, slide), 0.8, 3.6 + slide * 2, 1.6 + Math.random() * 0.8);
      else if (ctx.offroad && sp > 7) this.puff(p.x + bx * 0.3 + j() * 0.4, p.y + 0.3, p.z + bz * 0.3 + j() * 0.4, car.vx * 0.2 + j() * 1.5, 0.9, car.vz * 0.2 + j() * 1.5, ctx.sand ? '#d8c08a' : '#9a8466', Math.min(0.5, (sp - 7) / 20 + 0.15), 0.9, 3 + sp * 0.06, 1.3 + Math.random() * 0.6);
      else if (ctx.wet > 0.3 && sp > 11) this.puff(p.x + bx * 0.5 + j() * 0.3, p.y + 0.25, p.z + bz * 0.5 + j() * 0.3, car.vx * 0.35 + j() * 0.8, 0.5, car.vz * 0.35 + j() * 0.8, '#c8d0d8', Math.min(0.32, (sp - 11) / 30 * ctx.wet), 0.7, 2.6, 0.7 + Math.random() * 0.3);
    }
  }
  dispose() { this.scene.remove(this.marks); this.marks.geometry.dispose(); this.marks.material.dispose(); for (const p of this.puffs) { this.scene.remove(p.sp); p.sp.material.dispose(); } }
}
