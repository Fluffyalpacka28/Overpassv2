// Game audio: real recorded sounds (in /audio, all public domain / CC0 except the engine, crash and horn samples from the
// MIT-licensed Godot demo projects; see audio/LICENSES.txt) layered over procedural Web Audio synthesis, which also stands in
// for any sample that hasn't loaded (or can't). Mellow generative driving music.
const SAMPLE_DIR = new URL('../audio/', import.meta.url).href;
const SAMPLES = ['engine.wav', 'crash_1', 'crash_2', 'crash_3', 'crash_4', 'honk_1', 'honk_2', 'honk_3', 'metal_light_0', 'metal_light_1', 'metal_light_2', 'metal_medium_0', 'metal_medium_1', 'metal_medium_2',
  'metal_heavy_0', 'metal_heavy_1', 'metal_heavy_2', 'glass_0', 'glass_1', 'glass_2', 'plate_0', 'plate_1', 'plate_2', 'soft_0', 'soft_1', 'soft_2', 'explode', 'splash', 'scream_m1', 'scream_m2', 'scream_m3', 'scream_f1', 'scream_f2', 'yell_m1', 'yell_m2', 'yell_f1', 'yell_f2', 'nitro_roar.wav', 'nitro_hiss.wav', 'nitro_ignite',
  'ui_click', 'ui_confirm', 'ui_error', 'ui_switch', 'ui_toggle', 'ui_select', 'laser', 'powerup', 'phaser'];
export const Audio = (() => {
  let ctx = null, master, musicBus, sfxBus, engineBus, verb, uwF = null, uwK = 0;
  let sir = null, NB = null, crw = null, hiss = null, rainS = null; // siren nodes, shared noise buffer
  const noiseBuf = () => { if (NB) return NB; const len = ctx.sampleRate * 2.5; NB = ctx.createBuffer(1, len, ctx.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return NB; };
  let engOsc1, engOsc2, engFilter, engGain, noiseSrc, noiseFilter, noiseGain;
  let squealF, squealG, turboO, turboG, echoD, echoFb, echoG, engVerbG; // squeal, turbo, echo
  const GB = { gear: 1, rpm: 0.15, rpmS: 0.15, shiftT: 0, lastThr: 0, press: 0, last: 0, popT: 0, pops: 0, space: 0 }; // gearbox and engine state
  let musicOn = true, musicTimer = null, chordT = 0, stepT = 0, step = 0, chordIdx = 0;
  const vol = { master: 0.8, music: 0.55, sfx: 0.8, wind: 0.6, water: 0.6, rain: 0.6 }; let ambBus = null, windS = null, AB = {}; // wind, water and rain each have their own volume
  const prog = [[57, 64, 69, 71, 76], [53, 60, 65, 69, 72], [48, 55, 60, 64, 67], [55, 62, 67, 71, 74]]; // Am9, Fmaj7, C, G
  const arpScale = [69, 71, 72, 74, 76, 79, 81, 83, 84];
  const BEAT = 60 / 92;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // ---- recorded samples ----
  const BUF = {}; let engS = null, engSG = null, engSF = null, waterS = null, profile = 1;
  function loadSamples() {
    for (const f of SAMPLES) {
      const name = f.replace(/\.\w+$/, ''), url = SAMPLE_DIR + (f.includes('.') ? f : f + '.mp3');
      fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej))).then(b => { BUF[name] = b; if (name === 'engine') startEngineSample(); }).catch(() => { });
    }
  }
  const has = n => !!BUF[n];
  const pick = (base, n = 3) => { const ok = []; for (let i = 0; i < 6; i++) if (BUF[base + i]) ok.push(base + i); return ok.length ? ok[(Math.random() * ok.length) | 0] : null; };
  // play a sample: v = loudness, rate = speed/pitch, wet = reverb send. Returns false if it isn't loaded (so the caller can synthesise)
  function play(name, v = 1, rate = 1, wet = 0.15, bus = sfxBus, at = 0) {
    if (!ctx || !name || !BUF[name] || v < 0.005) return false;
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = BUF[name]; src.playbackRate.value = rate; g.gain.value = v;
    src.connect(g); send(g, 1, wet, bus); src.start(ctx.currentTime + 0.003 + at); return true;
  }
  function startEngineSample() {
    if (engS || !BUF.engine) return;
    engS = ctx.createBufferSource(); engS.buffer = BUF.engine; engS.loop = true;
    engSF = ctx.createBiquadFilter(); engSF.type = 'lowpass'; engSF.frequency.value = 1800; engSF.Q.value = 0.7;
    engSG = ctx.createGain(); engSG.gain.value = 0; engS.connect(engSF); engSF.connect(engSG); engSG.connect(engineBus); engS.start();
  }

  function impulse(sec) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    return b;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
    // underwater muffle: everything passes a low-pass that closes right down when your head goes under
    uwF = ctx.createBiquadFilter(); uwF.type = 'lowpass'; uwF.frequency.value = 20000; uwF.Q.value = 0.7; uwF.connect(comp);
    master = ctx.createGain(); master.gain.value = vol.master; master.connect(uwF);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.5);
    const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    engineBus = ctx.createGain(); engineBus.gain.value = vol.sfx * 0.9; engineBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(sfxBus); // ambience (follows the effects volume too)
    for (const k of ['wind', 'water', 'rain']) { AB[k] = ctx.createGain(); AB[k].gain.value = vol[k]; AB[k].connect(ambBus); } // ...and each kind has its own slider
    // engine: two detuned saws through a warm lowpass
    engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 400; engFilter.Q.value = 2;
    engGain = ctx.createGain(); engGain.gain.value = 0;
    engOsc1 = ctx.createOscillator(); engOsc1.type = 'sawtooth'; engOsc1.frequency.value = 40;
    engOsc2 = ctx.createOscillator(); engOsc2.type = 'triangle'; engOsc2.frequency.value = 80;
    engOsc1.connect(engFilter); engOsc2.connect(engFilter); engFilter.connect(engGain); engGain.connect(engineBus);
    engOsc1.start(); engOsc2.start();
    // tire noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = nb; noiseSrc.loop = true;
    noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 1800; noiseFilter.Q.value = 0.8;
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
    noiseSrc.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(engineBus); noiseSrc.start();
    // tyre squeal: the same noise through a narrow, swept resonance (that rubber-on-tarmac whine)
    squealF = ctx.createBiquadFilter(); squealF.type = 'bandpass'; squealF.frequency.value = 1150; squealF.Q.value = 11;
    squealG = ctx.createGain(); squealG.gain.value = 0; noiseSrc.connect(squealF); squealF.connect(squealG); squealG.connect(engineBus);
    // turbo: a whistle that rises with boost pressure
    turboO = ctx.createOscillator(); turboO.type = 'sine'; turboO.frequency.value = 2000;
    const tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 3000; tbp.Q.value = 1.2;
    turboG = ctx.createGain(); turboG.gain.value = 0; turboO.connect(tbp); tbp.connect(turboG); turboG.connect(engineBus); turboO.start();
    // space: a slap-back echo and more reverb on the engine in cities, tunnels and under bridges
    echoD = ctx.createDelay(0.5); echoD.delayTime.value = 0.085; echoFb = ctx.createGain(); echoFb.gain.value = 0.32; echoG = ctx.createGain(); echoG.gain.value = 0;
    engineBus.connect(echoD); echoD.connect(echoFb); echoFb.connect(echoD); echoD.connect(echoG); echoG.connect(master);
    engVerbG = ctx.createGain(); engVerbG.gain.value = 0.03; engineBus.connect(engVerbG); engVerbG.connect(verb);
    if (musicOn) startMusic();
    loadSamples();
  }
  function send(node, dry, wet, bus) {
    const d = ctx.createGain(); d.gain.value = dry; node.connect(d); d.connect(bus);
    const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(verb);
  }
  function pad(t, m, dur, v) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1100, t + dur * 0.6); f.frequency.linearRampToValueAtTime(600, t + dur + 2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.6); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 2.4);
    ['sine', 'triangle'].forEach((ty, k) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = mtof(m); o.detune.value = k ? -7 : 6; o.connect(f); o.start(t); o.stop(t + dur + 3); });
    f.connect(g); send(g, 0.6, 0.5, musicBus);
  }
  function pluck(t, m, v, bus = musicBus, decay = 0.9) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m); o.connect(g); o.start(t); o.stop(t + decay + 0.05);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(m) * 2.001;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(v * 0.18, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.4);
    o2.connect(g2); o2.start(t); o2.stop(t + decay);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; g.connect(lp); g2.connect(lp);
    send(lp, 0.55, 0.6, bus);
  }
  function softKick(t, v) {
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.4);
  }
  function bass(t, m, dur) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.02, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m - 24); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.2);
  }
  function musicTick() {
    if (!ctx) return; const now = ctx.currentTime;
    while (chordT < now + 1) {
      const ch = prog[chordIdx % prog.length];
      ch.forEach(m => pad(chordT, m, BEAT * 8, 0.018));
      chordIdx++; chordT += BEAT * 8;
    }
    while (stepT < now + 1) {
      const ch = prog[Math.floor(step / 16) % prog.length];
      if (step % 4 === 0) softKick(stepT, 0.16);
      if (step % 8 === 0 || step % 8 === 6) bass(stepT, ch[0], BEAT * 1.5);
      if (step % 2 === 0 && Math.random() < 0.55) {
        const pool = arpScale.filter(n => ch.some(c => (n - c) % 12 === 0)).concat(arpScale.slice(0, 3));
        pluck(stepT, pool[Math.floor(Math.random() * pool.length)], 0.03 + Math.random() * 0.02);
      }
      step++; stepT += BEAT / 2;
    }
  }
  function startMusic() {
    if (!ctx) return; const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now); musicBus.gain.setValueAtTime(musicBus.gain.value, now); musicBus.gain.linearRampToValueAtTime(vol.music, now + 2);
    if (!musicTimer) { chordT = Math.max(chordT, now + 0.1); stepT = Math.max(stepT, now + 0.1); musicTimer = setInterval(musicTick, 250); musicTick(); }
  }
  function stopMusic() {
    if (!ctx) return; const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now); musicBus.gain.setValueAtTime(musicBus.gain.value, now); musicBus.gain.linearRampToValueAtTime(0, now + 1);
    clearInterval(musicTimer); musicTimer = null;
  }
  // a gear change: a soft mechanical clunk (and a little exhaust bark on a hard upshift)
  function shiftClunk(upshift, thr) {
    if (!ctx) return; const t = ctx.currentTime + 0.005, g = ctx.createGain(); g.gain.setValueAtTime(0.05 + thr * 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(upshift ? 95 : 120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; o.connect(lp); lp.connect(g); g.connect(engineBus); o.start(t); o.stop(t + 0.1);
    if (upshift && thr > 0.7) backfire(0.35);
  }
  // the turbo blow-off valve venting: a short hiss
  function blowOff(p) {
    if (!ctx) return; const t = ctx.currentTime + 0.01, src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.playbackRate.value = 1.2;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(3600, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.4); bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * p, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(bp); bp.connect(g); g.connect(engineBus); src.start(t, Math.random()); src.stop(t + 0.5);
  }
  // an exhaust pop: a crack of noise with a low thump under it
  function backfire(v) {
    if (!ctx) return; const t = ctx.currentTime + 0.005;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + Math.random() * 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.16 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(lp); lp.connect(g); g.connect(engineBus); src.start(t, Math.random() * 2); src.stop(t + 0.09);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.14 * v, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g2); g2.connect(engineBus); o.start(t); o.stop(t + 0.12);
  }
  return {
    init,
    get ready() { return !!ctx; },
    get samples() { return Object.keys(BUF); },
    setMusic(on) { musicOn = on; if (on) startMusic(); else stopMusic(); },
    get musicOn() { return musicOn; },
    setVolume(kind, v) {
      vol[kind] = v; if (!ctx) return;
      if (kind === 'master') master.gain.value = v;
      if (kind === 'music' && musicOn) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
      if (kind === 'sfx') { sfxBus.gain.value = v; engineBus.gain.value = v * 0.9; }
      if (AB[kind]) AB[kind].gain.setTargetAtTime(v, ctx.currentTime, 0.1);
    },
    vol,
    // which engine: 'small' (bikes, karts: revvy), 'big' (trucks, vans, 4x4s: deep), 'race' (hyper / open-wheel: screaming), or normal
    setEngine(kind) { profile = kind === 'small' ? 1.45 : kind === 'big' ? 0.72 : kind === 'race' ? 1.22 : 1; },
    // the engine: a six-speed gearbox from the car's speed (top = its top speed), shifts with a clunk and a dip, turbo whistle and
    // blow-off, crackles and pops when you lift off at high revs, tyre squeal. Returns { gear, rpm } for the dashboard.
    engine(speed, throttle, slip, active, top = 52) {
      if (!ctx) return GB; const t = ctx.currentTime, now = performance.now() / 1000, dt = Math.min(0.1, Math.max(0.001, now - (GB.last || now))); GB.last = now;
      const s = Math.abs(speed), T = Math.max(20, top), up = [0, 0.2, 0.34, 0.49, 0.64, 0.8, 1.08].map(k => k * T);
      // shifting: up near the red line, down when the revs sag (with some hysteresis so it doesn't hunt)
      if (GB.shiftT > 0) GB.shiftT -= dt;
      let g = GB.gear; const lo = up[g - 1], hi = up[g], inGear = (s - lo) / Math.max(1, hi - lo);
      if (g < 6 && inGear > 0.97 && GB.shiftT <= 0) { g++; GB.shiftT = 0.16; shiftClunk(true, throttle); }
      else if (g > 1 && (s < lo * 0.93 || (inGear < 0.25 && throttle > 0.8 && s > 4)) && GB.shiftT <= 0) { g--; GB.shiftT = 0.12; shiftClunk(false, throttle); }
      if (s < 1.5) g = 1; GB.gear = g;
      const l2 = up[g - 1], h2 = up[g]; let rpm = 0.18 + 0.8 * Math.max(0, Math.min(1.05, (s - l2) / Math.max(1, h2 - l2)));
      if (g === 1 && s < 4) rpm = Math.max(rpm, 0.16 + throttle * 0.45); // revving from a standstill
      if (GB.shiftT > 0) rpm *= 0.86; // the drop while the clutch is in
      GB.rpmS += (rpm - GB.rpmS) * Math.min(1, dt * 9); const R = GB.rpmS; GB.rpm = R;
      const thr = GB.shiftT > 0 ? throttle * 0.25 : throttle;
      const f = (34 + R * 92 + g * 3) * profile;
      engOsc1.frequency.setTargetAtTime(f, t, 0.03); engOsc2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
      engFilter.frequency.setTargetAtTime(280 + thr * 1100 + R * 700, t, 0.06);
      const real = !!engS; // the recorded engine carries the sound; the synth stays underneath for weight
      engGain.gain.setTargetAtTime(active ? (0.05 + thr * 0.07) * (real ? 0.35 : 1) : 0, t, 0.06);
      if (real) {
        engS.playbackRate.setTargetAtTime((0.48 + R * 1.15) * profile, t, 0.04);
        engSF.frequency.setTargetAtTime(650 + thr * 2900 + R * 1200, t, 0.06);
        engSG.gain.setTargetAtTime(active ? 0.15 + thr * 0.22 + R * 0.05 : 0, t, 0.06);
      }
      // turbo: pressure builds with throttle at revs, whistles, and vents with a pssh when you lift
      const want = active ? Math.max(0, thr * (R - 0.25) * 1.6) : 0; GB.press += (Math.min(1, want) - GB.press) * Math.min(1, dt * (want > GB.press ? 2.2 : 6));
      turboO.frequency.setTargetAtTime(1500 + GB.press * 3400 + R * 600, t, 0.08); turboG.gain.setTargetAtTime(active ? GB.press * GB.press * 0.022 : 0, t, 0.1);
      if (active && GB.lastThr > 0.65 && throttle < 0.2) {
        if (GB.press > 0.35) blowOff(GB.press);
        if (R > 0.55 && s > 8) { GB.pops = 2 + Math.floor(Math.random() * 4); GB.popT = 0.05; } // crackle on the overrun
      }
      GB.lastThr = throttle;
      if (GB.pops > 0 && (GB.popT -= dt) <= 0) { if (throttle < 0.3) backfire(0.5 + Math.random() * 0.5); GB.pops--; GB.popT = 0.06 + Math.random() * 0.16; }
      noiseGain.gain.setTargetAtTime(active ? Math.min(0.1, slip * 0.009) : 0, t, 0.06);
      const sq = active ? Math.max(0, Math.min(1, (slip - 3.5) / 8)) : 0;
      squealF.frequency.setTargetAtTime(950 + sq * 350 + Math.sin(now * 23) * 60, t, 0.03); squealG.gain.setTargetAtTime(sq * sq * 0.09, t, 0.05);
      return GB;
    },
    // under water (0..1): muffle everything; 1 = head fully under
    underwater(k) { if (!ctx || !uwF) return; if (Math.abs(k - uwK) < 0.01) return; uwK = k; uwF.frequency.setTargetAtTime(k > 0.5 ? 650 : 20000, ctx.currentTime, k > 0.5 ? 0.08 : 0.15); },
    // a soft sonar ping with its echo
    ping(v = 1) {
      if (!ctx) return; const t = ctx.currentTime + 0.01;
      for (const [d, a] of [[0, 1], [0.32, 0.35], [0.66, 0.12]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1180, t + d); o.frequency.exponentialRampToValueAtTime(1120, t + d + 0.5);
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.05 * v * a, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
        o.connect(g); g.connect(sfxBus); g.connect(verb); o.start(t + d); o.stop(t + d + 0.75);
      }
    },
    // how enclosed the space is: 0 open road .. 1 tunnel / under a bridge / deep in a city of tall buildings
    setSpace(k) { if (!ctx) return; const t = ctx.currentTime; GB.space += (k - GB.space) * 0.1; echoG.gain.setTargetAtTime(GB.space * 0.28, t, 0.2); engVerbG.gain.setTargetAtTime(0.03 + GB.space * 0.32, t, 0.2); echoD.delayTime.setTargetAtTime(0.06 + (1 - GB.space) * 0.07, t, 0.3); },
    get gearbox() { return GB; },
    chime(level = 0) { if (!ctx) return; const t = ctx.currentTime + 0.01; [0, 4, 7].forEach((k, i) => pluck(t + i * 0.06, 79 + level + k, 0.07, sfxBus, 1.2)); },
    beep(high) { if (!ctx) return; if (play(high ? 'ui_confirm' : 'ui_error', 0.5, 1, 0.1)) return; const t = ctx.currentTime + 0.01; pluck(t, high ? 84 : 72, 0.1, sfxBus, 0.6); },
    // a crash: power ~0.3 (a scrape) .. 3+ (a big smash). Metal crunch + a car impact + broken glass on the big ones
    thud(power = 1) {
      if (!ctx) return;
      const p = Math.max(0.2, power), r = 0.9 + Math.random() * 0.2;
      if (p < 0.8) play(pick('metal_light_'), 0.35 + p * 0.4, r, 0.1);
      else if (p < 1.6) { play(pick('metal_medium_'), 0.55, r, 0.15); play(pick('crash_'), 0.35 * p, r * 1.05, 0.12); }
      else { play(pick('metal_heavy_'), 0.75, r * 0.9, 0.2); play(pick('crash_'), Math.min(1, 0.4 + p * 0.2), r * 0.92, 0.2); if (p > 2.3) play(pick('glass_'), 0.45, r, 0.25, sfxBus, 0.04); }
      const t = ctx.currentTime + 0.01, g = ctx.createGain();
      g.gain.setValueAtTime(Math.min(0.25, 0.06 * power), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.35);
    },
    splash(soft = false) { // soft: the lighter synthesised splash only (buoys)
      if (!ctx) return; if (!soft && play('splash', 0.8, 0.9 + Math.random() * 0.2, 0.3)) return; const t = ctx.currentTime + 0.01, len = ctx.sampleRate * 1.6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = ctx.createBufferSource(); src.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(300, t + 1.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      src.connect(f); f.connect(g); send(g, 0.7, 0.5, sfxBus); src.start(t);
      for (let k = 0; k < 7; k++) { const tt = t + 0.4 + k * 0.17 + Math.random() * 0.08, o = ctx.createOscillator(), gg = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300 + Math.random() * 300, tt); o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 500, tt + 0.08); gg.gain.setValueAtTime(0.0001, tt); gg.gain.linearRampToValueAtTime(0.05, tt + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1); o.connect(gg); gg.connect(sfxBus); o.start(tt); o.stop(tt + 0.12); } // bubbles
    },
    wash(power = 1) { // short, light splash for driving onto water
      if (!ctx) return; const t = ctx.currentTime + 0.01, len = Math.floor(ctx.sampleRate * 0.6), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = ctx.createBufferSource(); src.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.5); f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 + 0.12 * power, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t);
    },
    click() { if (!ctx) return; if (play('ui_click', 0.45, 1, 0.05)) return; pluck(ctx.currentTime + 0.005, 88, 0.035, sfxBus, 0.25); },
    // a cockpit toggle switch / push-button
    flick(push) { if (!ctx) return; if (play(push ? 'ui_toggle' : 'ui_switch', 0.6, 0.9 + Math.random() * 0.2, 0.05)) return; pluck(ctx.currentTime + 0.005, 88, 0.035, sfxBus, 0.25); },
    // the horn (three different horns, so cars don't all sound the same)
    horn(k = 0, v = 1) { if (!ctx) return; if (play('honk_' + (1 + (k % 3)), 2.2 * v, 1, 0.2)) return; const t = ctx.currentTime; for (const m of [64, 68]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = mtof(m); g.gain.setValueAtTime(0.05 * v, t); g.gain.setTargetAtTime(0, t + 0.35, 0.05); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.6); } },
    // a dull hit against a boat hull or a soft thing
    bonk(v = 1) { if (!ctx) return; play(pick('plate_'), 0.6 * v, 0.85 + Math.random() * 0.2, 0.15) || play(pick('soft_'), 0.6 * v, 1, 0.1); },
    // scratching a lottery ticket: a short dry scrape
    // the flame cutter: a roaring hiss that sweeps for dur seconds
    torch(dur = 2.2, v = 1) {
      if (!ctx) return; const t = ctx.currentTime + 0.01, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf(); src.loop = true; f.type = 'bandpass'; f.Q.value = 0.7; f2.type = 'lowpass'; f2.frequency.value = 5200;
      f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1600, t + dur * 0.3); f.frequency.linearRampToValueAtTime(1100, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.12); g.gain.setValueAtTime(0.32 * v, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
      src.connect(f); f.connect(f2); f2.connect(g); send(g, 1, 0.12, sfxBus); src.start(t); src.stop(t + dur + 0.2);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 52; og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.15); og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1); o.connect(og); send(og, 1, 0.05, sfxBus); o.start(t); o.stop(t + dur + 0.15);
    },
    // ice giving way: sharp cracks, then a deep crunch
    iceBreak(v = 1) {
      if (!ctx) return; const t0 = ctx.currentTime + 0.01;
      for (let i = 0; i < 5; i++) { const t = t0 + i * 0.05 + Math.random() * 0.04, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(); f.type = 'highpass'; f.frequency.value = 1800 + Math.random() * 2500; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); src.connect(f); f.connect(g); send(g, 1, 0.3, sfxBus); src.start(t, Math.random()); src.stop(t + 0.08); }
      const t = t0 + 0.12, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); src.connect(f); f.connect(g); send(g, 1, 0.25, sfxBus); src.start(t, Math.random()); src.stop(t + 0.75);
    },
    scratch(v = 1) {
      if (!ctx) return; const t = ctx.currentTime + 0.003, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf(); f.type = 'highpass'; f.frequency.value = 2500 + Math.random() * 1500;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t, Math.random()); src.stop(t + 0.08);
    },
    // the dog in the passenger seat: two quick barks
    woof(v = 1) {
      if (!ctx) return; const t0 = ctx.currentTime + 0.01;
      for (const dt of [0, 0.22]) {
        const t = t0 + dt, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), src = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.13);
        f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.13); f.Q.value = 1.6;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.18);
        src.buffer = noiseBuf(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8; ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.12 * v, t + 0.01); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(nf); nf.connect(ng); ng.connect(sfxBus); src.start(t, Math.random()); src.stop(t + 0.1);
      }
    },
    // the cat in the passenger seat: a 'mrrow' (pitch rises then falls, through a vowel-ish formant)
    meow(v = 1) {
      if (!ctx) return; const t = ctx.currentTime + 0.01, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'triangle';
      for (const [osc, k] of [[o, 1], [o2, 2]]) { osc.frequency.setValueAtTime(520 * k, t); osc.frequency.linearRampToValueAtTime(820 * k, t + 0.18); osc.frequency.exponentialRampToValueAtTime(430 * k, t + 0.55); }
      f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + 0.2); f.frequency.linearRampToValueAtTime(800, t + 0.55); f.Q.value = 2.2;
      f2.type = 'lowpass'; f2.frequency.value = 3200;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * v, t + 0.06); g.gain.setValueAtTime(0.2 * v, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(f); o2.connect(f); f.connect(f2); f2.connect(g); g.connect(sfxBus); o.start(t); o2.start(t); o.stop(t + 0.62); o2.stop(t + 0.62);
    },
    // a small animal under the wheels: a short wet squelch and a tiny squeak
    squish(v = 1) {
      if (!ctx || v < 0.02) return; const t = ctx.currentTime + 0.005;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(); f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t, Math.random()); src.stop(t + 0.2);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(2700, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
      og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.06 * v, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + 0.12);
    },
    // a bird into the car: a soft thump and an indignant squawk
    birdStrike(v = 1) {
      if (!ctx || v < 0.02) return; const t = ctx.currentTime + 0.005;
      const k = ctx.createOscillator(), kg = ctx.createGain(); k.type = 'sine'; k.frequency.setValueAtTime(190, t); k.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      kg.gain.setValueAtTime(0.3 * v, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); k.connect(kg); kg.connect(sfxBus); k.start(t); k.stop(t + 0.18);
      const o = ctx.createOscillator(), lf = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter(), og = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1050, t + 0.03); o.frequency.exponentialRampToValueAtTime(620, t + 0.24);
      lf.frequency.value = 38; lg.gain.value = 90; lf.connect(lg); lg.connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2.2;
      og.gain.setValueAtTime(0.0001, t + 0.03); og.gain.linearRampToValueAtTime(0.09 * v, t + 0.05); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(f); f.connect(og); og.connect(sfxBus); o.start(t + 0.03); lf.start(t + 0.03); o.stop(t + 0.28); lf.stop(t + 0.28);
    },
    // someone you hit: a scream (or a shout) in a man's or a woman's voice. g = 'f' | 'm'. Returns false if the voices aren't loaded
    scream(g = 'm', v = 1) {
      if (!ctx) return false; const f = g === 'f', yell = Math.random() < 0.25;
      const n = yell ? (f ? 'yell_f' : 'yell_m') + (1 + ((Math.random() * 2) | 0)) : f ? 'scream_f' + (1 + ((Math.random() * 2) | 0)) : 'scream_m' + (1 + ((Math.random() * 3) | 0));
      return play(n, 0.9 * v, (f ? 1.04 : 0.96) + Math.random() * 0.1, 0.25) || (!yell && play(f ? 'scream_f1' : 'scream_m1', 0.9 * v, 1, 0.25));
    },
    // pickup sparkle
    powerup(v = 1) { if (!ctx) return; play('powerup', 0.4 * v, 1, 0.2); },
    // lapping water around you (level 0..1): random water clips cross-faded into one another. Call every frame
    // rushing air: rises with speed, more when flying, with slow gusts. speed in m/s. Call every frame
    wind(speed = 0, flying = false) {
      if (!ctx) return; const t = ctx.currentTime;
      if (!windS) {
        const len = ctx.sampleRate * 3, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let a = 0, c = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; a = (a + 0.04 * w) / 1.04; c = c * 0.85 + w * 0.15; d[i] = a * 2.6 + c * 0.25; }
        const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.5;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 140; lfo.connect(lg); lg.connect(bp.frequency); // gusts
        const g = ctx.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); send(g, 1, 0.08, AB.wind); src.start(); lfo.start();
        windS = { g, bp };
      }
      const k = Math.max(0, Math.min(1, (Math.abs(speed) - 8) / (flying ? 60 : 50)));
      windS.g.gain.setTargetAtTime(k * k * (flying ? 0.32 : 0.2), t, 0.4); windS.bp.frequency.setTargetAtTime(380 + k * 900, t, 0.4);
    },
    // water around you (level 0..1), fully synthesised: deep rolling swells (filtered brown noise that rises and falls like waves)
    // plus soft low slaps of water against the car. No hiss: everything sits below ~600 Hz
    water(level = 0) {
      if (!ctx) return; const t = ctx.currentTime, L = Math.max(0, Math.min(1, level));
      if (!waterS) {
        const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let last = 0;
        for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
        const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
        const swell = ctx.createGain(); swell.gain.value = 0.2;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(lp); lp.connect(swell); swell.connect(g); send(g, 1, 0.18, AB.water); src.start();
        waterS = { g, swell, lp, b, next: 0, lap: 0 };
      }
      const W = waterS; W.g.gain.setTargetAtTime(L * 0.4, t, 0.8);
      if (L <= 0.01) return;
      // the next wave: swell up over a couple of seconds, then draw back
      if (t >= W.next - 0.5) {
        const st = Math.max(t, W.next), up = 1.8 + Math.random() * 1.4, down = 2.4 + Math.random() * 2, peak = 0.55 + Math.random() * 0.45;
        W.swell.gain.setTargetAtTime(peak, st, up / 3); W.swell.gain.setTargetAtTime(0.15, st + up, down / 3);
        W.lp.frequency.setTargetAtTime(380 + peak * 260, st, up / 3); W.lp.frequency.setTargetAtTime(300, st + up, down / 3);
        W.next = st + up + down * 0.8;
      }
      // little slaps against the car
      if (t >= W.lap) {
        W.lap = t + 0.9 + Math.random() * 1.8;
        const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), st = t + 0.02, d = 0.35 + Math.random() * 0.35;
        src.buffer = W.b; bp.type = 'bandpass'; bp.frequency.value = 220 + Math.random() * 260; bp.Q.value = 1.8;
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.5 * L, st + d * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, st + d);
        src.connect(bp); bp.connect(g); send(g, 1, 0.2, AB.water); src.start(st, Math.random() * 3); src.stop(st + d + 0.05);
      }
    },
    // ---- weapons, explosions, sirens (all synthesised; v = 0..1 loudness, e.g. by distance) ----
    gun(id, v = 1) {
      if (!ctx || v < 0.02) return; const t = ctx.currentTime + 0.005;
      const noise = (dur, type, f0, f1, q, gain, bus = sfxBus, wet = 0.15) => { const src = ctx.createBufferSource(); src.buffer = noiseBuf(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(gain * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); src.connect(f); f.connect(g); send(g, 1, wet, bus); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05); };
      const tone = (type, f0, f1, dur, gain, at = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur); g.gain.setValueAtTime(gain * v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur); o.connect(g); g.connect(sfxBus); o.start(t + at); o.stop(t + at + dur + 0.05); };
      if (id === 'mg') { noise(0.06, 'bandpass', 2400, 900, 0.9, 0.22); tone('sine', 160, 55, 0.07, 0.16); }
      else if (id === 'shot') { noise(0.32, 'lowpass', 3500, 300, 0.7, 0.5, sfxBus, 0.35); tone('sine', 110, 38, 0.25, 0.3); }
      else if (id === 'rocket') { tone('sine', 140, 45, 0.18, 0.28); noise(0.9, 'bandpass', 500, 2600, 1.4, 0.2, sfxBus, 0.3); }
      else if (id === 'rail') { play('laser', 0.7 * v, 0.8, 0.3); tone('sawtooth', 2400, 160, 0.38, 0.12); tone('sine', 3800, 700, 0.28, 0.08); noise(0.2, 'highpass', 4000, 1500, 0.7, 0.12); }
      else if (id === 'mine') { tone('square', 240, 110, 0.08, 0.09); tone('sine', 1900, 1900, 0.06, 0.05, 0.12); }
    },
    boom(size = 1, v = 1) { // explosion: a real blast (pitched by size), with a synthesised low rumble and crackle tail under it
      if (!ctx || v < 0.02) return; const t = ctx.currentTime + 0.005, dur = 1.2 + size * 0.25;
      if (play('explode', Math.min(1.3, 0.55 + size * 0.2) * v, Math.max(0.6, 1.15 - size * 0.09) * (0.94 + Math.random() * 0.12), 0.45)) v *= 0.55;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(110, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.min(0.75, 0.3 + size * 0.08) * v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); send(g, 1, 0.6, sfxBus); src.start(t, Math.random()); src.stop(t + dur + 0.1);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.9); og.gain.setValueAtTime(0.42 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.0); o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + 1.05);
      for (let k = 0; k < 6; k++) { const tt = t + 0.15 + Math.random() * 0.7, c = ctx.createBufferSource(), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); c.buffer = noiseBuf(); cf.type = 'bandpass'; cf.frequency.value = 1200 + Math.random() * 2500; cf.Q.value = 3; cg.gain.setValueAtTime(0.08 * v, tt); cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05); c.connect(cf); cf.connect(cg); cg.connect(sfxBus); c.start(tt, Math.random()); c.stop(tt + 0.07); }
    },
    // a balloon popping: a sharp snap plus a tiny rubbery thump
    pop(v = 1) {
      if (!ctx || v < 0.02) return; const t = ctx.currentTime + 0.003;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(); f.type = 'highpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      src.connect(f); f.connect(g); send(g, 1, 0.25, sfxBus); src.start(t, Math.random()); src.stop(t + 0.08);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.07); og.gain.setValueAtTime(0.18 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(og); og.connect(sfxBus); o.start(t); o.stop(t + 0.1);
    },
    // grandstand crowd: mood 1 = cheering (applause + a roar), 2 = booing, 0 = quiet. level 0..1 by distance. Call every frame.
    crowd(mood = 0, level = 0, dt = 0) {
      if (!ctx) return; const t = ctx.currentTime;
      if (!crw) {
        crw = { roar: ctx.createBufferSource(), rf: ctx.createBiquadFilter(), rg: ctx.createGain(), boo: ctx.createGain(), bf1: ctx.createBiquadFilter(), bf2: ctx.createBiquadFilter(), oscs: [], acc: 0 };
        crw.roar.buffer = noiseBuf(); crw.roar.loop = true; crw.rf.type = 'bandpass'; crw.rf.frequency.value = 900; crw.rf.Q.value = 0.6; crw.rg.gain.value = 0;
        crw.roar.connect(crw.rf); crw.rf.connect(crw.rg); send(crw.rg, 1, 0.5, sfxBus); crw.roar.start();
        // booing: a bank of low detuned voices through an "oo" formant
        crw.bf1.type = 'bandpass'; crw.bf1.frequency.value = 380; crw.bf1.Q.value = 3; crw.bf2.type = 'lowpass'; crw.bf2.frequency.value = 900; crw.boo.gain.value = 0;
        for (let i = 0; i < 9; i++) { const o = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 105 + Math.random() * 70; v.frequency.value = 3 + Math.random() * 3; vg.gain.value = 3 + Math.random() * 4; v.connect(vg); vg.connect(o.frequency); o.connect(crw.bf1); o.start(); v.start(); crw.oscs.push(o, v); }
        crw.bf1.connect(crw.bf2); crw.bf2.connect(crw.boo); send(crw.boo, 1, 0.5, sfxBus);
      }
      const L = Math.max(0, Math.min(1, level));
      crw.rg.gain.setTargetAtTime(mood === 1 ? L * 0.09 * (0.8 + 0.2 * Math.sin(t * 1.7)) : mood === 2 ? L * 0.03 : 0, t, 0.25);
      crw.boo.gain.setTargetAtTime(mood === 2 ? L * 0.05 * (0.75 + 0.25 * Math.sin(t * 0.9)) : 0, t, 0.3);
      if (mood === 1 && L > 0.02 && dt > 0) { // applause: lots of individual claps
        crw.acc += dt * (30 + 60 * L);
        while (crw.acc >= 1) { crw.acc--; const tt = t + Math.random() * 0.05, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 1800; f.Q.value = 1.2 + Math.random(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(L * (0.05 + Math.random() * 0.05), tt + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03 + Math.random() * 0.03); s.connect(f); f.connect(g); send(g, 1, 0.35, sfxBus); s.start(tt, Math.random() * 2); s.stop(tt + 0.08); }
      } else crw.acc = 0;
    },
    siren(level = 0) { // police "woop woop": quick rising whoops, two at a time, over and over. level 0 = off, 1 = right next to you
      if (!ctx) return; const t = ctx.currentTime, L = Math.max(0, Math.min(1, level));
      if (!sir) {
        sir = { o: ctx.createOscillator(), o2: ctx.createOscillator(), env: ctx.createGain(), g: ctx.createGain(), f: ctx.createBiquadFilter(), sh: ctx.createWaveShaper(), next: 0 };
        sir.o.type = 'sawtooth'; sir.o2.type = 'square'; sir.o2.detune.value = 8; const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.2); } sir.sh.curve = c;
        sir.f.type = 'bandpass'; sir.f.frequency.value = 1400; sir.f.Q.value = 0.6; sir.env.gain.value = 0; sir.g.gain.value = 0;
        const m = ctx.createGain(); m.gain.value = 0.5; sir.o.connect(m); sir.o2.connect(m); m.connect(sir.sh); sir.sh.connect(sir.f); sir.f.connect(sir.env); sir.env.connect(sir.g); send(sir.g, 1, 0.3, sfxBus); sir.o.start(); sir.o2.start();
      }
      sir.g.gain.setTargetAtTime(L * 0.07, t, 0.12);
      if (L <= 0.01) { sir.next = 0; return; }
      // schedule the whoops a little ahead: pairs ("woop woop"), then a short gap
      if (!sir.next || sir.next < t) sir.next = t + 0.02;
      while (sir.next < t + 0.3) {
        const st = sir.next, d = 0.32;
        for (const o of [sir.o, sir.o2]) { o.frequency.setValueAtTime(420, st); o.frequency.exponentialRampToValueAtTime(1550, st + d * 0.8); o.frequency.exponentialRampToValueAtTime(1300, st + d); }
        sir.env.gain.setValueAtTime(0.0001, st); sir.env.gain.exponentialRampToValueAtTime(1, st + 0.04); sir.env.gain.setValueAtTime(1, st + d * 0.75); sir.env.gain.exponentialRampToValueAtTime(0.0001, st + d);
        sir.n = (sir.n || 0) + 1; sir.next = st + (sir.n % 2 ? 0.38 : 0.62);
      }
    },
    // soft continuous nitro hiss: level 0 = off, 1 = one bottle, ~1.6 = second booster too
    nitroHiss(level = 0) {
      if (!ctx) return; const t = ctx.currentTime;
      if (BUF.nitro_roar && BUF.nitro_hiss) { // recorded: a flame roar and a fizzing burn, looped; a whoosh as it lights. level 1 = one bottle, ~1.6 = both boosters
        if (!this._nz) {
          const mk = b => { const s2 = ctx.createBufferSource(), g = ctx.createGain(); s2.buffer = b; s2.loop = true; g.gain.value = 0; s2.connect(g); send(g, 1, 0.12, sfxBus); s2.start(); return { s: s2, g }; };
          this._nz = { roar: mk(BUF.nitro_roar), fizz: mk(BUF.nitro_hiss), on: false };
        }
        const N = this._nz, L = Math.max(0, Math.min(2, level));
        if (L > 0.05 && !N.on) play('nitro_ignite', 0.55 + 0.25 * Math.min(1, L), 1.25, 0.2);
        N.on = L > 0.05;
        N.roar.g.gain.setTargetAtTime(L * 0.32, t, L > 0 ? 0.08 : 0.25); N.roar.s.playbackRate.setTargetAtTime(L > 1.2 ? 1.05 : 1.25, t, 0.2);
        N.fizz.g.gain.setTargetAtTime(L * 0.1, t, L > 0 ? 0.06 : 0.2);
        level *= 0.25; // the synthesised hiss stays faintly underneath
      }
      if (!hiss) { hiss = { src: ctx.createBufferSource(), hp: ctx.createBiquadFilter(), bp: ctx.createBiquadFilter(), g: ctx.createGain(), lfo: ctx.createOscillator(), lg: ctx.createGain() };
        hiss.src.buffer = noiseBuf(); hiss.src.loop = true; hiss.hp.type = 'highpass'; hiss.hp.frequency.value = 2400; hiss.bp.type = 'peaking'; hiss.bp.frequency.value = 5200; hiss.bp.Q.value = 0.8; hiss.bp.gain.value = 5;
        hiss.lfo.frequency.value = 7; hiss.lg.gain.value = 0; hiss.lfo.connect(hiss.lg); hiss.lg.connect(hiss.g.gain); hiss.g.gain.value = 0;
        hiss.src.connect(hiss.hp); hiss.hp.connect(hiss.bp); hiss.bp.connect(hiss.g); send(hiss.g, 1, 0.12, sfxBus); hiss.src.start(); hiss.lfo.start(); }
      const L = Math.max(0, Math.min(2, level));
      hiss.g.gain.setTargetAtTime(L * 0.028, t, L > 0 ? 0.06 : 0.18); hiss.lg.gain.setTargetAtTime(L * 0.004, t, 0.1);
      hiss.hp.frequency.setTargetAtTime(L > 1.2 ? 1700 : 2400, t, 0.2);
    },
    // steady rain on and around the car (0..1); heavier rain is louder and brighter
    rain(level = 0) {
      if (!ctx) return; const t = ctx.currentTime;
      if (!rainS) { rainS = { src: ctx.createBufferSource(), lp: ctx.createBiquadFilter(), hp: ctx.createBiquadFilter(), g: ctx.createGain() };
        rainS.src.buffer = noiseBuf(); rainS.src.loop = true; rainS.lp.type = 'lowpass'; rainS.lp.frequency.value = 2600; rainS.hp.type = 'highpass'; rainS.hp.frequency.value = 350; rainS.g.gain.value = 0;
        rainS.src.connect(rainS.hp); rainS.hp.connect(rainS.lp); rainS.lp.connect(rainS.g); send(rainS.g, 1, 0.2, AB.rain); rainS.src.start(); }
      const L = Math.max(0, Math.min(1, level));
      rainS.g.gain.setTargetAtTime(L * L * 0.09 + L * 0.02, t, 0.5); rainS.lp.frequency.setTargetAtTime(1800 + L * 2600, t, 0.5);
    },
    // air rushing out of (or being pumped into) the floaties
    air(out = true) {
      if (!ctx) return; const t = ctx.currentTime, dur = out ? 1.1 : 0.9;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(out ? 3200 : 900, t); bp.frequency.exponentialRampToValueAtTime(out ? 700 : 2600, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
      if (!out) for (let k = 0; k < 4; k++) { g.gain.setValueAtTime(0.12, t + k * 0.22); g.gain.setTargetAtTime(0.02, t + k * 0.22 + 0.1, 0.03); } // pump strokes
      g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.12);
      src.connect(bp); bp.connect(g); send(g, 1, 0.1, sfxBus); src.start(t); src.stop(t + dur + 0.6);
    },
    // a roll of thunder (v: 1 = close and sharp, lower = far away and muffled)
    thunder(v = 1) {
      if (!ctx) return; const t = ctx.currentTime, dur = 2.5 + (1 - v) * 2.5;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(v > 0.7 ? 900 : 380, t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v + 0.12, t + (v > 0.7 ? 0.04 : 0.4));
      for (let k = 1; k < 4; k++) g.gain.setTargetAtTime((0.35 * v + 0.08) * (1 - k * 0.2), t + k * 0.45 + Math.random() * 0.3, 0.15); // rumbling swells
      g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.25);
      src.connect(lp); lp.connect(g); send(g, 1, 0.5, sfxBus); src.start(t); src.stop(t + dur + 1.5);
    },
    suspend() { if (ctx) ctx.suspend(); }, resume() { if (ctx) ctx.resume(); },
  };
})();
