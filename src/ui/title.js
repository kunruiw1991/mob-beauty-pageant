// Title screen module per docs/DESIGN.md §3.7, §8.7 (owner: pageant-ui).
// Adopts existing `#title` if present (iPad module-failure safety §1).
// Blocky pixel-style logo `我的世界：生物选美大赛`, ▶ >= 110px, 继续 when progress, 🏆.

import { GAME_TITLE, SUB_BANNER, UI } from '../data/strings.js';
import { bindTap, getVoxelTextures } from './ui_kit.js';
import { progress } from './progress.js';

export function createTitleUI(ctx = {}, hooks = {}) {
  let root = document.getElementById('title');
  if (!root) {
    root = document.createElement('div');
    root.id = 'title';
    document.body.appendChild(root);
  }

  const tex = getVoxelTextures();

  // Clear any static fallback HTML inside #title while keeping #title visible by default
  root.innerHTML = '';
  root.classList.add('title-screen');

  const vignette = document.createElement('div');
  vignette.className = 'title-vignette-bg';
  root.appendChild(vignette);

  // Top blocky pixel logo (`我的世界` + `生物选美大赛`)
  const logoWrap = document.createElement('div');
  logoWrap.id = 'title-logo';
  logoWrap.className = 'title-logo-wrap';
  logoWrap.innerHTML = `
    <div class="title-sub-banner" style="background-image: ${tex.stoneBrick};">
      <span class="title-sub-icon">⛏️</span>
      <span class="title-sub-text">${SUB_BANNER}</span>
      <span class="title-sub-icon">👑</span>
    </div>
    <div class="title-main-banner">
      <span class="title-deco title-deco-l">🌸</span>
      <h1 class="title-main-text">${GAME_TITLE}</h1>
      <span class="title-deco title-deco-r">💎</span>
    </div>
  `;
  root.appendChild(logoWrap);

  // Bottom chunky action dock
  const actionsDock = document.createElement('div');
  actionsDock.id = 'title-actions';
  actionsDock.className = 'title-actions-dock';

  const btnContinue = document.createElement('button');
  btnContinue.type = 'button';
  btnContinue.id = 'btn-title-continue';
  btnContinue.className = 'mc-btn mc-btn-blue title-continue-btn';
  btnContinue.innerHTML = `<span class="btn-icon">📂</span><span class="btn-label">${UI.continueBtn}</span>`;

  const btnPlay = document.createElement('button');
  btnPlay.type = 'button';
  btnPlay.id = 'btn-title-play';
  btnPlay.className = 'mc-btn mc-btn-green title-play-btn';
  btnPlay.setAttribute('aria-label', UI.playAria);
  btnPlay.innerHTML = `<span class="play-triangle">▶</span>`;

  const btnBoard = document.createElement('button');
  btnBoard.type = 'button';
  btnBoard.id = 'btn-title-board';
  btnBoard.className = 'mc-btn mc-btn-gold title-trophy-btn';
  btnBoard.setAttribute('aria-label', UI.boardAria);
  btnBoard.innerHTML = `<span class="btn-icon-lg">🏆</span>`;

  actionsDock.append(btnContinue, btnPlay, btnBoard);
  root.appendChild(actionsDock);

  function refresh() {
    const canResume = progress.hasProgress();
    btnContinue.hidden = !canResume;
    btnContinue.style.display = canResume ? '' : 'none';
    btnPlay._resetTapDebounce?.();
    btnContinue._resetTapDebounce?.();
    btnBoard._resetTapDebounce?.();
  }

  bindTap(btnPlay, () => {
    hooks.onPlay?.({ resume: false });
  }, { ctx, sfx: 'pop' });

  bindTap(btnContinue, () => {
    hooks.onContinue?.({ resume: true });
  }, { ctx, sfx: 'pop' });

  bindTap(btnBoard, () => {
    hooks.onOpenBoard?.();
  }, { ctx, sfx: 'tap' });

  refresh();

  return {
    el: root,
    show() {
      refresh();
      root.hidden = false;
      root.classList.remove('ui-hidden');
      if (ctx.state) ctx.state.scene = 'title';
      ctx.audio?.music?.('title');
    },
    hide() {
      root.hidden = true;
      root.classList.add('ui-hidden');
    },
    isVisible() {
      return !root.hidden && !root.classList.contains('ui-hidden');
    },
    refresh,
  };
}

export default createTitleUI;
