// Pause menu & iris transition module per docs/DESIGN.md §3.7, §8.7 (owner: pageant-ui).
// Pause buttons: 继续, 音乐, 音效, 重新开始, 排行榜 (all >= 68 px, zero overlap at 4 viewports).

import { bindTap, getVoxelTextures } from './ui_kit.js';

export function createMenusUI(ctx = {}, hooks = {}) {
  const uiRoot = hooks.mountRoot || document.getElementById('ui') || document.body;
  const tex = getVoxelTextures();

  // 1. Iris wipe overlay (decorative transition, skipped by layout_audit via `iris-fx`)
  const irisEl = document.createElement('div');
  irisEl.id = 'iris-overlay';
  irisEl.className = 'iris-fx ui-hidden';
  irisEl.hidden = true;
  document.body.appendChild(irisEl);

  // 2. Pause modal overlay
  const pauseEl = document.createElement('div');
  pauseEl.id = 'pause-overlay';
  pauseEl.className = 'pause-overlay ui-hidden';
  pauseEl.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'pause-backdrop';

  const card = document.createElement('div');
  card.className = 'pause-card';
  card.style.backgroundImage = tex.stoneBrick;

  const btnResume = document.createElement('button');
  btnResume.type = 'button';
  btnResume.id = 'btn-pause-resume';
  btnResume.className = 'mc-btn mc-btn-green pause-btn-wide';
  btnResume.innerHTML = `<span class="btn-icon">▶</span><span>继续</span>`;

  const btnMusic = document.createElement('button');
  btnMusic.type = 'button';
  btnMusic.id = 'btn-pause-music';
  btnMusic.className = 'mc-btn mc-btn-blue pause-btn-cell';

  const btnSfx = document.createElement('button');
  btnSfx.type = 'button';
  btnSfx.id = 'btn-pause-sfx';
  btnSfx.className = 'mc-btn mc-btn-blue pause-btn-cell';

  const btnBoard = document.createElement('button');
  btnBoard.type = 'button';
  btnBoard.id = 'btn-pause-board';
  btnBoard.className = 'mc-btn mc-btn-gold pause-btn-cell';
  btnBoard.innerHTML = `<span class="btn-icon">🏆</span><span>排行榜</span>`;

  const btnRestart = document.createElement('button');
  btnRestart.type = 'button';
  btnRestart.id = 'btn-pause-restart';
  btnRestart.className = 'mc-btn mc-btn-red pause-btn-cell';
  btnRestart.innerHTML = `<span class="btn-icon">🔄</span><span>重新开始</span>`;

  const grid = document.createElement('div');
  grid.className = 'pause-grid';
  grid.append(btnResume, btnMusic, btnSfx, btnBoard, btnRestart);
  card.appendChild(grid);
  pauseEl.append(backdrop, card);
  uiRoot.appendChild(pauseEl);

  let paused = false;
  let musicMuted = false;
  let sfxMuted = false;
  let irisAnim = null;

  function syncAudioLabels() {
    btnMusic.innerHTML = `<span class="btn-icon">${musicMuted ? '🔇' : '🎵'}</span><span>音乐</span>`;
    btnMusic.classList.toggle('is-muted', musicMuted);
    btnSfx.innerHTML = `<span class="btn-icon">${sfxMuted ? '🔕' : '🔊'}</span><span>音效</span>`;
    btnSfx.classList.toggle('is-muted', sfxMuted);
  }
  syncAudioLabels();

  function setPausedState(next) {
    const target = next === undefined ? !paused : Boolean(next);
    paused = target;
    pauseEl.hidden = !paused;
    pauseEl.classList.toggle('ui-hidden', !paused);
    if (paused) {
      btnResume._resetTapDebounce?.();
      btnMusic._resetTapDebounce?.();
      btnSfx._resetTapDebounce?.();
      btnBoard._resetTapDebounce?.();
      btnRestart._resetTapDebounce?.();
      syncAudioLabels();
    }
    hooks.onPauseChange?.(paused);
    ctx.setPaused?.(paused);
    return paused;
  }

  bindTap(btnResume, () => setPausedState(false), { ctx, sfx: 'pop' });

  bindTap(btnMusic, () => {
    musicMuted = !musicMuted;
    ctx.audio?.setMuted?.({ music: musicMuted, sfx: sfxMuted });
    syncAudioLabels();
  }, { ctx, sfx: 'tap' });

  bindTap(btnSfx, () => {
    sfxMuted = !sfxMuted;
    ctx.audio?.setMuted?.({ music: musicMuted, sfx: sfxMuted });
    syncAudioLabels();
  }, { ctx, sfx: 'tap' });

  bindTap(btnBoard, () => {
    setPausedState(false);
    hooks.onOpenBoard?.();
  }, { ctx, sfx: 'tap' });

  bindTap(btnRestart, () => {
    setPausedState(false);
    hooks.onRestart?.();
  }, { ctx, sfx: 'pop' });

  function iris(dir = 'out') {
    const duration = 0.26;
    if (irisAnim?.resolve) {
      irisAnim.resolve();
      irisAnim = null;
    }
    irisEl.hidden = false;
    irisEl.classList.remove('ui-hidden', 'iris-in', 'iris-out');
    // Force style apply
    void irisEl.offsetWidth;
    irisEl.classList.add(dir === 'in' ? 'iris-in' : 'iris-out');

    return new Promise((resolve) => {
      irisAnim = {
        dir,
        elapsed: 0,
        duration,
        resolve: () => {
          if (dir === 'in') {
            irisEl.hidden = true;
            irisEl.classList.add('ui-hidden');
          }
          resolve();
        },
      };
    });
  }

  function update(dt) {
    if (!irisAnim) return;
    irisAnim.elapsed += dt;
    if (irisAnim.elapsed >= irisAnim.duration) {
      const done = irisAnim.resolve;
      irisAnim = null;
      done();
    }
  }

  return {
    pause: setPausedState,
    isPaused: () => paused,
    setMutedFlags({ music, sfx } = {}) {
      if (typeof music === 'boolean') musicMuted = music;
      if (typeof sfx === 'boolean') sfxMuted = sfx;
      syncAudioLabels();
    },
    iris,
    update,
    hide() {
      setPausedState(false);
      irisEl.hidden = true;
      irisEl.classList.add('ui-hidden');
      if (irisAnim?.resolve) {
        const r = irisAnim.resolve;
        irisAnim = null;
        r();
      }
    },
  };
}

export default createMenusUI;
