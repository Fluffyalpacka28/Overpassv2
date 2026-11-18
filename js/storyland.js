import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainMaterial, paintVerge } from './terrainmat.js';
import { waterMaterial } from './water.js';
import { barkTexture, foliageTexture, rockTexture, pavingTexture } from './textures.js';
import { newBuilders, addBuilding, buildingMaterials } from './buildings.js';
import { crowdAtlas, CROWD_POSES } from './people.js';

// The landscape around a story race track: rolling terrain with real elevation (the track rises and falls with it),
// the same ground shader, water, rock and grass as World Drive, plus each theme's own scenery:
//   lakeside: pine and leafy woods, a lake with a far shore, a few houses       desert: dunes, flat-topped mesas, canyon walls, saguaros, boulders
//   neon    : a night city of lit towers and street lamps                        alpine: a valley ringed by snowy peaks, snow-capped pines, chalets
//   coast   : cliffs down to the sea, pastel hillside villages, palms, lemon trees
//   volcano : black rock, lava pools and a smoking volcano with a glowing crater
// Everything is built once when the track loads, mostly as instanced meshes.

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, z, s) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}
const fbm = (x, z, s, oct = 4) => { let v = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { v += vnoise(x * f, z * f, s + o * 17) * a; n += a; a *= 0.5; f *= 2.03; } return v / n; };
const ridge = (x, z, s) => { let v = 0, a = 0.55, f = 1; for (let o = 0; o < 4; o++) { v += (1 - Math.abs(vnoise(x * f, z * f, s + o * 31) * 2 - 1)) ** 2 * a; a *= 0.5; f *= 2.1; } return v; };

// how much each theme's track climbs and dips (metres either way)
export const ELEVATION = { lakeside: 7, desert: 12, neon: 4, alpine: 24, coast: 16, volcano: 12 };
const TINT = { lakeside: '#8fae78', desert: '#ffffff', neon: '#8a8796', alpine: '#ffffff', coast: '#9cb874', volcano: '#ffffff' };

// ---------- ground textures for the non-grass themes ----------
function canvasTex(draw, S = 256) {
  const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const speckle = (x, S, n, cols, sz = 2) => { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; const s = sz * (0.5 + Math.random()); x.fillRect(Math.random() * S, Math.random() * S, s, s); } };
const TEX = {};
const sandTexture = () => TEX.sand || (TEX.sand = canvasTex((x, S) => {
  x.fillStyle = '#d6a46c'; x.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) { x.fillStyle = `rgba(${y % 2 ? '255,230,190' : '150,95,50'},${0.05 + Math.random() * 0.05})`; x.fillRect(0, y + Math.sin(y * 0.2) * 2, S, 1.5); } // wind ripples
  speckle(x, S, 2600, ['rgba(255,236,200,.35)', 'rgba(120,70,35,.25)', 'rgba(190,120,70,.3)']);
}));
const snowTexture = () => TEX.snow || (TEX.snow = canvasTex((x, S) => {
  x.fillStyle = '#eef3f8'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, 'rgba(170,190,215,.18)'); g.addColorStop(1, 'rgba(170,190,215,0)'); x.save(); x.translate(Math.random() * S, Math.random() * S); x.fillStyle = g; x.fillRect(-30, -30, 60, 60); x.restore(); }
  speckle(x, S, 1800, ['rgba(255,255,255,.9)', 'rgba(190,205,225,.4)'], 1.6);
}));
const ashTexture = () => TEX.ash || (TEX.ash = canvasTex((x, S) => {
  x.fillStyle = '#3a3436'; x.fillRect(0, 0, S, S);
  speckle(x, S, 3200, ['rgba(20,16,18,.6)', 'rgba(95,85,86,.45)', 'rgba(70,40,30,.35)'], 2.6);
}));
const BASE = { desert: sandTexture, alpine: snowTexture, volcano: ashTexture, neon: () => pavingTexture() };

// ---------- props ----------
let PROPS = null;
function props() {
  if (PROPS) return PROPS;
  const bark = new THREE.MeshStandardMaterial({ color: '#8a6a4c', map: barkTexture(), roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', map: foliageTexture(), roughness: 0.95, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: '#f4f8fc', roughness: 0.8, flatShading: true });
  const cactus = new THREE.MeshStandardMaterial({ color: '#5c8f45', roughness: 0.8, flatShading: true });
  const rock = new THREE.MeshStandardMaterial({ color: '#ffffff', map: rockTexture(), roughness: 0.95, flatShading: true });
  const NI = g => g.index ? g.toNonIndexed() : g;
  const group = (...parts) => { const g = mergeGeometries(parts.map(p => NI(p[0])), true); return g; };
  // pine: three stacked cones
  const pine = () => {
    const t = new THREE.CylinderGeometry(0.28, 0.42, 2.4, 6); t.translate(0, 1.2, 0);
    const c1 = new THREE.ConeGeometry(2.3, 3.8, 8); c1.translate(0, 3.6, 0); const c2 = new THREE.ConeGeometry(1.8, 3.2, 8); c2.translate(0, 5.2, 0); const c3 = new THREE.ConeGeometry(1.1, 2.4, 7); c3.translate(0, 6.7, 0);
    return [t, mergeGeometries([NI(c1), NI(c2), NI(c3)])];
  };
  const snowCap = () => { const a = new THREE.ConeGeometry(1.25, 1.5, 7); a.translate(0, 7.25, 0); const b = new THREE.ConeGeometry(1.95, 0.9, 8); b.translate(0, 5.95, 0); const c = new THREE.ConeGeometry(2.4, 0.9, 8); c.translate(0, 4.35, 0); return mergeGeometries([NI(a), NI(b), NI(c)]); };
  // leafy tree: trunk + lumpy crown
  const leafy = () => {
    const t = new THREE.CylinderGeometry(0.25, 0.4, 3, 6); t.translate(0, 1.5, 0);
    const parts = [[0, 4.4, 0, 2.2], [1.1, 3.9, 0.4, 1.5], [-0.9, 4.0, -0.5, 1.6], [0.2, 5.4, -0.2, 1.4]].map(([x, y, z, r]) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); return NI(s); });
    return [t, mergeGeometries(parts)];
  };
  // palm: a gently curved trunk and drooping fronds
  const palm = () => {
    const segs = []; let x = 0, y = 0;
    for (let k = 0; k < 6; k++) { const c = new THREE.CylinderGeometry(0.22 - k * 0.012, 0.3 - k * 0.012, 1.35, 6); c.rotateZ(-k * 0.045); c.translate(x, y + 0.67, 0); segs.push(NI(c)); x += Math.sin(k * 0.045) * 1.35 + 0.08; y += 1.3; }
    const fr = [];
    for (let k = 0; k < 8; k++) { const f = new THREE.ConeGeometry(0.5, 3.6, 4, 1); f.scale(1, 1, 0.18); f.rotateZ(Math.PI / 2 + 0.55); f.translate(1.6, -0.35, 0); f.rotateY(k / 8 * Math.PI * 2); f.translate(x, y + 0.2, 0); fr.push(NI(f)); }
    const nut = new THREE.IcosahedronGeometry(0.42, 0); nut.translate(x, y, 0); fr.push(NI(nut));
    return [mergeGeometries(segs), mergeGeometries(fr)];
  };
  // saguaro with two arms
  const saguaro = () => {
    const p = [], cyl = (r, h, x, y, z, rz = 0) => { const c = new THREE.CylinderGeometry(r, r * 1.05, h, 8); if (rz) c.rotateZ(rz); c.translate(x, y, z); p.push(NI(c)); const cap = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(x, y + h / 2, z); if (!rz) p.push(NI(cap)); };
    cyl(0.45, 6, 0, 3, 0); cyl(0.3, 1.2, 0.85, 2.6, 0, Math.PI / 2); cyl(0.3, 2.2, 1.4, 3.6, 0); cyl(0.28, 1.0, -0.75, 3.4, 0, Math.PI / 2); cyl(0.28, 1.6, -1.2, 4.1, 0);
    return mergeGeometries(p);
  };
  const boulder = () => {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + hash2(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)) * 0.45; p.setXYZ(i, x * k, y * k * 0.7, z * k); }
    g.computeVertexNormals(); return g;
  };
  const lamp = () => { const pole = new THREE.CylinderGeometry(0.1, 0.14, 7, 6); pole.translate(0, 3.5, 0); const arm = new THREE.BoxGeometry(0.12, 0.12, 1.6); arm.translate(0, 6.95, 0.7); return mergeGeometries([NI(pole), NI(arm)]); };
  const bulb = () => { const b = new THREE.BoxGeometry(0.5, 0.18, 0.8); b.translate(0, 6.82, 1.35); return b; };
  return (PROPS = { bark, leaf, snow, cactus, rock, pine: pine(), snowCap: snowCap(), leafy: leafy(), palm: palm(), saguaro: saguaro(), boulder: boulder(), lamp: lamp(), bulb: bulb(), group });
}

// ---------- lava ----------
let LAVA = null;
function lavaMaterial() {
  if (LAVA) return LAVA;
  LAVA = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]), fog: true,
    vertexShader: `varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() { vec4 lp = vec4(position, 1.0);
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
#endif
  vec4 wp = modelMatrix * lp; vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
float h(vec2 p) { p = mod(p, 512.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vW.xz * 0.08; float t = uTime * 0.12;
  float a = n(p + vec2(t, t * 0.6)) * 0.55 + n(p * 2.3 - vec2(t * 0.8, -t)) * 0.3 + n(p * 5.1 + t) * 0.15;
  float crust = smoothstep(0.42, 0.62, a);                          // dark cooled crust floating on glowing rock
  vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.35), smoothstep(0.1, 0.4, a)) * 2.2;
  vec3 col = mix(hot, vec3(0.09, 0.05, 0.05), crust);
  col += vec3(1.0, 0.3, 0.05) * 0.6 * (1.0 - crust) * (0.6 + 0.4 * sin(uTime * 1.3 + a * 9.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  return LAVA;
}
export function updateLava(dt) { if (LAVA) LAVA.uniforms.uTime.value = (LAVA.uniforms.uTime.value + dt) % 1000; }

// the crowd's billboards: each person turns to face the camera (upright), picks a pose from the atlas by the crowd's mood
function crowdMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uTime: { value: 0 }, uMood: { value: 0 }, uCols: { value: atlas.cols }, uRows: { value: atlas.rows }, uPoses: { value: CROWD_POSES } }]),
    fog: true, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aInfo; uniform float uTime, uMood, uCols, uRows, uPoses; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  float design = aInfo.x, sit = aInfo.y, rnd = aInfo.z, h = aInfo.w;
  bool joins = (uMood > 0.5 && uMood < 1.5) ? rnd < 0.85 : (uMood > 1.5 ? rnd < 0.7 : false);
  float t = uTime * (3.0 + rnd * 1.4) + rnd * 20.0, beat = step(0.5, fract(t)), pose = sit > 0.5 ? 3.0 : 0.0, hop = 0.0;
  if (joins && uMood < 1.5) { if (sit > 0.5 && rnd < 0.45) pose = 4.0 + beat; else { pose = 1.0 + beat; hop = max(0.0, sin(t * 3.14159)) * 0.18; sit = 0.0; } }
  else if (joins) { pose = 6.0 + step(0.5, fract(t * 0.35)); sit = 0.0; }
  else if (sit < 0.5 && fract(uTime * 0.05 + rnd) < 0.08) pose = 1.0;            // the odd idle wave
  float cell = design * uPoses + pose, cx = mod(cell, uCols), cy = floor(cell / uCols);
  vUv = vec2((cx + uv.x) / uCols, 1.0 - (cy + 1.0 - uv.y) / uRows);
  vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  if (sit < 0.5) base.y += 0.4 * aInfo.y;                                        // seated people stand up when they join in
  base.y += hop;
  vec3 toCam = cameraPosition - base.xyz; toCam.y = 0.0; vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + 1e-5);
  vec3 wp = base.xyz + right * position.x * h * 0.62 + vec3(0.0, position.y * h * 1.06, 0.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D uMap; varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(uMap, vUv); if (c.a < 0.45) discard;
  gl_FragColor = vec4(c.rgb * 0.92, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  m.uniforms.uMap.value = atlas.tex; return m;
}
export class Landscape {
  // track: { px, pz, hy, N, width, theme, level }, group: where to add meshes
  constructor(track, group, quality = 'high') {
    const T = track, th = T.theme, kind = th.props, lvl = T.level; this.track = T; this.group = group; this.kind = kind; this.theme = th;
    this.seed = lvl.seed * 131 + 7;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minH = 1e9, maxH = -1e9;
    for (let i = 0; i < T.N; i++) { minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]); minZ = Math.min(minZ, T.pz[i]); maxZ = Math.max(maxZ, T.pz[i]); minH = Math.min(minH, T.hy[i]); maxH = Math.max(maxH, T.hy[i]); }
    this.bb = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
    this.inner = T.width / 2 + 7.6;                                   // flat ground out to just past the barriers
    this.waterLevel = th.water ? minH - (kind === 'palms' ? 12 : 2.6) : null;
    this.lavaLevel = th.lava ? minH - 3.2 : null;
    this.volc = th.lava ? { x: maxX + 420, z: (minZ + maxZ) / 2 } : null;
    // ---- the height grid near the track (4 m), with the nearest track sample for every cell ----
    const PAD = 700, G = 4; this.G = G;
    this.x0 = Math.floor((minX - PAD) / G) * G; this.z0 = Math.floor((minZ - PAD) / G) * G;
    this.nx = Math.ceil((maxX + PAD - this.x0) / G) + 1; this.nz = Math.ceil((maxZ + PAD - this.z0) / G) + 1;
    const NX = this.nx, NZ = this.nz, n = NX * NZ, near = new Int32Array(n).fill(-1), q = new Int32Array(n);
    let qh = 0, qt = 0;
    for (let i = 0; i < T.N; i++) { const ci = Math.round((T.px[i] - this.x0) / G), cj = Math.round((T.pz[i] - this.z0) / G), k = cj * NX + ci; if (near[k] < 0) { near[k] = i; q[qt++] = k; } }
    const nd = (k, i) => { const x = this.x0 + (k % NX) * G - T.px[i], z = this.z0 + Math.floor(k / NX) * G - T.pz[i]; return x * x + z * z; };
    while (qh < qt) { // spread outwards; take a neighbour's sample when it's closer (close enough to a true nearest-point map)
      const k = q[qh++], i = near[k], ci = k % NX, cj = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; const kk = b * NX + a;
        if (near[kk] < 0) { near[kk] = i; q[qt++] = kk; } else if (near[kk] !== i && nd(kk, i) < nd(kk, near[kk]) - 1) near[kk] = i;
      }
    }
    this.near = near; this.H = new Float32Array(n); this.D = new Float32Array(n);
    // a softly blurred map of the track's height, so the land around follows its rise and fall without seams
    { const S = 4, bx = Math.ceil(NX / S), bz = Math.ceil(NZ / S); let A = new Float32Array(bx * bz), B = new Float32Array(bx * bz);
      for (let j = 0; j < bz; j++) for (let i = 0; i < bx; i++) A[j * bx + i] = T.hy[near[Math.min(NZ - 1, j * S) * NX + Math.min(NX - 1, i * S)]];
      const r = 6; for (let pass = 0; pass < 3; pass++) for (const dir of [0, 1]) { for (let j = 0; j < bz; j++) for (let i = 0; i < bx; i++) { let sum = 0, cnt = 0; for (let o = -r; o <= r; o++) { const a = dir ? i : i + o, b = dir ? j + o : j; if (a < 0 || b < 0 || a >= bx || b >= bz) continue; sum += A[b * bx + a]; cnt++; } B[j * bx + i] = sum / cnt; } const t = A; A = B; B = t; }
      this.reg = { A, bx, bz, S }; }
    // the track's height at a cell: the nearest sample's height carried along the slope there (so the ground beside the road matches it smoothly)
    const N = T.N, slope = new Float32Array(N); for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; slope[i] = (T.hy[b] - T.hy[a]) / (Math.hypot(T.px[b] - T.px[a], T.pz[b] - T.pz[a]) || 1); }
    for (let k = 0; k < n; k++) { const i = near[k], x = this.x0 + (k % NX) * G, z = this.z0 + Math.floor(k / NX) * G, d = Math.sqrt(nd(k, i)); this.D[k] = d; const along = Math.max(-2, Math.min(2, (x - T.px[i]) * T.tx[i] + (z - T.pz[i]) * T.tz[i])); this.H[k] = this.blend(x, z, d, T.hy[i] + along * slope[i]); }
    this.build(quality);
  }
  // the land away from the track (no track influence)
  natural(x, z) {
    const s = this.seed, k = this.kind, bb = this.bb;
    let h = (fbm(x / 240, z / 240, s) - 0.5) * 2;
    switch (k) {
      case 'pines': { h = h * 16 + (fbm(x / 70, z / 70, s + 5) - 0.5) * 4; // rolling hills, a lake to the east with a far shore
        const L = smooth(bb.maxX + 30, bb.maxX + 140, x) * (1 - smooth(bb.maxX + 950, bb.maxX + 1150, x));
        return h * (1 - L) + (this.waterLevel - 7 + (fbm(x / 90, z / 90, s + 9) - 0.5) * 4) * L; }
      case 'palms': { h = h * 10 + (fbm(x / 60, z / 60, s + 5) - 0.5) * 3; // hills climbing to mountains in the west, cliffs down to the sea in the east
        h += 150 * smooth(bb.minX - 60, bb.minX - 600, x) * (0.55 + 0.45 * ridge(x / 300, z / 300, s + 3));
        const L = smooth(bb.maxX + 26, bb.maxX + 70, x);
        return h * (1 - L) + (this.waterLevel - 10) * L; }
      case 'cacti': { h = h * 5 + (fbm(x / 45, z / 90, s + 5) - 0.5) * 3; // dunes plus mesas
        const m = fbm(x / 420, z / 420, s + 11); h += 52 * smooth(0.6, 0.625, m) + 22 * smooth(0.7, 0.72, m);
        return h; }
      case 'snowpines': return h * 18 + (fbm(x / 80, z / 80, s + 5) - 0.5) * 5;
      case 'rocks': { h = h * 7 + (fbm(x / 35, z / 35, s + 5) - 0.5) * 5; // broken lava field with pits that fill with lava
        h -= 20 * smooth(0.6, 0.68, fbm(x / 150, z / 150, s + 13));
        const dv = Math.hypot(x - this.volc.x, z - this.volc.z); h += 240 * Math.pow(1 - smooth(0, 640, dv), 1.2) - 70 * (1 - smooth(40, 110, dv));
        return h; }
      default: return h * 3; // city: nearly flat
    }
  }
  // land around the track: flat at the track's height right beside it, blending into the natural land further out;
  // mountain ranges / canyon walls ring the valley the track runs through
  blend(x, z, d, ht) {
    const k = this.kind; let nat = this.natural(x, z);
    if (k === 'snowpines') nat += 330 * Math.pow(smooth(140, 720, d), 1.5) * (0.5 + 0.5 * ridge(x / 260, z / 260, this.seed + 3));
    else if (k === 'cacti') { nat *= smooth(50, 140, d) * 0.85 + 0.15; nat += 95 * smooth(480, 680, d) * (0.6 + 0.4 * smooth(0.45, 0.55, fbm(x / 160, z / 160, this.seed + 21))); }
    else if (k === 'rocks') nat *= 0.35 + 0.65 * smooth(30, 160, d);
    nat += this.regional(x, z) * Math.exp(-d / 240) * (1 - smooth(380, 640, d)); // the land nearby follows the track's own rise and fall
    const w = smooth(this.inner, this.inner + (k === 'snowpines' ? 40 : 55), d);
    return ht * (1 - w) + nat * w;
  }
  regional(x, z) {
    const g = this.reg; if (!g) return 0; const gx = Math.max(0, Math.min(g.bx - 1.001, (x - this.x0) / (this.G * g.S))), gz = Math.max(0, Math.min(g.bz - 1.001, (z - this.z0) / (this.G * g.S)));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, A = g.A, k = j * g.bx + i;
    return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fz) + (A[k + g.bx] * (1 - fx) + A[k + g.bx + 1] * fx) * fz;
  }
  // ground height anywhere (what cars drive on)
  heightAt(x, z) {
    const gx = (x - this.x0) / this.G, gz = (z - this.z0) / this.G;
    if (gx < 0 || gz < 0 || gx >= this.nx - 1 || gz >= this.nz - 1) return this.blend(x, z, 1e4, 0);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, NX = this.nx, H = this.H, k = j * NX + i;
    return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fz) + (H[k + NX] * (1 - fx) + H[k + NX + 1] * fx) * fz;
  }
  distAt(x, z) { const i = Math.round((x - this.x0) / this.G), j = Math.round((z - this.z0) / this.G); if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 1e4; return this.D[j * this.nx + i]; }
  inWater(x, z) { return (this.waterLevel != null && this.heightAt(x, z) < this.waterLevel - 0.2) || (this.lavaLevel != null && this.heightAt(x, z) < this.lavaLevel - 0.2); }
  slopeAt(x, z) { const h = this.heightAt(x, z); return Math.max(Math.abs(this.heightAt(x + 2, z) - h), Math.abs(this.heightAt(x, z + 2) - h)) / 2; }

  build(quality) {
    const th = this.theme, k = this.kind, lo = quality === 'low';
    // ---- terrain: a fine mesh around the track and a coarse skirt out to the horizon ----
    const mat = terrainMaterial(BASE[k] ? { map: BASE[k](), plain: true } : {});
    const tint = new THREE.Color(TINT[this.themeName()] || '#8fae78');
    const R = lo ? 12 : 8, ext = { x0: this.x0, z0: this.z0, x1: this.x0 + (this.nx - 1) * this.G, z1: this.z0 + (this.nz - 1) * this.G };
    const inner = this.grid(ext.x0, ext.z0, ext.x1, ext.z1, R, tint, true);
    this.add(new THREE.Mesh(inner, mat), false, true);
    const cv = {}; const segs = []; const T = this.track; for (let i = 0; i < T.N; i += 3) { const j = (i + 3) % T.N; segs.push({ x0: T.px[i], z0: T.pz[i], x1: T.px[j], z1: T.pz[j], hw: T.width / 2 + 2.2 }); }
    const size = Math.max(ext.x1 - ext.x0, ext.z1 - ext.z0); mat.userData.U.uVerge.value = paintVerge(cv, ext.x0, ext.z0, size, segs); mat.userData.U.uChunk.value.set(ext.x0, ext.z0, size);
    const omat = terrainMaterial(BASE[k] ? { map: BASE[k](), plain: true } : {});
    const SK = 1800, C = 48; this.add(new THREE.Mesh(this.grid(ext.x0 - SK, ext.z0 - SK, ext.x1 + SK, ext.z1 + SK, C, tint, false, ext), omat), false, true);
    // ---- water / lava ----
    if (this.waterLevel != null) this.liquid(this.waterLevel, waterMaterial(), ext, SK, true);
    if (this.lavaLevel != null) { this.liquid(this.lavaLevel, lavaMaterial(), ext, SK, false); this.crater(); }
    this.scenery(lo);
  }
  themeName() { return { pines: 'lakeside', cacti: 'desert', city: 'neon', snowpines: 'alpine', palms: 'coast', rocks: 'volcano' }[this.kind]; }
  add(m, cast = true, recv = true) { m.castShadow = cast; m.receiveShadow = recv; this.group.add(m); return m; }
  // terrain grid; the coarse skirt skips the middle (where the fine mesh is) and sits a touch lower so they never fight
  grid(x0, z0, x1, z1, R, tint, fine, hole = null) {
    const nx = Math.round((x1 - x0) / R) + 1, nz = Math.round((z1 - z0) / R) + 1, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), idx = [], c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * R, z = z0 + j * R, o = (j * nx + i) * 3; let y = this.heightAt(x, z);
      if (fine) { const d = this.distAt(x, z); y -= 0.22 * (1 - smooth(this.inner - 1, this.inner + 1, d)); } else y -= 0.6;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      const v = 0.9 + vnoise(x / 23, z / 23, this.seed + 77) * 0.2; c.copy(tint).multiplyScalar(v);
      if (this.kind === 'snowpines' && y < 6 && this.distAt(x, z) < 400) c.lerp(new THREE.Color('#d9e2ea'), 0.25);
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (hole) { const xa = x0 + i * R, za = z0 + j * R; if (xa >= hole.x0 + R && xa + R <= hole.x1 - R && za >= hole.z0 + R && za + R <= hole.z1 - R) continue; }
      const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1; idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // a water (or lava) surface over every patch of ground below its level, with a "shore" value for the foam
  liquid(level, mat, ext, SK, isWater) {
    const R = 16, x0 = ext.x0 - SK, z0 = ext.z0 - SK, nx = Math.round((ext.x1 - ext.x0 + 2 * SK) / R) + 1, nz = Math.round((ext.z1 - ext.z0 + 2 * SK) / R) + 1;
    const dep = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) dep[j * nx + i] = level - this.heightAt(x0 + i * R, z0 + j * R);
    const pos = [], sh = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; if (Math.max(dep[a], dep[a + 1], dep[a + nx], dep[a + nx + 1]) < -0.5) continue;
      const P = (ii, jj) => { pos.push(x0 + ii * R, level, z0 + jj * R); sh.push(Math.max(0, Math.min(14, dep[jj * nx + ii] * 1.6))); };
      P(i, j); P(i, j + 1); P(i + 1, j); P(i + 1, j); P(i, j + 1); P(i + 1, j + 1);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('shore', new THREE.Float32BufferAttribute(sh, 1)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.renderOrder = isWater ? 1 : 0; this.add(m, false, false);
  }
  crater() {
    const v = this.volc, top = this.heightAt(v.x, v.z), y = top + 18;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(78, 40), lavaMaterial()); disc.rotation.x = -Math.PI / 2; disc.position.set(v.x, y, v.z); this.add(disc, false, false);
    // a smoke plume: a stack of soft billboards
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(70,60,60,.75)'); gr.addColorStop(1, 'rgba(70,60,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(c), r = rng(this.seed + 5);
    for (let k = 0; k < 14; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, fog: true, opacity: 0.85 - k * 0.04 })); s.position.set(v.x + (r() - 0.5) * 40 + k * 9, y + 30 + k * 34, v.z + (r() - 0.5) * 40); s.scale.setScalar(90 + k * 26); this.group.add(s); }
  }

  // ---------- trees, rocks, buildings, lamps ----------
  scenery(lo) {
    const T = this.track, k = this.kind, r = rng(this.seed + 99), P = props(), bb = this.bb;
    const okGround = (x, z, maxSlope = 0.55, minD = this.inner + 5) => this.distAt(x, z) > minD && !this.inWater(x, z) && this.slopeAt(x, z) < maxSlope && !this.taken(x, z);
    this.lots = [];
    // instanced helper: list of { x, z, s, ry, c } -> one InstancedMesh (multi-material geometry groups supported)
    const inst = (geo, mat, list, sink = 0.15, color = null) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D(), cc = new THREE.Color();
      list.forEach((p, i) => { o.position.set(p.x, this.heightAt(p.x, p.z) - sink * p.s, p.z); o.rotation.set(p.rx || 0, p.ry, 0); o.scale.set(p.s * (p.sx || 1), p.s * (p.sy || 1), p.s * (p.sx || 1)); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (color) { m.setColorAt(i, color(cc, p)); } });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      return this.add(m, true, true);
    };
    const scatter = (count, minD, maxD, test) => { // spots spread around the track, denser near it
      const out = [];
      for (let t = 0; t < count * 6 && out.length < count; t++) {
        const i = Math.floor(r() * T.N), side = r() < 0.5 ? -1 : 1, d = minD + Math.pow(r(), 1.6) * (maxD - minD);
        const x = T.px[i] + T.nx[i] * side * d + (r() - 0.5) * 30, z = T.pz[i] + T.nz[i] * side * d + (r() - 0.5) * 30;
        if (test(x, z)) out.push({ x, z, s: 0.8 + r() * 0.7, ry: r() * 6.28, sy: 0.9 + r() * 0.3, v: r() });
      }
      return out;
    };
    const tree = (pair, list, color) => { inst(pair[0], P.bark, list, 0.1); return inst(pair[1], P.leaf, list, 0.1, color); };
    const tone = (lo, hi) => (c, p) => c.setRGB(lo + (hi - lo) * p.v, lo + (hi - lo) * p.v * 1.05, lo + (hi - lo) * p.v * 0.9);
    const leafCol = (a, b) => { const A = new THREE.Color(a), B = new THREE.Color(b); return (c, p) => c.copy(A).lerp(B, p.v); };
    // buildings first so trees keep off them
    this.buildings(r);
    this.grandstand();
    const rocks = scatter(lo ? 120 : 260, this.inner + 6, 520, (x, z) => !this.inWater(x, z) && !this.taken(x, z) && (this.slopeAt(x, z) > 0.35 || r() < 0.25));
    rocks.forEach(p => { p.s = (this.slopeAt(p.x, p.z) > 0.35 ? 1 + r() * 2.2 : 0.5 + r() * 1.2) * (r() < 0.07 ? 2.2 : 1); p.rx = (r() - 0.5) * 0.6; p.sx = 0.8 + r() * 0.6; });
    const rockTint = { rocks: [0.32, 0.42], cacti: [0.75, 0.95], snowpines: [0.6, 0.8] }[k] || [0.62, 0.82];
    inst(P.boulder, P.rock, rocks, 0.25, k === 'cacti' ? (c, p) => c.setRGB(0.95, 0.68 + p.v * 0.1, 0.5 + p.v * 0.08) : tone(rockTint[0], rockTint[1]));
    if (k === 'pines' || k === 'snowpines') {
      const N = lo ? 700 : 1500, pts = scatter(N, this.inner + 6, 620, (x, z) => okGround(x, z, 0.75) && (k !== 'snowpines' || this.heightAt(x, z) < 120) && vnoise(x / 70, z / 70, this.seed + 4) > 0.33);
      const pines = k === 'snowpines' ? pts : pts.filter(p => p.v < 0.65), leafy = k === 'snowpines' ? [] : pts.filter(p => p.v >= 0.65);
      tree(P.pine, pines, leafCol(k === 'snowpines' ? '#2f5a46' : '#2f6a3c', k === 'snowpines' ? '#3d6b52' : '#4f8a45'));
      if (k === 'snowpines') inst(P.snowCap, P.snow, pines, 0.1);
      tree(P.leafy, leafy, leafCol('#5a8f3e', '#8fa83f'));
    } else if (k === 'palms') {
      const pts = scatter(lo ? 260 : 520, this.inner + 4, 420, (x, z) => okGround(x, z, 0.6));
      tree(P.palm, pts.filter(p => p.v < 0.5), leafCol('#4f9a44', '#7db04a'));
      tree(P.leafy, pts.filter(p => p.v >= 0.5).map(p => ({ ...p, s: p.s * 0.65 })), leafCol('#5f8f2f', '#9cb43a')); // lemon trees
    } else if (k === 'cacti') {
      inst(P.saguaro, P.cactus, scatter(lo ? 160 : 320, this.inner + 4, 520, (x, z) => okGround(x, z, 0.4)), 0.2, (c, p) => c.setRGB(0.85 + p.v * 0.2, 0.9 + p.v * 0.15, 0.85));
    } else if (k === 'city') {
      // street lamps on both sides of the track
      const lamps = []; for (let i = 0; i < T.N; i += 12) for (const sd of [-1, 1]) { const off = T.width / 2 + 7.2, x = T.px[i] + T.nx[i] * sd * off, z = T.pz[i] + T.nz[i] * sd * off; lamps.push({ x, z, s: 1, ry: Math.atan2(-T.nx[i] * sd, -T.nz[i] * sd), v: 0 }); }
      inst(P.lamp, new THREE.MeshStandardMaterial({ color: '#2a2a33', metalness: 0.6, roughness: 0.4 }), lamps, 0);
      inst(P.bulb, new THREE.MeshBasicMaterial({ color: '#ffd9f2', toneMapped: false }), lamps, 0);
    } else if (k === 'rocks') {
      // glowing cracks in the black rock
      const cracks = scatter(lo ? 60 : 140, this.inner + 4, 300, (x, z) => okGround(x, z, 0.3)), g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.06, 0);
      inst(g, lavaMaterial(), cracks.map(p => ({ ...p, s: 1, sx: 0.8 + p.v * 1.4, sy: 1, rx: 0 })), 0);
    }
  }
  // a spot already used by a building or the grandstand?
  taken(x, z) { for (const l of this.lots) if (Math.abs(x - l.x) < l.r && Math.abs(z - l.z) < l.r) return true; return false; }
  buildings(r) {
    const T = this.track, k = this.kind, Bs = newBuilders();
    const plan = { city: { n: 170, d0: 18, d1: 330, size: [16, 34], levels: [5, 38], styles: ['office', 'commercial', 'office', 'apartments', 'retail'] },
      palms: { n: 70, d0: 30, d1: 380, size: [8, 14], levels: [2, 4], styles: ['house', 'apartments'], colours: ['#f3e3c3', '#f2c6a0', '#efd9a8', '#e8b7a0', '#f6efe4', '#d9c49a', '#f0c9b2'], roof: ['flat', 'flat', 'hipped'] },
      pines: { n: 16, d0: 40, d1: 260, size: [9, 13], levels: [1, 2], styles: ['house'], roof: ['gabled', 'gabled', 'hipped'] },
      snowpines: { n: 14, d0: 40, d1: 260, size: [10, 14], levels: [2, 3], styles: ['house'], colours: ['#8a5a3a', '#7a4e33', '#e9e1d4'], roof: ['gabled'] } }[k];
    if (!plan) return;
    let made = 0;
    for (let t = 0; t < plan.n * 8 && made < plan.n; t++) {
      // villages cluster: pick near an earlier building half the time
      let x, z, yaw;
      const base = this.lots.length && r() < 0.55 ? this.lots[Math.floor(r() * this.lots.length)] : null;
      if (base && base.b) { x = base.x + (r() - 0.5) * 70; z = base.z + (r() - 0.5) * 70; yaw = base.yaw + (r() < 0.7 ? 0 : Math.PI / 2); }
      else { const i = Math.floor(r() * T.N), sd = r() < 0.5 ? -1 : 1, d = plan.d0 + Math.pow(r(), 1.4) * (plan.d1 - plan.d0); x = T.px[i] + T.nx[i] * sd * d; z = T.pz[i] + T.nz[i] * sd * d; yaw = Math.atan2(T.tx[i], T.tz[i]); }
      const w = plan.size[0] + r() * (plan.size[1] - plan.size[0]), dd = plan.size[0] + r() * (plan.size[1] - plan.size[0]), rad = Math.hypot(w, dd) / 2;
      if (this.distAt(x, z) < this.inner + 4 + rad || this.inWater(x, z) || this.slopeAt(x, z) > (k === 'palms' ? 0.6 : 0.3)) continue;
      if (this.lots.some(l => Math.hypot(l.x - x, l.z - z) < l.r + rad * 0.8)) continue;
      const c = Math.cos(yaw), s = Math.sin(yaw), corner = (a, b) => [x + a * c + b * s, z - a * s + b * c];
      const poly = [corner(-w / 2, -dd / 2), corner(w / 2, -dd / 2), corner(w / 2, dd / 2), corner(-w / 2, dd / 2)];
      let hmin = 1e9; for (const [px, pz] of poly) hmin = Math.min(hmin, this.heightAt(px, pz)); hmin = Math.min(hmin, this.heightAt(x, z));
      const lv = Math.round(plan.levels[0] + Math.pow(r(), k === 'city' ? 1.8 : 1) * (plan.levels[1] - plan.levels[0]));
      const tags = { building: plan.styles[Math.floor(r() * plan.styles.length)], 'building:levels': String(lv) };
      if (plan.colours) tags['building:colour'] = plan.colours[Math.floor(r() * plan.colours.length)];
      if (plan.roof) tags['roof:shape'] = plan.roof[Math.floor(r() * plan.roof.length)];
      if (k === 'palms' && tags['roof:shape'] !== 'flat') tags['roof:colour'] = '#b5563a';
      if (k === 'snowpines') { tags['roof:colour'] = '#e9eef3'; tags['building:material'] = r() < 0.5 ? 'wood' : 'stone'; }
      const before = {}; for (const key in Bs) before[key] = Bs[key].pos.length;
      try { addBuilding(Bs, poly, tags, 1000 + made * 7919 + this.seed); } catch { continue; }
      for (const key in Bs) { const P = Bs[key].pos; for (let i = before[key] + 1; i < P.length; i += 3) P[i] += hmin - 0.4; }
      this.lots.push({ x, z, r: rad + 2, yaw, b: true }); made++;
    }
    const M = buildingMaterials();
    for (const key in Bs) { const g = Bs[key].geometry(); if (!g) continue; this.add(new THREE.Mesh(g, M[key]), key !== 'flat', true); }
  }
  // seating and a crowd beside the start straight. Facing the track, placed where its whole footprint clears the barriers.
  grandstand() {
    const T = this.track, r = rng(this.seed + 3), L = 56, rows = 7, depth = 1.3 * rows + 2, clear = T.width / 2 + 9;
    let best = null;
    const tryAt = (i, side) => {
      const off = clear + 1, nx = T.nx[i] * side, nz = T.nz[i] * side, tx = T.tx[i], tz = T.tz[i];
      const cx = T.px[i] + nx * off, cz = T.pz[i] + nz * off;
      // every point of the footprint must be well away from the track, dry and fairly level
      let hmin = 1e9, hmax = -1e9;
      for (let a = -L / 2; a <= L / 2; a += 4) for (let d = 0; d <= depth; d += 2) {
        const x = cx + tx * a + nx * d, z = cz + tz * a + nz * d;
        if (this.distAt(x, z) < clear || this.inWater(x, z) || this.taken(x, z)) return null;
        const h = this.heightAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
      }
      return { i, side, cx, cz, nx, nz, tx, tz, slope: hmax - hmin, hmin };
    };
    for (let k = 0; k < 60 && !(best && best.slope < 1.5); k++) {
      const i = Math.floor(T.N * (0.9 + (k % 30) * 0.006 + (k >= 30 ? -0.25 : 0)) + T.N) % T.N;
      for (const side of [1, -1]) { const c = tryAt(i, side); if (c && (!best || c.slope < best.slope)) best = c; }
    }
    if (!best) return;
    const { cx, cz, nx, nz } = best, y = best.hmin;
    const g = new THREE.Group(); g.position.set(cx, y, cz); g.rotation.y = Math.atan2(nx, nz); // local +z points away from the track, local x runs along it
    const conc = new THREE.MeshStandardMaterial({ color: '#b9b6b0', roughness: 0.9 }), seatM = new THREE.MeshStandardMaterial({ color: '#2f5fb0', roughness: 0.6 }), roofM = new THREE.MeshStandardMaterial({ color: '#e8e8ec', metalness: 0.3, roughness: 0.5 }), steel = new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 0.6, roughness: 0.4 });
    const stepH = 0.75, stepD = 1.3;
    for (let k = 0; k < rows; k++) {
      const h = 0.6 + k * stepH, b = new THREE.Mesh(new THREE.BoxGeometry(L, h + 3, stepD), conc); b.position.set(0, h / 2 - 1.5, stepD * k + stepD / 2); b.castShadow = b.receiveShadow = true; g.add(b);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(L - 1, 0.12, 0.45), seatM); seat.position.set(0, h + 0.06, stepD * k + stepD * 0.62); g.add(seat);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6 + rows * stepH + 4, 0.3), conc); back.position.set(0, (0.6 + rows * stepH + 4) / 2 - 1.5, stepD * rows + 0.15); back.castShadow = true; g.add(back);
    for (const sx of [-L / 2, -L / 6, L / 6, L / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.4), steel); p.position.set(sx, 5, stepD * rows + 0.5); p.castShadow = true; g.add(p); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 0.3, stepD * rows + 3), roofM); roof.position.set(0, 10, stepD * rows / 2 - 0.2); roof.rotation.x = 0.08; roof.castShadow = true; g.add(roof);
    // the crowd: drawn people, most sitting; they stand up, cheer and clap (or boo) depending on how you're doing
    let atlas = null; try { atlas = crowdAtlas(); } catch { }
    if (atlas) {
      const per = Math.floor((L - 2) / 0.95), list = [];
      for (let k = 0; k < rows; k++) for (let j = 0; j < per; j++) { if (r() < 0.2) continue; list.push([-L / 2 + 1.2 + j * (L - 2.4) / (per - 1) + (r() - 0.5) * 0.3, 0.6 + k * stepH, stepD * k + stepD * 0.55, r() < 0.62 ? 1 : 0]); }
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const info = new Float32Array(list.length * 4);
      const mesh = new THREE.InstancedMesh(geo, crowdMaterial(atlas), list.length), o = new THREE.Object3D();
      list.forEach(([x, yy, z, sit], n) => { o.position.set(x, yy - (sit ? 0.42 : 0.02), z); o.updateMatrix(); mesh.setMatrixAt(n, o.matrix); info.set([Math.floor(r() * atlas.designs.length), sit, r(), 1.55 + r() * 0.35], n * 4); });
      geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
      mesh.frustumCulled = false; g.add(mesh);
      this.crowd = { mesh, x: cx + nx * depth / 2, y: y + 2, z: cz + nz * depth / 2, setMood: m => { mesh.material.uniforms.uMood.value = m; }, update: dt => { const u = mesh.material.uniforms; u.uTime.value = (u.uTime.value + dt) % 1000; } };
    }
    this.group.add(g); this.lots.push({ x: cx + nx * depth / 2, z: cz + nz * depth / 2, r: L / 2 + 4 });
  }
  // for grass tufts (grass.js): the same questions it asks World Drive
  grassWorld() {
    const self = this, green = new THREE.Color(this.kind === 'palms' ? '#9cb874' : '#8fae78');
    return {
      water: { inside: (x, z) => self.inWater(x, z) },
      onRoad: (x, z, pad) => self.distAt(x, z) < self.inner + pad,
      collide: (x, z) => self.taken(x, z),
      colorAt: (x, z, c) => c.copy(green),
      heightAt: (x, z) => self.heightAt(x, z),
    };
  }
}
