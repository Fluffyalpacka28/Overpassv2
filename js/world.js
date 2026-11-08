import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBuilding, newBuilders, buildingMaterials } from './buildings.js';

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
    this.roadCells = new Map(); this.bldCells = new Map(); this.waterCells = new Map();
    this.bridges = []; // player-built bridge meshes + segs (persist until clear)
    this.overpassBad = 0; this.status = ''; this.onStatus = null; this.failures = 0;
    this.roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.lineMat = new THREE.MeshStandardMaterial({ color: '#f3e3b0', roughness: 0.8, emissive: '#2a2410', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.bldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    this.areaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.treeMat = new THREE.MeshStandardMaterial({ color: '#3f7a45', flatShading: true });
    this.bridgeMat = new THREE.MeshStandardMaterial({ color: '#6b6560', roughness: 0.7, metalness: 0.25, flatShading: true });
    this.bridgeRailMat = new THREE.MeshStandardMaterial({ color: '#c9a46a', roughness: 0.55, metalness: 0.35, flatShading: true });
    // Broad, low-frequency terrain relief. The height function is analytic and smooth
    // (no random per-vertex steps), so the ground never develops sharp elevation jumps.
    this.terrainGeo = new THREE.PlaneGeometry(6000, 6000, 180, 180);
    this.terrainCenter = { x: NaN, z: NaN };
    this.terrainMat = new THREE.MeshStandardMaterial({ color: '#8fae78', roughness: 1 });
    const ground = new THREE.Mesh(this.terrainGeo, this.terrainMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.ground = ground; scene.add(ground);
    this.updateTerrain(0, 0, true);
    this.waterMat = new THREE.MeshBasicMaterial({ color: '#168bd2', side: THREE.DoubleSide, depthWrite: true });
    this.active = false;
  }
  // Broad, continuous hills and valleys in metres; all wavelengths are smooth.
  heightAt(x, z) {
    return 13.0 * Math.sin(x * 0.00078 + Math.sin(z * 0.00029) * 0.65) * Math.cos(z * 0.00072)
      + 7.0 * Math.sin((x + z) * 0.00043) + 3.0 * Math.cos((x - z) * 0.00082);
  }
  updateTerrain(cx, cz, force = false) {
    // Rebuild only after a substantial shift; avoids recalculating 32k terrain vertices every second.
    if (!force && Math.hypot(cx - this.terrainCenter.x, cz - this.terrainCenter.z) < 240) return;
    this.terrainCenter.x = cx; this.terrainCenter.z = cz;
    const p = this.terrainGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, this.heightAt(cx + p.getX(i), cz - p.getY(i)));
    p.needsUpdate = true; this.terrainGeo.computeVertexNormals();
    this.ground.position.set(cx, 0, cz);
  }
  setOrigin(lat, lon) {
    this.clear(); this.lat0 = lat; this.lon0 = lon; this.cos0 = Math.cos(lat * Math.PI / 180);
  }
  proj(lat, lon) { return [(lon - this.lon0) * this.cos0 * 111320, -(lat - this.lat0) * 110540]; }
  unproj(x, z) { return [this.lat0 - z / 110540, this.lon0 + x / (this.cos0 * 111320)]; }
  clear() {
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear(); this.queue = []; this.wayIds.clear(); this.roadCells.clear(); this.bldCells.clear(); this.waterCells.clear();
    for (const b of this.bridges) {
      this.group.remove(b.mesh);
      b.mesh.traverse?.(o => { if (o.geometry) o.geometry.dispose(); });
      for (const seg of b.segs) this._removeSegFromCells(seg);
    }
    this.bridges = [];
    if (this.abort) this.abort.abort(); this.loading = null; this.gen = (this.gen || 0) + 1;
  }
  setVisible(v) { this.group.visible = v; this.ground.visible = v; this.active = v; }
  disposeTile(t) {
    for (const m of t.meshes) { this.group.remove(m); m.geometry.dispose(); } t.meshes = [];
    for (const id of t.ids) this.wayIds.delete(id);
    for (const [k, list] of t.cells) {
      const kind = list.kind || (list.road ? 'road' : 'bld');
      const arr = kind === 'road' ? this.roadCells : kind === 'water' ? this.waterCells : this.bldCells;
      const cur = arr.get(k); if (cur) arr.set(k, cur.filter(o => o.tile !== t.key));
    }
  }
  _removeSegFromCells(seg) {
    for (const [k, list] of this.roadCells) {
      const next = list.filter(s => s !== seg);
      if (next.length) this.roadCells.set(k, next); else this.roadCells.delete(k);
    }
  }
  tileCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === 'ready') n++; return n; }
  update(x, z) {
    this.updateTerrain(x, z);
    if (!this.active) return;
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
    try { ways = await this.fetchWays(south, west, north, east); }
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
      const q = `[out:json][timeout:20];(way["highway"](${bbox});way["building"](${bbox});way["natural"~"water|wood|bay|coastline"](${bbox});way["water"](${bbox});way["landuse"~"reservoir|basin|salt_pond"](${bbox});way["leisure"~"park|pitch|garden"](${bbox});way["landuse"~"grass|forest|meadow|recreation_ground|reservoir|basin"](${bbox});way["waterway"~"riverbank|river|stream|canal|dock"](${bbox});relation["natural"="water"](${bbox}););out body;>;out geom;`;
      for (const url of OVERPASS) {
        try {
          const ctl = new AbortController(); this.abort = ctl; const to = setTimeout(() => ctl.abort(), 7000);
          const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
          clearTimeout(to);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json();
          const relationTags = new Map();
          for (const rel of j.elements) if (rel.type === 'relation' && rel.tags) {
            for (const member of (rel.members || [])) if (member.type === 'way' && member.role === 'outer') {
              relationTags.set(member.ref, { ...rel.tags, ...(member.tags || {}) });
            }
          }
          return j.elements.filter(el => el.type === 'way' && el.geometry).map(el => ({
            id: el.id, tags: { ...(relationTags.get(el.id) || {}), ...(el.tags || {}) },
            geom: el.geometry.map(p => [p.lat, p.lon])
          }));
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
      if (!(t.highway || t.building || t.water || /water|wood|bay/.test(t.natural || '') || /park|pitch|garden/.test(t.leisure || '') || /grass|forest|meadow|recreation_ground|reservoir|basin/.test(t.landuse || '') || /riverbank|river|stream|canal|dock/.test(t.waterway || ''))) continue;
      const geom = el.nodes.map(id => nodes.get(id)).filter(Boolean); if (geom.length < 2) continue;
      out.push({ id: el.id, tags: t, geom });
    }
    return out;
  }
  addCell(map, x0, z0, x1, z1, obj, t, kind = 'road') {
    const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL), c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) {
      const k = i + ',' + j; let l = map.get(k); if (!l) { l = []; map.set(k, l); }
      l.push(obj);
      if (t) t.cells.push([k, { road: kind === 'road', kind }]);
    }
  }
  buildTile(t, ways) {
    const roadGeos = [], lineGeos = [], bldGeos = [], areaGeos = [], waterGeos = [], trees = []; const Bs = newBuilders();
    for (const wy of ways) {
      if (this.wayIds.has(wy.id)) continue;
      const tg = wy.tags; const pts = wy.geom.map(([la, lo]) => this.proj(la, lo));
      if (tg.highway && ROAD_W[tg.highway] && tg.area !== 'yes') {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        const type = tg.highway, w = ROAD_W[type] * (tg.lanes ? Math.min(1.6, Math.max(0.8, +tg.lanes / 2)) : 1);
        const tunnel = tg.tunnel && tg.tunnel !== 'no', layer = +(tg.layer || 0);
        if (tunnel) continue;
        const y = 0.55 + (MAJOR.has(type) ? 0.025 : WALK.has(type) ? 0.0 : 0.01) + Math.max(0, layer) * 0.005;
        roadGeos.push(ribbon(pts, w, y, ROAD_C[type] || '#55545c', (x, z) => this.heightAt(x, z)));
        if (MAJOR.has(type) && pts.length > 1) lineGeos.push(dashes(pts, y + 0.025, (x, z) => this.heightAt(x, z)));
        const name = tg.name || tg.ref || '';
        for (let i = 0; i < pts.length - 1; i++) {
          const seg = { x0: pts[i][0], z0: pts[i][1], x1: pts[i + 1][0], z1: pts[i + 1][1], hw: w / 2, walk: WALK.has(type), name, type, tile: t.key };
          this.addCell(this.roadCells, seg.x0 - seg.hw, seg.z0 - seg.hw, seg.x1 + seg.hw, seg.z1 + seg.hw, seg, t);
        }
      } else if (tg.building && pts.length >= 4) {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        if (tg.building === 'roof' || tg['building:part']) continue;
        const poly = pts.slice(0, -1); if (poly.length < 3) continue;
        try { addBuilding(Bs, poly, tg, wy.id); } catch (e) { console.warn('building', wy.id, e); }
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        this.addCell(this.bldCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, tile: t.key }, t, 'bld');
      } else if (/^(river|stream|canal)$/.test(tg.waterway || '') && pts.length >= 2 && tg.area !== 'yes') {
        // Linear waterways: store as buffered segments for collision
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        const hw = tg.waterway === 'river' ? 8 : tg.waterway === 'canal' ? 6 : 3.5;
        for (let i = 0; i < pts.length - 1; i++) {
          const seg = { x0: pts[i][0], z0: pts[i][1], x1: pts[i + 1][0], z1: pts[i + 1][1], hw, linear: true, tile: t.key };
          this.addCell(this.waterCells, seg.x0 - hw, seg.z0 - hw, seg.x1 + hw, seg.z1 + hw, seg, t, 'water');
        }
        // Visual thin ribbon for rivers
        const g = ribbon(pts, hw * 2.0, 1.15, '#087fc5', (x, z) => this.heightAt(x, z)); if (g) waterGeos.push(g);
      } else if (pts.length >= 4) {
        const nat = tg.natural, isWater = nat === 'water' || nat === 'bay' || !!tg.water || tg.waterway === 'riverbank' || tg.waterway === 'dock' || /reservoir|basin/.test(tg.landuse || '') || tg.natural === 'coastline';
        const isWood = nat === 'wood' || tg.landuse === 'forest';
        const col = isWater ? '#5f9fd0' : isWood ? '#6f9a5e' : tg.leisure === 'pitch' ? '#88b86a' : '#9cc47e';
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        const poly = pts.slice(0, -1);
        let g;
        if (isWater) {
          // Keep mapped lakes visibly above the coarse terrain mesh. Use one level
          // per water polygon so the water itself stays flat.
          const waterLevel = Math.max(...poly.map(([x, z]) => this.heightAt(x, z))) + 0.65;
          g = flatPoly(poly, waterLevel, '#087fc5', () => 0);
        } else g = flatPoly(poly, 0.012, col, (x, z) => this.heightAt(x, z));
        if (g) (isWater ? waterGeos : areaGeos).push(g);
        if (isWater && poly.length >= 3) {
          let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
          for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          this.addCell(this.waterCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, tile: t.key }, t, 'water');
        }
        if ((isWood || tg.leisure === 'park') && !isWater) {
          let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          const area = (x1 - x0) * (z1 - z0), count = Math.min(60, Math.floor(area / (isWood ? 120 : 400)));
          for (let k = 0; k < count; k++) { const x = x0 + hash(wy.id + k * 13) * (x1 - x0), z = z0 + hash(wy.id + k * 29 + 5) * (z1 - z0); if (pip(x, z, pts) && !this.onRoad(x, z, 2)) trees.push([x, z, hash(wy.id + k)]); }
        }
      }
    }
    const add = (geos, mat, shadow) => { if (!geos.length) return; const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); if (!g) return; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = shadow; this.group.add(m); t.meshes.push(m); };
    add(areaGeos, this.areaMat, false); add(waterGeos, this.waterMat, false); add(roadGeos, this.roadMat, false); add(lineGeos, this.lineMat, false); add(bldGeos, this.bldMat, true);
    const M = buildingMaterials();
    for (const k in Bs) { const g = Bs[k].geometry(); if (!g) continue; const m = new THREE.Mesh(g, M[k]); m.castShadow = k !== 'flat'; m.receiveShadow = true; this.group.add(m); t.meshes.push(m); }
    if (trees.length) {
      const cone = new THREE.ConeGeometry(2, 5.5, 6); cone.translate(0, 4.6, 0); const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2, 5); trunk.translate(0, 1, 0);
      const tg = mergeGeometries([trunk.toNonIndexed(), cone.toNonIndexed()]); const m = new THREE.InstancedMesh(tg, this.treeMat, trees.length); const o = new THREE.Object3D();
      trees.forEach(([x, z, r], i) => { o.position.set(x, 0, z); o.scale.setScalar(0.8 + r * 0.7); o.rotation.y = r * 6; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = true; this.group.add(m); t.meshes.push(m);
    }
  }
  nearbySegs(x, z) { return this.roadCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }
  onRoad(x, z, pad = 0.6) { for (const s of this.nearbySegs(x, z)) if (!s.walk && segDist(x, z, s) < s.hw + pad) return true; return false; }
  /** True if position is in mapped water and not on a road/bridge. */
  inWater(x, z) {
    if (this.onRoad(x, z, 1.2)) return false;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const list = this.waterCells.get((ci + di) + ',' + (cj + dj));
      if (!list) continue;
      for (const w of list) {
        if (w.linear) {
          if (segDist(x, z, w) < w.hw) return true;
        } else if (w.poly && pip(x, z, w.poly)) return true;
      }
    }
    return false;
  }
  /**
   * Build a player bridge from (x0,z0) along yaw for `length` meters.
   * Registers as driveable road. Returns the bridge record or null.
   */
  placeBridge(x0, z0, yaw, length = 28, width = 8) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const x1 = x0 + fx * length, z1 = z0 + fz * length;
    const segs = [];
    // one long segment is enough for collision
    const seg = { x0, z0, x1, z1, hw: width / 2, walk: false, name: 'Bridge', type: 'bridge', tile: 'player' };
    this.addCell(this.roadCells, Math.min(x0, x1) - seg.hw, Math.min(z0, z1) - seg.hw, Math.max(x0, x1) + seg.hw, Math.max(z0, z1) + seg.hw, seg, null, 'road');
    segs.push(seg);

    const group = new THREE.Group();
    // deck
    const bridgeY = (x, z) => this.heightAt(x, z) + 0.45;
    const deck = ribbon([[x0, z0], [x1, z1]], width, 0.35, '#6b6560', bridgeY);
    if (deck) {
      const m = new THREE.Mesh(deck, this.bridgeMat);
      m.receiveShadow = true; m.castShadow = true; group.add(m);
    }
    // side rails
    const nx = fz, nz = -fx; // left normal
    const railW = 0.25, railH = 0.9, half = width / 2 - 0.2;
    for (const side of [-1, 1]) {
      const ax = x0 + nx * half * side, az = z0 + nz * half * side;
      const bx = x1 + nx * half * side, bz = z1 + nz * half * side;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railW, railH, length), this.bridgeRailMat);
      rail.position.set((ax + bx) / 2, (bridgeY(x0, z0) + bridgeY(x1, z1)) / 2 + railH / 2, (az + bz) / 2);
      rail.rotation.y = yaw;
      rail.castShadow = true; group.add(rail);
      // posts
      for (let t = 0; t <= 1.001; t += 0.25) {
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), this.bridgeRailMat);
        post.position.set(px, bridgeY(px, pz) + 0.55, pz); post.castShadow = true; group.add(post);
      }
    }
    // end piers
    for (const [px, pz] of [[x0, z0], [x1, z1]]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.5, 1.2), this.bridgeMat);
      pier.position.set(px, this.heightAt(px, pz) + 0.15, pz); pier.rotation.y = yaw; pier.castShadow = true; group.add(pier);
    }
    this.group.add(group);
    const rec = { mesh: group, segs, x0, z0, x1, z1, yaw };
    this.bridges.push(rec);
    return rec;
  }
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

function ribbon(pts, w, y, color, heightFn = null) {
  const n = pts.length, hw = w / 2, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = -tz, nz = tx, scale = 1;
    if (i > 0 && i < n - 1) { // miter
      let t1x = p[0] - a[0], t1z = p[1] - a[1]; const l1 = Math.hypot(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
      const cos = (-t1z) * nx + t1x * nz; scale = Math.min(2.5, 1 / Math.max(0.3, cos));
    }
    const py = (heightFn ? heightFn(p[0], p[1]) : 0) + y;
    pos.push(p[0] + nx * hw * scale, py, p[1] + nz * hw * scale, p[0] - nx * hw * scale, py, p[1] - nz * hw * scale);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  // round caps at both ends cover joins between ways
  [pts[0], pts[n - 1]].forEach(p => { const base = pos.length / 3, py = (heightFn ? heightFn(p[0], p[1]) : 0) + y; pos.push(p[0], py, p[1]); const seg = 10; for (let k = 0; k <= seg; k++) { const an = k / seg * Math.PI * 2; pos.push(p[0] + Math.cos(an) * hw, py - 0.002, p[1] + Math.sin(an) * hw); if (k < seg) idx.push(base, base + 2 + k, base + 1 + k); } });
  const flat = []; for (const k of idx) flat.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  faceUp(flat); const nv = flat.length / 3;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(upNormals(nv), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colorArr(color, nv), 3));
  return g;
}
function dashes(pts, y, heightFn = null) {
  const geos = []; let acc = 0;
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (!l) continue; const tx = (bx - ax) / l, tz = (bz - az) / l, nx = -tz * 0.12, nz = tx * 0.12;
    for (let d = (6 - acc % 6) % 6; d < l; d += 6) { const e = Math.min(l, d + 3); const x0 = ax + tx * d, z0 = az + tz * d, x1 = ax + tx * e, z1 = az + tz * e; const y0 = (heightFn ? heightFn(x0, z0) : 0) + y, y1 = (heightFn ? heightFn(x1, z1) : 0) + y; pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz, x1 + nx, y1, z1 + nz); }
    acc += l;
  }
  if (!pos.length) pos.push(0, -5, 0, 0, -5, 0, 0, -5, 0); faceUp(pos);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(upNormals(pos.length / 3), 3)); return g;
}
function flatPoly(poly, y, color, heightFn = null) {
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z)); let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { return null; }
  if (!tris.length) return null; const pos = [];
  for (const [a, b, c] of tris) for (const k of [a, c, b]) pos.push(poly[k][0], (heightFn ? heightFn(poly[k][0], poly[k][1]) : 0) + y, poly[k][1]);
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
