// Player controller: tap -> findPath -> walk 4.3 b/s (5.2 > 20), queued interaction <= 2.5 blocks,
// and guaranteed synchronous feedback event on every tap (F3: feedback.dead === 0) (owner: core).
import * as THREE from '../../vendor/three.module.min.js';

const WALK_SPEED = 4.3;
const LONG_WALK_SPEED = 5.2;
const SNEAK_SPEED = 1.6;
const INTERACT_RANGE = 2.5;
const INTERACT_Y_TOLERANCE = 4.5;

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

  function setSneak(b) {
    const next = Boolean(b);
    sneaking = next;
    if (ctx.state?.player) {
      ctx.state.player.sneak = next;
    }
    const a = ensureActor();
    if (next) {
      a?.setAnim?.('crouch');
    } else if (moving) {
      a?.setAnim?.(initialPathLen > 20 ? 'run' : 'walk');
    } else {
      a?.setAnim?.('idle');
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
    a?.setAnim?.('idle');
    syncState();
  }

  function stop() {
    path = [];
    initialPathLen = 0;
    moving = false;
    queuedTarget = null;
    queuedCallback = null;
    stepTimer = 0;
    ensureActor()?.setAnim?.(isSneaking() ? 'crouch' : 'idle');
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
      const a = ensureActor();
      a?.setAnim?.(isSneaking() ? 'crouch' : initialPathLen > 20 ? 'run' : 'walk');
      a?.lookAt?.(path[0]);
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
      a?.setAnim?.(sneakNow ? 'crouch' : 'idle');
      syncState();
      if (typeof cb === 'function') {
        cb(tgt);
      }
      a?.update?.(dt);
      return;
    }

    if (moving && path.length > 0) {
      const speed = sneakNow ? SNEAK_SPEED : initialPathLen > 20 ? LONG_WALK_SPEED : WALK_SPEED;
      a?.setAnim?.(sneakNow ? 'crouch' : initialPathLen > 20 ? 'run' : 'walk');
      let budget = speed * dt;

      while (budget > 0 && path.length > 0) {
        const wp = path[0];
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.z;
        const dist2d = Math.hypot(dx, dz);

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
          a?.lookAt?.(wp);
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
          a?.setAnim?.(isSneaking() ? 'crouch' : 'idle');
          if (a?.group) a.group.position.copy(pos);
          syncState();
          if (typeof cb === 'function') {
            cb(tgt);
          }
          a?.update?.(dt);
          return;
        }
      }

      stepTimer += dt;
      const stepInterval = sneakNow ? 0.62 : 0.34;
      if (stepTimer >= stepInterval) {
        stepTimer = 0;
        ctx.events.emit('sfx', { name: stepSoundForArea() });
      }

      if (path.length === 0) {
        moving = false;
        a?.setAnim?.(isSneaking() ? 'crouch' : 'idle');
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
      a?.setAnim?.('crouch');
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
    ensureActor,
    setPosition,
    walkTo,
    stop,
    setSneak,
    setSneaking: setSneak,
    isSneaking,
    isInRange,
    computePathTo,
    update,
  };
}

export default createPlayer;
