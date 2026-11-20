import * as THREE from 'three';
import { WaterWake } from './spray.js';
import { crowdAtlas, CROWD_POSES } from './people.js';

// NPC boats cruising around lakes, rivers and the sea near the player. They wander inside the water (feeling ahead for the banks and
// turning away), bob on the surface, lean into turns, leave a wake and show navigation lights at night.
// Ram one and momentum decides what happens: a little runabout gets shoved, spun and rocked (or you hop right over it), a tug
// barely moves and you bounce off. Shoot them (or ram them hard) and they smoke, then blow up, burn and sink bow-first.
// world: needs water.inside(x,z), heightAt(x,z), onRoad(x,z,pad).
const TYPES = [
  { id: 'runabout', name: 'Runabout', len: 6.2, beam: 2.3, speed: [7, 13], w: 4, mass: 1.6, hp: 110, pts: 250 },
  { id: 'sail', name: 'Sailboat', len: 8.5, beam: 2.8, speed: [3, 5.5], w: 2, mass: 3.5, hp: 150, pts: 350 },
  { id: 'cabin', name: 'Cabin cruiser', len: 9.5, beam: 3.2, speed: [5, 8], w: 2, mass: 7, hp: 220, pts: 500 },
  { id: 'speed', name: 'Speedboat', len: 7.5, beam: 2.4, speed: [14, 21], w: 2, mass: 1.9, hp: 120, pts: 400 },
  { id: 'tug', name: 'Tugboat', len: 11, beam: 4, speed: [3, 5], w: 1, mass: 28, hp: 380, pts: 900 },
];
// the big one: a cruise liner slowly working its way across open water (the sea, big lakes); at most one around at a time
const CRUISE = { id: 'cruise', name: 'Cruise ship', len: 96, beam: 15, speed: [3.5, 5.5], w: 0, mass: 3000, hp: 4000, pts: 5000, ht: 26 };
const HULLS = ['#f4f4f2', '#ffffff', '#1f3a5f', '#b3261e', '#e8e2d0', '#0f5d5a', '#f2b632', '#222428'];
const ACCENT = ['#1f6fb2', '#c43b2f', '#0e8a6a', '#333333', '#d98e04', '#6b3fa0'];
const BOTTOM = ['#7a1f1f', '#1c2c4a', '#2b2b2b', '#16413d'];
const CAR_MASS = 1.4;
let rs = 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
const pick = a => a[(rnd() * a.length) | 0];

// Hull as plain triangles: V-shaped cross-sections from a flat transom to a raked, rising bow, with a sheer line and a deck.
// Faces are oriented outwards (from the hull's centre line), so it renders correctly with back-face culling. Local +z = bow.
export function hullTris(L, B, H) {
  const N = 14, sec = [], tris = [];
  for (let s = 0; s <= N; s++) {
    const t = s / N, z = -L / 2 + t * L, b = (B / 2) * (t < 0.38 ? 1 : Math.pow(Math.cos((t - 0.38) / 0.62 * Math.PI / 2), 0.85));
    const kh = t > 0.45 ? H * 0.85 * Math.pow((t - 0.45) / 0.55, 1.8) : 0, gy = H + (t > 0.65 ? 0.28 * Math.pow((t - 0.65) / 0.35, 2) : 0) - (t < 0.1 ? 0.05 : 0);
    sec.push({ z, b, gy, cy: (kh + gy) / 2, pts: [[-b, gy], [-b * 0.86, H * 0.42 + kh * 0.6], [0, kh], [b * 0.86, H * 0.42 + kh * 0.6], [b, gy]] });
  }
  const P = (sx, k) => { const S = sec[sx], q = S.pts[k]; return [q[0], q[1], S.z]; };
  const add = (pts, out) => { // fan, flipped if its normal doesn't point along 'out'
    const [a, b, c] = pts, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const P2 = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? pts.slice().reverse() : pts;
    for (let i = 1; i + 1 < P2.length; i++) tris.push(...P2[0], ...P2[i], ...P2[i + 1]);
  };
  for (let s = 0; s < N; s++) for (let k = 0; k < 4; k++) {
    const q = [P(s, k), P(s, k + 1), P(s + 1, k + 1), P(s + 1, k)], cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    if (Math.abs(q[2][0] - q[3][0]) < 1e-6 && Math.abs(q[2][1] - q[3][1]) < 1e-6) q.splice(3, 1); // the bow closes to a point
    add(q, [cx, cy - (sec[s].cy + sec[s + 1].cy) / 2, s === N - 1 ? 0.6 : 0]); // outward from this section's own middle
  }
  add([P(0, 0), P(0, 1), P(0, 2), P(0, 3), P(0, 4)], [0, 0, -1]); // transom
  for (let s = 0; s < N; s++) { const q = [P(s, 0), P(s, 4), P(s + 1, 4), P(s + 1, 0)]; if (sec[s + 1].b < 1e-6) q.splice(2, 1); add(q, [0, 1, 0]); } // deck
  return tris;
}
function hullGeo(L, B, H, top, bottom, stripe) {
  const g = new THREE.BufferGeometry(), P = hullTris(L, B, H); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom), cs = new THREE.Color(stripe), C = new Float32Array(P.length), wl = 0.42; // waterline (hull is lowered 0.45 into the water)
  // each triangle takes the colour of its own middle height, so the bands come out crisp
  for (let i = 0; i < P.length; i += 9) { const y = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, c = y < wl ? cb : y < wl + 0.12 ? cs : ct; for (let k = 0; k < 9; k += 3) { C[i + k] = c.r; C[i + k + 1] = c.g; C[i + k + 2] = c.b; } }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g;
}
// show one cell of the crowd atlas (design d, pose p) on a person's sprite
function setPose(P, pose) {
  if (P.pose === pose) return; P.pose = pose; const A = P.atlas, k = P.design * CROWD_POSES + pose;
  P.map.offset.set((k % A.cols) / A.cols, 1 - (Math.floor(k / A.cols) + 1) / A.rows);
}
function buildBoat(t) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const big = t.id === 'cruise', hullC = big ? '#f7f7f4' : pick(HULLS), acc = big ? pick(['#1f3a7a', '#b3261e', '#0e6a8a']) : pick(ACCENT), L = t.len, B = t.beam, H = t.id === 'tug' ? 1.6 : big ? 11 : 1.1, hullY = big ? -4.2 : -0.45, top = H + hullY + (big ? 0 : 0.02);
  const mats = [], M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.05, ...o }); mats.push(m); return m; };
  const hullM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 }); mats.push(hullM);
  const hull = new THREE.Mesh(hullGeo(L, B, H, hullC, t.id === 'tug' ? '#5a1414' : big ? '#7a1f1f' : pick(BOTTOM), acc), hullM); hull.position.y = hullY; hull.castShadow = true; body.add(hull);
  const teak = M('#b08458', { roughness: 0.75 }), white = M('#f2f2ef', { roughness: 0.4 }), chrome = M('#d8dde2', { metalness: 0.95, roughness: 0.18 }), dark = M('#25282d', { roughness: 0.6 }), cushion = M(pick(['#eae3d2', '#d8d2c2', '#2f3a4a', '#8a2b26']), { roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2a3a48', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, clearcoat: 1 }); mats.push(glass);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(B * 0.84, 0.06, L * 0.66), t.id === 'tug' ? M('#6a6a66', { roughness: 0.9 }) : teak); deck.position.set(0, top, -L * 0.08); body.add(deck);
  const box = (w, h, d, m, x, y, z, p = body) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const cyl = (r1, r2, h, m, x, y, z, rx = 0, rz = 0, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; body.add(o); return o; };
  // rub rail along the gunwale on both sides, and a chrome bow rail on the smaller boats
  const sheer = sd => { const pts = []; for (let k = 0; k <= 12; k++) { const tt = k / 12, z = -L / 2 + tt * L * 0.97, b = (B / 2) * (tt < 0.38 ? 1 : Math.pow(Math.cos((tt - 0.38) / 0.62 * Math.PI / 2), 0.85)), y = H + (tt > 0.65 ? 0.28 * Math.pow((tt - 0.65) / 0.35, 2) : 0) + hullY; pts.push(new THREE.Vector3(sd * (b + 0.02), y - 0.04, z)); } return new THREE.CatmullRomCurve3(pts); };
  try { for (const sd of [-1, 1]) { const rr = new THREE.Mesh(new THREE.TubeGeometry(sheer(sd), 24, 0.05, 5), t.id === 'tug' ? dark : M(acc)); body.add(rr); } } catch { }
  // people: the same 2D billboard people as the grandstand crowds, sitting at the helm or hanging out on deck (feet on the deck)
  const people = [];
  const person = (x, z, seated, y = top) => {
    let atlas = null; try { atlas = crowdAtlas(); } catch { return; }
    const design = (rnd() * atlas.designs.length) | 0, map = atlas.tex.clone(); map.repeat.set(1 / atlas.cols, 1 / atlas.rows); map.needsUpdate = true;
    const m = new THREE.SpriteMaterial({ map, alphaTest: 0.5, transparent: false, fog: true }); mats.push(m); mats.push({ dispose: () => map.dispose() });
    const sp = new THREE.Sprite(m), H = 2.14; sp.center.set(0.5, 0.06); sp.scale.set(H, H, 1); sp.position.set(x, y + 0.02, z); body.add(sp);
    const P = { sp, map, atlas, design, seated, pose: -1, base: seated ? (rnd() < 0.5 ? 3 : 4) : 0, ph: rnd() * 10 };
    setPose(P, P.base); people.push(P);
  };
  if (t.id === 'runabout' || t.id === 'speed') {
    const sp = t.id === 'speed';
    const ws = box(B * 0.74, sp ? 0.32 : 0.45, 0.04, glass, 0, top + 0.27, L * 0.06); ws.rotation.x = sp ? -0.75 : -0.5;
    box(B * 0.78, 0.04, 0.05, chrome, 0, top + (sp ? 0.38 : 0.46), L * 0.06 - 0.12);
    box(0.7, 0.55, 0.5, white, B * 0.18, top + 0.27, L * 0.02); box(0.32, 0.05, 0.32, dark, B * 0.18, top + 0.57, L * 0.02 - 0.05); // helm console + wheel area
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), dark); wheel.position.set(B * 0.18, top + 0.68, L * 0.02 - 0.22); wheel.rotation.x = -0.6; body.add(wheel);
    for (const x of [-B * 0.2, B * 0.2]) { box(0.6, 0.3, 0.6, cushion, x, top + 0.18, -L * 0.12); box(0.6, 0.45, 0.14, cushion, x, top + 0.45, -L * 0.12 - 0.26); }
    box(B * 0.78, 0.35, 0.7, cushion, 0, top + 0.18, -L * 0.36); // rear bench
    // outboard(s): cowling, leg, skeg and prop
    for (const x of sp ? [-0.45, 0.45] : [0]) {
      const cw = box(0.5, 0.62, 0.62, M(sp ? '#111' : '#e9e9e9', { roughness: 0.3 }), x, top + 0.35, -L / 2 - 0.25); cw.scale.set(1, 1, 1);
      box(0.52, 0.12, 0.64, M(acc), x, top + 0.12, -L / 2 - 0.25);
      box(0.16, 1.0, 0.22, dark, x, top - 0.45, -L / 2 - 0.3); box(0.06, 0.3, 0.3, dark, x, top - 1.0, -L / 2 - 0.28);
    }
    if (!sp) { // bow rail
      try { const pts = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * B * 0.36, top + 0.38, L * 0.28 + Math.sin(a) * L * 0.15)); } const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 5), chrome); body.add(rail); for (const k of [0, 4, 8]) { const p = pts[k]; cyl(0.02, 0.02, 0.38, chrome, p.x, top + 0.19, p.z); } } catch { }
    } else { box(0.1, 0.02, L * 0.5, M(acc), -B * 0.3, top + 0.04, L * 0.1); box(0.1, 0.02, L * 0.5, M(acc), B * 0.3, top + 0.04, L * 0.1); } // racing stripes
    person(B * 0.18, -L * 0.1 + 0.05, true); if (rnd() < 0.7) person(-B * 0.2, -L * 0.1 + 0.05, true); if (rnd() < 0.5) person(B * (rnd() - 0.5) * 0.5, -L * 0.36, rnd() < 0.5);
  } else if (big) {
    // six white decks stepping back, each with a dark band of windows; bridge up front, lifeboats down the sides, raked funnel aft,
    // a pool and a twisty yellow water slide on top
    const lvl = 2.6, glassD = M('#1b2a3c', { roughness: 0.15, metalness: 0.4 }), orange = M('#ff7a1a', { roughness: 0.5 });
    let y = top;
    for (let i = 0; i < 7; i++) {
      const zF = L * 0.27 - i * 1.7, zB = -L * 0.43 + i * 0.9, len = zF - zB, w = B * (0.97 - i * 0.012), zc = (zF + zB) / 2;
      box(w, lvl, len, white, 0, y + lvl / 2, zc);
      box(w + 0.08, 0.95, len * 0.97, glassD, 0, y + lvl * 0.55, zc);
      if (i % 2 === 0) box(w + 0.12, 0.12, len * 0.98, M(acc), 0, y + 0.06, zc);
      if (i === 6) { box(B * 1.02, 1.6, 2.4, white, 0, y + lvl * 0.5, zc + len / 2 - 1.2); box(B * 1.03, 0.8, 2.45, glassD, 0, y + lvl * 0.62, zc + len / 2 - 1.2); }
      y += lvl;
    }
    for (const sd of [-1, 1]) for (let k = 0; k < 26; k++) box(0.1, 0.55, 1.6, glassD, sd * (B / 2 + 0.02), top - 2.2, -L * 0.47 + k * 1.9);
    const deckTop = y;
    box(B * 0.4, 0.4, L * 0.1, M('#3fb7e8', { roughness: 0.1, metalness: 0.1 }), 0, deckTop + 0.15, -L * 0.02);       // pool
    box(B * 0.44, 0.3, L * 0.115, M('#e9e2cf'), 0, deckTop + 0.05, -L * 0.02);
    try { const pts = []; for (let k = 0; k <= 30; k++) { const a = k / 30 * Math.PI * 3.2; pts.push(new THREE.Vector3(B * 0.18 * Math.cos(a), deckTop + 7 - k / 30 * 6.6, -L * 0.13 + B * 0.18 * Math.sin(a))); }
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.55, 8), M('#ffd02a', { roughness: 0.35 }))); cyl(0.3, 0.3, 7.2, white, B * 0.18, deckTop + 3.6, -L * 0.13); } catch { }
    const fun = cyl(2.6, 3.0, 8, M(acc), 0, deckTop + 4, -L * 0.25); fun.rotation.x = -0.16; fun.scale.set(0.75, 1, 1.25);
    const cap = cyl(2.62, 2.62, 1.4, dark, 0, deckTop + 8.2, -L * 0.25 - 0.65); cap.rotation.x = -0.16; cap.scale.set(0.75, 1, 1.25);
    cyl(0.18, 0.18, 6, chrome, 0, deckTop + 3, L * 0.1); box(3.2, 0.25, 0.5, dark, 0, deckTop + 5.6, L * 0.1);       // radar mast
    for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { const z = -L * 0.3 + k * L * 0.075; const lb = box(1.9, 1.5, 6.2, orange, sd * (B * 0.5 + 0.9), top + lvl * 1.5, z); box(2.0, 0.25, 6.3, white, sd * (B * 0.5 + 0.9), top + lvl * 1.5 + 0.85, z); lb.castShadow = false; }
    for (let k = 0; k < 7; k++) person((rnd() - 0.5) * B * 0.7, -L * 0.08 + (rnd() - 0.5) * L * 0.18, rnd() < 0.3, deckTop + 0.1);
    for (let k = 0; k < 3; k++) person((rnd() < 0.5 ? -1 : 1) * B * 0.42, L * 0.22 + k * 3, false, top);
    g.userData.deckTop = deckTop;
  } else if (t.id === 'cabin') {
    box(B * 0.74, 1.05, L * 0.4, white, 0, top + 0.52, L * 0.02);                                   // cabin
    box(B * 0.76, 0.32, L * 0.36, glass, 0, top + 0.72, L * 0.03);                                   // window band
    box(B * 0.5, 0.36, 0.05, glass, 0, top + 0.75, L * 0.22 + 0.02).rotation.x = -0.35;             // windscreen
    box(B * 0.66, 0.08, L * 0.34, M(acc), 0, top + 1.09, 0);                                         // roof trim
    box(B * 0.6, 0.6, L * 0.2, white, 0, top + 1.4, -L * 0.05);                                      // flybridge
    for (const sd of [-1, 1]) { box(0.03, 0.5, L * 0.2, chrome, sd * B * 0.3, top + 1.95, -L * 0.05); }
    box(B * 0.6, 0.03, L * 0.2, chrome, 0, top + 2.2, -L * 0.05);
    cyl(0.025, 0.025, 1.3, chrome, 0, top + 2.6, -L * 0.1);                                          // antenna mast
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 18), M('#f04a2a')); ring.position.set(B * 0.375, top + 0.6, -L * 0.1); ring.rotation.y = Math.PI / 2; body.add(ring);
    box(B * 0.8, 0.4, 0.6, cushion, 0, top + 0.2, -L * 0.35);
    try { for (const sd of [-1, 1]) { const pts = [new THREE.Vector3(sd * B * 0.4, top + 0.45, -L * 0.42), new THREE.Vector3(sd * B * 0.42, top + 0.45, -L * 0.25), new THREE.Vector3(sd * B * 0.38, top + 0.45, L * 0.25), new THREE.Vector3(sd * B * 0.1, top + 0.55, L * 0.46)]; body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 5), chrome)); } } catch { }
    person(0, -L * 0.05, true, top + 1.7); person(-B * 0.2, -L * 0.36, false); if (rnd() < 0.6) person(B * 0.22, -L * 0.33, rnd() < 0.5); if (rnd() < 0.4) person(0, L * 0.34, true, top + 0.4); // helm up top, friends on the back deck and the bow
  } else if (t.id === 'tug') {
    person(B * 0.25, -L * 0.3, false); person(0, L * 0.1, false, top + 1.5); // a deckhand, and the skipper in the wheelhouse
    box(B * 0.66, 1.5, L * 0.3, M('#e9e4d6'), 0, top + 0.75, L * 0.06);                              // deckhouse
    box(B * 0.6, 0.9, L * 0.2, M('#e9e4d6'), 0, top + 1.95, L * 0.1);                                // wheelhouse
    box(B * 0.62, 0.38, L * 0.21, glass, 0, top + 2.05, L * 0.1);
    box(B * 0.72, 0.08, L * 0.24, dark, 0, top + 2.45, L * 0.1);
    cyl(0.32, 0.38, 1.4, M('#1d1d1d'), 0, top + 2.1, -L * 0.1); cyl(0.33, 0.33, 0.3, M(acc), 0, top + 2.5, -L * 0.1); // funnel with a band
    cyl(0.04, 0.04, 1.6, dark, 0, top + 3.2, L * 0.12);                                              // mast
    for (const z of [-L * 0.3, -L * 0.38]) cyl(0.12, 0.14, 0.35, dark, 0, top + 0.18, z);            // towing bitts
    const tyre = new THREE.TorusGeometry(0.28, 0.12, 8, 14);                                          // old tyres as fenders
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) { const ty = new THREE.Mesh(tyre, M('#1a1a1a', { roughness: 0.95 })); ty.position.set(sd * (B * 0.5 + 0.08), top - 0.35, -L * 0.3 + k * L * 0.15); ty.rotation.y = Math.PI / 2; body.add(ty); }
    const bowF = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 8, 14), M('#1a1a1a', { roughness: 0.95 })); bowF.position.set(0, top - 0.1, L / 2 - 0.1); body.add(bowF);
  } else if (t.id === 'sail') {
    cyl(0.07, 0.09, 9, M('#d8d8d8', { metalness: 0.7, roughness: 0.3 }), 0, top + 4.5, L * 0.1);
    const boom = cyl(0.06, 0.06, L * 0.45, M('#d8d8d8', { metalness: 0.7, roughness: 0.3 }), 0, top + 1.3, -L * 0.12, Math.PI / 2);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 7.6); sh.quadraticCurveTo(L * 0.2, 3.5, L * 0.44, 0); sh.closePath(); // after the 90-degree turn +x points aft along the boom (a slightly roached leech)
    const sailM = new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.8, side: THREE.DoubleSide }); mats.push(sailM);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), sailM); sail.rotation.y = Math.PI / 2; sail.position.set(0, top + 1.35, L * 0.1); body.add(sail);
    const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(0, 6.4); jib.lineTo(-L * 0.36, 0); jib.closePath();
    const j = new THREE.Mesh(new THREE.ShapeGeometry(jib), sailM); j.rotation.y = Math.PI / 2; j.position.set(0, top + 0.6, L * 0.12); body.add(j);
    // stays and shrouds
    const line = (a, b) => { const gg = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(gg, new THREE.LineBasicMaterial({ color: '#555' })); body.add(l); };
    const mt = new THREE.Vector3(0, top + 9, L * 0.1); line(mt, new THREE.Vector3(0, top, L * 0.48)); line(mt, new THREE.Vector3(0, top, -L * 0.48)); line(mt, new THREE.Vector3(-B * 0.45, top, L * 0.08)); line(mt, new THREE.Vector3(B * 0.45, top, L * 0.08));
    box(B * 0.6, 0.35, L * 0.25, white, 0, top + 0.18, L * 0.12);                                    // coachroof
    box(B * 0.62, 0.1, L * 0.2, glass, 0, top + 0.3, L * 0.12);
    const tiller = box(0.05, 0.05, 1.0, teak, 0, top + 0.45, -L * 0.4); tiller.rotation.x = 0.2;
    person(-B * 0.2, -L * 0.3, true); if (rnd() < 0.6) person(B * 0.15, L * 0.3, false, top + 0.05);
    g.userData.sail = [sail, j, boom];
  }
  // navigation lights: red port, green starboard, white stern / masthead (only lit at night)
  const lamp = c => { const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); mats.push(m); return new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), m); };
  const red = lamp('#ff2a2a'), green = lamp('#2aff6a'), whiteL = lamp('#fff6d8');
  red.position.set(-B * 0.46, top + 0.1, L * 0.22); green.position.set(B * 0.46, top + 0.1, L * 0.22); whiteL.position.set(0, t.id === 'sail' ? top + 9 : big ? (g.userData.deckTop || top) + 6.2 : top + (t.id === 'tug' ? 4 : t.id === 'cabin' ? 3.25 : 1.3), big ? L * 0.1 : -L * 0.3); if (big) for (const l of [red, green, whiteL]) l.scale.setScalar(4);
  body.add(red, green, whiteL); g.userData.navs = [red, green, whiteL];
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.mats = mats; g.userData.body = body; g.userData.people = people;
  return g;
}

export class Boats {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = []; this.t = 0; this.spawnT = 0; this.max = 6; this.night = 0;
    this.fx = {}; // set by the game: smoke(x,y,z,dark), boom(x,y,z,size), splash(x,z,wy,k), onSink(boat, pts)
    rs = (Date.now() % 1000000) + 3;
  }
  setQuality(q) { this.max = q === 'low' ? 3 : 7; }
  setNight(k) { this.night = k; }
  setLight(c) { this.light = c; }
  wet(x, z) { const w = this.world; return w.water.inside(x, z) && !w.onRoad(x, z, 3); }
  // enough open water around a point for a boat
  roomy(x, z, r) { if (!this.wet(x, z)) return false; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (!this.wet(x + Math.cos(t) * r, z + Math.sin(t) * r)) return false; } return true; }
  spawn(px, pz) {
    for (let tries = 0; tries < 24; tries++) {
      const a = rnd() * Math.PI * 2, d = 90 + rnd() * 520, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!this.roomy(x, z, 14) || this.list.some(b => Math.hypot(b.x - x, b.z - z) < 40)) continue;
      let tot = 0; for (const T of TYPES) tot += T.w; let r = rnd() * tot, type = TYPES[0]; for (const T of TYPES) { r -= T.w; if (r <= 0) { type = T; break; } }
      if (type.len > 9 && !this.roomy(x, z, 26)) type = TYPES[0];
      const mesh = buildBoat(type); this.scene.add(mesh);
      const b = { type, mesh, x, z, yaw: rnd() * 6.283, sp: 0, want: type.speed[0] + rnd() * (type.speed[1] - type.speed[0]), turn: 0, ph: rnd() * 6, idle: 0, roll: 0, vx: 0, vz: 0, speed: 0,
        hp: type.hp, pvx: 0, pvz: 0, spin: 0, rr: 0, rrv: 0, rp: 0, rpv: 0, smokeT: 0, sink: null, scared: 0,
        wake: new WaterWake(this.scene, { back: type.len * 0.45, half: type.beam * 0.45, life: 6 }) };
      // face along open water
      let best = b.yaw, bs = -1; for (let k = 0; k < 8; k++) { const h = k * Math.PI / 4; let s = 0; for (const dd of [20, 40, 70]) if (this.wet(x + Math.sin(h) * dd, z + Math.cos(h) * dd)) s++; if (s > bs) { bs = s; best = h; } }
      b.yaw = best; this.list.push(b); return;
    }
  }
  spawnCruise(px, pz) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rnd() * Math.PI * 2, d = 260 + rnd() * 560, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!this.roomy(x, z, 75) || this.list.some(b => Math.hypot(b.x - x, b.z - z) < 120)) continue;
      let best = 0, bs = -1; for (let k = 0; k < 12; k++) { const h = k * Math.PI / 6; let sc = 0; for (const dd of [60, 120, 200, 300]) if (this.wet(x + Math.sin(h) * dd, z + Math.cos(h) * dd)) sc++; if (sc > bs) { bs = sc; best = h; } }
      if (bs < 3) continue; // not enough open water to sail anywhere
      const type = CRUISE, mesh = buildBoat(type); this.scene.add(mesh);
      this.list.push({ type, mesh, x, z, yaw: best, sp: 0, want: type.speed[0] + rnd() * (type.speed[1] - type.speed[0]), turn: 0, ph: rnd() * 6, idle: 0, roll: 0, vx: 0, vz: 0, speed: 0,
        hp: type.hp, pvx: 0, pvz: 0, spin: 0, rr: 0, rrv: 0, rp: 0, rpv: 0, smokeT: 0, sink: null, scared: 0,
        wake: new WaterWake(this.scene, { back: type.len * 0.45, half: type.beam * 0.45, life: 9 }) });
      return true;
    }
    return false;
  }
  // (sprites share one geometry, so theirs is left alone)
  remove(b) { this.scene.remove(b.mesh); b.mesh.traverse(o => { if (o.geometry && !o.isSprite) o.geometry.dispose(); }); for (const m of b.mesh.userData.mats || []) m.dispose(); b.wake.dispose(); }
  clear() { for (const b of this.list) this.remove(b); this.list = []; }
  // shootable spots: bow, middle and stern of each boat still afloat
  targets() {
    const out = [];
    for (const b of this.list) {
      if (b.sink) continue; const big = b.type === CRUISE, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), y = (b.wy ?? 0) + (big ? 6 : 0.1), r = b.type.beam * (big ? 0.55 : 0.62);
      for (const k of big ? [-0.4, -0.27, -0.13, 0, 0.13, 0.27, 0.4] : [-0.3, 0, 0.3]) out.push({ id: '', npc: 'boat', ref: b, x: b.x + fx * b.type.len * k, y, z: b.z + fz * b.type.len * k, r });
    }
    return out;
  }
  // damage (from guns or a hard ram); returns points when it sinks
  hit(b, dmg, by) {
    if (!b || b.sink) return 0;
    const now = performance.now(); if (by && b.lastBy === by && now - b.lastHit < 30) return 0; // one rocket splash counts once per boat
    b.lastBy = by; b.lastHit = now; b.hp -= dmg; b.scared = 6; b.flash = 0.12;
    if (b.hp > 0) return 0;
    // boom: it blows up, burns and goes down
    b.sink = { t: 0, roll: (rnd() - 0.5) * 0.5, bow: rnd() < 0.6 ? 1 : -1 };
    const wy = b.wy ?? this.world.heightAt(b.x, b.z);
    this.fx.boom && this.fx.boom(b.x, wy + 1.2, b.z, Math.min(12, 3 + b.type.len * 0.4));
    this.fx.splash && this.fx.splash(b.x, b.z, wy, 1);
    for (const m of b.mesh.userData.mats || []) if (m.color && !m.isMeshBasicMaterial) { m.color.multiplyScalar(0.28); if (m.vertexColors) m.vertexColors = true; }
    for (const n of b.mesh.userData.navs) n.visible = false;
    if (b.mesh.userData.sail) for (const sl of b.mesh.userData.sail.slice(0, 2)) sl.visible = false; // the sails burn away
    const pts = b.type.pts; this.fx.onSink && this.fx.onSink(b, pts); return pts;
  }
  // a car (with vx/vz) hit this boat; n = unit normal from the boat towards the car, (cx, cz) = contact point.
  // Momentum is shared by mass; returns the car's change of speed (m/s)
  ram(b, car, nx, nz, cx, cz) {
    const bvx = b.vx + b.pvx, bvz = b.vz + b.pvz, vrel = ((car.vx || 0) - bvx) * nx + ((car.vz || 0) - bvz) * nz;
    if (vrel >= 0) return 0;
    const mb = b.sink ? b.type.mass * 3 : b.type.mass, e = 0.3, J = -(1 + e) * vrel / (1 / CAR_MASS + 1 / mb);
    car.vx += J / CAR_MASS * nx; car.vz += J / CAR_MASS * nz;
    const ix = -J * nx, iz = -J * nz; b.pvx += ix / mb; b.pvz += iz / mb;
    // spin from where it was hit, and a rock (roll from side hits, pitch from bow / stern hits)
    const rx = cx - b.x, rz = cz - b.z, I = mb * (b.type.len * b.type.len) / 12;
    b.spin += Math.max(-1.6, Math.min(1.6, (rz * ix - rx * iz) / I * 0.8));
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), lat = ix * fz - iz * fx, lon = ix * fx + iz * fz;
    b.rrv += Math.max(-2.5, Math.min(2.5, -lat / mb * 0.22)); b.rpv += Math.max(-1.5, Math.min(1.5, lon / mb * 0.1));
    b.sp *= Math.max(0.2, 1 - J / mb * 0.08); b.scared = 6;
    const dv = J / CAR_MASS;
    this.fx.splash && this.fx.splash(cx, cz, b.wy ?? 0, Math.min(1, dv / 14));
    if (dv > 6) this.hit(b, (dv - 6) * 6 * (2 / Math.sqrt(mb)), 'ram');
    return dv;
  }
  update(dt, px, pz, on) {
    if (!on) { if (this.list.length) this.clear(); return; }
    this.px = px; this.pz = pz;
    this.t += dt; this.spawnT -= dt;
    for (let i = this.list.length - 1; i >= 0; i--) { const b = this.list[i]; if (Math.hypot(b.x - px, b.z - pz) > (b.type === CRUISE ? 1500 : 1000) || !this.world.water.inside(b.x, b.z) || (b.sink && b.sink.t > 14)) { this.remove(b); this.list.splice(i, 1); } }
    if (this.spawnT <= 0 && this.list.filter(b => !b.sink && b.type !== CRUISE).length < this.max) { this.spawnT = 1.2; this.spawn(px, pz); }
    if ((this.cruiseT = (this.cruiseT || 0) - dt) <= 0) { this.cruiseT = 4; if (!this.list.some(b => b.type === CRUISE)) this.spawnCruise(px, pz); }
    for (const b of this.list) this.step(b, dt);
  }
  step(b, dt) {
    const T = b.type, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), tt = this.t + b.ph;
    const wy = b.wy = this.world.heightAt(b.x, b.z) - 0.25;
    // pushes and spins from collisions fade away in the water
    const pd = Math.exp(-dt * 0.7); b.pvx *= pd; b.pvz *= pd; b.spin *= Math.exp(-dt * 1.4);
    { const nx = b.x + b.pvx * dt, nz = b.z + b.pvz * dt; if (this.wet(nx, nz)) { b.x = nx; b.z = nz; } else { b.pvx *= -0.3; b.pvz *= -0.3; } }
    b.yaw += b.spin * dt;
    // rocking springs (roll and pitch)
    b.rrv += (-b.rr * 9 - b.rrv * 1.6) * dt; b.rr += b.rrv * dt; b.rpv += (-b.rp * 12 - b.rpv * 2.2) * dt; b.rp += b.rpv * dt;
    if (b.sink) { // going down: settles bow- or stern-first, rolls, burns, bubbles
      const S = b.sink; S.t += dt; const k = Math.min(1, S.t / 9), drop = 0.15 + Math.pow(S.t / 9, 1.6) * (T.len * 0.5 + 2);
      b.sp *= Math.exp(-dt * 1.5); b.x += Math.sin(b.yaw) * b.sp * dt; b.z += Math.cos(b.yaw) * b.sp * dt;
      b.mesh.position.set(b.x, wy - drop + 0.04 * Math.sin(tt * 1.7), b.z);
      b.mesh.rotation.set(-S.bow * (0.08 + 0.55 * k) + b.rp, b.yaw, S.roll * k * 2 + b.rr, 'YXZ');
      if ((b.smokeT -= dt) <= 0) { b.smokeT = S.t < 5 ? 0.07 : 0.18; this.fx.smoke && this.fx.smoke(b.x + (rnd() - 0.5) * T.beam, wy + Math.max(0.3, 1.6 - drop * 0.5), b.z + (rnd() - 0.5) * T.len * 0.5, true); }
      if (rnd() < dt * 3 && this.fx.splash) this.fx.splash(b.x + (rnd() - 0.5) * T.beam, b.z + (rnd() - 0.5) * T.len * 0.6, wy, 0.15);
      this.crew(b, tt); b.vx = b.vz = b.speed = 0; return;
    }
    // feel ahead for the bank; steer to whichever side has more water
    const look = Math.max(18 + b.sp * 2.2, T.len * 1.2), bowD = T.len * 0.45;
    const ahead = this.wet(b.x + fx * look, b.z + fz * look) && this.wet(b.x + fx * look * 0.5, b.z + fz * look * 0.5) && this.wet(b.x + fx * bowD, b.z + fz * bowD);
    let steer = 0;
    if (!ahead) {
      const sc = Math.max(1, T.len / 20), score = h => { let s = 0; for (const d of [10, 22, 40]) if (this.wet(b.x + Math.sin(h) * d * sc, b.z + Math.cos(h) * d * sc)) s++; return s; };
      const l = score(b.yaw - 0.7) + score(b.yaw - 1.4) * 0.5, r = score(b.yaw + 0.7) + score(b.yaw + 1.4) * 0.5;
      steer = (r >= l ? 1 : -1) * 1.0;
    } else {
      b.turn += (rnd() - 0.5) * dt * 0.6; b.turn *= Math.exp(-dt * 0.4); steer = Math.max(-0.35, Math.min(0.35, b.turn)); // lazy wandering
    }
    // keep away from other boats
    for (const o of this.list) if (o !== b && !o.sink) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); const R = 30 + (T.len + o.type.len) * 0.5; if (d < R && d > 0.1 && (dx * fx + dz * fz) > 0) steer += (dx * fz - dz * fx > 0 ? -1 : 1) * (1 - d / R); }
    const hurt = b.hp / T.hp; if (b.scared > 0) b.scared -= dt;
    const target = (ahead ? b.want : b.want * 0.45) * (hurt < 0.5 ? 0.6 : 1) * (b.scared > 0 && hurt >= 0.5 ? 1.35 : 1); // shot at: floor it; badly hurt: limping
    b.sp += (target - b.sp) * Math.min(1, dt * 0.6);
    const rate = Math.max(-0.55, Math.min(0.55, steer)) * Math.min(1, 0.25 + b.sp / 8);
    b.yaw += rate * dt; b.roll += (-rate * Math.min(1, b.sp / 10) * (T.id === 'sail' ? 0.4 : 0.25) - b.roll) * Math.min(1, dt * 2);
    let nx = b.x + Math.sin(b.yaw) * b.sp * dt, nz = b.z + Math.cos(b.yaw) * b.sp * dt;
    if (this.wet(nx, nz) && (T.len < 20 || this.wet(nx + Math.sin(b.yaw) * bowD, nz + Math.cos(b.yaw) * bowD))) { b.x = nx; b.z = nz; } else { b.sp *= 0.5; b.yaw += Math.PI * dt; } // never beach it
    b.vx = Math.sin(b.yaw) * b.sp; b.vz = Math.cos(b.yaw) * b.sp; b.speed = Math.hypot(b.vx + b.pvx, b.vz + b.pvz);
    const k = Math.min(1, b.sp / 14);
    b.mesh.position.set(b.x, wy + 0.08 * Math.sin(tt * 1.7) + 0.12 * k - (1 - hurt) * 0.25, b.z);   // a damaged boat sits lower
    b.mesh.rotation.set(-(0.04 * k + 0.025 * Math.sin(tt * 1.3)) + b.rp, b.yaw, b.roll + 0.03 * Math.sin(tt * 1.1) + b.rr + (1 - hurt) * 0.06, 'YXZ');
    for (const n of b.mesh.userData.navs) n.visible = this.night > 0.35;
    if (b.mesh.userData.sail) b.mesh.userData.sail[0].rotation.y = Math.PI / 2 + 0.25 * Math.sin(tt * 0.3);
    this.crew(b, tt);
    if (hurt < 0.6 && (b.smokeT -= dt) <= 0) { b.smokeT = 0.1 + hurt * 0.4; this.fx.smoke && this.fx.smoke(b.x - fx * T.len * 0.3, wy + 1.4, b.z - fz * T.len * 0.3, hurt < 0.3); }
    if (b.flash > 0) { b.flash -= dt; b.mesh.userData.body.position.x = (rnd() - 0.5) * 0.06; } else b.mesh.userData.body.position.x = 0; // a little shudder when hit
    if (this.light) b.wake.setLight(this.light); b.wake.emit(b, dt, wy); b.wake.update(dt);
  }
  // the people on board: wave and cheer when you're close, yell when it's going down; darker at night
  crew(b, tt) {
    const ppl = b.mesh.userData.people; if (!ppl || !ppl.length) return;
    const near = this.px != null && Math.hypot(this.px - b.x, this.pz - b.z) < 45, dim = 1 - Math.min(0.7, (this.night || 0) * 0.7);
    for (const P of ppl) {
      let pose = P.base;
      if (b.sink) pose = ((tt * 2 + P.ph) | 0) % 2 ? 6 : 7;
      else if (b.scared > 0) pose = P.seated ? 5 : 6;
      else if (near) pose = P.seated ? (((tt * 1.5 + P.ph) | 0) % 3 === 0 ? 5 : 4) : (((tt * 2 + P.ph) | 0) % 2 ? 1 : 2);
      setPose(P, pose); P.sp.material.color.setScalar(dim);
    }
  }
  // push a circle (the player's car) out of any boat; returns { nx, nz, depth, boat, cx, cz } or null
  collide(x, z, r, y = null) {
    for (const b of this.list) {
      if (y != null && y > (b.wy ?? 0) + (b.type.ht || 3)) continue; // flying or jumping clear over it
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), dx = x - b.x, dz = z - b.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      const hl = b.type.len / 2, hb = b.type.beam / 2 * (lz > hl * 0.4 ? Math.max(0.25, 1 - (lz - hl * 0.4) / (hl * 0.6)) : 1); // narrower towards the pointed bow
      const cx = Math.max(-hb, Math.min(hb, lx)), cz = Math.max(-hl, Math.min(hl, lz)), ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
      if (d < r) {
        let nxl = ex, nzl = ez, dep = r - d;
        if (d < 1e-4) { if (hb - Math.abs(lx) < hl - Math.abs(lz)) { nxl = Math.sign(lx) || 1; nzl = 0; dep = r + hb - Math.abs(lx); } else { nxl = 0; nzl = Math.sign(lz) || 1; dep = r + hl - Math.abs(lz); } }
        const l = Math.hypot(nxl, nzl) || 1; nxl /= l; nzl /= l;
        const nx = nxl * fz + nzl * fx, nz = -nxl * fx + nzl * fz;
        return { nx, nz, depth: dep, boat: b, cx: b.x + cx * fz + cz * fx, cz: b.z - cx * fx + cz * fz };
      }
    }
    return null;
  }
}
