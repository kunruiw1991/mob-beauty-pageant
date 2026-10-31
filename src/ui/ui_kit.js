// Shared pixel-art, procedural voxel thumbnails, chibi pixel portraits & iPad tap kit (owner: pageant-ui).
import { ROSTER, ROSTER_BY_ID, TIERS, ACCESSORIES_BY_ID, getContestantMeta } from '../data/roster.js';

export const MOB_ICONS = Object.freeze({
  sheep: '🐑',
  slime: '🟢',
  cat: '🐱',
  golem: '🤖',
  snow: '⛄',
  creeper: '💚',
  bee: '🐝',
  ender: '🔮',
  wither: '💀',
  villager: '💎',
  dragon: '🐉',
  pinksheep: '🌸',
  kai: '😜',
});

/**
 * Bind an iPad-safe tap handler per DESIGN.md §1:
 * - Primary: pointerup with 280 ms per-element debounce
 * - Fallback: click (suppressed if pointerup already fired within 380 ms)
 * - Unlocks WebAudio on first pointer interaction
 */
export function bindTap(el, handler, opts = {}) {
  if (!el || typeof handler !== 'function') return () => {};
  const debounceMs = opts.debounceMs ?? 280;
  let lastFireTime = -1000;
  let lastPointerUpTime = -1000;
  let downPos = null;

  const invoke = (ev) => {
    const now = performance.now();
    if (now - lastFireTime < debounceMs) return;
    lastFireTime = now;
    opts.ctx?.audio?.unlock?.();
    if (opts.sfx !== null) {
      const sfxName = opts.sfx || 'tap';
      opts.ctx?.events?.emit?.('sfx', { name: sfxName });
    }
    handler(ev);
  };

  const onPointerDown = (ev) => {
    if (ev.button !== undefined && ev.button > 0) return;
    opts.ctx?.audio?.unlock?.();
    downPos = { x: ev.clientX, y: ev.clientY };
    el.classList.add('is-pressed');
  };

  const clearPressed = () => {
    el.classList.remove('is-pressed');
  };

  const onPointerUp = (ev) => {
    clearPressed();
    if (ev.button !== undefined && ev.button > 0) return;
    if (downPos) {
      const dx = ev.clientX - downPos.x;
      const dy = ev.clientY - downPos.y;
      if (dx * dx + dy * dy > 36 * 36) {
        downPos = null;
        return;
      }
    }
    downPos = null;
    ev.preventDefault();
    ev.stopPropagation();
    lastPointerUpTime = performance.now();
    invoke(ev);
  };

  const onClick = (ev) => {
    if (performance.now() - lastPointerUpTime < 400) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    invoke(ev);
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', clearPressed);
  el.addEventListener('pointerleave', clearPressed);
  el.addEventListener('click', onClick);

  el._resetTapDebounce = () => {
    lastFireTime = -1000;
    lastPointerUpTime = -1000;
  };

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', clearPressed);
    el.removeEventListener('pointerleave', clearPressed);
    el.removeEventListener('click', onClick);
  };
}

export function clampCjk(str, maxChars = 12) {
  if (!str) return '';
  const cjkRe = /[\u4e00-\u9fff]/;
  let count = 0;
  let out = '';
  for (const ch of String(str)) {
    if (cjkRe.test(ch)) {
      if (count >= maxChars) break;
      count += 1;
    }
    out += ch;
  }
  return out;
}

export function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function computeStars(state) {
  if (!state) return 1;
  const board = state.board || {};
  const contestants = state.contestants || {};
  let mainRanked = 0;
  for (const c of ROSTER) {
    if (!c.hidden && board[c.id]) mainRanked += 1;
  }
  const hiddenIds = ROSTER.filter((c) => c.hidden).map((c) => c.id);
  const bothHidden =
    hiddenIds.length > 0 &&
    hiddenIds.every((hid) => Boolean(board[hid] || contestants[hid]?.found || contestants[hid]?.met));
  const elapsedMs = Number(state.elapsedMs ?? state.timeMs ?? 0);
  const underTime = elapsedMs > 0 ? elapsedMs <= 20 * 60 * 1000 : true;

  let stars = 0;
  if (mainRanked >= 10) stars += 1;
  if (bothHidden) stars += 1;
  if (mainRanked >= 10 && underTime) stars += 1;
  return Math.max(stars, Number(state.stars || 0));
}

// Cached procedural 16x16 voxel CSS textures
let cachedTextures = null;

export function getVoxelTextures() {
  if (cachedTextures) return cachedTextures;

  const makeTex = (drawFn) => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    drawFn(g);
    return `url(${c.toDataURL('image/png')})`;
  };

  // Stone brick / quartz wall frame
  const stoneBrick = makeTex((g) => {
    g.fillStyle = '#7c7e87';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#92959f';
    g.fillRect(1, 1, 6, 6);
    g.fillRect(9, 1, 6, 6);
    g.fillRect(1, 9, 10, 6);
    g.fillRect(13, 9, 2, 6);
    g.fillStyle = '#565861';
    g.fillRect(0, 7, 16, 1);
    g.fillRect(0, 15, 16, 1);
    g.fillRect(7, 0, 1, 8);
    g.fillRect(11, 8, 1, 8);
  });

  // Oak planks
  const oakPlank = makeTex((g) => {
    g.fillStyle = '#a87544';
    g.fillRect(0, 0, 16, 16);
    const rows = [0, 4, 8, 12];
    rows.forEach((y, i) => {
      g.fillStyle = i % 2 === 0 ? '#b6824f' : '#9e6c3c';
      g.fillRect(0, y, 16, 3);
      g.fillStyle = '#7a5028';
      g.fillRect(0, y + 3, 16, 1);
      g.fillRect((i * 5 + 3) % 15, y, 1, 3);
    });
  });

  // Quartz chiseled block
  const quartz = makeTex((g) => {
    g.fillStyle = '#ede9df';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#f8f6f0';
    g.fillRect(1, 1, 14, 14);
    g.fillStyle = '#d5cfc2';
    g.fillRect(2, 2, 12, 1);
    g.fillRect(2, 2, 1, 12);
    g.fillStyle = '#ffffff';
    g.fillRect(3, 13, 11, 1);
    g.fillRect(13, 3, 1, 11);
  });

  cachedTextures = { stoneBrick, oakPlank, quartz };
  return cachedTextures;
}

/**
 * Draw a crisp 3D-shaded voxel pixel-art thumbnail (16x16 grid scaled cleanly to canvas size >= 80px)
 * for any of the 16 ACCESSORIES ids in §4.
 */
export function drawAccessoryThumb(canvas, accId) {
  const size = canvas.width || 80;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, size, size);

  const px = (x, y, w, h, color) => {
    const s = size / 16;
    g.fillStyle = color;
    g.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(w * s), Math.ceil(h * s));
  };

  // Soft voxel studio slot shadow
  px(3, 13, 10, 2, 'rgba(0,0,0,0.22)');

  switch (accId) {
    case 'crown':
      px(2, 9, 12, 3, '#e09f1f');
      px(2, 6, 2, 4, '#ffd43b');
      px(7, 4, 2, 6, '#ffd43b');
      px(12, 6, 2, 4, '#ffd43b');
      px(4, 7, 3, 4, '#ffea70');
      px(9, 7, 3, 4, '#ffd43b');
      px(3, 9, 2, 2, '#e63946');
      px(7, 8, 2, 2, '#2ec4b6');
      px(11, 9, 2, 2, '#e63946');
      break;
    case 'flowerCrown':
      px(2, 8, 12, 3, '#3fae3a');
      px(3, 7, 3, 3, '#ff6b9d');
      px(4, 8, 1, 1, '#ffd43b');
      px(7, 6, 3, 3, '#fff0f6');
      px(8, 7, 1, 1, '#ff9f1c');
      px(11, 7, 3, 3, '#ff85c0');
      px(12, 8, 1, 1, '#ffd43b');
      px(2, 9, 2, 2, '#2b8a3e');
      px(13, 9, 2, 2, '#2b8a3e');
      break;
    case 'bow':
      px(2, 5, 5, 6, '#ff4d6d');
      px(3, 6, 3, 2, '#ff8fab');
      px(9, 5, 5, 6, '#e03155');
      px(10, 6, 3, 2, '#ff758f');
      px(6, 6, 4, 4, '#c9184a');
      px(7, 7, 2, 2, '#ffccd5');
      break;
    case 'strawHat':
      px(1, 9, 14, 3, '#e9c46a');
      px(3, 5, 10, 4, '#f4d58d');
      px(4, 4, 8, 2, '#faedcd');
      px(3, 8, 10, 2, '#e63946');
      px(1, 11, 14, 1, '#b58338');
      break;
    case 'topHat':
      px(1, 10, 14, 2, '#1d1e2c');
      px(4, 3, 8, 7, '#2b2d42');
      px(5, 4, 2, 5, '#414563');
      px(4, 8, 8, 2, '#e63946');
      break;
    case 'sunglasses':
      px(1, 6, 14, 2, '#11121a');
      px(2, 6, 5, 5, '#1d1e2c');
      px(9, 6, 5, 5, '#1d1e2c');
      px(3, 7, 2, 1, '#ffffff');
      px(4, 8, 1, 1, '#90e0ef');
      px(10, 7, 2, 1, '#ffffff');
      px(11, 8, 1, 1, '#90e0ef');
      break;
    case 'partyHat':
      px(7, 2, 2, 2, '#ffd43b');
      px(6, 4, 4, 2, '#4cc9f0');
      px(5, 6, 6, 2, '#f72585');
      px(4, 8, 8, 2, '#4cc9f0');
      px(3, 10, 10, 2, '#7209b7');
      break;
    case 'pumpkinHat':
      px(7, 2, 2, 2, '#3fae3a');
      px(3, 4, 10, 8, '#f77f00');
      px(5, 4, 2, 8, '#fc9e28');
      px(9, 4, 2, 8, '#d96500');
      px(4, 6, 2, 2, '#ffe66d');
      px(10, 6, 2, 2, '#ffe66d');
      px(5, 9, 6, 2, '#ffe66d');
      break;
    case 'slimeHat':
      px(3, 4, 10, 8, '#70e000');
      px(4, 5, 8, 6, '#9ef01a');
      px(5, 6, 6, 4, '#38b000');
      px(5, 7, 2, 2, '#1b4332');
      px(9, 7, 2, 2, '#1b4332');
      px(4, 5, 2, 1, '#ffffff');
      break;
    case 'beanie':
      px(6, 2, 4, 3, '#fff0f3');
      px(3, 5, 10, 5, '#ef476f');
      px(4, 6, 3, 3, '#ff758f');
      px(2, 9, 12, 3, '#c9184a');
      px(4, 9, 1, 3, '#ffccd5');
      px(8, 9, 1, 3, '#ffccd5');
      px(12, 9, 1, 3, '#ffccd5');
      break;
    case 'headphones':
      px(3, 3, 10, 2, '#4361ee');
      px(2, 5, 2, 4, '#4361ee');
      px(12, 5, 2, 4, '#4361ee');
      px(1, 7, 4, 5, '#3a0ca3');
      px(11, 7, 4, 5, '#3a0ca3');
      px(2, 8, 2, 3, '#4cc9f0');
      px(12, 8, 2, 3, '#4cc9f0');
      break;
    case 'halo':
      px(3, 5, 10, 2, '#ffd43b');
      px(2, 6, 2, 3, '#ffe66d');
      px(12, 6, 2, 3, '#ffe66d');
      px(3, 8, 10, 2, '#f59f00');
      px(7, 2, 2, 2, '#fff9db');
      px(1, 4, 1, 1, '#fff9db');
      px(14, 4, 1, 1, '#fff9db');
      break;
    case 'scarf':
      px(2, 6, 12, 4, '#e63946');
      px(3, 7, 10, 2, '#ff6b6b');
      px(9, 9, 4, 5, '#d62828');
      px(9, 11, 4, 1, '#ffd43b');
      px(9, 13, 1, 1, '#ffd43b');
      px(11, 13, 1, 1, '#ffd43b');
      break;
    case 'beret':
      px(8, 3, 2, 2, '#5a189a');
      px(2, 5, 11, 5, '#9b5de5');
      px(3, 6, 6, 2, '#c77dff');
      px(4, 10, 9, 2, '#5a189a');
      break;
    case 'starClip':
      px(7, 2, 2, 12, '#ffd166');
      px(2, 6, 12, 3, '#ffd166');
      px(4, 4, 8, 7, '#ffbe0b');
      px(6, 5, 4, 4, '#fff3b0');
      break;
    case 'chefHat':
      px(3, 3, 4, 5, '#ffffff');
      px(6, 2, 5, 6, '#f8f9fa');
      px(10, 3, 3, 5, '#e9ecef');
      px(4, 8, 8, 4, '#dee2e6');
      px(7, 4, 2, 2, '#ff4d6d');
      break;
    default: {
      const meta = ACCESSORIES_BY_ID[accId];
      px(3, 4, 10, 8, meta?.color || '#ffd43b');
      px(5, 6, 6, 4, '#ffffff');
      break;
    }
  }
}

function drawMiniHat(px, accId, ox, oy, scale = 1) {
  if (!accId) return;
  const s = (v) => Math.round(v * scale);
  const meta = ACCESSORIES_BY_ID[accId];
  const col = meta?.color || '#ffd43b';
  switch (accId) {
    case 'crown':
      px(ox - s(3), oy - s(2), s(6), s(2), '#ffd43b');
      px(ox - s(3), oy - s(4), s(1), s(2), '#ffd43b');
      px(ox, oy - s(4), s(1), s(2), '#ff4d6d');
      px(ox + s(2), oy - s(4), s(1), s(2), '#ffd43b');
      break;
    case 'flowerCrown':
      px(ox - s(4), oy - s(1), s(8), s(2), '#3fae3a');
      px(ox - s(3), oy - s(2), s(2), s(2), '#ff85c0');
      px(ox, oy - s(2), s(2), s(2), '#ffd43b');
      px(ox + s(2), oy - s(2), s(2), s(2), '#ffffff');
      break;
    case 'bow':
      px(ox - s(3), oy - s(3), s(3), s(3), '#ff4d6d');
      px(ox + s(1), oy - s(3), s(3), s(3), '#ff4d6d');
      px(ox - s(1), oy - s(2), s(2), s(2), '#c9184a');
      break;
    case 'sunglasses':
      px(ox - s(4), oy + s(3), s(8), s(1), '#11121a');
      px(ox - s(3), oy + s(3), s(3), s(2), '#11121a');
      px(ox + s(1), oy + s(3), s(3), s(2), '#11121a');
      break;
    case 'scarf':
      px(ox - s(4), oy + s(8), s(8), s(2), '#e63946');
      px(ox + s(1), oy + s(9), s(2), s(3), '#d62828');
      break;
    case 'halo':
      px(ox - s(3), oy - s(4), s(6), s(1), '#ffe66d');
      break;
    case 'topHat':
      px(ox - s(4), oy - s(1), s(8), s(1), '#1d1e2c');
      px(ox - s(3), oy - s(5), s(6), s(4), '#2b2d42');
      px(ox - s(3), oy - s(2), s(6), s(1), '#e63946');
      break;
    case 'strawHat':
      px(ox - s(5), oy - s(1), s(10), s(2), '#e9c46a');
      px(ox - s(3), oy - s(3), s(6), s(2), '#f4d58d');
      px(ox - s(3), oy - s(1), s(6), s(1), '#e63946');
      break;
    default:
      px(ox - s(3), oy - s(4), s(6), s(3), col);
      px(ox - s(2), oy - s(5), s(4), s(1), '#ffffff');
      break;
  }
}

/**
 * Draw chibi block-human contestant portrait per DESIGN.md §4 Look Bible onto a 2D context.
 * Grid: 24x24 virtual pixels scaled cleanly to `size` (e.g. 192 -> 8px per virtual pixel).
 */
export function drawContestantChibi2D(g, contestantId, accessories = [], size = 192, withBackdrop = false) {
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, size, size);

  const meta = getContestantMeta(contestantId) || ROSTER_BY_ID.sheep;
  const u = size / 24;
  const px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(w * u), Math.ceil(h * u));
  };

  if (withBackdrop) {
    // Cheerful pastel sky + pixel studio frame
    g.fillStyle = '#dff3ff';
    g.fillRect(0, 0, size, size);
    px(0, 18, 24, 6, '#95d5b2');
    px(0, 18, 24, 1, '#52b788');
    px(2, 2, 2, 2, '#ffffff');
    px(19, 3, 3, 2, '#ffffff');
  }

  const skin = '#ffdfc4';
  const blush = '#ff8fab';
  const pri = meta?.colors?.primary || '#fff8eb';
  const sec = meta?.colors?.secondary || '#ff9ebb';

  // Body & shoulders (chibi fully clothed)
  px(7, 15, 10, 8, pri);
  px(9, 16, 6, 7, sec);
  px(5, 15, 2, 6, pri);
  px(17, 15, 2, 6, pri);

  // Contestant-specific silhouettes & faces (§4 Look Bible)
  switch (contestantId) {
    case 'sheep': // 花花: wool-cube hood + flowers
      px(5, 4, 14, 11, '#fff8eb');
      px(6, 5, 12, 2, '#fffdf7');
      px(7, 7, 10, 8, skin);
      px(5, 5, 2, 2, '#ff85c0');
      px(17, 5, 2, 2, '#ffd43b');
      break;
    case 'slime': // 啵啵: translucent green jelly head with inner face
      px(5, 4, 14, 12, 'rgba(108, 224, 72, 0.78)');
      px(7, 6, 10, 9, '#9ef01a');
      px(6, 5, 3, 2, '#d8f3dc');
      break;
    case 'cat': // 喵喵: cat ears + tail
      px(6, 2, 3, 3, '#f4a261');
      px(15, 2, 3, 3, '#f4a261');
      px(7, 3, 1, 2, '#ff8fab');
      px(16, 3, 1, 2, '#ff8fab');
      px(6, 5, 12, 10, '#f4a261');
      px(7, 7, 10, 8, skin);
      px(19, 16, 2, 5, '#e76f51');
      break;
    case 'golem': // 铁铁: big iron shoulders + green vines
      px(3, 14, 18, 9, '#dcdcdc');
      px(4, 15, 2, 6, '#5fa85b');
      px(15, 16, 2, 5, '#5fa85b');
      px(6, 5, 12, 10, '#e5e5e5');
      px(7, 7, 10, 8, '#f5ebe0');
      px(18, 17, 2, 2, '#e63946'); // poppy
      break;
    case 'snow': // 雪宝: snowball body + pumpkin-orange hair
      px(6, 15, 12, 8, '#f0f7ff');
      px(11, 17, 2, 1, '#2b2d42');
      px(11, 20, 2, 1, '#2b2d42');
      px(6, 4, 12, 4, '#f77f00');
      px(6, 7, 12, 8, '#ffffff');
      break;
    case 'creeper': // 嘶嘶: creeper-pattern green hoodie
      px(5, 4, 14, 11, '#52b74a');
      px(6, 4, 3, 2, '#74c69d');
      px(14, 5, 3, 2, '#2d6a4f');
      px(7, 7, 10, 8, skin);
      break;
    case 'bee': // 嗡嗡: yellow/brown stripes + antennae + wings
      px(3, 15, 3, 4, '#caf0f8');
      px(18, 15, 3, 4, '#caf0f8');
      px(8, 2, 1, 3, '#3b2f2f');
      px(15, 2, 1, 3, '#3b2f2f');
      px(6, 5, 12, 10, '#ffd43b');
      px(6, 6, 12, 2, '#3b2f2f');
      px(7, 8, 10, 7, skin);
      px(7, 17, 10, 2, '#3b2f2f');
      px(7, 20, 10, 2, '#3b2f2f');
      break;
    case 'ender': // 小末: long dark hair, glowing pink-purple eyes + particles
      px(5, 4, 14, 14, '#1b1429');
      px(7, 7, 10, 8, '#2d2342');
      px(3, 7, 1, 1, '#d946ef');
      px(20, 9, 1, 1, '#d946ef');
      break;
    case 'wither': // 三三: black outfit + 2 small skull heads on shoulders!
      px(6, 5, 12, 10, '#2d2a32');
      px(7, 7, 10, 8, '#e2e8f0');
      // Left shoulder mini head
      px(1, 11, 5, 5, '#3f3d46');
      px(2, 13, 1, 1, '#60a5fa');
      px(4, 13, 1, 1, '#60a5fa');
      // Right shoulder mini head
      px(18, 11, 5, 5, '#3f3d46');
      px(19, 13, 1, 1, '#60a5fa');
      px(21, 13, 1, 1, '#60a5fa');
      break;
    case 'villager': // 翠翠: straw hat + emerald robe + cute nose
      px(4, 4, 16, 2, '#e9c46a');
      px(6, 2, 12, 2, '#f4d58d');
      px(6, 6, 12, 9, '#8d5b3c');
      px(7, 7, 10, 8, skin);
      px(11, 11, 2, 2, '#eebfa0');
      break;
    case 'dragon': // 龙宝宝: black-purple horns + wings
      px(2, 14, 4, 6, '#581c87');
      px(18, 14, 4, 6, '#581c87');
      px(6, 2, 2, 3, '#a855f7');
      px(16, 2, 2, 3, '#a855f7');
      px(6, 5, 12, 10, '#231934');
      px(7, 7, 10, 8, '#f3e8ff');
      break;
    case 'pinksheep': // 粉粉: fluffy pink wool
      px(5, 4, 14, 11, '#ff8fab');
      px(6, 5, 12, 2, '#ffb3c6');
      px(7, 7, 10, 8, skin);
      break;
    case 'kai': // 小凯: cyan tee + dark hair + mischievous grin
      px(6, 4, 12, 4, '#3d2b1f');
      px(6, 7, 12, 8, skin);
      px(7, 15, 10, 8, '#22b8cf');
      break;
    default:
      px(6, 5, 12, 10, pri);
      px(7, 7, 10, 8, skin);
      break;
  }

  // Big pixel eyes (2x2) + blush on every face
  const eyeColor =
    contestantId === 'ender' ? '#f0abfc' :
    contestantId === 'villager' ? '#10b981' :
    contestantId === 'dragon' ? '#c084fc' : '#1e1e24';
  px(8, 9, 2, 3, eyeColor);
  px(14, 9, 2, 3, eyeColor);
  px(8, 9, 1, 1, '#ffffff');
  px(14, 9, 1, 1, '#ffffff');
  px(7, 12, 2, 1, blush);
  px(15, 12, 2, 1, blush);

  // Cute smile (or mischievous grin for kai)
  if (contestantId === 'kai') {
    px(9, 13, 6, 1, '#1e1e24');
    px(13, 12, 2, 1, '#ffffff');
  } else {
    px(10, 13, 4, 1, '#d66875');
  }

  // Render worn accessories (wither supports 3 heads: center=0, left=1, right=2)
  const accList = Array.isArray(accessories) ? accessories.filter(Boolean) : [];
  if (contestantId === 'wither') {
    if (accList[0]) drawMiniHat(px, accList[0], 12, 5, 1);
    if (accList[1]) drawMiniHat(px, accList[1], 3, 11, 0.7);
    if (accList[2]) drawMiniHat(px, accList[2], 20, 11, 0.7);
  } else {
    for (const accId of accList) {
      drawMiniHat(px, accId, 12, 5, 1);
    }
  }
}
