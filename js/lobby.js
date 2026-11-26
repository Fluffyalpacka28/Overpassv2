// Server browser, without a server. Every copy of the game tries to claim one well-known PeerJS id; whoever gets it keeps
// the list of open games for everyone else (hosts tell it about their game every few seconds, browsers ask it for the list).
// If that player leaves, the next one to notice claims the id and the hosts fill the list back in within seconds.
// Uses the same free PeerJS signalling (and relay settings) as the games themselves.
import { getIce } from './net.js';

const LOBBY_ID = 'osmracer-lobby-v2';
const TTL = 30000;           // a game drops off the list if its host hasn't checked in for this long
const ANNOUNCE_EVERY = 9000;
const VER = 2;

export class Lobby {
  constructor() { this.peer = null; this.isRegistry = false; this.rooms = new Map(); this.conn = null; this.state = 'off'; this.list = []; this.listeners = new Set(); this.mine = null; this.want = 0; this.retryT = null; this.aT = null; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) try { f(this.list, this.state); } catch { } }
  // keep a line to the lobby open while someone's browsing or hosting a public game
  async start() {
    this.want++; if (this.peer || this.starting) return; this.starting = true;
    try { this.ice = await getIce(); } catch { this.ice = undefined; }
    this.starting = false; if (this.want > 0) this.connect();
  }
  stop() { this.want = Math.max(0, this.want - 1); if (this.want === 0 && !this.mine) this.close(); }
  close() {
    clearTimeout(this.retryT); clearInterval(this.aT); this.aT = null;
    try { this.conn && this.conn.close(); } catch { } try { this.peer && this.peer.destroy(); } catch { }
    this.peer = null; this.conn = null; this.isRegistry = false; this.state = 'off'; this.rooms.clear(); this.emit();
  }
  retry(ms = 1500 + Math.random() * 3000) { clearTimeout(this.retryT); this.retryT = setTimeout(() => { if (this.want > 0 || this.mine) { this.close(); this.connect(); } }, ms); }
  connect() {
    if (!window.Peer) { this.state = 'error'; this.emit(); return; }
    this.state = 'connecting'; this.emit();
    // first try to be the lobby
    const p = new window.Peer(LOBBY_ID, { config: { iceServers: this.ice }, debug: 0 }); this.peer = p;
    p.on('open', () => {
      this.isRegistry = true; this.state = 'online'; this.rooms.clear();
      if (this.mine) this.rooms.set(this.mine.code, { ...this.mine, t: Date.now() });
      p.on('connection', c => this.serve(c));
      this.refreshList(); this.startAnnouncing();
    });
    p.on('error', e => {
      if (e.type === 'unavailable-id' && p === this.peer) { try { p.destroy(); } catch { } this.peer = null; this.join(); }
      else if (e.type === 'peer-unavailable' && !this.isRegistry) this.retry(800 + Math.random() * 1500);
      else if (p === this.peer && !this.isRegistry) { this.state = 'error'; this.emit(); this.retry(5000); }
    });
    p.on('disconnected', () => { try { p.reconnect(); } catch { } });
  }
  // someone else is the lobby: talk to them
  join() {
    const p = new window.Peer(undefined, { config: { iceServers: this.ice }, debug: 0 }); this.peer = p;
    p.on('open', () => {
      const c = p.connect(LOBBY_ID, { reliable: true, serialization: 'json' }); this.conn = c;
      const to = setTimeout(() => { if (!c.open) this.retry(); }, 9000);
      c.on('open', () => { clearTimeout(to); this.state = 'online'; this.emit(); c.send({ t: 'list', v: VER }); this.startAnnouncing(); });
      c.on('data', d => { if (d && d.t === 'rooms' && Array.isArray(d.list)) { this.list = d.list.map(clean).filter(Boolean); this.emit(); } });
      c.on('close', () => { if (this.peer === p) this.retry(); });
      c.on('error', () => { if (this.peer === p) this.retry(); });
    });
    p.on('error', e => { if (p !== this.peer) return; if (e.type === 'peer-unavailable') this.retry(600 + Math.random() * 1500); else { this.state = 'error'; this.emit(); this.retry(5000); } });
    p.on('disconnected', () => { try { p.reconnect(); } catch { } });
  }
  // the lobby's side
  serve(c) {
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'list') { try { c.send({ t: 'rooms', list: this.roomList() }); } catch { } }
      else if (d.t === 'announce') { const r = clean(d.room); if (r) { r.t = Date.now(); r.via = c.peer; this.rooms.set(r.code, r); this.refreshList(); } }
      else if (d.t === 'gone' && typeof d.code === 'string') { this.rooms.delete(d.code); this.refreshList(); }
    });
    c.on('close', () => { for (const [k, r] of this.rooms) if (r.via === c.peer) this.rooms.delete(k); this.refreshList(); });
  }
  roomList() { const now = Date.now(); for (const [k, r] of this.rooms) if (now - r.t > TTL) this.rooms.delete(k); return [...this.rooms.values()].map(r => { const { via, ...o } = r; return o; }); }
  refreshList() { this.list = this.roomList(); this.emit(); }
  startAnnouncing() {
    clearInterval(this.aT);
    const tick = () => {
      if (this.isRegistry) { if (this.mine) this.rooms.set(this.mine.code, { ...this.mine, t: Date.now() }); this.refreshList(); }
      else if (this.conn && this.conn.open) { try { if (this.mine) this.conn.send({ t: 'announce', room: this.mine }); this.conn.send({ t: 'list', v: VER }); } catch { } }
    };
    tick(); this.aT = setInterval(tick, ANNOUNCE_EVERY);
  }
  refresh() { if (this.isRegistry) this.refreshList(); else if (this.conn && this.conn.open) try { this.conn.send({ t: 'list', v: VER }); } catch { } else if (!this.peer) this.start(); }
  // list my game (or update it: player count, place)
  publish(room) {
    const r = clean(room); if (!r) return;
    const first = !this.mine; this.mine = r;
    if (first) this.start();
    if (this.isRegistry) { this.rooms.set(r.code, { ...r, t: Date.now() }); this.refreshList(); }
    else if (this.conn && this.conn.open) try { this.conn.send({ t: 'announce', room: r }); } catch { }
  }
  unpublish() {
    if (!this.mine) return; const code = this.mine.code; this.mine = null;
    if (this.isRegistry) { this.rooms.delete(code); this.refreshList(); }
    else if (this.conn && this.conn.open) try { this.conn.send({ t: 'gone', code }); } catch { }
    if (this.want === 0) setTimeout(() => { if (!this.mine && this.want === 0) this.close(); }, 500);
  }
}
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').slice(0, n);
function clean(r) {
  if (!r || typeof r !== 'object' || typeof r.code !== 'string' || !/^[A-Z0-9]{6}$/.test(r.code)) return null;
  return { code: r.code, name: str(r.name, 32) || 'Open game', host: str(r.host, 16), place: str(r.place, 40), mode: r.mode === 'map' ? 'map' : r.mode === 'model' ? 'model' : 'world', players: Math.max(1, Math.min(32, r.players | 0 || 1)), v: r.v | 0, t: +r.t || 0 };
}
