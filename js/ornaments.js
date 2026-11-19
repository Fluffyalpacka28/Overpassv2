import * as THREE from 'three';
import { modelTemplate } from './custom.js';

// Ornaments: up to three of your own 3D models (GLB / GLTF / OBJ / STL) bolted onto your car anywhere you like:
// a duck on the roof, a sofa on the trunk, a giant spoon on the hood. Each one is shrunk so its biggest side is 1 m at size 1,
// then placed in metres from the middle of the car, turned, tilted, rolled, and optionally spun like a hood ornament.
export const ORN_SLOTS = 3, MAX_ORN_BYTES = 3 * 1024 * 1024, ORN_EXTS = ['glb', 'gltf', 'obj', 'stl'];
const cl = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
// placement (and label) for one ornament; also used to clean what friends send us
export function cleanPlace(m) {
  m = m && typeof m === 'object' ? m : {};
  return { name: String(m.name || 'Ornament').slice(0, 32), ext: ORN_EXTS.includes(m.ext) ? m.ext : 'glb', size: Math.max(0, m.size | 0),
    x: cl(m.x, -4, 4, 0), y: cl(m.y, -1, 5, 1.4), z: cl(m.z, -5, 5, 0), s: cl(m.s, 0.05, 5, 0.6),
    yaw: cl(m.yaw, -180, 180, 0), pitch: cl(m.pitch, -180, 180, 0), roll: cl(m.roll, -180, 180, 0), spin: m.spin ? 1 : 0, on: m.on === 0 ? 0 : 1 };
}
// size of the car's own body (stock or custom), in car space; cached per model
export function carBox(mesh) {
  const ud = mesh.userData, key = (ud.model || '') + '|' + (ud.customKey || '');
  if (ud.ornBox && ud.ornBoxKey === key) return ud.ornBox;
  mesh.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert(), bb = new THREE.Box3(), tmp = new THREE.Box3(), rel = new THREE.Matrix4(), root = ud.body || mesh;
  root.traverseVisible(o => {
    if (!o.isMesh || !o.geometry || o.isInstancedMesh || o.material?.transparent) return;
    for (let q = o; q && q !== mesh; q = q.parent) if (q.name === 'ornaments' || q.name === 'wings' || q.name === 'cockpit' || q.userData.cockpit) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); bb.union(tmp);
  });
  if (bb.isEmpty() || bb.max.z - bb.min.z > 12) bb.set(new THREE.Vector3(-0.9, 0, -2.2), new THREE.Vector3(0.9, 1.4, 2.2));
  ud.ornBox = bb; ud.ornBoxKey = key; return bb;
}
// quick spots, worked out from the car's size
export const SPOTS = [['roof', 'Roof'], ['hood', 'Hood'], ['trunk', 'Trunk'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left side'], ['right', 'Right side']];
export function spot(id, bb, s = 0.6) {
  const top = bb.max.y, L = bb.max.z - bb.min.z, cz = (bb.min.z + bb.max.z) / 2, hw = (bb.max.x - bb.min.x) / 2;
  const r = v => Math.round(v * 100) / 100;
  if (id === 'hood') return { x: 0, y: r(bb.min.y + (top - bb.min.y) * 0.72), z: r(cz + L * 0.33), yaw: 0, pitch: 0, roll: 0 };
  if (id === 'trunk') return { x: 0, y: r(bb.min.y + (top - bb.min.y) * 0.75), z: r(cz - L * 0.36), yaw: 0, pitch: 0, roll: 0 };
  if (id === 'front') return { x: 0, y: r(bb.min.y + (top - bb.min.y) * 0.3), z: r(bb.max.z + 0.05), yaw: 0, pitch: 0, roll: 0 };
  if (id === 'back') return { x: 0, y: r(bb.min.y + (top - bb.min.y) * 0.35), z: r(bb.min.z - 0.05 - s * 0.5), yaw: 180, pitch: 0, roll: 0 };
  if (id === 'left') return { x: r(hw + 0.05), y: r(bb.min.y + (top - bb.min.y) * 0.45), z: r(cz), yaw: 90, pitch: 0, roll: 0 };
  if (id === 'right') return { x: r(-hw - 0.05), y: r(bb.min.y + (top - bb.min.y) * 0.45), z: r(cz), yaw: -90, pitch: 0, roll: 0 };
  return { x: 0, y: r(top), z: r(cz - L * 0.05), yaw: 0, pitch: 0, roll: 0 }; // roof
}
// Keep a car's ornaments in step with list (one { h, m, data } or null per slot). Call every frame; cheap when nothing changed.
export function syncOrnaments(mesh, list, dt = 0) {
  const ud = mesh.userData;
  let root = ud.ornRoot;
  if (!root || root.parent !== mesh) { root = ud.ornRoot = new THREE.Group(); root.name = 'ornaments'; mesh.add(root); ud.ornSlots = []; }
  const slots = ud.ornSlots;
  for (let i = 0; i < ORN_SLOTS; i++) {
    const a = list[i], ok = a && typeof a.data === 'string' && a.h, key = ok ? String(a.h) + ':' + (a.m?.ext || '') : '';
    let s = slots[i];
    if (!s || s.key !== key) {
      if (s && s.g) root.remove(s.g);
      s = slots[i] = { key, g: null, inner: null, err: false, t: 0 };
      if (ok) {
        const me = s, m = cleanPlace(a.m);
        modelTemplate({ h: a.h, ext: m.ext, data: a.data }).then(tpl => {
          if (slots[i] !== me) return;
          const inner = tpl.clone(true); inner.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), big = Math.max(size.x, size.y, size.z);
          const k = isFinite(big) && big > 1e-6 ? 1 / big : 1, c = box.getCenter(new THREE.Vector3());
          const norm = new THREE.Group(); inner.position.set(-c.x, -box.min.y, -c.z); norm.add(inner); norm.scale.setScalar(k); // 1 m tall/long/wide at most, sitting on its base
          const spinG = new THREE.Group(); spinG.add(norm); const g = new THREE.Group(); g.add(spinG);
          g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
          me.g = g; me.spin = spinG; root.add(g);
        }).catch(e => { me.err = true; console.warn('[overpass] ornament failed', e); });
      }
    }
    if (s.g && ok) {
      const m = cleanPlace(a.m), D = Math.PI / 180;
      s.g.visible = !!m.on; s.g.position.set(m.x, m.y, m.z); s.g.rotation.set(m.pitch * D, m.yaw * D, m.roll * D, 'YXZ'); s.g.scale.setScalar(m.s);
      if (m.spin) { s.t += dt; s.spin.rotation.y = s.t * 2.4; } else if (s.spin.rotation.y) { s.spin.rotation.y = 0; s.t = 0; }
    }
  }
  return slots.map(s => s && s.err);
}
