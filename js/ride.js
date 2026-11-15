import * as THREE from 'three';
import { cockpitFor, buildCockpit, drawGauges } from './cockpit.js';

// Ride-along: a joined player asks to sit in another player's car; the driver accepts or declines.
// Seating is carried in every player's state (rd = driver id, sx = seat) so it recovers from lost messages;
// the request / accept / decline / leave / kick messages go through net.sendTo (host-relayed, sent 3x, de-duplicated).
// The passenger's own car is hidden and glued to the driver's car, and the camera can sit in the passenger seat.

const CAP = { formula: 0, bike: 1, coupe: 1, roadster: 1, hyper: 1, buggy: 1, monster: 1, hatch: 3, muscle: 3, pickup: 2, rally: 3, trail: 3, van: 3 };
const ROWD = { pickup: 0.5, van: 1.1, hatch: 0.85 };
export const capacity = m => CAP[m] ?? 1;
// seat 0 = front passenger, 1 = behind the driver, 2 = behind the front passenger. Car-local eye position (the driver sits on +X).
export function seatEye(model, seat) {
  const [ex, ey, ez] = cockpitFor(model).eye;
  if (model === 'bike') return [0, ey + 0.02, ez - 0.7];
  const sx = Math.abs(ex) < 0.05 ? 0.4 : Math.abs(ex), row = seat === 0 ? 0 : (ROWD[model] ?? 0.95);
  return [seat === 1 ? sx : -sx, ey, ez - row];
}

const qCock = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, Math.PI, 0, 'YXZ'));
const G = { torso: new THREE.BoxGeometry(0.44, 0.5, 0.26), head: new THREE.SphereGeometry(0.13, 12, 10), hair: new THREE.BoxGeometry(0.27, 0.07, 0.27), arm: new THREE.BoxGeometry(0.1, 0.1, 0.42), leg: new THREE.BoxGeometry(0.15, 0.15, 0.5) };
const skinM = new THREE.MeshStandardMaterial({ color: '#e2b799', roughness: 0.8 }), pantsM = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.9 }), hairM = new THREE.MeshStandardMaterial({ color: '#2a1f1a', roughness: 0.9 });
const shirts = new Map(); const shirtMat = c => { let m = shirts.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c || '#ffffff', roughness: 0.8 }); shirts.set(c, m); } return m; };
function makeDummy(color) { // a seated person, origin at the eyes
  const g = new THREE.Group(); g.userData.cockpit = true; // exempt from the custom-model "hide stock parts" pass
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  g.userData.shirt = add(G.torso, shirtMat(color), 0, -0.4, 0); add(G.head, skinM, 0, -0.04, 0); add(G.hair, hairM, 0, 0.09, -0.01);
  [-1, 1].forEach(s => { add(G.arm, shirtMat(color), s * 0.28, -0.36, 0.17, -0.25); add(G.leg, pantsM, s * 0.12, -0.72, 0.25); });
  return g;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `#rideUI{position:fixed;top:max(64px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:max-content;max-width:94vw}
.rideCard,.rideHint{pointer-events:auto;background:rgba(16,14,30,.9);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:10px 14px;display:flex;gap:10px;align-items:center;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 14px/1.2 var(--display,system-ui,sans-serif)}
.rideHint{cursor:pointer;border-radius:999px;padding:8px 14px}
.rideCard button{border:0;border-radius:10px;padding:7px 12px;font:inherit;font-weight:700;cursor:pointer;color:#fff}
.rideCard .yes{background:#2fa36b}.rideCard .no{background:#5a5870}
@media (pointer:coarse){#rideUI{top:max(76px,calc(env(safe-area-inset-top) + 56px));max-width:92vw}.rideCard,.rideHint{flex-wrap:wrap;justify-content:center;font-size:16px;padding:12px 14px}.rideCard button{min-height:46px;min-width:96px;font-size:16px;border-radius:12px}.rideHint{min-height:46px}#rideUI kbd{display:none}} 
.mp-list>div{flex-wrap:wrap}
.mp-list .mpride{flex:0 0 100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 0;padding:0 0 0 38px}
.mpride small{opacity:.75;flex:1 1 auto}
.mpride button{border:0;border-radius:10px;padding:9px 14px;min-height:40px;font:inherit;font-weight:700;color:#fff;background:#5a5870;cursor:pointer;touch-action:manipulation}
.mpride .yes{background:#2fa36b}.mpride .go{background:var(--accent,#ff5a3c)}
#rideUI kbd{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.18);font:700 11px/1.5 monospace}`;

export function createRide(c) {
  // c: { net, scene, camera, player(), remotes(), mode(), paused(), toast, stopAuto, cam(), toUnits(), unit(), mini(), cabinIntruders(mesh, ck), place(x,z,yaw), myColor(), hudVisible(), vrOn(), audio }
  const R = {
    riding: null, pending: null, pax: new Map(), incoming: [], dummies: new Map(), ck: null, last: null, hintId: null, sig: '', stateSig: '', gaugeT: 0, kickT: new Map(),
    name(id) { return c.net.players.get(id)?.name || 'Driver'; },
    netState() { return { rd: this.riding ? this.riding.id : '', sx: this.riding ? this.riding.seat : 0 }; },
    myCap() { return capacity(c.player().model); },
    freeSeat() { const used = new Set([...this.pax.values()].map(p => p.seat)); for (let i = 0; i < this.myCap(); i++) if (!used.has(i)) return i; return -1; },
    canRequest() { return c.net.active && c.mode() === 'world' && !this.riding && !this.pending && !this.pax.size; },

    // ---------- passenger side ----------
    request(id) {
      const pl = c.net.players.get(id); if (!pl) return false;
      if (c.vrOn()) { c.toast('Ride-along is not available in VR yet'); return false; }
      if (this.riding) { c.toast('Get out of this car first (E)'); return false; }
      if (this.pax.size) { c.toast('You have passengers — you can\'t ride in another car'); return false; }
      if (this.pending) { c.toast('Already waiting for an answer'); return false; }
      if (!c.net.active || c.mode() !== 'world') return false;
      if (pl.rd) { c.toast(`${pl.name} is a passenger right now`); return false; }
      this.pending = { to: id, t: performance.now() }; c.net.sendTo(id, { k: 'rq' }); c.toast(`Asked ${pl.name} for a ride…`); return true;
    },
    cancel() { if (!this.pending) return; c.net.sendTo(this.pending.to, { k: 'cx' }); this.pending = null; c.toast('Request cancelled'); },
    enter(id, seat) {
      const p = c.player(); c.stopAuto(); this.pending = null;
      for (const q of this.incoming) c.net.sendTo(q.from, { k: 'no', why: 'busy' }); this.incoming = [];
      this.riding = { id, seat: seat | 0 }; this.last = { x: p.x, z: p.z, yaw: p.yaw, y: p.y || 0 };
      p.fly = null; p.air = false; p.mesh.visible = false; c.toast(`Riding with ${this.name(id)} — press E to get out`, 3600);
      if (c.audio) c.audio.chime(3);
    },
    exit(why, quiet) {
      const g = this.riding; if (!g) return; const p = c.player(), L = this.last || { x: p.x, z: p.z, yaw: p.yaw };
      this.dropCockpit(); this.riding = null;
      if (!quiet && c.net.active) c.net.sendTo(g.id, { k: 'lv' });
      c.place(L.x + Math.cos(L.yaw) * 3.4, L.z - Math.sin(L.yaw) * 3.4, L.yaw); // step out on the car's right-hand side
      p.mesh.visible = true; c.toast(why || 'You got out');
    },

    // ---------- driver side ----------
    accept(id) {
      const i = this.incoming.findIndex(q => q.from === id); if (i < 0) return; this.incoming.splice(i, 1);
      if (!c.net.players.has(id)) return;
      if (this.riding) { c.net.sendTo(id, { k: 'no', why: 'busy' }); return; }
      const seat = this.pax.has(id) ? this.pax.get(id).seat : this.freeSeat();
      if (seat < 0) { c.net.sendTo(id, { k: 'no', why: 'full' }); c.toast('Your car is full'); return; }
      if (this.pending && this.pending.to === id) { this.pending = null; } else if (this.pending) this.cancel(); // being a driver and a passenger at once makes no sense
      this.pax.set(id, { seat, t: performance.now() }); c.net.sendTo(id, { k: 'ok', seat }); c.toast(`${this.name(id)} is riding with you`);
    },
    decline(id) { const i = this.incoming.findIndex(q => q.from === id); if (i >= 0) this.incoming.splice(i, 1); c.net.sendTo(id, { k: 'no', why: 'declined' }); },
    kick(id) { if (!this.pax.has(id)) return; this.pax.delete(id); c.net.sendTo(id, { k: 'kick' }); c.toast(`${this.name(id)} was asked to get out`); },

    onMessage({ from, m }) {
      const nm = this.name(from);
      if (m.k === 'rq') {
        if (c.mode() !== 'world') { c.net.sendTo(from, { k: 'no', why: 'busy' }); return; }
        if (this.pax.has(from)) { c.net.sendTo(from, { k: 'ok', seat: this.pax.get(from).seat }); return; }
        if (this.riding || this.myCap() === 0) { c.net.sendTo(from, { k: 'no', why: this.riding ? 'busy' : 'solo' }); return; }
        if (this.freeSeat() < 0) { c.net.sendTo(from, { k: 'no', why: 'full' }); return; }
        if (this.incoming.some(q => q.from === from)) return;
        this.incoming.push({ from, t: performance.now() }); if (c.audio) c.audio.chime(2); c.toast(`${nm} wants to ride with you`);
      } else if (m.k === 'ok') {
        if (this.pending && this.pending.to === from) this.enter(from, m.seat);
        else if (this.riding && this.riding.id === from) this.riding.seat = m.seat | 0;
        else c.net.sendTo(from, { k: 'lv' }); // stale accept (I cancelled or timed out)
      } else if (m.k === 'no') {
        if (this.pending && this.pending.to === from) { this.pending = null; c.toast(m.why === 'full' ? `${nm}'s car is full` : m.why === 'solo' ? `${nm}'s car has no passenger seat` : m.why === 'busy' ? `${nm} can't take passengers right now` : m.why === 'timeout' ? `${nm} didn't answer` : `${nm} declined`); }
      } else if (m.k === 'cx') { this.incoming = this.incoming.filter(q => q.from !== from);
      } else if (m.k === 'lv') { if (this.pax.delete(from)) c.toast(`${nm} got out`);
      } else if (m.k === 'kick') { if (this.riding && this.riding.id === from) this.exit(`${nm} asked you to get out`, true); }
    },

    key(code) {
      if (code === 'KeyY' && this.incoming.length) { this.accept(this.incoming[0].from); return true; }
      if (code === 'KeyU' && this.incoming.length) { this.decline(this.incoming[0].from); return true; }
      if (code === 'KeyE') {
        if (this.riding) { this.exit(); return true; }
        if (this.pending) { this.cancel(); return true; }
        if (this.hintId && this.canRequest()) { this.request(this.hintId); return true; }
      }
      return false;
    },

    // ---------- per-frame ----------
    // passenger: glue my (hidden) car to the driver's car
    step() {
      const g = this.riding; if (!g) return; const p = c.player(), r = c.remotes().get(g.id), pl = c.net.players.get(g.id);
      p.input.throttle = 0; p.input.brake = 0; p.input.steer = 0; p.input.handbrake = false; p.input.boost = false; p.mesh.visible = false;
      if (!r || !pl) return;
      const car = r.car; this.last = { x: car.x, z: car.z, yaw: car.yaw, y: car.y };
      p.x = car.x; p.z = car.z; p.y = car.y || 0; p.yaw = car.yaw; p.pitch = car.pitch || 0; p.roll = car.roll || 0; p.air = false; p.vy = 0;
      const sp = pl.speed || 0; p.vx = Math.sin(car.yaw) * sp; p.vz = Math.cos(car.yaw) * sp; p.sync(0, sp, 0); p.mesh.visible = false;
    },
    update(dt) {
      const net = c.net, now = performance.now();
      if (!net.active) { if (this.riding || this.pax.size || this.pending || this.incoming.length) this.reset(); this.drawUI(false); this.syncDummies(); this.changed(); return; }
      if (this.pending && now - this.pending.t > 25000) { net.sendTo(this.pending.to, { k: 'cx' }); c.toast('No answer'); this.pending = null; }
      for (let i = this.incoming.length - 1; i >= 0; i--) { const q = this.incoming[i]; if (!net.players.has(q.from)) this.incoming.splice(i, 1); else if (now - q.t > 30000) { net.sendTo(q.from, { k: 'no', why: 'timeout' }); this.incoming.splice(i, 1); } }
      for (const [id, px] of this.pax) {
        const pl = net.players.get(id);
        if (!pl) { this.pax.delete(id); continue; }
        if (pl.rd === net.myId) px.t = now; else if (now - px.t > 3500) { this.pax.delete(id); c.toast(`${pl.name} left your car`); }
      }
      // a player still sitting in my car that I've dropped (kicked / lost message): tell them again
      for (const [id, pl] of net.players) if (pl.rd === net.myId && !this.pax.has(id) && now - (this.kickT.get(id) ?? -1e9) > 1500) { this.kickT.set(id, now); net.sendTo(id, { k: 'kick' }); }
      if (this.riding) {
        const pl = net.players.get(this.riding.id);
        if (!pl) this.exit('The driver left', true); else if (pl.rd) this.exit(`${pl.name} is a passenger now`, true);
      }
      // who could I ask? (nearby car that isn't carrying someone else's seat request)
      this.hintId = null;
      if (this.canRequest() && !c.paused()) {
        const p = c.player(); let best = 14;
        for (const [id, pl] of net.players) { if (pl.rd || capacity(pl.model) === 0) continue; const r = c.remotes().get(id); if (!r) continue; const d = Math.hypot(r.car.x - p.x, r.car.z - p.z); if (d < best) { best = d; this.hintId = id; } }
      }
      this.syncDummies(); this.drawUI(true); this.changed();
    },

    changed() { // tell main.js when anything the multiplayer tab shows has changed, so an open tab refreshes
      const net = c.net; let sig = `${this.riding ? this.riding.id : ''}|${this.pending ? this.pending.to : ''}|${this.incoming.map(q => q.from)}|${[...this.pax.keys()]}|`;
      if (net.active) for (const [id, pl] of net.players) sig += `${id}:${pl.rd || ''}${pl.lat != null ? 1 : 0};`;
      if (sig !== this.stateSig) { this.stateSig = sig; c.onChange && c.onChange(); }
    },

    // ---------- people in the seats ----------
    syncDummies() {
      const want = new Map(), net = c.net;
      if (net.active) {
        for (const [id, pl] of net.players) { if (!pl.rd) continue; const mesh = pl.rd === net.myId ? c.player().mesh : c.remotes().get(pl.rd)?.car.mesh; if (mesh) want.set(id, { mesh, seat: pl.sx | 0, color: pl.color }); }
        if (this.riding) { const mesh = c.remotes().get(this.riding.id)?.car.mesh; if (mesh) want.set('me', { mesh, seat: this.riding.seat, color: c.myColor(), own: true }); }
      }
      for (const [k, d] of this.dummies) { const w = want.get(k); if (!w || d.mesh !== w.mesh) { d.g.parent && d.g.parent.remove(d.g); this.dummies.delete(k); } }
      for (const [k, w] of want) {
        let d = this.dummies.get(k);
        if (!d) { const g = makeDummy(w.color); w.mesh.add(g); d = { g, mesh: w.mesh, seat: -1, color: w.color, model: '' }; this.dummies.set(k, d); }
        const model = w.mesh.userData.model || 'coupe';
        if (d.seat !== w.seat || d.model !== model) { const [x, y, z] = seatEye(model, Math.min(w.seat, Math.max(0, capacity(model) - 1))); d.g.position.set(x, y, z); d.seat = w.seat; d.model = model; }
        if (d.color !== w.color) { d.g.userData.shirt.material = shirtMat(w.color); d.color = w.color; }
        d.g.visible = !(w.own && c.cam() === 3);
      }
    },

    // ---------- passenger-seat camera ----------
    dropCockpit() {
      const k = this.ck; if (!k) return; this.ck = null;
      for (const o of k.hide || []) o.visible = true;
      k.group.parent && k.group.parent.remove(k.group); k.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); if (k.tex && k.tex.dispose) k.tex.dispose();
    },
    cockpitCam(camera, dt) {
      const g = this.riding; if (!g || c.cam() !== 3) { this.dropCockpit(); return false; }
      const r = c.remotes().get(g.id); if (!r) return false; const mesh = r.car.mesh, model = r.car.model;
      if (!this.ck || this.ck.mesh !== mesh || this.ck.model !== model) {
        this.dropCockpit();
        try { const k = buildCockpit(model, c.mini()); k.group.userData.cockpit = true; mesh.add(k.group); k.mesh = mesh; k.model = model; k.hide = c.cabinIntruders(mesh, k); this.ck = k; }
        catch (e) { console.warn('rider cockpit', e); return false; }
      }
      const [x, y, z] = seatEye(model, Math.min(g.seat, Math.max(0, capacity(model) - 1)));
      mesh.updateWorldMatrix(true, false); camera.position.set(x, y, z); mesh.localToWorld(camera.position);
      mesh.getWorldQuaternion(camera.quaternion); camera.quaternion.multiply(qCock);
      camera.fov += (72 - camera.fov) * Math.min(1, dt * 4); camera.near = 0.05; camera.updateProjectionMatrix();
      if ((this.gaugeT -= dt) <= 0) {
        this.gaugeT = 1 / 10; const pl = c.net.players.get(g.id);
        try { drawGauges(this.ck, { speed: c.toUnits(pl?.speed || 0), unit: c.unit(), fuel: null, electric: false, boost: 0, inf: false, boosting: false, line1: `${this.name(g.id)}'s car`, line2: '', msg: '' }); if (this.ck.group.userData.miniTex) this.ck.group.userData.miniTex.needsUpdate = true; } catch { }
      }
      return true;
    },

    // ---------- prompts ----------
    drawUI(show) {
      const net = c.net, parts = [];
      if (show && net.active && c.mode() === 'world' && c.hudVisible()) {
        for (const q of this.incoming) parts.push(`<div class="rideCard"><span><b>${esc(this.name(q.from))}</b> wants to ride with you</span><button class="yes" data-act="accept" data-id="${esc(q.from)}">Accept<kbd>Y</kbd></button><button class="no" data-act="decline" data-id="${esc(q.from)}">Decline<kbd>U</kbd></button></div>`);
        if (this.pending) parts.push(`<div class="rideCard"><span>Asking <b>${esc(this.name(this.pending.to))}</b> for a ride…</span><button class="no" data-act="cancel">Cancel<kbd>E</kbd></button></div>`);
        if (this.riding) parts.push(`<div class="rideCard"><span>Riding with <b>${esc(this.name(this.riding.id))}</b></span><button class="no" data-act="exit">Get out<kbd>E</kbd></button></div>`);
        else if (this.hintId && !this.pending) parts.push(`<button class="rideHint" data-act="ask" data-id="${esc(this.hintId)}">Ask <b>${esc(this.name(this.hintId))}</b> for a ride<kbd>E</kbd></button>`);
      }
      const sig = parts.join(''); if (sig !== this.sig) { this.sig = sig; this.ui.innerHTML = sig; }
    },
    // Controls shown under a player's name in the multiplayer tab (pause menu). Always says what is possible with that player.
    panelRow(id) {
      const pl = c.net.players.get(id); if (!pl || pl.lat == null) return ''; const e = esc(id); let h;
      if (this.incoming.some(q => q.from === id)) h = `<small><b>${esc(pl.name)}</b> wants to ride with you</small><button class="yes" data-accept="${e}">Accept</button><button data-decline="${e}">Decline</button>`;
      else if (this.pax.has(id)) h = `<small>Riding in your car</small><button data-kick="${e}">Kick out</button>`;
      else if (this.riding && this.riding.id === id) h = `<small>You're in their car</small><button data-exit="1">Get out</button>`;
      else if (this.pending && this.pending.to === id) h = `<small>Waiting for an answer…</small><button data-cancel="1">Cancel</button>`;
      else if (this.riding) h = `<small>Get out of this car first to ride with someone else</small>`;
      else if (this.pax.size) h = `<small>You have passengers, so you can't ride in another car</small>`;
      else if (this.pending) h = `<small>Waiting on another request</small>`;
      else if (pl.rd) h = `<small>Is a passenger in another car</small>`;
      else if (capacity(pl.model) === 0) h = `<small>Single-seat car, no passenger seat</small>`;
      else h = `<button class="go" data-ride="${e}">Ask for passenger seat</button>`;
      return `<p class="mpride">${h}</p>`;
    },
    reset() {
      const wasRiding = this.riding; this.dropCockpit();
      if (wasRiding) { if (c.net.active) c.net.sendTo(wasRiding.id, { k: 'lv' }); c.player().mesh.visible = true; }
      this.riding = null; this.pending = null; this.pax.clear(); this.incoming = []; this.hintId = null;
      this.syncDummies(); this.drawUI(false); this.changed();
    },
  };
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  R.ui = document.createElement('div'); R.ui.id = 'rideUI'; document.body.appendChild(R.ui);
  let lastTap = -1e9;
  const tap = e => {
    const b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'click' && performance.now() - lastTap < 700) return; // already handled by the touch-down
    if (e.type === 'pointerdown') lastTap = performance.now();
    const id = b.dataset.id;
    ({ accept: () => R.accept(id), decline: () => R.decline(id), cancel: () => R.cancel(), exit: () => R.exit(), ask: () => R.request(id) })[b.dataset.act]?.();
  };
  R.ui.addEventListener('pointerdown', tap); R.ui.addEventListener('click', tap);
  return R;
}
