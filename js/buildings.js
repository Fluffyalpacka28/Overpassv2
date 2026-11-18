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
  stucco: ['#f2dcc0', '#efc9a6', '#e8d7b0', '#f6e7d2', '#d9b38c', '#e9c7c0', '#cfe0d6', '#f3e2b8'],
  modern: ['#cfd2d4', '#b9bec2', '#e3e4e2', '#a7acb0', '#d8d2c8', '#9ea6ab'],
  siding: ['#e9eef0', '#cfdde6', '#e6e0cf', '#c9d6c0', '#f2e8d8', '#d8c8b8', '#bcc8d4', '#e8d0c0', '#9fb3bf', '#c7b9a3'],
  stone: ['#e6dccb', '#d8cfbf', '#cbc3b4', '#efe7d8', '#d6c7ad'],
};
const ROOFS_TILE = ['#9b4a3c', '#6d5f5a', '#56606e', '#8a5a3b', '#7a4238', '#5d5550', '#b0573e', '#47494f', '#6b4a3a', '#3e4652'];
const ROOFS_METAL = ['#7d8a8f', '#5f6b70', '#8a3b32', '#3f5a4a', '#a9adb0', '#4a5560', '#6e2c26'];
const CIVIC = new Set(['civic', 'public', 'government', 'townhall', 'university', 'college', 'school', 'church', 'cathedral', 'chapel', 'museum', 'hospital', 'courthouse', 'library']);
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
  const stucco = canvasTex((x) => { // plastered walls, arched windows with wooden shutters, a few small balconies
    const r = rng(83); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; x.fillRect(r() * S, r() * S, 3, 3); }
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.34, gh = ch * 0.56, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.2;
      x.fillStyle = '#efe6d8'; x.beginPath(); x.moveTo(gx - 6, gy + gh + 6); x.lineTo(gx - 6, gy + gw / 2); x.arc(gx + gw / 2, gy + gw / 2, gw / 2 + 6, Math.PI, 0); x.lineTo(gx + gw + 6, gy + gh + 6); x.fill();
      x.save(); x.beginPath(); x.moveTo(gx, gy + gh); x.lineTo(gx, gy + gw / 2); x.arc(gx + gw / 2, gy + gw / 2, gw / 2, Math.PI, 0); x.lineTo(gx + gw, gy + gh); x.clip(); glassFill(x, gx, gy, gw, gh, r); x.restore();
      x.fillStyle = '#efe6d8'; x.fillRect(gx + gw / 2 - 2, gy + gw / 2, 4, gh - gw / 2);
      const sh = pick(['#3e6a5a', '#2f4f7a', '#7a4a2a', '#8a6b3a', '#5a6a3a'], r()); if (r() < 0.75) { x.fillStyle = sh; x.fillRect(gx - gw * 0.5, gy + gw * 0.2, gw * 0.42, gh - gw * 0.2); x.fillRect(gx + gw * 1.08, gy + gw * 0.2, gw * 0.42, gh - gw * 0.2); x.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 8; k++) { x.fillRect(gx - gw * 0.5, gy + gw * 0.2 + k * (gh - gw * 0.2) / 8, gw * 0.42, 2); x.fillRect(gx + gw * 1.08, gy + gw * 0.2 + k * (gh - gw * 0.2) / 8, gw * 0.42, 2); } }
      if (r() < 0.3) { x.fillStyle = '#3a3a3a'; x.fillRect(gx - 12, gy + gh, gw + 24, 5); for (let k = 0; k <= 8; k++) x.fillRect(gx - 12 + k * (gw + 24) / 8, gy + gh * 0.72, 2, gh * 0.28 + 4); x.fillRect(gx - 12, gy + gh * 0.72, gw + 24, 3); }
    }
    x.fillStyle = 'rgba(0,0,0,.06)'; for (let fy = 0; fy < GRID; fy++) x.fillRect(0, fy * ch + ch - 4, S, 4);
  });
  const modern = canvasTex((x) => { // concrete panels and ribbon windows
    const r = rng(89); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.04})`; x.fillRect(r() * S, r() * S, 2, 2); }
    for (let fy = 0; fy < GRID; fy++) {
      const oy = fy * ch, gy = oy + ch * 0.3, gh = ch * 0.5;
      for (let bx = 0; bx < GRID * 2; bx++) glassFill(x, bx * cw / 2, gy, cw / 2, gh, r);
      x.fillStyle = '#2b2f33'; for (let bx = 0; bx <= GRID * 2; bx++) x.fillRect(bx * cw / 2 - 2, gy, 4, gh); x.fillRect(0, gy - 3, S, 4); x.fillRect(0, gy + gh - 1, S, 4);
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, oy + ch - 2, S, 2); for (let bx = 0; bx < GRID; bx++) x.fillRect(bx * cw, oy, 2, ch * 0.3);
    }
  });
  const siding = canvasTex((x) => { // clapboard houses with trimmed windows
    const r = rng(97); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 9) { const g = x.createLinearGradient(0, y, 0, y + 9); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,.06)'); g.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = g; x.fillRect(0, y, S, 9); }
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      if (r() < 0.2) continue;
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.36, gh = ch * 0.5, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.22;
      x.fillStyle = '#fbfbf8'; x.fillRect(gx - 7, gy - 9, gw + 14, gh + 16); x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(gx - 9, gy + gh + 5, gw + 18, 4);
      glassFill(x, gx, gy, gw, gh, r);
      x.fillStyle = '#fbfbf8'; x.fillRect(gx, gy + gh / 2 - 2, gw, 4); x.fillRect(gx + gw / 2 - 2, gy, 4, gh);
      if (r() < 0.4) { x.fillStyle = pick(['#2f3f5c', '#3d5a48', '#6a2f2a', '#2b2b2b'], r()); x.fillRect(gx - gw * 0.42, gy - 4, gw * 0.3, gh + 8); x.fillRect(gx + gw * 1.12, gy - 4, gw * 0.3, gh + 8); }
    }
  });
  const stone = canvasTex((x) => { // limestone civic buildings: big blocks, pilasters, tall windows with keystones
    const r = rng(101); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) for (let xx = (y / 16) % 2 ? -24 : 0; xx < S; xx += 48) { x.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`; x.fillRect(xx + 1, y + 1, 46, 14); }
    x.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < S; y += 16) x.fillRect(0, y, S, 1);
    for (let fy = 0; fy < GRID; fy++) for (let bx = 0; bx < GRID; bx++) {
      const ox = bx * cw, oy = fy * ch, gw = cw * 0.38, gh = ch * 0.62, gx = ox + (cw - gw) / 2, gy = oy + ch * 0.18;
      x.fillStyle = '#f4efe6'; x.fillRect(ox, oy, 10, ch); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(ox + 10, oy, 2, ch); // pilaster
      x.fillStyle = '#efe8db'; x.fillRect(gx - 7, gy - 7, gw + 14, gh + 14); glassFill(x, gx, gy, gw, gh, r);
      x.fillStyle = '#efe8db'; x.fillRect(gx + gw / 2 - 2, gy, 4, gh); x.fillRect(gx, gy + gh * 0.33, gw, 3);
      x.fillStyle = '#e2d8c6'; x.beginPath(); x.moveTo(gx - 10, gy - 7); x.lineTo(gx + gw / 2, gy - 22); x.lineTo(gx + gw + 10, gy - 7); x.fill(); // pediment
      x.fillStyle = '#d6cab4'; x.fillRect(gx - 10, gy + gh + 7, gw + 20, 7);
    }
  });
  const metal = canvasTex((x) => { // standing-seam metal roofing
    x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
    for (let xx = 0; xx < S; xx += 32) { x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(xx, 0, 3, S); x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(xx + 3, 0, 3, S); x.fillStyle = 'rgba(0,0,0,.05)'; x.fillRect(xx + 6, 0, 26, S); }
    const r = rng(107); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(90,60,40,${r() * 0.06})`; x.fillRect(r() * S, r() * S, 3 + r() * 20, 2); }
  });
  const flat = canvasTex((x) => { const r = rng(61); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.08})`; x.fillRect(r() * S, r() * S, 3, 3); } x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; for (let k = 0; k <= S; k += 128) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, S); x.moveTo(0, k); x.lineTo(S, k); x.stroke(); } });
  const tiles = canvasTex((x) => { const r = rng(71); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 16) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, y + 13, S, 3); for (let xx = (y / 16) % 2 ? 0 : 12; xx < S; xx += 24) { x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.1})`; x.fillRect(xx, y, 22, 13); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(xx + 22, y, 2, 13); } } });
  return { res, brick, glass, ind, house, shop, flat, tiles, stucco, modern, siding, stone, metal };
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
    stucco: m(T.stucco, { roughness: 0.95 }), modern: m(T.modern, { roughness: 0.55, metalness: 0.05 }), siding: m(T.siding, { roughness: 0.85 }), stone: m(T.stone, { roughness: 0.9 }), metal: m(T.metal, { roughness: 0.45, metalness: 0.35 }),
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
const KINDS = ['res', 'brick', 'glass', 'ind', 'house', 'shop', 'flat', 'tiles', 'stucco', 'modern', 'siding', 'stone', 'metal', 'trim'];
export function newBuilders() { const o = {}; for (const k of KINDS) o[k] = new Builder(); return o; }

function pip(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
function color(tag, fallback) { if (tag) { try { const c = new THREE.Color(); c.setStyle(tag.trim().replace(/\s+/g, '')); return c; } catch { } } return new THREE.Color(fallback); }
function offsetPoly(poly, d) { // outward offset (poly is clockwise-from-above so (-tz, tx) is outward)
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    let t1x = p[0] - a[0], t1z = p[1] - a[1], l1 = Math.hypot(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
    let t2x = b[0] - p[0], t2z = b[1] - p[1], l2 = Math.hypot(t2x, t2z) || 1; t2x /= l2; t2z /= l2;
    let nx = -(t1z + t2z), nz = t1x + t2x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
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

// a flat convex polygon (3D points) as a triangle fan, flipped if needed so its normal points along 'dir'
function face(B, pts, uvs, c, dir) {
  const [a, b, d] = pts, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  let P = pts, U = uvs; if (nx * dir[0] + ny * dir[1] + nz * dir[2] < 0) { P = pts.slice().reverse(); U = uvs.slice().reverse(); }
  for (let i = 1; i + 1 < P.length; i++) B.tri(P[0], P[i], P[i + 1], U[0], U[i], U[i + 1], c);
}
// smallest-area rectangle around the footprint; u = long axis
function obb(poly) {
  let best = null;
  const fit = (dx, dz) => { let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [x, z] of poly) { const u = x * dx + z * dz, v = -x * dz + z * dx; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; } return { dx, dz, u0, u1, v0, v1, A: (u1 - u0) * (v1 - v0) }; };
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
    const f = fit((bx - ax) / l, (bz - az) / l); if (!best || f.A < best.A) best = f;
  }
  if (!best) return null;
  if (best.v1 - best.v0 > best.u1 - best.u0) best = fit(-best.dz, best.dx);
  const cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2;
  return { dx: best.dx, dz: best.dz, cu, cv, L: best.u1 - best.u0, W: best.v1 - best.v0, A: best.A };
}
const UP = [0, 1, 0], DOWN = [0, -1, 0];
// Pitched roofs on the footprint's bounding rectangle: gabled, hipped, pyramidal, skillion (lean-to), gambrel (barn) and sawtooth (factories).
// h = top of the walls, rh = roof height, e = eave overhang. Roof faces go in RB, gable ends (wall colour) and eaves in Bs.trim.
function pitchedRoof(Bs, RB, o, shape, h, rh, e, rc, wallC, seed) {
  const a = o.L / 2, b = o.W / 2, P = (u, v, y) => { const U = o.cu + u, V = o.cv + v; return [U * o.dx - V * o.dz, y, U * o.dz + V * o.dx]; };
  const out = (su, sv) => [su * o.dx - sv * o.dz, 0, su * o.dz + sv * o.dx]; // outward direction along +-u / +-v
  const T = Bs.trim, tone = k => rc.clone().multiplyScalar(k), gc = wallC.clone().multiplyScalar(0.94);
  const slopeUV = (pts, uAxis) => pts.map(p => { const lu = (p[0] - P(0, 0, 0)[0]) * o.dx + (p[2] - P(0, 0, 0)[2]) * o.dz, lv = -(p[0] - P(0, 0, 0)[0]) * o.dz + (p[2] - P(0, 0, 0)[2]) * o.dx; return uAxis ? [lu / 3, Math.hypot(lv, p[1] - h) / 3] : [lv / 3, Math.hypot(lu, p[1] - h) / 3]; });
  const roof = (pts, uAxis, k) => face(RB, pts, slopeUV(pts, uAxis), tone(k), UP);
  const eaveRect = (y, ea, eb) => { const R = [P(-ea, -eb, y), P(ea, -eb, y), P(ea, eb, y), P(-ea, eb, y)]; face(T, R, R.map(() => [0, 0]), tone(0.45), DOWN); // soffit
    const fasc = new THREE.Color('#ece7de'); for (const [su, sv, p, q] of [[0, -1, R[0], R[1]], [1, 0, R[1], R[2]], [0, 1, R[2], R[3]], [-1, 0, R[3], R[0]]]) face(T, [p, q, [q[0], y - 0.22, q[2]], [p[0], y - 0.22, p[2]]], [[0, 0], [0, 0], [0, 0], [0, 0]], fasc, out(su, sv)); };
  if (shape === 'sawtooth') {
    const n = Math.max(2, Math.round(o.L / 8)), st = o.L / n, glassC = new THREE.Color('#9fb4c4');
    for (let k = 0; k < n; k++) {
      const u0 = -a + k * st, u1 = u0 + st;
      roof([P(u0, -b, h), P(u1, -b, h + rh), P(u1, b, h + rh), P(u0, b, h)], false, 0.95 + (k % 2) * 0.04);
      face(T, [P(u1, -b, h), P(u1, b, h), P(u1, b, h + rh), P(u1, -b, h + rh)], [[0, 0], [0, 0], [0, 0], [0, 0]], glassC, out(1, 0)); // north-light glazing (faces the open side, over the next tooth)
      for (const sv of [-1, 1]) face(T, [P(u0, sv * b, h), P(u1, sv * b, h), P(u1, sv * b, h + rh)], [[0, 0], [0, 0], [0, 0]], gc, out(0, sv));
    }
    return;
  }
  if (shape === 'skillion') { // one slope: high along -v, low along +v
    const y = v => h + rh * (b - v) / (2 * b), E = e;
    roof([P(-a - E, -b - E, y(-b - E)), P(a + E, -b - E, y(-b - E)), P(a + E, b + E, y(b + E)), P(-a - E, b + E, y(b + E))], true, 1);
    face(T, [P(-a, -b, h), P(a, -b, h), P(a, -b, h + rh), P(-a, -b, h + rh)], [[0, 0], [0, 0], [0, 0], [0, 0]], gc, out(0, -1));
    for (const su of [-1, 1]) face(T, [P(su * a, -b, h), P(su * a, b, h), P(su * a, -b, h + rh)], [[0, 0], [0, 0], [0, 0]], gc, out(su, 0));
    return;
  }
  const ye = h - rh * e / b, top = h + rh;
  if (shape === 'gambrel') { // barn: steep lower slope, shallow upper slope, pentagon gable ends
    const kv = b * 0.52, ky = h + rh * 0.68, ye2 = h - (ky - h) * e / (b - kv);
    for (const sv of [-1, 1]) {
      roof([P(-a - e, sv * (b + e), ye2), P(a + e, sv * (b + e), ye2), P(a + e, sv * kv, ky), P(-a - e, sv * kv, ky)], true, sv > 0 ? 0.92 : 1.02);
      roof([P(-a - e, sv * kv, ky), P(a + e, sv * kv, ky), P(a + e, 0, top), P(-a - e, 0, top)], true, sv > 0 ? 0.97 : 1.06);
    }
    for (const su of [-1, 1]) face(T, [P(su * a, -b, h), P(su * a, b, h), P(su * a, kv, ky), P(su * a, 0, top), P(su * a, -kv, ky)], [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], gc, out(su, 0));
    eaveRect(ye2, a + e, b + e); return;
  }
  if (shape === 'gabled') {
    for (const sv of [-1, 1]) roof([P(-a - e, sv * (b + e), ye), P(a + e, sv * (b + e), ye), P(a + e, 0, top), P(-a - e, 0, top)], true, sv > 0 ? 0.9 : 1.05);
    for (const su of [-1, 1]) face(T, [P(su * a, -b, h), P(su * a, b, h), P(su * a, 0, top)], [[0, 0], [0, 0], [0, 0]], gc, out(su, 0));
    // barge boards along the sloped gable edges
    const bc = new THREE.Color('#ece7de'); for (const su of [-1, 1]) for (const sv of [-1, 1]) face(T, [P(su * (a + e), sv * (b + e), ye), P(su * (a + e), 0, top), P(su * (a + e), 0, top - 0.22), P(su * (a + e), sv * (b + e), ye - 0.22)], [[0, 0], [0, 0], [0, 0], [0, 0]], bc, out(su, 0));
    eaveRect(ye, a + e, b + e); return;
  }
  // hipped / pyramidal: ridge shortened by the roof's half-width at each end (45-degree hips)
  const r = shape === 'pyramidal' ? 0 : Math.max(0, a - b);
  for (const sv of [-1, 1]) roof(r > 0.05 ? [P(-a - e, sv * (b + e), ye), P(a + e, sv * (b + e), ye), P(r, 0, top), P(-r, 0, top)] : [P(-a - e, sv * (b + e), ye), P(a + e, sv * (b + e), ye), P(0, 0, top)], true, sv > 0 ? 0.9 : 1.05);
  for (const su of [-1, 1]) roof([P(su * (a + e), -b - e, ye), P(su * (a + e), b + e, ye), P(su * r, 0, top)], false, su > 0 ? 0.96 : 0.84);
  eaveRect(ye, a + e, b + e);
}
// older-style hip toward the centre, for footprints that aren't close to a rectangle (normals now face up)
function fanRoof(Bs, poly, h, rh, rc, id) {
  let cx = 0, cz = 0; poly.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
  const eave = offsetPoly(poly, 0.45), top = h + rh;
  for (let i = 0; i < eave.length; i++) {
    const a = eave[i], b = eave[(i + 1) % eave.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), slope = Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz, rh);
    face(Bs.tiles, [[a[0], h - 0.15, a[1]], [b[0], h - 0.15, b[1]], [cx, top, cz]], [[0, 0], [len / 3, 0], [len / 6, slope / 3]], rc.clone().multiplyScalar(0.85 + hash(i + id) * 0.25), UP);
  }
  capTris(Bs.trim, eave, h - 0.15, 4, rc.clone().multiplyScalar(0.5), true);
  walls(Bs.trim, eave, h - 0.35, h - 0.15, new THREE.Color('#f2eee6'), { band: true, shade: 0 });
}
function polyArea(poly) { let A = 0; for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; A += x1 * z2 - x2 * z1; } return A / 2; }
// balconies: a slab and a railing on each floor of the longer walls
function balconies(Bs, poly, y0, y1, wallC, r) {
  const edges = []; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az); if (len > 7) edges.push({ ax, az, bx, bz, len }); }
  edges.sort((p, q) => q.len - p.len); const rail = r() < 0.5 ? new THREE.Color('#2e3236') : new THREE.Color('#9fb3bd'), slab = wallC.clone().multiplyScalar(1.04);
  const floors = Math.min(12, Math.floor((y1 - y0) / FLOOR) - 1), frac = 0.35 + r() * 0.35;
  for (const E of edges.slice(0, 4)) {
    const tx = (E.bx - E.ax) / E.len, tz = (E.bz - E.az) / E.len, nx = -tz, nz = tx, yaw = Math.atan2(tz, tx), mx = (E.ax + E.bx) / 2, mz = (E.az + E.bz) / 2, half = E.len * frac / 2;
    for (let f = 1; f <= floors; f++) {
      const y = y0 + f * FLOOR - 0.05;
      box(Bs.trim, mx + nx * 0.6, mz + nz * 0.6, half, 0.6, y, 0.16, slab, yaw);
      box(Bs.trim, mx + nx * 1.17, mz + nz * 1.17, half, 0.03, y + 0.16, 0.95, rail, yaw);
    }
  }
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
  if (!h) h = small ? 2.8 : isHouse ? 6 + r() * 2 : 7 + r() * r() * 22;
  h = Math.min(h, 400);
  const tall = h > 28, civic = CIVIC.has(type) || CIVIC.has(tags.amenity) || tags.amenity === 'place_of_worship';
  // facade style
  const q = r();
  let style = isHouse ? (q < 0.42 ? 'house' : q < 0.85 ? 'siding' : 'brick')
    : IND.has(type) ? 'ind'
    : civic ? (q < 0.6 ? 'stone' : q < 0.8 ? 'brick' : 'res')
    : (COMM.has(type) || tall) ? (h > 45 ? (q < 0.6 ? 'glass' : q < 0.85 ? 'modern' : 'stone') : (q < 0.4 ? 'glass' : q < 0.7 ? 'modern' : q < 0.85 ? 'res' : 'stone'))
    : (type === 'apartments' || type === 'residential') ? (q < 0.32 ? 'res' : q < 0.55 ? 'brick' : q < 0.78 ? 'stucco' : 'modern')
    : q < 0.38 ? 'res' : q < 0.6 ? 'brick' : q < 0.82 ? 'stucco' : 'modern';
  if (small) style = 'ind';
  const mat = tags['building:material'] || tags['building:facade:material'];
  if (mat === 'brick') style = 'brick'; else if (mat === 'glass') style = 'glass'; else if (mat === 'stone' || mat === 'sandstone' || mat === 'limestone') style = 'stone'; else if (mat === 'plaster') style = 'stucco'; else if (mat === 'wood') style = isHouse ? 'siding' : style; else if (mat === 'concrete') style = 'modern';
  const wallC = color(tags['building:colour'], pick(WALLS[style], r()));
  const shopFloor = !isHouse && !small && style !== 'ind' && style !== 'stone' && h >= 8 && (tags.shop || COMM.has(type) || r() < 0.45) && minH === 0;
  const y0 = minH;
  let yWall = y0;
  if (shopFloor) { walls(Bs.shop, poly, 0, 4, new THREE.Color('#ffffff'), { band: true, bay: 6, shade: 0.04 }); yWall = 4; // ledge above shops
    walls(Bs.trim, offsetPoly(poly, 0.25), 3.85, 4.25, wallC.clone().multiplyScalar(0.8), { band: true }); }
  const B = Bs[style], wallOpts = y => ({ vOff: style === 'glass' ? 0 : ((y - y0) / FLOOR) / GRID, floor: style === 'ind' ? 4.2 : FLOOR, bay: style === 'glass' ? 3 : (style === 'house' || style === 'siding') ? 3.2 : BAY });
  if (y0 > 0) capTris(Bs.trim, poly, y0, 4, wallC.clone().multiplyScalar(0.7), true);

  // ---- roof shape ----
  const o = obb(poly), rect = o ? area / o.A : 0;
  const tagShape = { hipped: 'hipped', 'half-hipped': 'hipped', mansard: 'hipped', gabled: 'gabled', saltbox: 'gabled', round: 'gabled', pyramidal: 'pyramidal', skillion: 'skillion', lean_to: 'skillion', gambrel: 'gambrel', sawtooth: 'sawtooth', flat: 'flat' }[tags['roof:shape']];
  let shape = tagShape || null;
  if (!shape) {
    const sq = o && o.L / Math.max(0.1, o.W) < 1.25;
    if (type === 'barn' || type === 'farm_auxiliary' || type === 'stable') shape = 'gambrel';
    else if (isHouse) shape = sq ? (r() < 0.55 ? 'pyramidal' : 'hipped') : (r() < 0.5 ? 'hipped' : 'gabled');
    else if (small) shape = r() < 0.55 ? 'skillion' : 'gabled';
    else if (style === 'ind' && area > 500 && r() < 0.3) shape = 'sawtooth';
    else if (style === 'ind' && area < 2500 && h < 12 && r() < 0.35) shape = 'gabled';
    else if (!tall && h < 13 && area < 500 && style !== 'glass' && style !== 'modern' && r() < 0.3) shape = r() < 0.5 ? 'hipped' : 'gabled';
    else shape = 'flat';
  }
  const fitsRect = o && rect > 0.8 && o.W > 2.2 && (o.W < 32 || tagShape);
  if (shape !== 'flat' && (fitsRect || isHouse)) {
    const roofMetal = shape === 'sawtooth' || shape === 'skillion' || shape === 'gambrel' && r() < 0.6 || style === 'ind' || (!isHouse && r() < 0.35) || (isHouse && r() < 0.15);
    const rc = color(tags['roof:colour'], pick(roofMetal ? ROOFS_METAL : ROOFS_TILE, r()));
    const RB = roofMetal ? Bs.metal : Bs.tiles;
    if (fitsRect) {
      const b = o.W / 2, ang = parseFloat(tags['roof:angle']);
      let rh = parseFloat(tags['roof:height']);
      if (!(rh > 0)) rh = ang > 0 ? b * Math.tan(Math.min(70, ang) * Math.PI / 180)
        : shape === 'gambrel' ? b * 1.0 : shape === 'skillion' ? Math.min(2.6, o.W * 0.16) : shape === 'sawtooth' ? Math.min(2.6, 1.4 + o.W * 0.01)
        : b * Math.tan((isHouse ? 30 + r() * 12 : 20 + r() * 8) * Math.PI / 180);
      rh = Math.max(0.6, Math.min(shape === 'gambrel' ? 9 : 7, rh));
      walls(B, poly, yWall, h, wallC, wallOpts(yWall));
      pitchedRoof(Bs, RB, o, shape, h, rh, shape === 'sawtooth' ? 0 : small ? 0.25 : 0.45, rc, wallC, id);
      if (isHouse && r() < 0.6) { // chimney
        const u = (r() - 0.5) * o.L * 0.6, v = (r() < 0.5 ? -1 : 1) * o.W * 0.18, U = o.cu + u, V = o.cv + v, x = U * o.dx - V * o.dz, z = U * o.dz + V * o.dx;
        if (pip(x, z, poly)) box(Bs.trim, x, z, 0.38, 0.38, h, rh + 0.9, new THREE.Color(pick(['#8a5a4a', '#7a6a60', '#9b6b52'], r())));
      }
      return;
    }
    let cx = 0, cz = 0; poly.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
    if (pip(cx, cz, poly)) { walls(B, poly, yWall, h, wallC, wallOpts(yWall)); fanRoof(Bs, poly, h, Math.min(3.5, 0.38 * Math.sqrt(area)), rc, id); return; }
  }

  // ---- flat roof (optionally with a setback tower on top) ----
  let rp = poly, rArea = area, hWall = h;
  if (h > 40 && rect > 0.72 && area > 250 && style !== 'ind' && r() < 0.55) {
    const inset = Math.min(5, 1.5 + Math.sqrt(area) * 0.1), up = offsetPoly(poly, -inset), ua = -polyArea(up);
    if (ua > area * 0.3 && up.every(([x, z]) => pip(x, z, poly))) {
      const hs = Math.max(yWall + 3 * FLOOR, h * (0.5 + r() * 0.25));
      walls(B, poly, yWall, hs, wallC, wallOpts(yWall));
      walls(Bs.trim, offsetPoly(poly, 0.25), hs - 0.35, hs + 0.35, style === 'glass' ? new THREE.Color('#9aa6b0') : wallC.clone().multiplyScalar(0.85), { band: true, shade: 0.05 });
      capTris(Bs.flat, poly, hs + 0.36, 6, color(tags['roof:colour'], pick(ROOFS_FLAT, r())));
      yWall = hs + 0.36; rp = up; rArea = ua;
    }
  }
  walls(B, rp, yWall, hWall, wallC, wallOpts(yWall));
  if ((style === 'res' || style === 'stucco' || style === 'modern' || style === 'brick') && !small && h > 10 && h < 50 && rp === poly && r() < 0.35) balconies(Bs, poly, yWall, h, wallC, r);
  const rc = color(tags['roof:colour'], pick(ROOFS_FLAT, r()));
  if (!small && h > 5) {
    const cor = offsetPoly(rp, style === 'glass' ? 0.15 : 0.35), ch = style === 'glass' ? 0.5 : 0.8;
    const cc = style === 'glass' ? new THREE.Color('#9aa6b0') : wallC.clone().multiplyScalar(0.86);
    walls(Bs.trim, cor, h - ch * 0.5, h + ch * 0.5, cc, { band: true, shade: 0.05 });
    capTris(Bs.trim, cor, h - ch * 0.5, 4, cc.clone().multiplyScalar(0.6), true);
    // parapet inner wall + top + roof
    const inner = offsetPoly(rp, -0.3), pt = h + ch * 0.5;
    const innerRev = inner.slice().reverse(); walls(Bs.trim, innerRev, h, pt, cc.clone().multiplyScalar(0.8), { band: true, shade: 0 });
    for (let i = 0; i < cor.length; i++) { const a = cor[i], b = cor[(i + 1) % cor.length], c = inner[(i + 1) % inner.length], d = inner[i]; Bs.trim.quad([a[0], pt, a[1]], [b[0], pt, b[1]], [c[0], pt, c[1]], [d[0], pt, d[1]], [0, 0], [0, 0], [0, 0], [0, 0], cc.clone().multiplyScalar(1.05)); }
    capTris(Bs.flat, inner, h + 0.02, 6, rc);
  } else capTris(Bs.flat, rp, h, 6, rc);
  // rooftop units
  if (rArea > 120 && !small) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; rp.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    const n = Math.min(5, 1 + Math.floor(rArea / 400));
    for (let k = 0; k < n; k++) {
      const sx = 0.8 + r() * 1.8, sz = 0.8 + r() * 1.8, x = x0 + sx + r() * (x1 - x0 - 2 * sx), z = z0 + sz + r() * (z1 - z0 - 2 * sz);
      if (!pip(x, z, rp) || !pip(x + sx, z + sz, rp) || !pip(x - sx, z - sz, rp) || !pip(x + sx, z - sz, rp) || !pip(x - sx, z + sz, rp)) continue;
      const kind = r();
      if (kind < 0.45) box(Bs.trim, x, z, sx, sz, h, 1 + r() * 1.2, new THREE.Color(pick(['#c9ccd0', '#b4b8bc', '#d8d6d0'], r()))); // HVAC
      else if (kind < 0.62 && h < 30) { box(Bs.trim, x, z, sx, sz, h + 0.4, 0.08, new THREE.Color('#1d2b3c'), r() * 0.3); box(Bs.trim, x, z, sx * 0.9, 0.06, h, 0.45, new THREE.Color('#9aa0a6')); } // solar panels
      else if (kind < 0.8 && h > 15) box(Bs.trim, x, z, sx * 1.2, sz * 1.2, h, 2.8 + r(), wallC.clone().multiplyScalar(0.8)); // stair/elevator room
      else { box(Bs.trim, x, z, 0.9, 0.9, h, 1.6 + r(), new THREE.Color('#6d5a4c')); box(Bs.trim, x, z, 1.1, 1.1, h + 2.2, 1.6, new THREE.Color('#8b6b52')); } // water tank
    }
  }
  // antenna on towers
  if (h > 60 && r() < 0.6) { let cx = 0, cz = 0; rp.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= rp.length; cz /= rp.length; if (pip(cx, cz, rp)) box(Bs.trim, cx, cz, 0.15, 0.15, h, 6 + r() * 10, new THREE.Color('#d0d4d8')); }
}
