import * as THREE from 'three';

// Spray thrown up while driving on water: shaded droplets, soft mist, translucent spray curtains peeling off the wheels and a
// rooster-tail plume behind at speed. Everything is lit by the scene's light (set each frame with setLight), so it isn't glowing at night.
// Droplets are one pooled THREE.Points object; the curtains are a handful of textured quads. No allocations per frame.
const MAX = 1100;
const VERT = `
attribute float aSize; attribute float aAlpha; attribute float aMist;
uniform float uScale; varying float vAlpha; varying float vMist;
void main() {
  vAlpha = aAlpha; vMist = aMist;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uLight; varying float vAlpha; varying float vMist;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  if (vMist > 0.5) { // soft, slightly lumpy mist puff
    float lump = 0.75 + 0.25 * sin(c.x * 19.0 + vAlpha * 40.0) * sin(c.y * 17.0 - vAlpha * 31.0);
    float a = pow(1.0 - smoothstep(0.0, 0.5, d), 1.6) * lump * vAlpha;
    gl_FragColor = vec4(vec3(0.9, 0.94, 0.97) * uLight, a);
    return;
  }
  // a droplet: tiny lit sphere of water, darker body, bright rim and a sharp highlight
  vec2 q = c * 2.0; float z = sqrt(max(0.0, 1.0 - dot(q, q))); vec3 n = vec3(q.x, -q.y, z);
  float hl = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 22.0);
  float rim = pow(1.0 - z, 2.0);
  vec3 col = mix(vec3(0.42, 0.6, 0.7), vec3(0.86, 0.94, 0.99), 0.35 + 0.4 * n.y + 0.4 * rim) * uLight + hl * vec3(1.0) * clamp(uLight.g * 1.2, 0.2, 1.2);
  gl_FragColor = vec4(col, smoothstep(0.5, 0.36, d) * vAlpha * (0.6 + 0.4 * rim + hl));
}`;
function curtainTex(seed, plume) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let s = seed * 9301 + 49297; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // streaks fanning out of the bottom-left (curtain) or the bottom middle (plume), breaking into droplets near the ends
  for (let i = 0; i < 90; i++) {
    const ox = plume ? S / 2 + (r() - 0.5) * 18 : r() * 10, oy = S, ang = plume ? -Math.PI / 2 + (r() - 0.5) * 1.1 : -0.15 - r() * 1.15, len = S * (0.45 + r() * 0.65);
    const ex = ox + Math.cos(ang) * len, ey = oy + Math.sin(ang) * len, g = x.createLinearGradient(ox, oy, ex, ey);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.15, `rgba(255,255,255,${0.22 + r() * 0.3})`); g.addColorStop(0.75, `rgba(255,255,255,${0.12 + r() * 0.15})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.strokeStyle = g; x.lineWidth = 0.8 + r() * 2.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(ox, oy); x.quadraticCurveTo((ox + ex) / 2 + (r() - 0.5) * 14, (oy + ey) / 2 - r() * 10, ex, ey); x.stroke();
    for (let k = 0; k < 4; k++) { const t = 0.7 + r() * 0.45, px = ox + (ex - ox) * t + (r() - 0.5) * 8, py = oy + (ey - oy) * t + (r() - 0.5) * 8; x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.4})`; x.beginPath(); x.arc(px, py, 0.8 + r() * 1.6, 0, 6.283); x.fill(); }
  }
  // soft misty body
  const m = plume ? x.createRadialGradient(S / 2, S * 0.85, 4, S / 2, S * 0.7, S * 0.5) : x.createRadialGradient(S * 0.2, S * 0.85, 4, S * 0.35, S * 0.7, S * 0.6);
  m.addColorStop(0, 'rgba(255,255,255,0.35)'); m.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = m; x.fillRect(0, 0, S, S);
  // fade out before the texture's edges so no streak ends in a hard cut
  x.globalCompositeOperation = 'destination-in'; const f = plume ? x.createRadialGradient(S / 2, S, 0, S / 2, S, S * 0.98) : x.createRadialGradient(0, S, 0, 0, S, S * 1.05);
  f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(0.55, 'rgba(0,0,0,1)'); f.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = f; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class WaterSpray {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3); this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX); this.mistA = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX); this.baseAlpha = new Float32Array(MAX);
    this.floorY = new Float32Array(MAX); this.mist = new Uint8Array(MAX);
    this.head = 0; this.alive = 0; this.onLand = null;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aMist = new THREE.BufferAttribute(this.mistA, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha); g.setAttribute('aMist', this.aMist);
    this.light = new THREE.Color(1, 1, 1);
    this.material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 800 }, uLight: { value: this.light } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.material); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this._v = new THREE.Vector2(); this.cam = null;
    // spray curtains (2 per side) + the rooster tail
    const texC = [1, 2, 3, 4].map(k => curtainTex(k, false)), texP = [5, 6, 7].map(k => curtainTex(k, true));
    const geoC = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), geoP = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const mk = (geo, tex) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex[0], transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 })); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; m.userData.tex = tex; scene.add(m); return m; };
    this.curtains = [0, 1, 2, 3].map(() => mk(geoC, texC)); this.plume = mk(geoP, texP);
    this.sheet = { k: 0, want: 0, car: null, wy: 0, flick: 0 };
  }
  // the scene's light on the water (THREE.Color, ~0..1+): day = white-ish, night = dark
  setLight(c) { if (c) { this.light.setRGB(Math.min(1.1, c.r), Math.min(1.1, c.g), Math.min(1.1, c.b)); } }
  // pixels-per-world-unit scale so droplets keep a sensible on-screen size
  setScale(renderer, camera, xr) {
    this.cam = camera;
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
    this.size[i] = size; this.alpha[i] = alpha; this.floorY[i] = floorY; this.mist[i] = mist ? 1 : 0; this.mistA[i] = mist ? 1 : 0;
  }
  // continuous spray off each tire; wy = water surface height
  emit(car, dt, wy) {
    const sp = car.speed, asp = Math.abs(sp);
    const yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = sp >= 0 ? 1 : -1;
    const k = Math.min(1, asp / 38), ud = car.mesh && car.mesh.userData, ws = ud && ud.wheels, R = Math.random;
    const pts = ws && ws.length ? ws.map(w => [w.pivot.position.x, w.pivot.position.z]) : [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]];
    const cvx = car.vx || fx * sp, cvz = car.vz || fz * sp;
    for (const [lx, lz] of pts) {
      const lead = lz * dir > 0, side = lx === 0 ? (R() < 0.5 ? -1 : 1) : Math.sign(lx);
      let n = (lead ? 26 + 90 * k : 30 + 150 * k) * dt;
      for (; n > 0; n -= 1) {
        if (R() >= n) break;
        const wx = car.x + lx * rx + lz * fx + (R() - 0.5) * 0.3, wz = car.z + lx * rz + lz * fz + (R() - 0.5) * 0.3, mist = R() < 0.22;
        let vx, vy, vz;
        if (lead) { // bow spray: thrown out sideways in a fan, a bit forward, and up
          const out = side * (1.2 + R() * (2 + 4.5 * k)), fwd = dir * (R() - 0.3) * 2 * k; vy = 1.2 + R() * (1.5 + 4 * k);
          vx = rx * out + fx * fwd; vz = rz * out + fz * fwd;
        } else { // rear wheels: rooster tail, mostly backwards and high
          const back = -dir * (1 + R() * (2 + 7 * k)), out = side * (0.3 + R() * 1.6); vy = 1.6 + R() * (2 + 7.5 * k);
          vx = fx * back + rx * out; vz = fz * back + rz * out;
        }
        this._spawn(wx, wy + 0.05, wz, vx + cvx * 0.55, mist ? vy * 0.45 : vy, vz + cvz * 0.55,
          mist ? 0.7 + R() * 0.6 : 0.5 + R() * 0.55,
          mist ? 0.35 + R() * 0.35 + k * 0.4 : 0.05 + R() * 0.1,
          mist ? 0.28 : 0.9, wy - 0.05, mist);
      }
    }
    this.sheet.want = Math.max(0, Math.min(1, (asp - 3) / 26)); this.sheet.car = car; this.sheet.wy = wy; this.sheet.pts = pts; this.sheet.dir = dir; this.sheet.seen = 2;
  }
  // one-off splash when the car first hits the water at speed: a crown of droplets, a column of mist
  burst(car, wy) {
    const k = Math.min(1, Math.abs(car.speed) / 35), n = 60 + Math.round(90 * k), R = Math.random;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.2, r = 1.2 + R() * 0.8, s = 2 + R() * (2.5 + 3 * k);
      this._spawn(car.x + Math.cos(a) * r, wy + 0.05, car.z + Math.sin(a) * r,
        Math.cos(a) * s + (car.vx || 0) * 0.35, 3.5 + R() * (3 + 5 * k), Math.sin(a) * s + (car.vz || 0) * 0.35,
        0.7 + R() * 0.6, 0.07 + R() * 0.11, 0.95, wy - 0.05, false);
    }
    for (let i = 0; i < 14; i++) {
      const a = R() * 6.283, r = R() * 1.8;
      this._spawn(car.x + Math.cos(a) * r, wy + 0.2 + R() * 0.6, car.z + Math.sin(a) * r, Math.cos(a) * 1.5 + (car.vx || 0) * 0.3, 1.5 + R() * 3 * (0.5 + k), Math.sin(a) * 1.5 + (car.vz || 0) * 0.3,
        1.1 + R() * 0.8, 0.9 + R() * 0.9 + k, 0.35, wy - 0.05, true);
    }
  }
  updateSheets(dt) {
    const S = this.sheet; if (S.seen > 0) S.seen--; else S.want = 0;
    S.k += (S.want - S.k) * Math.min(1, dt * (S.want > S.k ? 6 : 3)); S.flick -= dt;
    const on = S.k > 0.03 && S.car, flick = S.flick <= 0; if (flick) S.flick = 0.05;
    for (const m of [...this.curtains, this.plume]) { m.visible = !!on; if (on) { m.material.color.copy(this.light); if (flick) { const T = m.userData.tex; m.material.map = T[(Math.random() * T.length) | 0]; } } }
    if (!on) return;
    const c = S.car, yaw = c.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = S.dir, k = S.k, R = Math.random;
    const lead = S.pts.filter(([, lz]) => lz * dir > 0);
    // two curtains per side, from the leading wheels, angled back and outwards
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, w = lead.find(([lx]) => Math.sign(lx) === side) || lead[0] || [side * 0.8, 1.3 * dir];
      const bx = c.x + (w[0] + side * 0.25) * rx + w[1] * fx, bz = c.z + (w[0] + side * 0.25) * rz + w[1] * fz;
      for (let q = 0; q < 2; q++) {
        const m = this.curtains[s * 2 + q], dxv = -fx * dir * (0.85 - q * 0.25) + rx * side * (0.55 + q * 0.3), dzv = -fz * dir * (0.85 - q * 0.25) + rz * side * (0.55 + q * 0.3);
        m.position.set(bx, S.wy, bz); m.rotation.set(0, Math.atan2(-dzv, dxv), 0); m.rotateX(side * dir * (0.25 + q * 0.2)); // lean outwards
        m.scale.set((1.4 + 3.6 * k) * (0.9 + R() * 0.2) * (q ? 0.8 : 1), (0.35 + 1.5 * k) * (0.9 + R() * 0.2) * (q ? 0.75 : 1), 1);
        m.material.opacity = Math.min(0.85, k * 1.1) * (q ? 0.7 : 0.9);
      }
    }
    // rooster tail: faces the camera, behind the car, only once you're moving fast
    const pk = Math.max(0, (k - 0.35) / 0.65), p = this.plume, tx = c.x - fx * dir * (2.6 + 1.5 * pk), tz = c.z - fz * dir * (2.6 + 1.5 * pk);
    p.visible = pk > 0.02; p.position.set(tx, S.wy, tz);
    if (this.cam) p.rotation.set(0, Math.atan2(this.cam.position.x - tx, this.cam.position.z - tz), 0);
    p.scale.set((1.2 + 1.8 * pk) * (0.9 + R() * 0.2), (0.6 + 2.8 * pk) * (0.9 + R() * 0.2), 1); p.material.opacity = Math.min(0.8, pk * 1.2);
  }
  update(dt) {
    try { this.updateSheets(dt); } catch (e) { }
    if (!this.alive) return;
    const drag = Math.exp(-dt * 0.9), md = Math.exp(-dt * 2.2); let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3, m = this.mist[i];
      this.life[i] -= dt; this.vel[k + 1] -= (m ? 2.5 : 11) * dt;
      const d = m ? md : drag; this.vel[k] *= d; this.vel[k + 2] *= d; if (m) this.vel[k + 1] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floorY[i]) { // landed back in the water
        if (!m && this.onLand && Math.random() < 0.12) this.onLand(this.pos[k], this.floorY[i] + 0.1, this.pos[k + 2]);
        this.life[i] = 0;
      }
      if (this.life[i] <= 0) { this.life[i] = 0; this.alpha[i] = 0; this.size[i] = 0; continue; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.alpha[i] = this.baseAlpha[i] * Math.min(1, (1 - t) * 1.8) * (m ? Math.min(1, t * 6) : 1);
      this.size[i] = this.baseSize[i] * (m ? 1 + t * 1.8 : 1 - t * 0.35);
      alive++;
    }
    this.alive = alive; this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aMist.needsUpdate = true;
  }
  clear() {
    this.life.fill(0); this.alpha.fill(0); this.size.fill(0); this.alive = 0; this.sheet.want = this.sheet.k = 0; this.sheet.car = null;
    for (const m of [...this.curtains, this.plume]) m.visible = false;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aMist.needsUpdate = true;
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
  // a tiny ring where a droplet falls back into the water
  drop(x, y, z) { this.rings.add(x, y + 0.02, z, 0, 0, 0.6 + Math.random() * 0.4, 0.15, 0.7 + Math.random() * 0.5, 0.35); }
  update(dt) { this.foam.update(dt, true); this.rings.update(dt, false); }
  clear() { this.foam.clear(); this.rings.clear(); this.acc = 0; this.rt = 0; }
}
