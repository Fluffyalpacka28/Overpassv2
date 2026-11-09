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
  { id: 'trail', name: 'Trailbeast', kind: 'Off-road 4x4', top: 0.94, accel: 1.0, grip: 1.0, off: 0 },
  { id: 'monster', name: 'Mudzilla', kind: 'Monster truck', top: 0.9, accel: 1.02, grip: 0.92, off: 0 },
  { id: 'buggy', name: 'Sandflea', kind: 'Dune buggy', top: 0.97, accel: 1.1, grip: 0.98, off: 0 },
  { id: 'hyper', name: 'Volt X', kind: 'Hypercar', top: 1.1, accel: 1.1, grip: 1.08 },
  { id: 'van', name: 'Courier', kind: 'Delivery van', top: 0.86, accel: 0.9, grip: 0.9, off: 0.7 },
  { id: 'bike', name: 'Streak', kind: 'Motorcycle', top: 1.04, accel: 1.12, grip: 0.96 },
];
// how much of the off-road slowdown a model feels (1 = full, 0 = none)
MODELS.forEach(m => { if (m.off == null) m.off = m.id === 'rally' ? 0.35 : m.id === 'pickup' ? 0.5 : 1; });
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
    g.add(pivot); wheels.push({ pivot, spin, front: z > 0, r: rr });
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
  trail(body, paint, P) {
    // lifted 4x4: boxy body, fender flares, roof rack + light bar, bull bar, spare wheel
    body.add(extrudeSide([[-2.2, 0.85], [2.25, 0.85], [2.3, 1.35], [2.1, 1.6], [1.0, 1.68], [-2.2, 1.7]], 1.95, paint, 0.06));
    const cab = extrudeSide([[-2.1, 0], [0.95, 0], [0.6, 0.85], [-2.05, 0.88], [-2.12, 0.05]], 1.8, P.glass, 0.04); cab.position.y = 1.7; body.add(cab);
    box(1.86, 0.1, 2.95, paint, 0, 2.63, -0.6, body);
    [-0.85, 0.85].forEach(x => box(0.06, 0.18, 2.6, P.dark, x, 2.78, -0.6, body)); for (let i = 0; i < 4; i++) box(1.75, 0.05, 0.06, P.dark, 0, 2.86, -1.7 + i * 0.75, body);
    const lb = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); box(1.6, 0.16, 0.14, P.dark, 0, 2.86, 0.8, body); box(1.5, 0.1, 0.05, lb, 0, 2.86, 0.88, body);
    [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]].forEach(([x, z]) => box(0.28, 0.16, 1.35, P.dark, x, 1.32, z, body)); // flares
    box(2.0, 0.14, 0.14, P.dark, 0, 0.95, 2.4, body); [-0.55, 0.55].forEach(x => box(0.1, 0.65, 0.1, P.dark, x, 1.25, 2.42, body)); box(1.2, 0.1, 0.1, P.dark, 0, 1.55, 2.42, body); // bull bar
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), mat('#16181e', { roughness: 0.9 })); sp.rotation.x = Math.PI / 2; sp.position.set(0, 1.45, -2.38); body.add(sp);
    box(1.6, 0.35, 4.2, P.dark, 0, 0.7, 0, body); // chassis
    lights(body, 2.32, -2.24, 1.35, 1.4, 0.68, 0.36);
    return [[-1.05, 1.5, 0.62, 0.52], [1.05, 1.5, 0.62, 0.52], [-1.05, -1.5, 0.62, 0.52], [1.05, -1.5, 0.62, 0.52]];
  },
  monster(body, paint, P) {
    // pickup body perched on a tall frame and giant tyres
    const y0 = 1.75;
    body.add(Object.assign(extrudeSide([[-2.3, y0], [2.3, y0], [2.35, y0 + 0.5], [2.15, y0 + 0.72], [1.0, y0 + 0.76], [-2.3, y0 + 0.76]], 2.1, paint, 0.06), {}));
    const cab = extrudeSide([[-0.6, 0], [0.95, 0], [0.5, 0.75], [-0.5, 0.78], [-0.62, 0.05]], 1.9, P.glass, 0.04); cab.position.y = y0 + 0.76; body.add(cab);
    box(1.92, 0.1, 1.05, paint, 0, y0 + 1.56, 0.12, body);
    box(2.0, 0.08, 1.7, P.dark, 0, y0 + 0.8, -1.4, body); [-1.02, 1.02].forEach(x => box(0.07, 0.4, 1.75, paint, x, y0 + 1.0, -1.4, body));
    box(1.1, 0.35, 4.4, P.dark, 0, 1.25, 0, body); [-1.6, 1.6].forEach(z => box(2.4, 0.18, 0.2, P.dark, 0, 1.05, z, body)); // frame + axles
    [[-0.9, 1.7], [0.9, 1.7], [-0.9, -1.7], [0.9, -1.7]].forEach(([x, z]) => { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), P.chrome); sh.position.set(x, 1.45, z); sh.rotation.z = x > 0 ? -0.35 : 0.35; body.add(sh); });
    lights(body, 2.37, -2.32, y0 + 0.45, y0 + 0.5, 0.72, 0.4);
    const lb = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); for (let i = -2; i <= 2; i++) box(0.22, 0.14, 0.06, lb, i * 0.34, y0 + 1.66, 0.62, body);
    return [[-1.4, 1.7, 1.05, 0.85], [1.4, 1.7, 1.05, 0.85], [-1.4, -1.7, 1.05, 0.85], [1.4, -1.7, 1.05, 0.85]];
  },
  buggy(body, paint, P) {
    // open tube-frame dune buggy
    body.add(extrudeSide([[-1.4, 0.45], [1.6, 0.45], [1.95, 0.75], [1.2, 0.85], [-1.3, 0.9], [-1.5, 0.7]], 1.3, paint, 0.05));
    const tube = mat('#22252c', { metalness: 0.5, roughness: 0.4 });
    const bar = (x0, y0, z0, x1, y1, z1) => { const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 6), tube); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()); m.castShadow = true; body.add(m); };
    [-0.6, 0.6].forEach(x => { bar(x, 0.85, 0.9, x * 0.85, 1.9, 0.1); bar(x * 0.85, 1.9, 0.1, x * 0.85, 1.9, -0.9); bar(x * 0.85, 1.9, -0.9, x, 0.9, -1.35); });
    bar(-0.51, 1.9, 0.1, 0.51, 1.9, 0.1); bar(-0.51, 1.9, -0.9, 0.51, 1.9, -0.9);
    const seat = mat('#3b2a24', { roughness: 0.8 }); [-0.3, 0.3].forEach(x => { box(0.45, 0.12, 0.5, seat, x, 0.95, -0.3, body); box(0.45, 0.6, 0.1, seat, x, 1.25, -0.6, body); });
    box(0.8, 0.5, 0.7, P.dark, 0, 1.05, -1.1, body); [-0.2, 0.2].forEach(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), P.chrome); e.rotation.x = Math.PI / 2; e.position.set(x, 1.0, -1.6); body.add(e); });
    const spot = mat('#fffbe6', { emissive: '#fff6c8', emissiveIntensity: 1.6 }); [-0.3, 0.3].forEach(x => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), spot); c.rotation.x = Math.PI / 2; c.position.set(x, 1.95, 0.18); body.add(c); });
    const tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 }); [-0.5, 0.5].forEach(x => box(0.15, 0.1, 0.05, tail, x, 0.8, -1.52, body));
    return [[-0.95, 1.3, 0.48, 0.34], [0.95, 1.3, 0.48, 0.34], [-1.0, -1.2, 0.6, 0.5], [1.0, -1.2, 0.6, 0.5]];
  },
  hyper(body, paint, P) {
    body.add(extrudeSide([[-2.3, 0.3], [2.35, 0.3], [2.45, 0.45], [1.6, 0.72], [0.4, 0.98], [-0.9, 1.0], [-2.2, 0.85], [-2.35, 0.5]], 2.0, paint));
    const cab = extrudeSide([[-1.0, 0], [0.75, 0], [0.0, 0.42], [-0.8, 0.42], [-1.15, 0.05]], 1.35, P.glass, 0.05); cab.position.y = 0.95; body.add(cab);
    box(1.9, 0.05, 0.45, P.dark, 0, 1.3, -2.15, body); [-0.7, 0.7].forEach(x => box(0.06, 0.32, 0.18, P.dark, x, 1.12, -2.05, body));
    [-1.01, 1.01].forEach(x => box(0.06, 0.25, 1.1, P.dark, x, 0.6, -0.4, body)); // side intakes
    const strip = mat('#7cf3ff', { emissive: '#3ad8ff', emissiveIntensity: 1.8 }); [-1.02, 1.02].forEach(x => box(0.03, 0.04, 3.6, strip, x, 0.36, 0, body));
    lights(body, 2.4, -2.37, 0.55, 0.74, 0.72, 0.5); box(1.8, 0.05, 0.05, mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.4 }), 0, 0.74, -2.38, body);
    return [[-0.98, 1.45, 0.4, 0.34], [0.98, 1.45, 0.4, 0.34], [-1.0, -1.45, 0.43, 0.42], [1.0, -1.45, 0.43, 0.42]];
  },
  van(body, paint, P) {
    body.add(extrudeSide([[-2.6, 0.45], [2.55, 0.45], [2.6, 1.0], [2.3, 1.35], [1.6, 2.5], [-2.6, 2.55]], 2.05, paint, 0.06));
    const ws = box(1.85, 0.95, 0.06, P.glass, 0, 1.9, 1.97, body); ws.rotation.x = 0.55;
    [-1.04, 1.04].forEach(x => box(0.06, 0.6, 0.9, P.glass, x, 1.75, 1.45, body));
    box(0.06, 1.5, 3.0, P.white, 1.04, 1.6, -0.9, body); box(0.06, 1.5, 3.0, P.white, -1.04, 1.6, -0.9, body); // side panels for livery
    box(0.06, 0.25, 3.0, paint, 1.06, 1.6, -0.9, body); box(0.06, 0.25, 3.0, paint, -1.06, 1.6, -0.9, body);
    box(0.04, 1.9, 0.04, P.dark, 0, 1.5, -2.63, body); box(2.1, 0.12, 0.2, P.dark, 0, 0.55, -2.6, body);
    lights(body, 2.62, -2.62, 0.95, 1.3, 0.72, 0.36); box(1.6, 0.3, 0.05, P.dark, 0, 0.7, 2.6, body);
    return [[-0.95, 1.75, 0.46, 0.36], [0.95, 1.75, 0.46, 0.36], [-0.95, -1.7, 0.46, 0.36], [0.95, -1.7, 0.46, 0.36]];
  },
  bike(body, paint, P) {
    // sport bike with a rider; leans into corners
    body.add(extrudeSide([[-0.9, 0.5], [0.9, 0.55], [1.05, 0.9], [0.65, 1.15], [-0.15, 1.08], [-0.95, 1.0]], 0.42, paint, 0.04));
    box(0.32, 0.06, 0.7, mat('#22252c'), 0, 1.06, -0.55, body); // seat
    const ws = box(0.4, 0.3, 0.04, P.glass, 0, 1.28, 0.78, body); ws.rotation.x = -0.6;
    box(0.5, 0.06, 0.06, P.dark, 0, 1.18, 0.6, body); // bars
    const suit = mat('#24262e', { roughness: 0.7 });
    const torso = box(0.42, 0.6, 0.32, suit, 0, 1.45, -0.1, body); torso.rotation.x = 0.7;
    [-0.18, 0.18].forEach(x => { const l = box(0.14, 0.14, 0.6, suit, x, 1.05, -0.2, body); l.rotation.x = -0.2; const a = box(0.11, 0.11, 0.5, suit, x * 1.4, 1.5, 0.28, body); a.rotation.x = 0.6; });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat('#f4f4f4', { roughness: 0.35 })); helmet.position.set(0, 1.78, 0.22); body.add(helmet);
    box(0.3, 0.08, 0.05, P.glass, 0, 1.78, 0.4, body);
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8), P.chrome); e.rotation.x = Math.PI / 2 - 0.3; e.position.set(0.18, 0.7, -0.85); body.add(e);
    const head = mat('#fff6d8', { emissive: '#fff1c0', emissiveIntensity: 1.6 }), tail = mat('#ff2a3a', { emissive: '#ff1f2f', emissiveIntensity: 1.2 });
    box(0.2, 0.12, 0.06, head, 0, 1.0, 1.06, body); box(0.18, 0.08, 0.05, tail, 0, 1.02, -0.97, body);
    return [[0, 0.78, 0.36, 0.16], [0, -0.78, 0.36, 0.2]];
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
  const len = { hatch: 4.2, muscle: 5.4, pickup: 5.4, van: 5.4, monster: 5.6, buggy: 3.8, bike: 2.4 }[model] || 5, bw = { monster: 3.6, bike: 0.9, trail: 2.9 }[model] || 2.6;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(bw, len), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
  g.userData = { body, wheels, paint, model, lean: model === 'bike' ? 0.42 : 0 };
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
    if (this.boosting && !this.infBoost) this.boost = Math.max(0, this.boost - dt * 0.33); else if (this.infBoost) this.boost = 1; else this.boost = Math.min(1, this.boost + dt * 0.05);
    const st = this.stats || MODELS[0], pen = off ? (st.off ?? 1) : 0, top = (this.boosting ? this.maxSpeed * 1.28 : this.maxSpeed) * st.top * (1 - 0.45 * pen);
    let a = 0;
    if (inp.throttle > 0) { const k = 1 - Math.max(0, vF) / top; a += inp.throttle * this.accel * st.accel * (this.boosting ? 1.6 : 1) * Math.max(-0.5, k); }
    if (inp.brake > 0) { if (vF > 1) a -= inp.brake * 34; else a -= inp.brake * 10 * (vF > -12 ? 1 : 0); }
    if (inp.handbrake) a -= Math.sign(vF) * 6;
    vF += a * dt;
    vF -= vF * (0.12 + 0.78 * pen) * dt; // drag (off-road models barely notice grass and dirt)
    if (!inp.throttle && !inp.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3 * dt);
    // lateral grip
    const grip = (inp.handbrake ? 1.6 : 9) * st.grip * surfaceGrip * (1 - 0.3 * pen);
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
    const m = this.mesh; m.position.set(this.x, this.y || 0, this.z); if (m.rotation.order !== 'YXZ') m.rotation.order = 'YXZ'; const ln = m.userData.lean ? -this.steer * Math.min(1, Math.abs(vF) / 18) * m.userData.lean : 0; this.lean = (this.lean || 0) + (ln - (this.lean || 0)) * Math.min(1, dt * 8); m.rotation.set(this.pitch || 0, this.yaw, (this.roll || 0) + this.lean);
    const { body, wheels } = m.userData;
    body.rotation.z += ((-vR * 0.02 - this.steer * Math.min(1, Math.abs(vF) / 30) * 0.05) - body.rotation.z) * Math.min(1, dt * 6);
    body.rotation.x += ((-this.prevAccel * 0.0025) - body.rotation.x) * Math.min(1, dt * 5);
    this.wheelSpin += vF * dt / 0.42;
    wheels.forEach(w => { w.spin.rotation.x = this.wheelSpin * 0.42 / (w.r || 0.42); if (w.front) w.pivot.rotation.y = this.steer * 0.45; });
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
