// Water on the camera: drops that hit the lens after a big splash and run down it, the screen going blue with a rush of bubbles
// as the camera plunges under, and a sheet of water draining off as it comes back up. A plain 2D canvas over the game (screen only, not VR).

export class LensFx {
  constructor() {
    const c = this.c = document.createElement('canvas'); c.className = 'lensfx';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';
    document.body.appendChild(c); this.g = c.getContext('2d');
    this.drops = []; this.bubs = []; this.wash = 0; this.sheet = 0; this.w = 0; this.h = 0; this.on = false; this.enabled = true;
  }
  size() {
    const s = Math.min(1, 900 / Math.max(innerWidth, innerHeight)) * Math.min(2, devicePixelRatio || 1); // keep it cheap
    const w = Math.round(innerWidth * s), h = Math.round(innerHeight * s);
    if (w !== this.w || h !== this.h) { this.w = this.c.width = w; this.h = this.c.height = h; }
    this.s = s;
  }
  // k 0..1: how much water hits the lens
  splash(k = 1) {
    if (!this.enabled) return; this.size(); const R = Math.random, n = Math.round(4 + 26 * k);
    for (let i = 0; i < n && this.drops.length < 90; i++) this.drops.push(this.drop(R() * this.w, R() * this.h * 0.95, (5 + R() * R() * 26 * (0.6 + k)) * this.s));
  }
  drip(n = 1) { if (!this.enabled) return; this.size(); for (let i = 0; i < n && this.drops.length < 90; i++) this.drops.push(this.drop(Math.random() * this.w, Math.random() * this.h * 0.7, (4 + Math.random() * 10) * this.s)); }
  drop(x, y, r) { return { x, y, r, vy: 0, stick: 0.2 + Math.random() * 1.4, life: 2.2 + Math.random() * 2.5, age: 0, wob: Math.random() * 6.28, trail: [] }; }
  // the camera just went under: a blue rush and a burst of bubbles streaming up past it
  plunge() {
    if (!this.enabled) return; this.size(); this.wash = 1; this.drops.length = 0; const R = Math.random;
    for (let i = 0; i < 70; i++) this.bubs.push({ x: R() * this.w, y: this.h * (0.5 + R() * 0.8), r: (3 + R() * R() * 22) * this.s, vy: -(250 + R() * 600) * this.s, wob: R() * 6.28, life: 0.6 + R() * 0.9 });
  }
  // the camera just came up: water sheets down the lens and leaves drops behind
  surface() {
    if (!this.enabled) return; this.size(); this.sheet = 1; this.wash = 0; this.bubs.length = 0;
    const R = Math.random; for (let i = 0; i < 34; i++) this.drops.push(this.drop(R() * this.w, R() * this.h, (4 + R() * R() * 22) * this.s));
  }
  clear() { this.drops.length = 0; this.bubs.length = 0; this.wash = this.sheet = 0; if (this.on) { this.g.clearRect(0, 0, this.w, this.h); this.on = false; } }
  update(dt) {
    if (!this.drops.length && !this.bubs.length && this.wash <= 0 && this.sheet <= 0) { if (this.on) { this.g.clearRect(0, 0, this.w, this.h); this.on = false; this.c.style.display = 'none'; } return; }
    if (!this.on) { this.on = true; this.c.style.display = ''; }
    this.size(); const g = this.g, W = this.w, H = this.h; g.clearRect(0, 0, W, H);
    // plunge: a blue-green flash that clears to the normal underwater look
    if (this.wash > 0) {
      this.wash = Math.max(0, this.wash - dt * 1.4); const a = this.wash * this.wash;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, `rgba(170,230,255,${0.55 * a})`); gr.addColorStop(0.5, `rgba(40,140,170,${0.6 * a})`); gr.addColorStop(1, `rgba(10,60,90,${0.75 * a})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // surfacing: a sheet of water drains from the top of the lens to the bottom
    if (this.sheet > 0) {
      this.sheet = Math.max(0, this.sheet - dt * 1.1); const t = 1 - this.sheet, top = H * t * t * 1.1;
      const gr = g.createLinearGradient(0, top, 0, H); gr.addColorStop(0, 'rgba(220,240,255,0.32)'); gr.addColorStop(0.04, `rgba(90,150,180,${0.28 * this.sheet + 0.06})`); gr.addColorStop(1, `rgba(40,90,120,${0.4 * this.sheet})`);
      g.fillStyle = gr; g.fillRect(0, top, W, H - top);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2 * this.s; g.beginPath();
      for (let x = 0; x <= W; x += 12 * this.s) { const y = top + Math.sin(x * 0.03 / this.s + t * 9) * 5 * this.s; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    }
    // bubbles rushing up
    for (let i = this.bubs.length - 1; i >= 0; i--) {
      const b = this.bubs[i]; b.life -= dt; b.wob += dt * 9; b.y += b.vy * dt; b.x += Math.sin(b.wob) * 40 * this.s * dt;
      if (b.life <= 0 || b.y < -b.r * 2) { this.bubs.splice(i, 1); continue; }
      const a = Math.min(1, b.life * 2);
      g.strokeStyle = `rgba(230,250,255,${0.75 * a})`; g.lineWidth = Math.max(1, b.r * 0.16); g.beginPath(); g.ellipse(b.x, b.y, b.r, b.r * 0.9, 0, 0, 6.283); g.stroke();
      g.fillStyle = `rgba(200,240,255,${0.12 * a})`; g.fill();
      g.fillStyle = `rgba(255,255,255,${0.8 * a})`; g.beginPath(); g.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.283); g.fill();
    }
    // drops: stick for a moment, then the bigger ones slide down leaving a thin wet trail
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.age += dt; d.life -= dt;
      if (d.life <= 0 || d.y > H + d.r * 2) { this.drops.splice(i, 1); continue; }
      if (d.age > d.stick && d.r > 7 * this.s) { d.vy = Math.min(d.vy + 260 * this.s * dt * (d.r / (20 * this.s)), 340 * this.s); d.wob += dt * 3; d.x += Math.sin(d.wob) * 6 * this.s * dt; d.r *= 1 - dt * 0.05; }
      const py = d.y; d.y += d.vy * dt;
      if (d.vy > 0) { d.trail.push([d.x, py]); if (d.trail.length > 24) d.trail.shift(); }
      const a = Math.min(1, d.life / 0.8);
      if (d.trail.length > 1) { g.strokeStyle = `rgba(210,235,255,${0.18 * a})`; g.lineWidth = d.r * 0.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(d.trail[0][0], d.trail[0][1]); for (const p of d.trail) g.lineTo(p[0], p[1]); g.lineTo(d.x, d.y); g.stroke(); }
      // a drop on glass flips the world: dark along the top edge, bright along the bottom, a small glint up top
      const r = d.r, lg = g.createLinearGradient(0, d.y - r, 0, d.y + r);
      lg.addColorStop(0, `rgba(10,30,50,${0.3 * a})`); lg.addColorStop(0.45, `rgba(150,190,215,${0.1 * a})`); lg.addColorStop(1, `rgba(255,255,255,${0.32 * a})`);
      g.fillStyle = lg; g.beginPath(); g.ellipse(d.x, d.y, r * 0.92, r, 0, 0, 6.283); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.35 * a})`; g.lineWidth = Math.max(1, r * 0.1); g.beginPath(); g.ellipse(d.x, d.y, r * 0.86, r * 0.94, 0, 0.35, 2.8); g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.7 * a})`; g.beginPath(); g.ellipse(d.x - r * 0.3, d.y - r * 0.5, r * 0.18, r * 0.1, -0.5, 0, 6.283); g.fill();
    }
  }
}
