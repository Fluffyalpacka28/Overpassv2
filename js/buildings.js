import * as THREE from 'three';

// Detailed procedural buildings from OSM footprints:
// textured facades (per-floor windows), storefront ground floors, cornices,
// hipped roofs on houses, rooftop units on flat roofs, OSM colour tags.

const FLOOR = 3.2, BAY = 3.4, GRID = 4; // facade atlases are 4 bays x 4 floors
const WALLS = {
  res: ['#efe3cf', '#e6d2b8', '#d9d6cf', '#f3ece0', '#e2c6b0', '#cfd6dc', '#ead7c9'],
  brick: ['#b5654a', '#a8583f', '#c2775a', '#9a5a48', '#b86f55'],
  glass: ['#c9dbe8', '#d8e4ea', '#bcd0d8', '#e0e6ee', '#c4d6cf'],
  ind: ['#c8c6c0', '#b8bcc2', '#d0c8b8', '#aeb5b0'],
  house: ['#f4efe4', '#e8dcc4', '#d6e0e4', '#efe0d0', '#dfe6d6', '#f0e6c8', '#e4d4dc'],
};
const ROOFS_TILE = ['#9b4a3c', '#6d5f5a', '#56606e', '#8a5a3b', '#7a4238', '#5d5550'];
const ROOFS_FLAT = ['#8d8a86', '#7b7f84', '#9a958c', '#6f7378'];
const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'bungalow', 'terrace', 'cabin', 'farm', 'villa', 'hut']);
const COMM = new Set(['commercial', 'office', 'retail', 'hotel', 'civic', 'public', 'government', 'bank', 'mall', 'supermarket']);
const IND = new Set(['industrial', 'warehouse', 'factory', 'manufacture', 'hangar', 'storage_tank', 'service', 'transportation']);
const SMALL = new Set(['garage', 'garages', 'shed', 'carport', 'kiosk', 'toilets', 'hut']);

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// ---------- facade textures ----------
let EM = null; // while a facade is being drawn: the matching night-glow canvas (lit windows are painted here too)
function canvasTex(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const ec = document.createElement('canvas'); ec.width = ec.height = size; EM = ec.getContext('2d'); EM.fillStyle = '#000'; EM.fillRect(0, 0, size, size);
  draw(x, size); EM = null;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const e = new THREE.CanvasTexture(ec); e.colorSpace = THREE.SRGBColorSpace; e.wrapS = e.wrapT = THREE.RepeatWrapping; e.anisotropy = 4; t.userData.glow = e; return t;
}
function glassFill(x, gx, gy, gw, gh, r) {
  const lit = r() < 0.16, tone = r();
  if (EM) { // at night far more windows are lit than in daylight: all the daytime lit ones plus a share of the rest, in different warm/cool tints
    const h = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233 + gw * 3.1) * 43758.5453) % 1;
    if (lit || h < 0.42) { EM.fillStyle = h < 0.06 ? '#9fc8ff' : h < 0.2 ? '#ffe3b0' : h < 0.32 ? '#ffd08a' : '#ffefc9'; EM.globalAlpha = 0.65 + 0.35 * ((h * 977) % 1); EM.fillRect(gx, gy, gw, gh); EM.globalAlpha = 1; }
  }
  const g = x.createLinearGradient(gx, gy, gx + gw, gy + gh);
  if (lit) { g.addColorStop(0, '#f6d9a0'); g.addColorStop(1, '#d9a866'); }
  else { const a = 40 + tone * 30; g.addColorStop(0, `rgb(${a + 30},${a + 52},${a + 72})`); g.addColorStop(0.55, `rgb(${a},${a + 14},${a + 32})`); g.addColorStop(1, `rgb(${a + 18},${a + 30},${a + 48})`); }
  x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
  if (!lit && r() < 0.35) { x.fillStyle = 'rgba(235,228,214,.85)'; x.fillRect(gx, gy, gw, gh * (0.2 + r() * 0.5)); } // blinds
  x.fillStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.moveTo(gx, gy + gh * 0.7); x.lineTo(gx + gw * 0.5, gy); x.lineTo(gx + gw * 0.7, gy); x.lineTo(gx, gy + gh); x.fill();
}
function makeFacades() {
  const S = 512, cw = S / GRID, ch = S / GRID;
  const res = canvasTex((x) => {
    const r = rng(7); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 6000; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.035})`; x.fillRect(r() * S, r() * S, 2, 2); }
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.46, gh = ch * 0.54, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.2;
      x.fillStyle = '#d9d4cc'; x.fillRect(gx - 5, gy - 5, gw + 10, gh + 10);
      glassFill(x, gx, gy, gw, gh, r);
      x.fillStyle = '#e9e5de'; x.fillRect(gx + gw / 2 - 2, gy, 4, gh);
      x.fillStyle = '#bdb6aa'; x.fillRect(gx - 8, gy + gh + 4, gw + 16, 6);
      if (r() < 0.3) { x.fillStyle = '#5b5550'; x.fillRect(gx - 6, gy + gh + 10, gw + 12, 4); for (let k = 0; k < 6; k++) x.fillRect(gx - 4 + k * (gw + 8) / 5, gy + gh * 0.7, 2, gh * 0.3 + 10); }
    }
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let fy = 0; fy < GRID; fy++) x.fillRect(0, fy * ch + ch - 3, S, 3);
  });
  const brick = canvasTex((x) => {
    const r = rng(11); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) for (let xx = (y / 8) % 2 ? -10 : 0; xx < S; xx += 20) { x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.09})`; x.fillRect(xx + 1, y + 1, 18, 6); }
    x.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 0; y < S; y += 8) x.fillRect(0, y, S, 1);
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.4, gh = ch * 0.58, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.2;
      x.fillStyle = '#efe6d6'; x.beginPath(); x.moveTo(gx - 6, gy + 6); x.quadraticCurveTo(gx + gw / 2, gy - 14, gx + gw + 6, gy + 6); x.lineTo(gx + gw + 6, gy + gh + 6); x.lineTo(gx - 6, gy + gh + 6); x.fill();
      glassFill(x, gx, gy + 4, gw, gh, r);
      x.fillStyle = '#efe6d6'; x.fillRect(gx, gy + gh * 0.45, gw, 4); x.fillRect(gx + gw / 2 - 2, gy, 4, gh);
      x.fillStyle = '#d8ccb6'; x.fillRect(gx - 9, gy + gh + 4, gw + 18, 8);
    }
  });
  const glass = canvasTex((x) => {
    const r = rng(23);
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, oy = fy * ch;
      for (let k = 0; k < 2; k++) glassFill(x, ox + k * cw / 2, oy, cw / 2, ch * 0.78, () => r() * 0.9 + 0.1 * (r() < 0.1 ? 0 : 1));
      x.fillStyle = '#5f6c78'; x.fillRect(ox, oy + ch * 0.78, cw, ch * 0.22);
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(ox, oy + ch * 0.78, cw, 3);
      x.fillStyle = '#c8d0d8'; x.fillRect(ox, oy, 3, ch); x.fillRect(ox + cw / 2 - 1, oy, 2, ch * 0.78);
    }
    const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.08)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
  });
  const ind = canvasTex((x) => {
    const r = rng(31); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let xx = 0; xx < S; xx += 8) { x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(xx, 0, 3, S); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(xx + 4, 0, 1, S); }
    for (let fy = 0; fy < GRID; fy++) { if (fy % 2) continue; x.fillStyle = '#8a959e'; x.fillRect(0, fy * ch + ch * 0.12, S, ch * 0.22); for (let bx = 0; bx < GRID * 2; bx++) { x.fillStyle = r() < 0.15 ? '#c9b98a' : '#3c4752'; x.fillRect(bx * cw / 2 + 4, fy * ch + ch * 0.15, cw / 2 - 8, ch * 0.16); } }
    x.fillStyle = 'rgba(80,60,40,.10)'; for (let i = 0; i < 40; i++) x.fillRect(r() * S, r() * S, 2, 30 + r() * 60);
  });
  const house = canvasTex((x) => {
    const r = rng(41); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 10) { x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, y + 8, S, 2); }
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      if (r() < 0.25) continue;
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.36, gh = ch * 0.48, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.24;
      const sh = pick(['#3d5a48', '#2f3f5c', '#6a2f2a', '#3a3a3a', '#54627a'], r());
      x.fillStyle = sh; x.fillRect(gx - gw * 0.38, gy, gw * 0.32, gh); x.fillRect(gx + gw * 1.06, gy, gw * 0.32, gh);
      x.fillStyle = '#ffffff'; x.fillRect(gx - 5, gy - 5, gw + 10, gh + 10);
      glassFill(x, gx, gy, gw, gh, r);
      x.fillStyle = '#fff'; x.fillRect(gx, gy + gh / 2 - 2, gw, 4); x.fillRect(gx + gw / 2 - 2, gy, 4, gh);
    }
  });
  const shop = canvasTex((x) => {
    const r = rng(53);
    for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, aw = pick(['#c8453a', '#2f6d5a', '#2e4f86', '#c98a2b', '#6b3f7a', '#3b3b3b'], r());
      x.fillStyle = '#e8e1d4'; x.fillRect(ox, 0, cw, S);
      x.fillStyle = '#2e3236'; x.fillRect(ox + 6, S * 0.06, cw - 12, S * 0.2); // sign band
      x.fillStyle = pick(['#ffd27a', '#ffffff', '#ffb0a0', '#bfe8ff'], r()); for (let k = 0; k < 4 + r() * 4; k++) x.fillRect(ox + 16 + k * 10, S * 0.13, 7, S * 0.06);
      for (let k = 0; k < 6; k++) { x.fillStyle = k % 2 ? '#f4efe6' : aw; x.beginPath(); x.moveTo(ox + k * cw / 6, S * 0.28); x.lineTo(ox + (k + 1) * cw / 6, S * 0.28); x.lineTo(ox + (k + 1) * cw / 6 + 2, S * 0.38); x.lineTo(ox + k * cw / 6 + 2, S * 0.38); x.fill(); }
      const g = x.createLinearGradient(0, S * 0.4, 0, S); g.addColorStop(0, '#2b3a46'); g.addColorStop(0.5, '#4d6474'); g.addColorStop(1, '#253039'); x.fillStyle = g; x.fillRect(ox + 8, S * 0.4, cw - 16, S * 0.56);
      if (r() < 0.6) { x.fillStyle = 'rgba(255,214,150,.45)'; x.fillRect(ox + 8, S * 0.4, cw - 16, S * 0.56); if (EM) { EM.fillStyle = '#ffcf8a'; EM.fillRect(ox + 8, S * 0.4, cw - 16, S * 0.56); } }
      x.fillStyle = '#d0c8ba'; x.fillRect(ox + cw / 2 - 2, S * 0.4, 4, S * 0.56); x.fillRect(ox, S * 0.96, cw, S * 0.04);
    }
  });
  // Legally-distinct big-box parody: NOT Walmart. Own name, generic 4-point star,
  // generic blue/yellow, generic tagline. No spark logo, no "Save Money. Live Better."
  const mallmart = canvasTex((x) => {
    const r = rng(97);
    x.fillStyle = '#0a5db8'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1200; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.06})`; x.fillRect(r() * S, r() * S, 3, 3); }
    // sign band
    x.fillStyle = '#ffffff'; x.fillRect(0, S * 0.02, S, S * 0.30);
    // generic 4-point star (not the 6-dash Walmart spark)
    const sx = S * 0.10, sy = S * 0.17, sr = S * 0.09;
    x.fillStyle = '#ffd100'; x.beginPath();
    x.moveTo(sx, sy - sr); x.quadraticCurveTo(sx + sr*0.18, sy - sr*0.18, sx + sr, sy);
    x.quadraticCurveTo(sx + sr*0.18, sy + sr*0.18, sx, sy + sr);
    x.quadraticCurveTo(sx - sr*0.18, sy + sr*0.18, sx - sr, sy);
    x.quadraticCurveTo(sx - sr*0.18, sy - sr*0.18, sx, sy - sr); x.fill();
    x.fillStyle = '#0a5db8'; x.font = `900 ${S * 0.11}px Arial, sans-serif`; x.textBaseline = 'middle';
    x.fillText('MALLMART', S * 0.22, S * 0.17);
    x.fillStyle = '#ffd100'; x.font = `700 ${S * 0.045}px Arial, sans-serif`;
    x.fillText('LOW PRICES, EVERY DAY-ISH', S * 0.22, S * 0.27);
    // storefront glass + yellow trim
    x.fillStyle = '#ffd100'; x.fillRect(0, S * 0.32, S, S * 0.03);
    for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw;
      const g = x.createLinearGradient(0, S * 0.42, 0, S * 0.92); g.addColorStop(0, '#2b3a46'); g.addColorStop(0.5, '#5a768c'); g.addColorStop(1, '#253039');
      x.fillStyle = g; x.fillRect(ox + 10, S * 0.42, cw - 20, S * 0.50);
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(ox + 10, S * 0.42, cw - 20, 8);
      x.fillStyle = '#dfe6ec'; x.fillRect(ox + cw/2 - 2, S * 0.42, 4, S * 0.50);
    }
    x.fillStyle = '#ffd100'; x.fillRect(0, S * 0.95, S, S * 0.05);
    if (EM) { EM.fillStyle = '#ffe9a8'; EM.fillRect(0, S * 0.42, S, S * 0.50); }
  });
  const flat = canvasTex((x) => { const r = rng(61); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.08})`; x.fillRect(r() * S, r() * S, 3, 3); } x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; for (let k = 0; k <= S; k += 128) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, S); x.moveTo(0, k); x.lineTo(S, k); x.stroke(); } });
  const tiles = canvasTex((x) => { const r = rng(71); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 16) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, y + 13, S, 3); for (let xx = (y / 16) % 2 ? 0 : 12; xx < S; xx += 24) { x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`; x.fillRect(xx, y, 22, 13); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(xx + 22, y, 2, 13); } } });
  return { res, brick, glass, ind, house, shop, flat, tiles, mallmart };
}

let MATS = null;
export function buildingMaterials() {
  if (MATS) return MATS;
  const T = makeFacades();
  const m = (map, o = {}) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.82, emissive: '#ffffff', emissiveMap: map.userData.glow, emissiveIntensity: 0, ...o });
  MATS = {
    res: m(T.res), brick: m(T.brick, { roughness: 0.9 }), glass: m(T.glass, { roughness: 0.3, metalness: 0.1 }),
    ind: m(T.ind, { roughness: 0.7, metalness: 0.15 }), house: m(T.house), shop: m(T.shop, { roughness: 0.6 }),
    flat: m(T.flat, { roughness: 0.95 }), tiles: m(T.tiles, { roughness: 0.85 }),
    mallmart: m(T.mallmart, { roughness: 0.65 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
  };
  return MATS;
}

// night: how brightly the lit windows glow (0 = off, 1 = full)
export function setWindowGlow(v) { if (MATS) for (const k in MATS) if (MATS[k].emissiveMap) MATS[k].emissiveIntensity = v; }

// ---------- geometry builder ----------
class Builder {
  constructor() { this.pos = []; this.uv = []; this.col = []; }
  tri(a, b, c, ua, ub, uc, color) { this.pos.push(...a, ...b, ...c); this.uv.push(...ua, ...ub, ...uc); for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b); }
  quad(a, b, c, d, ua, ub, uc, ud, color) { this.tri(a, b, c, ua, ub, uc, color); this.tri(a, c, d, ua, uc, ud, color); }
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.computeVertexNormals(); return g;
  }
}
export function newBuilders() { return { res: new Builder(), brick: new Builder(), glass: new Builder(), ind: new Builder(), house: new Builder(), shop: new Builder(), flat: new Builder(), tiles: new Builder(), trim: new Builder(), mallmart: new Builder() }; }

function pip(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
function color(tag, fallback) { if (tag) { try { const c = new THREE.Color(); c.setStyle(tag.trim().replace(/\s+/g, '')); return c; } catch { } } return new THREE.Color(fallback); }
function offsetPoly(poly, d) { // outward offset (poly is clockwise-from-above so (-tz, tx) is outward)
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    let t1x = p[0] - a[0], t1z = p[1] - a[1], l1 = Math.hypot(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
    let t2x = b[0] - p[0], t2z = b[1] - p[1], l2 = Math.hypot(t2x, t2z) || 1; t2x /= l2; t2z /= l2;
    const nx = -(t1z + t2z), nz = t1x + t2x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const cos = Math.max(0.35, nx * -t1z + nz * t1x);
    out.push([p[0] + nx * d / cos, p[1] + nz * d / cos]);
  }
  return out;
}
function triangulate(poly) { try { return THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch { return []; } }
function capTris(B, poly, y, uvScale, c, down = false) {
  for (const [a, b, d] of triangulate(poly)) {
    let P = [poly[a], poly[b], poly[d]];
    const ny = (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]) - (P[2][1] - P[0][1]) * (P[1][0] - P[0][0]);
    if ((ny < 0) !== down) P = [P[0], P[2], P[1]];
    B.tri([P[0][0], y, P[0][1]], [P[1][0], y, P[1][1]], [P[2][0], y, P[2][1]], [P[0][0] / uvScale, P[0][1] / uvScale], [P[1][0] / uvScale, P[1][1] / uvScale], [P[2][0] / uvScale, P[2][1] / uvScale], c);
  }
}
function walls(B, poly, y0, y1, c, opts = {}) {
  const n = poly.length, fh = opts.floor || FLOOR, bay = opts.bay || BAY, vOff = opts.vOff || 0, shade = opts.shade ?? 0.06;
  const vt = opts.band ? 1 : (y1 - y0) / fh / GRID;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
    const bays = len < bay * 0.7 ? len / bay : Math.max(1, Math.round(len / bay)); const u0 = (i * 3) % GRID / GRID, u1 = u0 + bays / GRID;
    const k = 1 - shade + hash(i * 7 + n) * shade * 2, cc = c.clone().multiplyScalar(k);
    const v0 = vOff, v1 = vOff + vt;
    B.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [u0, v0], [u1, v0], [u1, v1], [u0, v1], cc);
  }
}
function box(B, cx, cz, sx, sz, y0, h, c, yaw = 0) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw), P = [[-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz]].map(([x, z]) => [cx + x * cs - z * sn, cz + x * sn + z * cs]);
  // ensure clockwise-from-above order so walls face outward
  const area = P.reduce((s, p, i) => s + p[0] * P[(i + 1) % 4][1] - P[(i + 1) % 4][0] * p[1], 0); if (area > 0) P.reverse();
  walls(B, P, y0, y0 + h, c, { band: true, shade: 0.12 }); capTris(B, P, y0 + h, 4, c.clone().multiplyScalar(0.92));
}

// Main entry: add one building to the builders. poly = footprint (no closing point).
export function addBuilding(Bs, poly, tags, id) {
  let area = 0; for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; area += x1 * z2 - x2 * z1; }
  if (Math.abs(area) < 4) return;
  if (area > 0) poly = poly.slice().reverse();
  area = Math.abs(area) / 2;
  const r = rng(id % 2147483647), type = tags.building;
  const levels = parseFloat(tags['building:levels']);
  let h = parseFloat(tags.height) || (levels ? levels * FLOOR + 1 : 0);
  const minH = parseFloat(tags.min_height) || (tags['building:min_level'] ? parseFloat(tags['building:min_level']) * FLOOR : 0);
  const isHouse = HOUSE.has(type) || (type === 'yes' && area < 160 && !tags.shop && !tags.amenity && (!levels || levels <= 2) && r() < 0.6);
  const small = SMALL.has(type);

  // --- Mallmart: legally-distinct Walmart parody ---
  // How WicDonalds-style overrides work in this file (pattern mirrored here):
  //  1. Check OSM tags in addBuilding() BEFORE the generic height/style logic
  //  2. If matched, force a branded style / height and let the normal
  //     walls()/capTris()/roof code below build it ON THE REAL poly
  //  3. Never box() at 0,0 and never `return` early - that discards the footprint.
  // Detection: explicit Walmart in name/brand/operator, OR a large supermarket.
  // Rendering never uses Walmart's name, spark logo, or slogan.
  const _hay = `${tags.name || ''} ${tags.brand || ''} ${tags.operator || ''}`.toLowerCase();
  const isWalmartTagged = _hay.includes('walmart') || _hay.includes('wal-mart');
  const isMallmart = isWalmartTagged || (tags.shop === 'supermarket' && area > 800 && r() < 0.35);
  if (isMallmart) {
    // Force big-box proportions, but keep the real footprint.
    h = Math.max(h || 0, 7);
    const wallC = new THREE.Color('#ffffff'); // texture carries the blue
    // Main box: Mallmart facade (sign band + generic star baked into texture)
    walls(Bs.mallmart, poly, minH, h, wallC, { band: true, bay: 6, shade: 0.02 });
    // Yellow cornice / parapet trim
    const cor = offsetPoly(poly, 0.35);
    walls(Bs.trim, cor, h - 0.4, h + 0.4, new THREE.Color('#ffd100'), { band: true, shade: 0.02 });
    capTris(Bs.trim, cor, h - 0.4, 4, new THREE.Color('#d9b400'), true);
    capTris(Bs.flat, offsetPoly(poly, -0.3), h + 0.02, 6, new THREE.Color('#8d8a86'));
    // Rooftop HVAC units, like other flat roofs
    if (area > 120) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; poly.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
      const n = Math.min(4, 1 + Math.floor(area / 600));
      for (let k = 0; k < n; k++) {
        const sx = 1 + r() * 1.5, sz = 1 + r() * 1.5, x = x0 + sx + r() * Math.max(0, x1 - x0 - 2 * sx), z = z0 + sz + r() * Math.max(0, z1 - z0 - 2 * sz);
        if (!pip(x, z, poly)) continue;
        box(Bs.trim, x, z, sx, sz, h, 1 + r(), new THREE.Color('#c9ccd0'));
      }
    }
    // Pylon sign near the footprint centroid edge - generic star box, no Walmart spark
    let cx = 0, cz = 0; poly.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
    if (pip(cx, cz, poly)) {
      box(Bs.trim, cx, cz, 0.3, 0.3, h, 3.2, new THREE.Color('#0a5db8'));
      box(Bs.trim, cx, cz, 1.6, 0.9, h + 3.2, 1.4, new THREE.Color('#ffd100'));
    }
    return;
  }

  if (!h) h = small ? 2.8 : isHouse ? 6 + r() * 2 : 7 + r() * r() * 22;
  h = Math.min(h, 400);
  const tall = h > 28;
  let style = isHouse ? 'house' : IND.has(type) ? 'ind' : (COMM.has(type) || tall) ? (r() < 0.55 || h > 45 ? 'glass' : 'res') : (type === 'apartments' || type === 'residential') ? (r() < 0.35 ? 'brick' : 'res') : r() < 0.3 ? 'brick' : 'res';
  if (small) style = 'ind';
  const mat = tags['building:material'] || tags['building:facade:material'];
  if (mat === 'brick') style = 'brick'; else if (mat === 'glass') style = 'glass';
  const wallC = color(tags['building:colour'], pick(WALLS[style], r()));
  const shopFloor = !isHouse && !small && style !== 'ind' && h >= 8 && (tags.shop || COMM.has(type) || r() < 0.45) && minH === 0;
  const y0 = minH;
  let yWall = y0;
  if (shopFloor) { 
    walls(Bs.shop, poly, 0, 4, new THREE.Color('#ffffff'), { band: true, bay: 6, shade: 0.04 }); 
    yWall = 4; // ledge above shops
    walls(Bs.trim, offsetPoly(poly, 0.25), 3.85, 4.25, wallC.clone().multiplyScalar(0.8), { band: true }); 
  }
  const roofShape = tags['roof:shape'];
  const pitched = (isHouse || roofShape === 'hipped' || roofShape === 'gabled' || roofShape === 'pyramidal') && roofShape !== 'flat' && area < 900;
  const B = Bs[style];
  walls(B, poly, yWall, h, wallC, { vOff: style === 'glass' ? 0 : ((yWall - y0) / FLOOR) / GRID, floor: style === 'ind' ? 4.2 : FLOOR, bay: style === 'glass' ? 3 : style === 'house' ? 3.2 : BAY });
  if (y0 > 0) capTris(Bs.trim, poly, y0, 4, wallC.clone().multiplyScalar(0.7), true);
  if (pitched) {
    // hipped roof with eaves, toward the centroid
    let cx = 0, cz = 0; poly.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
    const eave = offsetPoly(poly, 0.45), rc = color(tags['roof:colour'], pick(ROOFS_TILE, r()));
    if (pip(cx, cz, poly)) {
      const rh = Math.min(4.5, 0.45 * Math.sqrt(area)), top = h + rh;
      for (let i = 0; i < eave.length; i++) {
        const a = eave[i], b = eave[(i + 1) % eave.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const slope = Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz, rh);
        const cc = rc.clone().multiplyScalar(0.85 + hash(i + id) * 0.25);
        B === null; Bs.tiles.tri([a[0], h - 0.15, a[1]], [cx, top, cz], [b[0], h - 0.15, b[1]], [0, 0], [len / 6, slope / 3], [len / 3, 0], cc);
      }
      capTris(Bs.trim, eave, h - 0.15, 4, rc.clone().multiplyScalar(0.5), true); // soffit
      walls(Bs.trim, eave, h - 0.35, h - 0.15, new THREE.Color('#f2eee6'), { band: true, shade: 0 }); // fascia
      if (r() < 0.6) { 
        const [px, pz] = poly[Math.floor(r() * poly.length)]; 
        const kx = cx + (px - cx) * 0.45, kz = cz + (pz - cz) * 0.45; 
        box(Bs.trim, kx, kz, 0.4, 0.4, h, rh * 0.75 + 0.8, new THREE.Color('#8a5a4a')); 
      } // chimney
      return;
    }
  }
  // flat roof: cornice/parapet + roof surface + rooftop units
  const rc = color(tags['roof:colour'], pick(ROOFS_FLAT, r()));
  if (!small && h > 5) {
    const cor = offsetPoly(poly, style === 'glass' ? 0.15 : 0.35), ch = style === 'glass' ? 0.5 : 0.8;
    const cc = style === 'glass' ? new THREE.Color('#9aa6b0') : wallC.clone().multiplyScalar(0.86);
    walls(Bs.trim, cor, h - ch * 0.5, h + ch * 0.5, cc, { band: true, shade: 0.05 });
    capTris(Bs.trim, cor, h - ch * 0.5, 4, cc.clone().multiplyScalar(0.6), true);
    // parapet inner wall + top + roof
    const inner = offsetPoly(poly, -0.3), pt = h + ch * 0.5;
    const innerRev = inner.slice().reverse(); walls(Bs.trim, innerRev, h, pt, cc.clone().multiplyScalar(0.8), { band: true, shade: 0 });
    for (let i = 0; i < cor.length; i++) { 
      const a = cor[i], b = cor[(i + 1) % cor.length], c = inner[(i + 1) % inner.length], d = inner[i]; 
      Bs.trim.quad([a[0], pt, a[1]], [d[0], pt, d[1]], [c[0], pt, c[1]], [b[0], pt, b[1]], [0, 0], [0, 0], [0, 0], [0, 0], cc.clone().multiplyScalar(1.05)); 
    }
    capTris(Bs.flat, inner, h + 0.02, 6, rc);
  } else capTris(Bs.flat, poly, h, 6, rc);
  // rooftop units
  if (area > 120 && !small) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; poly.forEach(([x, z]) => { 
      x0 = Math.min(x0, x); 
      x1 = Math.max(x1, x); 
      z0 = Math.min(z0, z); 
      z1 = Math.max(z1, z); 
    });
    const n = Math.min(5, 1 + Math.floor(area / 400));
    for (let k = 0; k < n; k++) {
      const sx = 0.8 + r() * 1.8, sz = 0.8 + r() * 1.8, x = x0 + sx + r() * (x1 - x0 - 2 * sx), z = z0 + sz + r() * (z1 - z0 - 2 * sz);
      if (!pip(x, z, poly) || !pip(x + sx, z + sz, poly) || !pip(x - sx, z - sz, poly) || !pip(x + sx, z - sz, poly) || !pip(x - sx, z + sz, poly)) continue;
      const kind = r();
      if (kind < 0.55) box(Bs.trim, x, z, sx, sz, h, 1 + r() * 1.2, new THREE.Color(pick(['#c9ccd0', '#b4b8bc', '#d8d6d0'], r()))); // HVAC
      else if (kind < 0.8 && h > 15) box(Bs.trim, x, z, sx * 1.2, sz * 1.2, h, 2.8 + r(), wallC.clone().multiplyScalar(0.8)); // stair/elevator room
      else { 
        box(Bs.trim, x, z, 0.9, 0.9, h, 1.6 + r(), new THREE.Color('#6d5a4c')); 
        box(Bs.trim, x, z, 1.1, 1.1, h + 2.2, 1.6, new THREE.Color('#8b6b52')); 
      } // water tank
    }
  }
  // antenna on towers
  if (h > 60 && r() < 0.6) { 
    let cx = 0, cz = 0; poly.forEach(p => { cx += p[0]; cz += p[1]; }); 
    cx /= poly.length; cz /= poly.length; 
    if (pip(cx, cz, poly)) box(Bs.trim, cx, cz, 0.15, 0.15, h, 6 + r() * 10, new THREE.Color('#d0d4d8')); 
  }
}

