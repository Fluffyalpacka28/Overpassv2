import * as THREE from 'three';
import { Audio } from './audio.js';
import { createRide, seatEye, capacity } from './ride.js';
import { GarageSystem, GARAGE_COST } from './garage.js';
import { LIGHT_COLORS, loadLights, saveLights, syncCarLights, defaultLights, cleanLights, anyOn } from './carlights.js';
import { Car, PAINTS, MODELS, modelById, isBike, setPaint, nameTag, setCarEnv, setCarEnvLevel, trackCarMat, FRAMES, MPG_MAX, CUSTOM_LEVELS, CUSTOM_UPGRADES, CUSTOM_KITS, setCustomBuild, setFloaties, setDamage } from './car.js';
import { updateWater, waterAmbient, setWaterIce } from './water.js';
import { THEMES, LEVELS, RIVAL_COLORS, trackPoints, trackInfo, DIFFICULTY, Track, Race } from './story.js';
import { updateLava } from './storyland.js';
import { World } from './world.js';
import { Seasons, seasonsNeutral } from './season.js';
import { Post } from './post.js';
import { TyreFX } from './skids.js';
import { EnvProbe } from './envprobe.js';
import { setSubKit, animSubKit, Underwater } from './sub.js';
import { SEA_T } from './terrainmat.js';
import { MapEditor, loadMaps, upsertMap, deleteMap, newMap, cleanMap, mapLevel, exportMap, importFiles, smoothLoop, selfCrossing } from './editor.js';
import { setAnisotropy } from './textures.js';
import { Net, getIce, relaySettings, saveRelay } from './net.js';
import { Lobby } from './lobby.js';
// Visual extras (water spray, nitro flames, clouds, day/night, headlights, lit windows, street lamps / signals). They load defensively: if one of these files is
// missing, out of date or broken, that one effect switches itself off (see the browser console) and the game itself keeps running.
const optional = async f => { try { return await import(f); } catch (e) { console.warn('[overpass] optional module', f, 'not loaded:', e); return {}; } };
const [SPRAY, FX, DNM, BLD, CLD, LTS, PPL] = await Promise.all([optional('./spray.js'), optional('./fx.js'), optional('./daynight.js'), optional('./buildings.js'), optional('./clouds.js'), optional('./lights.js'), optional('./people.js?v=direct-hit-audio-1')]);
const [GRS, RNG, BTS, WPN, POL, BUOY, SBK, PLN, BAL, WNG, WTH, DEER] = await Promise.all([optional('./grass.js'), optional('./rings.js'), optional('./boats.js'), optional('./weapons.js'), optional('./police.js'), optional('./buoys.js'), optional('./scrapbook.js'), optional('./planes.js'), optional('./balloons.js'), optional('./wings.js'), optional('./weather.js'), optional('./deer.js')]); // grass tufts, sky rings, boats, car weapons
const NULLFX = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }); // does nothing, accepts everything
const safeNew = (C, ...a) => { try { return C ? new C(...a) : NULLFX; } catch (e) { console.warn('[overpass] effect failed to start:', e); return NULLFX; } };
const clockText = DNM.clockText || (() => '--:--'), setWindowGlow = BLD.setWindowGlow || (() => {}), setTrafficLamps = FX.setTrafficLamps || (() => {});
const addLampGlows = car => { try { return FX.addLampGlows ? FX.addLampGlows(car) : { visible: false }; } catch (e) { return { visible: false }; } };
import { VRRig, setHandLook, HAND_LOOKS } from './vr.js';
import { Gps, stepText, stepArrow } from './gps.js';
import { buildCockpit, drawGauges, updateSwitches, COCKPITS, cockpitFor, maxRot, drawSpeedPanel, INT_SLOTS, INT_FINISHES, INT_NATURAL, finishThumb, applyInterior, applySeatModel } from './cockpit.js';
import { FACE_SLIDERS, FACE_GROUPS, ZERO_ONE, EYE_COLORS, LIP_TINTS, randomFace } from './face.js';
import { SeaMines } from './mines.js';
import { Pad, glyph } from './gamepad.js';
import { LensFx } from './lensfx.js';
import { PhoneOS, PhoneScreen, PhoneVR } from './phone.js';
import { Federation, KILL_PTS } from './federation.js';
import { IceCutter, setLaserPod } from './icecut.js';
import { Birds, Squirrels } from './critters.js';
import { SeaLife } from './sealife.js';
import { ModelWorld, MAP_EXTS, MAX_MAP_BYTES } from './modelworld.js';
import { Companion, DOG_COATS, CAT_COATS } from './companion.js';
import { ScratchShop, VrShop, tierOf, newTicket, TIERS } from './scratch.js';
import { SKINS, HAIRS, HAIR_COLORS, BEARDS, HATS, TOP_COLORS, PANTS_COLORS, defaultDriver, cleanDriver, buildDriver, wheelGrips, PART_SLOTS, PART_EXTS, MAX_PART_BYTES, cleanPart, cleanSeat } from './avatar.js';
import { ORN_SLOTS, MAX_ORN_BYTES, ORN_EXTS, cleanPlace, carBox, SPOTS, spot, syncOrnaments } from './ornaments.js';
import { MAX_LIBRARY, libIndex, libGet, libSave, libUpdate, libRemove, MAX_MODEL_BYTES, SKIN_SCALES, idbGet, idbSet, bufToB64, hashStr, modelTemplate, testModel, applyModel, clearModel, applyWheels, clearWheels, keepWheelsShown, skinTexture, applySkin, clearSkin, imageToSkin } from './custom.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = t => { if (!isFinite(t) || t <= 0) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const touchDevice = matchMedia('(pointer:coarse)').matches;

// ---------- settings & progress (in-memory only) ----------
const S = { paint: 0, music: true, master: 0.8, musicVol: 0.55, sfx: 0.8, units: 'kmh', cam: 0, quality: touchDevice ? 'low' : 'high', unlockAll: false, infNitro: false, autoCruise: false, viewDist: 620, viewAuto: true, infGas: false, infHealth: false, flyCars: false, waterDrive: false, police: true, policePenalty: true, teleport: false, livePlanes: true, npcPlanes: true, clouds: true, timeMode: 'game', headlights: 'auto', name: '', model: 'coupe', avatar: null, avatarNet: null };
// every setting is remembered on this device: loaded here (before anything reads them), saved whenever one changes
const SETTINGS_KEY = 'osm.settings.v1', SETTINGS_SKIP = new Set(['name', 'model', 'paint', 'avatar', 'avatarNet']); // those live in the driver profile
try {
  const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    if (SETTINGS_SKIP.has(k) || x == null || typeof x === 'object' || typeof x === 'function') continue;
    if (k in S && typeof S[k] !== typeof x) continue; // a saved value of the wrong kind is ignored
    if (typeof x === 'number' && !isFinite(x)) continue;
    S[k] = x;
  }
} catch { }
let settingsSaved = '';
function saveSettings() {
  const o = {}; for (const [k, x] of Object.entries(S)) if (!SETTINGS_SKIP.has(k) && x != null && (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean')) o[k] = x;
  const j = JSON.stringify(o); if (j === settingsSaved) return; settingsSaved = j; try { localStorage.setItem(SETTINGS_KEY, j); } catch { }
}
setInterval(saveSettings, 1500); addEventListener('pagehide', saveSettings); addEventListener('visibilitychange', () => { if (document.hidden) saveSettings(); });
let avatarImg = null; // decoded image for name tags
const progress = { unlocked: 1, best: {} };
// story progress lives on this device (Settings has a reset)
try { const j = JSON.parse(localStorage.getItem('osm.story.v1') || 'null'); if (j && typeof j === 'object') { progress.unlocked = Math.max(1, Math.min(99, Math.floor(+j.unlocked) || 1)); if (j.best && typeof j.best === 'object') for (const [k, v] of Object.entries(j.best)) if (v && Number.isFinite(+v.place)) progress.best[k] = { place: +v.place, time: +v.time || 0 }; } } catch { }
function saveProgress() { try { localStorage.setItem('osm.story.v1', JSON.stringify(progress)); } catch { } }
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
// reflection map for car paint / glass / chrome: a simple sky + road + softbox studio, baked once (live reflections replace it on Pretty)
let staticEnv = null;
try {
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 sky = mix(vec3(.60,.74,.92), vec3(.22,.40,.78), smoothstep(0.,1.,h)); vec3 gr = mix(vec3(.26,.27,.27), vec3(.08,.09,.09), smoothstep(0.,-1.,h)); vec3 c = h > 0. ? sky : gr; c += vec3(1.,.85,.6) * pow(max(0.,1.-abs(h)*5.),3.) * .45; gl_FragColor = vec4(c,1.); }' })));
  const panel = (w, h, x, y, z, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  panel(30, 14, 0, 40, 0, 5); panel(8, 22, 38, 10, 10, 3); panel(8, 22, -38, 10, -10, 3);
  staticEnv = pm.fromScene(es, 0.03).texture; setCarEnv(staticEnv); pm.dispose();
} catch (e) { console.warn('car env map', e); }
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
const vr = new VRRig(renderer, camera); vr.scene = scene;
let xrState = 'checking'; vr.supported.then(ok => { xrState = ok ? 'yes' : (window.top !== window ? 'iframe' : 'no'); renderSettings(); });
const hemi = new THREE.HemisphereLight('#fff', '#444', 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff', 1.6); sun.castShadow = true; scene.add(sun, sun.target);
const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 300; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
// The sky dome: a deep zenith fading through a thin bright haze line at the horizon; a soft glow round the sun (forward scattering),
// a warm orange band along the horizon under a low sun, the pink "Belt of Venus" opposite it at dusk, a faint Milky Way at night,
// and a touch of dithering so the gradient never bands. Colours come from the day/night theme (top, horizon) and the weather greys them.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, sunCol: { value: new THREE.Color('#fff4e0') }, dark: { value: 0 }, clear: { value: 1 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float dark; uniform float clear; varying vec3 vP;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float hash3(vec3 p){ return fract(sin(dot(p, vec3(17.1, 113.7, 51.3))) * 43758.5453); }
    float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
    void main(){
      vec3 v = normalize(vP); float h = v.y, t = clamp(h, 0., 1.), day = 1. - dark;
      vec3 sd = normalize(sunDir); float sunUp = smoothstep(-0.22, 0.04, sd.y), low = 1. - smoothstep(0.02, 0.5, sd.y);
      // body of the sky: the horizon colour hugs the horizon, the zenith colour takes over quickly above it
      // with a low sun the warm horizon belongs to the sun's side; the far side stays cooler (dusky blue / mauve)
      vec2 hv = normalize(v.xz + 1e-5), hs = normalize(sd.xz + 1e-5); float toward = dot(hv, hs) * 0.5 + 0.5;
      float lum = dot(bottom, vec3(0.3, 0.5, 0.2)); vec3 coolH = mix(top, vec3(lum) * vec3(0.92, 0.8, 1.05), 0.55);
      vec3 hor = mix(bottom, coolH, (1. - pow(toward, 1.4)) * low * sunUp * 0.85 * clear);
      vec3 zen = mix(top, hor, 0.16 * day);
      vec3 c = mix(zen, hor, pow(1. - t, 2.4));
      c += (hor * 0.16 + vec3(0.02)) * pow(1. - t, 9.) * day;                      // bright haze line right at the horizon
      if (h < 0.) c = mix(hor, bottom * 0.94, clamp(-h * 5., 0., 1.));                // under the horizon: into the haze
      // the sun's glow (the disc itself is a sprite)
      float mu = max(dot(v, sd), 0.);
      c += sunCol * (pow(mu, 5.) * 0.16 + pow(mu, 40.) * 0.3 + pow(mu, 400.) * 0.9) * sunUp * clear * (1. - 0.7 * dark);
      // sunrise / sunset: warm band along the horizon, strongest towards the sun
      vec3 warm = vec3(1.0, 0.36, 0.12);
      c += warm * (0.07 + 0.93 * pow(mu, 2.5)) * low * sunUp * pow(1. - t, 4.) * 0.5 * clear;
      // the Belt of Venus: a pink band just above the horizon opposite a low sun, with the blue-grey earth shadow under it
      float anti = max(dot(normalize(vec3(v.x, 0., v.z) + 1e-5), -normalize(vec3(sd.x, 0., sd.z) + 1e-5)), 0.);
      float belt = anti * low * sunUp * clear * smoothstep(0.02, 0.1, h) * (1. - smoothstep(0.1, 0.32, h));
      c = mix(c, c * vec3(1.05, 0.8, 0.95) + vec3(0.09, 0.03, 0.06), belt * 0.8);
      // a faint Milky Way at night: a soft noisy band tilted across the sky
      vec3 gal = normalize(vec3(0.42, 0.25, 0.87)); float band = exp(-pow(dot(v, gal) * 5.5, 2.));
      float n = vnoise(v * 7.) * 0.6 + vnoise(v * 19.) * 0.4;
      c += vec3(0.07, 0.075, 0.1) * band * smoothstep(0.3, 0.9, n) * dark * clear * smoothstep(0., 0.15, h);
      c += (hash(gl_FragCoord.xy) - 0.5) / 255.;                                       // dither: no banding
      gl_FragColor = vec4(max(c, 0.), 1.);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), skyMat); sky.renderOrder = -1; scene.add(sky);
scene.fog = new THREE.Fog('#fff', 150, 900);
const clouds = safeNew(CLD.Clouds, scene); // real-altitude clouds (js/clouds.js)
const daynight = DNM.DayNight ? safeNew(DNM.DayNight) : null, skyFx = safeNew(DNM.SkyFx, scene), headlights = safeNew(FX.Headlights); // day/night cycle, stars/sun/moon, car headlights
const sunOff = new THREE.Vector3(60, 110, 40); let envT = 0;
const groundMat = new THREE.MeshStandardMaterial({ color: '#5f8a4e', roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

function applyEnv(th, fogNear, fogFar) {
  setCarEnvLevel(th.dark != null ? 1 - 0.85 * th.dark : th.night ? 0.2 : 1);
  skyMat.uniforms.top.value.set(th.sky[0]); skyMat.uniforms.bottom.value.set(th.fog);
  { const U = skyMat.uniforms; if (th.sunDir) U.sunDir.value.copy(th.sunDir); else U.sunDir.value.set(0.4, 0.8, 0.3).normalize(); if (th.sun) U.sunCol.value.set(th.sun);
    U.dark.value = th.dark != null ? th.dark : th.night ? 1 : 0; try { U.clear.value = weather && mode === 'world' && S.weather !== 'off' ? 1 - Math.min(1, (weather.gloom || 0) * 1.15) : 1; } catch { U.clear.value = 1; } }
  scene.fog.color.set(th.fog); scene.fog.near = fogNear; scene.fog.far = fogFar;
  clouds.setTheme(th); groundMat.color.set(th.ground); hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemiI != null ? th.hemiI : (th.night ? 0.75 : 0.95);
  sun.color.set(th.sun); sun.intensity = th.light; renderer.setClearColor(th.fog);
}
function applyQuality() {
  const hi = S.quality === 'high'; clouds.setQuality(!hi);
  renderer.setPixelRatio(Math.max(0.5, Math.min(devicePixelRatio, hi ? 2 : 1.25) * (S.res || 1)));
  renderer.shadowMap.enabled = true; sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  resize();
}
function resize() { if (vr.presenting) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- game objects ----------
// your driver profile (name, picture, paint and car) is remembered on this device
const PROFILE_KEY = 'osm.profile.v1', AVATAR_KEY = 'osm.avatar.v1';
const savedProfile = (() => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || {}; } catch { return {}; } })();
if (typeof savedProfile.name === 'string') S.name = savedProfile.name.slice(0, 16);
if (Number.isInteger(savedProfile.paint) && PAINTS[savedProfile.paint]) S.paint = savedProfile.paint;
const player = new Car(PAINTS[S.paint].color); scene.add(player.mesh);
player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
const AVATAR_FALLBACK = name => (name || 'D').trim().charAt(0).toUpperCase() || 'D';
function avatarHtml(src, name, color, size = 28) { return src ? `<img class="av" src="${src}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">` : `<span class="av av-txt" style="width:${size}px;height:${size}px;background:${color}">${escapeHtml(AVATAR_FALLBACK(name))}</span>`; }
function updateDriverChips() {
  const nm = S.name || 'Driver', col = PAINTS[S.paint].color;
  $$('[data-driver]').forEach(el => el.innerHTML = avatarHtml(S.avatar, nm, col, +(el.dataset.size || 26)) + `<span>${escapeHtml(nm)}</span>`);
}
const world = new World(scene, renderer); world.setVisible(false);
try { const v = JSON.parse(localStorage.getItem('osm.viewDist') || 'null'); if (v) { S.viewDist = clamp(+v.d || 620, 200, 1400); S.viewAuto = v.a !== false; } } catch { }
try { const r = JSON.parse(localStorage.getItem('osm.res') || 'null'); if (r) { S.res = clamp(+r.s || 1, 0.5, 1); S.vrRes = clamp(+r.v || 1, 0.5, 1.2); S.vrDist = clamp(+r.d || 700, 200, 1400); } } catch { }
S.res ??= 1; S.vrRes ??= 1; S.vrDist ??= 700;
const saveRes = () => { try { localStorage.setItem('osm.res', JSON.stringify({ s: S.res, v: S.vrRes, d: S.vrDist })); } catch { } };
const viewCap = () => vr.presenting ? Math.min(S.viewDist, S.vrDist) : S.viewDist; // VR draws two eyes at 72+ fps: it gets its own (shorter) draw distance
world.setViewDist(S.viewDist);
try { const v = JSON.parse(localStorage.getItem('osm.police') || 'null'); if (v) { S.police = v.on !== false; S.policePenalty = v.pen !== false; } } catch { }
try { const v = localStorage.getItem('osm.season'); S.season = ['real', 'off', 'spring', 'summer', 'autumn', 'winter'].includes(v) ? v : 'real'; } catch { S.season = 'real'; }
const seasons = new Seasons();
try { const v = localStorage.getItem('osm.fx'); S.fx = ['cinematic', 'vivid', 'off'].includes(v) ? v : 'cinematic'; } catch { S.fx = 'cinematic'; }
try { const v = localStorage.getItem('osm.storyDiff'); S.storyDiff = ['easy', 'normal', 'hard'].includes(v) ? v : 'normal'; } catch { S.storyDiff = 'normal'; }
try { const w = localStorage.getItem('osm.weather'); S.weather = ['real', 'off', 'clear', 'rain', 'storm', 'snow', 'fog'].includes(w) ? w : 'real'; } catch { S.weather = 'real'; }
{ let v = {}; try { v = JSON.parse(localStorage.getItem('osm.amb2') || 'null') || {}; } catch { } const old = parseFloat((() => { try { return localStorage.getItem('osm.amb'); } catch { return null; } })()), c = (x, d) => isFinite(+x) && x !== null && x !== '' ? Math.max(0, Math.min(1, +x)) : d, d0 = isFinite(old) ? old : 0.6;
  S.windVol = c(v.wind, d0); S.waterVol = c(v.water, d0); S.rainVol = c(v.rain, d0); }
try { const v = localStorage.getItem('osm.handlook'); S.handLook = HAND_LOOKS.some(l => l[0] === v) ? v : 'glove'; } catch { S.handLook = 'glove'; }
try { S.mirror = localStorage.getItem('osm.mirror') !== '0'; } catch { S.mirror = true; }
try { setHandLook(S.handLook); } catch { }
try { S.teleportCost = localStorage.getItem('osm.tpcost') !== '0'; } catch { S.teleportCost = true; } // teleporting is always on; this decides whether it costs points
try { S.livePlanes = localStorage.getItem('osm.planes') !== '0'; S.npcPlanes = localStorage.getItem('osm.npcplanes') !== '0'; } catch { }
const TELEPORT_COST = 2500; // points per teleport
const grass = safeNew(GRS.GrassField, scene, world), skyRings = safeNew(RNG.SkyRings, scene), waterRings = safeNew(RNG.WaterRings, scene, world), boats = safeNew(BTS.Boats, scene, world);
// travel scrapbook (scrapbook.js): a page for every city you drive through, opened from Settings
// World Drive's objective (federation.js): a Federation carrier over every town's city hall
const fed = (() => { try { return new Federation(scene, world, {
  me: () => (mode === 'world' && !W.spawning ? { x: player.x, y: player.y || 0, z: player.z, vx: player.vx || 0, vz: player.vz || 0, yaw: player.yaw } : null),
  shoot: (o, dir, kind, k, under) => { if (!wfx || ride?.riding || (W.dive && !under)) return; wfx.copFire(kind, o, dir, 0, 0, k ?? (kind === 'rocket' ? 0.45 : 0.5)); },
  bubble: (x, y, z) => { try { underwater && underwater.bubble(x, y, z, world.heightAt(x, z) - 0.3, 0.5); } catch { } },
  onUnitDown: u => { W.score += 750; hudMsg(`FEDERATION ${u.kind === 'jet' ? 'JET' : u.kind === 'car' ? 'JET CAR' : 'SUB'} ${u.kind === 'car' ? 'DESTROYED' : 'DOWN'} · +750`, 1800); try { Audio.chime(4); } catch { } },
  boom: (x, y, z, size, big) => { try { wfx && wfx.boom(new THREE.Vector3(x, y, z), size); } catch { } blast(x, y, z, big ? 14 : size * 0.5); },
  onSpawn: c => { if (mode === 'world') { toast(`The Intergalactic Federation Force has a carrier over ${c.town.name}${c.hall && c.hall.name && !/centre/i.test(c.hall.name) ? ' (' + c.hall.name + ')' : ''}. Shoot it down!`, 4200, 'fed'); try { Audio.ping && Audio.ping(0.6); } catch { } } },
  onDestroyed: (c, e) => { W.score += KILL_PTS; hudMsg(`FEDERATION CARRIER DOWN · +${KILL_PTS}`, 3200); toast(`${e.name} is liberated! It's in your Liberation Log.`, 4200, 'fed'); try { Audio.chime(12); } catch { } camShake = Math.max(camShake, 0.5); syncFedUi(); },
  onWeakHit: c => { W.score += 2500; hudMsg('REACTOR CORE HIT · CARRIER −50% · +2500', 3200); try { Audio.chime(10); Audio.boom && Audio.boom(1.6, 0.8); } catch { } camShake = Math.max(camShake, 0.35); },
  onImpact: c => { camShake = Math.max(camShake, 0.9); },
  onCount: () => syncFedUi(),
  onClose: () => syncFedUi(),
}); } catch (e) { console.warn('[overpass] federation off:', e); return null; } })();
function syncFedUi() { const el = $('#fedCount'); if (el && fed) el.textContent = fed.count ? `${fed.count} ${fed.count === 1 ? 'town' : 'towns'} liberated` : 'Free towns from the Federation'; }
const scrapbook = (() => { try { return SBK.Scrapbook ? new SBK.Scrapbook({ onHere: h => { try { if (mode === 'world' && !modelWorld && fed) fed.setTown(h); } catch { } }, onNew: e => { hudMsg(`NEW SCRAPBOOK PAGE · ${String(e.name).toUpperCase()}`, 2600); Audio.chime(7); syncScrapbookUi(); } }) : null; } catch { return null; } })();
// live 747s (planes.js): real Boeing 747s in the air right now fly over your part of World Drive; shoot one to tag it for +747
const planes = (() => { try { return PLN.LivePlanes ? new PLN.LivePlanes(scene, {
  npc: () => !!S.npcPlanes, live: () => !!S.livePlanes,
  onNear: p => hudMsg(`${p.desc.toUpperCase()} OVERHEAD · TAG IT FOR +747`, 2400),
  onFail: () => { if (!W.planeWarn) { W.planeWarn = 1; toast(S.npcPlanes ? "Couldn't reach the live flight feeds, so NPC 747s are flying instead." : "Couldn't reach the live flight feeds, so no 747s for now. Trying again in a couple of minutes.", 4200); } },
  onData: n => { if (!n && !W.planeNone) { W.planeNone = 1; toast(S.npcPlanes ? 'No real 747s in the air right now, so NPC ones are flying instead' : 'No 747s in the air right now', 2600); } },
}) : null; } catch { return null; } })();
// balloons to pop (balloons.js), kept out of the boost rings
const balloons = (() => { try { return BAL.Balloons ? new BAL.Balloons(scene, world) : null; } catch { return null; } })();
if (balloons) {
  balloons.blocked = (x, y, z, r) => { for (const F of [skyRings, waterRings]) { const L = F && F.rings; if (!Array.isArray(L)) continue; for (const q of L) if (q.live && Math.hypot(q.x - x, q.y - y, q.z - z) < r) return true; } return false; };
  balloons.onPop = (b, pts, combo, by) => { W.score += pts; Audio.pop && Audio.pop(by === 'car' ? 1 : 0.8); hudMsg(b.gold ? `GOLD BALLOON · +${pts}` : combo > 1 ? `POP x${combo} · +${pts}` : `POP · +${pts}`, 900); if (b.gold) Audio.chime(9); };
}
const wings = (() => { try { return WNG.Wings ? new WNG.Wings() : null; } catch { return null; } })(); // fold-out flight wings (wings.js)
const weather = (() => { try { return WTH.Weather ? new WTH.Weather(scene, { onChange: d => { if (mode === 'world' && S.weather === 'real') toast(d, 3200); }, onThunder: v => { try { Audio.thunder(v); } catch { } } }) : null; } catch (e) { console.warn('[overpass] weather off:', e); return null; } })();
const buoys = safeNew(BUOY.Buoys, scene, world); // buoys on the water: drive into them for points
const deer = (() => { try { return DEER.Deer ? new DEER.Deer(scene, world) : null; } catch (e) { console.warn('[overpass] deer off:', e); return null; } })();
// billboard birds (flocks that sometimes swoop across the road) and squirrels (they dart across, and get flattened)
const birds = (() => { try { return new Birds(scene, world); } catch (e) { console.warn('[overpass] birds off:', e); return null; } })();
const squirrels = (() => { try { return new Squirrels(scene, world); } catch (e) { console.warn('[overpass] squirrels off:', e); return null; } })();
// sharks, whales, dolphins, squid, seals and penguins (sealife.js)
const seaLife = (() => { try { return new SeaLife(scene, world); } catch (e) { console.warn('[overpass] sea life off:', e); return null; } })(); // billboard deer in the countryside
try { buoys.onHit = (b, pts, combo, wy) => { W.score += pts; hudMsg(combo > 1 ? `BUOY x${combo} · +${pts}` : `BUOY · +${pts}`, 1100); Audio.chime(3 + Math.min(combo, 5) * 2); Audio.splash && Audio.splash(true); try { spray.burst({ x: b.x, z: b.z, vx: (player.vx || 0) * 0.4, vz: (player.vz || 0) * 0.4, speed: player.speed * 0.6 }, wy); } catch { } }; } catch { }
const net = new Net();
// Street lamps, traffic signals, stop/yield signs (lights.js). World calls lights.addTile / removeTile when map tiles load.
const lights = safeNew(LTS.LightSystem, world);
world.lights = lights;
// Impact audio is handled directly in people.js, before puddle creation.
const pedestrians = safeNew(PPL.PedestrianSystem, scene, world, {
  getSoundVolume: () => clamp(Number(S.master) || 0, 0, 1) * clamp(Number(S.sfx) || 0, 0, 1)
});
try { pedestrians.onHit = () => { police.crime('ped'); hurt(3 + Math.min(4, Math.hypot(player.vx || 0, player.vz || 0) * 0.1)); }; } catch { } // a person dents the car a little
try { pedestrians.voice = (g, v) => Audio.scream ? Audio.scream(g, Math.max(0.4, v || 1)) : false; } catch { } // a man's or a woman's scream // running people over (or shooting them) is a crime
let pedestriansFailed = false;
function clearPedestrians() {
  try { pedestrians.clear(); }
  catch (e) { console.warn('[overpass] pedestrian cleanup failed:', e); }
}
function updatePedestrians(dt) {
  if (pedestriansFailed || mode !== 'world' || paused || W.spawning || W.sink || player.fly || ride?.riding) return;
  if (!tileReadyAt(player.x, player.z)) return;
  try { pedestrians.update(dt, player); }
  catch (e) {
    pedestriansFailed = true; clearPedestrians();
    console.error('[overpass] pedestrians disabled:', e);
  }
}

const spray = safeNew(SPRAY.WaterSpray, scene), wake = safeNew(SPRAY.WaterWake, scene);
try { // boats: smoke when hurt, blow up and sink, splash when rammed (boats.js)
  boats.fx = {
    smoke: (x, y, z, dark) => smokePuff(x, y, z, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, dark ? '#1d1d1d' : '#6f6f6f'),
    boom: (x, y, z, size) => { blast(x, y, z, size); try { wfx && wfx.boom(new THREE.Vector3(x, y, z), size); } catch { } },
    splash: (x, z, wy, k) => { try { spray.burst({ x, z, speed: 8 + 30 * k, vx: 0, vz: 0 }, wy); } catch { } },
    onSink: (b, pts) => { W.score += pts; police.crime('killCar'); hudMsg(`${b.type.name.toUpperCase()} SUNK · +${pts}`, 2200); Audio.chime(8); },
  };
} catch { }
spray.onLand = (x, y, z) => wake.drop(x, y, z); // droplets falling back leave little rings
const lens = (() => { try { return new LensFx(); } catch { return null; } })();
// a big splash: rings racing out across the water, and water on the lens if the camera's close
spray.onBig = (x, wy, z, k) => {
  try { wake.ring(x, wy, z, k); } catch { }
  try { if (lens && !vr.presenting && !(W.camUnderD > 0)) { const d = Math.hypot(camera.position.x - x, camera.position.y - wy, camera.position.z - z); if (d < 24) lens.splash(Math.min(1, k * (1.1 - d / 24) + 0.1)); } } catch { }
};
const nitroFx = safeNew(FX.NitroFlames), speedFx = safeNew(FX.SpeedLines, document.getElementById('hud'));
// ---------- ambient traffic ----------
// AI cars drive along the real mapped roads, but only exist around the players:
//  - they appear out of sight: never close to any player, never in front of one, and they fade in so nothing pops
//  - once every player is far away they fade out and are removed
//  - they carry on through junctions, keep a gap to the car in front, brake for players, and are solid
const TRAFFIC_MAX = 14, TRAFFIC_MAX_LOW = 8;
const TRAFFIC_NEAR = 140;       // never appear closer than this to any player
const TRAFFIC_FRONT = 300;      // ...nor in front of a player (front half) closer than this
const TRAFFIC_CONE = 460;       // ...nor straight ahead of a player (within ~53 degrees) closer than this
const TRAFFIC_SPAWN_MAX = 480;  // appear no farther than this from you
const TRAFFIC_FAR = 560;        // farther than this from every player and a car fades out
const TRAFFIC_FADE_IN = 1.8, TRAFFIC_FADE_OUT = 1.4;
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
// you and every other player in the session
function trafficPlayers() {
  const a = [{ x: player.x, z: player.z, yaw: player.yaw, vx: player.vx || 0, vz: player.vz || 0, y: player.y || 0 }];
  for (const r of W.remotes.values()) a.push({ x: r.x, z: r.z, yaw: r.yaw || 0, vx: 0, vz: 0, y: r.car.y || 0 });
  return a;
}
// could a car appear at (x, z) without any player watching it arrive, or driving into it?
function trafficSafeSpot(x, z, pl) {
  for (const p of pl) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < TRAFFIC_NEAR) return false;
    let f = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / d;       // ahead of where the car points...
    const sp = Math.hypot(p.vx, p.vz); if (sp > 4) f = Math.max(f, (dx * p.vx + dz * p.vz) / (d * sp)); // ...or where it is actually going (reversing, sliding)
    if (d < TRAFFIC_FRONT && f > 0) return false;
    if (d < TRAFFIC_CONE && f > 0.6) return false;
  }
  return true;
}
// every traffic car gets its own copy of the materials so it can fade by itself
function trafficFadePrep(car) {
  const map = new Map();
  car.mesh.traverse(o => {
    if (!o.isMesh) return; o.castShadow = false;
    const swap = m => { let c = map.get(m); if (!c) { c = m.clone(); trackCarMat(c); c.userData.opq = m.opacity; c.userData.tr = m.transparent; c.transparent = true; c.opacity = 0; map.set(m, c); } return c; };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  car.fadeMats = [...map.values()]; car.fadeAlpha = 0;
}
function trafficSetAlpha(car, al) {
  if (Math.abs(al - car.fadeAlpha) < 0.004 && al > 0 && al < 1) return; car.fadeAlpha = al;
  for (const m of car.fadeMats) {
    m.opacity = m.userData.opq * al;
    const tr = al >= 0.999 ? m.userData.tr : true; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
  }
  car.mesh.visible = al > 0.01;
}
// a 2D billboard person (the same crowd people as the grandstands and boats) sitting in each traffic car's driver seat
function trafficDriver(car) {
  try {
    const A = PPL.crowdAtlas && PPL.crowdAtlas(); if (!A) return;
    const cfg = cockpitFor(car.mesh.userData.model), n = PPL.CROWD_POSES || 8, k = ((Math.random() * A.designs.length) | 0) * n + 3;
    const map = A.tex.clone(); map.repeat.set(1 / A.cols, 1 / A.rows); map.offset.set((k % A.cols) / A.cols, 1 - (Math.floor(k / A.cols) + 1) / A.rows); map.needsUpdate = true;
    const m = new THREE.SpriteMaterial({ map, alphaTest: 0.5, transparent: true, opacity: 0, fog: true }); m.userData.opq = 1; m.userData.tr = false;
    const sp = new THREE.Sprite(m), H = 2.0; sp.name = 'npc-driver'; sp.center.set(0.5, 0.06); sp.scale.set(H, H, 1); sp.position.set(cfg.eye[0], cfg.eye[1] - 0.61 * H, cfg.eye[2]); car.mesh.add(sp);
    car.fadeMats.push(m); car.drvMap = map;
  } catch { }
}
function removeTraffic(i) {
  const a = W.traffic[i]; scene.remove(a.car.mesh); if (a.car.drvMap) a.car.drvMap.dispose();
  a.car.mesh.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); for (const m of a.car.fadeMats || []) m.dispose();
  W.traffic.splice(i, 1);
}
function clearTraffic() { while (W.traffic.length) removeTraffic(W.traffic.length - 1); W.trafficSpawn = 0; }
function spawnTraffic(pl) {
  if (W.traffic.length >= (S.quality === 'high' ? TRAFFIC_MAX : TRAFFIC_MAX_LOW)) return;
  const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24), n = Math.ceil(TRAFFIC_SPAWN_MAX / 24) + 1, seen = new Set(), cand = [];
  for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) for (const s of (world.roadCells.get(i + ',' + j) || [])) {
    if (seen.has(s)) continue; seen.add(s);
    if (!trafficRoad(s) || Math.hypot(s.x1 - s.x0, s.z1 - s.z0) < 4) continue;
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2, d = Math.hypot(mx - player.x, mz - player.z);
    if (d < TRAFFIC_NEAR - 30 || d > TRAFFIC_SPAWN_MAX + 30) continue;
    if (!s.bridge && world.water.inside(mx, mz)) continue;
    cand.push(s);
  }
  for (let tries = 0; tries < 14 && cand.length; tries++) {
    const seg = cand[Math.floor(Math.random() * cand.length)], len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0); let d0 = len * (0.1 + Math.random() * 0.8);
    let dir = Math.random() < 0.5 ? 1 : -1;
    const k = dir > 0 ? d0 / len : 1 - d0 / len, x = seg.x0 + (seg.x1 - seg.x0) * k, z = seg.z0 + (seg.z1 - seg.z0) * k;
    const dp = Math.hypot(x - player.x, z - player.z); if (dp > TRAFFIC_SPAWN_MAX || !tileReadyAt(x, z)) continue;
    if (!trafficSafeSpot(x, z, pl)) continue;                                           // out of sight of everybody, nowhere near anybody's path
    if (W.traffic.some(t => Math.hypot(t.car.x - x, t.car.z - z) < 28)) continue;       // don't stack cars on top of each other
    if (dp < 260) { const tx = (seg.x1 - seg.x0) / len * dir, tz = (seg.z1 - seg.z0) / len * dir; if (tx * (player.x - x) + tz * (player.z - z) > 0.7 * dp) { dir = -dir; d0 = len - d0; } } // flip direction but stay on the very same spot // not driving straight at you
    const car = new Car(TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)], TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)]);
    trafficFadePrep(car); trafficDriver(car); car.lamps = addLampGlows(car);
    const a = { car, d: d0, speed: 0, cruise: trafficCruise(seg), laneCur: 0, py: null, alpha: 0, fade: 1, stuck: 0 }; setTrafficSeg(a, seg, dir);
    a.speed = a.cruise * 0.8; a.laneCur = a.lane; car.yaw = Math.atan2(a.dx, a.dz); car.pitch = 0; car.roll = 0; car.y = seg.bridge ? seg.y0 : world.heightAt(x, z);
    car.x = x; car.z = z; car.sync(0); trafficSetAlpha(car, 0); scene.add(car.mesh); W.traffic.push(a); return;
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
// ---- hitting traffic: the car takes damage, pulls over onto the shoulder, stops and flashes its hazards ----
const NPC_HP = 60;
function npcHit(a, closing) {
  a.hp = (a.hp ?? NPC_HP) - Math.max(2, Math.min(50, (closing - 3) * 1.6));
  if (!a.pull) { a.pull = true; a.hazT = 0; a.hazMats = a.car.fadeMats.filter(m => m.emissive && m.emissive.r > 0.5 && m.emissive.g < 0.3 && m.emissive.b < 0.3); }
}
function updateTraffic(dt) {
  if (mode !== 'world' || paused || W.spawning || player.fly) return;
  dt = Math.min(dt, 0.05);
  const pl = trafficPlayers();
  W.trafficSpawn -= dt;
  if (W.trafficSpawn <= 0 && world.roadCells.size && tileReadyAt(player.x, player.z)) { W.trafficSpawn = 0.7; spawnTraffic(pl); }
  for (let i = W.traffic.length - 1; i >= 0; i--) {
    const a = W.traffic[i], car = a.car;
    // the closest player decides whether this car is still wanted: nobody around, it fades out; somebody back in range, it fades back in
    let near = 1e9; for (const p of pl) near = Math.min(near, Math.hypot(car.x - p.x, car.z - p.z));
    if (a.stuck > 30 && near > 200) a.doomed = true;                  // jammed for good: let it go
    if (a.fade > 0 && (near > TRAFFIC_FAR || a.doomed)) a.fade = -1;
    else if (a.fade < 0 && !a.doomed && near < TRAFFIC_FAR * 0.9) a.fade = 1;
    a.alpha = Math.max(0, Math.min(1, a.alpha + a.fade * dt / (a.fade > 0 ? TRAFFIC_FADE_IN : TRAFFIC_FADE_OUT)));
    if (a.fade < 0 && a.alpha <= 0) { removeTraffic(i); continue; }
    trafficSetAlpha(car, a.alpha); car.lamps.visible = (W.lamp || 0) > 0.05 && a.alpha > 0.6;
    // brake for whatever is in front: other cars heading the same way, any player, or a red / stoppable yellow signal
    let target = a.cruise;
    const reach = 10 + a.speed * 0.9;
    const look = (ox, oz, oy, latMax = 2.4) => {
      const rx = ox - car.x, rz = oz - car.z, f = rx * a.dx + rz * a.dz, lat = Math.abs(rx * a.dz - rz * a.dx);
      if (f > 0.3 && f < reach && lat < latMax && Math.abs(oy - car.y) < 3) target = Math.min(target, f < 6.5 ? 0 : (f - 6.5) / (reach - 6.5) * a.cruise);
    };
    for (const p of pl) look(p.x, p.z, p.y);
    for (const b of W.traffic) if (b !== a && b.dx * a.dx + b.dz * a.dz > 0.3) look(b.car.x, b.car.z, b.car.y, b.pull ? 1.3 : 2.4);
    try {
      const stopD = lights.signalStop && lights.signalStop(car.x, car.z, a.dx, a.dz, reach + 8, a.speed);
      if (stopD != null) target = Math.min(target, stopD < 6.5 ? 0 : (stopD - 6.5) / Math.max(0.01, reach - 6.5) * a.cruise);
    } catch (_) { /* lights optional */ }
    if (a.pull) { // hit: ease to a stop, no matter what
      target = 0; a.speed += (0 - a.speed) * Math.min(1, dt * 2.2); if (a.speed < 0.25) a.speed = 0;
      a.hazT += dt; const on = (a.hazT * 2.6) % 1 < 0.5; for (const m of a.hazMats || []) m.emissiveIntensity = on ? 2.8 : 0.15;
      if ((a.hp ?? NPC_HP) < NPC_HP * 0.4 && (a.smokeT = (a.smokeT || 0) - dt) <= 0) { a.smokeT = 0.14; smokePuff(car.x + Math.sin(car.yaw) * 1.7, (car.y || 0) + 1.1, car.z + Math.cos(car.yaw) * 1.7, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (a.hp ?? NPC_HP) < NPC_HP * 0.15 ? '#222' : '#777'); }
    } else if (a.yieldT > 0) { a.yieldT -= dt; a.speed += (0 - a.speed) * Math.min(1, dt * 3); } // pulling over for a police car
    else a.speed += (target - a.speed) * Math.min(1, dt * (target < a.speed ? 4 : 1.2));
    a.stuck = a.speed < 0.4 ? a.stuck + dt : 0;
    a.d += a.speed * dt;
    while (a.d >= a.len) {
      const over = a.d - a.len, nx = trafficNext(a);
      if (nx) { a.speed *= 0.65 + 0.35 * Math.max(0, nx.dot); setTrafficSeg(a, nx.o, nx.nd); a.cruise = trafficCruise(nx.o); a.d = over; }
      else if (near > 90) { a.doomed = true; a.fade = -1; a.d = a.len - 0.01; a.speed = Math.min(a.speed, 3); break; } // end of the mapped road out of sight: fade away
      else { setTrafficSeg(a, a.seg, -a.dir); a.d = Math.min(over, a.len - 0.01); a.speed *= 0.5; } // dead end right next to you: turn around
    }
    const s = a.seg, sx = a.dir > 0 ? s.x0 : s.x1, sz = a.dir > 0 ? s.z0 : s.z1;
    const laneT = a.pull || a.yieldT > 0 ? Math.min(a.lane + 6, Math.max(a.lane + 2.2, a.seg.hw + 0.8)) : a.lane;
    a.laneCur += (laneT - a.laneCur) * Math.min(1, dt * (a.pull ? 1.2 : 3));
    // laneCur > 0 = the near-side lane: the driver's right-hand side, or the left in countries that drive on the left
    const sd = W.lht ? -1 : 1, lc = a.laneCur * sd;
    const x = sx + a.dx * a.d - a.dz * lc, z = sz + a.dz * a.d + a.dx * lc, q = a.d / a.len, k = a.dir > 0 ? q : 1 - q;
    const y = s.bridge ? s.y0 + (s.y1 - s.y0) * k : world.heightAt(x, z);
    const ty = Math.atan2(a.dx, a.dz) - sd * (a.pull ? Math.max(-0.3, Math.min(0.3, (laneT - a.laneCur) * 0.18)) * Math.min(1, a.speed / 4) : 0); let diff = ty - car.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    car.yaw += diff * Math.min(1, dt * 6); car.steer += (Math.max(-0.6, Math.min(0.6, diff * 2)) - car.steer) * Math.min(1, dt * 8);
    if (a.py != null) { const step = a.speed * dt; if (step > 0.02) car.pitch += (Math.max(-0.5, Math.min(0.5, -Math.atan2(y - a.py, step))) - car.pitch) * Math.min(1, dt * 6); }
    a.py = y; car.x = x; car.z = z; car.y = y; car.vx = Math.sin(car.yaw) * a.speed; car.vz = Math.cos(car.yaw) * a.speed;
    car.sync(dt, a.speed, 0);
    // solid for you
    const px = player.x - x, pz = player.z - z, pd = Math.hypot(px, pz);
    if (!ride?.riding && pd < 3.2 && pd > 0.01 && (player.y || 0) - y < 1.55 && (player.y || 0) - y > -2.5) { // above its roof (a stunt jump) you sail over
      const nx = px / pd, nz = pz / pd, closing = -((player.vx - car.vx) * nx + (player.vz - car.vz) * nz); player.x += nx * (3.2 - pd); player.z += nz * (3.2 - pd);
      const hit = player.bump(nx, nz, 0.3); if (hit > 3) { Audio.thud(hit / 8); camShake = Math.max(camShake, Math.min(0.5, hit * 0.03)); } crashDamage(Math.max(0, closing), 0.8);
      if (closing > 1.5) npcHit(a, closing);
      if (closing > 6 && !a.crimed) { a.crimed = true; police.crime('ram'); }
      a.speed *= 0.6; player.sync(0);
    }
    // other players ramming a traffic car stop it too (traffic is simulated on each player's own screen)
    for (const [rid, r] of W.remotes) {
      const rx = r.x - x, rz = r.z - z, rd = Math.hypot(rx, rz); if (rd >= 3.4 || rd < 0.01 || Math.abs((r.car.y || 0) - y) > 2.5) continue;
      const rsp = net.players.get(rid)?.speed || 0, rcx = Math.sin(r.yaw) * rsp, rcz = Math.cos(r.yaw) * rsp;
      const rc = -((rcx - car.vx) * (rx / rd) + (rcz - car.vz) * (rz / rd)); if (rc > 1.5) npcHit(a, rc);
    }
  }
}

let mode = 'menu', paused = false, track = null, race = null, level = null, attract = null;
let vdEff = S.viewDist; // draw distance in use right now (the Auto setting can pull it in below S.viewDist)
let camShake = 0, camAngle = 0, finishTimer = 0, lastCount = -1, goTimer = 0;
const W = { lamp: 0, spawning: false, spawnT: 0, score: 0, dist: 0, orbs: [], streetT: 0, street: '', remotes: new Map(), traffic: [], trafficSpawn: 0, combo: 0, comboT: 0 };

// ---------- screens ----------
function show(id) {
  $$('[data-screen]').forEach(s => s.hidden = s.id !== 's-' + id);
  if (id === 'levels') buildLevels();
  if (id === 'mp') { $('#mpName').value = S.name; fillMpMaps(); fillRelay(); }
  if ((id === 'mp') !== (screen === 'mp')) { if (id === 'mp') lobby.start(); else lobby.stop(); }
  if (id === 'maps') renderMaps();
  screen = id;
}
let screen = 'menu';
$$('[data-go]').forEach(b => b.addEventListener('click', () => { Audio.click(); show(b.dataset.go); }));

// ---------- toasts / messages ----------
function toast(msg, ms = 2600, cls = '') {
  try { if (phoneOS && !/^💬/.test(msg)) phoneOS.notify(msg, false); } catch { } if (vr.presenting && performance.now() > vrMsg.until) { vrMsg.text = msg.toUpperCase().slice(0, 40); vrMsg.until = performance.now() + Math.min(ms, 2500); } const t = document.createElement('div'); t.className = 'toast' + (cls ? ' ' + cls : ''); t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), ms); }
let msgTimer = 0;
const vrMsg = { text: '', until: 0 };
function hudMsg(text, ms = 1600) { vrMsg.text = text; vrMsg.until = performance.now() + ms; const m = $('#hMsg'); m.textContent = text; m.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), ms); }

// ---------- garage / settings / controls (rendered in menu + pause) ----------
// ---------- custom looks: your own 3D model + picture paint (kept for this visit, shared in multiplayer) ----------
const looks = { glb: null, skin: null, wheel: null };
// custom wheels: your own wheel model on all four (free; set up in Garage > Custom)
idbGet('wheel').then(a => { if (a && a.data) { looks.wheel = a; net.setAsset('wh', a); renderGarage(); } }).catch(() => { });
const cleanWheelM = m => ({ ...m, sz: Math.max(0.5, Math.min(1.8, +m.sz || 1)), wd: Math.max(0.4, Math.min(2.5, +m.wd || 1)), axle: ['auto', 'x', 'y', 'z'].includes(m.axle) ? m.axle : 'auto', flip: !!m.flip });
Promise.all([idbGet('glb'), idbGet('skin')]).then(([g, k]) => { if (g && g.data) looks.glb = g; if (k && k.data) looks.skin = k; net.mine.glb = looks.glb; net.mine.skin = looks.skin; renderGarage(); });
const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
// ---------- car lights editor (headlights, taillights, underglow) ----------
let myLights = loadLights(); // headlights / taillights / underglow, edited in the garage workshop
net.setLights(myLights);
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.ltsw{width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.25);padding:0;cursor:pointer;touch-action:manipulation}.ltsw.on{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.3)}.lt-row{display:flex;align-items:center;gap:8px;margin-top:8px}.lt-row>span{flex:1;opacity:.85}.lt-row>em{min-width:3.4em;text-align:center;font-style:normal;opacity:.7;font-variant-numeric:tabular-nums}.lt-row button{width:44px;height:40px;border:0;border-radius:10px;background:rgba(255,255,255,.12);color:inherit;font:inherit;font-weight:800;font-size:18px;cursor:pointer;touch-action:manipulation}.lt-sws{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' }));
const LT_ROWS = {
  h: [['dx', 'Spacing', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['dy', 'Height', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['dz', 'Forward / back', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['s', 'Size', 0.1, 0.4, 2.5, v => v.toFixed(1) + '×']],
  t: [['dx', 'Spacing', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['dy', 'Height', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['dz', 'Forward / back', 0.04, -1, 1, v => (v >= 0 ? '+' : '') + v.toFixed(2)], ['s', 'Size', 0.1, 0.4, 2.5, v => v.toFixed(1) + '×']],
  u: [['a', 'Brightness', 0.1, 0.2, 2, v => v.toFixed(1) + '×'], ['s', 'Size', 0.1, 0.5, 1.6, v => v.toFixed(1) + '×']],
};
const LT_NAMES = { h: ['Headlights', 'H'], t: ['Taillights', 'T'], u: ['Underglow', 'U'] };
// ---------- nitrous: flame colour + power upgrades, bought in your garage workshop ----------
const NITRO_KEY = 'osm.nitro.v1', NITRO_MAX = 5, nitroCost = l => 2500 * (l + 1);
const nitroTopOf = l => 1.28 + 0.07 * l, nitroPushOf = l => 1.6 + 0.15 * l;
// the second booster: a big thruster on the back that doubles what nitrous adds (and burns it 1.5x as fast). Placement is yours.
const B2_COST = 6000, B2_RANGE = { dx: [-0.9, 0.9, 0.05, 'Side to side'], dy: [-0.6, 1.2, 0.05, 'Height'], dz: [-1.2, 1.6, 0.05, 'Forward / back'], s: [0.6, 1.6, 0.05, 'Size'], tilt: [-20, 20, 1, 'Tilt'] };
function cleanB2(v) { v = v && typeof v === 'object' ? v : {}; const o = { own: !!v.own, on: v.on !== false }; for (const k in B2_RANGE) { const [a, b] = B2_RANGE[k], d = k === 's' ? 1 : 0; o[k] = Math.max(a, Math.min(b, isFinite(+v[k]) ? +v[k] : d)); } return o; }
const b2Active = () => myNitro.b2.own && myNitro.b2.on;
const b2Cfg = () => b2Active() ? { dx: myNitro.b2.dx, dy: myNitro.b2.dy, dz: myNitro.b2.dz, s: myNitro.b2.s, tilt: myNitro.b2.tilt } : null;
let myNitro = (() => { try { const v = JSON.parse(localStorage.getItem(NITRO_KEY) || 'null') || {}; return { c: FX.nitroColor ? FX.nitroColor(v.c).id : 'blue', lvl: Math.max(0, Math.min(NITRO_MAX, v.lvl | 0)), b2: cleanB2(v.b2) }; } catch { return { c: 'blue', lvl: 0, b2: cleanB2(null) }; } })();
const saveNitro = () => { try { localStorage.setItem(NITRO_KEY, JSON.stringify(myNitro)); } catch { } };
try { nitroFx.setColor && nitroFx.setColor(myNitro.c); } catch { }
function nitroHtml() {
  const b = myNitro.b2, cols = FX.NITRO_COLORS || [], l = myNitro.lvl, full = l >= NITRO_MAX, cost = nitroCost(l), pct = v => Math.round((v - 1) * 100);
  const sw = cols.map(c => `<button class="nsw ${c.id === myNitro.c ? 'on' : ''}" data-nitro-color="${c.id}" aria-label="${c.name} flames" style="background:${c.rainbow ? 'linear-gradient(90deg,#ff4d4d,#ffd84d,#4dff88,#4dc3ff,#b04dff)' : `radial-gradient(ellipse at 20% 50%, ${c.core} 0 14%, ${c.mid} 38%, ${c.outer} 72%, #0c0d12 100%)`}"><span>${c.name}</span></button>`).join('');
  const pips = Array.from({ length: NITRO_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
  return `<div class="gsec"><h4>Flame colour</h4><div class="nsws">${sw}</div><p class="note">Tap a colour to light up the flames and see it on your car.</p></div>
    <div class="gsec"><h4>Nitrous power <small>Level ${l} of ${NITRO_MAX}</small></h4><div class="npips">${pips}</div>
    <p class="note">Boost: +${pct(nitroTopOf(l))}% top speed, ${nitroPushOf(l).toFixed(2)}× acceleration${full ? '' : `. Next level: +${pct(nitroTopOf(l + 1))}%, ${nitroPushOf(l + 1).toFixed(2)}×`}</p>
    <div class="av-actions"><button class="ghost" data-nitro-up ${full ? 'disabled' : ''}>${full ? 'Fully upgraded' : `Upgrade · ${cost.toLocaleString()} pts`}</button></div>
    <p class="note">You have ${(W.score | 0).toLocaleString()} points. Upgrades work in World Drive and multiplayer.</p></div>
    <div class="gsec"><h4>Second booster <small>${b.own ? (b.on ? 'fitted' : 'switched off') : 'not fitted'}</small></h4>
    <p class="note">A big thruster on the back of your car. With it, nitrous gives twice the extra speed and twice the extra kick (now +${pct(1 + (nitroTopOf(l) - 1) * 2)}% top speed, ${(1 + (nitroPushOf(l) - 1) * 2).toFixed(2)}× acceleration), but burns through it 1.5× as fast.</p>
    ${b.own ? `<div class="av-actions"><button class="ghost sm" data-b2-on aria-pressed="${b.on}">${b.on ? 'Booster on · turn off' : 'Booster off · turn on'}</button><button class="ghost sm" data-b2-fire>Fire it</button><button class="ghost sm" data-b2-reset>Reset position</button></div>
      ${Object.entries(B2_RANGE).map(([k, [a, z, st, name]]) => `<div class="lt-row"><span>${name}</span><input type="range" min="${a}" max="${z}" step="${st}" value="${b[k]}" data-b2="${k}" aria-label="${name}" style="flex:2"><b data-b2l="${k}">${k === 'tilt' ? b[k] + '°' : k === 's' ? b[k].toFixed(2) + '×' : (b[k] >= 0 ? '+' : '') + b[k].toFixed(2) + ' m'}</b></div>`).join('')}
      <p class="note">Drag the sliders to move it around; the flame fires so you can see where it points.</p>`
      : `<div class="av-actions"><button class="ghost" data-b2-buy>Fit second booster · ${B2_COST.toLocaleString()} pts</button></div>`}</div>`;
}
function bindNitro(el) {
  el.querySelectorAll('[data-nitro-color]').forEach(b => b.onclick = () => { myNitro.c = b.dataset.nitroColor; saveNitro(); try { nitroFx.setColor(myNitro.c); nitroFx.showOff(1.8); } catch { } Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-nitro-up]').forEach(b => b.onclick = () => {
    if (!(garage && garage.shop)) { toast('Upgrades are done inside your garage'); return; }
    const l = myNitro.lvl; if (l >= NITRO_MAX) return; const cost = nitroCost(l);
    if (W.score < cost) { toast(`This upgrade costs ${cost.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= cost; myNitro.lvl = l + 1; saveNitro(); Audio.chime(5); hudMsg(`NITROUS LEVEL ${myNitro.lvl} · −${cost.toLocaleString()}`, 1800); try { nitroFx.showOff(1.8); } catch { } renderGarage();
  });
  const fire = () => { try { nitroFx.setBooster(b2Cfg()); nitroFx.showOff(1.8); } catch { } };
  el.querySelectorAll('[data-b2-buy]').forEach(b => b.onclick = () => {
    if (!(garage && garage.shop)) { toast('The booster is fitted inside your garage'); return; }
    if (W.score < B2_COST) { toast(`The second booster costs ${B2_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= B2_COST; myNitro.b2.own = true; myNitro.b2.on = true; saveNitro(); Audio.chime(7); hudMsg(`SECOND BOOSTER FITTED · −${B2_COST.toLocaleString()}`, 2000); fire(); renderGarage();
  });
  el.querySelectorAll('[data-b2-on]').forEach(b => b.onclick = () => { myNitro.b2.on = !myNitro.b2.on; saveNitro(); Audio.click(); fire(); renderGarage(); });
  el.querySelectorAll('[data-b2-fire]').forEach(b => b.onclick = () => { Audio.click(); fire(); });
  el.querySelectorAll('[data-b2-reset]').forEach(b => b.onclick = () => { const o = myNitro.b2; o.dx = o.dy = o.dz = o.tilt = 0; o.s = 1; saveNitro(); Audio.click(); fire(); renderGarage(); });
  el.querySelectorAll('[data-b2]').forEach(r => {
    r.addEventListener('keydown', e => e.stopPropagation());
    r.oninput = () => { const k = r.dataset.b2, v = +r.value; myNitro.b2[k] = v; saveNitro(); const lb = el.querySelector(`[data-b2l="${k}"]`); if (lb) lb.textContent = k === 'tilt' ? v + '°' : k === 's' ? v.toFixed(2) + '×' : (v >= 0 ? '+' : '') + v.toFixed(2) + ' m'; fire(); };
  });
}
// ---------- fold-out wings: bought in your garage, they swing out when you switch flight mode on ----------
const WINGS_KEY = 'osm.wings.v1', WINGS_COST = 8000, WING_MAX = 3, wingLiftCost = l => 2000 * (l + 1), wingAirCost = l => 2500 * (l + 1);
function cleanWings(v) { v = v && typeof v === 'object' ? v : {}; const styles = (WNG.WING_STYLES || [['jet']]).map(s => s[0]), cols = (WNG.WING_COLORS || [['paint']]).map(c => c[0]); return { own: !!v.own, on: v.on !== false, style: styles.includes(v.style) ? v.style : 'jet', color: cols.includes(v.color) ? v.color : 'paint', lift: Math.max(0, Math.min(WING_MAX, v.lift | 0)), air: Math.max(0, Math.min(WING_MAX, v.air | 0)) }; }
let myWings = (() => { try { return cleanWings(JSON.parse(localStorage.getItem(WINGS_KEY) || 'null')); } catch { return cleanWings(null); } })();
const saveWings = () => { try { localStorage.setItem(WINGS_KEY, JSON.stringify(myWings)); } catch { } };
const wingsActive = () => !!WNG.Wings && myWings.own && myWings.on;
const canFly = () => S.flyCars || wingsActive();
const flightMode = () => W.flightMode ?? !!S.flyCars; // the cheat starts with flight mode on (as before); wings start folded until you flick the switch
const wingLift = () => wingsActive() ? 1 + 0.12 * myWings.lift : 1, wingAir = () => wingsActive() ? 1 + 0.08 * myWings.air : 1;
const takeoffSpeed = () => 18 - (wingsActive() ? 2.5 * myWings.lift : 0);
// the WINGS button: extend or retract by hand ('out' / 'in'); null = automatic (out while flight mode is on)
const wingsOpenWant = () => W.wingsManual === 'out' || (W.wingsManual !== 'in' && (flyOn() || !!player.fly || W.wingShow > 0));
const wingsTucked = () => wingsActive() && !S.flyCars && W.wingsManual === 'in';
function toggleWingsOut(who) {
  if (!wingsActive()) { toast('No wings fitted: buy fold-out wings in the Wings tab of your garage workshop', 2800); return false; }
  W.wingsManual = wingsOpenWant() ? 'in' : 'out'; Audio.click();
  hudMsg((who ? 'PASSENGER · ' : '') + (W.wingsManual === 'out' ? 'WINGS OUT' : player.fly && !S.flyCars ? 'WINGS IN · NO LIFT!' : 'WINGS IN'), 1300); return true;
}
function setFlight(on, who) {
  if (on && !canFly()) { toast('Flying needs wings: buy fold-out wings in the Wings tab of your garage workshop, or switch on the flying cars cheat in Settings', 4200); Audio.beep(false); return false; }
  if (on && mode !== 'world') { toast('Flight mode works in World Drive', 2000); return false; }
  W.flightMode = !!on; W.wingsManual = null; Audio.click();
  hudMsg(on ? (wingsActive() ? 'FLIGHT MODE · WINGS OUT' : 'FLIGHT MODE ON') : (player.fly ? 'FLIGHT MODE OFF · GLIDING DOWN' : (wingsActive() ? 'FLIGHT MODE OFF · WINGS FOLDED' : 'FLIGHT MODE OFF')), 1600);
  if (on && who !== 'quiet' && !W.flightTip) { W.flightTip = 1; toast('Get up to speed, then pull up (K, Num 2, ⇧ or tilt the wheel back in VR) to take off', 3600); }
  return true;
}
function wingsHtml() {
  const w = myWings, styles = WNG.WING_STYLES || [], cols = WNG.WING_COLORS || [], pips = l => Array.from({ length: WING_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
  if (!WNG.Wings) return '<div class="gsec"><h4>Wings</h4><p class="note">Wings could not load on this device.</p></div>';
  if (!w.own) return `<div class="gsec"><h4>Fold-out wings <small>not fitted</small></h4>
    <p class="note">Wings fold flat along your car's sides and swing out when you switch flight mode on (press T, tap ✈, or flick a FLIGHT switch in the VR cockpit). Then get up to speed and pull up to take off. Nav lights on the tips, and you can upgrade lift and air speed.</p>
    <div class="av-actions"><button class="ghost" data-wing-buy>Fit wings · ${WINGS_COST.toLocaleString()} pts</button></div>
    <p class="note">You have ${(W.score | 0).toLocaleString()} points.${S.flyCars ? ' The flying cars cheat is on, so you can already fly without wings.' : ''}</p></div>`;
  const ll = w.lift, al = w.air;
  return `<div class="gsec"><h4>Fold-out wings <small>${w.on ? 'fitted' : 'taken off'}</small></h4>
    <div class="av-actions"><button class="ghost sm" data-wing-on aria-pressed="${w.on}">${w.on ? 'Wings on · take them off' : 'Wings off · put them on'}</button><button class="ghost sm" data-wing-show>Unfold them</button></div></div>
    <div class="gsec"><h4>Style</h4><div class="seg">${styles.map(([id, n]) => `<button class="${id === w.style ? 'on' : ''}" data-wing-style="${id}">${n}</button>`).join('')}</div></div>
    <div class="gsec"><h4>Colour</h4><div class="swatches">${cols.map(([id, n, c]) => `<button class="swatch ${id === w.color ? 'on' : ''}" data-wing-color="${id}"><i style="background:${c || PAINTS[S.paint].color}"></i>${n}</button>`).join('')}</div></div>
    <div class="gsec"><h4>Lift <small>Level ${ll} of ${WING_MAX}</small></h4><div class="npips">${pips(ll)}</div>
    <p class="note">+${Math.round((wingLift() - 1) * 100)}% lift, takes off from ${Math.round(takeoffSpeed() * 3.6)} km/h. More lift climbs harder and flies slower without stalling.</p>
    <div class="av-actions"><button class="ghost" data-wing-up="lift" ${ll >= WING_MAX ? 'disabled' : ''}>${ll >= WING_MAX ? 'Fully upgraded' : `Upgrade lift · ${wingLiftCost(ll).toLocaleString()} pts`}</button></div></div>
    <div class="gsec"><h4>Air speed <small>Level ${al} of ${WING_MAX}</small></h4><div class="npips">${pips(al)}</div>
    <p class="note">+${Math.round((wingAir() - 1) * 100)}% top speed in the air.</p>
    <div class="av-actions"><button class="ghost" data-wing-up="air" ${al >= WING_MAX ? 'disabled' : ''}>${al >= WING_MAX ? 'Fully upgraded' : `Upgrade air speed · ${wingAirCost(al).toLocaleString()} pts`}</button></div>
    <p class="note">You have ${(W.score | 0).toLocaleString()} points. Wings work in World Drive and multiplayer.</p></div>`;
}
function bindWings(el) {
  const shop = what => { if (garage && garage.shop) return true; toast(what + ' inside your garage'); return false; };
  el.querySelectorAll('[data-wing-buy]').forEach(b => b.onclick = () => {
    if (!shop('Wings are fitted')) return;
    if (W.score < WINGS_COST) { toast(`Wings cost ${WINGS_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= WINGS_COST; myWings.own = true; myWings.on = true; saveWings(); Audio.chime(7); hudMsg(`WINGS FITTED · −${WINGS_COST.toLocaleString()}`, 2000); W.wingShow = 2.5; renderGarage();
  });
  el.querySelectorAll('[data-wing-on]').forEach(b => b.onclick = () => { myWings.on = !myWings.on; saveWings(); if (!canFly()) W.flightMode = false; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wing-show]').forEach(b => b.onclick = () => { W.wingShow = 2.5; Audio.click(); });
  el.querySelectorAll('[data-wing-style]').forEach(b => b.onclick = () => { myWings.style = b.dataset.wingStyle; saveWings(); W.wingShow = 2.5; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wing-color]').forEach(b => b.onclick = () => { myWings.color = b.dataset.wingColor; saveWings(); W.wingShow = 2.5; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wing-up]').forEach(b => b.onclick = () => {
    if (!shop('Upgrades are done')) return;
    const k = b.dataset.wingUp, l = myWings[k]; if (l >= WING_MAX) return; const cost = k === 'lift' ? wingLiftCost(l) : wingAirCost(l);
    if (W.score < cost) { toast(`This upgrade costs ${cost.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= cost; myWings[k] = l + 1; saveWings(); Audio.chime(5); hudMsg(`${k === 'lift' ? 'LIFT' : 'AIR SPEED'} LEVEL ${myWings[k]} · −${cost.toLocaleString()}`, 1800); renderGarage();
  });
}
// ---------- stunts: the barrel roll (bought in the garage). On the ground the car hops and flips right over sideways; in the air it rolls ----------
// jump height levels: [metres, price of that level] (level 0 comes with the jump kit)
const JUMP_LV = [[2.5, 0], [4, 1500], [6, 2500], [9, 4000], [13, 6000]];
const STUNT_KEY = 'osm.stunts.v1', ROLL_COST = 4000, FLIP_COST = 2500;
let myStunt = (() => { try { const v = JSON.parse(localStorage.getItem(STUNT_KEY) || 'null') || {}; return { roll: !!v.roll, flip: !!v.flip, bflip: !!v.bflip, side: !!v.side, jump: !!v.jump, jumpLv: Math.max(0, Math.min(JUMP_LV.length - 1, v.jumpLv | 0)), jumpPaid: Math.max(0, Math.min(JUMP_LV.length - 1, v.jumpPaid | 0)) }; } catch { return { roll: false, flip: false, side: false, jump: false, jumpLv: 0 }; } })();
const saveStunt = () => { try { localStorage.setItem(STUNT_KEY, JSON.stringify(myStunt)); } catch { } };
const STUNTS = { roll: { name: 'Barrel roll', cost: ROLL_COST, msg: 'BARREL ROLL' }, flip: { name: 'Front flip', cost: FLIP_COST, msg: 'FRONT FLIP' }, bflip: { name: 'Back flip', cost: 3000, msg: 'BACK FLIP' }, side: { name: 'Two-wheeler', cost: 3000, msg: 'TWO WHEELS' }, jump: { name: 'Jump', cost: 1500, msg: 'JUMP' } };
// barrel roll (sideways, about the car's length) or front flip (nose over tail, about its width): on the ground the car hops ~3 m and
// spins once in the air; flying, it just spins
function doStunt(kind, who) {
  const T = STUNTS[kind];
  if (!myStunt[kind]) { toast(`${T.name} is an upgrade: Stunts tab in your garage workshop (${T.cost.toLocaleString()} pts)`, 3000); return false; }
  if (mode !== 'world' || W.spawning || paused || W.wreck > 0 || W.sink || garage?.busy) return false;
  if (W.roll || W.side || (W.rollCool || 0) > 0) return false;
  const pitchy = kind === 'flip' || kind === 'bflip';
  const dir = kind === 'flip' ? 1 : kind === 'bflip' ? -1 : player.input && Math.abs(player.input.steer) > 0.2 ? -Math.sign(player.input.steer) : (Math.random() < 0.5 ? 1 : -1);
  if (player.fly) W.roll = { t: 0, dur: pitchy ? 1.05 : 0.95, dir, air: true, kind };
  else {
    const vy = pitchy ? 11.1 : 10.7;
    player.air = true; player.vy = Math.max(player.vy || 0, vy); W.roll = { t: 0, dur: 2 * vy / CAR_G * 0.92, dir, air: false, kind };
    try { if (W.onWater) Audio.wash && Audio.wash(1.2); else Audio.thud(0.6); } catch { }
  }
  try { Audio.nitroHiss && Audio.air && Audio.air(true); } catch { }
  hudMsg((who ? 'PASSENGER · ' : '') + T.msg + '!', 1000); return true;
}
const doRoll = who => doStunt('roll', who), doFlip = who => doStunt('flip', who), doBackFlip = who => doStunt('bflip', who);
// Two-wheeler: tip up onto one side's wheels and drive along like that for a few seconds (the car handles exactly the same; it's all
// looks), then drop back onto all four with a thump. Lean on the steering to choose the side (it lifts the side you steer away from).
// Jump: a straight hop off all four wheels (about 2.5 m), for clearing a car, a kerb or a gap. No spin, no points, just air.
function doJump(who) {
  const T = STUNTS.jump;
  if (!myStunt.jump) { toast(`${T.name} is an upgrade: Stunts tab in your garage workshop (${T.cost.toLocaleString()} pts)`, 3000); return false; }
  if (mode !== 'world' || W.spawning || paused || W.wreck > 0 || W.sink || garage?.busy || player.air || player.fly || W.roll || (W.jumpCool || 0) > 0) return false;
  if (W.side) { W.side.ph = 2; W.side.t = 0; }
  const h = JUMP_LV[myStunt.jumpLv || 0][0]; W.jumpSafe = true; player.air = true; player.vy = Math.max(player.vy || 0, Math.sqrt(2 * CAR_G * h)); W.jumpCool = 0.45;
  try { if (W.onWater) Audio.splash && Audio.splash(true); else Audio.thud(0.45); } catch { } try { Audio.air && Audio.air(true); } catch { }
  if (who) hudMsg('PASSENGER · JUMP!', 800); return true;
}
const SIDE_ANG = 0.62, SIDE_HOLD = 4;
function doSide(who) {
  const T = STUNTS.side;
  if (!myStunt.side) { toast(`${T.name} is an upgrade: Stunts tab in your garage workshop (${T.cost.toLocaleString()} pts)`, 3000); return false; }
  if (W.side) { if (W.side.ph < 2) { W.side.ph = 2; W.side.t = 0; } return true; } // already up: drop back down now
  if (mode !== 'world' || W.spawning || paused || W.wreck > 0 || W.sink || garage?.busy || W.roll || player.air || player.fly || W.onWater) return false;
  const st = player.input ? player.input.steer : 0, dir = Math.abs(st) > 0.2 ? Math.sign(st) : (Math.random() < 0.5 ? 1 : -1);
  W.side = { t: 0, ph: 0, dir, hold: SIDE_HOLD, a: 0 };
  try { Audio.thud(0.3); } catch { } hudMsg((who ? 'PASSENGER · ' : '') + T.msg + '!', 1000); return true;
}
function sideStep(dt) {
  const S2 = W.side; if (!S2) { player.side = 0; return; }
  // the down side's wheels (car-space x); a positive steer lifts the left (+x) side, so the right wheels stay down
  const hw = 0.82, px = -S2.dir * hw, up = -Math.sign(px) * SIDE_ANG;
  if (player.air || player.fly || W.wreck > 0 || W.sink || W.onWater || W.roll) { if (S2.ph < 2) { S2.ph = 2; S2.t = 0; } }
  S2.t += dt;
  if (S2.ph === 0) { const k = Math.min(1, S2.t / 0.35); S2.a = up * (1 - Math.pow(1 - k, 3)); if (k >= 1) { S2.ph = 1; S2.t = 0; } }
  else if (S2.ph === 1) { S2.a = up * (1 + Math.sin(S2.t * 6.5) * 0.04 + Math.sin(S2.t * 2.3) * 0.03); if (S2.t >= S2.hold) { S2.ph = 2; S2.t = 0; } }
  else {
    const from = S2.from ?? (S2.from = S2.a), k = Math.min(1, S2.t / 0.22); S2.a = from * (1 - k * k);
    if (k >= 1) {
      // thump back onto all four: a heavy landing, a little bounce of the camera, and the points
      try { Audio.thud(0.75); Audio.bonk && Audio.bonk(0.6); } catch { } camShake = Math.max(camShake, 0.22); try { if (vr.presenting) vr.pulse(0.7, 90); } catch { }
      W.side = null; player.side = 0; W.score += 50; hudMsg('TWO WHEELS · +50', 900); return;
    }
  }
  player.side = S2.a; player.sideX = px;
}
function rollStep(dt) {
  if ((W.rollCool || 0) > 0) W.rollCool -= dt; if ((W.jumpCool || 0) > 0) W.jumpCool -= dt;
  const R = W.roll; if (!R) { player.stunt = 0; player.stuntP = 0; return; }
  R.t += dt; let k = Math.min(1, R.t / R.dur);
  if (!R.air && !player.air && k < 1) k = 1;
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, a = R.dir * Math.PI * 2 * e;
  if (R.kind === 'flip' || R.kind === 'bflip') { player.stuntP = a; player.stunt = 0; } else { player.stunt = a; player.stuntP = 0; }
  if (k >= 1) { player.stunt = 0; player.stuntP = 0; W.roll = null; W.rollCool = 0.6; W.score += 50; hudMsg(STUNTS[R.kind || 'roll'].msg + ' · +50', 900); try { if (vr.presenting) vr.pulse(0.6, 80); } catch { } }
}
function stuntHtml() {
  const card = (kind, how, what) => {
    const T = STUNTS[kind];
    if (myStunt[kind]) return `<div class="gsec"><h4>${T.name} <small>fitted</small></h4><p class="note">${how}${kind === 'jump' ? '' : ' +50 points for each one.'}</p>${kind === 'jump' ? jumpUpHtml() : ''}</div>`;
    return `<div class="gsec"><h4>${T.name} <small>not fitted</small></h4><p class="note">${what} Each one is worth +50 points.</p>
      <div class="av-actions"><button class="ghost" data-stunt-buy="${kind}">Fit ${T.name.toLowerCase()} · ${T.cost.toLocaleString()} pts</button></div></div>`;
  };
  return card('roll', 'Press J, tap the barrel-roll button, or hit the purple ROLL button in the VR cockpit. On the ground the car hops and flips right over sideways (lean on the steering to pick a side); flying, it does a proper barrel roll.',
      'A stunt kit: on the ground your car springs up and flips right over sideways, landing back on its wheels. In the air (flight mode) it does a full barrel roll.')
    + card('side', 'Press Q, tap the two-wheeler button, or hit the teal SIDE button in the VR cockpit. The car tips up onto one side\'s wheels for a few seconds, then drops back down (press again to drop early). Steer while you press it to pick the side.',
      'A stunt kit: tip the car up onto two wheels and drive along on its side for a few seconds before it thumps back down onto all four. It handles just the same.')
    + card('jump', `Press H, tap the jump button, or hit the white JUMP button in the VR cockpit. The car springs about ${JUMP_LV[myStunt.jumpLv || 0][0]} m straight up.`,
      'A stunt kit: a straight hop off all four wheels, about 2.5 m up. Clear traffic, kerbs and gaps.')
    + card('flip', 'Press Z, tap the front-flip button, or hit the orange FLIP button in the VR cockpit. On the ground the car hops and flips nose over tail; flying, it loops forward.',
      'A stunt kit: on the ground your car springs up and flips forward, nose over tail, landing back on its wheels. In the air (flight mode) it does a forward loop.')
    + card('bflip', 'Press K, tap the back-flip button, hit the red BACK button in the VR cockpit, or on a controller pull the left stick back and press RB. On the ground the car hops and flips tail over nose; flying, it loops backwards.',
      'A stunt kit: on the ground your car springs up and flips backwards, tail over nose, landing back on its wheels. In the air (flight mode) it does a backward loop.')
    + `<p class="note">You have ${(W.score | 0).toLocaleString()} points.</p>`;
}
function jumpUpHtml() {
  const lv = myStunt.jumpLv || 0, nx = JUMP_LV[lv + 1];
  const bars = JUMP_LV.map((l, i) => `<span class="jlv ${i <= lv ? 'on' : ''}">${l[0]} m</span>`).join('');
  return `<h5 class="orn-h">Jump height <small>level ${lv + 1} of ${JUMP_LV.length}</small></h5><div class="jlvs">${bars}</div>
    <div class="av-actions">${nx ? `<button class="ghost" data-jump-up>Higher jump: ${nx[0]} m · ${nx[1].toLocaleString()} pts</button>` : '<span class="note">Maxed out: 13 m, enough to hop onto a house</span>'}${lv > 0 ? '<button class="ghost sm" data-jump-down>Use a lower jump</button>' : ''}</div>`;
}
function bindStunt(el) {
  el.querySelectorAll('[data-jump-up]').forEach(b => b.onclick = () => {
    const lv = myStunt.jumpLv || 0, nx = JUMP_LV[lv + 1]; if (!nx) return;
    if (!(garage && garage.shop)) { toast('Upgrades are fitted inside your garage'); return; }
    // levels you've already paid for (then lowered) are free to go back up to
    if ((myStunt.jumpPaid || 0) > lv) { myStunt.jumpLv = lv + 1; saveStunt(); Audio.click(); renderGarage(); return; }
    if (W.score < nx[1]) { toast(`A ${nx[0]} m jump costs ${nx[1].toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= nx[1]; myStunt.jumpLv = lv + 1; myStunt.jumpPaid = Math.max(myStunt.jumpPaid || 0, lv + 1); saveStunt(); Audio.chime(6); hudMsg(`JUMP HEIGHT ${nx[0]} M · −${nx[1].toLocaleString()}`, 2000); renderGarage();
  });
  el.querySelectorAll('[data-jump-down]').forEach(b => b.onclick = () => { myStunt.jumpPaid = Math.max(myStunt.jumpPaid || 0, myStunt.jumpLv || 0); myStunt.jumpLv = Math.max(0, (myStunt.jumpLv || 0) - 1); saveStunt(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-stunt-buy]').forEach(b => b.onclick = () => {
    const kind = b.dataset.stuntBuy, T = STUNTS[kind]; if (!T) return;
    if (!(garage && garage.shop)) { toast('Stunt kits are fitted inside your garage'); return; }
    if (W.score < T.cost) { toast(`${T.name} costs ${T.cost.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= T.cost; myStunt[kind] = true; saveStunt(); Audio.chime(6); hudMsg(`${T.msg} FITTED · −${T.cost.toLocaleString()}`, 2000); renderGarage();
  });
}
// ---------- the points bank (a cash machine on the side of each of your garages) ----------
// Points you're carrying are lost when you close the game; points in the bank stay on this device for next time.
const BANK_KEY = 'osm.bank.v1';
let bankPts = (() => { try { const v = +localStorage.getItem(BANK_KEY); return isFinite(v) && v > 0 ? Math.floor(v) : 0; } catch { return 0; } })();
const saveBank = () => { try { localStorage.setItem(BANK_KEY, String(bankPts)); } catch { } };
let bankEl = null, bankSig = '';
function bankUi() {
  const show = mode === 'world' && !paused && !!garage && !!garage.bankNear && !garage.busy && !W.spawning && Math.hypot(player.vx || 0, player.vz || 0) < 4;
  if (!bankEl) {
    if (!show) return;
    bankEl = document.createElement('div'); bankEl.id = 'bankUI'; bankEl.className = 'bank-ui'; document.body.appendChild(bankEl);
    bankEl.addEventListener('pointerdown', e => e.stopPropagation());
    bankEl.addEventListener('click', e => {
      const b = e.target.closest('[data-bank]'); if (!b) return; const [op, amt] = b.dataset.bank.split(':'), have = Math.floor(W.score);
      if (op === 'in') { const n = amt === 'all' ? have : Math.min(have, +amt); if (n <= 0) { toast('No points on you to deposit'); return; } W.score -= n; bankPts += n; saveBank(); Audio.chime && Audio.chime(5); hudMsg(`DEPOSITED ${n.toLocaleString()} · BANK ${bankPts.toLocaleString()}`, 1600); }
      else { const n = amt === 'all' ? bankPts : Math.min(bankPts, +amt); if (n <= 0) { toast('Your bank is empty'); return; } bankPts -= n; W.score += n; saveBank(); Audio.chime && Audio.chime(3); hudMsg(`WITHDREW ${n.toLocaleString()}`, 1400); }
      bankSig = '';
    });
  }
  if (bankEl.hidden === show) bankEl.hidden = !show;
  if (!show) return;
  const sig = Math.floor(W.score) + '|' + bankPts; if (sig === bankSig) return; bankSig = sig;
  bankEl.innerHTML = `<div class="bk-h"><b>$ Points Bank</b><small>Safe for next time you play</small></div>
    <div class="bk-row"><span>On you</span><b>${Math.floor(W.score).toLocaleString()}</b></div><div class="bk-row"><span>In the bank</span><b>${bankPts.toLocaleString()}</b></div>
    <div class="bk-btns"><button data-bank="in:all">Deposit all</button><button data-bank="in:1000">Deposit 1,000</button><button data-bank="out:1000">Withdraw 1,000</button><button data-bank="out:all">Withdraw all</button></div>`;
}
// ---------- your driver: the person in your seat (Garage > Workshop > Driver) ----------
// Passengers riding with you and other players see the whole person; from your own seat you see your body and arms on the wheel
// (in VR your real hands take over from the arms). The formula car and the bike keep their own helmeted rider.
// You can also wear your own 3D models as the head (a face scan), the top and the trousers, and move the driver around inside
// a custom uploaded car body.
const DRIVER_KEY = 'osm.driver.v1', NO_DRIVER = new Set(['formula']);
let myDriver = (() => { try { const v = JSON.parse(localStorage.getItem(DRIVER_KEY) || 'null'); return { look: cleanDriver(v && v.look) || defaultDriver('m'), on: !(v && v.on === 0), seat: cleanSeat(v && v.seat), pseat: [0, 1, 2].map(i => cleanSeat(v && Array.isArray(v.pseat) ? v.pseat[i] : null)) }; } catch { return { look: defaultDriver('m'), on: true, seat: cleanSeat(null), pseat: [0, 1, 2].map(() => cleanSeat(null)) }; } })();
delete myDriver.look.seat; delete myDriver.look.pseat; delete myDriver.look.hide;
const driverNet = () => ({ ...myDriver.look, seat: myDriver.seat, pseat: myDriver.pseat, ...(myDriver.on ? {} : { hide: 1 }), ...(petNet() ? { pet: petNet() } : {}) }); // passenger seats travel even when your driver is hidden
let drvSeatT = 0;
const saveDriver = (quiet) => { try { localStorage.setItem(DRIVER_KEY, JSON.stringify({ look: myDriver.look, on: myDriver.on ? 1 : 0, seat: myDriver.seat, pseat: myDriver.pseat })); } catch { } clearTimeout(drvSeatT); drvSeatT = setTimeout(() => { try { net.setDriver(driverNet()); } catch { } }, quiet ? 250 : 0); };
// uploaded part models: placements in localStorage, the files in IndexedDB ('drvp:<hash>'), shared with friends like ornaments
const PARTS_KEY = 'osm.drvparts.v1', PART_ASSET = { head: 'dh', top: 'dt', pants: 'dp' };
let myParts = (() => { const out = { head: null, top: null, pants: null }; try { const v = JSON.parse(localStorage.getItem(PARTS_KEY) || '{}') || {}; for (const [id] of PART_SLOTS) if (v[id] && v[id].h) out[id] = { h: String(v[id].h), m: cleanPart(v[id].m), data: null }; } catch { } return out; })();
let drvSlot = 'head', drvPick = 'head', drvDel = '', partNetT = 0;
const saveParts = () => { try { const o = {}; for (const [id] of PART_SLOTS) o[id] = myParts[id] ? { h: myParts[id].h, m: myParts[id].m } : null; localStorage.setItem(PARTS_KEY, JSON.stringify(o)); } catch { } };
const partShare = (id, metaOnly) => { const a = myParts[id], k = PART_ASSET[id]; if (!a || !a.data) { net.setAsset(k, null); return; } if (!metaOnly) { net.setAsset(k, a); return; } clearTimeout(partNetT); partNetT = setTimeout(() => { if (myParts[id]) net.setAssetMeta(k, myParts[id].m); }, 200); };
for (const [id] of PART_SLOTS) { const a = myParts[id]; if (a) idbGet('drvp:' + a.h).then(d => { if (myParts[id] !== a) return; if (typeof d === 'string') { a.data = d; partShare(id); } else { myParts[id] = null; saveParts(); } renderGarage(); }).catch(() => { }); }
const validPart = a => a && typeof a.data === 'string' && a.data.length < MAX_PART_BYTES * 1.4 && a.h ? { h: a.h, m: cleanPart(a.m), data: a.data } : null;
const partsFor = id => { const o = {}; for (const [p] of PART_SLOTS) o[p] = validPart(net.assets.get(id + '|' + PART_ASSET[p])); return o; };
// keep one car's driver in step with a look (null = nobody); returns the driver or null
function syncDriver(mesh, model, look) {
  const ud = mesh.userData, base = String(model || '').split('+')[0], cfg = cockpitFor(base); // the custom frame borrows the coupe's seat
  let sig = '';
  if (look && !look.hide && cfg && !NO_DRIVER.has(base)) { const { seat, pseat, pet, ...rest } = look; sig = base + JSON.stringify(rest); }
  if (ud.drvSig !== sig || (ud.drv && ud.drv.g.parent !== mesh)) {
    if (ud.drv) { if (ud.drv.g.parent) ud.drv.g.parent.remove(ud.drv.g); try { ud.drv.dispose(); } catch { } }
    ud.drv = null; ud.drvSig = sig;
    if (sig) { try { const d = buildDriver(look, { bike: isBike(base) }); d.g.position.set(...cfg.eye); d.g.rotation.x = cfg.lean || 0; d.cfg = cfg; d.steer = null; mesh.add(d.g); ud.drv = d; } catch (e) { console.warn('[overpass] driver', e); } }
    // the motorbike's built-in rider makes way for your own driver
    if (isBike(base)) mesh.traverse(o => { if (o.userData.rider) o.visible = !ud.drv && !ud.ckHide; });
  }
  return ud.drv || null;
}
// in a custom car body the driver sits where you put them (your own cockpit view stays at the normal seat)
function placeDriver(d, mesh, seat, own) {
  const e = d.cfg.eye, c = !own && (!!mesh.userData.customKey || String(mesh.userData.model || '').split('+')[0] === 'custom') && seat ? seat : null;
  d.g.position.set(e[0] + (c ? c.x : 0), e[1] + (c ? c.y : 0), e[2] + (c ? c.z : 0)); d.g.scale.setScalar(c ? c.s : 1);
}
const _gripA = [], _eyeV = new THREE.Vector3(), _xAx = new THREE.Vector3(1, 0, 0);
function driverArms(d, steer) { // hands at ten and two on the wheel, turning with it
  if (d.steer !== null && Math.abs(d.steer - steer) < 0.004) return; d.steer = steer;
  _eyeV.set(...d.cfg.eye); const gr = wheelGrips(d.cfg, steer); _gripA.length = 0; for (const v of gr) { v.sub(_eyeV); if (d.cfg.lean) v.applyAxisAngle(_xAx, -d.cfg.lean); _gripA.push(v); } d.setArms(_gripA);
}
// ---------- the front passenger: a dog (billboard) or your own model (companion.js) ----------
const PET_KEY = 'osm.pet.v1';
const cleanPetM = m => { const n = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d); m = m || {}; return { name: String(m.name || 'Model').slice(0, 24), ext: PART_EXTS.includes(m.ext) ? m.ext : 'glb', size: +m.size || 0, x: n(m.x, -1, 1, 0), y: n(m.y, -1, 1, 0), z: n(m.z, -1, 1, 0), s: n(m.s, 0.2, 3, 1), yaw: n(m.yaw, -180, 180, 0) }; };
let myPet = (() => { try { const v = JSON.parse(localStorage.getItem(PET_KEY) || 'null') || {}; return { kind: ['none', 'dog', 'cat', 'model'].includes(v.kind) ? v.kind : 'dog', coat: DOG_COATS.some(c => c[0] === v.coat) ? v.coat : 'golden', catCoat: CAT_COATS.some(c => c[0] === v.catCoat) ? v.catCoat : 'orange', h: v.h ? String(v.h) : '', m: cleanPetM(v.m), data: null }; } catch { return { kind: 'dog', coat: 'golden', catCoat: 'orange', h: '', m: cleanPetM(null), data: null }; } })();
const savePet = () => { try { localStorage.setItem(PET_KEY, JSON.stringify({ kind: myPet.kind, coat: myPet.coat, catCoat: myPet.catCoat, h: myPet.h, m: myPet.m })); } catch { } saveDriver(true); };
// ---------- Store32 scratch-offs (scratch.js) ----------
const TICKET_KEY = 'osm.tickets.v1';
let myTickets = (() => { try { const a = JSON.parse(localStorage.getItem(TICKET_KEY) || '[]'); return Array.isArray(a) ? a.filter(t => t && t.id && Array.isArray(t.cells) && t.cells.length === 6).slice(0, 60) : []; } catch { return []; } })();
const saveTickets = () => { try { localStorage.setItem(TICKET_KEY, JSON.stringify(myTickets)); } catch { } };
const s32 = new ScratchShop({
  score: () => W.score, spend: n => { W.score -= n; },
  win: (n, T) => { W.score += n; Audio.chime(10); hudMsg(`${T.name.toUpperCase()} WIN · +${n.toLocaleString()}`, 2200); },
  save: tk => { myTickets.push(tk); saveTickets(); }, tickets: () => myTickets, remove: id => { myTickets = myTickets.filter(t => t.id !== id); saveTickets(); if (garage && garage.shop) renderGarage(); },
  sound: k => { try { if (k === 'scratch') Audio.scratch(); else if (k === 'buy') Audio.chime(4); else Audio.click(); } catch { } }, toast: (m, ms) => toast(m, ms),
});
const vrShop = (() => { try { return new VrShop(); } catch { return null; } })();
function openStore32() {
  if (vr.presenting && vrShop) { const e = vr.rig.position; vrShop.show(player.mesh, new THREE.Vector3(e.x, e.y - 0.14, e.z + 0.5), W.score, myTickets.length); Audio.chime(3); hudMsg('STORE32 · POKE A TICKET TO BUY', 1800); return; }
  s32.shop(); Audio.chime(3);
}
const _vrTips = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function vrShopStep(dt) {
  if (!vrShop || !vrShop.open) return;
  if (!vr.presenting || Math.abs(player.speed) > 6) { vrShop.hide(); return; }
  const tips = []; for (const h of vr.hands || []) { if (!h.src) continue; const n = vr.tips ? vr.tips(h, _vrTips.slice(tips.length)) : 0; for (let i = 0; i < n; i++) tips.push(_vrTips[tips.length]); }
  const i = vrShop.poke(tips, dt); if (i < 0) return;
  if (i === 3) { vrShop.hide(); Audio.click(); return; }
  const T = TIERS[i]; try { vr.pulse(0.5, 40); } catch { }
  if (W.score < T.cost) { vrShop.flash(`${T.name} costs ${T.cost.toLocaleString()} points`, W.score, myTickets.length); Audio.click(); return; }
  W.score -= T.cost; myTickets.push(newTicket(T.id)); saveTickets(); Audio.chime(4);
  vrShop.flash(`${T.name} saved in your garage: scratch it on a screen later!`, W.score, myTickets.length);
}
function ticketsHtml() {
  const by = {}; for (const t of myTickets) (by[t.tier] = by[t.tier] || []).push(t);
  return `<div class="gsec"><h4>Scratch-offs <small>${myTickets.length ? myTickets.length + ' saved' : 'none saved'}</small></h4>
    <p class="note">Tickets you bought at a Store32 and haven't scratched yet (tickets bought in VR wait here). Scratch them with your finger or the mouse.</p>
    ${myTickets.length ? `<div class="s32-saved">${myTickets.map(t => { const T = tierOf(t.tier); return `<button class="s32-stub" style="--a:${T.bg[0]};--b:${T.bg[1]};--ink:${T.ink}" data-s32-scratch="${t.id}"><b>${T.name}</b><small>${new Date(t.t).toLocaleDateString()} · tap to scratch</small></button>`; }).join('')}</div>`
      : '<p class="note">Pull up at a Store32 (the orange 3 on the map) to buy some.</p>'}</div>`;
}
function bindTickets(el) { el.querySelectorAll('[data-s32-scratch]').forEach(b => b.onclick = () => { const t = myTickets.find(k => k.id === b.dataset.s32Scratch); if (t) { Audio.click(); s32.scratch(t); } }); }
function iceWanted() {
  if (mode !== 'world') return false;
  if (S.season === 'winter') return true;
  if (S.season !== 'real') return false;
  const lat = Math.abs(seasons.lat || 0), T = seasons.temp, cal = seasons.cal || {};
  if (T != null && T <= -4) return true;
  if (lat >= 70 && (cal.dormant || 0) > 0.3) return true;
  return lat >= 42 && (cal.dormant || 0) > 0.6 && (T == null ? lat >= 50 : T <= 0);
}
function petNet() { return myPet.kind === 'dog' ? 'dog:' + myPet.coat : myPet.kind === 'cat' ? 'cat:' + myPet.catCoat : myPet.kind === 'model' && myPet.h ? 'model' : ''; }
const petShare = metaOnly => { try { if (myPet.kind !== 'model' || !myPet.data) { net.setAsset('pm', null); return; } if (metaOnly) net.setAssetMeta('pm', myPet.m); else net.setAsset('pm', { h: myPet.h, m: myPet.m, data: myPet.data }); } catch { } };
if (myPet.h) idbGet('pet:' + myPet.h).then(d => { if (typeof d === 'string') { myPet.data = d; petShare(); } else { myPet.h = ''; if (myPet.kind === 'model') myPet.kind = 'dog'; savePet(); } }).catch(() => { });
const myCompanion = (() => { try { return new Companion(); } catch (e) { console.warn('[overpass] passenger off:', e); return null; } })();
let petBlockT = 0, petAirT = 0;
// people on foot standing in the road just ahead of you (seconds)
function pedsBlocking(dt) {
  let blocked = false;
  try {
    if (pedestrians && Math.abs(player.speed) < 4) {
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), dir = player.speed < -0.3 ? -1 : 1;
      for (const p of pedestrians.people || []) { const dx = p.x - player.x, dz = p.z - player.z, ahead = (dx * fx + dz * fz) * dir, lat = Math.abs(dx * fz - dz * fx); if (ahead > 0.5 && ahead < 9 && lat < 1.9 && !p.dead && !p.splat) { blocked = true; break; } }
    }
  } catch { }
  petBlockT = blocked ? petBlockT + dt : 0; return petBlockT;
}
function petStep(dt) {
  if (!myCompanion) return;
  const playing = mode === 'world' || mode === 'story', base = carBase();
  // (no dog on the motorbike: the pillion seat is right behind the rider)
  const seats = playing && !NO_DRIVER.has(base) && !isBike(base) ? capacity(base) : 0, riderFront = net.riders ? [...(net.riders.values?.() || [])].some(r => r && r.seat === 0) : false;
  if (!seats || myPet.kind === 'none' || riderFront) { myCompanion.update(dt, { kind: 'none' }); return; }
  petAirT = player.air ? petAirT + dt : 0;
  const ev = myCompanion.update(dt, { mesh: player.mesh, eye: seatEye(base, 0, myDriver.pseat[0]), kind: myPet.kind === 'model' && !myPet.data ? 'dog' : myPet.kind, coat: myPet.kind === 'cat' ? myPet.catCoat : myPet.coat, model: myPet.kind === 'model' ? { h: myPet.h, data: myPet.data, m: myPet.m } : null,
    speed: player.speed, under: !!W.dive, air: !!player.fly || petAirT > 0.6, blocked: pedsBlocking(dt), cam: camera, ckpt: cockpitView() });
  if (ev === 'bark') { try { Audio.woof(); } catch { } }
  if (ev === 'meow') { try { Audio.meow && Audio.meow(); } catch { } }
}
// friends' passengers: their dog (or model) rides in their car too
function petRemote(r, dl, id, dt) {
  const pet = dl && dl.pet, base = String(r.car.model || '').split('+')[0];
  if (!pet || NO_DRIVER.has(base) || isBike(base) || !capacity(base)) { if (r.pet) r.pet.update(dt, { kind: 'none' }); return; }
  if (!r.pet) { try { r.pet = new Companion(); } catch { return; } }
  const sp = r._petP ? Math.hypot(r.x - r._petP[0], r.z - r._petP[1]) / Math.max(dt, 1e-3) : 0; r._petP = [r.x, r.z];
  r._petSp = (r._petSp || 0) + (sp - (r._petSp || 0)) * Math.min(1, dt * 3);
  const a = pet === 'model' ? validPart(net.assets.get(id + '|pm')) : null;
  r.pet.update(dt, { mesh: r.car.mesh, eye: seatEye(base, 0, dl.pseat && dl.pseat[0]), kind: pet === 'model' ? (a ? 'model' : 'none') : pet.startsWith('cat:') ? 'cat' : 'dog', coat: pet.slice(4), model: a, speed: r._petSp, under: false, air: (r.alt || 0) > 3, blocked: 0, cam: camera, ckpt: false });
}
let drvNetSent = false;
function driverStep() {
  if (!drvNetSent) { drvNetSent = true; try { net.setDriver(driverNet()); } catch { } }
  const playing = mode === 'world' || mode === 'story';
  const d = syncDriver(player.mesh, player.model, playing && myDriver.on ? myDriver.look : null); if (!d) return;
  const inCk = cockpitView() && !!cockpit && cockpit.group.visible;
  d.g.visible = true; d.setParts(myParts); d.view(inCk, vr.presenting); placeDriver(d, player.mesh, myDriver.seat, inCk);
  // in VR your driver's arms reach to wherever your real hands are
  if (inCk && vr.presenting && vr.hands) {
    const T = [null, null]; d.g.updateMatrixWorld(true);
    for (const h of vr.hands) { if (!h.src) continue; const p = vr.palmPos ? vr.palmPos(h, new THREE.Vector3()) : h.grip.getWorldPosition(new THREE.Vector3()); T[h.src.handedness === 'right' ? 0 : 1] = d.g.worldToLocal(p); }
    if (T[0] || T[1]) { d.steer = null; d.setArms(T); return; }
  }
  driverArms(d, inCk ? cockpit.wheel.rotation.z : (player.steer || 0) * maxRot(d.cfg));
}
// a little turntable preview in the Driver tab
let drvPrev = null, drvEdit = null, drvZoom = false, drvFaceTab = 'Head', drvEditT = 0;
function driverPreview(el) {
  const host = el.querySelector('#drvPrev'); if (!host) return;
  try {
    if (!drvPrev) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(220, 240); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#e8eeff', '#4a3f36', 1.3)); const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(1.5, 2, 2.5); sc.add(sun);
      const cam = new THREE.PerspectiveCamera(32, 220 / 240, 0.05, 20); cam.position.set(1.05, -0.02, 1.3); cam.lookAt(0, -0.3, 0.08);
      const whl = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 32), new THREE.MeshStandardMaterial({ color: '#1c1d22', roughness: 0.5 })); whl.position.set(0, -0.3, 0.4); whl.rotation.x = -0.42;
      drvPrev = { r, sc, cam, whl, d: null, sig: '', t: 0, raf: 0 };
    }
    const P = drvPrev, whl = P.whl;
    const rebuild = () => { const lk = drvEdit || myDriver.look, fast = !!drvEdit, sig = JSON.stringify(lk) + fast; if (P.sig === sig) return; const now = performance.now(); if (fast && now - (P.bt || 0) < 90) return; P.bt = now; if (P.d) { P.sc.remove(P.d.g); P.d.g.remove(whl); try { P.d.dispose(); } catch { } } P.d = buildDriver(lk, { fast }); P.d.setArms([new THREE.Vector3(-0.149, -0.226, 0.367), new THREE.Vector3(0.149, -0.226, 0.367)]); P.d.g.add(whl); P.sc.add(P.d.g); P.sig = sig; };
    // phones: the garage panel is a short sheet at the bottom, so the preview floats over the top-left of the screen instead
    const ws = host.closest('#workshop'), float = !!ws && window.innerWidth <= 760;
    let fl = document.getElementById('drvFloat');
    if (float && !fl) { fl = document.createElement('div'); fl.id = 'drvFloat'; fl.className = 'drv-float'; document.body.appendChild(fl); }
    if (fl) fl.hidden = !float;
    rebuild(); (float ? fl : host).appendChild(P.r.domElement);
    cancelAnimationFrame(P.raf); let last = performance.now(), zk = drvZoom ? 1 : 0;
    const loop = now => {
      if (!host.isConnected || (ws && ws.hidden)) { if (fl) fl.hidden = true; return; } const dt = Math.min(0.1, (now - last) / 1000); P.t += dt; last = now; rebuild(); P.d.setParts(myParts);
      zk += ((drvZoom ? 1 : 0) - zk) * Math.min(1, dt * 6); P.d.g.rotation.y = Math.sin(P.t * 0.5) * (0.45 - 0.2 * zk);
      P.cam.position.set(1.05 - 0.83 * zk, -0.02 + 0.05 * zk, 1.3 - 0.72 * zk); P.cam.lookAt(0, -0.3 + 0.32 * zk, 0.08 - 0.05 * zk);
      P.r.render(P.sc, P.cam); P.raf = requestAnimationFrame(loop);
    };
    P.raf = requestAnimationFrame(loop);
  } catch (e) { host.hidden = true; }
}
// [field, label, step, min, max, format]
const cmF = v => `${Math.round(v * 100)} cm`, degF = v => `${Math.round(v)}°`, pctF = v => `${Math.round(v * 100)}%`;
const PART_ROWS = [['x', 'Side to side', 0.01, -1, 1, cmF], ['y', 'Down · up', 0.01, -1, 1, cmF], ['z', 'Back · forward', 0.01, -1, 1, cmF], ['s', 'Size', 0.05, 0.1, 4, pctF], ['yaw', 'Turn', 15, -180, 180, degF], ['pitch', 'Tilt', 15, -180, 180, degF], ['roll', 'Roll', 15, -180, 180, degF]];
const PSEAT_ROWS = [['x', 'Side to side', 0.05, -2, 2, cmF], ['y', 'Down · up', 0.05, -2, 3, cmF], ['z', 'Back · forward', 0.05, -3, 3, cmF]];
let drvSeatSel = 0, drvSeatShow = false;
const carBase = () => String(player.model || '').split('+')[0];
const seatNames = () => { const n = capacity(carBase()); return ['Driver', ...(n >= 1 ? ['Front passenger'] : []), ...(n >= 2 ? ['Rear, behind driver'] : []), ...(n >= 3 ? ['Rear, other side'] : [])]; };
const rhd = () => myDriver.seat.x < -0.1;
// glowing stand-ins in every seat of your car while you set them up (orange = the one you're moving)
let seatGhostG = null;
const ghostMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
const GHOST_ON = ghostMat('#ff9a2a'), GHOST_OFF = ghostMat('#4fd8ff');
function seatGhosts() {
  const want = drvSeatShow && garage && garage.shop && garage.shop.tab === 'driver' && (mode === 'world' || mode === 'story');
  if (!want) { if (seatGhostG) { seatGhostG.parent && seatGhostG.parent.remove(seatGhostG); seatGhostG = null; } return; }
  const base = carBase(), cfg = cockpitFor(base), n = 1 + capacity(base), key = base + n;
  if (!seatGhostG || seatGhostG.parent !== player.mesh || seatGhostG.userData.key !== key) {
    if (seatGhostG && seatGhostG.parent) seatGhostG.parent.remove(seatGhostG);
    seatGhostG = new THREE.Group(); seatGhostG.name = 'seat-ghosts'; seatGhostG.userData.cockpit = true; seatGhostG.userData.key = key; seatGhostG.userData.list = [];
    for (let i = 0; i < n; i++) {
      const d = buildDriver(defaultDriver(i % 2 ? 'f' : 'm')); if (i === 0) { const e = new THREE.Vector3(...cfg.eye); d.setArms(wheelGrips(cfg, 0).map(v => v.sub(e))); }
      d.g.traverse(o => { if (o.isMesh) { o.renderOrder = 20; o.castShadow = false; } }); seatGhostG.add(d.g); seatGhostG.userData.list.push(d.g);
    }
    player.mesh.add(seatGhostG);
  }
  seatGhostG.userData.list.forEach((g, i) => {
    const sel = i === drvSeatSel, m = sel ? GHOST_ON : GHOST_OFF; g.traverse(o => { if (o.isMesh && o.material !== m) o.material = m; });
    if (i === 0) { const e = cfg.eye, st = myDriver.seat; g.position.set(e[0] + st.x, e[1] + st.y, e[2] + st.z); g.scale.setScalar(st.s); }
    else { const p = seatEye(base, i - 1, myDriver.pseat[i - 1]); g.position.set(p[0], p[1], p[2]); g.scale.setScalar(1); }
  });
}
const SEAT_ROWS = [['x', 'Side to side', 0.05, -2, 2, cmF], ['y', 'Down · up', 0.05, -2, 3, cmF], ['z', 'Back · forward', 0.05, -3, 3, cmF], ['s', 'Size', 0.05, 0.3, 3, pctF]];
const adjRows = (kind, rows, obj) => rows.map(([f, label, , , , fmt]) => `<div class="lt-row"><span>${label}</span><button data-dadj="${kind}:${f}:-1" aria-label="${label} less">−</button><em data-dval="${kind}:${f}">${fmt(obj[f])}</em><button data-dadj="${kind}:${f}:1" aria-label="${label} more">+</button></div>`).join('');
function driverHtml() {
  if (drvSeatSel >= seatNames().length) drvSeatSel = 0;
  const L = myDriver.look, base = String(player.model).split('+')[0];
  const seg = (k, list, cur) => `<div class="dseg">${list.map(([id, n]) => `<button class="${id === cur ? 'on' : ''}" data-drv="${k}:${id}">${n}</button>`).join('')}</div>`;
  const dots = (k, list, cur) => `<div class="swatches dsw">${list.map(c => `<button class="swatch ${c === cur ? 'on' : ''}" data-drv="${k}:${c}" aria-label="colour ${c}"><i style="background:${c}"></i></button>`).join('')}</div>`;
  const slotName = id => PART_SLOTS.find(p => p[0] === id)[1], a = myParts[drvSlot], builtIn = { head: 'built-in head', top: 'built-in chest', pants: 'built-in hips' }[drvSlot];
  let card;
  if (!a) card = `<div class="cl-card"><div class="ic">+</div><div class="tx"><b>Upload a ${slotName(drvSlot).toLowerCase()} model</b>
      <small>GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_PART_BYTES)}.${drvSlot === 'head' ? ' A 3D face scan from a phone app works well (export it as GLB with its texture).' : ''} It's sized to fit and put in place, then nudge it with the buttons.</small>
      <div class="av-actions"><button class="ghost sm" data-dpart-pick>Upload model</button></div></div></div>`;
  else {
    const m = a.m;
    card = `<div class="cl-card"><div class="ic">3D</div><div class="tx"><b>${escapeHtml(m.name)}</b>
      <small>${escapeHtml(m.ext.toUpperCase())} · ${fmtBytes(m.size || 0)}${a.data ? '' : ' · loading…'}</small>
      <div class="av-actions"><button class="ghost sm" data-dpart-on>${m.on ? 'Hide it' : 'Show it'}</button><button class="ghost sm" data-dpart-hide aria-pressed="${!!m.hide}">${m.hide ? `Show ${builtIn} too` : `Hide ${builtIn}`}</button><button class="ghost sm" data-dpart-pick>Replace</button><button class="ghost sm" data-dpart-del>${drvDel === drvSlot ? 'Tap again to remove' : 'Remove'}</button></div>
      <h5 class="orn-h">Placement <small>hold + or − to keep going</small></h5>${adjRows('p', PART_ROWS, m)}
      ${drvSlot === 'head' ? `<p class="note">${m.fit === 0 ? 'Free: the model is just sized and centred on the head. Glue it to put a face scan on the face.' : 'Glued to the face: the scan is turned to face forwards, made right side out, sized to a real head and its nose put on the driver\'s nose, so it turns with the head. Use the buttons to fine-tune.'}</p>` : ''}<div class="av-actions">${drvSlot === 'head' ? `<button class="ghost sm" data-dpart-fit aria-pressed="${m.fit !== 0}">${m.fit === 0 ? 'Glue to face' : 'Glued to face · unglue'}</button>` : ''}<button class="ghost sm" data-dpart-snap="180">Turn around</button><button class="ghost sm" data-dpart-snap="up">Stand it up</button><button class="ghost sm" data-dpart-reset>Reset placement</button></div></div></div>`;
  }
  const custom = !!player.mesh.userData.customKey || base === 'custom';
  return `<div class="drv-stick"><div id="drvPrev" class="drv-prev"></div></div>
    <div class="gsec"><h4>Your driver <small>${myDriver.on ? 'in the seat' : 'hidden'}</small></h4>
    <p class="note">The person behind your wheel. Passengers riding with you and other players see them; from your own seat you see your body and your arms on the wheel (in VR your real hands take over).${NO_DRIVER.has(base) ? ' Your current car (formula / bike) keeps its own helmeted rider.' : ''}</p>
    <div class="av-actions"><button class="ghost sm" data-drv-on aria-pressed="${myDriver.on}">${myDriver.on ? 'Driver shown · hide' : 'Driver hidden · show'}</button><button class="ghost sm" data-drv-rand>Surprise me</button></div></div>
    <div class="gsec"><h4>Style</h4>${seg('style', [['s', 'Simple'], ['r', 'Realistic']], L.style || 's')}
      <p class="note">${(L.style || 's') === 'r' ? 'Realistic: a sculpted head with a painted face, real eyes and eyelids. Every face slider below shapes it.' : 'Simple: a cartoony, toy-like head. The face sliders below still nudge it; switch to Realistic for the full face editor.'}</p></div>
    <div class="gsec"><h4>Build</h4>${seg('b', [['m', 'Masculine'], ['f', 'Feminine']], L.b)}</div>
    <div class="gsec"><h4>Face <small>${(L.style || 's') === 'r' ? 'realistic' : 'simple'}</small></h4>
      <div class="dseg">${FACE_GROUPS.map(gn => `<button class="${gn === drvFaceTab ? 'on' : ''}" data-dface-tab="${gn}">${gn}</button>`).join('')}</div>
      <div class="fsl-list">${FACE_SLIDERS.filter(f => f[0] === drvFaceTab).map(([, k, label]) => { const z = ZERO_ONE.has(k), v = Math.round(((L.face || {})[k] || (k === 'blush' ? (L.b === 'f' ? 0.35 : 0.08) : 0)) * 100); return `<label class="fsl"><span>${label}</span><input type="range" min="${z ? 0 : -100}" max="100" step="1" value="${v}" data-face="${k}" aria-label="${label}"></label>`; }).join('')}</div>
      ${drvFaceTab === 'Eyes' ? `<h5 class="orn-h">Eye colour</h5><div class="swatches dsw">${EYE_COLORS.map(([id, c]) => `<button class="swatch ${((L.face || {}).eye || 'brown') === id ? 'on' : ''}" data-dface-eye="${id}" aria-label="${id} eyes"><i style="background:${c}"></i></button>`).join('')}</div>` : ''}
      ${drvFaceTab === 'Mouth' ? `<h5 class="orn-h">Lip colour</h5><div class="dseg">${LIP_TINTS.map(([id]) => `<button class="${((L.face || {}).lip || 'natural') === id ? 'on' : ''}" data-dface-lip="${id}">${id[0].toUpperCase() + id.slice(1)}</button>`).join('')}</div>` : ''}
      <div class="av-actions"><button class="ghost sm" data-dface-zoom aria-pressed="${drvZoom}">${drvZoom ? 'Show whole body' : 'Close-up of the face'}</button><button class="ghost sm" data-dface-rand>Random face</button><button class="ghost sm" data-dface-reset>Reset ${drvFaceTab.toLowerCase()}</button><button class="ghost sm" data-dface-resetall>Reset whole face</button></div></div>
    <div class="gsec"><h4>Skin</h4><div class="swatches">${SKINS.map(([id, n, c]) => `<button class="swatch ${id === L.skin ? 'on' : ''}" data-drv="skin:${id}"><i style="background:${c}"></i>${n}</button>`).join('')}</div></div>
    <div class="gsec"><h4>Hair</h4>${seg('hair', HAIRS, L.hair)}${dots('hc', HAIR_COLORS, L.hc)}</div>
    <div class="gsec"><h4>Facial hair</h4>${seg('beard', BEARDS, L.beard)}</div>
    <div class="gsec"><h4>Hat &amp; glasses</h4>${seg('hat', HATS, L.hat)}${seg('glasses', [[0, 'No glasses'], [1, 'Sunglasses']], L.glasses)}</div>
    <div class="gsec"><h4>Top</h4>${dots('top', TOP_COLORS, L.top)}</div>
    <div class="gsec"><h4>Trousers</h4>${dots('pants', PANTS_COLORS, L.pants)}</div>
    <div class="gsec"><h4>Your own models <small>head · top · pants</small></h4>
    <p class="note">Wear your own 3D models as the head, top or trousers. Arms and legs always stay on, so tops and pants work like layers: size and nudge them to fit over the body. Friends in multiplayer see them too (big files take a while to reach them).</p>
    <div class="dseg">${PART_SLOTS.map(([id, n]) => `<button class="${id === drvSlot ? 'on' : ''}" data-dpart-slot="${id}">${n}${myParts[id] ? ' ✓' : ''}</button>`).join('')}</div>
    <div class="custom-grid">${card}</div></div>
    ${petHtml()}
    <div class="gsec"><h4>Seats in custom cars <small>${custom ? 'your car is custom' : 'for uploaded car models'}</small></h4>
    <p class="note">For your own uploaded car model (or custom frame): line up where your driver and your passengers sit with your model's cabin. Glowing stand-ins show each seat in the car while you set them (the selected one in orange). Got a right-hand-drive (UK / European / Japanese) model? Tap <b>Swap sides</b>. Passengers riding with you use your seat positions. Your own cockpit view doesn't move.${custom ? '' : ' <b>These only apply once your car has a custom body.</b>'}</p>
    <div class="dseg">${seatNames().map((n, i) => `<button class="${i === drvSeatSel ? 'on' : ''}" data-dseat-pick="${i}">${n}</button>`).join('')}</div>
    ${drvSeatSel === 0 ? adjRows('s', SEAT_ROWS, myDriver.seat) : adjRows('q', PSEAT_ROWS, myDriver.pseat[drvSeatSel - 1])}
    <div class="av-actions"><button class="ghost sm" data-dseat-show aria-pressed="${drvSeatShow}">${drvSeatShow ? 'Hide the seat stand-ins' : 'Show the seat stand-ins'}</button><button class="ghost sm" data-dseat-swap>${rhd() ? 'Swap sides back (left-hand drive)' : 'Swap sides (right-hand drive)'}</button><button class="ghost sm" data-dseat-reset>Reset ${drvSeatSel === 0 ? 'driver seat' : 'this seat'}</button></div></div>`;
}
const PET_ROWS = [['x', 'Side to side', 0.02, -1, 1, cmF], ['y', 'Down · up', 0.02, -1, 1, cmF], ['z', 'Back · forward', 0.02, -1, 1, cmF], ['s', 'Size', 0.05, 0.2, 3, pctF], ['yaw', 'Turn', 15, -180, 180, degF]];
function petHtml() {
  const k = myPet.kind, seg = `<div class="dseg">${[['none', 'Nobody'], ['dog', 'Dog'], ['cat', 'Cat'], ['model', 'Your model']].map(([id, n]) => `<button class="${id === k ? 'on' : ''}" data-pet="${id}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (k === 'dog') body = `<p class="note">Your dog sits up beside you, sits looking at you when you stop, sticks its head out of the window with its tongue flapping when you go fast, and barks out of the window if people on foot block the road for more than a second. It wears a little scuba mask under water and a flying helmet in the air.</p>
    <div class="swatches">${DOG_COATS.map(([id, n, c]) => `<button class="swatch ${id === myPet.coat ? 'on' : ''}" data-pet-coat="${id}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>`;
  else if (k === 'cat') body = `<p class="note">Your cat sits beside you and flicks its tail, curls up for a nap now and then (more on long smooth drives), and sometimes bats a ball of yarn around the seat. It stays well away from the window, and gives people on foot blocking the road a loud MEOW. It gets the scuba mask underwater and the flying helmet in the air too.</p><h5 class="orn-h">Coat</h5>
    <div class="swatches">${CAT_COATS.map(([id, n, c]) => `<button class="swatch ${id === myPet.catCoat ? 'on' : ''}" data-pet-cat="${id}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>`;
  else if (k === 'model') {
    const m = myPet.m;
    body = myPet.h ? `<div class="custom-grid"><div class="cl-card"><div class="ic">3D</div><div class="tx"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.ext.toUpperCase())} · ${fmtBytes(m.size || 0)}${myPet.data ? '' : ' · loading…'}</small>
      <div class="av-actions"><button class="ghost sm" data-pet-pick>Replace</button><button class="ghost sm" data-pet-reset>Reset placement</button><button class="ghost sm danger" data-pet-del>Remove</button></div>
      <h5 class="orn-h">Placement <small>hold + or − to keep going</small></h5>${adjRows('c', PET_ROWS, m)}</div></div></div>`
      : `<div class="custom-grid"><div class="cl-card"><div class="ic">+</div><div class="tx"><b>Upload a passenger model</b><small>GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_PART_BYTES)}: a pet, a friend, a mascot… It's sized to sit in the seat, then nudge it with the buttons.</small>
      <div class="av-actions"><button class="ghost sm" data-pet-pick>Upload model</button></div></div></div></div>`;
  }
  return `<div class="gsec"><h4>Front passenger <small>${k === 'dog' ? 'your dog' : k === 'cat' ? 'your cat' : k === 'model' ? 'your model' : 'empty seat'}</small></h4>${seg}${body}
    <p class="note">Friends in multiplayer see your passenger too. A friend riding in your front seat takes its place.</p></div>`;
}
const petFile = document.createElement('input'); petFile.type = 'file'; petFile.accept = '.glb,.gltf,.obj,.stl'; petFile.hidden = true; document.body.appendChild(petFile);
petFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!PART_EXTS.includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_PART_BYTES) { toast(`That model is ${fmtBytes(f.size)}. Passenger models can be up to ${fmtBytes(MAX_PART_BYTES)}, so try a lighter version.`, 4200); return; }
  toast('Loading your model…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf);
    const data = bufToB64(buf), h = hashStr(data), old = myPet.h;
    await idbSet('pet:' + h, data); if (old && old !== h) idbSet('pet:' + old, null);
    myPet = { ...myPet, kind: 'model', h, data, m: cleanPetM({ name: f.name.replace(/\.[^.]+$/, '') || 'Model', ext, size: f.size }) }; savePet(); petShare();
    Audio.chime(4); toast('Your passenger is in the front seat. Nudge it into place with the + / − buttons', 3600); renderGarage();
  } catch (err) { console.warn(err); toast('Could not read that model: ' + (err && err.message || err), 4500); }
});
function bindDriver(el) {
  el.querySelectorAll('[data-pet]').forEach(b => b.onclick = () => { myPet.kind = b.dataset.pet; savePet(); petShare(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-pet-cat]').forEach(b => b.onclick = () => { myPet.catCoat = b.dataset.petCat; savePet(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-pet-coat]').forEach(b => b.onclick = () => { myPet.coat = b.dataset.petCoat; savePet(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-pet-pick]').forEach(b => b.onclick = () => petFile.click());
  el.querySelectorAll('[data-pet-reset]').forEach(b => b.onclick = () => { Object.assign(myPet.m, { x: 0, y: 0, z: 0, s: 1, yaw: 0 }); savePet(); petShare(true); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-pet-del]').forEach(b => b.onclick = () => { if (myPet.h) idbSet('pet:' + myPet.h, null); myPet = { ...myPet, kind: 'dog', h: '', data: null, m: cleanPetM(null) }; savePet(); petShare(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-drv]').forEach(b => b.onclick = () => { const i = b.dataset.drv.indexOf(':'), k = b.dataset.drv.slice(0, i), v = b.dataset.drv.slice(i + 1); myDriver.look = cleanDriver({ ...myDriver.look, [k]: k === 'glasses' ? +v : v }); drvEdit = null; saveDriver(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-drv-on]').forEach(b => b.onclick = () => { myDriver.on = !myDriver.on; saveDriver(); Audio.click(); renderGarage(); });
  // face editor: sliders change a live copy (the preview follows it straight away); letting go saves it and updates your car
  const faceSet = (patch, commit) => { const base = drvEdit || myDriver.look, face = { ...(base.face || {}), ...patch }; for (const k in patch) if (patch[k] === null) delete face[k]; drvEdit = cleanDriver({ ...base, face }); if (commit) { myDriver.look = drvEdit; drvEdit = null; saveDriver(); } };
  el.querySelectorAll('[data-face]').forEach(inp => {
    const k = inp.dataset.face, toV = () => +inp.value / 100;
    inp.addEventListener('input', () => { drvZoom = true; faceSet({ [k]: toV() }, false); clearTimeout(drvEditT); drvEditT = setTimeout(() => faceSet({}, true), 700); });
    inp.addEventListener('change', () => { clearTimeout(drvEditT); faceSet({ [k]: toV() }, true); });
    inp.addEventListener('dblclick', () => { inp.value = 0; faceSet({ [k]: null }, true); });
  });
  el.querySelectorAll('[data-dface-tab]').forEach(b => b.onclick = () => { drvFaceTab = b.dataset.dfaceTab; drvZoom = true; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-eye]').forEach(b => b.onclick = () => { faceSet({ eye: b.dataset.dfaceEye }, true); drvZoom = true; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-lip]').forEach(b => b.onclick = () => { faceSet({ lip: b.dataset.dfaceLip }, true); drvZoom = true; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-zoom]').forEach(b => b.onclick = () => { drvZoom = !drvZoom; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-rand]').forEach(b => b.onclick = () => { myDriver.look = cleanDriver({ ...myDriver.look, face: randomFace(myDriver.look.b === 'f') }); drvEdit = null; drvZoom = true; saveDriver(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-reset]').forEach(b => b.onclick = () => { const face = { ...(myDriver.look.face || {}) }; for (const [gn, k] of FACE_SLIDERS) if (gn === drvFaceTab) delete face[k]; myDriver.look = cleanDriver({ ...myDriver.look, face }); drvEdit = null; saveDriver(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dface-resetall]').forEach(b => b.onclick = () => { myDriver.look = cleanDriver({ ...myDriver.look, face: {} }); drvEdit = null; saveDriver(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-drv-rand]').forEach(b => b.onclick = () => {
    const pick = a => a[Math.floor(Math.random() * a.length)], id = x => (Array.isArray(x) ? x[0] : x), f = Math.random() < 0.5;
    const hair = pick(f ? ['long', 'pony', 'bun', 'bob', 'curly', 'short'] : ['short', 'buzz', 'curly', 'bald', 'short', 'pony']);
    myDriver.look = cleanDriver({ b: f ? 'f' : 'm', skin: id(pick(SKINS)), hair, hc: pick(HAIR_COLORS.slice(0, 7)), beard: f ? 'none' : pick(['none', 'none', 'stubble', 'beard', 'mustache']), hat: pick(['none', 'none', 'none', 'cap', 'beanie']), glasses: Math.random() < 0.25 ? 1 : 0, top: pick(TOP_COLORS), pants: pick(PANTS_COLORS), style: myDriver.look.style, face: randomFace(f) });
    saveDriver(); Audio.click(); renderGarage();
  });
  // uploaded parts
  const part = () => myParts[drvSlot], pchanged = (meta = true) => { saveParts(); partShare(drvSlot, meta); };
  el.querySelectorAll('[data-dpart-slot]').forEach(b => b.onclick = () => { drvSlot = b.dataset.dpartSlot; drvDel = ''; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-pick]').forEach(b => b.onclick = () => { drvPick = drvSlot; drvFile.click(); });
  el.querySelectorAll('[data-dpart-on]').forEach(b => b.onclick = () => { const a = part(); if (!a) return; a.m.on = a.m.on ? 0 : 1; pchanged(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-hide]').forEach(b => b.onclick = () => { const a = part(); if (!a) return; a.m.hide = a.m.hide ? 0 : 1; pchanged(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-snap]').forEach(b => b.onclick = () => { const a = part(); if (!a) return; const m = a.m; if (b.dataset.dpartSnap === '180') m.yaw = m.yaw > 0 ? m.yaw - 180 : m.yaw + 180; else m.pitch = m.pitch === -90 ? 0 : -90; pchanged(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-fit]').forEach(b => b.onclick = () => { const a = part(); if (!a) return; a.m.fit = a.m.fit === 0 ? 1 : 0; Object.assign(a.m, { x: 0, y: 0, z: 0, s: 1, yaw: 0, pitch: 0, roll: 0 }); pchanged(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-reset]').forEach(b => b.onclick = () => { const a = part(); if (!a) return; Object.assign(a.m, { x: 0, y: 0, z: 0, s: 1, yaw: 0, pitch: 0, roll: 0 }); pchanged(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dpart-del]').forEach(b => b.onclick = () => {
    const id = drvSlot; if (drvDel !== id) { drvDel = id; setTimeout(() => { if (drvDel === id) { drvDel = ''; renderGarage(); } }, 4000); renderGarage(); return; }
    drvDel = ''; const h = myParts[id] && myParts[id].h; myParts[id] = null; saveParts(); partShare(id); if (h && !PART_SLOTS.some(([p]) => myParts[p] && myParts[p].h === h)) idbSet('drvp:' + h, null); Audio.click(); renderGarage();
  });
  el.querySelectorAll('[data-dseat-reset]').forEach(b => b.onclick = () => { if (drvSeatSel === 0) myDriver.seat = cleanSeat(null); else myDriver.pseat[drvSeatSel - 1] = cleanSeat(null); drvSeatShow = true; saveDriver(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dseat-pick]').forEach(b => b.onclick = () => { drvSeatSel = +b.dataset.dseatPick; drvSeatShow = true; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dseat-show]').forEach(b => b.onclick = () => { drvSeatShow = !drvSeatShow; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-dseat-swap]').forEach(b => b.onclick = () => {
    // right-hand drive: the driver crosses to the other side and every passenger seat mirrors across too
    const ex = cockpitFor(carBase()).eye[0], sx = Math.abs(ex) < 0.05 ? 0.4 : Math.abs(ex), back = rhd();
    myDriver.seat.x = back ? 0 : Math.round(-2 * ex * 100) / 100;
    const px = [2 * sx, -2 * sx, 2 * sx]; myDriver.pseat.forEach((p, i) => { p.x = back ? 0 : Math.round(px[i] * 100) / 100; });
    drvSeatShow = true; saveDriver(); Audio.click(); toast(back ? 'Seats back to left-hand drive' : 'Seats swapped: right-hand drive', 2200); renderGarage();
  });
  // + / − rows (press and hold keeps nudging; numbers update in place)
  el.querySelectorAll('[data-dadj]').forEach(b => {
    const [kind, f, d] = b.dataset.dadj.split(':'), rows = kind === 'c' ? PET_ROWS : kind === 'p' ? PART_ROWS : kind === 'q' ? PSEAT_ROWS : SEAT_ROWS, row = rows.find(r => r[0] === f); let t = 0, iv = 0;
    const step = () => {
      const obj = kind === 'c' ? myPet.m : kind === 'p' ? (part() && part().m) : kind === 'q' ? myDriver.pseat[drvSeatSel - 1] : myDriver.seat; if (!obj) return; if (kind !== 'p' && kind !== 'c') drvSeatShow = true;
      let v = obj[f] + (+d) * row[2]; if (row[3] === -180) v = ((v + 180) % 360 + 360) % 360 - 180; v = Math.round(Math.max(row[3], Math.min(row[4], v)) * 100) / 100; if (v === obj[f]) return; obj[f] = v;
      if (kind === 'c') { savePet(); petShare(true); } else if (kind === 'p') pchanged(); else saveDriver(true);
      $$(`[data-dval="${kind}:${f}"]`).forEach(e => { e.textContent = row[5](v); });
    };
    const stop = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); step(); stop(); t = setTimeout(() => { iv = setInterval(step, 70); }, 380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
  });
  driverPreview(el);
}
const drvFile = document.createElement('input'); drvFile.type = 'file'; drvFile.accept = '.glb,.gltf,.obj,.stl'; drvFile.hidden = true; document.body.appendChild(drvFile);
drvFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; const id = drvPick;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!PART_EXTS.includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_PART_BYTES) { toast(`That model is ${fmtBytes(f.size)}. Driver parts can be up to ${fmtBytes(MAX_PART_BYTES)}, so try a lighter version.`, 4200); return; }
  toast('Loading your model…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf);
    const data = bufToB64(buf), h = hashStr(data), old = myParts[id];
    const m = cleanPart({ ...(old ? old.m : {}), name: (f.name.replace(/\.[^.]+$/, '') || 'Model').slice(0, 24), ext, size: f.size, on: 1 });
    await idbSet('drvp:' + h, data); myParts[id] = { h, m, data }; saveParts(); partShare(id);
    if (old && old.h !== h && !PART_SLOTS.some(([p]) => myParts[p] && myParts[p].h === old.h)) idbSet('drvp:' + old.h, null);
    Audio.chime(4); toast('Your model is on your driver. Nudge it into place with the + / − buttons', 3600); renderGarage();
  } catch (err) { console.warn(err); toast(ext === 'gltf' ? 'Could not read that file. GLTF files need their textures embedded, so a single .glb usually works better.' : 'Could not read that model: ' + (err && err.message || err), 4500); }
});
// ---------- custom cockpit interiors (garage › Cockpit): colours, finishes, your own pictures and seat models ----------
const INT_KEY = 'osm.interior.v1', INT_COLORS = ['#ffffff', '#111215', '#2a2b30', '#55575e', '#9a9da5', '#e9e6df', '#c9b38c', '#7a4a2a', '#3b2218', '#8e1b1b', '#d6402f', '#e07a1f', '#e8c02a', '#2f8a4c', '#1f5f9e', '#3a2f8a', '#b04fa8', '#0e6b6b'];
const INT_TILES = [[0.25, 'Small'], [0.55, 'Medium'], [1.3, 'Large']];
let interior = (() => { try { const v = JSON.parse(localStorage.getItem(INT_KEY) || 'null'); if (v && typeof v === 'object') return v; } catch { } return {}; })();
const intPics = new Map(), intTex = new Map(); let intSeatTpl = null, intSlot = 'dash', intSeatData = null;
const intSlotV = k => interior[k] || (interior[k] = { f: 'car', c: '#ffffff', s: 0.55 });
function saveInterior() { try { localStorage.setItem(INT_KEY, JSON.stringify(interior)); } catch { } }
function intTexture(h) {
  if (intTex.has(h)) return intTex.get(h); const d = intPics.get(h); if (!d) return null;
  const t = new THREE.TextureLoader().load(d, () => { if (cockpit) dressCockpit(cockpit); }); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; intTex.set(h, t); return t;
}
function dressCockpit(ck) {
  const look = {}; for (const [k] of INT_SLOTS) { const v = interior[k]; if (!v) continue; look[k] = { ...v, tex: v.f === 'pic' && v.h ? intTexture(v.h) : null }; }
  applyInterior(ck, look);
  const sm = interior.seatModel; applySeatModel(ck, sm && sm.on !== false && intSeatTpl ? intSeatTpl : null, sm || {});
}
function interiorChanged() { saveInterior(); if (cockpit) try { dressCockpit(cockpit); } catch (e) { console.warn('[overpass] interior:', e); } renderGarage(); }
// load the stored pictures and seat model at start-up
(async () => {
  await null; // after the module has finished setting up
  try {
    for (const [k] of INT_SLOTS) { const v = interior[k]; if (v && v.h && !intPics.has(v.h)) { const d = await idbGet('intp:' + v.h); if (d) intPics.set(v.h, d); } }
    const sm = interior.seatModel; if (sm && sm.h) { const d = await idbGet('ints:' + sm.h); if (d) { intSeatData = d; intSeatTpl = await modelTemplate({ h: 'seat' + sm.h, ext: sm.ext, data: d }); } }
    if (cockpit) dressCockpit(cockpit);
  } catch (e) { console.warn('[overpass] interior load:', e); }
})();
function interiorHtml() {
  const v = intSlotV(intSlot), nat = INT_NATURAL.has(v.f);
  const tabs = `<div class="dseg">${INT_SLOTS.map(([k, n]) => `<button class="${k === intSlot ? 'on' : ''}" data-int-slot="${k}">${n}</button>`).join('')}</div>`;
  const fins = `<div class="int-fins">${INT_FINISHES.map(([id, n]) => `<button class="int-fin ${v.f === id ? 'on' : ''}" data-int-fin="${id}"><i style="${id === 'car' || id === 'plain' || id === 'pic' ? `background:${id === 'plain' ? v.c : id === 'pic' && v.h && intPics.get(v.h) ? `url(${intPics.get(v.h)}) center/cover` : 'repeating-linear-gradient(45deg,#2a2b30 0 6px,#34363c 6px 12px)'}` : `background:url(${finishThumb(id)}) center/cover`}">${id === 'pic' && !(v.h && intPics.get(v.h)) ? '+' : id === 'car' ? '↺' : ''}</i><span>${n}</span></button>`).join('')}</div>`;
  const cols = v.f === 'car' ? '' : `<h5 class="orn-h">Colour <small>${nat ? 'the first one (white) shows the pattern in its own colours; any other tints it' : 'tap one or pick any colour'}</small></h5><div class="swatches dsw">${INT_COLORS.map(c => `<button class="swatch ${c === v.c ? 'on' : ''}" data-int-col="${c}" aria-label="colour ${c}"><i style="background:${c}${c === '#ffffff' ? ';box-shadow:inset 0 0 0 1px #0003' : ''}"></i></button>`).join('')}<label class="swatch int-any" title="Any colour"><i style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"></i><input type="color" value="${v.c}" data-int-any></label></div>`;
  const size = v.f === 'car' || v.f === 'plain' ? '' : `<h5 class="orn-h">Pattern size</h5><div class="dseg">${INT_TILES.map(([t, n]) => `<button class="${Math.abs((v.s || 0.55) - t) < 0.01 ? 'on' : ''}" data-int-tile="${t}">${n}</button>`).join('')}</div>`;
  const pic = v.f === 'pic' ? `<div class="av-actions"><button class="ghost sm" data-int-pic>${v.h ? 'Change picture' : 'Upload picture'}</button></div><p class="note">Any photo or image works: it's wrapped round the ${INT_SLOTS.find(x => x[0] === intSlot)[1].toLowerCase()} as a repeating pattern. Make it bigger with Pattern size.</p>` : '';
  const sm = interior.seatModel;
  const seatCard = !sm ? `<div class="cl-card"><div class="ic">+</div><div class="tx"><b>Swap the seats for your own model</b><small>GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_PART_BYTES)}. It's sized to fit both front seats (cars with two seats).</small><div class="av-actions"><button class="ghost sm" data-int-seat>Upload seat model</button></div></div></div>`
    : `<div class="cl-card"><div class="ic">3D</div><div class="tx"><b>${escapeHtml(sm.name || 'Seat')}</b><small>${escapeHtml((sm.ext || '').toUpperCase())} · ${fmtBytes(sm.size || 0)}${intSeatTpl ? '' : ' · loading…'}</small>
      <div class="av-actions"><button class="ghost sm" data-int-seat-on>${sm.on === false ? 'Use it' : 'Use the built-in seats'}</button><button class="ghost sm" data-int-seat-rot>Turn 90°</button><button class="ghost sm" data-int-seat>Replace</button><button class="ghost sm" data-int-seat-del>Remove</button></div>
      <h5 class="orn-h">Fit</h5><div class="dseg"><button data-int-seat-adj="s:-0.08">Smaller</button><button data-int-seat-adj="s:0.08">Bigger</button><button data-int-seat-adj="y:-0.03">Lower</button><button data-int-seat-adj="y:0.03">Higher</button><button data-int-seat-adj="z:-0.03">Back</button><button data-int-seat-adj="z:0.03">Forward</button></div></div></div>`;
  return `<div class="gsec"><h4>Cockpit <small>what you see from the driver's seat (cockpit camera and VR) · used on every car</small></h4>${tabs}<h5 class="orn-h">Finish</h5>${fins}${cols}${size}${pic}
    <h5 class="orn-h">Seats</h5>${seatCard}<div class="av-actions" style="margin-top:10px"><button class="ghost sm" data-int-view>${S.cam === 3 ? 'Back to your camera' : 'Look inside (cockpit camera)'}</button><button class="ghost sm danger" data-int-reset>Reset the whole cockpit</button></div></div>`;
}
const intFile = document.createElement('input'); intFile.type = 'file'; intFile.accept = 'image/*'; intFile.hidden = true; document.body.appendChild(intFile);
intFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const d = await imageToSkin(f, 1024), h = hashStr(d), v = intSlotV(intSlot); await idbSet('intp:' + h, d); intPics.set(h, d); intTex.delete(h); v.h = h; v.f = 'pic'; v.c = '#ffffff'; Audio.chime(3); interiorChanged(); }
  catch (err) { toast('Could not read that picture: ' + (err && err.message || err), 3500); }
});
const intSeatFile = document.createElement('input'); intSeatFile.type = 'file'; intSeatFile.accept = '.glb,.gltf,.obj,.stl'; intSeatFile.hidden = true; document.body.appendChild(intSeatFile);
intSeatFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!PART_EXTS.includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_PART_BYTES) { toast(`That model is ${fmtBytes(f.size)}. Seat models can be up to ${fmtBytes(MAX_PART_BYTES)}.`, 4000); return; }
  toast('Loading your seat…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf); const data = bufToB64(buf), h = hashStr(data), old = interior.seatModel;
    await idbSet('ints:' + h, data); if (old && old.h && old.h !== h) idbSet('ints:' + old.h, null);
    interior.seatModel = { h, ext, name: (f.name.replace(/\.[^.]+$/, '') || 'Seat').slice(0, 24), size: f.size, rot: 0, s: 1, y: 0, z: 0, on: true };
    intSeatData = data; intSeatTpl = await modelTemplate({ h: 'seat' + h, ext, data }); Audio.chime(4); toast('Seats swapped. Turn or resize them below if they sit wrong', 3200); interiorChanged();
  } catch (err) { console.warn(err); toast('Could not read that model: ' + (err && err.message || err), 4000); }
});
function bindInterior(el) {
  el.querySelectorAll('[data-int-slot]').forEach(b => b.onclick = () => { intSlot = b.dataset.intSlot; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-int-fin]').forEach(b => b.onclick = () => {
    const v = intSlotV(intSlot), f = b.dataset.intFin; Audio.click();
    if (f === 'pic' && !v.h) { intFile.click(); return; }
    if (f !== v.f) { if (INT_NATURAL.has(f)) v.c = '#ffffff'; else if (v.c === '#ffffff' && f !== 'car') v.c = f === 'plain' ? '#2a2b30' : '#55575e'; }
    v.f = f; interiorChanged();
  });
  el.querySelectorAll('[data-int-col]').forEach(b => b.onclick = () => { intSlotV(intSlot).c = b.dataset.intCol; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-any]').forEach(i => { i.oninput = () => { intSlotV(intSlot).c = i.value; saveInterior(); if (cockpit) dressCockpit(cockpit); }; i.onchange = () => interiorChanged(); });
  el.querySelectorAll('[data-int-tile]').forEach(b => b.onclick = () => { intSlotV(intSlot).s = +b.dataset.intTile; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-pic]').forEach(b => b.onclick = () => intFile.click());
  el.querySelectorAll('[data-int-seat]').forEach(b => b.onclick = () => intSeatFile.click());
  el.querySelectorAll('[data-int-seat-on]').forEach(b => b.onclick = () => { const m = interior.seatModel; m.on = m.on === false; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-seat-rot]').forEach(b => b.onclick = () => { const m = interior.seatModel; m.rot = ((m.rot | 0) + 1) % 4; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-seat-adj]').forEach(b => b.onclick = () => { const m = interior.seatModel, [k, d] = b.dataset.intSeatAdj.split(':'); m[k] = Math.round(Math.max(k === 's' ? 0.3 : -0.4, Math.min(k === 's' ? 2.5 : 0.4, (m[k] ?? (k === 's' ? 1 : 0)) + +d)) * 100) / 100; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-seat-del]').forEach(b => b.onclick = () => { const m = interior.seatModel; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; return; } if (m && m.h) idbSet('ints:' + m.h, null); interior.seatModel = null; intSeatTpl = null; intSeatData = null; Audio.click(); interiorChanged(); });
  el.querySelectorAll('[data-int-view]').forEach(b => b.onclick = () => { if (S.cam === 3) S.cam = W.intPrevCam ?? 0; else { W.intPrevCam = S.cam; S.cam = 3; } Audio.click(); renderSettings(); renderGarage(); });
  el.querySelectorAll('[data-int-reset]').forEach(b => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to reset'; return; } const sm = interior.seatModel; interior = sm ? { seatModel: sm } : {}; Audio.click(); interiorChanged(); });
}
// ---------- the custom frame (car.js): its own car slot, built up with points ----------
const BUILD_KEY = 'osm.custom.v1';
let myBuild = (() => { try { return setCustomBuild(JSON.parse(localStorage.getItem(BUILD_KEY) || 'null')); } catch { return setCustomBuild(null); } })();
const saveBuild = () => { myBuild = setCustomBuild(myBuild); try { localStorage.setItem(BUILD_KEY, JSON.stringify(myBuild)); } catch { } };
const netModel = () => (S.model === 'custom' ? (myBuild.frame || 'coupe') : S.model) + (floatOn() ? '+f' : '') + (subOn() ? '+s' : ''); // friends see your custom car built on your frame size (and your floaties)
// ---------- submarine kit: dive under any water in World Drive ----------
const SUB_KEY = 'osm.sub.v1', SUB_COST = 9000;
// propulsion upgrades: each one faster (top speed), punchier (acceleration) and quicker up and down
const SUB_ENG = [
  { name: 'Single screw', top: 1, acc: 1, cost: 0, about: 'The stock propeller: a gentle 43 km/h.' },
  { name: 'Twin screws', top: 1.35, acc: 1.35, cost: 4000, about: 'Two counter-rotating props: about 58 km/h, and quicker off the mark.' },
  { name: 'Pump-jet', top: 1.75, acc: 1.8, cost: 9000, about: 'A shrouded water jet, like a real attack sub: about 75 km/h.' },
  { name: 'Hydro-turbine', top: 2.3, acc: 2.4, cost: 18000, about: 'A turbine and a sleek nose cone: about 100 km/h underwater. Mind the shore.' },
];
let mySub = (() => { try { const v = JSON.parse(localStorage.getItem(SUB_KEY) || 'null') || {}; return { own: !!v.own, on: v.on !== false, lvl: Math.max(0, Math.min(SUB_ENG.length - 1, v.lvl | 0)) }; } catch { return { own: false, on: true, lvl: 0 }; } })();
const subEng = () => SUB_ENG[mySub.lvl || 0] || SUB_ENG[0];
const saveSub = () => { try { localStorage.setItem(SUB_KEY, JSON.stringify(mySub)); } catch { } if (net.me) net.me.model = netModel(); };
function subOn() { return mySub.own && mySub.on; }
// the laser cutter: cuts holes in frozen water (from on top, or from underneath to break out)
const CUTTER_KEY = 'osm.cutter.v1', CUTTER_COST = 3500;
let myCutter = (() => { try { const v = JSON.parse(localStorage.getItem(CUTTER_KEY) || 'null') || {}; return { own: !!v.own }; } catch { return { own: false }; } })();
const saveCutter = () => { try { localStorage.setItem(CUTTER_KEY, JSON.stringify(myCutter)); } catch { } };
function cutterHtml() {
  return `<div class="gsec"><h4>Laser cutter <small>${myCutter.own ? 'fitted' : 'not fitted'}</small></h4>
    <p class="note">A laser pod on the roof for frozen lakes, rivers and seas. Stop on the ice and press dive (U, the dive button, or D-pad ↓): a turret pops up out of the pod, spins round and sweeps its laser round the car, burning a hole and you drop into the water. With the submarine kit you can dive under the ice, and when you want out, it burns a way up through the ice wherever you are, so you don't have to find your hole again. Without a float or the sub kit, the car sinks through the hole!</p>
    ${myCutter.own ? '' : `<div class="av-actions"><button class="ghost" data-cutter-buy>Fit the laser cutter · ${CUTTER_COST.toLocaleString()} pts</button></div><p class="note">You have ${(W.score | 0).toLocaleString()} points.</p>`}</div>`;
}
function subHtml() {
  const s = mySub;
  if (!s.own) return `<div class="gsec"><h4>Submarine <small>not fitted</small></h4>
    <p class="note">Turn your car into a submarine: yellow ballast pods, dive planes, a shrouded propeller and rudder, a periscope and twin floodlights. It floats too, so you can drive straight onto lakes, rivers and the sea, then dive and explore the bottom: seabeds that get deeper away from shore, kelp forests, seagrass, rocks and fish.</p>
    <div class="av-actions"><button class="ghost" data-sub-buy>Fit the submarine kit · ${SUB_COST.toLocaleString()} pts</button></div>
    <p class="note">You have ${(W.score | 0).toLocaleString()} points.</p></div>`;
  return `<div class="gsec"><h4>Submarine <small>${s.on ? 'fitted' : 'in storage'}</small></h4>
    <p class="note">${s.on ? 'Drive onto any water, then dive.' : 'The kit is in storage: your car is a car again.'}</p>
    <div class="av-actions"><button class="ghost" data-sub-on aria-pressed="${s.on}">${s.on ? 'Take the kit off' : 'Bolt the kit on'}</button></div>
    ${s.on ? subEngHtml() : ''}
    <p class="note"><b>Dive</b> with U or the dive touch button (the car splashing into the water) while you're on the water. Then the same up and down as flying (I and K, or ⇧ ⇩) take you deeper or back up, and you steer and use the gas as normal. Come all the way up and press dive again to surface. Your floodlights come on at depth, and the depth gauge shows how far down you are and where the bottom is.</p></div>`;
}
function subEngHtml() {
  const lv = mySub.lvl || 0;
  const rows = SUB_ENG.map((e, i) => `<div class="sub-eng${i === lv ? ' on' : ''}${i < lv ? ' had' : ''}"><div><b>${e.name}</b> <small>${i === 0 ? 'stock' : '+' + Math.round((e.top - 1) * 100) + '% speed'}</small><br><span class="note">${e.about}</span></div>${i <= lv ? `<span class="sub-tag">${i === lv ? 'Fitted' : '✓'}</span>` : i === lv + 1 ? `<button class="ghost sm" data-sub-eng="${i}">Fit · ${e.cost.toLocaleString()} pts</button>` : `<span class="sub-tag dim">${e.cost.toLocaleString()} pts</span>`}</div>`).join('');
  return `<h4 style="margin-top:12px">Propulsion <small>${SUB_ENG[lv].name}</small></h4>${rows}<p class="note">Each upgrade needs the one before it. You have ${(W.score | 0).toLocaleString()} points.</p>`;
}
function bindSub(el) {
  el.querySelectorAll('[data-sub-eng]').forEach(b => b.onclick = () => {
    const i = +b.dataset.subEng, e = SUB_ENG[i]; if (!e || i !== (mySub.lvl || 0) + 1) return;
    if (!(garage && garage.shop)) { toast('Propulsion upgrades are fitted inside your garage'); return; }
    if (W.score < e.cost) { toast(`The ${e.name} costs ${e.cost.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= e.cost; mySub.lvl = i; saveSub(); Audio.chime(6); hudMsg(`${e.name.toUpperCase()} FITTED · −${e.cost.toLocaleString()}`, 2000); renderGarage();
  });
  el.querySelectorAll('[data-sub-buy]').forEach(b => b.onclick = () => {
    if (!(garage && garage.shop)) { toast('The submarine kit is fitted inside your garage'); return; }
    if (W.score < SUB_COST) { toast(`The submarine kit costs ${SUB_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= SUB_COST; mySub = { own: true, on: true, lvl: mySub.lvl || 0 }; saveSub(); Audio.chime(6); hudMsg(`SUBMARINE FITTED · −${SUB_COST.toLocaleString()}`, 2000); renderGarage();
  });
  el.querySelectorAll('[data-cutter-buy]').forEach(b => b.onclick = () => {
    if (!(garage && garage.shop)) { toast('The laser cutter is fitted inside your garage'); return; }
    if (W.score < CUTTER_COST) { toast(`The laser cutter costs ${CUTTER_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= CUTTER_COST; myCutter.own = true; saveCutter(); Audio.chime(6); hudMsg(`LASER CUTTER FITTED · −${CUTTER_COST.toLocaleString()}`, 2000); renderGarage();
  });
  el.querySelectorAll('[data-sub-on]').forEach(b => b.onclick = () => { mySub.on = !mySub.on; saveSub(); if (!mySub.on) endDive(true); if (!waterOK()) W.onWater = false; Audio.click(); renderGarage(); });
}
// dive / surface
function onIceNow() { return !!world.frozen && !W.dive && !W.onWater && !player.fly && !player.air && !!world.water && world.water.inside(player.x, player.z) && !world.onRoad(player.x, player.z, 0.8); }
function toggleDive() {
  if (mode !== 'world' || paused || W.spawning) return;
  if (iceCut && iceCut.busy) return;
  if (onIceNow()) { cutIce(); return; }
  if (!subOn()) { toast('Fit the submarine kit first: Submarine tab in your garage workshop', 2600); return; }
  if (W.dive) { if (W.dive.depth < 1.2) { if (world.frozen && !world.inIceHole(player.x, player.z, 1.0)) breakOut(); else endDive(); } else { hudMsg('COME UP FIRST · hold ⇧ or I', 1300); } return; }
  if (!W.onWater || player.fly || player.air) { toast('Get onto the water to dive', 1800); return; }
  const surf = world.heightAt(player.x, player.z) - 0.25, dep = world.waterDepth(player.x, player.z);
  if (dep < 2.2) { toast('Too shallow to dive here: head further out', 2000); return; }
  W.dive = { depth: 0.2, vy: -1.4, sp: Math.max(0, player.speed * 0.6), surf, fizz: 2.4 }; Audio.splash && Audio.splash(); try { Audio.ping(0.8); } catch { }
  try { spray.bigSplash(player, surf, 0.6); camShake = Math.max(camShake, 0.18); } catch { }
  hudMsg('DIVE! DIVE!', 1300); W.pingT = 5;
}
// on the ice: burn a hole round the car
function cutIce() {
  if (!iceCut) return;
  if (!myCutter.own) { toast('The water is frozen solid. Fit the laser cutter (Submarine tab in your garage) to cut a hole in it', 3200); return; }
  if (Math.abs(player.speed || 0) > 3) { hudMsg('STOP ON THE ICE FIRST', 1200); return; }
  if (world.waterDepth(player.x, player.z) < 1.2) { toast('The ice is sitting on the bottom here: head further out', 2200); return; }
  iceCut.start(player.x, player.z, world.heightAt(player.x, player.z) - 0.25, false); hudMsg('LASER CUTTING THE ICE', 1800);
}
// under the ice: burn a way up, or (without a cutter) point back to a hole
function breakOut() {
  if (!myCutter.own || !iceCut) {
    let best = null, bd = 1e9; for (const h of world.iceHoles || []) { if (h.k < 1) continue; const d = Math.hypot(h.x - player.x, h.z - player.z); if (d < bd) { bd = d; best = h; } }
    hudMsg('SOLID ICE ABOVE', 1400); toast(best ? `You can't get through the ice here. Your hole is ${Math.round(bd)} m away (or fit the laser cutter to burn your way out).` : `You can't get through the ice here. Fit the laser cutter to burn your way out.`, 3600); return;
  }
  W.dive.vy = 0; iceCut.start(player.x, player.z, world.heightAt(player.x, player.z) - 0.25, true); hudMsg('LASERING THROUGH THE ICE', 1600);
}
function endDive(quiet) {
  if (!W.dive) return; W.dive = null; player.vy = 0; player.gvy = null; player.air = false;
  if (!quiet) { hudMsg('SURFACED', 1000); try { Audio.splash && Audio.splash(); } catch { } try { spray.bigSplash(player, world.heightAt(player.x, player.z) - 0.25, 0.45); } catch { } }
}
// the submarine moving: like driving, but slower and in 3D, held between the seabed and the surface; the shore is a wall
function subStep(dt) {
  const p = player, D = W.dive, inp = p.input, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const E = subEng(), top = (inp.boost ? 17 : 12) * E.top * (p.stats ? Math.min(1.25, p.stats.top) : 1);
  // drag scaled so each engine actually reaches its top speed
  let a = inp.throttle * 6 * E.acc - inp.brake * (D.sp > 0 ? 8 : 3) * Math.sqrt(E.acc); a -= D.sp * Math.abs(D.sp) * 0.035 * E.acc / (E.top * E.top) + Math.sign(D.sp) * 0.25;
  D.sp = Math.max(-4, Math.min(top, D.sp + a * dt)); if (Math.abs(D.sp) < 0.05 && !inp.throttle && !inp.brake) D.sp = 0;
  p.yaw += inp.steer * 1.05 * dt * Math.max(0.35, Math.min(1, Math.abs(D.sp) / 4 + 0.35)) * (D.sp >= 0 ? 1 : -1);
  // up / down
  const wantVy = pitchInput() * 3.4 * (1 + (E.top - 1) * 0.5); D.vy += (wantVy - D.vy) * Math.min(1, dt * 2.2);
  const nx = p.x + Math.sin(p.yaw) * D.sp * dt, nz = p.z + Math.cos(p.yaw) * D.sp * dt;
  const surf = world.heightAt(p.x, p.z) - 0.25, y = (p.y || surf) + D.vy * dt;
  // ahead: still water, and deep enough for the hull at this height?
  const nsurf = world.heightAt(nx, nz) - 0.25, nbed = world.terrainY(nx, nz), ok = world.water.inside(nx, nz) && nbed < Math.min(y, nsurf - 0.35) - 0.85;
  if (ok) { p.x = nx; p.z = nz; }
  else if (Math.abs(D.sp) > 0.5) { const hit = Math.abs(D.sp); D.sp *= -0.25; if (hit > 3) { Audio.thud(hit / 10); camShake = Math.min(0.4, hit * 0.04); crashDamage(hit * 0.4); } }
  const bed = world.terrainY(p.x, p.z), s2 = world.heightAt(p.x, p.z) - 0.25;
  p.y = Math.max(bed + 0.85, Math.min(s2 - 0.35, y)); if (p.y <= bed + 0.86 && D.vy < 0) D.vy = 0;
  D.depth = Math.max(0, s2 - p.y); D.bed = s2 - bed; D.surf = s2;
  // (speed is worked out from the velocity, so set that)
  p.vx = Math.sin(p.yaw) * D.sp; p.vz = Math.cos(p.yaw) * D.sp; p.air = false; p.slip = 0;
  // gentle pitch with climbing / diving, roll into turns, a slow hover sway
  const tb = performance.now() / 1000;
  p.pitch = (p.pitch || 0) + ((-D.vy * 0.09 + Math.sin(tb * 0.9) * 0.015) - (p.pitch || 0)) * Math.min(1, dt * 3);
  p.roll = (p.roll || 0) + ((-inp.steer * 0.14 * Math.min(1, Math.abs(D.sp) / 6) + Math.sin(tb * 1.1) * 0.01) - (p.roll || 0)) * Math.min(1, dt * 3);
  p.sync(dt);
  if ((W.pingT = (W.pingT || 0) - dt) <= 0) { W.pingT = 7 + Math.random() * 5; try { Audio.ping(0.6); } catch { } }
}
// what the camera sees: is it under the surface, and how deep
const _camUW = new THREE.Vector3();
function camUnder() {
  if (mode !== 'world' || vr.presenting) return 0;
  camera.getWorldPosition(_camUW); if (!world.water.inside(_camUW.x, _camUW.z)) return 0;
  const d = world.heightAt(_camUW.x, _camUW.z) - 0.25 - _camUW.y; return d > 0.05 ? d : 0;
}
let underwater = null; try { underwater = new Underwater(scene); } catch (e) { console.warn('[overpass] underwater effects off:', e); }
const iceCut = (() => { try { return new IceCutter(scene, world, {
  audio: Audio,
  bubble: (x, y, z) => { try { underwater && underwater.bubble(x, y, z, world.heightAt(x, z) - 0.3, 0.5); } catch { } },
  onOpen: h => {
    if (mode !== 'world') return; camShake = Math.max(camShake, 0.25);
    if (h.under) { if (W.dive) endDive(); hudMsg('BROKE THROUGH THE ICE!', 1600); }
    else { try { spray.bigSplash({ x: h.x, z: h.z, vx: 0, vz: 0 }, h.y, 0.45); } catch { } hudMsg(waterOK() ? 'HOLE CUT · DIVE IN!' : 'HOLE CUT · GLUG…', 1600); }
  },
}); } catch (e) { console.warn('[overpass] laser cutter off:', e); return null; } })();
// ---------- sea mines (mines.js): moored in the water, set off by a shot, a blast or a bump ----------
let seaMines = null; try { seaMines = new SeaMines(scene); seaMines.onBoom = (m, cause) => seaMineBoom(m, cause); } catch (e) { console.warn('[overpass] sea mines off:', e); }
let mineRefreshT = 0;
function seaMineStep(dt) {
  if (!seaMines) return;
  const active = mode === 'world' && !W.spawning && !!world.water && (!world.frozen || !!W.dive);
  mineRefreshT -= dt; const refresh = active && (mineRefreshT <= 0 || W.minesDirty); if (refresh) { mineRefreshT = 5; W.minesDirty = false; }
  const body = active && !ride?.riding && !player.fly ? { x: player.x, y: (player.y || 0) + 0.6, z: player.z } : null;
  seaMines.update(paused ? 0 : dt, { world, now: performance.now() / 1000, active, body: paused ? null : body, refresh });
}
function seaMineBoom(m, cause) {
  const surf = m.surf, deep = surf - m.y, P = new THREE.Vector3(m.x, m.y, m.z);
  blast(m.x, m.y, m.z, deep > 2 ? 4 : 6);
  try { wfx && wfx.boom(P, deep > 2 ? 5 : 7, deep > 2 ? '#9fdcff' : '#ff9a3c'); } catch { }
  // the water heaves up: a white plume where the blast breaks the surface
  if (deep < 18) { try { wfx && wfx.boom(new THREE.Vector3(m.x, surf + 1, m.z), Math.max(2.5, 7 - deep * 0.35), '#eaf6ff'); } catch { } try { Audio.splash && Audio.splash(); } catch { } }
  if (underwater && deep > 0.8) for (let i = 0; i < 40; i++) underwater.bubble(m.x + (Math.random() - 0.5) * 3, m.y + (Math.random() - 0.5) * 2, m.z + (Math.random() - 0.5) * 3, surf, 1.2);
  const d = Math.hypot(player.x - m.x, (player.y || 0) + 0.6 - m.y, player.z - m.z), R = 11;
  if (mode === 'world' && !ride?.riding && d < R) {
    const k = 1 - d / R; hurt(Math.round(10 + 45 * k)); camShake = Math.max(camShake, 0.2 + 0.6 * k); W.hitMark = 0;
    const nx = (player.x - m.x) / (d || 1), nz = (player.z - m.z) / (d || 1);
    if (W.dive) { W.dive.sp *= -0.3; W.dive.vy += 3 * k; } else { player.vx += nx * 9 * k; player.vz += nz * 9 * k; }
    try { if (vr.presenting) vr.pulse(1, 250); } catch { }
  }
  if (cause === 'shot') { W.score += 25; hudMsg('MINE DESTROYED · +25', 1100); } else if (cause === 'hit') hudMsg('YOU HIT A MINE!', 1400);
}
const _propW = new THREE.Vector3(), _uwL = new THREE.Color();
function underwaterStep(dt) {
  SEA_T.value = (SEA_T.value + dt) % 3600;
  try { setLaserPod(player.mesh, myCutter.own && mode === 'world'); iceCut && iceCut.usePod(player.mesh); } catch (e) { if (!W.podFail) { W.podFail = 1; console.warn('[overpass] laser pod:', e); } }
  try { setSubKit(player.mesh, subOn() && mode === 'world'); if (player.mesh.userData.subKit) animSubKit(player.mesh, dt, W.dive ? W.dive.sp : player.speed, W.dive ? W.dive.vy / 3.4 : 0, !!W.dive && W.dive.depth > 1.5); } catch (e) { if (!W.skFail) { W.skFail = 1; console.warn('[overpass] submarine kit:', e); } }
  if (!underwater) return;
  const cd = camUnder(), under = cd > 0;
  try {
    const pr = player.mesh.userData.subProp; if (pr) pr.getWorldPosition(_propW);
    let uwLat = 45; try { uwLat = world.unproj(player.x, player.z)[0]; } catch { }
    underwater.update(dt, { world, scene, camera, lat: uwLat, active: mode === 'world' && (!!W.dive || under), under, camDepth: cd, player, prop: pr ? _propW : null, diving: !!W.dive, speed: W.dive ? W.dive.sp : 0, light: _uwL.setScalar(Math.min(1.15, 0.3 + (hemi ? hemi.intensity : 1) * 0.6)), day: 1 - (W.nightK || 0) * 0.85 });
  } catch (e) { if (!W.uwFail) { W.uwFail = 1; console.warn('[overpass] underwater:', e); } }
  // the camera crossing the surface: a blue rush of bubbles going down, water draining off the lens coming up
  if (lens) { lens.enabled = !vr.presenting; if (under && !W.camWasUnder && mode === 'world') lens.plunge(); else if (!under && W.camWasUnder && mode === 'world') lens.surface(); }
  W.camWasUnder = under;
  // just dived: the car fizzes with a cloud of bubbles for a couple of seconds, and trails more when it moves fast
  if (W.dive && underwater) {
    const D = W.dive, top = world.heightAt(player.x, player.z) - 0.3, py = player.y || D.surf;
    if (D.fizz > 0) { D.fizz -= dt; const n = Math.min(14, Math.ceil(D.fizz * 60 * dt + 1)); for (let q = 0; q < n; q++) underwater.bubble(player.x + (Math.random() - 0.5) * 2.4, py + Math.random() * 1.4, player.z + (Math.random() - 0.5) * 3.6, top, 0.6); }
    if (Math.abs(D.sp) > 6 && Math.random() < dt * Math.abs(D.sp) * 0.6) { const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), s = Math.random() < 0.5 ? -1 : 1; underwater.bubble(player.x - fx * 1.8 + Math.cos(player.yaw) * s, py + 0.6, player.z - fz * 1.8 - Math.sin(player.yaw) * s, top, 0.4); }
  }
  // the sky, sun, moon, stars and clouds don't show through the murk
  sky.visible = !under; if (skyFx && skyFx.group) skyFx.group.visible = !under; if (clouds && clouds.group) clouds.group.visible = !under;
  try { Audio.underwater(under ? 1 : 0); } catch { }
  if (post) post.under += ((under ? 1 : 0) - post.under) * Math.min(1, dt * 4);
  W.camUnderD = cd;
}
// ---------- floaties: life-ring wheels that float your car on water ----------
const FLOAT_KEY = 'osm.floaties.v1', FLOAT_COST = 5000;
const FLOAT_ROWS = [['s', 'Size', 0.05, 0.5, 2, v => `${Math.round(v * 100)}%`], ['out', 'In · out', 0.02, -0.3, 0.6, v => `${Math.round(v * 100)} cm`], ['up', 'Down · up', 0.02, -0.3, 0.5, v => `${Math.round(v * 100)} cm`], ['spread', 'Closer · further apart', 0.05, -0.6, 1, v => `${Math.round(v * 100)} cm`]];
const cleanFloat = v => { v = v && typeof v === 'object' ? v : {}; const o = { own: !!v.own, on: v.on !== false, flat: !!v.flat }; for (const [k, , , a, b] of FLOAT_ROWS) { const d = k === 's' ? 1 : 0, x = +v[k]; o[k] = isFinite(x) ? Math.max(a, Math.min(b, x)) : d; } return o; };
let myFloat = (() => { try { return cleanFloat(JSON.parse(localStorage.getItem(FLOAT_KEY) || 'null')); } catch { return cleanFloat(null); } })();
const saveFloat = () => { try { localStorage.setItem(FLOAT_KEY, JSON.stringify(myFloat)); } catch { } if (net.me) net.me.model = netModel(); };
function floatOn() { return myFloat.own && myFloat.on; }
function waterOK() { return !!S.waterDrive || (floatOn() && !myFloat.flat && mode === 'world') || (subOn() && mode === 'world'); } // the cheat, or floaties fitted (and blown up)
// let the air out of the floaties (or pump them back up): deflated, they don't float, so on the water you sink
function setFloatFlat(flat, who) {
  if (!myFloat.own || !myFloat.on) { toast('Fit floaties first: Floaties tab in your garage workshop', 2600); return false; }
  myFloat.flat = !!flat; saveFloat(); try { Audio.air ? Audio.air(flat) : Audio.click(); } catch { }
  hudMsg((who ? 'PASSENGER · ' : '') + (flat ? 'FLOATIES DEFLATED' : 'FLOATIES INFLATED'), 1300);
  if (flat && W.onWater && !S.waterDrive) toast('Glug glug… you let the air out on the water', 2200);
  syncFloatUi(); return true;
}
function syncFloatUi() { const b = $('#tFloat'); if (!b) return; const sh = mode === 'world' && floatOn(); if (b.hidden === sh) b.hidden = !sh; b.classList.toggle('on', sh && !myFloat.flat); }
function floatHtml() {
  const f = myFloat;
  if (!f.own) return `<div class="gsec"><h4>Floaties <small>not fitted</small></h4>
    <p class="note">Swap your tyres for big red-and-white life rings that spin as you drive. They float: drive straight off the shore onto lakes, rivers and the sea, and cruise across the water (the water rings and boats are out there). Works on every car, including your own custom one.</p>
    <div class="av-actions"><button class="ghost" data-float-buy>Fit floaties · ${FLOAT_COST.toLocaleString()} pts</button></div>
    <p class="note">You have ${(W.score | 0).toLocaleString()} points.</p></div>`;
  return `<div class="gsec"><h4>Floaties <small>${f.on ? 'on' : 'off'}</small></h4>
    <p class="note">${f.on ? 'Your wheels are life rings and your car floats. Drive onto any water in World Drive.' : 'Floaties are in the trunk: normal wheels, and water sinks you again.'}</p>
    <div class="av-actions"><button class="ghost" data-float-on aria-pressed="${f.on}">${f.on ? 'Take them off' : 'Put them on'}</button>${f.on ? `<button class="ghost" data-float-flat>${f.flat ? 'Inflate them' : 'Deflate them'}</button>` : ''}</div>
    <p class="note">Deflate and reinflate any time with Y, the 🛟 touch button, or the FLOATS switch in the VR cockpit. Deflated floaties don't float.</p></div>
    <div class="gsec"><h4>Size &amp; position <small>hold + or − to keep going</small></h4>
    ${FLOAT_ROWS.map(([k, label, , , , fmt]) => `<div class="lt-row"><span>${label}</span><button data-fl-adj="${k}:-1" aria-label="${label} less">−</button><em data-fl-val="${k}">${fmt(f[k])}</em><button data-fl-adj="${k}:1" aria-label="${label} more">+</button></div>`).join('')}
    <div class="av-actions"><button class="ghost sm" data-fl-reset>Reset size &amp; position</button></div>
    <p class="note">Friends in multiplayer see your floaties at the normal size and spot.</p></div>`;
}
function bindFloat(el) {
  el.querySelectorAll('[data-float-buy]').forEach(b => b.onclick = () => {
    if (!(garage && garage.shop)) { toast('Floaties are fitted inside your garage'); return; }
    if (W.score < FLOAT_COST) { toast(`Floaties cost ${FLOAT_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= FLOAT_COST; myFloat = cleanFloat({ ...myFloat, own: true, on: true }); saveFloat(); Audio.chime(6); hudMsg(`FLOATIES FITTED · −${FLOAT_COST.toLocaleString()}`, 2000); renderGarage();
  });
  el.querySelectorAll('[data-float-flat]').forEach(b => b.onclick = () => { setFloatFlat(!myFloat.flat); renderGarage(); });
  el.querySelectorAll('[data-fl-reset]').forEach(b => b.onclick = () => { Object.assign(myFloat, { s: 1, out: 0, up: 0, spread: 0 }); saveFloat(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-fl-adj]').forEach(b => { // press and hold keeps nudging
    const [k, d] = b.dataset.flAdj.split(':'), row = FLOAT_ROWS.find(r => r[0] === k); let t = 0, iv = 0;
    const step = () => { const v = Math.round(Math.max(row[3], Math.min(row[4], myFloat[k] + (+d) * row[2])) * 100) / 100; if (v === myFloat[k]) return; myFloat[k] = v; saveFloat(); $$(`[data-fl-val="${k}"]`).forEach(e => { e.textContent = row[5](v); }); };
    const stop = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); step(); stop(); t = setTimeout(() => { iv = setInterval(step, 70); }, 380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
  });
  el.querySelectorAll('[data-float-on]').forEach(b => b.onclick = () => { myFloat.on = !myFloat.on; saveFloat(); if (!waterOK()) W.onWater = false; Audio.click(); renderGarage(); });
}
// cars you buy with points (the Veneno X-9): unlocked once, kept on this device
const UNLOCK_KEY = 'osm.unlocks.v1';
let unlocked = (() => { try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '{}') || {}; } catch { return {}; } })();
const carLocked = id => { const m = MODELS.find(x => x.id === id); return !!(m && m.unlock && !unlocked[id] && !S.unlockAll); };
function buyCar(id, btn) {
  const m = MODELS.find(x => x.id === id); if (!m) return;
  if (W.score < m.unlock) { toast(`The ${m.name} costs ${m.unlock.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3200); return; }
  if (btn && !btn.dataset.sure) { btn.dataset.sure = '1'; toast(`Tap the ${m.name} again to unlock it for ${m.unlock.toLocaleString()} points`, 2600); setTimeout(() => { if (btn.isConnected) delete btn.dataset.sure; }, 3500); return; }
  W.score -= m.unlock; unlocked[id] = true; try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked)); } catch { }
  Audio.chime(7); hudMsg(`${m.name.toUpperCase()} UNLOCKED · −${m.unlock.toLocaleString()}`, 2400); useModel(id); renderGarage();
}
function useModel(id, rebuild = false) {
  if (carLocked(id)) id = 'coupe';
  S.model = id; if (rebuild) player.model = ''; player.setModel(S.model); player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  if (net.me) net.me.model = netModel();
}
function frameHtml() {
  const b = myBuild, using = S.model === 'custom', inShop = !!(garage && garage.shop), pts = (W.score | 0).toLocaleString(), mx = MPG_MAX[b.power], mn = b.power === 'electric' ? 60 : 4;
  const pips = l => `<div class="npips">${Array.from({ length: CUSTOM_LEVELS }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>`;
  const ups = Object.entries(CUSTOM_UPGRADES).map(([k, u]) => { const l = b.lv[k], full = l >= CUSTOM_LEVELS;
    return `<div class="cl-card"><div class="ic">${{ speed: '⚙', accel: '⇪', grip: '◎' }[k]}</div><div class="tx"><b>${u.name} <small>level ${l} of ${CUSTOM_LEVELS}</small></b>${pips(l)}
      <small>+${Math.round(l * u.step * 100)}% ${u.unit}${full ? '' : ` · next +${Math.round((l + 1) * u.step * 100)}%`}</small>
      <div class="av-actions"><button class="ghost sm" data-cb-up="${k}" ${full ? 'disabled' : ''}>${full ? 'Fully upgraded' : `Upgrade · ${u.cost(l).toLocaleString()} pts`}</button></div></div></div>`; }).join('');
  const kits = Object.entries(CUSTOM_KITS).map(([k, u]) => `<div class="cl-card ${b.kits[k] ? 'on' : ''}"><div class="ic">${{ offroad: '⛰', range: '⛽', armor: '⛨' }[k]}</div><div class="tx"><b>${u.name}</b><small>${u.desc}</small>
      <div class="av-actions">${b.kits[k] ? '<button class="ghost sm" disabled>Fitted</button>' : `<button class="ghost sm" data-cb-kit="${k}">Buy · ${u.cost.toLocaleString()} pts</button>`}</div></div></div>`).join('');
  return `<div class="gsec"><h4>Custom frame <small>${using ? 'your car now' : 'not in use'}</small></h4>
    ${using ? '' : '<div class="av-actions"><button class="cta" data-cb-use>Drive the custom frame</button></div>'}
    <p class="note">A car slot of its own: pick its size, how it's powered and its mileage, then upgrade it with points. Your uploaded 3D model (Custom tab) is fitted to the frame size.</p>
    <h4>Frame size</h4><div class="seg">${FRAMES.map(([id, n]) => `<button data-cb-frame="${id}" class="${b.frame === id ? 'on' : ''}">${n}</button>`).join('')}</div>
    <h4>Power</h4><div class="seg"><button data-cb-power="gas" class="${b.power === 'gas' ? 'on' : ''}">Gas</button><button data-cb-power="electric" class="${b.power === 'electric' ? 'on' : ''}">Electric</button></div>
    <h4>Mileage <small data-cb-mpgl>${b.mpg} ${b.power === 'electric' ? 'MPGe' : 'mpg'}</small></h4>
    <input type="range" class="cb-mpg" data-cb-mpg min="${mn}" max="${mx}" step="1" value="${b.mpg}" aria-label="Mileage">
    <p class="note">Up to ${mx} ${b.power === 'electric' ? 'MPGe, the best electric car on sale (Lucid Air Pure)' : 'mpg, the best gas car on sale (Toyota Prius)'}. Higher mileage means a full ${b.power === 'electric' ? 'charge' : 'tank'} takes you further. Free to change any time.</p></div>
  <div class="gsec"><h4>Upgrades</h4><div class="custom-grid">${ups}</div></div>
  <div class="gsec"><h4>Kits</h4><div class="custom-grid">${kits}</div>
    <p class="note">You have ${pts} points. ${inShop ? 'Upgrades and kits fit straight away.' : 'Buy upgrades and kits inside your garage (World Drive).'}</p></div>`;
}
function bindFrame(el) {
  const buy = (cost, label, apply) => {
    if (!(garage && garage.shop)) { toast('Upgrades are fitted inside your garage'); return; }
    if (W.score < cost) { toast(`That costs ${cost.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); return; }
    W.score -= cost; apply(); saveBuild(); Audio.chime(5); hudMsg(`${label} · −${cost.toLocaleString()}`, 1800); renderGarage();
  };
  el.querySelectorAll('[data-cb-use]').forEach(b => b.onclick = () => { useModel('custom'); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-cb-frame]').forEach(b => b.onclick = () => { myBuild.frame = b.dataset.cbFrame; saveBuild(); if (S.model === 'custom') useModel('custom', true); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-cb-power]').forEach(b => b.onclick = () => { const p = b.dataset.cbPower; if (p === myBuild.power) return; myBuild.power = p; myBuild.mpg = p === 'electric' ? Math.max(100, myBuild.mpg) : Math.min(MPG_MAX.gas, myBuild.mpg); saveBuild(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-cb-mpg]').forEach(r => {
    r.addEventListener('keydown', e => e.stopPropagation());
    r.oninput = () => { myBuild.mpg = +r.value; saveBuild(); const l = el.querySelector('[data-cb-mpgl]'); if (l) l.textContent = `${myBuild.mpg} ${myBuild.power === 'electric' ? 'MPGe' : 'mpg'}`; };
    r.onchange = () => renderGarage();
  });
  el.querySelectorAll('[data-cb-up]').forEach(b => b.onclick = () => { const k = b.dataset.cbUp, u = CUSTOM_UPGRADES[k], l = myBuild.lv[k]; if (l >= CUSTOM_LEVELS) return; buy(u.cost(l), `${u.name.toUpperCase()} LEVEL ${l + 1}`, () => { myBuild.lv[k] = l + 1; }); });
  el.querySelectorAll('[data-cb-kit]').forEach(b => b.onclick = () => { const k = b.dataset.cbKit, u = CUSTOM_KITS[k]; if (myBuild.kits[k]) return; buy(u.cost, u.name.toUpperCase(), () => { myBuild.kits[k] = true; }); });
}
// ---------- car weapons (Blick's Shooting Goods) ----------
let arsenal = WPN.loadArsenal ? WPN.loadArsenal() : { own: [], cfg: { w: '', m: 'roof', dx: 0, dy: 0, dz: 0, s: 1 } };
const myWeapon = () => (WPN.weaponById && arsenal.cfg.w && arsenal.own.includes(arsenal.cfg.w)) ? WPN.weaponById(arsenal.cfg.w) : null;
function applyMyWeapon() { if (!myWeapon()) arsenal.cfg.w = ''; WPN.saveArsenal && WPN.saveArsenal(arsenal); try { net.setWeapon(arsenal.cfg.w ? arsenal.cfg : null); } catch { } const tf = $('#tFire'); if (tf) tf.hidden = !(myWeapon() && mode === 'world'); }
const wStats = w => `${w.pellets ? w.pellets + ' × ' : ''}${w.dmg} dmg${w.splash ? ' · blast' : ''} · ${w.cd < 0.2 ? 'rapid' : (1 / w.cd).toFixed(1) + '/s'}`;
function weaponHtml(store = false) {
  const list = WPN.WEAPONS || [], c = arsenal.cfg;
  const rows = list.map(w => { const own = arsenal.own.includes(w.id), on = c.w === w.id;
    return `<div class="cl-card wrow ${on ? 'on' : ''}"><div class="ic wic-${w.id}">${{ mg: '⋮⋮', shot: '∴', rocket: '➶', rail: '⟿', mine: '◉' }[w.id]}</div><div class="tx"><b>${w.name}</b><small>${w.desc} · ${wStats(w)}</small>
      <div class="av-actions">${own ? `<button class="${on ? 'cta' : 'ghost'} sm" data-wpn-eq="${w.id}">${on ? 'Equipped' : 'Equip'}</button>` : store ? `<button class="cta sm" data-wpn-buy="${w.id}">Buy · ${w.price.toLocaleString()}</button>` : `<small>Sold at Blick's · ${w.price.toLocaleString()} pts</small>`}</div></div></div>`; }).join('');
  const head = store ? `<div class="blk-head"><b>BLICK'S</b><span>SHOOTING GOODS</span></div><p class="note">You have <b>${(W.score | 0).toLocaleString()}</b> points. Weapons fire with <kbd>E</kbd> (or the 🎯 button) and hit other players in multiplayer. Set where it sits on your car in your garage.</p>` : '';
  const mount = !store && myWeapon() ? `<div class="gsec"><h4>Placement</h4><div class="seg">${(WPN.MOUNTS || []).map(([k, t]) => `<button data-wpn-mount="${k}" class="${c.m === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${[['dx', 'Left / right', 'Left', 'Right'], ['dy', 'Height', 'Down', 'Up'], ['dz', 'Back / front', 'Back', 'Front'], ['s', 'Size', 'Smaller', 'Bigger']].map(([k, lab, a, b]) => `<div class="lt-row"><span>${lab}</span><button class="ghost sm" data-wpn-n="${k}" data-v="-1">${a}</button><b>${k === 's' ? Math.round(c.s * 100) + '%' : (c[k] >= 0 ? '+' : '') + c[k].toFixed(1) + ' m'}</b><button class="ghost sm" data-wpn-n="${k}" data-v="1">${b}</button></div>`).join('')}
      <div class="av-actions"><button class="ghost sm" data-wpn-reset>Reset position</button><button class="ghost sm" data-wpn-eq="">Unequip</button></div><p class="note">Mine droppers always sit at the back. Other players see your weapon where you put it.</p></div>` : '';
  const none = !store && !arsenal.own.length ? `<p class="note">You don't own any weapons yet. Drive into a <b>Blick's Shooting Goods</b> store to buy some.</p>` : '';
  return head + none + `<div class="gsec">${store ? '' : '<h4>Your weapons</h4>'}${store || arsenal.own.length ? rows : ''}</div>` + mount;
}
function bindWeapon(el) {
  el.querySelectorAll('[data-wpn-buy]').forEach(b => b.onclick = () => {
    const w = WPN.weaponById(b.dataset.wpnBuy); if (!w || arsenal.own.includes(w.id)) return;
    if (W.score < w.price) { toast(`${w.name} costs ${w.price.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3000); Audio.beep && Audio.beep(false); return; }
    W.score -= w.price; arsenal.own.push(w.id); arsenal.cfg.w = w.id; applyMyWeapon(); Audio.chime(6); hudMsg(`${w.name.toUpperCase()} · −${w.price.toLocaleString()}`, 1800); renderBlicks(); renderGarage();
  });
  el.querySelectorAll('[data-wpn-eq]').forEach(b => b.onclick = () => { arsenal.cfg.w = b.dataset.wpnEq; applyMyWeapon(); Audio.click(); renderBlicks(); renderGarage(); });
  el.querySelectorAll('[data-wpn-mount]').forEach(b => b.onclick = () => { arsenal.cfg.m = b.dataset.wpnMount; applyMyWeapon(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wpn-n]').forEach(b => b.onclick = () => { const k = b.dataset.wpnN, v = +b.dataset.v; arsenal.cfg[k] = k === 's' ? Math.max(0.6, Math.min(1.6, arsenal.cfg.s + v * 0.1)) : Math.max(k === 'dy' ? -0.8 : k === 'dz' ? -2 : -1.5, Math.min(k === 'dy' ? 1.5 : k === 'dz' ? 2 : 1.5, Math.round((arsenal.cfg[k] + v * 0.1) * 10) / 10)); applyMyWeapon(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wpn-reset]').forEach(b => b.onclick = () => { Object.assign(arsenal.cfg, { dx: 0, dy: 0, dz: 0, s: 1 }); applyMyWeapon(); Audio.click(); renderGarage(); });
}
// the store panel that opens while you're parked in the drive lane of a Blick's
let blicksAt = null;
function renderBlicks() { const el = $('#blicks'); if (!el || el.hidden) return; el.querySelector('.blk-body').innerHTML = weaponHtml(true); bindWeapon(el); }
function openBlicks(p) {
  let el = $('#blicks');
  if (!el) {
    el = document.createElement('div'); el.id = 'blicks'; el.className = 'blicks'; el.innerHTML = '<div class="blk-win" role="dialog" aria-label="Blick\'s Shooting Goods"><button class="ghost sm blk-x" aria-label="Close">✕</button><div class="blk-body"></div></div>'; document.body.appendChild(el);
    el.querySelector('.blk-x').onclick = () => { el.hidden = true; blicksAt = '__closed:' + (blicksAt || ''); };
    el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('keydown', e => e.stopPropagation());
    const st = document.createElement('style'); st.textContent = `.blicks{position:fixed;inset:auto 0 0 0;z-index:40;display:flex;justify-content:center;pointer-events:none;padding:0 10px calc(10px + env(safe-area-inset-bottom))}
.blicks[hidden]{display:none}.blk-win{pointer-events:auto;position:relative;width:min(560px,100%);max-height:62vh;overflow:auto;background:rgba(18,19,22,.94);border:2px solid #ff5a1f;border-radius:16px;padding:14px 14px 10px;color:#eee;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.blk-x{position:absolute;right:10px;top:10px}.blk-head{display:flex;gap:10px;align-items:baseline;margin:0 0 4px}.blk-head b{font:900 26px/1 system-ui,sans-serif;letter-spacing:.02em}.blk-head span{font:800 14px/1 system-ui,sans-serif;color:#ff5a1f;letter-spacing:.12em}
.wrow .ic{display:grid;place-items:center;font:700 20px/1 system-ui;color:#ff5a1f;background:#26282d}.wrow.on{outline:2px solid #ff5a1f}.lt-row{display:flex;align-items:center;gap:8px;margin:6px 0}.lt-row span{flex:1;font-size:13px;opacity:.85}.lt-row b{min-width:62px;text-align:center;font-size:13px}`;
    document.head.appendChild(st);
  }
  el.hidden = false; renderBlicks();
}
function closeBlicks() { const el = $('#blicks'); if (el) el.hidden = true; blicksAt = null; }
function updateBlicks() {
  if (mode !== 'world' || W.spawning || paused) { if (blicksAt && !String(blicksAt).startsWith('__closed')) closeBlicks(); return; }
  let inside = null;
  for (const p of world.pois) { if (p.kind !== 'blicks' || !p.shop) continue; if (Math.abs(p.x - player.x) > 60 || Math.abs(p.z - player.z) > 60) continue;
    const dx = player.x - p.x, dz = player.z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, [sx, sz, sw, sd] = p.shop;
    if (Math.abs(lx - sx) < sw / 2 && Math.abs(lz - sz) < sd / 2) { inside = p; break; } }
  if (!inside) { if (blicksAt) closeBlicks(); return; }
  if (blicksAt === inside.key || blicksAt === '__closed:' + inside.key) return;
  if (Math.abs(player.speed) < 7) { blicksAt = inside.key; openBlicks(inside); Audio.chime(4); hudMsg("BLICK'S SHOOTING GOODS", 1400); }
}
// shooting: our shots go to everyone; our hits are added up and sent to the player we hit a few times a second
const wfx = WPN.WeaponFX ? new WPN.WeaponFX({
  scene, audio: Audio, groundAt: (x, z) => (W.dive ? world.terrainY(x, z) : world.heightAt(x, z)), solid: (x, y, z) => { try { return !!world.collide(x, z, 0.15, y); } catch { return false; } },
  targets: () => {
    const out = []; for (const [id, r] of W.remotes) { const pl = net.players.get(id); if (!pl || pl.rd) continue; out.push({ id, x: r.car.x, y: r.car.y || 0, z: r.car.z }); }
    if (mode === 'world' && planes) for (const t of planes.targets()) out.push(t);
    if (mode === 'world' && balloons) for (const t of balloons.targets()) out.push(t);
    if (mode === 'world') try { for (const t of boats.targets()) out.push(t); } catch { }
    if (mode === 'world') { for (const c of police.targets()) out.push({ id: '', npc: 'cop', ref: c, x: c.car.x, y: c.car.y || 0, z: c.car.z });
      for (const a of W.traffic) out.push({ id: '', npc: 'car', ref: a, x: a.car.x, y: a.car.y || 0, z: a.car.z });
      try { for (const p of pedestrians.people || []) out.push({ id: '', npc: 'ped', ref: p, x: p.x, y: (p.y || 0) - 0.1, z: p.z, r: 1.0 }); } catch { }
      try { if (deer) for (const t of deer.targets()) out.push(t); } catch { }
      try { if (seaMines) for (const t of seaMines.targets(player.x, player.z)) out.push(t); } catch { }
      try { if (birds) for (const t of birds.targets()) out.push(t); } catch { }
      try { if (squirrels) for (const t of squirrels.targets()) out.push(t); } catch { }
      try { if (seaLife) for (const t of seaLife.targets()) out.push(t); } catch { }
      try { if (fed) for (const t of fed.targets()) out.push(t); } catch { } }
    return out;
  },
  me: () => (mode === 'world' && !W.spawning && !ride?.riding ? { x: player.x, y: player.y || 0, z: player.z } : null),
  onHit: (id, dmg, w, t) => { if (t && t.npc === 'fed') { W.hitMark = 0.18; try { fed.hit(t.ref, dmg, t); } catch { } return; } if (t && t.npc === 'sea') { try { W.hitMark = 0.18; const r = seaLife.hit(t.ref, dmg); if (r) seaKill(r); } catch { } return; } if (t && t.npc === 'bird') { try { if (birds.shoot(t.ref)) { W.hitMark = 0.18; Audio.birdStrike && Audio.birdStrike(0.5); } } catch { } return; } if (t && t.npc === 'squirrel') { try { if (squirrels.shoot(t.ref)) { W.hitMark = 0.18; Audio.squish && Audio.squish(0.6); } } catch { } return; } if (t && t.npc === 'mine') { W.hitMark = 0.18; seaMines && seaMines.detonate(t.ref, 'shot', performance.now() / 1000); return; } if (t && t.npc === 'boat') { W.hitMark = 0.18; if (!t.ref.shotCrime) { t.ref.shotCrime = true; police.crime('shotCar'); } boats.hit(t.ref, dmg, w); return; } if (t && t.npc === 'balloon') { balloons && balloons.pop(t.ref, 'shot'); W.hitMark = 0.18; return; } if (t && t.npc === 'plane') { W.hitMark = 0.18; const pts = planes ? planes.hit(t.ref, dmg) : 0; if (pts) { W.score += pts; hudMsg(`${t.ref.desc.toUpperCase()} TAGGED · +${pts}`, 2600); Audio.chime(10); try { Audio.boom && Audio.boom(1.2, 0.5); } catch { } } return; } if (t && t.npc === 'cop') { police.hit(t.ref, dmg); W.hitMark = 0.18; return; } if (t && t.npc === 'car') return shootNpc(t.ref, dmg); if (t && t.npc === 'ped') { try { pedestrians.shoot && pedestrians.shoot(t.ref); } catch { } return; } if (t && t.npc === 'deer') { try { if (deer.shoot(t.ref, player.x, player.z)) W.hitMark = 0.18; } catch { } return; } if (!id) return; W.hitPend.set(id, (W.hitPend.get(id) || 0) + dmg); W.hitMark = 0.18; },
  ear: () => camera.getWorldPosition(_earP),
  onCopHit: (dmg) => copHurt(dmg),
}) : null;
const _earP = new THREE.Vector3();
W.hitPend = new Map(); W.hitT = 0;
// NPC traffic shot: it pulls over smoking like after a crash, and blows up when it runs out of health
function shootNpc(a, dmg) {
  if (!a || a.blown) return; npcHit(a, 3); a.hp = (a.hp ?? NPC_HP) - dmg;
  if (!a.shotCrime) { a.shotCrime = true; police.crime('shotCar'); }
  if (a.hp <= 0) { a.blown = true; police.crime('killCar'); blast(a.car.x, (a.car.y || 0) + 1, a.car.z, 4.5); try { wfx.boom(new THREE.Vector3(a.car.x, (a.car.y || 0) + 1, a.car.z), 4.5); } catch { } const i = W.traffic.indexOf(a); if (i >= 0) removeTraffic(i); W.score += 40; hudMsg('TRAFFIC DESTROYED · +40', 1100); camShake = Math.max(camShake, 0.25); }
}
// an explosion's sound, loud by how close it is to the camera, plus a shake when it's right next to you
function blast(x, y, z, size = 4) {
  const d = camera.getWorldPosition(_earP).distanceTo(_blastP.set(x, y, z)), k = Math.max(0, 1 - d / 500);
  try { Audio.boom && Audio.boom(size / 4, k * k); } catch { }
  const near = Math.hypot(player.x - x, player.z - z); if (near < 40) camShake = Math.max(camShake, 0.45 * (1 - near / 40));
}
const _blastP = new THREE.Vector3();
// ---------- police (police.js): five-star wanted level ----------
const _frus = new THREE.Frustum(), _frusM = new THREE.Matrix4(), _frusP = new THREE.Vector3(); let frusF = -1;
function camSees(x, y, z) {
  if (frusF !== W.frameNo) { frusF = W.frameNo; camera.updateMatrixWorld(); _frusM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frus.setFromProjectionMatrix(_frusM); }
  _frusP.set(x, y, z); return camera.position.distanceTo(_frusP) < 420 && _frus.containsPoint(_frusP);
}
const NOPOL = { crime() { }, targets: () => [], hit() { }, kill() { }, update() { }, clear() { }, reset() { }, stars: 0, cops: [], searching: false, bustK: 0 };
const police = (() => { try { return POL.Police ? new POL.Police({
  scene, world, wfx, audio: Audio, player: () => player,
  roadOk: s => trafficRoad(s), ready: (x, z) => tileReadyAt(x, z), seen: camSees,
  solid: (x, y, z) => { try { return !!world.collide(x, z, 0.15, y); } catch { return false; } },
  contact: (c, nx, nz, closing, cd) => { // a police car and you touched
    if (ride?.riding || W.wreck > 0) return;
    player.x += nx * (3.4 - cd); player.z += nz * (3.4 - cd);
    const hit = player.bump(nx, nz, 0.3);
    if (police.stars >= 2 && closing > 3) { player.vx += nx * closing * 0.35; player.vz += nz * closing * 0.35; } // they ram, you get shoved
    if (hit > 3) { Audio.thud(hit / 8); camShake = Math.max(camShake, Math.min(0.5, hit * 0.03)); if (vr.presenting) vr.pulse(Math.min(1, hit / 15), 120); }
    crashDamage(Math.max(0, closing), [0.5, 0.25, 0.8, 1.05, 1.25, 1.4][police.stars] ?? 1);
    const mine = -((player.vx || 0) * nx + (player.vz || 0) * nz); // how hard WE drove into THEM
    if (mine > 6 && (c.ramT || 0) < performance.now()) { c.ramT = performance.now() + 1200; police.crime('ramCop'); c.hp -= mine * 1.2; if (c.hp <= 0) police.kill(c); }
    player.sync(0);
  },
  boom: (x, y, z, size) => { blast(x, y, z, size); try { wfx.boom(new THREE.Vector3(x, y, z), size); } catch { } },
  smoke: (x, y, z, dark) => smokePuff(x, y, z, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, dark ? '#222' : '#777'),
  yieldTraffic: (x, z, dx, dz) => { for (const a of W.traffic) { const rx = a.car.x - x, rz = a.car.z - z, f = rx * dx + rz * dz; if (f > 2 && f < 45 && Math.abs(rx * dz - rz * dx) < 6 && !a.pull) a.yieldT = 3; } },
  onStars: (n, prev) => { hudMsg('WANTED ' + '★'.repeat(n), 1800); Audio.beep && Audio.beep(true); },
  busted: () => {
    const fine = S.policePenalty ? Math.min(W.score, 250) : 0; W.score -= fine; W.combo = 0;
    player.vx = player.vz = 0; hudMsg(fine ? `BUSTED · −${fine}` : 'BUSTED', 2600); Audio.beep && Audio.beep(false); camShake = 0.2;
    if (autoDrive) setAutoDrive(false, true);
  },
  evaded: n => { const b = 150 * n; W.score += b; hudMsg(`EVADED THE POLICE · +${b}`, 2400); Audio.chime(8); },
}) : NOPOL; } catch (e) { console.error('[overpass] police off:', e); return NOPOL; } })();
function copHurt(dmg) { // a police bullet or rocket hit us
  if (mode !== 'world' || W.spawning || W.wreck > 0 || ride?.riding || !(dmg > 0)) return;
  if (invincible()) { hurtFlash = Math.max(hurtFlash, 0.15); return; }
  player.hp = Math.max(0, (player.hp ?? HP_MAX) - dmg); hurtFlash = Math.max(hurtFlash, Math.min(0.9, dmg / 25)); camShake = Math.max(camShake, Math.min(0.4, dmg / 60));
  if (player.hp <= 0) wreckCar();
}
// wanted stars on the HUD
let wantedEl = null, wantedKey = '';
function updateWanted() {
  const on = mode === 'world' && !W.spawning, n = on ? police.stars : 0, srch = police.searching, bk = police.bustK, key = n + '|' + srch + '|' + (bk > 0 ? Math.round(bk * 20) : 0);
  if (key === wantedKey) return; wantedKey = key;
  if (!wantedEl) {
    wantedEl = document.createElement('div'); wantedEl.id = 'hWanted';
    const st = document.createElement('style'); st.textContent = `#hWanted{display:flex;flex-direction:column;align-items:flex-end;gap:4px;padding-top:4px;pointer-events:none}#hWanted[hidden]{display:none}#hWanted .stars{display:flex;gap:2px;font-size:1.55rem;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}#hWanted .stars i{font-style:normal;color:rgba(255,255,255,.18);-webkit-text-stroke:1px rgba(0,0,0,.35)}#hWanted .stars i.on{color:#ffd23f;-webkit-text-stroke:1px #6b4a00}#hWanted.srch .stars i.on{animation:wblink .7s steps(2) infinite}@keyframes wblink{50%{opacity:.25}}#hWanted .bust{font:800 .7rem/1 system-ui,sans-serif;letter-spacing:.08em;color:#fff;background:rgba(190,20,30,.85);padding:4px 8px;border-radius:8px;position:relative;overflow:hidden}#hWanted .bust b{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.35)}@media (max-width:700px){#hWanted .stars{font-size:1.15rem}}`;
    document.head.appendChild(st);
    const tr = document.querySelector('.hud-tr'); if (tr) tr.insertBefore(wantedEl, tr.firstChild); else document.body.appendChild(wantedEl);
  }
  wantedEl.hidden = !n; wantedEl.classList.toggle('srch', srch);
  wantedEl.innerHTML = n ? `<div class="stars" aria-label="Wanted level ${n} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</div>${bk > 0 ? `<div class="bust"><b style="width:${Math.round(bk * 100)}%"></b>PULL AWAY OR GET BUSTED</div>` : ''}` : '';
}
// ---------- gamepad (standard layout: Xbox / PlayStation / handhelds like the AYN Thor, Odin, Retroid, Steam Deck…) ----------
// driving: left stick steer · RT gas · LT brake · A nitrous · B handbrake · X fire · Y camera (hold: headlights) · Start pause · View map
//          LB barrel roll · RB front flip · L3 jump · R3 two-wheeler · D-pad ↑ horn / Store 32 · ↓ dive · ← reset car · → flight
//          right stick (flying) pitch. Controllers Chrome doesn't recognise get a one-time set-up wizard (gamepad.js).
// menus:   D-pad or left stick move between buttons · A press · B back · LB / RB switch tabs · Start resume
const pad = new Pad();
const padKey = code => { try { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); } catch { } };
addEventListener('gamepadconnected', e => { try { pad.pick(true); } catch { } const id = String(e.gamepad && e.gamepad.id || 'Gamepad').replace(/\(.*?\)/g, '').trim().slice(0, 36); toast(`🎮 ${id || 'Gamepad'} connected`, 2200); W.padUsed = true; document.body.classList.add('pad'); });
addEventListener('gamepaddisconnected', () => { toast('🎮 Gamepad disconnected', 1800); });
// a finger on the screen brings the touch controls back
addEventListener('touchstart', () => { if (document.body.classList.contains('pad')) document.body.classList.remove('pad'); }, { passive: true });
function uiActive() { return mode === 'menu' || paused || (s32 && s32.open) || !!(garage && garage.shop); }
// ---- moving around menus with the D-pad: jump to the nearest button in that direction ----
function padTargets() {
  const out = [], vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), summary')) {
    if (el.disabled || (el.tagName === 'A' && el.target === '_blank') || el.closest('[hidden]') || el.type === 'file' || el.type === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(cx, cy);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    out.push({ el, x: cx, y: cy });
  }
  return out;
}
function padFocus(el) { if (!el) return; document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus')); el.classList.add('pad-focus'); try { el.focus({ preventScroll: true }); } catch { } try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { } }
function padMove(dx, dy) {
  const t = padTargets(); if (!t.length) return;
  const cur = document.querySelector('.pad-focus'), c = cur && t.find(o => o.el === cur);
  if (!c) { t.sort((a, b) => a.y - b.y || a.x - b.x); padFocus(t[0].el); return; }
  // a slider: left / right changes its value
  if (c.el.type === 'range' && dx) { const step = +c.el.step || ((+c.el.max - +c.el.min) / 20) || 1; c.el.value = String(+c.el.value + dx * step); c.el.dispatchEvent(new Event('input', { bubbles: true })); c.el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  let best = null, bs = Infinity;
  for (const o of t) {
    if (o.el === c.el) continue; const vx = o.x - c.x, vy = o.y - c.y, along = vx * dx + vy * dy; if (along < 4) continue;
    const perp = Math.abs(vx * dy - vy * dx), sc = along + perp * 2.2; if (sc < bs) { bs = sc; best = o; }
  }
  if (best) { padFocus(best.el); try { Audio.click(); } catch { } }
  else { const sc = cur && cur.closest('.screen, .gbody, .s32-box, .pause, [data-screen]'); if (sc) sc.scrollBy({ top: dy * 120, behavior: 'smooth' }); }
}
function padBack() {
  if (s32 && s32.open) { const b = document.querySelector('.s32 [data-s32-close], .s32 [data-s32-later], .s32 [data-s32-done]:not([hidden])'); if (b) { b.click(); return; } s32.close(); return; }
  if (garage && garage.shop) { padKey('Escape'); return; }
  if (paused) { resume(); return; }
  const scr = document.querySelector('[data-screen]:not([hidden])'), back = scr && scr.querySelector('.back, [data-go="menu"]'); if (back) back.click();
}
function padTab(dir) {
  const tabs = [...document.querySelectorAll('[role="tab"], .tabs button, [data-tab], [data-ws-tab], [data-ptab]')].filter(b => !b.closest('[hidden]') && b.getBoundingClientRect().width > 0);
  if (!tabs.length) return; let i = tabs.findIndex(b => b.classList.contains('on') || b.getAttribute('aria-selected') === 'true'); i = (i + dir + tabs.length) % tabs.length; tabs[i].click(); try { Audio.click(); } catch { }
}
function readPad() {
  W.padFire = false; W.padPitch = 0;
  if (!pad.poll()) { if (!pad.gp) padGuide(false); return; }
  const P = pad, inp = player.input, sx = P.val('lx'), sy = P.val('ly'), ry = P.val('ry'), lt = P.val('lt'), rt = P.val('rt');
  if (!W.padAsked && P.needsSetup) { W.padAsked = true; padSetupPrompt(); }
  // menus
  if (uiActive()) {
    padGuide(false);
    const now = performance.now(), dirX = P.down('right') || sx > 0.6 ? 1 : P.down('left') || sx < -0.6 ? -1 : 0, dirY = P.down('down') || sy > 0.6 ? 1 : P.down('up') || sy < -0.6 ? -1 : 0, key = dirX + ',' + dirY;
    if (key !== '0,0') { if (W.padNavKey !== key) { W.padNavKey = key; W.padNavT = now + 380; padMove(dirX, dirY); } else if (now > W.padNavT) { W.padNavT = now + 140; padMove(dirX, dirY); } } else W.padNavKey = '';
    if (P.edge('a')) { const f = document.querySelector('.pad-focus'); if (f && !f.closest('[hidden]')) { f.click(); if (f.tagName === 'INPUT' && f.type !== 'checkbox' && f.type !== 'range') try { f.focus(); } catch { } } else padMove(0, 1); }
    if (P.edge('b')) padBack();
    if (P.edge('lb')) padTab(-1); if (P.edge('rb')) padTab(1);
    if (P.edge('start') && (mode === 'world' || mode === 'story') && paused) resume();
    W.padYT = 0; W.padBackT = 0;
    return;
  }
  document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus'));
  const play = (mode === 'world' || mode === 'story') && !paused, free = mode === 'world' && !paused, now = performance.now();
  if (Math.abs(sx) > 0.12) inp.steer = -Math.sign(sx) * Math.min(1, (Math.abs(sx) - 0.12) / 0.88);
  if (rt > 0.05) inp.throttle = Math.max(inp.throttle, rt);
  if (lt > 0.05) inp.brake = Math.max(inp.brake, lt);
  if (P.down('a')) inp.boost = true; if (P.down('b')) inp.handbrake = true;
  W.padFire = P.down('x'); if (Math.abs(ry) > 0.15) W.padPitch = ry;
  // Y: tap = camera, hold = headlights
  if (P.edge('y')) W.padYT = now;
  if (W.padYT && P.down('y') && now - W.padYT > 550) { W.padYT = 0; padKey('KeyL'); }
  if (P.up('y') && W.padYT) { W.padYT = 0; if (play) { S.cam = (S.cam + 1) % 4; hudMsg(['CHASE CAM', 'FAR CAM', 'HOOD CAM', 'COCKPIT CAM'][S.cam], 900); } }
  // stunts on the bumpers and stick clicks
  if (P.edge('lb') && free) doRoll(); if (P.edge('rb') && free) { if (P.val('ly') > 0.55) doBackFlip(); else doFlip(); }
  if (P.edge('l3') && free) doJump(); if (P.edge('r3') && free) doSide();
  // D-pad
  if (P.edge('up')) { if (free && _s32b && !_s32b.hidden) openStore32(); else padKey('KeyO'); }
  if (P.edge('down')) padKey('KeyU'); if (P.edge('left') && play) resetCar(); if (P.edge('right')) padKey('KeyT');
  if (P.edge('start') && (mode === 'world' || mode === 'story')) openPause();
  // View/Select: tap = map, hold = show / hide the button guide
  if (P.edge('back')) W.padBackT = now;
  if (W.padBackT && P.down('back') && now - W.padBackT > 550) { W.padBackT = 0; padGuideOn = !padGuideOn; try { localStorage.setItem('osm.pad.guide', padGuideOn ? '1' : '0'); } catch { } hudMsg(padGuideOn ? 'BUTTON GUIDE ON' : 'BUTTON GUIDE OFF', 900); }
  if (P.up('back') && W.padBackT) { W.padBackT = 0; if (mode === 'world' || mode === 'story') openPause('map'); }
  if (P.any() || rt > 0.3 || lt > 0.3) { W.padUsed = true; if (!document.body.classList.contains('pad')) document.body.classList.add('pad'); }
  padGuide(play && document.body.classList.contains('pad'));
}
// ---- on-screen button guide (shown while you're playing with a gamepad) ----
let padGuideOn = (() => { try { return localStorage.getItem('osm.pad.guide') !== '0'; } catch { return true; } })(), padGuideEl = null, padHintEl = null, padGuideKey = '';
function padGuide(show) {
  if (!padGuideEl) {
    padGuideEl = document.createElement('div'); padGuideEl.className = 'padguide'; padGuideEl.hidden = true; document.body.appendChild(padGuideEl);
    padHintEl = document.createElement('div'); padHintEl.className = 'padhint'; padHintEl.hidden = true; document.body.appendChild(padHintEl);
  }
  const on = !!show && padGuideOn;
  const row = (g, t, dim) => `<div class="pr${dim ? ' dim' : ''}">${g}<span>${t}</span></div>`;
  const own = k => !!myStunt[k], fly = flyOn(), wet = !!W.onWater || !!W.dive;
  const key = [on, own('roll'), own('flip'), own('bflip'), own('jump'), own('side'), fly, wet, !!W.dive, subOn(), onIceNow(), !!world.frozen].join();
  if (on && key !== padGuideKey) {
    padGuideKey = key;
    padGuideEl.innerHTML = row(glyph('rt'), 'Gas') + row(glyph('lt'), 'Brake') + row(glyph('lx'), 'Steer') + row(glyph('a'), 'Nitro') + row(glyph('b'), 'Drift') +
      row(glyph('x'), 'Fire') + row(glyph('y'), 'Camera · hold: lights') + row(glyph('lb'), 'Barrel roll', !own('roll')) + row(glyph('rb'), 'Front flip', !own('flip')) + row(glyph('ly') + glyph('rb'), 'Back flip (stick back)', !own('bflip')) +
      row(glyph('l3'), 'Jump', !own('jump')) + row(glyph('r3'), 'Two-wheeler', !own('side')) + (fly || W.dive ? row(glyph('ry'), W.dive ? 'Rise · sink' : 'Nose up · down') : '') +
      row(glyph('up'), 'Horn') + row(glyph('down'), W.dive ? (world.frozen ? 'Surface / burn through' : 'Surface (near the top)') : onIceNow() ? 'Cut the ice' : 'Dive', onIceNow() ? !myCutter.own : (!wet || !subOn())) + row(glyph('left'), 'Reset car') + row(glyph('right'), fly ? 'Land' : 'Fly') +
      row(glyph('start'), 'Pause') + row(glyph('back'), 'Map · hold: hide guide');
  }
  if (padGuideEl.hidden === on) padGuideEl.hidden = !on;
  // contextual prompt in the middle of the screen
  let hint = '';
  if (show) {
    if (mode === 'world' && _s32b && !_s32b.hidden) hint = glyph('up', 30) + '<span>Store 32 scratch-offs</span>';
    else if (mode === 'world' && myCutter.own && onIceNow() && !(iceCut && iceCut.busy) && Math.abs(player.speed || 0) < 3) hint = glyph('down', 30) + '<span>Cut a hole in the ice</span>';
    else if (mode === 'world' && W.onWater && !W.dive && !player.air && subOn()) hint = glyph('down', 30) + '<span>Dive</span>';
    else if (W.dive && world.frozen && W.dive.depth < 1.2 && !world.inIceHole(player.x, player.z, 1.0)) hint = glyph('down', 30) + (myCutter.own ? '<span>Burn through the ice</span>' : '<span>Solid ice · find your hole</span>');
    else if (W.dive) hint = glyph('ry', 30) + '<span>Rise · sink</span>';
  }
  if (padHintEl.dataset.h !== hint) { padHintEl.dataset.h = hint; padHintEl.innerHTML = hint; }
  if (padHintEl.hidden === !!hint) padHintEl.hidden = !hint;
}
function padSetupPrompt() {
  const go = () => { if ((mode === 'world' || mode === 'story') && !paused) openPause(); pad.startWizard(ok => toast(ok ? '🎮 Controller saved' : '🎮 Using the automatic layout (Settings › Set up controller to try again)', 2600)); };
  toast('🎮 This controller needs a quick set-up so the triggers and buttons line up', 2600); setTimeout(go, 400);
}
// VR: smack the big red button on the console with either hand
const _fbP = new THREE.Vector3(), _fbH = new THREE.Vector3();
function vrButton(k) {
  if (!k || !k.fireBtn || !k.fireBtn.visible || !vr.presenting) { if (k && k.fireBtn) k.fireBtn.userData.cap.position.y = k.fireBtn.userData.capY; return false; }
  const cap = k.fireBtn.userData.cap; cap.position.y = k.fireBtn.userData.capY; cap.getWorldPosition(_fbP); let hit = false;
  for (const h of vr.hands || []) { if (!h.src) continue; h.grip.getWorldPosition(_fbH); let d = _fbH.distanceTo(_fbP); vr.poke(h, _fbH); d = Math.min(d, _fbH.distanceTo(_fbP) + 0.02); if (d < 0.1) hit = true; } // the palm or a fingertip
  cap.position.y = k.fireBtn.userData.capY - (hit ? 0.022 : 0);
  if (hit && !k.fbWas) { try { vr.pulse(0.8, 60); } catch { } Audio.click && Audio.click(); } k.fbWas = hit; return hit;
}
// VR: flick the cockpit toggle switches with either hand (FLIGHT, LIGHTS, AUTO, BOOST 2). Passengers' flicks go to the driver.
const _swP = new THREE.Vector3(), _swH = new THREE.Vector3(), _swT = new THREE.Vector3();
function swFlash(id) { W.swFlash = W.swFlash || {}; W.swFlash[id] = 0.75; Audio.beep && Audio.beep(false); try { vr.pulse(0.3, 40); } catch { } }
function driverSwitch(id, from) {
  const who = from ? 'PASSENGER · ' : '';
  if (id === 'flight') { if (!setFlight(!flyOn(), 'vr')) { swFlash('flight'); return false; } if (from) hudMsg(who + (flyOn() ? 'FLIGHT MODE ON' : 'FLIGHT MODE OFF'), 1400); return true; }
  if (id === 'lights') { S.headlights = S.headlights === 'off' ? 'on' : 'off'; Audio.click(); hudMsg(who + 'HEADLIGHTS ' + S.headlights.toUpperCase(), 1100); return true; }
  if (id === 'auto') { if (autoDrive) { setAutoDrive(false, true); return true; } if (!setAutoDrive(true, true)) { swFlash('auto'); hudMsg('SET A GPS DESTINATION FIRST', 1400); return false; } return true; }
  if (id === 'roll') return doRoll(from) || (swFlash('roll'), false);
  if (id === 'flip') return doFlip(from) || (swFlash('flip'), false);
  if (id === 'bflip') return doBackFlip(from) || (swFlash('bflip'), false);
  if (id === 'target') return lockNearest(from) || (swFlash('target'), false);
  if (id === 'side') return doSide(from) || (swFlash('side'), false);
  if (id === 'jump') return doJump(from) || (swFlash('jump'), false);
  if (id === 'wings') return toggleWingsOut(from) || (swFlash('wings'), false);
  if (id === 'float') return setFloatFlat(!myFloat.flat, from) || (swFlash('float'), false);
  if (id === 'boost2') { if (!myNitro.b2.own) { swFlash('boost2'); toast('Fit the second booster in your garage (Nitro tab) first', 2600); return false; } myNitro.b2.on = !myNitro.b2.on; saveNitro(); Audio.click(); hudMsg(myNitro.b2.on ? 'SECOND BOOSTER ON' : 'SECOND BOOSTER OFF', 1100); return true; }
  return false;
}
// VR flight stick: shown in place of the gear lever when the car can fly. Squeeze the grip on it, then pull back to climb, push forward to dive
const _stH = new THREE.Vector3(), _stP = new THREE.Vector3();
const engineKind = m => ({ bike: 'small', apex: 'small', vortex: 'race', veneno: 'race', buggy: 'small', pickup: 'big', van: 'big', monster: 'big', trail: 'big', hyper: 'race', formula: 'race' })[m] || 'normal';
function stickStep(k, pax, dt) {
  const st = k.stick; if (!st) return;
  const show = mode === 'world' && (pax ? !!W.paxSw.flight : canFly());
  st.root.visible = show; if (k.shifter) k.shifter.visible = !show;
  let held = null;
  if (show && vr.presenting && !paused) for (const h of vr.hands || []) {
    if (!h.src) { h.stick = false; continue; }
    const sq = vr.squeezing(h); vr.palmPos ? vr.palmPos(h, _stH) : h.grip.getWorldPosition(_stH);
    if (sq && !h.stick && !h.grabbed && !h.phone) { st.top.getWorldPosition(_stP); if (_stH.distanceTo(_stP) < 0.14) { h.stick = true; try { vr.pulse(0.4, 30, h.src.handedness); } catch { } } }
    if (!sq) h.stick = false;
    if (h.stick) held = h;
  }
  if (held) { // hand position in the stick's own frame: forward of the pivot = pushed, behind = pulled
    vr.palmPos ? vr.palmPos(held, _stH) : held.grip.getWorldPosition(_stH); st.root.worldToLocal(_stH);
    const ang = Math.atan2(_stH.z, Math.max(0.06, _stH.y));
    st.tilt = Math.max(-0.42, Math.min(0.42, ang)); W.vrStick = -st.tilt / 0.42; W.vrStickT = 0.15;
  } else { st.tilt *= Math.exp(-dt * 8); if (W.vrStickT > 0) W.vrStickT -= dt; else W.vrStick = 0; } // springs back to the middle
  st.pivot.rotation.x = st.tilt;
}
function switchStep(dt) {
  if (W.swFlash) for (const k in W.swFlash) W.swFlash[k] -= dt;
  const pax = !!ride?.riding, k = pax ? ride.ck : cockpit; if (!k || !k.switches) return;
  W.paxSw = W.paxSw || {};
  const PAX = ['flight', 'lights', 'wings', 'float', 'roll', 'flip', 'bflip', 'side', 'jump', 'target'];
  const st = pax ? { flight: W.paxSw.flight ? 1 : 0, lights: W.paxSw.lights ? 1 : 0, wings: W.paxSw.wings ? 1 : 0, float: W.paxSw.float ? 1 : 0 } : {};
  if (vr.presenting && (mode === 'world' || mode === 'story') && !paused) {
    for (const h of vr.hands || []) {
      if (!h.src) continue; h.grip.getWorldPosition(_swH); vr.poke(h, _swT); let best = null, bd = 0.065;
      for (const s of k.switches) { s.tip.getWorldPosition(_swP); const d = Math.min(_swH.distanceTo(_swP), _swT.distanceTo(_swP) * 1.25); if (d < bd) { bd = d; best = s; } } // palm, or (more precisely) a fingertip
      const was = h.swNear; h.swNear = best;
      if (!best || best === was || (best.cool || 0) > performance.now()) continue;
      best.cool = performance.now() + 450; best.press = 0.25; try { vr.pulse(0.5, 30); } catch { } try { Audio.flick ? Audio.flick(!!best.push) : Audio.click(); } catch { }
      if (pax) {
        if (PAX.includes(best.id)) { W.paxSw[best.id] = !W.paxSw[best.id]; st[best.id] = W.paxSw[best.id] ? 1 : 0; try { net.sendTo(ride.riding.id, { k: 'psw', w: best.id }); } catch { } }
        else { swFlash(best.id); hudMsg('ONLY THE DRIVER CAN FLICK THAT', 1200); }
      } else if (mode === 'world' || best.id === 'lights') { driverSwitch(best.id); }
      else swFlash(best.id);
    }
  }
  if (!pax) { st.flight = flyOn() ? 1 : 0; st.lights = S.headlights === 'on' ? 1 : S.headlights === 'auto' ? 0.5 : 0; st.auto = autoDrive ? 1 : 0; st.boost2 = b2Active() ? 1 : 0; st.wings = wingsActive() && wingsOpenWant() ? 1 : 0; st.float = floatOn() && !myFloat.flat ? 1 : 0; st.roll = myStunt.roll ? (W.roll && W.roll.kind === 'roll' ? 1 : 0.5) : 0; st.flip = myStunt.flip ? (W.roll && W.roll.kind === 'flip' ? 1 : 0.5) : 0; st.bflip = myStunt.bflip ? (W.roll && W.roll.kind === 'bflip' ? 1 : 0.5) : 0; st.target = myWeapon() ? (W.lock ? 1 : 0.5) : 0; st.side = myStunt.side ? (W.side ? 1 : 0.5) : 0; st.jump = myStunt.jump ? ((W.jumpCool || 0) > 0 ? 1 : 0.5) : 0; }
  updateSwitches(k, st, dt, W.swFlash);
  stickStep(k, pax, dt);
}
function weaponStep(dt, live) {
  if (!wfx) return;
  wfx.update(live ? dt : 0);
  try { if (W.lock && (mode !== 'world' || !myWeapon())) W.lock = null; lockHud(); } catch (e) { if (!W.lockFail) { W.lockFail = true; console.error('[overpass] lock-on:', e); } }
  try { if (mode === 'world') WPN.syncWeapon(player.mesh, myWeapon() ? arsenal.cfg : null); } catch { }
  if ((W.hitT -= dt) <= 0) { W.hitT = 0.2; for (const [id, d] of W.hitPend) { if (d >= 0.5) net.sendTo(id, { k: 'hit', d: Math.round(d), w: myWeapon()?.id || '' }); } W.hitPend.clear(); }
  if (W.hitMark > 0) W.hitMark -= dt;
  if (W.paxFireT > 0) W.paxFireT -= dt;
  // the red console buttons: ours when driving, the driver's when we're riding along
  try { if (cockpit && cockpit.fireBtn) cockpit.fireBtn.visible = !!myWeapon() && mode === 'world'; if (ride?.ck && ride.ck.fireBtn) ride.ck.fireBtn.visible = !!(ride.riding && net.weaponFor(ride.riding.id)); } catch { }
  const press = keys.KeyE || touchKeys.fire || W.padFire;
  if (ride?.riding) { // riding along: our fire button fires the driver's gun
    const p = press || vrButton(ride.ck);
    if (p && net.weaponFor(ride.riding.id) && (W.paxSendT = (W.paxSendT || 0) - dt) <= 0) { W.paxSendT = 0.12; net.sendTo(ride.riding.id, { k: 'pfire' }); }
    return;
  }
  const w = myWeapon(), want = press || vrButton(cockpit) || W.paxFireT > 0;
  if (!w || !want || !live || mode !== 'world' || W.spawning || W.wreck > 0 || ride?.riding || garage?.busy) return;
  // a target you tapped comes first; otherwise light aim assist: the nearest other car within ~17 degrees of straight ahead
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); let aim = lockAim(), bd = aim ? 0 : 320;
  if (!aim) for (const [id, r] of W.remotes) { const pl = net.players.get(id); if (!pl || pl.rd) continue; const dx = r.car.x - player.x, dz = r.car.z - player.z, d = Math.hypot(dx, dz); if (d < 2 || d > bd) continue; if ((dx * fx + dz * fz) / d < Math.cos(0.3)) continue; bd = d; aim = { p: new THREE.Vector3(r.car.x, (r.car.y || 0) + 0.7, r.car.z), v: new THREE.Vector3(r.car.vx || 0, 0, r.car.vz || 0) }; }
  if (!aim) { bd = 220; for (const c of police.targets()) { const dx = c.car.x - player.x, dz = c.car.z - player.z, d = Math.hypot(dx, dz); if (d < 2 || d > bd || (dx * fx + dz * fz) / d < Math.cos(0.26)) continue; bd = d; aim = { p: new THREE.Vector3(c.car.x, (c.car.y || 0) + 0.7, c.car.z), v: new THREE.Vector3(c.car.vx || 0, 0, c.car.vz || 0) }; } }
  if (!aim && fed && mode === 'world') { const t = fed.aimAt(player.x, (player.y || 0) + 1, player.z, fx, fz); if (t) aim = { p: new THREE.Vector3(t.x, t.y + 0.7, t.z), v: t.v ? t.v.clone() : new THREE.Vector3() }; }
  if (!aim && planes) { bd = 520; for (const t of planes.targets()) { const p = t.ref, dx = p.x - player.x, dz = p.z - player.z, dh = Math.hypot(dx, dz), d = Math.hypot(dh, p.y - (player.y || 0)); if (d > bd || dh < 1 || (dx * fx + dz * fz) / dh < Math.cos(0.35)) continue; bd = d; aim = { p: new THREE.Vector3(p.x, p.y, p.z), v: new THREE.Vector3(p.fx * 85, 0, p.fz * 85) }; } }
  if (!aim) { bd = 200; for (const a of W.traffic) { const dx = a.car.x - player.x, dz = a.car.z - player.z, d = Math.hypot(dx, dz); if (d < 2 || d > bd || (dx * fx + dz * fz) / d < Math.cos(0.22)) continue; bd = d; aim = { p: new THREE.Vector3(a.car.x, (a.car.y || 0) + 0.7, a.car.z), v: new THREE.Vector3(Math.sin(a.car.yaw) * a.speed, 0, Math.cos(a.car.yaw) * a.speed) }; } }
  if (!aim) { bd = 260; try { for (const b of boats.list) { if (b.sink) continue; const dx = b.x - player.x, dz = b.z - player.z, d = Math.hypot(dx, dz); if (d < 3 || d > bd || (dx * fx + dz * fz) / d < Math.cos(0.25)) continue; bd = d; aim = { p: new THREE.Vector3(b.x, (b.wy || 0) + 0.8, b.z), v: new THREE.Vector3(b.vx + b.pvx, 0, b.vz + b.pvz) }; } } catch { } }
  const pitch = player.fly ? player.fly.pitch : 0.015;
  const shot = wfx.fire(w, player.mesh, player, pitch, aim); if (!shot) return;
  if (w.id === 'mg' || w.id === 'shot') camShake = Math.max(camShake, w.id === 'shot' ? 0.18 : 0.05);
  if (net.active) { const [la, lo] = world.unproj(shot.x, shot.z); net.sendShot({ w: shot.w, la, lo, y: shot.y, dx: shot.dx, dy: shot.dy, dz: shot.dz, vx: shot.vx, vz: shot.vz, n: shot.n, k: shot.k }); }
}
// ---------- tap to target: tap a balloon, person, deer, car, police car, plane, boat or player to lock your weapon onto it ----------
// Tap empty space (or the same target again) to let go, and the gun goes back to aiming ahead.
const lockKey = t => t.ref || ('id:' + t.id);
const _lkP = new THREE.Vector3();
function lockName(t) {
  switch (t.npc) {
    case 'car': return 'CAR'; case 'cop': return 'POLICE'; case 'ped': return 'PERSON'; case 'deer': return 'DEER'; case 'balloon': return 'BALLOON'; case 'mine': return 'SEA MINE'; case 'bird': return (t.ref && t.ref.kind === 2 ? 'GULL' : t.ref && t.ref.kind === 1 ? 'CROW' : 'PIGEON'); case 'squirrel': return 'SQUIRREL'; case 'sea': return t.ref && t.ref.S ? t.ref.S.name : 'SEA LIFE';
    case 'fed': return t.ref && t.ref.kind === 'jet' ? 'FEDERATION JET' : t.ref && t.ref.kind === 'sub' ? 'FEDERATION SUB' : t.ref && t.ref.kind === 'car' ? 'FEDERATION JET CAR' : 'FEDERATION CARRIER';
    case 'plane': return (t.ref.desc || '747').toUpperCase(); case 'boat': return (t.ref.type && t.ref.type.name ? t.ref.type.name : 'BOAT').toUpperCase();
    default: return (net.players.get(t.id)?.name || 'PLAYER').toUpperCase();
  }
}
function lockVel(t) {
  const r = t.ref;
  switch (t.npc) {
    case 'car': return new THREE.Vector3(Math.sin(r.car.yaw) * r.speed, 0, Math.cos(r.car.yaw) * r.speed);
    case 'cop': return new THREE.Vector3(r.car.vx || 0, 0, r.car.vz || 0);
    case 'plane': return new THREE.Vector3((r.fx || 0) * 85, 0, (r.fz || 0) * 85);
    case 'boat': return new THREE.Vector3((r.vx || 0) + (r.pvx || 0), 0, (r.vz || 0) + (r.pvz || 0));
    case 'deer': return new THREE.Vector3(Math.sin(r.yaw) * (r.sp || 0), 0, Math.cos(r.yaw) * (r.sp || 0));
    case 'fed': return t.ref && t.ref.v ? t.ref.v.clone() : new THREE.Vector3();
    case 'ped': case 'balloon': case 'mine': case 'squirrel': return new THREE.Vector3();
    case 'bird': return birds ? birds.velOf(r) : new THREE.Vector3();
    case 'sea': return seaLife ? seaLife.velOf(r) : new THREE.Vector3();
    default: { const rm = W.remotes.get(t.id); return rm ? new THREE.Vector3(rm.car.vx || 0, 0, rm.car.vz || 0) : new THREE.Vector3(); }
  }
}
// the locked target as it is right now (a boat lists several hit spheres: use their middle), or null once it's gone
function lockNow() {
  const L = W.lock; if (!L || mode !== 'world' || !wfx) return null;
  let n = 0, x = 0, y = 0, z = 0, first = null;
  for (const t of wfx.c.targets()) if (lockKey(t) === L.key) { n++; x += t.x; y += t.y; z += t.z; first = first || t; }
  if (!n) return null;
  const p = new THREE.Vector3(x / n, y / n + 0.7, z / n);
  if (Math.hypot(p.x - player.x, p.z - player.z) > 900) return null;
  return { t: first, p };
}
function lockAim() {
  const now = lockNow(); if (!now) { if (W.lock) dropLock(true); return null; }
  return { p: now.p, v: lockVel(now.t) };
}
function dropLock(lost) { if (!W.lock) return; if (lost) hudMsg(W.lock.name + (W.hitMark > 0 ? ' · DOWN' : ' · TARGET LOST'), 900); W.lock = null; }
// the cockpit's TARGET button: lock the nearest thing you can shoot (press again for the next nearest)
function lockNearest(from) {
  if (mode !== 'world' || paused || W.spawning || !wfx) return false;
  if (!myWeapon()) { toast('Fit a weapon first (Blick\'s Shooting Goods), then TARGET locks on to the nearest thing you can shoot', 3000); return false; }
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), py = (player.y || 0) + 1, seen = new Map();
  for (const t of wfx.c.targets()) {
    const dx = t.x - player.x, dz = t.z - player.z, d = Math.hypot(dx, dz, t.y - py); if (d > 600 || d < 1.5) continue;
    const ahead = (dx * fx + dz * fz) / Math.max(1, Math.hypot(dx, dz)), sc = d * (ahead > 0 ? 1 : 1.6), k = lockKey(t), o = seen.get(k);
    if (!o || sc < o.sc) seen.set(k, { t, sc });
  }
  const list = [...seen.values()].sort((a, b) => a.sc - b.sc);
  if (!list.length) { hudMsg('NO TARGETS NEARBY', 1000); return false; }
  let i = 0; if (W.lock) { const k = list.findIndex(o => lockKey(o.t) === W.lock.key); if (k >= 0) i = (k + 1) % list.length; }
  const best = list[i].t; W.lock = { key: lockKey(best), name: lockName(best) }; Audio.click();
  hudMsg((from ? 'PASSENGER · ' : '') + 'TARGET LOCKED · ' + W.lock.name + (list.length > 1 ? ` (${i + 1}/${list.length})` : ''), 1100); return true;
}
// screen tap: pick the target drawn nearest to where you tapped
function tapTarget(cx, cy) {
  if (mode !== 'world' || paused || W.spawning || !wfx || !myWeapon() || vr.presenting) return false;
  const rc = canvas.getBoundingClientRect(), sx = cx - rc.left, sy = cy - rc.top; camera.updateMatrixWorld();
  const camP = camera.getWorldPosition(new THREE.Vector3()); let best = null, bs = Infinity;
  for (const t of wfx.c.targets()) {
    _lkP.set(t.x, t.y + 0.7, t.z); const dist = _lkP.distanceTo(camP); if (dist > 900) continue;
    _lkP.project(camera); if (_lkP.z > 1 || _lkP.z < -1) continue;
    const px = (_lkP.x + 1) / 2 * rc.width, py = (1 - _lkP.y) / 2 * rc.height, d = Math.hypot(px - sx, py - sy);
    const rad = (t.r || 1.5) / Math.max(1, dist) * rc.height / (2 * Math.tan(camera.fov * Math.PI / 360)); // how big it looks on screen
    const reach = Math.max(44, rad * 1.3); if (d > reach) continue;
    const sc = d / reach + dist / 2000; if (sc < bs) { bs = sc; best = t; }
  }
  if (!best || (W.lock && W.lock.key === lockKey(best))) { if (W.lock) { hudMsg('TARGET RELEASED', 700); W.lock = null; Audio.click(); } return !!best; }
  W.lock = { key: lockKey(best), name: lockName(best) }; Audio.click(); hudMsg('TARGET LOCKED · ' + W.lock.name, 1000);
  return true;
}
{ let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  canvas.addEventListener('pointerup', e => {
    const d = down; down = null; if (!d || d.id !== e.pointerId) return;
    if (performance.now() - d.t > 350 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return; // a tap, not a drag
    tapTarget(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', () => { down = null; });
}
// the lock-on marker over the target
function lockHud() {
  let el = W.lockEl;
  if (!el) { el = W.lockEl = document.createElement('div'); el.className = 'lock-ret'; el.innerHTML = '<i></i><span></span>'; $('#hud').appendChild(el); }
  const now = W.lock && !vr.presenting ? lockNow() : null;
  if (!now) { el.style.display = 'none'; if (W.lock && !lockNow()) dropLock(true); return; }
  _lkP.copy(now.p).project(camera);
  if (_lkP.z > 1 || _lkP.z < -1) { el.style.display = 'none'; return; }
  const rc = canvas.getBoundingClientRect(), px = rc.left + (_lkP.x + 1) / 2 * rc.width, py = rc.top + (1 - _lkP.y) / 2 * rc.height;
  const dist = Math.round(Math.hypot(now.p.x - player.x, now.p.y - (player.y || 0), now.p.z - player.z));
  el.style.display = 'block'; el.style.transform = `translate(${px}px, ${py}px)`;
  const txt = `${W.lock.name} · ${S.units === 'kmh' ? dist + ' m' : Math.round(dist * 1.094) + ' yd'}`, sp = el.lastChild; if (sp.textContent !== txt) sp.textContent = txt;
}
function weaponHit(from, d) { // someone shot us
  if (mode !== 'world' || W.spawning || W.wreck > 0 || ride?.riding || !(d > 0)) return;
  const who = net.players.get(from)?.name || 'Someone';
  if (invincible()) { hurtFlash = Math.max(hurtFlash, 0.2); return; }
  player.hp = Math.max(0, (player.hp ?? HP_MAX) - d); hurtFlash = Math.max(hurtFlash, Math.min(0.9, d / 25)); camShake = Math.max(camShake, Math.min(0.5, d / 60));
  if (player.hp <= 0) { wreckCar(); hudMsg(`KNOCKED OUT BY ${who.toUpperCase()}`, 2600); net.sendTo(from, { k: 'ko' }); }
  else if (d >= 20) hudMsg(`HIT BY ${who.toUpperCase()}`, 900);
}
function lightsHtml() {
  const custom = !!looks.glb, cards = ['h', 't', 'u'].map(k => {
    const g = myLights[k], on = !!g.on, [name, ic] = LT_NAMES[k];
    const sw = LIGHT_COLORS.map(c => `<button class="ltsw ${c.toLowerCase() === g.c.toLowerCase() ? 'on' : ''}" style="background:${c}" data-lt-color="${k}:${c}" aria-label="${name} colour ${c}"></button>`).join('');
    const rows = LT_ROWS[k].map(([f, label, , , , fmt]) => `<div class="lt-row"><span>${label}</span><button data-lt-adj="${k}:${f}:-1" aria-label="${label} less">−</button><em data-lt-val="${k}:${f}">${fmt(g[f])}</em><button data-lt-adj="${k}:${f}:1" aria-label="${label} more">+</button></div>`).join('');
    return `<div class="cl-card"><div class="ic">${ic}</div><div class="tx"><b>${name}</b>
      <small>${k === 'u' ? 'Glowing strips under the car and a glow on the road' : (custom ? 'Your model comes without lights: switch these on and nudge them into place' : 'Replaces the built-in lights while on')}</small>
      <div class="av-actions"><button class="ghost sm" data-lt-toggle="${k}">${on ? 'Turn off' : 'Turn on'}</button>${on ? `<button class="ghost sm" data-lt-reset="${k}">Reset</button>` : ''}</div>
      ${on ? `<div class="lt-sws">${sw}</div>${rows}` : ''}</div></div>`;
  }).join('');
  return `<div class="gsec"><h4>Lights</h4><div class="custom-grid">${cards}</div><p class="note">Lights are positioned from your vehicle's own size, so a setup carries over to other cars. Hold + or − to keep nudging. Friends see your lights too.</p></div>`;
}
function workshopNote() {
  const own = garage && garage.mine.length;
  return `<div class="gsec"><h4>Custom car &amp; lights</h4><div class="cl-card"><div class="ic">G</div><div class="tx"><b>${own ? 'Customize inside your garage' : 'Customize inside a garage'}</b>
    <small>${own ? 'Your custom 3D model, picture paint and lights (headlights, taillights, underglow) live in your garage workshop. Drive in, or tap Enter garage below.' : 'Build a garage, then drive in to upload a custom car, name it, and add lights. You can also set these up from the main menu.'}</small></div></div></div>`;
}
function applyMyLights() { saveLights(myLights); net.setLights(myLights); }
function bindLights(el) {
  const get = (k, f) => myLights[k][f];
  const label = (k, f) => LT_ROWS[k].find(r => r[0] === f)[5];
  el.querySelectorAll('[data-lt-toggle]').forEach(b => b.onclick = () => { const k = b.dataset.ltToggle; myLights[k].on = myLights[k].on ? 0 : 1; applyMyLights(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-lt-reset]').forEach(b => b.onclick = () => { const k = b.dataset.ltReset, d = defaultLights()[k]; myLights[k] = { ...d, on: 1 }; applyMyLights(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-lt-color]').forEach(b => b.onclick = () => { const [k, c] = b.dataset.ltColor.split(':'); myLights[k].c = c; applyMyLights(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-lt-adj]').forEach(b => { // press and hold keeps nudging; the number is updated in place so the button under your finger isn't rebuilt
    const [k, f, d] = b.dataset.ltAdj.split(':'), row = LT_ROWS[k].find(r => r[0] === f); let t = 0, iv = 0;
    const step = () => { const v = Math.round(Math.max(row[3], Math.min(row[4], get(k, f) + (+d) * row[2])) * 100) / 100; if (v === get(k, f)) return; myLights[k][f] = v; applyMyLights(); $$(`[data-lt-val="${k}:${f}"]`).forEach(e => { e.textContent = label(k, f)(v); }); };
    const stop = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); step(); stop(); t = setTimeout(() => { iv = setInterval(step, 70); }, 380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
  });
}
let lib = [], pendingModel = null, libDel = null;
libIndex().then(x => { lib = x; renderGarage(); });
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.lib-name{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:inherit;font:inherit;font-weight:700;margin-bottom:4px}.lib-row.on{outline:2px solid var(--accent-2,#7ff0b4);border-radius:14px}' }));
function wheelCardHtml() {
  const w = looks.wheel, m = w ? cleanWheelM(w.m) : null, pct = v => Math.round(v * 100) + '%';
  return `<div class="cl-card"><div class="ic">${w ? '◎' : '+'}</div><div class="tx"><b>${w ? escapeHtml(w.m.name || 'Your wheels') : 'Custom wheels'} <em class="tag">Free</em></b>
    <small>${w ? `${escapeHtml((w.m.ext || '').toUpperCase())} · ${fmtBytes(w.m.size || 0)} · on all four wheels` : `Your own wheel model (GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_PART_BYTES)}), fitted to every wheel`}</small>
    ${w ? `<div class="adj-row"><span>Size</span><button class="ghost sm" data-wh-adj="sz:-0.05">−</button><b>${pct(m.sz)}</b><button class="ghost sm" data-wh-adj="sz:0.05">+</button></div>
    <div class="adj-row"><span>Width</span><button class="ghost sm" data-wh-adj="wd:-0.1">−</button><b>${pct(m.wd)}</b><button class="ghost sm" data-wh-adj="wd:0.1">+</button></div>
    <div class="segs" title="Which way the axle runs through your model">${['auto', 'x', 'y', 'z'].map(a => `<button class="${a === m.axle ? 'on' : ''}" data-wh-axle="${a}">${a === 'auto' ? 'Axle: auto' : a.toUpperCase()}</button>`).join('')}</div>` : ''}
    <div class="av-actions"><button class="ghost sm" data-wh-pick>${w ? 'Upload other wheels' : 'Upload wheels'}</button>${w ? `<button class="ghost sm" data-wh-flip>${m.flip ? 'Rims: inwards' : 'Rims: outwards'}</button><button class="ghost sm" data-wh-clear>Stock wheels</button>` : ''}</div></div></div>`;
}
const wheelFile = document.createElement('input'); wheelFile.type = 'file'; wheelFile.accept = '.glb,.gltf,.obj,.stl'; wheelFile.hidden = true; document.body.appendChild(wheelFile);
wheelFile.addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!['glb', 'gltf', 'obj', 'stl'].includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_PART_BYTES) { toast(`That model is ${fmtBytes(f.size)}. Wheels can be up to ${fmtBytes(MAX_PART_BYTES)}, so try a lighter version.`, 4200); return; }
  toast('Fitting your wheels…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf);
    const data = bufToB64(buf), a = { h: hashStr(data), m: cleanWheelM({ name: f.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Wheels', ext, size: f.size }), data };
    looks.wheel = a; idbSet('wheel', a); net.setAsset('wh', a); Audio.chime(4); toast('New wheels on! Use Size, Width and Axle if they look off', 3200); renderGarage();
  } catch (err) { console.warn(err); toast('Could not read that model: ' + (err && err.message || err), 4500); }
});
function bindWheels(el) {
  const save = () => { idbSet('wheel', looks.wheel); net.setAssetMeta('wh', looks.wheel.m); Audio.click(); renderGarage(); };
  el.querySelectorAll('[data-wh-pick]').forEach(b => b.onclick = () => wheelFile.click());
  el.querySelectorAll('[data-wh-clear]').forEach(b => b.onclick = () => { looks.wheel = null; idbSet('wheel', null); net.setAsset('wh', null); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-wh-adj]').forEach(b => b.onclick = () => { const [k, d] = b.dataset.whAdj.split(':'), m = looks.wheel.m; m[k] = Math.round(((+m[k] || 1) + +d) * 100) / 100; looks.wheel.m = cleanWheelM(m); save(); });
  el.querySelectorAll('[data-wh-axle]').forEach(b => b.onclick = () => { looks.wheel.m = cleanWheelM({ ...looks.wheel.m, axle: b.dataset.whAxle }); save(); });
  el.querySelectorAll('[data-wh-flip]').forEach(b => b.onclick = () => { looks.wheel.m = cleanWheelM({ ...looks.wheel.m, flip: !looks.wheel.m.flip }); save(); });
}
function customHtml() {
  const g = looks.glb, k = looks.skin, sc = k ? (k.m.scale || 1) : 1, inUse = e => g && g.h === e.h;
  const naming = pendingModel ? `<div class="cl-card"><div class="ic">3D</div><div class="tx"><b>Name your car</b>
      <small>${escapeHtml(pendingModel.a.m.name)} · ${fmtBytes(pendingModel.a.m.size || 0)}</small>
      <input class="lib-name" data-pend-name maxlength="24" value="${escapeHtml(pendingModel.name)}" placeholder="Car name" autocomplete="off">
      <div class="av-actions"><button class="ghost sm" data-pend-save>Save to garage &amp; use</button><button class="ghost sm" data-pend-cancel>Cancel</button></div></div></div>` : '';
  const rows = lib.map(e => `<div class="cl-card lib-row ${inUse(e) ? 'on' : ''}"><div class="ic">3D</div><div class="tx">
      <input class="lib-name" data-lib-name="${escapeHtml(e.id)}" maxlength="24" value="${escapeHtml(e.name)}" aria-label="Car name" autocomplete="off">
      <small>${escapeHtml((e.ext || '').toUpperCase())} · ${fmtBytes(e.size || 0)}${inUse(e) ? ' · in use' : ''}</small>
      <div class="av-actions">${inUse(e) ? '<button class="ghost sm" disabled>In use</button>' : `<button class="ghost sm" data-lib-use="${escapeHtml(e.id)}">Use</button>`}<button class="ghost sm" data-lib-rot="${escapeHtml(e.id)}">Turn 90°</button><button class="ghost sm" data-lib-del="${escapeHtml(e.id)}">${libDel === e.id ? 'Tap again to delete' : 'Delete'}</button></div></div></div>`).join('');
  return `<div class="gsec"><h4>Custom look</h4><div class="custom-grid">
    ${naming}
    <div class="cl-card"><div class="ic">${g ? '3D' : '+'}</div><div class="tx"><b>${g ? escapeHtml(g.m.name || 'Your 3D model') : 'Your own 3D model'}</b>
      <small>${g ? `${escapeHtml((g.m.ext || '').toUpperCase())} · ${fmtBytes(g.m.size || 0)}${modelErr ? ' · could not load' : ' · on your car now'}` : `GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_MODEL_BYTES)}`}</small>
      <div class="av-actions"><button class="ghost sm" data-glb-pick>${g ? 'Upload another' : 'Upload model'}</button>${g ? '<button class="ghost sm" data-glb-rot>Turn 90°</button><button class="ghost sm" data-glb-clear>Stop using</button>' : ''}</div></div></div>
    <div class="cl-card"><div class="ic" ${k ? `style="background-image:url('${k.data}')"` : ''}>${k ? '' : '+'}</div><div class="tx"><b>Picture paint job</b>
      <small>${k ? (g ? 'Shows on the built-in body. Your 3D model keeps its own colors.' : 'Wrapped around your car') : 'Any photo or pattern becomes your paint'}</small>
      ${k ? `<div class="segs">${SKIN_SCALES.map(([v, n]) => `<button class="${v === sc ? 'on' : ''}" data-skin-scale="${v}">${n}</button>`).join('')}</div>` : ''}
      <div class="av-actions"><button class="ghost sm" data-skin-pick>${k ? 'Change picture' : 'Upload picture'}</button>${k ? '<button class="ghost sm" data-skin-clear>Remove</button>' : ''}</div></div></div>
    ${wheelCardHtml()}
  </div><p class="note">Your model is fitted to the size of the vehicle you pick above and drives like it (pick the Custom frame to choose its size and build its stats yourself). If it faces the wrong way, press Turn 90°. Multiplayer friends see your model and paint too.</p></div>
  <div class="gsec"><h4>My custom cars <small>${lib.length} of ${MAX_LIBRARY} saved</small></h4>${rows || '<p class="note">Upload a 3D model above, give it a name, and it is saved here on this device. Switch between your cars any time, even after you reload the page.</p>'}</div>`;
}
// ---------- ornaments: your own little 3D models bolted anywhere on the car (ornaments.js) ----------
// placements live in localStorage, the model files in IndexedDB ('orn:<hash>'); friends get them like your custom car model
const ORN_KEY = 'osm.orn.v1';
let myOrn = (() => { try { const v = JSON.parse(localStorage.getItem(ORN_KEY) || '[]'); return Array.from({ length: ORN_SLOTS }, (_, i) => v[i] && v[i].h ? { h: String(v[i].h), m: cleanPlace(v[i].m), data: null } : null); } catch { return [null, null, null]; } })();
let ornSlot = 0, ornPick = 0, ornDel = -1, ornNetT = 0;
const saveOrn = () => { try { localStorage.setItem(ORN_KEY, JSON.stringify(myOrn.map(o => o ? { h: o.h, m: o.m } : null))); } catch { } };
myOrn.forEach((o, i) => { if (o) idbGet('orn:' + o.h).then(d => { if (myOrn[i] === o) { if (typeof d === 'string') { o.data = d; net.setAsset('o' + i, o); } else { myOrn[i] = null; saveOrn(); } renderGarage(); } }); });
const ornShare = (i, metaOnly) => { const o = myOrn[i]; if (!o || !o.data) { net.setAsset('o' + i, null); return; } if (!metaOnly) { net.setAsset('o' + i, o); return; } clearTimeout(ornNetT); ornNetT = setTimeout(() => { if (myOrn[i]) net.setAssetMeta('o' + i, myOrn[i].m); }, 200); };
// [field, label, step, min, max, format]
const ORN_ROWS = [['x', 'Left · right', 0.05, -4, 4, v => `${Math.round(v * 100)} cm`], ['y', 'Down · up', 0.05, -1, 5, v => `${Math.round(v * 100)} cm`], ['z', 'Back · forward', 0.05, -5, 5, v => `${Math.round(v * 100)} cm`],
  ['s', 'Size', 0.05, 0.05, 5, v => `${Math.round(v * 100)} cm`], ['yaw', 'Turn', 15, -180, 180, v => `${Math.round(v)}°`], ['pitch', 'Tilt', 15, -180, 180, v => `${Math.round(v)}°`], ['roll', 'Roll', 15, -180, 180, v => `${Math.round(v)}°`]];
function ornHtml() {
  const tabs = Array.from({ length: ORN_SLOTS }, (_, i) => { const o = myOrn[i]; return `<button class="${i === ornSlot ? 'on' : ''}" data-orn-slot="${i}">${o ? escapeHtml(o.m.name).slice(0, 14) : `Slot ${i + 1} · empty`}</button>`; }).join('');
  const o = myOrn[ornSlot];
  let body;
  if (!o) body = `<div class="cl-card"><div class="ic">+</div><div class="tx"><b>Add an ornament</b>
      <small>Any 3D model: GLB, GLTF, OBJ or STL, up to ${fmtBytes(MAX_ORN_BYTES)}. A duck, a sofa, a trophy, a traffic cone, whatever you've got. It lands on your roof, then you move it anywhere.</small>
      <div class="av-actions"><button class="ghost sm" data-orn-pick>Upload model</button></div></div></div>`;
  else {
    const m = o.m, rows = ORN_ROWS.map(([f, label, , , , fmt]) => `<div class="lt-row"><span>${label}</span><button data-orn-adj="${f}:-1" aria-label="${label} less">−</button><em data-orn-val="${f}">${fmt(m[f])}</em><button data-orn-adj="${f}:1" aria-label="${label} more">+</button></div>`).join('');
    body = `<div class="cl-card"><div class="ic">3D</div><div class="tx">
      <input class="lib-name" data-orn-name maxlength="24" value="${escapeHtml(m.name)}" aria-label="Ornament name" autocomplete="off">
      <small>${escapeHtml(m.ext.toUpperCase())} · ${fmtBytes(m.size || 0)}${o.data ? '' : ' · loading…'}${W.ornErr && W.ornErr[ornSlot] ? ' · could not load' : ''}</small>
      <div class="av-actions"><button class="ghost sm" data-orn-on>${m.on ? 'Hide' : 'Show'}</button><button class="ghost sm" data-orn-spin aria-pressed="${!!m.spin}">${m.spin ? 'Spinning · stop' : 'Spin it'}</button><button class="ghost sm" data-orn-pick>Replace</button><button class="ghost sm" data-orn-del>${ornDel === ornSlot ? 'Tap again to remove' : 'Remove'}</button></div>
      <h5 class="orn-h">Quick spots</h5><div class="segs">${SPOTS.map(([id, n]) => `<button data-orn-spot="${id}">${n}</button>`).join('')}</div>
      <h5 class="orn-h">Fine placement <small>hold + or − to keep going</small></h5>${rows}
      <div class="av-actions"><button class="ghost sm" data-orn-snap="90">Turn 90°</button><button class="ghost sm" data-orn-snap="up">Stand it up</button><button class="ghost sm" data-orn-reset>Reset turn &amp; tilt</button></div></div></div>`;
  }
  const n = myOrn.filter(Boolean).length;
  return `<div class="gsec"><h4>Ornaments <small>${n} of ${ORN_SLOTS} fitted</small></h4><div class="segs orn-tabs">${tabs}</div><div class="custom-grid">${body}</div>
    <p class="note">Ornaments are just for looks: they don't change how your car drives or what it hits. They stay on whichever car you pick (including your own uploaded model), and multiplayer friends see them too. Big files take longer to reach friends, so smaller models are best.</p></div>`;
}
function bindOrn(el) {
  const o = () => myOrn[ornSlot], changed = (meta = true) => { saveOrn(); ornShare(ornSlot, meta); };
  el.querySelectorAll('[data-orn-slot]').forEach(b => b.onclick = () => { ornSlot = +b.dataset.ornSlot; ornDel = -1; Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-pick]').forEach(b => b.onclick = () => { ornPick = ornSlot; $('#ornFile').click(); });
  el.querySelectorAll('[data-orn-on]').forEach(b => b.onclick = () => { if (!o()) return; o().m.on = o().m.on ? 0 : 1; changed(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-spin]').forEach(b => b.onclick = () => { if (!o()) return; o().m.spin = o().m.spin ? 0 : 1; changed(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-del]').forEach(b => b.onclick = () => {
    const i = ornSlot; if (ornDel !== i) { ornDel = i; setTimeout(() => { if (ornDel === i) { ornDel = -1; renderGarage(); } }, 4000); renderGarage(); return; }
    ornDel = -1; const h = myOrn[i] && myOrn[i].h; myOrn[i] = null; saveOrn(); ornShare(i); if (h && !myOrn.some(x => x && x.h === h)) idbSet('orn:' + h, null); Audio.click(); renderGarage();
  });
  el.querySelectorAll('[data-orn-spot]').forEach(b => b.onclick = () => { if (!o()) return; Object.assign(o().m, spot(b.dataset.ornSpot, carBox(player.mesh), o().m.s)); changed(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-snap]').forEach(b => b.onclick = () => { if (!o()) return; const m = o().m; if (b.dataset.ornSnap === '90') m.yaw = ((m.yaw + 90 + 180) % 360 + 360) % 360 - 180; else m.pitch = m.pitch === -90 ? 0 : -90; changed(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-reset]').forEach(b => b.onclick = () => { if (!o()) return; Object.assign(o().m, { yaw: 0, pitch: 0, roll: 0 }); changed(); Audio.click(); renderGarage(); });
  el.querySelectorAll('[data-orn-name]').forEach(i => { i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); }); i.onchange = () => { if (!o()) return; o().m.name = i.value.trim().slice(0, 24) || 'Ornament'; changed(); renderGarage(); }; });
  el.querySelectorAll('[data-orn-adj]').forEach(b => { // press and hold keeps nudging; numbers update in place
    const [f, d] = b.dataset.ornAdj.split(':'), row = ORN_ROWS.find(r => r[0] === f); let t = 0, iv = 0;
    const step = () => { const x = o(); if (!x) return; let v = x.m[f] + (+d) * row[2]; if (row[3] === -180) v = ((v + 180) % 360 + 360) % 360 - 180; v = Math.round(Math.max(row[3], Math.min(row[4], v)) * 100) / 100; if (v === x.m[f]) return; x.m[f] = v; changed(); $$(`[data-orn-val="${f}"]`).forEach(e => { e.textContent = row[5](v); }); };
    const stop = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); step(); stop(); t = setTimeout(() => { iv = setInterval(step, 70); }, 380); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
  });
}
$('#ornFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; const i = ornPick;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!ORN_EXTS.includes(ext)) { toast('Use a .glb, .gltf, .obj or .stl file'); return; }
  if (f.size > MAX_ORN_BYTES) { toast(`That model is ${fmtBytes(f.size)}. Ornaments can be up to ${fmtBytes(MAX_ORN_BYTES)}, so try a lighter version.`, 4200); return; }
  toast('Loading your ornament…', 1500);
  try {
    const buf = await f.arrayBuffer(); await testModel(ext, buf);
    const data = bufToB64(buf), h = hashStr(data), old = myOrn[i];
    const m = cleanPlace({ ...(old ? old.m : spot('roof', carBox(player.mesh))), name: (f.name.replace(/\.[^.]+$/, '') || 'Ornament').slice(0, 24), ext, size: f.size, s: old ? old.m.s : 0.6, on: 1 });
    await idbSet('orn:' + h, data); myOrn[i] = { h, m, data }; saveOrn(); ornShare(i);
    if (old && old.h !== h && !myOrn.some(x => x && x.h === old.h)) idbSet('orn:' + old.h, null);
    Audio.chime(4); toast(`“${m.name}” is on your car. Use the quick spots and the + / − buttons to move it`, 3600); renderGarage();
  } catch (err) { console.warn(err); toast(ext === 'gltf' ? 'Could not read that file. GLTF files need their textures embedded, so a single .glb usually works better.' : 'Could not read that model: ' + (err && err.message || err), 4500); }
});
const validOrn = a => a && typeof a.data === 'string' && a.data.length < MAX_ORN_BYTES * 1.4 && a.h ? { h: a.h, m: cleanPlace(a.m), data: a.data } : null;
function setActiveModel(a) { looks.glb = a; modelErr = false; idbSet('glb', a); net.setAsset('glb', a); }
async function savePending() {
  const pm = pendingModel; if (!pm) return; const name = (pm.name || '').trim().slice(0, 24) || 'My car';
  try {
    const a = { ...pm.a, m: { ...pm.a.m, name } }, { entry, dup } = await libSave(name, a);
    lib = await libIndex(); pendingModel = null;
    if (dup) { await useLib(entry.id); toast(`That model is already in your garage as “${entry.name}”`, 3400); }
    else { setActiveModel(a); Audio.chime(4); toast(`“${name}” saved to your garage`, 2800); renderGarage(); }
  } catch (err) { toast(String(err && err.message || err), 4500); }
}
async function useLib(id) {
  const e = lib.find(x => x.id === id); if (!e) return; const a = await libGet(id); if (!a) { toast('That car could not be loaded'); return; }
  setActiveModel({ ...a, m: { ...a.m, name: e.name, rot: e.rot | 0 } }); Audio.click(); renderGarage();
}
function bindLibrary(el) {
  el.querySelectorAll('[data-pend-save]').forEach(b => b.onclick = savePending);
  el.querySelectorAll('[data-pend-cancel]').forEach(b => b.onclick = () => { pendingModel = null; renderGarage(); });
  el.querySelectorAll('[data-pend-name]').forEach(i => { i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') savePending(); }); i.oninput = e => { if (pendingModel) pendingModel.name = e.target.value; }; });
  el.querySelectorAll('[data-lib-use]').forEach(b => b.onclick = () => useLib(b.dataset.libUse));
  el.querySelectorAll('[data-lib-rot]').forEach(b => b.onclick = async () => {
    const e = lib.find(x => x.id === b.dataset.libRot); if (!e) return; const rot = ((e.rot | 0) + 1) % 4; await libUpdate(e.id, { rot }); lib = await libIndex();
    if (looks.glb && looks.glb.h === e.h) { looks.glb.m = { ...looks.glb.m, rot }; idbSet('glb', looks.glb); net.setAssetMeta('glb', looks.glb.m); } Audio.click(); renderGarage();
  });
  el.querySelectorAll('[data-lib-del]').forEach(b => b.onclick = async () => {
    const id = b.dataset.libDel; if (libDel !== id) { libDel = id; setTimeout(() => { if (libDel === id) { libDel = null; renderGarage(); } }, 4000); renderGarage(); return; }
    libDel = null; await libRemove(id); lib = await libIndex(); Audio.click(); renderGarage();
  });
  el.querySelectorAll('[data-lib-name]').forEach(i => {
    i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    i.onchange = async () => {
      const id = i.dataset.libName, name = i.value.trim().slice(0, 24) || 'My car', e = lib.find(x => x.id === id); if (!e) return; await libUpdate(id, { name }); lib = await libIndex();
      if (looks.glb && looks.glb.h === e.h) { looks.glb.m = { ...looks.glb.m, name }; idbSet('glb', looks.glb); net.setAssetMeta('glb', looks.glb.m); } renderGarage();
    };
  });
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
    pendingModel = { a, name: (f.name.replace(/\.[^.]+$/, '') || 'My car').slice(0, 24) }; renderGarage(); toast('Name your car, then save it to your garage', 3000);
    setTimeout(() => { const i = document.querySelector('[data-pend-name]'); if (i) { i.focus(); i.select(); } }, 60);
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
function syncLooks(car, glb, skin, color, mine = false, lt = null, wh = null) {
  const mesh = car.mesh, ud = mesh.userData;
  // custom wheels
  const wm = validGlb(wh) ? cleanWheelM(wh.m) : null, wk = wm ? wh.h + ':' + [wm.sz, wm.wd, wm.axle, wm.flip ? 1 : 0].join(',') : '';
  if ((ud.wheelKey || '') !== wk && ud.wheelBusy !== wk) {
    if (!wk) clearWheels(mesh);
    else {
      ud.wheelBusy = wk;
      modelTemplate({ h: wh.h, ext: wh.m.ext, data: wh.data }).then(tpl => { if (car.mesh === mesh && ud.wheelBusy === wk) applyWheels(mesh, tpl, wm, wk); })
        .catch(err => { console.warn('custom wheels failed', err); ud.wheelKey = wk; if (mine) toast('Your custom wheels could not be shown', 3000); })
        .finally(() => { if (ud.wheelBusy === wk) ud.wheelBusy = null; });
    }
  }
  if (ud.wheelG) keepWheelsShown(mesh);
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
  try { syncCarLights(mesh, lt); } catch (e) { if (!ud.lightErr) { ud.lightErr = 1; console.warn('car lights', e); } }
}
function renderGarage() {
  const nm = S.name || '', col = PAINTS[S.paint].color, cur = modelById(S.model);
  const obar = off => `<div class="stat"><small>Off-road</small><i><b style="width:${Math.round((1 - off * 0.85) * 100)}%"></b></i></div>`;
  const bar = (label, v) => `<div class="stat"><small>${label}</small><i><b style="width:${Math.round(Math.max(0.15, Math.min(1, (v - 0.82) / 0.32)) * 100)}%"></b></i></div>`;
  const sDriver = `<div class="gsec"><h4>Driver</h4>
      <div class="driver-card">
        <button class="av-slot" data-av-pick aria-label="Upload driver picture">${avatarHtml(S.avatar, nm || 'Driver', col, 72)}<span class="av-edit">${S.avatar ? 'Change' : 'Upload'}</span></button>
        <div class="driver-fields"><label class="field"><span>Driver name</span><input data-gname maxlength="16" value="${escapeHtml(nm)}" placeholder="Driver" autocomplete="off"></label>
        <div class="av-actions"><button class="ghost sm" data-av-pick>${S.avatar ? 'Change picture' : 'Upload picture'}</button>${S.avatar ? '<button class="ghost sm" data-av-clear>Remove</button>' : ''}</div></div>
      </div><p class="note">Your picture shows next to your name in the HUD, in race results, and on your name tag for multiplayer friends.</p></div>
      `;
  const sCar = `<div class="gsec"><h4>Car <small>${escapeHtml(cur.name)} · ${escapeHtml(cur.kind)}</small></h4>
      <div class="models">${MODELS.map(m => `<button class="model ${m.id === S.model ? 'on' : ''}" data-model="${m.id}"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.kind)} · ${m.mpg} ${m.electric ? 'MPGe' : 'mpg'}</small>${m.custom ? '<em class="tag">Upgradable · set it up below</em>' : ''}${m.unlock ? (carLocked(m.id) ? `<em class="tag lock">🔒 Unlock · ${m.unlock.toLocaleString()} pts</em>` : '<em class="tag">Unlocked</em>') : ''}${bar('Speed', m.top)}${bar('Accel', m.accel)}${bar('Grip', m.grip)}${obar(m.off)}<div class="stat"><small>Mileage</small><i><b style="width:${Math.round(Math.min(1, 0.12 + m.mpg / 56) * 100)}%"></b></i></div>${m.off === 0 ? '<em class="tag">No off-road slowdown</em>' : ''}</button>`).join('')}</div></div>
      `;
  const sPaint = `<div class="gsec"><h4>Paint</h4><div class="swatches">${PAINTS.map((p, i) => `<button class="swatch ${i === S.paint ? 'on' : ''}" data-paint="${i}"><i style="background:${p.color}"></i>${p.name}</button>`).join('')}</div>${looks.skin ? '<p class="note">Your picture paint job is on, so paint colors are paused. Remove the picture below to use them again.</p>' : ''}</div>
      `;
  $$('[data-garage]').forEach(el => {
    // three places show this: the main menu (everything), the pause menu (driver, base cars, paint, your garage) and the workshop inside your garage
    const variant = el.dataset.variant || (el.closest('#pause') ? 'pause' : 'menu'), tab = (garage && garage.shop && garage.shop.tab) || 'lights';
    const sFrame = S.model === 'custom' ? frameHtml() : '';
    el.innerHTML = variant === 'workshop' ? (tab === 'car' ? sCar + sPaint : tab === 'frame' ? frameHtml() : tab === 'custom' ? customHtml() : tab === 'orn' ? ornHtml() : tab === 'build' ? garage.buildHtml() : tab === 'nitro' ? nitroHtml() : tab === 'wings' ? wingsHtml() : tab === 'float' ? floatHtml() : tab === 'sub' ? subHtml() + cutterHtml() : tab === 'tickets' ? ticketsHtml() : tab === 'stunt' ? stuntHtml() : tab === 'interior' ? interiorHtml() : tab === 'driver' ? driverHtml() : tab === 'weapon' ? weaponHtml(false) : lightsHtml())
      : variant === 'pause' ? sDriver + sCar + sFrame + sPaint + (myTickets.length ? ticketsHtml() : '') + workshopNote() + (garage ? garage.panelHtml() : '')
      : sDriver + sCar + sFrame + sPaint + customHtml() + ornHtml() + lightsHtml() + interiorHtml() + (garage ? garage.panelHtml() : '');
    el.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { S.paint = +b.dataset.paint; setPaint(player.mesh, PAINTS[S.paint].color); Audio.click(); renderGarage(); if (net.me) net.me.color = PAINTS[S.paint].color; });
    el.querySelectorAll('[data-model]').forEach(b => b.onclick = () => { if (carLocked(b.dataset.model)) { buyCar(b.dataset.model, b); return; } useModel(b.dataset.model); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-av-pick]').forEach(b => b.onclick = () => $('#avFile').click());
    bindWheels(el);
    el.querySelectorAll('[data-glb-pick]').forEach(b => b.onclick = () => $('#glbFile').click());
    el.querySelectorAll('[data-skin-pick]').forEach(b => b.onclick = () => $('#skinFile').click());
    el.querySelectorAll('[data-glb-rot]').forEach(b => b.onclick = () => { const a = looks.glb; a.m = { ...a.m, rot: ((a.m.rot | 0) + 1) % 4 }; idbSet('glb', a); net.setAssetMeta('glb', a.m); const e = lib.find(x => x.h === a.h); if (e) libUpdate(e.id, { rot: a.m.rot }).then(() => libIndex()).then(x => { lib = x; }); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-glb-clear]').forEach(b => b.onclick = () => { looks.glb = null; idbSet('glb', null); net.setAsset('glb', null); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-skin-clear]').forEach(b => b.onclick = () => { looks.skin = null; idbSet('skin', null); net.setAsset('skin', null); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-skin-scale]').forEach(b => b.onclick = () => { const a = looks.skin; a.m = { ...a.m, scale: +b.dataset.skinScale }; idbSet('skin', a); net.setAssetMeta('skin', a.m); Audio.click(); renderGarage(); });
    el.querySelectorAll('[data-av-clear]').forEach(b => b.onclick = () => { setAvatar(null, null); Audio.click(); });
    garage?.bindPanel(el, renderGarage);
    bindLibrary(el); bindLights(el); bindNitro(el); bindWings(el); bindOrn(el); bindFloat(el); bindSub(el); bindTickets(el); bindStunt(el); bindDriver(el); bindWeapon(el); bindFrame(el); bindInterior(el);
    const inp = el.querySelector('[data-gname]');
    if (inp) { inp.addEventListener('keydown', e => e.stopPropagation()); inp.oninput = e => { S.name = e.target.value.trim(); syncNameInputs(inp); updateDriverChips(); if (net.me) net.me.name = (S.name || 'Driver').slice(0, 16); }; }
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
function setAvatar(big, small, quiet) {
  S.avatar = big; S.avatarNet = small;
  if (!quiet) try { if (big) localStorage.setItem(AVATAR_KEY, JSON.stringify({ big, small })); else localStorage.removeItem(AVATAR_KEY); } catch { toast('Your picture is too big to remember on this device', 2600); }
  if (big) { const im = new Image(); im.onload = () => { avatarImg = im; }; im.src = big; } else avatarImg = null;
  renderGarage(); if (net.me) { net.me.av = small; net.sendAvatar && net.sendAvatar(small); }
  if (!quiet) toast(big ? 'Driver picture updated' : 'Driver picture removed', 1600);
}
// restore the picture and car from last time, then keep the profile saved whenever it changes
try { const a = JSON.parse(localStorage.getItem(AVATAR_KEY) || 'null'); if (a && /^data:image\//.test(a.big || '') && /^data:image\//.test(a.small || '')) { S.avatar = a.big; S.avatarNet = a.small; const im = new Image(); im.onload = () => { avatarImg = im; }; im.src = a.big; } } catch { }
try { if (savedProfile.model && savedProfile.model !== S.model && MODELS.some(m => m.id === savedProfile.model)) useModel(savedProfile.model); } catch { }
let profileSaved = '';
function saveProfile() { const p = JSON.stringify({ name: S.name || '', paint: S.paint, model: S.model }); if (p === profileSaved) return; profileSaved = p; try { localStorage.setItem(PROFILE_KEY, p); } catch { } }
setInterval(saveProfile, 1000); addEventListener('pagehide', saveProfile); addEventListener('beforeunload', saveProfile);
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
  try { renderer.xr.setFramebufferScaleFactor(S.vrRes || 1); } catch { }
  const p = vr.enter(); // must start inside the click
  p.then(() => {
    if (mode === 'menu') startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name);
    if (paused) resume();
  }).catch(err => toast(window.top !== window ? 'VR is blocked in this embedded view. Open the game in its own tab to play in VR.' : 'Could not start VR: ' + (err && err.message || err), 5000));
}
vr.onStart = () => { sun.castShadow = false; player.noLean = true; vdEff = Math.min(vdEff, viewCap()); world.setViewDist(viewCap()); renderSettings(); };
vr.onEnd = () => { sun.castShadow = true; player.noLean = false; world.setViewDist(S.viewDist); camera.near = 0.3; camera.updateProjectionMatrix(); if (vr.rig.parent) vr.rig.parent.remove(vr.rig); renderSettings(); resize(); };
function renderSettings() {
  const tog = (k, label) => `<div class="set"><label>${label}</label><button class="toggle" data-tog="${k}" aria-pressed="${!!S[k]}" aria-label="${label}"></button></div>`;
  const rng = (k, label) => `<div class="set"><label>${label}</label><input type="range" min="0" max="1" step="0.05" value="${S[k]}" data-rng="${k}" aria-label="${label}"></div>`;
  const viewRow = () => { const v = S.viewDist, txt = S.units === 'kmh' ? `${v} m` : `${Math.round(v * 3.281 / 10) * 10} ft`, now = Math.round(vdEff);
    return `<div class="set"><label>Draw distance · <b data-vd-label>${txt}</b>${S.viewAuto && now < v - 10 ? ` <small>(now ${S.units === 'kmh' ? now + ' m' : Math.round(now * 3.281) + ' ft'} to keep it smooth)</small>` : ''}</label><input type="range" min="200" max="1400" step="20" value="${v}" data-vd aria-label="Draw distance"></div>`; };
  const resRows = () => {
    const ft = v => S.units === 'kmh' ? `${v} m` : `${Math.round(v * 3.281 / 10) * 10} ft`;
    return `<div class="set"><label>Screen resolution · <b data-res-label="res">${Math.round(S.res * 100)}%</b><small class="sub">Lower = faster on phones and laptops</small></label><input type="range" min="0.5" max="1" step="0.05" value="${S.res}" data-res="res" aria-label="Screen resolution"></div>`
      + `<div class="set"><label>VR resolution · <b data-res-label="vrRes">${Math.round(S.vrRes * 100)}%</b><small class="sub">Meta Quest: 100% is the headset's normal sharpness. Lower it if VR stutters, raise it for crisper text. Applies when you enter VR</small></label><input type="range" min="0.5" max="1.2" step="0.05" value="${S.vrRes}" data-res="vrRes" aria-label="VR resolution"></div>`
      + `<div class="set"><label>VR draw distance · <b data-res-label="vrDist">${ft(S.vrDist)}</b><small class="sub">How far you see in VR (never more than the draw distance above)</small></label><input type="range" min="200" max="1400" step="50" value="${S.vrDist}" data-res="vrDist" aria-label="VR draw distance"></div>`;
  };
  const seg = (k, label, opts) => `<div class="set"><label>${label}</label><div class="seg">${opts.map(([v, t]) => `<button data-seg="${k}" data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
  const padRow = () => { try { pad.pick(false); } catch { } const id = pad.gp ? pad.id.replace(/\(.*?\)/g, '').trim().slice(0, 40) || 'Gamepad' : '';
    return `<div class="set"><label>Controller · ${id ? `<b>${id.replace(/[<>&"]/g, '')}</b> (${pad.custom ? 'your layout' : pad.std ? 'recognised' : 'auto-detected'})` : 'none connected (press a button on it)'}</label><div class="seg"><button data-padsetup>Set up controller</button>${pad.custom ? '<button data-padreset>Reset</button>' : ''}</div></div>`; };
  const fedRow = () => `<div class="set"><label>Federation progress · ${fed ? fed.count : 0} ${fed && fed.count === 1 ? 'town' : 'towns'} liberated</label><div class="seg"><button data-fedlog>Liberation Log</button><button class="danger" data-resetfed>Reset</button></div></div>`;
  const storyRow = () => `<div class="set"><label>Story progress · ${Math.min(progress.unlocked, LEVELS.length)} of ${LEVELS.length} races unlocked</label><button class="danger" data-resetstory>Reset</button></div>`;
  $$('[data-settings]').forEach(el => {
    el.innerHTML = vrRow() + padRow() + tog('music', 'Music') + rng('master', 'Master volume') + rng('musicVol', 'Music volume') + rng('sfx', 'Effects volume') + rng('windVol', 'Wind volume') + rng('waterVol', 'Water volume') + rng('rainVol', 'Rain volume')
      + seg('units', 'Speed units', [['kmh', 'km/h'], ['mph', 'mph']]) + seg('cam', 'Camera', [[0, 'Chase'], [1, 'Far'], [2, 'Hood'], [3, 'Cockpit']])
      + seg('handLook', 'VR hands', HAND_LOOKS.map(l => [l[0], l[1]])) + tog('mirror', 'Working rear-view mirror (cockpit / VR)') + seg('quality', 'Graphics', [['low', 'Fast'], ['high', 'Pretty']]) + seg('fx', 'Visual filter', [['cinematic', 'Cinematic'], ['vivid', 'Vivid'], ['off', 'Off']]) + viewRow() + resRows() + tog('viewAuto', 'Auto draw distance: pulls it in when the frame rate drops (great for flying)') + seg('timeMode', `Time of day · ${daynight ? clockText(daynight.t) : '--:--'}`, [['game', '10 min day/night'], ['real', 'Real time']]) + (weather ? seg('weather', `Weather · ${escapeHtml(weather.describe(S.weather))}`, [['real', 'Real (live)'], ['off', 'Off'], ['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Storm'], ['snow', 'Snow'], ['fog', 'Fog']]) : '') + seg('season', `Seasons · ${escapeHtml(seasons.name(S.season))}`, [['real', 'Real (live)'], ['off', 'Off'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']]) + seg('headlights', 'Headlights', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]) + tog('autoCruise', 'Auto drive holds its own speed (cruise control). Off = you control speed with gas and brake') + tog('infNitro', 'Unlimited nitrous (World Drive and multiplayer)') + tog('infGas', 'Unlimited gas (World Drive and multiplayer)') + tog('infHealth', 'Unlimited health for all players (World Drive and multiplayer; the host\'s setting covers everyone)') + tog('flyCars', 'Cheat: flying cars (World Drive and multiplayer)') + tog('waterDrive', 'Cheat: drive on water (World Drive and multiplayer)') + tog('livePlanes', 'Live 747s: real Boeing 747s flying right now pass over World Drive (live flight data from airplanes.live and adsb.lol). Shoot one to tag it for +747') + tog('npcPlanes', 'NPC 747s whenever there is no live flight data, or Live 747s is off (made-up flights you can still tag)') + tog('teleportCost', `Teleporting costs ${TELEPORT_COST.toLocaleString()} points (off: teleport anywhere for free)`) + tog('police', 'Police: crimes earn a wanted level (up to five stars) and cops come after you') + tog('policePenalty', 'Lose 1,000 points when your car is destroyed (and 250 when you get busted)') + tog('clouds', 'Clouds') + tog('unlockAll', 'Unlock all story races') + storyRow() + fedRow();
    el.querySelectorAll('[data-resetstory]').forEach(b => b.onclick = () => {
      // two taps, so it can't happen by accident
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to reset'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Reset'; } }, 3000); return; }
      progress.unlocked = 1; progress.best = {}; saveProgress(); toast('Story progress reset'); Audio.click(); renderSettings();
    });
    el.querySelectorAll('[data-resetfed]').forEach(b => b.onclick = () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to reset'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Reset'; } }, 3000); return; }
      try { fed && fed.resetProgress(); } catch { } syncFedUi(); toast('Federation progress reset: every town has its carrier back', 2600, 'fed'); Audio.click(); renderSettings();
    });
    el.querySelectorAll('[data-fedlog]').forEach(b => b.onclick = () => { Audio.click(); fed && fed.open(); });
    el.querySelectorAll('[data-res]').forEach(r => { r.oninput = () => { const k = r.dataset.res; S[k] = +r.value; const l = el.querySelector(`[data-res-label="${k}"]`); if (l) l.textContent = k === 'vrDist' ? (S.units === 'kmh' ? `${S.vrDist} m` : `${Math.round(S.vrDist * 3.281 / 10) * 10} ft`) : `${Math.round(S[k] * 100)}%`; if (k === 'res') applyQuality(); if (k === 'vrDist' && vr.presenting) { world.setViewDist(viewCap()); vdEff = Math.min(vdEff, viewCap()); } }; r.onchange = saveRes; });
    el.querySelectorAll('[data-padsetup]').forEach(b => b.onclick = () => { pad.pick(true); if (!pad.gp) { toast('🎮 Press any button on the controller first', 2200); return; } pad.startWizard(ok => { toast(ok ? '🎮 Controller saved' : '🎮 Set-up cancelled', 2000); renderSettings(); }); });
    el.querySelectorAll('[data-padreset]').forEach(b => b.onclick = () => { pad.forget(); toast('🎮 Back to the automatic layout', 2000); renderSettings(); });
    el.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => enterVR());
    el.querySelectorAll('[data-vrtab]').forEach(b => b.onclick = () => window.open(location.href, '_blank'));
    el.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { const k = b.dataset.tog; S[k] = !S[k]; if (k === 'music') { Audio.init(); Audio.setMusic(S.music); } if (k === 'mirror') { try { localStorage.setItem('osm.mirror', S.mirror ? '1' : '0'); } catch { } } Audio.click(); renderSettings(); if (k === 'infNitro') updateNitroHud(); if (k === 'viewAuto') { vdEff = S.viewDist; try { localStorage.setItem('osm.viewDist', JSON.stringify({ d: S.viewDist, a: S.viewAuto })); } catch { } } if (k === 'infHealth') { if (S.infHealth) player.hp = HP_MAX; toast(S.infHealth ? (net.role === 'guest' ? 'Unlimited health on for you — the host decides for everyone else' : 'Unlimited health on' + (net.role === 'host' ? ' for all players' : '')) : 'Unlimited health off', 3000); } if (k === 'waterDrive') waterDriveChanged(); if (k === 'npcPlanes') { try { localStorage.setItem('osm.npcplanes', S.npcPlanes ? '1' : '0'); } catch { } } if (k === 'livePlanes') { try { localStorage.setItem('osm.planes', S.livePlanes ? '1' : '0'); } catch { } } if (k === 'teleportCost') { try { localStorage.setItem('osm.tpcost', S.teleportCost ? '1' : '0'); } catch { } syncTeleportUi(); } if (k === 'police' || k === 'policePenalty') { try { localStorage.setItem('osm.police', JSON.stringify({ on: S.police, pen: S.policePenalty })); } catch { } if (k === 'police' && !S.police) police.clear(); } if (k === 'flyCars') { W.flightMode = S[k] ? true : (wingsActive() ? W.flightMode : false); if (!S[k] && player.fly && !wingsActive()) { player.fly = null; player.air = true; } toast(S[k] ? 'Flying cars on — get up to speed and hold K (or Num 2) to pull up' : 'Flying cars off', 3200); } });
    el.querySelectorAll('[data-vd]').forEach(r => { r.oninput = () => { S.viewDist = +r.value; vdEff = S.viewDist; world.setViewDist(S.viewDist); W.vdT = 0; envT = 0; const l = el.querySelector('[data-vd-label]'); if (l) l.textContent = S.units === 'kmh' ? `${S.viewDist} m` : `${Math.round(S.viewDist * 3.281 / 10) * 10} ft`; }; r.onchange = () => { try { localStorage.setItem('osm.viewDist', JSON.stringify({ d: S.viewDist, a: S.viewAuto })); } catch { } }; });
    el.querySelectorAll('[data-rng]').forEach(r => r.oninput = () => { const k = r.dataset.rng; S[k] = +r.value; const AK = { musicVol: 'music', windVol: 'wind', waterVol: 'water', rainVol: 'rain' }; Audio.setVolume(AK[k] || k, S[k]); if (k === 'windVol' || k === 'waterVol' || k === 'rainVol') { try { localStorage.setItem('osm.amb2', JSON.stringify({ wind: S.windVol, water: S.waterVol, rain: S.rainVol })); } catch { } } });
    el.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { const k = b.dataset.seg; S[k] = typeof S[k] === 'number' ? +b.dataset.v : b.dataset.v; if (k === 'quality') applyQuality(); if (k === 'handLook') { try { setHandLook(S.handLook); localStorage.setItem('osm.handlook', S.handLook); } catch { } } if (k === 'weather') { try { localStorage.setItem('osm.weather', S.weather); } catch { } envT = 0; } if (k === 'season') { try { localStorage.setItem('osm.season', S.season); } catch { } } if (k === 'fx') { try { localStorage.setItem('osm.fx', S.fx); } catch { } if (S.fx === 'off' && post) post.dispose(); } $('#hUnit').textContent = S.units === 'kmh' ? 'km/h' : 'mph'; Audio.click(); renderSettings(); });
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
    <span><kbd>E</kbd></span><span>Fire your weapon (buy them at Blick's Shooting Goods, place them in your garage)</span>
    <span><kbd>F</kbd></span><span>Use a gas can when you're running low (50 points, or free roadside help when you're empty and broke)</span>
    <span><kbd>B</kbd></span><span>Build a bridge straight ahead (World Drive, costs ${BRIDGE_COST} points)</span>
    <span><kbd>H</kbd></span><span>Build your own garage (World Drive, ${GARAGE_COST.toLocaleString()} points): the camera goes overhead, tap a spot to highlight it, tap it again to build</span>
    <span><kbd>T</kbd></span><span>Flight mode on or off (needs fold-out wings from your garage's Wings tab, or the flying cars cheat). Wings swing out; turn it off in the air to glide down</span>
    <span><kbd>K</kbd><kbd>Num 2</kbd></span><span>Flight mode: pull the nose up (take off at speed)</span>
    <span><kbd>O</kbd></span><span>Horn</span>
    <span><kbd>J</kbd></span><span>Barrel roll (garage upgrade): hop and flip over on the ground, or roll while flying</span>
    <span><kbd>Y</kbd></span><span>Floaties: let the air out or pump them back up (deflated floaties don't float)</span>
    <span><kbd>I</kbd><kbd>Num 8</kbd></span><span>Flight mode: push the nose down. In the air W is thrust, S is air brake, A/D bank and turn</span>
    <span><kbd>X</kbd></span><span>Clear the GPS route (set one by clicking the map)</span>
    <span><kbd>Esc</kbd><kbd>Tab</kbd></span><span>Game menu</span>
  </div><p class="note">On touch screens, on-screen pedals and steering appear during play (they hide while you use a gamepad; tap the screen to bring them back).</p>
  <h4 class="vrh">Gamepad / handhelds (Xbox, PlayStation, AYN Thor, Odin, Retroid, Steam Deck…)</h4><div class="keys">
    <span><kbd>L stick</kbd></span><span>Steer</span>
    <span><kbd>RT</kbd> <kbd>LT</kbd></span><span>Gas · brake / reverse (press harder to go faster)</span>
    <span><kbd>A</kbd> <kbd>B</kbd></span><span>Nitrous · handbrake (drift)</span>
    <span><kbd>X</kbd></span><span>Fire your weapon</span>
    <span><kbd>Y</kbd></span><span>Change camera (hold: headlights)</span>
    <span><kbd>LB</kbd> <kbd>RB</kbd></span><span>Barrel roll · front flip (garage upgrades)</span>
    <span><kbd>L3</kbd> <kbd>R3</kbd></span><span>Jump · two-wheeler (garage upgrades)</span>
    <span><kbd>D-pad</kbd></span><span>↑ horn (or Store 32 when you're there) · ↓ dive · ← reset the car · → flight mode</span>
    <span><kbd>R stick</kbd></span><span>Flying: nose up / down · Submarine: rise / sink</span>
    <span><kbd>Start</kbd> <kbd>View</kbd></span><span>Pause · map (hold View to hide or show the on-screen button guide)</span>
    <span><kbd>Menus</kbd></span><span>D-pad or left stick to move between buttons, A to press, B to go back, LB / RB to switch tabs</span>
  </div><p class="note">If the triggers or buttons do the wrong things, go to Settings › Set up controller and press each button when asked. It's saved for that controller.</p>
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
    <span><kbd>Hand</kbd></span><span>In the cockpit, smack the big red FIRE button under the map screen (cars with a weapon), and flick the toggle switches with your hand: FLIGHT (either side of the map screen) with a WINGS button under it to extend or retract them, and AUTO, LIGHTS, BOOST 2 and FLOATS (deflate / inflate floaties) on the console. When the car can fly, the gear lever becomes a flight stick: squeeze your grip on it, pull back to climb, push forward to dive. Passengers can fire the driver's gun and flick FLIGHT, LIGHTS, WINGS and FLOATS too</span>
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
    let len = ''; try { len = distTxt(trackInfo(lv).length) + ' · '; } catch { }
    b.innerHTML = `<canvas width="320" height="200"></canvas>${locked ? '<div class="lock">LOCKED</div>' : ''}${best ? `<span class="medal" style="color:${best.place === 1 ? 'var(--gold)' : '#fff'}">P${best.place}</span>` : ''}<div class="info"><div class="num">RACE ${i + 1}</div><h4>${lv.name}</h4><p class="sub">${lv.place} · ${len}${lv.laps} laps · ${lv.rivals + 1} cars</p></div>`;
    thumb(b.querySelector('canvas'), lv, locked);
    b.onclick = () => { Audio.click(); openBrief(i); };
    grid.append(b);
  });
}
// distances for the race menu, in the player's units
function distTxt(m) { return S.units === 'kmh' ? (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m') : (m / 1609.34).toFixed(2) + ' mi'; }
function shortTxt(m) { return S.units === 'kmh' ? Math.round(m) + ' m' : Math.round(m * 3.281) + ' ft'; }
function openBrief(i) {
  level = LEVELS[i];
  $('#bChapter').textContent = `Race ${i + 1} of ${LEVELS.length}`; $('#bName').textContent = level.name; $('#bPlace').textContent = level.place;
  $('#bStory').textContent = level.scenery || '';
  const goal = level.goal === 1 ? '1st place' : 'Top 3', I = trackInfo(level), D = S.storyDiff || 'normal';
  const tile = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  $('#bStats').innerHTML = tile('Lap length', distTxt(I.length)) + tile('Laps', level.laps) + tile('Race distance', distTxt(I.length * level.laps))
    + tile('Corners', I.corners + (I.hairpins ? ` <small class="inl">${I.hairpins} tight</small>` : '')) + tile('Tightest bend', shortTxt(I.minRadius)) + tile('Longest straight', shortTxt(I.straight))
    + tile('Height range', shortTxt(I.relief)) + tile('Grid', `${level.rivals + 1} cars`) + tile('Goal', goal);
  $('#bDiff').innerHTML = `<small>Rivals</small>` + Object.entries(DIFFICULTY).map(([k, d]) => `<button data-sd="${k}" class="${k === D ? 'on' : ''}">${d.label}</button>`).join('');
  $('#bDiff').querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { S.storyDiff = b.dataset.sd; try { localStorage.setItem('osm.storyDiff', S.storyDiff); } catch { } Audio.click(); openBrief(i); });
  show('brief');
}
$('#bStart').onclick = () => { Audio.init(); Audio.setMusic(S.music); startStoryLoading(level); };

// ---------- mode management ----------
// how boxed-in the engine sounds: walls of buildings close by, or a bridge deck overhead (checked twice a second)
function enclosure(dt) {
  if ((W.encT = (W.encT || 0) - dt) > 0) return W.enc || 0; W.encT = 0.5;
  let k = 0;
  try {
    if (player.fly || W.onWater) return (W.enc = 0);
    const cells = world.bldCells, py = player.y || 0;
    if (cells && cells.size) {
      const ci = Math.floor(player.x / 24), cj = Math.floor(player.z / 24), seen = new Set(); let near = 0;
      for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) for (const b of cells.get(i + ',' + j) || []) {
        if (seen.has(b)) continue; seen.add(b);
        const dx = Math.max(b.x0 - player.x, 0, player.x - b.x1), dz = Math.max(b.z0 - player.z, 0, player.z - b.z1), d = Math.hypot(dx, dz);
        if (d < 30 && Number.isFinite(b.top) && b.top - py > 6) near += (1 - d / 30) * Math.min(1, (b.top - py) / 30);
      }
      k = Math.min(0.75, near / 5);
    }
    // a bridge or overpass deck just above
    for (const sg of world.nearbySegs ? world.nearbySegs(player.x, player.z) : []) if (sg.bridge && sg.y0 != null) {
      const ax = sg.x1 - sg.x0, az = sg.z1 - sg.z0, l2 = ax * ax + az * az || 1, u = Math.max(0, Math.min(1, ((player.x - sg.x0) * ax + (player.z - sg.z0) * az) / l2));
      const d = Math.hypot(player.x - sg.x0 - ax * u, player.z - sg.z0 - az * u), y = sg.y0 + (sg.y1 - sg.y0) * u;
      if (d < sg.hw + 1 && y > py + 3 && y < py + 14) { k = 1; break; }
    }
  } catch { }
  return (W.enc = k);
}
// ---------- tyre marks, smoke, dust and spray (skids.js) ----------
let tyres = null; try { tyres = new TyreFX(scene); } catch (e) { console.warn('[overpass] tyre effects off:', e); }
function tyreStep(dt) {
  if (!tyres || dt <= 0 || ride?.riding) return;
  try {
    const p = player, inp = p.input, sp = Math.abs(p.speed);
    // how hard the tyres are working: sliding sideways, locking up under hard braking, or spinning away from a standstill
    let slide = Math.max(0, Math.min(1, (p.slip - 3) / 7));
    if (inp.handbrake && sp > 5) slide = Math.max(slide, 0.7);
    if (inp.brake > 0.75 && sp > 14) slide = Math.max(slide, 0.45);
    if (inp.throttle > 0.9 && sp < 9 && sp > 0.5 && (p.prevAccel || 0) > 12) slide = Math.max(slide, 0.5);
    const story = mode === 'story' && track, ground = story ? (x, z) => track.heightAt(x, z) : (x, z) => world.heightAt(x, z);
    const sand = story ? track.theme.props === 'cacti' : false;
    tyres.update(dt, p, { ground, slide, offroad: !!p.offroad, sand, wet: mode === 'world' ? (W.wetK || 0) : 0, onWater: !!W.onWater, air: !!(p.air || p.fly), low: S.quality === 'low' });
  } catch (e) { if (!W.tyreFail) { W.tyreFail = true; console.error('[overpass] tyre effects:', e); } }
}
function clearMode() {
  try { fed && fed.clear(); } catch { }
  endSink(); player.y = 0; player.vy = 0; player.pitch = player.roll = 0; player.air = false;
  if (race) { race.dispose(); race = null; }
  if (attract) { attract.dispose(); attract = null; }
  if (track) { track.dispose(scene); track = null; }
  world.setVisible(false); world.clear(); world.mw = null; if (modelWorld) { modelWorld.dispose(); modelWorld = null; } W.modelMap = null;
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  clearTraffic(); police.clear(); clearPedestrians(); spray.clear(); wake.clear(); lens && lens.clear(); try { iceCut && iceCut.clear(); } catch { } boats.clear(); buoys.clear(); deer && deer.clear(); birds && birds.clear(); squirrels && squirrels.clear(); seaLife && seaLife.clear(); seaMines && seaMines.clear(); W.minesDirty = true; W.onWater = W.wasWet = false;
  for (const r of W.remotes.values()) scene.remove(r.car.mesh); W.remotes.clear();
  if (!player.mesh.parent) scene.add(player.mesh);
  ground.visible = true; paused = false; $('#pause').hidden = true; try { tyres && tyres.clear(); } catch { }
  if (W.photo) { W.photo = null; document.body.classList.remove('photo'); $('#photoUi').hidden = true; player.mesh.visible = true; }
  hideLoading(); W.mpMap = null; if (W.dive) endDive(true);
}
function startMenu() {
  clearMode(); mode = 'menu';
  ride?.reset();
  if (net.active) net.leave();
  const lv = LEVELS[0]; track = new Track(lv, scene, S.quality); applyEnv(track.theme, 150, 1400); storyScene();
  attract = new Race(track, { ...lv, rivals: 2, laps: 99, skill: 0.85 }, player, scene);
  attract.started = true; attract.countdown = 0; attract.player.ai = true; attract.player.lane = 0; attract.player.skill = 0.8;
  player.maxSpeed = 40; player.infBoost = false; attract.onHit = null;
  $('#hud').hidden = true; show('menu');
}
// story tracks have their own landscape now: hide the flat ground plane, fresh grass for the new track, lit windows at night
let storyGrass = null;
function storyScene() {
  ground.visible = !(track && track.land);
  try { if (track && track.land && GRS.GrassField && /pines|palms/.test(track.land.kind) && track.land.kind !== 'snowpines') { if (!storyGrass) storyGrass = new GRS.GrassField(scene, track.land.grassWorld()); else storyGrass.world = track.land.grassWorld(); storyGrass.clear(); storyGrass.on = true; } else if (storyGrass) { storyGrass.clear(); storyGrass.on = false; } } catch (e) { console.error('[overpass] story grass off:', e); storyGrass = null; }
  try { setWindowGlow(track && track.theme.night ? 1 : 0); } catch { }
}
function startStory(lv) {
  clearMode(); mode = 'story'; level = lv; player.maxSpeed = 52; player.boost = 1; player.infBoost = false;
  track = new Track(lv, scene, S.quality); applyEnv(track.theme, track.theme.night ? 140 : 220, track.theme.night ? 750 : (track.theme.props === 'snowpines' ? 1900 : 1500)); storyScene();
  race = new Race(track, lv, player, scene, S.storyDiff || 'normal');
  race.racers.forEach(r => r.car.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }));
  race.onHit = p => { Audio.thud(p / 8); camShake = Math.min(0.6, p * 0.03); };
  race.onLap = r => {
    Audio.chime(2); const left = lv.laps - r.lap; if (left === 1) hudMsg('FINAL LAP'); else if (left > 1) hudMsg(`LAP ${r.lap + 1}`);
    // the lap time, big in the middle of the screen (with a BEST tag on a personal best)
    const el = $('#lapPop'); $('#lapPopL').textContent = `LAP ${r.lap}`; $('#lapPopT').textContent = fmt(r.lastLap); $('#lapPopB').hidden = !(r.lastLap <= r.bestLap && r.lap > 1);
    el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(W.lapPopT); W.lapPopT = setTimeout(() => { el.hidden = true; }, 2700);
  };
  W.lastPos = 0;
  finishTimer = 0; lastCount = -1; goTimer = 0;
  setHud('story'); show('none');
  const f = [Math.sin(player.yaw), Math.cos(player.yaw)];
  camera.position.set(player.x + f[0] * 18 + 10, 9, player.z + f[1] * 18);
}
function startWorld(lat, lon, name = '') {
  ride?.reset();
  clearMode(); mode = 'world'; player.maxSpeed = 46; player.boost = 1; W.poiT = new Map();
  applyEnv(WORLD_ENV, 140, 620); ground.visible = false;
  world.setVisible(true); world.setOrigin(lat, lon); W.originName = name; try { grass.clear(); } catch { }
  clearGps(false); player.fly = null;
  try { scrapbook && scrapbook.reset(); } catch { } try { fed && fed.clear(); } catch { }
  W.score = 0; W.dist = 0; W.combo = 0; player.hp = HP_MAX; W.wreck = 0; hurtFlash = 0; player.fuel = 1; player.power = 1; W.fuelWarn = 0; W.canT = 0;
  setHud('world'); beginSpawn(); show('none');
}
function beginSpawn() {
  endSink(); clearTraffic(); police.clear(); clearPedestrians(); spray.clear(); wake.clear(); lens && lens.clear(); boats.clear(); buoys.clear(); deer && deer.clear(); birds && birds.clear(); squirrels && squirrels.clear(); seaLife && seaLife.clear(); seaMines && seaMines.clear(); W.minesDirty = true;
  W.spawning = true; W.spawnT = 0; player.place(0, 0, 0, 0); player.pitch = player.roll = 0; player.vx = player.vz = 0;
  W.orbs.forEach(o => scene.remove(o.mesh)); W.orbs = [];
  $('#wLoading').hidden = false; $('#wLoadTxt').textContent = 'Loading streets from OpenStreetMap…';
  showLoading('LOADING WORLD DRIVE', W.originName || 'Somewhere on Earth', 'Streets, buildings and terrain from OpenStreetMap');
  camera.position.set(30, 60, 30);
}
world.onStatus = s => { if (W.spawning && s) $('#wLoadTxt').textContent = s; };
function setHud(kind) {
  $('#hud').hidden = false; $('#hud').classList.toggle('hud-world', kind === 'world');
  $('#hPos').hidden = $('#hLap').hidden = kind !== 'story';
  $('#hScore').hidden = $('#hDist').hidden = kind !== 'world'; $('#hStreet').hidden = true; W.street = ''; W.streetOff = 0;
  $('#wrong').hidden = true; $('#wLoading').hidden = true; $('#countdown').textContent = ''; $('#bridgeBtn').hidden = kind !== 'world';
  $('#hUnit').textContent = S.units === 'kmh' ? 'km/h' : 'mph';
  updateNitroHud(kind);
  updateMpBadge();
}

// ---------- results ----------
function showResults() {
  if (level.custom) return showCustomResults();
  const r = race.player, place = r.place || r.pos || race.racers.length, goal = level.goal || 3, won = place <= goal, idx = level.id;
  const prev = progress.best[idx]; if (!prev || place < prev.place || (place === prev.place && r.finishTime < prev.time)) progress.best[idx] = { place, time: r.finishTime };
  if (won && progress.unlocked < idx + 2) progress.unlocked = Math.min(LEVELS.length, idx + 2);
  saveProgress();
  const last = idx === LEVELS.length - 1;
  $('#rEyebrow').textContent = `${level.name} · ${level.place}`;
  $('#rTitle').textContent = won ? (last ? 'Story mode complete' : place === 1 ? 'Victory' : `Podium — P${place}`) : `P${place} — not enough`;
  const lead = race.ranked[0], gap = lead && lead !== r && lead.finished && r.finished ? ` · ${(r.finishTime - lead.finishTime).toFixed(1)} s behind the winner` : '';
  const stat = `Race time ${fmt(r.finishTime)} · best lap ${fmt(r.bestLap)}${gap}.`;
  $('#rSub').textContent = won ? (last ? `${stat} Every race won. Try Hard rivals for a tougher run.` : `${stat} Next race unlocked.`) : `${stat} You need ${goal === 1 ? 'first place' : 'a top-3 finish'} to move on.`;
  const rows = race.ranked.map((o, i) => `<li class="${o === r ? 'me' : ''}"><span class="p">${i + 1}</span>${o === r ? avatarHtml(S.avatar, S.name || 'You', o.car.mesh.userData.paint.color.getStyle(), 22) : `<i class="dot" style="background:${o.car.mesh.userData.paint.color.getStyle()}"></i>`}<span class="n">${o === r && S.name ? escapeHtml(S.name) : o.name}</span><span class="t">${o.finished ? fmt(o.finishTime) : 'running'}</span></li>`).join('');
  $('#rTable').innerHTML = rows;
  $('#rNext').hidden = !won || last; $('#rNext').textContent = 'Next race';
  $('#hud').hidden = true; show('results');
  won ? Audio.chime(5) : Audio.beep(false);
}
// results for a custom track: just the race, no story progress
function showCustomResults() {
  const r = race.player, place = r.place || r.pos || race.racers.length, n = race.racers.length;
  $('#rEyebrow').textContent = `${level.name} · ${level.place} · custom track`;
  $('#rTitle').textContent = n === 1 ? 'Finished' : place === 1 ? 'Victory' : `P${place} of ${n}`;
  const lead = race.ranked[0], gap = lead && lead !== r && lead.finished && r.finished ? ` · ${(r.finishTime - lead.finishTime).toFixed(1)} s behind the winner` : '';
  $('#rSub').textContent = `Race time ${fmt(r.finishTime)} · best lap ${fmt(r.bestLap)}${gap}.`;
  $('#rTable').innerHTML = race.ranked.map((o, i) => `<li class="${o === r ? 'me' : ''}"><span class="p">${i + 1}</span>${escapeHtml(o.name)}<span class="t">${o.finished ? fmt(o.finishTime) : '—'}</span></li>`).join('');
  $('#rNext').hidden = false; $('#rNext').textContent = 'Edit track';
  $('#hud').hidden = true; show('results'); place === 1 ? Audio.chime(5) : Audio.chime(2);
}
$('#rRetry').onclick = () => startStoryLoading(level);
$('#rLevels').onclick = () => { const c = level && level.custom; startMenu(); show(c ? 'maps' : 'levels'); };
$('#rNext').onclick = () => { if (level && level.custom) { const m = loadMaps().find(x => x.id === level.map.id) || level.map; startMenu(); openEditor(m); return; } startMenu(); openBrief(level.id + 1); };

// ---------- car health & damage ----------
const HP_MAX = 100; player.hp = HP_MAX;
const invincible = () => S.infHealth || (net.role === 'guest' && net.hostInv);
let hurtFlash = 0, hurtCd = 0;
function hurt(amount) {
  if (mode !== 'world' || W.spawning || paused || W.wreck > 0 || amount < 0.5 || ride?.riding) return;
  if (invincible()) { hurtFlash = Math.max(hurtFlash, 0.15); return; }
  if (hurtCd > 0) return; hurtCd = 0.25; amount *= (player.stats && player.stats.armor) || 1; // armoured custom frame
  player.hp = Math.max(0, (player.hp ?? HP_MAX) - amount);
  hurtFlash = Math.max(hurtFlash, Math.min(0.9, amount / 30));
  if (player.hp <= 0) wreckCar();
  else if (amount >= 14) hudMsg(player.hp < 25 ? 'CAR IS SMOKING — BE CAREFUL' : 'HEAVY DAMAGE', 900);
}
// flew or drove into a bird: a thump, feathers everywhere, a little damage (more the faster you hit it)
function birdHit(h) {
  hurt(Math.min(30, 3 + h.speed * 0.32)); camShake = Math.max(camShake, Math.min(0.35, 0.08 + h.speed / 120));
  try { Audio.birdStrike && Audio.birdStrike(1); } catch { } try { if (vr.presenting) vr.pulse(0.6, 90); } catch { }
  hudMsg(h.kind === 'gull' ? 'GULL STRIKE!' : 'BIRD STRIKE!', 1100);
}
// sea life: a kill (shot or rammed) scores for sharks, whales and squid; dolphins, seals and penguins earn nothing
function seaKill(r) {
  if (r.pts > 0) { W.score += r.pts; hudMsg(`${r.name} · +${r.pts}`, 1300); try { Audio.chime(3); } catch { } }
  else hudMsg(`${r.name}… no points for that`, 1600);
}
function seaEvent(e) {
  if (e.bite) { hurt(e.bite); camShake = Math.max(camShake, 0.3); hudMsg('SHARK BITE!', 1100); try { Audio.thud(0.6); if (vr.presenting) vr.pulse(0.8, 150); } catch { } }
  if (e.bump) { hurt(Math.min(30, 4 + e.bump * 1.1)); camShake = Math.max(camShake, Math.min(0.5, 0.15 + e.bump / 30)); try { Audio.thud(Math.min(1.5, 0.4 + e.bump / 15)); } catch { } if (W.dive) W.dive.sp *= -0.3; else { player.vx *= 0.5; player.vz *= 0.5; } hudMsg(e.kind === 'whale' ? 'YOU HIT A WHALE!' : e.kind === 'giant' ? 'GIANT SQUID!' : 'SHARK!', 1100); }
  if (e.ram) { try { Audio.squish && Audio.squish(0.8); } catch { } seaKill(e.ram); }
}
// ran over a squirrel: no damage, just a squish
function squirrelHit(h) {
  try { Audio.squish && Audio.squish(1); } catch { } try { if (vr.presenting) vr.pulse(0.2, 40); } catch { }
  W.sqN = (W.sqN || 0) + 1; hudMsg(W.sqN > 1 ? `SQUIRREL! · ${W.sqN} flattened` : 'SQUIRREL!', 1000);
}
// hit a deer: they're heavy, so it hurts the car and knocks some speed off
function deerHit(h) {
  hurt(Math.min(28, 6 + h.speed * 0.55)); camShake = Math.max(camShake, Math.min(0.5, 0.15 + h.speed / 60));
  const k = Math.max(0.6, 1 - h.speed / 90); player.vx *= k; player.vz *= k;
  try { Audio.thud(Math.min(1, 0.5 + h.speed / 40)); } catch { } hudMsg('HIT A DEER!', 1200);
}
// crash into something solid at `speed` m/s; share lets the rammer take less than the rammed (car vs car)
function crashDamage(speed, share = 1, mult = 1) { if (speed > 5) hurt(Math.min(45, (speed - 5) * 1.1) * share * mult); }
function fallDamage(impact, pitch = 0) { if (impact > 14 || pitch < -0.55) hurt(Math.min(40, Math.max(0, impact - 14) * 1.8 + (pitch < -0.55 ? 10 : 0))); }
function wreckCar() {
  if (W.wreck > 0) return;
  W.wreck = 3; W.combo = 0; camShake = 0.7; Audio.thud(3);
  try { Audio.boom && Audio.boom(1.8, 1); wfx && wfx.boom(new THREE.Vector3(player.x, (player.y || 0) + 1, player.z), 5); } catch { }
  const wanted = police.stars > 0; if (wanted) police.reset();
  const fine = mode === 'world' && S.policePenalty ? Math.min(W.score, 1000) : 0; W.score -= fine;
  hudMsg((wanted ? 'WASTED' : 'WRECKED') + (fine ? ` · −${fine.toLocaleString()}` : ''), 2800);
  if (autoDrive) setAutoDrive(false, true);
}
function updateHealth(dt) {
  try { setDamage(player, mode === 'world' ? (W.wreck > 0 ? 1 : 1 - (player.hp ?? HP_MAX) / HP_MAX) : 0); } catch (e) { if (!W.dmgFail) { W.dmgFail = true; console.warn('[overpass] damage look:', e); } }
  hurtCd -= dt; hurtFlash = Math.max(0, hurtFlash - dt * 1.6);
  if (mode !== 'world') W.wreck = 0;
  if (W.wreck > 0 && !paused) {
    W.wreck -= dt;
    if (W.wreck <= 0) { W.wreck = 0; player.hp = HP_MAX; resetCar(); hudMsg('CAR REPAIRED', 1400); Audio.chime(3); }
  }
  if (invincible()) player.hp = HP_MAX;
}
// smoke from the hood when badly damaged
const smoke = { parts: [], t: 0, geo: new THREE.SphereGeometry(0.5, 6, 5) };
function smokeStep(dt) {
  const hp = player.hp ?? HP_MAX, on = mode === 'world' && !W.spawning && !invincible() && hp < 40;
  if (on) {
    smoke.t -= dt;
    if (smoke.t <= 0 && smoke.parts.length < 28) {
      smoke.t = 0.05 + hp / 40 * 0.12 + (W.wreck > 0 ? -0.03 : 0);
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), m = new THREE.Mesh(smoke.geo, new THREE.MeshBasicMaterial({ color: W.wreck > 0 || hp < 15 ? '#222' : '#777', transparent: true, opacity: 0.55, depthWrite: false }));
      m.position.set(player.x + fx * 1.7 + (Math.random() - 0.5) * 0.6, (player.y || 0) + 1.1, player.z + fz * 1.7 + (Math.random() - 0.5) * 0.6); scene.add(m);
      smoke.parts.push({ m, age: 0, vx: player.vx * 0.5 + (Math.random() - 0.5) * 0.8, vz: player.vz * 0.5 + (Math.random() - 0.5) * 0.8 });
    }
  }
  for (let i = smoke.parts.length - 1; i >= 0; i--) {
    const q = smoke.parts[i]; q.age += dt; const k = q.age / 1.3;
    if (k >= 1) { scene.remove(q.m); q.m.material.dispose(); smoke.parts.splice(i, 1); continue; }
    q.m.position.x += q.vx * dt; q.m.position.z += q.vz * dt; q.m.position.y += dt * 2.2; q.m.scale.setScalar(0.5 + k * 2.2); q.m.material.opacity = 0.55 * (1 - k);
  }
}
function smokePuff(x, y, z, vx, vz, col) {
  if (smoke.parts.length >= 44) return;
  const m = new THREE.Mesh(smoke.geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false })); m.position.set(x, y, z); scene.add(m); smoke.parts.push({ m, age: 0, vx, vz });
}
function updateHealthHud() {
  const w = $('#hHpW'), on = mode === 'world'; if (w.hidden === on) w.hidden = !on;
  const f = on ? Math.max(0, Math.min(1, (player.hp ?? HP_MAX) / HP_MAX)) : 1, inf = invincible();
  $('#hHp').style.transform = `scaleX(${inf ? 1 : f})`; w.classList.toggle('inf', inf); w.classList.toggle('low', !inf && f < 0.25); w.classList.toggle('mid', !inf && f >= 0.25 && f < 0.5);
  $('#hurtFlash').style.opacity = hurtFlash > 0.01 ? String(Math.min(0.85, hurtFlash)) : '0';
}

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
// positions travel as lat/lon: World Drive uses the real map; custom maps use a flat grid around 0,0 (same on every device)
function latLonToStory(lat, lon) { const lat0 = level.lat, lon0 = level.lon, c = Math.cos(lat0 * Math.PI / 180); return [(lon - lon0) * c * 111320, -(lat - lat0) * 110540]; }
const projLL = (lat, lon) => W.mpMap && mode === 'story' ? latLonToStory(lat, lon) : world.proj(lat, lon);
const groundAt = (x, z, y) => W.mpMap && mode === 'story' && track ? track.heightAt(x, z) : world.groundY(x, z, y);
function updateRemotes(dt) {
  if (W.mpMap && mode === 'story') { if (!track) return; } else if (!world.lat0) return;
  for (const [id, pl] of net.players) {
    if (pl.lat == null) continue;
    let r = W.remotes.get(id);
    if (!r) {
      const c = new Car(pl.color, modelById(String(pl.model).split('+')[0]).id); c.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(c.mesh);
      const [x, z] = projLL(pl.lat, pl.lon); r = { car: c, x, z, yaw: pl.yaw, color: pl.color, model: c.model, tagKey: null }; W.remotes.set(id, r); c.place(x, z, pl.yaw);
    }
    if (r.color !== pl.color) { setPaint(r.car.mesh, pl.color); r.color = pl.color; r.tagKey = null; }
    if (pl.model && r.model !== pl.model) { r.car.setModel(modelById(String(pl.model).split('+')[0]).id); r.car.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; }); r.model = pl.model; }
    syncLooks(r.car, net.assets.get(id + '|glb'), net.assets.get(id + '|skin'), pl.color, false, net.lightsFor(id), net.assets.get(id + '|wh'));
    { const dl = net.driverFor(id), d = syncDriver(r.car.mesh, r.car.model, dl); try { petRemote(r, dl, id, dt); } catch { } if (d) { d.setParts(partsFor(id)); placeDriver(d, r.car.mesh, dl && dl.seat, ride?.riding?.id === id && S.cam === 3); if (d.steer === null) driverArms(d, 0); } }
    try { setFloaties(r.car.mesh, /\+f(\+|$)/.test(String(pl.model || ''))); setSubKit(r.car.mesh, /\+s$/.test(String(pl.model || ''))); } catch { }
    try { syncOrnaments(r.car.mesh, [0, 1, 2].map(i => validOrn(net.assets.get(id + '|o' + i))), dt); } catch { }
    try { WPN.syncWeapon && WPN.syncWeapon(r.car.mesh, net.weaponFor(id)); } catch { }
    const rhp = Math.round((pl.hp ?? 100) / 5) * 5, tk = pl.name + '|' + pl.color + '|' + (pl.av ? pl.av.length : 0) + '|' + rhp;
    if (r.tagKey !== tk && !r.tagBusy) {
      r.tagKey = tk; const apply = img => { const old = r.car.mesh.children.find(o => o.isSprite); if (old) { r.car.mesh.remove(old); old.material.map.dispose(); old.material.dispose(); } r.car.mesh.add(nameTag(pl.name, pl.color, img, rhp)); };
      if (pl.av && /^data:image\/(jpeg|png|webp);base64,/.test(pl.av)) { r.tagBusy = true; const im = new Image(); im.onload = () => { r.tagBusy = false; apply(im); }; im.onerror = () => { r.tagBusy = false; apply(null); }; im.src = pl.av; } else apply(null);
    }
    const [tx, tz] = projLL(pl.lat, pl.lon), age = (performance.now() - pl.t) / 1000;
    const f = [Math.sin(pl.yaw), Math.cos(pl.yaw)], ex = tx + f[0] * pl.speed * Math.min(age, 0.25), ez = tz + f[1] * pl.speed * Math.min(age, 0.25);
    const k = 1 - Math.exp(-dt * 10);
    if (Math.hypot(ex - r.x, ez - r.z) > 60) { r.x = ex; r.z = ez; } else { r.x += (ex - r.x) * k; r.z += (ez - r.z) * k; }
    let dy = pl.yaw - r.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; r.yaw += dy * k;
    r.car.x = r.x; r.car.z = r.z; r.car.yaw = r.yaw; r.alt = (r.alt || 0) + ((pl.h || 0) - (r.alt || 0)) * k; const gy = groundAt(r.x, r.z, r.alt > 1 ? null : r.car.y ?? null); r.car.y = gy + (r.alt < -0.5 ? r.alt : Math.max(0, r.alt)); // a friend's submarine can be below the surface
    r.car.pitch = pl.h > 0.5 ? (r.car.pitch || 0) + ((pl.pi || 0) - (r.car.pitch || 0)) * k : 0; r.car.roll = pl.h > 0.5 ? (r.car.roll || 0) + ((pl.ro || 0) - (r.car.roll || 0)) * k : 0; r.car.sync(dt, pl.speed, 0);
    r.car.mesh.visible = !pl.rd; // someone riding in another car isn't drawn separately
    // soft collision with player
    const dx = player.x - r.x, dz = player.z - r.z, d = Math.hypot(dx, dz);
    if (!pl.rd && !ride?.riding && (mode === 'world' || W.mpMap) && !paused && d < 3 && d > 0.01 && (player.y || 0) - (r.car.y || 0) < 1.55 && (player.y || 0) - (r.car.y || 0) > -2.5) {
      const nx = dx / d, nz = dz / d, rsp = pl.speed || 0, rvx = Math.sin(r.yaw) * rsp, rvz = Math.cos(r.yaw) * rsp;
      // closing speed between the two cars; whoever drives harder into the other takes less of the damage
      const closing = -((player.vx - rvx) * nx + (player.vz - rvz) * nz), a = Math.max(0, -(player.vx * nx + player.vz * nz)), b = Math.max(0, rvx * nx + rvz * nz);
      player.x += nx * (3 - d); player.z += nz * (3 - d); const hit = player.bump(nx, nz, 0.3); if (hit > 3) { Audio.thud(hit / 8); camShake = 0.3; }
      if (closing > 5) { crashDamage(closing, 0.35 + 0.65 * (a + b > 0.01 ? b / (a + b) : 0.5), 1.4); if (closing > 12) Audio.thud(Math.min(3, closing / 10)); }
      player.sync(0);
    }
  }
  for (const [id, r] of W.remotes) if (!net.players.has(id)) { scene.remove(r.car.mesh); W.remotes.delete(id); }
}
// ---------- terrain driving ----------
// guard rail hit: slide along it, lose a little speed; thud, shake and (lighter) damage only for real impacts
let railT = 0;
let ride = null, garage = null, remotesDone = false; // ride-along (see ride.js); created after the net events below
function railHit(car, rc) {
  car.x += rc.nx * rc.depth; car.z += rc.nz * rc.depth;
  const hit = car.bumpRail(rc.nx, rc.nz);
  if (hit > 3 && performance.now() - railT > 220) { railT = performance.now(); crashDamage(hit, 0.5); if (autoDrive) setAutoDrive(false, true); Audio.thud(hit / 8); camShake = Math.max(camShake, Math.min(0.5, hit * 0.03)); if (vr.presenting) vr.pulse(Math.min(1, hit / 15), 120); }
  car.sync(0);
}
const CAR_G = 16; // gravity on the car in m/s² (floatier than real life, so crests at speed launch you)
function terrainStep(dt) {
  const p = player, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx, cy = p.y || 0;
  // on the water the car sits half a metre down (floating in it, not on top), with a gentle bob that settles as you speed up
  const bob = (0.05 * Math.sin(t * 1.7) + 0.025 * Math.sin(t * 2.9 + 1)) * Math.max(0.25, 1 - Math.abs(p.speed) / 15);
  const G = waterOK() ? (x, z) => world.inWater(x, z) ? world.heightAt(x, z) - 0.5 + bob : world.groundY(x, z, cy) : (x, z) => world.groundY(x, z, cy);
  const hF = G(p.x + fx * 1.6, p.z + fz * 1.6), hB = G(p.x - fx * 1.6, p.z - fz * 1.6), hR = G(p.x + rx * 0.9, p.z + rz * 0.9), hL = G(p.x - rx * 0.9, p.z - rz * 0.9);
  const ground = (hF + hB + hR + hL) / 4, slopeF = (hF - hB) / 3.2, slopeR = (hR - hL) / 1.8;
  if (p.vy == null) p.vy = 0;
  if (p.air) {
    p.vy -= CAR_G * dt; p.y = cy + p.vy * dt;
    if (p.y <= ground) { const impact = -p.vy, wet = waterOK() && world.inWater(p.x, p.z); p.y = ground; p.air = false; p.vy = 0; p.gvy = null; p.lastVy = slopeF * (p.vx * fx + p.vz * fz); if (impact > 6) { if (wet) { try { Audio.splash(); } catch { } W.landSplash = impact; } else Audio.thud(Math.min(3, impact / 6)); camShake = Math.min(0.5, impact * 0.03); } else if (wet && impact > 2) { try { Audio.wash(impact / 6); } catch { } } if (!wet && !W.jumpSafe) fallDamage(impact); W.jumpSafe = false; } // landing on water: a splash, and it doesn't hurt
  } else {
    // how fast the road is carrying the car up or down: slope under the car times forward speed (smooth, unlike frame-to-frame height)
    const fwd = p.vx * fx + p.vz * fz, vySlope = Math.max(-25, Math.min(25, slopeF * fwd));
    p.lastVy = (p.lastVy || 0) + (vySlope - (p.lastVy || 0)) * Math.min(1, dt * 14);
    // the car carries its own up/down speed and only gravity pulls it back: when the ground drops away faster than that (over a crest,
    // off the top of a ramp, off a ledge) it floats up off the road and, once clear by a hand's width, it's properly airborne.
    // Same answer every time for the same hill and speed, at any frame rate.
    const vyc = (p.gvy == null ? p.lastVy : p.gvy) - CAR_G * dt, yn = cy + vyc * dt;
    if (yn <= ground || W.onWater || Math.abs(fwd) < 5) { p.y = ground; p.gvy = p.lastVy; }
    else if (yn - ground > 0.12) { p.air = true; p.vy = Math.min(18, vyc); p.y = yn; p.gvy = null; }
    else { p.y = yn; p.gvy = vyc; }
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
  try { spray.bigSplash(player, world.heightAt(player.x, player.z) - 0.25, Math.min(1, sp / 25 + 0.3)); } catch { }
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
  if (garage?.busy && (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyP')) { garage.cancel(); return; }
  if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyP') { paused ? resume() : openPause(); }
  if (e.code === 'KeyM') { paused ? resume() : openPause('map'); }
  if (paused) return;
  if (ride?.key(e.code)) return;
  if (e.code === 'KeyH' && mode === 'world') { garage?.start(); return; }
  if (e.code === 'KeyC') { S.cam = (S.cam + 1) % 4; renderSettings(); hudMsg(['CHASE CAM', 'FAR CAM', 'HOOD CAM', 'COCKPIT CAM'][S.cam], 900); }
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyT' && mode === 'world' && !paused) setFlight(!flyOn());
  if (e.code === 'KeyY' && mode === 'world' && !paused) setFloatFlat(!myFloat.flat);
  if (e.code === 'KeyU' && mode === 'world' && !paused) toggleDive();
  if (e.code === 'KeyJ' && mode === 'world' && !paused) doRoll();
  if (e.code === 'KeyZ' && mode === 'world' && !paused) doFlip();
  if (e.code === 'KeyK' && mode === 'world' && !paused) doBackFlip();
  if (e.code === 'KeyQ' && mode === 'world' && !paused) doSide();
  if (e.code === 'KeyH' && mode === 'world' && !paused) doJump();
  if (e.code === 'KeyO' && !e.repeat && (mode === 'world' || mode === 'story') && !paused) { try { Audio.horn(S.model === 'pickup' || S.model === 'van' || S.model === 'monster' ? 2 : isBike(S.model) ? 1 : 0); } catch { } }
  if (e.code === 'KeyL' && (mode === 'world' || mode === 'story')) { S.headlights = S.headlights === 'auto' ? 'on' : S.headlights === 'on' ? 'off' : 'auto'; Audio.click(); hudMsg('HEADLIGHTS: ' + S.headlights.toUpperCase(), 1100); }
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
  try { readPad(); } catch { }
  if (vr.presenting) readVR();
  if (mode === 'world' && autoDrive) updateAutoDriveInput();
}
// ---------- VR input + cockpit ----------
let cockpit = null, gaugeT = 0, vrDt = 0, offPulseT = 0;
const cockpitView = () => (vr.presenting || S.cam === 3) && (mode === 'world' || mode === 'story') && !ride?.riding;
function ensureCockpit() {
  const want = cockpitView();
  if (want && (!cockpit || cockpit.model !== player.model || cockpit.group.parent !== player.mesh || cockpit.ck !== (player.mesh.userData.customKey || ''))) {
    if (cockpit) { cockpit.group.parent && cockpit.group.parent.remove(cockpit.group); cockpit.group.traverse(o => { if (o.isMesh && !o.userData.noSkin) o.geometry.dispose(); }); cockpit.tex.dispose(); }
    for (const o of (cockpit && cockpit.hide) || []) o.visible = true;
    cockpit = buildCockpit(player.model, mini); cockpit.group.userData.cockpit = true; player.mesh.add(cockpit.group); cockpit.ck = player.mesh.userData.customKey || ''; cockpit.hide = cabinIntruders(player.mesh, cockpit);
    try { dressCockpit(cockpit); } catch (e) { console.warn('[overpass] interior:', e); }
  }
  if (cockpit) { cockpit.group.visible = want; for (const o of cockpit.hide) o.visible = !want; }
  // hide your own rider/helmet so it doesn't block your view
  player.mesh.userData.ckHide = want; player.mesh.traverse(o => { if (o.userData.rider) o.visible = !want && !player.mesh.userData.drv; });
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
// VR speed panel on the steering wheel: ▲ / ▼ step a set speed up or down (hold to keep stepping), STOP eases to a halt and holds
// the car still. The car then eases its own gas and brake to reach and hold that speed, so there's no lurching. Either trigger
// takes back over (the set speed clears).
const _padP = new THREE.Vector3(), _tipA = [new THREE.Vector3(), new THREE.Vector3()];
const vrStep = () => S.units === 'kmh' ? 10 / 3.6 : 5 / 2.237; // 10 km/h or 5 mph a tap
function vrNudge(dir) {
  const st = vrStep(), sp = Math.max(0, player.speed), top = Math.max(st, (player.maxSpeed || 52) * 1.6);
  const base = W.vrSet != null ? W.vrSet : dir > 0 ? Math.floor(sp / st + 0.15) * st : Math.ceil(sp / st - 0.15) * st;
  W.vrSet = Math.max(0, Math.min(top, Math.round((base + dir * st) / st) * st));
}
function padStep(k, dt) {
  if (!k || !k.pads || !k.pads.length) return;
  // each fingertip presses only the button it's nearest to
  const hit = new Set();
  for (const h of vr.hands || []) {
    if (!h.src) continue; const n = vr.tips ? vr.tips(h, _tipA) : 0;
    for (let i = 0; i < n; i++) { let best = null, bd = 0.03; for (const pad of k.pads) { pad.tip.getWorldPosition(_padP); const d = _tipA[i].distanceTo(_padP); if (d < bd) { bd = d; best = pad; } } if (best) hit.add(best); }
  }
  for (const pad of k.pads) {
    const touch = hit.has(pad);
    if (touch && !pad.down) {
      pad.press = 0.15; pad.rep = 0.45;
      if (pad.id === 'up') vrNudge(1); else if (pad.id === 'dn') vrNudge(-1); else W.vrSet = 0;
      try { vr.pulse(0.5, 30); Audio.flick && Audio.flick(true); } catch { }
    } else if (touch && (pad.id === 'up' || pad.id === 'dn') && (pad.rep -= dt) <= 0) { // held: keep stepping
      pad.rep = 0.2; vrNudge(pad.id === 'up' ? 1 : -1); try { vr.pulse(0.25, 20); } catch { }
    }
    pad.down = touch; if (pad.press > 0) pad.press -= dt;
    const set = W.vrSet, sp = player.speed;
    const on = set == null ? false : pad.id === 'up' ? sp < set - 0.8 : pad.id === 'dn' ? sp > set + 0.8 : set === 0;
    pad.ledMat.emissiveIntensity = pad.press > 0 ? 1.4 : on ? 1.0 : 0.2; pad.cap.position.z = pad.press > 0 ? -0.004 : 0;
  }
  drawSpeedPanel(k.speedPanel, W.vrSet == null ? '--' : String(toUnits(W.vrSet)), S.units === 'kmh' ? 'SET km/h' : 'SET mph', W.vrSet != null);
}
// ease the gas and brake toward the set speed (rate-limited, so the car never jerks)
function vrHold(inp, dt) {
  const set = W.vrSet; if (set == null) { W.vrThr = 0; W.vrBrk = 0; return; }
  const sp = player.speed;
  if (set === 0 && Math.abs(sp) < 0.6) { W.vrThr = 0; W.vrBrk = 0; inp.throttle = 0; inp.brake = 0; inp.handbrake = true; return; }
  const err = set - sp;
  if (W.vrSetWas !== set) { W.vrSetWas = set; W.vrI = Math.min(W.vrI || 0, 0.25); }
  if (set > 0 && Math.abs(err) < 3) W.vrI = Math.max(-0.2, Math.min(0.6, (W.vrI || 0) + err * dt * 0.06)); // trims out the last bit so it holds the exact speed
  const wantT = set > 0 && err > -0.4 ? Math.min(0.85, Math.max(0, err * 0.3 + 0.1 + (W.vrI || 0))) : 0;
  const wantB = set === 0 ? Math.min(0.55, Math.abs(sp) * 0.05 + 0.18) : err < -1.2 ? Math.min(0.45, (-err - 1.2) * 0.12 + 0.08) : 0;
  W.vrThr = (W.vrThr || 0) + Math.max(-dt * 2.5, Math.min(dt * 1.1, wantT - (W.vrThr || 0)));
  W.vrBrk = (W.vrBrk || 0) + Math.max(-dt * 2.5, Math.min(dt * 1.4, wantB - (W.vrBrk || 0)));
  inp.throttle = W.vrThr; inp.brake = W.vrBrk;
}
function readVR() {
  if (!cockpit) return;
  const st = cockpit.cfg.wheel.style, inp = player.input;
  const v = vr.update(vrDt, cockpit.base, st, cockpit.cfg.wheel.R, cockpit.maxRot);
  padStep(cockpit, vrDt);
  if (v.throttle > 0.05 || v.brake > 0.05) W.vrSet = null; // using the triggers takes over from the speed panel
  vrHold(inp, vrDt);
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
  if (W.s32At && Math.hypot(W.s32At.x - player.x, W.s32At.z - player.z) > W.s32At.r + 8) { W.s32At = null; if (vrShop) vrShop.hide(); }
  let s32Near = null;
  for (const p of world.pois) {
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (p.kind === 'store32' && d < p.r + 30) s32Near = p;
    if (d > p.r + (p.kind === 'store32' ? 12 : 4)) continue;
    const last = W.poiT.get(p.key) || -1e9;
    if (p.kind === 'fuel' && d < 7.5) {
      // every visit tops up gas and nitrous; points only every 25 s per station
      const need = (player.fuel ?? 1) < 0.97 || player.boost < 0.97, el = player.stats.electric;
      player.fuel = 1; player.boost = 1; player.power = 1; W.fuelWarn = 0;
      if (now - last < 25000) { if (need) { hudMsg(el ? 'CHARGED · NITROUS FULL' : 'TANK FULL · NITROUS FULL', 1200); Audio.chime(3); } continue; }
      W.poiT.set(p.key, now); W.score += 25; Audio.chime(6); hudMsg(el ? 'CHARGED UP · NITROUS FULL · +25' : 'FILLED UP · GAS + NITROUS FULL · +25', 1800);
    } else if (p.kind === 'repair' && d < p.r && Math.abs(player.speed) < 16) {
      // repair shop: always fixes you up for free; points only every 40 s per shop
      const hurt = (player.hp ?? HP_MAX) < HP_MAX && !(W.wreck > 0);
      if (hurt) { player.hp = HP_MAX; hurtFlash = 0; Audio.chime(5); }
      if (now - last < 40000) { if (hurt) hudMsg('REPAIR SHOP · CAR FIXED', 1400); continue; }
      W.poiT.set(p.key, now); if (hurt) { W.score += 40; hudMsg('REPAIR SHOP · CAR FIXED · +40', 1900); } else { W.poiT.delete(p.key); }
    } else if ((p.kind === 'wic' || p.kind === 'bq') && d < p.r && Math.abs(player.speed) < 14) {
      if (now - last < 60000) continue; W.poiT.set(p.key, now);
      W.score += 75; player.boost = Math.min(1, player.boost + 0.5); Audio.chime(8); hudMsg(p.kind === 'bq' ? 'BURGER QUEEN DRIVE-THRU · +75' : "WICDONALD'S DRIVE-THRU · +75", 1900);
    } else if (p.kind === 'store32' && d < p.r + 10 && Math.abs(player.speed) < 5) {
      // Store32: pull up and the scratch-off counter opens (once per stop: drive off and come back for another go)
      if (W.s32At) continue; W.s32At = { x: p.x, z: p.z, r: p.r }; openStore32();
    } else if (p.kind === 'pizza' && d < p.r && Math.abs(player.speed) < 8 && !W.delivery) {
      if (now - last < 45000) continue; W.poiT.set(p.key, now);
      W.score += 50; player.fuel = Math.min(1, (player.fuel ?? 1) + 0.25); player.boost = Math.min(1, player.boost + 0.25); Audio.chime(7);
      startDelivery(p);
    }
  }
  // a "Store32" button whenever you're in or near the car park, in case you'd rather not stop right by the door
  const sb = s32Btn(); if (sb) { const on = !!s32Near && mode === 'world' && !vr.presenting && !s32.open; if (sb.hidden === on) sb.hidden = !on; }
}
let _s32b = null;
function s32Btn() {
  if (_s32b) return _s32b;
  const b = document.createElement('button'); b.className = 'gbtn ready s32btn'; b.hidden = true; b.setAttribute('aria-label', 'Store32 scratch-offs'); b.title = 'Store32 scratch-offs';
  b.innerHTML = '<span class="s32btn-i">3</span><b>STORE32</b><small>scratch-offs</small>';
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); openStore32(); });
  document.body.appendChild(b); _s32b = b; return b;
}
// ---------- GPS ----------
const POI_ICON = { repair: ['#123f8c', '#ffd23f', '🔧'], store32: ['#14305f', '#ff8a1f', '3'], fuel: ['#12704a', '#fff', 'G'], wic: ['#c8261d', '#ffc72c', 'W'], bq: ['#1f5fa8', '#ffb43b', 'Q'], pizza: ['#0e7c47', '#fff', 'S'] };
const gps = new Gps(scene, world);
gps.onReroute = () => { if (gps.active) setGps(gps.dest, gps.label, true); };
let autoDrive = false;
const clampAuto = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function setAutoDrive(on, announce = true) {
  const canRun = mode === 'world' && gps.active && !gps.loading && !gps.fallback && gps.pts.length > 1 && !player.fly && !W.sink;
  if (on && !canRun) { autoDrive = false; updateGpsHud(); return false; }
  autoDrive = !!on;
  if (announce) { hudMsg(autoDrive ? 'GPS AUTO DRIVE · ON' : 'AUTO DRIVE · OFF', 1200); Audio.click(); }
  updateGpsHud();
  return autoDrive;
}
// countries that drive on the left (traffic and auto drive keep left there)
const LHT = new Set(['gb', 'ie', 'im', 'je', 'gg', 'mt', 'cy', 'jp', 'au', 'nz', 'in', 'pk', 'bd', 'lk', 'np', 'bt', 'th', 'my', 'sg', 'id', 'tl', 'bn', 'hk', 'mo', 'za', 'na', 'bw', 'zw', 'zm', 'mw', 'mz', 'ls', 'sz', 'ke', 'ug', 'tz', 'mu', 'sc', 'jm', 'tt', 'bb', 'bs', 'gy', 'sr', 'ag', 'dm', 'gd', 'kn', 'lc', 'vc', 'ai', 'ms', 'tc', 'vg', 'ky', 'bm', 'fk', 'fj', 'pg', 'sb', 'ws', 'to', 'ki', 'tv', 'nr', 'ck']);
// GPS auto drive: follows the route in the proper lane, steers around cars, people and anything else in the way, and (with
// auto cruise) keeps its distance behind slower traffic. If both sides are blocked it brakes, even when you're on the gas.
const _avoid = { off: 0, brake: 0 };
function autoObstacles() {
  const out = [];
  for (const a of W.traffic) out.push({ x: a.car.x, z: a.car.z, yaw: a.car.yaw, v: a.speed || 0, r: 1.15 });
  try { for (const c of police.cops || []) if (c.car) out.push({ x: c.car.x, z: c.car.z, yaw: c.car.yaw, v: c.car.speed || 0, r: 1.15 }); } catch { }
  for (const r of W.remotes.values()) if (r.car) out.push({ x: r.car.x, z: r.car.z, yaw: r.car.yaw, v: r.car.speed || 0, r: 1.2 });
  try { for (const p of pedestrians.people || []) out.push({ x: p.x, z: p.z, yaw: 0, v: 0, r: 0.6 }); } catch { }
  return out;
}
function updateAutoDriveInput() {
  // Deliberate steering or braking immediately returns control to the player.
  if (Math.abs(player.input.steer || 0) > 0.18 || (S.autoCruise && (player.input.brake || 0) > 0.05)) {
    setAutoDrive(false, true);
    return;
  }
  if (!gps.active || gps.fallback || player.fly || W.sink || W.onWater) {
    setAutoDrive(false, true);
    return;
  }
  if (gps.loading || gps.pts.length < 2) {
    if (S.autoCruise) { player.input.throttle = 0; player.input.brake = 0.75; }
    player.input.steer = 0;
    return;
  }
  const dt = Math.min(0.1, W.frameDt || 0.016), speed = Math.max(0, player.speed || 0), sd = W.lht ? -1 : 1;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), rx = -fz, rz = fx; // forward, and the driver's right
  // 1. the lane: the route runs down the middle of the road, so keep to the near side like the traffic does
  const here = world.roadInfo(player.x, player.z), hw = here && here.seg && here.dist < 12 ? here.seg.hw : 4;
  const lane = Math.min(1.7, hw * 0.32) * sd; // + = right of the centre line
  // 2. what's in the way: anything ahead inside our path, closing on us
  const reach = 10 + speed * 1.6; let worstT = Infinity, block = null, leftFree = true, rightFree = true, follow = Infinity, followV = 0;
  for (const o of autoObstacles()) {
    const dx = o.x - player.x, dz = o.z - player.z, ahead = dx * fx + dz * fz; if (ahead < -4 || ahead > reach + 6) continue;
    const lat = dx * rx + dz * rz; // + = to our right (relative to where we are now)
    const ov = o.v * (Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz); // their speed along our heading (negative = coming at us)
    const closing = speed - ov, gap = o.r + 1.25;
    // which sides would be blocked if we moved over by ~3 m (oncoming cars count from further away)
    if (ahead > -4 && ahead < Math.max(14, speed * (ov < -1 ? 2.6 : 1.2))) { if (lat > 0.5 && lat < 4.8) rightFree = false; if (lat < -0.5 && lat > -4.8) leftFree = false; }
    if (ahead < 1 || Math.abs(lat) > gap) continue; // not in our path (measured from where we are now)
    if (closing <= 0.5 && ov > 0) { if (ahead < follow) { follow = ahead; followV = ov; } continue; } // pulling away from us: nothing to do
    const t = ahead / Math.max(1, closing); if (t < worstT) { worstT = t; block = { lat, ahead, ov, r: o.r }; }
    if (ov > 0 && ahead < follow) { follow = ahead; followV = ov; }
  }
  // 3. swerve: step out to the side that's free (toward the kerb first if the thing is in the middle), then drift back into lane
  let want = 0, brake = 0;
  if (block && worstT < 4.5) {
    const away = block.lat > 0 ? -1 : 1; // move away from it
    let side = away; if (side > 0 && !rightFree) side = leftFree ? -1 : 0; else if (side < 0 && !leftFree) side = rightFree ? 1 : 0;
    if (side !== 0) want = side * Math.min(hw + 0.5 + Math.abs(lane), block.r + 2.6);
    else brake = 1; // boxed in: stop
    if (worstT < 1.2) brake = Math.max(brake, side === 0 ? 1 : 0.5); // about to hit: brake as well
  }
  // stuck behind a slow car for a few seconds (auto cruise): pull out and overtake when the other lane is clear
  const passSide = -sd, passFree = passSide < 0 ? leftFree : rightFree;
  W.autoFollowT = S.autoCruise && follow < 30 && followV < 13.5 - 3 ? (W.autoFollowT || 0) + dt : 0;
  if (W.autoFollowT > 3 && passFree && !block) { W.autoPassT = 5; W.autoFollowT = 0; }
  if ((W.autoPassT = Math.max(0, (W.autoPassT || 0) - dt)) > 0 && !block) { want = passSide * Math.min(hw + 0.5 + Math.abs(lane), 3.4); if (!passFree && Math.abs(_avoid.off) < 1) W.autoPassT = 0; }
  // after a swerve, only drift back into lane once the side we're returning to is clear (we may still be passing it)
  if (!block && Math.abs(_avoid.off) > 0.3) { const back = _avoid.off > 0 ? -1 : 1; if ((back < 0 && !leftFree) || (back > 0 && !rightFree)) want = _avoid.off; }
  _avoid.off += (want - _avoid.off) * Math.min(1, dt * (want !== 0 ? 3.2 : 1.1));
  // 4. steer for a point ahead on the route, shifted into our lane (and out of the way when swerving)
  const look = clampAuto(12 + speed * 0.75, 12, 30);
  const target = gps.at(Math.min(gps.total, (gps.along || 0) + look));
  const tl = Math.hypot(target[2], target[3]) || 1, tdx = target[2] / tl, tdz = target[3] / tl, off = lane + _avoid.off;
  const tx = target[0] + (-tdz) * off - player.x, tz = target[1] + tdx * off - player.z;
  if (Math.hypot(tx, tz) < 0.5) { player.input.steer = 0; return; }
  const desiredYaw = Math.atan2(tx, tz);
  const err = Math.atan2(Math.sin(desiredYaw - player.yaw), Math.cos(desiredYaw - player.yaw));
  player.input.steer = clampAuto(err / 0.48, -1, 1);
  W.autoBlocked = !!block;
  if (brake > 0) { player.input.brake = Math.max(player.input.brake || 0, brake); player.input.throttle = 0; player.input.boost = false; }
  if (!S.autoCruise) return; // auto drive only steers (and brakes for a collision): gas, boost and handbrake stay yours

  // Read the route's upcoming bend and slow down before tight turns.
  const p1 = gps.at(Math.min(gps.total, (gps.along || 0) + 10));
  const p2 = gps.at(Math.min(gps.total, (gps.along || 0) + 34));
  const a1 = Math.atan2(p1[2], p1[3]), a2 = Math.atan2(p2[2], p2[3]);
  const bend = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
  let targetSpeed = 13.5;
  if (bend > 0.95 || Math.abs(err) > 1.0) targetSpeed = 4.5;
  else if (bend > 0.58 || Math.abs(err) > 0.65) targetSpeed = 6.5;
  else if (bend > 0.28 || Math.abs(err) > 0.38) targetSpeed = 9.0;
  // keep a safe gap behind slower traffic, and ease off while swerving
  if (follow < Infinity && !(W.autoPassT > 0)) targetSpeed = Math.min(targetSpeed, Math.max(0, (follow - 7) * 0.55));
  if (Math.abs(_avoid.off) > 1) targetSpeed = Math.min(targetSpeed, 9);
  const delta = targetSpeed - speed;
  player.input.throttle = brake > 0 ? 0 : clampAuto(delta * 0.24, 0, 1);
  player.input.brake = Math.max(brake, clampAuto(-delta * 0.32, 0, 1));
  player.input.boost = false;
  player.input.handbrake = false;
}
async function setGps(dest, label = 'Map pick', reroute = false) {
  if (mode !== 'world') return;
  if (!reroute && autoDrive) setAutoDrive(false, false);
  if (!reroute) { hudMsg('GPS · FINDING A ROUTE', 1200); Audio.click(); }
  const ok = await gps.route(world.unproj(player.x, player.z), dest, label);
  if (!ok) return;
  if (reroute) hudMsg('GPS · REROUTING', 900);
  else { hudMsg(gps.fallback ? 'GPS · NO ROAD ROUTE, FOLLOW THE LINE' : `GPS · ${fmtDist(gps.total).toUpperCase()} TO GO`, 1800); Audio.chime(4); }
  updateGpsHud();
}
function clearGps(say) { if (autoDrive) setAutoDrive(false, false); if (gps.active && say) { hudMsg('GPS CLEARED', 900); Audio.click(); } gps.clear(); W.delivery = null; updateGpsHud(); }
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
// the street-name plate above the minimap, in the local style: US green blade, UK and German white plates, Paris blue enamel ...
const SS_BLUE = new Set(['nl', 'at', 'ch', 'jp', 'se', 'fi', 'no', 'cz', 'sk', 'hu', 'si', 'hr', 'ba', 'rs', 'gr', 'kr', 'tw', 'nz']);
const SS_WHITE = new Set(['gb', 'ie', 'im', 'it', 'es', 'pt', 'dk', 'pl', 'be', 'lu', 'ro', 'bg', 'ua', 'lt', 'lv', 'ee', 'is', 'mt', 'cy', 'za', 'in', 'au']);
function streetSignClass() {
  const cc = (scrapbook && scrapbook.here && scrapbook.here.cc) || 'us';
  if (cc === 'de') return 'ss-de'; if (cc === 'fr') return 'ss-fr';
  if (SS_BLUE.has(cc)) return 'ss-blue'; if (SS_WHITE.has(cc)) return 'ss-white';
  return 'ss-us';
}
// ---------- the GPS panel as a real road sign: the local country's colours, typeface and route-number badges ----------
const SIGN_GREEN_ALL = new Set(['us', 'ca', 'mx', 'au', 'nz', 'br', 'in', 'za', 'ph', 'cl', 'ar', 'co', 'pe', 'my', 'th', 'id', 'sg', 'ae', 'sa', 'il', 'tr', 'ru', 'kz']);
const SIGN_MOTOR_BLUE_ELSE_GREEN = new Set(['gb', 'ie', 'im', 'fr', 'gr']);
const SIGN_MOTOR_GREEN_ELSE_BLUE = new Set(['it', 'ch', 'dk', 'pl', 'cz', 'sk', 'hu', 'si', 'hr', 'rs', 'ro', 'bg', 'ua', 'lt', 'lv', 'ee', 'ba', 'me', 'mk', 'al', 'jp', 'kr', 'cn', 'tw', 'hk']);
const SIGN_BLUE_ALL = new Set(['nl', 'be', 'lu', 'no', 'se', 'fi', 'is', 'at', 'es', 'pt']);
function signStyle() {
  const here = scrapbook && scrapbook.here, cc = (here && here.cc) || 'us';
  const info = world.roadInfo(player.x, player.z), type = info && info.seg && info.dist < 12 ? info.seg.type : '';
  const motor = /^motorway/.test(type);
  let bg = 'green';
  if (cc === 'de') bg = motor ? 'blue' : 'yellow';
  else if (SIGN_MOTOR_BLUE_ELSE_GREEN.has(cc)) bg = motor ? 'blue' : 'green';
  else if (SIGN_MOTOR_GREEN_ELSE_BLUE.has(cc)) bg = motor ? 'green' : 'blue';
  else if (SIGN_BLUE_ALL.has(cc)) bg = 'blue';
  const font = ['us', 'ca', 'mx', 'au', 'nz', 'br', 'cl', 'ar'].includes(cc) ? 'hwy' : ['de', 'at', 'ch', 'cz', 'sk', 'pl', 'si', 'hr'].includes(cc) ? 'din' : 'eu';
  const refs = cc === 'us' ? 'us' : ['gb', 'ie', 'im'].includes(cc) ? 'uk' : cc === 'de' ? 'de' : cc === 'fr' ? 'fr' : 'eu';
  return { cc, bg, font, refs, region: here ? here.region : '', imperial: S.units !== 'kmh' };
}
// the route number as its local badge: US interstate shield, US route shield, state route; UK yellow numbers; German, French badges
function refBadge(ref, st) {
  if (!ref) return ''; const r = String(ref).split(/[;,]/)[0].trim(); if (!r || r.length > 9) return '';
  if (st.refs === 'us') {
    const m = r.match(/^I[- ]?(\d+\w?)$/i), u = r.match(/^US[- ]?(\d+\w?)$/i), sr = r.match(/^([A-Z]{2})[- ]?(\d+\w?)$/i);
    if (m) return `<span class="rb rb-i"><svg viewBox="0 0 40 42" aria-hidden="true"><path d="M3 4 Q20 0 37 4 Q40 26 20 41 Q0 26 3 4Z" fill="#1d4e9e" stroke="#fff" stroke-width="2.4"/><path d="M4.4 5.4 Q20 1.6 35.6 5.4 L35 12 L5 12Z" fill="#c8202f"/></svg><b>${escapeHtml(m[1])}</b></span>`;
    if (u) return `<span class="rb rb-us"><svg viewBox="0 0 40 42" aria-hidden="true"><path d="M5 3 H35 Q37 13 35 22 Q30 36 20 40 Q10 36 5 22 Q3 13 5 3Z" fill="#fff" stroke="#111" stroke-width="2.2"/></svg><b>${escapeHtml(u[1])}</b></span>`;
    if (sr) return `<span class="rb rb-st">${escapeHtml(sr[2])}</span>`;
  }
  if (st.refs === 'uk') return `<span class="rb rb-uk ${/^M/i.test(r) ? 'm' : ''}">${escapeHtml(r)}</span>`;
  if (st.refs === 'de') return `<span class="rb rb-de ${/^A/i.test(r) ? 'a' : ''}">${escapeHtml(r.replace(/^([AB])\s*/i, '$1 '))}</span>`;
  if (st.refs === 'fr') return `<span class="rb rb-fr ${/^D/i.test(r) ? 'd' : ''}">${escapeHtml(r.replace(/^([ANDM])\s*/i, '$1 '))}</span>`;
  return `<span class="rb rb-eu">${escapeHtml(r)}</span>`;
}
// distances the way the signs print them: US "½ MILE", "500 FT"; UK "300 yds"; elsewhere "300 m", "1.5 km"
function signDist(m, st) {
  if (st.imperial) {
    const mi = m / 1609.34; if (mi < 0.19) return st.cc === 'gb' ? Math.max(50, Math.round(m * 1.0936 / 50) * 50) + ' yds' : Math.max(100, Math.round(m * 3.281 / 100) * 100) + ' FT';
    const q = Math.round(mi * 4) / 4, w = Math.floor(q), f = q - w, fr = f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '';
    const n = (w ? String(w) : '') + fr; return st.cc === 'gb' ? `${n} ${q > 1 ? 'miles' : 'mile'}` : `${n} ${q > 1 ? 'MILES' : 'MILE'}`;
  }
  return m < 1000 ? Math.max(50, Math.round(m / 50) * 50) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
}
// the manoeuvre arrow drawn like the ones on signs (thick, white, with a proper arrowhead)
function signArrow(s) {
  const m = (s && s.modifier) || '', t = s && s.type;
  const svg = d => `<svg viewBox="0 0 48 48" aria-hidden="true">${d}</svg>`, head = 'stroke-linejoin="round" stroke-linecap="round"';
  if (!s) return svg(`<path d="M24 42 V12 M12 22 L24 8 L36 22" fill="none" stroke="currentColor" stroke-width="6" ${head}/>`);
  if (t === 'arrive') return svg(`<path d="M14 44 V6 M14 8 H36 L31 15 L36 22 H14" fill="none" stroke="currentColor" stroke-width="4.5" ${head}/>`);
  if (t === 'roundabout' || t === 'rotary') return svg(`<circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="4.5"/><path d="M24 44 V33 M33 24 H43 M37 18 L44 24 L37 30" fill="none" stroke="currentColor" stroke-width="4.5" ${head}/>`);
  if (m === 'uturn') return svg(`<path d="M32 42 V20 A8 8 0 0 0 16 20 V34 M8 26 L16 36 L24 26" fill="none" stroke="currentColor" stroke-width="5.5" ${head}/>`);
  const L = m.includes('left'), R = m.includes('right'), flip = L ? 'transform="translate(48 0) scale(-1 1)"' : '';
  if (L || R) {
    if (m.startsWith('slight')) return svg(`<g ${flip}><path d="M18 44 V26 L34 12 M24 10 H36 V22" fill="none" stroke="currentColor" stroke-width="5.5" ${head}/></g>`);
    if (m.startsWith('sharp')) return svg(`<g ${flip}><path d="M16 44 V12 L34 32 M24 34 H35 V23" fill="none" stroke="currentColor" stroke-width="5.5" ${head}/></g>`);
    return svg(`<g ${flip}><path d="M16 44 V22 Q16 16 22 16 H40 M32 7 L41 16 L32 25" fill="none" stroke="currentColor" stroke-width="5.5" ${head}/></g>`);
  }
  return svg(`<path d="M24 44 V10 M13 20 L24 7 L35 20" fill="none" stroke="currentColor" stroke-width="5.5" ${head}/>`);
}
// the small line above the street name: TURN RIGHT, EXIT, KEEP LEFT ...
function signVerb(s) {
  if (!s) return ''; const m = s.modifier || '', side = m.includes('left') ? 'left' : 'right';
  if (s.type === 'arrive') return 'Destination';
  if (s.type === 'roundabout' || s.type === 'rotary') return `Roundabout · exit ${s.exit || 1}`;
  if (m === 'uturn') return 'U-turn';
  if (m === 'straight' || s.type === 'new name' || (s.type === 'continue' && !/left|right/.test(m))) return 'Continue';
  if (s.type === 'fork') return `Keep ${side}`; if (s.type === 'merge') return `Merge ${side}`;
  if (s.type === 'on ramp') return `Ramp ${side}`; if (s.type === 'off ramp') return `Exit ${side}`;
  if (m.startsWith('slight')) return `Bear ${side}`; if (m.startsWith('sharp')) return `Sharp ${side}`;
  return `Turn ${side}`;
}
function updateGpsHud() {
  const el = $('#hGps'), g = mode === 'world' ? gpsLines() : null;
  const autoBtn = $('[data-auto-drive]');
  const routeReady = mode === 'world' && gps.active && !gps.loading && !gps.fallback && gps.pts.length > 1;
  if (autoBtn) {
    autoBtn.hidden = !routeReady;
    autoBtn.disabled = !routeReady;
    autoBtn.classList.toggle('on', !!autoDrive);
    autoBtn.textContent = autoDrive ? 'ON' : 'AUTO';
    autoBtn.setAttribute('aria-pressed', String(!!autoDrive));
  }
  el.hidden = !g; if (!g) return;
  // styled as the local road sign (pizza deliveries keep their own green-and-white look)
  const st = signStyle(), n = gps.active && !gps.loading && !gps.fallback ? gps.next : null;
  el.className = `gpschip sign sign-${st.bg} sf-${st.font}${W.delivery ? ' pizza' : ''}`;
  if (n) {
    const name = n.type === 'arrive' ? (gps.label || 'Destination') : (n.name && n.name !== n.ref ? n.name : n.ref ? '' : 'Unnamed road');
    $('#hGpsA').innerHTML = signArrow(n);
    $('#hGpsT').innerHTML = `<small class="sv">${escapeHtml(signVerb(n))}</small><span class="sn">${escapeHtml(name)}</span>${refBadge(n.ref, st)}`;
    const timer = W.delivery ? ` · ${Math.max(0, Math.ceil(W.delivery.left))} s` : '';
    $('#hGpsD').innerHTML = `<span class="sd">${signDist(gps.nextIn ?? 0, st)}</span><span class="sr">${fmtDist(gps.remain ?? gps.total)} to go${timer}</span>`;
  } else { $('#hGpsA').innerHTML = signArrow(null); $('#hGpsT').textContent = g.a; $('#hGpsD').textContent = g.b; }
}
$('[data-auto-drive]').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  if (!autoDrive) setAutoDrive(true, true); else setAutoDrive(false, true);
});
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
const flyOn = () => mode === 'world' && canFly() && flightMode();
function pitchInput() { // + = pull the nose up
  const k = keys; let v = (k.KeyK || k.Numpad2 ? 1 : 0) - (k.KeyI || k.Numpad8 ? 1 : 0);
  if (touchKeys.up) v += 1; if (touchKeys.dn) v -= 1; if (Math.abs(W.padPitch || 0) > 0.15) v = W.padPitch;
  if (vr.presenting && Math.abs(W.vrPitch || 0) > 0.15) v = W.vrPitch;
  if (vr.presenting && W.vrStickT > 0) v = W.vrStick; // the cockpit flight stick wins while you hold it
  return Math.max(-1, Math.min(1, v));
}
function takeOff() {
  const p = player; p.fly = { vx: p.vx, vy: 4, vz: p.vz, pitch: 0.14, roll: 0, t: 0 }; p.air = false; p.y = (p.y || 0) + 0.3; W.ringBoost = 0;
  hudMsg('TAKEOFF', 900); Audio.chime(3);
}
function waterRingHit(combo) { // drove through a ring standing in the water
  player.ringBoost = 3.5; player.speed += (player.speed >= 0 ? 1 : -1) * (8 + Math.min(4, combo) * 2);
  const pts = 50 * Math.min(combo, 6); W.score += pts;
  hudMsg(combo > 1 ? `WATER RING ×${combo} · +${pts}` : `WATER RING · +${pts}`, 1400); Audio.chime(Math.min(10, 4 + combo)); try { Audio.powerup(0.8); } catch { } camShake = Math.max(camShake, 0.3);
}
function ringHit(combo) { // flew through a sky ring
  const p = player, F = p.fly; W.ringBoost = 4.5;
  if (F) { const cp = Math.cos(F.pitch), kick = 16 + Math.min(4, combo) * 4; F.vx += Math.sin(p.yaw) * cp * kick; F.vy += Math.sin(F.pitch) * kick; F.vz += Math.cos(p.yaw) * cp * kick; }
  const pts = 50 * Math.min(combo, 6); W.score += pts; try { Audio.powerup(0.8); } catch { }
  hudMsg(combo > 1 ? `RING BOOST ×${combo} · +${pts}` : `RING BOOST · +${pts}`, 1400); Audio.chime(Math.min(10, 4 + combo)); camShake = Math.max(camShake, 0.35);
}
function flyStep(dt) {
  const p = player, F = p.fly, inp = p.input, st = p.stats, pw = p.power ?? 1, pin = pitchInput();
  F.t += dt;
  p.boosting = inp.boost && p.boost > 0.02 && inp.throttle > 0 && pw > 0.5;
  if (p.boosting && !p.infBoost) p.boost = Math.max(0, p.boost - dt * 0.33); else if (p.infBoost) p.boost = 1; else p.boost = Math.min(1, p.boost + dt * 0.05);
  const ring = W.ringBoost > 0 ? 1 : 0; if (ring) { W.ringBoost = Math.max(0, W.ringBoost - dt); p.boosting = true; } // sky ring boost: free nitrous and much more speed for a few seconds
  const sp = Math.hypot(F.vx, F.vy, F.vz), auth = Math.max(0.2, Math.min(1, sp / 22));
  // pitch, bank and yaw: like a light plane that still steers a little like a car
  F.pitch = Math.max(-1.3, Math.min(1.3, F.pitch + pin * 0.9 * auth * dt));
  const rollT = -inp.steer * 0.8; F.roll += (rollT - F.roll) * (1 - Math.exp(-dt * 2.6));
  p.steer += (inp.steer - p.steer) * Math.min(1, dt * 9);
  p.yaw += (inp.steer * 0.32 - Math.sin(F.roll) * 1.15) * auth * dt;
  const cp = Math.cos(F.pitch), nx = Math.sin(p.yaw) * cp, ny = Math.sin(F.pitch), nz = Math.cos(p.yaw) * cp;
  const glide = !flyOn() || wingsTucked(); // flight mode switched off (or wings removed) mid-air: no engine thrust in the air and less lift, so you glide down
  const top = p.maxSpeed * st.top * wingAir() * (p.boosting ? (p.nitroTop || 1.28) : 1) * (ring ? 1.9 : 1) * (0.22 + 0.78 * pw);
  const thrust = (glide ? 0.15 : 1) * Math.max(inp.throttle, ring * 0.6) * p.accel * st.accel * 0.75 * (p.boosting ? (p.nitroPush || 1.6) : 1) * (ring ? 2.6 : 1) * (0.3 + 0.7 * pw) * Math.max(0, 1 - sp / (top * 1.05));
  F.vx += nx * thrust * dt; F.vy += ny * thrust * dt; F.vz += nz * thrust * dt;
  // gravity vs lift (lift grows with the square of airspeed and fades as you bank)
  const vf = F.vx * nx + F.vy * ny + F.vz * nz, g = 19;
  const lk = glide ? 0.6 : wingLift(), L = g * Math.min(1.15 * (glide ? 0.75 : Math.sqrt(lk)), lk * (Math.max(0, vf) / 30) ** 2) * Math.cos(F.roll), spi = Math.sin(F.pitch); // lift acts along the car's roof, not straight up
  F.vx -= spi * Math.sin(p.yaw) * L * dt; F.vz -= spi * Math.cos(p.yaw) * L * dt; F.vy += (-g + cp * L) * dt;
  // the airflow swings your velocity round to where the nose points
  const ka = 1 - Math.exp(-dt * 1.7 * auth), s2 = Math.hypot(F.vx, F.vy, F.vz);
  F.vx += (nx * s2 - F.vx) * ka; F.vy += (ny * s2 - F.vy) * ka; F.vz += (nz * s2 - F.vz) * ka;
  const drag = Math.exp(-dt * (0.05 + inp.brake * 0.9 + (inp.handbrake ? 0.4 : 0))); F.vx *= drag; F.vy *= drag; F.vz *= drag;
  const fx0 = p.x, fz0 = p.z; p.x += F.vx * dt; p.z += F.vz * dt; p.y = (p.y || 0) + F.vy * dt;
  { const rc = world.railCollide(p.x, p.z, 1.25, p.y, fx0, fz0); if (rc) { p.x += rc.nx * rc.depth; p.z += rc.nz * rc.depth; const vn = F.vx * rc.nx + F.vz * rc.nz; if (vn < 0) { F.vx -= 1.2 * vn * rc.nx; F.vz -= 1.2 * vn * rc.nz; } } }
  const col = world.collide(p.x, p.z, 1.4, p.y);
  if (col) { p.x += col.nx * col.depth; p.z += col.nz * col.depth; const vn = F.vx * col.nx + F.vz * col.nz; if (vn < 0) { F.vx -= 1.3 * vn * col.nx; F.vz -= 1.3 * vn * col.nz; F.vx *= 0.6; F.vz *= 0.6; crashDamage(-vn); if (-vn > 4) { Audio.thud(Math.min(3, -vn / 8)); camShake = Math.min(0.6, -vn * 0.03); if (vr.presenting) vr.pulse(0.7, 120); } } }
  const gy = world.groundY(p.x, p.z, p.y);
  p.vx = F.vx; p.vz = F.vz;
  if (p.y <= gy) {
    // touchdown: back to driving
    const impact = -F.vy; p.y = gy; p.vy = 0; p.air = false; p.fly = null;
    fallDamage(impact, F.pitch); if (impact > 14 || F.pitch < -0.55) { const k = 0.5; p.vx *= k; p.vz *= k; Audio.thud(Math.min(3, impact / 6)); camShake = 0.5; if (F.t > 1) hudMsg('HARD LANDING', 1000); if (vr.presenting) vr.pulse(1, 200); }
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
$('#tRoll')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); doRoll(); });
$('#tFlip')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); doFlip(); });
$('#tBflip')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); doBackFlip(); });
$('#tSide')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); doSide(); });
$('#tJump')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); doJump(); });
$('#tFloat')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); setFloatFlat(!myFloat.flat); });
$('#tDive')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); toggleDive(); });
$('#tWings')?.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); setFlight(!flyOn()); });
$('#bridgeBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); buildBridge(); });
function resetCar() {
  if (ride?.riding) { toast('Get out of the car first (E)'); return; }
  if (mode === 'story' && race) { race.resetPlayer(); hudMsg('RESET', 700); }
  if (mode === 'world' && !W.spawning) { const p = world.nearestRoadPoint(player.x, player.z, 300); if (p) placeW(p.x, p.z, p.yaw); else placeW(player.x, player.z, player.yaw); hudMsg('RESET', 700); }
}
document.addEventListener('pointerdown', () => { if (!Audio.ready) { Audio.init(); Audio.setVolume('master', S.master); Audio.setVolume('music', S.musicVol); Audio.setVolume('sfx', S.sfx); Audio.setVolume('wind', S.windVol); Audio.setVolume('water', S.waterVol); Audio.setVolume('rain', S.rainVol); Audio.setMusic(S.music); } }, { capture: true });

// ---------- world setup / multiplayer setup ----------
$('#wGo').onclick = () => { Audio.init(); startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name); };
function myInfo() { return { name: (S.name || 'Driver').slice(0, 16), color: PAINTS[S.paint].color, model: netModel(), av: S.avatarNet }; }
function curLatLon() { if (mode === 'world' && world.lat0 != null && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); return { lat: la, lon: lo }; } return { lat: chosenLoc.lat, lon: chosenLoc.lon }; }
net.originFn = curLatLon;
$('#mpName').addEventListener('input', e => { S.name = e.target.value.trim(); syncNameInputs(e.target); updateDriverChips(); });
async function doHost(statusEl, startAtChosen = true, map = null) {
  statusEl.className = 'status'; statusEl.textContent = 'Opening session…';
  try {
    const code = await net.hostGame(myInfo(), curLatLon());
    statusEl.textContent = 'Hosting · code ' + code;
    if (map && map.kind === 'model') { const data = await modelMapData(map); if (await startModelWorld(map, data)) try { net.setAsset('mm', { h: map.h, m: { ext: map.ext, name: map.name }, data }); } catch { } }
    else if (map) startCustomMp(map);
    else if (startAtChosen) startWorld(chosenLoc.lat, chosenLoc.lon, chosenLoc.name);
    toast(`Session open — share code ${code}${S.mpPublic ? ' (listed in Open games)' : ''}`, 5000); updateMpBadge(); renderMpTab(); syncLobby();
  } catch (e) { statusEl.className = 'status err'; statusEl.textContent = 'Could not host: ' + (e.message || e.type || e); }
}
async function doJoin(code, statusEl) {
  if (!code || code.trim().length < 4) { statusEl.className = 'status err'; statusEl.textContent = 'Enter the 6-character code from the host.'; return; }
  statusEl.className = 'status'; statusEl.textContent = 'Connecting…';
  try {
    const w = await net.joinGame(code, myInfo());
    statusEl.textContent = 'Connected';
    // the host may be on one of their own tracks: it comes with the welcome, and is kept in your track list
    const hm = w.map && cleanMap(w.map, Object.keys(THEMES));
    if (hm && hm.kind === 'model') {
      const data = await waitModelMap(hm, statusEl);
      if (!data) throw new Error("Couldn't get the host's 3D map");
      if (!loadMaps().some(x => x.id === hm.id)) upsertMap({ ...hm, imported: true }); statusEl.textContent = 'Connected'; await startModelWorld(hm, data);
    }
    else if (hm) { if (!loadMaps().some(x => x.id === hm.id)) upsertMap({ ...hm, imported: true }); startCustomMp(hm); }
    else { const o = w.origin || chosenLoc; startWorld(o.lat, o.lon, 'Host location'); }
    toast('Joined session ' + net.code, 3500); updateMpBadge(); renderMpTab();
  } catch (e) { statusEl.className = 'status err'; statusEl.textContent = e.message || String(e); }
}
$('#mpHost').onclick = () => {
  Audio.init(); S.name = $('#mpName').value.trim();
  if (W.mpKind === 'map') { const m = loadMaps().find(x => x.id === $('#mpMapSel').value); if (!m) { const st = $('#mpStatus'); st.className = 'status err'; st.textContent = 'Make or import a track first.'; return; } doHost($('#mpStatus'), false, m); }
  else doHost($('#mpStatus'));
};
// ---- open games (lobby.js) ----
const lobby = new Lobby();
const MODE_NAME = { world: 'Real world', map: 'Custom track', model: '3D map' };
function renderLobby(list = lobby.list, state = lobby.state) {
  const st = $('#lbState'), ul = $('#lbList'); if (!st || !ul) return;
  st.className = 'lb-state' + (state === 'online' ? ' on' : ''); st.textContent = state === 'online' ? (list.length ? `${list.length} open` : 'Online') : state === 'error' ? 'Lobby unreachable, retrying…' : 'Looking…';
  const mine = net.role === 'host' ? net.code : '';
  ul.innerHTML = list.length ? list.sort((a, b) => b.players - a.players).map(r => `<li class="${r.code === mine ? 'mine' : ''}"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(MODE_NAME[r.mode] || 'Game')}${r.place ? ' · ' + escapeHtml(r.place) : ''} · ${r.players} ${r.players === 1 ? 'driver' : 'drivers'} · ${r.code}</small>${r.code === mine ? '<button class="cta ghost sm" disabled>Yours</button>' : `<button class="cta sm" data-lbjoin="${r.code}">Join</button>`}</li>`).join('')
    : `<li class="lb-empty">${state === 'online' ? 'No open games right now. Host one and tick "List it in Open games".' : 'Connecting to the lobby…'}</li>`;
  ul.querySelectorAll('[data-lbjoin]').forEach(b => b.onclick = () => { Audio.click(); S.name = $('#mpName').value.trim() || S.name; $('#mpCode').value = b.dataset.lbjoin; doJoin(b.dataset.lbjoin, $('#mpStatus')); });
}
lobby.on(renderLobby);
$('#lbRefresh') && ($('#lbRefresh').onclick = () => { Audio.click(); lobby.refresh(); renderLobby(); });
// keep my game's listing up to date (players, place) while I'm hosting a public one
S.mpPublic = (() => { try { return localStorage.getItem('osm.mp.public') !== '0'; } catch { return true; } })(); if ($('#mpPublic')) { $('#mpPublic').checked = S.mpPublic; $('#mpPublic').onchange = e => { S.mpPublic = e.target.checked; try { localStorage.setItem('osm.mp.public', S.mpPublic ? '1' : '0'); } catch { } syncLobby(); }; }
function syncLobby() {
  try {
    if (net.role === 'host' && S.mpPublic) {
      let place = ''; try { place = (scrapbook && scrapbook.here && scrapbook.here.name) || (W.mpMap && W.mpMap.name) || chosenLoc.name || ''; } catch { }
      lobby.publish({ code: net.code, name: `${(S.name || 'Driver').slice(0, 16)}'s game`, host: S.name || 'Driver', place, mode: modelWorld ? 'model' : W.mpMap ? 'map' : 'world', players: net.count, v: 2 });
    } else lobby.unpublish();
  } catch (e) { console.warn('[overpass] lobby:', e); }
}
setInterval(syncLobby, 4000);
// ---- relay (TURN) settings ----
function fillRelay() { const r = relaySettings(); if ($('#rlApp')) { $('#rlApp').value = r.own ? (r.app || '') : ''; $('#rlKey').value = r.own ? (r.key || '') : ''; $('#rlApp').placeholder = !r.own && r.app ? `using the game's relay (${r.app})` : 'yourapp (from yourapp.metered.live)'; } }
async function testRelay(st) {
  st.className = 'status'; st.textContent = 'Testing the relay…';
  try {
    const ice = await getIce(), turns = ice.filter(x => /^turns?:/.test([].concat(x.urls)[0] || ''));
    const pc = new RTCPeerConnection({ iceServers: turns, iceTransportPolicy: 'relay' }); pc.createDataChannel('t');
    const ok = await new Promise(res => { const to = setTimeout(() => res(false), 7000); pc.onicecandidate = e => { if (e.candidate && / relay /.test(e.candidate.candidate)) { clearTimeout(to); res(true); } }; pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => res(false)); });
    pc.close();
    st.className = ok ? 'status' : 'status err'; st.textContent = ok ? '✓ Relay working: players on blocked networks can connect through it.' : "✗ Couldn't get a relay. Check the app name and key.";
  } catch (e) { st.className = 'status err'; st.textContent = '✗ ' + (e.message || e); }
}
$('#rlSave') && ($('#rlSave').onclick = () => { Audio.click(); saveRelay({ app: $('#rlApp').value.trim(), key: $('#rlKey').value.trim() }); fillRelay(); testRelay($('#rlStatus')); });
$('#rlClear') && ($('#rlClear').onclick = () => { Audio.click(); saveRelay(null); fillRelay(); $('#rlStatus').textContent = 'Cleared: using the game\'s built-in relay settings, if any.'; });
// Real world or one of your tracks
W.mpKind = 'world';
$$('#mpKind [data-mpk]').forEach(b => b.onclick = () => { W.mpKind = b.dataset.mpk; $$('#mpKind [data-mpk]').forEach(x => x.classList.toggle('on', x === b)); $('#mpWorldPick').hidden = W.mpKind !== 'world'; $('#mpMapPick').hidden = W.mpKind !== 'map'; if (W.mpKind === 'map') fillMpMaps(); Audio.click(); });
function fillMpMaps() {
  const sel = $('#mpMapSel'), list = loadMaps(), cur = sel.value;
  sel.innerHTML = list.length ? list.map(m => `<option value="${m.id}">${escapeHtml(m.name)}${m.imported ? ' (imported)' : ''} · ${m.kind === 'model' ? '3D world' : escapeHtml(themeName(m.theme))}</option>`).join('') : '<option value="">No tracks yet: make one in the Track Editor</option>';
  if (list.some(m => m.id === cur)) sel.value = cur;
}
$('#mpMapImport').onclick = () => { W.importTo = 'mp'; $('#mapFile').click(); };
// drive a custom map together: free laps, no AI (everyone else is real)
function startCustomMp(m) {
  const lv = { ...mapLevel(m), rivals: 0, laps: 9999, mp: true };
  startStoryLoading(lv, () => { W.mpMap = m; });
}
net.mapFn = () => (W.mpMap && mode === 'story' ? W.mpMap : W.modelMap && mode === 'world' ? W.modelMap : null);
// ---------- 3D model maps: your own model as a driveable world (modelworld.js), inside World Drive ----------
let modelWorld = null;
const modelMapData = m => idbGet('mapm:' + m.h).then(d => (typeof d === 'string' ? d : null)).catch(() => null);
async function startModelWorld(m, data = null) {
  data = data || await modelMapData(m);
  if (!data) { toast('The model file for this map is missing on this device. Import it again.', 4200); return false; }
  showLoading('LOADING 3D MAP', m.name, 'Your own model as a driveable world', cv => drawModelThumb(cv, m));
  ride?.reset(); clearMode();
  const mw = new ModelWorld(scene);
  try { await mw.load(m, data, s => { $('#lsSub').textContent = s; }); }
  catch (e) { console.warn(e); mw.dispose(); hideLoading(); show('maps'); toast('Could not load that model: ' + (e && e.message || e), 4500); return false; }
  mode = 'world'; player.maxSpeed = 46; player.boost = 1; W.poiT = new Map();
  applyEnv(WORLD_ENV, 300, 2600); ground.visible = false;
  world.setVisible(true); world.setModelWorld(mw); modelWorld = mw; W.modelMap = m; W.originName = m.name;
  try { grass.clear(); } catch { } clearGps(false); player.fly = null; try { scrapbook && scrapbook.reset(); } catch { } try { fed && fed.clear(); } catch { }
  W.score = 0; W.dist = 0; W.combo = 0; player.hp = HP_MAX; W.wreck = 0; hurtFlash = 0; player.fuel = 1; player.power = 1; W.fuelWarn = 0; W.canT = 0;
  setHud('world'); show('none');
  endSink(); W.spawning = false; $('#wLoading').hidden = true;
  const sp = mw.spawn; player.place(sp.x, sp.z, sp.yaw, sp.y); player.pitch = player.roll = 0; player.vx = player.vz = 0; player.sync(0);
  camera.position.set(sp.x - Math.sin(sp.yaw) * 14, sp.y + 7, sp.z - Math.cos(sp.yaw) * 14);
  hideLoading(); hudMsg(m.name.toUpperCase(), 2000);
  if (mw.truncated) toast('That model is very detailed: only part of it is solid enough to drive on', 4000);
  return true;
}
// a joining player gets the host's model file over the connection
function waitModelMap(hm, statusEl) {
  return new Promise(res => {
    const t0 = performance.now();
    const tick = async () => {
      const own = await modelMapData(hm); if (own) return res(own);
      for (const [k, a] of net.assets) if (k.endsWith('|mm') && a && a.h === hm.h && typeof a.data === 'string') { try { await idbSet('mapm:' + hm.h, a.data); } catch { } return res(a.data); }
      let pct = 0; for (const [k, p] of net.partial || []) if (k.includes('|mm|')) pct = Math.round(p.got / p.n * 100);
      if (statusEl) statusEl.textContent = `Downloading the host's 3D map… ${pct}%`;
      if (performance.now() - t0 > 180000) return res(null);
      setTimeout(tick, 400);
    };
    tick();
  });
}
function drawModelThumb(cv, m) {
  const x = cv.getContext('2d'), W2 = cv.width, H2 = cv.height, g = x.createLinearGradient(0, 0, W2, H2); g.addColorStop(0, '#24304a'); g.addColorStop(1, '#3f6a5a');
  x.fillStyle = g; x.fillRect(0, 0, W2, H2);
  // a little isometric cube
  const cx = W2 / 2, cy = H2 / 2 + 6, s = Math.min(W2, H2) * 0.26;
  const P = (a, b, c) => [cx + (a - b) * s * 0.87, cy + (a + b) * s * 0.5 - c * s];
  const face = (pts, col) => { x.fillStyle = col; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.closePath(); x.fill(); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.stroke(); };
  face([P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], '#8fd3b0'); face([P(1, 0, 1), P(1, 1, 1), P(1, 1, 0), P(1, 0, 0)], '#4f9d80'); face([P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0)], '#3a7a63');
  x.fillStyle = '#fff'; x.font = `800 ${Math.round(H2 * 0.13)}px system-ui`; x.textAlign = 'left'; x.fillText((m.ext || '').toUpperCase(), 14, H2 - 14);
}
async function importModelMaps(files) {
  const added = []; let bad = 0, why = '';
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!MAP_EXTS.includes(ext)) continue;
    if (f.size > MAX_MAP_BYTES) { bad++; why = `${f.name} is ${fmtBytes(f.size)}; 3D maps can be up to ${fmtBytes(MAX_MAP_BYTES)}`; continue; }
    try {
      const buf = await f.arrayBuffer(); await testModel(ext, buf);
      const data = bufToB64(buf), h = hashStr(data); await idbSet('mapm:' + h, data);
      const m = cleanMap({ kind: 'model', name: f.name.replace(/\.[^.]+$/, '') || '3D Map', place: '3D model', h, ext, bytes: f.size, mult: 1, rot: 0, zup: ext === 'stl' });
      if (m) { upsertMap(m); added.push(m); } else bad++;
    } catch (e) { console.warn(e); bad++; why = `${f.name}: ${e && e.message || e}`; }
  }
  return { added, bad, why };
}
$('#mpJoin').onclick = () => { Audio.init(); S.name = $('#mpName').value.trim(); doJoin($('#mpCode').value, $('#mpStatus')); };
$('#mpCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#mpJoin').click(); });
net.onEvent = (type, data) => {
  if (type === 'ride' && data && data.m && data.m.k === 'dm') { try { const who = net.players.get(data.from)?.name || String(data.m.n || 'Driver').slice(0, 16), txt = String(data.m.text || '').slice(0, 120); if (txt && phoneOS) { phoneOS.dm(data.from, who, txt); try { Audio.ping && Audio.ping(0.5); } catch { } if (!(phoneScr && phoneScr.open_) && !(vr.presenting && phoneVR && phoneVR.state !== 'hip')) toast(`💬 ${who}: ${txt}`, 3500); } } catch { } return; }
  if (type === 'ride' && data && data.m && data.m.k === 'hit') { weaponHit(data.from, data.m.d); return; }
  if (type === 'ride' && data && data.m && data.m.k === 'psw') { const pl = net.players.get(data.from); if (pl && pl.rd === net.myId && ['flight', 'lights', 'wings', 'float', 'roll', 'flip', 'bflip', 'side', 'jump', 'target'].includes(data.m.w)) driverSwitch(data.m.w, data.from); return; }
  if (type === 'ride' && data && data.m && data.m.k === 'pfire') { const pl = net.players.get(data.from); if (pl && pl.rd === net.myId && myWeapon()) W.paxFireT = 0.3; return; }
  if (type === 'ride' && data && data.m && data.m.k === 'ko') { const who = net.players.get(data.from)?.name || 'a player'; try { const r = W.remotes.get(data.from); if (r) { blast(r.car.x, (r.car.y || 0) + 1, r.car.z, 5); wfx && wfx.boom(new THREE.Vector3(r.car.x, (r.car.y || 0) + 1, r.car.z), 5); } } catch { } W.score += 250; hudMsg(`KNOCKOUT · ${who.toUpperCase()} · +250`, 2200); Audio.chime(9); return; }
  if (type === 'shot') { try { if (mode === 'world' && wfx) { const [x, z] = world.proj(data.la, data.lo); wfx.spawn({ ...data, x, z }, false); } } catch { } return; }
  if (type === 'ride') { ride?.onMessage(data); return; }
  if (type === 'chat') { try { const i = String(data).indexOf(': '), who = i > 0 ? String(data).slice(0, i) : 'Driver', msg = i > 0 ? String(data).slice(i + 2) : String(data); if (who !== S.name) { phoneOS && phoneOS.notify(`${who}: ${msg}`, false); Audio.ping && Audio.ping(0.5); if (!phoneScr || !phoneScr.open_) toast(`💬 ${who}: ${msg}`, 3500); } } catch { } return; }
  if (type === 'join') { toast(`${data} joined`); Audio.chime(4); }
  if (type === 'leave') toast(`${data} left`);
  if (type === 'hostleft') toast('The host ended the session — you can keep driving solo', 4000);
  if (type === 'error') toast(String(data), 4000);
  updateMpBadge(); if (!$('#pause').hidden) renderMpTab();
};
function updateMpBadge() { const b = $('#hMp'); b.hidden = !net.active; if (net.active) b.textContent = `${net.role === 'host' ? 'HOST' : 'GUEST'} · ${net.code} · ${net.count} online`; }

// ---------- ride-along ----------
ride = createRide({
  net, scene, camera, player: () => player, remotes: () => W.remotes, mode: () => mode, paused: () => paused, toast, cam: () => S.cam, toUnits: v => toUnits(v), unit: () => S.units === 'kmh' ? 'km/h' : 'mph',
  mini: () => mini, cabinIntruders, place: (x, z, yaw) => placeW(x, z, yaw), myColor: () => PAINTS[S.paint].color, myDriver: () => myDriver.look, seatsFor: id => (id === net.myId ? myDriver.pseat : (net.driverFor(id) || {}).pseat || null), partsFor: id => (id === 'me' ? myParts : partsFor(id)), hudVisible: () => !$('#hud').hidden, vrOn: () => vr.presenting, audio: Audio,
  stopAuto: () => { if (autoDrive) setAutoDrive(false, true); },
  onChange: () => { if (!$('#pause').hidden && net.active) renderMpTab(); }, // keep the open multiplayer tab in step with ride requests
});

// ---------- player garages ----------
garage = new GarageSystem({
  scene, camera, canvas, world, net: () => net, toast, hudMsg, audio: Audio,
  score: () => W.score | 0, spend: n => { W.score -= n; }, player: () => player, mode: () => mode, paused: () => paused, spawning: () => !!W.spawning,
  driverName: () => S.name || 'Driver', color: () => PAINTS[S.paint].color, riding: () => !!ride?.riding, hudVisible: () => !$('#hud').hidden,
  place: (x, z, yaw) => placeW(x, z, yaw), renderGarage: () => renderGarage(),
  repair: () => { if (mode !== 'world' || W.wreck > 0 || (player.hp ?? HP_MAX) >= HP_MAX) return false; player.hp = HP_MAX; hurtFlash = 0; hudMsg('CAR REPAIRED', 1400); Audio.chime(3); return true; },
  openGarage: () => openPause('garage'), closePause: () => { if (!$('#pause').hidden) resume(); }, shake: n => { camShake = Math.max(camShake, n); }, onChange: () => { },
});

// the main menu's Story Mode line, counted from the actual races
try { $('#storyTag').textContent = `${LEVELS.length} races · ${new Set(LEVELS.map(l => l.place)).size} real places`; } catch { }
// ---------- custom tracks: list, editor, import / export ----------
const THEME_NAMES = { lakeside: 'Lakeside evening', desert: 'Desert day', neon: 'Neon city night', alpine: 'Snowy alpine', coast: 'Sunny coast', volcano: 'Volcano night', forest: 'Autumn forest', dusk: 'Desert sunset', harbor: 'Harbor at night', glacier: 'Arctic twilight', downtown: 'City at dusk', ash: 'Volcano by day' };
const themeName = k => THEME_NAMES[k] || k;
function mapStats(m) { try { const I = trackInfo(mapLevel(m)); return `${distTxt(I.length)} · ${m.laps} lap${m.laps > 1 ? 's' : ''} · ${m.rivals ? m.rivals + ' rival' + (m.rivals > 1 ? 's' : '') : 'solo'}`; } catch { return ''; } }
function renderMaps() {
  const list = loadMaps(), grid = $('#mapGrid');
  $('#mapsTag') && ($('#mapsTag').textContent = list.length ? `${list.length} track${list.length > 1 ? 's' : ''} saved` : 'Build your own race tracks');
  if (!list.length) { grid.innerHTML = '<div class="maps-empty">No tracks yet. Make one with <b>New track</b>, import a <b>.json</b> track file a friend sent you, or import a 3D model (<b>.glb .gltf .obj .stl</b>) to drive around as a world.</div>'; return; }
  grid.innerHTML = list.map(m => m.kind === 'model' ? `<div class="map-card" data-mid="${m.id}"><canvas width="320" height="200"></canvas><div class="mc-b"><span class="tagimp">3D world</span><h4>${escapeHtml(m.name)}</h4><p class="sub">${escapeHtml(m.ext.toUpperCase())} · ${fmtBytes(m.bytes || 0)} · size ×${m.mult}${m.rot ? ' · turned ' + m.rot * 90 + '°' : ''}${m.zup ? ' · stood up' : ''}</p><p class="sub">Drive anywhere on your model (World Drive)</p>
    <div class="mc-act"><button class="go" data-ma="drive">Drive</button><button data-ma="size">Size ×${m.mult}</button><button data-ma="turn">Turn 90°</button><button data-ma="zup">${m.zup ? 'Lay flat' : 'Stand up'}</button><button data-ma="del">Delete</button></div></div></div>`
    : `<div class="map-card" data-mid="${m.id}"><canvas width="320" height="200"></canvas><div class="mc-b">${m.imported ? '<span class="tagimp">Imported</span>' : ''}<h4>${escapeHtml(m.name)}</h4><p class="sub">${escapeHtml(m.place)} · ${escapeHtml(themeName(m.theme))}</p><p class="sub">${mapStats(m)}</p>
    <div class="mc-act"><button class="go" data-ma="race">Race</button><button data-ma="edit">Edit</button><button data-ma="export">Export</button><button data-ma="del">Delete</button></div></div></div>`).join('');
  grid.querySelectorAll('.map-card').forEach(card => {
    const m = list.find(x => x.id === card.dataset.mid); try { if (m.kind === 'model') drawModelThumb(card.querySelector('canvas'), m); else thumb(card.querySelector('canvas'), mapLevel(m), false); } catch { }
    card.querySelectorAll('[data-ma]').forEach(b => b.onclick = () => {
      const a = b.dataset.ma; Audio.click();
      if (a === 'drive') { Audio.init(); Audio.setMusic(S.music); startModelWorld(m); return; }
      if (a === 'size' || a === 'turn' || a === 'zup') { const steps = [0.25, 0.5, 1, 2, 4, 8]; if (a === 'size') m.mult = steps[(steps.indexOf(m.mult) + 1) % steps.length] || 1; else if (a === 'turn') m.rot = (m.rot + 1) % 4; else m.zup = !m.zup; m.edited = Date.now(); upsertMap(m); renderMaps(); return; }
      if (a === 'del' && m.kind === 'model' && b.dataset.sure && !loadMaps().some(x => x.id !== m.id && x.h === m.h)) idbSet('mapm:' + m.h, null);
      if (a === 'race') { Audio.init(); Audio.setMusic(S.music); startStoryLoading(mapLevel(m)); }
      else if (a === 'edit') openEditor(m);
      else if (a === 'export') exportMap(m);
      else if (a === 'del') { if (b.dataset.sure) { deleteMap(m.id); renderMaps(); } else { b.dataset.sure = '1'; b.textContent = 'Sure?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Delete'; } }, 2500); } }
    });
  });
}
$('#mapNew').onclick = () => { Audio.click(); openEditor(newMap(Object.keys(THEMES)), true); };
$('#mapImport').onclick = () => { W.importTo = 'maps'; $('#mapFile').click(); };
$('#mapFile').onchange = async e => {
  const files = [...(e.target.files || [])]; e.target.value = ''; if (!files.length) return;
  const is3d = f => MAP_EXTS.includes((f.name.split('.').pop() || '').toLowerCase());
  const st0 = W.importTo === 'mp' ? $('#mpStatus') : $('#mapStatus'); if (files.some(is3d) && st0) { st0.className = 'status'; st0.textContent = 'Reading your 3D model…'; }
  const r3 = await importModelMaps(files.filter(is3d)), rj = files.some(f => !is3d(f)) ? await importFiles(files.filter(f => !is3d(f)), Object.keys(THEMES)) : { added: [], bad: 0 };
  const added = [...r3.added, ...rj.added], bad = r3.bad + rj.bad;
  const msg = added.length ? `Imported ${added.length} map${added.length > 1 ? 's' : ''}${bad ? ` (${bad} file${bad > 1 ? 's' : ''} couldn't be read${r3.why ? ': ' + r3.why : ''})` : ''}.` : r3.why ? 'Could not import: ' + r3.why : 'That file isn\'t an Overpass track or a 3D model (.glb, .gltf, .obj, .stl).';
  if (W.importTo === 'mp') { fillMpMaps(); if (added[0]) $('#mpMapSel').value = added[0].id; const st = $('#mpStatus'); st.className = added.length ? 'status' : 'status err'; st.textContent = msg; }
  else { renderMaps(); const st = $('#mapStatus'); st.className = added.length ? 'status' : 'status err'; st.textContent = msg; }
};
let editor = null, edMap = null, edT = 0;
function openEditor(m, fresh = false) {
  edMap = JSON.parse(JSON.stringify(m)); edMap.fresh = fresh;
  show('editor');
  if (!editor) editor = new MapEditor($('#edCanvas'), (map, kind) => { if (kind === 'edit') { map.edited = Date.now(); edStats(); } else if (kind === 'live') { clearTimeout(edT); edT = setTimeout(() => { map.edited = Date.now(); edStats(); }, 120); } $('#edDel').disabled = editor.sel < 0 || map.pts.length <= 4; });
  $('#edTheme').innerHTML = Object.keys(THEMES).map(k => `<option value="${k}">${escapeHtml(themeName(k))}</option>`).join('');
  $('#edName').value = edMap.name; $('#edPlace').value = edMap.place; $('#edTheme').value = edMap.theme; $('#edLaps').value = edMap.laps; $('#edRivals').value = edMap.rivals; $('#edSkill').value = edMap.skill; $('#edHills').value = edMap.hills;
  requestAnimationFrame(() => { editor.open(edMap, THEMES[edMap.theme]); edStats(); $('#edDel').disabled = true; });
}
function edFields() {
  const m = edMap; if (!m) return;
  m.name = $('#edName').value.trim() || 'Custom Track'; m.place = $('#edPlace').value.trim() || 'Custom map'; m.theme = $('#edTheme').value;
  m.laps = Math.max(1, Math.min(20, Math.round(+$('#edLaps').value || 3))); m.rivals = Math.max(0, Math.min(7, Math.round(+$('#edRivals').value || 0)));
  m.skill = +$('#edSkill').value; m.hills = +$('#edHills').value; m.edited = Date.now();
}
function edStats() {
  const m = edMap; if (!m) return; edFields();
  $('#edSkillV').textContent = m.skill < 0.88 ? 'relaxed' : m.skill < 1.0 ? 'quick' : m.skill < 1.1 ? 'fast' : 'ruthless'; $('#edHillsV').textContent = m.hills < 0.15 ? 'flat' : m.hills < 0.8 ? 'gentle' : m.hills < 1.4 ? 'rolling' : 'mountainous';
  let I = null; try { I = trackInfo(mapLevel(m)); } catch { }
  $('#edStats').textContent = I ? `${distTxt(I.length)} lap · ${I.corners} corners · tightest ${shortTxt(I.minRadius)}` : '';
  const warn = [];
  try { if (selfCrossing(smoothLoop(m.pts))) warn.push('The track crosses itself: cars will drive straight through the crossing.'); } catch { }
  if (I && I.minRadius < 16) warn.push(`Very tight bend (${shortTxt(I.minRadius)}): expect everyone to crawl round it.`);
  if (I && I.length < 450) warn.push('Very short lap: try making it bigger.');
  $('#edWarn').hidden = !warn.length; $('#edWarn').textContent = warn.join(' ');
}
function edSave() { if (!edMap) return null; edFields(); const m = cleanMap(edMap, Object.keys(THEMES)); if (!m) return null; m.edited = Date.now(); upsertMap(m); edMap.id = m.id; edMap.fresh = false; return m; }
['#edName', '#edPlace', '#edLaps', '#edRivals', '#edSkill', '#edHills'].forEach(k => $(k).addEventListener('input', () => edStats()));
['#edName', '#edPlace', '#edLaps', '#edRivals'].forEach(k => $(k).addEventListener('keydown', e => e.stopPropagation()));
$('#edTheme').onchange = () => { edStats(); editor.theme = THEMES[edMap.theme]; editor.draw(); };
$('#edDel').onclick = () => { if (editor.removePoint()) Audio.click(); };
$('#edRev').onclick = () => { editor.reverse(); Audio.click(); };
$('#edSmall').onclick = () => { editor.scale(0.9); Audio.click(); };
$('#edBig').onclick = () => { editor.scale(1.1); Audio.click(); };
$('#edFit').onclick = () => { editor.fit(); editor.draw(); };
$('#edSave').onclick = () => { const m = edSave(); toast(m ? 'Track saved' : 'Could not save the track'); Audio.click(); };
$('#edExport').onclick = () => { const m = edSave(); if (m) exportMap(m); };
$('#edTest').onclick = () => { const m = edSave(); if (!m) return; Audio.init(); Audio.setMusic(S.music); startStoryLoading(mapLevel(m)); };
$('#edBack').onclick = () => { edSave(); show('maps'); };

// ---------- loading screens: a preview, the name, and a tip while things load ----------
const TIPS = [
  '<b>Nitro</b> refills slowly on its own. Save it for long straights.',
  'Tap anything in World Drive with a weapon equipped to <b>lock on</b> to it.',
  '<b>Photo mode</b> is in the pause menu: fly the camera around, pick a look, save the shot.',
  'The <b>Seasons</b> setting follows the real date and snow where you are. Force Winter for a snowy drive.',
  'Deposit points at the <b>bank kiosk</b> beside your garage to keep them for next time.',
  'The rivals use your car\'s top speed. Upgrades won\'t make races easy, but your driving line will.',
  'Brake before the bend, not in it. Turn in late and clip the inside at the apex.',
  'The <b>Visual filter</b> in Settings has Cinematic, Vivid and Off. Turn it off if your phone runs hot.',
  'Drift with the handbrake for tyre smoke and rubber marks.',
  'Real weather is on by default. Rain makes the roads wet and shiny.',
  'Your car gets visibly beaten up as it takes damage. Repair it at your garage.',
  'Lift off the gas at high revs to hear the exhaust crackle.',
  'Stunts are upgrades in the garage: barrel roll, front flip, two-wheeler and jump.',
  'In VR, tap the arrows on the steering wheel to set a cruising speed.',
];
function showLoading(kind, name, sub, draw) {
  $('#lsKind').textContent = kind; $('#lsName').textContent = name || ''; $('#lsSub').textContent = sub || '';
  W.tipI = ((W.tipI ?? Math.floor(Math.random() * TIPS.length)) + 1) % TIPS.length; $('#lsTip').innerHTML = TIPS[W.tipI];
  const cv = $('#lsMap'); try { draw ? draw(cv) : drawStreetsPreview(cv, name); } catch { }
  $('#loadScr').hidden = false;
}
function hideLoading() { $('#loadScr').hidden = true; }
// World Drive preview: a stylised night map with a pin where you'll start
function drawStreetsPreview(cv, name) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height; let sd = 7; for (const ch of String(name || 'x')) sd = (sd * 31 + ch.charCodeAt(0)) >>> 0; const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1b1838'); g.addColorStop(1, '#0d0b1c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(70,140,210,.35)'; x.beginPath(); x.ellipse(w * (0.1 + r() * 0.3), h * (0.7 + r() * 0.3), w * 0.3, h * 0.25, r(), 0, 7); x.fill(); // water
  x.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const major = i < 8; x.strokeStyle = major ? 'rgba(255,190,120,.75)' : 'rgba(255,255,255,.18)'; x.lineWidth = major ? 3 : 1.2; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); const a = r() * 6.28; for (let k = 0; k < 4; k++) { px += Math.cos(a + (r() - 0.5) * 0.6) * (40 + r() * 90); py += Math.sin(a + (r() - 0.5) * 0.6) * (40 + r() * 90); x.lineTo(px, py); } x.stroke(); }
  x.fillStyle = '#ff5a3c'; x.beginPath(); x.arc(w / 2, h / 2 - 8, 11, Math.PI, 0); x.lineTo(w / 2, h / 2 + 14); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2 - 8, 4, 0, 7); x.fill();
}
function startStoryLoading(lv, after) {
  const I = (() => { try { return trackInfo(lv); } catch { return null; } })();
  showLoading('LOADING RACE', lv.name, `${lv.place}${I ? ' · ' + distTxt(I.length) + ' lap · ' + lv.laps + ' laps' : ''}`, cv => thumb(cv, lv, false));
  // let the loading screen paint before the track is built (that takes a moment)
  requestAnimationFrame(() => requestAnimationFrame(() => { try { startStory(lv); if (after) after(); } finally { setTimeout(hideLoading, 250); } }));
}

// ---------- photo mode: freeze, fly the camera around your car, pick a look, save a picture ----------
function enterPhoto() {
  if (mode !== 'story' && mode !== 'world') return;
  const c = player, d = camera.position.clone().sub(new THREE.Vector3(c.x, (c.y || 0) + 1, c.z));
  W.photo = { th: Math.atan2(d.x, d.z), ph: Math.max(0.05, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, d.y / (d.length() || 1)))))), r: Math.max(7, Math.min(30, d.length() * 1.5)), fx: S.fx === 'off' ? 'cinematic' : S.fx, hide: false, fov: 50 };
  paused = true; $('#pause').hidden = true; document.body.classList.add('photo'); $('#photoUi').hidden = false; syncPhotoUi(); Audio.click();
}
function exitPhoto() { if (!W.photo) return; player.mesh.visible = true; W.photo = null; document.body.classList.remove('photo'); $('#photoUi').hidden = true; openPause(tab === 'photo' ? 'map' : tab); }
function syncPhotoUi() { const P = W.photo; if (!P) return; $$('#phFx [data-pfx]').forEach(b => b.classList.toggle('on', b.dataset.pfx === P.fx)); $('#phCar').textContent = P.hide ? 'Show car' : 'Hide car'; }
function photoCam(car) {
  const P = W.photo, cx = car.x, cy = (car.y || 0) + 1, cz = car.z;
  camera.position.set(cx + Math.sin(P.th) * Math.cos(P.ph) * P.r, cy + Math.sin(P.ph) * P.r, cz + Math.cos(P.th) * Math.cos(P.ph) * P.r);
  // keep the camera above the ground
  const gy = mode === 'world' ? world.heightAt(camera.position.x, camera.position.z) : track && track.land ? track.heightAt(camera.position.x, camera.position.z) : 0;
  if (Number.isFinite(gy)) camera.position.y = Math.max(camera.position.y, gy + 0.4);
  camera.lookAt(cx, cy, cz); if (camera.fov !== P.fov) { camera.fov = P.fov; camera.updateProjectionMatrix(); }
  player.mesh.visible = !P.hide;
}
function photoSave() {
  try {
    canvas.toBlob(b => {
      if (!b) return; const a = document.createElement('a'), d = new Date(); a.href = URL.createObjectURL(b);
      a.download = `overpass-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Photo saved');
    }, 'image/png');
  } catch (e) { toast('Could not save the photo'); }
}
{ // drag to orbit, pinch / scroll to zoom
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', e => { if (!W.photo) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    const P = W.photo, p = pts.get(e.pointerId); if (!P || !p) return;
    if (pts.size === 1) { P.th -= (e.clientX - p.x) * 0.008; P.ph = Math.max(-0.05, Math.min(1.5, P.ph + (e.clientY - p.y) * 0.006)); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) P.r = Math.max(2.5, Math.min(60, P.r * pinch / d)); pinch = d; }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { if (!W.photo) return; e.preventDefault(); W.photo.r = Math.max(2.5, Math.min(60, W.photo.r * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  $$('#phFx [data-pfx]').forEach(b => b.onclick = () => { if (!W.photo) return; W.photo.fx = b.dataset.pfx; Audio.click(); syncPhotoUi(); });
  $('#phCar').onclick = () => { if (!W.photo) return; W.photo.hide = !W.photo.hide; Audio.click(); syncPhotoUi(); };
  $('#phSnap').onclick = () => { if (!W.photo) return; W.photoSnap = true; const f = $('#phFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); try { Audio.click(); } catch { } };
  $('#phExit').onclick = () => exitPhoto();
  window.addEventListener('keydown', e => { if (W.photo && e.key === 'Escape') { e.stopImmediatePropagation(); exitPhoto(); } }, true);
}

// ---------- pause panel ----------
let leafGps = null, leafGpsV = -1;
let tab = 'map', leaf = null, leafMe = null, leafOthers = new Map(), leafTrack = null, leafTimer = 0;
function openPause(t = tab) {
  garage?.cancel(true);
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
  if (t === 'photo') { enterPhoto(); return; }
  if (t === 'scrapbook') { Audio.click(); scrapbook ? scrapbook.open() : toast('The scrapbook could not load'); return; }
  if (t === 'federation') { Audio.click(); fed ? fed.open() : toast('The Liberation Log could not load'); return; }
  tab = t;
  $$('#pnav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.pbody [data-pane]').forEach(p => p.hidden = p.dataset.pane !== t);
  if (t === 'map') openMap();
  if (t === 'mp') renderMpTab();
  if (t === 'garage') renderGarage();
  if (t === 'loc') { renderLocPickers(); $('#locSub').textContent = S.teleportCost ? `Jump anywhere on Earth for ${TELEPORT_COST.toLocaleString()} points. Streets load as you drive.` : 'Jump anywhere on Earth for free (teleport cost is off in Settings). Streets load as you drive.'; syncTeleportUi(); }
}
$$('#pnav [data-tab]').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
// the scrapbook: a button on the main menu and a tab in the pause menu
function syncScrapbookUi() { const el = $('#sbCount'); if (el && scrapbook) el.textContent = scrapbook.count ? `${scrapbook.count} ${scrapbook.count === 1 ? 'city' : 'cities'} · ${scrapbook.countries} ${scrapbook.countries === 1 ? 'country' : 'countries'}` : "Cities you've driven through"; }
$$('[data-scrapbook-open]').forEach(b => b.onclick = () => { Audio.click(); scrapbook ? scrapbook.open() : toast('The scrapbook could not load'); });
syncScrapbookUi(); if (scrapbook) scrapbook.o.onClose = syncScrapbookUi;
$$('[data-fed-open]').forEach(b => b.onclick = () => { Audio.click(); fed ? fed.open() : toast('The Liberation Log could not load'); }); syncFedUi();
$('#pauseBtn').onclick = () => openPause();
$('#pause').addEventListener('pointerdown', e => { if (e.target.id === 'pause') resume(); });
$('#pTeleport').onclick = () => { teleport(chosenLoc.lat, chosenLoc.lon, chosenLoc.name); };
// teleporting: always available; costs 2,500 points unless the cost is switched off in Settings, and keeps the rest of your points (and your health and fuel)
function teleport(lat, lon, name, free = false) {
  if (!S.teleportCost) free = true;
  if (!free && mode === 'world' && W.score < TELEPORT_COST) { toast(`Teleporting costs ${TELEPORT_COST.toLocaleString()} points. You have ${(W.score | 0).toLocaleString()}.`, 3200); return; }
  const keep = mode === 'world' ? { score: Math.max(0, W.score - (free ? 0 : TELEPORT_COST)), dist: W.dist, hp: player.hp, fuel: player.fuel } : null;
  resume(); startWorld(lat, lon, name);
  if (keep) { W.score = keep.score; W.dist = keep.dist; if (keep.hp > 0) player.hp = keep.hp; if (keep.fuel != null) player.fuel = keep.fuel; }
  toast('Teleported to ' + (name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`) + (keep && !free ? ` · −${TELEPORT_COST.toLocaleString()} pts` : ''), 2600);
}
const tpLabel = () => S.teleportCost ? `Teleport · ${TELEPORT_COST.toLocaleString()} pts` : 'Teleport · free';
function syncTeleportUi() { const b = $('#pTeleport'); if (b) { b.hidden = false; b.textContent = tpLabel(); } }
syncTeleportUi();

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
      mk(tpLabel().replace('Teleport', 'Teleport here'), 'cta', () => { leaf.closePopup(); teleport(e.latlng.lat, e.latlng.lng, 'Map pick'); });
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
  for (const [id, p] of net.players) list.push(`<div>${avatarHtml(p.av && /^data:image\/(jpeg|png|webp);base64,/.test(p.av) ? p.av : null, p.name, p.color, 28)}<span>${escapeHtml(p.name)}</span>${p.lat != null ? `<button class="ghost sm" data-goto="${id}">Go to</button>${ride ? ride.panelRow(id) : ''}` : '<small>connecting</small>'}</div>`);
  el.innerHTML = `<h3>${net.role === 'host' ? 'Hosting' : 'Connected'}</h3><p class="sub">Session code — share it with friends:</p><div class="bigcode">${net.code}</div>
    <div class="mp-list">${list.join('')}</div><button class="ghost" id="pmLeave">Leave session</button><p class="note">STUN-only connections: if a friend can't connect, one of you may be on a strict NAT (mobile hotspot or office network).</p>`;
  el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const p = net.players.get(b.dataset.goto); if (p) teleport(p.lat, p.lon, p.name, true); });
  el.querySelectorAll('[data-ride]').forEach(b => b.onclick = () => { if (ride.request(b.dataset.ride)) resume(); else renderMpTab(); });
  el.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => { ride.accept(b.dataset.accept); resume(); });
  el.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => { ride.decline(b.dataset.decline); renderMpTab(); });
  el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => { ride.cancel(); renderMpTab(); });
  el.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => { ride.kick(b.dataset.kick); renderMpTab(); });
  el.querySelectorAll('[data-exit]').forEach(b => b.onclick = () => { resume(); ride.exit(); });
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
    if (fed) for (const f of fed.dots()) { if (f.kind === 'jet' || f.kind === 'sub' || f.kind === 'car') { const [a, b] = P(f.x, f.z); if (Math.hypot(a - w / 2, b - h / 2) > w / 2 - 4) continue;
        c.save(); c.translate(a, b); c.fillStyle = '#ff3b3b'; c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath();
        if (f.kind === 'jet') { c.rotate(Math.PI - (f.yaw - player.yaw)); c.moveTo(0, 5); c.lineTo(4, -4); c.lineTo(0, -2); c.lineTo(-4, -4); c.closePath(); } else if (f.kind === 'car') { c.rotate(Math.PI - (f.yaw - player.yaw)); c.rect(-2.6, -4, 5.2, 8); } else c.arc(0, 0, 3.2, 0, 6.283);
        c.fill(); c.stroke(); c.restore(); continue; }
      let [a, b] = P(f.x, f.z); const dd = Math.hypot(a - w / 2, b - h / 2), lim = w / 2 - 10; if (dd > lim) { if (f.dead) continue; a = w / 2 + (a - w / 2) * lim / dd; b = h / 2 + (b - h / 2) * lim / dd; }
      c.save(); c.translate(a, b); c.rotate(Math.PI - (f.yaw - player.yaw)); const sz = Math.max(5, Math.min(14, 375 * s / 2)); c.fillStyle = f.dead ? 'rgba(120,120,120,.85)' : '#ff3b3b'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, -sz); c.lineTo(sz * 0.4, -sz * 0.6); c.lineTo(sz * 0.4, sz); c.lineTo(-sz * 0.4, sz); c.lineTo(-sz * 0.4, -sz * 0.6); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    if (planes) for (const pl of planes.dots()) { let [a, b] = P(pl.x, pl.z); const dd = Math.hypot(a - w / 2, b - h / 2), lim = w / 2 - 8; if (dd > lim) { a = w / 2 + (a - w / 2) * lim / dd; b = h / 2 + (b - h / 2) * lim / dd; } c.save(); c.translate(a, b); c.font = '16px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = pl.tagged ? '#ff6a4a' : '#ffffff'; c.shadowColor = '#000'; c.shadowBlur = 3; c.fillText('✈', 0, 0); c.restore(); }
    { const blink = (performance.now() / 250 | 0) % 2; for (const cp of police.cops) { if (cp.leave) continue; let [a, b] = P(cp.car.x, cp.car.z); const dd = Math.hypot(a - w / 2, b - h / 2), lim = w / 2 - 8; if (dd > lim) { a = w / 2 + (a - w / 2) * lim / dd; b = h / 2 + (b - h / 2) * lim / dd; } c.fillStyle = blink ? '#ff2a2a' : '#2a6bff'; c.beginPath(); c.arc(a, b, 4.5, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); } }
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
  if (W.photo) { photoCam(car); return; }
  if (garage?.busy && garage.cameraStep(camera, dt)) return; // overhead view while choosing a garage spot
  if (ride?.riding && ride.cockpitCam(camera, dt)) return; // passenger seat view
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
    else if (track && track.land) camPos.y = Math.max(camPos.y, track.heightAt(camPos.x, camPos.z) + 1.6);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * (mode === 'story' && race && !race.started ? 1.6 : 7)));
    camTarget.set(car.x + f[0] * 4, cy + 1.1, car.z + f[1] * 4);
    if (car.fly) camTarget.y += Math.sin(car.fly.pitch) * 6;
    if (mode === 'world') camera.position.y = Math.max(camera.position.y, world.heightAt(camera.position.x, camera.position.z) + 1.2);
    else if (track && track.land) camera.position.y = Math.max(camera.position.y, track.heightAt(camera.position.x, camera.position.z) + 1.2);
  }
  if (camShake > 0) { camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake * 0.5; camShake = Math.max(0, camShake - dt * 2); }
  // speed feel: a low rumble that builds with speed (rougher off-road), and a punch of field of view when the nitro kicks in
  W.camT = (W.camT || 0) + dt;
  const rough = car.air || car.fly ? 0 : Math.pow(Math.max(0, Math.min(1, (sp - 18) / 45)), 1.4) * (car.offroad ? 2.2 : 1) * 0.055, T = W.camT;
  if (rough > 0) { camera.position.x += (Math.sin(T * 31.7) + Math.sin(T * 17.3)) * rough * 0.5; camera.position.y += (Math.sin(T * 27.1 + 1.3) + Math.sin(T * 41.9)) * rough * 0.35; }
  if (car.boosting && !W.wasBoost) W.fovKick = 9; W.wasBoost = car.boosting; W.fovKick = Math.max(0, (W.fovKick || 0) - dt * 14);
  if (W.dive && mode === 'world') { // a diving camera stays under the water (and off the seabed)
    const cx = camera.position.x, cz = camera.position.z;
    if (world.water.inside(cx, cz)) { const s2 = world.heightAt(cx, cz) - 0.25, b = world.terrainY(cx, cz); camera.position.y = Math.max(b + 0.6, Math.min(s2 - 0.3, camera.position.y)); }
    else { camera.position.x += (car.x - cx) * 0.5; camera.position.z += (car.z - cz) * 0.5; }
  }
  camera.lookAt(camTarget);
  const fov = 62 + Math.min(sp, 70) * 0.22 + (car.boosting ? 6 : 0) + (W.fovKick || 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * ((W.fovKick || 0) > 0 ? 9 : 4)); camera.updateProjectionMatrix();
  // motion blur (with the visual filter on): streaks toward the screen edges at speed, more with nitro
  W.blur = Math.max(0, Math.min(1, (sp - 26) / 40)) * 0.75 + (car.boosting ? 0.35 : 0);
}

// ---------- HUD ----------
const toUnits = v => Math.round(Math.abs(v) * (S.units === 'kmh' ? 3.6 : 2.237));
function updateHud(dt) {
  { const tf = $('#tFly'); if (tf) tf.hidden = !(flyOn() || W.dive); syncFloatUi(); { const td = $('#tDive'); if (td) { const sh = mode === 'world' && ((subOn() && (W.onWater || !!W.dive)) || (myCutter.own && !W.spawning && onIceNow())); if (td.hidden === sh) td.hidden = !sh; td.classList.toggle('on', !!W.dive); } } for (const [sel, kind] of [['#tRoll', 'roll'], ['#tFlip', 'flip'], ['#tBflip', 'bflip'], ['#tSide', 'side'], ['#tJump', 'jump']]) { const tr = $(sel); if (tr) { const sh = mode === 'world' && myStunt[kind]; if (tr.hidden === sh) tr.hidden = !sh; } } const tw2 = $('#tWings'); if (tw2) { const sh = mode === 'world' && canFly(); if (tw2.hidden === sh) tw2.hidden = !sh; tw2.classList.toggle('on', flyOn()); } const tw = $('#tFire'); if (tw) tw.hidden = !((myWeapon() && mode === 'world') || (ride?.riding && net.weaponFor(ride.riding.id))); }
  $('#hSpeed').textContent = toUnits(player.speed);
  // rev counter and gear (from the engine sound's gearbox)
  { const gb = W.gb, rpm = gb ? Math.max(0, Math.min(1, gb.rpm)) : Math.min(1, Math.abs(player.speed) / 52), g = player.speed < -0.5 ? 'R' : gb ? String(gb.gear) : '';
    const ta = $('#hTach'); if (ta) ta.style.strokeDashoffset = (218 * (1 - rpm)).toFixed(1);
    const sp = ta && ta.closest('.speedo'); if (sp) sp.classList.toggle('red', rpm > 0.86);
    const ge = $('#hGear'); if (ge && ge.textContent !== g) { ge.textContent = g; ge.classList.remove('shift'); void ge.offsetWidth; ge.classList.add('shift'); } }
  updateFuelHud(dt);
  // depth gauge while diving: how far down you are, and how far below you the seabed is
  { const el = $('#hDepth'), D = W.dive, sh = mode === 'world' && !!D; if (el) { if (el.hidden === sh) el.hidden = !sh;
    if (sh) { const m = v => S.units === 'kmh' ? Math.round(v) + ' m' : Math.round(v * 3.281) + ' ft'; const k = Math.min(1, D.depth / Math.max(1, D.bed || 1));
      const txt = `<small>DEPTH</small><b>${m(D.depth)}</b><span>bottom ${m(Math.max(0, (D.bed || 0) - D.depth))} below</span><i style="--k:${k.toFixed(3)}"></i>`; if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = txt; } } } } updateHealthHud(); $('#hBoost').style.transform = `scaleX(${player.boost})`; $('#hBoost').parentElement.classList.toggle('on', player.boosting);
  if (mode === 'story' && race) {
    const r = race.player, pos = r.pos || race.racers.length, hp = $('#hPos'); hp.innerHTML = `<b>${pos}</b><span>/${race.racers.length}</span>`;
    // flash when you gain or lose a place
    if (race.started && W.lastPos && pos !== W.lastPos) { hp.classList.remove('gain', 'lose'); void hp.offsetWidth; hp.classList.add(pos < W.lastPos ? 'gain' : 'lose'); }
    W.lastPos = pos;
    $('#hLap').innerHTML = level.mp ? `<small>LAP</small><b>${r.lap + 1}</b>` : `<small>LAP</small><b>${Math.min(level.laps, r.lap + 1)}/${level.laps}</b>`;
    $('#hTimes').innerHTML = `<div><small>TIME</small>${fmt(race.time)}</div><div><small>LAST</small>${fmt(r.lastLap)}</div><div><small>BEST</small>${fmt(r.bestLap)}</div>`;
    $('#wrong').hidden = !(r.wrongWay > 1.2 && race.started && !r.finished);
  } else if (mode === 'world') {
    $('#hScore').innerHTML = `<small>SCORE</small><b>${W.score.toLocaleString()}</b>`;
    $('#hDist').innerHTML = `<small>DIST</small><b>${S.units === 'kmh' ? (W.dist / 1000).toFixed(1) + ' km' : (W.dist / 1609).toFixed(1) + ' mi'}</b>`;
    const [la, lo] = world.unproj(player.x, player.z);
    if (world.mw) $('#hTimes').innerHTML = `<div><small>MAP</small>${escapeHtml((W.modelMap && W.modelMap.name || '3D map').slice(0, 18))}</div><div><small>X · Z</small>${Math.round(player.x)} · ${Math.round(player.z)}</div>`;
    else $('#hTimes').innerHTML = `<div><small>LAT</small>${la.toFixed(5)}</div><div><small>LON</small>${lo.toFixed(5)}</div>${world.elev.enabled ? `<div><small>ALT</small>${Math.round(S.units === 'kmh' ? world.elev.absolute(player.y || 0) : world.elev.absolute(player.y || 0) * 3.281)} ${S.units === 'kmh' ? 'm' : 'ft'}</div>` : ''}`;
    const st = $('#hStreet'), sh = mode === 'world' && !!W.street && !world.mw; if (st.hidden === sh) st.hidden = !sh; if (st.textContent !== W.street) st.textContent = W.street;
    // styled like the local street-name sign, always (on the water and in the air too)
    const sc = 'street ' + streetSignClass(); if (st.className !== sc) st.className = sc;
  }
}

// ---------- main loop ----------
let last = performance.now(), t = 0, miniT = 0, sendT = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt; vrDt = dt; remotesDone = false; W.frameNo = (W.frameNo || 0) + 1; W.frameDt = dt;
  if (mode !== 'world' && (police.stars || police.cops.length)) police.clear();
  // menus, pause and shops: the gamepad moves between buttons (while driving it's read with the rest of the controls)
  if (uiActive()) try { readPad(); } catch { }
  if (paused || mode !== 'story') try { Audio.crowd && Audio.crowd(0, 0, 0); } catch { }
  updateWanted();
  { const nl = mode === 'world' ? myNitro.lvl : 0, two = mode === 'world' && b2Active(); player.nitroTop = two ? 1 + (nitroTopOf(nl) - 1) * 2 : nitroTopOf(nl); player.nitroPush = two ? 1 + (nitroPushOf(nl) - 1) * 2 : nitroPushOf(nl); player.nitroDrain = two ? 1.5 : 1; } // nitrous upgrades (and the second booster) only count in World Drive
  try { nitroFx.setBooster && nitroFx.setBooster(b2Cfg()); } catch { }
  try { Audio.nitroHiss && Audio.nitroHiss(!paused && (mode === 'world' || mode === 'story') && player.boosting && !player.sink ? (mode === 'world' && b2Active() ? 1.6 : 1) : 0); } catch { }
  if (wings) try {
    if (W.wingShow > 0) W.wingShow -= dt;
    wings.set(mode === 'world' && wingsActive() ? { style: myWings.style, color: myWings.color, paint: PAINTS[S.paint].color, model: S.model } : null);
    wings.update(dt, player, wingsOpenWant());
  } catch (e) { if (!W.wingFail) { W.wingFail = 1; console.warn('[overpass] wings:', e); } }
  // draw distance: measure the frame time; if frames get slow (vs. the best this device does), pull the distance in, then let it back out
  W.ftAvg = (W.ftAvg ?? 1 / 60) * 0.93 + dt * 0.07; W.vdT = (W.vdT ?? 0) - dt;
  if (W.vdT <= 0) {
    W.vdT = 0.25; W.vdS = (W.vdS ?? 0) + 0.25;
    if (W.vdS >= 1) { W.vdS = 0; W.ftBest = Math.min((W.ftBest ?? W.ftAvg) * 1.015, W.ftAvg);
      if (S.viewAuto && mode === 'world' && !W.spawning && !paused) { if (W.ftAvg > W.ftBest * 1.3 && W.ftAvg > 1 / (vr.presenting ? 66 : 70)) vdEff = Math.max(220, vdEff * 0.85); else if (W.ftAvg < W.ftBest * 1.12) vdEff = Math.min(viewCap(), vdEff + 30); }
      else if (!S.viewAuto) vdEff = viewCap(); }
    vdEff = Math.min(vdEff, viewCap());
    if (mode === 'world') try { world.cullFar(camera.position.x, camera.position.z, vdEff); } catch (e) { }
  }
  syncLooks(player, looks.glb, looks.skin, PAINTS[S.paint].color, true, myLights, looks.wheel);
  W.floatInf = (W.floatInf ?? (myFloat.flat ? 0 : 1)); W.floatInf += Math.sign((myFloat.flat ? 0 : 1) - W.floatInf) * Math.min(Math.abs((myFloat.flat ? 0 : 1) - W.floatInf), dt / 1.2);
  try { setFloaties(player.mesh, floatOn(), { ...myFloat, inflate: W.floatInf }); } catch (e) { if (!W.floatFail) { W.floatFail = 1; console.warn('[overpass] floaties:', e); } }
  try { const er = syncOrnaments(player.mesh, myOrn, dt); if (er.some(Boolean) && !(W.ornErr || []).some(Boolean)) { W.ornErr = er; renderGarage(); } else W.ornErr = er; } catch (e) { if (!W.ornFail) { W.ornFail = 1; console.warn('[overpass] ornaments:', e); } }
  ensureCockpit();
  if (mode === 'menu' && attract) {
    attract.update(dt); updateCamera(dt, player, true);
    Audio.engine(0, 0, 0, false);
  } else if (mode === 'story' && race) {
    // multiplayer on a custom map: send our position, draw everyone else
    if (W.mpMap && net.active) {
      try { const [la, lo] = storyToLatLon(player.x, player.z); net.tick(dt, { ...ride.netState(), lat: la, lon: lo, yaw: player.yaw, speed: paused ? 0 : player.speed, h: 0, pi: 0, ro: 0, hp: player.hp }); updateRemotes(dt); remotesDone = true; } catch (e) { if (!W.mpmFail) { W.mpmFail = 1; console.warn('[overpass] custom map multiplayer:', e); } }
    }
    if (!paused) {
      readInput(); if (race.player.finished) { player.input.throttle = 0; player.input.boost = false; }
      race.update(dt);
      // the grandstand crowd: cheers and claps for the leader, boos for last place, when you're close enough to hear
      try { const cr = track && track.land && track.land.crowd; if (cr) { const d = Math.hypot(player.x - cr.x, player.z - cr.z), r = race.player, last = r.pos === race.racers.length;
        const mood = !race.started ? 0 : (race.finished ? (r.place === 1 ? 1 : (r.place === race.racers.length ? 2 : 0)) : (r.pos === 1 ? 1 : last ? 2 : 0)), near = d < 120;
        cr.setMood(near ? mood : 0); cr.update(dt); Audio.crowd && Audio.crowd(near ? mood : 0, Math.max(0, 1 - d / 120), dt); } } catch (e) { }
      // countdown
      if (!race.started) { const n = Math.min(3, Math.ceil(race.countdown)); if (n !== lastCount) { lastCount = n; const el = $('#countdown'); el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); Audio.beep(false); } }
      else if (goTimer < 1) { if (goTimer === 0) { const el = $('#countdown'); el.textContent = 'GO'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); Audio.beep(true); } goTimer = Math.max(goTimer + dt, race.time); if (goTimer >= 1) $('#countdown').textContent = ''; }
      if (race.finished) { if (finishTimer === 0) { hudMsg(race.player.place === 1 ? 'YOU WIN' : `FINISHED P${race.player.place}`, 2600); Audio.chime(3); } finishTimer += dt; if (vr.presenting && mode === 'story') { if (finishTimer > 7) { const won = (race.player.place || 9) <= (level.goal || 3), nxt = won && LEVELS[level.id + 1]; showResults(); startStory(nxt && (S.unlockAll || progress.unlocked > level.id + 1) ? nxt : level); } } else if (finishTimer > 3 && mode === 'story' && screen !== 'results') { showResults(); } }
    }
    updateCamera(dt, player, false); tyreStep(paused ? 0 : dt);
    W.gb = Audio.engine(player.speed, paused ? 0 : player.input.throttle, player.slip, !paused, (player.maxSpeed || 52) * (player.stats ? player.stats.top : 1)); try { Audio.setSpace(0.15); } catch { } try { Audio.setEngine && Audio.setEngine(engineKind(player.model)); Audio.water && Audio.water(0); Audio.wind && Audio.wind(paused ? 0 : player.speed, false); } catch { }
    updateHud(dt);
  } else if (mode === 'world') {
    world.buildBudget = W.spawning ? 40 : vr.presenting ? 4 : 7;
    world.update(player.x, player.z, player.vx || 0, player.vz || 0);
    updateTraffic(dt);
    try { if (paused || W.spawning || W.sink) Audio.siren && Audio.siren(0); else police.update(dt, !!S.police && !ride?.riding && !garage?.busy); } catch (e) { if (!W.polFail) { W.polFail = true; console.error('[overpass] police:', e); } }
    if (W.spawning) {
      W.spawnT += dt;
      const p = world.tileCount() > 0 ? world.nearestRoadPoint(0, 0, W.spawnT > 8 ? 1500 : 450) : null;
      if (p) { placeW(p.x, p.z, p.yaw); W.spawning = false; $('#wLoading').hidden = true; hideLoading(); hudMsg(p.seg.name ? p.seg.name.toUpperCase() : 'GO EXPLORE', 2000); camera.position.set(p.x - Math.sin(p.yaw) * 30, player.y + 18, p.z - Math.cos(p.yaw) * 30); }
      else if (W.spawnT > 25) { W.spawning = false; $('#wLoading').hidden = true; hideLoading(); toast('Map data is slow to load here — drive on, streets will appear as they arrive', 4500); }
      const sy = world.heightAt(player.x, player.z); camera.position.lerp(new THREE.Vector3(player.x + 40, sy + 70, player.z + 40), 1 - Math.exp(-dt)); camera.lookAt(player.x, sy, player.z);
    } else {
      if (!paused && W.sink) updateSink(dt);
      else if (!paused && garage?.busy) { garage.step(dt); } // build mode: the car waits while you pick a spot
      else if (!paused && ride?.riding) { updateRemotes(dt); remotesDone = true; ride.step(dt); updateGps(dt); } // passenger: no driving, just follow the driver's car
      else if (!paused) {
        readInput();
        if (iceCut && iceCut.busy) { Object.assign(player.input, { throttle: 0, brake: 1, steer: 0, boost: false }); player.vx *= 0.8; player.vz *= 0.8; if (W.dive) { W.dive.sp = 0; W.dive.vy = 0; } }
        const loaded = tileReadyAt(player.x, player.z);
        const wet = waterOK() && loaded && !player.fly && world.inWater(player.x, player.z);
        W.onWater = wet; if (W.dive && (!subOn() || !world.water.inside(player.x, player.z))) endDive(true);
        player.offroad = loaded && world.roadCells.size > 0 && !wet && !world.onRoad(player.x, player.z, 1.4);
        try { rollStep(dt); } catch (e) { if (!W.rollFail) { W.rollFail = 1; console.warn('[overpass] roll:', e); } }
        try { sideStep(dt); } catch (e) { if (!W.sideFail) { W.sideFail = 1; console.warn('[overpass] two wheels:', e); } }
        if (W.dive) { try { subStep(dt); } catch (e) { console.error('[overpass] submarine:', e); endDive(true); toast('The dive went wrong, so you surfaced. Please report this.', 3000); } }
        else if (player.fly) flyStep(dt);
        else {
        if (W.wreck > 0) Object.assign(player.input, { throttle: 0, brake: 0.6, steer: 0, handbrake: false, boost: false });
        const px0 = player.x, pz0 = player.z;
        const onIce = !!world.frozen && loaded && world.water.inside(player.x, player.z) && !world.onRoad(player.x, player.z, 0.8);
        player.update(dt, wet ? 0.55 : onIce ? 0.35 : 1);
        if (iceCut && iceCut.busy) { player.x = px0; player.z = pz0; player.vx = 0; player.vz = 0; }
        const col = world.onDeck(player.x, player.z, player.y || 0) ? null : world.collide(player.x, player.z, 1.4);
        if (col) { player.x += col.nx * col.depth; player.z += col.nz * col.depth; const hit = player.bump(col.nx, col.nz, 0.25); crashDamage(hit); if (hit > 4) { if (autoDrive) setAutoDrive(false, true); Audio.thud(hit / 8); camShake = Math.min(0.6, hit * 0.03); if (vr.presenting) vr.pulse(Math.min(1, hit / 15), 120); } player.sync(0); }
        { const rc = world.railCollide(player.x, player.z, 1.25, player.y || 0, px0, pz0); if (rc) railHit(player, rc); }
        terrainStep(dt);
        if (flyOn() && !wingsTucked() && pitchInput() > 0.3 && player.speed > takeoffSpeed()) takeOff();
        }
        if (!player.fly) { const bc = boats.collide(player.x, player.z, 1.5, player.y || 0); if (bc) { // rammed a boat: momentum decides who gets shoved
          player.x += bc.nx * bc.depth; player.z += bc.nz * bc.depth;
          const dv = boats.ram(bc.boat, player, bc.nx, bc.nz, bc.cx, bc.cz), b = bc.boat;
          if (dv > 1.5) {
            if (!b.rammed) { b.rammed = true; police.crime('ram'); }
            crashDamage(dv * (b.type.mass > 10 ? 0.9 : 0.45)); Audio.thud(Math.min(3, dv / 8)); camShake = Math.max(camShake, Math.min(0.5, dv * 0.03)); if (vr.presenting) vr.pulse(Math.min(1, dv / 15), 120);
            try { Audio.splash && Audio.splash(); Audio.bonk && Audio.bonk(Math.min(1.4, dv / 8)); } catch { }
            if (dv > 9 && b.type.mass < 4 && !player.air && Math.abs(player.speed) > 14) { player.air = true; player.vy = Math.min(9, 2 + dv * 0.35); hudMsg('BOAT JUMP!', 900); } // small boats make a ramp
          }
        } } // bumped a boat
        W.dist += Math.abs(player.speed) * dt;
        W.safeT -= dt;
        if (player.fly) { /* in the air */ }
        else if (loaded && !waterOK() && world.inWater(player.x, player.z) && world.inWater(player.x - Math.sin(player.yaw) * 1.8 * Math.sign(player.speed || 1), player.z - Math.cos(player.yaw) * 1.8 * Math.sign(player.speed || 1))) startSink();
        else if (W.safeT <= 0 && loaded && world.onRoad(player.x, player.z, 0) && !world.water.inside(player.x, player.z)) { W.safeT = 0.4; W.safe = { x: player.x, z: player.z, yaw: Math.abs(player.speed) > 1 && player.speed < 0 ? player.yaw + Math.PI : player.yaw }; }
        try {
        if (wet && !player.air && !W.dive) {
          const wy = world.heightAt(player.x, player.z) - 0.25;
          // a big splash driving in fast, or landing in it from a jump / from the air
          const hit = Math.max(!W.wasWet ? Math.abs(player.speed) / 30 : 0, (W.landSplash || 0) / 14);
          if (hit > 0.15) { spray.bigSplash(player, wy, Math.min(1, hit)); Audio.wash && Audio.wash(Math.min(1, hit + 0.2)); if (hit > 0.4) { try { Audio.splash(); } catch { } camShake = Math.max(camShake, Math.min(0.4, hit * 0.35)); } }
          else if (!W.wasWet && Math.abs(player.speed) > 3) { spray.burst(player, wy); Audio.wash && Audio.wash(Math.min(1, Math.abs(player.speed) / 30)); }
          W.landSplash = 0;
          spray.emit(player, dt, wy); wake.emit(player, dt, wy);
          // idling on the water: little rings keep lapping off the hull, and a bigger swell now and then
          if (Math.abs(player.speed) < 5) {
            W.idleRipT = (W.idleRipT || 0) - dt;
            if (W.idleRipT <= 0) { W.idleRipT = 0.18 + Math.random() * 0.2; const a = Math.random() * 6.283, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), along = (Math.random() - 0.5) * 4, side = (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 0.5);
              wake.idle(player.x + fx * along - fz * side, wy, player.z + fz * along + fx * side, false); if (Math.random() < 0.15) wake.drop(player.x + Math.cos(a) * 4, wy, player.z + Math.sin(a) * 4); }
            W.idleSwellT = (W.idleSwellT || 0) - dt; if (W.idleSwellT <= 0) { W.idleSwellT = 1.6 + Math.random() * 1.2; wake.idle(player.x, wy, player.z, true); }
          }
          { const ak = (Math.abs(player.speed) - 16) / 28; if (lens && ak > 0 && !vr.presenting && Math.random() < dt * Math.min(1.2, ak) * (S.cam >= 2 ? 5 : 2)) lens.drip(1 + (Math.random() < 0.3 ? 1 : 0)); }
        }
        W.wasWet = wet; spray.setLight(waterAmbient()); wake.setLight(waterAmbient()); spray.setScale(renderer, camera, vr.presenting); spray.update(dt); wake.update(dt);
        } catch (e) { if (!W.sprayFail) { W.sprayFail = true; console.error('[overpass] water effects disabled:', e); } }
        updatePedestrians(dt);
        updateOrbs(dt, t); updatePois(); updateFuel(dt); updateGps(dt);
        W.streetT -= dt; if (W.streetT <= 0) { // the street you're on, held steady: it only changes when you're properly on another named road
          W.streetT = 0.3; const info = world.roadInfo(player.x, player.z);
          if (info && info.dist < 6 && info.seg.name) { W.street = info.seg.name; W.streetOff = 0; }
          else { W.streetOff = (W.streetOff || 0) + 0.3; if (W.streetOff > 2.5) W.street = W.onWater ? 'On the water' : player.fly ? 'In the air' : info && info.dist < 6 ? (W.streetOff > 6 ? 'Unnamed road' : W.street) : 'Off road'; }
        }
      }
      updateCamera(dt, player, false); tyreStep(paused || W.spawning ? 0 : dt);
    }
    if (!remotesDone) updateRemotes(dt); ride?.update(dt); garage?.update(dt); updateHealth(dt); smokeStep(dt); net.inv = S.infHealth;
    if (net.active && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); net.tick(dt, { ...ride.netState(), lat: la, lon: lo, yaw: player.yaw, speed: paused ? 0 : player.speed, h: W.dive ? (player.y || 0) - world.groundY(player.x, player.z) : player.fly ? (player.y || 0) - world.groundY(player.x, player.z, player.y) : 0, pi: player.fly ? player.pitch : 0, ro: player.fly ? player.roll : 0, hp: player.hp }); }
    sendT += dt; if (sendT > 1) { sendT = 0; updateMpBadge(); }
    W.gb = Audio.engine(player.speed, paused ? 0 : player.input.throttle, W.onWater ? 0 : player.slip, !paused && !W.spawning, (player.maxSpeed || 52) * (player.stats ? player.stats.top : 1)); // no tyre hiss on water
    try { Audio.setSpace(enclosure(dt)); } catch { }
    try { Audio.setEngine && Audio.setEngine(engineKind(player.model)); Audio.wind && Audio.wind(paused || W.spawning ? 0 : player.fly ? Math.hypot(player.fly.vx || 0, player.fly.vy || 0, player.fly.vz || 0) : player.speed, !!player.fly); } catch { }
    try { // lapping water when you're on it or close by
      W.wetT = (W.wetT || 0) - dt; if (W.wetT <= 0) { W.wetT = 0.5; let n = 0; if (world.water) for (const [dx, dz] of [[0, 0], [25, 0], [-25, 0], [0, 25], [0, -25]]) if (world.water.inside(player.x + dx, player.z + dz)) n++; W.nearWater = n / 5; }
      Audio.water && Audio.water(paused || W.spawning ? 0 : W.onWater ? 1 : (W.nearWater || 0) * 0.55);
    } catch { }
    updateHud(dt); updateBridgeBtn();
  }
  if (!paused && mode !== 'menu') { miniT += dt; if (miniT > 1 / 20) { miniT = 0; drawMini(); } }
  if (paused && tab === 'map' && leaf) { leafTimer += dt; if (leafTimer > 0.25) { leafTimer = 0; updateMapMarkers(); } }
  try { bankUi(); } catch (e) { if (!W.bankErr) { W.bankErr = 1; console.warn('[overpass] bank', e); } }
  updateCockpit(dt); try { seatGhosts(); } catch (e) { if (!W.ghostErr) { W.ghostErr = 1; console.warn('[overpass] seat ghosts', e); } } try { driverStep(); } catch (e) { if (!W.drvErr) { W.drvErr = 1; console.warn("[overpass] driver", e); } } try { vrShopStep(dt); } catch { } try { petStep(dt); } catch (e) { if (!W.petErr) { W.petErr = 1; console.warn('[overpass] passenger', e); } }
  // sun & sky follow the action
  camera.getWorldPosition(_camW); const fx = _camW.x, fz = _camW.z;
  sky.position.copy(_camW);
  try { // day/night (World Drive only; story levels keep their own look). A failure here switches the effect off instead of breaking the frame
    let lampOn = 0, nightFlash = false;
    if (mode === 'world' && daynight) {
      if (!paused) daynight.update(dt, S.timeMode);
      const th = daynight.th; envT -= dt;
      if (weather && !paused) { // real weather darkens the sky and light in place, before it's applied (only right after daynight rebuilt th this frame)
        if (!W.spawning) { const [la, lo] = world.unproj(player.x, player.z); if (S.weather === 'real') weather.check(la, lo); }
        weather.lowQ = S.quality === 'low'; const wx = weather.update(dt, th, _camW, S.weather, S.weather !== 'off' && !W.spawning, cockpitView());
        W.wx = wx; if (wx.flash > 0) envT = 0; W.wetK = Math.min(1, (W.wetK || 0) + (wx.rain > 0.1 ? dt / 40 : -dt / 300)); try { world.setWet(W.wetK); } catch { } try { Audio.rain(wx.rain * (cockpitView() ? 1 : 0.8)); } catch { }
      } else if (weather && paused) { try { Audio.rain(0); } catch { } }
      try { // seasons: bare trees, autumn colours, dormant grass and real snow on the ground where you are
        if (!W.spawning && S.season === 'real') { const [la, lo] = world.unproj(player.x, player.z); seasons.check(la, lo); }
        const wxs = weather && S.weather !== 'off' ? { snow: weather.cur.snow, forced: S.weather !== 'real' } : null;
        seasons.update(paused ? 0 : dt, S.season, !W.spawning || S.season !== 'real', wxs);
        // lakes and rivers freeze over: when it's properly cold where you are, in the depths of winter in cold places, near the poles
        // (or when Settings say winter); once frozen they're solid ice you can drive on (slippery!)
        try { const want = iceWanted(); W.iceK = W.spawning || W.iceK == null ? (want ? 1 : 0) : W.iceK + ((want ? 1 : 0) - W.iceK) * Math.min(1, dt / 3); const fz = W.iceK > 0.5; if (fz !== !!world.frozen) { world.frozen = fz; if (fz) { if (!W.dive) W.onWater = false; else hudMsg('❄️ THE WATER FROZE OVER ABOVE YOU', 2200); } if (!W.iceSaid && fz && !W.spawning) { W.iceSaid = true; hudMsg('❄️ THE WATER IS FROZEN · DRIVE ON THE ICE', 2200); } } setWaterIce(W.iceK, seasons.cur ? seasons.cur.snow : 0); } catch (e) { if (!W.iceFail) { W.iceFail = 1; console.warn('[overpass] ice', e); } }
      } catch (e) { if (!W.seasonFail) { W.seasonFail = true; console.error('[overpass] seasons:', e); } }
      if (envT <= 0) { envT = 0.15; const wf = weather ? weather.fogMul : 1, fk = vdEff / th.fogFar; applyEnv(th, th.fogNear * fk * wf, vdEff * Math.max(0.35, wf)); setWindowGlow(th.glow); } W.nightK = th.glow || 0; // fog sits at the draw distance, so nothing pops in or out
      sunOff.copy(th.lightDir).multiplyScalar(130); skyFx.update(_camW, th); lampOn = th.lamp;
      // late night (before ~5am): traffic signals flash yellow / red like many real intersections
      const hour = daynight.hour != null ? daynight.hour : (typeof daynight.t === 'number' ? (daynight.t % 1) * 24 : 12);
      nightFlash = hour < 5 || hour >= 24;
    } else { seasonsNeutral(); if (weather) { weather.hide(); try { Audio.rain(0); } catch { } } if (envT !== 0) { envT = 0; setWindowGlow(track && track.theme && track.theme.night ? 1 : 0); } sunOff.set(60, 110, 40); skyFx.hide(); if (mode === 'story' && track && track.theme && track.theme.night) lampOn = 1; }
    W.lamp = lampOn; setTrafficLamps(lampOn);
    try { lights.setNight(lampOn); if (mode === 'world' && !paused) lights.update(dt, nightFlash); } catch (e) { if (!W.lightsFail) { W.lightsFail = true; console.error('[overpass] street lights disabled:', e); } }
    const playing = (mode === 'world' && !W.spawning) || mode === 'story';
    headlights.update(dt, player, playing ? (W.dive && W.dive.depth > 1.5 ? 1 : S.headlights === 'on' ? 1 : S.headlights === 'off' ? 0 : lampOn) : 0, S.quality !== 'high');
  } catch (e) { if (!W.dnFail) { W.dnFail = true; console.error('[overpass] day/night disabled:', e); } }
  sun.position.set(player.x + sunOff.x, (player.y || 0) + sunOff.y, player.z + sunOff.z); sun.target.position.set(player.x, player.y || 0, player.z);
  try { updateWater(dt, { sun, hemi, skyTop: skyMat.uniforms.top.value, skyBottom: skyMat.uniforms.bottom.value, calm: S.quality !== 'high' }); } catch (e) { if (!W.waterFail) { W.waterFail = true; console.error('[overpass] water animation disabled:', e); } }
  if (mode !== 'world') ground.position.set(Math.round(fx / 100) * 100, -0.02, Math.round(fz / 100) * 100);
  try { // blue nitrous flames + speed lines while actually driving
    const driving = (mode === 'world' && !W.spawning) || (mode === 'story' && !!level), live = driving && !paused && !(mode === 'world' && W.sink);
    try { switchStep(dt); } catch (e) { if (!W.swFail) { W.swFail = true; console.warn('[overpass] switches:', e); } }
    try { weaponStep(dt, live); updateBlicks(); } catch (e) { if (!W.wpnFail) { W.wpnFail = true; console.error('[overpass] weapons off:', e); } }
    if (live) { nitroFx.update(dt, player, true); speedFx.update(dt, toUnits(player.speed), player.boosting); }
    else { nitroFx.hide(); speedFx.hide(); }
    try { if (grass._q !== S.quality) { grass._q = S.quality; grass.setQuality(S.quality); } grass.update(dt, player.x, player.z, mode === 'world' && !W.spawning && !world.mw); } catch (e) { }
    try { if (storyGrass) { if (storyGrass._q !== S.quality) { storyGrass._q = S.quality; storyGrass.setQuality(S.quality); } storyGrass.update(dt, player.x, player.z, mode !== 'world' && !!track && !!storyGrass.on); } updateLava(dt); } catch (e) { }
    try { skyRings.update(live ? dt : 0, player, flyOn() && !W.spawning, (x, z) => world.heightAt(x, z), ringHit); } catch (e) { }
    try { waterRings.update(live ? dt : 0, player, mode === 'world' && !W.spawning && waterOK() && !player.fly, waterRingHit); } catch (e) { }
    try { if (boats._q !== S.quality) { boats._q = S.quality; boats.setQuality(S.quality); } boats.setNight(W.nightK || 0); boats.setLight(waterAmbient()); boats.update(live ? dt : 0, player.x, player.z, mode === 'world' && !W.spawning && !world.frozen); } catch (e) { if (!W.boatFail) { W.boatFail = true; console.error('[overpass] boats off:', e); } }
    try { if (scrapbook && mode === 'world' && !W.spawning) { const [la, lo] = world.unproj(player.x, player.z); scrapbook.tick(la, lo); const cc = scrapbook.here && scrapbook.here.cc; if (cc) W.lht = LHT.has(cc); } } catch { }
    try { if (balloons) { if (balloons._q !== S.quality) { balloons._q = S.quality; balloons.setQuality(S.quality); } balloons.update(live ? dt : 0, { x: player.x, y: player.y, z: player.z, yaw: player.yaw, fly: !!player.fly }, mode === 'world' && !W.spawning); } } catch (e) { if (!W.balFail) { W.balFail = true; console.error('[overpass] balloons off:', e); } }
    world.treeMax = S.quality === 'low' ? 1300 : 3200;
    try { if (planes) { const [la, lo] = world.unproj(player.x, player.z); planes.update(live ? dt : 0, { x: player.x, z: player.z, lat: la, lon: lo, ground: world.heightAt(player.x, player.z), cx: camera.position.x, cy: camera.position.y, cz: camera.position.z }, mode === 'world' && !W.spawning && (!!S.livePlanes || !!S.npcPlanes)); } } catch (e) { if (!W.planeFail) { W.planeFail = true; console.error('[overpass] live planes off:', e); } }
    try { const dh = deer && deer.update(live ? dt : 0, player, mode === 'world' && !W.spawning && !player.fly, camera); if (dh) deerHit(dh); } catch (e) { if (!W.deerFail) { W.deerFail = true; console.error('[overpass] deer off:', e); } }
    try { if (fed) { const on = mode === 'world' && !W.spawning && !modelWorld; const armed = !!myWeapon(); const inGarage = !!(garage && (garage.shop || garage.insideId)); fed.update(live ? dt : 0, { show: on && !inGarage, hostile: on && armed && !invincible() && !W.wreck, diving: !!W.dive, onWater: !!W.onWater, safe: !armed || invincible() || !!W.wreck });
      if (on && live) { const sp = fed.collide(player); if (sp > 0 && (W.fedBumpT || 0) < performance.now()) { W.fedBumpT = performance.now() + 700; Audio.thud && Audio.thud(Math.min(1, sp / 30)); camShake = Math.max(camShake, Math.min(0.5, sp / 60)); if (sp > 14) hurt(Math.min(35, sp * 0.5)); } } } } catch (e) { if (!W.fedFail) { W.fedFail = true; console.error('[overpass] federation:', e); } }
    try { const on = mode === 'world' && !W.spawning, bh = birds && birds.update(live ? dt : 0, player, on, camera); if (bh) for (const h of bh) birdHit(h); } catch (e) { if (!W.birdFail) { W.birdFail = true; console.error('[overpass] birds off:', e); } }
    try { const on = mode === 'world' && !W.spawning && !player.fly && !W.dive, sh = squirrels && squirrels.update(live ? dt : 0, player, on, camera); if (sh) for (const h of sh) squirrelHit(h); } catch (e) { if (!W.sqFail) { W.sqFail = true; console.error('[overpass] squirrels off:', e); } }
    try { if (seaLife) { let lat = NaN; try { lat = world.unproj(player.x, player.z)[0]; } catch { } const ev = seaLife.update(live ? dt : 0, { P: player, on: mode === 'world' && !W.spawning && (!world.frozen || !!W.dive), cam: camera, lat, diving: !!W.dive }); if (ev) for (const e of ev) seaEvent(e); } } catch (e) { if (!W.seaFail) { W.seaFail = true; console.error('[overpass] sea life off:', e); } }
    try { if (buoys._q !== S.quality) { buoys._q = S.quality; buoys.setQuality(S.quality); } buoys.setNight(W.nightK || 0); buoys.update(live ? dt : 0, player, mode === 'world' && !W.spawning && !world.frozen, !!W.onWater && !player.fly); } catch (e) { if (!W.buoyFail) { W.buoyFail = true; console.error('[overpass] buoys off:', e); } }
  } catch (e) { if (!W.fxFail) { W.fxFail = true; console.error('[overpass] nitro/speed effects disabled:', e); } }
  try { clouds.on = S.clouds; clouds.overcast = weather && mode === 'world' ? weather.cur.cloud : 0; clouds.update(dt, camera, mode === 'world' && tileReadyAt(player.x, player.z) ? world.heightAt(player.x, player.z) : 0); } catch (e) { if (!W.cloudFail) { W.cloudFail = true; console.error('[overpass] clouds disabled:', e); } } // clouds sit at real altitudes above the land under you
  try { mirrorStep(dt); } catch (e) { if (!W.mirFail) { W.mirFail = 1; console.warn('[overpass] mirror:', e); } }
  try { lens && lens.update(Math.min(dt, 0.1)); } catch { }
  try { waterPointsStep(Math.min(dt, 0.1)); } catch (e) { if (!W.wpFail) { W.wpFail = 1; console.warn('[overpass] water points:', e); } }
  try { phoneStep(Math.min(dt, 0.1)); } catch (e) { if (!W.phFail2) { W.phFail2 = 1; console.warn('[overpass] phone:', e); } }
  try { iceCut && iceCut.update(paused ? 0 : Math.min(dt, 0.1)); } catch (e) { if (!W.cutFail) { W.cutFail = 1; console.warn('[overpass] laser cutter:', e); } }
  try { underwaterStep(dt); } catch (e) { if (!W.uwsFail) { W.uwsFail = 1; console.warn('[overpass] underwater step:', e); } }
  try { seaMineStep(dt); } catch (e) { if (!W.minesFail) { W.minesFail = 1; console.warn('[overpass] sea mines:', e); } }
  // live reflections on the cars (Pretty graphics): one cube face of the surroundings per frame
  try {
    const live = probe && S.quality === 'high' && !renderer.xr.isPresenting && (mode === 'world' || mode === 'story') && !W.spawning;
    if (live) { _probeP.set(player.x, (player.y || 0) + 1.2, player.z); probe.update(scene, _probeP, [player.mesh, cockpit && cockpit.group]); }
    const want = live && probe.ready ? probe.texture : staticEnv;
    if (want && W.envTex !== want) { W.envTex = want; setCarEnv(want); }
  } catch (e) { console.warn('[overpass] live reflections off:', e); probe = null; if (staticEnv) { W.envTex = staticEnv; setCarEnv(staticEnv); } }
  // the visual filter (Settings): bloom, filmic grading, sharpening, vignette and grain. Not in VR (each eye renders itself).
  try { if (phoneVR && vr.presenting) phoneVR.renderView(scene); } catch (e) { if (!W.phFail3) { W.phFail3 = 1; console.warn('[overpass] phone camera:', e); } }
  const look = W.photo ? W.photo.fx : S.fx;
  if (post && look !== 'off' && !renderer.xr.isPresenting) {
    try {
      post.blur += ((mode === 'menu' ? 0 : W.blur || 0) - post.blur) * Math.min(1, dt * 5);
      // god rays: where the sun sits on screen, faded at night, behind clouds and toward the screen edges
      _sunP.copy(sunOff).normalize(); const up = _sunP.y; _sunP.multiplyScalar(2000).add(camera.position).project(camera);
      const day = (1 - (W.nightK || 0)) * Math.max(0, Math.min(1, up * 3)) * (track && track.theme && track.theme.night && mode === 'story' ? 0 : 1) * (1 - 0.85 * (weather && mode === 'world' ? weather.cur.cloud : 0));
      const edge = _sunP.z < 1 ? Math.max(0, 1 - Math.max(0, Math.max(Math.abs(_sunP.x), Math.abs(_sunP.y)) - 0.85) / 0.6) : 0;
      const kk = S.quality === 'low' ? 0 : day * edge; post.sun.k += (kk - post.sun.k) * Math.min(1, dt * 3); post.sun.x = (_sunP.x + 1) / 2; post.sun.y = (_sunP.y + 1) / 2;
      post.render(scene, camera, look, S.quality === 'low' && !W.photo, dt);
    }
    catch (e) { console.error('[overpass] visual filter off:', e); post = null; renderer.setRenderTarget(null); renderer.render(scene, camera); }
  } else renderer.render(scene, camera);
  if (W.photoSnap) { W.photoSnap = false; photoSave(); } // straight after drawing, while the picture is still in the canvas
  // the phone's camera on a screen: copy the fresh picture into its viewfinder, or take the photo
  if (phoneOS && !vr.presenting) {
    if (W.phoneSnap) { const cb = W.phoneSnap; W.phoneSnap = null; try { cb(canvas.toDataURL('image/jpeg', 0.85)); } catch { cb(null); } }
    if (phoneScr && phoneScr.open_ && phoneOS.viewRect) { W.phPrevT = (W.phPrevT || 0) + 1; if (W.phPrevT % 2 === 0) phoneOS.preview(canvas); }
  }
}
let post = null; try { post = new Post(renderer); } catch (e) { console.warn('[overpass] visual filter unavailable:', e); }
let probe = null; const _probeP = new THREE.Vector3(), _sunP = new THREE.Vector3(); try { probe = new EnvProbe(renderer, 128); } catch (e) { console.warn('[overpass] live reflections unavailable:', e); }
// ---------- the working rear-view mirror: a small camera renders what's behind you into the mirror glass ----------
let mirrorRT = null, mirrorCam = null;
function mirrorInit() { // made on first use; mirrored left to right like a real mirror
  mirrorRT = new THREE.WebGLRenderTarget(384, 104); mirrorCam = new THREE.PerspectiveCamera(26, 0.25 / 0.068, 2.4, 420);
  mirrorRT.texture.wrapS = THREE.RepeatWrapping; mirrorRT.texture.repeat.set(-1, 1); mirrorRT.texture.offset.set(1, 0);
}
const _mP = new THREE.Vector3(), _mN = new THREE.Vector3(), _mE = new THREE.Vector3(), _mD = new THREE.Vector3(), _mH = new THREE.Vector3();
W.mirAdj = (() => { try { const v = JSON.parse(localStorage.getItem('osm.mirror.adj') || 'null'); if (v && isFinite(v.yaw) && isFinite(v.pitch)) return v; } catch { } return { yaw: 0, pitch: 0 }; })();
function mirrorStep(dt) {
  const k = ride?.riding ? ride.ck : cockpit, M = k && k.mirror; if (!M) return;
  const glass = M.userData.glass, show = S.mirror !== false && (cockpitView() || (ride?.riding && vr.presenting)) && (mode === 'world' || mode === 'story') && !paused;
  // grab the mirror (grip / fist near it) to angle it
  if (vr.presenting) for (const h of vr.hands || []) {
    if (!h.src) continue; const sq = vr.squeezing(h); vr.palmPos ? vr.palmPos(h, _mH) : h.grip.getWorldPosition(_mH);
    if (sq && !h.mir && !h.grabbed && !h.stick && !h.phone) { M.getWorldPosition(_mP); if (_mH.distanceTo(_mP) < 0.13) { M.parent.worldToLocal(_mH); h.mir = { x: _mH.x, y: _mH.y, yaw: W.mirAdj.yaw, pitch: W.mirAdj.pitch }; try { vr.pulse(0.4, 30); } catch { } } }
    if (!sq && h.mir) { h.mir = null; try { localStorage.setItem('osm.mirror.adj', JSON.stringify(W.mirAdj)); } catch { } }
    if (h.mir) { M.parent.worldToLocal(_mH); W.mirAdj.yaw = Math.max(-0.6, Math.min(0.6, h.mir.yaw - (_mH.x - h.mir.x) * 5)); W.mirAdj.pitch = Math.max(-0.45, Math.min(0.45, h.mir.pitch + (_mH.y - h.mir.y) * 5)); }
  }
  M.rotation.set(W.mirAdj.pitch, W.mirAdj.yaw, 0, 'YXZ');
  if (!show) { if (glass.material.map) { glass.material.map = null; glass.material.color.set('#9fb6cc'); glass.material.needsUpdate = true; } return; }
  if (!mirrorRT) mirrorInit();
  if (glass.material.map !== mirrorRT.texture) { glass.material.map = mirrorRT.texture; glass.material.color.set('#ffffff'); glass.material.toneMapped = true; glass.material.needsUpdate = true; }
  W.mirT = (W.mirT || 0) + 1; if (W.mirT % (S.quality === 'low' || vr.presenting ? 3 : 2)) return; // every 2nd (or 3rd) frame is plenty
  // look where the driver's eye reflects off the glass
  glass.getWorldPosition(_mP); glass.getWorldDirection(_mN); camera.getWorldPosition(_mE);
  _mD.subVectors(_mP, _mE).normalize(); _mD.addScaledVector(_mN, -2 * _mD.dot(_mN));
  mirrorCam.position.copy(_mP); mirrorCam.up.set(0, 1, 0); mirrorCam.lookAt(_mP.x + _mD.x, _mP.y + _mD.y, _mP.z + _mD.z);
  mirrorCam.far = Math.min(420, (vdEff || 400) * 0.7); mirrorCam.updateProjectionMatrix(); mirrorCam.updateMatrixWorld();
  const xr = renderer.xr.enabled, su = renderer.shadowMap.autoUpdate, prev = renderer.getRenderTarget();
  glass.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
  try { renderer.setRenderTarget(mirrorRT); renderer.clear(); renderer.render(scene, mirrorCam); }
  finally { renderer.setRenderTarget(prev); renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = su; glass.visible = true; }
}

// ---------- floating points on the water: while you're on the water, glowing rings bob up nearby to collect ----------
const WATER_PTS = { list: [], t: 4, geo: null, mat: null };
function makeSprite(text, col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.font = '900 64px system-ui, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 10; x.strokeStyle = 'rgba(60,30,0,.85)'; x.strokeText(text, 128, 50); x.fillStyle = col; x.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
}
function waterPointsStep(dt) {
  const P = WATER_PTS, on = mode === 'world' && W.onWater && !W.dive && !W.spawning && !paused;
  if (!P.geo) { P.geo = new THREE.TorusGeometry(1.1, 0.22, 10, 28); P.mat = new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ff9a00', emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.25 }); }
  if (on && (P.t -= dt) <= 0 && P.list.length < 4) {
    P.t = 7 + Math.random() * 7;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283, r = 35 + Math.random() * 70, x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
      let ok = false; try { ok = world.water && world.water.inside(x, z) && world.inWater(x, z) && world.waterDepth(x, z) > 1; } catch { }
      if (!ok) continue;
      const m = new THREE.Group(), ring = new THREE.Mesh(P.geo, P.mat); m.add(ring);
      const big = Math.random() < 0.2, pts = big ? 250 : 75; if (big) m.scale.setScalar(1.4);
      const sp = makeSprite(`+${pts}`, big ? '#ffe680' : '#fff4c0'); sp.position.y = 2.2; sp.scale.set(3.2, 1.2, 1); m.add(sp);
      m.position.set(x, world.heightAt(x, z) + 0.9, z); scene.add(m); P.list.push({ m, ring, x, z, pts, t: 0, rip: 0 }); break;
    }
  }
  for (let i = P.list.length - 1; i >= 0; i--) {
    const o = P.list[i]; o.t += dt; const wy = world.heightAt(o.x, o.z) - 0.25;
    o.m.position.y = wy + 1.1 + Math.sin(o.t * 2) * 0.25; o.ring.rotation.y += dt * 2.2; o.ring.rotation.x = Math.sin(o.t) * 0.3;
    if ((o.rip -= dt) <= 0) { o.rip = 0.7; try { wake.idle(o.x, wy, o.z, false); } catch { } }
    const d = Math.hypot(o.x - player.x, o.z - player.z);
    if (on && d < 4.5 && Math.abs((player.y || 0) - wy) < 4) { W.score += o.pts; hudMsg(`WATER BONUS +${o.pts}`, 1100); try { Audio.chime(5); wake.ring(o.x, wy, o.z, 0.5); spray.bigSplash({ x: o.x, z: o.z, vx: 0, vz: 0 }, wy, 0.25); } catch { } scene.remove(o.m); P.list.splice(i, 1); continue; }
    if (o.t > 70 || d > 400 || mode !== 'world') { scene.remove(o.m); P.list.splice(i, 1); }
  }
}
// nearest Store 32 / Blick's: one already loaded nearby, or ask OpenStreetMap for the closest within 80 km
const SHOP_Q = {
  store32: (la, lo, r) => `nwr["shop"]["name"~"Price Chopper|Market 32",i](around:${r},${la},${lo});nwr["shop"]["brand"~"Price Chopper|Market 32",i](around:${r},${la},${lo});`,
  blicks: (la, lo, r) => `nwr["brand:wikidata"="Q5272601"](around:${r},${la},${lo});nwr["shop"]["name"~"Dick'?s Sporting",i](around:${r},${la},${lo});`,
};
const SHOP_NAME = { store32: 'Store 32', blicks: "Blick's Shooting Goods" };
async function routeToShop(kind) {
  if (mode !== 'world') return 'Only in World Drive';
  let b = null, bd = 1e9; for (const p of world.pois || []) { if (p.kind !== kind) continue; const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; b = p; } }
  if (b) { setGps(world.unproj(b.x, b.z), SHOP_NAME[kind]); return `Route set to ${SHOP_NAME[kind]} · ${bd < 1000 ? Math.round(bd) + ' m' : (bd / 1000).toFixed(1) + ' km'}`; }
  hudMsg(`GPS · LOOKING FOR ${SHOP_NAME[kind].toUpperCase()}`, 1400);
  const [la, lo] = world.unproj(player.x, player.z), q = `[out:json][timeout:20];(${SHOP_Q[kind](la.toFixed(5), lo.toFixed(5), 80000)});out center 30;`;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal }); clearTimeout(tm);
      if (!r.ok) continue; const j = await r.json(); let best = null, bk = 1e9;
      for (const el of j.elements || []) { const a = el.lat ?? el.center?.lat, o = el.lon ?? el.center?.lon; if (!isFinite(a)) continue; const d = Math.hypot(a - la, (o - lo) * Math.cos(la * Math.PI / 180)) * 111; if (d < bk) { bk = d; best = [a, o]; } }
      if (!best) { hudMsg(`NO ${SHOP_NAME[kind].toUpperCase()} WITHIN 80 KM`, 1800); return `No ${SHOP_NAME[kind]} within 80 km`; }
      setGps(best, SHOP_NAME[kind]); return `Route set to ${SHOP_NAME[kind]} · ${bk.toFixed(1)} km`;
    } catch { }
  }
  hudMsg('GPS · NO SIGNAL', 1400); return "Couldn't search right now";
}
// ---------- the phone (phone.js): an OS on a canvas, popped up on screens, a real handset in VR ----------
const BONUS_KEY = 'osm.bank.bonus', BONUS = 250;
const phoneApi = {
  vr: () => !!vr.presenting,
  sound: k => { try { if (k === 'ring') Audio.ping && Audio.ping(0.7); else if (k === 'shutter') Audio.scratch ? Audio.click() : Audio.click(); else Audio.click(); } catch { } },
  net: () => ({ active: !!net.active, role: net.role, code: net.code, count: net.count }),
  chat: m => { try { net.chat(m); } catch { } },
  dm: (id, text) => { try { net.sendTo(id, { k: 'dm', text: String(text).slice(0, 120), n: S.name }); } catch { } },
  // the Phone app's ride buttons, same rules as the Multiplayer tab
  rideState: id => {
    const R = ride, pl = net.players.get(id); if (!R || !pl) return { note: '' };
    if (R.incoming.some(q => q.from === id)) return { note: 'Wants to ride with you', acts: [{ label: 'Accept', act: 'accept' }, { label: 'Decline', act: 'decline', col: '#555d70' }] };
    if (R.pax.has(id)) return { note: 'Riding in your car', acts: [{ label: 'Kick from car', act: 'kick', col: '#c0392b', wide: true }] };
    if (R.riding && R.riding.id === id) return { note: "You're in their car", acts: [{ label: 'Get out', act: 'exit', col: '#c0392b' }] };
    if (R.pending && R.pending.to === id) return { note: 'Waiting for an answer…', acts: [{ label: 'Cancel', act: 'cancel', col: '#555d70' }] };
    if (vr.presenting) return { note: 'Ride requests work outside VR for now' };
    if (R.riding) return { note: 'Get out of this car first' };
    if (R.pax.size) return { note: 'You have passengers' };
    if (R.pending) return { note: 'Waiting on another request' };
    if (pl.rd) return { note: 'A passenger in another car' };
    if (capacity(pl.model) === 0) return { note: 'Single-seat car, no passenger seat' };
    return { acts: [{ label: 'Request ride', act: 'ask', wide: true }] };
  },
  rideAct: (id, act) => { try { const R = ride; ({ accept: () => R.accept(id), decline: () => R.decline(id), kick: () => R.kick(id), exit: () => R.exit(), cancel: () => R.cancel(), ask: () => R.request(id) })[act]?.(); } catch (e) { console.warn('[phone] ride', e); } },
  fedList: () => { const out = []; try { for (const f of fed ? fed.dots() : []) { const dx = f.x - player.x, dz = f.z - player.z; out.push({ kind: f.kind || 'carrier', d: Math.hypot(dx, dz), rel: -(Math.atan2(dx, dz) - player.yaw), hp: f.hp, dead: !!f.dead }); } } catch { } return out; },
  pickImage: () => new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return res(null); const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = 540; c.height = 1046; const x = c.getContext('2d'), s2 = Math.max(540 / im.naturalWidth, 1046 / im.naturalHeight), w = im.naturalWidth * s2, h = im.naturalHeight * s2; x.drawImage(im, (540 - w) / 2, (1046 - h) / 2, w, h); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); };
      im.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that picture"); res(null); }; im.src = url; };
    inp.click();
  }),
  loadWall: () => idbGet('phonewall').then(v => (v && v.data) || null).catch(() => null),
  storeWall: d => { try { idbSet('phonewall', d ? { data: d } : { data: null }); } catch { } },
  players: () => { const out = []; try { for (const [id, p] of net.players) { if (id === net.myId || p.lat == null) continue; const [x, z] = world.proj(p.lat, p.lon); out.push({ id, name: p.name || 'Driver', lat: p.lat, lon: p.lon, d: Math.hypot(x - player.x, z - player.z) }); } } catch { } return out.sort((a, b) => a.d - b.d); },
  callPlayer: p => { if (mode !== 'world') return 'Only in World Drive'; setGps([p.lat, p.lon], p.name); try { net.chat(`📞 ${S.name} is on the way to you`); } catch { } return 'Route set to ' + p.name; },
  tow: () => { if (mode !== 'world' && mode !== 'story') return 'No signal'; resetCar(); return 'Back on your wheels!'; },
  carrier: () => { try { let b = null; for (const f of fed ? fed.dots() : []) { if (f.kind !== 'carrier' || f.dead) continue; const d = Math.hypot(f.x - player.x, f.z - player.z); if (!b || d < b.d) b = { d, x: f.x, z: f.z }; } if (b && fed.town) b.name = fed.town.name; return b; } catch { return null; } },
  hotline: () => { const c = phoneApi.carrier(); if (!c) return 'No Federation here. Nice!'; if (mode === 'world') setGps(world.unproj(c.x, c.z), 'Federation carrier'); return 'Carrier ' + (c.d < 1000 ? Math.round(c.d) + ' m' : (c.d / 1000).toFixed(1) + ' km') + ' away: route set'; },
  routeCarrier: () => { const r = phoneApi.hotline(); hudMsg(r.toUpperCase(), 1500); },
  store32: () => { routeToShop('store32').then(m => phoneOS && phoneOS.notify(m, false)); return 'Finding the nearest Store 32…'; },
  blicks: () => { routeToShop('blicks').then(m => phoneOS && phoneOS.notify(m, false)); return "Finding the nearest Blick's…"; },
  teleport: (lat, lon, name) => { if (mode !== 'world') { toast('Travel works in World Drive'); return; } teleport(lat, lon, name); },
  tpCost: () => S.teleportCost ? TELEPORT_COST : 0,
  score: () => Math.floor(W.score || 0),
  settings: () => [
    { name: 'Music', value: S.music ? 'On' : 'Off', btn: S.music ? 'Turn off' : 'Turn on', fn: () => { S.music = !S.music; Audio.init(); Audio.setMusic && Audio.setMusic(S.music); renderSettings(); } },
    { name: 'Units', value: S.units === 'kmh' ? 'km/h' : 'mph', btn: 'Switch', fn: () => { S.units = S.units === 'kmh' ? 'mph' : 'kmh'; renderSettings(); } },
    { name: 'Rear-view mirror', value: S.mirror !== false ? 'Working' : 'Off', btn: S.mirror !== false ? 'Turn off' : 'Turn on', fn: () => { S.mirror = S.mirror === false; renderSettings(); } },
    ...(vr.presenting ? [
      { name: 'VR draw distance', value: S.units === 'kmh' ? `${S.vrDist} m` : `${Math.round(S.vrDist * 3.281 / 10) * 10} ft`, btn: 'Change', fn: () => { const L = [300, 450, 600, 700, 850, 1000, 1200, 1400]; S.vrDist = L[(L.findIndex(v => v >= S.vrDist) + 1) % L.length]; saveRes(); world.setViewDist(viewCap()); vdEff = Math.min(S.vrDist, S.viewDist); renderSettings(); } },
      { name: 'VR resolution', value: `${Math.round(S.vrRes * 100)}% (next time you enter VR)`, btn: 'Change', fn: () => { const L = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2]; S.vrRes = L[(L.findIndex(v => v >= S.vrRes - 0.01) + 1) % L.length]; saveRes(); renderSettings(); } },
    ] : [{ name: 'Camera', value: ['Chase', 'Far', 'Hood', 'Cockpit'][S.cam], btn: 'Switch', fn: () => { S.cam = (S.cam + 1) % 4; renderSettings(); } }, { name: 'All settings', value: 'Graphics, sound, controls…', btn: 'Open', fn: () => { phoneScr && phoneScr.close(); openPause('settings'); } }]),
  ],
  host: () => { if (mode !== 'world') { toast('Host from World Drive'); return; } const st = { textContent: '', className: '' }; doHost(st, false).then(() => phoneOS.notify(net.active ? 'You are hosting: code ' + net.code : st.textContent)); },
  join: code => { const st = { textContent: '', className: '' }; phoneOS.notify('Joining ' + code + '…'); doJoin(code, st).then(() => phoneOS.notify(net.active ? 'Joined ' + code : st.textContent)); },
  leave: () => { try { net.leave(); updateMpBadge(); phoneOS.notify('You left the game'); } catch { } },
  lobby: () => { if (!phoneApi._lob) { phoneApi._lob = true; lobby.start(); } return lobby.list || []; },
  stats: () => { let town = ''; try { town = scrapbook && scrapbook.here && scrapbook.here.name || ''; } catch { } const c = phoneApi.carrier(); return { score: Math.floor(W.score || 0), liberated: fed ? fed.count : 0, cities: scrapbook ? scrapbook.count : 0, town, fed: c ? `Carrier · ${c.d < 1000 ? Math.round(c.d) + ' m' : (c.d / 1000).toFixed(1) + ' km'}` : '' }; },
  openLog: () => { phoneScr && phoneScr.close(); fed && fed.open(); },
  openScrapbook: () => { phoneScr && phoneScr.close(); scrapbook && scrapbook.open(); },
  bonus: () => { let last = ''; try { last = localStorage.getItem(BONUS_KEY) || ''; } catch { } const today = new Date().toDateString(); return { ready: last !== today, amount: BONUS, when: 'tomorrow' }; },
  collectBonus: () => { if (!phoneApi.bonus().ready) return; try { localStorage.setItem(BONUS_KEY, new Date().toDateString()); } catch { } W.score += BONUS; hudMsg(`DAILY BONUS +${BONUS}`, 1600); try { Audio.chime(6); } catch { } },
  tickets: () => myTickets.length,
  mini: () => document.getElementById('mini'),
  gps: () => gps.active ? `Route to ${gps.label || 'destination'}${gps.remain ? ' · ' + (gps.remain < 1000 ? Math.round(gps.remain) + ' m' : (gps.remain / 1000).toFixed(1) + ' km') : ''}` : '',
  clearGps: () => clearGps(true),
  openMap: () => { phoneScr && phoneScr.close(); if (mode === 'world' || mode === 'story') openPause('map'); },
  myLatLon: () => { if (mode !== 'world') return null; const [lat, lon] = world.unproj(player.x, player.z), [la2, lo2] = world.unproj(player.x + Math.sin(player.yaw) * 10, player.z + Math.cos(player.yaw) * 10); return { lat, lon, heading: Math.atan2((lo2 - lon) * Math.cos(lat * Math.PI / 180), la2 - lat) }; },
  routeLL: () => { if (!gps.active || !gps.pts || gps.pts.length < 2) return null; const out = [], step = Math.max(1, Math.floor(gps.pts.length / 120)); for (let i = Math.max(0, gps.idx || 0); i < gps.pts.length; i += step) out.push(world.unproj(gps.pts[i][0], gps.pts[i][1])); const L = gps.pts[gps.pts.length - 1]; out.push(world.unproj(L[0], L[1])); return out; },
  carrierLL: () => { const c = phoneApi.carrier(); if (!c) return null; const [lat, lon] = world.unproj(c.x, c.z); return { lat, lon }; },
  routeTo: (lat, lon) => { if (mode === 'world') setGps([lat, lon], 'Phone pin'); },
  capture: () => vr.presenting ? (phoneVR ? phoneVR.capture() : null) : new Promise(res => { W.phoneSnap = res; }),
  savePhoto: d => { try { const a = document.createElement('a'); a.href = d; a.download = 'overpass-phone-' + Date.now() + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); toast('Photo saved'); } catch { } },
  loadPhotos: () => idbGet('phonephotos').then(v => (v && Array.isArray(v.list) ? v.list : [])).catch(() => []),
  storePhotos: list => { try { idbSet('phonephotos', { list: list.slice(0, 12) }); } catch { } },
};
const phoneOS = (() => { try { return new PhoneOS(phoneApi); } catch (e) { console.warn('[overpass] phone off:', e); return null; } })();
const phoneScr = (() => { try { return phoneOS ? new PhoneScreen(phoneOS) : null; } catch (e) { return null; } })();
const phoneVR = (() => { try { return phoneOS ? new PhoneVR(scene, phoneOS, renderer) : null; } catch (e) { console.warn('[overpass] VR phone off:', e); return null; } })();
$('#phoneBtn') && ($('#phoneBtn').onclick = () => { Audio.click(); phoneScr && phoneScr.toggle(); });
addEventListener('keydown', e => { if (e.code === 'Backquote' && !e.repeat && (mode === 'world' || mode === 'story') && phoneScr) { e.preventDefault(); phoneScr.toggle(); } });
function phoneStep(dt) {
  if (!phoneOS) return;
  const playing = mode === 'world' || mode === 'story';
  if (phoneScr && phoneScr.open_ && (!playing || vr.presenting)) phoneScr.close();
  const vrOn = vr.presenting && playing && !ride?.riding && !!player.mesh;
  try { if (phoneVR) phoneVR.update(dt, { vr, camera, car: player.mesh, on: vrOn }); } catch (e) { if (!W.phFail) { W.phFail = 1; console.warn('[overpass] VR phone:', e); } }
  const showing = (phoneScr && phoneScr.open_) || (vrOn && phoneVR && phoneVR.state !== 'hip');
  if (showing || (vrOn && phoneOS.dirty)) phoneOS.update(dt); else phoneOS.t += dt;
  const pb = $('#phoneBtn'); if (pb) { const on = playing && !vr.presenting; if (pb.hidden === on) pb.hidden = !on; }
}
// ---------- boot ----------
renderGarage(); renderSettings(); renderControls(); renderLocPickers();
applyQuality(); startMenu();
last = performance.now(); renderer.setAnimationLoop(frame); // setAnimationLoop also drives the headset in VR
setTimeout(() => { const b = $('#boot'); b.style.opacity = 0; setTimeout(() => b.remove(), 500); }, 250);
window.__game = { get phoneOS() { return phoneOS; }, get phoneVR() { return phoneVR; }, get net() { return net; }, get iceCut() { return iceCut; }, get myCutter() { return myCutter; }, get fed() { return fed; }, get pad() { return pad; }, get lens() { return lens; }, toggleDive, subStep, underwaterStep, get seaMines() { return seaMines; }, get birds() { return birds; }, get squirrels() { return squirrels; }, get seaLife() { return seaLife; }, get companion() { return myCompanion; }, looks, spray, useModel: (...a) => useModel(...a), startModelWorld, importModelMaps, get modelWorld() { return modelWorld; }, s32, vrShop, get tickets() { return myTickets; }, subEng: () => subEng(), get mySub() { return mySub; }, get underwater() { return underwater; }, looks, S, police, scrapbook, get garage() { return garage; }, myNitro, renderGarage, get myWings() { return myWings; }, get myOrn() { return myOrn; }, get myFloat() { return myFloat; }, get myStunt() { return myStunt; }, doFlip, doSide, doJump, get bank() { return bankPts; }, sideStep, get daynight() { return daynight; }, get skyMat() { return skyMat; }, driverHtml, bindDriver, get myDriver() { return myDriver; }, get myParts() { return myParts; }, doRoll, rollStep, get player() { return player; }, floatHtml, setFlight, flyOn, wings, get cockpit() { return cockpit; }, switchStep, driverSwitch, doHost: () => doHost($('#mpStatus')), doJoin: c => doJoin(c, $('#mpStatus')), useGasCan, camera, buildBridge, get W() { return W; }, showResults: () => showResults(), player, world, net, lights, get race() { return race; }, get mode() { return mode; }, startWorld, startStory: i => startStory(LEVELS[i]), keys, gps, setGps, takeOff, openMap: () => openPause("map") };
