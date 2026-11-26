import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFedCar, animateFedCar } from './fedcar.js';
import { buildJet, buildSub } from './x9models.js';

// The Federation's patrols: Falcon X9 stealth jets and Triton X9 jet subs that roam round every town whose carrier is still up.
// Never more than two jets (or two subs) within 4 miles of each other. They're a bit quicker than the airliners and your
// sub, but they don't take much to bring down. When their town is liberated the survivors pull out.
const JET_URL = new URL('../models/federation_jet.glb', import.meta.url).href, SUB_URL = new URL('../models/federation_sub.glb', import.meta.url).href;
export const JET = { scale: 2.4, hp: 80, speed: 105, attack: 118, turn: 0.75, pts: 750, r: 8 };   // 17.5 m long, like a real fighter
export const SUBX = { scale: 2.2, hp: 90, speed: 16, attack: 19.5, turn: 0.55, pts: 750, r: 6.5 }; // 13 m long
export const CARX = { hp: 70, speed: 20, attack: 33, pts: 500, r: 3.2 }; // Thrust X-9 jet cars: drive the roads, chase you down when you're armed
const CARS_PER_AREA = 2;
const SPACING = 6437; // 4 miles
const PER_AREA = 2;
const JETS_PER_AREA = 4; // more jets around each carrier (they take turns: never more than MAX_DIVING diving at you at once)
const MAX_DIVING = 2;

const cache = {};
// load once and bake the static parts into one mesh per material
function loadBaked(url, keepRe) {
  if (cache[url]) return cache[url];
  return cache[url] = new GLTFLoader().loadAsync(url).then(g => {
    const root = g.scene; root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), groups = new Map(), drop = [];
    root.traverse(o => {
      if (!o.isMesh) return; for (let p = o; p && p !== root; p = p.parent) if (keepRe && keepRe.test(p.name || '')) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(geo); drop.push(o);
    });
    for (const o of drop) o.parent && o.parent.remove(o);
    for (const [mat, list] of groups) { const geo = list.length > 1 ? mergeGeometries(list, false) : list[0]; if (geo) root.add(new THREE.Mesh(geo, mat)); }
    root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return root;
  });
}

export class FedForces {
  constructor(scene, world, opts) { this.scene = scene; this.world = world; this.o = opts; this.units = []; this._v = new THREE.Vector3(); this.t = 0; this.jetT = null; this.subT = null; this.loading = false; }
  load() {
    if (this.loading) return; this.loading = true;
    // built in code from the FALCON X-9 / TRITON X-9 designs (no model files to download)
    try { this.jetT = buildJet(); } catch (e) { console.warn('[federation] jet model:', e); }
    try { this.subT = buildSub(); } catch (e) { console.warn('[federation] sub model:', e); }
  }
  near(kind, x, z) { let n = 0; for (const u of this.units) if (u.kind === kind && u.state !== 'dying' && Math.hypot(u.x - x, u.z - z) < SPACING) n++; return n; }
  clear() { for (const u of [...this.units]) this.remove(u); }
  remove(u) { const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); this.scene.remove(u.obj); if (u.bar) { this.scene.remove(u.bar); u.bar.material.map.dispose(); u.bar.material.dispose(); } }
  // keep each live carrier's area patrolled
  muster(carriers, dt) {
    this.load(); this.t += dt;
    for (const c of carriers) {
      if (c.state !== 'alive') continue;
      if ((c.musterT = (c.musterT || 0) - dt) > 0) continue; c.musterT = this.near('jet', c.outer.position.x, c.outer.position.z) < 2 ? 4 : 10; // the first two come quickly, reinforcements every 10 s
      const cx = c.outer.position.x, cz = c.outer.position.z;
      if (this.jetT && this.near('jet', cx, cz) < JETS_PER_AREA) this.spawnJet(c);
      if (this.subT && this.near('sub', cx, cz) < PER_AREA) this.spawnSub(c);
      if (this.near('car', cx, cz) < CARS_PER_AREA) this.spawnCar(c);
    }
  }
  make(tpl, kind, scale) {
    const obj = new THREE.Group(), body = tpl.clone(true); body.scale.setScalar(scale); obj.add(body); this.scene.add(obj);
    const rotors = []; body.traverse(o => { if (/Impeller_Rotor|Compressor_Fan/.test(o.name || '')) rotors.push(o); });
    return { obj, body, rotors, kind };
  }
  spawnJet(c) {
    const a = Math.random() * 6.283, R = 1200 + Math.random() * 900, x = c.outer.position.x + Math.cos(a) * R, z = c.outer.position.z + Math.sin(a) * R;
    const g = this.ground(x, z), u = Object.assign(this.make(this.jetT, 'jet', JET.scale), {
      home: c, hp: JET.hp, max: JET.hp, x, y: g + 260 + Math.random() * 120, z, h: a + Math.PI / 2, p: 0, roll: 0, sp: JET.speed, state: 'patrol', orbit: R, dir: Math.random() < 0.5 ? 1 : -1, fireT: 0, burst: 0, burstT: 0, runT: 0, v: new THREE.Vector3(), smokeT: 0 });
    this.units.push(u); this.place(u); return u;
  }
  spawnSub(c) {
    const W = this.world; if (!W.water) return null;
    // a spot of deep enough water somewhere near the town
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.283, R = 150 + Math.random() * 2600, x = c.outer.position.x + Math.cos(a) * R, z = c.outer.position.z + Math.sin(a) * R;
      let ok = false; try { ok = W.water.inside(x, z) && W.waterDepth(x, z) > 7 && !W.frozen; } catch { }
      if (!ok) continue;
      const surf = this.ground(x, z) - 0.25, d = W.waterDepth(x, z);
      const u = Object.assign(this.make(this.subT, 'sub', SUBX.scale), {
        home: c, hp: SUBX.hp, max: SUBX.hp, x, y: surf - Math.min(d - 3, 6 + Math.random() * 6), z, h: Math.random() * 6.283, p: 0, roll: 0, sp: SUBX.speed, state: 'patrol', base: { x, z }, tgt: null, fireT: 0, burst: 0, burstT: 0, v: new THREE.Vector3(), bubT: 0 });
      this.units.push(u); this.place(u); return u;
    }
    return null;
  }
  ground(x, z) { try { const g = this.world.heightAt(x, z); return isFinite(g) ? g : 0; } catch { return 0; } }
  place(u) {
    u.obj.position.set(u.x, u.y, u.z); u.obj.rotation.set(-u.p, u.h, u.roll, 'YXZ');
    if (u.bar) { u.bar.position.set(u.x, u.y + (u.kind === 'jet' ? 6 : u.kind === 'car' ? 3.2 : 5), u.z); }
  }
  targets(out) {
    for (const u of this.units) if (u.state !== 'dying') out.push({ id: '', npc: 'fed', ref: u, x: u.x, y: u.kind === 'car' ? u.y + 0.8 : u.y - 0.7, z: u.z, r: u.kind === 'jet' ? JET.r : u.kind === 'car' ? CARX.r : SUBX.r, v: u.v });
    return out;
  }
  hit(u, dmg) {
    if (u.state === 'dying') return false; u.hp = Math.max(0, u.hp - dmg); u.hurtT = 4; this.drawBar(u);
    if (u.hp <= 0) {
      u.state = 'dying'; u.spin = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2); u.dieT = 0;
      if (u.bar) u.bar.visible = false;
      try { this.o.boom && this.o.boom(u.x, u.y + (u.kind === 'car' ? 1 : 0), u.z, u.kind === 'jet' ? 7 : 5, false); this.o.onDown && this.o.onDown(u); } catch { }
      return 'kill';
    }
    return true;
  }
  drawBar(u) {
    if (!u.bar) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 18; u.barCv = cv;
      u.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false, toneMapped: false, fog: false }));
      u.bar.scale.set(0.09, 0.0127, 1); u.bar.renderOrder = 998; this.scene.add(u.bar);
    }
    const x = u.barCv.getContext('2d'), k = u.hp / u.max; x.clearRect(0, 0, 128, 18);
    x.fillStyle = 'rgba(10,12,18,.85)'; x.fillRect(0, 0, 128, 18); x.fillStyle = k > 0.5 ? '#3fd26b' : k > 0.25 ? '#ffb02e' : '#ff3b3b'; x.fillRect(3, 3, 122 * k, 12);
    u.bar.material.map.needsUpdate = true;
  }
  // steer toward a heading/height with a limited turn rate; returns the turn this frame (for banking)
  steer(u, wantH, wantP, turn, dt) {
    let dh = wantH - u.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const t = Math.max(-turn * dt, Math.min(turn * dt, dh)); u.h += t;
    u.p += Math.max(-0.5 * dt, Math.min(0.5 * dt, wantP - u.p));
    return t / Math.max(dt, 1e-4);
  }
  update(dt, me, ctx = {}) {
    for (const u of [...this.units]) {
      const d = me ? Math.hypot(u.x - me.x, u.z - me.z) : 0;
      if (u.state !== 'dying' && (!u.home || u.home.state !== 'alive') && u.state !== 'flee') { u.state = 'flee'; u.fleeT = 0; }
      if (d > 9000 && u.state !== 'patrol') { this.remove(u); continue; }
      if (u.kind === 'jet') this.jet(u, dt, me, d, ctx); else if (u.kind === 'car') this.car(u, dt, me, d, ctx); else this.sub(u, dt, me, d, ctx);
      if (!this.units.includes(u)) continue;
      u.v.set(Math.sin(u.h) * Math.cos(u.p) * u.sp, Math.sin(u.p) * u.sp, Math.cos(u.h) * Math.cos(u.p) * u.sp);
      this.place(u);
      if (u.bar) { u.hurtT = (u.hurtT || 0) - dt; u.bar.visible = u.state !== 'dying' && u.hurtT > 0 && d < 1500; }
      for (const r of u.rotors) r.rotation.z += dt * 30;
    }
  }
  jet(u, dt, me, d, ctx) {
    const g = this.ground(u.x, u.z);
    if (u.state === 'dying') {
      u.dieT += dt; u.roll += u.spin * dt; u.p = Math.max(-0.9, u.p - 0.5 * dt); u.sp = Math.max(60, u.sp - 10 * dt);
      u.x += Math.sin(u.h) * Math.cos(u.p) * u.sp * dt; u.z += Math.cos(u.h) * Math.cos(u.p) * u.sp * dt; u.y += Math.sin(u.p) * u.sp * dt;
      try { this.o.puff && this.o.puff(u.x, u.y, u.z, 6 + Math.random() * 5, 3.5, 0x222020, 2, false); if (Math.random() < 0.7) this.o.puff(u.x, u.y, u.z, 4, 0.5, 0xff7a2a, 1, true); } catch { }
      if (u.y < g + 2 || u.dieT > 25) { try { this.o.boom && this.o.boom(u.x, g + 2, u.z, 12, true); } catch { } this.remove(u); }
      return;
    }
    let wantH = u.h, wantY = g + 280, sp = JET.speed, turn = JET.turn;
    const c = u.home, cx = c ? c.outer.position.x : u.x, cz = c ? c.outer.position.z : u.z;
    if (u.state === 'flee') { u.fleeT += dt; wantY = u.y + 200; sp = 135; if (u.fleeT > 18) { this.remove(u); return; } }
    else {
      const canSee = me && !ctx.diving && !ctx.safe && d < 1700 && Math.abs((me.y || 0) - u.y) < 900;
      if (u.state === 'patrol' && canSee && (u.runT -= dt) <= 0) { if (this.units.filter(o => o.kind === 'jet' && o.state === 'attack').length < MAX_DIVING) u.state = 'attack'; else u.runT = 0.8 + Math.random(); }
      if (u.state === 'attack' && !canSee) u.state = 'patrol';
      if (u.state === 'patrol') {
        // circle the carrier
        const a = Math.atan2(u.z - cz, u.x - cx) + u.dir * 0.35, tx = cx + Math.cos(a) * u.orbit, tz = cz + Math.sin(a) * u.orbit;
        wantH = Math.atan2(tx - u.x, tz - u.z);
      } else if (u.state === 'attack') {
        // dive at you, guns on the way in, then pull up, go out a way and come round again
        const dx = me.x - u.x, dz = me.z - u.z, dh = Math.hypot(dx, dz);
        wantH = Math.atan2(dx, dz); wantY = (me.y || 0) + Math.max(25, Math.min(160, dh * 0.15)); sp = JET.attack; turn = JET.turn * 1.25;
        const fwd = (Math.sin(u.h) * dx + Math.cos(u.h) * dz) / Math.max(1, dh);
        if (fwd > 0.97 && dh < 480 && (u.fireT -= dt) <= 0) { u.fireT = 2.2; u.burst = 7; u.burstT = 0; }
        if (dh < 140 || (fwd < 0 && dh < 400)) { u.state = 'extend'; u.extT = 4 + Math.random() * 2; }
      } else if (u.state === 'extend') { wantY = g + 230; sp = JET.attack; if ((u.extT -= dt) <= 0) { u.state = 'patrol'; u.runT = 1.5 + Math.random() * 2; } }
      if (u.burst > 0 && (u.burstT -= dt) <= 0 && me) {
        u.burst--; u.burstT = 0.09;
        const o = new THREE.Vector3(u.x + Math.sin(u.h) * 9, u.y - 0.5, u.z + Math.cos(u.h) * 9), dir = new THREE.Vector3(me.x + (me.vx || 0) * 0.35 - o.x, (me.y || 0) + 0.6 - o.y, me.z + (me.vz || 0) * 0.35 - o.z).normalize();
        dir.x += (Math.random() - 0.5) * 0.03; dir.z += (Math.random() - 0.5) * 0.03; dir.normalize();
        try { this.o.shoot && this.o.shoot(o, dir, 'mg', 0.35); } catch { }
      }
    }
    wantY = Math.max(wantY, g + 30);
    const dist = Math.max(50, sp * 1.6), wantP = Math.atan2(wantY - u.y, dist);
    const tr = this.steer(u, wantH, Math.max(-0.5, Math.min(0.45, wantP)), turn, dt);
    u.roll += (-tr * 0.9 - u.roll) * Math.min(1, dt * 3); u.sp += (sp - u.sp) * Math.min(1, dt * 0.8);
    u.x += Math.sin(u.h) * Math.cos(u.p) * u.sp * dt; u.z += Math.cos(u.h) * Math.cos(u.p) * u.sp * dt; u.y = Math.max(g + 20, u.y + Math.sin(u.p) * u.sp * dt);
    if (u.hp < u.max * 0.5 && (u.smokeT -= dt) <= 0) { u.smokeT = 0.12; try { this.o.puff && this.o.puff(u.x, u.y, u.z, 4, 2, 0x333030, 1, false); } catch { } }
  }
  sub(u, dt, me, d, ctx) {
    const W = this.world, surf = this.ground(u.x, u.z) - 0.25;
    let depth = 0; try { depth = W.waterDepth(u.x, u.z); } catch { }
    const floor = surf - depth;
    if (u.state === 'dying') {
      u.dieT += dt; u.roll += u.spin * dt * 0.3; u.p = Math.max(-0.6, u.p - 0.3 * dt); u.sp = Math.max(0, u.sp - 6 * dt);
      u.x += Math.sin(u.h) * u.sp * dt; u.z += Math.cos(u.h) * u.sp * dt; u.y = Math.max(floor + 1.5, u.y - (2 + u.dieT) * dt);
      if (Math.random() < dt * 30) try { this.o.bubble && this.o.bubble(u.x + (Math.random() - 0.5) * 4, u.y + 1, u.z + (Math.random() - 0.5) * 6); } catch { }
      if (u.dieT > 7) this.remove(u);
      return;
    }
    if (u.state === 'flee') { u.fleeT += dt; u.y = Math.max(floor + 1.5, u.y - dt * 2); u.sp = SUBX.attack; if (u.fleeT > 12) { this.remove(u); return; } }
    let wantH = u.h, sp = SUBX.speed, wantY = Math.min(surf - 4, Math.max(floor + 2.5, u.wantY ?? (surf - 8)));
    if (u.state !== 'flee') {
      const hunt = me && !ctx.safe && (ctx.diving || ctx.onWater) && d < 380;
      u.state = hunt ? 'attack' : 'patrol';
      if (u.state === 'attack') {
        wantH = Math.atan2(me.x - u.x, me.z - u.z); sp = SUBX.attack; wantY = ctx.diving ? (me.y || 0) : surf - 3;
        const dx = me.x - u.x, dz = me.z - u.z, dh = Math.hypot(dx, dz), fwd = (Math.sin(u.h) * dx + Math.cos(u.h) * dz) / Math.max(1, dh);
        if (fwd > 0.95 && dh < 170 && (u.fireT -= dt) <= 0) { u.fireT = 2.4; u.burst = 5; u.burstT = 0; }
      } else {
        // wander from one bit of open water to another
        if (!u.tgt || Math.hypot(u.tgt.x - u.x, u.tgt.z - u.z) < 25 || (u.tgtT = (u.tgtT || 0) - dt) < 0) {
          u.tgtT = 40; for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, R = 80 + Math.random() * 900, x = u.base.x + Math.cos(a) * R, z = u.base.z + Math.sin(a) * R; let ok = false; try { ok = W.water.inside(x, z) && W.waterDepth(x, z) > 6; } catch { } if (ok) { u.tgt = { x, z }; u.wantY = surf - 5 - Math.random() * 6; break; } }
        }
        if (u.tgt) wantH = Math.atan2(u.tgt.x - u.x, u.tgt.z - u.z);
      }
      if (u.burst > 0 && (u.burstT -= dt) <= 0 && me) {
        u.burst--; u.burstT = 0.14;
        const o = new THREE.Vector3(u.x + Math.sin(u.h) * 7, u.y, u.z + Math.cos(u.h) * 7), dir = new THREE.Vector3(me.x - o.x, (me.y || 0) + 0.5 - o.y, me.z - o.z).normalize();
        try { this.o.shoot && this.o.shoot(o, dir, 'mg', 0.3); } catch { }
      }
    }
    // stay in the water: look ahead and turn away from the shore
    const ax = u.x + Math.sin(u.h) * 30, az = u.z + Math.cos(u.h) * 30; let ahead = true; try { ahead = W.water.inside(ax, az) && W.waterDepth(ax, az) > 4; } catch { }
    if (!ahead) { wantH = u.h + Math.PI * 0.8; sp *= 0.6; u.tgt = null; }
    this.steer(u, wantH, 0, SUBX.turn, dt);
    u.sp += (sp - u.sp) * Math.min(1, dt * 0.7);
    const nx = u.x + Math.sin(u.h) * u.sp * dt, nz = u.z + Math.cos(u.h) * u.sp * dt; let ok = true; try { ok = W.water.inside(nx, nz) && W.waterDepth(nx, nz) > 3; } catch { }
    if (ok) { u.x = nx; u.z = nz; } else u.h += dt * 1.5;
    u.y += (Math.min(surf - 2.5, Math.max(floor + 2, wantY)) - u.y) * Math.min(1, dt * 0.6); u.p = 0; u.roll *= 0.95;
    if ((u.bubT -= dt) <= 0 && d < 600) { u.bubT = 0.15; try { this.o.bubble && this.o.bubble(u.x - Math.sin(u.h) * 7, u.y, u.z - Math.cos(u.h) * 7); } catch { } }
  }
  // ---- jet cars on the roads ----
  roadOk(s) { return s && !s.walk && s.type !== 'track' && !s.rail; }
  spawnCar(c) {
    const W = this.world; if (!W.roadCells || !W.roadCells.size) return null;
    const me = this.o.me ? this.o.me() : null, cx = c.outer.position.x, cz = c.outer.position.z, CELL = 24;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, R = 200 + Math.random() * 1400, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      if (me && Math.hypot(x - me.x, z - me.z) < 260) continue; // never pop in right in front of you
      const segs = (W.roadCells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []).filter(q => this.roadOk(q) && Math.hypot(q.x1 - q.x0, q.z1 - q.z0) > 2.5);
      if (!segs.length) continue; const sg = segs[Math.floor(Math.random() * segs.length)];
      if (!sg.bridge) { let wet = false; try { wet = W.water && W.water.inside((sg.x0 + sg.x1) / 2, (sg.z0 + sg.z1) / 2); } catch { } if (wet) continue; }
      const car = makeFedCar(); this.scene.add(car.obj);
      const u = { obj: car.obj, body: car.obj, rotors: [], kind: 'car', fx: car, home: c, hp: CARX.hp, max: CARX.hp, x: 0, y: 0, z: 0, h: 0, p: 0, roll: 0, sp: CARX.speed * 0.7, state: 'patrol', fireT: 1, burst: 0, burstT: 0, runT: 0, v: new THREE.Vector3(), smokeT: 0 };
      this.carSeg(u, sg, Math.random() < 0.5 ? 1 : -1, 0.5); this.carPos(u);
      this.units.push(u); this.place(u); return u;
    }
    return null;
  }
  carSeg(u, sg, dir, k = 0) { u.seg = sg; u.dir = dir; u.len = Math.hypot(sg.x1 - sg.x0, sg.z1 - sg.z0) || 1; u.d = u.len * k; }
  carPos(u) {
    const s = u.seg, k = u.dir > 0 ? u.d / u.len : 1 - u.d / u.len, x = s.x0 + (s.x1 - s.x0) * k, z = s.z0 + (s.z1 - s.z0) * k;
    const dx = (s.x1 - s.x0) * u.dir, dz = (s.z1 - s.z0) * u.dir, lane = Math.min(1.7, (s.hw || 3) * 0.3); // keep right
    u.x = x + dz / u.len * lane; u.z = z - dx / u.len * lane;
    const y = s.bridge && s.y0 != null ? s.y0 + (s.y1 - s.y0) * k : this.ground(u.x, u.z);
    const want = Math.atan2(dx, dz); let dh = want - u.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); u.h += dh * Math.min(1, 0.25 + u.sp * 0.012); // round corners a little
    u.p += ((u.y ? Math.atan2(y - u.y, Math.max(0.3, u.sp * 0.05)) * 0.3 : 0) - u.p) * 0.2; u.y = y;
  }
  carNext(u, me) {
    const s = u.seg, ex = u.dir > 0 ? s.x1 : s.x0, ez = u.dir > 0 ? s.z1 : s.z0, hx = (s.x1 - s.x0) * u.dir / u.len, hz = (s.z1 - s.z0) * u.dir / u.len, opts = [];
    for (const o of this.world.nearbySegs(ex, ez)) {
      if (o === s || !this.roadOk(o)) continue; let nd;
      if (Math.hypot(o.x0 - ex, o.z0 - ez) < 1.5) nd = 1; else if (Math.hypot(o.x1 - ex, o.z1 - ez) < 1.5) nd = -1; else continue;
      const dx = (o.x1 - o.x0) * nd, dz = (o.z1 - o.z0) * nd, l = Math.hypot(dx, dz); if (l < 0.5) continue;
      const dot = (dx * hx + dz * hz) / l; if (dot < -0.3) continue;
      let w = 0.4 + dot; // chasing: strongly prefer the road that heads toward you
      if (u.state === 'attack' && me) { const tx = me.x - ex, tz = me.z - ez, tl = Math.hypot(tx, tz) || 1; w += Math.max(0, (dx * tx + dz * tz) / (l * tl)) * 4; }
      else if (u.home && Math.hypot(ex - u.home.outer.position.x, ez - u.home.outer.position.z) > 1800) { const tx = u.home.outer.position.x - ex, tz = u.home.outer.position.z - ez, tl = Math.hypot(tx, tz) || 1; w += Math.max(0, (dx * tx + dz * tz) / (l * tl)) * 2; } // drifted too far: head back to town
      opts.push({ o, nd, w });
    }
    if (!opts.length) { this.carSeg(u, s, -u.dir, 0); return; } // dead end: turn round
    let tot = 0; for (const p of opts) tot += p.w; let r = Math.random() * tot, pick = opts[opts.length - 1];
    for (const p of opts) { r -= p.w; if (r <= 0) { pick = p; break; } }
    this.carSeg(u, pick.o, pick.nd, 0);
  }
  car(u, dt, me, d, ctx) {
    if (u.state === 'dying') {
      u.dieT += dt; u.sp = Math.max(0, u.sp - 14 * dt); u.d = Math.min(u.len, u.d + u.sp * dt); try { this.carPos(u); } catch { }
      u.roll += (u.spin * 0.12 - u.roll) * Math.min(1, dt * 2);
      if (Math.random() < dt * 14) try { this.o.puff && this.o.puff(u.x, u.y + 1.2, u.z, 3 + Math.random() * 3, 2.5, 0x222020, 1.5, false); if (Math.random() < 0.5) this.o.puff(u.x, u.y + 0.9, u.z, 2, 0.6, 0xff7a2a, 1, true); } catch { }
      animateFedCar(u.fx, u.sp, dt, 0);
      if (u.dieT > 6) { try { this.o.boom && this.o.boom(u.x, u.y + 1, u.z, 6, true); } catch { } this.remove(u); }
      return;
    }
    let sp = CARX.speed;
    if (u.state === 'flee') { u.fleeT += dt; sp = CARX.attack; if (u.fleeT > 18 && d > 300) { this.remove(u); return; } }
    else {
      const canSee = me && !ctx.safe && !ctx.diving && d < 420 && Math.abs((me.y || 0) - u.y) < 60;
      u.state = canSee ? 'attack' : 'patrol';
      if (u.state === 'attack') {
        sp = d < 45 ? Math.max(8, (me.sp || 0)) : CARX.attack;
        // twin cannons in the nose: short bursts when you're roughly ahead
        const dx = me.x - u.x, dz = me.z - u.z, dh = Math.hypot(dx, dz), fwd = (Math.sin(u.h) * dx + Math.cos(u.h) * dz) / Math.max(1, dh);
        if (fwd > 0.6 && dh < 240 && (u.fireT -= dt) <= 0) { u.fireT = 2.6 + Math.random(); u.burst = 4; u.burstT = 0; }
      }
      if (u.burst > 0 && (u.burstT -= dt) <= 0 && me) {
        u.burst--; u.burstT = 0.12;
        const o = new THREE.Vector3(u.x + Math.sin(u.h) * 2.9, u.y + 0.5, u.z + Math.cos(u.h) * 2.9), dir = new THREE.Vector3(me.x + (me.vx || 0) * 0.25 - o.x, (me.y || 0) + 0.6 - o.y, me.z + (me.vz || 0) * 0.25 - o.z).normalize();
        dir.x += (Math.random() - 0.5) * 0.05; dir.z += (Math.random() - 0.5) * 0.05; dir.normalize();
        try { this.o.shoot && this.o.shoot(o, dir, 'mg', 0.3); } catch { }
      }
    }
    if (u.hp < u.max * 0.5 && (u.smokeT -= dt) <= 0) { u.smokeT = 0.15; try { this.o.puff && this.o.puff(u.x, u.y + 1, u.z, 3, 1.5, 0x333030, 1, false); } catch { } }
    // slow for corners: look at how sharply the road bends at the end of this piece
    const left = u.len - u.d; if (left < 25) sp = Math.min(sp, 9 + left * 0.8);
    u.sp += (sp - u.sp) * Math.min(1, dt * (sp > u.sp ? 0.9 : 2.2));
    u.d += u.sp * dt; let n = 0; while (u.d > u.len && n++ < 4) { const over = u.d - u.len; this.carNext(u, me); u.d = Math.min(u.len, over); }
    this.carPos(u); u.roll *= 0.9;
    animateFedCar(u.fx, u.sp, dt, Math.min(1, u.sp / CARX.attack) * (u.state === 'attack' ? 1 : 0.55));
  }
  dots() { return this.units.filter(u => u.state !== 'dying').map(u => ({ x: u.x, z: u.z, yaw: u.h, kind: u.kind })); }
}
