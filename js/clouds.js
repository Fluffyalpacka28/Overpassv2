import * as THREE from 'three';

// Clouds at their real-world altitudes above the ground you are driving over:
//   cumulus        ~1.8 km  (6,000 ft)   puffy fair-weather clouds
//   altocumulus    ~4.5 km  (15,000 ft)  patchy cloudlets
//   cirrus         ~9 km    (30,000 ft)  thin wind-blown streaks
// Cloud positions live on a world-anchored grid (the same clouds are over the same places every time) and drift with the wind.
//
// A cloud 15 km away is far outside the camera's draw distance, so it would be clipped and look "unloaded". Instead every cloud is
// slid along its own line of sight onto a shell just inside the draw distance and scaled by the same factor. A perspective camera
// can't tell the difference, so angles, size and parallax are exactly those of the real altitude, and nothing is ever culled.
// Clouds don't depend on map tiles at all.

const WIND = [0.94, 0.34];            // direction the clouds drift (x, z)
const CAP = 900;                      // most clouds collected per layer per frame
const LAYERS = [
  { name: 'cirrus',  alt: 9000, altJit: 0.10, cell: 7000, range: 42000, occ: 0.40, size: [6000, 12000], aspect: 0.16, wind: 28, order: 1, variants: 1, align: true,  seed: 11, tex: cirrusCanvas },
  { name: 'alto',    alt: 4500, altJit: 0.10, cell: 3200, range: 30000, occ: 0.35, size: [1600, 3400],  aspect: 0.42, wind: 16, order: 2, variants: 1, align: false, seed: 23, tex: altoCanvas },
  { name: 'cumulus', alt: 1800, altJit: 0.15, cell: 1500, range: 22000, occ: 0.30, size: [800, 1700],   aspect: 0.66, wind: 7,  order: 3, variants: 3, align: false, seed: 37, tex: cumulusCanvas },
];

// ---------- procedural cloud textures ----------
function rng(seed) { let a = seed * 2654435761 >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(i, j, s) { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function blob(x, bx, by, r, inner, mid) { const g = x.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, inner); g.addColorStop(0.55, mid); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(bx - r, by - r, r * 2, r * 2); }

// a puffy cumulus: grey-blue shaded underside, bright sunlit tops, flat base
export function cumulusCanvas(seed = 1) {
  const W = 256, H = 176, [c, x] = newCanvas(W, H), r = rng(seed), blobs = [];
  for (let i = 0; i < 30; i++) {
    const u = r(), a = (r() - 0.5) * 2;
    blobs.push([W / 2 + a * W * 0.34 * (1 - u * 0.35), H * 0.64 - u * H * 0.38 * (1 - Math.abs(a) * 0.55), H * (0.13 + 0.14 * r()) * (1 - Math.abs(a) * 0.35) * (0.8 + 0.5 * (1 - u))]);
  }
  const paint = (dx, dy, k, inner, mid) => { for (const [bx, by, br] of blobs) blob(x, bx + dx, by + dy, br * k, inner, mid); };
  paint(0, 5, 1.05, 'rgba(150,164,192,0.95)', 'rgba(170,184,208,0.55)');
  paint(-3, -7, 0.9, 'rgba(255,255,255,1)', 'rgba(247,250,255,0.7)');
  paint(-6, -12, 0.55, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.5)');
  x.globalCompositeOperation = 'destination-in'; const m = x.createLinearGradient(0, H * 0.62, 0, H * 0.82); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, W, H);
  return c;
}
// altocumulus: a mottled patch of many small, overlapping cloudlets
export function altoCanvas(seed = 2) {
  const W = 256, H = 128, [c, x] = newCanvas(W, H), r = rng(seed), blobs = [];
  for (let i = 0; i < 70; i++) { const a = r() * 6.283, d = Math.sqrt(r()); blobs.push([W / 2 + Math.cos(a) * d * W * 0.42, H / 2 + Math.sin(a) * d * H * 0.36, 7 + r() * 13]); }
  for (const [bx, by, br] of blobs) blob(x, bx, by + 1.5, br, 'rgba(176,188,208,0.38)', 'rgba(190,200,216,0.2)');
  for (const [bx, by, br] of blobs) blob(x, bx - 1, by - 2, br * 0.9, 'rgba(255,255,255,0.5)', 'rgba(250,252,255,0.28)');
  x.globalCompositeOperation = 'destination-in'; x.save(); x.translate(W / 2, H / 2); x.scale(1, H / W); const m = x.createRadialGradient(0, 0, W * 0.25, 0, 0, W * 0.5); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(-W, -W, W * 2, W * 2); x.restore();
  return c;
}
// cirrus: thin wisps stretched along the wind
export function cirrusCanvas(seed = 3) {
  const W = 256, H = 64, [c, x] = newCanvas(W, H), r = rng(seed);
  for (let i = 0; i < 34; i++) {
    x.save(); x.translate(W * (0.12 + 0.76 * r()), H * (0.5 + (r() - 0.5) * 0.4)); x.rotate((r() - 0.5) * 0.4); x.scale(W * (0.1 + 0.22 * r()), H * (0.05 + 0.08 * r()));
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, `rgba(255,255,255,${0.35 + 0.3 * r()})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  x.globalCompositeOperation = 'destination-in'; const m = x.createLinearGradient(0, 0, W, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.18, 'rgba(0,0,0,1)'); m.addColorStop(0.82, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, W, H);
  return c;
}

// ---------- scratch (no per-frame allocation) ----------
const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _col = new THREE.Color();
const CX = new Float32Array(CAP), CY = new Float32Array(CAP), CZ = new Float32Array(CAP), CD = new Float32Array(CAP), CH = new Float32Array(CAP), CS = new Float32Array(CAP), CV = new Float32Array(CAP);

export class Clouds {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.on = true; this.ground = null; this.reach = 1; this.density = 1;
    this.base = new THREE.Color('#ffffff'); this.haze = new THREE.Color('#cfe3f5'); this.idx = []; this._cmp = (a, b) => CD[b] - CD[a];
    const plane = new THREE.PlaneGeometry(1, 1);
    this.layers = LAYERS.map(d => {
      const L = { ...d, ox: 0, oz: 0, meshes: [] };
      for (let v = 0; v < d.variants; v++) {
        const tex = new THREE.CanvasTexture(d.tex(d.seed + v * 7)); tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
        const mesh = new THREE.InstancedMesh(plane, mat, CAP); mesh.frustumCulled = false; mesh.renderOrder = d.order; mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, _col.set('#ffffff')); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); // instanceColor exists from the start so the material compiles with it
        this.group.add(mesh); L.meshes.push(mesh);
      }
      return L;
    });
  }
  // sky colours of the current theme: clouds fade into the horizon haze, and go dark at night
  setTheme(th) {
    this.base.set(th.night ? '#4a5278' : '#ffffff');
    this.haze.set(th.fog).convertSRGBToLinear(); // the sky shader writes its colours as-is, so match what it really shows
  }
  setQuality(low) { this.reach = low ? 0.6 : 1; this.density = low ? 0.7 : 1; }
  update(dt, camera, groundY) {
    this.group.visible = this.on; if (!this.on) return;
    camera.getWorldPosition(_cp); camera.getWorldQuaternion(_cq); _qi.copy(_cq).invert();
    this.ground = this.ground == null ? groundY : this.ground + (groundY - this.ground) * Math.min(1, dt * 0.3); // follow the land underneath, smoothly
    const RV = Math.min(2400, camera.far * 0.8);
    for (const L of this.layers) this._layer(L, dt, RV);
  }
  _layer(L, dt, RV) {
    L.ox += WIND[0] * L.wind * dt; L.oz += WIND[1] * L.wind * dt;
    const range = L.range * this.reach, cell = L.cell, ci = Math.floor((_cp.x - L.ox) / cell), cj = Math.floor((_cp.z - L.oz) / cell), n = Math.ceil(range / cell), s8 = L.seed * 8;
    let m = 0;
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const cover = vnoise(i * 0.16, j * 0.16, L.seed); // big-scale weather: cloudy fields and clear gaps
      if (hash2(i, j, s8 + 1) > Math.min(0.9, L.occ * (0.1 + 1.8 * cover)) * this.density) continue;
      const x = (i + 0.5 + (hash2(i, j, s8 + 2) - 0.5) * 0.8) * cell + L.ox, z = (j + 0.5 + (hash2(i, j, s8 + 3) - 0.5) * 0.8) * cell + L.oz;
      const dx = x - _cp.x, dz = z - _cp.z, hd = Math.hypot(dx, dz); if (hd > range || m >= CAP) continue;
      const dy = this.ground + L.alt * (1 + (hash2(i, j, s8 + 4) - 0.5) * 2 * L.altJit) - _cp.y; // real height above the ground
      CX[m] = dx; CY[m] = dy; CZ[m] = dz; CH[m] = hd; CD[m] = Math.hypot(hd, dy); CS[m] = hash2(i, j, s8 + 5); CV[m] = hash2(i, j, s8 + 6); m++;
    }
    const idx = this.idx; idx.length = m; for (let k = 0; k < m; k++) idx[k] = k; idx.sort(this._cmp); // far to near, so the blending layers correctly
    for (const mesh of L.meshes) mesh.count = 0;
    for (let q = 0; q < m; q++) {
      const k = idx[q], f = RV / CD[k], e = CH[k] / range, fade = 1 - smooth(0.78, 1, e); if (fade <= 0.02) continue; // shrinks away at the far edge instead of popping
      const mesh = L.meshes[Math.min(L.meshes.length - 1, Math.floor(CV[k] * L.meshes.length))], slot = mesh.count++;
      let roll = (CV[k] * 7.3 % 1 - 0.5) * 0.25;
      if (L.align) { // streak along the wind as seen on screen
        _v0.set(CX[k], CY[k], CZ[k]).applyQuaternion(_qi); _v1.set(CX[k] + WIND[0] * 3000, CY[k], CZ[k] + WIND[1] * 3000).applyQuaternion(_qi);
        roll = _v0.z < -1 && _v1.z < -1 ? Math.atan2(_v1.y / -_v1.z - _v0.y / -_v0.z, _v1.x / -_v1.z - _v0.x / -_v0.z) : 0;
      }
      const sw = (L.size[0] + (L.size[1] - L.size[0]) * CS[k]) * f * fade;
      _p.set(_cp.x + CX[k] * f, _cp.y + CY[k] * f, _cp.z + CZ[k] * f);       // same line of sight, pulled in to the shell
      _q.setFromAxisAngle(_z, roll).premultiply(_cq);                          // always faces the camera
      _s.set(CS[k] > 0.5 ? -sw : sw, sw * L.aspect, 1);                        // mirrored half the time for variety
      mesh.setMatrixAt(slot, _m.compose(_p, _q, _s));
      mesh.setColorAt(slot, _col.copy(this.base).lerp(this.haze, smooth(0.2, 0.95, e) * 0.85)); // distant clouds melt into the haze
    }
    for (const mesh of L.meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
}
