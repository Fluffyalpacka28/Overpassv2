import * as THREE from 'three';
import { buildVeneno, buildVortex, buildApex } from './x9models.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const PAINTS = [
  { name: 'Ember', color: '#ff5a3c' }, { name: 'Glacier', color: '#3cb4ff' }, { name: 'Citrus', color: '#ffc531' },
  { name: 'Jade', color: '#2fd39a' }, { name: 'Orchid', color: '#b06cff' }, { name: 'Ivory', color: '#f1ece2' },
  { name: 'Graphite', color: '#3a3f4b' }, { name: 'Rose', color: '#ff6fae' },
];

// ---------- materials ----------
// A baked reflection map (set from main.js) gives paint, glass and chrome something to reflect.
let ENV = null, ENV_LEVEL = 1;
const mats = {}, liveMats = new Set();
const envOf = m => (m.userData.envK ?? 1) * ENV_LEVEL;
function reg(m, envK) { m.userData.envK = envK; m.envMap = ENV; m.envMapIntensity = envOf(m); liveMats.add(new WeakRef(m)); return m; }
function eachLive(fn) { for (const r of liveMats) { const m = r.deref(); if (!m) liveMats.delete(r); else fn(m); } }
export function setCarEnv(tex) { ENV = tex; eachLive(m => { m.envMap = tex; m.envMapIntensity = envOf(m); m.needsUpdate = true; }); }
export function setCarEnvLevel(k) { if (Math.abs(k - ENV_LEVEL) < 0.02) return; ENV_LEVEL = k; eachLive(m => { m.envMapIntensity = envOf(m); }); }
export function trackCarMat(m) { return reg(m, m.userData.envK ?? 1); } // cloned materials (traffic fade) keep following the light level
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats[key]) { const { envK = 0.6, ...o } = opts; mats[key] = reg(new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o }), envK); }
  return mats[key];
}
function makePaint(color) {
  const m = reg(new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.05 }), 1);
  damageShader(m, 'paint'); return m;
}
// ---------- visible damage: dents that catch the light, scratches down to bare metal, soot; cracked glass ----------
// Each material carries its own uDmg (0 = perfect .. 1 = wrecked); setDamage(car, d) sets it for one car.
const DMG_NOISE = `uniform float uDmg; varying vec3 vDP;
float dH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dH(i), dH(i + vec3(1, 0, 0)), f.x), mix(dH(i + vec3(0, 1, 0)), dH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dH(i + vec3(0, 0, 1)), dH(i + vec3(1, 0, 1)), f.x), mix(dH(i + vec3(0, 1, 1)), dH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function damageShader(m, kind) {
  const U = m.userData.dmg = { value: 0 };
  m.onBeforeCompile = sh => {
    sh.uniforms.uDmg = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DMG_NOISE);
    if (kind === 'paint') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  float dk = 0.0, sc = 0.0;
  if (uDmg > 0.01) {
    // dents: patches where the surface normal is pushed around, so light and reflections ripple over them
    vec3 q = vDP * 2.6; float e = 0.06, n0 = dN(q), dPatch = smoothstep(1.0 - uDmg * 0.9, 1.05 - uDmg * 0.6, dN(vDP * 0.9 + 7.0));
    vec3 gr = vec3(dN(q + vec3(e, 0, 0)) - n0, dN(q + vec3(0, e, 0)) - n0, dN(q + vec3(0, 0, e)) - n0) / e;
    normal = normalize(normal - (mat3(viewMatrix) * gr) * dPatch * 0.55 * uDmg);
    // scratches: thin streaks along the body, then soot and grime
    float st = abs(fract(vDP.z * 9.0 + dN(vDP * vec3(1.5, 6.0, 0.6)) * 3.0) - 0.5);
    sc = smoothstep(0.035, 0.0, st) * smoothstep(1.0 - uDmg * 0.75, 1.0, dN(vDP * 1.7 + 3.0));
    dk = smoothstep(0.55, 0.9, dN(vDP * 1.3 + 11.0)) * uDmg * 0.6;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - dk), vec3(0.62, 0.63, 0.66), sc);`)
        .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n  clearcoatNormal = normalize(mix(clearcoatNormal, normal, 0.85));');
    } else {
      // glass: a web of cracks spreading from a couple of impact points as the damage grows
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uDmg > 0.3) {
    float k = smoothstep(0.3, 1.0, uDmg); vec3 c1 = vec3(0.35, 0.15, 0.4), c2 = vec3(-0.4, 0.25, 0.1); vec3 p = vDP;
    float d1 = length(p - c1), d2 = length(p - c2), d = min(d1, d2); vec3 dir = normalize(p - (d1 < d2 ? c1 : c2) + 1e-4);
    float ang = atan(dir.y + dir.z * 0.5, dir.x) * 6.0, radial = smoothstep(0.08, 0.0, abs(fract(ang / 6.2832 * 9.0 + dN(p * 6.0) * 0.6) - 0.5));
    float rings = smoothstep(0.05, 0.0, abs(fract(d * 9.0 + dN(p * 4.0)) - 0.5)) * 0.6;
    float crack = max(radial, rings) * smoothstep(0.25 + k * 0.9, 0.0, d) * k;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.95), crack * 0.85); diffuseColor.a = max(diffuseColor.a, crack);
  }`);
    }
  };
  m.customProgramCacheKey = () => 'car-dmg-' + kind;
  return m;
}
// how damaged a car looks: 0..1. The glass is shared between cars, so a damaged car gets its own copy; the front bumper sags off
export function setDamage(car, d) {
  const ud = car.mesh.userData; d = Math.max(0, Math.min(1, d)); if (Math.abs((ud.dmgLv ?? -1) - d) < 0.01) return; ud.dmgLv = d;
  if (ud.paint && ud.paint.userData.dmg) ud.paint.userData.dmg.value = d;
  if (d > 0.3 && !ud.dmgGlass) {
    ud.dmgGlass = new Map();
    ud.body.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.glass) { let c = ud.dmgGlass.get(o.material); if (!c) { c = o.material.clone(); c.userData = { ...o.material.userData }; damageShader(c, 'glass'); trackCarMat(c); ud.dmgGlass.set(o.material, c); } o.material = c; } });
  }
  if (ud.dmgGlass) for (const c of ud.dmgGlass.values()) c.userData.dmg.value = d;
  // the lowest parts at the very front: let them hang loose when badly hurt
  if (!ud.bumper) {
    const box = new THREE.Box3(), parts = []; let maxZ = -1e9;
    ud.body.updateMatrixWorld(true); const inv = ud.body.matrixWorld.clone().invert();
    ud.body.traverse(o => { if (!o.isMesh || o === ud.body) return; box.setFromObject(o).applyMatrix4(inv); const c = box.getCenter(new THREE.Vector3()); parts.push({ o, c, h: box.max.y - box.min.y, w: box.max.x - box.min.x }); maxZ = Math.max(maxZ, box.max.z); });
    ud.bumper = parts.filter(p => p.c.z > maxZ - 0.45 && p.c.y < 0.75 && p.w > 0.8 && p.h < 0.6 && p.o.parent === ud.body).map(p => ({ o: p.o, rx: p.o.rotation.x, rz: p.o.rotation.z, y: p.o.position.y }));
  }
  const sag = Math.max(0, (d - 0.55) / 0.45);
  for (const b of ud.bumper) { b.o.rotation.z = b.rz + sag * 0.22; b.o.rotation.x = b.rx + sag * 0.12; b.o.position.y = b.y - sag * 0.12; }
}
const geoCache = new Map();
function cached(key, fn) { let g = geoCache.get(key); if (!g) { g = fn(); geoCache.set(key, g); } return g; }

// ---------- car models ----------
// stats are multipliers on top speed, acceleration and grip (kept close so story races stay fair)
export const MODELS = [
  { id: 'coupe', name: 'Vesper GT', kind: 'Sport coupe', top: 1, accel: 1, grip: 1 },
  { id: 'hatch', name: 'Pocket R', kind: 'Hot hatch', top: 0.93, accel: 1.1, grip: 1.08 },
  { id: 'muscle', name: 'Brute 70', kind: 'Muscle car', top: 1.06, accel: 1.06, grip: 0.88 },
  { id: 'roadster', name: 'Breeze', kind: 'Roadster', top: 0.98, accel: 1.02, grip: 1.1 },
  { id: 'pickup', name: 'Haul XT', kind: 'Pickup truck', top: 0.9, accel: 0.95, grip: 0.95 },
  { id: 'rally', name: 'Gravel Six', kind: 'Rally wagon', top: 0.96, accel: 1.04, grip: 1.04 },
  { id: 'formula', name: 'Apex F', kind: 'Open-wheel', top: 1.08, accel: 1.08, grip: 1.12 },
  { id: 'trail', name: 'Trailbeast', kind: 'Off-road 4x4', top: 0.94, accel: 1.0, grip: 1.0, off: 0 },
  { id: 'monster', name: 'Mudzilla', kind: 'Monster truck', top: 0.9, accel: 1.02, grip: 0.92, off: 0 },
  { id: 'buggy', name: 'Sandflea', kind: 'Dune buggy', top: 0.97, accel: 1.1, grip: 0.98, off: 0 },
  { id: 'hyper', name: 'Volt X', kind: 'Hypercar', top: 1.1, accel: 1.1, grip: 1.08 },
  { id: 'van', name: 'Courier', kind: 'Delivery van', top: 0.86, accel: 0.9, grip: 0.9, off: 0.7 },
  { id: 'bike', name: 'Streak', kind: 'Motorcycle', top: 1.04, accel: 1.12, grip: 0.96 },
  { id: 'veneno', name: 'Veneno X-9', kind: 'Wedge hypercar', top: 1.13, accel: 1.12, grip: 1.1, unlock: 30000 },
  { id: 'vortex', name: 'Vortex GT-R', kind: 'V12 hypercar', top: 1.12, accel: 1.14, grip: 1.12, unlock: 25000 },
  { id: 'apex', name: 'Apex RR', kind: 'Superbike', top: 1.1, accel: 1.18, grip: 1.0, unlock: 15000 },
  { id: 'custom', name: 'Custom frame', kind: 'Your own build', top: 0.92, accel: 0.95, grip: 0.95, off: 1, custom: true },
];
// how much of the off-road slowdown a model feels (1 = full, 0 = none)
MODELS.forEach(m => { if (m.off == null) m.off = m.id === 'rally' ? 0.35 : m.id === 'pickup' ? 0.5 : 1; });
// fuel economy: mpg (the hypercar is electric, so MPGe) and how far a full tank goes in the game world
const MPG = { coupe: 24, hatch: 36, muscle: 14, roadster: 30, pickup: 17, rally: 22, formula: 8, trail: 16, monster: 4, buggy: 20, hyper: 40, van: 18, bike: 52, veneno: 13, vortex: 15, apex: 42 };
MODELS.forEach(m => { m.mpg = MPG[m.id] || 24; m.range = (3000 + m.mpg * 250) * 4; m.electric = m.id === 'hyper'; });

// ---------- the custom frame: a car slot of its own, built up with points in your garage ----------
// You choose its size (the frame it's built on, which your uploaded model is fitted to), gas or electric and its mileage
// (up to the most efficient real cars on sale: 57 mpg for gas, the Toyota Prius; 146 MPGe for electric, the Lucid Air Pure),
// and buy upgrades: speed, acceleration, grip, an off-road kit, a long-range tank and an armoured frame.
export const FRAMES = [['hatch', 'Compact'], ['coupe', 'Standard'], ['rally', 'Wagon'], ['pickup', 'Truck'], ['trail', '4x4'], ['formula', 'Open-wheel'], ['bike', 'Motorcycle']];
export const MPG_MAX = { gas: 57, electric: 146 };
export const CUSTOM_LEVELS = 5;
export const CUSTOM_UPGRADES = {
  speed: { name: 'Engine', unit: 'top speed', step: 0.04, cost: l => 900 * (l + 1) },
  accel: { name: 'Turbo', unit: 'acceleration', step: 0.04, cost: l => 700 * (l + 1) },
  grip: { name: 'Tires', unit: 'grip', step: 0.035, cost: l => 600 * (l + 1) },
};
export const CUSTOM_KITS = {
  offroad: { name: 'Off-road kit', desc: 'No slowdown off the road', cost: 2500 },
  range: { name: 'Long-range tank', desc: '+60% range (bigger tank or battery)', cost: 1500 },
  armor: { name: 'Armoured frame', desc: 'Takes 35% less damage', cost: 3000 },
};
export function cleanCustomBuild(v) {
  v = v && typeof v === 'object' ? v : {};
  const power = v.power === 'electric' ? 'electric' : 'gas', lv = {}, kits = {};
  for (const k in CUSTOM_UPGRADES) lv[k] = Math.max(0, Math.min(CUSTOM_LEVELS, (v.lv && v.lv[k]) | 0));
  for (const k in CUSTOM_KITS) kits[k] = !!(v.kits && v.kits[k]);
  const frame = FRAMES.some(f => f[0] === v.frame) ? v.frame : 'coupe';
  const mpg = Math.max(power === 'electric' ? 60 : 4, Math.min(MPG_MAX[power], Math.round(+v.mpg || (power === 'electric' ? 100 : 30))));
  return { frame, power, mpg, lv, kits };
}
// put a build's numbers onto the custom model entry (everything that drives a custom car reads them from there)
export function setCustomBuild(b) {
  const m = MODELS.find(x => x.id === 'custom'), B = cleanCustomBuild(b);
  m.frame = B.frame; m.build = B;
  m.top = 0.92 + B.lv.speed * CUSTOM_UPGRADES.speed.step; m.accel = 0.95 + B.lv.accel * CUSTOM_UPGRADES.accel.step; m.grip = 0.95 + B.lv.grip * CUSTOM_UPGRADES.grip.step;
  m.off = B.kits.offroad ? 0 : 1; m.armor = B.kits.armor ? 0.65 : 1; m.electric = B.power === 'electric'; m.mpg = B.mpg;
  m.range = (3000 + Math.min(B.mpg, 60) * 250 + Math.max(0, B.mpg - 60) * 90) * 4 * (B.kits.range ? 1.6 : 1);
  return B;
}
setCustomBuild(null);
// motorbikes (two wheels, lean, astride rider)
export const isBike = m => { const b = String(m || '').split('+')[0]; return b === 'bike' || b === 'apex'; };
export const modelById = id => MODELS.find(m => m.id === id) || MODELS[0];

// ---------- body geometry ----------
// Side profile -> rounded silhouette (corner cutting), extruded, narrowed towards the nose / tail and the roof,
// then given smooth normals everywhere except at real creases. This is what makes the bodies read as curved panels.
let CUR = 'coupe';
const BODYD = { smooth: 2, front: 0.14, rear: 0.1, tumble: 0.05 };
const BODYO = {
  muscle: { smooth: 1, front: 0.1, rear: 0.08, tumble: 0.05 }, pickup: { smooth: 0, front: 0.05, rear: 0.03, tumble: 0.03 }, trail: { smooth: 0, front: 0.04, rear: 0.03, tumble: 0.03 },
  monster: { smooth: 0, front: 0.04, rear: 0.03, tumble: 0.03 }, van: { smooth: 0, front: 0.1, rear: 0.02, tumble: 0.03 }, rally: { smooth: 1, front: 0.1, rear: 0.06, tumble: 0.04 },
  formula: { smooth: 1, front: 0.4, rear: 0.25, tumble: 0.1 }, buggy: { smooth: 1, front: 0.2, rear: 0.15, tumble: 0 }, bike: { smooth: 2, front: 0.35, rear: 0.3, tumble: 0 }, hyper: { smooth: 2, front: 0.2, rear: 0.12, tumble: 0.06 },
};
const CABD = { smooth: 1, front: 0.2, rear: 0.16, tumble: 0.12 };
const CABO = { pickup: { smooth: 0, front: 0.06, rear: 0.04, tumble: 0.08 }, trail: { smooth: 0, front: 0.06, rear: 0.04, tumble: 0.08 }, monster: { smooth: 0, front: 0.06, rear: 0.04, tumble: 0.08 }, van: { smooth: 0, front: 0.06, rear: 0.04, tumble: 0.08 } };
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function chaikin(pts, n) {
  for (let k = 0; k < n; k++) { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } pts = out; }
  return pts;
}
function densify(pts, maxL) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxL));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n + (k ? Math.sin(out.length * 1.9) * 0.0006 : 0)]); // tiny offset: no exactly-collinear points for the triangulator
  }
  return out;
}
function extrudeSide(pts, width, material, bevel = 0.08, opts = {}) {
  const o = { ...(material.userData.glass ? (CABO[CUR] || CABD) : (BODYO[CUR] || BODYD)), ...opts };
  const key = JSON.stringify([pts, width, bevel, o, !!material.userData.glass]);
  const geo = cached('body' + key, () => {
    let p = o.smooth ? chaikin(pts, o.smooth) : pts.slice(); p = densify(p, 0.4);
    const sh = new THREE.Shape(); sh.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) sh.lineTo(p[i][0], p[i][1]);
    let g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 1, steps: 1 });
    g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
    g.computeBoundingBox(); const bb = g.boundingBox, zc = (bb.max.z + bb.min.z) / 2, hl = (bb.max.z - bb.min.z) / 2 || 1, y0 = bb.min.y, hy = (bb.max.y - bb.min.y) || 1, pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const zn = (pos.getZ(i) - zc) / hl; let f = 1; f -= zn > 0 ? o.front * ss(0.6, 1, zn) : o.rear * ss(0.6, 1, -zn); f -= o.tumble * ss(0.45, 1, (pos.getY(i) - y0) / hy);
      pos.setX(i, pos.getX(i) * f);
    }
    return toCreasedNormals(g, 0.75);
  });
  const m = new THREE.Mesh(geo, material); m.castShadow = true; return m;
}
function box(w, h, d, material, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function lights(body, zf, zr, yf, yr, sx = 0.62, w = 0.42) {
  const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 }), tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 }), hot = mat('#ff9a9a', { emissive: '#ff4040', emissiveIntensity: 1.9 });
  const hous = mat('#14161c', { roughness: 0.5 }), chr = mat('#d9dde4', { metalness: 1, roughness: 0.12, envK: 1.4 });
  const tag = (m, k) => { m.userData.stockLamp = k; return m; }; // 'h' = headlight part, 't' = taillight part (see carlights.js)
  [-sx, sx].forEach(x => {
    tag(box(w + 0.07, 0.17, 0.05, hous, x, yf, zf - 0.01, body), 'h'); tag(box(w, 0.1, 0.06, head, x, yf, zf + 0.012, body), 'h'); tag(box(w * 0.9, 0.018, 0.065, chr, x, yf + 0.07, zf + 0.012, body), 'h');
    tag(box(w + 0.1, 0.15, 0.05, hous, x, yr, zr + 0.01, body), 't'); tag(box(w + 0.03, 0.09, 0.06, tail, x, yr, zr - 0.012, body), 't'); tag(box(w * 0.32, 0.055, 0.066, hot, x - Math.sign(x) * w * 0.22, yr, zr - 0.016, body), 't');
  });
}
function mirrors(body, P, paint, x, y, z) { [-1, 1].forEach(s => { box(0.1, 0.12, 0.21, paint, s * x, y, z, body); box(0.16, 0.035, 0.05, P.dark, s * (x - 0.1), y - 0.05, z - 0.03, body); }); }
function doors(body, P, hw, y0, y1, cuts, handles, hy) {
  [-1, 1].forEach(s => {
    cuts.forEach(z => box(0.035, y1 - y0, 0.02, P.line, s * hw, (y0 + y1) / 2, z, body));
    box(0.035, 0.02, Math.abs(cuts[0] - cuts[cuts.length - 1]), P.line, s * hw, y0, (cuts[0] + cuts[cuts.length - 1]) / 2, body);
    handles.forEach(z => box(0.045, 0.03, 0.17, P.chrome, s * (hw + 0.005), hy, z, body));
  });
}
function exhaustTip(body, P, x, y, z) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.24, 14, 1, true), mat('#d9dde4', { metalness: 1, roughness: 0.15, envK: 1.4, side: THREE.DoubleSide })); t.rotation.x = Math.PI / 2; t.position.set(x, y, z - 0.06); body.add(t);
  const c = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), P.dark); c.rotation.y = Math.PI; c.position.set(x, y, z + 0.04); body.add(c);
}

// ---------- wheels ----------
// style: [spokes (0 = solid cover), rim colour]
const WSTYLE = { coupe: [5, '#cfd4dc'], hatch: [5, '#d7dbe2'], muscle: [5, '#e6e9ee'], roadster: [6, '#cfd4dc'], pickup: [6, '#2b2e36'], rally: [5, '#d9b455'], formula: [0, '#23262e'], trail: [6, '#1f2128'], monster: [8, '#1f2128'], buggy: [4, '#e8c24a'], hyper: [10, '#1b1e25'], veneno: [10, '#9eacc0'], vortex: [10, '#2a3140'], apex: [10, '#29303e'], van: [5, '#b9bec7'], bike: [7, '#c9ced8'] };
function tireGeo(rr, ww) {
  return cached(`tire${rr}_${ww}`, () => {
    const rim = rr * 0.6, hw = ww / 2;
    const pts = [[rim * 0.97, -hw * 0.92], [rr * 0.84, -hw], [rr * 0.95, -hw * 0.84], [rr * 0.995, -hw * 0.55], [rr, -hw * 0.25], [rr, hw * 0.25], [rr * 0.995, hw * 0.55], [rr * 0.95, hw * 0.84], [rr * 0.84, hw], [rim * 0.97, hw * 0.92]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 28); g.rotateZ(Math.PI / 2); return g;
  });
}
// rim parts for one side: [metal (spokes, lip, hub), dark (face, brake disc)]
function rimGeos(rr, ww, n, sg) {
  return cached(`rim${rr}_${ww}_${n}_${sg}`, () => {
    const rim = rr * 0.6, hw = ww / 2, metal = [], dark = [];
    const lip = new THREE.TorusGeometry(rim * 0.98, Math.max(0.018, ww * 0.05), 6, 28); lip.rotateY(Math.PI / 2); lip.translate(sg * hw * 0.88, 0, 0); metal.push(lip);
    const hub = new THREE.CylinderGeometry(rim * 0.17, rim * 0.17, 0.06, 12); hub.rotateZ(Math.PI / 2); hub.translate(sg * hw * 0.9, 0, 0); metal.push(hub);
    const face = new THREE.CircleGeometry(rim * 0.97, 28); face.rotateY(sg * Math.PI / 2); face.translate(sg * hw * (n ? 0.74 : 0.86), 0, 0); dark.push(face);
    if (n) {
      const disc = new THREE.CylinderGeometry(rim * 0.8, rim * 0.8, 0.025, 28); disc.rotateZ(Math.PI / 2); disc.translate(sg * hw * 0.5, 0, 0); dark.push(disc);
      const L = rim * 0.88;
      for (let i = 0; i < n; i++) { const sp = new THREE.BoxGeometry(0.04, L, rim * (n > 7 ? 0.1 : 0.2)); sp.translate(0, L / 2, 0); sp.rotateX(i / n * Math.PI * 2); sp.translate(sg * hw * 0.86, 0, 0); metal.push(sp); }
    } else { const cover = new THREE.CircleGeometry(rim * 0.5, 20); cover.rotateY(sg * Math.PI / 2); cover.translate(sg * hw * 0.9, 0, 0); metal.push(cover); }
    const out = [mergeGeometries(metal), mergeGeometries(dark)]; metal.forEach(g => g.dispose()); dark.forEach(g => g.dispose()); return out;
  });
}
// ---------- floaties: red-and-white life rings in place of the tyres (the floatation upgrade) ----------
// one ring sits on the axle (axis x) and spins with the wheel; 8 alternating red / white bands, rope bindings on the white ones
function ringGeo(rr) {
  return cached(`floaty${rr}`, () => {
    const R = rr * 0.7, tube = rr * 0.3, g = new THREE.TorusGeometry(R, tube, 14, 48), p = g.attributes.position, col = new Float32Array(p.count * 3);
    const red = new THREE.Color('#e3262b'), white = new THREE.Color('#f6f3ec');
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)), band = Math.floor(((a / (Math.PI * 2) + 1) % 1) * 8), c = band % 2 ? white : red; col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.rotateY(Math.PI / 2); return g;
  });
}
function ropeGeo(rr) {
  return cached(`floatyRope${rr}`, () => {
    const R = rr * 0.7, tube = rr * 0.3, parts = [];
    for (let k = 0; k < 4; k++) { // a little rope wrap around the tube in the middle of each white band
      const a = (k * 2 + 1.5) / 8 * Math.PI * 2, t = new THREE.TorusGeometry(tube * 1.04, Math.max(0.008, rr * 0.022), 6, 18);
      t.rotateY(Math.PI / 2); t.rotateZ(a + Math.PI / 2); t.translate(Math.cos(a) * R, Math.sin(a) * R, 0); parts.push(t); // its axis along the tube
    }
    const out = mergeGeometries(parts); parts.forEach(q => q.dispose()); out.rotateY(Math.PI / 2); return out;
  });
}
// The rings live in their own 'floaties' group on the car (like the wings), so they still show over an uploaded custom model,
// which hides the stock wheels. Each frame they copy the wheel's position, steering and spin. Call every frame.
// cfg (optional): { s: size multiplier, out: metres further out sideways, up: metres up, spread: metres further forward (front) / back (rear) }
export function setFloaties(mesh, on, cfg) {
  const ud = mesh.userData; if (!ud.wheels) return;
  if (!!ud.floaties !== !!on) {
    const ringM = mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0, envK: 0.5 }), ropeM = mat('#d9c9a0', { roughness: 0.9, envK: 0.2 });
    if (on) try {
      const fg = new THREE.Group(); fg.name = 'floaties'; mesh.add(fg); ud.floatG = fg;
      for (const w of ud.wheels) {
        w.hidden = []; for (const o of [...w.spin.children, ...w.pivot.children]) if (o !== w.spin && o.visible) { o.visible = false; w.hidden.push(o); }
        const piv = new THREE.Group(), spin = new THREE.Group(); piv.add(spin); fg.add(piv);
        const ring = new THREE.Mesh(ringGeo(w.r), ringM), rope = new THREE.Mesh(ropeGeo(w.r), ropeM); ring.castShadow = true; spin.add(ring, rope);
        w.fl = { piv, spin };
      }
    } catch (e) { // undo a half-built set so the stock wheels stay visible
      if (ud.floatG) mesh.remove(ud.floatG); ud.floatG = null;
      for (const w of ud.wheels) { if (w.hidden) w.hidden.forEach(o => { o.visible = true; }); w.hidden = null; w.fl = null; }
      throw e;
    } else {
      if (ud.floatG) mesh.remove(ud.floatG); ud.floatG = null;
      for (const w of ud.wheels) { if (w.hidden) w.hidden.forEach(o => { o.visible = true; }); w.hidden = null; w.fl = null; }
    }
    ud.floaties = !!on; // only once it's all built, so a failure is retried instead of leaving bare wheels
  }
  if (on && ud.floatG) {
    if (ud.floatG.parent !== mesh) mesh.add(ud.floatG);
    const c = cfg || {}, sc = c.s || 1, out = c.out || 0, up = c.up || 0, spread = c.spread || 0, inf = c.inflate ?? 1;
    // deflated: the rings go flat and saggy and the tyres show through again
    const wk = sc * (0.3 + 0.7 * inf), rk = sc * (0.86 + 0.14 * inf), sag = (1 - inf) * 0.08, tyres = inf < 0.55;
    for (const w of ud.wheels) if (w.fl) {
      const pp = w.pivot.position, sx = Math.abs(pp.x) < 0.05 ? 0 : Math.sign(pp.x), sz = Math.sign(pp.z) || 0;
      w.fl.piv.position.set(pp.x + sx * out, pp.y + up - sag, pp.z + sz * spread); w.fl.piv.rotation.copy(w.pivot.rotation);
      w.fl.spin.rotation.copy(w.spin.rotation); w.fl.spin.scale.set(wk, rk, rk * (1 - 0.06 * (1 - inf)));
      if (w.hidden && w.tyresShown !== tyres) { w.tyresShown = tyres; for (const o of w.hidden) o.visible = tyres; }
    }
  }
}
function addWheels(g, list, model = 'coupe', r = 0.42, w = 0.34) {
  const wheels = [], [spokes, rimCol] = WSTYLE[model] || [5, '#c9ced8'];
  const tireM = mat('#15171c', { roughness: 0.92, envK: 0.15, side: THREE.DoubleSide }), metalM = mat(rimCol, { metalness: 0.9, roughness: 0.22, envK: 1.3, side: THREE.DoubleSide }), darkM = mat('#20232a', { roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }), calM = mat('#c8322c', { roughness: 0.4 });
  list.forEach(([x, z, rr = r, ww = w]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, rr, z); const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(tireGeo(rr, ww), tireM); tire.castShadow = true; spin.add(tire);
    const sides = Math.abs(x) < 0.05 ? [1, -1] : [Math.sign(x)];
    for (const sg of sides) {
      const [mg, dg] = rimGeos(rr, ww, spokes, sg); spin.add(new THREE.Mesh(mg, metalM), new THREE.Mesh(dg, darkM));
      if (rr < 0.6) { const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, rr * 0.22, rr * 0.34), calM); cal.position.set(sg * ww / 2 * 0.62, rr * 0.3, -rr * 0.12); pivot.add(cal); }
    }
    g.add(pivot); wheels.push({ pivot, spin, front: z > 0, r: rr });
  });
  return wheels;
}
const BUILDERS = {
  vortex(body, paint) { const v = buildVortex(paint, m => trackCarMat(m)); body.add(v.group); return v.wheels; },
  apex(body, paint) { const v = buildApex(paint, m => trackCarMat(m)); body.add(v.group); return v.wheels; },
  veneno(body, paint) { const v = buildVeneno(paint, m => trackCarMat(m)); body.add(v.group); return v.wheels; },
  coupe(body, paint, P) {
    body.add(extrudeSide([[-2.15, 0.35], [2.2, 0.35], [2.3, 0.62], [1.9, 0.92], [0.7, 1.0], [-1.6, 1.02], [-2.2, 0.95], [-2.25, 0.55]], 1.86, paint));
    const cab = extrudeSide([[-1.35, 0], [0.9, 0], [0.15, 0.6], [-1.05, 0.62], [-1.5, 0.05]], 1.5, P.glass, 0.05); cab.position.y = 1.0; body.add(cab);
    box(1.42, 0.08, 1.05, paint, 0, 1.64, -0.42, body);
    box(1.9, 0.07, 0.42, P.dark, 0, 1.34, -2.05, body); [-0.7, 0.7].forEach(x => box(0.08, 0.3, 0.2, P.dark, x, 1.17, -2.0, body));
    lights(body, 2.27, -2.27, 0.72, 0.86); box(0.34, 0.02, 4.2, P.white, 0, 1.035, 0.02, body); box(1.1, 0.16, 0.05, P.dark, 0, 0.5, 2.3, body);
    return [[-0.93, 1.38], [0.93, 1.38], [-0.93, -1.38], [0.93, -1.38]];
  },
  hatch(body, paint, P) {
    body.add(extrudeSide([[-1.75, 0.32], [1.8, 0.32], [1.9, 0.6], [1.6, 0.92], [0.7, 1.0], [-1.7, 1.02], [-1.8, 0.6]], 1.76, paint));
    const cab = extrudeSide([[-1.7, 0], [0.75, 0], [0.05, 0.72], [-1.6, 0.74], [-1.72, 0.1]], 1.56, P.glass, 0.05); cab.position.y = 1.0; body.add(cab);
    box(1.5, 0.08, 1.7, paint, 0, 1.78, -0.78, body); box(1.5, 0.05, 0.3, P.dark, 0, 1.8, -1.72, body);
    [-0.62, 0.62].forEach(x => box(0.05, 0.06, 1.5, P.dark, x, 1.85, -0.75, body)); // roof rails
    lights(body, 1.87, -1.82, 0.72, 0.9, 0.58, 0.36); box(1.0, 0.18, 0.05, P.dark, 0, 0.52, 1.92, body);
    box(0.06, 0.32, 3.2, P.white, 0.9, 0.62, 0, body); box(0.06, 0.32, 3.2, P.white, -0.9, 0.62, 0, body);
    return [[-0.88, 1.15, 0.38, 0.3], [0.88, 1.15, 0.38, 0.3], [-0.88, -1.15, 0.38, 0.3], [0.88, -1.15, 0.38, 0.3]];
  },
  muscle(body, paint, P) {
    body.add(extrudeSide([[-2.35, 0.38], [2.45, 0.38], [2.5, 0.72], [2.3, 0.98], [0.5, 1.05], [-1.9, 1.05], [-2.4, 1.0], [-2.45, 0.6]], 2.0, paint));
    const cab = extrudeSide([[-1.6, 0], [0.45, 0], [-0.15, 0.52], [-1.2, 0.54], [-1.75, 0.05]], 1.6, P.glass, 0.05); cab.position.y = 1.05; body.add(cab);
    box(1.52, 0.08, 1.0, paint, 0, 1.6, -0.68, body);
    box(0.7, 0.18, 0.9, P.dark, 0, 1.12, 1.4, body); // hood scoop
    [-0.28, 0.28].forEach(x => box(0.24, 0.02, 4.7, P.white, x, 1.07, 0, body));
    box(1.95, 0.09, 0.22, paint, 0, 1.14, -2.35, body); // ducktail
    lights(body, 2.52, -2.47, 0.74, 0.8, 0.7, 0.36); box(1.5, 0.22, 0.05, P.dark, 0, 0.6, 2.52, body); box(2.06, 0.12, 0.12, P.chrome, 0, 0.42, 2.5, body); box(2.06, 0.12, 0.12, P.chrome, 0, 0.42, -2.48, body);
    [-0.5, 0.5].forEach(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), P.chrome); e.rotation.x = Math.PI / 2; e.position.set(x, 0.42, -2.55); body.add(e); });
    return [[-1.0, 1.55, 0.42, 0.34], [1.0, 1.55, 0.42, 0.34], [-1.02, -1.5, 0.47, 0.44], [1.02, -1.5, 0.47, 0.44]];
  },
  roadster(body, paint, P) {
    body.add(extrudeSide([[-2.0, 0.32], [2.05, 0.32], [2.15, 0.58], [1.7, 0.86], [0.4, 0.92], [-0.4, 0.9], [-1.95, 0.95], [-2.05, 0.55]], 1.8, paint));
    const ws = box(1.5, 0.42, 0.06, P.glass, 0, 1.12, 0.32, body); ws.rotation.x = -0.45;
    const seat = mat('#3b2a24', { roughness: 0.8 });
    [-0.4, 0.4].forEach(x => { box(0.55, 0.12, 0.55, seat, x, 0.95, -0.35, body); box(0.55, 0.5, 0.12, seat, x, 1.18, -0.66, body); });
    [-0.4, 0.4].forEach(x => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 12, Math.PI), P.chrome); h.position.set(x, 1.18, -0.85); body.add(h); });
    box(1.5, 0.1, 0.9, P.dark, 0, 0.93, -0.5, body); // cockpit floor
    lights(body, 2.17, -2.07, 0.66, 0.8, 0.6, 0.38); box(0.9, 0.12, 0.05, P.dark, 0, 0.46, 2.16, body);
    box(1.7, 0.03, 1.2, paint, 0, 0.955, -1.5, body);
    return [[-0.9, 1.32, 0.4, 0.3], [0.9, 1.32, 0.4, 0.3], [-0.9, -1.3, 0.4, 0.32], [0.9, -1.3, 0.4, 0.32]];
  },
  pickup(body, paint, P) {
    body.add(extrudeSide([[-2.5, 0.55], [2.45, 0.55], [2.5, 1.05], [2.3, 1.3], [1.15, 1.35], [-2.5, 1.35]], 2.0, paint, 0.06));
    const cab = extrudeSide([[-0.5, 0], [1.05, 0], [0.55, 0.78], [-0.4, 0.8], [-0.55, 0.05]], 1.8, P.glass, 0.05); cab.position.y = 1.35; body.add(cab);
    box(1.82, 0.1, 1.0, paint, 0, 2.17, 0.05, body);
    // bed
    box(1.9, 0.08, 1.9, P.dark, 0, 1.38, -1.5, body);
    [-0.97, 0.97].forEach(x => box(0.07, 0.45, 1.95, paint, x, 1.6, -1.5, body)); box(1.98, 0.45, 0.07, paint, 0, 1.6, -2.48, body);
    const lb = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.2 }); box(1.4, 0.12, 0.14, P.dark, 0, 2.3, 0.4, body); for (let i = -2; i <= 2; i++) box(0.18, 0.08, 0.04, lb, i * 0.28, 2.3, 0.48, body);
    lights(body, 2.52, -2.52, 1.0, 1.1, 0.68, 0.4); box(1.6, 0.4, 0.05, P.chrome, 0, 0.82, 2.52, body); box(2.05, 0.18, 0.18, P.dark, 0, 0.6, 2.5, body);
    return [[-1.0, 1.6, 0.52, 0.42], [1.0, 1.6, 0.52, 0.42], [-1.0, -1.6, 0.52, 0.42], [1.0, -1.6, 0.52, 0.42]];
  },
  rally(body, paint, P) {
    body.add(extrudeSide([[-2.1, 0.5], [2.15, 0.5], [2.25, 0.8], [1.95, 1.08], [0.85, 1.15], [-2.05, 1.18], [-2.15, 0.75]], 1.84, paint));
    const cab = extrudeSide([[-2.0, 0], [0.9, 0], [0.2, 0.7], [-1.9, 0.72], [-2.02, 0.1]], 1.62, P.glass, 0.05); cab.position.y = 1.15; body.add(cab);
    box(1.6, 0.08, 2.05, paint, 0, 1.92, -0.88, body);
    box(1.8, 0.07, 0.4, P.dark, 0, 1.98, -2.0, body); [-0.7, 0.7].forEach(x => box(0.07, 0.14, 0.2, P.dark, x, 1.92, -1.95, body));
    const spot = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 });
    box(1.3, 0.1, 0.12, P.dark, 0, 2.02, 0.15, body); [-0.45, -0.15, 0.15, 0.45].forEach(x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), spot); c.rotation.x = Math.PI / 2; c.position.set(x, 2.1, 0.22); body.add(c); });
    [-0.85, 0.85].forEach(x => box(0.3, 0.32, 0.03, P.dark, x, 0.5, -1.85, body)); // mudflaps
    box(0.06, 0.5, 1.4, P.white, 0.94, 0.85, 0.2, body); box(0.06, 0.5, 1.4, P.white, -0.94, 0.85, 0.2, body);
    lights(body, 2.27, -2.17, 0.88, 1.0, 0.6, 0.38); box(1.2, 0.2, 0.05, P.dark, 0, 0.66, 2.27, body);
    return [[-0.92, 1.35, 0.46, 0.36], [0.92, 1.35, 0.46, 0.36], [-0.92, -1.35, 0.46, 0.36], [0.92, -1.35, 0.46, 0.36]];
  },
  formula(body, paint, P) {
    body.add(extrudeSide([[-2.0, 0.22], [2.3, 0.22], [2.45, 0.32], [1.2, 0.62], [0.2, 0.75], [-0.9, 0.95], [-1.8, 0.82], [-2.05, 0.5]], 0.8, paint, 0.06));
    [-0.62, 0.62].forEach(x => body.add(Object.assign(extrudeSide([[-1.4, 0.22], [0.6, 0.22], [0.5, 0.58], [-1.3, 0.62]], 0.45, paint, 0.04), {}))); // sidepods
    body.children.slice(-2).forEach((m, i) => m.position.x = i ? 0.62 : -0.62);
    box(0.5, 0.35, 0.6, P.dark, 0, 0.95, -0.3, body).userData.rider = true; // cockpit/driver
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#f4f4f4', { roughness: 0.4 })); helmet.position.set(0, 1.12, -0.2); helmet.userData.rider = true; body.add(helmet);
    box(2.1, 0.06, 0.42, paint, 0, 0.3, 2.35, body); [-1.02, 1.02].forEach(x => box(0.05, 0.22, 0.5, P.dark, x, 0.36, 2.35, body)); // front wing
    box(1.7, 0.08, 0.5, P.dark, 0, 1.25, -2.05, body); [-0.85, 0.85].forEach(x => box(0.05, 0.6, 0.6, P.dark, x, 1.0, -2.05, body)); // rear wing
    box(0.12, 0.45, 0.1, P.dark, 0, 1.0, -1.9, body);
    const tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.4 }); box(0.2, 0.1, 0.05, tail, 0, 0.55, -2.08, body);
    return [[-1.0, 1.55, 0.38, 0.38], [1.0, 1.55, 0.38, 0.38], [-1.0, -1.45, 0.44, 0.5], [1.0, -1.45, 0.44, 0.5]];
  },
  trail(body, paint, P) {
    // lifted 4x4: boxy body, fender flares, roof rack + light bar, bull bar, spare wheel
    body.add(extrudeSide([[-2.2, 0.85], [2.25, 0.85], [2.3, 1.35], [2.1, 1.6], [1.0, 1.68], [-2.2, 1.7]], 1.95, paint, 0.06));
    const cab = extrudeSide([[-2.1, 0], [0.95, 0], [0.6, 0.85], [-2.05, 0.88], [-2.12, 0.05]], 1.8, P.glass, 0.04); cab.position.y = 1.7; body.add(cab);
    box(1.86, 0.1, 2.95, paint, 0, 2.63, -0.6, body);
    [-0.85, 0.85].forEach(x => box(0.06, 0.18, 2.6, P.dark, x, 2.78, -0.6, body)); for (let i = 0; i < 4; i++) box(1.75, 0.05, 0.06, P.dark, 0, 2.86, -1.7 + i * 0.75, body);
    const lb = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); box(1.6, 0.16, 0.14, P.dark, 0, 2.86, 0.8, body); box(1.5, 0.1, 0.05, lb, 0, 2.86, 0.88, body);
    [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]].forEach(([x, z]) => box(0.28, 0.16, 1.35, P.dark, x, 1.32, z, body)); // flares
    box(2.0, 0.14, 0.14, P.dark, 0, 0.95, 2.4, body); [-0.55, 0.55].forEach(x => box(0.1, 0.65, 0.1, P.dark, x, 1.25, 2.42, body)); box(1.2, 0.1, 0.1, P.dark, 0, 1.55, 2.42, body); // bull bar
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), mat('#16181e', { roughness: 0.9 })); sp.rotation.x = Math.PI / 2; sp.position.set(0, 1.45, -2.38); body.add(sp);
    box(1.6, 0.35, 4.2, P.dark, 0, 0.7, 0, body); // chassis
    lights(body, 2.32, -2.24, 1.35, 1.4, 0.68, 0.36);
    return [[-1.05, 1.5, 0.62, 0.52], [1.05, 1.5, 0.62, 0.52], [-1.05, -1.5, 0.62, 0.52], [1.05, -1.5, 0.62, 0.52]];
  },
  monster(body, paint, P) {
    // pickup body perched on a tall frame and giant tyres
    const y0 = 1.75;
    body.add(Object.assign(extrudeSide([[-2.3, y0], [2.3, y0], [2.35, y0 + 0.5], [2.15, y0 + 0.72], [1.0, y0 + 0.76], [-2.3, y0 + 0.76]], 2.1, paint, 0.06), {}));
    const cab = extrudeSide([[-0.6, 0], [0.95, 0], [0.5, 0.75], [-0.5, 0.78], [-0.62, 0.05]], 1.9, P.glass, 0.04); cab.position.y = y0 + 0.76; body.add(cab);
    box(1.92, 0.1, 1.05, paint, 0, y0 + 1.56, 0.12, body);
    box(2.0, 0.08, 1.7, P.dark, 0, y0 + 0.8, -1.4, body); [-1.02, 1.02].forEach(x => box(0.07, 0.4, 1.75, paint, x, y0 + 1.0, -1.4, body));
    box(1.1, 0.35, 4.4, P.dark, 0, 1.25, 0, body); [-1.6, 1.6].forEach(z => box(2.4, 0.18, 0.2, P.dark, 0, 1.05, z, body)); // frame + axles
    [[-0.9, 1.7], [0.9, 1.7], [-0.9, -1.7], [0.9, -1.7]].forEach(([x, z]) => { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), P.chrome); sh.position.set(x, 1.45, z); sh.rotation.z = x > 0 ? -0.35 : 0.35; body.add(sh); });
    lights(body, 2.37, -2.32, y0 + 0.45, y0 + 0.5, 0.72, 0.4);
    const lb = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); for (let i = -2; i <= 2; i++) box(0.22, 0.14, 0.06, lb, i * 0.34, y0 + 1.66, 0.62, body);
    return [[-1.4, 1.7, 1.05, 0.85], [1.4, 1.7, 1.05, 0.85], [-1.4, -1.7, 1.05, 0.85], [1.4, -1.7, 1.05, 0.85]];
  },
  buggy(body, paint, P) {
    // open tube-frame dune buggy
    body.add(extrudeSide([[-1.4, 0.45], [1.6, 0.45], [1.95, 0.75], [1.2, 0.85], [-1.3, 0.9], [-1.5, 0.7]], 1.3, paint, 0.05));
    const tube = mat('#22252c', { metalness: 0.5, roughness: 0.4 });
    const bar = (x0, y0, z0, x1, y1, z1) => { const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 6), tube); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()); m.castShadow = true; body.add(m); };
    [-0.6, 0.6].forEach(x => { bar(x, 0.85, 0.9, x * 0.85, 1.9, 0.1); bar(x * 0.85, 1.9, 0.1, x * 0.85, 1.9, -0.9); bar(x * 0.85, 1.9, -0.9, x, 0.9, -1.35); });
    bar(-0.51, 1.9, 0.1, 0.51, 1.9, 0.1); bar(-0.51, 1.9, -0.9, 0.51, 1.9, -0.9);
    const seat = mat('#3b2a24', { roughness: 0.8 }); [-0.3, 0.3].forEach(x => { box(0.45, 0.12, 0.5, seat, x, 0.95, -0.3, body); box(0.45, 0.6, 0.1, seat, x, 1.25, -0.6, body); });
    box(0.8, 0.5, 0.7, P.dark, 0, 1.05, -1.1, body); [-0.2, 0.2].forEach(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), P.chrome); e.rotation.x = Math.PI / 2; e.position.set(x, 1.0, -1.6); body.add(e); });
    const spot = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); [-0.3, 0.3].forEach(x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), spot); c.rotation.x = Math.PI / 2; c.position.set(x, 1.95, 0.18); body.add(c); });
    const tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 }); [-0.5, 0.5].forEach(x => box(0.15, 0.1, 0.05, tail, x, 0.8, -1.52, body));
    return [[-0.95, 1.3, 0.48, 0.34], [0.95, 1.3, 0.48, 0.34], [-1.0, -1.2, 0.6, 0.5], [1.0, -1.2, 0.6, 0.5]];
  },
  hyper(body, paint, P) {
    body.add(extrudeSide([[-2.3, 0.3], [2.35, 0.3], [2.45, 0.45], [1.6, 0.72], [0.4, 0.98], [-0.9, 1.0], [-2.2, 0.85], [-2.35, 0.5]], 2.0, paint));
    const cab = extrudeSide([[-1.0, 0], [0.75, 0], [0.0, 0.42], [-0.8, 0.42], [-1.15, 0.05]], 1.35, P.glass, 0.05); cab.position.y = 0.95; body.add(cab);
    box(1.9, 0.05, 0.45, P.dark, 0, 1.3, -2.15, body); [-0.7, 0.7].forEach(x => box(0.06, 0.32, 0.18, P.dark, x, 1.12, -2.05, body));
    [-1.01, 1.01].forEach(x => box(0.06, 0.25, 1.1, P.dark, x, 0.6, -0.4, body)); // side intakes
    const strip = mat('#7cf3ff', { emissive: '#3ad8ff', emissiveIntensity: 1.8 }); [-1.02, 1.02].forEach(x => box(0.03, 0.04, 3.6, strip, x, 0.36, 0, body));
    lights(body, 2.4, -2.37, 0.55, 0.74, 0.72, 0.5); box(1.8, 0.05, 0.05, mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.4 }), 0, 0.74, -2.38, body);
    return [[-0.98, 1.45, 0.4, 0.34], [0.98, 1.45, 0.4, 0.34], [-1.0, -1.45, 0.43, 0.42], [1.0, -1.45, 0.43, 0.42]];
  },
  van(body, paint, P) {
    body.add(extrudeSide([[-2.6, 0.45], [2.55, 0.45], [2.6, 1.0], [2.3, 1.35], [1.6, 2.5], [-2.6, 2.55]], 2.05, paint, 0.06));
    const ws = box(1.85, 0.95, 0.06, P.glass, 0, 1.9, 1.97, body); ws.rotation.x = 0.55;
    [-1.04, 1.04].forEach(x => box(0.06, 0.6, 0.9, P.glass, x, 1.75, 1.45, body));
    box(0.06, 1.5, 3.0, P.white, 1.04, 1.6, -0.9, body); box(0.06, 1.5, 3.0, P.white, -1.04, 1.6, -0.9, body); // side panels for livery
    box(0.06, 0.25, 3.0, paint, 1.06, 1.6, -0.9, body); box(0.06, 0.25, 3.0, paint, -1.06, 1.6, -0.9, body);
    box(0.04, 1.9, 0.04, P.dark, 0, 1.5, -2.63, body); box(2.1, 0.12, 0.2, P.dark, 0, 0.55, -2.6, body);
    lights(body, 2.62, -2.62, 0.95, 1.3, 0.72, 0.36); box(1.6, 0.3, 0.05, P.dark, 0, 0.7, 2.6, body);
    return [[-0.95, 1.75, 0.46, 0.36], [0.95, 1.75, 0.46, 0.36], [-0.95, -1.7, 0.46, 0.36], [0.95, -1.7, 0.46, 0.36]];
  },
  bike(body, paint, P) {
    // sport bike with a rider; leans into corners
    body.add(extrudeSide([[-0.9, 0.5], [0.9, 0.55], [1.05, 0.9], [0.65, 1.15], [-0.15, 1.08], [-0.95, 1.0]], 0.42, paint, 0.04));
    box(0.32, 0.06, 0.7, mat('#22252c'), 0, 1.06, -0.55, body); // seat
    const ws = box(0.4, 0.3, 0.04, P.glass, 0, 1.28, 0.78, body); ws.rotation.x = -0.6;
    box(0.6, 0.06, 0.06, P.dark, 0, 1.18, 0.38, body); box(0.06, 0.06, 0.26, P.dark, 0, 1.15, 0.5, body); // bars on a short riser
    const suit = mat('#24262e', { roughness: 0.7 });
    const torso = box(0.42, 0.6, 0.32, suit, 0, 1.45, -0.1, body); torso.rotation.x = 0.7; torso.userData.rider = true;
    [-0.18, 0.18].forEach(x => { const l = box(0.14, 0.14, 0.6, suit, x, 1.05, -0.2, body); l.rotation.x = -0.2; const a = box(0.11, 0.11, 0.5, suit, x * 1.4, 1.5, 0.28, body); a.rotation.x = 0.6; l.userData.rider = a.userData.rider = true; });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat('#f4f4f4', { roughness: 0.35 })); helmet.position.set(0, 1.78, 0.22); helmet.userData.rider = true; body.add(helmet);
    box(0.3, 0.08, 0.05, P.glass, 0, 1.78, 0.4, body).userData.rider = true;
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), P.chrome); e.rotation.x = Math.PI / 2 - 0.3; e.position.set(0.18, 0.7, -0.85); body.add(e);
    const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 }), tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 });
    box(0.2, 0.12, 0.06, head, 0, 1.0, 1.06, body); box(0.18, 0.08, 0.05, tail, 0, 1.02, -0.97, body);
    return [[0, 0.78, 0.36, 0.16], [0, -0.78, 0.36, 0.2]];
  },
};

// ---------- per-model finishing touches (placed from the real body bounds, so they sit on the surface) ----------
const DOORS = {
  coupe: { y: [0.42, 0.95], cuts: [0.95, -0.6], h: [-0.4], hy: 0.84 }, hatch: { y: [0.4, 0.95], cuts: [0.85, -0.1, -1.05], h: [-0.2, -1.0], hy: 0.84 },
  muscle: { y: [0.45, 1.0], cuts: [0.75, -0.7], h: [-0.5], hy: 0.9 }, roadster: { y: [0.42, 0.86], cuts: [0.5, -0.55], h: [-0.4], hy: 0.84 },
  pickup: { y: [0.62, 1.3], cuts: [0.95, 0.2, -0.5], h: [0.0, -0.4], hy: 1.12 }, rally: { y: [0.55, 1.1], cuts: [0.9, -0.2, -1.3], h: [-0.05, -1.15], hy: 0.95 },
  trail: { y: [0.95, 1.6], cuts: [0.95, 0.0, -1.0], h: [-0.15, -1.1], hy: 1.4 },
};
const MIRRORS = { coupe: [1.02, 1.08, 0.7], hatch: [0.97, 1.07, 0.65], muscle: [1.06, 1.1, 0.4], roadster: [0.98, 1.0, 0.3], pickup: [1.07, 1.5, 0.95], rally: [1.0, 1.25, 0.8], trail: [1.08, 1.85, 0.85], van: [1.15, 1.55, 2.0], monster: [1.12, 2.7, 1.0] };
const GRILLE = { coupe: [1.1, 0.16], hatch: [0.95, 0.16], muscle: [1.45, 0.2], pickup: [1.5, 0.3], rally: [1.2, 0.2], trail: [1.4, 0.3], van: [1.5, 0.28] };
const EXHAUST = { coupe: [-0.55, 0.55], hatch: [0.5], roadster: [-0.5, 0.5], rally: [0.6], hyper: [-0.45, 0.45], pickup: [0.72], van: [0.62] };
const SKIRT = new Set(['coupe', 'hatch', 'muscle', 'roadster', 'hyper', 'rally']);
const NOPLATE = new Set(['formula', 'buggy', 'bike', 'monster', 'veneno', 'vortex', 'apex']);
const NOLIP = new Set(['formula', 'monster', 'buggy', 'bike', 'trail', 'veneno', 'vortex', 'apex']);
function finish(model, body, paint, P, wl) {
  const main = body.children[0]; if (!main) return;
  main.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(main), hw = bb.max.x, zf = bb.max.z, zr = bb.min.z, y0 = bb.min.y;
  // wheel arch lips
  if (!NOLIP.has(model)) for (const [x, z, rr = 0.42, ww = 0.34] of wl) {
    const lip = new THREE.Mesh(cached(`lip${rr}`, () => { const t = new THREE.TorusGeometry(rr + 0.07, 0.035, 6, 16, Math.PI); t.rotateY(Math.PI / 2); return t; }), P.trim);
    lip.position.set(Math.sign(x) * (Math.abs(x) + ww / 2 - 0.04), rr, z); lip.castShadow = true; body.add(lip);
  }
  const d = DOORS[model]; if (d) doors(body, P, hw + 0.005, d.y[0], d.y[1], d.cuts, d.h, d.hy);
  const m = MIRRORS[model]; if (m) mirrors(body, P, paint, m[0], m[1], m[2]);
  if (SKIRT.has(model) && wl.length > 3) { const zs = wl.map(w => w[1]), zlo = Math.min(...zs) + 0.5, zhi = Math.max(...zs) - 0.5; [-1, 1].forEach(s => box(0.06, 0.1, zhi - zlo, P.trim, s * (hw - 0.01), y0 + 0.16, (zlo + zhi) / 2, body)); }
  const g = GRILLE[model]; if (g) { box(g[0], g[1], 0.06, P.trim, 0, y0 + 0.3, zf - 0.005, body); for (let i = -1; i <= 1; i++) box(g[0] * 0.92, 0.016, 0.07, P.chrome, 0, y0 + 0.3 + i * g[1] * 0.3, zf, body); }
  if (!NOPLATE.has(model)) {
    const pm = mat('#f4f2ea', { roughness: 0.6 }), ink = mat('#2a3a66', { roughness: 0.6 });
    box(0.52, 0.13, 0.03, pm, 0, y0 + 0.13, zf + 0.005, body); box(0.4, 0.045, 0.034, ink, 0, y0 + 0.13, zf + 0.008, body);
    box(0.52, 0.13, 0.03, pm, 0, y0 + 0.4, zr - 0.005, body); box(0.4, 0.045, 0.034, ink, 0, y0 + 0.4, zr - 0.008, body);
  }
  const ex = EXHAUST[model]; if (ex) ex.forEach(x => exhaustTip(body, P, x, y0 + 0.13, zr));
}

// Build a car mesh for a model. Faces +Z.
// the contact shadow's soft shape (shared): a rounded oblong with darker spots where the tyres meet the road
let CONTACT = null;
function contactTex() {
  if (CONTACT) return CONTACT;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  // stacked, shrinking ovals give a soft edge without canvas blur filters (which older Safari lacks)
  for (let i = 0; i < 14; i++) { const k = i / 13; x.fillStyle = 'rgba(255,255,255,0.055)'; x.beginPath(); x.ellipse(32, 64, 30 - k * 14, 62 - k * 22, 0, 0, 7); x.fill(); }
  for (const [px, py] of [[17, 32], [47, 32], [17, 96], [47, 96]]) { const g = x.createRadialGradient(px, py, 0, px, py, 13); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - 13, py - 13, 26, 26); }
  CONTACT = new THREE.CanvasTexture(c); CONTACT.colorSpace = THREE.SRGBColorSpace;
  // the texture's white is the shadow's strength: use it as an alpha mask
  CONTACT.format = THREE.RGBAFormat; return CONTACT;
}
export function buildCarMesh(color = '#ff5a3c', model = 'coupe') {
  if (model === 'custom') model = modelById('custom').frame || 'coupe'; // the custom frame is built on the frame size you picked
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = makePaint(color);
  const P = { dark: mat('#1d2029'), trim: mat('#101218', { roughness: 0.6 }), line: mat('#0c0d12', { roughness: 0.8 }), glass: mat('#16222e', { roughness: 0.04, metalness: 0.7, emissive: '#0b1a28', emissiveIntensity: 0.35, envK: 1.6, transparent: true, opacity: 0.6 }), white: mat('#ffffff', { roughness: 0.5 }), chrome: mat('#d9dde4', { metalness: 1, roughness: 0.12, envK: 1.4 }) }; P.glass.userData.glass = true;
  CUR = BUILDERS[model] ? model : 'coupe';
  const build = BUILDERS[CUR];
  const wl = build(body, paint, P);
  try { finish(CUR, body, paint, P, wl); } catch (e) { console.warn('car finish', e); }
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const wheels = addWheels(g, wl, CUR);
  const len = { hatch: 4.2, muscle: 5.4, pickup: 5.4, van: 5.4, monster: 5.6, buggy: 3.8, bike: 2.4, apex: 2.3, vortex: 4.6 }[model] || 5, bw = { monster: 3.6, bike: 0.9, apex: 0.8, trail: 2.9 }[model] || 2.6;
  // soft contact shadow: darkest right under the car and its four tyres, fading out past the bodywork (grounds the car)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(bw * 1.3, len * 1.18), new THREE.MeshBasicMaterial({ color: 0x000000, map: contactTex(), transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.renderOrder = 1; g.add(blob);
  g.userData = { body, wheels, paint, model, lean: isBike(model) ? 0.42 : 0 };
  return g;
}

export function setPaint(mesh, color) { mesh.userData.baseColor = color; if (mesh.userData.paint.map) return; mesh.userData.paint.color.set(color); }

// Arcade car model. Forward is (sin yaw, cos yaw) in XZ.
export class Car {
  constructor(color, model = 'coupe') {
    this.mesh = buildCarMesh(color, model); this.model = model; this.stats = modelById(model);
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.wheelSpin = 0; this.slip = 0; this.offroad = false;
    this.boost = 1; this.boosting = false;
    this.maxSpeed = 52; this.accel = 19; this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.prevAccel = 0;
  }
  setModel(model) {
    if (model === this.model) return;
    const old = this.mesh, parent = old.parent, color = old.userData.paint.map ? (old.userData.baseColor || '#ff5a3c') : old.userData.paint.color.getStyle();
    const m = buildCarMesh(color, model);
    for (const c of [...old.children]) if (c.isSprite) m.add(c); // keep name tags
    if (parent) { parent.remove(old); parent.add(m); }
    old.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.mesh = m; this.model = model; this.stats = modelById(model); this.sync(0);
  }
  get fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get speed() { const [fx, fz] = this.fwd; return this.vx * fx + this.vz * fz; }
  place(x, z, yaw, y = null) { this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.vy = 0; this.gvy = null; this.lastVy = 0; if (y != null) { this.y = y; this.air = false; } this.sync(0); }
  update(dt, surfaceGrip = 1) {
    const inp = this.input;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx; // right vector
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    const off = this.offroad;
    const pw = this.power ?? 1; // 0 = out of gas: the engine limps along so you can still reach a station
    const ring = this.ringBoost > 0; if (ring) this.ringBoost = Math.max(0, this.ringBoost - dt); // flew/drove through a boost ring: free nitrous for a few seconds
    this.boosting = ring || (inp.boost && this.boost > 0.02 && inp.throttle > 0 && pw > 0.5);
    if (this.boosting && !this.infBoost && !ring) this.boost = Math.max(0, this.boost - dt * 0.33 * (this.nitroDrain || 1)); else if (this.infBoost) this.boost = 1; else this.boost = Math.min(1, this.boost + dt * 0.05);
    const st = this.stats || MODELS[0], pen = off ? (st.off ?? 1) : 0, top = (this.boosting ? this.maxSpeed * (this.nitroTop || 1.28) * (ring ? 1.45 : 1) : this.maxSpeed) * st.top * (1 - 0.45 * pen) * (0.22 + 0.78 * pw);
    let a = 0;
    const thr = Math.max(inp.throttle, ring && inp.brake <= 0 ? 0.7 : 0);
    if (thr > 0) { const k = 1 - Math.max(0, vF) / top; a += thr * this.accel * st.accel * (this.boosting ? (this.nitroPush || 1.6) : 1) * (ring ? 2.2 : 1) * (0.3 + 0.7 * pw) * Math.max(-0.5, k); }
    if (inp.brake > 0) { if (vF > 1) a -= inp.brake * 34; else a -= inp.brake * 10 * (vF > -12 ? 1 : 0); }
    if (inp.handbrake) a -= Math.sign(vF) * 6;
    vF += a * dt;
    vF -= vF * (0.12 + 0.78 * pen) * dt; // drag (off-road models barely notice grass and dirt)
    if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3 * dt);
    // lateral grip
    const grip = (inp.handbrake ? 1.6 : 9) * st.grip * surfaceGrip * (1 - 0.3 * pen);
    vR *= Math.exp(-grip * dt);
    this.slip = Math.abs(vR) + (inp.handbrake ? Math.abs(vF) * 0.15 : 0);
    // steering
    const target = inp.steer;
    this.steer += (target - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vF);
    const steerRate = 2.3 * Math.min(1, sp / 7) * (1 - 0.5 * Math.min(1, sp / 60)) * (inp.handbrake ? 1.45 : 1);
    this.yaw += this.steer * steerRate * dt * Math.sign(vF || 1);
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nrx = nfz, nrz = -nfx;
    this.vx = nfx * vF + nrx * vR; this.vz = nfz * vF + nrz * vR;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.prevAccel = a;
    this.sync(dt, vF, vR);
  }
  sync(dt, vF = this.speed, vR = 0) {
    const m = this.mesh; m.position.set(this.x, this.y || 0, this.z); if (m.rotation.order !== 'YXZ') m.rotation.order = 'YXZ'; const ln = m.userData.lean && !this.noLean ? -this.steer * Math.min(1, Math.abs(vF) / 18) * m.userData.lean : 0; this.lean = (this.lean || 0) + (ln - (this.lean || 0)) * Math.min(1, dt * 8); m.rotation.set((this.pitch || 0) + (this.stuntP || 0), this.yaw, (this.roll || 0) + this.lean + (this.stunt || 0) + (this.side || 0));
    if (this.stunt) { const h = 0.75, a = this.stunt, sx = h * Math.sin(a); m.position.x += sx * Math.cos(this.yaw); m.position.z -= sx * Math.sin(this.yaw); m.position.y += h * (1 - Math.cos(a)); }
    // up on two wheels: tipped about the wheels that stay down (sideX: that side's x), the rest of the car lifts with it
    if (this.side) { const a = this.side, px = this.sideX || 0, ox = px - px * Math.cos(a), oy = -px * Math.sin(a); m.position.x += ox * Math.cos(this.yaw); m.position.z -= ox * Math.sin(this.yaw); m.position.y += oy; }
    if (this.stuntP) { const h = 0.75, a = this.stuntP, dz = -h * Math.sin(a); m.position.x += dz * Math.sin(this.yaw); m.position.z += dz * Math.cos(this.yaw); m.position.y += h * (1 - Math.cos(a)); } // barrel roll: spin about the middle of the car, not its wheels
    const { body, wheels } = m.userData;
    body.rotation.z += ((-vR * 0.02 - this.steer * Math.min(1, Math.abs(vF) / 30) * 0.05) - body.rotation.z) * Math.min(1, dt * 6);
    body.rotation.x += ((-this.prevAccel * 0.0025) - body.rotation.x) * Math.min(1, dt * 5);
    this.wheelSpin += vF * dt / 0.42;
    wheels.forEach(w => { w.spin.rotation.x = this.wheelSpin * 0.42 / (w.r || 0.42); if (w.front) w.pivot.rotation.y = this.steer * 0.45; });
  }
  // guard rail: slide along it with a little bounce, keep most speed, swing the nose along the rail. Returns impact speed.
  bumpRail(nx, nz) {
    const vn = this.vx * nx + this.vz * nz; if (vn >= 0) return 0;
    const imp = -vn; this.vx -= 1.15 * vn * nx; this.vz -= 1.15 * vn * nz;
    const k = 1 - Math.min(0.3, imp * 0.025); this.vx *= k; this.vz *= k;
    if (this.speed > 3) { let d = Math.atan2(this.vx, this.vz) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(0.5, 0.15 + imp * 0.02); }
    return imp;
  }
  bump(nx, nz, restitution = 0.35) {
    // reflect velocity along normal n (pointing away from obstacle)
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) { this.vx -= (1 + restitution) * vn * nx; this.vz -= (1 + restitution) * vn * nz; this.vx *= 0.8; this.vz *= 0.8; return -vn; }
    return 0;
  }
}

// Name tag sprite above cars
export function nameTag(text, color = '#ffffff', img = null, hp = null) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 96;
  const x = c.getContext('2d'); x.font = '600 30px Satoshi, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle';
  const tw = Math.min(200, x.measureText(text).width), w = tw + (img ? 92 : 58), l = (320 - w) / 2;
  x.fillStyle = 'rgba(16,14,30,.78)'; x.beginPath(); x.roundRect(l, 10, w, 60, 30); x.fill();
  if (img) {
    x.save(); x.beginPath(); x.arc(l + 32, 40, 24, 0, Math.PI * 2); x.clip(); x.drawImage(img, l + 8, 16, 48, 48); x.restore();
    x.strokeStyle = color; x.lineWidth = 4; x.beginPath(); x.arc(l + 32, 40, 25, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.fillText(text, l + 66, 41, 200);
  } else {
    x.fillStyle = color; x.beginPath(); x.arc(l + 26, 40, 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillText(text, l + 42, 41, 200);
  }
  if (hp != null) { // health bar under the name pill
    const f = Math.max(0, Math.min(1, hp / 100)), bw = 150, bl = (320 - bw) / 2;
    x.fillStyle = 'rgba(16,14,30,.78)'; x.beginPath(); x.roundRect(bl - 3, 73, bw + 6, 14, 7); x.fill();
    if (f > 0) { x.fillStyle = f > 0.5 ? '#4fd18b' : f > 0.25 ? '#ffc531' : '#ff4a3a'; x.beginPath(); x.roundRect(bl, 76, Math.max(8, bw * f), 8, 4); x.fill(); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(6, 1.8, 1); s.position.y = 3.4; s.renderOrder = 10;
  return s;
}
