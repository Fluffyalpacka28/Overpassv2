import * as THREE from 'three';

// ---------- Submarine kit: what bolts onto any car ----------
// Yellow ballast pods along the sills, dive planes either side of the nose (they tilt as you climb and dive), a shrouded
// three-blade propeller and a rudder at the back, a periscope on the roof and twin floodlights under the front bumper.
const SUB_Y = '#f2b705', SUB_D = '#2a2e35';
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    y: new THREE.MeshStandardMaterial({ color: SUB_Y, roughness: 0.38, metalness: 0.25 }),
    d: new THREE.MeshStandardMaterial({ color: SUB_D, roughness: 0.55, metalness: 0.5 }),
    c: new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.25, metalness: 0.9 }),
    band: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6 }),
    lens: new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#fff1c4', emissiveIntensity: 0.2, roughness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#7fd8ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }),
  };
  return MATS;
}
const add = (g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
export function setSubKit(mesh, on) {
  const ud = mesh.userData;
  if (!!ud.subKit === !!on) return;
  if (!on) { if (ud.subKit) { mesh.remove(ud.subKit); ud.subKit = null; } return; }
  const M = mats(), g = new THREE.Group(); g.name = 'subkit';
  // size the kit to the car
  const body = ud.body || mesh, box = new THREE.Box3(); mesh.updateMatrixWorld(true); const inv = mesh.matrixWorld.clone().invert();
  box.setFromObject(body).applyMatrix4(inv);
  const W = Math.max(1.4, box.max.x - box.min.x), L = Math.max(3, box.max.z - box.min.z), top = Math.max(1.1, box.max.y), zf = box.max.z, zb = box.min.z;
  // ballast pods (with black bands and rounded ends)
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.12), len = L * 0.66, y = 0.42;
    add(g, new THREE.CylinderGeometry(0.2, 0.2, len, 16), M.y, x, y, 0, Math.PI / 2);
    for (const e of [-1, 1]) add(g, new THREE.SphereGeometry(0.2, 14, 10), M.y, x, y, e * len / 2);
    for (const b of [-0.3, 0, 0.3]) add(g, new THREE.CylinderGeometry(0.205, 0.205, 0.07, 16), M.band, x, y, b * len, Math.PI / 2);
    add(g, new THREE.BoxGeometry(0.1, 0.12, len * 0.6), M.d, x - s * 0.13, y + 0.06, 0); // mounting rail
  }
  // dive planes at the nose
  const planes = [];
  for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * (W / 2 + 0.28), 0.62, zf - L * 0.22); g.add(p); add(p, new THREE.BoxGeometry(0.62, 0.05, 0.36), M.y, s * 0.24, 0, 0); add(p, new THREE.BoxGeometry(0.06, 0.08, 0.38), M.d, 0, 0, 0); planes.push(p); }
  // propeller in its shroud, and the rudder
  const pz = zb - 0.3, py = 0.6;
  add(g, new THREE.TorusGeometry(0.4, 0.06, 10, 28), M.y, 0, py, pz);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(g, new THREE.BoxGeometry(0.04, 0.36, 0.04), M.d, Math.cos(a) * 0.2, py + Math.sin(a) * 0.2, pz, 0, 0, a + Math.PI / 2); }
  const prop = new THREE.Group(); prop.position.set(0, py, pz); g.add(prop);
  add(prop, new THREE.CylinderGeometry(0.07, 0.09, 0.22, 12), M.c, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 3; k++) { const bl = add(prop, new THREE.BoxGeometry(0.1, 0.32, 0.025), M.c, 0, 0, 0, 0.35, 0, k * Math.PI * 2 / 3); bl.position.set(Math.sin(k * Math.PI * 2 / 3) * 0.16, Math.cos(k * Math.PI * 2 / 3) * 0.16, 0); }
  add(g, new THREE.BoxGeometry(0.07, 0.42, 0.55), M.y, 0, py + 0.5, pz + 0.22); // upper rudder
  add(g, new THREE.BoxGeometry(0.06, 0.24, 0.32), M.d, 0, py - 0.42, pz + 0.1); // skeg
  add(g, new THREE.BoxGeometry(0.1, 0.1, 0.5), M.d, 0, py, pz + 0.35); // shaft housing
  // periscope
  const ps = new THREE.Group(); ps.position.set(0, top, -L * 0.05); g.add(ps);
  add(ps, new THREE.CylinderGeometry(0.12, 0.14, 0.12, 14), M.d, 0, 0.04, 0);
  add(ps, new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10), M.d, 0, 0.38, 0);
  add(ps, new THREE.BoxGeometry(0.14, 0.13, 0.24), M.y, 0, 0.72, 0.06);
  add(ps, new THREE.PlaneGeometry(0.1, 0.07), M.glass, 0, 0.72, 0.181);
  // floodlights under the front bumper
  const lamps = [];
  for (const s of [-1, 1]) { const x = s * W * 0.3; add(g, new THREE.CylinderGeometry(0.11, 0.13, 0.16, 14), M.d, x, 0.32, zf + 0.06, Math.PI / 2); lamps.push(add(g, new THREE.CircleGeometry(0.095, 16), M.lens, x, 0.32, zf + 0.145)); }
  mesh.add(g); ud.subKit = g; ud.subProp = prop; ud.subPlanes = planes;
  g.traverse(o => { o.userData.noDamage = true; });
}
// spin the prop, tilt the planes, light the lamps
export function animSubKit(mesh, dt, speed, pitch, lamps) {
  const ud = mesh.userData; if (!ud.subKit) return;
  ud.subProp.rotation.z += dt * (2 + Math.abs(speed) * 2.2) * Math.sign(speed || 1);
  for (const p of ud.subPlanes) p.rotation.x += (-pitch * 0.45 - p.rotation.x) * Math.min(1, dt * 6);
  mats().lens.emissiveIntensity = lamps ? 2.4 : 0.2;
}

// ---------- underwater: fog, light shafts, bubbles, seaweed, rocks and fish ----------
const hash = (x, z, k = 0) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
function bladeTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d');
  // a long ribbed blade, wider in the middle, ragged at the top
  const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#2b3d16'); g.addColorStop(0.5, '#5a7a28'); g.addColorStop(1, '#8aa848');
  x.fillStyle = g; x.beginPath(); x.moveTo(15, 128);
  for (let y = 128; y >= 0; y -= 8) { const w = 4 + Math.sin((128 - y) / 128 * Math.PI) * 10 + (y % 16 ? 1.5 : -1.5); x.lineTo(16 + w, y); }
  for (let y = 0; y <= 128; y += 8) { const w = 4 + Math.sin((128 - y) / 128 * Math.PI) * 10 + (y % 16 ? -1.5 : 1.5); x.lineTo(16 - w, y); }
  x.closePath(); x.fill(); x.strokeStyle = 'rgba(30,45,12,.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(16, 128); x.lineTo(16, 4); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function bubbleTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 6, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(220,245,255,.35)'); g.addColorStop(0.9, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(16, 16, 15, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(11, 11, 3, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const KELP = 1400, ROCKS = 140, FISH_SCHOOLS = 5, FISH_PER = 16, BUBBLES = 700, SHAFTS = 12, CELL = 11, RAD = 8;
// ---- fish pictures: one strip of eight side views (facing right) ----
const FISH_KINDS = [
  { name: 'clownfish', size: 0.26 }, { name: 'blue tang', size: 0.34 }, { name: 'yellow tang', size: 0.32 }, { name: 'angelfish', size: 0.4 },
  { name: 'perch', size: 0.34 }, { name: 'trout', size: 0.48 }, { name: 'herring', size: 0.3 }, { name: 'sunfish', size: 0.28 },
];
let FISH_TEX = null;
function fishAtlas() {
  if (FISH_TEX) return FISH_TEX;
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W * 8; c.height = H; const x = c.getContext('2d');
  // a body outline: nose at the right, tail fin at the left; h = how deep the body is
  const body = (h, len = 1) => { x.beginPath(); x.moveTo(118, 32); x.bezierCurveTo(108, 32 - h * 1.1, 60, 32 - h * 1.05, 30 + (1 - len) * 30, 32 - h * 0.22); x.lineTo(30 + (1 - len) * 30, 32 + h * 0.22); x.bezierCurveTo(60, 32 + h * 1.05, 108, 32 + h * 1.1, 118, 32); x.closePath(); };
  const tail = (col, h, fork = 0.4) => { x.fillStyle = col; x.beginPath(); x.moveTo(36, 32); x.lineTo(8, 32 - h); x.quadraticCurveTo(8 + fork * 22, 32, 8, 32 + h); x.closePath(); x.fill(); };
  const fin = (col, pts) => { x.fillStyle = col; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
  const grad = (top, mid, bot, h) => { const g = x.createLinearGradient(0, 32 - h, 0, 32 + h); g.addColorStop(0, top); g.addColorStop(0.5, mid); g.addColorStop(1, bot); return g; };
  const eye = (ex, ey, r = 3.4) => { x.fillStyle = '#f6f2e6'; x.beginPath(); x.arc(ex, ey, r, 0, 7); x.fill(); x.fillStyle = '#0d0d10'; x.beginPath(); x.arc(ex + 0.6, ey, r * 0.62, 0, 7); x.fill(); };
  const draws = [
    () => { // clownfish: orange with white bands edged in black
      tail('#f07a1a', 14, 0.2); fin('#f07a1a', [60, 16, 84, 10, 96, 18]); body(17); x.fillStyle = '#f37b1c'; x.fill();
      x.save(); body(17); x.clip(); for (const bx of [100, 72, 44]) { x.fillStyle = '#111'; x.fillRect(bx - 7, 0, 14, 64); x.fillStyle = '#fff'; x.fillRect(bx - 5, 0, 10, 64); } x.restore(); eye(106, 29);
    },
    () => { // blue tang: royal blue, black palette mark, yellow tail
      tail('#f2c623', 16, 0.5); fin('#1e4fb5', [46, 18, 98, 12, 104, 20]); fin('#1e4fb5', [52, 46, 96, 52, 100, 44]); body(18); x.fillStyle = grad('#1b3f9c', '#2d6ad6', '#2a62c9', 18); x.fill();
      x.strokeStyle = '#0d1b3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(98, 24); x.quadraticCurveTo(70, 14, 44, 30); x.quadraticCurveTo(64, 24, 80, 34); x.stroke(); eye(106, 29);
    },
    () => { // yellow tang: bright yellow, tall and disc-shaped
      tail('#f4d21f', 15, 0.4); fin('#f2cc1a', [44, 20, 80, 2, 104, 18]); fin('#f2cc1a', [46, 44, 80, 62, 102, 46]); body(22); x.fillStyle = grad('#f0c514', '#fae13c', '#f2cb1d', 22); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(40, 32, 3, 1.5, 0, 0, 7); x.fill(); eye(104, 27);
    },
    () => { // angelfish: silver with dark vertical bars and long trailing fins
      tail('#cfd6dc', 13, 0.6); fin('#d9dfe4', [56, 20, 70, 0, 92, 18]); fin('#d9dfe4', [56, 44, 70, 64, 92, 46]); body(20); x.fillStyle = grad('#c7cfd6', '#eef2f5', '#d4dade', 20); x.fill();
      x.save(); body(20); x.clip(); x.fillStyle = 'rgba(25,25,30,0.8)'; for (const bx of [96, 76, 56]) x.fillRect(bx - 3, 0, 6, 64); x.restore(); eye(106, 29);
    },
    () => { // yellow perch: green-gold with dark saddles, orange lower fins
      tail('#b9a24a', 13, 0.3); fin('#5f6a3a', [56, 18, 72, 8, 92, 20]); fin('#e27a2c', [70, 44, 76, 54, 86, 44]); body(15); x.fillStyle = grad('#5f7a3c', '#d9c55a', '#efe6b5', 15); x.fill();
      x.save(); body(15); x.clip(); x.fillStyle = 'rgba(40,50,25,0.65)'; for (const bx of [96, 82, 68, 54, 42]) { x.beginPath(); x.moveTo(bx - 4, 10); x.lineTo(bx + 4, 10); x.lineTo(bx + 1, 40); x.lineTo(bx - 3, 40); x.fill(); } x.restore(); eye(108, 29);
    },
    () => { // rainbow trout: olive back, pink stripe, black speckles
      tail('#7e8a62', 13, 0.15); fin('#7e8a62', [60, 20, 72, 12, 84, 21]); body(13); x.fillStyle = grad('#5f6f45', '#c8c6b4', '#eeeae0', 13); x.fill();
      x.save(); body(13); x.clip(); x.fillStyle = 'rgba(226,98,120,0.65)'; x.fillRect(20, 30, 100, 6); x.fillStyle = '#1d1d1d'; for (let i = 0; i < 40; i++) { x.beginPath(); x.arc(36 + (i * 37) % 80, 20 + (i * 13) % 16, 1.3, 0, 7); x.fill(); } x.restore(); eye(108, 30, 3);
    },
    () => { // herring: slim and silver with a blue-green back
      tail('#8fa6b5', 12, 0.4); fin('#7f97a6', [66, 22, 74, 14, 84, 23]); body(11); x.fillStyle = grad('#2f6a7c', '#d9e3ea', '#f6f9fb', 11); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1; x.beginPath(); x.moveTo(110, 33); x.lineTo(34, 33); x.stroke(); eye(110, 30, 3);
    },
    () => { // sunfish (bluegill / pumpkinseed): round, olive-blue with an orange breast and a dark ear spot
      tail('#5f7a6a', 13, 0.3); fin('#4e6a5a', [50, 16, 76, 6, 98, 18]); fin('#4e6a5a', [52, 46, 78, 58, 96, 46]); body(21); x.fillStyle = grad('#3f5f63', '#6f8f7a', '#f2a03c', 21); x.fill();
      x.save(); body(21); x.clip(); x.strokeStyle = 'rgba(30,40,40,0.35)'; x.lineWidth = 4; for (const bx of [92, 78, 64, 50]) { x.beginPath(); x.moveTo(bx, 8); x.lineTo(bx - 2, 56); x.stroke(); } x.restore();
      x.fillStyle = '#16232a'; x.beginPath(); x.ellipse(94, 30, 4, 3, 0, 0, 7); x.fill(); eye(106, 28);
    },
  ];
  draws.forEach((d, i) => { x.save(); x.translate(i * W, 0); x.beginPath(); x.rect(0, 0, W, H); x.clip(); d(); x.restore(); });
  FISH_TEX = new THREE.CanvasTexture(c); FISH_TEX.colorSpace = THREE.SRGBColorSpace; FISH_TEX.anisotropy = 4; FISH_TEX.generateMipmaps = false; FISH_TEX.minFilter = THREE.LinearFilter;
  return FISH_TEX;
}
export class Underwater {
  constructor(scene) {
    this.scene = scene; this.t = 0; this.cx = 1e9; this.cz = 1e9; this.on = false; this.fogSaved = null;
    // seaweed: two crossed ribbons per plant, swaying from the root (kelp up high, seagrass in the shallows)
    const pa = new THREE.PlaneGeometry(0.95, 1, 1, 8); pa.translate(0, 0.5, 0); const pb = pa.clone(); pb.rotateY(Math.PI / 2);
    const kg = new THREE.BufferGeometry(); const merge = [pa, pb]; { const pos = [], uv = [], idx = []; let off = 0; for (const q of merge) { pos.push(...q.attributes.position.array); uv.push(...q.attributes.uv.array); idx.push(...Array.from(q.index.array, i => i + off)); off += q.attributes.position.count; } kg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); kg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); kg.setIndex(idx); kg.computeVertexNormals(); }
    this.T = { value: 0 };
    const km = new THREE.MeshLambertMaterial({ map: bladeTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    km.onBeforeCompile = sh => {
      sh.uniforms.uT = this.T;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
  { float ph = dot(instanceMatrix[3].xz, vec2(0.37, 0.61)); float h = position.y; float k = pow(h, 1.4);
    transformed.x += (sin(uT * 0.9 + ph + h * 1.7) * 0.12 + sin(uT * 0.37 + ph * 1.3) * 0.18) * k;
    transformed.z += cos(uT * 0.8 + ph * 0.7 + h * 1.3) * 0.12 * k; }`);
    };
    km.customProgramCacheKey = () => 'kelp-v1';
    this.kelp = new THREE.InstancedMesh(kg, km, KELP); this.kelp.count = 0; this.kelp.frustumCulled = false; this.kelp.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.kelp);
    this.kelp.setColorAt(0, new THREE.Color(1, 1, 1));
    // rocks half buried in the bed
    const rg = new THREE.IcosahedronGeometry(1, 0); const rp = rg.attributes.position; for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.8 + hash(i, 1) * 0.4), rp.getY(i) * (0.55 + hash(i, 2) * 0.3), rp.getZ(i) * (0.8 + hash(i, 3) * 0.4)); rg.computeVertexNormals();
    this.rocks = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#5f6660', roughness: 0.95, flatShading: true }), ROCKS); this.rocks.count = 0; this.rocks.frustumCulled = false; scene.add(this.rocks);
    // fish: flat billboards (eight kinds: reef fish in the tropics, perch, trout, herring and sunfish elsewhere) in schools that
    // wheel around near you; each one turns to face the camera side-on, mirrored to swim the right way, with a wiggle
    const fq = new THREE.PlaneGeometry(1, 0.5, 4, 1);
    const fishMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uLight: { value: new THREE.Color(1, 1, 1) } }]), fog: true,
      vertexShader: `attribute vec3 aF; uniform float uT; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float s = length(instanceMatrix[0].xyz);
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float tail = clamp(-position.x * 2.0, 0.0, 1.0), x = position.x * (1.0 - 0.18 * tail * abs(sin(uT * 11.0 + aF.z)));
  float y = position.y + sin(uT * 11.0 + aF.z - position.x * 3.0) * 0.025 * tail;
  vec3 wp = c + (R * x * aF.y + U * y) * s;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
  vUv = vec2((uv.x + aF.x) / 8.0, uv.y);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uLight; varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uMap, vUv); if (t.a < 0.45) discard; gl_FragColor = vec4(t.rgb * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`, side: THREE.DoubleSide });
    fishMat.uniforms.uT = this.T; fishMat.uniforms.uMap.value = fishAtlas(); this.fishMat = fishMat;
    this.fishF = new Float32Array(FISH_SCHOOLS * FISH_PER * 3); fq.setAttribute('aF', new THREE.InstancedBufferAttribute(this.fishF, 3)); this.fishFA = fq.attributes.aF; this.fishFA.setUsage(THREE.DynamicDrawUsage);
    this.fish = new THREE.InstancedMesh(fq, fishMat, FISH_SCHOOLS * FISH_PER); this.fish.frustumCulled = false; this.fish.renderOrder = 2; scene.add(this.fish);
    this.schools = Array.from({ length: FISH_SCHOOLS }, (_, i) => ({ x: 0, y: 0, z: 0, a: i * 1.3, r: 3 + i, sp: 0.4 + i * 0.07, kind: 0, off: Array.from({ length: FISH_PER }, (_, k) => [hash(i, k, 1) - 0.5, hash(i, k, 2) - 0.5, hash(i, k, 3) - 0.5]), placed: false }));
    for (let i = 0; i < FISH_SCHOOLS * FISH_PER; i++) this.fishF[i * 3 + 2] = hash(i, 9, 9) * 6.28;
    // bubbles
    this.bub = new Float32Array(BUBBLES * 3); this.bubV = new Float32Array(BUBBLES * 2); this.bubTop = new Float32Array(BUBBLES); this.bi = 0;
    for (let i = 0; i < BUBBLES; i++) this.bub[i * 3 + 1] = -1e5;
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(this.bub, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ map: bubbleTex(), size: 0.22, transparent: true, depthWrite: false, sizeAttenuation: true })); this.bubbles.frustumCulled = false; scene.add(this.bubbles);
    // marine snow: specks drifting in the water around the camera, so you can feel yourself moving through it
    this.snowN = 500; this.snow = new Float32Array(this.snowN * 3);
    for (let i = 0; i < this.snowN; i++) { this.snow[i * 3] = (Math.random() - 0.5) * 28; this.snow[i * 3 + 1] = (Math.random() - 0.5) * 16; this.snow[i * 3 + 2] = (Math.random() - 0.5) * 28; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.snowN * 3), 3));
    const sc = document.createElement('canvas'); sc.width = sc.height = 16; { const x = sc.getContext('2d'), gr = x.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 16, 16); }
    this.snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(sc), size: 0.07, color: 0xdff4ee, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true }));
    this.snowPts.frustumCulled = false; this.snowPts.visible = false; scene.add(this.snowPts);
    // light shafts: soft additive sheets hanging from the surface
    const sm = new THREE.ShaderMaterial({ uniforms: { uT: this.T, uK: { value: 0 }, uCol: { value: new THREE.Color(0.75, 0.95, 1.0) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; varying float vPh; void main() { vUv = uv; vPh = modelMatrix[3].x * 0.13 + modelMatrix[3].z * 0.07; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uT, uK; uniform vec3 uCol; varying vec2 vUv; varying float vPh; void main() { float edge = sin(vUv.x * 3.14159); float fade = pow(vUv.y, 1.6); float fl = 0.55 + 0.45 * sin(uT * 0.7 + vPh * 6.0 + vUv.x * 4.0); float a = edge * edge * fade * fl * uK * 0.09; gl_FragColor = vec4(uCol * a, a); }' });
    this.shaftMat = sm; this.shafts = [];
    for (let i = 0; i < SHAFTS; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sm); m.geometry.translate(0, -0.5, 0); m.frustumCulled = false; m.visible = false; m.renderOrder = 8; scene.add(m); this.shafts.push({ m, a: hash(i, 9) * 6.28, r: 6 + hash(i, 4) * 26, w: 1.2 + hash(i, 5) * 2.5, s: 0.05 + hash(i, 6) * 0.1 }); }
    // the water all around: brighter toward the surface, darker toward the depths (drawn behind everything, inside the fog)
    this.volMat = new THREE.ShaderMaterial({ uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } }, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uTop, uMid, uBot; varying vec3 vD; void main() { float y = vD.y; vec3 c = y > 0.0 ? mix(uMid, uTop, pow(y, 0.8)) : mix(uMid, uBot, pow(-y, 0.7)); gl_FragColor = vec4(c, 1.0); }' });
    this.vol = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.volMat); this.vol.renderOrder = -2; this.vol.frustumCulled = false; this.vol.visible = false; scene.add(this.vol);
    this.setVisible(false);
  }
  setVisible(v) { this.kelp.visible = this.rocks.visible = this.fish.visible = this.bubbles.visible = v; for (const s of this.shafts) s.m.visible = v; }
  // seaweed and rocks around (x, z): cells on a fixed grid, each decided by a hash, so the same spot always grows the same plants
  populate(world, x, z) {
    this.cx = x; this.cz = z; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    let k = 0, r = 0; const ci = Math.round(x / CELL), cj = Math.round(z / CELL);
    for (let i = ci - RAD; i <= ci + RAD; i++) for (let j = cj - RAD; j <= cj + RAD; j++) {
      const cx = i * CELL, cz = j * CELL; if (!world.water.inside(cx, cz)) continue;
      const d0 = world.waterDepth(cx, cz); if (d0 < 0.8) continue;
      // kelp forests in patches (mid depths), seagrass meadows in the shallows, bare sand in between
      const patch = hash(Math.floor(i / 3), Math.floor(j / 3), 7), n = d0 < 4 ? Math.floor(hash(i, j, 1) * 6 * (patch > 0.3 ? 1 : 0.2)) : Math.floor(hash(i, j, 2) * 5 * (patch > 0.45 ? 1 : 0.15));
      for (let q = 0; q < n && k < KELP; q++) {
        const px = cx + (hash(i, j, 10 + q) - 0.5) * CELL, pz = cz + (hash(i, j, 20 + q) - 0.5) * CELL; if (!world.water.inside(px, pz)) continue;
        const bed = world.terrainY(px, pz), depth = world.waterDepth(px, pz); if (depth < 0.7) continue;
        const grass = depth < 4 || hash(i, j, 30 + q) < 0.25;
        const h = grass ? 0.35 + hash(i, j, 40 + q) * Math.min(1.2, depth * 0.4) : Math.min(depth - 0.6, 2.5 + hash(i, j, 40 + q) * 9);
        Q.setFromAxisAngle(up, hash(i, j, 50 + q) * 6.28); S.set(grass ? 0.45 : 0.8 + hash(i, j, 60 + q) * 0.6, h, grass ? 0.45 : 0.8); P.set(px, bed - 0.05, pz);
        M.compose(P, Q, S); this.kelp.setMatrixAt(k, M);
        col.setHSL(grass ? 0.24 + hash(i, j, 70 + q) * 0.06 : 0.13 + hash(i, j, 70 + q) * 0.1, 0.55, grass ? 0.62 : 0.5 + hash(i, j, 80 + q) * 0.2); this.kelp.setColorAt(k, col); k++;
      }
      if (hash(i, j, 3) < 0.16 && r < ROCKS) {
        const px = cx + (hash(i, j, 90) - 0.5) * CELL, pz = cz + (hash(i, j, 91) - 0.5) * CELL, s = 0.4 + hash(i, j, 92) * 1.8;
        Q.setFromEuler(new THREE.Euler(hash(i, j, 93), hash(i, j, 94) * 6.28, 0)); S.set(s, s * (0.6 + hash(i, j, 95) * 0.5), s); P.set(px, world.terrainY(px, pz) + s * 0.15, pz); M.compose(P, Q, S); this.rocks.setMatrixAt(r++, M);
      }
    }
    this.kelp.count = k; this.rocks.count = r; this.kelp.instanceMatrix.needsUpdate = true; if (this.kelp.instanceColor) this.kelp.instanceColor.needsUpdate = true; this.rocks.instanceMatrix.needsUpdate = true;
  }
  bubble(x, y, z, top, spread = 0.2) {
    const i = this.bi; this.bi = (this.bi + 1) % BUBBLES;
    this.bub[i * 3] = x + (Math.random() - 0.5) * spread; this.bub[i * 3 + 1] = y; this.bub[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
    this.bubV[i * 2] = Math.random() * 6.28; this.bubV[i * 2 + 1] = 0.9 + Math.random() * 0.9; this.bubTop[i] = top;
  }
  // ctx: { world, scene, camera, active (diving or camera under water), under (camera below the surface), camDepth, player, prop (world pos of the prop), speed, light (ambient colour) }
  update(dt, ctx) {
    this.t += dt; this.T.value = this.t;
    const show = !!ctx.active; if (show !== this.on) { this.on = show; this.setVisible(show); if (!show) { this.restoreFog(ctx.scene); if (this.snowPts) this.snowPts.visible = false; } }
    this.fogUnder(ctx);
    if (!show) return;
    const W = ctx.world, P = ctx.player;
    if (Math.hypot(P.x - this.cx, P.z - this.cz) > CELL * 2) this.populate(W, P.x, P.z);
    // fish schools: each wheels round a point that drifts near you, between the bed and the surface
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), camR = ctx.camera ? new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion) : null;
    this.schools.forEach((s, si) => {
      const far = Math.hypot(s.x - P.x, s.z - P.z);
      if (!s.placed || far > 55 || !W.water.inside(s.x, s.z)) { const a = Math.random() * 6.28, d = 4 + Math.random() * 12; s.x = P.x + Math.cos(a) * d; s.z = P.z + Math.sin(a) * d; s.placed = W.water.inside(s.x, s.z) && W.waterDepth(s.x, s.z) > 2.5;
        // a new school: what kind of fish depends on the climate
        if (s.placed) { const trop = Math.abs(ctx.lat ?? 45) < 28, list = trop ? [0, 1, 2, 3] : [4, 5, 6, 7]; s.kind = list[Math.floor(Math.random() * list.length)]; s.size = FISH_KINDS[s.kind].size * 1.7 * (0.85 + Math.random() * 0.3); { const b0 = W.terrainY(s.x, s.z), t0 = W.heightAt(s.x, s.z) - 0.25; s.y = b0 + (t0 - b0) * (0.35 + Math.random() * 0.3); } } }
      if (!s.placed) { for (let k = 0; k < FISH_PER; k++) { M.makeScale(0, 0, 0); this.fish.setMatrixAt(si * FISH_PER + k, M); } return; }
      s.a += dt * s.sp; const bed = W.terrainY(s.x, s.z), top = W.heightAt(s.x, s.z) - 0.25, mid = bed + (top - bed) * (0.35 + 0.25 * Math.sin(this.t * 0.1 + si));
      s.y += (mid - s.y) * Math.min(1, dt * 0.5); s.x += Math.cos(s.a * 0.3 + si) * dt * 0.6; s.z += Math.sin(s.a * 0.27 + si) * dt * 0.6;
      for (let k = 0; k < FISH_PER; k++) {
        const o = s.off[k], ang = s.a + k * 0.38 + o[0] * 1.5, r = s.r * (0.6 + o[1] * 0.8);
        V.set(s.x + Math.cos(ang) * r, s.y + o[2] * 1.6 + Math.sin(this.t * 2 + k) * 0.08, s.z + Math.sin(ang) * r);
        // swimming round the circle (tangent), mirrored so the head leads as seen from the camera
        const vx = -Math.sin(ang), vz = Math.cos(ang), idx = si * FISH_PER + k, sz = (s.size || 0.35) * (0.8 + (o[1] + 0.5) * 0.4);
        this.fishF[idx * 3] = s.kind; this.fishF[idx * 3 + 1] = camR ? (vx * camR.x + vz * camR.z >= 0 ? 1 : -1) : 1;
        S.setScalar(sz); Q.identity(); M.compose(V, Q, S); this.fish.setMatrixAt(idx, M); S.set(1, 1, 1);
      }
    });
    this.fish.instanceMatrix.needsUpdate = true; this.fishFA.needsUpdate = true; if (ctx.light) this.fishMat.uniforms.uLight.value.copy(ctx.light);
    // bubbles: from the prop while moving, a trickle from the bed, and they wobble up and pop at the surface
    if (ctx.prop && ctx.diving) { const n = Math.min(4, Math.abs(ctx.speed) * dt * 3 + (Math.random() < dt * 2 ? 1 : 0)); for (let q = 0; q < n; q++) this.bubble(ctx.prop.x, ctx.prop.y, ctx.prop.z, W.heightAt(ctx.prop.x, ctx.prop.z) - 0.3, 0.3); }
    if (Math.random() < dt * 3) { const a = Math.random() * 6.28, d = 4 + Math.random() * 25, bx = P.x + Math.cos(a) * d, bz = P.z + Math.sin(a) * d; if (W.water.inside(bx, bz)) for (let q = 0; q < 3; q++) this.bubble(bx, W.terrainY(bx, bz) + 0.1, bz, W.heightAt(bx, bz) - 0.3, 0.15); }
    for (let i = 0; i < BUBBLES; i++) {
      const y = this.bub[i * 3 + 1]; if (y < -1e4) continue;
      const ph = (this.bubV[i * 2] += dt * 4); this.bub[i * 3] += Math.sin(ph) * dt * 0.25; this.bub[i * 3 + 2] += Math.cos(ph * 0.8) * dt * 0.25;
      this.bub[i * 3 + 1] = y + this.bubV[i * 2 + 1] * dt; if (this.bub[i * 3 + 1] > this.bubTop[i]) this.bub[i * 3 + 1] = -1e5;
    }
    this.bubbles.geometry.attributes.position.needsUpdate = true;
    // marine snow drifts slowly; it wraps round a box that follows the camera
    this.snowPts.visible = !!ctx.under;
    if (ctx.under) {
      const cp = ctx.camera.position, a = this.snowPts.geometry.attributes.position, o = a.array, sn = this.snow, wrap = (v, h) => v - Math.floor((v + h) / (2 * h)) * 2 * h;
      for (let i = 0; i < this.snowN; i++) {
        sn[i * 3] += Math.sin(this.t * 0.3 + i) * dt * 0.05; sn[i * 3 + 1] -= dt * (0.04 + (i % 7) * 0.01);
        o[i * 3] = cp.x + wrap(sn[i * 3] - cp.x, 14); o[i * 3 + 1] = cp.y + wrap(sn[i * 3 + 1] - cp.y, 8); o[i * 3 + 2] = cp.z + wrap(sn[i * 3 + 2] - cp.z, 14);
      }
      a.needsUpdate = true; if (ctx.light) this.snowPts.material.color.setRGB(0.85, 0.96, 0.92).multiplyScalar(Math.min(1, ctx.light.r + 0.2));
    }
    // light shafts around the camera, facing it, as long as the water is deep (dimmer the deeper you go)
    const cam = ctx.camera.position, sk = ctx.under ? Math.max(0, 1 - ctx.camDepth / 35) * (ctx.day ?? 1) : 0; this.shaftMat.uniforms.uK.value += (sk - this.shaftMat.uniforms.uK.value) * Math.min(1, dt * 2);
    for (const s of this.shafts) {
      s.a += dt * s.s * 0.2; const x = cam.x + Math.cos(s.a) * s.r, z = cam.z + Math.sin(s.a) * s.r;
      if (!W.water.inside(x, z)) { s.m.visible = false; continue; }
      const top = W.heightAt(x, z) - 0.3, bed = W.terrainY(x, z), len = Math.max(1, Math.min(30, top - bed));
      s.m.visible = sk > 0.02; s.m.position.set(x, top, z); s.m.scale.set(s.w, len, 1); s.m.rotation.set(0, Math.atan2(cam.x - x, cam.z - z), 0.12 * Math.sin(s.a * 3));
    }
  }
  // under the surface the world fades into green-blue murk, darker and closer the deeper you are
  fogUnder(ctx) {
    const sc = ctx.scene;
    if (!ctx.under) { this.restoreFog(sc); return; }
    if (!this.fogSaved) this.fogSaved = { fog: sc.fog, bg: sc.background };
    const k = Math.min(1, ctx.camDepth / 40), L = ctx.light || new THREE.Color(1, 1, 1);
    const c = new THREE.Color(0.12, 0.42, 0.46).lerp(new THREE.Color(0.01, 0.07, 0.1), k);
    c.multiply(new THREE.Color(Math.min(1.2, L.r + 0.15), Math.min(1.2, L.g + 0.15), Math.min(1.2, L.b + 0.15)));
    if (!this.fog) this.fog = new THREE.Fog(c, 1, 40);
    this.fog.color.copy(c); this.fog.near = 1; this.fog.far = 62 - 38 * k; sc.fog = this.fog;
    if (!this.bg) this.bg = new THREE.Color(); this.bg.copy(c); sc.background = this.bg;
    // the volume around the camera: light filtering down from above, fading into the dark below
    const U = this.volMat.uniforms; U.uMid.value.copy(c); U.uTop.value.copy(c).lerp(new THREE.Color(0.55, 0.85, 0.85).multiply(L), 0.55 * (1 - k * 0.7)); U.uBot.value.copy(c).multiplyScalar(0.35);
    this.vol.visible = true; this.vol.position.copy(ctx.camera.position);
  }
  restoreFog(sc) { if (this.vol) this.vol.visible = false; if (!this.fogSaved) return; sc.fog = this.fogSaved.fog; sc.background = this.fogSaved.bg; this.fogSaved = null; }
}
