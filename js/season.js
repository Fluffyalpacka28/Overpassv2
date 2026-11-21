// Seasons in World Drive, from where you really are and what it's really like there.
//  - Leaves follow the calendar for your latitude (and hemisphere): fresh green in spring, full in summer, yellow / orange / red
//    in autumn, then the broadleaf trees drop their leaves tree by tree and stand bare through winter. Pines and spruces stay green.
//    Near the equator nothing changes.
//  - Grass goes straw-coloured while it's dormant.
//  - Snow on the ground is the real snow depth at your spot (Open-Meteo, free, no key), and it also builds up while it's actually
//    snowing and below freezing, and melts off when it warms up. It lies on everything flat enough to hold it: fields, roofs,
//    the tops of trees and rocks. Roads stay ploughed.
// Settings can force a season instead.

const cl01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = cl01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// shared by every material that changes with the seasons
export const SEASON = { uSnow: { value: 0 }, uBare: { value: 0 }, uAutumn: { value: 0 }, uSpring: { value: 0 }, uDormant: { value: 0 } };

const SNOW_VERT_DECL = 'varying vec3 vSnW;';
const SNOW_VERT = `{ vec4 snP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  snP = instanceMatrix * snP;
#endif
  vSnW = (modelMatrix * snP).xyz; }`;
const SNOW_FRAG_DECL = `uniform float uSnow, uDormant; varying vec3 vSnW;
float snHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snHash(i), snHash(i + vec2(1.0, 0.0)), f.x), mix(snHash(i + vec2(0.0, 1.0)), snHash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const snowFrag = (up0, up1, grassy, amt) => `{
  vec3 snN = normalize(inverseTransformDirection(normal, viewMatrix));
  ${grassy ? `{ float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); float green = smoothstep(0.0, 0.08, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.42, 1.12, 0.6), uDormant * 0.8 * green); }` : ''}
  float snB = snNoise(vSnW.xz * 0.35) * 0.6 + snNoise(vSnW.xz * 1.7) * 0.4;
  float snK = uSnow * ${amt.toFixed(2)} * smoothstep(${up0.toFixed(2)}, ${up1.toFixed(2)}, snN.y + (snB - 0.5) * 0.25);
  snK = clamp(snK * 1.5 - (1.0 - snB) * 0.55 * (1.0 - uSnow), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96) * (0.94 + 0.08 * snB), snK);
#if defined( STANDARD )
  roughnessFactor = mix(roughnessFactor, 0.82, snK); metalnessFactor = mix(metalnessFactor, 0.0, snK);
#endif
}`;

// Snow settles on the up-facing parts of a material (roofs, tree tops, rocks, park lawns). opts.grassy: green parts also go straw-
// coloured while the grass is dormant. up: how flat a surface must be to hold snow (world normal y). amt: how much snow it takes.
export function snowify(m, key, opts = {}) {
  if (!m || m.userData.snowy) return m;
  const up = opts.up || [0.5, 0.8], grassy = !!opts.grassy, amt = opts.amt == null ? 1 : opts.amt;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.userData.snowy = true;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uSnow = SEASON.uSnow; sh.uniforms.uDormant = SEASON.uDormant;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SNOW_VERT_DECL).replace('#include <project_vertex>', '#include <project_vertex>\n' + SNOW_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SNOW_FRAG_DECL).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + snowFrag(up[0], up[1], grassy, amt));
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|snow-' + key;
  m.needsUpdate = true;
  return m;
}

// ---------- what season is it here ----------
const DEPTH_URL = (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=snow_depth,temperature_2m&past_days=1&forecast_days=1&timezone=GMT`;
const NEUTRAL = { snow: 0, bare: 0, autumn: 0, spring: 0, dormant: 0 };
const FORCED = {
  spring: { snow: 0, bare: 0, autumn: 0, spring: 1, dormant: 0 },
  summer: NEUTRAL,
  autumn: { snow: 0, bare: 0.2, autumn: 1, spring: 0, dormant: 0.35 },
  winter: { snow: 1, bare: 1, autumn: 0, spring: 0, dormant: 0.8 },
};
const NAMES = { spring: '🌱 Spring', summer: '☀️ Summer', autumn: '🍂 Autumn', winter: '❄️ Winter' };

// leaves and grass from the calendar: day of year at this latitude
export function calendar(lat, date = new Date()) {
  const a = Math.abs(lat), amp = smooth(22, 34, a); // tropics: no seasons to speak of
  if (amp <= 0) return { ...NEUTRAL };
  const y0 = Date.UTC(date.getUTCFullYear(), 0, 1); let d = (date.getTime() - y0) / 864e5;
  if (lat < 0) d = (d + 182.5) % 365;
  const sh = Math.max(-28, Math.min(30, (a - 40) * 2.2)); // further north: autumn earlier, spring later
  const leafOut = smooth(95 + sh, 138 + sh, d), leafFall = smooth(288 - sh, 322 - sh, d);
  const bare = (1 - leafOut) * (d < 200 ? 1 : 0) + leafFall * (d >= 200 ? 1 : 0);
  const autumn = d >= 200 ? smooth(252 - sh, 286 - sh, d) : 0;
  const spring = d < 200 ? smooth(108 + sh, 132 + sh, d) * (1 - smooth(150 + sh, 178 + sh, d)) : 0;
  const dormant = d < 200 ? 1 - smooth(78 + sh, 118 + sh, d) : smooth(296 - sh, 336 - sh, d);
  return { snow: 0, bare: bare * amp, autumn: autumn * amp, spring: spring * amp, dormant: dormant * 0.85 * amp };
}

export class Seasons {
  constructor() { this.at = null; this.lastFetch = -1e9; this.busy = false; this.depth = null; this.temp = null; this.acc = 0; this.cur = { ...NEUTRAL }; this.lat = 40; this.cal = { ...NEUTRAL }; this.calT = -1e9; }
  // real snow depth where you are (every 30 min, or after 25 km)
  async check(lat, lon) {
    if (this.busy || lat == null || !isFinite(lat) || !isFinite(lon)) return;
    this.lat = lat;
    const far = this.at ? Math.hypot((lat - this.at[0]) * 111, (lon - this.at[1]) * 111 * Math.cos(lat * Math.PI / 180)) : 1e9;
    if (performance.now() - this.lastFetch < 1800000 && far < 25) return;
    this.busy = true; this.lastFetch = performance.now(); this.at = [lat, lon];
    try {
      const r = await fetch(DEPTH_URL(lat, lon), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), h = j && j.hourly; if (!h || !h.time) throw new Error('no data');
      const now = new Date().toISOString().slice(0, 13); let i = h.time.findIndex(t => t.slice(0, 13) === now); if (i < 0) i = h.time.length - 1;
      const dp = h.snow_depth && h.snow_depth[i], tp = h.temperature_2m && h.temperature_2m[i];
      this.depth = dp == null ? null : +dp; this.temp = tp == null ? null : +tp;
      if (far > 25) this.acc = 0; // somewhere new: start from what's really on the ground there
    } catch (e) { console.warn('[overpass] snow depth:', e && e.message || e); }
    this.busy = false;
  }
  // what to show (mode: 'real' | 'off' | 'spring' | 'summer' | 'autumn' | 'winter')
  target(mode) {
    if (mode === 'off') return NEUTRAL;
    if (FORCED[mode]) return FORCED[mode];
    const now = Date.now(); if (now - this.calT > 60000) { this.cal = calendar(this.lat); this.calT = now; }
    const c = { ...this.cal }, cover = this.depth != null ? smooth(0.0, 0.07, this.depth) * (this.depth > 0.004 ? 1 : 0) : 0;
    const frost = this.temp != null && this.temp <= -3 ? 0.16 : 0;
    c.snow = Math.max(cover, this.acc, frost);
    if (c.snow > 0.3) c.dormant = Math.max(c.dormant, 0.6);
    return c;
  }
  name(mode = 'real') {
    if (mode === 'off') return 'Seasons off';
    if (FORCED[mode]) return NAMES[mode] + ' (set in Settings)';
    const c = this.target('real'); let n;
    if (c.snow > 0.35) n = '❄️ Snow on the ground'; else if (c.bare > 0.6) n = c.autumn > 0.5 ? '🍂 Late autumn' : NAMES.winter; else if (c.autumn > 0.3) n = NAMES.autumn; else if (c.spring > 0.3 || (c.bare > 0.05 && c.bare <= 0.6)) n = NAMES.spring; else n = NAMES.summer;
    return n + (this.depth != null && this.depth > 0.004 ? ` · ${Math.round(this.depth * 100)} cm snow` : '');
  }
  // every frame. wx: { snow (0..1 falling now), forced (weather set in Settings) }. on = false eases everything back to plain summer.
  update(dt, mode, on, wx) {
    if (on && mode === 'real' && wx) {
      const cold = wx.forced || this.temp == null || this.temp <= 1.5;
      if (wx.snow > 0.15 && cold) this.acc = Math.min(1, this.acc + dt * wx.snow / 240); // about four minutes of heavy snow covers everything
      else if (this.temp != null && this.temp > 2.5) this.acc = Math.max(0, this.acc - dt * Math.min(1, (this.temp - 2) / 8) / 300);
    }
    const T = on ? this.target(mode) : NEUTRAL, k = 1 - Math.exp(-dt / 2.5), c = this.cur;
    for (const key in c) c[key] += (T[key] - c[key]) * k;
    SEASON.uSnow.value = c.snow; SEASON.uBare.value = c.bare; SEASON.uAutumn.value = c.autumn; SEASON.uSpring.value = c.spring; SEASON.uDormant.value = c.dormant;
    return c;
  }
}
// story mode and menus: plain summer at once
export function seasonsNeutral() { for (const k of ['uSnow', 'uBare', 'uAutumn', 'uSpring', 'uDormant']) SEASON[k].value = 0; }
