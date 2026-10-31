// Quest 4: golem — 铁铁 (Cave 2 ore -> 贝拉's statue 2 fake-iron dirt swap + nose fall ->
// 小凯 hogs 3 pumpkins -> NW Snow Golem startled hop + head pop + pumpkin pickup ->
// 5-slot T altar + rumble/shake spawn + poppy offer, §6.4, #143, #155 G2).

import * as THREE from '../../vendor/three.module.min.js';
import { B } from '../world/blocks.js';
import {
  poi,
  surfaceY,
  playerPos,
  distXZ,
  createTimers,
  createBreakable,
  createCollectible,
  createGhostSlot,
  createPatrol,
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

let timers = null;
let ores = [];
let statueBlocks = [];
let fakeDirtMeshes = [];
let fallenNoseMesh = null;
let pumpkinProps = [];
let pumpkinUnpicks = [];
let snowGolemActor = null;
let snowGolemUnpick = null;
let snowPatrol = null;
let snowHopArc = null;
let droppedPumpkin = null;
let belaActor = null;
let golemActor = null;
let poppyProp = null;
let poppyUnpick = null;
let altarSlots = [];
let restoredVoxels = [];

// Phases: 'mine' -> 'statue' -> 'bela_gag' -> 'pumpkin' -> 'kai_gag' -> 'snow' -> 'snow_gag' -> 'pickup_pumpkin' -> 'altar' -> 'rumble' -> 'poppy' -> 'done_anim'
let phase = 'mine';
let oresBroken = 0;
let statueBorrowed = 0;
let pumpkinsTried = 0;
let snowTaps = 0;
let hasSnowPumpkin = false;
let slotsPlaced = 0;

let snowGolemPos = { x: 38.5, y: 8, z: 8.5 };
let altarBase = { x: 66.5, y: 8, z: 26.5 };

const PUMPKIN_SPOTS = [
  { x: 74.5, y: 8, z: 17.5 },
  { x: 80.5, y: 8, z: 21.5 },
  { x: 74.5, y: 8, z: 25.5 },
  { x: 80.5, y: 8, z: 25.5 },
];

function setWorldVoxelWithRestore(ctx, bx, by, bz, newId) {
  if (!ctx?.world?.getBlock || !ctx?.world?.setBlock) return;
  const prev = ctx.world.getBlock(bx, by, bz);
  restoredVoxels.push({ bx, by, bz, prev });
  ctx.world.setBlock(bx, by, bz, newId);
}

function buildFakeDirtMesh(pos) {
  const g = new THREE.Group();
  g.position.set(pos.x, pos.y + 0.5, pos.z);
  const dirt = new THREE.Mesh(sharedBoxGeo(1.01, 1.01, 1.01), sharedLambertMat(0x866043));
  const tape1 = new THREE.Mesh(sharedBoxGeo(0.55, 0.14, 1.03), sharedBasicMat(0xdcdcdc));
  tape1.position.y = 0.22;
  const tape2 = new THREE.Mesh(sharedBoxGeo(1.03, 0.14, 0.55), sharedBasicMat(0xdcdcdc));
  tape2.position.y = -0.18;
  g.add(dirt, tape1, tape2);
  return g;
}

function spawnDroppedSnowPumpkin(ctx) {
  droppedPumpkin?.destroy?.();
  const candidates = [
    { x: 45.5, z: 16.5 },
    { x: 38.5, z: 8.5 },
    { x: 37.5, z: 19.5 },
  ];
  let best = candidates[0];
  for (const c of candidates) {
    if (distXZ(snowGolemPos, c) > distXZ(snowGolemPos, best)) best = c;
  }
  const landPos = { x: best.x, y: surfaceY(ctx, best.x, best.z, 8), z: best.z };
  droppedPumpkin = createCollectible(ctx, {
    id: 'golem_dropped_pumpkin',
    pos: landPos,
    color: 0xe38a1d,
    stemColor: 0x3fae3a,
    sparkle: true,
    size: 0.72,
    autoPickupRadius: 0,
    range: 2.35,
    label: '捡起南瓜头',
    onCollect: () => {
      hasSnowPumpkin = true;
      playSfx(ctx, 'xp', { pos: landPos, pitch: 1.35 });
      phase = 'altar';
      spawnAltarSlots(ctx);
      ctx?.events?.emit?.('questStep', { id: 'golem', step: 4 });
    },
  });
}

function spawnAltarSlots(ctx) {
  const ax = altarBase.x;
  const ay = altarBase.y;
  const az = altarBase.z;

  const defs = [
    { id: 'golem_slot_base', pos: { x: ax, y: ay, z: az }, pumpkin: false, label: '铁块底座' },
    { id: 'golem_slot_mid', pos: { x: ax, y: ay + 1, z: az }, pumpkin: false, label: '铁块身体' },
    { id: 'golem_slot_left', pos: { x: ax - 1, y: ay + 1, z: az }, pumpkin: false, label: '左铁臂' },
    { id: 'golem_slot_right', pos: { x: ax + 1, y: ay + 1, z: az }, pumpkin: false, label: '右铁臂' },
    { id: 'golem_slot_head', pos: { x: ax, y: ay + 2, z: az }, pumpkin: true, label: '南瓜头' },
  ];

  altarSlots = defs.map((d) =>
    createGhostSlot(ctx, {
      id: d.id,
      pos: d.pos,
      ghostColor: d.pumpkin ? 0xff922b : 0x74c0fc,
      placedColor: d.pumpkin ? 0xe38a1d : 0xe6e6e6,
      blockId: d.pumpkin ? B.CARVED_PUMPKIN : B.IRON_BLOCK,
      label: d.label,
      range: 2.4,
      onPlace: () => {
        slotsPlaced += 1;
        playSfx(ctx, 'xp', { pos: d.pos, pitch: 0.95 + slotsPlaced * 0.1 });
        if (slotsPlaced >= 5 && phase === 'altar') {
          triggerGolemRumbleAndRise(ctx);
        }
      },
    })
  );
}

function triggerGolemRumbleAndRise(ctx) {
  phase = 'rumble';
  const spawnPos = { x: altarBase.x, y: altarBase.y, z: altarBase.z };

  // §6.4: rumble + camera shake!
  playSfx(ctx, 'rumble', { pos: spawnPos });
  ctx?.fx?.shake?.(0.6, 0.5);
  ctx?.fx?.sparkles?.({ x: spawnPos.x, y: spawnPos.y + 1.5, z: spawnPos.z }, 18, { toPlayer: false });

  timers.after(1.45, () => {
    for (const s of altarSlots) {
      s.group.visible = false;
    }
    playSfx(ctx, 'golem_spawn', { pos: spawnPos });
    ctx?.fx?.burst?.({ x: spawnPos.x, y: spawnPos.y + 1.2, z: spawnPos.z }, 0xe6e6e6, 22);
    ctx?.events?.emit?.('spawnBig', { pos: spawnPos, kind: 'golem' });

    if (ctx?.chars?.create) {
      golemActor = acquireActor(ctx, 'q_golem:main', 'golem', {
        id: 'golem_contestant',
        pos: spawnPos,
        anim: 'spawn',
      });
      golemActor?.setEmote?.('🌹');
      golemActor?.lookAt?.({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z - 2 });
    }

    // Red poppy flower offered in 铁铁's outstretched hand (§6.4)!
    poppyProp = new THREE.Group();
    const stem = new THREE.Mesh(sharedBoxGeo(0.12, 0.38, 0.12), sharedLambertMat(0x3fae3a));
    const bloom = new THREE.Mesh(sharedBoxGeo(0.34, 0.28, 0.34), sharedLambertMat(0xe23226));
    bloom.position.y = 0.24;
    poppyProp.add(stem, bloom);
    poppyProp.position.set(spawnPos.x, spawnPos.y + 1.15, spawnPos.z - 0.85);
    attachToScene(ctx, poppyProp);

    poppyUnpick = registerPick(ctx, poppyProp, {
      id: 'golem_poppy',
      targetId: 'golem_poppy',
      kind: 'entity',
      label: '收下小红花',
      hitRadius: 1.25,
    });
  });

  timers.after(2.8, () => {
    if (phase === 'rumble') {
      phase = 'poppy';
      golemActor?.setAnim?.('wave');
      golemActor?.lookAt?.(playerPos(ctx));
      ctx?.fx?.sparkles?.({ x: spawnPos.x, y: spawnPos.y + 1.3, z: spawnPos.z - 0.85 }, 8, { toPlayer: false });
    }
  });
}

function acceptPoppyAndFinish(ctx) {
  if (phase === 'done_anim') return;
  phase = 'done_anim';
  poppyUnpick?.();
  if (poppyProp) poppyProp.visible = false;

  const hPos = { x: altarBase.x, y: altarBase.y + 1.6, z: altarBase.z };
  golemActor?.setAnim?.('happy');
  golemActor?.setEmote?.('❤');
  playSfx(ctx, 'xp', { pos: hPos, pitch: 1.35 });
  ctx?.fx?.hearts?.(hPos, 18);
  ctx?.fx?.sparkles?.(hPos, 12, { toPlayer: true });

  timers.after(1.8, () => {
    ctx?.quests?.complete?.('golem');
  });
}

const qGolem = {
  id: 'golem',
  contestantId: 'golem',
  area: 'hub',
  poi: 'cave',
  order: 4,

  start(ctx) {
    qGolem.cleanup(ctx);
    timers = createTimers();
    phase = 'mine';
    oresBroken = 0;
    statueBorrowed = 0;
    pumpkinsTried = 0;
    snowTaps = 0;
    hasSnowPumpkin = false;
    slotsPlaced = 0;
    snowHopArc = null;
    restoredVoxels = [];

    const cavePoi = poi(ctx, 'cave', { x: 79.5, y: 8, z: 46.5 });
    const statuePoi = poi(ctx, 'statue', { x: 70.5, y: 8, z: 32.5 });
    const altarPoi = poi(ctx, 'ironAltar', { x: 66.5, y: 8, z: 27.5 });

    altarBase = { x: Math.floor(altarPoi.x) + 0.5, y: altarPoi.y ?? 8, z: Math.floor(altarPoi.z) - 0.5 };

    // 1. Two 3-tap Iron Ore blocks (one inside lit cave room, one on N hill flank)
    const oreCoords = [
      { x: 83.5, y: cavePoi.y ?? 8, z: 44.5, wx: 83, wy: 8, wz: 44, clearVoxel: true },
      { x: 76.5, y: 8, z: 39.5, wx: 76, wy: 8, wz: 39, clearVoxel: false },
    ];
    ores = oreCoords.map((oc, i) =>
      createBreakable(ctx, {
        id: `golem_ore_${i}`,
        pos: { x: oc.x, y: oc.y, z: oc.z },
        taps: 3,
        color: 0x8a8a8a,
        speckColor: 0xd8af93,
        blockId: B.IRON_ORE,
        label: '铁矿石',
        range: 2.35,
        onBreak: () => {
          if (oc.clearVoxel) {
            setWorldVoxelWithRestore(ctx, oc.wx, oc.wy, oc.wz, B.AIR);
          }
          oresBroken += 1;
          playSfx(ctx, 'xp', { pos: oc, pitch: 1.0 + oresBroken * 0.1 });
          if (ores.every((o) => o.broken) && phase === 'mine') {
            phase = 'statue';
            ctx?.events?.emit?.('questStep', { id: 'golem', step: 1 });
          }
        },
      })
    );

    // 2. Two 3-tap Iron Blocks at the base of 贝拉's Iron Statue (69,8,30) & (71,8,30)
    const statX = Math.floor(statuePoi.x); // 70
    const statZ = Math.floor(statuePoi.z) - 2; // 30
    const statBlocksCfg = [
      { bx: statX - 1, by: 8, bz: statZ },
      { bx: statX + 1, by: 8, bz: statZ },
    ];
    statueBlocks = statBlocksCfg.map((sb, i) =>
      createBreakable(ctx, {
        id: `golem_statue_${i}`,
        pos: { x: sb.bx + 0.5, y: sb.by, z: sb.bz + 0.5 },
        taps: 3,
        color: 0xe6e6e6,
        blockId: B.IRON_BLOCK,
        label: '雕像铁块',
        range: 2.35,
        onBreak: () => {
          statueBorrowed += 1;
          setWorldVoxelWithRestore(ctx, sb.bx, sb.by, sb.bz, B.DIRT);
          const dirtProp = buildFakeDirtMesh({ x: sb.bx + 0.5, y: sb.by, z: sb.bz + 0.5 });
          attachToScene(ctx, dirtProp);
          fakeDirtMeshes.push(dirtProp);
          playSfx(ctx, 'hit_soft', { pos: { x: sb.bx + 0.5, y: sb.by + 0.5, z: sb.bz + 0.5 } });

          if (statueBorrowed >= 2) {
            // §6.4 Gag 1: 贝拉 pops out 💢 and the statue's iron nose falls off!
            setWorldVoxelWithRestore(ctx, statX, 10, statZ + 1, B.AIR);
            fallenNoseMesh = new THREE.Mesh(sharedBoxGeo(0.9, 0.9, 0.9), sharedLambertMat(0xe6e6e6));
            fallenNoseMesh.position.set(statX + 0.5, 8.45, statZ + 1.85);
            fallenNoseMesh.rotation.set(0.35, 0.25, 0.2);
            attachToScene(ctx, fallenNoseMesh);
            playSfx(ctx, 'boing', { pos: fallenNoseMesh.position });

            if (ctx?.chars?.create) {
              const belaStart = { x: statX - 4.5, y: 8, z: statZ + 1.5 };
              belaActor = acquireActor(ctx, 'q_golem:bela', 'bela', {
                id: 'golem_bela',
                pos: belaStart,
                anim: 'walk',
              });
              belaActor?.setEmote?.('💢');
              belaActor?.moveTo?.({ x: statX - 1.2, y: 8, z: statZ + 1.8 }, 3.8);
            }
            emitGag(ctx, 'golem', 'fake_iron', { x: statX + 0.5, y: 9, z: statZ + 1 });

            phase = 'bela_gag';
            timers.after(2.8, () => {
              if (phase === 'bela_gag') {
                phase = 'pumpkin';
                ctx?.events?.emit?.('questStep', { id: 'golem', step: 2 });
              }
            });
          }
        },
      })
    );

    // 3a. Three tempting pumpkins across the NE pumpkin patch (小凯 snatches all 3!)
    pumpkinProps = [];
    pumpkinUnpicks = [];
    PUMPKIN_SPOTS.forEach((ps, idx) => {
      const py = surfaceY(ctx, ps.x, ps.z, 8);
      const pg = new THREE.Group();
      pg.position.set(ps.x, py + 0.5, ps.z);
      const pBody = new THREE.Mesh(sharedBoxGeo(0.92, 0.92, 0.92), sharedLambertMat(0xe38a1d));
      const pStem = new THREE.Mesh(sharedBoxGeo(0.18, 0.2, 0.18), sharedLambertMat(0x3fae3a));
      pStem.position.y = 0.52;
      pg.add(pBody, pStem);
      attachToScene(ctx, pg);
      pumpkinProps.push({
        group: pg,
        pos: { x: ps.x, y: py, z: ps.z },
        snatched: false,
        id: `golem_pumpkin_${idx}`,
      });
      pumpkinUnpicks.push(
        registerPick(ctx, pg, {
          id: `golem_pumpkin_${idx}`,
          targetId: `golem_pumpkin_${idx}`,
          kind: 'block',
          label: '大南瓜',
          hitRadius: 1.15,
        })
      );
    });

    // 3b. Snow Golem patrolling across the NW Snowy Pocket (38.5, 8.5 <-> 44.5, 12.5 <-> 42.5, 18.5)
    const snowWaypoints = [
      { x: 38.5, y: 8, z: 8.5 },
      { x: 44.5, y: 8, z: 12.5 },
      { x: 42.5, y: 8, z: 18.5 },
    ];
    snowPatrol = createPatrol(snowWaypoints, { speed: 1.75, pauseSec: 0.35, pingPong: true });
    snowGolemPos = { ...snowWaypoints[0] };

    if (ctx?.chars?.create) {
      snowGolemActor = acquireActor(ctx, 'q_golem:snowman', 'snowGolemMob', {
        id: 'golem_snowman',
        pos: snowGolemPos,
        helmet: true,
        anim: 'walk',
      });
      snowGolemUnpick = registerPick(ctx, snowGolemActor.group, {
        id: 'golem_snowman',
        targetId: 'golem_snowman',
        entityId: 'golem_snowman',
        kind: 'entity',
        label: '雪傀儡',
        hitRadius: 1.2,
      });
    }
  },

  update(dt, ctx) {
    if (!timers) return;
    timers.update(dt);

    for (const o of ores) o.update(dt);
    for (const sb of statueBlocks) sb.update(dt);
    for (const sl of altarSlots) sl.update(dt);
    droppedPumpkin?.update?.(dt, ctx);

    if (snowHopArc) {
      snowHopArc.elapsed += dt;
      const u = Math.min(1, snowHopArc.elapsed / snowHopArc.duration);
      snowGolemPos.x = snowHopArc.from.x + (snowHopArc.to.x - snowHopArc.from.x) * u;
      snowGolemPos.z = snowHopArc.from.z + (snowHopArc.to.z - snowHopArc.from.z) * u;
      snowGolemPos.y = 8;
      const lift = Math.sin(u * Math.PI) * 1.15;
      if (snowGolemActor?.group) {
        snowGolemActor.group.position.set(snowGolemPos.x, snowGolemPos.y + lift, snowGolemPos.z);
      }
      if (u >= 1) {
        snowGolemPos = { ...snowHopArc.to };
        snowHopArc = null;
        if (snowGolemActor?.group) {
          snowGolemActor.group.position.set(snowGolemPos.x, snowGolemPos.y, snowGolemPos.z);
        }
        snowGolemActor?.setAnim?.('walk');
      }
      snowGolemActor?.update?.(dt);
    } else if (phase === 'snow' && snowPatrol && snowGolemActor) {
      const np = snowPatrol.step(dt, snowGolemActor);
      snowGolemPos = { x: np.x, y: 8, z: np.z };
      if (snowGolemActor.group) snowGolemActor.group.position.set(snowGolemPos.x, snowGolemPos.y, snowGolemPos.z);
    } else {
      snowGolemActor?.update?.(dt);
    }

    if (poppyProp && poppyProp.visible) {
      poppyProp.position.y = altarBase.y + 1.15 + Math.sin((ctx?.time ?? 0) * 4.5) * 0.08;
      poppyProp.rotation.y += dt * 1.8;
    }

    belaActor?.update?.(dt);
    golemActor?.update?.(dt);
  },

  onTap(hit, ctx) {
    if (
      hit?.targetId?.endsWith('_wait') ||
      snowHopArc ||
      phase === 'bela_gag' ||
      phase === 'kai_gag' ||
      phase === 'snow_gag' ||
      phase === 'rumble' ||
      phase === 'done_anim'
    ) {
      return true;
    }

    if (phase === 'mine') {
      for (const o of ores) {
        if (!o.broken && o.matchesHit(hit)) return o.tap(ctx);
      }
      return false;
    }

    if (phase === 'statue') {
      for (const sb of statueBlocks) {
        if (!sb.broken && sb.matchesHit(hit)) return sb.tap(ctx);
      }
      return false;
    }

    if (phase === 'pumpkin') {
      const p = pumpkinProps.find(
        (item) =>
          !item.snatched &&
          (hit?.targetId === item.id || (hit?.pos && distXZ(hit.pos, item.pos) <= 2.3))
      );
      if (p) {
        p.snatched = true;
        p.group.visible = false;
        pumpkinsTried += 1;
        ctx?.rival?.hogPumpkins?.({ x: p.pos.x, y: p.pos.y, z: p.pos.z - 0.6 }, 'golem');
        ctx?.fx?.burst?.(p.pos, 0xe38a1d, 10);
        playSfx(ctx, 'boing', { pos: p.pos, pitch: 1.15 });

        if (pumpkinsTried >= pumpkinProps.length) {
          for (const up of pumpkinUnpicks) up?.();
          emitGag(ctx, 'golem', 'kai_hogs_pumpkins', p.pos);
          phase = 'kai_gag';
          timers.after(2.4, () => {
            if (phase === 'kai_gag') {
              phase = 'snow';
              ctx?.events?.emit?.('questStep', { id: 'golem', step: 3 });
            }
          });
        }
        return true;
      }
      return false;
    }

    if (phase === 'snow') {
      if (
        hit?.targetId === 'golem_snowman' ||
        hit?.entityId === 'golem_snowman' ||
        (hit?.pos && distXZ(hit.pos, snowGolemPos) <= 2.5)
      ) {
        if (snowTaps < 2) {
          // 1st & 2nd tap: shy Snow Golem gasps and hops across the snowfield clutching its pumpkin hat!
          snowTaps += 1;
          snowGolemActor?.setEmote?.('!');
          snowGolemActor?.setAnim?.('hop');
          playSfx(ctx, 'boing', { pos: snowGolemPos, pitch: 1.15 });
          ctx?.fx?.burst?.({ x: snowGolemPos.x, y: snowGolemPos.y + 1.2, z: snowGolemPos.z }, 0xffffff, 8);
          const hopDestinations = [
            { x: 38.5, y: 8, z: 8.5 },
            { x: 46.5, y: 8, z: 13.5 },
            { x: 37.5, y: 8, z: 19.5 },
          ];
          let dest = hopDestinations[0];
          for (const hd of hopDestinations) {
            if (distXZ(snowGolemPos, hd) > distXZ(snowGolemPos, dest)) dest = hd;
          }
          snowHopArc = {
            from: { ...snowGolemPos },
            to: dest,
            elapsed: 0,
            duration: 0.72,
          };
          return true;
        }

        // 3rd tap (§6.4 Gag 3): Snow golem's pumpkin head boings off -> blushing snowman face!
        snowTaps += 1;
        snowGolemActor?.popHead?.();
        snowGolemActor?.setEmote?.('😳');
        snowGolemActor?.setAnim?.('shrug');
        snowGolemUnpick?.();
        playSfx(ctx, 'boing', { pos: snowGolemPos, pitch: 1.25 });
        playSfx(ctx, 'xp', { pos: snowGolemPos, pitch: 1.3 });
        ctx?.fx?.burst?.({ x: snowGolemPos.x, y: snowGolemPos.y + 1.6, z: snowGolemPos.z }, 0xe38a1d, 12);
        ctx?.fx?.sparkles?.(snowGolemPos, 10, { toPlayer: false });
        emitGag(ctx, 'golem', 'snow_head_pop', snowGolemPos);

        phase = 'snow_gag';
        timers.after(2.2, () => {
          if (phase === 'snow_gag') {
            phase = 'pickup_pumpkin';
            spawnDroppedSnowPumpkin(ctx);
          }
        });
        return true;
      }
      return false;
    }

    if (phase === 'pickup_pumpkin') {
      if (droppedPumpkin && !droppedPumpkin.collected && droppedPumpkin.matchesHit(hit)) {
        return droppedPumpkin.collect(ctx);
      }
      return false;
    }

    if (phase === 'altar') {
      for (const sl of altarSlots) {
        if (!sl.placed && sl.matchesHit(hit)) return sl.place(ctx);
      }
      return false;
    }

    if (phase === 'poppy') {
      if (
        hit?.targetId === 'golem_poppy' ||
        (hit?.pos && distXZ(hit.pos, { x: altarBase.x, z: altarBase.z - 0.85 }) <= 2.5)
      ) {
        acceptPoppyAndFinish(ctx);
        return true;
      }
      return false;
    }

    return false;
  },

  onAction(ctx) {},

  introPos(ctx) {
    return { x: 81.5, y: 9.0, z: 45.5 };
  },

  targets(ctx) {
    if (phase === 'mine') {
      const t = ores.map((o) => o.target()).filter(Boolean);
      if (t.length > 0) return t;
    }
    if (phase === 'statue') {
      const t = statueBlocks.map((sb) => sb.target()).filter(Boolean);
      if (t.length > 0) return t;
    }
    if (phase === 'bela_gag') {
      return [
        {
          id: 'golem_bela_wait',
          pos: { x: 70.5, y: 8.8, z: 31.8 },
          kind: 'wait',
          label: '雕像鼻子掉啦',
          range: 2.5,
        },
      ];
    }
    if (phase === 'pumpkin') {
      const rem = pumpkinProps
        .filter((p) => !p.snatched)
        .map((p) => ({
          id: p.id,
          pos: { x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z },
          kind: 'block',
          label: '摘南瓜',
          range: 2.35,
        }));
      if (rem.length > 0) return rem;
    }
    if (phase === 'kai_gag') {
      return [
        {
          id: 'golem_kai_wait',
          pos: { x: 75.5, y: 8.8, z: 24.5 },
          kind: 'wait',
          label: '小凯抢南瓜',
          range: 2.5,
        },
      ];
    }
    if (phase === 'snow') {
      if (snowHopArc) {
        const pp = playerPos(ctx);
        return [
          {
            id: 'golem_snow_hop_wait',
            pos: { x: pp.x, y: pp.y + 0.8, z: pp.z },
            kind: 'wait',
            label: '追雪傀儡',
            range: 2.5,
          },
        ];
      }
      return [
        {
          id: 'golem_snowman',
          pos: { x: snowGolemPos.x, y: snowGolemPos.y + 0.9, z: snowGolemPos.z },
          kind: 'entity',
          label: '借雪傀儡南瓜',
          range: 2.35,
        },
      ];
    }
    if (phase === 'snow_gag') {
      return [
        {
          id: 'golem_snow_wait',
          pos: { x: snowGolemPos.x, y: snowGolemPos.y + 0.9, z: snowGolemPos.z },
          kind: 'wait',
          label: '脸红雪傀儡',
          range: 2.5,
        },
      ];
    }
    if (phase === 'pickup_pumpkin' && droppedPumpkin && !droppedPumpkin.collected) {
      const dtgt = droppedPumpkin.target();
      if (dtgt) return [dtgt];
    }
    if (phase === 'altar') {
      const t = altarSlots.map((sl) => sl.target()).filter(Boolean);
      if (t.length > 0) return t;
    }
    if (phase === 'poppy') {
      return [
        {
          id: 'golem_poppy',
          pos: { x: altarBase.x, y: altarBase.y + 1.15, z: altarBase.z - 0.85 },
          kind: 'entity',
          label: '收下小红花',
          range: 2.4,
        },
      ];
    }
    return [
      {
        id: 'golem_spawning_wait',
        pos: { x: altarBase.x, y: altarBase.y + 1.2, z: altarBase.z },
        kind: 'wait',
        label: '铁铁诞生中',
        range: 2.5,
      },
    ];
  },

  pointer(ctx) {
    const first = qGolem.targets(ctx)[0]?.pos || altarBase;
    return { x: first.x, y: (first.y ?? 8) + 0.9, z: first.z };
  },

  // #155 G2: strict per-step objective icon + have/need (zero lumped totals)
  objective(ctx) {
    if (phase === 'mine') {
      return { icon: '⛏️', have: Math.min(oresBroken, 2), need: 2 };
    }
    if (phase === 'statue' || phase === 'bela_gag') {
      return { icon: '🔩', have: Math.min(statueBorrowed, 2), need: 2 };
    }
    if (phase === 'pumpkin' || phase === 'kai_gag') {
      return { icon: '🎃', have: Math.min(pumpkinsTried, PUMPKIN_SPOTS.length), need: PUMPKIN_SPOTS.length };
    }
    if (phase === 'snow' || phase === 'snow_gag' || phase === 'pickup_pumpkin') {
      return { icon: '⛄', have: hasSnowPumpkin ? 1 : 0, need: 1 };
    }
    if (phase === 'altar' || phase === 'rumble') {
      return { icon: '🏗️', have: Math.min(slotsPlaced, 5), need: 5 };
    }
    return { icon: '🌹', have: phase === 'done_anim' ? 1 : 0, need: 1 };
  },

  action(ctx) {
    return null;
  },

  cleanup(ctx) {
    timers?.clear?.();
    timers = null;
    for (const o of ores) o.destroy();
    ores = [];
    for (const sb of statueBlocks) sb.destroy();
    statueBlocks = [];
    for (const m of fakeDirtMeshes) detachFromScene(m);
    fakeDirtMeshes = [];
    if (fallenNoseMesh) detachFromScene(fallenNoseMesh);
    fallenNoseMesh = null;
    for (const up of pumpkinUnpicks) up?.();
    pumpkinUnpicks = [];
    for (const p of pumpkinProps) detachFromScene(p.group);
    pumpkinProps = [];
    snowGolemUnpick?.();
    snowGolemUnpick = null;
    snowPatrol = null;
    snowHopArc = null;
    droppedPumpkin?.destroy?.();
    droppedPumpkin = null;
    if (snowGolemActor?.group) detachFromScene(snowGolemActor.group);
    snowGolemActor = null;
    if (belaActor?.group) detachFromScene(belaActor.group);
    belaActor = null;
    if (golemActor?.group) detachFromScene(golemActor.group);
    golemActor = null;
    poppyUnpick?.();
    poppyUnpick = null;
    if (poppyProp) detachFromScene(poppyProp);
    poppyProp = null;
    for (const sl of altarSlots) sl.destroy();
    altarSlots = [];
    for (let i = restoredVoxels.length - 1; i >= 0; i--) {
      const rv = restoredVoxels[i];
      ctx?.world?.setBlock?.(rv.bx, rv.by, rv.bz, rv.prev);
    }
    restoredVoxels = [];
    ctx?.rival?.leave?.();
  },
};

export default qGolem;
