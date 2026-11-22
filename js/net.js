import { cleanDriver } from './avatar.js';
// Peer-to-peer multiplayer over PeerJS with STUN-only ICE (no TURN relay).
// Host relays everybody's state. States carry lat/lon so each peer can use its own local origin.
export const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const PREFIX = 'osmracer-';
const ASSET_KEYS = ['glb', 'skin', 'wo', 'wi', 'o0', 'o1', 'o2', 'dh', 'dt', 'dp']; // your 3D model, your paint picture, and your garage's outside / inside wall pictures
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Net {
  constructor() {
    this.peer = null; this.role = null; this.code = ''; this.conns = new Map(); this.host = null;
    this.avs = new Map(); this.avT = 0;
    this.players = new Map(); // id -> {name,color,lat,lon,yaw,speed,t}
    this.myId = ''; this.seenMsgs = new Set(); this.garagesMine = []; this.garagesBy = new Map(); this.garagesIn = []; this.lightsMine = null; this.lightsIn = new Map(); this.weaponMine = null; this.weaponIn = new Map(); this.driverMine = null; this.driverIn = new Map(); this.garSig = ''; this.garT = 0; this.garDirty = false; this.onEvent = () => { }; this.sendT = 0; this.inv = false; this.hostInv = false;
    // custom car looks (3D model + picture paint), shared over a separate reliable channel
    this.mine = { glb: null, skin: null, wo: null, wi: null, o0: null, o1: null, o2: null, dh: null, dt: null, dp: null }; this.assets = new Map(); this.aconns = new Map(); this.ac = null; this.partial = new Map();
  }
  get active() { return !!this.role; }
  get count() { return this.players.size + (this.active ? 1 : 0); }
  makePeer(id) {
    if (!window.Peer) throw new Error('PeerJS failed to load');
    return new window.Peer(id, { config: { iceServers: ICE }, debug: 1 });
  }
  hostGame(me, origin) {
    this.leave();
    return new Promise((res, rej) => {
      this.code = Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
      this.me = me; this.origin = origin;
      const p = this.makePeer(PREFIX + this.code); this.peer = p;
      const to = setTimeout(() => rej(new Error('Signaling server did not respond')), 12000);
      p.on('open', id => { clearTimeout(to); this.myId = id; this.role = 'host'; res(this.code); this.onEvent('status', 'Hosting · code ' + this.code); });
      p.on('error', e => { clearTimeout(to); if (!this.role) rej(e); else this.onEvent('error', e.type || e.message); });
      p.on('connection', c => (c.metadata && c.metadata.assets) ? this.acceptAssets(c) : this.acceptGuest(c));
      p.on('disconnected', () => { try { p.reconnect(); } catch { } });
    });
  }
  acceptGuest(c) {
    c.on('open', () => { this.conns.set(c.peer, c); });
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') {
        this.players.set(c.peer, { name: String(d.name || 'Driver').slice(0, 16), color: d.color || '#fff', model: String(d.model || 'coupe').slice(0, 12), av: (typeof d.av === 'string' && d.av.length < 20000 && /^data:image\/(jpeg|png|webp);base64,/.test(d.av) ? d.av : null), lat: null, lon: null, yaw: 0, speed: 0, t: performance.now() });
        c.send({ t: 'welcome', id: c.peer, origin: this.originFn ? this.originFn() : this.origin, mode: this.modeFn ? this.modeFn() : 'world', map: this.mapFn ? this.mapFn() : null });
        this.onEvent('join', this.players.get(c.peer).name); setTimeout(() => this.sendAvatars(), 300);
      } else if (d.t === 's') { const pl = this.players.get(c.peer); if (pl) { Object.assign(pl, { lat: d.la, lon: d.lo, yaw: d.y, speed: d.v, h: +d.h || 0, pi: +d.pi || 0, ro: +d.ro || 0, hp: d.hp == null ? 100 : Math.max(0, Math.min(100, +d.hp || 0)), rd: typeof d.rd === 'string' ? d.rd.slice(0, 40) : '', sx: (+d.sx || 0) & 7, t: performance.now() }); if (d.n) pl.name = String(d.n).slice(0, 16); if (d.c) pl.color = String(d.c).slice(0, 9); if (d.m) pl.model = String(d.m).slice(0, 12); } }
      else if (d.t === 'av') { const pl = this.players.get(c.peer); if (pl) { pl.av = (typeof d.av === 'string' && d.av.length < 20000 && /^data:image\/(jpeg|png|webp);base64,/.test(d.av) ? d.av : null); this.sendAvatars(); } }
      else if (d.t === 'chat') this.broadcast({ t: 'chat', from: this.players.get(c.peer)?.name, msg: String(d.msg).slice(0, 120) });
      else if (d.t === 'gar' && this.players.has(c.peer)) {
        const list = this.cleanGarages(d.list), lt = this.cleanLights(d.lt), wp = this.cleanWeapon(d.wp), dr = cleanDriver(d.dr), name = this.players.get(c.peer).name, sig = JSON.stringify([list, name, lt, wp, dr]), cur = this.garagesBy.get(c.peer);
        if (!cur || cur.sig !== sig) { this.garagesBy.set(c.peer, { list, name, lt, wp, dr, sig }); this.garDirty = true; }
      }
      else if (d.t === 'sh' && this.players.has(c.peer)) { const sh = this.cleanShot(d); if (sh) { this.onEvent('shot', { ...sh, from: c.peer }); for (const [id, c2] of this.conns) if (id !== c.peer && c2.open) try { c2.send({ t: 'sh', ...sh, from: c.peer }); } catch { } } }
      else if (d.t === 'fwd' && this.players.has(c.peer) && typeof d.to === 'string') {
        const m = this.cleanMsg(d.m); if (!m) return;
        if (d.to === this.myId) this.recvMsg(c.peer, m); else { const t = this.conns.get(d.to); if (t?.open) try { t.send({ t: 'm', from: c.peer, m }); } catch { } }
      }
    });
    const drop = () => { const pl = this.players.get(c.peer); this.conns.delete(c.peer); this.dropAssets(c.peer); if (this.garagesBy.delete(c.peer)) this.garDirty = true; if (pl) { this.players.delete(c.peer); this.onEvent('leave', pl.name); this.broadcast({ t: 'left', id: c.peer }); } };
    c.on('close', drop); c.on('error', drop);
    c.on('iceStateChanged', s => { if (s === 'failed') { this.onEvent('error', 'A guest could not connect (strict NAT, STUN only)'); drop(); } });
  }
  joinGame(code, me) {
    this.leave(); code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return new Promise((res, rej) => {
      this.me = me; const p = this.makePeer(); this.peer = p; let done = false;
      const fail = e => { if (!done) { done = true; rej(e instanceof Error ? e : new Error(String(e))); this.leave(); } };
      const to = setTimeout(() => fail(new Error('Could not reach host. Both players may be behind strict NAT (STUN-only).')), 15000);
      p.on('error', e => { clearTimeout(to); fail(new Error(e.type === 'peer-unavailable' ? 'No game with code ' + code : (e.message || e.type))); });
      p.on('open', id => {
        this.myId = id;
        const c = p.connect(PREFIX + code, { reliable: false, serialization: 'json' }); this.host = c;
        c.on('open', () => c.send({ t: 'hello', name: me.name, color: me.color, model: me.model, av: me.av }));
        c.on('data', d => {
          if (!d || typeof d !== 'object') return;
          if (d.t === 'welcome') { clearTimeout(to); done = true; this.role = 'guest'; this.code = code; res(d); this.onEvent('status', 'Connected · ' + code); this.openAssets(p, code); }
          else if (d.t === 'states') {
            const seen = new Set();
            for (const s of d.p) { if (s.id === this.myId) continue; seen.add(s.id); const pl = this.players.get(s.id) || {}; this.players.set(s.id, Object.assign(pl, { name: s.n, color: s.c, model: s.m || pl.model, av: this.avs.get(s.id) ?? pl.av ?? null, lat: s.la, lon: s.lo, yaw: s.y, speed: s.v, h: +s.h || 0, pi: +s.pi || 0, ro: +s.ro || 0, hp: s.hp == null ? 100 : +s.hp, rd: typeof s.rd === 'string' ? s.rd : '', sx: (+s.sx || 0) & 7, t: performance.now() })); }
            this.hostInv = !!d.ih;
            for (const id of [...this.players.keys()]) if (!seen.has(id)) { this.onEvent('leave', this.players.get(id).name); this.players.delete(id); this.dropAssets(id); }
          } else if (d.t === 'avs') { for (const [id, a] of d.list || []) { const v = typeof a === 'string' && a.length < 20000 && /^data:image\/(jpeg|png|webp);base64,/.test(a) ? a : null; this.avs.set(id, v); const pl = this.players.get(id); if (pl) pl.av = v; } }
          else if (d.t === 'left') { this.dropAssets(d.id); const pl = this.players.get(d.id); if (pl) { this.players.delete(d.id); this.onEvent('leave', pl.name); } }
          else if (d.t === 'chat') this.onEvent('chat', d.from + ': ' + d.msg);
          else if (d.t === 'gars' && Array.isArray(d.all)) {
            const inn = [], lts = new Map(), wps = new Map(), drs = new Map(); for (const e of d.all.slice(0, 32)) { if (!Array.isArray(e) || e[0] === this.myId) continue; for (const g of this.cleanGarages(e[2])) inn.push({ ...g, o: String(e[0]).slice(0, 40), on: String(e[1] || '').slice(0, 16) }); const lt = this.cleanLights(e[3]); if (lt) lts.set(String(e[0]).slice(0, 40), lt); const wp = this.cleanWeapon(e[4]); if (wp) wps.set(String(e[0]).slice(0, 40), wp); const dr = cleanDriver(e[5]); if (dr) drs.set(String(e[0]).slice(0, 40), dr); }
            this.garagesIn = inn; this.lightsIn = lts; this.weaponIn = wps; this.driverIn = drs;
          }
          else if (d.t === 'sh') { const sh = this.cleanShot(d); if (sh && d.from !== this.myId) this.onEvent('shot', { ...sh, from: String(d.from || '').slice(0, 40) }); }
          else if (d.t === 'm' && typeof d.from === 'string') { const m = this.cleanMsg(d.m); if (m) this.recvMsg(d.from, m); }
          else if (d.t === 'bye') { this.onEvent('hostleft'); this.leave(); }
        });
        c.on('close', () => { if (this.role) { this.onEvent('hostleft'); this.leave(); } });
        c.on('iceStateChanged', s => { if (s === 'failed') fail(new Error('Peer connection failed — strict NAT on one side (STUN-only, no relay).')); });
      });
    });
  }
  // called every frame with my state in lat/lon
  tick(dt, mine) {
    if (!this.role) return; this.sendT += dt; if (this.sendT < 1 / 15) return; this.sendT = 0;
    if (this.garDirty || performance.now() - (this.garTs || 0) > 4000) { this.garTs = performance.now(); this.garDirty = false; this.sendGarages(); }
    const r = v => Math.round(v * 1e7) / 1e7;
    if (this.role === 'guest') { if (this.host?.open) this.host.send({ t: 's', la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1), h: +(mine.h || 0).toFixed(1), pi: +(mine.pi || 0).toFixed(2), ro: +(mine.ro || 0).toFixed(2), hp: Math.round(mine.hp ?? 100), rd: mine.rd || '', sx: mine.sx | 0, n: this.me.name, c: this.me.color, m: this.me.model }); }
    else {
      this.avT += 1 / 15; if (this.avT > 6) this.sendAvatars();
      const p = [{ id: this.myId, n: this.me.name, c: this.me.color, m: this.me.model, la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1), h: +(mine.h || 0).toFixed(1), pi: +(mine.pi || 0).toFixed(2), ro: +(mine.ro || 0).toFixed(2), hp: Math.round(mine.hp ?? 100), rd: mine.rd || '', sx: mine.sx | 0 }];
      for (const [id, s] of this.players) if (s.lat != null) p.push({ id, n: s.name, c: s.color, m: s.model, la: s.lat, lo: s.lon, y: s.yaw, v: s.speed, h: s.h || 0, pi: s.pi || 0, ro: s.ro || 0, hp: s.hp ?? 100, rd: s.rd || '', sx: s.sx | 0 });
      this.broadcast({ t: 'states', p, ih: this.inv ? 1 : 0 });
    }
  }
  // avatars travel separately from the 15Hz state stream; host relays the full list now and then
  sendAvatars() { if (this.role !== 'host') return; this.avT = 0; const list = [[this.myId, this.me?.av || null]]; for (const [id, s] of this.players) list.push([id, s.av || null]); this.broadcast({ t: 'avs', list }); }
  sendAvatar(a) { if (this.me) this.me.av = a; if (this.role === 'host') this.sendAvatars(); else if (this.role === 'guest' && this.host?.open) { const m = { t: 'av', av: a }; this.host.send(m); setTimeout(() => this.host?.open && this.host.send(m), 1200); } }
  // ---------- custom asset sharing ----------
  openAssets(p, code) {
    const ac = p.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { assets: 1 } }); this.ac = ac;
    ac.on('open', () => { for (const k of ASSET_KEYS) if (this.mine[k]) this.pushAsset(ac, this.myId, k, this.mine[k]); });
    ac.on('data', d => this.onAsset(d, null));
  }
  acceptAssets(c) {
    c.on('open', () => {
      this.aconns.set(c.peer, c);
      for (const k of ASSET_KEYS) if (this.mine[k]) this.pushAsset(c, this.myId, k, this.mine[k]);
      for (const [key, a] of this.assets) { const [o, k] = key.split('|'); if (o !== c.peer) this.pushAsset(c, o, k, a); }
    });
    c.on('data', d => this.onAsset(d, c.peer));
    const drop = () => this.aconns.delete(c.peer); c.on('close', drop); c.on('error', drop);
  }
  // from = sender's peer id when we are host (guests can only send their own stuff)
  onAsset(d, from) {
    if (!d || typeof d !== 'object' || !ASSET_KEYS.includes(d.k)) return;
    const o = from || String(d.o || ''); if (!o || o === this.myId) return;
    const key = o + '|' + d.k, m = (d.m && typeof d.m === 'object') ? d.m : {};
    if (d.t === 'ax') { this.assets.delete(key); this.onEvent('asset', { o, k: d.k }); if (from) this.relay({ t: 'ax', o, k: d.k }, from); return; }
    if (d.t === 'am') { const a = this.assets.get(key); if (a && a.h === d.h) { a.m = m; this.onEvent('asset', { o, k: d.k }); if (from) this.relay({ t: 'am', o, k: d.k, h: d.h, m }, from); } return; }
    if (d.t !== 'ac' || typeof d.d !== 'string') return;
    const n = Math.min(1000, d.n | 0), pk = key + '|' + d.h; if (n < 1 || ((d.k === 'wo' || d.k === 'wi') && n > 40)) return; // wall pictures are small
    let pt = this.partial.get(pk); if (!pt) { pt = { n, got: 0, parts: new Array(n) }; this.partial.set(pk, pt); }
    if (pt.parts[d.i] == null) { pt.parts[d.i] = d.d; pt.got++; }
    if (pt.got < pt.n) return;
    this.partial.delete(pk);
    const a = { h: String(d.h), m, data: pt.parts.join('') };
    this.assets.set(key, a); this.onEvent('asset', { o, k: d.k });
    if (from) for (const [id, c] of this.aconns) if (id !== from && c.open) this.pushAsset(c, o, d.k, a);
  }
  relay(msg, except) { for (const [id, c] of this.aconns) if (id !== except && c.open) try { c.send(msg); } catch { } }
  async pushAsset(c, o, k, a) {
    const CH = 16000, n = Math.max(1, Math.ceil(a.data.length / CH));
    for (let i = 0; i < n; i++) {
      if (!c.open) return;
      const dc = c.dataChannel; while (dc && dc.bufferedAmount > 512 * 1024) { await new Promise(r => setTimeout(r, 40)); if (!c.open) return; }
      try { c.send({ t: 'ac', o, k, h: a.h, m: a.m, i, n, d: a.data.slice(i * CH, (i + 1) * CH) }); } catch { return; }
    }
  }
  // share (or stop sharing) my own model / paint picture
  setAsset(k, a) {
    this.mine[k] = a || null;
    const targets = this.role === 'host' ? [...this.aconns.values()] : this.ac ? [this.ac] : [];
    for (const c of targets) { if (!c.open) continue; if (a) this.pushAsset(c, this.myId, k, a); else try { c.send({ t: 'ax', o: this.myId, k }); } catch { } }
  }
  setAssetMeta(k, m) {
    const a = this.mine[k]; if (!a) return; a.m = m;
    const targets = this.role === 'host' ? [...this.aconns.values()] : this.ac ? [this.ac] : [];
    for (const c of targets) if (c.open) try { c.send({ t: 'am', o: this.myId, k, h: a.h, m }); } catch { }
  }
  dropAssets(o) { for (const k of ASSET_KEYS) if (this.assets.delete(o + '|' + k)) this.onEvent('asset', { o, k }); }
  // ---------- garages ----------
  // Every player's garages are shared with the whole session: guests send theirs to the host, the host sends everyone's to everyone.
  // Re-sent every few seconds because the data channel is unreliable.
  cleanGarages(l) {
    if (!Array.isArray(l)) return []; const out = [];
    for (const g of l.slice(0, 3)) {
      if (!g || typeof g !== 'object') continue; const la = +g.la, lo = +g.lo, y = +g.y; if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) continue;
      out.push({ i: String(g.i || '').slice(0, 12), n: String(g.n || 'Garage').slice(0, 18), la: Math.round(la * 1e7) / 1e7, lo: Math.round(lo * 1e7) / 1e7, y: isFinite(y) ? Math.round(y * 1000) / 1000 : 0, c: /^#[0-9a-f]{6}$/i.test(g.c) ? g.c : '#ff5a3c', f: Math.max(1, Math.min(6, (g.f | 0) || 1)) });
    }
    return out;
  }
  // car lights (headlights / taillights / underglow): a small config object, see carlights.js
  cleanLights(l) {
    if (!l || typeof l !== 'object') return null; const col = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : null), num = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }, out = {};
    for (const k of ['h', 't']) { const g = l[k]; if (g && typeof g === 'object') out[k] = { on: g.on ? 1 : 0, c: col(g.c) || (k === 'h' ? '#fff6d8' : '#ff2a3a'), dx: num(g.dx, -1, 1, 0), dy: num(g.dy, -1, 1, 0), dz: num(g.dz, -1, 1, 0), s: num(g.s, 0.4, 2.5, 1) }; }
    const u = l.u; if (u && typeof u === 'object') out.u = { on: u.on ? 1 : 0, c: col(u.c) || '#00e5ff', a: num(u.a, 0.2, 2, 1), s: num(u.s, 0.5, 1.6, 1) };
    return Object.keys(out).length ? out : null;
  }
  setLights(cfg) { const c = this.cleanLights(cfg), sig = JSON.stringify(c); if (sig === JSON.stringify(this.lightsMine)) return; this.lightsMine = c; this.garDirty = true; }
  // car weapon: which gun and where it's mounted (see weapons.js)
  cleanWeapon(w) {
    if (!w || typeof w !== 'object' || typeof w.w !== 'string' || !/^(mg|shot|rocket|rail|mine)$/.test(w.w)) return null; const n = (v, a, b) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : 0; };
    return { w: w.w, m: /^(roof|hood|twin)$/.test(w.m) ? w.m : 'roof', dx: n(w.dx, -1.5, 1.5), dy: n(w.dy, -0.8, 1.5), dz: n(w.dz, -2, 2), s: n(w.s, 0.6, 1.6) || 1 };
  }
  setWeapon(cfg) { const c = this.cleanWeapon(cfg), sig = JSON.stringify(c); if (sig === JSON.stringify(this.weaponMine)) return; this.weaponMine = c; this.garDirty = true; }
  setDriver(look) { const c = cleanDriver(look), sig = JSON.stringify(c); if (sig === JSON.stringify(this.driverMine)) return; this.driverMine = c; this.garDirty = true; }
  driverFor(id) { if (this.role === 'host') { const g = this.garagesBy.get(id); return g ? g.dr || null : null; } return this.driverIn.get(id) || null; }
  weaponFor(id) { if (this.role === 'host') { const g = this.garagesBy.get(id); return g ? g.wp || null : null; } return this.weaponIn.get(id) || null; }
  // a shot: shared so everyone sees it (positions as lat/lon + height, so every player's map lines up)
  cleanShot(d) {
    if (!d || typeof d.w !== 'string' || !/^(mg|shot|rocket|rail|mine)$/.test(d.w)) return null; const f = v => (typeof v === 'number' && isFinite(v) ? v : null);
    const la = f(d.la), lo = f(d.lo), y = f(d.y), dx = f(d.dx), dy = f(d.dy), dz = f(d.dz); if ([la, lo, y, dx, dy, dz].includes(null) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    return { w: d.w, la, lo, y, dx, dy, dz, vx: f(d.vx) || 0, vz: f(d.vz) || 0, n: (+d.n || 0) | 0, k: Math.max(1, Math.min(2, (+d.k || 1) | 0)) };
  }
  sendShot(sh) { try { if (this.role === 'host') this.broadcast({ t: 'sh', ...sh, from: this.myId }); else if (this.role === 'guest' && this.host?.open) this.host.send({ t: 'sh', ...sh }); } catch { } }
  lightsFor(id) { if (this.role === 'host') { const g = this.garagesBy.get(id); return g ? g.lt || null : null; } return this.lightsIn.get(id) || null; }
  setGarages(list) { const sig = JSON.stringify([list, this.me && this.me.name]); if (sig === this.garSig) return; this.garSig = sig; this.garagesMine = this.cleanGarages(list); this.garDirty = true; }
  remoteGarages() { // everyone else's garages in this session
    if (this.role === 'host') { const out = []; for (const [id, g] of this.garagesBy) for (const r of g.list) out.push({ ...r, o: id, on: g.name }); return out; }
    return this.role === 'guest' ? this.garagesIn : [];
  }
  sendGarages() {
    try {
      if (this.role === 'guest') { if (this.host?.open) this.host.send({ t: 'gar', list: this.garagesMine, lt: this.lightsMine, wp: this.weaponMine, dr: this.driverMine }); }
      else if (this.role === 'host') { const all = [[this.myId, this.me.name, this.garagesMine, this.lightsMine, this.weaponMine, this.driverMine]]; for (const [id, g] of this.garagesBy) all.push([id, g.name, g.list, g.lt, g.wp, g.dr]); this.broadcast({ t: 'gars', all }); }
    } catch { }
  }
  // ---------- direct messages (ride requests etc.) ----------
  // Guests only talk to the host, which relays. The data channel is unreliable, so each message is sent three times and de-duplicated by id.
  cleanMsg(m) { if (!m || typeof m !== 'object' || typeof m.k !== 'string') return null; return { k: m.k.slice(0, 6), id: String(m.id || '').slice(0, 14), seat: (+m.seat || 0) & 7, why: String(m.why || '').slice(0, 12), d: Math.max(0, Math.min(200, (+m.d || 0) | 0)), w: String(m.w || '').slice(0, 8) }; }
  sendTo(to, m) {
    if (!this.role || !to) return; const msg = { ...m, id: Math.random().toString(36).slice(2, 10) };
    const go = () => {
      if (!this.role) return;
      try {
        if (this.role === 'host') { const c = this.conns.get(to); if (c?.open) c.send({ t: 'm', from: this.myId, m: msg }); }
        else if (this.host?.open) this.host.send({ t: 'fwd', to, m: msg });
      } catch { }
    };
    go(); setTimeout(go, 250); setTimeout(go, 800);
  }
  recvMsg(from, m) {
    if (m.id) { if (this.seenMsgs.has(m.id)) return; this.seenMsgs.add(m.id); if (this.seenMsgs.size > 300) this.seenMsgs.delete(this.seenMsgs.values().next().value); }
    this.onEvent('ride', { from, m });
  }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) try { c.send(m); } catch { } }
  leave() {
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    this.seenMsgs.clear(); this.garagesBy.clear(); this.garagesIn = []; this.lightsIn = new Map(); this.weaponIn = new Map(); this.driverIn = new Map(); this.garDirty = false;
    try { this.peer && this.peer.destroy(); } catch { }
    this.peer = null; this.role = null; this.conns.clear(); this.aconns.clear(); this.ac = null; this.partial.clear(); for (const k of [...this.assets.keys()]) { this.assets.delete(k); this.onEvent('asset', { o: k.split('|')[0], k: k.split('|')[1] }); } this.players.clear(); this.avs.clear(); this.host = null; this.code = ''; this.hostInv = false;
    this.onEvent('status', '');
  }
}
