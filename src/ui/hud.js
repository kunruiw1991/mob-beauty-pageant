// In-play HUD + master createUI(ctx) aggregator per docs/DESIGN.md §3.7, §8.7 (owner: pageant-ui).
// HUD in play (<= 3 interactive controls, 0 overlaps across 1280x800, 1024x768, 844x390, 390x844):
// - Top-left board chip `3/10` (opens board `view`)
// - Top-centre non-interactive objective strip (`{icon, have, need}`)
// - Top-right `⏸` pause button
// - Bottom-right context action button ONLY when `action != null`

import { ROSTER } from '../data/roster.js';
import { bindTap, clampCjk, getVoxelTextures } from './ui_kit.js';
import { progress } from './progress.js';
import { renderPortrait } from './portrait.js';
import { createTitleUI } from './title.js';
import { createBoothUI } from './booth.js';
import { createBoardUI } from './board.js';
import { createNextUI } from './next.js';
import { createShareUI } from './share.js';
import { createMenusUI } from './menus.js';

export function createHudUI(ctx = {}, hooks = {}) {
  let hudRoot = document.getElementById('hud');
  if (!hudRoot) {
    hudRoot = document.createElement('div');
    hudRoot.id = 'hud';
    document.body.appendChild(hudRoot);
  }
  hudRoot.innerHTML = '';
  hudRoot.className = 'hud-layer ui-hidden';
  hudRoot.hidden = true;

  const tex = getVoxelTextures();

  // 1. Top-left board chip (`3/10`)
  const boardBtn = document.createElement('button');
  boardBtn.type = 'button';
  boardBtn.id = 'hud-board-btn';
  boardBtn.className = 'mc-btn hud-board-chip';
  boardBtn.setAttribute('aria-label', '排行榜');
  boardBtn.innerHTML = `
    <span class="hud-mini-wall" aria-hidden="true">
      <i style="background:#c43bd8"></i>
      <i style="background:#3b5bdb"></i>
      <i style="background:#f2c318"></i>
      <i style="background:#d9342b"></i>
      <i style="background:#3fae3a"></i>
    </span>
    <span id="hud-board-count" class="hud-board-count">0/10</span>
  `;
  const countSpan = boardBtn.querySelector('#hud-board-count');

  // 2. Top-centre NON-INTERACTIVE objective strip (<= 12 CJK chars, icons over words)
  const objStrip = document.createElement('div');
  objStrip.id = 'hud-objective';
  objStrip.className = 'hud-objective-strip ui-hidden';
  objStrip.hidden = true;
  objStrip.style.backgroundImage = tex.oakPlank;
  const objIcon = document.createElement('span');
  objIcon.className = 'hud-obj-icon';
  const objCount = document.createElement('span');
  objCount.className = 'hud-obj-count';
  objStrip.append(objIcon, objCount);

  // 3. Top-right pause button (`⏸`)
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.id = 'hud-pause-btn';
  pauseBtn.className = 'mc-btn hud-pause-btn';
  pauseBtn.setAttribute('aria-label', '暂停');
  pauseBtn.innerHTML = `<span class="hud-pause-glyph">⏸</span>`;

  // 4. Bottom-right context action button (visible ONLY when action != null)
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.id = 'hud-action-btn';
  actionBtn.className = 'mc-btn mc-btn-gold hud-action-btn ui-hidden';
  actionBtn.hidden = true;
  const actionIcon = document.createElement('span');
  actionIcon.className = 'hud-action-icon';
  const actionBadge = document.createElement('span');
  actionBadge.className = 'hud-action-badge ui-hidden';
  actionBadge.hidden = true;
  actionBtn.append(actionIcon, actionBadge);

  hudRoot.append(boardBtn, objStrip, pauseBtn, actionBtn);

  let currentAction = null;
  let currentActionHandler = null;
  let hudWanted = false;

  bindTap(boardBtn, () => {
    hooks.onOpenBoardView?.();
  }, { ctx, sfx: 'tap' });

  bindTap(pauseBtn, () => {
    hooks.onPausePress?.();
  }, { ctx, sfx: 'tap' });

  bindTap(actionBtn, () => {
    pressAction();
  }, { ctx, sfx: 'pop' });

  function update(state) {
    const st = state || ctx.state;
    if (!st) return;

    const board = st.board || {};
    let mainRanked = 0;
    let hiddenRanked = 0;
    for (const entry of ROSTER) {
      if (board[entry.id]) {
        if (entry.hidden) hiddenRanked += 1;
        else mainRanked += 1;
      }
    }
    countSpan.textContent = hiddenRanked > 0 ? `${mainRanked}/10★${hiddenRanked}` : `${mainRanked}/10`;
  }

  function setObjective(obj) {
    if (!obj || (!obj.icon && obj.have === undefined && !obj.label)) {
      objStrip.hidden = true;
      objStrip.classList.add('ui-hidden');
      return;
    }
    objIcon.textContent = obj.icon || '✨';
    if (typeof obj.have === 'number' && typeof obj.need === 'number' && obj.need > 0) {
      objCount.textContent = `${obj.have}/${obj.need}`;
      objCount.hidden = false;
    } else if (obj.label) {
      objCount.textContent = clampCjk(obj.label, 8);
      objCount.hidden = false;
    } else {
      objCount.textContent = '';
      objCount.hidden = true;
    }
    objStrip.hidden = false;
    objStrip.classList.remove('ui-hidden');
  }

  function setAction(act, onPress) {
    if (!act || !act.icon) {
      currentAction = null;
      currentActionHandler = null;
      actionBtn.hidden = true;
      actionBtn.classList.add('ui-hidden');
      return;
    }
    currentAction = act;
    currentActionHandler = typeof onPress === 'function' ? onPress : () => ctx.quests?.onAction?.() ?? ctx.quests?.pressAction?.();
    actionIcon.textContent = act.icon;
    if (typeof act.count === 'number') {
      actionBadge.textContent = `×${act.count}`;
      actionBadge.hidden = false;
      actionBadge.classList.remove('ui-hidden');
    } else {
      actionBadge.hidden = true;
      actionBadge.classList.add('ui-hidden');
    }
    actionBtn._resetTapDebounce?.();
    actionBtn.hidden = false;
    actionBtn.classList.remove('ui-hidden');
  }

  function pressAction() {
    if (!currentAction || actionBtn.hidden) return false;
    if (typeof currentActionHandler === 'function') {
      currentActionHandler();
      return true;
    }
    if (typeof ctx.quests?.pressAction === 'function') {
      return Boolean(ctx.quests.pressAction());
    }
    if (typeof ctx.quests?.onAction === 'function') {
      ctx.quests.onAction();
      return true;
    }
    return false;
  }

  function applyVisibility(visible) {
    hudRoot.hidden = !visible;
    hudRoot.classList.toggle('ui-hidden', !visible);
    if (visible) {
      boardBtn._resetTapDebounce?.();
      pauseBtn._resetTapDebounce?.();
      actionBtn._resetTapDebounce?.();
      update(ctx.state);
    }
  }

  function show(b) {
    hudWanted = Boolean(b);
    applyVisibility(hudWanted && !hooks.isModalOpen?.());
  }

  function syncModalMask(modalOpen) {
    applyVisibility(hudWanted && !modalOpen);
  }

  return {
    el: hudRoot,
    show,
    syncModalMask,
    update,
    setObjective,
    setAction,
    pressAction,
  };
}

export function createUI(ctx = {}) {
  let uiMount = document.getElementById('ui');
  if (!uiMount) {
    uiMount = document.createElement('div');
    uiMount.id = 'ui';
    document.body.appendChild(uiMount);
  }

  let hudUI = null;
  let titleUI = null;
  let boothUI = null;
  let boardUI = null;
  let nextUI = null;
  let shareUI = null;
  let menusUI = null;

  const isAnyOverlayActive = () =>
    Boolean(
      titleUI?.isVisible?.() ||
      boothUI?.isActive?.() ||
      boardUI?.isActive?.() ||
      shareUI?.isVisible?.() ||
      menusUI?.isPaused?.()
    );

  const refreshHudMask = () => {
    hudUI?.syncModalMask?.(isAnyOverlayActive());
  };

  const restoreStateFromSavedProgress = () => {
    const saved = progress.load();
    if (!saved || !ctx.state) return saved;
    if (saved.board && typeof saved.board === 'object') {
      Object.assign(ctx.state.board, saved.board);
    }
    if (saved.portraits && ctx.state._portraits) {
      Object.assign(ctx.state._portraits, saved.portraits);
    }
    if (saved.quests && ctx.state.quests) {
      for (const [qid, qval] of Object.entries(saved.quests)) {
        if (ctx.state.quests[qid] && qval && typeof qval === 'object') {
          Object.assign(ctx.state.quests[qid], qval);
        }
      }
    }
    if (saved.contestants && ctx.state.contestants) {
      for (const [cid, cval] of Object.entries(saved.contestants)) {
        if (ctx.state.contestants[cid] && cval && typeof cval === 'object') {
          Object.assign(ctx.state.contestants[cid], cval);
        }
      }
    }
    if (typeof saved.stars === 'number') ctx.state.stars = saved.stars;
    if (typeof saved.elapsedMs === 'number') ctx.state.elapsedMs = saved.elapsedMs;
    boardUI?.restoreWallFromProgress?.();
    return saved;
  };

  titleUI = createTitleUI(ctx, {
    onPlay: () => {
      titleUI.hide();
      hudUI.show(true);
      if (typeof ctx.startGame === 'function') {
        ctx.startGame({ resume: false });
      } else if (typeof ctx.onStartGame === 'function') {
        ctx.onStartGame({ resume: false });
      } else if (ctx.state) {
        ctx.state.scene = 'world';
        ctx.events?.emit?.('sceneChange', { scene: 'world' });
      }
      refreshHudMask();
    },
    onContinue: () => {
      restoreStateFromSavedProgress();
      titleUI.hide();
      hudUI.show(true);
      if (typeof ctx.startGame === 'function') {
        ctx.startGame({ resume: true });
      } else if (typeof ctx.onStartGame === 'function') {
        ctx.onStartGame({ resume: true });
      } else if (ctx.state) {
        ctx.state.scene = 'world';
        ctx.events?.emit?.('sceneChange', { scene: 'world', resume: true });
      }
      refreshHudMask();
    },
    onOpenBoard: async () => {
      titleUI.hide();
      await boardUI.show({ mode: 'view' });
      if (!ctx.state || ctx.state.scene === 'board' || ctx.state.scene === 'title') {
        titleUI.show();
      }
      refreshHudMask();
    },
  });

  boothUI = createBoothUI(ctx, {
    mountRoot: uiMount,
    onOpen: refreshHudMask,
  });

  boardUI = createBoardUI(ctx, {
    mountRoot: uiMount,
    onOpen: refreshHudMask,
    onClose: () => {
      if (ctx.state && ctx.state.scene === 'board') {
        ctx.state.scene = 'world';
      }
      refreshHudMask();
    },
  });

  nextUI = createNextUI(ctx, { mountRoot: uiMount });

  shareUI = createShareUI(ctx, {
    mountRoot: uiMount,
    onOpen: refreshHudMask,
    onClose: refreshHudMask,
    onReplay: () => {
      const newSeed = ((ctx.state?.seed || 1) * 1664525 + 1013904223) >>> 0;
      if (typeof ctx.startGame === 'function') {
        ctx.startGame({ seed: newSeed, resume: false, replay: true, keepBoardHistory: true });
      } else if (typeof ctx.restartGame === 'function') {
        ctx.restartGame({ seed: newSeed, keepBoardHistory: true });
      }
      hudUI.show(true);
      refreshHudMask();
    },
    onContinueHunt: () => {
      if (ctx.state) ctx.state.scene = 'world';
      ctx.continueHunt?.();
      hudUI.show(true);
      refreshHudMask();
    },
  });

  menusUI = createMenusUI(ctx, {
    mountRoot: uiMount,
    onPauseChange: () => refreshHudMask(),
    onOpenBoard: async () => {
      await boardUI.show({ mode: 'view' });
      refreshHudMask();
    },
    onRestart: () => {
      progress.clear({ keepPortraits: false });
      const newSeed = ((ctx.state?.seed || 1) + 1) >>> 0;
      if (typeof ctx.startGame === 'function') {
        ctx.startGame({ seed: newSeed, resume: false });
      } else if (typeof ctx.restartGame === 'function') {
        ctx.restartGame({ seed: newSeed });
      }
      hudUI.show(true);
      refreshHudMask();
    },
  });

  hudUI = createHudUI(ctx, {
    isModalOpen: isAnyOverlayActive,
    onOpenBoardView: async () => {
      const prevScene = ctx.state?.scene || 'world';
      await boardUI.show({ mode: 'view' });
      if (ctx.state && prevScene === 'world') ctx.state.scene = 'world';
      refreshHudMask();
    },
    onPausePress: () => {
      menusUI.pause(true);
      refreshHudMask();
    },
  });

  // Auto-persist quest completions & hidden discoveries for Gate F14
  if (ctx.events?.on) {
    ctx.events.on('questComplete', () => {
      progress.saveFromState(ctx.state);
      hudUI.update(ctx.state);
    });
    ctx.events.on('hiddenFound', () => {
      progress.saveFromState(ctx.state);
      hudUI.update(ctx.state);
    });
  }

  // Fallback rAF ticker ONLY for standalone pages without core's fixed-step loop.
  // Once core calls ui.update(dt), sim time exclusively drives UI timers (100% deterministic F11).
  let hasExternalSimLoop = Boolean(ctx.loop || ctx.rankContestant);
  let lastRafTime = performance.now();
  const tickFallback = (now) => {
    if (hasExternalSimLoop) return;
    const dt = Math.min(0.05, Math.max(0, (now - lastRafTime) / 1000));
    lastRafTime = now;
    boothUI.update(dt);
    boardUI.update(dt);
    nextUI.update(dt);
    menusUI.update(dt);
    requestAnimationFrame(tickFallback);
  };
  if (!hasExternalSimLoop) {
    requestAnimationFrame(tickFallback);
  }

  let skipNextOnce = false;

  const cancelOverlays = () => {
    skipNextOnce = false;
    boothUI?.cancel?.();
    boardUI?.cancel?.();
    nextUI?.hide?.();
    shareUI?.hideFinal?.();
    menusUI?.pause?.(false);
    hudUI?.setAction?.(null);
    refreshHudMask();
  };

  const ui = {
    progress,
    renderPortrait: (a, b, c) =>
      typeof a === 'string' ? renderPortrait(ctx, a, b) : renderPortrait(a || ctx, b, c),
    restoreProgress: restoreStateFromSavedProgress,
    restoreWall: () => boardUI.restoreWallFromProgress(),
    cancelOverlays,
    resetOverlays: cancelOverlays,

    showTitle: () => {
      titleUI.show();
      refreshHudMask();
    },
    hideTitle: () => {
      titleUI.hide();
      refreshHudMask();
    },
    showHUD: (b) => {
      hudUI.show(b);
      if (b) boardUI.restoreWallFromProgress();
    },
    updateHUD: (state) => hudUI.update(state),
    setObjective: (obj) => hudUI.setObjective(obj),
    setAction: (act, onPress) => hudUI.setAction(act, onPress),

    showBooth: async (contestantId) => {
      skipNextOnce = false;
      const res = await boothUI.show(contestantId);
      refreshHudMask();
      return res;
    },
    showBoard: async (opts) => {
      skipNextOnce = false;
      const res = await boardUI.show(opts);
      hudUI.update(ctx.state);
      refreshHudMask();
      return res;
    },
    showNext: async (contestantId) => {
      if (skipNextOnce) {
        skipNextOnce = false;
        refreshHudMask();
        return;
      }
      await nextUI.show(contestantId);
      refreshHudMask();
    },
    showFinal: () => {
      shareUI.showFinal();
      refreshHudMask();
    },
    hideFinal: () => {
      shareUI.hideFinal();
      refreshHudMask();
    },
    sharePNG: () => shareUI.sharePNG(),
    iris: (dir) => menusUI.iris(dir),
    pause: (open) => {
      const res = menusUI.pause(open);
      refreshHudMask();
      return res;
    },
    isPaused: () => menusUI.isPaused(),
    setMutedFlags: (flags) => menusUI.setMutedFlags(flags),

    // Seam helpers (§3.9)
    pressAction: () => hudUI.pressAction(),
    boothChoose: (accId) => boothUI.choose(accId),
    boothSnap: () => boothUI.snap(),
    boardDrop: (id, tier) => boardUI.drop(id, tier),
    continue: () => {
      if (boardUI.isActive()) {
        skipNextOnce = true;
        return boardUI.continue();
      }
      if (nextUI.isActive()) {
        nextUI.skip();
        return true;
      }
      return false;
    },

    update: (dt) => {
      hasExternalSimLoop = true;
      boothUI.update(dt);
      boardUI.update(dt);
      nextUI.update(dt);
      menusUI.update(dt);
    },
  };

  return ui;
}

export default createUI;
