import * as THREE from 'three';

// Little droplets and mist kicked up by the tires while driving on water
// (the GTA Vice City boat/car spray look). One pooled THREE.Points object, no allocations per frame.
const MAX = 800;
const VERT = `
attribute float aSize; attribute float aAlpha;
uniform float uScale; varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.12, 0.5, d)) * vAlpha;
  vec3 col = mix(vec3(0.72, 0.87, 1.0), vec3(1.0), 1.0 - smoothstep(0.0, 0.5, d));
  gl_FragColor = vec4(col, a);
}`;

export class WaterSpray {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3); this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX); this.baseAlpha = new Float32Array(MAX);
    this.floorY = new Float32Array(MAX); this.mist = new Uint8Array(MAX);
    this.head = 0; this.alive = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    this.material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 800 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.material); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this._v = new THREE.Vector2();
  }
  // pixels-per-world-unit scale so droplets keep a sensible on-screen size
  setScale(renderer, camera, xr) {
    if (xr) { this.material.uniforms.uScale.value = 900; return; }
    renderer.getDrawingBufferSize(this._v);
    this.material.uniforms.uScale.value = this._v.y / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
  _spawn(x, y, z, vx, vy, vz, life, size, alpha, floorY, mist) {
    const i = this.head; this.head = (this.head + 1) % MAX;
    if (this.life[i] <= 0) this.alive++;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.baseSize[i] = size; this.baseAlpha[i] = alpha;
    this.size[i] = size; this.alpha[i] = alpha; this.floorY[i] = floorY; this.mist[i] = mist ? 1 : 0;
  }
  // continuous spray off each tire; wy = water surface height
  emit(car, dt, wy) {
    const sp = car.speed, asp = Math.abs(sp); // sprays all the time on water, harder the faster you go
    const yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = sp >= 0 ? 1 : -1;
    const k = Math.min(1, asp / 40), ud = car.mesh && car.mesh.userData, ws = ud && ud.wheels;
    const pts = ws && ws.length ? ws.map(w => [w.pivot.position.x, w.pivot.position.z]) : [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]];
    for (const [lx, lz] of pts) {
      const rear = lz * dir < 0, side = lx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(lx);
      let n = (34 + 120 * k) * (rear ? 1.4 : 1) * dt;
      for (; n > 0; n -= 1) {
        if (Math.random() >= n) break;
        const wx = car.x + lx * rx + lz * fx + (Math.random() - 0.5) * 0.3, wz = car.z + lx * rz + lz * fz + (Math.random() - 0.5) * 0.3;
        const out = side * (0.8 + Math.random() * 2.4 * (0.4 + k)), back = -dir * Math.random() * (0.8 + 4.2 * k);
        const up = (1.5 + Math.random() * (2 + 5.5 * k)) * (rear ? 1.2 : 1);
        const mist = Math.random() < 0.3;
        this._spawn(wx, wy + 0.05, wz,
          rx * out + fx * back + (car.vx || 0) * 0.3, mist ? up * 0.5 : up, rz * out + fz * back + (car.vz || 0) * 0.3,
          mist ? 0.7 + Math.random() * 0.5 : 0.45 + Math.random() * 0.45,
          mist ? 0.3 + Math.random() * 0.25 : 0.07 + Math.random() * 0.09,
          mist ? 0.3 : 0.95, wy - 0.05, mist);
      }
    }
  }
  // one-off splash, e.g. when the car first hits the water at speed
  burst(car, wy) {
    const k = Math.min(1, Math.abs(car.speed) / 40), n = 28 + Math.round(40 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.6, s = 1.5 + Math.random() * 3.5, mist = i % 4 === 0;
      this._spawn(car.x + Math.cos(a) * r, wy + 0.05, car.z + Math.sin(a) * r,
        Math.cos(a) * s + (car.vx || 0) * 0.25, 3 + Math.random() * (4 + 4 * k), Math.sin(a) * s + (car.vz || 0) * 0.25,
        mist ? 0.8 + Math.random() * 0.5 : 0.6 + Math.random() * 0.5,
        mist ? 0.4 + Math.random() * 0.3 : 0.08 + Math.random() * 0.1, mist ? 0.3 : 0.95, wy - 0.05, mist);
    }
  }
  update(dt) {
    if (!this.alive) return;
    const drag = Math.exp(-dt * 0.8); let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3, m = this.mist[i];
      this.life[i] -= dt; this.vel[k + 1] -= (m ? 5 : 15) * dt;
      this.vel[k] *= drag; this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.life[i] <= 0 || this.pos[k + 1] < this.floorY[i]) { this.life[i] = 0; this.alpha[i] = 0; this.size[i] = 0; continue; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, (1 - t) * 1.8);
      this.size[i] = this.baseSize[i] * (m ? 1 + t * 1.3 : 1 - t * 0.35);
      alive++;
    }
    this.alive = alive; this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  clear() {
    this.life.fill(0); this.alpha.fill(0); this.size.fill(0); this.alive = 0;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}

// Foam trail + ripples left on the water behind the car.
// Flat, soft-edged patches that sit on the surface, grow, drift apart and fade. Built from plain instanced meshes with a standard
// MeshBasicMaterial (same path as the trees), brightness per instance does the fading, so there is no custom shader to go wrong.
const WN = 240, RN = 140;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _zero = new THREE.Matrix4().makeScale(0, 0, 0), _c = new THREE.Color();

function canvasTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'), 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function foamTex() {
  return canvasTex((x, S) => {
    for (let i = 0; i < 26; i++) { // ragged blob made of soft dots
      const a = Math.random() * 6.283, r = Math.random() * S * 0.3, cx = S / 2 + Math.cos(a) * r, cy = S / 2 + Math.sin(a) * r, rad = S * (0.08 + Math.random() * 0.14);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    }
    x.globalCompositeOperation = 'destination-in'; const m = x.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, S, S);
  });
}
function ringTex() {
  return canvasTex((x, S) => {
    const ring = (r, w, a) => { x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = w; x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 5; x.beginPath(); for (let i = 0; i <= 64; i++) { const t = i / 64 * 6.283, rr = r * (1 + 0.03 * Math.sin(t * 5) + 0.02 * Math.sin(t * 11 + 1)); i ? x.lineTo(S / 2 + Math.cos(t) * rr, S / 2 + Math.sin(t) * rr) : x.moveTo(S / 2 + Math.cos(t) * rr, S / 2 + Math.sin(t) * rr); } x.stroke(); };
    ring(S * 0.42, 5, 1); ring(S * 0.27, 3, 0.55);
  });
}
// one pooled layer of flat quads on the water
class Layer {
  constructor(scene, n, tex, order, offset) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
    this.n = n; this.mesh = new THREE.InstancedMesh(g, m, n); this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, _zero); this.mesh.setColorAt(i, _c.setScalar(0)); } // creating instanceColor now so the material compiles with it
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n); this.vx = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.rot = new Float32Array(n);
    this.head = 0; this.alive = 0; scene.add(this.mesh);
  }
  add(x, y, z, vx, vz, life, s0, s1, a0) {
    const i = this.head; this.head = (this.head + 1) % this.n; if (this.life[i] <= 0) this.alive++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vz[i] = vz; this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.rot[i] = Math.random() * 6.283;
  }
  update(dt, drift) {
    if (!this.alive) return; let alive = 0; const g = Math.exp(-dt * 0.9);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, _zero); this.mesh.setColorAt(i, _c.setScalar(0)); continue; }
      const t = 1 - this.life[i] / this.max[i], sz = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      if (drift) { this.vx[i] *= g; this.vz[i] *= g; this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt; }
      _p.set(this.x[i], this.y[i], this.z[i]); _q.setFromAxisAngle(_up, this.rot[i]); _s.set(sz, 1, sz);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(i, _c.setScalar(this.a0[i] * Math.min(1, t / 0.06) * Math.pow(1 - t, 1.2)));
      alive++;
    }
    this.alive = alive; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.life.fill(0); for (let i = 0; i < this.n; i++) { this.mesh.setMatrixAt(i, _zero); this.mesh.setColorAt(i, _c.setScalar(0)); }
    this.alive = 0; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

export class WaterWake {
  constructor(scene) {
    this.foam = new Layer(scene, WN, foamTex(), 4, -3);
    this.rings = new Layer(scene, RN, ringTex(), 5, -4);
    this.acc = 0; this.rt = 0;
  }
  emit(car, dt, wy) {
    const sp = Math.abs(car.speed), yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = car.speed >= 0 ? 1 : -1, k = Math.min(1, sp / 35), y = wy + 0.08;
    if (sp >= 2) { // foam trail while moving
      this.acc += sp * dt; const spacing = Math.max(0.8, sp * 0.05);
      while (this.acc >= spacing) {
        this.acc -= spacing;
        const bx = car.x - fx * 2.0 * dir, bz = car.z - fz * 2.0 * dir, j = () => (Math.random() - 0.5) * 0.5;
        this.foam.add(bx + j(), y, bz + j(), 0, 0, 1.8 + Math.random() * 0.8, 1.0 + k * 0.8, 2.8 + k * 2.2, 0.7); // churned centre line
        for (const sd of [-1, 1]) { // the two arms of the wake spreading out behind
          const out = sd * (0.7 + 0.9 * k) * (0.8 + Math.random() * 0.4);
          this.foam.add(bx + rx * sd * 0.9 + j(), y, bz + rz * sd * 0.9 + j(), rx * out - fx * dir * 0.3, rz * out - fz * dir * 0.3, 2.6 + Math.random() * 1.0, 0.6 + k * 0.4, 1.7 + k * 1.5, 0.5);
        }
      }
    } else this.acc = 0;
    // ripples: always, even parked; more of them (and bigger) the faster you go
    this.rt -= dt * (2.5 + sp * 0.45);
    while (this.rt <= 0) {
      this.rt += 1;
      const ud = car.mesh && car.mesh.userData, ws = ud && ud.wheels, w = ws && ws.length ? ws[Math.floor(Math.random() * ws.length)].pivot.position : null;
      const lx = w ? w.x : (Math.random() - 0.5) * 1.6, lz = w ? w.z : (Math.random() - 0.5) * 2.6, j = () => (Math.random() - 0.5) * 0.4;
      this.rings.add(car.x + lx * rx + lz * fx + j(), y + 0.02, car.z + lx * rz + lz * fz + j(), 0, 0, 1.5 + Math.random() * 0.8, 0.5, 2.4 + 2.2 * k + Math.random(), 0.9);
      if (sp > 3 && Math.random() < 0.7) { // bigger rings left behind the car, spread across the width of the trail
        const back = 2.2 + Math.random() * 1.2, side = (Math.random() - 0.5) * (1.6 + 2 * k);
        this.rings.add(car.x - fx * back * dir + rx * side, y + 0.02, car.z - fz * back * dir + rz * side, 0, 0, 2.0 + Math.random() * 1.0, 0.8, 3.2 + 3.2 * k + Math.random() * 1.2, 0.8);
      }
    }
  }
  update(dt) { this.foam.update(dt, true); this.rings.update(dt, false); }
  clear() { this.foam.clear(); this.rings.clear(); this.acc = 0; this.rt = 0; }
}
