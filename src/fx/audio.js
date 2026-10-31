// Master WebAudio engine per docs/DESIGN.md §3.8, §9 (owner: fx-audio).
// Master compressor/limiter, <= 12 SFX voices, first-pointerdown unlock, music + sfx mute flags,
// automatic event subscriptions, and deterministic state.stats.sounds counter.
import { createSfx, SFX_NAMES } from './sfx.js';
import { createMusic, MUSIC_TRACKS } from './music.js';

export { SFX_NAMES, MUSIC_TRACKS };

export function createAudio(ctx) {
  let audioCtx = null;
  let compressor = null;
  let sfxBus = null;
  let musicBus = null;
  let mutedMusic = false;
  let mutedSfx = false;
  let unlocked = false;

  function ensureStats() {
    const s = ctx?.state;
    if (!s) return null;
    if (!s.stats) {
      s.stats = { particles: 0, sounds: 0, shakes: 0, confetti: 0, fireworks: 0 };
    }
    return s.stats;
  }

  function ensureGraph() {
    if (audioCtx) return audioCtx;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC();
      // Master limiter / compressor per §9
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 12;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      compressor.connect(audioCtx.destination);

      sfxBus = audioCtx.createGain();
      sfxBus.gain.value = mutedSfx ? 0 : 0.85;
      sfxBus.connect(compressor);

      musicBus = audioCtx.createGain();
      musicBus.gain.value = mutedMusic ? 0 : 0.42;
      musicBus.connect(compressor);
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }

  const sfxEngine = createSfx(() => audioCtx, () => sfxBus, ctx);
  const musicEngine = createMusic(() => audioCtx, () => musicBus);

  function unlock() {
    const ac = ensureGraph();
    if (!ac) return false;
    if (ac.state === 'suspended') {
      ac.resume().then(() => {
        unlocked = true;
        musicEngine.tick();
      }).catch(() => {});
    } else {
      unlocked = true;
      musicEngine.tick();
    }
    return unlocked;
  }

  // Bind first pointerdown / keydown unlock automatically per §3.8 & §9
  if (typeof window !== 'undefined') {
    const onFirstGesture = () => {
      unlock();
      if (audioCtx && audioCtx.state === 'running') {
        window.removeEventListener('pointerdown', onFirstGesture, true);
        window.removeEventListener('touchend', onFirstGesture, true);
        window.removeEventListener('keydown', onFirstGesture, true);
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('touchend', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onFirstGesture, { capture: true, passive: true });
  }

  function play(name, opts = {}) {
    if (!name) return false;
    // Increment state.stats.sounds deterministically on every logical play call
    // so stepFrames(n) and headless --mute-audio runs satisfy F11 & F13 cleanly.
    const stats = ensureStats();
    if (stats) stats.sounds = (stats.sounds || 0) + 1;

    if (mutedSfx) return false;
    if (!audioCtx) return false;
    return sfxEngine.play(name, opts);
  }

  function music(track = null) {
    return musicEngine.play(track);
  }

  function setMuted(arg) {
    if (typeof arg === 'boolean') {
      mutedMusic = arg;
      mutedSfx = arg;
    } else if (arg && typeof arg === 'object') {
      if (arg.music !== undefined) mutedMusic = Boolean(arg.music);
      if (arg.sfx !== undefined) mutedSfx = Boolean(arg.sfx);
    }
    if (sfxBus && audioCtx) {
      sfxBus.gain.setTargetAtTime(mutedSfx ? 0 : 0.85, audioCtx.currentTime, 0.015);
    }
    if (musicBus && audioCtx) {
      musicBus.gain.setTargetAtTime(mutedMusic ? 0 : 0.42, audioCtx.currentTime, 0.03);
    }
    if (mutedSfx) sfxEngine.stopAll();
    return { music: mutedMusic, sfx: mutedSfx };
  }

  function getMuted() {
    return { music: mutedMusic, sfx: mutedSfx };
  }

  function areaTrack(area) {
    if (area === 'nether') return 'nether';
    if (area === 'end') return 'end';
    return 'overworld';
  }

  // Subscribe to §3.2 events for automatic SFX & music transitions
  const ev = ctx?.events;
  if (ev && typeof ev.on === 'function') {
    ev.on('sfx', (payload) => {
      if (typeof payload === 'string') play(payload);
      else if (payload?.name) play(payload.name, payload);
    });
    ev.on('areaChange', (p) => {
      play('portal');
      const sc = ctx?.state?.scene;
      if (!sc || sc === 'world') {
        music(areaTrack(p?.area || ctx?.state?.area));
      }
    });
    ev.on('sceneChange', (p) => {
      const sc = p?.scene || p;
      if (sc === 'title') music('title');
      else if (sc === 'world') music(areaTrack(ctx?.state?.area));
      else if (sc === 'booth' || sc === 'board') music('runway');
      else if (sc === 'finale' || sc === 'final') music('finale');
    });
  }

  return {
    unlock,
    play,
    music,
    setMuted,
    getMuted,
    sfxNames: SFX_NAMES,
    musicTracks: MUSIC_TRACKS,
    currentTrack: () => musicEngine.currentTrack(),
    activeVoices: () => sfxEngine.activeVoices(),
  };
}
