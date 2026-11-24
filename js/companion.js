import * as THREE from 'three';
import { modelTemplate } from './custom.js';

// The front passenger: a dog (a flat billboard, drawn here) or a 3D model you uploaded.
// The dog:
//   - stopped: sits beside you, panting
//   - driving slowly: sits up in the seat
//   - fast: head out of the window, ears flapping and tongue out
//   - someone on foot blocking the road for over a second: barks out of the window ("WOOF!")
//   - underwater: a little scuba mask and snorkel; in the air: a leather flying helmet and goggles

export const DOG_COATS = [['golden', 'Golden', '#d9a05b'], ['black', 'Black lab', '#2a2523'], ['choc', 'Chocolate', '#6b4127'], ['dalmatian', 'Dalmatian', '#f4f1ea'], ['husky', 'Husky', '#7c8088']];
const COATS = {
  golden: { body: '#d9a05b', dark: '#b07a3a', light: '#f3d6a4', ear: '#b9813f', nose: '#2a1d16' },
  black: { body: '#2b2624', dark: '#171312', light: '#4a403b', ear: '#1d1817', nose: '#0c0a0a' },
  choc: { body: '#6b4127', dark: '#4d2c18', light: '#8f5d3d', ear: '#55311b', nose: '#2b1a10' },
  dalmatian: { body: '#f4f1ea', dark: '#d9d4c8', light: '#ffffff', ear: '#2a2624', nose: '#151212', spots: true },
  husky: { body: '#7c8088', dark: '#5d6168', light: '#f2f2f0', ear: '#5a5e65', nose: '#151517', mask: true, pointy: true },
};
const F = 128, FRAMES = 7, GEARS = 3; // frames: 0 sit, 1 sit panting, 2 sit from behind, 3-4 window, 5 bark (window), 6 bark (sitting)

function spots(x, cx, cy, rx, ry, n, seed) {
  x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.clip(); x.fillStyle = '#1b1817';
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(cx + (r() - 0.5) * rx * 2, cy + (r() - 0.5) * ry * 2, 2 + r() * 3, 1.6 + r() * 2.4, r() * 3, 0, 7); x.fill(); }
  x.restore();
}
// a head seen from the front, centred on (hx, hy); mouth: 0 closed, 1 panting (tongue), 2 barking
function headFront(x, C, hx, hy, mouth, tilt = 0) {
  x.save(); x.translate(hx, hy); x.rotate(tilt);
  // ears
  x.fillStyle = C.ear;
  if (C.pointy) { for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 10, -14); x.lineTo(s * 20, -34); x.lineTo(s * 24, -10); x.fill(); } }
  else for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 21, 0, 8, 17, s * 0.25, 0, 7); x.fill(); }
  x.fillStyle = C.body; x.beginPath(); x.ellipse(0, -2, 20, 19, 0, 0, 7); x.fill();
  if (C.mask) { x.fillStyle = C.light; x.beginPath(); x.moveTo(0, -14); x.quadraticCurveTo(-16, -6, -14, 10); x.quadraticCurveTo(0, 22, 14, 10); x.quadraticCurveTo(16, -6, 0, -14); x.fill(); }
  if (C.spots) spots(x, 0, -4, 18, 16, 7, 11);
  // muzzle
  x.fillStyle = C.mask ? C.light : C.light; x.beginPath(); x.ellipse(0, 9, 11, 9, 0, 0, 7); x.fill();
  if (mouth === 2) { x.fillStyle = '#5a1418'; x.beginPath(); x.ellipse(0, 15, 7, 6, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; x.fillRect(-5, 10, 2, 3); x.fillRect(3, 10, 2, 3); }
  else if (mouth === 1) { x.fillStyle = '#e66d7a'; x.beginPath(); x.ellipse(1, 18, 5, 8, 0.1, 0, 7); x.fill(); x.strokeStyle = '#c24a59'; x.lineWidth = 1; x.beginPath(); x.moveTo(1, 13); x.lineTo(1, 23); x.stroke(); }
  x.strokeStyle = C.nose; x.lineWidth = 1.4; x.beginPath(); x.moveTo(0, 8); x.lineTo(0, 12); x.moveTo(-6, 13); x.quadraticCurveTo(0, 16, 6, 13); x.stroke();
  x.fillStyle = C.nose; x.beginPath(); x.ellipse(0, 5, 5, 3.6, 0, 0, 7); x.fill();
  for (const s of [-1, 1]) { x.fillStyle = '#1a120d'; x.beginPath(); x.arc(s * 8, -6, 3, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(s * 8 + 1, -7, 1, 0, 7); x.fill(); }
  x.restore();
}
// a head in profile, facing right, centred on (hx, hy); flap 0..1 blows the ears and tongue back
function headSide(x, C, hx, hy, mouth, flap) {
  x.save(); x.translate(hx, hy);
  // ear streaming back in the wind
  x.fillStyle = C.ear;
  if (C.pointy) { x.beginPath(); x.moveTo(-8, -14); x.lineTo(-22 - flap * 6, -26 + flap * 6); x.lineTo(-16, -6); x.fill(); }
  else { x.save(); x.translate(-10, -10); x.rotate(-1.2 - flap * 0.5); x.beginPath(); x.ellipse(0, 14, 7, 16, 0, 0, 7); x.fill(); x.restore(); }
  x.fillStyle = C.body; x.beginPath(); x.ellipse(-2, -2, 18, 16, 0, 0, 7); x.fill();
  // snout
  x.beginPath(); x.moveTo(8, -10); x.quadraticCurveTo(30, -8, 32, 2); x.quadraticCurveTo(30, 10, 10, 10); x.closePath(); x.fill();
  if (C.mask) { x.fillStyle = C.light; x.beginPath(); x.moveTo(6, -2); x.quadraticCurveTo(26, 0, 30, 6); x.quadraticCurveTo(18, 12, 2, 10); x.closePath(); x.fill(); }
  if (C.spots) spots(x, -2, -2, 16, 14, 5, 5);
  x.fillStyle = C.nose; x.beginPath(); x.ellipse(31, 0, 4, 3.5, 0, 0, 7); x.fill();
  if (mouth === 2) { x.fillStyle = '#5a1418'; x.beginPath(); x.moveTo(12, 8); x.lineTo(30, 5); x.lineTo(26, 18); x.closePath(); x.fill(); x.fillStyle = C.body; x.beginPath(); x.moveTo(10, 12); x.quadraticCurveTo(22, 22, 27, 17); x.lineTo(24, 14); x.closePath(); x.fill(); }
  else if (mouth === 1) {
    // tongue flapping in the wind
    x.fillStyle = '#e66d7a'; x.beginPath(); x.moveTo(18, 9); x.quadraticCurveTo(10 - flap * 6, 20 + flap * 4, -2 - flap * 8, 22 + flap * 6); x.quadraticCurveTo(6, 14, 12, 10); x.closePath(); x.fill();
  }
  x.fillStyle = '#1a120d'; x.beginPath(); x.arc(12, -6, 2.6, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(13, -7, 0.9, 0, 7); x.fill();
  x.restore();
}
// scuba mask & snorkel / flying helmet & goggles, over a head drawn from the front, back or side
function gear(x, g, view, hx, hy) {
  if (!g) return;
  x.save(); x.translate(hx, hy);
  if (g === 1) {
    x.strokeStyle = '#1b1d20'; x.lineWidth = 3;
    if (view === 'front') {
      x.beginPath(); x.moveTo(-20, -6); x.lineTo(20, -6); x.stroke();
      x.fillStyle = 'rgba(150,220,255,0.55)'; x.strokeStyle = '#f2b705'; x.lineWidth = 3; x.beginPath(); x.ellipse(0, -6, 15, 8, 0, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(20, 2); x.lineTo(24, -6); x.lineTo(24, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(21, -40, 6, 6);
    } else if (view === 'side') {
      x.beginPath(); x.moveTo(-16, -6); x.lineTo(10, -6); x.stroke();
      x.fillStyle = 'rgba(150,220,255,0.55)'; x.strokeStyle = '#f2b705'; x.lineWidth = 3; x.beginPath(); x.ellipse(14, -6, 6, 8, 0, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(-4, 6); x.lineTo(-8, -8); x.lineTo(-8, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(-11, -40, 6, 6);
    } else { x.beginPath(); x.moveTo(-20, -4); x.lineTo(20, -4); x.stroke(); x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(18, 2); x.lineTo(18, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(15, -40, 6, 6); }
  } else {
    // leather flying helmet with ear flaps, goggles on top
    x.fillStyle = '#6b4325';
    if (view === 'side') { x.beginPath(); x.ellipse(-3, -8, 19, 13, -0.1, Math.PI, Math.PI * 2.1); x.fill(); x.beginPath(); x.ellipse(-6, 2, 7, 10, 0, 0, 7); x.fill(); }
    else { x.beginPath(); x.ellipse(0, -8, 21, 15, 0, Math.PI, Math.PI * 2); x.fill(); x.fillRect(-21, -9, 42, 4); for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 19, 2, 6, 11, 0, 0, 7); x.fill(); } }
    x.strokeStyle = '#4a2c16'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -22); x.lineTo(0, -8); x.stroke();
    if (view !== 'back') {
      x.fillStyle = 'rgba(180,230,255,0.7)'; x.strokeStyle = '#a8a8a8'; x.lineWidth = 2.5;
      const gl = view === 'side' ? [[10, -14]] : [[-8, -15], [8, -15]];
      for (const [gx, gy] of gl) { x.beginPath(); x.arc(gx, gy, 6, 0, 7); x.fill(); x.stroke(); }
    }
  }
  x.restore();
}
function drawDog(x, f, C, g) {
  x.clearRect(0, 0, F, F);
  if (f <= 1 || f === 6) {
    // sitting, seen from the front
    x.fillStyle = C.body;
    x.beginPath(); x.ellipse(36, 112, 18, 12, 0, 0, 7); x.ellipse(92, 112, 18, 12, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(64, 92, 30, 32, 0, 0, 7); x.fill();
    x.fillStyle = C.mask ? C.light : C.light; x.beginPath(); x.ellipse(64, 86, 15, 22, 0, 0, 7); x.fill();
    if (C.spots) spots(x, 64, 92, 28, 30, 14, 3);
    x.fillStyle = C.body; for (const s of [-1, 1]) { x.beginPath(); x.roundRect(64 + s * 12 - 6, 92, 12, 32, 6); x.fill(); }
    x.fillStyle = C.light; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(64 + s * 12, 123, 8, 4, 0, 0, 7); x.fill(); }
    x.strokeStyle = C.dark; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(94, 118); x.quadraticCurveTo(116, 112, 112, 96); x.stroke();
    // a collar
    x.strokeStyle = '#d23a2e'; x.lineWidth = 4; x.beginPath(); x.ellipse(64, 66, 17, 5, 0, 0, Math.PI); x.stroke(); x.fillStyle = '#f2c230'; x.beginPath(); x.arc(64, 72, 3, 0, 7); x.fill();
    headFront(x, C, 64, 44, f === 6 ? 2 : f, f === 1 ? -0.12 : 0); gear(x, g, 'front', 64 + (f === 1 ? 0 : 0), 44);
    return;
  }
  if (f === 2) {
    // sitting, seen from behind
    x.fillStyle = C.body; x.beginPath(); x.ellipse(64, 96, 33, 30, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(64, 116, 40, 10, 0, 0, 7); x.fill();
    if (C.spots) spots(x, 64, 94, 30, 28, 14, 9);
    x.fillStyle = C.ear; if (C.pointy) for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64 + s * 10, 32); x.lineTo(64 + s * 20, 12); x.lineTo(64 + s * 24, 36); x.fill(); }
    x.fillStyle = C.body; x.beginPath(); x.ellipse(64, 48, 20, 19, 0, 0, 7); x.fill();
    if (C.spots) spots(x, 64, 48, 18, 17, 5, 21);
    if (!C.pointy) { x.fillStyle = C.ear; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(64 + s * 20, 50, 7, 16, s * 0.2, 0, 7); x.fill(); } }
    x.strokeStyle = '#d23a2e'; x.lineWidth = 4; x.beginPath(); x.ellipse(64, 68, 17, 5, 0, 0, Math.PI); x.stroke();
    x.strokeStyle = C.dark; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(64, 120); x.quadraticCurveTo(96, 126, 106, 108); x.stroke();
    gear(x, g, 'back', 64, 46);
    return;
  }
  // head and front paws out of the window, in profile facing right
  const flap = f === 4 ? 1 : 0;
  x.fillStyle = C.body; x.beginPath(); x.moveTo(20, 128); x.quadraticCurveTo(26, 84, 56, 70); x.lineTo(70, 82); x.quadraticCurveTo(60, 110, 64, 128); x.closePath(); x.fill();
  if (C.spots) spots(x, 44, 104, 20, 24, 8, 17);
  x.strokeStyle = '#d23a2e'; x.lineWidth = 4; x.beginPath(); x.moveTo(42, 80); x.quadraticCurveTo(54, 90, 66, 84); x.stroke();
  // paws over the door
  x.fillStyle = C.body; x.beginPath(); x.ellipse(78, 114, 14, 7, 0, 0, 7); x.fill(); x.fillStyle = C.light; x.beginPath(); x.ellipse(88, 115, 6, 5, 0, 0, 7); x.fill();
  headSide(x, C, 62, 62, f === 5 ? 2 : 1, flap); gear(x, g, 'side', 62, 62);
}
const atlases = new Map();
function atlas(coat) {
  let t = atlases.get(coat); if (t) return t;
  const C = COATS[coat] || COATS.golden, c = document.createElement('canvas'); c.width = F * FRAMES; c.height = F * GEARS; const x = c.getContext('2d');
  for (let g = 0; g < GEARS; g++) for (let f = 0; f < FRAMES; f++) { x.save(); x.translate(f * F, g * F); x.beginPath(); x.rect(0, 0, F, F); x.clip(); drawDog(x, f, C, g); x.restore(); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; atlases.set(coat, t); return t;
}
let WOOF = null;
function woofTex() {
  if (WOOF) return WOOF;
  const c = document.createElement('canvas'); c.width = 160; c.height = 80; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#1b1d20'; x.lineWidth = 4; x.beginPath(); x.roundRect(6, 6, 148, 52, 22); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(40, 56); x.lineTo(28, 76); x.lineTo(60, 56); x.fill(); x.stroke(); x.fillStyle = '#fff'; x.fillRect(36, 52, 22, 6);
  x.fillStyle = '#1b1d20'; x.font = '900 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('WOOF!', 80, 33);
  WOOF = new THREE.CanvasTexture(c); WOOF.colorSpace = THREE.SRGBColorSpace; return WOOF;
}

export class Companion {
  constructor() {
    this.g = new THREE.Group(); this.g.name = 'companion';
    this.mat = new THREE.SpriteMaterial({ map: atlas('golden').clone(), alphaTest: 0.3, transparent: true, depthWrite: true, fog: true });
    this.mat.map.repeat.set(1 / FRAMES, 1 / GEARS); this.mat.map.needsUpdate = true; this.coat = 'golden';
    this.dog = new THREE.Sprite(this.mat); this.dog.center.set(0.5, 0); this.g.add(this.dog);
    this.woof = new THREE.Sprite(new THREE.SpriteMaterial({ map: woofTex(), transparent: true, depthTest: false, depthWrite: false })); this.woof.scale.set(0.6, 0.3, 1); this.woof.visible = false; this.woof.renderOrder = 30; this.g.add(this.woof);
    this.modelG = new THREE.Group(); this.g.add(this.modelG); this.modelKey = ''; this.modelInner = null;
    this.t = 0; this.barkT = 0; this.barkCd = 0; this.blockT = 0; this.out = 0; this.flip = false;
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  dispose() { if (this.g.parent) this.g.parent.remove(this.g); this.mat.map.dispose(); this.mat.dispose(); }
  setCoat(coat) { if (coat === this.coat || !COATS[coat]) return; this.coat = coat; const off = this.mat.map.offset.clone(), rep = this.mat.map.repeat.clone(); this.mat.map.dispose(); this.mat.map = atlas(coat).clone(); this.mat.map.repeat.copy(rep); this.mat.map.offset.copy(off); this.mat.map.needsUpdate = true; this.mat.needsUpdate = true; }
  _model(a) {
    const key = a && a.data ? a.h : '';
    if (key === this.modelKey) return; this.modelKey = key;
    this.modelG.clear(); this.modelInner = null; if (!key) return;
    modelTemplate({ h: a.h, ext: a.m.ext, data: a.data }).then(tpl => {
      if (this.modelKey !== key) return;
      const inner = tpl.clone(true); inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mx = Math.max(size.x, size.y, size.z), c = box.getCenter(new THREE.Vector3());
      // sized to sit in a seat (about 75 cm tall), standing on the cushion
      inner.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); const norm = new THREE.Group(); norm.scale.setScalar(isFinite(mx) && mx > 1e-6 ? 0.75 / mx : 1); norm.add(inner);
      norm.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.modelG.add(norm); this.modelInner = norm;
    }).catch(e => console.warn('[overpass] passenger model', e));
  }
  // ctx: { mesh, eye: [x, y, z] passenger eye position in the car, kind: 'dog' | 'model' | 'none', coat, model: { h, data, m } | null,
  //        speed (m/s), under, air, blocked (people in the way, seconds), cam, ckpt (cockpit view) } → 'bark' when it barks
  update(dt, ctx) {
    const mesh = ctx.mesh; if (!mesh || ctx.kind === 'none' || !ctx.eye) { if (this.g.parent) this.g.parent.remove(this.g); return null; }
    if (this.g.parent !== mesh) mesh.add(this.g);
    this.t += dt; let ev = null;
    const [ex, ey, ez] = ctx.eye, side = ex >= 0 ? 1 : -1, sp = Math.abs(ctx.speed || 0);
    const isDog = ctx.kind === 'dog'; this.dog.visible = isDog; this.modelG.visible = !isDog;
    if (!isDog) {
      this._model(ctx.model); this.woof.visible = false;
      const m = (ctx.model && ctx.model.m) || {}; this.modelG.position.set(ex + (m.x || 0), ey - 0.62 + (m.y || 0), ez + 0.05 + (m.z || 0)); this.modelG.rotation.set(0, (m.yaw || 0) * Math.PI / 180, 0); this.modelG.scale.setScalar(m.s || 1);
      return null;
    }
    this.setCoat(ctx.coat || 'golden');
    // where's the camera? (behind the car = see the dog's back; which way the car points on screen = which way the dog faces)
    mesh.getWorldQuaternion(this._q); this._f.set(0, 0, 1).applyQuaternion(this._q); mesh.getWorldPosition(this._v);
    const cam = ctx.cam; let behind = false, faceRight = true;
    if (cam) { const dx = cam.position.x - this._v.x, dz = cam.position.z - this._v.z; behind = dx * this._f.x + dz * this._f.z < 0; this._r.set(1, 0, 0).applyQuaternion(cam.quaternion); faceRight = this._f.x * this._r.x + this._f.z * this._r.z >= 0; }
    // barking at people in the way
    this.barkCd -= dt; this.barkT -= dt;
    if (ctx.blocked > 1 && this.barkCd <= 0) { this.barkCd = 2.2; this.barkT = 0.9; ev = 'bark'; }
    const barking = this.barkT > 0, gearRow = ctx.under ? 1 : ctx.air ? 2 : 0;
    // head out of the window when it's fast (or to bark at someone), never underwater
    const wantOut = !ctx.under && !ctx.ckpt && (sp > 15 || (barking && sp > 0.5 && !behind));
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, dt * 5);
    let f, h;
    if (this.out > 0.5) { f = barking ? 5 : (Math.floor(this.t * (4 + sp * 0.15)) % 2 ? 4 : 3); h = 0.66; this.flip = !faceRight; }
    else if (barking) { f = behind ? 2 : 6; h = 0.86; this.flip = false; }
    else if (sp < 0.8) { f = behind ? 2 : 1; h = 0.86; this.flip = false; }
    else { f = behind ? 2 : 0; h = 0.86; this.flip = false; }
    const o = this.out > 0.5 ? 1 : 0, bob = (o ? Math.sin(this.t * 9) * 0.01 : sp < 0.8 ? Math.sin(this.t * 6) * 0.006 : 0);
    this.dog.position.set(ex + side * 0.62 * o, ey - 0.52 + 0.28 * o + bob, ez + 0.05 + 0.18 * o); this.dog.scale.set(h, h, 1);
    const fw = 1 / FRAMES, fr = 1 / GEARS; this.mat.map.repeat.set(this.flip ? -fw : fw, fr); this.mat.map.offset.set(this.flip ? (f + 1) * fw : f * fw, 1 - (gearRow + 1) * fr);
    this.woof.visible = barking; if (barking) this.woof.position.set(this.dog.position.x + side * 0.25, this.dog.position.y + h + 0.12, this.dog.position.z);
    return ev;
  }
}
