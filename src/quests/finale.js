// Finale runway sequence per docs/DESIGN.md §3.6, §4, §8.5 (owner: quests-b).
// 小凯 struts the runway wearing pumpkin + snow + honey + cake ("我也要参赛!") and demands to be ranked!

import { poi, surfaceY, playSfx } from './kit.js';

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
      break;
    }
    case 'pretty': {
      actor?.setAnim?.('dance');
      actor?.setEmote?.('❤');
      playSfx(ctx, 'clap', { pos: stagePos });
      ctx?.fx?.hearts?.(stagePos, 16);
      ctx?.chars?.crowd?.react?.('clap');
      break;
    }
    case 'okay': {
      actor?.setAnim?.('shrug');
      actor?.setEmote?.('😜');
      playSfx(ctx, 'aww', { pos: stagePos });
      ctx?.chars?.crowd?.react?.('aww');
      break;
    }
    case 'tryhard':
    default: {
      // §4 & §8.3: push-ups on 再努力!
      actor?.setAnim?.('pushup');
      actor?.setEmote?.('💪');
      playSfx(ctx, 'cheer', { pos: stagePos });
      ctx?.chars?.crowd?.react?.('cheer');
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
  ctx.events?.emit?.('finaleStart', {});
  ctx.events?.emit?.('sceneChange', { scene: 'finale' });
  ctx.audio?.music?.('finale');
  playSfx(ctx, 'drumroll');

  const runwayBase = poi(ctx, 'runway', { x: 48, y: 8, z: 54 });
  const startY = surfaceY(ctx, runwayBase.x, 49, runwayBase.y ?? 8);
  const endY = surfaceY(ctx, runwayBase.x, 54, runwayBase.y ?? 8);
  const walkStart = { x: runwayBase.x, y: startY, z: 49.0 };
  const walkEnd = { x: runwayBase.x, y: endY, z: 54.0 };

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
  rival?.actor?.moveTo?.(walkEnd, 3.0);
  ctx.cam?.focus?.(
    { x: walkEnd.x, y: endY + 1.2, z: 53.5 },
    { distance: 6.8, height: 2.3, yaw: 0, instant: true },
  );
  ctx.chars?.crowd?.react?.('gasp');
  playSfx(ctx, 'kai_laugh', { pos: walkStart });

  // Strut down the runway on deterministic sim time (1.95s)
  if (rival?.waitSim) {
    await rival.waitSim(1.95);
  }
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
    { x: walkEnd.x, y: walkEnd.y + 1.2, z: 53.5 },
    { distance: 6.8, height: 2.3, yaw: 0 },
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
