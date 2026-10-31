// Quest 1: sheep — 花花 (Flower trail & bouquet sneeze, docs/DESIGN.md §6.1 & #143).
// Tutorial quest: first beacon is 6 blocks south of spawn (48,66) -> (48,8,72). NO rival appearance.
// #143 mechanics: no pre-planted sparkly flowers; trots 1.3 b/s across 13x12+ meadow;
// only every 3rd flower sparkles and stops sparkling after 8 s -> chase fresh ones.

import * as THREE from '../../vendor/three.module.min.js';
import {
  poi,
  surfaceY,
  playerPos,
  distXZ,
  rngInt,
  rngPick,
  createTimers,
  createCollectible,
  createPatrol,
  emitGag,
  playSfx,
  registerPick,
  acquireActor,
  sharedBoxGeo,
  sharedLambertMat,
  attachToScene,
  detachFromScene,
} from './kit.js';

const FLOWER_COLORS = [0xe23226, 0xf5d623, 0x466eeb, 0xf282c4, 0xb865ed];
const MAX_LIVE_FLOWERS = 24;
const NEED_FLOWERS = 5;
const FLOWER_DROP_SEC = 1.45;
const SPARKLE_TTL_SEC = 8.0;

let sheepActor = null;
let sheepUnpick = null;
let flockActors = [];
let bouquetGroup = null;
let patrol = null;
let timers = null;

let flowers = [];
let plantedCount = 0;
let pickedCount = 0;
let finishing = false;
let sheepPos = { x: 48.5, y: 8, z: 72.5 };
let nextFlowerId = 1;

function buildBouquetMesh() {
  const g = new THREE.Group();
  const wrap = new THREE.Mesh(sharedBoxGeo(0.24, 0.32, 0.24), sharedLambertMat(0xf5e6ca));
  wrap.position.y = 0.16;
  g.add(wrap);
  const offsets = [
    [-0.1, 0.36, -0.06, 0xe23226],
    [0.1, 0.38, -0.04, 0xf5d623],
    [0.0, 0.42, 0.08, 0xf282c4],
    [-0.08, 0.35, 0.09, 0x466eeb],
    [0.09, 0.35, 0.08, 0xb865ed],
  ];
  for (const [ox, oy, oz, col] of offsets) {
    const b = new THREE.Mesh(sharedBoxGeo(0.16, 0.14, 0.16), sharedLambertMat(col));
    b.position.set(ox, oy, oz);
    g.add(b);
  }
  g.visible = false;
  return g;
}

function plantTrailFlower(ctx, atPos, forceSparkle = null) {
  plantedCount += 1;
  // Every 3rd flower sparkles (3, 6, 9, 12, 15...) — zero sparkly flowers pre-planted at start
  const isSparkly = forceSparkle !== null ? forceSparkle : plantedCount % 3 === 0;

  // Enforce <= 24 live flowers; recycle oldest non-sparkly flower first
  while (flowers.length >= MAX_LIVE_FLOWERS) {
    let idx = flowers.findIndex((f) => !f.sparkle);
    if (idx < 0) idx = 0;
    const old = flowers.splice(idx, 1)[0];
    old?.destroy?.();
  }

  const fx = atPos.x + rngInt(ctx, -2, 2) * 0.14;
  const fz = atPos.z + rngInt(ctx, -2, 2) * 0.14;
  const fy = surfaceY(ctx, fx, fz, 8);
  const color = rngPick(ctx, FLOWER_COLORS) || 0xf282c4;
  const fid = `sheep_flower_${nextFlowerId++}`;

  const item = createCollectible(ctx, {
    id: fid,
    pos: { x: fx, y: fy, z: fz },
    item: isSparkly ? 'sparkle_flower' : 'trail_flower',
    color,
    stemColor: 0x3fae3a,
    accentColor: isSparkly ? 0xfff3b0 : 0xffe066,
    sparkle: isSparkly,
    sparkleTtl: isSparkly ? SPARKLE_TTL_SEC : 0,
    sparkleColor: 0xffe066,
    size: isSparkly ? 0.44 : 0.3,
    bobAmp: isSparkly ? 0.14 : 0.03,
    autoPickupRadius: isSparkly ? 1.2 : 0,
    range: 2.35,
    label: isSparkly ? '闪亮花朵' : '小花',
    fadedLabel: '小花',
    pitch: 0.95 + (pickedCount + 1) * 0.14,
    onCollect: (api) => {
      if (finishing || pickedCount >= NEED_FLOWERS) return;
      pickedCount += 1;
      const pitch = 0.92 + pickedCount * 0.14;
      playSfx(ctx, 'xp', { pos: { x: fx, y: fy + 0.5, z: fz }, pitch });
      ctx?.events?.emit?.('questStep', { id: 'sheep', step: pickedCount });
      if (pickedCount >= NEED_FLOWERS) {
        if (bouquetGroup) bouquetGroup.visible = true;
        sheepActor?.setEmote?.('🌸');
        sheepActor?.setAnim?.('wave');
        playSfx(ctx, 'baa', { pos: sheepPos, pitch: 1.15 });
      }
    },
  });

  if (isSparkly) {
    ctx?.fx?.sparkles?.({ x: fx, y: fy + 0.4, z: fz }, 5, { toPlayer: false });
  }
  flowers.push(item);
  return item;
}

function triggerBouquetGag(ctx) {
  if (finishing) return;
  finishing = true;
  if (bouquetGroup) bouquetGroup.visible = false;

  const gPos = { x: sheepPos.x, y: sheepPos.y + 0.9, z: sheepPos.z };
  sheepActor?.lookAt?.(playerPos(ctx));
  sheepActor?.setAnim?.('eat');
  sheepActor?.setEmote?.('😋');
  playSfx(ctx, 'munch', { pos: gPos });
  ctx?.fx?.burst?.(gPos, 0xf282c4, 12);

  timers.after(0.6, () => {
    const sPos = { x: sheepPos.x, y: sheepPos.y + 1.0, z: sheepPos.z };
    sheepActor?.setAnim?.('sneeze');
    sheepActor?.setEmote?.('❤');
    playSfx(ctx, 'sneeze', { pos: sPos });
    ctx?.fx?.burst?.(sPos, 0xff85c0, 18);
    ctx?.fx?.confetti?.(sPos, 28);
    ctx?.fx?.hearts?.(sPos, 16);
    emitGag(ctx, 'sheep', 'sheep_eats_bouquet', sPos);
  });

  timers.after(1.2, () => {
    ctx?.quests?.complete?.('sheep');
  });
}

const qSheep = {
  id: 'sheep',
  contestantId: 'sheep',
  area: 'hub',
  poi: 'meadow',
  order: 1,

  start(ctx) {
    qSheep.cleanup(ctx);
    timers = createTimers();
    flowers = [];
    plantedCount = 0;
    pickedCount = 0;
    finishing = false;
    nextFlowerId = 1;

    const base = poi(ctx, 'meadow', { x: 48.5, y: 8, z: 72.5 });
    const sy = surfaceY(ctx, base.x, base.z, 8);
    sheepPos = { x: base.x, y: sy, z: base.z };

    // 13x12 block meadow trot loop across flat y=8 south meadow (#143: 1.3 b/s, >= 12x12)
    const waypoints = [
      { x: 48.5, y: 8, z: 72.5 },
      { x: 56.5, y: 8, z: 73.5 },
      { x: 55.5, y: 8, z: 82.5 },
      { x: 44.5, y: 8, z: 82.5 },
      { x: 43.5, y: 8, z: 74.5 },
      { x: 50.5, y: 8, z: 70.5 },
    ].map((wp) => ({ x: wp.x, y: surfaceY(ctx, wp.x, wp.z, 8), z: wp.z }));

    patrol = createPatrol(waypoints, { speed: 1.3, pauseSec: 0.08 });

    if (ctx?.chars?.create) {
      sheepActor = acquireActor(ctx, 'q_sheep:main', 'sheep', {
        id: 'sheep_contestant',
        pos: sheepPos,
        anim: 'walk',
      });
      sheepUnpick = registerPick(ctx, sheepActor.group, {
        id: 'sheep_give',
        targetId: 'sheep_give',
        entityId: 'sheep',
        kind: 'entity',
        label: '花花',
        hitRadius: 1.15,
      });

      const flockOffsets = [[-6.5, 4.5], [6.5, 5.5]];
      for (let fi = 0; fi < flockOffsets.length; fi++) {
        const [dx, dz] = flockOffsets[fi];
        const mx = base.x + dx;
        const mz = base.z + dz;
        const my = surfaceY(ctx, mx, mz, sy);
        const mob = acquireActor(ctx, `q_sheep:flock_${fi}`, 'sheepMob', {
          pos: { x: mx, y: my, z: mz },
          anim: 'idle',
        });
        if (mob) flockActors.push(mob);
      }
    }

    bouquetGroup = buildBouquetMesh();
    attachToScene(ctx, bouquetGroup);

    // No pre-planted sparkly flowers (#143); drop trail flowers every 1.45 s as 花花 trots
    timers.every(FLOWER_DROP_SEC, () => {
      if (finishing) return;
      if (pickedCount < NEED_FLOWERS) {
        plantTrailFlower(ctx, sheepPos);
      }
    });

    timers.every(4.5, () => {
      if (!finishing) playSfx(ctx, 'baa', { pos: sheepPos, pitch: 1.05 });
    });
  },

  update(dt, ctx) {
    if (!timers) return;
    timers.update(dt);

    if (!finishing) {
      if (pickedCount < NEED_FLOWERS && patrol) {
        const np = patrol.step(dt, sheepActor);
        sheepPos = { x: np.x, y: surfaceY(ctx, np.x, np.z, np.y), z: np.z };
        if (sheepActor?.group) sheepActor.group.position.set(sheepPos.x, sheepPos.y, sheepPos.z);
      } else if (sheepActor) {
        sheepActor.lookAt?.(playerPos(ctx));
        sheepActor.setAnim?.('wave');
        sheepActor.update?.(dt);
      }
    } else {
      sheepActor?.update?.(dt);
    }

    for (const mob of flockActors) {
      mob.update?.(dt);
    }

    for (let i = flowers.length - 1; i >= 0; i--) {
      const f = flowers[i];
      f.update(dt, ctx);
      if (f.collected || f.expired) {
        flowers.splice(i, 1);
      }
    }

    if (bouquetGroup && bouquetGroup.visible) {
      const pp = playerPos(ctx);
      bouquetGroup.position.set(pp.x + 0.42, pp.y + 0.85, pp.z - 0.35);
      bouquetGroup.rotation.y += dt * 2.4;
    }
  },

  onTap(hit, ctx) {
    if (finishing) return true;

    if (hit?.targetId === 'sheep_follow_wait') {
      playSfx(ctx, 'baa', { pos: sheepPos, pitch: 1.08 });
      return true;
    }

    if (pickedCount < NEED_FLOWERS) {
      for (let i = 0; i < flowers.length; i++) {
        const f = flowers[i];
        if (f.sparkle && !f.collected && f.matchesHit(hit)) {
          f.collect(ctx);
          flowers.splice(i, 1);
          return true;
        }
      }
      for (let i = 0; i < flowers.length; i++) {
        const f = flowers[i];
        if (!f.sparkle && !f.collected && f.matchesHit(hit)) {
          ctx?.fx?.burst?.(f.pos, 0xf5d623, 5);
          playSfx(ctx, 'hit_soft', { pos: f.pos });
          f.destroy();
          flowers.splice(i, 1);
          return true;
        }
      }
      if (hit?.entityId === 'sheep' || (hit?.pos && distXZ(hit.pos, sheepPos) <= 2.2)) {
        playSfx(ctx, 'baa', { pos: sheepPos, pitch: 1.08 });
        sheepActor?.setEmote?.('🌸');
        return true;
      }
      return false;
    }

    if (
      hit?.targetId === 'sheep_give' ||
      hit?.entityId === 'sheep' ||
      (hit?.pos && distXZ(hit.pos, sheepPos) <= 2.5)
    ) {
      triggerBouquetGag(ctx);
      return true;
    }
    return false;
  },

  onAction(ctx) {},

  targets(ctx) {
    if (finishing) {
      return [
        {
          id: 'sheep_finishing_wait',
          pos: { x: sheepPos.x, y: sheepPos.y + 0.8, z: sheepPos.z },
          kind: 'wait',
          label: '花花',
          range: 2.5,
        },
      ];
    }

    if (pickedCount < NEED_FLOWERS) {
      const pPos = playerPos(ctx);
      const sparkly = flowers
        .filter((f) => f.sparkle && !f.collected && !f.expired)
        .sort((a, b) => distXZ(a.pos, pPos) - distXZ(b.pos, pPos))
        .map((f) => f.target())
        .filter(Boolean);

      if (sparkly.length > 0) return sparkly;

      // Follow 花花 as she trots the meadow dropping fresh blossoms (never spawn inside targets()!)
      return [
        {
          id: 'sheep_follow_wait',
          pos: { x: sheepPos.x, y: sheepPos.y + 0.6, z: sheepPos.z },
          kind: 'wait',
          label: '跟着花花',
          range: 2.5,
        },
      ];
    }

    return [
      {
        id: 'sheep_give',
        pos: { x: sheepPos.x, y: sheepPos.y + 0.8, z: sheepPos.z },
        kind: 'entity',
        label: '送花给花花',
        range: 2.4,
      },
    ];
  },

  pointer(ctx) {
    const ts = qSheep.targets(ctx);
    const first = ts[0]?.pos || sheepPos;
    return { x: first.x, y: (first.y ?? 8) + 0.9, z: first.z };
  },

  objective(ctx) {
    return { icon: '🌸', have: Math.min(pickedCount, NEED_FLOWERS), need: NEED_FLOWERS };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    timers?.clear?.();
    timers = null;
    for (const f of flowers) f.destroy?.();
    flowers = [];
    sheepUnpick?.();
    sheepUnpick = null;
    if (sheepActor?.group) detachFromScene(sheepActor.group);
    sheepActor = null;
    for (const mob of flockActors) {
      if (mob?.group) detachFromScene(mob.group);
    }
    flockActors = [];
    if (bouquetGroup) detachFromScene(bouquetGroup);
    bouquetGroup = null;
    finishing = false;
  },
};

export default qSheep;
