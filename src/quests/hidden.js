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

function buildDragonEggMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(sharedBoxGeo(0.76, 0.42, 0.76), sharedLambertMat(0x1f102e));
  base.position.y = 0.21;
  const mid = new THREE.Mesh(sharedBoxGeo(0.62, 0.36, 0.62), sharedLambertMat(0x2b1540));
  mid.position.y = 0.56;
  const tip = new THREE.Mesh(sharedBoxGeo(0.4, 0.24, 0.4), sharedLambertMat(0x3a1c54));
  tip.position.y = 0.84;
  const rune1 = new THREE.Mesh(sharedBoxGeo(0.66, 0.1, 0.18), sharedBasicMat(0xd946ef));
  rune1.position.y = 0.52;
  const rune2 = new THREE.Mesh(sharedBoxGeo(0.18, 0.1, 0.66), sharedBasicMat(0xa855f7));
  rune2.position.y = 0.36;
  g.add(base, mid, tip, rune1, rune2);
  return g;
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

    eggGroup = buildDragonEggMesh();
    eggGroup.position.set(currentEggPos.x, currentEggPos.y, currentEggPos.z);
    eggGroup.visible = (ctx?.state?.area || 'hub') === 'end';
    attachToScene(ctx, eggGroup);

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
      eggGroup.rotation.y += dt * 1.4;
      eggGroup.position.y = currentEggPos.y + Math.sin((ctx?.time ?? 0) * 4.0) * 0.08;
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
        // §6 H1: Egg teleports 3x!
        playSfx(ctx, 'vwoop', { pos: oldPos, pitch: 0.95 + eggTapCount * 0.12 });
        ctx?.fx?.burst?.({ x: oldPos.x, y: oldPos.y + 0.5, z: oldPos.z }, 0xa855f7, 16);
        emitGag(ctx, 'dragon', 'egg_hop', oldPos);

        const nextSpot = EGG_HOP_SPOTS[Math.min(eggTapCount, EGG_HOP_SPOTS.length - 1)];
        const ny = surfaceY(ctx, nextSpot.x, nextSpot.z, nextSpot.y);
        currentEggPos = { x: nextSpot.x, y: ny, z: nextSpot.z };
        if (eggGroup) eggGroup.position.set(currentEggPos.x, currentEggPos.y, currentEggPos.z);
        ctx?.fx?.sparkles?.(currentEggPos, 10, { toPlayer: false });
        return true;
      }

      // 4th tap: HATCH 龙宝宝!
      dragonFinishing = true;
      if (eggGroup) eggGroup.visible = false;
      eggUnpick?.();

      playSfx(ctx, 'fanfare', { pos: oldPos });
      ctx?.fx?.burst?.({ x: oldPos.x, y: oldPos.y + 0.7, z: oldPos.z }, 0xd946ef, 24);
      ctx?.fx?.confetti?.(oldPos, 50);
      ctx?.fx?.sparkles?.(oldPos, 18, { toPlayer: true });
      ctx?.events?.emit?.('spawnBig', { pos: oldPos, kind: 'dragon' });
      emitGag(ctx, 'dragon', 'egg_hop', oldPos);

      if (ctx?.chars?.create) {
        dragonActor = acquireActor(ctx, 'hidden:dragon', 'dragon', {
          id: 'dragon_contestant',
          pos: oldPos,
          anim: 'spawn',
        });
        dragonActor?.setEmote?.('💜');
        dragonActor?.lookAt?.(playerPos(ctx));
      }

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
    return { icon: '🌷', have: pinkFinishing ? 2 : hasPinkTulip ? 1 : 0, need: 2 };
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
