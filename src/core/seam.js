// Frozen window.__PAGEANT__ test & agent seam per docs/DESIGN.md §3.9, §3.10 (owner: core).
import { snapshotState } from './state.js';

function deepClone(val) {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(deepClone);
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    out[k] = deepClone(v);
  }
  return out;
}

export function createSeam(ctx) {
  const seam = {
    startGame(opts = {}) {
      ctx.startGame(opts || {});
      return snapshotState(ctx.state);
    },

    teleport(questId) {
      return Boolean(ctx.teleport(questId));
    },

    completeQuest(id) {
      return Boolean(ctx.completeQuest(id));
    },

    rank(contestantId, tier) {
      return Boolean(ctx.rankContestant(contestantId, tier, { closeBoard: true }));
    },

    stepFrames(n = 1) {
      return ctx.loop.stepFrames(n);
    },

    getState() {
      return snapshotState(ctx.state);
    },

    listTargets() {
      ctx.ensureWorldBuilt?.();
      const raw = ctx.quests?.targets ? ctx.quests.targets() : [];
      const enriched = raw.map((t) => {
        const scr = ctx.pick.worldToScreen(t.pos || { x: 48, y: 8, z: 48 });
        return {
          id: String(t.id),
          kind: String(t.kind || 'entity'),
          label: String(t.label || t.id),
          pos: {
            x: Math.round((t.pos?.x ?? 0) * 100) / 100,
            y: Math.round((t.pos?.y ?? 8) * 100) / 100,
            z: Math.round((t.pos?.z ?? 0) * 100) / 100,
          },
          sx: scr.sx,
          sy: scr.sy,
          onScreen: Boolean(scr.onScreen),
          visible: Boolean(scr.onScreen),
          angle: scr.angle ?? 0,
        };
      });
      return deepClone(enriched);
    },

    tapTarget(id) {
      ctx.ensureWorldBuilt?.();
      const list = ctx.quests?.targets ? ctx.quests.targets() : [];
      const chosen = (id && list.find((t) => t.id === id)) || (!id ? list[0] : null);
      if (!chosen) {
        // Still route through tap dispatcher so feedback invariant holds
        ctx.dispatchHitTap(
          { type: 'sky', kind: 'sky', pos: { x: ctx.player.pos.x, y: ctx.player.pos.y, z: ctx.player.pos.z } },
          0,
          0
        );
        return false;
      }
      const scr = ctx.pick.worldToScreen(chosen.pos);
      const hit = {
        type: 'entity',
        kind: chosen.kind || 'entity',
        id: chosen.id,
        targetId: chosen.id,
        pos: { ...chosen.pos },
        target: chosen,
        fromAgent: true,
      };
      return Boolean(ctx.dispatchHitTap(hit, scr.sx, scr.sy));
    },

    tapScreen(x, y) {
      ctx.ensureWorldBuilt?.();
      return Boolean(ctx.handleCanvasTap(Number(x) || 0, Number(y) || 0));
    },

    pressAction() {
      if (ctx.ui?.pressAction && ctx.ui.pressAction()) {
        return true;
      }
      return Boolean(ctx.quests?.onAction?.());
    },

    boothChoose(accessoryId) {
      return Boolean(ctx.boothChoose(accessoryId));
    },

    boothSnap() {
      return Boolean(ctx.boothSnap());
    },

    boardDrop(contestantId, tier) {
      return Boolean(ctx.boardDrop(contestantId, tier));
    },

    continue() {
      return Boolean(ctx.continueFlow());
    },

    perf() {
      return deepClone(ctx.loop.perf());
    },

    setMuted(b) {
      ctx.audio?.setMuted?.(b);
      return true;
    },
  };

  Object.freeze(seam);
  window.__PAGEANT__ = seam;
  return seam;
}

export default createSeam;
