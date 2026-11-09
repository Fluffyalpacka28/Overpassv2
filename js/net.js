// Peer-to-peer multiplayer over PeerJS with STUN-only ICE (no TURN relay).
// Host relays everybody's state. States carry lat/lon so each peer can use its own local origin.
export const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const PREFIX = 'osmracer-';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Net {
  constructor() {
    this.peer = null; this.role = null; this.code = ''; this.conns = new Map(); this.host = null;
    this.avs = new Map(); this.avT = 0;
    this.players = new Map(); // id -> {name,color,lat,lon,yaw,speed,t}
    this.myId = ''; this.onEvent = () => { }; this.sendT = 0;
    // custom car looks (3D model + picture paint), shared over a separate reliable channel
    this.mine = { glb: null, skin: null }; this.assets = new Map(); this.aconns = new Map(); this.ac = null; this.partial = new Map();
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
        c.send({ t: 'welcome', id: c.peer, origin: this.originFn ? this.originFn() : this.origin, mode: this.modeFn ? this.modeFn() : 'world' });
        this.onEvent('join', this.players.get(c.peer).name); setTimeout(() => this.sendAvatars(), 300);
      } else if (d.t === 's') { const pl = this.players.get(c.peer); if (pl) { Object.assign(pl, { lat: d.la, lon: d.lo, yaw: d.y, speed: d.v, t: performance.now() }); if (d.n) pl.name = String(d.n).slice(0, 16); if (d.c) pl.color = String(d.c).slice(0, 9); if (d.m) pl.model = String(d.m).slice(0, 12); } }
      else if (d.t === 'av') { const pl = this.players.get(c.peer); if (pl) { pl.av = (typeof d.av === 'string' && d.av.length < 20000 && /^data:image\/(jpeg|png|webp);base64,/.test(d.av) ? d.av : null); this.sendAvatars(); } }
      else if (d.t === 'chat') this.broadcast({ t: 'chat', from: this.players.get(c.peer)?.name, msg: String(d.msg).slice(0, 120) });
    });
    const drop = () => { const pl = this.players.get(c.peer); this.conns.delete(c.peer); this.dropAssets(c.peer); if (pl) { this.players.delete(c.peer); this.onEvent('leave', pl.name); this.broadcast({ t: 'left', id: c.peer }); } };
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
            for (const s of d.p) { if (s.id === this.myId) continue; seen.add(s.id); const pl = this.players.get(s.id) || {}; this.players.set(s.id, Object.assign(pl, { name: s.n, color: s.c, model: s.m || pl.model, av: this.avs.get(s.id) ?? pl.av ?? null, lat: s.la, lon: s.lo, yaw: s.y, speed: s.v, t: performance.now() })); }
            for (const id of [...this.players.keys()]) if (!seen.has(id)) { this.onEvent('leave', this.players.get(id).name); this.players.delete(id); this.dropAssets(id); }
          } else if (d.t === 'avs') { for (const [id, a] of d.list || []) { const v = typeof a === 'string' && a.length < 20000 && /^data:image\/(jpeg|png|webp);base64,/.test(a) ? a : null; this.avs.set(id, v); const pl = this.players.get(id); if (pl) pl.av = v; } }
          else if (d.t === 'left') { this.dropAssets(d.id); const pl = this.players.get(d.id); if (pl) { this.players.delete(d.id); this.onEvent('leave', pl.name); } }
          else if (d.t === 'chat') this.onEvent('chat', d.from + ': ' + d.msg);
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
    const r = v => Math.round(v * 1e7) / 1e7;
    if (this.role === 'guest') { if (this.host?.open) this.host.send({ t: 's', la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1), n: this.me.name, c: this.me.color, m: this.me.model }); }
    else {
      this.avT += 1 / 15; if (this.avT > 6) this.sendAvatars();
      const p = [{ id: this.myId, n: this.me.name, c: this.me.color, m: this.me.model, la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1) }];
      for (const [id, s] of this.players) if (s.lat != null) p.push({ id, n: s.name, c: s.color, m: s.model, la: s.lat, lo: s.lon, y: s.yaw, v: s.speed });
      this.broadcast({ t: 'states', p });
    }
  }
  // avatars travel separately from the 15Hz state stream; host relays the full list now and then
  sendAvatars() { if (this.role !== 'host') return; this.avT = 0; const list = [[this.myId, this.me?.av || null]]; for (const [id, s] of this.players) list.push([id, s.av || null]); this.broadcast({ t: 'avs', list }); }
  sendAvatar(a) { if (this.me) this.me.av = a; if (this.role === 'host') this.sendAvatars(); else if (this.role === 'guest' && this.host?.open) { const m = { t: 'av', av: a }; this.host.send(m); setTimeout(() => this.host?.open && this.host.send(m), 1200); } }
  // ---------- custom asset sharing ----------
  openAssets(p, code) {
    const ac = p.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { assets: 1 } }); this.ac = ac;
    ac.on('open', () => { for (const k of ['glb', 'skin']) if (this.mine[k]) this.pushAsset(ac, this.myId, k, this.mine[k]); });
    ac.on('data', d => this.onAsset(d, null));
  }
  acceptAssets(c) {
    c.on('open', () => {
      this.aconns.set(c.peer, c);
      for (const k of ['glb', 'skin']) if (this.mine[k]) this.pushAsset(c, this.myId, k, this.mine[k]);
      for (const [key, a] of this.assets) { const [o, k] = key.split('|'); if (o !== c.peer) this.pushAsset(c, o, k, a); }
    });
    c.on('data', d => this.onAsset(d, c.peer));
    const drop = () => this.aconns.delete(c.peer); c.on('close', drop); c.on('error', drop);
  }
  // from = sender's peer id when we are host (guests can only send their own stuff)
  onAsset(d, from) {
    if (!d || typeof d !== 'object' || (d.k !== 'glb' && d.k !== 'skin')) return;
    const o = from || String(d.o || ''); if (!o || o === this.myId) return;
    const key = o + '|' + d.k, m = (d.m && typeof d.m === 'object') ? d.m : {};
    if (d.t === 'ax') { this.assets.delete(key); this.onEvent('asset', { o, k: d.k }); if (from) this.relay({ t: 'ax', o, k: d.k }, from); return; }
    if (d.t === 'am') { const a = this.assets.get(key); if (a && a.h === d.h) { a.m = m; this.onEvent('asset', { o, k: d.k }); if (from) this.relay({ t: 'am', o, k: d.k, h: d.h, m }, from); } return; }
    if (d.t !== 'ac' || typeof d.d !== 'string') return;
    const n = Math.min(1000, d.n | 0), pk = key + '|' + d.h; if (n < 1) return;
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
  dropAssets(o) { for (const k of ['glb', 'skin']) if (this.assets.delete(o + '|' + k)) this.onEvent('asset', { o, k }); }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) try { c.send(m); } catch { } }
  leave() {
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    try { this.peer && this.peer.destroy(); } catch { }
    this.peer = null; this.role = null; this.conns.clear(); this.aconns.clear(); this.ac = null; this.partial.clear(); for (const k of [...this.assets.keys()]) { this.assets.delete(k); this.onEvent('asset', { o: k.split('|')[0], k: k.split('|')[1] }); } this.players.clear(); this.avs.clear(); this.host = null; this.code = '';
    this.onEvent('status', '');
  }
}
