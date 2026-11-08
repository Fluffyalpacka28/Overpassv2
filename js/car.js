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

// ---------- car models ----------
// stats are multipliers on top speed, acceleration and grip (kept close so story races stay fair)
export const MODELS = [
  { id: 'coupe', name: 'Vesper GT', kind: 'Sport coupe', top: 1, accel: 1, grip: 1 },
  { id: 'hatch', name: 'Pocket R', kind: 'Hot hatch', top: 0.93, accel: 1.1, grip: 1.08 },
  { id: 'muscle', name: 'Brute 70', kind: 'Muscle car', top: 1.06, accel: 1.06, grip: 0.88 },
  { id: 'roadster', name: 'Breeze', kind: 'Roadster', top: 0.98, accel: 1.02, grip: 1.1 },
  { id: 'pickup', name: 'Haul XT', kind: 'Pickup truck', top: 0.9, accel: 0.95, grip: 0.95 },
  { id: 'rally', name: 'Gravel Six', kind: 'Rally wagon', top: 0.96, accel: 1.04, grip: 1.04 },
  { id: 'formula', name: 'Apex F', kind: 'Open-wheel', top: 1.08, accel: 1.08, grip: 1.12 },
];
export const modelById = id => MODELS.find(m => m.id === id) || MODELS[0];

function extrudeSide(pts, width, material, bevel = 0.08) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  geo.translate(0, 0, -width / 2); geo.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, material); m.castShadow = true; return m;
}
function box(w, h, d, material, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function lights(body, zf, zr, yf, yr, sx = 0.62, w = 0.42) {
  const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 }), tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 });
  [-sx, sx].forEach(x => { box(w, 0.12, 0.06, head, x, yf, zf, body); box(w + 0.08, 0.1, 0.06, tail, x, yr, zr, body); });
}
function addWheels(g, list, r = 0.42, w = 0.34) {
  const wheels = [];
  list.forEach(([x, z, rr = r, ww = w]) => {
    const tireG = new THREE.CylinderGeometry(rr, rr, ww, 14); tireG.rotateZ(Math.PI / 2);
    const rimG = new THREE.CylinderGeometry(rr * 0.58, rr * 0.58, ww + 0.02, 6); rimG.rotateZ(Math.PI / 2);
    const pivot = new THREE.Group(); pivot.position.set(x, rr, z); const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(tireG, mat('#16181e', { roughness: 0.9 })); tire.castShadow = true; spin.add(tire);
    spin.add(new THREE.Mesh(rimG, mat('#c9ced8', { metalness: 0.7, roughness: 0.3 })));
    g.add(pivot); wheels.push({ pivot, spin, front: z > 0 });
  });
  return wheels;
}
const BUILDERS = {
  coupe(body, paint, P) {
    body.add(extrudeSide([[-2.15, 0.35], [2.2, 0.35], [2.3, 0.62], [1.9, 0.92], [0.7, 1.0], [-1.6, 1.02], [-2.2, 0.95], [-2.25, 0.55]], 1.86, paint));
    const cab = extrudeSide([[-1.35, 0], [0.9, 0], [0.15, 0.6], [-1.05, 0.62], [-1.5, 0.05]], 1.5, P.glass, 0.05); cab.position.y = 1.0; body.add(cab);
    box(1.42, 0.08, 1.05, paint, 0, 1.64, -0.42, body);
    box(1.9, 0.07, 0.42, P.dark, 0, 1.34, -2.05, body); [-0.7, 0.7].forEach(x => box(0.08, 0.3, 0.2, P.dark, x, 1.17, -2.0, body));
    lights(body, 2.27, -2.27, 0.72, 0.86); box(0.34, 0.02, 4.2, P.white, 0, 1.035, 0.02, body); box(1.1, 0.16, 0.05, P.dark, 0, 0.5, 2.3, body);
    return [[-0.93, 1.38], [0.93, 1.38], [-0.93, -1.38], [0.93, -1.38]];
  },
  hatch(body, paint, P) {
    body.add(extrudeSide([[-1.75, 0.32], [1.8, 0.32], [1.9, 0.6], [1.6, 0.92], [0.7, 1.0], [-1.7, 1.02], [-1.8, 0.6]], 1.76, paint));
    const cab = extrudeSide([[-1.7, 0], [0.75, 0], [0.05, 0.72], [-1.6, 0.74], [-1.72, 0.1]], 1.56, P.glass, 0.05); cab.position.y = 1.0; body.add(cab);
    box(1.5, 0.08, 1.7, paint, 0, 1.78, -0.78, body); box(1.5, 0.05, 0.3, P.dark, 0, 1.8, -1.72, body);
    [-0.62, 0.62].forEach(x => box(0.05, 0.06, 1.5, P.dark, x, 1.85, -0.75, body)); // roof rails
    lights(body, 1.87, -1.82, 0.72, 0.9, 0.58, 0.36); box(1.0, 0.18, 0.05, P.dark, 0, 0.52, 1.92, body);
    box(0.06, 0.32, 3.2, P.white, 0.9, 0.62, 0, body); box(0.06, 0.32, 3.2, P.white, -0.9, 0.62, 0, body);
    return [[-0.88, 1.15, 0.38, 0.3], [0.88, 1.15, 0.38, 0.3], [-0.88, -1.15, 0.38, 0.3], [0.88, -1.15, 0.38, 0.3]];
  },
  muscle(body, paint, P) {
    body.add(extrudeSide([[-2.35, 0.38], [2.45, 0.38], [2.5, 0.72], [2.3, 0.98], [0.5, 1.05], [-1.9, 1.05], [-2.4, 1.0], [-2.45, 0.6]], 2.0, paint));
    const cab = extrudeSide([[-1.6, 0], [0.45, 0], [-0.15, 0.52], [-1.2, 0.54], [-1.75, 0.05]], 1.6, P.glass, 0.05); cab.position.y = 1.05; body.add(cab);
    box(1.52, 0.08, 1.0, paint, 0, 1.6, -0.68, body);
    box(0.7, 0.18, 0.9, P.dark, 0, 1.12, 1.4, body); // hood scoop
    [-0.28, 0.28].forEach(x => box(0.24, 0.02, 4.7, P.white, x, 1.07, 0, body));
    box(1.95, 0.09, 0.22, paint, 0, 1.14, -2.35, body); // ducktail
    lights(body, 2.52, -2.47, 0.74, 0.8, 0.7, 0.36); box(1.5, 0.22, 0.05, P.dark, 0, 0.6, 2.52, body); box(2.06, 0.12, 0.12, P.chrome, 0, 0.42, 2.5, body); box(2.06, 0.12, 0.12, P.chrome, 0, 0.42, -2.48, body);
    [-0.5, 0.5].forEach(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), P.chrome); e.rotation.x = Math.PI / 2; e.position.set(x, 0.42, -2.55); body.add(e); });
    return [[-1.0, 1.55, 0.42, 0.34], [1.0, 1.55, 0.42, 0.34], [-1.02, -1.5, 0.47, 0.44], [1.02, -1.5, 0.47, 0.44]];
  },
  roadster(body, paint, P) {
    body.add(extrudeSide([[-2.0, 0.32], [2.05, 0.32], [2.15, 0.58], [1.7, 0.86], [0.4, 0.92], [-0.4, 0.9], [-1.95, 0.95], [-2.05, 0.55]], 1.8, paint));
    const ws = box(1.5, 0.42, 0.06, P.glass, 0, 1.12, 0.32, body); ws.rotation.x = -0.45;
    const seat = mat('#3b2a24', { roughness: 0.8 });
    [-0.4, 0.4].forEach(x => { box(0.55, 0.12, 0.55, seat, x, 0.95, -0.35, body); box(0.55, 0.5, 0.12, seat, x, 1.18, -0.66, body); });
    [-0.4, 0.4].forEach(x => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 12, Math.PI), P.chrome); h.position.set(x, 1.18, -0.85); body.add(h); });
    box(1.5, 0.1, 0.9, P.dark, 0, 0.93, -0.5, body); // cockpit floor
    lights(body, 2.17, -2.07, 0.66, 0.8, 0.6, 0.38); box(0.9, 0.12, 0.05, P.dark, 0, 0.46, 2.16, body);
    box(1.7, 0.03, 1.2, paint, 0, 0.955, -1.5, body);
    return [[-0.9, 1.32, 0.4, 0.3], [0.9, 1.32, 0.4, 0.3], [-0.9, -1.3, 0.4, 0.32], [0.9, -1.3, 0.4, 0.32]];
  },
  pickup(body, paint, P) {
    body.add(extrudeSide([[-2.5, 0.55], [2.45, 0.55], [2.5, 1.05], [2.3, 1.3], [1.15, 1.35], [-2.5, 1.35]], 2.0, paint, 0.06));
    const cab = extrudeSide([[-0.5, 0], [1.05, 0], [0.55, 0.78], [-0.4, 0.8], [-0.55, 0.05]], 1.8, P.glass, 0.05); cab.position.y = 1.35; body.add(cab);
    box(1.82, 0.1, 1.0, paint, 0, 2.17, 0.05, body);
    // bed
    box(1.9, 0.08, 1.9, P.dark, 0, 1.38, -1.5, body);
    [-0.97, 0.97].forEach(x => box(0.07, 0.45, 1.95, paint, x, 1.6, -1.5, body)); box(1.98, 0.45, 0.07, paint, 0, 1.6, -2.48, body);
    const lb = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.2 }); box(1.4, 0.12, 0.14, P.dark, 0, 2.3, 0.4, body); for (let i = -2; i <= 2; i++) box(0.18, 0.08, 0.04, lb, i * 0.28, 2.3, 0.48, body);
    lights(body, 2.52, -2.52, 1.0, 1.1, 0.68, 0.4); box(1.6, 0.4, 0.05, P.chrome, 0, 0.82, 2.52, body); box(2.05, 0.18, 0.18, P.dark, 0, 0.6, 2.5, body);
    return [[-1.0, 1.6, 0.52, 0.42], [1.0, 1.6, 0.52, 0.42], [-1.0, -1.6, 0.52, 0.42], [1.0, -1.6, 0.52, 0.42]];
  },
  rally(body, paint, P) {
    body.add(extrudeSide([[-2.1, 0.5], [2.15, 0.5], [2.25, 0.8], [1.95, 1.08], [0.85, 1.15], [-2.05, 1.18], [-2.15, 0.75]], 1.84, paint));
    const cab = extrudeSide([[-2.0, 0], [0.9, 0], [0.2, 0.7], [-1.9, 0.72], [-2.02, 0.1]], 1.62, P.glass, 0.05); cab.position.y = 1.15; body.add(cab);
    box(1.6, 0.08, 2.05, paint, 0, 1.92, -0.88, body);
    box(1.8, 0.07, 0.4, P.dark, 0, 1.98, -2.0, body); [-0.7, 0.7].forEach(x => box(0.07, 0.14, 0.2, P.dark, x, 1.92, -1.95, body));
    const spot = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 });
    box(1.3, 0.1, 0.12, P.dark, 0, 2.02, 0.15, body); [-0.45, -0.15, 0.15, 0.45].forEach(x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), spot); c.rotation.x = Math.PI / 2; c.position.set(x, 2.1, 0.22); body.add(c); });
    [-0.85, 0.85].forEach(x => box(0.3, 0.32, 0.03, P.dark, x, 0.5, -1.85, body)); // mudflaps
    box(0.06, 0.5, 1.4, P.white, 0.94, 0.85, 0.2, body); box(0.06, 0.5, 1.4, P.white, -0.94, 0.85, 0.2, body);
    lights(body, 2.27, -2.17, 0.88, 1.0, 0.6, 0.38); box(1.2, 0.2, 0.05, P.dark, 0, 0.66, 2.27, body);
    return [[-0.92, 1.35, 0.46, 0.36], [0.92, 1.35, 0.46, 0.36], [-0.92, -1.35, 0.46, 0.36], [0.92, -1.35, 0.46, 0.36]];
  },
  formula(body, paint, P) {
    body.add(extrudeSide([[-2.0, 0.22], [2.3, 0.22], [2.45, 0.32], [1.2, 0.62], [0.2, 0.75], [-0.9, 0.95], [-1.8, 0.82], [-2.05, 0.5]], 0.8, paint, 0.06));
    [-0.62, 0.62].forEach(x => body.add(Object.assign(extrudeSide([[-1.4, 0.22], [0.6, 0.22], [0.5, 0.58], [-1.3, 0.62]], 0.45, paint, 0.04), {}))); // sidepods
    body.children.slice(-2).forEach((m, i) => m.position.x = i ? 0.62 : -0.62);
    box(0.5, 0.35, 0.6, P.dark, 0, 0.95, -0.3, body); // cockpit/driver
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#f4f4f4', { roughness: 0.4 })); helmet.position.set(0, 1.12, -0.2); body.add(helmet);
    box(2.1, 0.06, 0.42, paint, 0, 0.3, 2.35, body); [-1.02, 1.02].forEach(x => box(0.05, 0.22, 0.5, P.dark, x, 0.36, 2.35, body)); // front wing
    box(1.7, 0.08, 0.5, P.dark, 0, 1.25, -2.05, body); [-0.85, 0.85].forEach(x => box(0.05, 0.6, 0.6, P.dark, x, 1.0, -2.05, body)); // rear wing
    box(0.12, 0.45, 0.1, P.dark, 0, 1.0, -1.9, body);
    const tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.4 }); box(0.2, 0.1, 0.05, tail, 0, 0.55, -2.08, body);
    return [[-1.0, 1.55, 0.38, 0.38], [1.0, 1.55, 0.38, 0.38], [-1.0, -1.45, 0.44, 0.5], [1.0, -1.45, 0.44, 0.5]];
  },
};

// Build a car mesh for a model. Faces +Z.
export function buildCarMesh(color = '#ff5a3c', model = 'coupe') {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.35, metalness: 0.25 });
  const P = { dark: mat('#1d2029'), glass: mat('#9fd6ff', { roughness: 0.1, metalness: 0.6, emissive: '#16304a', emissiveIntensity: 0.4 }), white: mat('#ffffff', { roughness: 0.5 }), chrome: mat('#d9dde4', { metalness: 0.85, roughness: 0.25 }) };
  const build = BUILDERS[model] || BUILDERS.coupe;
  const wl = build(body, paint, P);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const wheels = addWheels(g, wl);
  const len = model === 'hatch' ? 4.2 : model === 'muscle' || model === 'pickup' ? 5.4 : 5;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
  g.userData = { body, wheels, paint, model };
  return g;
}

export function setPaint(mesh, color) { mesh.userData.paint.color.set(color); }

// Arcade car model. Forward is (sin yaw, cos yaw) in XZ.
export class Car {
  constructor(color, model = 'coupe') {
    this.mesh = buildCarMesh(color, model); this.model = model; this.stats = modelById(model);
    this.x = 0; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.steer = 0; this.wheelSpin = 0; this.slip = 0; this.offroad = false;
    this.boost = 1; this.boosting = false;
    this.maxSpeed = 52; this.accel = 19; this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.prevAccel = 0;
  }
  setModel(model) {
    if (model === this.model) return;
    const old = this.mesh, parent = old.parent, color = old.userData.paint.color.getStyle();
    const m = buildCarMesh(color, model);
    for (const c of [...old.children]) if (c.isSprite) m.add(c); // keep name tags
    if (parent) { parent.remove(old); parent.add(m); }
    old.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.mesh = m; this.model = model; this.stats = modelById(model); this.sync(0);
  }
  get fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get speed() { const [fx, fz] = this.fwd; return this.vx * fx + this.vz * fz; }
  place(x, z, yaw, y = null) { this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.vy = 0; if (y != null) { this.y = y; this.air = false; } this.sync(0); }
  update(dt, surfaceGrip = 1) {
    const inp = this.input;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx; // right vector
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    const off = this.offroad;
    this.boosting = inp.boost && this.boost > 0.02 && inp.throttle > 0;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.33); else this.boost = Math.min(1, this.boost + dt * 0.05);
    const st = this.stats || MODELS[0], top = (this.boosting ? this.maxSpeed * 1.28 : this.maxSpeed) * st.top * (off ? 0.55 : 1);
    let a = 0;
    if (inp.throttle > 0) { const k = 1 - Math.max(0, vF) / top; a += inp.throttle * this.accel * st.accel * (this.boosting ? 1.6 : 1) * Math.max(-0.5, k); }
    if (inp.brake > 0) { if (vF > 1) a -= inp.brake * 34; else a -= inp.brake * 10 * (vF > -12 ? 1 : 0); }
    if (inp.handbrake) a -= Math.sign(vF) * 6;
    vF += a * dt;
    vF -= vF * (off ? 0.9 : 0.12) * dt; // drag
    if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3 * dt);
    // lateral grip
    const grip = (inp.handbrake ? 1.6 : 9) * st.grip * surfaceGrip * (off ? 0.7 : 1);
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
    const m = this.mesh; m.position.set(this.x, this.y || 0, this.z); if (m.rotation.order !== 'YXZ') m.rotation.order = 'YXZ'; m.rotation.set(this.pitch || 0, this.yaw, this.roll || 0);
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
export function nameTag(text, color = '#ffffff', img = null) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 80;
  const x = c.getContext('2d'); x.font = '600 30px Satoshi, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle';
  const tw = Math.min(200, x.measureText(text).width), w = tw + (img ? 92 : 58), l = (320 - w) / 2;
  x.fillStyle = 'rgba(16,14,30,.78)'; x.beginPath(); x.roundRect(l, 10, w, 60, 30); x.fill();
  if (img) {
    x.save(); x.beginPath(); x.arc(l + 32, 40, 24, 0, Math.PI * 2); x.clip(); x.drawImage(img, l + 8, 16, 48, 48); x.restore();
    x.strokeStyle = color; x.lineWidth = 4; x.beginPath(); x.arc(l + 32, 40, 25, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.fillText(text, l + 66, 41, 200);
  } else {
    x.fillStyle = color; x.beginPath(); x.arc(l + 26, 40, 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillText(text, l + 42, 41, 200);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(6, 1.5, 1); s.position.y = 3.3; s.renderOrder = 10;
  return s;
}
