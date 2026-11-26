import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The X-9 family, rebuilt from the player's own model files (same shapes, sizes and colours):
//   FALCON X-9 stealth jet and TRITON X-9 jet sub (Federation patrols), VENENO X-9 wedge hypercar (a car you unlock).
// Changes for the game: refractive canopy glass becomes plain see-through glass (the refraction costs a whole extra
// render pass), particle trails and helper lights are left out, and every part that never moves is merged per material
// so a model is a dozen or so draw calls instead of a hundred-plus.

function hullTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#4a4a4a'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  x.fillStyle = '#a8a8a8'; for (let a = 4; a < 256; a += 32) for (let b = 4; b < 256; b += 32) { x.fillRect(a, b, 2, 2); x.fillRect(a + 24, b, 2, 2); x.fillRect(a, b + 24, 2, 2); x.fillRect(a + 24, b + 24, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}
let BUMP = null;
// the shared palette. metal: how mirror-like (lower for things with no reflection map to show)
function palette(metal = 1) {
  BUMP = BUMP || hullTexture();
  const S = (o) => new THREE.MeshStandardMaterial(o);
  return {
    hull: S({ color: 0x1d2c3e, roughness: 0.38, metalness: 0.65 * metal, bumpMap: BUMP, bumpScale: 0.012 }),
    armor: S({ color: 0x2c3d52, roughness: 0.45, metalness: 0.55 * metal, bumpMap: BUMP, bumpScale: 0.008 }),
    amber: S({ color: 0xf59e0b, roughness: 0.32, metalness: 0.25 }),
    ti: S({ color: 0x9eacc0, roughness: 0.26, metalness: 0.88 * metal }),
    carbon: S({ color: 0x0b1017, roughness: 0.55, metalness: 0.35 }),
    tire: S({ color: 0x14181f, roughness: 0.85, metalness: 0.05 }),
    glass: S({ color: 0x38bdf8, emissive: 0x062840, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }),
    core: S({ color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.1 }),
    flood: S({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 2.8, roughness: 0.1 }),
    red: S({ color: 0xff2a2a, emissive: 0xff1e1e, emissiveIntensity: 2.0 }),
    green: S({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 2.0 }),
    missile: S({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.5 }),
    hud: new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.68, side: THREE.DoubleSide }),
    plume: () => new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  };
}
const V2 = a => a.map(([x, y]) => new THREE.Vector2(x, y));
function kit(root) {
  const add = (geo, mat, p, r, s, parent = root) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); parent.add(m); return m; };
  const grp = (p, r, parent = root) => { const g = new THREE.Group(); if (p) g.position.set(...p); if (r) g.rotation.set(...r); parent.add(g); return g; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const shape = (pts) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath(); return sh; };
  const ext = (sh, depth, bev, segs = 2) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs });
  return { add, grp, box, shape, ext };
}
// merge everything that doesn't move (anything under a node marked userData.keep stays as it is)
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh) return; let p = o, keep = false; while (p && p !== root) { if (p.userData.keep) { keep = true; break; } p = p.parent; } if (keep) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material; (groups.get(key) || groups.set(key, []).get(key)).push({ g, tag: o.userData.tag }); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const [mat, list] of groups) {
    const geo = mergeGeometries(list.map(x => x.g), false); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); const tag = list.find(x => x.tag); if (tag) m.userData.stockLamp = tag.tag; root.add(m);
  }
  return root;
}

// ---------- FALCON X-9 stealth jet (nose +Z) ----------
export function buildJet() {
  const M = palette(0.55), root = new THREE.Group(); root.name = 'Falcon_X9_Stealth_Jet'; const { add, grp, box, shape, ext } = kit(root);
  const fuse = new THREE.LatheGeometry(V2([[0, -3.25], [0.22, -3.1], [0.46, -2.35], [0.62, -1.25], [0.68, -0.1], [0.64, 0.95], [0.5, 1.85], [0.32, 2.55], [0.13, 3.12], [0, 3.38]]), 36);
  fuse.rotateX(Math.PI / 2); fuse.scale(1.24, 0.72, 1); add(fuse, M.hull);
  add(new THREE.ConeGeometry(0.28, 0.95, 24), M.carbon, [0, -0.02, 2.95], [Math.PI / 2, 0, 0], [1.18, 1, 0.78]);
  add(new THREE.CylinderGeometry(0.008, 0.024, 0.48, 12), M.ti, [0, -0.02, 3.62], [Math.PI / 2, 0, 0]);
  add(box(0.56, 0.24, 3.25), M.armor, [0, 0.44, -0.65]); add(box(0.22, 0.04, 0.42), M.amber, [0, 0.565, -0.25]);
  for (const s of [-1, 1]) { const g = ext(shape([[0, 0], [s * 0.58, -1.65], [0, -1.75]]), 0.07, 0.02); g.rotateX(Math.PI / 2); add(g, M.armor, [s * 0.42, 0.06, 1.85]); }
  add(box(0.5, 0.22, 1.5), M.carbon, [0, 0.37, 1.04]); add(box(0.54, 0.04, 1.54), M.armor, [0, 0.47, 1.04]);
  const seat = grp([0, 0.46, 0.84]); add(box(0.24, 0.06, 0.24), M.carbon, [0, 0.02, 0.06], null, null, seat); add(box(0.24, 0.22, 0.08), M.armor, [0, 0.11, -0.04], [-0.22, 0, 0], null, seat); add(box(0.15, 0.075, 0.09), M.amber, [0, 0.235, -0.075], [-0.22, 0, 0], null, seat);
  add(new THREE.PlaneGeometry(0.2, 0.11), M.hud, [0, 0.59, 1.44], [-0.38, 0, 0]);
  const can = grp([0, 0.48, 1.86]); const cg = new THREE.SphereGeometry(0.44, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52); cg.scale(0.76, 0.78, 1.94);
  const gl = add(cg, M.glass, [0, -0.01, -0.82], null, null, can); gl.userData.keep = true; gl.renderOrder = 2;
  add(new THREE.TorusGeometry(0.34, 0.022, 10, 24, Math.PI), M.ti, [0, 0.01, -0.78], null, [0.96, 0.98, 1], can);
  for (const s of [-1, 1]) {
    const wg = ext(shape([[0, 0], [s * 2.85, -1.65], [s * 2.85, -2.18], [0, -2.05]]), 0.08, 0.025, 3); wg.rotateX(Math.PI / 2); add(wg, M.armor, [s * 0.72, 0.04, 0.35]);
    add(box(0.95, 0.09, 0.14), M.amber, [s * 2.15, 0, -1.15], [0, s * -0.45, 0]);
    add(box(1.45, 0.035, 0.26), M.ti, [s * 2.05, 0, -1.89]); // aileron (neutral)
    add(box(0.06, 0.08, 1.05), M.ti, [s * 3.58, 0, -1.55]);
    const ms = grp([s * 3.66, 0, -1.48]); add(new THREE.CylinderGeometry(0.042, 0.042, 1.38, 14), M.missile, null, [Math.PI / 2, 0, 0], null, ms); add(new THREE.ConeGeometry(0.042, 0.22, 14), M.amber, [0, 0, 0.8], [Math.PI / 2, 0, 0], null, ms);
    for (let f = 0; f < 2; f++) add(box(0.22, 0.015, 0.16), M.carbon, [0, 0, -0.54], [0, 0, f * Math.PI / 2 + Math.PI / 4], null, ms);
    add(new THREE.SphereGeometry(0.045, 10, 10), s < 0 ? M.red : M.green, [s * 3.58, 0.06, -1.05]);
    const vt = grp([s * 0.56, 0.34, -1.55], [0, 0, s * -0.34]); const tg = ext(shape([[0, 0], [1.35, 0], [1.78, 1.18], [1.22, 1.18], [0.22, 0.12]]), 0.065, 0.018); tg.rotateY(Math.PI / 2);
    add(tg, M.armor, [-0.032, 0, 0], null, null, vt); add(box(0.08, 0.11, 0.58), M.amber, [0, 1.12, -1.48], null, null, vt);
    const sg = ext(shape([[0, 0], [s * 1.18, -0.55], [s * 1.18, -0.88], [0, -0.78]]), 0.05, 0.015); sg.rotateX(Math.PI / 2); add(sg, M.hull, [s * 0.68, 0.02, -2.55]);
    // engines
    const pod = grp([s * 0.44, -0.06, -0.35]);
    add(box(0.46, 0.36, 1.35), M.hull, [s * 0.16, -0.02, 0.85], [0, 0, s * -0.15], null, pod);
    add(box(0.48, 0.38, 0.08), M.ti, [s * 0.16, -0.02, 1.52], [0.22, 0, s * -0.15], null, pod);
    add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20), M.carbon, [s * 0.16, -0.02, 1.18], [Math.PI / 2, 0, 0], null, pod);
    const fan = grp([s * 0.16, -0.02, 1.24], null, pod); fan.name = (s < 0 ? 'Port' : 'Starboard') + '_Compressor_Fan'; fan.userData.keep = true;
    add(new THREE.ConeGeometry(0.055, 0.14, 14), M.ti, [0, 0, 0.05], [Math.PI / 2, 0, 0], null, fan);
    for (let b = 0; b < 14; b++) { const a = b / 14 * Math.PI * 2; add(box(0.015, 0.13, 0.06), M.ti, [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0], [0, 0.55, a], null, fan); }
    add(new THREE.CylinderGeometry(0.29, 0.23, 0.62, 24, 1, true), M.ti, [0, 0, -2.68], [Math.PI / 2, 0, 0], null, pod);
    add(new THREE.CylinderGeometry(0.24, 0.19, 0.6, 24, 1, true), M.carbon, [0, 0, -2.68], [Math.PI / 2, 0, 0], null, pod);
    add(new THREE.TorusGeometry(0.285, 0.02, 10, 24), M.amber, [0, 0, -2.42], null, null, pod);
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.52, 18), M.core, [0, 0, -2.62], [Math.PI / 2, 0, 0], null, pod);
    const L = 1.15, pl = add(new THREE.ConeGeometry(0.19, 1.45, 20, 1, true), M.plume(), [0, 0, -2.85 - 0.72 * L], [-Math.PI / 2, 0, 0], [1.1, L, 1.1], pod); pl.userData.keep = true;
  }
  return finishModel(mergeStatic(root));
}

// ---------- TRITON X-9 jet sub (nose +Z) ----------
export function buildSub() {
  const M = palette(0.55), root = new THREE.Group(); root.name = 'Triton_X9_Jet_Submarine'; const { add, grp, box, shape, ext } = kit(root);
  const hull = new THREE.LatheGeometry(V2([[0, -3.15], [0.14, -3.05], [0.32, -2.55], [0.54, -1.75], [0.68, -0.8], [0.74, 0.15], [0.71, 0.95], [0.6, 1.75], [0.42, 2.35], [0.18, 2.72], [0, 2.82]]), 36);
  hull.rotateX(Math.PI / 2); hull.scale(1.22, 0.84, 1); add(hull, M.hull);
  add(box(0.54, 0.28, 3.45), M.armor, [0, 0.56, -0.35]);
  const vs = ext(shape([[0, 0], [1.35, 0], [1.75, 1.05], [1.15, 1.05], [0.25, 0.15]]), 0.08, 0.02, 3); vs.rotateY(Math.PI / 2); add(vs, M.armor, [-0.04, 0.42, -1.35]);
  add(box(0.13, 0.11, 0.62), M.amber, [0, 1.28, -2.76]);
  add(box(0.42, 0.22, 3.1), M.carbon, [0, -0.58, 0.15]); add(new THREE.CylinderGeometry(0.18, 0.24, 0.95, 20), M.ti, [0, -0.56, 1.65], [Math.PI / 2, 0, 0]);
  add(box(0.58, 0.26, 1.45), M.carbon, [0, 0.52, 0.95]); add(box(0.36, 0.34, 0.42), M.armor, [0, 0.62, 0.72]);
  add(new THREE.PlaneGeometry(0.26, 0.14), M.hud, [0, 0.76, 1.32], [-0.35, 0, 0]);
  const can = grp([0, 0.6, 1.72]); const cg = new THREE.SphereGeometry(0.46, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52); cg.scale(0.76, 0.68, 1.85);
  const gl = add(cg, M.glass, [0, -0.04, -0.78], null, null, can); gl.userData.keep = true; gl.renderOrder = 2;
  add(new THREE.TorusGeometry(0.36, 0.026, 10, 24, Math.PI), M.ti, [0, 0, -0.72], null, [0.95, 0.85, 1], can);
  for (const s of [-1, 1]) {
    const wg = ext(shape([[0, 0], [s * 1.95, -0.85], [s * 1.95, -1.28], [0, -1.35]]), 0.09, 0.025, 3); wg.rotateX(Math.PI / 2); add(wg, M.armor, [s * 0.68, 0.02, 0.35]);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.68, 14), M.ti, [s * 2.63, 0, -0.72], [Math.PI / 2, 0, 0]);
    add(new THREE.SphereGeometry(0.058, 12, 12), s < 0 ? M.red : M.green, [s * 2.63, 0, -0.36]);
    add(box(0.62, 0.04, 0.28), M.amber, [s * 0.86, 0.05, 1.57]);
    const af = grp([s * 0.34, -0.14, -2.42], [0, 0, s * -0.45]); add(box(0.75, 0.045, 0.38), M.armor, [s * 0.36, 0, -0.08], null, null, af);
    const nac = grp([s * 1.18, 0.08, -1.15]);
    add(box(0.55, 0.14, 0.72), M.carbon, [-s * 0.26, 0, 0.15], null, null, nac);
    const sh = new THREE.LatheGeometry(V2([[0.24, -0.95], [0.31, -0.72], [0.36, -0.25], [0.38, 0.45], [0.34, 0.82], [0.27, 0.82], [0.28, 0.1], [0.21, -0.95]]), 28); sh.rotateX(Math.PI / 2); add(sh, M.hull, null, null, null, nac);
    add(new THREE.TorusGeometry(0.31, 0.036, 12, 28), M.ti, [0, 0, 0.81], null, null, nac);
    add(new THREE.CylinderGeometry(0.305, 0.265, 0.18, 24, 1, true), M.amber, [0, 0, -0.82], [Math.PI / 2, 0, 0], null, nac);
    add(new THREE.CylinderGeometry(0.09, 0.05, 1.35, 16), M.ti, null, [Math.PI / 2, 0, 0], null, nac);
    const rot = grp([0, 0, 0.18], null, nac); rot.name = (s < 0 ? 'Port' : 'Starboard') + '_Impeller_Rotor'; rot.userData.keep = true;
    for (let b = 0; b < 7; b++) { const a = b / 7 * Math.PI * 2; add(box(0.025, 0.22, 0.16), M.ti, [Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0], [0, 0.58, a], null, rot); }
    add(new THREE.CylinderGeometry(0.16, 0.19, 0.45, 18), M.core, [0, 0, -0.68], [Math.PI / 2, 0, 0], [1, 1.05, 1], nac);
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.26, 16), M.ti, [s * 0.48, -0.22, 2.08], [Math.PI / 2, 0, 0]);
    add(new THREE.CircleGeometry(0.068, 16), M.flood, [s * 0.48, -0.22, 2.212]);
  }
  return finishModel(mergeStatic(root));
}
function finishModel(root) { root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); return root; }

// ---------- VENENO X-9 wedge hypercar (a player car; nose +Z, wheels at y = 0) ----------
// paint: the car's paint material (takes the hull's place so your paint colour works); track: registers a material for
// the game's reflections. Returns { group, wheels: [[x, z, radius, width], ...] } (the game fits its own turning wheels).
export const VENENO_SCALE = 1.1;
export function buildVeneno(paint, track = m => m) {
  const M = palette(1); for (const k of ['armor', 'ti', 'carbon', 'amber']) track(M[k]);
  M.glass = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x041e30, emissiveIntensity: 0.15, roughness: 0.05, metalness: 0.12, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }); track(M.glass);
  const drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x38bdf8, emissiveIntensity: 2.8, roughness: 0.1 });
  const doorLed = drl.clone();
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1e1e, emissiveIntensity: 2.6, roughness: 0.15 });
  const exh = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 2.0, roughness: 0.2 });
  const H = paint; // hull primary = your paint
  const root = new THREE.Group(); root.name = 'Veneno_X9'; const { add, grp, box, shape, ext } = kit(root);
  // 1. wedge monocoque with the cabin carved open
  const sp = new THREE.Shape();
  sp.moveTo(-2.38, 0.16); sp.lineTo(-1.85, 0.44); sp.lineTo(-0.92, 0.6); sp.lineTo(-0.84, 0.56); sp.lineTo(-0.76, 0.22); sp.lineTo(0.46, 0.22); sp.lineTo(0.56, 0.54); sp.lineTo(0.58, 0.9);
  sp.lineTo(2.15, 0.86); sp.lineTo(2.26, 0.46); sp.lineTo(2.08, 0.16); sp.lineTo(1.96, 0.16); sp.absarc(1.48, 0.4, 0.48, -0.45, Math.PI + 0.45, false);
  sp.lineTo(0.96, 0.14); sp.lineTo(-0.96, 0.14); sp.lineTo(-1.04, 0.16); sp.absarc(-1.46, 0.36, 0.43, -0.45, Math.PI + 0.45, false); sp.lineTo(-2.22, 0.16); sp.closePath();
  const body = new THREE.ExtrudeGeometry(sp, { depth: 1.48, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.018, bevelSegments: 3 }); body.rotateY(Math.PI / 2);
  add(body, H, [-0.74, 0, 0]);
  add(box(1.66, 0.05, 4.35), M.carbon, [0, 0.16, -0.05]); add(box(1.94, 0.035, 0.56), M.carbon, [0, 0.14, 2.24]); add(box(1.96, 0.02, 0.06), M.amber, [0, 0.145, 2.51]); add(box(0.05, 0.16, 0.48), M.armor, [0, 0.22, 2.24]);
  const arch = (R0, R1, d, b) => { const s = new THREE.Shape(); s.absarc(0, 0, R0, -0.22, Math.PI + 0.22, false); s.absarc(0, 0, R1, Math.PI + 0.22, -0.22, true); s.closePath(); const g = ext(s, d, b); g.rotateY(Math.PI / 2); return g; };
  for (const s of [-1, 1]) {
    add(arch(0.5, 0.42, 0.32, 0.015), M.armor, [s * 0.85 - 0.16, 0.36, 1.46]);
    add(new THREE.CylinderGeometry(0.425, 0.425, 0.31, 24, 1, true, -0.25, Math.PI + 0.5), M.carbon, [s * 0.85, 0.36, 1.46], [0, 0, Math.PI / 2]);
    add(box(0.28, 0.03, 0.42), M.carbon, [s * 0.36, 0.46, 1.48], [0.2, 0, 0]); add(box(0.08, 0.02, 0.92), M.amber, [s * 0.22, 0.475, 1.42], [0.19, 0, 0]);
    const y = grp([s * 0.68, 0.36, 2.16], [0.22, s * 0.34, 0]);
    add(box(0.26, 0.024, 0.04), drl, null, null, null, y).userData.tag = 'h'; add(box(0.16, 0.022, 0.04), drl, [s * 0.14, 0.045, -0.02], [0, 0, s * 0.55], null, y); add(box(0.16, 0.022, 0.04), drl, [s * 0.14, -0.045, -0.02], [0, 0, s * -0.55], null, y);
    add(box(0.26, 0.34, 1.15), M.carbon, [s * 0.84, 0.36, -0.38], [0, s * -0.1, 0]); add(box(0.06, 0.32, 0.72), M.amber, [s * 0.94, 0.36, -0.35], [-0.32, 0, 0]);
    add(arch(0.58, 0.47, 0.38, 0.018), M.armor, [s * 0.88 - 0.19, 0.4, -1.48]);
    add(new THREE.CylinderGeometry(0.475, 0.475, 0.37, 26, 1, true, -0.25, Math.PI + 0.5), M.carbon, [s * 0.88, 0.4, -1.48], [0, 0, Math.PI / 2]);
    add(box(0.18, 0.06, 1.88), M.carbon, [s * 0.92, 0.14, 0]);
  }
  // 2. glass, pillars, roof, interior (wheel on the game's driver side, +X)
  add(new THREE.PlaneGeometry(1.3, 0.88), M.glass, [0, 0.77, 0.52], [-1.1, 0, 0]).userData.glass = true;
  for (const s of [-1, 1]) { add(box(0.055, 0.045, 0.88), H, [s * 0.67, 0.77, 0.52], [0.46, s * -0.09, 0]); add(box(0.065, 0.36, 0.14), H, [s * 0.68, 0.74, -0.54], [0, 0, s * 0.24]); }
  add(box(1.24, 0.04, 0.84), H, [0, 0.94, -0.2], [-0.05, 0, 0]); add(box(0.34, 0.11, 0.58), M.armor, [0, 0.99, -0.42]); add(box(0.28, 0.07, 0.06), M.carbon, [0, 0.99, -0.12]);
  add(box(1.38, 0.16, 0.34), M.carbon, [0, 0.52, 0.68], [0.14, 0, 0]); add(box(0.22, 0.16, 1.05), M.armor, [0, 0.3, 0.06]); add(box(0.1, 0.02, 0.65), M.amber, [0, 0.385, 0.08]);
  add(box(0.32, 0.11, 0.22), H, [0.35, 0.61, 0.62]); add(new THREE.PlaneGeometry(0.26, 0.075), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), [0.35, 0.6, 0.508], [0, Math.PI, 0]);
  add(new THREE.CylinderGeometry(0.022, 0.026, 0.22, 12), M.ti, [0.35, 0.55, 0.46], [Math.PI / 2 - 0.32, 0, 0]); add(new THREE.TorusGeometry(0.115, 0.016, 10, 24), M.carbon, [0.35, 0.58, 0.36], [-0.32, 0, 0]);
  for (const s of [-1, 1]) {
    const st = grp([s * 0.35, 0.23, 0.04]);
    add(box(0.34, 0.07, 0.38), M.carbon, [0, 0.035, 0.08], null, null, st);
    for (const b of [-1, 1]) { add(box(0.055, 0.11, 0.36), M.armor, [b * 0.155, 0.065, 0.08], null, null, st); add(box(0.055, 0.38, 0.11), M.armor, [b * 0.155, 0.24, -0.07], [-0.26, 0, 0], null, st); add(box(0.032, 0.34, 0.02), M.amber, [b * 0.065, 0.24, -0.045], [-0.26, 0, 0], null, st); }
    add(box(0.28, 0.42, 0.075), M.carbon, [0, 0.23, -0.09], [-0.26, 0, 0], null, st); add(box(0.19, 0.11, 0.085), M.amber, [0, 0.46, -0.155], [-0.26, 0, 0], null, st);
  }
  // 3. scissor doors (shut), windows, mirrors
  for (const s of [-1, 1]) {
    const d = grp([s * 0.84, 0.48, 0.62]);
    add(box(0.08, 0.36, 1.18), M.armor, [0, -0.12, -0.58], null, null, d); add(box(0.09, 0.036, 0.94), M.amber, [0, -0.01, -0.58], null, null, d); add(box(0.098, 0.022, 0.9), doorLed, [0, -0.055, -0.58], null, null, d);
    add(new THREE.PlaneGeometry(0.98, 0.32), M.glass, [-s * 0.075, 0.21, -0.58], [s * -0.32, Math.PI / 2, 0], null, d);
    add(box(0.16, 0.025, 0.04), M.carbon, [s * 0.08, 0.08, -0.12], null, null, d); add(box(0.12, 0.06, 0.14), H, [s * 0.16, 0.09, -0.14], null, null, d);
  }
  // 4. engine deck, louvres, shark fin, rear wing
  add(box(1.06, 0.12, 1.24), M.carbon, [0, 0.72, -1.26]);
  for (const s of [-1, 1]) { add(box(0.24, 0.14, 0.96), M.ti, [s * 0.24, 0.79, -1.26], [0, 0, s * -0.25]); add(box(0.06, 0.03, 0.88), M.amber, [s * 0.26, 0.86, -1.26]); }
  for (let l = 0; l < 5; l++) add(box(1.04, 0.022, 0.12), M.armor, [0, 0.88 - l * 0.025, -0.82 - l * 0.22], [0.28, 0, 0]);
  const fin = ext(shape([[0, 0], [1.22, 0], [1.36, 0.34], [0.95, 0.34], [0.15, 0.06]]), 0.036, 0.008); fin.rotateY(Math.PI / 2); add(fin, M.armor, [-0.018, 0.84, -0.78]);
  const wing = grp([0, 1.18, -2.02], [0.16, 0, 0]);
  add(box(1.86, 0.042, 0.34), M.armor, null, null, null, wing); add(box(1.86, 0.032, 0.045), M.amber, [0, 0.025, -0.15], null, null, wing);
  for (const s of [-1, 1]) {
    add(box(0.035, 0.28, 0.44), H, [s * 0.93, -0.02, -0.02], null, null, wing); add(box(0.038, 0.035, 0.4), M.amber, [s * 0.93, 0.1, -0.02], null, null, wing);
    const sg = ext(shape([[0, 0], [0.24, 0], [0.46, 0.46], [0.28, 0.46]]), 0.036, 0.006); sg.rotateY(Math.PI / 2); add(sg, M.ti, [s * 0.36 - 0.018, 0.72, -1.66]);
    add(box(0.07, 0.05, 0.32), M.carbon, [s * 0.36, 0.73, -1.78]);
  }
  // 5. rear: fascia, diffuser, quad exhausts, Y tail-lights
  add(box(1.78, 0.34, 0.14), M.carbon, [0, 0.48, -2.18]); add(box(1.76, 0.05, 0.46), M.carbon, [0, 0.18, -2.06], [-0.14, 0, 0]);
  for (let d = -3; d <= 3; d++) add(box(0.028, 0.18, 0.42), M.armor, [d * 0.25, 0.25, -2.08]);
  for (const x of [-0.22, -0.08, 0.08, 0.22]) { add(new THREE.CylinderGeometry(0.052, 0.058, 0.22, 6), M.ti, [x, 0.36, -2.24], [Math.PI / 2, 0, 0]); add(new THREE.CylinderGeometry(0.038, 0.038, 0.16, 6), exh, [x, 0.36, -2.22], [Math.PI / 2, 0, 0]); }
  for (const s of [-1, 1]) {
    const t = grp([s * 0.62, 0.56, -2.24]);
    add(box(0.34, 0.028, 0.04), tail, null, null, null, t).userData.tag = 't'; add(box(0.16, 0.025, 0.04), tail, [-s * 0.18, 0.045, 0], [0, 0, s * -0.52], null, t); add(box(0.16, 0.025, 0.04), tail, [-s * 0.18, -0.045, 0], [0, 0, s * 0.52], null, t);
  }
  mergeStatic(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent; if (o.material === M.glass) o.renderOrder = 2; } });
  root.scale.setScalar(VENENO_SCALE);
  const k = VENENO_SCALE;
  return { group: root, wheels: [[-0.84 * k, 1.46 * k, 0.36 * k, 0.26 * k], [0.84 * k, 1.46 * k, 0.36 * k, 0.26 * k], [-0.88 * k, -1.48 * k, 0.4 * k, 0.32 * k], [0.88 * k, -1.48 * k, 0.4 * k, 0.32 * k]] };
}
