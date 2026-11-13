import * as THREE from 'three';

// Mixed pedestrian designs; compatible with PedestrianSystem(scene, world).
const MAX_PEOPLE = 28, MAX_PUDDLES = 40;
const SPAWN_NEAR = 35, SPAWN_FAR = 220, DESPAWN = 280;
const WALK_SPEED = 1.15, HIT_RADIUS = 1.85;
const LOCAL_ROADS = new Set(['residential', 'living_street', 'service', 'unclassified', 'tertiary', 'secondary']);
const SKIN = ['#f3d2b4', '#e2b48d', '#c68c60', '#a46c47', '#784b33', '#503326'];
const HAIR = ['#181615', '#38261f', '#70503a', '#b88748', '#d9c181', '#a9a4a0', '#813b27'];
const CLOTHES = ['#294d70', '#973f4d', '#38705a', '#785587', '#cf9444', '#4b7076', '#b66e59', '#d2c4a6', '#41464f', '#75954e'];
const PANTS = ['#25374a', '#27252a', '#625247', '#3b4945', '#62687b'];
const pick = (a, random = Math.random) => a[Math.floor(random() * a.length)];
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
function canvas() {
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const x = c.getContext('2d');
  if (!x) throw new Error('Pedestrian canvas unavailable');
  return { c, x };
}
function texture(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function ellipse(x, color, cx, cy, rx, ry) {
  x.fillStyle = color; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
}
function line(x, color, width, ax, ay, bx, by) {
  x.strokeStyle = color; x.lineWidth = width; x.lineCap = 'round';
  x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
}
function round(x, color, a, b, w, h, r = 5) {
  x.fillStyle = color; x.beginPath();
  if (typeof x.roundRect === 'function') x.roundRect(a, b, w, h, r);
  else x.rect(a, b, w, h);
  x.fill();
}
function personFrames(d) {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const { c, x } = canvas();
    const swing = Math.sin(f * Math.PI / 2), bob = Math.abs(swing) * 2;
    const cx = 96, headY = 44 - bob, shoulderY = 66 - bob;
    const waist = 110 - bob, feet = 178, w = d.broad ? 21 : 16;
    const leftFoot = cx - 10 + swing * 10, rightFoot = cx + 10 - swing * 10;
    // Back hair is drawn behind shoulders and face.
    if (d.hair === 'long') round(x, d.hairColor, cx - 20, headY - 15, 40, 59, 14);
    if (d.hair === 'ponytail') {
      ellipse(x, d.hairColor, cx + 17, headY + 5, 10, 15);
      line(x, d.hairColor, 12, cx + 20, headY + 9, cx + 25, headY + 35);
    }
    if (d.bag === 'backpack') round(x, d.bagColor, cx - w - 8, shoulderY + 2, w * 2 + 16, 43, 9);
    const legTop = d.outfit === 'dress' ? waist + 29 : waist;
    line(x, d.outfit === 'dress' || d.outfit === 'shorts' ? d.skin : d.pants, 12, cx - 8, legTop, leftFoot, feet - 6);
    line(x, d.outfit === 'dress' || d.outfit === 'shorts' ? d.skin : d.pants, 12, cx + 8, legTop, rightFoot, feet - 6);
    if (d.outfit === 'shorts') {
      line(x, d.pants, 16, cx - 8, waist - 3, cx - 10 + swing * 3, waist + 25);
      line(x, d.pants, 16, cx + 8, waist - 3, cx + 10 - swing * 3, waist + 25);
    }
    ellipse(x, d.shoes, leftFoot - 2, feet - 2, 11, 5);
    ellipse(x, d.shoes, rightFoot + 2, feet - 2, 11, 5);
    if (d.outfit === 'dress') {
      x.fillStyle = d.top; x.beginPath();
      x.moveTo(cx - w + 3, shoulderY); x.lineTo(cx + w - 3, shoulderY);
      x.lineTo(cx + w + 11 + swing * 2, waist + 35);
      x.lineTo(cx - w - 11 + swing * 2, waist + 35); x.closePath(); x.fill();
      round(x, d.accent, cx - w - 1, waist - 8, w * 2 + 2, 5, 1);
    } else {
      round(x, d.top, cx - w, shoulderY, w * 2, waist - shoulderY + 9, 7);
      if (d.outfit === 'jacket') {
        line(x, d.accent, 3, cx, shoulderY + 4, cx, waist + 6);
        round(x, d.accent, cx - w + 4, waist - 6, 8, 3, 1);
        round(x, d.accent, cx + w - 12, waist - 6, 8, 3, 1);
      }
    }
    if (d.pattern === 'stripes') {
      for (let y = shoulderY + 14; y < waist - 5; y += 10)
        line(x, d.accent, 3, cx - w + 4, y, cx + w - 4, y);
    }
    const leftHand = cx - w - 9 - swing * 7, rightHand = cx + w + 9 + swing * 7;
    const handY = waist + 6;
    line(x, d.top, 11, cx - w + 2, shoulderY + 7, cx - w - 7, shoulderY + 27);
    line(x, d.skin, 8, cx - w - 7, shoulderY + 27, leftHand, handY);
    line(x, d.top, 11, cx + w - 2, shoulderY + 7, cx + w + 7, shoulderY + 27);
    line(x, d.skin, 8, cx + w + 7, shoulderY + 27, rightHand, handY);
    line(x, d.skin, 10, cx, headY + 10, cx, shoulderY + 3);
    ellipse(x, d.skin, cx, headY, 15, 19);
    if (d.hair === 'curly') {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + i * Math.PI / 6;
        ellipse(x, d.hairColor, cx + Math.cos(a) * 15, headY - 6 + Math.sin(a) * 13, 8, 8);
      }
    } else if (d.hair !== 'bald') {
      ellipse(x, d.hairColor, cx, headY - 12, 16, 9);
      round(x, d.hairColor, cx - 16, headY - 11, 7, 17, 3);
      if (d.hair === 'long') round(x, d.hairColor, cx + 10, headY - 10, 8, 35, 4);
    }
    if (d.hat === 'cap') {
      round(x, d.hatColor, cx - 17, headY - 23, 34, 14, 7);
      round(x, d.hatColor, cx - 18, headY - 12, 45, 5, 2);
    } else if (d.hat === 'beanie') {
      ellipse(x, d.hatColor, cx, headY - 17, 18, 14);
      round(x, d.accent, cx - 18, headY - 13, 36, 7, 2);
      ellipse(x, d.hatColor, cx, headY - 32, 5, 5);
    } else if (d.hat === 'sunhat') {
      round(x, d.hatColor, cx - 14, headY - 27, 28, 18, 5);
      ellipse(x, d.hatColor, cx, headY - 9, 30, 5);
      round(x, d.accent, cx - 14, headY - 15, 28, 4, 1);
    }
    if (d.glasses) {
      round(x, '#252931', cx - 13, headY - 1, 11, 6, 2);
      round(x, '#252931', cx + 2, headY - 1, 11, 6, 2);
      line(x, '#252931', 2, cx - 2, headY + 1, cx + 2, headY + 1);
    }
    if (d.bag === 'purse') {
      line(x, d.bagColor, 3, cx - w + 3, shoulderY + 2, cx + w + 9, waist + 12);
      round(x, d.bagColor, cx + w - 2, waist + 7, 23, 22, 5);
      round(x, d.accent, cx + w + 4, waist + 11, 11, 3, 1);
    } else if (d.bag === 'tote') {
      const bx = rightHand - 9, by = handY + 10;
      x.strokeStyle = d.bagColor; x.lineWidth = 3; x.beginPath();
      x.ellipse(rightHand + 2, by - 3, 7, 10, 0, Math.PI, Math.PI * 2); x.stroke();
      round(x, d.bagColor, bx, by, 23, 28, 3);
    }
    frames.push(texture(c));
  }
  return frames;
}
function puddleTexture() {
  const { c, x } = canvas(), r = rng(42);
  const g = x.createRadialGradient(96, 96, 4, 96, 96, 88);
  g.addColorStop(0, 'rgba(160,12,18,.95)');
  g.addColorStop(.4, 'rgba(120,8,14,.85)');
  g.addColorStop(.75, 'rgba(80,5,10,.55)');
  g.addColorStop(1, 'rgba(40,0,5,0)');
  x.fillStyle = g; x.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2, rad = 73 * (.75 + r() * .35);
    const px = 96 + Math.cos(a) * rad, py = 96 + Math.sin(a) * rad;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath(); x.fill(); return texture(c);
}
let designs = null, puddle = null;
function shared() {
  if (!designs) {
    const r = rng(79231);
    designs = Array.from({ length: 48 }, (_, i) => ({
      skin: pick(SKIN, r), hairColor: pick(HAIR, r),
      hair: ['short', 'long', 'ponytail', 'curly', 'bald'][i % 5],
      hat: ['none', 'cap', 'none', 'sunhat', 'none', 'beanie'][i % 6],
      hatColor: pick(CLOTHES, r), top: pick(CLOTHES, r), pants: pick(PANTS, r),
      outfit: ['trousers', 'dress', 'jacket', 'shorts'][i % 4],
      bag: ['none', 'purse', 'none', 'tote', 'backpack', 'none', 'purse'][i % 7],
      bagColor: pick(['#51362b', '#34313c', '#c3a578', '#894b42', '#405767'], r),
      accent: pick(['#eadcc0', '#d5b76b', '#36343b'], r),
      pattern: i % 5 === 0 ? 'stripes' : 'plain',
      glasses: i % 7 === 0, broad: i % 3 === 0,
      shoes: i % 4 === 0 ? '#ddd6c7' : '#22242a',
      height: 1.65 + r() * .4, width: .92 + r() * .22,
      frames: null,
    }));
  }
  return designs;
}

export class PedestrianSystem {
  constructor(scene, world, opts = {}) {
    this.scene = scene; this.world = world;
    this.people = []; this.puddles = []; this.spawnT = 0;
    this.enabled = true; this.onHit = null;
    this._noCandidatesWarned = false;
  }
  _removePerson(p) {
    if (p.sprite.parent) p.sprite.parent.remove(p.sprite);
    p.mat.dispose();
  }
  _removePuddle(d) {
    if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
    d.mat.dispose(); d.mesh.geometry.dispose();
  }
  clear() {
    for (const p of this.people) this._removePerson(p);
    for (const d of this.puddles) this._removePuddle(d);
    this.people.length = 0; this.puddles.length = 0; this.spawnT = 0;
    this._noCandidatesWarned = false;
  }
  _isWalk(s) {
    if (!s) return false;
    if (s.walk) return true;
    return !s.bridge && !s.tunnel && LOCAL_ROADS.has(s.type);
  }
  _height(s, t, x, z) {
    if (s.bridge && Number.isFinite(s.y0) && Number.isFinite(s.y1)) return s.y0 + (s.y1 - s.y0) * t;
    return this.world.heightAt ? this.world.heightAt(x, z) : 0;
  }
  _spawn(player) {
    if (this.people.length >= MAX_PEOPLE) return;
    const cells = this.world.roadCells;
    if (!cells || !cells.size) return;
    const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24);
    const n = Math.ceil(SPAWN_FAR / 24) + 1, seen = new Set(), candidates = [];
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      for (const s of cells.get(i + ',' + j) || []) {
        if (seen.has(s)) continue; seen.add(s);
        if (!this._isWalk(s)) continue;
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz);
        if (!Number.isFinite(len) || len < 4) continue;
        const t = Math.max(0, Math.min(1, ((player.x - s.x0) * dx + (player.z - s.z0) * dz) / (len * len)));
        if (Math.hypot(s.x0 + dx * t - player.x, s.z0 + dz * t - player.z) <= SPAWN_FAR + 20) candidates.push({ s, len });
      }
    }
    if (!candidates.length) {
      if (!this._noCandidatesWarned) {
        this._noCandidatesWarned = true;
        console.warn('[overpass] pedestrians: no eligible paths or local streets nearby', [...new Set([...seen].map(s => s.type))]);
      }
      return;
    }
    for (let attempt = 0; attempt < 18; attempt++) {
      const { s, len } = pick(candidates), t = .1 + Math.random() * .8;
      const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
      const hw = Number.isFinite(s.hw) ? Math.max(0, s.hw) : 3;
      const offset = s.walk ? Math.min(.6, hw * .35) : hw + .85;
      const side = (Math.random() < .5 ? 1 : -1) * offset;
      const x = s.x0 + (s.x1 - s.x0) * t + dz * side;
      const z = s.z0 + (s.z1 - s.z0) * t - dx * side;
      const dist = Math.hypot(x - player.x, z - player.z);
      if (dist < SPAWN_NEAR || dist > SPAWN_FAR) continue;
      if (this.people.some(p => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      if (!s.bridge && this.world.water && typeof this.world.water.inside === 'function' && this.world.water.inside(x, z)) continue;
      const y = this._height(s, t, x, z);
      if (!Number.isFinite(y)) continue;
      const all = shared();
      const used = new Set(this.people.map(p => p.design));
      const available = all.filter(d => !used.has(d));
      const design = pick(available.length ? available : all);
      if (!design.frames) design.frames = personFrames(design);
      const mat = new THREE.SpriteMaterial({ map: design.frames[0], transparent: true, depthWrite: false, alphaTest: .25, fog: true });
      const sprite = new THREE.Sprite(mat);
      // The artwork's feet are at pixel 181 of a 192-pixel square.
      const scale = design.height / (163 / 192);
      const lift = scale * (181 / 192 - .5);
      sprite.scale.set(scale * design.width, scale, 1);
      sprite.position.set(x, y + lift, z); sprite.renderOrder = 2;
      this.scene.add(sprite);
      this.people.push({ sprite, mat, design, lift, frame: 0, frameT: Math.random(), x, z, y, seg: s, t, side,
        dir: Math.random() < .5 ? 1 : -1, speed: WALK_SPEED * (.75 + Math.random() * .5), bobPhase: Math.random() * Math.PI * 2 });
      return;
    }
  }
  _hit(p) {
    if (!puddle) puddle = puddleTexture();
    const size = 1.6 + Math.random() * 1.4;
    const mat = new THREE.MeshBasicMaterial({ map: puddle, transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(p.x, p.y + .04, p.z); mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.puddles.push({ mesh, mat, life: 18 + Math.random() * 12, fade: 0, age: 0, seg: p.seg, t: p.t });
    this._removePerson(p);
    if (typeof this.onHit === 'function') this.onHit(p.x, p.z);
  }
  update(dt, player) {
    if (!this.enabled || !player || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05); this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = .55 + Math.random() * .7; this._spawn(player); }
    const speed = Math.hypot(player.vx || 0, player.vz || 0), py = player.y || 0;
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (Math.hypot(p.x - player.x, p.z - player.z) > DESPAWN) {
        this._removePerson(p); this.people.splice(i, 1); continue;
      }
      const s = p.seg, len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) || 1;
      p.t += p.speed * p.dir * dt / len;
      if (p.t > .92 || p.t < .08) { p.dir *= -1; p.t = Math.max(.08, Math.min(.92, p.t)); }
      p.x = s.x0 + (s.x1 - s.x0) * p.t + (s.z1 - s.z0) / len * p.side;
      p.z = s.z0 + (s.z1 - s.z0) * p.t - (s.x1 - s.x0) / len * p.side;
      const y = this._height(s, p.t, p.x, p.z); if (Number.isFinite(y)) p.y = y;
      p.bobPhase += dt * 8;
      p.sprite.position.set(p.x, p.y + p.lift + Math.sin(p.bobPhase) * .025, p.z);
      p.frameT += dt * p.speed / WALK_SPEED * 5.5;
      while (p.frameT >= 1) { p.frameT--; p.frame = (p.frame + 1) % 4; p.mat.map = p.design.frames[p.frame]; }
      if (Math.hypot(p.x - player.x, p.z - player.z) < HIT_RADIUS && Math.abs(py - p.y) < 2.2 && speed > 1.5) {
        this._hit(p); this.people.splice(i, 1);
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const d = this.puddles[i]; d.age += dt;
      if (d.age > d.life) {
        d.fade += dt * .35; d.mat.opacity = Math.max(0, .92 * (1 - d.fade));
        if (d.fade >= 1) { this._removePuddle(d); this.puddles.splice(i, 1); continue; }
      }
      const y = this._height(d.seg, d.t, d.mesh.position.x, d.mesh.position.z);
      if (Number.isFinite(y)) d.mesh.position.y = y + .04;
    }
    while (this.puddles.length > MAX_PUDDLES) this._removePuddle(this.puddles.shift());
  }
}
