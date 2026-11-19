import * as THREE from 'three';

// WebXR support for Meta Quest (and other headsets).
// The player's head sits in the driver's seat (a rig parented to the car), the controllers
// appear as gloves, and you steer by squeezing the grip button with a hand on the wheel rim
// and turning it like a real wheel. Triggers are the pedals.

const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const GLOVE = new THREE.MeshStandardMaterial({ color: '#23252c', roughness: 0.75 }), CUFF = new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.6 });
const KNUCKLE = new THREE.MeshStandardMaterial({ color: '#3a3d46', roughness: 0.6 }), TIP = new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.5, emissive: '#3a0d00' });
// a finger: three segments in a chain, each a capsule-ish cylinder with a ball knuckle; curl() bends all three
function finger(len, r) {
  const root = new THREE.Group(), segs = []; let parent = root;
  for (const k of [0.45, 0.32, 0.23]) {
    const j = new THREE.Group(); parent.add(j); const L = len * k;
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), KNUCKLE); j.add(knuckle);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, L, 10), GLOVE); bone.rotation.x = Math.PI / 2; bone.position.z = -L / 2; j.add(bone);
    const end = new THREE.Group(); end.position.z = -L; j.add(end); segs.push(j); parent = end; r *= 0.9;
  }
  const tipBall = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 10, 8), TIP); parent.add(tipBall);
  const tip = new THREE.Object3D(); parent.add(tip); // fingertip point (for pressing buttons)
  return { root, segs, tip, curl: 0 };
}
// Glove for a controller: palm, cuff and four articulated fingers + thumb that curl with the trigger / grip / thumb rest.
function glove(right) {
  const g = new THREE.Group(), sd = right ? 1 : -1;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.026, 0.085), GLOVE); palm.position.set(0, -0.012, 0.01); g.add(palm);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.06), KNUCKLE); back.position.set(0, 0.003, 0.012); g.add(back);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.04, 14), CUFF); c.rotation.x = Math.PI / 2; c.scale.set(1, 1, 0.62); c.position.set(0, -0.012, 0.072); g.add(c);
  const F = [];
  [[0.075, 0.0085], [0.083, 0.0088], [0.078, 0.0084], [0.064, 0.0078]].forEach(([len, r], i) => { // index, middle, ring, little
    const f = finger(len, r); f.root.position.set(sd * (-0.027 + i * 0.018), -0.014, -0.032); f.root.rotation.y = sd * (i - 1.5) * -0.05; g.add(f.root); F.push(f);
  });
  const th = finger(0.062, 0.0095); th.root.position.set(sd * -0.04, -0.016, 0.02); th.root.rotation.set(0.1, sd * 0.75, sd * -0.5, 'YXZ'); g.add(th.root);
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
  const g = new THREE.Group(), balls = [], bones = [], ball = new THREE.SphereGeometry(1, 10, 8), bone = new THREE.CylinderGeometry(1, 1, 1, 10);
  for (let i = 0; i < 25; i++) { const m = new THREE.Mesh(ball, /tip$/.test(JOINTS[i]) ? TIP : KNUCKLE); m.visible = false; g.add(m); balls.push(m); }
  for (const ch of CHAINS) for (let k = 1; k < ch.length; k++) { const m = new THREE.Mesh(bone, GLOVE); m.visible = false; g.add(m); bones.push({ m, a: ch[k - 1], b: ch[k] }); }
  // a palm plate between the knuckles, so it reads as a hand and not a stick figure
  const palm = new THREE.Mesh(new THREE.BufferGeometry(), GLOVE); palm.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3 * 2), 3)); palm.material = GLOVE.clone(); palm.material.side = THREE.DoubleSide; palm.visible = false; g.add(palm);
  return { g, balls, bones, palm };
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
        const fist = (d('middle-finger-tip', 'wrist') + d('ring-finger-tip', 'wrist') + d('pinky-finger-tip', 'wrist')) / 3; h.fist = Math.max(0, Math.min(1, (0.13 - fist) / 0.05));
        const S = h.skel; if (!S) continue;
        JOINTS.forEach((n, i) => { const j = J[n], b = S.balls[i]; if (!j || !j.visible) { b.visible = false; return; } b.visible = true; b.position.copy(j.position); b.scale.setScalar((j.jointRadius || 0.008) * (/tip$/.test(n) ? 1.05 : 1.2)); });
        for (const B of S.bones) { const a = S.balls[B.a], b = S.balls[B.b]; if (!a.visible || !b.visible) { B.m.visible = false; continue; } B.m.visible = true; const r = Math.min(a.scale.x, b.scale.x) * 0.85; tmp.subVectors(b.position, a.position); const L = tmp.length(); B.m.position.addVectors(a.position, b.position).multiplyScalar(0.5); B.m.quaternion.setFromUnitVectors(_up, tmp.normalize()); B.m.scale.set(r, L, r); }
        // palm: two triangles wrist - index knuckle - little knuckle, and index knuckle - middle - little
        const ids = [0, 6, 21, 6, 11, 21], ok = ids.every(i => S.balls[i].visible);
        S.palm.visible = ok; if (ok) { const arr = S.palm.geometry.attributes.position.array; ids.forEach((i, q) => { arr[q * 3] = S.balls[i].position.x; arr[q * 3 + 1] = S.balls[i].position.y; arr[q * 3 + 2] = S.balls[i].position.z; }); for (let q = 0; q < 6; q++) { arr[18 + q * 3] = arr[q * 3]; arr[18 + q * 3 + 1] = arr[q * 3 + 1]; arr[18 + q * 3 + 2] = arr[q * 3 + 2]; } S.palm.geometry.attributes.position.needsUpdate = true; S.palm.geometry.computeVertexNormals(); S.palm.geometry.computeBoundingSphere(); }
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
        if (!h.grabbed) { if (right) out.throttle = Math.max(out.throttle, h.pinch); else out.brake = Math.max(out.brake, h.pinch); }
        const squeeze = h.grabbed ? h.fist > 0.35 : h.fist > 0.6;
        if (!wheelBase) { h.grabbed = false; continue; }
        h.grip.getWorldPosition(tmp); wheelBase.worldToLocal(tmp); const ang = Math.atan2(tmp.y, tmp.x);
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
      const squeeze = down(1);
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
