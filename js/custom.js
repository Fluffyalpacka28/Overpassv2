import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Custom car looks: your own 3D model (GLB / GLTF / OBJ / STL) and picture paint jobs.
// Files are kept in memory for this visit, and are shared with multiplayer
// friends as base64 chunks over a reliable data channel (see net.js).

export const MAX_MODEL_BYTES = 6 * 1024 * 1024;
export const SKIN_SCALES = [[1, 'Large'], [2, 'Medium'], [4, 'Small']];

// ---------- in-memory store (kept for this visit; re-upload after a reload) ----------
const mem = new Map();
export async function idbSet(k, v) { if (v == null) mem.delete(k); else mem.set(k, v); }
export async function idbGet(k) { return mem.get(k) ?? null; }

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
  body.traverse(o => { if (o.isMesh && o.visible) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); ref.union(bb); } });
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
  for (const ch of body.children) if (ch.visible) { ch.visible = false; ud.hiddenStock.push(ch); }
  // wheels live on the car group; keep the soft shadow blob, name tags, cockpit and VR rig
  carMesh.children.forEach(ch => { if (ch === body || ch.isSprite || !ch.visible || ch.userData.cockpit || ch.name === 'vr-rig' || (ch.isMesh && ch.material && ch.material.transparent)) return; ch.visible = false; ud.hiddenStock.push(ch); });
  body.add(holder); ud.customKey = key; ud.customHolder = holder;
  return holder;
}
export function clearModel(carMesh) {
  const ud = carMesh.userData; if (!ud.customHolder) return;
  ud.customHolder.parent && ud.customHolder.parent.remove(ud.customHolder);
  for (const o of ud.hiddenStock || []) o.visible = true;
  ud.hiddenStock = []; ud.customHolder = null; ud.customKey = '';
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
  p.map = null; p.color.set(color || carMesh.userData.baseColor || '#ff5a3c'); p.flatShading = true; p.needsUpdate = true;
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
