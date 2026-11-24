import * as THREE from 'three';

// Store32 scratch-offs. Three tickets at three prices. Each ticket has six prize amounts under silver latex: find the same amount
// three times and you win it. Whether a ticket wins (and what) is settled when it's bought; scratching just reveals it.
// On a screen you rub the silver off with a finger (or the mouse). In VR you can't scratch, so the tickets you buy go to your
// garage, to scratch later.

export const TIERS = [
  { id: 'lucky', name: 'Lucky 7s', cost: 50, prizes: [25, 75, 250, 1000], odds: [0.15, 0.06, 0.02, 0.003], bg: ['#0f7a4a', '#2fc47c'], ink: '#fff7c2', foil: '#c9ced3' },
  { id: 'gold', name: 'Gold Rush', cost: 250, prizes: [150, 500, 1500, 10000], odds: [0.15, 0.06, 0.015, 0.002], bg: ['#9a6a06', '#ffcc33'], ink: '#2a1a00', foil: '#d2d5d8' },
  { id: 'diamond', name: 'Diamond Jackpot', cost: 1000, prizes: [600, 2000, 8000, 50000], odds: [0.14, 0.05, 0.012, 0.001], bg: ['#3a1f8f', '#5ad1ff'], ink: '#ffffff', foil: '#bfc6cf' },
];
export const tierOf = id => TIERS.find(t => t.id === id) || TIERS[0];
const fmt = n => n.toLocaleString();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function newTicket(tierId) {
  const T = tierOf(tierId); let prize = 0, r = Math.random();
  // the biggest prizes are the rarest; check from the top
  for (let i = T.prizes.length - 1; i >= 0; i--) { if (r < T.odds[i]) { prize = T.prizes[i]; break; } r -= T.odds[i]; }
  let cells;
  if (prize) { const others = T.prizes.filter(p => p !== prize); cells = [prize, prize, prize, ...shuffle(others.flatMap(p => [p, p])).slice(0, 3)]; }
  else { cells = shuffle(T.prizes.flatMap(p => [p, p])).slice(0, 6); }
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tier: T.id, prize, cells: shuffle(cells), t: Date.now() };
}

// ---- ticket artwork (used for the scratch card and for the VR panel thumbnails) ----
function drawTicket(x, W, H, tk, reveal = true) {
  const T = tierOf(tk.tier), g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]);
  x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, W, H, 22); x.fill();
  // sunburst
  x.save(); x.globalAlpha = 0.12; x.fillStyle = '#fff'; x.translate(W / 2, H * 0.18);
  for (let i = 0; i < 18; i++) { x.rotate(Math.PI / 9); x.beginPath(); x.moveTo(0, 0); x.lineTo(W, -30); x.lineTo(W, 30); x.fill(); }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 4; x.setLineDash([10, 8]); x.beginPath(); x.roundRect(10, 10, W - 20, H - 20, 16); x.stroke(); x.setLineDash([]);
  x.fillStyle = T.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 ${Math.round(W * 0.085)}px "Chakra Petch", system-ui, sans-serif`; x.fillText(T.name.toUpperCase(), W / 2, H * 0.1);
  x.font = `700 ${Math.round(W * 0.034)}px system-ui, sans-serif`; x.fillText(`STORE32 · ${fmt(T.cost)} PTS · MATCH 3 AMOUNTS TO WIN`, W / 2, H * 0.19);
  x.fillText(`TOP PRIZE ${fmt(T.prizes[T.prizes.length - 1])} PTS`, W / 2, H * 0.94);
  // the six cells
  const cw = W * 0.27, ch = H * 0.27, gx = (W - cw * 3) / 4, top = H * 0.26;
  for (let i = 0; i < 6; i++) {
    const cx = gx + (i % 3) * (cw + gx), cy = top + Math.floor(i / 3) * (ch + H * 0.05);
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.roundRect(cx, cy, cw, ch, 14); x.fill();
    if (reveal) {
      const v = tk.cells[i], win = tk.prize && v === tk.prize;
      x.fillStyle = win ? '#d4141c' : '#1b1d24'; x.font = `900 ${Math.round(cw * (v >= 10000 ? 0.24 : 0.3))}px "Chakra Petch", system-ui, sans-serif`; x.fillText(fmt(v), cx + cw / 2, cy + ch * 0.48);
      x.font = `700 ${Math.round(cw * 0.11)}px system-ui, sans-serif`; x.fillText('PTS', cx + cw / 2, cy + ch * 0.78);
    }
  }
  return { cells: Array.from({ length: 6 }, (_, i) => [gx + (i % 3) * (cw + gx), top + Math.floor(i / 3) * (ch + H * 0.05), cw, ch]) };
}
function drawFoil(x, W, H, T, cells) {
  for (const [cx, cy, cw, ch] of cells) {
    const g = x.createLinearGradient(cx, cy, cx + cw, cy + ch); g.addColorStop(0, '#9da3a9'); g.addColorStop(0.45, T.foil); g.addColorStop(0.55, '#eef1f3'); g.addColorStop(1, '#8e959c');
    x.fillStyle = g; x.beginPath(); x.roundRect(cx - 2, cy - 2, cw + 4, ch + 4, 14); x.fill();
    // glitter and a little coin print
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`; x.fillRect(cx + Math.random() * cw, cy + Math.random() * ch, 2, 2); }
    x.fillStyle = 'rgba(60,64,70,0.45)'; x.font = `800 ${Math.round(cw * 0.14)}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SCRATCH', cx + cw / 2, cy + ch / 2);
  }
}

// ---- the on-screen shop and scratch card ----
export class ScratchShop {
  // api: { score(), spend(n), win(n, tier), save(ticket), tickets(), remove(id), sound(kind), toast(msg) }
  constructor(api) {
    this.api = api; this.el = document.createElement('div'); this.el.className = 's32'; this.el.hidden = true; document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', e => e.stopPropagation()); this.el.addEventListener('keydown', e => e.stopPropagation());
  }
  get open() { return !this.el.hidden; }
  close() { this.el.hidden = true; this.el.innerHTML = ''; this.cur = null; if (this.onClose) this.onClose(); }
  shop() {
    const saved = this.api.tickets().length;
    this.el.hidden = false;
    this.el.innerHTML = `<div class="s32-box"><header><b class="s32-logo">3</b><div><h3>Store32</h3><small>Scratch-offs · you have ${fmt(this.api.score() | 0)} points</small></div><button class="ghost sm" data-s32-close>Leave</button></header>
      <div class="s32-tiers">${TIERS.map(T => `<div class="s32-tier" style="--a:${T.bg[0]};--b:${T.bg[1]};--ink:${T.ink}"><div class="s32-art"><b>${T.name}</b><small>Top prize ${fmt(T.prizes[T.prizes.length - 1])}</small></div>
        <p>Match 3 amounts to win ${T.prizes.map(fmt).join(' · ')} points.</p><button class="primary" data-s32-buy="${T.id}" ${this.api.score() < T.cost ? 'disabled' : ''}>Buy · ${fmt(T.cost)} pts</button></div>`).join('')}</div>
      <p class="note">${saved ? `You have ${saved} unscratched ticket${saved > 1 ? 's' : ''} saved in your garage. ` : ''}Most tickets don't win. Play for fun!</p></div>`;
    this.el.querySelector('[data-s32-close]').onclick = () => { this.api.sound('click'); this.close(); };
    this.el.querySelectorAll('[data-s32-buy]').forEach(b => b.onclick = () => {
      const T = tierOf(b.dataset.s32Buy); if (this.api.score() < T.cost) { this.api.toast(`${T.name} costs ${fmt(T.cost)} points`); return; }
      this.api.spend(T.cost); this.api.sound('buy'); const tk = newTicket(T.id); this.api.save(tk); this.scratch(tk, true);
    });
  }
  // the scratch card itself; fromShop: go back to the shop when done
  scratch(tk, fromShop = false) {
    const T = tierOf(tk.tier); this.cur = tk; this.el.hidden = false;
    this.el.innerHTML = `<div class="s32-box s32-card"><header><b class="s32-logo">3</b><div><h3>${T.name}</h3><small>Rub the silver off with your finger</small></div><button class="ghost sm" data-s32-later>Save for later</button></header>
      <div class="s32-ticket"><canvas class="s32-base"></canvas><canvas class="s32-foil"></canvas></div>
      <div class="s32-result" aria-live="polite"></div>
      <div class="s32-actions"><button class="ghost" data-s32-all>Reveal all</button>${fromShop ? '<button class="ghost" data-s32-back>Back to the shop</button>' : ''}<button class="primary" data-s32-done hidden>Done</button></div></div>`;
    const W = 720, H = 520, base = this.el.querySelector('.s32-base'), foil = this.el.querySelector('.s32-foil');
    for (const c of [base, foil]) { c.width = W; c.height = H; }
    const { cells } = drawTicket(base.getContext('2d'), W, H, tk, true), fx = foil.getContext('2d'); drawFoil(fx, W, H, T, cells);
    let done = false, last = null, checkT = 0;
    const finish = () => {
      if (done) return; done = true; fx.clearRect(0, 0, W, H);
      const res = this.el.querySelector('.s32-result');
      if (tk.prize) { res.innerHTML = `<b class="win">WINNER! +${fmt(tk.prize)} points</b>`; this.api.win(tk.prize, T); } else { res.innerHTML = `<b>No match this time.</b>`; this.api.sound('lose'); }
      this.api.remove(tk.id); this.el.querySelector('[data-s32-all]').hidden = true; const later = this.el.querySelector('[data-s32-later]'); if (later) later.hidden = true;
      const d = this.el.querySelector('[data-s32-done]'); d.hidden = false; d.onclick = () => { this.api.sound('click'); fromShop ? this.shop() : this.close(); };
      const back = this.el.querySelector('[data-s32-back]'); if (back) back.hidden = true;
    };
    // how much of the silver is gone (checks a coarse grid over the six cells)
    const cleared = () => { const d = fx.getImageData(0, 0, W, H).data; let n = 0, k = 0; for (const [cx, cy, cw, ch] of cells) for (let y = cy + 6; y < cy + ch - 6; y += 10) for (let x = cx + 6; x < cx + cw - 6; x += 10) { n++; if (d[((y | 0) * W + (x | 0)) * 4 + 3] < 40) k++; } return n ? k / n : 1; };
    const at = e => { const r = foil.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    const rub = (a, b) => { fx.globalCompositeOperation = 'destination-out'; fx.lineCap = 'round'; fx.lineWidth = 46; fx.beginPath(); fx.moveTo(a[0], a[1]); fx.lineTo(b[0], b[1]); fx.stroke(); fx.globalCompositeOperation = 'source-over'; };
    foil.addEventListener('pointerdown', e => { if (done) return; foil.setPointerCapture(e.pointerId); last = at(e); rub(last, [last[0] + 0.1, last[1]]); this.api.sound('scratch'); });
    foil.addEventListener('pointermove', e => {
      if (done || !last || !(e.buttons & 1) && e.pointerType === 'mouse') return; const p = at(e); rub(last, p); last = p;
      if (Math.random() < 0.25) this.api.sound('scratch');
      const now = performance.now(); if (now - checkT > 250) { checkT = now; if (cleared() > 0.82) finish(); }
    });
    const up = () => { last = null; if (!done && cleared() > 0.82) finish(); };
    foil.addEventListener('pointerup', up); foil.addEventListener('pointercancel', up);
    this.el.querySelector('[data-s32-all]').onclick = () => { this.api.sound('click'); finish(); };
    const later = this.el.querySelector('[data-s32-later]'); later.onclick = () => { this.api.sound('click'); this.api.toast('Ticket saved in your garage', 1600); fromShop ? this.shop() : this.close(); };
    const back = this.el.querySelector('[data-s32-back]'); if (back) back.onclick = () => { this.api.sound('click'); this.shop(); };
  }
}

// ---- the VR version: a little floating panel with three buy buttons you poke; tickets go to the garage ----
export class VrShop {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 1024; this.cv.height = 640; this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest: false }));
    this.mesh.renderOrder = 50; this.mesh.visible = false; this.armed = [true, true]; this._v = new THREE.Vector3(); this.msg = ''; this.msgT = 0;
    // button rectangles in canvas pixels: three tickets, then "Leave"
    this.btns = [[40, 186, 300, 292], [362, 186, 300, 292], [684, 186, 300, 292], [362, 548, 300, 76]];
  }
  get open() { return this.mesh.visible; }
  show(parent, pos, score, saved) { if (this.mesh.parent !== parent) parent.add(this.mesh); this.mesh.position.copy(pos); this.mesh.rotation.set(-0.35, Math.PI, 0); this.mesh.visible = true; this.draw(score, saved); }
  hide() { this.mesh.visible = false; }
  flash(msg, score, saved) { this.msg = msg; this.msgT = 2.2; this.draw(score, saved); }
  draw(score, saved) {
    this.last = [score, saved]; const x = this.cv.getContext('2d'), W = 1024, H = 640;
    x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(20,18,40,0.92)'; x.beginPath(); x.roundRect(0, 0, W, H, 36); x.fill();
    x.fillStyle = '#ff8a1f'; x.beginPath(); x.arc(70, 70, 36, 0, 7); x.fill(); x.fillStyle = '#14305f'; x.font = '900 46px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('3', 70, 72);
    x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = '800 44px system-ui'; x.fillText('STORE32 SCRATCH-OFFS', 124, 58);
    x.fillStyle = '#c9c2d8'; x.font = '500 26px system-ui'; x.fillText(`${Math.floor(score).toLocaleString()} points · ${saved} ticket${saved === 1 ? '' : 's'} waiting in your garage`, 124, 104);
    x.fillText('Poke a ticket to buy it. Scratch it later on a screen (garage).', 40, 160);
    TIERS.forEach((T, i) => {
      const [bx, by, bw, bh] = this.btns[i], g = x.createLinearGradient(bx, by, bx + bw, by + bh); g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]);
      x.fillStyle = g; x.beginPath(); x.roundRect(bx, by, bw, bh, 24); x.fill(); x.fillStyle = score >= T.cost ? T.ink : 'rgba(255,255,255,0.45)'; x.textAlign = 'center';
      x.font = '900 40px system-ui'; x.fillText(T.name.split(' ')[0].toUpperCase(), bx + bw / 2, by + 70); x.font = '800 30px system-ui'; x.fillText(T.name.split(' ').slice(1).join(' ').toUpperCase(), bx + bw / 2, by + 110);
      x.font = '700 28px system-ui'; x.fillText(`top prize ${T.prizes[3].toLocaleString()}`, bx + bw / 2, by + 165);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.roundRect(bx + 30, by + 206, bw - 60, 62, 18); x.fill(); x.fillStyle = '#fff'; x.font = '900 32px system-ui'; x.fillText(`${T.cost.toLocaleString()} PTS`, bx + bw / 2, by + 238);
    });
    const [lx, ly, lw, lh] = this.btns[3]; x.fillStyle = 'rgba(255,255,255,0.14)'; x.beginPath(); x.roundRect(lx, ly, lw, lh, 20); x.fill(); x.fillStyle = '#fff'; x.font = '800 32px system-ui'; x.fillText('LEAVE', lx + lw / 2, ly + lh / 2);
    if (this.msg && this.msgT > 0) { x.fillStyle = '#43d19e'; x.font = '800 26px system-ui'; x.fillText(this.msg, W / 2, 514); }
    this.tex.needsUpdate = true;
  }
  // fingertip positions (world) → index of the button poked (0-2 buy, 3 leave) or -1
  poke(tips, dt) {
    if (!this.mesh.visible) return -1;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0 && this.last) { this.msg = ''; this.draw(...this.last); } }
    let hit = -1;
    tips.forEach((p, k) => {
      const l = this.mesh.worldToLocal(this._v.copy(p)), u = (l.x / 0.48 + 0.5) * 1024, v = (0.5 - l.y / 0.3) * 640;
      const near = Math.abs(l.z) < 0.025 && u > 0 && u < 1024 && v > 0 && v < 640;
      if (!near) { if (Math.abs(l.z) > 0.05) this.armed[k] = true; return; }
      if (!this.armed[k]) return;
      for (let i = 0; i < this.btns.length; i++) { const [bx, by, bw, bh] = this.btns[i]; if (u > bx && u < bx + bw && v > by && v < by + bh) { hit = i; this.armed[k] = false; } }
    });
    return hit;
  }
}
