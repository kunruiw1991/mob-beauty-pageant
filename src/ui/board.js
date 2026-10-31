// Tier board DOM overlay + §8.3 per-row reactions per docs/DESIGN.md §3.7, §8.2, §8.3, F5 (owner: pageant-ui).
// - Video colors + row order from TIERS (`perfect`, `gorgeous`, `pretty`, `okay`, `tryhard`)
// - Voxel-textured stone/quartz frame
// - Pointer Events drag with setPointerCapture (no DOM reparent during drag) + touch-action:none
// - Row highlight + 3D boardWall.highlight, spring snap bounce, return-to-tray on outside release
// - Tap-card-then-tap-row fallback (5/5 rows)
// - First-time animated ghost-hand drag demo
// - View-mode re-ranking of any placed card
// - 2.5 s per-row crowd + contestant + confetti/fireworks reactions (§8.3)

import { TIERS, TIERS_BY_ID, ROSTER, FINALE_RIVAL, getContestantMeta } from '../data/roster.js';
import { bindTap, computeStars, drawContestantChibi2D, getVoxelTextures, MOB_ICONS } from './ui_kit.js';
import { renderPortrait } from './portrait.js';
import { progress } from './progress.js';

const REACTION_TEXT = Object.freeze({
  perfect: '👑 完美！全场沸腾！',
  gorgeous: '💎 超漂亮！太闪啦！',
  pretty: '🌸 漂亮！好可爱！',
  okay: '🙂 一般～开心跳舞！',
  tryhard: '💪 再努力！加油！',
});

export function createBoardUI(ctx = {}, hooks = {}) {
  const uiRoot = hooks.mountRoot || document.getElementById('ui') || document.body;
  const tex = getVoxelTextures();

  const overlay = document.createElement('div');
  overlay.id = 'board-overlay';
  overlay.className = 'board-overlay ui-hidden';
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'board-backdrop';

  // Full-viewport flex shell (`>= 0.78 vw x vh` so layout_audit recurses cleanly into wallFrame + sidePanel)
  const shell = document.createElement('div');
  shell.id = 'board-shell';
  shell.className = 'board-shell';

  // 1. Voxel-textured 5-row Tier Wall Frame
  const wallFrame = document.createElement('div');
  wallFrame.id = 'board-wall-frame';
  wallFrame.className = 'board-wall-frame';
  wallFrame.style.backgroundImage = tex.stoneBrick;

  const rowMap = new Map();
  for (const tier of TIERS) {
    const rowEl = document.createElement('div');
    rowEl.id = `tier-row-${tier.id}`;
    rowEl.className = 'tier-row';
    rowEl.dataset.tier = tier.id;
    rowEl.dataset.row = tier.id;
    rowEl.style.setProperty('--tier-color', tier.color);

    const labelTile = document.createElement('div');
    labelTile.className = 'tier-label-tile';
    labelTile.innerHTML = `
      <span class="tier-icon">${tier.icon}</span>
      <span class="tier-name">${tier.label}</span>
    `;

    const cardsLane = document.createElement('div');
    cardsLane.className = 'tier-row-cards';

    rowEl.append(labelTile, cardsLane);
    wallFrame.appendChild(rowEl);
    rowMap.set(tier.id, { tier, rowEl, cardsLane });
  }

  // 2. Side / Bottom Tray + Close button panel
  const sidePanel = document.createElement('div');
  sidePanel.id = 'board-side-panel';
  sidePanel.className = 'board-side-panel';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'board-close-btn';
  closeBtn.className = 'mc-btn mc-btn-green board-close-btn';
  closeBtn.setAttribute('aria-label', '返回');
  closeBtn.innerHTML = `<span class="btn-icon">✔</span><span>完成</span>`;

  const trayBox = document.createElement('div');
  trayBox.id = 'board-tray';
  trayBox.className = 'board-tray-box';
  trayBox.dataset.boardTray = 'true';
  trayBox.style.backgroundImage = tex.oakPlank;

  const traySlot = document.createElement('div');
  traySlot.className = 'board-tray-slot';

  const trayHint = document.createElement('div');
  trayHint.className = 'board-tray-hint';
  trayHint.textContent = '👆 ➡️ 🏆';

  trayBox.append(traySlot, trayHint);
  sidePanel.append(closeBtn, trayBox);

  // 3. Reaction banner shown over the live 3D plaza during §8.3 2.5 s celebration
  const reactionBanner = document.createElement('div');
  reactionBanner.id = 'board-reaction-banner';
  reactionBanner.className = 'board-reaction-banner ui-hidden';
  reactionBanner.hidden = true;
  const reactionTextEl = document.createElement('span');
  reactionTextEl.className = 'board-reaction-text';
  reactionBanner.appendChild(reactionTextEl);

  // 4. First-time Ghost Hand tutorial (named `ghost-hand` -> skipped by layout_audit)
  const ghostHand = document.createElement('div');
  ghostHand.id = 'board-ghost-hand';
  ghostHand.className = 'ghost-hand ui-hidden';
  ghostHand.hidden = true;
  ghostHand.textContent = '👆';

  // 5. Floating drag proxy (hidden unless actively dragging)
  const dragProxy = document.createElement('div');
  dragProxy.id = 'board-drag-proxy';
  dragProxy.className = 'board-drag-proxy ghost-fx ui-hidden';
  dragProxy.hidden = true;
  const dragProxyImg = document.createElement('img');
  dragProxyImg.alt = '';
  const dragProxyName = document.createElement('span');
  dragProxyName.className = 'board-card-label';
  dragProxy.append(dragProxyImg, dragProxyName);

  shell.append(wallFrame, sidePanel);
  overlay.append(backdrop, shell, reactionBanner, ghostHand, dragProxy);
  uiRoot.appendChild(overlay);

  let session = null;
  let dragState = null;

  function ensurePortraitURL(contestantId) {
    let url =
      ctx.state?._portraits?.[contestantId] ||
      progress.getPortrait(contestantId) ||
      null;
    if (!url) {
      const accs = ctx.state?.contestants?.[contestantId]?.accessories || [];
      url = renderPortrait(ctx, contestantId, accs).dataURL;
    }
    return url;
  }

  function findContestantActor(contestantId) {
    if (contestantId === 'kai' && ctx.rival?.actor) return ctx.rival.actor;
    if (ctx.contestantActors?.[contestantId]) return ctx.contestantActors[contestantId];
    if (ctx.activeContestant?.id === contestantId || ctx.activeContestant?.kind === contestantId) {
      return ctx.activeContestant;
    }
    const actors = ctx.chars?.actors;
    if (actors && typeof actors[Symbol.iterator] === 'function') {
      for (const a of actors) {
        if (a && (a.id === contestantId || a.kind === contestantId)) return a;
      }
    }
    return null;
  }

  function clearRowHighlights() {
    for (const { rowEl } of rowMap.values()) {
      rowEl.classList.remove('is-drop-target');
    }
    ctx.world?.boardWall?.highlight?.(null);
  }

  function highlightTier(tierId) {
    for (const [id, { rowEl }] of rowMap.entries()) {
      rowEl.classList.toggle('is-drop-target', id === tierId);
    }
    ctx.world?.boardWall?.highlight?.(tierId || null);
  }

  function findTierAtPoint(clientX, clientY) {
    const hitEl = document.elementFromPoint(clientX, clientY);
    const viaDom = hitEl?.closest?.('.tier-row[data-tier]')?.dataset?.tier;
    if (viaDom && TIERS_BY_ID[viaDom]) return viaDom;

    for (const [tierId, { rowEl }] of rowMap.entries()) {
      const r = rowEl.getBoundingClientRect();
      if (
        r.width > 0 &&
        clientY >= r.top &&
        clientY <= r.bottom &&
        clientX >= r.left &&
        clientX <= r.right
      ) {
        return tierId;
      }
    }
    return null;
  }

  function setSelectedCard(cardId) {
    if (!session) return;
    session.selectedCardId = cardId;
    overlay.querySelectorAll('.board-card').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.contestantId === cardId);
    });
    for (const { rowEl } of rowMap.values()) {
      rowEl.classList.toggle('is-tap-ready', Boolean(cardId));
    }
  }

  function hideGhostHand() {
    ghostHand.hidden = true;
    ghostHand.classList.add('ui-hidden');
  }

  function bindCardInteraction(cardEl, contestantId, isTrayCard) {
    cardEl.style.touchAction = 'none';

    const startDrag = (pointerId, clientX, clientY) => {
      if (!session || session.phase === 'reaction') return;
      // In rank mode, only the new tray card (or already-placed cards if re-adjusting) is draggable
      if (session.mode === 'rank' && session.newId && !isTrayCard && contestantId !== session.newId) {
        return;
      }
      ctx.audio?.unlock?.();
      hideGhostHand();
      progress.markGhostHandShown();

      const rect = cardEl.getBoundingClientRect();
      const url = ensurePortraitURL(contestantId);
      const meta = getContestantMeta(contestantId);
      dragProxyImg.src = url;
      dragProxyName.textContent = meta?.name || contestantId;
      dragProxy.style.width = `${Math.max(80, Math.round(rect.width))}px`;
      dragProxy.style.height = `${Math.max(80, Math.round(rect.height))}px`;
      dragProxy.style.transform = `translate3d(${Math.round(clientX - rect.width / 2)}px, ${Math.round(clientY - rect.height / 2)}px, 0) rotate(-4deg) scale(1.06)`;
      dragProxy.hidden = false;
      dragProxy.classList.remove('ui-hidden');

      cardEl.classList.add('is-dragging-origin');

      dragState = {
        pointerId,
        contestantId,
        cardEl,
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        width: rect.width || 88,
        height: rect.height || 88,
        moved: false,
        hoverTier: null,
      };
    };

    const moveDrag = (clientX, clientY) => {
      if (!dragState) return;
      dragState.lastX = clientX;
      dragState.lastY = clientY;
      const dx = clientX - dragState.startX;
      const dy = clientY - dragState.startY;
      if (!dragState.moved && dx * dx + dy * dy >= 8 * 8) {
        dragState.moved = true;
      }
      dragProxy.style.transform = `translate3d(${Math.round(clientX - dragState.width / 2)}px, ${Math.round(clientY - dragState.height / 2)}px, 0) rotate(-3deg) scale(1.06)`;
      if (dragState.moved) {
        const tierId = findTierAtPoint(clientX, clientY);
        if (tierId !== dragState.hoverTier) {
          dragState.hoverTier = tierId;
          highlightTier(tierId);
        }
      }
    };

    const endDrag = (clientX, clientY, canceled = false) => {
      if (!dragState) return;
      const st = dragState;
      dragState = null;

      dragProxy.hidden = true;
      dragProxy.classList.add('ui-hidden');
      st.cardEl.classList.remove('is-dragging-origin');
      clearRowHighlights();

      if (canceled) return;

      const fx = Number.isFinite(clientX) ? clientX : st.lastX;
      const fy = Number.isFinite(clientY) ? clientY : st.lastY;
      const dx = fx - st.startX;
      const dy = fy - st.startY;
      const wasDrag = st.moved || dx * dx + dy * dy >= 10 * 10;

      if (!wasDrag) {
        // Tap-card-then-tap-row fallback!
        ctx.events?.emit?.('sfx', { name: 'tap' });
        setSelectedCard(st.contestantId);
        return;
      }

      const dropTier = findTierAtPoint(fx, fy);
      if (dropTier && TIERS_BY_ID[dropTier]) {
        commitDrop(st.contestantId, dropTier);
      } else {
        // Released outside -> bounce back to tray / origin row
        ctx.events?.emit?.('sfx', { name: 'boing' });
        st.cardEl.classList.remove('is-return-bounce');
        void st.cardEl.offsetWidth;
        st.cardEl.classList.add('is-return-bounce');
        setSelectedCard(st.contestantId);
      }
    };

    cardEl.addEventListener('pointerdown', (ev) => {
      if (ev.button !== undefined && ev.button > 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        cardEl.setPointerCapture(ev.pointerId);
      } catch (_) {}
      startDrag(ev.pointerId, ev.clientX, ev.clientY);
    });

    cardEl.addEventListener('pointermove', (ev) => {
      if (!dragState || dragState.pointerId !== ev.pointerId) return;
      ev.preventDefault();
      moveDrag(ev.clientX, ev.clientY);
    });

    cardEl.addEventListener('pointerup', (ev) => {
      if (!dragState || dragState.pointerId !== ev.pointerId) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        cardEl.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      endDrag(ev.clientX, ev.clientY, false);
    });

    cardEl.addEventListener('pointercancel', (ev) => {
      if (!dragState || dragState.pointerId !== ev.pointerId) return;
      endDrag(ev.clientX, ev.clientY, true);
    });

    // Prevent browser gesture cancellation on synthetic touch streams
    cardEl.addEventListener('touchmove', (ev) => {
      if (dragState) ev.preventDefault();
    }, { passive: false });
  }

  // Row tap handler for tap-card-then-tap-row fallback
  for (const [tierId, { rowEl }] of rowMap.entries()) {
    rowEl.style.touchAction = 'none';
    rowEl.addEventListener('pointerup', (ev) => {
      if (!session || session.phase === 'reaction') return;
      if (dragState) return;
      if (ev.target?.closest?.('.board-card')) return;
      const targetCard = session.selectedCardId;
      if (!targetCard) return;
      ev.preventDefault();
      ev.stopPropagation();
      commitDrop(targetCard, tierId);
    });
    rowEl.addEventListener('click', (ev) => {
      if (!session || session.phase === 'reaction') return;
      if (ev.target?.closest?.('.board-card')) return;
      const targetCard = session.selectedCardId;
      if (!targetCard) return;
      ev.preventDefault();
      ev.stopPropagation();
      commitDrop(targetCard, tierId);
    });
  }

  function createCardElement(contestantId, { isTray = false, tierId = null, snapBounce = false } = {}) {
    const meta = getContestantMeta(contestantId) || FINALE_RIVAL;
    const url = ensurePortraitURL(contestantId);

    const card = document.createElement('div');
    card.className = 'board-card ' + (isTray ? 'tray-card board-polaroid is-wiggling' : 'placed-card');
    if (snapBounce) card.classList.add('is-snap-bounce');
    if (isTray) card.id = 'board-new-card';
    card.dataset.draggable = 'true';
    card.dataset.contestantId = contestantId;
    card.dataset.cardId = contestantId;
    card.dataset.id = contestantId;
    if (tierId) card.dataset.tier = tierId;
    card.style.backgroundImage = tex.quartz;

    const img = document.createElement('img');
    img.className = 'board-card-img';
    img.src = url;
    img.alt = meta?.name || contestantId;
    img.draggable = false;

    const nameTag = document.createElement('span');
    nameTag.className = 'board-card-label';
    nameTag.textContent = meta?.name || contestantId;

    card.append(img, nameTag);
    bindCardInteraction(card, contestantId, isTray);
    return card;
  }

  function renderBoardCards({ bounceId = null } = {}) {
    for (const { cardsLane } of rowMap.values()) {
      cardsLane.innerHTML = '';
    }
    traySlot.innerHTML = '';

    const boardState = ctx.state?.board || progress.load()?.board || {};
    const newId = session?.mode === 'rank' && !session?.rankedResult ? session.newId : null;

    // Populate placed cards in each row
    for (const [cid, tierId] of Object.entries(boardState)) {
      if (newId && cid === newId) continue;
      const rowEntry = rowMap.get(tierId);
      if (!rowEntry) continue;
      const cardEl = createCardElement(cid, {
        isTray: false,
        tierId,
        snapBounce: cid === bounceId,
      });
      rowEntry.cardsLane.appendChild(cardEl);
    }

    // Populate tray polaroid in rank mode (before drop)
    if (newId) {
      trayBox.hidden = false;
      trayBox.style.display = '';
      closeBtn.hidden = true;
      closeBtn.style.display = 'none';
      const trayCard = createCardElement(newId, { isTray: true });
      traySlot.appendChild(trayCard);
    } else {
      trayBox.hidden = true;
      trayBox.style.display = 'none';
      closeBtn.hidden = session?.phase === 'reaction';
      closeBtn.style.display = session?.phase === 'reaction' ? 'none' : '';
    }
  }

  function triggerRowReaction(contestantId, tierId) {
    const stagePos = ctx.world?.poi?.stage || { x: 48, y: 9, z: 56 };
    const actor = findContestantActor(contestantId);
    const crowd = ctx.crowdCtrl || ctx.crowd || ctx.chars?.crowdInstance || null;
    const isKai = contestantId === 'kai';
    const coreHandlesRankJuice = typeof ctx.rankContestant === 'function';

    switch (tierId) {
      case 'perfect': // 完美 -> fanfare, confetti >= 150, 3 fireworks, crowd jumps
        if (!coreHandlesRankJuice) {
          ctx.audio?.play?.('fanfare');
          ctx.events?.emit?.('sfx', { name: 'fanfare' });
          ctx.fx?.confetti?.('screen', 165);
          ctx.fx?.fireworks?.({ x: stagePos.x - 3, y: stagePos.y + 4, z: stagePos.z - 2 }, 32);
          ctx.fx?.fireworks?.({ x: stagePos.x, y: stagePos.y + 5, z: stagePos.z - 3 }, 32);
          ctx.fx?.fireworks?.({ x: stagePos.x + 3, y: stagePos.y + 4, z: stagePos.z - 2 }, 32);
          crowd?.react?.('jump');
        }
        if (isKai) {
          actor?.setAnim?.('cry');
          actor?.setEmote?.('❤');
        } else {
          actor?.setAnim?.('cheer');
          actor?.setEmote?.('👑');
        }
        break;

      case 'gorgeous': // 超漂亮 -> cheer + sparkles + 2 fireworks
        if (!coreHandlesRankJuice) {
          ctx.audio?.play?.('cheer');
          ctx.events?.emit?.('sfx', { name: 'cheer' });
          ctx.fx?.sparkles?.(stagePos, 36, { toPlayer: false });
          ctx.fx?.confetti?.('screen', 60);
          ctx.fx?.fireworks?.({ x: stagePos.x - 2.5, y: stagePos.y + 4, z: stagePos.z - 2 }, 28);
          ctx.fx?.fireworks?.({ x: stagePos.x + 2.5, y: stagePos.y + 4, z: stagePos.z - 2 }, 28);
          crowd?.react?.('cheer');
        }
        actor?.setAnim?.('happy');
        actor?.setEmote?.('💎');
        break;

      case 'pretty': // 漂亮 -> claps + hearts
        if (!coreHandlesRankJuice) {
          ctx.audio?.play?.('clap');
          ctx.events?.emit?.('sfx', { name: 'clap' });
          ctx.fx?.hearts?.(stagePos, 20);
          ctx.fx?.sparkles?.(stagePos, 18, { toPlayer: false });
          crowd?.react?.('clap');
        }
        actor?.setAnim?.('pose');
        actor?.setEmote?.('❤');
        break;

      case 'okay': // 一般 -> crowd "哦~", contestant shrugs and does a silly dance
        if (!coreHandlesRankJuice) {
          ctx.audio?.play?.('aww');
          ctx.events?.emit?.('sfx', { name: 'aww' });
          ctx.fx?.popup?.(stagePos, '🎵');
          ctx.fx?.sparkles?.(stagePos, 12, { toPlayer: false });
          crowd?.react?.('aww');
        }
        actor?.setAnim?.('shrug');
        actor?.setEmote?.('🙂');
        break;

      case 'tryhard': // 再努力 -> crowd "加油!" chant, contestant flexes / does push-ups
      default:
        if (!coreHandlesRankJuice) {
          ctx.audio?.play?.('cheer');
          ctx.events?.emit?.('sfx', { name: 'boing' });
          ctx.fx?.popup?.(stagePos, '💪');
          ctx.fx?.sparkles?.(stagePos, 14, { toPlayer: false });
          crowd?.react?.('cheer');
        }
        actor?.setAnim?.(isKai ? 'pushup' : 'flex');
        actor?.setEmote?.('💪');
        break;
    }
  }

  function sync3DWall(contestantId, tierId) {
    const url = ensurePortraitURL(contestantId);
    if (!ctx.world?.boardWall?.setPortrait) return;
    // Provide cached HTMLImageElement or canvas/dataURL so boardWall can draw immediately or onload
    const { canvas } = renderPortrait(ctx, contestantId, ctx.state?.contestants?.[contestantId]?.accessories || []);
    try {
      ctx.world.boardWall.setPortrait(contestantId, canvas || url, tierId);
    } catch (_) {
      try {
        ctx.world.boardWall.setPortrait(contestantId, url, tierId);
      } catch (__) {}
    }
  }

  function commitDrop(contestantId, tierId) {
    if (!session || !contestantId || !TIERS_BY_ID[tierId]) return false;
    if (session.phase === 'reaction') return false;

    hideGhostHand();
    progress.markGhostHandShown();
    clearRowHighlights();

    // Update live state synchronously (§3.10)
    if (ctx.state) {
      if (!ctx.state.board) ctx.state.board = {};
      ctx.state.board[contestantId] = tierId;
      if (ctx.state.contestants?.[contestantId]) {
        ctx.state.contestants[contestantId].met = true;
        ctx.state.contestants[contestantId].tier = tierId;
        if (ctx.state.contestants[contestantId].hidden) {
          ctx.state.contestants[contestantId].found = true;
        }
      }
      ctx.state.stars = computeStars(ctx.state);
    }

    const url = ensurePortraitURL(contestantId);
    sync3DWall(contestantId, tierId);
    progress.saveFromState(ctx.state, {
      board: { [contestantId]: tierId },
      portraits: { [contestantId]: url },
    });

    ctx.events?.emit?.('sfx', { name: 'pop' });
    ctx.events?.emit?.('rank', { id: contestantId, tier: tierId });

    const result = { id: contestantId, tier: tierId };
    session.selectedCardId = null;

    if (session.mode === 'view') {
      session.lastReRank = result;
      renderBoardCards({ bounceId: contestantId });
      triggerRowReaction(contestantId, tierId);
      return true;
    }

    // Rank mode: snap card into row immediately, play 2.5 s reaction (§8.3), then resolve
    session.rankedResult = result;
    session.phase = 'reaction';
    session.reactionSec = 0;
    session.reactionDuration = 2.5;
    session.reactionSecondaryFired = false;

    renderBoardCards({ bounceId: contestantId });
    triggerRowReaction(contestantId, tierId);

    reactionTextEl.textContent = REACTION_TEXT[tierId] || `${TIERS_BY_ID[tierId].icon} ${TIERS_BY_ID[tierId].label}`;
    reactionBanner.style.setProperty('--tier-color', TIERS_BY_ID[tierId].color);
    return true;
  }

  function finishSession() {
    if (!session) return false;
    const { resolve, mode, rankedResult, lastReRank } = session;
    session = null;
    dragState = null;

    clearRowHighlights();
    hideGhostHand();
    dragProxy.hidden = true;
    dragProxy.classList.add('ui-hidden');
    reactionBanner.hidden = true;
    reactionBanner.classList.add('ui-hidden');
    shell.classList.remove('ui-hidden');
    backdrop.classList.remove('ui-hidden');
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');

    hooks.onClose?.();
    resolve(mode === 'rank' ? rankedResult : (lastReRank || null));
    return true;
  }

  bindTap(closeBtn, () => {
    finishSession();
  }, { ctx, sfx: 'pop' });

  function positionGhostHand() {
    const trayCard = document.getElementById('board-new-card');
    const targetRow = rowMap.get('perfect')?.rowEl;
    if (!trayCard || !targetRow) return;
    const r0 = trayCard.getBoundingClientRect();
    const r1 = targetRow.getBoundingClientRect();
    if (r0.width < 10 || r1.width < 10) return;

    const sx = Math.round(r0.left + r0.width * 0.5);
    const sy = Math.round(r0.top + r0.height * 0.5);
    const ex = Math.round(r1.left + Math.min(220, r1.width * 0.55));
    const ey = Math.round(r1.top + r1.height * 0.5);

    ghostHand.style.setProperty('--gh-x0', `${sx}px`);
    ghostHand.style.setProperty('--gh-y0', `${sy}px`);
    ghostHand.style.setProperty('--gh-x1', `${ex}px`);
    ghostHand.style.setProperty('--gh-y1', `${ey}px`);
    ghostHand.hidden = false;
    ghostHand.classList.remove('ui-hidden');
  }

  function cancelSession() {
    const pendingResolve = session?.resolve;
    session = null;
    dragState = null;

    clearRowHighlights();
    hideGhostHand();
    dragProxy.hidden = true;
    dragProxy.classList.add('ui-hidden');
    reactionBanner.hidden = true;
    reactionBanner.classList.add('ui-hidden');
    shell.classList.remove('ui-hidden');
    backdrop.classList.remove('ui-hidden');
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');

    pendingResolve?.(null);
    return true;
  }

  function show({ newId = null, mode = 'view' } = {}) {
    if (session) cancelSession();

    const effectiveMode = newId && mode !== 'view' ? 'rank' : mode;
    if (ctx.state) ctx.state.scene = 'board';
    ctx.events?.emit?.('sceneChange', { scene: 'board', mode: effectiveMode, newId });
    hooks.onOpen?.();

    closeBtn._resetTapDebounce?.();

    overlay.dataset.mode = effectiveMode;
    overlay.hidden = false;
    overlay.classList.remove('ui-hidden');
    shell.classList.remove('ui-hidden');
    backdrop.classList.remove('ui-hidden');
    reactionBanner.hidden = true;
    reactionBanner.classList.add('ui-hidden');

    return new Promise((resolve) => {
      session = {
        mode: effectiveMode,
        newId: effectiveMode === 'rank' ? newId : null,
        selectedCardId: null,
        phase: 'board',
        rankedResult: null,
        lastReRank: null,
        reactionSec: 0,
        reactionDuration: 2.5,
        reactionSecondaryFired: false,
        resolve,
      };

      renderBoardCards();

      if (effectiveMode === 'rank' && newId && !progress.wasGhostHandShown()) {
        requestAnimationFrame(() => {
          if (session && session.phase === 'board') positionGhostHand();
        });
      } else {
        hideGhostHand();
      }
    });
  }

  function update(dt) {
    if (!session || session.phase !== 'reaction') return;
    session.reactionSec += dt;

    if (session.rankedResult) {
      findContestantActor(session.rankedResult.id)?.update?.(dt);
    }

    // After 0.50 s of seeing the card snap-bounce in its row, reveal the 3D plaza celebration!
    if (session.reactionSec >= 0.50 && !shell.classList.contains('ui-hidden')) {
      shell.classList.add('ui-hidden');
      backdrop.classList.add('ui-hidden');
      reactionBanner.hidden = false;
      reactionBanner.classList.remove('ui-hidden');
    }

    // Secondary contestant anim transition for okay (shrug -> dance) & tryhard (flex -> pushup)
    if (!session.reactionSecondaryFired && session.reactionSec >= 0.75 && session.rankedResult) {
      session.reactionSecondaryFired = true;
      const { id, tier } = session.rankedResult;
      const actor = findContestantActor(id);
      if (tier === 'okay') actor?.setAnim?.('dance');
      if (tier === 'tryhard') actor?.setAnim?.('pushup');
    }

    if (session.reactionSec >= session.reactionDuration) {
      finishSession();
    }
  }

  function restoreWallFromProgress() {
    const saved = progress.load();
    const boardMap = ctx.state?.board && Object.keys(ctx.state.board).length > 0
      ? ctx.state.board
      : (saved?.board || {});
    for (const [cid, tierId] of Object.entries(boardMap)) {
      if (TIERS_BY_ID[tierId]) {
        sync3DWall(cid, tierId);
      }
    }
  }

  return {
    el: overlay,
    show,
    drop: (contestantId, tier) => commitDrop(contestantId || session?.newId, tier),
    continue: () => finishSession(),
    hide: () => finishSession(),
    cancel: cancelSession,
    restoreWallFromProgress,
    isActive: () => Boolean(session),
    update,
  };
}

export default createBoardUI;
