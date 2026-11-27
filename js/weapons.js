import * as THREE from 'three';

// Car weapons bought at Blick's Shooting Goods. One equipped at a time, mounted on the car where you put it in the garage.
// Shots are shared with everyone (so they see your tracers and rockets); hits are decided by the shooter's game against
// where the other cars are on their screen, then sent to the player who was hit.
export const WEAPONS = [
  { id: 'mg', name: 'Twin Machine Gun', price: 1500, cd: 0.09, dmg: 4, speed: 300, life: 1.1, spread: 0.018, desc: 'Fast, steady stream of tracers' },
  { id: 'shot', name: 'Scattergun', price: 2500, cd: 0.75, dmg: 5, pellets: 9, speed: 230, life: 0.32, spread: 0.075, desc: 'Brutal up close, useless far away' },
  { id: 'rocket', name: 'Rocket Pod', price: 4000, cd: 1.1, dmg: 34, splash: 7, speed: 95, life: 3.2, desc: 'Slow rockets with a big blast' },
  { id: 'rail', name: 'Rail Cannon', price: 6000, cd: 1.9, dmg: 46, range: 450, desc: 'Instant hit-scan beam, long reload' },
  { id: 'mine', name: 'Mine Dropper', price: 2000, cd: 1.3, dmg: 32, splash: 6, life: 40, desc: 'Drops proximity mines behind you' },
];
export const weaponById = id => WEAPONS.find(w => w.id === id) || null;
export const MOUNTS = [['roof', 'Roof'], ['hood', 'Hood'], ['twin', 'Twin sides']];
const num = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanWeaponCfg(c) {
  if (!c || typeof c !== 'object') return { w: '', m: 'roof', dx: 0, dy: 0, dz: 0, s: 1 };
  return { w: weaponById(c.w) ? c.w : '', m: MOUNTS.some(([k]) => k === c.m) ? c.m : 'roof', dx: num(c.dx, -1.5, 1.5, 0), dy: num(c.dy, -0.8, 1.5, 0), dz: num(c.dz, -2, 2, 0), s: num(c.s, 0.6, 1.6, 1) };
}
const KEY = 'osm.arsenal.v1';
export function loadArsenal() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; return { own: Array.isArray(v.own) ? v.own.filter(weaponById) : [], cfg: cleanWeaponCfg(v.cfg) }; } catch { return { own: [], cfg: cleanWeaponCfg(null) }; } }
export function saveArsenal(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { } }

// ---------- gun models (local +z = forward) ----------
let MAT = null;
const mats = () => MAT || (MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#9aa3ab', metalness: 0.9, roughness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.75, roughness: 0.45 }),
  olive: new THREE.MeshStandardMaterial({ color: '#4a5240', metalness: 0.4, roughness: 0.6 }),
  hole: new THREE.MeshBasicMaterial({ color: '#050505' }),
  red: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
  cyan: new THREE.MeshBasicMaterial({ color: '#4ff0ff', toneMapped: false }),
});
function gunModel(id) {
  const M = mats(), g = new THREE.Group(), muz = [];
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const cyl = (r, l, m, x, y, z, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  // turret ring all guns sit on
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 16), M.dark); ring.position.y = 0.06; g.add(ring);
  if (id === 'mg') {
    box(0.42, 0.3, 0.7, M.dark, 0, 0.3, 0); box(0.3, 0.22, 0.32, M.olive, 0.3, 0.26, -0.05);
    for (const sx of [-0.09, 0.09]) { cyl(0.045, 0.95, M.steel, sx, 0.33, 0.78); cyl(0.07, 0.2, M.dark, sx, 0.33, 1.2); muz.push(new THREE.Vector3(sx, 0.33, 1.32)); }
  } else if (id === 'shot') {
    box(0.36, 0.28, 0.55, M.dark, 0, 0.28, -0.05);
    for (const sx of [-0.08, 0.08]) cyl(0.07, 0.9, M.steel, sx, 0.33, 0.62);
    cyl(0.085, 0.32, M.olive, 0, 0.2, 0.55); muz.push(new THREE.Vector3(0, 0.33, 1.08));
  } else if (id === 'rocket') {
    box(0.62, 0.48, 0.8, M.olive, 0, 0.36, 0.05); box(0.66, 0.06, 0.84, M.dark, 0, 0.62, 0.05);
    for (const sx of [-0.15, 0.15]) for (const sy of [0.25, 0.47]) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), M.hole); h.position.set(sx, sy, 0.46); g.add(h); muz.push(new THREE.Vector3(sx, sy, 0.55)); }
  } else if (id === 'rail') {
    box(0.34, 0.26, 0.5, M.dark, 0, 0.28, -0.2); cyl(0.07, 1.7, M.steel, 0, 0.32, 0.65);
    for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 16), M.dark); t.position.set(0, 0.32, 0.15 + k * 0.28); g.add(t); }
    box(0.04, 0.03, 1.2, M.cyan, 0, 0.42, 0.55); muz.push(new THREE.Vector3(0, 0.32, 1.52));
  } else if (id === 'mine') {
    box(0.7, 0.36, 0.5, M.dark, 0, 0.22, 0); box(0.5, 0.06, 0.3, M.olive, 0, 0.42, 0); box(0.42, 0.24, 0.05, M.steel, 0, 0.18, -0.27);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.red); l.position.set(0.25, 0.42, 0.1); g.add(l); muz.push(new THREE.Vector3(0, 0.1, -0.4));
  }
  g.userData.muzzles = muz; return g;
}
// body bounds in the car's own space (ignores lamps and weapons)
const _b = new THREE.Box3(), _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function bounds(mesh) {
  const ud = mesh.userData, root = ud.customHolder || (ud.body && (ud.body.children[0] || ud.body)) || mesh; mesh.updateWorldMatrix(true, true); _inv.copy(mesh.matrixWorld).invert(); const box = new THREE.Box3();
  root.traverse(o => { if (!o.isMesh || !o.geometry || o.userData.carLights || o.userData.stockLamp || o.userData.weapon) return; if (o.parent && o.parent.userData && (o.parent.userData.weapon || o.parent.userData.carLights)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _b.copy(o.geometry.boundingBox).applyMatrix4(_m4.multiplyMatrices(_inv, o.matrixWorld)); box.union(_b); });
  return box;
}
// put (or move, or remove) the weapon on a car to match a config. Cheap when nothing changed.
export function syncWeapon(mesh, cfg) {
  const ud = mesh.userData, c = cleanWeaponCfg(cfg), key = JSON.stringify(c) + '|' + (ud.customKey || '') + '|' + (ud.model || '');
  if (ud.weaponKey === key) return ud.weaponGroup || null; ud.weaponKey = key;
  if (ud.weaponGroup) { ud.weaponGroup.parent && ud.weaponGroup.parent.remove(ud.weaponGroup); ud.weaponGroup.traverse(o => o.geometry && o.geometry.dispose()); ud.weaponGroup = null; }
  if (!c.w) return null;
  const bb = bounds(mesh); if (bb.isEmpty()) bb.set(new THREE.Vector3(-0.9, 0, -2.1), new THREE.Vector3(0.9, 1.4, 2.1));
  const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z, cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
  const grp = new THREE.Group(); grp.userData = { weapon: true, cockpit: true, guns: [] };
  const spots = c.w === 'mine' ? [[cx, bb.min.y + H * 0.3, bb.min.z + 0.15]]
    : c.m === 'hood' ? [[cx, bb.min.y + H * 0.6, bb.max.z - L * 0.24]]
      : c.m === 'twin' ? [[cx - W * 0.36, bb.max.y - 0.04, cz + L * 0.08], [cx + W * 0.36, bb.max.y - 0.04, cz + L * 0.08]]
        : [[cx, bb.max.y - 0.03, cz + L * 0.05]];
  for (const [x, y, z] of spots) { const gm = gunModel(c.w); gm.position.set(x + c.dx, y + c.dy, z + c.dz); gm.scale.setScalar(c.s * (c.m === 'twin' && c.w !== 'mine' ? 0.8 : 1)); gm.traverse(o => { o.userData.weapon = true; }); grp.add(gm); grp.userData.guns.push(gm); }
  mesh.add(grp); ud.weaponGroup = grp; return grp;
}

// ---------- shots, projectiles and explosions ----------
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const BMAX = 320;
export class WeaponFX {
  // ctx: { scene, groundAt(x,z), solid(x,y,z), targets() -> [{ id, x, y, z }], me() -> { x, y, z } | null, onHit(id, dmg, w), audio, ear() -> listener pos, onCopHit(dmg, w) }
  constructor(ctx) {
    this.c = ctx; this.list = []; this.cd = 0; this.burst = []; this.t = 0;
    const scene = ctx.scene;
    this.bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.7), new THREE.MeshBasicMaterial({ color: '#ffe4a0', toneMapped: false }), BMAX);
    this.bullets.count = 0; this.bullets.frustumCulled = false; this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.bullets);
    const rg = new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8); rg.rotateX(Math.PI / 2); const nose = new THREE.ConeGeometry(0.09, 0.25, 8); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 0.57);
    this.rocketGeo = rg; this.noseGeo = nose; this.rocketMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.6, roughness: 0.35 });
    this.flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.puffMat = new THREE.MeshBasicMaterial({ color: '#d9d9d9', transparent: true, opacity: 0.5, depthWrite: false });
    this.puffGeo = new THREE.SphereGeometry(0.35, 6, 5); this.boomGeo = new THREE.SphereGeometry(1, 14, 10);
    this.beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8, 1, true); this.beamGeo.rotateX(Math.PI / 2); this.beamGeo.translate(0, 0, 0.5);
    this.mineGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.16, 14); this.mineMat = new THREE.MeshStandardMaterial({ color: '#30353b', metalness: 0.7, roughness: 0.4 });
    this.group = new THREE.Group(); scene.add(this.group);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1); this._s = new THREE.Vector3(1, 1, 1); this._d = new THREE.Vector3();
  }
  // how loud something at (x, y, z) is for us (0..1), from the listener's distance
  vol(x, y, z, far = 320) { let e = null; try { e = this.c.ear ? this.c.ear() : this.c.me(); } catch { } if (!e) return 0.6; const d = Math.hypot(x - e.x, y - e.y, z - e.z); const k = Math.max(0, 1 - d / far); return k * k; }
  // a police car shooting at us: o = muzzle position, dir = aim, dmgK scales the damage
  copFire(wid, o, dir, vx = 0, vz = 0, dmgK = 1) {
    const d = dir.clone().normalize();
    this.spawn({ w: wid, x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z, vx, vz, n: (Math.random() * 1e9) | 0, k: 1 }, false, null, dmgK);
  }
  // world position of each muzzle of the gun(s) on a car mesh
  muzzles(mesh) {
    const g = mesh.userData.weaponGroup; if (!g) return []; const out = [];
    for (const gun of g.userData.guns) for (const m of gun.userData.muzzles) { const p = m.clone(); gun.localToWorld(p); out.push(p); }
    return out;
  }
  // try to fire the local player's weapon. Returns a shot description to share with others (or null)
  fire(w, mesh, car, pitch, aim) {
    if (this.cd > 0 || !w) return null; const mz = this.muzzles(mesh); if (!mz.length) return null;
    this.cd = w.cd;
    const yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), seed = (Math.random() * 1e9) | 0;
    let dir = new THREE.Vector3(fx * Math.cos(pitch), Math.sin(pitch), fz * Math.cos(pitch));
    if (w.id === 'mine') dir.set(-fx, 0, -fz);
    else if (aim) { const o = mz[0], t = aim; const lead = w.speed ? o.distanceTo(t.p) / (w.speed + Math.max(0, car.speed || 0)) : 0; const tp = t.p.clone().addScaledVector(t.v, lead); const d = tp.sub(o); if (d.lengthSq() > 1) dir = d.normalize(); }
    const shot = { w: w.id, x: mz.reduce((a, p) => a + p.x, 0) / mz.length, y: mz.reduce((a, p) => a + p.y, 0) / mz.length, z: mz.reduce((a, p) => a + p.z, 0) / mz.length, dx: dir.x, dy: dir.y, dz: dir.z, vx: car.vx || 0, vz: car.vz || 0, n: seed, k: mz.length };
    this.spawn(shot, true, mz);
    return shot;
  }
  // create the projectiles of a shot (own = fired by this player: it can hurt others)
  spawn(s, own, mzList = null, cop = 0) {
    const w = weaponById(s.w); if (!w) return; const R = rng(s.n), A = this.c.audio;
    const muzzles = mzList || (s.k > 1 ? [-1, 1].map(sd => new THREE.Vector3(s.x - s.dz * 0.6 * sd, s.y, s.z + s.dx * 0.6 * sd)) : [new THREE.Vector3(s.x, s.y, s.z)]);
    const base = new THREE.Vector3(s.dx, s.dy, s.dz).normalize();
    const jit = (sp) => { const v = base.clone(); v.x += (R() - 0.5) * 2 * sp; v.y += (R() - 0.5) * 2 * sp * 0.6; v.z += (R() - 0.5) * 2 * sp; return v.normalize(); };
    try { if (A && A.gun) A.gun(w.id, own ? 1 : this.vol(s.x, s.y, s.z)); } catch { }
    if (w.id === 'rail') {
      const o = muzzles[0], d = base.clone(); let len = w.range, hit = null;
      if (own) { let best = w.range; for (const t of this.c.targets()) { const tp = new THREE.Vector3(t.x, t.y + 0.7, t.z), rel = tp.clone().sub(o), along = rel.dot(d); if (along < 0 || along > best) continue; if (rel.addScaledVector(d, -along).length() < (t.r || 2.2)) { best = along; hit = t; } } len = best; if (hit) this.c.onHit(hit.id, w.dmg, w.id, hit); }
      else { const me = this.c.me(); if (me) { const rel = new THREE.Vector3(me.x - o.x, me.y + 0.7 - o.y, me.z - o.z), along = rel.dot(d); if (along > 0 && along < len && rel.addScaledVector(d, -along).length() < 2.2) len = along; } }
      for (let k = 2; k < len; k += 2) { const p = o.clone().addScaledVector(d, k); if (p.y < this.c.groundAt(p.x, p.z) - 0.2 || this.c.solid(p.x, p.y, p.z)) { len = k; break; } }
      const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: '#7ff6ff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      beam.position.copy(o); beam.lookAt(o.clone().add(d)); beam.scale.set(1, 1, len); this.group.add(beam);
      this.list.push({ kind: 'beam', mesh: beam, life: 0.35, max: 0.35 }); this.boom(o.clone().addScaledVector(d, len), 1.2, '#9ff8ff');
      return;
    }
    if (w.id === 'mine') {
      const o = muzzles[0], y = this.c.groundAt(o.x, o.z) + 0.08, m = new THREE.Mesh(this.mineGeo, this.mineMat); m.position.set(o.x, y, o.z); this.group.add(m);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false })); led.position.y = 0.12; m.add(led);
      this.list.push({ kind: 'mine', mesh: m, led, x: o.x, y, z: o.z, life: w.life, arm: 1.0, own, w }); return;
    }
    const n = w.id === 'shot' ? w.pellets : 1;
    for (const o of muzzles) for (let i = 0; i < n; i++) {
      const d = jit(w.spread || 0), sp = w.speed, p = { kind: w.id === 'rocket' ? 'rocket' : 'bullet', x: o.x, y: o.y, z: o.z, vx: d.x * sp + s.vx, vy: d.y * sp, vz: d.z * sp + s.vz, life: w.life * (0.85 + R() * 0.3), own, w, cop };
      if (p.kind === 'rocket') { const m = new THREE.Group(); m.add(new THREE.Mesh(this.rocketGeo, this.rocketMat), new THREE.Mesh(this.noseGeo, this.rocketMat)); const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8), this.flameMat); f.rotation.x = -Math.PI / 2; f.position.z = -0.75; m.add(f); m.position.set(o.x, o.y, o.z); this.group.add(m); p.mesh = m; p.puffT = 0; }
      this.list.push(p);
    }
    if (w.id === 'mg' || w.id === 'shot') for (const o of muzzles) this.flash(o, w.id === 'shot' ? 0.7 : 0.35);
  }
  flash(p, s) { const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.position.copy(p); m.scale.setScalar(s * 0.4); this.group.add(m); this.list.push({ kind: 'fx', mesh: m, life: 0.06, max: 0.06, s0: s * 0.4, s1: s }); }
  boom(p, s, col = '#ff9a3c') {
    const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(p); this.group.add(m); this.list.push({ kind: 'fx', mesh: m, life: 0.45, max: 0.45, s0: s * 0.3, s1: s });
    for (let i = 0; i < Math.min(8, 3 + s * 1.2); i++) { const q = new THREE.Mesh(this.puffGeo, this.puffMat.clone()); q.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * s, Math.random() * s * 0.6, (Math.random() - 0.5) * s)); q.material.color.set('#4a4744'); this.group.add(q); this.list.push({ kind: 'puff', mesh: q, life: 1.4, max: 1.4, vy: 1.5 + Math.random() * 1.5, s: 0.8 + s * 0.35 }); }
  }
  // damage everyone near a blast (only for our own shots)
  splash(x, y, z, w, own, direct = null, cop = 0) {
    this.boom(new THREE.Vector3(x, y, z), w.splash ? w.splash * 0.55 : 1, '#ff8a2a'); try { this.c.audio && this.c.audio.boom && this.c.audio.boom(w.splash ? w.splash / 7 : 0.6, this.vol(x, y, z, 450)); } catch { }
    if (cop) { const me = this.c.me(); if (me && this.c.onCopHit) { const d = Math.hypot(me.x - x, me.y + 0.6 - y, me.z - z); if (direct || d < (w.splash || 0)) this.c.onCopHit(cop * (direct ? w.dmg : w.dmg * Math.max(0.25, 1 - d / w.splash)), w.id); } return; }
    if (!own) return;
    for (const t of this.c.targets()) { if (t.weak && t !== direct) continue; const d = Math.hypot(t.x - x, t.y + 0.6 - y, t.z - z); if (t === direct || d < (w.splash || 0)) this.c.onHit(t.id, t === direct ? w.dmg : w.dmg * Math.max(0.25, 1 - d / w.splash), w.id, t); }
  }
  update(dt) {
    this.t += dt; this.cd = Math.max(0, this.cd - dt); let nb = 0; const M = this._m, targets = this.c.targets(), me = this.c.me();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.life -= dt; let dead = p.life <= 0;
      if (p.kind === 'bullet' || p.kind === 'rocket') {
        const ox = p.x, oy = p.y, oz = p.z; if (p.kind === 'rocket') p.vy -= 1.5 * dt; else p.vy -= 4 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        // hit a car? (segment against a sphere around each car)
        let hit = null; const cand = p.own ? targets : (me ? [{ id: '__me', ...me }] : []);
        for (const t of cand) { const ax = t.x - ox, ay = t.y + 0.7 - oy, az = t.z - oz, sx = p.x - ox, sy = p.y - oy, sz = p.z - oz, l2 = sx * sx + sy * sy + sz * sz || 1, k = Math.max(0, Math.min(1, (ax * sx + ay * sy + az * sz) / l2)); if (Math.hypot(ax - sx * k, ay - sy * k, az - sz * k) < (t.r || (p.kind === 'rocket' ? 2.2 : 1.9))) { hit = t; break; } }
        const ground = p.y < this.c.groundAt(p.x, p.z) - 0.1, wall = !hit && this.c.solid(p.x, p.y, p.z);
        if (hit || ground || wall || dead) {
          if (p.kind === 'rocket') this.splash(p.x, p.y, p.z, p.w, p.own, hit && (hit.id !== '__me' || p.cop) ? hit : null, p.cop);
          else { if (hit && p.own && hit.id !== '__me') this.c.onHit(hit.id, p.w.dmg, p.w.id, hit); if (hit && p.cop && hit.id === '__me' && this.c.onCopHit) this.c.onCopHit(p.w.dmg * p.cop, p.w.id); if (hit || ground || wall) this.flash(new THREE.Vector3(p.x, p.y, p.z), 0.35); }
          dead = true;
        } else if (p.kind === 'bullet' && nb < BMAX) {
          this._v.set(p.vx, p.vy, p.vz).normalize(); this._q.setFromUnitVectors(this._z, this._v); this._d.set(p.x, p.y, p.z); M.compose(this._d, this._q, this._s); this.bullets.setMatrixAt(nb++, M);
        }
        if (p.mesh) { if (dead) { this.group.remove(p.mesh); } else { p.mesh.position.set(p.x, p.y, p.z); p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz); p.puffT -= dt; if (p.puffT <= 0) { p.puffT = 0.03; const q = new THREE.Mesh(this.puffGeo, this.puffMat.clone()); q.position.set(p.x, p.y, p.z); q.scale.setScalar(0.5); this.group.add(q); this.list.push({ kind: 'puff', mesh: q, life: 0.9, max: 0.9, vy: 0.6, s: 1.6 }); } } }
      } else if (p.kind === 'mine') {
        p.arm -= dt; p.led.visible = (this.t * 3) % 1 < 0.5;
        if (p.arm <= 0) { const cand = p.own ? targets : (me ? [{ id: '__me', ...me }] : []); for (const t of cand) if (Math.hypot(t.x - p.x, t.z - p.z) < 3.4 && Math.abs(t.y - p.y) < 3) { this.splash(p.x, p.y + 0.4, p.z, p.w, p.own, t.id !== '__me' ? t : null); dead = true; break; } }
        if (dead) this.group.remove(p.mesh);
      } else if (p.kind === 'beam') { p.mesh.material.opacity = 0.95 * (p.life / p.max); p.mesh.scale.x = p.mesh.scale.y = 0.4 + p.life / p.max; if (dead) { this.group.remove(p.mesh); p.mesh.material.dispose(); } }
      else if (p.kind === 'fx') { const k = 1 - p.life / p.max; p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * k); p.mesh.material.opacity = 0.95 * (1 - k); if (dead) { this.group.remove(p.mesh); p.mesh.material.dispose(); } }
      else if (p.kind === 'puff') { const k = 1 - p.life / p.max; p.mesh.position.y += p.vy * dt; p.mesh.scale.setScalar(0.4 + p.s * k); p.mesh.material.opacity = 0.45 * (1 - k); if (dead) { this.group.remove(p.mesh); p.mesh.material.dispose(); } }
      if (dead) this.list.splice(i, 1);
    }
    this.bullets.count = nb; this.bullets.instanceMatrix.needsUpdate = true;
    if (this.list.length > 600) for (const p of this.list.splice(0, this.list.length - 600)) if (p.mesh) this.group.remove(p.mesh);
  }
  clear() { for (const p of this.list) if (p.mesh) this.group.remove(p.mesh); this.list = []; this.bullets.count = 0; }
}
