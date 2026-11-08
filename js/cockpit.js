// First-person car interior: dashboard, steering wheel (turns with your steering), speedo display and a working radio head unit.
import * as THREE from 'three';

// per car model: eye position (x right, y up, z forward, car-local), dash distance, half width, beltline height
const SPEC = [
  { cx: -0.38, cy: 1.30, cz: 0.10, dz: 0.80, hw: 0.92, sill: 1.02 },  // Coupe
  { cx: -0.38, cy: 1.27, cz: -0.15, dz: 0.70, hw: 0.90, sill: 0.95 }, // Hatch
  { cx: -0.40, cy: 1.22, cz: -0.45, dz: 0.40, hw: 0.97, sill: 0.97 }, // Muscle
  { cx: -0.40, cy: 1.42, cz: 0.55, dz: 1.40, hw: 0.93, sill: 1.08 },  // Pickup
  { cx: -0.36, cy: 1.14, cz: -0.35, dz: 0.40, hw: 0.98, sill: 0.92 }, // Supercar
];
const mk = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
function canvasPlane(w, h, pw, ph) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { c, g: c.getContext('2d'), tex, mesh };
}
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

export class Cockpit {
  constructor(radio) {
    this.radio = radio; this.model = -1; this.xr = false; this.t = 0; this.drawT = 0; this.state = { speed: '0', unit: 'km/h', boost: 0, ratio: 0, line: '' };
    this.group = new THREE.Group(); this.group.userData.keep = true; this.group.visible = false;
    const g = this.group, dark = mk('#15171f'), pad = mk('#1c1f29'), trim = mk('#2b3040'), seat = mk('#23262f', { roughness: 0.95 });
    const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.add(o); return o; };
    this.dash = box(1.78, 0.2, 0.5, pad); this.bin = box(0.64, 0.15, 0.28, dark);
    this.doorL = box(0.06, 0.26, 1.8, trim); this.doorR = box(0.06, 0.26, 1.8, trim);
    this.seatD = box(0.5, 0.12, 0.5, seat); this.backD = box(0.5, 0.56, 0.14, seat); this.headD = box(0.28, 0.2, 0.12, seat);
    this.seatP = box(0.5, 0.12, 0.5, seat); this.backP = box(0.5, 0.56, 0.14, seat); this.headP = box(0.28, 0.2, 0.12, seat);
    this.bezel = box(0.37, 0.155, 0.05, dark);
    // steering wheel
    this.wheelPivot = new THREE.Group(); g.add(this.wheelPivot); this.wheel = new THREE.Group(); this.wheelPivot.add(this.wheel);
    this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 10, 32), dark));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), mk('#2a2e3b')); hub.rotation.x = Math.PI / 2; this.wheel.add(hub);
    const sp1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.02), dark), sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.02), dark); sp2.position.y = -0.08;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.03), mk('#ff4a3a', { emissive: '#ff2a1a', emissiveIntensity: 0.6 })); mark.position.y = 0.17;
    this.wheel.add(sp1, sp2, mark);
    // displays
    this.speed = canvasPlane(256, 128, 0.36, 0.18); this.speed.mesh.rotation.y = Math.PI; g.add(this.speed.mesh);
    this.rad = canvasPlane(512, 192, 0.34, 0.128); g.add(this.rad.mesh);
    this.msg = canvasPlane(512, 128, 0.9, 0.225); this.msg.mesh.rotation.y = Math.PI; this.msg.mesh.visible = false; g.add(this.msg.mesh);
    this.msg.mesh.material.transparent = true;
    this.setModel(0); this.drawAll(0);
  }
  spec(m = this.model) { return SPEC[Math.max(0, Math.min(SPEC.length - 1, m | 0))]; }
  setModel(m) {
    m = Math.max(0, Math.min(SPEC.length - 1, m | 0)); if (m === this.model) return; this.model = m;
    const s = SPEC[m], top = s.sill + 0.2;
    this.dash.position.set(0, s.sill + 0.1, s.dz); this.bin.position.set(s.cx, top + 0.075, s.dz - 0.02);
    this.speed.mesh.position.set(s.cx, top + 0.075, s.dz - 0.164);
    this.wheelPivot.position.set(s.cx, s.sill + 0.17, s.dz - 0.4); this.wheelPivot.rotation.x = 0.45;
    const rx = 0.5, rp = new THREE.Vector3(0, s.sill + 0.28, s.dz - 0.15), nrm = new THREE.Vector3(-Math.sin(rx), 0, -Math.cos(rx));
    this.bezel.position.copy(rp); this.bezel.rotation.y = rx;
    this.rad.mesh.position.copy(rp).addScaledVector(nrm, 0.028); this.rad.mesh.rotation.y = Math.PI + rx;
    this.doorL.position.set(-(s.hw - 0.04), s.sill + 0.135, s.cz - 0.1); this.doorR.position.set(s.hw - 0.04, s.sill + 0.135, s.cz - 0.1);
    this.seatD.position.set(s.cx, s.sill + 0.06, s.cz - 0.12); this.backD.position.set(s.cx, s.sill + 0.34, s.cz - 0.45); this.backD.rotation.x = -0.15; this.headD.position.set(s.cx, s.sill + 0.68, s.cz - 0.5);
    this.seatP.position.set(-s.cx, s.sill + 0.06, s.cz - 0.12); this.backP.position.set(-s.cx, s.sill + 0.34, s.cz - 0.45); this.backP.rotation.x = -0.15; this.headP.position.set(-s.cx, s.sill + 0.68, s.cz - 0.5);
    this.msg.mesh.position.set(s.cx, s.cy + 0.22, s.cz + 1.5);
  }
  setMsg(text) {
    if (text === this._msg) return; this._msg = text; const g = this.msg.g; g.clearRect(0, 0, 512, 128);
    if (text) { g.fillStyle = 'rgba(10,12,22,.72)'; rrect(g, 0, 16, 512, 96, 28); g.fill(); g.fillStyle = '#fff'; g.font = '700 54px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66); }
    this.msg.tex.needsUpdate = true; this.msg.mesh.visible = !!text && this.xr;
  }
  // called every frame while the cockpit is visible
  update(dt, steer, state) {
    this.t += dt; const target = -steer * 1.7; this.wheel.rotation.z += (target - this.wheel.rotation.z) * Math.min(1, dt * 12);
    if (state) Object.assign(this.state, state);
    this.drawT -= dt; if (this.drawT <= 0) { this.drawT = 0.1; this.drawAll(this.t); }
  }
  drawAll(t) { this.drawSpeed(); this.drawRadio(t); }
  drawSpeed() {
    const { g, tex } = this.speed, s = this.state; g.clearRect(0, 0, 256, 128); g.fillStyle = '#080a12'; g.fillRect(0, 0, 256, 128);
    const cx = 128, cy = 100, r = 80, a0 = Math.PI * 0.85, a1 = Math.PI * 2.15; g.lineCap = 'round';
    g.lineWidth = 9; g.strokeStyle = '#1e2433'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    g.strokeStyle = s.ratio > 0.8 ? '#ff5a3c' : '#4be3ff'; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * Math.min(1, s.ratio)); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 58px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.speed, cx, 78);
    g.fillStyle = '#8ab'; g.font = '600 15px system-ui,sans-serif'; g.fillText(s.unit, cx, 108);
    if (s.line) { g.fillStyle = '#ffd36a'; g.font = '700 17px system-ui,sans-serif'; g.fillText(s.line, cx, 16); }
    g.fillStyle = '#1e2433'; g.fillRect(70, 120, 116, 5); g.fillStyle = '#ffb02e'; g.fillRect(70, 120, 116 * Math.max(0, Math.min(1, s.boost)), 5);
    tex.needsUpdate = true;
  }
  drawRadio(t) {
    const { g, tex } = this.rad, n = this.radio.now(); g.clearRect(0, 0, 512, 192); g.fillStyle = '#070a12'; g.fillRect(0, 0, 512, 192);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = '600 20px system-ui,sans-serif'; g.fillStyle = n.on ? '#5ee0ff' : '#7f93a8'; g.fillText('OVERPASS FM · ' + (n.on ? 'MY MUSIC' : 'GAME MIX'), 18, 30);
    const title = n.on ? n.title : (n.count ? 'Press play for your songs' : 'Upload songs in the menu'); g.font = '700 36px system-ui,sans-serif'; g.fillStyle = '#fff';
    g.save(); g.beginPath(); g.rect(18, 44, 476, 52); g.clip(); const w = g.measureText(title).width;
    if (w > 476) { const off = (t * 45) % (w + 70); g.fillText(title, 18 - off, 82); g.fillText(title, 18 - off + w + 70, 82); } else g.fillText(title, 18, 82); g.restore();
    if (n.on && n.dur) { g.fillStyle = '#1e2433'; g.fillRect(18, 100, 476, 5); g.fillStyle = '#5ee0ff'; g.fillRect(18, 100, 476 * Math.min(1, n.pos / n.dur), 5); }
    const btn = (x, w2, fn, on = false) => { g.fillStyle = on ? '#1b4d5c' : '#1a2132'; rrect(g, x, 118, w2, 60, 14); g.fill(); g.fillStyle = '#e8f6ff'; fn(x + w2 / 2, 148); };
    const tri = (cx, cy, d) => { g.beginPath(); g.moveTo(cx + 11 * d, cy); g.lineTo(cx - 9 * d, cy - 14); g.lineTo(cx - 9 * d, cy + 14); g.closePath(); g.fill(); };
    btn(18, 100, (x, y) => { tri(x - 6, y, -1); g.fillRect(x + 8, y - 14, 4, 28); });
    btn(130, 100, (x, y) => { if (n.on) { g.fillRect(x - 11, y - 14, 8, 28); g.fillRect(x + 3, y - 14, 8, 28); } else tri(x, y, 1); }, n.on);
    btn(242, 100, (x, y) => { tri(x + 6, y, 1); g.fillRect(x - 12, y - 14, 4, 28); });
    btn(354, 140, (x, y) => { g.font = '700 22px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.on ? 'MINE ▸ MIX' : 'MIX ▸ MINE', x, y + 1); }, n.on);
    tex.needsUpdate = true;
  }
  // which radio button (if any) a ray points at: 'prev' | 'play' | 'next' | 'src'
  radioHit(raycaster) {
    if (!this.group.visible) return null; const h = raycaster.intersectObject(this.rad.mesh, false)[0]; if (!h || !h.uv) return null;
    const x = h.uv.x * 512, y = (1 - h.uv.y) * 192; if (y < 112 || y > 184) return null;
    if (x >= 18 && x <= 118) return 'prev'; if (x >= 130 && x <= 230) return 'play'; if (x >= 242 && x <= 342) return 'next'; if (x >= 354 && x <= 494) return 'src'; return null;
  }
  radioAct(a) { const r = this.radio; if (a === 'prev') r.prev(); else if (a === 'next') r.next(); else if (a === 'play' || a === 'src') r.toggle(); this.drawRadio(this.t); }
}
