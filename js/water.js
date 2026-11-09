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
  // build a water surface mesh for a square area
  geometry(x0, z0, size, y, H = () => 0) {
    const pos = [], uv = [], STEP = 10;
    for (let z = z0; z < z0 + size - 1e-6; z += ROW) {
      const za = z, zb = z + ROW, iv = this.intervals(z + ROW / 2, x0, x0 + size);
      for (const [a, b] of iv) {
        const n = Math.max(1, Math.ceil((b - a) / STEP));
        for (let k = 0; k < n; k++) {
          const xa = a + (b - a) * k / n, xb = a + (b - a) * (k + 1) / n;
          const h1 = y + H(xa, za), h2 = y + H(xa, zb), h3 = y + H(xb, zb), h4 = y + H(xb, za);
          pos.push(xa, h1, za, xa, h2, zb, xb, h3, zb, xa, h1, za, xb, h3, zb, xb, h4, za);
        }
      }
    }
    if (!pos.length) return null;
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 24, pos[i + 2] / 24);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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

let MAT = null;
export function waterMaterial() {
  if (MAT) return MAT;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const px = Math.random() * 256, py = Math.random() * 256, w = 10 + Math.random() * 30;
    x.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.35})`; x.lineWidth = 1 + Math.random() * 1.5;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + w / 2, py - 3, px + w, py); x.stroke();
    x.strokeStyle = `rgba(20,60,110,${0.12 + Math.random() * 0.15})`; x.beginPath(); x.moveTo(px, py + 3); x.quadraticCurveTo(px + w / 2, py + 6, px + w, py + 3); x.stroke();
  }
  // tile seamlessly by wrapping draws is approximate; soften with blur pass
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  MAT = new THREE.MeshStandardMaterial({ color: '#4f8fc4', map: t, roughness: 0.18, metalness: 0.15, emissive: '#0d2a44', emissiveIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return MAT;
}
