import * as THREE from 'three';

// Animated billboard pedestrians on footways, with roadside fallback spawning.
const MAX_PEOPLE = 28;
const MAX_PUDDLES = 40;
const SPAWN_NEAR = 35;
const SPAWN_FAR = 220;
const DESPAWN = 280;
const HIT_RADIUS = 1.85;
const WALK_SPEED = 1.15;
const LOCAL_ROADS = new Set([
  'residential', 'living_street', 'service', 'unclassified',
  'tertiary', 'secondary',
]);

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function makePersonFrames() {
  const frames = [];
  const size = 128;
  const colors = [
    { body: '#2c3e5a', pants: '#1a2436', hair: '#1a1a1a' },
    { body: '#5a3a2c', pants: '#2e2218', hair: '#3b2a1a' },
    { body: '#2e4a3a', pants: '#1a2e24', hair: '#222' },
    { body: '#4a2c4a', pants: '#2a1a2a', hair: '#111' },
    { body: '#3a4a5a', pants: '#222a33', hair: '#4a3a2a' },
    { body: '#5a4a2c', pants: '#2e2818', hair: '#1a1a1a' },
  ];
  for (const c of colors) {
    const variant = [];
    for (let f = 0; f < 4; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const x = canvas.getContext('2d');
      if (!x) throw new Error('Pedestrians require a 2D canvas context');
      const legL = Math.sin(f * Math.PI / 2) * 10;
      const legR = Math.sin(f * Math.PI / 2 + Math.PI) * 10;
      const armL = Math.sin(f * Math.PI / 2 + Math.PI) * 8;
      const armR = Math.sin(f * Math.PI / 2) * 8;
      const bob = Math.abs(Math.sin(f * Math.PI / 2)) * 2;
      const cx = size / 2, cy = size * 0.62 - bob;
      x.strokeStyle = c.pants;
      x.lineWidth = 10;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(cx - 4, cy + 8);
      x.lineTo(cx - 8 + legL * 0.3, cy + 38 + Math.abs(legL) * 0.15);
      x.stroke();
      x.beginPath();
      x.moveTo(cx + 4, cy + 8);
      x.lineTo(cx + 8 + legR * 0.3, cy + 38 + Math.abs(legR) * 0.15);
      x.stroke();
      x.fillStyle = c.body;
      x.beginPath();
      if (typeof x.roundRect === 'function') x.roundRect(cx - 12, cy - 22, 24, 34, 6);
      else x.rect(cx - 12, cy - 22, 24, 34);
      x.fill();
      x.strokeStyle = c.body;
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(cx - 12, cy - 12);
      x.lineTo(cx - 22 + armL * 0.4, cy + 6 + armL * 0.2);
      x.stroke();
      x.beginPath();
      x.moveTo(cx + 12, cy - 12);
      x.lineTo(cx + 22 + armR * 0.4, cy + 6 + armR * 0.2);
      x.stroke();
      x.fillStyle = '#e8c4a0';
      x.beginPath();
      x.arc(cx, cy - 32, 11, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = c.hair;
      x.beginPath();
      x.ellipse(cx, cy - 36, 12, 8, 0, Math.PI, 0);
      x.fill();
      x.fillStyle = '#1a1a1a';
      x.beginPath();
      x.ellipse(cx - 8 + legL * 0.3, cy + 40 + Math.abs(legL) * 0.15, 7, 3.5, 0, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.ellipse(cx + 8 + legR * 0.3, cy + 40 + Math.abs(legR) * 0.15, 7, 3.5, 0, 0, Math.PI * 2);
      x.fill();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      variant.push(tex);
    }
    frames.push(variant);
  }
  return frames;
}

function makePuddleTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const x = canvas.getContext('2d');
  if (!x) throw new Error('Pedestrians require a 2D canvas context');
  const r = rng(42);
  const cx = size / 2, cy = size / 2;
  const g = x.createRadialGradient(cx, cy, 4, cx, cy, size * 0.48);
  g.addColorStop(0, 'rgba(160, 12, 18, 0.95)');
  g.addColorStop(0.35, 'rgba(120, 8, 14, 0.85)');
  g.addColorStop(0.7, 'rgba(80, 5, 10, 0.55)');
  g.addColorStop(1, 'rgba(40, 0, 5, 0)');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const rad = size * 0.38 * (0.75 + r() * 0.35);
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
  x.fill();
  for (let i = 0; i < 7; i++) {
    const bx = cx + (r() - 0.5) * size * 0.5;
    const by = cy + (r() - 0.5) * size * 0.5;
    const br = 4 + r() * 10;
    const bg = x.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, 'rgba(90, 5, 8, 0.7)');
    bg.addColorStop(1, 'rgba(40, 0, 5, 0)');
    x.fillStyle = bg;
    x.beginPath();
    x.arc(bx, by, br, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _personFrames = null, _puddleTex = null;
function shared() {
  if (!_personFrames) _personFrames = makePersonFrames();
  if (!_puddleTex) _puddleTex = makePuddleTexture();
  return { frames: _personFrames, puddle: _puddleTex };
}

export class PedestrianSystem {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.people = [];
    this.puddles = [];
    this.spawnT = 0;
    this.enabled = true;
    this.onHit = null;
    this._noCandidatesWarned = false;
  }

  _removePerson(p) {
    if (p.sprite.parent) p.sprite.parent.remove(p.sprite);
    p.mat.dispose();
  }

  _removePuddle(d) {
    if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
    d.mat.dispose();
    d.mesh.geometry.dispose();
  }

  clear() {
    for (const p of this.people) this._removePerson(p);
    for (const d of this.puddles) this._removePuddle(d);
    this.people.length = 0;
    this.puddles.length = 0;
    this.spawnT = 0;
    this._noCandidatesWarned = false;
  }

  _isWalk(s) {
    if (!s) return false;
    if (s.walk) return true;
    if (s.bridge || s.tunnel) return false;
    return LOCAL_ROADS.has(s.type);
  }

  _spawn(player) {
    if (this.people.length >= MAX_PEOPLE) return;
    const cells = this.world.roadCells;
    if (!cells || !cells.size) return;
    const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24);
    const n = Math.ceil(SPAWN_FAR / 24) + 1;
    const candidates = [], seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) {
      for (let j = cj - n; j <= cj + n; j++) {
        for (const s of cells.get(i + ',' + j) || []) {
          if (seen.has(s)) continue;
          seen.add(s);
          if (!this._isWalk(s)) continue;
          const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
          if (!Number.isFinite(len) || len < 4) continue;
          const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
          const t = Math.max(0, Math.min(1,
            ((player.x - s.x0) * dx + (player.z - s.z0) * dz) / (len * len)));
          const d = Math.hypot(s.x0 + dx * t - player.x, s.z0 + dz * t - player.z);
          if (d > SPAWN_FAR + 20) continue;
          candidates.push({ s, len, d });
        }
      }
    }
    if (!candidates.length) {
      if (!this._noCandidatesWarned) {
        this._noCandidatesWarned = true;
        console.warn('[overpass] pedestrians: no eligible footways or local roads nearby',
          { nearbyTypes: [...new Set([...seen].map(s => s.type))] });
      }
      return;
    }
    candidates.sort((a, b) => a.d - b.d);
    const S = shared();
    for (let attempt = 0; attempt < 18; attempt++) {
      const { s, len } = candidates[Math.floor(Math.random() * candidates.length)];
      const t = 0.1 + Math.random() * 0.8;
      const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
      const hw = Number.isFinite(s.hw) ? Math.max(0, s.hw) : 3;
      const offset = s.walk ? Math.min(0.6, hw * 0.35) : hw + 0.85;
      const side = (Math.random() < 0.5 ? 1 : -1) * offset;
      const x = s.x0 + (s.x1 - s.x0) * t + dz * side;
      const z = s.z0 + (s.z1 - s.z0) * t - dx * side;
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < SPAWN_NEAR || d > SPAWN_FAR) continue;
      if (this.people.some(p => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      if (this.world.water && typeof this.world.water.inside === 'function' &&
          !s.bridge && this.world.water.inside(x, z)) continue;
      const y = this._height(s, t, x, z);
      if (!Number.isFinite(y)) continue;
      const variant = Math.floor(Math.random() * S.frames.length);
      const mat = new THREE.SpriteMaterial({
        map: S.frames[variant][0], transparent: true,
        depthWrite: false, alphaTest: 0.3, fog: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.35, 1.9, 1);
      sprite.position.set(x, y + 0.95, z);
      sprite.renderOrder = 2;
      this.scene.add(sprite);
      this.people.push({
        sprite, mat, variant, frame: 0, frameT: Math.random(),
        x, z, y, seg: s, t, side,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: WALK_SPEED * (0.75 + Math.random() * 0.5),
        bobPhase: Math.random() * Math.PI * 2, alive: true,
      });
      return;
    }
  }

  _height(s, t, x, z) {
    if (s.bridge && Number.isFinite(s.y0) && Number.isFinite(s.y1)) {
      return s.y0 + (s.y1 - s.y0) * t;
    }
    return this.world.heightAt ? this.world.heightAt(x, z) : 0;
  }

  _hit(p, player) {
    const S = shared();
    const size = 1.6 + Math.random() * 1.4;
    const mat = new THREE.MeshBasicMaterial({
      map: S.puddle, transparent: true, opacity: 0.92,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, p.y + 0.04, p.z);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.puddles.push({
      mesh, mat, life: 18 + Math.random() * 12, fade: 0, age: 0,
      seg: p.seg, t: p.t,
    });
    this._removePerson(p);
    p.alive = false;
    if (typeof this.onHit === 'function') this.onHit(p.x, p.z);
  }

  update(dt, player) {
    if (!this.enabled || !player || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.55 + Math.random() * 0.7;
      if (this.people.length < MAX_PEOPLE) this._spawn(player);
    }
    const S = shared();
    const px = player.x, pz = player.z, py = player.y || 0;
    const speed = Math.hypot(player.vx || 0, player.vz || 0);
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (Math.hypot(p.x - px, p.z - pz) > DESPAWN) {
        this._removePerson(p);
        this.people.splice(i, 1);
        continue;
      }
      const s = p.seg;
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) || 1;
      p.t += p.speed * p.dir * dt / len;
      if (p.t > 0.92 || p.t < 0.08) {
        p.dir *= -1;
        p.t = Math.max(0.08, Math.min(0.92, p.t));
      }
      const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
      p.x = s.x0 + (s.x1 - s.x0) * p.t + dz * p.side;
      p.z = s.z0 + (s.z1 - s.z0) * p.t - dx * p.side;
      const y = this._height(s, p.t, p.x, p.z);
      if (Number.isFinite(y)) p.y = y;
      p.bobPhase += dt * 8;
      p.sprite.position.set(p.x, p.y + 0.95 + Math.sin(p.bobPhase) * 0.04, p.z);
      p.frameT += dt * (p.speed / WALK_SPEED) * 5.5;
      while (p.frameT >= 1) {
        p.frameT -= 1;
        p.frame = (p.frame + 1) % 4;
        p.mat.map = S.frames[p.variant][p.frame];
      }
      if (Math.hypot(p.x - px, p.z - pz) < HIT_RADIUS &&
          Math.abs(py - p.y) < 2.2 && speed > 1.5) {
        this._hit(p, player);
        this.people.splice(i, 1);
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const d = this.puddles[i];
      d.age += dt;
      if (d.age > d.life) {
        d.fade += dt * 0.35;
        d.mat.opacity = Math.max(0, 0.92 * (1 - d.fade));
        if (d.fade >= 1) {
          this._removePuddle(d);
          this.puddles.splice(i, 1);
          continue;
        }
      }
      const y = this._height(d.seg, d.t, d.mesh.position.x, d.mesh.position.z);
      if (Number.isFinite(y)) d.mesh.position.y = y + 0.04;
    }
    while (this.puddles.length > MAX_PUDDLES) this._removePuddle(this.puddles.shift());
  }
}
