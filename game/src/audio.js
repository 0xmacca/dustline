// audio.js — DUSTLINE procedural sound. One job: every sound effect from
// WebAudio oscillators and one shared noise buffer. No assets, no files.
// Every method is a no-op until init() runs on a user gesture.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.4, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, filterFreq, vol, type, delay) {
    if (!ctx || !noiseBuf) return;
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    init() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      const rnd = mulberry32(1337);
      for (let i = 0; i < len; i += 1) data[i] = rnd() * 2 - 1;
    },
    shot(name) {
      if (!ctx) return;
      if (name === 'sg12') {
        noise(0.3, 320, 0.9);
        tone(90, 0.28, 'sine', 0.7, 45);
      } else if (name === 'sm9') {
        noise(0.09, 2400, 0.4, 'bandpass');
        tone(320, 0.06, 'square', 0.12, 140);
      } else if (name === 'p11') {
        noise(0.12, 1800, 0.5, 'bandpass');
        tone(240, 0.08, 'square', 0.15, 110);
      } else {
        noise(0.14, 1200, 0.6);
        tone(180, 0.1, 'square', 0.2, 70);
      }
    },
    reload() {
      tone(1400, 0.04, 'square', 0.18);
      tone(900, 0.04, 'square', 0.18, 0, 0.12);
      tone(1600, 0.05, 'square', 0.22, 0, 0.26);
    },
    dry() {
      tone(1200, 0.03, 'square', 0.15);
    },
    hit() {
      tone(880, 0.06, 'sine', 0.35);
    },
    kill() {
      tone(660, 0.08, 'sine', 0.4);
      tone(990, 0.12, 'sine', 0.4, 0, 0.08);
    },
    step() {
      noise(0.05, 400, 0.07);
    },
    plant() {
      tone(1200, 0.08, 'sine', 0.3);
      tone(1200, 0.08, 'sine', 0.3, 0, 0.15);
      tone(1500, 0.12, 'sine', 0.35, 0, 0.3);
    },
    beep() {
      tone(1000, 0.08, 'sine', 0.3);
    },
    explosion() {
      noise(0.9, 200, 1.0);
      tone(55, 0.8, 'sine', 0.8, 30);
    },
    roundWin() {
      const notes = [523, 659, 784, 1046];
      for (let i = 0; i < notes.length; i += 1) {
        tone(notes[i], 0.16, 'triangle', 0.35, 0, i * 0.12);
      }
    },
    roundLose() {
      const notes = [392, 330, 262];
      for (let i = 0; i < notes.length; i += 1) {
        tone(notes[i], 0.2, 'triangle', 0.3, 0, i * 0.15);
      }
    },
    click() {
      tone(1500, 0.03, 'square', 0.2);
    },
    hurt() {
      tone(140, 0.15, 'sawtooth', 0.3, 70);
      noise(0.12, 500, 0.2);
    },
  };
}
