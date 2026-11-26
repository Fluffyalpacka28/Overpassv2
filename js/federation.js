import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FedForces } from './fedforces.js';

// World Drive's main objective: the Intergalactic Federation Force has parked a hovering aircraft carrier over the city hall of
// every town. Drive into a town and its carrier is there; shoot it down and it falls burning onto the town and stays there as a
// smoking wreck. Every town you free goes in the Liberation Log (saved on this device; Settings can wipe it).
//   - which town you're in comes from the scrapbook's Nominatim lookup
//   - its city hall: the OpenStreetMap amenity=townhall nearest the town's centre (the town centre itself when there isn't one)
const KEY = 'osm.federation.v1';
const MODEL = new URL('../models/federation_carrier.glb', import.meta.url).href;
const LOGO_URL = new URL('../icons/fed_logo.png', import.meta.url).href;
const LOGO = new Image(); LOGO.src = LOGO_URL;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// the model's fighters are 5.4 units nose to tail; x3 makes them 16 m (an F-35 is 15.7 m) and the carrier 375 m long
export const SCALE = 3;
const HOVER = 110;           // metres from the ground to the carrier's middle (its keel clears 75 m)
export const MAX_HP = 2600;  // about a minute of machine gun, or 75 rockets
export const KILL_PTS = 5000;
const HB = { x: 19.8, y0: -11.3, y1: 4.4, z: 60.4 }; // hull box in model units (the island and radar stick up above it)
const ANIMATED = /^(MainRadarScanner|TurbineRotor_\d|PlasmaPlume_\d|DefenseTurret_\d)$/;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flag = cc => cc && /^[a-z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// a carrier this size has to read from far away, so fog only takes part of it (k of the usual amount)
function thinFog(mat, k) {
  if (!mat) return mat;
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(/fogColor, fogFactor \)/g, `fogColor, fogFactor * ${k.toFixed(2)} )`)); };
  mat.customProgramCacheKey = () => 'thinfog' + k; return mat;
}
let TEMPLATE = null, CLIPS = [], LOADING = null;
// load once, then bake every part that doesn't move into one mesh per material (200 meshes -> about 30 draw calls)
function loadTemplate() {
  if (LOADING) return LOADING;
  LOADING = new GLTFLoader().loadAsync(MODEL).then(g => {
    const root = g.scene.getObjectByName('HoveringAircraftCarrier') || g.scene.children[0];
    g.scene.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert(), groups = new Map(), drop = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== root; p = p.parent) if (ANIMATED.test(p.name)) return;
      const m = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(m);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      const mat = o.material; if (!groups.has(mat)) groups.set(mat, []); groups.get(mat).push(geo); drop.push(o);
    });
    let merged = 0;
    for (const [mat, list] of groups) {
      const geo = list.length > 1 ? mergeGeometries(list, false) : list[0]; if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat); mesh.name = 'baked_' + (mat.name || ''); root.add(mesh); merged++;
    }
    for (const o of drop) o.parent && o.parent.remove(o);
    // prune groups left empty
    const empty = []; root.traverse(o => { if (o !== root && !o.isMesh && !o.children.length && !ANIMATED.test(o.name)) empty.push(o); }); for (const o of empty) o.parent && o.parent.remove(o);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = true; thinFog(o.material, 0.4); } });
    TEMPLATE = g.scene; CLIPS = g.animations || []; console.info('[federation] carrier ready,', merged, 'baked meshes');
    return TEMPLATE;
  });
  return LOADING;
}

function puffTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  for (let i = 0; i < 9; i++) { const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, r = 12 + Math.random() * 14, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  return new THREE.CanvasTexture(c);
}

export class Federation {
  constructor(scene, world, opts = {}) {
    this.scene = scene; this.world = world; this.o = opts; this.carriers = []; this.t = 0; this.pending = null; this.town = null; this.enabled = true;
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); this.list = Array.isArray(v) ? v : []; } catch { this.list = []; }
    this.tex = puffTex(); this.puffs = [];
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.hud = null; this.hudT = 0;
    this.forces = new FedForces(scene, world, {
      boom: (x, y, z, s, big) => { try { this.o.boom && this.o.boom(x, y, z, s, big); } catch { } },
      shoot: (o, dir, kind, k) => { try { this.o.shoot && this.o.shoot(o, dir, kind, k, true); } catch { } },
      puff: (x, y, z, size, life, col, vy, fire) => this.puff(x, y, z, size, life, col, vy, fire),
      bubble: (x, y, z) => { try { this.o.bubble && this.o.bubble(x, y, z); } catch { } },
      onDown: u => { try { this.o.onUnitDown && this.o.onUnitDown(u); } catch { } },
    });
  }
  get count() { return this.list.length; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { } }
  isFree(key) { return this.list.some(e => e.key === key); }
  // wipe the Liberation Log: every town gets its carrier back
  resetProgress() {
    this.list = []; this.save();
    for (const c of [...this.carriers]) this.remove(c);
    const t = this.town; this.town = null; if (t) this.setTown(t);
    this.render();
  }
  // the scrapbook tells us where we are
  setTown(here) {
    if (!this.enabled || !here || !here.name || !isFinite(here.lat) || !isFinite(here.lon)) return;
    const key = here.key || `${here.name}|${here.region}|${here.cc}`.toLowerCase();
    if (this.town && this.town.key === key) return;
    this.town = { ...here, key };
    if (this.carriers.some(c => c.key === key) || this.pending === key) return;
    this.pending = key; const town = this.town;
    Promise.all([loadTemplate(), this.findHall(town)]).then(([, hall]) => {
      if (this.pending === key) this.pending = null;
      if (!this.town || this.town.key !== key || this.carriers.some(c => c.key === key)) return;
      this.spawn(town, hall);
    }).catch(e => { if (this.pending === key) this.pending = null; console.warn('[federation]', e); });
  }
  async findHall(town) {
    const q = `[out:json][timeout:12];nwr["amenity"="townhall"](around:7000,${town.lat.toFixed(5)},${town.lon.toFixed(5)});out center tags 40;`;
    for (const url of OVERPASS) {
      try {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 12000);
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
        clearTimeout(tm); if (!r.ok) continue; const j = await r.json();
        const nm = String(town.name).toLowerCase(); let best = null, bs = 1e9;
        for (const el of j.elements || []) {
          const lat = el.lat ?? (el.center && el.center.lat), lon = el.lon ?? (el.center && el.center.lon); if (!isFinite(lat)) continue;
          const t = el.tags || {}, n = String(t.name || '').toLowerCase(), ty = String(t['townhall:type'] || '').toLowerCase();
          let s = Math.hypot(lat - town.lat, (lon - town.lon) * Math.cos(lat * Math.PI / 180)) * 111;
          if (/^(city|town|municipal|municipality|village|council)$/.test(ty)) s -= 3;
          if (/^(community|quarter|district|neighbourhood|suburb|borough)$/.test(ty)) s += 2.5;
          if (nm && n.includes(nm)) s -= 2;
          if (/city hall|town hall|village hall|municipal|rathaus|hôtel de ville|hotel de ville|mairie|ayuntamiento|municipio|câmara|stadhuis|raadhuis|comune|municipalidad/i.test(n)) s -= 1;
          if (s < bs) { bs = s; best = { lat, lon, name: t.name || 'City hall' }; }
        }
        return best || { lat: town.lat, lon: town.lon, name: 'Town centre' };
      } catch { }
    }
    return { lat: town.lat, lon: town.lon, name: 'Town centre' };
  }
  spawn(town, hall) {
    if (!TEMPLATE) return null;
    const [x, z] = this.world.proj(hall.lat, hall.lon), free = this.isFree(town.key);
    const outer = new THREE.Group(); outer.name = 'federationCarrier';
    const body = TEMPLATE.clone(true); body.scale.setScalar(SCALE); outer.add(body);
    const yaw = (hashStr(town.key) * 6.283) % 6.283;
    outer.position.set(x, this.ground(x, z) + HOVER, z); outer.rotation.y = yaw;
    const c = { key: town.key, town, hall, x, z, yaw, outer, body, hp: MAX_HP, state: free ? 'wreck' : 'alive', vy: 0, pitch: 0, roll: 0, gT: 0, fireT: 3, burst: 0, burstT: 0, rocketT: 6, boomT: 0, smokeT: 0, drift: Math.random() * 6.28, bar: null, barHp: -1, lat0: this.world.lat0 };
    c.turrets = []; body.traverse(o => { if (/^DefenseTurret_\d$/.test(o.name)) c.turrets.push(o); if (/^PlasmaPlume_\d$/.test(o.name)) (c.plumes || (c.plumes = [])).push(o); });
    if (CLIPS.length) { c.mixer = new THREE.AnimationMixer(body); for (const clip of CLIPS) c.mixer.clipAction(clip).play(); c.mixer.update(Math.random() * 4); }
    if (free) this.makeWreck(c, true); else this.makeBar(c);
    this.scene.add(outer); this.carriers.push(c);
    // keep only the nearest few
    if (this.carriers.length > 3) { const far = this.carriers.filter(k => k !== c).sort((a, b) => this.distTo(b) - this.distTo(a))[0]; if (far) this.remove(far); }
    if (!free) try { this.o.onSpawn && this.o.onSpawn(c); } catch { }
    return c;
  }
  ground(x, z) { try { const g = this.world.heightAt(x, z); return isFinite(g) ? g : 0; } catch { return 0; } }
  distTo(c) { const p = this.o.me ? this.o.me() : null; return p ? Math.hypot(c.outer.position.x - p.x, c.outer.position.z - p.z) : 0; }
  remove(c) {
    const i = this.carriers.indexOf(c); if (i >= 0) this.carriers.splice(i, 1);
    this.scene.remove(c.outer); if (c.bar) { c.bar.material.map.dispose(); c.bar.material.dispose(); }
    if (c.mats) for (const m of c.mats) m.dispose();
    try { c.mixer && c.mixer.stopAllAction(); } catch { }
  }
  clear() { this.forces.clear(); for (const c of [...this.carriers]) this.remove(c); this.town = null; this.pending = null; for (const p of this.puffs) this.scene.remove(p.s); this.puffs = []; if (this.hud) this.hud.hidden = true; }

  // ---- health bar floating over the carrier ----
  makeBar(c) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false, toneMapped: false, fog: false });
    const s = new THREE.Sprite(mat); s.scale.set(0.42, 0.092, 1); s.renderOrder = 999; s.center.set(0.5, 0.5); c.bar = s; c.barCv = cv; this.scene.add(s); c.outer.userData.bar = s;
    this.drawBar(c);
  }
  drawBar(c) {
    const cv = c.barCv; if (!cv) return; const x = cv.getContext('2d'), k = Math.max(0, c.hp / MAX_HP); c.barHp = c.hp;
    x.clearRect(0, 0, 512, 112);
    const lw = LOGO.complete && LOGO.naturalWidth ? 96 : 0; if (lw) { try { x.drawImage(LOGO, 4, 6, lw, lw * LOGO.naturalHeight / LOGO.naturalWidth); } catch { } } else LOGO.onload = () => { for (const k of this.carriers) if (k.bar) this.drawBar(k); };
    const tx = lw ? 300 : 256;
    x.font = '800 23px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 6;
    x.fillText('INTERGALACTIC FEDERATION FORCE', tx, 30);
    x.font = '700 19px system-ui, Arial, sans-serif'; x.fillStyle = '#ffd36b'; x.fillText(`Carrier over ${String(c.town.name).toUpperCase()}`.slice(0, 40), tx, 56); x.shadowBlur = 0;
    const bx = 36, by = 70, bw = 440, bh = 26;
    x.fillStyle = 'rgba(10,12,18,.85)'; rr(x, bx - 4, by - 4, bw + 8, bh + 8, 9); x.fill();
    const col = k > 0.5 ? '#3fd26b' : k > 0.25 ? '#ffb02e' : '#ff3b3b', gr = x.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, col); gr.addColorStop(1, shade(col));
    x.fillStyle = gr; rr(x, bx, by, Math.max(0.01, bw * k), bh, 6); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; for (let i = 1; i < 10; i++) { x.beginPath(); x.moveTo(bx + bw * i / 10, by + 3); x.lineTo(bx + bw * i / 10, by + bh - 3); x.stroke(); }
    x.font = '800 17px system-ui, Arial, sans-serif'; x.fillStyle = '#fff'; x.fillText(`${Math.ceil(c.hp)} / ${MAX_HP}`, 256, by + 19);
    c.bar.material.map.needsUpdate = true;
  }

  // ---- what the guns can hit: a double row of spheres along the hull ----
  targets() {
    const out = [];
    for (const c of this.carriers) {
      if (c.state !== 'alive') continue; c.outer.updateMatrixWorld();
      for (let zz = -52; zz <= 52; zz += 13) for (const xx of [-9, 9]) { this._v.set(xx, -3, zz); c.body.localToWorld(this._v); out.push({ id: '', npc: 'fed', ref: c, x: this._v.x, y: this._v.y - 0.7, z: this._v.z, r: 34 }); }
      this._v.set(11.5, 12, 6); c.body.localToWorld(this._v); out.push({ id: '', npc: 'fed', ref: c, x: this._v.x, y: this._v.y - 0.7, z: this._v.z, r: 26 });
    }
    this.forces.targets(out);
    return out;
  }
  // nearest live hull point in front of the car, for the guns' aim assist
  aimAt(px, py, pz, fx, fz, maxD = 640, cone = 0.5) {
    let best = null, bd = maxD;
    for (const t of this.targets()) { if (t.ref.kind === 'sub' && !this.diving) continue; const dx = t.x - px, dz = t.z - pz, dh = Math.hypot(dx, dz), d = Math.hypot(dh, t.y - py); if (d > bd || dh < 1 || (dx * fx + dz * fz) / dh < Math.cos(cone)) continue; bd = d; best = t; }
    return best;
  }
  hit(c, dmg) {
    if (c && c.kind) return this.forces.hit(c, dmg);
    if (!c || c.state !== 'alive') return false;
    c.hp = Math.max(0, c.hp - dmg); c.hitT = 0.12;
    if (c.hp <= 0) { this.destroy(c); return 'kill'; }
    return true;
  }
  destroy(c) {
    c.state = 'falling'; c.vy = -2; c.pr = -(0.05 + Math.random() * 0.05); c.rr = (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.04); c.boomT = 0;
    if (c.bar) { this.scene.remove(c.bar); }
    this.darken(c, 0.55);
    const e = { key: c.key, name: c.town.name, region: c.town.region || '', country: c.town.country || '', cc: c.town.cc || '', hall: c.hall.name || '', t: Date.now(), lat: +(+c.hall.lat).toFixed(5), lon: +(+c.hall.lon).toFixed(5) };
    if (!this.isFree(c.key)) { this.list.unshift(e); this.save(); }
    const p = c.outer.position; try { this.o.boom && this.o.boom(p.x, p.y, p.z, 24, true); } catch { }
    try { this.o.onDestroyed && this.o.onDestroyed(c, e); } catch { }
    this.render();
  }
  // engines out, burnt paint
  darken(c, k) {
    if (!c.mats) { c.mats = []; const map = new Map(); c.body.traverse(o => { if (!o.isMesh) return; if (!map.has(o.material)) { const m = thinFog(o.material.clone(), 0.4); map.set(o.material, m); c.mats.push(m); } o.material = map.get(o.material); }); }
    for (const m of c.mats) { if (m.color) m.color.multiplyScalar(k); if (m.emissive) m.emissive.multiplyScalar(0.12); if (m.emissiveIntensity != null) m.emissiveIntensity *= 0.3; }
    if (c.plumes) for (const p of c.plumes) p.visible = false;
  }
  makeWreck(c, instant) {
    c.state = 'wreck'; if (c.mixer) { c.mixer.stopAllAction(); c.mixer = null; }
    if (instant) { this.darken(c, 0.4); c.pitch = -0.07; c.roll = 0.05; }
    else { c.pitch = Math.max(c.pitch, -0.09); c.roll = Math.sign(c.roll || 1) * Math.min(0.07, Math.abs(c.roll)); }
    const gy = this.ground(c.outer.position.x, c.outer.position.z); c.outer.position.y = gy + 14; c.outer.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ'); c.gT = 0;
  }

  // keep a car out of the hull (flying into it, or driving into the wreck)
  collide(car) {
    let hit = 0;
    for (const c of this.carriers) {
      const v = this._v.set(car.x, (car.y || 0) + 0.6, car.z); c.body.worldToLocal(v);
      const m = 1.2 / SCALE; if (Math.abs(v.x) > HB.x + m || Math.abs(v.z) > HB.z + m || v.y < HB.y0 - m || v.y > HB.y1 + m) continue;
      const px = HB.x + m - Math.abs(v.x), pz = HB.z + m - Math.abs(v.z), pyT = HB.y1 + m - v.y, pyB = v.y - (HB.y0 - m);
      const mn = Math.min(px, pz, pyT, pyB);
      if (mn === px) v.x = Math.sign(v.x || 1) * (HB.x + m); else if (mn === pz) v.z = Math.sign(v.z || 1) * (HB.z + m); else if (mn === pyT) v.y = HB.y1 + m; else v.y = HB.y0 - m;
      c.body.localToWorld(v); const sp = Math.hypot(car.vx || 0, car.vz || 0, car.vy || 0);
      car.x = v.x; car.z = v.z; if (mn === pyT || mn === pyB) { car.y = v.y - 0.6; if (car.vy != null) car.vy = mn === pyT ? Math.max(0, car.vy) : Math.min(0, car.vy); }
      else { const nx = car.x - c.outer.position.x, nz = car.z - c.outer.position.z, nl = Math.hypot(nx, nz) || 1; const dot = ((car.vx || 0) * nx + (car.vz || 0) * nz) / nl; if (dot < 0) { car.vx -= 1.6 * dot * nx / nl; car.vz -= 1.6 * dot * nz / nl; } }
      hit = Math.max(hit, sp);
    }
    return hit;
  }

  // ---- smoke and fire ----
  puff(x, y, z, size, life, col, vy, fire) {
    if (this.puffs.length > 220) { const o = this.puffs.shift(); this.scene.remove(o.s); o.s.material.dispose(); }
    const m = new THREE.SpriteMaterial({ map: this.tex, color: col, transparent: true, depthWrite: false, opacity: fire ? 0.95 : 0.7, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true }); thinFog(m, 0.5);
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size * 0.4); s.material.rotation = Math.random() * 6.28; this.scene.add(s);
    this.puffs.push({ s, life, max: life, size, vy, fire, dx: (Math.random() - 0.5) * 3, dz: (Math.random() - 0.5) * 3 });
  }
  hullPoint(c, top = true) { this._w.set((Math.random() - 0.5) * 30, top ? 2 + Math.random() * 3 : -6 + Math.random() * 8, (Math.random() - 0.5) * 108); c.body.localToWorld(this._w); return this._w; }

  update(dt, ctx = {}) {
    this.t += dt; const me = this.o.me ? this.o.me() : null; this.diving = !!ctx.diving;
    for (const c of [...this.carriers]) {
      // the world re-centred: put it back over its city hall
      if (c.lat0 !== this.world.lat0) { const [x, z] = this.world.proj(c.hall.lat, c.hall.lon); c.outer.position.x = c.x = x; c.outer.position.z = c.z = z; c.lat0 = this.world.lat0; }
      const d = me ? Math.hypot(c.x - me.x, c.z - me.z) : 0;
      if (d > 9000 && c.key !== (this.town && this.town.key)) { this.remove(c); continue; }
      if (c.mixer && d < 4000) c.mixer.update(dt);
      // ground under it (tiles load in after we spawn)
      if ((c.gT -= dt) <= 0 && c.state !== 'falling') { c.gT = 1.5; const gy = this.ground(c.x, c.z); if (c.state === 'alive') c.baseY = gy + HOVER; else c.outer.position.y = gy + 14; }
      if (c.state === 'alive') {
        c.drift += dt * 0.05; const p = c.outer.position;
        p.x = c.x + Math.sin(c.drift) * 40; p.z = c.z + Math.cos(c.drift * 0.7) * 40; p.y += ((c.baseY ?? p.y) - p.y) * Math.min(1, dt * 0.5);
        c.outer.rotation.set(0, c.yaw + Math.sin(c.drift * 0.5) * 0.15, Math.sin(this.t * 0.4) * 0.01, 'YXZ');
        if (c.bar) { c.bar.position.set(p.x, p.y + 6 * SCALE, p.z); c.bar.visible = d < 5000 && ctx.show !== false; if (c.barHp !== c.hp) this.drawBar(c); }
        // hurt: smoke pours out of it
        const k = 1 - c.hp / MAX_HP; if (k > 0.3 && d < 3000 && (c.smokeT -= dt) <= 0) { c.smokeT = 0.5 / k; const q = this.hullPoint(c); this.puff(q.x, q.y, q.z, 14 + 18 * k, 4 + 2 * k, 0x2c2a28, 6, false); if (k > 0.6) this.puff(q.x, q.y + 2, q.z, 8, 0.7, 0xff7a2a, 3, true); }
        if (c.hitT > 0) c.hitT -= dt;
        // its turrets shoot back when you're close
        if (me && ctx.hostile !== false && this.o.shoot) this.turretFire(c, me, dt, d);
      } else if (c.state === 'falling') {
        const p = c.outer.position; c.vy = Math.max(-48, c.vy - 7 * dt); p.y += c.vy * dt;
        c.pitch = Math.max(-0.26, c.pitch + c.pr * dt); c.roll = Math.max(-0.2, Math.min(0.2, c.roll + c.rr * dt)); c.outer.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
        if (c.mixer) c.mixer.update(dt * 0.3);
        if ((c.boomT -= dt) <= 0) { c.boomT = 0.25 + Math.random() * 0.4; const q = this.hullPoint(c, Math.random() < 0.6); try { this.o.boom && this.o.boom(q.x, q.y, q.z, 8 + Math.random() * 10, false); } catch { } }
        for (let i = 0; i < 3; i++) { const q = this.hullPoint(c); this.puff(q.x, q.y, q.z, 22 + Math.random() * 20, 6 + Math.random() * 3, 0x1e1c1b, 3, false); }
        { const q = this.hullPoint(c); this.puff(q.x, q.y, q.z, 14 + Math.random() * 10, 0.8, 0xff6a1a, 2, true); }
        const gy = this.ground(p.x, p.z);
        {
          if (p.y < gy + 14) { p.y = gy + 14; this.makeWreck(c, false); try { this.o.boom && this.o.boom(p.x, gy + 10, p.z, 40, true); this.o.onImpact && this.o.onImpact(c); } catch { }
            for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = 60 + Math.random() * 160; this.puff(p.x + Math.cos(a) * r, gy + 4, p.z + Math.sin(a) * r, 30 + Math.random() * 30, 5 + Math.random() * 3, 0x8a7a66, 4, false); } }
        }
      } else if (c.state === 'wreck') {
        // the wreck keeps smouldering
        if (d < 3500 && (c.smokeT -= dt) <= 0) { c.smokeT = 0.35; const q = this.hullPoint(c); this.puff(q.x, q.y, q.z, 20 + Math.random() * 16, 8 + Math.random() * 4, 0x33302d, 5, false); if (Math.random() < 0.3) this.puff(q.x, q.y, q.z, 9, 0.9, 0xff7a2a, 2, true); }
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]; p.life -= dt; if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); this.puffs.splice(i, 1); continue; }
      const k = 1 - p.life / p.max; p.s.position.y += p.vy * dt * (1 - k * 0.5); p.s.position.x += p.dx * dt; p.s.position.z += p.dz * dt;
      p.s.scale.setScalar(p.size * (0.4 + k * (p.fire ? 0.6 : 1.4))); p.s.material.opacity = (p.fire ? 0.95 : 0.7) * (k < 0.1 ? k * 10 : 1 - k);
    }
    try { if (ctx.show !== false) this.forces.muster(this.carriers, dt); this.forces.update(dt, me, ctx); } catch (e) { if (!this.fFail) { this.fFail = 1; console.warn('[federation] patrols:', e); } }
    this.updateHud(dt, ctx);
  }
  turretFire(c, me, dt, d) {
    const dz3 = Math.hypot(d, (me.y || 0) - c.outer.position.y);
    // turn the turrets to face you
    for (const t of c.turrets) { t.getWorldPosition(this._w); const a = Math.atan2(me.x - this._w.x, me.z - this._w.z) - c.outer.rotation.y, da = wrapA(a - t.rotation.y); t.rotation.y += Math.max(-dt * 1.5, Math.min(dt * 1.5, da)); }
    if (dz3 > 360) { c.burst = 0; return; }
    const pick = () => { let b = null, bd = 1e9; for (const t of c.turrets) { t.getWorldPosition(this._w); const dd = this._w.distanceToSquared(this._v.set(me.x, me.y || 0, me.z)); if (dd < bd) { bd = dd; b = this._w.clone(); } } return b || c.outer.position.clone(); };
    if ((c.fireT -= dt) <= 0) { c.fireT = 2.6 + Math.random() * 1.6; c.burst = 6; c.burstT = 0; }
    if (c.burst > 0 && (c.burstT -= dt) <= 0) {
      c.burst--; c.burstT = 0.11; const o = pick(), tgt = new THREE.Vector3(me.x + (me.vx || 0) * 0.5, (me.y || 0) + 0.7, me.z + (me.vz || 0) * 0.5), dir = tgt.sub(o).normalize();
      o.addScaledVector(dir, 6); try { this.o.shoot(o, dir, 'mg'); } catch { }
    }
    if ((c.rocketT -= dt) <= 0) { c.rocketT = 7 + Math.random() * 5; const o = pick(), dir = new THREE.Vector3(me.x, (me.y || 0) + 0.5, me.z).sub(o).normalize(); o.addScaledVector(dir, 6); try { this.o.shoot(o, dir, 'rocket'); } catch { } }
  }
  dots() { return this.carriers.map(c => ({ x: c.outer.position.x, z: c.outer.position.z, yaw: c.outer.rotation.y, dead: c.state !== 'alive', hp: c.hp / MAX_HP, kind: 'carrier' })).concat(this.forces.dots()); }

  // ---- the objective line at the top of the screen ----
  updateHud(dt, ctx) {
    if ((this.hudT -= dt) > 0) return; this.hudT = 0.25;
    if (!this.hud) { this.hud = document.createElement('div'); this.hud.className = 'fedobj'; this.hud.hidden = true; document.body.appendChild(this.hud); }
    const me = this.o.me ? this.o.me() : null; let c = null, bd = 1e9;
    if (me && ctx.show !== false) for (const k of this.carriers) { if (k.state !== 'alive') continue; const d = Math.hypot(k.outer.position.x - me.x, k.outer.position.z - me.z); if (d < bd) { bd = d; c = k; } }
    let html = '';
    if (c) {
      const a = Math.atan2(c.outer.position.x - me.x, c.outer.position.z - me.z) - (me.yaw || 0), deg = -a * 180 / Math.PI;
      const dist = bd < 1000 ? `${Math.round(bd / 10) * 10} m` : `${(bd / 1000).toFixed(1)} km`, k = c.hp / MAX_HP;
      html = `<i class="fo-logo"></i><b>OBJECTIVE</b><span>Destroy the Federation carrier over ${esc(c.town.name)}</span><i class="fo-arrow" style="transform:rotate(${deg.toFixed(0)}deg)">▲</i><em>${dist}</em><s style="--k:${k.toFixed(3)}"></s>`;
    } else if (me && ctx.show !== false && this.town && this.isFree(this.town.key)) html = `<b>LIBERATED</b><span>${esc(this.town.name)} is free · drive on to the next town</span>`;
    else if (me && ctx.show !== false && this.pending) html = `<b>OBJECTIVE</b><span>Scanning for Federation forces…</span>`;
    if (this.hud.dataset.h !== html) { this.hud.dataset.h = html; this.hud.innerHTML = html; }
    else if (c) { const ar = this.hud.querySelector('.fo-arrow'); if (ar) { const a = Math.atan2(c.outer.position.x - me.x, c.outer.position.z - me.z) - (me.yaw || 0); ar.style.transform = `rotate(${(-a * 180 / Math.PI).toFixed(0)}deg)`; } }
    this.hud.hidden = !html;
  }

  // ---- the Liberation Log ----
  ensure() {
    if (this.el) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div'); el.className = 'fl-wrap'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Liberation log');
    el.addEventListener('click', ev => { if (ev.target === el || ev.target.closest('[data-fl-close]')) this.close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && this.open_) this.close(); });
    document.body.appendChild(el);
  }
  open() { this.ensure(); this.el.hidden = false; this.open_ = true; this.render(); requestAnimationFrame(() => this.el.classList.add('in')); }
  close() { if (!this.el) return; this.el.classList.remove('in'); this.open_ = false; try { this.o.onClose && this.o.onClose(); } catch { } setTimeout(() => { if (!this.open_) this.el.hidden = true; }, 220); }
  render() {
    try { this.o.onCount && this.o.onCount(this.count); } catch { }
    if (!this.el || !this.open_) return;
    const L = this.list, countries = new Set(L.map(e => e.cc).filter(Boolean)).size;
    const rows = L.map((e, i) => `<li><span class="fl-n">${L.length - i}</span><div><h3>${esc(e.name)}</h3><p>${flag(e.cc)} ${esc([e.region, e.country].filter(Boolean).join(', '))}</p><p class="fl-hall">Carrier downed over ${esc(e.hall || 'city hall')}</p></div><time>${fmtDate(e.t)}</time><b class="fl-stamp">LIBERATED</b></li>`).join('');
    this.el.innerHTML = `<div class="fl-book"><header><img class="fl-logo" src="${LOGO_URL}" alt=""><div><h2>Liberation Log</h2><p>${L.length ? `${L.length} ${L.length === 1 ? 'town' : 'towns'} freed from the Intergalactic Federation Force · ${countries} ${countries === 1 ? 'country' : 'countries'}` : 'The Intergalactic Federation Force holds every town'}</p></div><button class="fl-x" data-fl-close aria-label="Close">✕</button></header>
      ${L.length ? `<ol class="fl-list">${rows}</ol>` : `<div class="fl-empty"><p><img src="${LOGO_URL}" alt="Federation carrier" width="220"></p><p>In World Drive, a Federation aircraft carrier hovers over every town's city hall. Shoot one down (fit a weapon at Blick's Shooting Goods) and the town shows up here.</p></div>`}
      <p class="fl-foot">Reset this in Settings › Federation progress.</p></div>`;
  }
}
const wrapA = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function shade(hex) { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * 0.62).toString(16).padStart(2, '0')).join(''); }
const CSS = `
.fl-wrap{position:fixed;inset:0;z-index:120;display:grid;place-items:center;background:rgba(4,6,12,.72);opacity:0;transition:opacity .2s;font-family:system-ui,sans-serif}
.fl-wrap.in{opacity:1}.fl-wrap[hidden]{display:none}
.fl-book{width:min(640px,94vw);max-height:88vh;overflow:auto;padding:20px 22px;border-radius:18px;background:linear-gradient(180deg,#141a24,#0d1118);border:1px solid #2a3344;color:#e9eef6;box-shadow:0 24px 70px rgba(0,0,0,.6)}
.fl-book header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.fl-book header>div{flex:1}.fl-logo{width:92px;height:auto;flex:none}
.fl-book h2{margin:0;font-size:1.5rem;letter-spacing:.04em;text-transform:uppercase}
.fl-book header p{margin:4px 0 0;color:#9aa6ba;font-size:.85rem}
.fl-x{border:0;background:#222a38;color:#fff;width:36px;height:36px;border-radius:10px;font-size:1rem}
.fl-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.fl-list li{position:relative;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;background:#1a2130;border:1px solid #273042;overflow:hidden}
.fl-n{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#2b3548;font-weight:800;color:#ffd36b}
.fl-list h3{margin:0;font-size:1.05rem}.fl-list p{margin:2px 0 0;color:#9aa6ba;font-size:.8rem}.fl-list .fl-hall{color:#7f8aa0;font-size:.74rem}
.fl-list time{color:#cfd6e2;font-size:.8rem;white-space:nowrap}
.fl-stamp{position:absolute;right:92px;top:50%;transform:translateY(-50%) rotate(-12deg);border:2px solid rgba(80,220,120,.55);color:rgba(80,220,120,.6);padding:2px 8px;border-radius:6px;font-size:.78rem;letter-spacing:.12em;pointer-events:none}
.fl-empty{text-align:center;color:#aab4c4;padding:20px 8px}.fl-empty p:first-child{font-size:2.6rem;margin:0}
.fl-foot{margin:14px 0 0;color:#6f7a8e;font-size:.75rem;text-align:center}
@media (max-width:520px){.fl-stamp{display:none}}
`;
