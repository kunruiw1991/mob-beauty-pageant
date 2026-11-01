// In-play HUD + master createUI(ctx) aggregator per docs/DESIGN.md §3.7, §8.7 & #149 N3 (owner: pageant-ui).
// HUD in play (<= 4 interactive controls, 0 overlaps across 1280x800, 1024x768, 844x390, 390x844):
// - Top-left board chip `3/10` (opens board `view`)
// - Top-centre non-interactive objective strip (`{icon, have, need}`)
// - Top-right `⏸` pause button
// - Bottom-right context action button ONLY when `action != null`
// - Off-screen beacon edge arrow (`#hud-beacon-btn` >= 72 px) with next contestant's face; hides when on-screen

import { ROSTER, ROSTER_BY_ID, getContestantMeta } from '../data/roster.js';
import { UI } from '../data/strings.js';
import { bindTap, clampCjk, drawContestantChibi2D, getVoxelTextures } from './ui_kit.js';
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
  boardBtn.setAttribute('aria-label', UI.boardAria);
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

  // 2. Top-centre NON-INTERACTIVE objective strip (icons over words; v1.1 English <= 24 chars)
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
  pauseBtn.setAttribute('aria-label', UI.pauseAria);
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

  // 5. Off-screen beacon arrow button (#149 N3: >= 72x72 px, contestant face + bouncing directional arrow)
  const beaconBtn = document.createElement('button');
  beaconBtn.type = 'button';
  beaconBtn.id = 'hud-beacon-btn';
  beaconBtn.className = 'mc-btn hud-beacon-btn ui-hidden';
  beaconBtn.hidden = true;
  beaconBtn.setAttribute('aria-label', UI.beaconAria);

  const beaconInner = document.createElement('span');
  beaconInner.className = 'hud-beacon-inner';

  const beaconFaceCanvas = document.createElement('canvas');
  beaconFaceCanvas.width = 56;
  beaconFaceCanvas.height = 56;
  beaconFaceCanvas.className = 'hud-beacon-face';

  const beaconArrowPivot = document.createElement('span');
  beaconArrowPivot.className = 'hud-beacon-arrow-pivot';
  beaconArrowPivot.setAttribute('aria-hidden', 'true');
  beaconArrowPivot.innerHTML = `
    <svg class="hud-beacon-arrow-svg" width="28" height="28" viewBox="0 0 16 16" shape-rendering="crispEdges">
      <polygon points="2,1 15,8 2,15 5,8" fill="#1b1c24"/>
      <polygon points="3,3 13,8 3,13 6,8" fill="#ffe64d"/>
      <polygon points="4,4 11,8 6,8" fill="#ffffff"/>
    </svg>
  `;

  beaconInner.append(beaconFaceCanvas, beaconArrowPivot);
  beaconBtn.appendChild(beaconInner);

  hudRoot.append(boardBtn, objStrip, pauseBtn, actionBtn, beaconBtn);

  let currentAction = null;
  let currentActionHandler = null;
  let hudWanted = false;
  let lastBeaconCid = null;
  let lastBeaconGuide = null;
  let tmpFaceSrcCanvas = null;

  function drawBeaconContestantFace(cid) {
    const safeCid = ROSTER_BY_ID[cid] ? cid : 'sheep';
    if (lastBeaconCid === safeCid) return;
    lastBeaconCid = safeCid;

    if (!tmpFaceSrcCanvas) {
      tmpFaceSrcCanvas = document.createElement('canvas');
      tmpFaceSrcCanvas.width = 144;
      tmpFaceSrcCanvas.height = 144;
    }
    const sg = tmpFaceSrcCanvas.getContext('2d');
    sg.imageSmoothingEnabled = false;
    drawContestantChibi2D(sg, safeCid, [], 144, false);

    const meta = getContestantMeta(safeCid);
    const fg = beaconFaceCanvas.getContext('2d');
    fg.imageSmoothingEnabled = false;
    fg.fillStyle = meta?.colors?.primary || '#fff8eb';
    fg.fillRect(0, 0, 56, 56);
    fg.fillStyle = meta?.colors?.secondary || '#ffd43b';
    fg.fillRect(0, 0, 56, 4);
    // Tight head+face crop from 144x144 chibi sheet
    fg.drawImage(tmpFaceSrcCanvas, 24, 10, 96, 96, 2, 3, 52, 52);
  }

  function resolveBeaconGuide() {
    if (ctx.state && ctx.state.scene !== 'world') return null;
    if (typeof ctx.getBeaconGuide === 'function') {
      return ctx.getBeaconGuide();
    }
    const nextId = ctx.quests?.activeId?.() || ctx.quests?.next?.() || null;
    if (!nextId || typeof ctx.pick?.worldToScreen !== 'function') return null;
    const list = ctx.quests?.targets?.() || [];
    const tgt =
      list.find((t) => String(t.id || '') === `beacon_${nextId}`) ||
      list.find((t) => String(t.id || '').startsWith('beacon_')) ||
      list[0] ||
      null;
    const pos = tgt?.pos || ctx.state?.quest?.pointer || null;
    if (!pos) return null;
    const scr = ctx.pick.worldToScreen(pos);
    const onScreen = scr.onScreen !== undefined ? Boolean(scr.onScreen) : Boolean(scr.visible);
    return {
      id: tgt?.id || `beacon_${nextId}`,
      targetId: tgt?.id || `beacon_${nextId}`,
      questId: nextId,
      contestantId: ROSTER_BY_ID[nextId]?.id || nextId,
      pos,
      sx: scr.sx,
      sy: scr.sy,
      onScreen,
      angle: scr.angle ?? Math.atan2((scr.sy ?? 400) - (window.innerHeight || 800) * 0.5, (scr.sx ?? 640) - (window.innerWidth || 1280) * 0.5),
    };
  }

  function hideBeaconArrow() {
    lastBeaconGuide = null;
    if (!beaconBtn.hidden) {
      beaconBtn.hidden = true;
      beaconBtn.classList.add('ui-hidden');
    }
  }

  function syncBeacon(guideArg) {
    if (guideArg === null || hudRoot.hidden || (ctx.state && ctx.state.scene !== 'world')) {
      hideBeaconArrow();
      return;
    }
    const guide = guideArg !== undefined ? guideArg : resolveBeaconGuide();
    if (!guide || guide.onScreen) {
      hideBeaconArrow();
      return;
    }

    lastBeaconGuide = guide;
    drawBeaconContestantFace(guide.contestantId || guide.questId || 'sheep');

    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const half = 40; // 80x80 px button (>= 72 px)
    const minCx = half + 22;
    const maxCx = Math.max(minCx, vw - half - 22);
    // Keep top >= 90 px so beacon arrow NEVER overlaps top HUD bar (#hud-board-btn / #hud-objective / #hud-pause-btn)
    const minCy = 134;
    const maxCy = Math.max(minCy, vh - half - 22);

    let cx = Math.min(maxCx, Math.max(minCx, Number(guide.sx) || vw * 0.5));
    let cy = Math.min(maxCy, Math.max(minCy, Number(guide.sy) || vh * 0.5));

    // Keep clear of bottom-right context action button when visible
    if (!actionBtn.hidden && cx > vw - 156 && cy > vh - 156) {
      cx = Math.max(minCx, vw - 156);
    }

    const angle = Number.isFinite(guide.angle)
      ? guide.angle
      : Math.atan2(cy - vh * 0.5, cx - vw * 0.5);
    const deg = Math.round((angle * 180) / Math.PI);
    const bdx = (Math.cos(angle) * 3.5).toFixed(1);
    const bdy = (Math.sin(angle) * 3.5).toFixed(1);

    beaconBtn.style.left = `${Math.round(cx - half)}px`;
    beaconBtn.style.top = `${Math.round(cy - half)}px`;
    beaconArrowPivot.style.transform = `rotate(${deg}deg)`;
    beaconInner.style.setProperty('--beacon-dx', `${bdx}px`);
    beaconInner.style.setProperty('--beacon-dy', `${bdy}px`);

    if (beaconBtn.hidden) {
      beaconBtn._resetTapDebounce?.();
      beaconBtn.hidden = false;
      beaconBtn.classList.remove('ui-hidden');
    }
  }

  bindTap(boardBtn, () => {
    hooks.onOpenBoardView?.();
  }, { ctx, sfx: 'tap' });

  bindTap(pauseBtn, () => {
    hooks.onPausePress?.();
  }, { ctx, sfx: 'tap' });

  bindTap(actionBtn, () => {
    pressAction();
  }, { ctx, sfx: 'pop' });

  bindTap(beaconBtn, () => {
    if (
      typeof ctx.walkToBeacon === 'function' &&
      typeof ctx.player?.isMoving === 'function'
    ) {
      try {
        if (ctx.walkToBeacon()) return;
      } catch (_) {}
    }
    const guide = lastBeaconGuide || resolveBeaconGuide();
    const tid = guide?.targetId;
    if (tid && typeof window.__PAGEANT__?.tapTarget === 'function' && window.__PAGEANT__.tapTarget(tid)) {
      if (!ctx.state?.player?.moving && guide?.pos && typeof ctx.player?.walkTo === 'function') {
        ctx.player.walkTo(guide.pos, { maxSearchR: 6, allowClamp: true });
      }
      return;
    }
    if (tid && typeof ctx.quests?.tapTarget === 'function' && ctx.quests.tapTarget(tid)) {
      return;
    }
    if (guide?.pos && typeof ctx.player?.walkTo === 'function') {
      ctx.player.walkTo(guide.pos, { maxSearchR: 6, allowClamp: true });
    }
  }, { ctx, sfx: 'pop' });

  window.addEventListener('resize', () => {
    if (!hudRoot.hidden) syncBeacon();
  });

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
    syncBeacon();
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
      if (!hudRoot.hidden) syncBeacon();
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
    if (!hudRoot.hidden) syncBeacon();
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
      beaconBtn._resetTapDebounce?.();
      update(ctx.state);
    } else {
      hideBeaconArrow();
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
    syncBeacon,
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
      nextUI?.hide?.();
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
      nextUI?.hide?.();
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

  let hasExternalSimLoop = Boolean(ctx.loop || ctx.rankContestant);
  let lastRafTime = performance.now();
  let beaconSyncAcc = 0;

  const tickFallback = (now) => {
    if (hasExternalSimLoop) return;
    const dt = Math.min(0.05, Math.max(0, (now - lastRafTime) / 1000));
    lastRafTime = now;
    boothUI.update(dt);
    boardUI.update(dt);
    nextUI.update(dt);
    menusUI.update(dt);
    hudUI.syncBeacon();
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
    updateBeacon: (guide) => hudUI.syncBeacon(guide),
    setObjective: (obj) => hudUI.setObjective(obj),
    setAction: (act, onPress) => hudUI.setAction(act, onPress),

    showBooth: async (contestantId) => {
      skipNextOnce = false;
      nextUI?.hide?.();
      const res = await boothUI.show(contestantId);
      refreshHudMask();
      return res;
    },
    showBoard: async (opts) => {
      skipNextOnce = false;
      nextUI?.hide?.();
      const res = await boardUI.show(opts);
      hudUI.update(ctx.state);
      refreshHudMask();
      return res;
    },
    showNext: async (contestantId) => {
      if (skipNextOnce || boardUI.isActive() || boothUI.isActive()) {
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
      beaconSyncAcc += dt;
      if (beaconSyncAcc >= 0.05) {
        beaconSyncAcc = 0;
        hudUI.syncBeacon();
      }
    },
  };

  return ui;
}

export default createUI;
