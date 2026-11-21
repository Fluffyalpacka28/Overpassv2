import * as THREE from 'three';

// The "Realistic" driver head: a sculpted head mesh (a dense sphere pushed and pulled into a skull, jaw, brow, nose, cheekbones,
// lips and chin), a painted skin texture (lips, eyebrows, blush, freckles, stubble, age lines), and proper eyes: eyeballs with
// a coloured iris and pupil, upper and lower lids with a lash line. Every feature follows the face sliders (like a character
// creator). Coordinates: the head group's space (origin a little above the eyes' centre plane, +z forward), metres.

// [group, key, label]; every slider is -1..1 (0 = average), except the complexion ones which are 0..1
export const FACE_SLIDERS = [
  ['Head', 'headW', 'Head width'], ['Head', 'headH', 'Head height'], ['Head', 'foreH', 'Forehead slope'],
  ['Eyes', 'eyeSize', 'Eye size'], ['Eyes', 'eyeSp', 'Eye spacing'], ['Eyes', 'eyeH', 'Eye height'], ['Eyes', 'eyeTilt', 'Eye tilt'], ['Eyes', 'eyeDepth', 'Eye depth'], ['Eyes', 'lids', 'Eyelids open'],
  ['Brows', 'browH', 'Brow height'], ['Brows', 'browAng', 'Brow angle'], ['Brows', 'browThk', 'Brow thickness'], ['Brows', 'browRidge', 'Brow ridge'],
  ['Nose', 'noseLen', 'Nose length'], ['Nose', 'noseW', 'Nose width'], ['Nose', 'nosePro', 'Nose size'], ['Nose', 'noseBridge', 'Bridge height'], ['Nose', 'noseTip', 'Tip'],
  ['Cheeks', 'cheekPro', 'Cheekbones'], ['Cheeks', 'cheekH', 'Cheekbone height'], ['Cheeks', 'cheekFull', 'Cheek fullness'],
  ['Mouth', 'mouthW', 'Mouth width'], ['Mouth', 'mouthH', 'Mouth height'], ['Mouth', 'lips', 'Lip fullness'], ['Mouth', 'smile', 'Smile'],
  ['Jaw', 'jawW', 'Jaw width'], ['Jaw', 'jawLine', 'Jaw squareness'], ['Jaw', 'chinLen', 'Chin length'], ['Jaw', 'chinPro', 'Chin forward'], ['Jaw', 'chinW', 'Chin width'],
  ['Ears', 'earSize', 'Ear size'], ['Ears', 'earOut', 'Ears stick out'],
  ['Complexion', 'age', 'Age lines'], ['Complexion', 'freck', 'Freckles'], ['Complexion', 'blush', 'Blush'],
];
export const FACE_GROUPS = [...new Set(FACE_SLIDERS.map(s => s[0]))];
export const ZERO_ONE = new Set(['age', 'freck', 'blush']);
export const EYE_COLORS = [['brown', '#5b3a1f'], ['dark', '#2a1a10'], ['hazel', '#7d6a2c'], ['green', '#4c7a3a'], ['blue', '#3f78b5'], ['grey', '#7d8992'], ['amber', '#b07a1e'], ['violet', '#6a4f9a']];
export const LIP_TINTS = [['natural', null], ['rose', '#c0505e'], ['red', '#b0202e'], ['berry', '#7a2040'], ['nude', '#c88a78']];

const cl = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanFace(f) {
  f = f && typeof f === 'object' ? f : {}; const o = {};
  for (const [, k] of FACE_SLIDERS) { const v = ZERO_ONE.has(k) ? cl(f[k], 0, 1, null) : cl(f[k], -1, 1, null); if (v !== null && (v !== 0 || k === 'blush')) o[k] = Math.round(v * 100) / 100; }
  if (EYE_COLORS.some(e => e[0] === f.eye)) o.eye = f.eye;
  if (LIP_TINTS.some(e => e[0] === f.lip) && f.lip !== 'natural') o.lip = f.lip;
  return o;
}
export function randomFace(F) {
  const o = {}, r = () => Math.round((Math.random() * 2 - 1) * 0.7 * 100) / 100;
  for (const [, k] of FACE_SLIDERS) if (!ZERO_ONE.has(k)) o[k] = r();
  o.age = Math.round(Math.random() * Math.random() * 100) / 100; o.freck = Math.random() < 0.25 ? Math.round(Math.random() * 70) / 100 : 0; o.blush = Math.round(Math.random() * 50) / 100;
  o.eye = EYE_COLORS[Math.floor(Math.random() * 6)][0]; if (F && Math.random() < 0.5) o.lip = LIP_TINTS[1 + Math.floor(Math.random() * 4)][0];
  return cleanFace(o);
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = (dx, dy, sx, sy) => Math.exp(-(dx * dx / (sx * sx) + dy * dy / (sy * sy)));

// all the numbers a face is built from
export function faceParams(look) {
  const f = look.face || {}, v = k => cl(f[k], -1, 1, 0), F = look.b === 'f', P = { F };
  P.hw = 1 + 0.07 * v('headW') - (F ? 0.035 : 0); P.hh = 1 + 0.05 * v('headH') - (F ? 0.025 : 0);
  P.Rx = 0.079 * P.hw; P.Ry = 0.118 * P.hh; P.Rz = 0.101; P.fore = v('foreH');
  P.ey = -0.002 + 0.006 * v('eyeH'); P.ex = 0.0315 + 0.0035 * v('eyeSp'); P.es = 1 + 0.12 * v('eyeSize') + (F ? 0.04 : 0); P.etilt = 0.16 * v('eyeTilt') + (F ? 0.05 : 0); P.edep = v('eyeDepth'); P.lids = v('lids');
  P.by = P.ey + 0.021 + 0.005 * v('browH') + (F ? 0.002 : 0); P.bang = v('browAng'); P.bthk = (F ? 0.0028 : 0.0046) * (1 + 0.5 * v('browThk')); P.bridge = (F ? 0.0028 : 0.006) * (1 + 0.8 * v('browRidge'));
  P.ny = P.ey - (0.047 + 0.008 * v('noseLen')); P.nw = 1 + 0.3 * v('noseW') - (F ? 0.1 : 0); P.np = (1 + 0.4 * v('nosePro')) * (F ? 0.88 : 1); P.nb = v('noseBridge'); P.nt = v('noseTip');
  P.cb = 1 + 0.8 * v('cheekPro') + (F ? 0.15 : 0); P.cy = P.ey - 0.024 + 0.007 * v('cheekH'); P.cf = v('cheekFull');
  P.my = P.ny - 0.0235 + 0.004 * v('mouthH'); P.mw = 1 + 0.2 * v('mouthW') - (F ? 0.04 : 0); P.lf = (1 + 0.55 * v('lips')) * (F ? 1.3 : 1); P.smile = v('smile');
  P.chy = P.my - 0.031 - 0.006 * v('chinLen'); P.chp = 1 + 0.7 * v('chinPro'); P.chw = 1 + 0.35 * v('chinW') - (F ? 0.1 : 0);
  P.jw = v('jawW') - (F ? 0.5 : 0); P.jl = v('jawLine') - (F ? 0.4 : 0);
  P.ear = 1 + 0.22 * v('earSize') - (F ? 0.06 : 0); P.earOut = v('earOut');
  P.age = cl(f.age, 0, 1, 0); P.freck = cl(f.freck, 0, 1, 0); P.blush = cl(f.blush, 0, 1, F ? 0.35 : 0.08);
  P.eye = (EYE_COLORS.find(e => e[0] === f.eye) || EYE_COLORS[0])[1]; P.lip = (LIP_TINTS.find(e => e[0] === f.lip) || LIP_TINTS[0])[1];
  return P;
}

// a unit direction on the base sphere -> the head's broad shape (skull, back of the head, narrowing jaw and chin), before the features
function shape(dx, dy, dz, P, o) {
  let x = dx * P.Rx, y = dy * P.Ry, z = dz * P.Rz;
  if (dz < 0) z *= 1.07 + 0.03 * smooth(-0.2, 0.6, dy);                 // the back of the skull
  if (dy > 0.3) z -= smooth(0.3, 0.95, dy) * smooth(0, 0.7, dz) * 0.008 * (1 + P.fore); // forehead slopes back toward the crown
  const tj = smooth(-0.005, -0.1, y), tc = smooth(-0.065, -0.113, y);
  x *= 1 - tj * (0.15 - 0.07 * P.jw) - tc * (0.15 - 0.07 * P.jl) * (1.2 - 0.25 * P.chw);
  const front = smooth(0.25, 0.75, dz);
  z += front * 0.007 * Math.exp(-((x / 0.05) ** 2));                           // a face is flatter across than an egg
  z += smooth(0, 0.55, dz) * 0.006 * G(x, y + 0.068, 0.034, 0.03);           // mouth and teeth push the lower face forward
  z -= smooth(-0.04, -0.113, y) * smooth(0.2, -0.4, dz) * 0.02;              // under the jaw tucks in toward the neck
  o.x = x; o.y = y; o.z = z; o.front = front; return o;
}
// the features, as a push out (+) or in (-) along the surface, for a point on the broad shape
function relief(x, y, P) {
  const ax = Math.abs(x); let d = 0;
  d -= 0.0085 * (1 + 0.35 * P.edep) * G(ax - P.ex, y - P.ey, 0.016 * P.es, 0.0115 * P.es);           // eye sockets
  d += P.bridge * G(ax - 0.03, y - (P.ey + 0.016), 0.027, 0.009);                                      // brow ridge
  d -= 0.003 * G(ax - 0.062, y - (P.ey + 0.022), 0.012, 0.018);                                        // temples
  const t = (P.ey - y) / (P.ey - P.ny);                                                                 // nose: bridge (0) to tip (1)
  if (t > -0.4 && t < 1.5) {
    const tc = Math.max(0, Math.min(1, t));
    let h = (0.0045 + 0.0035 * P.nb * (1 - tc) + 0.0155 * Math.pow(tc, 1.35)) * P.np;
    if (t < 0) h *= Math.exp(-((t / 0.14) ** 2)); if (t > 1) h *= Math.exp(-(((t - 1) / 0.1) ** 2));
    d += h * Math.exp(-((x / ((0.005 + 0.0065 * tc) * P.nw)) ** 2));
  }
  d += 0.0035 * (1 + 0.45 * P.nt) * P.np * G(x, y - (P.ny + 0.0035 + 0.0025 * P.nt), 0.0085 * P.nw, 0.0065);  // the tip
  d += 0.0045 * P.nw * G(ax - 0.0118 * P.nw, y - (P.ny + 0.0025), 0.0058, 0.0058);                    // nostril wings
  d -= 0.0022 * G(ax - 0.0068 * P.nw, y - (P.ny - 0.004), 0.0032, 0.0022);                            // nostrils
  d += 0.0055 * P.cb * G(ax - 0.046, y - P.cy, 0.018, 0.013);                                          // cheekbones
  d += 0.0032 * P.cf * G(ax - 0.04, y - (P.cy - 0.022), 0.02, 0.018);                                  // cheeks
  const sm = P.smile * 0.004 * smooth(0.004, 0.014 * P.mw, ax);                                        // smile lifts the corners
  d += 0.0042 * P.lf * G(x, y - (P.my + 0.0045 + sm * 0.4), 0.0125 * P.mw, 0.004);                    // upper lip
  d += 0.0048 * P.lf * G(x, y - (P.my - 0.005 + sm * 0.3), 0.0115 * P.mw, 0.0046);                    // lower lip
  d -= 0.002 * G(ax - 0.0135 * P.mw, y - (P.my + sm), 0.003, 0.003);                                   // mouth corners
  d -= 0.0018 * G(x, y - (P.my - 0.0135), 0.012, 0.003);                                               // the dip under the lip
  d -= 0.0012 * G(x, y - (P.my + 0.012), 0.0035, 0.005);                                               // philtrum
  d += 0.0055 * P.chp * G(x, y - (P.chy + 0.009), 0.013 * P.chw, 0.011);                               // chin
  d += 0.0022 * (1 + P.jl) * G(ax - 0.05 * (1 + 0.1 * P.jw), y - (P.chy + 0.012), 0.012, 0.012);      // jaw corners
  return d;
}
const _s = {};
// deformed head surface point for a unit sphere direction
function surf(dx, dy, dz, P, out) {
  shape(dx, dy, dz, P, _s);
  let nx = _s.x / (P.Rx * P.Rx), ny = _s.y / (P.Ry * P.Ry), nz = _s.z / (P.Rz * P.Rz); const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  const r = _s.front > 0 ? relief(_s.x, _s.y, P) * _s.front : 0;
  out.x = _s.x + nx * r; out.y = _s.y + ny * r; out.z = _s.z + nz * r; return out;
}
// how far forward the face is at (x, y): used to sit the eyes in their sockets
function frontZ(x, y, P) { const dy = y / P.Ry, dx = x / P.Rx, dz = Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy)); const o = {}; surf(dx, dy, dz, P, o); return o.z; }

// ---- the painted skin ----
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1), ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; }
function skinTexture(P, skinHex, hairHex, look, fast) {
  const W = fast ? 256 : 512, H = fast ? 128 : 256, q = fast ? 0.5 : 1, c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
  // colours worked in plain sRGB numbers (straight onto the canvas), not three's linear space
  const S = h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);
  const sk = S(skinHex), hr = S(hairHex), lipBase = P.lip ? S(P.lip) : sk.clone().lerp(S(P.F ? '#b54a55' : '#a0574e'), P.F ? 0.5 : 0.38);
  const dark = sk.clone().multiplyScalar(0.55), pink = S('#d0606a'), tmp = new THREE.Color(), lum = sk.r * 0.3 + sk.g * 0.5 + sk.b * 0.2;
  const stub = look.beard === 'stubble' ? 1 : look.beard === 'none' && !P.F ? 0.18 : 0, beardOn = look.beard === 'beard';
  for (let j = 0; j < H; j++) {
    const th = Math.PI * (j + 0.5) / H, st = Math.sin(th), dy = Math.cos(th);
    for (let i = 0; i < W; i++) {
      const ph = 2 * Math.PI * (i + 0.5) / W, dx = -Math.cos(ph) * st, dz = Math.sin(ph) * st, k = (j * W + i) * 4;
      let r = sk.r, g = sk.g, b = sk.b;
      const I = i / q, J = j / q, n = vnoise(I * 0.35, J * 0.35) * 0.6 + vnoise(I * 1.3, J * 1.3) * 0.4; r *= 0.97 + n * 0.06; g *= 0.97 + n * 0.05; b *= 0.97 + n * 0.05;
      if (dz > 0.05) {
        shape(dx, dy, dz, P, _s); const x = _s.x, y = _s.y, ax = Math.abs(x), fw = smooth(0.05, 0.4, dz);
        const mix = (cc, a) => { a *= fw; r += (cc.r - r) * a; g += (cc.g - g) * a; b += (cc.b - b) * a; };
        // warmth: cheeks, nose, ears and lips are a little redder; the eye sockets a touch darker
        mix(pink, 0.06 * G(x, y - P.ny, 0.01, 0.012) + (0.05 + 0.2 * P.blush) * G(ax - 0.044, y - (P.cy - 0.012), 0.02, 0.016));
        mix(dark, 0.1 * G(ax - P.ex, y - P.ey, 0.017 * P.es, 0.012 * P.es) * (0.6 + P.age * 0.8));
        // lips (crisp edge) and the line between them
        const sm = P.smile * 0.004 * smooth(0.004, 0.014 * P.mw, ax);
        const lu = G(x, y - (P.my + 0.0042 + sm * 0.4), 0.0118 * P.mw, 0.0034), ll = G(x, y - (P.my - 0.0048 + sm * 0.3), 0.011 * P.mw, 0.0042);
        mix(lipBase, smooth(0.28, 0.55, Math.max(lu, ll)) * 0.92);
        mix(dark.clone().multiplyScalar(0.55), 0.85 * G(x, y - (P.my + sm * 0.8), 0.0112 * P.mw, 0.00095));
        // stubble / shadow of a beard
        if (stub || beardOn) { const area = smooth(P.my + 0.016, P.my + 0.006, y) * smooth(0.09, 0.03, ax) * (1 - smooth(0.25, 0.55, Math.max(lu, ll))) + smooth(P.my + 0.004, P.my + 0.013, y) * smooth(P.my + 0.016, P.my + 0.012, y) * smooth(0.02, 0.008, ax); const sp = hash(I * 1.7, J * 2.3) > 0.45 ? 1 : 0.4; const full = beardOn ? Math.min(1, area + smooth(P.cy - 0.012, P.cy - 0.03, y) * smooth(0.075, 0.06, ax) * 0.9) : area; mix(hr, Math.min(1, full) * (beardOn ? 0.92 : stub * 0.45) * (beardOn ? 0.85 + 0.15 * sp : sp)); }
        // eyebrows: tapered arcs of hair strokes
        const u = (ax - (P.ex - 0.017)) / 0.041;
        if (u > -0.15 && u < 1.15) {
          const yb = P.by + 0.0042 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * (P.F ? 1.3 : 0.8) + P.bang * 0.006 * (u - 0.5), thk = P.bthk * (1 - 0.55 * Math.max(0, u));
          const m = smooth(thk, thk * 0.35, Math.abs(y - yb)) * smooth(-0.15, 0.05, u) * smooth(1.15, 0.92, u), strand = 0.7 + 0.3 * vnoise(I * 2.2, J * 0.6);
          mix(hr.clone().multiplyScalar(0.85), m * 0.9 * strand);
        }
        // freckles over the nose and cheeks
        if (P.freck > 0) { const area = G(x, y - (P.ny + 0.012), 0.055, 0.022); if (hash(Math.floor(I) * 3.1, Math.floor(J) * 4.7) > 1 - 0.18 * area * P.freck) mix(tmp.setRGB(0.6, 0.38, 0.24).lerp(sk, 0.35), 0.55); }
        // age: forehead lines, crow's feet, smile lines, bags under the eyes
        const A = 0.06 + P.age;
        if (A > 0) {
          const fy = y - (P.by + 0.012);
          if (fy > 0 && fy < 0.035 && ax < 0.05) mix(dark, P.age * 0.28 * Math.pow(Math.abs(Math.sin(fy * 520 + Math.sin(x * 60) * 0.6)), 14) * smooth(0.05, 0.03, ax));
          const cx = ax - (P.ex + 0.024), cy = y - P.ey; if (cx > 0 && cx < 0.014 && Math.abs(cy) < 0.01) mix(dark, P.age * 0.3 * Math.pow(Math.abs(Math.sin(Math.atan2(cy, cx) * 9)), 10));
          const tt = (P.ny + 0.004 - y) / (P.ny + 0.004 - (P.my - 0.006)); if (tt > 0 && tt < 1) { const lx = 0.014 * P.nw + tt * 0.01 * P.mw; mix(dark, A * 0.32 * G(ax - lx, 0, 0.0016 + 0.001 * P.age, 1)); }
          mix(dark, P.age * 0.18 * G(ax - P.ex, y - (P.ey - 0.014), 0.012, 0.003));
        }
      } else if (dz > -0.2) { /* sides: plain */ }
      // a hint of the ears' and neck's warmth at the sides
      px[k] = Math.min(255, r * 255); px[k + 1] = Math.min(255, g * 255); px[k + 2] = Math.min(255, b * 255); px[k + 3] = 255;
    }
  }
  void lum;
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// eyes: a texture with the iris and pupil painted round the sphere's pole (the pole then faces forward)
const irisCache = new Map();
function irisTexture(hex) {
  let t = irisCache.get(hex); if (t) return t;
  const W = 128, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const iris = new THREE.Color(hex), irisRows = H * 0.17, pupilRows = H * 0.065;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i += 1) {
    let col;
    if (j < pupilRows) col = '#050506';
    else if (j < irisRows) {
      const t2 = (j - pupilRows) / (irisRows - pupilRows), streak = 0.75 + 0.5 * hash(i * 0.9, 3.1) * (0.5 + 0.5 * Math.sin(i * 1.7)), ring = t2 > 0.86 ? 0.45 : 1, inner = 0.75 + 0.35 * Math.sin(t2 * Math.PI);
      const cc = iris.clone().multiplyScalar(streak * ring * inner); col = '#' + cc.getHexString();
    } else { const back = (j - irisRows) / (H - irisRows), cc = new THREE.Color('#f3efe8').lerp(new THREE.Color('#e4c4bc'), Math.min(1, back * 1.4)); if (hash(i, j) > 0.985 && back > 0.2) cc.lerp(new THREE.Color('#c25050'), 0.5); col = '#' + cc.getHexString(); }
    x.fillStyle = col; x.fillRect(i, j, 1, 1);
  }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; irisCache.set(hex, t); return t;
}

const geoCache = new Map(), texCache = new Map();
// builds the realistic head into `head` (a Group); returns what the hair needs to fit it
export function buildRealHead(head, look, skinHex, hairHex, skinMat, fast = false) {
  const P = faceParams(look), key = JSON.stringify([look.b, look.face || {}, fast]);
  const own = [], O = x => { x.userData.own = true; own.push(x); return x; };
  let geo = fast ? null : geoCache.get(key);
  if (!geo) {
    geo = fast ? new THREE.SphereGeometry(1, 80, 60) : new THREE.SphereGeometry(1, 128, 96); const pos = geo.attributes.position, o = {};
    for (let i = 0; i < pos.count; i++) { surf(pos.getX(i), pos.getY(i), pos.getZ(i), P, o); pos.setXYZ(i, o.x, o.y, o.z); }
    geo.computeVertexNormals(); if (fast) O(geo); else { if (geoCache.size > 24) geoCache.clear(); geoCache.set(key, geo); }
  }
  const tkey = key + skinHex + hairHex + look.beard; let tex = fast ? null : texCache.get(tkey);
  if (!tex) { tex = skinTexture(P, skinHex, hairHex, look, fast); if (fast) O(tex); else { if (texCache.size > 12) { for (const t of texCache.values()) t.dispose(); texCache.clear(); } texCache.set(tkey, tex); } }
  const C = 0.02, mat = O(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.58, metalness: 0 }));
  const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; head.add(o); return o; };
  add(geo, mat, 0, C, 0);
  // eyes
  const er = 0.0118 * P.es, eyeM = O(new THREE.MeshStandardMaterial({ map: irisTexture(P.eye), roughness: 0.12, metalness: 0 }));
  const lidM = O(new THREE.MeshStandardMaterial({ color: new THREE.Color(skinHex).multiplyScalar(0.92), roughness: 0.6 })), lashM = O(new THREE.MeshStandardMaterial({ color: new THREE.Color(hairHex).multiplyScalar(0.4), roughness: 0.8 }));
  const eyeG = O(new THREE.SphereGeometry(er, 24, 16).rotateX(Math.PI / 2));
  const open = -0.09 - 0.14 * P.lids; // tilt of the upper lid: its front edge sits a little above the pupil
  const upper = O(new THREE.SphereGeometry(er * 1.07, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), lash = O(new THREE.SphereGeometry(er * 1.09, 22, 2, 0, Math.PI * 2, Math.PI * 0.405, Math.PI * 0.03)), lower = O(new THREE.SphereGeometry(er * 1.05, 22, 8, 0, Math.PI * 2, Math.PI * 0.7, Math.PI * 0.3));
  for (const s of [-1, 1]) {
    const ex = s * P.ex, ey = P.ey, ez = frontZ(P.ex, ey, P) - 0.0032 * (1 + 0.35 * P.edep);
    const eg = new THREE.Group(); eg.position.set(ex, C + ey, ez); eg.rotation.z = s * P.etilt * 0.6; head.add(eg);
    const ball = new THREE.Mesh(eyeG, eyeM); ball.rotation.y = -s * 0.04; eg.add(ball);
    const ul = new THREE.Mesh(upper, lidM); ul.rotation.x = open; eg.add(ul);
    const la = new THREE.Mesh(lash, lashM); la.rotation.x = open; eg.add(la);
    const ll = new THREE.Mesh(lower, lidM); ll.rotation.x = -0.32; eg.add(ll);
  }
  // ears: an outer rim and a darker hollow
  const earG = O(new THREE.SphereGeometry(0.03, 16, 12)), conG = O(new THREE.SphereGeometry(0.018, 12, 10)), conM = O(new THREE.MeshStandardMaterial({ color: new THREE.Color(skinHex).multiplyScalar(0.78), roughness: 0.7 }));
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * (P.Rx * 0.96), C + P.ey - 0.012, -0.012); eg.rotation.set(-0.12, s * (0.2 + 0.3 * P.earOut), 0); eg.scale.setScalar(P.ear); head.add(eg);
    const o = new THREE.Mesh(earG, skinMat); o.scale.set(0.26, 1.05, 0.6); o.castShadow = true; eg.add(o);
    const cn = new THREE.Mesh(conG, conM); cn.position.set(s * 0.004, -0.004, 0.002); cn.scale.set(0.2, 0.7, 0.55); eg.add(cn);
  }
  return { own, fast, P, C, scale: [P.Rx / 0.09 * 1.05, P.Ry / 0.11 * 1.02, P.Rz / 0.1 * 1.09], mouthZ: frontZ(0, P.my + 0.009, P), mouthY: C + P.my + 0.009 };
}

// ================= realistic hair =================
// Hair grown from the realistic head itself: shells that follow the scalp at the right thickness for each style, with a ragged
// natural hairline (and holes for the ears on short styles), an inner layer of solid colour and an outer layer of separate strands
// (alpha-tested) for a soft, fuzzy edge. Long hair, ponytails and buns add hanging or wrapped pieces in the same strand texture.
const hairTexCache = new Map();
function strandTextures(hex, kind) {
  const key = hex + kind; let t = hairTexCache.get(key); if (t) return t;
  const W = 256, H = 256, base = new THREE.Color().setHex(parseInt(hex.slice(1), 16), THREE.LinearSRGBColorSpace);
  const cc = document.createElement('canvas'), ca = document.createElement('canvas'); cc.width = ca.width = W; cc.height = ca.height = H;
  const xc = cc.getContext('2d'), xa = ca.getContext('2d'), ic = xc.createImageData(W, H), ia = xa.createImageData(W, H);
  const lum = base.r * 0.3 + base.g * 0.5 + base.b * 0.2, hi = lum < 0.25 ? 0.22 : 0.35;
  for (let i = 0; i < W; i++) {
    const colV = 0.72 + 0.5 * hash(i * 1.37, 7.1) * 0.6 + 0.2 * vnoise(i * 0.08, 1.3), on = hash(i * 2.11, 3.7), cut = 0.55 + 0.45 * hash(i * 0.73, 9.2);
    for (let j = 0; j < H; j++) {
      const v = j / H, k = (j * W + i) * 4;
      let s = colV * (0.85 + 0.3 * vnoise(i * 0.5, j * 0.03));
      if (kind === 'curl') s = 0.7 + 0.55 * Math.abs(Math.sin(vnoise(i * 0.09, j * 0.09) * 9 + i * 0.05)) * (0.7 + 0.3 * hash(i, j));
      if (kind === 'buzz') s = 0.75 + 0.4 * hash(i * 3.3, j * 2.9);
      const shine = 1 + hi * Math.exp(-(((v - 0.3) / 0.06) ** 2)) * (0.6 + 0.4 * vnoise(i * 0.2, 2));
      ic.data[k] = Math.min(255, base.r * s * shine * 255); ic.data[k + 1] = Math.min(255, base.g * s * shine * 255); ic.data[k + 2] = Math.min(255, base.b * s * shine * 255); ic.data[k + 3] = 255;
      // strand coverage for the outer layer: most columns are hair, some gaps, strands end at different lengths
      let a = kind === 'curl' ? (vnoise(i * 0.12, j * 0.12) > 0.3 ? 255 : 0) : kind === 'buzz' ? (hash(i * 5.1, j * 4.3) > 0.18 ? 255 : 0) : (on > 0.38 && v < cut + 0.45 ? 255 : 0);
      ia.data[k] = ia.data[k + 1] = ia.data[k + 2] = a; ia.data[k + 3] = 255;
    }
  }
  xc.putImageData(ic, 0, 0); xa.putImageData(ia, 0, 0);
  const map = new THREE.CanvasTexture(cc), alpha = new THREE.CanvasTexture(ca); map.colorSpace = THREE.SRGBColorSpace;
  for (const x of [map, alpha]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 4; }
  t = { map, alpha }; if (hairTexCache.size > 24) hairTexCache.clear(); hairTexCache.set(key, t); return t;
}
// where the hair grows, as a soft 0..1 for a point on the head (shape space); `b` = this style's rules
function growth(x, y, z, P, b, jit) {
  const f = z / P.Rz, ax = Math.abs(x);
  let H = -0.075 + (0.065) * smooth(-0.35, 0.15, f);                                   // nape (back) up to the sideburns (front of the ears)
  const front = (b.bangs != null ? b.bangs : 0.062 - 9 * x * x);                       // forehead hairline (or a fringe for bangs)
  H += (front - H) * smooth(0.3, 0.62, f);
  let a = smooth(0, 0.005, y - (H + jit * 0.005));
  if (b.down != null && f < 0.55) a = Math.max(a, smooth(b.down - 0.003, b.down + 0.003, y + jit * 0.006) * smooth(0.62, 0.5, f)); // bob / long: covers the ears and nape
  if (b.ears) { const de = Math.hypot(ax - P.Rx * 0.97, y - (P.ey - 0.012), z + 0.012); a *= smooth(0.022, 0.03, de); }
  if (b.down != null) a *= smooth(b.down - 0.004, b.down + 0.002, y + jit * 0.006);
  return a;
}
const STYLES = {
  buzz: { t: () => 0.0016, ears: true, tex: 'buzz', layers: [1] },
  short: { t: (y, f) => 0.004 + 0.009 * smooth(-0.04, 0.07, y) + 0.003 * smooth(0.4, 0.8, f) * smooth(0.02, 0.07, y), ears: true, layers: [0.55, 1] },
  curly: { t: (y) => 0.009 + 0.014 * smooth(-0.05, 0.06, y), ears: true, tex: 'curl', layers: [0.7, 0.92], bump: 0.005 },
  pony: { t: () => 0.0042, ears: true, layers: [0.6, 1] },
  bun: { t: () => 0.0042, ears: true, layers: [0.6, 1] },
  bob: { t: (y) => 0.009 + 0.009 * smooth(0.02, -0.07, y), down: -0.072, layers: [0.55, 1] },
  long: { t: (y) => 0.008 + 0.006 * smooth(0.0, -0.06, y), down: -0.062, layers: [0.55, 1] },
};
export function buildRealHair(head, look, real, hairHex, hatOn) {
  const P = real.P, C = real.C, style = STYLES[look.hair]; if (!style) return;
  const own = real.own, O = x => { x.userData.own = true; own.push(x); return x; };
  const b = { ...style, bangs: look.hair === 'bob' ? P.by + 0.01 : null };
  const tex = strandTextures(hairHex, style.tex || 'straight');
  const mats = [];
  const mkMat = (outer, side) => O(new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: outer ? tex.alpha : null, vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.55, metalness: 0, side: side || THREE.FrontSide }));
  // ---- the shells ----
  const src = real.fast ? new THREE.SphereGeometry(1, 80, 60) : new THREE.SphereGeometry(1, 144, 108), sp = src.attributes.position, n = sp.count, o = {}, base = new Float32Array(n * 3), nrm = new Float32Array(n * 3), grow = new Float32Array(n), thick = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dx = sp.getX(i), dy = sp.getY(i), dz = sp.getZ(i); surf(dx, dy, dz, P, o);
    let nx = o.x / (P.Rx * P.Rx), ny = o.y / (P.Ry * P.Ry), nz = o.z / (P.Rz * P.Rz); const l = Math.hypot(nx, ny, nz) || 1;
    base[i * 3] = o.x; base[i * 3 + 1] = o.y; base[i * 3 + 2] = o.z; nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
    const ang = Math.atan2(o.x, -o.z), jit = (vnoise(ang * 14 + 3, 1.7) * 0.7 + vnoise(ang * 47, o.y * 90) * 0.3) * 2 - 1;
    grow[i] = growth(o.x, o.y, o.z, P, b, jit);
    let t = style.t(o.y, o.z / P.Rz); if (style.bump) t += style.bump * (vnoise(dx * 14 + 5, dy * 14 + dz * 9) - 0.3);
    if (hatOn && o.y > -0.01) t = Math.min(t, 0.0035);
    thick[i] = t;
  }
  const idx = src.index.array, uv = src.attributes.uv;
  for (const layer of style.layers) {
    const outer = layer === style.layers[style.layers.length - 1] && style.layers.length > 1 || style.tex === 'buzz';
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = thick[i] * layer + 0.0008;
      pos[i * 3] = base[i * 3] + nrm[i * 3] * t; pos[i * 3 + 1] = base[i * 3 + 1] + nrm[i * 3 + 1] * t + C; pos[i * 3 + 2] = base[i * 3 + 2] + nrm[i * 3 + 2] * t;
      const shade = outer ? 1 : 0.78; col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = shade; col[i * 4 + 3] = grow[i];
    }
    const keep = []; for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b2 = idx[k + 1], c = idx[k + 2]; if (grow[a] > 0.02 || grow[b2] > 0.02 || grow[c] > 0.02) keep.push(a, b2, c); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const uvs = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uvs[i * 2] = uv.getX(i) * 7; uvs[i * 2 + 1] = uv.getY(i) * 1.6; } g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(keep); g.computeVertexNormals(); O(g);
    const m = new THREE.Mesh(g, mkMat(outer)); m.castShadow = true; head.add(m); mats.push(m.material);
  }
  src.dispose();
  // ---- long hair: a curtain falling down the back ----
  if (look.hair === 'long') {
    const TM = 1.25, NU = 40, NV = 26, y0 = -0.05, y1 = -0.38, pos = [], uvs = [], col = [], ind = [];
    const head0 = Math.sqrt(Math.max(0.05, 1 - (y0 / P.Ry) ** 2)), a0 = P.Rx * head0 + 0.012, b0 = P.Rz * 1.08 * head0 + 0.014;
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const th = (i / NU * 2 - 1) * TM, t = j / NV, k = smooth(0, 0.5, t), y = y0 + (y1 - y0) * t;
      const ax = a0 + (0.135 - a0) * k, bz = b0 + (0.18 - b0) * k, wav = 0.004 * Math.sin(th * 7 + t * 9);
      pos.push(Math.sin(th) * (ax + wav), y + C, -Math.cos(th) * (bz + wav) + 0.01 * k);
      uvs.push(i / NU * 5, 1 - t);
      const jit = vnoise(i * 0.7, 4.2), alpha = smooth(1.0, 0.9, t + jit * 0.12) * smooth(TM, TM - 0.2, Math.abs(th));
      col.push(0.92, 0.92, 0.92, alpha);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b2 = a + 1, c = a + NU + 1, d = c + 1; ind.push(a, c, b2, b2, c, d); }
    const g = O(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(ind); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mkMat(false, THREE.DoubleSide)); m.castShadow = true; head.add(m);
    // a second, slightly looser layer of strands over it
    const g2 = O(g.clone()); const p2 = g2.attributes.position; for (let i = 0; i < p2.count; i++) { const x = p2.getX(i), z = p2.getZ(i), r = Math.hypot(x, z) || 1; p2.setXYZ(i, x * (1 + 0.006 / r), p2.getY(i), z * (1 + 0.006 / r)); }
    head.add(new THREE.Mesh(g2, mkMat(true, THREE.DoubleSide)));
  }
  // ---- ponytail: a tapered bundle from the back of the head, with a hair tie ----
  if (look.hair === 'pony') {
    const pts = [[0, 0.03, -0.11], [0, 0.0, -0.135], [0, -0.07, -0.15], [0, -0.16, -0.145], [0, -0.23, -0.13]].map(p => new THREE.Vector3(p[0], p[1] + C, p[2] * (P.Rz / 0.101)));
    const curve = new THREE.CatmullRomCurve3(pts), TS = 40, RS = 14, g = O(new THREE.TubeGeometry(curve, TS, 1, RS, false));
    const p = g.attributes.position, uvA = g.attributes.uv;
    for (let i = 0; i <= TS; i++) { const t = i / TS, c = curve.getPointAt(t), r = (0.026 * (1 - t) + 0.008 * t) * (1 + 0.25 * Math.sin(t * Math.PI)); for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r); } }
    const uvs = new Float32Array(uvA.count * 2), cols = new Float32Array(uvA.count * 4);
    for (let k = 0; k < uvA.count; k++) { uvs[k * 2] = uvA.getY(k) * 3; uvs[k * 2 + 1] = 1 - uvA.getX(k); const t = uvA.getX(k); cols[k * 4] = cols[k * 4 + 1] = cols[k * 4 + 2] = 0.9; cols[k * 4 + 3] = smooth(1, 0.88, t + vnoise(k * 0.3, 1) * 0.1); }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.BufferAttribute(cols, 4)); g.computeVertexNormals();
    head.add(new THREE.Mesh(g, mkMat(false)));
    const tie = new THREE.Mesh(O(new THREE.TorusGeometry(0.022, 0.006, 8, 18)), O(new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.5 }))); tie.position.copy(curve.getPointAt(0.12)); tie.lookAt(curve.getPointAt(0.2)); head.add(tie);
  }
  // ---- bun: a wrapped knot at the back of the crown ----
  if (look.hair === 'bun') {
    const g = O(new THREE.SphereGeometry(0.036, 24, 16)), m = new THREE.Mesh(g, O(new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.5 })));
    m.position.set(0, C + 0.05 * (P.Ry / 0.118), -0.098 * (P.Rz / 0.101)); m.scale.set(1, 0.85, 0.9); m.rotation.set(0.6, 0, 0.9); head.add(m);
  }
}
