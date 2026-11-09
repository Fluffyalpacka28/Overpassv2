import * as THREE from 'three';

// Points of interest placed where they really are in OpenStreetMap:
//  - gas stations (amenity=fuel) get a canopy, pump islands, a shop and a price sign
//  - McDonald's locations become the totally unrelated "Wicdonald's" restaurant chain
// Everything is merged into a few meshes per tile (one per material) so it is cheap to draw.

export function poiKind(t) {
  if (!t) return null;
  if (t.amenity === 'fuel') return 'fuel';
  if (t.amenity === 'fast_food' && (t['brand:wikidata'] === 'Q38076' || /mc\s*donald/i.test((t.brand || '') + ' ' + (t.name || '')))) return 'wic';
  return null;
}

function signTexture(draw, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function drawW(x, cx, cy, s, col) {
  // the Wicdonald's "double valley" W — two golden bumps pointing down
  x.strokeStyle = col; x.lineWidth = s * 0.26; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath();
  x.moveTo(cx - s, cy - s * 0.7); x.quadraticCurveTo(cx - s * 0.75, cy + s * 0.9, cx - s * 0.5, cy + s * 0.75);
  x.quadraticCurveTo(cx - s * 0.2, cy + s * 0.55, cx, cy - s * 0.35);
  x.quadraticCurveTo(cx + s * 0.2, cy + s * 0.55, cx + s * 0.5, cy + s * 0.75);
  x.quadraticCurveTo(cx + s * 0.75, cy + s * 0.9, cx + s, cy - s * 0.7); x.stroke();
}
let MATS = null;
export function poiMaterials() {
  if (MATS) return MATS;
  const wic = signTexture((x, w, h) => {
    x.fillStyle = '#c8261d'; x.fillRect(0, 0, w, h);
    drawW(x, 70, h / 2, 38, '#ffc72c');
    x.fillStyle = '#fff'; x.font = '800 66px Satoshi, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText("Wicdonald's", 128, h / 2 + 4, w - 140);
  });
  const wicSq = signTexture((x, w, h) => {
    x.fillStyle = '#c8261d'; x.fillRect(0, 0, w, h); drawW(x, w / 2, h * 0.42, w * 0.3, '#ffc72c');
    x.fillStyle = '#fff'; x.font = '800 44px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('WICDONALD\'S', w / 2, h * 0.86, w - 20);
  }, 256, 256);
  const gas = signTexture((x, w, h) => {
    x.fillStyle = '#12704a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd23f'; x.fillRect(0, h - 18, w, 18);
    x.fillStyle = '#fff'; x.font = '800 70px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GAS · FOOD · NITRO', w / 2, h / 2 - 6, w - 30);
  }, 1024, 128);
  const price = signTexture((x, w, h) => {
    x.fillStyle = '#12704a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '800 46px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GAS', w / 2, 40);
    x.fillStyle = '#111'; [0, 1, 2].forEach(i => x.fillRect(18, 80 + i * 56, w - 36, 46));
    x.fillStyle = '#ff5a3c'; x.font = '700 38px Chakra Petch, monospace'; ['3.49', '3.89', 'NOS'].forEach((p, i) => { x.textAlign = 'left'; x.fillStyle = '#ddd'; x.font = '600 22px Satoshi, Arial'; x.fillText(['REG', 'PREM', 'FREE'][i], 28, 104 + i * 56); x.textAlign = 'right'; x.fillStyle = i === 2 ? '#7cf3ff' : '#ff8a3c'; x.font = '700 38px Chakra Petch, monospace'; x.fillText(p, w - 28, 104 + i * 56); });
  }, 256, 256);
  const mart = signTexture((x, w, h) => { x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#12704a'; x.font = '800 74px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('QUIK MART', w / 2, h / 2 + 4); });
  MATS = {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.08 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    wic: new THREE.MeshBasicMaterial({ map: wic }), wicSq: new THREE.MeshBasicMaterial({ map: wicSq }),
    gas: new THREE.MeshBasicMaterial({ map: gas }), price: new THREE.MeshBasicMaterial({ map: price }), mart: new THREE.MeshBasicMaterial({ map: mart }),
  };
  return MATS;
}

// ---------- geometry accumulation ----------
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function push(acc, key, geo, color, M, px, py, pz, rx = 0, ry = 0, rz = 0) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone(); if (geo.index) geo.dispose();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  _c.set(color || '#ffffff'); const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(px, py, pz); _m.compose(_p, _q, _s); g.applyMatrix4(_m); g.applyMatrix4(M);
  (acc[key] = acc[key] || []).push(g);
}
const B = (acc, key, M, w, h, d, x, y, z, color, ry = 0, rz = 0) => push(acc, key, new THREE.BoxGeometry(w, h, d), color, M, x, y, z, 0, ry, rz);
const PL = (acc, key, M, w, h, x, y, z, ry = 0, rx = 0) => push(acc, key, new THREE.PlaneGeometry(w, h), '#ffffff', M, x, y, z, rx, ry);
function wLogo(acc, key, M, cx, cy, cz, s, color, ry = 0) {
  // a W made of four bars (3D, for rooftops and pylons)
  const pts = [[-1, 0.8], [-0.5, -0.8], [0, 0.35], [0.5, -0.8], [1, 0.8]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay) * s, ang = Math.atan2(by - ay, bx - ax);
    const mx = (ax + bx) / 2 * s, my = (ay + by) / 2 * s, ox = Math.cos(ry) * mx, oz = -Math.sin(ry) * mx;
    push(acc, key, new THREE.BoxGeometry(L + s * 0.22, s * 0.32, s * 0.3), color, M, cx + ox, cy + my, cz + oz, 0, ry, ang);
  }
}

// Wicdonald's restaurant. Local frame: front faces +Z, footprint W (x) by D (z), ground at y=0.
export function wicdonalds(acc, M, W = 16, D = 11, full = true, roofY = 6) {
  const H = 4.2;
  if (full) {
    B(acc, 'solid', M, W, H, D, 0, H / 2, 0, '#efe2c9');                         // walls
    B(acc, 'solid', M, W + 0.1, 0.5, D + 0.1, 0, 0.25, 0, '#7b4a2e');             // brick base
    B(acc, 'solid', M, W * 0.86, 2.0, 0.12, 0, 1.9, D / 2 + 0.02, '#20303e');      // front windows
    for (let k = -3; k <= 3; k++) B(acc, 'solid', M, 0.12, 2.1, 0.16, k * W * 0.12, 1.9, D / 2 + 0.05, '#d9d6d0');
    B(acc, 'solid', M, 0.12, 2.0, D * 0.6, W / 2 + 0.02, 1.9, 0, '#20303e');       // side windows
    B(acc, 'solid', M, 0.12, 2.0, D * 0.6, -W / 2 - 0.02, 1.9, 0, '#20303e');
    B(acc, 'solid', M, 1.4, 2.4, 0.14, W * 0.32, 1.2, D / 2 + 0.06, '#33414e');    // door
    // red mansard roof band all round
    B(acc, 'solid', M, W + 1.0, 1.3, D + 1.0, 0, H + 0.65, 0, '#c8261d');
    B(acc, 'solid', M, W + 1.1, 0.22, D + 1.1, 0, H + 0.1, 0, '#ffc72c');
    B(acc, 'solid', M, W - 0.4, 0.3, D - 0.4, 0, H + 1.35, 0, '#8d8a86');          // flat roof
    PL(acc, 'wic', M, Math.min(W * 0.7, 9), Math.min(W * 0.7, 9) / 4, 0, H + 0.65, D / 2 + 0.52);   // front sign
    PL(acc, 'wic', M, Math.min(D * 0.8, 7), Math.min(D * 0.8, 7) / 4, -W / 2 - 0.52, H + 0.65, 0, -Math.PI / 2);
    PL(acc, 'wic', M, Math.min(D * 0.8, 7), Math.min(D * 0.8, 7) / 4, W / 2 + 0.52, H + 0.65, 0, Math.PI / 2);
    // drive-thru window + menu board on the side
    B(acc, 'glow', M, 0.1, 1.0, 1.4, W / 2 + 0.05, 1.6, -D * 0.25, '#ffe9b0');
    B(acc, 'solid', M, 0.3, 2.2, 1.8, W / 2 + 4, 1.1, -D * 0.5 + 1, '#3a2a22'); PL(acc, 'wicSq', M, 1.6, 1.6, W / 2 + 3.84, 1.4, -D * 0.5 + 1, -Math.PI / 2);
  }
  // rooftop logo
  wLogo(acc, 'glow', M, 0, full ? H + 2.4 : roofY + 1.4, 0, 1.3, '#ffc72c');
  // pylon sign at the front corner, near the road
  const px = W / 2 + 2, pz = D / 2 + 3.5;
  push(acc, 'solid', new THREE.CylinderGeometry(0.22, 0.28, 9, 8), '#9aa0a8', M, px, 4.5, pz);
  B(acc, 'solid', M, 4.2, 3.0, 0.6, px, 9.8, pz, '#c8261d');
  PL(acc, 'wicSq', M, 2.9, 2.9, px, 9.8, pz + 0.31); PL(acc, 'wicSq', M, 2.9, 2.9, px, 9.8, pz - 0.31, Math.PI);
  wLogo(acc, 'glow', M, px, 12.4, pz, 1.0, '#ffc72c');
}

// Gas station. Local frame: front (road side) faces +Z. Canopy is centered at the origin.
export function gasStation(acc, M, withShop = true) {
  const cw = 15, cd = 9.5, ch = 5.0;
  B(acc, 'solid', M, cw + 6, 0.6, cd + 8, 0, -0.22, 0, '#b9b6ae');               // concrete apron
  B(acc, 'solid', M, cw, 0.7, cd, 0, ch + 0.35, 0, '#f4f4f2');                    // canopy slab
  B(acc, 'solid', M, cw + 0.2, 0.18, cd + 0.2, 0, ch + 0.78, 0, '#ffd23f');
  PL(acc, 'glow', M, cw - 0.6, cd - 0.6, 0, ch - 0.02, 0, 0, Math.PI / 2);        // lit underside
  PL(acc, 'gas', M, cw - 0.4, 0.62, 0, ch + 0.36, cd / 2 + 0.02);                 // fascia signs
  PL(acc, 'gas', M, cw - 0.4, 0.62, 0, ch + 0.36, -cd / 2 - 0.02, Math.PI);
  for (const ix of [-3.6, 3.6]) {
    B(acc, 'solid', M, 1.4, 0.3, 6, ix, 0.15, 0, '#d9d6cf');                      // island
    for (const iz of [-2.6, 2.6]) B(acc, 'solid', M, 0.32, 0.32, 0.32, ix, 0.4, iz, '#ffd23f'); // bollards
    B(acc, 'solid', M, 0.45, ch, 0.45, ix, ch / 2, 0, '#e8e8e6');                  // column
    for (const pz of [-1.6, 1.6]) {
      B(acc, 'solid', M, 0.9, 1.75, 0.55, ix, 1.17, pz, '#f8f8f6');               // pump
      B(acc, 'solid', M, 0.92, 0.25, 0.57, ix, 2.0, pz, '#12704a');
      B(acc, 'glow', M, 0.5, 0.32, 0.58, ix, 1.55, pz, '#9fe8ff');                // screen
      B(acc, 'solid', M, 0.08, 0.6, 0.08, ix + 0.5, 1.0, pz, '#1d2029');          // nozzle
    }
  }
  if (withShop) {
    const sz = -cd / 2 - 7;
    B(acc, 'solid', M, 13, 3.8, 6.5, 0, 1.9, sz, '#e9e4d8');
    B(acc, 'solid', M, 13.3, 0.6, 6.8, 0, 4.0, sz, '#12704a');
    B(acc, 'solid', M, 9, 2.0, 0.1, 0, 1.55, sz + 3.27, '#22323f');
    B(acc, 'solid', M, 1.4, 2.3, 0.14, 2.5, 1.15, sz + 3.3, '#33414e');
    PL(acc, 'mart', M, 6, 0.75, 0, 3.05, sz + 3.3);
    B(acc, 'solid', M, 1.4, 1.0, 0.8, -5.6, 0.5, sz + 3.6, '#5b8fd1');            // ice chest
  }
  // price sign by the road
  const px = cw / 2 + 2.5, pz = cd / 2 + 3;
  B(acc, 'solid', M, 0.3, 4.5, 0.3, px, 2.25, pz, '#9aa0a8');
  B(acc, 'solid', M, 2.6, 2.6, 0.4, px, 5.6, pz, '#0e5a3b');
  PL(acc, 'price', M, 2.4, 2.4, px, 5.6, pz + 0.21); PL(acc, 'price', M, 2.4, 2.4, px, 5.6, pz - 0.21, Math.PI);
  return { shop: withShop ? { x: 0, z: -cd / 2 - 7, w: 13, d: 6.5 } : null };
}
