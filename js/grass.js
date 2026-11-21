import * as THREE from 'three';
import { SEASON } from './season.js';

// Clumps of 3D grass in patches around the player. One instanced mesh (three crossed cards per tuft) that is refilled as you move;
// where tufts go is worked out once per 2.5 m cell and cached, a few hundred new cells per frame at most, so it stays cheap.
const CS = 2.5;
function hash2(i, j, k = 0) { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, z) { // smooth value noise
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, 7), b = hash2(i + 1, j, 7), c = hash2(i, j + 1, 7), d = hash2(i + 1, j + 1, 7);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
function bladeTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const bx = 8 + r() * (S - 16), h = S * (0.45 + r() * 0.55), lean = (r() - 0.5) * 34, w = 2 + r() * 3.2;
    const g = x.createLinearGradient(0, S, 0, S - h); g.addColorStop(0, '#2c4a1c'); g.addColorStop(0.55, r() < 0.3 ? '#8aa848' : '#5f8a35'); g.addColorStop(1, r() < 0.35 ? '#d4d48a' : '#a7c46a');
    x.fillStyle = g; x.beginPath(); x.moveTo(bx - w, S); x.quadraticCurveTo(bx + lean * 0.4, S - h * 0.5, bx + lean, S - h); x.quadraticCurveTo(bx + lean * 0.4 + w * 0.5, S - h * 0.5, bx + w, S); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; return t;
}
function tuftGeometry() {
  const pos = [], uv = [], sway = [], nrm = [], idx = [], W = 0.75, H = 0.62;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a) * W, cz = Math.sin(a) * W, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, H, cz, -cx, H, -cz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); sway.push(0, 0, 1, 1);
    for (let q = 0; q < 4; q++) nrm.push(0, 1, 0); // lit like the ground under it, from both sides
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1)); g.setIndex(idx); return g;
}
export class GrassField {
  constructor(scene, world) {
    this.world = world; this.cells = new Map(); this.cx = 1e9; this.cz = 1e9; this.dirty = true; this.t = 0; this.since = 0; this.c = new THREE.Color();
    this.uTime = { value: 0 }; this.setQuality('high');
    const m = new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.42, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float sway; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 ip = instanceMatrix[3]; float w = sin(uTime * 1.9 + ip.x * 0.31 + ip.z * 0.23) + 0.5 * sin(uTime * 3.7 + ip.x * 0.7); transformed.x += w * 0.09 * sway; transformed.z += cos(uTime * 1.4 + ip.z * 0.27) * 0.06 * sway; }`);
    };
    m.customProgramCacheKey = () => 'overpass-grass-v1';
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), m, 3600); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.setColorAt(0, this.c.setRGB(1, 1, 1));
    scene.add(this.mesh);
  }
  setQuality(q) { this.R = q === 'low' ? 48 : 80; this.max = q === 'low' ? 1500 : 3600; this.dirty = true; }
  clear() { this.cells.clear(); this.mesh.count = 0; this.dirty = true; }
  cell(ci, cj) {
    const k = ci + ',' + cj; let e = this.cells.get(k); if (e !== undefined) return e;
    e = 0; const w = this.world, x = (ci + hash2(ci, cj, 1)) * CS, z = (cj + hash2(ci, cj, 2)) * CS;
    const patch = vnoise(x / 32, z / 32) * 0.75 + vnoise(x / 9, z / 9) * 0.25, p = Math.max(0, Math.min(1, (patch - 0.48) / 0.22)) * 0.85 + 0.035;
    if (hash2(ci, cj, 3) < p && !w.water.inside(x, z) && !w.onRoad(x, z, 1.8) && !w.collide(x, z, 0.6)) {
      w.colorAt(x, z, this.c); const c = this.c;
      const y = w.heightAt(x, z), sl = Math.abs(w.heightAt(x + 1.5, z) - y) + Math.abs(w.heightAt(x, z + 1.5) - y);
      if (c.g > c.r * 1.03 && c.g > c.b * 1.12 && sl < 1.2) e = { x, y: y - 0.05, z, s: 0.7 + hash2(ci, cj, 4) * 0.8, ry: hash2(ci, cj, 5) * 6.28, t: 0.82 + hash2(ci, cj, 6) * 0.3, h: hash2(ci, cj, 8) };
    }
    this.cells.set(k, e); this.fresh++; return e;
  }
  update(dt, px, pz, on) {
    this.uTime.value = (this.uTime.value + dt) % 1000;
    if (!on) { this.mesh.visible = false; return; }
    this.mesh.visible = true; this.since += dt;
    if (this.cells.size > 80000) this.cells.clear();
    // seasons: tufts go straw-coloured while the grass is dormant, and disappear under snow
    const sn = SEASON.uSnow.value, dor = Math.min(0.8, SEASON.uDormant.value * 0.75 + SEASON.uAutumn.value * 0.15), sk = Math.round(sn * 25) + ',' + Math.round(dor * 25);
    if (sk !== this.seasonKey) { this.seasonKey = sk; this.dirty = true; }
    const moved = Math.hypot(px - this.cx, pz - this.cz) > 3;
    if (!(moved || this.dirty) || this.since < 0.12) return;
    this.since = 0; this.dirty = false; this.fresh = 0;
    const R = this.R, cr = Math.ceil(R / CS), ci0 = Math.floor(px / CS), cj0 = Math.floor(pz / CS), M = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = this.c;
    let n = 0, budget = 500;
    // nearest rings first, so a cut-short refill still covers the ground right around the car
    for (let r = 0; r <= cr && n < this.max; r++) for (let di = -r; di <= r && n < this.max; di++) for (let dj = -r; dj <= r && n < this.max; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ci = ci0 + di, cj = cj0 + dj, k = ci + ',' + cj;
      let e = this.cells.get(k);
      if (e === undefined) { if (budget-- <= 0) { this.dirty = true; continue; } e = this.cell(ci, cj); }
      if (!e) continue;
      if (sn > 0.04 && e.h < sn * 1.25) continue;
      const d = Math.hypot(e.x - px, e.z - pz); if (d > R) continue;
      const fade = Math.min(1, (R - d) / (R * 0.25)); // shrink away at the edge instead of popping
      P.set(e.x, e.y, e.z); q.setFromAxisAngle(Y, e.ry); S.setScalar(e.s * fade); M.compose(P, q, S); this.mesh.setMatrixAt(n, M);
      col.setRGB(e.t * (1 + 0.55 * dor), e.t * (1 + 0.12 * dor), e.t * 0.95 * (1 - 0.35 * dor)); this.mesh.setColorAt(n, col); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (!this.dirty) { this.cx = px; this.cz = pz; }
  }
}
