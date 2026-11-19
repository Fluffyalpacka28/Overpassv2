import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Playgrounds and cemeteries from OpenStreetMap (World Drive).
//  - playgrounds (leisure=playground): a swing set, slide, seesaw, climbing frame, roundabout and sandpit laid out round the spot.
//    Where OSM maps the individual pieces (playground=swing / slide / ...), those go exactly where they're mapped instead.
//  - cemeteries (landuse=cemetery, amenity=grave_yard): rows of simple, low-poly headstones and crosses filling the ground.
// Low poly and merged: one mesh per tile for all the playground kit, three instanced meshes for every grave in a tile.

const C = { red: '#d8473b', blue: '#2f7fd1', yellow: '#f2c230', green: '#3fae5a', steel: '#8d959e', wood: '#a7774a', sand: '#e3cf98', rubber: '#2b2e33', chain: '#5e646b' };
const NI = g => g.index ? g.toNonIndexed() : g;
function paint(g, col) { g = NI(g); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const box = (w, h, d, x, y, z, col, ry = 0, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, col); };
const bar = (x0, y0, z0, x1, y1, z1, r, col, seg = 6) => { const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), L = v.length(), g = new THREE.CylinderGeometry(r, r, L, seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize())); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return paint(g, col); };

// each piece: parts in local space (x across, z along), footprint half-sizes for collisions, height
const PIECES = {
  swing: () => { const p = [], H = 2.6, L = 4.2, A = 0.9;
    for (const sx of [-L / 2, L / 2]) { p.push(bar(sx, 0, -A, sx, H, 0, 0.07, C.red), bar(sx, 0, A, sx, H, 0, 0.07, C.red)); }
    p.push(bar(-L / 2, H, 0, L / 2, H, 0, 0.08, C.red));
    for (const sx of [-1, 1]) { const x = sx * 0.95; p.push(bar(x - 0.22, H, 0, x - 0.22, 0.55, 0, 0.015, C.chain, 4), bar(x + 0.22, H, 0, x + 0.22, 0.55, 0, 0.015, C.chain, 4), box(0.55, 0.06, 0.22, x, 0.52, 0, sx < 0 ? C.blue : C.yellow)); }
    return { p, hx: L / 2 + 0.2, hz: A + 0.2, h: H }; },
  slide: () => { const p = [], H = 1.9;
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) p.push(bar(x, 0, z, x, H + 0.9, z, 0.06, C.blue));
    p.push(box(1.2, 0.08, 1.2, 0, H, 0, C.yellow));
    for (const sx of [-0.55, 0.55]) p.push(bar(sx, H + 0.55, -0.6, sx, H + 0.55, 0.6, 0.035, C.blue), bar(-0.6, H + 0.55, sx, 0.6, H + 0.55, sx, 0.035, C.blue));
    for (let k = 0; k < 6; k++) p.push(box(0.75, 0.05, 0.12, 0, k * 0.32 + 0.2, -0.85 - k * 0.07, C.steel));                  // ladder
    p.push(bar(-0.4, 0, -1.3, -0.4, H, -0.6, 0.04, C.steel), bar(0.4, 0, -1.3, 0.4, H, -0.6, 0.04, C.steel));
    const run = 3.4, ang = Math.atan2(H - 0.3, run); p.push(box(0.75, 0.06, Math.hypot(run, H - 0.3), 0, (H + 0.3) / 2, 0.6 + run / 2, C.yellow, 0, ang));
    for (const sx of [-0.4, 0.4]) p.push(box(0.06, 0.25, Math.hypot(run, H - 0.3), sx, (H + 0.3) / 2 + 0.12, 0.6 + run / 2, C.red, 0, ang));
    p.push(box(0.75, 0.06, 0.6, 0, 0.3, 0.6 + run + 0.3, C.yellow));
    return { p, hx: 0.8, hz: 2.8, oz: 1.0, h: H + 0.9 }; },
  seesaw: () => { const p = []; p.push(box(0.3, 0.45, 0.3, 0, 0.22, 0, C.steel), box(0.32, 0.07, 3.6, 0, 0.5, 0, C.green, 0, 0.12));
    for (const z of [-1.6, 1.6]) p.push(bar(-0.2, 0.5 + z * 0.12 + 0.05, z, -0.2, 0.75 + z * 0.12, z, 0.025, C.red), bar(0.2, 0.5 + z * 0.12 + 0.05, z, 0.2, 0.75 + z * 0.12, z, 0.025, C.red), bar(-0.2, 0.75 + z * 0.12, z, 0.2, 0.75 + z * 0.12, z, 0.025, C.red));
    return { p, hx: 0.4, hz: 1.9, h: 1 }; },
  climb: () => { const p = [], S = 2.4, H = 2.2, N = 4;
    for (let i = 0; i <= N; i++) { const a = -S / 2 + i * S / N; p.push(bar(a, 0, -S / 2, a, H, -S / 2, 0.035, C.green), bar(a, 0, S / 2, a, H, S / 2, 0.035, C.green), bar(-S / 2, 0, a, -S / 2, H, a, 0.035, C.green), bar(S / 2, 0, a, S / 2, H, a, 0.035, C.green));
      for (let k = 1; k <= 3; k++) { const y = k * H / 3; p.push(bar(-S / 2, y, a, S / 2, y, a, 0.03, C.red), bar(a, y, -S / 2, a, y, S / 2, 0.03, C.red)); } }
    return { p, hx: S / 2 + 0.1, hz: S / 2 + 0.1, h: H }; },
  roundabout: () => { const p = [], g = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 18); g.translate(0, 0.35, 0); p.push(paint(g, C.red), box(0.3, 0.3, 0.3, 0, 0.15, 0, C.steel));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, x = Math.cos(a) * 1.2, z = Math.sin(a) * 1.2; p.push(bar(x, 0.4, z, x * 0.25, 1.1, z * 0.25, 0.035, C.yellow)); }
    return { p, hx: 1.5, hz: 1.5, h: 1.1 }; },
  sandpit: () => { const p = [box(3.4, 0.25, 0.2, 0, 0.12, -1.6, C.wood), box(3.4, 0.25, 0.2, 0, 0.12, 1.6, C.wood), box(0.2, 0.25, 3.4, -1.6, 0.12, 0, C.wood), box(0.2, 0.25, 3.4, 1.6, 0.12, 0, C.wood), box(3.0, 0.12, 3.0, 0, 0.08, 0, C.sand)];
    return { p, hx: 1.7, hz: 1.7, h: 0.3, flat: true }; },
  bench: () => { const p = [box(1.8, 0.06, 0.45, 0, 0.45, 0, C.wood), box(1.8, 0.4, 0.06, 0, 0.72, -0.22, C.wood)]; for (const x of [-0.75, 0.75]) p.push(box(0.06, 0.45, 0.45, x, 0.22, 0, C.rubber)); return { p, hx: 0.9, hz: 0.3, h: 0.9, flat: true }; },
};
const KIND = { swing: 'swing', baby_swing: 'swing', basketswing: 'swing', slide: 'slide', seesaw: 'seesaw', springy: 'seesaw', climbingframe: 'climb', structure: 'climb', roundabout: 'roundabout', sandpit: 'sandpit', bench: 'bench' };
const MAT = { m: null };
const playMat = () => MAT.m || (MAT.m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));

// a whole playground's worth of pieces, laid out around (x, z) on clear ground
const LAYOUT = [['swing', 0, 0, 0], ['slide', 7, 1, Math.PI / 2], ['seesaw', -6.5, 2, 0], ['climb', 1, 6.5, 0.3], ['roundabout', -5, -5, 0], ['sandpit', 6, -5.5, 0], ['bench', 0, -6.5, 0], ['bench', -9, -1, Math.PI / 2]];
export function addPlaygrounds(world, t, list, tileBounds) {
  const parts = [], [tx0, tz0, tx1, tz1] = tileBounds, placed = [];
  const free = (x, z, r) => !world.onRoad(x, z, r + 1) && !world.collide(x, z, r) && !world.water.inside(x, z) && !placed.some(q => Math.hypot(q[0] - x, q[1] - z) < q[2] + r);
  const put = (kind, x, z, ry) => {
    const P = PIECES[kind](), r = Math.max(P.hx, P.hz) * 0.8; if (!free(x, z, r)) return false;
    const y = world.elev.at(x, z), c = Math.cos(ry), s = Math.sin(ry), m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    for (const g of P.p) { g.applyMatrix4(m); parts.push(g); }
    placed.push([x, z, r]);
    if (!P.flat) { const oz = P.oz || 0, hx = P.hx, hz = P.hz, poly = [[-hx, -hz + oz], [hx, -hz + oz], [hx, hz + oz], [-hx, hz + oz]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [a, b] of poly) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b); }
      world.addCell(world.bldCells, x0, z0, x1, z1, { poly, x0, x1, z0, z1, top: y + P.h, tile: t.key, play: true }, t); }
    return true;
  };
  // pieces mapped one by one in OSM
  const pieces = list.filter(p => p.kind !== 'playground' && KIND[p.kind]);
  for (const p of pieces) if (p.x >= tx0 && p.x < tx1 && p.z >= tz0 && p.z < tz1) put(KIND[p.kind], p.x, p.z, (Math.floor(p.x * 7 + p.z * 13) % 8) * Math.PI / 4);
  // whole playgrounds (unless their pieces are already mapped)
  for (const p of list) {
    if (p.kind !== 'playground' || p.x < tx0 || p.x >= tx1 || p.z < tz0 || p.z >= tz1) continue;
    if (pieces.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 45)) continue;
    const rot = ((Math.abs(Math.floor(p.x * 3 + p.z * 5)) % 360) * Math.PI) / 180, c = Math.cos(rot), s = Math.sin(rot);
    for (const [kind, lx, lz, ry] of LAYOUT) { const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c; put(kind, x, z, ry + rot) || put(kind, x + 3, z + 3, ry + rot); }
  }
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false); parts.forEach(x => x.dispose()); g.computeVertexNormals();
  const m = new THREE.Mesh(g, playMat()); m.castShadow = true; m.receiveShadow = true; return m;
}

// ---------- graves ----------
let GR = null;
function graveAssets() {
  if (GR) return GR;
  const round = (() => { const s = new THREE.Shape(); s.moveTo(-0.35, 0); s.lineTo(0.35, 0); s.lineTo(0.35, 0.6); s.absarc(0, 0.6, 0.35, 0, Math.PI, false); s.lineTo(-0.35, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -0.07); return g; })();
  const slab = new THREE.BoxGeometry(0.7, 0.75, 0.16); slab.translate(0, 0.375, 0);
  const cross = mergeGeometries([NI((() => { const g = new THREE.BoxGeometry(0.16, 1.15, 0.14); g.translate(0, 0.575, 0); return g; })()), NI((() => { const g = new THREE.BoxGeometry(0.62, 0.14, 0.14); g.translate(0, 0.82, 0); return g; })())]);
  const plot = new THREE.BoxGeometry(0.85, 0.12, 1.9); plot.translate(0, 0.06, 0.95);
  const stone = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), soil = new THREE.MeshStandardMaterial({ color: '#6f6a5c', roughness: 1 });
  return (GR = { round, slab, cross, plot, stone, soil });
}
const pip = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
// rows of headstones filling each cemetery, aligned with its longest side, only inside this tile
export function addGraves(world, t, polys, tileBounds, max = 2200) {
  const [tx0, tz0, tx1, tz1] = tileBounds, A = graveAssets(), spots = { round: [], slab: [], cross: [] };
  let n = 0;
  for (const poly of polys) {
    let best = 0, ang = 0; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; ang = Math.atan2(bx - ax, bz - az); } }
    const c = Math.cos(ang), s = Math.sin(ang);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 4, along = 1.9, across = 3.4;
    for (let v = -R; v <= R && n < max; v += across) for (let u = -R; u <= R && n < max; u += along) {
      if (Math.floor((v + R) / across) % 6 === 5) continue;                           // a path every few rows
      const x = cx + u * s + v * c, z = cz + u * c - v * s;
      if (x < tx0 || x >= tx1 || z < tz0 || z >= tz1 || !pip(x, z, poly)) continue;
      let edge = false; for (const [ox, oz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (!pip(x + ox, z + oz, poly)) { edge = true; break; } if (edge) continue;
      if (world.onRoad(x, z, 1.2) || world.collide(x, z, 0.8) || world.water.inside(x, z)) continue;
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1; if (h < 0.08) continue; // the odd empty plot
      const kind = h < 0.5 ? 'round' : h < 0.85 ? 'slab' : 'cross';
      spots[kind].push({ x, z, y: world.elev.at(x, z), ry: ang + (h - 0.5) * 0.12, tilt: (h * 7 % 1 - 0.5) * 0.12, s: 0.85 + (h * 13 % 1) * 0.35, v: h });
      n++;
    }
  }
  const out = [], o = new THREE.Object3D(), col = new THREE.Color();
  for (const k of ['round', 'slab', 'cross']) {
    const L = spots[k]; if (!L.length) continue;
    const m = new THREE.InstancedMesh(A[k], A.stone, L.length);
    L.forEach((p, i) => { o.position.set(p.x, p.y - 0.05, p.z); o.rotation.set(p.tilt, p.ry, p.tilt * 0.5); o.scale.setScalar(p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); const g = 0.55 + p.v * 0.35; col.setRGB(g, g * 0.98, g * 0.95); m.setColorAt(i, col); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.userData.sharedGeo = true; out.push(m);
  }
  // the low mound in front of each stone
  const all = [...spots.round, ...spots.slab, ...spots.cross];
  if (all.length) { const m = new THREE.InstancedMesh(A.plot, A.soil, all.length); all.forEach((p, i) => { o.position.set(p.x, p.y - 0.08, p.z); o.rotation.set(0, p.ry, 0); o.scale.setScalar(1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.instanceMatrix.needsUpdate = true; m.receiveShadow = true; m.userData.sharedGeo = true; out.push(m); }
  return out;
}
