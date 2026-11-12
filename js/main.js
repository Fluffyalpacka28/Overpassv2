import * as THREE from 'three';
import { Audio } from './audio.js';
import { Car, PAINTS, MODELS, modelById, setPaint, nameTag } from './car.js';
import { THEMES, LEVELS, RIVAL_COLORS, trackPoints, Track, Race } from './story.js';
import { World } from './world.js';
import { setAnisotropy } from './textures.js';
import { Net } from './net.js';
import { WaterSpray, WaterWake } from './spray.js';
import { NitroFlames, SpeedLines } from './fx.js';
import { VRRig } from './vr.js';
import { Gps, stepText, stepArrow } from './gps.js';
import { buildCockpit, drawGauges } from './cockpit.js';
import { MAX_MODEL_BYTES, SKIN_SCALES, idbGet, idbSet, bufToB64, hashStr, modelTemplate, testModel, applyModel, clearModel, skinTexture, applySkin, clearSkin, imageToSkin } from './custom.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = t => { if (!isFinite(t) || t <= 0) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const touchDevice = matchMedia('(pointer:coarse)').matches;

// ---------- settings & progress (in-memory only) ----------
const S = { paint: 0, music: true, master: 0.8, musicVol: 0.55, sfx: 0.8, units: 'kmh', cam: 0, quality: touchDevice ? 'low' : 'high', unlockAll: false, infNitro: false, infGas: false, flyCars: false, waterDrive: false, name: '', model: 'coupe', avatar: null, avatarNet: null };
let avatarImg = null; // decoded image for name tags
const progress = { unlocked: 1, best: {} };
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
// logarithmic depth keeps roads from flickering into the terrain far away (z-fighting)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
setAnisotropy(renderer.capabilities.getMaxAnisotropy());
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
const vr = new VRRig(renderer, camera); vr.scene = scene;
let xrState = 'checking'; vr.supported.then(ok => { xrState = ok ? 'yes' : (window.top !== window ? 'iframe' : 'no'); renderSettings(); });
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
function resize() { if (vr.presenting) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- game objects ----------
const player = new Car(PAINTS[S.paint].color); scene.add(player.mesh);
player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
const AVATAR_FALLBACK = name => (name || 'D').trim().charAt(0).toUpperCase() || 'D';
function avatarHtml(src, name, color, size = 28) { return src ? `<img class="av" src="${src}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">` : `<span class="av av-txt" style="width:${size}px;height:${size}px;background:${color}">${escapeHtml(AVATAR_FALLBACK(name))}</span>`; }
function updateDriverChips() {
  const nm = S.name || 'Driver', col = PAINTS[S.paint].color;
  $$('[data-driver]').forEach(el => el.innerHTML = avatarHtml(S.avatar, nm, col, +(el.dataset.size || 26)) + `<span>${escapeHtml(nm)}</span>`);
}
const world = new World(scene, renderer); world.setVisible(false);
const net = new Net();
const spray = new WaterSpray(scene), wake = new WaterWake(scene);
const nitroFx = new NitroFlames(), speedFx = new SpeedLines(document.getElementById('hud'));
// ---------- ambient traffic ----------
// AI cars drive along the real mapped roads, carry on through junctions onto connected roads,
// keep a gap to the car in front (and to you) and bump you if you plough into them.
const TRAFFIC_MAX = 12;
const TRAFFIC_COLORS = ['#d64b42', '#3c83bd', '#d6d0c3', '#d1a33e', '#4c8b63', '#77717e', '#e07b39', '#2d3a4a'];
const TRAFFIC_MODELS = ['coupe', 'hatch', 'pickup', 'van', 'muscle', 'rally', 'roadster'];
const TRAFFIC_FAST = new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link']);
const TRAFFIC_MID = new Set(['secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link']);
function trafficCruise(seg) {
  const r = Math.random();
  return TRAFFIC_FAST.has(seg.type) ? 14 + r * 8 : TRAFFIC_MID.has(seg.type) ? 10 + r * 6 : 6 + r * 5;
}
function trafficRoad(s) { return s && !s.walk && s.type !== 'track'; }
function setTrafficSeg(a, seg, dir) {
  const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0, len = Math.hypot(dx, dz) || 1;
  a.seg = seg; a.dir = dir; a.len = len; a.dx = dx / len * dir; a.dz = dz / len * dir; a.lane = Math.min(1.7, seg.hw * 0.32);
}
function removeTraffic(i) {
  const a = W.traffic[i]; scene.remove(a.car.mesh); a.car.mesh.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); W.traffic.splice(i, 1);
}
function clearTraffic() { while (W.traffic.length) removeTraffic(W.traffic.length - 1); W.trafficSpawn = 0; }
function spawnTraffic() {
  const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24), n = 15, seen = new Set(), cand = [];
  for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const s of (world.roadCells.get(i + ',' + j) || [])) {
    if (seen.has(s)) continue; seen.add(s);
    if (!trafficRoad(s)) continue;
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, d = Math.hypot(mx - player.x, mz - player.z);
    if (d < 70 || d > 330 || Math.hypot(s.x1 - s.x0, s.z1 - s.z0) < 4) continue;
    if (!s.bridge && world.water.inside(mx, mz)) continue;
    cand.push(s);
  }
  for (let tries = 0; tries < 8 && cand.length; tries++) {
    const seg = cand[Math.floor(Math.random() * cand.length)], dir = Math.random() < 0.5 ? 1 : -1;
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0), d = len * (0.15 + Math.random() * 0.7);
    const k = dir > 0 ? d / len : 1 - d / len, x = seg.x0 + (seg.x1 - seg.x0) * k, z = seg.z0 + (seg.z1 - seg.z0) * k;
    if (W.traffic.some(t => Math.hypot(t.car.x - x, t.car.z - z) < 28)) continue; // don't stack cars on top of each other
    const car = new Car(TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)], TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)]);
    car.mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
    const a = { car, d, speed: 0, cruise: trafficCruise(seg), laneCur: 0, py: null }; setTrafficSeg(a, seg, dir);
    a.speed = a.cruise * 0.8; a.laneCur = a.lane; car.yaw = Math.atan2(a.dx, a.dz); car.pitch = 0; car.roll = 0; car.y = seg.bridge ? seg.y0 : world.heightAt(x, z);
    car.x = x; car.z = z; car.sync(0); scene.add(car.mesh); W.traffic.push(a); return;
  }
}
// pick the road to continue onto at the end of the current segment (null = dead end / unloaded map)
function trafficNext(a) {
  const s = a.seg, ex = a.dir > 0 ? s.x1 : s.x0, ez = a.dir > 0 ? s.z1 : s.z0, opts = [];
  for (const o of world.nearbySegs(ex, ez)) {
    if (o === s || !trafficRoad(o)) continue;
    let nd;
    if (Math.hypot(o.x0 - ex, o.z0 - ez) < 1.5) nd = 1; else if (Math.hypot(o.x1 - ex, o.z1 - ez) < 1.5) nd = -1; else continue;
    const dx = (o.x1 - o.x0) * nd, dz = (o.z1 - o.z0) * nd, l = Math.hypot(dx, dz); if (l < 0.5) continue;
    const dot = (dx * a.dx + dz * a.dz) / l; if (dot < -0.3) continue; // no hairpins
    opts.push({ o, nd, dot, w: 0.15 + dot + 0.3 });
  }
  if (!opts.length) return null;
  let tot = 0; for (const p of opts) tot += p.w; let r = Math.random() * tot;
  for (const p of opts) { r -= p.w; if (r <= 0) return p; }
  return opts[opts.length - 1];
}
function updateTraffic(dt) {
  if (mode !== 'world' || paused || W.spawning || player.fly) return;
  dt = Math.min(dt, 0.05);
  W.trafficSpawn -= dt;
  if (W.traffic.length < TRAFFIC_MAX && W.trafficSpawn <= 0 && world.roadCells.size && tileReadyAt(player.x, player.z)) { W.trafficSpawn = 0.8; spawnTraffic(); }
  for (let i = W.traffic.length - 1; i >= 0; i--) {
    const a = W.traffic[i], car = a.car;
    if (Math.hypot(car.x - player.x, car.z - player.z) > 480) { removeTraffic(i); continue; }
    // brake for whatever is in front: other cars heading the same way, or you
    let target = a.cruise;
    const look = (ox, oz, oy) => {
      const rx = ox - car.x, rz = oz - car.z, f = rx * a.dx + rz * a.dz, lat = Math.abs(rx * a.dz - rz * a.dx);
      if (f > 0.3 && f < 14 && lat < 2.4 && Math.abs(oy - car.y) < 3) target = Math.min(target, f < 6.5 ? 0 : (f - 6.5) / 7.5 * a.cruise);
    };
    look(player.x, player.z, player.y || 0);
    for (const b of W.traffic) if (b !== a && b.dx * a.dx + b.dz * a.dz > 0.3) look(b.car.x, b.car.z, b.car.y);
    a.speed += (target - a.speed) * Math.min(1, dt * (target < a.speed ? 4 : 1.2));
    a.d += a.speed * dt;
    let gone = false;
    while (a.d >= a.len) {
      const over = a.d - a.len, nx = trafficNext(a);
      if (nx) { a.speed *= 0.65 + 0.35 * Math.max(0, nx.dot); setTrafficSeg(a, nx.o, nx.nd); a.cruise = trafficCruise(nx.o); a.d = over; }
      else if (Math.hypot(car.x - player.x, car.z - player.z) > 60) { gone = true; break; } // dead end out of sight
      else { setTrafficSeg(a, a.seg, -a.dir); a.d = Math.min(over, a.len - 0.01); a.speed *= 0.5; } // dead end in sight: turn around
    }
    if (gone) { removeTraffic(i); continue; }
    const s = a.seg, sx = a.dir > 0 ? s.x0 : s.x1, sz = a.dir > 0 ? s.z0 : s.z1;
    a.laneCur += (a.lane - a.laneCur) * Math.min(1, dt * 3);
    const x = sx + a.dx * a.d + a.dz * a.laneCur, z = sz + a.dz * a.d - a.dx * a.laneCur, q = a.d / a.len, k = a.dir > 0 ? q : 1 - q;
    const y = s.bridge ? s.y0 + (s.y1 - s.y0) * k : world.heightAt(x, z);
    const ty = Math.atan2(a.dx, a.dz); let diff = ty - car.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    car.yaw += diff * Math.min(1, dt * 6); car.steer += (Math.max(-0.6, Math.min(0.6, diff * 2)) - car.steer) * Math.min(1, dt * 8);
    if (a.py != null) { const step = a.speed * dt; if (step > 0.02) car.pitch += (Math.max(-0.5, Math.min(0.5, -Math.atan2(y - a.py, step))) - car.pitch) * Math.min(1, dt * 6); }
    a.py = y; car.x = x; car.z = z; car.y = y; car.vx = Math.sin(car.yaw) * a.speed; car.vz = Math.cos(car.yaw) * a.speed;
    car.sync(dt, a.speed, 0);
    // solid for the player
    const px = player.x - x, pz = player.z - z, pd = Math.hypot(px, pz);
    if (pd < 3.2 && pd > 0.01 && Math.abs((player.y || 0) - y) < 2.5) {
      const nx = px / pd, nz = pz / pd; player.x += nx * (3.2 - pd); player.z += nz * (3.2 - pd);
      const hit = player.bump(nx, nz, 0.3); if (hit > 3) { Audio.thud(hit / 8); camShake = Math.max(camShake, Math.min(0.5, hit * 0.03)); }
      a.speed *= 0.6; player.sync(0);
    }
  }
}

let mode = 'menu', paused = false, track = null, race = null, level = null, attract = null;
let camShake = 0, camAngle = 0, finishTimer = 0, lastCount = -1, goTimer = 0;
const W = { spawning: false, spawnT: 0, score: 0, dist: 0, orbs: [], streetT: 0, street: '', remotes: new Map(), traffic: [], trafficSpawn: 0, combo: 0, comboT: 0 };

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
function toast(msg, ms = 2600) { if (vr.presenting && performance.now() > vrMsg.until) { vrMsg.text = msg.toUpperCase().slice(0, 40); vrMsg.until = performance.now() + Math.min(ms, 2500); } const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), ms); }
let msgTimer = 0;
const vrMsg = { text: '', until: 0 };
function hudMsg(text, ms = 1600) { vrMsg.text = text; vrMsg.until = performance.now() + ms; const m = $('#hMsg'); m.textContent = text; m.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), ms); }

// ---------- garage / settings / controls (rendered in menu + pause) ----------
// ---------- custom looks: your own 3D model + picture paint (kept for this visit, shared in multiplayer) ----------
const looks = { glb: null, skin: null };
Promise.all([idbGet('glb'), idbGet('skin')]).then(([g, k]) => { if (g && g.data) looks.glb = g; if (k && k.data) looks.skin = k; net.mine.glb = looks.glb; net.mine.skin = looks.skin; renderGarage(); });
const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function customHtml() {
  const g = looks.glb, k = looks.skin, sc = k ? (k.m.scale || 1) : 1;
  return `<div class="gsec"><h4>Custom look</h4><div class="custom-grid">
    <div class="cl-card"><div class="ic">${g ? '3D' : '+'}</div><div class="tx"><b>Your own 3D model</b>
      <small>${g ? `${escapeHtml(g.m.name || 'model')} · ${fmtBytes(g.m.size || 0)}${modelErr ? ' · could not load' : ''}` : `GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_MODEL_BYTES)}`}</small>
      <div class="av-actions"><button class="ghost sm" data-glb-pick>${g ? 'Replace' : 'Upload model'}</button>${g ? '<button class="ghost sm" data-glb-rot>Turn 90°</button><button class="ghost sm" data-glb-clear>Remove</button>' : ''}</div></div></div>
    <div class="cl-card"><div class="ic" ${k ? `style="background-image:url('${k.data}')"` : ''}>${k ? '' : '+'}</div><div class="tx"><b>Picture paint job</b>
      <small>${k ? (g ? 'Shows on the built-in body. Your 3D model keeps its own colors.' : 'Wrapped around your car') : 'Any photo or pattern becomes your paint'}</small>
      ${k ? `<div class="segs">${SKIN_SCALES.map(([v, n]) => `<button class="${v === sc ? 'on' : ''}" data-skin-scale="${v}">${n}</button>`).join('')}</div>` : ''}
      <div class="av-actions"><button class="ghost sm" data-skin-pick>${k ? 'Change picture' : 'Upload picture'}</button>${k ? '<button class="ghost sm" data-skin-clear>Remove</button>' : ''}</div></div></div>
  </div><p class="note">Your model is fitted to the size of the vehicle you pick above and drives like it. If it faces the wrong way, press Turn 90°. Multiplayer friends see your model and paint too. They stay until you reload the page.</p></div>`;
}
let modelErr = false;
$('#glbFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!['glb', 'gltf', 'obj', 'stl'].includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_MODEL_BYTES) { toast(`That model is ${fmtBytes(f.size)}. The limit is ${fmtBytes(MAX_MODEL_BYTES)}, so try a lighter version.`, 4200); return; }
  toast('Loading your model…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf);
    const data = bufToB64(buf), a = { h: hashStr(data), m: { ext, rot: 0, name: f.name.slice(0, 40), size: f.size }, data };
    looks.glb = a; modelErr = false; idbSet('glb', a); net.setAsset('glb', a); Audio.chime(4); toast('Model loaded. Use Turn 90° if it faces the wrong way.', 3200); renderGarage();
  } catch (err) { console.warn(err); toast(ext === 'gltf' ? 'Could not read that file. GLTF files need their textures embedded, so a single .glb usually works better.' : 'Could not read that model: ' + (err && err.message || err), 4500); }
});
$('#skinFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const data = await imageToSkin(f), a = { h: hashStr(data), m: { scale: 1 }, data }; looks.skin = a; idbSet('skin', a); net.setAsset('skin', a); Audio.chime(4); renderGarage(); }
  catch (err) { toast(String(err && err.message || err)); }
});
const validGlb = a => a && typeof a.data === 'string' && a.data.length < MAX_MODEL_BYTES * 1.4 && a.m && ['glb', 'gltf', 'obj', 'stl'].includes(a.m.ext);
const validSkin = a => a && typeof a.data === 'string' && a.data.length < 600000 && /^data:image\/(jpeg|png|webp);base64,/.test(a.data);
// keep a car's custom model / picture paint in step with what it should show
function syncLooks(car, glb, skin, color, mine = false) {
  const mesh = car.mesh, ud = mesh.userData;
  const gk = validGlb(glb) ? glb.h + ':' + (glb.m.rot | 0) : '';
  if ((ud.customKey || '') !== gk && ud.customBusy !== gk) {
    if (!gk) clearModel(mesh);
    else {
      ud.customBusy = gk;
      modelTemplate({ h: glb.h, ext: glb.m.ext, data: glb.data }).then(tpl => { if (car.mesh === mesh && ud.customBusy === gk) { applyModel(mesh, tpl, glb.m.rot | 0, gk); if (mine) modelErr = false; } })
        .catch(err => { console.warn('custom model failed', err); ud.customKey = gk; if (mine && !modelErr) { modelErr = true; toast('Your custom model could not be shown', 3000); renderGarage(); } })
        .finally(() => { if (ud.customBusy === gk) ud.customBusy = null; });
    }
  }
  const sk = validSkin(skin) ? skin.h + ':' + (skin.m.scale || 1) : '';
  if ((ud.skinKey || '') !== sk) { if (!sk) clearSkin(mesh, color); else applySkin(mesh, skinTexture(skin.h, skin.data), skin.m.scale || 1, sk); }
}
function renderGarage() {
  const nm = S.name || '', col = PAINTS[S.paint].color, cur = modelById(S.model);
  const obar = off => `<div class="stat"><small>Off-road</small><i><b style="width:${Math.round((1 - off * 0.85) * 100)}%"></b></i></div>`;
  const bar = (label, v) => `<div class="stat"><small>${label}</small><i><b style="width:${Math.round(Math.max(0.15, Math.min(1, (v - 0.82) / 0.32)) * 100)}%"></b></i></div>`;
  $$('[data-garage]').forEach(el => {
    el.innerHTML = `<div class="gsec"><h4>Driver</h4>
      <div class="driver-card">
        <button class="av-slot" data-av-pick aria-label="Upload driver picture">${avatarHtml(S.avatar, nm || 'Driver', col, 72)}<span class="av-edit">${S.avatar ? 'Change' : 'Upload'}</span></button>
        <div class="driver-fields"><label class="field"><span>Driver name</span><input data-gname maxlength="16" value="${escapeHtml(nm)}" placeholder="Driver" autocomplete="off"></label>
        <div class="av-actions"><button class="ghost sm" data-av-pick>${S.avatar ? 'Change picture' : 'Upload picture'}</button>${S.avatar ? '<button class="ghost sm" data-av-clear>Remove</button>' : ''}</div></div>
      </div><p class="note">Your picture shows next to your name in the HUD, in race results, and on your name tag for multiplayer friends.</p></div>
      <div class="gsec"><h4>Car <small>${escapeHtml(cur.name)} · ${escapeHtml(cur.kind)}</small></h4>
      <div class="models">${MODELS.map(m => `<button class="model ${m.id === S.model ? 'on' : ''}" data-model="${m.id}"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.kind)} · ${m.mpg} ${m.electric ? 'MPGe' : 'mpg'}</small>${bar('Speed', m.top)}${bar('Accel', m.accel)}${bar('Grip', m.grip)}${obar(m.off)}<div class="stat"><small>Mileage</small><i><b style="width:${Math.round(Math.min(1, 0.12 + m.mpg / 56) * 100)}%"></b></i></div>${m.off === 0 ? '<em class="tag">No off-road slowdown</em>' : ''}</button>`).join('')}</div></div>
      <div class="gsec"><h4>Paint</h4><div class="swatches">${PAINTS.map((p, i) => `<button class="swatch ${i === S.paint ? 'on' : ''}" data-paint="${i}"><i style="background:${p.color}"></i>${p.name}</button>`).join('')}</div>${looks.skin ? '<p class="note">Your picture paint job is on, so paint colors are paused. Remove the picture below to use them again.</p>' : ''}</div>
      ${customHtml()}`;
    el.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { S.paint = +b.dataset.paint; setPaint(player.mesh, PAINTS[S.paint].color); Audio.click(); renderGarage(); if (net.me) net.me.color = PAINTS[S.paint].color; });
    el.querySelectorAll('[data-model]').forEach(b => b.onclick = () => { S.model = b.dataset.model; player.setModel(S.model); player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); Audio.click(); renderGarage(); if (net.me) net.me.model = S.model; });
    el.querySelectorAll('[data-av-pick]').forEach(b => b.onclick = () => $('#avFile').click());
    el.querySelectorAll('[data-glb-pick]').forEach(b => b.onclick = () => $('#glbFile').click());
    el.querySelectorAll('[data-skin-pick]').forEach(b => b.onclick = () => $('#skinFile').click());
    el.querySelectorAll('[data-glb-rot]').forEach(b => b.onclick = () => { const a = looks.glb; a.m = { ...a.m, rot: ((a.m.rot | 0) + 1) % 4 }; idbSet('glb', a); net.setAssetMeta('glb', a.m); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-glb-clear]').forEach(b => b.onclick = () => { looks.glb = null; idbSet('glb', null); net.setAsset('glb', null); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-skin-clear]').forEach(b => b.onclick = () => { looks.skin = null; idbSet('skin', null); net.setAsset('skin', null); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-skin-scale]').forEach(b => b.onclick = () => { const a = looks.skin; a.m = { ...a.m, scale: +b.dataset.skinScale }; idbSet('skin', a); net.setAssetMeta('skin', a.m); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-av-clear]').forEach(b => b.onclick = () => { setAvatar(null, null); Audio.click(); });
    const inp = el.querySelector('[data-gname]');
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.oninput = e => { S.name = e.target.value.trim(); syncNameInputs(inp); updateDriverChips(); if (net.me) net.me.name = (S.name || 'Driver').slice(0, 16); };
  });
  updateDriverChips();
}
function syncNameInputs(except) { document.querySelectorAll('[data-gname], #mpName, #pmName').forEach(i => { if (i !== except && document.activeElement !== i) i.value = S.name; }); }
// avatar upload: center-crop to a square, keep a crisp copy for the UI and a tiny one for multiplayer
function cropTo(img, size, q) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const m = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - m) / 2, sy = (img.naturalHeight - m) / 2;
  x.fillStyle = '#1a1634'; x.fillRect(0, 0, size, size); x.imageSmoothingQuality = 'high'; x.drawImage(img, sx, sy, m, m, 0, 0, size, size);
  return c.toDataURL('image/jpeg', q);
}
function setAvatar(big, small) {
  S.avatar = big; S.avatarNet = small;
  if (big) { const im = new Image(); im.onload = () => { avatarImg = im; }; im.src = big; } else avatarImg = null;
  renderGarage(); if (net.me) { net.me.av = small; net.sendAvatar && net.sendAvatar(small); }
  toast(big ? 'Driver picture updated' : 'Driver picture removed', 1600);
}
$('#avFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\//.test(f.type)) { toast('That file is not an image'); return; }
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => { try { setAvatar(cropTo(img, 192, 0.88), cropTo(img, 56, 0.72)); } catch { toast('Could not read that image'); } URL.revokeObjectURL(url); };
  img.onerror = () => { toast('Could not read that image'); URL.revokeObjectURL(url); };
  img.src = url;
});
function vrRow() {
  const on = vr.presenting;
  const btn = xrState === 'yes' ? `<button class="vrbtn" data-vr>${on ? 'Exit VR' : 'Enter VR'}</button>` : xrState === 'iframe' ? '<button class="vrbtn ghost" data-vrtab>Open in new tab</button>' : `<button class="vrbtn" disabled>${xrState === 'checking' ? 'Checking…' : 'Not available'}</button>`;
  const note = xrState === 'yes' ? 'Put on your Meta Quest and press Enter VR. Squeeze the grip buttons with your hands on the wheel to steer. Right trigger is gas, left trigger is brake.'
    : xrState === 'iframe' ? 'VR needs the game open in its own browser tab. Open it in a new tab on your Quest, then come back here.'
    : xrState === 'no' ? 'Open this game in the Meta Quest Browser on your headset to play in VR.' : '';
  return `<div class="set vrset"><label>Virtual reality<small>${note}</small></label>${btn}</div>`;
}
function enterVR() {
  if (vr.presenting) { vr.exit(); return; }
  Audio.init();
  const p = vr.enter(); // must start inside the click
  p.then(() => {
    if (mode === 'menu') startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name);
    if (paused) resume();
  }).catch(err => toast(window.top !== window ? 'VR is blocked in this embedded view. Open the game in its own tab to play in VR.' : 'Could not start VR: ' + (err && err.message || err), 5000));
}
vr.onStart = () => { sun.castShadow = false; player.noLean = true; renderSettings(); };
vr.onEnd = () => { sun.castShadow = true; player.noLean = false; camera.near = 0.3; camera.updateProjectionMatrix(); if (vr.rig.parent) vr.rig.parent.remove(vr.rig); renderSettings(); resize(); };
function renderSettings() {
  const tog = (k, label) => `<div class="set"><label>${label}</label><button class="toggle" data-tog="${k}" aria-pressed="${!!S[k]}" aria-label="${label}"></button></div>`;
  const rng = (k, label) => `<div class="set"><label>${label}</label><input type="range" min="0" max="1" step="0.05" value="${S[k]}" data-rng="${k}" aria-label="${label}"></div>`;
  const seg = (k, label, opts) => `<div class="set"><label>${label}</label><div class="seg">${opts.map(([v, t]) => `<button data-seg="${k}" data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
  $$('[data-settings]').forEach(el => {
    el.innerHTML = vrRow() + tog('music', 'Music') + rng('master', 'Master volume') + rng('musicVol', 'Music volume') + rng('sfx', 'Effects volume')
      + seg('units', 'Speed units', [['kmh', 'km/h'], ['mph', 'mph']]) + seg('cam', 'Camera', [[0, 'Chase'], [1, 'Far'], [2, 'Hood'], [3, 'Cockpit']])
      + seg('quality', 'Graphics', [['low', 'Fast'], ['high', 'Pretty']]) + tog('infNitro', 'Unlimited nitrous (World Drive and multiplayer)') + tog('infGas', 'Unlimited gas (World Drive and multiplayer)') + tog('flyCars', 'Cheat: flying cars (World Drive and multiplayer)') + tog('waterDrive', 'Cheat: drive on water (World Drive and multiplayer)') + tog('unlockAll', 'Unlock all story races');
    el.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => enterVR());
    el.querySelectorAll('[data-vrtab]').forEach(b => b.onclick = () => window.open(location.href, '_blank'));
    el.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { const k = b.dataset.tog; S[k] = !S[k]; if (k === 'music') { Audio.init(); Audio.setMusic(S.music); } Audio.click(); renderSettings(); if (k === 'infNitro') updateNitroHud(); if (k === 'waterDrive') waterDriveChanged(); if (k === 'flyCars') { if (!S[k] && player.fly) { player.fly = null; player.air = true; } toast(S[k] ? 'Flying cars on — get up to speed and hold K (or Num 2) to pull up' : 'Flying cars off', 3200); } });
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
    <span><kbd>M</kbd></span><span>Open the map</span>
    <span><kbd>N</kbd></span><span>Unlimited nitrous on or off (World Drive and multiplayer)</span>
    <span><kbd>G</kbd></span><span>Unlimited gas on or off (World Drive and multiplayer)</span>
    <span><kbd>F</kbd></span><span>Use a gas can when you're running low (50 points, or free roadside help when you're empty and broke)</span>
    <span><kbd>B</kbd></span><span>Build a bridge straight ahead (World Drive, costs ${BRIDGE_COST} points)</span>
    <span><kbd>K</kbd><kbd>Num 2</kbd></span><span>Flying cars cheat: pull the nose up (take off at speed)</span>
    <span><kbd>I</kbd><kbd>Num 8</kbd></span><span>Flying cars cheat: push the nose down. In the air W is thrust, S is air brake, A/D bank and turn</span>
    <span><kbd>X</kbd></span><span>Clear the GPS route (set one by clicking the map)</span>
    <span><kbd>Esc</kbd><kbd>Tab</kbd></span><span>Game menu</span>
  </div><p class="note">On touch screens, on-screen pedals and steering appear during play. Gamepads are not supported yet.</p>
  <h4 class="vrh">Meta Quest VR</h4><div class="keys">
    <span><kbd>Grip</kbd></span><span>Squeeze with a hand on the wheel (or handlebars) to grab it, then turn it like a real wheel. One or both hands work.</span>
    <span><kbd>R trigger</kbd></span><span>Gas (press harder to go faster)</span>
    <span><kbd>L trigger</kbd></span><span>Brake / reverse</span>
    <span><kbd>L stick</kbd></span><span>Steer when your hands are off the wheel</span>
    <span><kbd>A</kbd></span><span>Boost</span>
    <span><kbd>B</kbd></span><span>Handbrake — drift</span>
    <span><kbd>X</kbd></span><span>Reset car onto the road</span>
    <span><kbd>Y</kbd></span><span>Recenter your seat</span>
    <span><kbd>R stick click</kbd></span><span>Unlimited nitrous on or off (World Drive)</span>
    <span><kbd>L stick click</kbd></span><span>Use a gas can</span>
  </div><p class="note">Enter VR from Settings in the Meta Quest Browser. Story races continue to the next race automatically while you are in the headset.</p>`;
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
  endSink(); player.y = 0; player.vy = 0; player.pitch = player.roll = 0; player.air = false;
  if (race) { race.dispose(); race = null; }
  if (attract) { attract.dispose(); attract = null; }
  if (track) { track.dispose(scene); track = null; }
  world.setVisible(false); world.clear();
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  clearTraffic(); spray.clear(); wake.clear(); W.onWater = W.wasWet = false;
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
  player.maxSpeed = 40; player.infBoost = false; attract.onHit = null;
  $('#hud').hidden = true; show('menu');
}
function startStory(lv) {
  clearMode(); mode = 'story'; level = lv; player.maxSpeed = 52; player.boost = 1; player.infBoost = false;
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
  clearMode(); mode = 'world'; player.maxSpeed = 46; player.boost = 1; W.poiT = new Map();
  applyEnv(WORLD_ENV, 140, 620); ground.visible = false;
  world.setVisible(true); world.setOrigin(lat, lon); W.originName = name;
  clearGps(false); player.fly = null;
  W.score = 0; W.dist = 0; W.combo = 0; player.fuel = 1; player.power = 1; W.fuelWarn = 0; W.canT = 0;
  setHud('world'); beginSpawn(); show('none');
}
function beginSpawn() {
  endSink(); clearTraffic(); spray.clear(); wake.clear();
  W.spawning = true; W.spawnT = 0; player.place(0, 0, 0, 0); player.pitch = player.roll = 0; player.vx = player.vz = 0;
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  $('#wLoading').hidden = false; $('#wLoadTxt').textContent = 'Loading streets from OpenStreetMap…';
  camera.position.set(30, 60, 30);
}
world.onStatus = s => { if (W.spawning && s) $('#wLoadTxt').textContent = s; };
function setHud(kind) {
  $('#hud').hidden = false; $('#hud').classList.toggle('hud-world', kind === 'world');
  $('#hPos').hidden = $('#hLap').hidden = kind !== 'story';
  $('#hScore').hidden = $('#hDist').hidden = $('#hStreet').hidden = kind !== 'world';
  $('#wrong').hidden = true; $('#wLoading').hidden = true; $('#countdown').textContent = ''; $('#bridgeBtn').hidden = kind !== 'world';
  $('#hUnit').textContent = S.units === 'kmh' ? 'km/h' : 'mph';
  updateNitroHud(kind);
  updateMpBadge();
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
  const rows = race.ranked.map((o, i) => `<li class="${o === r ? 'me' : ''}"><span class="p">${i + 1}</span>${o === r ? avatarHtml(S.avatar, S.name || 'You', o.car.mesh.userData.paint.color.getStyle(), 22) : `<i class="dot" style="background:${o.car.mesh.userData.paint.color.getStyle()}"></i>`}<span class="n">${o === r && S.name ? escapeHtml(S.name) : o.name}</span><span class="t">${o.finished ? fmt(o.finishTime) : 'running'}</span></li>`).join('');
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
    const o = W.orbs[i]; o.mesh.position.y = (o.y || 0) + 1.6 + Math.sin(t * 2 + o.ph) * 0.3; o.mesh.rotation.y += dt * 1.6;
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
      m.position.set(p[0], 1.6, p[1]); scene.add(m); W.orbs.push({ x: p[0], z: p[1], y: world.groundY(p[0], p[1]), mesh: m, ph: Math.random() * 6 });
    }
  }
}
function updateRemotes(dt) {
  if (!world.lat0) return;
  for (const [id, pl] of net.players) {
    if (pl.lat == null) continue;
    let r = W.remotes.get(id);
    if (!r) {
      const c = new Car(pl.color, modelById(pl.model).id); c.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(c.mesh);
      const [x, z] = world.proj(pl.lat, pl.lon); r = { car: c, x, z, yaw: pl.yaw, color: pl.color, model: c.model, tagKey: null }; W.remotes.set(id, r); c.place(x, z, pl.yaw);
    }
    if (r.color !== pl.color) { setPaint(r.car.mesh, pl.color); r.color = pl.color; r.tagKey = null; }
    if (pl.model && r.model !== pl.model) { r.car.setModel(modelById(pl.model).id); r.car.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); r.model = pl.model; }
    syncLooks(r.car, net.assets.get(id + '|glb'), net.assets.get(id + '|skin'), pl.color);
    const tk = pl.name + '|' + pl.color + '|' + (pl.av ? pl.av.length : 0);
    if (r.tagKey !== tk && !r.tagBusy) {
      r.tagKey = tk; const apply = img => { const old = r.car.mesh.children.find(o => o.isSprite); if (old) { r.car.mesh.remove(old); old.material.map.dispose(); old.material.dispose(); } r.car.mesh.add(nameTag(pl.name, pl.color, img)); };
      if (pl.av && /^data:image\/(jpeg|png|webp);base64,/.test(pl.av)) { r.tagBusy = true; const im = new Image(); im.onload = () => { r.tagBusy = false; apply(im); }; im.onerror = () => { r.tagBusy = false; apply(null); }; im.src = pl.av; } else apply(null);
    }
    const [tx, tz] = world.proj(pl.lat, pl.lon), age = (performance.now() - pl.t) / 1000;
    const f = [Math.sin(pl.yaw), Math.cos(pl.yaw)], ex = tx + f[0] * pl.speed * Math.min(age, 0.25), ez = tz + f[1] * pl.speed * Math.min(age, 0.25);
    const k = 1 - Math.exp(-dt * 10);
    if (Math.hypot(ex - r.x, ez - r.z) > 60) { r.x = ex; r.z = ez; } else { r.x += (ex - r.x) * k; r.z += (ez - r.z) * k; }
    let dy = pl.yaw - r.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; r.yaw += dy * k;
    r.car.x = r.x; r.car.z = r.z; r.car.yaw = r.yaw; r.alt = (r.alt || 0) + ((pl.h || 0) - (r.alt || 0)) * k; const gy = world.groundY(r.x, r.z, r.alt > 1 ? null : r.car.y ?? null); r.car.y = gy + Math.max(0, r.alt);
    r.car.pitch = pl.h > 0.5 ? (r.car.pitch || 0) + ((pl.pi || 0) - (r.car.pitch || 0)) * k : 0; r.car.roll = pl.h > 0.5 ? (r.car.roll || 0) + ((pl.ro || 0) - (r.car.roll || 0)) * k : 0; r.car.sync(dt, pl.speed, 0);
    // soft collision with player
    const dx = player.x - r.x, dz = player.z - r.z, d = Math.hypot(dx, dz);
    if (mode === 'world' && !paused && d < 3 && d > 0.01 && Math.abs((player.y || 0) - r.car.y) < 2.5) { const nx = dx / d, nz = dz / d; player.x += nx * (3 - d); player.z += nz * (3 - d); const hit = player.bump(nx, nz, 0.3); if (hit > 3) { Audio.thud(hit / 8); camShake = 0.3; } player.sync(0); }
  }
  for (const [id, r] of W.remotes) if (!net.players.has(id)) { scene.remove(r.car.mesh); W.remotes.delete(id); }
}
// ---------- terrain driving ----------
function terrainStep(dt) {
  const p = player, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx, cy = p.y || 0;
  const G = S.waterDrive ? (x, z) => world.inWater(x, z) ? world.heightAt(x, z) - 0.3 : world.groundY(x, z, cy) : (x, z) => world.groundY(x, z, cy);
  const hF = G(p.x + fx * 1.6, p.z + fz * 1.6), hB = G(p.x - fx * 1.6, p.z - fz * 1.6), hR = G(p.x + rx * 0.9, p.z + rz * 0.9), hL = G(p.x - rx * 0.9, p.z - rz * 0.9);
  const ground = (hF + hB + hR + hL) / 4, slopeF = (hF - hB) / 3.2, slopeR = (hR - hL) / 1.8;
  if (p.vy == null) p.vy = 0;
  if (p.air) {
    p.vy -= 24 * dt; p.y = cy + p.vy * dt;
    if (p.y <= ground) { const impact = -p.vy; p.y = ground; p.air = false; p.vy = 0; if (impact > 6) { Audio.thud(Math.min(3, impact / 6)); camShake = Math.min(0.5, impact * 0.03); } }
  } else {
    const vyGround = (ground - cy) / Math.max(dt, 1e-3);
    // leave the ground when it falls away faster than gravity can follow (crests at speed)
    if (ground < cy - 0.35 && Math.abs(p.speed) > 12) { p.air = true; p.vy = Math.min(8, Math.max(-2, p.lastVy || 0)); p.y = cy + p.vy * dt; }
    else { p.y = ground; p.lastVy = Math.max(-20, Math.min(20, vyGround)); }
  }
  if (!p.air) {
    // gravity along the slope: uphill slows you, downhill speeds you up
    const a = -9.8 * slopeF / Math.sqrt(1 + slopeF * slopeF) * 0.85; p.vx += fx * a * dt; p.vz += fz * a * dt;
  }
  const tp = -Math.atan(slopeF), tr = Math.atan(slopeR), k = 1 - Math.exp(-dt * (p.air ? 2 : 12));
  p.pitch = (p.pitch || 0) + ((p.air ? tp * 0.5 : tp) - (p.pitch || 0)) * k; p.roll = (p.roll || 0) + (tr - (p.roll || 0)) * k;
  if (W.onWater && !p.air) { const tb = performance.now() / 1000; p.y += Math.sin(tb * 2.6 + p.x * 0.05) * 0.03; p.pitch += Math.sin(tb * 1.7) * 0.012; p.roll += Math.sin(tb * 2.1 + 1) * 0.015; }
  p.sync(0);
}
// ---------- drive on water ----------
// The water mesh is interpolated between sparse terrain samples, so aim the effects at the top of what's nearby: they then never hide under the surface
function waterSurfaceY(x, z) { let h = world.heightAt(x, z); for (const [a, b] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) h = Math.max(h, world.heightAt(x + a, z + b)); return h - 0.25; }
function waterDriveChanged() {
  if (!S.waterDrive) { W.onWater = false; } else if (W.sink) endSink();
  renderSettings();
  hudMsg(S.waterDrive ? 'WATER DRIVING ON' : 'WATER DRIVING OFF', 1200);
  if (S.waterDrive) toast('Water driving on — just drive straight onto lakes and rivers', 2800);
}
function toggleWaterDrive() { S.waterDrive = !S.waterDrive; Audio.click(); waterDriveChanged(); }
function placeW(x, z, yaw) { player.fly = null; player.place(x, z, yaw, world.groundY(x, z)); player.pitch = player.roll = 0; player.sync(0); }

// ---------- drowning ----------
const splashGeo = new THREE.SphereGeometry(0.35, 6, 4), splashMat = new THREE.MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.9, depthWrite: false });
const splashRingGeo = new THREE.RingGeometry(0.8, 1.2, 32); splashRingGeo.rotateX(-Math.PI / 2);
function startSink() {
  const sp = Math.hypot(player.vx, player.vz);
  W.sink = { t: 0, y0: player.y || 0, vx: player.vx * 0.35, vz: player.vz * 0.35, parts: [], rings: [], tilt: Math.min(0.5, 0.15 + sp * 0.01) };
  W.combo = 0; W.score = Math.max(0, W.score - 50); W.drowns = (W.drowns || 0) + 1;
  Object.assign(player.input, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false });
  Audio.splash(); camShake = 0.35; hudMsg('SPLASH — CAR LOST', 2200);
  const n = 26 + Math.min(30, sp);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(splashGeo, splashMat.clone()); const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
    m.position.set(player.x + Math.cos(a) * r, (player.y || 0) + 0.3, player.z + Math.sin(a) * r); m.scale.setScalar(0.6 + Math.random() * 1.2); scene.add(m);
    W.sink.parts.push({ m, vx: Math.cos(a) * (2 + Math.random() * 4) + player.vx * 0.2, vy: 5 + Math.random() * 7 + sp * 0.08, vz: Math.sin(a) * (2 + Math.random() * 4) + player.vz * 0.2 });
  }
  const wy = world.heightAt(player.x, player.z) - 0.2;
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(splashRingGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false })); m.position.set(player.x, wy, player.z); scene.add(m); W.sink.rings.push({ m, d: k * 0.35 }); }
}
function updateSink(dt) {
  const S_ = W.sink; S_.t += dt;
  S_.vx *= Math.exp(-dt * 2.2); S_.vz *= Math.exp(-dt * 2.2);
  player.x += S_.vx * dt; player.z += S_.vz * dt; player.sync(dt, 0, 0);
  const k = Math.min(1, S_.t / 1.6), m = player.mesh;
  m.position.y = S_.y0 - k * k * 2.2; m.rotation.x = S_.tilt * Math.min(1, S_.t * 2); m.rotation.z = Math.sin(S_.t * 3) * 0.06 * (1 - k);
  for (const p of S_.parts) { p.vy -= 18 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(S_.y0 - 0.2, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt; p.m.material.opacity = Math.max(0, 0.9 - S_.t * 0.6); }
  for (const r of S_.rings) { const tt = Math.max(0, S_.t - r.d); r.m.scale.setScalar(1 + tt * 5); r.m.material.opacity = Math.max(0, 0.7 - tt * 0.35); }
  if (S_.t > 2.4) endSink();
}
function endSink() {
  const S_ = W.sink; if (!S_) return;
  S_.parts.forEach(p => { scene.remove(p.m); p.m.material.dispose(); }); S_.rings.forEach(r => { scene.remove(r.m); r.m.material.dispose(); });
  W.sink = null; const m = player.mesh; m.position.y = 0; m.rotation.x = 0; m.rotation.z = 0;
  let p = W.safe && !world.inWater(W.safe.x, W.safe.z) ? W.safe : null;
  if (!p) { const q = world.nearestRoadPoint(player.x, player.z, 2000); if (q) p = q; }
  if (p) placeW(p.x, p.z, p.yaw); player.vx = player.vz = 0;
  hudMsg('RESPAWNED', 1000);
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
  if (e.code === 'KeyC') { S.cam = (S.cam + 1) % 4; renderSettings(); hudMsg(['CHASE CAM', 'FAR CAM', 'HOOD CAM', 'COCKPIT CAM'][S.cam], 900); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyV' && mode === 'world' && !W.spawning) toggleWaterDrive();
  if (e.code === 'KeyB') buildBridge();
  if (e.code === 'KeyG' && mode === 'world') { S.infGas = !S.infGas; renderSettings(); hudMsg(S.infGas ? 'UNLIMITED GAS ON' : 'UNLIMITED GAS OFF', 1200); Audio.click(); }
  if (e.code === 'KeyF' && mode === 'world' && !paused) useGasCan();
  if (e.code === 'KeyX' && mode === 'world' && gps.active) clearGps(true);
  if (e.code === 'KeyN' && mode === 'world') { S.infNitro = !S.infNitro; renderSettings(); updateNitroHud(); hudMsg(S.infNitro ? 'UNLIMITED NITROUS ON' : 'UNLIMITED NITROUS OFF', 1200); Audio.click(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { if (vr.presenting) return; for (const k in keys) keys[k] = false; if ((mode === 'story' || mode === 'world') && !paused && !$('#hud').hidden) openPause(); });
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
  if (vr.presenting) readVR();
}
// ---------- VR input + cockpit ----------
let cockpit = null, gaugeT = 0, vrDt = 0, offPulseT = 0;
const cockpitView = () => (vr.presenting || S.cam === 3) && (mode === 'world' || mode === 'story');
function ensureCockpit() {
  const want = cockpitView();
  if (want && (!cockpit || cockpit.model !== player.model || cockpit.group.parent !== player.mesh || cockpit.ck !== (player.mesh.userData.customKey || ''))) {
    if (cockpit) { cockpit.group.parent && cockpit.group.parent.remove(cockpit.group); cockpit.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); cockpit.tex.dispose(); }
    for (const o of (cockpit && cockpit.hide) || []) o.visible = true;
    cockpit = buildCockpit(player.model, mini); cockpit.group.userData.cockpit = true; player.mesh.add(cockpit.group); cockpit.ck = player.mesh.userData.customKey || ''; cockpit.hide = cabinIntruders(player.mesh, cockpit);
  }
  if (cockpit) { cockpit.group.visible = want; for (const o of cockpit.hide) o.visible = !want; }
  // hide your own rider/helmet so it doesn't block your view
  player.mesh.traverse(o => { if (o.userData.rider) o.visible = !want; });
  if (vr.presenting && cockpit && want) vr.attach(player.mesh, cockpit.eye);
  return want;
}
// Body panels that cut through the cabin get hidden from the driver's seat; a painted hood stands in for them.
const _bx = new THREE.Box3(), _m4 = new THREE.Matrix4();
function cabinIntruders(car, ck) {
  const c = ck.cfg, e = ck.eye, half = c.single ? 0.26 : 0.5, frontY = c.dash ? c.dash.y : c.wheel.p[1], frontZ = c.dash ? c.dash.z : c.wheel.p[2];
  const cab = new THREE.Box3(new THREE.Vector3(e.x - half, frontY + 0.06, e.z - 0.25), new THREE.Vector3(e.x + half, e.y + 0.3, frontZ - 0.04));
  if (!c.single) { cab.min.x = Math.min(cab.min.x, -half); cab.max.x = Math.max(cab.max.x, half); }
  // the view forward over the nose: anything poking up above the dash line ahead of the driver
  const fwd = new THREE.Box3(new THREE.Vector3(e.x - half, frontY - 0.1, frontZ - 0.1), new THREE.Vector3(e.x + half, e.y + 0.3, 9));
  if (!c.single) { fwd.min.x = -1.3; fwd.max.x = 1.3; }
  car.updateMatrixWorld(true); const inv = _m4.copy(car.matrixWorld).invert(), out = [], whole = new THREE.Box3();
  let paintHidden = false;
  const shown = o => { for (let q = o; q && q !== car; q = q.parent) if (!q.visible) return false; return true; };
  car.userData.body.traverse(o => {
    if (!o.isMesh || o.userData.rider || !shown(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _bx.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); whole.union(_bx);
    const glass = o.material && (o.material.transparent || o.material.userData.glass);
    if (glass || _bx.intersectsBox(cab) || _bx.intersectsBox(fwd)) { out.push(o); if (o.material === car.userData.paint) paintHidden = true; }
  });
  if (paintHidden && c.dash) {
    // stand-in hood + cowl in the car's own paint, from the dash out to the nose
    const len = Math.max(0.3, whole.max.z - frontZ), w = Math.min(whole.max.x - whole.min.x, 2.2) * 0.94;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, len), car.userData.paint); hood.position.set(0, frontY - 0.06, frontZ + len / 2 - 0.05); hood.rotation.x = 0.04; ck.group.add(hood);
    [-1, 1].forEach(sd => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, Math.abs(e.z - frontZ) + 0.9), car.userData.paint); r.position.set(sd * (w / 2 - 0.02), frontY - 0.1, (e.z + frontZ) / 2); ck.group.add(r); });
  }
  return out;
}
function readVR() {
  if (!cockpit) return;
  const st = cockpit.cfg.wheel.style, inp = player.input;
  const v = vr.update(vrDt, cockpit.base, st, cockpit.cfg.wheel.R, cockpit.maxRot);
  if (v.throttle > 0.05) inp.throttle = v.throttle;
  if (v.brake > 0.05) inp.brake = v.brake;
  if (v.boost) inp.boost = true; if (v.hand) inp.handbrake = true;
  if (v.gripping) inp.steer = vr.wheelAngle / cockpit.maxRot;
  else {
    // no hands on the wheel: thumbstick steers, otherwise the wheel self-centres as you drive
    if (v.stick) vr.wheelAngle += (v.stick * cockpit.maxRot - vr.wheelAngle) * Math.min(1, vrDt * 8);
    else vr.wheelAngle *= Math.exp(-vrDt * (2 + Math.min(4, Math.abs(player.speed) * 0.15)));
    if (v.stick || !inp.steer) inp.steer = vr.wheelAngle / cockpit.maxRot;
  }
  W.vrPitch = v.pitch || 0;
  if (v.reset) resetCar();
  if (v.fuel) useGasCan();
  if (v.recenter) { vr.recenter(); hudMsg('VIEW RECENTERED', 900); }
  if (v.nitro && mode === 'world') { S.infNitro = !S.infNitro; updateNitroHud(); hudMsg(S.infNitro ? 'UNLIMITED NITROUS ON' : 'UNLIMITED NITROUS OFF', 1200); }
  if (player.offroad && Math.abs(player.speed) > 6 && (offPulseT -= vrDt) <= 0) { offPulseT = 0.12; vr.pulse(0.08 + Math.min(0.2, Math.abs(player.speed) * 0.004), 50); }
}
function updateCockpit(dt) {
  if (!cockpit || !cockpit.group.visible) return;
  if (!vr.presenting) vr.wheelAngle = player.steer * cockpit.maxRot; // desktop: wheel follows the keys
  cockpit.wheel.rotation.z = vr.wheelAngle;
  if ((gaugeT -= dt) > 0) return; gaugeT = 1 / 15;
  const unit = S.units === 'kmh' ? 'km/h' : 'mph', now = performance.now();
  let line1 = '', line2 = '', msg = now < vrMsg.until ? vrMsg.text : '';
  if (mode === 'world') { line1 = `${W.score.toLocaleString()} PTS`; line2 = W.spawning ? 'Loading streets…' : W.street || (S.infNitro ? 'Unlimited nitrous' : ''); const g = gpsLines(); if (g) line2 = `${g.arrow} ${g.a} · ${g.b.split(' · ')[0]}`; if (player.fly) line1 += `  ALT ${Math.round(((player.y || 0) - world.groundY(player.x, player.z, player.y)) * (S.units === 'mph' ? 3.281 : 1))}${S.units === 'mph' ? 'ft' : 'm'}`; }
  else if (mode === 'story' && race) { const r = race.player; line1 = `P${r.pos || race.racers.length}/${race.racers.length}  LAP ${Math.min(level.laps, r.lap + 1)}/${level.laps}`; line2 = fmt(race.time); const cd = $('#countdown').textContent; if (cd) msg = cd; }
  drawGauges(cockpit, { speed: toUnits(player.speed), unit, fuel: mode === 'world' ? (S.infGas ? -1 : player.fuel ?? 1) : null, electric: player.stats.electric, boost: player.boost, inf: player.infBoost, boosting: player.boosting, line1, line2, msg });
  if (cockpit.group.userData.miniTex) cockpit.group.userData.miniTex.needsUpdate = true;
}
// ---------- unlimited nitrous ----------
function updateNitroHud(kind = mode) { const on = S.infNitro && kind === 'world'; player.infBoost = on; if (on) player.boost = 1; $('#hBoost').parentElement.classList.toggle('inf', on); }
// ---------- gas stations & Wicdonald's ----------
// ---------- gas ----------
const fuelOn = () => mode === 'world' && !S.infGas;
function nearestFuel() { let best = null, bd = Infinity; for (const p of world.pois) if (p.kind === 'fuel') { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; }
const fmtDist = m => S.units === 'kmh' ? (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km') : (m < 1609 ? Math.round(m * 3.281 / 50) * 50 + ' ft' : (m / 1609).toFixed(1) + ' mi');
function updateFuel(dt) {
  if (!fuelOn()) { player.fuel = 1; player.power = 1; return; }
  const st = player.stats, d = Math.abs(player.speed) * dt;
  // harder throttle and nitrous burn more; idling barely sips
  const burn = d * (0.55 + 0.6 * (player.input.throttle || 0) + (player.boosting ? 1.2 : 0)) / st.range + (player.input.throttle ? dt * 0.0004 : 0);
  player.fuel = Math.max(0, (player.fuel ?? 1) - burn);
  player.power = player.fuel > 0 ? 1 : 0;
  if (player.fuel < 0.2 && W.fuelWarn < 1) { W.fuelWarn = 1; hudMsg(st.electric ? 'BATTERY LOW · FIND A GAS STATION' : 'LOW FUEL · FIND A GAS STATION', 2400); Audio.beep(false); }
  if (player.fuel <= 0 && W.fuelWarn < 2) { W.fuelWarn = 2; hudMsg(st.electric ? 'OUT OF CHARGE · LIMPING' : 'OUT OF GAS · LIMPING', 2600); Audio.beep(false); if (vr.presenting) vr.pulse(0.6, 200); }
  W.canT = Math.max(0, (W.canT || 0) - dt);
}
// jerry can: 25% for 50 points, or a free 10% splash when you're stuck and broke
function useGasCan() {
  if (!fuelOn()) return;
  if (player.fuel > 0.75) { hudMsg('TANK IS NEARLY FULL', 1000); return; }
  if (W.score >= 50) { W.score -= 50; player.fuel = Math.min(1, player.fuel + 0.25); hudMsg('GAS CAN · +25% · −50', 1500); Audio.chime(3); }
  else if (player.fuel <= 0.02) { if (W.canT > 0) { hudMsg(`ROADSIDE HELP IN ${Math.ceil(W.canT)} S`, 1000); return; } W.canT = 45; player.fuel = 0.1; hudMsg('ROADSIDE HELP · +10%', 1500); Audio.chime(2); }
  else { hudMsg('GAS CAN COSTS 50 POINTS', 1200); Audio.beep(false); return; }
  player.power = 1; W.fuelWarn = player.fuel < 0.2 ? 1 : 0;
}
let fuelHudT = 0;
function updateFuelHud(dt) {
  const w = $('#hFuelW'), on = mode === 'world'; w.hidden = !on; if (!on) { $('#hFuelHint').textContent = ''; return; }
  const inf = S.infGas, f = inf ? 1 : player.fuel ?? 1;
  $('#hFuel').style.transform = `scaleX(${f})`; w.classList.toggle('low', !inf && f < 0.2); w.classList.toggle('inf', inf);
  $('#hFuelL').textContent = player.stats.electric ? 'BATT' : 'GAS';
  if ((fuelHudT -= dt) > 0) return; fuelHudT = 0.5;
  let hint = '';
  if (!inf && f < 0.2) { const n = nearestFuel(); hint = n ? `Gas station ${fmtDist(n.d)}` : 'No gas station nearby'; if (f <= 0.02) hint += W.score >= 50 ? ' · F: gas can (50 pts)' : ' · F: roadside help'; }
  $('#hFuelHint').textContent = hint;
}
function updatePois() {
  if (!W.poiT) W.poiT = new Map(); const now = performance.now();
  for (const p of world.pois) {
    const d = Math.hypot(p.x - player.x, p.z - player.z); if (d > p.r + 4) continue;
    const last = W.poiT.get(p.key) || -1e9;
    if (p.kind === 'fuel' && d < 7.5) {
      // every visit tops up gas and nitrous; points only every 25 s per station
      const need = (player.fuel ?? 1) < 0.97 || player.boost < 0.97, el = player.stats.electric;
      player.fuel = 1; player.boost = 1; player.power = 1; W.fuelWarn = 0;
      if (now - last < 25000) { if (need) { hudMsg(el ? 'CHARGED · NITROUS FULL' : 'TANK FULL · NITROUS FULL', 1200); Audio.chime(3); } continue; }
      W.poiT.set(p.key, now); W.score += 25; Audio.chime(6); hudMsg(el ? 'CHARGED UP · NITROUS FULL · +25' : 'FILLED UP · GAS + NITROUS FULL · +25', 1800);
    } else if ((p.kind === 'wic' || p.kind === 'bq') && d < p.r && Math.abs(player.speed) < 14) {
      if (now - last < 60000) continue; W.poiT.set(p.key, now);
      W.score += 75; player.boost = Math.min(1, player.boost + 0.5); Audio.chime(8); hudMsg(p.kind === 'bq' ? 'BURGER QUEEN DRIVE-THRU · +75' : "WICDONALD'S DRIVE-THRU · +75", 1900);
    } else if (p.kind === 'store32' && d < p.r && Math.abs(player.speed) < 10) {
      if (now - last < 60000) continue; W.poiT.set(p.key, now);
      W.score += 60; player.boost = Math.min(1, player.boost + 0.35); Audio.chime(8); hudMsg('STORE32 · SUPPLY RUN · +60', 1900);
    } else if (p.kind === 'pizza' && d < p.r && Math.abs(player.speed) < 8 && !W.delivery) {
      if (now - last < 45000) continue; W.poiT.set(p.key, now);
      W.score += 50; player.fuel = Math.min(1, (player.fuel ?? 1) + 0.25); player.boost = Math.min(1, player.boost + 0.25); Audio.chime(7);
      startDelivery(p);
    }
  }
}
// ---------- GPS ----------
const POI_ICON = { store32: ['#14305f', '#ff8a1f', '3'], fuel: ['#12704a', '#fff', 'G'], wic: ['#c8261d', '#ffc72c', 'W'], bq: ['#1f5fa8', '#ffb43b', 'Q'], pizza: ['#0e7c47', '#fff', 'S'] };
const gps = new Gps(scene, world);
gps.onReroute = () => { if (gps.active) setGps(gps.dest, gps.label, true); };
async function setGps(dest, label = 'Map pick', reroute = false) {
  if (mode !== 'world') return;
  if (!reroute) { hudMsg('GPS · FINDING A ROUTE', 1200); Audio.click(); }
  const ok = await gps.route(world.unproj(player.x, player.z), dest, label);
  if (!ok) return;
  if (reroute) hudMsg('GPS · REROUTING', 900);
  else { hudMsg(gps.fallback ? 'GPS · NO ROAD ROUTE, FOLLOW THE LINE' : `GPS · ${fmtDist(gps.total).toUpperCase()} TO GO`, 1800); Audio.chime(4); }
  updateGpsHud();
}
function clearGps(say) { if (gps.active && say) { hudMsg('GPS CLEARED', 900); Audio.click(); } gps.clear(); W.delivery = null; updateGpsHud(); }
function updateGps(dt) {
  if (!gps.active) return;
  const ev = gps.update(dt, player.x, player.z, player.y || 0);
  if (W.delivery) { W.delivery.left -= dt; if (W.delivery.left <= 0) { hudMsg('PIZZA WENT COLD · DELIVERY FAILED', 2200); Audio.beep(false); clearGps(false); return; } }
  if (ev === 'arrive') {
    if (W.delivery) { const bonus = 150 + Math.round(W.delivery.left * 3); W.score += bonus; hudMsg(`PIZZA DELIVERED · +${bonus}`, 2400); Audio.chime(10); }
    else { W.score += 25; hudMsg('ARRIVED · +25', 1800); Audio.chime(6); }
    if (vr.presenting) vr.pulse(0.5, 150);
    clearGps(false); return;
  }
  W.gpsHudT = (W.gpsHudT || 0) - dt; if (W.gpsHudT <= 0) { W.gpsHudT = 0.25; updateGpsHud(); }
}
function gpsLines() {
  if (!gps.active) return null;
  if (gps.loading) return { arrow: '…', a: 'Finding a route', b: gps.label || '' };
  const timer = W.delivery ? ` · ${Math.max(0, Math.ceil(W.delivery.left))} s` : '';
  if (gps.fallback) return { arrow: '↑', a: 'Head toward the beacon', b: `${fmtDist(gps.remain ?? gps.total)} left${timer}` };
  const n = gps.next;
  return { arrow: stepArrow(n), a: stepText(n), b: `in ${fmtDist(gps.nextIn ?? 0)} · ${fmtDist(gps.remain ?? gps.total)} left${timer}` };
}
function updateGpsHud() {
  const el = $('#hGps'), g = mode === 'world' ? gpsLines() : null; el.hidden = !g; if (!g) return;
  $('#hGpsA').textContent = g.arrow; $('#hGpsT').textContent = g.a; $('#hGpsD').textContent = g.b;
  el.classList.toggle('pizza', !!W.delivery);
}
$('#hGpsX').onclick = () => clearGps(true);
function startDelivery(p) {
  // a real address 500 m – 1.2 km away; the GPS routes you there on real roads
  const a = Math.random() * Math.PI * 2, r = 500 + Math.random() * 700;
  let tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r;
  const rp = world.nearestRoadPoint(tx, tz, 250); if (rp) { tx = rp.x; tz = rp.z; }
  W.delivery = { left: 40 + r / 8 };
  hudMsg('SLICE STREET PIZZA PICKUP · +50 · DELIVER IT HOT', 2400);
  setGps(world.unproj(tx, tz), 'Pizza delivery');
}

// ---------- flying cars cheat (San Andreas style) ----------
const flyOn = () => S.flyCars && mode === 'world';
function pitchInput() { // + = pull the nose up
  const k = keys; let v = (k.KeyK || k.Numpad2 ? 1 : 0) - (k.KeyI || k.Numpad8 ? 1 : 0);
  if (touchKeys.up) v += 1; if (touchKeys.dn) v -= 1;
  if (vr.presenting && Math.abs(W.vrPitch || 0) > 0.15) v = W.vrPitch;
  return Math.max(-1, Math.min(1, v));
}
function takeOff() {
  const p = player; p.fly = { vx: p.vx, vy: 4, vz: p.vz, pitch: 0.14, roll: 0, t: 0 }; p.air = false; p.y = (p.y || 0) + 0.3;
  hudMsg('TAKEOFF', 900); Audio.chime(3);
}
function flyStep(dt) {
  const p = player, F = p.fly, inp = p.input, st = p.stats, pw = p.power ?? 1, pin = pitchInput();
  F.t += dt;
  p.boosting = inp.boost && p.boost > 0.02 && inp.throttle > 0 && pw > 0.5;
  if (p.boosting && !p.infBoost) p.boost = Math.max(0, p.boost - dt * 0.33); else if (p.infBoost) p.boost = 1; else p.boost = Math.min(1, p.boost + dt * 0.05);
  const sp = Math.hypot(F.vx, F.vy, F.vz), auth = Math.max(0.2, Math.min(1, sp / 22));
  // pitch, bank and yaw: like a light plane that still steers a little like a car
  F.pitch = Math.max(-1.3, Math.min(1.3, F.pitch + pin * 0.9 * auth * dt));
  const rollT = -inp.steer * 0.8; F.roll += (rollT - F.roll) * (1 - Math.exp(-dt * 2.6));
  p.steer += (inp.steer - p.steer) * Math.min(1, dt * 9);
  p.yaw += (inp.steer * 0.32 - Math.sin(F.roll) * 1.15) * auth * dt;
  const cp = Math.cos(F.pitch), nx = Math.sin(p.yaw) * cp, ny = Math.sin(F.pitch), nz = Math.cos(p.yaw) * cp;
  const top = p.maxSpeed * st.top * (p.boosting ? 1.28 : 1) * (0.22 + 0.78 * pw);
  const thrust = inp.throttle * p.accel * st.accel * 0.75 * (p.boosting ? 1.6 : 1) * (0.3 + 0.7 * pw) * Math.max(0, 1 - sp / (top * 1.05));
  F.vx += nx * thrust * dt; F.vy += ny * thrust * dt; F.vz += nz * thrust * dt;
  // gravity vs lift (lift grows with the square of airspeed and fades as you bank)
  const vf = F.vx * nx + F.vy * ny + F.vz * nz, g = 19;
  const L = g * Math.min(1.15, (Math.max(0, vf) / 30) ** 2) * Math.cos(F.roll), spi = Math.sin(F.pitch); // lift acts along the car's roof, not straight up
  F.vx -= spi * Math.sin(p.yaw) * L * dt; F.vz -= spi * Math.cos(p.yaw) * L * dt; F.vy += (-g + cp * L) * dt;
  // the airflow swings your velocity round to where the nose points
  const ka = 1 - Math.exp(-dt * 1.7 * auth), s2 = Math.hypot(F.vx, F.vy, F.vz);
  F.vx += (nx * s2 - F.vx) * ka; F.vy += (ny * s2 - F.vy) * ka; F.vz += (nz * s2 - F.vz) * ka;
  const drag = Math.exp(-dt * (0.05 + inp.brake * 0.9 + (inp.handbrake ? 0.4 : 0))); F.vx *= drag; F.vy *= drag; F.vz *= drag;
  p.x += F.vx * dt; p.z += F.vz * dt; p.y = (p.y || 0) + F.vy * dt;
  const col = world.collide(p.x, p.z, 1.4, p.y);
  if (col) { p.x += col.nx * col.depth; p.z += col.nz * col.depth; const vn = F.vx * col.nx + F.vz * col.nz; if (vn < 0) { F.vx -= 1.3 * vn * col.nx; F.vz -= 1.3 * vn * col.nz; F.vx *= 0.6; F.vz *= 0.6; if (-vn > 4) { Audio.thud(Math.min(3, -vn / 8)); camShake = Math.min(0.6, -vn * 0.03); if (vr.presenting) vr.pulse(0.7, 120); } } }
  const gy = world.groundY(p.x, p.z, p.y);
  p.vx = F.vx; p.vz = F.vz;
  if (p.y <= gy) {
    // touchdown: back to driving
    const impact = -F.vy; p.y = gy; p.vy = 0; p.air = false; p.fly = null;
    if (impact > 14 || F.pitch < -0.55) { const k = 0.5; p.vx *= k; p.vz *= k; Audio.thud(Math.min(3, impact / 6)); camShake = 0.5; if (F.t > 1) hudMsg('HARD LANDING', 1000); if (vr.presenting) vr.pulse(1, 200); }
    else if (F.t > 2) hudMsg('LANDED', 800);
    p.pitch = 0; p.roll = 0; p.sync(0); return;
  }
  p.pitch = -F.pitch; p.roll = F.roll;
  p.sync(dt, vf, 0);
  W.dist += sp * dt;
}
// ---------- bridge building ----------
const BRIDGE_COST = 250;
function buildBridge() {
  if (mode !== 'world' || paused || W.spawning || W.sink) return;
  if (W.score < BRIDGE_COST) { hudMsg(`NEED ${BRIDGE_COST} POINTS · YOU HAVE ${W.score}`, 1600); Audio.beep(false); return; }
  if (player.air) { hudMsg('LAND FIRST', 900); return; }
  // build in the direction the car is travelling (backwards if reversing)
  const yaw = player.speed < -1 ? player.yaw + Math.PI : player.yaw;
  const plan = world.planBridge(player.x, player.z, yaw, player.y || 0);
  if (!plan.ok) { hudMsg(plan.reason, 1600); Audio.beep(false); return; }
  W.score -= BRIDGE_COST; const res = world.buildBridge(plan);
  Audio.chime(6); camShake = 0.25; hudMsg(`BRIDGE BUILT · ${Math.round(plan.len)} m · −${BRIDGE_COST}`, 1800);
  toast(plan.water ? `${res.name}: ${Math.round(plan.len)} m across the water` : `${res.name}: ${Math.round(plan.len)} m overpass`, 2400);
  updateBridgeBtn();
}
function updateBridgeBtn() {
  const b = $('#bridgeBtn'); if (!b) return; const on = mode === 'world' && !W.spawning;
  b.hidden = !on; if (!on) return; const can = W.score >= BRIDGE_COST;
  if (b._can !== can) { b._can = can; b.classList.toggle('ready', can); b.setAttribute('aria-disabled', String(!can)); }
}
$('#bridgeBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); buildBridge(); });
function resetCar() {
  if (mode === 'story' && race) { race.resetPlayer(); hudMsg('RESET', 700); }
  if (mode === 'world' && !W.spawning) { const p = world.nearestRoadPoint(player.x, player.z, 300); if (p) placeW(p.x, p.z, p.yaw); else placeW(player.x, player.z, player.yaw); hudMsg('RESET', 700); }
}
document.addEventListener('pointerdown', () => { if (!Audio.ready) { Audio.init(); Audio.setVolume('master', S.master); Audio.setVolume('music', S.musicVol); Audio.setVolume('sfx', S.sfx); Audio.setMusic(S.music); } }, { capture: true });

// ---------- world setup / multiplayer setup ----------
$('#wGo').onclick = () => { Audio.init(); startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name); };
function myInfo() { return { name: (S.name || 'Driver').slice(0, 16), color: PAINTS[S.paint].color, model: S.model, av: S.avatarNet }; }
function curLatLon() { if (mode === 'world' && world.lat0 != null && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); return { lat: la, lon: lo }; } return { lat: chosenLoc.lat, lon: chosenLoc.lon }; }
net.originFn = curLatLon;
$('#mpName').addEventListener('input', e => { S.name = e.target.value.trim(); syncNameInputs(e.target); updateDriverChips(); });
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
let leafGps = null, leafGpsV = -1;
let tab = 'map', leaf = null, leafMe = null, leafOthers = new Map(), leafTrack = null, leafTimer = 0;
function openPause(t = tab) {
  if (mode !== 'story' && mode !== 'world') return;
  if (vr.presenting) return; // menus are flat-screen only
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
      const box = document.createElement('div'); box.className = 'mappop';
      const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = txt; b.onclick = fn; box.appendChild(b); };
      mk('Teleport here', 'cta', () => { leaf.closePopup(); teleport(e.latlng.lat, e.latlng.lng, 'Map pick'); });
      mk('GPS route here', 'cta gpsb', () => { leaf.closePopup(); setGps([e.latlng.lat, e.latlng.lng], 'Map pick'); resume(); });
      if (gps.active) mk('Clear GPS', 'ghost', () => { leaf.closePopup(); clearGps(true); });
      L.popup().setLatLng(e.latlng).setContent(box).openOn(leaf);
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
    $('#mapTitle').textContent = 'World map'; $('#mapSub').textContent = `You are near ${W.street || W.originName || 'the start'} · click anywhere on the map to teleport or set a GPS route.`;
    setTimeout(() => { leaf.invalidateSize(); leaf.setView([la, lo], 16); }, 30);
  }
  updateMapMarkers();
}
function updateMapMarkers() {
  const L = window.L; if (!leaf || !L) return;
  const [la, lo] = myLatLon();
  if (!leafMe) leafMe = L.marker([la, lo], { icon: pinIcon(PAINTS[S.paint].color, bearingOf(player.yaw), true), zIndexOffset: 1000 }).addTo(leaf).bindTooltip('You');
  else { leafMe.setLatLng([la, lo]); leafMe.setIcon(pinIcon(PAINTS[S.paint].color, bearingOf(player.yaw), true)); }
  if (leafGpsV !== gps.version) {
    leafGpsV = gps.version; if (leafGps) { leafGps.remove(); leafGps = null; }
    if (gps.active && gps.pts.length > 1 && mode === 'world') { leafGps = L.layerGroup([L.polyline(gps.pts.map(([x, z]) => world.unproj(x, z)), { color: '#1d4f91', weight: 9, opacity: 0.6 }), L.polyline(gps.pts.map(([x, z]) => world.unproj(x, z)), { color: '#3aa8ff', weight: 5 }), L.circleMarker(gps.dest, { radius: 8, color: '#fff', weight: 3, fillColor: '#3aa8ff', fillOpacity: 1 }).bindTooltip(gps.label || 'Destination')]).addTo(leaf); }
  }
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
    $('#pmName').oninput = e => { S.name = e.target.value.trim(); syncNameInputs(e.target); updateDriverChips(); };
    $('#pmHost').onclick = () => doHost($('#pmStatus'), false);
    $('#pmJoin').onclick = () => { paused = false; doJoin($('#pmCode').value, $('#pmStatus')); };
    return;
  }
  const list = [`<div>${avatarHtml(S.avatar, S.name || 'Driver', PAINTS[S.paint].color, 28)}<span>${escapeHtml(S.name || 'Driver')} (you)</span><small>${net.role}</small></div>`];
  for (const [id, p] of net.players) list.push(`<div>${avatarHtml(p.av && /^data:image\/(jpeg|png|webp);base64,/.test(p.av) ? p.av : null, p.name, p.color, 28)}<span>${escapeHtml(p.name)}</span>${p.lat != null ? `<button class="ghost sm" data-goto="${id}">Go to</button>` : '<small>connecting</small>'}</div>`);
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
    if (world.water.groups) { const st = 12; c.fillStyle = 'rgba(80,150,220,.55)'; const gx = Math.round(player.x / st) * st, gz = Math.round(player.z / st) * st;
      for (let x = gx - R; x <= gx + R; x += st) for (let z = gz - R; z <= gz + R; z += st) if (world.water.inside(x, z)) { const [a, b] = P(x, z); c.beginPath(); c.arc(a, b, st * s * 0.78, 0, 7); c.fill(); } }
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const sg of (world.roadCells.get(i + ',' + j) || [])) {
      if (seen.has(sg)) continue; seen.add(sg);
      const [a, b] = P(sg.x0, sg.z0), [d, e] = P(sg.x1, sg.z1); c.strokeStyle = sg.walk ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.7)'; c.lineWidth = Math.max(1.2, sg.hw * 2 * s); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
    }
    if (gps.active && gps.pts.length > 1) {
      c.lineJoin = 'round'; c.beginPath(); let on = false;
      for (let i = Math.max(0, gps.idx); i < gps.pts.length; i++) { const q = gps.pts[i]; if (Math.abs(q[0] - player.x) > R * 3 || Math.abs(q[1] - player.z) > R * 3) { if (on) break; continue; } const [a, b] = i === gps.idx && on === false ? P(player.x, player.z) : P(q[0], q[1]); on ? c.lineTo(a, b) : c.moveTo(a, b); on = true; }
      c.strokeStyle = 'rgba(10,40,90,.7)'; c.lineWidth = 7; c.stroke(); c.strokeStyle = '#3aa8ff'; c.lineWidth = 4; c.stroke();
      let [ea, eb] = P(gps.endPt[0], gps.endPt[1]); const dd = Math.hypot(ea - w / 2, eb - h / 2), lim = w / 2 - 10; if (dd > lim) { ea = w / 2 + (ea - w / 2) * lim / dd; eb = h / 2 + (eb - h / 2) * lim / dd; }
      c.fillStyle = '#3aa8ff'; c.beginPath(); c.arc(ea, eb, 6, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    }
    for (const o of W.orbs) { const [a, b] = P(o.x, o.z); c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(a, b, 3, 0, 7); c.fill(); }
    c.font = '800 9px Satoshi, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of world.pois) { if (Math.abs(p.x - player.x) > R * 1.5 || Math.abs(p.z - player.z) > R * 1.5) continue; const [a, b] = P(p.x, p.z); const ic = POI_ICON[p.kind] || POI_ICON.fuel;
      c.fillStyle = ic[0]; c.beginPath(); c.arc(a, b, 6.5, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.3; c.stroke(); c.fillStyle = ic[1]; c.fillText(ic[2], a, b + 0.5); }
    for (const r of W.remotes.values()) { let [a, b] = P(r.x, r.z); const dd = Math.hypot(a - w / 2, b - h / 2), lim = w / 2 - 8; if (dd > lim) { a = w / 2 + (a - w / 2) * lim / dd; b = h / 2 + (b - h / 2) * lim / dd; } c.fillStyle = r.color; c.beginPath(); c.arc(a, b, 5, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); }
    // north marker
    const [na, nb] = [w / 2 + (0 * rx + -1 * rz) * (w / 2 - 12), h / 2 - (0 * fx + -1 * fz) * (w / 2 - 12)];
    c.fillStyle = '#ff5a3c'; c.font = '700 14px Chakra Petch'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', na, nb);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w / 2, h / 2 - 9); c.lineTo(w / 2 + 6, h / 2 + 6); c.lineTo(w / 2, h / 2 + 3); c.lineTo(w / 2 - 6, h / 2 + 6); c.closePath(); c.fill();
  }
  c.restore();
}

// ---------- camera ----------
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), _qCock = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, Math.PI, 0, 'YXZ')), _camW = new THREE.Vector3();
function updateCamera(dt, car, cinematic) {
  const f = [Math.sin(car.yaw), Math.cos(car.yaw)];
  if (cinematic) {
    camAngle += dt * 0.12; const r = screen === 'garage' ? 7.5 : 11;
    camPos.set(car.x + Math.cos(camAngle) * r, screen === 'garage' ? 2.6 : 4.2, car.z + Math.sin(camAngle) * r);
    camera.position.copy(camPos); camera.lookAt(car.x, 1, car.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    return;
  }
  if (vr.presenting) { if (camera.near !== 0.05) { camera.near = 0.05; camera.updateProjectionMatrix(); } return; }
  if (S.cam === 3 && cockpit && cockpit.group.visible) {
    // desktop cockpit view from the driver's seat
    camera.position.copy(cockpit.eye); car.mesh.localToWorld(camera.position);
    car.mesh.getWorldQuaternion(camera.quaternion); camera.quaternion.multiply(_qCock);
    const fov = 72 + (car.boosting ? 5 : 0); camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.near = 0.05; camera.updateProjectionMatrix(); return;
  }
  if (camera.near !== 0.3) camera.near = 0.3;
  const sp = Math.abs(car.speed), cam = S.cam, cy = car.y || 0;
  let dist = cam === 1 ? 13 : 8.2, hgt = cam === 1 ? 5.5 : 3.3;
  if (cam === 2) { camPos.set(car.x + f[0] * 0.3, cy + 1.55, car.z + f[1] * 0.3); camera.position.copy(camPos); camTarget.set(car.x + f[0] * 12, cy + 1.2 - (car.pitch || 0) * 12, car.z + f[1] * 12); }
  else {
    dist += sp * 0.03;
    camPos.set(car.x - f[0] * dist, cy + hgt, car.z - f[1] * dist);
    if (car.fly) { const sp2 = Math.sin(car.fly.pitch); camPos.y -= sp2 * dist * 0.85; }
    if (mode === 'world') camPos.y = Math.max(camPos.y, world.heightAt(camPos.x, camPos.z) + 1.6);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * (mode === 'story' && race && !race.started ? 1.6 : 7)));
    camTarget.set(car.x + f[0] * 4, cy + 1.1, car.z + f[1] * 4);
    if (car.fly) camTarget.y += Math.sin(car.fly.pitch) * 6;
    if (mode === 'world') camera.position.y = Math.max(camera.position.y, world.heightAt(camera.position.x, camera.position.z) + 1.2);
  }
  if (camShake > 0) { camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake * 0.5; camShake = Math.max(0, camShake - dt * 2); }
  camera.lookAt(camTarget);
  const fov = 62 + Math.min(sp, 70) * 0.22 + (car.boosting ? 6 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const toUnits = v => Math.round(Math.abs(v) * (S.units === 'kmh' ? 3.6 : 2.237));
function updateHud(dt) {
  { const tf = $('#tFly'); if (tf) tf.hidden = !flyOn(); }
  $('#hSpeed').textContent = toUnits(player.speed);
  updateFuelHud(dt); $('#hBoost').style.transform = `scaleX(${player.boost})`; $('#hBoost').parentElement.classList.toggle('on', player.boosting);
  if (mode === 'story' && race) {
    const r = race.player; $('#hPos').innerHTML = `<b>${r.pos || race.racers.length}</b><span>/${race.racers.length}</span>`;
    $('#hLap').innerHTML = `<small>LAP</small><b>${Math.min(level.laps, r.lap + 1)}/${level.laps}</b>`;
    $('#hTimes').innerHTML = `<div><small>TIME</small>${fmt(race.time)}</div><div><small>LAST</small>${fmt(r.lastLap)}</div><div><small>BEST</small>${fmt(r.bestLap)}</div>`;
    $('#wrong').hidden = !(r.wrongWay > 1.2 && race.started && !r.finished);
  } else if (mode === 'world') {
    $('#hScore').innerHTML = `<small>SCORE</small><b>${W.score.toLocaleString()}</b>`;
    $('#hDist').innerHTML = `<small>DIST</small><b>${S.units === 'kmh' ? (W.dist / 1000).toFixed(1) + ' km' : (W.dist / 1609).toFixed(1) + ' mi'}</b>`;
    const [la, lo] = world.unproj(player.x, player.z);
    $('#hTimes').innerHTML = `<div><small>LAT</small>${la.toFixed(5)}</div><div><small>LON</small>${lo.toFixed(5)}</div>${world.elev.enabled ? `<div><small>ALT</small>${Math.round(S.units === 'kmh' ? world.elev.absolute(player.y || 0) : world.elev.absolute(player.y || 0) * 3.281)} ${S.units === 'kmh' ? 'm' : 'ft'}</div>` : ''}`;
    const st = $('#hStreet'); st.hidden = !W.street; st.textContent = W.street;
  }
}

// ---------- main loop ----------
let last = performance.now(), t = 0, miniT = 0, sendT = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt; vrDt = dt;
  syncLooks(player, looks.glb, looks.skin, PAINTS[S.paint].color, true);
  ensureCockpit();
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
      if (race.finished) { if (finishTimer === 0) { hudMsg(race.player.place === 1 ? 'YOU WIN' : `FINISHED P${race.player.place}`, 2600); Audio.chime(3); } finishTimer += dt; if (vr.presenting && mode === 'story') { if (finishTimer > 7) { const won = (race.player.place || 9) <= (level.goal || 3), nxt = won && LEVELS[level.id + 1]; showResults(); startStory(nxt && (S.unlockAll || progress.unlocked > level.id + 1) ? nxt : level); } } else if (finishTimer > 3 && mode === 'story' && screen !== 'results') { showResults(); } }
    }
    updateCamera(dt, player, false);
    Audio.engine(player.speed, paused ? 0 : player.input.throttle, player.slip, !paused);
    updateHud(dt);
  } else if (mode === 'world') {
    world.update(player.x, player.z, player.vx || 0, player.vz || 0);
    updateTraffic(dt);
    if (W.spawning) {
      W.spawnT += dt;
      const p = world.tileCount() > 0 ? world.nearestRoadPoint(0, 0, W.spawnT > 8 ? 1500 : 450) : null;
      if (p) { placeW(p.x, p.z, p.yaw); W.spawning = false; $('#wLoading').hidden = true; hudMsg(p.seg.name ? p.seg.name.toUpperCase() : 'GO EXPLORE', 2000); camera.position.set(p.x - Math.sin(p.yaw) * 30, player.y + 18, p.z - Math.cos(p.yaw) * 30); }
      else if (W.spawnT > 25) { W.spawning = false; $('#wLoading').hidden = true; toast('Map data is slow to load here — drive on, streets will appear as they arrive', 4500); }
      const sy = world.heightAt(player.x, player.z); camera.position.lerp(new THREE.Vector3(player.x + 40, sy + 70, player.z + 40), 1 - Math.exp(-dt)); camera.lookAt(player.x, sy, player.z);
    } else {
      if (!paused && W.sink) updateSink(dt);
      else if (!paused) {
        readInput();
        const loaded = tileReadyAt(player.x, player.z);
        const wet = S.waterDrive && loaded && !player.fly && world.inWater(player.x, player.z);
        W.onWater = wet;
        player.offroad = loaded && world.roadCells.size > 0 && !wet && !world.onRoad(player.x, player.z, 1.4);
        if (player.fly) flyStep(dt);
        else {
        player.update(dt, wet ? 0.55 : 1);
        const col = world.onDeck(player.x, player.z, player.y || 0) ? null : world.collide(player.x, player.z, 1.4);
        if (col) { player.x += col.nx * col.depth; player.z += col.nz * col.depth; const hit = player.bump(col.nx, col.nz, 0.25); if (hit > 4) { Audio.thud(hit / 8); camShake = Math.min(0.6, hit * 0.03); if (vr.presenting) vr.pulse(Math.min(1, hit / 15), 120); } player.sync(0); }
        terrainStep(dt);
        if (flyOn() && pitchInput() > 0.3 && player.speed > 18) takeOff();
        }
        W.dist += Math.abs(player.speed) * dt;
        W.safeT -= dt;
        if (player.fly) { /* in the air */ }
        else if (loaded && !S.waterDrive && world.inWater(player.x, player.z) && world.inWater(player.x - Math.sin(player.yaw) * 1.8 * Math.sign(player.speed || 1), player.z - Math.cos(player.yaw) * 1.8 * Math.sign(player.speed || 1))) startSink();
        else if (W.safeT <= 0 && loaded && world.onRoad(player.x, player.z, 0) && !world.water.inside(player.x, player.z)) { W.safeT = 0.4; W.safe = { x: player.x, z: player.z, yaw: Math.abs(player.speed) > 1 && player.speed < 0 ? player.yaw + Math.PI : player.yaw }; }
        if (wet && !player.air) {
          const wy = waterSurfaceY(player.x, player.z);
          if (!W.wasWet && Math.abs(player.speed) > 5) { spray.burst(player, wy); Audio.wash(Math.min(1, Math.abs(player.speed) / 30)); }
          spray.emit(player, dt, wy); wake.emit(player, dt, wy);
        }
        W.wasWet = wet; spray.setScale(renderer, camera, vr.presenting); spray.update(dt); wake.update(dt);
        updateOrbs(dt, t); updatePois(); updateFuel(dt); updateGps(dt);
        W.streetT -= dt; if (W.streetT <= 0) { W.streetT = 0.3; const info = world.roadInfo(player.x, player.z); W.street = info && info.dist < 4 && info.seg.name ? info.seg.name : (info && info.dist < 4 ? '' : W.street && info && info.dist < 12 ? W.street : ''); }
      }
      updateCamera(dt, player, false);
    }
    updateRemotes(dt);
    if (net.active && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); net.tick(dt, { lat: la, lon: lo, yaw: player.yaw, speed: paused ? 0 : player.speed, h: player.fly ? (player.y || 0) - world.groundY(player.x, player.z, player.y) : 0, pi: player.fly ? player.pitch : 0, ro: player.fly ? player.roll : 0 }); }
    sendT += dt; if (sendT > 1) { sendT = 0; updateMpBadge(); }
    Audio.engine(player.speed, paused ? 0 : player.input.throttle, player.slip, !paused && !W.spawning);
    updateHud(dt); updateBridgeBtn();
  }
  if (!paused && mode !== 'menu') { miniT += dt; if (miniT > 1 / 20) { miniT = 0; drawMini(); } }
  if (paused && tab === 'map' && leaf) { leafTimer += dt; if (leafTimer > 0.25) { leafTimer = 0; updateMapMarkers(); } }
  updateCockpit(dt);
  // sun & sky follow the action
  camera.getWorldPosition(_camW); const fx = _camW.x, fz = _camW.z;
  sky.position.copy(_camW);
  sun.position.set(player.x + 60, (player.y || 0) + 110, player.z + 40); sun.target.position.set(player.x, player.y || 0, player.z);
  if (mode !== 'world') ground.position.set(Math.round(fx / 100) * 100, -0.02, Math.round(fz / 100) * 100);
  { // blue nitrous flames + speed lines while actually driving
    const driving = (mode === 'world' && !W.spawning) || (mode === 'story' && !!level), live = driving && !paused && !(mode === 'world' && W.sink);
    if (live) { nitroFx.update(dt, player, true); speedFx.update(dt, toUnits(player.speed), player.boosting); }
    else { nitroFx.hide(); speedFx.hide(); }
  }
  renderer.render(scene, camera);
}

// ---------- boot ----------
renderGarage(); renderSettings(); renderControls(); renderLocPickers();
applyQuality(); startMenu();
last = performance.now(); renderer.setAnimationLoop(frame); // setAnimationLoop also drives the headset in VR
setTimeout(() => { const b = $('#boot'); b.style.opacity = 0; setTimeout(() => b.remove(), 500); }, 250);
window.__game = { looks, S, doHost: () => doHost($('#mpStatus')), doJoin: c => doJoin(c, $('#mpStatus')), useGasCan, camera, buildBridge, get W() { return W; }, showResults: () => showResults(), player, world, net, get race() { return race; }, get mode() { return mode; }, startWorld, startStory: i => startStory(LEVELS[i]), keys, gps, setGps, takeOff, openMap: () => openPause("map") };
