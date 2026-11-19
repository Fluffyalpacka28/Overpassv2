import * as THREE from 'three';

// Party balloons around you in World Drive. Some are tied down a couple of metres off the ground (drive through them), the rest
// drift in the sky (fly into them, or shoot them). They never sit inside a boost ring. Popping one: it swells, bursts into
// rubber scraps with a little flash, the string drops, and you get points (more when you pop several in a row, lots for gold).
const COLORS = ['#ff3b5c', '#ffb020', '#3fc2ff', '#7c5cff', '#2fd17a', '#ff6ad5', '#ffe14d'];
const PTS = 15, GOLD = 120, R = 1.7; // balloon radius (m): big enough to spot from the road and from the air
const STRING = 1.1; // the string: always the same short length, just enough to read as a balloon
let rs = 777; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;

export class Balloons {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = []; this.bits = []; this.t = 0; this.spawnT = 0; this.max = 26; this.combo = 0; this.comboT = 0; this.onPop = null; this.blocked = null;
    const g = new THREE.SphereGeometry(R, 22, 16); g.scale(1, 1.18, 1); const knot = new THREE.ConeGeometry(0.22, 0.36, 8); knot.translate(0, -R * 1.18 - 0.06, 0);
    this.geo = g; this.knot = knot;
    this.mats = COLORS.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.4, transparent: true, opacity: 0.94 }));
    this.gold = new THREE.MeshPhysicalMaterial({ color: '#ffd24a', roughness: 0.15, metalness: 0.85, clearcoat: 1, emissive: '#5a3c00', emissiveIntensity: 0.4 });
    this.strMat = new THREE.LineBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.8 });
    this.bitMat = new Map([...this.mats, this.gold].map(m => { const c = m.clone(); c.side = THREE.DoubleSide; c.transparent = false; return [m, c]; }));
    this.bitGeo = new THREE.PlaneGeometry(0.55, 0.4); this.flashGeo = new THREE.SphereGeometry(1, 10, 8);
  }
  setQuality(q) { this.max = q === 'low' ? 14 : 26; }
  clear() { for (const b of this.list) this.scene.remove(b.g); for (const p of this.bits) this.scene.remove(p.m); this.list = []; this.bits = []; }
  targets() { return this.list.filter(b => !b.pop).map(b => ({ id: '', npc: 'balloon', ref: b, x: b.x, y: b.y - 0.7, z: b.z, r: R * 1.25 })); }
  // a place for a new balloon: around you (a bit ahead), clear of roads for the low ones, never inside a ring
  spawn(P) {
    for (let k = 0; k < 8; k++) {
      const ang = (P.yaw || 0) + (rnd() - 0.5) * 4.2, d = 60 + rnd() * 260, x = P.x + Math.sin(ang) * d, z = P.z + Math.cos(ang) * d;
      const gy = this.world.heightAt(x, z), low = rnd() < 0.45, wet = this.world.water.inside(x, z);
      let y = low && !wet ? gy + R * 1.18 + 0.8 + rnd() * 0.6 : gy + 12 + rnd() * rnd() * 90; // tied ones hang low enough to drive into
      if (P.fly && !low) y = Math.max(y, (P.y || 0) + (rnd() - 0.5) * 40);
      if (this.world.onRoad && this.world.onRoad(x, z, R + 2.5)) continue;          // never over a street
      if (this.world.collide(x, z, R + 1, y - R)) continue;
      if (this.blocked && this.blocked(x, y, z, 16)) continue;
      if (this.list.some(b => Math.hypot(b.x - x, b.y - y, b.z - z) < 10)) continue;
      const gold = rnd() < 0.06, mat = gold ? this.gold : this.mats[Math.floor(rnd() * this.mats.length)];
      const g = new THREE.Group(), body = new THREE.Mesh(this.geo, mat), kn = new THREE.Mesh(this.knot, mat); body.castShadow = true; g.add(body, kn);
      const sl = STRING, sg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.3) * 0.08, -R * 1.18 - 0.15 - i / 5 * sl, Math.cos(i * 1.1) * 0.08)));
      const str = new THREE.Line(sg, this.strMat); g.add(str);
      g.position.set(x, y, z); this.scene.add(g);
      this.list.push({ g, body, str, x, y, z, y0: y, low, gold, ph: rnd() * 6.28, pop: 0, mat }); return;
    }
  }
  pop(b, by) {
    if (b.pop) return; b.pop = 0.0001;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 3;
    const pts = b.gold ? GOLD : PTS * Math.min(this.combo, 5);
    // rubber scraps flying off + a quick flash
    const n = 14, col = this.bitMat.get(b.gold ? this.gold : b.mat);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.bitGeo, col); m.position.set(b.x, b.y, b.z); const a = rnd() * 6.28, e = (rnd() - 0.3) * 2.4, sp = 6 + rnd() * 9;
      m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); this.scene.add(m);
      this.bits.push({ m, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * Math.cos(e) * sp, sx: (rnd() - 0.5) * 20, sy: (rnd() - 0.5) * 20, life: 0.9 + rnd() * 0.5, age: 0 });
    }
    const f = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ color: '#fffbe8', transparent: true, opacity: 0.9, depthWrite: false })); f.position.set(b.x, b.y, b.z); this.scene.add(f); this.bits.push({ m: f, flash: true, age: 0, life: 0.18 });
    this.onPop && this.onPop(b, pts, this.combo, by);
  }
  update(dt, P, on) {
    if (!on) { if (this.list.length || this.bits.length) this.clear(); return; }
    this.t += dt; this.spawnT -= dt; if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
    if (this.spawnT <= 0 && this.list.filter(b => !b.pop).length < this.max) { this.spawnT = 0.35; this.spawn(P); }
    const px = P.x, py = (P.y || 0) + 0.9, pz = P.z;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b.pop) { // swell, then gone (the scraps carry on)
        b.pop += dt; const k = b.pop / 0.07; b.body.scale.setScalar(1 + k * 0.35); b.str.position.y -= dt * 9;
        if (k >= 1) { this.scene.remove(b.g); this.list.splice(i, 1); } continue;
      }
      const far = Math.hypot(b.x - px, b.z - pz); if (far > 520) { this.scene.remove(b.g); this.list.splice(i, 1); continue; }
      // a ring moved in on top of it: quietly let it go
      if (this.blocked && this.blocked(b.x, b.y, b.z, 13)) { this.scene.remove(b.g); this.list.splice(i, 1); continue; }
      // bob and sway (tied ones tug at their string, free ones drift up and down)
      const sway = Math.sin(this.t * 1.3 + b.ph), sway2 = Math.cos(this.t * 0.9 + b.ph * 1.7);
      b.y = b.y0 + (b.low ? sway * 0.15 : sway * 0.8);
      const bx = b.x + sway2 * (b.low ? 0.2 : 0.6), bz = b.z + sway * (b.low ? 0.15 : 0.5);
      b.g.position.set(bx, b.y, bz); b.g.rotation.set(sway2 * 0.12, b.ph, sway * 0.12);
      // touched by you
      if (Math.hypot(bx - px, bz - pz) < R + 1.6 && Math.abs(b.y - py) < R * 1.18 + 1.1) this.pop(b, 'car');
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const p = this.bits[i]; p.age += dt; const k = p.age / p.life;
      if (p.flash) { p.m.scale.setScalar((0.6 + k * 2.2) * R); p.m.material.opacity = 0.9 * (1 - k); }
      else { p.vy -= 9 * dt; const drag = Math.exp(-dt * 2.2); p.vx *= drag; p.vz *= drag; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.rotation.x += p.sx * dt; p.m.rotation.y += p.sy * dt; p.m.scale.setScalar(Math.max(0.01, 1 - k * 0.6)); }
      if (k >= 1) { this.scene.remove(p.m); if (p.flash) p.m.material.dispose(); this.bits.splice(i, 1); }
    }
  }
}
