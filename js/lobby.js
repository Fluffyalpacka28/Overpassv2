// Open games list, with no server of our own: each public host keeps a small "retained" note about its game on a free
// public MQTT broker (mqtt.js), and anyone browsing just subscribes to all of them. If a host vanishes, the broker deletes
// its note for it (MQTT "last will"), and notes that stop being refreshed drop off the list anyway.
import { Mqtt } from './mqtt.js';

const TOPIC = 'overpassv2-osm/lobby/';
const STALE = 50000;           // ms without a refresh before a game drops off
const REFRESH = 15000;

export class Lobby {
  constructor() { this.link = null; this.state = 'off'; this.rooms = new Map(); this.list = []; this.listeners = new Set(); this.mine = null; this.want = 0; this.retryT = null; this.pubT = null; this.sweepT = null; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.list = [...this.rooms.values()].map(r => r.room); for (const f of this.listeners) try { f(this.list, this.state); } catch { } }
  start() { this.want++; this.ensure(); }
  stop() { this.want = Math.max(0, this.want - 1); if (!this.want && !this.mine) this.close(); }
  refresh() { if (!this.link) this.ensure(); else this.emit(); }
  close() { clearTimeout(this.retryT); clearInterval(this.pubT); clearInterval(this.sweepT); this.pubT = this.sweepT = null; if (this.link) { const l = this.link; this.link = null; l.close(); } this.state = 'off'; this.rooms.clear(); this.emit(); }
  async ensure() {
    if (this.link || this.connecting) return; this.connecting = true; this.state = 'connecting'; this.emit();
    const code = this.mine && this.mine.code, link = new Mqtt();
    try {
      // if I'm hosting, the broker clears my listing for me should I drop off without saying goodbye
      await link.connect(code ? { will: { topic: TOPIC + code, payload: '', retain: true } } : {});
    } catch (e) { this.connecting = false; this.state = 'error'; this.emit(); this.retryT = setTimeout(() => this.ensure(), 6000); return; }
    this.connecting = false; this.link = link; link.willCode = code || null; this.state = 'online';
    link.onclose = () => { if (this.link === link) { this.link = null; this.state = 'error'; this.emit(); this.retryT = setTimeout(() => this.ensure(), 3000); } };
    link.subscribe(TOPIC + '+', (room, topic) => {
      const k = topic.slice(TOPIC.length);
      if (!room || typeof room !== 'object') { this.rooms.delete(k); this.emit(); return; }
      const r = clean(room); if (!r || r.code !== k) return;
      if (r.t && Math.abs(Date.now() - r.t) > 6 * 3600e3) return; // an abandoned note from long ago
      this.rooms.set(k, { room: r, seen: Date.now() }); this.emit();
    });
    clearInterval(this.sweepT); this.sweepT = setInterval(() => { const now = Date.now(); let ch = false; for (const [k, v] of this.rooms) if (now - v.seen > STALE && !(this.mine && this.mine.code === k)) { this.rooms.delete(k); ch = true; } if (ch) this.emit(); }, 5000);
    this.emit(); if (this.mine) this.push();
  }
  push() { if (!this.mine || !this.link) return; this.link.publish(TOPIC + this.mine.code, { ...this.mine, t: Date.now() }, true); }
  // list my game (or update it)
  publish(room) {
    const r = clean(room); if (!r) return;
    const changed = !this.mine || this.mine.code !== r.code; this.mine = r;
    // a new code needs a connection whose "last will" clears that code
    if (changed && this.link && this.link.willCode !== r.code) { const l = this.link; this.link = null; l.close(); }
    if (!this.link) this.ensure(); else this.push();
    if (!this.pubT) this.pubT = setInterval(() => this.push(), REFRESH);
  }
  unpublish() {
    if (!this.mine) return; const code = this.mine.code; this.mine = null; clearInterval(this.pubT); this.pubT = null;
    if (this.link) this.link.publish(TOPIC + code, null, true);
    this.rooms.delete(code); this.emit();
    if (!this.want) setTimeout(() => { if (!this.mine && !this.want) this.close(); }, 600);
  }
}
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').slice(0, n);
function clean(r) {
  if (!r || typeof r !== 'object' || typeof r.code !== 'string' || !/^[A-Z0-9]{6}$/.test(r.code)) return null;
  return { code: r.code, name: str(r.name, 32) || 'Open game', host: str(r.host, 16), place: str(r.place, 40), mode: r.mode === 'map' ? 'map' : r.mode === 'model' ? 'model' : 'world', players: Math.max(1, Math.min(32, r.players | 0 || 1)), v: r.v | 0, t: +r.t || 0 };
}
