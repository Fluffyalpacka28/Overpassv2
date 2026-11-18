import * as THREE from 'three';
import { Car } from './car.js';

// Five-star wanted system with hover-car police.
// Crimes (running people over, shooting or ramming traffic, attacking officers) build up "heat"; heat turns into stars:
//   1 star : hover patrol cars stick to the roads and try to box you in. Stop next to one for a few seconds and you're BUSTED.
//            (they only leave the road when they're right on you, or to follow you into the sky)
//   2 stars: they fly straight at you, over buildings, and ram you
//   3 stars: more of them, faster interceptors, hitting harder
//   4 stars: they also shoot at you
//   5 stars: rockets too, in pursuit hypercars that can almost match your top speed
// Every tier brings a nicer, faster car. They chase you into the sky when you fly.
// Evading: they always know where you are while one of them can see you (and for a while after a fresh crime).
// Once nobody can see you, they search around where you were last seen; get well outside that search area and stay unseen
// long enough and the stars go away. If they wreck you, the stars reset (main.js decides the fine).
// Police are local to each player's own game (like traffic), so in multiplayer everyone has their own cops.
export const STAR_HEAT = [0, 10, 60, 140, 260, 420];
export const CRIME = { ped: 25, pedShot: 30, ram: 5, shotCar: 8, killCar: 35, shotCop: 10, ramCop: 8, killCop: 60, shotPlayer: 6 };
const COPS = [0, 2, 3, 4, 5, 6];
const VBASE = [0, 32, 42, 50, 58, 64];           // each tier's own top speed (m/s); you have ~52-57, ~70+ on nitrous
const KEEP = [0, 0.72, 0.84, 0.92, 0.97, 0.99];  // ...but they also match this share of however fast you're going right now
const ACC = [0, 20, 26, 34, 42, 52];             // acceleration (m/s²)
const SEARCH_R = [0, 170, 220, 270, 320, 380];   // how far from where they last saw you they keep searching
const SEE_R = 320;                               // how far a cop can spot you (with a clear line of sight)
const COP_HP = [0, 110, 120, 140, 160, 190];
const HOVER = 1.1;                               // ride height above the ground
// the cars: every star level up gets a nicer one
const TIERS = [null,
  { model: 'coupe', paint: '#15181e', glow: '#59d2ff', bg: '#f4f6f8', ink: '#10204a', band: '#1b3f8f', trim: '#c9a43a', word: 'POLICE' },
  { model: 'muscle', paint: '#121418', glow: '#59d2ff', bg: '#f4f6f8', ink: '#10204a', band: '#1b3f8f', trim: '#c9a43a', word: 'POLICE' },
  { model: 'rally', paint: '#0e1b38', glow: '#4fa8ff', bg: '#0e1b38', ink: '#ffffff', band: '#3f8cff', trim: '#ffffff', word: 'POLICE' },
  { model: 'hyper', paint: '#1b1e24', glow: '#3fd0ff', bg: '#121418', ink: '#3fd0ff', band: '#3fd0ff', trim: '#1f6dff', word: 'INTERCEPT' },
  { model: 'hyper', paint: '#09090b', glow: '#ff2d55', bg: '#09090b', ink: '#f2c14e', band: '#ff2d55', trim: '#f2c14e', word: 'PURSUIT' },
];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const LIVERY = {};
function liveryTex(T) {
  if (LIVERY[T.word + T.bg]) return LIVERY[T.word + T.bg];
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = T.bg; x.fillRect(0, 0, 512, 128);
  x.fillStyle = T.band; x.fillRect(0, 96, 512, 14); x.fillStyle = T.trim; x.fillRect(0, 110, 512, 5);
  x.fillStyle = T.ink; x.font = `bold ${T.word.length > 6 ? 54 : 68}px Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(T.word, 256, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (LIVERY[T.word + T.bg] = t);
}
let HALO = null;
function haloTex() {
  if (HALO) return HALO;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  HALO = new THREE.CanvasTexture(c); return HALO;
}
const halo = (color, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); sp.scale.setScalar(s); return sp; };
// turn a car into a hover police cruiser: livery panels, push bar, light bar, wheels swapped for glowing hover pads, rear thruster
function dressCop(car, T) {
  const m = car.mesh; m.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), bb = new THREE.Box3(), tmp = new THREE.Box3(), rel = new THREE.Matrix4();
  m.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); bb.union(tmp); });
  if (bb.isEmpty()) bb.set(new THREE.Vector3(-0.9, 0, -2.2), new THREE.Vector3(0.9, 1.4, 2.2));
  const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z, cz = (bb.max.z + bb.min.z) / 2;
  const g = new THREE.Group(), mats = [], glows = [];
  const panelM = new THREE.MeshStandardMaterial({ map: liveryTex(T), roughness: 0.45, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }); mats.push(panelM);
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.5, H * 0.26), panelM); p.position.set(sd * (W / 2 + 0.015), bb.min.y + H * 0.38, cz); p.rotation.y = sd * Math.PI / 2; g.add(p); }
  const dark = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.5, metalness: 0.6 }); mats.push(dark);
  const push = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.3, 0.14), dark); push.position.set(0, bb.min.y + H * 0.3, bb.max.z + 0.06); g.add(push);
  // light bar
  const bar = new THREE.Group(); bar.position.set(0, bb.max.y + 0.02, cz - L * 0.05); g.add(bar);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, 0.1, 0.34), dark); base.position.y = 0.05; bar.add(base);
  const red = new THREE.MeshBasicMaterial({ color: '#ff1a1a', toneMapped: false }), blue = new THREE.MeshBasicMaterial({ color: '#1a5cff', toneMapped: false }); mats.push(red, blue);
  const rL = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.13, 0.3), red); rL.position.set(-W * 0.17, 0.16, 0); bar.add(rL);
  const bR = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.13, 0.3), blue); bR.position.set(W * 0.17, 0.16, 0); bar.add(bR);
  const hR = halo('#ff2020', 2.6), hB = halo('#2a6bff', 2.6); hR.position.set(-W * 0.17, 0.2, 0); hB.position.set(W * 0.17, 0.2, 0); bar.add(hR, hB); mats.push(hR.material, hB.material);
  // hover pads where the wheels were
  const padM = new THREE.MeshStandardMaterial({ color: '#2a2e35', metalness: 0.85, roughness: 0.3 }), ringM = new THREE.MeshBasicMaterial({ color: T.glow, toneMapped: false }); mats.push(padM, ringM);
  const wheels = (m.userData.wheels || []);
  const spots = wheels.length ? wheels.map(w => { const p = new THREE.Vector3(); w.pivot.getWorldPosition(p); p.applyMatrix4(inv); w.pivot.visible = false; return p; })
    : [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => new THREE.Vector3(sx * W * 0.38, bb.min.y + 0.35, cz + sz * L * 0.32));
  for (const p of spots) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.2, 18), padM); pad.position.set(p.x, bb.min.y + 0.22, p.z); g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 20), ringM); ring.rotation.x = Math.PI / 2; ring.position.set(p.x, bb.min.y + 0.11, p.z); g.add(ring);
    const gl = halo(T.glow, 1.7); gl.position.set(p.x, bb.min.y - 0.25, p.z); g.add(gl); glows.push(gl); mats.push(gl.material);
  }
  const jet = halo(T.glow, 1.3); jet.position.set(0, bb.min.y + H * 0.35, bb.min.z - 0.2); g.add(jet); glows.push(jet); mats.push(jet.material);
  if (T.word === 'PURSUIT') { // gold pinstripe along the sills
    const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.25 }); mats.push(gold);
    for (const sd of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, L * 0.86), gold); s.position.set(sd * (W / 2 + 0.02), bb.min.y + H * 0.2, cz); g.add(s); }
  }
  m.add(g);
  return { g, red, blue, hR, hB, mats, glows, roof: bb.max.y };
}

export class Police {
  // ctx: { scene, world, player() -> car, roadOk(seg), ready(x,z), seen(x,y,z), solid(x,y,z), wfx, audio,
  //        contact(cop, nx, nz, closing, dist), boom(x,y,z,size), smoke(x,y,z,dark), onStars(n, prev), busted(), evaded(n), yieldTraffic(x,z,dx,dz) }
  constructor(ctx) {
    this.c = ctx; this.cops = []; this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; this.spawnT = 0; this.losT = 0; this.t = 0;
    this.seenNow = false; this.siren = 0; this.knowT = 0; this.known = null; this.pv = { x: 0, y: 0, z: 0 }; this.pp = null; this.seen = false;
  }
  starOf(h) { let s = 0; for (let i = 1; i < STAR_HEAT.length; i++) if (h >= STAR_HEAT[i]) s = i; return s; }
  // we committed a crime (police are local, so it's always us)
  crime(kind, mult = 1) {
    const add = (CRIME[kind] || 0) * mult; if (!(add > 0)) return;
    const prev = this.stars; this.heat = Math.min(600, this.heat + add); this.stars = Math.max(this.stars, this.starOf(this.heat));
    if (this.stars > 0) { this.lostT = 0; this.knowT = 12; const P = this.c.player(); if (P) this.known = { x: P.x, y: P.y || 0, z: P.z }; } // a fresh crime gets reported: they know where you are
    if (this.stars > prev) {
      this.spawnT = 0;
      for (const c of this.cops) { if (c.tier < this.stars - 1) { c.leave = true; c.leaveT = 0; } else c.leave = false; } // old slow cars head home, better ones come
      try { this.c.onStars && this.c.onStars(this.stars, prev); } catch { }
    }
  }
  reset() { this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; this.knowT = 0; this.known = null; for (const c of this.cops) { c.leave = true; c.leaveT = 0; } }
  clear() { for (const c of [...this.cops]) this.remove(c); this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; this.knowT = 0; this.known = null; this.pp = null; try { this.c.audio && this.c.audio.siren(0); } catch { } }
  targets() { return this.cops; }
  // a cop got shot by us. Returns true when it was destroyed
  hit(c, dmg) {
    if (!c || c.dead) return false; c.hp -= dmg;
    if ((c.shotCrimeT || 0) <= 0) { c.shotCrimeT = 0.4; this.crime('shotCop'); }
    if (c.hp <= 0) { this.kill(c); return true; }
    return false;
  }
  kill(c) {
    if (c.dead) return; c.dead = true;
    try { this.c.boom && this.c.boom(c.car.x, (c.car.y || 0) + 1, c.car.z, 5); } catch { }
    this.remove(c); this.crime('killCop');
  }
  remove(c) {
    const i = this.cops.indexOf(c); if (i >= 0) this.cops.splice(i, 1);
    this.c.scene.remove(c.car.mesh); c.car.mesh.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); for (const m of c.dress.mats) m.dispose();
  }
  ground(x, z, y) { const w = this.c.world; try { return y != null ? w.groundY(x, z, y) : w.heightAt(x, z); } catch { return w.heightAt(x, z); } }

  // ---------- spawning ----------
  makeCop(tier, x, y, z, yaw) {
    const T = TIERS[tier], car = new Car(T.paint, T.model); car.mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const c = { car, tier, dress: dressCop(car, T), hp: COP_HP[tier], mode: 'fly', speed: 0, vx: 0, vy: 0, vz: 0, stuck: 0, ramCd: 0, fireCd: 1 + Math.random() * 2, burst: 0, burstT: 0, rocketCd: 3 + Math.random() * 3, flipT: 0, visited: new Map(), ph: Math.random() * 6, leave: false, py: null, cop: true, wander: Math.random() * 6 };
    car.x = x; car.y = y; car.z = z; car.yaw = yaw; car.pitch = 0; car.roll = 0; car.sync(0); this.c.scene.add(car.mesh); this.cops.push(c); return c;
  }
  spawn(P, airborne) {
    const w = this.c.world, tier = this.stars, R = this.known && !this.seen ? this.known : P;
    // one star, on the ground: appear on a road and drive in
    if (tier === 1 && !airborne) {
      const CELL = 24, RR = 300, ci = Math.floor(R.x / CELL), cj = Math.floor(R.z / CELL), n = Math.ceil(RR / CELL) + 1, seen = new Set(), cand = [];
      for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const s of (w.roadCells.get(i + ',' + j) || [])) {
        if (seen.has(s)) continue; seen.add(s);
        if (!this.c.roadOk(s) || Math.hypot(s.x1 - s.x0, s.z1 - s.z0) < 6) continue;
        const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, d = Math.hypot(mx - R.x, mz - R.z);
        if (d < 110 || d > RR) continue; if (!s.bridge && w.water.inside(mx, mz)) continue; if (!this.c.ready(mx, mz)) continue;
        cand.push(s);
      }
      for (let k = 0; k < 16 && cand.length; k++) {
        const s = cand[Math.floor(Math.random() * cand.length)], mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
        if (this.cops.some(c => Math.hypot(c.car.x - mx, c.car.z - mz) < 30)) continue;
        if (k < 11 && this.c.seen(mx, w.heightAt(mx, mz) + 1, mz)) continue;
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), dir = ((s.x1 - s.x0) * (R.x - mx) + (s.z1 - s.z0) * (R.z - mz)) >= 0 ? 1 : -1;
        const c = this.makeCop(tier, mx, (s.bridge ? (s.y0 + s.y1) / 2 : w.heightAt(mx, mz)) + HOVER, mz, 0); c.mode = 'road';
        this.setSeg(c, s, dir, len * 0.5, R); c.car.yaw = Math.atan2(c.dx, c.dz); c.speed = VBASE[tier] * 0.6; return true;
      }
    }
    // everybody else flies in, out of sight if possible (from behind you, or high up)
    const fy = P.yaw || 0;
    for (let k = 0; k < 12; k++) {
      const ang = fy + Math.PI + (Math.random() - 0.5) * (k < 6 ? 2.2 : 6.28), d = 170 + Math.random() * 110, x = R.x + Math.sin(ang) * d, z = R.z + Math.cos(ang) * d;
      if (!this.c.ready(x, z) && k < 10) continue;
      const y = Math.max(this.ground(x, z) + 22, airborne ? (P.y || 0) + (Math.random() - 0.3) * 20 : 0);
      if (k < 9 && this.c.seen(x, y, z)) continue;
      if (this.cops.some(c => Math.hypot(c.car.x - x, c.car.z - z) < 25)) continue;
      const c = this.makeCop(tier, x, y, z, Math.atan2(R.x - x, R.z - z)); const v = Math.max(VBASE[tier] * 0.7, Math.hypot(this.pv.x, this.pv.z) * 0.9);
      c.vx = Math.sin(c.car.yaw) * v; c.vz = Math.cos(c.car.yaw) * v; return true;
    }
    return false;
  }

  // ---------- road driving (one star) ----------
  setSeg(c, seg, dir, d, T) {
    const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0, len = Math.hypot(dx, dz) || 1;
    c.seg = seg; c.dir = dir; c.len = len; c.dx = dx / len * dir; c.dz = dz / len * dir; c.d = d; c.lane = Math.min(1.1, seg.hw * 0.18);
    c.next = this.pick(c, T);
  }
  // which road to take at the end of this one: the one whose far end gets closest to the target (with a little memory so they don't loop)
  pick(c, T) {
    const s = c.seg, ex = c.dir > 0 ? s.x1 : s.x0, ez = c.dir > 0 ? s.z1 : s.z0, w = this.c.world, opts = [];
    const key = Math.round(ex) + ',' + Math.round(ez); c.visited.set(key, this.t); if (c.visited.size > 60) c.visited.clear();
    for (const o of w.nearbySegs(ex, ez)) {
      if (o === s || !this.c.roadOk(o)) continue; let nd;
      if (Math.hypot(o.x0 - ex, o.z0 - ez) < 1.5) nd = 1; else if (Math.hypot(o.x1 - ex, o.z1 - ez) < 1.5) nd = -1; else continue;
      const dx = (o.x1 - o.x0) * nd, dz = (o.z1 - o.z0) * nd, l = Math.hypot(dx, dz); if (l < 0.5) continue;
      const dot = (dx * c.dx + dz * c.dz) / l, fx = nd > 0 ? o.x1 : o.x0, fz = nd > 0 ? o.z1 : o.z0, fk = Math.round(fx) + ',' + Math.round(fz);
      let score = Math.hypot(fx - T.x, fz - T.z) + (1 - dot) * 6 + Math.random() * 8;
      if (c.visited.has(fk) && this.t - c.visited.get(fk) < 25) score += 140;
      if (!o.bridge && w.water.inside((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2)) score += 1000;
      opts.push({ o, nd, dot, score });
    }
    if (!opts.length) return null;
    opts.sort((a, b) => a.score - b.score); return opts[0];
  }
  roadStep(c, dt, T, vmax, ahead) {
    const car = c.car, w = this.c.world;
    c.flipT -= dt;
    const rx = T.x - car.x, rz = T.z - car.z, along = rx * c.dx + rz * c.dz;
    if (c.flipT <= 0 && along < -15 && Math.hypot(rx, rz) < 220) { c.flipT = 5; this.setSeg(c, c.seg, -c.dir, c.len - c.d, T); c.speed *= 0.3; }
    const left = c.len - c.d, vTurn = c.next ? 10 + 36 * Math.max(0, c.next.dot) ** 2 : 5;
    let target = Math.min(vmax, Math.sqrt(vTurn * vTurn + 2 * 15 * Math.max(0, left)));
    if (ahead < 14) target = Math.min(target, Math.max(0, (ahead - 6) * 2));
    c.speed += clamp(target - c.speed, -34 * dt, ACC[c.tier] * dt);
    c.d += c.speed * dt;
    let guard = 0;
    while (c.d >= c.len && guard++ < 4) {
      const over = c.d - c.len, nx = c.next;
      if (nx) { c.speed *= 0.75 + 0.25 * Math.max(0, nx.dot); this.setSeg(c, nx.o, nx.nd, over, T); }
      else { this.setSeg(c, c.seg, -c.dir, Math.min(over, c.len - 0.01), T); c.speed *= 0.3; }
    }
    const s = c.seg, sx = c.dir > 0 ? s.x0 : s.x1, sz = c.dir > 0 ? s.z0 : s.z1, x = sx + c.dx * c.d - c.dz * c.lane, z = sz + c.dz * c.d + c.dx * c.lane, q = c.d / c.len, k = c.dir > 0 ? q : 1 - q;
    const y = (s.bridge ? s.y0 + (s.y1 - s.y0) * k : w.heightAt(x, z)) + HOVER + Math.sin(this.t * 2.3 + c.ph) * 0.08;
    const ty = Math.atan2(c.dx, c.dz), diff = wrap(ty - car.yaw);
    car.yaw += diff * Math.min(1, dt * 6); car.roll += (clamp(-diff * 0.6, -0.3, 0.3) - car.roll) * Math.min(1, dt * 5);
    c.vx = c.dx * c.speed; c.vz = c.dz * c.speed; c.vy = 0;
    this.place(c, x, y, z, dt);
    if (!c.leave) try { this.c.yieldTraffic && this.c.yieldTraffic(car.x, car.z, c.dx, c.dz); } catch { } // traffic pulls over for the siren
  }
  // ---------- flying (two stars and up, or following you into the sky) ----------
  flyStep(c, dt, tx, ty, tz, vWant) {
    const car = c.car, w = this.c.world, A = ACC[c.tier];
    const dx = tx - car.x, dy = ty - car.y, dz = tz - car.z, d = Math.hypot(dx, dy, dz) || 1;
    let dvx = dx / d * vWant, dvy = dy / d * vWant, dvz = dz / d * vWant;
    if (d < 6 && vWant < 15) { dvx *= d / 6; dvy *= d / 6; dvz *= d / 6; } // settle on a spot instead of circling it
    // buildings ahead: climb over them
    const hs = Math.hypot(c.vx, c.vz), lk = 0.5 + hs * 0.035;
    const blocked = w.collide(car.x + c.vx * lk, car.z + c.vz * lk, 2.2, car.y - 0.8) || (d > 8 && w.collide(car.x + dx / d * 7, car.z + dz / d * 7, 2.2, car.y - 0.8));
    if (blocked) dvy = Math.max(dvy, 12 + hs * 0.3);
    c.vx += clamp(dvx - c.vx, -A * dt, A * dt); c.vz += clamp(dvz - c.vz, -A * dt, A * dt); c.vy += clamp(dvy - c.vy, -A * 1.4 * dt, A * 1.4 * dt);
    let x = car.x + c.vx * dt, z = car.z + c.vz * dt, y = car.y + c.vy * dt;
    const g = this.ground(x, z, y) + HOVER + Math.sin(this.t * 2.3 + c.ph) * 0.1;
    if (y < g) { y += (g - y) * Math.min(1, dt * 12); if (c.vy < 0) c.vy *= 0.5; }
    const col = w.collide(x, z, 1.5, y - 0.6);
    if (col) { x += col.nx * col.depth; z += col.nz * col.depth; const vn = c.vx * col.nx + c.vz * col.nz; if (vn < 0) { c.vx -= vn * col.nx; c.vz -= vn * col.nz; } c.vy = Math.max(c.vy, 10); }
    c.speed = Math.hypot(c.vx, c.vy, c.vz);
    c.stuck = vWant > 8 && c.speed < 3 ? c.stuck + dt : Math.max(0, c.stuck - dt);
    // face where it's going (or at you when hovering), bank into turns, nose follows climbs
    const hsp = Math.hypot(c.vx, c.vz), want = hsp > 3 ? Math.atan2(c.vx, c.vz) : Math.atan2(dx, dz), turn = wrap(want - car.yaw);
    car.yaw += turn * Math.min(1, dt * 5);
    car.roll += (clamp(-turn * 1.1, -0.55, 0.55) - car.roll) * Math.min(1, dt * 4);
    car.pitch += (clamp(-Math.atan2(c.vy, Math.max(4, hsp)) * 0.7, -0.6, 0.6) - car.pitch) * Math.min(1, dt * 4);
    car.x = x; car.y = y; car.z = z; car.vx = c.vx; car.vz = c.vz; car.steer = clamp(turn, -0.5, 0.5);
    car.sync(dt, hsp, 0); c.py = y;
  }
  place(c, x, y, z, dt) {
    const car = c.car;
    if (c.py != null) { const step = Math.hypot(x - car.x, z - car.z); if (step > 0.02) car.pitch += (clamp(-Math.atan2(y - c.py, step), -0.5, 0.5) - car.pitch) * Math.min(1, dt * 6); }
    c.py = y; car.x = x; car.z = z; car.y = y; car.vx = Math.sin(car.yaw) * c.speed; car.vz = Math.cos(car.yaw) * c.speed;
    car.sync(dt, c.speed, 0);
  }
  // one star: fly back down onto the nearest road
  rejoin(c, dt, T) {
    const car = c.car, w = this.c.world, info = w.roadInfo(car.x, car.z);
    c.rejoinT = (c.rejoinT || 0) + dt;
    if (!info || !this.c.roadOk(info.seg)) { this.flyStep(c, dt, T.x, this.ground(T.x, T.z) + 15, T.z, 25); return; }
    const s = info.seg, ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1, k = clamp(((car.x - s.x0) * ex + (car.z - s.z0) * ez) / l2, 0, 1), px = s.x0 + ex * k, pz = s.z0 + ez * k;
    const gy = (s.bridge ? s.y0 + (s.y1 - s.y0) * k : w.heightAt(px, pz)) + HOVER, dist = Math.hypot(px - car.x, pz - car.z);
    if (dist < s.hw + 1.5 && Math.abs(car.y - gy) < 2) {
      const len = Math.sqrt(l2), dir = ex * (T.x - px) + ez * (T.z - pz) >= 0 ? 1 : -1;
      this.setSeg(c, s, dir, dir > 0 ? k * len : (1 - k) * len, T); c.mode = 'road'; c.rejoinT = 0; c.stuck = 0; c.speed = Math.hypot(c.vx, c.vz); return;
    }
    this.flyStep(c, dt, px, gy, pz, clamp(dist * 1.5, 8, 30));
  }
  // clear line between this cop and you? (they look over rooftops when they're up high)
  los(c, P) {
    const ax = c.car.x, ay = (c.car.y || 0) + 1, az = c.car.z, bx = P.x, by = (P.y || 0) + 1, bz = P.z, d = Math.hypot(bx - ax, bz - az), n = Math.min(20, Math.ceil(d / 10));
    for (let i = 1; i < n; i++) { const t = i / n; if (this.c.solid(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return false; }
    return true;
  }

  update(dt, on) {
    this.t += dt;
    const P = this.c.player();
    if (!on || !P) { if (this.siren > 0) { this.siren = 0; try { this.c.audio && this.c.audio.siren(0); } catch { } } if (!on && (this.cops.length || this.stars)) this.clear(); this.pp = null; return; }
    // your real velocity (works the same driving or flying)
    if (this.pp && dt > 0) { const k = Math.min(1, dt * 6), iv = (a, b) => clamp((a - b) / dt, -140, 140); this.pv.x += (iv(P.x, this.pp.x) - this.pv.x) * k; this.pv.y += (iv(P.y || 0, this.pp.y) - this.pv.y) * k; this.pv.z += (iv(P.z, this.pp.z) - this.pv.z) * k; }
    this.pp = { x: P.x, y: P.y || 0, z: P.z };
    if (this.stars === 0 && this.heat > 0) this.heat = Math.max(0, this.heat - dt * 1.2); // small stuff blows over if nobody's after you yet
    const gP = this.c.world.heightAt(P.x, P.z), airborne = (P.y || 0) - gP > 6, pv = this.pv, psp = Math.hypot(pv.x, pv.y, pv.z);
    this.knowT = Math.max(0, this.knowT - dt);
    // more cops as the stars go up
    const want = this.stars > 0 ? COPS[this.stars] : 0, active = this.cops.filter(c => !c.leave).length;
    this.spawnT -= dt;
    if (active < want && this.spawnT <= 0) { this.spawnT = active === 0 ? 0.4 : 0.9; this.spawn(P, airborne); }
    // who can see you (a few times a second)
    this.losT -= dt; const doLos = this.losT <= 0; if (doLos) { this.losT = 0.25; this.seenNow = false; }
    let sirenLvl = 0, closeStill = false;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i], car = c.car, dx = P.x - car.x, dz = P.z - car.z, dist = Math.hypot(dx, dz), dy = (P.y || 0) - (car.y || 0), d3 = Math.hypot(dist, dy);
      c.ramCd -= dt; c.shotCrimeT = (c.shotCrimeT || 0) - dt;
      if (c.leave) { // off duty: fly up and away
        c.leaveT = (c.leaveT || 0) + dt;
        if ((d3 > 240 && !this.c.seen(car.x, car.y, car.z)) || c.leaveT > 25 || d3 > 900) { this.remove(c); continue; }
        const l = dist || 1; this.flyStep(c, dt, car.x - dx / l * 200, Math.max(car.y, this.ground(car.x, car.z)) + 30, car.z - dz / l * 200, 30);
      } else {
        if (d3 > 1100) { this.remove(c); continue; }     // way off: it gets replaced by one closer
        if (doLos) { c.los = d3 < SEE_R && this.los(c, P); if (c.los) this.seenNow = true; }
        const T = TIERS[c.tier], know = this.seen, goal = know ? { x: P.x, y: P.y || 0, z: P.z } : (this.known || { x: P.x, y: P.y || 0, z: P.z });
        // speed: their own top speed, or nearly yours (higher tiers keep up almost perfectly); a little extra to catch up from far away
        let vmax = Math.max(VBASE[c.tier], psp * KEEP[c.tier]);
        if (know) vmax *= d3 > 300 ? 1.35 : d3 > 120 ? 1.15 : 1 + Math.max(0, c.tier - 2) * 0.015; else vmax *= 0.8; // they sprint to catch back up, then sit right on you
        if (c.mode === 'road') {
          let ahead = 99; for (const o of this.cops) if (o !== c && o.mode === 'road' && o.seg === c.seg && o.dir === c.dir && o.d > c.d) ahead = Math.min(ahead, o.d - c.d);
          const lead = know ? Math.min(2, dist / 60) : 0;
          this.roadStep(c, dt, { x: goal.x + pv.x * lead, z: goal.z + pv.z * lead }, vmax, ahead);
          if (this.stars >= 2 || airborne || (know && dist < 45 && Math.abs(dy) < 5)) { c.mode = 'fly'; c.stuck = 0; }
        } else if (c.mode === 'rejoin') {
          this.rejoin(c, dt, goal);
          if (this.stars >= 2 || airborne || (know && dist < 40)) c.mode = 'fly';
        } else { // flying
          let tx, ty, tz, vw = vmax;
          if (!know) { // searching: circle around where they last saw you
            c.wander += dt * 0.4; const r = Math.min(SEARCH_R[this.stars] * 0.6, 40 + (this.lostT * 8));
            tx = goal.x + Math.cos(c.wander + c.ph) * r; tz = goal.z + Math.sin(c.wander + c.ph) * r; ty = Math.max(goal.y, this.ground(tx, tz)) + 18; vw = vmax * 0.7;
          } else if (this.stars <= 1 && !airborne) { // box you in: settle just in front of you
            const side = (i % 2 ? 1 : -1) * 2.5, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), fwd = psp > 3 ? 9 : 5.5;
            tx = P.x + fx * fwd + fz * side + pv.x * 0.4; tz = P.z + fz * fwd - fx * side + pv.z * 0.4; ty = (P.y || 0) + 0.2;
            const dt2 = Math.hypot(tx - car.x, tz - car.z); vw = Math.min(vmax, psp * 1.05 + dt2 * 1.4); if (dt2 < 3) vw = Math.min(vw, psp);
          } else if (c.ramCd > 0) { // just hit you: peel off and come round again
            tx = car.x + Math.sin(car.yaw) * 25; tz = car.z + Math.cos(car.yaw) * 25; ty = car.y + 3; vw = Math.max(14, vmax * 0.45);
          } else { // ram: aim where you're going to be
            const lead = clamp(d3 / (c.speed + 15), 0, 1.2); tx = P.x + pv.x * lead; tz = P.z + pv.z * lead; ty = (P.y || 0) + pv.y * lead + 0.3;
            if (!airborne && dist > 140) ty = Math.max(ty, Math.max(this.ground(car.x, car.z), gP) + 22); // come in over the rooftops, swoop down when close
          }
          this.flyStep(c, dt, tx, ty, tz, vw);
          if (this.stars <= 1 && !airborne && (!know || dist > 90 || c.stuck > 2.5)) { c.mode = 'rejoin'; c.rejoinT = 0; c.stuck = 0; }
        }
        // touching you
        const cx = P.x - car.x, cz = P.z - car.z, cd = Math.hypot(cx, cz);
        if (cd < 3.4 && cd > 0.01 && Math.abs((P.y || 0) - (car.y || 0) + 0.6) < 2.6) {
          const nx = cx / cd, nz = cz / cd, closing = -((pv.x - car.vx) * nx + (pv.z - car.vz) * nz);
          try { this.c.contact(c, nx, nz, closing, cd); } catch { }
          if (closing > 4) c.ramCd = 1.4 + Math.random() * 0.8;
          c.vx *= 0.5; c.vz *= 0.5; c.speed *= 0.55;
        }
        if (cd < 9 && c.mode === 'fly') closeStill = true;
        if (this.stars >= 4 && c.los && d3 < 160) this.shoot(c, P, dt, d3);
        sirenLvl = Math.max(sirenLvl, Math.max(0, 1 - d3 / 400) ** 1.6);
      }
      // cops don't fly through each other
      for (let j = 0; j < i; j++) { const o = this.cops[j]; if (o.mode === 'road' && c.mode === 'road') continue; const ex = car.x - o.car.x, ey = car.y - o.car.y, ez = car.z - o.car.z, e = Math.hypot(ex, ey, ez); if (e < 4 && e > 0.01) { const push = (4 - e) / 2; if (c.mode !== 'road') { car.x += ex / e * push; car.z += ez / e * push; } if (o.mode !== 'road') { o.car.x -= ex / e * push; o.car.z -= ez / e * push; } } }
      // light bar, hover glow, damage smoke
      const L = c.dress, ph = (this.t * 3.2 + c.ph) % 1, on1 = !c.leave && (ph < 0.25 || (ph > 0.32 && ph < 0.45)), on2 = !c.leave && (ph > 0.5 && ph < 0.75 || ph > 0.82 && ph < 0.95);
      L.red.color.setRGB(on1 ? 1.6 : 0.25, on1 ? 0.08 : 0.02, on1 ? 0.08 : 0.02); L.blue.color.setRGB(on2 ? 0.1 : 0.02, on2 ? 0.35 : 0.05, on2 ? 1.8 : 0.3);
      L.hR.visible = on1; L.hB.visible = on2;
      const gk = 0.7 + 0.3 * Math.sin(this.t * 18 + c.ph) + Math.min(0.6, c.speed / 80); for (const gl of L.glows) gl.material.opacity = clamp(gk, 0.3, 1);
      if (c.hp < COP_HP[c.tier] * 0.45 && (c.smokeT = (c.smokeT || 0) - dt) <= 0) { c.smokeT = 0.15; try { this.c.smoke(car.x + Math.sin(car.yaw) * 1.7, (car.y || 0) + 1.1, car.z + Math.cos(car.yaw) * 1.7, c.hp < COP_HP[c.tier] * 0.2); } catch { } }
    }
    // do they know where you are?
    this.seen = this.seenNow || this.knowT > 0;
    if (this.stars > 0) {
      if (this.seen) { this.lostT = 0; this.known = { x: P.x, y: P.y || 0, z: P.z }; }
      else { const out = !this.known || Math.hypot(P.x - this.known.x, P.z - this.known.z) > SEARCH_R[this.stars]; this.lostT += dt * (out ? 1 : 0.15); }
      if (this.lostT > 10 + this.stars * 3) { const n = this.stars; this.reset(); try { this.c.evaded && this.c.evaded(n); } catch { } }
    }
    // busted: at one star, stopped on the ground with a cop right on you for a few seconds
    if (this.stars === 1 && closeStill && !airborne && psp < 2.5) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 1.5);
    if (this.bustT >= 3) { this.bustT = 0; try { this.c.busted && this.c.busted(); } catch { } this.reset(); }
    this.siren = sirenLvl; try { this.c.audio && this.c.audio.siren(sirenLvl); } catch { }
  }
  // HUD: stars blink while they've lost sight of you
  get searching() { return this.stars > 0 && !this.seen && this.lostT > 0.5; }
  get bustK() { return clamp(this.bustT / 3, 0, 1); }
  shoot(c, P, dt, dist) {
    const wfx = this.c.wfx; if (!wfx || !wfx.copFire) return;
    const car = c.car, o = new THREE.Vector3(car.x + Math.sin(car.yaw) * 0.8, (car.y || 0) + c.dress.roof + 0.35, car.z + Math.cos(car.yaw) * 0.8), pv = this.pv;
    const aimAt = (spd, err) => { const lead = dist / spd; const t = new THREE.Vector3(P.x + pv.x * lead + (Math.random() - 0.5) * err, (P.y || 0) + pv.y * lead + 0.7 + (Math.random() - 0.5) * err * 0.4, P.z + pv.z * lead + (Math.random() - 0.5) * err); return t.sub(o); };
    c.fireCd -= dt;
    if (c.burst > 0) { c.burstT -= dt; if (c.burstT <= 0) { c.burst--; c.burstT = 0.11; wfx.copFire('mg', o, aimAt(300, this.stars >= 5 ? 1.6 : 2.4), car.vx, car.vz, 0.6); } }
    else if (c.fireCd <= 0 && dist < 130) { c.burst = 6; c.burstT = 0; c.fireCd = 2 + Math.random() * 1.5; }
    if (this.stars >= 5) { c.rocketCd -= dt; if (c.rocketCd <= 0 && dist > 25 && dist < 170) { c.rocketCd = 5 + Math.random() * 3; wfx.copFire('rocket', o, aimAt(95, 1.5), car.vx, car.vz, 0.65); } }
  }
}
