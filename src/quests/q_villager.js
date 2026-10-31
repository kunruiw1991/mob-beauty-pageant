// Quest 10: villager — 翠翠 (10 emerald slots at market stall:
// 3 golden wheat harvests -> 3 villager trades ("hrrm" -> 1 emerald each = 3)
// + 问号先生 sprinting across square dropping diamonds (2 diamonds)
// + 小凯 Bank passcode chest (3 colored blocks on corner sign, 6 colored buttons -> capped +5 emerald shower)
// -> slot all 10 gems at Market Stall -> 翠翠 pops in w/ emerald eyes & 小凯 faints at his empty chest, docs/DESIGN.md §6.10).

import * as THREE from '../../vendor/three.module.min.js';
import { B } from '../world/blocks.js';
import {
  surfaceY,
  playerPos,
  rngInt,
  createTimers,
  createBreakable,
  createCollectible,
  emitGag,
  playSfx,
  sharedBoxGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
  registerPick,
} from './kit.js';

const TOTAL_RICHES = 10;
const BANK_REWARD_CAP = 5;
const DIAMOND_CAP = 2;
const STALL_SLOT_TAPS = 3;

const STALL_COUNTER = { x: 74.0, y: 8, z: 22.5 };
const STALL_ARRIVE = { x: 74.2, y: 8, z: 24.3 };

const WHEAT_SPOTS = [
  { x: 58.5, y: 8, z: 28.5, label: '收金麦束' },
  { x: 67.5, y: 8, z: 37.5, label: '收金麦束' },
  { x: 75.0, y: 8, z: 16.5, label: '收金麦束' },
];

const VILLAGER_SPOTS = [
  { x: 66.5, y: 8, z: 23.5 },
  { x: 74.5, y: 8, z: 32.5 },
  { x: 79.5, y: 8, z: 26.5 },
];

const MYSTERY_START = { x: 66.5, y: 8, z: 23.5 };
const MYSTERY_END = { x: 78.5, y: 8, z: 31.5 };
const SQUARE_WAIT_POS = { x: 72.5, y: 8, z: 27.5 };

const BANK_SIGN_POS = { x: 86.5, y: 8, z: 27.6 };
const BANK_SIGN_STAND = { x: 85.8, y: 8, z: 28.5 };
const BANK_CHEST_FLOOR = { x: 84.6, y: 8, z: 30.5 };
const BANK_KEYPAD_ORIGIN = { x: 85.45, y: 9.05, z: 30.5 };
const VAULT_EMERALD_COORDS = [
  [86, 8, 32], [87, 8, 32], [86, 8, 33], [87, 8, 33],
  [86, 9, 32], [87, 9, 32], [86, 9, 33], [87, 9, 33],
  [87, 10, 33], [83, 8, 33],
];

const BUTTON_COLORS = [
  { idx: 0, hex: 0xc43bd8, blockId: B.CONCRETE_PERFECT, sfx: 'note0', label: '紫按钮' },
  { idx: 1, hex: 0x3b5bdb, blockId: B.CONCRETE_GORGEOUS, sfx: 'note1', label: '蓝按钮' },
  { idx: 2, hex: 0xf2c318, blockId: B.CONCRETE_PRETTY, sfx: 'note2', label: '黄按钮' },
  { idx: 3, hex: 0xd9342b, blockId: B.CONCRETE_OKAY, sfx: 'note3', label: '红按钮' },
  { idx: 4, hex: 0x3fae3a, blockId: B.CONCRETE_TRYHARD, sfx: 'note4', label: '绿按钮' },
  { idx: 5, hex: 0xf77f00, blockId: B.TERRACOTTA_ORANGE, sfx: 'note5', label: '橙按钮' },
];

let villageRoot = null;
let stallRackGroup = null;
const slotMeshes = [];
const signBlockMeshes = [];
const keypadButtons = [];
const codePipMeshes = [];
let signPostGroup = null;
let emeraldEyesGroup = null;

function ensureVillagerVisuals() {
  if (villageRoot) return;
  villageRoot = new THREE.Group();
  villageRoot.name = 'qVillagerRoot';

  stallRackGroup = new THREE.Group();
  stallRackGroup.position.set(STALL_COUNTER.x, STALL_COUNTER.y + 1.08, STALL_COUNTER.z + 0.35);
  const boardBack = new THREE.Mesh(sharedBoxGeo(2.55, 0.78, 0.14), sharedLambertMat(0x5c3d2e));
  stallRackGroup.add(boardBack);

  const emptyMat = sharedBasicMat(0x1f2937, { opacity: 0.75, transparent: true });
  const fullMat = sharedBasicMat(0x26d663);
  for (let i = 0; i < TOTAL_RICHES; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const sx = (col - 2) * 0.46;
    const sy = (1 - row) * 0.32 - 0.16;
    const frame = new THREE.Mesh(sharedBoxGeo(0.32, 0.26, 0.16), emptyMat);
    frame.position.set(sx, sy, 0.03);
    const gem = new THREE.Mesh(sharedBoxGeo(0.24, 0.22, 0.22), fullMat);
    gem.position.set(sx, sy, 0.08);
    gem.visible = false;
    stallRackGroup.add(frame, gem);
    slotMeshes.push(gem);
  }
  villageRoot.add(stallRackGroup);

  signPostGroup = new THREE.Group();
  signPostGroup.position.set(BANK_SIGN_POS.x, BANK_SIGN_POS.y, BANK_SIGN_POS.z);
  const post = new THREE.Mesh(sharedBoxGeo(0.14, 1.35, 0.14), sharedLambertMat(0x8d5b3c));
  post.position.y = 0.68;
  const plaque = new THREE.Mesh(sharedBoxGeo(0.22, 0.85, 1.25), sharedLambertMat(0xd4a373));
  plaque.position.set(-0.08, 1.45, 0);
  signPostGroup.add(post, plaque);

  for (let i = 0; i < 3; i++) {
    const cube = new THREE.Mesh(sharedBoxGeo(0.28, 0.28, 0.28), sharedLambertMat(0xffffff));
    cube.position.set(-0.18, 1.45, (i - 1) * 0.36);
    signPostGroup.add(cube);
    signBlockMeshes.push(cube);
  }
  villageRoot.add(signPostGroup);

  const panelBack = new THREE.Mesh(sharedBoxGeo(0.16, 1.05, 1.75), sharedLambertMat(0x2b2d42));
  panelBack.position.set(BANK_KEYPAD_ORIGIN.x + 0.12, BANK_KEYPAD_ORIGIN.y + 0.22, BANK_KEYPAD_ORIGIN.z);
  villageRoot.add(panelBack);

  for (let i = 0; i < 3; i++) {
    const pip = new THREE.Mesh(sharedBoxGeo(0.14, 0.14, 0.18), sharedBasicMat(0x475569));
    pip.position.set(BANK_KEYPAD_ORIGIN.x + 0.02, BANK_KEYPAD_ORIGIN.y + 0.62, BANK_KEYPAD_ORIGIN.z + (i - 1) * 0.36);
    villageRoot.add(pip);
    codePipMeshes.push(pip);
  }

  for (let i = 0; i < 6; i++) {
    const spec = BUTTON_COLORS[i];
    const row = Math.floor(i / 3);
    const col = i % 3;
    const by = BANK_KEYPAD_ORIGIN.y + (1 - row) * 0.36 - 0.08;
    const bz = BANK_KEYPAD_ORIGIN.z + (col - 1) * 0.50;
    const bx = BANK_KEYPAD_ORIGIN.x;

    const btnGroup = new THREE.Group();
    btnGroup.position.set(bx, by, bz);
    const btnMesh = new THREE.Mesh(sharedBoxGeo(0.24, 0.28, 0.36), sharedLambertMat(spec.hex));
    const halo = new THREE.Mesh(
      sharedBoxGeo(0.28, 0.34, 0.42),
      sharedBasicMat(0xffe066, { opacity: 0.72, transparent: true })
    );
    halo.visible = false;
    btnGroup.add(btnMesh, halo);
    villageRoot.add(btnGroup);

    keypadButtons.push({
      idx: i,
      spec,
      group: btnGroup,
      halo,
      pos: { x: bx, y: by, z: bz },
      pressTimer: 0,
      unpick: null,
    });
  }

  emeraldEyesGroup = new THREE.Group();
  const eyeL = new THREE.Mesh(sharedBoxGeo(0.2, 0.2, 0.14), sharedBasicMat(0x26d663));
  eyeL.position.set(0.2, 0.45, 0.54);
  const eyeR = new THREE.Mesh(sharedBoxGeo(0.2, 0.2, 0.14), sharedBasicMat(0x26d663));
  eyeR.position.set(-0.2, 0.45, 0.54);
  emeraldEyesGroup.add(eyeL, eyeR);
}

let active = false;
let completing = false;
let riches = 0;
let readyToSlotStall = false;
let stallSlotSteps = 0;
let wheatCount = 0;
let diamondsCollected = 0;

let bankCode = [0, 2, 4];
let codeStep = 0;
let bankMisses = 0;
let bankCracked = false;
let signReads = 0;
let signInspected = false;
let unpickSign = null;
let unpickStall = null;

let mysteryActor = null;
let mysteryLoopClock = 0;
let mysteryRunning = false;
let mysteryProgress = 0;
let mysteryDropsThisRun = 0;
let nextDiamondUid = 1;
const liveDiamonds = [];

const wheatBundles = [];
const villagerEntries = [];
let villagerContestant = null;
const timers = createTimers();

function syncSlotVisuals() {
  for (let i = 0; i < slotMeshes.length; i++) {
    slotMeshes[i].visible = i < riches;
  }
}

function syncCodePips() {
  for (let i = 0; i < 3; i++) {
    const lit = bankCracked || i < codeStep;
    const colHex = lit ? BUTTON_COLORS[bankCode[i]].hex : 0x475569;
    codePipMeshes[i].material = sharedBasicMat(colHex);
  }
}

function addRiches(ctx, amount, fxPos) {
  if (completing || amount <= 0) return;
  riches = Math.min(TOTAL_RICHES, riches + amount);
  syncSlotVisuals();
  playSfx(ctx, 'xp', { pos: fxPos || STALL_COUNTER, pitch: 0.9 + riches * 0.06 });
  ctx?.fx?.sparkles?.(fxPos || STALL_COUNTER, 8, { toPlayer: true });
  ctx?.events?.emit?.('questStep', { id: 'villager', step: riches });

  if (riches >= TOTAL_RICHES) {
    readyToSlotStall = true;
  }
}

function triggerRichFinale(ctx) {
  if (completing) return;
  completing = true;
  readyToSlotStall = false;

  const cuicuiPos = { x: STALL_COUNTER.x, y: 8, z: STALL_COUNTER.z + 1.1 };
  if (!villagerContestant && ctx?.chars?.create) {
    villagerContestant = ctx.chars.create('villager', { id: 'quest_villager_actor' });
  }
  if (villagerContestant) {
    const headNode = villagerContestant.parts?.head || villagerContestant.group;
    if (emeraldEyesGroup.parent !== headNode) headNode.add(emeraldEyesGroup);
    emeraldEyesGroup.visible = true;
    villagerContestant.group.position.set(cuicuiPos.x, cuicuiPos.y, cuicuiPos.z);
    villagerContestant.lookAt(playerPos(ctx));
    villagerContestant.setAnim('happy');
    villagerContestant.setEmote('💎');
    villagerContestant.setVisible(true);
    attachToScene(ctx, villagerContestant.group);
  }
  playSfx(ctx, 'kaching', { pos: cuicuiPos });
  ctx?.fx?.sparkles?.(cuicuiPos, 20, { toPlayer: false });
  ctx?.fx?.hearts?.({ x: cuicuiPos.x, y: 9.8, z: cuicuiPos.z }, 14);
  emitGag(ctx, 'villager', 'emerald_eyes', cuicuiPos);

  ctx?.rival?.faint?.(BANK_CHEST_FLOOR, 'villager');
  emitGag(ctx, 'villager', 'kai_faint', BANK_CHEST_FLOOR);

  timers.after(1.45, () => {
    if (active) ctx?.quests?.complete?.('villager');
  });
}

function startMysterySprint(ctx) {
  if (diamondsCollected >= DIAMOND_CAP) return;
  mysteryRunning = true;
  mysteryProgress = 0;
  mysteryDropsThisRun = 0;
  if (!mysteryActor && ctx?.chars?.create) {
    mysteryActor = ctx.chars.create('mystery', { id: 'quest_mystery_man' });
  }
  if (mysteryActor) {
    mysteryActor.group.position.set(MYSTERY_START.x, MYSTERY_START.y, MYSTERY_START.z);
    mysteryActor.lookAt(MYSTERY_END);
    mysteryActor.setAnim('run');
    mysteryActor.setEmote('💎');
    mysteryActor.setVisible(true);
    attachToScene(ctx, mysteryActor.group);
  }
  playSfx(ctx, 'pop', { pos: MYSTERY_START, pitch: 1.2 });
}

function dropMysteryDiamond(ctx, atPos) {
  if (diamondsCollected >= DIAMOND_CAP) return;
  const uid = `villager_diamond_${nextDiamondUid++}`;
  const item = createCollectible(ctx, {
    id: uid,
    pos: { x: atPos.x, y: 8, z: atPos.z },
    size: 0.36,
    color: 0x38bdf8,
    sparkle: true,
    sparkleColor: 0xbae6fd,
    autoPickupRadius: 0,
    ttl: 7.5,
    range: 2.2,
    item: 'diamond',
    label: '捡钻石',
    sfx: 'pickup',
    onCollect: () => {
      if (diamondsCollected >= DIAMOND_CAP) return;
      diamondsCollected += 1;
      addRiches(ctx, 1, atPos);
      if (diamondsCollected >= DIAMOND_CAP) {
        for (const rem of liveDiamonds) rem.destroy();
        liveDiamonds.length = 0;
      }
    },
  });
  liveDiamonds.push(item);
}

const qVillager = {
  id: 'villager',
  contestantId: 'villager',
  area: 'hub',
  poi: 'stall',
  order: 10,

  start(ctx) {
    ensureVillagerVisuals();
    timers.clear();
    active = true;
    completing = false;
    riches = 0;
    readyToSlotStall = false;
    stallSlotSteps = 0;
    wheatCount = 0;
    diamondsCollected = 0;
    codeStep = 0;
    bankMisses = 0;
    bankCracked = false;
    signReads = 0;
    signInspected = false;

    if (ctx?.state?.area && ctx.state.area !== 'hub') {
      if (typeof ctx.areas?.setArea === 'function') ctx.areas.setArea('hub', STALL_ARRIVE);
      else {
        ctx.world?.setArea?.('hub');
        ctx.state.area = 'hub';
      }
    }

    for (const [vx, vy, vz] of VAULT_EMERALD_COORDS) {
      ctx?.world?.setBlock?.(vx, vy, vz, B.EMERALD_BLOCK);
    }

    const pool = [0, 1, 2, 3, 4, 5];
    bankCode = [];
    for (let i = 0; i < 3; i++) {
      const pickIdx = rngInt(ctx, 0, pool.length - 1);
      bankCode.push(pool.splice(pickIdx, 1)[0]);
    }

    const cornerYs = [10, 9, 8];
    for (let i = 0; i < 3; i++) {
      const spec = BUTTON_COLORS[bankCode[i]];
      ctx?.world?.setBlock?.(87, cornerYs[i], 27, spec.blockId);
      signBlockMeshes[i].material = sharedLambertMat(spec.hex);
    }

    syncSlotVisuals();
    syncCodePips();

    villageRoot.visible = true;
    attachToScene(ctx, villageRoot);

    unpickSign?.();
    unpickSign = registerPick(ctx, signPostGroup, {
      id: 'villager_bank_sign',
      targetId: 'villager_bank_sign',
      kind: 'block',
      label: '看密码牌',
      hitRadius: 1.25,
    });

    unpickStall?.();
    unpickStall = registerPick(ctx, stallRackGroup, {
      id: 'villager_stall_deliver',
      targetId: 'villager_stall_deliver',
      kind: 'block',
      label: '摆满宝石摊',
      hitRadius: 1.4,
    });

    for (const btn of keypadButtons) {
      btn.halo.visible = false;
      btn.pressTimer = 0;
      btn.unpick?.();
      btn.unpick = registerPick(ctx, btn.group, {
        id: `villager_bank_btn_${btn.idx}`,
        targetId: `villager_bank_btn_${btn.idx}`,
        kind: 'block',
        label: btn.spec.label,
        hitRadius: 0.65,
      });
    }

    for (const wb of wheatBundles) wb.destroy();
    wheatBundles.length = 0;
    WHEAT_SPOTS.forEach((sp, idx) => {
      wheatBundles.push(
        createBreakable(ctx, {
          id: `villager_wheat_${idx}`,
          pos: { x: sp.x, y: 8, z: sp.z },
          taps: 3,
          size: 0.78,
          height: 0.86,
          color: 0xeab308,
          speckColor: 0xfef08a,
          blockId: B.HAY,
          sfxHit: 'hit_soft',
          sfxBreak: 'pickup',
          label: sp.label,
          range: 2.2,
          onBreak: () => {
            wheatCount += 1;
            ctx?.events?.emit?.('collect', { item: 'wheat', count: 1, pos: sp });
            ctx?.fx?.sparkles?.({ x: sp.x, y: 8.6, z: sp.z }, 8, { toPlayer: true });
          },
        })
      );
    });

    while (villagerEntries.length < 3) {
      const idx = villagerEntries.length;
      const actor = ctx?.chars?.create ? ctx.chars.create('villagerMob', { id: `villager_npc_${idx}` }) : null;
      villagerEntries.push({ idx, actor, traded: false, unpick: null });
    }
    villagerEntries.forEach((v, idx) => {
      const sp = VILLAGER_SPOTS[idx];
      const gy = surfaceY(ctx, sp.x, sp.z, 8);
      v.traded = false;
      if (v.actor) {
        v.actor.group.position.set(sp.x, gy, sp.z);
        v.actor.lookAt(STALL_ARRIVE);
        v.actor.setAnim('idle');
        v.actor.setEmote('🌾');
        v.actor.setVisible(true);
        attachToScene(ctx, v.actor.group);
        v.unpick?.();
        v.unpick = registerPick(ctx, v.actor.group, {
          id: `villager_npc_${idx}`,
          targetId: `villager_npc_${idx}`,
          entityId: `villager_npc_${idx}`,
          kind: 'entity',
          label: '村民换宝石',
          hitRadius: 1.15,
        });
      }
    });

    for (const d of liveDiamonds) d.destroy();
    liveDiamonds.length = 0;
    mysteryRunning = false;
    mysteryLoopClock = 0;
    if (villagerContestant) villagerContestant.setVisible(false);
  },

  update(dt, ctx) {
    if (!active) return;
    timers.update(dt);

    for (const wb of wheatBundles) wb.update(dt);
    for (const v of villagerEntries) {
      if (v.actor && !v.traded) {
        v.actor.setEmote(wheatCount > 0 ? '💚' : '🌾');
      }
      v.actor?.update?.(dt);
    }
    villagerContestant?.update?.(dt);

    for (let i = liveDiamonds.length - 1; i >= 0; i--) {
      const d = liveDiamonds[i];
      d.update(dt, ctx);
      if (d.collected || d.expired) {
        liveDiamonds.splice(i, 1);
      }
    }

    if (!completing && !readyToSlotStall && diamondsCollected < DIAMOND_CAP) {
      const allVillagersDone = villagerEntries.every((v) => v.traded);
      mysteryLoopClock += dt;
      const period = allVillagersDone ? 4.2 : 6.4;
      if (!mysteryRunning && mysteryLoopClock >= period) {
        mysteryLoopClock = 0;
        startMysterySprint(ctx);
      }
      if (mysteryRunning) {
        mysteryProgress += dt / 2.2;
        const u = Math.min(1, mysteryProgress);
        const mx = MYSTERY_START.x + (MYSTERY_END.x - MYSTERY_START.x) * u;
        const mz = MYSTERY_START.z + (MYSTERY_END.z - MYSTERY_START.z) * u;
        const my = surfaceY(ctx, mx, mz, 8);
        if (mysteryActor) {
          mysteryActor.group.position.set(mx, my, mz);
          mysteryActor.update(dt);
        }
        const thresholds = [0.22, 0.52, 0.80];
        while (mysteryDropsThisRun < 3 && u >= thresholds[mysteryDropsThisRun]) {
          dropMysteryDiamond(ctx, { x: mx, y: my, z: mz });
          mysteryDropsThisRun += 1;
        }
        if (u >= 1) {
          mysteryRunning = false;
          mysteryActor?.setVisible?.(false);
        }
      }
    }

    const expectedBtn = !bankCracked ? bankCode[codeStep] : -1;
    for (const btn of keypadButtons) {
      if (btn.pressTimer > 0) {
        btn.pressTimer = Math.max(0, btn.pressTimer - dt);
        btn.group.position.x = BANK_KEYPAD_ORIGIN.x + (btn.pressTimer > 0 ? 0.08 : 0);
      }
      btn.halo.visible = !bankCracked && (signInspected || bankMisses >= 3) && btn.idx === expectedBtn;
    }
  },

  onTap(hit, ctx) {
    if (!active || completing) return true;
    const tid = hit?.targetId || hit?.id || '';

    if (tid === 'villager_stall_deliver' && readyToSlotStall) {
      stallSlotSteps += 1;
      playSfx(ctx, 'xp', { pos: STALL_COUNTER, pitch: 1.0 + stallSlotSteps * 0.14 });
      ctx?.fx?.sparkles?.(STALL_COUNTER, 10, { toPlayer: false });
      if (stallSlotSteps >= STALL_SLOT_TAPS) {
        triggerRichFinale(ctx);
      }
      return true;
    }

    for (const wb of wheatBundles) {
      if (!wb.broken && (tid === wb.id || wb.matchesHit(hit))) {
        return wb.tap(ctx);
      }
    }

    for (const v of villagerEntries) {
      if (v.traded) continue;
      const vp = v.actor?.group?.position || VILLAGER_SPOTS[v.idx];
      if (
        tid === `villager_npc_${v.idx}` ||
        hit?.entityId === `villager_npc_${v.idx}` ||
        (hit?.pos && Math.hypot((hit.pos.x ?? 0) - vp.x, (hit.pos.z ?? 0) - vp.z) <= 1.55)
      ) {
        if (wheatCount <= 0 && wheatBundles.some((wb) => !wb.broken)) {
          playSfx(ctx, 'hrrm', { pos: vp, pitch: 0.85 });
          v.actor?.setEmote?.('🌾');
          return true;
        }
        if (wheatCount > 0) wheatCount -= 1;
        v.traded = true;
        v.unpick?.();
        v.unpick = null;
        v.actor?.setEmote?.('✨');
        v.actor?.setAnim?.('cheer');
        playSfx(ctx, 'hrrm', { pos: vp });
        ctx?.events?.emit?.('collect', { item: 'emerald', count: 1, pos: vp });
        addRiches(ctx, 1, vp);
        if (villagerEntries.every((ve) => ve.traded) && !mysteryRunning && liveDiamonds.length === 0) {
          startMysterySprint(ctx);
        }
        return true;
      }
    }

    for (const d of liveDiamonds) {
      if (!d.collected && !d.expired && (tid === d.id || d.matchesHit(hit))) {
        return d.collect(ctx);
      }
    }

    if (tid === 'villager_bank_sign') {
      signReads += 1;
      playSfx(ctx, 'pop', { pos: BANK_SIGN_POS, pitch: 1.05 + signReads * 0.12 });
      ctx?.fx?.sparkles?.({ x: BANK_SIGN_POS.x, y: 9.4, z: BANK_SIGN_POS.z }, 10, { toPlayer: false });
      if (signReads >= 3) {
        signInspected = true;
      }
      return true;
    }

    let tappedBtn = null;
    if (tid.startsWith('villager_bank_btn_')) {
      const bIdx = Number.parseInt(tid.slice('villager_bank_btn_'.length), 10);
      tappedBtn = keypadButtons[bIdx] || null;
    } else if (hit?.pos && !bankCracked) {
      let best = 0.65;
      for (const b of keypadButtons) {
        const dist = Math.hypot(
          (hit.pos.x ?? 0) - b.pos.x,
          (hit.pos.y ?? 9) - b.pos.y,
          (hit.pos.z ?? 0) - b.pos.z
        );
        if (dist < best) {
          best = dist;
          tappedBtn = b;
        }
      }
    }

    if (tappedBtn && !bankCracked) {
      tappedBtn.pressTimer = 0.18;
      if (tappedBtn.idx === bankCode[codeStep]) {
        playSfx(ctx, tappedBtn.spec.sfx, { pos: tappedBtn.pos });
        codeStep += 1;
        syncCodePips();

        if (codeStep >= 3) {
          bankCracked = true;
          syncCodePips();
          for (const [vx, vy, vz] of VAULT_EMERALD_COORDS) {
            ctx?.world?.setBlock?.(vx, vy, vz, B.AIR);
          }
          const showerPos = { x: 86, y: 9, z: 30.5 };
          playSfx(ctx, 'kaching', { pos: showerPos });
          ctx?.fx?.burst?.(showerPos, B.EMERALD_BLOCK, 24);
          ctx?.fx?.sparkles?.(showerPos, 18, { toPlayer: true });
          const reward = Math.min(BANK_REWARD_CAP, Math.max(1, TOTAL_RICHES - riches));
          ctx?.events?.emit?.('collect', { item: 'emerald', count: reward, pos: showerPos });
          addRiches(ctx, reward, showerPos);
        }
        return true;
      }

      bankMisses += 1;
      codeStep = 0;
      syncCodePips();
      ctx?.fx?.wobble?.(tappedBtn.pos);
      playSfx(ctx, 'blocked', { pos: tappedBtn.pos });
      return true;
    }

    return false;
  },

  onAction() {},

  targets() {
    if (completing) {
      return [
        {
          id: 'villager_done_wait',
          pos: { ...STALL_ARRIVE },
          kind: 'wait',
          label: '翠翠',
          range: 2.3,
        },
      ];
    }

    if (readyToSlotStall) {
      return [
        {
          id: 'villager_stall_deliver',
          pos: { ...STALL_ARRIVE },
          kind: 'block',
          label: '摆满宝石摊',
          range: 2.3,
        },
      ];
    }

    // 1. Pairwise harvest wheat -> trade with hungry villager ("hrrm" -> 3 emeralds)
    if (wheatCount > 0) {
      const nextV = villagerEntries.find((v) => !v.traded);
      if (nextV) {
        const vp = nextV.actor?.group?.position || VILLAGER_SPOTS[nextV.idx];
        return [
          {
            id: `villager_npc_${nextV.idx}`,
            pos: { x: vp.x, y: 8, z: vp.z },
            kind: 'entity',
            label: '村民换宝石',
            range: 2.3,
          },
        ];
      }
    }

    const nextWheat = wheatBundles.find((wb) => !wb.broken);
    if (nextWheat) {
      return [
        {
          id: nextWheat.id,
          pos: { x: nextWheat.pos.x, y: 8, z: nextWheat.pos.z },
          kind: 'block',
          label: '收金麦束',
          range: 2.2,
        },
      ];
    }

    const remVillager = villagerEntries.find((v) => !v.traded);
    if (remVillager) {
      const vp = remVillager.actor?.group?.position || VILLAGER_SPOTS[remVillager.idx];
      return [
        {
          id: `villager_npc_${remVillager.idx}`,
          pos: { x: vp.x, y: 8, z: vp.z },
          kind: 'entity',
          label: '村民换宝石',
          range: 2.3,
        },
      ];
    }

    // 2. Collect 2 diamonds dropped by 问号先生 across the village square
    if (diamondsCollected < DIAMOND_CAP) {
      const nextDiamond = liveDiamonds.find((d) => !d.collected && !d.expired);
      if (nextDiamond) {
        return [
          {
            id: nextDiamond.id,
            pos: { x: nextDiamond.pos.x, y: 8, z: nextDiamond.pos.z },
            kind: 'entity',
            label: '捡钻石',
            range: 2.2,
          },
        ];
      }
      return [{ id: 'villager_diamond_wait', pos: { ...SQUARE_WAIT_POS }, kind: 'wait', label: '追问号先生', range: 2.4 }];
    }

    // 3. Bank heist: inspect 3-color corner sign, then press the 3 colored buttons in order (+5 emeralds)
    if (!bankCracked) {
      if (!signInspected) {
        return [
          {
            id: 'villager_bank_sign',
            pos: { ...BANK_SIGN_STAND },
            kind: 'block',
            label: '看角落密码',
            range: 2.2,
          },
        ];
      }
      const nextBtn = keypadButtons[bankCode[Math.min(codeStep, 2)]];
      if (nextBtn) {
        return [
          {
            id: `villager_bank_btn_${nextBtn.idx}`,
            pos: { ...BANK_CHEST_FLOOR },
            kind: 'block',
            label: nextBtn.spec.label,
            range: 2.2,
          },
        ];
      }
    }

    return [{ id: 'villager_diamond_wait', pos: { ...SQUARE_WAIT_POS }, kind: 'wait', label: '等问号先生', range: 2.4 }];
  },

  pointer(ctx) {
    if (readyToSlotStall) {
      return { x: STALL_COUNTER.x, y: 9.6, z: STALL_COUNTER.z + 0.4 };
    }
    const t = qVillager.targets(ctx)[0];
    return t ? { x: t.pos.x, y: (t.pos.y ?? 8) + 1.3, z: t.pos.z } : { x: STALL_ARRIVE.x, y: 9.5, z: STALL_ARRIVE.z };
  },

  objective() {
    return { icon: '💎', have: Math.min(riches, TOTAL_RICHES), need: TOTAL_RICHES };
  },

  action() {
    return null;
  },

  cleanup(ctx) {
    active = false;
    completing = false;
    readyToSlotStall = false;
    timers.clear();

    unpickSign?.();
    unpickStall?.();
    unpickSign = null;
    unpickStall = null;
    for (const btn of keypadButtons) {
      btn.unpick?.();
      btn.unpick = null;
    }
    for (const wb of wheatBundles) wb.destroy();
    wheatBundles.length = 0;
    for (const v of villagerEntries) {
      v.unpick?.();
      v.unpick = null;
      if (v.actor) {
        v.actor.setEmote(null);
        v.actor.setVisible(false);
        detachFromScene(v.actor.group);
      }
    }
    for (const d of liveDiamonds) d.destroy();
    liveDiamonds.length = 0;

    if (mysteryActor) {
      mysteryActor.setVisible(false);
      detachFromScene(mysteryActor.group);
    }
    if (villagerContestant) {
      emeraldEyesGroup.visible = false;
      villagerContestant.setEmote(null);
      villagerContestant.setVisible(false);
      detachFromScene(villagerContestant.group);
    }
    if (villageRoot) {
      villageRoot.visible = false;
      detachFromScene(villageRoot);
    }
    ctx?.rival?.leave?.();
  },
};

export default qVillager;
