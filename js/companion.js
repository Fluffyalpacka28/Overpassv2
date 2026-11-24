import * as THREE from 'three';
import { modelTemplate } from './custom.js';

// The front passenger: a dog (a flat billboard, drawn here) or a 3D model you uploaded.
// The dog:
//   - stopped: sits beside you, panting
//   - driving slowly: sits up in the seat
//   - fast: head out of the window, ears flapping and tongue out
//   - someone on foot blocking the road for over a second: barks out of the window ("WOOF!")
//   - underwater: a little scuba mask and snorkel; in the air: a leather flying helmet and goggles

export const DOG_COATS = [
  ['golden', 'Golden', '#d9a05b'], ['black', 'Black lab', '#2a2523'], ['choc', 'Chocolate', '#6b4127'], ['cream', 'Cream', '#ecd9b4'],
  ['dalmatian', 'Dalmatian', '#f4f1ea'], ['husky', 'Husky', '#7c8088'], ['shepherd', 'Shepherd', '#b98142'], ['beagle', 'Beagle', '#c98a45'],
  ['corgi', 'Corgi', '#d98a3d'], ['collie', 'Border collie', '#1f1d1d'], ['pug', 'Pug', '#d8bb8c'], ['poodle', 'Poodle', '#f5f1ea'], ['weim', 'Grey', '#8d8a86'],
];
// body/dark/light (chest, muzzle)/ear/nose; flags: spots, mask (pale face), pointy ears, big ears, saddle (dark back + crown),
// tri (beagle: black saddle, tan, white), blaze (white chest, feet, face stripe), darkMuzzle (pug), curly (poodle), small (short legs)
const COATS = {
  golden: { body: '#d9a05b', dark: '#a8722f', light: '#f1d29c', ear: '#b9813f', nose: '#2a1d16', feather: true },
  black: { body: '#2e2927', dark: '#141110', light: '#3f3734', ear: '#201b1a', nose: '#0c0a0a' },
  choc: { body: '#6e4329', dark: '#45281a', light: '#8c5c3d', ear: '#55311b', nose: '#3a2418' },
  cream: { body: '#ecd9b4', dark: '#c9b088', light: '#fbf1dc', ear: '#d6bd90', nose: '#2a1d16', feather: true },
  dalmatian: { body: '#f4f1ea', dark: '#cfc8bb', light: '#ffffff', ear: '#2a2624', nose: '#151212', spots: true },
  husky: { body: '#7c8088', dark: '#4b4f56', light: '#f2f2f0', ear: '#5a5e65', nose: '#151517', mask: true, pointy: true, eyes: '#5fb3e8' },
  shepherd: { body: '#b98142', dark: '#7d5225', light: '#e0b77c', ear: '#2a201a', nose: '#141010', pointy: true, saddle: '#2a221c' },
  beagle: { body: '#c98a45', dark: '#8d5a27', light: '#fbf7ef', ear: '#a86b30', nose: '#1c1412', tri: '#2a2321', blaze: true },
  corgi: { body: '#d98a3d', dark: '#a8611f', light: '#fbf6ec', ear: '#c4762f', nose: '#1c1412', pointy: true, big: true, blaze: true, small: true },
  collie: { body: '#1f1d1d', dark: '#0e0d0d', light: '#f4f2ee', ear: '#1a1818', nose: '#121010', blaze: true, feather: true },
  pug: { body: '#d8bb8c', dark: '#ad8f62', light: '#ead2a8', ear: '#2a2420', nose: '#141110', darkMuzzle: '#2b2420', small: true },
  poodle: { body: '#f5f1ea', dark: '#d8d0c3', light: '#ffffff', ear: '#ebe4d8', nose: '#1b1716', curly: true },
  weim: { body: '#8d8a86', dark: '#66625e', light: '#a9a5a0', ear: '#7a7672', nose: '#4a4442', eyes: '#d9b25a' },
};
const F = 192, U = F / 128, FRAMES = 9, GEARS = 3; // frames: 0 sit, 1 sit panting, 2 sit from behind, 3-4 window, 5 bark (window), 6 bark (sitting), 7-8 window seen from behind
const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// an ellipse filled with soft light from the top-left, a darker rim, and a few fur strokes around the edge
function blob(x, cx, cy, rx, ry, col, rot = 0, fur = 1) {
  const g = x.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, Math.min(rx, ry) * 0.1, cx, cy, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, mix(col, '#ffffff', 0.18)); g.addColorStop(0.6, col); g.addColorStop(1, mix(col, '#000000', 0.28));
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, 7); x.fill();
  if (!fur) return;
  // soft fur: short strands just inside the edge, a shade darker, combed slightly downwards
  x.save(); x.beginPath(); x.ellipse(cx, cy, rx * 1.04, ry * 1.04, rot, 0, 7); x.clip();
  x.strokeStyle = mix(col, '#000000', 0.16); x.globalAlpha = 0.55; x.lineWidth = 0.8; x.lineCap = 'round';
  const n = Math.round((rx + ry) * 0.7 * fur);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, ex = cx + Math.cos(a + rot) * rx * 0.9, ey = cy + Math.sin(a + rot) * ry * 0.9, l = 1.6 + (i * 7 % 5) * 0.35; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + Math.cos(a + rot) * l * 0.6, ey + Math.sin(a + rot) * l * 0.6 + l * 0.6); x.stroke(); }
  x.restore();
}
function spots(x, cx, cy, rx, ry, n, seed) {
  x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.clip(); x.fillStyle = '#1b1817';
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { x.beginPath(); x.ellipse(cx + (r() - 0.5) * rx * 2, cy + (r() - 0.5) * ry * 2, 2 + r() * 3, 1.6 + r() * 2.4, r() * 3, 0, 7); x.fill(); }
  x.restore();
}
function curls(x, cx, cy, rx, ry, col) { x.strokeStyle = mix(col, '#000000', 0.12); x.lineWidth = 1; for (let i = 0; i < (rx * ry) / 10; i++) { const a = i * 2.39996, r = Math.sqrt(i / ((rx * ry) / 10)), px = cx + Math.cos(a) * rx * r * 0.9, py = cy + Math.sin(a) * ry * r * 0.9; x.beginPath(); x.arc(px, py, 2.2, 0, 5); x.stroke(); } }
function eyeF(x, ex, ey, C, r = 3.2) {
  x.fillStyle = '#1a120d'; x.beginPath(); x.ellipse(ex, ey, r * 1.15, r, 0, 0, 7); x.fill();
  x.fillStyle = C.eyes || '#5a3412'; x.beginPath(); x.arc(ex, ey + 0.2, r * 0.72, 0, 7); x.fill();
  x.fillStyle = '#0b0807'; x.beginPath(); x.arc(ex, ey + 0.3, r * 0.4, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(ex + r * 0.35, ey - r * 0.35, r * 0.28, 0, 7); x.fill();
}
function noseF(x, nx, ny, C, w = 5) {
  x.fillStyle = C.nose; x.beginPath(); x.moveTo(nx - w, ny - 2); x.quadraticCurveTo(nx, ny - 5, nx + w, ny - 2); x.quadraticCurveTo(nx + w * 0.6, ny + 3.5, nx, ny + 3.8); x.quadraticCurveTo(nx - w * 0.6, ny + 3.5, nx - w, ny - 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(nx - w * 0.3, ny - 2, w * 0.35, 1.1, -0.2, 0, 7); x.fill();
}
// a head seen from the front, centred on (hx, hy); mouth: 0 closed, 1 panting (tongue), 2 barking
function headFront(x, C, hx, hy, mouth, tilt = 0) {
  x.save(); x.translate(hx, hy); x.rotate(tilt);
  // ears behind the head (pointy) or hanging beside it (floppy)
  if (C.pointy) for (const s of [-1, 1]) { const big = C.big ? 1.35 : 1; x.fillStyle = C.ear; x.beginPath(); x.moveTo(s * 8, -12); x.lineTo(s * (18 + 4 * big), -30 * big); x.quadraticCurveTo(s * 26 * big, -14, s * 21, -4); x.fill(); x.fillStyle = mix(C.light, '#e8a0a0', 0.35); x.beginPath(); x.moveTo(s * 11, -12); x.lineTo(s * (18 + 3 * big), -25 * big); x.lineTo(s * 19, -8); x.fill(); }
  const headCol = C.saddle && !C.pointy ? C.saddle : C.body;
  blob(x, 0, -2, 20, 19, headCol);
  if (C.saddle) { x.fillStyle = C.saddle; x.beginPath(); x.ellipse(0, -12, 15, 9, 0, Math.PI, Math.PI * 2); x.fill(); }
  if (C.tri) { x.fillStyle = C.tri; x.beginPath(); x.ellipse(0, -15, 12, 6, 0, Math.PI, Math.PI * 2); x.fill(); }
  if (C.mask) { x.fillStyle = C.light; x.beginPath(); x.moveTo(0, -16); x.quadraticCurveTo(-18, -10, -15, 8); x.quadraticCurveTo(0, 22, 15, 8); x.quadraticCurveTo(18, -10, 0, -16); x.fill(); x.fillStyle = C.body; x.beginPath(); x.moveTo(0, -18); x.lineTo(-4, -6); x.lineTo(4, -6); x.fill(); }
  if (C.blaze) { x.fillStyle = C.light; x.beginPath(); x.moveTo(-2.5, -18); x.lineTo(2.5, -18); x.lineTo(6, 2); x.lineTo(-6, 2); x.fill(); }
  if (C.spots) spots(x, 0, -4, 18, 16, 7, 11);
  if (C.curly) { blob(x, 0, -16, 14, 9, C.light, 0, 0); curls(x, 0, -14, 14, 9, C.body); }
  if (!C.pointy) for (const s of [-1, 1]) { const r = C.darkMuzzle ? 0.6 : 1; blob(x, s * 21, 2 * r, 8 * r, 18 * r, C.curly ? C.light : C.ear, s * 0.22, C.curly ? 0 : 1); if (C.curly) curls(x, s * 21, 2, 7, 16, C.body); }
  // muzzle, mouth, nose
  blob(x, 0, 9, 12, 9, C.darkMuzzle || C.light, 0, 0);
  x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.ellipse(0, 13, 10, 4, 0, 0, Math.PI); x.fill();
  if (mouth === 2) { x.fillStyle = '#4a1014'; x.beginPath(); x.ellipse(0, 15, 8, 7, 0, 0, 7); x.fill(); x.fillStyle = '#e66d7a'; x.beginPath(); x.ellipse(0, 19, 5, 3, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 5, 9); x.lineTo(s * 4, 13); x.lineTo(s * 3, 9); x.fill(); } }
  else if (mouth === 1) { x.fillStyle = '#4a1014'; x.beginPath(); x.ellipse(0, 14, 6, 3.4, 0, 0, Math.PI); x.fill(); x.fillStyle = '#e66d7a'; x.beginPath(); x.ellipse(1, 19, 5, 8, 0.1, 0, 7); x.fill(); x.strokeStyle = '#c24a59'; x.lineWidth = 1; x.beginPath(); x.moveTo(1, 14); x.lineTo(1, 24); x.stroke(); x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(-1, 18, 1.5, 3, 0.1, 0, 7); x.fill(); }
  x.strokeStyle = mix(C.nose, '#000000', 0.2); x.lineWidth = 1.3; x.beginPath(); x.moveTo(0, 7); x.lineTo(0, 11.5); x.moveTo(-7, 12.5); x.quadraticCurveTo(-3, 15.5, 0, 11.5); x.quadraticCurveTo(3, 15.5, 7, 12.5); x.stroke();
  noseF(x, 0, 5, C);
  // eyes with brows
  for (const s of [-1, 1]) { eyeF(x, s * 8, -6, C); x.strokeStyle = mix(C.body, '#000000', 0.3); x.lineWidth = 1.2; x.beginPath(); x.moveTo(s * 4.5, -11.5); x.quadraticCurveTo(s * 8, -13.5, s * 11.5, -11); x.stroke(); }
  if (C.darkMuzzle) { x.strokeStyle = 'rgba(40,30,25,0.5)'; x.lineWidth = 1; for (const yy of [-15, -12]) { x.beginPath(); x.moveTo(-8, yy); x.quadraticCurveTo(0, yy - 2, 8, yy); x.stroke(); } }
  x.restore();
}
// a head in profile, facing right, centred on (hx, hy); flap 0..1 blows the ears and tongue back
function headSide(x, C, hx, hy, mouth, flap) {
  x.save(); x.translate(hx, hy);
  const big = C.big ? 1.3 : 1;
  if (C.pointy) { x.fillStyle = C.ear; x.beginPath(); x.moveTo(-6, -12); x.lineTo(-18 - flap * 6, -26 * big + flap * 6); x.lineTo(-14, -4); x.fill(); x.fillStyle = mix(C.light, '#e8a0a0', 0.35); x.beginPath(); x.moveTo(-8, -10); x.lineTo(-16 - flap * 5, -21 * big + flap * 5); x.lineTo(-13, -6); x.fill(); }
  blob(x, -2, -2, 18, 16, C.saddle && !C.pointy ? C.saddle : C.body);
  // snout
  const sg = x.createLinearGradient(0, -10, 0, 12); sg.addColorStop(0, mix(C.body, '#ffffff', 0.1)); sg.addColorStop(1, mix(C.body, '#000000', 0.2));
  x.fillStyle = C.darkMuzzle || sg; x.beginPath(); x.moveTo(6, -10); x.quadraticCurveTo(C.darkMuzzle ? 22 : 30, -8, C.darkMuzzle ? 24 : 32, 2); x.quadraticCurveTo(30, 11, 8, 11); x.closePath(); x.fill();
  if (C.saddle) { x.fillStyle = C.saddle; x.beginPath(); x.ellipse(-6, -10, 13, 7, -0.2, Math.PI * 0.9, Math.PI * 2.05); x.fill(); }
  if (C.mask || C.blaze) { x.fillStyle = C.light; x.beginPath(); x.moveTo(4, -2); x.quadraticCurveTo(24, 0, 30, 6); x.quadraticCurveTo(18, 12, 0, 10); x.closePath(); x.fill(); }
  if (C.spots) spots(x, -2, -2, 16, 14, 5, 5);
  if (C.curly) { blob(x, -4, -12, 13, 8, C.light, 0, 0); curls(x, -4, -11, 13, 8, C.body); }
  const nx = C.darkMuzzle ? 24 : 31; x.fillStyle = C.nose; x.beginPath(); x.ellipse(nx, 0, 4.2, 3.6, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(nx - 1, -1.5, 1.6, 0.9, 0, 0, 7); x.fill();
  if (mouth === 2) { x.fillStyle = '#4a1014'; x.beginPath(); x.moveTo(10, 8); x.lineTo(30, 5); x.lineTo(26, 19); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(26, 6); x.lineTo(24.5, 10); x.lineTo(23, 6); x.fill(); x.fillStyle = C.darkMuzzle || C.body; x.beginPath(); x.moveTo(8, 12); x.quadraticCurveTo(22, 23, 27, 18); x.lineTo(24, 15); x.closePath(); x.fill(); }
  else if (mouth === 1) {
    x.strokeStyle = '#4a1014'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(28, 7); x.quadraticCurveTo(18, 11, 8, 9); x.stroke();
    // tongue flapping in the wind
    x.fillStyle = '#e66d7a'; x.beginPath(); x.moveTo(18, 9); x.quadraticCurveTo(10 - flap * 6, 20 + flap * 4, -2 - flap * 8, 22 + flap * 6); x.quadraticCurveTo(6, 14, 12, 10); x.closePath(); x.fill();
    x.strokeStyle = '#c24a59'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(14, 11); x.quadraticCurveTo(7 - flap * 4, 17, 0 - flap * 6, 20 + flap * 4); x.stroke();
  }
  // ear streaming back in the wind (floppy ones)
  if (!C.pointy) { x.save(); x.translate(-10, -9); x.rotate(-1.25 - flap * 0.5); blob(x, 0, 14, 7.5, 16, C.curly ? C.light : C.ear, 0, C.curly ? 0 : 1); if (C.curly) curls(x, 0, 14, 7, 15, C.body); x.restore(); }
  eyeF(x, 12, -6, C, 2.8); x.strokeStyle = mix(C.body, '#000000', 0.3); x.lineWidth = 1.1; x.beginPath(); x.moveTo(8, -10.5); x.quadraticCurveTo(12, -12.5, 16, -10); x.stroke();
  x.restore();
}
// scuba mask & snorkel / flying helmet & goggles, over a head drawn from the front, back or side
function gear(x, g, view, hx, hy) {
  if (!g) return;
  x.save(); x.translate(hx, hy);
  if (g === 1) {
    x.strokeStyle = '#1b1d20'; x.lineWidth = 3;
    if (view === 'front') {
      x.beginPath(); x.moveTo(-20, -6); x.lineTo(20, -6); x.stroke();
      x.fillStyle = 'rgba(150,220,255,0.55)'; x.strokeStyle = '#f2b705'; x.lineWidth = 3; x.beginPath(); x.ellipse(0, -6, 15, 8, 0, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(20, 2); x.lineTo(24, -6); x.lineTo(24, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(21, -40, 6, 6);
    } else if (view === 'side') {
      x.beginPath(); x.moveTo(-16, -6); x.lineTo(10, -6); x.stroke();
      x.fillStyle = 'rgba(150,220,255,0.55)'; x.strokeStyle = '#f2b705'; x.lineWidth = 3; x.beginPath(); x.ellipse(14, -6, 6, 8, 0, 0, 7); x.fill(); x.stroke();
      x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(-4, 6); x.lineTo(-8, -8); x.lineTo(-8, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(-11, -40, 6, 6);
    } else { x.beginPath(); x.moveTo(-20, -4); x.lineTo(20, -4); x.stroke(); x.strokeStyle = '#f2b705'; x.lineWidth = 4; x.beginPath(); x.moveTo(18, 2); x.lineTo(18, -36); x.stroke(); x.fillStyle = '#e8432f'; x.fillRect(15, -40, 6, 6); }
  } else {
    // leather flying helmet with ear flaps, goggles on top
    x.fillStyle = '#6b4325';
    if (view === 'side') { x.beginPath(); x.ellipse(-3, -8, 19, 13, -0.1, Math.PI, Math.PI * 2.1); x.fill(); x.beginPath(); x.ellipse(-6, 2, 7, 10, 0, 0, 7); x.fill(); }
    else { x.beginPath(); x.ellipse(0, -8, 21, 15, 0, Math.PI, Math.PI * 2); x.fill(); x.fillRect(-21, -9, 42, 4); for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 19, 2, 6, 11, 0, 0, 7); x.fill(); } }
    x.strokeStyle = '#4a2c16'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -22); x.lineTo(0, -8); x.stroke();
    if (view !== 'back') {
      x.fillStyle = 'rgba(180,230,255,0.7)'; x.strokeStyle = '#a8a8a8'; x.lineWidth = 2.5;
      const gl = view === 'side' ? [[10, -14]] : [[-8, -15], [8, -15]];
      for (const [gx, gy] of gl) { x.beginPath(); x.arc(gx, gy, 6, 0, 7); x.fill(); x.stroke(); }
    }
  }
  x.restore();
}
function drawDog(x, f, C, g) {
  x.clearRect(0, 0, 128, 128);
  const legH = C.small ? 18 : 32, sy = C.small ? 10 : 0;
  if (f <= 1 || f === 6) {
    // sitting, seen from the front: soft shadow, haunches, chest, legs, tail, collar, head
    x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(64, 124, 44, 5, 0, 0, 7); x.fill();
    x.strokeStyle = C.tri ? C.light : C.dark; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(94, 118); x.quadraticCurveTo(118, 112, 113, 94); x.stroke();
    if (C.feather) { x.strokeStyle = C.light; x.lineWidth = 2; x.beginPath(); x.moveTo(98, 120); x.quadraticCurveTo(120, 116, 116, 96); x.stroke(); }
    blob(x, 36, 112, 18, 12, C.body); blob(x, 92, 112, 18, 12, C.body);
    blob(x, 64, 92 + sy * 0.6, 30, 32 - sy * 0.4, C.saddle ? C.body : C.body);
    if (C.tri) { x.fillStyle = C.tri; x.beginPath(); x.ellipse(64, 78 + sy * 0.5, 26, 14, 0, Math.PI * 1.05, Math.PI * 1.95); x.fill(); }
    if (C.spots) spots(x, 64, 92, 28, 30, 14, 3);
    if (C.curly) curls(x, 64, 92, 28, 30, C.body);
    // chest
    const cg = x.createLinearGradient(0, 64, 0, 116); cg.addColorStop(0, C.light); cg.addColorStop(1, mix(C.light, '#000000', 0.12));
    x.fillStyle = cg; x.beginPath(); x.ellipse(64, 86 + sy * 0.5, 15, 22 - sy * 0.3, 0, 0, 7); x.fill();
    if (C.feather) { x.strokeStyle = mix(C.light, '#000000', 0.08); x.lineWidth = 1; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(52 + i * 3, 96 + sy * 0.5); x.lineTo(51 + i * 3, 104 + sy * 0.5 + (i % 2) * 2); x.stroke(); } }
    // front legs
    for (const s of [-1, 1]) {
      const lx = 64 + s * 12, top = 124 - legH, lg = x.createLinearGradient(lx - 6, 0, lx + 6, 0); lg.addColorStop(0, mix(C.body, '#000000', 0.15)); lg.addColorStop(0.5, mix(C.body, '#ffffff', 0.08)); lg.addColorStop(1, mix(C.body, '#000000', 0.2));
      x.fillStyle = C.blaze ? C.light : lg; x.beginPath(); x.roundRect(lx - 6, top, 12, legH, 6); x.fill();
      x.fillStyle = C.blaze || C.mask ? C.light : mix(C.body, '#ffffff', 0.1); x.beginPath(); x.ellipse(lx, 123, 8, 4, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.8; for (const t of [-2.5, 0, 2.5]) { x.beginPath(); x.moveTo(lx + t, 121); x.lineTo(lx + t, 125); x.stroke(); }
    }
    // a collar with a tag
    x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.ellipse(64, 66 + sy * 0.6, 17, 5, 0, 0, Math.PI); x.stroke();
    x.strokeStyle = '#e04a3c'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(64, 65 + sy * 0.6, 17, 5, 0, 0.3, Math.PI - 0.3); x.stroke();
    x.fillStyle = '#f2c230'; x.beginPath(); x.arc(64, 72 + sy * 0.6, 3.4, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(63, 71 + sy * 0.6, 1, 0, 7); x.fill();
    headFront(x, C, 64, 44 + sy * 0.8, f === 6 ? 2 : f, f === 1 ? -0.12 : 0); gear(x, g, 'front', 64, 44 + sy * 0.8);
    return;
  }
  if (f === 2) {
    // sitting, seen from behind
    x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(64, 124, 44, 5, 0, 0, 7); x.fill();
    blob(x, 64, 116, 40, 10, C.body); blob(x, 64, 96 + sy * 0.6, 33, 30 - sy * 0.4, C.body);
    if (C.saddle || C.tri) { x.fillStyle = C.saddle || C.tri; x.beginPath(); x.ellipse(64, 88 + sy * 0.5, 26, 20, 0, 0, 7); x.fill(); }
    if (C.spots) spots(x, 64, 94, 30, 28, 14, 9);
    if (C.curly) curls(x, 64, 96, 30, 28, C.body);
    x.strokeStyle = mix(C.body, '#000000', 0.25); x.lineWidth = 1; x.beginPath(); x.moveTo(64, 70); x.lineTo(64, 114); x.stroke();
    if (C.pointy) for (const s of [-1, 1]) { x.fillStyle = C.ear; x.beginPath(); x.moveTo(64 + s * 8, 30 + sy); x.lineTo(64 + s * (C.big ? 26 : 20), (C.big ? 4 : 12) + sy); x.lineTo(64 + s * 24, 36 + sy); x.fill(); }
    blob(x, 64, 48 + sy * 0.8, 20, 19, C.saddle || C.body);
    if (C.spots) spots(x, 64, 48, 18, 17, 5, 21);
    if (!C.pointy) for (const s of [-1, 1]) blob(x, 64 + s * 20, 50 + sy * 0.8, 7, 16, C.curly ? C.light : C.ear, s * 0.2);
    x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.ellipse(64, 68 + sy * 0.6, 17, 5, 0, 0, Math.PI); x.stroke();
    x.strokeStyle = C.tri ? C.light : C.dark; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(64, 120); x.quadraticCurveTo(96, 126, 107, 108); x.stroke();
    gear(x, g, 'back', 64, 46 + sy * 0.8);
    return;
  }
  if (f >= 7) {
    // head out of the window, seen from behind the car: back of the head, ears blown back, paws on the sill, tongue streaming out to the side
    const flap = f === 8 ? 1 : 0;
    const ng = x.createLinearGradient(0, 70, 0, 128); ng.addColorStop(0, mix(C.body, '#ffffff', 0.08)); ng.addColorStop(1, mix(C.body, '#000000', 0.22));
    x.fillStyle = ng; x.beginPath(); x.moveTo(34, 128); x.quadraticCurveTo(38, 86, 64, 78); x.quadraticCurveTo(90, 86, 94, 128); x.closePath(); x.fill();
    if (C.saddle || C.tri) { x.fillStyle = C.saddle || C.tri; x.beginPath(); x.moveTo(42, 128); x.quadraticCurveTo(46, 92, 64, 86); x.quadraticCurveTo(82, 92, 86, 128); x.closePath(); x.fill(); }
    if (C.spots) spots(x, 64, 106, 26, 22, 9, 31);
    if (C.curly) curls(x, 64, 106, 24, 20, C.body);
    for (const s2 of [-1, 1]) { blob(x, 64 + s2 * 20, 120, 11, 6, C.body, 0, 0); x.fillStyle = C.blaze || C.mask ? C.light : mix(C.body, '#ffffff', 0.12); x.beginPath(); x.ellipse(64 + s2 * 20, 121, 7, 4, 0, 0, 7); x.fill(); }
    x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.ellipse(64, 80, 17, 5, 0, 0, Math.PI); x.stroke();
    // tongue flapping out to the right
    x.fillStyle = '#e66d7a'; x.beginPath(); x.moveTo(76, 70); x.quadraticCurveTo(92, 72 + flap * 4, 104 + flap * 4, 66 - flap * 6); x.quadraticCurveTo(92, 80, 78, 76); x.closePath(); x.fill();
    if (C.pointy) for (const s2 of [-1, 1]) { x.fillStyle = C.ear; x.beginPath(); x.moveTo(64 + s2 * 8, 44); x.lineTo(64 + s2 * ((C.big ? 26 : 20) + flap * 3), (C.big ? 18 : 26) + flap * 4); x.lineTo(64 + s2 * 22, 52); x.fill(); }
    blob(x, 64, 60, 20, 18, C.saddle || C.body);
    if (C.spots) spots(x, 64, 60, 18, 16, 5, 41);
    if (C.curly) { blob(x, 64, 50, 14, 9, C.light, 0, 0); curls(x, 64, 52, 14, 9, C.body); }
    // floppy ears streaming back towards you in the wind
    if (!C.pointy) for (const s2 of [-1, 1]) { x.save(); x.translate(64 + s2 * 15, 52); x.rotate(s2 * (1.9 + flap * 0.35)); blob(x, 0, 12, 7.5, 15, C.curly ? C.light : C.ear, 0, C.curly ? 0 : 1); x.restore(); }
    // fur ruffling on the back of the neck
    x.strokeStyle = mix(C.body, '#000000', 0.2); x.lineWidth = 1; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(50 + i * 4.5, 82); x.lineTo(49 + i * 4.5 + (flap ? 1 : -1), 89); x.stroke(); }
    gear(x, g, 'back', 64, 58);
    return;
  }
  // head and front paws out of the window, in profile facing right
  const flap = f === 4 ? 1 : 0;
  const ng = x.createLinearGradient(20, 70, 70, 128); ng.addColorStop(0, mix(C.body, '#ffffff', 0.12)); ng.addColorStop(1, mix(C.body, '#000000', 0.2));
  x.fillStyle = ng; x.beginPath(); x.moveTo(20, 128); x.quadraticCurveTo(26, 84, 56, 70); x.lineTo(70, 82); x.quadraticCurveTo(60, 110, 64, 128); x.closePath(); x.fill();
  if (C.saddle || C.tri) { x.fillStyle = C.saddle || C.tri; x.beginPath(); x.moveTo(20, 128); x.quadraticCurveTo(24, 92, 46, 76); x.lineTo(34, 128); x.closePath(); x.fill(); }
  if (C.blaze || C.mask) { x.fillStyle = C.light; x.beginPath(); x.moveTo(60, 84); x.quadraticCurveTo(54, 106, 62, 128); x.lineTo(50, 128); x.quadraticCurveTo(48, 104, 56, 82); x.fill(); }
  if (C.spots) spots(x, 44, 104, 20, 24, 8, 17);
  if (C.curly) curls(x, 44, 104, 18, 22, C.body);
  // fur blowing back along the neck
  x.strokeStyle = mix(C.body, '#000000', 0.2); x.lineWidth = 1; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(30 + i * 4, 90 - i * 3); x.lineTo(22 + i * 4 - flap * 3, 92 - i * 3); x.stroke(); }
  x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.moveTo(42, 80); x.quadraticCurveTo(54, 90, 66, 84); x.stroke();
  // paws over the door
  blob(x, 78, 114, 14, 7, C.body, 0, 0); x.fillStyle = C.blaze || C.mask ? C.light : mix(C.body, '#ffffff', 0.12); x.beginPath(); x.ellipse(88, 115, 6.5, 5, 0, 0, 7); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.8; for (const t of [-2, 1]) { x.beginPath(); x.moveTo(89 + t, 112); x.lineTo(92 + t, 118); x.stroke(); }
  headSide(x, C, 62, 62, f === 5 ? 2 : 1, flap); gear(x, g, 'side', 62, 62);
}
const atlases = new Map();
function atlas(coat) {
  let t = atlases.get(coat); if (t) return t;
  const C = COATS[coat] || COATS.golden, c = document.createElement('canvas'); c.width = F * FRAMES; c.height = F * GEARS; const x = c.getContext('2d');
  for (let g = 0; g < GEARS; g++) for (let f = 0; f < FRAMES; f++) { x.save(); x.translate(f * F, g * F); x.beginPath(); x.rect(0, 0, F, F); x.clip(); x.scale(U, U); drawDog(x, f, C, g); x.restore(); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; atlases.set(coat, t); return t;
}
let WOOF = null;
function woofTex() {
  if (WOOF) return WOOF;
  const c = document.createElement('canvas'); c.width = 160; c.height = 80; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#1b1d20'; x.lineWidth = 4; x.beginPath(); x.roundRect(6, 6, 148, 52, 22); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(40, 56); x.lineTo(28, 76); x.lineTo(60, 56); x.fill(); x.stroke(); x.fillStyle = '#fff'; x.fillRect(36, 52, 22, 6);
  x.fillStyle = '#1b1d20'; x.font = '900 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('WOOF!', 80, 33);
  WOOF = new THREE.CanvasTexture(c); WOOF.colorSpace = THREE.SRGBColorSpace; return WOOF;
}

export class Companion {
  constructor() {
    this.g = new THREE.Group(); this.g.name = 'companion';
    this.mat = new THREE.SpriteMaterial({ map: atlas('golden').clone(), alphaTest: 0.3, transparent: true, depthWrite: true, fog: true });
    this.mat.map.repeat.set(1 / FRAMES, 1 / GEARS); this.mat.map.needsUpdate = true; this.coat = 'golden';
    this.dog = new THREE.Sprite(this.mat); this.dog.center.set(0.5, 0); this.g.add(this.dog);
    this.woof = new THREE.Sprite(new THREE.SpriteMaterial({ map: woofTex(), transparent: true, depthTest: false, depthWrite: false })); this.woof.scale.set(0.6, 0.3, 1); this.woof.visible = false; this.woof.renderOrder = 30; this.g.add(this.woof);
    this.modelG = new THREE.Group(); this.g.add(this.modelG); this.modelKey = ''; this.modelInner = null;
    this.t = 0; this.barkT = 0; this.barkCd = 0; this.blockT = 0; this.out = 0; this.flip = false;
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  dispose() { if (this.g.parent) this.g.parent.remove(this.g); this.mat.map.dispose(); this.mat.dispose(); }
  setCoat(coat) { if (coat === this.coat || !COATS[coat]) return; this.coat = coat; const off = this.mat.map.offset.clone(), rep = this.mat.map.repeat.clone(); this.mat.map.dispose(); this.mat.map = atlas(coat).clone(); this.mat.map.repeat.copy(rep); this.mat.map.offset.copy(off); this.mat.map.needsUpdate = true; this.mat.needsUpdate = true; }
  _model(a) {
    const key = a && a.data ? a.h : '';
    if (key === this.modelKey) return; this.modelKey = key;
    this.modelG.clear(); this.modelInner = null; if (!key) return;
    modelTemplate({ h: a.h, ext: a.m.ext, data: a.data }).then(tpl => {
      if (this.modelKey !== key) return;
      const inner = tpl.clone(true); inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), mx = Math.max(size.x, size.y, size.z), c = box.getCenter(new THREE.Vector3());
      // sized to sit in a seat (about 75 cm tall), standing on the cushion
      inner.position.sub(new THREE.Vector3(c.x, box.min.y, c.z)); const norm = new THREE.Group(); norm.scale.setScalar(isFinite(mx) && mx > 1e-6 ? 0.75 / mx : 1); norm.add(inner);
      norm.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.modelG.add(norm); this.modelInner = norm;
    }).catch(e => console.warn('[overpass] passenger model', e));
  }
  // ctx: { mesh, eye: [x, y, z] passenger eye position in the car, kind: 'dog' | 'model' | 'none', coat, model: { h, data, m } | null,
  //        speed (m/s), under, air, blocked (people in the way, seconds), cam, ckpt (cockpit view) } → 'bark' when it barks
  update(dt, ctx) {
    const mesh = ctx.mesh; if (!mesh || ctx.kind === 'none' || !ctx.eye) { if (this.g.parent) this.g.parent.remove(this.g); return null; }
    if (this.g.parent !== mesh) mesh.add(this.g);
    this.t += dt; let ev = null;
    const [ex, ey, ez] = ctx.eye, side = ex >= 0 ? 1 : -1, sp = Math.abs(ctx.speed || 0);
    const isDog = ctx.kind === 'dog'; this.dog.visible = isDog; this.modelG.visible = !isDog;
    if (!isDog) {
      this._model(ctx.model); this.woof.visible = false;
      const m = (ctx.model && ctx.model.m) || {}; this.modelG.position.set(ex + (m.x || 0), ey - 0.62 + (m.y || 0), ez + 0.05 + (m.z || 0)); this.modelG.rotation.set(0, (m.yaw || 0) * Math.PI / 180, 0); this.modelG.scale.setScalar(m.s || 1);
      return null;
    }
    this.setCoat(ctx.coat || 'golden');
    // where's the camera? (behind the car = see the dog's back; which way the car points on screen = which way the dog faces)
    mesh.getWorldQuaternion(this._q); this._f.set(0, 0, 1).applyQuaternion(this._q); mesh.getWorldPosition(this._v);
    // (with some slack either way, so a camera right behind or beside the car doesn't make the dog flick back and forth)
    const cam = ctx.cam;
    if (cam) {
      const dx = cam.position.x - this._v.x, dz = cam.position.z - this._v.z, dl = Math.hypot(dx, dz) || 1, b = (dx * this._f.x + dz * this._f.z) / dl;
      if (b < -0.25) this.behind = true; else if (b > 0.25) this.behind = false;
      this._r.set(1, 0, 0).applyQuaternion(cam.quaternion); const r = this._f.x * this._r.x + this._f.z * this._r.z;
      if (r > 0.35) this.faceRight = true; else if (r < -0.35) this.faceRight = false;
      // looking at the car more or less from straight behind: the head out of the window is seen from the back, not side-on
      // which way "out of the window" is on screen
      { const ox = this._q ? new THREE.Vector3(side, 0, 0).applyQuaternion(this._q) : null; if (ox) this.outRight = ox.x * this._r.x + ox.z * this._r.z >= 0; }
      const rear = b < -0.55 && Math.abs(r) < 0.55; if (rear !== !!this.rear) { this.rearT = (this.rearT || 0) + dt; if (this.rearT > 0.3) { this.rear = rear; this.rearT = 0; } } else this.rearT = 0;
    }
    const behind = !!this.behind, faceRight = this.faceRight !== false;
    // barking at people in the way
    this.barkCd -= dt; this.barkT -= dt;
    if (ctx.blocked > 1 && this.barkCd <= 0) { this.barkCd = 2.2; this.barkT = 0.9; ev = 'bark'; }
    const barking = this.barkT > 0, gearRow = ctx.under ? 1 : ctx.air ? 2 : 0;
    // head out of the window when it's fast (or to bark at someone), never underwater
    // out of the window above ~50 km/h, back in below ~35 (and it stays put for a moment either way)
    this.holdT = Math.max(0, (this.holdT || 0) - dt);
    if (this.holdT <= 0) { const fast = this.fast ? sp > 9.5 : sp > 14; if (fast !== !!this.fast) { this.fast = fast; this.holdT = 1.5; } }
    const wantOut = !ctx.under && !ctx.ckpt && (this.fast || (barking && sp > 0.5 && !behind));
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, dt * 5);
    let f, h;
    if (this.out > 0.5) {
      const flapF = Math.floor(this.t * (4 + sp * 0.15)) % 2;
      // from behind: back of the head (mirrored so the tongue streams out on the outside); otherwise side-on, facing where the car goes
      if (this.rear) { f = flapF ? 8 : 7; this.flip = !this.outRight; }
      else { f = barking ? 5 : (flapF ? 4 : 3); this.flip = !faceRight; }
      h = 0.66;
    }
    else if (barking) { f = behind ? 2 : 6; h = 0.86; this.flip = false; }
    else if (sp < 0.8) { f = behind ? 2 : 1; h = 0.86; this.flip = false; }
    else { f = behind ? 2 : 0; h = 0.86; this.flip = false; }
    const o = this.out > 0.5 ? 1 : 0, bob = (o ? Math.sin(this.t * 9) * 0.01 : sp < 0.8 ? Math.sin(this.t * 6) * 0.006 : 0);
    this.dog.position.set(ex + side * 0.62 * o, ey - 0.52 + 0.28 * o + bob, ez + 0.05 + 0.18 * o); this.dog.scale.set(h, h, 1);
    const fw = 1 / FRAMES, fr = 1 / GEARS; this.mat.map.repeat.set(this.flip ? -fw : fw, fr); this.mat.map.offset.set(this.flip ? (f + 1) * fw : f * fw, 1 - (gearRow + 1) * fr);
    this.woof.visible = barking; if (barking) this.woof.position.set(this.dog.position.x + side * 0.25, this.dog.position.y + h + 0.12, this.dog.position.z);
    return ev;
  }
}
