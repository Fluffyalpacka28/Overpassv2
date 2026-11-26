import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The Federation's ground unit: the THRUST X-9 twin-turbine land-speed jet car, rebuilt from the player's design
// (same shapes and sizes; the metals are a touch less mirror-like so it reads in daylight without a studio reflection map), with a billboard pilot in the seat. Nose is +Z, wheels touch y = 0.
// Static parts are merged per material so each car is only a handful of draw calls; wheels, fans, plumes and the
// pilot stay separate so they can move.

function hullTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#4a4a4a'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  x.fillStyle = '#a8a8a8'; for (let a = 4; a < 256; a += 32) for (let b = 4; b < 256; b += 32) { x.fillRect(a, b, 2, 2); x.fillRect(a + 24, b, 2, 2); x.fillRect(a, b + 24, 2, 2); x.fillRect(a + 24, b + 24, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}
// the pilot: a flat picture that always turns to face you (Federation flight suit, amber visor)
function pilotTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d');
  // shoulders + suit
  x.fillStyle = '#1f2c3d'; x.beginPath(); x.moveTo(14, 160); x.quadraticCurveTo(16, 104, 64, 100); x.quadraticCurveTo(112, 104, 114, 160); x.fill();
  x.fillStyle = '#f59e0b'; x.fillRect(58, 108, 12, 52);                                   // amber chest stripe
  x.fillStyle = '#38bdf8'; x.beginPath(); x.arc(40, 126, 7, 0, 7); x.fill();              // shoulder badge
  // neck + helmet
  x.fillStyle = '#121a24'; x.fillRect(52, 88, 24, 16);
  const g = x.createRadialGradient(54, 40, 6, 64, 54, 44); g.addColorStop(0, '#5a6b80'); g.addColorStop(1, '#1b2533');
  x.fillStyle = g; x.beginPath(); x.ellipse(64, 54, 36, 40, 0, 0, 7); x.fill();
  const v = x.createLinearGradient(0, 44, 0, 78); v.addColorStop(0, '#ffd27a'); v.addColorStop(1, '#c46a06');
  x.fillStyle = v; x.beginPath(); x.ellipse(64, 62, 28, 15, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(52, 56, 9, 3.5, -0.3, 0, 7); x.fill();
  x.strokeStyle = '#f59e0b'; x.lineWidth = 4; x.beginPath(); x.arc(64, 54, 37, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); // helmet stripe
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let TEMPLATE = null;
function buildTemplate() {
  const bump = hullTexture();
  const matHull = new THREE.MeshStandardMaterial({ color: 0x243447, roughness: 0.42, metalness: 0.35, bumpMap: bump, bumpScale: 0.012 });
  const matArmor = new THREE.MeshStandardMaterial({ color: 0x34465c, roughness: 0.48, metalness: 0.3, bumpMap: bump, bumpScale: 0.008 });
  const matAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.32, metalness: 0.25 });
  const matTi = new THREE.MeshStandardMaterial({ color: 0xa9b6c8, roughness: 0.3, metalness: 0.55 });
  const matCarbon = new THREE.MeshStandardMaterial({ color: 0x0b1017, roughness: 0.55, metalness: 0.35 });
  const matWheel = new THREE.MeshStandardMaterial({ color: 0x8291a8, roughness: 0.3, metalness: 0.55 });
  // see-through tinted canopy (the original's refractive glass costs a whole extra render pass, too much for a headset)
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x062840, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false });
  const matCore = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 2.4, roughness: 0.2, metalness: 0.1 });
  const matHead = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 2.8, roughness: 0.1 });
  const matTail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1e1e, emissiveIntensity: 2.2 });
  const matHud = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
  const matArmor2 = matArmor.clone(); matArmor2.side = THREE.DoubleSide;
  const matHull2 = matHull.clone(); matHull2.side = THREE.DoubleSide;

  const root = new THREE.Group(); root.name = 'Thrust_X9_Federation';
  const add = (geo, mat, p, r, s, parent = root) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // 1. fuselage, nose, skirts, splitter, canards, lights, spine
  const body = new THREE.LatheGeometry([[0, -2.45], [0.26, -2.3], [0.5, -1.68], [0.61, -0.78], [0.62, 0.12], [0.55, 0.92], [0.41, 1.58], [0.23, 2.12], [0.08, 2.52], [0, 2.72]].map(([a, b]) => new THREE.Vector2(a, b)), 36);
  body.rotateX(Math.PI / 2); body.scale(1.18, 0.62, 1); add(body, matHull, [0, 0.48, 0]);
  add(new THREE.ConeGeometry(0.21, 0.68, 24), matCarbon, [0, 0.46, 2.38], [Math.PI / 2, 0, 0], [1.18, 1, 0.68]);
  add(new THREE.CylinderGeometry(0.008, 0.022, 0.36, 12), matTi, [0, 0.46, 2.86], [Math.PI / 2, 0, 0]);
  add(box(1.18, 0.08, 3.65), matCarbon, [0, 0.22, -0.1]);
  for (const s of [-1, 1]) {
    add(box(0.1, 0.16, 3.05), matArmor, [s * 0.64, 0.26, -0.1]); add(box(0.11, 0.045, 2.1), matAmber, [s * 0.645, 0.32, 0.1]);
    add(box(0.46, 0.035, 0.3), matArmor, [s * 0.58, 0.34, 1.82], [0.14, 0, s * -0.08]); add(box(0.03, 0.22, 0.4), matAmber, [s * 0.81, 0.31, 1.85]);
    add(box(0.24, 0.035, 0.06), matHead, [s * 0.36, 0.42, 1.86], [0, s * 0.28, 0]);
  }
  add(box(1.42, 0.04, 0.54), matCarbon, [0, 0.19, 2.02]);
  add(box(0.48, 0.18, 2.05), matArmor, [0, 0.78, -0.58]);
  // 2. cockpit, seat, HUD, canopy
  add(box(0.48, 0.2, 1.32), matCarbon, [0, 0.72, 0.56]); add(box(0.52, 0.04, 1.36), matArmor, [0, 0.82, 0.56]);
  const seat = new THREE.Group(); seat.position.set(0, 0.81, 0.38); root.add(seat);
  add(box(0.24, 0.05, 0.24), matCarbon, [0, 0.02, 0.06], null, null, seat); add(box(0.24, 0.21, 0.08), matArmor, [0, 0.105, -0.04], [-0.22, 0, 0], null, seat); add(box(0.15, 0.07, 0.085), matAmber, [0, 0.225, -0.075], [-0.22, 0, 0], null, seat);
  add(new THREE.PlaneGeometry(0.2, 0.1), matHud, [0, 0.94, 0.92], [-0.38, 0, 0]);
  const canopy = new THREE.Group(); canopy.position.set(0, 0.83, 1.28); root.add(canopy);
  const cg = new THREE.SphereGeometry(0.43, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52); cg.scale(0.75, 0.78, 1.72);
  const glass = add(cg, matGlass, [0, -0.01, -0.72], null, null, canopy); glass.renderOrder = 2; glass.userData.keep = true;
  add(new THREE.TorusGeometry(0.33, 0.022, 10, 24, Math.PI), matTi, [0, 0.01, -0.68], null, [0.95, 0.98, 1], canopy);
  // 3. twin turbojet pods
  const fans = [], plumes = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Group(); pod.position.set(s * 0.62, 0.74, -0.62); root.add(pod);
    add(box(0.38, 0.24, 1.38), matCarbon, [-s * 0.22, -0.14, 0.04], [0, 0, s * 0.35], null, pod);
    add(new THREE.CylinderGeometry(0.28, 0.3, 1.78, 28), matHull, [0, 0, 0], [Math.PI / 2, 0, 0], null, pod);
    add(box(0.26, 0.12, 1.48), matArmor, [0, 0.26, -0.04], null, null, pod);
    add(new THREE.TorusGeometry(0.275, 0.032, 12, 28), matTi, [0, 0, 0.89], null, null, pod);
    add(new THREE.CircleGeometry(0.26, 24), matCarbon, [0, 0, 0.8], null, null, pod);
    const fan = new THREE.Group(); fan.position.z = 0.84; pod.add(fan); fan.userData.keep = true; fan.userData.spin = -s;
    add(new THREE.ConeGeometry(0.085, 0.34, 18), matTi, [0, 0, 0.14], [Math.PI / 2, 0, 0], null, fan);
    for (let b = 0; b < 14; b++) { const a = b / 14 * Math.PI * 2; add(box(0.016, 0.18, 0.06), matTi, [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0], [0, 0.55, a], null, fan); }
    fans.push(fan);
    add(new THREE.CylinderGeometry(0.295, 0.235, 0.48, 24, 1, true), matTi, [0, 0, -1.1], [Math.PI / 2, 0, 0], null, pod);
    add(new THREE.CylinderGeometry(0.245, 0.195, 0.46, 24, 1, true), matCarbon, [0, 0, -1.1], [Math.PI / 2, 0, 0], null, pod);
    add(new THREE.TorusGeometry(0.29, 0.022, 10, 24), matAmber, [0, 0, -0.89], null, null, pod);
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.42, 18), matCore, [0, 0, -1.04], [Math.PI / 2, 0, 0], null, pod);
    const pl = add(new THREE.ConeGeometry(0.19, 1.35, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [0, 0, -1.85], [-Math.PI / 2, 0, 0], null, pod);
    pl.userData.keep = true; plumes.push(pl);
  }
  // 4. canted twin tails, airbrakes, bi-plane rear wing, diffuser, tail light
  const ext = (pts, depth, bev) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2 }); g.rotateY(Math.PI / 2); return g; };
  for (const s of [-1, 1]) {
    const vt = new THREE.Group(); vt.position.set(s * 0.42, 0.68, -0.95); vt.rotation.z = s * -0.22; root.add(vt);
    add(ext([[0, 0], [1.25, 0], [1.6, 0.96], [0.98, 0.96], [0.18, 0.1]], 0.06, 0.015), matArmor, [-0.03, 0, 0], null, null, vt);
    add(ext([[0.975, 0.955], [1.598, 0.955], [1.65, 1.1], [1.11, 1.1]], 0.062, 0.015), matAmber, [-0.031, 0, 0], null, null, vt);
    add(box(0.26, 0.03, 0.56), matAmber, [s * 0.22, 0.885, -1.4]);
    add(ext([[0, 0], [0.32, 0], [0.74, 0.93], [0.52, 0.93]], 0.038, 0.008), matTi, [s * 0.24 - 0.019, 0.65, -1.62]);
    add(box(0.08, 0.06, 0.42), matCarbon, [s * 0.24, 0.65, -1.78]); add(box(0.075, 0.06, 0.28), matAmber, [s * 0.24, 1.57, -2.25], [0.16, 0, 0]);
    add(box(0.035, 0.34, 0.46), matArmor, [s * 0.74, 1.5, -2.26]); add(box(0.16, 0.05, 0.26), matTi, [s * 0.66, 1.56, -2.24]);
  }
  add(box(1.48, 0.048, 0.36), matArmor, [0, 1.58, -2.26], [0.16, 0, 0]); add(box(1.32, 0.036, 0.22), matHull, [0, 1.4, -2.2], [0.12, 0, 0]); add(box(1.48, 0.036, 0.05), matAmber, [0, 1.615, -2.42]);
  add(box(1.24, 0.18, 0.4), matCarbon, [0, 0.26, -2.22]); add(box(0.76, 0.04, 0.05), matTail, [0, 0.42, -2.4]);
  // 5. billet wheels, fairings, sponsons
  const wheels = [];
  const wheel = (R, W) => {
    const g = new THREE.Group(); g.userData.keep = true; g.userData.R = R;
    add(new THREE.CylinderGeometry(R, R, W, 32), matWheel, null, [0, 0, Math.PI / 2], null, g);
    add(new THREE.CylinderGeometry(R + 0.004, R + 0.004, W * 0.38, 32), matCarbon, null, [0, 0, Math.PI / 2], null, g);
    add(new THREE.CylinderGeometry(R * 0.52, R * 0.52, W + 0.016, 20), matHull, null, [0, 0, Math.PI / 2], null, g);
    add(new THREE.CylinderGeometry(R * 0.22, R * 0.22, W + 0.028, 16), matAmber, null, [0, 0, Math.PI / 2], null, g);
    for (let k = 0; k < 6; k++) add(box(W + 0.022, 0.028, R * 0.78), matTi, null, [k / 6 * Math.PI * 2, 0, 0], null, g);
    return g;
  };
  for (const s of [-1, 1]) {
    const f = wheel(0.34, 0.18); f.position.set(s * 0.68, 0.34, 1.48); root.add(f); wheels.push(f);
    add(box(0.32, 0.07, 0.24), matTi, [s * 0.5, 0.34, 1.48]);
    add(new THREE.CylinderGeometry(0.39, 0.39, 0.23, 24, 1, false, -0.1, Math.PI + 0.2), matArmor2, [s * 0.68, 0.35, 1.48], [0, 0, Math.PI / 2]);
    const r = wheel(0.42, 0.24); r.position.set(s * 1.18, 0.42, -1.52); root.add(r); wheels.push(r);
    const sp = new THREE.Shape(); sp.moveTo(0, 0); sp.lineTo(s * 0.68, -0.58); sp.lineTo(s * 0.68, -1.12); sp.lineTo(0, -1.04); sp.closePath();
    const sg = new THREE.ExtrudeGeometry(sp, { depth: 0.11, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }); sg.rotateX(Math.PI / 2);
    add(sg, matArmor, [s * 0.48, 0.46, -0.68]);
    add(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 26, 1, false, -0.1, Math.PI + 0.2), matHull2, [s * 1.18, 0.43, -1.52], [0, 0, Math.PI / 2]);
    add(box(0.32, 0.04, 0.55), matAmber, [s * 1.18, 0.91, -1.52]);
  }
  // merge everything that never moves, per material
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh) return; let p = o, keep = false; while (p && p !== root) { if (p.userData.keep) { keep = true; break; } p = p.parent; } if (keep) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    (groups.get(o.material) || groups.set(o.material, []).get(o.material)).push(g); drop.push(o);
  });
  for (const o of drop) o.parent.remove(o);
  for (const [mat, list] of groups) { const g = mergeGeometries(list, false); if (g) root.add(new THREE.Mesh(g, mat)); }
  // the pilot
  const pilot = new THREE.Sprite(new THREE.SpriteMaterial({ map: pilotTexture(), transparent: true, alphaTest: 0.1 }));
  pilot.scale.set(0.4, 0.5, 1); pilot.position.set(0, 1.14, 0.42); pilot.userData.keep = true; pilot.renderOrder = 1; root.add(pilot);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  plumes.forEach(p => { p.castShadow = false; });
  return root;
}
// a fresh car: { obj, wheels, fans, plumes, core } (geometry and materials shared between all of them)
export function makeFedCar() {
  if (!TEMPLATE) TEMPLATE = buildTemplate();
  const obj = TEMPLATE.clone(true), wheels = [], fans = [], plumes = [];
  obj.traverse(o => { if (o.userData.R) wheels.push(o); if (o.userData.spin) fans.push(o); if (o.isMesh && o.material.blending === THREE.AdditiveBlending) plumes.push(o); });
  return { obj, wheels, fans, plumes };
}
// spin the wheels and fans and size the afterburner flames for this speed (m/s)
export function animateFedCar(c, sp, dt, throttle) {
  for (const w of c.wheels) w.rotation.x += sp / w.userData.R * dt;
  for (const f of c.fans) f.rotation.z += f.userData.spin * (4 + throttle * 32) * dt;
  for (const p of c.plumes) { p.visible = throttle > 0.05; const L = (0.35 + throttle * 1.35) * (0.92 + Math.sin(performance.now() / 28) * 0.08); p.scale.set(0.85 + throttle * 0.25, L, 0.85 + throttle * 0.25); p.position.z = -1.28 - 0.68 * L; }
}
