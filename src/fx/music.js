// Procedural WebAudio music tracks per docs/DESIGN.md §9 (owner: fx-audio).
// Tracks: title, overworld (C418-ish pentatonic piano + feedback-delay reverb), nether, end, runway, finale.

export const MUSIC_TRACKS = Object.freeze([
  'title',
  'overworld',
  'nether',
  'end',
  'runway',
  'finale',
]);

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// C major / A minor pentatonic MIDI notes:
// C3=48, D3=50, E3=52, G3=55, A3=57 | C4=60, D4=62, E4=64, G4=67, A4=69 | C5=72, D5=74, E5=76, G5=79, A5=81
const OVERWORLD_CHORDS = [
  [53, 60, 64, 69], // Fmaj7
  [48, 55, 64, 67], // Cmaj
  [57, 64, 67, 72], // Am7
  [55, 62, 67, 71], // G6
];
const OVERWORLD_MELODY = [
  76, null, 74, 72, null, 69, null, null,
  72, 74, 76, null, 79, null, 76, null,
  72, null, 69, 67, null, 64, null, null,
  67, 69, 72, null, 69, null, null, null,
];

const TITLE_MELODY = [
  72, 74, 76, 79, 81, 79, 76, 72,
  74, 76, 79, 76, 74, null, 67, null,
  72, 76, 79, 84, 81, 79, 76, 74,
  72, null, 67, 72, 76, null, null, null,
];
const TITLE_BASS = [48, 48, 53, 53, 57, 57, 55, 55];

const NETHER_PAD = [
  [38, 45, 53], // Dm
  [36, 43, 52], // C
  [34, 41, 50], // Bbmaj7
  [38, 45, 52], // Dm9
];
const NETHER_PLUCK = [62, null, 65, null, 69, null, 67, null, 64, null, 62, null, 57, null, null, null];

const END_PAD = [
  [52, 59, 66, 71], // Emaj9-ish airy 5ths
  [50, 57, 64, 69], // D6/9
  [48, 55, 62, 67], // Cmaj9
  [55, 62, 69, 74], // Gmaj9
];
const END_STARS = [83, null, null, 78, null, 81, null, null, 86, null, null, 79, null, null, 76, null];

const RUNWAY_BASS = [
  36, 48, 36, 48, 33, 45, 33, 45,
  41, 53, 41, 53, 43, 55, 45, 47,
];
const RUNWAY_LEAD = [
  72, null, 76, 79, null, 76, 74, null,
  69, null, 72, 76, null, 74, 72, null,
  65, null, 69, 72, null, 76, 79, null,
  79, 76, 74, 72, 74, null, 79, null,
];

const FINALE_BASS = [
  48, 60, 52, 64, 53, 65, 55, 67,
  57, 69, 53, 65, 55, 67, 48, 60,
];
const FINALE_LEAD = [
  72, 76, 79, 84, 81, 79, 84, null,
  77, 81, 84, 88, 86, 84, 79, null,
  81, 84, 88, 84, 79, 76, 72, 76,
  74, 79, 83, 86, 84, null, 72, null,
];

export function createMusic(getAudioCtx, getMusicBus) {
  let current = null;
  let step = 0;
  let nextNoteTime = 0;
  let timerId = null;
  let fxChain = null;

  function ensureFxChain(ac, musicBus) {
    if (fxChain && fxChain.ac === ac) return fxChain;
    // Lush feedback-delay reverb + dry bus for C418-style piano & ambient pads
    const dry = ac.createGain();
    dry.gain.value = 0.85;
    dry.connect(musicBus);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = 0.37;
    const damp = ac.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1950;
    const fb = ac.createGain();
    fb.gain.value = 0.42;
    const wet = ac.createGain();
    wet.gain.value = 0.36;

    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(wet);
    wet.connect(musicBus);

    const send = ac.createGain();
    send.gain.value = 1.0;
    send.connect(dry);
    send.connect(delay);

    fxChain = { ac, dry, send, wet, fb };
    return fxChain;
  }

  function feltPianoNote(ac, dest, midi, time, dur, amp = 0.16) {
    const f = midiToFreq(midi);
    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f, time);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(f * 2, time);
    osc2.detune.setValueAtTime(3.5, time);

    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.18, time);
    g2.gain.exponentialRampToValueAtTime(0.01, time + Math.min(0.35, dur * 0.5));

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(2600, f * 3.5), time);
    filt.frequency.exponentialRampToValueAtTime(Math.max(320, f * 1.3), time + dur);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(amp, time + 0.022);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc1.connect(filt);
    osc2.connect(g2);
    g2.connect(filt);
    filt.connect(g);
    g.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.03);
    osc2.stop(time + dur + 0.03);
  }

  function padChord(ac, dest, midis, time, dur, amp = 0.075, type = 'triangle', cutoff = 900) {
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, time);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(amp, time + Math.min(0.6, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    filt.connect(g);
    g.connect(dest);

    for (let i = 0; i < midis.length; i++) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(midiToFreq(midis[i]), time);
      osc.detune.setValueAtTime((i - 1.5) * 4.5, time);
      osc.connect(filt);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
  }

  function bouncyBass(ac, dest, midi, time, dur, amp = 0.15) {
    const f = midiToFreq(midi);
    const osc = ac.createOscillator();
    const filt = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f, time);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(980, time);
    filt.frequency.exponentialRampToValueAtTime(260, time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(amp, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function leadSynth(ac, dest, midi, time, dur, amp = 0.12, type = 'triangle') {
    const f = midiToFreq(midi);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(amp, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function scheduleStep(ac, chain, s, t) {
    switch (current) {
      case 'overworld': {
        // Gentle 82 BPM C418-ish soft pentatonic piano with feedback-delay reverb
        const stepDur = 0.36;
        if (s % 8 === 0) {
          const chord = OVERWORLD_CHORDS[Math.floor(s / 8) % OVERWORLD_CHORDS.length];
          for (let i = 0; i < chord.length; i++) {
            feltPianoNote(ac, chain.send, chord[i], t + i * 0.055, stepDur * 7.2, 0.09);
          }
        }
        const m = OVERWORLD_MELODY[s % OVERWORLD_MELODY.length];
        if (m !== null) {
          feltPianoNote(ac, chain.send, m, t, stepDur * 3.4, 0.135);
        }
        return stepDur;
      }
      case 'title': {
        const stepDur = 0.22;
        if (s % 4 === 0) {
          const b = TITLE_BASS[Math.floor(s / 4) % TITLE_BASS.length];
          feltPianoNote(ac, chain.send, b, t, stepDur * 3.8, 0.13);
          feltPianoNote(ac, chain.send, b + 12, t + 0.02, stepDur * 2.5, 0.08);
        }
        const m = TITLE_MELODY[s % TITLE_MELODY.length];
        if (m !== null) {
          feltPianoNote(ac, chain.send, m, t, stepDur * 2.2, 0.13);
        }
        return stepDur;
      }
      case 'nether': {
        // Warm low cavern drone + crystal droplets (non-scary)
        const stepDur = 0.42;
        if (s % 8 === 0) {
          const chord = NETHER_PAD[Math.floor(s / 8) % NETHER_PAD.length];
          padChord(ac, chain.send, chord, t, stepDur * 8.2, 0.085, 'sawtooth', 420);
        }
        const pl = NETHER_PLUCK[s % NETHER_PLUCK.length];
        if (pl !== null) {
          feltPianoNote(ac, chain.send, pl, t, stepDur * 2.6, 0.09);
        }
        return stepDur;
      }
      case 'end': {
        // Airy floating pad + twinkling celesta stars
        const stepDur = 0.44;
        if (s % 8 === 0) {
          const chord = END_PAD[Math.floor(s / 8) % END_PAD.length];
          padChord(ac, chain.send, chord, t, stepDur * 8.4, 0.08, 'sine', 1400);
        }
        const star = END_STARS[s % END_STARS.length];
        if (star !== null) {
          leadSynth(ac, chain.send, star, t, stepDur * 2.8, 0.075, 'sine');
        }
        return stepDur;
      }
      case 'runway': {
        // Bouncy square-bass catwalk groove (124 BPM eighth notes)
        const stepDur = 0.24;
        const b = RUNWAY_BASS[s % RUNWAY_BASS.length];
        bouncyBass(ac, chain.dry, b, t, stepDur * 0.88, 0.14);
        const ld = RUNWAY_LEAD[s % RUNWAY_LEAD.length];
        if (ld !== null) {
          leadSynth(ac, chain.send, ld, t, stepDur * 1.4, 0.115, 'triangle');
        }
        return stepDur;
      }
      case 'finale': {
        // Celebratory pageant finale (132 BPM)
        const stepDur = 0.22;
        const b = FINALE_BASS[s % FINALE_BASS.length];
        bouncyBass(ac, chain.dry, b, t, stepDur * 0.9, 0.13);
        const ld = FINALE_LEAD[s % FINALE_LEAD.length];
        if (ld !== null) {
          leadSynth(ac, chain.send, ld, t, stepDur * 1.5, 0.12, 'sawtooth');
          leadSynth(ac, chain.send, ld + 12, t, stepDur * 1.1, 0.06, 'sine');
        }
        return stepDur;
      }
      default:
        return 0.3;
    }
  }

  function tickScheduler() {
    if (!current) return;
    const ac = getAudioCtx();
    const bus = getMusicBus();
    if (!ac || !bus || ac.state !== 'running') return;
    const chain = ensureFxChain(ac, bus);
    const horizon = ac.currentTime + 0.18;
    if (nextNoteTime < ac.currentTime - 0.05) {
      nextNoteTime = ac.currentTime + 0.02;
    }
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 8) {
      const dur = scheduleStep(ac, chain, step, nextNoteTime);
      nextNoteTime += dur;
      step++;
    }
  }

  function startTimer() {
    if (timerId !== null || typeof window === 'undefined') return;
    timerId = window.setInterval(tickScheduler, 80);
  }

  function stopTimer() {
    if (timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function play(track = null) {
    if (!track) {
      stop();
      return null;
    }
    const name = MUSIC_TRACKS.includes(track) ? track : 'overworld';
    if (current === name) {
      tickScheduler();
      return current;
    }
    current = name;
    step = 0;
    const ac = getAudioCtx();
    nextNoteTime = ac ? ac.currentTime + 0.03 : 0;
    startTimer();
    tickScheduler();
    return current;
  }

  function stop() {
    current = null;
    stopTimer();
  }

  return {
    play,
    stop,
    tick: tickScheduler,
    currentTrack: () => current,
  };
}
