// Procedural WebAudio SFX synthesizer per docs/DESIGN.md §9 (owner: fx-audio).
// Zero audio files, pure WebAudio synthesis, <= 12 concurrent voices with oldest-voice stealing.

export const SFX_NAMES = Object.freeze([
  'step_grass', 'step_stone', 'step_snow',
  'tap', 'blocked',
  'hit_stone', 'hit_wood', 'hit_soft', 'break',
  'pickup', 'xp', 'pop',
  'boing', 'splash', 'wiggle', 'faint',
  'hiss', 'confetti',
  'snow_throw', 'snow_hit',
  'vwoop', 'rumble', 'thunder', 'wither_spawn', 'golem_spawn',
  'hrrm', 'meow', 'baa', 'buzz',
  'kai_laugh', 'kai_whine',
  'shutter', 'cheer', 'aww', 'clap', 'fanfare', 'drumroll',
  'munch', 'sneeze', 'kaching', 'portal', 'snip',
  'note0', 'note1', 'note2', 'note3', 'note4', 'note5',
]);

const ALIASES = Object.freeze({
  bonk: 'blocked',
  putong: 'faint',
  laugh: 'kai_laugh',
  whine: 'kai_whine',
  ding: 'xp',
  jingle: 'fanfare',
  firework: 'confetti',
  explosion: 'confetti',
  step: 'step_grass',
  hit: 'hit_stone',
  place: 'hit_wood',
});

const NOTE_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6 pentatonic
const MAX_VOICES = 12;

function createNoiseBuffer(audioCtx) {
  const sr = audioCtx.sampleRate || 44100;
  const len = Math.floor(sr * 1.5);
  const buf = audioCtx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  // Deterministic PRNG for noise buffer
  let s = 0x517cc1b7;
  for (let i = 0; i < len; i++) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    data[i] = u * 2 - 1;
  }
  return buf;
}

export function createSfx(getAudioCtx, getSfxBus, ctx) {
  let noiseBuf = null;
  const voices = []; // { gain, stopAt, stop() }
  let xpCombo = 0;
  let lastXpSimTime = -10;

  function pruneVoices(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].stopAt <= now) {
        voices.splice(i, 1);
      }
    }
  }

  function allocateVoice(ac, dest, now, duration, vol = 0.7) {
    pruneVoices(now);
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.shift();
      try {
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setTargetAtTime(0.0001, now, 0.008);
        oldest.stop(now + 0.03);
      } catch (_) {
        // Ignore already stopped nodes
      }
    }

    const vGain = ac.createGain();
    vGain.gain.setValueAtTime(Math.max(0.001, Math.min(1.5, vol)), now);
    vGain.connect(dest);

    const nodes = [];
    const entry = {
      gain: vGain,
      stopAt: now + duration + 0.05,
      track(node) {
        nodes.push(node);
        return node;
      },
      stop(when = now) {
        for (const n of nodes) {
          try { n.stop(when); } catch (_) {}
        }
      },
    };
    voices.push(entry);
    return entry;
  }

  function tone(ac, voice, type, f0, f1, start, dur, amp = 0.5, filterFreq = 0) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), start);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(amp, start + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    if (filterFreq > 0) {
      const biq = ac.createBiquadFilter();
      biq.type = 'lowpass';
      biq.frequency.setValueAtTime(filterFreq, start);
      osc.connect(biq);
      biq.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(voice.gain);
    osc.start(start);
    osc.stop(start + dur + 0.01);
    voice.track(osc);
  }

  function noise(ac, voice, filterType, freq0, freq1, q, start, dur, amp = 0.5, offset = 0) {
    if (!noiseBuf) noiseBuf = createNoiseBuffer(ac);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const biq = ac.createBiquadFilter();
    biq.type = filterType;
    biq.frequency.setValueAtTime(Math.max(30, freq0), start);
    if (freq1 && freq1 !== freq0) {
      biq.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), start + dur);
    }
    biq.Q.setValueAtTime(q, start);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(amp, start + Math.min(0.01, dur * 0.18));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(biq);
    biq.connect(g);
    g.connect(voice.gain);
    src.start(start, offset % 1.1);
    src.stop(start + dur + 0.01);
    voice.track(src);
  }

  function distanceAttenuation(pos) {
    if (!pos || typeof pos !== 'object') return 1.0;
    const pl = ctx?.player || ctx?.state?.player;
    if (!pl || !Number.isFinite(pl.x)) return 1.0;
    const dx = (pos.x ?? pl.x) - pl.x;
    const dz = (pos.z ?? pl.z) - pl.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 6) return 1.0;
    return Math.max(0.18, 1.0 - (dist - 6) / 38);
  }

  function play(rawName, opts = {}) {
    const key = String(rawName || 'tap');
    const name = ALIASES[key] || key;

    // Track rising XP combo deterministically in sim time
    let pitchMul = Number(opts?.pitch) || 1.0;
    const simT = Number(ctx?.time ?? 0);
    if (name === 'xp') {
      if (simT - lastXpSimTime < 3.0 && simT >= lastXpSimTime) {
        xpCombo = Math.min(10, xpCombo + 1);
      } else {
        xpCombo = 0;
      }
      lastXpSimTime = simT;
      if (!opts?.pitch) {
        pitchMul *= Math.pow(1.06, xpCombo);
      }
    }

    const ac = getAudioCtx();
    const dest = getSfxBus();
    if (!ac || !dest || ac.state !== 'running') return false;

    const now = ac.currentTime;
    const vol = (Number(opts?.vol) || 0.75) * distanceAttenuation(opts?.pos);
    if (vol <= 0.01) return false;
    const p = Math.max(0.4, Math.min(2.6, pitchMul));

    // Note0..note5 check
    if (name.startsWith('note')) {
      const idx = Math.max(0, Math.min(5, parseInt(name.slice(4), 10) || 0));
      const f = NOTE_FREQS[idx] * p;
      const v = allocateVoice(ac, dest, now, 0.55, vol);
      tone(ac, v, 'sine', f, f, now, 0.5, 0.55);
      tone(ac, v, 'triangle', f * 2, f * 2, now, 0.22, 0.22);
      tone(ac, v, 'sine', f * 3, f * 3, now, 0.08, 0.08);
      return true;
    }

    switch (name) {
      case 'step_grass': {
        const v = allocateVoice(ac, dest, now, 0.1, vol * 0.55);
        noise(ac, v, 'bandpass', 1400 * p, 900 * p, 1.8, now, 0.075, 0.45, 0.1);
        tone(ac, v, 'sine', 135 * p, 70 * p, now, 0.055, 0.2);
        break;
      }
      case 'step_stone': {
        const v = allocateVoice(ac, dest, now, 0.09, vol * 0.55);
        noise(ac, v, 'bandpass', 2400 * p, 1600 * p, 2.8, now, 0.055, 0.42, 0.35);
        tone(ac, v, 'triangle', 320 * p, 150 * p, now, 0.05, 0.25);
        break;
      }
      case 'step_snow': {
        const v = allocateVoice(ac, dest, now, 0.12, vol * 0.55);
        noise(ac, v, 'bandpass', 3200 * p, 2100 * p, 2.2, now, 0.095, 0.45, 0.6);
        noise(ac, v, 'highpass', 4200 * p, 3500 * p, 1.2, now + 0.015, 0.07, 0.25, 0.8);
        break;
      }
      case 'tap': {
        const v = allocateVoice(ac, dest, now, 0.1, vol * 0.65);
        tone(ac, v, 'sine', 520 * p, 760 * p, now, 0.075, 0.42);
        break;
      }
      case 'blocked': {
        // Soft comic hollow "bonk"
        const v = allocateVoice(ac, dest, now, 0.22, vol * 0.8);
        tone(ac, v, 'triangle', 250 * p, 118 * p, now, 0.16, 0.55, 900);
        tone(ac, v, 'sine', 165 * p, 92 * p, now + 0.02, 0.15, 0.38);
        break;
      }
      case 'hit_stone': {
        const v = allocateVoice(ac, dest, now, 0.14, vol * 0.75);
        noise(ac, v, 'bandpass', 2800 * p, 1500 * p, 2.5, now, 0.08, 0.48, 0.2);
        tone(ac, v, 'triangle', 880 * p, 420 * p, now, 0.09, 0.32);
        break;
      }
      case 'hit_wood': {
        const v = allocateVoice(ac, dest, now, 0.14, vol * 0.75);
        tone(ac, v, 'triangle', 380 * p, 190 * p, now, 0.095, 0.48, 1200);
        noise(ac, v, 'bandpass', 1100 * p, 700 * p, 3.0, now, 0.06, 0.32, 0.4);
        break;
      }
      case 'hit_soft': {
        const v = allocateVoice(ac, dest, now, 0.13, vol * 0.7);
        noise(ac, v, 'lowpass', 900 * p, 450 * p, 1.2, now, 0.09, 0.42, 0.5);
        tone(ac, v, 'sine', 240 * p, 140 * p, now, 0.09, 0.32);
        break;
      }
      case 'break': {
        const v = allocateVoice(ac, dest, now, 0.28, vol * 0.9);
        noise(ac, v, 'bandpass', 1900 * p, 650 * p, 1.4, now, 0.2, 0.6, 0.15);
        noise(ac, v, 'bandpass', 2800 * p, 1100 * p, 2.0, now + 0.035, 0.16, 0.45, 0.45);
        tone(ac, v, 'triangle', 220 * p, 78 * p, now, 0.17, 0.45);
        break;
      }
      case 'pickup': {
        const v = allocateVoice(ac, dest, now, 0.16, vol * 0.8);
        tone(ac, v, 'sine', 420 * p, 980 * p, now, 0.11, 0.5);
        break;
      }
      case 'xp': {
        const v = allocateVoice(ac, dest, now, 0.42, vol * 0.8);
        const f = 740 * p;
        tone(ac, v, 'sine', f, f * 1.01, now, 0.34, 0.42);
        tone(ac, v, 'triangle', f * 1.5, f * 1.5, now + 0.03, 0.3, 0.25);
        tone(ac, v, 'sine', f * 2.0, f * 2.02, now + 0.055, 0.28, 0.2);
        break;
      }
      case 'pop': {
        const v = allocateVoice(ac, dest, now, 0.15, vol * 0.8);
        tone(ac, v, 'sine', 340 * p, 820 * p, now, 0.095, 0.52);
        noise(ac, v, 'bandpass', 2200, 3400, 2.0, now + 0.04, 0.045, 0.2);
        break;
      }
      case 'boing': {
        // Cartoon spring boioioing!
        const v = allocateVoice(ac, dest, now, 0.48, vol * 0.9);
        const osc = ac.createOscillator();
        const lfo = ac.createOscillator();
        const lfoG = ac.createGain();
        const g = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(175 * p, now);
        osc.frequency.exponentialRampToValueAtTime(540 * p, now + 0.16);
        osc.frequency.exponentialRampToValueAtTime(290 * p, now + 0.42);
        lfo.frequency.setValueAtTime(26, now);
        lfoG.gain.setValueAtTime(55 * p, now);
        lfo.connect(lfoG);
        lfoG.connect(osc.frequency);
        const biq = ac.createBiquadFilter();
        biq.type = 'lowpass';
        biq.frequency.setValueAtTime(1600, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.55, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        osc.connect(biq);
        biq.connect(g);
        g.connect(v.gain);
        osc.start(now);
        lfo.start(now);
        osc.stop(now + 0.45);
        lfo.stop(now + 0.45);
        v.track(osc);
        v.track(lfo);
        break;
      }
      case 'splash': {
        const v = allocateVoice(ac, dest, now, 0.55, vol * 0.9);
        tone(ac, v, 'sine', 210 * p, 68 * p, now, 0.16, 0.5);
        noise(ac, v, 'bandpass', 900 * p, 2600 * p, 1.1, now + 0.02, 0.38, 0.65, 0.25);
        noise(ac, v, 'highpass', 3000, 1800, 0.9, now + 0.08, 0.4, 0.35, 0.7);
        break;
      }
      case 'wiggle': {
        // Sticky honey squelch-wiggle
        const v = allocateVoice(ac, dest, now, 0.5, vol * 0.85);
        const freqs = [260, 390, 240, 430, 280, 460];
        for (let i = 0; i < freqs.length; i++) {
          tone(ac, v, 'sine', freqs[i] * p, freqs[i] * 1.32 * p, now + i * 0.068, 0.075, 0.42);
        }
        break;
      }
      case 'faint': {
        // Slide whistle down + comic "噗通" floor thud!
        const v = allocateVoice(ac, dest, now, 0.65, vol * 0.95);
        tone(ac, v, 'sine', 880 * p, 195 * p, now, 0.34, 0.42);
        // "噗通" dual thud
        tone(ac, v, 'triangle', 175 * p, 58 * p, now + 0.34, 0.22, 0.72, 500);
        noise(ac, v, 'lowpass', 480, 140, 1.2, now + 0.34, 0.18, 0.55, 0.3);
        break;
      }
      case 'hiss': {
        const v = allocateVoice(ac, dest, now, 0.45, vol * 0.75);
        noise(ac, v, 'bandpass', 2200 * p, 5200 * p, 1.8, now, 0.4, 0.5, 0.1);
        break;
      }
      case 'confetti': {
        const v = allocateVoice(ac, dest, now, 0.6, vol * 0.9);
        // Party popper cork pop + sparkling cascade
        tone(ac, v, 'triangle', 320 * p, 110 * p, now, 0.09, 0.6);
        noise(ac, v, 'bandpass', 2800, 5600, 1.4, now + 0.02, 0.28, 0.45, 0.5);
        const arp = [1046.5, 1318.5, 1568.0, 2093.0];
        for (let i = 0; i < arp.length; i++) {
          tone(ac, v, 'sine', arp[i] * p, arp[i] * p, now + 0.05 + i * 0.055, 0.24, 0.28);
        }
        break;
      }
      case 'snow_throw': {
        const v = allocateVoice(ac, dest, now, 0.22, vol * 0.75);
        noise(ac, v, 'bandpass', 900 * p, 2800 * p, 1.6, now, 0.17, 0.48, 0.2);
        tone(ac, v, 'sine', 320 * p, 620 * p, now, 0.14, 0.22);
        break;
      }
      case 'snow_hit': {
        const v = allocateVoice(ac, dest, now, 0.24, vol * 0.85);
        noise(ac, v, 'lowpass', 1800 * p, 420 * p, 1.1, now, 0.19, 0.6, 0.65);
        tone(ac, v, 'sine', 190 * p, 85 * p, now, 0.14, 0.42);
        break;
      }
      case 'vwoop': {
        const v = allocateVoice(ac, dest, now, 0.45, vol * 0.85);
        tone(ac, v, 'sawtooth', 620 * p, 130 * p, now, 0.24, 0.36, 1800);
        tone(ac, v, 'sine', 240 * p, 780 * p, now + 0.1, 0.28, 0.4);
        break;
      }
      case 'rumble': {
        const v = allocateVoice(ac, dest, now, 0.75, vol * 0.9);
        noise(ac, v, 'lowpass', 240 * p, 95 * p, 1.5, now, 0.68, 0.7, 0.05);
        tone(ac, v, 'sawtooth', 68 * p, 48 * p, now, 0.65, 0.42, 220);
        break;
      }
      case 'thunder': {
        const v = allocateVoice(ac, dest, now, 0.85, vol * 0.9);
        noise(ac, v, 'bandpass', 1800, 220, 0.9, now, 0.78, 0.72, 0.4);
        tone(ac, v, 'triangle', 120 * p, 42 * p, now, 0.55, 0.5);
        break;
      }
      case 'wither_spawn': {
        // Dramatic comic adventure chord (non-scary!)
        const v = allocateVoice(ac, dest, now, 0.85, vol * 0.9);
        tone(ac, v, 'sawtooth', 146.83 * p, 146.83 * p, now, 0.72, 0.3, 1100); // D3
        tone(ac, v, 'sawtooth', 220.0 * p, 220.0 * p, now + 0.04, 0.68, 0.28, 1300); // A3
        tone(ac, v, 'triangle', 349.23 * p, 440.0 * p, now + 0.12, 0.6, 0.35); // F4->A4
        noise(ac, v, 'bandpass', 1200, 400, 1.4, now, 0.5, 0.35, 0.3);
        break;
      }
      case 'golem_spawn': {
        const v = allocateVoice(ac, dest, now, 0.8, vol * 0.9);
        // Iron anvil chime + warm fifth chord
        tone(ac, v, 'triangle', 1180 * p, 1160 * p, now, 0.25, 0.32);
        tone(ac, v, 'triangle', 261.63 * p, 261.63 * p, now + 0.05, 0.68, 0.36);
        tone(ac, v, 'triangle', 392.0 * p, 392.0 * p, now + 0.09, 0.64, 0.32);
        tone(ac, v, 'sine', 523.25 * p, 523.25 * p, now + 0.14, 0.6, 0.34);
        break;
      }
      case 'hrrm': {
        // Villager nasal "hrrrrm?"
        const v = allocateVoice(ac, dest, now, 0.46, vol * 0.85);
        const osc = ac.createOscillator();
        const f1 = ac.createBiquadFilter();
        const g = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(145 * p, now);
        osc.frequency.linearRampToValueAtTime(178 * p, now + 0.18);
        osc.frequency.linearRampToValueAtTime(136 * p, now + 0.4);
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(680, now);
        f1.Q.setValueAtTime(4.2, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.65, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        osc.connect(f1);
        f1.connect(g);
        g.connect(v.gain);
        osc.start(now);
        osc.stop(now + 0.44);
        v.track(osc);
        break;
      }
      case 'meow': {
        const v = allocateVoice(ac, dest, now, 0.44, vol * 0.85);
        const osc = ac.createOscillator();
        const biq = ac.createBiquadFilter();
        const g = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580 * p, now);
        osc.frequency.exponentialRampToValueAtTime(940 * p, now + 0.13);
        osc.frequency.exponentialRampToValueAtTime(510 * p, now + 0.39);
        biq.type = 'bandpass';
        biq.frequency.setValueAtTime(1450, now);
        biq.Q.setValueAtTime(2.4, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.62, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        osc.connect(biq);
        biq.connect(g);
        g.connect(v.gain);
        osc.start(now);
        osc.stop(now + 0.42);
        v.track(osc);
        break;
      }
      case 'baa': {
        const v = allocateVoice(ac, dest, now, 0.48, vol * 0.85);
        const osc = ac.createOscillator();
        const lfo = ac.createOscillator();
        const lfoG = ac.createGain();
        const biq = ac.createBiquadFilter();
        const g = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(285 * p, now);
        osc.frequency.linearRampToValueAtTime(255 * p, now + 0.42);
        lfo.frequency.setValueAtTime(28, now);
        lfoG.gain.setValueAtTime(18 * p, now);
        lfo.connect(lfoG);
        lfoG.connect(osc.frequency);
        biq.type = 'bandpass';
        biq.frequency.setValueAtTime(920, now);
        biq.Q.setValueAtTime(2.8, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.58, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.43);
        osc.connect(biq);
        biq.connect(g);
        g.connect(v.gain);
        osc.start(now);
        lfo.start(now);
        osc.stop(now + 0.45);
        lfo.stop(now + 0.45);
        v.track(osc);
        v.track(lfo);
        break;
      }
      case 'buzz': {
        const v = allocateVoice(ac, dest, now, 0.34, vol * 0.75);
        tone(ac, v, 'sawtooth', 195 * p, 235 * p, now, 0.28, 0.36, 950);
        tone(ac, v, 'square', 390 * p, 470 * p, now, 0.26, 0.14, 1200);
        break;
      }
      case 'kai_laugh': {
        // Mischievous 4-note staccato "he-he-he-he!"
        const v = allocateVoice(ac, dest, now, 0.55, vol * 0.9);
        const notes = [440, 520, 470, 580];
        for (let i = 0; i < notes.length; i++) {
          tone(ac, v, 'sawtooth', notes[i] * p, notes[i] * 0.86 * p, now + i * 0.095, 0.08, 0.42, 1600);
        }
        break;
      }
      case 'kai_whine': {
        // Comedic defeated "wah-wah-waaah"
        const v = allocateVoice(ac, dest, now, 0.72, vol * 0.88);
        tone(ac, v, 'sawtooth', 330 * p, 305 * p, now, 0.16, 0.38, 1200);
        tone(ac, v, 'sawtooth', 300 * p, 275 * p, now + 0.18, 0.16, 0.38, 1100);
        tone(ac, v, 'sawtooth', 270 * p, 195 * p, now + 0.36, 0.32, 0.42, 950);
        break;
      }
      case 'shutter': {
        const v = allocateVoice(ac, dest, now, 0.26, vol * 0.9);
        noise(ac, v, 'highpass', 2600, 4200, 2.0, now, 0.045, 0.65, 0.12);
        noise(ac, v, 'bandpass', 1800, 2400, 2.5, now + 0.065, 0.055, 0.55, 0.38);
        tone(ac, v, 'sine', 1600 * p, 2400 * p, now + 0.08, 0.14, 0.22);
        break;
      }
      case 'cheer': {
        const v = allocateVoice(ac, dest, now, 0.85, vol * 0.85);
        noise(ac, v, 'bandpass', 1100, 1900, 1.1, now, 0.75, 0.38, 0.2);
        const chord = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < chord.length; i++) {
          tone(ac, v, 'triangle', chord[i] * p, chord[i] * 1.02 * p, now + i * 0.04, 0.65, 0.24);
        }
        break;
      }
      case 'aww': {
        const v = allocateVoice(ac, dest, now, 0.65, vol * 0.8);
        tone(ac, v, 'triangle', 420 * p, 310 * p, now, 0.55, 0.36, 1000);
        tone(ac, v, 'sine', 525 * p, 390 * p, now + 0.02, 0.55, 0.28);
        break;
      }
      case 'clap': {
        const v = allocateVoice(ac, dest, now, 0.65, vol * 0.8);
        const offsets = [0, 0.075, 0.14, 0.22, 0.29, 0.38, 0.47];
        for (let i = 0; i < offsets.length; i++) {
          noise(ac, v, 'bandpass', 1500 + (i % 3) * 280, 1200, 2.2, now + offsets[i], 0.055, 0.42, i * 0.13);
        }
        break;
      }
      case 'fanfare': {
        const v = allocateVoice(ac, dest, now, 1.05, vol * 0.92);
        const seq = [
          [523.25, 0.0, 0.13],
          [659.25, 0.11, 0.13],
          [783.99, 0.22, 0.13],
          [1046.5, 0.34, 0.55],
        ];
        for (const [f, st, du] of seq) {
          tone(ac, v, 'sawtooth', f * p, f * p, now + st, du, 0.3, 2400);
          tone(ac, v, 'triangle', f * 0.5 * p, f * 0.5 * p, now + st, du, 0.25);
        }
        break;
      }
      case 'drumroll': {
        const v = allocateVoice(ac, dest, now, 0.85, vol * 0.85);
        for (let i = 0; i < 12; i++) {
          const t = i * 0.058;
          const amp = 0.2 + (i / 12) * 0.38;
          noise(ac, v, 'bandpass', 1400, 1800, 1.6, now + t, 0.05, amp, i * 0.09);
          tone(ac, v, 'triangle', 165, 110, now + t, 0.045, amp * 0.5);
        }
        break;
      }
      case 'munch': {
        const v = allocateVoice(ac, dest, now, 0.48, vol * 0.85);
        for (let i = 0; i < 3; i++) {
          const t = i * 0.13;
          noise(ac, v, 'bandpass', 1300 * p, 650 * p, 1.8, now + t, 0.09, 0.52, i * 0.21);
          tone(ac, v, 'triangle', 260 * p, 120 * p, now + t, 0.08, 0.35);
        }
        break;
      }
      case 'sneeze': {
        // Cute "ah-CHOO!"
        const v = allocateVoice(ac, dest, now, 0.48, vol * 0.88);
        tone(ac, v, 'sine', 420 * p, 780 * p, now, 0.14, 0.35);
        noise(ac, v, 'bandpass', 2400 * p, 1100 * p, 1.3, now + 0.17, 0.22, 0.62, 0.55);
        tone(ac, v, 'triangle', 680 * p, 320 * p, now + 0.17, 0.18, 0.4);
        break;
      }
      case 'kaching': {
        const v = allocateVoice(ac, dest, now, 0.65, vol * 0.9);
        tone(ac, v, 'sine', 987.77 * p, 987.77 * p, now, 0.12, 0.45); // B5
        tone(ac, v, 'sine', 1318.5 * p, 1318.5 * p, now + 0.075, 0.5, 0.5); // E6
        tone(ac, v, 'triangle', 2637.0 * p, 2637.0 * p, now + 0.075, 0.28, 0.25);
        break;
      }
      case 'portal': {
        const v = allocateVoice(ac, dest, now, 0.75, vol * 0.8);
        const notes = [392.0, 493.88, 587.33, 783.99, 987.77];
        for (let i = 0; i < notes.length; i++) {
          tone(ac, v, 'sine', notes[i] * p, notes[i] * 1.03 * p, now + i * 0.07, 0.42, 0.26);
        }
        break;
      }
      case 'snip': {
        const v = allocateVoice(ac, dest, now, 0.22, vol * 0.8);
        for (let i = 0; i < 2; i++) {
          const t = i * 0.085;
          noise(ac, v, 'highpass', 3600 * p, 5200 * p, 2.5, now + t, 0.05, 0.48, i * 0.3);
          tone(ac, v, 'triangle', 1400 * p, 2200 * p, now + t, 0.045, 0.28);
        }
        break;
      }
      default: {
        const v = allocateVoice(ac, dest, now, 0.14, vol * 0.65);
        tone(ac, v, 'sine', 540 * p, 720 * p, now, 0.1, 0.4);
        break;
      }
    }
    return true;
  }

  function stopAll() {
    const ac = getAudioCtx();
    const now = ac ? ac.currentTime : 0;
    while (voices.length > 0) {
      const v = voices.shift();
      try { v.stop(now); } catch (_) {}
    }
  }

  return {
    play,
    stopAll,
    activeVoices: () => {
      const ac = getAudioCtx();
      if (ac) pruneVoices(ac.currentTime);
      return voices.length;
    },
  };
}
