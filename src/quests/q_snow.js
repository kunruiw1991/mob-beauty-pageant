// Quest 5: snow — 雪宝 (Snowball fight vs 小凯: scoop & pack snowballs at 3 snowbanks -> sprint to active lane -> pelt 小凯 5x -> snowman gag, docs/DESIGN.md §6.5).
// Zero-build ES2022, deterministic sim time/rng only.

import * as THREE from '../../vendor/three.module.min.js';
import { QUEST_LABELS } from '../data/strings.js';
import {
  poi,
  surfaceY,
  playerPos,
  distXZ,
  rngInt,
  rngRange,
  createTimers,
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

const TOTAL_HITS = 5;
const PACK_TAPS = 3;
const FLIGHT_SEC = 0.45;

// Pooled scene group & meshes (reused across restarts — 0 geometry/material growth)
let arenaGroup = null;
let playerBallMesh = null;
let heldBallMesh = null;
let enemyBallMesh = null;
const bankEntries = [];
const lanePads = [];

function ensureArenaVisuals() {
  if (arenaGroup) return;
  arenaGroup = new THREE.Group();
  arenaGroup.name = 'qSnowArena';

  const snowMat = sharedLambertMat(0xf4f9ff);
  const iceAccent = sharedLambertMat(0xbae6fd);
  const glowMat = sharedBasicMat(0x7dd3fc, { opacity: 0.68, transparent: true });
  const throwRingMat = sharedBasicMat(0xffe066, { opacity: 0.65, transparent: true });

  // Decorative 3-lane snow fort parapet behind which 小凯 pops up and ducks
  for (let i = -3; i <= 3; i++) {
    const base = new THREE.Mesh(sharedBoxGeo(0.98, 0.95, 0.92), snowMat);
    base.position.set(50.0 + i * 0.98, 8.48, 12.2);
    arenaGroup.add(base);
    if (Math.abs(i) % 2 === 1) {
      const crenel = new THREE.Mesh(sharedBoxGeo(0.92, 0.36, 0.88), iceAccent);
      crenel.position.set(50.0 + i * 0.98, 9.12, 12.2);
      arenaGroup.add(crenel);
    }
  }

  // 3 Fluffy Snowbanks along the south trench (z = 20.6) where player scoops & packs snowballs
  const bankXs = [46.5, 50.0, 53.5];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.position.set(bankXs[i], 8.0, 20.6);
    const mound1 = new THREE.Mesh(sharedBoxGeo(1.05, 0.42, 1.05), snowMat);
    mound1.position.set(0, 0.21, 0);
    const mound2 = new THREE.Mesh(sharedBoxGeo(0.68, 0.32, 0.68), snowMat);
    mound2.position.set(0.08, 0.52, -0.05);
    const ballTop = new THREE.Mesh(sharedBoxGeo(0.34, 0.34, 0.34), iceAccent);
    ballTop.position.set(-0.08, 0.78, 0.04);
    const ring = new THREE.Mesh(sharedCylinderGeo(0.76, 0.76, 0.07, 10), glowMat);
    ring.position.y = 0.05;
    g.add(mound1, mound2, ballTop, ring);
    arenaGroup.add(g);
    bankEntries.push({
      index: i,
      x: bankXs[i],
      z: 20.6,
      group: g,
      ring,
      wobble: 0,
      unpick: null,
    });
  }

  // 3 Front firing-trench rings (z = 13.5) right in front of 小凯's 3 lanes
  const laneXs = [47.6, 50.0, 52.4];
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(sharedCylinderGeo(0.68, 0.72, 0.07, 10), throwRingMat);
    pad.position.set(laneXs[i], 8.04, 13.5);
    pad.visible = false;
    arenaGroup.add(pad);
    lanePads.push(pad);
  }

  playerBallMesh = new THREE.Mesh(sharedBoxGeo(0.36, 0.36, 0.36), sharedBasicMat(0xffffff));
  playerBallMesh.visible = false;

  heldBallMesh = new THREE.Mesh(sharedBoxGeo(0.32, 0.32, 0.32), sharedBasicMat(0xffffff));
  heldBallMesh.visible = false;

  enemyBallMesh = new THREE.Mesh(sharedBoxGeo(0.46, 0.46, 0.46), sharedLambertMat(0xe0f2fe));
  enemyBallMesh.visible = false;
}

let hits = 0;
let misses = 0;
let packSteps = 0;
let hasSnowball = false;
let activeBankIdx = 1;
let active = false;
let completing = false;

let center = { x: 50.0, y: 8, z: 16.5 };
let wallPos = { x: 50.0, y: 8, z: 12.2 };
let standPos = { x: 50.0, y: 8, z: 16.5 };
let lanes = [];

let laneIdx = 1;
let kaiUp = true;
let phaseTimer = 2.2;
let duckGrace = 0;
let threwThisPopup = false;
let hitThisPopup = false;

let playerShot = null;
let enemyShot = null;
let unpickKai = null;
let unpickEnemyBall = null;

let snowContestant = null;
const golemSpectators = [];
const timers = createTimers();

function currentLanePos() {
  return lanes[laneIdx] || { x: 50.0, y: 8, z: 11.4 };
}

function currentThrowSpot() {
  const lp = currentLanePos();
  return { x: lp.x, y: 8, z: 13.5 };
}

function currentBank() {
  return bankEntries[activeBankIdx] || bankEntries[1];
}

function setKaiPopState(ctx, up) {
  kaiUp = up;
  const lp = currentLanePos();
  if (up) {
    // Mercy rule (§6): generous pop-up window after 3 missed cycles
    phaseTimer = misses >= 3 ? 3.2 : 2.25;
    duckGrace = 0;
    threwThisPopup = false;
    hitThisPopup = false;
    if (ctx?.rival) {
      ctx.rival.appear({ x: lp.x, y: lp.y, z: lp.z }, 'cameo', 'snow');
      ctx.rival.actor?.lookAt?.(playerPos(ctx));
      ctx.rival.actor?.setAnim?.('wave');
      ctx.rival.actor?.setEmote?.('😜');
    }
    if (hits === 0 || hits === 2 || hits === 4) {
      playSfx(ctx, 'kai_laugh', { pos: lp });
    }
  } else {
    phaseTimer = misses >= 3 ? 0.65 : rngRange(ctx, 1.05, 1.55);
    if (ctx?.rival?.actor?.group) {
      ctx.rival.actor.group.position.set(lp.x, lp.y - 1.15, lp.z);
      ctx.rival.actor.setEmote?.(null);
      ctx.rival.actor.setAnim?.('sneak');
    }
  }
}

function spawnEnemySnowball(ctx) {
  if (enemyShot || completing || !enemyBallMesh) return;
  const from = currentLanePos();
  const to = playerPos(ctx);
  enemyShot = {
    from: { x: from.x, y: from.y + 1.4, z: from.z },
    to: { x: to.x, y: (to.y ?? 8) + 1.1, z: to.z },
    elapsed: 0,
    duration: 1.65,
  };
  enemyBallMesh.visible = true;
  enemyBallMesh.position.set(enemyShot.from.x, enemyShot.from.y, enemyShot.from.z);
  ctx?.rival?.actor?.setAnim?.('throw');
  playSfx(ctx, 'snow_throw', { pos: from, pitch: 0.85 });
}

function swatEnemySnowball(ctx) {
  if (!enemyShot || !enemyBallMesh) return false;
  const p = {
    x: enemyBallMesh.position.x,
    y: enemyBallMesh.position.y,
    z: enemyBallMesh.position.z,
  };
  enemyShot = null;
  enemyBallMesh.visible = false;
  playSfx(ctx, 'pop', { pos: p, pitch: 1.25 });
  ctx?.fx?.burst?.(p, 0xffffff, 10);
  ctx?.fx?.popup?.(p, '✨');
  return true;
}

function scoopSnowbank(ctx, bank) {
  const b = bank || currentBank();
  b.wobble = 0.22;
  packSteps += 1;
  const fxPos = { x: b.x, y: 8.5, z: b.z };
  playSfx(ctx, 'step_snow', { pos: fxPos, pitch: 1.05 + packSteps * 0.15 });
  ctx?.fx?.burst?.(fxPos, 0xffffff, 8);
  ctx?.player?.actor?.setAnim?.('interact');

  if (packSteps >= PACK_TAPS) {
    hasSnowball = true;
    packSteps = 0;
    playSfx(ctx, 'pickup', { pos: fxPos, pitch: 1.2 });
    ctx?.fx?.sparkles?.(fxPos, 8, { toPlayer: true });
    // Rotate next snowbank so player works across the arena trench
    activeBankIdx = (b.index + rngInt(ctx, 1, 2)) % 3;
  }
  return true;
}

function launchPlayerSnowball(ctx) {
  if (playerShot || completing || !hasSnowball) return false;
  hasSnowball = false;
  packSteps = 0;
  const pPos = playerPos(ctx);
  const lp = currentLanePos();

  // Hold 小凯 up briefly while the 0.45s snowball arcs to him so fair throws always connect
  kaiUp = true;
  phaseTimer = Math.max(phaseTimer, FLIGHT_SEC + 0.15);
  hitThisPopup = true;

  ctx?.player?.actor?.lookAt?.(lp);
  ctx?.player?.actor?.setAnim?.('throw');
  playSfx(ctx, 'snow_throw', { pos: pPos, pitch: 1.1 });

  playerShot = {
    from: { x: pPos.x, y: (pPos.y ?? 8) + 1.25, z: pPos.z },
    to: { x: lp.x, y: lp.y + 1.35, z: lp.z },
    elapsed: 0,
    duration: FLIGHT_SEC,
  };
  if (playerBallMesh) {
    playerBallMesh.visible = true;
    playerBallMesh.position.set(playerShot.from.x, playerShot.from.y, playerShot.from.z);
  }
  return true;
}

function handleKaiHit(ctx) {
  const lp = currentLanePos();
  const hitPos = { x: lp.x, y: lp.y + 1.3, z: lp.z };
  hits += 1;
  duckGrace = 0;
  playSfx(ctx, 'snow_hit', { pos: hitPos, pitch: 0.92 + hits * 0.08 });
  ctx?.fx?.burst?.(hitPos, 0xffffff, 16);
  ctx?.events?.emit?.('questStep', { id: 'snow', step: hits });

  if (snowContestant) {
    snowContestant.setAnim('cheer');
    snowContestant.setEmote(hits >= TOTAL_HITS ? '❤' : '❄️');
  }

  if (hits >= TOTAL_HITS) {
    completing = true;
    enemyShot = null;
    if (enemyBallMesh) enemyBallMesh.visible = false;
    ctx?.rival?.bury?.({ x: lp.x, y: lp.y, z: lp.z }, 'snow');
    emitGag(ctx, 'snow', 'kai_snowman', lp);
    ctx?.fx?.hearts?.({ x: center.x + 2.4, y: center.y + 1.8, z: center.z + 1.0 }, 12);
    timers.after(1.15, () => {
      if (active) ctx?.quests?.complete?.('snow');
    });
    return;
  }

  // Flinch and duck into next lane cycle
  ctx?.rival?.actor?.setEmote?.('💢');
  ctx?.rival?.actor?.setAnim?.('cry');
  const prev = laneIdx;
  laneIdx = (prev + rngInt(ctx, 1, 2)) % 3;
  setKaiPopState(ctx, false);
}

const qSnow = {
  id: 'snow',
  contestantId: 'snow',
  area: 'hub',
  poi: 'snowArena',
  order: 5,

  start(ctx) {
    ensureArenaVisuals();
    timers.clear();
    hits = 0;
    misses = 0;
    packSteps = 0;
    hasSnowball = false;
    activeBankIdx = 1;
    active = true;
    completing = false;
    playerShot = null;
    enemyShot = null;

    const base = poi(ctx, 'snowArena', { x: 50.5, y: 8, z: 16.5 });
    const gy = surfaceY(ctx, 50.0, 16.5, base.y ?? 8);
    center = { x: 50.0, y: gy, z: 16.5 };
    wallPos = { x: 50.0, y: gy, z: 12.2 };
    standPos = { x: 50.0, y: gy, z: 16.8 };
    lanes = [47.6, 50.0, 52.4].map((lx) => ({
      x: lx,
      y: surfaceY(ctx, lx, 11.4, gy),
      z: 11.4,
    }));

    arenaGroup.position.set(0, 0, 0);
    arenaGroup.visible = true;
    playerBallMesh.visible = false;
    heldBallMesh.visible = false;
    enemyBallMesh.visible = false;
    attachToScene(ctx, arenaGroup);
    attachToScene(ctx, playerBallMesh);
    attachToScene(ctx, heldBallMesh);
    attachToScene(ctx, enemyBallMesh);

    for (const b of bankEntries) {
      b.wobble = 0;
      b.unpick?.();
      b.unpick = registerPick(ctx, b.group, {
        id: `snow_bank_${b.index}`,
        targetId: `snow_bank_${b.index}`,
        kind: 'block',
        label: QUEST_LABELS.snow.packSnowball,
        hitRadius: 1.15,
      });
    }

    // Spawn 雪宝 cheering beside the arena + 2 cute snow golem spectators
    if (!snowContestant && ctx?.chars?.create) {
      snowContestant = ctx.chars.create('snow', { id: 'quest_snow_actor' });
    }
    if (snowContestant) {
      const sx = 54.4;
      const sz = 16.2;
      snowContestant.group.position.set(sx, surfaceY(ctx, sx, sz, gy), sz);
      snowContestant.lookAt(wallPos);
      snowContestant.setAnim('wave');
      snowContestant.setEmote('❄️');
      snowContestant.setVisible(true);
      attachToScene(ctx, snowContestant.group);
    }

    while (golemSpectators.length < 2 && ctx?.chars?.create) {
      golemSpectators.push(ctx.chars.create('snowGolemMob'));
    }
    golemSpectators.forEach((g, idx) => {
      const gx = 45.4 - idx * 1.1;
      const gz = 15.8 + idx * 1.2;
      g.group.position.set(gx, surfaceY(ctx, gx, gz, gy), gz);
      g.lookAt(wallPos);
      g.setHelmet?.(true);
      g.setAnim('hop');
      g.setVisible(true);
      attachToScene(ctx, g.group);
    });

    laneIdx = 1;
    setKaiPopState(ctx, true);

    if (ctx?.rival?.actor?.group) {
      unpickKai = registerPick(ctx, ctx.rival.actor.group, {
        id: 'snow_throw_lane',
        targetId: 'snow_throw_lane',
        entityId: 'kai',
        kind: 'entity',
        label: QUEST_LABELS.snow.peltKai,
        hitRadius: 1.35,
      });
    }
    unpickEnemyBall = registerPick(ctx, enemyBallMesh, {
      id: 'snow_enemy_ball',
      targetId: 'snow_enemy_ball',
      kind: 'entity',
      label: QUEST_LABELS.snow.swatSnowball,
      hitRadius: 1.15,
    });
  },

  update(dt, ctx) {
    if (!active) return;
    timers.update(dt);
    snowContestant?.update?.(dt);
    for (const g of golemSpectators) g.update?.(dt);

    // Highlight active snowbank vs active firing lane ring
    for (const b of bankEntries) {
      b.ring.visible = !completing && !hasSnowball && b.index === activeBankIdx;
      if (b.wobble > 0) {
        b.wobble = Math.max(0, b.wobble - dt);
        const s = 1 + Math.sin(b.wobble * 40) * 0.12;
        b.group.scale.set(s, 2 - s, s);
      } else {
        b.group.scale.set(1, 1, 1);
      }
    }
    for (let i = 0; i < lanePads.length; i++) {
      lanePads[i].visible = !completing && hasSnowball && (kaiUp || duckGrace > 0) && i === laneIdx;
    }

    // Show packed snowball floating by player's hands while carrying
    if (heldBallMesh) {
      if (hasSnowball && !playerShot && !completing) {
        const pPos = playerPos(ctx);
        heldBallMesh.visible = true;
        heldBallMesh.position.set(pPos.x + 0.32, (pPos.y ?? 8) + 1.18, pPos.z - 0.28);
      } else {
        heldBallMesh.visible = false;
      }
    }

    // Update player's arcing snowball (0.45s)
    if (playerShot) {
      playerShot.elapsed += dt;
      const u = Math.min(1, playerShot.elapsed / playerShot.duration);
      const lp = currentLanePos();
      playerShot.to.x = lp.x;
      playerShot.to.y = lp.y + 1.35;
      playerShot.to.z = lp.z;
      const x = playerShot.from.x + (playerShot.to.x - playerShot.from.x) * u;
      const z = playerShot.from.z + (playerShot.to.z - playerShot.from.z) * u;
      const y =
        playerShot.from.y +
        (playerShot.to.y - playerShot.from.y) * u +
        Math.sin(u * Math.PI) * 1.65;
      if (playerBallMesh) {
        playerBallMesh.position.set(x, y, z);
        playerBallMesh.rotation.x += dt * 12;
        playerBallMesh.rotation.y += dt * 9;
      }
      if (u >= 1) {
        playerShot = null;
        if (playerBallMesh) playerBallMesh.visible = false;
        handleKaiHit(ctx);
      }
    }

    // Update 小凯's slow incoming snowball
    if (enemyShot) {
      enemyShot.elapsed += dt;
      const u = Math.min(1, enemyShot.elapsed / enemyShot.duration);
      const x = enemyShot.from.x + (enemyShot.to.x - enemyShot.from.x) * u;
      const z = enemyShot.from.z + (enemyShot.from.z !== enemyShot.to.z ? (enemyShot.to.z - enemyShot.from.z) * u : 0);
      const y =
        enemyShot.from.y +
        (enemyShot.to.y - enemyShot.from.y) * u +
        Math.sin(u * Math.PI) * 1.9;
      if (enemyBallMesh) {
        enemyBallMesh.position.set(x, y, z);
        enemyBallMesh.rotation.x += dt * 8;
      }
      if (u >= 1) {
        enemyShot = null;
        if (enemyBallMesh) enemyBallMesh.visible = false;
        ctx?.fx?.splat?.();
        playSfx(ctx, 'snow_hit', { pos: playerPos(ctx), pitch: 0.78 });
      }
    }

    if (completing) return;

    if (!kaiUp && duckGrace > 0) {
      duckGrace = Math.max(0, duckGrace - dt);
    }

    // Trigger 小凯's throw mid pop-up
    if (kaiUp && !threwThisPopup && phaseTimer <= 1.25) {
      threwThisPopup = true;
      spawnEnemySnowball(ctx);
    }

    phaseTimer -= dt;
    if (phaseTimer <= 0 && !playerShot) {
      if (kaiUp) {
        if (!hitThisPopup) {
          misses += 1;
          duckGrace = 0.24;
        } else {
          duckGrace = 0;
        }
        setKaiPopState(ctx, false);
      } else {
        const prev = laneIdx;
        laneIdx = (prev + rngInt(ctx, 1, 2)) % 3;
        setKaiPopState(ctx, true);
      }
    }
  },

  onTap(hit, ctx) {
    if (!active || completing) return true;
    const tid = hit?.targetId || hit?.id || '';

    if (tid === 'snow_enter') {
      playSfx(ctx, 'step_snow', { pos: standPos });
      return true;
    }

    if (tid === 'snow_enemy_ball' && enemyShot) {
      return swatEnemySnowball(ctx);
    }

    if (tid.startsWith('snow_bank_')) {
      const idx = Number.parseInt(tid.slice('snow_bank_'.length), 10);
      return scoopSnowbank(ctx, bankEntries[idx] || currentBank());
    }

    if (tid === 'snow_throw_lane' || tid === 'snow_kai' || hit?.entityId === 'kai') {
      if (!hasSnowball) {
        // Remind player to scoop snow first with soft puff
        playSfx(ctx, 'step_snow', { pos: playerPos(ctx) });
        return true;
      }
      if (kaiUp || duckGrace > 0) {
        return launchPlayerSnowball(ctx);
      }
      misses += 1;
      const lp = currentLanePos();
      ctx?.fx?.wobble?.(lp);
      playSfx(ctx, 'step_snow', { pos: lp });
      return true;
    }

    return false;
  },

  onAction() {},

  targets(ctx) {
    const pPos = playerPos(ctx);
    if (completing) {
      const lp = currentLanePos();
      return [{ id: 'snow_done_wait', pos: { x: lp.x, y: 8, z: 13.5 }, kind: 'wait', label: QUEST_LABELS.snow.snowmanKai, range: 2.3 }];
    }

    // Walk into snow arena first if player activated quest from far away
    if (distXZ(pPos, center) > 10.5) {
      return [{ id: 'snow_enter', pos: standPos, kind: 'block', label: QUEST_LABELS.snow.snowArena, range: 2.3 }];
    }

    // Swat incoming snowball if it is right within melee reach of player
    if (enemyShot && enemyBallMesh && distXZ(pPos, enemyBallMesh.position) <= 2.2) {
      return [
        {
          id: 'snow_enemy_ball',
          pos: { x: enemyBallMesh.position.x, y: 8, z: enemyBallMesh.position.z },
          kind: 'entity',
          label: QUEST_LABELS.snow.swatSnowball,
          range: 2.3,
        },
      ];
    }

    // Step 1: Scoop & pack a snowball at the active snowbank
    if (!hasSnowball && !playerShot) {
      const b = currentBank();
      return [
        {
          id: `snow_bank_${b.index}`,
          pos: { x: b.x, y: 8, z: b.z },
          kind: 'block',
          label: QUEST_LABELS.snow.packSnowball,
          range: 2.2,
        },
      ];
    }

    // Step 2: Run forward to the active lane trench and pelt 小凯 when he pops up!
    const throwSpot = currentThrowSpot();
    if ((kaiUp || duckGrace > 0) && !playerShot) {
      return [
        {
          id: 'snow_throw_lane',
          pos: throwSpot,
          kind: 'entity',
          label: QUEST_LABELS.snow.peltKai,
          range: 2.3,
        },
      ];
    }

    // While snowball is arcing or 小凯 is ducking behind the fort, wait ready at the firing line
    return [
      {
        id: 'snow_ready_wait',
        pos: { x: 50.0, y: 8, z: 14.2 },
        kind: 'wait',
        label: QUEST_LABELS.snow.waitKaiPeek,
        range: 2.4,
      },
    ];
  },

  pointer(ctx) {
    if (distXZ(playerPos(ctx), center) > 10.5) {
      return { x: standPos.x, y: standPos.y + 1.2, z: standPos.z };
    }
    if (!hasSnowball && !playerShot) {
      const b = currentBank();
      return { x: b.x, y: 9.2, z: b.z };
    }
    const lp = currentLanePos();
    return { x: lp.x, y: lp.y + 1.8, z: lp.z };
  },

  objective() {
    return { icon: '❄️', have: Math.min(hits, TOTAL_HITS), need: TOTAL_HITS };
  },

  introPos() {
    return { x: 54.4, y: center.y ?? 8, z: 16.2 };
  },

  action() {
    return null;
  },

  cleanup(ctx) {
    active = false;
    completing = false;
    playerShot = null;
    enemyShot = null;
    hasSnowball = false;
    packSteps = 0;
    timers.clear();
    unpickKai?.();
    unpickEnemyBall?.();
    unpickKai = null;
    unpickEnemyBall = null;
    for (const b of bankEntries) {
      b.unpick?.();
      b.unpick = null;
    }
    if (arenaGroup) {
      arenaGroup.visible = false;
      detachFromScene(arenaGroup);
    }
    if (playerBallMesh) {
      playerBallMesh.visible = false;
      detachFromScene(playerBallMesh);
    }
    if (heldBallMesh) {
      heldBallMesh.visible = false;
      detachFromScene(heldBallMesh);
    }
    if (enemyBallMesh) {
      enemyBallMesh.visible = false;
      detachFromScene(enemyBallMesh);
    }
    if (snowContestant) {
      snowContestant.setEmote(null);
      snowContestant.setVisible(false);
      detachFromScene(snowContestant.group);
    }
    for (const g of golemSpectators) {
      g.setVisible(false);
      detachFromScene(g.group);
    }
    ctx?.rival?.leave?.();
  },
};

export default qSnow;
