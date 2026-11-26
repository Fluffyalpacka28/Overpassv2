import * as THREE from 'three';

// WebXR support for Meta Quest (and other headsets).
// The player's head sits in the driver's seat (a rig parented to the car), the controllers
// appear as gloves, and you steer by squeezing the grip button with a hand on the wheel rim
// and turning it like a real wheel. Triggers are the pedals.

const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// one material for the whole hand (a skin tone, or a dark driving glove); nails a touch lighter; the cuff is the sleeve
export const HAND_LOOKS = [['glove', 'Driving glove', '#2a2c33'], ['light', 'Light', '#f1c8a8'], ['medium', 'Medium', '#d9a27a'], ['tan', 'Tan', '#b97f55'], ['brown', 'Brown', '#8d5a3b'], ['dark', 'Dark', '#5c3a26']];
const GLOVE = new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.72, side: THREE.DoubleSide }), CUFF = new THREE.MeshStandardMaterial({ color: '#30343c', roughness: 0.8 });
const KNUCKLE = GLOVE, TIP = new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.55 });
export function setHandLook(id) { const L = HAND_LOOKS.find(l => l[0] === id) || HAND_LOOKS[0], c = new THREE.Color(L[2]); GLOVE.color.copy(c); TIP.color.copy(c).lerp(new THREE.Color(id === 'glove' ? '#4a4d56' : '#f6ddd0'), 0.35); GLOVE.roughness = id === 'glove' ? 0.72 : 0.62; }
// a finger: three segments in a chain, each a capsule-ish cylinder with a ball knuckle; curl() bends all three
function finger(len, r) {
  const root = new THREE.Group(), segs = []; let parent = root;
  for (const k of [0.45, 0.32, 0.23]) {
    const j = new THREE.Group(); parent.add(j); const L = len * k, r2 = r * 0.9;
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), KNUCKLE); knuckle.scale.set(1.08, 0.95, 1); j.add(knuckle);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, L, 12), GLOVE); bone.rotation.x = Math.PI / 2; bone.position.z = -L / 2; bone.scale.set(1.08, 1, 0.95); j.add(bone);
    const end = new THREE.Group(); end.position.z = -L; j.add(end); segs.push(j); parent = end; r = r2;
  }
  const tipBall = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), GLOVE); tipBall.scale.set(1.08, 0.95, 1.1); parent.add(tipBall);
  const nail = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), TIP); nail.scale.set(0.95, 0.35, 1.05); nail.position.set(0, r * 0.62, 0.002); parent.parent.add(nail); nail.position.z = -len * 0.23 * 0.55; // fingernail on the back of the last segment
  const tip = new THREE.Object3D(); parent.add(tip); // fingertip point (for pressing buttons)
  return { root, segs, tip, curl: 0 };
}
// Glove for a controller: palm, cuff and four articulated fingers + thumb that curl with the trigger / grip / thumb rest.
function glove(right) {
  const g = new THREE.Group(), sd = right ? 1 : -1;
  // palm: a rounded slab (a squashed sphere over a box), wider at the knuckles, with a wrist and a sleeve
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), GLOVE); palm.scale.set(0.86, 0.34, 0.98); palm.position.set(0, -0.013, 0.006); g.add(palm);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), GLOVE); heel.scale.set(1.1, 0.55, 0.9); heel.position.set(sd * -0.006, -0.017, 0.04); g.add(heel);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.03, 0.05, 16), GLOVE); wrist.rotation.x = Math.PI / 2; wrist.scale.set(1.25, 1, 0.8); wrist.position.set(0, -0.015, 0.07); g.add(wrist);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.06, 18), CUFF); c.rotation.x = Math.PI / 2; c.scale.set(1.15, 1, 0.82); c.position.set(0, -0.015, 0.112); g.add(c);
  const F = [];
  [[0.078, 0.0102], [0.086, 0.0106], [0.08, 0.0101], [0.066, 0.0092]].forEach(([len, r], i) => { // index, middle, ring, little: real finger widths
    const f = finger(len, r); f.root.position.set(sd * (-0.03 + i * 0.0195), -0.012, -0.036 + Math.abs(i - 1.2) * 0.004); f.root.rotation.y = sd * (i - 1.5) * -0.06; g.add(f.root); F.push(f);
  });
  const th = finger(0.064, 0.0122); th.root.position.set(sd * -0.036, -0.02, 0.022); th.root.rotation.set(0.15, sd * 0.8, sd * -0.55, 'YXZ'); g.add(th.root);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), GLOVE); pad.scale.set(1, 0.7, 1.5); pad.position.set(sd * -0.03, -0.02, 0.026); g.add(pad); // the fleshy base of the thumb
  g.userData = { fingers: F, thumb: th, tip: F[0].tip };
  return g;
}
// bend a finger: c = 0 straight .. 1 fist (curls toward the palm)
function curl(f, c) { f.curl = c; const a = [1.1, 1.35, 0.9]; f.segs.forEach((s, i) => { s.rotation.x = -c * a[i] - 0.12; }); }
// tracked hands (hand-tracking): a joint-and-bone skeleton built from the 25 WebXR joints, in the glove colours
const JOINTS = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]];
function skeleton() {
  const g = new THREE.Group(), balls = [], bones = [], ball = new THREE.SphereGeometry(1, 14, 10), bone = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  for (let i = 0; i < 25; i++) { const m = new THREE.Mesh(ball, KNUCKLE); m.visible = false; g.add(m); balls.push(m); }
  // finger bones only (the palm slab covers the metacarpals, so no thin spokes from the wrist)
  for (const ch of CHAINS) for (let k = 1; k < ch.length; k++) { if (ch[k - 1] === 0 || (ch !== CHAINS[0] && k <= 2)) continue; const m = new THREE.Mesh(bone, GLOVE); m.visible = false; g.add(m); bones.push({ m, a: ch[k - 1], b: ch[k] }); }
  // palm: a closed slab around wrist, thumb base and the four knuckles, with real thickness
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 2 * 3), 3));
  const idx = []; for (let i = 0; i < 6; i++) { const a = i + 1, b = (i + 1) % 6 + 1; idx.push(0, a, b, 7, 7 + b, 7 + a, a, 7 + a, b, b, 7 + a, 7 + b); } pg.setIndex(idx);
  const palm = new THREE.Mesh(pg, GLOVE); palm.visible = false; palm.frustumCulled = false; g.add(palm);
  const nails = [4, 9, 14, 19, 24].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), TIP); m.visible = false; g.add(m); return m; });
  return { g, balls, bones, palm, nails };
}
export class VRRig {
  constructor(renderer, camera) {
    this.r = renderer; this.camera = camera;
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
    this.rig = new THREE.Group(); this.rig.name = 'vr-rig'; this.inner = new THREE.Group(); this.rig.add(this.inner); this.rig.rotation.y = Math.PI; // camera looks down -Z, cars face +Z
    this.wheelAngle = 0; this.session = null; this.onStart = null; this.onEnd = null; this.recenterAt = 0;
    this.hands = [0, 1].map(i => {
      const grip = renderer.xr.getControllerGrip(i), hand = renderer.xr.getHand(i), h = { grip, hand, src: null, grabbed: false, offset: 0, prev: [], model: null, skel: null, tracked: false, pinch: 0, fist: 0, curls: [0, 0, 0, 0, 0] };
      grip.addEventListener('connected', e => {
        h.src = e.data; h.tracked = !!e.data.hand; if (h.model) grip.remove(h.model); h.model = null;
        if (!h.tracked) { h.model = glove(e.data.handedness === 'right'); grip.add(h.model); }
      });
      grip.addEventListener('disconnected', () => { h.src = null; h.grabbed = false; h.tracked = false; });
      hand.addEventListener('connected', e => { if (!e.data || !e.data.hand) return; h.src = e.data; h.tracked = true; if (h.model) { grip.remove(h.model); h.model = null; } if (!h.skel) { h.skel = skeleton(); hand.add(h.skel.g); } });
      hand.addEventListener('disconnected', () => { if (h.tracked) { h.tracked = false; h.src = null; h.grabbed = false; } });
      this.inner.add(grip); this.inner.add(hand); return h;
    });
    this.supported = (navigator.xr && navigator.xr.isSessionSupported) ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : Promise.resolve(false);
  }
  get presenting() { return !!this.r.xr.isPresenting; }
  // must be called straight from a click/tap
  enter() {
    if (!navigator.xr) return Promise.reject(new Error('WebXR not available'));
    return navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] }).then(async s => {
      this.session = s;
      s.addEventListener('end', () => { this.session = null; this.hands.forEach(h => { h.grabbed = false; }); this.camParentRestore(); this.onEnd && this.onEnd(); });
      await this.r.xr.setSession(s);
      try { this.r.xr.setFoveation(1); } catch {}
      this.inner.add(this.camera); this.camera.position.set(0, 0, 0); this.camera.quaternion.identity();
      this.recenterAt = performance.now() + 600; this.onStart && this.onStart();
    });
  }
  exit() { if (this.session) this.session.end(); }
  camParentRestore() { this.scene && this.scene.add(this.camera); }
  attach(mesh, eye) { if (this.rig.parent !== mesh) mesh.add(this.rig); this.rig.position.copy(eye); }
  recenter() {
    // put the headset exactly at the driver's eye point, facing forward
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.inner.rotation.set(0, -e.y, 0); tmp.copy(this.camera.position).applyAxisAngle(Y, -e.y); this.inner.position.set(-tmp.x, -tmp.y, -tmp.z);
  }
  pulse(v = 0.4, ms = 40, which = null) { for (const h of this.hands) { if (!h.src || !h.src.gamepad || (which && h.src.handedness !== which)) continue; const a = h.src.gamepad.hapticActuators && h.src.gamepad.hapticActuators[0]; try { a && a.pulse && a.pulse(v, ms); } catch {} } }
  // world position of a hand's pointing fingertip (index tip), for pressing buttons and flicking switches
  poke(h, out) {
    if (h.tracked && h.hand && h.hand.joints && h.hand.joints['index-finger-tip'] && h.hand.joints['index-finger-tip'].visible) return h.hand.joints['index-finger-tip'].getWorldPosition(out);
    if (h.model && h.model.userData.tip) return h.model.userData.tip.getWorldPosition(out);
    return h.grip.getWorldPosition(out);
  }
  // middle of the palm (tracked hands), or the controller's grip point
  palmPos(h, out) {
    const J = h.tracked && h.hand && h.hand.joints;
    if (J && J['wrist'] && J['wrist'].visible && J['middle-finger-phalanx-proximal'] && J['middle-finger-phalanx-proximal'].visible) { J['wrist'].getWorldPosition(out); J['middle-finger-phalanx-proximal'].getWorldPosition(tmp2); return out.lerp(tmp2, 0.6); }
    return h.grip.getWorldPosition(out);
  }
  // fingertips that can press things: index tip and thumb tip (world positions), pushed into outs
  tips(h, outs) {
    const J = h.tracked && h.hand && h.hand.joints; let n = 0;
    if (J) { for (const k of ['index-finger-tip', 'thumb-tip']) if (J[k] && J[k].visible) J[k].getWorldPosition(outs[n++]); }
    else if (h.model) { h.model.userData.tip.getWorldPosition(outs[n++]); if (h.model.userData.thumb) h.model.userData.thumb.tip.getWorldPosition(outs[n++]); }
    return n;
  }
  // is this hand grabbing? (grip button on a controller, a closed fist with tracked hands)
  squeezing(h) { if (h.tracked) return h.fist > 0.6; const gp = h.src && h.src.gamepad; return !!(gp && gp.buttons[1] && gp.buttons[1].pressed); }
  // animate the gloves' fingers from the controller buttons; read pinch / fist from tracked hands and draw their skeletons
  hands_(dt) {
    const k = 1 - Math.exp(-dt * 18);
    for (const h of this.hands) {
      if (!h.src) continue;
      if (h.tracked) {
        const J = h.hand && h.hand.joints; if (!J || !J['wrist']) continue;
        const P = n => J[n] && J[n].visible ? J[n].position : null, d = (a, b) => { const A = P(a), B = P(b); return A && B ? A.distanceTo(B) : 1; };
        h.pinch = Math.max(0, Math.min(1, (0.055 - d('thumb-tip', 'index-finger-tip')) / 0.035));
        const fist = (d('middle-finger-tip', 'wrist') + d('ring-finger-tip', 'wrist') + d('pinky-finger-tip', 'wrist')) / 3; h.fist = Math.max(0, Math.min(1, (0.15 - fist) / 0.04)); // a hand wrapped round a wheel rim counts, not only a tight fist
        const S = h.skel; if (!S) continue;
        // joints: fuller than the tracking radii (those make spidery fingers), tapering out to the tips
        JOINTS.forEach((n, i) => { const j = J[n], b = S.balls[i]; if (!j || !j.visible) { b.visible = false; return; } b.visible = i !== 0 && !/metacarpal/.test(n) || /thumb-metacarpal/.test(n); b.position.copy(j.position); b.scale.setScalar(Math.max(0.0075, (j.jointRadius || 0.009)) * (/tip$/.test(n) ? 1.12 : /thumb/.test(n) ? 1.45 : 1.3)); b.userData.ok = true; });
        for (const B of S.bones) { const a = S.balls[B.a], b = S.balls[B.b], ja = J[JOINTS[B.a]], jb = J[JOINTS[B.b]]; if (!ja || !jb || !ja.visible || !jb.visible) { B.m.visible = false; continue; } B.m.visible = true; const r = (a.scale.x + b.scale.x) / 2 * 0.97; tmp.subVectors(b.position, a.position); const L = tmp.length(); B.m.position.addVectors(a.position, b.position).multiplyScalar(0.5); B.m.quaternion.setFromUnitVectors(_up, tmp.normalize()); B.m.scale.set(r, L, r); }
        S.nails.forEach((m, q) => { const tipJ = J[JOINTS[[4, 9, 14, 19, 24][q]]], dJ = J[JOINTS[[3, 8, 13, 18, 23][q]]]; if (!tipJ || !dJ || !tipJ.visible) { m.visible = false; return; } m.visible = true; const r = S.balls[[4, 9, 14, 19, 24][q]].scale.x; m.position.lerpVectors(dJ.position, tipJ.position, 0.7); tmp.subVectors(tipJ.position, dJ.position).normalize(); m.quaternion.setFromUnitVectors(_up, tmp); m.scale.set(r * 0.8, r * 0.9, r * 0.3); });
        // palm slab: wrist, thumb base, index / middle / ring / little knuckles; pushed up and down along the palm's normal for thickness
        const ring = ['wrist', 'thumb-metacarpal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'].map(n => J[n]);
        const ok = ring.every(j => j && j.visible); S.palm.visible = ok;
        if (ok) {
          const pts = ring.map(j => j.position), c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.multiplyScalar(1 / 6);
          const nrm = new THREE.Vector3().subVectors(pts[2], pts[0]).cross(tmp2.subVectors(pts[5], pts[0])).normalize(), th = 0.012, arr = S.palm.geometry.attributes.position.array;
          const put = (q, p, o) => { arr[q * 3] = p.x + nrm.x * o; arr[q * 3 + 1] = p.y + nrm.y * o; arr[q * 3 + 2] = p.z + nrm.z * o; };
          // pull the outline in a little at the knuckles so it doesn't poke through the finger roots; puff the middle up
          put(0, c, th * 1.25); pts.forEach((p, q) => put(q + 1, tmp.copy(p).lerp(c, q >= 2 ? 0.12 : 0.05), th)); put(7, c, -th * 1.25); pts.forEach((p, q) => put(q + 8, tmp.copy(p).lerp(c, q >= 2 ? 0.12 : 0.05), -th));
          S.palm.geometry.attributes.position.needsUpdate = true; S.palm.geometry.computeVertexNormals();
        }
      } else if (h.model && h.src.gamepad) {
        const gp = h.src.gamepad, val = i => (gp.buttons[i] ? gp.buttons[i].value : 0), touch = i => !!(gp.buttons[i] && (gp.buttons[i].touched || gp.buttons[i].pressed));
        const want = [Math.max(val(0), touch(0) ? 0.25 : 0), val(1), val(1), val(1), (touch(3) || touch(4) || touch(5) ? 0.75 : 0.1)];
        if (h.grabbed) { want[0] = Math.max(want[0], 0.85); want[1] = want[2] = want[3] = 1; want[4] = 0.8; } // wrapped around the wheel
        const U = h.model.userData; [...U.fingers, U.thumb].forEach((f, i) => { h.curls[i] += (want[i] - h.curls[i]) * k; curl(f, h.curls[i] * (i === 4 ? 0.7 : 1)); });
      }
    }
  }
  // read controllers. wheelBase/maxRot come from the active cockpit
  update(dt, wheelBase, style, R, maxRot) {
    const out = { throttle: 0, brake: 0, boost: false, hand: false, stick: 0, gripping: false, reset: false, recenter: false, nitro: false, fuel: false, pitch: 0 };
    if (performance.now() > this.recenterAt && this.recenterAt) { this.recenter(); this.recenterAt = 0; }
    const held = [];
    try { this.hands_(dt); } catch (e) { if (!this.handErr) { this.handErr = 1; console.warn('[overpass] vr hands', e); } }
    for (const h of this.hands) {
      const src = h.src; if (!src) continue; const right = src.handedness === 'right';
      if (h.tracked) { // hand tracking: pinch (thumb to index) is the pedal on that side, a fist on the rim holds the wheel
        const squeeze = (h.grabbed ? h.fist > 0.25 : h.fist > 0.5) && !h.phone; // a hand holding the phone can't hold the wheel // pedals are the GO / STOP buttons on the wheel now
        if (!wheelBase) { h.grabbed = false; continue; }
        this.palmPos(h, tmp); wheelBase.worldToLocal(tmp); const ang = Math.atan2(tmp.y, tmp.x);
        if (squeeze && !h.grabbed) { const near = style === 'bars' ? Math.min(Math.hypot(tmp.x - R, tmp.y, tmp.z), Math.hypot(tmp.x + R, tmp.y, tmp.z)) < 0.2 : Math.hypot(tmp.x, tmp.y) < R + 0.16 && Math.abs(tmp.z) < 0.22; if (near) { h.grabbed = true; h.offset = this.wheelAngle - ang; } }
        if (!squeeze) h.grabbed = false;
        if (h.grabbed) held.push(ang + h.offset);
        continue;
      }
      if (!src.gamepad) continue; const gp = src.gamepad;
      const val = i => (gp.buttons[i] ? gp.buttons[i].value : 0), down = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => { const d = down(i), was = h.prev[i]; h.prev[i] = d; return d && !was; };
      const sx = gp.axes.length > 2 ? gp.axes[2] : (gp.axes[0] || 0);
      if (right) { out.throttle = val(0); out.boost = down(4); out.hand = down(5); if (edge(3)) out.nitro = true; const py = gp.axes.length > 3 ? gp.axes[3] : 0; if (Math.abs(py) > 0.15) out.pitch = py; }
      else { out.brake = val(0); if (Math.abs(sx) > 0.15) out.stick = -sx; if (edge(4)) out.reset = true; if (edge(5)) out.recenter = true; if (edge(3)) out.fuel = true; }
      const squeeze = down(1) && !h.phone;
      if (!wheelBase) { h.grabbed = false; continue; }
      h.grip.getWorldPosition(tmp); wheelBase.worldToLocal(tmp);
      const ang = Math.atan2(tmp.y, tmp.x);
      if (squeeze && !h.grabbed) {
        const near = style === 'bars' ? Math.min(Math.hypot(tmp.x - R, tmp.y, tmp.z), Math.hypot(tmp.x + R, tmp.y, tmp.z)) < 0.17 : Math.hypot(tmp.x, tmp.y) < R + 0.14 && Math.abs(tmp.z) < 0.2;
        if (near) { h.grabbed = true; h.offset = this.wheelAngle - ang; this.pulse(0.5, 35, src.handedness); }
      }
      if (!squeeze) h.grabbed = false;
      if (h.grabbed) held.push(ang + h.offset);
    }
    if (held.length) {
      let sum = 0; for (let a of held) { while (a - this.wheelAngle > Math.PI) a -= 2 * Math.PI; while (a - this.wheelAngle < -Math.PI) a += 2 * Math.PI; sum += a; }
      const prev = this.wheelAngle; this.wheelAngle = Math.max(-maxRot, Math.min(maxRot, sum / held.length));
      if (Math.abs(this.wheelAngle) >= maxRot && Math.abs(prev) < maxRot) this.pulse(0.3, 25); // hit the steering lock
      out.gripping = true;
    }
    return out;
  }
}
export const __handTest = { glove, skeleton, curl };
