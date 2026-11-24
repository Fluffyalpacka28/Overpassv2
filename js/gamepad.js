// Gamepad layer: turns whatever the browser reports into an Xbox-style layout (A B X Y, LB RB, LT RT, sticks, D-pad).
// Controllers Chrome recognises come in as the 'standard' mapping. Others (some Android handhelds) come in raw, with their own
// button numbers and the triggers as axes, so there's a per-controller set-up wizard ("press RT"...) whose answers are saved.
// Button glyphs are drawn here as plain SVG (our own drawings, free to use: no image files, no licence to credit).

const KEY = 'osm.pad.v1';
// logical names in standard-mapping order (index 0..15)
export const BTN = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right'];
const STD = Object.fromEntries(BTN.map((n, i) => [n, { t: 'b', i }]));
Object.assign(STD, { lx: { t: 'a', i: 0, s: 1, r: 0, stick: 1 }, ly: { t: 'a', i: 1, s: 1, r: 0, stick: 1 }, rx: { t: 'a', i: 2, s: 1, r: 0, stick: 1 }, ry: { t: 'a', i: 3, s: 1, r: 0, stick: 1 } });

// the wizard's questions, in order
export const STEPS = [
  ['rt', 'Pull the RIGHT trigger (RT)', 'Gas'], ['lt', 'Pull the LEFT trigger (LT)', 'Brake / reverse'],
  ['a', 'Press A (bottom face button)', 'Nitrous · menus: press'], ['b', 'Press B (right face button)', 'Handbrake · menus: back'],
  ['x', 'Press X (left face button)', 'Fire'], ['y', 'Press Y (top face button)', 'Camera'],
  ['lb', 'Press the LEFT bumper (LB)', 'Barrel roll'], ['rb', 'Press the RIGHT bumper (RB)', 'Front flip'],
  ['lx', 'Push the LEFT stick to the RIGHT', 'Steer'], ['ly', 'Push the LEFT stick DOWN', 'Menus'],
  ['rx', 'Push the RIGHT stick to the RIGHT', '—'], ['ry', 'Push the RIGHT stick DOWN', 'Flying: pitch'],
  ['l3', 'Click the LEFT stick in (L3)', 'Jump'], ['r3', 'Click the RIGHT stick in (R3)', 'Two-wheeler'],
  ['up', 'Press D-pad UP', 'Horn · Store 32'], ['down', 'Press D-pad DOWN', 'Dive / surface'],
  ['left', 'Press D-pad LEFT', 'Reset car'], ['right', 'Press D-pad RIGHT', 'Flight mode'],
  ['start', 'Press START / Menu (≡)', 'Pause'], ['back', 'Press SELECT / View (⧉)', 'Map · hold: hide this guide'],
];

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

export class Pad {
  constructor() {
    this.saved = load(); this.gp = null; this.id = ''; this.map = STD; this.prev = {}; this.cur = {}; this.wiz = null;
    this.stats = {}; this.frames = 0; this.trig = []; this.std = true;
  }
  get custom() { return !!this.saved[this.id]; }
  get needsSetup() { return !!this.gp && !this.std && !this.custom; }
  save(map) { this.saved[this.id] = map; try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { } this.pick(true); }
  forget() { delete this.saved[this.id]; try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { } this.pick(true); }
  // choose the pad and its layout
  pick(force) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { gp = p; break; }
    if (!gp) for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gp = gp; if (!gp) return null;
    if (gp.id !== this.id || force) {
      if (gp.id !== this.id) { this.stats = {}; this.frames = 0; this.trig = []; this.prev = {}; }
      this.id = gp.id; this.std = gp.mapping === 'standard';
      this.map = this.saved[this.id] || (this.std ? STD : this.guess(gp));
    }
    return gp;
  }
  // raw controllers: same button numbers as standard (right more often than not), but triggers are often axes resting at -1,
  // and the right stick is then on the two other axes. An axis that rests at 0 is a stick, never a trigger.
  guess(gp) {
    const m = { ...STD }, n = gp.axes.length, trig = this.trig.length ? this.trig : [];
    if (trig.length) {
      const sorted = [...trig].sort((a, b) => a - b);
      m.lt = { t: 'a', i: sorted[0], s: 1, r: -1 };
      if (sorted[1] != null) m.rt = { t: 'a', i: sorted[1], s: 1, r: -1 };
      const st = []; for (let i = 2; i < n && st.length < 2; i++) if (!trig.includes(i)) st.push(i);
      if (st[0] != null) m.rx = { t: 'a', i: st[0], s: 1, r: 0, stick: 1 }; if (st[1] != null) m.ry = { t: 'a', i: st[1], s: 1, r: 0, stick: 1 };
    }
    return m;
  }
  // watch the axes: a trigger sits at -1 most of the time, a stick at 0
  learn(gp) {
    if (this.std || this.custom) return;
    this.frames++;
    for (let i = 2; i < gp.axes.length; i++) {
      const v = gp.axes[i], s = this.stats[i] || (this.stats[i] = { neg: 0, mid: 0, first: v });
      if (v <= -0.96) s.neg++; else if (Math.abs(v) < 0.06) s.mid++;
    }
    if (this.frames === 2 || this.frames % 60 === 0) {
      const t = [];
      for (const k in this.stats) { const s = this.stats[k], i = +k; if ((this.frames < 120 && s.first <= -0.9) || (s.neg > 40 && s.neg > s.mid * 3)) t.push(i); }
      if (t.join() !== this.trig.join()) { this.trig = t; this.map = this.guess(gp); }
    }
  }
  src(s) {
    const gp = this.gp; if (!gp || !s) return 0;
    if (s.t === 'b') { const b = gp.buttons[s.i]; return b ? Math.max(b.value || 0, b.pressed ? 1 : 0) : 0; }
    const v = gp.axes[s.i]; if (v == null) return 0;
    if (s.stick) return Math.max(-1, Math.min(1, (v - (s.r || 0)) * s.s));
    if (s.tr && !s.r && v < -0.9) s.r = -1;
    const r = s.r || 0, span = s.s > 0 ? 1 - r : 1 + r;
    return clamp01((v - r) * s.s / (span || 1));
  }
  poll() {
    const gp = this.pick(false); if (!gp) return false;
    this.learn(gp);
    this.prev = this.cur; this.cur = {};
    for (const n of BTN) this.cur[n] = this.src(this.map[n]);
    for (const n of ['lx', 'ly', 'rx', 'ry']) this.cur[n] = this.src(this.map[n]);
    if (this.wiz) { this.wizStep(gp); return false; }
    return true;
  }
  val(n) { return this.cur[n] || 0; }
  down(n) { return (this.cur[n] || 0) > 0.5; }
  edge(n) { return (this.cur[n] || 0) > 0.5 && !((this.prev[n] || 0) > 0.5); }
  up(n) { return !((this.cur[n] || 0) > 0.5) && (this.prev[n] || 0) > 0.5; }
  any() { for (const n of BTN) if (this.down(n)) return true; return Math.abs(this.val('lx')) > 0.4 || Math.abs(this.val('ly')) > 0.4; }

  // ---- set-up wizard ----
  startWizard(onDone) {
    const gp = this.pick(false);
    this.wiz = { k: 0, map: {}, base: gp ? this.snap(gp) : null, wait: true, onDone, t: performance.now() };
    this.drawWizard();
  }
  snap(gp) { return { a: [...gp.axes], b: gp.buttons.map(b => !!(b && (b.pressed || b.value > 0.5))) }; }
  wizStep(gp) {
    const w = this.wiz; if (!w) return;
    if (!w.base) w.base = this.snap(gp);
    const used = s => Object.values(w.map).some(o => o && o.t === s.t && o.i === s.i && (s.t === 'b' || o.stick || s.stick || o.s === s.s));
    // wait for everything to be let go before the next question
    if (w.wait) {
      const anyBtn = gp.buttons.some((b, i) => b && (b.pressed || b.value > 0.5) && !w.base.b[i]);
      const last = w.last, lastHeld = last && (last.t === 'b' ? !!(gp.buttons[last.i] && (gp.buttons[last.i].pressed || gp.buttons[last.i].value > 0.5)) : (gp.axes[last.i] - last.r) * last.s > 0.35);
      if (!anyBtn && !lastHeld && performance.now() - w.t > 250) { w.wait = false; w.base = this.snap(gp); w.base.b = w.base.b.map(() => false); }
      return;
    }
    const step = STEPS[w.k]; if (!step) return;
    const [name] = step, stick = /^[lr][xy]$/.test(name);
    let got = null;
    if (!stick) for (let i = 0; i < gp.buttons.length; i++) { const b = gp.buttons[i]; if (b && (b.pressed || b.value > 0.5) && !used({ t: 'b', i })) { got = { t: 'b', i }; break; } }
    if (!got) { let bi = -1, bd = 0.6; for (let i = 0; i < gp.axes.length; i++) { const d = gp.axes[i] - (w.base.a[i] || 0); if (Math.abs(d) > bd && !used({ t: 'a', i, s: Math.sign(d), stick: stick ? 1 : 0 })) { bd = Math.abs(d); bi = i; } }
      if (bi >= 0) { const d = gp.axes[bi] - (w.base.a[bi] || 0), r = Math.abs(w.base.a[bi]) > 0.8 ? Math.sign(w.base.a[bi]) : 0; got = stick ? { t: 'a', i: bi, s: Math.sign(d), r: 0, stick: 1 } : { t: 'a', i: bi, s: Math.sign(d), r, tr: name === 'lt' || name === 'rt' ? 1 : 0 }; } }
    if (!got) return;
    w.map[name] = got; w.last = got.t === 'a' ? { t: 'a', i: got.i, r: w.base.a[got.i] || 0, s: got.s } : got; this.next();
  }
  next(skip) {
    const w = this.wiz; if (!w) return;
    if (skip) w.last = null;
    w.k++; w.wait = true; w.t = performance.now();
    if (w.k >= STEPS.length) return this.finish(true);
    this.drawWizard();
  }
  back() { const w = this.wiz; if (!w || w.k === 0) return; w.k--; delete w.map[STEPS[w.k][0]]; w.wait = true; w.t = performance.now(); this.drawWizard(); }
  finish(save) {
    const w = this.wiz; if (!w) return; this.wiz = null;
    if (save) { const base = this.std ? STD : this.guess(this.gp || { axes: [] }); this.save({ ...base, ...w.map }); }
    if (this.wizEl) this.wizEl.hidden = true;
    this.prev = {}; this.cur = {};
    try { w.onDone && w.onDone(save); } catch { }
  }
  drawWizard() {
    const w = this.wiz; if (!w) return;
    let el = this.wizEl;
    if (!el) {
      el = this.wizEl = document.createElement('div'); el.className = 'padwiz';
      el.addEventListener('click', e => { const b = e.target.closest('[data-pw]'); if (!b) return; const a = b.dataset.pw; if (a === 'skip') this.next(true); else if (a === 'back') this.back(); else if (a === 'cancel') this.finish(false); else if (a === 'save') this.finish(true); });
      document.body.appendChild(el);
    }
    el.hidden = false;
    const [name, ask, use] = STEPS[w.k];
    el.innerHTML = `<div class="pw-box"><h3>Set up your controller</h3><p class="pw-id">${esc(this.id.replace(/\(.*?\)/g, '').trim().slice(0, 48) || 'Gamepad')}</p>
      <div class="pw-glyph">${glyph(name, 88)}</div><p class="pw-ask">${ask}</p><p class="pw-use">Used for: ${use}</p>
      <div class="pw-bar"><b style="width:${Math.round(w.k / STEPS.length * 100)}%"></b></div><p class="pw-n">${w.k + 1} of ${STEPS.length} · let go between presses</p>
      <div class="pw-btns"><button data-pw="back" ${w.k ? '' : 'disabled'}>‹ Back</button><button data-pw="skip">Skip this one</button><button data-pw="save">Save &amp; finish</button><button data-pw="cancel">Cancel</button></div></div>`;
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- glyphs: Xbox-style button icons as inline SVG (drawn here; free to use) ----
const FACE = { a: '#5fbf3a', b: '#e2463c', x: '#3a8ee6', y: '#f2c12e' };
export function glyph(n, px = 26) {
  const o = `<svg class="pg" viewBox="0 0 40 40" width="${px}" height="${px}" aria-label="${n.toUpperCase()}">`, end = '</svg>';
  const ring = `<circle cx="20" cy="20" r="18" fill="#1b1d22" stroke="#4a4f59" stroke-width="2"/>`;
  if (FACE[n]) return o + ring + `<text x="20" y="27.5" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="21" fill="${FACE[n]}">${n.toUpperCase()}</text>` + end;
  if (n === 'lb' || n === 'rb') return o + `<rect x="2" y="10" width="36" height="20" rx="10" fill="#1b1d22" stroke="#4a4f59" stroke-width="2"/><text x="20" y="25" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="13" fill="#fff">${n.toUpperCase()}</text>` + end;
  if (n === 'lt' || n === 'rt') return o + `<path d="M8 36 L8 14 Q8 4 20 4 Q32 4 32 14 L32 36 Z" fill="#1b1d22" stroke="#4a4f59" stroke-width="2"/><text x="20" y="27" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="13" fill="#fff">${n.toUpperCase()}</text>` + end;
  if (n === 'l3' || n === 'r3' || n === 'lx' || n === 'ly' || n === 'rx' || n === 'ry') {
    const L = n[0] === 'l' ? 'L' : 'R', arr = n[1] === 'x' ? `<path d="M30 20 l-5 -4 v8z M10 20 l5 -4 v8z" fill="#9aa3b2"/>` : n[1] === 'y' ? `<path d="M20 30 l-4 -5 h8z M20 10 l-4 5 h8z" fill="#9aa3b2"/>` : `<circle cx="20" cy="20" r="11" fill="none" stroke="#9aa3b2" stroke-width="1.6" stroke-dasharray="2 2"/>`;
    return o + ring + `<circle cx="20" cy="20" r="9" fill="#2c3038"/>` + arr + `<text x="20" y="24.5" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="12" fill="#fff">${L}${n[1] === '3' ? '3' : ''}</text>` + end;
  }
  if (n === 'up' || n === 'down' || n === 'left' || n === 'right' || n === 'dpad') {
    const hi = { up: 'M15 4 h10 v11 h-10z', down: 'M15 25 h10 v11 h-10z', left: 'M4 15 h11 v10 h-11z', right: 'M25 15 h11 v10 h-11z' }[n] || '';
    return o + `<path d="M15 4 h10 v11 h11 v10 h-11 v11 h-10 v-11 h-11 v-10 h11z" fill="#1b1d22" stroke="#4a4f59" stroke-width="2" stroke-linejoin="round"/>` + (hi ? `<path d="${hi}" fill="#e8ecf2"/>` : '') + end;
  }
  if (n === 'start') return o + ring + `<path d="M12 14 h16 M12 20 h16 M12 26 h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>` + end;
  if (n === 'back') return o + ring + `<rect x="10" y="11" width="13" height="11" rx="2" fill="none" stroke="#fff" stroke-width="2.2"/><rect x="17" y="18" width="13" height="11" rx="2" fill="#1b1d22" stroke="#fff" stroke-width="2.2"/>` + end;
  return o + ring + end;
}
