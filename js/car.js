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
export function buildCarMesh(color = '#ff5a3c') {
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

// Arcade car model. Forward is (sin yaw, cos yaw) in XZ.
export class Car {
  constructor(color) {
    this.mesh = buildCarMesh(color);
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.wheelSpin = 0; this.slip = 0; this.offroad = false;
    this.boost = 1; this.boosting = false;
    this.maxSpeed = 52; this.accel = 19; this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.prevAccel = 0;
  }
  get fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get speed() { const [fx, fz] = this.fwd; return this.vx * fx + this.vz * fz; }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.sync(0); }
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
    const m = this.mesh; m.position.set(this.x, 0, this.z); m.rotation.y = this.yaw;
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

// Name tag sprite above cars
export function nameTag(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = '600 30px Satoshi, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(250, x.measureText(text).width + 34);
  x.fillStyle = 'rgba(16,14,30,.72)'; x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 24); x.fill();
  x.fillStyle = color; x.beginPath(); x.arc((256 - w) / 2 + 18, 32, 6, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.fillText(text, 128 + 6, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(5, 1.25, 1); s.position.y = 3.2; s.renderOrder = 10;
  return s;
}
