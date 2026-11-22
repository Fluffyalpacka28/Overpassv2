import * as THREE from 'three';

// Post-processing ("Visual filter" in Settings): the scene is drawn into an HDR buffer, then finished in a couple of cheap passes.
//  - bloom: bright things (sun glints, headlights, neon, lava, chrome) glow softly. Dual-filter blur over a mip chain at
//    half resolution and below, so it stays fast on phones.
//  - the game's own tone mapping (as with the filter off), then grading: a gentle contrast curve, richer colour, warm highlights and cool shadows
//  - light sharpening, a faint lens colour fringe toward the corners, a soft vignette and fine film grain (which also hides banding)
//  - god rays: shafts of light from the sun when it's on screen, cut by trees, buildings and hills
// Two looks: 'cinematic' (filmic, warm, subtle) and 'vivid' (punchier colour and glow). Not used in VR.

const LOOKS = {
  cinematic: { bloom: 0.3, thr: 0.76, knee: 0.28, contrast: 1.1, sat: 1.14, warm: 0.028, cool: 0.035, vig: 0.2, grain: 0.028, ca: 0.0016, sharp: 0.32, lift: 0.006 },
  // photo mode extras
  warm: { bloom: 0.38, thr: 0.72, knee: 0.3, contrast: 1.08, sat: 1.06, warm: 0.085, cool: 0.0, vig: 0.26, grain: 0.03, ca: 0.0014, sharp: 0.3, lift: 0.012 },
  noir: { bloom: 0.25, thr: 0.78, knee: 0.3, contrast: 1.28, sat: 0.0, warm: 0.0, cool: 0.0, vig: 0.42, grain: 0.06, ca: 0.0, sharp: 0.45, lift: 0.02 },
  vivid: { bloom: 0.42, thr: 0.7, knee: 0.3, contrast: 1.16, sat: 1.28, warm: 0.02, cool: 0.03, vig: 0.15, grain: 0.018, ca: 0.0012, sharp: 0.4, lift: 0.0 },
};

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// bright parts only, with a soft knee so the glow fades in rather than switching on
const BRIGHT = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr, uKnee; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25; c = min(c, vec3(24.0)); // tame single blown-out pixels so they don't flicker
  // the scene is already tone-mapped (0..1, linear): near-white things glow, lamps and screens that skip tone mapping glow more
  float br = max(c.r, max(c.g, c.b)), k = smoothstep(uThr, uThr + uKnee, br) * (1.0 + max(br - 1.0, 0.0));
  gl_FragColor = vec4(c * k, 1.0);
}`;
// dual-filter (Kawase) blur: downsample ...
const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv - h).rgb + texture2D(tSrc, vUv + h).rgb + texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb + texture2D(tSrc, vUv - vec2(h.x, -h.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;
// ... and upsample, adding the level above
const UP = `uniform sampler2D tSrc, tAdd; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb
         + texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb * uMix, 1.0);
}`;
// god rays: the bright sky right around the sun ...
const RAYMASK = `uniform sampler2D tSrc; uniform vec2 uSun; uniform float uAspect; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0); float near = 1.0 - smoothstep(0.0, 0.55, length(d)); near *= near;
  gl_FragColor = vec4(c * smoothstep(0.62, 0.97, l) * near, 1.0);
}`;
// ... smeared out along lines from the sun, so trees, buildings and hills cut shafts of light through it
const RAYBLUR = `uniform sampler2D tSrc; uniform vec2 uSun; varying vec2 vUv;
void main() {
  vec2 st = (uSun - vUv) / 40.0 * 0.9; vec2 p = vUv; vec3 acc = vec3(0.0); float w = 1.0, ws = 0.0;
  for (int i = 0; i < 40; i++) { acc += texture2D(tSrc, p).rgb * w; ws += w; w *= 0.955; p += st; }
  gl_FragColor = vec4(acc / ws * 1.6, 1.0);
}`;
const FINAL = `uniform sampler2D tScene, tBloom, tRays; uniform vec3 uRayCol; uniform vec2 uTexel, uRes; uniform float uExposure, uBloom, uContrast, uSat, uWarm, uCool, uVig, uGrain, uCA, uSharp, uLift, uTime, uBlur, uUnder; varying vec2 vUv;
vec3 aces(vec3 x) { // ACES fitted (same curve the game used before)
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = IN * x; vec3 a = x * (x + 0.0245786) - 0.000090537, b = x * (0.983729 * x + 0.4329510) + 0.238081; return clamp(OUT * (a / b), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // under water: the picture wobbles gently, as if through moving water
  vec2 U = vUv + vec2(sin(vUv.y * 26.0 + uTime * 2.1) + sin(vUv.x * 17.0 - uTime * 1.3) * 0.5, cos(vUv.x * 21.0 + uTime * 1.7)) * 0.0022 * uUnder;
  vec2 d = U - 0.5; float r2 = dot(d, d);
  // a faint colour fringe toward the corners
  vec2 ca = d * uCA * (0.4 + r2 * 4.0);
  vec3 c = vec3(texture2D(tScene, U + ca).r, texture2D(tScene, U).g, texture2D(tScene, U - ca).b);
  // motion blur at speed: streaks pointing out from the middle of the screen (where you're heading), sharp in the centre
  if (uBlur > 0.01) {
    vec2 st = d * uBlur * 0.055 * smoothstep(0.02, 0.35, r2 * 4.0); vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i <= 6; i++) { float t = float(i) / 6.0, w = 1.0 - t * 0.6; acc += texture2D(tScene, U - st * t).rgb * w; wsum += w; }
    c = acc / wsum;
  }
  // light sharpening (contrast-adaptive: less where it's already contrasty, so edges don't ring)
  vec3 n = texture2D(tScene, U + vec2(uTexel.x, 0.0)).rgb + texture2D(tScene, U - vec2(uTexel.x, 0.0)).rgb + texture2D(tScene, U + vec2(0.0, uTexel.y)).rgb + texture2D(tScene, U - vec2(0.0, uTexel.y)).rgb;
  vec3 hp = c - n * 0.25; float lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(c + hp * uSharp / (1.0 + abs(dot(hp, vec3(0.333))) * 6.0 + lc * 0.5), vec3(0.0));
  c += texture2D(tBloom, U).rgb * uBloom;
  c += texture2D(tRays, U).rgb * uRayCol;
  c = clamp(c, 0.0, 1.0);
  // grading in display space
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  vec3 g = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  g = clamp((g - 0.5) * uContrast + 0.5, 0.0, 1.0); g = mix(g, g * g * (3.0 - 2.0 * g), (uContrast - 1.0) * 1.5); // gentle S-curve
  float gl = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g += vec3(uWarm, uWarm * 0.5, -uWarm * 0.2) * smoothstep(0.5, 1.0, gl) * (1.0 - smoothstep(0.75, 1.0, g.b - max(g.r, g.g) + 0.75)); // warm highlights (skies stay blue)
  g += vec3(-uCool * 0.5, uCool * 0.1, uCool) * (1.0 - smoothstep(0.0, 0.45, gl)); // cool shadows
  g = mix(g, g * vec3(0.72, 0.96, 1.02) + vec3(0.0, 0.03, 0.05), uUnder * 0.6); // under water: blue-green
  g = g * (1.0 - uLift) + uLift;
  g *= 1.0 - (uVig + uUnder * 0.25) * smoothstep(0.2, 0.95, r2 * 2.2);
  c = pow(clamp(g, 0.0, 1.0), vec3(2.2));
  c = toSRGB(c);
  // grain (animated, stronger in the mid-tones), doubles as dither against banding in the sky
  float gr = hash(U * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
  c += gr * uGrain * (0.35 + 0.65 * (1.0 - abs(gl - 0.5) * 2.0)) + (hash(U * uRes.yx + 3.7) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer; this.w = 0; this.h = 0; this.q = null; this.t = 0; this.blur = 0; this.under = 0;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.sc = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.sc.add(this.quad);
    const mk = (frag, u) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false, toneMapped: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1 }, uKnee: { value: 0.5 } });
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.mFinal = mk(FINAL, { tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uBloom: { value: 0.5 },
      uContrast: { value: 1 }, uSat: { value: 1 }, uWarm: { value: 0 }, uCool: { value: 0 }, uVig: { value: 0 }, uGrain: { value: 0 }, uCA: { value: 0 }, uSharp: { value: 0 }, uLift: { value: 0 }, uTime: { value: 0 }, uBlur: { value: 0 }, uUnder: { value: 0 } });
    this.mRayMask = mk(RAYMASK, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } });
    this.mRayBlur = mk(RAYBLUR, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() } });
    this.mFinal.uniforms.tRays = { value: null }; this.mFinal.uniforms.uRayCol = { value: new THREE.Color(0, 0, 0) };
    this.sun = { x: 0.5, y: 0.5, k: 0 }; // where the sun is on screen (0..1) and how strongly to draw its rays
    this._v = new THREE.Vector2();
  }
  // render targets: the scene (HDR, multisampled) at full size; the bloom chain from half size down
  alloc(w, h, low) {
    this.dispose(); this.w = w; this.h = h; this.q = low;
    const hf = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { ...hf, depthBuffer: true, samples: this.r.capabilities.isWebGL2 ? (low ? 2 : 4) : 0 });
    // three tone-maps materials only when drawing to the screen (or an XR target). Flagging the scene buffer as one makes every
    // material come out exactly as it would on screen (skies, lamps and screens that skip tone mapping still do), just kept linear
    this.rtScene.isXRRenderTarget = true;
    this.chain = []; let cw = Math.max(1, w >> 1), ch = Math.max(1, h >> 1);
    const levels = low ? 4 : 5;
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2); this.rayA = new THREE.WebGLRenderTarget(qw, qh, hf); this.rayB = new THREE.WebGLRenderTarget(qw, qh, hf);
    for (let i = 0; i < levels; i++) { this.chain.push({ down: new THREE.WebGLRenderTarget(cw, ch, hf), up: new THREE.WebGLRenderTarget(cw, ch, hf) }); cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1); }
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.sc, this.cam); }
  render(scene, camera, look = 'cinematic', low = false, dt = 0.016) {
    const r = this.r, L = LOOKS[look] || LOOKS.cinematic;
    r.getDrawingBufferSize(this._v); const w = this._v.x | 0, h = this._v.y | 0;
    if (w !== this.w || h !== this.h || low !== this.q || !this.rtScene) this.alloc(w, h, low);
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear;
    // 1. the scene, untouched, into the HDR buffer (no tone mapping yet)
    r.setRenderTarget(this.rtScene); r.clear(); r.render(scene, camera);
    r.autoClear = true;
    // 2. bloom: bright pass, blur down the chain, then back up
    const C = this.chain;
    this.mBright.uniforms.tSrc.value = this.rtScene.texture; this.mBright.uniforms.uTexel.value.set(1 / w, 1 / h); this.mBright.uniforms.uThr.value = L.thr; this.mBright.uniforms.uKnee.value = L.knee;
    this.pass(this.mBright, C[0].down);
    for (let i = 1; i < C.length; i++) { const s = C[i - 1].down; this.mDown.uniforms.tSrc.value = s.texture; this.mDown.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); this.pass(this.mDown, C[i].down); }
    let src = C[C.length - 1].down;
    for (let i = C.length - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = src.texture; this.mUp.uniforms.tAdd.value = C[i].down.texture; this.mUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); this.mUp.uniforms.uMix.value = 1;
      this.pass(this.mUp, C[i].up); src = C[i].up;
    }
    // 2b. god rays when the sun is in view
    const sun = this.sun, rays = sun.k > 0.01 && look !== 'off';
    if (rays) {
      this.mRayMask.uniforms.tSrc.value = this.rtScene.texture; this.mRayMask.uniforms.uSun.value.set(sun.x, sun.y); this.mRayMask.uniforms.uAspect.value = w / h; this.pass(this.mRayMask, this.rayA);
      this.mRayBlur.uniforms.tSrc.value = this.rayA.texture; this.mRayBlur.uniforms.uSun.value.set(sun.x, sun.y); this.pass(this.mRayBlur, this.rayB);
    }
    this.mFinal.uniforms.tRays.value = rays ? this.rayB.texture : src.texture; this.mFinal.uniforms.uRayCol.value.setRGB(1.0, 0.86, 0.62).multiplyScalar(rays ? sun.k * (look === 'vivid' ? 0.3 : 0.24) : 0);
    // 3. finish to the screen
    this.t += dt; const F = this.mFinal.uniforms;
    F.tScene.value = this.rtScene.texture; F.tBloom.value = src.texture; F.uTexel.value.set(1 / w, 1 / h); F.uRes.value.set(w, h);
    F.uBloom.value = L.bloom; F.uContrast.value = L.contrast; F.uSat.value = L.sat; F.uWarm.value = L.warm; F.uCool.value = L.cool;
    F.uVig.value = L.vig; F.uGrain.value = L.grain; F.uCA.value = L.ca; F.uSharp.value = low ? L.sharp * 0.6 : L.sharp; F.uLift.value = L.lift; F.uTime.value = this.t % 100; F.uBlur.value = this.blur; F.uUnder.value = this.under;
    this.pass(this.mFinal, null);
    r.setRenderTarget(prevRT); r.autoClear = prevAuto;
  }
  dispose() { if (this.rayA) { this.rayA.dispose(); this.rayB.dispose(); } if (this.rtScene) this.rtScene.dispose(); if (this.chain) for (const c of this.chain) { c.down.dispose(); c.up.dispose(); } this.rtScene = null; this.chain = null; }
}
