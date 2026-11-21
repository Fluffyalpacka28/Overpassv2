import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { barkTexture, foliageTexture } from './textures.js';
import { SEASON, snowify } from './season.js';

// Tree species for World Drive. Every species is one low-poly geometry with two groups (trunk, crown), drawn instanced per tile.
// Which species goes where comes from OpenStreetMap when it says (leaf_type on woods, genus/species/leaf_type on single trees),
// otherwise from the kind of place (forest, park, orchard, scrub, swamp, gardens) and how far from the equator you are.
const NI = g => g.index ? g.toNonIndexed() : g;
const two = (trunk, crown) => mergeGeometries([mergeGeometries(trunk.map(NI)), mergeGeometries(crown.map(NI))], true);
const blob = (r, x, y, z, sx = 1, sy = 1, sz = 1, det = 0) => { const g = new THREE.IcosahedronGeometry(r, det); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
const cyl = (r0, r1, h, y, x = 0, z = 0, seg = 6) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return g; };
const cone = (r, h, y, seg = 8) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, y, 0); return g; };

// bare branches inside the crown of broadleaf trees: hidden by the leaves in summer, they're what you see in winter
function branches(y0, y1, n, len, tilt, r0 = 0.11, seed = 1) {
  const out = []; let s = seed * 9301 + 49297; const rr = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996 + rr() * 0.6, y = y0 + (y1 - y0) * (k + 0.5) / n, l = len * (0.75 + rr() * 0.4), t = tilt * (0.8 + rr() * 0.4);
    const g = new THREE.CylinderGeometry(r0 * 0.35, r0, l, 4); g.translate(0, l / 2, 0); g.rotateZ(t); g.rotateY(a); g.translate(0, y, 0); out.push(g);
    // a twig forking off two thirds of the way out
    const bx = -Math.sin(t) * l * 0.66, by = Math.cos(t) * l * 0.66, tw = new THREE.CylinderGeometry(r0 * 0.18, r0 * 0.45, l * 0.5, 3);
    tw.translate(0, l * 0.25, 0); tw.rotateZ(t * 0.35); tw.rotateY(a + (rr() < 0.5 ? 0.7 : -0.7)); tw.translate(Math.cos(a) * bx, y + by, -Math.sin(a) * bx); out.push(tw);
  }
  return out;
}
export const EVERGREEN = new Set(['pine', 'spruce', 'cypress', 'palm']);

export const SPECIES = {
  pine: { geo: () => two([cyl(0.28, 0.42, 2.4, 1.2)], [cone(2.3, 3.8, 3.6), cone(1.8, 3.2, 5.2), cone(1.1, 2.4, 6.7, 7)]), bark: 'brown', leaf: ['#2f6a3c', '#3f7a45'] },
  spruce: { geo: () => two([cyl(0.22, 0.34, 2, 1)], [cone(2.0, 3.2, 2.6), cone(1.7, 3, 4.1), cone(1.35, 2.8, 5.6), cone(0.95, 2.4, 7.0), cone(0.55, 1.8, 8.3, 7)]), bark: 'brown', leaf: ['#244f36', '#2f5e40'] },
  oak: { geo: () => two([cyl(0.3, 0.48, 3, 1.5), cyl(0.12, 0.18, 1.8, 3.4, 0.7, 0.2), cyl(0.12, 0.26, 2.2, 4.0), ...branches(2.9, 4.6, 7, 2.5, 0.95, 0.14, 3)], [blob(2.4, 0, 4.8, 0, 1.15, 0.85, 1.1), blob(1.6, 1.6, 4.3, 0.6), blob(1.7, -1.4, 4.4, -0.7), blob(1.5, 0.3, 5.9, -0.3), blob(1.3, -0.6, 4.6, 1.5)]), bark: 'brown', leaf: ['#4e8a3c', '#6b9a3a'] },
  maple: { geo: () => two([cyl(0.25, 0.4, 2.8, 1.4), cyl(0.1, 0.24, 2.6, 4.0), ...branches(2.8, 5.2, 7, 2.2, 0.75, 0.12, 5)], [blob(2.3, 0, 4.9, 0, 1, 1.05, 1), blob(1.5, 1.3, 5.1, 0.5), blob(1.5, -1.2, 5, -0.4), blob(1.3, 0, 6.4, 0)]), bark: 'grey', leaf: ['#5d9a3a', '#8aa63a', '#c98a2e', '#c4552c'] },
  birch: { geo: () => two([cyl(0.14, 0.2, 5.5, 2.75), cyl(0.05, 0.12, 1.6, 6.2), ...branches(3.2, 6.0, 7, 1.25, 0.55, 0.07, 7)], [blob(1.25, 0, 5.2, 0, 0.9, 1.7, 0.9), blob(0.9, 0.5, 4.2, 0.3, 0.9, 1.4, 0.9), blob(0.8, -0.4, 6.3, -0.2)]), bark: 'white', leaf: ['#7fae46', '#9cbc52'] },
  poplar: { geo: () => two([cyl(0.18, 0.28, 2, 1), cyl(0.07, 0.18, 5.6, 4.8), ...branches(2.2, 7.4, 8, 1.6, 0.3, 0.08, 9)], [blob(1.25, 0, 5.4, 0, 0.9, 3.4, 0.9)]), bark: 'grey', leaf: ['#4f8a3e', '#5f9640'] },
  cypress: { geo: () => two([cyl(0.15, 0.22, 1.2, 0.6)], [blob(0.95, 0, 4.2, 0, 1, 3.8, 1, 1)]), bark: 'brown', leaf: ['#2e5a33', '#3a6638'] },
  willow: { geo: () => { const crown = [blob(2.4, 0, 4.4, 0, 1.15, 0.7, 1.15)], bough = branches(3.2, 4.4, 7, 2.1, 1.05, 0.13, 11); for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, g = new THREE.CylinderGeometry(0.75, 0.25, 3.4, 5, 1, true); g.translate(Math.cos(a) * 2.1, 2.8, Math.sin(a) * 2.1); crown.push(g); } return two([cyl(0.32, 0.5, 3.4, 1.7), ...bough], crown); }, bark: 'brown', leaf: ['#88aa4a', '#9ab85a'] },
  palm: { geo: () => { const t = []; let x = 0, y = 0; for (let k = 0; k < 7; k++) { const g = new THREE.CylinderGeometry(0.2 - k * 0.01, 0.28 - k * 0.01, 1.4, 6); g.rotateZ(-k * 0.05); g.translate(x, y + 0.7, 0); t.push(g); x += Math.sin(k * 0.05) * 1.4 + 0.07; y += 1.36; }
    const fr = []; for (let k = 0; k < 9; k++) { const f = new THREE.ConeGeometry(0.55, 3.9, 4, 1); f.scale(1, 1, 0.18); f.rotateZ(Math.PI / 2 + 0.55); f.translate(1.75, -0.4, 0); f.rotateY(k / 9 * Math.PI * 2); f.translate(x, y + 0.2, 0); fr.push(f); }
    fr.push(blob(0.45, x, y, 0, 1, 1, 1, 0)); return two(t, fr); }, bark: 'palm', leaf: ['#4f9a44', '#79ad4a'] },
  fruit: { geo: () => two([cyl(0.18, 0.26, 1.6, 0.8), ...branches(1.5, 2.6, 6, 1.45, 0.85, 0.1, 13)], [blob(1.6, 0, 2.7, 0, 1.1, 0.85, 1.1), blob(1.0, 0.8, 2.4, 0.4)]), bark: 'brown', leaf: ['#5e9a3c', '#7aa846'] },
  bush: { geo: () => two([cyl(0.08, 0.12, 0.4, 0.2)], [blob(1.0, 0, 0.75, 0, 1.25, 0.8, 1.1, 1), blob(0.7, 0.8, 0.55, 0.3, 1, 0.8, 1, 1), blob(0.65, -0.7, 0.55, -0.3, 1, 0.8, 1, 1)]), bark: 'brown', leaf: ['#4f7f3a', '#6f8a3e'] },
};
let MATS = null;
// one steady random number per tree, from where it stands (the same in the leaf and shadow shaders)
const LEAF_HASH = '\nfloat leafHash(vec2 p) { return fract(sin(dot(floor(p * 4.0), vec2(12.9898, 78.233))) * 43758.5453); }\n';
export function treeMaterials() {
  if (MATS) return MATS;
  const bt = barkTexture(), ft = foliageTexture();
  const bark = { brown: new THREE.MeshStandardMaterial({ color: '#8a6a4c', map: bt, roughness: 1 }), grey: new THREE.MeshStandardMaterial({ color: '#8d8a84', map: bt, roughness: 1 }),
    white: new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.9 }), palm: new THREE.MeshStandardMaterial({ color: '#9c8160', map: bt, roughness: 1 }) };
  // trunks keep their own colour: the per-tree tint (instance colour) is only for the leaves
  for (const k in bark) { bark[k].onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', ''); }; bark[k].customProgramCacheKey = () => 'tree-bark-notint'; }
  const leaf = snowify(new THREE.MeshStandardMaterial({ color: '#ffffff', map: ft, roughness: 0.95, flatShading: true }), 'leaf-ever', { up: [0.25, 0.65] });
  // broadleaf crowns: autumn colours tree by tree, then each tree drops its leaves at its own moment (uBare), fresh green in spring
  const decid = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ft, roughness: 0.95, flatShading: true });
  decid.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uBare: SEASON.uBare, uAutumn: SEASON.uAutumn, uSpring: SEASON.uSpring });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uBare; varying float vLr;' + LEAF_HASH)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvLr = leafHash(instanceMatrix[3].xz);\nif (vLr < uBare) transformed *= 0.0;\n#else\nvLr = 0.5;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAutumn, uSpring; varying float vLr;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float h = fract(vLr * 7.13);
    vec3 ac = h < 0.38 ? vec3(1.0, 0.8, 0.2) : h < 0.72 ? vec3(1.0, 0.5, 0.13) : vec3(0.86, 0.2, 0.1);
    float at = clamp(uAutumn * 1.7 - fract(vLr * 3.71) * 0.7, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, ac * l * 2.1, at);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.22, 1.32, 0.7), uSpring * (0.6 + 0.4 * fract(vLr * 5.3))); }`);
  };
  decid.customProgramCacheKey = () => 'tree-leaf-decid-v1';
  snowify(decid, 'leaf-decid', { up: [0.25, 0.65] });
  // bushes don't vanish in winter: they go brown and twiggy
  const bush = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ft, roughness: 0.95, flatShading: true });
  bush.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uBare: SEASON.uBare, uAutumn: SEASON.uAutumn });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBare, uAutumn;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.5, 1.05, 0.7), clamp(uAutumn * 0.45 + uBare * 0.8, 0.0, 0.85)); }`);
  };
  bush.customProgramCacheKey = () => 'tree-leaf-bush-v1';
  snowify(bush, 'leaf-bush', { up: [0.25, 0.65] });
  // shadows of bare trees lose their crowns too
  const decidDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  decidDepth.onBeforeCompile = sh => {
    sh.uniforms.uBare = SEASON.uBare;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uBare; attribute float aCrown;' + LEAF_HASH)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nif (aCrown > 0.5 && leafHash(instanceMatrix[3].xz) < uBare) transformed *= 0.0;\n#endif');
  };
  decidDepth.customProgramCacheKey = () => 'tree-decid-depth-v1';
  return (MATS = { bark, leaf, decid, bush, decidDepth });
}
let GEOS = null;
export function treeGeometries() {
  if (!GEOS) {
    GEOS = {};
    for (const k in SPECIES) {
      const g = GEOS[k] = SPECIES[k].geo(), n = g.attributes.position.count, a = new Float32Array(n), cr = g.groups[1];
      if (cr) for (let i = cr.start; i < Math.min(n, cr.start + cr.count); i++) a[i] = 1; // crown vertices (the geometry is non-indexed)
      g.setAttribute('aCrown', new THREE.BufferAttribute(a, 1));
    }
  }
  return GEOS;
}

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
    const L = by[sp], S = SPECIES[sp], kind = EVERGREEN.has(sp) ? 'ever' : sp === 'bush' ? 'bush' : 'decid', m = new THREE.InstancedMesh(G[sp], [M.bark[S.bark], kind === 'ever' ? M.leaf : M[kind]], L.length);
    if (kind === 'decid') m.customDepthMaterial = M.decidDepth;
    L.forEach((t, i) => {
      o.position.set(t.x, t.y - 0.2, t.z); const s = t.s; o.scale.set(s, s * (0.88 + hash(i * 7 + 3) * 0.3), s); o.rotation.set(0, t.r * 6.28, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      const cols = S.leaf, k = hash(i * 31 + 11) * (cols.length - 1), a = Math.floor(k); A.set(cols[a]); B.set(cols[Math.min(cols.length - 1, a + 1)]); c.copy(A).lerp(B, k - a).multiplyScalar(1.05 + hash(i * 17 + 5) * 0.25); m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true; m.userData.sharedGeo = true; m.userData.trees = L; out.push(m);
  }
  return out;
}
