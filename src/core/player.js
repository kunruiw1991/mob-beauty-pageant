// Player controller: tap -> findPath -> walk 6.5 b/s (7.8 > 20), queued interaction <= 2.5 blocks,
// and guaranteed synchronous feedback event on every tap (F3: feedback.dead === 0) (owner: core).
// v1.1: 1.5x faster walking (was 4.3 / 5.2 / 1.6) with leg cadence scaled to speed, smooth turning and
// corner rounding so fast walks along voxel paths never zigzag.
import * as THREE from '../../vendor/three.module.min.js';
import { trails, TREE_CROWNS } from '../world/jump-trails.js';

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
  let flight = null;
  let joySpin = null;
  let path = [];
  let initialPathLen = 0;
  let moving = false;
  let sneaking = false;
  let queuedTarget = null;
  let queuedCallback = null;
  let stepTimer = 0;
  let leafStepTimer = 0;

  function isOnTree() {
    return Boolean(
      pos.y >= 10 &&
      ctx.world?.isTreeStandable?.(pos.x, Math.round(pos.y), pos.z)
    );
  }

  function getUncollectedCrowns() {
    const owned = ctx.state?.treeCrowns || [];
    return TREE_CROWNS.filter((c) => !owned.includes(c.id));
  }

  function hasNearbyTree() {
    if (flight || ctx.state?.scene !== 'world' || ctx.state?.area !== 'hub') return false;
    const yaw = ensureActor()?.group?.rotation?.y ?? Math.PI;
    const onTree = isOnTree();
    return Boolean(
      ctx.world?.findTreePerchAhead?.(pos.x, pos.y, pos.z, yaw, {
        maxDist: onTree ? 13.5 : 9.2,
        minDist: 0.85,
        coneCos: 0.12,
        excludeRadius: onTree ? 3.2 : 0,
        crownTargets: getUncollectedCrowns(),
      })
    );
  }

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
    flight = null;
    joySpin = null;
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
      a.group.rotation.x = 0;
    }
    if (faceNorth) {
      a?.lookAt?.({ x, y: gy, z: z - 10 });
    }
    setIdleAnim(a, false);
    syncState();
  }

  function stop() {
    if (flight) {
      pos.copy(flight.start);
      const g = ensureActor()?.group;
      if (g) {
        g.position.copy(pos);
        g.rotation.x = 0;
      }
      flight = null;
    }
    if (joySpin) {
      pos.y = joySpin.baseY;
      const g = ensureActor()?.group;
      if (g) {
        g.position.copy(pos);
        g.rotation.y = joySpin.startYaw;
      }
      joySpin = null;
    }
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

  function findGroundLandingToward(destX, destZ) {
    const world = ctx.world;
    if (!world?.isWalkable || !world?.surfaceY) return null;
    const dx = destX - pos.x;
    const dz = destZ - pos.z;
    const len = Math.hypot(dx, dz);
    const ux = len > 0.01 ? dx / len : 0;
    const uz = len > 0.01 ? dz / len : 1;

    // Probe a clean landing ring 2.4..7.5 blocks toward destX/destZ first, then any open spot around tree base
    for (const dist of [3.4, 4.4, 2.6, 5.5, 6.6]) {
      for (const angOff of [0, 0.4, -0.4, 0.85, -0.85, 1.4, -1.4, Math.PI]) {
        const c = Math.cos(angOff);
        const s = Math.sin(angOff);
        const rx = ux * c - uz * s;
        const rz = ux * s + uz * c;
        const tx = Math.floor(pos.x + rx * dist);
        const tz = Math.floor(pos.z + rz * dist);
        const ty = world.surfaceY(tx, tz);
        if (ty >= 6 && ty <= 10 && world.isWalkable(tx, ty, tz)) {
          return { x: tx + 0.5, y: ty, z: tz + 0.5 };
        }
      }
    }
    return null;
  }

  function walkTo(destPos, opts = {}) {
    const { maxSearchR = 6, allowClamp = false, onArrive = null, target = null } = opts;
    if (flight) return null;
    if (joySpin) {
      pos.y = joySpin.baseY;
      const g = ensureActor()?.group;
      if (g) {
        g.position.copy(pos);
        g.rotation.y = joySpin.startYaw;
      }
      joySpin = null;
    }

    // If currently perched high on a tree canopy:
    if (isOnTree() && destPos) {
      const gx = Number(destPos.x);
      const gz = Number(destPos.z);
      const dist2d = Math.hypot(gx - pos.x, gz - pos.z);
      const topY = ctx.world?.treeTopY?.(gx, gz) || 0;

      // 1. Tapped another leaf on the same tree crown -> stroll smoothly across the canopy!
      if (topY >= 10 && dist2d <= 4.4 && Math.abs(topY - pos.y) <= 2.2) {
        path = [{ x: Math.floor(gx) + 0.5, y: topY, z: Math.floor(gz) + 0.5 }];
        initialPathLen = Math.ceil(dist2d);
        queuedTarget = target;
        queuedCallback = onArrive;
        moving = true;
        applyGait(ensureActor(), currentGait(isSneaking()), true);
        syncState();
        return path[0];
      }

      // 2. Tapped ground, NPC, quest, or beacon -> gracefully Super-Dive off the tree and keep walking!
      const landSpot = findGroundLandingToward(gx, gz);
      if (landSpot) {
        const continueWalk = Math.hypot(gx - landSpot.x, gz - landSpot.z) > 1.6 || Boolean(onArrive || target);
        jumpTo(landSpot, {
          kind: 'tree_dive',
          afterLand: continueWalk ? () => walkTo(destPos, opts) : null,
        });
        return landSpot;
      }
    }

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

  function arcY(start, end, peakY, t) {
    const ctrlY = 2 * peakY - 0.5 * (start + end);
    const u = 1 - t;
    return u * u * start + 2 * u * t * ctrlY + t * t * end;
  }

  function jumpTo(endPos, opts = {}) {
    if (!endPos || ctx.state.scene !== 'world' || ctx.state.gagCam?.active || ctx.loop?.isPaused?.()) return false;
    const ex = Number(endPos.x);
    const ey = Number(endPos.y);
    const ez = Number(endPos.z);
    if (!Number.isFinite(ex) || !Number.isFinite(ey) || !Number.isFinite(ez)) return false;

    const startPos = pos.clone();
    const dist = Math.hypot(ex - startPos.x, ez - startPos.z);
    const rise = Math.max(0, ey - startPos.y);
    const drop = Math.max(0, startPos.y - ey);
    const isTreeLanding = Boolean(opts.isTreePerch || (ey >= 10 && ctx.world?.isTreeStandable?.(ex, Math.round(ey), ez)));
    const superBounce = Boolean(opts.superBounce);
    const peakExtra = superBounce
      ? Math.max(3.6, rise * 0.34 + 2.6)
      : isTreeLanding
        ? Math.max(2.3, rise * 0.25 + 1.8)
        : Math.max(1.9, rise * 0.22 + 1.5);
    const peakY = Math.max(startPos.y, ey) + peakExtra;
    const dur = Math.min(0.92, Math.max(0.46, 0.44 + dist * 0.025 + (rise + drop) * 0.024));

    stop();
    flight = {
      start: startPos,
      end: new THREE.Vector3(ex, ey, ez),
      peakY,
      dur,
      t: 0,
      fromY: startPos.y,
      toTree: isTreeLanding,
      kind: opts.kind || (isTreeLanding ? 'tree_vault' : 'hop'),
      flipped: false,
      flipT: 0,
      afterLand: typeof opts.afterLand === 'function' ? opts.afterLand : null,
    };
    moving = true;
    const a = ensureActor();
    a?.lookAt?.(flight.end);
    a?.setAnim?.('run');
    ctx.events.emit('sfx', { name: 'boing' });
    if (superBounce) {
      ctx.fx?.burst?.(startPos, 0x5ce643, 18);
      ctx.fx?.sparkles?.(startPos, 14);
      ctx.fx?.ring?.(startPos, 0x70e000);
    } else if (isTreeLanding) {
      ctx.fx?.sparkles?.(startPos, 8);
    }
    syncState();
    return true;
  }

  function triggerMidAirFlip() {
    if (!flight || flight.flipped) return false;
    flight.flipped = true;
    flight.flipT = 0;
    flight.peakY += 0.85;
    if (ctx.state) {
      ctx.state.midAirFlips = (ctx.state.midAirFlips || 0) + 1;
    }
    ctx.fx?.sparkles?.(pos, 14);
    ctx.fx?.popup?.(pos, '🌀');
    ctx.events.emit('sfx', { name: 'note4' });
    return true;
  }

  function triggerJoySpin() {
    if (flight || moving || ctx.state.scene !== 'world' || ctx.state.gagCam?.active) return false;
    const a = ensureActor();
    const startYaw = a?.group?.rotation?.y ?? Math.PI;
    joySpin = { t: 0, dur: 0.44, baseY: pos.y, startYaw };
    const sounds = ['boing', 'pop', 'cheer', 'note5'];
    const sfx = sounds[Math.floor((ctx.frame || 0) % sounds.length)];
    ctx.events.emit('sfx', { name: sfx });
    ctx.fx?.sparkles?.(pos, 14);
    ctx.fx?.confetti?.(pos, 18);
    ctx.fx?.popup?.(pos, '🥳');
    return true;
  }

  function findNearbyTrailPadAhead(yaw) {
    if (ctx.state?.area !== 'hub') return null;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const owned = ctx.state?.trailGems || [];
    let best = null;
    let bestScore = -Infinity;
    for (const trail of trails) {
      for (let i = 0; i < trail.pads.length; i++) {
        const [px, pz, py] = trail.pads[i];
        const cx = px + 1;
        const cz = pz + 1;
        const dist = Math.hypot(cx - pos.x, cz - pos.z);
        if (dist < 1.1 || dist > 5.8) continue;
        if (Math.abs(py - pos.y) > 3.6) continue;
        const dot = ((cx - pos.x) * fx + (cz - pos.z) * fz) / Math.max(0.001, dist);
        if (dot < 0.25 && dist > 3.2) continue;
        const unowned = !owned.includes(trail.name + i);
        const score = dot * 3.0 - dist * 0.5 + (unowned ? 3.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, y: py, z: cz };
        }
      }
    }
    return best;
  }

  function jumpForward(target) {
    if (ctx.state.scene !== 'world' || ctx.state.gagCam?.active || ctx.loop?.isPaused?.()) return false;
    // Pressing Jump again mid-air does a fun 360° Somersault Flip!
    if (flight) {
      return triggerMidAirFlip();
    }

    const world = ctx.world;
    const yaw = ensureActor()?.group?.rotation.y ?? Math.PI;
    const onTreeNow = isOnTree();

    // 1. Explicit target (tapped tree perch or tapped gem platform!)
    if (target) {
      const tx = Number(target.x);
      const tz = Number(target.z);
      const dist = Math.hypot(tx - pos.x, tz - pos.z);
      const isTreeTarget = Boolean(
        target.isTreePerch ||
        (Number.isFinite(target.y) && target.y >= 10 && world.isTreeStandable?.(tx, Math.round(target.y), tz))
      );
      if (isTreeTarget && dist >= 0.4 && dist <= 15.0) {
        const ty = Number.isFinite(target.y) ? target.y : world.treeTopY?.(tx, tz);
        if (ty >= 10) {
          return jumpTo({ x: tx, y: ty, z: tz }, { isTreePerch: true, kind: onTreeNow ? 'tree_hop' : 'tree_vault' });
        }
      }
      if (dist >= 0.4 && dist <= 6.2) {
        const y = Number.isFinite(target.y) ? target.y : world.surfaceY(Math.floor(tx), Math.floor(tz));
        if (Math.abs(y - pos.y) <= 4.2 && world.isWalkable(tx, y, tz)) {
          return jumpTo({ x: tx, y, z: tz }, { kind: 'pad_hop' });
        }
      }
      return false;
    }

    // 2. Smart auto-aim when kid presses Jump / Space:
    // 2a. Nearby gem trail platform ahead
    const padTarget = findNearbyTrailPadAhead(yaw);
    if (padTarget && world.isWalkable(padTarget.x, padTarget.y, padTarget.z)) {
      return jumpTo(padTarget, { kind: 'pad_hop' });
    }

    // 2b. Nearby tree canopy (or treetop-to-treetop leap when already on a tree!)
    if (ctx.state?.area === 'hub' && world.findTreePerchAhead) {
      const perch = world.findTreePerchAhead(pos.x, pos.y, pos.z, yaw, {
        maxDist: onTreeNow ? 13.5 : 9.2,
        minDist: 0.85,
        coneCos: 0.12,
        excludeRadius: onTreeNow ? 3.2 : 0,
        crownTargets: getUncollectedCrowns(),
      });
      if (perch) {
        return jumpTo(perch, { isTreePerch: true, kind: onTreeNow ? 'tree_hop' : 'tree_vault' });
      }
    }

    // 2c. If standing on a tree with no other tree ahead -> joyful Hero Super-Dive down to ground!
    if (onTreeNow) {
      const landSpot = findGroundLandingToward(pos.x + Math.sin(yaw) * 4.5, pos.z + Math.cos(yaw) * 4.5);
      if (landSpot) {
        return jumpTo(landSpot, { kind: 'tree_dive' });
      }
    }

    // 2d. Standard bouncy forward hop onto walkable ground
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    for (let distance = 4.0; distance >= 0.65; distance -= 0.5) {
      const x = pos.x + dx * distance;
      const z = pos.z + dz * distance;
      const y = world.surfaceY(Math.floor(x), Math.floor(z));
      if (Math.abs(y - pos.y) > 2.6 || !world.isWalkable(x, y, z)) continue;
      const peakY = Math.max(pos.y, y) + 1.9;
      let clear = true;
      for (let i = 1; i <= 24 && clear; i++) {
        const t = i / 24;
        const feet = arcY(pos.y, y, peakY, t) + 0.01;
        for (const ox of [-0.16, 0.16]) for (const oz of [-0.16, 0.16]) {
          for (let h = Math.floor(feet); h <= Math.floor(feet + 1.65); h++) {
            const id = world.getBlock(pos.x + (x - pos.x) * t + ox, h, pos.z + (z - pos.z) * t + oz);
            const props = world.getBlockProps(id);
            if (props?.solid || props?.blocksWalk) clear = false;
          }
        }
      }
      if (clear) {
        return jumpTo({ x, y, z }, { kind: 'hop' });
      }
    }
    return false;
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

  function isTargetWithin(tgt, fallbackRange = INTERACT_RANGE) {
    if (!tgt?.pos) return false;
    const range = Number.isFinite(tgt.range) ? tgt.range : fallbackRange;
    if (tgt.ignoreY) {
      return Math.hypot(pos.x - tgt.pos.x, pos.z - tgt.pos.z) <= range;
    }
    return isInRange(tgt.pos, range);
  }

  function update(dt) {
    const a = ensureActor();
    const sneakNow = isSneaking();

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const { start, end, peakY, t } = flight;
      pos.lerpVectors(start, end, t);
      pos.y = arcY(start.y, end.y, peakY, t);
      if (a?.group) {
        a.group.position.copy(pos);
        if (flight.flipped) {
          flight.flipT = Math.min(1, flight.flipT + dt / Math.max(0.22, flight.dur * 0.56));
          a.group.rotation.x = flight.flipT * Math.PI * 2;
        } else {
          a.group.rotation.x = 0;
        }
      }
      a?.update?.(dt);
      if (t === 1) {
        const landedFlight = flight;
        flight = null;
        moving = false;
        if (a?.group) {
          a.group.position.copy(pos);
          a.group.rotation.x = 0;
        }
        setIdleAnim(a, sneakNow);
        ctx.events.emit('jumpLand', {
          x: pos.x,
          y: pos.y,
          z: pos.z,
          fromY: landedFlight.fromY,
          toTree: landedFlight.toTree,
          kind: landedFlight.kind,
          flipped: landedFlight.flipped,
        });
        if (typeof landedFlight.afterLand === 'function') {
          landedFlight.afterLand();
        }
      }
      syncState();
      return;
    }

    if (joySpin) {
      joySpin.t = Math.min(1, joySpin.t + dt / joySpin.dur);
      pos.y = joySpin.baseY + Math.sin(joySpin.t * Math.PI) * 0.72;
      if (a?.group) {
        a.group.position.copy(pos);
        a.group.rotation.y = joySpin.startYaw + joySpin.t * Math.PI * 2;
      }
      if (joySpin.t >= 1) {
        pos.y = joySpin.baseY;
        if (a?.group) {
          a.group.position.copy(pos);
          a.group.rotation.y = joySpin.startYaw;
        }
        joySpin = null;
        setIdleAnim(a, sneakNow);
      }
      a?.update?.(dt);
      syncState();
      return;
    }

    // Check queued interaction range even mid-walk (§6: 2.5 blocks, or custom target.range)
    if (queuedTarget && isTargetWithin(queuedTarget, INTERACT_RANGE)) {
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
        if (queuedTarget && isTargetWithin(queuedTarget, INTERACT_RANGE)) {
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

      // Rustling leafy trail when strolling across tree canopies!
      if (isOnTree()) {
        leafStepTimer += dt;
        if (leafStepTimer >= 0.24) {
          leafStepTimer = 0;
          ctx.fx?.burst?.(pos, 0x489c32, 3);
        }
      }

      if (path.length === 0) {
        moving = false;
        setIdleAnim(a, isSneaking());
        // If we reached the closest walkable cell and have a queued target slightly elevated/fenced (e.g. cage bars <= 3.4)
        if (queuedTarget && isTargetWithin(queuedTarget, 3.4)) {
          const tgt = queuedTarget;
          const cb = queuedCallback;
          queuedTarget = null;
          queuedCallback = null;
          a?.lookAt?.(tgt.pos);
          if (typeof cb === 'function') {
            cb(tgt);
          }
        } else if (!queuedTarget && typeof queuedCallback === 'function') {
          const cb = queuedCallback;
          queuedCallback = null;
          cb();
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
    jumpForward,
    jumpTo,
    triggerMidAirFlip,
    triggerJoySpin,
    isJumping: () => Boolean(flight),
    isOnTree,
    hasNearbyTree,
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
