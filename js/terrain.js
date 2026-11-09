import * as THREE from 'three';

// Real-world elevation from AWS Terrain Tiles (Terrarium encoding, public, CORS-enabled).
// Heights are kept on a regular world-space grid (GS meters) and interpolated per
// triangle exactly like the terrain mesh, so roads, buildings and the car sit flush.
const Z = 14, URL_ = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const GS = 10;

export class Elevation {
  constructor() { this.tiles = new Map(); this.nodes = new Map(); this.enabled = false; this.h0 = 0; this.state = 'idle'; this.gen = 0; }
  reset(world) {
    this.world = world; this.tiles.clear(); this.nodes.clear(); this.enabled = false; this.h0 = 0; this.state = 'loading'; const gen = ++this.gen;
    const [lat, lon] = world.unproj(0, 0);
    return this.ensureLL([[lat, lon]]).then(() => {
      if (gen !== this.gen) return;
      const h = this.rawLL(lat, lon);
      if (h == null) { this.state = 'off'; return; }
      this.h0 = h; this.enabled = true; this.state = 'ready';
    });
  }
  pix(lat, lon) {
    const n = 2 ** Z * 256, s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  loadTile(tx, ty) {
    const key = tx + ',' + ty; let t = this.tiles.get(key); if (t) return t.p;
    t = { data: null, failed: false }; this.tiles.set(key, t);
    t.p = new Promise(res => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      const done = ok => { clearTimeout(to); if (!ok) t.failed = true; res(); };
      const to = setTimeout(() => { img.src = ''; done(false); }, 15000);
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
          for (let i = 0; i < 65536; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
          t.data = h; done(true);
        } catch (e) { done(false); }
      };
      img.onerror = () => done(false);
      img.src = URL_(Z, tx, ty);
    });
    return t.p;
  }
  ensureLL(points) {
    const need = new Set();
    for (const [lat, lon] of points) { const [px, py] = this.pix(lat, lon); for (const dx of [-2, 2]) for (const dy of [-2, 2]) need.add(Math.floor((px + dx) / 256) + ',' + Math.floor((py + dy) / 256)); }
    return Promise.all([...need].map(k => { const [a, b] = k.split(',').map(Number); return this.loadTile(a, b); }));
  }
  // make sure elevation exists for a world-space box
  ensure(x0, z0, x1, z1) {
    if (this.state === 'off') return Promise.resolve();
    const w = this.world, pts = [];
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 2) for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / 2) pts.push(w.unproj(x, z));
    return this.ensureLL(pts);
  }
  value(gx, gy) { const t = this.tiles.get(Math.floor(gx / 256) + ',' + Math.floor(gy / 256)); if (!t || !t.data) return null; return t.data[(gy & 255) * 256 + (gx & 255)]; }
  rawLL(lat, lon) {
    const [px, py] = this.pix(lat, lon), x = px - 0.5, y = py - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = this.value(ix, iy), b = this.value(ix + 1, iy), c = this.value(ix, iy + 1), d = this.value(ix + 1, iy + 1);
    if (a == null || b == null || c == null || d == null) return null;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  node(i, j) {
    const k = (i + 60000) * 120000 + (j + 60000); let h = this.nodes.get(k); if (h !== undefined) return h;
    if (!this.enabled) return 0;
    const [lat, lon] = this.world.unproj(i * GS, j * GS); const r = this.rawLL(lat, lon);
    if (r == null) return 0; // not loaded (yet): don't cache
    // light smoothing of DEM noise: average with 4 half-cell neighbours
    let s = r * 2, n = 2; for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { const [la, lo] = this.world.unproj((i + dx) * GS, (j + dz) * GS); const v = this.rawLL(la, lo); if (v != null) { s += v; n++; } }
    h = s / n - this.h0; this.nodes.set(k, h); return h;
  }
  // height at a world position, identical to the terrain mesh surface
  at(x, z) {
    if (!this.enabled) return 0;
    const gx = x / GS, gz = z / GS, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const h00 = this.node(i, j), h11 = this.node(i + 1, j + 1);
    if (fx > fz) { const h10 = this.node(i + 1, j); return h00 + fx * (h10 - h00) + fz * (h11 - h10); }
    const h01 = this.node(i, j + 1); return h00 + fz * (h01 - h00) + fx * (h11 - h01);
  }
  absolute(y) { return this.h0 + y; }
}

// Terrain chunk mesh for one 320m tile, with vertex colours from land-cover polygons
export function terrainGeometry(elev, x0, z0, size, colorAt, sinkAt) {
  const n = Math.round(size / GS), N = n + 1, pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), idx = [];
  const i0 = Math.round(x0 / GS), j0 = Math.round(z0 / GS), c = new THREE.Color();
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const x = (i0 + a) * GS, z = (j0 + b) * GS, k = (b * N + a) * 3;
    let h = elev.node(i0 + a, j0 + b); if (sinkAt(x, z)) h -= 1.4;
    pos[k] = x; pos[k + 1] = h - 0.02; pos[k + 2] = z;
    colorAt(x, z, c); col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const p00 = b * N + a, p10 = p00 + 1, p01 = p00 + N, p11 = p01 + 1;
    // split along 00-11 to match Elevation.at()
    idx.push(p00, p11, p10, p00, p01, p11);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
