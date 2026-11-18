import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { trackCarMat } from './car.js';

// Boost rings: machined chrome hoops with gunmetal clamps, thin light strips and a slowly turning inner ring.
//  - SkyRings  : float in the sky while flying cars is on; fly through for a big temporary boost
//  - WaterRings: stand in lakes and rivers while water driving is on, on pontoons; drive through for a boost
// Every ring of one kind shares four instanced meshes (chrome, gunmetal, light strips, spinner), so 20 rings cost 4 draw calls.
const R = 10;
let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function ringParts(water) {
  const chrome = [], gun = [], light = [], spin = [];
  chrome.push(new THREE.TorusGeometry(R, 0.72, 14, 72));                                     // main hoop
  gun.push(new THREE.TorusGeometry(R - 0.78, 0.2, 8, 72));                                   // inner lip
  gun.push(new THREE.TorusGeometry(R + 0.72, 0.16, 8, 72));                                  // outer lip
  light.push(new THREE.TorusGeometry(R - 1.0, 0.055, 6, 96));                                // thin inner light strip
  for (let k = 0; k < 8; k++) {                                                              // clamps with a light slit each
    const a = k / 8 * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    const cl = new THREE.BoxGeometry(1.5, 2.2, 2.1); cl.rotateZ(a); cl.translate(c * R, s * R, 0); gun.push(cl);
    const sl = new THREE.BoxGeometry(0.16, 1.3, 2.16); sl.rotateZ(a); sl.translate(c * (R + 0.75), s * (R + 0.75), 0); light.push(sl);
    const cap = new THREE.CylinderGeometry(0.32, 0.32, 2.3, 10); cap.rotateX(Math.PI / 2); cap.translate(c * (R - 0.6), s * (R - 0.6), 0); chrome.push(cap);
  }
  for (let k = 0; k < 3; k++) {                                                              // the turning inner segments, with arrow tips
    const arc = new THREE.TorusGeometry(R - 1.55, 0.16, 6, 24, Math.PI * 0.42); arc.rotateZ(k * Math.PI * 2 / 3); spin.push(arc);
    const a = k * Math.PI * 2 / 3 + Math.PI * 0.42, tip = new THREE.ConeGeometry(0.36, 0.9, 4); tip.rotateZ(a); tip.translate(Math.cos(a) * (R - 1.55), Math.sin(a) * (R - 1.55), 0); spin.push(tip);
  }
  if (water) { // pontoons the ring stands on, sitting in the water either side of the bottom
    const wy = -R * 0.62, wx = Math.sqrt(R * R - wy * wy); // where the hoop meets the waterline (the ring's centre sits 0.62 R above the water)
    for (const sd of [-1, 1]) { const pt = new THREE.CapsuleGeometry(0.95, 3.4, 4, 12); pt.rotateX(Math.PI / 2); pt.translate(sd * wx, wy + 0.15, 0); gun.push(pt); const band = new THREE.TorusGeometry(1.0, 0.09, 6, 16); band.translate(sd * wx, wy + 0.15, 0); chrome.push(band); }
  }
  const m = list => { const g = mergeGeometries(list.map(x => x.index ? x : x), false); list.forEach(x => x.dispose()); return g; };
  return { chrome: m(chrome), gun: m(gun), light: m(light), spin: m(spin) };
}

class RingField {
  constructor(scene, opts) {
    this.o = opts; this.t = 0; this.p0 = null; this.combo = 0; this.comboT = 0; this.spawnT = 0;
    seed = (Date.now() % 100000) + (opts.water ? 101 : 7);
    const P = ringParts(opts.water);
    const chromeM = new THREE.MeshStandardMaterial({ color: '#d4dbe2', metalness: 1, roughness: 0.2 }); chromeM.userData.envK = 1.4; trackCarMat(chromeM);
    const gunM = new THREE.MeshStandardMaterial({ color: '#3b4148', metalness: 0.85, roughness: 0.38 }); gunM.userData.envK = 1.1; trackCarMat(gunM);
    const lightM = new THREE.MeshBasicMaterial({ color: opts.accent, toneMapped: false });
    const N = opts.count; this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g);
    const im = (geo, mat, shadow) => { const m = new THREE.InstancedMesh(geo, mat, N); m.count = N; m.frustumCulled = false; m.castShadow = shadow; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.g.add(m); return m; };
    this.mChrome = im(P.chrome, chromeM, true); this.mGun = im(P.gun, gunM, true); this.mSpin = im(P.spin, chromeM, false); this.mLight = im(P.light, lightM, false);
    this.cWhite = new THREE.Color(1, 1, 1); for (let i = 0; i < N; i++) this.mLight.setColorAt(i, this.cWhite);
    this.rings = Array.from({ length: N }, () => ({ x: 0, y: -1e4, z: 0, yaw: 0, n: new THREE.Vector3(), live: false, got: 0, ph: rnd() * 6, spin: rnd() * 6 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  place(r, x, y, z, yaw) { r.x = x; r.y = y; r.z = z; r.yaw = yaw; r.n.set(Math.sin(yaw), 0, Math.cos(yaw)); r.live = true; r.got = 0; }
  hide() { this.g.visible = false; this.p0 = null; }
  update(dt, p, on, onHit) {
    if (!on) { if (this.g.visible) { this.g.visible = false; for (const r of this.rings) r.live = false; } this.p0 = null; return; }
    this.g.visible = true; this.t += dt; this.spawnT -= dt; if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    const px = p.x, py = (p.y || 0) + 0.6, pz = p.z, M = this._m;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.live && this.spawnT <= 0) { this.spawnT = this.o.water ? 0.15 : 0; this.o.spawn(this, r, p); }
      let sc = 1, flash = 1;
      if (r.live && r.got > 0) { // collected: spin up, flash and shrink away
        r.got += dt; const k = r.got / 0.6; sc = Math.max(0.001, 1 - k * k); flash = 1 + 3 * (1 - k); r.spin += dt * 14; if (k >= 1) r.live = false;
      } else if (r.live) {
        const dx = r.x - px, dz = r.z - pz; if (dx * dx + dz * dz > this.o.drop * this.o.drop) r.live = false;
        r.spin += dt * 0.5; flash = 0.75 + 0.25 * Math.sin(this.t * 2.2 + r.ph);
        if (this.p0 && r.got === 0) { // did the path this frame cross the ring's disc?
          const n = r.n, d0 = (this.p0.x - r.x) * n.x + (this.p0.y - r.y) * n.y + (this.p0.z - r.z) * n.z, d1 = (px - r.x) * n.x + (py - r.y) * n.y + (pz - r.z) * n.z;
          if ((d0 > 0) !== (d1 > 0)) {
            const t = d0 / (d0 - d1), hx = this.p0.x + (px - this.p0.x) * t - r.x, hy = this.p0.y + (py - this.p0.y) * t - r.y, hz = this.p0.z + (pz - this.p0.z) * t - r.z;
            if (hx * hx + hy * hy + hz * hz < (R - 1.1) * (R - 1.1)) { r.got = 0.0001; this.combo++; this.comboT = 4; onHit && onHit(this.combo); }
          }
        }
      }
      if (!r.live) sc = 0.0001;
      const bob = this.o.water && r.live ? Math.sin(this.t * 1.3 + r.ph) * 0.12 : 0;
      this._p.set(r.x, r.y + bob, r.z); this._s.setScalar(sc);
      this._e.set(0, r.yaw, 0); this._q.setFromEuler(this._e); M.compose(this._p, this._q, this._s); this.mChrome.setMatrixAt(i, M); this.mGun.setMatrixAt(i, M); this.mLight.setMatrixAt(i, M);
      this._e.set(0, r.yaw, r.spin); this._q.setFromEuler(this._e); M.compose(this._p, this._q, this._s); this.mSpin.setMatrixAt(i, M);
      this.mLight.setColorAt(i, this._c.setScalar(flash));
    }
    for (const m of [this.mChrome, this.mGun, this.mSpin, this.mLight]) m.instanceMatrix.needsUpdate = true;
    if (this.mLight.instanceColor) this.mLight.instanceColor.needsUpdate = true;
    if (!this.p0) this.p0 = new THREE.Vector3(); this.p0.set(px, py, pz);
  }
}

// rings in the sky, ahead-ish of you, some in chains
export class SkyRings extends RingField {
  constructor(scene) {
    super(scene, { count: 16, accent: '#38d6ff', drop: 1900, water: false, spawn: (F, r, p) => {
      const ang = (p.yaw || 0) + (rnd() - 0.5) * 2.6, dist = 260 + rnd() * 1240, x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
      const y = Math.max((p.y || 0) * 0.6, F.heightAt(x, z)) + 40 + rnd() * 170, face = Math.atan2(p.x - x, p.z - z) + (rnd() - 0.5) * 0.9;
      F.place(r, x, y, z, face);
      if (rnd() < 0.35) { const dir = face + Math.PI, steps = 2 + Math.floor(rnd() * 3); let k = 0; for (const r2 of F.rings) { if (k >= steps) break; if (r2.live || r2 === r) continue; k++; F.place(r2, x + Math.sin(dir) * 85 * k, y + (rnd() - 0.5) * 30 * k, z + Math.cos(dir) * 85 * k, face + (rnd() - 0.5) * 0.3); } }
    } });
    this.heightAt = () => 0;
  }
  update(dt, p, on, heightAt, onHit) { this.heightAt = heightAt; super.update(dt, p, on, onHit); }
}

// rings standing in open water (lakes, rivers, sea) near you
export class WaterRings extends RingField {
  constructor(scene, world) {
    super(scene, { count: 8, accent: '#ffb020', drop: 1000, water: true, spawn: (F, r, p) => {
      const w = world, wet = (x, z) => w.water.inside(x, z) && !w.onRoad(x, z, 4);
      for (let tries = 0; tries < 6; tries++) {
        const ang = (p.yaw || 0) + (rnd() - 0.5) * 3.4, dist = 110 + rnd() * 560, x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
        if (!wet(x, z)) continue; let ok = true; for (let a = 0; a < 8 && ok; a++) { const t = a * Math.PI / 4; if (!wet(x + Math.cos(t) * 14, z + Math.sin(t) * 14)) ok = false; } if (!ok) continue;
        if (F.rings.some(o => o.live && Math.hypot(o.x - x, o.z - z) < 60)) continue;
        // face roughly along the water: pick the heading with the longest run of water through the ring
        let best = 0, bs = -1; for (let k = 0; k < 8; k++) { const h = k * Math.PI / 8; let s = 0; for (const d of [15, 30, 50]) { if (wet(x + Math.sin(h) * d, z + Math.cos(h) * d)) s++; if (wet(x - Math.sin(h) * d, z - Math.cos(h) * d)) s++; } if (s > bs) { bs = s; best = h; } }
        F.place(r, x, w.heightAt(x, z) - 0.25 + R * 0.62, z, best); return;
      }
    } });
  }
  update(dt, p, on, onHit) { super.update(dt, p, on, onHit); }
}
