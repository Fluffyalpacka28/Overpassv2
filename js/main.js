import * as THREE from 'three';
import { Audio } from './audio.js';
import { Car, PAINTS, MODELS, setPaint, swapCarModel, nameTag } from './car.js';
import { THEMES, LEVELS, RIVAL_COLORS, trackPoints, Track, Race } from './story.js';
import { World } from './world.js';
import { Net } from './net.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = t => { if (!isFinite(t) || t <= 0) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const touchDevice = matchMedia('(pointer:coarse)').matches;

// ---------- settings & progress (in-memory only) ----------
const S = { model: 0, pic: '', paint: 0, music: true, master: 0.8, musicVol: 0.55, sfx: 0.8, units: 'kmh', cam: 0, quality: touchDevice ? 'low' : 'high', unlockAll: false, name: '' };
const progress = { unlocked: 1, best: {} };
// car model + driver picture are remembered between visits (guarded: storage may be blocked)
const PREF_KEY = 'overpass.prefs.v1';
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (Number.isInteger(p.model) && p.model >= 0 && p.model < MODELS.length) S.model = p.model; if (typeof p.pic === 'string' && /^data:image\//.test(p.pic) && p.pic.length < 24000) S.pic = p.pic; } catch { }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ model: S.model, pic: S.pic })); } catch { } }
const WORLD_ENV = { sky: ['#3a5fae', '#ffcf9e'], fog: '#f0cfae', ground: '#8fae78', sun: '#fff0d8', hemi: ['#fff3e0', '#5d6b4a'], light: 1.75 };
const PRESETS = [
  { name: 'Burlington, VT', lat: 44.4776, lon: -73.2121 }, { name: 'New York', lat: 40.7580, lon: -73.9855 },
  { name: 'Paris', lat: 48.8606, lon: 2.3376 }, { name: 'Tokyo', lat: 35.6595, lon: 139.7005 },
  { name: 'London', lat: 51.5079, lon: -0.1281 }, { name: 'San Francisco', lat: 37.7946, lon: -122.3999 },
  { name: 'Rome', lat: 41.8986, lon: 12.4769 }, { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
];
let chosenLoc = { ...PRESETS[0] };

// ---------- renderer / scene ----------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
const hemi = new THREE.HemisphereLight('#fff', '#444', 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff', 1.6); sun.castShadow = true; scene.add(sun, sun.target);
const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 300; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.,1.); vec3 c = mix(bottom, top, pow(h,0.7)); gl_FragColor = vec4(c,1.); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 24, 12), skyMat); sky.renderOrder = -1; scene.add(sky);
scene.fog = new THREE.Fog('#fff', 150, 900);
const groundMat = new THREE.MeshStandardMaterial({ color: '#5f8a4e', roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

function applyEnv(th, fogNear, fogFar) {
  skyMat.uniforms.top.value.set(th.sky[0]); skyMat.uniforms.bottom.value.set(th.fog);
  scene.fog.color.set(th.fog); scene.fog.near = fogNear; scene.fog.far = fogFar;
  groundMat.color.set(th.ground); hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.night ? 0.75 : 0.95;
  sun.color.set(th.sun); sun.intensity = th.light; renderer.setClearColor(th.fog);
}
function applyQuality() {
  const hi = S.quality === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1.25));
  renderer.shadowMap.enabled = true; sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize();
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- game objects ----------
const player = new Car(PAINTS[S.paint].color, S.model); scene.add(player.mesh);
player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
const world = new World(scene, renderer); world.setVisible(false);
const net = new Net();
let mode = 'menu', paused = false, track = null, race = null, level = null, attract = null;
let camShake = 0, camAngle = 0, finishTimer = 0, lastCount = -1, goTimer = 0;
const W = { spawning: false, spawnT: 0, score: 0, dist: 0, orbs: [], streetT: 0, street: '', remotes: new Map(), combo: 0, comboT: 0, wetT: 0, destroyed: false, destroyT: 0 };
const BRIDGE_COST = 500;
const BRIDGE_LEN = 30;

// ---------- screens ----------
function show(id) {
  $$('[data-screen]').forEach(s => s.hidden = s.id !== 's-' + id);
  if (id === 'levels') buildLevels();
  if (id === 'mp') $('#mpName').value = S.name;
  screen = id;
}
let screen = 'menu';
$$('[data-go]').forEach(b => b.addEventListener('click', () => { Audio.click(); show(b.dataset.go); }));

// ---------- toasts / messages ----------
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), ms); }
let msgTimer = 0;
function hudMsg(text, ms = 1600) { const m = $('#hMsg'); m.textContent = text; m.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), ms); }

// ---------- garage / settings / controls (rendered in menu + pause) ----------
function loadPhoto(file) {
  if (!file || !/^image\//.test(file.type)) { toast('Please choose an image file'); return; }
  const fr = new FileReader();
  fr.onerror = () => toast('Could not read that file');
  fr.onload = () => {
    const im = new Image();
    im.onerror = () => toast('Could not read that image');
    im.onload = () => {
      const n = 96, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), s = Math.min(im.width, im.height);
      x.fillStyle = '#181530'; x.fillRect(0, 0, n, n); x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, n, n);
      S.pic = c.toDataURL('image/jpeg', 0.8); savePrefs(); if (net.me) net.me.pic = S.pic; net.sendPic(); renderGarage(); updateDriverChip(); toast('Driver photo updated');
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function updateDriverChip() {
  const c = $('#hDrv'); if (!c) return;
  c.hidden = !S.pic; if (S.pic) { c.querySelector('img').src = S.pic; c.querySelector('span').textContent = S.name || 'Driver'; }
}
function renderGarage() {
  $$('[data-garage]').forEach(el => {
    el.innerHTML = `<div class="swatches">${PAINTS.map((p, i) => `<button class="swatch ${i === S.paint ? 'on' : ''}" data-paint="${i}"><i style="background:${p.color}"></i>${p.name}</button>`).join('')}</div>
      <h4 class="gh">Car model</h4>
      <div class="models">${MODELS.map((m, i) => `<button class="model ${i === S.model ? 'on' : ''}" data-model="${i}"><b>${m.name}</b><small>${m.blurb}</small></button>`).join('')}</div>
      <h4 class="gh">Driver photo</h4>
      <div class="driver">${S.pic ? `<img class="pic" src="${S.pic}" alt="Your driver photo">` : '<div class="pic empty">No photo</div>'}
        <div class="driver-btns"><button class="ghost sm" data-pickpic>${S.pic ? 'Change photo' : 'Upload photo'}</button>${S.pic ? '<button class="ghost sm" data-rmpic>Remove</button>' : ''}<input type="file" accept="image/*" hidden data-picfile></div></div>
      <p class="note">Shown on your HUD, race results, and to friends in multiplayer. Stored on this device only.</p>`;
    el.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { S.paint = +b.dataset.paint; setPaint(player.mesh, PAINTS[S.paint].color); Audio.click(); renderGarage(); if (net.me) net.me.color = PAINTS[S.paint].color; });
    el.querySelectorAll('[data-model]').forEach(b => b.onclick = () => { S.model = +b.dataset.model; swapCarModel(player, S.model, PAINTS[S.paint].color); savePrefs(); Audio.click(); renderGarage(); if (net.me) net.me.model = S.model; });
    const file = el.querySelector('[data-picfile]');
    el.querySelector('[data-pickpic]').onclick = () => file.click();
    file.onchange = () => { loadPhoto(file.files[0]); file.value = ''; };
    const rm = el.querySelector('[data-rmpic]'); if (rm) rm.onclick = () => { S.pic = ''; savePrefs(); if (net.me) net.me.pic = ''; renderGarage(); updateDriverChip(); };
  });
}
function renderSettings() {
  const tog = (k, label) => `<div class="set"><label>${label}</label><button class="toggle" data-tog="${k}" aria-pressed="${!!S[k]}" aria-label="${label}"></button></div>`;
  const rng = (k, label) => `<div class="set"><label>${label}</label><input type="range" min="0" max="1" step="0.05" value="${S[k]}" data-rng="${k}" aria-label="${label}"></div>`;
  const seg = (k, label, opts) => `<div class="set"><label>${label}</label><div class="seg">${opts.map(([v, t]) => `<button data-seg="${k}" data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
  $$('[data-settings]').forEach(el => {
    el.innerHTML = tog('music', 'Music') + rng('master', 'Master volume') + rng('musicVol', 'Music volume') + rng('sfx', 'Effects volume')
      + seg('units', 'Speed units', [['kmh', 'km/h'], ['mph', 'mph']]) + seg('cam', 'Camera', [[0, 'Chase'], [1, 'Far'], [2, 'Hood']])
      + seg('quality', 'Graphics', [['low', 'Fast'], ['high', 'Pretty']]) + tog('unlockAll', 'Unlock all story races');
    el.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { const k = b.dataset.tog; S[k] = !S[k]; if (k === 'music') { Audio.init(); Audio.setMusic(S.music); } Audio.click(); renderSettings(); });
    el.querySelectorAll('[data-rng]').forEach(r => r.oninput = () => { const k = r.dataset.rng; S[k] = +r.value; Audio.setVolume(k === 'musicVol' ? 'music' : k, S[k]); });
    el.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { const k = b.dataset.seg; S[k] = typeof S[k] === 'number' ? +b.dataset.v : b.dataset.v; if (k === 'quality') applyQuality(); $('#hUnit').textContent = S.units === 'kmh' ? 'km/h' : 'mph'; Audio.click(); renderSettings(); });
  });
}
function renderControls() {
  const html = `<div class="keys">
    <span><kbd>W</kbd><kbd>↑</kbd></span><span>Accelerate</span>
    <span><kbd>S</kbd><kbd>↓</kbd></span><span>Brake / reverse</span>
    <span><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></span><span>Steer</span>
    <span><kbd>Space</kbd></span><span>Handbrake — drift</span>
    <span><kbd>Shift</kbd></span><span>Boost (refills over time and from orbs in World Drive)</span>
    <span><kbd>C</kbd></span><span>Change camera</span>
    <span><kbd>R</kbd></span><span>Reset car onto the road</span>
    <span><kbd>B</kbd></span><span>Build bridge (World Drive · costs ${BRIDGE_COST} score)</span>
    <span><kbd>M</kbd></span><span>Open the map</span>
    <span><kbd>Esc</kbd><kbd>Tab</kbd></span><span>Game menu</span>
  </div><p class="note">Driving into mapped water wrecks the car. Collect orbs for score, then press <kbd>B</kbd> to build a bridge over water.</p>`;
  $$('[data-controls]').forEach(el => el.innerHTML = html);
}

// ---------- location picker ----------
function renderLocPickers() {
  $$('[data-locpick]').forEach(el => {
    if (!el.dataset.built) {
      el.dataset.built = 1;
      el.innerHTML = `<div class="row"><div class="search"><input type="search" placeholder="Search a city, street or landmark" aria-label="Search location"></div><button class="ghost sm geo">Use my location</button></div><div class="results"></div><div class="chips"></div><p class="chosen"></p>`;
      const inp = el.querySelector('input'), res = el.querySelector('.results'); let tmr;
      const search = async () => {
        const q = inp.value.trim(); if (q.length < 3) { res.innerHTML = ''; return; }
        try {
          const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } });
          const j = await r.json(); res.innerHTML = '';
          if (!j.length) res.innerHTML = '<p class="sub">No places found.</p>';
          j.forEach(p => { const b = document.createElement('button'); b.textContent = p.display_name; b.onclick = () => { setLoc({ name: p.display_name.split(',').slice(0, 2).join(','), lat: +p.lat, lon: +p.lon }); res.innerHTML = ''; inp.value = ''; }; res.append(b); });
        } catch { res.innerHTML = '<p class="sub">Search is unavailable right now.</p>'; }
      };
      inp.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(search, 650); });
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { clearTimeout(tmr); search(); } });
      el.querySelector('.geo').onclick = () => {
        if (!navigator.geolocation) return toast('Location is not available in this browser');
        toast('Finding your location…');
        navigator.geolocation.getCurrentPosition(p => setLoc({ name: 'My location', lat: p.coords.latitude, lon: p.coords.longitude }), () => toast('Location permission was blocked — pick a city or search instead'), { timeout: 9000, maximumAge: 60000 });
      };
    }
    el.querySelector('.chips').innerHTML = PRESETS.map((p, i) => `<button data-pre="${i}" class="${p.name === chosenLoc.name ? 'on' : ''}">${p.name}</button>`).join('');
    el.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => setLoc({ ...PRESETS[+b.dataset.pre] }));
    el.querySelector('.chosen').innerHTML = `Starting point: <b>${escapeHtml(chosenLoc.name)}</b> · ${chosenLoc.lat.toFixed(4)}, ${chosenLoc.lon.toFixed(4)}`;
  });
}
function setLoc(l) { chosenLoc = l; Audio.click(); renderLocPickers(); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- level select ----------
function thumb(cv, lv, locked) {
  const th = THEMES[lv.theme], x = cv.getContext('2d'), w = cv.width, h = cv.height;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.fog); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const pts = new THREE.CatmullRomCurve3(trackPoints(lv), true, 'centripetal').getPoints(160);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  const s = Math.min((w - 50) / (x1 - x0), (h - 40) / (z1 - z0)), ox = w / 2 - (x0 + x1) / 2 * s, oz = h / 2 - (z0 + z1) / 2 * s;
  x.lineJoin = 'round'; x.lineCap = 'round';
  const path = () => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(ox + p.x * s, oz + p.z * s) : x.moveTo(ox + p.x * s, oz + p.z * s)); x.closePath(); };
  path(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 14; x.stroke();
  path(); x.strokeStyle = th.night ? '#ff5ad8' : '#fff'; x.lineWidth = 6; x.stroke();
  path(); x.strokeStyle = '#2b2838'; x.lineWidth = 3; x.stroke();
  const p0 = pts[0]; x.fillStyle = '#ff5a3c'; x.beginPath(); x.arc(ox + p0.x * s, oz + p0.z * s, 6, 0, 7); x.fill();
}
function buildLevels() {
  const unlocked = S.unlockAll ? LEVELS.length : progress.unlocked;
  $('#prog').textContent = `${Math.min(unlocked, LEVELS.length)} of ${LEVELS.length} races unlocked`;
  const grid = $('#levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const locked = i >= unlocked, best = progress.best[i];
    const b = document.createElement('button'); b.className = 'lvl' + (locked ? ' locked' : ''); b.disabled = locked;
    b.innerHTML = `<canvas width="320" height="200"></canvas>${locked ? '<div class="lock">LOCKED</div>' : ''}${best ? `<span class="medal" style="color:${best.place === 1 ? 'var(--gold)' : '#fff'}">P${best.place}</span>` : ''}<div class="info"><div class="num">CHAPTER ${i + 1}</div><h4>${lv.name}</h4><p class="sub">${lv.place} · ${lv.laps} laps · ${lv.rivals + 1} cars</p></div>`;
    thumb(b.querySelector('canvas'), lv, locked);
    b.onclick = () => { Audio.click(); openBrief(i); };
    grid.append(b);
  });
}
function openBrief(i) {
  level = LEVELS[i];
  $('#bChapter').textContent = `Chapter ${i + 1} of ${LEVELS.length}`; $('#bName').textContent = level.name; $('#bPlace').textContent = level.place;
  $('#bStory').textContent = level.story;
  const goal = level.goal === 1 ? '1st place' : 'Top 3';
  $('#bStats').innerHTML = `<div><small>Laps</small><b>${level.laps}</b></div><div><small>Rivals</small><b>${level.rivals}</b></div><div><small>Goal</small><b>${goal}</b></div>`;
  show('brief');
}
$('#bStart').onclick = () => { Audio.init(); Audio.setMusic(S.music); startStory(level); };

// ---------- mode management ----------
function clearMode() {
  if (race) { race.dispose(); race = null; }
  if (attract) { attract.dispose(); attract = null; }
  if (track) { track.dispose(scene); track = null; }
  world.setVisible(false); world.clear();
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  for (const r of W.remotes.values()) scene.remove(r.car.mesh); W.remotes.clear();
  if (!player.mesh.parent) scene.add(player.mesh);
  ground.visible = true; paused = false; $('#pause').hidden = true;
}
function startMenu() {
  clearMode(); mode = 'menu';
  if (net.active) net.leave();
  const lv = LEVELS[0]; track = new Track(lv, scene); applyEnv(track.theme, 150, 900);
  attract = new Race(track, { ...lv, rivals: 2, laps: 99, skill: 0.85 }, player, scene);
  attract.started = true; attract.countdown = 0; attract.player.ai = true; attract.player.lane = 0; attract.player.skill = 0.8;
  player.maxSpeed = 40; attract.onHit = null;
  $('#hud').hidden = true; show('menu');
}
function startStory(lv) {
  clearMode(); mode = 'story'; level = lv; player.maxSpeed = 52; player.boost = 1;
  track = new Track(lv, scene); applyEnv(track.theme, track.theme.night ? 120 : 160, track.theme.night ? 600 : 900);
  race = new Race(track, lv, player, scene);
  race.racers.forEach(r => r.car.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }));
  race.onHit = p => { Audio.thud(p / 8); camShake = Math.min(0.6, p * 0.03); };
  race.onLap = r => { Audio.chime(2); const left = lv.laps - r.lap; if (left === 1) hudMsg('FINAL LAP'); else if (left > 1) hudMsg(`LAP ${r.lap + 1}`); toast(`Lap ${r.lap} · ${fmt(r.lastLap)}`); };
  finishTimer = 0; lastCount = -1; goTimer = 0;
  setHud('story'); show('none');
  const f = [Math.sin(player.yaw), Math.cos(player.yaw)];
  camera.position.set(player.x + f[0] * 18 + 10, 9, player.z + f[1] * 18);
}
function startWorld(lat, lon, name = '') {
  clearMode(); mode = 'world'; player.maxSpeed = 46; player.boost = 1;
  applyEnv(WORLD_ENV, 140, 620); ground.visible = false;
  world.setVisible(true); world.setOrigin(lat, lon); W.originName = name;
  W.score = 0; W.dist = 0; W.combo = 0; W.wetT = 0; W.destroyed = false; W.destroyT = 0;
  player.mesh.visible = true;
  setHud('world'); beginSpawn(); show('none');
}
function beginSpawn() {
  W.spawning = true; W.spawnT = 0; player.place(0, 0, 0); player.vx = player.vz = 0;
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  $('#wLoading').hidden = false; $('#wLoadTxt').textContent = 'Loading streets from OpenStreetMap…';
  camera.position.set(30, 60, 30);
}
world.onStatus = s => { if (W.spawning && s) $('#wLoadTxt').textContent = s; };
function setHud(kind) {
  $('#hud').hidden = false; $('#hud').classList.toggle('hud-world', kind === 'world');
  $('#hPos').hidden = $('#hLap').hidden = kind !== 'story';
  $('#hScore').hidden = $('#hDist').hidden = $('#hStreet').hidden = kind !== 'world';
  $('#wrong').hidden = true; $('#wLoading').hidden = true; $('#countdown').textContent = '';
  $('#hUnit').textContent = S.units === 'kmh' ? 'km/h' : 'mph';
  updateMpBadge(); updateDriverChip();
}

// ---------- results ----------
function showResults() {
  const r = race.player, place = r.place || r.pos || race.racers.length, goal = level.goal || 3, won = place <= goal, idx = level.id;
  const prev = progress.best[idx]; if (!prev || place < prev.place || (place === prev.place && r.finishTime < prev.time)) progress.best[idx] = { place, time: r.finishTime };
  if (won && progress.unlocked < idx + 2) progress.unlocked = Math.min(LEVELS.length, idx + 2);
  const last = idx === LEVELS.length - 1;
  $('#rEyebrow').textContent = `${level.name} · ${level.place}`;
  $('#rTitle').textContent = won ? (last ? 'Champion of the Northline' : place === 1 ? 'Victory' : `Podium — P${place}`) : `P${place} — not enough`;
  $('#rSub').textContent = won ? (last ? 'Vesper pulls up beside you, nods once, and tosses you her keys. The crew is yours now. World Drive is waiting — go see the planet.' : 'Ezra is already loading the trailer. Next stop is waiting.') : `You need ${goal === 1 ? 'first place' : 'a top-3 finish'} to move on. Best lap ${fmt(r.bestLap)}.`;
  const rows = race.ranked.map((o, i) => `<li class="${o === r ? 'me' : ''}"><span class="p">${i + 1}</span><i class="dot" style="background:${o.car.mesh.userData.paint.color.getStyle()}"></i>${o === r && S.pic ? '<img class="av" src="' + S.pic + '" alt="">' : ''}<span class="n">${o.name}</span><span class="t">${o.finished ? fmt(o.finishTime) : 'running'}</span></li>`).join('');
  $('#rTable').innerHTML = rows;
  $('#rNext').hidden = !won || last; $('#rNext').textContent = 'Next race';
  $('#hud').hidden = true; show('results');
  won ? Audio.chime(5) : Audio.beep(false);
}
$('#rRetry').onclick = () => startStory(level);
$('#rLevels').onclick = () => { startMenu(); show('levels'); };
$('#rNext').onclick = () => { startMenu(); openBrief(level.id + 1); };

// ---------- world: orbs, remotes ----------
const orbGeo = new THREE.OctahedronGeometry(1, 0), orbMat = new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: '#ff9a2a', emissiveIntensity: 1.4, flatShading: true });
const ringGeo = new THREE.TorusGeometry(1.7, 0.08, 6, 24), ringMat = new THREE.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0.7 });
function updateOrbs(dt, t) {
  for (let i = W.orbs.length - 1; i >= 0; i--) {
    const o = W.orbs[i]; o.mesh.position.y = 1.6 + Math.sin(t * 2 + o.ph) * 0.3; o.mesh.rotation.y += dt * 1.6;
    const d = Math.hypot(o.x - player.x, o.z - player.z);
    if (d < 3.6) {
      scene.remove(o.mesh); W.orbs.splice(i, 1);
      W.combo = W.comboT > 0 ? W.combo + 1 : 1; W.comboT = 6; const pts = 100 * W.combo; W.score += pts;
      player.boost = Math.min(1, player.boost + 0.3); Audio.chime(Math.min(12, W.combo * 2)); hudMsg(W.combo > 1 ? `+${pts}  ×${W.combo}` : `+${pts}`, 900);
    } else if (d > 420) { scene.remove(o.mesh); W.orbs.splice(i, 1); }
  }
  W.comboT -= dt;
  if (W.orbs.length < 14 && Math.random() < dt * 3) {
    const [p] = world.randomRoadPoints(player.x, player.z, 260, 1);
    if (p && !W.orbs.some(o => Math.hypot(o.x - p[0], o.z - p[1]) < 30)) {
      const m = new THREE.Group(); m.add(new THREE.Mesh(orbGeo, orbMat)); const ring = new THREE.Mesh(ringGeo, ringMat); m.add(ring);
      m.position.set(p[0], 1.6, p[1]); scene.add(m); W.orbs.push({ x: p[0], z: p[1], mesh: m, ph: Math.random() * 6 });
    }
  }
}
function updateRemotes(dt) {
  if (!world.lat0) return;
  for (const [id, pl] of net.players) {
    if (pl.lat == null) continue;
    let r = W.remotes.get(id);
    if (!r) {
      const c = new Car(pl.color, pl.model | 0); c.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); const pic0 = net.pics.get(id), tag = nameTag(pl.name, pl.color, pic0); c.mesh.add(tag); scene.add(c.mesh);
      const [x, z] = world.proj(pl.lat, pl.lon); r = { car: c, x, z, yaw: pl.yaw, color: pl.color, model: pl.model | 0, pic: pic0, tag }; W.remotes.set(id, r); c.place(x, z, pl.yaw);
    }
    if (r.color !== pl.color) { setPaint(r.car.mesh, pl.color); r.color = pl.color; }
    if ((pl.model | 0) !== r.model) { swapCarModel(r.car, pl.model | 0, r.color); r.model = pl.model | 0; }
    const pp = net.pics.get(id); if (pp !== r.pic) { r.pic = pp; r.car.mesh.remove(r.tag); r.tag = nameTag(pl.name, r.color, pp); r.car.mesh.add(r.tag); }
    const [tx, tz] = world.proj(pl.lat, pl.lon), age = (performance.now() - pl.t) / 1000;
    const f = [Math.sin(pl.yaw), Math.cos(pl.yaw)], ex = tx + f[0] * pl.speed * Math.min(age, 0.25), ez = tz + f[1] * pl.speed * Math.min(age, 0.25);
    const k = 1 - Math.exp(-dt * 10);
    if (Math.hypot(ex - r.x, ez - r.z) > 60) { r.x = ex; r.z = ez; } else { r.x += (ex - r.x) * k; r.z += (ez - r.z) * k; }
    let dy = pl.yaw - r.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; r.yaw += dy * k;
    r.car.x = r.x; r.car.z = r.z; r.car.yaw = r.yaw; r.car.sync(dt, pl.speed, 0);
    // soft collision with player
    const dx = player.x - r.x, dz = player.z - r.z, d = Math.hypot(dx, dz);
    if (mode === 'world' && !paused && d < 3 && d > 0.01) { const nx = dx / d, nz = dz / d; player.x += nx * (3 - d); player.z += nz * (3 - d); const hit = player.bump(nx, nz, 0.3); if (hit > 3) { Audio.thud(hit / 8); camShake = 0.3; } player.sync(0); }
  }
  for (const [id, r] of W.remotes) if (!net.players.has(id)) { scene.remove(r.car.mesh); W.remotes.delete(id); }
}
function tileReadyAt(x, z) { const t = world.tiles.get(Math.floor(x / 320) + ',' + Math.floor(z / 320)); return t && t.state === 'ready'; }

// ---------- input ----------
const keys = {}; const touchKeys = {};
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (mode === 'menu') return;
  if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyP') { paused ? resume() : openPause(); }
  if (e.code === 'KeyM') { paused ? resume() : openPause('map'); }
  if (paused) return;
  if (e.code === 'KeyC') { S.cam = (S.cam + 1) % 3; renderSettings(); hudMsg(['CHASE CAM', 'FAR CAM', 'HOOD CAM'][S.cam], 900); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyB') tryBuildBridge();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if ((mode === 'story' || mode === 'world') && !paused && !$('#hud').hidden) openPause(); });
$$('#touch [data-k]').forEach(b => {
  const on = e => { e.preventDefault(); touchKeys[b.dataset.k] = true; b.classList.add('on'); Audio.init(); };
  const off = e => { e.preventDefault(); touchKeys[b.dataset.k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
function readInput() {
  const k = keys, t = touchKeys;
  const left = k.KeyA || k.ArrowLeft || t.left, right = k.KeyD || k.ArrowRight || t.right;
  player.input.throttle = (k.KeyW || k.ArrowUp || t.gas) ? 1 : 0;
  player.input.brake = (k.KeyS || k.ArrowDown || t.brake) ? 1 : 0;
  player.input.steer = (left ? 1 : 0) - (right ? 1 : 0); // + = left
  player.input.handbrake = !!(k.Space || t.hand);
  player.input.boost = !!(k.ShiftLeft || k.ShiftRight || t.boost);
}
function resetCar() {
  if (mode === 'story' && race) { race.resetPlayer(); hudMsg('RESET', 700); }
  if (mode === 'world' && !W.spawning) {
    const p = world.nearestRoadPoint(player.x, player.z, 300);
    if (p) player.place(p.x, p.z, p.yaw); else player.place(player.x, player.z, player.yaw);
    W.destroyed = false; W.destroyT = 0; W.wetT = 0;
    player.mesh.visible = true;
    hudMsg('RESET', 700);
  }
}
function tryBuildBridge() {
  if (mode !== 'world' || W.spawning || paused || W.destroyed) return;
  if (W.score < BRIDGE_COST) {
    hudMsg(`NEED ${BRIDGE_COST} SCORE (have ${W.score})`, 1600);
    Audio.beep(false);
    return;
  }
  // Place bridge starting a bit in front of the car so you don't spawn inside the pier
  const f = player.fwd;
  const sx = player.x + f[0] * 4, sz = player.z + f[1] * 4;
  const rec = world.placeBridge(sx, sz, player.yaw, BRIDGE_LEN, 8);
  if (!rec) { toast('Could not place bridge'); return; }
  W.score -= BRIDGE_COST;
  Audio.chime(4);
  hudMsg(`BRIDGE BUILT  −${BRIDGE_COST}`, 1600);
  toast(`Bridge placed · ${W.score} score left`);
}
function destroyInWater() {
  if (W.destroyed) return;
  W.destroyed = true; W.destroyT = 0;
  player.vx = 0; player.vz = 0;
  player.input.throttle = 0; player.input.boost = false;
  Audio.thud(3);
  camShake = 0.8;
  const penalty = Math.min(W.score, 150);
  W.score -= penalty;
  W.combo = 0;
  hudMsg(penalty ? `SUNK  −${penalty}` : 'SUNK', 2200);
  // splash-ish: hide car briefly, then respawn on nearest road
  player.mesh.visible = false;
}
function updateWaterHazard(dt) {
  if (mode !== 'world' || W.spawning || paused) return;
  if (W.destroyed) {
    W.destroyT += dt;
    if (W.destroyT > 1.4) {
      const p = world.nearestRoadPoint(player.x, player.z, 500);
      if (p) player.place(p.x, p.z, p.yaw);
      else player.place(player.x, player.z, player.yaw);
      player.mesh.visible = true;
      W.destroyed = false; W.destroyT = 0; W.wetT = 0;
      hudMsg('RESPAWNED', 900);
    }
    return;
  }
  if (world.inWater(player.x, player.z)) {
    W.wetT += dt;
    destroyInWater(); // water is fatal on contact
  } else {
    W.wetT = Math.max(0, W.wetT - dt * 2);
  }
}
document.addEventListener('pointerdown', () => { if (!Audio.ready) { Audio.init(); Audio.setVolume('master', S.master); Audio.setVolume('music', S.musicVol); Audio.setVolume('sfx', S.sfx); Audio.setMusic(S.music); } }, { capture: true });

// ---------- world setup / multiplayer setup ----------
$('#touchBridge').addEventListener('click', e => { e.preventDefault(); tryBuildBridge(); });
$('#wGo').onclick = () => { Audio.init(); startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name); };
function myInfo() { return { name: (S.name || 'Driver').slice(0, 16), color: PAINTS[S.paint].color, model: S.model, pic: S.pic }; }
function curLatLon() { if (mode === 'world' && world.lat0 != null && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); return { lat: la, lon: lo }; } return { lat: chosenLoc.lat, lon: chosenLoc.lon }; }
net.originFn = curLatLon;
$('#mpName').addEventListener('input', e => S.name = e.target.value.trim());
async function doHost(statusEl, startAtChosen = true) {
  statusEl.className = 'status'; statusEl.textContent = 'Opening session…';
  try {
    const code = await net.hostGame(myInfo(), curLatLon());
    statusEl.textContent = 'Hosting · code ' + code;
    if (startAtChosen) startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name);
    toast(`Session open — share code ${code}`, 5000); updateMpBadge(); renderMpTab();
  } catch (e) { statusEl.className = 'status err'; statusEl.textContent = 'Could not host: ' + (e.message || e.type || e); }
}
async function doJoin(code, statusEl) {
  if (!code || code.trim().length < 4) { statusEl.className = 'status err'; statusEl.textContent = 'Enter the 6-character code from the host.'; return; }
  statusEl.className = 'status'; statusEl.textContent = 'Connecting through STUN…';
  try {
    const w = await net.joinGame(code, myInfo());
    statusEl.textContent = 'Connected';
    const o = w.origin || chosenLoc; startWorld(o.lat, o.lon, 'Host location');
    toast('Joined session ' + net.code, 3500); updateMpBadge(); renderMpTab();
  } catch (e) { statusEl.className = 'status err'; statusEl.textContent = e.message || String(e); }
}
$('#mpHost').onclick = () => { Audio.init(); S.name = $('#mpName').value.trim(); doHost($('#mpStatus')); };
$('#mpJoin').onclick = () => { Audio.init(); S.name = $('#mpName').value.trim(); doJoin($('#mpCode').value, $('#mpStatus')); };
$('#mpCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#mpJoin').click(); });
net.onEvent = (type, data) => {
  if (type === 'join') { toast(`${data} joined`); Audio.chime(4); }
  if (type === 'leave') toast(`${data} left`);
  if (type === 'hostleft') toast('The host ended the session — you can keep driving solo', 4000);
  if (type === 'error') toast(String(data), 4000);
  updateMpBadge(); if (!$('#pause').hidden) renderMpTab();
};
function updateMpBadge() { const b = $('#hMp'); b.hidden = !net.active; if (net.active) b.textContent = `${net.role === 'host' ? 'HOST' : 'GUEST'} · ${net.code} · ${net.count} online`; }

// ---------- pause panel ----------
let tab = 'map', leaf = null, leafMe = null, leafOthers = new Map(), leafTrack = null, leafTimer = 0;
function openPause(t = tab) {
  if (mode !== 'story' && mode !== 'world') return;
  paused = true; $('#pause').hidden = false; Audio.click();
  $('#pnav [data-tab=loc]').disabled = mode !== 'world';
  $('#pnav [data-tab=restart]').textContent = mode === 'story' ? 'Restart race' : 'Respawn';
  for (const k in keys) keys[k] = false;
  selectTab(t === 'loc' && mode !== 'world' ? 'map' : t);
}
function resume() { paused = false; $('#pause').hidden = true; Audio.click(); }
function selectTab(t) {
  if (t === 'resume') return resume();
  if (t === 'restart') { resume(); if (mode === 'story') startStory(level); else { player.place(0, 0, 0); beginSpawn(); } return; }
  if (t === 'quit') { startMenu(); return; }
  tab = t;
  $$('#pnav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.pbody [data-pane]').forEach(p => p.hidden = p.dataset.pane !== t);
  if (t === 'map') openMap();
  if (t === 'mp') renderMpTab();
  if (t === 'loc') { renderLocPickers(); $('#locSub').textContent = 'Jump anywhere on Earth. Streets load as you drive.'; }
}
$$('#pnav [data-tab]').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
$('#pauseBtn').onclick = () => openPause();
$('#pause').addEventListener('pointerdown', e => { if (e.target.id === 'pause') resume(); });
$('#pTeleport').onclick = () => { teleport(chosenLoc.lat, chosenLoc.lon, chosenLoc.name); };
function teleport(lat, lon, name) { resume(); startWorld(lat, lon, name); toast('Teleported to ' + (name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`)); }

function storyToLatLon(x, z) { const lat0 = level.lat, lon0 = level.lon, c = Math.cos(lat0 * Math.PI / 180); return [lat0 - z / 110540, lon0 + x / (c * 111320)]; }
function myLatLon() { if (mode === 'world') return world.unproj(player.x, player.z); return storyToLatLon(player.x, player.z); }
function pinIcon(color, bearing, me) { return window.L.divIcon({ className: 'pin-wrap', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div class="car-pin" style="background:${color};transform:rotate(${bearing}deg);${me ? 'width:24px;height:24px' : ''}"></div>` }); }
const bearingOf = yaw => 180 - yaw * 180 / Math.PI;
function openMap() {
  const L = window.L; if (!L) { $('#mapSub').textContent = 'Map library failed to load.'; return; }
  if (!leaf) {
    leaf = L.map('leaf', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(leaf);
    leaf.on('click', e => {
      if (mode !== 'world') return;
      const b = document.createElement('button'); b.className = 'cta'; b.style.margin = '0'; b.style.padding = '8px 14px'; b.textContent = 'Teleport here';
      b.onclick = () => { leaf.closePopup(); teleport(e.latlng.lat, e.latlng.lng, 'Map pick'); };
      L.popup().setLatLng(e.latlng).setContent(b).openOn(leaf);
    });
    $('#mapCenter').onclick = () => leaf.setView(myLatLon(), Math.max(leaf.getZoom(), 16));
  }
  if (leafTrack) { leafTrack.remove(); leafTrack = null; }
  const [la, lo] = myLatLon();
  if (mode === 'story') {
    $('#mapTitle').textContent = `${level.name} — ${level.place}`; $('#mapSub').textContent = 'The circuit laid over the real streets of this race location. Your car and rivals are shown live.';
    const pts = []; for (let i = 0; i < track.N; i += 4) pts.push(storyToLatLon(track.px[i], track.pz[i])); pts.push(pts[0]);
    leafTrack = L.polyline(pts, { color: '#ff5a3c', weight: 5, opacity: 0.85 }).addTo(leaf);
    setTimeout(() => { leaf.invalidateSize(); leaf.fitBounds(leafTrack.getBounds(), { padding: [30, 30] }); }, 30);
  } else {
    $('#mapTitle').textContent = 'World map'; $('#mapSub').textContent = `You are near ${W.street || W.originName || 'the start'} · click anywhere on the map to teleport.`;
    setTimeout(() => { leaf.invalidateSize(); leaf.setView([la, lo], 16); }, 30);
  }
  updateMapMarkers();
}
function updateMapMarkers() {
  const L = window.L; if (!leaf || !L) return;
  const [la, lo] = myLatLon();
  if (!leafMe) leafMe = L.marker([la, lo], { icon: pinIcon(PAINTS[S.paint].color, bearingOf(player.yaw), true), zIndexOffset: 1000 }).addTo(leaf).bindTooltip('You');
  else { leafMe.setLatLng([la, lo]); leafMe.setIcon(pinIcon(PAINTS[S.paint].color, bearingOf(player.yaw), true)); }
  const others = new Map();
  if (mode === 'story' && race) race.racers.forEach((r, i) => { if (r.ai) others.set('ai' + i, { ll: storyToLatLon(r.car.x, r.car.z), color: r.car.mesh.userData.paint.color.getStyle(), yaw: r.car.yaw, name: r.name }); });
  if (mode === 'world') for (const [id, p] of net.players) if (p.lat != null) others.set(id, { ll: [p.lat, p.lon], color: p.color, yaw: p.yaw, name: p.name });
  for (const [id, m] of leafOthers) if (!others.has(id)) { m.remove(); leafOthers.delete(id); }
  for (const [id, o] of others) {
    let m = leafOthers.get(id);
    if (!m) { m = L.marker(o.ll, { icon: pinIcon(o.color, bearingOf(o.yaw)) }).addTo(leaf).bindTooltip(o.name); leafOthers.set(id, m); }
    else { m.setLatLng(o.ll); m.setIcon(pinIcon(o.color, bearingOf(o.yaw))); }
  }
}
function renderMpTab() {
  const el = $('#pMp'); if (!el) return;
  if (mode !== 'world') { el.innerHTML = `<h3>Multiplayer</h3><p class="sub">Multiplayer sessions run in World Drive, where everyone shares the same OpenStreetMap world. Quit to the menu and choose Multiplayer or World Drive to host.</p>`; return; }
  if (!net.active) {
    el.innerHTML = `<h3>Multiplayer</h3><p class="sub">Open your current location to friends, or join theirs. Peer-to-peer with STUN only.</p>
      <label class="field" style="margin-top:14px"><span>Driver name</span><input id="pmName" maxlength="16" value="${escapeHtml(S.name)}" placeholder="Driver"></label>
      <div class="split"><div class="card"><h3>Host here</h3><p class="sub">Guests spawn where you are.</p><button class="cta" id="pmHost">Host</button></div>
      <div class="card"><h3>Join</h3><label class="field"><span>Code</span><input id="pmCode" class="code" maxlength="6" placeholder="ABC123"></label><button class="cta" id="pmJoin">Join</button></div></div><p class="status" id="pmStatus"></p>`;
    el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    $('#pmName').oninput = e => S.name = e.target.value.trim();
    $('#pmHost').onclick = () => doHost($('#pmStatus'), false);
    $('#pmJoin').onclick = () => { paused = false; doJoin($('#pmCode').value, $('#pmStatus')); };
    return;
  }
  const avImg = src => src ? `<img class="av" src="${src}" alt="">` : '';
  const list = [`<div><i style="background:${PAINTS[S.paint].color}"></i>${avImg(S.pic)}<span>${escapeHtml(S.name || 'Driver')} (you)</span><small>${net.role}</small></div>`];
  for (const [id, p] of net.players) list.push(`<div><i style="background:${p.color}"></i>${avImg(net.pics.get(id))}<span>${escapeHtml(p.name)}</span>${p.lat != null ? `<button class="ghost sm" data-goto="${id}">Go to</button>` : '<small>connecting</small>'}</div>`);
  el.innerHTML = `<h3>${net.role === 'host' ? 'Hosting' : 'Connected'}</h3><p class="sub">Session code — share it with friends:</p><div class="bigcode">${net.code}</div>
    <div class="mp-list">${list.join('')}</div><button class="ghost" id="pmLeave">Leave session</button><p class="note">STUN-only connections: if a friend can't connect, one of you may be on a strict NAT (mobile hotspot or office network).</p>`;
  el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const p = net.players.get(b.dataset.goto); if (p) teleport(p.lat, p.lon, p.name); });
  $('#pmLeave').onclick = () => { net.leave(); toast('Left the session'); updateMpBadge(); renderMpTab(); };
}

// ---------- minimap ----------
const mini = $('#mini'), mctx = mini.getContext('2d');
function drawMini() {
  const w = mini.width, h = mini.height, c = mctx; c.clearRect(0, 0, w, h);
  c.save(); c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.clip();
  if (mode === 'story' && track) {
    if (!track._mm) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < track.N; i++) { x0 = Math.min(x0, track.px[i]); x1 = Math.max(x1, track.px[i]); z0 = Math.min(z0, track.pz[i]); z1 = Math.max(z1, track.pz[i]); } const s = (w - 44) / Math.max(x1 - x0, z1 - z0); track._mm = { s, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }; }
    const { s, cx, cz } = track._mm, P = (x, z) => [w / 2 + (x - cx) * s, h / 2 + (z - cz) * s]; // north-up, east right
    c.lineJoin = 'round'; c.beginPath(); for (let i = 0; i <= track.N; i += 3) { const [a, b] = P(track.px[i % track.N], track.pz[i % track.N]); i ? c.lineTo(a, b) : c.moveTo(a, b); } c.closePath();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 9; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.stroke();
    const [sx, sz] = P(track.px[0], track.pz[0]); c.fillStyle = '#fff'; c.fillRect(sx - 3, sz - 3, 6, 6);
    for (const r of race.racers) { const [a, b] = P(r.car.x, r.car.z); c.fillStyle = r.ai ? r.car.mesh.userData.paint.color.getStyle() : '#fff'; c.beginPath(); c.arc(a, b, r.ai ? 4 : 6, 0, 7); c.fill(); if (!r.ai) { c.strokeStyle = PAINTS[S.paint].color; c.lineWidth = 2.5; c.stroke(); } }
  } else if (mode === 'world') {
    const R = 170, s = (w / 2) / R, yaw = player.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const P = (x, z) => { const dx = x - player.x, dz = z - player.z; return [w / 2 + (dx * rx + dz * rz) * s, h / 2 - (dx * fx + dz * fz) * s]; };
    const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24), n = Math.ceil(R / 24) + 1, seen = new Set();
    c.lineCap = 'round';
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const sg of (world.roadCells.get(i + ',' + j) || [])) {
      if (seen.has(sg)) continue; seen.add(sg);
      const [a, b] = P(sg.x0, sg.z0), [d, e] = P(sg.x1, sg.z1); c.strokeStyle = sg.walk ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.7)'; c.lineWidth = Math.max(1.2, sg.hw * 2 * s); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
    }
    for (const o of W.orbs) { const [a, b] = P(o.x, o.z); c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(a, b, 3, 0, 7); c.fill(); }
    for (const r of W.remotes.values()) { let [a, b] = P(r.x, r.z); const dd = Math.hypot(a - w / 2, b - h / 2), lim = w / 2 - 8; if (dd > lim) { a = w / 2 + (a - w / 2) * lim / dd; b = h / 2 + (b - h / 2) * lim / dd; } c.fillStyle = r.color; c.beginPath(); c.arc(a, b, 5, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); }
    // north marker
    const [na, nb] = [w / 2 + (0 * rx + -1 * rz) * (w / 2 - 12), h / 2 - (0 * fx + -1 * fz) * (w / 2 - 12)];
    c.fillStyle = '#ff5a3c'; c.font = '700 14px Chakra Petch'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', na, nb);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w / 2, h / 2 - 9); c.lineTo(w / 2 + 6, h / 2 + 6); c.lineTo(w / 2, h / 2 + 3); c.lineTo(w / 2 - 6, h / 2 + 6); c.closePath(); c.fill();
  }
  c.restore();
}

// ---------- camera ----------
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
function updateCamera(dt, car, cinematic) {
  const f = [Math.sin(car.yaw), Math.cos(car.yaw)];
  if (cinematic) {
    camAngle += dt * 0.12; const r = screen === 'garage' ? 7.5 : 11;
    camPos.set(car.x + Math.cos(camAngle) * r, screen === 'garage' ? 2.6 : 4.2, car.z + Math.sin(camAngle) * r);
    camera.position.copy(camPos); camera.lookAt(car.x, 1, car.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    return;
  }
  const sp = Math.abs(car.speed), cam = S.cam;
  let dist = cam === 1 ? 13 : 8.2, hgt = cam === 1 ? 5.5 : 3.3;
  if (cam === 2) { camPos.set(car.x + f[0] * 0.3, 1.55, car.z + f[1] * 0.3); camera.position.copy(camPos); camTarget.set(car.x + f[0] * 12, 1.2, car.z + f[1] * 12); }
  else {
    dist += sp * 0.03;
    camPos.set(car.x - f[0] * dist, hgt, car.z - f[1] * dist);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * (mode === 'story' && race && !race.started ? 1.6 : 7)));
    camTarget.set(car.x + f[0] * 4, 1.1, car.z + f[1] * 4);
  }
  if (camShake > 0) { camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake * 0.5; camShake = Math.max(0, camShake - dt * 2); }
  camera.lookAt(camTarget);
  const fov = 62 + Math.min(sp, 70) * 0.22 + (car.boosting ? 6 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const toUnits = v => Math.round(Math.abs(v) * (S.units === 'kmh' ? 3.6 : 2.237));
function updateHud(dt) {
  const bridgeTouch = $('#touchBridge'); if (bridgeTouch) bridgeTouch.hidden = mode !== 'world';
  $('#hSpeed').textContent = toUnits(player.speed);
  $('#hBoost').style.transform = `scaleX(${player.boost})`; $('#hBoost').parentElement.classList.toggle('on', player.boosting);
  if (mode === 'story' && race) {
    const r = race.player; $('#hPos').innerHTML = `<b>${r.pos || race.racers.length}</b><span>/${race.racers.length}</span>`;
    $('#hLap').innerHTML = `<small>LAP</small><b>${Math.min(level.laps, r.lap + 1)}/${level.laps}</b>`;
    $('#hTimes').innerHTML = `<div><small>TIME</small>${fmt(race.time)}</div><div><small>LAST</small>${fmt(r.lastLap)}</div><div><small>BEST</small>${fmt(r.bestLap)}</div>`;
    $('#wrong').hidden = !(r.wrongWay > 1.2 && race.started && !r.finished);
  } else if (mode === 'world') {
    $('#hScore').innerHTML = `<small>SCORE</small><b>${W.score.toLocaleString()}</b>`;
    const buildBtn = $('#touchBridge'); if (buildBtn) { buildBtn.hidden = false; buildBtn.disabled = W.score < BRIDGE_COST || W.destroyed || W.spawning; buildBtn.textContent = W.score < BRIDGE_COST ? `BRIDGE · ${BRIDGE_COST} PTS` : `BUILD BRIDGE · ${BRIDGE_COST}`; }
    $('#hDist').innerHTML = `<small>DIST</small><b>${S.units === 'kmh' ? (W.dist / 1000).toFixed(1) + ' km' : (W.dist / 1609).toFixed(1) + ' mi'}</b>`;
    const [la, lo] = world.unproj(player.x, player.z);
    $('#hTimes').innerHTML = `<div><small>LAT</small>${la.toFixed(5)}</div><div><small>LON</small>${lo.toFixed(5)}</div>`;
    const st = $('#hStreet'); st.hidden = !W.street; st.textContent = W.street;
  }
}

// ---------- main loop ----------
let last = performance.now(), t = 0, miniT = 0, sendT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  if (mode === 'menu' && attract) {
    attract.update(dt); updateCamera(dt, player, true);
    Audio.engine(0, 0, 0, false);
  } else if (mode === 'story' && race) {
    if (!paused) {
      readInput(); if (race.player.finished) { player.input.throttle = 0; player.input.boost = false; }
      race.update(dt);
      // countdown
      if (!race.started) { const n = Math.min(3, Math.ceil(race.countdown)); if (n !== lastCount) { lastCount = n; const el = $('#countdown'); el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); Audio.beep(false); } }
      else if (goTimer < 1) { if (goTimer === 0) { const el = $('#countdown'); el.textContent = 'GO'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); Audio.beep(true); } goTimer = Math.max(goTimer + dt, race.time); if (goTimer >= 1) $('#countdown').textContent = ''; }
      if (race.finished) { if (finishTimer === 0) { hudMsg(race.player.place === 1 ? 'YOU WIN' : `FINISHED P${race.player.place}`, 2600); Audio.chime(3); } finishTimer += dt; if (finishTimer > 3 && mode === 'story' && screen !== 'results') { showResults(); } }
    }
    updateCamera(dt, player, false);
    Audio.engine(player.speed, paused ? 0 : player.input.throttle, player.slip, !paused);
    updateHud(dt);
  } else if (mode === 'world') {
    world.update(player.x, player.z);
    if (W.spawning) {
      W.spawnT += dt;
      const p = world.tileCount() > 0 ? world.nearestRoadPoint(0, 0, W.spawnT > 8 ? 1500 : 450) : null;
      if (p) { player.place(p.x, p.z, p.yaw); W.spawning = false; $('#wLoading').hidden = true; hudMsg(p.seg.name ? p.seg.name.toUpperCase() : 'GO EXPLORE', 2000); camera.position.set(p.x - Math.sin(p.yaw) * 30, 18, p.z - Math.cos(p.yaw) * 30); }
      else if (W.spawnT > 25) { W.spawning = false; $('#wLoading').hidden = true; toast('Map data is slow to load here — drive on, streets will appear as they arrive', 4500); }
      camera.position.lerp(new THREE.Vector3(player.x + 40, 70, player.z + 40), 1 - Math.exp(-dt)); camera.lookAt(player.x, 0, player.z);
    } else {
      if (!paused) {
        if (!W.destroyed) {
          readInput();
          const loaded = tileReadyAt(player.x, player.z);
          player.offroad = loaded && world.roadCells.size > 0 && !world.onRoad(player.x, player.z, 1.4);
          player.update(dt);
          // Critically damped-style exponential smoothing keeps elevation transitions gentle.
          const targetGroundY = world.heightAt(player.x, player.z);
          player.groundY += (targetGroundY - player.groundY) * (1 - Math.exp(-dt * 3.2));
          player.sync(0);
          const col = world.collide(player.x, player.z, 1.4);
          if (col) { player.x += col.nx * col.depth; player.z += col.nz * col.depth; const hit = player.bump(col.nx, col.nz, 0.25); if (hit > 4) { Audio.thud(hit / 8); camShake = Math.min(0.6, hit * 0.03); } player.sync(0); }
          W.dist += Math.abs(player.speed) * dt;
          updateOrbs(dt, t);
          W.streetT -= dt; if (W.streetT <= 0) { W.streetT = 0.3; const info = world.roadInfo(player.x, player.z); W.street = info && info.dist < 4 && info.seg.name ? info.seg.name : (info && info.dist < 4 ? '' : W.street && info && info.dist < 12 ? W.street : ''); }
        }
        updateWaterHazard(dt);
      }
      updateCamera(dt, player, false);
    }
    updateRemotes(dt);
    if (net.active && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); net.tick(dt, { lat: la, lon: lo, yaw: player.yaw, speed: paused ? 0 : player.speed }); }
    sendT += dt; if (sendT > 1) { sendT = 0; updateMpBadge(); }
    Audio.engine(player.speed, paused ? 0 : player.input.throttle, player.slip, !paused && !W.spawning);
    updateHud(dt);
  }
  if (!paused && mode !== 'menu') { miniT += dt; if (miniT > 1 / 20) { miniT = 0; drawMini(); } }
  if (paused && tab === 'map' && leaf) { leafTimer += dt; if (leafTimer > 0.25) { leafTimer = 0; updateMapMarkers(); } }
  // sun & sky follow the action
  const fx = camera.position.x, fz = camera.position.z;
  sky.position.copy(camera.position);
  sun.position.set(player.x + 60, 110, player.z + 40); sun.target.position.set(player.x, 0, player.z);
  if (mode !== 'world') ground.position.set(Math.round(fx / 100) * 100, -0.02, Math.round(fz / 100) * 100);
  renderer.render(scene, camera);
}

// ---------- boot ----------
renderGarage(); renderSettings(); renderControls(); renderLocPickers();
applyQuality(); startMenu();
requestAnimationFrame(t0 => { last = t0; requestAnimationFrame(frame); });
setTimeout(() => { const b = $('#boot'); b.style.opacity = 0; setTimeout(() => b.remove(), 500); }, 250);
window.__game = { showResults: () => showResults(), player, world, net, get race() { return race; }, get mode() { return mode; }, startWorld, startStory: i => startStory(LEVELS[i]), keys };
