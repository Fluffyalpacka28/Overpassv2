import * as THREE from 'three';
import { setIceHoles } from './water.js';

// The laser cutter: a little turret pops up out of a pod on the roof, spins round and sweeps a laser round the car. The torch
// end of it: a red-hot line under the car that cuts a round hole in frozen-over water, going round once, red-hot, throwing
// sparks and steam; then the disc gives way, the slabs break up and you're in open water (dive in, or float if you've got the
// kit for it). From underneath, it burns a way up through the ice wherever you are. The holes are drawn by the water shader.
export const CUT_R = 4.3;      // hole radius, metres
const PM = {};
function pm() {
  if (!PM.d) {
    PM.d = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.7, roughness: 0.35 });
    PM.c = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.9, roughness: 0.25 });
    PM.r = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 1.2, roughness: 0.3 });
  }
  return PM;
}
const padd = (g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
// the pod on the roof, beside the sub kit's periscope; the turret hides inside it until it's needed
export function setLaserPod(mesh, on) {
  const ud = mesh.userData; if (!!ud.laserPod === !!on) return;
  if (!on) { mesh.remove(ud.laserPod); ud.laserPod = null; return; }
  const M = pm(), body = ud.body || mesh, box = new THREE.Box3(); mesh.updateMatrixWorld(true);
  box.setFromObject(body).applyMatrix4(mesh.matrixWorld.clone().invert());
  const L = Math.max(3, box.max.z - box.min.z), top = Math.max(1.1, box.max.y);
  const g = new THREE.Group(); g.name = 'laserpod'; g.position.set(0.3, top, -L * 0.05 - 0.18);
  padd(g, new THREE.CylinderGeometry(0.13, 0.15, 0.13, 18), M.d, 0, 0.055, 0);
  padd(g, new THREE.TorusGeometry(0.13, 0.014, 6, 24), M.r, 0, 0.115, 0, Math.PI / 2);
  padd(g, new THREE.CylinderGeometry(0.105, 0.105, 0.01, 18), M.c, 0, 0.122, 0);
  const head = new THREE.Group(); head.position.y = -0.2; g.add(head);
  padd(head, new THREE.CylinderGeometry(0.035, 0.035, 0.36, 10), M.c, 0, 0.18, 0);
  const spin = new THREE.Group(); spin.position.y = 0.32; head.add(spin);
  padd(spin, new THREE.TorusGeometry(0.11, 0.018, 8, 22), M.c, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; padd(spin, new THREE.BoxGeometry(0.1, 0.012, 0.03), M.d, Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06, 0, -a, 0); }
  const aim = new THREE.Group(); aim.position.y = 0.4; head.add(aim);
  padd(aim, new THREE.SphereGeometry(0.06, 14, 10), M.d, 0, 0, 0);
  const barrel = new THREE.Group(); aim.add(barrel);
  padd(barrel, new THREE.CylinderGeometry(0.025, 0.035, 0.16, 10), M.c, 0, 0, 0.08, Math.PI / 2);
  const lens = padd(barrel, new THREE.SphereGeometry(0.027, 10, 8), M.r, 0, 0, 0.165);
  g.traverse(o => { o.userData.noDamage = true; o.castShadow = false; });
  mesh.add(g); ud.laserPod = { g, head, spin, aim, barrel, lens, up: 0 };
}
const MAX_HOLES = 8;

function softTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

export class IceCutter {
  constructor(scene, world, opts = {}) {
    this.scene = scene; this.world = world; this.o = opts; this.holes = []; world.iceHoles = this.holes; this.cut = null;
    this.flameTex = softTex('rgba(255,255,255,1)', 'rgba(120,180,255,0.7)'); this.fireTex = softTex('rgba(255,240,200,1)', 'rgba(255,120,30,0.6)'); this.steamTex = softTex('rgba(255,255,255,0.7)', 'rgba(255,255,255,0.25)');
    this.fx = [];
    // sparks: one Points cloud
    this.SN = 400; this.sp = new Float32Array(this.SN * 3); this.sv = new Float32Array(this.SN * 3); this.sl = new Float32Array(this.SN); this.sh = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.SN * 3), 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb050, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sparks.frustumCulled = false; this.sparks.visible = false; scene.add(this.sparks);
    this.slabGeo = new THREE.BoxGeometry(1, 0.3, 1); this.slabMat = new THREE.MeshStandardMaterial({ color: 0xcfe6f0, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.9 });
    this.slabs = [];
    // the beam: a red glow round a white-hot core
    const bg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); bg.translate(0, 0.5, 0); bg.rotateX(Math.PI / 2);
    this.beam = new THREE.Group(); this.beam.visible = false; scene.add(this.beam);
    this.beam.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const core = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff0e8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); core.scale.set(0.3, 0.3, 1); this.beam.add(core);
    this.beam.children.forEach(m => { m.frustumCulled = false; });
    this.dotTex = softTex('rgba(255,255,255,1)', 'rgba(255,40,30,0.8)');
    this.pod = null; this.podT = 0;
  }
  // which car's pod drives the beam
  usePod(mesh) { this.podMesh = mesh; }
  // the pod: pops up, spins, aims the beam at the tip of the cut; drops back down after
  podStep(dt, tip) {
    const P = this.podMesh && this.podMesh.userData.laserPod; if (!P) { this.beam.visible = false; return null; }
    const want = this.cut || this.podT > 0 ? 1 : 0; this.podT = Math.max(0, this.podT - dt);
    P.up += (want - P.up) * Math.min(1, dt * 7); P.head.position.y = -0.2 + P.up * 0.22; P.head.visible = P.up > 0.02;
    P.spin.rotation.y += dt * (4 + 26 * P.up);
    if (!tip || P.up < 0.85) return null;
    // turn the turret and tip the barrel down (or up, from underneath) at the point being cut
    const loc = P.aim.worldToLocal(tip.clone()); P.aim.rotation.y += Math.atan2(loc.x, loc.z);
    const l2 = P.aim.worldToLocal(tip.clone()); P.barrel.rotation.x = -Math.atan2(l2.y, Math.hypot(l2.x, l2.z));
    const from = new THREE.Vector3(0, 0, 0.17); P.barrel.localToWorld(from); return from;
  }
  get busy() { return !!this.cut; }
  sync() { setIceHoles(this.holes); }
  // start cutting at (x, z); y = the ice surface; under = from underneath (breaking out)
  start(x, z, y, under = false) {
    if (this.cut) return null;
    if (this.holes.length >= MAX_HOLES) { const h = this.holes.shift(); this.slabs = this.slabs.filter(s => { if (s.hole === h) { this.scene.remove(s.m); return false; } return true; }); }
    const h = { x, z, r: under ? CUT_R * 0.8 : CUT_R, k: 0, y, under };
    this.holes.push(h); this.cut = { h, t: 0, dur: under ? 1.7 : 2.4 }; this.sync();
    try { this.o.audio && this.o.audio.torch && this.o.audio.torch(this.cut.dur, 1); } catch { }
    return h;
  }
  // put a hole down instantly (re-made after a reload of the area, etc.)
  clear() { this.cut = null; this.holes.length = 0; this.sync(); for (const f of this.fx) { this.scene.remove(f.s); f.s.material.dispose(); } this.fx = []; for (const s of this.slabs) this.scene.remove(s.m); this.slabs = []; this.sl.fill(0); }
  sprite(tex, x, y, z, size, life, vy, add, col = 0xffffff) {
    if (this.fx.length > 160) { const o = this.fx.shift(); this.scene.remove(o.s); o.s.material.dispose(); }
    const m = new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !add });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); this.scene.add(s);
    this.fx.push({ s, life, max: life, size, vy, add });
  }
  spark(x, y, z, vx, vy, vz) { const i = this.sh = (this.sh + 1) % this.SN; this.sp[i * 3] = x; this.sp[i * 3 + 1] = y; this.sp[i * 3 + 2] = z; this.sv[i * 3] = vx; this.sv[i * 3 + 1] = vy; this.sv[i * 3 + 2] = vz; this.sl[i] = 0.5 + Math.random() * 0.6; }
  open(h) {
    h.k = 1; this.sync();
    try { this.o.audio && this.o.audio.iceBreak && this.o.audio.iceBreak(1); } catch { }
    // the disc breaks into slabs
    const n = 9 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * h.r * 0.8, m = new THREE.Mesh(this.slabGeo, this.slabMat);
      m.scale.set(0.7 + Math.random() * 1.3, 0.6 + Math.random() * 0.5, 0.6 + Math.random() * 1.1); m.rotation.y = Math.random() * 6.28;
      m.position.set(h.x + Math.cos(a) * r, h.y + (h.under ? -0.2 : 0), h.z + Math.sin(a) * r); this.scene.add(m);
      const out = h.under ? 3 + Math.random() * 4 : 0.6;
      this.slabs.push({ m, hole: h, vx: Math.cos(a) * out, vy: h.under ? 5 + Math.random() * 5 : -0.6 - Math.random() * 0.6, vz: Math.sin(a) * out, spin: (Math.random() - 0.5) * 4, t: 0, rest: false, ph: Math.random() * 6.28 });
    }
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, r = Math.random() * h.r; this.sprite(this.steamTex, h.x + Math.cos(a) * r, h.y + 0.5, h.z + Math.sin(a) * r, 2 + Math.random() * 2, 2.5 + Math.random() * 1.5, 1 + Math.random(), false, 0xeef4f8); }
    try { this.o.onOpen && this.o.onOpen(h); } catch { }
  }
  update(dt) {
    const C = this.cut;
    let tipW = null;
    if (C) {
      C.pre = (C.pre ?? 0.55) - dt;
      if (C.pre > 0) { this.podStep(dt, null); this.beam.visible = false; return this.updateFx(dt); }
      C.t += dt; const h = C.h, k = Math.min(1, C.t / C.dur);
      h.k = Math.min(0.999, k); this.sync();
      // the torch at the tip of the cut
      const a = h.k * Math.PI * 2, tx = h.x + Math.cos(a) * h.r, tz = h.z + Math.sin(a) * h.r, ty = h.y + (h.under ? -0.15 : 0.08);
      tipW = new THREE.Vector3(tx, h.y + (h.under ? -0.3 : 0), tz);
      this.sprite(this.dotTex, tx, ty + (h.under ? -0.05 : 0.05), tz, 0.7 + Math.random() * 0.3, 0.08, 0, true, 0xff6050);
      for (let i = 0; i < 2; i++) this.sprite(this.flameTex, tx + (Math.random() - 0.5) * 0.2, ty + (h.under ? -0.1 : 0.15), tz + (Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.5, 0.12, h.under ? -1 : 2, true, 0x9fc8ff);
      this.sprite(this.fireTex, tx, ty + (h.under ? -0.2 : 0.3), tz, 0.8 + Math.random() * 0.6, 0.18, h.under ? -1 : 3, true, 0xffa040);
      if (!h.under) for (let i = 0; i < 8; i++) { const sa = Math.random() * 6.283, sv = 2 + Math.random() * 5; this.spark(tx, ty + 0.05, tz, Math.cos(sa) * sv, 2 + Math.random() * 5, Math.sin(sa) * sv); }
      if (Math.random() < dt * 14) { if (h.under) { try { this.o.bubble && this.o.bubble(tx, ty - 0.3, tz); } catch { } } else this.sprite(this.steamTex, tx, ty + 0.4, tz, 1 + Math.random(), 2 + Math.random(), 1.4, false, 0xf2f6f8); }
      if (k >= 1) { this.cut = null; this.podT = 0.6; this.open(h); }
    }
    const from = this.podStep(dt, this.cut ? tipW : null);
    if (from && tipW) { const d = tipW.clone().sub(from), len = d.length(); this.beam.position.copy(from); this.beam.lookAt(tipW); const w = 0.05 + Math.random() * 0.02; this.beam.scale.set(w, w, len); this.beam.visible = true; } else this.beam.visible = false;
    this.updateFx(dt);
  }
  updateFx(dt) {
    // the glow on the fresh edge cools down
    let dirty = false; for (const h of this.holes) if (h.k >= 1 && h.k < 2) { h.k = Math.min(2, h.k + dt * 0.5); dirty = true; } if (dirty) this.sync();
    // sparks
    let any = false; const pa = this.sparks.geometry.attributes.position, o = pa.array;
    for (let i = 0; i < this.SN; i++) {
      if (this.sl[i] <= 0) { o[i * 3 + 1] = -1e5; continue; } any = true; this.sl[i] -= dt;
      this.sv[i * 3 + 1] -= 9.8 * dt; this.sp[i * 3] += this.sv[i * 3] * dt; this.sp[i * 3 + 1] += this.sv[i * 3 + 1] * dt; this.sp[i * 3 + 2] += this.sv[i * 3 + 2] * dt;
      o[i * 3] = this.sp[i * 3]; o[i * 3 + 1] = this.sp[i * 3 + 1]; o[i * 3 + 2] = this.sp[i * 3 + 2];
    }
    this.sparks.visible = any; if (any) pa.needsUpdate = true;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.life -= dt; if (f.life <= 0) { this.scene.remove(f.s); f.s.material.dispose(); this.fx.splice(i, 1); continue; }
      const q = 1 - f.life / f.max; f.s.position.y += f.vy * dt; f.s.scale.setScalar(f.size * (f.add ? 1 - q * 0.5 : 1 + q * 1.5)); f.s.material.opacity = f.add ? 1 - q : 0.6 * (q < 0.15 ? q / 0.15 : 1 - q);
    }
    // slabs: thrown up and landing on the ice, or bobbing in the hole
    const t = performance.now() / 1000;
    for (const s of this.slabs) {
      const m = s.m, h = s.hole; s.t += dt;
      if (!s.rest) {
        s.vy -= 9.8 * dt; m.position.x += s.vx * dt; m.position.y += s.vy * dt; m.position.z += s.vz * dt; m.rotation.x += s.spin * dt; m.rotation.z += s.spin * 0.6 * dt;
        const inHole = Math.hypot(m.position.x - h.x, m.position.z - h.z) < h.r - 0.3, floor = inHole ? h.y - 0.08 : h.y + 0.12;
        if (m.position.y <= floor && s.vy < 0) { m.position.y = floor; s.rest = true; s.inHole = inHole; m.rotation.x *= 0.15; m.rotation.z *= 0.15; }
      } else if (s.inHole) { m.position.y = h.y - 0.08 + Math.sin(t * 1.6 + s.ph) * 0.05; m.rotation.y += Math.sin(t * 0.3 + s.ph) * dt * 0.05; }
    }
  }
}
