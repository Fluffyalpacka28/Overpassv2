import * as THREE from 'three';
import { idbGet, idbSet, hashStr, imageToSkin } from './custom.js';

// Player-built garages.
//  - Build mode: the camera lifts overhead. Tap the ground to highlight a spot, tap the highlight again (or press Build) to build it.
//  - Costs GARAGE_COST points. Garages are saved on this device and shared with everyone in the multiplayer session.
//  - The ground under the garage is levelled. The building is hollow with open doors: you can drive in. Inside you get the workshop
//    (camera orbits your car, menu for the custom car + lights). Cars collide with the walls and the workshop furniture.

export const GARAGE_COST = 10000, GARAGE_MAX = 3, FLOOR_COST = 1000, FLOORS_MAX = 6;
export const PW = 16, PD = 14;           // pad: width x depth in metres (front of the garage faces local +Z)
const BLD_D = 10, BH = 5.4, T = 0.35;    // the building takes the back 10 m of the pad, the front 4 m is the forecourt. T = wall thickness
const ZB0 = -PD / 2, ZF = ZB0 + BLD_D, ZBC = (ZB0 + ZF) / 2; // back wall, front wall and middle of the building (local z)
const DOOR_X = 4.4, DOOR_W = 5.6, DOOR_H = 3.9;               // two open doorways: 5.6 m wide leaves a 3 m lane for a car (collision radius 1.3 m)
const FH = 3.6;                          // height of each floor you add on top of the ground-floor workshop
const floorsOf = r => Math.max(1, Math.min(FLOORS_MAX, ((r && r.f) | 0) || 1));
const heightOf = f => BH + 0.3 + (f - 1) * (FH + 0.3); // top of the roof slab for a building with f floors
const pub = g => ({ i: g.i, n: g.n, la: g.la, lo: g.lo, y: g.y, c: g.c, f: floorsOf(g) });
const KEY = 'osm.garages.v1';
const OK = '#35d07f', BAD = '#ff4d4d', WAIT = '#ffb02e';
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snap = (a, q) => Math.round(a / q) * q;

const CSS = `#garageUI{position:fixed;left:0;right:0;bottom:0;z-index:65;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 10px max(12px,env(safe-area-inset-bottom));pointer-events:none;font:600 14px/1.25 var(--display,system-ui,sans-serif);color:#fff}
#garageUI>*{pointer-events:auto}
.gbar{width:min(520px,100%);background:rgba(16,14,30,.93);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:10px;backdrop-filter:blur(8px);box-shadow:0 10px 30px rgba(0,0,0,.45)}
.gbar .gt{display:flex;justify-content:space-between;align-items:center;gap:10px}.gbar .gt b{font-size:16px}.gbar .gc{opacity:.85}
.gbar .gm{min-height:2.5em;opacity:.92}.gbar .gm.bad{color:#ff8d8d}.gbar .gm.ok{color:#7ff0b4}.gbar .gm.wait{color:#ffd28a}
.gbar input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-weight:600}
.gbar .gr{display:flex;gap:8px;flex-wrap:wrap}.gbar .gr button{flex:1 1 auto;min-height:46px;min-width:64px;border:0;border-radius:12px;padding:8px 12px;font:inherit;font-weight:800;color:#fff;background:#5a5870;cursor:pointer;touch-action:manipulation}
.gbar .gr .go{background:#2fa36b;flex:2 1 120px}.gbar .gr .go[disabled]{background:#4a4860;opacity:.65}.gbar .gr .no{background:#8b3c46}
.gpill{pointer-events:auto;border:1px solid rgba(255,255,255,.16);background:rgba(16,14,30,.92);color:#fff;border-radius:999px;padding:12px 18px;min-height:46px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35);touch-action:manipulation;margin-bottom:64px}
.gbtn{position:fixed;right:14px;top:calc(50% + 52px);z-index:30;width:84px;padding:10px 8px 9px;border-radius:14px;background:var(--panel,rgba(22,18,44,.8));border:1px solid var(--line-2,rgba(255,255,255,.16));backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--muted,#b9b6c9);opacity:.8;pointer-events:auto;touch-action:manipulation;cursor:pointer;font:inherit;transition:opacity .2s,border-color .2s,color .2s,box-shadow .2s}
.gbtn[hidden]{display:none}.gbtn svg{width:34px;height:22px}.gbtn b{font-family:var(--display,inherit);font-size:.82rem;letter-spacing:.12em}.gbtn small{font-size:.68rem;letter-spacing:.06em;opacity:.75}
.gbtn.ready{opacity:1;color:var(--gold,#ffc531);border-color:rgba(255,197,49,.6);box-shadow:0 0 0 1px rgba(255,197,49,.25),0 6px 22px rgba(255,197,49,.18)}.gbtn:active{transform:scale(.95)}
@media (pointer:coarse){.gbtn{top:calc(42% + 52px)}}
.gcard small{display:block;opacity:.75;margin-top:2px}.gcard .gx{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.gcard input{flex:1 1 140px;min-width:0}
#workshop{position:fixed;z-index:80;top:12px;right:12px;bottom:12px;width:min(400px,92vw);display:flex;flex-direction:column;background:rgba(14,12,28,.94);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:18px;box-shadow:0 14px 44px rgba(0,0,0,.55);backdrop-filter:blur(10px);overflow:hidden;font:600 14px/1.3 var(--display,system-ui,sans-serif)}
#workshop[hidden]{display:none}
#workshop .ws-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}#workshop .ws-head b{font-size:16px}
#workshop .ws-head button{border:0;border-radius:12px;padding:10px 16px;min-height:44px;font:inherit;font-weight:800;color:#fff;background:#2fa36b;cursor:pointer;touch-action:manipulation}
#workshop .ws-tabs{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
#workshop .ws-tabs button{flex:1;border:0;border-radius:10px;padding:10px 6px;min-height:42px;font:inherit;font-weight:700;color:#cfd0dd;background:rgba(255,255,255,.07);cursor:pointer;touch-action:manipulation}
#workshop .ws-tabs button.on{background:#ff5a3c;color:#fff}
#workshop .ws-tabs button{font-size:13px;padding:10px 3px}
.nsws{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.nsw{position:relative;height:58px;border-radius:12px;border:2px solid rgba(255,255,255,.12);cursor:pointer;touch-action:manipulation;overflow:hidden;box-shadow:inset 0 -18px 18px rgba(0,0,0,.35)}
.nsw span{position:absolute;left:0;right:0;bottom:5px;font:700 12px/1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000}
.nsw.on{border-color:#fff;box-shadow:0 0 0 2px #ff5a3c,inset 0 -18px 18px rgba(0,0,0,.35)}
.npips{display:flex;gap:6px;margin:6px 0 4px}.npips i{flex:1;height:12px;border-radius:6px;background:rgba(255,255,255,.12)}.npips i.on{background:linear-gradient(90deg,#ff5a3c,#ffb02e);box-shadow:0 0 8px rgba(255,140,40,.6)}
#workshop .ws-body{flex:1;overflow-y:auto;padding:10px 12px 18px;-webkit-overflow-scrolling:touch;touch-action:pan-y}
#workshop .ws-hint{padding:6px 14px 10px;font-size:12px;opacity:.65}
body.in-workshop #hud{visibility:hidden}
@media (max-width:760px){#workshop{top:auto;left:0;right:0;bottom:0;width:auto;height:54vh;border-radius:18px 18px 0 0}}`;

// ---------- the garage building ----------
let SH = null;
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t;
}
function shared() {
  if (SH) return SH;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
  const floor = canvasTex(512, 512, (x, w, h) => { // epoxy floor: speckle, oil stains, yellow bay lines
    x.fillStyle = '#8c9199'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2400; i++) { x.fillStyle = `rgba(${i % 2 ? 255 : 40},${i % 2 ? 255 : 40},${i % 2 ? 255 : 44},.05)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (const [px, py, r] of [[150, 210, 38], [330, 330, 30], [260, 140, 22]]) { const g = x.createRadialGradient(px, py, 2, px, py, r); g.addColorStop(0, 'rgba(20,20,24,.35)'); g.addColorStop(1, 'rgba(20,20,24,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
    x.strokeStyle = '#e6c229'; x.lineWidth = 6; x.strokeRect(34, 34, w - 68, h - 68); x.setLineDash([26, 18]); x.beginPath(); x.moveTo(w / 2, 40); x.lineTo(w / 2, h - 40); x.stroke();
  });
  const peg = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#2b2f38'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 8; i < w; i += 14) for (let j = 8; j < h; j += 14) x.fillRect(i, j, 3, 3);
    x.strokeStyle = '#c3c8d2'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(30, 30); x.lineTo(30, 90); x.moveTo(60, 28); x.lineTo(80, 90); x.moveTo(110, 30); x.lineTo(150, 30); x.moveTo(110, 50); x.lineTo(150, 50); x.moveTo(190, 25); x.lineTo(190, 100); x.stroke(); x.fillStyle = '#c94a3d'; x.fillRect(176, 22, 28, 12); });
  const chest = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#b3261e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#6e1712'; x.lineWidth = 3; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(6, i * 24); x.lineTo(w - 6, i * 24); x.stroke(); } x.fillStyle = '#d9dde4'; for (let i = 0; i < 5; i++) x.fillRect(w / 2 - 16, 6 + i * 24 + 5, 32, 4); });
  const door = canvasTex(256, 256, (x) => { x.fillStyle = '#d3d7de'; x.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 21) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, y, 256, 3); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, y + 3, 256, 2); } });
  SH = {
    box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(0.28, 0.7, 10), drum: new THREE.CylinderGeometry(0.42, 0.42, 0.95, 14), plane: new THREE.PlaneGeometry(1, 1),
    tire: new THREE.TorusGeometry(0.3, 0.13, 10, 18), barrel: new THREE.CylinderGeometry(0.3, 0.3, 1, 16),
    floor: new THREE.MeshStandardMaterial({ map: floor, roughness: 0.5, metalness: 0.1 }), apron: std('#4b4f56', { roughness: 0.95 }), wall: std('#d9dce1'), wains: std('#4d5663'), roof: std('#34373e', { roughness: 0.9 }), dark: std('#1b1d23'),
    frame: std('#2a2d35', { metalness: 0.3 }), shutter: new THREE.MeshStandardMaterial({ map: door, roughness: 0.5, metalness: 0.35 }),
    glass: std('#6fa6c9', { roughness: 0.1, metalness: 0.6, emissive: '#2a4a63', emissiveIntensity: 0.5 }), lamp: std('#fff2c4', { emissive: '#ffe08a', emissiveIntensity: 1.4 }),
    strip: std('#f6fbff', { emissive: '#eef7ff', emissiveIntensity: 2.2, roughness: 0.3 }), peg: std('#ffffff', { map: peg, roughness: 0.8 }), chest: std('#ffffff', { map: chest, roughness: 0.55, metalness: 0.2 }),
    cone2: std('#ff7a1a'), white: std('#f2f2f2'), drumA: std('#2e6bd1', { metalness: 0.4 }), drumB: std('#c94a3d', { metalness: 0.4 }), metal: std('#9aa0a8', { metalness: 0.7, roughness: 0.4 }), rubber: std('#17171b', { roughness: 0.95 }), wood: std('#8a6a47', { roughness: 0.85 }),
  };
  return SH;
}
const WT = new Map(); // wall pictures decoded once per picture
function wallTex(a) {
  let t = WT.get(a.h); if (t) return t;
  t = new THREE.TextureLoader().load(a.data); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; WT.set(a.h, t);
  if (WT.size > 40) { const [k, v] = WT.entries().next().value; WT.delete(k); v.dispose(); }
  return t;
}
function signTexture(name, owner, color) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192; const x = c.getContext('2d');
  x.fillStyle = '#14161c'; x.fillRect(0, 0, 1024, 192); x.fillStyle = color; x.fillRect(0, 0, 1024, 14); x.fillRect(0, 178, 1024, 14);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  const t = String(name || 'Garage').toUpperCase(); let size = 96; x.font = `800 ${size}px system-ui, sans-serif`;
  while (x.measureText(t).width > 920 && size > 34) { size -= 4; x.font = `800 ${size}px system-ui, sans-serif`; }
  x.fillText(t, 512, 82); x.font = '600 34px system-ui, sans-serif'; x.fillStyle = '#c9ced8'; x.fillText(`GARAGE  ·  ${String(owner || '').toUpperCase()}`, 512, 148);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
// Local frame: origin at the pad centre on the ground, front (forecourt, doorways) towards +Z.
// The shell is made of separate thin walls so the inside is visible and open: two doorways lead into one big bay.
export function buildExterior(rec, ownerName, pics = null) {
  const S = shared(), g = new THREE.Group(), F = floorsOf(rec), HT = heightOf(F), own = [], geos = [];
  const pic = a => { if (!a) return null; const m = new THREE.MeshStandardMaterial({ map: wallTex(a), roughness: 0.88, metalness: 0.02 }); own.push(m); return m; };
  const TO = pic(pics && pics.wo), TI = pic(pics && pics.wi); // outside / inside wall pictures
  // a unit box whose UVs tile the picture about every 3 m, whatever the size of the wall
  const uvBox = (sx, sy, sz) => { const gm = S.box.clone(), uv = gm.attributes.uv, d = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]]; for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * d[f][0] / 3, uv.getY(i) * d[f][1] / 3); } uv.needsUpdate = true; geos.push(gm); return gm; };
  const put = (geo, mat, x, y, z, sx, sy, sz, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; g.add(m); return m; };
  // face: which way the wall's outside looks (b back, l left, r right, f front) so the outside and inside pictures go on the right sides
  const wall = (x0, x1, z0, z1, y0, y1, mat = S.wall, face = null) => {
    if (face && mat === S.wall && (TO || TI)) {
      const m = [S.wall, S.wall, S.wall, S.wall, S.wall, S.wall], O = { b: 5, l: 1, r: 0, f: 4 }[face], I = { b: 4, l: 0, r: 1, f: 5 }[face]; if (TO) m[O] = TO; if (TI) m[I] = TI;
      return put(uvBox(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
    }
    return put(S.box, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  };
  const accent = new THREE.MeshStandardMaterial({ color: rec.c || '#ff5a3c', roughness: 0.5, emissive: rec.c || '#ff5a3c', emissiveIntensity: 0.18 });
  // floors
  const fl = new THREE.Mesh(S.plane, S.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.03, ZBC); fl.scale.set(PW - 2 * T, BLD_D - 2 * T, 1); g.add(fl);
  const ap = new THREE.Mesh(S.plane, S.apron); ap.rotation.x = -Math.PI / 2; ap.position.set(0, 0.025, (ZF + PD / 2) / 2); ap.scale.set(PW, PD / 2 - ZF, 1); g.add(ap);
  for (const sx of [-6.4, -1.0, 1.0, 6.4]) put(S.box, S.white, sx, 0.05, (ZF + PD / 2) / 2, 0.12, 0.03, PD / 2 - ZF - 0.6, false);
  // walls: back, sides, and a front wall with two doorways (pillars, a centre pier, and a lintel over each doorway)
  wall(-PW / 2, PW / 2, ZB0, ZB0 + T, 0, BH, S.wall, 'b'); wall(-PW / 2, -PW / 2 + T, ZB0, ZF, 0, BH, S.wall, 'l'); wall(PW / 2 - T, PW / 2, ZB0, ZF, 0, BH, S.wall, 'r');
  const px = DOOR_X + DOOR_W / 2, pw = DOOR_X - DOOR_W / 2; // outer / inner edge of a doorway
  wall(-PW / 2, -px, ZF - T, ZF, 0, BH, S.wall, 'f'); wall(px, PW / 2, ZF - T, ZF, 0, BH, S.wall, 'f'); wall(-pw, pw, ZF - T, ZF, 0, BH, S.wall, 'f');
  wall(-px, -pw, ZF - T, ZF, DOOR_H, BH, S.wall, 'f'); wall(pw, px, ZF - T, ZF, DOOR_H, BH, S.wall, 'f');
  // inside: dark wainscot, ceiling lights
  if (!TI) { wall(-PW / 2 + T, PW / 2 - T, ZB0 + T, ZB0 + T + 0.05, 0, 1.25, S.wains); wall(-PW / 2 + T, -PW / 2 + T + 0.05, ZB0 + T, ZF - T, 0, 1.25, S.wains); wall(PW / 2 - T - 0.05, PW / 2 - T, ZB0 + T, ZF - T, 0, 1.25, S.wains); }
  for (const sx of [-4.5, -1.5, 1.5, 4.5]) put(S.box, S.strip, sx, BH - 0.3, ZBC, 0.3, 0.08, 7.0, false);
  for (const z of [ZB0 + 2.2, ZBC, ZF - 2.2]) put(S.box, S.dark, 0, BH - 0.15, z, PW - 2 * T, 0.3, 0.25, false);
  // roof, parapet, air-con
  for (let k = 0; k < F; k++) put(S.box, S.roof, 0, BH + 0.15 + k * (FH + 0.3), ZBC, PW + 0.2, 0.3, BLD_D + 0.2); // the ground-floor ceiling, then a slab above each extra floor
  wall(-PW / 2 - 0.1, PW / 2 + 0.1, ZB0 - 0.1, ZB0 + 0.1, HT, HT + 0.5); wall(-PW / 2 - 0.1, -PW / 2 + 0.1, ZB0, ZF, HT, HT + 0.5); wall(PW / 2 - 0.1, PW / 2 + 0.1, ZB0, ZF, HT, HT + 0.5);
  put(S.box, S.metal, 5.2, HT + 0.45, ZBC - 2, 1.8, 0.9, 1.3); put(S.box, S.dark, 5.2, HT + 0.93, ZBC - 2, 1.2, 0.06, 0.9);
  // extra floors you bought: closed storeys with windows, stacked on top
  for (let k = 1; k < F; k++) {
    const y0 = BH + 0.3 + (k - 1) * (FH + 0.3), y1 = y0 + FH, ym = (y0 + y1) / 2;
    wall(-PW / 2, PW / 2, ZB0, ZB0 + T, y0, y1, S.wall, 'b'); wall(-PW / 2, -PW / 2 + T, ZB0, ZF, y0, y1, S.wall, 'l'); wall(PW / 2 - T, PW / 2, ZB0, ZF, y0, y1, S.wall, 'r'); wall(-PW / 2, PW / 2, ZF - T, ZF, y0, y1, S.wall, 'f');
    for (const sx of [-6, -2, 2, 6]) { put(S.box, S.frame, sx, ym, ZF + 0.01, 1.9, 1.7, 0.08, false); put(S.box, S.glass, sx, ym, ZF + 0.05, 1.7, 1.5, 0.05, false); put(S.box, S.frame, sx, ym, ZB0 - 0.01, 1.9, 1.7, 0.08, false); put(S.box, S.glass, sx, ym, ZB0 - 0.05, 1.7, 1.5, 0.05, false); }
    for (const sx of [-1, 1]) for (const dz of [-2.4, 0.2, 2.8]) { put(S.box, S.frame, sx * (PW / 2 + 0.01), ym, ZBC + dz, 0.08, 1.7, 1.9, false); put(S.box, S.glass, sx * (PW / 2 + 0.05), ym, ZBC + dz, 0.05, 1.5, 1.7, false); }
    put(S.box, S.strip, 0, y1 - 0.25, ZBC, PW - 2, 0.08, 0.3, false); put(S.box, accent, 0, y1 - 0.12, ZF + 0.02, PW + 0.06, 0.2, 0.08, false);
  }
  // doorways: the roll-up doors are rolled up (barrel above each opening), with jambs either side
  for (const s of [-1, 1]) {
    const cx = s * DOOR_X, bar = put(S.barrel, S.shutter, cx, DOOR_H + 0.42, ZF + 0.22, 1, DOOR_W - 0.3, 1); bar.rotation.z = Math.PI / 2;
    for (const e of [-1, 1]) put(S.box, S.frame, cx + e * (DOOR_W / 2 + 0.04), DOOR_H / 2, ZF + 0.02, 0.16, DOOR_H, 0.34);
    put(S.box, S.frame, cx, DOOR_H + 0.05, ZF + 0.02, DOOR_W + 0.3, 0.12, 0.34); put(S.box, S.lamp, cx, DOOR_H + 0.95, ZF + 0.3, 0.7, 0.22, 0.3, false);
  }
  put(S.box, accent, 0, 4.78, ZF + 0.02, PW + 0.06, 0.36, 0.08, false); put(S.box, accent, -PW / 2 - 0.02, 4.78, ZBC, 0.08, 0.36, BLD_D + 0.06, false); put(S.box, accent, PW / 2 + 0.02, 4.78, ZBC, 0.08, 0.36, BLD_D + 0.06, false);
  put(S.box, S.frame, 0, 1.15, ZF + 0.03, 1.3, 2.3, 0.18); put(S.box, S.glass, 0, 1.55, ZF + 0.14, 0.7, 0.9, 0.06, false); // pedestrian door in the centre pier
  for (const sx of [-1, 1]) for (const dz of [-2.2, 1.6]) put(S.box, S.glass, sx * (PW / 2 - 0.02), 2.9, ZBC + dz, 0.1, 1.1, 1.6, false);
  // sign on the roof
  const tex = signTexture(rec.n, ownerName, rec.c || '#ff5a3c');
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.6 });
  for (const sx of [-4.6, 4.6]) put(S.box, S.dark, sx, HT + 0.7, ZF - 0.6, 0.18, 1.4, 0.18);
  const sign = new THREE.Mesh(S.box, [S.dark, S.dark, S.dark, S.dark, face, S.dark]); sign.position.set(0, HT + 1.9, ZF - 0.6); sign.scale.set(11, 2, 0.26); sign.castShadow = true; g.add(sign);
  // forecourt dressing
  for (const [x, z] of [[-7.2, ZF + 1.4], [7.2, ZF + 1.4], [-1.2, ZF + 3.2]]) put(S.cone, S.cone2, x, 0.4, z, 1, 1, 1);
  put(S.drum, S.drumA, -7.2, 0.5, ZF + 2.6, 1, 1, 1); put(S.drum, S.drumB, -6.3, 0.5, ZF + 2.8, 1, 1, 1);
  // ---- the workshop inside: tool chest, bench with pegboard, tyre stacks, drums, shelf ----
  put(S.box, S.chest, -5.2, 0.62, ZB0 + T + 0.4, 1.3, 1.2, 0.65);
  put(S.box, S.wood, 4.8, 1.0, ZB0 + T + 0.5, 4.4, 0.1, 0.95); for (const [dx, dz] of [[-2.05, -0.4], [2.05, -0.4], [-2.05, 0.4], [2.05, 0.4]]) put(S.box, S.metal, 4.8 + dx, 0.5, ZB0 + T + 0.5 + dz, 0.1, 1.0, 0.1);
  put(S.box, S.wood, 4.8, 0.4, ZB0 + T + 0.5, 4.2, 0.05, 0.8); put(S.box, S.dark, 3.4, 1.14, ZB0 + T + 0.55, 0.25, 0.18, 0.2); put(S.box, S.peg, 4.8, 2.15, ZB0 + T + 0.04, 4.4, 1.4, 0.05, false);
  for (const [tx, tz] of [[-7.05, ZB0 + T + 0.5], [-6.15, ZB0 + T + 0.5], [-7.05, ZB0 + T + 1.4]]) for (let i = 0; i < 4; i++) { const t = put(S.tire, S.rubber, tx, 0.14 + i * 0.26, tz, 1, 1, 1); t.rotation.x = Math.PI / 2; }
  put(S.drum, S.drumB, -7.15, 0.5, ZBC + 1.2, 1, 1, 1); put(S.drum, S.drumA, -7.15, 0.5, ZBC + 2.2, 1, 1, 1);
  for (const y of [0.5, 1.2, 1.9]) put(S.box, S.metal, -7.35, y, ZBC - 2, 0.5, 0.05, 3.0, false); for (const [y, dz] of [[0.72, -3], [0.72, -1.4], [1.42, -2.2], [1.42, -0.9]]) put(S.box, S.wood, -7.35, y, ZBC + dz + 0.7, 0.4, 0.36, 0.7);
  g.userData = { tex, face, accent, dispose() { tex.dispose(); face.dispose(); accent.dispose(); own.forEach(m => m.dispose()); geos.forEach(x => x.dispose()); } };
  return g;
}

export class GarageSystem {
  // c: { scene, camera, canvas, world, net(), toast, hudMsg, audio, score(), spend(n), player(), mode(), paused(), spawning(), driverName(), color(), riding(), hudVisible(),
  //      openGarage(), closePause(), place(x,z,yaw), renderGarage(), shake(n), onChange() }
  constructor(c) {
    this.c = c; this.mine = this.load(); this.objs = new Map(); this.building = false; this.shop = null; this.sel = null; this.nameVal = ''; this.lat0 = null; this.lon0 = null;
    this.tgt = new THREE.Vector3(); this.tgtY = 0; this.h = 90; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camInit = false;
    this.ptrs = new Map(); this.pinch = 0; this.ray = new THREE.Raycaster(); this.t1 = 0; this.t2 = 0; this.t3 = 0; this.sig = ''; this.delId = null; this.nearId = null; this.insideId = null; this.clock = 0; this.vo = '';
    this.fill = new THREE.PointLight('#fff1dc', 0, 26, 2); c.scene.add(this.fill); // one light, always present (so shaders never recompile), switched on near/inside your garage
    this.walls = { wo: null, wi: null }; this.wallPick = null; this.makeHighlight(); this.makeUI(); this.makeWorkshop(); this.makeFileInput(); this.loadWalls();
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e); this.onWheel = e => this.wheel(e);
  }
  get busy() { return this.building || !!this.shop; }

  // ---------- saved garages ----------
  load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(g => g && isFinite(g.la) && isFinite(g.lo)).slice(0, GARAGE_MAX) : []; } catch { return []; } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.mine)); } catch { } this.c.net().setGarages(this.mine.map(pub)); this.c.onChange && this.c.onChange(); }

  // ---------- 3D objects (mine and everyone else's) ----------
  ownerName() { return this.c.driverName(); }
  pos(rec) { const [x, z] = this.c.world.proj(rec.la, rec.lo); return [x, z]; }
  baseY(x, z, yaw) {
    const e = this.c.world.elev, s = Math.sin(yaw), co = Math.cos(yaw); let h = -1e9;
    for (const [lx, lz] of [[0, 0], [-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]]) h = Math.max(h, e.at(x + lx * co + lz * s, z - lx * s + lz * co));
    return isFinite(h) ? h : 0;
  }
  toWorld(o, lx, lz) { const s = Math.sin(o.yaw), co = Math.cos(o.yaw); return [o.x + lx * co + lz * s, o.z - lx * s + lz * co]; }
  toLocal(o, x, z) { const dx = x - o.x, dz = z - o.z, s = Math.sin(o.yaw), co = Math.cos(o.yaw); return [dx * co - dz * s, dx * s + dz * co]; }
  // solid parts of a garage as world-space polygons: the walls (with the doorways left open), the workshop furniture, and the pad (keeps trees away)
  polys(x, z, yaw) {
    const s = Math.sin(yaw), co = Math.cos(yaw), toW = (lx, lz) => [x + lx * co + lz * s, z - lx * s + lz * co], rect = (x0, z0, x1, z1) => [toW(x0, z0), toW(x1, z0), toW(x1, z1), toW(x0, z1)], px = DOOR_X + DOOR_W / 2, pw = DOOR_X - DOOR_W / 2;
    return {
      walls: [rect(-PW / 2, ZB0, PW / 2, ZB0 + T), rect(-PW / 2, ZB0, -PW / 2 + T, ZF), rect(PW / 2 - T, ZB0, PW / 2, ZF), rect(-PW / 2, ZF - T, -px, ZF), rect(px, ZF - T, PW / 2, ZF), rect(-pw, ZF - T, pw, ZF)],
      props: [rect(-5.85, ZB0 + T, -4.55, ZB0 + T + 0.75), rect(2.6, ZB0 + T, 7.0, ZB0 + T + 1.05), rect(-7.65, ZB0 + T, -5.7, ZB0 + T + 1.9), rect(-7.65, ZBC + 0.7, -6.7, ZBC + 2.7), rect(-7.65, ZBC - 3.5, -7.0, ZBC - 0.5)],
      pad: [toW(-PW / 2 - 12, -PD / 2 - 12), toW(PW / 2 + 12, -PD / 2 - 12), toW(PW / 2 + 12, PD / 2 + 12), toW(-PW / 2 - 12, PD / 2 + 12)], // the whole levelled area: no trees on it
    };
  }
  addObj(key, rec, own, ownerName, anim = false) {
    this.removeObj(key); const w = this.c.world, [x, z] = this.pos(rec), yaw = rec.y || 0, g = buildExterior(rec, ownerName, this.texOf(rec, own));
    const fl = w.flattenPad(key, x, z, yaw, PW, PD), y = fl ? fl.y : this.baseY(x, z, yaw); // level the ground under it (retried later if the ground hasn't loaded yet)
    g.position.set(x, y, z); g.rotation.y = yaw; if (anim) g.scale.y = 0.02; this.c.scene.add(g);
    const P = this.polys(x, z, yaw), ids = [], hh = heightOf(floorsOf(rec)) + 0.6; P.walls.forEach((poly, i) => { w.addExtra({ id: `${key}:w${i}`, poly, top: y + hh }); ids.push(`${key}:w${i}`); });
    P.props.forEach((poly, i) => { w.addExtra({ id: `${key}:p${i}`, poly, top: y + 1.7 }); ids.push(`${key}:p${i}`); });
    w.addExtra({ id: key + ':pad', poly: P.pad, noCollide: true }); ids.push(key + ':pad'); w.addPaved(key, x, z, yaw, PW, PD); w.pruneTreesIn(P.pad);
    this.objs.set(key, { key, rec, own, ownerName, g, x, z, y, yaw, hh, flat: !!fl, ids, anim: anim ? 0 : 1, sigName: this.sigOf(rec, ownerName, own) });
  }
  // pictures on the walls: mine come from this device, other players' arrive over the asset channel
  texOf(rec, own) {
    if (own) return this.walls;
    const n = this.c.net(), get = k => { const v = n.assets && n.assets.get(rec.o + '|' + k); return v && typeof v.data === 'string' && v.data.length < 600000 && /^data:image\/(jpeg|png|webp);base64,/.test(v.data) ? v : null; };
    return { wo: get('wo'), wi: get('wi') };
  }
  sigOf(rec, ownerName, own) { const t = this.texOf(rec, own); return [rec.n, rec.c, ownerName, floorsOf(rec), t.wo ? t.wo.h : '', t.wi ? t.wi.h : ''].join('|'); }
  // a look change (name, colour, floors, wall pictures): swap the building's model, leave the ground and colliders alone
  rebuildLook(o, rec, ownerName) {
    const w = this.c.world, old = o.g, g = buildExterior(rec, ownerName, this.texOf(rec, o.own));
    g.position.copy(old.position); g.rotation.copy(old.rotation); g.scale.copy(old.scale); g.visible = old.visible; this.c.scene.add(g); this.c.scene.remove(old); old.userData.dispose && old.userData.dispose();
    o.g = g; o.rec = rec; o.ownerName = ownerName; o.hh = heightOf(floorsOf(rec)) + 0.6; o.sigName = this.sigOf(rec, ownerName, o.own);
    for (const id of o.ids) { const ex = w.extraById.get(id); if (ex && !ex.noCollide && !id.includes(':p')) ex.top = o.y + o.hh; }
  }
  removeObj(key) {
    const o = this.objs.get(key); if (!o) return; this.objs.delete(key); this.c.scene.remove(o.g); o.g.userData.dispose && o.g.userData.dispose();
    for (const id of o.ids) this.c.world.removeExtra(id); this.c.world.removePaved(key); this.c.world.unflattenPad(key);
  }
  rebuildAll() { // after the world's origin changed (a different place)
    for (const k of [...this.objs.keys()]) this.removeObj(k);
    this.syncMine(); this.syncRemote(this.c.net().active ? this.c.net().remoteGarages() : [], true);
  }
  syncMine() {
    const want = new Set(this.mine.map(g => 'me:' + g.i));
    for (const k of [...this.objs.keys()]) if (k.startsWith('me:') && !want.has(k)) this.removeObj(k);
    for (const g of this.mine) { const k = 'me:' + g.i, o = this.objs.get(k), nm = this.ownerName(); if (!o) this.addObj(k, g, true, nm); else if (o.sigName !== this.sigOf(g, nm, true)) this.rebuildLook(o, g, nm); else o.rec = g; }
  }
  syncRemote(list, force = false) {
    const want = new Map(); for (const r of list) want.set(r.o + ':' + r.i, r);
    for (const k of [...this.objs.keys()]) if (!k.startsWith('me:') && !want.has(k)) this.removeObj(k);
    for (const [k, r] of want) {
      const o = this.objs.get(k), sg = this.sigOf(r, r.on || '', false), mv = o && (Math.abs(o.rec.la - r.la) > 1e-6 || Math.abs(o.rec.lo - r.lo) > 1e-6 || Math.abs((o.rec.y || 0) - (r.y || 0)) > 1e-3);
      if (!o || force || mv) { const fresh = !o && !force; this.addObj(k, r, false, r.on || '', fresh); } else if (o.sigName !== sg) this.rebuildLook(o, r, r.on || '');
    }
  }
  insideOf(o, x, z) { const [lx, lz] = this.toLocal(o, x, z); return Math.abs(lx) < PW / 2 - 0.5 && lz > ZB0 + 0.4 && lz < ZF + 0.5; }

  // ---------- per-frame ----------
  update(dt) {
    const c = this.c, w = c.world; this.clock += dt;
    { // the on-screen Garage button: only while driving in World Drive
      const show = c.mode() === 'world' && !c.spawning() && !c.paused() && !this.busy && c.hudVisible() && !(c.riding && c.riding()) && this.mine.length < GARAGE_MAX;
      if (show !== this.btnShow || this.btn.hidden === show) { this.btnShow = show; this.btn.hidden = !show; }
      if (show) { const ready = this.afford(); if (ready !== this.btnReady) { this.btnReady = ready; this.btn.classList.toggle('ready', ready); this.btn.setAttribute('aria-disabled', String(!ready)); } }
    }
    if (w.lat0 == null || !isFinite(w.lat0)) return; // no place loaded yet
    const vis = c.mode() === 'world'; // garages only exist in World Drive (not in story races or the menu)
    for (const o of this.objs.values()) if (o.g.visible !== vis) o.g.visible = vis;
    if (w.lat0 !== this.lat0 || w.lon0 !== this.lon0) { this.lat0 = w.lat0; this.lon0 = w.lon0; this.rebuildAll(); }
    this.t1 -= dt; if (this.t1 <= 0) { this.t1 = 1; this.syncMine(); this.syncRemote(c.net().active ? c.net().remoteGarages() : []); c.net().setGarages(this.mine.map(pub)); }
    this.t2 -= dt; if (this.t2 <= 0) { // the ground may load after a garage appears: level it then, and keep the garage sitting on it
      this.t2 = 2;
      for (const o of this.objs.values()) {
        if (!o.flat) { const fl = w.flattenPad(o.key, o.x, o.z, o.yaw, PW, PD); if (fl) { o.flat = true; w.pruneTreesIn(this.polys(o.x, o.z, o.yaw).pad); } }
        const y = o.flat ? w.elev.at(o.x, o.z) : this.baseY(o.x, o.z, o.yaw);
        if (Math.abs(y - o.y) > 0.02) { o.y = y; o.g.position.y = y; for (const id of o.ids) { const ex = w.extraById.get(id); if (ex && !ex.noCollide) ex.top = y + (id.includes(':p') ? 1.7 : o.hh); } }
      }
    }
    for (const o of this.objs.values()) if (o.anim < 1) { o.anim = Math.min(1, o.anim + dt / 1.4); const e = 1 - Math.pow(1 - o.anim, 3); o.g.scale.y = Math.max(0.02, e); }
    // am I inside / near one of my garages? (drives the interior light and the pill)
    this.t3 -= dt; if (this.t3 <= 0) {
      this.t3 = 0.2; let near = null, inside = null, best = 1e9; const p = c.player(); this.nearO = null;
      if (c.mode() === 'world' && !c.spawning()) for (const o of this.objs.values()) if (o.own) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < best) { best = d; this.nearD = d; this.nearO = o; } if (this.insideOf(o, p.x, p.z)) inside = o.key; else if (d < 26) near = near || o.key; }
      if (this.shop) inside = this.shop.id;
      if (inside && c.mode() === 'world' && !c.spawning() && c.repair && c.repair()) { c.toast && c.toast('Your garage crew fixed up your car', 2200); }
      if (inside !== this.insideId || near !== this.nearId) { this.insideId = inside; this.nearId = near; this.drawUI(); }
    }
    // interior light: bright while you are inside, a soft glow while you are close
    const o = this.nearO && this.objs.get(this.nearO.key); let target = 0;
    if (o && c.mode() === 'world') { target = this.insideId === o.key ? 150 : (this.nearD < 30 ? 40 : 0); const [fx, fz] = this.toWorld(o, 0, ZBC); this.fill.position.set(fx, o.y + BH - 0.9, fz); }
    this.fill.intensity += (target - this.fill.intensity) * Math.min(1, dt * 5);
    if (this.busy && c.mode() !== 'world') this.cancel(true);
  }

  // ---------- build mode ----------
  canStart() {
    const c = this.c;
    if (c.mode() !== 'world' || c.spawning()) { c.toast('Start a World Drive to build a garage'); return false; }
    if (this.mine.length >= GARAGE_MAX) { c.toast(`You can have up to ${GARAGE_MAX} garages. Demolish one to build another.`, 3200); return false; }
    if (c.riding && c.riding()) { c.toast('Get out of the car you\'re riding in first'); return false; }
    return true;
  }
  listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    window[f]('pointerdown', this.onDown, true); window[f]('pointermove', this.onMove, true); window[f]('pointerup', this.onUp, true); window[f]('pointercancel', this.onUp, true);
    window[f]('wheel', this.onWheel, on ? { passive: false, capture: true } : { capture: true });
  }
  start() {
    if (this.busy || !this.canStart()) return;
    const c = this.c; c.closePause && c.closePause(); const p = c.player();
    this.building = true; this.sel = null; this.camInit = false; this.tgt.set(p.x, 0, p.z); this.h = 85; this.ptrs.clear();
    const nm = (c.driverName() || 'Driver'); this.nameVal = (nm.length <= 9 ? `${nm}'s Garage` : 'My Garage').slice(0, 18);
    this.listen(true); this.hl.visible = false; this.sig = ''; this.drawUI(); c.hudMsg && c.hudMsg('BUILD MODE', 900);
  }
  cancel(quiet) {
    if (this.shop) { this.leaveShop(quiet); return; }
    if (!this.building) return; this.building = false; this.sel = null; this.hl.visible = false; this.ptrs.clear(); this.listen(false);
    this.drawUI(); if (!quiet) this.c.toast('Garage building cancelled');
  }
  step(dt) { // runs instead of driving while building / in the workshop
    if (this.shop) { const p = this.c.player(); p.vx = 0; p.vz = 0; if (p.input) { p.input.throttle = 0; p.input.brake = 0; p.input.steer = 0; } p.sync && p.sync(0, 0, 0); return; }
    if (!this.building) return; const w = this.c.world;
    this.tgtY += (w.tileReady(this.tgt.x, this.tgt.z) ? w.elev.at(this.tgt.x, this.tgt.z) - this.tgtY : 0) * Math.min(1, dt * 5);
    if (this.sel) { this.sel.t = (this.sel.t || 0) - dt; if (this.sel.t <= 0) { this.sel.t = 0.5; this.validate(); } }
    this.updateHL(); const sig = this.uiSig(); if (sig !== this.sig) { this.sig = sig; this.drawUI(); }
  }
  // overhead camera while building, orbit camera inside the workshop; returns true while it owns the camera
  cameraStep(camera, dt) {
    if (this.shop) return this.shopCam(camera, dt);
    if (!this.building) return false;
    const a = 1.22, d = this.h, want = new THREE.Vector3(this.tgt.x, this.tgtY + d * Math.sin(a), this.tgt.z + d * Math.cos(a)), look = new THREE.Vector3(this.tgt.x, this.tgtY, this.tgt.z);
    if (!this.camInit) { this.camPos.copy(camera.position); this.camLook.copy(look); this.camInit = true; }
    const k = 1 - Math.exp(-dt * 7); this.camPos.lerp(want, k); this.camLook.lerp(look, k);
    camera.position.copy(this.camPos); camera.lookAt(this.camLook);
    if (camera.fov !== 55 || camera.near !== 0.5) { camera.fov = 55; camera.near = 0.5; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); return true;
  }

  // ---------- the workshop (inside your garage) ----------
  enter(key) { // park the car in the bay and open the workshop
    const o = this.objs.get(key || this.insideId || (this.nearO && this.nearO.key)), c = this.c;
    if (!o || !o.own) { c.toast('Drive to your garage first'); return; }
    if (c.mode() !== 'world' || c.spawning()) { c.toast('Start a World Drive first'); return; }
    if (c.riding && c.riding()) { c.toast('Get out of the car you\'re riding in first'); return; }
    if (this.busy) this.cancel(true); c.closePause && c.closePause();
    const [x, z] = this.toWorld(o, 0, ZBC); c.place(x, z, o.yaw); // nose towards the doorways
    this.shop = { id: o.key, a: 0.75, el: 0.2, r: 5.4, tab: this.shopTab || 'lights' }; this.camInit = false; this.vo = ''; this.ptrs.clear(); this.listen(true);
    document.body.classList.add('in-workshop'); this.ws.hidden = false; this.syncTabs(); this.c.renderGarage && this.c.renderGarage(); this.drawUI();
    c.hudMsg && c.hudMsg('YOUR GARAGE', 900);
  }
  leaveShop(quiet) {
    if (!this.shop) return; this.shop = null; this.ptrs.clear(); this.listen(false); this.ws.hidden = true; document.body.classList.remove('in-workshop');
    try { this.c.camera.clearViewOffset(); } catch { } this.vo = ''; this.drawUI(); if (!quiet) this.c.toast('Drive out when you are ready');
  }
  setTab(t) { if (!this.shop) return; this.shop.tab = this.shopTab = t; this.syncTabs(); this.c.renderGarage && this.c.renderGarage(); }
  syncTabs() { this.ws.querySelectorAll('[data-ws-tab]').forEach(b => b.classList.toggle('on', b.dataset.wsTab === (this.shop && this.shop.tab))); }
  shopCam(camera, dt) {
    const s = this.shop, o = this.objs.get(s.id); if (!o) { this.leaveShop(true); return false; }
    const p = this.c.player(), [cx, cz] = this.toLocal(o, p.x, p.z);
    const lx = Math.max(-PW / 2 + 0.9, Math.min(PW / 2 - 0.9, cx + s.r * Math.sin(s.a))), lz = Math.max(ZB0 + 0.9, Math.min(ZF - 0.6, cz + s.r * Math.cos(s.a))); // never outside the walls
    const [wx, wz] = this.toWorld(o, lx, lz), wy = Math.min(o.y + BH - 0.5, (p.y || o.y) + 0.9 + s.r * Math.sin(s.el)), look = new THREE.Vector3(p.x, (p.y || o.y) + 0.7, p.z), want = new THREE.Vector3(wx, wy, wz);
    if (!this.camInit) { this.camPos.copy(camera.position); this.camLook.copy(look); this.camInit = true; }
    const k = 1 - Math.exp(-dt * 8); this.camPos.lerp(want, k); this.camLook.lerp(look, k); camera.position.copy(this.camPos); camera.lookAt(this.camLook);
    // keep the car clear of the side panel: shift the picture left on wide screens, up on tall ones
    const W = window.innerWidth, H = window.innerHeight, narrow = W <= 760, sig = `${W}x${H}`;
    if (camera.fov !== 48 || camera.near !== 0.1 || this.vo !== sig) { camera.fov = 48; camera.near = 0.1; this.vo = sig; if (narrow) camera.setViewOffset(W, H, 0, H * 0.2, W, H); else camera.setViewOffset(W, H, W * 0.17, 0, W, H); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); return true;
  }
  makeWorkshop() {
    const ws = document.createElement('div'); ws.id = 'workshop'; ws.hidden = true;
    ws.innerHTML = `<div class="ws-head"><b>Your garage</b><button data-ws="exit">Done</button></div>
      <div class="ws-tabs"><button data-ws-tab="lights">Lights</button><button data-ws-tab="custom">Custom</button><button data-ws-tab="nitro">Nitro</button><button data-ws-tab="weapon">Weapon</button><button data-ws-tab="build">Building</button><button data-ws-tab="car">Car</button></div>
      <div class="ws-body" data-garage data-variant="workshop"></div><div class="ws-hint">Drag to look around · pinch or scroll to zoom · drive out when you are done</div>`;
    document.body.appendChild(ws); this.ws = ws; let last = -1e9;
    const h = e => {
      const b = e.target.closest && e.target.closest('[data-ws],[data-ws-tab]'); if (!b) return; e.preventDefault(); e.stopPropagation();
      if (e.type === 'click' && performance.now() - last < 700) return; if (e.type === 'pointerdown') last = performance.now();
      if (b.dataset.ws === 'exit') this.leaveShop(); else if (b.dataset.wsTab) this.setTab(b.dataset.wsTab);
    };
    ws.addEventListener('pointerdown', h); ws.addEventListener('click', h); ws.addEventListener('keydown', e => e.stopPropagation());
  }

  // ---------- pointer handling (mouse and touch) ----------
  ignore(e) { return !!(e.target && e.target.closest && e.target.closest('#garageUI,#workshop,#rideUI,#pause,button,input,textarea,select,a')); }
  pointerDown(e) {
    if (!this.busy || this.ignore(e)) return; e.preventDefault(); e.stopPropagation();
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); for (const p of this.ptrs.values()) p.moved = true; }
  }
  pointerMove(e) {
    const p = this.ptrs.get(e.pointerId); if (!this.busy || !p) return; e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 8) p.moved = true;
    if (this.ptrs.size >= 2) { const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d); this.pinch = d; return; }
    if (!p.moved) return;
    if (this.shop) { this.shop.a -= dx * 0.008; this.shop.el = Math.max(0.02, Math.min(0.9, this.shop.el + dy * 0.005)); return; } // drag = orbit the car
    const mpp = 2 * this.h * Math.tan(THREE.MathUtils.degToRad(55) / 2) / Math.max(1, window.innerHeight); // metres per pixel at the target
    this.pan(-dx * mpp, -dy * mpp / Math.sin(1.22));
  }
  pointerUp(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = 0;
    if (this.building && !p.moved && performance.now() - p.t0 < 700 && !this.ignore(e)) this.tap(e.clientX, e.clientY);
  }
  wheel(e) { if (!this.busy || this.ignore(e)) return; e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }
  pan(dx, dz) { // keep the camera within reach of the player so the streets stay loaded
    const p = this.c.player(); this.tgt.x += dx; this.tgt.z += dz; const ox = this.tgt.x - p.x, oz = this.tgt.z - p.z, d = Math.hypot(ox, oz), R = 230;
    if (d > R) { this.tgt.x = p.x + ox / d * R; this.tgt.z = p.z + oz / d * R; }
  }
  zoom(f) { if (this.shop) { this.shop.r = Math.max(3.2, Math.min(7.5, this.shop.r * f)); return; } this.h = Math.max(28, Math.min(190, this.h * f)); }

  // ---------- picking and validity ----------
  pick(cx, cy) {
    const cam = this.c.camera, r = this.c.canvas.getBoundingClientRect(), ndc = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1));
    cam.updateMatrixWorld(); this.ray.setFromCamera(ndc, cam);
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p = new THREE.Vector3(); let y = this.tgtY;
    for (let k = 0; k < 3; k++) { pl.constant = -y; if (!this.ray.ray.intersectPlane(pl, p)) return null; y = this.c.world.elev.at(p.x, p.z); if (!isFinite(y)) y = 0; }
    return { x: p.x, z: p.z, y };
  }
  inside(sel, x, z) { const dx = x - sel.x, dz = z - sel.z, s = Math.sin(sel.yaw), c = Math.cos(sel.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) <= PW / 2 && Math.abs(lz) <= PD / 2; }
  tap(cx, cy) {
    const p = this.pick(cx, cy); if (!p) return;
    if (this.sel && this.inside(this.sel, p.x, p.z)) { this.confirm(); return; } // tap the highlight again = build
    const w = this.c.world, x = snap(p.x, 1), z = snap(p.z, 1); let yaw = this.sel ? this.sel.yaw : 0;
    const rp = w.nearestRoadPoint(x, z, 90); if (rp) yaw = snap(Math.atan2(rp.x - x, rp.z - z), Math.PI / 12); // doors face the nearest road
    this.sel = { x, z, yaw, t: 0.5 }; this.validate(); this.c.audio && this.c.audio.click && this.c.audio.click();
  }
  validate() { const s = this.sel; if (!s) return; s.res = this.c.world.padFree(s.x, s.z, s.yaw, PW, PD); if (s.res.ok) { for (const o of this.objs.values()) if (Math.hypot(o.x - s.x, o.z - s.z) < 30) { s.res = { ok: false, reason: 'Too close to another garage' }; break; } } }
  rotate() { if (!this.sel) { this.c.toast('Tap the ground to pick a spot first'); return; } this.sel.yaw += Math.PI / 2; this.validate(); }
  afford() { return this.c.score() >= GARAGE_COST; }
  confirm() {
    const s = this.sel, c = this.c; if (!this.building) return;
    if (!s) { c.toast('Tap the ground to pick a spot first'); return; }
    this.validate(); if (!s.res.ok) { c.toast(s.res.reason, 2600); c.audio && c.audio.beep && c.audio.beep(false); return; }
    if (!this.afford()) { c.toast(`You need ${GARAGE_COST.toLocaleString()} points. You have ${c.score().toLocaleString()}.`, 3000); c.audio && c.audio.beep && c.audio.beep(false); return; }
    const [la, lo] = c.world.unproj(s.x, s.z), name = (this.nameVal || '').trim().slice(0, 18) || 'My Garage';
    const rec = { i: uid(), n: name, la: Math.round(la * 1e7) / 1e7, lo: Math.round(lo * 1e7) / 1e7, y: Math.round(s.yaw * 1000) / 1000, c: c.color(), t: Date.now() };
    c.spend(GARAGE_COST); this.mine.push(rec); this.save(); this.cancel(true); this.addObj('me:' + rec.i, rec, true, this.ownerName(), true);
    c.audio && c.audio.chime && c.audio.chime(6); c.shake && c.shake(0.3); c.hudMsg && c.hudMsg(`GARAGE BUILT · −${GARAGE_COST.toLocaleString()}`, 2200); c.toast(`${name} is open. Drive in to customize your car. Everyone in your session can see it.`, 3800);
  }
  addFloor(id) {
    const g = this.mine.find(x => x.i === id), c = this.c; if (!g) return;
    if (c.mode() !== 'world' || c.spawning()) { c.toast('Start a World Drive to add a floor'); return; }
    const f = floorsOf(g); if (f >= FLOORS_MAX) { c.toast(`${g.n} already has the most floors (${FLOORS_MAX})`); return; }
    if (c.score() < FLOOR_COST) { c.toast(`A floor costs ${FLOOR_COST.toLocaleString()} points. You have ${c.score().toLocaleString()}.`, 3000); c.audio && c.audio.beep && c.audio.beep(false); return; }
    c.spend(FLOOR_COST); g.f = f + 1; this.save(); this.syncMine();
    c.audio && c.audio.chime && c.audio.chime(5); c.shake && c.shake(0.2); c.hudMsg && c.hudMsg(`FLOOR ADDED · −${FLOOR_COST.toLocaleString()}`, 1800); c.toast(`${g.n} now has ${g.f} floors`, 2600); c.renderGarage && c.renderGarage();
  }
  async loadWalls() {
    for (const k of ['wo', 'wi']) { try { const a = await idbGet('wall:' + k); if (a && typeof a.data === 'string' && a.h) { this.walls[k] = a; this.c.net().setAsset(k, a); } } catch { } }
    this.c.renderGarage && this.c.renderGarage(); // the garages pick the pictures up on their next sync
  }
  makeFileInput() {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.hidden = true; document.body.appendChild(f); this.fileEl = f;
    f.addEventListener('change', async () => { const file = f.files[0], k = this.wallPick; f.value = ''; if (!file || !k) return; try { await this.setWall(k, file); } catch (e) { this.c.toast(String(e && e.message || e)); } });
  }
  async setWall(k, file) {
    const data = await imageToSkin(file, 512), a = { h: hashStr(data), m: {}, data };
    this.walls[k] = a; idbSet('wall:' + k, a); this.c.net().setAsset(k, a); this.syncMine();
    this.c.audio && this.c.audio.chime && this.c.audio.chime(4); this.c.toast(k === 'wo' ? 'Outside walls updated' : 'Inside walls updated'); this.c.renderGarage && this.c.renderGarage();
  }
  clearWall(k) { this.walls[k] = null; idbSet('wall:' + k, null); this.c.net().setAsset(k, null); this.syncMine(); this.c.renderGarage && this.c.renderGarage(); }
  floorsHtml(g) {
    const f = floorsOf(g), can = this.c.mode() === 'world' && !this.c.spawning(), full = f >= FLOORS_MAX;
    return `<div class="gx"><small>${f} floor${f > 1 ? 's' : ''} · ${full ? 'fully built' : `next floor ${FLOOR_COST.toLocaleString()} pts (you have ${this.c.score().toLocaleString()})`}</small></div>
      <div class="gx"><button class="ghost sm" data-gar-floor="${esc(g.i)}" ${full || !can ? 'disabled' : ''}>Add a floor · ${FLOOR_COST.toLocaleString()}</button></div>`;
  }
  wallsHtml() {
    const row = (k, title, sub) => { const a = this.walls[k]; return `<div class="cl-card"><div class="ic" ${a ? `style="background-image:url('${a.data}')"` : ''}>${a ? '' : '+'}</div><div class="tx"><b>${title}</b><small>${a ? 'On all your garages. Other players see it too.' : sub}</small>
      <div class="av-actions"><button class="ghost sm" data-gar-wall="${k}">${a ? 'Change picture' : 'Upload picture'}</button>${a ? `<button class="ghost sm" data-gar-wall-clear="${k}">Remove</button>` : ''}</div></div></div>`; };
    return `<div class="gsec"><h4>Wall pictures</h4>${row('wo', 'Outside walls', 'A photo or pattern for the outside of your garages')}${row('wi', 'Inside walls', 'A photo or pattern for the inside of your garages')}
      <p class="note">The picture repeats across the walls, about every 3 metres. It applies to all your garages.</p></div>`;
  }
  buildHtml() { // the workshop's Building tab
    const g = this.shop && this.mine.find(x => 'me:' + x.i === this.shop.id); if (!g) return '<p class="note">Drive into your garage to change the building.</p>';
    return `<div class="gsec"><h4>Floors <small>${floorsOf(g)} of ${FLOORS_MAX}</small></h4><div class="cl-card gcard"><div class="ic">+</div><div class="tx"><b>${esc(g.n)}</b>${this.floorsHtml(g)}</div></div>
      <p class="note">Each floor you add grows the building one storey upwards, and everyone in your session sees it.</p></div>` + this.wallsHtml();
  }
  rename(id, name) { const g = this.mine.find(x => x.i === id); if (!g) return; g.n = String(name || '').trim().slice(0, 18) || 'My Garage'; this.save(); this.syncMine(); }
  demolish(id) { const i = this.mine.findIndex(x => x.i === id); if (i < 0) return; if (this.shop && this.shop.id === 'me:' + id) this.leaveShop(true); const [g] = this.mine.splice(i, 1); this.save(); this.removeObj('me:' + id); this.c.toast(`${g.n} was demolished`); }

  // ---------- highlight ----------
  makeHighlight() {
    const g = new THREE.Group(), mat = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.hlFill = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), mat(OK)); this.hlFill.rotation.x = -Math.PI / 2; g.add(this.hlFill);
    const pts = [[-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]].map(([x, z]) => new THREE.Vector3(x, 0.05, z));
    this.hlLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: OK })); g.add(this.hlLine);
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(PW, BH, BLD_D), mat(OK)); ghost.material.opacity = 0.16; ghost.position.set(0, BH / 2, ZBC); g.add(ghost); this.hlGhost = ghost;
    this.hlEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({ color: OK })); this.hlEdges.position.copy(ghost.position); g.add(this.hlEdges);
    this.hlArrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 3), new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.9, depthWrite: false })); this.hlArrow.rotation.x = Math.PI / 2; this.hlArrow.position.set(0, 0.5, PD / 2 + 1.4); g.add(this.hlArrow);
    g.visible = false; g.renderOrder = 5; this.hl = g; this.c.scene.add(g);
  }
  updateHL() {
    const s = this.sel; if (!s) { this.hl.visible = false; return; }
    const y = (s.res && s.res.ok ? s.res.y : this.baseY(s.x, s.z, s.yaw)) + 0.25, col = !s.res ? WAIT : !s.res.ok ? BAD : this.afford() ? OK : WAIT, pulse = 0.28 + 0.1 * Math.sin(this.clock * 5);
    this.hl.visible = true; this.hl.position.set(s.x, y, s.z); this.hl.rotation.y = s.yaw;
    for (const m of [this.hlFill.material, this.hlLine.material, this.hlGhost.material, this.hlEdges.material, this.hlArrow.material]) m.color.set(col);
    this.hlFill.material.opacity = pulse;
  }

  // ---------- UI ----------
  makeUI() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.ui = document.createElement('div'); this.ui.id = 'garageUI'; document.body.appendChild(this.ui);
    let last = -1e9;
    const handle = e => {
      const b = e.target.closest && e.target.closest('[data-g]'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); if (e.type === 'click' && performance.now() - last < 700) return; if (e.type === 'pointerdown') last = performance.now();
      ({ ok: () => this.confirm(), cancel: () => this.cancel(), rot: () => this.rotate(), zin: () => this.zoom(0.75), zout: () => this.zoom(1.33), shop: () => this.enter(this.insideId), enter: () => this.enter(this.nearId) })[b.dataset.g]?.(); if (this.building) { this.sig = ''; }
    };
    this.ui.addEventListener('pointerdown', handle); this.ui.addEventListener('click', handle);
    this.ui.addEventListener('keydown', e => e.stopPropagation()); this.ui.addEventListener('input', e => { if (e.target.matches('[data-gname]')) this.nameVal = e.target.value.slice(0, 18); });
    // tap-to-build button on the right edge of the screen, under the bridge button
    const b = document.createElement('button'); b.className = 'gbtn'; b.hidden = true; b.id = 'garageBtn'; b.setAttribute('aria-label', `Build your own garage for ${GARAGE_COST.toLocaleString()} points`); b.title = 'Build a garage (H)';
    b.innerHTML = `<svg viewBox="0 0 32 20" aria-hidden="true"><path d="M2 9 16 2l14 7v10H2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 19v-7h14v7M9 14.2h14M9 16.6h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><b>GARAGE</b><small>${GARAGE_COST.toLocaleString()} pts</small>`;
    let lastB = -1e9;
    const press = e => { e.preventDefault(); e.stopPropagation(); if (e.type === 'click' && performance.now() - lastB < 700) return; if (e.type === 'pointerdown') lastB = performance.now(); this.c.audio && this.c.audio.init && this.c.audio.init(); this.start(); };
    b.addEventListener('pointerdown', press); b.addEventListener('click', press); document.body.appendChild(b); this.btn = b; this.btnShow = false; this.btnReady = null;
  }
  uiSig() { const s = this.sel; return [this.building, s ? (s.res ? (s.res.ok ? 1 : s.res.reason) : 0) : -1, this.afford(), this.c.score() >= GARAGE_COST ? 0 : this.c.score(), this.nearId].join('|'); }
  drawUI() {
    const c = this.c; let h = '';
    if (this.building) {
      const s = this.sel, ok = s && s.res && s.res.ok, pts = c.score(), can = this.afford();
      let msg, cls = '';
      if (!s) msg = 'Tap the ground to highlight a spot. Drag to look around, pinch or scroll to zoom.';
      else if (!s.res) msg = 'Checking the ground…';
      else if (!ok) { msg = s.res.reason; cls = 'bad'; }
      else if (!can) { msg = `Good spot, but you need ${(GARAGE_COST - pts).toLocaleString()} more points.`; cls = 'wait'; }
      else { msg = 'Looks good. The ground will be levelled to fit. Tap the highlight again, or press Build.'; cls = 'ok'; }
      h = `<div class="gbar"><div class="gt"><b>Build your garage</b><span class="gc">${pts.toLocaleString()} / ${GARAGE_COST.toLocaleString()} pts</span></div>
        <div class="gm ${cls}">${esc(msg)}</div>
        <input data-gname maxlength="18" placeholder="Garage name" value="${esc(this.nameVal)}" autocomplete="off">
        <div class="gr"><button data-g="rot">Rotate</button><button data-g="zin" aria-label="Zoom in">+</button><button data-g="zout" aria-label="Zoom out">−</button><button class="no" data-g="cancel">Cancel</button><button class="go" data-g="ok" ${ok && can ? '' : 'disabled'}>Build · ${GARAGE_COST.toLocaleString()}</button></div></div>`;
    } else if (this.shop) h = '';
    else if (this.insideId) h = `<button class="gpill" data-g="shop">Customize your car</button>`;
    else if (this.nearId) h = `<button class="gpill" data-g="enter">Enter your garage</button>`;
    const typing = this.ui.querySelector('[data-gname]') === document.activeElement;
    if (typing && this.building) { // don't rebuild the form under someone who is typing: only refresh the message and the buttons
      const m = this.ui.querySelector('.gm'), tmp = document.createElement('div'); tmp.innerHTML = h; const nm = tmp.querySelector('.gm'), nb = tmp.querySelector('.gr'), ob = this.ui.querySelector('.gr'), gt = tmp.querySelector('.gc');
      if (m && nm) { m.className = nm.className; m.textContent = nm.textContent; } if (nb && ob) ob.innerHTML = nb.innerHTML; const oc = this.ui.querySelector('.gc'); if (oc && gt) oc.textContent = gt.textContent; return;
    }
    this.ui.innerHTML = h;
  }

  // ---------- the Garage section of the pause menu ----------
  panelHtml() {
    const c = this.c, inWorld = c.mode() === 'world' && !c.spawning(), pts = c.score();
    let h = `<div class="gsec"><h4>Your garage</h4>`;
    for (const g of this.mine) {
      h += `<div class="cl-card gcard"><div class="ic">G</div><div class="tx"><b>${esc(g.n)}</b><small>${g.la.toFixed(4)}, ${g.lo.toFixed(4)} · drive in to customize · everyone in your session can see it</small>
        <div class="gx"><input data-gar-name="${esc(g.i)}" maxlength="18" value="${esc(g.n)}" aria-label="Garage name"></div>
        ${this.floorsHtml(g)}<div class="gx"><button class="ghost sm" data-gar-enter="${esc(g.i)}" ${inWorld && this.objs.has('me:' + g.i) ? '' : 'disabled'}>Enter garage</button><button class="ghost sm" data-gar-del="${esc(g.i)}">${this.delId === g.i ? 'Tap again to demolish' : 'Demolish'}</button></div></div></div>`;
    }
    if (this.mine.length < GARAGE_MAX) {
      const sub = inWorld ? `${pts.toLocaleString()} of ${GARAGE_COST.toLocaleString()} points this drive` : 'Start a World Drive, earn the points, then build it from here';
      h += `<div class="cl-card gcard"><div class="ic">+</div><div class="tx"><b>Build a garage · ${GARAGE_COST.toLocaleString()} pts</b><small>${esc(sub)}</small>
        <div class="av-actions"><button class="ghost sm" data-gar-build ${inWorld ? '' : 'disabled'}>Pick a spot</button></div></div></div>`;
    }
    return h + `<p class="note">You choose the spot: the camera goes overhead, you tap the ground to highlight it, then tap again to build. The ground is levelled and the garage is open: drive in to customize your custom car and its lights. Garages are saved on this device and show to every player in your session. You can own up to ${GARAGE_MAX}. Driving into your garage repairs your car.</p></div>` + (this.mine.length ? this.wallsHtml() : '');
  }
  bindPanel(el, rerender) {
    el.querySelectorAll('[data-gar-build]').forEach(b => b.onclick = () => this.start());
    el.querySelectorAll('[data-gar-floor]').forEach(b => b.onclick = () => this.addFloor(b.dataset.garFloor));
    el.querySelectorAll('[data-gar-wall]').forEach(b => b.onclick = () => { this.wallPick = b.dataset.garWall; this.fileEl.click(); });
    el.querySelectorAll('[data-gar-wall-clear]').forEach(b => b.onclick = () => this.clearWall(b.dataset.garWallClear));
    el.querySelectorAll('[data-gar-enter]').forEach(b => b.onclick = () => this.enter('me:' + b.dataset.garEnter));
    el.querySelectorAll('[data-gar-name]').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.onchange = () => { this.rename(i.dataset.garName, i.value); rerender(); }; });
    el.querySelectorAll('[data-gar-del]').forEach(b => b.onclick = () => { const id = b.dataset.garDel; if (this.delId === id) { this.delId = null; this.demolish(id); rerender(); } else { this.delId = id; clearTimeout(this.delT); this.delT = setTimeout(() => { this.delId = null; rerender(); }, 4000); rerender(); } });
  }
  reset() { this.cancel(true); }
}
