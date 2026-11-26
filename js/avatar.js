import * as THREE from 'three';
import { modelTemplate } from './custom.js';
import { buildRealHead, buildRealHair, cleanFace } from './face.js';

// The driver you see in the car: a seated person with smooth, rounded proportions (not a box man), in a masculine or a
// feminine build, with a face, hair, clothes and arms that reach for the steering wheel. Used for your own driver (you see
// your body in the cockpit; passengers and other players see all of you), for other players' drivers, and for passengers.
// Origin = the eyes; +Z = forward (the way the car faces); +Y = up. Everything is in metres.

export const SKINS = [['light', 'Light', '#f1c8a8'], ['fair', 'Fair', '#e6b48f'], ['medium', 'Medium', '#d09a70'], ['tan', 'Tan', '#b07850'], ['brown', 'Brown', '#8a5a3c'], ['dark', 'Dark', '#5a3a26']];
export const HAIRS = [['short', 'Short'], ['buzz', 'Buzz cut'], ['curly', 'Curly'], ['long', 'Long'], ['pony', 'Ponytail'], ['bun', 'Bun'], ['bob', 'Bob'], ['bald', 'Bald']];
export const HAIR_COLORS = ['#1c1714', '#3b2619', '#6b4428', '#a5703b', '#d8b46a', '#9c3b1e', '#9a9a9a', '#e86fb1', '#3a7bd5'];
export const BEARDS = [['none', 'None'], ['stubble', 'Stubble'], ['beard', 'Beard'], ['mustache', 'Mustache']];
export const HATS = [['none', 'None'], ['cap', 'Cap'], ['beanie', 'Beanie']];
export const TOP_COLORS = ['#e8e6e1', '#1d1f24', '#c43b2f', '#2f6fd1', '#2f9e5a', '#e0a020', '#7a4fc9', '#e86fb1', '#6b7280', '#0f766e'];
export const PANTS_COLORS = ['#2b3442', '#1b1c20', '#4a5a78', '#6b5a43', '#c9c2b0', '#3f4a2e'];

// your own models in place of the head (a face scan!), the top and the trousers. [id, label, biggest side in metres at size 1, where its middle sits]
export const PART_SLOTS = [['head', 'Head', 0.27, [0, 0.0, -0.03]], ['top', 'Shirt / top', 0.62, [0, -0.42, -0.04]], ['pants', 'Pants', 0.95, [0, -0.78, 0.26]]];
export const PART_EXTS = ['glb', 'gltf', 'obj', 'stl'], MAX_PART_BYTES = 6 * 1024 * 1024;
const clp = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanPart(m) {
  m = m && typeof m === 'object' ? m : {};
  return { name: String(m.name || 'Model').slice(0, 32), ext: PART_EXTS.includes(m.ext) ? m.ext : 'glb', size: Math.max(0, m.size | 0),
    x: clp(m.x, -1, 1, 0), y: clp(m.y, -1, 1, 0), z: clp(m.z, -1, 1, 0), s: clp(m.s, 0.1, 4, 1),
    yaw: clp(m.yaw, -180, 180, 0), pitch: clp(m.pitch, -180, 180, 0), roll: clp(m.roll, -180, 180, 0), hide: m.hide === 0 ? 0 : 1, on: m.on === 0 ? 0 : 1, fit: m.fit === 0 ? 0 : 1 };
}
// ---- gluing a face scan onto the driver's face ----
// Phone face scans come in every which way: facing backwards, lying on their back, or with their triangles wound inside out.
// An inside-out or backwards face shell shows its hollow inside, and a hollow face seems to turn the opposite way to the
// head (the "hollow mask" illusion). So: turn every mesh right side out, work out which way the face looks (and which way
// is up), find the tip of the nose, and size the head to a real head's width. The caller then puts the nose tip on the
// driver's nose, so the scan sits on the face and turns with it.
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3(), _fn = new THREE.Vector3(), _fm = new THREE.Vector3();
function meshTris(o, cb) {
  const g = o.geometry, P = g.attributes.position, I = g.index, n = I ? I.count : P.count, M = o.matrixWorld;
  for (let i = 0; i + 2 < n; i += 3) {
    const a = I ? I.getX(i) : i, b = I ? I.getX(i + 1) : i + 1, c = I ? I.getX(i + 2) : i + 2;
    _fa.fromBufferAttribute(P, a).applyMatrix4(M); _fb.fromBufferAttribute(P, b).applyMatrix4(M); _fc.fromBufferAttribute(P, c).applyMatrix4(M);
    cb(_fa, _fb, _fc);
  }
}
export function fitHeadScan(inner) {
  inner.updateMatrixWorld(true);
  const meshes = []; inner.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position) meshes.push(o); });
  if (!meshes.length) return null;
  // the middle of everything (area-weighted)
  const cen = new THREE.Vector3(); let area = 0;
  for (const o of meshes) meshTris(o, (a, b, c) => { const ar = _fn.subVectors(b, a).cross(_fm.subVectors(c, a)).length() / 2; cen.addScaledVector(_fm.addVectors(a, b).add(c), ar / 3); area += ar; });
  if (!(area > 0)) return null; cen.divideScalar(area);
  // 1) right side out: triangles should face away from the middle
  for (const o of meshes) {
    let out = 0; meshTris(o, (a, b, c) => { _fn.subVectors(b, a).cross(_fm.subVectors(c, a)); out += _fn.dot(_fm.addVectors(a, b).add(c).multiplyScalar(1 / 3).sub(cen)); });
    // (a mirrored mesh is drawn with its winding swapped, so count it the other way round)
    if (o.matrixWorld.determinant() < 0) out = -out;
    if (out < 0) {
      const g = o.geometry.clone();
      if (g.index) { const A = g.index.array; for (let i = 0; i + 2 < A.length; i += 3) { const t = A[i + 1]; A[i + 1] = A[i + 2]; A[i + 2] = t; } g.index.needsUpdate = true; }
      else for (const k in g.attributes) { const at = g.attributes[k], z = at.itemSize, A = at.array; for (let i = 0; i + 2 < at.count; i += 3) for (let j = 0; j < z; j++) { const t = A[(i + 1) * z + j]; A[(i + 1) * z + j] = A[(i + 2) * z + j]; A[(i + 2) * z + j] = t; } at.needsUpdate = true; }
      o.geometry = g; o.userData.flipped = true;
    }
    // shading normals pointing inwards too? point them out
    const N = o.geometry.attributes.normal, P = o.geometry.attributes.position;
    if (N) {
      const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld); let d = 0;
      const step = Math.max(1, Math.floor(P.count / 20000));
      for (let i = 0; i < P.count; i += step) { _fa.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).sub(cen); _fn.fromBufferAttribute(N, i).applyMatrix3(nm); d += _fn.dot(_fa); }
      if (d < 0) { if (!o.userData.flipped) o.geometry = o.geometry.clone(); const A = o.geometry.attributes.normal.array; for (let i = 0; i < A.length; i++) A[i] = -A[i]; o.geometry.attributes.normal.needsUpdate = true; }
    } else { if (!o.userData.flipped) o.geometry = o.geometry.clone(); o.geometry.computeVertexNormals(); }
  }
  // 2) which way does it face? Summed outward area: an open face shell points the way the face looks
  const sum = new THREE.Vector3(), box = new THREE.Box3();
  for (const o of meshes) meshTris(o, (a, b, c) => { sum.add(_fn.subVectors(b, a).cross(_fm.subVectors(c, a)).multiplyScalar(0.5)); box.expandByPoint(a); box.expandByPoint(b); box.expandByPoint(c); });
  const size = box.getSize(new THREE.Vector3()), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), strength = sum.length() / area;
  const flat = size.y < Math.min(size.x, size.z) * 0.9;
  if (strength > 0.12 && Math.abs(sum.y) / sum.length() > 0.7 && flat) {
    // a face scan lying on its back (Z-up export): stand it up, face forwards
    q.setFromUnitVectors(_fn.copy(sum).normalize(), Z);
  } else {
    const h = new THREE.Vector3(sum.x, 0, sum.z);
    let yaw;
    if (h.length() / area > 0.08) yaw = Math.atan2(h.x, h.z);
    else {
      // a closed head: the nose is the sharpest bump around the head, a little below the middle
      const B = 48, R = new Float32Array(B), y0 = box.min.y + size.y * 0.35, y1 = box.min.y + size.y * 0.8;
      for (const o of meshes) meshTris(o, a => { if (a.y < y0 || a.y > y1) return; const dx = a.x - cen.x, dz = a.z - cen.z, r = Math.hypot(dx, dz); const k = ((Math.round(Math.atan2(dx, dz) / (Math.PI * 2) * B) % B) + B) % B; if (r > R[k]) R[k] = r; });
      let best = -1, bk = 0;
      for (let k = 0; k < B; k++) { let m = 0; for (let j = 3; j <= 6; j++) m += R[(k + j) % B] + R[(k - j + B) % B]; const sc = R[k] - m / 8; if (sc > best) { best = sc; bk = k; } }
      yaw = bk / B * Math.PI * 2;
    }
    q.setFromAxisAngle(_fn.set(0, 1, 0), -yaw);
  }
  // 3) in the turned scan: the nose tip (furthest forward, near the middle, in the head rather than the chest) and the head's width
  const qb = new THREE.Box3(), pts = [];
  for (const o of meshes) { const P = o.geometry.attributes.position, step = Math.max(1, Math.floor(P.count / 30000)); for (let i = 0; i < P.count; i += step) { const v = new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).applyQuaternion(q); pts.push(v); qb.expandByPoint(v); } }
  const qs = qb.getSize(new THREE.Vector3()), qc = qb.getCenter(new THREE.Vector3()), tall = qs.y > qs.x * 1.4;
  const yMin = tall ? qb.max.y - Math.max(qs.x * 1.3, qs.y * 0.45) : qb.min.y;
  let nose = null;
  for (const v of pts) if (v.y >= yMin && Math.abs(v.x - qc.x) < qs.x * 0.2 && (!nose || v.z > nose.z)) nose = v;
  if (!nose) nose = new THREE.Vector3(qc.x, qc.y, qb.max.z);
  const band = Math.max(qs.x, qs.y) * 0.06; let wl = Infinity, wr = -Infinity;
  for (const v of pts) if (Math.abs(v.y - nose.y) < band) { if (v.x < wl) wl = v.x; if (v.x > wr) wr = v.x; }
  let w = wr - wl; if (!(w > 0)) w = qs.x;
  // a real head is ~15.5 cm across at the nose; keep silly sizes in check
  let s = 0.155 / w; const big = Math.max(qs.x, qs.y, qs.z) * s; if (big > 1.1) s *= 1.1 / big;
  // the nose tip back in the scan's own coordinates (before turning)
  const noseIn = nose.clone().applyQuaternion(q.clone().invert());
  return { q, s, nose: noseIn };
}
// where the driver sits in a custom (uploaded) car body: nudged from the stock seat, and sized
export function cleanSeat(v) { v = v && typeof v === 'object' ? v : {}; return { x: clp(v.x, -2, 2, 0), y: clp(v.y, -2, 3, 0), z: clp(v.z, -3, 3, 0), s: clp(v.s, 0.3, 3, 1) }; }
const pickOf = (list, v, d) => (list.some(x => (Array.isArray(x) ? x[0] : x) === v) ? v : d);
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
export function defaultDriver(build = 'm') {
  return build === 'f'
    ? { b: 'f', skin: 'fair', hair: 'long', hc: '#3b2619', beard: 'none', hat: 'none', glasses: 0, top: '#2f6fd1', pants: '#2b3442' }
    : { b: 'm', skin: 'medium', hair: 'short', hc: '#1c1714', beard: 'none', hat: 'none', glasses: 0, top: '#c43b2f', pants: '#2b3442' };
}
// tidy a look (also used on looks other players send)
export function cleanDriver(v) {
  if (!v || typeof v !== 'object') return null; const b = v.b === 'f' ? 'f' : 'm', d = defaultDriver(b);
  return { b, skin: pickOf(SKINS, v.skin, d.skin), hair: pickOf(HAIRS, v.hair, d.hair), hc: col(v.hc, d.hc), beard: pickOf(BEARDS, v.beard, 'none'), hat: pickOf(HATS, v.hat, 'none'), glasses: v.glasses ? 1 : 0, top: col(v.top, d.top), pants: col(v.pants, d.pants), style: v.style === 'r' ? 'r' : 's', face: cleanFace(v.face), ...(v.seat ? { seat: cleanSeat(v.seat) } : {}), ...(Array.isArray(v.pseat) ? { pseat: v.pseat.slice(0, 3).map(cleanSeat) } : {}), ...(v.hide ? { hide: 1 } : {}), ...(typeof v.pet === 'string' && /^(dog:(golden|black|choc|cream|dalmatian|husky|shepherd|beagle|corgi|collie|pug|poodle|weim)|model)$/.test(v.pet) ? { pet: v.pet } : {}) };
}

const mats = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); let m = mats.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o }); mats.set(k, m); } return m; };
const geos = new Map();
const geo = (k, f) => { let g = geos.get(k); if (!g) { g = f(); geos.set(k, g); } return g; };
const capsule = (r, len) => geo(`cap${r}|${len}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14));
const sphere = (r, w = 16, h = 12) => geo(`sph${r}|${w}`, () => new THREE.SphereGeometry(r, w, h));

// a smooth torso from a lathe profile: [height, radius] pairs from the shoulders down to the hips; flattened front to back
function torsoGeo(f) {
  return geo('torso' + f, () => {
    const prof = f
      ? [[0.02, 0.03], [0.0, 0.12], [-0.03, 0.155], [-0.1, 0.152], [-0.2, 0.128], [-0.28, 0.118], [-0.38, 0.15], [-0.46, 0.165], [-0.5, 0.13], [-0.52, 0.02]]
      : [[0.02, 0.04], [0.0, 0.15], [-0.04, 0.185], [-0.12, 0.172], [-0.22, 0.15], [-0.3, 0.14], [-0.4, 0.148], [-0.47, 0.152], [-0.5, 0.12], [-0.52, 0.02]];
    const g = new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)).reverse(), 22); g.scale(1, 1, 0.6); g.computeVertexNormals(); return g;
  });
}

// put a capsule between two points
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function limb(m, a, b, r) { _a.subVectors(b, a); const L = _a.length(); m.geometry = capsule(r, Math.max(0.001, L - r * 0.6)); m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, _a.normalize()); }

export function buildDriver(look, opts = {}) {
  const L = cleanDriver(look) || defaultDriver('m'), F = L.b === 'f';
  const skinC = (SKINS.find(s => s[0] === L.skin) || SKINS[2])[2], skin = mat(skinC, { roughness: 0.62 }), top = mat(L.top, { roughness: 0.85 }), pants = mat(L.pants, { roughness: 0.9 });
  const hairM = mat(L.hc, { roughness: 0.7 }), shoe = mat('#1a1a1c', { roughness: 0.6 }), dark = mat('#141418', { roughness: 0.4 }), white = mat('#f4f1ea', { roughness: 0.4 });
  const lip = mat('#' + new THREE.Color(skinC).lerp(new THREE.Color(F ? '#b8424f' : '#9a5a50'), F ? 0.45 : 0.3).getHexString(), { roughness: 0.5 });
  const g = new THREE.Group(); g.name = 'driver'; g.userData.cockpit = true;
  const add = (geom, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const hs = F ? 0.95 : 1; // head size

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, -0.005, -0.03); g.add(head);
  const hairG = new THREE.Group(); head.add(hairG); // hair, beard, hat and glasses: fitted to whichever head is underneath
  const fv = k => { const v = +((L.face || {})[k]); return isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; };
  let real = null;
  if (L.style === 'r') { try { real = buildRealHead(head, L, skinC, L.hc, skin, !!opts.fast); hairG.scale.set(...real.scale); } catch (e) { console.warn('[overpass] realistic head', e); real = null; } }
  if (!real) { // the simple, toy-like head (the face sliders still nudge it)
    const hw = 1 + 0.08 * fv('headW'), hh = 1 + 0.06 * fv('headH'); hairG.scale.set(hw, hh, 1);
    const skull = add(sphere(0.1, 22, 18), skin, 0, 0.02, 0, head); skull.scale.set(0.9 * hs * hw, 1.1 * hs * hh, 1.0 * hs);
    const jaw = add(sphere(0.068, 18, 14), skin, 0, -0.05 - 0.006 * fv('chinLen'), 0.014 + 0.004 * fv('chinPro'), head); jaw.scale.set((F ? 0.86 : 0.98) * (1 + 0.12 * fv('jawW')), 0.85, 0.95); // chin and jaw (squarer for the masculine build)
    const ex = 0.034 + 0.004 * fv('eyeSp'), ey = 0.018 + 0.006 * fv('eyeH'), es = 1 + 0.15 * fv('eyeSize');
    for (const s of [-1, 1]) {
      const eye = add(sphere(0.0135, 12, 10), white, s * ex, ey, 0.083, head); eye.scale.set(1.1 * es, 0.85 * es, 0.6); eye.rotation.z = s * 0.15 * fv('eyeTilt');
      add(sphere(0.008, 10, 8), dark, s * ex, ey, 0.091, head).scale.setScalar(es);
      const brow = add(geo('brow' + F, () => new THREE.BoxGeometry(F ? 0.03 : 0.036, F ? 0.005 : 0.008, 0.008)), hairM, s * (ex + 0.001), ey + 0.026 + 0.005 * fv('browH'), 0.088, head); brow.rotation.z = s * ((F ? -0.12 : -0.06) - 0.25 * fv('browAng')); brow.scale.y = 1 + 0.5 * fv('browThk');
      const ear = add(sphere(0.022, 10, 8), skin, s * 0.09 * hs * hw, 0.012, -0.005, head); ear.scale.set(0.45, 1, 0.75).multiplyScalar(1 + 0.2 * fv('earSize')); ear.rotation.y = s * 0.4 * fv('earOut');
    }
    const nose = add(geo('nose', () => { const c = new THREE.ConeGeometry(0.014, 0.04, 10); c.rotateX(Math.PI / 2 - 0.35); return c; }), skin, 0, -0.005 - 0.004 * fv('noseLen'), 0.1, head);
    nose.scale.set(1 + 0.3 * fv('noseW'), 1 + 0.2 * fv('noseLen'), 1 + 0.3 * fv('nosePro'));
    const mouth = add(geo('mouth' + F, () => new THREE.CapsuleGeometry(F ? 0.006 : 0.005, F ? 0.022 : 0.026, 4, 8)), lip, 0, -0.05 + 0.004 * fv('mouthH'), 0.079, head); mouth.rotation.z = Math.PI / 2; mouth.scale.set(1 + 0.4 * fv('lips'), 1 + 0.25 * fv('mouthW'), 1);
  }
  // hair
  const cap = (sy = 0.5, r = 1.04, tilt = 0.5) => { const m = add(geo('hcap' + sy + '|' + tilt, () => new THREE.SphereGeometry(0.1, 24, 16, 0, Math.PI * 2, 0, Math.PI * sy).rotateX(-tilt)), hairM, 0, 0.02, 0, hairG); m.scale.set(0.9 * hs * r, 1.1 * hs * r, 1.0 * hs * r); return m; };
  const hatOn = L.hat !== 'none';
  if (real) { try { buildRealHair(head, L, real, L.hc, hatOn); } catch (e) { console.warn('[overpass] realistic hair', e); } }
  else if (L.hair === 'short' && hatOn) cap(0.5, 1.02, 0.42);
  else if (L.hair === 'curly' && hatOn) cap(0.52, 1.03, 0.4);
  else if (L.hair === 'short') { cap(0.5, 1.05, 0.42); add(sphere(0.05), hairM, 0.012, 0.098, 0.03, hairG).scale.set(1.3, 0.38, 0.9); }
  else if (L.hair === 'buzz') cap(0.46, 1.015, 0.5);
  else if (L.hair === 'curly') { cap(0.52, 1.06, 0.4); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, y = 0.07 + (i % 3) * 0.02; add(sphere(0.03, 10, 8), hairM, Math.cos(a) * 0.075 * hs, y, Math.sin(a) * 0.075 * hs - 0.01, hairG); } }
  else if (L.hair === 'long' || L.hair === 'bob') {
    cap(0.56, 1.05, 0.38); const long = L.hair === 'long', len = long ? 0.24 : 0.12;
    const back = add(geo('hback' + long, () => new THREE.CapsuleGeometry(0.075, len, 6, 16)), hairM, 0, -0.03 - len * 0.35, -0.045, hairG); back.scale.set(1.25, 1, 0.55);
    for (const s of [-1, 1]) { const side = add(geo('hside' + long, () => new THREE.CapsuleGeometry(0.03, len * 0.8, 4, 10)), hairM, s * 0.085 * hs, -0.02 - len * 0.3, 0.0, hairG); side.scale.set(0.8, 1, 1.2); }
  }
  else if (L.hair === 'pony') { cap(0.5, 1.05, 0.36); const p = add(geo('pony', () => new THREE.CapsuleGeometry(0.03, 0.16, 4, 12)), hairM, 0, -0.04, -0.12, hairG); p.rotation.x = 0.35; add(sphere(0.022), mat('#222', {}), 0, 0.045, -0.1, hairG); }
  else if (L.hair === 'bun') { cap(0.5, 1.05, 0.36); add(sphere(0.045, 14, 12), hairM, 0, 0.1, -0.08, hairG); }
  // facial hair
  if (!real && (L.beard === 'beard' || L.beard === 'stubble')) { const b = add(geo('beard', () => new THREE.SphereGeometry(0.08, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)), L.beard === 'beard' ? hairM : mat(new THREE.Color(L.hc).lerp(new THREE.Color(skinC), 0.55).getHexString().replace(/^/, '#'), { roughness: 0.9 }), 0, -0.03, 0.012, hairG); b.scale.set(1.12, L.beard === 'beard' ? 1.05 : 0.95, 1.08); }
  if (L.beard === 'mustache') { const m = add(geo('stache', () => new THREE.CapsuleGeometry(0.008, 0.036, 4, 8)), hairM, 0, -0.035, 0.088, hairG); m.rotation.z = Math.PI / 2; if (real) { m.position.set(0, real.mouthY / hairG.scale.y, (real.mouthZ + 0.004) / hairG.scale.z); m.scale.set(0.8, 1.15, 0.8); } }
  // hat, glasses
  if (L.hat === 'cap') { const c = add(geo('hatcap', () => new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), top, 0, 0.03, -0.004, hairG); c.scale.set(1.04 * hs, 1.1 * hs, 1.12 * hs); const brim = add(geo('brim', () => new THREE.CylinderGeometry(0.075, 0.075, 0.008, 18, 1, false, -Math.PI / 2, Math.PI)), top, 0, 0.04, 0.07, hairG); brim.scale.set(1, 1, 1.1); }
  if (L.hat === 'beanie') { const c = add(geo('beanie', () => new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), top, 0, 0.026, -0.006, hairG); c.scale.set(1.04 * hs, 1.2 * hs, 1.12 * hs); add(sphere(0.022), white, 0, 0.16 * hs, -0.01, hairG); }
  if (L.glasses) { const gl = mat('#111', { roughness: 0.2, metalness: 0.4 }); for (const s of [-1, 1]) { const l = add(geo('lens', () => new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16)), gl, s * 0.035, 0.018, 0.098, hairG); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 0.85); } add(geo('bridge', () => new THREE.BoxGeometry(0.075, 0.005, 0.005)), gl, 0, 0.024, 0.098, hairG); }

  // ---- neck, torso, shoulders ----
  const nk = real ? (F ? [0.047, 0.055] : [0.057, 0.066]) : (F ? [0.042, 0.05] : [0.05, 0.06]);
  const neck = add(geo('neck' + nk, () => new THREE.CylinderGeometry(nk[0], nk[1], 0.1, 18)), skin, 0, -0.12, -0.045);
  const topParts = [], pantParts = [];
  const torso = add(torsoGeo(F), top, 0, -0.2, -0.06); topParts.push(torso); torso.rotation.x = -0.1; // leaning back into the seat a little
  const sw = F ? 0.165 : 0.2; // shoulder width (half)
  // shoulders, arms and legs always stay: uploaded tops and pants are layers over them
  for (const s of [-1, 1]) add(sphere(F ? 0.052 : 0.06), top, s * sw, -0.225, -0.055);
  if (F) for (const s of [-1, 1]) { const b = add(sphere(0.06, 16, 12), top, s * 0.05, -0.325, 0.0); b.scale.set(1.05, 0.85, 0.62); topParts.push(b); }
  const collar = add(geo('collar', () => new THREE.TorusGeometry(0.05, 0.012, 6, 16)), top, 0, -0.18, -0.045); collar.rotation.x = Math.PI / 2; topParts.push(collar);
  // ---- legs (seated: thighs forward, shins down) ----
  const hipY = -0.72, hipW = F ? 0.095 : 0.09;
  const legs = [];
  for (const s of [-1, 1]) {
    // (on a motorbike: astride the tank, knees in, feet back on the pegs; the whole rider then leans forward)
    const B = !!opts.bike, hip = new THREE.Vector3(s * (hipW + (B ? 0.03 : 0)), hipY, -0.02), knee = B ? new THREE.Vector3(s * (hipW + 0.12), hipY + 0.1, 0.27) : new THREE.Vector3(s * (hipW + 0.01), hipY + 0.1, 0.4), ankle = B ? new THREE.Vector3(s * (hipW + 0.1), hipY - 0.3, 0.2) : new THREE.Vector3(s * (hipW + 0.02), hipY - 0.16, 0.78);
    const th = add(capsule(0.07, 0.3), pants, 0, 0, 0); limb(th, hip, knee, F ? 0.072 : 0.07);
    const sh = add(capsule(0.05, 0.3), pants, 0, 0, 0); limb(sh, knee, ankle, 0.05);
    const ft = add(geo('shoe', () => new THREE.CapsuleGeometry(0.045, 0.12, 4, 10)), shoe, ankle.x, ankle.y - 0.04, ankle.z + 0.05); ft.rotation.x = Math.PI / 2 - (B ? 0.9 : 0.3); ft.scale.set(1, 1, 0.75);
    legs.push(th, sh, ft);
  }
  const seatM = add(sphere(0.15, 18, 12), pants, 0, hipY + 0.02, -0.03); seatM.scale.set(F ? 1.18 : 1.1, 0.6, 1.0); pantParts.push(seatM);

  // ---- arms (two-bone IK to a hand target) ----
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Vector3(s * sw, -0.235, -0.05);
    const up = add(capsule(F ? 0.042 : 0.048, 0.24), top, 0, 0, 0), fo = add(capsule(F ? 0.034 : 0.04, 0.23), skin, 0, 0, 0);
    const hand = new THREE.Group(); g.add(hand);
    const palm = add(sphere(0.045, 14, 10), skin, 0, 0, 0, hand); palm.scale.set(0.75, 0.42, 1.0);
    const fing = add(geo('fing', () => new THREE.CapsuleGeometry(0.02, 0.05, 4, 10)), skin, 0, -0.012, 0.05, hand); fing.scale.set(1.6, 0.8, 1); fing.rotation.x = Math.PI / 2 + 0.6;
    const thumb = add(geo('thumb', () => new THREE.CapsuleGeometry(0.013, 0.035, 4, 8)), skin, -s * 0.035, 0.0, 0.02, hand); thumb.rotation.set(Math.PI / 2, 0, s * 0.6);
    return { s, sh, up, fo, hand };
  });
  const U = 0.29, Fa = 0.27;
  const _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
  // targets: [left, right] hand positions in this group's space (or null = hands on the lap)
  function setArms(T) {
    for (const A of arms) {
      const tgt = T && T[A.s < 0 ? 0 : 1];
      _t.copy(tgt || _p.set(A.s * 0.12, -0.62, 0.25));
      _d.subVectors(_t, A.sh); let dist = _d.length(); const reach = U + Fa - 0.005; if (dist > reach) { _d.setLength(reach); _t.copy(A.sh).add(_d); dist = reach; } dist = Math.max(dist, 0.08);
      // elbow: law of cosines, bent down and out to the side
      const a = (U * U + dist * dist - Fa * Fa) / (2 * U * dist), ang = Math.acos(Math.max(-1, Math.min(1, a)));
      const dir = _d.clone().normalize(), pole = _w.set(A.s * 0.6, -1, -0.2).normalize(); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      _e.copy(A.sh).addScaledVector(dir, Math.cos(ang) * U).addScaledVector(pole, Math.sin(ang) * U);
      limb(A.up, A.sh, _e, F ? 0.042 : 0.048); limb(A.fo, _e, _t, F ? 0.034 : 0.04);
      A.hand.position.copy(_t); A.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d.subVectors(_t, _e).normalize());
    }
  }
  setArms(null);
  // ---- visibility (own seat, VR hands, stock parts swapped for uploaded ones) ----
  const st = { own: false, vr: false, hide: { head: 0, top: 0, pants: 0 } }, custom = {};
  function vis() {
    const H = st.hide; head.visible = neck.visible = !st.own && !H.head;
    for (const o of topParts) o.visible = !H.top; for (const o of pantParts) o.visible = !H.pants;
    // your own seat in VR: the arms stay (they follow your real hands) but the hands give way to the VR gloves
    for (const A of arms) { A.up.visible = A.fo.visible = true; A.hand.visible = !(st.own && st.vr); }
    if (custom.head && custom.head.g) custom.head.g.visible = !st.own && !!custom.head.on;
  }
  function syncParts(list) {
    let changed = false;
    for (const [id, , big, anchor] of PART_SLOTS) {
      const a = list[id], ok = a && typeof a.data === 'string' && a.h, key = ok ? String(a.h) + ':' + (a.m && a.m.ext || '') + (id === 'head' ? ':' + cleanPart(a.m).fit : '') : '';
      let c = custom[id];
      if (!c || c.key !== key) {
        if (c && c.g) g.remove(c.g);
        c = custom[id] = { key, g: null, on: 0 }; changed = true;
        if (ok) {
          const me = c, m0 = cleanPart(a.m);
          modelTemplate({ h: a.h, ext: m0.ext, data: a.data }).then(tpl => {
            if (custom[id] !== me) return;
            const inner = tpl.clone(true); inner.updateMatrixWorld(true);
            const wrap = new THREE.Group(); wrap.name = 'driver-' + id;
            let fit = null;
            if (id === 'head' && m0.fit) { try { fit = fitHeadScan(inner); } catch (e) { console.warn('[overpass] face fit', e); } }
            if (fit) {
              // glued: the scan's nose tip sits on the driver's nose (in front of the head's middle, a touch below the eyes)
              const orient = new THREE.Group(); orient.quaternion.copy(fit.q); inner.position.sub(fit.nose); orient.add(inner);
              const norm = new THREE.Group(); norm.scale.setScalar(fit.s); norm.add(orient);
              const shift = new THREE.Group(); shift.position.set(0, -0.02, 0.125); shift.add(norm); wrap.add(shift);
            } else {
              const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mx = Math.max(size.x, size.y, size.z), cen = box.getCenter(new THREE.Vector3());
              inner.position.sub(cen); const norm = new THREE.Group(); norm.add(inner); norm.scale.setScalar(isFinite(mx) && mx > 1e-6 ? big / mx : 1); wrap.add(norm);
            }
            wrap.traverse(o => { if (o.isMesh) o.castShadow = true; });
            me.g = wrap; me.anchor = anchor; g.add(wrap); me.place = null; place(me, list[id] && list[id].m); vis();
          }).catch(e => { console.warn('[overpass] driver part', id, e); });
        }
      }
      if (c.g && ok) place(c, a.m);
      const hide = ok && c.g && cleanPart(a.m).hide && cleanPart(a.m).on ? 1 : 0; if (st.hide[id] !== hide) { st.hide[id] = hide; changed = true; }
    }
    if (changed) vis();
  }
  function place(c, m0) {
    const k = JSON.stringify(m0 || null); if (c.place === k) return; c.place = k;
    const m = cleanPart(m0), D = Math.PI / 180;
    c.on = m.on; c.g.visible = !!m.on && !(c === custom.head && st.own);
    c.g.position.set(c.anchor[0] + m.x, c.anchor[1] + m.y, c.anchor[2] + m.z); c.g.rotation.set(m.pitch * D, m.yaw * D, m.roll * D, 'YXZ'); c.g.scale.setScalar(m.s);
  }
  return {
    g, look: L, head, neck, arms, setArms,
    // own view from the driver's seat: hide your own head (the camera is inside it) and, with real VR hands, the arms
    view(ownSeat, vrHands) { st.own = !!ownSeat; st.vr = !!vrHands; vis(); },
    // your own uploaded models for the head, the top and the trousers: { head, top, pants } each { h, m, data } or null
    setParts(list) { syncParts(list || {}); },
    // free what this driver made for itself (the realistic face's materials and eye geometry); shared pieces stay
    dispose() { if (real && real.own) for (const x of real.own) x.dispose(); },
  };
}
// where the hands go on a wheel, in the car's space, from a cockpit config (10 and 2 o'clock; steer = wheel turn in radians)
export function wheelGrips(cfg, steer = 0) {
  const W = cfg.wheel, R = W.R, out = [];
  const q = new THREE.Quaternion().setFromEuler(W.style === 'bars' ? new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ') : new THREE.Euler(-(W.tilt || 0.4), Math.PI, 0, 'YXZ'));
  for (const s of [-1, 1]) { // -1: the driver's left hand
    const a = W.style === 'bars' ? 0 : W.style === 'yoke' ? 0.15 : 0.5, ang = (s < 0 ? Math.PI - a : a) + steer, r = W.style === 'bars' ? R - 0.06 : R;
    out.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r, 0.02).applyQuaternion(q).add(new THREE.Vector3(...W.p)));
  }
  return out.sort((a, b) => a.x - b.x); // [the hand on the -x side, the hand on the +x side]
}
