import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sea mines: old spiky naval mines scattered through lakes, rivers and the sea in World Drive.
//  - most are moored: chained to the seabed and floating at a random depth, so you meet them in the submarine
//  - some float on the surface, bobbing, half out of the water, so boats and cars driving on the water can hit them too
//  - they blow up when you shoot them (or a blast reaches them) or touch them, and a blast sets off any mine close by
// Where they are comes from a hash of the map grid, so the same lake always has the same minefield (and every player in a
// session sees the same mines). A mine that went off grows back after a few minutes.

const CELL = 55, RAD = 5, MAX = 90, PROB = 0.14, RESPAWN = 240, CHAIN = 11, TOUCH = 2.1;
const hash = (i, j, k) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

function mineGeometry() {
  const parts = [new THREE.SphereGeometry(0.72, 18, 14)];
  // a belt round the middle and the horns (the contact triggers) all over
  const belt = new THREE.TorusGeometry(0.72, 0.05, 6, 28); belt.rotateX(Math.PI / 2); parts.push(belt);
  const dirs = [[0, 1, 0], [0, -1, 0]];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; dirs.push([Math.cos(a), 0.45, Math.sin(a)], [Math.cos(a + 0.52), -0.45, Math.sin(a + 0.52)]); }
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const v = new THREE.Vector3(...d).normalize(), q = new THREE.Quaternion().setFromUnitVectors(up, v);
    const horn = new THREE.CylinderGeometry(0.05, 0.085, 0.36, 7); horn.translate(0, 0.86, 0); horn.applyQuaternion(q); parts.push(horn);
    const tip = new THREE.SphereGeometry(0.075, 7, 5); tip.translate(0, 1.04, 0); tip.applyQuaternion(q); parts.push(tip);
  }
  // merge needs matching attributes: drop uvs everywhere
  for (const g of parts) g.deleteAttribute('uv');
  return mergeGeometries(parts, false);
}

export class SeaMines {
  constructor(scene) {
    this.scene = scene;
    this.body = new THREE.InstancedMesh(mineGeometry(), new THREE.MeshStandardMaterial({ color: '#3a3b38', metalness: 0.55, roughness: 0.6 }), MAX);
    const cg = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true); cg.translate(0, 0.5, 0);
    this.chain = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: '#4a4036', metalness: 0.4, roughness: 0.8 }), MAX);
    this.lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), MAX);
    for (const m of [this.body, this.chain, this.lamp]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.body.castShadow = true;
    this.list = []; this.gone = new Map(); this.pending = []; this.cx = 1e9; this.cz = 1e9; this.t = 0; this.on = true;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  clear() { this.list = []; this.pending = []; this.gone.clear(); this.cx = this.cz = 1e9; this.body.count = this.chain.count = this.lamp.count = 0; }
  setVisible(v) { this.on = v; this.body.visible = this.chain.visible = this.lamp.visible = v; }
  // (re)build the minefield around (x, z) from the map grid
  populate(world, x, z, now) {
    // keep the mines we already have (so a lock-on or a queued chain blast still points at the same mine)
    const old = new Map(); for (const m of this.list) if (m.live) old.set(m.key, m);
    this.cx = x; this.cz = z; const out = [], ci = Math.round(x / CELL), cj = Math.round(z / CELL);
    if (!world || !world.water) { this.list = out; return; }
    for (let i = ci - RAD; i <= ci + RAD && out.length < MAX; i++) for (let j = cj - RAD; j <= cj + RAD && out.length < MAX; j++) {
      if (hash(i, j, 501) > PROB) continue;
      const key = i + ',' + j, g = this.gone.get(key); if (g && now - g < RESPAWN) continue;
      if (old.has(key)) { out.push(old.get(key)); continue; }
      const px = (i + (hash(i, j, 502) - 0.5) * 0.8) * CELL, pz = (j + (hash(i, j, 503) - 0.5) * 0.8) * CELL;
      let inside = false; try { inside = world.water.inside(px, pz); } catch { } if (!inside) continue;
      const depth = world.waterDepth(px, pz); if (!(depth >= 3)) continue;
      const surf = world.heightAt(px, pz) - 0.25, bed = world.terrainY(px, pz), float = hash(i, j, 504) < 0.3;
      // moored mines sit between ~1.5 m off the bottom and ~1.5 m under the surface
      const lo = bed + 1.5, hi = surf - 1.5, y = float ? surf - 0.2 : lo + (hi - lo) * (0.15 + hash(i, j, 505) * 0.85);
      out.push({ key, x: px, z: pz, y0: y, y, bed, surf, float, live: true, ph: hash(i, j, 506) * 6.28, spin: hash(i, j, 507) * 6.28 });
    }
    this.list = out;
  }
  // things the guns can aim at (the weapons add 0.7 m to y for a car's middle, so take it off)
  targets(px, pz, far = 260) {
    const o = []; for (const m of this.list) if (m.live && Math.abs(m.x - px) < far && Math.abs(m.z - pz) < far) o.push({ id: '', npc: 'mine', ref: m, x: m.x, y: m.y - 0.7, z: m.z, r: 1.4 }); return o;
  }
  // set one off (cause: 'shot', 'hit' or 'chain'); the caller does the bang
  detonate(m, cause, now) {
    if (!m || !m.live) return; m.live = false; this.gone.set(m.key, now);
    try { this.onBoom && this.onBoom(m, cause); } catch (e) { console.warn('[overpass] mine boom', e); }
    // blasts set off mines nearby, one after another
    for (const n of this.list) if (n.live && !n.queued && Math.hypot(n.x - m.x, n.y - m.y, n.z - m.z) < CHAIN) { n.queued = true; this.pending.push({ m: n, t: 0.25 + Math.random() * 0.3 }); }
  }
  // ctx: { world, now, active (world mode), body: {x,y,z} of the player's car middle or null }
  update(dt, ctx) {
    this.t += dt;
    const show = !!ctx.active; if (show !== this.on) this.setVisible(show); if (!show) return;
    const P = ctx.body;
    if (P && (Math.abs(P.x - this.cx) > CELL || Math.abs(P.z - this.cz) > CELL || ctx.refresh)) this.populate(ctx.world, P.x, P.z, ctx.now);
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; q.t -= dt; if (q.t <= 0) { this.pending.splice(i, 1); q.m.queued = false; this.detonate(q.m, 'chain', ctx.now); } }
    let n = 0; const M = this._m, Q = this._q, S = this._s, Pp = this._p, E = this._e, blink = (this.t * 1.3) % 1 < 0.12;
    for (const m of this.list) {
      if (!m.live) continue;
      const t = this.t + m.ph;
      m.y = m.float ? m.surf - 0.2 + Math.sin(t * 1.4) * 0.12 : m.y0 + Math.sin(t * 0.5) * 0.15;
      const sway = m.float ? 0.12 : 0.05; E.set(Math.sin(t * 0.9) * sway, m.spin + t * 0.05, Math.cos(t * 0.7) * sway); Q.setFromEuler(E);
      Pp.set(m.x, m.y, m.z); S.set(1, 1, 1); M.compose(Pp, Q, S); this.body.setMatrixAt(n, M);
      // the chain from the seabed up to the mine (floating ones too: they're on a long slack line)
      const len = Math.max(0.01, m.y - 0.7 - m.bed); Q.identity(); Pp.set(m.x, m.bed, m.z); S.set(1, len, 1); M.compose(Pp, Q, S); this.chain.setMatrixAt(n, M);
      Pp.set(m.x, m.y + 1.12, m.z); S.setScalar(blink ? 1 : 0.001); M.compose(Pp, Q, S); this.lamp.setMatrixAt(n, M);
      n++;
      // touching it sets it off
      if (P && Math.abs(P.x - m.x) < 4 && Math.abs(P.z - m.z) < 4 && Math.hypot(P.x - m.x, P.y - m.y, P.z - m.z) < TOUCH + (m.float ? 0.4 : 0)) this.detonate(m, 'hit', ctx.now);
    }
    this.body.count = this.chain.count = this.lamp.count = n;
    this.body.instanceMatrix.needsUpdate = this.chain.instanceMatrix.needsUpdate = this.lamp.instanceMatrix.needsUpdate = true;
  }
}
