import * as THREE from 'three';
import { WaterWake } from './spray.js';

// NPC boats cruising around lakes, rivers and the sea near the player. They wander inside the water (feeling ahead for the banks and
// turning away), bob on the surface, lean into turns, leave a wake, show navigation lights at night, and can be bumped by your car.
// world: needs water.inside(x,z), heightAt(x,z), onRoad(x,z,pad).
const TYPES = [
  { id: 'runabout', len: 6.2, beam: 2.3, speed: [7, 13], w: 4 },
  { id: 'sail', len: 8.5, beam: 2.8, speed: [3, 5.5], w: 2 },
  { id: 'cabin', len: 9.5, beam: 3.2, speed: [5, 8], w: 2 },
  { id: 'speed', len: 7.5, beam: 2.4, speed: [14, 21], w: 2 },
  { id: 'tug', len: 11, beam: 4, speed: [3, 5], w: 1 },
];
const HULLS = ['#f4f4f2', '#ffffff', '#1f3a5f', '#b3261e', '#e8e2d0', '#0f5d5a', '#f2b632', '#222428'];
const ACCENT = ['#1f6fb2', '#c43b2f', '#0e8a6a', '#333333', '#d98e04', '#6b3fa0'];
let rs = 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
const pick = a => a[(rnd() * a.length) | 0];

// Hull as plain triangles: V-shaped cross-sections from a flat transom to a raked, rising bow, with a sheer line and a deck.
// Faces are oriented outwards (from the hull's centre line), so it renders correctly with back-face culling. Local +z = bow.
export function hullTris(L, B, H) {
  const N = 14, sec = [], tris = [];
  for (let s = 0; s <= N; s++) {
    const t = s / N, z = -L / 2 + t * L, b = (B / 2) * (t < 0.38 ? 1 : Math.pow(Math.cos((t - 0.38) / 0.62 * Math.PI / 2), 0.85));
    const kh = t > 0.45 ? H * 0.85 * Math.pow((t - 0.45) / 0.55, 1.8) : 0, gy = H + (t > 0.65 ? 0.28 * Math.pow((t - 0.65) / 0.35, 2) : 0) - (t < 0.1 ? 0.05 : 0);
    sec.push({ z, b, gy, cy: (kh + gy) / 2, pts: [[-b, gy], [-b * 0.86, H * 0.42 + kh * 0.6], [0, kh], [b * 0.86, H * 0.42 + kh * 0.6], [b, gy]] });
  }
  const P = (sx, k) => { const S = sec[sx], q = S.pts[k]; return [q[0], q[1], S.z]; };
  const add = (pts, out) => { // fan, flipped if its normal doesn't point along 'out'
    const [a, b, c] = pts, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const P2 = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? pts.slice().reverse() : pts;
    for (let i = 1; i + 1 < P2.length; i++) tris.push(...P2[0], ...P2[i], ...P2[i + 1]);
  };
  for (let s = 0; s < N; s++) for (let k = 0; k < 4; k++) {
    const q = [P(s, k), P(s, k + 1), P(s + 1, k + 1), P(s + 1, k)], cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    if (Math.abs(q[2][0] - q[3][0]) < 1e-6 && Math.abs(q[2][1] - q[3][1]) < 1e-6) q.splice(3, 1); // the bow closes to a point
    add(q, [cx, cy - (sec[s].cy + sec[s + 1].cy) / 2, s === N - 1 ? 0.6 : 0]); // outward from this section's own middle
  }
  add([P(0, 0), P(0, 1), P(0, 2), P(0, 3), P(0, 4)], [0, 0, -1]); // transom
  for (let s = 0; s < N; s++) { const q = [P(s, 0), P(s, 4), P(s + 1, 4), P(s + 1, 0)]; if (sec[s + 1].b < 1e-6) q.splice(2, 1); add(q, [0, 1, 0]); } // deck
  return tris;
}
function hullGeo(L, B, H) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(hullTris(L, B, H), 3)); g.computeVertexNormals(); return g;
}
function buildBoat(t) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const hullC = pick(HULLS), acc = pick(ACCENT), L = t.len, B = t.beam, H = t.id === 'tug' ? 1.6 : 1.1;
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });
  const hull = new THREE.Mesh(hullGeo(L, B, H), M(hullC)); hull.position.y = -0.45; hull.castShadow = true; body.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(B * 0.86, 0.06, L * 0.62), M(t.id === 'tug' ? '#5a5a5a' : '#c8a878')); deck.position.set(0, H - 0.43, -L * 0.1); body.add(deck);
  const glass = new THREE.MeshStandardMaterial({ color: '#203040', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.75 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  const top = H - 0.43;
  if (t.id === 'runabout' || t.id === 'speed') {
    const ws = box(B * 0.8, 0.45, 0.06, glass, 0, top + 0.25, L * 0.08); ws.rotation.x = -0.5;
    box(0.5, 0.5, 0.5, M('#2a2a2a'), 0, top + 0.25, -L * 0.48); // outboard motor
    box(0.6, 0.35, 0.6, M('#e6e6e6'), -B * 0.2, top + 0.18, -L * 0.12); box(0.6, 0.35, 0.6, M('#e6e6e6'), B * 0.2, top + 0.18, -L * 0.12); // seats
  } else if (t.id === 'cabin') {
    box(B * 0.72, 1.1, L * 0.36, M('#f0f0ee'), 0, top + 0.55, 0); box(B * 0.74, 0.35, L * 0.3, glass, 0, top + 0.75, L * 0.02);
    box(B * 0.6, 0.06, L * 0.3, M(acc), 0, top + 1.14, -L * 0.02);
  } else if (t.id === 'tug') {
    box(B * 0.62, 1.6, L * 0.3, M('#e9e4d6'), 0, top + 0.8, L * 0.05); box(B * 0.64, 0.45, L * 0.32, glass, 0, top + 1.25, L * 0.05);
    box(0.5, 1.2, 0.5, M(acc), 0, top + 2.0, -L * 0.08); // funnel
    for (const sx of [-1, 1]) box(0.25, 0.25, L * 0.8, M('#2b2b2b'), sx * B * 0.5, top - 0.25, 0); // fenders
  } else if (t.id === 'sail') {
    const mast = box(0.12, 9, 0.12, M('#d8d8d8'), 0, top + 4.5, L * 0.1);
    const boom = box(0.1, 0.1, L * 0.45, M('#d8d8d8'), 0, top + 1.3, -L * 0.12);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 7.6); sh.lineTo(L * 0.44, 0); sh.closePath(); // after the 90-degree turn +x points aft along the boom
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.8, side: THREE.DoubleSide }));
    sail.rotation.y = Math.PI / 2; sail.position.set(0, top + 1.35, L * 0.1); body.add(sail);
    const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(0, 6.4); jib.lineTo(-L * 0.36, 0); jib.closePath(); // forward of the mast
    const j = new THREE.Mesh(new THREE.ShapeGeometry(jib), sail.material); j.rotation.y = Math.PI / 2; j.position.set(0, top + 0.6, L * 0.12); body.add(j);
    g.userData.sail = [sail, j, boom]; void mast;
  }
  // navigation lights: red port, green starboard, white stern / masthead (only lit at night)
  const lamp = c => new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  const red = lamp('#ff2a2a'), green = lamp('#2aff6a'), white = lamp('#fff6d8');
  red.position.set(-B * 0.46, top + 0.1, L * 0.22); green.position.set(B * 0.46, top + 0.1, L * 0.22); white.position.set(0, t.id === 'sail' ? top + 9 : top + (t.id === 'tug' ? 2.7 : 1.3), -L * 0.3);
  body.add(red, green, white); g.userData.navs = [red, green, white];
  return g;
}

export class Boats {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = []; this.t = 0; this.spawnT = 0; this.max = 6; this.night = 0;
    this.wakes = []; // one wake per boat slot
    rs = (Date.now() % 1000000) + 3;
  }
  setQuality(q) { this.max = q === 'low' ? 3 : 7; }
  setNight(k) { this.night = k; }
  wet(x, z) { const w = this.world; return w.water.inside(x, z) && !w.onRoad(x, z, 3); }
  // enough open water around a point for a boat
  roomy(x, z, r) { if (!this.wet(x, z)) return false; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (!this.wet(x + Math.cos(t) * r, z + Math.sin(t) * r)) return false; } return true; }
  spawn(px, pz) {
    for (let tries = 0; tries < 24; tries++) {
      const a = rnd() * Math.PI * 2, d = 90 + rnd() * 520, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!this.roomy(x, z, 14) || this.list.some(b => Math.hypot(b.x - x, b.z - z) < 40)) continue;
      let tot = 0; for (const T of TYPES) tot += T.w; let r = rnd() * tot, type = TYPES[0]; for (const T of TYPES) { r -= T.w; if (r <= 0) { type = T; break; } }
      if (type.len > 9 && !this.roomy(x, z, 26)) type = TYPES[0];
      const mesh = buildBoat(type); this.scene.add(mesh);
      const b = { type, mesh, x, z, yaw: rnd() * 6.283, sp: 0, want: type.speed[0] + rnd() * (type.speed[1] - type.speed[0]), turn: 0, ph: rnd() * 6, idle: 0, roll: 0, vx: 0, vz: 0, speed: 0, wake: new WaterWake(this.scene) };
      // face along open water
      let best = b.yaw, bs = -1; for (let k = 0; k < 8; k++) { const h = k * Math.PI / 4; let s = 0; for (const dd of [20, 40, 70]) if (this.wet(x + Math.sin(h) * dd, z + Math.cos(h) * dd)) s++; if (s > bs) { bs = s; best = h; } }
      b.yaw = best; this.list.push(b); return;
    }
  }
  remove(b) { this.scene.remove(b.mesh); b.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); b.wake.clear(); for (const L of [b.wake.foam, b.wake.rings]) { this.scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); } }
  clear() { for (const b of this.list) this.remove(b); this.list = []; }
  update(dt, px, pz, on) {
    if (!on) { if (this.list.length) this.clear(); return; }
    this.t += dt; this.spawnT -= dt;
    for (let i = this.list.length - 1; i >= 0; i--) { const b = this.list[i]; if (Math.hypot(b.x - px, b.z - pz) > 1000 || !this.world.water.inside(b.x, b.z)) { this.remove(b); this.list.splice(i, 1); } }
    if (this.spawnT <= 0 && this.list.length < this.max) { this.spawnT = 1.2; this.spawn(px, pz); }
    for (const b of this.list) this.step(b, dt);
  }
  step(b, dt) {
    const T = b.type, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    // feel ahead for the bank; steer to whichever side has more water
    const look = 18 + b.sp * 2.2;
    const ahead = this.wet(b.x + fx * look, b.z + fz * look) && this.wet(b.x + fx * look * 0.5, b.z + fz * look * 0.5);
    let steer = 0;
    if (!ahead) {
      const score = h => { let s = 0; for (const d of [10, 22, 40]) if (this.wet(b.x + Math.sin(h) * d, b.z + Math.cos(h) * d)) s++; return s; };
      const l = score(b.yaw - 0.7) + score(b.yaw - 1.4) * 0.5, r = score(b.yaw + 0.7) + score(b.yaw + 1.4) * 0.5;
      steer = (r >= l ? 1 : -1) * 1.0;
    } else {
      b.turn += (rnd() - 0.5) * dt * 0.6; b.turn *= Math.exp(-dt * 0.4); steer = Math.max(-0.35, Math.min(0.35, b.turn)); // lazy wandering
    }
    // keep away from other boats
    for (const o of this.list) if (o !== b) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d < 30 && d > 0.1 && (dx * fx + dz * fz) > 0) steer += (dx * fz - dz * fx > 0 ? -1 : 1) * (1 - d / 30); }
    const target = ahead ? b.want : b.want * 0.45;
    b.sp += (target - b.sp) * Math.min(1, dt * 0.6);
    const rate = Math.max(-0.55, Math.min(0.55, steer)) * Math.min(1, 0.25 + b.sp / 8);
    b.yaw += rate * dt; b.roll += (-rate * Math.min(1, b.sp / 10) * (T.id === 'sail' ? 0.4 : 0.25) - b.roll) * Math.min(1, dt * 2);
    let nx = b.x + Math.sin(b.yaw) * b.sp * dt, nz = b.z + Math.cos(b.yaw) * b.sp * dt;
    if (this.wet(nx, nz)) { b.x = nx; b.z = nz; } else { b.sp *= 0.5; b.yaw += Math.PI * dt; } // never beach it
    b.vx = Math.sin(b.yaw) * b.sp; b.vz = Math.cos(b.yaw) * b.sp; b.speed = b.sp;
    const wy = this.world.heightAt(b.x, b.z) - 0.25, k = Math.min(1, b.sp / 14), tt = this.t + b.ph;
    b.mesh.position.set(b.x, wy + 0.08 * Math.sin(tt * 1.7) + 0.12 * k, b.z);
    b.mesh.rotation.set(-(0.04 * k + 0.025 * Math.sin(tt * 1.3)), b.yaw, b.roll + 0.03 * Math.sin(tt * 1.1), 'YXZ');
    for (const n of b.mesh.userData.navs) n.visible = this.night > 0.35;
    if (b.mesh.userData.sail) b.mesh.userData.sail[0].rotation.y = Math.PI / 2 + 0.25 * Math.sin(tt * 0.3);
    b.wake.emit(b, dt, wy); b.wake.update(dt);
  }
  // push a circle (the player's car) out of any boat; returns { nx, nz, depth, boat } or null
  collide(x, z, r) {
    for (const b of this.list) {
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), dx = x - b.x, dz = z - b.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      const hl = b.type.len / 2, hb = b.type.beam / 2, cx = Math.max(-hb, Math.min(hb, lx)), cz = Math.max(-hl, Math.min(hl, lz)), ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
      if (d < r) {
        let nxl = ex, nzl = ez, dep = r - d;
        if (d < 1e-4) { if (hb - Math.abs(lx) < hl - Math.abs(lz)) { nxl = Math.sign(lx) || 1; nzl = 0; dep = r + hb - Math.abs(lx); } else { nxl = 0; nzl = Math.sign(lz) || 1; dep = r + hl - Math.abs(lz); } }
        const l = Math.hypot(nxl, nzl) || 1; nxl /= l; nzl /= l;
        const nx = nxl * fz + nzl * fx, nz = -nxl * fx + nzl * fz;
        b.yaw += (nx * fz - nz * fx) * 0.3; b.sp *= 0.6; // the boat gets knocked a bit too
        return { nx, nz, depth: dep, boat: b };
      }
    }
    return null;
  }
}
