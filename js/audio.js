// Game audio: real recorded sounds (in /audio, all public domain / CC0 except the engine, crash and horn samples from the
// MIT-licensed Godot demo projects; see audio/LICENSES.txt) layered over procedural Web Audio synthesis, which also stands in
// for any sample that hasn't loaded (or can't). Mellow generative driving music.
const SAMPLE_DIR = new URL('../audio/', import.meta.url).href;
const SAMPLES = ['engine.wav', 'crash_1', 'crash_2', 'crash_3', 'crash_4', 'honk_1', 'honk_2', 'honk_3', 'metal_light_0', 'metal_light_1', 'metal_light_2', 'metal_medium_0', 'metal_medium_1', 'metal_medium_2',
  'metal_heavy_0', 'metal_heavy_1', 'metal_heavy_2', 'glass_0', 'glass_1', 'glass_2', 'plate_0', 'plate_1', 'plate_2', 'soft_0', 'soft_1', 'soft_2', 'explode', 'water_1', 'water_2', 'water_3', 'water_4',
  'ui_click', 'ui_confirm', 'ui_error', 'ui_switch', 'ui_toggle', 'ui_select', 'laser', 'powerup', 'phaser'];
export const Audio = (() => {
  let ctx = null, master, musicBus, sfxBus, engineBus, verb;
  let sir = null, NB = null, crw = null, hiss = null, rainS = null; // siren nodes, shared noise buffer
  const noiseBuf = () => { if (NB) return NB; const len = ctx.sampleRate * 2.5; NB = ctx.createBuffer(1, len, ctx.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return NB; };
  let engOsc1, engOsc2, engFilter, engGain, noiseSrc, noiseFilter, noiseGain;
  let musicOn = true, musicTimer = null, chordT = 0, stepT = 0, step = 0, chordIdx = 0;
  const vol = { master: 0.8, music: 0.55, sfx: 0.8 };
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
    master = ctx.createGain(); master.gain.value = vol.master; master.connect(comp);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.5);
    const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    engineBus = ctx.createGain(); engineBus.gain.value = vol.sfx * 0.9; engineBus.connect(master);
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
    },
    vol,
    // which engine: 'small' (bikes, karts: revvy), 'big' (trucks, vans, 4x4s: deep), 'race' (hyper / open-wheel: screaming), or normal
    setEngine(kind) { profile = kind === 'small' ? 1.45 : kind === 'big' ? 0.72 : kind === 'race' ? 1.22 : 1; },
    engine(speed, throttle, slip, active) {
      if (!ctx) return; const t = ctx.currentTime;
      const s = Math.abs(speed); const gearSpan = 14; const gear = Math.min(5, Math.floor(s / gearSpan));
      const rpm = 0.25 + ((s - gear * gearSpan) / gearSpan) * 0.75 * (gear < 5 ? 1 : 1.3);
      const f = (38 + rpm * 70 + gear * 6) * profile;
      engOsc1.frequency.setTargetAtTime(f, t, 0.05); engOsc2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + throttle * 900 + rpm * 400, t, 0.08);
      const real = !!engS; // the recorded engine carries the sound; the synth stays underneath for weight
      engGain.gain.setTargetAtTime(active ? (0.05 + throttle * 0.06) * (real ? 0.35 : 1) : 0, t, 0.1);
      if (real) {
        engS.playbackRate.setTargetAtTime((0.5 + rpm * 0.95 + gear * 0.07) * profile, t, 0.06);
        engSF.frequency.setTargetAtTime(700 + throttle * 2600 + rpm * 900, t, 0.08);
        engSG.gain.setTargetAtTime(active ? 0.16 + throttle * 0.2 : 0, t, 0.1);
      }
      noiseGain.gain.setTargetAtTime(active ? Math.min(0.12, slip * 0.012) : 0, t, 0.06);
    },
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
    splash() {
      if (!ctx) return; const t = ctx.currentTime + 0.01, len = ctx.sampleRate * 1.6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
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
    // pickup sparkle
    powerup(v = 1) { if (!ctx) return; play('powerup', 0.4 * v, 1, 0.2); },
    // lapping water around you (level 0..1): random water clips cross-faded into one another. Call every frame
    water(level = 0) {
      if (!ctx || !has('water_1')) return; const t = ctx.currentTime;
      if (!waterS) { waterS = { g: ctx.createGain(), next: 0 }; waterS.g.gain.value = 0; send(waterS.g, 1, 0.15, sfxBus); }
      waterS.g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.7, t, 0.6);
      if (level > 0.01 && t >= waterS.next - 0.8) {
        const b = BUF['water_' + (1 + ((Math.random() * 4) | 0))]; if (!b) return;
        const src = ctx.createBufferSource(), g = ctx.createGain(), st = Math.max(t, waterS.next - 0.8); src.buffer = b; src.playbackRate.value = 0.9 + Math.random() * 0.2;
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(1, st + 0.8); const end = st + b.duration / src.playbackRate.value; g.gain.setValueAtTime(1, end - 0.8); g.gain.linearRampToValueAtTime(0, end);
        src.connect(g); g.connect(waterS.g); src.start(st); src.stop(end + 0.05); waterS.next = end;
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
    siren(level = 0) { // continuous police wail; level 0 = off, 1 = right next to you
      if (!ctx) return; const t = ctx.currentTime;
      if (!sir) { sir = { o: ctx.createOscillator(), lfo: ctx.createOscillator(), lg: ctx.createGain(), g: ctx.createGain(), f: ctx.createBiquadFilter() };
        sir.o.type = 'triangle'; sir.o.frequency.value = 950; sir.lfo.frequency.value = 0.28; sir.lg.gain.value = 380; sir.lfo.connect(sir.lg); sir.lg.connect(sir.o.frequency);
        sir.f.type = 'lowpass'; sir.f.frequency.value = 2600; sir.g.gain.value = 0; sir.o.connect(sir.f); sir.f.connect(sir.g); send(sir.g, 1, 0.25, sfxBus); sir.o.start(); sir.lfo.start(); }
      sir.g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.06, t, 0.15);
    },
    // soft continuous nitro hiss: level 0 = off, 1 = one bottle, ~1.6 = second booster too
    nitroHiss(level = 0) {
      if (!ctx) return; const t = ctx.currentTime;
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
        rainS.src.connect(rainS.hp); rainS.hp.connect(rainS.lp); rainS.lp.connect(rainS.g); send(rainS.g, 1, 0.2, sfxBus); rainS.src.start(); }
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
