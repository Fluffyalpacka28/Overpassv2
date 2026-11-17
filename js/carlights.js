import * as THREE from 'three';

// Adjustable car lights: headlights, taillights and underglow, for built-in and custom (uploaded) vehicles.
// The config is small and is shared with everyone in a multiplayer session (see net.js).
//   h / t : { on, c: colour, dx: spacing, dy: height, dz: forward/back, s: size }   (dx, dy, dz are -1..1 nudges relative to the body size)
//   u     : { on, c: colour, a: brightness, s: size }
// Positions are measured from the body's own bounds, so a setup carries over from one vehicle to another.

const KEY = 'osm.lights.v1';
export const LIGHT_COLORS = ['#fff6d8', '#ffffff', '#9fd0ff', '#ffd24a', '#ff2a3a', '#ff7a1a', '#35d07f', '#00e5ff', '#b56bff', '#ff4fd8'];
export const defaultLights = () => ({ h: { on: 0, c: '#fff6d8', dx: 0, dy: 0, dz: 0, s: 1 }, t: { on: 0, c: '#ff2a3a', dx: 0, dy: 0, dz: 0, s: 1 }, u: { on: 0, c: '#00e5ff', a: 1, s: 1 } });
const col = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const num = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function cleanLights(l) {
  const d = defaultLights(); if (!l || typeof l !== 'object') return d;
  for (const k of ['h', 't']) { const g = l[k] || {}; d[k] = { on: g.on ? 1 : 0, c: col(g.c, d[k].c), dx: num(g.dx, -1, 1, 0), dy: num(g.dy, -1, 1, 0), dz: num(g.dz, -1, 1, 0), s: num(g.s, 0.4, 2.5, 1) }; }
  const u = l.u || {}; d.u = { on: u.on ? 1 : 0, c: col(u.c, d.u.c), a: num(u.a, 0.2, 2, 1), s: num(u.s, 0.5, 1.6, 1) };
  return d;
}
export const anyOn = c => !!(c && (c.h.on || c.t.on || c.u.on));
export function loadLights() { try { return cleanLights(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return defaultLights(); } }
export function saveLights(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } }
const cfgKey = c => (anyOn(c) ? JSON.stringify(c) : 'off');

// ---------- drawing ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
let GLOW = null;
const glowTex = () => {
  if (GLOW) return GLOW; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  GLOW = new THREE.CanvasTexture(c); return GLOW;
};
const _b = new THREE.Box3(), _m = new THREE.Matrix4(), _i = new THREE.Matrix4();
// bounds of a vehicle body in the car's own space (ignores our lamps)
function bounds(mesh, root) {
  mesh.updateWorldMatrix(true, true); _i.copy(mesh.matrixWorld).invert(); const box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || o.userData.carLights || o.userData.stockLamp) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _b.copy(o.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_i, o.matrixWorld)); box.union(_b);
  });
  return box;
}
function dropGroups(ud) {
  for (const k of ['lampGroup', 'glowGroup']) {
    const g = ud[k]; if (!g) continue; g.parent && g.parent.remove(g); for (const m of g.userData.mats || []) m.dispose(); ud[k] = null;
  }
}
function lamp(parent, mats, x, y, z, w, h, front, color, kind) {
  const dir = front ? 1 : -1, hous = new THREE.Mesh(BOX, mats.hous), lens = new THREE.Mesh(BOX, mats[kind]), core = new THREE.Mesh(BOX, mats.core);
  hous.scale.set(w * 1.18, h * 1.5, 0.07); hous.position.set(x, y, z - dir * 0.012);
  lens.scale.set(w, h, 0.075); lens.position.set(x, y, z + dir * 0.02);
  core.scale.set(w * 0.55, h * 0.5, 0.08); core.position.set(x, y, z + dir * 0.026);
  parent.add(hous, lens, core);
}

// (Re)build the custom lights on a car. Safe to call again whenever the config, the model or the body changes.
export function applyCarLights(mesh, cfg) {
  const ud = mesh.userData, body = ud.body; if (!body) return; dropGroups(ud);
  const c = cleanLights(cfg), custom = !!ud.customHolder;
  if (!custom) body.traverse(o => { // built-in lamps give way to ours while ours are on
    if (o.userData && o.userData.stockLamp) o.visible = !(o.userData.stockLamp === 'h' ? c.h.on : c.t.on);
  });
  if (!anyOn(c)) return;
  const root = custom ? ud.customHolder : (body.children[0] || body), bb = bounds(mesh, root); if (bb.isEmpty()) return;
  const W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z, cz = (bb.max.z + bb.min.z) / 2, cx = (bb.max.x + bb.min.x) / 2, k = Math.max(0.5, Math.min(1.4, W / 2));
  const mats = [];
  const mk = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4, ...o }); mats.push(m); return m; };
  const g = new THREE.Group(); g.userData = { carLights: true, cockpit: true, mats }; // 'cockpit' exempts it from the custom-model "hide stock parts" pass
  const hm = { hous: mk('#14161c', { roughness: 0.5 }) };
  if (c.h.on) { hm.head = mk('#fff', { emissive: c.h.c, emissiveIntensity: 2.2 }); hm.head.color.set(c.h.c); hm.core = mk('#fff', { emissive: '#ffffff', emissiveIntensity: 2.6 }); }
  if (c.t.on) { hm.tail = mk('#fff', { emissive: c.t.c, emissiveIntensity: 1.8 }); hm.tail.color.set(c.t.c); if (!hm.core) hm.core = mk('#fff', { emissive: '#ffffff', emissiveIntensity: 2 }); }
  // headlights
  if (c.h.on) {
    const half = 0.31 * W + c.h.dx * W * 0.35, y = bb.min.y + (custom ? 0.36 : 0.64) * H + c.h.dy * H * 0.5, z = bb.max.z - 0.05 + c.h.dz * L * 0.25, w = 0.34 * k * c.h.s, h = 0.12 * k * c.h.s;
    for (const s of [-1, 1]) lamp(g, hm, cx + s * half, y, z, w, h, true, c.h.c, 'head');
  }
  // taillights
  if (c.t.on) {
    const half = 0.32 * W + c.t.dx * W * 0.35, y = bb.min.y + (custom ? 0.4 : 0.7) * H + c.t.dy * H * 0.5, z = bb.min.z + 0.05 + c.t.dz * L * 0.25, w = 0.38 * k * c.t.s, h = 0.1 * k * c.t.s;
    for (const s of [-1, 1]) lamp(g, hm, cx + s * half, y, z, w, h, false, c.t.c, 'tail');
  }
  body.add(g); ud.lampGroup = g;
  // underglow: LED strips under the sills (follow the body) + a soft glow on the ground (stays flat)
  if (c.u.on) {
    const ug = new THREE.Group(); ug.userData = { carLights: true, cockpit: true, mats: [] };
    const sm = new THREE.MeshBasicMaterial({ color: c.u.c, toneMapped: false }); ug.userData.mats.push(sm);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(BOX, sm); st.scale.set(0.06, 0.05, L * 0.62 * c.u.s); st.position.set(cx + s * W * 0.41, bb.min.y + 0.08, cz); ug.add(st); }
    const fr = new THREE.Mesh(BOX, sm); fr.scale.set(W * 0.5 * c.u.s, 0.05, 0.06); fr.position.set(cx, bb.min.y + 0.08, bb.max.z - 0.5); ug.add(fr);
    const rr = fr.clone(); rr.position.z = bb.min.z + 0.5; ug.add(rr);
    body.add(ug); ud.glowGroup = ug;
    const gm = new THREE.MeshBasicMaterial({ color: c.u.c, map: glowTex(), transparent: true, opacity: Math.min(1, 0.8 * c.u.a), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9 * c.u.s, L * 1.45 * c.u.s), gm); plane.rotation.x = -Math.PI / 2; plane.position.set(cx, 0.07, cz); plane.renderOrder = 2;
    const flat = new THREE.Group(); flat.userData = { carLights: true, cockpit: true, mats: [gm] }; flat.add(plane); mesh.add(flat);
    ug.userData.flat = flat;
    // the ground glow is removed together with the strip group
    ug.userData.mats.push({ dispose() { flat.parent && flat.parent.remove(flat); gm.dispose(); plane.geometry.dispose(); } });
  }
}
// Call every frame (cheap): rebuilds only when the config, the custom model or the vehicle changed.
export function syncCarLights(mesh, cfg) {
  if (cfg) cfg = cleanLights(cfg); // configs from other players may be partial
  const ud = mesh.userData, key = cfgKey(cfg) + '|' + (ud.customKey || '') + '|' + (ud.model || '');
  if (ud.lightKey === key) return;
  if (ud.lightKey === undefined && !anyOn(cfg)) { ud.lightKey = key; return; }
  ud.lightKey = key; applyCarLights(mesh, cfg);
}
