import * as THREE from 'three';
import { grassTexture, dirtTexture, rockTexture, macroTexture } from './textures.js';
import { SEASON, snowify } from './season.js';
// time for the seabed caustics (advanced by the game loop)
export const SEA_T = { value: 0 };

// Ground shader for the terrain chunks (a MeshStandardMaterial with a few extra lines, so lighting, shadows and fog all still work):
//  - grass sampled at two scales + big soft lush/dry patches, so it no longer looks like one flat repeated texture
//  - worn earth along road and path edges (from a small per-chunk "verge" mask painted from the road segments) and the odd bare patch
//  - rock on steep slopes (projected from three sides so cliffs don't smear)
// Every chunk gets its own material (only its verge mask differs); they all share one compiled shader.

let T = null;
const tex = () => T || (T = { grass: grassTexture(), dirt: dirtTexture(), rock: rockTexture(), macro: macroTexture() });
let BLANK = null;
const blank = () => { if (!BLANK) { BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLANK.needsUpdate = true; } return BLANK; };

const VERT_DECL = `#include <common>
varying vec3 vTW; varying vec3 vTN; attribute float aDepth; varying float vDepth;`;
const VERT_POS = `#include <begin_vertex>
vTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal); vDepth = aDepth;`;
const FRAG_DECL = `#include <common>
uniform sampler2D uDirt, uRock, uMacro, uVerge; uniform vec3 uChunk; uniform float uSnow, uDormant, uAutumn, uSeaT; varying float vDepth;
// caustics: the bright, shifting net of light the waves focus onto a shallow seabed
float cauN(vec2 p, float t) { vec2 q = p + vec2(sin(t * 0.7 + p.y * 0.35), cos(t * 0.6 + p.x * 0.31)) * 0.9; return abs(sin(q.x) * sin(q.y)); }
float caustics(vec2 p, float t) { float a = cauN(p * 0.9, t), b = cauN(p * 1.31 + 7.1, -t * 1.15); return pow(1.0 - min(a, b), 7.0); }
varying vec3 vTW; varying vec3 vTN;`;
const FRAG_COLOR = `{
  vec2 wp = vTW.xz;
  vec3 g1 = texture2D(map, wp / 14.0).rgb, g2 = texture2D(map, wp / 41.0 + 0.37).rgb;
  vec4 mc = texture2D(uMacro, wp / 480.0), mc2 = texture2D(uMacro, wp / 110.0 + 0.5);
  float bu = texture2D(uMacro, wp / 27.0).g;                                   // fine breakup noise
  vec3 tint = vColor.rgb;
  vec3 grass = mix(g1, g2, 0.4) * tint;
  float lush = smoothstep(0.3, 0.72, mc.r * 0.7 + mc2.r * 0.3);
  grass *= mix(vec3(1.07, 1.0, 0.78), vec3(0.85, 1.03, 0.86), lush);           // dry yellow-green <-> deep green patches
  grass *= 0.88 + 0.22 * mc2.g;
  vec3 dirt = texture2D(uDirt, wp / 9.0).rgb * mix(vec3(1.0), tint * 1.35, 0.2);
  float verge = texture2D(uVerge, (wp - uChunk.xy) / uChunk.z).r;
  float dk = clamp(verge * 1.85 - bu * 0.75 - 0.05, 0.0, 1.0);                 // ragged worn strip beside roads
  dk = max(dk, smoothstep(0.8, 0.95, mc2.g) * 0.55 * smoothstep(0.55, 0.75, bu)); // the odd bare patch
  vec3 col = mix(grass, dirt, dk);
  vec3 n = normalize(vTN), an = pow(abs(n), vec3(4.0)); an /= (an.x + an.y + an.z);
  vec3 rock = texture2D(uRock, vTW.zy / 12.0).rgb * an.x + texture2D(uRock, wp / 12.0).rgb * an.y + texture2D(uRock, vTW.xy / 12.0).rgb * an.z;
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float rk = smoothstep(0.1, 0.2, slope + (bu - 0.5) * 0.08);                   // steeper than ~27-37 degrees turns to rock
  col = mix(col, rock * vec3(0.93, 0.91, 0.88), rk);
  // seasons: grass goes straw-coloured while dormant (a little in autumn too), then snow lies on everything flat enough to hold it
  float sGr = (1.0 - dk) * (1.0 - rk);
  float sL = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(sL) * vec3(1.42, 1.12, 0.6), clamp(uDormant * 0.95 + uAutumn * 0.2, 0.0, 0.9) * sGr * (0.8 + 0.2 * lush));
  float sFlat = smoothstep(0.62, 0.9, n.y + (bu - 0.5) * 0.2);
  float sCov = clamp(uSnow * 1.7 - (1.0 - mc2.r * 0.6 - bu * 0.4) * 0.9 * (1.0 - uSnow) - verge * 0.35, 0.0, 1.0) * sFlat;
  vec3 snowC = mix(vec3(0.9, 0.92, 0.96), vec3(0.58, 0.56, 0.54), smoothstep(0.35, 0.9, verge) * 0.7) * (0.93 + 0.1 * bu);
  col = mix(col, snowC, sCov);
  // the seabed: sand in the shallows, silt and weed further down, light fading and turning blue-green with depth, plus caustics
  if (vDepth > 0.05) {
    float dz = vDepth, sh = smoothstep(0.1, 1.6, dz), deepK = smoothstep(3.0, 40.0, dz);
    vec3 sand = vec3(0.78, 0.71, 0.55) * (0.85 + 0.25 * mc2.r), silt = vec3(0.36, 0.42, 0.33) * (0.8 + 0.3 * bu);
    col = mix(col, mix(sand, silt, smoothstep(4.0, 18.0, dz + (mc2.g - 0.5) * 6.0)), sh);
    // water soaks up red first: the bed turns blue-green within a few metres and darkens the deeper it lies
    col *= mix(vec3(1.0), vec3(0.5, 0.74, 0.76), smoothstep(0.4, 9.0, dz)) * mix(1.0, 0.45, deepK);
    col += vec3(0.7, 0.92, 0.95) * caustics(wp * 0.42 + vec2(sin(wp.y * 0.05), cos(wp.x * 0.05)) * 2.0, uSeaT) * 0.3 * smoothstep(0.3, 1.2, dz) * (1.0 - smoothstep(4.0, 26.0, dz));
  }
  diffuseColor.rgb *= col;
}`;

// opts (story tracks): map = a different ground texture (sand, snow, ash, paving); plain = skip the green/yellow grass patches
export function terrainMaterial(opts = {}) {
  const t = tex(), U = { uDirt: { value: t.dirt }, uRock: { value: t.rock }, uMacro: { value: t.macro }, uVerge: { value: blank() }, uChunk: { value: new THREE.Vector3(0, 0, 320) }, uSnow: SEASON.uSnow, uDormant: SEASON.uDormant, uAutumn: SEASON.uAutumn, uSeaT: SEA_T };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: opts.map || t.grass });
  const frag = opts.plain ? FRAG_COLOR.replace('grass *= mix(vec3(1.07, 1.0, 0.78), vec3(0.85, 1.03, 0.86), lush);', 'grass *= mix(0.93, 1.05, lush);') : FRAG_COLOR;
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_DECL).replace('#include <begin_vertex>', VERT_POS);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', FRAG_DECL).replace('#include <map_fragment>', '').replace('#include <color_fragment>', frag);
  };
  m.customProgramCacheKey = () => 'overpass-terrain-v4' + (opts.plain ? '-plain' : '');
  return m;
}
// for tests: the pieces of shader code
export const TERRAIN_GLSL = { VERT_DECL, VERT_POS, FRAG_DECL, FRAG_COLOR };

// ---------- the verge mask: where the ground beside roads is worn to earth ----------
const VS = 256; // mask pixels per chunk side
export function paintVerge(ch, x0, z0, size, segs) {
  let cv = ch.vergeCanvas;
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = VS; ch.vergeCanvas = cv;
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.NoColorSpace; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter; ch.vergeTex = tx;
  }
  const x = cv.getContext('2d'), k = VS / size; x.fillStyle = '#000'; x.fillRect(0, 0, VS, VS); x.lineCap = 'round'; x.lineJoin = 'round';
  // three soft passes: wide and faint, then narrower and stronger, so the wear fades out away from the tarmac
  for (const [extra, a] of [[10, 0.2], [6, 0.3], [2.8, 0.5]]) {
    x.strokeStyle = `rgba(255,255,255,${a})`;
    for (const s of segs) {
      if (s.bridge) continue;
      x.lineWidth = Math.max(1, (s.hw * 2 + (s.walk ? extra * 0.45 : extra)) * k);
      x.beginPath(); x.moveTo((s.x0 - x0) * k, (s.z0 - z0) * k); x.lineTo((s.x1 - x0) * k, (s.z1 - z0) * k); x.stroke();
    }
  }
  ch.vergeTex.needsUpdate = true;
  return ch.vergeTex;
}

// ---------- loose rocks on steep ground ----------
let ROCK = null;
function rockAssets() {
  if (ROCK) return ROCK;
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, hsh = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + hsh(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) * 0.42; p.setXYZ(i, x * k, y * k * 0.72, z * k); }
  g.computeVertexNormals();
  const m = snowify(new THREE.MeshStandardMaterial({ color: '#ffffff', map: rockTexture(), roughness: 0.95, flatShading: true }), 'rock', { up: [0.35, 0.7] });
  return (ROCK = { g, m });
}
// place rocks on a chunk: mostly where the ground is steep, now and then a boulder in a field
export function buildRocks(world, ch, x0, z0, size, GS) {
  const { g, m } = rockAssets(), out = [], e = world.elev, n = Math.round(size / GS), i0 = Math.round(x0 / GS), j0 = Math.round(z0 / GS);
  let seed = (ch.i * 73856093) ^ (ch.j * 19349663); const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let b = 0; b < n && out.length < 160; b++) for (let a = 0; a < n && out.length < 160; a++) {
    const h00 = e.node(i0 + a, j0 + b), h10 = e.node(i0 + a + 1, j0 + b), h01 = e.node(i0 + a, j0 + b + 1), h11 = e.node(i0 + a + 1, j0 + b + 1);
    const s = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10), Math.abs(h11 - h01)) / GS;
    const want = s > 0.7 ? 2.2 : s > 0.5 ? 1.1 : s > 0.32 ? 0.3 : 0.012;
    let cnt = Math.floor(want) + (r() < want % 1 ? 1 : 0);
    while (cnt-- > 0) {
      const x = (i0 + a + r()) * GS, z = (j0 + b + r()) * GS;
      if (world.water.inside(x, z) || world.onRoad(x, z, 3.5) || world.collide(x, z, 2)) continue;
      const sc = (s > 0.5 ? 0.5 + r() * 1.3 : 0.4 + r() * 0.9) * (r() < 0.08 ? 1.8 : 1);
      out.push({ x, z, y: e.at(x, z) - sc * 0.25, sc, ry: r() * 6.3, rx: (r() - 0.5) * 0.6, sx: 0.8 + r() * 0.6, c: 0.72 + r() * 0.35 });
    }
  }
  if (!out.length) return null;
  const im = new THREE.InstancedMesh(g, m, out.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  out.forEach((o, i) => { E.set(o.rx, o.ry, 0); q.setFromEuler(E); S.set(o.sc * o.sx, o.sc, o.sc); P.set(o.x, o.y, o.z); M.compose(P, q, S); im.setMatrixAt(i, M); C.setRGB(o.c, o.c * 0.97, o.c * 0.92); im.setColorAt(i, C); });
  im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}
