import * as THREE from 'three';
import { modelTemplate } from './custom.js';

// A 3D model as a whole driveable world (Maps > Import a .glb / .gltf / .obj / .stl).
// The model is set on a big ground plane; you drive on any surface that isn't too steep (roads, ramps, roofs, bridges, floors
// of a multi-storey car park…), and steep surfaces are walls. All of it works from a grid of the model's triangles, so it
// stays quick even for big city models. It runs inside World Drive (weapons, flight, the dog, multiplayer…), just with your
// model instead of OpenStreetMap.

export const MAP_EXTS = ['glb', 'gltf', 'obj', 'stl'], MAX_MAP_BYTES = 12 * 1024 * 1024;
const CELL = 4, BIG = 256, MAX_TRIS = 1500000, WALL_NY = 0.55, STEP = 0.9;

export class ModelWorld {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); this.group.name = 'model-world'; this.cells = new Map(); this.big = []; this.floorY = 0; this.ready = false; }
  // entry: the map ({ h, ext, mult: size multiplier, rot: quarter turns, zup: stand a Z-up model upright }) and data: the file as base64
  async load(entry, data, onStatus) {
    onStatus && onStatus('Reading your model…');
    const tpl = await modelTemplate({ h: entry.h, ext: entry.ext, data });
    const root = tpl.clone(true), turn = new THREE.Group(), fit = new THREE.Group();
    if (entry.zup) root.rotation.x = -Math.PI / 2;
    turn.rotation.y = (entry.rot | 0) * Math.PI / 2; turn.add(root); fit.add(turn); fit.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fit), size = box.getSize(new THREE.Vector3()), md = Math.max(size.x, size.y, size.z);
    if (!(md > 0) || !isFinite(md)) throw new Error('the model is empty');
    // most map models are in metres; tiny ones (a prop, or a model in kilometres) are blown up to a ~400 m playground
    const auto = md < 20 ? 400 / md : md > 6000 ? 4000 / md : 1, s = auto * (+entry.mult || 1);
    fit.scale.setScalar(s); const c = box.getCenter(new THREE.Vector3());
    fit.position.set(-c.x * s, -box.min.y * s, -c.z * s); fit.updateMatrixWorld(true);
    this.group.add(fit); this.scene.add(this.group);
    fit.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.size = size.clone().multiplyScalar(s); this.scale = s;
    // a ground plane all round so you can't fall off the world
    const ext = Math.max(1500, Math.max(this.size.x, this.size.z) * 3);
    const g = new THREE.PlaneGeometry(ext, ext); g.rotateX(-Math.PI / 2);
    const tex = gridTexture(); tex.repeat.set(ext / 16, ext / 16); tex.needsUpdate = true;
    this.floor = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7d8a72', map: tex, roughness: 0.95 })); this.floor.position.y = -0.03; this.floor.receiveShadow = true; this.group.add(this.floor);
    this.floorY = 0; this.half = ext / 2;
    onStatus && onStatus('Working out where you can drive…');
    await this.index(fit);
    this.spawn = this.findSpawn();
    this.ready = true; return this;
  }
  // every triangle, in world space, filed by which 4 m grid cells it covers
  async index(obj) {
    const meshes = []; obj.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position && o.visible) meshes.push(o); });
    let total = 0; for (const m of meshes) { const g = m.geometry; total += (g.index ? g.index.count : g.attributes.position.count) / 3; }
    total = Math.min(MAX_TRIS, Math.floor(total)); this.truncated = total >= MAX_TRIS;
    const T = this.tris = new Float32Array(total * 9), NY = this.ny = new Float32Array(total); let n = 0, t0 = performance.now();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const m of meshes) {
      const g = m.geometry, P = g.attributes.position, I = g.index, cnt = I ? I.count : P.count, M = m.matrixWorld;
      for (let i = 0; i + 2 < cnt && n < total; i += 3) {
        a.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(i + 1) : i + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(i + 2) : i + 2).applyMatrix4(M);
        e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2); const L = e1.length(); if (!(L > 1e-8)) continue;
        const o = n * 9; T[o] = a.x; T[o + 1] = a.y; T[o + 2] = a.z; T[o + 3] = b.x; T[o + 4] = b.y; T[o + 5] = b.z; T[o + 6] = c.x; T[o + 7] = c.y; T[o + 8] = c.z; NY[n] = e1.y / L;
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL), z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > BIG) this.big.push(n);
        else for (let i2 = x0; i2 <= x1; i2++) for (let j2 = z0; j2 <= z1; j2++) { const k = i2 * 73856093 ^ j2 * 19349663; let l = this.cells.get(k); if (!l) this.cells.set(k, l = []); l.push(n); }
        n++;
        if ((n & 16383) === 0 && performance.now() - t0 > 30) { await new Promise(r => setTimeout(r, 0)); t0 = performance.now(); }
      }
    }
    this.n = n;
  }
  _cand(x, z, r = 0) {
    if (!r) { const l = this.cells.get(Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663); return this.big.length ? (l ? l.concat(this.big) : this.big) : (l || []); }
    const out = new Set(this.big);
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) { const l = this.cells.get(i * 73856093 ^ j * 19349663); if (l) for (const t of l) out.add(t); }
    return out;
  }
  // surface heights under (x, z): the highest one you can reach from curY (up a kerb or a step), or the highest of all
  groundY(x, z, curY = null) {
    const T = this.tris; let best = -Infinity, top = -Infinity;
    for (const t of this._cand(x, z)) {
      if (Math.abs(this.ny[t]) < 0.2) continue;
      const o = t * 9, x0 = T[o], z0 = T[o + 2], x1 = T[o + 3], z1 = T[o + 5], x2 = T[o + 6], z2 = T[o + 8];
      const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(d) < 1e-9) continue;
      const u = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, v = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const y = u * T[o + 1] + v * T[o + 4] + w * T[o + 7];
      if (y > top) top = y; if ((curY == null || y <= curY + STEP) && y > best) best = y;
    }
    if (curY == null) return Math.max(this.floorY, top);
    return Math.max(this.floorY, best);
  }
  heightAt(x, z) { return this.groundY(x, z, null); }
  // walls: steep triangles in the car's height band, pushing the car (radius rad) back out
  collide(x, z, rad = 1.3, y = null) {
    if (y == null) y = this.groundY(x, z, null);
    const T = this.tris; let res = null;
    for (const t of this._cand(x, z, rad + 0.5)) {
      if (Math.abs(this.ny[t]) > WALL_NY) continue;
      const o = t * 9;
      // (anything lower than a step is driven over, not into: the ends of ramps, kerbs, the edges of floors)
      for (const py of [y + 1.0, y + 1.45]) {
        closest(T, o, x, py, z, _cp); const dx = x - _cp.x, dz = z - _cp.z, dy = py - _cp.y; if (Math.abs(dy) > 0.4 || _cp.y < y + STEP - 0.05) continue;
        const dist = Math.hypot(dx, dz); if (dist >= rad) continue;
        const depth = rad - dist; if (res && depth <= res.depth) continue;
        let nx, nz; if (dist > 1e-4) { nx = dx / dist; nz = dz / dist; } else { const ax = T[o + 3] - T[o], az = T[o + 5] - T[o + 2], bx = T[o + 6] - T[o], bz = T[o + 8] - T[o + 2]; const l = Math.hypot(az, ax) || 1; nx = -az / l; nz = ax / l; void bx; void bz; }
        res = { nx, nz, depth };
      }
    }
    return res;
  }
  // somewhere sensible to start: the flat, open spot nearest the middle (on the model if there's any flat ground on it)
  findSpawn() {
    const R = Math.max(this.size.x, this.size.z) / 2;
    let best = null;
    for (let r = 0; r <= R + 40 && !best; r += Math.max(4, R / 30)) for (let k = 0; k < (r ? 16 : 1) && !best; k++) {
      const a = k / 16 * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, y = this.groundY(x, z, null);
      // flat here and a car length either way, and no wall in the way
      let ok = true; for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) if (Math.abs(this.groundY(x + dx, z + dz, y + 0.3) - y) > 0.4) ok = false;
      if (ok && !this.collide(x, z, 2, y)) best = { x, z, y, yaw: a + Math.PI };
    }
    return best || { x: 0, z: -(this.size.z / 2 + 20), y: 0, yaw: 0 };
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh) { o.geometry && o.geometry.dispose(); } });
    this.cells.clear(); this.big = []; this.tris = null; this.ready = false;
  }
}
const _cp = new THREE.Vector3();
// closest point on triangle (T[o..o+8]) to p (Ericson, Real-Time Collision Detection)
function closest(T, o, px, py, pz, out) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz; if (d1 <= 0 && d2 <= 0) return out.set(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz; if (d3 >= 0 && d4 <= d3) return out.set(bx, by, bz);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return out.set(ax + abx * v, ay + aby * v, az + abz * v); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz; if (d6 >= 0 && d5 <= d6) return out.set(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return out.set(ax + acx * w, ay + acy * w, az + acz * w); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return out.set(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return out.set(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}
let GRID = null;
function gridTexture() {
  if (GRID) return GRID.clone();
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#c9cfc0'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${90 + Math.random() * 40},${100 + Math.random() * 40},${80 + Math.random() * 30},0.12)`; x.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4); }
  x.strokeStyle = 'rgba(60,70,55,0.35)'; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128);
  GRID = new THREE.CanvasTexture(c); GRID.colorSpace = THREE.SRGBColorSpace; GRID.wrapS = GRID.wrapT = THREE.RepeatWrapping; GRID.anisotropy = 8;
  return GRID.clone();
}
