// Quest 2: slime — 啵啵 (Swamp: 3 big slimes -> 6 small slimes, 小凯 bounced into pond, pet slime hat, §6.2 & #143).
// #143 mechanics: slimes hop around (MC hop every 0.8-1.4 s), get knocked back 2-3 blocks per bop,
// and small slimes flee away from the player so you chase them across the swamp!

import * as THREE from '../../vendor/three.module.min.js';
import {
  poi,
  surfaceY,
  playerPos,
  distXZ,
  dist3,
  rng,
  rngRange,
  createTimers,
  emitGag,
  playSfx,
  registerPick,
  acquireActor,
  sharedBoxGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
} from './kit.js';

const TOTAL_TAPS_NEEDED = 12; // 3 big (2 taps each = 6) + 6 small (1 tap each = 6)
const SWAMP_MIN_X = 57.5;
const SWAMP_MAX_X = 76.5;
const SWAMP_MIN_Z = 58.5;
const SWAMP_MAX_Z = 76.5;

let boboActor = null;
let slimes = [];
let flyingBlob = null;
let timers = null;

let tapsDone = 0;
let bigSplits = 0;
let smallCleared = 0;
let finishing = false;
let boboPos = { x: 67.5, y: 8, z: 68.5 };
let kaiBankPos = { x: 75.5, y: 8, z: 68.5 };
let kaiWaterPos = { x: 73.5, y: 7.4, z: 66.2 };
let nextSlimeId = 1;

function clampSwamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isFlatSwampWalkable(ctx, x, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  if (bx < 57 || bx > 76 || bz < 58 || bz > 76) return false;
  if (typeof ctx?.world?.isWalkable === 'function') {
    return Boolean(ctx.world.isWalkable(bx, 8, bz));
  }
  return surfaceY(ctx, bx, bz, 8) === 8;
}

function safeSwampSpot(ctx, x, z, fallbackY = 8) {
  const cx = clampSwamp(x, SWAMP_MIN_X, SWAMP_MAX_X);
  const cz = clampSwamp(z, SWAMP_MIN_Z, SWAMP_MAX_Z);
  if (isFlatSwampWalkable(ctx, cx, cz)) {
    return { x: Math.floor(cx) + 0.5, y: 8, z: Math.floor(cz) + 0.5 };
  }
  if (typeof ctx?.world?.nearestWalkable === 'function') {
    const nw = ctx.world.nearestWalkable({ x: Math.floor(cx), y: 8, z: Math.floor(cz) }, 5);
    if (nw && (nw.y ?? 8) === 8) {
      return {
        x: clampSwamp(nw.x + 0.5, SWAMP_MIN_X, SWAMP_MAX_X),
        y: 8,
        z: clampSwamp(nw.z + 0.5, SWAMP_MIN_Z, SWAMP_MAX_Z),
      };
    }
  }
  return { x: 68.5, y: fallbackY, z: 68.5 };
}

// Find a walkable swamp landing spot in preferred direction (dirX, dirZ) at distance `dist`
function stepWalkableSwamp(ctx, fromPos, dirX, dirZ, dist) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const baseAngle = Math.atan2(dirZ / len, dirX / len);
  const offsets = [0, 0.42, -0.42, 0.85, -0.85, 1.35, -1.35, 2.0, -2.0, Math.PI];

  for (const dTry of [dist, dist * 0.72]) {
    for (const ao of offsets) {
      const a = baseAngle + ao;
      const nx = clampSwamp(fromPos.x + Math.cos(a) * dTry, SWAMP_MIN_X, SWAMP_MAX_X);
      const nz = clampSwamp(fromPos.z + Math.sin(a) * dTry, SWAMP_MIN_Z, SWAMP_MAX_Z);
      const mx = (fromPos.x + nx) * 0.5;
      const mz = (fromPos.z + nz) * 0.5;
      if (isFlatSwampWalkable(ctx, nx, nz) && isFlatSwampWalkable(ctx, mx, mz)) {
        return { x: Math.floor(nx) + 0.5, y: 8, z: Math.floor(nz) + 0.5 };
      }
    }
  }
  return safeSwampSpot(ctx, fromPos.x + (dirX / len) * 1.5, fromPos.z + (dirZ / len) * 1.5, 8);
}

function buildFallbackSlimeMesh(size) {
  const s = size === 2 ? 1.15 : 0.62;
  const g = new THREE.Group();
  const outer = new THREE.Mesh(
    sharedBoxGeo(s, s, s),
    sharedBasicMat(0x6ce048, { opacity: 0.72, transparent: true })
  );
  outer.position.y = s * 0.5;
  const core = new THREE.Mesh(sharedBoxGeo(s * 0.62, s * 0.62, s * 0.62), sharedLambertMat(0x2ea82c));
  core.position.y = s * 0.48;
  g.add(core, outer);
  return g;
}

function spawnSlimeUnit(ctx, { size = 2, homePos, launchFrom = null, launchDur = 0 }) {
  const id = `slime_${size === 2 ? 'big' : 'small'}_${nextSlimeId++}`;
  const landPos = safeSwampSpot(ctx, homePos.x, homePos.z, 8);
  const startPos = launchFrom ? { ...launchFrom } : { ...landPos };
  const hp = size === 2 ? 2 : 1;

  let actor = null;
  let group = null;
  if (ctx?.chars?.create) {
    actor = acquireActor(ctx, `q_slime:${id}_s${size}`, 'slimeMob', { id, size, pos: startPos, anim: 'hop' });
    group = actor.group;
  } else {
    group = buildFallbackSlimeMesh(size);
    group.position.set(startPos.x, startPos.y, startPos.z);
  }
  attachToScene(ctx, group);

  const unpick = registerPick(ctx, group, {
    id,
    targetId: id,
    entityId: id,
    kind: 'entity',
    label: size === 2 ? '大史莱姆' : '小史莱姆',
    hitRadius: size === 2 ? 1.25 : 0.98,
  });

  const unit = {
    id,
    size,
    hp,
    maxHp: hp,
    pos: { ...startPos },
    actor,
    group,
    unpick,
    hopTimer: size === 1 ? rngRange(ctx, 0.08, 0.2) : rngRange(ctx, 0.8, 1.3),
    hopArc: launchFrom
      ? {
          from: { ...launchFrom },
          to: { ...landPos },
          elapsed: 0,
          duration: Math.max(0.32, launchDur || 0.55),
          peak: 1.35,
          isKnockback: true,
        }
      : null,
    invuln: launchFrom ? Math.max(0.35, launchDur || 0.55) : 0,
    fleeCount: 0,
    squish: 0,
    alive: true,
  };
  return unit;
}

function removeSlime(unit) {
  if (!unit) return;
  unit.alive = false;
  unit.unpick?.();
  if (unit.group) detachFromScene(unit.group);
}

function launchFlyingBlob(ctx, fromPos, toPos, duration, onLand) {
  if (!flyingBlob) {
    flyingBlob = new THREE.Mesh(sharedBoxGeo(0.55, 0.55, 0.55), sharedLambertMat(0x6ce048));
  }
  attachToScene(ctx, flyingBlob);
  flyingBlob.visible = true;
  flyingBlob.userData.arc = {
    from: { ...fromPos },
    to: { ...toPos },
    elapsed: 0,
    duration: Math.max(0.15, duration),
    onLand,
  };
}

const qSlime = {
  id: 'slime',
  contestantId: 'slime',
  area: 'hub',
  poi: 'swamp',
  order: 2,

  start(ctx) {
    qSlime.cleanup(ctx);
    timers = createTimers();
    slimes = [];
    tapsDone = 0;
    bigSplits = 0;
    smallCleared = 0;
    finishing = false;
    nextSlimeId = 1;

    const center = poi(ctx, 'swamp', { x: 69.5, y: 8, z: 68.5 });
    boboPos = safeSwampSpot(ctx, center.x - 2.0, center.z - 0.5, 8);
    kaiBankPos = safeSwampSpot(ctx, 75.5, 68.5, 8);
    kaiWaterPos = { x: 73.5, y: 7.4, z: 66.2 };

    if (ctx?.chars?.create) {
      boboActor = acquireActor(ctx, 'q_slime:bobo', 'slime', {
        id: 'slime_contestant',
        pos: boboPos,
        anim: 'cheer',
      });
      boboActor?.setEmote?.('🟢');
    }

    // 小凯 cameo laughing on the far swamp bank (§6.2)
    ctx?.rival?.appear?.(kaiBankPos, 'cameo', 'slime');
    ctx?.rival?.taunt?.('slime');

    // Summon 3 big slimes across the NW, E, and S swamp banks so player chases them around the pond!
    const bigSpots = [
      { x: 60.5, z: 60.5 },
      { x: 78.5, z: 66.5 },
      { x: 60.5, z: 82.5 },
    ];
    for (const sp of bigSpots) {
      slimes.push(
        spawnSlimeUnit(ctx, {
          size: 2,
          homePos: sp,
          launchFrom: boboPos,
          launchDur: 0.55,
        })
      );
    }
    playSfx(ctx, 'boing', { pos: boboPos });
  },

  update(dt, ctx) {
    if (!timers) return;
    timers.update(dt);

    const pp = playerPos(ctx);
    boboActor?.lookAt?.(pp);
    boboActor?.update?.(dt);

    for (const s of slimes) {
      if (!s.alive) continue;
      if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);

      if (s.hopArc) {
        s.hopArc.elapsed += dt;
        const u = Math.min(1, s.hopArc.elapsed / s.hopArc.duration);
        s.pos.x = s.hopArc.from.x + (s.hopArc.to.x - s.hopArc.from.x) * u;
        s.pos.z = s.hopArc.from.z + (s.hopArc.to.z - s.hopArc.from.z) * u;
        const lift = Math.sin(u * Math.PI) * s.hopArc.peak;
        s.pos.y = 8;
        if (s.group) {
          s.group.position.set(s.pos.x, s.pos.y + lift, s.pos.z);
        }
        if (u >= 1) {
          s.pos.x = s.hopArc.to.x;
          s.pos.z = s.hopArc.to.z;
          s.hopArc = null;
          s.squish = 0.18;
          if (s.group) s.group.position.set(s.pos.x, s.pos.y, s.pos.z);
        }
      } else {
        // MC hop every 0.8 - 1.4 s (#143), with active small-slime proximity flee!
        const dxToP = s.pos.x - pp.x;
        const dzToP = s.pos.z - pp.z;
        const dToP = Math.hypot(dxToP, dzToP);
        if (s.size === 1 && s.fleeCount < 4 && dToP < 4.8 && s.hopTimer > 0.14) {
          s.hopTimer = 0.12;
        }
        s.hopTimer -= dt;
        if (s.hopTimer <= 0) {
          if (s.size === 1) {
            // Small slimes actively FLEE away from player (softening after 4 flee hops for F2 mercy!)
            const tired = s.fleeCount >= 4;
            s.hopTimer = tired ? rngRange(ctx, 1.35, 1.75) : rngRange(ctx, 0.82, 1.15);
            const hopDist = tired ? 1.0 : dToP < 7.0 ? 2.95 : 1.9;
            const dest = stepWalkableSwamp(ctx, s.pos, dxToP || 1, dzToP || 0.5, hopDist);
            s.fleeCount += 1;
            s.actor?.lookAt?.(dest);
            s.hopArc = {
              from: { ...s.pos },
              to: dest,
              elapsed: 0,
              duration: 0.42,
              peak: 0.78,
              isKnockback: false,
            };
            if (dToP < 9) playSfx(ctx, 'boing', { pos: s.pos, vol: 0.28, pitch: 1.35 });
          } else {
            // Big slimes hop around the swamp every 0.8 - 1.4 s (shy-hopping away when player nears)
            s.hopTimer = rngRange(ctx, 0.85, 1.32);
            const ang =
              dToP < 6.2
                ? Math.atan2(dzToP || 0.5, dxToP || 1) + rngRange(ctx, -0.65, 0.65)
                : rng(ctx) * Math.PI * 2;
            const dest = stepWalkableSwamp(ctx, s.pos, Math.cos(ang), Math.sin(ang), 2.65);
            s.actor?.lookAt?.(dest);
            s.hopArc = {
              from: { ...s.pos },
              to: dest,
              elapsed: 0,
              duration: 0.46,
              peak: 0.88,
              isKnockback: false,
            };
          }
        }
      }

      if (s.group && s.squish > 0) {
        s.squish = Math.max(0, s.squish - dt);
        const baseScale = s.actor ? (s.size === 2 ? 1.35 : 0.75) : 1.0;
        const stretch = 1 + Math.sin((s.squish / 0.22) * Math.PI) * 0.35;
        s.group.scale.set(baseScale * stretch, baseScale / stretch, baseScale * stretch);
      }
      s.actor?.update?.(dt);
    }

    if (flyingBlob && flyingBlob.visible && flyingBlob.userData.arc) {
      const arc = flyingBlob.userData.arc;
      arc.elapsed += dt;
      const u = Math.min(1, arc.elapsed / arc.duration);
      const x = arc.from.x + (arc.to.x - arc.from.x) * u;
      const z = arc.from.z + (arc.to.z - arc.from.z) * u;
      const y = arc.from.y + (arc.to.y - arc.from.y) * u + Math.sin(u * Math.PI) * 2.2;
      flyingBlob.position.set(x, y, z);
      flyingBlob.rotation.y += dt * 7;
      if (u >= 1) {
        flyingBlob.visible = false;
        const cb = arc.onLand;
        flyingBlob.userData.arc = null;
        cb?.();
      }
    }
  },

  onTap(hit, ctx) {
    if (finishing) return true;
    if (hit?.targetId === 'slime_bounce_wait') return true;

    let hitSlime = null;
    for (const s of slimes) {
      if (!s.alive) continue;
      if (hit?.targetId === s.id || hit?.entityId === s.id) {
        hitSlime = s;
        break;
      }
    }
    if (!hitSlime && hit?.pos) {
      let best = 1.65;
      for (const s of slimes) {
        if (!s.alive) continue;
        const d = dist3(hit.pos, { x: s.pos.x, y: s.pos.y + 0.5, z: s.pos.z });
        if (d <= best) {
          best = d;
          hitSlime = s;
        }
      }
    }
    if (!hitSlime) return false;
    if (hitSlime.invuln > 0) {
      playSfx(ctx, 'boing', { pos: hitSlime.pos, pitch: 1.1 });
      return true;
    }

    const pp = playerPos(ctx);
    hitSlime.hp -= 1;
    hitSlime.squish = 0.22;
    tapsDone = Math.min(TOTAL_TAPS_NEEDED, tapsDone + 1);
    const fxPos = { x: hitSlime.pos.x, y: hitSlime.pos.y + 0.6, z: hitSlime.pos.z };

    if (hitSlime.hp > 0) {
      // Big slime bop 1/2: knockback 2.8 blocks away from player (#143: 2-3 blocks per bop)!
      const kdx = hitSlime.pos.x - pp.x || 1;
      const kdz = hitSlime.pos.z - pp.z || 0.5;
      const kbDest = stepWalkableSwamp(ctx, hitSlime.pos, kdx, kdz, 3.0);
      hitSlime.hopArc = {
        from: { ...hitSlime.pos },
        to: kbDest,
        elapsed: 0,
        duration: 0.52,
        peak: 1.3,
        isKnockback: true,
      };
      hitSlime.invuln = 0.55;
      hitSlime.hopTimer = rngRange(ctx, 0.75, 1.15);
      playSfx(ctx, 'boing', { pos: fxPos, pitch: 0.95 });
      ctx?.fx?.burst?.(fxPos, 0x6ce048, 8);
      return true;
    }

    // Unit defeated!
    const splitOrigin = { ...hitSlime.pos };
    removeSlime(hitSlime);

    if (hitSlime.size === 2) {
      // Split into 2 small slimes knocked back ~2.8 blocks in opposite directions!
      bigSplits += 1;
      playSfx(ctx, 'pop', { pos: fxPos, pitch: 0.9 });
      playSfx(ctx, 'boing', { pos: fxPos, pitch: 1.15 });
      ctx?.fx?.burst?.(fxPos, 0x6ce048, 16);

      const awayAng = Math.atan2(splitOrigin.z - pp.z, splitOrigin.x - pp.x);
      const dest1 = stepWalkableSwamp(
        ctx,
        splitOrigin,
        Math.cos(awayAng + 0.85),
        Math.sin(awayAng + 0.85),
        3.1
      );
      const dest2 = stepWalkableSwamp(
        ctx,
        splitOrigin,
        Math.cos(awayAng - 0.85),
        Math.sin(awayAng - 0.85),
        3.1
      );

      const s1 = spawnSlimeUnit(ctx, {
        size: 1,
        homePos: dest1,
        launchFrom: splitOrigin,
        launchDur: 0.55,
      });
      const s2 = spawnSlimeUnit(ctx, {
        size: 1,
        homePos: dest2,
        launchFrom: splitOrigin,
        launchDur: 0.55,
      });
      slimes.push(s1, s2);

      // §6.2: 2nd big slime bounces 小凯 into the swamp pond!
      if (bigSplits === 2) {
        launchFlyingBlob(ctx, fxPos, kaiBankPos, 0.42, () => {
          ctx?.rival?.bounceIntoWater?.(kaiBankPos, kaiWaterPos, 'slime');
          ctx?.fx?.burst?.(kaiWaterPos, 0x2f68d8, 22);
          playSfx(ctx, 'splash', { pos: kaiWaterPos });
          emitGag(ctx, 'slime', 'kai_bounced', kaiWaterPos);
        });
      }
      return true;
    }

    // Small slime bopped!
    smallCleared += 1;
    const anyLeft = slimes.some((s) => s.alive);

    if (!anyLeft && bigSplits >= 3) {
      // §6.2: Last small slime hops onto 啵啵's head instead of popping!
      finishing = true;
      const headDest = { x: boboPos.x, y: boboPos.y + 2.15, z: boboPos.z };
      playSfx(ctx, 'boing', { pos: fxPos, pitch: 1.35 });
      launchFlyingBlob(ctx, fxPos, headDest, 0.52, () => {
        boboActor?.setAccessory?.('slimeHat', 0);
        boboActor?.setAnim?.('happy');
        boboActor?.setEmote?.('❤');
        ctx?.fx?.hearts?.(headDest, 16);
        ctx?.fx?.sparkles?.(headDest, 12, { toPlayer: true });
        playSfx(ctx, 'xp', { pos: headDest, pitch: 1.4 });
        emitGag(ctx, 'slime', 'slime_pet', headDest);
      });
      timers.after(1.8, () => {
        ctx?.quests?.complete?.('slime');
      });
      return true;
    }

    playSfx(ctx, 'pop', { pos: fxPos, pitch: 1.2 });
    playSfx(ctx, 'xp', { pos: fxPos, pitch: 1.0 + smallCleared * 0.08 });
    ctx?.fx?.burst?.(fxPos, 0x6ce048, 10);
    ctx?.fx?.sparkles?.(fxPos, 6, { toPlayer: true });
    return true;
  },

  onAction(ctx) {},

  introPos(ctx) {
    return { x: boboPos.x, y: boboPos.y + 1.0, z: boboPos.z };
  },

  targets(ctx) {
    if (finishing) {
      return [
        {
          id: 'slime_finishing_wait',
          pos: { x: boboPos.x, y: boboPos.y + 1.0, z: boboPos.z },
          kind: 'wait',
          label: '啵啵',
          range: 2.5,
        },
      ];
    }
    const pPos = playerPos(ctx);
    const readyAll = slimes.filter((s) => s.alive && s.invuln <= 0.05);
    const pool =
      bigSplits < 3 && readyAll.some((s) => s.size === 2)
        ? readyAll.filter((s) => s.size === 2)
        : readyAll;
    const ready = pool
      .sort((a, b) => distXZ(a.pos, pPos) - distXZ(b.pos, pPos))
      .map((s) => {
        const aim = s.hopArc ? s.hopArc.to : s.pos;
        return {
          id: s.id,
          pos: { x: aim.x, y: 8.55, z: aim.z },
          kind: 'entity',
          label: s.size === 2 ? '大史莱姆' : '小史莱姆',
          range: 2.35,
        };
      });

    if (ready.length > 0) return ready;

    const airborne = slimes.find((s) => s.alive);
    const waitPos = airborne?.hopArc?.to || airborne?.pos || boboPos;
    return [
      {
        id: 'slime_bounce_wait',
        pos: { x: waitPos.x, y: 8.55, z: waitPos.z },
        kind: 'wait',
        label: '追上史莱姆',
        range: 2.5,
      },
    ];
  },

  pointer(ctx) {
    const first = qSlime.targets(ctx)[0]?.pos || boboPos;
    return { x: first.x, y: (first.y ?? 8) + 0.9, z: first.z };
  },

  objective(ctx) {
    if (bigSplits < 3) {
      return { icon: '🟢', have: Math.min(3, bigSplits), need: 3 };
    }
    return { icon: '🫧', have: finishing ? 6 : Math.min(6, smallCleared), need: 6 };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    timers?.clear?.();
    timers = null;
    for (const s of slimes) removeSlime(s);
    slimes = [];
    if (flyingBlob) {
      flyingBlob.visible = false;
      detachFromScene(flyingBlob);
    }
    if (boboActor?.group) detachFromScene(boboActor.group);
    boboActor = null;
    ctx?.rival?.leave?.();
    finishing = false;
  },
};

export default qSlime;
