// Player controller: tap -> findPath -> walk 6.5 b/s (7.8 > 20), queued interaction <= 2.5 blocks,
// and guaranteed synchronous feedback event on every tap (F3: feedback.dead === 0) (owner: core).
// v1.1: 1.5x faster walking (was 4.3 / 5.2 / 1.6) with leg cadence scaled to speed, smooth turning and
// corner rounding so fast walks along voxel paths never zigzag.
import * as THREE from '../../vendor/three.module.min.js';

export const WALK_SPEED = 6.5;
export const LONG_WALK_SPEED = 7.8;
export const SNEAK_SPEED = 2.4;
// Speeds the walk/run/crouch animations were authored for (leg swing frequency scales by speed / base).
const ANIM_BASE_SPEED = { walk: 4.3, run: 5.2, crouch: 1.6 };
// Authored leg-swing angular frequencies (rad/s) in src/chars/anim.js — footsteps land twice per cycle.
const LEG_FREQ = { walk: 7.6, run: 11.5, crouch: 4.8 };
const LONG_PATH_BLOCKS = 20;
// Corner rounding: advance to the next waypoint this close to a corner (cuts <= ~0.3 block off 90° turns).
const CORNER_RADIUS = 0.42;
// Facing slew (1/s): turns ~95% of the way in ~0.19 s instead of snapping every waypoint.
const TURN_RATE = 16;
const INTERACT_RANGE = 2.5;
const INTERACT_Y_TOLERANCE = 4.5;

export const PLAYER_CONFIG = Object.freeze({
  walkSpeed: WALK_SPEED,
  longWalkSpeed: LONG_WALK_SPEED,
  longPathBlocks: LONG_PATH_BLOCKS,
  sneakSpeed: SNEAK_SPEED,
  cornerRadius: CORNER_RADIUS,
  turnRate: TURN_RATE,
});

export function createPlayer(ctx) {
  const pos = new THREE.Vector3(48, 8, 66);
  let actor = null;
  let path = [];
  let initialPathLen = 0;
  let moving = false;
  let sneaking = false;
  let queuedTarget = null;
  let queuedCallback = null;
  let stepTimer = 0;

  function isSneaking() {
    return Boolean(sneaking || ctx.state?.player?.sneak);
  }

  // Current locomotion gait: anim name + speed (b/s). Long paths (> 20 blocks) run.
  function currentGait(sneakNow) {
    if (sneakNow) return { anim: 'crouch', speed: SNEAK_SPEED };
    return initialPathLen > LONG_PATH_BLOCKS
      ? { anim: 'run', speed: LONG_WALK_SPEED }
      : { anim: 'walk', speed: WALK_SPEED };
  }

  // Leg swing frequency scales with speed: the anim clock runs at speed / authored-speed.
  function applyGait(a, gait, isMoving = true) {
    if (!a) return;
    a.gaitRate = isMoving ? gait.speed / (ANIM_BASE_SPEED[gait.anim] || gait.speed) : 1;
    a.setAnim?.(gait.anim);
  }

  function setIdleAnim(a, sneakNow) {
    if (!a) return;
    a.gaitRate = 1;
    a.setAnim?.(sneakNow ? 'crouch' : 'idle');
  }

  // Smoothly slew facing toward (x, z) instead of snapping at every waypoint (fast turns stay fluid).
  function turnToward(a, x, z, dt) {
    const g = a?.group;
    if (!g) return;
    const dx = x - pos.x;
    const dz = z - pos.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const want = Math.atan2(dx, dz);
    let diff = want - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, dt * TURN_RATE);
  }

  function setSneak(b) {
    const next = Boolean(b);
    sneaking = next;
    if (ctx.state?.player) {
      ctx.state.player.sneak = next;
    }
    const a = ensureActor();
    if (moving) {
      applyGait(a, currentGait(next), true);
    } else {
      setIdleAnim(a, next);
    }
  }

  function ensureActor() {
    if (!actor && ctx.chars?.create) {
      actor = ctx.chars.create('player', { id: 'player' });
      if (actor?.group && ctx.scene && !actor.group.parent) {
        ctx.scene.add(actor.group);
      }
      if (actor?.group) {
        actor.group.position.copy(pos);
      }
      // Face north (-Z) toward plaza & tier wall at spawn (§5)
      actor?.lookAt?.({ x: pos.x, y: pos.y, z: pos.z - 10 });
    }
    return actor;
  }

  function syncState() {
    if (!ctx.state?.player) return;
    ctx.state.player.x = pos.x;
    ctx.state.player.y = pos.y;
    ctx.state.player.z = pos.z;
    ctx.state.player.moving = moving;
    ctx.state.player.pathLen = path.length;
    ctx.state.player.sneak = Boolean(sneaking || ctx.state.player.sneak);
  }

  function resolveGroundY(x, z, fallbackY = pos.y) {
    const sy = ctx.world?.surfaceY?.(Math.floor(x), Math.floor(z));
    return Number.isFinite(sy) && sy > 0 ? sy : fallbackY;
  }

  function setPosition(x, y, z, { faceNorth = false } = {}) {
    const gy = Number.isFinite(y) ? y : resolveGroundY(x, z, 8);
    pos.set(x, gy, z);
    path = [];
    initialPathLen = 0;
    moving = false;
    sneaking = false;
    if (ctx.state?.player) {
      ctx.state.player.sneak = false;
    }
    queuedTarget = null;
    queuedCallback = null;
    stepTimer = 0;
    const a = ensureActor();
    if (a?.group) {
      a.group.position.copy(pos);
    }
    if (faceNorth) {
      a?.lookAt?.({ x, y: gy, z: z - 10 });
    }
    setIdleAnim(a, false);
    syncState();
  }

  function stop() {
    path = [];
    initialPathLen = 0;
    moving = false;
    queuedTarget = null;
    queuedCallback = null;
    stepTimer = 0;
    setIdleAnim(ensureActor(), isSneaking());
    syncState();
  }

  function isInRange(targetPos, range = INTERACT_RANGE) {
    if (!targetPos) return false;
    const dx = pos.x - targetPos.x;
    const dz = pos.z - targetPos.z;
    const dy = Math.abs(pos.y - (targetPos.y ?? pos.y));
    return Math.hypot(dx, dz) <= range && dy <= INTERACT_Y_TOLERANCE;
  }

  function clampToAreaDomain(x, z, area) {
    if (area === 'end') {
      return {
        x: Math.min(174.5, Math.max(129.5, x)),
        z: Math.min(62.5, Math.max(17.5, z)),
      };
    }
    if (area === 'nether') {
      return {
        x: Math.min(238.5, Math.max(193.5, x)),
        z: Math.min(62.5, Math.max(17.5, z)),
      };
    }
    return {
      x: Math.min(93.5, Math.max(2.5, x)),
      z: Math.min(93.5, Math.max(2.5, z)),
    };
  }

  function findReachableAround(fromCell, centerX, centerZ, prefY, maxR = 6) {
    if (!ctx.world?.findPath || !ctx.world?.isWalkable) return null;
    const bx0 = Math.floor(centerX);
    const bz0 = Math.floor(centerZ);
    const baseY = Math.round(prefY);
    const yOffsets = [0, 1, -1, -2];

    for (let r = 0; r <= maxR; r++) {
      const ringCands = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const bx = bx0 + dx;
          const bz = bz0 + dz;
          for (let yi = 0; yi < yOffsets.length; yi++) {
            const ty = baseY + yOffsets[yi];
            if (ty < 1) continue;
            if (ctx.world.isWalkable(bx, ty, bz)) {
              const cx = bx + 0.5;
              const cz = bz + 0.5;
              const dGoal2 = (cx - centerX) * (cx - centerX) + (cz - centerZ) * (cz - centerZ);
              const dPlayer = Math.hypot(cx - pos.x, cz - pos.z);
              ringCands.push({
                x: cx,
                y: ty,
                z: cz,
                score: dGoal2 + Math.abs(yOffsets[yi]) * 0.35 + dPlayer * 0.04,
              });
              break;
            }
          }
        }
      }
      if (ringCands.length === 0) continue;
      ringCands.sort((a, b) => a.score - b.score);
      const limit = Math.min(4, ringCands.length);
      for (let i = 0; i < limit; i++) {
        const c = ringCands[i];
        const found = ctx.world.findPath(fromCell, c);
        if (found && found.length > 0) {
          return found;
        }
      }
    }
    return null;
  }

  function computePathTo(destPos, maxSearchR = 6, allowClamp = false) {
    if (!destPos) return null;
    let gx = Number(destPos.x);
    let gz = Number(destPos.z);
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return null;

    const area = ctx.state?.area || 'hub';
    if (allowClamp) {
      const clamped = clampToAreaDomain(gx, gz, area);
      gx = clamped.x;
      gz = clamped.z;
    } else {
      if (area === 'hub' && (gx < 1 || gx >= 95 || gz < 1 || gz >= 95)) return null;
      if (area === 'end' && (gx < 128 || gx >= 176 || gz < 16 || gz >= 64)) return null;
      if (area === 'nether' && (gx < 192 || gx >= 240 || gz < 16 || gz >= 64)) return null;
    }

    if (ctx.world?.findPath) {
      const fromCell = { x: Math.floor(pos.x), y: Math.round(pos.y), z: Math.floor(pos.z) };
      const exactY = Math.round(destPos.y ?? resolveGroundY(gx, gz));
      const exactCell = { x: Math.floor(gx), y: exactY, z: Math.floor(gz) };

      let found = null;
      // 1. Direct walkability check first (preserves stairs like Dragon Egg y=17 & Nether Bridge y=9)
      if (!ctx.world.isWalkable || ctx.world.isWalkable(exactCell.x, exactCell.y, exactCell.z)) {
        found = ctx.world.findPath(fromCell, exactCell);
      }

      // 2. Reachable ground-level search within r <= maxSearchR (#149 N2)
      if ((!found || found.length === 0) && maxSearchR > 0) {
        found = findReachableAround(fromCell, gx, gz, fromCell.y, maxSearchR);
      }

      // 3. Clamp ray/hill interior back toward player onto the walkable island (#149 N2)
      if ((!found || found.length === 0) && allowClamp) {
        const dx = pos.x - gx;
        const dz = pos.z - gz;
        const totalDist = Math.hypot(dx, dz);
        if (totalDist > 1.0) {
          const stepLen = 2.5;
          const steps = Math.min(28, Math.floor(totalDist / stepLen));
          for (let s = 1; s <= steps; s++) {
            const t = (s * stepLen) / totalDist;
            if (t >= 0.96) break;
            const sx = gx + dx * t;
            const sz = gz + dz * t;
            found = findReachableAround(fromCell, sx, sz, fromCell.y, 4);
            if (found && found.length > 0) break;
          }
        }
      }

      if (!found || found.length === 0) return null;

      return found.map((wp) => ({
        x: wp.x,
        y: wp.y ?? resolveGroundY(wp.x, wp.z),
        z: wp.z,
      }));
    }

    // Fallback straight-line path when world is still a stub
    const gy = resolveGroundY(gx, gz, destPos.y ?? 8);
    return [{ x: gx, y: gy, z: gz }];
  }

  function measurePathDistance(waypoints) {
    if (!waypoints || waypoints.length === 0) return 0;
    let total = Math.hypot(waypoints[0].x - pos.x, waypoints[0].z - pos.z);
    for (let i = 1; i < waypoints.length; i++) {
      total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
    }
    return total;
  }

  function walkTo(destPos, { maxSearchR = 6, allowClamp = false, onArrive = null, target = null } = {}) {
    const waypoints = computePathTo(destPos, maxSearchR, allowClamp);
    if (!waypoints || waypoints.length === 0) {
      return null;
    }

    // Drop initial waypoint if player is already standing inside it and more waypoints follow
    if (waypoints.length > 1) {
      const first = waypoints[0];
      if (Math.hypot(pos.x - first.x, pos.z - first.z) < 0.35) {
        waypoints.shift();
      }
    }

    path = waypoints;
    initialPathLen = Math.ceil(measurePathDistance(waypoints));
    queuedTarget = target;
    queuedCallback = onArrive;
    moving = path.length > 0;

    if (moving) {
      // Facing slews toward path[0] in update() (no instant snap on every re-tap).
      applyGait(ensureActor(), currentGait(isSneaking()), true);
    }
    syncState();
    return path[path.length - 1];
  }

  function stepSoundForArea() {
    const area = ctx.state?.area;
    if (area === 'nether' || area === 'end') return 'step_stone';
    const px = pos.x;
    const pz = pos.z;
    if (pz < 25 && px >= 34 && px <= 62) return 'step_snow';
    if (Math.hypot(px - 48, pz - 48) < 10) return 'step_stone';
    return 'step_grass';
  }

  function update(dt) {
    const a = ensureActor();
    const sneakNow = isSneaking();

    // Check queued interaction range even mid-walk (§6: 2.5 blocks)
    if (queuedTarget && isInRange(queuedTarget.pos, INTERACT_RANGE)) {
      const tgt = queuedTarget;
      const cb = queuedCallback;
      path = [];
      initialPathLen = 0;
      moving = false;
      queuedTarget = null;
      queuedCallback = null;
      a?.lookAt?.(tgt.pos);
      setIdleAnim(a, sneakNow);
      syncState();
      if (typeof cb === 'function') {
        cb(tgt);
      }
      a?.update?.(dt);
      return;
    }

    if (moving && path.length > 0) {
      const gait = currentGait(sneakNow);
      applyGait(a, gait, true);
      let budget = gait.speed * dt;
      let headTo = path[0];

      while (budget > 0 && path.length > 0) {
        const wp = path[0];
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const dist2d = Math.hypot(dx, dz);
        headTo = wp;

        if (path.length > 1 && dist2d < CORNER_RADIUS) {
          // Corner rounding: retarget the next waypoint a little before the corner so fast walks curve
          // instead of zigzagging cell-to-cell (y keeps easing toward the next waypoint below).
          path.shift();
          headTo = path[0];
          continue;
        }

        if (dist2d <= budget || dist2d < 0.04) {
          pos.x = wp.x;
          pos.z = wp.z;
          pos.y = Number.isFinite(wp.y) ? wp.y : resolveGroundY(pos.x, pos.z, pos.y);
          budget -= dist2d;
          path.shift();
        } else {
          const ux = dx / dist2d;
          const uz = dz / dist2d;
          pos.x += ux * budget;
          pos.z += uz * budget;
          const targetY = Number.isFinite(wp.y) ? wp.y : resolveGroundY(pos.x, pos.z, pos.y);
          pos.y += (targetY - pos.y) * Math.min(1, dt * 14);
          budget = 0;
        }

        // Re-check queued interaction right as we cross into range
        if (queuedTarget && isInRange(queuedTarget.pos, INTERACT_RANGE)) {
          const tgt = queuedTarget;
          const cb = queuedCallback;
          path = [];
          initialPathLen = 0;
          moving = false;
          queuedTarget = null;
          queuedCallback = null;
          a?.lookAt?.(tgt.pos);
          setIdleAnim(a, isSneaking());
          if (a?.group) a.group.position.copy(pos);
          syncState();
          if (typeof cb === 'function') {
            cb(tgt);
          }
          a?.update?.(dt);
          return;
        }
      }

      if (headTo) turnToward(a, headTo.x, headTo.z, dt);

      // One footstep per half leg cycle (cadence follows the speed-scaled walk animation).
      stepTimer += dt;
      const legFreq = (LEG_FREQ[gait.anim] || LEG_FREQ.walk) * (a?.gaitRate || 1);
      const stepInterval = Math.PI / legFreq;
      if (stepTimer >= stepInterval) {
        stepTimer = 0;
        ctx.events.emit('sfx', { name: stepSoundForArea() });
      }

      if (path.length === 0) {
        moving = false;
        setIdleAnim(a, isSneaking());
        // If we reached the closest walkable cell and have a queued target slightly elevated/fenced (e.g. cage bars <= 3.4)
        if (queuedTarget && isInRange(queuedTarget.pos, 3.4)) {
          const tgt = queuedTarget;
          const cb = queuedCallback;
          queuedTarget = null;
          queuedCallback = null;
          a?.lookAt?.(tgt.pos);
          if (typeof cb === 'function') {
            cb(tgt);
          }
        } else {
          queuedTarget = null;
          queuedCallback = null;
        }
      }
    } else if (sneakNow) {
      setIdleAnim(a, true);
    }

    if (a?.group) {
      a.group.position.copy(pos);
    }
    a?.update?.(dt);
    syncState();
  }

  return {
    pos,
    get actor() {
      return ensureActor();
    },
    get group() {
      return ensureActor()?.group || null;
    },
    ensureActor,
    setPosition,
    walkTo,
    stop,
    isMoving: () => Boolean(moving),
    // Current locomotion speed in blocks/s (0 when standing) — the follow camera tightens with it.
    currentSpeed: () => (moving && path.length > 0 ? currentGait(isSneaking()).speed : 0),
    config: PLAYER_CONFIG,
    setSneak,
    setSneaking: setSneak,
    isSneaking,
    isInRange,
    computePathTo,
    update,
  };
}

export default createPlayer;
