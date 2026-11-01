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
import { MYSTERY_HINTS, REACTION_CAPTIONS, UI } from '../data/strings.js';
import { bindTap, computeStars, drawContestantChibi2D, getVoxelTextures, MOB_ICONS } from './ui_kit.js';
import { renderPortrait } from './portrait.js';
import { progress } from './progress.js';

const REACTION_TEXT = Object.freeze(REACTION_CAPTIONS);

const HIDDEN_IDS = Object.freeze(['dragon', 'pinksheep']);

function drawPixelQuestionMark(g, ox, oy, scale, color = '#ffe64d', shadow = '#1b1c24') {
  const pts = [
    [1, 0, 4, 1],
    [0, 1, 2, 1],
    [4, 1, 2, 2],
    [2, 3, 3, 1],
    [2, 4, 2, 1],
    [2, 6, 2, 2],
  ];
  g.fillStyle = shadow;
  for (const [x, y, w, h] of pts) {
    g.fillRect(ox + x * scale + scale, oy + y * scale + scale, w * scale, h * scale);
  }
  g.fillStyle = color;
  for (const [x, y, w, h] of pts) {
    g.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
  }
}

function drawMysterySlotThumb(canvas, hiddenId) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.imageSmoothingEnabled = false;

  if (hiddenId === 'dragon') {
    g.fillStyle = '#1d1233';
    g.fillRect(0, 0, W, H);
    // Starry End motes
    g.fillStyle = '#a855f7';
    g.fillRect(6, 7, 3, 3);
    g.fillRect(46, 10, 3, 3);
    g.fillRect(10, 36, 2, 2);
    g.fillStyle = '#f0abfc';
    g.fillRect(44, 34, 3, 3);
    // Cute mystery dragon-horn silhouette
    g.fillStyle = '#0d0818';
    g.fillRect(16, 14, 24, 24);
    g.fillRect(13, 8, 6, 8);
    g.fillRect(37, 8, 6, 8);
    g.fillRect(8, 22, 8, 10);
    g.fillRect(40, 22, 8, 10);
    g.fillRect(14, 38, 28, 10);
    drawPixelQuestionMark(g, 20, 14, 3, '#ffe64d', '#581c87');
  } else {
    g.fillStyle = '#3b1d36';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff8fab';
    g.fillRect(7, 8, 3, 3);
    g.fillRect(45, 9, 3, 3);
    g.fillRect(9, 35, 3, 3);
    g.fillStyle = '#ffd6e0';
    g.fillRect(43, 35, 3, 3);
    // Cute mystery fluffy-sheep silhouette
    g.fillStyle = '#1c0d1a';
    g.fillRect(14, 11, 28, 26);
    g.fillRect(10, 16, 6, 14);
    g.fillRect(40, 16, 6, 14);
    g.fillRect(13, 37, 30, 11);
    drawPixelQuestionMark(g, 20, 14, 3, '#ffd6e0', '#800f2f');
  }
}

function drawSparklePx(g, cx, cy, s = 2, col = '#ffe64d') {
  g.fillStyle = col;
  g.fillRect(cx - s * 2, cy, s * 5, s);
  g.fillRect(cx, cy - s * 2, s, s * 5);
  g.fillStyle = '#ffffff';
  g.fillRect(cx, cy, s, s);
}

function drawRightArrowPx(g, x, y) {
  g.fillStyle = '#1b1c24';
  g.fillRect(x + 2, y + 10, 18, 10);
  g.fillRect(x + 16, y + 2, 4, 26);
  g.fillRect(x + 20, y + 6, 4, 18);
  g.fillRect(x + 24, y + 10, 4, 10);
  g.fillRect(x + 28, y + 13, 3, 4);

  g.fillStyle = '#ffe64d';
  g.fillRect(x, y + 8, 18, 10);
  g.fillRect(x + 14, y + 2, 4, 22);
  g.fillRect(x + 18, y + 6, 4, 14);
  g.fillRect(x + 22, y + 9, 4, 8);
  g.fillStyle = '#fff9bf';
  g.fillRect(x + 2, y + 9, 14, 4);
}

function drawMysteryHintCanvas(canvas, hiddenId) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);

  // Panel backgrounds (two 124x136 picture tiles + center arrow)
  const drawPanelFrame = (px, py, pw, ph, bg) => {
    g.fillStyle = '#1b1c24';
    g.fillRect(px - 3, py - 3, pw + 6, ph + 6);
    g.fillStyle = bg;
    g.fillRect(px, py, pw, ph);
  };

  if (hiddenId === 'dragon') {
    // LEFT PANEL: Minecraft End Portal (12 teal frame blocks + Eyes of Ender + starry void)
    const lx = 12;
    const ly = 12;
    drawPanelFrame(lx, ly, 124, 136, '#23322f');
    // Shrine stone-brick floor grid
    g.fillStyle = '#495057';
    g.fillRect(lx + 4, ly + 4, 116, 128);
    g.fillStyle = '#343a40';
    for (let gx = lx + 4; gx < lx + 120; gx += 20) g.fillRect(gx, ly + 4, 2, 128);
    for (let gy = ly + 4; gy < ly + 132; gy += 20) g.fillRect(lx + 4, gy, 116, 2);

    // Starry black-purple End portal void in center
    const vx = lx + 30;
    const vy = ly + 36;
    g.fillStyle = '#0b0418';
    g.fillRect(vx, vy, 64, 64);
    const stars = [
      [8, 10, '#e879f9'], [26, 18, '#ffffff'], [48, 12, '#c084fc'],
      [14, 38, '#74c0fc'], [34, 32, '#f0abfc'], [52, 42, '#ffffff'],
      [20, 52, '#e879f9'], [44, 54, '#a855f7'],
    ];
    for (const [sx, sy, col] of stars) {
      g.fillStyle = col;
      g.fillRect(vx + sx, vy + sy, 4, 4);
    }

    // 12 End Portal Frame blocks (3 per side) with Ender Eyes
    const drawPortalBlock = (bx, by) => {
      g.fillStyle = '#dedb9c';
      g.fillRect(bx, by, 20, 20);
      g.fillStyle = '#2b7a69';
      g.fillRect(bx + 2, by + 2, 16, 16);
      // Glowing Eye of Ender
      g.fillStyle = '#1b4332';
      g.fillRect(bx + 5, by + 5, 10, 10);
      g.fillStyle = '#80ed99';
      g.fillRect(bx + 6, by + 6, 8, 8);
      g.fillStyle = '#d8f3dc';
      g.fillRect(bx + 8, by + 7, 3, 5);
    };
    for (let i = 0; i < 3; i++) {
      drawPortalBlock(vx + i * 22, vy - 20); // North
      drawPortalBlock(vx + i * 22, vy + 64); // South
      drawPortalBlock(vx - 20, vy + i * 22); // West
      drawPortalBlock(vx + 64, vy + i * 22); // East
    }

    // CENTER ARROW
    drawRightArrowPx(g, 146, 66);

    // RIGHT PANEL: Dragon Egg atop Obsidian Pillar on pale-yellow End Stone (#dedb9c)
    const rx = 184;
    const ry = 12;
    drawPanelFrame(rx, ry, 124, 136, '#120824');
    // Starry End sky
    g.fillStyle = '#c084fc';
    g.fillRect(rx + 12, ry + 16, 3, 3);
    g.fillRect(rx + 104, ry + 22, 3, 3);
    g.fillStyle = '#ffffff';
    g.fillRect(rx + 22, ry + 42, 2, 2);
    g.fillRect(rx + 96, ry + 48, 3, 3);

    // Pale-yellow End Stone island base
    g.fillStyle = '#dedb9c';
    g.fillRect(rx + 10, ry + 112, 104, 20);
    g.fillStyle = '#c5c17d';
    g.fillRect(rx + 18, ry + 118, 12, 6);
    g.fillRect(rx + 56, ry + 120, 16, 6);
    g.fillRect(rx + 88, ry + 116, 14, 6);

    // Tall Obsidian Pillar
    g.fillStyle = '#241838';
    g.fillRect(rx + 40, ry + 66, 44, 48);
    g.fillStyle = '#3b2764';
    g.fillRect(rx + 44, ry + 70, 8, 40);
    g.fillRect(rx + 64, ry + 76, 6, 34);
    g.fillStyle = '#581c87';
    g.fillRect(rx + 40, ry + 66, 44, 4);

    // Tiered Voxel Dragon Egg + glowing violet aura rim + magenta spots
    const ex = rx + 44;
    const ey = ry + 22;
    g.fillStyle = '#9333ea';
    g.fillRect(ex + 10, ey - 2, 16, 6);
    g.fillRect(ex + 4, ey + 4, 28, 12);
    g.fillRect(ex, ey + 14, 36, 20);
    g.fillRect(ex + 4, ey + 32, 28, 12);
    g.fillStyle = '#0d0818';
    g.fillRect(ex + 12, ey, 12, 6);
    g.fillRect(ex + 6, ey + 6, 24, 10);
    g.fillRect(ex + 2, ey + 16, 32, 16);
    g.fillRect(ex + 6, ey + 32, 24, 10);
    g.fillStyle = '#2e1a4a';
    g.fillRect(ex + 8, ey + 8, 8, 22);
    // Magenta Dragon Egg spots
    g.fillStyle = '#e879f9';
    g.fillRect(ex + 14, ey + 8, 6, 6);
    g.fillRect(ex + 6, ey + 20, 6, 6);
    g.fillRect(ex + 22, ey + 18, 6, 6);
    g.fillRect(ex + 14, ey + 30, 6, 6);
    g.fillStyle = '#fae8ff';
    g.fillRect(ex + 16, ey + 10, 2, 2);

    drawSparklePx(g, rx + 26, ry + 28, 2, '#ffe64d');
    drawSparklePx(g, rx + 96, ry + 32, 2, '#f0abfc');
    drawSparklePx(g, rx + 88, ry + 16, 2, '#ffe64d');
  } else {
    // LEFT PANEL: Sparkling Pink Tulip on Jungle-Edge Grass
    const lx = 12;
    const ly = 12;
    drawPanelFrame(lx, ly, 124, 136, '#74c0fc');
    // Jungle foliage backdrop silhouette on left edge
    g.fillStyle = '#2b6e28';
    g.fillRect(lx + 4, ly + 8, 28, 56);
    g.fillRect(lx + 32, ly + 16, 14, 28);
    g.fillStyle = '#40913b';
    g.fillRect(lx + 8, ly + 14, 16, 22);

    // Grass + dirt block base
    g.fillStyle = '#58b83f';
    g.fillRect(lx + 4, ly + 98, 116, 14);
    g.fillStyle = '#7c5334';
    g.fillRect(lx + 4, ly + 112, 116, 20);
    g.fillStyle = '#5c3b23';
    g.fillRect(lx + 18, ly + 118, 14, 8);
    g.fillRect(lx + 78, ly + 120, 16, 8);

    // Stem + leaves
    g.fillStyle = '#2ea44f';
    g.fillRect(lx + 60, ly + 64, 8, 36);
    g.fillRect(lx + 46, ly + 78, 14, 8);
    g.fillRect(lx + 68, ly + 72, 14, 8);

    // Vivid 3-petal Pixel Pink Tulip
    const tx = lx + 42;
    const ty = ly + 26;
    g.fillStyle = '#ff4d94';
    g.fillRect(tx, ty + 6, 12, 28);
    g.fillRect(tx + 16, ty, 12, 34);
    g.fillRect(tx + 32, ty + 6, 12, 28);
    g.fillRect(tx + 4, ty + 24, 36, 16);
    g.fillStyle = '#ff8fab';
    g.fillRect(tx + 4, ty + 10, 6, 20);
    g.fillRect(tx + 18, ty + 4, 8, 24);
    g.fillRect(tx + 34, ty + 10, 6, 20);
    g.fillStyle = '#ffe5ec';
    g.fillRect(tx + 20, ty + 6, 4, 10);

    drawSparklePx(g, lx + 28, ly + 36, 2, '#ffe64d');
    drawSparklePx(g, lx + 100, ly + 28, 2, '#ffe64d');
    drawSparklePx(g, lx + 98, ly + 62, 2, '#ffffff');

    // CENTER ARROW
    drawRightArrowPx(g, 146, 66);

    // RIGHT PANEL: White Sheep + Pink Puff -> Pink Sheep!
    const rx = 184;
    const ry = 12;
    drawPanelFrame(rx, ry, 124, 136, '#8ce99a');
    // Meadow sky + grass
    g.fillStyle = '#a5d8ff';
    g.fillRect(rx + 4, ry + 4, 116, 94);
    g.fillStyle = '#58b83f';
    g.fillRect(rx + 4, ry + 98, 116, 34);

    // Cute White-to-Pink Sheep (left half creamy white wool, right half blushing pink wool + sparkles!)
    const sx = rx + 26;
    const sy = ry + 32;
    // Legs
    g.fillStyle = '#8d6e63';
    g.fillRect(sx + 14, sy + 56, 10, 16);
    g.fillRect(sx + 48, sy + 56, 10, 16);
    // Fluffy wool body (half white #fff8eb, half pink #ff8fab showing dye transformation!)
    g.fillStyle = '#1b1c24';
    g.fillRect(sx + 4, sy + 6, 64, 52);
    g.fillStyle = '#fff8eb';
    g.fillRect(sx + 8, sy + 10, 28, 44);
    g.fillStyle = '#ff8fab';
    g.fillRect(sx + 36, sy + 10, 28, 44);
    g.fillStyle = '#ffb3c6';
    g.fillRect(sx + 42, sy + 14, 18, 12);

    // Cute MC Sheep Face in center
    g.fillStyle = '#ffe0c8';
    g.fillRect(sx + 20, sy + 20, 32, 26);
    // Eyes
    g.fillStyle = '#2b2238';
    g.fillRect(sx + 24, sy + 28, 6, 6);
    g.fillRect(sx + 42, sy + 28, 6, 6);
    g.fillStyle = '#ffffff';
    g.fillRect(sx + 24, sy + 28, 2, 2);
    g.fillRect(sx + 42, sy + 28, 2, 2);
    // Pink nose/blush
    g.fillStyle = '#ff4d94';
    g.fillRect(sx + 33, sy + 36, 6, 5);

    // Pink heart + sparkles above sheep
    g.fillStyle = '#ff4d94';
    g.fillRect(rx + 84, ry + 16, 6, 6);
    g.fillRect(rx + 92, ry + 16, 6, 6);
    g.fillRect(rx + 82, ry + 20, 18, 6);
    g.fillRect(rx + 86, ry + 26, 10, 4);
    g.fillRect(rx + 89, ry + 30, 4, 3);
    drawSparklePx(g, rx + 22, ry + 22, 2, '#ffe64d');
    drawSparklePx(g, rx + 102, ry + 48, 2, '#ff4d94');
  }
}

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
  closeBtn.setAttribute('aria-label', UI.back);
  closeBtn.innerHTML = `<span class="btn-icon">✔</span><span>${UI.done}</span>`;

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

  // 2b. Hidden-contestant "?" mystery slots (#172 Q3: appear after quest 5; tap -> picture hint)
  const mysteryBox = document.createElement('div');
  mysteryBox.id = 'board-mystery-box';
  mysteryBox.className = 'board-mystery-box ui-hidden';
  mysteryBox.hidden = true;

  const mysteryButtons = new Map();
  for (const hid of HIDDEN_IDS) {
    const mBtn = document.createElement('button');
    mBtn.type = 'button';
    mBtn.id = `mystery-slot-${hid}`;
    mBtn.className = 'mc-btn board-mystery-btn';
    mBtn.dataset.mysteryId = hid;
    mBtn.setAttribute('aria-label', UI.secretHintTitle);
    mBtn.style.backgroundImage = tex.quartz;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 56;
    thumbCanvas.height = 48;
    thumbCanvas.className = 'board-mystery-thumb';
    drawMysterySlotThumb(thumbCanvas, hid);

    const qLabel = document.createElement('span');
    qLabel.className = 'board-mystery-label';
    qLabel.textContent = '✨ ?';

    mBtn.append(thumbCanvas, qLabel);
    mysteryBox.appendChild(mBtn);
    mysteryButtons.set(hid, mBtn);
  }

  sidePanel.append(closeBtn, trayBox, mysteryBox);

  // 2c. Picture-hint Item-Frame Modal when tapping a "?" mystery slot (#172 Q3)
  const hintModal = document.createElement('div');
  hintModal.id = 'board-hint-modal';
  hintModal.className = 'board-hint-modal ui-hidden';
  hintModal.hidden = true;

  const hintBackdrop = document.createElement('div');
  hintBackdrop.className = 'board-hint-backdrop';

  const hintCard = document.createElement('div');
  hintCard.className = 'board-hint-card';
  hintCard.style.backgroundImage = tex.oakPlank;

  const hintMatting = document.createElement('div');
  hintMatting.className = 'board-hint-matting';
  hintMatting.style.backgroundImage = tex.quartz;

  const hintCanvas = document.createElement('canvas');
  hintCanvas.id = 'board-hint-canvas';
  hintCanvas.width = 320;
  hintCanvas.height = 160;
  hintCanvas.className = 'board-hint-canvas';

  const hintCaption = document.createElement('div');
  hintCaption.id = 'board-hint-caption';
  hintCaption.className = 'board-hint-caption';

  const hintCloseBtn = document.createElement('button');
  hintCloseBtn.type = 'button';
  hintCloseBtn.id = 'board-hint-close-btn';
  hintCloseBtn.className = 'mc-btn mc-btn-green board-hint-close-btn';
  hintCloseBtn.innerHTML = `<span class="btn-icon">✔</span><span>${UI.gotIt}</span>`;

  hintMatting.append(hintCanvas, hintCaption, hintCloseBtn);
  hintCard.appendChild(hintMatting);
  hintModal.append(hintBackdrop, hintCard);

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
  overlay.append(backdrop, shell, hintModal, reactionBanner, ghostHand, dragProxy);
  uiRoot.appendChild(overlay);

  let session = null;
  let dragState = null;

  function hideHintModal() {
    if (!hintModal.hidden) {
      hintModal.hidden = true;
      hintModal.classList.add('ui-hidden');
    }
    delete hintModal.dataset.mysteryId;
    if (session && session.phase !== 'reaction') {
      shell.classList.remove('ui-hidden');
    }
  }

  function openHintModal(hiddenId) {
    drawMysteryHintCanvas(hintCanvas, hiddenId);
    hintModal.dataset.mysteryId = hiddenId;
    hintCaption.textContent =
      hiddenId === 'dragon' ? MYSTERY_HINTS.dragon : MYSTERY_HINTS.pinksheep;
    hintCloseBtn._resetTapDebounce?.();
    hideGhostHand();
    shell.classList.add('ui-hidden');
    hintModal.hidden = false;
    hintModal.classList.remove('ui-hidden');
  }

  for (const [hid, mBtn] of mysteryButtons.entries()) {
    bindTap(mBtn, () => {
      openHintModal(hid);
    }, { ctx, sfx: 'pop' });
  }
  bindTap(hintCloseBtn, () => {
    hideHintModal();
  }, { ctx, sfx: 'tap' });
  hintBackdrop.addEventListener('pointerup', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ctx.events?.emit?.('sfx', { name: 'tap' });
    hideHintModal();
  });
  hintBackdrop.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    hideHintModal();
  });

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

    for (const { cardsLane } of rowMap.values()) {
      cardsLane.classList.toggle('is-crowded', cardsLane.children.length >= 7);
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

    // #172 Q3: Show "?" mystery slots after quest 5 for any unranked hidden contestant
    const saved = progress.load() || {};
    let doneMainCount = 0;
    for (const entry of ROSTER) {
      if (entry.hidden) continue;
      if (
        ctx.state?.quests?.[entry.id]?.status === 'done' ||
        Boolean(boardState[entry.id]) ||
        Boolean(saved?.questsDone?.[entry.id]) ||
        Boolean(saved?.board?.[entry.id]) ||
        newId === entry.id
      ) {
        doneMainCount += 1;
      }
    }

    let visibleMysteryCount = 0;
    const allowMystery = doneMainCount >= 5 && session?.phase !== 'reaction';
    for (const [hid, mBtn] of mysteryButtons.entries()) {
      const alreadyKnown = Boolean(boardState[hid]) || newId === hid;
      const showSlot = allowMystery && !alreadyKnown;
      mBtn.hidden = !showSlot;
      mBtn.style.display = showSlot ? '' : 'none';
      if (showSlot) {
        mBtn._resetTapDebounce?.();
        visibleMysteryCount += 1;
      }
    }
    mysteryBox.hidden = visibleMysteryCount === 0;
    mysteryBox.classList.toggle('ui-hidden', visibleMysteryCount === 0);
    mysteryBox.style.display = visibleMysteryCount > 0 ? '' : 'none';
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
    hideHintModal();
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

    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const sx = Math.max(8, Math.min(vw - 56, Math.round(r0.left + r0.width * 0.5 - 24)));
    const sy = Math.max(8, Math.min(vh - 52, Math.round(r0.top + r0.height * 0.5 - 16)));
    const ex = Math.max(8, Math.min(vw - 56, Math.round(r1.left + Math.min(220, r1.width * 0.55))));
    const ey = Math.max(8, Math.min(vh - 52, Math.round(r1.top + r1.height * 0.5 - 16)));

    ghostHand.style.setProperty('--gh-x0', `${sx}px`);
    ghostHand.style.setProperty('--gh-y0', `${sy}px`);
    ghostHand.style.setProperty('--gh-x1', `${ex}px`);
    ghostHand.style.setProperty('--gh-y1', `${ey}px`);
    ghostHand.hidden = false;
    ghostHand.classList.remove('ui-hidden');
  }

  window.addEventListener('resize', () => {
    if (!ghostHand.hidden) {
      requestAnimationFrame(() => {
        if (!ghostHand.hidden) positionGhostHand();
      });
    }
  });

  function cancelSession() {
    const pendingResolve = session?.resolve;
    session = null;
    dragState = null;

    clearRowHighlights();
    hideGhostHand();
    hideHintModal();
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

      hooks.onOpen?.();
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
    drop: (contestantId, tier) => {
      if (tier === undefined && TIERS_BY_ID[contestantId]) {
        return commitDrop(session?.newId, contestantId);
      }
      return commitDrop(contestantId || session?.newId, tier);
    },
    continue: () => finishSession(),
    hide: () => finishSession(),
    cancel: cancelSession,
    restoreWallFromProgress,
    isActive: () => Boolean(session) || (!overlay.hidden && !overlay.classList.contains('ui-hidden')),
    update,
  };
}

export default createBoardUI;
