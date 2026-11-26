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

// ---------- shared helpers for the studio-style models (VORTEX GT-R, APEX V4-RR) ----------
// side profile (x = forward along the car, y = up) extruded across the car, centred, exactly like the source files
function profile(pts, depth, bevelSize, bevelThick, mat) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize, bevelThickness: bevelThick });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
}
function strut(a, b, r, mat, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
function tube(pts, r, mat, segs = 16) { return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), segs, r, 8, false), mat); }
function meshFrom(positions, indices, mat) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return new THREE.Mesh(g, mat); }
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- VORTEX GT-R: mid-engine V12 hypercar (player car; nose +Z, wheels at y = 0) ----------
export const VORTEX_SCALE = 1.12;
export function buildVortex(paint, track = m => m) {
  const S = (o) => track(new THREE.MeshStandardMaterial(o));
  const M = {
    paint, accent: S({ color: 0xf8fafc, roughness: 0.25, metalness: 0.3 }), carbon: S({ color: 0x222836, roughness: 0.34, metalness: 0.32 }),
    trim: S({ color: 0x161b24, roughness: 0.72, metalness: 0.14, side: THREE.DoubleSide }), alc: S({ color: 0x202532, roughness: 0.78, metalness: 0.06, side: THREE.DoubleSide }),
    red: S({ color: 0xdc2626, roughness: 0.55, metalness: 0.1 }), chrome: S({ color: 0xf1f5f9, roughness: 0.12, metalness: 0.95 }), gold: S({ color: 0xf59e0b, roughness: 0.24, metalness: 0.72 }),
    plenum: S({ color: 0xb91c1c, roughness: 0.3, metalness: 0.4 }), ti: S({ color: 0xdbeafe, emissive: 0x1e3a8a, emissiveIntensity: 0.24, roughness: 0.24, metalness: 0.74 }),
    exh: S({ color: 0x1e293b, emissive: 0xff4500, emissiveIntensity: 0.6, roughness: 0.35 }),
    glass: S({ color: 0x0b2236, emissive: 0x061626, emissiveIntensity: 0.28, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false }),
    eglass: S({ color: 0x0f2942, emissive: 0x061626, emissiveIntensity: 0.2, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 3.1, roughness: 0.2 }), cyan: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 2.5, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff1e42, emissive: 0xff1e42, emissiveIntensity: 3.1, roughness: 0.2 }),
    tft: new THREE.MeshBasicMaterial({ color: 0x060b14 }), bar: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), barR: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  };
  const root = new THREE.Group(); root.name = 'Vortex_GTR'; const add = (...o) => { root.add(...o); return o[0]; };
  const at = (m, p, r) => { m.position.set(...p); if (r) m.rotation.set(...r); return m; };
  const box = (w, h, d, mat, p, r) => at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), p, r);
  // body
  add(profile([[2.02, 0.24], [1.88, 0.42], [1.48, 0.54], [1.12, 0.675], [0.55, 0.68], [-0.35, 0.72], [-0.95, 0.8], [-1.96, 0.78], [-1.96, 0.26], [-1.45, 0.16], [1.45, 0.16]], 1.12, 0.024, 0.03, M.paint));
  add(box(1.94, 0.028, 0.44, M.carbon, [0, 0.145, 1.86]), box(1.66, 0.018, 0.12, M.accent, [0, 0.158, 2.04]));
  const FR = 0.345, FZ = 1.32, RR = 0.365, RZ = -1.3;
  for (const s of [-1, 1]) {
    add(box(0.024, 0.16, 0.34, M.carbon, [s * 0.96, 0.21, 1.86]));
    for (const [pts, d, x] of [[[[1.96, 0.24], [1.96, 0.36], [1.69, 0.6], [1.69, 0.24]], 0.34, 0.77], [[[1.72, 0.72], [1.72, 0.6], [1.32, 0.8], [0.94, 0.72]], 0.34, 0.77], [[[0.95, 0.24], [0.95, 0.72], [0.84, 0.72], [0.84, 0.24]], 0.34, 0.77],
      [[[-0.3, 0.28], [-0.3, 0.74], [-0.9, 0.78], [-0.9, 0.28]], 0.38, 0.77], [[[-0.3, 0.765], [-0.82, 0.87], [-1.3, 0.93], [-1.96, 0.79], [-1.96, 0.765]], 0.38, 0.77], [[[-1.7, 0.26], [-1.7, 0.78], [-1.96, 0.78], [-1.96, 0.26]], 0.38, 0.77]]) { const m = profile(pts, d, 0.02, 0.024, M.paint); m.position.x = s * x; add(m); }
    add(at(new THREE.Mesh(new THREE.TorusGeometry(0.382, 0.014, 10, 32, Math.PI * 0.92), M.carbon), [s * 0.945, FR, FZ], [-Math.PI * 0.46, Math.PI / 2, 0]));
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.378, 0.378, 0.34, 28, 1, true, 0.14, Math.PI - 0.28), M.trim), [s * 0.82, FR, FZ], [0, 0, Math.PI / 2]));
    add(at(new THREE.Mesh(new THREE.CircleGeometry(0.378, 28, 0.14, Math.PI - 0.28), M.trim), [s * 0.65, FR, FZ], [0, s * Math.PI / 2, 0]));
    add(box(0.24, 0.15, 1.8, M.carbon, [s * 0.84, 0.22, 0]));
    add(at(new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.015, 10, 32, Math.PI * 0.9), M.carbon), [s * 0.968, RR, RZ], [-Math.PI * 0.45, Math.PI / 2, 0]));
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.402, 0.402, 0.38, 32, 1, true, 0.14, Math.PI - 0.28), M.trim), [s * 0.83, RR, RZ], [0, 0, Math.PI / 2]));
    add(at(new THREE.Mesh(new THREE.CircleGeometry(0.402, 28, 0.14, Math.PI - 0.28), M.trim), [s * 0.64, RR, RZ], [0, s * Math.PI / 2, 0]));
    add(box(0.14, 0.3, 0.36, M.trim, [s * 0.85, 0.52, -0.54], [0, s * 0.16, 0]), box(0.022, 0.32, 0.24, M.carbon, [s * 0.92, 0.52, -0.56], [0, s * 0.22, 0]));
    const bt = profile([[-0.3, 1.12], [-0.86, 0.96], [-1.68, 0.84], [-1.68, 0.77], [-0.36, 0.84]], 0.15, 0.018, 0.022, M.paint); bt.position.x = s * 0.56; add(bt);
    add(box(0.26, 0.022, 0.34, M.carbon, [s * 0.34, 0.555, 1.48], [0.24, 0, 0]));
    // headlights
    const hl = new THREE.Group(); hl.position.set(s * 0.66, 0.495, 1.74); hl.rotation.set(0.24, s * 0.22, -s * 0.08); root.add(hl);
    hl.add(box(0.28, 0.056, 0.24, M.trim, [0, 0, 0]));
    [-0.075, 0, 0.075].forEach((px, i) => { hl.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 6), M.chrome), [px, 0.004, 0.118 - i * 0.012], [Math.PI / 2, 0, 0])); const c = at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6), M.drl), [px, 0.004, 0.121 - i * 0.012], [Math.PI / 2, 0, 0]); c.userData.tag = 'h'; hl.add(c); });
    hl.add(box(0.3, 0.012, 0.018, M.drl, [0, -0.024, 0.125]));
    add(box(0.014, 0.15, 0.022, M.cyan, [s * 0.89, 0.33, 1.92], [0, 0, s * 0.18]));
  }
  // cabin interior
  add(box(1.72, 0.06, 1.48, M.carbon, [0, 0.25, 0.36]), box(1.68, 0.44, 0.06, M.carbon, [0, 0.46, 1.08]), box(0.24, 0.22, 1.32, M.carbon, [0, 0.37, 0.3]));
  for (const sx of [-0.35, 0.35]) add(box(0.36, 0.08, 0.44, M.alc, [sx, 0.32, 0.16], [-0.14, 0, 0]), box(0.36, 0.54, 0.08, M.alc, [sx, 0.57, -0.1], [-0.34, 0, 0]), box(0.24, 0.18, 0.09, M.red, [sx, 0.85, -0.2], [-0.26, 0, 0]));
  add(box(1.66, 0.24, 0.48, M.alc, [0, 0.58, 0.86]));
  const sw = new THREE.Group(); sw.position.set(0.35, 0.67, 0.56); sw.rotation.x = -0.32; root.add(sw);
  sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 10, 28), M.alc), box(0.11, 0.075, 0.035, M.carbon, [0, 0, 0]), box(0.09, 0.012, 0.022, M.tail, [0, 0.135, 0]));
  add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.095), M.tft), [0.35, 0.73, 0.64], [0.24, Math.PI, 0]));
  for (let b = 0; b < 12; b++) add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.016 + b * 0.0015), b >= 9 ? M.barR : M.bar), [0.35 + (0.085 - b * 0.0155), 0.745, 0.638], [0.24, Math.PI, 0]));
  // greenhouse
  const C_BASE = [0.835, 0.675, 1.12], C_BELT = [0.842, 0.728, -0.3], C_ROOF_F = [0.62, 1.125, 0.48], C_ROOF_R = [0.63, 1.122, -0.3];
  const aP = (s, t) => [s * lerp(C_BASE[0], C_ROOF_F[0], t), lerp(C_BASE[1], C_ROOF_F[1], t), lerp(C_BASE[2], C_ROOF_F[2], t)];
  { const zs = [0.48, 0.22, -0.04, -0.3], pos = [], idx = [];
    zs.forEach((z, iz) => { const v = iz / 3, ex = lerp(C_ROOF_F[0], C_ROOF_R[0], v), ey = lerp(C_ROOF_F[1], C_ROOF_R[1], v), cb = Math.sin(Math.PI * (0.15 + 0.7 * v)) * 0.012; [[-ex, ey], [-ex * 0.65, ey + 0.036 + cb], [0, ey + 0.048 + cb], [ex * 0.65, ey + 0.036 + cb], [ex, ey]].forEach(([x, y]) => pos.push(x, y, z)); });
    for (let iz = 0; iz < 3; iz++) for (let iu = 0; iu < 4; iu++) { const a = iz * 5 + iu, b = a + 1, c = a + 5, d = c + 1; idx.push(a, c, b, b, c, d); }
    const outer = meshFrom(pos, idx, M.carbon); outer.material = M.carbon; add(outer); const hl = meshFrom(pos, idx, M.alc); hl.position.y = -0.016; add(hl);
    add(strut([-C_ROOF_F[0], C_ROOF_F[1], C_ROOF_F[2]], C_ROOF_F, 0.02, M.carbon), strut([-C_ROOF_R[0], C_ROOF_R[1], C_ROOF_R[2]], C_ROOF_R, 0.02, M.carbon));
    add(box(1.64, 0.48, 0.06, M.carbon, [0, 0.5, -0.32]));
    const bw = at(new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.42), M.glass), [0, 0.92, -0.32], [-0.24, 0, 0]); bw.userData.glass = true; add(bw); }
  { const U = 20, V = 12, pos = [], idx = [];
    for (let iv = 0; iv <= V; iv++) { const v = iv / V; for (let iu = 0; iu <= U; iu++) { const u = iu / U * 2 - 1, hw = lerp(C_BASE[0], C_ROOF_F[0], v), e = 1 - u * u; pos.push(u * hw, lerp(C_BASE[1], C_ROOF_F[1], v) + e * lerp(0.024, 0.048, v), lerp(C_BASE[2], C_ROOF_F[2], v) + e * 0.065 * Math.sin(Math.PI * v)); } }
    for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; iu++) { const a = iv * (U + 1) + iu, b = a + 1, c = a + U + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    add(meshFrom(pos, idx, M.glass)); }
  for (const s of [-1, 1]) {
    const pB = [s * C_BASE[0], C_BASE[1], C_BASE[2]], pF = [s * C_ROOF_F[0], C_ROOF_F[1], C_ROOF_F[2]], pR = [s * C_ROOF_R[0], C_ROOF_R[1], C_ROOF_R[2]], pBe = [s * C_BELT[0], C_BELT[1], C_BELT[2]];
    add(strut(pB, pF, 0.022, M.carbon), strut(pF, pR, 0.02, M.carbon), strut(pR, pBe, 0.024, M.carbon));
    const sT = aP(s, 0.68), sB = [sT[0], lerp(C_BASE[1], C_BELT[1], 0.3), sT[2]];
    add(meshFrom([...pB, ...sT, ...sB], [0, 1, 2], M.glass), strut(sT, sB, 0.012, M.carbon), strut(pB, sB, 0.012, M.trim));
    const sail = profile([[-0.3, 1.12], [-0.6, 0.74], [-0.3, 0.72]], 0.056, 0.008, 0.01, M.paint); sail.position.x = s * 0.72; add(sail);
    add(box(0.06, 0.42, 0.14, M.alc, [s * 0.73, 0.91, -0.34], [0, 0, s * 0.46]));
    // dihedral door (shut)
    const hx = s * 0.88, hy = 0.56, hz = 0.8, L = p => [p[0] - hx, p[1] - hy, p[2] - hz], door = new THREE.Group(); door.position.set(hx, hy, hz); root.add(door);
    const shell = profile([[0.32, -0.265], [0.32, 0.115], [-0.12, 0.132], [-1.1, 0.168], [-1.1, -0.265]], 0.088, 0.02, 0.024, M.paint); shell.position.x = -s * 0.044; door.add(shell);
    door.add(box(0.042, 0.34, 1.32, M.alc, [-s * 0.092, -0.05, -0.4]), box(0.065, 0.045, 0.58, M.red, [-s * 0.115, -0.02, -0.36]), box(0.042, 0.085, 1.26, M.carbon, [s * 0.004, -0.18, -0.42], [-0.02, 0, 0]));
    const lB = L(sB), lT = L(sT), lF = L(pF), lR = L(pR), lBe = L(pBe);
    door.add(meshFrom([...lB, ...lT, ...lF, ...lR, ...lBe], [0, 1, 2, 0, 2, 3, 0, 3, 4], M.glass));
    door.add(strut(lB, lT, 0.013, M.carbon), strut(lT, lF, 0.015, M.carbon), strut(lF, lR, 0.015, M.carbon), strut(lR, lBe, 0.015, M.carbon), strut(lB, lBe, 0.014, M.trim));
    door.add(strut([-s * 0.03, 0.13, 0.08], [s * 0.14, 0.22, 0.02], 0.012, M.carbon), box(0.14, 0.055, 0.065, M.carbon, [s * 0.18, 0.23, 0], [0, -s * 0.26, 0]));
  }
  // V12 bay, louvres, rear
  add(box(0.98, 0.56, 0.04, M.gold, [0, 0.6, -0.36], [-0.18, 0, 0]), strut([-0.46, 0.84, -0.44], [0.46, 0.82, -1.26], 0.014, M.carbon), strut([0.46, 0.84, -0.44], [-0.46, 0.82, -1.26], 0.014, M.carbon));
  add(box(0.42, 0.34, 0.78, M.trim, [0, 0.54, -0.84]));
  for (const s of [-1, 1]) {
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.72, 18), M.plenum), [s * 0.165, 0.73, -0.84], [Math.PI / 2, 0, 0]));
    for (let c = 0; c < 6; c++) { const z = -0.56 - c * 0.112; add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.06, 12), M.chrome), [s * 0.08, 0.72, z], [0, 0, s * 0.34]), at(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 16, Math.PI * 0.8), M.ti), [s * 0.24, 0.56, z], [0, s * Math.PI * 0.5, 0])); }
  }
  const eg = add(box(0.92, 0.014, 0.96, M.eglass, [0, 0.88, -0.86], [-0.1, 0, 0])); eg.userData.glass = true;
  for (let l = 0; l < 5; l++) add(box(0.86, 0.014, 0.048, M.carbon, [0, 0.905 - l * 0.011, -0.52 - l * 0.17], [-0.34, 0, 0]));
  add(box(1.76, 0.3, 0.08, M.trim, [0, 0.58, -1.98]));
  for (const s of [-1, 1]) { const t = box(0.56, 0.022, 0.032, M.tail, [s * 0.56, 0.7, -2.01], [0, -s * 0.08, 0]); t.userData.tag = 't'; add(t, box(0.16, 0.02, 0.032, M.tail, [s * 0.86, 0.735, -1.98], [0, 0, s * 0.42]), box(0.16, 0.02, 0.032, M.tail, [s * 0.86, 0.665, -1.98], [0, 0, -s * 0.42])); }
  for (const ex of [-0.22, -0.075, 0.075, 0.22]) add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.14, 6), M.ti), [ex, 0.56, -2.02], [Math.PI / 2, 0, 0]), at(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 6), M.exh), [ex, 0.56, -2.085], [Math.PI / 2, 0, 0]));
  add(box(1.32, 0.035, 0.34, M.carbon, [0, 0.16, -1.88], [0.24, 0, 0]));
  for (const fx of [-0.64, -0.38, -0.13, 0.13, 0.38, 0.64]) add(box(0.018, 0.22, 0.32, M.carbon, [fx, 0.22, -1.88]));
  for (const s of [-1, 1]) { const p = profile([[-1.56, 0.84], [-1.78, 1.12], [-1.94, 1.12], [-1.74, 0.84]], 0.022, 0.006, 0.008, M.carbon); p.position.x = s * 0.46; add(p); }
  const wing = new THREE.Group(); wing.position.set(0, 1.07, -1.88); wing.rotation.x = 0.08; root.add(wing);
  wing.add(box(1.86, 0.032, 0.28, M.carbon, [0, 0, 0]), box(1.86, 0.024, 0.018, M.paint, [0, 0.022, -0.13]));
  for (const s of [-1, 1]) wing.add(box(0.018, 0.22, 0.36, M.carbon, [s * 0.93, -0.02, -0.02]), box(0.022, 0.036, 0.34, M.paint, [s * 0.93, 0.06, -0.02]));
  // calipers (the game draws its own turning wheels)
  for (const s of [-1, 1]) { add(box(0.056, 0.145, 0.072, M.red, [s * (0.84 - 0.06), FR + 0.048, FZ - 0.155], [0.28, 0, 0]), box(0.056, 0.135, 0.068, M.red, [s * (0.86 - 0.07), RR + 0.045, RZ + 0.148], [-0.28, 0, 0])); }
  mergeStatic(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent; if (o.material.transparent) o.renderOrder = 2; } });
  root.scale.setScalar(VORTEX_SCALE); const k = VORTEX_SCALE;
  return { group: root, wheels: [[-0.84 * k, FZ * k, FR * k, 0.264 * k], [0.84 * k, FZ * k, FR * k, 0.264 * k], [-0.86 * k, RZ * k, RR * k, 0.33 * k], [0.86 * k, RZ * k, RR * k, 0.33 * k]] };
}

// ---------- APEX V4-RR: superbike (player motorbike; nose +Z) ----------
export const APEX_SCALE = 1.1;
export function buildApex(paint, track = m => m) {
  const S = (o) => track(new THREE.MeshStandardMaterial(o));
  const M = {
    paint, accent: S({ color: 0xf8fafc, roughness: 0.25, metalness: 0.3 }), carbon: S({ color: 0x262d3b, roughness: 0.34, metalness: 0.32 }), tire: S({ color: 0x202530, roughness: 0.72, metalness: 0.08 }),
    alu: S({ color: 0xcbd5e1, roughness: 0.26, metalness: 0.7 }), sub: S({ color: 0x2a3140, roughness: 0.38, metalness: 0.55 }), gold: S({ color: 0xf59e0b, roughness: 0.22, metalness: 0.72 }),
    chrome: S({ color: 0xf1f5f9, roughness: 0.12, metalness: 0.95 }), brembo: S({ color: 0xdc2626, roughness: 0.3, metalness: 0.3 }), ti: S({ color: 0xdbeafe, emissive: 0x1e3a8a, emissiveIntensity: 0.24, roughness: 0.24, metalness: 0.74 }),
    exh: S({ color: 0x1e293b, emissive: 0xff4500, emissiveIntensity: 0.6, roughness: 0.35 }), rad: S({ color: 0x334155, roughness: 0.44, metalness: 0.6 }), seat: S({ color: 0x222733, roughness: 0.76, metalness: 0.06 }),
    stitch: new THREE.MeshStandardMaterial({ color: 0xf87171, emissive: 0x991b1b, emissiveIntensity: 0.5, roughness: 0.35 }),
    glass: S({ color: 0x0b2538, emissive: 0x061a29, emissiveIntensity: 0.28, roughness: 0.06, metalness: 0.5, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
    edge: new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x0ea5e9, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2 }), rubber: S({ color: 0x12161f, roughness: 0.85, metalness: 0.05 }),
    halo: new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x3b82f6, emissiveIntensity: 2.4, roughness: 0.2 }), drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 3.2, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff1e42, emissive: 0xff1e42, emissiveIntensity: 3.0, roughness: 0.2 }),
    tft: new THREE.MeshBasicMaterial({ color: 0x060b14 }), bar: new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), barR: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  };
  const root = new THREE.Group(); root.name = 'Apex_V4RR'; const add = (...o) => { root.add(...o); return o[0]; };
  const at = (m, p, r) => { m.position.set(...p); if (r) m.rotation.set(...r); return m; };
  const box = (w, h, d, mat, p, r) => at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), p, r);
  const FA = [0, 0.305, 0.725], RA = [0, 0.315, -0.715], ST = [0, 0.815, 0.455];
  // frame, swingarm, shock, hugger, chain, forks, clamps
  for (const s of [-1, 1]) {
    add(tube([[s * 0.055, 0.78, 0.43], [s * 0.128, 0.67, 0.22], [s * 0.132, 0.5, -0.06], [s * 0.115, 0.37, -0.18]], 0.026, M.alu));
    add(strut([s * 0.098, 0.59, -0.14], [s * 0.068, 0.82, -0.58], 0.011, M.sub), strut([s * 0.105, 0.46, -0.16], [s * 0.062, 0.74, -0.54], 0.009, M.sub));
    add(tube([[s * 0.095, 0.38, -0.42], [s * 0.092, 0.62, -0.54], [s * 0.072, 0.64, -0.76]], 0.016, M.carbon, 12));
    const fx = s * 0.088, top = [fx, ST[1], ST[2]], bot = [fx, FA[1], FA[2]], mid = [fx, lerp(top[1], bot[1], 0.58), lerp(top[2], bot[2], 0.58)];
    add(strut(top, mid, 0.025, M.gold, 12), strut(mid, bot, 0.019, M.chrome, 12), box(0.036, 0.088, 0.048, M.brembo, [fx * 0.85, FA[1] + 0.035, FA[2] - 0.132], [0.38, 0, 0]));
  }
  add(tube([[0.115, 0.375, -0.19], [0.138, 0.425, -0.45], [0.112, 0.315, -0.715]], 0.036, M.alu));
  add(strut([0, 0.56, -0.25], [0.04, 0.41, -0.43], 0.024, M.gold, 12), strut([0.078, 0.44, -0.17], [0.078, 0.412, -0.715], 0.006, M.gold, 6), strut([0.078, 0.33, -0.17], [0.078, 0.218, -0.715], 0.006, M.gold, 6));
  add(strut([-0.095, ST[1], ST[2]], [0.095, ST[1], ST[2]], 0.018, M.alu), strut([-0.095, 0.67, 0.53], [0.095, 0.67, 0.53], 0.018, M.alu), strut([-0.085, 0.822, 0.435], [0.085, 0.822, 0.435], 0.009, M.gold));
  // V4 engine, radiator, exhaust
  add(box(0.24, 0.19, 0.28, M.sub, [0, 0.37, -0.02]), at(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.042, 20), M.gold), [0.132, 0.35, -0.04], [0, 0, Math.PI / 2]));
  add(box(0.22, 0.14, 0.12, M.alu, [0, 0.5, 0.11], [0.52, 0, 0]), box(0.22, 0.13, 0.11, M.alu, [0, 0.51, -0.08], [-0.36, 0, 0]), box(0.29, 0.24, 0.032, M.rad, [0, 0.48, 0.33], [0.38, 0, 0]));
  for (const hx of [-0.068, 0.068]) add(tube([[hx, 0.45, 0.17], [hx * 1.15, 0.22, 0.26], [hx * 0.9, 0.15, 0.04], [0.055, 0.16, -0.22]], 0.017, M.ti, 20));
  add(tube([[0.055, 0.16, -0.22], [0.125, 0.21, -0.35], [0.148, 0.29, -0.46]], 0.023, M.ti, 12));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.028, 0.25, 18), M.carbon), [0.158, 0.365, -0.56], [0.68, 0, -0.08]), at(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.039, 0.045, 18), M.ti), [0.164, 0.455, -0.665], [0.68, 0, 0]), at(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), M.exh), [0.165, 0.468, -0.68], [0.68, 0, 0]));
  // bodywork
  add(profile([[0.86, 0.652], [0.72, 0.748], [0.54, 0.785], [0.42, 0.78], [0.36, 0.695], [0.54, 0.558], [0.76, 0.578]], 0.155, 0.042, 0.048, M.paint));
  add(profile([[0.92, 0.36], [0.78, 0.51], [0.55, 0.5], [0.64, 0.39], [0.82, 0.33]], 0.11, 0.018, 0.022, M.carbon));
  add(box(0.092, 0.038, 0.08, M.carbon, [0, 0.672, 0.83], [0.22, 0, 0]));
  for (const s of [-1, 1]) {
    const hl = new THREE.Group(); hl.position.set(s * 0.102, 0.694, 0.778); hl.rotation.set(0.16, s * 0.32, -s * 0.24); root.add(hl);
    hl.add(box(0.12, 0.036, 0.052, M.rubber, [0, 0, -0.012]));
    const led = at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 16), M.drl), [s * 0.006, 0, 0.006], [Math.PI / 2, 0, 0]); led.userData.tag = 'h'; hl.add(led);
    hl.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 8, 20), M.halo), [s * 0.006, 0, 0.013]));
    add(tube([[s * 0.048, 0.67, 0.84], [s * 0.112, 0.696, 0.78], [s * 0.185, 0.744, 0.67]], 0.0065, M.drl, 14));
  }
  { const U = 20, V = 12, pos = [], idx = [];
    const P = (u, v) => { const hw = 0.172 * (1 - 0.15 * Math.pow(v, 1.35)) * Math.sin(Math.acos(Math.min(0.98, Math.abs(u) * 0.34))), env = Math.sin(Math.PI * Math.pow(v, 0.78));
      return [u * hw, 0.805 + Math.pow(v, 0.84) * 0.222 - Math.pow(Math.abs(u), 1.85) * (0.052 + 0.016 * v) + Math.exp(-Math.pow(u / 0.48, 2)) * 0.044 * env + Math.exp(-Math.pow((Math.abs(u) - 0.34) / 0.22, 2)) * 0.012 * env, 0.702 - v * 0.268 - Math.pow(Math.abs(u), 1.8) * (0.082 * (1 - 0.42 * v))]; };
    for (let iv = 0; iv <= V; iv++) for (let iu = 0; iu <= U; iu++) pos.push(...P(iu / U * 2 - 1, iv / V));
    for (let iv = 0; iv < V; iv++) for (let iu = 0; iu < U; iu++) { const a = iv * (U + 1) + iu, b = a + 1, c = a + U + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    add(meshFrom(pos, idx, M.glass));
    const row = v => Array.from({ length: U + 1 }, (_, i) => P(i / U * 2 - 1, v)), col = u => Array.from({ length: V + 1 }, (_, i) => P(u, i / V));
    add(tube(row(0.995), 0.0024, M.edge, 24), tube(col(-1), 0.0024, M.edge, 16), tube(col(1), 0.0024, M.edge, 16), tube(row(0.01), 0.0054, M.rubber, 24)); }
  for (const s of [-1, 1]) {
    const sp = profile([[0.68, 0.65], [0.44, 0.72], [0.12, 0.62], [0.02, 0.36], [0.24, 0.25], [0.54, 0.36], [0.64, 0.54]], 0.016, 0.012, 0.014, M.paint); sp.position.x = s * 0.165; sp.rotation.y = s * 0.06; add(sp);
    const st = profile([[0.58, 0.58], [0.34, 0.66], [0.14, 0.55], [0.22, 0.44], [0.46, 0.48]], 0.008, 0.004, 0.005, M.accent); st.position.x = s * 0.182; st.rotation.y = s * 0.06; add(st);
    for (let g = 0; g < 3; g++) add(box(0.014, 0.072, 0.018, M.sub, [s * 0.184, 0.5 - g * 0.032, 0.23 - g * 0.034], [-0.45, 0, 0]));
    for (const w of [0, 1]) add(box(0.115, 0.008, 0.068, M.carbon, [s * (0.215 - w * 0.01), 0.62 - w * 0.068, 0.54 - w * 0.05], [0.18, s * 0.14, -s * 0.16]), box(0.006, 0.038, 0.065, M.paint, [s * (0.27 - w * 0.01), 0.618 - w * 0.068, 0.54 - w * 0.05]));
    const bl = profile([[0.36, 0.28], [0.1, 0.24], [-0.22, 0.17], [-0.26, 0.11], [0.12, 0.12], [0.34, 0.21]], 0.018, 0.01, 0.012, M.carbon); bl.position.x = s * 0.118; add(bl);
  }
  add(profile([[0.44, 0.78], [0.24, 0.94], [-0.02, 0.92], [-0.14, 0.74], [0.02, 0.64], [0.34, 0.68]], 0.21, 0.048, 0.056, M.paint));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.008, 24), M.alu), [0, 0.968, 0.18], [0.26, 0, 0]), at(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.011, 24), M.sub), [0, 0.97, 0.18], [0.26, 0, 0]), box(0.052, 0.11, 0.008, M.carbon, [0, 0.81, -0.1], [-0.82, 0, 0]));
  add(profile([[-0.06, 0.73], [-0.18, 0.72], [-0.36, 0.74], [-0.45, 0.84], [-0.42, 0.86], [-0.31, 0.79], [-0.15, 0.77], [-0.04, 0.78]], 0.185, 0.022, 0.026, M.seat));
  for (const s of [-1, 1]) add(tube([[s * 0.088, 0.775, -0.08], [s * 0.108, 0.768, -0.22], [s * 0.102, 0.795, -0.35], [s * 0.082, 0.862, -0.43]], 0.0032, M.stitch, 14));
  add(box(0.145, 0.052, 0.018, M.paint, [0, 0.835, -0.425], [-0.36, 0, 0]), box(0.068, 0.016, 0.005, M.alu, [0, 0.838, -0.415], [-0.36, 0, 0]));
  for (const s of [-1, 1]) {
    const tw = profile([[-0.38, 0.81], [-0.58, 0.88], [-0.84, 0.94], [-0.8, 0.88], [-0.54, 0.77], [-0.34, 0.73]], 0.026, 0.014, 0.016, M.paint); tw.position.x = s * 0.078; tw.rotation.y = -s * 0.09; add(tw);
    const tl = box(0.048, 0.012, 0.016, M.tail, [s * 0.042, 0.905, -0.825], [0.24, -s * 0.35, s * 0.18]); tl.userData.tag = 't'; add(tl);
  }
  add(box(0.125, 0.026, 0.15, M.seat, [0, 0.888, -0.6], [-0.22, 0, 0]), strut([0, 0.84, -0.74], [0, 0.67, -0.88], 0.008, M.sub), box(0.12, 0.075, 0.006, M.accent, [0, 0.65, -0.9], [-0.42, 0, 0]));
  // clip-ons, mirrors, dash
  for (const s of [-1, 1]) {
    add(strut([s * 0.088, 0.795, 0.445], [s * 0.295, 0.758, 0.362], 0.012, M.sub), strut([s * 0.185, 0.777, 0.405], [s * 0.295, 0.758, 0.362], 0.016, M.tire), strut([s * 0.175, 0.772, 0.425], [s * 0.285, 0.752, 0.398], 0.0045, M.alu));
    add(strut([s * 0.165, 0.775, 0.615], [s * 0.275, 0.845, 0.565], 0.006, M.sub), box(0.086, 0.028, 0.022, M.carbon, [s * 0.305, 0.855, 0.555], [0.08, -s * 0.34, s * 0.1]));
  }
  add(box(0.162, 0.012, 0.074, M.carbon, [0, 0.835, 0.53], [-0.34, 0, 0]), box(0.168, 0.064, 0.042, M.carbon, [0, 0.806, 0.545], [-0.52, 0, 0]), box(0.152, 0.082, 0.018, M.sub, [0, 0.812, 0.514], [-0.68, 0, 0]));
  add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), M.tft), [0, 0.818, 0.505], [Math.PI - 0.68, Math.PI, 0]));
  for (let b = 0; b < 12; b++) add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.0085, 0.012 + b * 0.0012), b >= 9 ? M.barR : M.bar), [-0.056 + b * 0.0102, 0.834, 0.514], [Math.PI - 0.68, Math.PI, 0]));
  mergeStatic(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = !o.material.transparent; if (o.material.transparent) o.renderOrder = 2; } });
  root.scale.setScalar(APEX_SCALE); const k = APEX_SCALE;
  return { group: root, wheels: [[0, FA[2] * k, FA[1] * k, 0.128 * k], [0, RA[2] * k, RA[1] * k, 0.196 * k]] };
}

// ---------- VALKYRIE X-9: quad-turbine hovering carrier (Federation; bow +Z) ----------
// The model's parked fighters are ~0.66 units long; K makes them ~6 units so the game's x3 carrier scale gives 18 m jets
// (a 240 m carrier). Moving parts are named so the game can spin them: Lift_Rotor_n, Rotating_Radar, DefenseTurret_n, PlasmaPlume_n.
export const CARRIER_K = 9.1;
function deckTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#141e2b'; x.fillRect(0, 0, 512, 1024); x.strokeStyle = 'rgba(148,163,184,0.14)'; x.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke(); } for (let i = 0; i <= 1024; i += 64) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.fillStyle = '#f59e0b'; x.fillRect(18, 24, 8, 976); x.fillRect(486, 24, 8, 976); x.fillStyle = '#38bdf8'; x.fillRect(195, 40, 5, 420); x.fillRect(295, 40, 5, 420);
  x.save(); x.translate(235, 560); x.rotate(-0.18); x.fillStyle = 'rgba(226,232,240,0.85)'; x.fillRect(-115, -420, 6, 840); x.fillRect(115, -420, 6, 840);
  x.fillStyle = '#f59e0b'; for (let y = -390; y <= 370; y += 68) x.fillRect(-4, y, 8, 38); x.fillStyle = '#94a3b8'; for (let w = 0; w < 4; w++) x.fillRect(-105, 220 + w * 32, 210, 3);
  x.fillStyle = 'rgba(226,232,240,0.9)'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.fillText('09', 0, -330); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function buildCarrier() {
  const M = palette(0.6);
  const deck = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.58, metalness: 0.25 });
  const bridge = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x062840, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.3 });
  const lift = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 2.6, roughness: 0.15 });
  const beacon = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 2.6 });
  const outer = new THREE.Group(); outer.name = 'Valkyrie_X9'; const root = new THREE.Group(); root.scale.setScalar(CARRIER_K); outer.add(root);
  const { add, grp, box, shape, ext } = kit(root);
  { const s = shape([[-1.15, 4.45], [1.05, 4.45], [1.48, 1.2], [1.62, -1.65], [1.38, -4.35], [-1.55, -4.35], [-2.15, -1.45], [-1.95, 1.35]]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2 }); g.rotateX(Math.PI / 2); add(g, M.armor, [0, 0.56, 0]); }
  add(box(2.65, 0.02, 8.65), deck, [-0.18, 0.592, 0.05]);
  add(box(2.15, 0.72, 7.65), M.hull, [-0.08, 0.08, 0.05]); add(box(1.45, 0.34, 6.45), M.carbon, [-0.08, -0.38, 0.05]);
  add(new THREE.ConeGeometry(1.15, 1.45, 4), M.hull, [-0.05, 0.22, 4.35], [Math.PI / 2, 0, Math.PI / 4, 'XYZ'], [1.25, 1, 0.45]);
  for (const s of [-1, 1]) add(box(0.06, 0.1, 6.2), M.amber, [s * 1.06 - 0.08, 0.22, 0.05]);
  // command island
  const isl = grp([1.14, 0.6, -1.05]);
  add(box(0.66, 0.68, 1.95), M.hull, [0, 0.34, 0], null, null, isl); add(box(0.76, 0.34, 1.42), M.armor, [-0.04, 0.84, 0.14], null, null, isl);
  add(box(0.8, 0.14, 1.36), bridge, [-0.04, 0.88, 0.16], null, null, isl); add(box(0.78, 0.045, 1.46), M.amber, [-0.04, 0.68, 0.14], null, null, isl);
  add(box(0.06, 0.26, 0.46), M.ti, [0.34, 0.42, 0.35], null, null, isl); add(new THREE.CylinderGeometry(0.06, 0.14, 0.78, 8), M.carbon, [0.02, 1.36, -0.12], null, null, isl);
  const radar = grp([0.02, 1.76, -0.12], null, isl); radar.name = 'Rotating_Radar'; radar.userData.keep = true;
  add(box(0.68, 0.07, 0.1), M.ti, null, null, null, radar); add(box(0.72, 0.03, 0.04), M.amber, null, null, null, radar);
  // four lift turbines
  [[-2.42, 2.25, -1], [2.26, 2.25, 1], [-2.52, -2.35, -1], [2.36, -2.35, 1]].forEach(([x, z, sd], i) => {
    const pod = grp([x, 0.18, z]), aL = Math.abs(x) - 0.85;
    add(box(aL, 0.28, 0.86), M.armor, [-sd * (aL * 0.5 + 0.42), 0.04, 0], null, null, pod);
    add(box(aL * 0.92, 0.12, 0.42), M.carbon, [-sd * (aL * 0.48 + 0.4), -0.14, 0], [0, 0, sd * 0.18], null, pod);
    add(new THREE.LatheGeometry(V2([[0.68, -0.34], [0.84, -0.22], [0.92, 0], [0.86, 0.24], [0.72, 0.34], [0.62, 0.34], [0.64, -0.34]]), 32), M.hull, null, null, null, pod);
    add(new THREE.TorusGeometry(0.68, 0.045, 12, 32), M.ti, [0, 0.33, 0], [Math.PI / 2, 0, 0], null, pod);
    add(new THREE.CylinderGeometry(0.915, 0.885, 0.1, 32, 1, true), M.amber, [0, 0.08, 0], null, null, pod);
    for (let k = 0; k < 2; k++) add(box(1.26, 0.06, 0.08), M.carbon, [0, -0.12, 0], [0, k * Math.PI / 2 + Math.PI / 4, 0], null, pod);
    add(new THREE.CylinderGeometry(0.16, 0.12, 0.56, 18), M.ti, null, null, null, pod);
    const rot = grp([0, 0.04, 0], null, pod); rot.name = 'Lift_Rotor_' + i; rot.userData.keep = true; rot.userData.dir = (i === 0 || i === 3) ? 1 : -1;
    for (let b = 0; b < 10; b++) { const a = b / 10 * Math.PI * 2; add(box(0.44, 0.022, 0.14), M.ti, [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], [0.38, -a, 0], null, rot); }
    add(new THREE.CylinderGeometry(0.56, 0.48, 0.12, 24), lift, [0, -0.24, 0], null, null, pod);
    const L = 1.1, wash = add(new THREE.ConeGeometry(0.78, 1.85, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [0, -0.32 - 0.92 * L, 0], [Math.PI, 0, 0], [1, L, 1], pod);
    wash.name = 'PlasmaPlume_' + i; wash.userData.keep = true;
    add(new THREE.SphereGeometry(0.065, 10, 10), sd < 0 ? M.red : M.green, [sd * 0.92, 0.26, 0], null, null, pod);
  });
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.34, 0.26, 0.65, 22, 1, true), M.ti, [s * 0.56 - 0.08, 0.14, -4.18], [Math.PI / 2, 0, 0]); add(new THREE.CylinderGeometry(0.22, 0.24, 0.42, 18), lift, [s * 0.56 - 0.08, 0.14, -4.12], [Math.PI / 2, 0, 0]); }
  // parked fighters, blast deflector (raised), elevator
  const fighter = (sc, p, ry, parent = root) => {
    const f = grp(p, [0, ry, 0], parent); f.scale.setScalar(sc);
    add(new THREE.ConeGeometry(0.32, 2.2, 6), M.hull, null, [Math.PI / 2, 0, 0], [1.3, 1, 0.45], f);
    add(new THREE.SphereGeometry(0.22, 12, 10), bridge, [0, 0.12, 0.35], null, [0.75, 0.65, 1.8], f);
    add(box(2.1, 0.04, 0.75), M.armor, [0, 0, -0.25], null, null, f);
    for (const s of [-1, 1]) { add(box(0.04, 0.36, 0.34), M.armor, [s * 0.24, 0.18, -0.78], [0, 0, s * -0.32], null, f); add(box(0.045, 0.07, 0.24), M.amber, [s * 0.29, 0.35, -0.82], [0, 0, s * -0.32], null, f); }
  };
  fighter(0.32, [-0.22, 0.66, 2.45], 0); fighter(0.3, [-1.32, 0.66, 0.35], -0.52);
  const jbd = grp([-0.22, 0.6, 1.85], [-0.68, 0, 0]); add(box(0.68, 0.03, 0.36), M.amber, [0, 0.015, -0.18], null, null, jbd);
  const el = grp([1.22, 0.59, 0.95]); add(box(0.88, 0.08, 1.18), M.armor, null, null, null, el); add(box(0.9, 0.03, 1.2), M.amber, [0, 0.03, 0], null, null, el); fighter(0.28, [0, 0.09, 0], -Math.PI / 2, el);
  for (let z = -3.8; z <= 3.8; z += 0.95) for (const x of [-1.25, 0.88]) add(box(0.05, 0.03, 0.08), beacon, [x, 0.605, z]);
  // defence turrets (the game's addition: the carrier shoots back) on the deck edges and the stern
  [[-1.75, 0.62, -1.2], [1.45, 0.62, 1.6], [-1.3, 0.62, 3.6], [1.2, 0.62, -3.6]].forEach(([x, y, z], i) => {
    const t = grp([x, y, z]); t.name = 'DefenseTurret_' + i; t.userData.keep = true;
    add(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 16), M.armor, [0, 0.06, 0], null, null, t); add(box(0.2, 0.1, 0.22), M.hull, [0, 0.16, 0], null, null, t);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), M.ti, [s * 0.05, 0.17, 0.2], [Math.PI / 2, 0, 0], null, t);
    add(box(0.21, 0.02, 0.05), M.amber, [0, 0.22, -0.06], null, null, t);
  });
  mergeStatic(root);
  return finishModel(outer);
}
