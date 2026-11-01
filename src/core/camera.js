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
  let focusPunchDist = 0;
  let focusPunchFov = 0;
  let focusDurationLeft = 0;

  // Built-in fallback shake if fx-audio isn't active or cam.shake() is called directly
  const fallbackShakeOffset = new THREE.Vector3();
  let shakeIntensity = 0;
  let shakeDuration = 0;
  let shakeElapsed = 0;
  let shakePhase = 0;

  const DEG2RAD = Math.PI / 180;
  const lerpNum = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Follow smoothing: exponential rate 9.5/s at the authored 4.3 b/s walk, scaled up with speed (v1.1).
  const FOLLOW_RATE = 9.5;
  const FOLLOW_REF_SPEED = 4.3;
  let followSpeed = 0;

  function computeLensParams() {
    const w = window.innerWidth || 1280;
    const h = Math.max(1, window.innerHeight || 800);
    const asp = w / h;
    const inWorld = (ctx.state?.scene || 'title') === 'world';

    // #160 G3 aspect-adaptive world framing:
    // - Desktop (1280x800, asp ~1.6): vFOV ~55°, pitch ~49°, dist ~8.2, player ~61% height, 15b ahead on-screen
    // - Phone landscape (asp >= 1.8, e.g. 844x390): vFOV ~60°, pitch ~46°, dist 7.5*1.3=9.75, player ~64% height, 15b+ ahead on-screen
    // - Phone portrait (asp < 1.0, e.g. 390x844): vFOV ~70°, pitch ~48°, dist ~9.6, player ~60% height, 15b ahead on-screen
    let fov = 55;
    let pitchDeg = 49;
    let dist = 8.2;
    let lookAhead = 2.25;
    const targetY = 0.95;

    if (asp < 1.0) {
      const t = clamp01((1.0 - asp) / 0.48); // t=1 at asp<=0.52 (390x844 -> 0.462)
      fov = lerpNum(58, 70, t);
      pitchDeg = lerpNum(49, 48, t);
      dist = lerpNum(8.5, 9.6, t);
      lookAhead = lerpNum(2.4, 3.2, t);
    } else if (asp < 1.6) {
      const t = clamp01((asp - 1.0) / 0.6);
      fov = lerpNum(58, 55, t);
      pitchDeg = 49;
      dist = lerpNum(8.5, 8.2, t);
      lookAhead = lerpNum(2.4, 2.25, t);
    } else {
      const t = clamp01((asp - 1.6) / 0.2); // t=1 for all asp >= 1.8 (844x390 -> 2.164)
      fov = lerpNum(55, 60, t);
      pitchDeg = lerpNum(49, 46, t);
      dist = lerpNum(8.2, 7.5 * 1.3, t); // 9.75 at asp >= 1.8
      lookAhead = lerpNum(2.25, 3.79, t); // player at ~64% height
    }

    if (!inWorld) {
      // Keep title / booth / finale stage lenses free of wide-angle distortion
      fov = asp < 1.0 ? lerpNum(52, 62, clamp01((1.0 - asp) / 0.54)) : asp >= 1.8 ? 52 : 50;
    } else if (mode === 'focus' && focusPunchFov !== 0) {
      fov = Math.max(40, fov + focusPunchFov);
    }

    const height = targetY + (dist + lookAhead) * Math.tan(pitchDeg * DEG2RAD);

    if (Math.abs(camera.fov - fov) > 0.05 || Math.abs(camera.aspect - asp) > 0.001) {
      camera.fov = fov;
      camera.aspect = asp;
      camera.updateProjectionMatrix();
    }
    return { dist, height, lookAhead, targetY, asp, fov, pitchDeg };
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
    const punch = Math.max(0, Number(opts.zoomPunch) || 0);
    focusPunchDist = punch;
    focusPunchFov = punch > 0 ? 3.5 : 0; // starts slightly wider and punches in by -3.5°
    focusDurationLeft = Number(opts.duration) > 0 ? Number(opts.duration) : 0;
    focusOpts = {
      distance: opts.distance ?? 6.0,
      height: opts.height ?? 2.75,
      yaw: opts.yaw ?? 0,
      instant: Boolean(opts.instant),
      hasPunch: punch > 0,
      manualClearOnly: Boolean(opts.manualClearOnly),
    };
    if (focusOpts.instant) {
      snap();
    }
  }

  function updateFocusTarget(pos, opts = {}) {
    if (mode !== 'focus' || !focusPoint || !pos) return;
    focusPoint.set(pos.x ?? focusPoint.x, pos.y ?? focusPoint.y, pos.z ?? focusPoint.z);
    if (focusOpts) {
      focusOpts.liveTrack = true;
      if (opts.distance !== undefined) focusOpts.distance = opts.distance;
      if (opts.height !== undefined) focusOpts.height = opts.height;
    }
  }

  function clearFocus() {
    focusPoint = null;
    focusOpts = null;
    focusPunchDist = 0;
    focusPunchFov = 0;
    focusDurationLeft = 0;
    mode = ctx.state?.scene === 'title' ? 'title' : 'follow';
    computeLensParams();
  }

  function setMode(nextMode) {
    mode = nextMode;
    if (nextMode !== 'focus') {
      focusPoint = null;
      focusOpts = null;
      focusPunchDist = 0;
      focusPunchFov = 0;
      focusDurationLeft = 0;
    }
    computeLensParams();
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
      const portraitScale = (ctx.state?.scene === 'world' && computeLensParams().asp < 0.72) ? 1.14 : 1.0;
      const fDist = ((focusOpts?.distance ?? 6.0) + focusPunchDist) * portraitScale;
      const fHeight = (focusOpts?.height ?? 2.75) + focusPunchDist * 0.32;
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
    followSpeed = 0;
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
    const safeDt = Math.max(0.001, dt);
    if (mode === 'focus') {
      if (focusOpts?.hasPunch && (focusPunchDist > 0.002 || Math.abs(focusPunchFov + 2.5) > 0.01)) {
        const punchDecay = Math.exp(-10.5 * safeDt);
        focusPunchDist *= punchDecay;
        if (focusPunchDist < 0.003) focusPunchDist = 0;
        // Ease FOV from +3.5° down to -2.5° for a crisp comedic zoom-in punch
        focusPunchFov = -2.5 + (focusPunchFov + 2.5) * punchDecay;
      }
      if (focusDurationLeft > 0 && !focusOpts?.manualClearOnly) {
        focusDurationLeft -= safeDt;
        if (focusDurationLeft <= 0) {
          clearFocus();
        }
      }
    }

    computeDesired();
    updateFallbackShake(dt);

    if (mode === 'focus' && focusOpts?.liveTrack) {
      currentPos.copy(desiredPos);
      currentLook.copy(target);
    } else {
      // v1.1: follow stiffness scales with walking speed so the steady trailing lag stays ~0.45 block
      // (v / rate) at 6.5–7.8 b/s exactly as it was at 4.3 b/s — the player never drifts off-centre.
      const ps = mode === 'follow' ? Number(ctx.player?.currentSpeed?.()) || 0 : 0;
      followSpeed += (ps - followSpeed) * Math.min(1, safeDt * 6);
      const followRate = FOLLOW_RATE * Math.min(2, Math.max(1, followSpeed / FOLLOW_REF_SPEED));
      const rate = mode === 'focus' ? 14.0 : followRate;
      const alpha = Math.min(1, 1 - Math.exp(-rate * safeDt));
      currentPos.lerp(desiredPos, alpha);
      currentLook.lerp(target, alpha);
    }

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
    updateFocusTarget,
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
