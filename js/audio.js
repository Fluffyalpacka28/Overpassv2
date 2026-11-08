// Procedural audio: soft engine, tire hiss, mellow generative driving music, small SFX.
export const Audio = (() => {
  let ctx = null, master, musicBus, sfxBus, engineBus, verb;
  let engOsc1, engOsc2, engFilter, engGain, noiseSrc, noiseFilter, noiseGain;
  let musicOn = true, musicTimer = null, chordT = 0, stepT = 0, step = 0, chordIdx = 0;
  const vol = { master: 0.8, music: 0.55, sfx: 0.8 };
  const prog = [[57, 64, 69, 71, 76], [53, 60, 65, 69, 72], [48, 55, 60, 64, 67], [55, 62, 67, 71, 74]]; // Am9, Fmaj7, C, G
  const arpScale = [69, 71, 72, 74, 76, 79, 81, 83, 84];
  const BEAT = 60 / 92;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

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
    setMusic(on) { musicOn = on; if (on) startMusic(); else stopMusic(); },
    get musicOn() { return musicOn; },
    setVolume(kind, v) {
      vol[kind] = v; if (!ctx) return;
      if (kind === 'master') master.gain.value = v;
      if (kind === 'music' && musicOn) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
      if (kind === 'sfx') { sfxBus.gain.value = v; engineBus.gain.value = v * 0.9; }
    },
    vol,
    engine(speed, throttle, slip, active) {
      if (!ctx) return; const t = ctx.currentTime;
      const s = Math.abs(speed); const gearSpan = 14; const gear = Math.min(5, Math.floor(s / gearSpan));
      const rpm = 0.25 + ((s - gear * gearSpan) / gearSpan) * 0.75 * (gear < 5 ? 1 : 1.3);
      const f = 38 + rpm * 70 + gear * 6;
      engOsc1.frequency.setTargetAtTime(f, t, 0.05); engOsc2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + throttle * 900 + rpm * 400, t, 0.08);
      engGain.gain.setTargetAtTime(active ? 0.05 + throttle * 0.06 : 0, t, 0.1);
      noiseGain.gain.setTargetAtTime(active ? Math.min(0.12, slip * 0.012) : 0, t, 0.06);
    },
    chime(level = 0) { if (!ctx) return; const t = ctx.currentTime + 0.01; [0, 4, 7].forEach((k, i) => pluck(t + i * 0.06, 79 + level + k, 0.07, sfxBus, 1.2)); },
    beep(high) { if (!ctx) return; const t = ctx.currentTime + 0.01; pluck(t, high ? 84 : 72, 0.1, sfxBus, 0.6); },
    thud(power = 1) {
      if (!ctx) return; const t = ctx.currentTime + 0.01, g = ctx.createGain();
      g.gain.setValueAtTime(Math.min(0.25, 0.06 * power), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.35);
    },
    click() { if (!ctx) return; pluck(ctx.currentTime + 0.005, 88, 0.035, sfxBus, 0.25); },
    suspend() { if (ctx) ctx.suspend(); }, resume() { if (ctx) ctx.resume(); },
  };
})();
