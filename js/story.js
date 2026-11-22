import * as THREE from 'three';
import { Car } from './car.js';
import { Landscape, ELEVATION } from './storyland.js';

export const THEMES = {
  lakeside: { sky: ['#2b3a78', '#f6a76b'], fog: '#e9a27a', ground: '#5f8a4e', sun: '#ffd2a0', hemi: ['#ffd9b8', '#3d5a3a'], light: 1.6, props: 'pines', water: true },
  desert: { sky: ['#3f7fd0', '#ffd9a8'], fog: '#f2c99a', ground: '#d99a5e', sun: '#fff1d6', hemi: ['#fff0dd', '#a0603a'], light: 2.0, props: 'cacti' },
  neon: { sky: ['#0b0820', '#3b1d5e'], fog: '#2a1748', ground: '#1b1a28', sun: '#c3a8ff', hemi: ['#6d5bd6', '#141020'], light: 0.6, props: 'city', night: true },
  alpine: { sky: ['#5d8fd8', '#e8f1ff'], fog: '#dfe8f5', ground: '#eef3f8', sun: '#ffffff', hemi: ['#ffffff', '#9fb2c8'], light: 1.7, props: 'snowpines' },
  coast: { sky: ['#2f8fe0', '#bfe8ff'], fog: '#bfe3f2', ground: '#7fb35a', sun: '#fff6e0', hemi: ['#f4fbff', '#4c7a3a'], light: 1.9, props: 'palms', water: true },
  volcano: { sky: ['#1a1016', '#7a3324'], fog: '#5a2a22', ground: '#2d2729', sun: '#ff9a5a', hemi: ['#ff9a6a', '#1d1416'], light: 1.0, props: 'rocks', lava: true },
  // variations on the six landscapes: different light, season and time of day
  forest: { sky: ['#4a6fa8', '#f3d3a2'], fog: '#e2c7a0', ground: '#7d8a4c', sun: '#ffe0b0', hemi: ['#ffe6c4', '#5a4a2e'], light: 1.7, props: 'pines', water: true, tint: '#b3a46a', autumn: true, leafyShare: 0.6 },
  dusk: { sky: ['#2a2350', '#ff8a5c'], fog: '#e98a6a', ground: '#c97a4e', sun: '#ffb27a', hemi: ['#ffb894', '#6a3a2a'], light: 1.25, props: 'cacti' },
  harbor: { sky: ['#070b22', '#283a78'], fog: '#1b2752', ground: '#1f2c26', sun: '#9fb4ff', hemi: ['#5a6fd0', '#10141c'], light: 0.55, props: 'palms', water: true, night: true },
  glacier: { sky: ['#34508f', '#ffc9d6'], fog: '#e8d6e4', ground: '#f2f4f8', sun: '#ffd8c8', hemi: ['#ffe8ee', '#8a96b8'], light: 1.4, props: 'snowpines' },
  downtown: { sky: ['#1c1446', '#ff7a59'], fog: '#5a2d55', ground: '#22202c', sun: '#ffb08a', hemi: ['#ff9aa0', '#191424'], light: 0.85, props: 'city', night: true },
  ash: { sky: ['#4d5866', '#c9b39a'], fog: '#9c8a7a', ground: '#3a3436', sun: '#ffe1c0', hemi: ['#e8d8c8', '#2a2224'], light: 1.4, props: 'rocks', lava: true },
};

// scenery: what you'll see along the track
export const LEVELS = [
  { id: 0, name: 'Harbor Lights', place: 'Burlington, Vermont', lat: 44.4759, lon: -73.2207, theme: 'lakeside', laps: 2, rivals: 3, skill: 0.86, seed: 11, radius: 150,
    scenery: 'An evening lap along a big lake. Pine woods and leafy trees line gentle rolling hills, a few houses look out over the water, and the sun sets behind the far shore.' },
  { id: 1, name: 'Mesa Run', place: 'Moab, Utah', lat: 38.5733, lon: -109.5498, theme: 'desert', laps: 2, rivals: 3, skill: 0.9, seed: 27, radius: 190,
    scenery: 'Red-rock desert under a hard blue sky. Flat-topped mesas, sand dunes, saguaro cacti and scattered boulders, with the road climbing and dropping through the dunes.' },
  { id: 2, name: 'Neon Loop', place: 'Shibuya, Tokyo', lat: 35.6595, lon: 139.7005, theme: 'neon', laps: 3, rivals: 4, skill: 0.93, seed: 41, radius: 160,
    scenery: 'A night street circuit through a dense city. Glowing towers, pink street lamps and lit barriers on nearly flat tarmac.' },
  { id: 3, name: 'Alpine Pass', place: 'Zermatt, Switzerland', lat: 46.0207, lon: 7.7491, theme: 'alpine', laps: 2, rivals: 4, skill: 0.96, seed: 58, radius: 210,
    scenery: 'A snowy valley ringed by white peaks. Snow-capped pines and wooden chalets, and the biggest climbs and descents of the early races.' },
  { id: 4, name: 'Coastline Sprint', place: 'Amalfi, Italy', lat: 40.634, lon: 14.6027, theme: 'coast', laps: 3, rivals: 5, skill: 0.99, seed: 73, radius: 200,
    scenery: 'Sea cliffs above bright blue water. Pastel hillside villages, palm trees and lemon groves, with steep swoops up and down the cliffside.' },
  { id: 5, name: 'Caldera Crown', place: 'Reykjanes, Iceland', lat: 63.889, lon: -22.27, theme: 'volcano', laps: 3, rivals: 5, skill: 1.02, seed: 97, radius: 230, goal: 1,
    scenery: 'Black lava rock under a red sky. Glowing lava pools beside the track, a smoking volcano with a burning crater on the horizon, and boulders everywhere.' },
  { id: 6, name: 'Maple Ridge', place: 'Stowe, Vermont', lat: 44.4654, lon: -72.6874, theme: 'forest', laps: 3, rivals: 5, skill: 1.03, seed: 113, radius: 220,
    scenery: 'Peak autumn in the mountains. Maples in red, orange and gold mixed with dark pines, golden meadows and a still lake under a soft afternoon sun.' },
  { id: 7, name: 'Sunset Canyon', place: 'Sedona, Arizona', lat: 34.8697, lon: -111.761, theme: 'dusk', laps: 3, rivals: 5, skill: 1.05, seed: 131, radius: 250,
    scenery: 'Red desert at golden hour. Tall mesas glow orange against a purple sky, and long cactus shadows stretch across a fast, sweeping track.' },
  { id: 8, name: 'Marina Nights', place: 'Monaco', lat: 43.7384, lon: 7.4246, theme: 'harbor', laps: 4, rivals: 6, skill: 1.07, seed: 149, radius: 175,
    scenery: 'A tight night circuit around a moonlit harbor. Palms, hillside villas and dark sea beside the barriers, with deep blue sky over the water.' },
  { id: 9, name: 'Glacier Run', place: 'Tromsø, Norway', lat: 69.6492, lon: 18.9553, theme: 'glacier', laps: 2, rivals: 6, skill: 1.09, seed: 167, radius: 270,
    scenery: 'Arctic snowfields in pink polar twilight. Snow-heavy pines, snowed-in cabins and huge climbs and drops over a long, flowing lap.' },
  { id: 10, name: 'Downtown Dusk', place: 'Chicago, Illinois', lat: 41.8781, lon: -87.6298, theme: 'downtown', laps: 4, rivals: 6, skill: 1.11, seed: 181, radius: 165,
    scenery: 'City streets just after sunset. Office towers light up one window at a time under an orange-to-violet sky, with lamp-lined straights and tight corners.' },
  { id: 11, name: 'Ashfall', place: 'Mount Etna, Sicily', lat: 37.751, lon: 14.9934, theme: 'ash', laps: 3, rivals: 6, skill: 1.14, seed: 199, radius: 260, goal: 1,
    scenery: 'The slopes of an active volcano under a hazy, ash-grey sky. Lava channels cut through dark rock fields, and the crater glows on the skyline. Only first place counts.' },
];
export const RIVAL_NAMES = ['Vesper', 'Kito', 'Marlowe', 'Juno', 'Rask', 'Odette', 'Lin'];
export const RIVAL_COLORS = ['#d9dde6', '#3cb4ff', '#ffc531', '#2fd39a', '#b06cff', '#ff6fae', '#f1ece2'];
// how hard the rivals push: pace multiplies their speed, catch-up how much they speed up when they fall behind you
export const DIFFICULTY = { easy: { pace: 0.9, corner: 0.85, catchup: 0.04, label: 'Easy' }, normal: { pace: 1, corner: 0.95, catchup: 0.08, label: 'Normal' }, hard: { pace: 1.045, corner: 1, catchup: 0.11, label: 'Hard' } };

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function trackPoints(level) {
  // custom maps (level editor) carry their own control points, in metres
  if (Array.isArray(level.pts) && level.pts.length >= 3) return level.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
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

// the track's centre line: points every 2.5 m, directions, curvature and the hills along it
export function trackShape(level) {
  const curve = new THREE.CatmullRomCurve3(trackPoints(level), true, 'centripetal');
  const len = curve.getLength(), N = Math.round(len / 2.5), pts = curve.getSpacedPoints(N).slice(0, N);
  const S = { len, N, px: new Float32Array(N), pz: new Float32Array(N), tx: new Float32Array(N), tz: new Float32Array(N), nx: new Float32Array(N), nz: new Float32Array(N), curv: new Float32Array(N), sk: new Float32Array(N), hy: new Float32Array(N) };
  for (let i = 0; i < N; i++) { S.px[i] = pts[i].x; S.pz[i] = pts[i].z; }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N; let tx = S.px[b] - S.px[a], tz = S.pz[b] - S.pz[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    S.tx[i] = tx; S.tz[i] = tz; S.nx[i] = tz; S.nz[i] = -tx; // normal = left/right side
  }
  // curvature per sample (how much the road turns over the next 15 m), and signed curvature per metre (negative: bending toward +normal)
  for (let i = 0; i < N; i++) { const j = (i + 6) % N; const d = Math.atan2(S.tx[i] * S.tz[j] - S.tz[i] * S.tx[j], S.tx[i] * S.tx[j] + S.tz[i] * S.tz[j]); S.curv[i] = Math.abs(d); S.sk[i] = d / 15; }
  // elevation along the track: two smooth waves that close up exactly at the finish line; steepest grade kept around 12%
  { const r = rng(level.seed * 3 + 1), E = (ELEVATION[level.theme] || 6) * (level.hills ?? 1), k1 = 1 + (level.seed % 2), k2 = 3 + (level.seed % 2), p1 = r() * 6.28, p2 = r() * 6.28; let s = 0;
    const D = new Float32Array(N); for (let i = 1; i < N; i++) { s += Math.hypot(S.px[i] - S.px[i - 1], S.pz[i] - S.pz[i - 1]); D[i] = s; } const L = s + Math.hypot(S.px[0] - S.px[N - 1], S.pz[0] - S.pz[N - 1]);
    for (let i = 0; i < N; i++) { const t = D[i] / L * Math.PI * 2; S.hy[i] = 0.62 * Math.sin(k1 * t + p1) + 0.38 * Math.sin(k2 * t + p2); }
    let g = 0; for (let i = 0; i < N; i++) { const j = (i + 1) % N, d = Math.hypot(S.px[j] - S.px[i], S.pz[j] - S.pz[i]) || 1; g = Math.max(g, Math.abs(S.hy[j] - S.hy[i]) / d); }
    const amp = Math.min(E, ((THEMES[level.theme] || {}).props === 'snowpines' ? 0.14 : 0.12) / Math.max(1e-4, g)); for (let i = 0; i < N; i++) S.hy[i] *= amp; }
  return S;
}
// numbers for the race menu: lap length, corners, height gained and lost, sharpest bend
const INFO = new Map();
export function trackInfo(level) {
  const key = level.id + '|' + (level.rev || ''); if (INFO.has(key)) return INFO.get(key);
  const S = trackShape(level), N = S.N;
  // smooth the curvature over ~20 m, then count each stretch that bends harder than a ~110 m radius as one corner
  const k = new Float32Array(N); for (let i = 0; i < N; i++) { let a = 0; for (let j = -4; j <= 4; j++) a += S.sk[(i + j + N) % N]; k[i] = a / 9; }
  let corners = 0, inC = Math.abs(k[N - 1]) > 1 / 110, tight = 0, hairpins = 0, peak = 0;
  for (let i = 0; i < N; i++) {
    const c = Math.abs(k[i]) > 1 / 110;
    if (c && !inC) { corners++; peak = 0; }
    if (c) peak = Math.max(peak, Math.abs(k[i]));
    if (!c && inC) { if (peak > 1 / 45) hairpins++; }
    tight = Math.max(tight, Math.abs(k[i])); inC = c;
  }
  let lo = Infinity, hi = -Infinity, climb = 0; for (let i = 0; i < N; i++) { lo = Math.min(lo, S.hy[i]); hi = Math.max(hi, S.hy[i]); const d = S.hy[(i + 1) % N] - S.hy[i]; if (d > 0) climb += d; }
  let straight = 0, run = 0; for (let i = 0; i < 2 * N; i++) { if (Math.abs(k[i % N]) < 1 / 300) { run += 2.5; straight = Math.max(straight, run); } else run = 0; }
  const info = { length: S.len, corners: Math.max(corners, 1), hairpins, minRadius: tight > 0 ? 1 / tight : Infinity, relief: hi - lo, climb, straight: Math.min(straight, S.len) };
  INFO.set(key, info); return info;
}

function stripeTex(draw, w = 128, h = 512, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t;
}

export class Track {
  constructor(level, scene, quality = 'high') {
    this.level = level; this.theme = THEMES[level.theme]; this.width = 16; this.quality = quality;
    const S = trackShape(level); this.length = S.len; this.N = S.N;
    for (const k of ['px', 'pz', 'tx', 'tz', 'nx', 'nz', 'curv', 'sk', 'hy']) this[k] = S[k];
    this.racingLine();
    this.group = new THREE.Group(); scene.add(this.group);
    this.build();
  }
  ribbon(offA, offB, y, vScale, material, vertical = 0) {
    const N = this.N, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 4), idx = [];
    let dist = 0;
    for (let k = 0; k <= N; k++) {
      const i = k % N; if (k > 0) dist += Math.hypot(this.px[i] - this.px[(k - 1) % N], this.pz[i] - this.pz[(k - 1) % N]);
      const nx = this.nx[i], nz = this.nz[i], h = this.hy[i];
      if (vertical) {
        pos.set([this.px[i] + nx * offA, y + h, this.pz[i] + nz * offA, this.px[i] + nx * offA, y + h + vertical, this.pz[i] + nz * offA], k * 6);
      } else {
        pos.set([this.px[i] + nx * offA, y + h, this.pz[i] + nz * offA, this.px[i] + nx * offB, y + h, this.pz[i] + nz * offB], k * 6);
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
    line.position.y = this.hy[0] + 0.07; line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(this.tx[0], this.tz[0]));
    this.group.add(line);
    const gantry = new THREE.Group(), gm = new THREE.MeshStandardMaterial({ color: '#20222b', flatShading: true });
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), gm); p.position.set(s * (W / 2 + 2), 3.5, 0); p.castShadow = true; gantry.add(p); });
    const bannerTex = stripeTex((x, w, h) => { x.fillStyle = '#ff5a3c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '700 64px "Chakra Petch", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('OVERPASS', w / 2, h / 2 + 4); }, 512, 96, false);
    const ban = new THREE.Mesh(new THREE.BoxGeometry(W + 5, 1.6, 0.5), [gm, gm, gm, gm, new THREE.MeshStandardMaterial({ map: bannerTex, emissive: '#ff5a3c', emissiveIntensity: 0.25, emissiveMap: bannerTex }), new THREE.MeshStandardMaterial({ map: bannerTex })]);
    ban.position.y = 7; gantry.add(ban);
    gantry.position.set(this.px[0], this.hy[0], this.pz[0]); gantry.rotation.y = Math.atan2(this.tx[0], this.tz[0]); this.group.add(gantry);
    // the landscape: terrain with hills, water, trees, buildings (storyland.js); the old flat props if that fails
    try { this.land = new Landscape(this, this.group, this.quality); } catch (e) { console.error('[overpass] story landscape failed, using simple scenery:', e); this.land = null; this.hy.fill(0); this.scenery(); }
  }
  // the rivals' racing line and corner speeds: swing wide before a bend, clip the inside at the apex, run out wide after it;
  // and how fast each point can be taken (the car can only swing its nose so fast: yaw rate ~ 2.3 rad/s, a bit less at speed)
  racingLine() {
    const N = this.N, k = new Float32Array(N), line = new Float32Array(N), vC = new Float32Array(N);
    for (let i = 0; i < N; i++) { let a = 0; for (let j = -6; j <= 6; j++) a += this.sk[(i + j + N) % N]; k[i] = a / 13; }
    for (let i = 0; i < N; i++) {
      // inside of the bend at the apex, outside a little earlier and later
      const kin = k[i], kpre = k[(i + 14) % N], kpost = k[(i - 14 + N) % N];
      const off = -kin * 420 + (kpre + kpost) * 150;
      line[i] = Math.max(-5.6, Math.min(5.6, off));
      const kap = Math.max(1e-4, Math.abs(kin));
      vC[i] = 2.3 / (kap + 2.3 / 120);
    }
    // smooth the line so it flows
    for (let pass = 0; pass < 3; pass++) { const c = line.slice(); for (let i = 0; i < N; i++) line[i] = (c[(i - 2 + N) % N] + c[(i - 1 + N) % N] * 2 + c[i] * 2 + c[(i + 1) % N] * 2 + c[(i + 2) % N]) / 8; }
    this.line = line; this.vC = vC;
  }
  heightAt(x, z) { return this.land ? this.land.heightAt(x, z) : 0; }
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
    return { x, z, y: this.hy[i], yaw: Math.atan2(this.tx[i], this.tz[i]), idx: i };
  }
  dispose(scene) { scene.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData && o.material.userData.U) o.material.dispose(); }); }
}

// Race: player + AI rivals, laps, positions.
export class Race {
  constructor(track, level, playerCar, scene, difficulty = 'normal') {
    this.track = track; this.level = level; this.scene = scene; this.time = 0; this.started = false; this.finished = false; this.countdown = 3.6;
    this.racers = []; this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    const nR = level.rivals;
    const slots = [...Array(nR + 1).keys()];
    const pSlot = nR; // player starts at the back
    this.player = this.addRacer(playerCar, 'You', pSlot, false);
    // the rivals get machinery as good as yours: their top speed and acceleration are set from your car (upgrades and all),
    // then scaled by how good each driver is, so upgrading alone never makes the races easy
    const ps = playerCar.stats || {}, pTop = Math.max(52, (playerCar.maxSpeed || 52) * (ps.top || 1)), pAcc = Math.max(19, (playerCar.accel || 19) * (ps.accel || 1));
    for (let i = 0; i < nR; i++) {
      const c = new Car(RIVAL_COLORS[i % RIVAL_COLORS.length]); scene.add(c.mesh);
      const rr = this.addRacer(c, RIVAL_NAMES[i], slots[i], true), cs = c.stats || {};
      // the front-runners are the best drivers; the back of the grid is a little slower and brakes a little earlier
      rr.skill = level.skill * (1 - i * 0.012) * (0.985 + Math.random() * 0.03);
      const pace = this.diff.pace * (0.8 + 0.2 * rr.skill);
      c.maxSpeed = pTop * pace / (cs.top || 1); c.accel = pAcc * (0.94 + 0.06 * rr.skill) * this.diff.pace / (cs.accel || 1);
      rr.cornerK = Math.min(1.02, this.diff.corner * (0.8 + 0.2 * rr.skill)); rr.lane = (Math.random() - 0.5) * 1.6; rr.pass = 0; rr.passSide = 1; rr.mistake = 0;
      c.boost = 1; c.nitroTop = 1.2; c.nitroPush = 1.5; rr.baseTop = c.maxSpeed;
    }
  }
  addRacer(car, name, slot, ai) {
    const g = this.track.gridPos(slot); car.place(g.x, g.z, g.yaw, g.y); car.pitch = car.roll = 0; car.air = false;
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
      if (this.track.land) this.follow(c, dt, !r.ai);
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
      if (d2 < 9 && d2 > 0.0001 && Math.abs((a.y || 0) - (b.y || 0)) < 2) {
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
    // overtaking: someone slower just ahead on our line? pull out beside them for a while
    if (r.pass > 0) r.pass -= dt;
    else for (const o of this.racers) {
      if (o === r) continue; const dx = o.car.x - c.x, dz = o.car.z - c.z, ahead = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), side = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw);
      if (ahead > 2 && ahead < 16 && Math.abs(side) < 3.2 && o.car.speed < sp + 1.5) {
        const here = T.line[r.idx] + r.lane; r.passSide = here > 1.5 ? -1 : here < -1.5 ? 1 : (side > 0 ? -1 : 1); r.pass = 2.2; break;
      }
    }
    const passOff = r.pass > 0 ? r.passSide * 3.4 : 0;
    // steer for a point ahead on the racing line (further ahead the faster we go)
    const la = Math.round((7 + Math.max(0, sp) * 0.42) / 2.5), i = (r.idx + la) % N;
    const lat = Math.max(-6, Math.min(6, T.line[i] + r.lane + passOff));
    const tx = T.px[i] + T.nx[i] * lat, tz = T.pz[i] + T.nz[i] * lat;
    let d = Math.atan2(tx - c.x, tz - c.z) - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    c.input.steer = Math.max(-1, Math.min(1, d * 3.2));
    // braking points: the fastest speed from which we can still slow to every corner speed ahead in time (braking ~24 m/s²)
    const kk = r.cornerK * (r.mistake > 0 ? 0.88 : 1); let target = Infinity;
    for (let k = 0, dist = 0; k < 90; k += 2, dist += 5) { const v = T.vC[(r.idx + k) % N] * kk; target = Math.min(target, Math.sqrt(v * v + 2 * 24 * Math.max(0, dist - sp * 0.25))); }
    // rubber band: catch up when you're ahead of them, ease off only a touch when they're far in front
    let rb = 1; const pl = this.player; if (pl && !r.finished) { const gap = (pl.progress - r.progress) / N; rb = 1 + Math.max(-0.03, Math.min(this.diff.catchup, gap * 0.35)); }
    c.maxSpeed = r.baseTop * rb; const top = c.maxSpeed * (c.stats ? c.stats.top : 1);
    target = Math.min(target, top * 1.3);
    // the odd small mistake from the weaker drivers: a bend taken too cautiously
    if (r.mistake > 0) r.mistake -= dt; else if (Math.random() < dt * 0.04 * (1.12 - r.skill)) r.mistake = 1.2;
    c.input.throttle = sp < target - 0.5 ? 1 : sp < target + 0.5 ? 0.35 : 0;
    c.input.brake = sp > target + 1.2 ? Math.min(1, (sp - target) * 0.12 + 0.2) : 0;
    c.input.handbrake = false;
    // nitro on the straights, when the next stretch is fast and the tank has some in it
    c.input.boost = !r.finished && target > top * 1.08 && Math.abs(d) < 0.12 && (c.boost > 0.45 || (c.boosting && c.boost > 0.05));
    if (r.finished) { c.input.throttle = 0.4; c.input.boost = false; }
  }
  // hills: ride the ground, roll and pitch with it, get air over crests, and feel the slope (uphill slows you, downhill speeds you up)
  follow(p, dt, me) {
    const T = this.track, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx, cy = p.y || 0, H = (x, z) => T.heightAt(x, z);
    const hF = H(p.x + fx * 1.6, p.z + fz * 1.6), hB = H(p.x - fx * 1.6, p.z - fz * 1.6), hR = H(p.x + rx * 0.9, p.z + rz * 0.9), hL = H(p.x - rx * 0.9, p.z - rz * 0.9);
    const ground = (hF + hB + hR + hL) / 4, slopeF = (hF - hB) / 3.2, slopeR = (hR - hL) / 1.8;
    if (p.vy == null) p.vy = 0;
    if (p.air) {
      p.vy -= 24 * dt; p.y = cy + p.vy * dt;
      if (p.y <= ground) { const impact = -p.vy; p.y = ground; p.air = false; p.vy = 0; if (me && impact > 6 && this.onHit) this.onHit(Math.min(14, impact)); }
    } else if (ground < cy - 0.35 && Math.abs(p.speed) > 12 && dt > 0) { p.air = true; p.vy = Math.min(8, Math.max(-2, p.lastVy || 0)); p.y = cy + p.vy * dt; }
    else { p.lastVy = dt > 0 ? Math.max(-20, Math.min(20, (ground - cy) / dt)) : 0; p.y = ground; }
    if (!p.air && this.started) { const a = -9.8 * slopeF / Math.sqrt(1 + slopeF * slopeF) * 0.85; p.vx += fx * a * dt; p.vz += fz * a * dt; }
    const tp = -Math.atan(slopeF), tr = Math.atan(slopeR), k = 1 - Math.exp(-dt * (p.air ? 2 : 12));
    p.pitch = (p.pitch || 0) + ((p.air ? tp * 0.5 : tp) - (p.pitch || 0)) * k; p.roll = (p.roll || 0) + (tr - (p.roll || 0)) * k;
    p.sync(0);
  }
  resetPlayer() {
    const T = this.track, r = this.player, i = r.idx; r.car.place(T.px[i], T.pz[i], Math.atan2(T.tx[i], T.tz[i]), T.hy[i]); r.car.pitch = r.car.roll = 0; r.car.air = false; r.car.vy = 0;
  }
  dispose() { for (const r of this.racers) if (r.ai) this.scene.remove(r.car.mesh); }
}
