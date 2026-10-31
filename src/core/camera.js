// Aspect-adaptive follow/focus camera rig + position & target shake per docs/DESIGN.md §5, §8.7 (owner: core).
import * as THREE from '../../vendor/three.module.min.js';

export function createCameraRig(ctx) {
  const aspect = (window.innerWidth || 1280) / Math.max(1, window.innerHeight || 800);
  const camera = new THREE.PerspectiveCamera(52, aspect, 0.2, 220);

  // Yaw = 0 looks NORTH (-Z) per §5 ("camera yaw looks north = -z").
  let yaw = 0;
  let mode = 'title'; // 'title' | 'follow' | 'focus'

  const target = new THREE.Vector3(48, 9.2, 48);
  const desiredPos = new THREE.Vector3(48, 15, 62);
  const currentPos = new THREE.Vector3(48, 15, 62);
  const currentLook = new THREE.Vector3(48, 10.5, 40);
  const finalLook = new THREE.Vector3();

  let focusPoint = null;
  let focusOpts = null;

  // Built-in fallback shake if fx-audio isn't active or cam.shake() is called directly
  const fallbackShakeOffset = new THREE.Vector3();
  let shakeIntensity = 0;
  let shakeDuration = 0;
  let shakeElapsed = 0;
  let shakePhase = 0;

  const TAN_PITCH_52 = Math.tan((52 * Math.PI) / 180); // ~1.27994 (~52° downward pitch per #144)

  function computeLensParams() {
    const w = window.innerWidth || 1280;
    const h = Math.max(1, window.innerHeight || 800);
    const asp = w / h;

    // Aspect-adaptive portrait vs landscape (§8.7 + #144: ~52° pitch & player at ~58% screen height)
    let fov = 50;
    let dist = 7.5;
    let lookAhead = 1.32;
    const targetY = 0.95;

    if (asp < 1) {
      // Portrait (e.g. 390x844 -> asp ~ 0.46)
      const t = Math.min(1, (1 - asp) / 0.56);
      const scale = 1 + t * 0.28;
      fov = 50 + t * 12; // up to 62 deg
      dist = 7.5 * scale;
      lookAhead = (1.32 + t * 0.36) * scale;
    } else if (asp > 1.85) {
      // Short landscape (e.g. 844x390 -> asp ~ 2.16)
      fov = 46;
      dist = 7.2;
      lookAhead = 1.18;
    }

    const height = targetY + (dist + lookAhead) * TAN_PITCH_52;

    if (Math.abs(camera.fov - fov) > 0.05 || Math.abs(camera.aspect - asp) > 0.001) {
      camera.fov = fov;
      camera.aspect = asp;
      camera.updateProjectionMatrix();
    }
    return { dist, height, lookAhead, targetY, asp };
  }

  function resize() {
    computeLensParams();
  }

  function orbit(deltaRad) {
    if (!Number.isFinite(deltaRad)) return;
    yaw += deltaRad;
    // Wrap into [-PI, PI]
    while (yaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw < -Math.PI) yaw += Math.PI * 2;
  }

  function setYaw(rad) {
    yaw = Number.isFinite(rad) ? rad : 0;
  }

  function focus(pos, opts = {}) {
    if (!pos) return;
    mode = 'focus';
    focusPoint = new THREE.Vector3(pos.x ?? 48, pos.y ?? 9, pos.z ?? 52);
    focusOpts = {
      distance: opts.distance ?? 8.2,
      height: opts.height ?? 3.1,
      yaw: opts.yaw ?? 0,
      instant: Boolean(opts.instant),
    };
    if (focusOpts.instant) {
      snap();
    }
  }

  function clearFocus() {
    focusPoint = null;
    focusOpts = null;
    mode = ctx.state?.scene === 'title' ? 'title' : 'follow';
  }

  function setMode(nextMode) {
    mode = nextMode;
    if (nextMode !== 'focus') {
      focusPoint = null;
      focusOpts = null;
    }
  }

  function shake(intensity = 0.5, seconds = 0.45) {
    if (ctx.fx?.shake) {
      ctx.fx.shake(intensity, seconds);
      return;
    }
    shakeIntensity = Math.max(shakeIntensity, Number(intensity) || 0.5);
    shakeDuration = Math.max(shakeDuration - shakeElapsed, Number(seconds) || 0.45);
    shakeElapsed = 0;
    if (ctx.state?.stats) {
      ctx.state.stats.shakes = (ctx.state.stats.shakes || 0) + 1;
    }
  }

  function updateFallbackShake(dt) {
    if (shakeDuration <= 0 || shakeElapsed >= shakeDuration || shakeIntensity <= 0) {
      fallbackShakeOffset.set(0, 0, 0);
      shakeIntensity = 0;
      shakeDuration = 0;
      shakeElapsed = 0;
      return;
    }
    shakeElapsed += dt;
    const rem = Math.max(0, 1 - shakeElapsed / shakeDuration);
    const amp = shakeIntensity * rem * rem;
    shakePhase += dt * 45;
    fallbackShakeOffset.set(
      Math.sin(shakePhase * 1.17) * amp,
      Math.cos(shakePhase * 1.63) * amp * 0.8,
      Math.sin(shakePhase * 1.91) * amp
    );
  }

  function computeDesired() {
    const { dist, height, lookAhead, targetY } = computeLensParams();
    const simT = ctx.time || 0;

    if (mode === 'title' || ctx.state?.scene === 'title') {
      // Frame the plaza, red-caped mystery figures, and 5-row tier wall (§8.7)
      const swayX = Math.sin(simT * 0.32) * 3.2;
      const swayZ = Math.cos(simT * 0.24) * 1.2;
      desiredPos.set(48 + swayX, 13.2, 60.5 + swayZ);
      target.set(48, 10.8, 39.5);
      return;
    }

    if (mode === 'focus' && focusPoint) {
      const fYaw = focusOpts?.yaw ?? 0;
      const fDist = focusOpts?.distance ?? 8.2;
      const fHeight = focusOpts?.height ?? 3.1;
      target.copy(focusPoint);
      desiredPos.set(
        focusPoint.x + Math.sin(fYaw) * fDist,
        focusPoint.y + fHeight,
        focusPoint.z + Math.cos(fYaw) * fDist
      );
      return;
    }

    // Follow player rig (~52° downward pitch, player at ~58% screen height so north targets have room)
    const px = ctx.state?.player?.x ?? 48;
    const py = ctx.state?.player?.y ?? 8;
    const pz = ctx.state?.player?.z ?? 66;

    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    target.set(px + fwdX * lookAhead, py + targetY, pz + fwdZ * lookAhead);

    desiredPos.set(
      px + Math.sin(yaw) * dist,
      py + height,
      pz + Math.cos(yaw) * dist
    );
  }

  function snap() {
    fallbackShakeOffset.set(0, 0, 0);
    shakeIntensity = 0;
    shakeDuration = 0;
    shakeElapsed = 0;
    shakePhase = 0;
    computeDesired();
    currentPos.copy(desiredPos);
    currentLook.copy(target);
    camera.position.copy(currentPos);
    camera.lookAt(currentLook);
    camera.updateMatrixWorld();
  }

  function update(dt) {
    computeDesired();
    updateFallbackShake(dt);

    const alpha = Math.min(1, 1 - Math.exp(-9.5 * Math.max(0.001, dt)));
    currentPos.lerp(desiredPos, alpha);
    currentLook.lerp(target, alpha);

    // Apply shake to BOTH camera position AND look target (§3.8, brief #117)
    const fxOff = ctx.fx?.shakeOffset || ctx.fx?.shake?.offset || null;
    const sx = (fxOff?.x || 0) + fallbackShakeOffset.x;
    const sy = (fxOff?.y || 0) + fallbackShakeOffset.y;
    const sz = (fxOff?.z || 0) + fallbackShakeOffset.z;

    camera.position.set(currentPos.x + sx, currentPos.y + sy, currentPos.z + sz);
    finalLook.set(currentLook.x + sx, currentLook.y + sy, currentLook.z + sz);
    camera.lookAt(finalLook);
    camera.updateMatrixWorld();
  }

  const rig = {
    camera,
    handlesShake: true,
    target,
    lookTarget: target,
    get yaw() {
      return yaw;
    },
    get mode() {
      return mode;
    },
    orbit,
    setYaw,
    focus,
    clearFocus,
    followPlayer: clearFocus,
    setMode,
    shake,
    snap,
    resize,
    update,
  };

  snap();
  return rig;
}

export default createCameraRig;
