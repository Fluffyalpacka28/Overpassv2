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
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  vec3 col = mix(vec3(0.72, 0.87, 1.0), vec3(1.0), smoothstep(0.5, 0.0, d));
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
    const sp = car.speed, asp = Math.abs(sp); if (asp < 3) return;
    const yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = sp >= 0 ? 1 : -1;
    const k = Math.min(1, asp / 40), ud = car.mesh && car.mesh.userData, ws = ud && ud.wheels;
    const pts = ws && ws.length ? ws.map(w => [w.pivot.position.x, w.pivot.position.z]) : [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]];
    for (const [lx, lz] of pts) {
      const rear = lz * dir < 0, side = lx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(lx);
      let n = (22 + 120 * k) * (rear ? 1.4 : 1) * dt;
      for (; n > 0; n -= 1) {
        if (Math.random() >= n) break;
        const wx = car.x + lx * rx + lz * fx + (Math.random() - 0.5) * 0.3, wz = car.z + lx * rz + lz * fz + (Math.random() - 0.5) * 0.3;
        const out = side * (0.8 + Math.random() * 2.4 * (0.4 + k)), back = -dir * (0.8 + Math.random() * 4.2 * k);
        const up = (2.2 + Math.random() * (3 + 4.5 * k)) * (rear ? 1.2 : 1);
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
