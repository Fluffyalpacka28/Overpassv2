import * as THREE from 'three';

// Buoys floating in lakes, rivers and the sea near you (World Drive). Drive into one on the water for points: it gets knocked
// over, spins off a little way, then bobs and wobbles back upright. Each buoy pays out again after a short wait.
// world: needs water.inside(x,z), heightAt(x,z).
const KINDS = [
  { id: 'can', body: '#c8262b', top: '#c8262b', light: '#ff3030' },     // red channel can
  { id: 'can', body: '#1f8a3a', top: '#1f8a3a', light: '#30ff60' },     // green channel can
  { id: 'ball', body: '#f6a21a', top: '#ffffff', light: '#ffd040' },    // orange marker ball
  { id: 'spar', body: '#f2d21a', top: '#1a1a1a', light: '#ffe060' },    // yellow special mark
];
const R = 1.15, PAY = 30, AGAIN = 25;
let rs = 4242; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;

function buoyGeometries() {
  const float = new THREE.CylinderGeometry(0.75, 0.9, 0.7, 16); float.translate(0, 0.15, 0);
  const can = new THREE.CylinderGeometry(0.42, 0.55, 1.3, 12); can.translate(0, 1.15, 0);
  const ball = new THREE.SphereGeometry(0.85, 16, 12); ball.translate(0, 0.85, 0);
  const spar = new THREE.ConeGeometry(0.5, 1.6, 12); spar.translate(0, 1.3, 0);
  const band = new THREE.CylinderGeometry(0.47, 0.47, 0.22, 12); band.translate(0, 1.2, 0);
  const cage = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5); cage.translate(0, 2.25, 0);
  const lamp = new THREE.SphereGeometry(0.15, 8, 6); lamp.translate(0, 2.85, 0);
  return { float, can, ball, spar, band, cage, lamp };
}
let G = null;
export class Buoys {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = []; this.t = 0; this.spawnT = 0; this.max = 14; this.night = 0;
    this.combo = 0; this.comboT = 0; this.onHit = null;
    G = G || buoyGeometries();
    this.mats = KINDS.map(k => ({ body: new THREE.MeshStandardMaterial({ color: k.body, roughness: 0.45, metalness: 0.05 }), top: new THREE.MeshStandardMaterial({ color: k.top, roughness: 0.5 }),
      lamp: new THREE.MeshBasicMaterial({ color: k.light, toneMapped: false }) }));
    this.dark = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.4 });
  }
  setQuality(q) { this.max = q === 'low' ? 8 : 14; }
  setNight(k) { this.night = k || 0; }
  clear() { for (const b of this.list) this.scene.remove(b.mesh); this.list = []; }
  // deep enough water all round (so they don't sit on the bank)?
  wet(x, z, r = 7) { const w = this.world.water; if (!w.inside(x, z)) return false; for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2; if (!w.inside(x + Math.cos(t) * r, z + Math.sin(t) * r)) return false; } return true; }
  spawn(px, pz, yaw) {
    for (let tries = 0; tries < 10; tries++) {
      const ang = (yaw || 0) + (rnd() - 0.5) * 3.6, d = 60 + rnd() * 340, x = px + Math.sin(ang) * d, z = pz + Math.cos(ang) * d;
      if (!this.wet(x, z) || this.list.some(b => Math.hypot(b.x - x, b.z - z) < 30)) continue;
      // sometimes a short line of them, like channel markers
      const n = rnd() < 0.35 ? 3 : 1, dir = rnd() * Math.PI * 2, ki = Math.floor(rnd() * KINDS.length);
      for (let k = 0; k < n && this.list.length < this.max; k++) {
        const bx = x + Math.sin(dir) * k * 22, bz = z + Math.cos(dir) * k * 22; if (k && !this.wet(bx, bz)) break;
        this.add(bx, bz, n > 1 ? (k % 2 ? 1 : 0) : ki);
      }
      return;
    }
  }
  add(x, z, ki) {
    const K = KINDS[ki], M = this.mats[ki], g = new THREE.Group();
    const parts = [[G.float, M.body], [K.id === 'ball' ? G.ball : K.id === 'spar' ? G.spar : G.can, M.body], [G.cage, this.dark], [G.lamp, M.lamp]];
    if (K.id !== 'ball') parts.push([G.band, M.top]);
    for (const [geo, mat] of parts) { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== M.lamp; g.add(m); }
    g.userData.lamp = g.children[3];
    this.scene.add(g);
    this.list.push({ mesh: g, x, z, vx: 0, vz: 0, tx: 0, tz: 0, wx: 0, wz: 0, spin: 0, yaw: rnd() * 6.28, dip: 0, dv: 0, ph: rnd() * 6.28, paid: -1e9, ki });
  }
  // px, pz, py: your car; vx, vz: its velocity; canHit: you're actually on the water
  update(dt, P, on, canHit) {
    if (!on) { if (this.list.length) this.clear(); return; }
    this.t += dt; this.spawnT -= dt; if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    for (let i = this.list.length - 1; i >= 0; i--) { const b = this.list[i]; if (Math.hypot(b.x - P.x, b.z - P.z) > 650) { this.scene.remove(b.mesh); this.list.splice(i, 1); } }
    if (this.spawnT <= 0 && this.list.length < this.max) { this.spawnT = 0.8; this.spawn(P.x, P.z, P.yaw); }
    const blink = (this.t % 2) < 0.35;
    for (const b of this.list) {
      const wy = this.world.heightAt(b.x, b.z) - 0.25;
      // knocked by your car?
      const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz), sp = Math.hypot(P.vx || 0, P.vz || 0);
      if (canHit && d < R + 1.6 && d > 0.01 && Math.abs((P.y || 0) - wy) < 2.5 && sp > 2) {
        const nx = dx / d, nz = dz / d, push = R + 1.6 - d;
        b.x += nx * push; b.z += nz * push;
        const k = Math.min(1.6, sp / 12);
        b.vx += nx * sp * 0.3 + (P.vx || 0) * 0.15; b.vz += nz * sp * 0.3 + (P.vz || 0) * 0.15;
        b.wx += -nz * k * 3.2; b.wz += nx * k * 3.2; b.spin += (Math.random() - 0.5) * 8 * k; b.dv -= 2.2 * k; // tip over, spin, get shoved under
        if (this.t - b.paid > AGAIN) { b.paid = this.t; this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 5; this.onHit && this.onHit(b, PAY * Math.min(this.combo, 5), this.combo, wy); }
      }
      // drift with drag, never onto land
      const drag = Math.exp(-dt * 0.9), nx2 = b.x + b.vx * dt, nz2 = b.z + b.vz * dt;
      if (this.world.water.inside(nx2, nz2)) { b.x = nx2; b.z = nz2; } else { b.vx *= -0.3; b.vz *= -0.3; }
      b.vx *= drag; b.vz *= drag;
      // tilt: a damped spring back to upright; the bob: a spring on the waterline plus gentle waves
      b.wx += (-b.tx * 9 - b.wx * 1.6) * dt; b.wz += (-b.tz * 9 - b.wz * 1.6) * dt; b.tx += b.wx * dt; b.tz += b.wz * dt;
      b.tx = Math.max(-1.3, Math.min(1.3, b.tx)); b.tz = Math.max(-1.3, Math.min(1.3, b.tz));
      b.dv += (-b.dip * 14 - b.dv * 2.2) * dt; b.dip += b.dv * dt;
      b.spin *= Math.exp(-dt * 1.2); b.yaw += b.spin * dt;
      const wave = Math.sin(this.t * 1.6 + b.ph) * 0.08, sway = Math.sin(this.t * 1.1 + b.ph) * 0.06;
      b.mesh.position.set(b.x, wy - 0.15 + b.dip + wave, b.z);
      b.mesh.rotation.set(b.tx + sway, b.yaw, b.tz + Math.cos(this.t * 0.9 + b.ph) * 0.05, 'YXZ');
      const lamp = b.mesh.userData.lamp; lamp.visible = this.night > 0.3 ? blink : true; lamp.scale.setScalar(this.night > 0.3 && blink ? 1.6 : 1);
    }
  }
}
