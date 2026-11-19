import * as THREE from 'three';

// Real weather in World Drive. Every 10 minutes (or after a long drive / a teleport) it asks Open-Meteo (free, no key) what
// the weather is right now where you are, then eases the world into it: grey skies and dimmer light when it's overcast,
// rain streaks blowing with the real wind, thicker fog, snow, and lightning with thunder in storms. Headlights and street
// lamps come on early when it's gloomy. It can also be forced (rain, storm, snow, clear) or switched off in Settings.
const URL = (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cl01 = v => Math.max(0, Math.min(1, v));

// WMO weather codes → what to show
export function codeInfo(c) {
  c = c | 0;
  const W = (label, icon, o = {}) => ({ label, icon, rain: 0, snow: 0, cloud: 0, fog: 0, storm: 0, ...o });
  if (c === 0) return W('Clear', '☀️');
  if (c === 1) return W('Mostly clear', '🌤️', { cloud: 0.15 });
  if (c === 2) return W('Partly cloudy', '⛅', { cloud: 0.4 });
  if (c === 3) return W('Overcast', '☁️', { cloud: 0.85 });
  if (c === 45 || c === 48) return W('Fog', '🌫️', { cloud: 0.7, fog: 1 });
  if (c >= 51 && c <= 57) return W(c >= 56 ? 'Freezing drizzle' : 'Drizzle', '🌦️', { cloud: 0.85, rain: c === 51 ? 0.18 : c === 53 ? 0.28 : 0.38, fog: 0.25 });
  if (c >= 61 && c <= 67) return W(c >= 66 ? 'Freezing rain' : c === 61 ? 'Light rain' : c === 63 ? 'Rain' : 'Heavy rain', '🌧️', { cloud: 0.95, rain: c === 61 || c === 66 ? 0.42 : c === 63 ? 0.68 : 0.95, fog: 0.3 });
  if (c >= 71 && c <= 77) return W(c === 71 ? 'Light snow' : c === 75 ? 'Heavy snow' : 'Snow', '🌨️', { cloud: 0.9, snow: c === 71 || c === 77 ? 0.4 : c === 73 ? 0.7 : 1, fog: 0.35 });
  if (c >= 80 && c <= 82) return W(c === 80 ? 'Showers' : c === 81 ? 'Heavy showers' : 'Downpour', '🌧️', { cloud: 0.85, rain: c === 80 ? 0.5 : c === 81 ? 0.75 : 1, fog: 0.25 });
  if (c === 85 || c === 86) return W('Snow showers', '🌨️', { cloud: 0.85, snow: c === 85 ? 0.5 : 0.85, fog: 0.3 });
  if (c >= 95) return W(c === 95 ? 'Thunderstorm' : 'Thunderstorm with hail', '⛈️', { cloud: 1, rain: 0.9, storm: 1, fog: 0.35 });
  return W('Cloudy', '☁️', { cloud: 0.6 });
}
const FORCED = { clear: 0, rain: 63, storm: 95, snow: 73, fog: 45 };

const RAIN_V = `
attribute vec4 aSeed; attribute float aEnd;
uniform float uTime, uFall, uLen, uAmount, uInside; uniform vec3 uCenter, uBox; uniform vec2 uWind;
varying float vA, vEnd;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 v = vec3(uWind.x, -uFall, uWind.y);
  vec3 p = aSeed.xyz * uBox + v * uTime * (0.85 + 0.3 * aSeed.w);
  vec3 rel = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;          // drops stay put in the world and wrap around you
  vec3 w = uCenter + rel - v * (aEnd * uLen / uFall);
  float r = length(rel.xz) / (0.5 * uBox.x);
  vA = (1.0 - smoothstep(0.55, 1.0, r)) * step(aSeed.w, uAmount);
  if (uInside > 0.5 && length(rel.xz) < 2.0 && rel.y < 1.2) vA = 0.0;   // nothing falling through the roof in the cockpit
  vEnd = aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}`;
const RAIN_F = `
uniform vec3 uColor; uniform float uOpacity; varying float vA, vEnd;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(uColor, uOpacity * vA * (0.25 + 0.75 * vEnd));
}`;
const SNOW_V = `
attribute vec4 aSeed;
uniform float uTime, uFall, uAmount, uSize, uInside; uniform vec3 uCenter, uBox; uniform vec2 uWind;
varying float vA;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec3 v = vec3(uWind.x, -uFall, uWind.y) * (0.7 + 0.6 * aSeed.w);
  vec3 p = aSeed.xyz * uBox + v * uTime;
  p.x += sin(uTime * 1.3 + aSeed.w * 40.0) * 0.6; p.z += cos(uTime * 1.1 + aSeed.x * 40.0) * 0.6;   // flakes flutter
  vec3 rel = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
  vA = (1.0 - smoothstep(0.55, 1.0, length(rel.xz) / (0.5 * uBox.x))) * step(aSeed.w, uAmount);
  if (uInside > 0.5 && length(rel.xz) < 2.0 && rel.y < 1.2) vA = 0.0;
  vec4 mv = viewMatrix * vec4(uCenter + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + 0.8 * aSeed.y) * projectionMatrix[1][1] * 300.0 / max(0.5, -mv.z);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}`;
const SNOW_F = `
uniform vec3 uColor; uniform float uOpacity; varying float vA;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d));
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor, uOpacity * vA * a);
}`;

let rs = 4242; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
function seeds(n, perDrop) {
  const s = new Float32Array(n * perDrop * 4), e = new Float32Array(n * perDrop);
  for (let i = 0; i < n; i++) { const a = rnd(), b = rnd(), c = rnd(), d = rnd(); for (let k = 0; k < perDrop; k++) { const j = i * perDrop + k; s.set([a, b, c, d], j * 4); e[j] = k; } }
  return { s, e };
}

export class Weather {
  constructor(scene, opts = {}) {
    this.scene = scene; this.o = opts;
    this.now = null; this.place = null; this.status = 'idle'; this.lastFetch = -1e9; this.at = null; this.t = 0;
    this.target = codeInfo(0); this.cur = { rain: 0, snow: 0, cloud: 0, fog: 0, storm: 0 }; this.wind = new THREE.Vector2(0.8, 0.4);
    this.flash = 0; this.nextBolt = 8; this.thunder = []; this.fogMul = 1; this.gloom = 0;
    this.box = new THREE.Vector3(70, 34, 70);
    const common = () => ({ uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: this.box }, uWind: { value: new THREE.Vector2() }, uAmount: { value: 0 }, uInside: { value: 0 }, uColor: { value: new THREE.Color('#b9c4d2') }, uOpacity: { value: 0.42 } });
    { // rain: one line per drop
      const N = 7000, { s, e } = seeds(N, 2), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4)); g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      const m = new THREE.ShaderMaterial({ uniforms: { ...common(), uFall: { value: 15 }, uLen: { value: 1.1 } }, vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, fog: false });
      this.rain = new THREE.LineSegments(g, m); this.rain.frustumCulled = false; this.rain.renderOrder = 5; this.rain.visible = false; scene.add(this.rain);
    }
    { // snow: points
      const N = 5000, { s } = seeds(N, 1), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      const u = common(); u.uColor.value.set('#ffffff'); u.uOpacity.value = 0.9;
      const m = new THREE.ShaderMaterial({ uniforms: { ...u, uFall: { value: 1.6 }, uSize: { value: 0.09 } }, vertexShader: SNOW_V, fragmentShader: SNOW_F, transparent: true, depthWrite: false, fog: false });
      this.snow = new THREE.Points(g, m); this.snow.frustumCulled = false; this.snow.renderOrder = 5; this.snow.visible = false; scene.add(this.snow);
    }
    this._g = new THREE.Color(); this._w = new THREE.Color('#ffffff');
  }
  setQuality(q) { this.lowQ = q === 'low'; }
  // where you are; fetches when it's time (10 min, or 15 km+ from the last check)
  async check(lat, lon, force) {
    if (this.busy || lat == null) return;
    const far = this.at ? Math.hypot((lat - this.at[0]) * 111, (lon - this.at[1]) * 111 * Math.cos(lat * Math.PI / 180)) : 1e9;
    if (!force && performance.now() - this.lastFetch < (this.status === 'error' ? 120000 : 600000) && far < 15) return;
    this.busy = true; this.lastFetch = performance.now(); this.at = [lat, lon];
    try {
      const r = await fetch(URL(lat, lon), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), c = j && j.current; if (!c) throw new Error('no data');
      const prev = this.now && this.now.code;
      this.now = { code: c.weather_code | 0, temp: c.temperature_2m, precip: +c.precipitation || 0, cloud: +c.cloud_cover || 0, wind: +c.wind_speed_10m || 0, dir: +c.wind_direction_10m || 0, t: Date.now() };
      this.status = 'ok'; if (prev !== this.now.code && this.o.onChange) this.o.onChange(this.describe());
    } catch (e) { this.status = 'error'; console.warn('[overpass] weather:', e && e.message || e); }
    this.busy = false;
  }
  // what's shown right now (mode: 'real' | 'off' | 'clear' | 'rain' | 'storm' | 'snow' | 'fog')
  info(mode) {
    if (mode === 'off') return null;
    if (mode && mode !== 'real') return { ...codeInfo(FORCED[mode] ?? 0), forced: true };
    if (!this.now) return null;
    const i = codeInfo(this.now.code), n = this.now;
    i.cloud = Math.max(i.cloud, n.cloud / 100 * 0.9);
    if (n.precip > 0 && !i.snow) i.rain = Math.max(i.rain, Math.min(1, 0.25 + n.precip / 5));
    return i;
  }
  describe(mode = 'real') {
    const i = this.info(mode); if (!i) return mode === 'off' ? 'Weather effects off' : this.status === 'error' ? 'Weather unavailable right now' : 'Checking the weather…';
    const n = this.now; return `${i.icon} ${i.label}` + (!i.forced && n && n.temp != null ? ` · ${Math.round(n.temp)}°C / ${Math.round(n.temp * 9 / 5 + 32)}°F` : '') + (i.forced ? ' (set in Settings)' : '');
  }
  // every frame (World Drive). th: the day/night theme to darken in place. cam: world camera position. inside: cockpit view
  update(dt, th, cam, mode, on, inside) {
    this.t = (this.t + dt) % 900;
    const i = on ? this.info(mode) : null, T = i || { rain: 0, snow: 0, cloud: 0, fog: 0, storm: 0 }, cur = this.cur, k = 1 - Math.exp(-dt / 6);
    for (const key of ['rain', 'snow', 'cloud', 'fog', 'storm']) cur[key] += (T[key] - cur[key]) * k;
    // wind from the real reading (meteorological direction = where it blows from)
    const n = this.now, ws = i && !i.forced && n ? Math.min(14, n.wind) : 3, b = ((i && !i.forced && n ? n.dir : 250) + 180) * Math.PI / 180;
    this.wind.lerp(new THREE.Vector2(Math.sin(b) * ws * 0.5, -Math.cos(b) * ws * 0.5), k);
    // gloom: how grey and dark it gets
    const g = this.gloom = cl01(Math.max(cur.cloud * 0.5, cur.rain * 0.9, cur.snow * 0.6, cur.fog * 0.7, cur.storm));
    this.fogMul = 1 - 0.55 * cl01(cur.rain * 0.7 + cur.snow * 0.8 + cur.fog);
    // lightning
    if (cur.storm > 0.5 && on) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.nextBolt = 5 + Math.random() * 14; this.flash = 1; const far = Math.random(); this.thunder.push({ t: 0.4 + far * 3, v: 1 - far * 0.6 }); }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * (this.flash > 0.6 ? 7 : 2.5));
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.t * 60)) : 0;
    for (let q = this.thunder.length - 1; q >= 0; q--) { const tq = this.thunder[q]; if ((tq.t -= dt) <= 0) { this.thunder.splice(q, 1); this.o.onThunder && this.o.onThunder(tq.v); } }
    if (th && g > 0.002) {
      const gr = this._g, w = this._w, grey = (c, dark) => { const l = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * dark; gr.setRGB(l * 0.9, l * 0.95, l * 1.05); return gr; };
      th.sky[0].lerp(grey(th.sky[0], 0.62), g * 0.9); th.sky[1].lerp(grey(th.sky[1], 0.7), g * 0.85); th.fog.lerp(grey(th.fog, 0.7), g * 0.85);
      th.sun.lerp(grey(th.sun, 0.8), g * 0.7); th.cloudTint.lerp(grey(th.cloudTint, 0.55), g * 0.8);
      th.hemi[0].lerp(grey(th.hemi[0], 0.85), g * 0.6); th.ground.lerp(grey(th.ground, 0.8), g * 0.4);
      th.light *= 1 - 0.62 * g; th.hemiI *= 1 - 0.22 * g;
      th.dark = Math.max(th.dark, g * 0.35); th.lamp = Math.max(th.lamp, smooth(0.45, 0.8, g)); th.glow = Math.max(th.glow, g * 0.35);
    }
    if (th && fl > 0) { th.sky[0].lerp(w, fl * 0.55); th.sky[1].lerp(w, fl * 0.45); th.fog.lerp(w, fl * 0.35); th.light += fl * 2.2; th.hemiI += fl * 1.4; }
    // particles
    const amt = this.lowQ ? 0.45 : 1, rU = this.rain.material.uniforms, sU = this.snow.material.uniforms;
    this.rain.visible = on && cur.rain > 0.02; this.snow.visible = on && cur.snow > 0.02;
    for (const U of [rU, sU]) { U.uTime.value = this.t; U.uCenter.value.copy(cam); U.uWind.value.copy(this.wind); U.uInside.value = inside ? 1 : 0; }
    rU.uAmount.value = cur.rain * amt; rU.uFall.value = 13 + 6 * cur.rain; rU.uOpacity.value = 0.25 + 0.25 * cur.rain + 0.4 * fl;
    rU.uColor.value.setRGB(0.62 + 0.3 * fl, 0.68 + 0.3 * fl, 0.76 + 0.24 * fl).multiplyScalar(th ? 0.45 + 0.55 * (1 - th.dark) : 1);
    sU.uAmount.value = cur.snow * amt; sU.uOpacity.value = 0.85;
    return { rain: cur.rain, snow: cur.snow, gloom: g, flash: fl };
  }
  hide() { this.rain.visible = false; this.snow.visible = false; }
}
