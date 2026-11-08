import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBuilding, newBuilders, buildingMaterials } from './buildings.js';
import { WaterIndex, WATER_TAGS, assembleRings, waterMaterial } from './water.js';
import { Elevation, terrainGeometry, GS } from './terrain.js';
const TERRAIN_R = 900, TERRAIN_UNLOAD = 1300;

// Endless world built live from OpenStreetMap data.
const TILE = 320;           // meters per tile edge
const LOAD_R = 520;         // load tiles whose center is within this distance
const UNLOAD_R = 1500;
const CELL = 24;            // collision hash cell
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

const ROAD_W = { motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6.5, residential: 7.5, unclassified: 7, living_street: 6, service: 4.5, road: 7, track: 3.6, pedestrian: 5, footway: 2.4, path: 2, cycleway: 2.4, steps: 2, bridleway: 2 };
const ROAD_C = { motorway: '#4a4553', trunk: '#4a4553', primary: '#46454e', secondary: '#48474f', tertiary: '#4b4a52', residential: '#55545c', unclassified: '#55545c', living_street: '#5d5c63', service: '#5f5e65', track: '#8b7a5c', pedestrian: '#9a958c', footway: '#a59e90', path: '#9f9480', cycleway: '#7c8fa0', steps: '#a59e90', bridleway: '#9f9480' };
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const WALK = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'pedestrian']);
const WALLS = ['#f2d7b6', '#e9c4a7', '#d9d2c5', '#c9d4dc', '#f0e2c8', '#e3b7a0', '#cdd6c4', '#ead0d7', '#d7cbe0', '#f4ead8'];

function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.tiles = new Map(); this.queue = []; this.loading = null; this.wayIds = new Set();
    this.roadCells = new Map(); this.bldCells = new Map(); this.water = new WaterIndex(); this.relQueue = []; this.relBusy = false; this.elev = new Elevation(); this.chunks = new Map(); this.areas = []; this.minH = 0; this.elevReady = false;
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.overpassBad = 0; this.status = ''; this.onStatus = null; this.failures = 0;
    this.roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.lineMat = new THREE.MeshStandardMaterial({ color: '#f3e3b0', roughness: 0.8, emissive: '#2a2410', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.bldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    this.areaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.treeMat = new THREE.MeshStandardMaterial({ color: '#3f7a45', flatShading: true });
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
    const m = new THREE.Mesh(g, this.terrainMat); m.receiveShadow = true; this.group.add(m); ch.mesh = m;
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
    this.tiles.clear(); this.queue = []; this.wayIds.clear(); this.roadCells.clear(); this.bldCells.clear();
    if (this.abort) this.abort.abort(); this.loading = null; this.gen = (this.gen || 0) + 1;
  }
  setVisible(v) { this.group.visible = v; this.ground.visible = v; this.active = v; }
  disposeTile(t) { this.areas = this.areas.filter(a => a.tile !== t.key); for (const m of t.meshes) { this.group.remove(m); m.geometry.dispose(); } t.meshes = []; for (const id of t.ids) this.wayIds.delete(id); for (const [k, list] of t.cells) { const arr = list.road ? this.roadCells : this.bldCells; const cur = arr.get(k); if (cur) arr.set(k, cur.filter(o => o.tile !== t.key)); } }
  tileCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === 'ready') n++; return n; }
  update(x, z) {
    this.ground.position.set(x, this.minH - 2.5, z);
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
    for (const [key, t] of this.tiles) { const d = Math.hypot((t.i + 0.5) * TILE - x, (t.j + 0.5) * TILE - z); if (d > UNLOAD_R && t.state !== 'loading') { this.disposeTile(t); this.tiles.delete(key); const qi = this.queue.indexOf(t); if (qi >= 0) this.queue.splice(qi, 1); } }
    if (!this.loading && this.queue.length && performance.now() > (this.retryAt || 0)) {
      this.queue.sort((a, b) => Math.hypot((a.i + .5) * TILE - x, (a.j + .5) * TILE - z) - Math.hypot((b.i + .5) * TILE - x, (b.j + .5) * TILE - z));
      const t = this.queue.shift(); this.loadTile(t);
    }
  }
  setStatus(s) { this.status = s; this.onStatus && this.onStatus(s); }
  async loadTile(t) {
    t.state = 'loading'; this.loading = t; const gen = this.gen;
    const [n, w] = this.unproj(t.i * TILE, t.j * TILE), [s, e] = this.unproj((t.i + 1) * TILE, (t.j + 1) * TILE);
    const south = Math.min(n, s), north = Math.max(n, s), west = Math.min(w, e), east = Math.max(w, e);
    this.setStatus(`Loading map data · ${this.tileCount()} areas ready`);
    let ways = null;
    try { [ways] = await Promise.all([this.fetchWays(south, west, north, east), this.elev.ensure(t.i * TILE - 40, t.j * TILE - 40, (t.i + 1) * TILE + 40, (t.j + 1) * TILE + 40)]); }
    catch (err) { console.warn('tile failed', err); }
    if (gen !== this.gen) return;
    this.loading = null;
    if (!ways) { t.state = 'failed'; this.failures++; this.tiles.delete(t.key); this.setStatus('Map server busy — retrying'); this.retryAt = performance.now() + Math.min(15000, 2500 * this.failures); return; }
    this.failures = 0;
    this.buildTile(t, ways); t.state = 'ready';
    this.setStatus(this.queue.length ? `Loading map data · ${this.tileCount()} areas ready` : '');
    this.onTile && this.onTile(t);
  }
  async fetchWays(s, w, n, e) {
    const bbox = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
    if (performance.now() > this.overpassBad) {
      const q = `[out:json][timeout:20];(way["highway"](${bbox});way["building"](${bbox});way["natural"~"water|wood"](${bbox});way["leisure"~"park|pitch|garden"](${bbox});way["landuse"~"grass|forest|meadow|recreation_ground"](${bbox});way["waterway"~"^(riverbank|river|canal)$"](${bbox});way["landuse"~"^(reservoir|basin)$"](${bbox}););out geom;(rel["natural"="water"](${bbox});rel["waterway"="riverbank"](${bbox});rel["landuse"="reservoir"](${bbox}););out tags;`;
      for (const url of OVERPASS) {
        try {
          const ctl = new AbortController(); this.abort = ctl; const to = setTimeout(() => ctl.abort(), 7000);
          const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
          clearTimeout(to);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json();
          const out = j.elements.filter(el => el.type === 'way' && el.geometry).map(el => ({ id: el.id, tags: el.tags || {}, geom: el.geometry.map(p => [p.lat, p.lon]) }));
          out.rels = j.elements.filter(el => el.type === 'relation' && WATER_TAGS(el.tags)).map(el => el.id); return out;
        } catch (err) { console.warn('overpass', url, err.message); }
      }
      this.overpassBad = performance.now() + 180000;
    }
    // Fallback: the main OSM API (CORS enabled), filtered client-side
    const ctl = new AbortController(); this.abort = ctl; const to = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)}`, { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('OSM API ' + r.status);
    const j = await r.json(); const nodes = new Map();
    for (const el of j.elements) if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    const out = [];
    for (const el of j.elements) {
      if (el.type !== 'way' || !el.tags) continue; const t = el.tags;
      if (!(t.highway || t.building || /water|wood/.test(t.natural || '') || /park|pitch|garden/.test(t.leisure || '') || /grass|forest|meadow|recreation_ground|reservoir|basin/.test(t.landuse || '') || /^(riverbank|river|canal)$/.test(t.waterway || ''))) continue;
      const geom = el.nodes.map(id => nodes.get(id)).filter(Boolean); if (geom.length < 2) continue;
      out.push({ id: el.id, tags: t, geom });
    }
    out.rels = j.elements.filter(el => el.type === 'relation' && el.tags && el.tags.type === 'multipolygon' && WATER_TAGS(el.tags) && el.members.length < 3000).map(el => el.id);
    return out;
  }
  addCell(map, x0, z0, x1, z1, obj, t) {
    const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL), c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const k = i + ',' + j; let l = map.get(k); if (!l) { l = []; map.set(k, l); } l.push(obj); t.cells.push([k, { road: map === this.roadCells }]); }
  }
  buildTile(t, ways) {
    const roadGeos = [], lineGeos = [], bldGeos = [], areaGeos = [], trees = []; const Bs = newBuilders(); let areaBB = null;
    for (const wy of ways) {
      const tg0 = wy.tags;
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
        const dp = densify(pts, 7), bridge = !!(tg.bridge && tg.bridge !== 'no');
        let hs, H;
        if (bridge) {
          const cum = [0]; for (let i = 1; i < dp.length; i++) cum.push(cum[i - 1] + Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1]));
          const L = cum[cum.length - 1] || 1, ha = this.elev.at(dp[0][0], dp[0][1]), hb = this.elev.at(dp[dp.length - 1][0], dp[dp.length - 1][1]), hump = layer >= 1 ? Math.min(6, L * 0.12) : Math.min(1.5, L * 0.03);
          hs = dp.map((p, i) => { const k = cum[i] / L; return ha + (hb - ha) * k + Math.sin(Math.PI * k) * hump; });
          H = (x, z, i) => hs[i];
        } else { hs = dp.map(p => this.elev.at(p[0], p[1])); H = (x, z) => this.elev.at(x, z); }
        roadGeos.push(ribbon(dp, w, y, ROAD_C[type] || '#55545c', H));
        if (bridge) roadGeos.push(bridgeSides(dp, w, hs, y));
        if (MAJOR.has(type) && dp.length > 1) lineGeos.push(dashes(dp, y + 0.02, hs));
        const name = tg.name || tg.ref || '';
        for (let i = 0; i < dp.length - 1; i++) {
          const seg = { x0: dp[i][0], z0: dp[i][1], x1: dp[i + 1][0], z1: dp[i + 1][1], hw: w / 2, walk: WALK.has(type), name, type, tile: t.key, bridge, y0: hs[i] + y, y1: hs[i + 1] + y };
          this.addCell(this.roadCells, Math.min(seg.x0, seg.x1) - seg.hw, Math.min(seg.z0, seg.z1) - seg.hw, Math.max(seg.x0, seg.x1) + seg.hw, Math.max(seg.z0, seg.z1) + seg.hw, seg, t);
        }
      } else if (tg.building && pts.length >= 4) {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        if (tg.building === 'roof' || tg['building:part']) continue;
        const poly = pts.slice(0, -1); if (poly.length < 3) continue;
        let base = 1e9; for (const [x, z] of poly) base = Math.min(base, this.elev.at(x, z)); base -= 0.3;
        const before = {}; for (const k in Bs) before[k] = Bs[k].pos.length;
        try { addBuilding(Bs, poly, tg, wy.id); } catch (e) { console.warn('building', wy.id, e); }
        for (const k in Bs) { const P = Bs[k].pos; for (let i = before[k] + 1; i < P.length; i += 3) P[i] += base; }
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        this.addCell(this.bldCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, tile: t.key }, t);
      } else if (pts.length >= 4) {
        const nat = tg.natural, isWater = false;
        const isWood = nat === 'wood' || tg.landuse === 'forest';
        const col = isWater ? '#5f9fd0' : isWood ? '#6f9a5e' : tg.leisure === 'pitch' ? '#88b86a' : '#9cc47e';
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        { const poly = pts.slice(0, -1); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          const a = { poly, col: new THREE.Color(col), x0, x1, z0, z1, tile: t.key, pri: tg.leisure === 'pitch' }; this.areas.push(a); areaBB = areaBB ? { x0: Math.min(areaBB.x0, x0), x1: Math.max(areaBB.x1, x1), z0: Math.min(areaBB.z0, z0), z1: Math.max(areaBB.z1, z1) } : { x0, x1, z0, z1 }; }
        if ((isWood || tg.leisure === 'park') && !isWater) {
          let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          const area = (x1 - x0) * (z1 - z0), count = Math.min(60, Math.floor(area / (isWood ? 120 : 400)));
          for (let k = 0; k < count; k++) { const x = x0 + hash(wy.id + k * 13) * (x1 - x0), z = z0 + hash(wy.id + k * 29 + 5) * (z1 - z0); if (pip(x, z, pts) && !this.onRoad(x, z, 2) && !this.water.inside(x, z)) trees.push([x, z, hash(wy.id + k)]); }
        }
      }
    }
    const add = (geos, mat, shadow) => { if (!geos.length) return; const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); if (!g) return; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = shadow; this.group.add(m); t.meshes.push(m); };
    add(areaGeos, this.areaMat, false); add(roadGeos, this.roadMat, false); add(lineGeos, this.lineMat, false); add(bldGeos, this.bldMat, true);
    const M = buildingMaterials();
    for (const k in Bs) { const g = Bs[k].geometry(); if (!g) continue; const m = new THREE.Mesh(g, M[k]); m.castShadow = k !== 'flat'; m.receiveShadow = true; this.group.add(m); t.meshes.push(m); }
    this.renderWater(t);
    if (areaBB) this.refreshChunks(areaBB);
    for (const id of (ways.rels || [])) if (!this.water.has('r' + id) && !this.water.relPending.has(id)) { this.water.relPending.add(id); this.relQueue.push(id); }
    this.pumpRelations();
    if (trees.length) {
      const cone = new THREE.ConeGeometry(2, 5.5, 6); cone.translate(0, 4.6, 0); const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2, 5); trunk.translate(0, 1, 0);
      const tg = mergeGeometries([trunk.toNonIndexed(), cone.toNonIndexed()]); const m = new THREE.InstancedMesh(tg, this.treeMat, trees.length); const o = new THREE.Object3D();
      trees.forEach(([x, z, r], i) => { o.position.set(x, this.elev.at(x, z) - 0.2, z); o.scale.setScalar(0.8 + r * 0.7); o.rotation.y = r * 6; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = true; this.group.add(m); t.meshes.push(m);
    }
  }
  renderWater(t) {
    if (t.waterMesh) { this.group.remove(t.waterMesh); t.waterMesh.geometry.dispose(); t.meshes = t.meshes.filter(m => m !== t.waterMesh); t.waterMesh = null; }
    const g = this.water.geometry(t.i * TILE, t.j * TILE, TILE, -0.25, (x, z) => this.elev.at(x, z)); if (!g) return;
    const m = new THREE.Mesh(g, waterMaterial()); m.receiveShadow = true; this.group.add(m); t.meshes.push(m); t.waterMesh = m;
  }
  refreshWater(bb, except) {
    this.refreshChunks(bb);
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
  collide(x, z, rad = 1.3) {
    const list = this.bldCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    for (const b of list) {
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
