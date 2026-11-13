import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBuilding, newBuilders, buildingMaterials } from './buildings.js';
import { WaterIndex, WATER_TAGS, assembleRings, waterMaterial } from './water.js';
import { Elevation, terrainGeometry, GS } from './terrain.js';
import { asphaltTexture, pavingTexture, grassTexture, concreteTexture, foliageTexture, barkTexture, planarUV, wallUV } from './textures.js';
import { TileCache } from './tilecache.js';
import { poiKind, poiMaterials, brandBuilding, gasStation, FOOD } from './pois.js';
const TERRAIN_R = 900, TERRAIN_UNLOAD = 1300;

// Endless world built live from OpenStreetMap data.
const TILE = 320;           // meters per tile edge
const LOAD_R = 780;         // load tiles whose center is within this distance (beyond the fog, so nothing appears in view)
const MAX_INFLIGHT = 2;     // parallel map requests
const FADE_MS = 700;        // new tiles fade in instead of popping
const UNLOAD_R = 1500;
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const CELL = 24;            // collision hash cell
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const ROAD_W = { motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6.5, residential: 7.5, unclassified: 7, living_street: 6, service: 4.5, road: 7, track: 3.6, pedestrian: 5, footway: 2.4, path: 2, cycleway: 2.4, steps: 2, bridleway: 2 };
const ROAD_C = { motorway: '#4a4553', trunk: '#4a4553', primary: '#46454e', secondary: '#48474f', tertiary: '#4b4a52', residential: '#55545c', unclassified: '#55545c', living_street: '#5d5c63', service: '#5f5e65', track: '#8b7a5c', pedestrian: '#9a958c', footway: '#a59e90', path: '#9f9480', cycleway: '#7c8fa0', steps: '#a59e90', bridleway: '#9f9480' };
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const WALK = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'pedestrian']);
const WALLS = ['#f2d7b6', '#e9c4a7', '#d9d2c5', '#c9d4dc', '#f0e2c8', '#e3b7a0', '#cdd6c4', '#ead0d7', '#d7cbe0', '#f4ead8'];

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

function bbOf(poly) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; }
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; }
function centroidLL(g) { if (!g || !g.length) return null; let a = 0, b = 0; const n = g.length > 1 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1] ? g.length - 1 : g.length; for (let i = 0; i < n; i++) { a += g[i][0]; b += g[i][1]; } return [a / n, b / n]; }
// gas stations and Wicdonald's from raw OSM elements (nodes or ways), de-duplicated
function collectPois(els, center) {
  const out = [], seen = new Set();
  for (const el of els) {
    if (el.type === 'relation' || !el.tags) continue; const kind = poiKind(el.tags); if (!kind) continue;
    const key = el.type[0] + el.id; if (seen.has(key)) continue; const c = center(el); if (!c) continue; seen.add(key);
    const decor = el.tags.highway === 'traffic_signals' ? 'traffic_light' : (el.tags.traffic_sign || el.tags.highway === 'stop' || el.tags.highway === 'give_way' ? 'road_sign' : null);
    if (kind || decor) out.push({ key, kind: kind || decor, lat: c[0], lon: c[1], wayId: el.type === 'way' ? el.id : null, building: !!el.tags.building, name: el.tags.name || '', sign: el.tags.traffic_sign || el.tags.highway || '' });
  }
  return out;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.tiles = new Map(); this.queue = []; this.loading = null; this.wayIds = new Set();
    this.roadCells = new Map(); this.bldCells = new Map(); this.water = new WaterIndex(); this.relQueue = []; this.relBusy = false; this.elev = new Elevation(); this.chunks = new Map(); this.areas = []; this.minH = 0; this.elevReady = false;
    const gt = grassTexture(); this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: gt });
    this.cache = new TileCache(); this.inflight = new Set(); this.fading = []; this.built = { key: 'built', meshes: [], cells: [], ids: [] }; this.bridges = 0; this.pois = []; this.poiKeys = new Set();
    this.overpassBad = 0; this.status = ''; this.onStatus = null; this.failures = 0;
    this.roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTexture(), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.pathMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: pavingTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.concreteMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: concreteTexture(), roughness: 0.9 });
    this.lineMat = new THREE.MeshStandardMaterial({ color: '#f3e3b0', roughness: 0.7, emissive: '#2a2410', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.edgeMat = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7, emissive: '#1c1c1c', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.bldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    this.areaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.treeMat = [new THREE.MeshStandardMaterial({ color: '#8a6a4c', map: barkTexture(), roughness: 1 }), new THREE.MeshStandardMaterial({ color: '#4f8c4f', map: foliageTexture(), roughness: 0.95, flatShading: true })];
    this.treeGeo = makeTreeGeo();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: '#8fae78', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.ground = ground; scene.add(ground);
    this.active = false;
  }
  setOrigin(lat, lon) {
    this.clear(); this.lat0 = lat; this.lon0 = lon; this.cos0 = Math.cos(lat * Math.PI / 180);
    this.elevReady = false; const gen = this.gen;
    this.elev.reset(this).then(() => { if (gen === this.gen) { this.elevReady = true; } });
  }
  heightAt(x, z) { return this.elev.at(x, z); }
  // drivable surface height: terrain, or a bridge deck the car can reach from curY
  groundY(x, z, curY = null) {
    let h = this.elev.at(x, z);
    for (const s of this.nearbySegs(x, z)) {
      if (!s.bridge) continue; const ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1; let k = ((x - s.x0) * ex + (z - s.z0) * ez) / l2; k = Math.max(0, Math.min(1, k));
      if (Math.hypot(x - (s.x0 + ex * k), z - (s.z0 + ez * k)) > s.hw + 0.4) continue;
      const by = s.y0 + (s.y1 - s.y0) * k; if (by > h && (curY == null || by < curY + 2.2)) h = by;
    }
    return h;
  }
  colorAt(x, z, c) {
    if (this.water.inside(x, z)) { c.set('#a9a582'); return; }
    let col = null;
    for (const a of this._areaCand || this.areas) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && pip(x, z, a.poly)) { col = a.col; if (a.pri) break; }
    c.set(col || '#8fae78'); const n = hash((Math.floor(x / GS) * 73856093) ^ (Math.floor(z / GS) * 19349663)); c.multiplyScalar(0.94 + n * 0.1);
  }
  buildChunk(ch) {
    if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
    const x0 = ch.i * TILE, z0 = ch.j * TILE;
    this._areaCand = this.areas.filter(a => !(a.x1 < x0 || a.x0 > x0 + TILE || a.z1 < z0 || a.z0 > z0 + TILE));
    const g = terrainGeometry(this.elev, x0, z0, TILE, (x, z, c) => this.colorAt(x, z, c), (x, z) => this.water.inside(x, z));
    this._areaCand = null;
    g.computeBoundingBox(); this.minH = Math.min(this.minH, g.boundingBox.min.y);
    planarUV(g, 14); const fresh = !ch.built; ch.built = true;
    const m = new THREE.Mesh(g, this.terrainMat); m.receiveShadow = true; this.group.add(m); ch.mesh = m; if (fresh) this.fadeIn([m]);
  }
  refreshChunks(bb) {
    for (const ch of this.chunks.values()) {
      if (ch.state !== 'ready') continue; const x0 = ch.i * TILE, z0 = ch.j * TILE;
      if (bb.x1 < x0 || bb.x0 > x0 + TILE || bb.z1 < z0 || bb.z0 > z0 + TILE) continue; this.buildChunk(ch);
    }
  }
  proj(lat, lon) { return [(lon - this.lon0) * this.cos0 * 111320, -(lat - this.lat0) * 110540]; }
  unproj(x, z) { return [this.lat0 - z / 110540, this.lon0 + x / (this.cos0 * 111320)]; }
  clear() {
    this.water.clear(); this.relQueue = []; this.areas = []; this.minH = 0;
    for (const ch of this.chunks.values()) if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    this.chunks.clear();
    for (const t of this.tiles.values()) this.disposeTile(t);
    for (const m of this.built.meshes) { this.group.remove(m); m.geometry.dispose(); } this.built = { key: 'built', meshes: [], cells: [], ids: [] }; this.bridges = 0;
    for (const f of this.fading) f.restore(); this.fading = [];
    this.tiles.clear(); this.queue = []; this.pois = []; this.poiKeys.clear(); this.wayIds.clear(); this.roadCells.clear(); this.bldCells.clear();
    for (const c of this.inflight) c.abort(); this.inflight.clear(); this.loading = null; this.gen = (this.gen || 0) + 1;
  }
  setVisible(v) { this.group.visible = v; this.ground.visible = v; this.active = v; }
  disposeTile(t, rehome = false) {
    const freed = new Set(t.ids); this._disposeTile(t);
    if (!rehome || !freed.size) return;
    // ways shared with neighbouring tiles were only drawn by this tile: hand them over so they don't vanish
    for (const o of this.tiles.values()) {
      if (o === t || o.state !== 'ready' || !o.raw) continue;
      const sub = o.raw.filter(w => freed.has(w.id) && !this.wayIds.has(w.id)); if (!sub.length) continue;
      sub.rels = []; this.buildTile(o, sub, true); for (const w of sub) freed.delete(w.id); if (!freed.size) break;
    }
  }
  _disposeTile(t) {
    try { if (this.lights) this.lights.removeTile(t); } catch (e) { console.warn('[overpass] lights removeTile', e); }
    this.areas = this.areas.filter(a => a.tile !== t.key); if (t.poiKeys) { this.pois = this.pois.filter(p => p.tile !== t.key); t.poiKeys.forEach(k => this.poiKeys.delete(k)); t.poiKeys = []; } for (const m of t.meshes) { this.group.remove(m); if (!m.userData.sharedGeo) m.geometry.dispose(); } t.meshes = []; t.treeSet = null; for (const id of t.ids) this.wayIds.delete(id); for (const [k, list] of t.cells) { const arr = list.road ? this.roadCells : this.bldCells; const cur = arr.get(k); if (cur) arr.set(k, cur.filter(o => o.tile !== t.key)); }
  }
  tileCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === 'ready') n++; return n; }
  update(x, z, vx = 0, vz = 0) {
    this.ground.position.set(x, this.minH - 2.5, z);
    this.stepFades();
    if (!this.active || !this.elevReady) return;
    {
      const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), R = Math.ceil(TERRAIN_R / TILE), gen = this.gen;
      for (let i = ti - R; i <= ti + R; i++) for (let j = tj - R; j <= tj + R; j++) {
        const key = i + ',' + j; if (this.chunks.has(key)) continue;
        if (Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - z) > TERRAIN_R) continue;
        const ch = { i, j, key, state: 'loading', mesh: null }; this.chunks.set(key, ch);
        this.elev.ensure(i * TILE - GS, j * TILE - GS, (i + 1) * TILE + GS, (j + 1) * TILE + GS).then(() => { if (gen !== this.gen || this.chunks.get(key) !== ch) return; ch.state = 'ready'; this.buildChunk(ch); });
      }
      for (const [key, ch] of this.chunks) if (Math.hypot((ch.i + 0.5) * TILE - x, (ch.j + 0.5) * TILE - z) > TERRAIN_UNLOAD) { if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); } this.chunks.delete(key); }
    }
    const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), R = Math.ceil(LOAD_R / TILE);
    for (let i = ti - R; i <= ti + R; i++) for (let j = tj - R; j <= tj + R; j++) {
      const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE, d = Math.hypot(cx - x, cz - z);
      const key = i + ',' + j;
      if (d < LOAD_R && !this.tiles.has(key)) { const t = { key, i, j, state: 'queued', meshes: [], ids: [], cells: [] }; this.tiles.set(key, t); this.queue.push(t); }
    }
    for (const [key, t] of this.tiles) { const d = Math.hypot((t.i + 0.5) * TILE - x, (t.j + 0.5) * TILE - z); if (d > UNLOAD_R && t.state !== 'loading') { this.tiles.delete(key); this.disposeTile(t, true); const qi = this.queue.indexOf(t); if (qi >= 0) this.queue.splice(qi, 1); } }
    // prioritise tiles where the car is heading (look ahead up to ~4s / 260m)
    if (this.queue.length && this.inflight.size < MAX_INFLIGHT && performance.now() > (this.retryAt || 0)) {
      const sp = Math.hypot(vx, vz), la = Math.min(260, sp * 4), px = x + (sp > 1 ? vx / sp * la : 0), pz = z + (sp > 1 ? vz / sp * la : 0);
      const pri = t => { const cx = (t.i + .5) * TILE, cz = (t.j + .5) * TILE; return Math.min(Math.hypot(cx - x, cz - z), Math.hypot(cx - px, cz - pz) + 60); };
      this.queue.sort((a, b) => pri(a) - pri(b));
      while (this.queue.length && this.inflight.size < MAX_INFLIGHT) this.loadTile(this.queue.shift());
    }
  }
  setStatus(s) { this.status = s; this.onStatus && this.onStatus(s); }
  async loadTile(t) {
    t.state = 'loading'; this.loading = t; const gen = this.gen; const tok = { abort: () => t.ctl && t.ctl.abort() }; this.inflight.add(tok);
    const [n, w] = this.unproj(t.i * TILE, t.j * TILE), [s, e] = this.unproj((t.i + 1) * TILE, (t.j + 1) * TILE);
    const south = Math.min(n, s), north = Math.max(n, s), west = Math.min(w, e), east = Math.max(w, e);
    this.setStatus(`Loading map data · ${this.tileCount()} areas ready`);
    let ways = null; const ck = this.cacheKey(t);
    try {
      [ways] = await Promise.all([this.cache.get(ck).then(c => c || this.fetchWays(south, west, north, east, t).then(w => { this.cache.put(ck, w); return w; })), this.elev.ensure(t.i * TILE - 40, t.j * TILE - 40, (t.i + 1) * TILE + 40, (t.j + 1) * TILE + 40)]);
      // ways often run past the tile edge: make sure elevation exists under their full length, so roads never sit at the wrong height
      if (ways && gen === this.gen) await this.ensureWaysElevation(t, ways);
    }
    catch (err) { console.warn('tile failed', err); }
    this.inflight.delete(tok);
    if (gen !== this.gen) return;
    if (this.loading === t) this.loading = null;
    if (!ways) { t.state = 'failed'; this.failures++; this.tiles.delete(t.key); this.setStatus('Map server busy — retrying'); this.retryAt = performance.now() + Math.min(15000, 2500 * this.failures); return; }
    this.failures = 0;
    if (!this.tiles.has(t.key)) return; // unloaded while in flight
    t.raw = ways.filter(w => w.tags.highway || w.tags.building || !WATER_TAGS(w.tags)); this.buildTile(t, ways); t.state = 'ready'; this.fadeIn(t.meshes);
    this.setStatus(this.queue.length ? `Loading map data · ${this.tileCount()} areas ready` : '');
    this.onTile && this.onTile(t);
  }
  cacheKey(t) { return `${this.lat0.toFixed(5)},${this.lon0.toFixed(5)}:${t.i},${t.j}`; }
  async ensureWaysElevation(t, ways) {
    const cx = (t.i + 0.5) * TILE, cz = (t.j + 0.5) * TILE, M = 1100; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const w of ways) { if (!w.tags.highway) continue; for (const [la, lo] of w.geom) { const [x, z] = this.proj(la, lo); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
    if (x0 > x1) return; x0 = Math.max(x0, cx - M); x1 = Math.min(x1, cx + M); z0 = Math.max(z0, cz - M); z1 = Math.min(z1, cz + M);
    const ps = []; for (let x = x0; x <= x1 + 1; x += Math.max(200, (x1 - x0) / 6)) for (let z = z0; z <= z1 + 1; z += Math.max(200, (z1 - z0) / 6)) ps.push(this.unproj(x, z));
    ps.push(this.unproj(x1, z1)); if (this.elev.state !== 'off') await this.elev.ensureLL(ps);
  }
  // smoothly fade freshly built meshes in (per-object material clones, swapped back when done)
  fadeIn(meshes) {
    const items = [];
    for (const m of meshes) {
      if (m.userData.fading) continue; const orig = m.material, list = Array.isArray(orig) ? orig : [orig];
      const clones = list.map(mt => { const c = mt.clone(); c.transparent = true; c.opacity = 0; c.depthWrite = true; return c; });
      m.material = Array.isArray(orig) ? clones : clones[0]; m.userData.fading = true; items.push({ m, orig, clones });
    }
    if (!items.length) return;
    const f = { born: performance.now(), items, restore: () => { for (const it of items) { it.m.material = it.orig; it.m.userData.fading = false; it.clones.forEach(c => c.dispose()); } } };
    this.fading.push(f);
  }
  stepFades() {
    if (!this.fading.length) return; const now = performance.now();
    this.fading = this.fading.filter(f => {
      const k = Math.min(1, (now - f.born) / FADE_MS), e = k * k * (3 - 2 * k);
      if (k >= 1) { f.restore(); return false; }
      for (const it of f.items) for (const c of it.clones) c.opacity = e; return true;
    });
  }
  async fetchWays(s, w, n, e, tile) {
    // Hedged loading: ask the first Overpass mirror, and if it hasn't answered quickly,
    // ask the next mirror and the main OSM API too. The first good answer wins and the rest are cancelled.
    const ctls = []; if (tile) tile.ctl = { abort: () => ctls.forEach(c => c.abort()) };
    const job = (fn, delay, ms) => new Promise((res, rej) => {
      const go = () => { if (done) return rej(new Error('skip')); const c = new AbortController(); ctls.push(c); const to = setTimeout(() => c.abort(), ms); fn(c.signal).then(v => { clearTimeout(to); res(v); }, er => { clearTimeout(to); rej(er); }); };
      delay ? setTimeout(go, delay) : go();
    });
    let done = false; const jobs = [];
    const useOP = performance.now() > this.overpassBad;
    if (useOP) OVERPASS.forEach((url, i) => jobs.push(job(sig => this.fetchOverpass(url, s, w, n, e, sig), i * 3500, 15000).catch(er => { if (er.message !== 'skip') console.warn('overpass', url, er.message); throw er; })));
    jobs.push(job(sig => this.fetchOSM(s, w, n, e, sig), useOP ? 5000 : 0, 25000));
    try { const v = await Promise.any(jobs); done = true; ctls.forEach(c => c.abort()); return v; }
    catch (er) { done = true; if (useOP) this.overpassBad = performance.now() + 60000; throw new Error('all map sources failed'); }
  }
  async fetchOverpass(url, s, w, n, e, signal) {
    const bbox = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
    const q = `[out:json][timeout:20];(way["highway"](${bbox});way["building"](${bbox});way["natural"~"water|wood|tree_row"](${bbox});way["leisure"~"park|pitch|garden"](${bbox});way["landuse"~"grass|forest|meadow|recreation_ground"](${bbox});way["waterway"~"^(riverbank|river|canal)$"](${bbox});way["landuse"~"^(reservoir|basin)$"](${bbox}););out geom;(rel["natural"="water"](${bbox});rel["waterway"="riverbank"](${bbox});rel["landuse"="reservoir"](${bbox}););out tags;(node["natural"="tree"](${bbox});node["highway"~"^(traffic_signals|stop|give_way|street_lamp)$"](${bbox});node["highway"="street_lamp"](${bbox});node["traffic_sign"](${bbox});nwr["amenity"="fuel"](${bbox});nwr["amenity"~"^(fast_food|restaurant)$"]["brand:wikidata"~"^(Q38076|Q177054|Q839466)$"](${bbox});nwr["amenity"~"^(fast_food|restaurant)$"]["name"~"McDonald|Burger King|Domino",i](${bbox});nwr["shop"]["name"~"Price Chopper|Market 32",i](${bbox});nwr["shop"]["brand"~"Price Chopper|Market 32",i](${bbox}););out center tags;`;
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const out = j.elements.filter(el => el.type === 'way' && el.geometry).map(el => ({ id: el.id, tags: el.tags || {}, geom: el.geometry.map(p => [p.lat, p.lon]) }));
    out.rels = j.elements.filter(el => el.type === 'relation' && WATER_TAGS(el.tags)).map(el => el.id);
    out.trees = j.elements.filter(el => el.type === 'node' && el.tags && el.tags.natural === 'tree').map(el => [el.lat, el.lon]);
    out.pois = collectPois(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.center ? [el.center.lat, el.center.lon] : el.geometry ? centroidLL(el.geometry.map(p => [p.lat, p.lon])) : null);
    out.lamps = j.elements.filter(el => el.type === 'node' && el.tags && (el.tags.highway === 'street_lamp' || el.tags.light_source === 'lantern')).map(el => [el.lat, el.lon]);
    return out;
  }
  async fetchOSM(s, w, n, e, signal) {
    // Fallback: the main OSM API (CORS enabled), filtered client-side
    const r = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)}`, { signal });
    if (!r.ok) throw new Error('OSM API ' + r.status);
    const j = await r.json(); const nodes = new Map();
    for (const el of j.elements) if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    const out = [];
    for (const el of j.elements) {
      if (el.type !== 'way' || !el.tags) continue; const t = el.tags;
      if (!(t.highway || t.building || /water|wood|tree_row/.test(t.natural || '') || /park|pitch|garden/.test(t.leisure || '') || /grass|forest|meadow|recreation_ground|reservoir|basin/.test(t.landuse || '') || /^(riverbank|river|canal)$/.test(t.waterway || ''))) continue;
      const geom = el.nodes.map(id => nodes.get(id)).filter(Boolean); if (geom.length < 2) continue;
      out.push({ id: el.id, tags: t, geom });
    }
    out.rels = j.elements.filter(el => el.type === 'relation' && el.tags && el.tags.type === 'multipolygon' && WATER_TAGS(el.tags) && el.members.length < 3000).map(el => el.id);
    out.trees = j.elements.filter(el => el.type === 'node' && el.tags && el.tags.natural === 'tree').map(el => [el.lat, el.lon]);
    out.pois = collectPois(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.type === 'way' ? centroidLL(el.nodes.map(id => nodes.get(id)).filter(Boolean)) : null);
    out.lamps = j.elements.filter(el => el.type === 'node' && el.tags && (el.tags.highway === 'street_lamp' || el.tags.light_source === 'lantern')).map(el => [el.lat, el.lon]);
    return out;
  }
  addCell(map, x0, z0, x1, z1, obj, t) {
    const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL), c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const k = i + ',' + j; let l = map.get(k); if (!l) { l = []; map.set(k, l); } l.push(obj); t.cells.push([k, { road: map === this.roadCells }]); }
  }
  buildTile(t, ways, partial = false) {
    const roadGeos = [], pathGeos = [], sideGeos = [], lineGeos = [], edgeGeos = [], bldGeos = [], areaGeos = [], trees = [], treeAreas = [], treeRows = []; const Bs = newBuilders(); let areaBB = null;
    const pois = this.preparePois(t, ways), poiBld = new Map(); for (const p of pois) if (p.bwId != null && !p.decorOnly) poiBld.set(p.bwId, p);
    // When LightSystem is active it draws proper signals / stop signs; otherwise keep the simple poles.
    if (!this.lights) for (const p of pois) if (p.kind === 'traffic_light' || p.kind === 'road_sign') {
      const g = new THREE.Group(), base = this.elev.at(p.x, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, p.kind === 'traffic_light' ? 4.1 : 2.7, 7), new THREE.MeshStandardMaterial({ color: '#55585b', roughness: 0.8 })); pole.position.y = (p.kind === 'traffic_light' ? 2.05 : 1.35); g.add(pole);
      if (p.kind === 'traffic_light') { const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.28), new THREE.MeshStandardMaterial({ color: '#202326', roughness: 0.55 })); box.position.set(0, 3.65, 0); g.add(box); for (let i=0;i<3;i++) { const c = ['#ed3434','#e9b52e','#37c75a'][i], lamp = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:0.45 })); lamp.position.set(0, 3.98-i*0.32, 0.16); g.add(lamp); } }
      else { const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.09), new THREE.MeshStandardMaterial({ color: p.sign.includes('stop') ? '#d92525' : '#f2f0e8', roughness:0.7 })); board.position.y=2.55; g.add(board); }
      g.position.set(p.x, base, p.z); this.group.add(g); t.meshes.push(g);
    }
    for (const wy of ways) {
      const tg0 = wy.tags;
      if (!tg0.highway && !tg0.building) {
        if (tg0.natural === 'tree_row') { if (!partial && wy.geom.length >= 2) treeRows.push(wy.geom.map(([la, lo]) => this.proj(la, lo))); continue; }
        if (!partial && (tg0.natural === 'wood' || tg0.landuse === 'forest' || tg0.leisure === 'park')) treeAreas.push({ id: wy.id | 0, wood: tg0.natural === 'wood' || tg0.landuse === 'forest', pts: wy.geom.map(([la, lo]) => this.proj(la, lo)) });
      }
      if (!tg0.highway && !tg0.building && (WATER_TAGS(tg0) || /^(river|canal)$/.test(tg0.waterway || ''))) {
        if (!this.water.has('w' + wy.id)) {
          const pts = wy.geom.map(([la, lo]) => this.proj(la, lo)), closed = pts.length >= 4 && wy.geom[0][0] === wy.geom[wy.geom.length - 1][0] && wy.geom[0][1] === wy.geom[wy.geom.length - 1][1];
          let ring = null;
          if (closed && tg0.waterway !== 'river' && tg0.waterway !== 'canal') ring = pts.slice(0, -1);
          else if ((tg0.waterway === 'river' || tg0.waterway === 'canal') && !(tg0.tunnel && tg0.tunnel !== 'no') && pts.length >= 2) ring = riverOutline(pts, (parseFloat(tg0.width) || (tg0.waterway === 'river' ? 16 : 9)) / 2);
          if (ring) { const bb = this.water.addGroup('w' + wy.id, [ring]); if (bb) this.refreshWater(bb, t); }
        }
        continue;
      }
      if (this.wayIds.has(wy.id)) continue;
      const tg = wy.tags; const pts = wy.geom.map(([la, lo]) => this.proj(la, lo));
      if (tg.highway && ROAD_W[tg.highway] && tg.area !== 'yes') {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        const type = tg.highway, w = ROAD_W[type] * (tg.lanes ? Math.min(1.6, Math.max(0.8, +tg.lanes / 2)) : 1);
        const tunnel = tg.tunnel && tg.tunnel !== 'no', layer = +(tg.layer || 0);
        if (tunnel) continue;
        const y = (MAJOR.has(type) ? 0.16 : WALK.has(type) ? 0.1 : 0.13) + Math.max(0, layer) * 0.005;
        const dp = densify(pts, 4), bridge = !!(tg.bridge && tg.bridge !== 'no');
        let hs, H;
        if (bridge) {
          const cum = [0]; for (let i = 1; i < dp.length; i++) cum.push(cum[i - 1] + Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1]));
          const L = cum[cum.length - 1] || 1, ha = this.elev.at(dp[0][0], dp[0][1]), hb = this.elev.at(dp[dp.length - 1][0], dp[dp.length - 1][1]), hump = layer >= 1 ? Math.min(6, L * 0.12) : Math.min(1.5, L * 0.03);
          hs = dp.map((p, i) => { const k = cum[i] / L; return ha + (hb - ha) * k + Math.sin(Math.PI * k) * hump; });
          H = (x, z, i) => hs[i];
        } else { hs = dp.map(p => this.elev.at(p[0], p[1])); H = (x, z) => this.elev.at(x, z); }
        const soft = WALK.has(type) || type === 'track';
        (soft ? pathGeos : roadGeos).push(planarUV(ribbon(dp, w, y, roadTint(ROAD_C[type] || '#55545c', soft), H), soft ? 4 : 9));
        if (bridge) sideGeos.push(wallUV(bridgeSides(dp, w, hs, y), 4));
        if (MAJOR.has(type) && dp.length > 1) { lineGeos.push(dashes(dp, y + 0.02, hs)); if (w >= 8) edgeGeos.push(edgeLines(dp, w / 2 - 0.45, y + 0.02, hs)); }
        const name = tg.name || tg.ref || '';
        for (let i = 0; i < dp.length - 1; i++) {
          const seg = { x0: dp[i][0], z0: dp[i][1], x1: dp[i + 1][0], z1: dp[i + 1][1], hw: w / 2, walk: WALK.has(type), name, type, tile: t.key, bridge, y0: hs[i] + y, y1: hs[i + 1] + y };
          this.addCell(this.roadCells, Math.min(seg.x0, seg.x1) - seg.hw, Math.min(seg.z0, seg.z1) - seg.hw, Math.max(seg.x0, seg.x1) + seg.hw, Math.max(seg.z0, seg.z1) + seg.hw, seg, t);
        }
      } else if (tg.building && pts.length >= 4) {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        if (tg.building === 'roof' || tg['building:part']) continue;
        const poly = pts.slice(0, -1); if (poly.length < 3) continue;
        if (poiBld.has(wy.id) && FOOD.has(poiBld.get(wy.id).kind)) { const b = bbOf(poly); this.addCell(this.bldCells, b.x0, b.z0, b.x1, b.z1, { poly, ...b, tile: t.key }, t); continue; } // drawn as a Wicdonald's below
        let base = 1e9; for (const [x, z] of poly) base = Math.min(base, this.elev.at(x, z)); base -= 0.3;
        const before = {}; for (const k in Bs) before[k] = Bs[k].pos.length;
        try { addBuilding(Bs, poly, tg, wy.id); } catch (e) { console.warn('building', wy.id, e); }
        let top = base + 4; for (const k in Bs) { const P = Bs[k].pos; for (let i = before[k] + 1; i < P.length; i += 3) { P[i] += base; if (P[i] > top) top = P[i]; } }
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        this.addCell(this.bldCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, top, tile: t.key }, t);
      } else if (pts.length >= 4) {
        const nat = tg.natural, isWater = false;
        const isWood = nat === 'wood' || tg.landuse === 'forest';
        const col = isWater ? '#5f9fd0' : isWood ? '#6f9a5e' : tg.leisure === 'pitch' ? '#88b86a' : '#9cc47e';
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        { const poly = pts.slice(0, -1); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          const a = { poly, col: new THREE.Color(col), x0, x1, z0, z1, tile: t.key, pri: tg.leisure === 'pitch' }; this.areas.push(a); areaBB = areaBB ? { x0: Math.min(areaBB.x0, x0), x1: Math.max(areaBB.x1, x1), z0: Math.min(areaBB.z0, z0), z1: Math.max(areaBB.z1, z1) } : { x0, x1, z0, z1 }; }
      }
    }
    if (!partial) this.growTrees(t, ways, trees, treeAreas, treeRows);
    if (pois.length) {
      const acc = {}; for (const p of pois) { if (p.kind === 'traffic_light' || p.kind === 'road_sign') continue; try { this.placePoi(t, p, acc); } catch (e) { console.warn('poi', p.key, e); } }
      const PM = poiMaterials();
      for (const k in acc) { const g = mergeGeometries(acc[k], false); acc[k].forEach(x => x.dispose()); if (!g) continue; const m = new THREE.Mesh(g, PM[k]); m.castShadow = k === 'solid'; m.receiveShadow = k === 'solid'; this.group.add(m); t.meshes.push(m); }
    }
    const add = (geos, mat, shadow) => { if (!geos.length) return; const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); if (!g) return; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = shadow; this.group.add(m); t.meshes.push(m); };
    add(areaGeos, this.areaMat, false); add(roadGeos, this.roadMat, false); add(pathGeos, this.pathMat, false); add(sideGeos, this.concreteMat, true); add(lineGeos, this.lineMat, false); add(edgeGeos, this.edgeMat, false); add(bldGeos, this.bldMat, true);
    const M = buildingMaterials();
    for (const k in Bs) { const g = Bs[k].geometry(); if (!g) continue; const m = new THREE.Mesh(g, M[k]); m.castShadow = k !== 'flat'; m.receiveShadow = true; this.group.add(m); t.meshes.push(m); }
    if (!partial) this.renderWater(t);
    if (areaBB) this.refreshChunks(areaBB);
    for (const id of (ways.rels || [])) if (!this.water.has('r' + id) && !this.water.relPending.has(id)) { this.water.relPending.add(id); this.relQueue.push(id); }
    this.pumpRelations();
    if (trees.length) {
      const m = new THREE.InstancedMesh(this.treeGeo, this.treeMat, trees.length); const o = new THREE.Object3D(), c = new THREE.Color();
      trees.forEach(([x, z, r], i) => { o.position.set(x, this.elev.at(x, z) - 0.2, z); const s = 0.8 + r * 0.7; o.scale.set(s, s * (0.9 + hash(i * 7 + 3) * 0.3), s); o.rotation.y = r * 6; o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        const v = hash(i * 31 + 11); c.setRGB(0.85 + v * 0.25, 0.9 + hash(i * 17 + 5) * 0.2, 0.8 + (1 - v) * 0.2); m.setColorAt(i, c); });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = true; m.userData.sharedGeo = true; this.group.add(m); t.meshes.push(m); t.treeSet = { m, xz: trees.map(([x, z]) => [x, z]), dead: new Uint8Array(trees.length) };
    }
    // Street lamps + traffic signals (lights.js). Needs roadCells already filled above.
    try { if (this.lights && !partial) this.lights.addTile(t, { ways, pois }); } catch (e) { console.warn('[overpass] lights addTile', e); }
  }
  // true where a tree must not stand: on a road, inside a building or in water
  treeBlocked(x, z) {
    if (this.onRoad(x, z, 2.2) || this.water.inside(x, z)) return true;
    const list = this.bldCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (list) for (const b of list) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (pip(x, z, b.poly)) return true; }
    return false;
  }
  // Trees are generated per tile, only inside that tile, from a fixed world grid so tiles never double up or leave gaps,
  // and only once every road, building and lake of the tile is known so none end up on them.
  growTrees(t, ways, trees, areas, rows) {
    const tx0 = t.i * TILE, tz0 = t.j * TILE, tx1 = tx0 + TILE, tz1 = tz0 + TILE, MAXT = 2400;
    const put = (x, z, r) => { if (trees.length >= MAXT || x < tx0 || x >= tx1 || z < tz0 || z >= tz1 || this.treeBlocked(x, z)) return; trees.push([x, z, r]); };
    for (const a of areas) {
      const sp = a.wood ? 9 : 15, bb = bbOf(a.pts), gx0 = Math.max(tx0, bb.x0), gx1 = Math.min(tx1, bb.x1), gz0 = Math.max(tz0, bb.z0), gz1 = Math.min(tz1, bb.z1);
      if (gx0 > gx1 || gz0 > gz1) continue;
      for (let gi = Math.floor(gx0 / sp); gi <= Math.floor(gx1 / sp); gi++) for (let gj = Math.floor(gz0 / sp); gj <= Math.floor(gz1 / sp); gj++) {
        const k = (gi * 73856093) ^ (gj * 19349663) ^ a.id;
        if (!a.wood && hash(k + 7) > 0.6) continue; // parks: scattered, not a forest
        const x = (gi + 0.12 + 0.76 * hash(k)) * sp, z = (gj + 0.12 + 0.76 * hash(k + 17)) * sp;
        if (pip(x, z, a.pts)) put(x, z, hash(k + 3));
      }
    }
    for (const row of rows) for (const [x, z] of densify(row, 6)) put(x, z, hash(Math.floor(x * 7) ^ Math.floor(z * 13)));
    for (const [la, lo] of (ways.trees || [])) { const [x, z] = this.proj(la, lo); put(x, z, hash(Math.floor(x * 7) ^ Math.floor(z * 13)));
    }
  }
  // a lake that finished loading after the trees were placed: take away the trees standing in it
  pruneTreesInWater(bb) {
    for (const t of this.tiles.values()) {
      const ts = t.treeSet; if (!ts) continue; let ch = false;
      for (let i = 0; i < ts.xz.length; i++) { if (ts.dead[i]) continue; const [x, z] = ts.xz[i]; if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue; if (this.water.inside(x, z)) { ts.m.setMatrixAt(i, ZERO_M); ts.dead[i] = 1; ch = true; } }
      if (ch) ts.m.instanceMatrix.needsUpdate = true;
    }
  }
  // gas stations + Wicdonald's whose location is inside this tile; matches them to their OSM building outline when there is one
  preparePois(t, ways) {
    const out = [], x0 = t.i * TILE, z0 = t.j * TILE;
    for (const p0 of (ways.pois || [])) {
      if (this.poiKeys.has(p0.key)) continue; const [x, z] = this.proj(p0.lat, p0.lon);
      if (x < x0 || x >= x0 + TILE || z < z0 || z >= z0 + TILE) continue;
      const p = { ...p0, x, z }; let bw = null;
      if (p.wayId != null && p.building) bw = ways.find(w => w.id === p.wayId);
      else if (p.wayId == null) {
        for (const w of ways) { if (!w.tags.building || w.geom.length < 4) continue; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [la, lo] of w.geom) { a = Math.min(a, la); b = Math.max(b, la); c = Math.min(c, lo); d = Math.max(d, lo); } if (p.lat < a || p.lat > b || p.lon < c || p.lon > d) continue; if (pip(p.lat, p.lon, w.geom)) { bw = w; break; } }
      }
      if (bw) {
        const poly = bw.geom.map(([la, lo]) => this.proj(la, lo)).slice(0, -1), area = Math.abs(polyArea(poly));
        if (p.wayId == null && area > (p.kind === 'store32' ? 24000 : 1800)) continue; // inside a mall or big station building: skip
        p.bwId = bw.id; p.poly = poly; p.levels = +(bw.tags['building:levels'] || 0); p.decorOnly = this.wayIds.has(bw.id);
      }
      this.poiKeys.add(p.key); (t.poiKeys = t.poiKeys || []).push(p.key); out.push(p);
    }
    return out;
  }
  nearRoad(x, z, R = 3) {
    let best = null, bd = 1e9; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) for (const s of (this.roadCells.get(i + ',' + j) || [])) {
      if (s.walk || s.type === 'service' || s.type === 'track') continue;
      const ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1; let k = ((x - s.x0) * ex + (z - s.z0) * ez) / l2; k = Math.max(0, Math.min(1, k));
      const px = s.x0 + ex * k, pz = s.z0 + ez * k, d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = { seg: s, px, pz, d }; }
    }
    return best;
  }
  placePoi(t, p, acc) {
    const near = this.nearRoad(p.x, p.z);
    const M = new THREE.Matrix4(), toW = (cx, cz, yaw, lx, lz) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    const rectCell = (cx, cz, yaw, lx, lz, w, d) => { const poly = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => toW(cx, cz, yaw, lx + a, lz + b)); const bb = bbOf(poly); this.addCell(this.bldCells, bb.x0, bb.z0, bb.x1, bb.z1, { poly, ...bb, tile: t.key }, t); };
    const baseAt = (pts) => { let b = 1e9; for (const [x, z] of pts) b = Math.min(b, this.elev.at(x, z)); return b; };
    let cx, cz, yaw, r;
    if (p.poly) {
      // oriented box around the real footprint, front facing the nearest road
      const P = p.poly; let best = 0, ang = 0; for (let i = 0; i < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; ang = Math.atan2(bz - az, bx - ax); } }
      const u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]]; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const [x, z] of P) { const a = x * u[0] + z * u[1], b = x * v[0] + z * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; cx = u[0] * um + v[0] * vm; cz = u[1] * um + v[1] * vm;
      const tx = near ? near.px - cx : 0, tz = near ? near.pz - cz : 1;
      const cands = [[u, u1 - u0, v1 - v0], [[-u[0], -u[1]], u1 - u0, v1 - v0], [v, v1 - v0, u1 - u0], [[-v[0], -v[1]], v1 - v0, u1 - u0]]; // [front normal, depth, width]
      let pick = cands[2], pd = -1e9; for (const c of cands) { const dd = c[0][0] * tx + c[0][1] * tz; if (dd > pd) { pd = dd; pick = c; } }
      const [fn, D, Wd] = pick; yaw = Math.atan2(fn[0], fn[1]);
      if (FOOD.has(p.kind)) {
        const base = baseAt(P) - 0.3, roofY = Math.max(4, (p.levels || 1) * 3.2), cap = p.kind === 'store32' ? 140 : 60, Wc = Math.min(cap, Math.max(p.kind === 'store32' ? 20 : 6, Wd)), Dc = Math.min(cap, Math.max(p.kind === 'store32' ? 16 : 6, D));
        M.makeRotationY(yaw).setPosition(cx, base, cz); brandBuilding(acc, M, p.kind, Wc, Dc, !p.decorOnly, roofY);
        // the pylon sits outside the outline: give it a small collider
        const [qx, qz] = toW(cx, cz, yaw, Wc / 2 + 2, Dc / 2 + 3.5); rectCell(qx, qz, yaw, 0, 0, 0.7, 0.7);
        r = Math.max(Wd, D) / 2 + 7;
      } else {
        // the mapped building is the shop: put the canopy between it and the road
        const off = D / 2 + 6.5; [cx, cz] = [cx + fn[0] * off, cz + fn[1] * off];
        const base = baseAt([[cx, cz], toW(cx, cz, yaw, -7, -4), toW(cx, cz, yaw, 7, 4), toW(cx, cz, yaw, 7, -4), toW(cx, cz, yaw, -7, 4)]) - 0.05;
        M.makeRotationY(yaw).setPosition(cx, base, cz); gasStation(acc, M, false); r = 8;
      }
    } else {
      cx = p.x; cz = p.z; yaw = 0;
      if (near) {
        let vx = p.x - near.px, vz = p.z - near.pz, L = Math.hypot(vx, vz);
        if (L < 0.5) { const ex = near.seg.x1 - near.seg.x0, ez = near.seg.z1 - near.seg.z0, l = Math.hypot(ex, ez) || 1; vx = -ez / l; vz = ex / l; L = 1; }
        vx /= L; vz /= L; const need = near.seg.hw + (p.kind === 'store32' ? 26 : FOOD.has(p.kind) ? 10.5 : 9);
        if (near.d < need) { cx = near.px + vx * need; cz = near.pz + vz * need; }
        yaw = Math.atan2(-vx, -vz);
      }
      if (FOOD.has(p.kind)) {
        const big = p.kind === 'store32', W = big ? 56 : 16, D = big ? 38 : 11, foot = [toW(cx, cz, yaw, -W / 2, -D / 2), toW(cx, cz, yaw, W / 2, -D / 2), toW(cx, cz, yaw, W / 2, D / 2), toW(cx, cz, yaw, -W / 2, D / 2)];
        M.makeRotationY(yaw).setPosition(cx, baseAt(foot) - 0.3, cz); brandBuilding(acc, M, p.kind, W, D, true);
        rectCell(cx, cz, yaw, 0, 0, W, D); rectCell(cx, cz, yaw, W / 2 + 2.5, D / 2 + 3.5, 0.7, 0.7); r = big ? 38 : 15;
      } else {
        const base = baseAt([[cx, cz], toW(cx, cz, yaw, -9, -12), toW(cx, cz, yaw, 9, 6), toW(cx, cz, yaw, 9, -12), toW(cx, cz, yaw, -9, 6)]) - 0.05;
        // skip the generated shop if a real mapped building already stands there
        const shopFree = [[0, -11.75], [-6, -9], [6, -9], [-6, -14.5], [6, -14.5]].every(([a, b]) => { const [qx, qz] = toW(cx, cz, yaw, a, b); return !this.collide(qx, qz, 0.5); });
        M.makeRotationY(yaw).setPosition(cx, base, cz); gasStation(acc, M, shopFree);
        if (shopFree) rectCell(cx, cz, yaw, 0, -11.75, 13, 6.5); rectCell(cx, cz, yaw, 10, 7.75, 0.5, 0.5); r = 8;
      }
    }
    this.pois.push({ key: p.key, kind: p.kind, x: cx, z: cz, yaw, r, tile: t.key, name: p.name });
  }
  renderWater(t) {
    if (t.waterMesh) { this.group.remove(t.waterMesh); t.waterMesh.geometry.dispose(); t.meshes = t.meshes.filter(m => m !== t.waterMesh); t.waterMesh = null; }
    const g = this.water.geometry(t.i * TILE, t.j * TILE, TILE, -0.25, (x, z) => this.elev.at(x, z)); if (!g) return;
    const m = new THREE.Mesh(g, waterMaterial()); m.receiveShadow = true; this.group.add(m); t.meshes.push(m); t.waterMesh = m;
  }
  refreshWater(bb, except) {
    this.refreshChunks(bb); this.pruneTreesInWater(bb);
    for (const t of this.tiles.values()) {
      if (t === except || t.state !== 'ready') continue;
      const x0 = t.i * TILE, z0 = t.j * TILE;
      if (bb.x1 < x0 || bb.x0 > x0 + TILE || bb.z1 < z0 || bb.z0 > z0 + TILE) continue;
      this.renderWater(t);
    }
  }
  async pumpRelations() {
    if (this.relBusy || !this.relQueue.length) return; this.relBusy = true; const gen = this.gen;
    const id = this.relQueue.shift();
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`, { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) throw new Error('rel ' + r.status);
      const j = await r.json(); if (gen !== this.gen) return;
      const nodes = new Map(), ways = new Map(); let rel = null;
      for (const el of j.elements) { if (el.type === 'node') nodes.set(el.id, el); else if (el.type === 'way') ways.set(el.id, el); else if (el.type === 'relation' && el.id === id) rel = el; }
      if (rel) {
        const mem = rel.members.filter(m => m.type === 'way' && ways.has(m.ref)).map(m => ways.get(m.ref));
        const rings = assembleRings(mem).map(ring => ring.map(nid => nodes.get(nid)).filter(Boolean).map(n => this.proj(n.lat, n.lon)));
        const bb = this.water.addGroup('r' + id, rings); if (bb) this.refreshWater(bb, null);
      }
    } catch (err) { console.warn('water relation', id, err.message); }
    finally { if (gen === this.gen) { this.water.relPending.delete(id); this.relBusy = false; this.pumpRelations(); } else this.relBusy = false; }
  }
  // true when the point is over open water (not on a road/bridge/path)
  inWater(x, z) {
    if (!this.water.inside(x, z)) return false;
    for (const s of this.nearbySegs(x, z)) if (segDist(x, z, s) < s.hw + 0.8) return false;
    return true;
  }
  nearbySegs(x, z) { return this.roadCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }
  onRoad(x, z, pad = 0.6) { for (const s of this.nearbySegs(x, z)) if (!s.walk && segDist(x, z, s) < s.hw + pad) return true; return false; }
  roadInfo(x, z) {
    let best = null, bd = 1e9;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const s of (this.roadCells.get((Math.floor(x / CELL) + di) + ',' + (Math.floor(z / CELL) + dj)) || [])) { const d = segDist(x, z, s) - s.hw; if (d < bd) { bd = d; best = s; } }
    return best ? { seg: best, dist: bd } : null;
  }
  nearestRoadPoint(x, z, radius = 400) {
    let best = null, bd = 1e18;
    for (const list of this.roadCells.values()) for (const s of list) {
      if (s.walk) continue; const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, d = (mx - x) ** 2 + (mz - z) ** 2;
      if (d < bd && d < radius * radius) { bd = d; best = { x: mx, z: mz, yaw: Math.atan2(s.x1 - s.x0, s.z1 - s.z0), seg: s }; }
    }
    return best;
  }
  randomRoadPoints(x, z, r, n) {
    const out = []; const all = [];
    for (const list of this.roadCells.values()) for (const s of list) { if (s.walk) continue; const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; const d = Math.hypot(mx - x, mz - z); if (d < r && d > 30) all.push(s); }
    for (let i = 0; i < n && all.length; i++) { const s = all[Math.floor(Math.random() * all.length)]; const k = Math.random(); out.push([s.x0 + (s.x1 - s.x0) * k, s.z0 + (s.z1 - s.z0) * k]); }
    return out;
  }
  // push a circle (car) out of buildings; returns collision normal or null
  // true when (x,z,y) is on an elevated bridge deck (then buildings below don't block)
  onDeck(x, z, y) {
    for (const s of this.nearbySegs(x, z)) { if (!s.bridge || segDist(x, z, s) > s.hw + 0.5) continue; const ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1; let k = ((x - s.x0) * ex + (z - s.z0) * ez) / l2; k = Math.max(0, Math.min(1, k)); const by = s.y0 + (s.y1 - s.y0) * k; if (Math.abs(by - y) < 1.5 && by - this.elev.at(x, z) > 1.8) return true; }
    return false;
  }
  // ---------- player-built bridges ----------
  // Plans a bridge straight ahead from (x,z) along yaw. Crosses water to the far bank,
  // otherwise builds a 70 m overpass. Returns { ok, len, reason }.
  planBridge(x, z, yaw, y0) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), s0 = 2.5; let wet = false, dry = 0, end = 0;
    for (let d = s0; d <= 420; d += 2) {
      const px = x + fx * d, pz = z + fz * d, w = this.water.inside(px, pz) && !this.onRoad(px, pz, 0);
      if (w) { wet = true; dry = 0; } else if (wet) { dry += 2; if (dry >= 8) { end = d + 4; break; } }
      if (!wet && d >= 70) { end = 70; break; }
    }
    if (!end) return { ok: false, reason: wet ? 'WATER TOO WIDE (MAX 420 m)' : 'NO ROOM' };
    return { ok: true, x0: x + fx * s0, z0: z + fz * s0, x1: x + fx * end, z1: z + fz * end, len: end - s0, water: wet, y0 };
  }
  buildBridge(plan) {
    const W_ = 9, y = 0.16, hw = W_ / 2, L = plan.len;
    const dp = densify([[plan.x0, plan.z0], [plan.x1, plan.z1]], 3);
    const ha = plan.y0 != null ? plan.y0 - y : this.elev.at(plan.x0, plan.z0), hb = this.elev.at(plan.x1, plan.z1), hump = Math.max(2.5, Math.min(9, L * (plan.water ? 0.06 : 0.075)));
    // gentle ramps at the ends, flat-topped arch in the middle
    const hs = dp.map(p => { const k = Math.hypot(p[0] - plan.x0, p[1] - plan.z0) / L, a = Math.min(1, Math.sin(Math.PI * k) * 1.35); return ha + (hb - ha) * k + a * hump; });
    const H = (px, pz, i) => hs[i];
    const t = this.built, meshes = [];
    const mk = (g, mat, sh) => { const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = sh; this.group.add(m); t.meshes.push(m); meshes.push(m); };
    mk(planarUV(ribbon(dp, W_, y, roadTint('#4f4d57', false), H), 9), this.roadMat, false);
    mk(wallUV(bridgeSides(dp, W_, hs, y), 4), this.concreteMat, true);
    mk(dashes(dp, y + 0.02, hs), this.lineMat, false); mk(edgeLines(dp, hw - 0.45, y + 0.02, hs), this.edgeMat, false);
    // pillars down to the ground / river bed wherever the deck is high enough
    const pg = []; let acc = 0;
    for (let i = 1; i < dp.length - 1; i++) {
      acc += Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1]); if (acc < 15) continue; acc = 0;
      const top = hs[i] + y - 1.2, bot = this.elev.at(dp[i][0], dp[i][1]) - 2.5; if (top - bot < 2.2) continue;
      const b = new THREE.BoxGeometry(1.3, top - bot, 1.3); b.translate(dp[i][0], (top + bot) / 2, dp[i][1]); const nb = b.toNonIndexed(); b.dispose();
      nb.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nb.attributes.position.count * 3).fill(0.82), 3)); nb.deleteAttribute('uv'); pg.push(wallUV(nb, 4));
    }
    if (pg.length) { const g = mergeGeometries(pg, false); pg.forEach(g2 => g2.dispose()); if (g) mk(g, this.concreteMat, true); }
    const name = 'Your bridge ' + (++this.bridges);
    for (let i = 0; i < dp.length - 1; i++) {
      const seg = { x0: dp[i][0], z0: dp[i][1], x1: dp[i + 1][0], z1: dp[i + 1][1], hw, walk: false, name, type: 'primary', tile: 'built', bridge: true, built: true, y0: hs[i] + y, y1: hs[i + 1] + y };
      this.addCell(this.roadCells, Math.min(seg.x0, seg.x1) - hw, Math.min(seg.z0, seg.z1) - hw, Math.max(seg.x0, seg.x1) + hw, Math.max(seg.z0, seg.z1) + hw, seg, t);
    }
    this.fadeIn(meshes);
    return { name, hump };
  }
  collide(x, z, rad = 1.3, y = null) {
    const list = this.bldCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    for (const b of list) {
      if (y != null && y > (b.top ?? (this.elev.at(b.x0, b.z0) + 9))) continue;
      if (x < b.x0 - rad || x > b.x1 + rad || z < b.z0 - rad || z > b.z1 + rad) continue;
      const inside = pip(x, z, b.poly);
      let bd = 1e9, bnx = 0, bnz = 0, bpx = 0, bpz = 0;
      const P = b.poly;
      for (let i = 0; i < P.length; i++) {
        const [ax, az] = P[i], [cx, cz] = P[(i + 1) % P.length];
        const ex = cx - ax, ez = cz - az, l2 = ex * ex + ez * ez || 1; let k = ((x - ax) * ex + (z - az) * ez) / l2; k = Math.max(0, Math.min(1, k));
        const px = ax + ex * k, pz = az + ez * k, d = Math.hypot(x - px, z - pz);
        if (d < bd) { bd = d; bpx = px; bpz = pz; }
      }
      if (inside || bd < rad) {
        let nx = x - bpx, nz = z - bpz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; if (inside) { nx = -nx; nz = -nz; }
        const depth = inside ? bd + rad : rad - bd;
        return { nx, nz, depth };
      }
    }
    return null;
  }
}

function segDist(x, z, s) { const ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1; let k = ((x - s.x0) * ex + (z - s.z0) * ez) / l2; k = Math.max(0, Math.min(1, k)); return Math.hypot(x - (s.x0 + ex * k), z - (s.z0 + ez * k)); }
function pip(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
function faceUp(pos) { // make every flat triangle face +Y
  for (let i = 0; i + 8 < pos.length; i += 9) {
    const ax = pos[i], az = pos[i + 2], bx = pos[i + 3], bz = pos[i + 5], cx = pos[i + 6], cz = pos[i + 8];
    const ny = (cx - ax) * (bz - az) - (cz - az) * (bx - ax);
    if (ny < 0) { for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } }
  }
  return pos;
}
function upNormals(n) { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a[i * 3 + 1] = 1; return a; }
function colorArr(hex, n, mul = 1) { const c = new THREE.Color(hex).multiplyScalar(mul); const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } return a; }

// lift the dark road colours so the asphalt texture shows through (texture * vertex colour)
function roadTint(hex, soft) { const c = new THREE.Color(hex); return '#' + c.multiplyScalar(soft ? 1.15 : 1.55).getHexString(); }
function makeTreeGeo() {
  const trunk = new THREE.CylinderGeometry(0.28, 0.42, 2.4, 6); trunk.translate(0, 1.2, 0);
  const c1 = new THREE.ConeGeometry(2.3, 3.8, 8); c1.translate(0, 3.6, 0); const c2 = new THREE.ConeGeometry(1.8, 3.2, 8); c2.translate(0, 5.2, 0); const c3 = new THREE.ConeGeometry(1.1, 2.4, 7); c3.translate(0, 6.7, 0);
  const leaves = mergeGeometries([c1.toNonIndexed(), c2.toNonIndexed(), c3.toNonIndexed()]);
  const g = mergeGeometries([trunk.toNonIndexed(), leaves], true); return g;
}
function edgeLines(pts, off, y, hs) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (!l) continue; const tx = (bx - ax) / l, tz = (bz - az) / l, nx = -tz, nz = tx, ya = y + hs[i], yb = y + hs[i + 1];
    for (const sd of [1, -1]) { const o1 = off * sd - 0.07, o2 = off * sd + 0.07; pos.push(ax + nx * o1, ya, az + nz * o1, ax + nx * o2, ya, az + nz * o2, bx + nx * o2, yb, bz + nz * o2, ax + nx * o1, ya, az + nz * o1, bx + nx * o2, yb, bz + nz * o2, bx + nx * o1, yb, bz + nz * o1); }
  }
  if (!pos.length) pos.push(0, -5, 0, 0, -5, 0, 0, -5, 0); faceUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(upNormals(pos.length / 3), 3)); return g;
}
function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / step)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  return out;
}
function bridgeSides(pts, w, hs, y) {
  const pos = [], col = [], hw = w / 2 + 0.25, c = new THREE.Color('#9a958d'), cd = new THREE.Color('#77736c');
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; const nx = -tz, nz = tx;
    for (const sd of [1, -1]) {
      const ax = a[0] + nx * hw * sd, az = a[1] + nz * hw * sd, bx = b[0] + nx * hw * sd, bz = b[1] + nz * hw * sd, ya = hs[i] + y, yb = hs[i + 1] + y;
      // parapet (both faces) + deck edge band
      const quad = (p, q, r2, s2, cc) => { pos.push(...p, ...q, ...r2, ...p, ...r2, ...s2, ...p, ...r2, ...q, ...p, ...s2, ...r2); for (let k = 0; k < 12; k++) col.push(cc.r, cc.g, cc.b); };
      quad([ax, ya, az], [bx, yb, bz], [bx, yb + 0.9, bz], [ax, ya + 0.9, az], c);
      quad([ax, ya - 1.2, az], [bx, yb - 1.2, bz], [bx, yb, bz], [ax, ya, az], cd);
    }
    // underside
    const L1 = [a[0] + nx * hw, a[1] + nz * hw], R1 = [a[0] - nx * hw, a[1] - nz * hw], L2 = [b[0] + nx * hw, b[1] + nz * hw], R2 = [b[0] - nx * hw, b[1] - nz * hw], ya = hs[i] + y - 1.2, yb = hs[i + 1] + y - 1.2;
    pos.push(L1[0], ya, L1[1], R1[0], ya, R1[1], R2[0], yb, R2[1], L1[0], ya, L1[1], R2[0], yb, R2[1], L2[0], yb, L2[1], L1[0], ya, L1[1], R2[0], yb, R2[1], R1[0], ya, R1[1], L1[0], ya, L1[1], L2[0], yb, L2[1], R2[0], yb, R2[1]);
    for (let k = 0; k < 12; k++) col.push(cd.r, cd.g, cd.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function ribbon(pts, w, y, color, H = () => 0) {
  const n = pts.length, hw = w / 2, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = -tz, nz = tx, scale = 1;
    if (i > 0 && i < n - 1) { // miter
      let t1x = p[0] - a[0], t1z = p[1] - a[1]; const l1 = Math.hypot(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
      const cos = (-t1z) * nx + t1x * nz; scale = Math.min(2.5, 1 / Math.max(0.3, cos));
    }
    const lx = p[0] + nx * hw * scale, lz = p[1] + nz * hw * scale, rx = p[0] - nx * hw * scale, rz = p[1] - nz * hw * scale;
    pos.push(lx, y + H(lx, lz, i), lz, rx, y + H(rx, rz, i), rz);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  // round caps at both ends cover joins between ways
  [pts[0], pts[n - 1]].forEach((p, e) => { const ii = e ? n - 1 : 0, base = pos.length / 3; pos.push(p[0], y + H(p[0], p[1], ii), p[1]); const seg = 10; for (let k = 0; k <= seg; k++) { const an = k / seg * Math.PI * 2, cx = p[0] + Math.cos(an) * hw, cz = p[1] + Math.sin(an) * hw; pos.push(cx, y - 0.002 + H(cx, cz, ii), cz); if (k < seg) idx.push(base, base + 2 + k, base + 1 + k); } });
  const flat = []; for (const k of idx) flat.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  faceUp(flat); const nv = flat.length / 3;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(upNormals(nv), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colorArr(color, nv), 3));
  return g;
}
function dashes(pts, y, hs) {
  const geos = []; let acc = 0;
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (!l) continue; const tx = (bx - ax) / l, tz = (bz - az) / l, nx = -tz * 0.12, nz = tx * 0.12;
    for (let d = (6 - acc % 6) % 6; d < l; d += 6) { const e = Math.min(l, d + 3); const x0 = ax + tx * d, z0 = az + tz * d, x1 = ax + tx * e, z1 = az + tz * e, ya = y + hs[i] + (hs[i + 1] - hs[i]) * d / l, yb = y + hs[i] + (hs[i + 1] - hs[i]) * e / l; pos.push(x0 + nx, ya, z0 + nz, x0 - nx, ya, z0 - nz, x1 + nx, yb, z1 + nz, x0 - nx, ya, z0 - nz, x1 - nx, yb, z1 - nz, x1 + nx, yb, z1 + nz); }
    acc += l;
  }
  if (!pos.length) pos.push(0, -5, 0, 0, -5, 0, 0, -5, 0); faceUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(upNormals(pos.length / 3), 3)); return g;
}
function riverOutline(pts, hw) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    L.push([pts[i][0] - tz * hw, pts[i][1] + tx * hw]); R.push([pts[i][0] + tz * hw, pts[i][1] - tx * hw]);
  }
  return L.concat(R.reverse());
}
function flatPoly(poly, y, color) {
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z)); let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return null; }
  if (!tris.length) return null; const pos = [];
  for (const [a, b, c] of tris) for (const k of [a, c, b]) pos.push(poly[k][0], y, poly[k][1]);
  faceUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(upNormals(pos.length / 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colorArr(color, pos.length / 3), 3)); return g;
}
function extrude(poly, h, color) {
  let area = 0; for (let i = 0; i < poly.length; i++) { const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length]; area += x1 * z2 - x2 * z1; }
  if (Math.abs(area) < 4) return null;
  if (area > 0) poly = poly.slice().reverse(); // walls face outward
  const pos = [], col = []; const wall = new THREE.Color(color), roof = new THREE.Color(color).multiplyScalar(0.78), shade = new THREE.Color(color).multiplyScalar(0.9);
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    pos.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, 0, az, bx, h, bz, ax, h, az);
    const c = (i % 2) ? wall : shade; for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z)); let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { }
  const rp = []; for (const [a, b, c] of tris) for (const k of [a, c, b]) rp.push(poly[k][0], h, poly[k][1]);
  faceUp(rp); for (let i = 0; i < rp.length; i += 3) { pos.push(rp[i], rp[i + 1], rp[i + 2]); col.push(roof.r, roof.g, roof.b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
