// In-car radio: plays songs you upload (kept on this device in IndexedDB) through the game's audio engine.
import { Audio } from './audio.js';

const DB = 'overpass-radio', ST = 'songs';
const openDb = () => new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('no idb'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = (db, mode, fn) => new Promise((res, rej) => { const t = db.transaction(ST, mode), s = t.objectStore(ST), q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const isAudio = f => (f.type && f.type.startsWith('audio/')) || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4)$/i.test(f.name || '');
const clean = n => (n || 'Track').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 80);

export const Radio = (() => {
  const el = document.createElement('audio'); el.preload = 'auto'; el.setAttribute('playsinline', '');
  let tracks = [], idx = -1, on = false, shuffle = false, vol = 0.85, src = null, db = null, persistOk = true, fails = 0;
  const subs = new Set(); const emit = () => subs.forEach(f => { try { f(); } catch { } });

  function graph() { // route the element through the game's audio graph so master volume applies
    if (src || !Audio.ready) return;
    try { src = Audio.ctx.createMediaElementSource(el); src.connect(Audio.radioBus()); Audio.setVolume('radio', vol); } catch { }
  }
  async function play(i) {
    if (!tracks.length) return;
    idx = (i + tracks.length) % tracks.length; el.src = tracks[idx].url; Audio.init(); graph();
    if (!src) el.volume = vol;
    try { await el.play(); on = true; fails = 0; Audio.duck(true); } catch { on = false; Audio.duck(false); }
    emit();
  }
  function pause() { el.pause(); on = false; Audio.duck(false); emit(); }
  const toggle = () => { if (!tracks.length) return false; if (on) pause(); else if (idx < 0 || !el.src) play(0); else { Audio.init(); graph(); el.play().then(() => { on = true; Audio.duck(true); emit(); }).catch(() => { }); } return true; };
  function next() { if (!tracks.length) return; play(shuffle && tracks.length > 1 ? (idx + 1 + Math.floor(Math.random() * (tracks.length - 1))) : idx + 1); }
  function prev() { if (!tracks.length) return; if (el.currentTime > 3) { el.currentTime = 0; return; } play(idx - 1); }
  el.addEventListener('ended', next);
  el.addEventListener('error', () => { if (++fails < tracks.length) next(); else pause(); });

  async function add(fileList) {
    const files = [...fileList].filter(isAudio); if (!files.length) return 0;
    const first = tracks.length;
    for (const f of files) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7), t = { id, name: clean(f.name), url: URL.createObjectURL(f), added: Date.now() };
      tracks.push(t);
      try { db = db || await openDb(); await tx(db, 'readwrite', s => s.put({ id, name: t.name, added: t.added, blob: f })); } catch { persistOk = false; }
    }
    emit(); if (!on) play(first); return files.length;
  }
  async function remove(id) {
    const i = tracks.findIndex(t => t.id === id); if (i < 0) return;
    const cur = i === idx; URL.revokeObjectURL(tracks[i].url); tracks.splice(i, 1);
    try { db = db || await openDb(); await tx(db, 'readwrite', s => s.delete(id)); } catch { }
    if (cur) { el.pause(); el.removeAttribute('src'); idx = -1; if (on && tracks.length) play(Math.min(i, tracks.length - 1)); else { on = false; Audio.duck(false); } } else if (i < idx) idx--;
    emit();
  }
  async function load() {
    try { db = await openDb(); const all = await tx(db, 'readonly', s => s.getAll()); (all || []).sort((a, b) => a.added - b.added).forEach(r => tracks.push({ id: r.id, name: r.name, added: r.added, url: URL.createObjectURL(r.blob) })); emit(); } catch { persistOk = false; }
  }
  return {
    load, add, remove, toggle, next, prev, play, pause,
    toggleShuffle() { shuffle = !shuffle; emit(); },
    setVolume(v) { vol = v; Audio.setVolume('radio', v); if (!src) el.volume = v; },
    get volume() { return vol; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    now() { const t = tracks[idx]; return { title: t ? t.name : '', on, idx, count: tracks.length, pos: el.currentTime || 0, dur: isFinite(el.duration) ? el.duration : 0, shuffle, persistOk }; },
    get tracks() { return tracks; },
  };
})();
