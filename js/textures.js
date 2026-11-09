import * as THREE from 'three';

// Procedural, seamlessly tiling textures (no downloads). All are mapped in world
// space, so neighbouring roads / terrain chunks line up without visible seams.
// Colours are kept close to white so the existing per-type vertex colours still tint them.

let ANISO = 8;
export function setAnisotropy(n) { ANISO = Math.max(1, Math.min(16, n || 8)); }

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function canvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return [c, c.getContext('2d')]; }
// draw a shape at every wrapped copy so the tile repeats seamlessly
function wrapDraw(size, x, y, r, fn) { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { const X = x + dx, Y = y + dy; if (X + r < 0 || Y + r < 0 || X - r > size || Y - r > size) continue; fn(X, Y); } }
// smooth value noise that tiles over `period` cells
function tileNoise(size, period, seed) {
  const r = rng(seed), g = new Float32Array(period * period); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size), s = t => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * period, fy = y / size * period, ix = Math.floor(fx), iy = Math.floor(fy), tx = s(fx - ix), ty = s(fy - iy);
    const a = g[(iy % period) * period + ix % period], b = g[(iy % period) * period + (ix + 1) % period], c = g[((iy + 1) % period) * period + ix % period], d = g[((iy + 1) % period) * period + (ix + 1) % period];
    out[y * size + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
function finish(c, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
}
// paint fractal noise into the canvas as a brightness multiplier around `base`
function noiseFill(x, size, base, amp, seed, tint = [1, 1, 1]) {
  const img = x.createImageData(size, size), d = img.data;
  const n1 = tileNoise(size, 4, seed), n2 = tileNoise(size, 16, seed + 7), n3 = tileNoise(size, 64, seed + 13), r = rng(seed + 99);
  for (let i = 0; i < size * size; i++) {
    const v = base + amp * ((n1[i] - 0.5) * 0.5 + (n2[i] - 0.5) * 0.35 + (n3[i] - 0.5) * 0.25 + (r() - 0.5) * 0.3);
    d[i * 4] = Math.max(0, Math.min(255, v * 255 * tint[0])); d[i * 4 + 1] = Math.max(0, Math.min(255, v * 255 * tint[1])); d[i * 4 + 2] = Math.max(0, Math.min(255, v * 255 * tint[2])); d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
}

const cache = {};
// Asphalt: fine aggregate, darker tar patches, sealed cracks and oil stains
export function asphaltTexture() {
  if (cache.asphalt) return cache.asphalt;
  const S = 512, [c, x] = canvas(S), r = rng(11);
  noiseFill(x, S, 0.86, 0.32, 3);
  for (let i = 0; i < 9000; i++) { const px = r() * S, py = r() * S, l = 0.55 + r() * 0.6; x.fillStyle = `rgba(${l * 255 | 0},${l * 255 | 0},${l * 250 | 0},${0.25 + r() * 0.35})`; x.fillRect(px, py, 1 + (r() < 0.2), 1 + (r() < 0.2)); }
  for (let i = 0; i < 14; i++) { const px = r() * S, py = r() * S, rad = 20 + r() * 60; wrapDraw(S, px, py, rad, (X, Y) => { const g = x.createRadialGradient(X, Y, 0, X, Y, rad); g.addColorStop(0, `rgba(30,28,34,${0.12 + r() * 0.1})`); g.addColorStop(1, 'rgba(30,28,34,0)'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, rad, 0, 7); x.fill(); }); }
  x.lineCap = 'round';
  for (let i = 0; i < 4; i++) { // faint tar-sealed cracks
    let px = r() * S, py = r() * S, a = r() * 6.28; x.strokeStyle = 'rgba(28,26,32,0.28)'; x.lineWidth = 0.8 + r() * 0.8; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 10; k++) { a += (r() - 0.5) * 1.1; px += Math.cos(a) * 6; py += Math.sin(a) * 6; x.lineTo(px, py); } x.stroke();
  }
  return (cache.asphalt = finish(c));
}
// Paving / gravel for paths, footways, tracks
export function pavingTexture() {
  if (cache.paving) return cache.paving;
  const S = 256, [c, x] = canvas(S), r = rng(21);
  noiseFill(x, S, 0.9, 0.25, 8);
  for (let i = 0; i < 5000; i++) { const l = 0.6 + r() * 0.5; x.fillStyle = `rgba(${l * 255 | 0},${l * 245 | 0},${l * 225 | 0},${0.3 + r() * 0.3})`; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
  x.strokeStyle = 'rgba(60,52,44,0.28)'; x.lineWidth = 1.2;
  for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(0, k * S / 4); x.lineTo(S, k * S / 4); x.stroke(); }
  for (let row = 0; row < 4; row++) for (let k = 0; k <= 4; k++) { const xx = (k + (row % 2) * 0.5) * S / 4; x.beginPath(); x.moveTo(xx, row * S / 4); x.lineTo(xx, (row + 1) * S / 4); x.stroke(); }
  return (cache.paving = finish(c));
}
// Ground detail: grass blades + soil, near-white so land-cover vertex colours drive the hue
export function grassTexture() {
  if (cache.grass) return cache.grass;
  const S = 512, [c, x] = canvas(S), r = rng(31);
  noiseFill(x, S, 0.92, 0.28, 17, [1, 1.02, 0.96]);
  for (let i = 0; i < 260; i++) { const px = r() * S, py = r() * S, rad = 6 + r() * 26; wrapDraw(S, px, py, rad, (X, Y) => { const g = x.createRadialGradient(X, Y, 0, X, Y, rad); const soil = r() < 0.35; g.addColorStop(0, soil ? 'rgba(150,120,85,0.18)' : 'rgba(255,255,220,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(X, Y, rad, 0, 7); x.fill(); }); }
  x.lineCap = 'round';
  for (let i = 0; i < 14000; i++) {
    const px = r() * S, py = r() * S, h = 2 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 0.9, l = r();
    x.strokeStyle = l < 0.5 ? `rgba(40,70,25,${0.18 + r() * 0.2})` : `rgba(240,255,200,${0.12 + r() * 0.16})`; x.lineWidth = 0.8 + r() * 0.6;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * h, py + Math.sin(a) * h); x.stroke();
  }
  return (cache.grass = finish(c));
}
// Concrete for bridge decks' sides, parapets and pillars
export function concreteTexture() {
  if (cache.concrete) return cache.concrete;
  const S = 256, [c, x] = canvas(S), r = rng(41);
  noiseFill(x, S, 0.9, 0.2, 23);
  for (let i = 0; i < 3000; i++) { const l = 0.55 + r() * 0.4; x.fillStyle = `rgba(${l * 255 | 0},${l * 255 | 0},${l * 250 | 0},0.25)`; x.fillRect(r() * S, r() * S, 1, 1); }
  x.strokeStyle = 'rgba(40,40,44,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 1); x.lineTo(S, 1); x.moveTo(1, 0); x.lineTo(1, S); x.stroke(); // form-work joints
  for (let i = 0; i < 6; i++) { const px = r() * S; const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(60,55,50,0.18)'); g.addColorStop(1, 'rgba(60,55,50,0)'); x.fillStyle = g; x.fillRect(px, 0, 3 + r() * 8, S); } // rain streaks
  return (cache.concrete = finish(c));
}
// Leaves for tree canopies (mapped by the cone's own UVs)
export function foliageTexture() {
  if (cache.foliage) return cache.foliage;
  const S = 256, [c, x] = canvas(S), r = rng(51);
  noiseFill(x, S, 0.85, 0.3, 29);
  for (let i = 0; i < 2600; i++) { const px = r() * S, py = r() * S, rad = 2 + r() * 4, l = r(); x.fillStyle = l < 0.5 ? `rgba(20,45,20,${0.25 + r() * 0.25})` : `rgba(235,255,200,${0.15 + r() * 0.2})`; wrapDraw(S, px, py, rad, (X, Y) => { x.beginPath(); x.ellipse(X, Y, rad, rad * 0.55, r() * 3, 0, 7); x.fill(); }); }
  return (cache.foliage = finish(c));
}
export function barkTexture() {
  if (cache.bark) return cache.bark;
  const S = 128, [c, x] = canvas(S), r = rng(61);
  noiseFill(x, S, 0.75, 0.3, 31, [1, 0.9, 0.8]);
  for (let i = 0; i < 40; i++) { const px = r() * S; x.strokeStyle = `rgba(30,20,12,${0.3 + r() * 0.3})`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (r() - 0.5) * 10, S / 3, px + (r() - 0.5) * 10, S * 2 / 3, px, S); x.stroke(); }
  return (cache.bark = finish(c));
}

// world-space planar UVs (x,z) for flat things such as roads and terrain
export function planarUV(g, scale) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / scale; uv[i * 2 + 1] = p.getZ(i) / scale; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// UVs for vertical surfaces: horizontal distance along (x+z) and height
export function wallUV(g, scale) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) / scale; uv[i * 2 + 1] = p.getY(i) / scale; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
