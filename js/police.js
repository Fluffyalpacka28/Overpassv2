import * as THREE from 'three';
import { Car } from './car.js';

// Five-star wanted system. Crimes (running people over, shooting or ramming traffic, attacking officers) build up "heat";
// heat turns into stars, and stars decide how many police cars come and how they behave:
//   1 star : patrol cars stick to the roads and try to box you in. Stop next to one for a few seconds and you're BUSTED.
//   2 stars: they leave the road when they're close and ram you
//   3 stars: more of them, faster, hitting harder
//   4 stars: they also shoot at you
//   5 stars: rockets too
// Break line of sight long enough and you EVADE (stars cleared, bonus). If they wreck you, the stars reset (main.js decides the fine).
// Police are local to each player's own game (like traffic), so in multiplayer everyone has their own cops.
export const STAR_HEAT = [0, 10, 60, 140, 260, 420];
export const CRIME = { ped: 25, pedShot: 30, ram: 5, shotCar: 8, killCar: 35, shotCop: 10, ramCop: 8, killCop: 60, shotPlayer: 6 };
const COPS = [0, 2, 3, 4, 5, 6];
const VMAX = [0, 34, 40, 46, 52, 58];        // top speed per star level (m/s); you have ~52, ~70 on nitrous
const CHASE = [0, 45, 110, 130, 150, 170];   // closer than this they leave the road and come straight for you
const COP_HP = 120;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let LIVERY = null;
function liveryTex() {
  if (LIVERY) return LIVERY;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#1b3f8f'; x.fillRect(0, 96, 512, 14); x.fillStyle = '#c9a43a'; x.fillRect(0, 110, 512, 5);
  x.fillStyle = '#10204a'; x.font = 'bold 68px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('POLICE', 256, 52);
  LIVERY = new THREE.CanvasTexture(c); LIVERY.colorSpace = THREE.SRGBColorSpace; LIVERY.anisotropy = 4; return LIVERY;
}
let HALO = null;
function haloTex() {
  if (HALO) return HALO;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  HALO = new THREE.CanvasTexture(c); return HALO;
}
// dress a car up as a police cruiser: white door panels with POLICE, push bar, light bar on the roof
function dressCop(car) {
  const m = car.mesh; m.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), bb = new THREE.Box3(), tmp = new THREE.Box3();
  m.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); bb.union(tmp); });
  if (bb.isEmpty()) bb.set(new THREE.Vector3(-0.9, 0, -2.2), new THREE.Vector3(0.9, 1.4, 2.2));
  const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z, cz = (bb.max.z + bb.min.z) / 2;
  const g = new THREE.Group(), mats = [];
  const panelM = new THREE.MeshStandardMaterial({ map: liveryTex(), roughness: 0.45, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }); mats.push(panelM);
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.5, H * 0.26), panelM); p.position.set(sd * (W / 2 + 0.015), bb.min.y + H * 0.38, cz); p.rotation.y = sd * Math.PI / 2; g.add(p); }
  const dark = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.6, metalness: 0.4 }); mats.push(dark);
  const push = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.36, 0.14), dark); push.position.set(0, bb.min.y + H * 0.3, bb.max.z + 0.06); g.add(push);
  const bar = new THREE.Group(); bar.position.set(0, bb.max.y + 0.02, cz - L * 0.05); g.add(bar);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W * 0.66, 0.1, 0.34), dark); base.position.y = 0.05; bar.add(base);
  const red = new THREE.MeshBasicMaterial({ color: '#ff1a1a', toneMapped: false }), blue = new THREE.MeshBasicMaterial({ color: '#1a5cff', toneMapped: false }); mats.push(red, blue);
  const rL = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.13, 0.3), red); rL.position.set(-W * 0.17, 0.16, 0); bar.add(rL);
  const bR = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.13, 0.3), blue); bR.position.set(W * 0.17, 0.16, 0); bar.add(bR);
  const hR = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: '#ff2020', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); hR.position.set(-W * 0.17, 0.2, 0); hR.scale.setScalar(2.6); bar.add(hR);
  const hB = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: '#2a6bff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); hB.position.set(W * 0.17, 0.2, 0); hB.scale.setScalar(2.6); bar.add(hB);
  mats.push(hR.material, hB.material);
  m.add(g);
  return { g, red, blue, hR, hB, mats, roof: bb.max.y };
}

export class Police {
  // ctx: { scene, world, player() -> car, roadOk(seg), ready(x,z), seen(x,y,z), solid(x,y,z), wfx, audio,
  //        contact(cop, nx, nz, closing), boom(x,y,z,size), smoke(x,y,z,dark), onStars(n, prev), busted(), evaded(n), yieldTraffic(x,z,dx,dz) }
  constructor(ctx) {
    this.c = ctx; this.cops = []; this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; this.spawnT = 0; this.losT = 0; this.t = 0; this.seenNow = false; this.siren = 0;
  }
  starOf(h) { let s = 0; for (let i = 1; i < STAR_HEAT.length; i++) if (h >= STAR_HEAT[i]) s = i; return s; }
  // someone committed a crime (always us: police are local)
  crime(kind, mult = 1) {
    const add = (CRIME[kind] || 0) * mult; if (!(add > 0)) return;
    const prev = this.stars; this.heat = Math.min(600, this.heat + add); this.stars = Math.max(this.stars, this.starOf(this.heat));
    if (this.stars > 0) this.lostT = Math.min(this.lostT, 1);           // fresh crime: they know where you are again
    if (this.stars > prev) { for (const c of this.cops) c.leave = false; try { this.c.onStars && this.c.onStars(this.stars, prev); } catch { } }
  }
  reset() { this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; for (const c of this.cops) { c.leave = true; c.mode = c.mode === 'road' ? 'road' : 'rejoin'; c.leaveT = 0; } }
  clear() { for (const c of [...this.cops]) this.remove(c); this.heat = 0; this.stars = 0; this.lostT = 0; this.bustT = 0; try { this.c.audio && this.c.audio.siren(0); } catch { } }
  // for weapons: every cop you can shoot
  targets() { return this.cops; }
  // a cop got shot by us. Returns true when it was destroyed
  hit(c, dmg) {
    if (!c || c.dead) return false; c.hp -= dmg; c.flashHit = 0.12;
    if ((c.shotCrimeT || 0) <= 0) { c.shotCrimeT = 0.4; this.crime('shotCop'); }
    if (c.leave) c.leave = false;
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

  // ---------- spawning ----------
  spawn(P) {
    const w = this.c.world, CELL = 24, R = 380, ci = Math.floor(P.x / CELL), cj = Math.floor(P.z / CELL), n = Math.ceil(R / CELL) + 1, seen = new Set(), cand = [];
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const s of (w.roadCells.get(i + ',' + j) || [])) {
      if (seen.has(s)) continue; seen.add(s);
      if (!this.c.roadOk(s) || Math.hypot(s.x1 - s.x0, s.z1 - s.z0) < 6) continue;
      const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, d = Math.hypot(mx - P.x, mz - P.z);
      if (d < 150 || d > R) continue; if (!s.bridge && w.water.inside(mx, mz)) continue; if (!this.c.ready(mx, mz)) continue;
      cand.push(s);
    }
    if (!cand.length) return false;
    let pick = null;
    for (let k = 0; k < 14 && !pick; k++) { const s = cand[Math.floor(Math.random() * cand.length)], mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; if (this.cops.some(c => Math.hypot(c.car.x - mx, c.car.z - mz) < 30)) continue; if (k < 10 && this.c.seen(mx, w.heightAt(mx, mz) + 1, mz)) continue; pick = s; }
    if (!pick) return false;
    const model = this.stars >= 3 ? (Math.random() < 0.5 ? 'rally' : 'muscle') : (Math.random() < 0.5 ? 'coupe' : 'muscle');
    const car = new Car('#15181e', model); car.mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const c = { car, dress: dressCop(car), hp: COP_HP, mode: 'road', speed: 0, stuck: 0, ramCd: 0, fireCd: 1 + Math.random() * 2, burst: 0, burstT: 0, rocketCd: 3 + Math.random() * 3, flipT: 0, visited: new Map(), ph: Math.random() * 6, leave: false, py: null, cop: true };
    const len = Math.hypot(pick.x1 - pick.x0, pick.z1 - pick.z0), k = 0.5, x = pick.x0 + (pick.x1 - pick.x0) * k, z = pick.z0 + (pick.z1 - pick.z0) * k;
    const dir = ((pick.x1 - pick.x0) * (P.x - x) + (pick.z1 - pick.z0) * (P.z - z)) >= 0 ? 1 : -1;  // head towards you
    this.setSeg(c, pick, dir, len * 0.5, P);
    car.x = x; car.z = z; car.y = pick.bridge ? (pick.y0 + pick.y1) / 2 : w.heightAt(x, z); car.yaw = Math.atan2(c.dx, c.dz); c.speed = VMAX[this.stars] * 0.6;
    car.sync(0); this.c.scene.add(car.mesh); this.cops.push(c); return true;
  }

  // ---------- road driving ----------
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
    // the target is behind us on this road: swing round
    c.flipT -= dt;
    const rx = T.x - car.x, rz = T.z - car.z, along = rx * c.dx + rz * c.dz;
    if (c.flipT <= 0 && along < -15 && Math.hypot(rx, rz) < 220) { c.flipT = 5; this.setSeg(c, c.seg, -c.dir, c.len - c.d, T); c.speed *= 0.3; }
    const left = c.len - c.d, vTurn = c.next ? 8 + 34 * Math.max(0, c.next.dot) ** 2 : 4;
    let target = Math.min(vmax, Math.sqrt(vTurn * vTurn + 2 * 13 * Math.max(0, left)));
    if (ahead < 14) target = Math.min(target, Math.max(0, (ahead - 6) * 2));
    c.speed += clamp(target - c.speed, -30 * dt, 15 * dt);
    c.d += c.speed * dt;
    let guard = 0;
    while (c.d >= c.len && guard++ < 4) {
      const over = c.d - c.len, nx = c.next;
      if (nx) { c.speed *= 0.7 + 0.3 * Math.max(0, nx.dot); this.setSeg(c, nx.o, nx.nd, over, T); }
      else { this.setSeg(c, c.seg, -c.dir, Math.min(over, c.len - 0.01), T); c.speed *= 0.3; }
    }
    const s = c.seg, sx = c.dir > 0 ? s.x0 : s.x1, sz = c.dir > 0 ? s.z0 : s.z1, x = sx + c.dx * c.d - c.dz * c.lane, z = sz + c.dz * c.d + c.dx * c.lane, q = c.d / c.len, k = c.dir > 0 ? q : 1 - q;
    const y = s.bridge ? s.y0 + (s.y1 - s.y0) * k : w.heightAt(x, z);
    const ty = Math.atan2(c.dx, c.dz), diff = wrap(ty - car.yaw);
    car.yaw += diff * Math.min(1, dt * 6); car.steer += (clamp(diff * 2, -0.6, 0.6) - car.steer) * Math.min(1, dt * 8);
    this.place(c, x, y, z, dt);
    // traffic ahead pulls over for the siren
    if (!c.leave) try { this.c.yieldTraffic && this.c.yieldTraffic(car.x, car.z, c.dx, c.dz); } catch { }
  }
  // ---------- off-road driving (chasing you down) ----------
  freeStep(c, dt, tx, tz, vWant) {
    const car = c.car, w = this.c.world, ang = Math.atan2(tx - car.x, tz - car.z), diff = wrap(ang - car.yaw);
    const rate = 2.5 * Math.min(1, Math.abs(c.speed) / 6 + 0.2);
    car.yaw += clamp(diff, -rate * dt, rate * dt);
    if (Math.abs(diff) > 1.2) vWant = Math.min(vWant, 11);
    c.speed += clamp(vWant - c.speed, -32 * dt, 17 * dt);
    const ox = car.x, oz = car.z; let x = ox + Math.sin(car.yaw) * c.speed * dt, z = oz + Math.cos(car.yaw) * c.speed * dt;
    if (w.water.inside(x, z) && !w.onRoad(x, z, 0)) { x = ox; z = oz; c.speed *= 0.3; }
    const col = w.collide(x, z, 1.5, car.y);
    if (col) { x += col.nx * col.depth; z += col.nz * col.depth; c.speed *= 0.7; car.yaw += Math.sign(wrap(Math.atan2(col.nz, -col.nx) - car.yaw) || 1) * dt * 1.5; }
    const moved = Math.hypot(x - ox, z - oz);
    c.stuck = vWant > 6 && moved < dt * 2 ? c.stuck + dt : Math.max(0, c.stuck - dt * 2);
    car.steer += (clamp(diff * 2, -0.6, 0.6) - car.steer) * Math.min(1, dt * 8);
    let y = car.y || 0; try { y = w.groundY(x, z, y); } catch { y = w.heightAt(x, z); }
    this.place(c, x, y, z, dt);
  }
  place(c, x, y, z, dt) {
    const car = c.car;
    if (c.py != null) { const step = Math.hypot(x - car.x, z - car.z); if (step > 0.02) car.pitch += (clamp(-Math.atan2(y - c.py, step), -0.5, 0.5) - car.pitch) * Math.min(1, dt * 6); }
    c.py = y; car.x = x; car.z = z; car.y = y; car.vx = Math.sin(car.yaw) * c.speed; car.vz = Math.cos(car.yaw) * c.speed;
    car.sync(dt, c.speed, 0);
  }
  // nearest point on the closest road, to drive back onto it
  rejoin(c, dt, T) {
    const car = c.car, w = this.c.world, info = w.roadInfo(car.x, car.z);
    c.rejoinT = (c.rejoinT || 0) + dt;
    if (!info || !this.c.roadOk(info.seg)) { this.freeStep(c, dt, T.x, T.z, 14); return; }
    const s = info.seg, ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1, k = clamp(((car.x - s.x0) * ex + (car.z - s.z0) * ez) / l2, 0, 1), px = s.x0 + ex * k, pz = s.z0 + ez * k;
    const dist = Math.hypot(px - car.x, pz - car.z), hidden = !this.c.seen(car.x, (car.y || 0) + 1, car.z);
    if (dist < s.hw + 1.5 || (hidden && dist < 60)) {
      const len = Math.sqrt(l2), dir = ex * (T.x - px) + ez * (T.z - pz) >= 0 ? 1 : -1;
      this.setSeg(c, s, dir, dir > 0 ? k * len : (1 - k) * len, T); c.mode = 'road'; c.rejoinT = 0; c.stuck = 0; return;
    }
    this.freeStep(c, dt, px, pz, 14);
  }
  // is there a clear line between this cop and you (for spotting and shooting)?
  los(c, P) {
    const ax = c.car.x, az = c.car.z, bx = P.x, bz = P.z, d = Math.hypot(bx - ax, bz - az), n = Math.min(16, Math.ceil(d / 10)), y = Math.max(c.car.y || 0, P.y || 0) + 1.2;
    for (let i = 1; i < n; i++) { const t = i / n; if (this.c.solid(ax + (bx - ax) * t, y, az + (bz - az) * t)) return false; }
    return true;
  }

  update(dt, on) {
    this.t += dt;
    const P = this.c.player();
    if (!on || !P) { if (this.siren > 0) { this.siren = 0; try { this.c.audio && this.c.audio.siren(0); } catch { } } if (!on && (this.cops.length || this.stars)) this.clear(); return; }
    if (this.stars === 0 && this.heat > 0) this.heat = Math.max(0, this.heat - dt * 1.2); // small stuff blows over if nobody's after you yet
    // more cops as the stars go up
    const want = this.stars > 0 ? COPS[this.stars] : 0, active = this.cops.filter(c => !c.leave).length;
    this.spawnT -= dt;
    if (active < want && this.spawnT <= 0) { this.spawnT = 1.2; this.spawn(P); }
    const vmax = VMAX[Math.max(1, this.stars)], chase = CHASE[Math.max(1, this.stars)], pyG = this.c.world.heightAt(P.x, P.z), high = (P.y || 0) - pyG > 7;
    const pvx = P.vx || 0, pvz = P.vz || 0, psp = Math.hypot(pvx, pvz), pfx = Math.sin(P.yaw), pfz = Math.cos(P.yaw);
    // line of sight checks (a few times a second)
    this.losT -= dt; const doLos = this.losT <= 0; if (doLos) { this.losT = 0.3; this.seenNow = false; }
    let sirenLvl = 0, closeStill = false;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i], car = c.car, dx = P.x - car.x, dz = P.z - car.z, dist = Math.hypot(dx, dz);
      c.ramCd -= dt; c.shotCrimeT = (c.shotCrimeT || 0) - dt;
      if (c.leave) {
        c.leaveT = (c.leaveT || 0) + dt;
        if ((dist > 220 && !this.c.seen(car.x, (car.y || 0) + 1, car.z)) || c.leaveT > 30 || dist > 700) { this.remove(c); continue; }
        const away = { x: car.x - dx * 10, z: car.z - dz * 10 };
        if (c.mode === 'road') this.roadStep(c, dt, away, 16, 99); else this.rejoin(c, dt, away);
      } else {
        if (dist > 750) { this.remove(c); continue; }   // left far behind: it'll be replaced by one closer
        if (doLos) { c.los = dist < 160 && this.los(c, P); if (c.los) this.seenNow = true; }
        const nearRoad = this.c.world.onRoad(P.x, P.z, 6), dy = Math.abs((P.y || 0) - (car.y || 0));
        const goFree = !high && dy < 5 && dist < chase && (this.stars >= 2 || nearRoad || dist < 22);
        if (c.mode === 'road') {
          // brake for another cop right in front on the same road
          let ahead = 99; for (const o of this.cops) if (o !== c && o.mode === 'road' && o.seg === c.seg && o.dir === c.dir && o.d > c.d) ahead = Math.min(ahead, o.d - c.d);
          const lead = Math.min(2, dist / 60);
          this.roadStep(c, dt, { x: P.x + pvx * lead, z: P.z + pvz * lead }, vmax, ahead);
          if (goFree) { c.mode = 'free'; c.stuck = 0; }
        } else if (c.mode === 'free') {
          let tx, tz, vw;
          if (this.stars <= 1) { // box you in: aim for a spot just in front of you, then stop there
            const side = (i % 2 ? 1 : -1) * 2.5, fwd = psp > 3 ? 9 : 5.5;
            tx = P.x + pfx * fwd + pfz * side + pvx * 0.4; tz = P.z + pfz * fwd - pfx * side + pvz * 0.4;
            const dt2 = Math.hypot(tx - car.x, tz - car.z); vw = Math.min(vmax, psp * 1.05 + dt2 * 1.4); if (dt2 < 3) vw = Math.min(vw, psp);
          } else if (c.ramCd > 0) { // just hit you: back off a moment
            tx = car.x + Math.sin(car.yaw) * 20; tz = car.z + Math.cos(car.yaw) * 20; vw = 9;
          } else { // ram
            const lead = clamp(dist / (Math.abs(c.speed) + 10), 0, 1.2); tx = P.x + pvx * lead; tz = P.z + pvz * lead; vw = vmax;
          }
          this.freeStep(c, dt, tx, tz, vw);
          if (dist > chase * 1.7 || c.stuck > 2.5 || high) { c.mode = 'rejoin'; c.rejoinT = 0; c.stuck = 0; }
        } else { // rejoin the road
          this.rejoin(c, dt, P);
          if (goFree && c.rejoinT > 1.5) { c.mode = 'free'; c.stuck = 0; }
          if (c.rejoinT > 10 && !this.c.seen(car.x, (car.y || 0) + 1, car.z)) { this.remove(c); continue; }
        }
        // contact with you
        const cx = P.x - car.x, cz = P.z - car.z, cd = Math.hypot(cx, cz);
        if (cd < 3.4 && cd > 0.01 && Math.abs((P.y || 0) - (car.y || 0)) < 2.5) {
          const nx = cx / cd, nz = cz / cd, closing = -((pvx - car.vx) * nx + (pvz - car.vz) * nz);
          try { this.c.contact(c, nx, nz, closing, cd); } catch { }
          if (closing > 4) c.ramCd = 1.6 + Math.random() * 0.8;
          c.speed *= 0.55;
        }
        if (cd < 9 && c.mode === 'free') closeStill = true;
        // shooting (4+ stars)
        if (this.stars >= 4 && c.los && dist < 150 && !high) this.shoot(c, P, dt, dist);
        else if (this.stars >= 4 && c.los && high && dist < 200) this.shoot(c, P, dt, dist);
        sirenLvl = Math.max(sirenLvl, Math.max(0, 1 - Math.hypot(dist, dy) / 380) ** 1.6);
      }
      // cops don't drive through each other
      for (let j = 0; j < i; j++) { const o = this.cops[j]; if (o.mode === 'road' && c.mode === 'road') continue; const ex = car.x - o.car.x, ez = car.z - o.car.z, e = Math.hypot(ex, ez); if (e < 4 && e > 0.01) { const push = (4 - e) / 2; if (c.mode !== 'road') { car.x += ex / e * push; car.z += ez / e * push; } if (o.mode !== 'road') { o.car.x -= ex / e * push; o.car.z -= ez / e * push; } } }
      // light bar + damage smoke
      const L = c.dress, ph = (this.t * 3.2 + c.ph) % 1, on1 = !c.leave && (ph < 0.25 || (ph > 0.32 && ph < 0.45)), on2 = !c.leave && (ph > 0.5 && ph < 0.75 || ph > 0.82 && ph < 0.95);
      L.red.color.setRGB(on1 ? 1.6 : 0.25, on1 ? 0.08 : 0.02, on1 ? 0.08 : 0.02); L.blue.color.setRGB(on2 ? 0.1 : 0.02, on2 ? 0.35 : 0.05, on2 ? 1.8 : 0.3);
      L.hR.visible = on1; L.hB.visible = on2;
      if (c.hp < COP_HP * 0.45 && (c.smokeT = (c.smokeT || 0) - dt) <= 0) { c.smokeT = 0.15; try { this.c.smoke(car.x + Math.sin(car.yaw) * 1.7, (car.y || 0) + 1.1, car.z + Math.cos(car.yaw) * 1.7, c.hp < COP_HP * 0.2); } catch { } }
    }
    // busted: at one star, stopped with a cop right on you for a few seconds
    if (this.stars === 1 && closeStill && Math.abs(P.speed || psp) < 2.5) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 1.5);
    if (this.bustT >= 3) { this.bustT = 0; try { this.c.busted && this.c.busted(); } catch { } this.reset(); }
    // evading: nobody can see you for long enough
    if (this.stars > 0) {
      if (this.seenNow) this.lostT = 0; else this.lostT += dt;
      if (this.lostT > 6 + this.stars * 4) { const n = this.stars; this.reset(); try { this.c.evaded && this.c.evaded(n); } catch { } }
    }
    this.siren = sirenLvl; try { this.c.audio && this.c.audio.siren(sirenLvl); } catch { }
  }
  // fraction of the evade timer left (for the HUD: stars blink while they've lost sight of you)
  get searching() { return this.stars > 0 && this.lostT > 1.5; }
  get bustK() { return clamp(this.bustT / 3, 0, 1); }
  shoot(c, P, dt, dist) {
    const wfx = this.c.wfx; if (!wfx || !wfx.copFire) return;
    const car = c.car, o = new THREE.Vector3(car.x + Math.sin(car.yaw) * 0.8, (car.y || 0) + c.dress.roof + 0.35, car.z + Math.cos(car.yaw) * 0.8);
    const aimAt = (spd, err) => { const lead = dist / spd; const t = new THREE.Vector3(P.x + (P.vx || 0) * lead + (Math.random() - 0.5) * err, (P.y || 0) + 0.7 + (Math.random() - 0.5) * err * 0.4, P.z + (P.vz || 0) * lead + (Math.random() - 0.5) * err); return t.sub(o); };
    c.fireCd -= dt;
    if (c.burst > 0) { c.burstT -= dt; if (c.burstT <= 0) { c.burst--; c.burstT = 0.11; wfx.copFire('mg', o, aimAt(300, this.stars >= 5 ? 1.6 : 2.4), car.vx, car.vz, 0.6); } }
    else if (c.fireCd <= 0 && dist < 120) { c.burst = 6; c.burstT = 0; c.fireCd = 2 + Math.random() * 1.5; }
    if (this.stars >= 5) { c.rocketCd -= dt; if (c.rocketCd <= 0 && dist > 25 && dist < 170) { c.rocketCd = 5 + Math.random() * 3; wfx.copFire('rocket', o, aimAt(95, 1.5), car.vx, car.vz, 0.65); } }
  }
}
