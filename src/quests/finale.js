// Finale runway sequence per docs/DESIGN.md §3.6, §4, §8.5 (owner: quests-b).
// 小凯 struts the runway wearing pumpkin + snow + honey + cake ("我也要参赛!") and demands to be ranked!

import { ROSTER } from '../data/roster.js';
import { poi, surfaceY, playSfx } from './kit.js';

const lineupPoolByCtx = new WeakMap();
const LINEUP_IDLE_ANIMS = ['wave', 'cheer', 'happy', 'dance', 'pose'];

function ensureFinaleLineup(ctx, centerX = 48.5) {
  if (!ctx?.scene || typeof ctx?.chars?.create !== 'function') return [];
  if (Array.isArray(ctx._lineupActors) && ctx._lineupActors.length > 0) {
    return ctx._lineupActors;
  }

  let pool = lineupPoolByCtx.get(ctx);
  if (!pool) {
    pool = new Map();
    lineupPoolByCtx.set(ctx, pool);
  }

  const mainEntries = ROSTER.filter((r) => !r.hidden).sort((a, b) => a.order - b.order);
  // Two-row festive semicircle arc behind the runway (4 inner flanking + 6 back arc, clear of center aisle)
  const offsets = [
    // Front flanking row (4)
    { dx: -2.85, z: 49.5 },
    { dx: -1.45, z: 48.9 },
    { dx: 1.45, z: 48.9 },
    { dx: 2.85, z: 49.5 },
    // Grand back arc (6)
    { dx: -3.75, z: 48.1 },
    { dx: -2.25, z: 47.5 },
    { dx: -0.82, z: 47.1 },
    { dx: 0.82, z: 47.1 },
    { dx: 2.25, z: 47.5 },
    { dx: 3.75, z: 48.1 },
  ];

  const placed = [];
  for (let i = 0; i < mainEntries.length; i++) {
    const cid = mainEntries[i].id;
    let actor = pool.get(cid) || null;
    if (!actor) {
      actor = ctx.chars.create(cid, { id: `finale_lineup_${cid}` });
      if (actor) pool.set(cid, actor);
    }
    if (!actor?.group) continue;

    const slot = offsets[i] || { dx: (i - 4.5) * 0.9, z: 47.5 };
    const lx = centerX + slot.dx;
    const lz = slot.z;
    const ly = surfaceY(ctx, lx, lz, 8);

    actor.stopMove?.();
    actor.clearAccessories?.();
    const accs = ctx.state?.contestants?.[cid]?.accessories || [];
    for (let s = 0; s < accs.length; s++) {
      if (accs[s]) actor.setAccessory?.(accs[s], s);
    }
    actor.setEmote?.(null);
    actor.setVisible?.(true);
    actor.group.position.set(lx, ly, lz);
    if (actor.group.parent !== ctx.scene) {
      ctx.scene.add(actor.group);
    }
    actor.lookAt?.({ x: centerX + slot.dx * 0.35, y: ly, z: 61.5 });
    actor.setAnim?.(LINEUP_IDLE_ANIMS[i % LINEUP_IDLE_ANIMS.length]);
    placed.push(actor);
  }

  ctx._lineupActors = placed;
  return placed;
}

function reactFinaleLineup(ctx, animName = 'cheer') {
  const list = ctx?._lineupActors;
  if (!Array.isArray(list)) return;
  for (const a of list) {
    a?.setAnim?.(animName);
  }
}

function playKaiRowReaction(ctx, rival, tier, stagePos) {
  const actor = rival?.actor;
  rival?.setSpeechBubbleVisible?.(false);

  switch (tier) {
    case 'perfect': {
      // §4 & §8.3: happy cry on 完美 + fanfare + confetti >= 150 + 3 fireworks + crowd jump
      actor?.setAnim?.('cry');
      actor?.setEmote?.('👑');
      playSfx(ctx, 'fanfare', { pos: stagePos });
      ctx?.fx?.confetti?.('screen', 165);
      for (let i = 0; i < 3; i++) {
        ctx?.fx?.fireworks?.({ x: stagePos.x + (i - 1) * 2.5, y: stagePos.y + 4.5, z: stagePos.z - 2 }, 28);
      }
      ctx?.chars?.crowd?.react?.('jump');
      reactFinaleLineup(ctx, 'cheer');
      break;
    }
    case 'gorgeous': {
      actor?.setAnim?.('pose');
      actor?.setEmote?.('💎');
      playSfx(ctx, 'cheer', { pos: stagePos });
      ctx?.fx?.sparkles?.(stagePos, 24, { toPlayer: false });
      ctx?.fx?.fireworks?.({ x: stagePos.x - 2, y: stagePos.y + 4, z: stagePos.z - 2 }, 24);
      ctx?.fx?.fireworks?.({ x: stagePos.x + 2, y: stagePos.y + 4, z: stagePos.z - 2 }, 24);
      ctx?.chars?.crowd?.react?.('cheer');
      reactFinaleLineup(ctx, 'cheer');
      break;
    }
    case 'pretty': {
      actor?.setAnim?.('dance');
      actor?.setEmote?.('❤');
      playSfx(ctx, 'clap', { pos: stagePos });
      ctx?.fx?.hearts?.(stagePos, 16);
      ctx?.chars?.crowd?.react?.('clap');
      reactFinaleLineup(ctx, 'happy');
      break;
    }
    case 'okay': {
      actor?.setAnim?.('shrug');
      actor?.setEmote?.('😜');
      playSfx(ctx, 'aww', { pos: stagePos });
      ctx?.chars?.crowd?.react?.('aww');
      reactFinaleLineup(ctx, 'wave');
      break;
    }
    case 'tryhard':
    default: {
      // §4 & §8.3: push-ups on 再努力!
      actor?.setAnim?.('pushup');
      actor?.setEmote?.('💪');
      playSfx(ctx, 'cheer', { pos: stagePos });
      ctx?.chars?.crowd?.react?.('cheer');
      reactFinaleLineup(ctx, 'cheer');
      break;
    }
  }
}

export async function startFinale(ctx) {
  if (!ctx) return null;

  // Ensure hub area and finale scene state
  if (ctx.state?.area !== 'hub') {
    if (typeof ctx.areas?.setArea === 'function') ctx.areas.setArea('hub');
    else ctx.world?.setArea?.('hub');
    if (ctx.state) ctx.state.area = 'hub';
    ctx.events?.emit?.('areaChange', { area: 'hub' });
  }
  if (ctx.state) {
    ctx.state.scene = 'finale';
  }
  void ctx.rival?.actor; // Ensure kai exists in chars.actors before finaleStart fires (#161)
  ctx.events?.emit?.('finaleStart', {});
  ctx.events?.emit?.('sceneChange', { scene: 'finale' });
  ctx.audio?.music?.('finale');
  playSfx(ctx, 'drumroll');

  const runwayBase = poi(ctx, 'runway', { x: 48.5, y: 8, z: 54 });
  const startY = surfaceY(ctx, runwayBase.x, 49.8, runwayBase.y ?? 8);
  const endY = surfaceY(ctx, runwayBase.x, 54.2, runwayBase.y ?? 8);
  const walkStart = { x: runwayBase.x, y: startY, z: 49.8 };
  const walkEnd = { x: runwayBase.x, y: endY, z: 54.2 };

  // §8.5 & #155 C2: Spawn all 10 dressed contestants in a two-row arc behind the runway facing the camera!
  ensureFinaleLineup(ctx, runwayBase.x);

  // Ensure portrait entry for 'kai' exists for tier board card rendering
  if (ctx.state?.contestants && !ctx.state.contestants.kai) {
    ctx.state.contestants.kai = {
      met: true,
      hidden: false,
      found: true,
      accessories: ['pumpkinHat', 'chefHat'],
      tier: null,
      portrait: false,
    };
  }
  if (typeof ctx.ui?.renderPortrait === 'function' && ctx.state) {
    try {
      const rendered = ctx.ui.renderPortrait(ctx, 'kai', ['pumpkinHat']);
      if (rendered?.dataURL) {
        if (ctx.state._portraits) ctx.state._portraits.kai = rendered.dataURL;
        if (ctx.state.contestants?.kai) ctx.state.contestants.kai.portrait = true;
      }
    } catch {
      // Safe fallback if offscreen portrait uses its own canvas icon
    }
  }

  const rival = ctx.rival;
  rival?.dressForFinale?.(walkStart);
  rival?.actor?.moveTo?.(walkEnd, 2.5);
  rival?.actor?.setAnim?.('strut');
  ctx.cam?.focus?.(
    { x: walkEnd.x, y: endY + 1.85, z: 52.0 },
    { distance: 8.8, height: 3.1, yaw: 0, instant: true },
  );
  ctx.chars?.crowd?.react?.('gasp');
  playSfx(ctx, 'kai_laugh', { pos: walkStart });

  // Strut down the runway on deterministic sim time (1.95s)
  if (rival?.waitSim) {
    await rival.waitSim(1.95);
  }
  rival?.actor?.lookAt?.({ x: walkEnd.x, y: walkEnd.y, z: walkEnd.z + 10 });
  rival?.actor?.setAnim?.('flex');
  ctx.fx?.sparkles?.({ x: walkEnd.x, y: walkEnd.y + 1.5, z: walkEnd.z }, 14, { toPlayer: false });
  playSfx(ctx, 'shutter', { pos: walkEnd });

  if (rival?.waitSim) {
    await rival.waitSim(0.45);
  }

  // Open tier board to rank 小凯 (§8.5)
  let ranked = null;
  if (typeof ctx.ui?.showBoard === 'function') {
    if (ctx.state) ctx.state.scene = 'board';
    ctx.events?.emit?.('sceneChange', { scene: 'board' });
    ranked = await ctx.ui.showBoard({ newId: 'kai', mode: 'rank' });
  }

  const chosenTier = ranked?.tier || ctx.state?.board?.kai || 'perfect';
  if (ctx.state) {
    ctx.state.scene = 'finale';
    if (ctx.state.board && !ctx.state.board.kai) {
      ctx.state.board.kai = chosenTier;
    }
    if (ctx.state.contestants?.kai) {
      ctx.state.contestants.kai.tier = chosenTier;
    }
  }

  // Play 小凯's per-row comedy reaction on stage
  ctx.cam?.focus?.(
    { x: walkEnd.x, y: walkEnd.y + 1.85, z: 52.0 },
    { distance: 8.8, height: 3.1, yaw: 0 },
  );
  playKaiRowReaction(ctx, rival, chosenTier, walkEnd);

  if (rival?.waitSim) {
    await rival.waitSim(1.6);
  }

  rival?.setSpeechBubbleVisible?.(false);
  ctx.cam?.clearFocus?.();
  if (ctx.state) {
    ctx.state._finaleDone = true;
  }

  return { id: 'kai', tier: chosenTier };
}

export default startFinale;
