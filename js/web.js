// The phone's web browser: a home page of site thumbnails and a handful of made-up websites you can tap into and scroll.
// Everything is drawn on the phone's canvas (540 × 1046), so it works the same on screens and on the VR phone.
const IMG = id => new URL(`../icons/web/${id}.jpg`, import.meta.url).href;
const SW = 540, SH = 1046, TOP = 148, BOT = SH - 72, VIEW = BOT - TOP;
const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

// ---- the sites ----
export const SITES = [
  { id: 'biny', name: 'Biny', url: 'biny.help', bg: '#f3f5f9', ink: '#141a3a', sub: '#4a5270', acc: '#3a3fbf', card: '#ffffff' },
  { id: 'miarrhea', name: 'miarrhea', url: 'miarrhea.com', bg: '#f5f8fd', ink: '#0d2b5e', sub: '#3e4c66', acc: '#e7b434', card: '#ffffff' },
  { id: 'bungle', name: 'Bungle', url: 'bungle.shop', bg: '#fbf2e8', ink: '#0e1f4d', sub: '#55524c', acc: '#f25c45', card: '#ffffff' },
  { id: 'carvapes', name: 'Car Vapes', url: 'carvapes.gg', bg: '#e6effb', ink: '#0c2c5c', sub: '#3d5679', acc: '#1565d8', card: '#ffffff' },
  { id: 'bbb', name: 'BBB Auto Insurance', url: 'bbb-auto.ins', bg: '#eef3fa', ink: '#0c2557', sub: '#45526b', acc: '#1a5fc0', card: '#ffffff' },
  { id: 'music', name: 'Music Streamed', url: 'musicstreamed.fm', bg: '#f7f9fc', ink: '#111827', sub: '#4b5563', acc: '#1e8fd8', card: '#ffffff' },
  { id: 'blicks', name: "Blick's Shooting Goods", url: 'blicks.shop', bg: '#141416', ink: '#f4f4f5', sub: '#b4b4bb', acc: '#d4282d', card: '#1f1f23' },
  { id: 'tvmobile', name: 'TV Mobile', url: 'tvmobile.tv', bg: '#0b1d3a', ink: '#f2f8ff', sub: '#9ec9e6', acc: '#22d3d8', card: '#13294d' },
];
const site = id => SITES.find(s => s.id === id);
const pick = (arr, n, not = []) => { const a = arr.filter(x => !not.includes(x)); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

const TRACKS = [
  ['Highway Hum', 'The Overpasses', 214], ['Pothole Blues', 'Lil Suspension', 187], ['Merge Left', 'DJ Blinker', 201],
  ['Cruise Control (Slowed)', 'Auto Pilot', 263], ['Red Light Romance', 'The Brake Lights', 176], ['Ten Over', 'Speed Trap', 158],
];
const VIDEO_TITLES = ['Blob Feelings', 'Square Has A Day', 'Circles, Probably', 'The Wiggle', 'Shapes At Night', 'Dots Doing Dots', 'Very Important Lines', 'Mostly Purple', 'Bounce (Extended Cut)', 'A Triangle Remembers'];

export class PhoneWeb {
  constructor(os) {
    this.os = os; this.page = null; this.scroll = 0; this.vel = 0; this.hist = []; this.imgs = {};
    this.home4 = pick(SITES.map(s => s.id), 4); this.recos = [];
    this.cart = 0; this.breathe = true; this.track = 0; this.playing = false; this.trackT = 0;
    this.vid = { seed: Math.random() * 1e4, t: 0, play: true, n: (Math.random() * 9000 + 1000) | 0, title: VIDEO_TITLES[0] };
    this.quote = null; this.toastT = 0; this.toastMsg = ''; this.lastT = 0; this.hits = [];
  }
  img(id) { if (this.imgs[id]) return this.imgs[id]; const im = new Image(); im.onload = () => { this.os.dirty = true; }; im.src = IMG(id); return this.imgs[id] = im; }
  // should the phone redraw every frame (animations, a scroll still gliding, a toast fading)?
  live() { return Math.abs(this.vel) > 2 || this.toastT > 0 || (this.page === 'biny' && this.breathe) || (this.page === 'music' && this.playing) || (this.page === 'tvmobile' && this.vid.play); }
  toast(m) { this.toastMsg = m; this.toastT = 2.2; this.os.dirty = true; }
  open(id, push = true) {
    if (push && this.page !== id) this.hist.push(this.page);
    this.page = id; this.scroll = 0; this.vel = 0;
    if (id) this.recos = pick(SITES.map(s => s.id), 2, [id]);
    if (id === 'tvmobile') this.newVideo();
    this.os.dirty = true;
  }
  back() { if (this.hist.length) this.open(this.hist.pop(), false); else if (this.page) this.open(null, false); else this.os.home(); }
  newVideo() { const v = this.vid; v.seed = Math.random() * 1e4; v.t = 0; v.n = (Math.random() * 9000 + 1000) | 0; v.title = VIDEO_TITLES[(Math.random() * VIDEO_TITLES.length) | 0]; }

  // ---- text helpers (measure-then-draw so the page can lay itself out) ----
  lines(s, maxW, size, weight = 500) {
    const g = this.os.g; g.font = `${weight} ${size}px ${FONT}`; const out = []; let line = '';
    for (const w of String(s).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line); return out;
  }
  para(s, x, y, maxW, size, col, weight = 500, lh = 1.3, align = 'left') {
    const g = this.os.g, L = this.lines(s, maxW, size, weight); g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic';
    L.forEach((l, i) => g.fillText(l, x, y + size + i * size * lh)); return L.length * size * lh + size * 0.3;
  }
  paraH(s, maxW, size, weight = 500, lh = 1.3) { return this.lines(s, maxW, size, weight).length * size * lh + size * 0.3; }
  rr(x, y, w, h, r, fill) { const g = this.os.g; this.os.rr(x, y, w, h, r); g.fillStyle = fill; g.fill(); }
  t(s, x, y, size, col, w = 500, align = 'left', weight = 600) { this.os.txt(s, x, y, size, col, w, align, weight); }
  cover(im, x, y, w, h, r = 18) {
    const g = this.os.g; g.save(); this.os.rr(x, y, w, h, r); g.clip();
    if (im.complete && im.naturalWidth) { const s = Math.max(w / im.naturalWidth, h / im.naturalHeight), iw = im.naturalWidth * s, ih = im.naturalHeight * s; g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    else { g.fillStyle = '#d5dbe6'; g.fillRect(x, y, w, h); }
    g.restore();
  }

  // ---- page building blocks: each is { h, draw(y), hits: [[x, y, w, h, fn]] } with y relative to the block ----
  bHero(id) { const im = this.img(id), a = im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0.667, h = Math.round(SW * a); return { h, draw: y => this.cover(im, 0, y, SW, h, 0) }; }
  bH(s, S, size = 40) { const h = this.paraH(s, 480, size, 800, 1.12) + 6; return { h, draw: y => this.para(s, 30, y + 2, 480, size, S.ink, 800, 1.12) }; }
  bP(s, S, size = 24, col) { const h = this.paraH(s, 480, size) + 6; return { h, draw: y => this.para(s, 30, y, 480, size, col || S.sub, 500) }; }
  bGap(h) { return { h, draw: () => { } }; }
  bBtn(label, col, fn, ink = '#fff') { return { h: 100, draw: y => { this.rr(30, y + 12, 480, 76, 20, col); this.t(label, SW / 2, y + 61, 28, ink, 440, 'center', 800); }, hits: [[30, 12, 480, 76, fn]] }; }
  // a grid of tiles: items { icon, name, sub, fn, col }
  bTiles(items, S, cols = 2, th = 150) {
    const gap = 16, w = (480 - gap * (cols - 1)) / cols, rows = Math.ceil(items.length / cols), h = rows * (th + gap);
    const hits = items.map((it, i) => [30 + (i % cols) * (w + gap), ((i / cols) | 0) * (th + gap), w, th, it.fn]);
    return { h, hits, draw: y => items.forEach((it, i) => {
      const x = 30 + (i % cols) * (w + gap), yy = y + ((i / cols) | 0) * (th + gap);
      this.rr(x, yy, w, th, 18, it.bg || S.card); if (it.col) this.rr(x + 14, yy + 14, 64, 64, 16, it.col);
      this.t(it.icon || '', it.col ? x + 46 : x + 18, yy + 64, 38, '#fff', 60, it.col ? 'center' : 'left', 400);
      this.t(it.name, x + 18, yy + th - (it.sub ? 46 : 22), cols > 2 ? 20 : 23, it.ink || S.ink, w - 30, 'left', 800);
      if (it.sub) this.t(it.sub, x + 18, yy + th - 18, cols > 2 ? 17 : 20, it.subCol || S.sub, w - 30, 'left', 600);
    }) };
  }
  // "Recommended for you": two other sites at the bottom of every page
  bRecos(S) {
    const w = 232, th = 150, ids = this.recos;
    return { h: 300, hits: ids.map((id, i) => [30 + i * (w + 16), 60, w, th + 70, () => this.open(id)]), draw: y => {
      this.rr(0, y, SW, 300, 0, 'rgba(0,0,0,.06)');
      this.t('Recommended for you', 30, y + 44, 26, S.ink, 480, 'left', 800);
      ids.forEach((id, i) => { const s = site(id), x = 30 + i * (w + 16); this.rr(x, y + 60, w, th + 70, 18, S.card); this.cover(this.img(id), x, y + 60, w, th, 18);
        this.t(s.name, x + 14, y + 60 + th + 32, 22, S.ink, w - 24, 'left', 800); this.t(s.url, x + 14, y + 60 + th + 58, 18, S.sub, w - 24, 'left', 500); });
    } };
  }

  // ---- the pages ----
  blocks(id) {
    const S = site(id), A = this.os.api, B = [this.bHero(id), this.bGap(24)];
    const tip = m => () => this.toast(m);
    if (id === 'biny') {
      B.push(this.bH("Feeling small today? You're not alone.", S), this.bP('Tiny moments, big support. Here are a few little things that can help right now.', S), this.bGap(10));
      B.push({ h: 330, hits: [[30, 0, 480, 310, () => { this.breathe = !this.breathe; }]], draw: y => { // breathing buddy: 4 s in, 4 s out
        this.rr(30, y, 480, 310, 24, S.card); const ph = (this.os.t % 8) / 8, k = this.breathe ? (ph < 0.5 ? ph * 2 : 2 - ph * 2) : 0.5, e = 0.5 - Math.cos(k * Math.PI) / 2;
        const g = this.os.g, r = 52 + e * 70; g.beginPath(); g.arc(SW / 2, y + 140, r + 18, 0, Math.PI * 2); g.fillStyle = 'rgba(90,140,255,.15)'; g.fill();
        g.beginPath(); g.arc(SW / 2, y + 140, r, 0, Math.PI * 2); g.fillStyle = '#7ea6ff'; g.fill();
        this.t(this.breathe ? (ph < 0.5 ? 'Breathe in…' : 'Breathe out…') : 'Tap to breathe along', SW / 2, y + 284, 26, S.ink, 440, 'center', 700);
      } });
      B.push(this.bTiles([
        { icon: '💧', col: '#5aa9ff', name: 'Drink some water', sub: 'Small sips count', fn: tip('Water break! Your future self says thanks.') },
        { icon: '🚗', col: '#7c6cff', name: 'Slow drive', sub: 'Windows down', fn: tip('Find a quiet road and just cruise for a bit.') },
        { icon: '🎵', col: '#ff8fb1', name: 'A song you love', sub: 'Volume up', fn: tip('Put on the one that always helps.') },
        { icon: '💬', col: '#3cc68a', name: 'Text a friend', sub: 'Even just "hi"', fn: () => { this.os.app = 'msg'; this.os.dirty = true; } },
      ], S), this.bGap(6));
      B.push(this.bP("Biny is a pretend website in a game. If things feel heavy for real, talking to someone you trust or a local helpline can really help.", S, 20));
    } else if (id === 'miarrhea') {
      B.push(this.bH('Fast Relief — When You Need It Most', S), this.bP('Clinically tested* and doctor-recommended* for when the road gets bumpy and so do you.', S), this.bGap(8));
      B.push(this.bTiles([{ icon: '💊', col: '#0d2b5e', name: 'Fast', sub: 'relief' }, { icon: '🛡️', col: '#0d2b5e', name: 'Safe &', sub: 'effective' }, { icon: '⏱️', col: '#0d2b5e', name: '24 hr', sub: 'relief' }], S, 3, 150), this.bGap(8));
      B.push(this.bH('What people are saying', S, 30));
      for (const [st, q, who] of [['★★★★★', '"Finally made it through the whole road trip."', 'Gary, long-haul trucker'], ['★★★★☆', '"Works great. Tastes like a penny."', 'Deb'], ['★★★★★', '"I was skeptical. I am no longer skeptical."', 'Anonymous']]) {
        const h = this.paraH(q, 440, 23, 600) + 74; B.push({ h: h + 14, draw: y => { this.rr(30, y, 480, h, 18, S.card); this.t(st, 50, y + 38, 24, '#e7a614', 300, 'left', 700); this.para(q, 50, y + 46, 440, 23, S.ink, 600); this.t('— ' + who, 50, y + h - 18, 19, S.sub, 440, 'left', 500); } });
      }
      B.push(this.bBtn('Get Relief Now →', S.acc, tip('Added to cart · ships in 3–5 business hours'), '#0d2b5e'));
      B.push(this.bP('*Not real medicine. Not a real website. Ask your mechanic if miarrhea is right for you.', S, 19));
    } else if (id === 'bungle') {
      B.push(this.bH('Find Stuff. & Things. Whatever.', S), this.bP("we got stuff an things for you to buy maybe if you want I don't know", S), this.bGap(6));
      const P = [['🎧', 'Headphones', 59], ['☕', 'Mug', 14], ['👟', 'Sneakers', 64], ['🪴', 'Succulent', 9], ['🕶️', 'Sunglasses', 22], ['🧢', 'Beanie', 18], ['🥤', 'Water bottle', 26], ['📓', 'Notebook', 7]];
      B.push(this.bTiles(P.map(([i, n, p]) => ({ icon: i, col: '#f9d8c9', name: n, sub: `$${p}.99 · tap to add`, fn: () => { this.cart++; this.toast(`${n} added. Maybe.`); } })), S, 2, 160));
      B.push(this.bBtn(this.cart ? `Checkout (${this.cart})` : 'Cart (0)', this.cart ? S.acc : '#c9c2b8', () => { if (!this.cart) { this.toast('Your cart is empty. Probably.'); return; } this.cart = 0; this.toast("Order placed! It'll show up. We'll see."); }));
      B.push(this.bP("Free shipping on maybe-orders • Returns? We'll see.", S, 20));
    } else if (id === 'carvapes') {
      B.push(this.bH('CAR VAPES — BLOW CLOUDS', S), this.bP('Exhaust smoke flavors for your ride. Custom builds • Cloud Boosts • Turbo Puff Races • Online multiplayer.', S), this.bGap(6));
      B.push({ h: 86, draw: y => { this.rr(30, y, 480, 66, 33, '#5b4fd6'); this.t('NEW: TURBO PUFF MODE LIVE', SW / 2, y + 43, 24, '#fff', 440, 'center', 800); } });
      B.push(this.bH('Shop exhaust smoke flavors', S, 28));
      const F = [['🫐', 'Blueberry Smoke', 'Sweet', '#3f6fe0'], ['🌿', 'Mint Frost', 'Cool', '#2fb98a'], ['🍇', 'Grape Gas', 'Fruity', '#8b4fd6'], ['🍬', 'Candy Clouds', 'Fluffy', '#ff7ab8'], ['🍋', 'Lemon Diesel', 'Zesty', '#e8b417'], ['🍉', 'Melon Burnout', 'Juicy', '#e8484f']];
      B.push(this.bTiles(F.map(([i, n, s, c]) => ({ icon: i, col: c, name: n, sub: `$4.99 · ${s}`, fn: tip(`${n} added. Your exhaust smells amazing (not really).`) })), S, 2, 160));
    } else if (id === 'bbb') {
      B.push(this.bH('Protect Your Drive with Trusted Coverage', S), this.bP('Affordable rates • 24/7 roadside assistance • Fast claims', S), this.bGap(6));
      const car = (A.carName && A.carName()) || 'your car', q = this.quote;
      const lines = q ? [['Base rate', q.base], ['Driving like that', q.style], ['Hidden fee', q.f1], ['Another hidden fee', q.f2], ['Fee for the fees', q.f3]] : [];
      const h = q ? 150 + lines.length * 40 + 110 : 200;
      B.push({ h: h + 16, hits: [[50, h - 86, 440, 66, () => { const r = n => Math.round(n * (0.7 + Math.random() * 0.6)); this.quote = { base: r(420), style: r(180), f1: r(35), f2: r(22), f3: r(9) }; }]], draw: y => {
        this.rr(30, y, 480, h, 20, S.card); this.t('Your vehicle', 50, y + 44, 21, S.sub, 440, 'left', 600); this.t(car, 50, y + 82, 30, S.ink, 440, 'left', 800);
        if (q) { let yy = y + 128, tot = 0; for (const [n, v] of lines) { this.t(n, 50, yy, 22, S.sub, 300, 'left', 600); this.t(v + ' pts', 490, yy, 22, S.ink, 160, 'right', 700); tot += v; yy += 40; }
          this.t('Total / yr', 50, yy + 6, 24, S.ink, 300, 'left', 800); this.t(tot + ' pts', 490, yy + 6, 26, S.acc, 180, 'right', 900); }
        this.rr(50, y + h - 86, 440, 66, 18, S.acc); this.t(q ? 'Get another quote →' : 'Get Your Free Quote →', SW / 2, y + h - 43, 26, '#fff', 400, 'center', 800);
      } });
      B.push(this.bTiles([{ icon: '🛡️', col: '#f2c230', name: 'A+ Rated', sub: 'by us' }, { icon: '🚗', col: '#1a5fc0', name: 'Save up to 30%', sub: 'on your policy' }, { icon: '🕐', col: '#0c2557', name: '24/7 support', sub: 'Always here' }, { icon: '⭐', col: '#e7a614', name: '4.8 / 5', sub: 'from 2,000+ reviews' }], S, 2, 150));
      B.push(this.bP('Licensed everywhere • Universal coverage • Secure • Some hidden fees • Instant online quotes', S, 20));
    } else if (id === 'music') {
      B.push(this.bH('Now streaming', S));
      B.push({ h: 320, hits: [[150, 236, 80, 70, () => { this.track = (this.track + TRACKS.length - 1) % TRACKS.length; this.trackT = 0; }], [230, 226, 80, 80, () => { this.playing = !this.playing; }], [310, 236, 80, 70, () => { this.track = (this.track + 1) % TRACKS.length; this.trackT = 0; }]], draw: y => {
        const g = this.os.g, [n, a, d] = TRACKS[this.track]; this.rr(30, y, 480, 304, 24, '#10213a');
        const gr = g.createLinearGradient(50, y + 20, 190, y + 160); gr.addColorStop(0, `hsl(${this.track * 57 % 360},80%,60%)`); gr.addColorStop(1, `hsl(${(this.track * 57 + 120) % 360},70%,40%)`); this.rr(50, y + 22, 140, 140, 16, gr);
        this.t('♪', 120, y + 112, 64, 'rgba(255,255,255,.85)', 100, 'center', 700);
        this.t(n, 212, y + 72, 28, '#fff', 280, 'left', 800); this.t(a, 212, y + 108, 22, '#9fb4d6', 280, 'left', 600);
        const p = Math.min(1, this.trackT / d); this.rr(50, y + 188, 440, 8, 4, 'rgba(255,255,255,.2)'); this.rr(50, y + 188, Math.max(8, 440 * p), 8, 4, S.acc);
        const mm = s => `${(s / 60) | 0}:${String((s | 0) % 60).padStart(2, '0')}`; this.t(mm(this.trackT), 50, y + 222, 18, '#9fb4d6', 100, 'left', 600); this.t(mm(d), 490, y + 222, 18, '#9fb4d6', 100, 'right', 600);
        this.t('⏮', 190, y + 284, 40, '#fff', 60, 'center', 400); g.beginPath(); g.arc(270, y + 266, 36, 0, Math.PI * 2); g.fillStyle = S.acc; g.fill();
        this.t(this.playing ? '❚❚' : '▶', 272, y + 280, 34, '#fff', 60, 'center', 800); this.t('⏭', 350, y + 284, 40, '#fff', 60, 'center', 400);
      } });
      B.push(this.bH('Up next', S, 28));
      TRACKS.forEach(([n, a, d], i) => B.push({ h: 84, hits: [[30, 0, 480, 76, () => { this.track = i; this.trackT = 0; this.playing = true; }]], draw: y => {
        this.rr(30, y, 480, 76, 16, i === this.track ? '#e3f1fc' : S.card); this.t(String(i + 1), 58, y + 48, 24, S.sub, 30, 'center', 700);
        this.t(n, 90, y + 34, 23, S.ink, 300, 'left', 700); this.t(a, 90, y + 62, 19, S.sub, 300, 'left', 500); this.t(`${(d / 60) | 0}:${String(d % 60).padStart(2, '0')}`, 490, y + 48, 20, S.sub, 80, 'right', 600);
      } }));
      B.push(this.bP('Free with ads. The ads are also music.', S, 20));
    } else if (id === 'blicks') {
      B.push(this.bH('PRECISION GEAR FOR YOUR RIDE', S), this.bP("Car-mounted gear, ammo and optics since 1998. Pull up to any Blick's store to kit out your car.", S), this.bGap(6));
      B.push(this.bTiles([['🎯', 'Gear'], ['📦', 'Ammo'], ['🔭', 'Optics'], ['🧰', 'Supplies']].map(([i, n]) => ({ icon: i, col: '#d4282d', name: n.toUpperCase(), sub: 'In store only', fn: tip("In store only — pull up to a Blick's to shop") })), S, 2, 150));
      B.push(this.bBtn('Find the nearest store →', S.acc, () => { const m = A.blicks ? A.blicks() : ''; this.toast(m || "Looking for a Blick's…"); }));
      B.push(this.bP('Open every day • Est. 1998 • Gear • Ammo • Optics • Supplies', S, 20));
    } else if (id === 'tvmobile') {
      B.push(this.bH('Stream videos or whatever', S), this.bP('Watch abstract random 10 second videos. All AI, all the time, just for you.', S), this.bGap(6));
      B.push({ h: 400, hits: [[30, 0, 480, 300, () => { this.vid.play = !this.vid.play; }], [30, 316, 232, 66, () => { this.vid.play = !this.vid.play; }], [278, 316, 232, 66, () => { this.newVideo(); this.vid.play = true; }]], draw: y => {
        const g = this.os.g, v = this.vid; g.save(); this.os.rr(30, y, 480, 270, 18); g.clip(); this.drawVideo(g, 30, y, 480, 270, v); g.restore();
        this.t('240p', 496, y + 30, 17, 'rgba(255,255,255,.75)', 80, 'right', 700);
        this.rr(30, y + 278, 480, 6, 3, 'rgba(255,255,255,.2)'); this.rr(30, y + 278, Math.max(6, 480 * Math.min(1, v.t / 10)), 6, 3, S.acc);
        this.t(`Video #${v.n}: "${v.title}"`, 30, y + 306, 20, S.sub, 480, 'left', 600);
        this.rr(30, y + 316, 232, 66, 18, S.card); this.t(v.play ? '❚❚ Pause' : '▶ Play', 146, y + 358, 24, '#fff', 200, 'center', 800);
        this.rr(278, y + 316, 232, 66, 18, S.acc); this.t('Next video ▶▶', 394, y + 358, 24, '#06213a', 200, 'center', 800);
      } });
      B.push(this.bP('Free to try • all AI all the time, just for you • 240p', S, 20));
    }
    B.push(this.bGap(30), this.bRecos(S));
    return B;
  }
  // TV Mobile's "videos": shapes from a seed, ten seconds each
  drawVideo(g, x, y, w, h, v) {
    let s = v.seed; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280, t = v.t;
    const hue = R() * 360; const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, `hsl(${hue},60%,${18 + 10 * Math.sin(t)}%)`); gr.addColorStop(1, `hsl(${(hue + 80) % 360},70%,30%)`); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const n = 5 + (R() * 7 | 0);
    for (let i = 0; i < n; i++) {
      const kind = R() * 3 | 0, cx = x + w * (0.5 + 0.4 * Math.sin(t * (0.3 + R()) + R() * 6)), cy = y + h * (0.5 + 0.38 * Math.cos(t * (0.4 + R()) + R() * 6)), sz = 20 + R() * 60 * (1 + 0.3 * Math.sin(t * 2 + i));
      g.fillStyle = `hsla(${(hue + R() * 200) % 360},85%,${55 + R() * 20}%,.8)`; g.save(); g.translate(cx, cy); g.rotate(t * (R() - 0.5) * 2);
      if (kind === 0) { g.beginPath(); g.arc(0, 0, sz / 2, 0, Math.PI * 2); g.fill(); } else if (kind === 1) g.fillRect(-sz / 2, -sz / 2, sz, sz); else { g.beginPath(); g.moveTo(0, -sz / 2); g.lineTo(sz / 2, sz / 2); g.lineTo(-sz / 2, sz / 2); g.closePath(); g.fill(); }
      g.restore();
    }
    // a bit of "240p" blockiness
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let yy = y; yy < y + h; yy += 6) g.fillRect(x, yy, w, 2);
  }

  // ---- drawing the browser ----
  draw() {
    const os = this.os, g = os.g, now = os.t, dt = Math.min(0.1, Math.max(0, now - this.lastT)); this.lastT = now;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.page === 'music' && this.playing) { this.trackT += dt; if (this.trackT >= TRACKS[this.track][2]) { this.track = (this.track + 1) % TRACKS.length; this.trackT = 0; } }
    if (this.page === 'tvmobile' && this.vid.play) { this.vid.t += dt; if (this.vid.t >= 10) this.newVideo(); }
    const S = this.page ? site(this.page) : { bg: '#f4f6fa', ink: '#18203a', sub: '#5a6478', card: '#fff', acc: '#3d7bff' };
    g.fillStyle = S.bg; g.fillRect(0, 56, SW, SH - 56);
    // the page (scrolls under the toolbar)
    const B = this.page ? this.blocks(this.page) : this.homeBlocks(S);
    const total = B.reduce((a, b) => a + b.h, 0), max = Math.max(0, total - VIEW);
    if (!os.drag && Math.abs(this.vel) > 2) { this.scroll += this.vel * dt; this.vel *= Math.pow(0.04, dt); } else if (!os.drag) this.vel = 0;
    this.scroll = Math.max(0, Math.min(max, this.scroll));
    g.save(); g.beginPath(); g.rect(0, TOP, SW, VIEW); g.clip();
    let y = TOP - this.scroll; this.hits = [];
    for (const b of B) { if (y + b.h > TOP - 20 && y < BOT + 20) b.draw(y); if (b.hits) for (const [hx, hy, hw, hh, fn] of b.hits) if (fn) this.hits.push([hx, y + hy, hw, hh, fn]); y += b.h; }
    g.restore();
    if (max > 0) { const bh = Math.max(60, VIEW * VIEW / total), by = TOP + (VIEW - bh) * (this.scroll / max); this.rr(SW - 10, by, 5, bh, 3, 'rgba(0,0,0,.25)'); }
    // drag to scroll, tap to follow a link
    let lastMove = performance.now();
    os.dragArea(0, TOP, SW, VIEW, (px, py) => { for (let i = this.hits.length - 1; i >= 0; i--) { const [hx, hy, hw, hh, fn] = this.hits[i]; if (px >= hx && px <= hx + hw && py >= hy && py <= hy + hh && py >= TOP && py <= BOT) { fn(); os.dirty = true; return; } } },
      (dx, dy) => { const t = performance.now(), d = Math.max(8, t - lastMove) / 1000; lastMove = t; this.scroll -= dy; this.vel = -dy / d * 0.9; });
    // toolbar: back, address, home
    g.fillStyle = this.page ? (S.bg === '#141416' || S.bg === '#0b1d3a' ? '#202024' : '#e3e7ef') : '#e3e7ef'; g.fillRect(0, 56, SW, 92);
    const dark = this.page && (S.bg === '#141416' || S.bg === '#0b1d3a'), ic = dark ? '#c9cdd6' : '#5a6478';
    this.t('‹', 26, 122, 50, ic, 50, 'left', 400); os.hit(0, 60, 70, 84, () => this.back());
    this.rr(70, 74, 380, 56, 28, dark ? '#2e2e34' : '#fff'); this.t('🔒', 92, 111, 20, ic, 30, 'left', 400);
    this.t(this.page ? site(this.page).url : 'overpass.web', 122, 111, 24, dark ? '#eef' : '#2b3445', 310, 'left', 600);
    this.t('⌂', 490, 118, 40, ic, 50, 'center', 400); os.hit(456, 60, 84, 84, () => { if (this.page) { this.hist = []; this.open(null, false); } else os.home(); });
    // toast
    if (this.toastT > 0) { const a = Math.min(1, this.toastT * 3); g.globalAlpha = a; const h = this.paraH(this.toastMsg, 420, 22, 600) + 30; this.rr(40, BOT - h - 20, 460, h, 18, 'rgba(15,20,35,.92)'); this.para(this.toastMsg, SW / 2, BOT - h - 6, 420, 22, '#fff', 600, 1.3, 'center'); g.globalAlpha = 1; }
  }
  homeBlocks(S) {
    const B = [this.bGap(20)];
    B.push({ h: 140, draw: y => { this.t('Discover', 30, y + 50, 44, S.ink, 480, 'left', 900); this.t('Sites picked for you today', 30, y + 88, 22, S.sub, 480, 'left', 500);
      this.rr(30, y + 104, 480, 0, 0, '#000'); } });
    const w = 232, th = 150, ids = this.home4;
    B.push({ h: 2 * (th + 96), hits: ids.map((id, i) => [30 + (i % 2) * (w + 16), ((i / 2) | 0) * (th + 96), w, th + 80, () => this.open(id)]), draw: y => ids.forEach((id, i) => {
      const s = site(id), x = 30 + (i % 2) * (w + 16), yy = y + ((i / 2) | 0) * (th + 96);
      this.rr(x, yy, w, th + 80, 18, '#fff'); this.cover(this.img(id), x, yy, w, th, 18);
      this.t(s.name, x + 14, yy + th + 34, 22, S.ink, w - 24, 'left', 800); this.t(s.url, x + 14, yy + th + 62, 18, S.sub, w - 24, 'left', 500);
    }) });
    B.push(this.bBtn('Show me different sites ↻', '#3d7bff', () => { this.home4 = pick(SITES.map(s => s.id), 4, this.home4.length + 4 > SITES.length ? [] : this.home4); if (this.home4.length < 4) this.home4 = pick(SITES.map(s => s.id), 4); }));
    return B;
  }
}
