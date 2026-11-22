import * as THREE from 'three';

// Deer for World Drive: flat billboard deer (drawn on a canvas, like the billboard people) that turn up in quiet, green places:
// countryside, edges of small towns, never downtown. They graze, wander about, and bolt when a car gets close, sometimes straight
// across the road. Hit one and it's thrown aside, and your car takes real damage (deer are heavy).
const MAX_DEER = 6, FAR = 420, W = 256, H = 192;
const rnd = Math.random;

// ---- drawing: a side-on deer facing right, in a few poses ----
function drawDeer(ctx, pose, k, buck, coat) {
  ctx.clearRect(0, 0, W, H);
  const body = coat.body, back = coat.back, belly = '#efe4d2', leg = coat.leg, hoof = '#1d1712', ground = 178;
  // legs: [hipX, hipY, swing phase offset, near?]
  const legs = [[86, 108, 0, 0], [96, 108, Math.PI, 1], [170, 104, Math.PI * 0.5, 0], [180, 104, Math.PI * 1.5, 1]];
  const amp = pose === 'run' ? 0.75 : pose === 'walk' ? 0.38 : 0;
  const drawLeg = ([hx, hy, ph, near]) => {
    const a = Math.sin(k * Math.PI * 2 + ph) * amp, bend = Math.max(0, Math.sin(k * Math.PI * 2 + ph + 1.2)) * amp * 1.1;
    const L1 = 38, L2 = ground - hy - L1 + 4;
    const kx = hx + Math.sin(a) * L1, ky = hy + Math.cos(a) * L1;
    const fx = kx + Math.sin(a - bend) * L2, fy = Math.min(ground, ky + Math.cos(a - bend) * L2);
    ctx.strokeStyle = near ? leg : shade(leg, -18); ctx.lineCap = 'round';
    ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(hx, hy - 6); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = hoof; ctx.beginPath(); ctx.ellipse(fx + 2, fy, 5, 3.5, 0, 0, 7); ctx.fill();
  };
  for (const l of legs) if (!l[3]) drawLeg(l);
  // body
  const g = ctx.createLinearGradient(0, 62, 0, 128); g.addColorStop(0, back); g.addColorStop(0.55, body); g.addColorStop(1, shade(body, 18));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(132, 96, 64, 27, -0.03, 0, 7); ctx.fill();
  ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(130, 114, 46, 9, 0, 0, Math.PI); ctx.fill();
  // rump and tail (white underneath, flagged up when running)
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(78, 92, 24, 25, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f6f1e8'; ctx.beginPath(); ctx.ellipse(62, 92, 8, 14, 0.2, 0, 7); ctx.fill();
  ctx.fillStyle = pose === 'run' ? '#fbf8f2' : back; ctx.beginPath();
  if (pose === 'run') ctx.ellipse(56, 70, 6, 14, -0.5, 0, 7); else ctx.ellipse(58, 82, 6, 11, 0.4, 0, 7); ctx.fill();
  for (const l of legs) if (l[3]) drawLeg(l);
  // neck and head (head down when grazing)
  const graze = pose === 'graze', hx = graze ? 214 : 210, hy = graze ? 150 : 40;
  ctx.fillStyle = body; ctx.beginPath();
  ctx.moveTo(176, 84); ctx.quadraticCurveTo(graze ? 196 : 186, graze ? 110 : 64, hx - 10, hy + 2); ctx.lineTo(hx + 4, hy + 12);
  ctx.quadraticCurveTo(graze ? 206 : 200, graze ? 126 : 82, 190, 108); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2ebe0'; ctx.beginPath(); ctx.ellipse(graze ? 200 : 196, graze ? 122 : 74, 7, 5, 0.8, 0, 7); ctx.fill(); // throat patch
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(graze ? 1.2 : 0.18);
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(6, 4, 17, 11, 0, 0, 7); ctx.fill();        // head
  ctx.beginPath(); ctx.ellipse(22, 9, 10, 7, 0.15, 0, 7); ctx.fill();                              // muzzle
  ctx.fillStyle = '#1b1512'; ctx.beginPath(); ctx.ellipse(30, 8, 4, 3.4, 0, 0, 7); ctx.fill();     // nose
  ctx.fillStyle = '#f3ede4'; ctx.beginPath(); ctx.ellipse(22, 14, 7, 3, 0.1, 0, 7); ctx.fill();    // white chin
  ctx.fillStyle = '#120d0a'; ctx.beginPath(); ctx.arc(8, 0, 2.8, 0, 7); ctx.fill();                 // eye
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(8.8, -0.8, 0.9, 0, 7); ctx.fill();
  for (const [ex, ey, r] of [[-6, -10, -0.9], [-1, -12, -0.5]]) {                                    // ears
    ctx.fillStyle = shade(body, -10); ctx.beginPath(); ctx.ellipse(ex, ey, 6, 13, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9c2aa'; ctx.beginPath(); ctx.ellipse(ex + 0.5, ey, 3, 8, r, 0, 7); ctx.fill();
  }
  if (buck) { // antlers
    ctx.strokeStyle = '#d8c6a0'; ctx.lineCap = 'round'; ctx.lineWidth = 3.6;
    for (const s of [0, 1]) {
      const ox = s ? 2 : -3; ctx.beginPath(); ctx.moveTo(ox, -8); ctx.quadraticCurveTo(ox - 14, -26, ox + 2, -44); ctx.stroke();
      ctx.lineWidth = 2.6; for (const [t1, t2] of [[-20, -6], [-30, -2], [-38, 2]]) { ctx.beginPath(); ctx.moveTo(ox - 6, t1); ctx.lineTo(ox + t2 + 6, t1 - 12); ctx.stroke(); }
      ctx.lineWidth = 3.6;
    }
  }
  ctx.restore();
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, v + d)); return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); }

const COATS = [{ body: '#9a6538', back: '#7b4c28', leg: '#86593a' }, { body: '#a87346', back: '#82552f', leg: '#8f6442' }, { body: '#8a5d39', back: '#6b4429', leg: '#7a5236' }];
let ATLAS = null;
// one texture per (coat, buck) with every frame laid out in a strip: stand, graze, walk 0-3, run 0-3
const FRAMES = [['stand', 0], ['graze', 0], ['walk', 0], ['walk', 0.25], ['walk', 0.5], ['walk', 0.75], ['run', 0], ['run', 0.25], ['run', 0.5], ['run', 0.75]];
function atlas() {
  if (ATLAS) return ATLAS;
  ATLAS = [];
  for (const coat of COATS) for (const buck of [false, true]) {
    const c = document.createElement('canvas'); c.width = W * FRAMES.length; c.height = H; const x = c.getContext('2d');
    FRAMES.forEach(([pose, k], i) => { x.save(); x.translate(i * W, 0); x.beginPath(); x.rect(0, 0, W, H); x.clip(); drawDeer(x, pose, k, buck, coat); x.restore(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ATLAS.push(t);
  }
  return ATLAS;
}

export class Deer {
  constructor(scene, world) { this.scene = scene; this.world = world; this.list = []; this.spawnT = 2; this.t = 0; this.quietT = 0; this.quiet = 0; }
  clear() { for (const d of this.list) this._remove(d); this.list = []; }
  _remove(d) { this.scene.remove(d.sprite); d.mat.map.dispose(); d.mat.dispose(); }
  // how built-up it is round here: 0 = open country, 1 = town (checked every few seconds)
  _townness(px, pz) {
    const now = this.t; if (now - this.quietT < 4) return this.quiet; this.quietT = now;
    const cells = this.world.bldCells; let n = 0;
    if (cells && cells.size) { const ci = Math.floor(px / 24), cj = Math.floor(pz / 24), seen = new Set(); for (let i = ci - 6; i <= ci + 6; i++) for (let j = cj - 6; j <= cj + 6; j++) for (const b of cells.get(i + ',' + j) || []) if (!seen.has(b)) { seen.add(b); n++; } }
    return (this.quiet = Math.min(1, n / 60));
  }
  _blocked(x, z) {
    try { if (this.world.water && this.world.water.inside(x, z)) return true; } catch { }
    const cells = this.world.bldCells; if (!cells) return false;
    for (const b of cells.get(Math.floor(x / 24) + ',' + Math.floor(z / 24)) || []) if (x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2) return true;
    return false;
  }
  _spawn(P) {
    const town = this._townness(P.x, P.z); if (town > 0.75) return; // not in town
    for (let tries = 0; tries < 8; tries++) {
      const a = (P.yaw || 0) + (rnd() - 0.5) * 2.6, d = 90 + rnd() * 220, x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (this._blocked(x, z) || this.list.some(o => Math.hypot(o.x - x, o.z - z) < 25)) continue;
      const y = this.world.heightAt(x, z); if (!Number.isFinite(y)) continue;
      // sometimes a doe with one or two others nearby
      const n = rnd() < 0.35 ? 2 + (rnd() < 0.4 ? 1 : 0) : 1;
      for (let k = 0; k < n && this.list.length < MAX_DEER; k++) this._add(x + (rnd() - 0.5) * 8 * k, z + (rnd() - 0.5) * 8 * k);
      return;
    }
  }
  _add(x, z) {
    const tex = atlas(), ci = Math.floor(rnd() * COATS.length), buck = rnd() < 0.35, map = tex[ci * 2 + (buck ? 1 : 0)].clone();
    map.repeat.set(1 / FRAMES.length, 1); map.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map, alphaTest: 0.4, transparent: true, depthWrite: true, fog: true });
    const sprite = new THREE.Sprite(mat), s = 0.9 + rnd() * 0.2; sprite.center.set(0.5, (H - 178) / H); sprite.scale.set(2.2 * s, 2.2 * s * H / W, 1); this.scene.add(sprite);
    this.list.push({ sprite, mat, x, z, y: this.world.heightAt(x, z), yaw: rnd() * 6.28, state: rnd() < 0.6 ? 'graze' : 'walk', st: 2 + rnd() * 6, k: rnd(), sp: 0, s, dead: 0, vx: 0, vy: 0, vz: 0, spin: 0, fade: 1 });
  }
  // P: the player's car { x, z, y, vx, vz, yaw, speed }; on: World Drive is running; cam: the camera (to flip each deer the right way)
  // returns the deer hit this frame (with the speed you hit it at)
  // weapon targets (centre = y + 0.7, as the guns expect)
  targets() { return this.list.filter(d => !d.dead).map(d => ({ id: '', npc: 'deer', ref: d, x: d.x, y: d.y - 0.1, z: d.z, r: 1.4 })); }
  // shot: knocked over away from where the shot came from
  shoot(d, fx, fz) {
    if (!d || d.dead) return false; const a = Math.atan2(d.x - fx, d.z - fz);
    d.dead = 1e-3; d.vx = Math.sin(a) * 4; d.vz = Math.cos(a) * 4; d.vy = 3.5; d.y += 0.3; d.spin = (rnd() < 0.5 ? -1 : 1) * 6; return true;
  }
  update(dt, P, on, cam) {
    if (!on) { if (this.list.length) this.clear(); return null; }
    this.t += dt; let hit = null;
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 2.5 + rnd() * 2; if (this.list.filter(d => !d.dead).length < MAX_DEER) this._spawn(P); }
    const camR = cam ? new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion) : null;
    const psp = Math.hypot(P.vx || 0, P.vz || 0);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], dist = Math.hypot(d.x - P.x, d.z - P.z);
      if (dist > FAR || d.fade <= 0) { this._remove(d); this.list.splice(i, 1); continue; }
      if (d.dead) { // thrown aside: fly, tumble, land on its side, lie there a while, fade away
        d.dead += dt;
        if (d.vy !== 0 || d.y > this.world.heightAt(d.x, d.z) + 0.05) { d.vy -= 18 * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt; d.mat.rotation += d.spin * dt; const gy = this.world.heightAt(d.x, d.z); if (d.y <= gy) { d.y = gy; d.vy = 0; d.vx *= 0.3; d.vz *= 0.3; d.mat.rotation = Math.PI / 2 * Math.sign(d.spin || 1); } }
        if (d.dead > 12) d.fade -= dt / 2; d.mat.opacity = Math.max(0, d.fade);
        d.sprite.position.set(d.x, d.y + (d.vy === 0 ? 0.35 : 0), d.z); continue;
      }
      // a car coming: bolt (usually away, sometimes the wrong way, across the road)
      if (dist < 28 && psp > 4 && d.state !== 'run') { const away = Math.atan2(d.x - P.x, d.z - P.z); d.state = 'run'; d.st = 3 + rnd() * 2; d.yaw = away + (rnd() - 0.5) * (rnd() < 0.3 ? 3.4 : 1.4); }
      if ((d.st -= dt) <= 0) {
        if (d.state === 'run') { d.state = 'walk'; d.st = 3 + rnd() * 4; }
        else if (d.state === 'walk') { d.state = rnd() < 0.7 ? 'graze' : 'stand'; d.st = 3 + rnd() * 6; }
        else { d.state = 'walk'; d.st = 3 + rnd() * 5; d.yaw += (rnd() - 0.5) * 2.4; }
      }
      const want = d.state === 'run' ? 10 : d.state === 'walk' ? 1.3 : 0; d.sp += (want - d.sp) * Math.min(1, dt * 3);
      if (d.sp > 0.05) {
        const nx = d.x + Math.sin(d.yaw) * d.sp * dt, nz = d.z + Math.cos(d.yaw) * d.sp * dt;
        if (this._blocked(nx, nz)) d.yaw += Math.PI * (0.6 + rnd() * 0.8); else { d.x = nx; d.z = nz; }
      }
      const gy = this.world.heightAt(d.x, d.z); if (Number.isFinite(gy)) d.y += (gy - d.y) * Math.min(1, dt * 10);
      // which frame
      let f = d.state === 'graze' ? 1 : 0;
      if (d.state === 'run' || d.sp > 3) { d.k = (d.k + dt * d.sp * 0.32) % 1; f = 6 + Math.floor(d.k * 4); }
      else if (d.sp > 0.2) { d.k = (d.k + dt * d.sp * 0.9) % 1; f = 2 + Math.floor(d.k * 4); }
      // face the way it's walking, as seen from the camera (a sprite can't be mirrored by scale, so the texture is read backwards)
      if (camR) { const side = Math.sin(d.yaw) * camR.x + Math.cos(d.yaw) * camR.z; if (Math.abs(side) > 0.15) d.flip = side < 0; }
      const fw = 1 / FRAMES.length; d.mat.map.repeat.x = d.flip ? -fw : fw; d.mat.map.offset.x = d.flip ? (f + 1) * fw : f * fw;
      d.sprite.position.set(d.x, d.y, d.z);
      // hit by the car
      if (!hit && dist < 1.9 && psp > 3 && Math.abs((P.y || 0) - d.y) < 2.2) {
        hit = { x: d.x, z: d.z, y: d.y, speed: psp };
        d.dead = 1e-3; d.vx = (P.vx || 0) * 0.55 + (d.x - P.x) * 2; d.vz = (P.vz || 0) * 0.55 + (d.z - P.z) * 2; d.vy = 3 + psp * 0.18; d.y += 0.3; d.spin = (rnd() < 0.5 ? -1 : 1) * (5 + psp * 0.2);
      }
    }
    return hit;
  }
}
