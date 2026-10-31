// Quest 7: bee — 嗡嗡 (Simon-says 6-flower musical meadow ring 3/4/5 + 小凯 stuck on honey, docs/DESIGN.md §6.7).
// Zero-build ES2022, deterministic sim time/rng only.

import * as THREE from '../../vendor/three.module.min.js';
import {
  poi,
  surfaceY,
  playerPos,
  rngInt,
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

const ROUND_LENGTHS = [3, 4, 5];
const RING_RADIUS = 4.4;
const FLOWER_PALETTE = [
  { color: 0xe63946, sfx: 'note0', label: '红花' },
  { color: 0xf77f00, sfx: 'note1', label: '橙花' },
  { color: 0xffd43b, sfx: 'note2', label: '黄花' },
  { color: 0x3fae3a, sfx: 'note3', label: '绿花' },
  { color: 0x3b82f6, sfx: 'note4', label: '蓝花' },
  { color: 0xb5179e, sfx: 'note5', label: '紫花' },
];

// Pooled 3D flower ring + sticky honey trap (reused across restarts — 0 memory growth)
let ringRoot = null;
const flowerPads = [];
let honeyTrapMesh = null;

function ensureBeeVisuals() {
  if (ringRoot) return;
  ringRoot = new THREE.Group();
  ringRoot.name = 'qBeeRing';

  const stemMat = sharedLambertMat(0x2d6a4f);
  const centerMat = sharedBasicMat(0xfff3b0);

  for (let i = 0; i < 6; i++) {
    const spec = FLOWER_PALETTE[i];
    const pad = new THREE.Group();

    const leafBase = new THREE.Mesh(sharedCylinderGeo(0.76, 0.82, 0.14, 8), stemMat);
    leafBase.position.y = 0.07;
    pad.add(leafBase);

    const petalMat = sharedLambertMat(spec.color);
    const offsets = [
      [0, 0],
      [0.26, 0.2],
      [-0.26, 0.18],
      [0.05, -0.26],
    ];
    for (const [ox, oz] of offsets) {
      const stem = new THREE.Mesh(sharedBoxGeo(0.1, 0.36, 0.1), stemMat);
      stem.position.set(ox, 0.25, oz);
      const head = new THREE.Mesh(sharedBoxGeo(0.36, 0.22, 0.36), petalMat);
      head.position.set(ox, 0.46, oz);
      const pist = new THREE.Mesh(sharedBoxGeo(0.15, 0.28, 0.15), centerMat);
      pist.position.set(ox, 0.48, oz);
      pad.add(stem, head, pist);
    }

    const glowRing = new THREE.Mesh(
      sharedCylinderGeo(0.96, 0.96, 0.09, 12),
      sharedBasicMat(spec.color, { opacity: 0.82, transparent: true })
    );
    glowRing.position.y = 0.09;
    glowRing.visible = false;
    pad.add(glowRing);

    const mercyPillar = new THREE.Mesh(
      sharedCylinderGeo(0.24, 0.34, 2.3, 8),
      sharedBasicMat(0xffe066, { opacity: 0.45, transparent: true })
    );
    mercyPillar.position.y = 1.15;
    mercyPillar.visible = false;
    pad.add(mercyPillar);

    ringRoot.add(pad);
    flowerPads.push({
      index: i,
      spec,
      group: pad,
      glowRing,
      mercyPillar,
      worldPos: { x: 42.5, y: 8, z: 74.5 },
      pulseTimer: 0,
      unpick: null,
    });
  }

  // Honey trap patch beside the beehive where 小凯 gets stuck (§6.7)
  honeyTrapMesh = new THREE.Mesh(
    sharedBoxGeo(1.65, 0.22, 1.65),
    sharedLambertMat(0xf5a623, { opacity: 0.9, transparent: true })
  );
  ringRoot.add(honeyTrapMesh);
}

let active = false;
let completing = false;
let roundIdx = 0;
let sequence = [];
let inputStep = 0;
let missesInRound = 0;
let mode = 'demo'; // 'demo' | 'input' | 'celebrate'
let demoCursor = 0;
let demoPhase = 'fly'; // 'fly' | 'chime' | 'return'
let demoStepTimer = 0;
let gagFired = false;

let ringCenter = { x: 42.5, y: 8, z: 74.5 };
let honeyWorldPos = { x: 45.0, y: 8, z: 79.0 };

let beeContestant = null;
let helperBee = null;
const timers = createTimers();

function findSafeFlowerRingCenter(ctx, hivePos) {
  // Open walkable meadow circle centered at (42.5, 8, 74.5), clear of (40,80) oak & (44..46,78..80) honey
  const gy = surfaceY(ctx, 42.5, 74.5, hivePos.y ?? 8);
  return { x: 42.5, y: gy, z: 74.5 };
}

function generateSequence(ctx, len) {
  const out = [];
  let prev = -1;
  for (let i = 0; i < len; i++) {
    let pick = rngInt(ctx, 0, 5);
    if (pick === prev) pick = (pick + rngInt(ctx, 1, 5)) % 6;
    out.push(pick);
    prev = pick;
  }
  return out;
}

function highlightFlower(ctx, idx, duration = 0.52) {
  const f = flowerPads[idx];
  if (!f) return;
  f.pulseTimer = duration;
  f.glowRing.visible = true;
  playSfx(ctx, f.spec.sfx, { pos: f.worldPos });
  ctx?.fx?.sparkles?.({ x: f.worldPos.x, y: f.worldPos.y + 0.55, z: f.worldPos.z }, 6, { toPlayer: false });
}

function startDemo(ctx, keepSequence = false) {
  const len = ROUND_LENGTHS[Math.min(roundIdx, ROUND_LENGTHS.length - 1)];
  if (!keepSequence || sequence.length !== len) {
    sequence = generateSequence(ctx, len);
  }
  inputStep = 0;
  mode = 'demo';
  demoCursor = 0;
  demoPhase = 'fly';
  demoStepTimer = 0.25;
  for (const f of flowerPads) f.mercyPillar.visible = false;
  beeContestant?.setEmote?.('🎵');
  beeContestant?.setAnim?.('hop');
}

function triggerKaiHoneyGag(ctx) {
  if (gagFired) return;
  gagFired = true;
  ctx?.rival?.stick?.(honeyWorldPos, 'bee');
  emitGag(ctx, 'bee', 'kai_honey', honeyWorldPos);
  playSfx(ctx, 'buzz', { pos: honeyWorldPos });
  if (helperBee) {
    helperBee.group.position.set(honeyWorldPos.x, honeyWorldPos.y + 2.1, honeyWorldPos.z + 0.35);
    helperBee.setAnim('hop');
  }
}

const qBee = {
  id: 'bee',
  contestantId: 'bee',
  area: 'hub',
  poi: 'hive',
  order: 7,

  start(ctx) {
    ensureBeeVisuals();
    timers.clear();
    active = true;
    completing = false;
    roundIdx = 0;
    sequence = [];
    inputStep = 0;
    missesInRound = 0;
    gagFired = false;

    const hivePos = poi(ctx, 'hive', { x: 40.5, y: 8, z: 75.5 });
    ringCenter = findSafeFlowerRingCenter(ctx, hivePos);

    ringRoot.position.set(0, 0, 0);
    ringRoot.visible = true;
    attachToScene(ctx, ringRoot);

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6 - Math.PI * 0.5;
      const fx = Math.round((ringCenter.x + Math.cos(angle) * RING_RADIUS) * 100) / 100;
      const fz = Math.round((ringCenter.z + Math.sin(angle) * RING_RADIUS) * 100) / 100;
      const fy = surfaceY(ctx, fx, fz, ringCenter.y);
      const f = flowerPads[i];
      f.worldPos = { x: fx, y: fy, z: fz };
      f.group.position.set(fx, fy, fz);
      f.group.scale.set(1, 1, 1);
      f.glowRing.visible = false;
      f.mercyPillar.visible = false;
      f.pulseTimer = 0;
      f.unpick?.();
      f.unpick = registerPick(ctx, f.group, {
        id: `bee_flower_${i}`,
        targetId: `bee_flower_${i}`,
        kind: 'block',
        label: f.spec.label,
        hitRadius: 1.15,
      });
    }

    // Align sticky honey trap directly onto layout.js B.HONEY_BLOCK patch (44..46, 78..80)
    const hx = 45.0;
    const hz = 79.0;
    const hy = surfaceY(ctx, hx, hz, ringCenter.y);
    honeyWorldPos = { x: hx, y: hy, z: hz };
    honeyTrapMesh.position.set(hx, hy + 0.06, hz);

    // Contestant 嗡嗡 + buzzing helper bee
    if (!beeContestant && ctx?.chars?.create) {
      beeContestant = ctx.chars.create('bee', { id: 'quest_bee_actor' });
    }
    if (beeContestant) {
      beeContestant.group.position.set(ringCenter.x, ringCenter.y + 0.42, ringCenter.z);
      beeContestant.lookAt(playerPos(ctx));
      beeContestant.setAnim('wave');
      beeContestant.setEmote('🎵');
      beeContestant.setVisible(true);
      attachToScene(ctx, beeContestant.group);
    }

    if (!helperBee && ctx?.chars?.create) {
      helperBee = ctx.chars.create('beeMob', { id: 'quest_bee_helper' });
    }
    if (helperBee) {
      helperBee.group.position.set(hivePos.x + 1.0, hy + 1.6, hivePos.z - 0.5);
      helperBee.setAnim('hop');
      helperBee.setVisible(true);
      attachToScene(ctx, helperBee.group);
    }

    // 小凯 sneaks toward the beehive for honey (§6.7)
    const sneakStart = { x: hx + 1.5, y: surfaceY(ctx, hx + 1.5, hz - 1.2, hy), z: hz - 1.2 };
    ctx?.rival?.appear?.(sneakStart, 'cameo', 'bee');
    ctx?.rival?.actor?.lookAt?.(honeyWorldPos);
    ctx?.rival?.actor?.setAnim?.('sneak');
    ctx?.rival?.actor?.setEmote?.('😜');

    startDemo(ctx, false);
  },

  update(dt, ctx) {
    if (!active) return;
    timers.update(dt);

    // Update flower pulses & mercy glow
    const expectedIdx = mode === 'input' ? sequence[inputStep] : -1;
    for (const f of flowerPads) {
      if (f.pulseTimer > 0) {
        f.pulseTimer = Math.max(0, f.pulseTimer - dt);
        const s = 1 + Math.sin((f.pulseTimer / 0.52) * Math.PI) * 0.36;
        f.group.scale.set(s, s, s);
        f.glowRing.visible = true;
        if (f.pulseTimer === 0) {
          f.group.scale.set(1, 1, 1);
          f.glowRing.visible = false;
        }
      }
      // Mercy rule (§6.7): after 3 misses, the next flower glows clearly
      const showMercy = mode === 'input' && missesInRound >= 3 && f.index === expectedIdx;
      f.mercyPillar.visible = showMercy;
      if (showMercy) {
        f.glowRing.visible = true;
      }
    }

    // Hover & fly 嗡嗡 smoothly during demo/input
    if (beeContestant) {
      beeContestant.update(dt);
      const t = ctx?.time ?? 0;
      beeContestant.group.position.y = ringCenter.y + 0.42 + Math.sin(t * 5.2) * 0.14;
    }
    if (helperBee) {
      helperBee.update(dt);
      const t = ctx?.time ?? 0;
      if (gagFired) {
        // Orbit around stuck 小凯's nose
        helperBee.group.position.set(
          honeyWorldPos.x + Math.cos(t * 4.5) * 0.75,
          honeyWorldPos.y + 1.95 + Math.sin(t * 7.0) * 0.12,
          honeyWorldPos.z + Math.sin(t * 4.5) * 0.75
        );
        helperBee.lookAt(honeyWorldPos);
      }
    }

    // Physical flower-to-flower flight demo so kids watch 嗡嗡 visit each flower before repeating
    if (mode === 'demo' && !completing) {
      demoStepTimer -= dt;
      if (demoStepTimer <= 0) {
        if (demoPhase === 'fly') {
          if (demoCursor < sequence.length) {
            const fIdx = sequence[demoCursor];
            const f = flowerPads[fIdx];
            if (f && beeContestant) {
              beeContestant.moveTo(
                { x: f.worldPos.x, y: f.worldPos.y + 0.45, z: f.worldPos.z },
                9.2
              );
            }
            demoPhase = 'chime';
            demoStepTimer = 0.52;
          } else {
            beeContestant?.moveTo?.({ x: ringCenter.x, y: ringCenter.y + 0.42, z: ringCenter.z }, 9.0);
            demoPhase = 'return';
            demoStepTimer = 0.45;
          }
        } else if (demoPhase === 'chime') {
          const fIdx = sequence[demoCursor];
          highlightFlower(ctx, fIdx, 0.52);
          demoCursor += 1;
          demoPhase = 'fly';
          demoStepTimer = 0.36;
        } else {
          beeContestant?.setEmote?.(null);
          mode = 'input';
        }
      }
    }
  },

  onTap(hit, ctx) {
    if (!active || completing) return true;
    const tid = hit?.targetId || hit?.id || '';

    if (tid === 'bee_demo_wait' || tid === 'bee_done_wait') {
      playSfx(ctx, 'buzz', { pos: ringCenter });
      return true;
    }

    // Match flower tap by id or 3D proximity to any of the 6 flowers (so human taps on wrong flowers work!)
    let tappedIdx = -1;
    if (tid.startsWith('bee_flower_')) {
      tappedIdx = Number.parseInt(tid.slice('bee_flower_'.length), 10);
    } else if (hit?.pos) {
      let best = 1.45;
      for (const f of flowerPads) {
        const d = Math.hypot((hit.pos.x ?? 0) - f.worldPos.x, (hit.pos.z ?? 0) - f.worldPos.z);
        if (d < best) {
          best = d;
          tappedIdx = f.index;
        }
      }
    }

    if (tappedIdx < 0 || tappedIdx >= 6) return false;

    // During demo, tapping a flower chimes softly without breaking demo
    if (mode !== 'input') {
      highlightFlower(ctx, tappedIdx, 0.25);
      return true;
    }

    const expected = sequence[inputStep];
    if (tappedIdx === expected) {
      highlightFlower(ctx, tappedIdx, 0.48);
      inputStep += 1;

      if (inputStep >= sequence.length) {
        roundIdx += 1;
        missesInRound = 0;
        ctx?.events?.emit?.('questStep', { id: 'bee', step: roundIdx });
        beeContestant?.setAnim?.('cheer');
        beeContestant?.setEmote?.('❤');
        playSfx(ctx, 'xp', { pos: ringCenter, pitch: 1.0 + roundIdx * 0.15 });

        // Fire 小凯 sticky honey gag right after Round 1!
        if (roundIdx === 1) {
          triggerKaiHoneyGag(ctx);
        }

        if (roundIdx >= ROUND_LENGTHS.length) {
          triggerKaiHoneyGag(ctx);
          completing = true;
          mode = 'celebrate';
          ctx?.fx?.hearts?.({ x: ringCenter.x, y: ringCenter.y + 1.6, z: ringCenter.z }, 14);
          timers.after(1.1, () => {
            if (active) ctx?.quests?.complete?.('bee');
          });
        } else {
          sequence = generateSequence(ctx, ROUND_LENGTHS[roundIdx]);
          startDemo(ctx, true);
          demoStepTimer = 0.55;
        }
      }
      return true;
    }

    // Wrong flower tapped -> head shake + replay (§6.7; mercy after 3 misses!)
    missesInRound += 1;
    const wrongPos = flowerPads[tappedIdx].worldPos;
    ctx?.fx?.wobble?.(wrongPos);
    playSfx(ctx, 'blocked', { pos: wrongPos });
    beeContestant?.setAnim?.('shrug');
    beeContestant?.setEmote?.('❓');
    startDemo(ctx, true);
    return true;
  },

  onAction() {},

  targets() {
    if (completing) {
      return [
        {
          id: 'bee_done_wait',
          pos: { x: ringCenter.x, y: ringCenter.y, z: ringCenter.z },
          kind: 'wait',
          label: '嗡嗡',
          range: 2.3,
        },
      ];
    }

    if (mode === 'input' && sequence.length > 0) {
      const nextIdx = sequence[Math.min(inputStep, sequence.length - 1)];
      const f = flowerPads[nextIdx];
      if (f) {
        return [
          {
            id: `bee_flower_${nextIdx}`,
            pos: { x: f.worldPos.x, y: f.worldPos.y, z: f.worldPos.z },
            kind: 'block',
            label: f.spec.label,
            range: 2.3,
          },
        ];
      }
    }

    // During demo flight, stand near ring center watching 嗡嗡 visit each flower
    return [
      {
        id: 'bee_demo_wait',
        pos: { x: ringCenter.x, y: ringCenter.y, z: ringCenter.z },
        kind: 'wait',
        label: '看嗡嗡飞',
        range: 2.4,
      },
    ];
  },

  pointer() {
    if (mode === 'input' && sequence.length > 0) {
      const nextIdx = sequence[Math.min(inputStep, sequence.length - 1)];
      const f = flowerPads[nextIdx];
      if (f) return { x: f.worldPos.x, y: f.worldPos.y + 1.2, z: f.worldPos.z };
    }
    return { x: ringCenter.x, y: ringCenter.y + 1.6, z: ringCenter.z };
  },

  objective() {
    const icons = ['🌸', '🌼', '🌺'];
    const r = Math.min(roundIdx, ROUND_LENGTHS.length - 1);
    const need = ROUND_LENGTHS[r];
    const have = roundIdx >= ROUND_LENGTHS.length ? need : Math.min(inputStep, need);
    return { icon: icons[r] || '🌸', have, need };
  },

  introPos() {
    return { x: ringCenter.x, y: (ringCenter.y ?? 8) + 1.0, z: ringCenter.z };
  },

  action() {
    return null;
  },

  cleanup(ctx) {
    active = false;
    completing = false;
    timers.clear();
    for (const f of flowerPads) {
      f.unpick?.();
      f.unpick = null;
      f.glowRing.visible = false;
      f.mercyPillar.visible = false;
    }
    if (ringRoot) {
      ringRoot.visible = false;
      detachFromScene(ringRoot);
    }
    if (beeContestant) {
      beeContestant.setEmote(null);
      beeContestant.setVisible(false);
      detachFromScene(beeContestant.group);
    }
    if (helperBee) {
      helperBee.setVisible(false);
      detachFromScene(helperBee.group);
    }
    ctx?.rival?.leave?.();
  },
};

export default qBee;
