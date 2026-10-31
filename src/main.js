// Main integrator & pageant game flow per docs/DESIGN.md §1–§11 (owner: core).
import * as THREE from '../vendor/three.module.min.js';
import * as ROSTER_MODULE from './data/roster.js';
import { ROSTER, ROSTER_BY_ID, TIERS } from './data/roster.js';
import { createEvents } from './core/events.js';
import { createRng, normalizeSeedNumber } from './core/rng.js';
import {
  MAIN_QUEST_IDS,
  createInitialState,
  resetStateInPlace,
  recomputeStars,
  snapshotState,
} from './core/state.js';
import { DT, createLoop } from './core/loop.js';
import { createSceneSetup } from './core/scene.js';
import { createCameraRig } from './core/camera.js';
import { createPicker } from './core/pick.js';
import { createInput } from './core/input.js';
import { createPlayer } from './core/player.js';
import { createAreas, musicForArea } from './core/areas.js';
import { createSeam } from './core/seam.js';
import { parseDebugParams, applyDebugParams } from './core/debug.js';

import { createWorld } from './world/world.js';
import { createChars } from './chars/models.js';
import { createUI } from './ui/hud.js';
import { createFx } from './fx/particles.js';
import { createAudio } from './fx/audio.js';
import { createQuestManager } from './quests/index.js';
import { createRival } from './quests/rival.js';
import { startFinale } from './quests/finale.js';

function createFallbackWorld(ctx) {
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x62b84a });
  const groundGeo = new THREE.BoxGeometry(84, 2, 84);
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.set(48, 7, 48);
  ctx.scene.add(groundMesh);

  const poi = {
    spawn: { x: 48, y: 8, z: 66 },
    plaza: { x: 48, y: 8, z: 48 },
    board: { x: 48, y: 8, z: 40 },
    runway: { x: 48, y: 8, z: 54 },
    stage: { x: 48, y: 8, z: 59 },
    meadow: { x: 48, y: 8, z: 74 },
    hive: { x: 40, y: 8, z: 80 },
    swamp: { x: 74, y: 8, z: 70 },
    cave: { x: 80, y: 8, z: 46 },
    villageSquare: { x: 72, y: 8, z: 26 },
    statue: { x: 70, y: 8, z: 30 },
    pumpkins: { x: 78, y: 8, z: 20 },
    ironAltar: { x: 66, y: 8, z: 26 },
    bank: { x: 82, y: 8, z: 30 },
    stall: { x: 74, y: 8, z: 24 },
    snow: { x: 48, y: 8, z: 18 },
    snowArena: { x: 48, y: 8, z: 14 },
    shrine: { x: 18, y: 8, z: 22 },
    endPortal: { x: 20, y: 8, z: 18 },
    netherPortal: { x: 12, y: 8, z: 30 },
    kaiHouse: { x: 16, y: 8, z: 45 },
    prison: { x: 16, y: 8, z: 58 },
    prisonCell: { x: 16, y: 8, z: 66 },
    jungle: { x: 24, y: 8, z: 78 },
    clearing: { x: 26, y: 8, z: 58 },
    pinkTulip: { x: 32, y: 8, z: 78 },
    endArrive: { x: 140, y: 8, z: 40 },
    endCage: { x: 154, y: 8, z: 40 },
    dragonEgg: { x: 160, y: 12, z: 32 },
    netherArrive: { x: 202, y: 8, z: 40 },
    fortress: { x: 214, y: 8, z: 38 },
    soulSand: { x: 220, y: 8, z: 46 },
    witherAltar: { x: 228, y: 8, z: 40 },
  };

  return {
    B: { AIR: 0, GRASS: 1, STONE: 2, LAVA: 3, WATER: 4 },
    poi,
    atlas: null,
    getBlock: (_x, y, _z) => (y < 8 ? 1 : 0),
    setBlock: () => {},
    raycast(origin, dir, maxDist = 100) {
      if (dir.y >= -0.001) return null;
      const t = (8 - origin.y) / dir.y;
      if (t <= 0 || t > maxDist) return null;
      const hx = origin.x + dir.x * t;
      const hz = origin.z + dir.z * t;
      const area = ctx.state?.area || 'hub';
      const inBounds =
        (area === 'hub' && hx >= 6 && hx <= 90 && hz >= 6 && hz <= 90) ||
        (area === 'end' && hx >= 130 && hx <= 174 && hz >= 18 && hz <= 62) ||
        (area === 'nether' && hx >= 194 && hx <= 238 && hz >= 18 && hz <= 62);
      if (!inBounds) return null;
      return {
        pos: { x: Math.floor(hx), y: 8, z: Math.floor(hz) },
        normal: { x: 0, y: 1, z: 0 },
        blockId: 1,
      };
    },
    surfaceY: () => 8,
    isWalkable(x, _y, z) {
      const area = ctx.state?.area || 'hub';
      if (area === 'hub') return x >= 6 && x <= 90 && z >= 6 && z <= 90;
      if (area === 'end') return x >= 130 && x <= 174 && z >= 18 && z <= 62;
      if (area === 'nether') return x >= 194 && x <= 238 && z >= 18 && z <= 62;
      return false;
    },
    nearestWalkable(p) {
      const area = ctx.state?.area || 'hub';
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));
      if (area === 'end') return { x: clamp(p.x, 132, 172), y: 8, z: clamp(p.z, 20, 60) };
      if (area === 'nether') return { x: clamp(p.x, 196, 236), y: 8, z: clamp(p.z, 20, 60) };
      return { x: clamp(p.x, 8, 88), y: 8, z: clamp(p.z, 8, 88) };
    },
    findPath(from, to) {
      if (!this.isWalkable(to.x, to.y ?? 8, to.z)) return null;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz)));
      const out = [];
      for (let i = 1; i <= steps; i++) {
        out.push({
          x: from.x + (dx * i) / steps,
          y: 8,
          z: from.z + (dz * i) / steps,
        });
      }
      return out;
    },
    setArea: () => {},
    update: () => {},
    blockColor: () => new THREE.Color(0x62b84a),
    *buildSteps() {
      yield 'fallback-world';
    },
    boardWall: {
      setPortrait: () => {},
      highlight: () => {},
    },
  };
}

function buildBleacherSeats() {
  const seats = [];
  for (let z = 50; z <= 58; z += 1.6) {
    seats.push({ x: 43.6, y: 8.6, z, yaw: Math.PI / 2 });
    seats.push({ x: 42.4, y: 9.4, z, yaw: Math.PI / 2 });
    seats.push({ x: 52.4, y: 8.6, z, yaw: -Math.PI / 2 });
    seats.push({ x: 53.6, y: 9.4, z, yaw: -Math.PI / 2 });
  }
  return seats;
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  const debugParams = parseDebugParams();
  const initialSeed = debugParams.seed ?? 12345;

  const events = createEvents();
  const rng = createRng(initialSeed);
  const state = createInitialState(initialSeed);
  const sceneSetup = createSceneSetup(canvas);

  const ctx = {
    THREE,
    DT,
    renderer: sceneSetup.renderer,
    scene: sceneSetup.scene,
    lights: sceneSetup.lights,
    camera: null,
    events,
    rng,
    time: 0,
    frame: 0,
    state,
    roster: ROSTER_MODULE,
    world: null,
    chars: null,
    quests: null,
    ui: null,
    fx: null,
    audio: null,
    player: null,
    rival: null,
    pick: null,
    cam: null,
    areas: null,
    crowdCtrl: null,
  };

  // Camera rig
  ctx.cam = createCameraRig(ctx);
  ctx.camera = ctx.cam.camera;

  // Audio & FX (must exist right after events & scene per #132)
  ctx.audio = createAudio(ctx);
  ctx.fx = createFx(ctx);

  // World (canonical src/world/world.js with sliced buildSteps)
  let buildIter = null;
  let worldBuilt = false;
  ctx.world = typeof createWorld === 'function' ? createWorld(ctx) : createFallbackWorld(ctx);
  if (typeof ctx.world?.buildSteps === 'function') {
    buildIter = ctx.world.buildSteps();
  } else {
    worldBuilt = true;
  }

  function drainBuildSlice(maxMs = 7.5) {
    if (worldBuilt || !buildIter) {
      worldBuilt = true;
      return true;
    }
    const t0 = performance.now();
    try {
      while (performance.now() - t0 < maxMs) {
        const res = buildIter.next();
        if (res.done) {
          worldBuilt = true;
          onWorldBuildFinished();
          return true;
        }
      }
    } catch (err) {
      console.error('[core] world buildSteps error:', err);
      worldBuilt = true;
      onWorldBuildFinished();
      return true;
    }
    return false;
  }

  function ensureWorldBuilt() {
    if (worldBuilt || !buildIter) {
      worldBuilt = true;
      return;
    }
    try {
      while (true) {
        const res = buildIter.next();
        if (res.done) {
          worldBuilt = true;
          onWorldBuildFinished();
          break;
        }
      }
    } catch (err) {
      console.error('[core] ensureWorldBuilt error:', err);
      worldBuilt = true;
      onWorldBuildFinished();
    }
    ctx.loop?.resetClock?.();
  }
  ctx.ensureWorldBuilt = ensureWorldBuilt;

  // Characters & Plaza Crowd
  ctx.chars = createChars(ctx);
  ctx.crowdCtrl = ctx.chars?.crowd ? ctx.chars.crowd(ctx.scene, buildBleacherSeats()) : null;
  ctx.crowd = ctx.crowdCtrl;
  if (typeof ctx.chars?.crowd === 'function' && ctx.crowdCtrl) {
    ctx.chars.crowd.react = (kind) => ctx.crowdCtrl.react?.(kind);
    ctx.chars.crowd.update = (dt) => ctx.crowdCtrl.update?.(dt);
  }

  // Picker, Player, Areas, Rival, Quests
  ctx.pick = createPicker(ctx);
  ctx.player = createPlayer(ctx);
  ctx.areas = createAreas(ctx);
  ctx.rival = createRival(ctx);
  ctx.quests = createQuestManager(ctx);

  // Feedback & Collect Event Accounting (F3: feedback.dead === 0)
  let feedbackCounter = 0;
  let lastCollectFrame = -1;

  events.on('tap', () => {
    state.feedback.taps += 1;
  });

  events.on('feedback', (payload) => {
    feedbackCounter += 1;
    const kind = payload?.kind || 'walk';
    if (kind === 'walk' || kind === 'interact' || kind === 'blocked' || kind === 'collect') {
      state.feedback[kind] = (state.feedback[kind] || 0) + 1;
    }
    if (kind === 'collect') {
      lastCollectFrame = state.frame;
    }
    state.feedback.lastMs = state.timeMs;
  });

  events.on('collect', () => {
    if (lastCollectFrame !== state.frame) {
      state.feedback.collect += 1;
      state.feedback.lastMs = state.timeMs;
      lastCollectFrame = state.frame;
    }
  });

  // Tap routing with strict synchronous feedback guarantee (0 dead taps!)
  function dispatchHitTap(hit, sx = 0, sy = 0) {
    const safePos = hit?.pos || {
      x: ctx.player.pos.x,
      y: ctx.player.pos.y,
      z: ctx.player.pos.z,
    };
    const fbBefore = feedbackCounter;

    events.emit('tap', { sx, sy, hit });

    if (state.scene !== 'world') {
      if (feedbackCounter === fbBefore) {
        events.emit('feedback', { kind: 'blocked', pos: safePos });
      }
      return false;
    }

    // 1. Let active quest / beacon / passive hidden quests handle entity or in-range taps
    const questHandled = Boolean(ctx.quests?.onTap?.(hit));
    if (questHandled) {
      if (feedbackCounter === fbBefore) {
        events.emit('feedback', { kind: 'interact', pos: safePos });
      }
      return true;
    }

    // 2. Custom registered entity callback
    if (hit?.type === 'entity' && typeof hit.entity?.onTap === 'function') {
      if (ctx.player.isInRange(safePos, 2.5)) {
        hit.entity.onTap(hit, ctx);
        if (feedbackCounter === fbBefore) {
          events.emit('feedback', { kind: 'interact', pos: safePos });
        }
        return true;
      }
      const dest = ctx.player.walkTo(safePos, {
        maxSearchR: 6,
        allowClamp: true,
        target: hit,
        onArrive: () => {
          hit.entity.onTap(hit, ctx);
          events.emit('feedback', { kind: 'interact', pos: safePos });
        },
      });
      if (dest) {
        if (feedbackCounter === fbBefore) {
          events.emit('feedback', { kind: 'walk', pos: dest });
        }
        return true;
      }
    }

    // 3. Voxel block tap (#149 N2: walkable top OR nearestWalkable(hit.pos + normal, r <= 6) clamped to island)
    if (hit?.type === 'block') {
      const bx = Math.floor(safePos.x);
      const by = Math.floor(safePos.y);
      const bz = Math.floor(safePos.z);
      const nx = hit.normal?.x || 0;
      const ny = hit.normal?.y || 0;
      const nz = hit.normal?.z || 0;

      let dest = null;
      if (ny > 0 && ctx.world?.isWalkable?.(bx, by + 1, bz)) {
        dest = ctx.player.walkTo(
          { x: bx + 0.5, y: by + 1, z: bz + 0.5 },
          { maxSearchR: 0, allowClamp: false }
        );
      }
      if (!dest) {
        const adjPos = {
          x: bx + nx + 0.5,
          y: ctx.player.pos.y,
          z: bz + nz + 0.5,
        };
        dest = ctx.player.walkTo(adjPos, { maxSearchR: 6, allowClamp: true });
      }
      if (dest) {
        if (feedbackCounter === fbBefore) {
          events.emit('feedback', { kind: 'walk', pos: dest });
        }
        return true;
      }
    }

    // 4. Ground / inland water / sky / far / unhandled entity -> walk on plane y=player.y clamped to island;
    //    ONLY ocean beyond the beach (where player is at coast or clicking open ocean off beach) = blocked wobble (#149 N2)
    if (
      hit?.type === 'ground' ||
      hit?.type === 'sky' ||
      hit?.type === 'ocean' ||
      hit?.type === 'entity'
    ) {
      const px = ctx.player.pos.x;
      const py = ctx.player.pos.y;
      const pz = ctx.player.pos.z;
      const gx = safePos.x;
      const gz = safePos.z;

      if (hit.type === 'ocean') {
        const dPlayer = Math.hypot(gx - px, gz - pz);
        const pullBack = Math.max(0, dPlayer - 3.0) / Math.max(0.1, dPlayer);
        const probeX = px + (gx - px) * pullBack;
        const probeZ = pz + (gz - pz) * pullBack;
        const probeSy = ctx.world?.surfaceY
          ? ctx.world.surfaceY(Math.floor(probeX), Math.floor(probeZ))
          : 0;
        if (dPlayer <= 13.5 && probeSy === 0) {
          if (feedbackCounter === fbBefore) {
            events.emit('feedback', { kind: 'blocked', pos: safePos });
          }
          return false;
        }
      }

      const dest = ctx.player.walkTo({ x: gx, y: py, z: gz }, { maxSearchR: 6, allowClamp: true });
      if (dest) {
        const movedDist = Math.hypot(dest.x - px, dest.z - pz);
        if (hit.type === 'ocean' && movedDist < 1.15) {
          ctx.player.stop();
          if (feedbackCounter === fbBefore) {
            events.emit('feedback', { kind: 'blocked', pos: safePos });
          }
          return false;
        }
        if (feedbackCounter === fbBefore) {
          events.emit('feedback', { kind: 'walk', pos: dest });
        }
        return true;
      }
    }

    // 5. Ocean beyond beach / out-of-bounds -> blocked wobble feedback
    if (feedbackCounter === fbBefore) {
      events.emit('feedback', { kind: 'blocked', pos: safePos });
    }
    return false;
  }

  function handleCanvasTap(clientX, clientY) {
    const hit = ctx.pick.pickScreen(clientX, clientY);
    return dispatchHitTap(hit, clientX, clientY);
  }

  // Beacon off-screen navigation guide & auto-walk hook (#149 N1, N3)
  function getBeaconGuide() {
    if (state.scene !== 'world') return null;
    ensureWorldBuilt();
    const activeId = ctx.quests?.activeId?.() || null;
    const nextId = activeId || ctx.quests?.next?.() || null;
    if (!nextId) return null;

    const list = ctx.quests?.targets ? ctx.quests.targets() : [];
    const beaconTarget =
      list.find((t) => String(t.id || '') === `beacon_${nextId}`) ||
      list.find((t) => String(t.id || '').startsWith('beacon_')) ||
      list[0] ||
      null;

    const pos = beaconTarget?.pos || state.quest?.pointer || null;
    if (!pos) return null;

    const scr = ctx.pick.worldToScreen(pos);
    const meta = ROSTER_BY_ID[nextId] || null;
    return {
      id: beaconTarget?.id || `beacon_${nextId}`,
      targetId: beaconTarget?.id || `beacon_${nextId}`,
      questId: nextId,
      contestantId: meta?.id || nextId,
      name: meta?.name || beaconTarget?.label || nextId,
      pos: { x: pos.x, y: pos.y ?? 8, z: pos.z },
      sx: scr.sx,
      sy: scr.sy,
      onScreen: Boolean(scr.onScreen),
      visible: Boolean(scr.onScreen),
      angle: scr.angle ?? 0,
    };
  }

  function walkToBeacon() {
    if (state.scene !== 'world') return false;
    ensureWorldBuilt();
    const list = ctx.quests?.targets ? ctx.quests.targets() : [];
    const beaconTarget =
      list.find((t) => String(t.id || '').startsWith('beacon_')) ||
      list[0] ||
      null;

    if (beaconTarget) {
      const scr = ctx.pick.worldToScreen(beaconTarget.pos);
      const hit = {
        type: 'entity',
        kind: beaconTarget.kind || 'entity',
        id: beaconTarget.id,
        targetId: beaconTarget.id,
        pos: { ...beaconTarget.pos },
        target: beaconTarget,
        fromBeaconArrow: true,
      };
      const ok = dispatchHitTap(hit, scr.sx, scr.sy);
      if (!ctx.player.isMoving() && beaconTarget.pos) {
        const d = Math.hypot(beaconTarget.pos.x - ctx.player.pos.x, beaconTarget.pos.z - ctx.player.pos.z);
        if (d > 2.2) {
          ctx.player.walkTo(
            { x: beaconTarget.pos.x, y: ctx.player.pos.y, z: beaconTarget.pos.z },
            { maxSearchR: 6, allowClamp: true }
          );
        }
      }
      return ok || ctx.player.isMoving();
    }

    const guide = getBeaconGuide();
    if (guide?.pos) {
      const dest = ctx.player.walkTo(
        { x: guide.pos.x, y: ctx.player.pos.y, z: guide.pos.z },
        { maxSearchR: 6, allowClamp: true }
      );
      if (dest) {
        events.emit('feedback', { kind: 'walk', pos: dest });
        return true;
      }
    }
    return false;
  }

  ctx.dispatchHitTap = dispatchHitTap;
  ctx.handleCanvasTap = handleCanvasTap;
  ctx.getBeaconGuide = getBeaconGuide;
  ctx.walkToBeacon = walkToBeacon;

  // Runway / Booth Actor Controller (cached per contestantId for 0-drift GPU memory across quest cycles)
  const runwayActorCache = new Map();
  let runwayActor = null;
  let activeBoothContestantId = null;
  let flowToken = 0;
  let lastReactionSig = '';

  function cleanupRunwayActor() {
    if (runwayActor) {
      runwayActor.stopMove?.();
      runwayActor.setEmote?.(null);
      runwayActor._posedOnce = false;
      if (runwayActor.group?.parent) {
        runwayActor.group.parent.remove(runwayActor.group);
      }
    }
    runwayActor = null;
    activeBoothContestantId = null;
    ctx.runwayActor = null;
    ctx.activeContestant = null;
  }

  function spawnRunwayActor(contestantId) {
    cleanupRunwayActor();
    activeBoothContestantId = contestantId;
    const stageY = ctx.world?.surfaceY?.(48, 54) ?? 8;
    let actor = runwayActorCache.get(contestantId) || null;
    if (!actor) {
      actor = ctx.chars?.create?.(contestantId, { id: contestantId }) || null;
      if (actor) runwayActorCache.set(contestantId, actor);
    }
    runwayActor = actor;
    if (runwayActor?.group) {
      runwayActor._posedOnce = false;
      runwayActor.clearAccessories?.();
      runwayActor.setEmote?.(null);
      runwayActor.setVisible?.(true);
      runwayActor.group.position.set(48, stageY, 51.0);
      ctx.scene.add(runwayActor.group);
      runwayActor.lookAt?.({ x: 48, y: stageY, z: 65 });
      runwayActor.moveTo?.({ x: 48, y: stageY, z: 54.8 }, 2.2);
      runwayActor.setAnim?.('walk');
    }
    ctx.runwayActor = runwayActor;
    ctx.activeContestant = runwayActor;
    return runwayActor;
  }

  function saveStateProgress() {
    recomputeStars(state);
    ctx.ui?.progress?.saveFromState?.(state, {
      portraits: { ...(state._portraits || {}) },
    });
  }

  function syncWallAndCapesFromState() {
    for (const [cid, c] of Object.entries(state.contestants || {})) {
      if (c.met) {
        ctx.chars?.capes?.reveal?.(cid);
      }
    }
    for (const [cid, tier] of Object.entries(state.board || {})) {
      if (!tier) continue;
      const pUrl = state._portraits?.[cid] || ctx.ui?.progress?.getPortrait?.(cid) || null;
      ctx.world?.boardWall?.setPortrait?.(cid, pUrl, tier);
    }
  }

  function restoreProgressIntoState(saved) {
    if (!saved || typeof saved !== 'object') return false;
    if (saved.seed !== undefined) {
      state.seed = normalizeSeedNumber(saved.seed);
      ctx.rng.reset(state.seed);
    }
    if (saved.elapsedMs !== undefined) {
      state.elapsedMs = Math.max(0, Number(saved.elapsedMs) || 0);
      state._runFrames = Math.round((state.elapsedMs / 1000) * 60);
    }
    if (saved.portraits && typeof saved.portraits === 'object') {
      Object.assign(state._portraits, saved.portraits);
    }
    if (saved.quests && typeof saved.quests === 'object') {
      for (const [qid, qData] of Object.entries(saved.quests)) {
        if (!state.quests[qid]) continue;
        if (typeof qData === 'string') {
          state.quests[qid].status = qData === 'active' ? 'available' : qData;
        } else if (qData && typeof qData === 'object') {
          const st = qData.status === 'active' ? 'available' : qData.status || state.quests[qid].status;
          state.quests[qid].status = st;
          state.quests[qid].ms = Number(qData.ms) || 0;
          state.quests[qid].gags = Array.isArray(qData.gags) ? [...qData.gags] : [];
        }
      }
    }
    // Ensure at least the next undone main quest is unlocked
    for (const qid of MAIN_QUEST_IDS) {
      if (state.quests[qid]?.status !== 'done') {
        if (state.quests[qid].status === 'locked') {
          state.quests[qid].status = 'available';
        }
        break;
      }
    }
    if (saved.contestants && typeof saved.contestants === 'object') {
      for (const [cid, cData] of Object.entries(saved.contestants)) {
        if (!state.contestants[cid] || !cData) continue;
        state.contestants[cid].met = Boolean(cData.met);
        state.contestants[cid].found = Boolean(cData.found);
        state.contestants[cid].accessories = Array.isArray(cData.accessories) ? [...cData.accessories] : [];
        state.contestants[cid].tier = cData.tier || null;
        state.contestants[cid].portrait = Boolean(cData.portrait || state._portraits[cid]);
      }
    }
    if (saved.board && typeof saved.board === 'object') {
      state.board = { ...saved.board };
      for (const [cid, tier] of Object.entries(state.board)) {
        if (state.contestants[cid]) {
          state.contestants[cid].tier = tier;
          state.contestants[cid].met = true;
          if (state._portraits[cid]) state.contestants[cid].portrait = true;
        }
      }
    }
    if (saved.rival && typeof saved.rival === 'object') {
      state.rival.appearances = Array.isArray(saved.rival.appearances) ? [...saved.rival.appearances] : [];
      state.rival.stealDone = Boolean(saved.rival.stealDone);
      state.rival.rescued = Boolean(saved.rival.rescued);
    }
    recomputeStars(state);
    if (worldBuilt) {
      syncWallAndCapesFromState();
    }
    return true;
  }

  function triggerTierReactions(contestantId, tier, { fxAlreadyHandled = false } = {}) {
    const validTier = TIERS.some((t) => t.id === tier) ? tier : 'perfect';
    const sig = `${contestantId}:${validTier}:${state.frame}`;
    if (sig === lastReactionSig) return;
    lastReactionSig = sig;

    const stageY = ctx.world?.surfaceY?.(48, 54) ?? 8;
    const stagePos = { x: 48, y: stageY + 1.0, z: 54.8 };
    runwayActor?.lookAt?.({ x: 48, y: stageY, z: 65 });

    if (validTier === 'perfect') {
      // §8.3 & F13: 完美 -> fanfare, confetti >= 150, 3 fireworks, crowd jumps
      if (!fxAlreadyHandled) {
        ctx.fx?.confetti?.('screen', 165);
        ctx.fx?.fireworks?.({ x: 45, y: 13, z: 42 }, 1);
        ctx.fx?.fireworks?.({ x: 48, y: 14, z: 41 }, 1);
        ctx.fx?.fireworks?.({ x: 51, y: 13, z: 42 }, 1);
        events.emit('sfx', { name: 'fanfare' });
      }
      ctx.crowdCtrl?.react?.('jump');
      runwayActor?.setAnim?.(contestantId === 'kai' ? 'cry' : 'cheer');
    } else if (validTier === 'gorgeous') {
      if (!fxAlreadyHandled) {
        ctx.fx?.sparkles?.(stagePos, 32, { toPlayer: false });
        ctx.fx?.fireworks?.({ x: 46, y: 13, z: 42 }, 1);
        ctx.fx?.fireworks?.({ x: 50, y: 13, z: 42 }, 1);
        events.emit('sfx', { name: 'cheer' });
      }
      ctx.crowdCtrl?.react?.('cheer');
      runwayActor?.setAnim?.('happy');
    } else if (validTier === 'pretty') {
      if (!fxAlreadyHandled) {
        ctx.fx?.hearts?.(stagePos, 20);
        events.emit('sfx', { name: 'clap' });
      }
      ctx.crowdCtrl?.react?.('clap');
      runwayActor?.setAnim?.('pose');
    } else if (validTier === 'okay') {
      if (!fxAlreadyHandled) {
        ctx.fx?.hearts?.(stagePos, 10);
        events.emit('sfx', { name: 'aww' });
      }
      ctx.crowdCtrl?.react?.('aww');
      runwayActor?.setAnim?.('dance');
    } else {
      if (!fxAlreadyHandled) {
        ctx.fx?.sparkles?.(stagePos, 18, { toPlayer: false });
        events.emit('sfx', { name: 'cheer' });
      }
      ctx.crowdCtrl?.react?.('cheer');
      runwayActor?.setAnim?.(contestantId === 'kai' ? 'pushup' : 'flex');
    }
  }

  let suppressRankEventEcho = false;

  function applyRankInternal(
    contestantId,
    tier,
    { emitEvent = true, silent = false, closeBoard = false, fromRankEvent = false } = {}
  ) {
    if (!contestantId || !tier) return false;
    const validTier = TIERS.some((t) => t.id === tier) ? tier : 'perfect';

    state.board[contestantId] = validTier;
    if (state.contestants[contestantId]) {
      state.contestants[contestantId].met = true;
      state.contestants[contestantId].tier = validTier;
      if (!state._portraits[contestantId] && ctx.ui?.renderPortrait) {
        const rendered = ctx.ui.renderPortrait(
          ctx,
          contestantId,
          state.contestants[contestantId].accessories || []
        );
        if (rendered?.dataURL) {
          state._portraits[contestantId] = rendered.dataURL;
          ctx.ui?.progress?.setPortrait?.(contestantId, rendered.dataURL);
        }
      }
      state.contestants[contestantId].portrait = Boolean(
        state.contestants[contestantId].portrait || state._portraits[contestantId]
      );
    }

    const portraitUrl =
      state._portraits[contestantId] || ctx.ui?.progress?.getPortrait?.(contestantId) || null;
    ctx.world?.boardWall?.setPortrait?.(contestantId, portraitUrl, validTier);
    ctx.world?.boardWall?.highlight?.(validTier);

    recomputeStars(state);
    saveStateProgress();

    if (!silent) {
      triggerTierReactions(contestantId, validTier, { fxAlreadyHandled: fromRankEvent });
    }

    if (emitEvent) {
      suppressRankEventEcho = true;
      events.emit('rank', { id: contestantId, tier: validTier });
      suppressRankEventEcho = false;
    }

    if (closeBoard && state.scene === 'board') {
      ctx.ui?.boardDrop?.(contestantId, validTier);
      ctx.ui?.continue?.();
    }

    return true;
  }

  events.on('rank', (payload) => {
    if (suppressRankEventEcho) return;
    if (payload?.id && payload?.tier) {
      applyRankInternal(payload.id, payload.tier, { emitEvent: false, fromRankEvent: true });
    }
  });

  events.on('accessory', (payload) => {
    const cid = payload?.id || activeBoothContestantId;
    const accId = payload?.accessoryId;
    const slot = payload?.slot ?? 0;
    if (!cid || !accId) return;
    if (state.contestants[cid]) {
      const arr = [...(state.contestants[cid].accessories || [])];
      arr[slot] = accId;
      state.contestants[cid].accessories = arr.filter(Boolean);
    }
    runwayActor?.setAccessory?.(accId, slot);
  });

  function returnToWorld() {
    cleanupRunwayActor();
    if (ctx.player?.group) ctx.player.group.visible = true;
    state.scene = 'world';
    ctx.cam.clearFocus();
    ctx.cam.setMode('follow');
    ctx.ui?.hideTitle?.();
    ctx.ui?.hideFinal?.();
    ctx.ui?.showHUD?.(true);
    ctx.ui?.updateHUD?.(snapshotState(state));
    ctx.audio?.music?.(musicForArea(state.area));
    events.emit('sceneChange', { scene: 'world' });
  }

  async function enterBooth(contestantId) {
    ensureWorldBuilt();
    const myToken = ++flowToken;
    if (state.area !== 'hub') {
      ctx.areas.setArea('hub', { x: 48, y: 8, z: 62 }, { silent: true });
    } else {
      const py = ctx.world?.surfaceY?.(48, 62) ?? 8;
      ctx.player.setPosition(48, py, 62, { faceNorth: true });
    }
    if (ctx.player?.group) ctx.player.group.visible = false;

    state.scene = 'booth';
    ctx.ui?.hideTitle?.();
    ctx.ui?.showHUD?.(false);
    ctx.audio?.music?.('runway');

    const stageY = ctx.world?.surfaceY?.(48, 54) ?? 8;
    spawnRunwayActor(contestantId);
    ctx.crowdCtrl?.react?.('cheer');
    ctx.fx?.hearts?.({ x: 48, y: stageY + 1.5, z: 54.5 }, 14);
    ctx.cam.focus({ x: 48, y: stageY + 1.1, z: 54.5 }, { distance: 5.8, height: 1.9, yaw: 0, instant: true });

    events.emit('sceneChange', { scene: 'booth' });
    events.emit('boothStart', { id: contestantId });

    const boothRes = await ctx.ui.showBooth(contestantId);
    if (myToken !== flowToken) return null;

    const chosenAccs = Array.isArray(boothRes?.accessories)
      ? [...boothRes.accessories]
      : state.contestants[contestantId]?.accessories || [];
    let portraitUrl = boothRes?.portrait || state._portraits[contestantId] || null;
    if (!portraitUrl && ctx.ui?.renderPortrait) {
      portraitUrl = ctx.ui.renderPortrait(ctx, contestantId, chosenAccs)?.dataURL || null;
    }
    if (portraitUrl) {
      state._portraits[contestantId] = portraitUrl;
      ctx.ui?.progress?.setPortrait?.(contestantId, portraitUrl);
    }
    if (state.contestants[contestantId]) {
      state.contestants[contestantId].accessories = chosenAccs;
      state.contestants[contestantId].portrait = Boolean(portraitUrl);
    }
    saveStateProgress();
    return { accessories: chosenAccs, portrait: portraitUrl, token: myToken };
  }

  async function enterBoard({ newId = null, mode = 'view' } = {}) {
    ensureWorldBuilt();
    const myToken = flowToken;
    if (mode === 'rank' && ctx.player?.group) {
      ctx.player.group.visible = false;
    }
    state.scene = 'board';
    ctx.ui?.showHUD?.(false);
    events.emit('sceneChange', { scene: 'board' });
    const res = await ctx.ui.showBoard({ newId, mode });
    if (myToken !== flowToken) return null;
    if (res?.id && res?.tier) {
      applyRankInternal(res.id, res.tier, { emitEvent: false, silent: true });
    }
    if (mode === 'view' && state.scene === 'board') {
      returnToWorld();
    }
    return res;
  }

  async function runPostQuestPageantFlow(contestantId) {
    const boothOut = await enterBooth(contestantId);
    if (!boothOut) return;
    const myToken = boothOut.token;

    const boardRes = await enterBoard({ newId: contestantId, mode: 'rank' });
    if (myToken !== flowToken || !boardRes) return;

    if (boardRes?.tier) {
      applyRankInternal(boardRes.id || contestantId, boardRes.tier, { emitEvent: false, silent: true });
    }
    cleanupRunwayActor();

    // Check if all 10 main contestants are now ranked -> Finale -> Final screen (§8.5)
    const allMainRanked = MAIN_QUEST_IDS.every((mid) => Boolean(state.board[mid]));
    if (allMainRanked && !state._finaleDone) {
      state._finaleDone = true;
      if (ctx.player?.group) ctx.player.group.visible = false;
      ctx.audio?.music?.('finale');
      ctx.cam.focus({ x: 48, y: 9.2, z: 53.5 }, { distance: 6.8, height: 2.3, yaw: 0, instant: true });
      const finaleRes = await startFinale(ctx);
      if (myToken !== flowToken) return;
      if (finaleRes?.tier) {
        applyRankInternal('kai', finaleRes.tier, { emitEvent: false });
      }
      recomputeStars(state);
      saveStateProgress();
      events.emit('gameComplete', { stars: state.stars, timeMs: state.elapsedMs });

      state.scene = 'final';
      ctx.ui?.showHUD?.(false);
      events.emit('sceneChange', { scene: 'final' });
      ctx.ui?.showFinal?.();
      return;
    }

    // Show 1.5s NEXT picture-frame card for the next unranked main contestant (§8.4)
    const nextQuestId = ctx.quests?.next?.() || null;
    if (nextQuestId) {
      const nextCid = ROSTER_BY_ID[nextQuestId]?.id || nextQuestId;
      await ctx.ui?.showNext?.(nextCid);
      if (myToken !== flowToken) return;
    }

    returnToWorld();
  }

  events.on('questComplete', (payload) => {
    const cid = payload?.contestantId || payload?.id;
    if (!cid) return;
    saveStateProgress();
    runPostQuestPageantFlow(cid);
  });

  // Core Lifecycle Methods exposed on ctx for UI & Seam
  ctx.startGame = ({ seed, resume = false, replay = false, skipIntro = false } = {}) => {
    ensureWorldBuilt();
    flowToken += 1;
    lastReactionSig = '';
    lastCollectFrame = -1;
    ctx.loop.setPaused(false);
    ctx.ui?.cancelOverlays?.();
    cleanupRunwayActor();
    if (ctx._lineupActors) {
      for (const a of ctx._lineupActors) {
        if (a?.group?.parent) a.group.parent.remove(a.group);
      }
      ctx._lineupActors.length = 0;
    }
    if (ctx.player?.group) ctx.player.group.visible = true;

    if (resume && ctx.ui?.progress?.hasProgress?.()) {
      const saved = ctx.ui.progress.load();
      restoreProgressIntoState(saved);
    } else {
      const nextSeed =
        seed !== undefined
          ? normalizeSeedNumber(seed)
          : replay
            ? ((state.seed + 104729) >>> 0) || 1
            : state.seed;
      if (!replay) {
        ctx.ui?.progress?.clear?.();
      }
      ctx.world?.reset?.();
      ctx.chars?.capes?.reset?.();
      ctx.rng.reset(nextSeed);
      ctx.frame = 0;
      ctx.time = 0;
      resetStateInPlace(state, nextSeed, { keepBoardHistory: Boolean(replay) });
      ctx.fx?.clear?.();
      ctx.quests?.reset?.();
      ctx.rival?.leave?.();
      syncWallAndCapesFromState();
    }

    const spawn = ctx.world?.poi?.spawn || { x: 48, y: 8, z: 66 };
    const sy = ctx.world?.surfaceY?.(Math.floor(spawn.x), Math.floor(spawn.z)) ?? spawn.y ?? 8;
    ctx.areas.setArea('hub', { x: spawn.x, y: sy, z: spawn.z }, { silent: true });
    ctx.player.setPosition(spawn.x, sy, spawn.z, { faceNorth: true });

    state.scene = 'world';
    ctx.cam.clearFocus();
    ctx.cam.setYaw(0);
    ctx.cam.setMode('follow');
    ctx.cam.snap();

    ctx.ui?.hideTitle?.();
    ctx.ui?.hideFinal?.();
    ctx.ui?.showHUD?.(true);
    ctx.ui?.updateHUD?.(snapshotState(state));
    ctx.audio?.music?.('overworld');
    events.emit('sceneChange', { scene: 'world' });

    if (!skipIntro) {
      saveStateProgress();
    }
    return state;
  };

  ctx.continueHunt = () => {
    ctx.loop.setPaused(false);
    returnToWorld();
  };

  ctx.setPaused = (b) => {
    ctx.loop.setPaused(Boolean(b));
  };

  ctx.teleport = (questId) => {
    ensureWorldBuilt();
    if (state.scene === 'title') {
      ctx.startGame({ seed: state.seed, skipIntro: true });
    } else if (state.scene !== 'world') {
      flowToken += 1;
      ctx.ui?.cancelOverlays?.();
      returnToWorld();
    }
    return Boolean(ctx.quests?.teleport?.(questId));
  };

  ctx.completeQuest = (id) => {
    ensureWorldBuilt();
    const targetId = id || ctx.quests?.activeId?.() || ctx.quests?.next?.() || 'sheep';
    if (state.scene === 'title') {
      ctx.startGame({ seed: state.seed, skipIntro: true });
    }
    if (ctx.quests?.activeId?.() !== targetId && state.quests[targetId]?.status !== 'done') {
      ctx.quests?.activate?.(targetId);
    }
    return Boolean(ctx.quests?.complete?.(targetId));
  };

  ctx.rankContestant = (contestantId, tier, opts = {}) =>
    applyRankInternal(contestantId, tier, opts);

  ctx.enterBooth = enterBooth;
  ctx.enterBoard = enterBoard;

  ctx.boothChoose = (accId) => {
    if (ctx.ui?.boothChoose && ctx.ui.boothChoose(accId)) {
      return true;
    }
    if (activeBoothContestantId && accId) {
      events.emit('accessory', { id: activeBoothContestantId, accessoryId: accId, slot: 0 });
      return true;
    }
    return false;
  };

  ctx.boothSnap = () => Boolean(ctx.ui?.boothSnap?.());

  ctx.boardDrop = (contestantId, tier) => {
    if (ctx.ui?.boardDrop && ctx.ui.boardDrop(contestantId, tier)) {
      return true;
    }
    return applyRankInternal(contestantId, tier, { closeBoard: true });
  };

  ctx.continueFlow = () => {
    if (ctx.ui?.continue && ctx.ui.continue()) {
      return true;
    }
    if (state.scene === 'board' || state.scene === 'final') {
      returnToWorld();
      return true;
    }
    return false;
  };

  function onWorldBuildFinished() {
    ctx.world?.setArea?.(state.area || 'hub');
    const sp = ctx.world?.poi?.spawn || { x: 48, y: 8, z: 66 };
    const sy = ctx.world?.surfaceY?.(Math.floor(sp.x), Math.floor(sp.z)) ?? sp.y ?? 8;
    if (state.scene === 'title') {
      ctx.player.setPosition(sp.x, sy, sp.z, { faceNorth: true });
    }
    syncWallAndCapesFromState();
  }

  // Instantiate UI after ctx hooks exist
  ctx.ui = createUI(ctx);

  // Restore saved progress into state on reload so F14 holds immediately + via 继续
  if (!debugParams.hasSeed && ctx.ui?.progress?.hasProgress?.()) {
    restoreProgressIntoState(ctx.ui.progress.load());
  }

  // Show title initially unless debug URL params jump directly into play
  ctx.ui.showTitle();
  ctx.ui.showHUD(false);

  // Terrain cutaway uniform driver (#144: uCutA=camPos, uCutB=playerHead, uCutR=2.2, minY=player.y+0.6; off in booth/cutscenes)
  const cutHeadPos = { x: 48, y: 9.3, z: 66 };
  function syncCutawayUniforms() {
    if (!ctx.world?.setCutaway) return;
    const active =
      state.scene === 'world' &&
      ctx.cam?.mode === 'follow' &&
      (!ctx.player?.group || ctx.player.group.visible !== false);
    if (active) {
      const py = state.player.y ?? 8;
      cutHeadPos.x = state.player.x ?? 48;
      cutHeadPos.y = py + 1.3;
      cutHeadPos.z = state.player.z ?? 66;
      ctx.world.setCutaway(ctx.camera.position, cutHeadPos, 2.2, Math.max(8.6, py + 0.6));
    } else {
      ctx.world.setCutaway(null, null, 0.0, 9999.0);
    }
  }

  // Create Input & Fixed-Step Loop
  createInput(ctx);

  ctx.loop = createLoop({
    ctx,
    onSlice: drainBuildSlice,
    onStep(dt) {
      if (state.scene === 'world') {
        ctx.player.update(dt);
        ctx.areas.update(dt);
        ctx.quests?.update?.(dt);
        ctx.rival?.update?.(dt);
      } else if (state.scene === 'booth' || state.scene === 'board' || state.scene === 'finale') {
        if (runwayActor) {
          runwayActor.update?.(dt);
          if (
            runwayActor.group &&
            Math.abs(runwayActor.group.position.z - 54.8) < 0.18 &&
            runwayActor._posedOnce !== true
          ) {
            const stageY = ctx.world?.surfaceY?.(48, 54) ?? 8;
            runwayActor._posedOnce = true;
            runwayActor.lookAt?.({ x: 48, y: stageY, z: 65 });
            runwayActor.setAnim?.('pose');
          }
        }
        ctx.rival?.update?.(dt);
      }

      ctx.chars?.update?.(dt);
      ctx.crowdCtrl?.update?.(dt);
      ctx.world?.update?.(dt);
      ctx.fx?.update?.(dt);
      ctx.cam.update(dt);
      ctx.ui?.update?.(dt);

      // Update HUD in world scene every 6 frames (10 Hz) to avoid DOM churn
      if (state.scene === 'world' && state.frame % 6 === 0) {
        ctx.ui?.updateHUD?.(snapshotState(state));
        ctx.ui?.updateBeacon?.(getBeaconGuide());
      } else if (state.scene !== 'world' && state.frame % 6 === 0) {
        ctx.ui?.updateBeacon?.(null);
      }

      syncCutawayUniforms();
    },
    onRender() {
      syncCutawayUniforms();
      ctx.renderer.render(ctx.scene, ctx.camera);
    },
  });

  // Expose frozen window.__PAGEANT__ seam (§3.9)
  createSeam(ctx);

  // Resize handler
  window.addEventListener('resize', () => {
    sceneSetup.resize();
    ctx.cam.resize();
  });

  // Apply URL debug parameters (?seed=, ?quest=, ?scene=, ?area=)
  if (debugParams.hasAny) {
    ensureWorldBuilt();
    await applyDebugParams(ctx, debugParams);
  }

  ctx.loop.start();
}

boot();
