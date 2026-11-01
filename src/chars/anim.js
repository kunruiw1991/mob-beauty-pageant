export const ANIMS = [
  'idle', 'walk', 'run', 'strut', 'wave', 'cheer', 'pose', 'shrug', 'flex', 'pushup',
  'sad', 'happy', 'sneak', 'throw', 'dig', 'hop', 'teleport', 'spawn',
  'eat', 'sneeze', 'faint', 'dizzy', 'stuck', 'cry', 'dance',
];

const ALIAS = {
  wiggle: 'stuck',
  flail: 'stuck',
  laugh: 'happy',
  clap: 'cheer',
  crouch: 'sneak',
  dizzyWalk: 'dizzy',
};

export function normalizeAnimName(name) {
  const n = name || 'idle';
  return ALIAS[n] || n;
}

export function resetRigPose(actor) {
  const { rig, parts } = actor;
  rig.position.set(0, actor.baseLift || 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.scale.set(1, 1, 1);
  for (const key of ['head', 'body', 'armL', 'armR', 'legL', 'legR']) {
    const p = parts[key];
    if (!p || !p.userData.restPos) continue;
    p.position.copy(p.userData.restPos);
    if (p.userData.restRot) {
      p.rotation.copy(p.userData.restRot);
    } else {
      p.rotation.set(0, 0, 0);
    }
    p.scale.set(1, 1, 1);
  }
  if (parts.poofRing) parts.poofRing.visible = false;
}

export function applyActorAnim(actor, dt) {
  const prevAnimTime = actor.animTime;
  actor.animTime += dt;
  const t = actor.animTime;
  // v1.1 gait clock: locomotion cycles (walk/run/sneak legs, bounce, footfalls) run at actor.gaitRate
  // (the player sets speed / authored speed, so leg swing frequency scales with walking speed). Accumulated
  // as a phase so a rate change never makes the legs jump; actors without gaitRate are unchanged.
  const gaitRate = actor.gaitRate > 0 ? actor.gaitRate : 1;
  actor.gaitTime = prevAnimTime === 0 ? dt * gaitRate : (actor.gaitTime || 0) + dt * gaitRate;
  const gt = actor.gaitTime;
  const isKai = actor.kind === 'kai';
  let name = normalizeAnimName(actor.anim);
  if (isKai && actor.finaleActive && (name === 'walk' || name === 'run' || name === 'idle')) {
    name = 'strut';
  }
  const slap = isKai ? 1.65 : 1.0;

  resetRigPose(actor);
  const { rig, parts, mobRigType } = actor;
  const { head, body, armL, armR, legL, legR } = parts;

  // Special hovered bee wing-flutter baseline
  if (mobRigType === 'bee') {
    const buzz = Math.sin(t * 36) * 0.55;
    if (armL) armL.rotation.z = 0.35 + buzz;
    if (armR) armR.rotation.z = -0.35 - buzz;
    rig.position.y = (actor.baseLift || 0.52) + Math.sin(t * 4.5 + actor.phase) * 0.09;
    rig.rotation.z = Math.sin(t * 3.1) * 0.06;
    if (name === 'hop' || name === 'cheer' || name === 'happy') {
      rig.position.y += Math.abs(Math.sin(t * 8)) * 0.25;
      rig.rotation.y = Math.sin(t * 6) * 0.35;
    } else if (name === 'teleport' || name === 'spawn') {
      applySpecialTransition(actor, name, t);
    }
    return;
  }

  // Slime cube bouncy squash & stretch baseline
  if (mobRigType === 'slime') {
    if (name === 'teleport' || name === 'spawn') {
      applySpecialTransition(actor, name, t);
      return;
    }
    const speed = name === 'idle' ? 2.4 : 4.2;
    const ph = ((t * speed + actor.phase * 0.2) % 1);
    const arc = Math.sin(ph * Math.PI);
    const lift = name === 'idle' ? arc * 0.14 : arc * 0.45;
    rig.position.y = lift;
    const sy = ph < 0.15 || ph > 0.85 ? 0.78 : 1 + arc * (name === 'idle' ? 0.08 : 0.24);
    const sxz = 1 / Math.sqrt(sy);
    rig.scale.set(sxz, sy, sxz);
    return;
  }

  // Quadruped trot for sheepMob & catMob
  if (mobRigType === 'quadruped' && (name === 'walk' || name === 'run' || name === 'idle' || name === 'sneak')) {
    if (name === 'idle') {
      if (head) {
        head.rotation.x = Math.sin(t * 1.8 + actor.phase) * 0.08;
        head.rotation.y = Math.sin(t * 1.1 + actor.phase) * 0.12;
      }
      return;
    }
    const freq = name === 'run' ? 12 : name === 'sneak' ? 4.5 : 8;
    const amp = name === 'run' ? 0.65 : 0.45;
    const s = Math.sin(t * freq);
    if (armL) armL.rotation.x = s * amp;
    if (legR) legR.rotation.x = s * amp;
    if (armR) armR.rotation.x = -s * amp;
    if (legL) legL.rotation.x = -s * amp;
    rig.position.y = Math.abs(Math.cos(t * freq)) * 0.06;
    if (head) head.rotation.x = Math.sin(t * freq * 2) * 0.06;
    return;
  }

  // Chicken wing-flap walk
  if (mobRigType === 'chicken') {
    const moving = name === 'walk' || name === 'run' || name === 'hop';
    const freq = moving ? 14 : 2.5;
    const s = Math.sin(t * freq);
    if (legL) legL.rotation.x = moving ? s * 0.7 : 0;
    if (legR) legR.rotation.x = moving ? -s * 0.7 : 0;
    if (armL) armL.rotation.z = moving ? 0.5 + Math.abs(s) * 0.8 : 0.08;
    if (armR) armR.rotation.z = moving ? -0.5 - Math.abs(s) * 0.8 : -0.08;
    if (head) head.position.z += moving ? Math.sin(t * freq * 2) * 0.04 : 0;
    return;
  }

  switch (name) {
    case 'walk':
    case 'run': {
      const isRun = name === 'run';
      const freq = (isRun ? 11.5 : 7.6) * (isKai ? 1.15 : 1);
      const amp = (isRun ? 0.88 : 0.58) * (isKai ? 1.35 : 1);
      const s = Math.sin(gt * freq);
      if (legL) legL.rotation.x = s * amp;
      if (legR) legR.rotation.x = -s * amp;
      if (armL) {
        armL.rotation.x = -s * amp * 0.92;
        armL.rotation.z = 0.08 + (isKai ? Math.abs(s) * 0.25 : 0);
      }
      if (armR) {
        armR.rotation.x = s * amp * 0.92;
        armR.rotation.z = -0.08 - (isKai ? Math.abs(s) * 0.25 : 0);
      }
      // Bald wither skeleton runs holding its head!
      if (actor.kind === 'witherSkeleton' && parts.helmet && !parts.helmet.visible) {
        if (armL) { armL.rotation.x = -2.85; armL.rotation.z = -0.25; }
        if (armR) { armR.rotation.x = -2.85; armR.rotation.z = 0.25; }
      }
      const bounce = Math.abs(Math.cos(gt * freq));
      rig.position.y = bounce * (isRun ? 0.14 : 0.08) * slap;
      const sy = 1 + (bounce - 0.5) * 0.05;
      rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (head) {
        head.rotation.z = Math.sin(gt * freq * 0.5) * 0.05 * slap;
        head.rotation.x = isRun ? 0.08 : 0;
      }
      if (isKai && isRun && body) body.rotation.x = -0.14; // goofy lean-back cartoon sprint
      break;
    }

    case 'strut': {
      // Exaggerated slapstick high-fashion runway catwalk strut!
      const freq = isKai ? 8.6 : 6.8;
      // Non-zero initial phase (0.95 rad) ensures frame-0 screenshots already show cocked hips & wide arm swing!
      const ph = t * freq + 0.95;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      const amp = isKai ? 1.0 : 0.68;

      // 1. Sassy lateral pelvis sway + bouncy catwalk pop + squash/stretch
      rig.position.x = s * 0.20 * amp;
      rig.position.y = Math.abs(c) * 0.14 * (isKai ? 1.15 : 0.8);
      const sy = 1 + (Math.abs(c) - 0.5) * 0.09;
      rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

      // 2. Exaggerated hip/ribcage tilt + counter-rotated swagger shoulders
      if (body) {
        body.position.x = (body.userData.restPos?.x || 0) + s * 0.08 * amp;
        body.rotation.z = -s * 0.31 * amp;
        body.rotation.y = s * 0.38 * amp;
        body.rotation.x = -0.10 * amp;
      }

      // 3. Cross-stepping catwalk legs
      if (legL) {
        legL.rotation.x = s * 0.88 * amp;
        legL.rotation.z = -s * 0.12 * amp - 0.06;
        legL.position.x = (legL.userData.restPos?.x || 0) + s * 0.05 * amp;
      }
      if (legR) {
        legR.rotation.x = -s * 0.88 * amp;
        legR.rotation.z = -s * 0.12 * amp + 0.06;
        legR.position.x = (legR.userData.restPos?.x || 0) + s * 0.05 * amp;
      }

      // 4. Huge flamboyant runway arm swings + flared elbows (clearly readable from front camera!)
      if (armL) {
        armL.rotation.x = -s * 1.32 * amp - 0.24;
        armL.rotation.z = 0.46 + Math.max(0, s) * 0.52 * amp;
        armL.rotation.y = s * 0.26;
      }
      if (armR) {
        armR.rotation.x = s * 1.32 * amp - 0.24;
        armR.rotation.z = -0.46 - Math.max(0, -s) * 0.52 * amp;
        armR.rotation.y = s * 0.26;
      }

      // 5. Smug chin-up head attitude while keeping mischievous grin facing the camera
      if (head) {
        head.rotation.y = -s * 0.15 * amp;
        head.rotation.z = s * 0.17 * amp;
        head.rotation.x = -0.08 + Math.sin(ph * 2) * 0.05;
      }
      break;
    }

    case 'wave':
      if (armR) {
        armR.rotation.x = -2.55;
        armR.rotation.z = -0.35 + Math.sin(t * 10.5) * 0.42 * slap;
      }
      if (armL) armL.rotation.z = 0.12 + Math.sin(t * 3) * 0.05;
      if (head) {
        head.rotation.z = 0.10 * slap;
        head.rotation.y = Math.sin(t * 3) * 0.12;
      }
      rig.position.y = Math.abs(Math.sin(t * 5.2)) * 0.05 * slap;
      break;

    case 'cheer':
    case 'happy': {
      const hop = Math.abs(Math.sin(t * 7.5));
      rig.position.y = hop * 0.30 * slap;
      const sy = 0.92 + hop * 0.16;
      rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (armL) { armL.rotation.x = -2.75; armL.rotation.z = 0.28 + Math.sin(t * 12) * 0.24 * slap; }
      if (armR) { armR.rotation.x = -2.75; armR.rotation.z = -0.28 - Math.sin(t * 12) * 0.24 * slap; }
      if (legL) legL.rotation.z = hop * 0.18 * slap;
      if (legR) legR.rotation.z = -hop * 0.18 * slap;
      if (head) head.rotation.z = Math.sin(t * 7.5) * 0.10;
      break;
    }

    case 'pose': {
      const sway = Math.sin(t * 2.8);
      if (armL) { armL.rotation.z = 0.65; armL.rotation.x = -0.35; }
      if (armR) { armR.rotation.x = -2.35; armR.rotation.z = -0.45 + sway * 0.12; }
      if (legL) legL.rotation.x = 0.15;
      if (legR) legR.rotation.x = -0.15;
      if (head) { head.rotation.y = sway * 0.22; head.rotation.z = 0.14 * slap; }
      rig.rotation.y = sway * 0.18 * slap;
      if (isKai) {
        // Exaggerated runway strut pose
        rig.position.y = Math.abs(Math.sin(t * 5.6)) * 0.12;
        if (head) head.rotation.x = -0.18;
      }
      break;
    }

    case 'shrug': {
      const up = 0.5 + 0.5 * Math.sin(t * 4.5);
      if (armL) { armL.rotation.z = 0.95 * slap; armL.rotation.x = -0.45; armL.position.y += 0.09 * up; }
      if (armR) { armR.rotation.z = -0.95 * slap; armR.rotation.x = -0.45; armR.position.y += 0.09 * up; }
      if (head) { head.rotation.z = Math.sin(t * 4.5) * 0.22 * slap; head.position.y -= 0.03 * up; }
      break;
    }

    case 'flex': {
      const pump = Math.sin(t * 8.5);
      if (armL) { armL.rotation.z = 1.35; armL.rotation.x = -0.85 + pump * 0.18 * slap; }
      if (armR) { armR.rotation.z = -1.35; armR.rotation.x = -0.85 + pump * 0.18 * slap; }
      const s = 1 + Math.max(0, pump) * 0.08 * slap;
      rig.scale.set(s, 2 - s, s);
      if (head) head.rotation.x = -0.08 + pump * 0.06;
      break;
    }

    case 'pushup': {
      const speed = isKai ? 8.5 : 5.2;
      const down = 0.5 + 0.5 * Math.sin(t * speed);
      rig.rotation.x = 1.38;
      rig.position.y = 0.20 + down * 0.30 * (isKai ? 1.25 : 1);
      rig.position.z = -0.35;
      if (armL) { armL.rotation.x = -1.42 + down * 0.52; armL.rotation.z = 0.25; }
      if (armR) { armR.rotation.x = -1.42 + down * 0.52; armR.rotation.z = -0.25; }
      if (head) head.rotation.x = -0.65;
      if (isKai && down > 0.88) rig.rotation.z = Math.sin(t * 24) * 0.09; // dramatic strain wobble!
      break;
    }

    case 'sad':
    case 'cry': {
      const isCry = name === 'cry';
      const sob = Math.abs(Math.sin(t * (isKai ? 14 : 9)));
      if (head) {
        head.rotation.x = 0.36 + sob * (isCry ? 0.14 * slap : 0.04);
        head.rotation.z = isCry ? Math.sin(t * 7) * 0.08 * slap : 0;
      }
      if (isCry) {
        if (armL) { armL.rotation.x = -2.05; armL.rotation.z = -0.25; armL.position.y += sob * 0.05 * slap; }
        if (armR) { armR.rotation.x = -2.05; armR.rotation.z = 0.25; armR.position.y += sob * 0.05 * slap; }
        rig.scale.set(1 + sob * 0.04, 1 - sob * 0.04, 1 + sob * 0.04);
      } else {
        if (armL) armL.rotation.z = 0.03;
        if (armR) armR.rotation.z = -0.03;
      }
      break;
    }

    case 'sneak': {
      const s = Math.sin(gt * 4.8);
      rig.position.y = -0.10;
      if (body) body.rotation.x = 0.28 * slap;
      if (head) head.rotation.x = -0.15;
      if (legL) legL.rotation.x = s * 0.42 * slap;
      if (legR) legR.rotation.x = -s * 0.42 * slap;
      if (armL) { armL.rotation.x = -0.65 - s * 0.30 * slap; armL.rotation.z = 0.22; }
      if (armR) { armR.rotation.x = -0.65 + s * 0.30 * slap; armR.rotation.z = -0.22; }
      break;
    }

    case 'throw': {
      const p = (t * 2.6) % 1;
      const swing = p < 0.35 ? -2.4 * (p / 0.35) : -2.4 + 3.2 * Math.min(1, (p - 0.35) / 0.35);
      if (armR) armR.rotation.x = swing;
      if (body) body.rotation.y = p < 0.35 ? -0.3 * slap : 0.35 * slap;
      break;
    }

    case 'dig': {
      const sw = Math.sin(t * 14);
      if (armR) armR.rotation.x = -1.25 + sw * 0.95;
      if (armL) armL.rotation.x = -0.65 - sw * 0.35;
      if (body) body.rotation.x = 0.18 + Math.max(0, sw) * 0.10;
      break;
    }

    case 'hop': {
      const phase = (t * (isKai ? 3.2 : 2.5)) % 1;
      const arc = Math.sin(phase * Math.PI);
      rig.position.y = arc * 0.54 * (isKai ? 1.25 : 1);
      const sy = phase < 0.12 || phase > 0.88 ? 0.80 : 1 + arc * 0.22;
      const sxz = 1 / Math.sqrt(sy);
      rig.scale.set(sxz, sy, sxz);
      if (armL) armL.rotation.z = 0.25 + arc * 0.65 * slap;
      if (armR) armR.rotation.z = -0.25 - arc * 0.65 * slap;
      break;
    }

    case 'teleport':
    case 'spawn':
      applySpecialTransition(actor, name, t);
      break;

    case 'eat': {
      const chomp = Math.abs(Math.sin(t * 15));
      if (armL) { armL.rotation.x = -1.65 + chomp * 0.22; armL.rotation.z = -0.28; }
      if (armR) { armR.rotation.x = -1.65 + chomp * 0.22; armR.rotation.z = 0.28; }
      if (head) head.rotation.x = 0.14 + chomp * 0.24 * slap;
      rig.scale.set(1 + chomp * 0.04, 1 - chomp * 0.03, 1 + chomp * 0.04);
      break;
    }

    case 'sneeze': {
      if (t < 0.32) {
        const u = t / 0.32;
        if (head) head.rotation.x = -0.42 * u;
        if (armL) armL.rotation.z = 0.45 * u;
        if (armR) armR.rotation.z = -0.45 * u;
        rig.scale.set(1 - u * 0.06, 1 + u * 0.11, 1 - u * 0.06);
      } else if (t < 0.56) {
        const u = (t - 0.32) / 0.24;
        const burst = Math.sin(u * Math.PI);
        if (head) head.rotation.x = 0.44 * burst - 0.08 * u;
        if (armL) { armL.rotation.z = 0.72 * burst + 0.35 * u; armL.rotation.x = -0.50 * burst; }
        if (armR) { armR.rotation.z = -0.72 * burst - 0.35 * u; armR.rotation.x = -0.50 * burst; }
        rig.scale.set(1 + burst * 0.10, 1 - burst * 0.08, 1 + burst * 0.10);
      } else {
        // Chin-up, open-faced joyful look so 三三's face & 3 heads read clearly on Gag-Cam (#183 R2)
        const bob = Math.abs(Math.sin((t - 0.56) * 6.5));
        rig.position.y = (actor.baseLift || 0) + bob * 0.09;
        if (head) {
          head.rotation.x = -0.10;
          head.rotation.z = Math.sin(t * 5.0) * 0.06;
        }
        if (armL) { armL.rotation.z = 0.52; armL.rotation.x = -0.52; }
        if (armR) { armR.rotation.z = -0.52; armR.rotation.x = -0.52; }
      }
      break;
    }

    case 'faint': {
      if (!isKai) {
        const p = Math.min(1, t / 0.45);
        const bt = Math.max(0, t - 0.45);
        const bounce = p >= 1 ? Math.exp(-bt * 6) * Math.abs(Math.sin(bt * 18)) * 0.16 : 0;
        rig.rotation.x = -p * Math.PI * 0.48 + bounce;
        rig.position.y = p * 0.24 + bounce * 0.35;
        if (armL) armL.rotation.z = 1.20 * p;
        if (armR) armR.rotation.z = -1.20 * p;
        break;
      }
      // #183 R1: 小凯 tips over backwards flat (0.35 s), legs twitch for whole gag cam, then springs up dizzy-walking!
      const gx = actor.group?.position?.x ?? 0;
      const forwardSlide = gx > 84.1 ? 1.55 : 0.72;
      const springAt = actor._faintSpringAt ?? 0.96;
      if (t < springAt) {
        const p = Math.min(1, t / 0.35);
        const ease = p * p * (2.2 - 1.2 * p);
        const bt = Math.max(0, t - 0.35);
        const bounce = p >= 1 ? Math.exp(-bt * 9.0) * Math.abs(Math.sin(bt * 24.0)) * 0.14 : 0;
        rig.rotation.x = -ease * (Math.PI * 0.485) + bounce;
        rig.rotation.y = ease * 0.54;
        rig.position.y = ease * 0.25 + bounce * 0.35;
        rig.position.z = ease * forwardSlide;
        const armTw = p >= 1 ? Math.sin(t * 27.0) * 0.16 : 0;
        if (armL) { armL.rotation.z = 1.16 * ease + armTw; armL.rotation.x = -0.45 * ease - armTw * 0.8; }
        if (armR) { armR.rotation.z = -1.16 * ease + armTw; armR.rotation.x = -0.45 * ease + armTw * 0.8; }
        if (p < 1) {
          const kick = Math.sin(p * Math.PI) * 0.72;
          if (legL) legL.rotation.x = -kick;
          if (legR) legR.rotation.x = -kick * 0.65;
        } else {
          // Rapid alternating leg twitches UP into the air (-X lifts feet above floor when rig.rotation.x ≈ -π/2)
          const tw = Math.sin((t - 0.35) * 32.0 + 0.75);
          if (legL) {
            legL.rotation.x = -0.48 - tw * 0.44;
            legL.rotation.z = 0.11;
          }
          if (legR) {
            legR.rotation.x = -0.48 + tw * 0.44;
            legR.rotation.z = -0.11;
          }
          if (head) head.rotation.z = Math.sin(t * 23.0) * 0.09;
        }
      } else if (t < springAt + 0.25) {
        // Elastic cartoon boing spring-up!
        const u = (t - springAt) / 0.25;
        const popEase = 1 - (1 - u) * (1 - u);
        const arc = Math.sin(u * Math.PI);
        rig.rotation.x = -(1 - popEase) * (Math.PI * 0.485);
        rig.rotation.y = (1 - popEase) * 0.54;
        rig.position.y = (1 - u) * 0.25 + arc * 0.52;
        rig.position.z = forwardSlide * (1 - popEase * 0.55);
        const sy = 1 + arc * 0.20;
        rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
        if (armL) { armL.rotation.z = 1.16 - u * 0.24; armL.rotation.x = -0.95 * arc; }
        if (armR) { armR.rotation.z = -1.16 + u * 0.24; armR.rotation.x = -0.95 * arc; }
        if (legL) legL.rotation.x = -0.36 * arc;
        if (legR) legR.rotation.x = 0.28 * arc;
      } else {
        applyDizzyWalkPose(actor, t - springAt - 0.25, forwardSlide * 0.45);
      }
      break;
    }

    case 'dizzy': {
      applyDizzyWalkPose(actor, t, 0);
      break;
    }

    case 'stuck': {
      // Wiggle-stuck in honey / snow!
      const w = Math.sin(t * 18);
      const w2 = Math.cos(t * 14);
      rig.rotation.z = w * 0.24 * slap;
      rig.rotation.y = w2 * 0.16 * slap;
      rig.position.y = -0.06 + Math.abs(w) * 0.05;
      const sy = 0.94 + Math.abs(w) * 0.12;
      rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (armL) { armL.rotation.x = -2.35 + w * 0.72 * slap; armL.rotation.z = 0.65; }
      if (armR) { armR.rotation.x = -2.35 - w * 0.72 * slap; armR.rotation.z = -0.65; }
      if (head) head.rotation.z = -w * 0.18 * slap;
      break;
    }

    case 'dance': {
      const beat = Math.sin(t * 8.4);
      const half = Math.sin(t * 4.2);
      rig.position.y = Math.abs(beat) * 0.22 * slap;
      rig.rotation.z = half * 0.16 * slap;
      rig.rotation.y = half * 0.28 * slap;
      if (armL) { armL.rotation.z = 0.95 + beat * 0.55 * slap; armL.rotation.x = -1.45; }
      if (armR) { armR.rotation.z = -0.95 + beat * 0.55 * slap; armR.rotation.x = -1.45; }
      if (legL) legL.rotation.z = Math.max(0, half) * 0.42 * slap;
      if (legR) legR.rotation.z = Math.min(0, half) * 0.42 * slap;
      if (head) head.rotation.z = -half * 0.18;
      break;
    }

    case 'idle':
    default: {
      const b = Math.sin(t * 2.3 + actor.phase);
      if (armL) armL.rotation.z = 0.07 + b * 0.04;
      if (armR) armR.rotation.z = -0.07 - b * 0.04;
      if (head) {
        head.rotation.y = Math.sin(t * 1.25 + actor.phase) * 0.09;
        head.rotation.z = Math.cos(t * 1.6 + actor.phase) * 0.03;
      }
      rig.position.y = (actor.baseLift || 0) + Math.max(0, b) * 0.02;
      break;
    }
  }
}

function applySpecialTransition(actor, name, t) {
  const { rig, parts } = actor;
  if (name === 'teleport') {
    // Shrink to thin purple streak + purple poof ring, then pop back in!
    const p = Math.min(1, t / 0.50);
    const s = p < 0.5 ? 1 - p * 1.90 : (p - 0.5) * 1.90 + 0.05;
    const clampedXZ = Math.max(0.05, s);
    const stretchY = Math.min(1.75, 1.45 - clampedXZ * 0.45);
    rig.scale.set(clampedXZ, stretchY, clampedXZ);
    rig.rotation.y = p * Math.PI * 2;
    if (parts.poofRing) {
      parts.poofRing.visible = p < 0.95;
      const rs = 0.4 + Math.sin(p * Math.PI) * 1.35;
      parts.poofRing.scale.set(rs, rs * 0.5 + 0.2, rs);
      parts.poofRing.position.y = 0.6 + p * 0.8;
      parts.poofRing.rotation.y = p * 5;
    }
  } else if (name === 'spawn') {
    // Rise from ground + elastic scale-in!
    const p = Math.min(1, t / 0.72);
    const ease = 1 - Math.pow(1 - p, 3);
    const overshoot = p > 0.75 ? Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.09 : 0;
    rig.position.y = (actor.baseLift || 0) + (1 - ease) * -1.25;
    const sc = Math.max(0.05, ease + overshoot);
    rig.scale.set(sc, sc, sc);
    rig.rotation.y = (1 - ease) * Math.PI * 1.5;
    if (parts.armL) parts.armL.rotation.z = 0.8 * (1 - ease) + 0.1;
    if (parts.armR) parts.armR.rotation.z = -0.8 * (1 - ease) - 0.1;
  }
}

function applyDizzyWalkPose(actor, dtTime, baseZ = 0) {
  const { rig, parts } = actor;
  const { head, armL, armR, legL, legR } = parts;
  const sw = dtTime * 6.4;
  rig.position.x = Math.sin(sw) * 0.34;
  rig.position.z = baseZ + Math.sin(sw * 0.5) * 0.18;
  rig.position.y = (actor.baseLift || 0) + Math.abs(Math.sin(sw * 2.0)) * 0.11;
  rig.rotation.z = Math.sin(sw) * 0.26;
  rig.rotation.x = Math.cos(sw * 1.3) * 0.12;
  rig.rotation.y = Math.sin(sw * 0.7) * 0.32;
  if (head) {
    head.rotation.z = Math.cos(sw * 1.4) * 0.28;
    head.rotation.x = Math.sin(sw * 1.4) * 0.22;
    head.rotation.y = Math.sin(sw) * 0.24;
  }
  if (armL) {
    armL.rotation.z = 0.92 + Math.sin(sw * 2.1) * 0.42;
    armL.rotation.x = -0.55 + Math.cos(sw * 2.1) * 0.55;
  }
  if (armR) {
    armR.rotation.z = -0.92 + Math.cos(sw * 2.1) * 0.42;
    armR.rotation.x = -0.55 - Math.sin(sw * 2.1) * 0.55;
  }
  if (legL) {
    legL.rotation.x = Math.sin(sw * 2.0) * 0.68;
    legL.rotation.z = 0.08 + Math.max(0, Math.sin(sw)) * 0.16;
  }
  if (legR) {
    legR.rotation.x = -Math.sin(sw * 2.0) * 0.68;
    legR.rotation.z = -0.08 + Math.min(0, Math.sin(sw)) * 0.16;
  }
}
