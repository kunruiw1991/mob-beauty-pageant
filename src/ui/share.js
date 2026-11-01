// Final 排行榜 screen & PNG poster exporter per docs/DESIGN.md §3.7, §8.5, §8.6 & #155 P2 (owner: pageant-ui).
// Shows full 5-row board (cards >= 96 px when space allows, auto-fitting crowded rows & mobile viewports),
// ★ count (1-3), formatted time, and 3 buttons:
// - 分享 (1200x800 PNG via canvas -> Web Share API w/ File, else download)
// - 再来一次 (new seed; board history kept, re-rank allowed)
// - 继续找 (return to world to hunt hidden contestants)

import { TIERS, FINALE_RIVAL, getContestantMeta } from '../data/roster.js';
import { GAME_TITLE, UI } from '../data/strings.js';
import { bindTap, computeStars, drawContestantChibi2D, formatDurationMs, getVoxelTextures } from './ui_kit.js';
import { renderPortrait } from './portrait.js';
import { progress } from './progress.js';

export function createShareUI(ctx = {}, hooks = {}) {
  const uiRoot = hooks.mountRoot || document.getElementById('ui') || document.body;
  const tex = getVoxelTextures();

  const overlay = document.createElement('div');
  overlay.id = 'final-overlay';
  overlay.className = 'final-overlay ui-hidden';
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'final-backdrop';

  const shell = document.createElement('div');
  shell.id = 'final-shell';
  shell.className = 'final-shell';

  // Left / Top: Full 5-row Tier Wall
  const wallBox = document.createElement('div');
  wallBox.id = 'final-board-wall';
  wallBox.className = 'final-board-wall';
  wallBox.style.backgroundImage = tex.stoneBrick;

  const finalRows = new Map();
  for (const tier of TIERS) {
    const r = document.createElement('div');
    r.className = 'final-tier-row';
    r.dataset.tier = tier.id;
    r.style.setProperty('--tier-color', tier.color);
    r.innerHTML = `
      <div class="final-tier-label">
        <span>${tier.icon}</span>
        <span>${tier.label}</span>
      </div>
      <div class="final-tier-cards"></div>
    `;
    wallBox.appendChild(r);
    finalRows.set(tier.id, r.querySelector('.final-tier-cards'));
  }

  // Right / Bottom: Summary card (Stars + Time + 3 Buttons)
  const summaryPanel = document.createElement('div');
  summaryPanel.id = 'final-summary-panel';
  summaryPanel.className = 'final-summary-panel';
  summaryPanel.style.backgroundImage = tex.oakPlank;

  const headerCard = document.createElement('div');
  headerCard.className = 'final-header-card';
  const titleEl = document.createElement('div');
  titleEl.className = 'final-title';
  titleEl.textContent = UI.finalTitle;

  const starsEl = document.createElement('div');
  starsEl.id = 'final-stars';
  starsEl.className = 'final-stars';

  const timeEl = document.createElement('div');
  timeEl.id = 'final-time';
  timeEl.className = 'final-time';

  headerCard.append(titleEl, starsEl, timeEl);

  const actionsCol = document.createElement('div');
  actionsCol.className = 'final-actions';

  const btnShare = document.createElement('button');
  btnShare.type = 'button';
  btnShare.id = 'btn-final-share';
  btnShare.className = 'mc-btn mc-btn-gold final-action-btn';
  btnShare.innerHTML = `<span class="btn-icon">📤</span><span>${UI.share}</span>`;

  const btnReplay = document.createElement('button');
  btnReplay.type = 'button';
  btnReplay.id = 'btn-final-replay';
  btnReplay.className = 'mc-btn mc-btn-green final-action-btn';
  btnReplay.innerHTML = `<span class="btn-icon">🔄</span><span>${UI.replay}</span>`;

  const btnHunt = document.createElement('button');
  btnHunt.type = 'button';
  btnHunt.id = 'btn-final-hunt';
  btnHunt.className = 'mc-btn mc-btn-blue final-action-btn';
  btnHunt.innerHTML = `<span class="btn-icon">🔍</span><span>${UI.continueHunt}</span>`;

  actionsCol.append(btnShare, btnReplay, btnHunt);
  summaryPanel.append(headerCard, actionsCol);

  // Toast feedback on PNG save (decorative, `fx` in class so layout_audit skips)
  const toastEl = document.createElement('div');
  toastEl.className = 'final-toast-fx ui-hidden';
  toastEl.hidden = true;
  toastEl.textContent = UI.toastSaved;

  shell.append(wallBox, summaryPanel);
  overlay.append(backdrop, shell, toastEl);
  uiRoot.appendChild(overlay);

  function getPortraitURL(cid) {
    return (
      ctx.state?._portraits?.[cid] ||
      progress.getPortrait(cid) ||
      renderPortrait(ctx, cid, ctx.state?.contestants?.[cid]?.accessories || []).dataURL
    );
  }

  // Size final cards >= 96 px when space allows (#155 P2), scaling cleanly for crowded rows & mobile viewports
  function layoutFinalCards() {
    if (overlay.hidden) return;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const isNarrow = vw <= 720;
    const isShort = vh <= 520;
    const isDesktopOrTablet = !isNarrow && !isShort;

    // Give heavily populated rows extra vertical room on desktop/iPad so 2-line wrapping stays >= 96x96 px
    for (const lane of finalRows.values()) {
      const rowEl = lane.parentElement;
      if (!rowEl) continue;
      const n = lane.children.length;
      if (isDesktopOrTablet && n >= 7) {
        rowEl.style.flexGrow = '2.4';
      } else {
        rowEl.style.flexGrow = '1';
      }
    }
    void wallBox.offsetHeight;

    for (const lane of finalRows.values()) {
      const n = lane.children.length;
      if (n === 0) continue;

      const fallbackW = isNarrow ? vw - 114 : vw - (isShort ? 336 : 374);
      const fallbackH = isNarrow ? Math.floor((vh - 180) / 5) : Math.floor((vh - 44) / 5);
      const availW = Math.max(120, (lane.clientWidth || fallbackW) - 12);
      const availH = Math.max(46, (lane.clientHeight || fallbackH) - 6);

      const gap1 = availW >= 540 ? 6 : 3;
      const singleRowMaxW = Math.floor((availW - (n - 1) * gap1) / n);

      let cardW;
      let cardH;
      let gap = gap1;

      if (isDesktopOrTablet && singleRowMaxW < 96 && availH >= 200) {
        // Wrap onto 2 spacious rows (>= 96x96 px) when a single tier holds 7-13 contestants on desktop/iPad
        gap = 6;
        const cols = Math.ceil(n / 2);
        cardW = Math.min(114, Math.max(76, Math.floor((availW - (cols - 1) * gap) / cols)));
        cardH = Math.min(120, Math.max(96, Math.floor((availH - gap) / 2)));
      } else if (singleRowMaxW < 38 && availH >= 84) {
        // Wrap onto 2 compact lines on narrow portrait mobile when >= 7 cards share a single row
        gap = 3;
        const cols = Math.ceil(n / 2);
        cardW = Math.min(56, Math.max(36, Math.floor((availW - (cols - 1) * gap) / cols)));
        cardH = Math.min(54, Math.max(42, Math.floor((availH - gap) / 2)));
      } else {
        cardH = Math.min(128, availH);
        const maxAspectW = Math.max(40, Math.round(cardH * 1.04));
        cardW = Math.min(114, singleRowMaxW, maxAspectW);
        // Keep polaroid aspect balanced when width shrinks on 9-13 cards in one row
        cardH = Math.min(cardH, Math.round(cardW * 1.32));
      }

      const fontSize = cardW >= 92 ? 15 : cardW >= 68 ? 13 : cardW >= 48 ? 11 : 10;
      const labelH = fontSize >= 15 ? 20 : fontSize >= 13 ? 17 : 14;
      const pad = cardW >= 90 ? 5 : cardW >= 64 ? 3 : 1;
      const border = cardW >= 90 ? 3 : 2;
      const imgW = Math.max(24, cardW - (pad + border) * 2);
      const imgH = Math.max(18, cardH - (pad + border) * 2 - labelH - 2);

      lane.style.gap = `${gap}px`;
      for (const chip of lane.children) {
        chip.style.width = `${cardW}px`;
        chip.style.height = `${cardH}px`;
        chip.style.padding = `${pad}px`;
        chip.style.borderWidth = `${border}px`;
        const img = chip.querySelector('img');
        if (img) {
          img.style.width = `${imgW}px`;
          img.style.height = `${imgH}px`;
        }
        const lbl = chip.querySelector('span');
        if (lbl) {
          lbl.style.fontSize = `${fontSize}px`;
        }
      }
    }
  }

  function populateFinalBoard() {
    for (const lane of finalRows.values()) lane.innerHTML = '';
    const board = ctx.state?.board || progress.load()?.board || {};
    for (const [cid, tierId] of Object.entries(board)) {
      const lane = finalRows.get(tierId);
      if (!lane) continue;
      const meta = getContestantMeta(cid) || FINALE_RIVAL;
      const chip = document.createElement('div');
      chip.className = 'final-mini-card final-card';
      chip.dataset.contestant = cid;
      chip.dataset.contestantId = cid;
      chip.style.backgroundImage = tex.quartz;
      const img = document.createElement('img');
      img.src = getPortraitURL(cid);
      img.alt = meta?.name || cid;
      const lbl = document.createElement('span');
      lbl.textContent = meta?.name || cid;
      chip.append(img, lbl);
      lane.appendChild(chip);
    }

    const stars = computeStars(ctx.state || progress.load() || {});
    if (ctx.state) ctx.state.stars = stars;
    starsEl.textContent = [0, 1, 2].map((i) => (i < stars ? '★' : '☆')).join(' ');
    const ms = ctx.state?.elapsedMs ?? ctx.state?.timeMs ?? progress.load()?.elapsedMs ?? 0;
    timeEl.textContent = `⏱ ${formatDurationMs(ms)}`;
  }

  window.addEventListener('resize', () => {
    if (!overlay.hidden) layoutFinalCards();
  });

  async function buildShareCanvas() {
    const W = 1200;
    const H = 800;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;

    // Sky + grass background
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#56b4ff');
    sky.addColorStop(0.84, '#b8e3ff');
    sky.addColorStop(0.84, '#4ea832');
    sky.addColorStop(1, '#6f4e2a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // Header bar
    g.fillStyle = '#1f2029';
    g.fillRect(36, 24, W - 72, 92);
    g.fillStyle = '#ffd43b';
    g.font = '900 40px system-ui, sans-serif';
    g.fillText(GAME_TITLE, 60, 84, 650);

    const stars = computeStars(ctx.state || progress.load() || {});
    const ms = ctx.state?.elapsedMs ?? ctx.state?.timeMs ?? 0;
    g.fillStyle = '#fff3b0';
    g.font = '900 36px sans-serif';
    g.fillText(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}   ⏱ ${formatDurationMs(ms)}`, 730, 84);

    // Stone wall frame
    g.fillStyle = '#4b4e58';
    g.fillRect(36, 132, W - 72, 632);

    const board = ctx.state?.board || progress.load()?.board || {};
    const rowH = 118;

    // Load portrait image with fast DOM cache + 200ms timeout so sharePNG never hangs
    const loadImg = (cid, src) =>
      new Promise((resolve) => {
        const domImg = overlay.querySelector(`.final-mini-card[data-contestant-id="${cid}"] img`);
        if (domImg && domImg.complete && domImg.naturalWidth > 0) {
          resolve(domImg);
          return;
        }
        if (!src) {
          resolve(null);
          return;
        }
        let settled = false;
        const done = (val) => {
          if (settled) return;
          settled = true;
          resolve(val);
        };
        const timer = setTimeout(() => done(null), 200);
        const im = new Image();
        im.onload = () => {
          clearTimeout(timer);
          done(im);
        };
        im.onerror = () => {
          clearTimeout(timer);
          done(null);
        };
        im.src = src;
      });

    for (let i = 0; i < TIERS.length; i++) {
      const tier = TIERS[i];
      const ry = 144 + i * (rowH + 4);
      g.fillStyle = tier.color;
      g.fillRect(48, ry, W - 96, rowH);

      // Left tile
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(48, ry, 210, rowH);
      g.fillStyle = '#ffffff';
      g.font = '900 22px system-ui, sans-serif';
      g.fillText(`${tier.icon} ${tier.label}`, 60, ry + 68, 188);

      // Contestant portraits in this row (>= 96 px when space allows)
      const idsInRow = Object.entries(board)
        .filter(([, t]) => t === tier.id)
        .map(([cid]) => cid);

      const availW = W - 56 - 272;
      const stepX = idsInRow.length > 0 ? Math.min(108, Math.floor(availW / idsInRow.length)) : 108;
      const cardW = Math.min(100, Math.max(66, stepX - 6));

      for (let k = 0; k < idsInRow.length; k++) {
        const cid = idsInRow[k];
        const meta = getContestantMeta(cid) || FINALE_RIVAL;
        const cx = 272 + k * stepX;
        g.fillStyle = '#f8f6f0';
        g.fillRect(cx, ry + 6, cardW, 106);

        const img = await loadImg(cid, getPortraitURL(cid));
        if (img) {
          g.drawImage(img, cx + 5, ry + 10, cardW - 10, 74);
        } else {
          const tmp = document.createElement('canvas');
          tmp.width = 96;
          tmp.height = 96;
          drawContestantChibi2D(tmp.getContext('2d'), cid, [], 96, true);
          g.drawImage(tmp, cx + 5, ry + 10, cardW - 10, 74);
        }
        g.fillStyle = '#1e1e24';
        g.font = 'bold 14px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(meta?.name || cid, cx + cardW / 2, ry + 104, cardW - 6);
        g.textAlign = 'start';
      }
    }
    return canvas;
  }

  function showToast(msg = UI.toastSaved) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove('ui-hidden');
    setTimeout(() => {
      toastEl.hidden = true;
      toastEl.classList.add('ui-hidden');
    }, 1800);
  }

  function dataURLToPngBlob(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/png' });
  }

  async function sharePNG() {
    const canvas = await buildShareCanvas();
    const blob = dataURLToPngBlob(canvas.toDataURL('image/png'));
    if (!blob || blob.size === 0) return false;

    const isHeadless = Boolean(navigator.webdriver) || /HeadlessChrome/i.test(navigator.userAgent || '');
    const file = new File([blob], 'mob-beauty-pageant.png', { type: 'image/png' });
    if (!isHeadless && navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: GAME_TITLE,
          });
          showToast(UI.toastShared);
          return true;
        }
      } catch (_) {
        // Fall through to PNG download
      }
    }

    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = 'mob-beauty-pageant.png';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
    showToast(UI.toastSaved);
    return true;
  }

  bindTap(btnShare, () => {
    sharePNG();
  }, { ctx, sfx: 'kaching' });

  bindTap(btnReplay, () => {
    hideFinal();
    hooks.onReplay?.();
  }, { ctx, sfx: 'pop' });

  bindTap(btnHunt, () => {
    hideFinal();
    hooks.onContinueHunt?.();
  }, { ctx, sfx: 'pop' });

  function showFinal() {
    populateFinalBoard();
    const stars = computeStars(ctx.state || {});
    const elapsedMs = ctx.state?.elapsedMs ?? ctx.state?.timeMs ?? 0;
    if (ctx.state) {
      ctx.state.scene = 'final';
      ctx.state.stars = stars;
    }
    progress.saveFromState(ctx.state, { stars, elapsedMs });

    btnShare._resetTapDebounce?.();
    btnReplay._resetTapDebounce?.();
    btnHunt._resetTapDebounce?.();

    overlay.hidden = false;
    overlay.classList.remove('ui-hidden');
    layoutFinalCards();
    requestAnimationFrame(() => layoutFinalCards());
    hooks.onOpen?.();

    ctx.audio?.music?.('finale');
    ctx.audio?.play?.('fanfare');
    ctx.fx?.confetti?.('screen', 160);
    ctx.events?.emit?.('sceneChange', { scene: 'final' });
    ctx.events?.emit?.('gameComplete', { stars, timeMs: elapsedMs });
  }

  function hideFinal() {
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');
    hooks.onClose?.();
  }

  return {
    el: overlay,
    showFinal,
    hideFinal,
    sharePNG,
    isVisible: () => !overlay.hidden && !overlay.classList.contains('ui-hidden'),
  };
}

export default createShareUI;
