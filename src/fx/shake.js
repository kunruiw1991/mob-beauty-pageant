// Camera & look-target shake controller per docs/DESIGN.md §3.8 (owner: fx-audio).
import * as THREE from '../../vendor/three.module.min.js';

export function createShake(ctx) {
  const offset = new THREE.Vector3(0, 0, 0);
  const applied = new THREE.Vector3(0, 0, 0);
  let intensity = 0;
  let duration = 0;
  let elapsed = 0;
  let phase = 0;

  function ensureStats() {
    const s = ctx?.state;
    if (!s) return null;
    if (!s.stats) {
      s.stats = { particles: 0, sounds: 0, shakes: 0, confetti: 0, fireworks: 0 };
    }
    return s.stats;
  }

  function trigger(mag = 0.5, seconds = 0.4) {
    const m = Math.max(0, Number(mag) || 0.5);
    const d = Math.max(0.05, Number(seconds) || 0.4);
    intensity = Math.max(intensity, m);
    duration = Math.max(duration - elapsed, d);
    elapsed = 0;
    const stats = ensureStats();
    if (stats) stats.shakes = (stats.shakes || 0) + 1;
  }

  function unapplyFromCamera() {
    if (applied.lengthSq() === 0) return;
    if (ctx?.camera?.position) {
      ctx.camera.position.sub(applied);
    }
    const tgt = ctx?.cam?.target || ctx?.cam?.lookTarget;
    if (tgt && typeof tgt.sub === 'function') {
      tgt.sub(applied);
    }
    applied.set(0, 0, 0);
  }

  function update(dt, applyDirect = true) {
    unapplyFromCamera();
    if (duration <= 0 || elapsed >= duration || intensity <= 0) {
      offset.set(0, 0, 0);
      intensity = 0;
      duration = 0;
      elapsed = 0;
      return offset;
    }
    elapsed += dt;
    if (elapsed >= duration) {
      offset.set(0, 0, 0);
      intensity = 0;
      duration = 0;
      elapsed = 0;
      return offset;
    }
    const decay = 1 - elapsed / duration;
    const amp = intensity * decay * decay;
    phase += dt * 47.0;
    // Deterministic multi-frequency sinusoidal shake.
    const dx = (Math.sin(phase * 1.13) * 0.65 + Math.cos(phase * 2.41) * 0.35) * amp;
    const dy = (Math.cos(phase * 1.57) * 0.6 + Math.sin(phase * 2.93) * 0.4) * amp * 0.8;
    const dz = (Math.sin(phase * 1.89) * 0.55 + Math.cos(phase * 2.17) * 0.45) * amp;
    offset.set(dx, dy, dz);

    // Move BOTH camera position AND look target so translation is parallel and palpable
    // even if camera.js does not manually read fx.shakeOffset. If camera.js sets
    // ctx.cam.handlesShake = true, skip direct application to avoid double-offset.
    if (applyDirect && !ctx?.cam?.handlesShake) {
      if (ctx?.camera?.position) {
        ctx.camera.position.add(offset);
        applied.copy(offset);
        const tgt = ctx?.cam?.target || ctx?.cam?.lookTarget;
        if (tgt && typeof tgt.add === 'function') {
          tgt.add(offset);
        }
      }
    }
    return offset;
  }

  function apply(camera, target) {
    if (!offset || offset.lengthSq() === 0) return;
    if (camera?.position) camera.position.add(offset);
    if (target && typeof target.add === 'function') target.add(offset);
  }

  function reset() {
    unapplyFromCamera();
    offset.set(0, 0, 0);
    intensity = 0;
    duration = 0;
    elapsed = 0;
    phase = 0;
  }

  return {
    offset,
    trigger,
    shake: trigger,
    update,
    apply,
    isActive: () => duration > 0 && elapsed < duration,
    reset,
  };
}
