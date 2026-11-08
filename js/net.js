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
    this.players = new Map(); // id -> {name,color,lat,lon,yaw,speed,t}
    this.myId = ''; this.onEvent = () => { }; this.sendT = 0;
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
      p.on('connection', c => this.acceptGuest(c));
      p.on('disconnected', () => { try { p.reconnect(); } catch { } });
    });
  }
  acceptGuest(c) {
    c.on('open', () => { this.conns.set(c.peer, c); });
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') {
        this.players.set(c.peer, { name: String(d.name || 'Driver').slice(0, 16), color: d.color || '#fff', lat: null, lon: null, yaw: 0, speed: 0, t: performance.now() });
        c.send({ t: 'welcome', id: c.peer, origin: this.originFn ? this.originFn() : this.origin, mode: this.modeFn ? this.modeFn() : 'world' });
        this.onEvent('join', this.players.get(c.peer).name);
      } else if (d.t === 's') { const pl = this.players.get(c.peer); if (pl) Object.assign(pl, { lat: d.la, lon: d.lo, yaw: d.y, speed: d.v, t: performance.now() }); }
      else if (d.t === 'chat') this.broadcast({ t: 'chat', from: this.players.get(c.peer)?.name, msg: String(d.msg).slice(0, 120) });
    });
    const drop = () => { const pl = this.players.get(c.peer); this.conns.delete(c.peer); if (pl) { this.players.delete(c.peer); this.onEvent('leave', pl.name); this.broadcast({ t: 'left', id: c.peer }); } };
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
        c.on('open', () => c.send({ t: 'hello', name: me.name, color: me.color }));
        c.on('data', d => {
          if (!d || typeof d !== 'object') return;
          if (d.t === 'welcome') { clearTimeout(to); done = true; this.role = 'guest'; this.code = code; res(d); this.onEvent('status', 'Connected · ' + code); }
          else if (d.t === 'states') {
            const seen = new Set();
            for (const s of d.p) { if (s.id === this.myId) continue; seen.add(s.id); const pl = this.players.get(s.id) || {}; this.players.set(s.id, Object.assign(pl, { name: s.n, color: s.c, lat: s.la, lon: s.lo, yaw: s.y, speed: s.v, t: performance.now() })); }
            for (const id of [...this.players.keys()]) if (!seen.has(id)) { this.onEvent('leave', this.players.get(id).name); this.players.delete(id); }
          } else if (d.t === 'left') { const pl = this.players.get(d.id); if (pl) { this.players.delete(d.id); this.onEvent('leave', pl.name); } }
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
    if (this.role === 'guest') { if (this.host?.open) this.host.send({ t: 's', la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1) }); }
    else {
      const p = [{ id: this.myId, n: this.me.name, c: this.me.color, la: r(mine.lat), lo: r(mine.lon), y: +mine.yaw.toFixed(3), v: +mine.speed.toFixed(1) }];
      for (const [id, s] of this.players) if (s.lat != null) p.push({ id, n: s.name, c: s.color, la: s.lat, lo: s.lon, y: s.yaw, v: s.speed });
      this.broadcast({ t: 'states', p });
    }
  }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) try { c.send(m); } catch { } }
  leave() {
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    try { this.peer && this.peer.destroy(); } catch { }
    this.peer = null; this.role = null; this.conns.clear(); this.players.clear(); this.host = null; this.code = '';
    this.onEvent('status', '');
  }
}
