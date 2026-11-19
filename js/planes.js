import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Live Boeing 747s (World Drive). Real 747s flying right now come from free, public ADS-B flight-tracking feeds
// (airplanes.live, then adsb.lol as a backup). The nearest few to where you are in the real world fly over your part of the map:
// each pass keeps the real plane's heading and comes in on the side of you it really is, scaled down to a game-sized flyover
// (90-200 m up, ~85 m/s) so you can reach it. A label shows its real model, distance and direction.
// Shoot one enough and it's "tagged" for +747 points and trails smoke; it's a real flight, so it never crashes, it just flies on.
const TYPES = ['B748', 'B744', 'B74S', 'B742'];
const SOURCES = [
  { name: 'airplanes.live', url: t => `https://api.airplanes.live/v2/type/${t}` },
  { name: 'adsb.lol', url: t => `https://api.adsb.lol/v2/type/${t}` },
];
const NAMES = { B748: 'Boeing 747-8', B744: 'Boeing 747-400', B74S: 'Boeing 747SP', B742: 'Boeing 747-200', B743: 'Boeing 747-300', B741: 'Boeing 747-100' };
const MAXN = 4, HP = 360, PASS = 2600, SPEED = 85, TAG_PTS = 747, AGAIN = 120;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dirName = b => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((b % 360) + 360) % 360 / 45) % 8];
function haversine(la1, lo1, la2, lo2) { const R = 6371, r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r, a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))); }
function bearing(la1, lo1, la2, lo2) { const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r); return (Math.atan2(y, x) / r + 360) % 360; }

// ---------- a jumbo jet, nose along +z, about 70 m long ----------
let GEO = null;
function jumbo() {
  if (GEO) return GEO;
  const white = [], grey = [], blue = [], glass = [];
  const NI = g => g.index ? g.toNonIndexed() : g;
  const put = (list, g) => list.push(NI(g));
  const fus = new THREE.CylinderGeometry(3.2, 3.2, 52, 20); fus.rotateX(Math.PI / 2); put(white, fus);
  const nose = new THREE.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1, 0.95, 2.4); nose.translate(0, -0.15, 26); put(white, nose);
  const tail = new THREE.ConeGeometry(3.2, 16, 20); tail.rotateX(-Math.PI / 2); tail.scale(1, 0.7, 1); tail.translate(0, 0.9, -34); put(white, tail);
  const hump = new THREE.CapsuleGeometry(2.3, 16, 6, 14); hump.rotateX(Math.PI / 2); hump.scale(1, 0.85, 1); hump.translate(0, 2.4, 15); put(white, hump); // the upper deck
  const cock = new THREE.BoxGeometry(2.6, 0.7, 1.6); cock.translate(0, 3.3, 24.3); put(glass, cock);
  const belly = new THREE.CylinderGeometry(3.25, 3.25, 50, 20, 1, true, -Math.PI * 0.38, Math.PI * 0.76); belly.rotateX(Math.PI / 2); put(grey, belly);
  const stripe = new THREE.CylinderGeometry(3.28, 3.28, 52, 20, 1, true, Math.PI * 1.42, Math.PI * 0.08); stripe.rotateX(Math.PI / 2); put(blue, stripe);
  const stripe2 = stripe.clone(); stripe2.scale(-1, 1, 1); put(blue, stripe2);
  // swept wings
  const wing = sd => { const s = new THREE.Shape(); s.moveTo(0, 6); s.lineTo(32 * sd, -14); s.lineTo(32 * sd, -18); s.lineTo(0, -6); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, -1.2, 2); return g; };
  put(white, wing(1)); put(white, wing(-1));
  // four engines
  for (const [x, z] of [[-11, -1.5], [-21, -8], [11, -1.5], [21, -8]]) {
    const e = new THREE.CylinderGeometry(1.3, 1.1, 5.5, 14); e.rotateX(Math.PI / 2); e.translate(x, -3.2, z + 1); put(grey, e);
    const py = new THREE.BoxGeometry(0.4, 1.6, 3.5); py.translate(x, -2, z + 0.5); put(white, py);
  }
  // tail fin and stabilisers
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-12, 0); fin.lineTo(-16, 15); fin.lineTo(-10.5, 15); fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.6, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); fg.translate(0.3, 2.2, -22); put(blue, fg);
  for (const sd of [1, -1]) { const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(11 * sd, -6); st.lineTo(11 * sd, -9); st.lineTo(0, -6); st.closePath(); const g = new THREE.ExtrudeGeometry(st, { depth: 0.5, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 1.2, -29); put(white, g); }
  const all = [white, grey, blue, glass].map(l => mergeGeometries(l));
  GEO = mergeGeometries(all, true); GEO.computeBoundingSphere();
  return GEO;
}
function makeTag() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  m.scale.set(80, 17.5, 1); m.renderOrder = 10; m.userData.c = c; m.userData.t = t; return m;
}
function drawTag(sp, l1, l2, hot) {
  const c = sp.userData.c, x = c.getContext('2d'); x.clearRect(0, 0, 512, 112);
  x.fillStyle = hot ? 'rgba(200,40,40,.85)' : 'rgba(12,16,28,.72)'; x.beginPath(); x.roundRect(6, 6, 500, 100, 22); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 40px system-ui, sans-serif'; x.fillText(l1, 256, 50); x.font = '500 30px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText(l2, 256, 90);
  sp.userData.t.needsUpdate = true;
}

export class LivePlanes {
  constructor(scene, opts = {}) {
    this.scene = scene; this.o = opts; this.ac = new Map(); this.list = []; this.t = 0; this.fetchT = 0; this.busy = false; this.src = 0; this.source = ''; this.failed = 0; this.status = 'idle';
    const mats = [
      new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.35, metalness: 0.2, fog: false }),
      new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.45, metalness: 0.5, fog: false }),
      new THREE.MeshStandardMaterial({ color: '#1f4fa8', roughness: 0.4, metalness: 0.2, fog: false, side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: '#10161f', roughness: 0.1, metalness: 0.6, fog: false }),
    ];
    this.mats = mats; this.flashMat = mats.map(m => { const c = m.clone(); c.emissive = new THREE.Color('#ff5a2a'); c.emissiveIntensity = 0.9; return c; });
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const x = sc.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(60,60,64,.9)'); g.addColorStop(1, 'rgba(60,60,64,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this.smokeTex = new THREE.CanvasTexture(sc); this.puffs = [];
  }
  // ---------- live data ----------
  async poll(lat, lon) {
    if (this.busy) return; this.busy = true;
    try {
      const S = SOURCES[this.src % SOURCES.length], all = [];
      for (const t of TYPES) {
        const r = await fetch(S.url(t), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json(); for (const a of (j.ac || j.aircraft || [])) all.push(a); await sleep(1100); // the feeds allow one request a second
      }
      const now = performance.now(), seen = new Set();
      const air = all.filter(a => isFinite(a.lat) && isFinite(a.lon) && typeof a.alt_baro === 'number' && a.alt_baro > 2000)
        .map(a => ({ a, d: haversine(lat, lon, a.lat, a.lon) })).sort((p, q) => p.d - q.d).slice(0, MAXN);
      for (const { a } of air) {
        const k = a.hex; seen.add(k); let p = this.ac.get(k);
        if (!p) { p = { hex: k, mesh: null, tag: null, hp: HP, tagged: 0, wait: Math.random() * 6 }; this.ac.set(k, p); }
        Object.assign(p, { lat: a.lat, lon: a.lon, alt: a.alt_baro, gs: a.gs || 480, track: a.track ?? a.true_heading ?? 0, type: a.t || 'B744', desc: NAMES[a.t] || 'Boeing 747', freight: /F$/.test(a.desc || '') || !!(a.category === 'A5' && /cargo/i.test(a.ownOp || '')), at: now });
      }
      for (const [k, p] of this.ac) if (!seen.has(k)) { this.drop(p); this.ac.delete(k); }
      this.source = S.name; this.failed = 0; this.status = air.length ? 'live' : 'none';
      this.o.onData && this.o.onData(air.length, S.name);
    } catch (e) {
      this.failed++; this.src++; this.fetchT = this.failed < SOURCES.length ? 1.5 : 120; // try the other feed straight away
      if (this.failed >= SOURCES.length) { this.status = 'offline'; this.o.onFail && this.o.onFail(String(e && e.message || e)); }
    } finally { this.busy = false; }
  }
  drop(p) { if (p.mesh) { this.scene.remove(p.mesh); p.mesh = null; } if (p.tag) { this.scene.remove(p.tag); p.tag.material.dispose(); p.tag.userData.t.dispose(); p.tag = null; } }
  clear() { for (const p of this.ac.values()) this.drop(p); this.ac.clear(); for (const s of this.puffs) this.scene.remove(s.m); this.puffs = []; this.fetchT = 0; this.status = 'idle'; }
  targets() { const out = []; for (const p of this.ac.values()) if (p.mesh && p.mesh.visible) out.push({ id: '', npc: 'plane', ref: p, x: p.x, y: p.y - 0.7, z: p.z, r: 15 }); return out; }
  // a hit from our weapons; returns the points earned (only when it gets tagged)
  hit(p, dmg) {
    if (!p || !p.mesh || p.taggedPass) return 0; p.hp -= dmg; p.flash = 0.12;
    if (p.hp > 0) return 0;
    p.taggedPass = true; p.tagged = this.t; p.smoke = 1; return TAG_PTS;
  }
  // start a pass over your area: along its real heading, coming in on the side of you it really is
  startPass(p, px, pz, gy, plat, plon) {
    const tr = p.track * Math.PI / 180, fx = Math.sin(tr), fz = -Math.cos(tr); // game: +x east, -z north
    const b = bearing(plat, plon, p.lat, p.lon) * Math.PI / 180, bx = Math.sin(b), bz = -Math.cos(b);
    const side = Math.sign(bx * -fz + bz * fx) || 1, off = 180 + Math.random() * 380;
    p.x = px - fx * PASS + (-fz) * side * off; p.z = pz - fz * PASS + fx * side * off;
    p.y = gy + 90 + Math.max(0, Math.min(1, p.alt / 43000)) * 110; // low enough to reach with your guns (real cruise height decides where in 90-200 m) p.fx = fx; p.fz = fz; p.hp = HP; p.taggedPass = false; p.smoke = 0;
    if (!p.mesh) { p.mesh = new THREE.Mesh(jumbo(), this.mats); p.mesh.castShadow = false; this.scene.add(p.mesh); p.tag = makeTag(); this.scene.add(p.tag); p.tagKey = ''; }
    p.mesh.visible = p.tag.visible = true; p.mesh.rotation.set(0, Math.atan2(fx, fz), 0); p.announced = false;
  }
  update(dt, P, on) {
    this.t += dt;
    if (!on) { if (this.ac.size) this.clear(); return; }
    this.fetchT -= dt; if (this.fetchT <= 0 && !this.busy) { this.fetchT = 30; this.poll(P.lat, P.lon); }
    for (const p of this.ac.values()) {
      // keep its real position moving between updates (for the label)
      const age = dt, kms = (p.gs || 480) * 0.000514 * age, tr = p.track * Math.PI / 180;
      p.lat += kms * Math.cos(tr) / 111.32; p.lon += kms * Math.sin(tr) / (111.32 * Math.cos(p.lat * Math.PI / 180));
      if (!p.mesh || !p.mesh.visible) { p.wait -= dt; if (p.wait <= 0) this.startPass(p, P.x, P.z, P.ground, P.lat, P.lon); continue; }
      p.x += p.fx * SPEED * dt; p.z += p.fz * SPEED * dt;
      const along = (p.x - P.x) * p.fx + (p.z - P.z) * p.fz;
      if (along > PASS || Math.hypot(p.x - P.x, p.z - P.z) > PASS * 1.6) { p.mesh.visible = p.tag.visible = false; p.wait = 10 + Math.random() * 15; continue; }
      p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.z = Math.sin(this.t * 0.3 + p.x * 0.001) * 0.04;
      p.flash = Math.max(0, (p.flash || 0) - dt); p.mesh.material = p.flash > 0 ? this.flashMat : this.mats;
      // label: model, real distance and direction from you (updated now and then)
      const dKm = haversine(P.lat, P.lon, p.lat, p.lon), key = p.taggedPass ? 'T' + Math.round(dKm / 5) : Math.round(dKm / 5) + '|' + Math.round(p.hp / 30);
      if (key !== p.tagKey) { p.tagKey = key; drawTag(p.tag, p.taggedPass ? `${p.desc} · TAGGED` : p.desc, `real: ${dKm < 10 ? dKm.toFixed(1) : Math.round(dKm).toLocaleString()} km ${dirName(bearing(P.lat, P.lon, p.lat, p.lon))}${p.taggedPass ? '' : ` · ${Math.max(0, Math.round(p.hp / HP * 100))}%`}`, p.taggedPass); }
      p.tag.position.set(p.x, p.y + 16, p.z); const dCam = Math.hypot(p.x - P.cx, p.y - P.cy, p.z - P.cz); p.tag.scale.set(80 * Math.max(0.5, dCam / 900), 17.5 * Math.max(0.5, dCam / 900), 1);
      if (!p.announced && Math.hypot(p.x - P.x, p.z - P.z) < 1300) { p.announced = true; this.o.onNear && this.o.onNear(p); }
      // tagged: smoke from an engine
      if (p.taggedPass && (p.smokeT = (p.smokeT || 0) - dt) <= 0) { p.smokeT = 0.12; const ex = p.x + p.fz * 11 - p.fx * 2, ez = p.z - p.fx * 11 - p.fz * 2, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 })); s.position.set(ex, p.y - 3, ez); s.scale.setScalar(6); this.scene.add(s); this.puffs.push({ m: s, age: 0 }); }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) { const s = this.puffs[i]; s.age += dt; const k = s.age / 6; s.m.scale.setScalar(6 + k * 30); s.m.material.opacity = 0.8 * (1 - k); s.m.position.y -= dt * 1.5; if (k >= 1) { this.scene.remove(s.m); s.m.material.dispose(); this.puffs.splice(i, 1); } }
  }
  // for the minimap
  dots() { const out = []; for (const p of this.ac.values()) if (p.mesh && p.mesh.visible) out.push({ x: p.x, z: p.z, tagged: p.taggedPass, yaw: Math.atan2(p.fx, p.fz) }); return out; }
}
