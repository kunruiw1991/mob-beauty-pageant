// Hidden Contestants per docs/DESIGN.md §4, §6 (owner: quests-a):
// - H1 dragon (龙宝宝): End tallest pillar egg teleports 3x ('egg_hop'), 4th tap hatches.
// - H2 pinksheep (粉粉): Pink tulip at jungle-meadow edge -> white sheep turns pink ('pink_dye'), 贝拉 hugs her.
// Also provides createHiddenController(ctx) for passive world discovery + sparkle hints after quest 5.

import * as THREE from '../../vendor/three.module.min.js';
import { B } from '../world/blocks.js';
import {
  poi,
  surfaceY,
  playerPos,
  distXZ,
  dist3,
  createTimers,
  createCollectible,
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

// ===========================================================================
// H1: DRAGON (龙宝宝)
// ===========================================================================

let dragonTimers = null;
let eggGroup = null;
let hopFxGroup = null;
let hopAnimState = null;
let eggUnpick = null;
let dragonActor = null;
let eggTapCount = 0;
let dragonFinishing = false;
let eggRestoredVoxel = null;

const EGG_HOP_SPOTS = [
  { x: 152.5, y: 17.0, z: 26.5 }, // Tallest obsidian pillar top (staircase lands at 153.5, 17, 26.5)
  { x: 148.5, y: 8.0, z: 34.5 },
  { x: 156.5, y: 8.0, z: 37.5 },
  { x: 152.5, y: 8.0, z: 46.5 },
];
let currentEggPos = { ...EGG_HOP_SPOTS[0] };

// #183 R3: Full 1-block Minecraft Dragon Egg (~1.04 x 1.20 x 1.04) with crisp silhouette & glowing Ender spots
function buildDragonEggMesh({ ghost = false } = {}) {
  const g = new THREE.Group();
  const matShellA = ghost
    ? sharedBasicMat(0x9333ea, { transparent: true, opacity: 0.48 })
    : sharedBasicMat(0x240d3d);
  const matShellB = ghost
    ? sharedBasicMat(0xc084fc, { transparent: true, opacity: 0.55 })
    : sharedBasicMat(0x3f1868);
  const matTrim = ghost
    ? sharedBasicMat(0xd8b4fe, { transparent: true, opacity: 0.62 })
    : sharedBasicMat(0x6b21a8);
  const matRuneA = ghost
    ? sharedBasicMat(0xfdf4ff, { transparent: true, opacity: 0.82 })
    : sharedBasicMat(0xf0abfc);
  const matRuneB = ghost
    ? sharedBasicMat(0xe879f9, { transparent: true, opacity: 0.76 })
    : sharedBasicMat(0xd946ef);
  const matGlowRim = sharedBasicMat(0xc084fc, { transparent: true, opacity: ghost ? 0.34 : 0.62 });

  const halo = new THREE.Mesh(sharedBoxGeo(1.18, 0.06, 1.18), matGlowRim);
  halo.position.y = 0.03;

  // Stepped 1-block voxel Dragon Egg silhouette with subtle violet edge trim so every tier pops against dark End sky
  const baseTrim = new THREE.Mesh(sharedBoxGeo(0.9, 0.2, 0.9), matTrim);
  baseTrim.position.y = 0.1;
  const base = new THREE.Mesh(sharedBoxGeo(0.86, 0.21, 0.86), matShellA);
  base.position.y = 0.1;

  const bellyTrim = new THREE.Mesh(sharedBoxGeo(1.06, 0.34, 1.06), matTrim);
  bellyTrim.position.y = 0.36;
  const belly = new THREE.Mesh(sharedBoxGeo(1.02, 0.35, 1.02), matShellB);
  belly.position.y = 0.36;

  const midTrim = new THREE.Mesh(sharedBoxGeo(0.94, 0.26, 0.94), matTrim);
  midTrim.position.y = 0.66;
  const mid = new THREE.Mesh(sharedBoxGeo(0.9, 0.27, 0.9), matShellA);
  mid.position.y = 0.66;

  const shoulder = new THREE.Mesh(sharedBoxGeo(0.72, 0.2, 0.72), matShellB);
  shoulder.position.y = 0.89;
  const crown = new THREE.Mesh(sharedBoxGeo(0.48, 0.15, 0.48), matShellA);
  crown.position.y = 1.06;
  const tip = new THREE.Mesh(sharedBoxGeo(0.28, 0.11, 0.28), matRuneA);
  tip.position.y = 1.19;

  // Signature Minecraft Dragon Egg magenta/violet pixel spots on all 4 faces
  const bandBellyX = new THREE.Mesh(sharedBoxGeo(1.08, 0.13, 0.24), matRuneA);
  bandBellyX.position.set(0, 0.4, 0.14);
  const bandBellyZ = new THREE.Mesh(sharedBoxGeo(0.24, 0.13, 1.08), matRuneB);
  bandBellyZ.position.set(-0.15, 0.3, 0);
  const bandMidX = new THREE.Mesh(sharedBoxGeo(0.96, 0.12, 0.22), matRuneB);
  bandMidX.position.set(0, 0.67, -0.12);
  const bandMidZ = new THREE.Mesh(sharedBoxGeo(0.22, 0.12, 0.96), matRuneA);
  bandMidZ.position.set(0.14, 0.64, 0);
  const bandTopX = new THREE.Mesh(sharedBoxGeo(0.76, 0.1, 0.2), matRuneA);
  bandTopX.position.set(0, 0.9, 0);
  const bandTopZ = new THREE.Mesh(sharedBoxGeo(0.2, 0.1, 0.76), matRuneB);
  bandTopZ.position.set(0, 0.88, 0);

  g.add(
    halo,
    baseTrim,
    base,
    bellyTrim,
    belly,
    midTrim,
    mid,
    shoulder,
    crown,
    tip,
    bandBellyX,
    bandBellyZ,
    bandMidX,
    bandMidZ,
    bandTopX,
    bandTopZ
  );
  g.traverse((n) => {
    if (n.isMesh) n.frustumCulled = false;
  });
  return g;
}

function buildHopFxGroup(ctx) {
  const root = new THREE.Group();
  root.visible = false;

  const poofPuffs = [];
  const poofColors = [0xffffff, 0xfaf5ff, 0xf3e8ff, 0xe9d5ff];
  for (let i = 0; i < 12; i++) {
    const sz = 0.24 + (i % 3) * 0.06;
    const m = new THREE.Mesh(
      sharedBoxGeo(sz, sz * 0.82, sz),
      sharedBasicMat(poofColors[i % poofColors.length], { transparent: true, opacity: 0.9 })
    );
    m.frustumCulled = false;
    root.add(m);
    poofPuffs.push(m);
  }

  const vortexSparks = [];
  const portalColors = [0xd946ef, 0xa855f7, 0xc084fc, 0xf0abfc];
  for (let i = 0; i < 18; i++) {
    const sz = 0.14 + (i % 3) * 0.04;
    const m = new THREE.Mesh(
      sharedBoxGeo(sz, sz, sz),
      sharedBasicMat(portalColors[i % portalColors.length])
    );
    m.frustumCulled = false;
    root.add(m);
    vortexSparks.push(m);
  }

  const trailNodes = [];
  for (let i = 0; i < 20; i++) {
    const isPoof = i % 2 === 0;
    const sz = isPoof ? 0.32 - i * 0.006 : 0.22 - i * 0.004;
    const m = new THREE.Mesh(
      sharedBoxGeo(sz, sz, sz),
      isPoof
        ? sharedBasicMat(i % 4 === 0 ? 0xffffff : 0xf5d0fe, { transparent: true, opacity: 0.9 })
        : sharedBasicMat(i % 4 === 1 ? 0xd946ef : 0xa855f7)
    );
    m.frustumCulled = false;
    root.add(m);
    trailNodes.push(m);
  }

  const ghostEgg = buildDragonEggMesh({ ghost: true });
  root.add(ghostEgg);

  root.userData._parts = { poofPuffs, vortexSparks, trailNodes, ghostEgg };

  // Driver hook so portal vortex, poof cloud, trail, and 1-block egg wobble animate cleanly even while Gag-Cam pauses quest.update!
  const driver = poofPuffs[0];
  driver.renderOrder = -40;
  driver.onBeforeRender = () => {
    syncHopVisualAtTime(ctx);
  };

  return root;
}

function hopArcPoint(from, to, u) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizLen = Math.hypot(dx, dz) || 1;
  // Normal in XZ sweeping outward into open sky so the poof trail never hides behind the obsidian pillar
  const nx = -dz / horizLen;
  const nz = dx / horizLen;
  const sideBow = Math.sin(u * Math.PI) * 1.45;
  const arcLift = Math.sin(u * Math.PI) * 3.1 + (1 - u) * 0.45;
  return {
    x: from.x + dx * u + nx * sideBow,
    y: from.y + (to.y - from.y) * u + arcLift,
    z: from.z + dz * u + nz * sideBow,
  };
}

function syncHopVisualAtTime(ctx) {
  if (!hopAnimState || !hopFxGroup || !eggGroup || dragonFinishing) return;
  const now = ctx?.time ?? 0;
  const elapsed = Math.max(0, now - hopAnimState.startTime);
  const { from, to } = hopAnimState;
  const parts = hopFxGroup.userData._parts;
  if (!parts) return;

  if (elapsed >= 1.42) {
    hopFxGroup.visible = false;
    eggGroup.position.set(currentEggPos.x, currentEggPos.y, currentEggPos.z);
    eggGroup.rotation.set(0, now * 1.4, 0);
    eggGroup.scale.set(1, 1, 1);
    eggGroup.updateMatrixWorld(true);
    hopAnimState = null;
    return;
  }

  hopFxGroup.visible = (ctx?.state?.area || 'hub') === 'end';

  // Phase A (0 .. 0.88s, covers Gag-Cam mid-point 0.67s!):
  // Keep the full 1-block Dragon Egg floating cleanly above its launch poof cushion so its front face is 100% clear!
  if (elapsed < 0.88) {
    const wob = Math.sin(elapsed * 20.0);
    const lift = 0.36 + Math.sin(Math.min(1, elapsed / 0.88) * Math.PI) * 0.24;
    eggGroup.position.set(from.x, from.y + lift, from.z);
    eggGroup.rotation.set(wob * 0.12, 0.55 + elapsed * 2.2, Math.cos(elapsed * 16.0) * 0.14);
    const sq = 1.0 + Math.sin(elapsed * 15.0) * 0.06;
    eggGroup.scale.set(1.06 / Math.sqrt(sq), sq * 1.06, 1.06 / Math.sqrt(sq));
  } else {
    // Phase B (0.88 .. 1.42s): zip along the same parabolic hop arc into `to` (`currentEggPos`)!
    const zt = Math.min(1, (elapsed - 0.88) / 0.28);
    const pt = hopArcPoint(from, to, zt);
    eggGroup.position.set(pt.x, zt >= 0.99 ? to.y : pt.y, pt.z);
    eggGroup.rotation.set(0, now * 3.0, 0);
    const pop = zt < 0.5 ? 0.62 + zt * 0.76 : 1.0 + Math.sin((zt - 0.5) * Math.PI * 2) * 0.12;
    eggGroup.scale.setScalar(pop);
  }
  eggGroup.updateMatrixWorld(true);

  // 1. Fluffy white-lilac "POOF" launch cushion ringing the obsidian base UNDER the 1-block egg (never blocking its face!)
  const poofExpand = Math.min(1.18, 0.38 + elapsed * 1.05);
  parts.poofPuffs.forEach((m, i) => {
    const ang = (i / parts.poofPuffs.length) * Math.PI * 2 + elapsed * 1.2;
    const rad = (0.56 + (i % 3) * 0.18) * poofExpand;
    const py = 0.08 + (i % 3) * 0.09;
    m.position.set(from.x + Math.cos(ang) * rad, from.y + py, from.z + Math.sin(ang) * rad);
    m.rotation.set(0, ang, 0);
    const s = Math.max(0.2, 1.15 - elapsed * 0.45);
    m.scale.setScalar(s);
  });

  // 2. Swirling purple End-portal particles orbiting cleanly outside the 1-block egg silhouette
  parts.vortexSparks.forEach((m, i) => {
    const ang = (i / parts.vortexSparks.length) * Math.PI * 2 + elapsed * 4.8;
    const rad = 0.84 + (i % 3) * 0.18;
    const sy = 0.28 + ((i * 0.11 + elapsed * 1.15) % 1.35);
    m.position.set(from.x + Math.cos(ang) * rad, from.y + sy, from.z + Math.sin(ang) * rad);
    m.rotation.set(elapsed * 5 + i, elapsed * 4, 0);
  });

  // 3. High curved purple-portal + white-poof trail sweeping visibly toward `to` (`nextSpot`)!
  const reach = Math.min(1.0, elapsed / 0.48);
  parts.trailNodes.forEach((m, i) => {
    const u = ((i + 1) / (parts.trailNodes.length + 1)) * reach;
    const pt = hopArcPoint(from, to, u);
    const wobble = Math.sin(u * 12.0 - elapsed * 8.0) * 0.08;
    m.position.set(pt.x + wobble, pt.y, pt.z);
    m.rotation.set(elapsed * 3 + i, elapsed * 4 + i, 0);
    m.scale.setScalar(Math.max(0.32, 1.22 - u * 0.35));
  });

  // 4. Shimmering translucent ghost egg mid-hop along the poof trail pointing to `nextSpot`!
  const gu = Math.min(0.62, Math.max(0.24, elapsed * 0.56));
  const gpt = hopArcPoint(from, to, gu);
  parts.ghostEgg.visible = elapsed < 1.05;
  parts.ghostEgg.position.set(gpt.x, gpt.y, gpt.z);
  parts.ghostEgg.rotation.set(0.22, 0.55 + elapsed * 4.2, -0.24);
  parts.ghostEgg.scale.setScalar(0.76);

  hopFxGroup.updateMatrixWorld(true);
}

export const dragonQuest = {
  id: 'dragon',
  contestantId: 'dragon',
  area: 'end',
  poi: 'dragonEgg',
  order: 11,
  hidden: true,

  start(ctx) {
    dragonQuest.cleanup(ctx);
    dragonTimers = createTimers();
    eggTapCount = 0;
    dragonFinishing = false;

    const p0 = poi(ctx, 'dragonEgg', EGG_HOP_SPOTS[0]);
    currentEggPos = { x: 152.5, y: p0.y ?? 17, z: 26.5 };
    hopAnimState = null;

    eggGroup = buildDragonEggMesh();
    eggGroup.position.set(currentEggPos.x, currentEggPos.y, currentEggPos.z);
    eggGroup.visible = (ctx?.state?.area || 'hub') === 'end';
    attachToScene(ctx, eggGroup);

    hopFxGroup = buildHopFxGroup(ctx);
    attachToScene(ctx, hopFxGroup);

    eggUnpick = registerPick(ctx, eggGroup, {
      id: 'dragon_egg',
      targetId: 'dragon_egg',
      kind: 'entity',
      label: '龙蛋',
      area: 'end',
      hitRadius: 1.25,
    });
  },

  update(dt, ctx) {
    if (!dragonTimers) return;
    dragonTimers.update(dt);

    const inEnd = (ctx?.state?.area || 'hub') === 'end';
    if (eggGroup && !dragonFinishing) {
      eggGroup.visible = inEnd;
      if (hopAnimState) {
        syncHopVisualAtTime(ctx);
      } else {
        eggGroup.rotation.set(0, (ctx?.time ?? 0) * 1.4, 0);
        eggGroup.scale.set(1, 1, 1);
        eggGroup.position.set(
          currentEggPos.x,
          currentEggPos.y + Math.sin((ctx?.time ?? 0) * 4.0) * 0.08,
          currentEggPos.z
        );
      }
    }
    dragonActor?.update?.(dt);
  },

  onTap(hit, ctx) {
    if (dragonFinishing) return true;

    if ((ctx?.state?.area || 'hub') !== 'end') {
      if (hit?.targetId === 'dragon_portal') {
        if (typeof ctx?.areas?.setArea === 'function') ctx.areas.setArea('end');
        else {
          ctx?.world?.setArea?.('end');
          if (ctx?.state) ctx.state.area = 'end';
        }
        return true;
      }
      return false;
    }

    if (
      hit?.targetId === 'dragon_egg' ||
      (hit?.pos && dist3(hit.pos, currentEggPos) <= 2.6)
    ) {
      eggTapCount += 1;
      const oldPos = { ...currentEggPos };

      // Clear world B.DRAGON_EGG voxel on first hop so pillar top actually empties!
      if (eggTapCount === 1 && ctx?.world?.getBlock && ctx?.world?.setBlock) {
        const prev = ctx.world.getBlock(152, 17, 26);
        eggRestoredVoxel = { bx: 152, by: 17, bz: 26, prev };
        ctx.world.setBlock(152, 17, 26, B.AIR);
      }

      if (eggTapCount < 4) {
        // §6 H1 & #183 R3: 1-block egg teleports 3x with purple portal burst + "poof" trail to nextSpot!
        const nextSpot = EGG_HOP_SPOTS[Math.min(eggTapCount, EGG_HOP_SPOTS.length - 1)];
        const ny = surfaceY(ctx, nextSpot.x, nextSpot.z, nextSpot.y);
        currentEggPos = { x: nextSpot.x, y: ny, z: nextSpot.z };

        hopAnimState = {
          startTime: ctx?.time ?? 0,
          from: { ...oldPos },
          to: { ...currentEggPos },
        };
        syncHopVisualAtTime(ctx);

        playSfx(ctx, 'vwoop', { pos: oldPos, pitch: 0.95 + eggTapCount * 0.12 });
        playSfx(ctx, 'pop', { pos: oldPos, pitch: 1.15 });
        ctx?.fx?.burst?.({ x: oldPos.x, y: oldPos.y + 0.6, z: oldPos.z }, 0xa855f7, 26);
        ctx?.fx?.burst?.({ x: oldPos.x, y: oldPos.y + 0.4, z: oldPos.z }, 0xf5d0fe, 14);
        ctx?.fx?.sparkles?.(currentEggPos, 14, { toPlayer: false });
        emitGag(ctx, 'dragon', 'egg_hop', oldPos);
        return true;
      }

      // 4th tap: HATCH 龙宝宝!
      dragonFinishing = true;
      hopAnimState = null;
      if (hopFxGroup) hopFxGroup.visible = false;
      if (eggGroup) eggGroup.visible = false;
      eggUnpick?.();

      playSfx(ctx, 'fanfare', { pos: oldPos });
      ctx?.fx?.burst?.({ x: oldPos.x, y: oldPos.y + 0.7, z: oldPos.z }, 0xd946ef, 24);
      ctx?.fx?.confetti?.(oldPos, 50);
      ctx?.fx?.sparkles?.(oldPos, 18, { toPlayer: true });
      ctx?.events?.emit?.('spawnBig', { pos: oldPos, kind: 'dragon' });
      if (ctx?.chars?.create) {
        dragonActor = acquireActor(ctx, 'hidden:dragon', 'dragon', {
          id: 'dragon_contestant',
          pos: oldPos,
          anim: 'spawn',
        });
        dragonActor?.setEmote?.('💜');
        dragonActor?.lookAt?.({ x: oldPos.x + 1.2, y: oldPos.y, z: oldPos.z + 4.5 });
      }
      emitGag(ctx, 'dragon', 'egg_hop', oldPos);

      dragonTimers.after(0.85, () => {
        ctx?.quests?.complete?.('dragon');
      });
      return true;
    }
    return false;
  },

  onAction(ctx) {},

  targets(ctx) {
    if ((ctx?.state?.area || 'hub') !== 'end') {
      const ep = poi(ctx, 'endPortal', { x: 20.5, y: 8, z: 18.5 });
      return [
        {
          id: 'dragon_portal',
          pos: { x: ep.x, y: ep.y + 0.5, z: ep.z },
          kind: 'portal',
          label: '前往末地',
          range: 2.2,
        },
      ];
    }
    if (dragonFinishing) {
      return [
        {
          id: 'dragon_hatching',
          pos: { x: currentEggPos.x, y: currentEggPos.y + 0.9, z: currentEggPos.z },
          kind: 'entity',
          label: '龙宝宝',
          range: 3.5,
        },
      ];
    }
    return [
      {
        id: 'dragon_egg',
        // Stand on adjacent top landing (153.5, 17, 26.5) on tap 0, then ground spots
        pos:
          eggTapCount === 0
            ? { x: 153.2, y: currentEggPos.y + 0.5, z: 26.5 }
            : { x: currentEggPos.x, y: currentEggPos.y + 0.5, z: currentEggPos.z },
        kind: 'entity',
        label: '神秘龙蛋',
        range: 2.9,
      },
    ];
  },

  pointer(ctx) {
    const first = dragonQuest.targets(ctx)[0]?.pos || currentEggPos;
    return { x: first.x, y: (first.y ?? 8) + 1.0, z: first.z };
  },

  objective(ctx) {
    return { icon: '🥚', have: Math.min(eggTapCount, 4), need: 4 };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    dragonTimers?.clear?.();
    dragonTimers = null;
    eggUnpick?.();
    eggUnpick = null;
    if (eggGroup) detachFromScene(eggGroup);
    eggGroup = null;
    if (hopFxGroup) detachFromScene(hopFxGroup);
    hopFxGroup = null;
    hopAnimState = null;
    if (dragonActor?.group) detachFromScene(dragonActor.group);
    dragonActor = null;
    if (eggRestoredVoxel && !ctx?.state?.contestants?.dragon?.found) {
      ctx?.world?.setBlock?.(eggRestoredVoxel.bx, eggRestoredVoxel.by, eggRestoredVoxel.bz, eggRestoredVoxel.prev);
    }
    eggRestoredVoxel = null;
    dragonFinishing = false;
  },
};

// ===========================================================================
// H2: PINKSHEEP (粉粉)
// ===========================================================================

let pinkTimers = null;
let tulipCollectible = null;
let whiteSheepActor = null;
let whiteSheepUnpick = null;
let pinkSheepActor = null;
let pinkBelaActor = null;
let hasPinkTulip = false;
let pinkFinishing = false;
let tulipRestoredVoxel = null;

let tulipPos = { x: 33.5, y: 8, z: 72.5 };
let whiteSheepPos = { x: 43.5, y: 8, z: 71.5 };

function dyeWhiteSheepPink(ctx) {
  if (pinkFinishing) return;
  pinkFinishing = true;

  if (whiteSheepActor) whiteSheepActor.setVisible?.(false);
  whiteSheepUnpick?.();

  const fxPos = { x: whiteSheepPos.x, y: whiteSheepPos.y + 0.9, z: whiteSheepPos.z };
  playSfx(ctx, 'pop', { pos: fxPos, pitch: 1.2 });
  playSfx(ctx, 'baa', { pos: fxPos, pitch: 1.3 });
  ctx?.fx?.burst?.(fxPos, 0xff8fab, 24);
  ctx?.fx?.hearts?.(fxPos, 18);
  ctx?.fx?.sparkles?.(fxPos, 14, { toPlayer: true });

  if (ctx?.chars?.create) {
    pinkSheepActor = acquireActor(ctx, 'hidden:pinksheep', 'pinksheep', {
      id: 'pinksheep_contestant',
      pos: whiteSheepPos,
      anim: 'happy',
    });
    pinkSheepActor?.setEmote?.('💗');

    // §6 H2: 贝拉 runs over to hug "her" pink sheep (video 7:55)!
    const belaSpawn = {
      x: whiteSheepPos.x + 5.0,
      y: surfaceY(ctx, whiteSheepPos.x + 5.0, whiteSheepPos.z - 2.5, 8),
      z: whiteSheepPos.z - 2.5,
    };
    pinkBelaActor = acquireActor(ctx, 'hidden:pink_bela', 'bela', {
      id: 'pinksheep_bela',
      pos: belaSpawn,
      anim: 'walk',
    });
    pinkBelaActor?.setEmote?.('❤');
    pinkBelaActor?.moveTo?.({ x: whiteSheepPos.x + 1.1, y: whiteSheepPos.y, z: whiteSheepPos.z - 0.4 }, 5.0);
  }

  emitGag(ctx, 'pinksheep', 'pink_dye', fxPos);

  pinkTimers.after(0.95, () => {
    ctx?.quests?.complete?.('pinksheep');
  });
}

export const pinksheepQuest = {
  id: 'pinksheep',
  contestantId: 'pinksheep',
  area: 'hub',
  poi: 'pinkTulip',
  order: 12,
  hidden: true,

  start(ctx) {
    pinksheepQuest.cleanup(ctx);
    pinkTimers = createTimers();
    hasPinkTulip = false;
    pinkFinishing = false;

    const tp = poi(ctx, 'pinkTulip', { x: 33.5, y: 8, z: 72.5 });
    tulipPos = { x: tp.x, y: surfaceY(ctx, tp.x, tp.z, 8), z: tp.z };
    whiteSheepPos = { x: 43.5, y: surfaceY(ctx, 43.5, 71.5, 8), z: 71.5 };

    tulipCollectible = createCollectible(ctx, {
      id: 'pink_tulip',
      pos: tulipPos,
      item: 'pink_tulip',
      color: 0xff6b9d,
      stemColor: 0x3fae3a,
      accentColor: 0xffe5ec,
      sparkle: true,
      sparkleColor: 0xff8fab,
      size: 0.46,
      autoPickupRadius: 1.75,
      label: '粉红郁金香',
      pitch: 1.25,
      onCollect: () => {
        hasPinkTulip = true;
        if (ctx?.world?.getBlock && ctx?.world?.setBlock) {
          const bx = Math.floor(tulipPos.x);
          const bz = Math.floor(tulipPos.z);
          const prev = ctx.world.getBlock(bx, 8, bz);
          tulipRestoredVoxel = { bx, by: 8, bz, prev };
          ctx.world.setBlock(bx, 8, bz, B.AIR);
        }
        whiteSheepActor?.setEmote?.('🌷');
        ctx?.events?.emit?.('questStep', { id: 'pinksheep', step: 1 });
      },
    });

    if (ctx?.chars?.create) {
      whiteSheepActor = acquireActor(ctx, 'hidden:white_sheep', 'sheepMob', {
        id: 'pink_white_sheep',
        pos: whiteSheepPos,
        anim: 'idle',
      });
      whiteSheepUnpick = registerPick(ctx, whiteSheepActor.group, {
        id: 'white_sheep',
        targetId: 'white_sheep',
        entityId: 'pink_white_sheep',
        kind: 'entity',
        label: '小白羊',
        hitRadius: 1.15,
      });
    }
  },

  update(dt, ctx) {
    if (!pinkTimers) return;
    pinkTimers.update(dt);
    tulipCollectible?.update?.(dt, ctx);
    whiteSheepActor?.update?.(dt);
    pinkSheepActor?.update?.(dt);
    pinkBelaActor?.update?.(dt);
  },

  onTap(hit, ctx) {
    if (pinkFinishing) return true;

    if (!hasPinkTulip && tulipCollectible && tulipCollectible.matchesHit(hit)) {
      return tulipCollectible.collect(ctx);
    }

    if (
      hasPinkTulip &&
      (hit?.targetId === 'white_sheep' ||
        hit?.entityId === 'pink_white_sheep' ||
        (hit?.pos && distXZ(hit.pos, whiteSheepPos) <= 2.5))
    ) {
      dyeWhiteSheepPink(ctx);
      return true;
    }
    return false;
  },

  onAction(ctx) {},

  introPos(ctx) {
    return { x: whiteSheepPos.x, y: whiteSheepPos.y + 0.9, z: whiteSheepPos.z };
  },

  targets(ctx) {
    if (pinkFinishing) {
      return [
        {
          id: 'pinksheep_finishing',
          pos: { x: whiteSheepPos.x, y: whiteSheepPos.y + 0.8, z: whiteSheepPos.z },
          kind: 'entity',
          label: '粉粉',
          range: 3.5,
        },
      ];
    }
    if (!hasPinkTulip && tulipCollectible && !tulipCollectible.collected) {
      const t = tulipCollectible.target();
      if (t) return [t];
    }
    return [
      {
        id: 'white_sheep',
        pos: { x: whiteSheepPos.x, y: whiteSheepPos.y + 0.75, z: whiteSheepPos.z },
        kind: 'entity',
        label: '把粉郁金香送给小白羊',
        range: 2.8,
      },
    ];
  },

  pointer(ctx) {
    const first = pinksheepQuest.targets(ctx)[0]?.pos || tulipPos;
    return { x: first.x, y: (first.y ?? 8) + 0.9, z: first.z };
  },

  objective(ctx) {
    if (!hasPinkTulip) {
      return { icon: '🌷', have: 0, need: 1 };
    }
    return { icon: '🐑', have: pinkFinishing ? 1 : 0, need: 1 };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    pinkTimers?.clear?.();
    pinkTimers = null;
    tulipCollectible?.destroy?.();
    tulipCollectible = null;
    whiteSheepUnpick?.();
    whiteSheepUnpick = null;
    if (whiteSheepActor?.group) detachFromScene(whiteSheepActor.group);
    whiteSheepActor = null;
    if (pinkSheepActor?.group) detachFromScene(pinkSheepActor.group);
    pinkSheepActor = null;
    if (pinkBelaActor?.group) detachFromScene(pinkBelaActor.group);
    pinkBelaActor = null;
    if (tulipRestoredVoxel && !ctx?.state?.contestants?.pinksheep?.found) {
      ctx?.world?.setBlock?.(tulipRestoredVoxel.bx, tulipRestoredVoxel.by, tulipRestoredVoxel.bz, tulipRestoredVoxel.prev);
    }
    tulipRestoredVoxel = null;
    pinkFinishing = false;
  },
};

export const HIDDEN_QUESTS = [dragonQuest, pinksheepQuest];

// Passive world controller: sparkle hints after quest 5 (§6) + free-roam tap activation
export function createHiddenController(ctx) {
  let hintTimer = 0;

  function mainDoneCount(state) {
    if (!state?.quests) return 0;
    let n = 0;
    for (const [id, q] of Object.entries(state.quests)) {
      if (id !== 'dragon' && id !== 'pinksheep' && q?.status === 'done') n += 1;
    }
    return n;
  }

  function update(dt, uCtx = ctx) {
    const st = uCtx?.state;
    if (!st || st.scene !== 'world') return;

    // §6: sparkle hints after quest 5
    if (mainDoneCount(st) >= 5) {
      hintTimer += dt;
      if (hintTimer >= 2.2) {
        hintTimer = 0;
        if (st.area === 'hub' && !st.contestants?.pinksheep?.found && uCtx?.quests?.activeId?.() !== 'pinksheep') {
          const tp = poi(uCtx, 'pinkTulip', { x: 33.5, y: 8, z: 72.5 });
          uCtx?.fx?.sparkles?.({ x: tp.x, y: (tp.y ?? 8) + 0.8, z: tp.z }, 5, { toPlayer: false });
        } else if (st.area === 'end' && !st.contestants?.dragon?.found && uCtx?.quests?.activeId?.() !== 'dragon') {
          const ep = poi(uCtx, 'dragonEgg', { x: 152.5, y: 17, z: 26.5 });
          uCtx?.fx?.sparkles?.({ x: ep.x, y: (ep.y ?? 17) + 0.8, z: ep.z }, 5, { toPlayer: false });
        }
      }
    }
  }

  function onTap(hit, tCtx = ctx) {
    const st = tCtx?.state;
    if (!st || st.scene !== 'world') return false;
    // Only auto-start a hidden quest on free-roam tap when no quest is currently active
    if (tCtx?.quests?.active?.()) return false;

    if (st.area === 'hub' && !st.contestants?.pinksheep?.found && hit?.pos) {
      const tp = poi(tCtx, 'pinkTulip', { x: 33.5, y: 8, z: 72.5 });
      if (distXZ(hit.pos, tp) <= 2.4) {
        tCtx.quests?.activate?.('pinksheep');
        return pinksheepQuest.onTap({ ...hit, targetId: 'pink_tulip' }, tCtx);
      }
    }

    if (st.area === 'end' && !st.contestants?.dragon?.found && hit?.pos) {
      const ep = poi(tCtx, 'dragonEgg', { x: 152.5, y: 17, z: 26.5 });
      if (dist3(hit.pos, ep) <= 2.8) {
        tCtx.quests?.activate?.('dragon');
        return dragonQuest.onTap({ ...hit, targetId: 'dragon_egg' }, tCtx);
      }
    }
    return false;
  }

  return { update, onTap, cleanup() {} };
}

export default HIDDEN_QUESTS;
