import * as THREE from 'three';

// Sea life for World Drive's water, drawn as flat billboards (like the deer, birds and people), facing the camera and flipped to
// swim the right way:
//   sharks, whales, dolphins, squid and (rarely, very deep) giant squid in big, deep water;
//   seals in cooler parts of the world, penguins only in the southern hemisphere, both near the shore (and some lying on it).
// Dolphins leap out of the water, whales come up to blow, sharks get curious about submarines (and bite).
// All of them can be shot (or rammed). Killing sharks, whales and squid earns points; dolphins, seals and penguins don't.

const rnd = Math.random;
const FW = 256, FH = 128;
const shade = (hex, d) => { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, v + d)); return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); };
const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function strip(w, h, n, draw) { const c = document.createElement('canvas'); c.width = w * n; c.height = h; const x = c.getContext('2d'); for (let i = 0; i < n; i++) { x.save(); x.translate(i * w, 0); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, i); x.restore(); } return c; }
// body with a darker back, a pale belly below `belly`, and a soft rim
function fillBody(x, path, back, belly, by, stroke = true) {
  x.save(); path(); x.clip();
  const g = x.createLinearGradient(0, 30, 0, 100); g.addColorStop(0, shade(back, -14)); g.addColorStop(0.45, back); g.addColorStop(1, shade(back, 22)); x.fillStyle = g; x.fillRect(0, 0, FW, FH);
  if (belly) { x.fillStyle = belly; x.beginPath(); x.moveTo(0, by); for (let i = 0; i <= 16; i++) x.lineTo(i * 16, by + Math.sin(i * 0.9) * 1.5); x.lineTo(FW, FH); x.lineTo(0, FH); x.fill(); }
  x.restore(); if (stroke) { path(); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1.5; x.stroke(); }
}
const tri = (x, a, b, c, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(...a); x.quadraticCurveTo((a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 2, ...b); x.lineTo(...c); x.closePath(); x.fill(); };
const eye = (x, ex, ey, r = 2.6) => { x.fillStyle = '#0b0b0d'; x.beginPath(); x.arc(ex, ey, r, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(ex + r * 0.35, ey - r * 0.35, r * 0.35, 0, 7); x.fill(); };
function fluke(x, px, py, a, len, col) { x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = col; x.beginPath(); x.moveTo(4, -3); x.quadraticCurveTo(-len * 0.5, -len * 0.25, -len, -len * 0.55); x.quadraticCurveTo(-len * 0.72, 0, -len, len * 0.55); x.quadraticCurveTo(-len * 0.5, len * 0.25, 4, 3); x.fill(); x.restore(); }

// ---- the animals (side views facing right). f = 0..3 swim cycle, 4 = an extra pose ----
function drawShark(x, f) {
  const a = Math.sin(f / 4 * Math.PI * 2) * 0.22, back = '#5f6f7c';
  fluke(x, 54, 64, a, 44, shade(back, -8));
  const body = () => { x.beginPath(); x.moveTo(240, 67); x.quadraticCurveTo(226, 44, 168, 45); x.quadraticCurveTo(100, 46, 52, 61); x.lineTo(52, 68); x.quadraticCurveTo(112, 88, 172, 84); x.quadraticCurveTo(226, 82, 240, 67); x.closePath(); };
  tri(x, [156, 47], [134, 10], [120, 50], shade(back, -6)); tri(x, [84, 55], [76, 44], [70, 57], shade(back, -6));
  fillBody(x, body, back, '#eef0f0', 72);
  tri(x, [174, 80], [150, 108], [144, 82], shade(back, -4));
  x.strokeStyle = 'rgba(30,30,35,0.45)'; x.lineWidth = 1.3; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(196 - i * 5, 56); x.lineTo(193 - i * 5, 72); x.stroke(); }
  x.strokeStyle = 'rgba(20,20,25,0.6)'; x.beginPath(); x.moveTo(236, 72); x.quadraticCurveTo(222, 78, 208, 74); x.stroke();
  eye(x, 216, 60, 2.6);
}
function drawWhale(x, f) {
  const a = Math.sin(f / 4 * Math.PI * 2) * 0.35, back = '#334456';
  fluke(x, 40, 63, a, 40, shade(back, -6));
  const body = () => { x.beginPath(); x.moveTo(248, 68); x.quadraticCurveTo(242, 44, 204, 42); x.quadraticCurveTo(124, 36, 64, 52); x.quadraticCurveTo(46, 57, 38, 61); x.lineTo(40, 66); x.quadraticCurveTo(92, 84, 172, 88); x.quadraticCurveTo(232, 88, 248, 68); x.closePath(); };
  fillBody(x, body, back, '#c9d2da', 76);
  tri(x, [96, 43], [86, 34], [80, 46], shade(back, -10));
  x.strokeStyle = 'rgba(40,50,60,0.55)'; x.lineWidth = 1.1; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(242 - i * 2, 74 + i * 1.6); x.quadraticCurveTo(200, 84 + i, 160, 84 + i * 0.6); x.stroke(); }
  // the long white flipper of a humpback, sweeping with the stroke
  x.save(); x.translate(180, 78); x.rotate(0.75 + a * 0.4); x.fillStyle = '#d7dde2'; x.beginPath(); x.ellipse(0, 26, 7, 30, 0, 0, 7); x.fill(); x.restore();
  for (const [bx, by] of [[230, 50], [222, 47], [236, 56]]) { x.fillStyle = 'rgba(200,205,210,0.6)'; x.beginPath(); x.arc(bx, by, 1.6, 0, 7); x.fill(); }
  eye(x, 212, 68, 2.2);
}
function drawDolphin(x, f) {
  const a = Math.sin(f / 4 * Math.PI * 2) * 0.32, back = '#647889';
  fluke(x, 48, 65, a, 30, shade(back, -6));
  const body = () => { x.beginPath(); x.moveTo(250, 71); x.lineTo(226, 66); x.quadraticCurveTo(204, 46, 152, 48); x.quadraticCurveTo(92, 50, 48, 62); x.lineTo(48, 68); x.quadraticCurveTo(112, 84, 172, 80); x.quadraticCurveTo(214, 78, 228, 74); x.lineTo(250, 73); x.closePath(); };
  tri(x, [146, 50], [124, 18], [110, 53], shade(back, -10));
  fillBody(x, body, back, '#dfe7ec', 70);
  tri(x, [188, 76], [170, 98], [166, 78], shade(back, -6));
  x.strokeStyle = 'rgba(30,40,50,0.55)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(246, 72); x.quadraticCurveTo(236, 74, 226, 71); x.stroke();
  eye(x, 214, 63, 2.3);
}
function drawSquid(x, f, giant) {
  const k = Math.sin(f / 4 * Math.PI * 2), col = giant ? '#b0472f' : '#e6a596', dark = shade(col, -30), sp = 0.5 + k * 0.5;
  // arms and the two long tentacles trailing behind (to the left), spreading and closing as it jets along
  x.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const off = (i - 3.5) * (3 + sp * 3.2), wav = Math.sin(i * 1.7 + f * 1.6) * 6;
    x.strokeStyle = i % 2 ? col : dark; x.lineWidth = 6 - i * 0.25; x.beginPath(); x.moveTo(128, 64 + off * 0.25); x.quadraticCurveTo(90, 64 + off + wav, 46 + i * 2, 64 + off * 1.6 + wav * 0.6); x.stroke();
  }
  for (const s of [-1, 1]) {
    x.strokeStyle = dark; x.lineWidth = 2.4; x.beginPath(); x.moveTo(126, 64); x.bezierCurveTo(90, 64 + s * (8 + sp * 8), 50, 64 - s * 6, 12, 64 + s * (10 + sp * 6)); x.stroke();
    x.fillStyle = dark; x.beginPath(); x.ellipse(14, 64 + s * (10 + sp * 6), 7, 3.5, 0, 0, 7); x.fill();
  }
  // head with a big eye, then the mantle, with its fins at the tip
  x.fillStyle = col; x.beginPath(); x.ellipse(136, 64, 14, 12, 0, 0, 7); x.fill();
  const body = () => { const w = 18 - sp * 3; x.beginPath(); x.moveTo(146, 64 - w); x.quadraticCurveTo(210, 64 - w * 0.9, 244, 64); x.quadraticCurveTo(210, 64 + w * 0.9, 146, 64 + w); x.closePath(); };
  tri(x, [226, 64], [250, 40 - sp * 4], [204, 58], shade(col, -10)); tri(x, [226, 64], [250, 88 + sp * 4], [204, 70], shade(col, -10));
  fillBody(x, body, col, null, 0);
  x.fillStyle = 'rgba(120,20,20,0.28)'; for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(150 + (i * 37) % 80, 56 + (i * 13) % 16, 1.6, 0, 7); x.fill(); }
  x.fillStyle = '#f4f1e8'; x.beginPath(); x.arc(136, 61, 6.5, 0, 7); x.fill(); eye(x, 137, 61, 4.2);
}
function drawSeal(x, f) {
  const back = '#76797c', belly = '#b8b4aa';
  if (f === 4) { // hauled out on the shore: a banana-shaped rest, head and tail up
    fluke(x, 46, 74, -0.4, 30, shade(back, -12));
    x.fillStyle = back; x.beginPath(); x.ellipse(126, 86, 88, 24, -0.02, 0, 7); x.fill(); x.fillStyle = belly; x.beginPath(); x.ellipse(130, 100, 70, 9, 0, 0, Math.PI); x.fill();
    x.fillStyle = back; x.beginPath(); x.ellipse(206, 64, 26, 20, -0.5, 0, 7); x.fill(); x.beginPath(); x.ellipse(226, 52, 18, 15, -0.2, 0, 7); x.fill(); x.beginPath(); x.ellipse(242, 56, 9, 7, 0, 0, 7); x.fill();
    x.fillStyle = shade(back, -16); x.beginPath(); x.ellipse(180, 106, 14, 5, 0.3, 0, 7); x.fill();
    for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(40,42,45,0.35)'; x.beginPath(); x.ellipse(70 + (i * 41) % 130, 78 + (i * 17) % 14, 3, 2, 0, 0, 7); x.fill(); }
    eye(x, 232, 48, 3.2); x.fillStyle = '#111'; x.beginPath(); x.arc(250, 55, 2.4, 0, 7); x.fill();
    x.strokeStyle = 'rgba(230,230,230,0.8)'; x.lineWidth = 0.8; for (const d of [-3, 0, 3]) { x.beginPath(); x.moveTo(244, 58); x.lineTo(256, 58 + d * 1.5); x.stroke(); }
    return;
  }
  const a = Math.sin(f / 4 * Math.PI * 2) * 0.35;
  fluke(x, 40, 64, a, 30, shade(back, -12));
  const body = () => { x.beginPath(); x.ellipse(130, 64, 94, 24, 0, 0, 7); x.ellipse(214, 60, 26, 20, 0, 0, 7); };
  fillBody(x, body, back, belly, 74, false);
  x.fillStyle = back; x.beginPath(); x.ellipse(240, 63, 10, 8, 0, 0, 7); x.fill();
  for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(40,42,45,0.35)'; x.beginPath(); x.ellipse(60 + (i * 43) % 140, 54 + (i * 19) % 16, 3, 2, 0, 0, 7); x.fill(); }
  x.save(); x.translate(184, 80); x.rotate(0.9 + a * 0.5); x.fillStyle = shade(back, -16); x.beginPath(); x.ellipse(0, 10, 6, 15, 0, 0, 7); x.fill(); x.restore();
  eye(x, 224, 55, 3.2); x.fillStyle = '#111'; x.beginPath(); x.arc(249, 61, 2.4, 0, 7); x.fill();
  x.strokeStyle = 'rgba(230,230,230,0.8)'; x.lineWidth = 0.8; for (const d of [-3, 0, 3]) { x.beginPath(); x.moveTo(244, 64); x.lineTo(256, 64 + d * 1.5); x.stroke(); }
}
function drawPenguin(x, f) {
  const a = Math.sin(f / 4 * Math.PI * 2);
  // swimming: a black-and-white torpedo, flippers beating
  x.save(); x.translate(150, 66); x.rotate(-0.5 + a * 0.6); x.fillStyle = '#16191d'; x.beginPath(); x.ellipse(0, -22, 7, 26, 0, 0, 7); x.fill(); x.restore();
  const body = () => { x.beginPath(); x.ellipse(132, 64, 96, 26, 0, 0, 7); };
  fillBody(x, body, '#1d2228', '#f5f4ef', 66, false);
  x.fillStyle = '#1d2228'; x.beginPath(); x.ellipse(222, 60, 22, 18, 0, 0, 7); x.fill();
  x.fillStyle = '#f5f4ef'; x.beginPath(); x.ellipse(214, 70, 12, 6, 0.2, 0, 7); x.fill();
  x.fillStyle = '#e9b23a'; x.beginPath(); x.moveTo(240, 58); x.lineTo(256, 62); x.lineTo(240, 65); x.fill();
  x.fillStyle = '#1d2228'; x.beginPath(); x.moveTo(36, 60); x.lineTo(18, 64); x.lineTo(36, 68); x.fill();
  x.fillStyle = '#e8b0a0'; x.beginPath(); x.moveTo(52, 82); x.lineTo(38, 90); x.lineTo(46, 80); x.fill();
  x.save(); x.translate(140, 70); x.rotate(0.6 - a * 0.6); x.fillStyle = '#23282e'; x.beginPath(); x.ellipse(0, 18, 7, 24, 0, 0, 7); x.fill(); x.restore();
  eye(x, 226, 56, 2.4);
}
// standing penguins (separate, upright texture): 0 stand, 1 waddle
const PW = 128, PH = 192;
function drawPenguinStand(x, f) {
  x.clearRect(0, 0, PW, PH); const lean = f ? 0.08 : -0.04;
  x.save(); x.translate(64, 180); x.rotate(lean);
  x.fillStyle = '#e8a68c'; x.beginPath(); x.ellipse(-12, 2, 12, 4, 0, 0, 7); x.ellipse(12, 2, 12, 4, 0, 0, 7); x.fill();
  x.fillStyle = '#1d2228'; x.beginPath(); x.ellipse(0, -72, 36, 72, 0, 0, 7); x.fill();
  x.fillStyle = '#f5f4ef'; x.beginPath(); x.ellipse(2, -64, 26, 60, 0, 0, 7); x.fill();
  x.fillStyle = '#1d2228'; x.beginPath(); x.ellipse(0, -140, 26, 24, 0, 0, 7); x.fill();
  x.fillStyle = '#f5f4ef'; x.beginPath(); x.ellipse(8, -136, 10, 8, 0.3, 0, 7); x.fill();
  x.fillStyle = '#e9b23a'; x.beginPath(); x.moveTo(20, -144); x.lineTo(38, -138); x.lineTo(20, -134); x.fill();
  for (const s of [-1, 1]) { x.save(); x.translate(s * 32, -96); x.rotate(s * (0.25 + (f ? 0.2 : 0))); x.fillStyle = '#20252b'; x.beginPath(); x.ellipse(0, 26, 8, 30, 0, 0, 7); x.fill(); x.restore(); }
  eye(x, 12, -146, 2.6);
  x.restore();
}
function blobCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  for (let i = 0; i < 6; i++) { const px = 32 + (rnd() - 0.5) * 18, py = 32 + (rnd() - 0.5) * 18, r = 12 + rnd() * 14, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  return c;
}

// species: len = body length (m); depth: [min, max] metres of water it needs; band: how deep it swims (fraction of the water depth);
// hp; pts for a kill (0 = protected, no points); group size; how fast
const SPECIES = {
  shark: { name: 'SHARK', len: 3.6, need: 8, band: [0.08, 0.7], hp: 80, pts: 60, grp: [1, 2], sp: 3.4, draw: drawShark, w: 3 },
  whale: { name: 'WHALE', len: 13, need: 22, band: [0.15, 0.55], hp: 420, pts: 150, grp: [1, 2], sp: 2.4, draw: drawWhale, w: 1.3 },
  dolphin: { name: 'DOLPHIN', len: 2.5, need: 6, band: [0.02, 0.18], hp: 40, pts: 0, grp: [3, 6], sp: 6.5, draw: drawDolphin, w: 2.2 },
  squid: { name: 'SQUID', len: 0.9, need: 8, band: [0.35, 0.8], hp: 16, pts: 20, grp: [3, 7], sp: 2.2, draw: x => 0, w: 2 },
  giant: { name: 'GIANT SQUID', len: 11, need: 32, band: [0.7, 0.9], hp: 320, pts: 250, grp: [1, 1], sp: 1.6, draw: x => 0, w: 0.35 },
  seal: { name: 'SEAL', len: 1.9, need: 2.5, band: [0.03, 0.4], hp: 40, pts: 0, grp: [2, 4], sp: 3.6, draw: drawSeal, w: 1.6, shore: 1 },
  penguin: { name: 'PENGUIN', len: 0.8, need: 1.5, band: [0.02, 0.3], hp: 12, pts: 0, grp: [4, 8], sp: 3.2, draw: drawPenguin, w: 2, shore: 1 },
};
SPECIES.squid.draw = (x, f) => drawSquid(x, f, false); SPECIES.giant.draw = (x, f) => drawSquid(x, f, true);
let ART = null;
function art() {
  if (ART) return ART;
  ART = { strip: {}, stand: tex(strip(PW, PH, 2, drawPenguinStand)), blob: tex(blobCanvas()) };
  for (const k in SPECIES) ART.strip[k] = tex(strip(FW, FH, 5, (x, i) => SPECIES[k].draw(x, i)));
  return ART;
}

const MAX = 26, FAR = 330, PUFFS = 48;
export class SeaLife {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = []; this.puffs = []; this.pi = 0; this.spawnT = 1; this.t = 0; this.lat = 45; this.waterNear = false; this.wT = 0;
  }
  clear() { for (const a of this.list) this._remove(a); this.list = []; for (const p of this.puffs) { p.life = 0; p.sp.visible = false; } }
  _remove(a) { this.scene.remove(a.sprite); a.mat.map.dispose(); a.mat.dispose(); }
  _surf(x, z) { const h = this.world.heightAt(x, z); return (Number.isFinite(h) ? h : 0) - 0.25; }
  _inside(x, z) { try { return !!(this.world.water && this.world.water.inside(x, z)); } catch { return false; } }
  _depth(x, z) { try { return this.world.waterDepth(x, z) || 0; } catch { return 0; } }
  _puff(x, y, z, col, s0, s1, life, vy = 0.4, a = 0.6) {
    if (!this.puffs.length) { const t = art().blob; for (let i = 0; i < PUFFS; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: true })); sp.visible = false; this.scene.add(sp); this.puffs.push({ sp, life: 0 }); } }
    const p = this.puffs[this.pi]; this.pi = (this.pi + 1) % PUFFS;
    Object.assign(p, { life, max: life, s0, s1, vy, a }); p.sp.position.set(x, y, z); p.sp.material.color.set(col); p.sp.material.rotation = rnd() * 6.28; p.sp.visible = true;
  }
  // which species live here
  _menu(depth, nearShore) {
    const out = [], L = Math.abs(this.lat), south = this.lat < -25;
    if (depth >= SPECIES.dolphin.need) out.push(['dolphin', 3]);
    if (depth >= SPECIES.shark.need) out.push(['shark', 2.5]);
    if (depth >= SPECIES.squid.need) out.push(['squid', 2]);
    if (depth >= SPECIES.whale.need) out.push(['whale', 1.2]);
    if (depth >= SPECIES.giant.need) out.push(['giant', 0.25]);
    if (nearShore && L > 28) out.push(['seal', 2.2]);
    if (nearShore && south) out.push(['penguin', 2.6]);
    return out;
  }
  _spawn(P) {
    for (let tries = 0; tries < 10; tries++) {
      const a = rnd() * 6.28, d = 45 + rnd() * 190, x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (!this._inside(x, z)) continue;
      const depth = this._depth(x, z); if (depth < 1.5) continue;
      // is there a shore within ~50 m (for seals and penguins)?
      let shore = null; for (let k = 0; k < 8 && !shore; k++) { const b = k / 8 * 6.28; for (let r = 6; r <= 54; r += 6) { const sx = x + Math.sin(b) * r, sz = z + Math.cos(b) * r; if (!this._inside(sx, sz)) { shore = { x: sx + Math.sin(b) * 2, z: sz + Math.cos(b) * 2 }; break; } } }
      const menu = this._menu(depth, !!shore); if (!menu.length) continue;
      let tot = 0; for (const m of menu) tot += m[1]; let r = rnd() * tot, kind = menu[0][0]; for (const m of menu) { r -= m[1]; if (r <= 0) { kind = m[0]; break; } }
      const S = SPECIES[kind], n = S.grp[0] + Math.floor(rnd() * (S.grp[1] - S.grp[0] + 1));
      for (let i = 0; i < n && this.list.length < MAX; i++) {
        // seals and penguins: some lie / stand about on the shore
        if (S.shore && shore && rnd() < 0.45) { const lx = shore.x + (rnd() - 0.5) * 5, lz = shore.z + (rnd() - 0.5) * 5; if (!this._inside(lx, lz)) { this._add(kind, lx, lz, true); continue; } }
        const ox = x + (rnd() - 0.5) * (4 + n * 2), oz = z + (rnd() - 0.5) * (4 + n * 2); if (this._inside(ox, oz)) this._add(kind, ox, oz, false);
      }
      return;
    }
  }
  _add(kind, x, z, land) {
    const S = SPECIES[kind], A = art(), standing = land && kind === 'penguin';
    const map = (standing ? A.stand : A.strip[kind]).clone(); map.repeat.set(standing ? 0.5 : 0.2, 1); map.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map, alphaTest: 0.3, transparent: true, depthWrite: true, fog: true }), sprite = new THREE.Sprite(mat);
    const len = S.len * (0.85 + rnd() * 0.3);
    if (standing) sprite.scale.set(len * PW / PH * 1.0, len, 1), sprite.center.set(0.5, 12 / PH); else sprite.scale.set(len, len * FH / FW, 1);
    this.scene.add(sprite);
    const depth = this._depth(x, z), surf = this._surf(x, z), band = S.band[0] + rnd() * (S.band[1] - S.band[0]);
    const a = { kind, S, sprite, mat, len, x, z, y: land ? this.world.heightAt(x, z) : surf - Math.max(0.4, depth * band), band, land, standing, yaw: rnd() * 6.28, sp: S.sp * (0.6 + rnd() * 0.5), vy: 0, k: rnd(), hp: S.hp * (len / S.len), dead: 0, pitch: 0, turnT: 0, turn: 0, jump: 0, jumpT: 4 + rnd() * 10, blowT: 5 + rnd() * 15, biteCd: 0, flee: 0, flip: false };
    if (land) a.sp = 0;
    this.list.push(a);
  }
  targets() { const o = []; for (const a of this.list) if (!a.dead) o.push({ id: '', npc: 'sea', ref: a, x: a.x, y: a.y - 0.7, z: a.z, r: Math.max(0.9, a.len * 0.32) }); return o; }
  velOf(a) { return new THREE.Vector3(Math.sin(a.yaw) * a.sp, a.vy || 0, Math.cos(a.yaw) * a.sp); }
  // damage one; returns { killed, kind, name, pts } once it dies
  hit(a, dmg) {
    if (!a || a.dead) return null; a.hp -= dmg; a.flee = 4; a.sp = a.S.sp * 1.6;
    this._puff(a.x, a.y, a.z, '#8a1010', 0.4, 1.2 + a.len * 0.1, 1.2, 0.1, 0.55);
    if (a.hp > 0) return null;
    this._kill(a); return { killed: true, kind: a.kind, name: a.S.name, pts: a.S.pts, x: a.x, y: a.y, z: a.z };
  }
  _kill(a) {
    a.dead = 1e-3; a.sp = 0; a.mat.color.set('#c9a0a0');
    for (let i = 0; i < 4 + Math.min(8, a.len); i++) this._puff(a.x + (rnd() - 0.5) * a.len * 0.4, a.y + (rnd() - 0.5) * 0.6, a.z + (rnd() - 0.5) * a.len * 0.4, '#7a0a0a', 0.6, 1.5 + a.len * 0.25, 2.5 + rnd() * 1.5, 0.1, 0.6);
  }
  // ctx: { P: player {x,y,z,vx,vz}, on, cam, lat, diving, near (camera or player is by the water) }
  // returns events: { ram: { kill info } } / { bite: dmg } / { bump: speed, kind }
  update(dt, ctx) {
    if (!ctx.on) { if (this.list.length) this.clear(); return null; }
    this.t += dt; if (Number.isFinite(ctx.lat)) this.lat = ctx.lat;
    const P = ctx.P; let ev = null;
    // only bother when there's water about
    if ((this.wT -= dt) <= 0) { this.wT = 2; let near = this._inside(P.x, P.z); for (let k = 0; k < 8 && !near; k++) { const b = k / 8 * 6.28; near = this._inside(P.x + Math.sin(b) * 120, P.z + Math.cos(b) * 120); } this.waterNear = near; }
    if (this.waterNear && (this.spawnT -= dt) <= 0) { this.spawnT = 1.5 + rnd() * 2; if (this.list.filter(a => !a.dead).length < MAX - 4) this._spawn(P); }
    const camR = ctx.cam ? new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.cam.quaternion) : null, pvx = P.vx || 0, pvz = P.vz || 0, py = (P.y || 0) + 0.6;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i], S = a.S, rx = a.x - P.x, rz = a.z - P.z, dist = Math.hypot(rx, rz);
      if (dist > FAR) { this._remove(a); this.list.splice(i, 1); continue; }
      const surf = this._surf(a.x, a.z);
      if (a.dead) {
        // belly up, drifting to the surface, then fading
        a.dead += dt; a.pitch += (Math.PI - a.pitch) * Math.min(1, dt * 1.5);
        if (!a.land) a.y = Math.min(surf - a.len * 0.05, a.y + dt * 0.6);
        if (a.dead > 14) a.mat.opacity = Math.max(0, 1 - (a.dead - 14) / 4);
        a.sprite.position.set(a.x, a.y, a.z); a.mat.rotation = a.flip ? -a.pitch : a.pitch;
        if (a.dead > 18) { this._remove(a); this.list.splice(i, 1); }
        continue;
      }
      if (a.land) {
        // seals and penguins on the shore: shuffle about now and then; a car charging at them sends them into the water
        if (dist < 18 && Math.hypot(pvx, pvz) > 5 && !a.flee) { a.flee = 3; a.yaw = Math.atan2(rx, rz); }
        if (a.flee > 0) { a.flee -= dt; const nx = a.x + Math.sin(a.yaw) * 2.2 * dt, nz = a.z + Math.cos(a.yaw) * 2.2 * dt; if (this._inside(nx, nz)) { a.land = false; a.standing = false; a.y = surf - 0.3; this._remove(a); this.list.splice(i, 1); this._add(a.kind, nx, nz, false); continue; } a.x = nx; a.z = nz; }
        const g = this.world.heightAt(a.x, a.z); if (Number.isFinite(g)) a.y = g + (a.standing ? 0 : a.len * 0.12);
        let fr = a.standing ? (a.flee > 0 ? (Math.floor(this.t * 6) & 1) : 0) : 4;
        this._frame(a, fr, camR); a.sprite.position.set(a.x, a.y, a.z);
      } else {
        // wander: lazy turns; keep to water that's deep enough, and to its band of depth
        if ((a.turnT -= dt) <= 0) { a.turnT = 2 + rnd() * 5; a.turn = (rnd() - 0.5) * 0.8; }
        let turn = a.turn;
        const look = 4 + a.len, lx = a.x + Math.sin(a.yaw) * look, lz = a.z + Math.cos(a.yaw) * look;
        if (!this._inside(lx, lz) || this._depth(lx, lz) < Math.min(S.need, this._depth(a.x, a.z)) * 0.6) turn = 2.2;
        if (dist > 260) { let da = Math.atan2(-rx, -rz) - a.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); turn = Math.sign(da) * 0.7; }
        // sharks: curious about submarines; they circle in, bite, and back off
        a.biteCd = Math.max(0, a.biteCd - dt);
        if (a.kind === 'shark' && ctx.diving && dist < 35 && a.flee <= 0) {
          let da = Math.atan2(-rx, -rz) - a.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); turn = Math.max(-1.6, Math.min(1.6, da * 2)); a.sp += (S.sp * 2 - a.sp) * Math.min(1, dt);
          a.wantY = py;
          if (Math.hypot(rx, rz, a.y - py) < 2.6 + a.len * 0.25 && a.biteCd <= 0) { a.biteCd = 3; a.flee = 3; a.yaw += Math.PI * (0.7 + rnd() * 0.4); (ev = ev || []).push({ bite: 8, kind: a.kind }); }
        } else a.wantY = null;
        if (a.flee > 0) { a.flee -= dt; if (dist < 30 && a.kind !== 'shark') { let da = Math.atan2(rx, rz) - a.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); turn = Math.sign(da) * 1.2; } } else a.sp += (S.sp - a.sp) * Math.min(1, dt * 0.5);
        a.yaw += turn * dt;
        const nx = a.x + Math.sin(a.yaw) * a.sp * dt, nz = a.z + Math.cos(a.yaw) * a.sp * dt;
        if (this._inside(nx, nz)) { a.x = nx; a.z = nz; } else a.yaw += Math.PI * 0.6;
        const depth = this._depth(a.x, a.z), bed = surf - depth, ns = this._surf(a.x, a.z);
        let wantY = a.wantY != null ? a.wantY : ns - Math.max(0.3, depth * a.band);
        // dolphins leap; whales come up to blow
        if (a.kind === 'dolphin') {
          if (a.jump > 0) { a.vy -= 9.8 * dt; a.y += a.vy * dt; if (a.y < ns - 0.6 && a.vy < 0) { a.jump = 0; this._puff(a.x, ns + 0.2, a.z, '#eaf6ff', 0.5, 2.2, 0.9, 0.6, 0.7); } }
          else if ((a.jumpT -= dt) <= 0 && a.y > ns - 2.5) { a.jumpT = 5 + rnd() * 12; a.jump = 1; a.vy = 6 + rnd() * 2; this._puff(a.x, ns + 0.2, a.z, '#eaf6ff', 0.5, 2, 0.8, 0.8, 0.7); }
        }
        if (a.kind === 'whale') { if ((a.blowT -= dt) <= 0) { a.blowT = 12 + rnd() * 18; a.surfacing = 7; } if (a.surfacing > 0) { a.surfacing -= dt; wantY = ns - 1.2; if (a.y > ns - 2 && a.surfacing < 4.5 && !a.blew) { a.blew = true; for (let k = 0; k < 6; k++) this._puff(a.x + Math.sin(a.yaw) * a.len * 0.3, ns + 1 + k * 0.7, a.z + Math.cos(a.yaw) * a.len * 0.3, '#f4fbff', 0.6, 2.5 + k * 0.3, 2.2, 1.6, 0.55); } } else a.blew = false; }
        if (!a.jump) { const prev = a.y; a.y += (wantY - a.y) * Math.min(1, dt * 0.6); a.y = Math.max(bed + a.len * 0.12 + 0.3, Math.min(ns - 0.25, a.y)); a.vy = (a.y - prev) / Math.max(dt, 1e-3); }
        a.pitch += (Math.atan2(a.vy, Math.max(0.5, a.sp)) * 0.8 - a.pitch) * Math.min(1, dt * 3);
        a.k = (a.k + dt * (0.6 + a.sp * 0.25) * S.w * 0.5) % 1;
        this._frame(a, Math.floor(a.k * 4), camR);
        a.sprite.position.set(a.x, a.y, a.z);
      }
      // the player's car / boat / sub running into it
      const dy = a.y - py, d3 = Math.hypot(rx, rz, dy), reach = Math.max(1.3, a.len * 0.36) + 1;
      if (d3 < reach && !a.dead) {
        const rel = Math.hypot(pvx - Math.sin(a.yaw) * a.sp, pvz - Math.cos(a.yaw) * a.sp);
        if (rel > 3) {
          if (a.kind === 'whale' || a.kind === 'giant' || (a.kind === 'shark' && rel < 9)) {
            (ev = ev || []).push({ bump: rel, kind: a.kind }); a.flee = 3; a.yaw = Math.atan2(rx, rz);
            const r = this.hit(a, rel * 3); if (r) ev.push({ ram: r });
          } else { this._kill(a); (ev = ev || []).push({ ram: { killed: true, kind: a.kind, name: S.name, pts: S.pts, x: a.x, y: a.y, z: a.z } }); }
        }
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.sp.visible = false; continue; }
      const k = 1 - p.life / p.max, s = p.s0 + (p.s1 - p.s0) * Math.sqrt(k); p.sp.scale.set(s, s, 1); p.sp.position.y += p.vy * dt; p.sp.material.opacity = p.a * (1 - k);
    }
    return ev;
  }
  // which picture, mirrored to swim the right way as seen from the camera, tilted to its pitch
  _frame(a, f, camR) {
    if (camR) { const side = Math.sin(a.yaw) * camR.x + Math.cos(a.yaw) * camR.z; if (Math.abs(side) > 0.12) a.flip = side < 0; }
    const n = a.standing ? 2 : 5, fw = 1 / n; a.mat.map.repeat.x = a.flip ? -fw : fw; a.mat.map.offset.x = a.flip ? (f + 1) * fw : f * fw;
    if (!a.standing) a.mat.rotation = a.flip ? -a.pitch : a.pitch;
  }
}
