// Quest 9: wither — 三三 (Nether: pop 3 skull helmets off shy patrolling wither skeletons -> blushing bald run-off,
// dig 4 deep soul sand mounds, place 7-slot T altar -> shake + thunder + 三三 sneezes blue skull -> balloon, §6.9).

import * as THREE from '../../vendor/three.module.min.js';
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

const NETHER_ARRIVE = { x: 216.5, y: 8, z: 54.5 };
const HUB_RETURN_NEAR_PORTAL = { x: 15.5, y: 8, z: 30.5 };
const ALTAR_BASE = { x: 216.5, y: 8, z: 25.5 };

// 3 Wither Skeleton patrol routes across South Fortress Bridge (y=9), East Nether Terrace (y=8), and NW Nether Ridge (y=8)
const SKEL_ROUTES = [
  [
    { x: 216.5, y: 9, z: 45.5 },
    { x: 216.5, y: 9, z: 41.5 },
  ],
  [
    { x: 228.5, y: 8, z: 48.0 },
    { x: 228.5, y: 8, z: 44.5 },
  ],
  [
    { x: 204.5, y: 8, z: 29.0 },
    { x: 204.5, y: 8, z: 25.5 },
  ],
];
const SKEL_SCOOT_ROUTES = [
  [
    { x: 216.5, y: 9, z: 35.5 },
    { x: 216.5, y: 9, z: 33.8 },
  ],
  [
    { x: 226.5, y: 8, z: 33.5 },
    { x: 226.5, y: 8, z: 30.5 },
  ],
  [
    { x: 202.5, y: 8, z: 37.5 },
    { x: 202.5, y: 8, z: 34.5 },
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
  { dx: 0, dy: 0, kind: 'sand', label: '灵魂沙底座' },
  { dx: -1, dy: 1, kind: 'sand', label: '灵魂沙左臂' },
  { dx: 0, dy: 1, kind: 'sand', label: '灵魂沙中心' },
  { dx: 1, dy: 1, kind: 'sand', label: '灵魂沙右臂' },
  { dx: -1, dy: 2, kind: 'skull', label: '左骷髅头' },
  { dx: 0, dy: 2, kind: 'skull', label: '中骷髅头' },
  { dx: 1, dy: 2, kind: 'skull', label: '右骷髅头' },
];

// Pooled sneeze blue-skull -> party balloon prop (0 geometry/material growth across restarts)
let propRoot = null;
let blueSkullMesh = null;
let balloonGroup = null;

function ensureWitherVisuals() {
  if (propRoot) return;
  propRoot = new THREE.Group();
  propRoot.name = 'qWitherProps';

  blueSkullMesh = new THREE.Mesh(sharedBoxGeo(0.44, 0.44, 0.44), sharedBasicMat(0x60a5fa));
  blueSkullMesh.visible = false;

  balloonGroup = new THREE.Group();
  balloonGroup.visible = false;
  const bulb = new THREE.Mesh(sharedBoxGeo(0.58, 0.68, 0.58), sharedLambertMat(0xff6b9d));
  bulb.position.y = 0.75;
  const knot = new THREE.Mesh(sharedBoxGeo(0.16, 0.12, 0.16), sharedLambertMat(0xf06595));
  knot.position.y = 0.36;
  const stringMesh = new THREE.Mesh(sharedCylinderGeo(0.025, 0.025, 0.7, 6), sharedBasicMat(0xffffff));
  stringMesh.position.y = 0.0;
  balloonGroup.add(bulb, knot, stringMesh);

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
        label: '凋零骷髅',
        hitRadius: 1.15,
      });
    }
  }

  // Prepare 4 Soul Sand breakables (3 taps dig each)
  for (const sb of sandBreakables) sb.destroy();
  sandBreakables.length = 0;
  SOUL_SAND_BLOCKS.forEach((b, idx) => {
    sandBreakables.push(
      createBreakable(ctx, {
        id: `wither_sand_${idx}`,
        pos: { x: b.bx + 0.5, y: b.by, z: b.bz + 0.5 },
        taps: 3,
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
        label: '挖灵魂沙',
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

  // Step player slightly south of altar so 三三's 3 chibi heads & balloon gag frame cleanly
  ctx?.player?.setPosition?.(ALTAR_BASE.x, ALTAR_BASE.y, ALTAR_BASE.z + 2.4, { faceNorth: true });

  if (!witherContestant && ctx?.chars?.create) {
    witherContestant = ctx.chars.create('wither', { id: 'quest_wither_actor' });
  }
  if (witherContestant) {
    witherContestant.group.position.set(ALTAR_BASE.x, ALTAR_BASE.y, ALTAR_BASE.z);
    witherContestant.lookAt(playerPos(ctx));
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
    if (skel.hits === 2) {
      // Shy skeleton scoots along the bridge/terrace clutching its wobbling helmet!
      const scootRoute = SKEL_SCOOT_ROUTES[skel.index] || SKEL_ROUTES[skel.index];
      skel.patrol = createPatrol(scootRoute, { speed: 2.1, pauseSec: 0.4, pingPong: true });
      skel.patrol.reset();
      if (skel.actor?.group) {
        skel.actor.group.position.set(scootRoute[0].x, scootRoute[0].y, scootRoute[0].z);
      }
      playSfx(ctx, 'boing', { pos: hitPos, pitch: 1.05 });
    }
    return true;
  }

  // 3rd tap: skull helmet pops off, skeleton blushes & runs off holding its bald head (§6.9)!
  skel.bald = true;
  skel.fleeTimer = 1.05;
  skel.unpick?.();
  skel.unpick = null;
  if (skel.actor?.parts?.helmet) {
    skel.actor.parts.helmet.rotation.z = 0;
  }
  skel.actor?.popHead?.();
  skel.actor?.setEmote?.('😳');
  skel.actor?.setAnim?.('run');
  skel.actor?.moveTo?.({ x: 216.5, y: 9, z: 33.5 }, 6.5);

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

    // Sneeze blue skull -> party balloon summon beat (§6.9)
    if (phase === 'summon') {
      summonClock += dt;
      if (!sneezed && summonClock >= 0.85) {
        sneezed = true;
        witherContestant?.setAnim?.('sneeze');
        playSfx(ctx, 'sneeze', { pos: ALTAR_BASE });
        blueSkullMesh.visible = true;
        blueSkullMesh.position.set(ALTAR_BASE.x, ALTAR_BASE.y + 1.85, ALTAR_BASE.z + 0.5);
      }
      if (sneezed && !balloonPopped) {
        const u = Math.min(1, (summonClock - 0.85) / 0.55);
        blueSkullMesh.position.set(
          ALTAR_BASE.x,
          ALTAR_BASE.y + 1.85 + Math.sin(u * Math.PI) * 0.55,
          ALTAR_BASE.z + 0.5 + u * 1.15
        );
        blueSkullMesh.rotation.x += dt * 10;
        if (u >= 1) {
          balloonPopped = true;
          blueSkullMesh.visible = false;
          balloonGroup.visible = true;
          balloonGroup.position.set(ALTAR_BASE.x, ALTAR_BASE.y + 1.75, ALTAR_BASE.z + 1.65);
          playSfx(ctx, 'pop', { pos: balloonGroup.position, pitch: 1.25 });
          ctx?.fx?.hearts?.({ x: ALTAR_BASE.x, y: ALTAR_BASE.y + 2.1, z: ALTAR_BASE.z + 1.2 }, 14);
          witherContestant?.setAnim?.('happy');
          witherContestant?.setEmote?.('❤');
        }
      }
      if (balloonPopped && balloonGroup.visible) {
        balloonGroup.position.y += dt * 0.75;
      }
      if (summonClock >= 3.25) {
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
      return [{ id: 'wither_portal', pos: { x: np.x, y: 8, z: np.z }, kind: 'block', label: '进下界门', range: 2.2 }];
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
            label: '摘骷髅头',
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
              label: '挖灵魂沙',
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

    return [{ id: 'wither_summon_wait', pos: { x: ALTAR_BASE.x, y: 8, z: ALTAR_BASE.z + 2.4 }, kind: 'wait', label: '三三', range: 2.4 }];
  },

  pointer(ctx) {
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
    return { x: ALTAR_BASE.x, y: ALTAR_BASE.y + 1.0, z: ALTAR_BASE.z };
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
      witherContestant.setEmote(null);
      witherContestant.setVisible(false);
      detachFromScene(witherContestant.group);
    }
  },
};

export default qWither;
