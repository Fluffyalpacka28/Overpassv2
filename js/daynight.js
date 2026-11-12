import * as THREE from 'three';

// Day and night for World Drive.
//   'game': one full day every 10 minutes of play      'real': follows the clock on your device
// t is the time of day as a fraction: 0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm.
export const CYCLE_SECONDS = 600;

const K = (t, top, bot, ground, sun, h1, h2, hemiI, cloud) => ({ t, top: new THREE.Color(top), bot: new THREE.Color(bot), ground: new THREE.Color(ground), sun: new THREE.Color(sun), h1: new THREE.Color(h1), h2: new THREE.Color(h2), hemiI, cloud: new THREE.Color(cloud) });
const KEYS = [
  K(0.00, '#050918', '#0b1230', '#1b2a25', '#8fa8ff', '#2c3c7a', '#0d1118', 0.55, '#4a5278'), // night
  K(0.21, '#0f1838', '#2a2c52', '#2a3a30', '#8fa8ff', '#3c4a86', '#121620', 0.6, '#59608a'),  // before dawn
  K(0.27, '#3d5290', '#ff9a6a', '#8a8f6a', '#ffb27a', '#ffc9a0', '#4a4a45', 0.8, '#ffc9a8'),  // sunrise
  K(0.36, '#3a68b8', '#f6dcc0', '#8fae78', '#fff0d8', '#fff3e0', '#5d6b4a', 0.95, '#fff4ea'), // morning
  K(0.50, '#2f78d8', '#cfe6f7', '#8fae78', '#ffffff', '#f4f9ff', '#5d6b4a', 1.0, '#ffffff'),  // noon
  K(0.64, '#3a68b8', '#f5e1c8', '#8fae78', '#fff0d8', '#fff3e0', '#5d6b4a', 0.95, '#fff4ea'), // afternoon
  K(0.73, '#2b3f80', '#ff8f5a', '#7f8564', '#ff9a5a', '#ffa070', '#3a3542', 0.8, '#ffbf9a'),  // sunset
  K(0.79, '#141a40', '#5a3a5e', '#3a4638', '#9aa0ff', '#6a5a9a', '#1a1a28', 0.65, '#7a6a92'), // dusk
  K(0.88, '#070b20', '#101a3a', '#1f2c27', '#8fa8ff', '#2c3c7a', '#0d1118', 0.55, '#4a5278'), // night again
  K(1.00, '#050918', '#0b1230', '#1b2a25', '#8fa8ff', '#2c3c7a', '#0d1118', 0.55, '#4a5278'),
];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, f) => a + (b - a) * f;
export function realTimeOfDay() { const d = new Date(); return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000) / 86400; }
export function clockText(t) { const m = Math.floor(((t % 1) + 1) % 1 * 1440 + 1e-6); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

const MOON_LIGHT = new THREE.Vector3(0.4, 0.85, -0.3).normalize();

export class DayNight {
  constructor() {
    this.t = realTimeOfDay();
    // the "theme" handed to the game's environment code, reused every update (no allocations)
    this.th = { sky: [new THREE.Color(), new THREE.Color()], fog: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(), hemi: [new THREE.Color(), new THREE.Color()], light: 1, hemiI: 1, night: false, cloudTint: new THREE.Color(),
      dark: 0, glow: 0, lamp: 0, elev: 1, fogNear: 140, fogFar: 620, lightDir: new THREE.Vector3(0.4, 0.8, 0.3), sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3() };
    this.sample();
  }
  update(dt, mode) {
    this.t = mode === 'real' ? realTimeOfDay() : (this.t + dt / CYCLE_SECONDS) % 1;
    this.sample();
  }
  sample() {
    const t = this.t, th = this.th;
    let i = 0; while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], f = smooth(0, 1, (t - a.t) / (b.t - a.t));
    th.sky[0].lerpColors(a.top, b.top, f); th.sky[1].lerpColors(a.bot, b.bot, f); th.fog.lerpColors(a.bot, b.bot, f);
    th.ground.lerpColors(a.ground, b.ground, f); th.sun.lerpColors(a.sun, b.sun, f);
    th.hemi[0].lerpColors(a.h1, b.h1, f); th.hemi[1].lerpColors(a.h2, b.h2, f); th.cloudTint.lerpColors(a.cloud, b.cloud, f);
    th.hemiI = lerp(a.hemiI, b.hemiI, f);
    // the sun's path: rises in the east at 6am, highest at noon, sets in the west at 6pm
    const ang = (t - 0.25) * Math.PI * 2, sy = Math.sin(ang);
    th.elev = sy; th.sunDir.set(Math.cos(ang), sy, 0.35).normalize(); th.moonDir.copy(th.sunDir).multiplyScalar(-1);
    const day = smooth(-0.08, 0.3, sy);
    th.light = lerp(0.32, 0.9 + Math.max(sy, 0), day);                                  // moonlight at night, sunlight by day
    th.lightDir.set(th.sunDir.x * day + MOON_LIGHT.x * (1 - day), Math.max(th.sunDir.y, 0.2) * day + MOON_LIGHT.y * (1 - day), th.sunDir.z * day + MOON_LIGHT.z * (1 - day)).normalize();
    th.dark = smooth(0.1, -0.2, sy);                                                      // 0 day .. 1 full night
    th.glow = smooth(0.14, -0.1, sy);                                                     // building windows
    th.lamp = smooth(0.26, -0.02, sy);                                                    // headlights come on a little before it's properly dark
    th.night = th.dark > 0.55;
    th.fogNear = lerp(140, 100, th.dark); th.fogFar = lerp(620, 520, th.dark);
  }
}

// ---------- stars, sun and moon ----------
function discTexture(draw, size = 128) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
export class SkyFx {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    const n = 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u), b = 0.45 + Math.random() * 0.55;
      pos[i * 3] = Math.cos(a) * r * 1850; pos[i * 3 + 1] = u * 1850; pos[i * 3 + 2] = Math.sin(a) * r * 1850; col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = Math.min(1, b + 0.12);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false });
    this.stars = new THREE.Points(g, this.starMat); this.stars.renderOrder = -0.9; this.stars.frustumCulled = false; this.group.add(this.stars);
    const sunTex = discTexture((x, S) => { const g2 = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.1, 'rgba(255,250,225,1)'); g2.addColorStop(0.16, 'rgba(255,225,160,0.55)'); g2.addColorStop(0.5, 'rgba(255,200,120,0.14)'); g2.addColorStop(1, 'rgba(255,190,110,0)'); x.fillStyle = g2; x.fillRect(0, 0, S, S); });
    const moonTex = discTexture((x, S) => {
      x.fillStyle = 'rgba(220,228,245,1)'; x.beginPath(); x.arc(S / 2, S / 2, S * 0.3, 0, 7); x.fill();
      x.fillStyle = 'rgba(170,182,210,0.5)'; for (const [dx, dy, r] of [[-0.1, -0.06, 0.07], [0.08, 0.05, 0.09], [-0.02, 0.12, 0.05], [0.12, -0.1, 0.04]]) { x.beginPath(); x.arc(S / 2 + dx * S, S / 2 + dy * S, r * S, 0, 7); x.fill(); }
      const g2 = x.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2); g2.addColorStop(0, 'rgba(200,215,255,0.35)'); g2.addColorStop(1, 'rgba(200,215,255,0)'); x.fillStyle = g2; x.fillRect(0, 0, S, S);
    });
    const sprite = (map, blending) => { const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending }); const s = new THREE.Sprite(m); s.renderOrder = -0.8; this.group.add(s); return s; };
    this.sun = sprite(sunTex, THREE.AdditiveBlending); this.sun.scale.setScalar(620);
    this.moon = sprite(moonTex, THREE.NormalBlending); this.moon.scale.setScalar(190);
  }
  update(cam, th) {
    this.group.visible = true; this.group.position.copy(cam);
    this.starMat.opacity = th.dark * 0.95; this.stars.visible = th.dark > 0.02;
    this.sun.position.copy(th.sunDir).multiplyScalar(1700); this.sun.visible = th.elev > -0.12; this.sun.material.opacity = smooth(-0.12, 0.06, th.elev); this.sun.material.color.copy(th.sun);
    this.moon.position.copy(th.moonDir).multiplyScalar(1700); this.moon.visible = th.elev < 0.1; this.moon.material.opacity = smooth(0.1, -0.1, th.elev) * 0.95;
  }
  hide() { this.group.visible = false; }
}
