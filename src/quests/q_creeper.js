// Quest 6: creeper — 嘶嘶 (Shy 2-hop backoff + 1.4s fuse cycle + 6 good pats [off-beat = 0 until mercy 8 pats] ->
// happy confetti boom + flower heart crater, docs/DESIGN.md §6.6 & #143).

import * as THREE from '../../vendor/three.module.min.js';
import { CONTESTANT_NAMES, QUEST_LABELS } from '../data/strings.js';
import {
  surfaceY,
  playerPos,
  distXZ,
  createTimers,
  emitGag,
  playSfx,
  registerPick,
  acquireActor,
  sharedBoxGeo,
  sharedCylinderGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
} from './kit.js';

const FUSE_PERIOD = 1.4; // #143: fuse cycle 1.4 s
const NEED_GOOD_PATS = 6; // #143: 6 good pats
const MERCY_TOTAL_PATS = 8; // #143: off-beat pats give 0 until mercy (8 pats)

// Verified walkable clearing spots around (26.5, 8, 58.5)
const BACKOFF_SPOTS = [
  { x: 29.5, y: 8, z: 56.5 }, // Initial spot (player starts at 35.5, 8, 52.5)
  { x: 23.5, y: 8, z: 60.5 }, // Backoff hop 1
  { x: 28.5, y: 8, z: 63.5 }, // Backoff hop 2
];

const SHUFFLE_SPOTS = [
  { x: 22.5, y: 8, z: 57.5 },
  { x: 30.5, y: 8, z: 55.5 },
  { x: 23.5, y: 8, z: 60.5 },
  { x: 31.5, y: 8, z: 60.5 },
  { x: 25.5, y: 8, z: 56.5 },
];

let creeperActor = null;
let creeperUnpick = null;
let cloudGroup = null;
let raindrops = [];
let flashAura = null;
let pulseRing = null;
let chickens = [];
let heartFlowers = [];
let timers = null;

let centerPos = { x: 28.5, y: 8, z: 57.5 };
let backoffHops = 0;
let shuffleIdx = 0;
let hopArc = null;
let fuseClock = 0;
let lastCycleIdx = -1;
let goodPats = 0;
let totalPats = 0;
let patCooldown = 0;
let finishing = false;

function buildRainCloud() {
  const g = new THREE.Group();
  const puffMain = new THREE.Mesh(sharedBoxGeo(0.95, 0.32, 0.65), sharedLambertMat(0x6c757d));
  const puffTop = new THREE.Mesh(sharedBoxGeo(0.58, 0.26, 0.48), sharedLambertMat(0x868e96));
  puffTop.position.set(0.08, 0.22, 0);
  g.add(puffMain, puffTop);

  raindrops = [];
  for (let i = 0; i < 3; i++) {
    const drop = new THREE.Mesh(sharedBoxGeo(0.08, 0.2, 0.08), sharedBasicMat(0x4dabf7));
    drop.position.set((i - 1) * 0.26, -0.25 - i * 0.18, 0);
    drop.userData.phase = i * 0.33;
    g.add(drop);
    raindrops.push(drop);
  }
  return g;
}

function startCreeperHop(ctx, dest, duration = 0.55) {
  const sy = surfaceY(ctx, dest.x, dest.z, 8);
  hopArc = {
    from: { ...centerPos },
    to: { x: dest.x, y: sy, z: dest.z },
    elapsed: 0,
    duration,
  };
  if (flashAura) flashAura.visible = false;
  creeperActor?.setAnim?.('hop');
  playSfx(ctx, 'boing', { pos: centerPos, pitch: 1.15 });
}

function syncCreeperAttachments(liftY = 0) {
  if (creeperActor?.group) {
    creeperActor.group.position.set(centerPos.x, centerPos.y + liftY, centerPos.z);
  }
  if (cloudGroup) {
    cloudGroup.position.x = centerPos.x;
    cloudGroup.position.z = centerPos.z;
  }
  if (flashAura) {
    flashAura.position.set(centerPos.x, centerPos.y + 0.95 + liftY, centerPos.z);
  }
  if (pulseRing) {
    pulseRing.position.set(centerPos.x, centerPos.y + 0.05, centerPos.z);
  }
}

function spawnFlowerHeartCrater(ctx, origin) {
  const palette = [0xff4d6d, 0xff85c0, 0xf2c318, 0xe23226, 0xff9ebb];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hz = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const wx = origin.x + hx * 0.14;
    const wz = origin.z + hz * 0.14;
    const wy = surfaceY(ctx, wx, wz, origin.y ?? 8);

    const fg = new THREE.Group();
    const stem = new THREE.Mesh(sharedBoxGeo(0.1, 0.28, 0.1), sharedLambertMat(0x3fae3a));
    stem.position.y = 0.14;
    const head = new THREE.Mesh(
      sharedBoxGeo(0.34, 0.24, 0.34),
      sharedLambertMat(palette[i % palette.length])
    );
    head.position.y = 0.3;
    fg.add(stem, head);
    fg.position.set(wx, wy, wz);
    attachToScene(ctx, fg);
    heartFlowers.push(fg);
  }
}

function triggerHappyConfettiBoom(ctx) {
  if (finishing) return;
  finishing = true;

  if (cloudGroup) cloudGroup.visible = false;
  if (flashAura) flashAura.visible = false;
  if (pulseRing) pulseRing.visible = false;

  const boomPos = { x: centerPos.x, y: centerPos.y + 1.1, z: centerPos.z };
  creeperActor?.setAnim?.('happy');
  creeperActor?.setEmote?.('🎉');
  if (creeperActor?.group) creeperActor.group.scale.set(1, 1, 1);

  playSfx(ctx, 'pop', { pos: boomPos, pitch: 1.15 });
  playSfx(ctx, 'confetti', { pos: boomPos });
  ctx?.fx?.shake?.(0.35, 0.3);
  ctx?.fx?.confetti?.(boomPos, 72);
  ctx?.fx?.hearts?.(boomPos, 20);
  ctx?.fx?.burst?.(boomPos, 0xff85c0, 18);

  spawnFlowerHeartCrater(ctx, centerPos);
  for (const ch of chickens) {
    ch.fleeing = false;
    ch.actor?.setAnim?.('cheer');
  }

  emitGag(ctx, 'creeper', 'creeper_confetti', boomPos);

  timers.after(1.15, () => {
    ctx?.quests?.complete?.('creeper');
  });
}

function isFlashWindowOpen() {
  if (backoffHops < 2 || hopArc || patCooldown > 0 || finishing) return false;
  const phase = (fuseClock % FUSE_PERIOD) / FUSE_PERIOD;
  return phase >= 0.7;
}

const qCreeper = {
  id: 'creeper',
  contestantId: 'creeper',
  area: 'hub',
  poi: 'clearing',
  order: 6,

  start(ctx) {
    qCreeper.cleanup(ctx);
    timers = createTimers();
    backoffHops = 0;
    shuffleIdx = 0;
    hopArc = null;
    fuseClock = 0;
    lastCycleIdx = -1;
    goodPats = 0;
    totalPats = 0;
    patCooldown = 0;
    finishing = false;

    const p0 = BACKOFF_SPOTS[0];
    centerPos = { x: p0.x, y: surfaceY(ctx, p0.x, p0.z, 8), z: p0.z };

    if (ctx?.chars?.create) {
      creeperActor = acquireActor(ctx, 'q_creeper:main', 'creeper', {
        id: 'creeper_contestant',
        pos: centerPos,
        anim: 'sad',
      });
      creeperActor?.setEmote?.('🌧️');
      creeperUnpick = registerPick(ctx, creeperActor.group, {
        id: 'creeper_pat',
        targetId: 'creeper_pat',
        entityId: 'creeper',
        kind: 'entity',
        label: QUEST_LABELS.creeper.patHissy,
        hitRadius: 1.25,
      });

      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI * 2;
        const cx = centerPos.x + Math.cos(ang) * 3.6;
        const cz = centerPos.z + Math.sin(ang) * 3.6;
        const cy = surfaceY(ctx, cx, cz, centerPos.y);
        const ch = acquireActor(ctx, `q_creeper:chicken_${i}`, 'chicken', {
          pos: { x: cx, y: cy, z: cz },
          anim: 'run',
        });
        chickens.push({ actor: ch, angle: ang, radius: 3.5 + (i % 2) * 0.4, fleeing: true });
      }
    }

    cloudGroup = buildRainCloud();
    cloudGroup.position.set(centerPos.x, centerPos.y + 2.85, centerPos.z);
    attachToScene(ctx, cloudGroup);

    flashAura = new THREE.Mesh(
      sharedBoxGeo(1.05, 1.85, 0.85),
      sharedBasicMat(0xffffff, { opacity: 0.48, transparent: true })
    );
    flashAura.position.set(centerPos.x, centerPos.y + 0.95, centerPos.z);
    flashAura.visible = false;
    attachToScene(ctx, flashAura);

    pulseRing = new THREE.Mesh(
      sharedCylinderGeo(1.6, 1.6, 0.06, 20),
      sharedBasicMat(0x69db7c, { opacity: 0.45, transparent: true })
    );
    pulseRing.position.set(centerPos.x, centerPos.y + 0.05, centerPos.z);
    attachToScene(ctx, pulseRing);
  },

  update(dt, ctx) {
    if (!timers) return;
    timers.update(dt);

    for (const ch of chickens) {
      if (ch.fleeing) {
        ch.angle += dt * 1.65;
        const nx = centerPos.x + Math.cos(ch.angle) * ch.radius;
        const nz = centerPos.z + Math.sin(ch.angle) * ch.radius;
        const ny = surfaceY(ctx, nx, nz, centerPos.y);
        if (ch.actor?.group) {
          ch.actor.group.position.set(nx, ny, nz);
          ch.actor.lookAt?.({
            x: centerPos.x + Math.cos(ch.angle + 0.4) * ch.radius,
            y: ny,
            z: centerPos.z + Math.sin(ch.angle + 0.4) * ch.radius,
          });
        }
      }
      ch.actor?.update?.(dt);
    }

    if (finishing) {
      creeperActor?.update?.(dt);
      return;
    }

    if (cloudGroup && cloudGroup.visible) {
      cloudGroup.position.y = centerPos.y + 2.85 + Math.sin((ctx?.time ?? 0) * 3.0) * 0.08;
      for (const d of raindrops) {
        d.userData.phase = (d.userData.phase + dt * 1.8) % 1;
        d.position.y = -0.18 - d.userData.phase * 0.55;
      }
    }

    const pp = playerPos(ctx);

    if (hopArc) {
      hopArc.elapsed += dt;
      const u = Math.min(1, hopArc.elapsed / hopArc.duration);
      centerPos.x = hopArc.from.x + (hopArc.to.x - hopArc.from.x) * u;
      centerPos.z = hopArc.from.z + (hopArc.to.z - hopArc.from.z) * u;
      centerPos.y = hopArc.from.y + (hopArc.to.y - hopArc.from.y) * u;
      const lift = Math.sin(u * Math.PI) * 1.1;
      syncCreeperAttachments(lift);
      if (u >= 1) {
        centerPos = { ...hopArc.to };
        hopArc = null;
        fuseClock = 0;
        lastCycleIdx = -1;
        syncCreeperAttachments(0);
        creeperActor?.setAnim?.('sad');
      }
      creeperActor?.update?.(dt);
      return;
    }

    const dToPlayer = distXZ(pp, centerPos);
    creeperActor?.lookAt?.(pp);

    // #143: She backs off 2 hops on first approach!
    if (backoffHops < 2 && dToPlayer <= 3.6) {
      backoffHops += 1;
      creeperActor?.setEmote?.('!');
      playSfx(ctx, 'hiss', { pos: centerPos, vol: 0.4, pitch: 1.25 });
      startCreeperHop(ctx, BACKOFF_SPOTS[backoffHops], 0.65);
      creeperActor?.update?.(dt);
      return;
    }

    if (patCooldown > 0) {
      patCooldown = Math.max(0, patCooldown - dt);
    }

    if (backoffHops >= 2) {
      if (dToPlayer <= 4.6) {
        fuseClock += dt;
      } else {
        fuseClock = Math.max(0, fuseClock - dt * 0.5);
      }
      const cycleIdx = Math.floor(fuseClock / FUSE_PERIOD);
      const phase = (fuseClock % FUSE_PERIOD) / FUSE_PERIOD;
      const inFlash = isFlashWindowOpen();

      if (dToPlayer <= 4.5 && cycleIdx !== lastCycleIdx) {
        lastCycleIdx = cycleIdx;
        playSfx(ctx, 'hiss', { pos: centerPos, vol: 0.45, pitch: 0.95 + goodPats * 0.05 });
      }

      const swell = dToPlayer <= 4.8 ? Math.sin(phase * Math.PI) * (1 - goodPats / 8) : 0.05;
      if (creeperActor?.group) {
        const sx = 1 + Math.max(0, swell) * 0.24;
        const sy = 1 + Math.max(0, swell) * 0.16;
        creeperActor.group.scale.set(sx, sy, sx);
      }
      if (flashAura) {
        flashAura.visible = inFlash && dToPlayer <= 4.8;
        const fs = 1 + Math.max(0, swell) * 0.25;
        flashAura.scale.set(fs, fs, fs);
      }
      if (pulseRing) {
        pulseRing.visible = true;
        pulseRing.material = sharedBasicMat(inFlash ? 0xffffff : 0x69db7c, {
          opacity: inFlash ? 0.76 : 0.38,
          transparent: true,
        });
        const rs = 0.75 + phase * 0.55;
        pulseRing.scale.set(rs, 1, rs);
      }
    } else if (pulseRing) {
      pulseRing.visible = false;
    }

    creeperActor?.update?.(dt);
  },

  onTap(hit, ctx) {
    if (finishing) return true;
    if (hit?.targetId === 'creeper_fuse_wait' || hit?.targetId === 'creeper_hop_wait') {
      return true;
    }

    if (
      hit?.targetId === 'creeper_approach' ||
      hit?.targetId === 'creeper_pat' ||
      hit?.entityId === 'creeper' ||
      (hit?.pos && distXZ(hit.pos, centerPos) <= 2.5)
    ) {
      if (backoffHops < 2) {
        backoffHops += 1;
        creeperActor?.setEmote?.('!');
        playSfx(ctx, 'hiss', { pos: centerPos, vol: 0.4, pitch: 1.25 });
        startCreeperHop(ctx, BACKOFF_SPOTS[backoffHops], 0.65);
        return true;
      }

      if (hopArc || patCooldown > 0) {
        return true;
      }

      const isGood = isFlashWindowOpen();
      totalPats += 1;
      if (isGood) {
        goodPats += 1;
      }

      const fxPos = { x: centerPos.x, y: centerPos.y + 1.3, z: centerPos.z };
      if (isGood) {
        playSfx(ctx, 'xp', { pos: fxPos, pitch: 1.0 + Math.min(6, goodPats) * 0.11 });
        ctx?.fx?.hearts?.(fxPos, 6);
        ctx?.fx?.sparkles?.(fxPos, 8, { toPlayer: false });
        creeperActor?.setEmote?.('💚');
        ctx?.events?.emit?.('questStep', { id: 'creeper', step: goodPats });
      } else {
        // Off-beat pat gives 0 calm until mercy (8 total pats, #143)!
        playSfx(ctx, 'hit_soft', { pos: fxPos, pitch: 0.95 });
        ctx?.fx?.burst?.(fxPos, 0xffe066, 4);
        creeperActor?.setEmote?.('🌧️');
      }

      if (goodPats >= NEED_GOOD_PATS || totalPats >= MERCY_TOTAL_PATS) {
        goodPats = NEED_GOOD_PATS;
        triggerHappyConfettiBoom(ctx);
        return true;
      }

      // Shuffle across clearing to start the next 1.4s fuse swell cycle!
      patCooldown = 0.45;
      fuseClock = 0;
      lastCycleIdx = -1;
      const nextSpot = SHUFFLE_SPOTS[shuffleIdx % SHUFFLE_SPOTS.length];
      shuffleIdx += 1;
      startCreeperHop(ctx, nextSpot, 0.72);
      return true;
    }
    return false;
  },

  onAction(ctx) {},

  introPos(ctx) {
    return { x: centerPos.x, y: centerPos.y + 1.1, z: centerPos.z };
  },

  targets(ctx) {
    if (finishing) {
      return [
        {
          id: 'creeper_finishing_wait',
          pos: { x: centerPos.x, y: centerPos.y + 0.85, z: centerPos.z },
          kind: 'wait',
          label: CONTESTANT_NAMES.creeper,
          range: 2.5,
        },
      ];
    }

    if (hopArc) {
      const pp = playerPos(ctx);
      return [
        {
          id: 'creeper_hop_wait',
          pos: { x: pp.x, y: pp.y + 0.85, z: pp.z },
          kind: 'wait',
          label: QUEST_LABELS.creeper.followHissy,
          range: 2.5,
        },
      ];
    }

    if (backoffHops < 2) {
      return [
        {
          id: 'creeper_approach',
          pos: { x: centerPos.x, y: centerPos.y + 0.85, z: centerPos.z },
          kind: 'entity',
          label: QUEST_LABELS.creeper.comfortHissy,
          range: 2.4,
        },
      ];
    }

    if (isFlashWindowOpen()) {
      return [
        {
          id: 'creeper_pat',
          pos: { x: centerPos.x, y: centerPos.y + 0.85, z: centerPos.z },
          kind: 'entity',
          label: QUEST_LABELS.creeper.patOnFlash,
          range: 2.4,
        },
      ];
    }

    return [
      {
        id: 'creeper_fuse_wait',
        pos: { x: centerPos.x, y: centerPos.y + 0.85, z: centerPos.z },
        kind: 'wait',
        label: QUEST_LABELS.creeper.waitForFlash,
        range: 2.5,
      },
    ];
  },

  pointer(ctx) {
    const dest = hopArc ? hopArc.to : centerPos;
    return { x: dest.x, y: dest.y + 1.8, z: dest.z };
  },

  objective(ctx) {
    if (backoffHops < 2 && !finishing) {
      return { icon: '👣', have: backoffHops, need: 2 };
    }
    return {
      icon: '💚',
      have: finishing ? NEED_GOOD_PATS : Math.min(NEED_GOOD_PATS, goodPats),
      need: NEED_GOOD_PATS,
    };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    timers?.clear?.();
    timers = null;
    creeperUnpick?.();
    creeperUnpick = null;
    if (creeperActor?.group) detachFromScene(creeperActor.group);
    creeperActor = null;
    if (cloudGroup) detachFromScene(cloudGroup);
    cloudGroup = null;
    raindrops = [];
    if (flashAura) detachFromScene(flashAura);
    flashAura = null;
    if (pulseRing) detachFromScene(pulseRing);
    pulseRing = null;
    for (const ch of chickens) {
      if (ch.actor?.group) detachFromScene(ch.actor.group);
    }
    chickens = [];
    for (const hf of heartFlowers) detachFromScene(hf);
    heartFlowers = [];
    hopArc = null;
    finishing = false;
  },
};

export default qCreeper;
