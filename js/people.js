import * as THREE from 'three';

// Animated billboard pedestrians on sidewalks / footways.
// When the player car hits one they turn into a red puddle on the ground.

const MAX_PEOPLE = 28;
const MAX_PUDDLES = 40;
const SPAWN_NEAR = 35;      // never spawn closer than this
const SPAWN_FAR = 220;
const DESPAWN = 280;
const HIT_RADIUS = 1.85;    // car ↔ person collision radius
const WALK_SPEED = 1.15;    // m/s along sidewalk

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// ---------- textures ----------
function makePersonFrames() {
  // 4 simple walk-cycle frames: side-view style silhouettes that read at distance
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

  for (let v = 0; v < colors.length; v++) {
    const c = colors[v];
    const variant = [];
    for (let f = 0; f < 4; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const x = canvas.getContext('2d');
      x.clearRect(0, 0, size, size);

      // walk cycle leg offsets (simple)
      const legL = Math.sin(f * Math.PI / 2) * 10;
      const legR = Math.sin(f * Math.PI / 2 + Math.PI) * 10;
      const armL = Math.sin(f * Math.PI / 2 + Math.PI) * 8;
      const armR = Math.sin(f * Math.PI / 2) * 8;
      const bob = Math.abs(Math.sin(f * Math.PI / 2)) * 2;

      const cx = size / 2, cy = size * 0.62 - bob;

      // legs
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

      // body
      x.fillStyle = c.body;
      x.beginPath();
      x.roundRect(cx - 12, cy - 22, 24, 34, 6);
      x.fill();

      // arms
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

      // head
      x.fillStyle = '#e8c4a0';
      x.beginPath();
      x.arc(cx, cy - 32, 11, 0, Math.PI * 2);
      x.fill();

      // hair
      x.fillStyle = c.hair;
      x.beginPath();
      x.ellipse(cx, cy - 36, 12, 8, 0, Math.PI, 0);
      x.fill();

      // shoes
      x.fillStyle = '#1a1a1a';
      x.beginPath();
      x.ellipse(cx - 8 + legL * 0.3, cy + 40 + Math.abs(legL) * 0.15, 7, 3.5, 0, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.ellipse(cx + 8 + legR * 0.3, cy + 40 + Math.abs(legR) * 0.15, 7, 3.5, 0, 0, Math.PI * 2);
      x.fill();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
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
  const r = rng(42);

  // irregular red / dark-red blood-like puddle
  const g = x.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.48);
  g.addColorStop(0, 'rgba(160, 12, 18, 0.95)');
  g.addColorStop(0.35, 'rgba(120, 8, 14, 0.85)');
  g.addColorStop(0.7, 'rgba(80, 5, 10, 0.55)');
  g.addColorStop(1, 'rgba(40, 0, 5, 0)');
  x.fillStyle = g;
  x.beginPath();
  // slightly irregular outline
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rad = size * 0.38 * (0.75 + r() * 0.35);
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
  x.fill();

  // a few darker blobs / droplets
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
  tex.needsUpdate = true;
  return tex;
}

let _personFrames = null;
let _puddleTex = null;
function shared() {
  if (!_personFrames) _personFrames = makePersonFrames();
  if (!_puddleTex) _puddleTex = makePuddleTexture();
  return { frames: _personFrames, puddle: _puddleTex };
}

// ---------- system ----------
export class PedestrianSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} world  World instance (needs roadCells, heightAt, nearbySegs)
   * @param {object} [opts]
   */
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.people = [];
    this.puddles = [];
    this.spawnT = 0;
    this.enabled = true;
    this.onHit = null; // optional callback (x, z)
  }

  clear() {
    for (const p of this.people) {
      if (p.sprite.parent) this.scene.remove(p.sprite);
      p.sprite.material.map = null;
      p.sprite.material.dispose();
    }
    this.people.length = 0;
    for (const d of this.puddles) {
      if (d.mesh.parent) this.scene.remove(d.mesh);
      d.mesh.material.dispose();
    }
    this.puddles.length = 0;
    this.spawnT = 0;
  }

  _isWalk(s) {
    return s && s.walk;
  }

  _spawn(player) {
    if (this.people.length >= MAX_PEOPLE) return;
    const S = shared();
    const cells = this.world.roadCells;
    if (!cells || !cells.size) return;

    const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24);
    const n = Math.ceil(SPAWN_FAR / 24) + 1;
    const candidates = [];

    for (let i = ci - n; i <= ci + n; i++) {
      for (let j = cj - n; j <= cj + n; j++) {
        const list = cells.get(i + ',' + j) || [];
        for (const s of list) {
          if (!this._isWalk(s)) continue;
          const mx = (s.x0 + s.x1) * 0.5, mz = (s.z0 + s.z1) * 0.5;
          const d = Math.hypot(mx - player.x, mz - player.z);
          if (d < SPAWN_NEAR || d > SPAWN_FAR) continue;
          // prefer longer segments
          const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
          if (len < 4) continue;
          candidates.push({ s, d, len });
        }
      }
    }
    if (!candidates.length) return;

    // pick a random candidate weighted a bit toward nearer ones
    candidates.sort((a, b) => a.d - b.d);
    const pick = candidates[Math.floor(Math.random() * Math.min(12, candidates.length))];
    const s = pick.s;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) || 1;
    const t = 0.15 + Math.random() * 0.7;
    const x = s.x0 + (s.x1 - s.x0) * t;
    const z = s.z0 + (s.z1 - s.z0) * t;

    // don't stack on existing people
    for (const p of this.people) {
      if (Math.hypot(p.x - x, p.z - z) < 3.5) return;
    }

    // offset a little to the side of the path (sidewalk edge feel)
    const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
    const side = (Math.random() < 0.5 ? 1 : -1) * (s.hw * 0.35 + 0.2);
    const px = x + dz * side, pz = z - dx * side;

    const y = this.world.heightAt ? this.world.heightAt(px, pz) : 0;
    const variant = Math.floor(Math.random() * S.frames.length);
    const mat = new THREE.SpriteMaterial({
      map: S.frames[variant][0],
      transparent: true,
      depthWrite: false,
      alphaTest: 0.3,
      fog: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.35, 1.9, 1);
    sprite.position.set(px, y + 0.95, pz);
    sprite.renderOrder = 2;
    this.scene.add(sprite);

    const dir = Math.random() < 0.5 ? 1 : -1;
    this.people.push({
      sprite,
      mat,
      variant,
      frame: 0,
      frameT: Math.random(),
      x: px, z: pz, y,
      seg: s,
      t,                 // 0..1 along segment
      dir,               // +1 or -1 along segment
      speed: WALK_SPEED * (0.75 + Math.random() * 0.5),
      bobPhase: Math.random() * Math.PI * 2,
      alive: true,
    });
  }

  _hit(p, player) {
    // turn into red puddle
    const S = shared();
    const size = 1.6 + Math.random() * 1.4;
    const mat = new THREE.MeshBasicMaterial({
      map: S.puddle,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const geo = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, p.y + 0.04, p.z);
    mesh.renderOrder = 1;
    this.scene.add(mesh);

    this.puddles.push({
      mesh,
      mat,
      life: 18 + Math.random() * 12, // seconds before fade starts
      fade: 0,
      age: 0,
    });

    // remove person
    if (p.sprite.parent) this.scene.remove(p.sprite);
    p.mat.dispose();
    p.alive = false;

    if (typeof this.onHit === 'function') this.onHit(p.x, p.z);
  }

  update(dt, player) {
    if (!this.enabled || !player) return;
    dt = Math.min(dt, 0.05);

    // spawn periodically
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.55 + Math.random() * 0.7;
      if (this.people.length < MAX_PEOPLE) this._spawn(player);
    }

    const S = shared();
    const px = player.x, pz = player.z;
    const py = player.y || 0;
    const speed = Math.hypot(player.vx || 0, player.vz || 0);

    // update people
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (!p.alive) {
        this.people.splice(i, 1);
        continue;
      }

      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > DESPAWN) {
        if (p.sprite.parent) this.scene.remove(p.sprite);
        p.mat.dispose();
        this.people.splice(i, 1);
        continue;
      }

      // walk along segment
      const s = p.seg;
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) || 1;
      p.t += (p.speed * p.dir * dt) / len;
      if (p.t > 0.92 || p.t < 0.08) {
        p.dir *= -1; // turn around at ends
        p.t = Math.max(0.08, Math.min(0.92, p.t));
      }

      const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
      const side = ((p.x - s.x0) * dz - (p.z - s.z0) * dx); // keep lateral offset roughly
      // recompute position from parametric t + original side bias
      // simpler: move along the direction
      p.x += dx * p.dir * p.speed * dt;
      p.z += dz * p.dir * p.speed * dt;

      // height
      p.y = this.world.heightAt ? this.world.heightAt(p.x, p.z) : 0;
      p.bobPhase += dt * 8;
      const bob = Math.sin(p.bobPhase) * 0.04;
      p.sprite.position.set(p.x, p.y + 0.95 + bob, p.z);

      // animate frames
      p.frameT += dt * (p.speed / WALK_SPEED) * 5.5;
      if (p.frameT >= 1) {
        p.frameT -= 1;
        p.frame = (p.frame + 1) % 4;
        p.mat.map = S.frames[p.variant][p.frame];
        p.mat.needsUpdate = true;
      }

      // face camera-ish (sprites already do, but flip scale.x so they don't look mirrored oddly)
      // optional: flip based on movement direction relative to camera – skipped for simplicity

      // collision with player
      if (d < HIT_RADIUS && Math.abs(py - p.y) < 2.2 && speed > 1.5) {
        this._hit(p, player);
        this.people.splice(i, 1);
      }
    }

    // update puddles (fade after a while)
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const d = this.puddles[i];
      d.age += dt;
      if (d.age > d.life) {
        d.fade += dt * 0.35;
        d.mat.opacity = Math.max(0, 0.92 * (1 - d.fade));
        if (d.fade >= 1) {
          if (d.mesh.parent) this.scene.remove(d.mesh);
          d.mat.dispose();
          d.mesh.geometry.dispose();
          this.puddles.splice(i, 1);
        }
      }
      // keep on ground if terrain height changes (rare)
      if (this.world.heightAt) {
        const hy = this.world.heightAt(d.mesh.position.x, d.mesh.position.z);
        d.mesh.position.y = hy + 0.04;
      }
    }

    // hard cap puddles
    while (this.puddles.length > MAX_PUDDLES) {
      const old = this.puddles.shift();
      if (old.mesh.parent) this.scene.remove(old.mesh);
      old.mat.dispose();
      old.mesh.geometry.dispose();
    }
  }
}
