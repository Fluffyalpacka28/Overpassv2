import * as THREE from 'three';

// Points of interest placed where they really are in OpenStreetMap:
//  - gas stations (amenity=fuel) get a canopy, pump islands, a shop and a price sign
//  - McDonald's locations become the totally unrelated "Wicdonald's" restaurant chain
//  - Burger King spots become "Burger Queen", Domino's become "Slice Street Pizza"
// Everything is merged into a few meshes per tile (one per material) so it is cheap to draw.

export function poiKind(t) {
  if (!t) return null;
  if (t.amenity === 'fuel') return 'fuel';
  // Dick's Sporting Goods locations -> the unrelated "Blick's Shooting Goods" (own name, colours and crosshair logo): drive in and buy car weapons
  if (t['brand:wikidata'] === 'Q5272601' || /dick'?s\s+sporting/i.test((t.brand || '') + ' ' + (t.name || ''))) return 'blicks';
  // mechanics: free repairs (car_repair / tyre shops / mechanic workshops)
  if (t.shop === 'car_repair' || t.shop === 'tyres' || t.craft === 'mechanic' || t.amenity === 'car_repair') return 'repair';
  // Market 32 / Price Chopper supermarkets -> the unrelated "Store32" chain (own name, colours and logo)
  if (t.shop && /price\s*chopper|market\s*32/i.test((t.brand || '') + ' ' + (t.name || '') + ' ' + (t.operator || ''))) return 'store32';
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
// an open-end spanner with a ring at the other end, drawn on a sign
function drawWrench(x, cx, cy, s, ang, col, bg) {
  x.save(); x.translate(cx, cy); x.rotate(ang); x.fillStyle = col;
  const r = (a, b, w, h, rad) => { x.beginPath(); x.moveTo(a + rad, b); x.arcTo(a + w, b, a + w, b + h, rad); x.arcTo(a + w, b + h, a, b + h, rad); x.arcTo(a, b + h, a, b, rad); x.arcTo(a, b, a + w, b, rad); x.fill(); };
  r(-s * 0.13, -s * 0.62, s * 0.26, s * 1.24, s * 0.12);                                    // handle
  x.beginPath(); x.arc(0, -s * 0.72, s * 0.34, 0, Math.PI * 2); x.fill();                  // open-end head
  x.beginPath(); x.arc(0, s * 0.72, s * 0.27, 0, Math.PI * 2); x.fill();                   // ring end
  x.fillStyle = bg; x.fillRect(-s * 0.13, -s * 1.12, s * 0.26, s * 0.42);                  // the jaw opening
  x.beginPath(); x.arc(0, -s * 0.72, s * 0.13, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(0, s * 0.72, s * 0.13, 0, Math.PI * 2); x.fill();                   // the ring's hole
  x.restore();
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
  // Store32: navy and orange, a round "32" badge — nothing like the real chain's look
  const badge = (x, cx, cy, r) => { x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.fillStyle = '#14305f'; x.font = `900 ${Math.round(r * 1.15)}px Satoshi, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('32', cx, cy + r * 0.06, r * 1.6); };
  const store32 = signTexture((x, w, h) => {
    x.fillStyle = '#14305f'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff8a1f'; x.fillRect(0, h - 10, w, 10);
    badge(x, 66, h / 2 - 3, 46);
    x.fillStyle = '#fff'; x.font = '900 74px Satoshi, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('Store', 128, h / 2 - 2, 230); x.fillStyle = '#ff8a1f'; x.fillText('32', 360, h / 2 - 2, 130);
  });
  const store32Sq = signTexture((x, w, h) => {
    x.fillStyle = '#14305f'; x.fillRect(0, 0, w, h); badge(x, w / 2, h * 0.4, w * 0.27);
    x.fillStyle = '#fff'; x.font = '900 40px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STORE32', w / 2, h * 0.78, w - 20);
    x.fillStyle = '#ffd9b0'; x.font = '700 20px Satoshi, Arial'; x.fillText('FRESH · LOCAL · FAIR', w / 2, h * 0.91, w - 20);
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
  const repair = signTexture((x, w, h) => {
    const bg = '#123f8c'; x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 10; x.strokeRect(9, 9, w - 18, h - 18);
    drawWrench(x, 100, h / 2, 66, Math.PI / 4, '#ffd23f', bg); drawWrench(x, w - 100, h / 2, 66, -Math.PI / 4, '#ffd23f', bg);
    x.fillStyle = '#fff'; x.font = '900 104px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('REPAIR SHOP', w / 2, h / 2 + 6, w - 420);
  }, 1024, 256);
  const crosshair = (x, cx, cy, r, col) => { x.strokeStyle = col; x.lineWidth = r * 0.16; x.beginPath(); x.arc(cx, cy, r * 0.72, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, r * 0.22, 0, 7); x.stroke(); x.lineCap = 'round'; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.beginPath(); x.moveTo(cx + a * r * 0.45, cy + b * r * 0.45); x.lineTo(cx + a * r * 1.05, cy + b * r * 1.05); x.stroke(); } };
  const blicks = signTexture((x, w, h) => {
    x.fillStyle = '#17181b'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff5a1f'; x.fillRect(0, h - 16, w, 16);
    crosshair(x, 120, h / 2 - 6, 78, '#ff5a1f');
    x.fillStyle = '#fff'; x.font = '900 104px Satoshi, Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText("BLICK'S", 230, h / 2 - 8, 400);
    x.fillStyle = '#ff5a1f'; x.font = '800 62px Satoshi, Arial, sans-serif'; x.fillText('SHOOTING GOODS', 640, h / 2 - 4, w - 660);
  }, 1536, 256);
  const blicksSq = signTexture((x, w, h) => {
    x.fillStyle = '#17181b'; x.fillRect(0, 0, w, h); crosshair(x, w / 2, h * 0.38, w * 0.26, '#ff5a1f');
    x.fillStyle = '#fff'; x.font = '900 46px Satoshi, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText("BLICK'S", w / 2, h * 0.76, w - 20);
    x.fillStyle = '#ff5a1f'; x.font = '800 22px Satoshi, Arial'; x.fillText('SHOOTING GOODS · DRIVE IN', w / 2, h * 0.9, w - 20);
  }, 256, 256);
  MATS = {
    blicks: new THREE.MeshBasicMaterial({ map: blicks, side: THREE.DoubleSide }), blicksSq: new THREE.MeshBasicMaterial({ map: blicksSq, side: THREE.DoubleSide }),
    repair: new THREE.MeshBasicMaterial({ map: repair, side: THREE.DoubleSide }),
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.08 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    wic: new THREE.MeshBasicMaterial({ map: wic }), wicSq: new THREE.MeshBasicMaterial({ map: wicSq }),
    bq: new THREE.MeshBasicMaterial({ map: bq }), bqSq: new THREE.MeshBasicMaterial({ map: bqSq }),
    pizza: new THREE.MeshBasicMaterial({ map: pizza }), pizzaSq: new THREE.MeshBasicMaterial({ map: pizzaSq }),
    store32: new THREE.MeshBasicMaterial({ map: store32 }), store32Sq: new THREE.MeshBasicMaterial({ map: store32Sq }),
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
export const FOOD = new Set([...Object.keys(BRANDS), 'store32', 'repair', 'blicks']); // buildings that replace the mapped building (brands + repair shops)
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
// Store32 supermarket. Local frame: front faces +Z, footprint W (x) by D (z), ground at y=0. `full` false = the walls are already drawn, add only signs.
export function supermarket(acc, M, W = 56, D = 38, full = true, roofY = 8) {
  const H = 7.5, NAVY = '#14305f', ORG = '#ff8a1f', tw = Math.min(Math.max(W * 0.26, 8), 16), tx = -W / 2 + tw / 2 + Math.min(W * 0.1, 6), sw = tw - 1.4;
  if (full) {
    B(acc, 'solid', M, W, H, D, 0, H / 2, 0, '#ece7dc');                              // walls
    B(acc, 'solid', M, W + 0.1, 0.9, D + 0.1, 0, 0.45, 0, '#4a5568');                  // base
    B(acc, 'solid', M, W + 0.8, 1.0, D + 0.8, 0, H + 0.5, 0, NAVY);                     // parapet band
    B(acc, 'solid', M, W + 0.9, 0.22, D + 0.9, 0, H + 1.05, 0, ORG);                    // orange trim
    B(acc, 'solid', M, W - 0.6, 0.3, D - 0.6, 0, H + 0.95, 0, '#8d8a86');               // roof
    for (const [a, b, c] of [[0.25, 0.2, 5], [-0.05, -0.15, 4], [0.38, -0.2, 3.4]]) B(acc, 'solid', M, c, 1.5, c * 0.8, W * a, H + 1.9, D * b, '#9aa0a8'); // rooftop units
    B(acc, 'solid', M, W * 0.5, 2.6, 0.12, W * 0.18, 2.3, D / 2 + 0.04, '#1c2733');      // shop-front windows
    for (let k = -4; k <= 4; k++) B(acc, 'solid', M, 0.14, 2.7, 0.16, W * 0.18 + k * W * 0.055, 2.3, D / 2 + 0.06, '#d9d6d0');
    B(acc, 'solid', M, W * 0.58, 0.25, 2.6, W * 0.18, 4.2, D / 2 + 1.3, ORG);           // canopy over the sidewalk
    B(acc, 'solid', M, tw, H + 3.6, 3.4, tx, (H + 3.6) / 2, D / 2 + 1.7, NAVY);          // entrance tower
    B(acc, 'solid', M, tw + 0.5, 0.35, 3.8, tx, H + 3.75, D / 2 + 1.7, ORG);
    B(acc, 'solid', M, tw - 1.6, 3.4, 0.14, tx, 1.9, D / 2 + 3.45, '#1c2733');           // glass doors
    B(acc, 'solid', M, 0.14, 3.4, 0.18, tx, 1.9, D / 2 + 3.5, '#d9d6d0');
    B(acc, 'glow', M, tw - 2.2, 0.3, 0.1, tx, 3.8, D / 2 + 3.5, '#fff1c9');
    PL(acc, 'store32', M, sw, sw / 4, tx, H + 1.2, D / 2 + 3.43);                        // sign on the tower
    PL(acc, 'store32', M, Math.min(D * 0.5, 14), Math.min(D * 0.5, 14) / 4, -W / 2 - 0.45, H - 0.8, D * 0.2, -Math.PI / 2); // side signs
    PL(acc, 'store32', M, Math.min(D * 0.5, 14), Math.min(D * 0.5, 14) / 4, W / 2 + 0.45, H - 0.8, D * 0.2, Math.PI / 2);
    for (const k of [0, 1]) { const x = tx + tw / 2 + 2.2 + k * 2.4; for (let i = 0; i < 4; i++) B(acc, 'solid', M, 0.9, 0.9, 1.3, x, 0.55 + i * 0.02, D / 2 + 2.6 + i * 0.5, '#aab2bd'); } // shopping carts
  } else {
    const sh = Math.min(D * 0.6, 16) / 4; B(acc, 'solid', M, sh * 4 + 0.6, sh + 0.5, 0.5, 0, roofY + sh / 2 + 0.3, D / 2 - 0.4, NAVY); PL(acc, 'store32', M, sh * 4, sh, 0, roofY + sh / 2 + 0.3, D / 2 - 0.12);
  }
  // pylon sign at the front corner, near the road
  const px = W / 2 + 2.5, pz = D / 2 + 3.5;
  push(acc, 'solid', new THREE.CylinderGeometry(0.25, 0.3, 10, 8), '#9aa0a8', M, px, 5, pz);
  B(acc, 'solid', M, 4.4, 4.4, 0.6, px, 11.5, pz, NAVY);
  PL(acc, 'store32Sq', M, 4.0, 4.0, px, 11.5, pz + 0.31); PL(acc, 'store32Sq', M, 4.0, 4.0, px, 11.5, pz - 0.31, Math.PI);
}
// the right building for a brand kind
export function brandBuilding(acc, M, kind, W, D, full, roofY) { if (kind === 'repair') return repairShop(acc, M, W, D, full, roofY); if (kind === 'blicks') return blicksStore(acc, M, W, D); return kind === 'store32' ? supermarket(acc, M, W, D, full, roofY) : restaurant(acc, M, kind, W, D, full, roofY); }
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

// Mechanic's workshop. Local frame: front faces +Z (towards the road), footprint W (x) by D (z), ground at y=0.
// Block building with roll-up bay doors, a blue fascia, tyre stacks and a two-sided "REPAIR SHOP" billboard with wrenches on the roof.
export function repairShop(acc, M, W = 18, D = 12, full = true, roofY = 5) {
  W = Math.max(10, Math.min(60, W)); D = Math.max(8, Math.min(40, D)); const H = Math.max(5, Math.min(9, roofY || 5)), F = D / 2;
  if (full) {
    B(acc, 'solid', M, W, H, D, 0, H / 2, 0, '#d8d3c6');                               // block walls
    B(acc, 'solid', M, W + 0.3, 0.35, D + 0.3, 0, H + 0.17, 0, '#5b5f66');             // roof edge
    B(acc, 'solid', M, W - 0.6, 0.12, D - 0.6, 0, H + 0.36, 0, '#8d9096');             // roof
    B(acc, 'solid', M, W + 0.06, 0.5, D + 0.06, 0, 0.25, 0, '#9b958a');                // plinth
  }
  // roll-up bay doors along the front, office with glass door at one end
  const bays = Math.max(1, Math.min(5, Math.floor((W - 4) / 4.4))), bw = 3.3, bh = Math.min(3.6, H - 1.2), span = bays * 4.4, x0 = -W / 2 + 1.2 + (W - 4 - span) / 2;
  for (let i = 0; i < bays; i++) {
    const cx = x0 + 2.2 + i * 4.4;
    B(acc, 'solid', M, bw + 0.36, bh + 0.2, 0.16, cx, (bh + 0.2) / 2, F + 0.06, '#33363b');           // frame
    B(acc, 'solid', M, bw, bh, 0.1, cx, bh / 2, F + 0.14, i % 2 ? '#c8ccd1' : '#d4d8dc');               // door
    for (let k = 1; k < 9; k++) B(acc, 'solid', M, bw, 0.05, 0.03, cx, (bh / 9) * k, F + 0.2, '#9fa5ab'); // slats
    B(acc, 'glow', M, bw - 0.4, 0.06, 0.03, cx, bh * 0.62, F + 0.21, '#bfe3ff');                       // window strip in the door
  }
  const ox = W / 2 - 1.6;
  B(acc, 'solid', M, 1.2, 2.3, 0.1, ox, 1.15, F + 0.1, '#2e4a5f'); B(acc, 'glow', M, 1.0, 1.0, 0.03, ox, 1.6, F + 0.17, '#ffe8b0'); // office door
  // fascia band across the top of the front
  B(acc, 'solid', M, W + 0.2, 0.85, 0.3, 0, H - 0.45, F + 0.16, '#123f8c'); B(acc, 'solid', M, W + 0.2, 0.16, 0.32, 0, H - 0.95, F + 0.17, '#ffd23f');
  // rooftop billboard: two posts, a frame, the sign on both faces (lit by its own colours, so it reads at night too)
  const sw = Math.min(W - 1, 11), sh = sw / 4, sy = H + 0.5 + 1.1 + sh / 2, sz = F - 1.4;
  for (const sx of [-sw * 0.35, sw * 0.35]) B(acc, 'solid', M, 0.22, sy - H, 0.22, sx, H + (sy - H) / 2, sz - 0.12, '#3a3d42');
  B(acc, 'solid', M, sw + 0.3, sh + 0.3, 0.18, 0, sy, sz - 0.12, '#1d2026');
  PL(acc, 'repair', M, sw, sh, 0, sy, sz - 0.02); PL(acc, 'repair', M, sw, sh, 0, sy, sz - 0.22, Math.PI);
  for (const sx of [-sw / 2 + 0.6, 0, sw / 2 - 0.6]) B(acc, 'glow', M, 0.5, 0.12, 0.3, sx, sy + sh / 2 + 0.2, sz + 0.1, '#fff2c4'); // sign lamps
  // tyre stack, oil drums and a tool chest by the front corner
  for (let k = 0; k < 4; k++) push(acc, 'solid', new THREE.TorusGeometry(0.34, 0.14, 6, 12), '#1b1c1e', M, -W / 2 - 0.6, 0.14 + k * 0.29, F + 1.1, Math.PI / 2, 0, 0);
  for (let k = 0; k < 3; k++) push(acc, 'solid', new THREE.TorusGeometry(0.34, 0.14, 6, 12), '#1b1c1e', M, -W / 2 - 1.55, 0.14 + k * 0.29, F + 0.4, Math.PI / 2, 0, 0);
  for (const [dx, c] of [[0, '#c62828'], [0.7, '#1f6fb2']]) push(acc, 'solid', new THREE.CylinderGeometry(0.29, 0.29, 0.9, 10), c, M, W / 2 + 0.6 + dx, 0.45, F + 0.8);
  B(acc, 'solid', M, 0.9, 1.0, 0.5, W / 2 - 3.6, 0.5, F + 0.6, '#b3261e');
}

// Blick's Shooting Goods: a big-box store you can drive into. Local frame: front faces +Z, ground at y=0.
// Returns its layout (size, door, wall and rack rectangles) so the world can give it matching colliders.
export const BLICKS_DOOR = 10;
export function blicksLayout(W, D) {
  W = Math.max(34, Math.min(70, W)); D = Math.max(28, Math.min(55, D));
  const T = 0.5, dw = BLICKS_DOOR, walls = [[0, -D / 2 + T / 2, W, T], [-W / 2 + T / 2, 0, T, D], [W / 2 - T / 2, 0, T, D], [-(W / 2 + dw / 2) / 2, D / 2 - T / 2, W / 2 - dw / 2, T], [(W / 2 + dw / 2) / 2, D / 2 - T / 2, W / 2 - dw / 2, T]];
  const racks = []; for (const sd of [-1, 1]) for (let x = 9; x < W / 2 - 3; x += 6) racks.push([sd * x, -2, 1.2, D - 16]);
  const counter = [0, -D / 2 + 4.5, 9, 1.4];
  return { W, D, H: 9, walls, racks, counter, shop: [0, 0, BLICKS_DOOR - 1, D - 10] }; // shop = the drive lane where the menu opens
}
export function blicksStore(acc, M, W0 = 50, D0 = 40) {
  const L = blicksLayout(W0, D0), { W, D, H } = L, F = D / 2, dw = BLICKS_DOOR, dh = 5.6;
  const wall = '#3a3c40', trim = '#ff5a1f';
  for (const [x, z, w, d] of L.walls) B(acc, 'solid', M, w, H, d, x, H / 2, z, wall);
  B(acc, 'solid', M, dw, H - dh, 0.5, 0, dh + (H - dh) / 2, F - 0.25, wall);           // over the door
  B(acc, 'solid', M, W + 0.4, 0.45, D + 0.4, 0, H + 0.22, 0, '#26272b');                // roof
  B(acc, 'solid', M, W - 1, 0.1, D - 1, 0, 0.05, 0, '#b8b3a7');                          // polished concrete floor
  for (let x = -dw / 2 + 0.6; x < dw / 2; x += 2.2) B(acc, 'solid', M, 0.25, 0.02, D - 4, x + 0.5, 0.11, 0, '#d8d2c2');   // lane markings
  // orange entrance portal + storefront glass either side of the door
  B(acc, 'solid', M, dw + 1.2, 0.7, 0.8, 0, dh + 0.35, F + 0.15, trim); for (const sx of [-1, 1]) B(acc, 'solid', M, 0.6, dh, 0.8, sx * (dw / 2 + 0.3), dh / 2, F + 0.15, trim);
  for (const sx of [-1, 1]) for (let x = dw / 2 + 2.5; x < W / 2 - 2; x += 4.2) B(acc, 'glow', M, 3.6, 3.2, 0.06, sx * x, 2.1, F + 0.03, '#2a3a48');
  // the big sign over the entrance (front) + a pylon by the road
  const sw = Math.min(W * 0.62, 30), sh = sw / 6; PL(acc, 'blicks', M, sw, sh, 0, H - sh / 2 - 0.3, F + 0.06);
  B(acc, 'solid', M, 0.5, 7, 0.5, W / 2 + 3, 3.5, F + 4, '#26272b'); PL(acc, 'blicksSq', M, 3.4, 3.4, W / 2 + 3, 7.4, F + 4.27); PL(acc, 'blicksSq', M, 3.4, 3.4, W / 2 + 3, 7.4, F + 3.73, Math.PI);
  // inside: ceiling light panels, racks of gear, wall displays, the counter at the back
  for (let x = -W / 2 + 5; x < W / 2 - 3; x += 7) for (let z = -F + 5; z < F - 3; z += 7) B(acc, 'glow', M, 3, 0.08, 1.2, x, H - 0.3, z, '#fff4dc');
  for (const [x, z, w, d] of L.racks) {
    B(acc, 'solid', M, w, 2.4, d, x, 1.2, z, '#5a5d62');
    for (let y = 0.6; y < 2.4; y += 0.6) B(acc, 'solid', M, w + 0.1, 0.06, d, x, y, z, '#8e9196');
    for (let k = -d / 2 + 1; k < d / 2 - 1; k += 1.6) B(acc, 'solid', M, w + 0.12, 0.3, 0.9, x, 1.0 + ((k * 7) % 3) * 0.55, z + k, ['#4a5240', '#2b2f35', '#ff5a1f', '#7a6a50'][Math.abs(Math.round(k)) % 4]);
  }
  for (let z = -F + 6; z < F - 4; z += 3.2) for (const sx of [-1, 1]) { B(acc, 'solid', M, 0.1, 2.2, 2.6, sx * (W / 2 - 0.6), 3.2, z, '#24262a'); B(acc, 'solid', M, 0.14, 0.2, 2.1, sx * (W / 2 - 0.66), 3.4, z, '#9aa3ab'); B(acc, 'solid', M, 0.14, 0.32, 0.5, sx * (W / 2 - 0.66), 3.2, z - 0.5, '#2b2f35'); }
  const [cx, cz, cw, cd] = L.counter; B(acc, 'solid', M, cw, 1.1, cd, cx, 0.55, cz, '#2b2d31'); B(acc, 'solid', M, cw + 0.2, 0.08, cd + 0.2, cx, 1.14, cz, trim);
  PL(acc, 'blicks', M, 9, 1.5, 0, 4.2, -F + 0.3);
}
