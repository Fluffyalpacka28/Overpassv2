import * as THREE from 'three';

export const PAINTS = [
  { name: 'Ember', color: '#ff5a3c' }, { name: 'Glacier', color: '#3cb4ff' }, { name: 'Citrus', color: '#ffc531' },
  { name: 'Jade', color: '#2fd39a' }, { name: 'Orchid', color: '#b06cff' }, { name: 'Ivory', color: '#f1ece2' },
  { name: 'Graphite', color: '#3a3f4b' }, { name: 'Rose', color: '#ff6fae' },
];

const mats = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.1, ...opts });
  return mats[key];
}

// Low-poly sporty coupe built from simple solids. Faces +Z.
export function buildCarMesh(color = '#ff5a3c', model = 0) {
  if (model > 0) return buildVariant(color, model);
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.35, metalness: 0.25 });
  const dark = mat('#1d2029'), glass = mat('#9fd6ff', { roughness: 0.1, metalness: 0.6, emissive: '#16304a', emissiveIntensity: 0.4 });
  // chassis: tapered shape via extruded side profile
  const prof = new THREE.Shape();
  prof.moveTo(-2.15, 0.35); prof.lineTo(2.2, 0.35); prof.lineTo(2.3, 0.62); prof.lineTo(1.9, 0.92); prof.lineTo(0.7, 1.0);
  prof.lineTo(-1.6, 1.02); prof.lineTo(-2.2, 0.95); prof.lineTo(-2.25, 0.55);
  const chassis = new THREE.ExtrudeGeometry(prof, { depth: 1.86, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  chassis.translate(0, 0, -0.93); chassis.rotateY(-Math.PI / 2);
  const cm = new THREE.Mesh(chassis, paint); cm.castShadow = true; body.add(cm);
  // cabin
  const cab = new THREE.Shape();
  cab.moveTo(-1.35, 0); cab.lineTo(0.9, 0); cab.lineTo(0.15, 0.6); cab.lineTo(-1.05, 0.62); cab.lineTo(-1.5, 0.05);
  const cabG = new THREE.ExtrudeGeometry(cab, { depth: 1.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  cabG.translate(0, 0, -0.75); cabG.rotateY(-Math.PI / 2); cabG.translate(0, 1.0, 0);
  const cabM = new THREE.Mesh(cabG, glass); cabM.castShadow = true; body.add(cabM);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 1.05), paint); roof.position.set(0, 1.64, -0.42); body.add(roof);
  // spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.42), dark); wing.position.set(0, 1.34, -2.05); body.add(wing);
  [-0.7, 0.7].forEach(x => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.2), dark); s.position.set(x, 1.17, -2.0); body.add(s); });
  // lights
  const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 });
  const tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 });
  [-0.62, 0.62].forEach(x => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.06), head); h.position.set(x, 0.72, 2.27); body.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), tail); t.position.set(x, 0.86, -2.27); body.add(t);
  });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 4.2), mat('#ffffff', { roughness: 0.5 }));
  stripe.position.set(0, 1.035, 0.02); body.add(stripe);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.05), dark); grille.position.set(0, 0.5, 2.3); body.add(grille);
  // wheels
  const tireG = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14); tireG.rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 6); rimG.rotateZ(Math.PI / 2);
  const wheels = [];
  [[-0.93, 1.38], [0.93, 1.38], [-0.93, -1.38], [0.93, -1.38]].forEach(([x, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(tireG, mat('#16181e', { roughness: 0.9 })); tire.castShadow = true; spin.add(tire);
    const rim = new THREE.Mesh(rimG, mat('#c9ced8', { metalness: 0.7, roughness: 0.3 })); spin.add(rim);
    g.add(pivot); wheels.push({ pivot, spin, front: i < 2 });
  });
  // soft blob shadow for distant cars / no-shadow mode
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
  g.userData = { body, wheels, paint };
  return g;
}

export function setPaint(mesh, color) { mesh.userData.paint.color.set(color); }

// ---------- extra car models (cosmetic only: same physics for every model) ----------
export const MODELS = [
  { name: 'Coupe', blurb: 'The classic' }, { name: 'Hatch', blurb: 'Compact city racer' },
  { name: 'Muscle', blurb: 'Long hood, wide stance' }, { name: 'Pickup', blurb: 'Truck with an open bed' },
  { name: 'Supercar', blurb: 'Low wedge, big wing' },
];
function buildVariant(color, model) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.35, metalness: 0.25 });
  const dark = mat('#1d2029'), glass = mat('#9fd6ff', { roughness: 0.1, metalness: 0.6, emissive: '#16304a', emissiveIntensity: 0.4 });
  const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 }), tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 });
  const white = mat('#ffffff', { roughness: 0.5 });
  const B = (w, h, d, x, y, z, m = paint) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  const lights = (hz, tz, hy, ty, sx, hw = 0.42, tw = 0.5) => [-sx, sx].forEach(x => { B(hw, 0.12, 0.06, x, hy, hz, head); B(tw, 0.1, 0.06, x, ty, tz, tail); });
  let track = 0.93, zf = 1.38, zr = -1.38, blobL = 5, blobW = 2.6;
  if (model === 1) { // hatchback
    B(1.85, 0.55, 3.8, 0, 0.62, 0); B(1.66, 0.62, 2.3, 0, 1.2, -0.3, glass); B(1.7, 0.08, 2.2, 0, 1.54, -0.3);
    B(1.4, 0.1, 0.4, 0, 1.5, -1.5, dark); B(1.0, 0.14, 0.05, 0, 0.55, 1.92, dark); lights(1.92, -1.92, 0.72, 0.8, 0.62);
    B(0.3, 0.02, 3.2, 0, 1.585, -0.3, white);
    track = 0.9; zf = 1.2; zr = -1.2; blobL = 4.3; blobW = 2.4;
  } else if (model === 2) { // muscle
    B(1.98, 0.6, 4.7, 0, 0.65, 0); B(0.7, 0.18, 1.2, 0, 1.0, 1.1, dark); B(1.6, 0.5, 1.8, 0, 1.2, -0.5, glass); B(1.5, 0.08, 1.5, 0, 1.48, -0.5);
    B(0.26, 0.02, 4.6, -0.28, 0.96, 0, white); B(0.26, 0.02, 4.6, 0.28, 0.96, 0, white); B(1.9, 0.08, 0.3, 0, 1.0, -2.35, dark);
    B(1.3, 0.14, 0.05, 0, 0.55, 2.37, dark); lights(2.37, -2.37, 0.76, 0.84, 0.7, 0.5, 0.55);
    track = 0.96; zf = 1.55; zr = -1.5; blobL = 5.4; blobW = 2.8;
  } else if (model === 3) { // pickup
    B(1.9, 0.7, 5.0, 0, 0.72, 0); B(1.7, 0.7, 1.6, 0, 1.4, 0.75, glass); B(1.75, 0.08, 1.5, 0, 1.78, 0.75);
    B(1.7, 0.05, 2.0, 0, 1.08, -1.4, dark); B(0.1, 0.4, 2.0, -0.9, 1.27, -1.4); B(0.1, 0.4, 2.0, 0.9, 1.27, -1.4); B(1.9, 0.4, 0.1, 0, 1.27, -2.45);
    B(1.9, 0.18, 0.2, 0, 0.5, 2.5, dark); B(1.9, 0.18, 0.2, 0, 0.5, -2.52, dark); B(1.1, 0.16, 0.05, 0, 0.78, 2.5, dark); lights(2.5, -2.5, 0.92, 0.95, 0.68, 0.46, 0.4);
    track = 0.98; zf = 1.65; zr = -1.5; blobL = 5.6; blobW = 2.7;
  } else { // supercar (4)
    const prof = new THREE.Shape();
    prof.moveTo(-2.2, 0.3); prof.lineTo(2.3, 0.3); prof.lineTo(2.35, 0.5); prof.lineTo(1.6, 0.75); prof.lineTo(0.5, 0.85); prof.lineTo(-1.5, 0.9); prof.lineTo(-2.2, 0.8); prof.lineTo(-2.25, 0.5);
    const ch = new THREE.ExtrudeGeometry(prof, { depth: 1.9, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
    ch.translate(0, 0, -0.95); ch.rotateY(-Math.PI / 2); const cm = new THREE.Mesh(ch, paint); cm.castShadow = true; body.add(cm);
    B(1.4, 0.4, 1.7, 0, 1.06, -0.35, glass); B(1.3, 0.06, 1.2, 0, 1.27, -0.4);
    B(2.1, 0.06, 0.5, 0, 1.38, -2.1, dark); [-0.8, 0.8].forEach(x => B(0.07, 0.35, 0.2, x, 1.18, -2.05, dark));
    [-1.04, 1.04].forEach(x => B(0.1, 0.2, 0.8, x, 0.65, -0.2, dark)); B(2.0, 0.05, 0.4, 0, 0.32, 2.35, dark);
    B(0.2, 0.02, 4.1, 0, 0.935, 0, white); lights(2.31, -2.27, 0.62, 0.8, 0.65, 0.5, 0.55);
    track = 1.0; zf = 1.45; zr = -1.35; blobL = 5.2; blobW = 2.7;
  }
  const tireG = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14); tireG.rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 6); rimG.rotateZ(Math.PI / 2);
  const wheels = [];
  [[-track, zf], [track, zf], [-track, zr], [track, zr]].forEach(([x, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(tireG, mat('#16181e', { roughness: 0.9 })); tire.castShadow = true; spin.add(tire);
    const rim = new THREE.Mesh(rimG, mat('#c9ced8', { metalness: 0.7, roughness: 0.3 })); spin.add(rim);
    g.add(pivot); wheels.push({ pivot, spin, front: i < 2 });
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(blobW, blobL), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
  g.userData = { body, wheels, paint };
  return g;
}
// Replace a car's visual model in place (keeps position, heading, paint, and name-tag sprites).
export function swapCarModel(car, model, color) {
  const old = car.mesh; model = Math.max(0, Math.min(MODELS.length - 1, model | 0));
  const col = color || ('#' + old.userData.paint.color.getHexString());
  const m = buildCarMesh(col, model); m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  old.children.filter(o => o.isSprite).forEach(s => { old.remove(s); m.add(s); });
  m.position.copy(old.position); m.rotation.copy(old.rotation); m.visible = old.visible;
  const parent = old.parent; if (parent) { parent.remove(old); parent.add(m); }
  old.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  car.mesh = m; car.model = model; return m;
}


// Arcade car model. Forward is (sin yaw, cos yaw) in XZ.
export class Car {
  constructor(color, model = 0) {
    this.model = model; this.mesh = buildCarMesh(color, model);
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.wheelSpin = 0; this.slip = 0; this.offroad = false;
    this.boost = 1; this.boosting = false;
    this.maxSpeed = 52; this.accel = 19; this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.prevAccel = 0;
  }
  get fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get speed() { const [fx, fz] = this.fwd; return this.vx * fx + this.vz * fz; }
  place(x, z, yaw) { this.x = x; this.y = 0; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.sync(0); }
  update(dt, surfaceGrip = 1) {
    const inp = this.input;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx; // right vector
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    const off = this.offroad;
    this.boosting = inp.boost && this.boost > 0.02 && inp.throttle > 0;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.33); else this.boost = Math.min(1, this.boost + dt * 0.05);
    const top = (this.boosting ? this.maxSpeed * 1.28 : this.maxSpeed) * (off ? 0.55 : 1);
    let a = 0;
    if (inp.throttle > 0) { const k = 1 - Math.max(0, vF) / top; a += inp.throttle * this.accel * (this.boosting ? 1.6 : 1) * Math.max(-0.5, k); }
    if (inp.brake > 0) { if (vF > 1) a -= inp.brake * 34; else a -= inp.brake * 10 * (vF > -12 ? 1 : 0); }
    if (inp.handbrake) a -= Math.sign(vF) * 6;
    vF += a * dt;
    vF -= vF * (off ? 0.9 : 0.12) * dt; // drag
    if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3 * dt);
    // lateral grip
    const grip = (inp.handbrake ? 1.6 : 9) * surfaceGrip * (off ? 0.7 : 1);
    vR *= Math.exp(-grip * dt);
    this.slip = Math.abs(vR) + (inp.handbrake ? Math.abs(vF) * 0.15 : 0);
    // steering
    const target = inp.steer;
    this.steer += (target - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vF);
    const steerRate = 2.3 * Math.min(1, sp / 7) * (1 - 0.5 * Math.min(1, sp / 60)) * (inp.handbrake ? 1.45 : 1);
    this.yaw += this.steer * steerRate * dt * Math.sign(vF || 1);
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nrx = nfz, nrz = -nfx;
    this.vx = nfx * vF + nrx * vR; this.vz = nfz * vF + nrz * vR;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.prevAccel = a;
    this.sync(dt, vF, vR);
  }
  sync(dt, vF = this.speed, vR = 0) {
    const m = this.mesh; m.position.set(this.x, this.y, this.z); m.rotation.y = this.yaw;
    const { body, wheels } = m.userData;
    body.rotation.z += ((-vR * 0.02 - this.steer * Math.min(1, Math.abs(vF) / 30) * 0.05) - body.rotation.z) * Math.min(1, dt * 6);
    body.rotation.x += ((-this.prevAccel * 0.0025) - body.rotation.x) * Math.min(1, dt * 5);
    this.wheelSpin += vF * dt / 0.42;
    wheels.forEach(w => { w.spin.rotation.x = this.wheelSpin; if (w.front) w.pivot.rotation.y = this.steer * 0.45; });
  }
  bump(nx, nz, restitution = 0.35) {
    // reflect velocity along normal n (pointing away from obstacle)
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) { this.vx -= (1 + restitution) * vn * nx; this.vz -= (1 + restitution) * vn * nz; this.vx *= 0.8; this.vz *= 0.8; return -vn; }
    return 0;
  }
}

// Name tag sprite above cars (optional driver picture, data URL)
export function nameTag(text, color = '#ffffff', pic = '') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = img => {
    x.clearRect(0, 0, 256, 64);
    x.font = '600 30px Satoshi, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const extra = img ? 40 : 0, w = Math.min(250, x.measureText(text).width + 34 + extra), left = (256 - w) / 2;
    x.fillStyle = 'rgba(16,14,30,.72)'; x.beginPath(); x.roundRect(left, 8, w, 48, 24); x.fill();
    if (img) { x.save(); x.beginPath(); x.arc(left + 28, 32, 20, 0, Math.PI * 2); x.clip(); x.drawImage(img, left + 8, 12, 40, 40); x.restore(); x.strokeStyle = color; x.lineWidth = 3; x.beginPath(); x.arc(left + 28, 32, 20, 0, Math.PI * 2); x.stroke(); }
    else { x.fillStyle = color; x.beginPath(); x.arc(left + 18, 32, 6, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#fff'; x.fillText(text, 128 + 6 + extra / 2, 33);
    tex.needsUpdate = true;
  };
  draw(null);
  if (pic && /^data:image\//.test(pic)) { const im = new Image(); im.onload = () => draw(im); im.src = pic; }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(5, 1.25, 1); s.position.y = 3.2; s.renderOrder = 10;
  return s;
}
