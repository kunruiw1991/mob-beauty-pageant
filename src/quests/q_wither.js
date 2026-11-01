// Quest 9: wither — 三三 (Nether: pop 3 skull helmets off shy patrolling wither skeletons -> blushing bald run-off,
// dig 4 deep soul sand mounds, place 7-slot T altar -> shake + thunder + 三三 sneezes blue skull -> balloon, §6.9).

import * as THREE from '../../vendor/three.module.min.js';
import { CONTESTANT_NAMES, MOB_NAMES, QUEST_LABELS } from '../data/strings.js';
import { B } from '../world/blocks.js';
import {
  poi,
  playerPos,
  distXZ,
  createTimers,
  createBreakable,
  createGhostSlot,
  createPatrol,
  emitGag,
  playSfx,
  sharedBoxGeo,
  sharedCylinderGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
  registerPick,
} from './kit.js';

const NETHER_ARRIVE = { x: 216.5, y: 8, z: 53.5 };
const HUB_RETURN_NEAR_PORTAL = { x: 15.5, y: 8, z: 30.5 };
const ALTAR_BASE = { x: 216.5, y: 8, z: 25.5 };

// All 3 Wither Skeletons patrol visibly on the Fortress Bridge deck (y=9, lanes x=216.1, 214.5, 218.5 across z=44.2..47.2)
// so all 3 are immediately in-frame below #hud-objective from Quest 9 arrival at (216.5, 8, 53.5) (#172 W2 / #174).
const SKEL_ROUTES = [
  [
    { x: 216.1, y: 9, z: 47.2 },
    { x: 216.1, y: 9, z: 45.4 },
  ],
  [
    { x: 214.5, y: 9, z: 46.2 },
    { x: 214.5, y: 9, z: 44.2 },
  ],
  [
    { x: 218.5, y: 9, z: 46.6 },
    { x: 218.5, y: 9, z: 44.6 },
  ],
];
const SKEL_MID_SCOOT_ROUTES = [
  [
    { x: 216.5, y: 9, z: 39.6 },
    { x: 216.5, y: 9, z: 37.8 },
  ],
  [
    { x: 214.6, y: 9, z: 38.4 },
    { x: 214.6, y: 9, z: 36.6 },
  ],
  [
    { x: 218.4, y: 9, z: 39.2 },
    { x: 218.4, y: 9, z: 37.4 },
  ],
];
const SKEL_SCOOT_ROUTES = [
  [
    { x: 216.5, y: 9, z: 35.4 },
    { x: 216.5, y: 9, z: 33.8 },
  ],
  [
    { x: 214.6, y: 9, z: 34.8 },
    { x: 214.6, y: 9, z: 33.6 },
  ],
  [
    { x: 218.4, y: 9, z: 35.0 },
    { x: 218.4, y: 9, z: 33.8 },
  ],
];

// 4 Soul Sand mounds across the Nether pockets (all clear y=8 walkable cells inside r=20 Nether island)
const LAYOUT_EXTRA_SAND = [
  [204, 8, 39],
  [207, 8, 39],
  [204, 8, 42],
  [207, 8, 42],
];
const SOUL_SAND_BLOCKS = [
  { bx: 204, by: 8, bz: 42 },
  { bx: 208, by: 8, bz: 51 },
  { bx: 226, by: 8, bz: 49 },
  { bx: 226, by: 8, bz: 29 },
];

// 7 Ghost Slots at Wither Altar: 4 Soul Sand T + 3 Wither Skulls
const ALTAR_SLOTS = [
  { dx: 0, dy: 0, kind: 'sand', label: QUEST_LABELS.wither.sandBase },
  { dx: -1, dy: 1, kind: 'sand', label: QUEST_LABELS.wither.sandLeft },
  { dx: 0, dy: 1, kind: 'sand', label: QUEST_LABELS.wither.sandCenter },
  { dx: 1, dy: 1, kind: 'sand', label: QUEST_LABELS.wither.sandRight },
  { dx: -1, dy: 2, kind: 'skull', label: QUEST_LABELS.wither.skullLeft },
  { dx: 0, dy: 2, kind: 'skull', label: QUEST_LABELS.wither.skullCenter },
  { dx: 1, dy: 2, kind: 'skull', label: QUEST_LABELS.wither.skullRight },
];

// Pooled sneeze blue-skull -> >= 0.85b bright sky-blue skull-balloon prop (0 geometry/material growth across restarts)
let propRoot = null;
let blueSkullMesh = null;
let balloonGroup = null;
let skullBalloonMats = null;

function getSkullBalloonMaterials() {
  if (skullBalloonMats) return skullBalloonMats;
  const sideMat = sharedBasicMat(0x38bdf8);
  const topMat = sharedBasicMat(0x7dd3fc);
  const botMat = sharedBasicMat(0x0ea5e9);
  let frontMat = sideMat;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    if (g) {
      // Bright sky-blue balloon base + upper crown sheen + lower shade
      g.fillStyle = '#38bdf8';
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#7dd3fc';
      g.fillRect(2, 2, 28, 8);
      g.fillStyle = '#0ea5e9';
      g.fillRect(0, 27, 32, 5);
      // Crisp white specular balloon shine in upper-left
      g.fillStyle = '#ffffff';
      g.fillRect(4, 4, 6, 3);
      g.fillRect(4, 7, 3, 4);
      // Cute Wither-Skull balloon eyes + white sparkles
      g.fillStyle = '#0f172a';
      g.fillRect(7, 13, 6, 6);
      g.fillRect(19, 13, 6, 6);
      g.fillStyle = '#ffffff';
      g.fillRect(8, 14, 2, 2);
      g.fillRect(20, 14, 2, 2);
      // Rosy pink balloon cheeks
      g.fillStyle = '#ff8fab';
      g.fillRect(4, 19, 4, 3);
      g.fillRect(24, 19, 4, 3);
      // Cute skull nose + happy toothy grin
      g.fillStyle = '#0f172a';
      g.fillRect(15, 18, 2, 2);
      g.fillStyle = '#ffffff';
      g.fillRect(10, 22, 12, 4);
      g.fillStyle = '#0ea5e9';
      g.fillRect(13, 22, 1, 4);
      g.fillRect(16, 22, 1, 4);
      g.fillRect(19, 22, 1, 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    frontMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
  }
  skullBalloonMats = [sideMat, sideMat, topMat, botMat, frontMat, sideMat];
  return skullBalloonMats;
}

function ensureWitherVisuals() {
  if (propRoot) return;
  propRoot = new THREE.Group();
  propRoot.name = 'qWitherProps';

  blueSkullMesh = new THREE.Mesh(sharedBoxGeo(0.58, 0.58, 0.58), sharedBasicMat(0x7dd3fc));
  blueSkullMesh.visible = false;

  balloonGroup = new THREE.Group();
  balloonGroup.visible = false;
  // >= 0.85 block bright unlit sky-blue skull-balloon + glowing cyan halo (#183 R2)
  const bulb = new THREE.Mesh(sharedBoxGeo(0.90, 0.96, 0.88), getSkullBalloonMaterials());
  bulb.position.y = 0.62;
  const aura = new THREE.Mesh(
    sharedBoxGeo(1.06, 1.12, 1.04),
    sharedBasicMat(0xbae6fd, { transparent: true, opacity: 0.24, depthWrite: false })
  );
  aura.position.y = 0.62;
  const knot = new THREE.Mesh(sharedBoxGeo(0.26, 0.16, 0.26), sharedBasicMat(0x0ea5e9));
  knot.position.y = 0.08;
  const stringMesh = new THREE.Mesh(sharedCylinderGeo(0.03, 0.03, 0.86, 6), sharedBasicMat(0xffffff));
  stringMesh.position.y = -0.38;
  balloonGroup.add(bulb, aura, knot, stringMesh);

  propRoot.add(blueSkullMesh, balloonGroup);
}

let active = false;
let phase = 'skulls'; // 'to_nether' | 'skulls' | 'soulsand' | 'altar' | 'summon'
let skullsPopped = 0;
let sandDug = 0;
let slotsPlaced = 0;
let summonClock = 0;
let sneezed = false;
let balloonPopped = false;

const skelEntries = [];
const sandBreakables = [];
const altarGhostSlots = [];
let witherContestant = null;
const timers = createTimers();

function switchArea(ctx, targetArea, destPos) {
  if (typeof ctx?.areas?.setArea === 'function') {
    ctx.areas.setArea(targetArea, destPos);
  } else {
    ctx?.world?.setArea?.(targetArea);
    if (ctx?.state) ctx.state.area = targetArea;
    if (destPos && ctx?.player?.setPosition) {
      ctx.player.setPosition(destPos.x, destPos.y ?? 8, destPos.z);
    }
    ctx?.events?.emit?.('areaChange', { area: targetArea });
  }
}

function setupNetherQuest(ctx) {
  phase = 'skulls';
  skullsPopped = 0;
  sandDug = 0;
  slotsPlaced = 0;
  summonClock = 0;
  sneezed = false;
  balloonPopped = false;

  propRoot.visible = true;
  blueSkullMesh.visible = false;
  balloonGroup.visible = false;
  attachToScene(ctx, propRoot);

  // Clear default raised soul sand blocks then restore our 4 scenic Soul Sand mounds
  for (const [lx, ly, lz] of LAYOUT_EXTRA_SAND) {
    ctx?.world?.setBlock?.(lx, ly, lz, B.AIR);
  }
  for (const b of SOUL_SAND_BLOCKS) {
    ctx?.world?.setBlock?.(b.bx, b.by, b.bz, B.SOUL_SAND);
  }

  // Spawn 3 patrolling Wither Skeletons
  while (skelEntries.length < 3) {
    const idx = skelEntries.length;
    const actor = ctx?.chars?.create ? ctx.chars.create('witherSkeleton', { id: `wither_skel_${idx}` }) : null;
    skelEntries.push({
      index: idx,
      actor,
      patrol: createPatrol(SKEL_ROUTES[idx], { speed: 1.75, pauseSec: 0.35, pingPong: true }),
      hits: 0,
      bald: false,
      fleeTimer: 0,
      unpick: null,
    });
  }

  for (const s of skelEntries) {
    s.patrol = createPatrol(SKEL_ROUTES[s.index], { speed: 1.75, pauseSec: 0.35, pingPong: true });
    s.patrol.reset();
    s.hits = 0;
    s.bald = false;
    s.fleeTimer = 0;
    if (s.actor) {
      s.actor.setHelmet?.(true);
      s.actor.setEmote?.(null);
      s.actor.setAnim?.('walk');
      s.actor.setVisible?.(true);
      s.actor.group.position.set(s.patrol.pos.x, s.patrol.pos.y, s.patrol.pos.z);
      attachToScene(ctx, s.actor.group);
      s.unpick?.();
      s.unpick = registerPick(ctx, s.actor.group, {
        id: `wither_skel_${s.index}`,
        targetId: `wither_skel_${s.index}`,
        entityId: `wither_skel_${s.index}`,
        kind: 'entity',
        label: MOB_NAMES.witherSkeleton,
        hitRadius: 1.15,
      });
    }
  }

  // Prepare 4 Soul Sand breakables (4 taps dig each)
  for (const sb of sandBreakables) sb.destroy();
  sandBreakables.length = 0;
  SOUL_SAND_BLOCKS.forEach((b, idx) => {
    sandBreakables.push(
      createBreakable(ctx, {
        id: `wither_sand_${idx}`,
        pos: { x: b.bx + 0.5, y: b.by, z: b.bz + 0.5 },
        taps: 4,
        size: 0.98,
        height: 0.98,
        color: 0x6b4f3b,
        speckColor: 0xfad66b,
        overlayOnly: false,
        clearWorldBlock: true,
        replaceBlockId: B.AIR,
        blockId: B.SOUL_SAND,
        sfxHit: 'hit_soft',
        sfxBreak: 'hit_soft',
        label: QUEST_LABELS.wither.digSoulSand,
        range: 2.3,
        onBreak: () => {
          sandDug += 1;
          ctx?.events?.emit?.('collect', {
            item: 'soulSand',
            count: 1,
            pos: { x: b.bx + 0.5, y: b.by + 0.5, z: b.bz + 0.5 },
          });
          playSfx(ctx, 'xp', { pos: { x: b.bx + 0.5, y: b.by + 0.5, z: b.bz + 0.5 }, pitch: 0.95 + sandDug * 0.08 });
          if (sandDug >= 4 && phase === 'soulsand') {
            startAltarPhase(ctx);
          }
        },
      })
    );
  });

  for (const gs of altarGhostSlots) gs.destroy();
  altarGhostSlots.length = 0;
}

function startAltarPhase(ctx) {
  phase = 'altar';
  slotsPlaced = 0;
  ctx?.events?.emit?.('questStep', { id: 'wither', step: 2 });

  for (const gs of altarGhostSlots) gs.destroy();
  altarGhostSlots.length = 0;

  ALTAR_SLOTS.forEach((spec, idx) => {
    const isSkull = spec.kind === 'skull';
    altarGhostSlots.push(
      createGhostSlot(ctx, {
        id: `wither_slot_${idx}`,
        pos: {
          x: ALTAR_BASE.x + spec.dx,
          y: ALTAR_BASE.y + spec.dy,
          z: ALTAR_BASE.z,
        },
        size: isSkull ? 0.72 : 0.96,
        ghostColor: isSkull ? 0x60a5fa : 0xd4a373,
        placedColor: isSkull ? 0x1f1f24 : 0x544033,
        blockId: isSkull ? B.OBSIDIAN : B.SOUL_SAND,
        sfxPlace: isSkull ? 'hit_stone' : 'hit_soft',
        label: spec.label,
        range: 2.3,
        onPlace: () => {
          slotsPlaced += 1;
          if (slotsPlaced >= ALTAR_SLOTS.length && phase === 'altar') {
            beginWitherSummon(ctx);
          }
        },
      })
    );
  });
}

function beginWitherSummon(ctx) {
  phase = 'summon';
  summonClock = 0;
  sneezed = false;
  balloonPopped = false;

  // Dramatic smoke swirl + thunder + camera shake (§6.9)
  const spawnPos = { x: ALTAR_BASE.x, y: ALTAR_BASE.y + 1.2, z: ALTAR_BASE.z };
  for (const gs of altarGhostSlots) {
    gs.group.visible = false;
  }
  ctx?.events?.emit?.('spawnBig', { pos: spawnPos, kind: 'wither' });
  ctx?.fx?.shake?.(0.6, 0.5);
  ctx?.fx?.burst?.(spawnPos, 0x1f1f24, 24);
  ctx?.fx?.sparkles?.(spawnPos, 16, { toPlayer: false });
  playSfx(ctx, 'thunder', { pos: spawnPos });
  playSfx(ctx, 'wither_spawn', { pos: spawnPos });

  // Place player within < 1.45b so Gag-Cam auto-hides the green chibi head and frames 三三's face cleanly (#183 R2)
  ctx?.player?.setPosition?.(ALTAR_BASE.x, ALTAR_BASE.y, ALTAR_BASE.z + 1.2, { faceNorth: true });

  if (!witherContestant && ctx?.chars?.create) {
    witherContestant = ctx.chars.create('wither', { id: 'quest_wither_actor' });
  }
  if (witherContestant) {
    witherContestant.group.position.set(ALTAR_BASE.x, ALTAR_BASE.y, ALTAR_BASE.z);
    witherContestant.group.rotation.y = 0.28;
    witherContestant.setSneezeFlash?.(true);
    witherContestant.setAnim('spawn');
    witherContestant.setEmote('👑');
    witherContestant.setVisible(true);
    attachToScene(ctx, witherContestant.group);
  }

  // Emit 3-heads want 3-hats gag (§4: wither_three_hats)
  emitGag(ctx, 'wither', 'wither_three_hats', spawnPos);
}

function handleSkeletonTap(ctx, skel) {
  if (skel.bald) return false;
  skel.hits += 1;
  const p = skel.actor?.group?.position || skel.patrol.pos;
  const hitPos = { x: p.x, y: p.y + 1.4, z: p.z };

  if (skel.hits < 3) {
    playSfx(ctx, 'hit_stone', { pos: hitPos, pitch: 1.0 + skel.hits * 0.1 });
    ctx?.fx?.burst?.(hitPos, 0x2b2d42, 6);
    skel.actor?.setEmote?.('!');
    if (skel.actor?.parts?.helmet) {
      skel.actor.parts.helmet.rotation.z = skel.hits === 1 ? 0.25 : -0.32;
    }
    if (skel.hits === 1 || skel.hits === 2) {
      // Shy skeleton scoots north along its Fortress Bridge lane clutching its wobbling helmet!
      const scootRoute =
        (skel.hits === 1 ? SKEL_MID_SCOOT_ROUTES[skel.index] : SKEL_SCOOT_ROUTES[skel.index]) ||
        SKEL_ROUTES[skel.index];
      skel.patrol = createPatrol(scootRoute, { speed: 2.05, pauseSec: 0.4, pingPong: true });
      skel.patrol.reset();
      if (skel.actor?.group) {
        skel.actor.group.position.set(scootRoute[0].x, scootRoute[0].y, scootRoute[0].z);
      }
      playSfx(ctx, 'boing', { pos: hitPos, pitch: 1.0 + skel.hits * 0.05 });
    }
    return true;
  }

  // 3rd tap: skull helmet pops off, skeleton blushes & runs off along the bridge facing camera (§6.9)!
  skel.bald = true;
  skel.fleeTimer = 1.45;
  skel.unpick?.();
  skel.unpick = null;
  if (skel.actor?.parts?.helmet) {
    skel.actor.parts.helmet.rotation.z = 0;
  }
  skel.actor?.popHead?.();
  skel.actor?.setEmote?.('😳');
  skel.actor?.setAnim?.('run');
  skel.actor?.moveTo?.({ x: p.x, y: 9, z: 41.5 }, 3.2);

  skullsPopped += 1;
  playSfx(ctx, 'boing', { pos: hitPos, pitch: 1.15 });
  playSfx(ctx, 'xp', { pos: hitPos, pitch: 0.95 + skullsPopped * 0.1 });
  ctx?.fx?.sparkles?.(hitPos, 10, { toPlayer: true });
  ctx?.events?.emit?.('collect', { item: 'witherSkull', count: 1, pos: hitPos });
  emitGag(ctx, 'wither', 'skeleton_bald', hitPos);

  if (skullsPopped >= 3 && phase === 'skulls') {
    phase = 'soulsand';
    ctx?.events?.emit?.('questStep', { id: 'wither', step: 1 });
  }
  return true;
}

const qWither = {
  id: 'wither',
  contestantId: 'wither',
  area: 'nether',
  poi: 'netherArrive',
  order: 9,

  start(ctx) {
    ensureWitherVisuals();
    timers.clear();
    active = true;

    if (ctx?.state?.area === 'nether') {
      setupNetherQuest(ctx);
    } else {
      phase = 'to_nether';
    }
  },

  update(dt, ctx) {
    if (!active) return;
    timers.update(dt);

    if (phase === 'to_nether') {
      if (ctx?.state?.area === 'nether') {
        setupNetherQuest(ctx);
      }
      return;
    }

    // Update patrolling / fleeing bald wither skeletons
    for (const s of skelEntries) {
      if (!s.actor || !s.actor.group.visible) continue;
      if (!s.bald) {
        s.patrol.step(dt, s.actor);
      } else {
        s.fleeTimer -= dt;
        s.actor.update(dt);
        if (s.fleeTimer <= 0) {
          ctx?.fx?.burst?.(
            { x: s.actor.group.position.x, y: s.actor.group.position.y + 1, z: s.actor.group.position.z },
            0xff8fab,
            8
          );
          s.actor.setVisible(false);
        }
      }
    }

    for (const sb of sandBreakables) sb.update(dt);
    for (const gs of altarGhostSlots) gs.update(dt);
    witherContestant?.update?.(dt);

    // Sneeze blue skull -> >= 0.85b bright sky-blue skull-balloon summon beat (§6.9, #183 R2)
    if (phase === 'summon') {
      summonClock += dt;
      if (!sneezed && summonClock >= 0.50) {
        sneezed = true;
        witherContestant?.setSneezeFlash?.(true);
        witherContestant?.setAnim?.('sneeze');
        if (witherContestant?.group) witherContestant.group.rotation.y = 0.32;
        playSfx(ctx, 'sneeze', { pos: ALTAR_BASE });
        blueSkullMesh.visible = true;
        blueSkullMesh.position.set(ALTAR_BASE.x, ALTAR_BASE.y + 1.55, ALTAR_BASE.z + 0.35);
      }
      if (sneezed && !balloonPopped) {
        const u = Math.min(1, (summonClock - 0.50) / 0.42);
        blueSkullMesh.position.set(
          ALTAR_BASE.x - u * 1.02,
          ALTAR_BASE.y + 1.55 - u * 0.37 + Math.sin(u * Math.PI) * 0.48,
          ALTAR_BASE.z + 0.35 + u * 0.13
        );
        blueSkullMesh.rotation.x += dt * 11;
        blueSkullMesh.rotation.y += dt * 8;
        if (u >= 1) {
          balloonPopped = true;
          blueSkullMesh.visible = false;
          balloonGroup.visible = true;
          balloonGroup.position.set(ALTAR_BASE.x - 1.02, ALTAR_BASE.y + 1.18, ALTAR_BASE.z + 0.48);
          balloonGroup.rotation.set(0, 0.36, 0);
          playSfx(ctx, 'pop', { pos: balloonGroup.position, pitch: 1.25 });
          ctx?.fx?.hearts?.({ x: ALTAR_BASE.x, y: ALTAR_BASE.y + 2.05, z: ALTAR_BASE.z + 0.35 }, 14);
          ctx?.fx?.sparkles?.(
            { x: ALTAR_BASE.x - 1.02, y: ALTAR_BASE.y + 2.28, z: ALTAR_BASE.z + 0.48 },
            12,
            { toPlayer: false }
          );
          witherContestant?.setSneezeFlash?.(true);
          witherContestant?.setAnim?.('happy');
          witherContestant?.setEmote?.('❤');
          if (witherContestant?.group) witherContestant.group.rotation.y = 0.34;
          witherContestant?.update?.(0.016);
          emitGag(ctx, 'wither', 'sneeze_balloon', {
            x: ALTAR_BASE.x,
            y: ALTAR_BASE.y,
            z: ALTAR_BASE.z,
          });
        }
      }
      if (balloonPopped && balloonGroup.visible) {
        balloonGroup.position.y =
          ALTAR_BASE.y + 1.20 + Math.sin((summonClock - 0.92) * 5.2) * 0.08;
      }
      if (summonClock >= 1.85) {
        witherContestant?.setSneezeFlash?.(false);
        // Return player to Hub right before completion so post-booth Quest 10 (villager) starts in Hub!
        switchArea(ctx, 'hub', HUB_RETURN_NEAR_PORTAL);
        ctx?.quests?.complete?.('wither');
      }
    }
  },

  onTap(hit, ctx) {
    if (!active) return false;
    const tid = hit?.targetId || hit?.id || '';

    if (tid === 'wither_portal') {
      switchArea(ctx, 'nether', poi(ctx, 'netherArrive', NETHER_ARRIVE));
      if (phase === 'to_nether') {
        setupNetherQuest(ctx);
      }
      return true;
    }

    if (phase === 'skulls') {
      for (const s of skelEntries) {
        if (s.bald) continue;
        const p = s.actor?.group?.position || s.patrol.pos;
        if (
          tid === `wither_skel_${s.index}` ||
          hit?.entityId === `wither_skel_${s.index}` ||
          (hit?.pos && Math.hypot((hit.pos.x ?? 0) - p.x, (hit.pos.z ?? 0) - p.z) <= 1.65)
        ) {
          return handleSkeletonTap(ctx, s);
        }
      }
    }

    if (phase === 'soulsand') {
      for (const sb of sandBreakables) {
        if (!sb.broken && (tid === sb.id || sb.matchesHit(hit))) {
          return sb.tap(ctx);
        }
      }
    }

    if (phase === 'altar') {
      for (const gs of altarGhostSlots) {
        if (
          !gs.placed &&
          (tid === gs.id || gs.matchesHit(hit) || (hit?.pos && distXZ(hit.pos, gs.pos) <= 2.25))
        ) {
          return gs.place(ctx);
        }
      }
    }

    if (phase === 'summon') {
      return true;
    }

    return false;
  },

  onAction() {},

  targets(ctx) {
    if (phase === 'to_nether' || (phase !== 'summon' && ctx?.state?.area && ctx.state.area !== 'nether')) {
      const np = poi(ctx, 'netherPortal', { x: 12.5, y: 8, z: 30.5 });
      return [{ id: 'wither_portal', pos: { x: np.x, y: 8, z: np.z }, kind: 'block', label: QUEST_LABELS.wither.enterNetherPortal, range: 2.2 }];
    }

    if (phase === 'skulls') {
      for (const s of skelEntries) {
        if (s.bald) continue;
        const p = s.actor?.group?.position || s.patrol.pos;
        return [
          {
            id: `wither_skel_${s.index}`,
            pos: { x: p.x, y: p.y, z: p.z },
            kind: 'entity',
            label: QUEST_LABELS.wither.popSkull,
            range: 2.3,
          },
        ];
      }
    }

    if (phase === 'soulsand') {
      for (const sb of sandBreakables) {
        if (!sb.broken) {
          return [
            {
              id: sb.id,
              pos: { x: sb.pos.x, y: 8, z: sb.pos.z },
              kind: 'block',
              label: QUEST_LABELS.wither.digSoulSand,
              range: 2.3,
            },
          ];
        }
      }
    }

    if (phase === 'altar') {
      // Offer soul sand T base slots first, then the 3 wither skulls on top — ALL stand targets on y=8 altar floor!
      const mapAltarSlotTarget = (gs, idx) => {
        const spec = ALTAR_SLOTS[idx];
        return {
          id: gs.id,
          pos: {
            x: ALTAR_BASE.x + spec.dx * 0.75,
            y: 8,
            z: ALTAR_BASE.z + 1.35,
          },
          kind: 'block',
          label: spec.label,
          range: 2.3,
        };
      };

      const sandTargets = [];
      for (let i = 0; i < 4; i++) {
        if (altarGhostSlots[i] && !altarGhostSlots[i].placed) {
          sandTargets.push(mapAltarSlotTarget(altarGhostSlots[i], i));
        }
      }
      if (sandTargets.length > 0) return sandTargets;

      const skullTargets = [];
      for (let i = 4; i < altarGhostSlots.length; i++) {
        if (altarGhostSlots[i] && !altarGhostSlots[i].placed) {
          skullTargets.push(mapAltarSlotTarget(altarGhostSlots[i], i));
        }
      }
      if (skullTargets.length > 0) return skullTargets;
    }

    return [{ id: 'wither_summon_wait', pos: { x: ALTAR_BASE.x, y: 8, z: ALTAR_BASE.z + 2.4 }, kind: 'wait', label: CONTESTANT_NAMES.wither, range: 2.4 }];
  },

  pointer(ctx) {
    if (phase === 'summon') {
      // Keep non-null for Gate F10 while placing the 3D beacon pillar behind the camera out of 三三's close-up (#183 R2)
      return { x: 216.5, y: 9, z: 58.5 };
    }
    if (phase === 'altar') {
      const nextGs = altarGhostSlots.find((gs) => !gs.placed);
      if (nextGs) return { x: nextGs.pos.x, y: nextGs.pos.y + 0.9, z: nextGs.pos.z };
    }
    const t = qWither.targets(ctx)[0];
    return t ? { x: t.pos.x, y: (t.pos.y ?? 8) + 1.3, z: t.pos.z } : { x: ALTAR_BASE.x, y: 10, z: ALTAR_BASE.z };
  },

  objective() {
    if (phase === 'to_nether' || phase === 'skulls') {
      return { icon: '💀', have: Math.min(skullsPopped, 3), need: 3 };
    }
    if (phase === 'soulsand') {
      return { icon: '🟫', have: Math.min(sandDug, 4), need: 4 };
    }
    return { icon: '🏗', have: Math.min(slotsPlaced, 7), need: 7 };
  },

  introPos() {
    return { x: 216.5, y: 9.8, z: 43.5 };
  },

  action() {
    return null;
  },

  cleanup() {
    active = false;
    timers.clear();
    for (const s of skelEntries) {
      s.unpick?.();
      s.unpick = null;
      if (s.actor) {
        s.actor.setEmote(null);
        s.actor.setVisible(false);
        detachFromScene(s.actor.group);
      }
    }
    for (const sb of sandBreakables) sb.destroy();
    sandBreakables.length = 0;
    for (const gs of altarGhostSlots) gs.destroy();
    altarGhostSlots.length = 0;

    if (propRoot) {
      propRoot.visible = false;
      detachFromScene(propRoot);
    }
    if (witherContestant) {
      witherContestant.setSneezeFlash?.(false);
      witherContestant.setEmote(null);
      witherContestant.setVisible(false);
      detachFromScene(witherContestant.group);
    }
  },
};

export default qWither;
