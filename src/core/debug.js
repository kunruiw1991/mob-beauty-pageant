// URL debug parameter parser & handlers per brief & docs/DESIGN.md (owner: core).
// Supports: ?seed=<n|str> &quest=<id> &scene=board|booth|final|lineup &area=hub|end|nether

import { ROSTER } from '../data/roster.js';
import { normalizeSeedNumber } from './rng.js';

export function parseDebugParams(search = window.location.search) {
  const params = new URLSearchParams(search || '');
  const hasSeed = params.has('seed');
  const rawSeed = params.get('seed');
  const seed = hasSeed ? normalizeSeedNumber(rawSeed) : null;
  const quest = params.get('quest')?.trim() || null;
  const scene = params.get('scene')?.trim() || null;
  const area = params.get('area')?.trim() || null;
  return {
    hasAny: Boolean(hasSeed || quest || scene || area),
    hasSeed,
    seed,
    quest,
    scene,
    area,
  };
}

export async function applyDebugParams(ctx, parsed = parseDebugParams()) {
  if (!parsed.hasAny) return false;

  const needSkipTitle = Boolean(parsed.quest || parsed.scene || parsed.area);
  if (needSkipTitle && ctx.state.scene === 'title') {
    ctx.startGame({ seed: parsed.seed ?? ctx.state.seed, skipIntro: true });
  }

  if (parsed.area && ['hub', 'end', 'nether'].includes(parsed.area)) {
    ctx.areas.setArea(parsed.area);
  }

  if (parsed.quest) {
    ctx.teleport(parsed.quest);
  }

  if (parsed.scene === 'booth') {
    const id = parsed.quest || 'sheep';
    ctx.enterBooth(id);
  } else if (parsed.scene === 'board') {
    const id = parsed.quest || null;
    ctx.enterBoard({ newId: id, mode: id ? 'rank' : 'view' });
  } else if (parsed.scene === 'final') {
    for (const entry of ROSTER) {
      if (!entry.hidden && !ctx.state.board[entry.id]) {
        ctx.rankContestant(entry.id, 'perfect', { silent: true });
      }
    }
    ctx.state.scene = 'final';
    ctx.ui?.hideTitle?.();
    ctx.ui?.showHUD?.(false);
    ctx.ui?.showFinal?.();
  } else if (parsed.scene === 'lineup') {
    spawnLineupScene(ctx);
  }

  return true;
}

export function spawnLineupScene(ctx) {
  ctx.ui?.cancelOverlays?.();
  ctx.ui?.hideTitle?.();
  ctx.ui?.showHUD?.(false);
  ctx.state.scene = 'world';
  ctx.areas.setArea('hub', { x: 48, y: 8, z: 60 }, { silent: true });
  if (ctx.player?.group) ctx.player.group.visible = false;

  const startZ = 44.6;
  const ids = [
    ...ROSTER.map((r) => r.id),
    'player',
    'kai',
    'bela',
    'mystery',
  ];
  const cols = 8;
  const spacingX = 1.45;
  const spacingZ = 2.6;

  if (!ctx._lineupActors) ctx._lineupActors = [];
  for (const a of ctx._lineupActors) {
    if (a?.group?.parent) a.group.parent.remove(a.group);
  }
  ctx._lineupActors.length = 0;

  ids.forEach((kind, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const x = 48 + (col - (cols - 1) / 2) * spacingX;
    const z = startZ + row * spacingZ;
    const y = ctx.world?.surfaceY?.(Math.round(x), Math.round(z)) ?? 8;
    const actor = ctx.chars?.create?.(kind, { id: `lineup_${kind}` });
    if (actor?.group) {
      actor.group.position.set(x, y, z);
      actor.lookAt?.({ x, y, z: z + 10 });
      actor.setAnim?.(idx % 2 === 0 ? 'wave' : 'pose');
      ctx.scene.add(actor.group);
      ctx._lineupActors.push(actor);
    }
  });

  ctx.cam?.focus?.({ x: 48, y: 9.0, z: startZ + 1.4 }, { distance: 10.2, height: 3.3, yaw: 0, instant: true });
}
