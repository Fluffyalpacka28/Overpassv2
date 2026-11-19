// Travel scrapbook: every city you drive through in World Drive gets a page, a polaroid of its Wikipedia photo, its name in
// handwriting, where it is, the day you first visited and how often you've been back. Saved on this device.
//   - which city you're in: OpenStreetMap's Nominatim (reverse lookup at city level), at most every 20 s and only after moving
//   - its picture and blurb: Wikipedia's page summary (from the place's own wikipedia tag when OSM has one)
const KEY = 'osm.scrapbook.v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flag = cc => cc && /^[a-z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export class Scrapbook {
  constructor(opts = {}) {
    this.o = opts; this.last = null; this.lastT = 0; this.busy = false; this.cur = null; this.el = null; this.open_ = false;
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); this.list = Array.isArray(v) ? v : []; } catch { this.list = []; }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { } }
  get count() { return this.list.length; }
  get countries() { return new Set(this.list.map(e => e.cc).filter(Boolean)).size; }
  // call every frame or so with where you are; it looks the city up now and then
  tick(lat, lon, now = performance.now()) {
    if (this.busy || !isFinite(lat) || !isFinite(lon)) return;
    const moved = !this.last || Math.hypot(lat - this.last[0], (lon - this.last[1]) * Math.cos(lat * Math.PI / 180)) > 0.012; // ~1.3 km
    if (!moved || now - this.lastT < 20000) return;
    this.lastT = now; this.last = [lat, lon]; this.lookup(lat, lon);
  }
  // when you start somewhere new, check straight away
  reset() { this.last = null; this.lastT = 0; this.cur = null; }
  async lookup(lat, lon) {
    this.busy = true;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&extratags=1&namedetails=1&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, { headers: { 'Accept-Language': 'en' } });
      if (!r.ok) return; const j = await r.json(); const a = j.address || {};
      const name = a.city || a.town || a.village || a.municipality || a.hamlet || (j.addresstype && /city|town|village|municipality/.test(j.addresstype) ? j.name : '') || a.county;
      if (!name) return;
      const region = a.state || a.region || a.province || a.county || '', country = a.country || '', cc = (a.country_code || '').toLowerCase();
      const key = `${name}|${region}|${cc}`.toLowerCase();
      if (this.cur === key) return; this.cur = key;
      let e = this.list.find(x => x.key === key);
      if (e) { e.visits = (e.visits || 1) + 1; e.lastT = Date.now(); this.save(); this.render(); return; }
      e = { key, name, region, country, cc, lat: +lat.toFixed(4), lon: +lon.toFixed(4), t: Date.now(), lastT: Date.now(), visits: 1, img: '', desc: '', url: '' };
      this.list.unshift(e); this.save();
      await this.picture(e, (j.extratags && j.extratags.wikipedia) || '');
      this.save(); this.render();
      this.o.onNew && this.o.onNew(e);
    } catch { } finally { this.busy = false; }
  }
  // the city's Wikipedia photo and a line or two about it
  async picture(e, tag) {
    const tries = [];
    if (tag && tag.includes(':')) { const [lang, ...t] = tag.split(':'); tries.push([lang, t.join(':')]); }
    tries.push(['en', e.region ? `${e.name}, ${e.region}` : e.name], ['en', e.name]);
    for (const [lang, title] of tries) {
      try {
        const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
        if (!r.ok) continue; const j = await r.json();
        if (j.type === 'disambiguation' || !(j.thumbnail || j.originalimage)) continue;
        e.img = (j.thumbnail && j.thumbnail.source || j.originalimage.source).replace(/\/\d+px-/, '/640px-');
        e.desc = (j.extract || '').slice(0, 320); e.url = (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || ''; return;
      } catch { }
    }
  }
  remove(key) { this.list = this.list.filter(e => e.key !== key); this.save(); this.render(); }
  // ---------- the book ----------
  ensure() {
    if (this.el) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (!document.querySelector('link[data-sb-font]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.sbFont = '1'; l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Special+Elite&display=swap'; document.head.appendChild(l); }
    const el = document.createElement('div'); el.className = 'sb-wrap'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Travel scrapbook');
    el.addEventListener('click', ev => {
      const t = ev.target;
      if (t.closest('[data-sb-close]') || t === el) { this.close(); return; }
      const del = t.closest('[data-sb-del]'); if (del) { ev.stopPropagation(); if (confirm(`Remove ${del.dataset.sbName} from your scrapbook?`)) this.remove(del.dataset.sbDel); return; }
      const card = t.closest('.sb-card'); if (card && !t.closest('a')) card.classList.toggle('flip');
    });
    el.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') this.close(); });
    document.body.appendChild(el); this.el = el;
  }
  open() { this.ensure(); this.el.hidden = false; this.open_ = true; this.render(); requestAnimationFrame(() => this.el.classList.add('in')); const b = this.el.querySelector('[data-sb-close]'); b && b.focus(); }
  close() { if (!this.el) return; this.el.classList.remove('in'); this.open_ = false; setTimeout(() => { if (!this.open_) this.el.hidden = true; }, 250); }
  render() {
    if (!this.el || !this.open_) return;
    const L = this.list, cards = L.map(e => {
      const k = hash(e.key), rot = (k - 0.5) * 7, tape = Math.floor(k * 4), tint = ['#f4d35e', '#9ad1d4', '#f7a6a6', '#b8e0a6'][tape];
      const pic = e.img ? `<img src="${esc(e.img)}" alt="${esc(e.name)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="sb-nopic"><span>${flag(e.cc) || '✦'}</span></div>`;
      return `<article class="sb-card" style="--r:${rot.toFixed(2)}deg;--tape:${tint}" tabindex="0">
        <div class="sb-inner">
          <div class="sb-front"><i class="sb-tape"></i><div class="sb-photo">${pic}${e.visits > 1 ? `<span class="sb-visits" aria-label="visited ${e.visits} times">${e.visits}×</span>` : ''}</div>
            <h3>${esc(e.name)}</h3><p class="sb-where">${flag(e.cc)} ${esc([e.region, e.country].filter(Boolean).join(', '))}</p>
            <p class="sb-stamp">${fmtDate(e.t)}</p></div>
          <div class="sb-back"><h3>${esc(e.name)}</h3><p class="sb-desc">${esc(e.desc || 'No Wikipedia page found for this one, but you were here.')}</p>
            <p class="sb-meta">First visit ${fmtDate(e.t)}<br>Last visit ${fmtDate(e.lastT || e.t)}<br>${e.lat}, ${e.lon}</p>
            <div class="sb-acts">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Read on Wikipedia</a>` : ''}<button data-sb-del="${esc(e.key)}" data-sb-name="${esc(e.name)}">Remove</button></div></div>
        </div></article>`;
    }).join('');
    this.el.innerHTML = `<div class="sb-book">
      <header><div><h2>My Road Trip</h2><p>${L.length ? `${L.length} ${L.length === 1 ? 'city' : 'cities'} · ${this.countries} ${this.countries === 1 ? 'country' : 'countries'}` : 'Every city you drive through lands here'}</p></div>
        <button class="sb-x" data-sb-close aria-label="Close scrapbook">✕</button></header>
      ${L.length ? `<div class="sb-grid">${cards}</div><p class="sb-foot">Tap a photo to turn it over. Photos and descriptions from Wikipedia; places from OpenStreetMap.</p>`
        : `<div class="sb-empty"><div class="sb-card sb-ghost" style="--r:-3deg;--tape:#f4d35e"><div class="sb-inner"><div class="sb-front"><i class="sb-tape"></i><div class="sb-photo"><div class="sb-nopic"><span>✈</span></div></div><h3>Your first stop</h3><p class="sb-where">Start World Drive and hit the road</p></div></div></div>
          <p>Drive into a town or city in World Drive and it gets its own page here, with a photo, the day you arrived and how many times you've been back.</p></div>`}
    </div>`;
  }
}

const CSS = `
.sb-wrap{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;background:rgba(10,8,20,.62);backdrop-filter:blur(4px);opacity:0;transition:opacity .25s;padding:16px;touch-action:auto;user-select:text;-webkit-user-select:text}
.sb-wrap.in{opacity:1}.sb-wrap[hidden]{display:none}
.sb-book{width:min(1100px,100%);max-height:100%;overflow:auto;border-radius:14px;padding:26px 28px 22px;color:#3b2f22;position:relative;
  background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.35),transparent 40%),repeating-linear-gradient(0deg,rgba(120,90,50,.035) 0 2px,transparent 2px 5px),linear-gradient(135deg,#efe2c6,#e6d3ad 55%,#dcc59a);
  box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 0 1px rgba(90,60,20,.25),inset 18px 0 30px -18px rgba(70,40,10,.45);transform:translateY(12px) scale(.98);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.sb-wrap.in .sb-book{transform:none}
.sb-book::before{content:"";position:absolute;left:14px;top:30px;bottom:30px;width:10px;background:repeating-linear-gradient(180deg,#7a5c3a 0 4px,transparent 4px 26px);border-radius:4px;opacity:.55}
.sb-book header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:0 0 18px 18px}
.sb-book h2{font:700 clamp(2.1rem,5vw,3rem)/1 Caveat,cursive;margin:0;color:#5a3b1c;letter-spacing:.01em}
.sb-book header p{font:400 .95rem/1.4 'Special Elite',ui-monospace,monospace;margin:6px 0 0;color:#6d5638}
.sb-x{width:42px;height:42px;border-radius:50%;border:0;background:#5a3b1c;color:#f5ead2;font-size:18px;cursor:pointer;flex:none;box-shadow:0 3px 8px rgba(0,0,0,.3)}
.sb-x:focus-visible,.sb-card:focus-visible{outline:3px solid #c2410c;outline-offset:3px}
.sb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:30px 24px;padding:8px 6px 8px 22px}
.sb-card{perspective:1000px;transform:rotate(var(--r));transition:transform .25s;cursor:pointer;outline:none}
.sb-card:hover{transform:rotate(0deg) translateY(-4px) scale(1.03);z-index:2}
.sb-inner{position:relative;transform-style:preserve-3d;transition:transform .6s cubic-bezier(.3,.7,.2,1);min-height:300px}
.sb-card.flip .sb-inner{transform:rotateY(180deg)}
.sb-front,.sb-back{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#fdfbf6;padding:12px 12px 14px;border-radius:3px;box-shadow:0 10px 22px rgba(60,35,10,.32),0 2px 4px rgba(60,35,10,.25)}
.sb-back{transform:rotateY(180deg);display:flex;flex-direction:column;background:#fffaf0 repeating-linear-gradient(0deg,transparent 0 23px,rgba(70,110,160,.18) 23px 24px)}
.sb-tape{position:absolute;top:-11px;left:50%;width:84px;height:24px;transform:translateX(-50%) rotate(-3deg);background:var(--tape);opacity:.78;box-shadow:0 1px 2px rgba(0,0,0,.12);clip-path:polygon(3% 0,97% 4%,100% 50%,96% 100%,4% 96%,0 50%)}
.sb-photo{position:relative;aspect-ratio:4/3;overflow:hidden;background:#d9cdb5;border:1px solid rgba(0,0,0,.06)}
.sb-photo img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.05) contrast(1.03) sepia(.08)}
.sb-nopic{width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#cdb994,#b59d74)}.sb-nopic span{font-size:3rem;opacity:.8}
.sb-front h3,.sb-back h3{font:700 1.9rem/1.05 Caveat,cursive;margin:10px 2px 2px;color:#2e2418;overflow-wrap:anywhere}
.sb-where{font:500 1.15rem/1.15 Caveat,cursive;margin:0 2px;color:#5d4a33}
.sb-stamp{display:inline-block;margin:8px 2px 0;padding:2px 8px;font:400 .72rem/1.5 'Special Elite',ui-monospace,monospace;color:#9b2c2c;border:1.5px solid rgba(155,44,44,.7);border-radius:4px;transform:rotate(-2deg);letter-spacing:.04em}
.sb-back p{font:400 .82rem/1.45 Georgia,serif;margin:6px 2px;color:#3b3125;overflow:auto}
.sb-back .sb-desc{flex:1 1 auto;min-height:0}
.sb-visits{position:absolute;right:8px;bottom:8px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:700 1.25rem/1 Caveat,cursive;color:#fff;background:rgba(155,44,44,.88);border:2px dashed rgba(255,255,255,.7);transform:rotate(-12deg);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.sb-stamp{white-space:nowrap}
.sb-back .sb-meta{font:400 .72rem/1.6 'Special Elite',ui-monospace,monospace;color:#6d5638;margin-top:auto}
.sb-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.sb-acts a,.sb-acts button{font:600 .8rem/1 system-ui,sans-serif;padding:8px 10px;border-radius:6px;border:1px solid #5a3b1c;background:#5a3b1c;color:#f5ead2;text-decoration:none;cursor:pointer}
.sb-acts button{background:transparent;color:#5a3b1c}
.sb-foot{font:400 .75rem/1.4 'Special Elite',ui-monospace,monospace;color:#7a6446;margin:18px 0 0 22px}
.sb-empty{display:grid;grid-template-columns:230px 1fr;gap:34px;align-items:center;padding:20px 10px 20px 30px}
.sb-empty>p{font:500 1.5rem/1.3 Caveat,cursive;color:#5d4a33;margin:0}
.sb-ghost{opacity:.85;cursor:default}
@media (max-width:640px){.sb-book{padding:18px 14px 16px}.sb-book::before{display:none}.sb-book header{margin-left:0}.sb-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:22px 14px;padding:6px 2px}.sb-inner{min-height:250px}.sb-empty{grid-template-columns:1fr;padding:10px}.sb-front h3,.sb-back h3{font-size:1.5rem}}
@media (prefers-reduced-motion:reduce){.sb-inner,.sb-card,.sb-book,.sb-wrap{transition:none}}
`;
