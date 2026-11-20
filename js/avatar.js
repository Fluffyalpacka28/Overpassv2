import * as THREE from 'three';
import { modelTemplate } from './custom.js';

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
    yaw: clp(m.yaw, -180, 180, 0), pitch: clp(m.pitch, -180, 180, 0), roll: clp(m.roll, -180, 180, 0), hide: m.hide === 0 ? 0 : 1, on: m.on === 0 ? 0 : 1 };
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
  return { b, skin: pickOf(SKINS, v.skin, d.skin), hair: pickOf(HAIRS, v.hair, d.hair), hc: col(v.hc, d.hc), beard: pickOf(BEARDS, v.beard, 'none'), hat: pickOf(HATS, v.hat, 'none'), glasses: v.glasses ? 1 : 0, top: col(v.top, d.top), pants: col(v.pants, d.pants), ...(v.seat ? { seat: cleanSeat(v.seat) } : {}) };
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

export function buildDriver(look) {
  const L = cleanDriver(look) || defaultDriver('m'), F = L.b === 'f';
  const skinC = (SKINS.find(s => s[0] === L.skin) || SKINS[2])[2], skin = mat(skinC, { roughness: 0.62 }), top = mat(L.top, { roughness: 0.85 }), pants = mat(L.pants, { roughness: 0.9 });
  const hairM = mat(L.hc, { roughness: 0.7 }), shoe = mat('#1a1a1c', { roughness: 0.6 }), dark = mat('#141418', { roughness: 0.4 }), white = mat('#f4f1ea', { roughness: 0.4 });
  const lip = mat('#' + new THREE.Color(skinC).lerp(new THREE.Color(F ? '#b8424f' : '#9a5a50'), F ? 0.45 : 0.3).getHexString(), { roughness: 0.5 });
  const g = new THREE.Group(); g.name = 'driver'; g.userData.cockpit = true;
  const add = (geom, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const hs = F ? 0.95 : 1; // head size

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, -0.005, -0.03); g.add(head);
  const skull = add(sphere(0.1, 22, 18), skin, 0, 0.02, 0, head); skull.scale.set(0.9 * hs, 1.1 * hs, 1.0 * hs);
  const jaw = add(sphere(0.068, 18, 14), skin, 0, -0.05, 0.014, head); jaw.scale.set(F ? 0.86 : 0.98, 0.85, 0.95); // chin and jaw (squarer for the masculine build)
  for (const s of [-1, 1]) {
    const eye = add(sphere(0.0135, 12, 10), white, s * 0.034, 0.018, 0.083, head); eye.scale.set(1.1, 0.85, 0.6);
    add(sphere(0.008, 10, 8), dark, s * 0.034, 0.018, 0.091, head);
    const brow = add(geo('brow' + F, () => new THREE.BoxGeometry(F ? 0.03 : 0.036, F ? 0.005 : 0.008, 0.008)), hairM, s * 0.035, 0.044, 0.088, head); brow.rotation.z = s * (F ? -0.12 : -0.06);
    const ear = add(sphere(0.022, 10, 8), skin, s * 0.09 * hs, 0.012, -0.005, head); ear.scale.set(0.45, 1, 0.75);
  }
  const nose = add(geo('nose', () => { const c = new THREE.ConeGeometry(0.014, 0.04, 10); c.rotateX(Math.PI / 2 - 0.35); return c; }), skin, 0, -0.005, 0.1, head);
  const mouth = add(geo('mouth' + F, () => new THREE.CapsuleGeometry(F ? 0.006 : 0.005, F ? 0.022 : 0.026, 4, 8)), lip, 0, -0.05, 0.079, head); mouth.rotation.z = Math.PI / 2;
  void nose;
  // hair
  const cap = (sy = 0.5, r = 1.04, tilt = 0.5) => { const m = add(geo('hcap' + sy + '|' + tilt, () => new THREE.SphereGeometry(0.1, 24, 16, 0, Math.PI * 2, 0, Math.PI * sy).rotateX(-tilt)), hairM, 0, 0.02, 0, head); m.scale.set(0.9 * hs * r, 1.1 * hs * r, 1.0 * hs * r); return m; };
  const hatOn = L.hat !== 'none';
  if (L.hair === 'short' && hatOn) cap(0.5, 1.02, 0.42);
  else if (L.hair === 'curly' && hatOn) cap(0.52, 1.03, 0.4);
  else if (L.hair === 'short') { cap(0.5, 1.05, 0.42); add(sphere(0.05), hairM, 0.012, 0.098, 0.03, head).scale.set(1.3, 0.38, 0.9); }
  else if (L.hair === 'buzz') cap(0.46, 1.015, 0.5);
  else if (L.hair === 'curly') { cap(0.52, 1.06, 0.4); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, y = 0.07 + (i % 3) * 0.02; add(sphere(0.03, 10, 8), hairM, Math.cos(a) * 0.075 * hs, y, Math.sin(a) * 0.075 * hs - 0.01, head); } }
  else if (L.hair === 'long' || L.hair === 'bob') {
    cap(0.56, 1.05, 0.38); const long = L.hair === 'long', len = long ? 0.24 : 0.12;
    const back = add(geo('hback' + long, () => new THREE.CapsuleGeometry(0.075, len, 6, 16)), hairM, 0, -0.03 - len * 0.35, -0.045, head); back.scale.set(1.25, 1, 0.55);
    for (const s of [-1, 1]) { const side = add(geo('hside' + long, () => new THREE.CapsuleGeometry(0.03, len * 0.8, 4, 10)), hairM, s * 0.085 * hs, -0.02 - len * 0.3, 0.0, head); side.scale.set(0.8, 1, 1.2); }
  }
  else if (L.hair === 'pony') { cap(0.5, 1.05, 0.36); const p = add(geo('pony', () => new THREE.CapsuleGeometry(0.03, 0.16, 4, 12)), hairM, 0, -0.04, -0.12, head); p.rotation.x = 0.35; add(sphere(0.022), mat('#222', {}), 0, 0.045, -0.1, head); }
  else if (L.hair === 'bun') { cap(0.5, 1.05, 0.36); add(sphere(0.045, 14, 12), hairM, 0, 0.1, -0.08, head); }
  // facial hair
  if (L.beard === 'beard' || L.beard === 'stubble') { const b = add(geo('beard', () => new THREE.SphereGeometry(0.08, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)), L.beard === 'beard' ? hairM : mat(new THREE.Color(L.hc).lerp(new THREE.Color(skinC), 0.55).getHexString().replace(/^/, '#'), { roughness: 0.9 }), 0, -0.03, 0.012, head); b.scale.set(1.12, L.beard === 'beard' ? 1.05 : 0.95, 1.08); }
  if (L.beard === 'mustache') { const m = add(geo('stache', () => new THREE.CapsuleGeometry(0.008, 0.036, 4, 8)), hairM, 0, -0.035, 0.088, head); m.rotation.z = Math.PI / 2; }
  // hat, glasses
  if (L.hat === 'cap') { const c = add(geo('hatcap', () => new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), top, 0, 0.03, -0.004, head); c.scale.set(1.04 * hs, 1.1 * hs, 1.12 * hs); const brim = add(geo('brim', () => new THREE.CylinderGeometry(0.075, 0.075, 0.008, 18, 1, false, -Math.PI / 2, Math.PI)), top, 0, 0.04, 0.07, head); brim.scale.set(1, 1, 1.1); }
  if (L.hat === 'beanie') { const c = add(geo('beanie', () => new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), top, 0, 0.026, -0.006, head); c.scale.set(1.04 * hs, 1.2 * hs, 1.12 * hs); add(sphere(0.022), white, 0, 0.16 * hs, -0.01, head); }
  if (L.glasses) { const gl = mat('#111', { roughness: 0.2, metalness: 0.4 }); for (const s of [-1, 1]) { const l = add(geo('lens', () => new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16)), gl, s * 0.035, 0.018, 0.098, head); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 0.85); } add(geo('bridge', () => new THREE.BoxGeometry(0.075, 0.005, 0.005)), gl, 0, 0.024, 0.098, head); }

  // ---- neck, torso, shoulders ----
  const neck = add(geo('neck' + F, () => new THREE.CylinderGeometry(F ? 0.042 : 0.05, F ? 0.05 : 0.06, 0.1, 14)), skin, 0, -0.12, -0.045);
  const topParts = [], pantParts = [];
  const torso = add(torsoGeo(F), top, 0, -0.2, -0.06); topParts.push(torso); torso.rotation.x = -0.1; // leaning back into the seat a little
  const sw = F ? 0.165 : 0.2; // shoulder width (half)
  // shoulders, arms and legs always stay: uploaded tops and pants are layers over them
  for (const s of [-1, 1]) add(sphere(F ? 0.052 : 0.06), top, s * sw, -0.225, -0.055);
  if (F) for (const s of [-1, 1]) { const b = add(sphere(0.06, 16, 12), top, s * 0.055, -0.33, 0.015); b.scale.set(1, 0.9, 0.75); topParts.push(b); }
  const collar = add(geo('collar', () => new THREE.TorusGeometry(0.05, 0.012, 6, 16)), top, 0, -0.18, -0.045); collar.rotation.x = Math.PI / 2; topParts.push(collar);
  // ---- legs (seated: thighs forward, shins down) ----
  const hipY = -0.72, hipW = F ? 0.095 : 0.09;
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Vector3(s * hipW, hipY, -0.02), knee = new THREE.Vector3(s * (hipW + 0.01), hipY + 0.1, 0.4), ankle = new THREE.Vector3(s * (hipW + 0.02), hipY - 0.16, 0.78);
    const th = add(capsule(0.07, 0.3), pants, 0, 0, 0); limb(th, hip, knee, F ? 0.072 : 0.07);
    const sh = add(capsule(0.05, 0.3), pants, 0, 0, 0); limb(sh, knee, ankle, 0.05);
    const ft = add(geo('shoe', () => new THREE.CapsuleGeometry(0.045, 0.12, 4, 10)), shoe, s * (hipW + 0.02), hipY - 0.2, 0.83); ft.rotation.x = Math.PI / 2 - 0.3; ft.scale.set(1, 1, 0.75);
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
    for (const A of arms) { const v = !(st.own && st.vr); A.up.visible = v; A.fo.visible = A.hand.visible = v; }
    if (custom.head && custom.head.g) custom.head.g.visible = !st.own && !!custom.head.on;
  }
  function syncParts(list) {
    let changed = false;
    for (const [id, , big, anchor] of PART_SLOTS) {
      const a = list[id], ok = a && typeof a.data === 'string' && a.h, key = ok ? String(a.h) + ':' + (a.m && a.m.ext || '') : '';
      let c = custom[id];
      if (!c || c.key !== key) {
        if (c && c.g) g.remove(c.g);
        c = custom[id] = { key, g: null, on: 0 }; changed = true;
        if (ok) {
          const me = c, m0 = cleanPart(a.m);
          modelTemplate({ h: a.h, ext: m0.ext, data: a.data }).then(tpl => {
            if (custom[id] !== me) return;
            const inner = tpl.clone(true); inner.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mx = Math.max(size.x, size.y, size.z), cen = box.getCenter(new THREE.Vector3());
            inner.position.copy(cen).multiplyScalar(-1); const norm = new THREE.Group(); norm.add(inner); norm.scale.setScalar(isFinite(mx) && mx > 1e-6 ? big / mx : 1);
            const wrap = new THREE.Group(); wrap.name = 'driver-' + id; wrap.add(norm); wrap.traverse(o => { if (o.isMesh) o.castShadow = true; });
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
