import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { barkTexture, foliageTexture } from './textures.js';

// Tree species for World Drive. Every species is one low-poly geometry with two groups (trunk, crown), drawn instanced per tile.
// Which species goes where comes from OpenStreetMap when it says (leaf_type on woods, genus/species/leaf_type on single trees),
// otherwise from the kind of place (forest, park, orchard, scrub, swamp, gardens) and how far from the equator you are.
const NI = g => g.index ? g.toNonIndexed() : g;
const two = (trunk, crown) => mergeGeometries([mergeGeometries(trunk.map(NI)), mergeGeometries(crown.map(NI))], true);
const blob = (r, x, y, z, sx = 1, sy = 1, sz = 1, det = 0) => { const g = new THREE.IcosahedronGeometry(r, det); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, y, x = 0, z = 0, seg = 6) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return g; };
const cone = (r, h, y, seg = 8) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, y, 0); return g; };

export const SPECIES = {
  pine: { geo: () => two([cyl(0.28, 0.42, 2.4, 1.2)], [cone(2.3, 3.8, 3.6), cone(1.8, 3.2, 5.2), cone(1.1, 2.4, 6.7, 7)]), bark: 'brown', leaf: ['#2f6a3c', '#3f7a45'] },
  spruce: { geo: () => two([cyl(0.22, 0.34, 2, 1)], [cone(2.0, 3.2, 2.6), cone(1.7, 3, 4.1), cone(1.35, 2.8, 5.6), cone(0.95, 2.4, 7.0), cone(0.55, 1.8, 8.3, 7)]), bark: 'brown', leaf: ['#244f36', '#2f5e40'] },
  oak: { geo: () => two([cyl(0.3, 0.48, 3, 1.5), cyl(0.12, 0.18, 1.8, 3.4, 0.7, 0.2)], [blob(2.4, 0, 4.8, 0, 1.15, 0.85, 1.1), blob(1.6, 1.6, 4.3, 0.6), blob(1.7, -1.4, 4.4, -0.7), blob(1.5, 0.3, 5.9, -0.3), blob(1.3, -0.6, 4.6, 1.5)]), bark: 'brown', leaf: ['#4e8a3c', '#6b9a3a'] },
  maple: { geo: () => two([cyl(0.25, 0.4, 2.8, 1.4)], [blob(2.3, 0, 4.9, 0, 1, 1.05, 1), blob(1.5, 1.3, 5.1, 0.5), blob(1.5, -1.2, 5, -0.4), blob(1.3, 0, 6.4, 0)]), bark: 'grey', leaf: ['#5d9a3a', '#8aa63a', '#c98a2e', '#c4552c'] },
  birch: { geo: () => two([cyl(0.14, 0.2, 5.5, 2.75)], [blob(1.25, 0, 5.2, 0, 0.9, 1.7, 0.9), blob(0.9, 0.5, 4.2, 0.3, 0.9, 1.4, 0.9), blob(0.8, -0.4, 6.3, -0.2)]), bark: 'white', leaf: ['#7fae46', '#9cbc52'] },
  poplar: { geo: () => two([cyl(0.18, 0.28, 2, 1)], [blob(1.25, 0, 5.4, 0, 0.9, 3.4, 0.9)]), bark: 'grey', leaf: ['#4f8a3e', '#5f9640'] },
  cypress: { geo: () => two([cyl(0.15, 0.22, 1.2, 0.6)], [blob(0.95, 0, 4.2, 0, 1, 3.8, 1, 1)]), bark: 'brown', leaf: ['#2e5a33', '#3a6638'] },
  willow: { geo: () => { const crown = [blob(2.4, 0, 4.4, 0, 1.15, 0.7, 1.15)]; for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, g = new THREE.CylinderGeometry(0.75, 0.25, 3.4, 5, 1, true); g.translate(Math.cos(a) * 2.1, 2.8, Math.sin(a) * 2.1); crown.push(g); } return two([cyl(0.32, 0.5, 3.4, 1.7)], crown); }, bark: 'brown', leaf: ['#88aa4a', '#9ab85a'] },
  palm: { geo: () => { const t = []; let x = 0, y = 0; for (let k = 0; k < 7; k++) { const g = new THREE.CylinderGeometry(0.2 - k * 0.01, 0.28 - k * 0.01, 1.4, 6); g.rotateZ(-k * 0.05); g.translate(x, y + 0.7, 0); t.push(g); x += Math.sin(k * 0.05) * 1.4 + 0.07; y += 1.36; }
    const fr = []; for (let k = 0; k < 9; k++) { const f = new THREE.ConeGeometry(0.55, 3.9, 4, 1); f.scale(1, 1, 0.18); f.rotateZ(Math.PI / 2 + 0.55); f.translate(1.75, -0.4, 0); f.rotateY(k / 9 * Math.PI * 2); f.translate(x, y + 0.2, 0); fr.push(f); }
    fr.push(blob(0.45, x, y, 0, 1, 1, 1, 0)); return two(t, fr); }, bark: 'palm', leaf: ['#4f9a44', '#79ad4a'] },
  fruit: { geo: () => two([cyl(0.18, 0.26, 1.6, 0.8)], [blob(1.6, 0, 2.7, 0, 1.1, 0.85, 1.1), blob(1.0, 0.8, 2.4, 0.4)]), bark: 'brown', leaf: ['#5e9a3c', '#7aa846'] },
  bush: { geo: () => two([cyl(0.08, 0.12, 0.4, 0.2)], [blob(1.0, 0, 0.75, 0, 1.25, 0.8, 1.1, 1), blob(0.7, 0.8, 0.55, 0.3, 1, 0.8, 1, 1), blob(0.65, -0.7, 0.55, -0.3, 1, 0.8, 1, 1)]), bark: 'brown', leaf: ['#4f7f3a', '#6f8a3e'] },
};
let MATS = null;
export function treeMaterials() {
  if (MATS) return MATS;
  const bt = barkTexture(), ft = foliageTexture();
  const bark = { brown: new THREE.MeshStandardMaterial({ color: '#8a6a4c', map: bt, roughness: 1 }), grey: new THREE.MeshStandardMaterial({ color: '#8d8a84', map: bt, roughness: 1 }),
    white: new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.9 }), palm: new THREE.MeshStandardMaterial({ color: '#9c8160', map: bt, roughness: 1 }) };
  // trunks keep their own colour: the per-tree tint (instance colour) is only for the leaves
  for (const k in bark) { bark[k].onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', ''); }; bark[k].customProgramCacheKey = () => 'tree-bark-notint'; }
  const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ft, roughness: 0.95, flatShading: true });
  return (MATS = { bark, leaf });
}
let GEOS = null;
export function treeGeometries() { if (!GEOS) { GEOS = {}; for (const k in SPECIES) GEOS[k] = SPECIES[k].geo(); } return GEOS; }

// what grows here? ctx: { lat, wood: 'needle' | 'broad' | 'mixed' | '', place: 'forest' | 'park' | 'orchard' | 'scrub' | 'swamp' | 'garden' | 'row' | 'tree', genus, nearWater }
const GENUS = [[/pinus|pine/i, 'pine'], [/picea|abies|spruce|fir|tsuga|pseudotsuga|cedrus|larix|larch|cedar/i, 'spruce'], [/quercus|oak|fagus|beech|castanea|ulmus|elm|fraxinus|ash|tilia|linden|lime/i, 'oak'],
  [/acer|maple|sycamore|platanus|plane|liquidambar|sweetgum/i, 'maple'], [/betula|birch|alnus|alder/i, 'birch'], [/populus|poplar|aspen/i, 'poplar'], [/cupressus|cypress|juniperus|thuja|taxus|sequoia/i, 'cypress'],
  [/salix|willow/i, 'willow'], [/arecaceae|palm|phoenix|washingtonia|cocos|sabal|roystonea|trachycarpus/i, 'palm'], [/malus|prunus|pyrus|citrus|olea|olive|cherry|apple|pear|plum/i, 'fruit']];
export function pickSpecies(ctx, r) {
  if (ctx.genus) for (const [re, sp] of GENUS) if (re.test(ctx.genus)) return sp;
  const lat = Math.abs(ctx.lat || 40), warm = lat < 30, cold = lat > 52;
  if (ctx.place === 'orchard') return 'fruit';
  if (ctx.place === 'scrub') return r < 0.85 ? 'bush' : (warm ? 'palm' : 'cypress');
  if (ctx.place === 'swamp') return r < 0.5 ? 'willow' : r < 0.8 ? 'birch' : 'poplar';
  if (ctx.wood === 'needle') return r < 0.55 ? 'pine' : 'spruce';
  if (ctx.wood === 'broad') return cold ? (r < 0.55 ? 'birch' : 'oak') : r < 0.45 ? 'oak' : r < 0.8 ? 'maple' : r < 0.92 ? 'birch' : 'poplar';
  if (ctx.place === 'forest' || ctx.wood === 'mixed') {
    if (cold) return r < 0.4 ? 'spruce' : r < 0.65 ? 'pine' : r < 0.9 ? 'birch' : 'poplar';
    if (warm) return r < 0.35 ? 'pine' : r < 0.6 ? 'oak' : r < 0.8 ? 'palm' : 'cypress';
    return r < 0.3 ? 'pine' : r < 0.45 ? 'spruce' : r < 0.7 ? 'oak' : r < 0.88 ? 'maple' : 'birch';
  }
  if (ctx.nearWater && r < 0.25) return 'willow';
  // parks, gardens, streets and yards
  if (warm) return r < 0.4 ? 'palm' : r < 0.6 ? 'oak' : r < 0.75 ? 'cypress' : r < 0.9 ? 'fruit' : 'bush';
  if (cold) return r < 0.35 ? 'birch' : r < 0.6 ? 'spruce' : r < 0.85 ? 'maple' : 'bush';
  return r < 0.3 ? 'oak' : r < 0.55 ? 'maple' : r < 0.65 ? 'birch' : r < 0.73 ? 'poplar' : r < 0.8 ? 'pine' : r < 0.9 ? 'fruit' : 'bush';
}
// trees: [{ x, z, y, s, r, sp }] -> one InstancedMesh per species (trunk + crown groups), crown tinted per tree
export function buildTreeMeshes(trees, hash) {
  const G = treeGeometries(), M = treeMaterials(), by = {}, out = [];
  for (const t of trees) (by[t.sp] || (by[t.sp] = [])).push(t);
  const o = new THREE.Object3D(), c = new THREE.Color(), A = new THREE.Color(), B = new THREE.Color();
  for (const sp in by) {
    const L = by[sp], S = SPECIES[sp], m = new THREE.InstancedMesh(G[sp], [M.bark[S.bark], M.leaf], L.length);
    L.forEach((t, i) => {
      o.position.set(t.x, t.y - 0.2, t.z); const s = t.s; o.scale.set(s, s * (0.88 + hash(i * 7 + 3) * 0.3), s); o.rotation.set(0, t.r * 6.28, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      const cols = S.leaf, k = hash(i * 31 + 11) * (cols.length - 1), a = Math.floor(k); A.set(cols[a]); B.set(cols[Math.min(cols.length - 1, a + 1)]); c.copy(A).lerp(B, k - a).multiplyScalar(1.05 + hash(i * 17 + 5) * 0.25); m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true; m.userData.sharedGeo = true; m.userData.trees = L; out.push(m);
  }
  return out;
}
