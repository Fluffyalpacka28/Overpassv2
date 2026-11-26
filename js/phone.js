import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The phone: a little OS drawn into a canvas, shown two ways.
//  - on a screen: the phone button (or ` key) pops it up over the game; tap it with your finger or the mouse
//  - in VR: a real 3D phone on your right hip. Grab it (grip / fist), poke the screen with your other hand's finger.
//    Let go of it gently and it stays where you put it (on the dash, the seat...). Drop or fling it and it springs
//    back to your hip. Squeeze at your hip to call it back from wherever you left it.
// Apps: Messages, Phone, Camera, Travel, Settings, Friends, Overpass, Bank, Maps. What they do is wired up in main.js (api).
export const SW = 540, SH = 1046;
const BASE = new URL('../icons/phone/', import.meta.url).href;
const MODEL = new URL('../models/phone.glb', import.meta.url).href;
const APPS = [
  ['msg', 'Messages'], ['call', 'Phone'], ['camera', 'Camera'],
  ['travel', 'Browser'], ['settings', 'Settings'], ['friends', 'Friends'],
  ['overpass', 'Fed Tracker'], ['bank', 'Bank'], ['maps', 'Maps'],
];
const WALLS = ['wall1.jpg', 'wall2.jpg', 'wall3.jpg'];
const QUICK = ['On my way!', 'Race me!', 'Nice one!', 'GG', 'Help!', 'Where are you?'];
export const PLACES = [
  ['Times Square, New York', 40.758, -73.9855], ['Eiffel Tower, Paris', 48.8584, 2.2945], ['Shibuya, Tokyo', 35.6595, 139.7005],
  ['Big Ben, London', 51.5007, -0.1246], ['Sydney Opera House', -33.8568, 151.2153], ['Colosseum, Rome', 41.8902, 12.4922],
  ['Golden Gate, San Francisco', 37.8199, -122.4783], ['Copacabana, Rio', -22.9711, -43.1822], ['Las Vegas Strip', 36.1147, -115.1728],
];
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const PHOTOS_KEY = 'osm.phone.photos.v1';

export class PhoneOS {
  constructor(api) {
    this.api = api; this.c = document.createElement('canvas'); this.c.width = SW; this.c.height = SH; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.imgs = {}; this.app = 'home'; this.regions = []; this.dirty = true; this.t = 0; this.drawT = 0; this.threads = new Map([['overpass', { name: 'Overpass', msgs: [], unread: 0, sys: true }]]); this.thread = null; this.customWall = null;
    this.call = null; this.view = null; this.photos = []; this.photoIx = -1; this.cursor = null; this.flash = 0; this.toastT = 0; this.toastMsg = '';
    try { this.wall = Math.max(0, Math.min(3, +localStorage.getItem('osm.phone.wall') || 0)); } catch { this.wall = 0; }
    for (const [k] of APPS) this.img(k + '.png'); for (const w of WALLS) this.img(w);
    try { api.loadWall && api.loadWall().then(d => { if (d) this.setCustomWall(d, true); }); } catch { }
    try { api.loadPhotos && api.loadPhotos().then(p => { if (Array.isArray(p)) { this.photos = p.slice(0, 12); this.dirty = true; } }); } catch { }
  }
  img(name) {
    if (this.imgs[name]) return this.imgs[name];
    const im = new Image(); im.onload = () => { this.dirty = true; }; im.src = BASE + name; return this.imgs[name] = im;
  }
  open(app) { this.app = app; this.view = null; this.thread = null; this.dirty = true; try { this.api.sound && this.api.sound('click'); } catch { } }
  home() { this.app = 'home'; this.view = null; this.call = null; this.dirty = true; }
  get unread() { let n = 0; for (const t of this.threads.values()) n += t.unread; return n; }
  th(id, name) { let t = this.threads.get(id); if (!t) { t = { name: name || 'Driver', msgs: [], unread: 0 }; this.threads.set(id, t); } else if (name) t.name = name; return t; }
  push(t, m, banner) {
    t.msgs.push(m); if (t.msgs.length > 40) t.msgs.shift();
    const reading = this.app === 'msg' && this.thread === t; if (!m.me && !reading) t.unread++;
    if (banner && !m.me && !reading) { this.toastMsg = (t.sys ? '' : t.name + ': ') + m.text; this.toastTo = t; this.toastT = 3.2; }
    this.dirty = true;
  }
  // game news goes in the Overpass thread (quietly)
  notify(text, banner = true) { this.push(this.threads.get('overpass'), { text: String(text).slice(0, 160), t: Date.now() }, banner); }
  // a message from another driver, to this phone only
  dm(id, name, text) { this.push(this.th(id, name), { text: String(text).slice(0, 160), t: Date.now() }, true); }
  sendDm(id, text) { const t = this.th(id); this.push(t, { text, t: Date.now(), me: true }); try { this.api.dm(id, text); } catch { } }
  setCustomWall(data, quiet) { const im = new Image(); im.onload = () => { this.customWall = im; this.dirty = true; }; im.src = data; this.customData = data; if (!quiet) { this.wall = 3; try { localStorage.setItem('osm.phone.wall', '3'); } catch { } } }
  // the camera app's live view area (canvas pixels), or null
  get viewRect() { return this.app === 'camera' && !this.view && !this.call ? { x: 20, y: 150, w: 500, h: 720 } : null; }
  preview(src) { // non-VR: draw the game picture into the viewfinder
    const r = this.viewRect; if (!r || !src) return;
    try {
      const g = this.g, sw = src.width, sh = src.height, a = r.w / r.h; let w = sw, h = sw / a; if (h > sh) { h = sh; w = sh * a; }
      g.save(); this.rr(r.x, r.y, r.w, r.h, 24); g.clip(); g.drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, r.x, r.y, r.w, r.h); g.restore(); this.tex.needsUpdate = true;
    } catch { }
  }
  update(dt) {
    this.t += dt; if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 3); this.dirty = true; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.dirty = true; }
    if ((this.app === 'overpass' && !this.call) || this.app === 'travel') this.dirty = true; // the radar sweeps
    if (this.call) { this.call.t += dt; this.dirty = true; if (!this.call.done && this.call.t > 1.8) { this.call.done = true; try { this.call.fn && this.call.fn(); } catch { } } if (this.call.t > 3.2) this.call = null; }
    this.drawT -= dt; const live = this.app === 'maps' || (this.app === 'friends') ? 0.5 : 1;
    if (this.drawT <= 0) { this.drawT = live; this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.draw(); }
  }
  // ---------- input ----------
  tap(x, y) {
    if (y > SH - 70) { this.home(); try { this.api.sound('click'); } catch { } return true; }
    for (let i = this.regions.length - 1; i >= 0; i--) { const r = this.regions[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { try { this.api.sound('click'); } catch { } try { r.fn(); } catch (e) { console.warn('[phone]', e); } this.dirty = true; return true; } }
    return false;
  }
  hit(x, y, w, h, fn) { this.regions.push({ x, y, w, h, fn }); }
  // ---------- drawing helpers ----------
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  txt(s, x, y, size = 26, col = '#fff', w = 600, align = 'left', weight = 600) {
    const g = this.g; g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic'; s = String(s);
    if (g.measureText(s).width > w) { while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); s += '…'; } // cut long text off neatly
    g.fillText(s, x, y);
  }
  wrap(s, x, y, maxW, size, col, lh = 1.25, maxLines = 4) {
    const g = this.g; g.font = `500 ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = 'left'; const words = String(s).split(/\s+/); let line = '', n = 0;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * size * lh); n++; line = w; if (n >= maxLines) return n; } else line = t; }
    if (line) { g.fillText(line, x, y + n * size * lh); n++; } return n;
  }
  btn(x, y, w, h, label, fn, col = '#3d7bff', size = 26, on = true) {
    const g = this.g; this.rr(x, y, w, h, Math.min(24, h / 2)); g.fillStyle = on ? col : 'rgba(255,255,255,.08)'; g.fill();
    this.txt(label, x + w / 2, y + h / 2 + size * 0.36, size, on ? '#fff' : 'rgba(255,255,255,.4)', w - 16, 'center', 700); if (on && fn) this.hit(x, y, w, h, fn);
  }
  card(x, y, w, h, a = 0.62) { const g = this.g; this.rr(x, y, w, h, 26); g.fillStyle = `rgba(12,16,30,${a})`; g.fill(); }
  header(title) {
    this.txt('‹', 30, 128, 56, '#fff', 60, 'left', 400); this.hit(0, 70, 130, 80, () => this.home());
    this.txt(title, SW / 2, 122, 34, '#fff', 380, 'center', 800);
  }
  row(y, title, sub, right, fn, rightCol) {
    this.card(20, y, 500, 92, 0.55); this.txt(title, 44, y + 40, 28, '#fff', right ? 320 : 440, 'left', 700); if (sub) this.txt(sub, 44, y + 74, 20, 'rgba(255,255,255,.65)', right ? 320 : 440, 'left', 500);
    if (right) this.btn(370, y + 18, 130, 56, right, fn, rightCol || '#3d7bff', 24); else if (fn) this.hit(20, y, 500, 92, fn);
  }
  // ---------- screens ----------
  draw() {
    const g = this.g; this.regions = [];
    const wall = this.wall === 3 ? this.customWall : this.imgs[WALLS[this.wall]];
    if (wall && wall.complete && wall.naturalWidth) { const s2 = Math.max(SW / wall.naturalWidth, SH / wall.naturalHeight), w = wall.naturalWidth * s2, h = wall.naturalHeight * s2; g.drawImage(wall, (SW - w) / 2, (SH - h) / 2, w, h); } else { g.fillStyle = '#2a5f9e'; g.fillRect(0, 0, SW, SH); }
    if (this.app !== 'home') { g.fillStyle = 'rgba(6,10,22,.55)'; g.fillRect(0, 0, SW, SH); }
    try {
      if (this.call) this.drawCall();
      else if (this.app === 'home') this.drawHome();
      else this['app_' + this.app]?.();
    } catch (e) { console.warn('[phone] draw', e); }
    this.drawStatus();
    // banner
    if (this.toastT > 0 && this.app !== 'msg') { const a = Math.min(1, this.toastT * 3); g.globalAlpha = a; this.card(16, 56, 508, 96, 0.9); const ic = this.imgs['msg.png']; if (ic.complete && ic.naturalWidth) g.drawImage(ic, 30, 70, 64, 64); this.wrap(this.toastMsg, 108, 94, 396, 22, '#fff', 1.2, 2); g.globalAlpha = 1; this.hit(16, 56, 508, 96, () => { const t = this.toastTo; this.toastT = 0; this.open('msg'); if (t) { this.thread = t; t.unread = 0; } }); }
    // home pill
    this.rr(SW / 2 - 80, SH - 26, 160, 10, 5); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
    if (this.cursor) { g.beginPath(); g.arc(this.cursor.x, this.cursor.y, 16, 0, 6.283); g.fillStyle = this.cursor.down ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.25)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.stroke(); }
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash})`; g.fillRect(0, 0, SW, SH); }
    this.tex.needsUpdate = true;
  }
  drawStatus() {
    const d = new Date(), hh = d.getHours() % 12 || 12, mm = String(d.getMinutes()).padStart(2, '0');
    this.txt(`${hh}:${mm}`, 40, 42, 24, '#fff', 100, 'left', 700);
    const g = this.g; g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillRect(420 + i * 9, 36 - i * 5, 6, 6 + i * 5);
    this.rr(462, 22, 46, 22, 5); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); g.fillRect(466, 26, 34, 14); g.fillRect(509, 28, 4, 10);
  }
  drawHome() {
    const d = new Date(), g = this.g;
    this.txt(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, ''), SW / 2, 210, 110, '#fff', 500, 'center', 300);
    this.txt(d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), SW / 2, 256, 26, 'rgba(255,255,255,.9)', 480, 'center', 600);
    APPS.forEach(([k, name], i) => {
      const cx = 90 + (i % 3) * 180, y = 330 + Math.floor(i / 3) * 205, im = this.imgs[k + '.png'];
      this.rr(cx - 70, y, 140, 140, 34); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
      if (im.complete && im.naturalWidth) g.drawImage(im, cx - 58, y + 12, 116, 116);
      this.txt(name, cx, y + 178, 24, '#fff', 170, 'center', 700);
      if (k === 'msg' && this.unread) { g.beginPath(); g.arc(cx + 62, y + 8, 20, 0, 6.283); g.fillStyle = '#ff3b30'; g.fill(); this.txt(String(Math.min(99, this.unread)), cx + 62, y + 17, 22, '#fff', 40, 'center', 800); }
      this.hit(cx - 80, y - 6, 160, 196, () => this.open(k));
    });
  }
  drawCall() {
    const C = this.call, g = this.g; g.fillStyle = 'rgba(8,12,26,.82)'; g.fillRect(0, 0, SW, SH);
    const pulse = 1 + Math.sin(C.t * 6) * 0.06 * (C.done ? 0 : 1);
    g.beginPath(); g.arc(SW / 2, 360, 110 * pulse, 0, 6.283); g.fillStyle = 'rgba(120,170,255,.25)'; g.fill();
    g.beginPath(); g.arc(SW / 2, 360, 86, 0, 6.283); g.fillStyle = '#5b7bd6'; g.fill();
    this.txt(C.name.slice(0, 1).toUpperCase(), SW / 2, 392, 90, '#fff', 200, 'center', 700);
    this.txt(C.name, SW / 2, 540, 40, '#fff', 480, 'center', 800);
    this.txt(C.done ? (C.result || 'Connected') : 'calling' + '.'.repeat(1 + Math.floor(C.t * 3) % 3), SW / 2, 590, 28, 'rgba(255,255,255,.75)', 480, 'center', 500);
    g.beginPath(); g.arc(SW / 2, 860, 52, 0, 6.283); g.fillStyle = '#ff3b30'; g.fill(); this.txt('✕', SW / 2, 878, 50, '#fff', 80, 'center', 700);
    this.hit(SW / 2 - 60, 800, 120, 120, () => { this.call = null; });
  }
  dial(name, fn, result) { this.call = { name, fn: () => { const r = fn(); if (typeof r === 'string') this.call && (this.call.result = r); }, t: 0, done: false, result }; try { this.api.sound('ring'); } catch { } }
  // ---------- apps ----------
  app_msg() {
    const A = this.api, g = this.g;
    if (this.thread) return this.chatView();
    this.header('Messages'); let y = 150;
    // a thread for everyone in your game, plus game news
    for (const p of A.players()) this.th(p.id, p.name);
    const live = new Set(A.players().map(p => p.id));
    const list = [...this.threads.entries()].filter(([id, t]) => t.sys || live.has(id) || t.msgs.length);
    if (list.length < 2) this.wrap(A.net().active ? 'Nobody else is in your game yet.' : 'Join a game (Friends app) to message other drivers. Each message only goes to the phone you send it to.', 40, 820, 460, 23, 'rgba(255,255,255,.75)', 1.25, 4);
    for (const [id, t] of list) {
      const last = t.msgs[t.msgs.length - 1];
      this.card(20, y, 500, 100, 0.55);
      g.beginPath(); g.arc(76, y + 50, 32, 0, 6.283); g.fillStyle = t.sys ? '#3d7bff' : live.has(id) ? '#2f9e6a' : '#555d70'; g.fill(); this.txt(t.name.slice(0, 1).toUpperCase(), 76, y + 61, 30, '#fff', 60, 'center', 800);
      this.txt(t.name, 128, y + 42, 27, '#fff', 300, 'left', 800); this.txt(last ? (last.me ? 'You: ' : '') + last.text : (t.sys ? 'Game news' : 'Say hi'), 128, y + 76, 21, 'rgba(255,255,255,.7)', 340, 'left', 500);
      if (t.unread) { g.beginPath(); g.arc(486, y + 50, 18, 0, 6.283); g.fillStyle = '#ff3b30'; g.fill(); this.txt(String(Math.min(99, t.unread)), 486, y + 58, 20, '#fff', 36, 'center', 800); }
      this.hit(20, y, 500, 100, () => { this.thread = t; this.threadId = id; t.unread = 0; }); y += 110; if (y > 860) break;
    }
  }
  chatView() {
    const A = this.api, g = this.g, t = this.thread, id = this.threadId, live = A.players().some(p => p.id === id);
    this.txt('‹', 30, 128, 56, '#fff', 60, 'left', 400); this.hit(0, 70, 130, 80, () => { this.thread = null; });
    this.txt(t.name, SW / 2, 122, 32, '#fff', 340, 'center', 800);
    this.card(20, 150, 500, t.sys ? 820 : 600, 0.35);
    let y = t.sys ? 950 : 730;
    for (let i = t.msgs.length - 1; i >= 0; i--) {
      const m = t.msgs[i]; g.font = `500 23px ${FONT}`; const tw = g.measureText(m.text).width, w = Math.min(420, tw + 36), lines = Math.min(3, Math.ceil(tw / 384)), h = 22 + lines * 28;
      y -= h + 10; if (y < 160) break; const x = m.me ? 500 - w : 40;
      this.rr(x, y, w, h, 20); g.fillStyle = m.me ? '#3d7bff' : t.sys ? 'rgba(255,255,255,.14)' : '#2f9e6a'; g.fill();
      this.wrap(m.text, x + 18, y + 32, w - 30, 23, '#fff', 1.2, 3);
    }
    if (!t.msgs.length) this.wrap(t.sys ? 'Game news shows up here.' : `Messages to ${t.name} only go to their phone.`, 50, 200, 440, 24, 'rgba(255,255,255,.75)');
    if (t.sys) return;
    QUICK.forEach((q, i) => this.btn(20 + (i % 2) * 254, 770 + Math.floor(i / 2) * 68, 246, 58, q, () => this.sendDm(id, q), '#2c4c8f', 23, live));
    if (!live) this.txt(`${t.name} has left the game`, SW / 2, 985, 22, 'rgba(255,255,255,.7)', 480, 'center', 600);
    else if (!A.vr()) { this.btn(400, 82, 120, 52, 'Type', () => { const m = prompt('Message to ' + t.name); if (m && m.trim()) this.sendDm(id, m.trim().slice(0, 120)); }, '#3d7bff', 22); }
  }
  app_call() {
    this.header('Phone'); const A = this.api, g = this.g; let y = 150;
    const pl = A.players();
    this.txt(pl.length ? 'Drivers in your game' : 'Your game', 40, y + 30, 24, 'rgba(255,255,255,.7)', 460, 'left', 700); y += 48;
    if (!pl.length) { this.wrap(A.net().active ? 'Nobody else is here yet.' : 'You are not in a game. Host or join one in the Friends app, then everyone in it shows up here.', 40, y + 28, 460, 24, 'rgba(255,255,255,.75)', 1.25, 4); y += 150; }
    for (const p of pl.slice(0, 6)) {
      const st = A.rideState(p.id);
      this.card(20, y, 500, 138, 0.55);
      g.beginPath(); g.arc(70, y + 48, 28, 0, 6.283); g.fillStyle = '#2f9e6a'; g.fill(); this.txt(p.name.slice(0, 1).toUpperCase(), 70, y + 58, 28, '#fff', 60, 'center', 800);
      this.txt(p.name, 114, y + 42, 27, '#fff', 250, 'left', 800); this.txt(st.note || (fmtD(p.d) + ' away'), 114, y + 74, 20, 'rgba(255,255,255,.7)', 380, 'left', 500);
      this.btn(376, y + 22, 124, 52, 'Message', () => { this.app = 'msg'; this.thread = this.th(p.id, p.name); this.threadId = p.id; this.thread.unread = 0; }, '#3d7bff', 21);
      const acts = st.acts || []; let x = 40;
      for (const a of acts) { const w = a.wide ? 300 : 210; this.btn(x, y + 86, w, 44, a.label, () => A.rideAct(p.id, a.act), a.col || '#2f9e6a', 21); x += w + 12; }
      y += 148; if (y > 880) break;
    }
    this.txt('Services', 40, y + 30, 24, 'rgba(255,255,255,.7)', 460, 'left', 700); y += 46;
    if (y < 900) this.row(y, 'Tow Truck', 'Puts your car back on its wheels', 'Call', () => this.dial('Tow Truck', () => A.tow()));
  }
  app_camera() {
    this.header('Camera'); const A = this.api, g = this.g;
    if (this.view === 'gallery' || this.view === 'photo') return this.gallery();
    const r = this.viewRect; this.rr(r.x, r.y, r.w, r.h, 24); g.fillStyle = '#000'; g.fill();
    if (!A.vr()) this.txt('Live view', r.x + 20, r.y + 40, 20, 'rgba(255,255,255,.6)', 200, 'left', 600);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(r.x + r.w * i / 3, r.y); g.lineTo(r.x + r.w * i / 3, r.y + r.h); g.moveTo(r.x, r.y + r.h * i / 3); g.lineTo(r.x + r.w, r.y + r.h * i / 3); g.stroke(); }
    // shutter
    g.beginPath(); g.arc(SW / 2, 950, 52, 0, 6.283); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.arc(SW / 2, 950, 60, 0, 6.283); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    this.hit(SW / 2 - 70, 880, 140, 140, () => this.snap());
    // last photo
    const last = this.photos[0]; this.rr(40, 905, 90, 90, 16); g.fillStyle = 'rgba(255,255,255,.15)'; g.fill();
    if (last) { const im = this.img2(last.id, last.d); if (im.complete && im.naturalWidth) { g.save(); this.rr(40, 905, 90, 90, 16); g.clip(); g.drawImage(im, 40, 905, 90, 90); g.restore(); } this.hit(40, 905, 90, 90, () => { this.view = 'gallery'; }); }
    this.txt(A.vr() ? 'Back of the phone is the lens' : '', SW - 40, 960, 18, 'rgba(255,255,255,.6)', 160, 'right', 500);
  }
  // photos are data URLs: cache their Image objects by id
  img2(id, data) { return this.imgs['__p' + id] || (this.imgs['__p' + id] = Object.assign(new Image(), { onload: () => { this.dirty = true; }, src: data })); }
  gallery() {
    const g = this.g, A = this.api;
    if (this.view === 'photo' && this.photos[this.photoIx]) {
      const p = this.photos[this.photoIx], im = this.img2(p.id, p.d);
      if (im.complete && im.naturalWidth) { const s = Math.min(500 / im.naturalWidth, 680 / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s; g.drawImage(im, (SW - w) / 2, 160 + (680 - h) / 2, w, h); }
      if (!A.vr()) this.btn(30, 870, 230, 70, 'Save', () => A.savePhoto(p.d), '#3d7bff');
      this.btn(A.vr() ? 155 : 280, 870, 230, 70, 'Delete', () => { this.photos.splice(this.photoIx, 1); A.storePhotos && A.storePhotos(this.photos); this.view = 'gallery'; }, '#c0392b');
      this.hit(0, 70, 130, 80, () => { this.view = 'gallery'; }); return;
    }
    if (!this.photos.length) this.wrap('No photos yet.', 40, 220, 460, 26, 'rgba(255,255,255,.75)');
    this.photos.forEach((p, i) => { const x = 20 + (i % 3) * 170, y = 160 + Math.floor(i / 3) * 170, im = this.img2(p.id, p.d); this.rr(x, y, 160, 160, 14); g.fillStyle = 'rgba(255,255,255,.1)'; g.fill(); if (im.complete && im.naturalWidth) { g.save(); this.rr(x, y, 160, 160, 14); g.clip(); const s = Math.max(160 / im.naturalWidth, 160 / im.naturalHeight); g.drawImage(im, x + (160 - im.naturalWidth * s) / 2, y + (160 - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); g.restore(); } this.hit(x, y, 160, 160, () => { this.photoIx = i; this.view = 'photo'; }); });
    this.hit(0, 70, 130, 80, () => { this.view = null; });
  }
  snap() {
    const A = this.api; this.flash = 1; try { A.sound('shutter'); } catch { }
    Promise.resolve(A.capture()).then(d => { if (!d) return; this.photos.unshift({ id: Date.now().toString(36), d, t: Date.now() }); if (this.photos.length > 12) this.photos.length = 12; A.storePhotos && A.storePhotos(this.photos); this.dirty = true; }).catch(() => { });
  }
  app_travel() {
    const g = this.g; g.fillStyle = '#f4f6fa'; g.fillRect(0, 56, SW, SH - 56);
    // toolbar + address bar
    g.fillStyle = '#e3e7ef'; g.fillRect(0, 56, SW, 92); this.txt('‹', 30, 122, 50, '#5a6478', 60, 'left', 400); this.hit(0, 60, 80, 84, () => this.home());
    this.rr(80, 74, 430, 56, 28); g.fillStyle = '#fff'; g.fill(); this.txt('🔒', 104, 112, 20, '#5a6478', 30, 'left', 400); this.txt('overpass.web/home', 134, 111, 24, '#2b3445', 360, 'left', 600);
    // the page
    const bob = Math.sin(this.t * 2) * 6;
    this.txt('404', SW / 2, 420 + bob, 150, '#c9d1e0', 500, 'center', 900);
    this.txt('Page not found', SW / 2, 500, 38, '#2b3445', 480, 'center', 800);
    this.wrap("The Overpass web isn't online yet. Check back after the next update!", 70, 560, 400, 25, '#5a6478', 1.3, 4);
    this.btn(140, 700, 260, 70, 'Try again', () => { this.t = 0; }, '#3d7bff', 26);
  }
  app_settings() {
    this.header('Settings'); const A = this.api, g = this.g; let y = 150;
    this.txt('Wallpaper', 40, y + 34, 26, '#fff', 400, 'left', 800); y += 54;
    const tiles = [...WALLS.map(w => this.imgs[w]), this.customWall];
    tiles.forEach((im, i) => {
      const x = 28 + i * 124; this.rr(x, y, 108, 190, 16); g.save(); g.clip();
      if (im && im.complete && im.naturalWidth) { const s2 = Math.max(108 / im.naturalWidth, 190 / im.naturalHeight); g.drawImage(im, x + (108 - im.naturalWidth * s2) / 2, y + (190 - im.naturalHeight * s2) / 2, im.naturalWidth * s2, im.naturalHeight * s2); }
      else { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, 108, 190); this.txt('+', x + 54, y + 110, 60, 'rgba(255,255,255,.6)', 80, 'center', 300); }
      g.restore();
      if (i === this.wall && im) { this.rr(x - 4, y - 4, 116, 198, 18); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke(); }
      this.hit(x, y, 108, 190, () => { if (i === 3 && !im) return this.upload(); this.wall = i; try { localStorage.setItem('osm.phone.wall', String(i)); } catch { } });
    });
    y += 220;
    this.btn(20, y, 500, 76, 'Upload your own picture', () => this.upload(), '#3d7bff', 26, !A.vr()); y += 90;
    if (A.vr()) { this.wrap('Uploading pictures works from the phone on a screen (outside VR). Your picture then shows here too.', 40, y + 24, 460, 22, 'rgba(255,255,255,.75)', 1.25, 3); y += 100; }
    if (this.customWall) { this.btn(20, y, 500, 66, 'Remove my picture', () => { this.customWall = null; this.customData = null; if (this.wall === 3) this.wall = 0; try { localStorage.setItem('osm.phone.wall', String(this.wall)); A.storeWall && A.storeWall(null); } catch { } }, '#555d70', 24); y += 80; }
    this.card(20, y + 10, 500, 120, 0.45); this.txt('Overpass OS', 44, y + 58, 26, '#fff', 300, 'left', 800); this.txt('Version 1.0 · all apps up to date', 44, y + 96, 21, 'rgba(255,255,255,.7)', 440, 'left', 500);
  }
  upload() {
    const A = this.api; if (A.vr() || !A.pickImage) return;
    A.pickImage().then(d => { if (!d) return; this.setCustomWall(d); try { A.storeWall && A.storeWall(d); } catch { } }).catch(() => { });
  }
  app_friends() {
    this.header('Friends'); const A = this.api, net = A.net(); let y = 150;
    if (net.active) {
      this.card(20, y, 500, 140); this.txt(net.role === 'host' ? 'Hosting' : 'In a game', 44, y + 46, 26, '#8fe3b0', 300, 'left', 800); this.txt('Code ' + net.code, 44, y + 96, 40, '#fff', 300, 'left', 800); this.btn(360, y + 40, 140, 60, 'Leave', () => A.leave(), '#c0392b', 24); y += 160;
      const pl = A.players(); this.txt(`${pl.length + 1} driver${pl.length ? 's' : ''}`, 40, y + 30, 24, 'rgba(255,255,255,.7)', 460, 'left', 700); y += 46;
      for (const p of pl.slice(0, 6)) { this.row(y, p.name, fmtD(p.d) + ' away', 'Find', () => A.callPlayer(p), '#2f9e6a'); y += 100; }
    } else {
      this.btn(20, y, 500, 80, 'Host a game here', () => A.host(), '#2f9e6a', 30); y += 104;
      this.txt('Open games', 40, y + 30, 24, 'rgba(255,255,255,.7)', 460, 'left', 700); y += 46;
      const L = A.lobby();
      if (!L.length) this.wrap('No open games right now. Host one and your friends will see it here and in Multiplayer.', 40, y + 30, 460, 23, 'rgba(255,255,255,.75)');
      for (const r of L.slice(0, 6)) { this.row(y, r.name, `${r.place || 'Real world'} · ${r.players} driver${r.players === 1 ? '' : 's'}`, 'Join', () => A.join(r.code), '#3d7bff'); y += 100; }
    }
  }
  app_overpass() {
    this.header('Fed Tracker'); const A = this.api, g = this.g, F = A.fedList(), R = 6000;
    const cx = SW / 2, cy = 400, rad = 220;
    // radar: you in the middle, facing up; rings every 2 km
    g.beginPath(); g.arc(cx, cy, rad + 10, 0, 6.283); g.fillStyle = 'rgba(6,20,14,.85)'; g.fill();
    g.strokeStyle = 'rgba(80,255,150,.35)'; g.lineWidth = 2; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, cy, rad * k / 3, 0, 6.283); g.stroke(); }
    g.beginPath(); g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy); g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad); g.stroke();
    const sw = (this.t * 1.6) % 6.283, grd = g.createConicGradient ? g.createConicGradient(sw - 0.6, cx, cy) : null;
    if (grd) { grd.addColorStop(0, 'rgba(80,255,150,0)'); grd.addColorStop(0.095, 'rgba(80,255,150,.35)'); grd.addColorStop(0.1, 'rgba(80,255,150,0)'); g.beginPath(); g.arc(cx, cy, rad, 0, 6.283); g.fillStyle = grd; g.fill(); }
    for (const f of F) {
      if (f.d > R && f.kind !== 'carrier') continue; const k = Math.min(1, f.d / R), x = cx + Math.sin(f.rel) * k * rad, y = cy - Math.cos(f.rel) * k * rad;
      g.fillStyle = f.dead ? '#888' : '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2;
      if (f.kind === 'carrier') { g.fillRect(x - 12, y - 7, 24, 14); g.strokeRect(x - 12, y - 7, 24, 14); }
      else if (f.kind === 'jet') { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 8, y + 8); g.lineTo(x - 8, y + 8); g.closePath(); g.fill(); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, 7, 0, 6.283); g.fill(); g.stroke(); }
    }
    g.fillStyle = '#7dffb0'; g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx + 9, cy + 9); g.lineTo(cx - 9, cy + 9); g.closePath(); g.fill();
    this.txt('6 km', cx + rad - 4, cy + rad + 4, 18, 'rgba(125,255,176,.8)', 80, 'right', 600);
    // the list
    let y = 650; const live = F.filter(f => !f.dead), car = live.find(f => f.kind === 'carrier');
    const jets = live.filter(f => f.kind === 'jet').length, subs = live.filter(f => f.kind === 'sub').length;
    this.card(20, y, 500, 110, 0.6);
    this.txt(car ? `Carrier · ${fmtD(car.d)} · ${Math.round((car.hp || 0) * 100)}% hull` : 'No carrier in range', 44, y + 44, 26, car ? '#ff8a7a' : '#8fe3b0', 440, 'left', 800);
    this.txt(`${jets} jet${jets === 1 ? '' : 's'} · ${subs} sub${subs === 1 ? '' : 's'} on patrol · ${A.stats().liberated} towns freed`, 44, y + 84, 21, 'rgba(255,255,255,.75)', 450, 'left', 600); y += 126;
    this.btn(20, y, 500, 74, 'Route to the carrier', () => A.routeCarrier(), '#c0392b', 26, !!car);
    if (!A.vr()) this.btn(20, y + 88, 500, 66, 'Liberation Log', () => A.openLog(), '#555d70', 24);
  }
  app_bank() {
    this.header('Bank'); const A = this.api, g = this.g; let y = 160;
    this.card(20, y, 500, 220, 0.7); this.txt('Balance', 44, y + 54, 26, 'rgba(255,255,255,.7)', 300, 'left', 700);
    this.txt(A.score().toLocaleString(), SW / 2, y + 150, 72, '#fff', 460, 'center', 800); this.txt('points', SW / 2, y + 194, 24, 'rgba(255,255,255,.7)', 200, 'center', 600); y += 250;
    const b = A.bonus(); this.btn(20, y, 500, 84, b.ready ? `Collect daily bonus +${b.amount}` : `Daily bonus collected · back ${b.when}`, b.ready ? () => A.collectBonus() : null, '#2f9e6a', 28, b.ready); y += 110;
    this.row(y, 'Scratch-offs saved', `${A.tickets()} ticket${A.tickets() === 1 ? '' : 's'} in your garage`); y += 104;
    this.row(y, 'Teleport fee', A.tpCost() ? `${A.tpCost().toLocaleString()} per trip` : 'Free'); y += 104;
  }
  app_maps() {
    this.header('Maps'); const A = this.api, g = this.g, m = A.mini();
    this.rr(20, 150, 500, 500, 30); g.fillStyle = '#0d1320'; g.fill();
    if (m) { g.save(); this.rr(20, 150, 500, 500, 30); g.clip(); try { g.drawImage(m, 20, 150, 500, 500); } catch { } g.restore(); }
    const gi = A.gps(); this.wrap(gi || 'No route set', 40, 700, 460, 24, '#fff', 1.2, 2);
    this.btn(20, 760, 500, 76, 'Route to the Federation carrier', () => A.routeCarrier(), '#c0392b', 25);
    this.btn(20, 850, 245, 76, 'Store 32', () => A.store32(), '#3d7bff', 25);
    this.btn(275, 850, 245, 76, 'Clear route', () => A.clearGps(), '#555d70', 25, !!gi);
  }
}
const fmtD = d => d == null ? '?' : d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';

// ---------- the phone on a screen (not VR) ----------
export class PhoneScreen {
  constructor(os) {
    this.os = os; const el = this.el = document.createElement('div'); el.className = 'phone-ui'; el.hidden = true;
    el.innerHTML = '<div class="ph-body"><div class="ph-notch"></div></div>'; const body = el.firstChild; body.appendChild(os.c);
    os.c.className = 'ph-screen';
    os.c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const r = os.c.getBoundingClientRect(); os.tap((e.clientX - r.left) / r.width * SW, (e.clientY - r.top) / r.height * SH); });
    el.addEventListener('pointerdown', e => { if (e.target === el) this.close(); });
    document.body.appendChild(el);
  }
  get open_() { return !this.el.hidden; }
  open() { this.el.hidden = false; this.os.dirty = true; requestAnimationFrame(() => this.el.classList.add('in')); }
  close() { this.el.classList.remove('in'); setTimeout(() => { if (!this.el.classList.contains('in')) this.el.hidden = true; }, 220); }
  toggle() { this.open_ ? this.close() : this.open(); }
}

// ---------- the phone in VR ----------
const PH_SCALE = 0.0507;            // the model is 3.16 units tall: a 16 cm phone
const SCR = { x0: -0.675, x1: 0.675, y0: -1.17, y1: 1.445, z: 0.1115 };
export class PhoneVR {
  constructor(scene, os, renderer) {
    this.scene = scene; this.os = os; this.renderer = renderer; this.root = new THREE.Group(); this.root.name = 'phone'; this.root.visible = false; scene.add(this.root);
    this.state = 'hip'; this.local = new THREE.Matrix4(); this.vel = new THREE.Vector3(); this.t = 0; this.hist = []; this.holder = null; this.ready = false;
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
    new GLTFLoader().loadAsync(MODEL).then(g => {
      const m = g.scene; m.scale.setScalar(PH_SCALE); this.model = m; this.root.add(m);
      m.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.name === 'Touchscreen_Display') o.visible = false; } });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCR.x1 - SCR.x0, SCR.y1 - SCR.y0), new THREE.MeshBasicMaterial({ map: os.tex, toneMapped: false }));
      scr.position.set((SCR.x0 + SCR.x1) / 2, (SCR.y0 + SCR.y1) / 2, SCR.z); m.add(scr); this.screen = scr;
      // the camera app's live view: a render from the lens on the back
      this.rt = new THREE.WebGLRenderTarget(300, 432); this.cam = new THREE.PerspectiveCamera(62, 500 / 720, 0.05, 1500);
      const lens = m.getObjectByName('Camera_Lens_Primary'); this.lens = lens || m;
      this.vf = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.rt.texture, toneMapped: false })); this.vf.visible = false; m.add(this.vf);
      this.ready = true;
    }).catch(e => console.warn('[phone] model:', e));
  }
  // where the phone rides: on your right hip (car frame: the driver faces +Z, their right is -X)
  hipLocal(headL, out) {
    this._p.copy(headL).add(this._v.set(-0.24, -0.55, 0.12));
    this._q.setFromEuler(new THREE.Euler(-1.2, 0, 0.25, 'YXZ'));
    return out.compose(this._p, this._q, this._s.set(1, 1, 1));
  }
  update(dt, ctx) {
    const { vr, camera, car, on } = ctx; this.root.visible = !!(on && this.ready); if (!this.root.visible) { this.release(); this.state = 'hip'; return; }
    car.updateMatrixWorld(); const carW = car.matrixWorld, carInv = this._m2.copy(carW).invert();
    const headW = camera.getWorldPosition(new THREE.Vector3()), headL = headW.clone().applyMatrix4(carInv), hip = this.hipLocal(headL, new THREE.Matrix4());
    const phoneW = this.root.getWorldPosition(new THREE.Vector3());
    // ---- grabbing ----
    for (const h of vr.hands || []) {
      if (!h.src) continue; const sq = vr.squeezing(h), palm = vr.palmPos ? vr.palmPos(h, new THREE.Vector3()) : h.grip.getWorldPosition(new THREE.Vector3());
      if (sq && !h.phone && !h.grabbed && !h.mir && !h.stick && this.holder == null) {
        if (palm.distanceTo(phoneW) < 0.13) { this.holder = h; h.phone = true; h.grip.updateMatrixWorld(); this.offset = new THREE.Matrix4().copy(h.grip.matrixWorld).invert().multiply(this.root.matrixWorld); this.state = 'held'; this.hist = []; try { vr.pulse(0.45, 30, h.src.handedness); } catch { } }
        else if (this.state === 'placed') { const hp = new THREE.Vector3().setFromMatrixPosition(hip).applyMatrix4(carW); if (palm.distanceTo(hp) < 0.16) { this.summonT = (this.summonT || 0) + dt; if (this.summonT > 0.35) { this.summonT = 0; this.startReturn(); try { vr.pulse(0.3, 25); } catch { } } } else this.summonT = 0; }
      }
      if (h === this.holder && !sq) this.drop(vr);
    }
    // ---- move ----
    if (this.state === 'held' && this.holder) {
      this.holder.grip.updateMatrixWorld(); const w = this._m.multiplyMatrices(this.holder.grip.matrixWorld, this.offset);
      this.local.multiplyMatrices(carInv, w);
      const p = new THREE.Vector3().setFromMatrixPosition(this.local); this.hist.push({ p, t: performance.now() }); while (this.hist.length > 8) this.hist.shift();
    } else if (this.state === 'hip') this.local.copy(hip);
    else if (this.state === 'fall') {
      this.t += dt; const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); this.local.decompose(p, q, s);
      this.vel.y -= 9.8 * dt; p.addScaledVector(this.vel, dt); q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt * 4, dt * 2, 0))); this.local.compose(p, q, s);
      if (this.t > 0.3) this.startReturn();
    } else if (this.state === 'return') {
      this.t += dt; const k = Math.min(1, this.t / 0.45), e = 1 - Math.pow(1 - k, 3);
      const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q1 = new THREE.Quaternion(); this.from.decompose(p0, q0, s0); hip.decompose(p1, q1, s0);
      this.local.compose(p0.lerp(p1, e), q0.slerp(q1, e), s0.set(1, 1, 1));
      if (k >= 1) { this.state = 'hip'; try { vr.pulse(0.25, 20); } catch { } }
    } else if (this.state === 'placed') {
      const p = new THREE.Vector3().setFromMatrixPosition(this.local); if (p.distanceTo(headL) > 1.8) this.startReturn(); // left behind somewhere silly
    }
    this._m.multiplyMatrices(carW, this.local); this._m.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.root.updateMatrixWorld(true);
    // ---- poking the screen ----
    if (this.screen) this.touch(vr);
  }
  drop(vr) {
    const h = this.holder; if (!h) return; h.phone = false; this.holder = null;
    // how fast was the hand going (in the car's frame)? a gentle let-go places it; a drop or a fling sends it home
    let v = new THREE.Vector3(); const H = this.hist; if (H.length > 2) { const a = H[0], b = H[H.length - 1], dtt = Math.max(0.016, (b.t - a.t) / 1000); v.subVectors(b.p, a.p).divideScalar(dtt); }
    if (v.length() > 0.55) { this.state = 'fall'; this.t = 0; this.vel.copy(v); }
    else { this.state = 'placed'; try { vr.pulse(0.2, 15, h.src && h.src.handedness); } catch { } }
  }
  release() { if (this.holder) { this.holder.phone = false; this.holder = null; } }
  startReturn() { this.release(); this.state = 'return'; this.t = 0; this.from = this.local.clone(); }
  touch(vr) {
    let best = null;
    for (const h of vr.hands || []) {
      if (!h.src || h === this.holder) continue; const tip = vr.poke ? vr.poke(h, new THREE.Vector3()) : h.grip.getWorldPosition(new THREE.Vector3());
      const l = this.screen.worldToLocal(tip.clone()); // plane units: model units (1 = 5 cm)
      const W = SCR.x1 - SCR.x0, H = SCR.y1 - SCR.y0; if (Math.abs(l.x) > W / 2 + 0.1 || Math.abs(l.y) > H / 2 + 0.1 || l.z > 1.2 || l.z < -0.8) continue;
      if (!best || l.z < best.l.z) best = { h, l };
    }
    const os = this.os;
    if (!best) { if (os.cursor) { os.cursor = null; os.dirty = true; } this.down = false; return; }
    const W = SCR.x1 - SCR.x0, H = SCR.y1 - SCR.y0, x = (best.l.x / W + 0.5) * SW, y = (0.5 - best.l.y / H) * SH;
    const pressed = this.down ? best.l.z < 0.38 : best.l.z < 0.22;
    os.cursor = { x, y, down: pressed }; os.dirty = true;
    if (pressed && !this.down) { os.tap(x, y); try { vr.pulse(0.35, 18, best.h.src.handedness); } catch { } }
    this.down = pressed;
  }
  // the camera app's live view, rendered from the lens on the back (called before the main render)
  renderView(scene) {
    if (!this.ready || !this.root.visible) return; const r = this.os.viewRect; this.vf.visible = !!r; if (!r) return;
    const W = SCR.x1 - SCR.x0, H = SCR.y1 - SCR.y0;
    this.vf.position.set(SCR.x0 + (r.x + r.w / 2) / SW * W, SCR.y1 - (r.y + r.h / 2) / SH * H, SCR.z + 0.004); this.vf.scale.set(r.w / SW * W, r.h / SH * H, 1);
    this.vfT = (this.vfT || 0) + 1; if (this.vfT % 2) return;
    this.lens.getWorldPosition(this.cam.position); this.root.getWorldQuaternion(this.cam.quaternion); this.cam.rotateY(Math.PI); // look out of the back
    this.cam.updateMatrixWorld();
    const R = this.renderer, xr = R.xr.enabled, prev = R.getRenderTarget(), su = R.shadowMap.autoUpdate;
    this.root.visible = false; R.xr.enabled = false; R.shadowMap.autoUpdate = false;
    try { R.setRenderTarget(this.rt); R.clear(); R.render(scene, this.cam); } finally { R.setRenderTarget(prev); R.xr.enabled = xr; R.shadowMap.autoUpdate = su; this.root.visible = true; }
  }
  // a photo from the lens, as a JPEG data URL
  capture() {
    if (!this.rt) return null; const w = this.rt.width, h = this.rt.height, buf = new Uint8Array(w * h * 4);
    try { this.renderer.readRenderTargetPixels(this.rt, 0, 0, w, h, buf); } catch { return null; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), id = g.createImageData(w, h);
    for (let y = 0; y < h; y++) id.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(id, 0, 0); return c.toDataURL('image/jpeg', 0.85);
  }
}
