import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Custom car looks: your own 3D model (GLB / GLTF / OBJ / STL) and picture paint jobs.
// Models and paint pictures are saved on this device (see storage below) and are shared with
// multiplayer friends as base64 chunks over a reliable data channel (see net.js).

export const MAX_MODEL_BYTES = 6 * 1024 * 1024;
export const SKIN_SCALES = [[1, 'Large'], [2, 'Medium'], [4, 'Small']];

// ---------- storage ----------
// Saved on this device in IndexedDB (so custom cars survive a reload), with an in-memory copy as a fallback
// for browsers or sandboxes where IndexedDB isn't available.
const mem = new Map();
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('overpass-garage', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    } catch (e) { rej(e); }
  }).catch(() => null);
  return dbp;
}
export async function idbSet(k, v) {
  if (v == null) mem.delete(k); else mem.set(k, v);
  const d = await db(); if (!d) return;
  await new Promise(res => { try { const tx = d.transaction('kv', 'readwrite'), st = tx.objectStore('kv'); if (v == null) st.delete(k); else st.put(v, k); tx.oncomplete = tx.onerror = tx.onabort = () => res(); } catch { res(); } });
}
export async function idbGet(k) {
  if (mem.has(k)) return mem.get(k);
  const d = await db(); if (!d) return null;
  return new Promise(res => { try { const rq = d.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => { const v = rq.result ?? null; if (v != null) mem.set(k, v); res(v); }; rq.onerror = () => res(null); } catch { res(null); } });
}

// ---------- the garage's collection of named custom cars ----------
// index: [{ id, name, ext, size, h, rot, t }]; the model itself is stored separately under 'car:<id>' as { h, m, data }.
export const MAX_LIBRARY = 12;
const uid = () => Math.random().toString(36).slice(2, 10);
export async function libIndex() { const x = await idbGet('lib:index'); return Array.isArray(x) ? x : []; }
export async function libGet(id) { return idbGet('car:' + id); }
export async function libSave(name, a) { // returns { entry, dup } — the same model is only stored once
  const idx = await libIndex(), dup = idx.find(e => e.h === a.h);
  if (dup) return { entry: dup, dup: true };
  if (idx.length >= MAX_LIBRARY) throw new Error(`Your garage holds ${MAX_LIBRARY} custom cars. Delete one to make room.`);
  const entry = { id: uid(), name: String(name || a.m.name || 'My car').slice(0, 24), ext: a.m.ext, size: a.m.size || 0, h: a.h, rot: a.m.rot | 0, t: Date.now() };
  await idbSet('car:' + entry.id, a); idx.push(entry); await idbSet('lib:index', idx); return { entry, dup: false };
}
export async function libUpdate(id, patch) { const idx = await libIndex(), e = idx.find(x => x.id === id); if (!e) return null; Object.assign(e, patch); await idbSet('lib:index', idx); return e; }
export async function libRemove(id) { const idx = (await libIndex()).filter(e => e.id !== id); await idbSet('car:' + id, null); await idbSet('lib:index', idx); return idx; }

// ---------- encoding helpers ----------
export function bufToB64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
export function b64ToBuf(s) { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
export function hashStr(s) { // FNV-1a over a sample of the data + its length: fast and plenty for de-duplication
  let h = 0x811c9dc5; const step = Math.max(1, Math.floor(s.length / 200000));
  for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// ---------- 3D models ----------
const gltf = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); gltf.setDRACOLoader(draco);
const templates = new Map(); // hash -> Promise<Object3D>

function parseModel(ext, buf) {
  ext = (ext || 'glb').toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return new Promise((res, rej) => gltf.parse(ext === 'gltf' ? new TextDecoder().decode(buf) : buf, '', g => res(g.scene), e => rej(e)));
  if (ext === 'obj') { const o = new OBJLoader().parse(new TextDecoder().decode(buf)); return Promise.resolve(o); }
  if (ext === 'stl') { const geo = new STLLoader().parse(buf); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#c8ccd4', roughness: 0.5, metalness: 0.3 })); m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); return Promise.resolve(g); }
  return Promise.reject(new Error('Unsupported file type .' + ext));
}
// a: {h, ext, data(base64)} -> cached template
export function modelTemplate(a) {
  if (!templates.has(a.h)) templates.set(a.h, parseModel(a.ext, b64ToBuf(a.data)).then(o => {
    o.traverse(m => {
      if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = false;
      // OBJ/STL often arrive without usable materials
      if (!m.material || (Array.isArray(m.material) && !m.material.length)) m.material = new THREE.MeshStandardMaterial({ color: '#c8ccd4' });
      const fix = mt => { if (mt.isMeshBasicMaterial && !mt.map) return new THREE.MeshStandardMaterial({ color: mt.color, roughness: 0.6 }); mt.side = THREE.FrontSide; return mt; };
      m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
    });
    return o;
  }));
  return templates.get(a.h);
}
export async function testModel(ext, buf) { const o = await parseModel(ext, buf); let n = 0; o.traverse(m => { if (m.isMesh) n++; }); if (!n) throw new Error('No meshes found in that file'); return n; }

// Swap a car's built-in body for a custom model, fitted to the same footprint.
// rot: quarter turns so the nose points forward (+Z).
export function applyModel(carMesh, tpl, rot = 0, key = '') {
  clearModel(carMesh);
  const ud = carMesh.userData, body = ud.body;
  // footprint of the built-in body (before hiding it)
  carMesh.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(carMesh.matrixWorld).invert(), ref = new THREE.Box3(), bb = new THREE.Box3();
  body.traverse(o => { if (o.isMesh && o.visible && !(o.parent && o.parent.name === 'ornaments')) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); ref.union(bb); } });
  const len = Math.max(1.6, ref.max.z - ref.min.z), wid = Math.max(0.6, ref.max.x - ref.min.x);
  const holder = new THREE.Group(); holder.name = 'custom-body'; holder.userData.custom = true;
  const inner = tpl.clone(true); const spin = new THREE.Group(); spin.rotation.y = rot * Math.PI / 2; spin.add(inner); holder.add(spin);
  spin.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(spin), size = box.getSize(new THREE.Vector3());
  // longest side becomes the length; don't let it end up wider than ~1.2x the original car
  let s = len / Math.max(1e-6, size.z); if (size.x * s > wid * 1.25) s = wid * 1.25 / size.x;
  if (!isFinite(s) || s <= 0) s = 1;
  spin.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  spin.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  // hide the stock body + wheels, keep name tags and sprites
  ud.hiddenStock = [];
  for (const ch of body.children) if (ch.visible && ch.name !== 'ornaments') { ch.visible = false; ud.hiddenStock.push(ch); }
  // wheels live on the car group; keep the soft shadow blob, name tags, cockpit and VR rig
  carMesh.children.forEach(ch => { if (ch === body || ch.isSprite || ch.name === 'ornaments' || ch.name === 'wings' || ch.name === 'floaties' || ch.name === 'companion' || !ch.visible || ch.userData.cockpit || ch.name === 'vr-rig' || (ch.isMesh && ch.material && ch.material.transparent)) return; ch.visible = false; ud.hiddenStock.push(ch); });
  body.add(holder); ud.customKey = key; ud.customHolder = holder;
  return holder;
}
export function clearModel(carMesh) {
  const ud = carMesh.userData; if (!ud.customHolder) return;
  ud.customHolder.parent && ud.customHolder.parent.remove(ud.customHolder);
  for (const o of ud.hiddenStock || []) o.visible = true;
  ud.hiddenStock = []; ud.customHolder = null; ud.customKey = '';
}

// ---------- custom wheels: your own wheel model on every wheel ----------
// m: { sz: size (1 = the car's own wheel size), wd: width, axle: 'auto' | 'x' | 'y' | 'z' (which way the model's axle points), flip }
// The model is centred, turned so its axle lines up with the car's axles, sized to each wheel, and mirrored on the left so the
// rim faces outwards on both sides. The stock tyre and rim are hidden; brake calipers stay.
export function applyWheels(carMesh, tpl, m, key) {
  const ud = carMesh.userData; clearWheels(carMesh); if (!ud.wheels) return;
  const base = tpl.clone(true), box = new THREE.Box3().setFromObject(base), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  // the axle is the model's thinnest direction, unless you say otherwise
  let axle = m.axle && m.axle !== 'auto' ? m.axle : size.x <= size.y && size.x <= size.z ? 'x' : size.y <= size.z ? 'y' : 'z';
  const turn = new THREE.Group(); base.position.sub(c); turn.add(base);
  if (axle === 'y') turn.rotation.z = Math.PI / 2; else if (axle === 'z') turn.rotation.y = Math.PI / 2;
  const across = axle === 'x' ? Math.max(size.y, size.z) : axle === 'y' ? Math.max(size.x, size.z) : Math.max(size.x, size.y), thick = axle === 'x' ? size.x : axle === 'y' ? size.y : size.z;
  ud.wheelG = [];
  for (const w of ud.wheels) {
    const r = w.r || 0.4, s = (2 * r * (m.sz || 1)) / Math.max(1e-6, across);
    // stock wheels are about 0.8 x the radius wide; keep the model's own proportions unless the width is changed
    const g = new THREE.Group(); g.name = 'custom-wheel'; const inner = turn.clone(true); g.add(inner);
    const left = w.pivot.position.x < 0 !== !!m.flip;
    g.scale.set(s * (m.wd || 1) * (left ? -1 : 1), s, s); void thick;
    inner.traverse(o => { if (o.isMesh) { o.castShadow = true; if (left) { const mats = [].concat(o.material); for (const mt of mats) if (mt) mt.side = THREE.DoubleSide; } } });
    w.wheelHidden = []; for (const o of w.spin.children) if (o.visible) { o.visible = false; w.wheelHidden.push(o); }
    w.spin.add(g); ud.wheelG.push(g);
  }
  ud.wheelKey = key;
}
export function clearWheels(carMesh) {
  const ud = carMesh.userData; if (!ud.wheelG) return;
  for (const g of ud.wheelG) g.parent && g.parent.remove(g);
  for (const w of ud.wheels || []) { for (const o of w.wheelHidden || []) o.visible = true; w.wheelHidden = null; if (w.forced) { w.forced = false; if (ud.customHolder) w.pivot.visible = false; } }
  ud.wheelG = null; ud.wheelKey = '';
}
// with an uploaded body the stock wheels are hidden; custom wheels bring them back
export function keepWheelsShown(carMesh) {
  const ud = carMesh.userData; if (!ud.wheelG || !ud.wheels) return;
  for (const w of ud.wheels) if (!w.pivot.visible) { w.pivot.visible = true; w.forced = true; }
}

// ---------- picture paint ----------
const skinTex = new Map();
export function skinTexture(h, dataUrl) {
  if (skinTex.has(h)) return skinTex.get(h);
  const t = new THREE.TextureLoader().load(dataUrl); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  skinTex.set(h, t); return t;
}
// Each car gets its own paint material, so cloning the texture per car lets the pattern size differ.
export function applySkin(carMesh, tex, scale = 1, key = '') {
  const p = carMesh.userData.paint; if (!p) return;
  if (!carMesh.userData.baseColor) carMesh.userData.baseColor = p.color.getStyle();
  let t = carMesh.userData.skinTex;
  if (!t || t.source !== tex.source) { t && t.dispose(); t = tex.clone(); t.needsUpdate = true; carMesh.userData.skinTex = t; }
  t.repeat.set(0.45 * scale, 0.45 * scale);
  p.map = t; p.color.set('#ffffff'); p.flatShading = false; p.needsUpdate = true; carMesh.userData.skinKey = key;
}
export function clearSkin(carMesh, color) {
  const p = carMesh.userData.paint; if (!p || !p.map) return;
  p.map = null; p.color.set(color || carMesh.userData.baseColor || '#ff5a3c'); p.flatShading = false; p.needsUpdate = true;
  carMesh.userData.skinTex && carMesh.userData.skinTex.dispose(); carMesh.userData.skinTex = null; carMesh.userData.skinKey = '';
}
// Shrink an uploaded picture to a shareable square JPEG
export function imageToSkin(file, size = 512) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      // cover-fit the square
      const k = Math.max(size / img.width, size / img.height), w = img.width * k, h = img.height * k;
      x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    img.src = url;
  });
}
