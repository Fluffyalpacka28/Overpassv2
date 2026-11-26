// A tiny MQTT 3.1.1 client over a secure WebSocket, for the multiplayer relay and the Open games list.
// Free public brokers pass small messages between players over ordinary HTTPS-style connections, so it works on networks
// (mobile data, school / hotel wifi, strict routers) where direct peer-to-peer can't get through. No sign-up, no server of ours.
// Only plain QoS 0 publish / subscribe, retained messages and a "last will" are used.
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const te = new TextEncoder(), td = new TextDecoder();
const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const varint = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
const packet = (h, body) => { const len = body.length, out = new Uint8Array(1 + varint(len).length + len); const v = varint(len); out[0] = h; out.set(v, 1); out.set(body, 1 + v.length); return out; };
function cat(arrs) { let n = 0; for (const a of arrs) n += a.length; const o = new Uint8Array(n); let i = 0; for (const a of arrs) { o.set(a, i); i += a.length; } return o; }
const match = (filter, topic) => { const f = filter.split('/'), t = topic.split('/'); for (let i = 0; i < f.length; i++) { if (f[i] === '#') return true; if (i >= t.length) return false; if (f[i] !== '+' && f[i] !== t[i]) return false; } return f.length === t.length; };

export class Mqtt {
  constructor() { this.ws = null; this.subs = new Map(); this.buf = new Uint8Array(0); this.pid = 1; this.connected = false; this.onclose = null; this.url = ''; this.will = null; this.pingT = null; }
  // try the brokers in order; resolves with the url that worked
  async connect(opts = {}) {
    this.will = opts.will || null;
    const list = opts.url ? [opts.url] : (window.OVERPASS_BROKERS || BROKERS);
    let last = null;
    for (const url of list) { try { await this.open(url, opts.timeout || 6000); return url; } catch (e) { last = e; } }
    throw last || new Error('No relay reachable');
  }
  open(url, timeout) {
    return new Promise((res, rej) => {
      let done = false; const fail = e => { if (done) return; done = true; try { ws.close(); } catch { } rej(e instanceof Error ? e : new Error(String(e))); };
      const ws = new WebSocket(url, 'mqtt'); ws.binaryType = 'arraybuffer'; this.ws = ws; this.url = url;
      const to = setTimeout(() => fail(new Error('Relay timed out')), timeout);
      ws.onopen = () => {
        const id = 'ovp' + Math.random().toString(36).slice(2, 12);
        let flags = 0x02; const pay = [...str(id)];
        if (this.will) { flags |= 0x04 | (this.will.retain ? 0x20 : 0); pay.push(...str(this.will.topic)); const m = te.encode(this.will.payload || ''); pay.push(m.length >> 8, m.length & 255, ...m); }
        ws.send(packet(0x10, new Uint8Array([...str('MQTT'), 4, flags, 0, 60, ...pay])));
      };
      ws.onmessage = ev => {
        this.buf = cat([this.buf, new Uint8Array(ev.data)]);
        for (;;) {
          if (this.buf.length < 2) break;
          let mul = 1, len = 0, i = 1, b; do { if (i >= this.buf.length) return; b = this.buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
          if (this.buf.length < i + len) break;
          const type = this.buf[0] >> 4, flags = this.buf[0] & 15, body = this.buf.subarray(i, i + len); this.buf = this.buf.slice(i + len);
          if (type === 2) { clearTimeout(to); if (body[1] !== 0) return fail(new Error('Relay refused (' + body[1] + ')')); done = true; this.connected = true; this.pingT = setInterval(() => this.raw(new Uint8Array([0xC0, 0])), 25000); res(url); }
          else if (type === 3) {
            const tl = (body[0] << 8) | body[1], topic = td.decode(body.subarray(2, 2 + tl)), q = (flags >> 1) & 3, start = 2 + tl + (q ? 2 : 0);
            const text = td.decode(body.subarray(start)); let data = null; if (text) try { data = JSON.parse(text); } catch { continue; }
            for (const [f, fn] of this.subs) if (match(f, topic)) try { fn(data, topic); } catch (e) { console.warn('[relay]', e); }
          }
        }
      };
      ws.onerror = () => fail(new Error('Relay connection failed'));
      ws.onclose = () => { clearInterval(this.pingT); const was = this.connected; this.connected = false; if (!done) fail(new Error('Relay closed')); else if (was && this.onclose) this.onclose(); };
    });
  }
  raw(p) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(p); } catch { } }
  subscribe(filter, fn) { this.subs.set(filter, fn); const id = this.pid++ & 0xffff || 1; this.raw(packet(0x82, new Uint8Array([id >> 8, id & 255, ...str(filter), 0]))); }
  unsubscribe(filter) { this.subs.delete(filter); const id = this.pid++ & 0xffff || 1; this.raw(packet(0xA2, new Uint8Array([id >> 8, id & 255, ...str(filter)]))); }
  publish(topic, data, retain = false) { const m = data == null ? new Uint8Array(0) : te.encode(JSON.stringify(data)); this.raw(packet(0x30 | (retain ? 1 : 0), cat([new Uint8Array(str(topic)), m]))); }
  get buffered() { return this.ws ? this.ws.bufferedAmount : 0; }
  close() { this.onclose = null; this.raw(new Uint8Array([0xE0, 0])); clearInterval(this.pingT); try { this.ws && this.ws.close(); } catch { } this.connected = false; this.ws = null; }
}
