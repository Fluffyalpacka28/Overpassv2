import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBuilding, newBuilders, buildingMaterials, setRoadCheck } from './buildings.js';
import { WaterIndex, WATER_TAGS, assembleRings, waterMaterial } from './water.js';
import { Elevation, terrainGeometry, GS } from './terrain.js';
import { terrainMaterial, paintVerge, buildRocks } from './terrainmat.js';
import { asphaltTexture, pavingTexture, dirtTexture, grassTexture, concreteTexture, foliageTexture, barkTexture, planarUV, wallUV } from './textures.js';
import { TileCache } from './tilecache.js';
import { poiKind, poiMaterials, brandBuilding, gasStation, FOOD, blicksLayout, blicksStore, storefront } from './pois.js';
import { addPlaygrounds, addGraves } from './parks.js';
import { pickSpecies, buildTreeMeshes } from './trees.js';
import { snowify } from './season.js';
const TERRAIN_R = 900, TERRAIN_UNLOAD = 1300;

// Endless world built live from OpenStreetMap data.
const TILE = 320;           // meters per tile edge
const LOAD_R = 780;         // load tiles whose center is within this distance (beyond the fog, so nothing appears in view)
const MAX_INFLIGHT = 3;     // parallel map requests
const FADE_MS = 700;        // new tiles fade in instead of popping
const UNLOAD_R = 1500;
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const CELL = 24;            // collision hash cell
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const ROAD_W = { motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 9, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6.5, residential: 7.5, unclassified: 7, living_street: 6, service: 4.5, road: 7, track: 3.6, pedestrian: 5, footway: 2.4, path: 2, cycleway: 2.4, steps: 2, bridleway: 2 };
const ROAD_C = { motorway: '#4a4553', trunk: '#4a4553', primary: '#46454e', secondary: '#48474f', tertiary: '#4b4a52', residential: '#55545c', unclassified: '#55545c', living_street: '#5d5c63', service: '#5f5e65', track: '#8b7a5c', pedestrian: '#9a958c', footway: '#a59e90', path: '#9f9480', cycleway: '#7c8fa0', steps: '#a59e90', bridleway: '#9f9480' };
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const RAIL_TYPES = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link']);
const WALK = new Set(['footway', 'path', 'cycleway', 'steps', 'bridleway', 'pedestrian']);
const WALLS = ['#f2d7b6', '#e9c4a7', '#d9d2c5', '#c9d4dc', '#f0e2c8', '#e3b7a0', '#cdd6c4', '#ead0d7', '#d7cbe0', '#f4ead8'];

const SOFT_TAPS = [[0, 0, 0.36], [7, 0, 0.16], [-7, 0, 0.16], [0, 7, 0.16], [0, -7, 0.16]];
function smoothNoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, h = (a, b) => hash((a * 73856093) ^ (b * 19349663)), ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

function bbOf(poly) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; }
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; }
// what kind of tree-growing place a way is (null: none)
function treePlace(t) {
  if (t.natural === 'wood' || t.landuse === 'forest') return 'forest';
  if (t.landuse === 'orchard') return 'orchard';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'scrub';
  if (t.natural === 'wetland') return /swamp|mangrove|bog|fen/.test(t.wetland || 'swamp') ? 'swamp' : null;
  if (t.leisure === 'park') return 'park';
  if (t.leisure === 'garden') return 'garden';
  if (t.landuse === 'village_green') return 'green';
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 'cemetery';
  if (t.landuse === 'residential') return 'residential';
  return null;
}
const leafOf = t => t.leaf_type === 'needleleaved' ? 'needle' : t.leaf_type === 'broadleaved' ? 'broad' : t.leaf_type === 'mixed' ? 'mixed' : '';
const treeGenus = t => t.genus || t['genus:en'] || t.species || t['species:en'] || t.taxon || (t.leaf_type === 'needleleaved' ? 'pine' : t.leaf_type === 'broadleaved' ? 'oak' : '');
// playgrounds and individually mapped playground equipment
function playList(els, at) { const out = []; for (const el of els) { const t = el.tags; if (!t) continue; const kind = t.leisure === 'playground' ? 'playground' : t.playground ? String(t.playground) : null; if (!kind) continue; const ll = at(el); if (ll) out.push({ lat: ll[0], lon: ll[1], kind }); } return out; }
function centroidLL(g) { if (!g || !g.length) return null; let a = 0, b = 0; const n = g.length > 1 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1] ? g.length - 1 : g.length; for (let i = 0; i < n; i++) { a += g[i][0]; b += g[i][1]; } return [a / n, b / n]; }
// gas stations and Wicdonald's from raw OSM elements (nodes or ways), de-duplicated
function collectPois(els, center) {
  const out = [], seen = new Set();
  for (const el of els) {
    if (el.type === 'relation' || !el.tags) continue; const kind = poiKind(el.tags);
    const key = el.type[0] + el.id; if (seen.has(key)) continue; const c = center(el); if (!c) continue; seen.add(key);
    const decor = el.tags.highway === 'traffic_signals' ? 'traffic_light' : (el.tags.traffic_sign || el.tags.highway === 'stop' || el.tags.highway === 'give_way' ? 'road_sign' : null);
    if (!kind && !decor) continue;
    out.push({ key, kind: kind || decor, lat: c[0], lon: c[1], wayId: el.type === 'way' ? el.id : null, building: !!el.tags.building, name: el.tags.name || '', sign: el.tags.traffic_sign || el.tags.highway || '' });
  }
  return out;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.tiles = new Map(); this.queue = []; this.loading = null; this.wayIds = new Set();
    this.roadCells = new Map(); this.railCells = new Map(); this.bldCells = new Map(); this.extraCells = new Map(); this.extraById = new Map(); this.flats = new Map(); this.flatOrig = new Map(); this.pavedPads = []; this.water = new WaterIndex(); this.relQueue = []; this.relBusy = false; this.elev = new Elevation(); this.chunks = new Map(); this.areas = []; this.minH = 0; this.elevReady = false;
    const gt = grassTexture(); this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: gt });
    this.cache = new TileCache(); this.inflight = new Set(); this.fading = []; this.built = { key: 'built', meshes: [], cells: [], ids: [] }; this.bridges = 0; this.pois = []; this.poiKeys = new Set();
    this.overpassBad = 0; this.status = ''; this.onStatus = null; this.failures = 0;
    this.roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTexture(), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.pathMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: pavingTexture(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    raggedEdges(this.roadMat, 0.45, 'overpass-road-edge-v1'); raggedEdges(this.pathMat, 0.22, 'overpass-path-edge-v1');
    snowify(this.pathMat, 'path', { up: [0.6, 0.85], amt: 0.75 });
    this.shoulderMat = raggedEdges(new THREE.MeshStandardMaterial({ vertexColors: true, map: dirtTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 1.7, 'overpass-shoulder-v1', true);
    snowify(this.shoulderMat, 'shoulder', { up: [0.6, 0.85], amt: 0.9 });
    this.concreteMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: concreteTexture(), roughness: 0.9 });
    this.lineMat = new THREE.MeshStandardMaterial({ color: '#f3e3b0', roughness: 0.7, emissive: '#2a2410', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.edgeMat = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7, emissive: '#1c1c1c', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.bldMat = snowify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }), 'bld0', { up: [0.45, 0.72] });
    this.railMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55, side: THREE.DoubleSide });
    this.areaMat = snowify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 'area', { grassy: true, up: [0.6, 0.85] });
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
  // How deep the water is at a point, in metres: 0 at the bank, ~1.4 m ten metres out, then the bed keeps falling away with
  // distance from shore (rivers end up a few metres deep, lakes tens of metres, the open sea ~45 m), with gentle ridges and hollows.
  // The terrain under water IS the seabed (the submarine drives along it).
  sinkDepth(x, z) {
    const sc = this.sinkCache || (this.sinkCache = new Map()), k = Math.round(x / GS) + ',' + Math.round(z / GS); let v = sc.get(k); if (v !== undefined) return v;
    v = 0;
    if (this.water.inside(x, z)) {
      let d = 240;
      outer: for (const r of [2.5, 5, 7.5, 10, 15, 22, 32, 48, 70, 100, 150, 220]) for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4 + r * 0.37; if (!this.water.inside(x + Math.cos(an) * r, z + Math.sin(an) * r)) { d = Math.max(0, r - (r < 12 ? 1.5 : r * 0.18)); break outer; } }
      const t = Math.max(0, Math.min(1, d / 10)), near = 1.4 * t * t * (3 - 2 * t);
      const far = Math.max(0, d - 10) * 0.16 * (1 - Math.min(0.35, Math.max(0, d - 120) / 400));
      // seabed texture: long sandy ridges and hollows (more of them in deep water)
      const n = Math.sin(x * 0.031 + Math.sin(z * 0.017) * 2) * 0.5 + Math.sin(z * 0.023 - x * 0.011) * 0.5;
      v = Math.min(46, near + far) * (1 + n * 0.12 * Math.min(1, d / 30));
    }
    sc.set(k, v); return v;
  }
  // total water depth (surface to seabed) at a point, metres (0 on land)
  waterDepth(x, z) { if (!this.water.inside(x, z)) return 0; return Math.max(0, this.elev.at(x, z) - 0.25 - this.terrainY(x, z)); }
  // the terrain mesh's actual height (including the sinking under water), triangle for triangle as the mesh is built
  terrainY(x, z) {
    const fx0 = x / GS, fz0 = z / GS, i = Math.floor(fx0), j = Math.floor(fz0), fx = fx0 - i, fz = fz0 - j;
    const h = (a, b) => this.elev.node(a, b) - this.sinkDepth(a * GS, b * GS);
    const h00 = h(i, j), h11 = h(i + 1, j + 1);
    return (fx >= fz ? h00 + (h(i + 1, j) - h00) * fx + (h11 - h(i + 1, j)) * fz : h00 + (h(i, j + 1) - h00) * fz + (h11 - h(i, j + 1)) * fx) - 0.02;
  }
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
    c.set(col || '#8fae78');
  }
  // the ground's colour, blended: the land-use colour is averaged over a few nearby spots so fields, parks, farmland and the shore
  // fade into each other over ~15 m instead of stepping, with a gentle large-scale brightness drift instead of per-square speckle
  colorSoft(x, z, c) {
    const t = this._ct || (this._ct = new THREE.Color()); let r = 0, g = 0, b = 0;
    for (const [dx, dz, w] of SOFT_TAPS) { this.colorAt(x + dx, z + dz, t); r += t.r * w; g += t.g * w; b += t.b * w; }
    const n = smoothNoise(x / 60, z / 60) * 0.7 + smoothNoise(x / 17 + 9.1, z / 17 - 3.7) * 0.3;
    c.setRGB(r, g, b).multiplyScalar(0.93 + n * 0.13);
  }
  buildChunk(ch) {
    if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
    const x0 = ch.i * TILE, z0 = ch.j * TILE;
    this._areaCand = this.areas.filter(a => !(a.x1 < x0 || a.x0 > x0 + TILE || a.z1 < z0 || a.z0 > z0 + TILE));
    const g = terrainGeometry(this.elev, x0, z0, TILE, (x, z, c) => this.colorSoft(x, z, c), (x, z) => this.sinkDepth(x, z));
    this._areaCand = null;
    g.computeBoundingBox(); this.minH = Math.min(this.minH, g.boundingBox.min.y);
    planarUV(g, 14); const fresh = !ch.built; ch.built = true;
    if (!ch.mat) ch.mat = terrainMaterial();
    const m = new THREE.Mesh(g, ch.mat); m.receiveShadow = true; this.group.add(m); ch.mesh = m; if (fresh) this.fadeIn([m]);
    this.decorateChunk(ch);
  }
  // worn ground beside roads + loose rocks on steep ground. Runs again whenever road data near this chunk arrives.
  decorateChunk(ch) {
    if (!ch.mesh) return;
    try {
      const x0 = ch.i * TILE, z0 = ch.j * TILE, pad = 14, seen = new Set(), segs = [];
      for (let i = Math.floor((x0 - pad) / CELL); i <= Math.floor((x0 + TILE + pad) / CELL); i++) for (let j = Math.floor((z0 - pad) / CELL); j <= Math.floor((z0 + TILE + pad) / CELL); j++)
        for (const sg of (this.roadCells.get(i + ',' + j) || [])) if (!seen.has(sg)) { seen.add(sg); segs.push(sg); }
      const U = ch.mat.userData.U; U.uVerge.value = paintVerge(ch, x0, z0, TILE, segs); U.uChunk.value.set(x0, z0, TILE);
      if (ch.rocks) { this.group.remove(ch.rocks); ch.rocks.dispose(); ch.rocks = null; }
      if (this.showRocks !== false) { const rk = buildRocks(this, ch, x0, z0, TILE, GS); if (rk) { this.group.add(rk); ch.rocks = rk; } }
    } catch (e) { if (!this._decoWarned) { this._decoWarned = true; console.warn('[overpass] ground details off:', e); } }
  }
  dropChunk(ch) {
    if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
    if (ch.rocks) { this.group.remove(ch.rocks); ch.rocks.dispose(); ch.rocks = null; }
    if (ch.mat) { ch.mat.dispose(); ch.mat = null; } if (ch.vergeTex) { ch.vergeTex.dispose(); ch.vergeTex = null; ch.vergeCanvas = null; }
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
    this.sinkCache = null;
    this.water.clear(); this.relQueue = []; this.areas = []; this.minH = 0;
    for (const ch of this.chunks.values()) this.dropChunk(ch);
    this.chunks.clear();
    for (const t of this.tiles.values()) this.disposeTile(t);
    for (const m of this.built.meshes) { this.group.remove(m); m.geometry.dispose(); } this.built = { key: 'built', meshes: [], cells: [], ids: [] }; this.bridges = 0;
    for (const f of this.fading) f.restore(); this.fading = [];
    this.tiles.clear(); this.queue = []; this.pois = []; this.poiKeys.clear(); this.wayIds.clear(); this.roadCells.clear(); this.railCells.clear(); this.bldCells.clear(); this.extraCells.clear(); this.extraById.clear(); this.flats.clear(); this.flatOrig.clear(); this.pavedPads = [];
    for (const c of this.inflight) c.abort(); this.inflight.clear(); this.loading = null; this.gen = (this.gen || 0) + 1;
  }
  setVisible(v) { this.group.visible = v; this.ground.visible = v; this.active = v; }
  // draw distance: past it, map areas stay loaded but aren't drawn. Asking for more than the defaults also loads further out.
  // the faster you're going, the further out map data loads (up to ~500 m more at top speed), so it's there before you are
  get rLoad() { return Math.max(LOAD_R, (this.viewDist || 0) + 160) + Math.min(520, (this.spd || 0) * 6); }
  get rUnload() { return Math.max(UNLOAD_R, this.rLoad + 720); }
  get rTerr() { return Math.max(TERRAIN_R, (this.viewDist || 0) + 280) + Math.min(480, (this.spd || 0) * 5); }
  get rTerrUnload() { return Math.max(TERRAIN_UNLOAD, this.rTerr + 400); }
  setViewDist(vd) { this.viewDist = vd; }
  // rain soaks the streets: darker, glossier asphalt and paths (0 dry .. 1 soaked)
  setWet(w) {
    w = Math.round(Math.max(0, Math.min(1, w)) * 50) / 50; if (w === this.wet) return; this.wet = w;
    for (const [m, r0] of [[this.roadMat, 0.88], [this.pathMat, null], [this.shoulderMat, null], [this.concreteMat, null]]) {
      if (!m) continue; if (m.userData.dryR == null) { m.userData.dryR = r0 ?? m.roughness; m.userData.dryC = m.color.clone(); }
      m.roughness = m.userData.dryR - (m.userData.dryR - 0.3) * w; m.color.copy(m.userData.dryC).multiplyScalar(1 - 0.3 * w);
    }
  }
  cullFar(x, z, vd) {
    const lim = vd + TILE * 0.72, near = (i, j) => Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - z) <= lim; // any part of the tile within reach
    const reach = vd + 40;
    for (const t of this.tiles.values()) { const v = near(t.i, t.j); t.far = !v; for (const m of t.meshes) m.visible = v || meshNear(m, x, z, reach); }
    for (const ch of this.chunks.values()) { const v = near(ch.i, ch.j); if (ch.mesh) ch.mesh.visible = v; if (ch.rocks) ch.rocks.visible = v && Math.hypot((ch.i + 0.5) * TILE - x, (ch.j + 0.5) * TILE - z) <= Math.min(lim, 700); }
    const L = this.lights; if (L && L.tiles) for (const [key, rec] of L.tiles) { const [i, j] = key.split(',').map(Number), v = near(i, j); rec._far = !v; for (const m of rec.meshes) m.visible = v && ((m !== rec.pool && !(rec.pools && rec.pools.includes(m))) || L.k > 0.02); }
    const B = this.built; if (B && B.meshes) for (const m of B.meshes) m.visible = true;
  }
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
    this.areas = this.areas.filter(a => a.tile !== t.key); if (t.poiKeys) { this.pois = this.pois.filter(p => p.tile !== t.key); t.poiKeys.forEach(k => this.poiKeys.delete(k)); t.poiKeys = []; } for (const m of t.meshes) { this.group.remove(m); if (!m.userData.sharedGeo) m.geometry.dispose(); } t.meshes = []; t.treeSets = null; for (const id of t.ids) this.wayIds.delete(id); for (const [k, list] of t.cells) { const arr = list.rail ? this.railCells : list.road ? this.roadCells : this.bldCells; const cur = arr.get(k); if (cur) arr.set(k, cur.filter(o => o.tile !== t.key)); }
  }
  tileCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === 'ready') n++; return n; }
  update(x, z, vx = 0, vz = 0) {
    this.ground.position.set(x, this.minH - 2.5, z);
    { const sp = Math.hypot(vx, vz); this.spd = (this.spd || 0) + (sp - (this.spd || 0)) * (sp > (this.spd || 0) ? 0.08 : 0.01); } // grows fast, shrinks slowly
    this.stepFades();
    if (!this.active || !this.elevReady) return;
    {
      const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), R = Math.ceil(this.rTerr / TILE), gen = this.gen;
      for (let i = ti - R; i <= ti + R; i++) for (let j = tj - R; j <= tj + R; j++) {
        const key = i + ',' + j; if (this.chunks.has(key)) continue;
        if (Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - z) > this.rTerr) continue;
        const ch = { i, j, key, state: 'loading', mesh: null }; this.chunks.set(key, ch);
        this.elev.ensure(i * TILE - GS, j * TILE - GS, (i + 1) * TILE + GS, (j + 1) * TILE + GS).then(() => { if (gen !== this.gen || this.chunks.get(key) !== ch) return; ch.state = 'ready'; this.buildChunk(ch); });
      }
      for (const [key, ch] of this.chunks) if (Math.hypot((ch.i + 0.5) * TILE - x, (ch.j + 0.5) * TILE - z) > this.rTerrUnload) { this.dropChunk(ch); this.chunks.delete(key); }
    }
    const ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), R = Math.ceil(this.rLoad / TILE);
    for (let i = ti - R; i <= ti + R; i++) for (let j = tj - R; j <= tj + R; j++) {
      const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE, d = Math.hypot(cx - x, cz - z);
      const key = i + ',' + j;
      if (d < this.rLoad && !this.tiles.has(key)) { const t = { key, i, j, state: 'queued', meshes: [], ids: [], cells: [] }; this.tiles.set(key, t); this.queue.push(t); }
    }
    for (const [key, t] of this.tiles) { const d = Math.hypot((t.i + 0.5) * TILE - x, (t.j + 0.5) * TILE - z); if (d > this.rUnload && t.state !== 'loading') { this.tiles.delete(key); this.disposeTile(t, true); const qi = this.queue.indexOf(t); if (qi >= 0) this.queue.splice(qi, 1); } }
    // prioritise tiles where the car is heading (look ahead up to ~4s / 260m)
    if (this.queue.length && this.inflight.size < MAX_INFLIGHT && performance.now() > (this.retryAt || 0)) {
      // tiles along the way you're heading come first: look up to ~7 s / 700 m ahead, at two points along the path
      const sp = Math.hypot(vx, vz), la = Math.min(700, sp * 7), ux = sp > 1 ? vx / sp : 0, uz = sp > 1 ? vz / sp : 0, px = x + ux * la, pz = z + uz * la, mx = x + ux * la * 0.45, mz = z + uz * la * 0.45;
      const pri = t => { const cx = (t.i + .5) * TILE, cz = (t.j + .5) * TILE; return Math.min(Math.hypot(cx - x, cz - z), Math.hypot(cx - mx, cz - mz) + 30, Math.hypot(cx - px, cz - pz) + 90); };
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
    { const [ti, tj] = t.key.split(',').map(Number); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ch = this.chunks.get((ti + di) + ',' + (tj + dj)); if (ch && ch.mesh) this.decorateChunk(ch); } }
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
      const clones = list.map(mt => { const c = mt.clone(); c.onBeforeCompile = mt.onBeforeCompile; c.customProgramCacheKey = mt.customProgramCacheKey; c.userData = mt.userData; c.transparent = true; c.opacity = 0; c.depthWrite = true; return c; });
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
    const q = `[out:json][timeout:20];(way["highway"](${bbox});way["building"](${bbox});way["natural"~"water|wood|tree_row|scrub|heath|wetland"](${bbox});way["leisure"~"park|pitch|garden"](${bbox});way["landuse"~"grass|forest|meadow|recreation_ground|orchard|residential|village_green"](${bbox});way["waterway"~"^(riverbank|river|canal)$"](${bbox});way["landuse"~"^(reservoir|basin)$"](${bbox});way["landuse"="cemetery"](${bbox});way["amenity"="grave_yard"](${bbox}););out geom;(rel["natural"="water"](${bbox});rel["waterway"="riverbank"](${bbox});rel["landuse"="reservoir"](${bbox}););out tags;(node["natural"="tree"](${bbox});node["highway"~"^(traffic_signals|stop|give_way|street_lamp)$"](${bbox});node["highway"="street_lamp"](${bbox});node["traffic_sign"](${bbox});nwr["amenity"="fuel"](${bbox});nwr["shop"]["brand:wikidata"="Q5272601"](${bbox});nwr["shop"]["name"~"Dick's Sporting",i](${bbox});nwr["shop"~"^(car_repair|tyres)$"](${bbox});nwr["craft"="mechanic"](${bbox});nwr["amenity"~"^(fast_food|restaurant)$"]["brand:wikidata"~"^(Q38076|Q177054|Q839466)$"](${bbox});nwr["amenity"~"^(fast_food|restaurant)$"]["name"~"McDonald|Burger King|Domino",i](${bbox});nwr["amenity"~"^(fast_food|restaurant)$"]["brand"~"McDonald|Burger King|Domino",i](${bbox});nwr["shop"]["name"~"Domino",i](${bbox});nwr["shop"]["name"~"Price Chopper|Market 32",i](${bbox});nwr["shop"]["brand"~"Price Chopper|Market 32",i](${bbox});nwr["leisure"="playground"](${bbox});node["playground"](${bbox}););out center tags;`;
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const out = j.elements.filter(el => el.type === 'way' && el.geometry).map(el => ({ id: el.id, tags: el.tags || {}, geom: el.geometry.map(p => [p.lat, p.lon]) }));
    out.rels = j.elements.filter(el => el.type === 'relation' && WATER_TAGS(el.tags)).map(el => el.id);
    out.trees = j.elements.filter(el => el.type === 'node' && el.tags && el.tags.natural === 'tree').map(el => [el.lat, el.lon, treeGenus(el.tags)]);
    out.pois = collectPois(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.center ? [el.center.lat, el.center.lon] : el.geometry ? centroidLL(el.geometry.map(p => [p.lat, p.lon])) : null);
    out.lamps = j.elements.filter(el => el.type === 'node' && el.tags && (el.tags.highway === 'street_lamp' || el.tags.light_source === 'lantern')).map(el => [el.lat, el.lon]);
    out.play = playList(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.center ? [el.center.lat, el.center.lon] : null);
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
      if (!(t.highway || t.building || /water|wood|tree_row|scrub|heath|wetland/.test(t.natural || '') || /park|pitch|garden/.test(t.leisure || '') || /grass|forest|meadow|recreation_ground|reservoir|basin|cemetery|orchard|residential|village_green/.test(t.landuse || '') || t.amenity === 'grave_yard' || /^(riverbank|river|canal)$/.test(t.waterway || ''))) continue;
      const geom = el.nodes.map(id => nodes.get(id)).filter(Boolean); if (geom.length < 2) continue;
      out.push({ id: el.id, tags: t, geom });
    }
    out.rels = j.elements.filter(el => el.type === 'relation' && el.tags && el.tags.type === 'multipolygon' && WATER_TAGS(el.tags) && el.members.length < 3000).map(el => el.id);
    out.trees = j.elements.filter(el => el.type === 'node' && el.tags && el.tags.natural === 'tree').map(el => [el.lat, el.lon, treeGenus(el.tags)]);
    out.pois = collectPois(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.type === 'way' ? centroidLL(el.nodes.map(id => nodes.get(id)).filter(Boolean)) : null);
    out.lamps = j.elements.filter(el => el.type === 'node' && el.tags && (el.tags.highway === 'street_lamp' || el.tags.light_source === 'lantern')).map(el => [el.lat, el.lon]);
    out.play = playList(j.elements, el => el.type === 'node' ? [el.lat, el.lon] : el.type === 'way' ? centroidLL(el.nodes.map(id => nodes.get(id)).filter(Boolean)) : null);
    return out;
  }
  addCell(map, x0, z0, x1, z1, obj, t) {
    const a = Math.floor(Math.min(x0, x1) / CELL), b = Math.floor(Math.max(x0, x1) / CELL), c = Math.floor(Math.min(z0, z1) / CELL), d = Math.floor(Math.max(z0, z1) / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const k = i + ',' + j; let l = map.get(k); if (!l) { l = []; map.set(k, l); } l.push(obj); t.cells.push([k, { road: map === this.roadCells, rail: map === this.railCells }]); }
  }
  buildTile(t, ways, partial = false) {
    const railGeos = [], roadGeos = [], shoulderGeos = [], pathGeos = [], sideGeos = [], lineGeos = [], edgeGeos = [], bldGeos = [], areaGeos = [], trees = [], treeAreas = [], treeRows = []; const Bs = newBuilders(); let areaBB = null;
    // Register road cells first so onRoad() is accurate when we place buildings / lights later in this tile
    setRoadCheck((x, z) => !this.roadClear(x, z, null, 0.2));
    if (!partial) for (const wy of ways) {
      const tg = wy.tags; if (!tg.highway || !ROAD_W[tg.highway] || tg.area === 'yes' || (tg.tunnel && tg.tunnel !== 'no') || this.wayIds.has(wy.id)) continue;
      const type = tg.highway, w = ROAD_W[type] * (tg.lanes ? Math.min(1.6, Math.max(0.8, +tg.lanes / 2)) : 1);
      if (WALK.has(type)) continue;
      const pts = densify(wy.geom.map(([la, lo]) => this.proj(la, lo)), 6);
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = { x0: pts[i][0], z0: pts[i][1], x1: pts[i + 1][0], z1: pts[i + 1][1], hw: w / 2, walk: false, name: '', type, tile: t.key, bridge: false, y0: 0, y1: 0, _pre: true, wid: wy.id };
        this.addCell(this.roadCells, Math.min(seg.x0, seg.x1) - seg.hw, Math.min(seg.z0, seg.z1) - seg.hw, Math.max(seg.x0, seg.x1) + seg.hw, Math.max(seg.z0, seg.z1) + seg.hw, seg, t);
      }
    }
    const pois = this.preparePois(t, ways), poiBld = new Map(); for (const p of pois) if (p.bwId != null && !p.decorOnly) poiBld.set(p.bwId, p);
    // our own buildings win: a restaurant standing on its own (no mapped footprint of its own) clears any ordinary small building in its way
    const clear = []; for (const p of pois) if (!p.poly && !p.inMall && (p.kind === 'pizza' || p.kind === 'wic' || p.kind === 'bq')) { const sp = this.standSpot(p); if (sp) { p.spot = sp; clear.push(sp); } }
    // When LightSystem is active it draws proper signals / stop signs; otherwise keep the simple poles.
    if (!this.lights) for (const p of pois) if (p.kind === 'traffic_light' || p.kind === 'road_sign') {
      const g = new THREE.Group(), base = this.elev.at(p.x, p.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, p.kind === 'traffic_light' ? 4.1 : 2.7, 7), new THREE.MeshStandardMaterial({ color: '#55585b', roughness: 0.8 })); pole.position.y = (p.kind === 'traffic_light' ? 2.05 : 1.35); g.add(pole);
      if (p.kind === 'traffic_light') { const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.28), new THREE.MeshStandardMaterial({ color: '#202326', roughness: 0.55 })); box.position.set(0, 3.65, 0); g.add(box); for (let i=0;i<3;i++) { const c = ['#ed3434','#e9b52e','#37c75a'][i], lamp = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:0.45 })); lamp.position.set(0, 3.98-i*0.32, 0.16); g.add(lamp); } }
      else { const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.09), new THREE.MeshStandardMaterial({ color: p.sign.includes('stop') ? '#d92525' : '#f2f0e8', roughness:0.7 })); board.position.y=2.55; g.add(board); }
      g.position.set(p.x, base, p.z); this.group.add(g); t.meshes.push(g);
    }
    // Bridges are often mapped as several ways joined end to end (two halves meeting mid-river). Work out each chain's deck height
    // from the ends that actually land on a road, so a half never ramps down to the river bed in the middle (the old V shape).
    const bKey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2), bridgeAt = new Map();
    {
      const isB = tg => tg.highway && ROAD_W[tg.highway] && tg.bridge && tg.bridge !== 'no' && !(tg.tunnel && tg.tunnel !== 'no');
      const roadNodes = new Set(), bw = [];
      for (const wy of ways) { const tg = wy.tags; if (!tg.highway || !wy.geom || wy.geom.length < 2) continue; const P = wy.geom.map(([la, lo]) => this.proj(la, lo)); if (isB(tg)) bw.push({ wy, a: bKey(...P[0]), b: bKey(...P[P.length - 1]), pa: P[0], pb: P[P.length - 1] }); else for (const p of P) roadNodes.add(bKey(...p)); }
      const par = new Map(), find = k => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; }, cnt = new Map();
      for (const b of bw) { for (const k of [b.a, b.b]) { if (!par.has(k)) par.set(k, k); cnt.set(k, (cnt.get(k) || 0) + 1); } par.set(find(b.a), find(b.b)); }
      const base = new Map(), anyMax = new Map();
      for (const b of bw) for (const [k, p] of [[b.a, b.pa], [b.b, b.pb]]) { const r = find(k); anyMax.set(r, Math.max(anyMax.get(r) ?? -1e9, this.elev.at(p[0], p[1]))); }
      // a real landing: the end meets an ordinary road, or it's a loose end on dry ground that isn't sunk down in a river valley
      const land = (k, p) => { if (roadNodes.has(k)) return true; if (cnt.get(k) !== 1 || this.water.inside(p[0], p[1])) return false; return this.elev.at(p[0], p[1]) > anyMax.get(find(k)) - 3; };
      for (const b of bw) for (const [k, p] of [[b.a, b.pa], [b.b, b.pb]]) if (land(k, p)) { const r = find(k); base.set(r, Math.max(base.get(r) ?? -1e9, this.elev.at(p[0], p[1]))); }
      for (const b of bw) {
        const r = find(b.a), top = base.has(r) ? base.get(r) : anyMax.get(r);
        bridgeAt.set(b.wy.id, { ha: land(b.a, b.pa) ? this.elev.at(b.pa[0], b.pa[1]) : top, hb: land(b.b, b.pb) ? this.elev.at(b.pb[0], b.pb[1]) : top, joined: !land(b.a, b.pa) || !land(b.b, b.pb) });
      }
    }
    // Guard rails are built tile by tile: each tile draws the rail pieces that start inside it, once every road crossing it is known,
    // so a rail never runs across a ramp or side road that belongs to a tile that hadn't loaded yet.
    if (!partial) {
      const tx0 = t.i * TILE, tz0 = t.j * TILE, own = (x, z) => x >= tx0 && x < tx0 + TILE && z >= tz0 && z < tz0 + TILE;
      for (const wy of ways) {
        const tg = wy.tags, type = tg.highway;
        if (!RAIL_TYPES.has(type) || tg.area === 'yes' || (tg.tunnel && tg.tunnel !== 'no') || (tg.bridge && tg.bridge !== 'no') || !wy.geom || wy.geom.length < 2) continue;
        try {
          const w = ROAD_W[type] * (tg.lanes ? Math.min(1.6, Math.max(0.8, +tg.lanes / 2)) : 1);
          const dp = densify(wy.geom.map(([la, lo]) => this.proj(la, lo)), 4); if (dp.length < 2) continue;
          const hs = dp.map(p => this.elev.at(p[0], p[1]));
          const rg = this.buildRails(t, dp, w, hs, wy.id, type, own); if (rg) railGeos.push(rg);
        } catch (e) { console.warn('guard rail', wy.id, e); }
      }
    }
    for (const wy of ways) {
      const tg0 = wy.tags;
      if (!tg0.highway && !tg0.building) {
        if (tg0.natural === 'tree_row') { if (!partial && wy.geom.length >= 2) treeRows.push(wy.geom.map(([la, lo]) => this.proj(la, lo))); continue; }
        if (!partial) { const place = treePlace(tg0); if (place && wy.geom.length >= 4) treeAreas.push({ id: wy.id | 0, place, wood: leafOf(tg0), pts: wy.geom.map(([la, lo]) => this.proj(la, lo)) }); }
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
        const type = tg.highway, bike = type === 'cycleway' || (/^(path|footway|bridleway)$/.test(type) && /^(designated|yes)$/.test(tg.bicycle || '')); // bike paths are drawn like little roads
        const w = bike ? Math.max(3.2, ROAD_W[type] * 1.35) : ROAD_W[type] * (tg.lanes ? Math.min(1.6, Math.max(0.8, +tg.lanes / 2)) : 1);
        const tunnel = tg.tunnel && tg.tunnel !== 'no', layer = +(tg.layer || 0);
        if (tunnel) continue;
        const y = (MAJOR.has(type) ? 0.16 : WALK.has(type) && !bike ? 0.1 : 0.13) + Math.max(0, layer) * 0.005;
        const dp = densify(pts, 4), bridge = !!(tg.bridge && tg.bridge !== 'no');
        let hs, H;
        if (bridge) {
          const cum = [0]; for (let i = 1; i < dp.length; i++) cum.push(cum[i - 1] + Math.hypot(dp[i][0] - dp[i - 1][0], dp[i][1] - dp[i - 1][1]));
          const ch = bridgeAt.get(wy.id), L = cum[cum.length - 1] || 1;
          const ha = ch ? ch.ha : this.elev.at(dp[0][0], dp[0][1]), hb = ch ? ch.hb : this.elev.at(dp[dp.length - 1][0], dp[dp.length - 1][1]);
          // one way spanning the whole crossing gets a gentle arch; a piece of a longer bridge keeps a straight, level-ish deck to its neighbour
          const hump = ch && ch.joined ? Math.min(1, L * 0.01) : layer >= 1 ? Math.min(6, L * 0.12) : Math.min(1.5, L * 0.03);
          // and never dips below the ground (or a riverbank) it passes over
          hs = dp.map((p, i) => { const k = cum[i] / L; return Math.max(ha + (hb - ha) * k + Math.sin(Math.PI * k) * hump, this.elev.at(p[0], p[1]) + 0.6); });
          H = (x, z, i) => hs[i];
        } else { hs = dp.map(p => this.elev.at(p[0], p[1])); H = (x, z) => this.elev.at(x, z); }
        const soft = (WALK.has(type) && !bike) || type === 'track';
        (soft ? pathGeos : roadGeos).push(planarUV(ribbon(dp, w, y, roadTint(bike ? '#4e535c' : ROAD_C[type] || '#55545c', soft), H, bridge), soft ? 4 : 9));
        if (!soft && !bridge) shoulderGeos.push(planarUV(ribbon(dp, w + (MAJOR.has(type) ? 4.4 : bike ? 1.2 : 3.4), 0.07, '#a39b8e', H), 7)); // gravel shoulder under the road, peeking out at the sides
        if (bridge) sideGeos.push(wallUV(bridgeSides(dp, w, hs, y), 4));
        if (MAJOR.has(type) && dp.length > 1) { lineGeos.push(dashes(dp, y + 0.02, hs)); if (w >= 8) edgeGeos.push(edgeLines(dp, w / 2 - 0.45, y + 0.02, hs)); }
        const name = tg.name || tg.ref || '';
        for (let i = 0; i < dp.length - 1; i++) {
          const seg = { x0: dp[i][0], z0: dp[i][1], x1: dp[i + 1][0], z1: dp[i + 1][1], hw: w / 2, walk: WALK.has(type), name, type, tile: t.key, bridge, y0: hs[i] + y, y1: hs[i + 1] + y, wid: wy.id };
          this.addCell(this.roadCells, Math.min(seg.x0, seg.x1) - seg.hw, Math.min(seg.z0, seg.z1) - seg.hw, Math.max(seg.x0, seg.x1) + seg.hw, Math.max(seg.z0, seg.z1) + seg.hw, seg, t);
        }
      } else if (tg.building && pts.length >= 4) {
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        if (tg.building === 'roof' || tg['building:part']) continue;
        const poly = pts.slice(0, -1); if (poly.length < 3) continue;
        // Never put a solid building in the middle of a road (bad OSM footprints / dual-tagged ways)
        {
          let cx = 0, cz = 0; for (const [x, z] of poly) { cx += x; cz += z; } cx /= poly.length; cz /= poly.length;
          const onC = this.onRoad(cx, cz, 0.6);
          let onN = 0; for (const [x, z] of poly) if (this.onRoad(x, z, 0.35)) onN++;
          if (onC || onN >= Math.max(2, (poly.length * 0.45) | 0)) continue;
          // corners poking into the street get pulled back to the kerb; a footprint the road runs through is left out
          const fit = this.fitOffRoad(poly); if (!fit) continue;
          if (fit !== poly) { poly.length = 0; for (const v of fit) poly.push(v); }
        }
        if (poiBld.has(wy.id) && poiBld.get(wy.id).kind === 'blicks') continue; // replaced by a drive-in store with its own walls
        if (clear.length && !poiBld.has(wy.id)) { // a small ordinary building where one of our restaurants goes: leave it out
          const b = bbOf(poly); let hit = false;
          for (const c of clear) { const r = 10.5; if (b.x1 < c.x - r || b.x0 > c.x + r || b.z1 < c.z - r || b.z0 > c.z + r) continue; if (Math.abs(polyArea(poly)) < 2500) { hit = true; break; } }
          if (hit) continue;
        }
        if (poiBld.has(wy.id) && FOOD.has(poiBld.get(wy.id).kind)) { const b = bbOf(poly); this.addCell(this.bldCells, b.x0, b.z0, b.x1, b.z1, { poly, ...b, tile: t.key }, t); continue; } // drawn as a Wicdonald's below
        let base = 1e9; for (const [x, z] of poly) base = Math.min(base, this.elev.at(x, z)); base -= 0.3;
        const before = {}; for (const k in Bs) before[k] = Bs[k].pos.length;
        try { addBuilding(Bs, poly, tg, wy.id); } catch (e) { console.warn('building', wy.id, e); }
        let top = base + 4; for (const k in Bs) { const P = Bs[k].pos; for (let i = before[k] + 1; i < P.length; i += 3) { P[i] += base; if (P[i] > top) top = P[i]; } }
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        this.addCell(this.bldCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, top, tile: t.key }, t);
      } else if (pts.length >= 4 && tg.landuse !== 'residential') {
        const nat = tg.natural, isWater = false;
        const isWood = nat === 'wood' || tg.landuse === 'forest';
        const col = isWater ? '#5f9fd0' : isWood ? '#6f9a5e' : tg.leisure === 'pitch' ? '#88b86a' : nat === 'scrub' ? '#86a866' : nat === 'heath' ? '#a3a06c' : nat === 'wetland' ? '#7fa88a' : tg.landuse === 'orchard' ? '#97bd6e' : (tg.landuse === 'cemetery' || tg.amenity === 'grave_yard') ? '#8fb276' : '#9cc47e';
        this.wayIds.add(wy.id); t.ids.push(wy.id);
        { const poly = pts.slice(0, -1); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
          const a = { poly, col: new THREE.Color(col), x0, x1, z0, z1, tile: t.key, pri: tg.leisure === 'pitch' }; this.areas.push(a); areaBB = areaBB ? { x0: Math.min(areaBB.x0, x0), x1: Math.max(areaBB.x1, x1), z0: Math.min(areaBB.z0, z0), z1: Math.max(areaBB.z1, z1) } : { x0, x1, z0, z1 }; }
      }
    }
    if (!partial) this.growTrees(t, ways, trees, treeAreas, treeRows);
    // playgrounds and cemeteries (parks.js)
    if (!partial) try {
      const tb = [t.i * TILE, t.j * TILE, (t.i + 1) * TILE, (t.j + 1) * TILE];
      const play = (ways.play || []).map(p => { const [x, z] = this.proj(p.lat, p.lon); return { x, z, kind: p.kind }; });
      if (play.length) { const m = addPlaygrounds(this, t, play, tb); if (m) { this.group.add(m); t.meshes.push(m); } }
      const yards = ways.filter(w => !w.tags.building && (w.tags.landuse === 'cemetery' || w.tags.amenity === 'grave_yard') && w.geom.length >= 4).map(w => w.geom.map(([la, lo]) => this.proj(la, lo)).slice(0, -1));
      if (yards.length) for (const m of addGraves(this, t, yards, tb)) { this.group.add(m); t.meshes.push(m); }
    } catch (e) { console.warn('[overpass] parks', e); }
    if (pois.length) {
      const acc = {}; for (const p of pois) { if (p.kind === 'traffic_light' || p.kind === 'road_sign') continue; try { this.placePoi(t, p, acc); } catch (e) { console.warn('poi', p.key, e); } }
      const PM = poiMaterials();
      for (const k in acc) { const g = mergeGeometries(acc[k], false); acc[k].forEach(x => x.dispose()); if (!g) continue; const m = new THREE.Mesh(g, PM[k]); m.castShadow = k === 'solid'; m.receiveShadow = k === 'solid'; this.group.add(m); t.meshes.push(m); }
    }
    const add = (geos, mat, shadow) => { if (!geos.length) return; const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); if (!g) return; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = shadow; this.group.add(m); t.meshes.push(m); };
    add(areaGeos, this.areaMat, false); add(shoulderGeos, this.shoulderMat, false); add(roadGeos, this.roadMat, false); add(pathGeos, this.pathMat, false); add(sideGeos, this.concreteMat, true); add(lineGeos, this.lineMat, false); add(edgeGeos, this.edgeMat, false); add(railGeos, this.railMat, true); add(bldGeos, this.bldMat, true);
    const M = buildingMaterials();
    for (const k in Bs) { const g = Bs[k].geometry(); if (!g) continue; const m = new THREE.Mesh(g, M[k]); m.castShadow = k !== 'flat'; m.receiveShadow = true; this.group.add(m); t.meshes.push(m); }
    if (!partial) this.renderWater(t);
    if (areaBB) this.refreshChunks(areaBB);
    for (const id of (ways.rels || [])) if (!this.water.has('r' + id) && !this.water.relPending.has(id)) { this.water.relPending.add(id); this.relQueue.push(id); }
    this.pumpRelations();
    if (trees.length) { // one instanced mesh per species (trees.js)
      for (const tr of trees) tr.y = this.elev.at(tr.x, tr.z);
      t.treeSets = [];
      for (const m of buildTreeMeshes(trees, hash)) { const L = m.userData.trees; this.group.add(m); t.meshes.push(m); t.treeSets.push({ m, xz: L.map(q => [q.x, q.z]), dead: new Uint8Array(L.length) }); m.userData.trees = null; }
    }
    // Street lamps + traffic signals (lights.js). Needs roadCells already filled above.
    try { if (this.lights && !partial) this.lights.addTile(t, { ways, pois }); } catch (e) { console.warn('[overpass] lights addTile', e); }
  }
  // true where a tree must not stand: on a road, inside a building or in water
  treeBlocked(x, z) {
    if (this.onRoad(x, z, 2.2) || this.water.inside(x, z)) return true;
    const ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (const list of [this.bldCells.get(ck), this.extraCells.get(ck)]) if (list) for (const b of list) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (pip(x, z, b.poly)) return true; }
    return false;
  }
  // Trees are generated per tile, only inside that tile, from a fixed world grid so tiles never double up or leave gaps,
  // and only once every road, building and lake of the tile is known so none end up on them.
  // Trees where they really are: OSM's single trees, tree rows, woods and forests (needle / broad / mixed leaves), plus scattered
  // trees in parks, gardens, village greens, cemeteries and residential yards, fruit trees in orchards, bushes on scrub and heath,
  // willows and birches in swamps. Species come from trees.js (OSM genus / leaf type when mapped, else place + latitude).
  growTrees(t, ways, trees, areas, rows) {
    const tx0 = t.i * TILE, tz0 = t.j * TILE, tx1 = tx0 + TILE, tz1 = tz0 + TILE, MAXT = this.treeMax || 3200, lat = this.unproj(tx0 + TILE / 2, tz0 + TILE / 2)[0];
    const put = (x, z, r, ctx, s = 0.8 + r * 0.7) => {
      if (trees.length >= MAXT || x < tx0 || x >= tx1 || z < tz0 || z >= tz1 || this.treeBlocked(x, z)) return;
      const c = { lat, ...ctx }; if (c.place === 'park' || c.place === 'garden' || c.place === 'residential') c.nearWater = this.water.inside(x + 14, z) || this.water.inside(x - 14, z) || this.water.inside(x, z + 14) || this.water.inside(x, z - 14);
      const sp = pickSpecies(c, hash(Math.floor(x * 3.1) ^ Math.floor(z * 5.7) ^ 99));
      trees.push({ x, z, r, sp, s: sp === 'bush' ? 0.7 + r * 0.6 : s });
    };
    // denser first (forests), so the cap never squeezes out real woods
    const DENS = { forest: [8, 1], swamp: [10, 0.75], orchard: [6, 1], scrub: [6, 0.55], park: [13, 0.45], garden: [10, 0.5], green: [16, 0.35], cemetery: [17, 0.3], residential: [12, 0.28] };
    const order = ['forest', 'orchard', 'swamp', 'park', 'garden', 'scrub', 'green', 'cemetery', 'residential'];
    for (const a of [...areas].sort((p, q) => order.indexOf(p.place) - order.indexOf(q.place))) {
      const [sp, keep] = DENS[a.place] || [14, 0.4], bb = bbOf(a.pts), gx0 = Math.max(tx0, bb.x0), gx1 = Math.min(tx1, bb.x1), gz0 = Math.max(tz0, bb.z0), gz1 = Math.min(tz1, bb.z1);
      if (gx0 > gx1 || gz0 > gz1) continue;
      for (let gi = Math.floor(gx0 / sp); gi <= Math.floor(gx1 / sp); gi++) for (let gj = Math.floor(gz0 / sp); gj <= Math.floor(gz1 / sp); gj++) {
        const k = (gi * 73856093) ^ (gj * 19349663) ^ a.id;
        if (hash(k + 7) > keep) continue;
        const jit = a.place === 'orchard' ? 0.1 : 0.76, x = (gi + 0.5 - jit / 2 + jit * hash(k)) * sp, z = (gj + 0.5 - jit / 2 + jit * hash(k + 17)) * sp;
        if (!pip(x, z, a.pts)) continue;
        if (a.place === 'residential' && this.nearBuilding(x, z, 3)) continue; // yard trees, not hugging walls
        put(x, z, hash(k + 3), { place: a.place === 'green' ? 'park' : a.place, wood: a.wood });
      }
    }
    for (const row of rows) for (const [x, z] of densify(row, 6)) put(x, z, hash(Math.floor(x * 7) ^ Math.floor(z * 13)), { place: 'row' });
    for (const [la, lo, genus] of (ways.trees || [])) { const [x, z] = this.proj(la, lo); put(x, z, hash(Math.floor(x * 7) ^ Math.floor(z * 13)), { place: 'tree', genus }); }
  }
  nearBuilding(x, z, r) {
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (this.inBuilding(x + ox, z + oz)) return true;
    return false;
  }
  // ---------- player-built structures (garages) ----------
  // obj: { id, poly: [[x, z]...], top, noCollide? }; solid for cars unless noCollide (that one only keeps trees away)
  addExtra(obj) {
    let x0 = 1e18, x1 = -1e18, z0 = 1e18, z1 = -1e18; for (const [x, z] of obj.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    Object.assign(obj, { x0, x1, z0, z1 }); obj.keys = [];
    const a = Math.floor(x0 / CELL), b = Math.floor(x1 / CELL), c = Math.floor(z0 / CELL), d = Math.floor(z1 / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) { const k = i + ',' + j; let l = this.extraCells.get(k); if (!l) { l = []; this.extraCells.set(k, l); } l.push(obj); obj.keys.push(k); }
    this.extraById.set(obj.id, obj); return obj;
  }
  removeExtra(id) {
    const o = this.extraById.get(id); if (!o) return; this.extraById.delete(id);
    for (const k of o.keys) { const l = this.extraCells.get(k); if (!l) continue; const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); if (!l.length) this.extraCells.delete(k); }
  }
  tileReady(x, z) { const t = this.tiles.get(Math.floor(x / TILE) + ',' + Math.floor(z / TILE)); return !!t && t.state === 'ready'; }
  inBuilding(x, z) {
    const ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (const list of [this.bldCells.get(ck), this.extraCells.get(ck)]) if (list) for (const b of list) { if (x < b.x0 - 0.5 || x > b.x1 + 0.5 || z < b.z0 - 0.5 || z > b.z1 + 0.5) continue; if (pip(x, z, b.poly)) return true; }
    return false;
  }
  // Is a w x d pad centred at (cx, cz), turned by yaw, free to build on? Roads, water, buildings, other garages and steep ground block it.
  padFree(cx, cz, yaw, w, d) {
    const s = Math.sin(yaw), c = Math.cos(yaw), toW = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c], mg = 1.5;
    for (const [lx, lz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { const [x, z] = toW(lx, lz); if (!this.tileReady(x, z)) return { ok: false, reason: 'Still loading this area…' }; }
    for (let lx = -w / 2 - mg; lx <= w / 2 + mg + 1e-6; lx += 2) for (let lz = -d / 2 - mg; lz <= d / 2 + mg + 1e-6; lz += 2) {
      const [x, z] = toW(lx, lz);
      if (this.water.inside(x, z)) return { ok: false, reason: "Can't build on water" };
      if (this.onRoad(x, z, 1.2)) return { ok: false, reason: 'Too close to a road' };
      if (this.inBuilding(x, z)) return { ok: false, reason: 'Something is already built here' };
    }
    // small buildings can sit between the sample points: check their corners too
    const R = Math.hypot(w, d) / 2 + mg + 2, ci = Math.floor((cx - R) / CELL), cj = Math.floor((cz - R) / CELL), ci2 = Math.floor((cx + R) / CELL), cj2 = Math.floor((cz + R) / CELL);
    for (let i = ci; i <= ci2; i++) for (let j = cj; j <= cj2; j++) for (const list of [this.bldCells.get(i + ',' + j), this.extraCells.get(i + ',' + j)]) if (list) for (const b of list) for (const [px, pz] of b.poly) {
      const dx = px - cx, dz = pz - cz, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= w / 2 + mg && Math.abs(lz) <= d / 2 + mg) return { ok: false, reason: 'Something is already built here' };
    }
    const zone = this.flatZone(cx, cz, yaw, w, d); if (!zone.ready) return { ok: false, reason: 'Still loading the ground…' };
    return { ok: true, y: zone.h }; // any slope is fine: the ground is levelled to fit the garage when it is built
  }
  // ---------- levelling the ground under a garage ----------
  // The terrain is a grid of height nodes (GS apart) that the mesh and every ground-height lookup are built from, so
  // changing the nodes under the pad changes the real ground: the mesh, the car and the trees all follow.
  // Nodes of cells that touch the pad are set fully flat; the next ring blends back into the natural ground.
  natNode(i, j) { const o = this.flatOrig.get(this.elev.key(i, j)); return o !== undefined ? o : this.elev.node(i, j); }
  flatZone(cx, cz, yaw, w, d) {
    const s = Math.sin(yaw), c = Math.cos(yaw), R = Math.hypot(w, d) / 2 + GS * 3, nodes = [];
    const dist = (x, z) => { const dx = x - cx, dz = z - cz, lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.hypot(Math.max(Math.abs(lx) - w / 2, 0), Math.max(Math.abs(lz) - d / 2, 0)); };
    const i0 = Math.floor((cx - R) / GS), i1 = Math.ceil((cx + R) / GS), j0 = Math.floor((cz - R) / GS), j1 = Math.ceil((cz + R) / GS);
    let sum = 0, n1 = 0, min = 1e9, max = -1e9, ready = true;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = i * GS, z = j * GS; let touch = false;
      for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (dist((i + a + 0.5) * GS, (j + b + 0.5) * GS) <= GS * 0.7072) { touch = true; break; }
      const dd = dist(x, z), wgt = touch ? 1 : Math.max(0, Math.min(0.9, 1 - (dd - GS * 0.5) / (GS * 1.5)));
      if (wgt <= 0) continue;
      if (!this.elev.have(x, z)) { if (touch) ready = false; continue; }
      const nat = this.natNode(i, j); nodes.push({ i, j, x, z, w: wgt, nat });
      if (touch) { sum += nat; n1++; min = Math.min(min, nat); max = Math.max(max, nat); }
    }
    if (!n1) return { ready: false, nodes, h: 0, min: 0, max: 0 };
    return { ready, nodes, h: Math.round(sum / n1 * 100) / 100, min, max };
  }
  flattenPad(id, cx, cz, yaw, w, d) {
    if (!this.elev.enabled) return { ok: true, y: 0 };
    const z = this.flatZone(cx, cz, yaw, w, d); if (!z.ready) return null;
    if (this.flats.has(id)) this.unflattenPad(id, true);
    const rec = { nodes: [], bb: { x0: 1e18, x1: -1e18, z0: 1e18, z1: -1e18 } };
    for (const n of z.nodes) {
      if (n.w < 1 && this.onRoad(n.x, n.z, 2)) continue; // leave the ring around the pad alone where a road runs, so it can't be buried
      const k = this.elev.key(n.i, n.j); if (!this.flatOrig.has(k)) this.flatOrig.set(k, n.nat);
      this.elev.setNode(n.i, n.j, n.nat + (z.h - n.nat) * n.w); rec.nodes.push([n.i, n.j]);
      rec.bb.x0 = Math.min(rec.bb.x0, n.x); rec.bb.x1 = Math.max(rec.bb.x1, n.x); rec.bb.z0 = Math.min(rec.bb.z0, n.z); rec.bb.z1 = Math.max(rec.bb.z1, n.z);
    }
    this.flats.set(id, rec); this.refreshChunks({ x0: rec.bb.x0 - GS, x1: rec.bb.x1 + GS, z0: rec.bb.z0 - GS, z1: rec.bb.z1 + GS });
    return { ok: true, y: z.h };
  }
  unflattenPad(id, quiet = false) {
    const rec = this.flats.get(id); if (!rec) return; this.flats.delete(id);
    for (const [i, j] of rec.nodes) { const k = this.elev.key(i, j), o = this.flatOrig.get(k); if (o !== undefined) { this.elev.setNode(i, j, o); this.flatOrig.delete(k); } }
    if (!quiet) this.refreshChunks({ x0: rec.bb.x0 - GS, x1: rec.bb.x1 + GS, z0: rec.bb.z0 - GS, z1: rec.bb.z1 + GS });
  }
  addPaved(id, x, z, yaw, w, d) { this.removePaved(id); this.pavedPads.push({ id, x, z, s: Math.sin(yaw), c: Math.cos(yaw), w, d, r: Math.hypot(w, d) / 2 + 2 }); }
  removePaved(id) { this.pavedPads = this.pavedPads.filter(p => p.id !== id); }
  // take away trees standing inside a polygon (a garage that was built after the trees grew)
  pruneTreesIn(poly) {
    let x0 = 1e18, x1 = -1e18, z0 = 1e18, z1 = -1e18; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (const t of this.tiles.values()) {
      for (const ts of (t.treeSets || [])) { let ch = false;
      for (let i = 0; i < ts.xz.length; i++) { if (ts.dead[i]) continue; const [x, z] = ts.xz[i]; if (x < x0 || x > x1 || z < z0 || z > z1) continue; if (pip(x, z, poly)) { ts.m.setMatrixAt(i, ZERO_M); ts.dead[i] = 1; ch = true; } }
      if (ch) ts.m.instanceMatrix.needsUpdate = true; }
    }
  }
  // a lake that finished loading after the trees were placed: take away the trees standing in it
  pruneTreesInWater(bb) {
    for (const t of this.tiles.values()) {
      for (const ts of (t.treeSets || [])) { let ch = false;
      for (let i = 0; i < ts.xz.length; i++) { if (ts.dead[i]) continue; const [x, z] = ts.xz[i]; if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue; if (this.water.inside(x, z)) { ts.m.setMatrixAt(i, ZERO_M); ts.dead[i] = 1; ch = true; } }
      if (ch) ts.m.instanceMatrix.needsUpdate = true; }
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
        const cap = p.kind === 'store32' ? 24000 : p.kind === 'blicks' ? 40000 : 1800; // big-box stores fill big buildings
        if (p.wayId == null && area > cap) { // inside a mall or a strip plaza
          if (p.kind === 'blicks' || p.kind === 'wic' || p.kind === 'bq' || p.kind === 'pizza') { p.mallLevels = +(bw.tags['building:levels'] || 1); bw = null; p.inMall = true; } // gets its own building by the road instead
          else continue;
        }
      }
      if (bw) {
        const poly = bw.geom.map(([la, lo]) => this.proj(la, lo)).slice(0, -1);
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
  // where a restaurant with no footprint of its own stands: at its map point, pushed back off the road if needed, facing the road
  standSpot(p) {
    const near = this.nearRoad(p.x, p.z); let cx = p.x, cz = p.z, yaw = 0;
    if (near) {
      let vx = p.x - near.px, vz = p.z - near.pz, L = Math.hypot(vx, vz);
      if (L < 0.5) { const ex = near.seg.x1 - near.seg.x0, ez = near.seg.z1 - near.seg.z0, l = Math.hypot(ex, ez) || 1; vx = -ez / l; vz = ex / l; L = 1; }
      vx /= L; vz /= L; const need = near.seg.hw + 12;
      if (near.d < need) { cx = near.px + vx * need; cz = near.pz + vz * need; }
      for (let k = 0; k < 4 && this.onRoad(cx, cz, 1.0); k++) { cx += vx * 2.5; cz += vz * 2.5; }
      yaw = Math.atan2(-vx, -vz);
    } else if (this.onRoad(cx, cz, 1.0)) return null;
    return { x: cx, z: cz, yaw };
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
      if (p.kind === 'blicks') return this.placeBlicks(t, p, acc, cx, cz, yaw, Wd, D, rectCell);
      if (FOOD.has(p.kind)) {
        const base = baseAt(P) - 0.3, roofY = Math.max(4, (p.levels || 1) * 3.2), cap = p.kind === 'store32' ? 140 : 60, Wc = Math.min(cap, Math.max(p.kind === 'store32' ? 20 : 6, Wd)), Dc = Math.min(cap, Math.max(p.kind === 'store32' ? 16 : 6, D));
        M.makeRotationY(yaw).setPosition(cx, base, cz); brandBuilding(acc, M, p.kind, Wc, Dc, !p.decorOnly, roofY);
        if (p.decorOnly && p.kind !== 'store32' && p.kind !== 'repair') { // the building is already drawn: give it a proper shop front where the restaurant is
          const uw = Math.min(10, Math.max(5, Wd * (p.wayId != null ? 0.85 : 0.4))), half = Wd / 2 - uw / 2 - 0.3;
          const lx = p.wayId != null ? 0 : Math.max(-half, Math.min(half, (p.x - cx) * Math.cos(yaw) - (p.z - cz) * Math.sin(yaw)));
          storefront(acc, M, p.kind, half > 0 ? lx : 0, D / 2 + 0.02, uw, roofY);
        }
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
        vx /= L; vz /= L; const need = near.seg.hw + (p.kind === 'blicks' ? 27 : p.kind === 'store32' ? 28 : FOOD.has(p.kind) ? 12 : 10.5);
        if (near.d < need) { cx = near.px + vx * need; cz = near.pz + vz * need; }
        // keep generated buildings off the carriageway even if the POI node sat in the road
        for (let k = 0; k < 4 && this.onRoad(cx, cz, 1.0); k++) { cx += vx * 2.5; cz += vz * 2.5; }
        yaw = Math.atan2(-vx, -vz);
      } else if (this.onRoad(cx, cz, 1.0)) {
        return; // nowhere safe to stand
      }
      if (p.kind === 'blicks') {
        // a 50 x 40 m store needs clear ground: if the spot by the mapped point is taken (a mall, other buildings), look around for open ground next to a road
        const fits = (x, z, yw) => { const c = Math.cos(yw), s2 = Math.sin(yw); return ![[0, 0], [-25, -20], [25, -20], [25, 20], [-25, 20], [0, -20], [0, 20], [-25, 0], [25, 0], [0, 25]].some(([a, b]) => { const X = x + a * c + b * s2, Z = z - a * s2 + b * c; return this.collide(X, Z, 1) || this.onRoad(X, Z, 0.5) || this.water.inside(X, Z); }); };
        if (!fits(cx, cz, yaw)) {
          let found = null;
          for (let r = 30; r <= 240 && !found; r += 15) for (let k = 0; k < 16 && !found; k++) {
            const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, nr = this.nearRoad(x, z); if (!nr || nr.d > 48 || nr.d < nr.seg.hw + 22) continue;
            const yw = Math.atan2(nr.px - x, nr.pz - z); if (fits(x, z, yw)) found = [x, z, yw];
          }
          if (found) [cx, cz, yaw] = found;
        }
        return this.placeBlicks(t, p, acc, cx, cz, yaw, 50, 40, rectCell);
      }
      if (FOOD.has(p.kind) && p.inMall) {
        // a restaurant unit in a strip plaza (most Slice Street Pizzas are): find clear ground beside a road nearby for a little stand-alone shop
        const W = 16, D = 11, fits = (x, z, yw) => { const c = Math.cos(yw), s2 = Math.sin(yw); return ![[0, 0], [-8, -5.5], [8, -5.5], [8, 5.5], [-8, 5.5], [0, -5.5], [0, 5.5], [-8, 0], [8, 0], [10, 9]].some(([a, b]) => { const X = x + a * c + b * s2, Z = z - a * s2 + b * c; return this.collide(X, Z, 0.8) || this.onRoad(X, Z, 0.5) || this.water.inside(X, Z); }); };
        let found = fits(cx, cz, yaw) ? [cx, cz, yaw] : null;
        for (let rr = 14; rr <= 160 && !found; rr += 10) for (let k = 0; k < 18 && !found; k++) {
          const a = k / 18 * Math.PI * 2, x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr, nr = this.nearRoad(x, z); if (!nr || nr.d > 30 || nr.d < nr.seg.hw + 8) continue;
          const yw = Math.atan2(nr.px - x, nr.pz - z); if (fits(x, z, yw)) found = [x, z, yw];
        }
        if (found) {
          [cx, cz, yaw] = found; const foot = [toW(cx, cz, yaw, -W / 2, -D / 2), toW(cx, cz, yaw, W / 2, -D / 2), toW(cx, cz, yaw, W / 2, D / 2), toW(cx, cz, yaw, -W / 2, D / 2)];
          M.makeRotationY(yaw).setPosition(cx, baseAt(foot) - 0.3, cz); brandBuilding(acc, M, p.kind, W, D, true);
          rectCell(cx, cz, yaw, 0, 0, W, D); rectCell(cx, cz, yaw, W / 2 + 2, D / 2 + 3.5, 0.7, 0.7); r = 15;
        } else { // no room anywhere: its logo goes up on the plaza's roof, with the pylon sign out by the road
          M.makeRotationY(yaw).setPosition(p.x, baseAt([[p.x, p.z]]) - 0.3, p.z); brandBuilding(acc, M, p.kind, W, D, false, Math.max(4, (p.mallLevels || 1) * 3.2 + 0.6));
          const [qx, qz] = toW(p.x, p.z, yaw, W / 2 + 2, D / 2 + 3.5); rectCell(qx, qz, yaw, 0, 0, 0.7, 0.7); cx = p.x; cz = p.z; r = 16;
        }
      } else if (FOOD.has(p.kind)) {
        if (p.spot) { cx = p.spot.x; cz = p.spot.z; yaw = p.spot.yaw; }
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
    if (p.kind === 'pizza') console.info('[overpass] Slice Street Pizza placed', p.key, p.poly ? (p.decorOnly ? 'shop front on a mapped building' : 'replacing its mapped building') : p.inMall ? 'beside its plaza' : 'on its own', Math.round(cx), Math.round(cz));
  }
  // Blick's Shooting Goods: level, paved floor; walls, racks and counter are solid, the 10 m doorway is open so you can drive in
  placeBlicks(t, p, acc, cx, cz, yaw, W0, D0, rectCell) {
    const L = blicksLayout(W0, D0), M = new THREE.Matrix4(), key = 'poi:' + p.key, c = Math.cos(yaw), s = Math.sin(yaw);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + a * L.W / 2 * c + b * L.D / 2 * s, cz - a * L.W / 2 * s + b * L.D / 2 * c]);
    let base = 1e9; for (const [x, z] of corners) base = Math.min(base, this.elev.at(x, z));
    let fl = null; try { fl = this.flattenPad(key, cx, cz, yaw, L.W + 2, L.D + 2); } catch (e) { }
    if (fl) base = fl.y;
    M.makeRotationY(yaw).setPosition(cx, base, cz); blicksStore(acc, M, L.W, L.D);
    for (const [x, z, w, d] of [...L.walls, ...L.racks, L.counter]) rectCell(cx, cz, yaw, x, z, w, d);
    rectCell(cx, cz, yaw, L.W / 2 + 3, L.D / 2 + 4, 0.7, 0.7); // pylon sign
    this.addPaved(key, cx, cz, yaw, L.W, L.D);
    this.pois.push({ key: p.key, kind: 'blicks', x: cx, z: cz, yaw, r: Math.hypot(L.W, L.D) / 2 + 4, tile: t.key, name: p.name, shop: L.shop });
  }
  renderWater(t) {
    if (t.waterMesh) { this.group.remove(t.waterMesh); t.waterMesh.geometry.dispose(); t.meshes = t.meshes.filter(m => m !== t.waterMesh); t.waterMesh = null; }
    const g = this.water.geometry(t.i * TILE, t.j * TILE, TILE, -0.25, (x, z) => this.elev.at(x, z), (x, z) => this.terrainY(x, z)); if (!g) return;
    const m = new THREE.Mesh(g, waterMaterial()); m.receiveShadow = true; this.group.add(m); t.meshes.push(m); t.waterMesh = m;
  }
  refreshWater(bb, except) {
    if (this.sinkCache) this.sinkCache.clear(); // new water changes how far the ground sinks
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
  // Keep a building footprint off every carriageway: walls stay at least `gap` metres from the road edge. Corners that stick
  // into a road are pushed straight out of it; if a road still runs through the footprint (between corners), or the
  // footprint had to be squashed too much, returns null (leave the building out). Returns the same array when nothing moved.
  fitOffRoad(poly, gap = 0.6) {
    const segsNear = (x, z) => { const out = []; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const sg of (this.roadCells.get((ci + di) + ',' + (cj + dj)) || [])) if (!sg.walk && !sg.bridge && sg.type !== 'track' && sg.type !== 'service') out.push(sg); return out; };
    // (driveways and alleys — 'service' — often run right up to a garage door or under an arch, so they're left alone)
    let moved = false; const P = poly.map(v => [v[0], v[1]]);
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const v of P) for (const sg of segsNear(v[0], v[1])) {
        const ex = sg.x1 - sg.x0, ez = sg.z1 - sg.z0, l2 = ex * ex + ez * ez || 1, k = Math.max(0, Math.min(1, ((v[0] - sg.x0) * ex + (v[1] - sg.z0) * ez) / l2));
        const px = sg.x0 + ex * k, pz = sg.z0 + ez * k, d = Math.hypot(v[0] - px, v[1] - pz), need = sg.hw + gap;
        if (d >= need) continue;
        if (d < 0.05) return null;
        v[0] = px + (v[0] - px) / d * need; v[1] = pz + (v[1] - pz) / d * need; any = moved = true;
      }
      if (!any) break;
    }
    if (moved) {
      // too much moved (a bad footprint), or squashed to a sliver: leave it out
      for (let i = 0; i < P.length; i++) if (Math.hypot(P[i][0] - poly[i][0], P[i][1] - poly[i][1]) > 7) return null;
      const area = q => { let a = 0; for (let i = 0; i < q.length; i++) { const [x0, z0] = q[i], [x1, z1] = q[(i + 1) % q.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
      const a0 = area(poly), a1 = area(P); if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < Math.abs(a0) * 0.4) return null;
    }
    // walls crossing a road between corners: sample along every wall
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 1; k < n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; for (const sg of segsNear(x, z)) if (segDist(x, z, sg) < sg.hw - 0.2) return null; }
    }
    return moved ? P : poly;
  }
  nearbySegs(x, z) { return this.roadCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }
  onRoad(x, z, pad = 0.6) {
    for (const s of this.nearbySegs(x, z)) if (!s.walk && segDist(x, z, s) < s.hw + pad) return true;
    for (const p of this.pavedPads) { const dx = x - p.x, dz = z - p.z; if (Math.abs(dx) > p.r) continue; const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c; if (Math.abs(lx) <= p.w / 2 + pad * 0.5 && Math.abs(lz) <= p.d / 2 + pad * 0.5) return true; }
    return false;
  }
  // true when (x, z) is clear of every drivable carriageway nearby (except way `skipWid`), with `pad` metres to spare
  roadClear(x, z, skipWid = null, pad = 0.3) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const s of (this.roadCells.get((ci + di) + ',' + (cj + dj)) || [])) {
      if (s.walk || (skipWid != null && s.wid === skipWid)) continue;
      if (segDist(x, z, s) < s.hw + pad) return false;
    }
    return true;
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
    mk(planarUV(ribbon(dp, W_, y, roadTint('#4f4d57', false), H, true), 9), this.roadMat, false);
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

  // ---------- guard rails ----------
  // true where a guard rail must leave a gap: another road (ramp, junction, side street) crosses the rail line at the same level
  railBlocked(px, pz, ownY, wid, type) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const s of (this.roadCells.get((ci + di) + ',' + (cj + dj)) || [])) {
      if (s.wid === wid || s.walk) continue;
      const d = segDist(px, pz, s); if (d > s.hw + 1.1) continue;
      // continuation / parallel carriageway of the same road is not a junction, but a rail must never stand on its lanes
      if (s.type === type && d > s.hw + 0.3) continue;
      const e1 = s.x1 - s.x0, e2 = s.z1 - s.z0, l2 = e1 * e1 + e2 * e2 || 1; let k = ((px - s.x0) * e1 + (pz - s.z0) * e2) / l2; k = Math.max(0, Math.min(1, k));
      const oy = s.bridge ? s.y0 + (s.y1 - s.y0) * k : this.elev.at(px, pz);
      if (Math.abs(oy - ownY) < 3.5) return true;
    }
    return false;
  }
  // corrugated W-beam rail on posts along both edges of a highway. Returns one merged geometry and registers solid rail segments.
  buildRails(t, dp, w, hs, wid, type, own = null) {
    const n = dp.length, off = w / 2 + 0.8, P = [], N = [], C = [];
    const beam = new THREE.Color('#c9ced4'), beamHi = new THREE.Color('#e3e7ec'), post = new THREE.Color('#5d636b'), refl = new THREE.Color('#ffd98a');
    const tri = (a, b, c, col) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const q of [a, b, c]) { P.push(q[0], q[1], q[2]); N.push(nx, ny, nz); C.push(col.r, col.g, col.b); }
    };
    const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
    const box = (cx, y0, cz, sx, sy, sz, tx, tz, col) => { // sx along the rail, sz across it
      const nx = -tz, nz = tx, hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
      const c = (a, b, y) => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
      const v = [c(-hx, -hz, y0), c(hx, -hz, y0), c(hx, hz, y0), c(-hx, hz, y0), c(-hx, -hz, y1), c(hx, -hz, y1), c(hx, hz, y1), c(-hx, hz, y1)];
      quad(v[4], v[5], v[6], v[7], col); quad(v[0], v[3], v[2], v[1], col); quad(v[0], v[1], v[5], v[4], col); quad(v[1], v[2], v[6], v[5], col); quad(v[2], v[3], v[7], v[6], col); quad(v[3], v[0], v[4], v[7], col);
    };
    const st = [];
    for (let i = 0; i < n; i++) {
      const a = dp[Math.max(0, i - 1)], b = dp[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      st.push({ x: dp[i][0], z: dp[i][1], tx, tz, nx: -tz, nz: tx });
    }
    // W-beam cross-section: [bump toward the road, height]
    const prof = [[0, 0.42], [0, 0.5], [0.07, 0.56], [0, 0.63], [0.07, 0.7], [0, 0.77], [0, 0.85]];
    let any = false, count = 0;
    const mine = (x, z) => !own || own(x, z);
    // a rail station is usable only off every carriageway (its own road's lanes included) and out of the water
    const clear = (px, pz, y) => !this.railBlocked(px, pz, y, wid, type) && !this.water.inside(px, pz) && this.roadClear(px, pz, wid, 0.25);
    for (const sd of [1, -1]) {
      let prev = null;
      for (let i = 0; i < n; i++) {
        const s = st[i], px = s.x + s.nx * off * sd, pz = s.z + s.nz * off * sd, base = this.elev.at(px, pz) + 0.05, oy = hs[i];
        if (!clear(px, pz, oy)) { prev = null; continue; }
        const cur = { px, pz, base, s, i };
        // the piece between two stations must not cut across a road either (tight curves, ramps peeling off)
        if (prev && !clear((prev.px + px) / 2, (prev.pz + pz) / 2, (hs[prev.i] + oy) / 2)) prev = null;
        // post (every station this tile owns) + occasional reflector
        if (mine(px, pz)) {
          box(px + s.nx * sd * 0.14, base - 0.4, pz + s.nz * sd * 0.14, 0.12, 1.2, 0.09, s.tx, s.tz, post);
          if ((count++ % 6) === 0) box(px - s.nx * sd * 0.01, base + 0.8, pz - s.nz * sd * 0.01, 0.1, 0.07, 0.03, s.tx, s.tz, refl);
        }
        if (prev && mine(prev.px, prev.pz)) {
          const A = prev, B = cur;
          for (let k = 0; k < prof.length - 1; k++) {
            const pa = (q, pt) => { const dx = -sd * q.s.nx * pt[0], dz = -sd * q.s.nz * pt[0]; return [q.px + dx, q.base + pt[1], q.pz + dz]; };
            const col = (k % 2) ? beamHi : beam;
            quad(pa(A, prof[k]), pa(B, prof[k]), pa(B, prof[k + 1]), pa(A, prof[k + 1]), col);
          }
          // solid collision segment, road side normal points toward the road
          const seg = { ax: A.px, az: A.pz, bx: B.px, bz: B.pz, nx: -sd * A.s.nx, nz: -sd * A.s.nz, y: (A.base + B.base) / 2, tile: t.key };
          this.addCell(this.railCells, Math.min(seg.ax, seg.bx) - 1.5, Math.min(seg.az, seg.bz) - 1.5, Math.max(seg.ax, seg.bx) + 1.5, Math.max(seg.az, seg.bz) + 1.5, seg, t);
          any = true;
        }
        prev = cur;
      }
    }
    if (!any && !P.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return g;
  }
  // Solid guard rails. Pass the previous position (px, pz) so fast cars can't tunnel through. Returns { nx, nz, depth } or null.
  railCollide(x, z, rad = 1.3, y = null, px = null, pz = null) {
    const list = this.railCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!list) return null;
    let best = null;
    for (const r of list) {
      if (y != null && (y > r.y + 0.9 || y < r.y - 2.2)) continue; // jumped over it, or on another level
      const ex = r.bx - r.ax, ez = r.bz - r.az, l2 = ex * ex + ez * ez || 1; let k = ((x - r.ax) * ex + (z - r.az) * ez) / l2;
      const kc = Math.max(0, Math.min(1, k)), qx = r.ax + ex * kc, qz = r.az + ez * kc, d = Math.hypot(x - qx, z - qz);
      let nx, nz, depth;
      if (k >= 0 && k <= 1) { // along the rail: use the side the car came from
        let side = (x - qx) * r.nx + (z - qz) * r.nz;
        if (px != null) { const ps = (px - r.ax) * r.nx + (pz - r.az) * r.nz; if (Math.abs(ps) > 0.05) side = ps; }
        const sg = side >= 0 ? 1 : -1, sd = ((x - qx) * r.nx + (z - qz) * r.nz) * sg;
        if (sd >= rad) continue; nx = r.nx * sg; nz = r.nz * sg; depth = rad - sd;
      } else { // rail end cap
        if (d >= rad) continue; nx = d > 0.001 ? (x - qx) / d : r.nx; nz = d > 0.001 ? (z - qz) / d : r.nz; depth = rad - d;
      }
      if (!best || depth > best.depth) best = { nx, nz, depth };
    }
    return best;
  }
  collide(x, z, rad = 1.3, y = null) {
    const ck = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (const list of [this.bldCells.get(ck), this.extraCells.get(ck)]) {
    if (!list) continue;
    for (const b of list) {
      if (b.noCollide) continue;
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
    }
    return null;
  }
}

function segDist(x, z, s) { const ex = s.x1 - s.x0, ez = s.z1 - s.z0, l2 = ex * ex + ez * ez || 1; let k = ((x - s.x0) * ex + (z - s.z0) * ez) / l2; k = Math.max(0, Math.min(1, k)); return Math.hypot(x - (s.x0 + ex * k), z - (s.z0 + ez * k)); }
function pip(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; }
// is any part of a mesh within r of (x, z)? (its bounding box, worked out once)
function meshNear(m, x, z, r) {
  let b = m.userData.xzBox; if (!b) { const g = m.geometry; if (!g) return true; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox; b = m.userData.xzBox = [bb.min.x, bb.max.x, bb.min.z, bb.max.z]; }
  const dx = Math.max(0, b[0] - x, x - b[1]), dz = Math.max(0, b[2] - z, z - b[3]); return dx * dx + dz * dz <= r * r;
}
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
// a road strip that follows the ground: a vertex every ~4 m across as well as along, so wide roads can't have the
// terrain poke up through the middle. 'edgeM' = metres to the nearest side edge (the road shader makes the edge ragged with it).
function ribbon(pts, w, y, color, H = () => 0, solidEdge = false) {
  const n = pts.length, hw = w / 2, m = Math.max(1, Math.ceil(w / 4)), C = m + 1, pos = [], edge = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let nx = -tz, nz = tx, scale = 1;
    if (i > 0 && i < n - 1) { // miter
      let t1x = p[0] - a[0], t1z = p[1] - a[1]; const l1 = Math.hypot(t1x, t1z) || 1; t1x /= l1; t1z /= l1;
      const cos = (-t1z) * nx + t1x * nz; scale = Math.min(2.5, 1 / Math.max(0.3, cos));
    }
    for (let c = 0; c <= m; c++) {
      const f = 1 - 2 * c / m, px = p[0] + nx * hw * scale * f, pz = p[1] + nz * hw * scale * f;
      pos.push(px, y + H(px, pz, i), pz); edge.push(hw * (1 - Math.abs(f)));
    }
    if (i < n - 1) for (let c = 0; c < m; c++) { const k = i * C + c; idx.push(k, k + 1, k + C, k + 1, k + C + 1, k + C); }
  }
  // round caps at both ends cover joins between ways
  [pts[0], pts[n - 1]].forEach((p, e) => { const ii = e ? n - 1 : 0, base = pos.length / 3; pos.push(p[0], y + H(p[0], p[1], ii), p[1]); edge.push(hw); const seg = 12; for (let k = 0; k <= seg; k++) { const an = k / seg * Math.PI * 2, cx = p[0] + Math.cos(an) * hw, cz = p[1] + Math.sin(an) * hw; pos.push(cx, y - 0.002 + H(cx, cz, ii), cz); edge.push(0); if (k < seg) idx.push(base, base + 2 + k, base + 1 + k); } });
  const flat = [], fe = [];
  for (let t = 0; t < idx.length; t += 3) {
    let a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if ((pos[c * 3] - pos[a * 3]) * (pos[b * 3 + 2] - pos[a * 3 + 2]) - (pos[c * 3 + 2] - pos[a * 3 + 2]) * (pos[b * 3] - pos[a * 3]) < 0) { const q = b; b = c; c = q; } // face +Y
    for (const k of [a, b, c]) { flat.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); fe.push(edge[k]); }
  }
  const nv = flat.length / 3;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(upNormals(nv), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colorArr(color, nv), 3));
  g.setAttribute('edgeM', new THREE.Float32BufferAttribute(solidEdge ? fe.map(v => v + 5) : fe, 1)); // bridges keep a clean edge against the parapet
  return g;
}
// worn edges: road and path surfaces crumble away irregularly at their sides instead of ending in a ruler-straight line;
// the gravel shoulder under each road fades raggedly into the grass. (Same lighting, fog and shadows as before.)
const RAG_GLSL = `
float rgH(vec2 p) { p = mod(p, 997.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rgN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rgH(i), rgH(i + vec2(1.0, 0.0)), f.x), mix(rgH(i + vec2(0.0, 1.0)), rgH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
function raggedEdges(mat, rag, key, shoulder = false) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float edgeM; varying float vEdgeM; varying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdgeM = edgeM; vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEdgeM; varying vec3 vRW;' + RAG_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float rgn = ${shoulder ? 'rgN(vRW.xz * 0.42) * 0.55 + rgN(vRW.xz * 1.5) * 0.3 + rgN(vRW.xz * 4.0) * 0.15' : 'rgN(vRW.xz * 1.1) * 0.6 + rgN(vRW.xz * 3.7) * 0.4'};
  if (vEdgeM < ${rag.toFixed(2)} * rgn) discard;`)
      .replace('#include <color_fragment>', shoulder ? `#include <color_fragment>
  { float k = smoothstep(0.3, 2.0, vEdgeM); diffuseColor.rgb *= mix(vec3(1.08, 1.04, 0.95), vec3(0.72, 0.71, 0.7), k) * (0.88 + 0.24 * rgN(vRW.xz * 0.9)); }` : `#include <color_fragment>
  diffuseColor.rgb *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.5, vEdgeM)) * rgn;`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
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
