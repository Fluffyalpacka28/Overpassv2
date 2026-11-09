import * as THREE from 'three';

// WebXR support for Meta Quest (and other headsets).
// The player's head sits in the driver's seat (a rig parented to the car), the controllers
// appear as gloves, and you steer by squeezing the grip button with a hand on the wheel rim
// and turning it like a real wheel. Triggers are the pedals.

const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
function glove(right) {
  const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: '#23252c', roughness: 0.8 }), cuff = new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.6 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.09), skin); palm.position.set(0, -0.01, 0.01); g.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.018, 0.06), skin); f.position.set(-0.027 + i * 0.018, -0.018, -0.055); f.rotation.x = 0.5; g.add(f); }
  const th = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.05), skin); th.position.set(right ? -0.045 : 0.045, -0.005, -0.01); th.rotation.y = right ? 0.6 : -0.6; g.add(th);
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.03), cuff); c.position.set(0, -0.01, 0.065); g.add(c);
  return g;
}

export class VRRig {
  constructor(renderer, camera) {
    this.r = renderer; this.camera = camera;
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local');
    this.rig = new THREE.Group(); this.rig.name = 'vr-rig'; this.inner = new THREE.Group(); this.rig.add(this.inner); this.rig.rotation.y = Math.PI; // camera looks down -Z, cars face +Z
    this.wheelAngle = 0; this.session = null; this.onStart = null; this.onEnd = null; this.recenterAt = 0;
    this.hands = [0, 1].map(i => {
      const grip = renderer.xr.getControllerGrip(i), h = { grip, src: null, grabbed: false, offset: 0, prev: [], model: null };
      grip.addEventListener('connected', e => { h.src = e.data; if (h.model) grip.remove(h.model); h.model = glove(e.data.handedness === 'right'); grip.add(h.model); });
      grip.addEventListener('disconnected', () => { h.src = null; h.grabbed = false; });
      this.inner.add(grip); return h;
    });
    this.supported = (navigator.xr && navigator.xr.isSessionSupported) ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : Promise.resolve(false);
  }
  get presenting() { return !!this.r.xr.isPresenting; }
  // must be called straight from a click/tap
  enter() {
    if (!navigator.xr) return Promise.reject(new Error('WebXR not available'));
    return navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] }).then(async s => {
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
  // read controllers. wheelBase/maxRot come from the active cockpit
  update(dt, wheelBase, style, R, maxRot) {
    const out = { throttle: 0, brake: 0, boost: false, hand: false, stick: 0, gripping: false, reset: false, recenter: false, nitro: false, fuel: false };
    if (performance.now() > this.recenterAt && this.recenterAt) { this.recenter(); this.recenterAt = 0; }
    const held = [];
    for (const h of this.hands) {
      const src = h.src; if (!src || !src.gamepad) continue; const gp = src.gamepad, right = src.handedness === 'right';
      const val = i => (gp.buttons[i] ? gp.buttons[i].value : 0), down = i => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = i => { const d = down(i), was = h.prev[i]; h.prev[i] = d; return d && !was; };
      const sx = gp.axes.length > 2 ? gp.axes[2] : (gp.axes[0] || 0);
      if (right) { out.throttle = val(0); out.boost = down(4); out.hand = down(5); if (edge(3)) out.nitro = true; }
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
