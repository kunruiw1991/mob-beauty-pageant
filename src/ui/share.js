// Final 排行榜 screen & PNG poster exporter per docs/DESIGN.md §3.7, §8.5, §8.6 (owner: pageant-ui).
// Shows full 5-row board, ★ count (1-3), formatted time, and 3 buttons:
// - 分享 (1200x800 PNG via canvas -> Web Share API w/ File, else download)
// - 再来一次 (new seed; board history kept, re-rank allowed)
// - 继续找 (return to world to hunt hidden contestants)

import { TIERS, ROSTER, FINALE_RIVAL, getContestantMeta } from '../data/roster.js';
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

  // Left / Top: Compact full 5-row Tier Wall
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
  titleEl.textContent = '🏆 最终排行榜';

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
  btnShare.innerHTML = `<span class="btn-icon">📤</span><span>分享</span>`;

  const btnReplay = document.createElement('button');
  btnReplay.type = 'button';
  btnReplay.id = 'btn-final-replay';
  btnReplay.className = 'mc-btn mc-btn-green final-action-btn';
  btnReplay.innerHTML = `<span class="btn-icon">🔄</span><span>再来一次</span>`;

  const btnHunt = document.createElement('button');
  btnHunt.type = 'button';
  btnHunt.id = 'btn-final-hunt';
  btnHunt.className = 'mc-btn mc-btn-blue final-action-btn';
  btnHunt.innerHTML = `<span class="btn-icon">🔍</span><span>继续找</span>`;

  actionsCol.append(btnShare, btnReplay, btnHunt);
  summaryPanel.append(headerCard, actionsCol);

  // Toast feedback on PNG save (decorative, `fx` in class so layout_audit skips)
  const toastEl = document.createElement('div');
  toastEl.className = 'final-toast-fx ui-hidden';
  toastEl.hidden = true;
  toastEl.textContent = '✅ 已保存图片';

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

  function populateFinalBoard() {
    for (const lane of finalRows.values()) lane.innerHTML = '';
    const board = ctx.state?.board || progress.load()?.board || {};
    for (const [cid, tierId] of Object.entries(board)) {
      const lane = finalRows.get(tierId);
      if (!lane) continue;
      const meta = getContestantMeta(cid) || FINALE_RIVAL;
      const chip = document.createElement('div');
      chip.className = 'final-mini-card';
      chip.dataset.contestantId = cid;
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
    g.font = '900 42px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText('我的世界：生物选美大赛', 60, 84);

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
      g.font = '900 32px "PingFang SC", "Microsoft YaHei", sans-serif';
      g.fillText(`${tier.icon} ${tier.label}`, 66, ry + 70);

      // Contestant portraits in this row (auto-fit up to all 12 contestants)
      const idsInRow = Object.entries(board)
        .filter(([, t]) => t === tier.id)
        .map(([cid]) => cid);

      const availW = W - 56 - 272;
      const stepX = idsInRow.length > 0 ? Math.min(104, Math.floor(availW / idsInRow.length)) : 104;
      const cardW = Math.min(94, Math.max(66, stepX - 6));

      for (let k = 0; k < idsInRow.length; k++) {
        const cid = idsInRow[k];
        const meta = getContestantMeta(cid) || FINALE_RIVAL;
        const cx = 272 + k * stepX;
        g.fillStyle = '#f8f6f0';
        g.fillRect(cx, ry + 8, cardW, 102);

        const img = await loadImg(cid, getPortraitURL(cid));
        if (img) {
          g.drawImage(img, cx + 5, ry + 12, cardW - 10, 70);
        } else {
          const tmp = document.createElement('canvas');
          tmp.width = 96;
          tmp.height = 96;
          drawContestantChibi2D(tmp.getContext('2d'), cid, [], 96, true);
          g.drawImage(tmp, cx + 5, ry + 12, cardW - 10, 70);
        }
        g.fillStyle = '#1e1e24';
        g.font = 'bold 15px "PingFang SC", sans-serif';
        g.textAlign = 'center';
        g.fillText(meta?.name || cid, cx + cardW / 2, ry + 102);
        g.textAlign = 'start';
      }
    }
    return canvas;
  }

  function showToast(msg = '✅ 已保存图片') {
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
            title: '我的世界：生物选美大赛',
          });
          showToast('✅ 已分享');
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
    showToast('✅ 已保存图片');
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
