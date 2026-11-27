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
  // ---- leaning out of the window. The window sill is the line y = SILL: only the head, neck and shoulders are above it,
  // with the front paws draped over it (the rest of the dog is inside the car, out of sight) ----
  const SILL = 92;
  const paw = (px, py, len, ang) => {
    x.save(); x.translate(px, py); x.rotate(ang);
    const lg = x.createLinearGradient(-6, 0, 6, 0); lg.addColorStop(0, mix(C.body, '#000000', 0.18)); lg.addColorStop(0.5, mix(C.body, '#ffffff', 0.06)); lg.addColorStop(1, mix(C.body, '#000000', 0.22));
    x.fillStyle = C.blaze ? C.light : lg; x.beginPath(); x.roundRect(-5.5, -4, 11, len, 5.5); x.fill();
    x.fillStyle = C.blaze || C.mask ? C.light : mix(C.body, '#ffffff', 0.1); x.beginPath(); x.ellipse(0, len - 2, 7, 5, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.8; for (const t of [-2.5, 0, 2.5]) { x.beginPath(); x.moveTo(t, len); x.lineTo(t, len + 3); x.stroke(); }
    x.restore();
  };
  // the shadow of the dog's chest on the door top
  const sillShadow = (a, b) => { const g2 = x.createLinearGradient(0, SILL, 0, SILL + 8); g2.addColorStop(0, 'rgba(0,0,0,0.35)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g2; x.fillRect(a, SILL, b - a, 8); };
  if (f >= 7) {
    // seen from behind the car: back of the head, ears blown back, shoulders on the sill, both paws over the door, tongue streaming out
    const flap = f === 8 ? 1 : 0;
    sillShadow(34, 94);
    paw(46, SILL - 4, 22, 0.12); paw(82, SILL - 4, 22, -0.12);
    const ng = x.createLinearGradient(0, 66, 0, SILL); ng.addColorStop(0, mix(C.body, '#ffffff', 0.08)); ng.addColorStop(1, mix(C.body, '#000000', 0.25));
    x.fillStyle = ng; x.beginPath(); x.moveTo(30, SILL); x.quadraticCurveTo(34, 74, 64, 70); x.quadraticCurveTo(94, 74, 98, SILL); x.closePath(); x.fill();
    if (C.saddle || C.tri) { x.fillStyle = C.saddle || C.tri; x.beginPath(); x.moveTo(40, SILL); x.quadraticCurveTo(44, 80, 64, 76); x.quadraticCurveTo(84, 80, 88, SILL); x.closePath(); x.fill(); }
    if (C.spots) spots(x, 64, 84, 26, 10, 6, 31);
    if (C.curly) curls(x, 64, 84, 26, 9, C.body);
    x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.ellipse(64, 74, 17, 5, 0, 0, Math.PI); x.stroke();
    x.fillStyle = '#e66d7a'; x.beginPath(); x.moveTo(76, 64); x.quadraticCurveTo(92, 66 + flap * 4, 106 + flap * 4, 58 - flap * 6); x.quadraticCurveTo(92, 74, 78, 70); x.closePath(); x.fill();
    if (C.pointy) for (const s2 of [-1, 1]) { x.fillStyle = C.ear; x.beginPath(); x.moveTo(64 + s2 * 8, 40); x.lineTo(64 + s2 * ((C.big ? 26 : 20) + flap * 3), (C.big ? 14 : 22) + flap * 4); x.lineTo(64 + s2 * 22, 48); x.fill(); }
    blob(x, 64, 54, 20, 18, C.saddle || C.body);
    if (C.spots) spots(x, 64, 54, 18, 16, 5, 41);
    if (C.curly) { blob(x, 64, 44, 14, 9, C.light, 0, 0); curls(x, 64, 46, 14, 9, C.body); }
    if (!C.pointy) for (const s2 of [-1, 1]) { x.save(); x.translate(64 + s2 * 15, 46); x.rotate(s2 * (1.9 + flap * 0.35)); blob(x, 0, 12, 7.5, 15, C.curly ? C.light : C.ear, 0, C.curly ? 0 : 1); x.restore(); }
    x.strokeStyle = mix(C.body, '#000000', 0.2); x.lineWidth = 1; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(50 + i * 4.5, 76); x.lineTo(49 + i * 4.5 + (flap ? 1 : -1), 83); x.stroke(); }
    gear(x, g, 'back', 64, 52);
    return;
  }
  // side-on, facing right (the way the car is going): chest on the sill, neck stretched out into the wind, paws over the door
  const flap = f === 4 ? 1 : 0;
  sillShadow(22, 96);
  paw(74, SILL - 5, 24, -0.18); paw(62, SILL - 4, 22, -0.05);
  const ng = x.createLinearGradient(20, 60, 60, SILL); ng.addColorStop(0, mix(C.body, '#ffffff', 0.12)); ng.addColorStop(1, mix(C.body, '#000000', 0.22));
  // shoulders and chest resting on the sill, the neck reaching forward and up to the head
  x.fillStyle = ng; x.beginPath(); x.moveTo(18, SILL); x.quadraticCurveTo(22, 70, 46, 62); x.lineTo(58, 56); x.quadraticCurveTo(80, 66, 84, SILL); x.closePath(); x.fill();
  if (C.saddle || C.tri) { x.fillStyle = C.saddle || C.tri; x.beginPath(); x.moveTo(18, SILL); x.quadraticCurveTo(22, 72, 46, 64); x.lineTo(40, SILL); x.closePath(); x.fill(); }
  if (C.blaze || C.mask) { x.fillStyle = C.light; x.beginPath(); x.moveTo(70, 66); x.quadraticCurveTo(80, 76, 82, SILL); x.lineTo(68, SILL); x.quadraticCurveTo(66, 78, 62, 68); x.fill(); }
  if (C.spots) spots(x, 46, 80, 24, 12, 7, 17);
  if (C.curly) curls(x, 48, 80, 24, 11, C.body);
  // fur blowing back along the neck and shoulders
  x.strokeStyle = mix(C.body, '#000000', 0.22); x.lineWidth = 1; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(30 + i * 5, 76 - i * 2.4); x.lineTo(22 + i * 5 - flap * 3, 78 - i * 2.4); x.stroke(); }
  x.strokeStyle = '#b72e24'; x.lineWidth = 4.5; x.beginPath(); x.moveTo(44, 66); x.quadraticCurveTo(56, 76, 68, 68); x.stroke();
  // the head stuck out into the wind, chin up a touch
  x.save(); x.translate(68, 50); x.rotate(-0.12); headSide(x, C, 0, 0, f === 5 ? 2 : 1, flap); gear(x, g, 'side', 0, 0); x.restore();
}
// ---------- the cat ----------
// It never goes near the window. It sits beside you, now and then curls up and naps (breathing, little z's), and sometimes
// bats a ball of yarn around the seat. People on foot in the way get a 'MEOW!'.
export const CAT_COATS = [
  ['orange', 'Orange tabby', '#e08a3c'], ['grey', 'Grey tabby', '#8a8d93'], ['black', 'Black', '#232022'], ['white', 'White', '#f3f0ea'],
  ['tux', 'Tuxedo', '#1f1d1f'], ['calico', 'Calico', '#f1e6d4'], ['siamese', 'Siamese', '#e9dcc4'], ['tortie', 'Tortoiseshell', '#3a2a22'], ['cream', 'Cream', '#ead1a8'],
];
const CATS = {
  orange: { body: '#e08a3c', light: '#f6d8b0', stripe: '#b5612a', eyes: '#d9b52a', nose: '#e58f8f' },
  grey: { body: '#8a8d93', light: '#d8d8da', stripe: '#55585e', eyes: '#9cc443', nose: '#d98a92' },
  black: { body: '#272325', light: '#3a3537', eyes: '#e2b822', nose: '#3a3032' },
  white: { body: '#f3f0ea', light: '#ffffff', eyes: '#5aa7e0', nose: '#f0a3ad', earIn: '#f4b8c0' },
  tux: { body: '#1f1d1f', light: '#f4f2ee', eyes: '#9cc443', nose: '#e7a0a8', tux: true },
  calico: { body: '#f4ede0', light: '#ffffff', eyes: '#d9b52a', nose: '#e8a0a8', patches: ['#e0883a', '#2a2426'] },
  siamese: { body: '#ece0c8', light: '#f7efe0', eyes: '#4fa3e8', nose: '#6a4a40', points: '#5a4036' },
  tortie: { body: '#3a2a22', light: '#5a3e2e', eyes: '#e0a422', nose: '#4a3430', patches: ['#c9702e', '#8a4a22'] },
  cream: { body: '#ead1a8', light: '#f8ead2', stripe: '#cfae7e', eyes: '#d9a82a', nose: '#e8a0a0' },
};
const CAT_FRAMES = 8; // 0 sit, 1 sit (tail flick), 2 sit from behind, 3-4 asleep (breathing), 5-6 batting the yarn, 7 meow
function patches(x, cx, cy, rx, ry, C, seed) { if (!C.patches) return; x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.clip(); let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 4; i++) { x.fillStyle = C.patches[i % 2]; x.beginPath(); x.ellipse(cx + (r() - 0.5) * rx * 1.6, cy + (r() - 0.5) * ry * 1.6, rx * (0.3 + r() * 0.35), ry * (0.25 + r() * 0.3), r() * 3, 0, 7); x.fill(); } x.restore(); }
function tabby(x, cx, cy, rx, ry, C, n = 4, vertical = false) { if (!C.stripe) return; x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.clip(); x.strokeStyle = C.stripe; x.lineWidth = 2.6; x.lineCap = 'round';
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; x.beginPath(); if (vertical) { const yy = cy - ry + t * ry * 2; x.moveTo(cx - rx, yy - 3); x.quadraticCurveTo(cx - rx * 0.4, yy + 4, cx - rx * 0.15, yy); x.moveTo(cx + rx, yy - 3); x.quadraticCurveTo(cx + rx * 0.4, yy + 4, cx + rx * 0.15, yy); } else { const xx = cx - rx + t * rx * 2; x.moveTo(xx - 2, cy - ry); x.quadraticCurveTo(xx + 3, cy, xx - 1, cy + ry); } x.stroke(); } x.restore(); }
function catEars(x, C, hx, hy, s = 1) {
  for (const k of [-1, 1]) {
    x.fillStyle = C.points || C.body; x.beginPath(); x.moveTo(hx + k * 6 * s, hy - 12 * s); x.lineTo(hx + k * 17 * s, hy - 27 * s); x.lineTo(hx + k * 19 * s, hy - 6 * s); x.closePath(); x.fill();
    x.fillStyle = C.earIn || mix(C.body, '#f0a0a8', 0.55); x.beginPath(); x.moveTo(hx + k * 9 * s, hy - 11 * s); x.lineTo(hx + k * 16 * s, hy - 22 * s); x.lineTo(hx + k * 16.5 * s, hy - 8 * s); x.closePath(); x.fill();
  }
}
// cat head from the front; eyes: 'open' | 'wide' (playing) | 'closed'; mouth: 0 closed, 1 meow
function catHead(x, C, hx, hy, eyes = 'open', mouth = 0, tilt = 0) {
  x.save(); x.translate(hx, hy); x.rotate(tilt);
  catEars(x, C, 0, 0);
  blob(x, 0, 0, 20, 17, C.body);
  if (C.patches) patches(x, 0, 0, 19, 16, C, 7);
  if (C.points) { const g = x.createRadialGradient(0, 6, 2, 0, 6, 15); g.addColorStop(0, C.points); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(0, 5, 14, 12, 0, 0, 7); x.fill(); }
  if (C.stripe) { x.strokeStyle = C.stripe; x.lineWidth = 2; x.lineCap = 'round'; x.beginPath(); x.moveTo(-7, -14); x.lineTo(-4, -8); x.lineTo(0, -12); x.lineTo(4, -8); x.lineTo(7, -14); x.stroke(); for (const k of [-1, 1]) { x.beginPath(); x.moveTo(k * 19, 0); x.lineTo(k * 13, 2); x.moveTo(k * 18, 5); x.lineTo(k * 13, 6); x.stroke(); } }
  // muzzle (white for the tuxedo and calico)
  x.fillStyle = C.tux || C.patches && !C.points ? C.light : mix(C.light, C.body, 0.4); if (C.points) x.fillStyle = mix(C.points, '#000000', 0.1);
  for (const k of [-1, 1]) { x.beginPath(); x.ellipse(k * 4.5, 7, 6, 4.6, 0, 0, 7); x.fill(); }
  if (C.tux) { x.beginPath(); x.moveTo(0, -6); x.lineTo(-5, 4); x.lineTo(5, 4); x.fill(); }
  // eyes
  for (const k of [-1, 1]) {
    const ex = k * 8, ey = -2;
    if (eyes === 'closed') { x.strokeStyle = '#1a1416'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(ex - 4.5, ey); x.quadraticCurveTo(ex, ey + 3.5, ex + 4.5, ey); x.stroke(); continue; }
    x.fillStyle = '#1a1416'; x.beginPath(); x.ellipse(ex, ey, 5.2, eyes === 'wide' ? 5 : 4.1, k * 0.12, 0, 7); x.fill();
    x.fillStyle = C.eyes; x.beginPath(); x.ellipse(ex, ey, 4.4, eyes === 'wide' ? 4.3 : 3.4, k * 0.12, 0, 7); x.fill();
    x.fillStyle = '#0b0809'; x.beginPath(); x.ellipse(ex + (eyes === 'wide' ? 1 : 0), ey, eyes === 'wide' ? 3 : 1.2, eyes === 'wide' ? 3.6 : 3.3, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(ex + 1.6, ey - 1.6, 1, 0, 7); x.fill();
  }
  // nose, mouth, whiskers
  x.fillStyle = C.nose; x.beginPath(); x.moveTo(-2.6, 3.4); x.lineTo(2.6, 3.4); x.lineTo(0, 6.2); x.closePath(); x.fill();
  x.strokeStyle = mix(C.nose, '#000000', 0.4); x.lineWidth = 1.1; x.beginPath(); x.moveTo(0, 6.2); x.lineTo(0, 8); x.moveTo(-4, 9.5); x.quadraticCurveTo(-2, 10.5, 0, 8); x.quadraticCurveTo(2, 10.5, 4, 9.5); x.stroke();
  if (mouth) { x.fillStyle = '#5a1420'; x.beginPath(); x.ellipse(0, 11, 3.6, 3.6, 0, 0, 7); x.fill(); x.fillStyle = '#e88a96'; x.beginPath(); x.ellipse(0, 12.6, 2.2, 1.4, 0, 0, 7); x.fill(); x.fillStyle = '#fff'; for (const k of [-1, 1]) { x.beginPath(); x.moveTo(k * 2.6, 8.4); x.lineTo(k * 1.8, 10.6); x.lineTo(k * 1.1, 8.4); x.fill(); } }
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 0.7; for (const k of [-1, 1]) for (const a of [-0.12, 0.05, 0.2]) { x.beginPath(); x.moveTo(k * 6, 7); x.lineTo(k * 26, 7 + a * 40); x.stroke(); }
  x.restore();
}
function catBody(x, C, cx, by, rx, ry) { // the sitting body (pear) with chest
  blob(x, cx, by, rx, ry, C.body); if (C.patches) patches(x, cx, by, rx, ry, C, 3); tabby(x, cx, by, rx, ry, C, 4, true);
  const cg = x.createLinearGradient(0, by - ry, 0, by + ry); cg.addColorStop(0, C.light); cg.addColorStop(1, mix(C.light, '#000000', 0.1));
  if (!C.points) { x.fillStyle = cg; x.beginPath(); x.ellipse(cx, by - ry * 0.15, rx * 0.45, ry * 0.7, 0, 0, 7); x.fill(); }
}
function catLeg(x, C, lx, top, bottom, light) { const g = x.createLinearGradient(lx - 5, 0, lx + 5, 0); const col = light ? C.light : C.points || C.body; g.addColorStop(0, mix(col, '#000000', 0.15)); g.addColorStop(0.5, mix(col, '#ffffff', 0.08)); g.addColorStop(1, mix(col, '#000000', 0.2)); x.fillStyle = g; x.beginPath(); x.roundRect(lx - 4.5, top, 9, bottom - top, 4.5); x.fill(); x.fillStyle = light ? C.light : mix(col, '#ffffff', 0.1); x.beginPath(); x.ellipse(lx, bottom - 1, 6, 3.4, 0, 0, 7); x.fill(); }
function collar(x, cx, cy, w) { x.strokeStyle = '#2b7bd6'; x.lineWidth = 3.4; x.beginPath(); x.ellipse(cx, cy, w, 4, 0, 0, Math.PI); x.stroke(); x.fillStyle = '#f2c230'; x.beginPath(); x.arc(cx, cy + 5.5, 3, 0, 7); x.fill(); x.fillStyle = '#7a5a10'; x.fillRect(cx - 0.6, cy + 6, 1.2, 2); }
function yarn(x, yx, yy, r = 8) {
  x.strokeStyle = '#c23a5a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(yx - r, yy + 2); x.bezierCurveTo(yx - r - 20, yy + 10, yx - r - 30, yy + 2, yx - r - 44, yy + 8); x.stroke();
  const g = x.createRadialGradient(yx - r * 0.35, yy - r * 0.4, 1, yx, yy, r); g.addColorStop(0, '#ff8aa8'); g.addColorStop(1, '#b2284a'); x.fillStyle = g; x.beginPath(); x.arc(yx, yy, r, 0, 7); x.fill();
  x.strokeStyle = 'rgba(120,10,40,0.55)'; x.lineWidth = 1; for (const a of [-0.6, 0, 0.6, 1.2]) { x.beginPath(); x.ellipse(yx, yy, r * 0.95, r * 0.4, a, 0, 7); x.stroke(); }
}
function drawCat(x, f, C, g) {
  x.clearRect(0, 0, 128, 128);
  const shadow = (w = 36) => { x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.ellipse(64, 124, w, 4.5, 0, 0, 7); x.fill(); };
  const tailCol = C.points || C.body;
  if (f === 3 || f === 4) {
    // curled up asleep: a round loaf, head tucked on the paws, tail wrapped round the front; z's drift up
    const br = f === 4 ? 1.04 : 1;
    shadow(46);
    blob(x, 66, 108, 42 * br, 17 * br, C.body); if (C.patches) patches(x, 66, 108, 42, 17, C, 5); tabby(x, 66, 108, 42, 17, C, 6);
    x.strokeStyle = tailCol; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(104, 112); x.quadraticCurveTo(96, 126, 60, 123); x.quadraticCurveTo(40, 122, 34, 116); x.stroke();
    if (C.stripe) { x.strokeStyle = C.stripe; x.lineWidth = 2.4; for (const t of [0.3, 0.5, 0.7]) { const px = 104 - t * 70; x.beginPath(); x.moveTo(px, 119); x.lineTo(px + 2, 127); x.stroke(); } }
    catLeg(x, C, 46, 112, 121, !!(C.tux)); 
    x.save(); x.translate(38, 100); x.rotate(-0.35); x.scale(0.9, 0.9); catHead(x, C, 0, 0, 'closed', 0); x.restore();
    gear(x, g, 'front', 38, 98);
    x.fillStyle = 'rgba(70,90,140,0.85)'; x.font = '700 11px system-ui, sans-serif'; x.fillText('z', 52 + (f - 3) * 3, 72 - (f - 3) * 5); x.font = '700 15px system-ui, sans-serif'; x.fillText('Z', 60 + (f - 3) * 4, 58 - (f - 3) * 6);
    return;
  }
  if (f === 2) {
    // sitting, seen from behind: back, ears, tail curling up
    shadow();
    x.strokeStyle = tailCol; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(70, 120); x.quadraticCurveTo(104, 118, 98, 84); x.quadraticCurveTo(96, 74, 102, 70); x.stroke();
    blob(x, 64, 100, 27, 24, C.body); if (C.patches) patches(x, 64, 100, 26, 23, C, 9); tabby(x, 64, 100, 26, 23, C, 4, true);
    catEars(x, C, 64, 60); blob(x, 64, 60, 19, 16, C.body); if (C.stripe) tabby(x, 64, 58, 18, 14, C, 3, true); if (C.patches) patches(x, 64, 60, 18, 15, C, 13);
    collar(x, 64, 74, 13);
    gear(x, g, 'back', 64, 58);
    return;
  }
  if (f === 5 || f === 6) {
    // playing: crouched a little to the left, eyes wide on the yarn, a paw batting it
    const up = f === 5;
    shadow(48);
    yarn(x, up ? 104 : 98, up ? 106 : 116, 8);
    x.strokeStyle = tailCol; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(34, 118); x.quadraticCurveTo(14, 112, 18, 92 + (up ? -4 : 2)); x.stroke();
    catBody(x, C, 54, 100, 24, 22);
    catLeg(x, C, 46, 104, 124, !!(C.tux || C.patches));
    // batting paw reaching for the yarn
    x.save(); x.translate(64, 96); x.rotate(up ? -1.15 : -0.6); catLeg(x, C, 0, 0, up ? 30 : 26, !!(C.tux || C.patches)); x.restore();
    collar(x, 54, 76, 13);
    catHead(x, C, 58, 60, 'wide', 0, 0.22);
    gear(x, g, 'front', 58, 60);
    return;
  }
  // sitting from the front (0, 1 tail flick, 7 meow)
  shadow();
  const flick = f === 1;
  x.strokeStyle = tailCol; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(84, 118); x.quadraticCurveTo(110, 116, 104, 96 + (flick ? -2 : 6)); x.quadraticCurveTo(102, 88, flick ? 110 : 98, flick ? 82 : 92); x.stroke();
  if (C.stripe) { x.strokeStyle = C.stripe; x.lineWidth = 2.4; for (const t of [0.35, 0.6, 0.85]) { x.beginPath(); x.moveTo(84 + t * 22, 118 - t * 6); x.lineTo(86 + t * 22, 112 - t * 6); x.stroke(); } }
  catBody(x, C, 64, 100, 25, 23);
  for (const k of [-1, 1]) catLeg(x, C, 64 + k * 8, 98, 124, !!(C.tux || C.patches));
  collar(x, 64, 76, 13);
  catHead(x, C, 64, 60, 'open', f === 7 ? 1 : 0, f === 7 ? -0.08 : 0);
  gear(x, g, 'front', 64, 60);
}
const atlases = new Map();
function atlas(coat) {
  let t = atlases.get(coat); if (t) return t;
  const C = COATS[coat] || COATS.golden, c = document.createElement('canvas'); c.width = F * FRAMES; c.height = F * GEARS; const x = c.getContext('2d');
  for (let g = 0; g < GEARS; g++) for (let f = 0; f < FRAMES; f++) { x.save(); x.translate(f * F, g * F); x.beginPath(); x.rect(0, 0, F, F); x.clip(); x.scale(U, U); drawDog(x, f, C, g); x.restore(); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; atlases.set(coat, t); return t;
}
function catAtlas(coat) {
  const key = 'cat:' + coat; let t = atlases.get(key); if (t) return t;
  const C = CATS[coat] || CATS.orange, c = document.createElement('canvas'); c.width = F * CAT_FRAMES; c.height = F * GEARS; const x = c.getContext('2d');
  for (let g = 0; g < GEARS; g++) for (let f = 0; f < CAT_FRAMES; f++) { x.save(); x.translate(f * F, g * F); x.beginPath(); x.rect(0, 0, F, F); x.clip(); x.scale(U, U); drawCat(x, f, C, g); x.restore(); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; atlases.set(key, t); return t;
}
let MEOW = null;
function meowTex() {
  if (MEOW) return MEOW;
  const c = document.createElement('canvas'); c.width = 160; c.height = 80; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#1b1d20'; x.lineWidth = 4; x.beginPath(); x.roundRect(6, 6, 148, 52, 22); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(40, 56); x.lineTo(28, 76); x.lineTo(60, 56); x.fill(); x.stroke(); x.fillStyle = '#fff'; x.fillRect(36, 52, 22, 6);
  x.fillStyle = '#1b1d20'; x.font = '900 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MEOW!', 80, 33);
  MEOW = new THREE.CanvasTexture(c); MEOW.colorSpace = THREE.SRGBColorSpace; return MEOW;
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
    this.mat.map.repeat.set(1 / FRAMES, 1 / GEARS); this.mat.map.needsUpdate = true; this.coat = 'golden'; this.coatKey = 'golden'; this.nf = FRAMES;
    this.dog = new THREE.Sprite(this.mat); this.dog.center.set(0.5, 0); this.g.add(this.dog);
    this.woof = new THREE.Sprite(new THREE.SpriteMaterial({ map: woofTex(), transparent: true, depthTest: false, depthWrite: false })); this.woof.scale.set(0.6, 0.3, 1); this.woof.visible = false; this.woof.renderOrder = 30; this.g.add(this.woof);
    this.modelG = new THREE.Group(); this.g.add(this.modelG); this.modelKey = ''; this.modelInner = null;
    this.t = 0; this.barkT = 0; this.barkCd = 0; this.blockT = 0; this.out = 0; this.flip = false;
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  // the car's half-width and window line (the top of the doors), measured once per car body
  _dims(mesh, ey) {
    const key = mesh.uuid + ':' + mesh.children.length;
    if (this._dk === key) return this._d;
    let hw = 0.9, top = ey + 0.4;
    try {
      const had = this.g.parent === mesh; if (had) mesh.remove(this.g);
      const p = mesh.position.clone(), q = mesh.quaternion.clone(), sc = mesh.scale.clone(); mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1); mesh.updateMatrixWorld(true);
      const parentInv = mesh.parent ? mesh.parent.matrixWorld.clone().invert() : null, box = new THREE.Box3();
      mesh.traverse(o => { if (o.isMesh && o.visible && o.geometry && !o.isSprite) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (parentInv) b.applyMatrix4(parentInv); box.union(b); } });
      mesh.position.copy(p); mesh.quaternion.copy(q); mesh.scale.copy(sc); mesh.updateMatrixWorld(true); if (had) mesh.add(this.g);
      if (!box.isEmpty()) { hw = Math.max(0.6, Math.min(1.4, (box.max.x - box.min.x) / 2 * 0.95)); top = box.max.y; }
    } catch { }
    // the window line sits a little below the passenger's eyes (and well below the roof)
    const belt = Math.max(ey - 0.42, Math.min(ey - 0.3, top - 0.38));
    this._dk = key; this._d = { hw, belt }; return this._d;
  }
  dispose() { if (this.g.parent) this.g.parent.remove(this.g); this.mat.map.dispose(); this.mat.dispose(); }
  setCoat(coat, cat = false) {
    const key = (cat ? 'cat:' : '') + coat; if (key === this.coatKey) return; if (cat ? !CATS[coat] : !COATS[coat]) return;
    this.coatKey = key; this.coat = coat; this.nf = cat ? CAT_FRAMES : FRAMES; this.mat.map.dispose(); this.mat.map = (cat ? catAtlas(coat) : atlas(coat)).clone(); this.mat.map.needsUpdate = true; this.mat.needsUpdate = true;
  }
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
    // (an uploaded car body hides the stock car's parts: never let that take the passenger with it)
    if (!this.g.visible) this.g.visible = true;
    this.t += dt; let ev = null;
    const [ex, ey, ez] = ctx.eye, side = ex >= 0 ? 1 : -1, sp = Math.abs(ctx.speed || 0);
    if (ctx.kind === 'cat') return this.catUpdate(dt, ctx);
    if (this.woof.material.map !== woofTex()) { this.woof.material.map = woofTex(); this.woof.material.needsUpdate = true; }
    const isDog = ctx.kind === 'dog'; this.dog.visible = isDog; this.modelG.visible = !isDog;
    if (!isDog) {
      this._model(ctx.model); this.woof.visible = false;
      const m = (ctx.model && ctx.model.m) || {}; this.modelG.position.set(ex + (m.x || 0), ey - 0.62 + (m.y || 0), ez + 0.05 + (m.z || 0)); this.modelG.rotation.set(0, (m.yaw || 0) * Math.PI / 180, 0); this.modelG.scale.setScalar(m.s || 1);
      return null;
    }
    this.setCoat(ctx.coat || 'golden', false);
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
    if (o) {
      // leaning out: the sprite stands just outside the door with its sill line on the car's window line, so the head and
      // shoulders are out of the window and the paws hang over the door
      const D = this._dims(mesh, ey), sway = Math.sin(this.t * 2.3) * 0.015;
      // the window is about 40 cm out from the middle of the passenger seat (never past the side of the car)
      this.dog.position.set(side * Math.min(D.hw, Math.abs(ex) + 0.4), D.belt - h * (128 - 92) / 128 + bob, ez + 0.12 + sway);
    } else this.dog.position.set(ex, ey - 0.52 + bob, ez + 0.05);
    this.dog.scale.set(h, h, 1);
    const fw = 1 / this.nf, fr = 1 / GEARS; this.mat.map.repeat.set(this.flip ? -fw : fw, fr); this.mat.map.offset.set(this.flip ? (f + 1) * fw : f * fw, 1 - (gearRow + 1) * fr);
    this.woof.visible = barking; if (barking) this.woof.position.set(this.dog.position.x + side * 0.25, this.dog.position.y + h + 0.12, this.dog.position.z);
    return ev;
  }
  // the cat: sits, flicks its tail, naps, plays with its yarn, meows at people in the way. Never leans out of the window.
  catUpdate(dt, ctx) {
    const mesh = ctx.mesh, [ex, ey, ez] = ctx.eye, side = ex >= 0 ? 1 : -1, sp = Math.abs(ctx.speed || 0); let ev = null;
    this.dog.visible = true; this.modelG.visible = false; this.out = 0;
    this.setCoat(ctx.coat || 'orange', true);
    if (this.woof.material.map !== meowTex()) { this.woof.material.map = meowTex(); this.woof.material.needsUpdate = true; }
    const cam = ctx.cam;
    if (cam) { mesh.getWorldQuaternion(this._q); this._f.set(0, 0, 1).applyQuaternion(this._q); mesh.getWorldPosition(this._v); const dx = cam.position.x - this._v.x, dz = cam.position.z - this._v.z, dl = Math.hypot(dx, dz) || 1, b = (dx * this._f.x + dz * this._f.z) / dl; if (b < -0.25) this.behind = true; else if (b > 0.25) this.behind = false; }
    // what it's up to: 'sit' | 'sleep' | 'play' (each lasts a while, then it picks again; naps more on long smooth drives)
    this.mood = this.mood || 'sit'; this.moodT = (this.moodT ?? (4 + Math.random() * 8)) - dt;
    if (this.moodT <= 0) {
      const r = Math.random();
      if (this.mood !== 'sit') { this.mood = 'sit'; this.moodT = 8 + Math.random() * 14; }
      else if (r < (sp > 3 ? 0.55 : 0.35)) { this.mood = 'sleep'; this.moodT = 12 + Math.random() * 22; }
      else if (r < (sp > 3 ? 0.75 : 0.75)) { this.mood = 'play'; this.moodT = 4 + Math.random() * 5; }
      else this.moodT = 6 + Math.random() * 10;
    }
    if (ctx.under || ctx.air) { if (this.mood === 'play') { this.mood = 'sit'; this.moodT = 5; } } // no yarn in the deep or the sky
    // people on foot in the way: it wakes up (if it was asleep) and meows at them
    this.barkCd -= dt; this.barkT -= dt;
    if (ctx.blocked > 1 && this.barkCd <= 0) { this.barkCd = 2.6; this.barkT = 1.0; ev = 'meow'; if (this.mood !== 'sit') { this.mood = 'sit'; this.moodT = 6; } }
    const meowing = this.barkT > 0, gearRow = ctx.under ? 1 : ctx.air ? 2 : 0;
    let f;
    if (meowing) f = this.behind ? 2 : 7;
    else if (this.mood === 'sleep') f = 3 + (Math.sin(this.t * 1.6) > 0 ? 1 : 0);
    else if (this.mood === 'play') f = Math.floor(this.t * 3.2) % 2 ? 5 : 6;
    else f = this.behind ? 2 : ((this.t % 5) < 0.45 ? 1 : 0);
    const h = 0.7, bob = this.mood === 'play' ? Math.abs(Math.sin(this.t * 6.4)) * 0.01 : 0;
    this.flip = this.mood === 'play' && side < 0; // the yarn is on the inside of the seat
    this.dog.position.set(ex, ey - 0.52 + bob, ez + 0.05); this.dog.scale.set(h, h, 1);
    const fw = 1 / CAT_FRAMES, fr = 1 / GEARS; this.mat.map.repeat.set(this.flip ? -fw : fw, fr); this.mat.map.offset.set(this.flip ? (f + 1) * fw : f * fw, 1 - (gearRow + 1) * fr);
    this.woof.visible = meowing; if (meowing) this.woof.position.set(this.dog.position.x + side * 0.22, this.dog.position.y + h + 0.06, this.dog.position.z);
    return ev;
  }
}
