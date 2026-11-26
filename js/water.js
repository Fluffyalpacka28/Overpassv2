import * as THREE from 'three';

// Water areas (lakes, ponds, reservoirs, river areas) from OSM ways + multipolygon relations.
// Segments are bucketed by z so a horizontal ray test only touches nearby edges.
// Each polygon/relation is its own "group" with even-odd parity, so overlapping
// water features never cancel each other out.
const BAND = 16;
const ROW = 2; // render resolution (m)

export const WATER_TAGS = t => t && (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water);

export class WaterIndex {
  constructor() { this.bands = new Map(); this.groups = 0; this.ids = new Set(); this.relPending = new Set(); }
  clear() { this.bands.clear(); this.ids.clear(); this.relPending.clear(); this.groups = 0; }
  has(key) { return this.ids.has(key); }
  // rings: array of [[x,z],...] (closed or not). Returns bbox of what was added.
  addGroup(key, rings) {
    if (this.ids.has(key)) return null; this.ids.add(key);
    const g = this.groups++; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
    for (const r of rings) {
      const L = r.length; if (L < 3) continue;
      for (let i = 0; i < L; i++) {
        const a = r[i], b = r[(i + 1) % L]; if (a[1] === b[1]) continue;
        const seg = [a[0], a[1], b[0], b[1], g]; n++;
        const lo = Math.floor(Math.min(a[1], b[1]) / BAND), hi = Math.floor(Math.max(a[1], b[1]) / BAND);
        for (let k = lo; k <= hi; k++) { let l = this.bands.get(k); if (!l) { l = []; this.bands.set(k, l); } l.push(seg); }
        x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); z0 = Math.min(z0, a[1]); z1 = Math.max(z1, a[1]);
      }
    }
    return n ? { x0, x1, z0, z1 } : null;
  }
  // crossings of the line z=const, grouped -> sorted x lists
  crossings(z) {
    const l = this.bands.get(Math.floor(z / BAND)); if (!l) return null; const out = new Map();
    for (const s of l) {
      const [ax, az, bx, bz, g] = s; if ((az > z) === (bz > z)) continue;
      const x = ax + (z - az) / (bz - az) * (bx - ax); let a = out.get(g); if (!a) { a = []; out.set(g, a); } a.push(x);
    }
    return out;
  }
  inside(x, z) {
    const c = this.crossings(z); if (!c) return false;
    for (const xs of c.values()) { let n = 0; for (const v of xs) if (v > x) n++; if (n & 1) return true; }
    return false;
  }
  // union of water intervals along row z, clipped to [xa,xb]
  intervals(z, xa, xb) {
    const c = this.crossings(z); if (!c) return [];
    let iv = [];
    for (const xs of c.values()) { xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) { const a = Math.max(xa, xs[i]), b = Math.min(xb, xs[i + 1]); if (b > a) iv.push([a, b]); } }
    if (iv.length < 2) return iv;
    iv.sort((a, b) => a[0] - b[0]); const m = [iv[0]];
    for (let i = 1; i < iv.length; i++) { const t = m[m.length - 1]; if (iv[i][0] <= t[1]) t[1] = Math.max(t[1], iv[i][1]); else m.push(iv[i]); }
    return m;
  }
  // build a water surface mesh for a square area.
  // Every vertex also gets 'shore': roughly how many metres it is from the nearest bank (capped at 12), which the shader uses for shallow colour and foam.
  // T (optional): the terrain mesh's real height; the surface is kept just above it, so near the bank the edge you see is this
  // mesh's smooth outline rather than wherever the ground's 10 m triangles happen to cross the water.
  geometry(x0, z0, size, y, H = () => 0, T = null) {
    const pos = [], uv = [], sh = [], STEP = 10, CAP = 12, RADII = [2, 4, 6, 8, 12];
    // vertex rows sit on z0 + k*ROW and every probe distance is a multiple of ROW, so rows are looked up by index
    const rowArr = [], OFF = 8, rowIv = z => { const k = Math.round((z - z0) / ROW) + OFF; let r = rowArr[k]; if (r === undefined) { r = this.intervals(z, -1e9, 1e9); rowArr[k] = r; } return r; };
    const wet = (x, z) => { const iv = rowIv(z); for (let i = 0; i < iv.length; i++) if (x >= iv[i][0] && x <= iv[i][1]) return true; return false; };
    const shore = (x, z) => {
      const iv = rowIv(z); let d = 0;
      for (let i = 0; i < iv.length; i++) if (x >= iv[i][0] - 0.01 && x <= iv[i][1] + 0.01) { d = Math.min(CAP, x - iv[i][0], iv[i][1] - x); break; }
      for (let i = 0; i < RADII.length; i++) { const r = RADII[i]; if (r >= d) break; if (!wet(x, z - r) || !wet(x, z + r)) { d = r; break; } }
      return d > 0 ? d : 0;
    };
    const Y = (x, z) => { const w = y + H(x, z); return T ? Math.max(w, T(x, z) + 0.07) : w; };
    const xa0 = x0, xb0 = x0 + size;
    // the water on row zr that overlaps [a, b]: exactly one stretch -> follow it; none -> the water ends here (taper to a point);
    // several (a bay or an island starts between the rows) -> keep this strip's own width on that side
    const match = (zr, a, b) => {
      const L = this.intervals(zr, xa0, xb0).filter(([p, q]) => Math.min(b, q) > Math.max(a, p));
      if (!L.length) return 'none';
      return L.length === 1 ? L[0] : [a, b];
    };
    for (let z = z0; z < z0 + size - 1e-6; z += ROW) {
      const za = z, zb = z + ROW, iv = this.intervals(z + ROW / 2, xa0, xb0);
      for (const [a, b] of iv) {
        // each strip is a band of trapezoids: its ends follow the actual shoreline at the top and bottom of the strip
        // (it used to be a rectangle using the middle of the strip, which turned every slanted shore into a staircase)
        const mA = match(za, a, b), mB = match(zb, a, b), mid = (a + b) / 2;
        // where the water forks or joins between rows, one row's stretch covers two strips: keep each strip to its own part
        const own = m => { if (m === 'none') return [mid, mid]; const n = iv.filter(([p, q]) => Math.min(q, m[1]) > Math.max(p, m[0])).length; return n > 1 ? [Math.max(a, m[0]), Math.min(b, m[1])] : m; };
        const [aA, bA] = own(mA), [aB, bB] = own(mB);
        // columns: every <= 10 m, plus extra ones 2.5 m in from each end so the foam line stays sharp
        const w = Math.max(bA - aA, bB - aB, b - a), fr = [0];
        if (w > 7) { fr.push(2.5 / w); const n = Math.max(1, Math.ceil((w - 5) / STEP)); for (let k = 1; k < n; k++) fr.push((2.5 + (w - 5) * k / n) / w); fr.push(1 - 2.5 / w); }
        else { const n = Math.max(1, Math.ceil(w / STEP)); for (let k = 1; k < n; k++) fr.push(k / n); }
        fr.push(1);
        const XA = fr.map(t => aA + (bA - aA) * t), XB = fr.map(t => aB + (bB - aB) * t);
        const SA = XA.map(x => shore(x, za)), SB = XB.map(x => shore(x, zb)), YA = XA.map(x => Y(x, za)), YB = XB.map(x => Y(x, zb));
        for (let k = 0; k + 1 < fr.length; k++) {
          const p1 = [XA[k], YA[k], za], p2 = [XB[k], YB[k], zb], p3 = [XB[k + 1], YB[k + 1], zb], p4 = [XA[k + 1], YA[k + 1], za];
          const deg1 = Math.abs(p2[0] - p3[0]) < 1e-4, deg2 = Math.abs(p1[0] - p4[0]) < 1e-4; // a strip that narrows to a point
          if (!deg1) { pos.push(...p1, ...p2, ...p3); sh.push(SA[k], SB[k], SB[k + 1]); }
          if (!deg2) { pos.push(...p1, ...p3, ...p4); sh.push(SA[k], SB[k + 1], SA[k + 1]); }
        }
      }
    }
    if (!pos.length) return null;
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 24, pos[i + 2] / 24);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('shore', new THREE.Float32BufferAttribute(sh, 1));
    g.computeVertexNormals();
    return g;
  }
}

// Join relation member ways into closed rings via shared node ids
export function assembleRings(ways) {
  const segs = ways.filter(w => w.nodes.length >= 2).map(w => ({ nodes: w.nodes.slice(), used: false }));
  const rings = [];
  for (const s of segs) {
    if (s.used) continue; s.used = true; let ring = s.nodes.slice();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 5000) {
      const end = ring[ring.length - 1]; let found = false;
      for (const o of segs) {
        if (o.used) continue;
        if (o.nodes[0] === end) { ring = ring.concat(o.nodes.slice(1)); o.used = found = true; break; }
        if (o.nodes[o.nodes.length - 1] === end) { ring = ring.concat(o.nodes.slice(0, -1).reverse()); o.used = found = true; break; }
      }
      if (!found) break;
    }
    if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring);
  }
  return rings;
}

// ---------- the water surface ----------
// One shared shader for all water: layered scrolling ripples, Fresnel reflection of the real sky colours,
// a sun / moon glint, shallow-to-deep colour and lapping foam along the banks. No extra render passes, so it stays cheap on phones.
let MAT = null, NORM = null;
const U = {
  uTime: { value: 0 }, uNorm: { value: null }, uCrack: { value: null },
  uSkyTop: { value: new THREE.Color('#3a6fc4') }, uSkyHor: { value: new THREE.Color('#bcd3ea') },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color('#fff') },
  uAmb: { value: new THREE.Color('#fff') }, uDeep: { value: new THREE.Color('#0f3f5c') }, uShallow: { value: new THREE.Color('#2f8f93') },
  uRough: { value: 1 }, uIce: { value: 0 }, uIceSnow: { value: 0 }, uHoles: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uHoleN: { value: 0 },
};
// tileable ripple normals (rgb) + foam noise (alpha), made once on a canvas
// ice: a tile of fracture lines (red: big cracks, green: fine hairlines) and frozen bubbles (blue), drawn so it repeats seamlessly
function crackTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
  let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const crack = (sx, sy, ang, len, w, col, depth) => {
    const pts = [[sx, sy]]; let px = sx, py = sy, a = ang, l = 0;
    while (l < len) { const st = 5 + R() * 12; a += (R() - 0.5) * 0.7; px += Math.cos(a) * st; py += Math.sin(a) * st; l += st; pts.push([px, py]);
      if (depth < 2 && R() < 0.07) crack(px, py, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.9), len * (0.25 + R() * 0.35), w * 0.7, col, depth + 1); }
    for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
      x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)); x.stroke();
    }
  };
  for (let i = 0; i < 26; i++) crack(R() * N, R() * N, R() * 6.283, 90 + R() * 260, 1.6 + R() * 1.6, 'rgb(255,0,0)', 0);
  for (let i = 0; i < 70; i++) crack(R() * N, R() * N, R() * 6.283, 20 + R() * 70, 0.9, 'rgb(0,200,0)', 1);
  for (let i = 0; i < 520; i++) { const bx = R() * N, by = R() * N, br = 0.6 + R() * R() * 3.2; x.fillStyle = `rgb(0,0,${150 + (R() * 105 | 0)})`; x.beginPath(); x.arc(bx, by, br, 0, 6.283); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; return t;
}
function normalTexture() {
  if (NORM) return NORM;
  const N = 256, hgt = new Float32Array(N * N), foam = new Float32Array(N * N), TAU = Math.PI * 2;
  const waves = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 22; i++) { const f = 1 + Math.floor(rnd() * (i < 8 ? 4 : 11)), a = rnd() * TAU; waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), 1 / (0.6 + f), rnd() * TAU]); }
  const fw = []; for (let i = 0; i < 9; i++) { const f = 3 + Math.floor(rnd() * 9), a = rnd() * TAU; fw.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), rnd() * TAU]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * TAU, v = y / N * TAU; let h = 0, f = 0;
    for (const [kx, ky, a, ph] of waves) { const s = Math.sin(kx * u + ky * v + ph); h += a * (1 - Math.abs(s)) ** 1.6; } // sharp crests
    for (const [kx, ky, ph] of fw) f += Math.sin(kx * u + ky * v + ph);
    hgt[y * N + x] = h; foam[y * N + x] = f;
  }
  const c = document.createElement('canvas'); c.width = c.height = N; const x2 = c.getContext('2d'), img = x2.createImageData(N, N), d = img.data;
  let fmin = 1e9, fmax = -1e9; for (const v of foam) { fmin = Math.min(fmin, v); fmax = Math.max(fmax, v); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const at = (i, j) => hgt[((j + N) % N) * N + (i + N) % N], k = 2.2;
    let nx = (at(x - 1, y) - at(x + 1, y)) * k, ny = (at(x, y - 1) - at(x, y + 1)) * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = (foam[y * N + x] - fmin) / (fmax - fmin) * 255;
  }
  x2.putImageData(img, 0, 0);
  NORM = new THREE.CanvasTexture(c); NORM.wrapS = NORM.wrapT = THREE.RepeatWrapping; NORM.colorSpace = THREE.NoColorSpace; NORM.premultiplyAlpha = false;
  NORM.generateMipmaps = true; NORM.minFilter = THREE.LinearMipmapLinearFilter; NORM.anisotropy = 4;
  return NORM;
}
const VERT = `
attribute float shore;
varying float vShore; varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vShore = shore;
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const FRAG = `
uniform float uTime, uRough, uIce, uIceSnow, uHoleN; uniform sampler2D uNorm, uCrack; uniform vec4 uHoles[8];
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol, uAmb, uDeep, uShallow;
varying float vShore; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
vec2 nm(vec2 p) { return texture2D(uNorm, p).xy * 2.0 - 1.0; }
// holes cut in the ice: x, z, radius, k (0..1 = the flame still cutting round, >= 1 = open). hole: inside an open hole;
// rim: the broken edge; glow: the red-hot cut line
void iceHoles(vec2 p, float wob, out float hole, out float rim, out float glow) {
  hole = 0.0; rim = 0.0; glow = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uHoleN) break;
    vec4 h = uHoles[i]; vec2 d2 = p - h.xy; float d = length(d2), r = h.z * (1.0 + (wob - 0.5) * 0.16);
    if (h.w >= 1.0) {
      hole = max(hole, 1.0 - smoothstep(r - 0.12, r + 0.04, d));
      rim = max(rim, smoothstep(r - 0.1, r + 0.05, d) * (1.0 - smoothstep(r + 0.05, r + 0.9 + wob * 0.5, d)));
      glow = max(glow, (1.0 - smoothstep(0.0, 0.3, abs(d - r))) * clamp(2.0 - h.w, 0.0, 1.0));
    } else {
      float a = fract(atan(d2.y, d2.x) / 6.28318 + 1.0), line = 1.0 - smoothstep(0.0, 0.22, abs(d - h.z));
      float swept = step(a, h.w), tip = 1.0 - smoothstep(0.0, 0.06, abs(a - h.w));
      glow = max(glow, line * (swept * 0.8 + tip * 1.6));
      rim = max(rim, line * swept * 0.5);
    }
  }
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vW.xz; float t = uTime * (1.0 - uIce);
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
  // three ripple layers drifting different ways = no visible tiling
  vec2 n2 = nm(p / 21.0 + vec2(t * 0.013, t * 0.008)) + nm(p / 8.3 + vec2(-t * 0.021, t * 0.017)) * 0.75 + nm(p / 57.0 + vec2(-t * 0.004, -t * 0.007)) * 0.9;
  float calm = mix(1.0, 0.18, clamp(dist / 700.0, 0.0, 1.0)) * uRough;          // smooth out far away so it doesn't shimmer
  vec3 n = normalize(vec3(n2.x * 0.34 * calm, 1.0, n2.y * 0.34 * calm));
  if (!gl_FrontFacing) {
    // seen from below: a bright, rippling window to the sky straight up, and the dark underside mirroring the depths further out
    vec3 nd = normalize(vec3(n2.x * 0.5, -1.0, n2.y * 0.5)); float up = max(dot(-nd, -V), 0.0);
    float win = smoothstep(0.62, 0.8, up + (n2.x + n2.y) * 0.05);
    vec3 skyU = mix(uSkyHor, uSkyTop, 0.5) * 1.25 + uSunCol * pow(max(dot(-V, uSunDir), 0.0), 24.0) * 0.8;
    vec3 under = mix(mix(uDeep, uShallow, 0.45) * uAmb * 0.85, skyU, win) + uShallow * uAmb * 0.2 * (1.0 - win) * (0.6 + 0.4 * n2.x);
    if (uIce > 0.001) {
      // under the ice: a glowing blue-white ceiling, cracks and frozen bubbles dark against it; holes are bright windows
      float u1 = texture2D(uNorm, p / 9.0).a, u2 = texture2D(uNorm, p / 31.0 + 0.37).a, u3 = texture2D(uNorm, p / 3.1 + 0.71).a, hole, rim, glow;
      iceHoles(p, u3, hole, rim, glow);
      float uc = texture2D(uCrack, p / 17.0).r + texture2D(uCrack, p / 6.5 + 0.31).g * 0.5;
      vec3 ceil = mix(vec3(0.25, 0.5, 0.58), vec3(0.62, 0.8, 0.86), smoothstep(0.3, 0.8, u2 * 0.7 + u3 * 0.3)) * (uAmb * 0.9 + 0.08) * (1.0 - uIceSnow * 0.35);
      ceil *= 1.0 - clamp(uc, 0.0, 1.0) * 0.5; ceil = mix(ceil, ceil * 1.5 + 0.05, texture2D(uCrack, p / 4.0 + 0.17).b * 0.6);
      vec3 open = mix(under, skyU * 1.2, 0.6);
      under = mix(under, mix(ceil, open, hole) + vec3(0.9, 0.95, 1.0) * rim * 0.35 * uAmb + vec3(1.0, 0.45, 0.12) * glow * 1.6, uIce);
    }
    gl_FragColor = vec4(under, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  float h = clamp(R.y * 1.6 + 0.08, 0.0, 1.0);
  vec3 sky = mix(uSkyHor, uSkyTop, pow(h, 0.7));
  // water body: teal in the shallows, deep blue in the middle, lit by the ambient light of the time of day
  float deep = smoothstep(0.5, 11.0, vShore);
  vec3 body = mix(uShallow, uDeep, deep) * uAmb;
  body += uShallow * uAmb * 0.22 * pow(max(dot(uSunDir, n), 0.0), 3.0) * (1.0 - deep * 0.6); // light scattering through the shallows
  vec3 col = mix(body, sky, clamp(fres * 0.9 + 0.06, 0.0, 1.0));
  // sun / moon glint: a tight hotspot plus a broad sheen
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 420.0) * 5.0 + pow(sd, 48.0) * 0.16) * smoothstep(-0.05, 0.12, uSunDir.y);
  // foam: lapping lines along the bank that come and go
  float fn = texture2D(uNorm, p / 4.7 + vec2(t * 0.02, -t * 0.015)).a;
  float band = 1.0 - smoothstep(0.0, 2.6, vShore);
  float lap = 0.5 + 0.5 * sin(vShore * 2.4 - t * 1.6 + fn * 4.0);
  float foam = band * smoothstep(0.38, 0.72, fn * 0.65 + lap * 0.55) + (1.0 - smoothstep(0.0, 0.9, vShore)) * 0.65;
  col = mix(col, vec3(0.93, 0.96, 0.97) * (uAmb * 0.85 + 0.08), clamp(foam, 0.0, 0.9));
  // frozen: a thick sheet of ice. Clear black ice where it froze still (you see down into it: cracks and bubbles at different
  // depths shift as you move), white frosted patches, glossy reflections with frost sparkles, snow drifts when there's snow about
  if (uIce > 0.001) {
    float c1 = texture2D(uNorm, p / 9.0).a, c2 = texture2D(uNorm, p / 31.0 + 0.37).a, c3 = texture2D(uNorm, p / 3.1 + 0.71).a;
    float hole, rim, glow; iceHoles(p, c3, hole, rim, glow);
    vec2 par = -V.xz / max(V.y, 0.18);
    vec2 pd = p + par * 0.35, pdd = p + par * 0.9;                      // two layers inside the ice
    float near = 1.0 - smoothstep(70.0, 320.0, dist), mid = 1.0 - smoothstep(160.0, 700.0, dist);   // fine detail fades out far away (no shimmer)
    c3 = mix(0.5, c3, near); c1 = mix(0.5, c1, mid);
    float d2 = texture2D(uNorm, pdd / 23.0 + 0.61).a;
    float frost = smoothstep(0.45, 0.82, c2 * 0.75 + c3 * 0.25);         // 0 clear black ice .. 1 white frosted ice
    vec3 deepIce = mix(vec3(0.035, 0.09, 0.11), vec3(0.1, 0.22, 0.26), smoothstep(0.2, 0.8, d2)) * (uAmb * 1.1 + 0.05);
    vec3 frostIce = mix(vec3(0.66, 0.78, 0.84), vec3(0.86, 0.92, 0.95), c3) * (uAmb * 0.95 + 0.06);
    vec3 ice = mix(deepIce, frostIce, frost);
    ice = mix(ice, mix(vec3(0.45, 0.6, 0.66), frostIce, 0.5), (1.0 - smoothstep(0.0, 5.0, vShore)) * 0.55);   // thick and white by the shore
    // cracks: sharp white fractures at the top, more of them deeper down in the clear ice, shifting as you move
    vec3 ks = texture2D(uCrack, p / 17.0).rgb, kf = texture2D(uCrack, p / 6.5 + 0.31).rgb, kd = texture2D(uCrack, pdd / 26.0 + 0.53).rgb, kb = texture2D(uCrack, pd / 4.0 + 0.17).rgb;
    float cs = clamp(ks.r * mid + kf.g * 0.55 * near, 0.0, 1.0), cd = clamp(kd.r + kd.g * 0.5, 0.0, 1.0) * (1.0 - frost * 0.6);
    ice = mix(ice, vec3(0.5, 0.7, 0.8) * (uAmb + 0.1), cd * 0.45);
    ice = mix(ice, vec3(0.93, 0.97, 1.0) * (uAmb * 0.9 + 0.12), cs * 0.8);
    // bubbles frozen in the clear ice
    float bub = kb.b * near;
    ice += vec3(0.8, 0.9, 0.96) * bub * (1.0 - frost) * 0.5 * (uAmb + 0.1);
    float drift = smoothstep(0.5, 0.64, c1 * 0.55 + c2 * 0.55 + c3 * 0.1 - 0.12 + uIceSnow * 0.08) * clamp(uIceSnow * 1.4, 0.0, 0.9);
    ice = mix(ice, vec3(0.95, 0.97, 1.0) * (uAmb * 0.92 + 0.06), drift);
    // gloss: a mirror on clear ice, a sheen on frost, nothing on snow; glints and sparkles from the sun
    vec3 nI = normalize(vec3(n2.x * 0.025, 1.0, n2.y * 0.025)); vec3 RI = reflect(-V, nI); RI.y = abs(RI.y);
    vec3 skyI = mix(uSkyHor, uSkyTop, pow(clamp(RI.y * 1.6 + 0.08, 0.0, 1.0), 0.7));
    float fI = 0.04 + 0.96 * pow(1.0 - max(dot(nI, V), 0.0), 5.0), gl = mix(0.95, 0.35, frost) * (1.0 - drift);
    ice = mix(ice, skyI, clamp(fI * gl + 0.06 * gl, 0.0, 1.0));
    float sdI = max(dot(RI, uSunDir), 0.0), sunUp = smoothstep(-0.05, 0.12, uSunDir.y);
    ice += uSunCol * (pow(sdI, 300.0) * 3.0 * gl + pow(sdI, 30.0) * 0.12 * gl) * sunUp;
    float spark = smoothstep(0.96, 0.995, texture2D(uNorm, p / 0.45 + V.xz * 0.15).a) * (frost * 0.6 + drift) * near * near;
    ice += uSunCol * spark * (0.4 + 0.6 * pow(max(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), uSunDir), 0.0), 4.0)) * 0.9 * sunUp;
    // a hole: open water with a ragged white broken edge; the cut line glows red-hot while the flame is going
    vec3 slush = vec3(0.85, 0.92, 0.96) * (uAmb * 0.9 + 0.1);
    vec3 inHole = col * 0.75 + slush * smoothstep(0.75, 0.9, c3) * 0.35;
    ice = mix(ice, slush, rim * 0.85);
    col = mix(col, mix(ice, inHole, hole), uIce); foam *= 1.0 - uIce * (1.0 - hole);
    col += vec3(1.0, 0.42, 0.1) * glow * 2.2 * uIce;
  }
  // the very edge thins out over the bank (with the foam line staying visible), so water and ground blend instead of meeting in a hard line
  float edge = smoothstep(0.0, 1.6, vShore + fn * 0.35);
  gl_FragColor = vec4(col, clamp(edge + clamp(foam, 0.0, 0.9) * 0.45, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
export function waterMaterial() {
  if (MAT) return MAT;
  U.uNorm.value = normalTexture(); try { U.uCrack.value = crackTexture(); } catch (e) { U.uCrack.value = U.uNorm.value; }
  MAT = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: VERT, fragmentShader: FRAG, fog: true, transparent: true, depthWrite: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  Object.assign(MAT.uniforms, U); // share the live uniform objects so updateWater() reaches them
  return MAT;
}
// Call once a frame from the game loop. sky = the sky dome's { top, bottom } colours, sun = the DirectionalLight, hemi = the HemisphereLight.
const _sky = new THREE.Color(), _a = new THREE.Color(), _d = new THREE.Vector3();
export function updateWater(dt, { sun, hemi, skyTop, skyBottom, calm = false } = {}) {
  U.uTime.value = (U.uTime.value + dt) % 3600;
  U.uRough.value = calm ? 0.7 : 1;
  // the sky dome writes its colours straight to the screen; undo the output conversion so the reflection matches it
  if (skyTop) U.uSkyTop.value.copy(_sky.copy(skyTop).convertSRGBToLinear());
  if (skyBottom) U.uSkyHor.value.copy(_sky.copy(skyBottom).convertSRGBToLinear());
  if (sun) {
    _d.copy(sun.position).sub(sun.target.position).normalize(); U.uSunDir.value.copy(_d);
    U.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(2.2, sun.intensity));
    _a.copy(hemi ? hemi.color : sun.color).multiplyScalar(hemi ? hemi.intensity * 0.75 : 0.6).add(_sky.copy(sun.color).multiplyScalar(sun.intensity * 0.32 * Math.max(0, _d.y)));
    U.uAmb.value.copy(_a);
  }
}

// the light on the water right now (ambient of the time of day), for effects that should match it
export const waterAmbient = () => U.uAmb.value;
// frozen over: k 0..1 (eases in), snow 0..1 (drifts on the ice)
export function setWaterIce(k, snow = 0) { U.uIce.value = k; U.uIceSnow.value = snow; }
// holes cut in the ice: [{ x, z, r, k }] (k 0..1 while cutting, >= 1 open; up to 8)
export function setIceHoles(list) {
  const n = Math.min(8, list.length); U.uHoleN.value = n;
  for (let i = 0; i < 8; i++) { const h = list[i]; if (h) U.uHoles.value[i].set(h.x, h.z, h.r, h.k); else U.uHoles.value[i].set(0, 0, 0, 0); }
}
