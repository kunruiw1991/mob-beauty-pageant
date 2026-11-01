// Booth / runway tray module per docs/DESIGN.md §3.7, §8.1 (owner: pageant-ui).
// - 3 accessory buttons (>= 84x84 px) with 80x80 voxel thumbnails
// - 1 big 📸 shutter button (>= 96x96 px)
// - 三三 (wither, heads === 3) gets 3 picks across slots 0, 1, 2
// - White flash + shutter sfx + Polaroid fly-in (<= 0.36 s sim time)
// - Deterministic 12 s idle auto-pick + auto-snap via update(dt)

import { ACCESSORIES_BY_ID, getContestantMeta } from '../data/roster.js';
import { UI } from '../data/strings.js';
import { bindTap, drawAccessoryThumb, drawContestantChibi2D, getVoxelTextures, MOB_ICONS } from './ui_kit.js';
import { renderPortrait } from './portrait.js';
import { progress } from './progress.js';

export function createBoothUI(ctx = {}, hooks = {}) {
  const uiRoot = hooks.mountRoot || document.getElementById('ui') || document.body;
  const tex = getVoxelTextures();

  const overlay = document.createElement('div');
  overlay.id = 'booth-overlay';
  overlay.className = 'booth-overlay ui-hidden';
  overlay.hidden = true;

  // White camera flash overlay (named `flash-fx` so layout_audit skips decorative layer)
  const flashEl = document.createElement('div');
  flashEl.id = 'booth-flash';
  flashEl.className = 'booth-flash flash-fx ui-hidden';
  flashEl.hidden = true;

  // Flying polaroid preview on snap (decorative animation, pointer-events: none)
  const polaroidFly = document.createElement('div');
  polaroidFly.id = 'booth-polaroid-fly';
  polaroidFly.className = 'booth-polaroid-fx ui-hidden';
  polaroidFly.hidden = true;
  const polaroidImg = document.createElement('img');
  polaroidImg.alt = '';
  const polaroidCaption = document.createElement('div');
  polaroidCaption.className = 'booth-polaroid-caption';
  polaroidFly.append(polaroidImg, polaroidCaption);

  // Standalone 2D runway preview (shown ONLY when no WebGL canvas is mounted in body)
  const fallbackStage = document.createElement('div');
  fallbackStage.className = 'booth-fallback-bg ui-hidden';
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = 216;
  fallbackCanvas.height = 216;
  fallbackStage.appendChild(fallbackCanvas);

  // Full-viewport shell (`>= 0.78 vw x vh` so layout_audit recurses cleanly into header + tray)
  const shell = document.createElement('div');
  shell.className = 'booth-shell';

  // Top non-interactive contestant badge (+ 3-head slot pips for 三三)
  const headerBadge = document.createElement('div');
  headerBadge.id = 'booth-header';
  headerBadge.className = 'booth-header-pill';
  headerBadge.style.backgroundImage = tex.oakPlank;
  const headerTitle = document.createElement('span');
  headerTitle.className = 'booth-header-name';
  const headSlotsWrap = document.createElement('span');
  headSlotsWrap.className = 'booth-head-slots';
  headerBadge.append(headerTitle, headSlotsWrap);

  // Bottom tray: 3 accessory buttons (>=84px w/ 80px voxel canvas) + 📸 (>=96px)
  const tray = document.createElement('div');
  tray.id = 'booth-tray';
  tray.className = 'booth-tray';
  tray.style.backgroundImage = tex.stoneBrick;

  const accButtons = [];
  for (let i = 0; i < 3; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-btn booth-acc-btn';
    btn.id = `booth-acc-${i}`;
    const thumb = document.createElement('canvas');
    thumb.width = 80;
    thumb.height = 80;
    thumb.className = 'booth-acc-thumb';
    btn.appendChild(thumb);
    accButtons.push({ btn, thumb, accId: null });
    tray.appendChild(btn);
  }

  const snapBtn = document.createElement('button');
  snapBtn.type = 'button';
  snapBtn.id = 'booth-snap-btn';
  snapBtn.className = 'mc-btn mc-btn-gold booth-snap-btn';
  snapBtn.setAttribute('aria-label', UI.takePhotoAria);
  snapBtn.innerHTML = `<span class="booth-cam-icon">📸</span>`;
  tray.appendChild(snapBtn);

  shell.append(headerBadge, tray);
  overlay.append(fallbackStage, shell, polaroidFly, flashEl);
  uiRoot.appendChild(overlay);

  let session = null;

  function findContestantActor(contestantId) {
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

  function refreshBoothVisuals() {
    if (!session) return;
    const { contestantId, heads, selected, nextHeadSlot } = session;
    const meta = getContestantMeta(contestantId);
    headerTitle.textContent = `${MOB_ICONS[contestantId] || '✨'} ${meta?.name || contestantId}`;

    if (heads > 1) {
      headSlotsWrap.hidden = false;
      headSlotsWrap.style.display = 'inline-flex';
      headSlotsWrap.innerHTML = '';
      for (let s = 0; s < heads; s++) {
        const pip = document.createElement('span');
        pip.className = 'booth-head-pip' + (s === nextHeadSlot ? ' is-next' : '') + (selected[s] ? ' is-filled' : '');
        const accMeta = selected[s] ? ACCESSORIES_BY_ID[selected[s]] : null;
        pip.textContent = accMeta?.icon || `${s + 1}`;
        headSlotsWrap.appendChild(pip);
      }
    } else {
      headSlotsWrap.hidden = true;
      headSlotsWrap.style.display = 'none';
    }

    for (const item of accButtons) {
      const isChosen = item.accId && selected.includes(item.accId);
      item.btn.classList.toggle('is-selected', Boolean(isChosen));
    }

    // Update 2D fallback canvas if no 3D canvas exists
    const hasWebGLCanvas = Boolean(document.querySelector('canvas#game-canvas, body > canvas'));
    fallbackStage.classList.toggle('ui-hidden', hasWebGLCanvas);
    if (!hasWebGLCanvas) {
      const fg = fallbackCanvas.getContext('2d');
      drawContestantChibi2D(fg, contestantId, selected.filter(Boolean), 216, true);
    }
  }

  accButtons.forEach((item) => {
    bindTap(item.btn, () => {
      if (!session || session.snapping || !item.accId) return;
      choose(item.accId);
    }, { ctx, sfx: 'pop' });
  });

  bindTap(snapBtn, () => {
    if (!session || session.snapping) return;
    snap();
  }, { ctx, sfx: null });

  function choose(accessoryId) {
    if (!session || session.snapping || !accessoryId) return false;
    session.idleSec = 0;

    const { contestantId, heads } = session;
    let slot = 0;
    if (heads > 1) {
      slot = session.nextHeadSlot % heads;
      session.selected[slot] = accessoryId;
      session.nextHeadSlot = (slot + 1) % heads;
    } else {
      slot = 0;
      session.selected[0] = accessoryId;
    }

    const actor = session.actor || findContestantActor(contestantId);
    actor?.setAccessory?.(accessoryId, slot);
    actor?.setAnim?.('happy');

    const stagePos = ctx.world?.poi?.stage || { x: 48, y: 9, z: 59 };
    ctx.fx?.hearts?.(stagePos, 6);
    ctx.events?.emit?.('accessory', { id: contestantId, accessoryId, slot });

    if (ctx.state?.contestants?.[contestantId]) {
      ctx.state.contestants[contestantId].accessories = session.selected.filter(Boolean);
    }

    refreshBoothVisuals();
    return true;
  }

  function finalizeSession() {
    if (!session) return;
    const { resolve, result } = session;
    session = null;
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');
    flashEl.hidden = true;
    flashEl.classList.add('ui-hidden');
    polaroidFly.hidden = true;
    polaroidFly.classList.add('ui-hidden');
    polaroidFly.classList.remove('is-flying');
    resolve(result);
  }

  function snap(opts = {}) {
    if (!session || session.snapping) return false;
    session.snapping = true;

    const { contestantId, heads, options } = session;
    if (opts.auto && session.selected.filter(Boolean).length === 0) {
      if (heads > 1) {
        for (let h = 0; h < heads; h++) {
          const pickId = options[h % options.length];
          if (pickId) {
            session.selected[h] = pickId;
            (session.actor || findContestantActor(contestantId))?.setAccessory?.(pickId, h);
            ctx.events?.emit?.('accessory', { id: contestantId, accessoryId: pickId, slot: h });
          }
        }
      } else if (options[0]) {
        session.selected[0] = options[0];
        (session.actor || findContestantActor(contestantId))?.setAccessory?.(options[0], 0);
        ctx.events?.emit?.('accessory', { id: contestantId, accessoryId: options[0], slot: 0 });
      }
    }

    const chosenList = session.selected.filter(Boolean);
    const actor = session.actor || findContestantActor(contestantId);
    actor?.setAnim?.('pose');

    // Flash + shutter SFX + photo event
    flashEl.hidden = false;
    flashEl.classList.remove('ui-hidden', 'is-flashing');
    void flashEl.offsetWidth;
    flashEl.classList.add('is-flashing');

    ctx.fx?.flash?.('#ffffff', 0.22);
    ctx.audio?.play?.('shutter');
    ctx.events?.emit?.('sfx', { name: 'shutter' });
    ctx.events?.emit?.('photo', { id: contestantId, accessories: [...chosenList] });

    const { canvas, dataURL } = renderPortrait(ctx, contestantId, chosenList);
    if (ctx.state?.contestants?.[contestantId]) {
      ctx.state.contestants[contestantId].met = true;
      ctx.state.contestants[contestantId].accessories = [...chosenList];
      ctx.state.contestants[contestantId].portrait = true;
    }
    progress.saveFromState(ctx.state, { portraits: { [contestantId]: dataURL } });

    // Polaroid fly-in to tray (0.32 s sim time so 45 stepFrames finishes with margin)
    const meta = getContestantMeta(contestantId);
    polaroidImg.src = dataURL;
    polaroidCaption.textContent = meta?.name || contestantId;
    polaroidFly.hidden = false;
    polaroidFly.classList.remove('ui-hidden', 'is-flying');
    void polaroidFly.offsetWidth;
    polaroidFly.classList.add('is-flying');

    session.result = { accessories: [...chosenList], portrait: dataURL, canvas };
    session.flySec = 0;
    session.flyDuration = 0.30;
    return true;
  }

  function cancel() {
    const pendingResolve = session?.resolve;
    session = null;
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');
    flashEl.hidden = true;
    flashEl.classList.add('ui-hidden');
    flashEl.classList.remove('is-flashing');
    polaroidFly.hidden = true;
    polaroidFly.classList.add('ui-hidden');
    polaroidFly.classList.remove('is-flying');
    pendingResolve?.(null);
  }

  function show(contestantId) {
    if (session) cancel();
    const id = contestantId || 'sheep';
    const meta = getContestantMeta(id);
    const heads = meta?.heads || 1;
    const options = (meta?.accessories?.length ? [...meta.accessories] : ['crown', 'flowerCrown', 'bow']).slice(0, 3);

    // Populate 3 voxel thumbnail buttons
    for (let i = 0; i < 3; i++) {
      const accId = options[i] || 'crown';
      const accMeta = ACCESSORIES_BY_ID[accId];
      accButtons[i].accId = accId;
      accButtons[i].btn.dataset.accessoryId = accId;
      accButtons[i].btn.setAttribute('aria-label', accMeta?.label || accId);
      accButtons[i].btn._resetTapDebounce?.();
      // Draw crisp 80x80 voxel thumbnail (uses characters helper if it draws into canvas or returns canvas, else ui_kit)
      let drewCustom = false;
      if (typeof ctx.chars?.drawAccessoryThumb === 'function') {
        try {
          const res = ctx.chars.drawAccessoryThumb(accId, 80);
          if (res instanceof HTMLCanvasElement) {
            const g = accButtons[i].thumb.getContext('2d');
            g.imageSmoothingEnabled = false;
            g.clearRect(0, 0, 80, 80);
            g.drawImage(res, 0, 0, 80, 80);
            drewCustom = true;
          }
        } catch (_) {
          drewCustom = false;
        }
      }
      if (!drewCustom) {
        drawAccessoryThumb(accButtons[i].thumb, accId);
      }
    }
    snapBtn._resetTapDebounce?.();

    if (ctx.state) ctx.state.scene = 'booth';

    const actor = findContestantActor(id);
    actor?.clearAccessories?.();
    // Preserve runway walk-in if core spawned runwayActor walking down z:56.5 -> 53.0
    if (!ctx.runwayActor) {
      actor?.setAnim?.('pose');
      const stagePos = ctx.world?.poi?.stage || { x: 48, y: 9, z: 59 };
      ctx.audio?.music?.('runway');
      (ctx.crowdCtrl || ctx.crowd)?.react?.('cheer');
      ctx.fx?.hearts?.(stagePos, 10);
      ctx.fx?.sparkles?.(stagePos, 14, { toPlayer: false });
      ctx.events?.emit?.('boothStart', { id });
      ctx.events?.emit?.('sceneChange', { scene: 'booth' });
    }

    overlay.hidden = false;
    overlay.classList.remove('ui-hidden');
    flashEl.hidden = true;
    flashEl.classList.add('ui-hidden');
    polaroidFly.hidden = true;
    polaroidFly.classList.add('ui-hidden');

    return new Promise((resolve) => {
      session = {
        contestantId: id,
        heads,
        options,
        selected: new Array(heads).fill(null),
        nextHeadSlot: 0,
        actor,
        idleSec: 0,
        snapping: false,
        flySec: 0,
        flyDuration: 0.30,
        result: null,
        resolve,
      };
      hooks.onOpen?.();
      refreshBoothVisuals();
    });
  }

  function update(dt) {
    if (!session) return;
    if (session.snapping) {
      session.flySec += dt;
      if (session.flySec >= session.flyDuration) {
        finalizeSession();
      }
      return;
    }
    session.idleSec += dt;
    if (session.idleSec >= 12.0) {
      snap({ auto: true });
    }
  }

  function hide() {
    if (session) {
      if (!session.result) {
        const { dataURL, canvas } = renderPortrait(ctx, session.contestantId, session.selected.filter(Boolean));
        session.result = { accessories: session.selected.filter(Boolean), portrait: dataURL, canvas };
      }
      finalizeSession();
    } else {
      overlay.hidden = true;
      overlay.classList.add('ui-hidden');
    }
  }

  return {
    el: overlay,
    show,
    choose,
    snap,
    hide,
    cancel,
    isActive: () => Boolean(session) || (!overlay.hidden && !overlay.classList.contains('ui-hidden')),
    update,
  };
}

export default createBoothUI;
