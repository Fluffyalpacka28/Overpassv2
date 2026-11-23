import * as THREE from 'three';

// Small wildlife for World Drive, drawn as flat billboards like the people and the deer:
//  - Birds: flocks of pigeons, crows and (near water) gulls flying around, flapping and gliding. Now and then a flock swoops
//    low across the road, so you can smack into one. A bird strike hurts your car a little (more the faster you go), with a
//    burst of feathers. You can shoot them too.
//  - Squirrels: forage at the roadside and dart across when a car comes, sometimes freezing halfway and turning back.
//    Run one over and it's flattened, leaving a small red puddle. No damage to your car.

const rnd = Math.random;
const shade = (hex, d) => { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, v + d)); return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); };
const canvasTex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const strip = (w, h, n, draw) => { const c = document.createElement('canvas'); c.width = w * n; c.height = h; const x = c.getContext('2d'); for (let i = 0; i < n; i++) { x.save(); x.translate(i * w, 0); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, i); x.restore(); } return c; };

// ---------------------------------------------------------------- squirrels ----------------------------------------------------------------
const SW = 128, SH = 96, SG = 90;
const SQ_COATS = [{ body: '#8e8a83', back: '#6f6b65', tail: '#7d7872', belly: '#ebe5da' }, { body: '#a05a2c', back: '#83461f', tail: '#b0683a', belly: '#f0e2cc' }, { body: '#7b7066', back: '#5d544c', tail: '#8a8075', belly: '#e6dccd' }];
const SQ_FRAMES = ['sit', 'nibble', 'run0', 'run1', 'run2', 'run3'];
function fluff(x, pts, w, col, edge) {
  // a bushy tail: a thick soft stroke along a curve with a lighter fringe
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [lw, c] of [[w + 6, edge], [w, col]]) {
    x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); x.moveTo(pts[0], pts[1]); x.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); x.stroke();
  }
  // soft wisps of fur along the edge
  x.lineWidth = 1.2;
  for (let i = 0; i < 60; i++) { const t = (i * 0.618) % 1, u = 1 - t, px = u * u * u * pts[0] + 3 * u * u * t * pts[2] + 3 * u * t * t * pts[4] + t * t * t * pts[6], py = u * u * u * pts[1] + 3 * u * u * t * pts[3] + 3 * u * t * t * pts[5] + t * t * t * pts[7], a = i * 2.39996, r = w * (0.45 + 0.35 * ((i * 0.37) % 1)); x.strokeStyle = i % 3 ? edge : col; x.globalAlpha = 0.75; x.beginPath(); x.moveTo(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5); x.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); x.stroke(); }
  x.globalAlpha = 1;
}
function drawSquirrel(x, f, coat) {
  x.clearRect(0, 0, SW, SH);
  const { body, back, tail, belly } = coat, edge = shade(tail, 34), dark = '#1a1410';
  if (f === 'sit' || f === 'nibble') {
    const nib = f === 'nibble';
    fluff(x, [52, 84, 26, 80, 18, 30, 44, 16], 16, tail, edge);
    // haunch, body, head
    x.fillStyle = back; x.beginPath(); x.ellipse(58, 76, 15, 12, 0, 0, 7); x.fill();
    const g = x.createLinearGradient(50, 40, 76, 80); g.addColorStop(0, back); g.addColorStop(1, body); x.fillStyle = g;
    x.beginPath(); x.ellipse(64, 62, 12, 20, -0.28, 0, 7); x.fill();
    x.fillStyle = belly; x.beginPath(); x.ellipse(70, 64, 6, 14, -0.28, 0, 7); x.fill();
    x.fillStyle = body; x.beginPath(); x.ellipse(52, 88, 9, 3.5, 0, 0, 7); x.fill();
    const hy = nib ? 40 : 37; x.fillStyle = body; x.beginPath(); x.ellipse(76, hy, 11, 9.5, 0.2, 0, 7); x.fill();
    x.beginPath(); x.ellipse(86, hy + 3, 6, 5, 0.3, 0, 7); x.fill();
    x.fillStyle = back; x.beginPath(); x.moveTo(69, hy - 6); x.lineTo(71, hy - 17); x.lineTo(76, hy - 7); x.fill();
    x.fillStyle = dark; x.beginPath(); x.arc(80, hy - 2, 2.4, 0, 7); x.fill(); x.beginPath(); x.arc(91, hy + 2, 1.6, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(80.8, hy - 2.8, 0.8, 0, 7); x.fill();
    // paws holding a nut up to the mouth
    x.fillStyle = body; x.beginPath(); x.ellipse(82, nib ? 50 : 56, 4, 3, 0, 0, 7); x.fill();
    x.fillStyle = '#7a4a22'; x.beginPath(); x.ellipse(86, nib ? 47 : 53, 4, 3.4, 0.4, 0, 7); x.fill();
    return;
  }
  const k = +f.slice(3) / 4, ph = k * Math.PI * 2, stretch = Math.sin(ph), lift = Math.max(0, Math.sin(ph)) * 7;
  const by = 66 - lift;
  fluff(x, [46, by - 4, 32, by - 18 - stretch * 4, 18, by - 26, 13, by - 12 + stretch * 6], 14, tail, edge);
  // legs: a bounding gallop (front pair and back pair together)
  x.strokeStyle = shade(body, -12); x.lineCap = 'round'; x.lineWidth = 5;
  const leg = (hx, hy, a) => { x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx + Math.sin(a) * 15, Math.min(SG, hy + Math.cos(a) * 15)); x.stroke(); };
  leg(52, by + 4, -0.9 * stretch); leg(56, by + 4, -0.9 * stretch + 0.3);
  leg(80, by + 4, 0.9 * stretch); leg(84, by + 4, 0.9 * stretch - 0.3);
  const g = x.createLinearGradient(0, by - 12, 0, by + 12); g.addColorStop(0, back); g.addColorStop(1, body); x.fillStyle = g;
  x.beginPath(); x.ellipse(67, by, 23 + stretch * 3, 10.5, -0.05 - stretch * 0.06, 0, 7); x.fill();
  x.fillStyle = belly; x.beginPath(); x.ellipse(70, by + 6, 15, 4, 0, 0, Math.PI); x.fill();
  const hx = 94 + stretch * 2, hy = by - 6;
  x.fillStyle = body; x.beginPath(); x.ellipse(hx, hy, 10, 8.5, 0.15, 0, 7); x.fill(); x.beginPath(); x.ellipse(hx + 9, hy + 3, 5.5, 4.5, 0.2, 0, 7); x.fill();
  x.fillStyle = back; x.beginPath(); x.moveTo(hx - 6, hy - 5); x.lineTo(hx - 5, hy - 15); x.lineTo(hx, hy - 6); x.fill();
  x.fillStyle = dark; x.beginPath(); x.arc(hx + 3, hy - 2, 2.2, 0, 7); x.fill(); x.beginPath(); x.arc(hx + 14, hy + 3, 1.5, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(hx + 3.7, hy - 2.7, 0.7, 0, 7); x.fill();
}
// what's left after a car: seen from above, squashed flat, legs and tail splayed
function drawFlat(x, coat) {
  x.clearRect(0, 0, SW, SH);
  fluff(x, [44, 48, 30, 30, 14, 60, 4, 40], 13, coat.tail, shade(coat.tail, 20));
  x.strokeStyle = shade(coat.body, -15); x.lineWidth = 5; x.lineCap = 'round';
  for (const [a, b, c, d] of [[54, 40, 44, 26], [56, 56, 46, 72], [80, 40, 92, 28], [82, 56, 94, 70]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); }
  x.fillStyle = coat.body; x.beginPath(); x.ellipse(68, 48, 25, 13, 0.05, 0, 7); x.fill();
  x.fillStyle = 'rgba(120,10,16,0.55)'; x.beginPath(); x.ellipse(66, 50, 14, 7, 0.3, 0, 7); x.fill();
  x.fillStyle = coat.body; x.beginPath(); x.ellipse(97, 47, 10, 9, 0, 0, 7); x.fill();
  x.strokeStyle = '#1a1410'; x.lineWidth = 1.6; for (const ey of [43, 51]) { x.beginPath(); x.moveTo(99, ey - 2); x.lineTo(103, ey + 2); x.moveTo(103, ey - 2); x.lineTo(99, ey + 2); x.stroke(); }
}
function puddleCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 3, 64, 64, 60); g.addColorStop(0, 'rgba(150,10,16,.95)'); g.addColorStop(0.45, 'rgba(115,8,14,.85)'); g.addColorStop(0.8, 'rgba(75,4,10,.5)'); g.addColorStop(1, 'rgba(40,0,5,0)');
  x.fillStyle = g; x.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = 48 * (0.72 + rnd() * 0.4); i ? x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : x.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.closePath(); x.fill();
  // a few droplets flicked out
  for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, r = 46 + rnd() * 12; x.fillStyle = 'rgba(120,8,14,.8)'; x.beginPath(); x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5 + rnd() * 2.5, 0, 7); x.fill(); }
  return c;
}
let SQ = null;
function sqArt() {
  if (SQ) return SQ;
  SQ = { coats: SQ_COATS.map(coat => ({ tex: canvasTex(strip(SW, SH, SQ_FRAMES.length, (x, i) => drawSquirrel(x, SQ_FRAMES[i], coat))), flat: canvasTex(strip(SW, SH, 1, x => drawFlat(x, coat))) })), puddle: canvasTex(puddleCanvas()) };
  return SQ;
}

const MAX_SQ = 6, SQ_FAR = 200, MAX_SPLATS = 24;
const NO_SQ = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);
export class Squirrels {
  constructor(scene, world) { this.scene = scene; this.world = world; this.list = []; this.splats = []; this.spawnT = 1; }
  clear() { for (const s of this.list) this._remove(s); for (const s of this.splats) this._removeSplat(s); this.list = []; this.splats = []; }
  _remove(s) { this.scene.remove(s.sprite); s.mat.map.dispose(); s.mat.dispose(); }
  _removeSplat(s) { for (const m of s.meshes) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
  _spawn(P) {
    const cells = this.world.roadCells; if (!cells || !cells.size) return;
    const fx = Math.sin(P.yaw || 0), fz = Math.cos(P.yaw || 0), cands = [];
    const ci = Math.floor(P.x / 24), cj = Math.floor(P.z / 24), seen = new Set();
    for (let i = ci - 7; i <= ci + 7; i++) for (let j = cj - 7; j <= cj + 7; j++) for (const s of cells.get(i + ',' + j) || []) {
      if (seen.has(s)) continue; seen.add(s);
      if (s.walk || s.bridge || s.tunnel || NO_SQ.has(s.type) || s.type === 'rail') continue;
      cands.push(s);
    }
    if (!cands.length) return;
    for (let tries = 0; tries < 12; tries++) {
      const s = cands[(rnd() * cands.length) | 0], len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0); if (!(len > 1.5)) continue;
      const t = 0.1 + rnd() * 0.8, dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len, hw = Number.isFinite(s.hw) ? s.hw : 3, side = rnd() < 0.5 ? 1 : -1;
      const off = hw + 1.2 + rnd() * 2.5, x = s.x0 + (s.x1 - s.x0) * t + dz * side * off, z = s.z0 + (s.z1 - s.z0) * t - dx * side * off;
      const rx = x - P.x, rz = z - P.z, d = Math.hypot(rx, rz); if (d < 35 || d > 160) continue;
      // mostly ahead of you, where you'll meet them
      if ((rx * fx + rz * fz) / d < -0.2 && rnd() < 0.8) continue;
      try { if (this.world.water && this.world.water.inside(x, z)) continue; } catch { }
      if (this.list.some(o => Math.hypot(o.x - x, o.z - z) < 12)) continue;
      const y = this.world.heightAt(x, z); if (!Number.isFinite(y)) continue;
      this._add(x, z, y, s, dx, dz, side, hw); return;
    }
  }
  _add(x, z, y, seg, dx, dz, side, hw) {
    const art = sqArt(), ci = (rnd() * SQ_COATS.length) | 0, map = art.coats[ci].tex.clone(); map.repeat.set(1 / SQ_FRAMES.length, 1); map.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map, alphaTest: 0.35, transparent: true, depthWrite: true, fog: true });
    const sprite = new THREE.Sprite(mat), sc = 0.82 + rnd() * 0.1; sprite.center.set(0.5, (SH - SG) / SH); sprite.scale.set(sc, sc * SH / SW, 1); this.scene.add(sprite);
    // across the road = towards the far side (side flips sign)
    this.list.push({ sprite, mat, coat: ci, x, z, y, seg, dx, dz, side, hw, yaw: Math.atan2(-dz * side, dx * side), state: 'forage', st: 1 + rnd() * 3, sp: 0, k: rnd(), hop: 0, frame: 0, crossed: false, dither: rnd() < 0.4 });
  }
  // flattened: a small puddle with the squirrel pressed into it, lined up with the car
  _splat(s, yaw) {
    const art = sqArt(), y = this.world.heightAt(s.x, s.z), gy = (Number.isFinite(y) ? y : s.y), size = 0.6 + rnd() * 0.35, meshes = [];
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: art.puddle, transparent: true, opacity: 0.92, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pm.rotation.set(-Math.PI / 2, 0, rnd() * 6.28); pm.position.set(s.x, gy + 0.03, s.z); pm.renderOrder = 1; meshes.push(pm);
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * SH / SW), new THREE.MeshBasicMaterial({ map: art.coats[s.coat].flat, transparent: true, alphaTest: 0.3, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    fm.rotation.set(-Math.PI / 2, 0, yaw + Math.PI / 2 + (rnd() - 0.5) * 0.8); fm.position.set(s.x, gy + 0.035, s.z); fm.renderOrder = 2; meshes.push(fm);
    for (const m of meshes) this.scene.add(m);
    this.splats.push({ meshes, age: 0, life: 25 + rnd() * 15 });
    while (this.splats.length > MAX_SPLATS) this._removeSplat(this.splats.shift());
  }
  targets() { return this.list.map(s => ({ id: '', npc: 'squirrel', ref: s, x: s.x, y: s.y - 0.55, z: s.z, r: 0.7 })); }
  shoot(s) { const i = this.list.indexOf(s); if (i < 0) return false; this._splat(s, rnd() * 6.28); this._remove(s); this.list.splice(i, 1); return true; }
  // P: the player's car; returns the squirrels run over this frame ([{ x, z, speed }])
  update(dt, P, on, cam) {
    if (!on) { if (this.list.length || this.splats.length) this.clear(); return null; }
    let out = null;
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 1.5 + rnd() * 2.5; if (this.list.length < MAX_SQ) this._spawn(P); }
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i]; s.age += dt; const f = s.age > s.life ? Math.max(0, 1 - (s.age - s.life) / 4) : 1;
      for (const m of s.meshes) m.material.opacity = (m.material.alphaTest ? 1 : 0.92) * f;
      if (f <= 0) { this._removeSplat(s); this.splats.splice(i, 1); }
    }
    const camR = cam ? new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion) : null, psp = Math.hypot(P.vx || 0, P.vz || 0);
    const cy = Math.cos(P.yaw || 0), sy = Math.sin(P.yaw || 0);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i], rx = s.x - P.x, rz = s.z - P.z, dist = Math.hypot(rx, rz);
      if (dist > SQ_FAR) { this._remove(s); this.list.splice(i, 1); continue; }
      // a car coming: dash across (usually) or bolt away from the road
      if (s.state === 'forage' && dist < 32 && psp > 3 && (rx * (P.vx || 0) + rz * (P.vz || 0)) > 0) {
        if (rnd() < 0.6 && !s.crossed) { s.state = 'dash'; s.st = 6; s.retreat = false; s.yaw = Math.atan2(-s.dz * s.side, s.dx * s.side); }
        else { s.state = 'flee'; s.st = 4; s.yaw = Math.atan2(s.dz * s.side, -s.dx * s.side) + (rnd() - 0.5) * 0.8; }
      }
      // how far across the road it is (signed distance from the middle line, its own starting side positive)
      const lat = ((s.x - s.seg.x0) * s.dz - (s.z - s.seg.z0) * s.dx) * s.side;
      if (s.state === 'dash') {
        // halfway over: sometimes freeze, then turn back
        if (s.dither && Math.abs(lat) < s.hw * 0.4) { s.dither = false; s.state = 'freeze'; s.st = 0.35 + rnd() * 0.6; }
        else if (lat < -(s.hw + 1.5)) { s.state = 'forage'; s.st = 3 + rnd() * 4; s.crossed = true; s.side = -s.side; }
        else if (s.retreat && lat > s.hw + 1.5) { s.state = 'forage'; s.st = 3 + rnd() * 4; s.crossed = true; }
      } else if (s.state === 'freeze') { if ((s.st -= dt) <= 0) { s.state = 'dash'; if (rnd() < 0.6) { s.yaw += Math.PI; s.retreat = true; } s.st = 5; } }
      else if (s.state === 'flee') { if ((s.st -= dt) <= 0) { this._remove(s); this.list.splice(i, 1); continue; } }
      else if ((s.st -= dt) <= 0) { s.st = 1 + rnd() * 3; s.hop = rnd() < 0.5 ? 0.35 : 0; s.yaw += (rnd() - 0.5) * 2.5; }
      if (s.state === 'dash' && !s.retreat && lat > s.hw + 4) s.yaw = Math.atan2(-s.dz * s.side, s.dx * s.side);
      const want = s.state === 'dash' ? 6.5 : s.state === 'flee' ? 5.5 : s.hop > 0 ? 1.5 : 0;
      if (s.hop > 0) s.hop -= dt;
      s.sp += (want - s.sp) * Math.min(1, dt * 8);
      if (s.sp > 0.05) {
        let nx = s.x + Math.sin(s.yaw) * s.sp * dt, nz = s.z + Math.cos(s.yaw) * s.sp * dt;
        // foraging squirrels stay off the road
        if (s.state === 'forage') { const nl = ((nx - s.seg.x0) * s.dz - (nz - s.seg.z0) * s.dx) * s.side; if (nl < s.hw + 0.6) { s.yaw += Math.PI; nx = s.x; nz = s.z; } }
        s.x = nx; s.z = nz;
      }
      const gy = this.world.heightAt(s.x, s.z); if (Number.isFinite(gy)) s.y = gy;
      let f = (s.k += dt * 0.25) % 2 < 1.6 ? 0 : 1;
      if (s.sp > 0.6) { s.k = (s.k + dt * (2 + s.sp * 0.9)) % 4; f = 2 + (Math.floor(s.k) % 4); }
      if (camR) { const side = Math.sin(s.yaw) * camR.x + Math.cos(s.yaw) * camR.z; if (Math.abs(side) > 0.12) s.flip = side < 0; }
      const fw = 1 / SQ_FRAMES.length; s.mat.map.repeat.x = s.flip ? -fw : fw; s.mat.map.offset.x = s.flip ? (f + 1) * fw : f * fw;
      s.sprite.position.set(s.x, s.y + 0.01, s.z);
      // under the wheels? (a box the size of the car, lined up with it)
      if (psp > 1.5 && dist < 3 && Math.abs((P.y || 0) - s.y) < 1.2) {
        const lx = rx * cy - rz * sy, lz = rx * sy + rz * cy;
        if (Math.abs(lx) < 1.05 && Math.abs(lz) < 2.3) { (out = out || []).push({ x: s.x, z: s.z, speed: psp }); this._splat(s, P.yaw || 0); this._remove(s); this.list.splice(i, 1); }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- birds ----------------------------------------------------------------
const BW = 128, BH = 96;
const BIRD_KINDS = [
  { name: 'pigeon', body: '#7f8894', back: '#6b7480', wing: '#8a939e', tip: '#3f454d', head: '#56606d', beak: '#2b2b2b', neck: '#5e8a7a', size: 0.62, sp: 11 },
  { name: 'crow', body: '#23252b', back: '#1b1d22', wing: '#2a2d34', tip: '#121316', head: '#1d1f24', beak: '#141414', size: 0.85, sp: 10 },
  { name: 'gull', body: '#f3f3f0', back: '#e6e6e2', wing: '#aeb6bf', tip: '#1e1e1e', head: '#fbfbf8', beak: '#f2c230', size: 1.05, sp: 9 },
];
const BIRD_FRAMES = [0, 0.25, 0.5, 0.75, 'glide'];
function drawBird(x, f, b) {
  x.clearRect(0, 0, BW, BH);
  const a = f === 'glide' ? 0.12 : Math.sin(f * Math.PI * 2), tipY = 50 - a * 36, tipX = 40 + Math.abs(a) * 6;
  const wing = (dx, dy, col, tipCol) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(58 + dx, 48 + dy); x.lineTo(76 + dx, 49 + dy); x.quadraticCurveTo(62 + dx, (tipY + 50) / 2 + dy + 6, tipX + 6 + dx, tipY + 5 + dy); x.lineTo(tipX + dx, tipY + dy); x.quadraticCurveTo(48 + dx, (tipY + 48) / 2 + dy - 4, 58 + dx, 48 + dy); x.fill();
    x.fillStyle = tipCol; x.beginPath(); x.moveTo(tipX + dx, tipY + dy); x.lineTo(tipX + 9 + dx, tipY + 4 + dy + a * 2); x.lineTo(tipX + 6 + dx, tipY + 5 + dy); x.fill();
  };
  wing(6, -2, shade(b.wing, -24), shade(b.tip, -10));
  // tail, body, head
  x.fillStyle = b.back; x.beginPath(); x.moveTo(44, 50); x.lineTo(22, 45); x.lineTo(24, 55); x.closePath(); x.fill();
  const g = x.createLinearGradient(0, 40, 0, 60); g.addColorStop(0, b.back); g.addColorStop(1, b.body); x.fillStyle = g;
  x.beginPath(); x.ellipse(62, 51, 24, 8.5, -0.06, 0, 7); x.fill();
  if (b.neck) { x.fillStyle = b.neck; x.beginPath(); x.ellipse(80, 48, 7, 6, 0, 0, 7); x.fill(); }
  x.fillStyle = b.head; x.beginPath(); x.arc(88, 45, 7.5, 0, 7); x.fill();
  x.fillStyle = b.beak; x.beginPath(); x.moveTo(94, 43); x.lineTo(104, 46); x.lineTo(94, 48.5); x.fill();
  x.fillStyle = '#0e0e0e'; x.beginPath(); x.arc(90, 43.5, 1.7, 0, 7); x.fill();
  wing(0, 0, b.wing, b.tip);
}
function featherCanvas() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d');
  x.translate(16, 16); x.rotate(0.6); x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(0, 0, 4, 12, 0, 0, 7); x.fill();
  x.strokeStyle = 'rgba(160,160,160,0.9)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -12); x.lineTo(0, 14); x.stroke(); return c;
}
let BIRD_ART = null;
function birdArt() {
  if (BIRD_ART) return BIRD_ART;
  BIRD_ART = { kinds: BIRD_KINDS.map(k => canvasTex(strip(BW, BH, BIRD_FRAMES.length, (x, i) => drawBird(x, BIRD_FRAMES[i], k)))), feather: canvasTex(featherCanvas()) };
  return BIRD_ART;
}

const MAX_FLOCKS = 4, FLOCK_FAR = 300, FEATHERS = 60, HIT_R = 1.35;
export class Birds {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.flocks = []; this.dead = []; this.spawnT = 0.5; this.t = 0;
    this.feathers = []; this.fi = 0;
  }
  _initFeathers() {
    if (this.feathers.length) return; const tex = birdArt().feather;
    for (let i = 0; i < FEATHERS; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true })); sp.visible = false; sp.scale.set(0.16, 0.16, 1); this.scene.add(sp); this.feathers.push({ sp, life: 0, vx: 0, vy: 0, vz: 0, w: 0 }); }
  }
  clear() {
    for (const f of this.flocks) for (const b of f.birds) this._remove(b);
    for (const b of this.dead) this._remove(b);
    for (const p of this.feathers) { p.life = 0; p.sp.visible = false; }
    this.flocks = []; this.dead = [];
  }
  _remove(b) { this.scene.remove(b.sprite); b.mat.map.dispose(); b.mat.dispose(); }
  _ground(x, z) { const y = this.world.heightAt(x, z); return Number.isFinite(y) ? y : 0; }
  // highest roof under a point (so flocks clear buildings)
  _roof(x, z) {
    const cells = this.world.bldCells; if (!cells) return -Infinity; let top = -Infinity;
    for (const b of cells.get(Math.floor(x / 24) + ',' + Math.floor(z / 24)) || []) if (x > b.x0 - 6 && x < b.x1 + 6 && z > b.z0 - 6 && z < b.z1 + 6 && Number.isFinite(b.top)) top = Math.max(top, b.top);
    return top;
  }
  _spawn(P) {
    const a = rnd() * 6.28, d = 120 + rnd() * 140, x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    let wet = false; try { wet = !!(this.world.water && (this.world.water.inside(x, z) || this.world.water.inside(P.x, P.z))); } catch { }
    const kind = wet && rnd() < 0.75 ? 2 : rnd() < 0.6 ? 0 : 1, K = BIRD_KINDS[kind], n = 3 + ((rnd() * 5) | 0), alt = 14 + rnd() * 22;
    const f = { kind, x, z, y: this._ground(x, z) + alt, alt, yaw: rnd() * 6.28, turn: 0, turnT: 0, sp: K.sp * (0.85 + rnd() * 0.3), birds: [], swoopT: 4 + rnd() * 10, swoop: 0, wantAlt: alt };
    const art = birdArt();
    for (let i = 0; i < n; i++) {
      const map = art.kinds[kind].clone(); map.repeat.set(1 / BIRD_FRAMES.length, 1); map.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map, alphaTest: 0.3, transparent: true, depthWrite: true, fog: true }), sprite = new THREE.Sprite(mat), s = K.size * (0.9 + rnd() * 0.2);
      sprite.scale.set(s, s * BH / BW, 1); this.scene.add(sprite);
      f.birds.push({ sprite, mat, kind, ox: (rnd() - 0.5) * 7, oy: (rnd() - 0.5) * 2.5, oz: (rnd() - 0.5) * 7 - i * 0.6, ph: rnd() * 6.28, rate: 3.2 + rnd() * 1.4, k: rnd(), x, y: f.y, z, vx: 0, vy: 0, vz: 0, flip: false });
    }
    this.flocks.push(f);
  }
  feather(x, y, z, vx, vz, col) {
    this._initFeathers();
    for (let i = 0; i < 10; i++) {
      const p = this.feathers[this.fi]; this.fi = (this.fi + 1) % FEATHERS;
      p.sp.position.set(x + (rnd() - 0.5) * 0.4, y + (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 0.4); p.sp.material.color.set(col); p.sp.material.opacity = 1; p.sp.visible = true;
      p.vx = vx * 0.4 + (rnd() - 0.5) * 4; p.vy = 0.5 + rnd() * 2.5; p.vz = vz * 0.4 + (rnd() - 0.5) * 4; p.life = 2.5 + rnd() * 2; p.w = rnd() * 6.28;
    }
  }
  _kill(f, i, vx, vy, vz) {
    const b = f.birds.splice(i, 1)[0]; if (!b) return null;
    b.vx = vx; b.vy = vy; b.vz = vz; b.spin = (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 6); b.age = 0; b.landed = false; this.dead.push(b);
    const K = BIRD_KINDS[b.kind]; this.feather(b.x, b.y, b.z, vx, vz, K.wing);
    return b;
  }
  targets() { const o = []; for (const f of this.flocks) for (const b of f.birds) o.push({ id: '', npc: 'bird', ref: b, flock: f, x: b.x, y: b.y - 0.7, z: b.z, r: 0.9 }); return o; }
  velOf(b) { for (const f of this.flocks) if (f.birds.includes(b)) return new THREE.Vector3(Math.sin(f.yaw) * f.sp, 0, Math.cos(f.yaw) * f.sp); return new THREE.Vector3(); }
  shoot(b) { for (const f of this.flocks) { const i = f.birds.indexOf(b); if (i >= 0) { this._kill(f, i, Math.sin(f.yaw) * f.sp * 0.5, 1, Math.cos(f.yaw) * f.sp * 0.5); f.swoop = 0; f.wantAlt = f.alt + 10; f.sp *= 1.3; return true; } } return false; }
  // P: the player's car; returns birds you flew or drove into this frame ([{ speed, kind }])
  update(dt, P, on, cam) {
    if (!on) { if (this.flocks.length || this.dead.length) this.clear(); return null; }
    this.t += dt; let out = null;
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 3 + rnd() * 4; if (this.flocks.length < MAX_FLOCKS) this._spawn(P); }
    const camR = cam ? new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion) : null, fw = 1 / BIRD_FRAMES.length;
    const pvx = P.vx || 0, pvz = P.vz || 0, psp = Math.hypot(pvx, pvz), fx = Math.sin(P.yaw || 0), fz = Math.cos(P.yaw || 0), py = (P.y || 0) + 0.85;
    for (let fi = this.flocks.length - 1; fi >= 0; fi--) {
      const f = this.flocks[fi], rx = f.x - P.x, rz = f.z - P.z, d = Math.hypot(rx, rz);
      if (d > FLOCK_FAR || !f.birds.length) { for (const b of f.birds) this._remove(b); this.flocks.splice(fi, 1); continue; }
      // wander: lazy turns, and head back if drifting too far away
      if ((f.turnT -= dt) <= 0) { f.turnT = 2 + rnd() * 5; f.turn = (rnd() - 0.5) * 0.7; }
      let turn = f.turn;
      if (d > 200 && f.swoop <= 0) { const want = Math.atan2(-rx, -rz); let da = want - f.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); turn = Math.sign(da) * 0.8; }
      // swoop: a flock ahead of you dives low across the road, then climbs away
      f.swoopT -= dt;
      if (f.swoop <= 0 && f.swoopT <= 0) {
        f.swoopT = 9 + rnd() * 14;
        const ahead = (rx * fx + rz * fz) / (d || 1);
        if (d < 170 && d > 35 && ahead > 0.5 && psp > 6) { f.swoop = 5 + rnd() * 2; f.wantAlt = 1.4 + rnd() * 1.8; f.yaw = Math.atan2(fx, fz) + (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rnd() - 0.5) * 0.7); f.turn = 0; }
      }
      if (f.swoop > 0) { f.swoop -= dt; turn = 0; if (f.swoop <= 0) f.wantAlt = 14 + rnd() * 22; }
      f.yaw += turn * dt;
      f.x += Math.sin(f.yaw) * f.sp * dt; f.z += Math.cos(f.yaw) * f.sp * dt;
      // height: follow the ground, clear the roofs
      const g = this._ground(f.x, f.z), roof = this._roof(f.x + Math.sin(f.yaw) * 15, f.z + Math.cos(f.yaw) * 15);
      let target = g + f.wantAlt; if (roof > -Infinity) target = Math.max(target, roof + 4);
      f.y += (target - f.y) * Math.min(1, dt * (f.swoop > 0 ? 1.1 : 0.6));
      const climbing = target - f.y > 1.5, cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
      for (let i = f.birds.length - 1; i >= 0; i--) {
        const b = f.birds[i];
        // formation offset (turned with the flock), plus a little bob and drift
        const ox = b.ox + Math.sin(this.t * 0.7 + b.ph) * 0.8, oz = b.oz + Math.cos(this.t * 0.5 + b.ph) * 0.8;
        b.x = f.x + ox * cy + oz * sy; b.z = f.z - ox * sy + oz * cy; b.y = f.y + b.oy + Math.sin(this.t * 1.6 + b.ph) * 0.35;
        // flap (harder when climbing), with stretches of gliding
        const glide = !climbing && f.swoop <= 0 && Math.sin(this.t * 0.45 + b.ph) > 0.35;
        let fr = 4; if (!glide) { b.k = (b.k + dt * b.rate * (climbing ? 1.4 : 1)) % 1; fr = Math.floor(b.k * 4); }
        if (camR) { const side = sy * camR.x + cy * camR.z; if (Math.abs(side) > 0.1) b.flip = side < 0; }
        b.mat.map.repeat.x = b.flip ? -fw : fw; b.mat.map.offset.x = b.flip ? (fr + 1) * fw : fr * fw;
        b.sprite.position.set(b.x, b.y, b.z);
        // smacked into it?
        const dx = b.x - P.x, dy = b.y - py, dz = b.z - P.z;
        if (Math.abs(dx) < 3 && Math.abs(dz) < 3 && Math.hypot(dx, dy, dz) < HIT_R) {
          const bvx = sy * f.sp, bvz = cy * f.sp, rel = Math.hypot(pvx - bvx, pvz - bvz);
          if (rel > 3) { (out = out || []).push({ speed: rel, kind: BIRD_KINDS[b.kind].name }); this._kill(f, i, pvx * 0.6 + dx * 2, 3, pvz * 0.6 + dz * 2); }
        }
      }
    }
    // the fallen: tumble down, lie on the ground a while, fade
    for (let i = this.dead.length - 1; i >= 0; i--) {
      const b = this.dead[i]; b.age += dt;
      if (!b.landed) {
        b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vx *= 1 - dt * 0.8; b.vz *= 1 - dt * 0.8; b.mat.rotation += b.spin * dt;
        const g = this._ground(b.x, b.z); if (b.y <= g + 0.12) { b.y = g + 0.12; b.landed = true; b.mat.rotation = Math.PI / 2 * (b.spin > 0 ? 1 : -1); }
        b.mat.map.offset.x = (b.flip ? 5 : 4) * fw;
      }
      if (b.age > 10) b.mat.opacity = Math.max(0, 1 - (b.age - 10) / 3);
      b.sprite.position.set(b.x, b.y, b.z);
      if (b.age > 13 || Math.hypot(b.x - P.x, b.z - P.z) > FLOCK_FAR) { this._remove(b); this.dead.splice(i, 1); }
    }
    for (const p of this.feathers) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
      p.vx *= 1 - dt * 2.2; p.vz *= 1 - dt * 2.2; p.vy = p.vy * (1 - dt * 3) - dt * 1.2; p.w += dt * 4;
      p.sp.position.x += (p.vx + Math.sin(p.w) * 0.6) * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt; p.sp.material.rotation = Math.sin(p.w) * 0.9;
      p.sp.material.opacity = Math.min(1, p.life);
    }
    return out;
  }
}
