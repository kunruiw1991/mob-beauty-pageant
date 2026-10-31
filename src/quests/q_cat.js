// Quest 3: cat — 喵喵 (Jungle Red-Light/Green-Light Sneak + Fish + 小凯's Stolen Hat, docs/DESIGN.md §6.3 & #143).
// #143 mechanics: start >= 12 blocks away; within 10 blocks of 喵喵 the player auto-SNEAKS (MC crouch, 1.6 b/s, crouch anim);
// red-light peeks every 3-5 s actually catch movers; 3-fish shy cat taming across jungle log perches + mercy after 3 leaps.

import * as THREE from '../../vendor/three.module.min.js';
import {
  surfaceY,
  playerPos,
  isPlayerMoving,
  setPlayerSneak,
  distXZ,
  rngRange,
  createTimers,
  emitGag,
  playSfx,
  registerPick,
  acquireActor,
  sharedBoxGeo,
  sharedCylinderGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
} from './kit.js';

const SNEAK_RADIUS = 10.0;
const SNEAK_SPEED = 1.6;
const NEED_FISH = 4;

let catActor = null;
let catUnpick = null;
let ambientCat = null;
let ringMesh = null;
let fishGroup = null;
let hatGiftGroup = null;
let timers = null;

// 4 lush green-grass jungle perches across the SW clearing (~14-20b apart; perch 0 is 13.9b from start >= 12b!)
const LOG_SPOTS = [
  { x: 24.5, y: 8.0, z: 74.5 },
  { x: 42.5, y: 8.0, z: 66.5 },
  { x: 24.5, y: 8.0, z: 72.5 },
  { x: 40.5, y: 8.0, z: 76.5 },
];

let logIndex = 0;
let catPos = { x: 24.5, y: 8.0, z: 74.5 };
let lookState = 'away'; // 'away' | 'tell' | 'peek'
let stateTimer = 3.4;
let peekGrace = 0;
let roundLeaps = 0;
let totalLeaps = 0;
let mercyWalking = false;
let fishInHand = false;
let fishFed = 0;
let finishing = false;
let leapArc = null;
let prevPlayerPos = null;

function buildFishProp() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(sharedBoxGeo(0.34, 0.18, 0.1), sharedLambertMat(0xff7b54));
  const stripe = new THREE.Mesh(sharedBoxGeo(0.1, 0.19, 0.11), sharedLambertMat(0xfff3e0));
  const tail = new THREE.Mesh(sharedBoxGeo(0.14, 0.22, 0.08), sharedLambertMat(0xff9f68));
  tail.position.x = -0.22;
  g.add(body, stripe, tail);
  g.visible = false;
  return g;
}

function buildStolenKaiHatProp() {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(sharedBoxGeo(0.46, 0.24, 0.46), sharedLambertMat(0x22b8cf));
  crown.position.y = 0.14;
  const brim = new THREE.Mesh(sharedBoxGeo(0.48, 0.08, 0.62), sharedLambertMat(0x1971c2));
  brim.position.set(0, 0.04, 0.1);
  const badge = new THREE.Mesh(sharedBoxGeo(0.16, 0.12, 0.06), sharedBasicMat(0xffd43b));
  badge.position.set(0, 0.16, 0.24);
  g.add(crown, brim, badge);
  g.visible = false;
  return g;
}

function setLookPhase(ctx, nextPhase) {
  lookState = nextPhase;
  if (nextPhase === 'away') {
    // Peeks occur every ~2.6 - 3.1 s (cycle ~4.1 - 4.6 s, right inside #143 3-5 s!)
    stateTimer = rngRange(ctx, 2.0, 2.48);
    catActor?.setEmote?.(null);
    catActor?.setAnim?.('idle');
    const pp = playerPos(ctx);
    const awayTarget = { x: catPos.x + (catPos.x - pp.x), y: catPos.y, z: catPos.z + (catPos.z - pp.z) };
    catActor?.lookAt?.(awayTarget);
    if (ringMesh) {
      ringMesh.visible = true;
      ringMesh.material = sharedBasicMat(0x51cf66, { opacity: 0.48, transparent: true });
    }
  } else if (nextPhase === 'tell') {
    stateTimer = 0.6;
    catActor?.setEmote?.('?');
    playSfx(ctx, 'meow', { pos: catPos, pitch: 1.2 });
    if (ringMesh) {
      ringMesh.visible = true;
      ringMesh.material = sharedBasicMat(0xfcc419, { opacity: 0.6, transparent: true });
    }
  } else if (nextPhase === 'peek') {
    stateTimer = 1.5;
    peekGrace = 0.08;
    catActor?.setEmote?.('👀');
    catActor?.lookAt?.(playerPos(ctx));
    if (ringMesh) {
      ringMesh.visible = true;
      ringMesh.material = sharedBasicMat(0xff6b6b, { opacity: 0.65, transparent: true });
    }
  }
}

function hopCatToSpot(ctx, nextIdx, duration = 0.52) {
  const prevSpot = { ...catPos };
  logIndex = nextIdx % LOG_SPOTS.length;
  const dest = { ...LOG_SPOTS[logIndex] };
  if (ringMesh) ringMesh.visible = false;
  leapArc = {
    from: prevSpot,
    to: dest,
    elapsed: 0,
    duration,
  };
  catActor?.setAnim?.('hop');
}

function triggerSpookOrMercy(ctx) {
  roundLeaps += 1;
  totalLeaps += 1;
  ctx?.player?.stop?.();
  playSfx(ctx, 'meow', { pos: catPos, pitch: 1.4 });
  playSfx(ctx, 'boing', { pos: catPos, pitch: 1.15 });
  ctx?.fx?.burst?.(catPos, 0xfff3e0, 8);

  // §6.3 Mercy rule: after 3 leaps she walks right up to you curious!
  if (roundLeaps >= 3 || totalLeaps >= 4) {
    mercyWalking = true;
    lookState = 'away';
    catActor?.setEmote?.('❤');
    catActor?.setAnim?.('walk');
    if (ringMesh) ringMesh.visible = false;
    return;
  }

  hopCatToSpot(ctx, (logIndex + 1) % LOG_SPOTS.length, 0.48);
}

function unlockFishInHand(ctx) {
  if (fishInHand || finishing) return;
  fishInHand = true;
  mercyWalking = false;
  setPlayerSneak(ctx, false);
  if (ringMesh) ringMesh.visible = false;
  if (fishGroup) fishGroup.visible = true;
  catActor?.lookAt?.(playerPos(ctx));
  catActor?.setAnim?.('happy');
  catActor?.setEmote?.('🐟');
  playSfx(ctx, 'meow', { pos: catPos, pitch: 1.1 + fishFed * 0.08 });
  ctx?.fx?.sparkles?.(catPos, 8, { toPlayer: false });
}

function feedOneFish(ctx) {
  if (finishing) return;
  fishInHand = false;
  if (fishGroup) fishGroup.visible = false;
  fishFed += 1;

  const pp = playerPos(ctx);
  catActor?.lookAt?.(pp);
  catActor?.setAnim?.('eat');
  playSfx(ctx, 'munch', { pos: catPos });
  playSfx(ctx, 'xp', { pos: catPos, pitch: 1.0 + fishFed * 0.14 });
  ctx?.events?.emit?.('questStep', { id: 'cat', step: fishFed });

  if (fishFed < NEED_FISH) {
    // Playful shy cat purrs with hearts, then hops across the clearing to the next log perch!
    catActor?.setEmote?.('🐟');
    ctx?.fx?.hearts?.({ x: catPos.x, y: catPos.y + 0.9, z: catPos.z }, 7);
    roundLeaps = 0;
    mercyWalking = false;
    hopCatToSpot(ctx, (logIndex + 1) % LOG_SPOTS.length, 0.68);
    return;
  }

  // 3rd fish -> fully tamed! Purr + gift (小凯's stolen hat, §6.3)!
  finishing = true;
  setPlayerSneak(ctx, false);
  catActor?.setEmote?.('❤');
  playSfx(ctx, 'meow', { pos: catPos, pitch: 1.25 });
  ctx?.fx?.hearts?.({ x: catPos.x, y: catPos.y + 1.0, z: catPos.z }, 16);

  timers.after(0.5, () => {
    if (hatGiftGroup) {
      const gx = (catPos.x + pp.x) * 0.5;
      const gz = (catPos.z + pp.z) * 0.5;
      const gy = surfaceY(ctx, gx, gz, 8);
      hatGiftGroup.position.set(gx, gy + 0.35, gz);
      hatGiftGroup.visible = true;
      ctx?.fx?.sparkles?.({ x: gx, y: gy + 0.5, z: gz }, 12, { toPlayer: true });
    }
    const kaiCameoPos = { x: 34.5, y: 8, z: 72.5 };
    ctx?.rival?.loseHatCameo?.(kaiCameoPos, 'cat');
    catActor?.setAnim?.('cheer');
    emitGag(ctx, 'cat', 'cat_gift_kai_hat', catPos);
  });

  timers.after(1.85, () => {
    ctx?.quests?.complete?.('cat');
  });
}

function applySneakClampFallback(ctx, dt, prevPos) {
  if (typeof ctx?.player?.setSneak === 'function' || !prevPos || dt <= 0) return;
  const pp = playerPos(ctx);
  const dx = pp.x - prevPos.x;
  const dz = pp.z - prevPos.z;
  const moved = Math.hypot(dx, dz);
  const maxStep = SNEAK_SPEED * dt;
  if (moved > maxStep + 1e-4) {
    const ratio = maxStep / moved;
    const nx = prevPos.x + dx * ratio;
    const nz = prevPos.z + dz * ratio;
    if (ctx?.player?.pos) {
      ctx.player.pos.x = nx;
      ctx.player.pos.z = nz;
    }
    if (ctx?.player?.actor?.group) {
      ctx.player.actor.group.position.x = nx;
      ctx.player.actor.group.position.z = nz;
    }
    if (ctx?.state?.player) {
      ctx.state.player.x = nx;
      ctx.state.player.z = nz;
    }
  }
  if (isPlayerMoving(ctx) || moved > 0.002) {
    ctx?.player?.actor?.setAnim?.('crouch');
  }
}

const qCat = {
  id: 'cat',
  contestantId: 'cat',
  area: 'hub',
  poi: 'jungle',
  order: 3,

  start(ctx) {
    qCat.cleanup(ctx);
    timers = createTimers();
    roundLeaps = 0;
    totalLeaps = 0;
    mercyWalking = false;
    fishInHand = false;
    fishFed = 0;
    finishing = false;
    leapArc = null;

    const pp = playerPos(ctx);
    prevPlayerPos = { ...pp };

    // Choose perch >= 12b away from player start (#143)
    logIndex = 0;
    let bestD = -1;
    for (let i = 0; i < LOG_SPOTS.length; i++) {
      const d = distXZ(pp, LOG_SPOTS[i]);
      if (d >= 12.0) {
        logIndex = i;
        break;
      }
      if (d > bestD) {
        bestD = d;
        logIndex = i;
      }
    }
    catPos = { ...LOG_SPOTS[logIndex] };

    ringMesh = new THREE.Mesh(
      sharedCylinderGeo(2.2, 2.2, 0.06, 20),
      sharedBasicMat(0x51cf66, { opacity: 0.48, transparent: true })
    );
    ringMesh.position.set(catPos.x, 8.05, catPos.z);
    attachToScene(ctx, ringMesh);

    if (ctx?.chars?.create) {
      catActor = acquireActor(ctx, 'q_cat:main', 'cat', { id: 'cat_contestant', pos: catPos, anim: 'idle' });
      catUnpick = registerPick(ctx, catActor.group, {
        id: 'cat_target',
        targetId: 'cat_target',
        entityId: 'cat',
        kind: 'entity',
        label: '喵喵',
        hitRadius: 1.2,
      });

      const ambPos = { x: 30.5, y: 8, z: 70.5 };
      ambientCat = acquireActor(ctx, 'q_cat:ambient', 'catMob', { pos: ambPos, anim: 'idle' });
    }

    fishGroup = buildFishProp();
    attachToScene(ctx, fishGroup);

    hatGiftGroup = buildStolenKaiHatProp();
    attachToScene(ctx, hatGiftGroup);

    // Open with a brief alert peek so player immediately sees 喵喵's red-light mechanic!
    setLookPhase(ctx, 'peek');
    stateTimer = 1.05;
  },

  update(dt, ctx) {
    if (!timers) return;
    timers.update(dt);

    const preClampPrev = prevPlayerPos ? { ...prevPlayerPos } : null;
    const rawPp = playerPos(ctx);
    const sneakRef = leapArc ? leapArc.to : catPos;
    const dRaw = distXZ(rawPp, sneakRef);

    // #143: Within 10 blocks of 喵喵 the player auto-SNEAKS (MC crouch, 1.6 b/s, crouch anim)
    const shouldSneak = !fishInHand && !finishing && !mercyWalking && dRaw <= SNEAK_RADIUS;
    setPlayerSneak(ctx, shouldSneak);
    if (shouldSneak) {
      applySneakClampFallback(ctx, dt, preClampPrev);
    }

    const pp = playerPos(ctx);
    const frameMoved = preClampPrev ? distXZ(pp, preClampPrev) : 0;
    const playerSpeed = dt > 0 ? frameMoved / dt : 0;
    prevPlayerPos = { ...pp };

    if (leapArc) {
      leapArc.elapsed += dt;
      const u = Math.min(1, leapArc.elapsed / leapArc.duration);
      catPos.x = leapArc.from.x + (leapArc.to.x - leapArc.from.x) * u;
      catPos.z = leapArc.from.z + (leapArc.to.z - leapArc.from.z) * u;
      catPos.y = leapArc.from.y + (leapArc.to.y - leapArc.from.y) * u + Math.sin(u * Math.PI) * 1.9;
      if (catActor?.group) catActor.group.position.set(catPos.x, catPos.y, catPos.z);
      if (u >= 1) {
        catPos = { ...leapArc.to };
        leapArc = null;
        if (ringMesh) {
          ringMesh.position.set(catPos.x, 8.05, catPos.z);
        }
        setLookPhase(ctx, 'away');
      }
      catActor?.update?.(dt);
      ambientCat?.update?.(dt);
      return;
    }

    if (mercyWalking && !fishInHand && !finishing) {
      const d = distXZ(catPos, pp);
      if (d <= 2.05) {
        unlockFishInHand(ctx);
      } else {
        const step = Math.min(d - 1.85, 3.8 * dt);
        const dx = (pp.x - catPos.x) / d;
        const dz = (pp.z - catPos.z) / d;
        catPos.x += dx * step;
        catPos.z += dz * step;
        catPos.y = 8;
        if (catActor?.group) catActor.group.position.set(catPos.x, catPos.y, catPos.z);
        catActor?.lookAt?.(pp);
      }
      catActor?.update?.(dt);
      ambientCat?.update?.(dt);
      return;
    }

    if (!fishInHand && !finishing) {
      stateTimer -= dt;
      const dToCat = distXZ(pp, catPos);

      if (lookState === 'peek') {
        catActor?.lookAt?.(pp);
        if (peekGrace > 0) {
          peekGrace = Math.max(0, peekGrace - dt);
        } else if (dToCat <= 10.2 && (isPlayerMoving(ctx) || playerSpeed > 0.35)) {
          // Red-light peeks actually catch movers (#143)!
          triggerSpookOrMercy(ctx);
          catActor?.update?.(dt);
          ambientCat?.update?.(dt);
          return;
        }
      } else if (dToCat <= 2.15) {
        // Unseen within ~2 blocks -> fish appears in hand!
        unlockFishInHand(ctx);
      }

      if (!fishInHand && stateTimer <= 0) {
        if (lookState === 'away') setLookPhase(ctx, 'tell');
        else if (lookState === 'tell') setLookPhase(ctx, 'peek');
        else setLookPhase(ctx, 'away');
      }
    }

    if (fishGroup && fishGroup.visible) {
      fishGroup.position.set(pp.x + 0.38, pp.y + 0.95 + Math.sin((ctx?.time ?? 0) * 5) * 0.06, pp.z - 0.35);
      fishGroup.rotation.y = (ctx?.time ?? 0) * 2.2;
    }
    if (hatGiftGroup && hatGiftGroup.visible) {
      hatGiftGroup.rotation.y += dt * 2.5;
    }

    catActor?.update?.(dt);
    ambientCat?.update?.(dt);
  },

  onTap(hit, ctx) {
    if (finishing) return true;

    if (hit?.targetId === 'cat_hold_still' || hit?.targetId === 'cat_hop_wait') {
      ctx?.player?.stop?.();
      return true;
    }

    if (fishInHand) {
      if (
        hit?.targetId === 'cat_offer_fish' ||
        hit?.targetId === 'cat_target' ||
        hit?.entityId === 'cat' ||
        (hit?.pos && distXZ(hit.pos, catPos) <= 2.5)
      ) {
        feedOneFish(ctx);
        return true;
      }
      return false;
    }

    if (
      (hit?.targetId === 'cat_sneak' || hit?.targetId === 'cat_target' || hit?.entityId === 'cat') &&
      distXZ(playerPos(ctx), catPos) <= 2.25 &&
      lookState !== 'peek' &&
      !leapArc
    ) {
      unlockFishInHand(ctx);
      feedOneFish(ctx);
      return true;
    }

    return false;
  },

  onAction(ctx) {},

  introPos(ctx) {
    return { x: catPos.x, y: catPos.y + 0.9, z: catPos.z };
  },

  targets(ctx) {
    if (finishing) {
      return [
        {
          id: 'cat_finishing_wait',
          pos: { x: catPos.x, y: catPos.y + 0.8, z: catPos.z },
          kind: 'wait',
          label: '喵喵',
          range: 2.5,
        },
      ];
    }

    if (leapArc) {
      const pp = playerPos(ctx);
      return [
        {
          id: 'cat_hop_wait',
          pos: { x: pp.x, y: pp.y + 0.5, z: pp.z },
          kind: 'wait',
          label: '喵喵跳走啦',
          range: 2.5,
        },
      ];
    }

    if (fishInHand) {
      return [
        {
          id: 'cat_offer_fish',
          pos: { x: catPos.x, y: catPos.y + 0.7, z: catPos.z },
          kind: 'entity',
          label: '喂小鱼给喵喵',
          range: 2.4,
        },
      ];
    }

    // Freeze right before/during peek so ideal player stops in crouch while random movers get caught!
    if ((lookState === 'peek' || (lookState === 'tell' && stateTimer <= 0.24)) && !mercyWalking) {
      const pp = playerPos(ctx);
      return [
        {
          id: 'cat_hold_still',
          pos: { x: pp.x, y: pp.y + 0.5, z: pp.z },
          kind: 'hold',
          label: '别动！等转头',
          range: 2.5,
        },
      ];
    }

    return [
      {
        id: 'cat_sneak',
        pos: { x: catPos.x, y: catPos.y + 0.6, z: catPos.z },
        kind: 'entity',
        label: '悄悄靠近喵喵',
        range: 2.1,
      },
    ];
  },

  pointer(ctx) {
    return { x: catPos.x, y: catPos.y + 1.2, z: catPos.z };
  },

  objective(ctx) {
    return { icon: '🐟', have: Math.min(NEED_FISH, fishFed), need: NEED_FISH };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    setPlayerSneak(ctx, false);
    timers?.clear?.();
    timers = null;
    catUnpick?.();
    catUnpick = null;
    if (catActor?.group) detachFromScene(catActor.group);
    catActor = null;
    if (ambientCat?.group) detachFromScene(ambientCat.group);
    ambientCat = null;
    if (ringMesh) detachFromScene(ringMesh);
    ringMesh = null;
    if (fishGroup) detachFromScene(fishGroup);
    fishGroup = null;
    if (hatGiftGroup) detachFromScene(hatGiftGroup);
    hatGiftGroup = null;
    ctx?.rival?.leave?.();
    finishing = false;
  },
};

export default qCat;
