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
  // a big splash: hitting the water fast or landing in it from the air (k 0..1 = how hard)
  // a crown of drops thrown up and out, a tall white plume in the middle, and a cloud of mist
  bigSplash(car, wy, k = 1) {
    const R = Math.random, vx = (car.vx || 0) * 0.3, vz = (car.vz || 0) * 0.3, n = 140 + Math.round(200 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.3, r = 1.6 + R() * 1.4, s = 3 + R() * (4 + 6 * k);
      this._spawn(car.x + Math.cos(a) * r, wy + 0.05, car.z + Math.sin(a) * r, Math.cos(a) * s + vx, 5 + R() * (5 + 9 * k), Math.sin(a) * s + vz,
        1 + R() * 0.9, 0.09 + R() * 0.16, 1, wy - 0.05, false);
    }
    for (let i = 0; i < 60 + 60 * k; i++) {
      const a = R() * 6.283, r = R() * 1.2;
      this._spawn(car.x + Math.cos(a) * r, wy + 0.2, car.z + Math.sin(a) * r, Math.cos(a) * 1.2 + vx, 8 + R() * (6 + 10 * k), Math.sin(a) * 1.2 + vz,
        1.1 + R() * 0.8, 0.12 + R() * 0.2, 1, wy - 0.05, false);
    }
    for (let i = 0; i < 26 + 20 * k; i++) {
      const a = R() * 6.283, r = R() * 3;
      this._spawn(car.x + Math.cos(a) * r, wy + 0.4 + R() * 2.5 * k, car.z + Math.sin(a) * r, Math.cos(a) * 2.2 + vx, 1.5 + R() * 4 * (0.5 + k), Math.sin(a) * 2.2 + vz,
        1.6 + R() * 1.2, 1.6 + R() * 1.8 + 2 * k, 0.45, wy - 0.05, true);
    }
  }
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

// ---------- the wake: water being cut ----------
// A ribbon that follows the path the car (or boat) took. In its own coordinates u runs across it (-1..1) and v is metres behind the bow,
// so the shader can draw: two bright foam arms spreading out in a V (about the real 19.5 degree Kelvin angle), white churned water
// right behind the stern, faint wave crests between the arms and a darker band of disturbed water. The foam texture is pinned to the
// world, so the foam stays where it was made while the V pattern travels with the car, like a real wake.
const WAKE_V = `
attribute vec2 wuv; attribute float wage; attribute float wk; attribute float whw;
varying vec2 vUv; varying float vAge; varying float vK; varying vec2 vW; varying float vHW;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = wuv; vAge = wage; vK = wk; vHW = whw;
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const WAKE_F = `
uniform sampler2D uNoise; uniform vec3 uLight; uniform float uLife, uBody, uHalf;
varying vec2 vUv; varying float vAge; varying float vK; varying vec2 vW; varying float vHW;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float a = abs(vUv.x), m = a * vHW, edge = vHW - m;           // m: metres from the centre line, edge: metres in from the arm
  float life = 1.0 - smoothstep(0.0, 1.0, vAge / uLife), young = exp(-vAge * 0.8);
  float n = texture2D(uNoise, vW / 7.0).r, n2 = texture2D(uNoise, vW / 2.2 + vec2(0.31, 0.67)).r, n3 = texture2D(uNoise, vW / 0.9).r;
  float rag = n * 0.55 + n2 * 0.35 + n3 * 0.25;
  // the two arms: a ragged foam line along each outer edge, a metre or so wide, breaking up as it ages
  float aw = 0.7 + vAge * 0.35;
  float arm = smoothstep(0.0, 0.25 * aw, edge) * (1.0 - smoothstep(0.35 * aw, aw, edge));
  arm *= smoothstep(0.45, 0.78, rag + 0.3 * young - vAge * 0.045);
  // churned white water straight behind the stern, about as wide as the car, spreading slowly (not under the car itself)
  float behind = smoothstep(uBody, uBody + 2.0, vUv.y), cw = uHalf * 1.1 + vAge * 0.55;
  float churn = (1.0 - smoothstep(cw * 0.45, cw, m)) * behind * young * smoothstep(0.32, 0.7, rag + 0.15);
  float scar = (1.0 - smoothstep(cw * 0.5, cw * 1.6, m)) * behind * exp(-vAge * 0.3) * smoothstep(0.55, 0.85, n2) * 0.45; // long lacy scar down the middle
  // faint curved transverse crests between the arms, broken up by the noise
  float crest = pow(0.5 + 0.5 * sin(vUv.y * 0.8 + a * a * 2.6), 14.0) * (1.0 - smoothstep(0.55, 0.95, a)) * behind * smoothstep(0.4, 0.7, n) * 0.22;
  float foam = clamp(max(max(arm, churn), scar) + crest, 0.0, 1.0) * life * vK;
  // inside the V the water is cut up: a touch darker, strongest along the middle
  float cut = (1.0 - smoothstep(0.85, 1.0, a)) * life * vK * (0.08 + 0.14 * (1.0 - smoothstep(0.0, cw * 2.5, m))) * (0.7 + 0.3 * n);
  vec3 foamC = vec3(0.93, 0.96, 0.98) * uLight, cutC = vec3(0.04, 0.14, 0.18) * uLight;
  float alpha = max(foam, cut);
  gl_FragColor = vec4(mix(cutC, foamC, foam / max(alpha, 0.001)), alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
let NOISE = null;
function noiseTex() {
  if (NOISE) return NOISE;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S); let sd = 77; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 420; i++) { const px = r() * S, py = r() * S, rad = 2 + r() * 12; for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad); g.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.25})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2); } }
  NOISE = new THREE.CanvasTexture(c); NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping; NOISE.colorSpace = THREE.NoColorSpace; return NOISE;
}
const WMAX = 220, _wl = new THREE.Color(1, 1, 1);
// ---------- idle hull ripples: rounded-rectangle rings that swell out from the car's outline while it sits on the water ----------
// drawn with the same ragged foam look as the wake (noise broken edges, fades as it spreads), instead of round rings per wheel
const HR_V = `
attribute float rage; attribute float racr; attribute float rk;
varying float vAge; varying float vAcr; varying float vK; varying vec2 vW;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vAge = rage; vAcr = racr; vK = rk;
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const HR_F = `
uniform sampler2D uNoise; uniform vec3 uLight;
varying float vAge; varying float vAcr; varying float vK; varying vec2 vW;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float n = texture2D(uNoise, vW / 6.0).r, n2 = texture2D(uNoise, vW / 1.9 + vec2(0.31, 0.67)).r, n3 = texture2D(uNoise, vW / 0.8).r;
  float rag = n * 0.5 + n2 * 0.35 + n3 * 0.3;
  float life = pow(1.0 - vAge, 1.6);
  // a soft crest: brightest a little outside the middle of the band, ragged and breaking up as it spreads
  float x = vAcr * 0.5 + 0.5, crest = smoothstep(0.0, 0.55, x) * (1.0 - smoothstep(0.62, 1.0, x));
  float foam = crest * smoothstep(0.42, 0.78, rag + 0.32 * (1.0 - vAge)) * life * vK;
  float shade = (1.0 - smoothstep(0.0, 0.6, x)) * life * vK * 0.12 * (0.7 + 0.3 * n); // the trough just inside it, a touch darker
  vec3 foamC = vec3(0.92, 0.96, 0.98) * uLight, cutC = vec3(0.04, 0.14, 0.18) * uLight;
  float alpha = max(foam * 0.85, shade);
  gl_FragColor = vec4(mix(cutC, foamC, foam / max(alpha, 0.001)), alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const HR_MAX = 6, HR_SEG = 64;
class HullRings {
  constructor(scene, light) {
    this.scene = scene; this.list = [];
    const n = HR_MAX * (HR_SEG + 1) * 2, g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.age = new Float32Array(n); this.acr = new Float32Array(n); this.k = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('rage', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('racr', new THREE.BufferAttribute(this.acr, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('rk', new THREE.BufferAttribute(this.k, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let r = 0; r < HR_MAX; r++) { const b = r * (HR_SEG + 1) * 2; for (let i = 0; i < HR_SEG; i++) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setIndex(idx); g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise: { value: null }, uLight: { value: null } }]), vertexShader: HR_V, fragmentShader: HR_F, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mat.uniforms.uNoise.value = noiseTex(); this.mat.uniforms.uLight.value = light;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false; scene.add(this.mesh);
  }
  // A, B: half length / half width of the hull; k: strength (stronger when sitting still)
  add(x, y, z, yaw, A, B, k) { if (this.list.length >= HR_MAX) this.list.shift(); this.list.push({ x, y, z, s: Math.sin(yaw), c: Math.cos(yaw), A, B, k, t: 0, life: 3.2 + Math.random() * 0.8 }); }
  update(dt) {
    const L = this.list; for (let i = L.length - 1; i >= 0; i--) if ((L[i].t += dt) >= L[i].life) L.splice(i, 1);
    const pos = this.pos, age = this.age, acr = this.acr, kk = this.k; let v = 0;
    for (const r of L) {
      const a = r.t / r.life, grow = 0.15 + 3.6 * (1 - Math.pow(1 - a, 2)), w = 0.35 + a * 0.9; // spreads quickly, then slows; the band widens as it goes
      for (let i = 0; i <= HR_SEG; i++) {
        const th = i / HR_SEG * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th), pe = 0.5; // superellipse (n = 4): a rounded rectangle
        const ex = Math.sign(st) * Math.pow(Math.abs(st), pe), ez = Math.sign(ct) * Math.pow(Math.abs(ct), pe);
        for (let side = 0; side < 2; side++) {
          const o = grow + (side ? w / 2 : -w / 2), lx = ex * (r.B + o), lz = ez * (r.A + o), j = v * 3;
          pos[j] = r.x + lx * r.c + lz * r.s; pos[j + 1] = r.y; pos[j + 2] = r.z - lx * r.s + lz * r.c;
          age[v] = a; acr[v] = side ? 1 : -1; kk[v] = r.k; v++;
        }
      }
    }
    const g = this.mesh.geometry; g.setDrawRange(0, L.length * HR_SEG * 6);
    for (const k of ['position', 'rage', 'racr', 'rk']) g.attributes[k].needsUpdate = true;
    this.mesh.visible = L.length > 0;
  }
  clear() { this.list.length = 0; this.mesh.visible = false; this.mesh.geometry.setDrawRange(0, 0); }
}
export class WaterWake {
  // opts: back = metres from the centre to the bow/stern, half = half width at the bow, life = seconds the wake lasts
  constructor(scene, opts = {}) {
    this.scene = scene; this.o = { back: opts.back ?? 1.9, half: opts.half ?? 0.95, life: opts.life ?? 7 };
    this.rings = new Layer(scene, RN, ringTex(), 5, -4);
    this.rt = 0; this.acc = 0; this.n = 0; this.head = 0; this.dist = 0; this.last = null;
    // ring buffer of trail points: x, y, z, right-vector x/z, distance along the path, birth time, strength, starts-a-new-piece
    this.P = { x: new Float32Array(WMAX), y: new Float32Array(WMAX), z: new Float32Array(WMAX), rx: new Float32Array(WMAX), rz: new Float32Array(WMAX), d: new Float32Array(WMAX), t: new Float32Array(WMAX), k: new Float32Array(WMAX), sp: new Float32Array(WMAX), brk: new Uint8Array(WMAX) };
    this.time = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(WMAX * 2 * 3); this.uv = new Float32Array(WMAX * 2 * 2); this.age = new Float32Array(WMAX * 2); this.kk = new Float32Array(WMAX * 2); this.hw = new Float32Array(WMAX * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('wuv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('wage', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('wk', new THREE.BufferAttribute(this.kk, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('whw', new THREE.BufferAttribute(this.hw, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i + 1 < WMAX; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx); g.setDrawRange(0, 0);
    this.light = new THREE.Color(1, 1, 1);
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise: { value: null }, uLight: { value: null }, uLife: { value: this.o.life }, uBody: { value: this.o.back * 2 }, uHalf: { value: this.o.half } }]), vertexShader: WAKE_V, fragmentShader: WAKE_F, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mat.uniforms.uNoise.value = noiseTex(); this.mat.uniforms.uLight.value = this.light;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
    this.hull = new HullRings(scene, this.light);
  }
  setLight(c) { if (c) this.light.setRGB(Math.min(1.1, c.r), Math.min(1.1, c.g), Math.min(1.1, c.b)); }
  push(x, y, z, rx, rz, k, sp, brk) {
    const P = this.P, i = this.head; this.head = (this.head + 1) % WMAX; this.n = Math.min(WMAX, this.n + 1);
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.rx[i] = rx; P.rz[i] = rz; P.d[i] = this.dist; P.t[i] = this.time; P.k[i] = k; P.sp[i] = sp; P.brk[i] = brk ? 1 : 0;
  }
  emit(car, dt, wy) {
    const sp = Math.abs(car.speed || 0), yaw = car.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), dir = (car.speed || 0) >= 0 ? 1 : -1, k = Math.min(1, sp / 12), y = wy + 0.07;
    const bx = car.x + fx * this.o.back * dir, bz = car.z + fz * this.o.back * dir; // the wake starts at the bow and runs along the sides
    if (sp > 1.2) {
      const L = this.last, moved = L ? Math.hypot(bx - L[0], bz - L[1]) : 1e9, spacing = Math.max(0.6, sp * 0.045);
      if (moved > 8) { this.push(bx, y, bz, rx * dir, rz * dir, k, sp, true); this.last = [bx, bz]; }
      else if (moved >= spacing) { this.dist += moved; this.push(bx, y, bz, rx * dir, rz * dir, k, sp, false); this.last = [bx, bz]; }
      this.cur = { x: bx, y, z: bz, rx: rx * dir, rz: rz * dir, k, sp };
    } else { this.cur = null; this.last = null; }
    // while idling or crawling: soft rounded rings swell out from the hull's outline (and droplets landing, see drop())
    if (sp < 4) {
      this.rt -= dt * (0.75 + sp * 0.25);
      if (this.rt <= 0) { this.rt += 1; this.hull.add(car.x, y + 0.015, car.z, yaw, this.o.back * 0.95, this.o.half * 1.05, 0.9 - sp * 0.15); }
    } else this.rt = 0.3;
    this.emitted = 2;
  }
  // a tiny ring where a droplet falls back into the water
  drop(x, y, z) { this.rings.add(x, y + 0.02, z, 0, 0, 0.6 + Math.random() * 0.4, 0.15, 0.7 + Math.random() * 0.5, 0.35); }
  update(dt) {
    this.time += dt; this.rings.update(dt, false); this.hull.update(dt);
    if (this.emitted > 0) this.emitted--; else this.cur = null;
    const P = this.P, life = this.o.life, half = this.o.half, pos = this.pos, uv = this.uv, age = this.age, kk = this.kk;
    let v = 0; // vertex pairs written, newest first
    const head = this.cur ? this.dist + (this.last ? Math.hypot(this.cur.x - this.last[0], this.cur.z - this.last[1]) : 0) : this.dist;
    const put = (x, y, z, rx, rz, d, ag, k, sp) => {
      if (v >= WMAX) return; const spread = 0.354 * Math.min(sp, 22) * ag; // the arms open at the Kelvin angle as the water behind ages
      const hw = half + spread, o = v * 6;
      pos[o] = x - rx * hw; pos[o + 1] = y; pos[o + 2] = z - rz * hw; pos[o + 3] = x + rx * hw; pos[o + 4] = y; pos[o + 5] = z + rz * hw;
      const behind = Math.max(0, head - d); uv[v * 4] = -1; uv[v * 4 + 1] = behind; uv[v * 4 + 2] = 1; uv[v * 4 + 3] = behind;
      age[v * 2] = age[v * 2 + 1] = ag; kk[v * 2] = kk[v * 2 + 1] = k; this.hw[v * 2] = this.hw[v * 2 + 1] = hw; v++;
    };
    if (this.cur) put(this.cur.x, this.cur.y, this.cur.z, this.cur.rx, this.cur.rz, head, 0, this.cur.k, this.cur.sp);
    for (let c = 0; c < this.n; c++) {
      const i = (this.head - 1 - c + WMAX) % WMAX, ag = this.time - P.t[i];
      if (ag > life) break;
      put(P.x[i], P.y[i], P.z[i], P.rx[i], P.rz[i], P.d[i], ag, P.k[i], P.sp[i]);
      if (P.brk[i]) break; // the trail jumped (left the water and came back): stop this piece here
    }
    const g = this.mesh.geometry; g.setDrawRange(0, Math.max(0, v - 1) * 6);
    for (const a of ['position', 'wuv', 'wage', 'wk', 'whw']) g.attributes[a].needsUpdate = true;
    this.mesh.visible = v > 1;
  }
  clear() { this.rings.clear(); this.hull.clear(); this.n = 0; this.head = 0; this.cur = null; this.last = null; this.rt = 0; this.mesh.geometry.setDrawRange(0, 0); this.mesh.visible = false; }
  dispose() { this.clear(); for (const m of [this.mesh, this.rings.mesh, this.hull.mesh]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}
