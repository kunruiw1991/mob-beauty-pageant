// Quest 8: ender — 小末 (End chorus seals + cage -> 100% scripted 小凯 STEAL -> chase through End Exit Portal & past Kai's House ->
// Lava-Ring Prison: 3 bobbing obsidian stepping stones, 2 cobwebs x3 snips, yellow vision-cone patrol + gentle boing toss-back,
// 🎂 decoy cake x3 (5s eat), 2 cell padlocks + 3-tap cell door -> 小凯 locked in cell w/ cake face, docs/DESIGN.md §6.8, F9).

import * as THREE from '../../vendor/three.module.min.js';
import { B } from '../world/blocks.js';
import {
  poi,
  playerPos,
  distXZ,
  createTimers,
  createBreakable,
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

// Exact layout.js walkable coordinates for End Island, Hub Chase & Lava-Ring Prison
const END_ARRIVE = { x: 152.5, y: 8, z: 54.5 };
const END_EXIT = { x: 152.5, y: 8, z: 57.5 };
const END_SEAL_SPOTS = [
  { x: 139.5, y: 8, z: 48.5, label: '西南水晶印' },
  { x: 140.5, y: 8, z: 30.5, label: '西北水晶印' },
  { x: 163.5, y: 8, z: 30.5, label: '东北水晶印' },
  { x: 164.5, y: 8, z: 47.5, label: '东南水晶印' },
];
const END_CAGE_BARS = { x: 160.5, y: 8, z: 40.5 };
const END_CAGE_FRONT = { x: 159.2, y: 8, z: 40.5 };
const END_ENDER_INSIDE = { x: 162.2, y: 8, z: 40.5 };

const HUB_SHRINE_CHASE_START = { x: 20.5, y: 8, z: 20.5 };
const HUB_KAI_HOUSE_TRAIL = { x: 23.5, y: 8, z: 45.5 };

const PRISON_OUTER_BANK = { x: 24.5, y: 8, z: 66.5 };
const PRISON_SAFE_OUTSIDE = { x: 25.5, y: 8, z: 66.5 };
const PRISON_GATE_INSIDE = { x: 19.6, y: 8, z: 66.5 };
const PRISON_CELL_DOOR = { x: 15.5, y: 8, z: 66.5 };
const PRISON_CELL_FRONT = { x: 16.4, y: 8, z: 66.5 };
const PRISON_CELL_INSIDE = { x: 14.3, y: 8, z: 66.5 };
const CELL_KEY_SPOT = { x: 13.2, y: 8, z: 64.2, label: '拿牢房金钥' };

const STONE_COORDS = [
  { bx: 23, bz: 66, x: 23.5, z: 66.5 },
  { bx: 22, bz: 66, x: 22.5, z: 66.5 },
  { bx: 21, bz: 66, x: 21.5, z: 66.5 },
];

const PATROL_LOOP = [
  { x: 17.4, y: 8, z: 63.9 },
  { x: 12.1, y: 8, z: 63.9 },
  { x: 12.1, y: 8, z: 68.6 },
  { x: 17.4, y: 8, z: 68.6 },
];

// Pooled 3D stepping-stone & trail meshes (reused across restarts — 0 memory growth)
let prisonGroup = null;
let trailGroup = null;
const stoneEntries = [];
let unpickExitPortal = null;
let unpickHouseTrail = null;
let exitBeaconMesh = null;
let houseClueMesh = null;

function ensurePrisonVisuals() {
  if (prisonGroup) return;
  prisonGroup = new THREE.Group();
  prisonGroup.name = 'qEnderPrisonStones';
  const obsMat = sharedLambertMat(0x241638);
  const upGlowMat = sharedBasicMat(0xd946ef, { opacity: 0.74, transparent: true });

  for (let i = 0; i < 3; i++) {
    const sc = STONE_COORDS[i];
    const g = new THREE.Group();
    const block = new THREE.Mesh(sharedBoxGeo(0.92, 0.75, 0.92), obsMat);
    block.position.y = -0.375;
    const rim = new THREE.Mesh(sharedBoxGeo(0.96, 0.08, 0.96), upGlowMat);
    rim.position.y = 0.04;
    g.add(block, rim);
    g.position.set(sc.x, 8.0, sc.z);
    prisonGroup.add(g);
    stoneEntries.push({
      index: i,
      bx: sc.bx,
      bz: sc.bz,
      x: sc.x,
      z: sc.z,
      group: g,
      rim,
      isUp: true,
      unpick: null,
    });
  }

  trailGroup = new THREE.Group();
  trailGroup.name = 'qEnderChaseTrail';
  exitBeaconMesh = new THREE.Mesh(
    sharedCylinderGeo(0.85, 0.95, 1.4, 10),
    sharedBasicMat(0xc026d3, { opacity: 0.48, transparent: true })
  );
  exitBeaconMesh.position.set(END_EXIT.x, 8.7, END_EXIT.z);
  exitBeaconMesh.visible = false;

  houseClueMesh = new THREE.Mesh(
    sharedBoxGeo(0.58, 0.58, 0.58),
    sharedBasicMat(0xe879f9, { opacity: 0.85, transparent: true })
  );
  houseClueMesh.position.set(HUB_KAI_HOUSE_TRAIL.x, 8.65, HUB_KAI_HOUSE_TRAIL.z);
  houseClueMesh.visible = false;
  trailGroup.add(exitBeaconMesh, houseClueMesh);
}

let active = false;
// Phases: 'to_end' | 'end_seals' | 'end_cage' | 'steal_cutscene' | 'chase_portal' | 'chase_house' | 'chase_prison' | 'stones' | 'cobwebs' | 'yard' | 'rescue'
let phase = 'end_seals';
let cutsceneElapsed = 0;
let stealSnatched = false;

let sealIdx = 0;
const endSeals = [];

let stoneStep = 0;
let stoneClock = 0;
let stoneMisses = 0;

let cakesLeft = 3;
let tossCount = 0;
let tossGrace = 0;
let playerArc = null;

let cageBreakable = null;
let cobweb0 = null;
let cobweb1 = null;
let padlockIdx = 0;
const cellPadlocks = [];
let cellDoorBreakable = null;

let enderContestant = null;
const cagedEndermen = [];
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

function setPlayerDirect(ctx, x, y, z) {
  if (typeof ctx?.player?.setPosition === 'function') {
    ctx.player.setPosition(x, y, z);
  } else if (ctx?.state?.player) {
    ctx.state.player.x = x;
    ctx.state.player.y = y;
    ctx.state.player.z = z;
    ctx.state.player.moving = false;
  }
}

function startPlayerHop(ctx, toPos, duration = 0.26, peak = 1.0, onDone = null) {
  const from = playerPos(ctx);
  ctx?.player?.stop?.();
  ctx?.player?.actor?.setAnim?.('hop');
  playerArc = {
    from: { x: from.x, y: from.y ?? 8, z: from.z },
    to: { x: toPos.x, y: toPos.y ?? 8, z: toPos.z },
    elapsed: 0,
    duration,
    peak,
    onDone,
  };
}

function setupEndCagePhase(ctx) {
  phase = 'end_seals';
  sealIdx = 0;
  stealSnatched = false;

  trailGroup.visible = true;
  exitBeaconMesh.visible = false;
  houseClueMesh.visible = false;
  attachToScene(ctx, trailGroup);

  // Ensure iron bars at (160, 8..9, 40) exist at quest start
  ctx?.world?.setBlock?.(160, 8, 40, B.IRON_BARS);
  ctx?.world?.setBlock?.(160, 9, 40, B.IRON_BARS);

  // Spawn 6 Endermen in the big cage (138..144, 36..42)
  const spots = [
    [139.6, 37.6],
    [141.5, 37.8],
    [143.2, 37.6],
    [139.8, 41.2],
    [141.5, 40.8],
    [143.2, 41.2],
  ];
  while (cagedEndermen.length < 6 && ctx?.chars?.create) {
    cagedEndermen.push(ctx.chars.create('endermanMob'));
  }
  cagedEndermen.forEach((m, idx) => {
    const [ex, ez] = spots[idx % spots.length];
    m.group.position.set(ex, 8, ez);
    m.lookAt({ x: 152.5, y: 8, z: 46 });
    m.setAnim(idx % 2 === 0 ? 'idle' : 'wave');
    m.setVisible(true);
    attachToScene(ctx, m.group);
  });

  // Spawn 小末 inside her small cage
  if (!enderContestant && ctx?.chars?.create) {
    enderContestant = ctx.chars.create('ender', { id: 'quest_ender_actor' });
  }
  if (enderContestant) {
    enderContestant.group.position.set(END_ENDER_INSIDE.x, END_ENDER_INSIDE.y, END_ENDER_INSIDE.z);
    enderContestant.lookAt(END_CAGE_BARS);
    enderContestant.setAnim('wave');
    enderContestant.setEmote('!');
    enderContestant.setVisible(true);
    attachToScene(ctx, enderContestant.group);
  }

  // 4 End Crystal Seals around the End Island ring (3 taps each, clockwise)
  for (const s of endSeals) s.destroy();
  endSeals.length = 0;
  END_SEAL_SPOTS.forEach((sp, idx) => {
    endSeals.push(
      createBreakable(ctx, {
        id: `ender_seal_${idx}`,
        pos: { x: sp.x, y: 8, z: sp.z },
        taps: 2,
        size: 0.78,
        height: 1.55,
        color: 0xa855f7,
        speckColor: 0xf0abfc,
        blockId: B.CONCRETE_PERFECT,
        sfxHit: 'hit_stone',
        sfxBreak: 'vwoop',
        label: sp.label,
        range: 2.3,
        onBreak: () => {
          sealIdx = idx + 1;
          ctx?.fx?.sparkles?.({ x: sp.x, y: 9.0, z: sp.z }, 12, { toPlayer: false });
          if (sealIdx >= END_SEAL_SPOTS.length && phase === 'end_seals') {
            phase = 'end_cage';
          }
        },
      })
    );
  });

  cageBreakable?.destroy();
  cageBreakable = createBreakable(ctx, {
    id: 'ender_cage_bars',
    pos: END_CAGE_BARS,
    taps: 3,
    size: 0.92,
    height: 1.9,
    color: 0xa2a6a8,
    speckColor: 0xd946ef,
    blockId: B.IRON_BARS,
    sfxHit: 'hit_stone',
    sfxBreak: 'break',
    label: '铁栏杆',
    range: 2.3,
    onBreak: () => beginScriptedSteal(ctx),
  });
}

function beginScriptedSteal(ctx) {
  ctx?.world?.setBlock?.(160, 8, 40, B.AIR);
  ctx?.world?.setBlock?.(160, 9, 40, B.AIR);

  const beside = { x: 158.0, y: 8, z: 40.5 };
  playSfx(ctx, 'vwoop', { pos: beside });
  ctx?.fx?.sparkles?.(beside, 14, { toPlayer: false });
  if (enderContestant) {
    enderContestant.group.position.set(beside.x, beside.y, beside.z);
    enderContestant.lookAt(playerPos(ctx));
    enderContestant.setAnim('happy');
    enderContestant.setEmote('❤');
  }

  // 100% deterministic scripted STEAL beat (§6.8, Gate F9)
  phase = 'steal_cutscene';
  cutsceneElapsed = 0;
  stealSnatched = false;

  ctx?.rival?.appear?.(END_EXIT, 'steal', 'ender');
  if (ctx?.state?.rival) {
    ctx.state.rival.stealDone = true;
  }
  ctx?.events?.emit?.('rivalSteal', { contestantId: 'ender' });
  ctx?.events?.emit?.('questStep', { id: 'ender', step: 1 });
  emitGag(ctx, 'ender', 'kai_steal', beside);
  ctx?.rival?.taunt?.('ender');
  ctx?.rival?.actor?.moveTo?.({ x: beside.x - 0.6, y: 8, z: beside.z + 0.6 }, 7.2);
}

function openPortalChasePhase(ctx) {
  phase = 'chase_portal';
  ctx?.rival?.leave?.();
  if (enderContestant) enderContestant.setVisible(false);
  exitBeaconMesh.visible = true;
  unpickExitPortal?.();
  unpickExitPortal = registerPick(ctx, exitBeaconMesh, {
    id: 'ender_exit_portal',
    targetId: 'ender_exit_portal',
    kind: 'block',
    label: '追进传送门',
    hitRadius: 1.4,
  });
  playSfx(ctx, 'portal', { pos: END_EXIT });
}

function enterHubChasePhase(ctx) {
  for (const m of cagedEndermen) m.setVisible(false);
  exitBeaconMesh.visible = false;
  unpickExitPortal?.();
  unpickExitPortal = null;

  switchArea(ctx, 'hub', HUB_SHRINE_CHASE_START);
  phase = 'chase_house';

  // 小凯 taunts outside his Prismarine House before bolting south into the Lava-Ring Prison
  houseClueMesh.visible = true;
  unpickHouseTrail?.();
  unpickHouseTrail = registerPick(ctx, houseClueMesh, {
    id: 'ender_kai_house_trail',
    targetId: 'ender_kai_house_trail',
    kind: 'entity',
    label: '追上小凯',
    hitRadius: 1.35,
  });
  ctx?.rival?.appear?.({ x: 22.2, y: 8, z: 45.5 }, 'cameo', 'ender');
  ctx?.rival?.actor?.lookAt?.(HUB_SHRINE_CHASE_START);
  ctx?.rival?.taunt?.('ender');
}

function setupPrisonLayout(ctx) {
  houseClueMesh.visible = false;
  unpickHouseTrail?.();
  unpickHouseTrail = null;

  // Place 小末 locked inside central obsidian cell (14.3, 8, 66.5) behind iron bars (15, 8..9, 66)
  ctx?.world?.setBlock?.(15, 8, 66, B.IRON_BARS);
  ctx?.world?.setBlock?.(15, 9, 66, B.IRON_BARS);
  if (enderContestant) {
    enderContestant.group.position.set(PRISON_CELL_INSIDE.x, PRISON_CELL_INSIDE.y, PRISON_CELL_INSIDE.z);
    enderContestant.lookAt(PRISON_CELL_DOOR);
    enderContestant.setAnim('wave');
    enderContestant.setEmote('!');
    enderContestant.setVisible(true);
    attachToScene(ctx, enderContestant.group);
  }

  // Submerge voxel bridge sockets into lava while 3 bobbing obsidian meshes animate above
  for (const s of stoneEntries) {
    ctx?.world?.setBlock?.(s.bx, 7, s.bz, B.LAVA);
    s.unpick?.();
    s.unpick = registerPick(ctx, s.group, {
      id: `ender_stone_${s.index}`,
      targetId: `ender_stone_${s.index}`,
      kind: 'block',
      label: '黑曜石踏板',
      hitRadius: 1.05,
    });
  }
  prisonGroup.visible = true;
  attachToScene(ctx, prisonGroup);

  // Ensure 2 cobwebs at inner gate (20, 8, 66) & (20, 8, 65) — 3 snips each
  ctx?.world?.setBlock?.(20, 8, 66, B.COBWEB);
  ctx?.world?.setBlock?.(20, 8, 65, B.COBWEB);
  cobweb0?.destroy();
  cobweb1?.destroy();
  cobweb0 = createBreakable(ctx, {
    id: 'ender_web_0',
    pos: { x: 20.5, y: 8, z: 66.5 },
    taps: 3,
    size: 0.85,
    height: 0.95,
    color: 0xf1f5f9,
    overlayOnly: true,
    clearWorldBlock: true,
    replaceBlockId: B.AIR,
    blockId: B.COBWEB,
    sfxHit: 'snip',
    sfxBreak: 'snip',
    label: '剪蛛网',
    range: 2.2,
    onBreak: () => checkCobwebsCleared(ctx),
  });
  cobweb1 = createBreakable(ctx, {
    id: 'ender_web_1',
    pos: { x: 20.5, y: 8, z: 65.5 },
    taps: 3,
    size: 0.85,
    height: 0.95,
    color: 0xf1f5f9,
    overlayOnly: true,
    clearWorldBlock: true,
    replaceBlockId: B.AIR,
    blockId: B.COBWEB,
    sfxHit: 'snip',
    sfxBreak: 'snip',
    label: '剪蛛网',
    range: 2.2,
    onBreak: () => checkCobwebsCleared(ctx),
  });

  // Start 小凯 patrolling inside the prison courtyard with visible yellow vision cone
  ctx?.rival?.patrol?.(PATROL_LOOP, 46, 3.3, { speed: 2.3, questId: 'ender' });

  stoneStep = 0;
  stoneClock = 0;
  stoneMisses = 0;
  phase = 'chase_prison';
}

function checkCobwebsCleared(ctx) {
  if (cobweb0?.broken && cobweb1?.broken && phase === 'cobwebs') {
    phase = 'yard';
    padlockIdx = 0;
    tossGrace = 1.1;
    startPlayerHop(ctx, PRISON_GATE_INSIDE, 0.22, 0.55);

    for (const p of cellPadlocks) p.destroy();
    cellPadlocks.length = 0;
    cellPadlocks.push(
      createBreakable(ctx, {
        id: 'ender_padlock_0',
        pos: { x: CELL_KEY_SPOT.x, y: 8, z: CELL_KEY_SPOT.z },
        taps: 1,
        size: 0.62,
        height: 0.92,
        color: 0xf59e0b,
        speckColor: 0xfef08a,
        blockId: B.GOLD_BLOCK,
        sfxHit: 'pickup',
        sfxBreak: 'xp',
        label: CELL_KEY_SPOT.label,
        range: 2.2,
        onBreak: () => {
          padlockIdx = 1;
          ctx?.fx?.sparkles?.({ x: CELL_KEY_SPOT.x, y: 9.0, z: CELL_KEY_SPOT.z }, 12, { toPlayer: true });
        },
      })
    );

    cellDoorBreakable?.destroy();
    cellDoorBreakable = createBreakable(ctx, {
      id: 'ender_cell_door',
      pos: PRISON_CELL_DOOR,
      taps: 3,
      size: 0.88,
      height: 1.9,
      color: 0x241638,
      speckColor: 0xa2a6a8,
      blockId: B.OBSIDIAN,
      sfxHit: 'hit_stone',
      sfxBreak: 'break',
      label: '牢房门',
      range: 2.2,
      onBreak: () => finishPrisonRescue(ctx),
    });
    ctx?.events?.emit?.('questStep', { id: 'ender', step: 4 });
  }
}

function finishPrisonRescue(ctx) {
  phase = 'rescue';
  playerArc = null;

  ctx?.world?.setBlock?.(15, 8, 66, B.AIR);
  ctx?.world?.setBlock?.(15, 9, 66, B.AIR);

  const hugSpot = { x: 16.3, y: 8, z: 66.5 };
  if (enderContestant) {
    enderContestant.group.position.set(hugSpot.x, hugSpot.y, hugSpot.z);
    enderContestant.lookAt(playerPos(ctx));
    enderContestant.setAnim('happy');
    enderContestant.setEmote('❤');
  }
  ctx?.fx?.hearts?.({ x: hugSpot.x, y: 9.6, z: hugSpot.z }, 16);
  playSfx(ctx, 'vwoop', { pos: hugSpot });

  // Lock 小凯 inside his own cell with cake splatted on his face (§6.8(d))
  ctx?.rival?.lockInCellWithCake?.(PRISON_CELL_INSIDE, 'ender');
  ctx?.world?.setBlock?.(15, 8, 66, B.IRON_BARS);
  ctx?.world?.setBlock?.(15, 9, 66, B.IRON_BARS);

  if (ctx?.state?.rival) {
    ctx.state.rival.rescued = true;
  }
  ctx?.events?.emit?.('rivalRescued', { contestantId: 'ender' });
  emitGag(ctx, 'ender', 'kai_cake_face', PRISON_CELL_INSIDE);

  timers.after(0.65, () => {
    if (!active) return;
    setPlayerDirect(ctx, PRISON_SAFE_OUTSIDE.x, 8, PRISON_SAFE_OUTSIDE.z);
    if (enderContestant) {
      enderContestant.group.position.set(PRISON_SAFE_OUTSIDE.x + 1.1, 8, PRISON_SAFE_OUTSIDE.z);
      enderContestant.lookAt(PRISON_SAFE_OUTSIDE);
    }
    playSfx(ctx, 'vwoop', { pos: PRISON_SAFE_OUTSIDE });
    ctx?.fx?.sparkles?.(PRISON_SAFE_OUTSIDE, 18, { toPlayer: false });
  });

  timers.after(1.45, () => {
    if (active) ctx?.quests?.complete?.('ender');
  });
}

const qEnder = {
  id: 'ender',
  contestantId: 'ender',
  area: 'end',
  poi: 'endArrive',
  order: 8,

  start(ctx) {
    ensurePrisonVisuals();
    timers.clear();
    active = true;
    cakesLeft = 3;
    tossCount = 0;
    tossGrace = 0;
    playerArc = null;
    stoneStep = 0;
    stoneClock = 0;
    stoneMisses = 0;
    sealIdx = 0;
    padlockIdx = 0;
    prisonGroup.visible = false;
    trailGroup.visible = false;

    if (ctx?.state?.area === 'end') {
      setupEndCagePhase(ctx);
    } else {
      phase = 'to_end';
    }
  },

  update(dt, ctx) {
    if (!active) return;
    timers.update(dt);
    enderContestant?.update?.(dt);
    for (const m of cagedEndermen) {
      if (m.group.visible) m.update?.(dt);
    }
    for (const s of endSeals) s.update?.(dt);
    cageBreakable?.update?.(dt);
    cobweb0?.update?.(dt);
    cobweb1?.update?.(dt);
    for (const p of cellPadlocks) p.update?.(dt);
    cellDoorBreakable?.update?.(dt);

    if (houseClueMesh?.visible) {
      houseClueMesh.rotation.y += dt * 2.8;
    }

    // Update hop / toss-back parabolic arc
    if (playerArc) {
      playerArc.elapsed += dt;
      const u = Math.min(1, playerArc.elapsed / playerArc.duration);
      const x = playerArc.from.x + (playerArc.to.x - playerArc.from.x) * u;
      const z = playerArc.from.z + (playerArc.to.z - playerArc.from.z) * u;
      const y =
        playerArc.from.y +
        (playerArc.to.y - playerArc.from.y) * u +
        Math.sin(u * Math.PI) * playerArc.peak;
      setPlayerDirect(ctx, x, y, z);
      if (u >= 1) {
        const done = playerArc.onDone;
        playerArc = null;
        setPlayerDirect(ctx, x, 8, z);
        done?.();
      }
      return;
    }

    if (phase === 'to_end') {
      if (ctx?.state?.area === 'end') {
        setupEndCagePhase(ctx);
      }
      return;
    }

    if (phase === 'steal_cutscene') {
      cutsceneElapsed += dt;
      if (!stealSnatched && cutsceneElapsed >= 1.35) {
        stealSnatched = true;
        playSfx(ctx, 'boing', { pos: END_CAGE_BARS });
        playSfx(ctx, 'kai_laugh', { pos: END_CAGE_BARS });
        ctx?.rival?.actor?.moveTo?.(END_EXIT, 8.2);
      }
      if (stealSnatched && enderContestant && ctx?.rival?.actor?.group) {
        const kp = ctx.rival.actor.group.position;
        enderContestant.group.position.set(kp.x + 0.45, kp.y + 0.35, kp.z - 0.35);
        enderContestant.setEmote('!');
      }
      if (cutsceneElapsed >= 4.2) {
        openPortalChasePhase(ctx);
      }
      return;
    }

    if (phase === 'chase_portal' && distXZ(playerPos(ctx), END_EXIT) <= 2.3) {
      enterHubChasePhase(ctx);
      return;
    }

    if (phase === 'chase_house' && distXZ(playerPos(ctx), HUB_KAI_HOUSE_TRAIL) <= 2.5) {
      playSfx(ctx, 'kai_laugh', { pos: HUB_KAI_HOUSE_TRAIL });
      ctx?.fx?.sparkles?.(HUB_KAI_HOUSE_TRAIL, 12, { toPlayer: false });
      setupPrisonLayout(ctx);
      return;
    }

    if (phase === 'chase_prison' && distXZ(playerPos(ctx), PRISON_OUTER_BANK) <= 2.3) {
      phase = 'stones';
      ctx?.events?.emit?.('questStep', { id: 'ender', step: 2 });
    }

    // Animate 3 bobbing obsidian stepping stones (§6.8(a); mercy after 2 misses)
    if (prisonGroup?.visible) {
      stoneClock += dt;
      const upDur = stoneMisses >= 2 ? 1.85 : 1.45;
      const downDur = stoneMisses >= 2 ? 0.2 : 0.55;
      const period = upDur + downDur;

      for (const s of stoneEntries) {
        if ((phase !== 'stones' && phase !== 'chase_prison') || s.index < stoneStep) {
          s.isUp = true;
          s.group.position.y = 8.05;
          s.rim.visible = true;
          continue;
        }
        const localT = (stoneClock + s.index * 0.42) % period;
        const isUp = localT < upDur;
        s.isUp = isUp;
        const targetY = isUp ? 8.05 : 7.42;
        s.group.position.y += (targetY - s.group.position.y) * Math.min(1, dt * 14);
        s.rim.visible = isUp;
      }
    }

    if (phase === 'yard') {
      if (tossGrace > 0) {
        tossGrace = Math.max(0, tossGrace - dt);
      }
      const pPos = playerPos(ctx);
      if (tossGrace <= 0 && pPos.x < 19.0 && ctx?.rival?.seesPlayer?.()) {
        tossCount += 1;
        tossGrace = 1.5;
        playSfx(ctx, 'boing', { pos: pPos });
        ctx?.rival?.taunt?.('ender');
        // Mercy rule (§6): soften vision cone & patrol speed after 2 tosses; auto-drop decoy after 3
        if (tossCount === 2) {
          ctx?.rival?.setPatrolParams?.({ speed: 1.85, coneDeg: 34, range: 2.6 });
        } else if (tossCount >= 3) {
          ctx?.rival?.eatDecoy?.({ x: 16.8, y: 8, z: 64.2 }, 5.5);
        }
        startPlayerHop(ctx, PRISON_GATE_INSIDE, 0.4, 1.55);
      }
    }
  },

  onTap(hit, ctx) {
    if (!active || playerArc) return true;
    const tid = hit?.targetId || hit?.id || '';

    if (
      tid === 'ender_portal' &&
      (phase === 'to_end' || ((phase === 'end_seals' || phase === 'end_cage') && ctx?.state?.area !== 'end'))
    ) {
      switchArea(ctx, 'end', poi(ctx, 'endArrive', END_ARRIVE));
      if (phase === 'to_end') {
        setupEndCagePhase(ctx);
      }
      return true;
    }

    if (phase === 'end_seals') {
      const curSeal = endSeals[sealIdx];
      if (curSeal && !curSeal.broken && curSeal.matchesHit(hit)) {
        return curSeal.tap(ctx);
      }
    }

    if (phase === 'end_cage' && cageBreakable?.matchesHit(hit)) {
      return cageBreakable.tap(ctx);
    }

    if (phase === 'steal_cutscene') {
      playSfx(ctx, 'vwoop', { pos: END_EXIT });
      return true;
    }

    if (phase === 'chase_portal' && tid === 'ender_exit_portal') {
      enterHubChasePhase(ctx);
      return true;
    }

    if (phase === 'chase_house' && tid === 'ender_kai_house_trail') {
      playSfx(ctx, 'kai_laugh', { pos: HUB_KAI_HOUSE_TRAIL });
      setupPrisonLayout(ctx);
      return true;
    }

    if (phase === 'chase_prison' && tid === 'ender_moat_bank') {
      phase = 'stones';
      ctx?.events?.emit?.('questStep', { id: 'ender', step: 2 });
      return true;
    }

    if (phase === 'stones') {
      const nextStone = stoneEntries[stoneStep];
      if (!nextStone) return false;
      if (
        tid === `ender_stone_${stoneStep}` ||
        (hit?.pos && Math.hypot((hit.pos.x ?? 0) - nextStone.x, (hit.pos.z ?? 0) - nextStone.z) <= 1.35)
      ) {
        if (nextStone.isUp) {
          const landedIdx = stoneStep;
          ctx?.world?.setBlock?.(nextStone.bx, 7, nextStone.bz, B.OBSIDIAN);
          playSfx(ctx, 'boing', { pos: { x: nextStone.x, y: 8, z: nextStone.z }, pitch: 1.0 + landedIdx * 0.12 });
          const hopDest =
            landedIdx >= 2
              ? { x: 21.35, y: 8, z: 66.5 }
              : { x: nextStone.x, y: 8, z: nextStone.z };
          startPlayerHop(ctx, hopDest, 0.26, 0.95, () => {
            stoneStep = landedIdx + 1;
            if (stoneStep >= 3) {
              for (const s of stoneEntries) {
                ctx?.world?.setBlock?.(s.bx, 7, s.bz, B.OBSIDIAN);
              }
              phase = 'cobwebs';
              ctx?.events?.emit?.('questStep', { id: 'ender', step: 3 });
            }
          });
          return true;
        }
        stoneMisses += 1;
        const sp = { x: nextStone.x, y: 8, z: nextStone.z };
        ctx?.fx?.wobble?.(sp);
        playSfx(ctx, 'blocked', { pos: sp });
        return true;
      }
    }

    if (phase === 'cobwebs') {
      if (cobweb0 && !cobweb0.broken) {
        if (tid === 'ender_web_0' || cobweb0.matchesHit(hit)) return cobweb0.tap(ctx);
      } else if (cobweb1 && !cobweb1.broken) {
        if (tid === 'ender_web_1' || cobweb1.matchesHit(hit)) return cobweb1.tap(ctx);
      }
    }

    if (phase === 'yard') {
      const curLock = cellPadlocks[padlockIdx];
      if (curLock && !curLock.broken) {
        if (tid === curLock.id || curLock.matchesHit(hit)) return curLock.tap(ctx);
      } else if (cellDoorBreakable && !cellDoorBreakable.broken) {
        if (tid === 'ender_cell_door' || cellDoorBreakable.matchesHit(hit)) return cellDoorBreakable.tap(ctx);
      }
    }

    return false;
  },

  onAction(ctx) {
    // 🎂 Context button (3 cakes): places a cake on 小凯's path; he eats for 5 s (§6.8(c))
    if (!active || phase !== 'yard' || cakesLeft <= 0) return;
    cakesLeft -= 1;
    const rPos = ctx?.rival?.pos || { x: 17.2, y: 8, z: 65.0 };
    const hx = Math.sin(ctx?.rival?.heading ?? 0);
    const hz = Math.cos(ctx?.rival?.heading ?? 0);
    const cakePos = {
      x: Math.max(12.2, Math.min(18.5, rPos.x + hx * 1.1)),
      y: 8,
      z: Math.max(63.8, Math.min(68.8, rPos.z + hz * 1.1)),
    };
    ctx?.rival?.eatDecoy?.(cakePos, 5.0);
    ctx?.fx?.sparkles?.(cakePos, 10, { toPlayer: false });
  },

  targets(ctx) {
    if (
      phase === 'to_end' ||
      ((phase === 'end_seals' || phase === 'end_cage' || phase === 'chase_portal') &&
        ctx?.state?.area &&
        ctx.state.area !== 'end')
    ) {
      const ep = poi(ctx, 'endPortal', { x: 20.5, y: 8, z: 18.5 });
      return [{ id: 'ender_portal', pos: { x: ep.x, y: 8, z: ep.z }, kind: 'block', label: '进末地门', range: 2.2 }];
    }

    if (phase === 'end_seals') {
      const curSeal = endSeals[sealIdx];
      if (curSeal && !curSeal.broken) {
        const sp = END_SEAL_SPOTS[sealIdx];
        return [{ id: curSeal.id, pos: { x: sp.x, y: 8, z: sp.z }, kind: 'block', label: sp.label, range: 2.3 }];
      }
    }

    if (phase === 'end_cage') {
      return [{ id: 'ender_cage_bars', pos: { ...END_CAGE_FRONT }, kind: 'block', label: '铁栏杆', range: 2.2 }];
    }

    if (phase === 'steal_cutscene') {
      return [{ id: 'ender_steal_wait', pos: { x: 156.5, y: 8, z: 44.5 }, kind: 'wait', label: '小凯抢人!', range: 2.4 }];
    }

    if (phase === 'chase_portal') {
      return [{ id: 'ender_exit_portal', pos: { ...END_EXIT }, kind: 'block', label: '追进传送门', range: 2.3 }];
    }

    if (phase === 'chase_house') {
      return [{ id: 'ender_kai_house_trail', pos: { ...HUB_KAI_HOUSE_TRAIL }, kind: 'entity', label: '追上小凯', range: 2.3 }];
    }

    if (phase === 'chase_prison') {
      return [{ id: 'ender_moat_bank', pos: { ...PRISON_OUTER_BANK }, kind: 'block', label: '到熔岩边', range: 2.2 }];
    }

    if (phase === 'stones') {
      const s = stoneEntries[Math.min(stoneStep, 2)];
      // Stand position is on the solid walkable block just east (+0.65x) of the next bobbing stone (range 2.1 <= 2.5!)
      return [
        {
          id: `ender_stone_${s.index}`,
          pos: { x: s.x + 0.65, y: 8, z: s.z },
          kind: 'block',
          label: '跳黑曜石',
          range: 2.1,
        },
      ];
    }

    if (phase === 'cobwebs') {
      if (cobweb0 && !cobweb0.broken) {
        return [{ id: 'ender_web_0', pos: { x: 21.15, y: 8, z: 66.5 }, kind: 'block', label: '剪蛛网', range: 2.2 }];
      }
      if (cobweb1 && !cobweb1.broken) {
        return [{ id: 'ender_web_1', pos: { x: 21.15, y: 8, z: 65.5 }, kind: 'block', label: '剪蛛网', range: 2.2 }];
      }
    }

    if (phase === 'yard') {
      const curLock = cellPadlocks[padlockIdx];
      if (curLock && !curLock.broken) {
        return [{ id: curLock.id, pos: { x: CELL_KEY_SPOT.x, y: 8, z: CELL_KEY_SPOT.z }, kind: 'block', label: CELL_KEY_SPOT.label, range: 2.2 }];
      }
      if (cellDoorBreakable && !cellDoorBreakable.broken) {
        return [{ id: 'ender_cell_door', pos: { ...PRISON_CELL_FRONT }, kind: 'block', label: '牢房门', range: 2.1 }];
      }
    }

    return [{ id: 'ender_rescue_wait', pos: { ...PRISON_SAFE_OUTSIDE }, kind: 'wait', label: '小末', range: 2.4 }];
  },

  pointer(ctx) {
    const t = qEnder.targets(ctx)[0];
    return t ? { x: t.pos.x, y: (t.pos.y ?? 8) + 1.4, z: t.pos.z } : { x: 15.5, y: 9.5, z: 66.5 };
  },

  objective() {
    if (phase === 'to_end' || phase === 'end_seals') {
      return { icon: '🔮', have: Math.min(sealIdx, END_SEAL_SPOTS.length), need: END_SEAL_SPOTS.length };
    }
    if (phase === 'end_cage') {
      return { icon: '🗝️', have: Math.min(cageBreakable?.hits ?? 0, 3), need: 3 };
    }
    if (phase === 'steal_cutscene' || phase === 'chase_portal' || phase === 'chase_house' || phase === 'chase_prison') {
      const step = phase === 'chase_house' ? 1 : phase === 'chase_prison' ? 2 : 0;
      return { icon: '👣', have: step, need: 3 };
    }
    if (phase === 'stones') {
      return { icon: '🟣', have: Math.min(stoneStep, 3), need: 3 };
    }
    if (phase === 'cobwebs') {
      const doneWebs = (cobweb0?.broken ? 1 : 0) + (cobweb1?.broken ? 1 : 0);
      return { icon: '🕸️', have: doneWebs, need: 2 };
    }
    if (phase === 'yard' && padlockIdx === 0) {
      return { icon: '🔑', have: 0, need: 1 };
    }
    const doorHits = phase === 'rescue' ? 3 : Math.min(cellDoorBreakable?.hits ?? 0, 3);
    return { icon: '🚪', have: doorHits, need: 3 };
  },

  introPos() {
    return { ...END_ENDER_INSIDE };
  },

  action() {
    return phase === 'yard' && cakesLeft > 0 ? { icon: '🎂', count: cakesLeft } : null;
  },

  cleanup(ctx) {
    active = false;
    playerArc = null;
    timers.clear();

    unpickExitPortal?.();
    unpickHouseTrail?.();
    unpickExitPortal = null;
    unpickHouseTrail = null;

    for (const s of stoneEntries) {
      s.unpick?.();
      s.unpick = null;
      ctx?.world?.setBlock?.(s.bx, 7, s.bz, B.OBSIDIAN);
    }
    if (prisonGroup) {
      prisonGroup.visible = false;
      detachFromScene(prisonGroup);
    }
    if (trailGroup) {
      trailGroup.visible = false;
      detachFromScene(trailGroup);
    }
    for (const s of endSeals) s.destroy();
    endSeals.length = 0;
    cageBreakable?.destroy();
    cobweb0?.destroy();
    cobweb1?.destroy();
    for (const p of cellPadlocks) p.destroy();
    cellPadlocks.length = 0;
    cellDoorBreakable?.destroy();
    cageBreakable = null;
    cobweb0 = null;
    cobweb1 = null;
    cellDoorBreakable = null;

    if (enderContestant) {
      enderContestant.setEmote(null);
      enderContestant.setVisible(false);
      detachFromScene(enderContestant.group);
    }
    for (const m of cagedEndermen) {
      m.setVisible(false);
      detachFromScene(m.group);
    }
    ctx?.rival?.leave?.();
  },
};

export default qEnder;
