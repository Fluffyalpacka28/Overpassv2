import * as THREE from 'three';

// Points of interest placed where they really are in OpenStreetMap:
//  - gas stations (amenity=fuel) get a canopy, pump islands, a shop and a price sign
//  - McDonald's locations become the totally unrelated "Wicdonald's" restaurant chain
//  - Burger King spots become "Burger Queen", Domino's become "Slice Street Pizza"
// Everything is merged into a few meshes per tile (one per material) so it is cheap to draw.

export function poiKind(t) {
  if (!t) return null;
  if (t.amenity === 'fuel') return 'fuel';
  const food = t.amenity === 'fast_food' || t.amenity === 'restaurant', nm = (t.brand || '') + ' ' + (t.name || ''), q = t['brand:wikidata'];
  if (!food) return null;
  if (q === 'Q38076' || /mc\s*donald/i.test(nm)) return 'wic';     // -> Wicdonald's
  if (q === 'Q177054' || /burger\s*king/i.test(nm)) return 'bq';    // -> Burger Queen
  if (q === 'Q839466' || /domino'?s/i.test(nm)) return 'pizza';      // -> Slice Street Pizza
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
  const crown2d = (x, cx, cy, s, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - s, cy + s * 0.55); x.lineTo(cx - s, cy - s * 0.35); x.lineTo(cx - s * 0.5, cy + s * 0.05); x.lineTo(cx, cy - s * 0.65); x.lineTo(cx + s * 0.5, cy + s * 0.05); x.lineTo(cx + s, cy - s * 0.35); x.lineTo(cx + s, cy + s * 0.55); x.closePath(); x.fill(); [-1, 0, 1].forEach(k => { x.beginPath(); x.arc(cx + k * s * (k ? 1 : 0), cy - s * (k ? 0.42 : 0.72), s * 0.13, 0, 7); x.fill(); }); };
  const slice2d = (x, cx, cy, s) => { x.fillStyle = '#ffb703'; x.beginPath(); x.moveTo(cx, cy + s); x.lineTo(cx - s * 0.75, cy - s * 0.6); x.quadraticCurveTo(cx, cy - s * 0.95, cx + s * 0.75, cy - s * 0.6); x.closePath(); x.fill(); x.fillStyle = '#c1121f'; [[-0.25, -0.35], [0.22, -0.3], [0, 0.15], [-0.05, -0.62], [0.32, -0.62]].forEach(([a, b]) => { x.beginPath(); x.arc(cx + a * s, cy + b * s, s * 0.12, 0, 7); x.fill(); }); x.fillStyle = '#b5651d'; x.beginPath(); x.moveTo(cx - s * 0.78, cy - s * 0.62); x.quadraticCurveTo(cx, cy - s * 1.0, cx + s * 0.78, cy - s * 0.62); x.lineTo(cx + s * 0.7, cy - s * 0.5); x.quadraticCurveTo(cx, cy - s * 0.85, cx - s * 0.7, cy - s * 0.5); x.closePath(); x.fill(); };
  const bq = signTexture((x, w, h) => {
    x.fillStyle = '#1f5fa8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f7a400'; x.beginPath(); x.ellipse(64, h / 2, 50, 42, 0, 0, 7); x.fill(); crown2d(x, 64, h / 2 + 4, 30, '#c8102e');
    x.fillStyle = '#fff3d6'; x.font = '900 60px Satoshi, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('Burger Queen', 128, h / 2 + 4, w - 140);
  });
  const bqSq = signTexture((x, w, h) => {
    x.fillStyle = '#1f5fa8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f7a400'; x.beginPath(); x.ellipse(w / 2, h * 0.42, w * 0.4, h * 0.3, 0, 0, 7); x.fill(); crown2d(x, w / 2, h * 0.44, w * 0.2, '#c8102e');
    x.fillStyle = '#fff3d6'; x.font = '900 34px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BURGER QUEEN', w / 2, h * 0.86, w - 20);
  }, 256, 256);
  const pizza = signTexture((x, w, h) => {
    x.fillStyle = '#0e7c47'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(0, h - 14, w, 7); x.fillStyle = '#d62828'; x.fillRect(0, h - 7, w, 7);
    slice2d(x, 64, h / 2 + 4, 46);
    x.fillStyle = '#fff'; x.font = '900 56px Satoshi, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('Slice Street', 124, h / 2 - 2, w - 134);
  });
  const pizzaSq = signTexture((x, w, h) => {
    x.fillStyle = '#0e7c47'; x.fillRect(0, 0, w, h); slice2d(x, w / 2, h * 0.4, w * 0.3);
    x.fillStyle = '#fff'; x.font = '900 36px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SLICE STREET', w / 2, h * 0.8, w - 20);
    x.fillStyle = '#ffd6d6'; x.font = '700 22px Satoshi, Arial'; x.fillText('PIZZA · CARRYOUT', w / 2, h * 0.92, w - 20);
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
    bq: new THREE.MeshBasicMaterial({ map: bq }), bqSq: new THREE.MeshBasicMaterial({ map: bqSq }),
    pizza: new THREE.MeshBasicMaterial({ map: pizza }), pizzaSq: new THREE.MeshBasicMaterial({ map: pizzaSq }),
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

function crownLogo(acc, key, M, cx, cy, cz, s, color, ry = 0) {
  // a 3D crown: band + three points
  const ox = k => [Math.cos(ry) * k, -Math.sin(ry) * k];
  push(acc, key, new THREE.BoxGeometry(s * 2, s * 0.5, s * 0.3), color, M, cx, cy, cz, 0, ry, 0);
  [-0.8, 0, 0.8].forEach((k, i) => { const [dx, dz] = ox(k * s); push(acc, key, new THREE.BoxGeometry(s * 0.55, s * 0.55, s * 0.28), color, M, cx + dx, cy + s * (i === 1 ? 0.55 : 0.4), cz + dz, 0, ry, Math.PI / 4); });
}
function sliceLogo(acc, M, cx, cy, cz, s, ry = 0) {
  // a 3D pizza slice standing upright: cheese wedge, crust, pepperoni
  const sh = new THREE.Shape(); sh.moveTo(0, -s); sh.lineTo(-s * 0.75, s * 0.6); sh.quadraticCurveTo(0, s * 0.95, s * 0.75, s * 0.6); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: s * 0.2, bevelEnabled: false }); g.translate(0, 0, -s * 0.1);
  push(acc, 'glow', g, '#ffb703', M, cx, cy, cz, 0, ry, 0);
  push(acc, 'solid', new THREE.BoxGeometry(s * 1.6, s * 0.22, s * 0.3), '#b5651d', M, cx, cy + s * 0.68, cz, 0, ry, 0);
  const ox = (a, b) => [Math.cos(ry) * a, -Math.sin(ry) * a, b];
  [[-0.25, 0.3], [0.22, 0.25], [0, -0.2]].forEach(([a, b]) => { const [dx, dz] = ox(a * s); for (const sd of [1, -1]) { const zz = s * 0.11 * sd; push(acc, 'glow', new THREE.CylinderGeometry(s * 0.12, s * 0.12, 0.02, 10), '#d62828', M, cx + dx + Math.sin(ry) * zz, cy + b * s, cz + dz + Math.cos(ry) * zz, Math.PI / 2, ry, 0); } });
}
const BRANDS = {
  wic:   { wall: '#efe2c9', base: '#7b4a2e', band: '#c8261d', trim: '#ffc72c', pylon: '#c8261d', glass: '#20303e', door: '#33414e', board: '#3a2a22', window: '#ffe9b0', thru: true },
  bq:    { wall: '#f1e2c4', base: '#5a3a24', band: '#1f5fa8', trim: '#f7a400', pylon: '#1f5fa8', glass: '#1d2a36', door: '#2c3a48', board: '#2a2f45', window: '#fff1c9', thru: true },
  pizza: { wall: '#f4f1ea', base: '#2f2f33', band: '#0e7c47', trim: '#d62828', pylon: '#0e7c47', glass: '#1c2733', door: '#d62828', board: '#0b5d36', window: '#ffe2b0', thru: false },
};
export const FOOD = new Set(Object.keys(BRANDS));
function logo(acc, M, kind, x, y, z, s) {
  if (kind === 'bq') crownLogo(acc, 'glow', M, x, y, z, s * 0.9, '#f7a400');
  else if (kind === 'pizza') sliceLogo(acc, M, x, y + s * 0.2, z, s * 1.1);
  else wLogo(acc, 'glow', M, x, y, z, s, '#ffc72c');
}
// Fast-food restaurant for one of the brands. Local frame: front faces +Z, footprint W (x) by D (z), ground at y=0.
export function restaurant(acc, M, kind = 'wic', W = 16, D = 11, full = true, roofY = 6) {
  const b = BRANDS[kind] || BRANDS.wic, sign = BRANDS[kind] ? kind : 'wic', sq = sign + 'Sq', H = 4.2;
  if (full) {
    B(acc, 'solid', M, W, H, D, 0, H / 2, 0, b.wall);                           // walls
    B(acc, 'solid', M, W + 0.1, 0.5, D + 0.1, 0, 0.25, 0, b.base);               // base
    B(acc, 'solid', M, W * 0.86, 2.0, 0.12, 0, 1.9, D / 2 + 0.02, b.glass);       // front windows
    for (let k = -3; k <= 3; k++) B(acc, 'solid', M, 0.12, 2.1, 0.16, k * W * 0.12, 1.9, D / 2 + 0.05, '#d9d6d0');
    B(acc, 'solid', M, 0.12, 2.0, D * 0.6, W / 2 + 0.02, 1.9, 0, b.glass);        // side windows
    B(acc, 'solid', M, 0.12, 2.0, D * 0.6, -W / 2 - 0.02, 1.9, 0, b.glass);
    B(acc, 'solid', M, 1.4, 2.4, 0.14, W * 0.32, 1.2, D / 2 + 0.06, b.door);      // door
    if (kind === 'pizza') { for (let k = 0; k < 9; k++) B(acc, 'solid', M, W / 9 - 0.05, 0.25, 1.2, -W / 2 + (k + 0.5) * W / 9, 3.3, D / 2 + 0.6, k % 2 ? '#ffffff' : b.trim, 0, 0.35); } // striped awning
    B(acc, 'solid', M, W + 1.0, 1.3, D + 1.0, 0, H + 0.65, 0, b.band);           // roof band
    B(acc, 'solid', M, W + 1.1, 0.22, D + 1.1, 0, H + 0.1, 0, b.trim);
    B(acc, 'solid', M, W - 0.4, 0.3, D - 0.4, 0, H + 1.35, 0, '#8d8a86');          // flat roof
    PL(acc, sign, M, Math.min(W * 0.7, 9), Math.min(W * 0.7, 9) / 4, 0, H + 0.65, D / 2 + 0.52);   // front sign
    PL(acc, sign, M, Math.min(D * 0.8, 7), Math.min(D * 0.8, 7) / 4, -W / 2 - 0.52, H + 0.65, 0, -Math.PI / 2);
    PL(acc, sign, M, Math.min(D * 0.8, 7), Math.min(D * 0.8, 7) / 4, W / 2 + 0.52, H + 0.65, 0, Math.PI / 2);
    // drive-thru (or carryout) window + menu board on the side
    B(acc, 'glow', M, 0.1, 1.0, 1.4, W / 2 + 0.05, 1.6, -D * 0.25, b.window);
    if (b.thru) { B(acc, 'solid', M, 0.3, 2.2, 1.8, W / 2 + 4, 1.1, -D * 0.5 + 1, b.board); PL(acc, sq, M, 1.6, 1.6, W / 2 + 3.84, 1.4, -D * 0.5 + 1, -Math.PI / 2); }
    else { // delivery scooters out front
      for (const k of [-1, 1]) { const x = -W * 0.3 + k * 1.1, z = D / 2 + 2; B(acc, 'solid', M, 0.5, 0.6, 1.5, x, 0.55, z, b.trim); B(acc, 'solid', M, 0.6, 0.5, 0.6, x, 1.1, z - 0.4, '#ffffff'); B(acc, 'solid', M, 0.12, 0.7, 0.12, x, 1.0, z + 0.6, '#333'); }
    }
  }
  logo(acc, M, kind, 0, full ? H + 2.4 : roofY + 1.4, 0, 1.3);
  // pylon sign at the front corner, near the road
  const px = W / 2 + 2, pz = D / 2 + 3.5;
  push(acc, 'solid', new THREE.CylinderGeometry(0.22, 0.28, 9, 8), '#9aa0a8', M, px, 4.5, pz);
  B(acc, 'solid', M, 4.2, 3.0, 0.6, px, 9.8, pz, b.pylon);
  PL(acc, sq, M, 2.9, 2.9, px, 9.8, pz + 0.31); PL(acc, sq, M, 2.9, 2.9, px, 9.8, pz - 0.31, Math.PI);
  logo(acc, M, kind, px, 12.4, pz, 1.0);
}
export const wicdonalds = (acc, M, W, D, full, roofY) => restaurant(acc, M, 'wic', W, D, full, roofY);

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
