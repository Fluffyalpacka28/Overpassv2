import * as THREE from 'three';

// Interior cockpits, one per vehicle, matched to each car's look:
// dashboard, gauge cluster (live canvas), steering wheel/yoke/handlebars, seats, pillars and mirror.
// Coordinates are in the car's local frame (car faces +Z, driver sits on the +X side, left-hand drive).
// The steering wheel lives in `wheelBase`, whose local +Z axis is the steering axis pointing at the driver,
// so the VR code can work out hand angles around it.

export const COCKPITS = {
  coupe:    { eye: [0.4, 1.3, -0.45],  dash: { y: 1.0, z: 0.42, w: 1.62 }, wheel: { p: [0.4, 1.02, 0.08], R: 0.18, style: 'sport', tilt: 0.42 }, c: { dash: '#26262c', trim: '#ff5a3c', seat: '#2a2a30' }, gauge: 'analog', roof: 1.6 },
  hatch:    { eye: [0.38, 1.36, -0.3], dash: { y: 1.0, z: 0.5, w: 1.52 },  wheel: { p: [0.38, 1.04, 0.15], R: 0.17, style: 'sport', tilt: 0.45 }, c: { dash: '#1e2230', trim: '#3cb4ff', seat: '#23283a' }, gauge: 'digital', roof: 1.74 },
  muscle:   { eye: [0.42, 1.32, -0.55], dash: { y: 1.02, z: 0.3, w: 1.72 }, wheel: { p: [0.42, 1.03, -0.05], R: 0.2, style: 'retro', tilt: 0.3 }, c: { dash: '#1a1a1a', trim: '#d9dde4', seat: '#5b2a1c', wood: '#6b3b1f' }, gauge: 'retro', roof: 1.58 },
  roadster: { eye: [0.4, 1.25, -0.4],  dash: { y: 0.93, z: 0.15, w: 1.56 }, wheel: { p: [0.4, 0.95, -0.15], R: 0.17, style: 'retro', tilt: 0.35 }, c: { dash: '#5a3520', trim: '#d9dde4', seat: '#3b2a24', wood: '#7a4524' }, gauge: 'retro', roof: null },
  pickup:   { eye: [0.48, 1.98, 0.05], dash: { y: 1.62, z: 0.75, w: 1.82 }, wheel: { p: [0.48, 1.66, 0.4], R: 0.2, style: 'big', tilt: 0.55 }, c: { dash: '#2e3034', trim: '#9aa0a8', seat: '#3a3c40' }, gauge: 'analog', roof: 2.12 },
  rally:    { eye: [0.42, 1.62, -0.35], dash: { y: 1.28, z: 0.55, w: 1.62 }, wheel: { p: [0.42, 1.32, 0.2], R: 0.17, style: 'rally', tilt: 0.45 }, c: { dash: '#202226', trim: '#ffc531', seat: '#1b1d22' }, gauge: 'digital', roof: 1.88, cage: true },
  formula:  { eye: [0, 1.13, -0.2],    dash: { y: 0.82, z: 0.38, w: 0.62 }, wheel: { p: [0, 0.98, 0.12], R: 0.13, style: 'yoke', tilt: 0.15 }, c: { dash: '#14161b', trim: '#ff5a3c', seat: '#14161b' }, gauge: 'digital', roof: null, onWheel: true, single: true },
  trail:    { eye: [0.45, 2.28, -0.35], dash: { y: 1.92, z: 0.72, w: 1.76 }, wheel: { p: [0.45, 1.96, 0.35], R: 0.2, style: 'big', tilt: 0.5 }, c: { dash: '#2b2d2a', trim: '#c9a14a', seat: '#3a3a32' }, gauge: 'analog', roof: 2.58 },
  monster:  { eye: [0.45, 3.0, 0.0],   dash: { y: 2.62, z: 0.78, w: 1.86 }, wheel: { p: [0.45, 2.66, 0.42], R: 0.21, style: 'big', tilt: 0.5 }, c: { dash: '#262626', trim: '#2fd39a', seat: '#303030' }, gauge: 'analog', roof: 3.26 },
  buggy:    { eye: [0.3, 1.55, -0.35], dash: { y: 1.08, z: 0.55, w: 1.0 },  wheel: { p: [0.3, 1.18, 0.18], R: 0.15, style: 'rally', tilt: 0.4 }, c: { dash: '#22252c', trim: '#ff5a3c', seat: '#3b2a24' }, gauge: 'digital', roof: null },
  hyper:    { eye: [0.38, 1.15, -0.5], dash: { y: 0.92, z: 0.32, w: 1.72 }, wheel: { p: [0.38, 0.93, -0.05], R: 0.16, style: 'yoke', tilt: 0.3 }, c: { dash: '#111318', trim: '#7cf3ff', seat: '#1a1c22' }, gauge: 'digital', roof: 1.33, onWheel: true },
  van:      { eye: [0.48, 2.02, 1.2],  dash: { y: 1.55, z: 1.85, w: 1.86 }, wheel: { p: [0.48, 1.6, 1.5], R: 0.21, style: 'big', tilt: 0.7 }, c: { dash: '#303236', trim: '#ffc531', seat: '#2c2e33' }, gauge: 'analog', roof: 2.5 },
  bike:     { eye: [0, 1.65, -0.25],   dash: null, wheel: { p: [0, 1.2, 0.55], R: 0.32, style: 'bars' }, c: { dash: '#1d2029', trim: '#ff5a3c', seat: '#22252c' }, gauge: 'digital', roof: null, onWheel: true, single: true },
};
export const cockpitFor = id => COCKPITS[id] || COCKPITS.coupe;
// how far the wheel turns lock to lock (radians each way)
export const maxRot = cfg => cfg.wheel.style === 'bars' ? 0.55 : cfg.wheel.style === 'yoke' ? 1.4 : 2.4;

const mats = {};
function M(color, o = {}) { const k = color + JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o })); }
function box(parent, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
function tube(parent, a, b, r, mat) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); parent.add(m); return m; }

function buildWheel(cfg) {
  const W = cfg.wheel, R = W.R, trim = M(cfg.c.trim, { roughness: 0.5 }), grip = M('#18191d', { roughness: 0.95 }), metal = M('#c9ced8', { metalness: 0.8, roughness: 0.3 });
  const base = new THREE.Group(), wheel = new THREE.Group(); base.add(wheel);
  base.position.set(...W.p); base.rotation.order = 'YXZ';
  if (W.style === 'bars') base.rotation.set(-Math.PI / 2, Math.PI, 0); else base.rotation.set(-(W.tilt || 0.4), Math.PI, 0);
  const torus = (r, t, mat) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 40), mat); wheel.add(m); return m; };
  const spoke = (ang, len, w, t, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, t), mat); m.position.set(Math.cos(ang) * len / 2, Math.sin(ang) * len / 2, 0); m.rotation.z = ang; wheel.add(m); };
  const hub = (r, mat) => { const g = new THREE.CylinderGeometry(r, r, 0.06, 20); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, mat); wheel.add(m); return m; };
  if (W.style === 'sport' || W.style === 'rally' || W.style === 'big') {
    const t = W.style === 'big' ? 0.03 : 0.026; torus(R, t, grip);
    [0, Math.PI, -Math.PI / 2].forEach(a => spoke(a, R, W.style === 'big' ? 0.06 : 0.05, 0.02, M('#2a2c32', { metalness: 0.4, roughness: 0.4 })));
    hub(R * 0.33, M('#2a2c32', { metalness: 0.4 })); const cap = hub(R * 0.16, trim); cap.position.z = 0.012;
    if (W.style !== 'big') box(wheel, 0.03, 0.05, 0.06, trim, 0, R, 0); // 12 o'clock marker
    if (W.style === 'sport') { box(wheel, 0.05, 0.035, 0.03, M('#d9dde4', { metalness: 0.7 }), R * 0.62, 0.05, 0.02); box(wheel, 0.05, 0.035, 0.03, M('#d9dde4', { metalness: 0.7 }), -R * 0.62, 0.05, 0.02); } // paddles/buttons
  } else if (W.style === 'retro') {
    torus(R, 0.016, M(cfg.c.wood || '#6b3b1f', { roughness: 0.45 }));
    [0, Math.PI, -Math.PI / 2, Math.PI / 2].forEach(a => spoke(a, R, 0.014, 0.008, metal));
    hub(R * 0.22, metal); const cap = hub(R * 0.12, trim); cap.position.z = 0.012;
  } else if (W.style === 'yoke') {
    // flat-top yoke: two grips + bottom bar + screen hub
    [-1, 1].forEach(s => { const g = box(wheel, 0.045, R * 1.3, 0.05, grip, s * R, -R * 0.05, 0); g.rotation.z = -s * 0.08; box(wheel, R * 0.55, 0.035, 0.03, M('#2a2c32', { metalness: 0.5 }), s * R * 0.62, 0.0, 0); });
    box(wheel, R * 2, 0.04, 0.045, grip, 0, -R * 0.68, 0);
    box(wheel, R * 0.95, R * 0.6, 0.05, M('#1a1c22', { metalness: 0.4 }), 0, 0.0, 0);
    [-1, 1].forEach(s => box(wheel, 0.025, 0.025, 0.02, trim, s * R * 0.75, R * 0.45, 0.02));
  } else if (W.style === 'bars') {
    // handlebars (local X = rider's right, Y = forward, Z = up)
    const g = new THREE.CylinderGeometry(0.016, 0.016, R * 2, 10); g.rotateZ(Math.PI / 2); wheel.add(new THREE.Mesh(g, metal));
    [-1, 1].forEach(s => { const gg = new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10); gg.rotateZ(Math.PI / 2); const m = new THREE.Mesh(gg, grip); m.position.x = s * (R - 0.06); wheel.add(m); box(wheel, 0.12, 0.012, 0.012, metal, s * (R - 0.1), 0.06, 0.01); }); // grips + levers
    box(wheel, 0.18, 0.06, 0.05, M('#2a2c32', { metalness: 0.6 }), 0, 0.0, -0.02);
    [-1, 1].forEach(s => { const m = box(wheel, 0.09, 0.05, 0.05, M('#2a2c32'), s * 0.15, 0.05, 0.06); m.rotation.z = s * 0.4; }); // mirrors stems
  }
  // steering column into the dash
  if (W.style !== 'bars') { const g = new THREE.CylinderGeometry(0.035, 0.045, 0.32, 10); g.rotateX(Math.PI / 2); const col = new THREE.Mesh(g, M('#1d1f24')); col.position.z = -0.18; base.add(col); }
  return { base, wheel };
}

function dashGeometry(w, depth = 0.55, h = 0.3) {
  // dash profile in (z, y): rounded top pad that slopes toward the windshield
  const s = new THREE.Shape(); s.moveTo(-0.12, -h); s.lineTo(depth, -h); s.lineTo(depth, 0.0); s.quadraticCurveTo(depth * 0.5, 0.06, 0.05, 0.05); s.quadraticCurveTo(-0.12, 0.03, -0.14, -0.1); s.lineTo(-0.12, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2); return g;
}

// small printed label (canvas text on a plane, facing +z)
const labels = {};
function label(text, w, h, color = '#e8ecf2') {
  const key = text + color; let mat = labels[key];
  if (!mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w); const x = c.getContext('2d');
    x.fillStyle = color; x.font = `bold ${Math.round(c.height * 0.72)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    mat = labels[key] = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false });
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
// an aircraft-style toggle: plate, guard collar, a chrome bat lever that flicks about local x (+z side = on), an LED and a label.
// Built facing +y; the lever tip is what a VR hand flicks.
export const SW_ANG = 0.55;
function toggleSwitch(text, ledColor) {
  const root = new THREE.Group(), chrome = M('#d4d9e0', { metalness: 0.9, roughness: 0.25 });
  box(root, 0.05, 0.008, 0.07, M('#1a1c21', { roughness: 0.5, metalness: 0.3 }), 0, 0.004, 0);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.012, 14), chrome); collar.position.y = 0.012; root.add(collar);
  const pivot = new THREE.Group(); pivot.position.y = 0.014; root.add(pivot);
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0065, 0.042, 10), chrome); bat.position.y = 0.021; pivot.add(bat);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), chrome); tip.position.y = 0.043; pivot.add(tip);
  const ledOff = new THREE.Color('#2a2c30'), ledOn = new THREE.Color(ledColor);
  const ledMat = new THREE.MeshBasicMaterial({ color: ledOff.clone(), toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), ledMat); led.position.set(0, 0.009, 0.027); led.scale.y = 0.6; root.add(led);
  const lb = label(text, 0.06, 0.016); lb.position.set(0, 0.0095, -0.026); lb.rotation.set(-Math.PI / 2, 0, Math.PI); root.add(lb);
  return { root, pivot, tip, ledMat, ledOn, ledOff };
}
// a square, lit push-button (same detection as a switch: the hand touching 'tip' presses it). Built facing +y.
function pushButton(text, ledColor) {
  const root = new THREE.Group();
  box(root, 0.06, 0.012, 0.075, M('#1a1c21', { roughness: 0.5, metalness: 0.3 }), 0, 0.006, 0);
  box(root, 0.05, 0.008, 0.05, M('#0d0e11'), 0, 0.014, 0.008);                                  // bezel
  const pivot = new THREE.Group(); pivot.position.set(0, 0.016, 0.008); root.add(pivot);
  const ledOff = new THREE.Color('#3a3d44'), ledOn = new THREE.Color(ledColor), ledMat = new THREE.MeshBasicMaterial({ color: ledOff.clone(), toneMapped: false });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.038), ledMat); cap.position.y = 0.007; pivot.add(cap);
  const tip = new THREE.Object3D(); tip.position.y = 0.016; pivot.add(tip);
  const lb = label(text, 0.06, 0.016); lb.position.set(0, 0.0125, -0.028); lb.rotation.set(-Math.PI / 2, 0, Math.PI); root.add(lb);
  return { root, pivot, tip, ledMat, ledOn, ledOff, push: true };
}
// a flight stick (joystick) for VR: grab the grip and pull back to climb, push forward to dive. Built standing on +y.
function flightStick() {
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.05, 0.07, 14), M('#16181c', { roughness: 0.95 })); boot.position.y = 0.035; root.add(boot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 6, 20), M('#c9ced8', { metalness: 0.85, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.004; root.add(ring);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.2, 12), M('#c9ced8', { metalness: 0.85, roughness: 0.3 })); shaft.position.y = 0.1; pivot.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.12, 14), M('#1b1d22', { roughness: 0.8 })); grip.position.set(0, 0.25, 0.006); grip.rotation.x = 0.12; pivot.add(grip);
  const capT = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#1b1d22', { roughness: 0.8 })); capT.position.set(0, 0.31, 0.013); pivot.add(capT);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), M('#d21f26', { roughness: 0.3, emissive: '#400' })); hat.position.set(0, 0.333, 0.016); pivot.add(hat);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), M('#2b2e35')); trig.position.set(0, 0.27, 0.032); pivot.add(trig);
  const top = new THREE.Object3D(); top.position.set(0, 0.27, 0); pivot.add(top);
  root.userData.cockpit = true; return { root, pivot, top, tilt: 0 };
}
// ease the levers and LEDs toward the game state. states: { id: 0 | 0.5 (dim, e.g. auto lights) | 1 }; flash: { id: seconds } blinks red (refused)
export function updateSwitches(ck, states, dt, flash) {
  if (!ck || !ck.switches) return;
  for (const s of ck.switches) {
    const v = states[s.id] || 0, want = v > 0 ? SW_ANG : -SW_ANG, k = 1 - Math.exp(-dt * 22);
    if (s.push) { s.press = Math.max(0, (s.press || 0) - dt); s.pivot.position.y = 0.016 - (s.press > 0 ? 0.006 : 0); }
    else { s.ang += (want - s.ang) * k; s.pivot.rotation.x = s.ang; }
    const fl = flash && flash[s.id] > 0;
    if (fl) s.ledMat.color.set(Math.floor(flash[s.id] * 8) % 2 ? '#ff2a2a' : '#300'); else s.ledMat.color.copy(s.ledOff).lerp(s.ledOn, v >= 1 ? 1 : v > 0 ? 0.45 : 0);
  }
}
export function buildCockpit(modelId, miniCanvas) {
  const cfg = cockpitFor(modelId), group = new THREE.Group(); group.name = 'cockpit';
  const [ex, ey, ez] = cfg.eye, dashM = M(cfg.c.dash, { roughness: 0.85 }), trim = M(cfg.c.trim, { roughness: 0.45, metalness: 0.3 }), seatM = M(cfg.c.seat, { roughness: 0.9 });
  const dx = cfg.wheel.p[0];
  // ---- gauge cluster ----
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gaugeMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const { base, wheel } = buildWheel(cfg); group.add(base);
  if (cfg.dash) {
    const D = cfg.dash, dash = new THREE.Mesh(dashGeometry(D.w), dashM); dash.position.set(0, D.y, D.z); group.add(dash);
    box(group, D.w * 0.98, 0.025, 0.02, trim, 0, D.y - 0.06, D.z - 0.135); // trim strip across the dash face
    if (cfg.c.wood) box(group, D.w * 0.9, 0.09, 0.02, M(cfg.c.wood, { roughness: 0.4 }), 0, D.y - 0.12, D.z - 0.13);
    if (!cfg.onWheel) {
      // binnacle + cluster in front of the driver
      const hood = box(group, 0.5, 0.03, 0.2, dashM, dx, D.y + 0.13, D.z - 0.05); hood.rotation.x = 0.12;
      [-1, 1].forEach(s => box(group, 0.03, 0.13, 0.18, dashM, dx + s * 0.25, D.y + 0.07, D.z - 0.05));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), gaugeMat); p.position.set(dx, D.y + 0.055, D.z - 0.11); p.rotation.order = 'YXZ'; p.rotation.set(-0.25, Math.PI, 0); group.add(p);
    } else {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(cfg.wheel.style === 'bars' ? 0.2 : 0.16, cfg.wheel.style === 'bars' ? 0.1 : 0.08), gaugeMat);
      if (cfg.wheel.style === 'bars') { p.position.set(0, 0.1, 0.07); p.rotation.x = 0.9; } else p.position.set(0, 0, 0.027);
      wheel.add(p);
    }
    // center screen showing the live minimap
    if (!cfg.single && miniCanvas) {
      const mt = new THREE.CanvasTexture(miniCanvas); mt.colorSpace = THREE.SRGBColorSpace;
      box(group, 0.3, 0.24, 0.03, M('#0c0d10', { roughness: 0.3 }), 0, D.y - 0.02, D.z - 0.11).rotation.x = 0.25;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: mt, toneMapped: false, transparent: true })); s.position.set(0, D.y - 0.02, D.z - 0.128); s.rotation.order = 'YXZ'; s.rotation.set(-0.25, Math.PI, 0); group.add(s); group.userData.miniTex = mt;
      // vents
      [-1, 1].forEach(sg => box(group, 0.12, 0.05, 0.02, M('#0e0f12'), sg * (D.w / 2 - 0.2), D.y - 0.05, D.z - 0.135));
    }
  } else {
    // motorcycle: display on the bars; fuel tank top is the bike body itself
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), gaugeMat); p.position.set(0, 0.1, 0.07); p.rotation.x = 0.9; wheel.add(p);
  }
  // ---- seats, console, shifter (swapped for a flight stick when the car can fly) ----
  let shifter = null, stick = null;
  if (!cfg.single && cfg.wheel.style !== 'bars') {
    [dx, -dx].forEach(x => { box(group, 0.5, 0.12, 0.5, seatM, x, ey - 0.8, ez + 0.05); const b = box(group, 0.5, 0.72, 0.12, seatM, x, ey - 0.38, ez - 0.3); b.rotation.x = -0.12; box(group, 0.3, 0.18, 0.1, seatM, x, ey + 0.05, ez - 0.36); box(group, 0.08, 0.6, 0.02, trim, x, ey - 0.38, ez - 0.235).rotation.x = -0.12; });
    box(group, 0.22, 0.22, 0.75, dashM, 0, ey - 0.78, ez + 0.42);
    shifter = new THREE.Group(); group.add(shifter);
    tube(shifter, [0, ey - 0.66, ez + 0.45], [0, ey - 0.5, ez + 0.42], 0.012, M('#c9ced8', { metalness: 0.8 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), M('#111')); knob.position.set(0, ey - 0.49, ez + 0.42); shifter.add(knob);
    stick = flightStick(); stick.root.position.set(0, ey - 0.668, ez + 0.45); stick.root.visible = false; group.add(stick.root);
    // door cards with an armrest so the side isn't empty
    if (cfg.dash) [-1, 1].forEach(s => { const x = s * (cfg.dash.w / 2 - 0.02); box(group, 0.04, 0.42, 1.1, dashM, x, ey - 0.62, ez + 0.3); box(group, 0.1, 0.05, 0.5, seatM, x - s * 0.05, ey - 0.42, ez + 0.2); box(group, 0.012, 0.02, 0.9, trim, x - s * 0.02, ey - 0.32, ez + 0.3); });
  } else if (cfg.wheel.style !== 'bars') {
    // single-seat formula tub sides
    [-1, 1].forEach(s => box(group, 0.05, 0.22, 0.9, dashM, s * 0.3, ey - 0.25, ez + 0.3));
    stick = flightStick(); stick.root.position.set(0.3, ey - 0.136, ez + 0.68); stick.root.scale.setScalar(0.8); stick.root.visible = false; group.add(stick.root);
  }
  // ---- pillars, roof header, mirror ----
  if (cfg.roof && cfg.dash) {
    const D = cfg.dash, w = D.w / 2, top = cfg.roof - 0.04, pz = ez + 0.25;
    [-1, 1].forEach(s => tube(group, [s * w * 0.96, D.y + 0.02, D.z + 0.3], [s * w * 0.86, top, pz], 0.035, dashM));
    box(group, D.w * 0.86, 0.06, 0.12, dashM, 0, top, pz);
    box(group, 0.26, 0.08, 0.025, M('#1a1c22'), 0, top - 0.1, pz + 0.06);
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.065), new THREE.MeshBasicMaterial({ color: '#9fb6cc' })); mir.position.set(0, top - 0.1, pz + 0.045); mir.rotation.y = Math.PI; group.add(mir);
    box(group, D.w * 0.86, 0.02, Math.max(0.3, D.z - pz), M('#3a3c42', { roughness: 0.95 }), 0, top + 0.02, (pz + D.z) / 2); // headliner strip
  }
  if (cfg.cage) { const m = M(cfg.c.trim, { metalness: 0.5, roughness: 0.4 }); [-1, 1].forEach(s => { tube(group, [s * 0.75, ey - 0.75, ez - 0.45], [s * 0.7, cfg.roof - 0.06, ez - 0.45], 0.025, m); tube(group, [s * 0.7, cfg.roof - 0.06, ez - 0.45], [s * 0.72, cfg.dash.y, cfg.dash.z + 0.2], 0.025, m); }); tube(group, [-0.7, cfg.roof - 0.06, ez - 0.45], [0.7, cfg.roof - 0.06, ez - 0.45], 0.025, m); tube(group, [-0.75, ey - 0.75, ez - 0.45], [0.7, cfg.roof - 0.06, ez - 0.45], 0.022, m); }
  // ---- big red FIRE button (shown when the car has a weapon; smack it with a VR hand) ----
  // In two-seaters it sits on a little angled pod right under the map screen, where the driver and the passenger can both reach it.
  const fireBtn = new THREE.Group(), D0 = cfg.dash, single = Math.abs(ex) < 0.05 || cfg.single, onDash = !!(D0 && !single);
  { const cyl = (r1, r2, h, c, y, o = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 24), M(c, o)); m.position.y = y; fireBtn.add(m); return m; };
    cyl(0.085, 0.095, 0.055, '#f2c200', 0.0275, { roughness: 0.5 });                       // yellow housing
    for (let k = 0; k < 6; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.056, 0.012), M('#151515')); const a = k / 6 * Math.PI * 2; st.position.set(Math.cos(a) * 0.09, 0.028, Math.sin(a) * 0.09); st.rotation.y = -a; fireBtn.add(st); } // hazard stripes
    cyl(0.068, 0.068, 0.016, '#111111', 0.062);                                            // black bezel
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#e0141b', { roughness: 0.25, emissive: '#5a0000' })); cap.scale.y = 0.72; cap.position.y = 0.068; fireBtn.add(cap);
    if (onDash) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.25), dashM); pl.position.y = -0.02; fireBtn.add(pl); const lb = label('FIRE', 0.1, 0.03, '#ffd23a'); lb.position.set(0, 0.002, -0.112); lb.rotation.set(-Math.PI / 2, 0, Math.PI); fireBtn.add(lb); }
    else { const ped = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), dashM); ped.position.y = -0.15; fireBtn.add(ped); }
    fireBtn.userData = { cap, capY: 0.068, cockpit: true };
    if (!D0) fireBtn.position.set(0, cfg.wheel.p[1] - 0.22, cfg.wheel.p[2] - 0.32);          // bike: on the tank
    else if (single) fireBtn.position.set(0.24, ey - 0.6, ez + 0.5);                        // single seat: by your right knee
    else { fireBtn.position.set(0, D0.y - 0.235, D0.z - 0.27); fireBtn.rotation.x = -0.95;   // under the map screen, tipped toward you
      box(group, 0.2, 0.09, 0.2, dashM, 0, D0.y - 0.26, D0.z - 0.19); }                    // the pod's neck into the dash
    fireBtn.visible = false; group.add(fireBtn); }
  // ---- flick switches: FLIGHT on both sides of the map screen, plus LIGHTS / AUTO / BOOST2 on the console ----
  const switches = [], mount = (x, y, z, rx, ry = 0) => { const m = new THREE.Group(); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); group.add(m); return m; };
  const addSw = (m, id, text, x, z, led) => { const sw = toggleSwitch(text, led); sw.root.position.set(x, 0, z); m.add(sw.root); switches.push({ id, ...sw, on: 0, ang: -SW_ANG, seat: x }); };
  const addBtn = (m, id, text, x, z, led) => { const sw = pushButton(text, led); sw.root.position.set(x, 0, z); m.add(sw.root); switches.push({ id, ...sw, on: 0, ang: 0, seat: x }); };
  if (onDash) {
    const D = D0, pass = mount(-0.235, D.y - 0.13, D.z - 0.147, -Math.PI / 2), drv = mount(0.235, D.y - 0.13, D.z - 0.147, -Math.PI / 2);
    for (const m of [pass, drv]) box(m, 0.075, 0.006, 0.11, M('#111317', { roughness: 0.4 }), 0, 0, 0);
    addSw(pass, 'flight', 'FLIGHT', 0, 0, '#45e0ff'); addSw(drv, 'flight', 'FLIGHT', 0, 0, '#45e0ff');
    // WINGS push-buttons just below the FLIGHT switches (extend / retract)
    const pw = mount(-0.235, D.y - 0.245, D.z - 0.147, -Math.PI / 2), dw = mount(0.235, D.y - 0.245, D.z - 0.147, -Math.PI / 2);
    addBtn(pw, 'wings', 'WINGS', 0, 0, '#ffd23a'); addBtn(dw, 'wings', 'WINGS', 0, 0, '#ffd23a');
    if (cfg.wheel.style !== 'bars') { // console panel just behind the gear lever
      const c = mount(0, ey - 0.666, ez + 0.2, -0.12); box(c, 0.335, 0.006, 0.12, M('#111317', { roughness: 0.4 }), 0, 0, 0);
      addSw(c, 'auto', 'AUTO', -0.13, 0, '#3cff7a'); addSw(c, 'lights', 'LIGHTS', -0.068, 0, '#ffc531'); addSw(c, 'boost2', 'BOOST 2', -0.006, 0, '#4db4ff'); addSw(c, 'float', 'FLOATS', 0.056, 0, '#ff5a4a'); addBtn(c, 'roll', 'ROLL', 0.124, 0, '#c86bff');
    }
  } else if (D0) { // single-seat formula tub: on top of the right side pod, by your hand
    const m = mount(0.3, ey - 0.135, ez + 0.32, 0); box(m, 0.07, 0.006, 0.5, M('#111317', { roughness: 0.4 }), 0, 0, -0.05); addBtn(m, 'roll', 'ROLL', 0, -0.24, '#c86bff');
    addBtn(m, 'wings', 'WINGS', 0, 0.14, '#ffd23a'); addSw(m, 'flight', 'FLIGHT', 0, 0.05, '#45e0ff'); addSw(m, 'lights', 'LIGHTS', 0, -0.045, '#ffc531'); addSw(m, 'float', 'FLOATS', 0, -0.14, '#ff5a4a');
  } else { // bike: a little switch block on the tank, beside the button
    const m = mount(0.15, cfg.wheel.p[1] - 0.2, cfg.wheel.p[2] - 0.3, -0.35); box(m, 0.2, 0.006, 0.1, M('#111317', { roughness: 0.4 }), 0, 0, 0);
    addSw(m, 'flight', 'FLIGHT', -0.064, 0, '#45e0ff'); addSw(m, 'float', 'FLOATS', 0, 0, '#ff5a4a'); addBtn(m, 'roll', 'ROLL', 0.066, 0, '#c86bff');
  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, base, wheel, cfg, canvas, tex, model: modelId, maxRot: maxRot(cfg), eye: new THREE.Vector3(...cfg.eye), fireBtn, switches, stick, shifter };
}

// ---- gauge drawing ----
function dial(x, cx, cy, r, v, max, label, face, ink, accent, ticks = 8) {
  x.save(); x.fillStyle = face; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.strokeStyle = accent; x.lineWidth = 3; x.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, k = Math.max(0, Math.min(1, v / max));
  x.strokeStyle = ink; for (let i = 0; i <= ticks * 2; i++) { const a = a0 + (a1 - a0) * i / (ticks * 2), big = i % 2 === 0; x.lineWidth = big ? 3 : 1.5; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); x.lineTo(cx + Math.cos(a) * r * (big ? 0.72 : 0.78), cy + Math.sin(a) * r * (big ? 0.72 : 0.78)); x.stroke();
    if (big) { x.fillStyle = ink; x.font = `600 ${Math.round(r * 0.14)}px Chakra Petch, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(Math.round(max * i / (ticks * 2)), cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58); } }
  x.strokeStyle = accent; x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, r * 0.93, a0, a0 + (a1 - a0) * k); x.stroke();
  const a = a0 + (a1 - a0) * k; x.strokeStyle = '#ff3b2f'; x.lineWidth = 4; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); x.stroke();
  x.fillStyle = ink; x.beginPath(); x.arc(cx, cy, r * 0.08, 0, 7); x.fill();
  x.font = `700 ${Math.round(r * 0.13)}px Satoshi, Arial`; x.fillText(label, cx, cy + r * 0.45); x.restore();
}
export function drawGauges(ck, st) {
  const x = ck.canvas.getContext('2d'), w = 512, h = 256, cfg = ck.cfg, acc = cfg.c.trim, style = cfg.gauge;
  const max = st.unit === 'mph' ? 180 : 280;
  if (style === 'retro') {
    x.fillStyle = '#16120e'; x.fillRect(0, 0, w, h);
    dial(x, 130, 118, 108, st.speed, max, st.unit.toUpperCase(), '#efe6cf', '#1b1712', '#b8935a');
    dial(x, 382, 118, 108, st.boost * 100, 100, st.inf ? 'NOS ∞' : 'NOS %', '#efe6cf', '#1b1712', st.boosting ? '#ff8a3c' : '#b8935a', 5);
    x.fillStyle = '#efe6cf'; x.font = '700 30px Chakra Petch, monospace'; x.textAlign = 'center'; x.fillText(String(st.speed), 130, 196);
  } else if (style === 'analog') {
    x.fillStyle = '#07080b'; x.fillRect(0, 0, w, h);
    dial(x, 128, 128, 116, st.speed, max, st.unit, '#101218', '#e8ecf2', acc);
    x.fillStyle = '#fff'; x.font = '700 38px Chakra Petch, monospace'; x.textAlign = 'center'; x.fillText(String(st.speed), 128, 205);
  } else {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05070c'); g.addColorStop(1, '#0c1220'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const k = Math.min(1, st.speed / max); for (let i = 0; i < 24; i++) { x.fillStyle = i / 24 < k ? (i > 19 ? '#ff3b2f' : acc) : 'rgba(255,255,255,.08)'; x.fillRect(16 + i * 10, 22 + (24 - i) * 1.2, 7, 26 - (24 - i) * 1.2); }
    x.fillStyle = '#fff'; x.font = '800 110px Chakra Petch, monospace'; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText(String(st.speed), 16, 170);
    x.fillStyle = acc; x.font = '700 24px Satoshi, Arial'; x.fillText(st.unit, 20, 204);
  }
  // right-hand info panel (all styles except retro, which uses its own second dial)
  x.textBaseline = 'middle';
  if (style !== 'retro') {
    const L = 268; x.textAlign = 'left';
    x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '700 18px Satoshi, Arial'; x.fillText(st.inf ? 'NITROUS  ∞' : 'NITROUS', L, 30);
    x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(L, 44, 228, 14); x.fillStyle = st.inf ? '#b06cff' : st.boosting ? '#fff1c2' : acc; x.fillRect(L, 44, 228 * st.boost, 14);
    x.fillStyle = '#fff'; x.font = '700 30px Chakra Petch, monospace'; x.fillText(st.line1 || '', L, 92, 236);
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '600 20px Satoshi, Arial'; x.fillText(st.line2 || '', L, 128, 236);
  }
  // fuel / battery bar
  if (st.fuel != null) {
    const L = style === 'retro' ? 196 : 268, Y = style === 'retro' ? 14 : 168, W2 = style === 'retro' ? 120 : 228, inf = st.fuel < 0, f = inf ? 1 : st.fuel;
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = style === 'retro' ? '#efe6cf' : 'rgba(255,255,255,.55)'; x.font = '700 16px Satoshi, Arial';
    x.fillText((st.electric ? 'BATT' : 'FUEL') + (inf ? '  ∞' : ''), L, Y);
    x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(L, Y + 10, W2, 10); x.fillStyle = inf ? '#7cf3ff' : f < 0.2 ? '#ff3b2f' : '#4fd18b'; x.fillRect(L, Y + 10, W2 * f, 10);
  }
  if (st.msg) { x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(0, h - 58, w, 58); x.fillStyle = st.msgColor || '#ffcf5a'; x.font = '800 30px Chakra Petch, monospace'; x.textAlign = 'center'; x.fillText(st.msg, w / 2, h - 29, w - 20); }
  else if (style === 'retro' && st.line1) { x.fillStyle = '#efe6cf'; x.font = '700 22px Chakra Petch, monospace'; x.textAlign = 'center'; x.fillText(st.line1 + (st.line2 ? '  ·  ' + st.line2 : ''), w / 2, h - 18, w - 20); }
  ck.tex.needsUpdate = true;
}
