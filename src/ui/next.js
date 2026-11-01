// NEXT picture-frame reveal card per docs/DESIGN.md §3.7, §8.4 (video 06:20 & 08:30) (owner: pageant-ui).
// Shows oak item-frame holding the next contestant's pixel face + green `NEXT` badge + creeper-hoodie sleeves for 1.5 s.

import { getContestantMeta } from '../data/roster.js';
import { UI } from '../data/strings.js';
import { drawContestantChibi2D, getVoxelTextures, MOB_ICONS } from './ui_kit.js';

export function createNextUI(ctx = {}, hooks = {}) {
  const uiRoot = hooks.mountRoot || document.getElementById('ui') || document.body;
  const tex = getVoxelTextures();

  const overlay = document.createElement('div');
  overlay.id = 'next-overlay';
  overlay.className = 'next-overlay ui-hidden';
  overlay.hidden = true;

  const frameWrap = document.createElement('div');
  frameWrap.className = 'next-frame-wrap';

  const leftSleeve = document.createElement('div');
  leftSleeve.className = 'next-creeper-hand next-hand-left';

  const rightSleeve = document.createElement('div');
  rightSleeve.className = 'next-creeper-hand next-hand-right';

  const frameCard = document.createElement('div');
  frameCard.id = 'next-card';
  frameCard.className = 'next-item-frame';
  frameCard.style.backgroundImage = tex.oakPlank;

  const matting = document.createElement('div');
  matting.className = 'next-matting';

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 144;
  faceCanvas.height = 144;
  faceCanvas.className = 'next-face-canvas';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'next-badge-row';

  const nextPill = document.createElement('span');
  nextPill.className = 'next-green-pill';
  nextPill.textContent = UI.nextPill;

  const nameHint = document.createElement('span');
  nameHint.className = 'next-mob-hint';

  badgeRow.append(nextPill, nameHint);
  matting.append(faceCanvas, badgeRow);
  frameCard.appendChild(matting);
  frameWrap.append(leftSleeve, frameCard, rightSleeve);
  overlay.appendChild(frameWrap);
  uiRoot.appendChild(overlay);

  let activeSession = null;

  function finish() {
    if (!activeSession) return;
    const { resolve } = activeSession;
    activeSession = null;
    overlay.hidden = true;
    overlay.classList.add('ui-hidden');
    overlay.classList.remove('is-popping');
    resolve();
  }

  function show(contestantId) {
    if (activeSession) finish();
    if (!contestantId) return Promise.resolve();

    const meta = getContestantMeta(contestantId);
    const g = faceCanvas.getContext('2d');
    drawContestantChibi2D(g, contestantId, [], 144, false);
    nameHint.textContent = `${MOB_ICONS[contestantId] || '✨'} ${meta?.name || ''}`.trim();

    overlay.hidden = false;
    overlay.classList.remove('ui-hidden');
    overlay.classList.add('is-popping');

    ctx.events?.emit?.('sfx', { name: 'drumroll' });
    ctx.audio?.play?.('pop');

    return new Promise((resolve) => {
      activeSession = {
        contestantId,
        elapsed: 0,
        duration: 1.5,
        resolve,
      };
    });
  }

  function update(dt) {
    if (!activeSession) return;
    activeSession.elapsed += dt;
    if (activeSession.elapsed >= activeSession.duration) {
      finish();
    }
  }

  return {
    el: overlay,
    show,
    skip: finish,
    hide: finish,
    isActive: () => Boolean(activeSession),
    update,
  };
}

export default createNextUI;
