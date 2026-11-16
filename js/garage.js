import * as THREE from 'three';

// Player-built garages.
//  - Build mode: the camera lifts overhead. Tap the ground to highlight a spot, tap the highlight again (or press Build) to build it.
//  - Costs GARAGE_COST points. Garages are saved on this device and shared with everyone in the multiplayer session.
//  - The garage is a solid building (cars collide with it) with a named sign, roll-up doors and a forecourt.

export const GARAGE_COST = 10000, GARAGE_MAX = 3;
export const PW = 14, PD = 11;           // pad: width x depth in metres (front of the garage faces local +Z)
const BLD_D = 8, BH = 5.2;               // the building itself takes the back 8 m of the pad, the front 3 m is the forecourt
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
.gcard small{display:block;opacity:.75;margin-top:2px}.gcard .gx{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.gcard input{flex:1 1 140px;min-width:0}`;

// ---------- the garage building ----------
let SH = null;
function shared() {
  if (SH) return SH;
  const slat = document.createElement('canvas'); slat.width = slat.height = 256; const x = slat.getContext('2d');
  x.fillStyle = '#d3d7de'; x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, y, 256, 3); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, y + 3, 256, 2); }
  x.fillStyle = '#20232b'; for (let i = 0; i < 4; i++) x.fillRect(30 + i * 52, 22, 40, 14); // small window strip
  const door = new THREE.CanvasTexture(slat); door.colorSpace = THREE.SRGBColorSpace; door.anisotropy = 4;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o });
  SH = {
    box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(0.28, 0.7, 10), drum: new THREE.CylinderGeometry(0.42, 0.42, 0.95, 14), plane: new THREE.PlaneGeometry(1, 1),
    slab: std('#7b8088', { roughness: 0.95 }), apron: std('#4b4f56', { roughness: 0.95 }), wall: std('#d9dce1'), plinth: std('#6d737b'), roof: std('#34373e', { roughness: 0.9 }), dark: std('#1b1d23'),
    frame: std('#2a2d35', { metalness: 0.3 }), door: new THREE.MeshStandardMaterial({ map: door, roughness: 0.5, metalness: 0.35 }),
    glass: std('#6fa6c9', { roughness: 0.1, metalness: 0.6, emissive: '#2a4a63', emissiveIntensity: 0.5 }), lamp: std('#fff2c4', { emissive: '#ffe08a', emissiveIntensity: 1.4 }),
    cone2: std('#ff7a1a'), white: std('#f2f2f2'), drumA: std('#2e6bd1', { metalness: 0.4 }), drumB: std('#c94a3d', { metalness: 0.4 }), metal: std('#9aa0a8', { metalness: 0.7, roughness: 0.4 }),
  };
  return SH;
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
// Local frame: origin at the pad centre on the ground, front (forecourt, doors) towards +Z.
export function buildExterior(rec, ownerName) {
  const S = shared(), g = new THREE.Group(), zb = -PD / 2 + BLD_D / 2, zf = -PD / 2 + BLD_D; // building centre z, front wall z
  const put = (geo, mat, x, y, z, sx, sy, sz, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = false; g.add(m); return m; };
  const accent = new THREE.MeshStandardMaterial({ color: rec.c || '#ff5a3c', roughness: 0.5, emissive: rec.c || '#ff5a3c', emissiveIntensity: 0.18 });
  put(S.box, S.slab, 0, 0.1, zb, PW, 0.2, BLD_D, false); put(S.box, S.apron, 0, 0.1, zf + (PD - BLD_D) / 2, PW, 0.2, PD - BLD_D, false);
  put(S.box, S.wall, 0, 0.2 + BH / 2, zb, PW - 0.4, BH, BLD_D - 0.2); put(S.box, S.plinth, 0, 0.55, zb, PW - 0.3, 0.7, BLD_D - 0.1); put(S.box, accent, 0, 3.7, zb, PW - 0.3, 0.38, BLD_D - 0.1);
  // roof, parapet, air-con unit
  const rt = 0.2 + BH; put(S.box, S.roof, 0, rt + 0.15, zb, PW + 0.2, 0.3, BLD_D + 0.2);
  put(S.box, S.wall, 0, rt + 0.5, zb - BLD_D / 2 - 0.05, PW + 0.2, 0.5, 0.2); put(S.box, S.wall, -PW / 2 - 0.05, rt + 0.5, zb, 0.2, 0.5, BLD_D + 0.2); put(S.box, S.wall, PW / 2 + 0.05, rt + 0.5, zb, 0.2, 0.5, BLD_D + 0.2);
  put(S.box, S.metal, 4.2, rt + 0.9, zb - 1.5, 1.8, 0.9, 1.3); put(S.box, S.dark, 4.2, rt + 1.38, zb - 1.5, 1.2, 0.06, 0.9);
  // two roll-up doors with a pedestrian door between them
  for (const sx of [-3.7, 3.7]) {
    put(S.box, S.frame, sx, 0.2 + 1.95, zf + 0.02, 5.0, 3.9, 0.22);
    const d = put(S.plane, S.door, sx, 0.2 + 1.85, zf + 0.15, 4.6, 3.6, 1, false); d.material = S.door;
    put(S.box, S.lamp, sx, 4.35, zf + 0.25, 0.7, 0.22, 0.3, false);
  }
  put(S.box, S.frame, 0, 0.2 + 1.15, zf + 0.05, 1.3, 2.3, 0.2); put(S.box, S.glass, 0, 0.2 + 1.5, zf + 0.17, 0.7, 0.9, 0.06, false);
  // side windows
  for (const sx of [-1, 1]) for (const dz of [-1.9, 1.5]) put(S.box, S.glass, sx * (PW / 2 - 0.12), 2.7, zb + dz, 0.12, 1.1, 1.6, false);
  // sign on the roof
  const tex = signTexture(rec.n, ownerName, rec.c || '#ff5a3c');
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.6 });
  for (const sx of [-4.4, 4.4]) put(S.box, S.dark, sx, rt + 0.8, zf - 0.6, 0.18, 1.2, 0.18);
  const sign = new THREE.Mesh(S.box, [S.dark, S.dark, S.dark, S.dark, face, S.dark]); sign.position.set(0, rt + 1.9, zf - 0.6); sign.scale.set(10.5, 1.9, 0.26); sign.castShadow = true; g.add(sign);
  // forecourt dressing
  for (const [x, z] of [[-6.2, zf + 2.4], [6.2, zf + 2.4], [-1.2, zf + 2.8]]) put(S.cone, S.cone2, x, 0.55, z, 1, 1, 1);
  put(S.drum, S.drumA, -6.4, 0.68, zb + BLD_D / 2 + 0.6, 1, 1, 1); put(S.drum, S.drumB, -5.5, 0.68, zb + BLD_D / 2 + 0.7, 1, 1, 1);
  // parking bay lines on the forecourt
  for (const sx of [-6.4, -1.0, 1.0, 6.4]) put(S.box, S.white, sx, 0.22, zf + (PD - BLD_D) / 2, 0.12, 0.03, PD - BLD_D - 0.6, false);
  g.userData = { tex, face, accent, dispose() { tex.dispose(); face.dispose(); accent.dispose(); } };
  return g;
}

export class GarageSystem {
  // c: { scene, camera, canvas, world, net(), toast, hudMsg, audio, score(), spend(n), player(), mode(), paused(), spawning(), driverName(), color(), openGarage(), closePause(), shake(n), onChange() }
  constructor(c) {
    this.c = c; this.mine = this.load(); this.objs = new Map(); this.building = false; this.sel = null; this.nameVal = ''; this.lat0 = null; this.lon0 = null;
    this.tgt = new THREE.Vector3(); this.tgtY = 0; this.h = 90; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camInit = false;
    this.ptrs = new Map(); this.pinch = 0; this.ray = new THREE.Raycaster(); this.t1 = 0; this.t2 = 0; this.t3 = 0; this.sig = ''; this.delId = null; this.nearId = null; this.clock = 0;
    this.makeHighlight(); this.makeUI();
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e); this.onWheel = e => this.wheel(e);
  }

  // ---------- saved garages ----------
  load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(g => g && isFinite(g.la) && isFinite(g.lo)).slice(0, GARAGE_MAX) : []; } catch { return []; } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.mine)); } catch { } this.c.net().setGarages(this.mine.map(g => ({ i: g.i, n: g.n, la: g.la, lo: g.lo, y: g.y, c: g.c }))); this.c.onChange && this.c.onChange(); }

  // ---------- 3D objects (mine and everyone else's) ----------
  ownerName() { return this.c.driverName(); }
  pos(rec) { const [x, z] = this.c.world.proj(rec.la, rec.lo); return [x, z]; }
  baseY(x, z, yaw) {
    const e = this.c.world.elev, s = Math.sin(yaw), co = Math.cos(yaw); let h = -1e9;
    for (const [lx, lz] of [[0, 0], [-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]]) h = Math.max(h, e.at(x + lx * co + lz * s, z - lx * s + lz * co));
    return isFinite(h) ? h : 0;
  }
  polys(x, z, yaw) {
    const s = Math.sin(yaw), co = Math.cos(yaw), toW = (lx, lz) => [x + lx * co + lz * s, z - lx * s + lz * co], zb0 = -PD / 2, zb1 = -PD / 2 + BLD_D;
    return { bld: [toW(-PW / 2, zb0), toW(PW / 2, zb0), toW(PW / 2, zb1), toW(-PW / 2, zb1)], pad: [toW(-PW / 2 - 1.5, -PD / 2 - 1.5), toW(PW / 2 + 1.5, -PD / 2 - 1.5), toW(PW / 2 + 1.5, PD / 2 + 1.5), toW(-PW / 2 - 1.5, PD / 2 + 1.5)] };
  }
  addObj(key, rec, own, ownerName, anim = false) {
    this.removeObj(key); const w = this.c.world, [x, z] = this.pos(rec), yaw = rec.y || 0, g = buildExterior(rec, ownerName), y = this.baseY(x, z, yaw);
    g.position.set(x, y, z); g.rotation.y = yaw; if (anim) g.scale.y = 0.02; this.c.scene.add(g);
    const P = this.polys(x, z, yaw); w.addExtra({ id: key, poly: P.bld, top: y + BH + 0.6 }); w.addExtra({ id: key + ':pad', poly: P.pad, noCollide: true });
    w.pruneTreesIn(P.pad);
    this.objs.set(key, { key, rec, own, ownerName, g, x, z, y, yaw, anim: anim ? 0 : 1, sigName: rec.n + '|' + rec.c + '|' + ownerName });
  }
  removeObj(key) {
    const o = this.objs.get(key); if (!o) return; this.objs.delete(key); this.c.scene.remove(o.g); o.g.userData.dispose && o.g.userData.dispose();
    this.c.world.removeExtra(key); this.c.world.removeExtra(key + ':pad');
  }
  rebuildAll() { // after the world's origin changed (a different place)
    for (const k of [...this.objs.keys()]) this.removeObj(k);
    this.syncMine(); this.syncRemote(this.c.net().active ? this.c.net().remoteGarages() : [], true);
  }
  syncMine() {
    const want = new Set(this.mine.map(g => 'me:' + g.i));
    for (const k of [...this.objs.keys()]) if (k.startsWith('me:') && !want.has(k)) this.removeObj(k);
    for (const g of this.mine) { const k = 'me:' + g.i, o = this.objs.get(k), nm = this.ownerName(); if (!o || o.sigName !== g.n + '|' + g.c + '|' + nm) this.addObj(k, g, true, nm); else o.rec = g; }
  }
  syncRemote(list, force = false) {
    const want = new Map(); for (const r of list) want.set(r.o + ':' + r.i, r);
    for (const k of [...this.objs.keys()]) if (!k.startsWith('me:') && !want.has(k)) this.removeObj(k);
    for (const [k, r] of want) {
      const o = this.objs.get(k), sg = r.n + '|' + r.c + '|' + (r.on || ''), mv = o && (Math.abs(o.rec.la - r.la) > 1e-6 || Math.abs(o.rec.lo - r.lo) > 1e-6 || Math.abs((o.rec.y || 0) - (r.y || 0)) > 1e-3);
      if (!o || force || o.sigName !== sg || mv) { const fresh = !o && !force; this.addObj(k, r, false, r.on || '', fresh); }
    }
  }

  // ---------- per-frame ----------
  update(dt) {
    const c = this.c, w = c.world; this.clock += dt;
    if (w.lat0 == null || !isFinite(w.lat0)) return; // no place loaded yet
    const vis = c.mode() === 'world'; // garages only exist in World Drive (not in story races or the menu)
    for (const o of this.objs.values()) if (o.g.visible !== vis) o.g.visible = vis;
    if (w.lat0 !== this.lat0 || w.lon0 !== this.lon0) { this.lat0 = w.lat0; this.lon0 = w.lon0; this.rebuildAll(); }
    this.t1 -= dt; if (this.t1 <= 0) { this.t1 = 1; this.syncMine(); this.syncRemote(c.net().active ? c.net().remoteGarages() : []); c.net().setGarages(this.mine.map(g => ({ i: g.i, n: g.n, la: g.la, lo: g.lo, y: g.y, c: g.c }))); }
    this.t2 -= dt; if (this.t2 <= 0) { // terrain may load after a garage appears: keep it sitting on the ground
      this.t2 = 2; for (const o of this.objs.values()) { const y = this.baseY(o.x, o.z, o.yaw); if (Math.abs(y - o.y) > 0.05) { o.y = y; o.g.position.y = y; const ex = w.extraById.get(o.key); if (ex) ex.top = y + BH + 0.6; } }
    }
    for (const o of this.objs.values()) if (o.anim < 1) { o.anim = Math.min(1, o.anim + dt / 1.4); const e = 1 - Math.pow(1 - o.anim, 3); o.g.scale.y = Math.max(0.02, e); }
    // "Open garage" pill near one of my garages
    this.t3 -= dt; if (this.t3 <= 0) {
      this.t3 = 0.3; let near = null; const p = c.player();
      if (c.mode() === 'world' && !c.paused() && !this.building && !c.spawning()) for (const o of this.objs.values()) if (o.own && Math.hypot(o.x - p.x, o.z - p.z) < 24) { near = o.key; break; }
      if (near !== this.nearId) { this.nearId = near; this.drawUI(); }
    }
    if (this.building && c.mode() !== 'world') this.cancel(true);
  }

  // ---------- build mode ----------
  canStart() {
    const c = this.c;
    if (c.mode() !== 'world' || c.spawning()) { c.toast('Start a World Drive to build a garage'); return false; }
    if (this.mine.length >= GARAGE_MAX) { c.toast(`You can have up to ${GARAGE_MAX} garages. Demolish one to build another.`, 3200); return false; }
    if (c.riding && c.riding()) { c.toast('Get out of the car you\'re riding in first'); return false; }
    return true;
  }
  start() {
    if (this.building || !this.canStart()) return;
    const c = this.c; c.closePause && c.closePause(); const p = c.player();
    this.building = true; this.sel = null; this.camInit = false; this.tgt.set(p.x, 0, p.z); this.h = 85; this.ptrs.clear();
    const nm = (c.driverName() || 'Driver'); this.nameVal = (nm.length <= 9 ? `${nm}'s Garage` : 'My Garage').slice(0, 18);
    window.addEventListener('pointerdown', this.onDown, true); window.addEventListener('pointermove', this.onMove, true); window.addEventListener('pointerup', this.onUp, true); window.addEventListener('pointercancel', this.onUp, true);
    window.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    this.hl.visible = false; this.sig = ''; this.drawUI(); c.hudMsg && c.hudMsg('BUILD MODE', 900);
  }
  cancel(quiet) {
    if (!this.building) return; this.building = false; this.sel = null; this.hl.visible = false; this.ptrs.clear();
    window.removeEventListener('pointerdown', this.onDown, true); window.removeEventListener('pointermove', this.onMove, true); window.removeEventListener('pointerup', this.onUp, true); window.removeEventListener('pointercancel', this.onUp, true);
    window.removeEventListener('wheel', this.onWheel, { capture: true });
    this.drawUI(); if (!quiet) this.c.toast('Garage building cancelled');
  }
  step(dt) { // runs instead of driving while building
    if (!this.building) return; const w = this.c.world;
    this.tgtY += (w.tileReady(this.tgt.x, this.tgt.z) ? w.elev.at(this.tgt.x, this.tgt.z) - this.tgtY : 0) * Math.min(1, dt * 5);
    if (this.sel) { this.sel.t = (this.sel.t || 0) - dt; if (this.sel.t <= 0) { this.sel.t = 0.5; this.validate(); } }
    this.updateHL(); const sig = this.uiSig(); if (sig !== this.sig) { this.sig = sig; this.drawUI(); }
  }
  // overhead camera; returns true while it owns the camera
  cameraStep(camera, dt) {
    if (!this.building) return false;
    const a = 1.22, d = this.h, want = new THREE.Vector3(this.tgt.x, this.tgtY + d * Math.sin(a), this.tgt.z + d * Math.cos(a)), look = new THREE.Vector3(this.tgt.x, this.tgtY, this.tgt.z);
    if (!this.camInit) { this.camPos.copy(camera.position); this.camLook.copy(look); this.camInit = true; }
    const k = 1 - Math.exp(-dt * 7); this.camPos.lerp(want, k); this.camLook.lerp(look, k);
    camera.position.copy(this.camPos); camera.lookAt(this.camLook);
    if (camera.fov !== 55 || camera.near !== 0.5) { camera.fov = 55; camera.near = 0.5; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); return true;
  }

  // ---------- pointer handling (mouse and touch) ----------
  ignore(e) { return !!(e.target && e.target.closest && e.target.closest('#garageUI,#rideUI,#pause,button,input,textarea,select,a')); }
  pointerDown(e) {
    if (!this.building || this.ignore(e)) return; e.preventDefault(); e.stopPropagation();
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); for (const p of this.ptrs.values()) p.moved = true; }
  }
  pointerMove(e) {
    const p = this.ptrs.get(e.pointerId); if (!this.building || !p) return; e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 8) p.moved = true;
    if (this.ptrs.size >= 2) { const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d); this.pinch = d; return; }
    if (!p.moved) return;
    const mpp = 2 * this.h * Math.tan(THREE.MathUtils.degToRad(55) / 2) / Math.max(1, window.innerHeight); // metres per pixel at the target
    this.pan(-dx * mpp, -dy * mpp / Math.sin(1.22));
  }
  pointerUp(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId); if (this.ptrs.size < 2) this.pinch = 0;
    if (this.building && !p.moved && performance.now() - p.t0 < 700 && !this.ignore(e)) this.tap(e.clientX, e.clientY);
  }
  wheel(e) { if (!this.building || this.ignore(e)) return; e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }
  pan(dx, dz) { // keep the camera within reach of the player so the streets stay loaded
    const p = this.c.player(); this.tgt.x += dx; this.tgt.z += dz; const ox = this.tgt.x - p.x, oz = this.tgt.z - p.z, d = Math.hypot(ox, oz), R = 230;
    if (d > R) { this.tgt.x = p.x + ox / d * R; this.tgt.z = p.z + oz / d * R; }
  }
  zoom(f) { this.h = Math.max(28, Math.min(190, this.h * f)); }

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
  validate() { const s = this.sel; if (!s) return; s.res = this.c.world.padFree(s.x, s.z, s.yaw, PW, PD); if (s.res.ok) { for (const o of this.objs.values()) if (Math.hypot(o.x - s.x, o.z - s.z) < 15) { s.res = { ok: false, reason: 'Too close to another garage' }; break; } } }
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
    c.audio && c.audio.chime && c.audio.chime(6); c.shake && c.shake(0.3); c.hudMsg && c.hudMsg(`GARAGE BUILT · −${GARAGE_COST.toLocaleString()}`, 2200); c.toast(`${name} is open. Everyone in your session can see it.`, 3200);
  }
  rename(id, name) { const g = this.mine.find(x => x.i === id); if (!g) return; g.n = String(name || '').trim().slice(0, 18) || 'My Garage'; this.save(); this.syncMine(); }
  demolish(id) { const i = this.mine.findIndex(x => x.i === id); if (i < 0) return; const [g] = this.mine.splice(i, 1); this.save(); this.removeObj('me:' + id); this.c.toast(`${g.n} was demolished`); }

  // ---------- highlight ----------
  makeHighlight() {
    const g = new THREE.Group(), mat = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.hlFill = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), mat(OK)); this.hlFill.rotation.x = -Math.PI / 2; g.add(this.hlFill);
    const pts = [[-PW / 2, -PD / 2], [PW / 2, -PD / 2], [PW / 2, PD / 2], [-PW / 2, PD / 2]].map(([x, z]) => new THREE.Vector3(x, 0.05, z));
    this.hlLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: OK })); g.add(this.hlLine);
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(PW, BH, BLD_D), mat(OK)); ghost.material.opacity = 0.16; ghost.position.set(0, BH / 2, -PD / 2 + BLD_D / 2); g.add(ghost); this.hlGhost = ghost;
    this.hlEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({ color: OK })); this.hlEdges.position.copy(ghost.position); g.add(this.hlEdges);
    this.hlArrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 3), new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.9, depthWrite: false })); this.hlArrow.rotation.x = Math.PI / 2; this.hlArrow.position.set(0, 0.5, PD / 2 + 1.4); g.add(this.hlArrow);
    g.visible = false; g.renderOrder = 5; this.hl = g; this.c.scene.add(g);
  }
  updateHL() {
    const s = this.sel; if (!s) { this.hl.visible = false; return; }
    const y = this.baseY(s.x, s.z, s.yaw) + 0.25, col = !s.res ? WAIT : !s.res.ok ? BAD : this.afford() ? OK : WAIT, pulse = 0.28 + 0.1 * Math.sin(this.clock * 5);
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
      ({ ok: () => this.confirm(), cancel: () => this.cancel(), rot: () => this.rotate(), zin: () => this.zoom(0.75), zout: () => this.zoom(1.33), open: () => this.c.openGarage() })[b.dataset.g]?.(); if (this.building) { this.sig = ''; }
    };
    this.ui.addEventListener('pointerdown', handle); this.ui.addEventListener('click', handle);
    this.ui.addEventListener('keydown', e => e.stopPropagation()); this.ui.addEventListener('input', e => { if (e.target.matches('[data-gname]')) this.nameVal = e.target.value.slice(0, 18); });
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
      else { msg = 'Looks good. Tap the highlight again, or press Build.'; cls = 'ok'; }
      h = `<div class="gbar"><div class="gt"><b>Build your garage</b><span class="gc">${pts.toLocaleString()} / ${GARAGE_COST.toLocaleString()} pts</span></div>
        <div class="gm ${cls}">${esc(msg)}</div>
        <input data-gname maxlength="18" placeholder="Garage name" value="${esc(this.nameVal)}" autocomplete="off">
        <div class="gr"><button data-g="rot">Rotate</button><button data-g="zin" aria-label="Zoom in">+</button><button data-g="zout" aria-label="Zoom out">−</button><button class="no" data-g="cancel">Cancel</button><button class="go" data-g="ok" ${ok && can ? '' : 'disabled'}>Build · ${GARAGE_COST.toLocaleString()}</button></div></div>`;
    } else if (this.nearId) h = `<button class="gpill" data-g="open">Open your garage</button>`;
    const typing = this.ui.querySelector('[data-gname]') === document.activeElement;
    if (typing && this.building) { // don't rebuild the form under someone who is typing: only refresh the message and the buttons
      const m = this.ui.querySelector('.gm'), tmp = document.createElement('div'); tmp.innerHTML = h; const nm = tmp.querySelector('.gm'), nb = tmp.querySelector('.gr'), ob = this.ui.querySelector('.gr'), gt = tmp.querySelector('.gc');
      if (m && nm) { m.className = nm.className; m.textContent = nm.textContent; } if (nb && ob) ob.innerHTML = nb.innerHTML; const oc = this.ui.querySelector('.gc'); if (oc && gt) oc.textContent = gt.textContent; return;
    }
    this.ui.innerHTML = h;
  }

  // ---------- the Garage tab section ----------
  panelHtml() {
    const c = this.c, inWorld = c.mode() === 'world' && !c.spawning(), pts = c.score();
    let h = `<div class="gsec"><h4>Your garage</h4>`;
    for (const g of this.mine) {
      h += `<div class="cl-card gcard"><div class="ic">G</div><div class="tx"><b>${esc(g.n)}</b><small>${g.la.toFixed(4)}, ${g.lo.toFixed(4)} · everyone in your session can see it</small>
        <div class="gx"><input data-gar-name="${esc(g.i)}" maxlength="18" value="${esc(g.n)}" aria-label="Garage name"><button class="ghost sm" data-gar-del="${esc(g.i)}">${this.delId === g.i ? 'Tap again to demolish' : 'Demolish'}</button></div></div></div>`;
    }
    if (this.mine.length < GARAGE_MAX) {
      const sub = inWorld ? `${pts.toLocaleString()} of ${GARAGE_COST.toLocaleString()} points this drive` : 'Start a World Drive, earn the points, then build it from here';
      h += `<div class="cl-card gcard"><div class="ic">+</div><div class="tx"><b>Build a garage · ${GARAGE_COST.toLocaleString()} pts</b><small>${esc(sub)}</small>
        <div class="av-actions"><button class="ghost sm" data-gar-build ${inWorld ? '' : 'disabled'}>Pick a spot</button></div></div></div>`;
    }
    return h + `<p class="note">You choose the spot: the camera goes overhead, you tap the ground to highlight it, then tap again to build. Garages are saved on this device and show to every player in your multiplayer session. You can own up to ${GARAGE_MAX}.</p></div>`;
  }
  bindPanel(el, rerender) {
    el.querySelectorAll('[data-gar-build]').forEach(b => b.onclick = () => this.start());
    el.querySelectorAll('[data-gar-name]').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.onchange = () => { this.rename(i.dataset.garName, i.value); rerender(); }; });
    el.querySelectorAll('[data-gar-del]').forEach(b => b.onclick = () => { const id = b.dataset.garDel; if (this.delId === id) { this.delId = null; this.demolish(id); rerender(); } else { this.delId = id; clearTimeout(this.delT); this.delT = setTimeout(() => { this.delId = null; rerender(); }, 4000); rerender(); } });
  }
  reset() { this.cancel(true); }
}
