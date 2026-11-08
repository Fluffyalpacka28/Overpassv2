import * as THREE from 'three';
import { Car } from './car.js';

export const THEMES = {
  lakeside: { sky: ['#2b3a78', '#f6a76b'], fog: '#e9a27a', ground: '#5f8a4e', sun: '#ffd2a0', hemi: ['#ffd9b8', '#3d5a3a'], light: 1.6, props: 'pines', water: true },
  desert: { sky: ['#3f7fd0', '#ffd9a8'], fog: '#f2c99a', ground: '#d99a5e', sun: '#fff1d6', hemi: ['#fff0dd', '#a0603a'], light: 2.0, props: 'cacti' },
  neon: { sky: ['#0b0820', '#3b1d5e'], fog: '#2a1748', ground: '#1b1a28', sun: '#c3a8ff', hemi: ['#6d5bd6', '#141020'], light: 0.6, props: 'city', night: true },
  alpine: { sky: ['#5d8fd8', '#e8f1ff'], fog: '#dfe8f5', ground: '#eef3f8', sun: '#ffffff', hemi: ['#ffffff', '#9fb2c8'], light: 1.7, props: 'snowpines' },
  coast: { sky: ['#2f8fe0', '#bfe8ff'], fog: '#bfe3f2', ground: '#7fb35a', sun: '#fff6e0', hemi: ['#f4fbff', '#4c7a3a'], light: 1.9, props: 'palms', water: true },
  volcano: { sky: ['#1a1016', '#7a3324'], fog: '#5a2a22', ground: '#2d2729', sun: '#ff9a5a', hemi: ['#ff9a6a', '#1d1416'], light: 1.0, props: 'rocks', lava: true },
};

export const LEVELS = [
  { id: 0, name: 'Harbor Lights', place: 'Burlington, Vermont', lat: 44.4759, lon: -73.2207, theme: 'lakeside', laps: 2, rivals: 3, skill: 0.78, seed: 11, radius: 150,
    story: 'Your first night with the Northline crew. Ezra, the old mechanic, tosses you the keys to a borrowed coupe. "Finish on the podium by the lake and we\'ll talk about a real seat."' },
  { id: 1, name: 'Mesa Run', place: 'Moab, Utah', lat: 38.5733, lon: -109.5498, theme: 'desert', laps: 2, rivals: 3, skill: 0.84, seed: 27, radius: 190,
    story: 'Word travels. A desert promoter wants new faces in red-rock country. The heat makes the asphalt slick — brake early into the canyon hairpins.' },
  { id: 2, name: 'Neon Loop', place: 'Shibuya, Tokyo', lat: 35.6595, lon: 139.7005, theme: 'neon', laps: 3, rivals: 4, skill: 0.88, seed: 41, radius: 160,
    story: 'Midnight in Tokyo. This is where you first see Vesper — silver car, no number, never loses. She smiles at your coupe like it\'s a toy.' },
  { id: 3, name: 'Alpine Pass', place: 'Zermatt, Switzerland', lat: 46.0207, lon: 7.7491, theme: 'alpine', laps: 2, rivals: 4, skill: 0.91, seed: 58, radius: 210,
    story: 'Snow walls and thin air. Ezra rebuilt the suspension overnight. Drift wide, stay smooth, and the mountain will let you through.' },
  { id: 4, name: 'Coastline Sprint', place: 'Amalfi, Italy', lat: 40.634, lon: 14.6027, theme: 'coast', laps: 3, rivals: 5, skill: 0.94, seed: 73, radius: 200,
    story: 'Cliffs, lemon groves and the whole crew watching from the harbor. Vesper is entered too. Beat her here and she has to answer the challenge.' },
  { id: 5, name: 'Caldera Crown', place: 'Reykjanes, Iceland', lat: 63.889, lon: -22.27, theme: 'volcano', laps: 3, rivals: 5, skill: 0.98, seed: 97, radius: 230, goal: 1,
    story: 'The final race, on black rock beside a living volcano. Only first place counts. Vesper is waiting at the line. Bring it home.' },
];
export const RIVAL_NAMES = ['Vesper', 'Kito', 'Marlowe', 'Juno', 'Rask', 'Odette', 'Lin'];
export const RIVAL_COLORS = ['#d9dde6', '#3cb4ff', '#ffc531', '#2fd39a', '#b06cff', '#ff6fae', '#f1ece2'];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function trackPoints(level) {
  const r = rng(level.seed), n = 12, pts = [];
  const h = [1 + r() * 2, 2 + Math.floor(r() * 2), 3 + Math.floor(r() * 2)].map(k => Math.round(k));
  const amp = [0.16 + r() * 0.1, 0.1 + r() * 0.08, 0.05 + r() * 0.05], ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const sx = 1 + r() * 0.5, sz = 1 - r() * 0.15;
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2;
    let rad = 1; for (let k = 0; k < 3; k++) rad += amp[k] * Math.sin(h[k] * t + ph[k]);
    rad *= level.radius * (0.92 + r() * 0.16);
    pts.push(new THREE.Vector3(Math.cos(t) * rad * sx, 0, Math.sin(t) * rad * sz));
  }
  return pts;
}

function stripeTex(draw, w = 128, h = 512, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t;
}

export class Track {
  constructor(level, scene) {
    this.level = level; this.theme = THEMES[level.theme]; this.width = 16;
    const curve = new THREE.CatmullRomCurve3(trackPoints(level), true, 'centripetal');
    const len = curve.getLength(); this.length = len;
    const N = Math.round(len / 2.5); this.N = N;
    const pts = curve.getSpacedPoints(N).slice(0, N);
    this.px = new Float32Array(N); this.pz = new Float32Array(N); this.nx = new Float32Array(N); this.nz = new Float32Array(N); this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.px[i] = pts[i].x; this.pz[i] = pts[i].z; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N; let tx = this.px[b] - this.px[a], tz = this.pz[b] - this.pz[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      this.tx[i] = tx; this.tz[i] = tz; this.nx[i] = tz; this.nz[i] = -tx; // normal = left/right side
    }
    // curvature per sample (for AI speed)
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const j = (i + 6) % N; const d = Math.atan2(this.tx[i] * this.tz[j] - this.tz[i] * this.tx[j], this.tx[i] * this.tx[j] + this.tz[i] * this.tz[j]); this.curv[i] = Math.abs(d); }
    this.group = new THREE.Group(); scene.add(this.group);
    this.build();
  }
  ribbon(offA, offB, y, vScale, material, vertical = 0) {
    const N = this.N, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 4), idx = [];
    let dist = 0;
    for (let k = 0; k <= N; k++) {
      const i = k % N; if (k > 0) dist += Math.hypot(this.px[i] - this.px[(k - 1) % N], this.pz[i] - this.pz[(k - 1) % N]);
      const nx = this.nx[i], nz = this.nz[i];
      if (vertical) {
        pos.set([this.px[i] + nx * offA, y, this.pz[i] + nz * offA, this.px[i] + nx * offA, y + vertical, this.pz[i] + nz * offA], k * 6);
      } else {
        pos.set([this.px[i] + nx * offA, y, this.pz[i] + nz * offA, this.px[i] + nx * offB, y, this.pz[i] + nz * offB], k * 6);
      }
      uv.set([0, dist / vScale, 1, dist / vScale], k * 4);
      if (k < N) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; this.group.add(m); return m;
  }
  build() {
    const W = this.width, th = this.theme;
    const asphalt = stripeTex((x, w, h) => {
      x.fillStyle = th.night ? '#2a2836' : '#3b3d45'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(5, 0, 3, h); x.fillRect(w - 8, 0, 3, h);
      x.fillStyle = 'rgba(255,214,120,.8)'; for (let y = 0; y < h; y += 128) x.fillRect(w / 2 - 2, y, 4, 64);
    });
    this.ribbon(-W / 2, W / 2, 0.02, 24, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }));
    const curb = stripeTex((x, w, h) => { for (let y = 0; y < h; y += 64) { x.fillStyle = (y / 64) % 2 ? '#f2f2f2' : '#e0313b'; x.fillRect(0, y, w, 64); } }, 16, 256);
    const curbMat = new THREE.MeshStandardMaterial({ map: curb, roughness: 0.7 });
    this.ribbon(W / 2, W / 2 + 1.4, 0.04, 8, curbMat); this.ribbon(-W / 2 - 1.4, -W / 2, 0.04, 8, curbMat);
    // run-off shoulder
    const sh = new THREE.MeshStandardMaterial({ color: th.night ? '#26243a' : new THREE.Color(th.ground).multiplyScalar(0.82), roughness: 1 });
    this.ribbon(W / 2 + 1.4, W / 2 + 6, 0.015, 10, sh); this.ribbon(-W / 2 - 6, -W / 2 - 1.4, 0.015, 10, sh);
    // barriers
    const wallTex = stripeTex((x, w, h) => { for (let y = 0; y < h; y += 32) { x.fillStyle = (y / 32) % 2 ? '#ffffff' : (th.night ? '#ff3fb4' : '#2b6fe0'); x.fillRect(0, y, w, 32); } }, 8, 128);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.DoubleSide, roughness: 0.6, emissive: th.night ? '#401040' : '#000', emissiveMap: th.night ? wallTex : null });
    const wall = W / 2 + 6.2; this.wall = wall - 1.1;
    this.ribbon(wall, wall, 0, 6, wallMat, 1.1); this.ribbon(-wall, -wall, 0, 6, wallMat, 1.1);
    // start line + gantry
    const chk = stripeTex((x, w, h) => { const s = w / 8; for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * s, j * s, s, s); } }, 128, 32, false);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshStandardMaterial({ map: chk }));
    line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(this.tx[0], this.tz[0]) + Math.PI / 2; line.position.set(this.px[0], 0.05, this.pz[0]);
    line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(this.tx[0], this.tz[0]));
    this.group.add(line);
    const gantry = new THREE.Group(), gm = new THREE.MeshStandardMaterial({ color: '#20222b', flatShading: true });
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), gm); p.position.set(s * (W / 2 + 2), 3.5, 0); p.castShadow = true; gantry.add(p); });
    const bannerTex = stripeTex((x, w, h) => { x.fillStyle = '#ff5a3c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '700 64px "Chakra Petch", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('OVERPASS', w / 2, h / 2 + 4); }, 512, 96, false);
    const ban = new THREE.Mesh(new THREE.BoxGeometry(W + 5, 1.6, 0.5), [gm, gm, gm, gm, new THREE.MeshStandardMaterial({ map: bannerTex, emissive: '#ff5a3c', emissiveIntensity: 0.25, emissiveMap: bannerTex }), new THREE.MeshStandardMaterial({ map: bannerTex })]);
    ban.position.y = 7; gantry.add(ban);
    gantry.position.set(this.px[0], 0, this.pz[0]); gantry.rotation.y = Math.atan2(this.tx[0], this.tz[0]); this.group.add(gantry);
    this.scenery();
  }
  distToTrack(x, z) { let best = 1e9; for (let i = 0; i < this.N; i += 3) { const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2; if (d < best) best = d; } return Math.sqrt(best); }
  scenery() {
    const th = this.theme, r = rng(this.level.seed * 7 + 3);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < this.N; i++) { minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]); minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]); }
    const pad = 180; minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const spots = [];
    for (let i = 0; i < 1600 && spots.length < 520; i++) {
      const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ), d = this.distToTrack(x, z);
      if (d < this.width / 2 + 12) continue;
      if (th.water && x > maxX - pad * 0.75) continue;
      spots.push([x, z, d, r()]);
    }
    const g = this.group, kind = th.props;
    const inst = (geo, material, list, scaleFn, yOff = 0) => {
      const m = new THREE.InstancedMesh(geo, material, list.length); const o = new THREE.Object3D();
      list.forEach((s, i) => { const sc = scaleFn(s); o.position.set(s[0], yOff * sc[1], s[1]); o.rotation.set(0, s[3] * 6.28, 0); o.scale.set(sc[0], sc[1], sc[2] ?? sc[0]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    };
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o });
    if (kind === 'pines' || kind === 'snowpines') {
      const cone = new THREE.ConeGeometry(2.2, 6, 7); cone.translate(0, 5, 0);
      const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6); trunk.translate(0, 1.2, 0);
      inst(trunk, M('#5a3d2b'), spots, s => [1 + s[3] * 0.6, 1 + s[3] * 0.6]);
      inst(cone, M(kind === 'snowpines' ? '#2c5440' : '#2f6b3f'), spots, s => [1 + s[3] * 0.6, 1 + s[3] * 0.6]);
      if (kind === 'snowpines') { const cap = new THREE.ConeGeometry(1.1, 2.2, 7); cap.translate(0, 7.1, 0); inst(cap, M('#ffffff'), spots, s => [1 + s[3] * 0.6, 1 + s[3] * 0.6]); }
    } else if (kind === 'cacti') {
      const cyl = new THREE.CylinderGeometry(0.5, 0.6, 5, 7); cyl.translate(0, 2.5, 0);
      inst(cyl, M('#4f8a3c'), spots.slice(0, 260), s => [1, 0.7 + s[3]]);
      const mesa = new THREE.CylinderGeometry(1, 1.25, 1, 6); mesa.translate(0, 0.5, 0);
      inst(mesa, M('#b8603a'), spots.filter(s => s[2] > 60).slice(0, 70), s => [10 + s[3] * 18, 12 + s[3] * 30, 9 + s[3] * 14]);
    } else if (kind === 'city') {
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      const winTex = stripeTex((x, w, h) => { x.fillStyle = '#141225'; x.fillRect(0, 0, w, h); for (let yy = 4; yy < h; yy += 12) for (let xx = 4; xx < w; xx += 10) { if (Math.random() < 0.55) { x.fillStyle = ['#ffcf7a', '#7af0ff', '#ff6fd0', '#fff2d6'][Math.floor(Math.random() * 4)]; x.fillRect(xx, yy, 5, 6); } } }, 64, 256);
      const bm = new THREE.MeshStandardMaterial({ color: '#ffffff', map: winTex, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 0.9, roughness: 0.6 });
      inst(box, bm, spots.filter(s => s[2] > 22).slice(0, 300), s => [8 + s[3] * 14, 12 + s[3] * s[3] * 70, 8 + ((s[3] * 7) % 1) * 14]);
      const lamp = new THREE.CylinderGeometry(0.12, 0.12, 6, 5); lamp.translate(0, 3, 0);
      const lampSpots = []; for (let i = 0; i < this.N; i += 14) { [-1, 1].forEach(sd => lampSpots.push([this.px[i] + this.nx[i] * sd * (this.width / 2 + 4), this.pz[i] + this.nz[i] * sd * (this.width / 2 + 4), 0, 0])); }
      inst(lamp, M('#222'), lampSpots, () => [1, 1]);
      const bulb = new THREE.SphereGeometry(0.45, 8, 6); bulb.translate(0, 6.2, 0);
      inst(bulb, new THREE.MeshBasicMaterial({ color: '#ff9ce6' }), lampSpots, () => [1, 1]);
    } else if (kind === 'palms') {
      const trunk = new THREE.CylinderGeometry(0.25, 0.4, 7, 6); trunk.translate(0, 3.5, 0);
      inst(trunk, M('#8a6a45'), spots.slice(0, 300), s => [1, 0.8 + s[3] * 0.5]);
      const crown = new THREE.ConeGeometry(3, 1.6, 7); crown.translate(0, 7.4, 0);
      inst(crown, M('#3f9b4f'), spots.slice(0, 300), s => [1, 0.8 + s[3] * 0.5]);
      const bush = new THREE.IcosahedronGeometry(1.4, 0); bush.translate(0, 0.8, 0);
      inst(bush, M('#e9d36a'), spots.slice(300), s => [1 + s[3], 0.8 + s[3] * 0.5]);
    } else if (kind === 'rocks') {
      const rock = new THREE.DodecahedronGeometry(1, 0);
      inst(rock, M('#3a3336'), spots, s => [1.5 + s[3] * 5, 1 + s[3] * 4, 1.5 + s[3] * 4], 0.3);
      const cone = new THREE.ConeGeometry(160, 120, 9, 1, true); const vol = new THREE.Mesh(cone, M('#2a2224'));
      vol.position.set(maxX + 120, 50, (minZ + maxZ) / 2); g.add(vol);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 6, 9), new THREE.MeshBasicMaterial({ color: '#ff6a2a' })); glow.position.set(maxX + 120, 108, (minZ + maxZ) / 2); g.add(glow);
      const crackSpots = spots.slice(0, 80); const crack = new THREE.PlaneGeometry(1, 1); crack.rotateX(-Math.PI / 2); crack.translate(0, 0.03, 0);
      inst(crack, new THREE.MeshBasicMaterial({ color: '#ff5a1f' }), crackSpots, s => [0.6 + s[3] * 1.2, 1, 6 + s[3] * 12]);
    }
    if (th.water) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: kind === 'pines' ? '#3a5f8f' : '#2b8fc7', roughness: 0.25, metalness: 0.2 }));
      water.rotation.x = -Math.PI / 2; water.position.set(maxX - pad * 0.7 + 2000, 0.03, 0); g.add(water);
    }
  }
  nearest(x, z, hint) {
    const N = this.N; let best = -1, bd = 1e18;
    if (hint == null || hint < 0) { for (let i = 0; i < N; i++) { const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
    else { for (let k = -25; k <= 25; k++) { const i = (hint + k + N) % N; const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
    const lat = (x - this.px[best]) * this.nx[best] + (z - this.pz[best]) * this.nz[best];
    return { idx: best, lat };
  }
  gridPos(slot) {
    const N = this.N, back = Math.round((8 + Math.floor(slot / 2) * 9) / 2.5), i = (N - back) % N, side = slot % 2 ? -1 : 1;
    const x = this.px[i] + this.nx[i] * side * 3.6, z = this.pz[i] + this.nz[i] * side * 3.6;
    return { x, z, yaw: Math.atan2(this.tx[i], this.tz[i]), idx: i };
  }
  dispose(scene) { scene.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}

// Race: player + AI rivals, laps, positions.
export class Race {
  constructor(track, level, playerCar, scene) {
    this.track = track; this.level = level; this.scene = scene; this.time = 0; this.started = false; this.finished = false; this.countdown = 3.6;
    this.racers = [];
    const nR = level.rivals;
    const slots = [...Array(nR + 1).keys()];
    const pSlot = nR; // player starts at the back
    this.player = this.addRacer(playerCar, 'You', pSlot, false);
    for (let i = 0; i < nR; i++) {
      const c = new Car(RIVAL_COLORS[i % RIVAL_COLORS.length]); scene.add(c.mesh);
      const rr = this.addRacer(c, RIVAL_NAMES[i], slots[i], true);
      rr.skill = level.skill * (1 - i * 0.025) * (0.97 + Math.random() * 0.05); rr.lane = (Math.random() - 0.5) * 6;
      c.maxSpeed = 50 * rr.skill + 4;
    }
  }
  addRacer(car, name, slot, ai) {
    const g = this.track.gridPos(slot); car.place(g.x, g.z, g.yaw);
    const r = { car, name, ai, idx: g.idx, lap: 0, progress: 0, half: false, finished: false, finishTime: 0, lapStart: 0, bestLap: Infinity, lastLap: 0, wrongWay: 0, startedBehind: true };
    this.racers.push(r); return r;
  }
  update(dt) {
    const T = this.track, N = T.N;
    if (!this.started) { this.countdown -= dt; if (this.countdown <= 0) { this.started = true; } }
    else if (!this.finished) this.time += dt;
    for (const r of this.racers) {
      const c = r.car;
      if (r.ai) this.drive(r, dt);
      if (!this.started) { c.input.throttle = 0; c.input.brake = 0; c.input.boost = false; c.vx = 0; c.vz = 0; }
      if (r.finished && !r.ai) { c.input.throttle = 0; c.input.brake = c.speed > 1 ? 0.3 : 0; c.input.steer *= 0.9; }
      const n = T.nearest(c.x, c.z, r.idx);
      c.offroad = Math.abs(n.lat) > T.width / 2 + 1.4;
      if (this.started) c.update(dt); else c.sync(dt);
      // walls
      const n2 = T.nearest(c.x, c.z, n.idx);
      if (Math.abs(n2.lat) > T.wall) {
        const s = Math.sign(n2.lat), i = n2.idx, over = Math.abs(n2.lat) - T.wall;
        c.x -= T.nx[i] * s * over; c.z -= T.nz[i] * s * over;
        const hit = c.bump(-T.nx[i] * s, -T.nz[i] * s, 0.2);
        if (!r.ai && hit > 4) this.onHit && this.onHit(hit);
        c.sync(0);
      }
      // progress / laps
      const prev = r.idx; r.idx = n2.idx;
      if (prev > N * 0.4 && prev < N * 0.6) r.half = true;
      if (prev > N * 0.85 && r.idx < N * 0.15) {
        if (r.startedBehind) { r.startedBehind = false; r.lapStart = this.time; }
        else if (r.half) {
          r.lap++; r.half = false; const lt = this.time - r.lapStart; r.lastLap = lt; r.bestLap = Math.min(r.bestLap, lt); r.lapStart = this.time;
          if (!r.ai && this.onLap) this.onLap(r);
          if (r.lap >= this.level.laps && !r.finished) { r.finished = true; r.finishTime = this.time; r.place = this.racers.filter(o => o.finished).length; if (!r.ai) this.finished = true; }
        }
      }
      if (prev < N * 0.15 && r.idx > N * 0.85 && !r.startedBehind) { r.startedBehind = true; } // reversed over the line
      r.progress = (r.startedBehind ? -1 : r.lap) * N + (r.startedBehind ? r.idx - N : r.idx);
      if (r.startedBehind && r.idx < N * 0.5) r.progress = r.lap * N + r.idx; // safety
      // wrong-way detection
      const dot = c.vx * T.tx[r.idx] + c.vz * T.tz[r.idx];
      r.wrongWay = dot < -3 ? r.wrongWay + dt : 0;
    }
    // car-car collisions
    const R = this.racers;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i].car, b = R[j].car; const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 0.0001) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (3 - d) / 2;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) { const imp = -rv * 0.6; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp; if ((!R[i].ai || !R[j].ai) && this.onHit) this.onHit(imp * 1.5); }
        a.sync(0); b.sync(0);
      }
    }
    // ranking
    const ranked = [...R].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1; return b.progress - a.progress;
    });
    ranked.forEach((r, i) => r.pos = i + 1);
    this.ranked = ranked;
  }
  drive(r, dt) {
    const T = this.track, N = T.N, c = r.car, sp = c.speed;
    const la = Math.round((9 + Math.max(0, sp) * 0.55) / 2.5);
    const i = (r.idx + la) % N;
    const tx = T.px[i] + T.nx[i] * r.lane, tz = T.pz[i] + T.nz[i] * r.lane;
    const want = Math.atan2(tx - c.x, tz - c.z);
    let d = want - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    c.input.steer = Math.max(-1, Math.min(1, d * 2.6));
    let curv = 0; for (let k = 4; k < 40; k += 4) curv = Math.max(curv, T.curv[(r.idx + k) % N] * (1 - k / 60));
    let rb = 1; const pl = this.player; if (pl && !r.finished) { const gap = (pl.progress - r.progress) / N; rb = 1 + Math.max(-0.08, Math.min(0.1, gap * 0.25)); }
    const target = c.maxSpeed * rb * (1 - Math.min(0.62, curv * 2.4));
    c.input.throttle = sp < target ? 1 : 0; c.input.brake = sp > target + 4 ? 0.6 : 0; c.input.handbrake = false; c.input.boost = false;
    if (Math.random() < dt * 0.15) r.lane = Math.max(-5, Math.min(5, r.lane + (Math.random() - 0.5) * 4));
    if (r.finished) { c.input.throttle = 0.4; }
  }
  resetPlayer() {
    const T = this.track, r = this.player, i = r.idx; r.car.place(T.px[i], T.pz[i], Math.atan2(T.tx[i], T.tz[i]));
  }
  dispose() { for (const r of this.racers) if (r.ai) this.scene.remove(r.car.mesh); }
}
