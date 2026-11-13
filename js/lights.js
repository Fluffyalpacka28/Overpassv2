import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Street lamps, traffic signals and stop / yield signs.
//  - Street lamps stand along lit roads (OSM street_lamp nodes where mapped, otherwise along roads in built-up areas).
//    Their lamps glow and cast a pool of light on the road from dusk until dawn, and are dull and dark by day.
//  - Traffic signals stand at every mapped signal, one head per approach, on the right-hand kerb. They cycle green -> yellow -> red
//    (with an all-red gap), and late at night (before 5am) switch to flashing yellow / flashing red like many real intersections.
//    NPC traffic stops at red signals.
// Everything is instanced (a few draw calls per tile) and shares one set of materials.

const TILE = 320, CELL = 24;
const CYCLE = 44, GREEN = 17, YELLOW = 3;           // seconds; the second axis runs half a cycle later, so there is always an all-red gap
const LAMP_SPACING = { primary: 30, secondary: 32, tertiary: 36, residential: 40, unclassified: 46, living_street: 30, primary_link: 36, secondary_link: 36 };
const ROAD_WIDTH = { primary: 11, secondary: 10, tertiary: 9, residential: 7.5, unclassified: 7, living_street: 6, primary_link: 7, secondary_link: 7 };
const MAX_LAMPS = 420;

const hash = n => { let h = Math.imul(n | 0, 374761393) ^ 0x68e31da4; h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

const COL = {
  on: { r: new THREE.Color('#ff2a20'), y: new THREE.Color('#ffc21a'), g: new THREE.Color('#27e05a') },
  off: { r: new THREE.Color('#3a0e0b'), y: new THREE.Color('#3a2e08'), g: new THREE.Color('#0a3016') },
  headDay: new THREE.Color('#7d8387'), headNight: new THREE.Color('#ffe6b3'),
};

let _S = null; // shared geometries + materials
function shared() {
  if (_S) return _S;
  const post = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.12, 7.6, 8).translate(0, 3.8, 0), new THREE.CylinderGeometry(0.2, 0.22, 0.5, 8).translate(0, 0.25, 0), new THREE.BoxGeometry(0.09, 0.09, 2.0).translate(0, 7.55, 1.0)]);
  const sigPost = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.08, 4.8, 8).translate(0, 2.4, 0), new THREE.BoxGeometry(0.36, 1.05, 0.3).translate(0, 4.25, 0.2), new THREE.BoxGeometry(0.62, 1.3, 0.04).translate(0, 4.25, 0.04)]);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _S = {
    post, sigPost,
    lampHead: new THREE.BoxGeometry(0.4, 0.13, 0.85).translate(0, 7.42, 1.9),
    pool: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    bulb: new THREE.SphereGeometry(0.105, 8, 6).scale(1, 1, 0.55),
    signPole: new THREE.CylinderGeometry(0.045, 0.06, 2.6, 6).translate(0, 1.3, 0), signBoard: new THREE.BoxGeometry(0.78, 0.78, 0.06).translate(0, 2.3, 0.03),
    postMat: new THREE.MeshStandardMaterial({ color: '#4d5258', roughness: 0.8 }),
    sigMat: new THREE.MeshStandardMaterial({ color: '#1b1e21', roughness: 0.6 }),
    headMat: new THREE.MeshBasicMaterial({ color: COL.headDay.clone() }),
    poolMat: new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    bulbMat: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    boardMat: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
  };
  return _S;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
function matrix(x, y, z, yaw, sc = 1) { _p.set(x, y, z); _q.setFromAxisAngle(_up, yaw); _s.set(sc, sc, sc); return _m.compose(_p, _q, _s); }
function instanced(geo, mat, mats, colors) {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length); mesh.frustumCulled = false; mesh.castShadow = false;
  for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
  if (colors) { for (let i = 0; i < colors.length; i++) mesh.setColorAt(i, colors[i]); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  mesh.instanceMatrix.needsUpdate = true; return mesh;
}

export class LightSystem {
  constructor(world) { this.world = world; this.tiles = new Map(); this.sigs = []; this.grid = null; this.time = Math.random() * CYCLE; this.flash = false; this.acc = 0; this.k = 0; }

  // nearest road to a point: its distance, the unit vector pointing at it and the road itself
  nearestRoad(x, z) {
    let best = null; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const s of (this.world.roadCells.get(i + ',' + j) || [])) {
      if (s.walk || s.type === 'track') continue;
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / l2)), px = s.x0 + dx * u, pz = s.z0 + dz * u, d = Math.hypot(px - x, pz - z);
      if (!best || d < best.d) best = { d, vx: (px - x) / (d || 1), vz: (pz - z) / (d || 1), seg: s };
    }
    return best;
  }

  addTile(t, { ways, pois }) {
    this.removeTile(t);
    const S = shared(), w = this.world, x0 = t.i * TILE, z0 = t.j * TILE, x1 = x0 + TILE, z1 = z0 + TILE, inTile = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const rec = { meshes: [], sigs: [] }, add = m => { w.group.add(m); rec.meshes.push(m); return m; };

    // ----- street lamps (always on the kerb — never on the carriageway) -----
    const lamps = []; // [x, z, yaw (the arm points toward the road)]
    const kerbOff = (x, z, preferYaw = null) => {
      const r = this.nearestRoad(x, z); if (!r) return preferYaw != null ? [x, z, preferYaw] : null;
      const hw = (r.seg && r.seg.hw) || 3.5, need = hw + 1.9; // stand just past the kerb
      let px = x, pz = z;
      if (r.d < need) { px = x - r.vx * (need - r.d); pz = z - r.vz * (need - r.d); }
      // still on a road (junction / dual carriageway)? skip rather than plant in traffic
      if (w.onRoad && w.onRoad(px, pz, 0.4)) return null;
      if (w.water.inside(px, pz)) return null;
      return [px, pz, Math.atan2(r.vx, r.vz)];
    };
    const osm = (ways.lamps || []).map(([la, lo]) => w.proj(la, lo)).filter(([x, z]) => inTile(x, z));
    for (const [x, z] of osm) { const p = kerbOff(x, z); if (p && inTile(p[0], p[1])) lamps.push(p); }
    const wellMapped = (ways.lamps || []).length >= 6;
    const builtUp = ways.filter(a => a.tags.building).length >= 8;
    if (!wellMapped) for (const wy of ways) {
      const tg = wy.tags, type = tg.highway, sp = LAMP_SPACING[type];
      if (!sp || tg.area === 'yes' || (tg.tunnel && tg.tunnel !== 'no') || (tg.bridge && tg.bridge !== 'no') || tg.lit === 'no' || !(tg.lit === 'yes' || builtUp) || !wy.geom || wy.geom.length < 2) continue;
      const pts = wy.geom.map(([la, lo]) => w.proj(la, lo)), off = (ROAD_WIDTH[type] || 7) / 2 + 2.2; let acc = hash(wy.id | 0) * sp, n = 0;
      for (let i = 0; i + 1 < pts.length && lamps.length < MAX_LAMPS; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
        while (acc < L) {
          const side = (n++ & 1) ? 1 : -1, x = ax + tx * acc + nx * side * off, z = az + tz * acc + nz * side * off;
          if (inTile(x, z) && lamps.length < MAX_LAMPS) {
            const p = kerbOff(x, z, Math.atan2(-nx * side, -nz * side));
            if (p && inTile(p[0], p[1])) lamps.push(p);
          }
          acc += sp;
        }
        acc -= L;
      }
    }
    if (lamps.length) {
      const base = lamps.map(([x, z, yaw]) => matrix(x, w.elev.at(x, z), z, yaw).clone());
      add(instanced(S.post, S.postMat, base)); add(instanced(S.lampHead, S.headMat, base));
      const pools = lamps.map(([x, z, yaw]) => matrix(x + Math.sin(yaw) * 1.9, w.elev.at(x, z) + 0.09, z + Math.cos(yaw) * 1.9, hash(x + z) * 6.28, 12).clone());
      rec.pool = add(instanced(S.pool, S.poolMat, pools)); rec.pool.visible = this.k > 0.02; rec.pool.renderOrder = 3;
    }

    // ----- traffic signals (nodes within 22 m of each other are one intersection) -----
    const nodes = (pois || []).filter(p => p.kind === 'traffic_light').map(p => [p.x, p.z]), groups = [];
    for (const n of nodes) { const g = groups.find(g => Math.hypot(g.x - n[0], g.z - n[1]) < 22); if (g) { g.x = (g.x * g.n + n[0]) / (g.n + 1); g.z = (g.z * g.n + n[1]) / (g.n + 1); g.n++; } else groups.push({ x: n[0], z: n[1], n: 1 }); }
    const sigPosts = [], sigBulbs = [], sigColors = [];
    for (const g of groups) {
      const aps = this.approaches(g.x, g.z); if (!aps.length) continue;
      const sig = { x: g.x, z: g.z, off: hash(Math.round(g.x * 3) + Math.round(g.z * 5) * 977) * CYCLE, stop: 5 + Math.max(...aps.map(a => a.hw)), ap: [] };
      const ref = aps.reduce((a, b) => (b.hw > a.hw ? b : a));
      for (const a of aps) {
        const axis = Math.abs(a.dx * ref.dx + a.dz * ref.dz) > 0.7 ? 0 : 1, rx = -a.dz, rz = a.dx;       // right-hand kerb of drivers arriving from this approach
        let px = g.x + a.dx * sig.stop + rx * (a.hw + 1.35), pz = g.z + a.dz * sig.stop + rz * (a.hw + 1.35);
        if (w.onRoad && w.onRoad(px, pz, 0.3)) { px += rx * 1.2; pz += rz * 1.2; }
        const py = w.elev.at(px, pz), yaw = Math.atan2(a.dx, a.dz);
        sigPosts.push(matrix(px, py, pz, yaw).clone());
        const base = sigBulbs.length;
        for (const ly of [4.55, 4.25, 3.95]) { sigBulbs.push(matrix(px + Math.sin(yaw) * 0.36, py + ly, pz + Math.cos(yaw) * 0.36, yaw).clone()); sigColors.push(COL.off.r.clone()); }
        sig.ap.push({ dx: a.dx, dz: a.dz, axis, base, st: '' });
      }
      rec.sigs.push(sig);
    }
    if (sigPosts.length) { add(instanced(S.sigPost, S.sigMat, sigPosts)); rec.bulbs = add(instanced(S.bulb, S.bulbMat, sigBulbs, sigColors)); }
    for (const s of rec.sigs) this.sigs.push(s); this.grid = null;

    // ----- stop / give way signs, beside the road -----
    const stops = [], yields = [];
    for (const p of (pois || [])) {
      if (p.kind !== 'road_sign' || !/stop|give_way/.test(p.sign || '')) continue;
      const r = this.nearestRoad(p.x, p.z); if (!r) continue;
      const sdx = r.seg.x1 - r.seg.x0, sdz = r.seg.z1 - r.seg.z0, l = Math.hypot(sdx, sdz) || 1, rx = sdz / l, rz = -sdx / l, hw = r.seg.hw || 3.5;
      // push fully onto the verge — never leave a sign in the lane
      let x = p.x + rx * (hw + 1.2 - r.d), z = p.z + rz * (hw + 1.2 - r.d);
      if (w.onRoad && w.onRoad(x, z, 0.35)) { x = p.x + rx * (hw + 2.2); z = p.z + rz * (hw + 2.2); }
      if (w.onRoad && w.onRoad(x, z, 0.25)) continue;
      const m = matrix(x, w.elev.at(x, z), z, Math.atan2(-sdx, -sdz)).clone();
      (/stop/.test(p.sign) ? stops : yields).push(m);
    }
    for (const [list, col] of [[stops, '#d92525'], [yields, '#f4f1e6']]) if (list.length) {
      add(instanced(S.signPole, S.postMat, list)); const cols = list.map(() => new THREE.Color(col)); add(instanced(S.signBoard, S.boardMat, list, cols));
    }
    this.tiles.set(t.key, rec); this.tick(true);
  }

  // roads that arrive at an intersection: unit vector pointing away from it along each road, plus the road's half width
  approaches(x, z) {
    const out = [], ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), seen = new Set();
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const s of (this.world.roadCells.get(i + ',' + j) || [])) {
      if (seen.has(s) || s.walk || s.type === 'track' || s.type === 'service') continue; seen.add(s);
      for (const [ex, ez, fx, fz] of [[s.x0, s.z0, s.x1, s.z1], [s.x1, s.z1, s.x0, s.z0]]) {
        if (Math.hypot(ex - x, ez - z) > 14) continue;
        const dx = fx - ex, dz = fz - ez, l = Math.hypot(dx, dz); if (l < 1) continue;
        const ux = dx / l, uz = dz / l; if (out.some(a => a.dx * ux + a.dz * uz > 0.94)) continue; // same road, already counted
        out.push({ dx: ux, dz: uz, hw: s.hw || 3.5 });
      }
    }
    if (!out.length) { const r = this.nearestRoad(x, z); if (r) { const s = r.seg, dx = s.x1 - s.x0, dz = s.z1 - s.z0, l = Math.hypot(dx, dz) || 1; out.push({ dx: dx / l, dz: dz / l, hw: s.hw || 3.5 }, { dx: -dx / l, dz: -dz / l, hw: s.hw || 3.5 }); } }
    return out.slice(0, 6);
  }

  removeTile(t) {
    const rec = this.tiles.get(t.key); if (!rec) return;
    for (const m of rec.meshes) { this.world.group.remove(m); m.dispose(); }
    if (rec.sigs.length) { const dead = new Set(rec.sigs); this.sigs = this.sigs.filter(s => !dead.has(s)); this.grid = null; }
    this.tiles.delete(t.key);
  }

  // k: 0 = day (lamps dull and dark), 1 = night (lamps glow, pools of light on the road)
  setNight(k) {
    this.k = k; const S = shared(); S.headMat.color.copy(COL.headDay).lerp(COL.headNight, k); S.poolMat.opacity = 0.62 * k;
    for (const r of this.tiles.values()) if (r.pool) r.pool.visible = k > 0.02;
  }
  update(dt, flash) { this.time += dt; this.flash = !!flash; this.acc += dt; if (this.acc >= 0.25) { this.acc = 0; this.tick(false); } }

  // 'g' green, 'y' yellow, 'r' red; flashing at night: axis 0 flashes yellow, the other red ('Y'/'R' lit, 'o' dark)
  stateOf(sig, axis) {
    if (this.flash) return (Math.floor(this.time * 1.2) & 1) ? 'o' : (axis === 0 ? 'Y' : 'R');
    const ph = (this.time + sig.off + axis * CYCLE / 2) % CYCLE; return ph < GREEN ? 'g' : ph < GREEN + YELLOW ? 'y' : 'r';
  }
  tick(force) {
    for (const rec of this.tiles.values()) {
      if (!rec.bulbs) continue; let changed = false;
      for (const sig of rec.sigs) for (const ap of sig.ap) {
        const st = this.stateOf(sig, ap.axis); if (st === ap.st && !force) continue; ap.st = st; changed = true;
        const r = st === 'r' || st === 'R', y = st === 'y' || st === 'Y', g = st === 'g';
        rec.bulbs.setColorAt(ap.base, r ? COL.on.r : COL.off.r); rec.bulbs.setColorAt(ap.base + 1, y ? COL.on.y : COL.off.y); rec.bulbs.setColorAt(ap.base + 2, g ? COL.on.g : COL.off.g);
      }
      if (changed) rec.bulbs.instanceColor.needsUpdate = true;
    }
  }

  // For a car at (x, z) heading (dx, dz): distance to the stop line of a red (or a yellow it can still stop for) signal ahead, else null
  signalStop(x, z, dx, dz, maxD, speed = 10) {
    if (this.flash || !this.sigs.length) return null;
    if (!this.grid) { this.grid = new Map(); for (const s of this.sigs) { const k = Math.floor(s.x / 64) + ',' + Math.floor(s.z / 64); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(s); } }
    const ci = Math.floor(x / 64), cj = Math.floor(z / 64); let best = null;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const s of (this.grid.get(i + ',' + j) || [])) {
      const rx = x - s.x, rz = z - s.z; if (rx * rx + rz * rz > (maxD + 20) * (maxD + 20)) continue;
      for (const a of s.ap) {
        if (-(a.dx * dx + a.dz * dz) < 0.8) continue;                           // not driving toward the intersection along this approach
        const along = rx * a.dx + rz * a.dz, lat = Math.abs(rx * a.dz - rz * a.dx); if (along < 0 || lat > 6) continue;
        const dist = along - s.stop; if (dist < -1.5 || dist > maxD) continue;
        const st = this.stateOf(s, a.axis); if (st === 'g') continue;
        if (st === 'y' && dist < speed * 1.1 + 3) continue;                     // too late to stop for a yellow: carry on
        if (!best || dist < best) best = Math.max(0, dist);
      }
    }
    return best;
  }
}
