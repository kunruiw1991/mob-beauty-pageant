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
  if (typeof ctx.chars?.create === 'function') {
    const rawCreateChar = ctx.chars.create.bind(ctx.chars);
    ctx.chars.create = (kind, opts = {}) => {
      const actor = rawCreateChar(kind, opts);
      if (actor?.group) {
        actor.group.userData._actorKind = kind;
        actor.group.userData._actorId = opts?.id || kind;
      }
      return actor;
    };
  }
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

  // #155 G1 GAG CAM: 1.4 s reaction cut (dist ~5.8, zoom-in punch, large emote bubble, quest sim paused)
  const GAG_EMOTES = {
    sheep_eats_bouquet: '😋🌸',
    kai_bounced: '💦😱',
    slime_pet: '💚✨',
    cat_gift_kai_hat: '😼🎩',
    fake_iron: '💢🪨',
    kai_hogs_pumpkins: '🎃😜',
    snow_head_pop: '🎃❗',
    kai_snowman: '⛄🥶',
    creeper_confetti: '🎉💥',
    kai_honey: '🍯😫',
    kai_steal: '😈💨',
    kai_cake_face: '🎂😵',
    wither_three_hats: '🎩👑',
    skeleton_bald: '💀😳',
    sneeze_balloon: '🎈🤧',
    emerald_eyes: '💎🤩',
    kai_faint: '💫😵',
    egg_hop: '🥚💨',
    pink_dye: '🌷💖',
  };

  const gagBubbleCanvas = document.createElement('canvas');
  gagBubbleCanvas.width = 256;
  gagBubbleCanvas.height = 256;
  const gagBubbleCtx = gagBubbleCanvas.getContext('2d');
  const gagBubbleTex = new THREE.CanvasTexture(gagBubbleCanvas);
  gagBubbleTex.colorSpace = THREE.SRGBColorSpace;
  const gagBubbleMat = new THREE.SpriteMaterial({
    map: gagBubbleTex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const gagBubbleSprite = new THREE.Sprite(gagBubbleMat);
  gagBubbleSprite.visible = false;
  gagBubbleSprite.renderOrder = 950;
  ctx.scene.add(gagBubbleSprite);

  function drawGagBubbleEmoji(emojiText) {
    if (!gagBubbleCtx) return;
    const g = gagBubbleCtx;
    g.clearRect(0, 0, 256, 256);

    // Comic speech bubble with tail + bold dark outline + golden inner rim
    const bx = 18;
    const by = 22;
    const bw = 220;
    const bh = 166;
    const br = 44;

    const traceBubble = (pad = 0) => {
      const x = bx - pad;
      const y = by - pad;
      const w = bw + pad * 2;
      const h = bh + pad * 2;
      const r = br + pad * 0.6;
      g.beginPath();
      g.moveTo(x + r, y);
      g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      // Tail on bottom-left pointing diagonally toward character's head
      g.lineTo(108 + pad * 0.4, y + h);
      g.lineTo(54 - pad * 0.8, 228 + pad * 1.1);
      g.lineTo(72 - pad * 0.4, y + h);
      g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.closePath();
    };

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.38)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 6;
    traceBubble(6);
    g.fillStyle = '#1d1526';
    g.fill();
    g.restore();

    traceBubble(0);
    g.fillStyle = '#fffdf4';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = '#ffbe0b';
    g.stroke();

    g.font = '82px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emojiText || '❗😄', 128, 108);
    gagBubbleTex.needsUpdate = true;
  }

  const gagQueue = [];
  const gagTempBox = new THREE.Box3();
  const gagPropRaycaster = new THREE.Raycaster();
  const gagRayOrigin = new THREE.Vector3();
  const gagRayDir = new THREE.Vector3();
  let gagCamRemaining = 0;
  let gagCamDuration = 1.4;
  let gagCamElapsed = 0;
  let gagCamFrame = -1;
  let gagCamAnchor = { x: 48, y: 8, z: 48 };
  let gagSubjectGroup = null;
  let gagCharHeight = 2.2;

  function evaluatePlayerSightline(candYaw, focusPos, dist) {
    const px = ctx.player?.pos?.x;
    const pz = ctx.player?.pos?.z;
    if (!Number.isFinite(px) || !Number.isFinite(pz)) {
      return { occluded: false, hardOccluded: false, playerDistXZ: 99, dPerp: 99, signedRight: -2 };
    }
    const playerDistXZ = Math.hypot(px - focusPos.x, pz - focusPos.z);
    const cx = focusPos.x + Math.sin(candYaw) * dist;
    const cz = focusPos.z + Math.cos(candYaw) * dist;
    const vx = focusPos.x - cx;
    const vz = focusPos.z - cz;
    const len2 = vx * vx + vz * vz || 1;
    // t along camera(0) -> subject(1)
    const t = ((px - cx) * vx + (pz - cz) * vz) / len2;
    // Camera-right unit vector in XZ is (cos(yaw), -sin(yaw))
    const signedRight =
      (px - focusPos.x) * Math.cos(candYaw) - (pz - focusPos.z) * Math.sin(candYaw);
    const dPerp = Math.abs(signedRight);
    const betweenCamAndSubject = t > 0.06 && t < 1.06;
    const noseToNose = playerDistXZ < 1.45;
    return {
      occluded: betweenCamAndSubject && dPerp < 1.45,
      hardOccluded: noseToNose || (betweenCamAndSubject && dPerp < 1.28),
      playerDistXZ,
      dPerp,
      signedRight,
      t,
    };
  }

  function pickClearGagYaw(focusPos, dist = 7.1, height = 2.25, subjectGroup = null) {
    const camYaw = ctx.cam?.yaw ?? 0;
    const hasSubjectYaw = Boolean(subjectGroup && Number.isFinite(subjectGroup.rotation?.y));
    const refYaw = hasSubjectYaw ? subjectGroup.rotation.y : camYaw;

    // 16 candidate angles around the subject (including crisp ±45° / ±65° 3/4 front shots)
    const offsets = [
      0,
      0.78,
      -0.78,
      1.12,
      -1.12,
      0.48,
      -0.48,
      1.48,
      -1.48,
      1.88,
      -1.88,
      2.35,
      -2.35,
      Math.PI,
    ];

    // Collect large opaque quest prop meshes once per Gag-Cam cut (e.g. stall boards/walls)
    const propOccluders = [];
    if (ctx.scene?.children) {
      for (const ch of ctx.scene.children) {
        if (
          !ch ||
          !ch.visible ||
          ch === ctx.world?.group ||
          ch === ctx.player?.group ||
          ch === gagBubbleSprite ||
          ch.userData?._actorKind
        ) {
          continue;
        }
        ch.traverse?.((node) => {
          if (
            node?.visible &&
            node.isMesh &&
            !node.isInstancedMesh &&
            node.geometry &&
            node.material &&
            !node.material.transparent
          ) {
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            const bb = node.geometry.boundingBox;
            if (bb) {
              const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
              if (span >= 1.1) propOccluders.push(node);
            }
          }
        });
      }
    }

    let bestYaw = camYaw;
    let bestScore = -Infinity;

    for (const off of offsets) {
      let cand = refYaw + off;
      while (cand > Math.PI) cand -= Math.PI * 2;
      while (cand < -Math.PI) cand += Math.PI * 2;

      const cx = focusPos.x + Math.sin(cand) * dist;
      const cy = focusPos.y + height;
      const cz = focusPos.z + Math.cos(cand) * dist;

      let score = 0;
      const dx = focusPos.x - cx;
      const dy = focusPos.y - cy;
      const dz = focusPos.z - cz;
      const len = Math.hypot(dx, dy, dz) || 1;

      // 1. World block + large prop-board line-of-sight check
      let worldBlocked = false;
      if (typeof ctx.world?.raycast === 'function') {
        const hit = ctx.world.raycast(
          { x: cx, y: cy, z: cz },
          { x: dx / len, y: dy / len, z: dz / len },
          Math.max(0.5, len - 0.85)
        );
        if (hit) {
          worldBlocked = true;
          const hitDist = Math.hypot(
            hit.pos.x + 0.5 - cx,
            hit.pos.y + 0.5 - cy,
            hit.pos.z + 0.5 - cz
          );
          score -= 1000 - hitDist * 40;
        }
      }
      if (!worldBlocked && propOccluders.length > 0) {
        gagRayOrigin.set(cx, cy, cz);
        gagRayDir.set(dx / len, dy / len, dz / len);
        gagPropRaycaster.near = 0.2;
        gagPropRaycaster.far = Math.max(0.5, len - 0.55);
        gagPropRaycaster.set(gagRayOrigin, gagRayDir);
        const propHits = gagPropRaycaster.intersectObjects(propOccluders, false);
        if (propHits.length > 0) {
          worldBlocked = true;
          score -= 750;
        }
      }
      if (!worldBlocked) {
        score += 100;
      }

      // 2. Avoid player chibi head blocking camera -> subject sightline (#175).
      // If player is nose-to-nose (< 1.45b), player is temporarily hidden during the 1.4s close-up
      // so we keep the clean front shot instead of spinning 180° behind the subject's backdrop!
      const pCheck = evaluatePlayerSightline(cand, focusPos, dist);
      if (pCheck.playerDistXZ >= 1.45) {
        if (pCheck.occluded) {
          score -= 420 * (1.55 - pCheck.dPerp);
        } else {
          score += 40;
          // Prefer player on camera-LEFT (< 0) so camera-RIGHT emote bubble stays 100% clear
          if (pCheck.signedRight < -0.35) {
            score += 12;
          }
        }
      }

      // 3. Prefer seeing the gag subject's front / 3/4 face + mild continuity with current camYaw
      if (hasSubjectYaw) {
        score += Math.cos(cand - subjectGroup.rotation.y) * 26;
      }
      score += Math.cos(cand - camYaw) * 8;

      if (score > bestScore) {
        bestScore = score;
        bestYaw = cand;
      }
    }
    return bestYaw;
  }

  function resolveGagWorldPos(payload) {
    const p = payload?.pos;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      const sy = Number.isFinite(p.y)
        ? p.y
        : (ctx.world?.surfaceY?.(Math.floor(p.x), Math.floor(p.z)) ?? 8);
      return { x: p.x, y: sy, z: p.z };
    }
    const gid = String(payload?.gagId || '');
    if (gid.startsWith('kai_') && Number.isFinite(state.rival?.x) && (state.rival.x || state.rival.z)) {
      const ry = ctx.world?.surfaceY?.(Math.floor(state.rival.x), Math.floor(state.rival.z)) ?? 8;
      return { x: state.rival.x, y: ry, z: state.rival.z };
    }
    if (state.quest?.pointer) {
      return {
        x: state.quest.pointer.x,
        y: state.quest.pointer.y ?? 8,
        z: state.quest.pointer.z,
      };
    }
    return {
      x: ctx.player.pos.x,
      y: ctx.player.pos.y,
      z: ctx.player.pos.z,
    };
  }

  let gagCamYaw = 0;

  function findGagSubjectObject(gagId, questId, worldPos) {
    if (!ctx.scene?.children) return null;
    const gid = String(gagId || '');
    const preferredKind = gid.startsWith('kai_')
      ? 'kai'
      : gid === 'fake_iron'
        ? 'bela'
        : gid === 'emerald_eyes'
          ? 'villager'
          : gid === 'snow_head_pop'
            ? 'snowGolemMob'
            : gid === 'skeleton_bald'
              ? 'witherSkeleton'
              : questId || null;

    let bestPreferred = null;
    let bestPrefDist = Infinity;
    let bestAnyActor = null;
    let bestAnyDist = Infinity;

    for (const ch of ctx.scene.children) {
      if (
        !ch ||
        !ch.visible ||
        ch === ctx.player?.group ||
        ch === gagBubbleSprite ||
        !ch.isGroup
      ) {
        continue;
      }
      const kind = ch.userData?._actorKind || null;
      if (!kind) continue;
      const d = Math.hypot(ch.position.x - worldPos.x, ch.position.z - worldPos.z);
      if (d > 9.0) continue;
      if (
        preferredKind &&
        (kind === preferredKind || (preferredKind === 'witherSkeleton' && kind === 'skeletonMob')) &&
        d < bestPrefDist
      ) {
        bestPrefDist = d;
        bestPreferred = ch;
      }
      if (d < bestAnyDist) {
        bestAnyDist = d;
        bestAnyActor = ch;
      }
    }
    return bestPreferred || bestAnyActor;
  }

  function computeVisibleTopY(root, baseY) {
    let topY = baseY + 2.15;
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || !node.visible) continue;
      if (node.isMesh && node.geometry) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        gagTempBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
        if (Number.isFinite(gagTempBox.max.y) && gagTempBox.max.y > topY) {
          topY = gagTempBox.max.y;
        }
      }
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) stack.push(node.children[i]);
      }
    }
    return Math.min(baseY + 3.6, topY);
  }

  function computeGagFramingFromSubject() {
    let sx = gagCamAnchor.x;
    let sy = gagCamAnchor.y;
    let sz = gagCamAnchor.z;
    let charH = 2.15;

    if (gagSubjectGroup && gagSubjectGroup.parent && gagSubjectGroup.visible) {
      gagSubjectGroup.updateMatrixWorld(true);
      sx = gagSubjectGroup.position.x;
      sy = gagSubjectGroup.position.y;
      sz = gagSubjectGroup.position.z;
      charH = Math.max(1.8, computeVisibleTopY(gagSubjectGroup, sy) - sy);
    }
    gagCharHeight = charH;

    // #165: Frame whole body — look-at = subject + 0.9 up (auto-lifting for >2.15b tall/pop-in-stretched rigs),
    // dist ~7.05 so head top stays <=1.25b above look-at (strictly >= 20% from top, well below 12% HUD band) at all 4 viewports!
    const lookUp = Math.max(0.9, charH - 1.25);
    const dist = Math.max(7.05, 4.9 + charH * 0.95);
    return {
      sx,
      sy,
      sz,
      charH,
      focusTarget: { x: sx, y: sy + lookUp, z: sz },
      dist,
      height: 2.25,
    };
  }

  function updateGagBubbleTransform(framing = null) {
    const f = framing || computeGagFramingFromSubject();
    // Place large comic bubble to camera-right at chest/shoulder height so it stays well below top HUD band
    const rightX = Math.cos(gagCamYaw);
    const rightZ = -Math.sin(gagCamYaw);
    const popT = Math.min(1, gagCamElapsed / 0.22);
    const bounce =
      popT < 1
        ? 0.4 + Math.sin(popT * Math.PI * 0.78) * 1.45
        : 1.65 + Math.sin(gagCamElapsed * 8.0) * 0.06;
    gagBubbleSprite.scale.set(bounce, bounce, 1);
    gagBubbleSprite.position.set(
      f.sx + rightX * 1.42,
      f.sy + Math.min(1.55, f.charH * 0.65) + Math.sin(gagCamElapsed * 6.5) * 0.06,
      f.sz + rightZ * 1.42
    );
  }

  function startSingleGagCut(gagId, worldPos, durationSec = 1.4, questId = null) {
    gagCamDuration = durationSec;
    gagCamRemaining = durationSec;
    gagCamElapsed = 0;
    const groundY =
      ctx.world?.surfaceY?.(Math.floor(worldPos.x), Math.floor(worldPos.z)) ?? worldPos.y ?? 8;
    // Normalize anchor to subject feet/base (emitGag often passes y+0.9 or water surface)
    const baseY = Math.min(worldPos.y ?? groundY, groundY + 0.2);
    gagCamAnchor = { x: worldPos.x, y: baseY, z: worldPos.z };
    gagSubjectGroup = findGagSubjectObject(gagId, questId || state.quest?.id, gagCamAnchor);
    state.gagCam.active = true;

    const f = computeGagFramingFromSubject();
    const clearYaw = pickClearGagYaw(f.focusTarget, f.dist, f.height, gagSubjectGroup);
    gagCamYaw = clearYaw;
    if (
      gagSubjectGroup &&
      gagId !== 'skeleton_bald' &&
      gagId !== 'fake_iron' &&
      Number.isFinite(gagSubjectGroup.rotation?.y) &&
      Math.cos(clearYaw - gagSubjectGroup.rotation.y) < 0.55
    ) {
      gagSubjectGroup.rotation.y = clearYaw - 0.25;
    }
    if (ctx.player?.group && state.scene === 'world') {
      const pSight = evaluatePlayerSightline(clearYaw, f.focusTarget, f.dist);
      ctx.player.group.visible = !pSight.hardOccluded;
    }
    ctx.cam.focus(f.focusTarget, {
      distance: f.dist,
      height: f.height,
      yaw: clearYaw,
      zoomPunch: 0.9,
      instant: true,
      manualClearOnly: true,
    });

    drawGagBubbleEmoji(GAG_EMOTES[gagId] || '❗😄');
    updateGagBubbleTransform(f);
    gagBubbleSprite.visible = true;
  }

  function clearGagCam({ restoreFollow = false } = {}) {
    gagQueue.length = 0;
    gagCamRemaining = 0;
    gagCamElapsed = 0;
    gagCamFrame = -1;
    gagSubjectGroup = null;
    if (state.gagCam) {
      state.gagCam.active = false;
    }
    gagBubbleSprite.visible = false;
    if (state.scene === 'world' && ctx.player?.group) {
      ctx.player.group.visible = true;
    }
    if (restoreFollow && state.scene === 'world') {
      ctx.cam.clearFocus();
    }
  }

  events.on('gag', (payload) => {
    const gagId = String(payload?.gagId || 'gag');
    if (!state.gagCam) {
      state.gagCam = { count: 0, lastGag: null, active: false };
    }
    state.gagCam.count = (state.gagCam.count | 0) + 1;
    state.gagCam.lastGag = gagId;

    if (state.scene !== 'world') return;

    const gPos = resolveGagWorldPos(payload);
    if (gagCamRemaining > 0 && gagCamFrame === state.frame) {
      // Back-to-back synchronous gags (e.g. villager emerald_eyes + kai_faint):
      // give each its own fast centered zoom-punch reaction cut so neither is missed!
      gagCamRemaining = Math.min(gagCamRemaining, 0.85);
      gagCamDuration = gagCamRemaining;
      gagQueue.push({ gagId, questId: payload?.questId || null, pos: gPos, duration: 0.95 });
      return;
    }

    gagQueue.length = 0;
    gagCamFrame = state.frame;
    startSingleGagCut(gagId, gPos, 1.4, payload?.questId || null);
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

    if (state.gagCam?.active && !hit?.fromAgent) {
      if (feedbackCounter === fbBefore) {
        events.emit('feedback', { kind: 'interact', pos: safePos });
      }
      return true;
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
      const movingNow = Boolean(ctx.player?.isMoving?.() || state.player?.moving);
      if (!movingNow && beaconTarget.pos) {
        const d = Math.hypot(beaconTarget.pos.x - ctx.player.pos.x, beaconTarget.pos.z - ctx.player.pos.z);
        if (d > 2.2) {
          ctx.player.walkTo(
            { x: beaconTarget.pos.x, y: ctx.player.pos.y, z: beaconTarget.pos.z },
            { maxSearchR: 6, allowClamp: true }
          );
        }
      }
      return ok || Boolean(ctx.player?.isMoving?.() || state.player?.moving);
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
    clearGagCam({ restoreFollow: false });
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
    clearGagCam({ restoreFollow: false });
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
    clearGagCam({ restoreFollow: false });
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
    flowToken += 1;
    ctx.ui?.cancelOverlays?.();
    ctx.loop.setPaused(false);
    returnToWorld();
  };

  ctx.setPaused = (b) => {
    ctx.loop.setPaused(Boolean(b));
  };

  ctx.teleport = (questId) => {
    ensureWorldBuilt();
    clearGagCam({ restoreFollow: true });
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

  // Terrain cutaway uniform driver (#144 + #155 G1/G2: clears obstructions in both follow AND world focus cuts)
  const cutHeadPos = { x: 48, y: 9.3, z: 66 };
  function syncCutawayUniforms() {
    if (!ctx.world?.setCutaway) return;
    if (state.scene === 'world' && ctx.cam?.mode === 'focus' && ctx.cam?.target) {
      cutHeadPos.x = ctx.cam.target.x;
      cutHeadPos.y = ctx.cam.target.y + 0.35;
      cutHeadPos.z = ctx.cam.target.z;
      ctx.world.setCutaway(
        ctx.camera.position,
        cutHeadPos,
        2.6,
        Math.max(8.5, ctx.cam.target.y - 0.3)
      );
      return;
    }
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
        ctx.areas.update(dt);
        ctx.rival?.update?.(dt);
        if (gagCamRemaining > 0) {
          // #155 G1 + #165: pause quest sim & player walk during 1.4 s Gag Cam, live-track subject full body!
          gagCamRemaining -= dt;
          gagCamElapsed += dt;
          const f = computeGagFramingFromSubject();
          if (ctx.player?.group) {
            ctx.player.group.visible = !evaluatePlayerSightline(
              gagCamYaw,
              f.focusTarget,
              f.dist
            ).hardOccluded;
          }
          ctx.cam.updateFocusTarget?.(f.focusTarget, { distance: f.dist, height: f.height });
          updateGagBubbleTransform(f);
          if (gagCamRemaining <= 0) {
            if (gagQueue.length > 0) {
              const nextGag = gagQueue.shift();
              startSingleGagCut(nextGag.gagId, nextGag.pos, nextGag.duration || 0.95, nextGag.questId);
            } else {
              clearGagCam({ restoreFollow: true });
            }
          }
        } else {
          ctx.player.update(dt);
          ctx.quests?.update?.(dt);
        }
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
  window.__CTX__ = ctx;
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
