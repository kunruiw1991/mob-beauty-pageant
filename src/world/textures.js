import * as THREE from '../../vendor/three.module.min.js';
import { B } from './blocks.js';

const TILE = 16;
const COLS = 16;
const ROWS = 8; // 128 tile slots in a compact 256x128 canvas

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

export function createTextures() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  const tileIndex = new Map();
  let nextSlot = 0;

  function alloc(name, drawFn) {
    const slot = nextSlot++;
    const tx = (slot % COLS) * TILE;
    const ty = ((slot / COLS) | 0) * TILE;
    const img = g.createImageData(TILE, TILE);
    const data = img.data;
    const rnd = mulberry(slot * 7919 + 104729);

    const setPx = (x, y, r, gr, b, a = 255) => {
      if (x < 0 || x >= 16 || y < 0 || y >= 16) return;
      const i = (y * 16 + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(gr);
      data[i + 2] = clampByte(b);
      data[i + 3] = clampByte(a);
    };

    const fillNoise = (hex, variance = 14, alpha = 255) => {
      const [r, gr, b] = hexToRgb(hex);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const d = (rnd() - 0.5) * 2 * variance;
          setPx(x, y, r + d, gr + d, b + d, alpha);
        }
      }
    };

    const rect = (x0, y0, w, h, hex, a = 255, variance = 0) => {
      const [r, gr, b] = hexToRgb(hex);
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const d = variance ? (rnd() - 0.5) * 2 * variance : 0;
          setPx(x, y, r + d, gr + d, b + d, a);
        }
      }
    };

    drawFn({ setPx, fillNoise, rect, rnd, data });
    g.putImageData(img, tx, ty);
    tileIndex.set(name, slot);
    return slot;
  }

  // 0: grass_top
  alloc('grass_top', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x5ab841, 13);
    for (let i = 0; i < 32; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      if (rnd() > 0.5) setPx(x, y, 108, 206, 78);
      else setPx(x, y, 69, 152, 48);
    }
  });

  // dirt helper
  const paintDirt = ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x866043, 15);
    for (let i = 0; i < 28; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      if (rnd() > 0.45) setPx(x, y, 102, 71, 48);
      else setPx(x, y, 158, 118, 86);
    }
  };
  alloc('dirt', paintDirt);

  // grass_side
  alloc('grass_side', (api) => {
    paintDirt(api);
    const { setPx, rnd } = api;
    for (let x = 0; x < 16; x++) {
      const overhang = 3 + ((Math.sin(x * 1.3) * 1.5 + rnd() * 2) | 0);
      for (let y = 0; y < overhang; y++) {
        const d = (rnd() - 0.5) * 22;
        setPx(x, y, 90 + d, 184 + d, 65 + d);
      }
      setPx(x, overhang, 62, 118, 44);
    }
  });

  // stone
  alloc('stone', ({ setPx, rnd }) => {
    for (let y = 0; y < 16; y++) {
      const rowShift = ((rnd() - 0.5) * 12) | 0;
      for (let x = 0; x < 16; x++) {
        const streak = ((x + y * 3) % 5 === 0) ? -10 : 0;
        const v = 125 + rowShift + streak + ((rnd() - 0.5) * 14);
        setPx(x, y, v, v, v);
      }
    }
  });

  // cobble
  alloc('cobble', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x747474, 16);
    const cells = [
      [1, 1, 6, 5], [8, 1, 7, 6], [1, 7, 5, 4], [7, 8, 5, 4], [13, 8, 3, 5], [2, 12, 7, 4], [10, 13, 5, 3],
    ];
    for (const [cx, cy, cw, ch] of cells) {
      for (let y = cy; y < cy + ch; y++) {
        for (let x = cx; x < cx + cw; x++) {
          const edge = x === cx || y === cy ? 18 : x === cx + cw - 1 || y === cy + ch - 1 ? -24 : 0;
          const base = 122 + edge + ((rnd() - 0.5) * 12);
          setPx(x % 16, y % 16, base, base, base);
        }
      }
    }
  });

  // stone_bricks
  alloc('stone_bricks', ({ fillNoise, setPx }) => {
    fillNoise(0x808080, 9);
    for (let x = 0; x < 16; x++) {
      setPx(x, 0, 152, 152, 152);
      setPx(x, 7, 78, 78, 78);
      setPx(x, 8, 152, 152, 152);
      setPx(x, 15, 78, 78, 78);
    }
    for (let y = 0; y < 8; y++) {
      setPx(0, y, 148, 148, 148);
      setPx(15, y, 80, 80, 80);
    }
    for (let y = 8; y < 16; y++) {
      setPx(7, y, 80, 80, 80);
      setPx(8, y, 148, 148, 148);
    }
  });

  // sand
  alloc('sand', ({ fillNoise, setPx }) => {
    fillNoise(0xdfd5a2, 10);
    for (let y = 2; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) {
        setPx(x, (y + ((x >> 2) & 1)) % 16, 236, 228, 182);
      }
    }
  });

  // snow
  alloc('snow', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0xf4f9fd, 6);
    for (let i = 0; i < 18; i++) {
      setPx((rnd() * 16) | 0, (rnd() * 16) | 0, 218, 236, 250);
    }
  });

  // ice
  alloc('ice', ({ fillNoise, setPx }) => {
    fillNoise(0x8eb8fe, 8, 200);
    for (let i = 0; i < 16; i++) {
      setPx(i, (15 - i) % 16, 208, 232, 255, 225);
      setPx((i + 5) % 16, (15 - i) % 16, 185, 218, 255, 215);
    }
  });

  // water & swamp_water
  alloc('water', ({ fillNoise, rect }) => {
    fillNoise(0x2a66dc, 10, 190);
    rect(1, 3, 6, 1, 0x6ea8ff, 215);
    rect(8, 8, 6, 1, 0x6ea8ff, 215);
    rect(3, 13, 7, 1, 0x5c98f5, 205);
  });

  alloc('swamp_water', ({ fillNoise, rect }) => {
    fillNoise(0x3b5936, 10, 205);
    rect(2, 4, 5, 1, 0x5a7d4c, 220);
    rect(9, 10, 5, 1, 0x4e6e42, 220);
  });

  // Logs & Leaves
  const makeLogSide = (barkHex, streakHex) => ({ fillNoise, setPx, rnd }) => {
    fillNoise(barkHex, 10);
    const [sr, sg, sb] = hexToRgb(streakHex);
    for (let x = 0; x < 16; x += 3) {
      for (let y = 0; y < 16; y++) {
        const d = (rnd() - 0.5) * 14;
        setPx(x, y, sr + d, sg + d, sb + d);
      }
    }
  };
  const makeLogTop = (barkHex, coreHex, ringHex) => ({ rect, setPx }) => {
    rect(0, 0, 16, 16, barkHex, 255, 8);
    rect(2, 2, 12, 12, coreHex, 255, 6);
    const [rr, rg, rb] = hexToRgb(ringHex);
    for (let i = 4; i <= 11; i++) {
      setPx(i, 4, rr, rg, rb); setPx(i, 11, rr, rg, rb);
      setPx(4, i, rr, rg, rb); setPx(11, i, rr, rg, rb);
    }
    for (let i = 6; i <= 9; i++) {
      setPx(i, 6, rr, rg, rb); setPx(i, 9, rr, rg, rb);
      setPx(6, i, rr, rg, rb); setPx(9, i, rr, rg, rb);
    }
  };
  const makeLeaves = (baseHex, hiHex, holeProb = 0.2) => ({ setPx, rnd }) => {
    const [br, bg, bb] = hexToRgb(baseHex);
    const [hr, hg, hb] = hexToRgb(hiHex);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        if (!edge && rnd() < holeProb) {
          setPx(x, y, 0, 0, 0, 0);
        } else if (rnd() < 0.35) {
          setPx(x, y, hr, hg, hb, 255);
        } else {
          const d = (rnd() - 0.5) * 20;
          setPx(x, y, br + d, bg + d, bb + d, 255);
        }
      }
    }
  };

  alloc('oak_log_side', makeLogSide(0x6b5130, 0x4f3b21));
  alloc('oak_log_top', makeLogTop(0x6b5130, 0xb5915a, 0x8f6f3e));
  alloc('oak_leaves', makeLeaves(0x45992e, 0x62bd46, 0.2));

  alloc('spruce_log_side', makeLogSide(0x3b2713, 0x26180a));
  alloc('spruce_log_top', makeLogTop(0x3b2713, 0x7d5c34, 0x5c4122));
  alloc('spruce_leaves', makeLeaves(0x2d5c36, 0x42784d, 0.18));

  alloc('jungle_log_side', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x57441b, 10);
    for (let y = 1; y < 16; y += 3) {
      for (let x = 0; x < 16; x++) {
        if (rnd() > 0.25) setPx(x, y, 66, 82, 34);
      }
    }
  });
  alloc('jungle_log_top', makeLogTop(0x57441b, 0xa88454, 0x7d5e36));
  alloc('jungle_leaves', makeLeaves(0x3ba827, 0x68cf46, 0.22));

  // vines
  alloc('vines', ({ setPx, rnd }) => {
    for (let x = 1; x < 15; x += 3) {
      const len = 7 + ((rnd() * 9) | 0);
      for (let y = 0; y < len; y++) {
        const ox = x + (((y >> 1) + x) % 2);
        setPx(ox, y, 56, 142, 38, 255);
        if (y % 2 === 0) setPx(ox - 1, y, 78, 172, 54, 255);
      }
    }
  });

  // lily_pad
  alloc('lily_pad', ({ setPx, rnd }) => {
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        if (dx * dx + dy * dy <= 34 && !(x > 8 && Math.abs(y - 8) <= 1)) {
          const d = (rnd() - 0.5) * 18;
          setPx(x, y, 50 + d, 134 + d, 40 + d, 255);
        }
      }
    }
  });

  // Flowers (alpha cutout, stem anchored cleanly at bottom y=15)
  const makeFlower = (petalHex, centerHex, style = 'cup') => ({ rect, setPx }) => {
    // Stem + leaves
    rect(7, 8, 2, 8, 0x368f27);
    setPx(6, 12, 54, 152, 38);
    setPx(5, 11, 54, 152, 38);
    setPx(9, 13, 54, 152, 38);
    setPx(10, 12, 54, 152, 38);
    if (style === 'cup') {
      rect(5, 4, 6, 4, petalHex, 255, 10);
      setPx(5, 3, ...hexToRgb(petalHex));
      setPx(7, 3, ...hexToRgb(petalHex));
      setPx(8, 3, ...hexToRgb(petalHex));
      setPx(10, 3, ...hexToRgb(petalHex));
      rect(7, 5, 2, 2, centerHex);
    } else if (style === 'puff') {
      rect(4, 2, 8, 6, petalHex, 255, 16);
      rect(5, 1, 6, 8, petalHex, 255, 16);
      rect(6, 3, 4, 4, centerHex);
    } else {
      rect(4, 3, 8, 5, petalHex, 255, 12);
      rect(6, 2, 4, 7, petalHex, 255, 12);
      rect(7, 5, 2, 2, centerHex);
    }
  };
  alloc('poppy', makeFlower(0xe62e25, 0x2b1210, 'star'));
  alloc('dandelion', makeFlower(0xf7db1e, 0xffef7a, 'puff'));
  alloc('cornflower', makeFlower(0x3f6be8, 0xc9dcff, 'star'));
  alloc('allium', makeFlower(0xb862eb, 0xe8b8ff, 'puff'));
  alloc('pink_tulip', makeFlower(0xf47ec4, 0xffcae8, 'cup'));
  alloc('white_tulip', makeFlower(0xf2f6fa, 0xd8e8d5, 'cup'));

  // iron_ore
  alloc('iron_ore', ({ setPx, rnd }) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = 124 + ((rnd() - 0.5) * 16);
        setPx(x, y, v, v, v);
      }
    }
    const flecks = [[3, 3], [4, 4], [10, 2], [11, 3], [6, 8], [7, 8], [8, 9], [2, 11], [3, 12], [12, 11], [11, 12]];
    for (const [fx, fy] of flecks) {
      setPx(fx, fy, 224, 180, 148);
      setPx(fx + 1, fy, 198, 148, 116);
    }
  });

  // iron_block (gleaming brushed silver-white like video 1:25!)
  alloc('iron_block', ({ rect, setPx }) => {
    rect(0, 0, 16, 16, 0xe6e8eb, 255, 4);
    for (let y = 2; y < 15; y += 3) {
      rect(1, y, 14, 1, 0xd4d8de);
    }
    for (let i = 0; i < 16; i++) {
      setPx(i, 0, 250, 252, 255);
      setPx(0, i, 248, 250, 252);
      setPx(i, 15, 178, 182, 188);
      setPx(15, i, 178, 182, 188);
    }
  });

  // pumpkin & carved_pumpkin
  const paintPumpkinSide = ({ rect, setPx }) => {
    rect(0, 0, 16, 16, 0xe08419, 255, 10);
    for (const rx of [3, 7, 11, 15]) {
      for (let y = 0; y < 16; y++) setPx(rx, y, 182, 96, 14);
    }
  };
  alloc('pumpkin_side', paintPumpkinSide);
  alloc('pumpkin_top', ({ rect }) => {
    rect(0, 0, 16, 16, 0xe08419, 255, 10);
    rect(6, 6, 4, 4, 0x6b7d32);
  });
  alloc('carved_pumpkin_front', (api) => {
    paintPumpkinSide(api);
    const { rect } = api;
    // Cute classic MC carved eyes + grin
    rect(3, 4, 3, 3, 0x2b1506);
    rect(10, 4, 3, 3, 0x2b1506);
    rect(3, 10, 10, 3, 0x2b1506);
    rect(5, 10, 2, 1, 0xe08419);
    rect(9, 10, 2, 1, 0xe08419);
    rect(7, 12, 2, 1, 0xe08419);
  });

  // hay
  alloc('hay_side', ({ fillNoise, rect, setPx }) => {
    fillNoise(0xd8b629, 14);
    for (let x = 0; x < 16; x += 2) {
      for (let y = 0; y < 16; y++) setPx(x, y, 198, 162, 28);
    }
    rect(0, 4, 16, 2, 0xb83828);
    rect(0, 10, 16, 2, 0xb83828);
  });
  alloc('hay_top', ({ fillNoise }) => fillNoise(0xd4b126, 16));

  // farmland & wheat
  alloc('farmland_top', ({ fillNoise, rect }) => {
    fillNoise(0x573820, 10);
    for (let x = 1; x < 16; x += 4) rect(x, 0, 2, 16, 0x3d2514, 255, 6);
  });
  alloc('wheat', ({ rect }) => {
    for (const x of [2, 5, 8, 11, 13]) {
      rect(x, 4, 1, 12, 0xc9ab34, 255, 12);
      rect(x, 2, 2, 4, 0xe8c948, 255, 10);
    }
  });

  // glass
  alloc('glass', ({ rect, setPx }) => {
    rect(1, 1, 14, 14, 0xd8f4fc, 38);
    for (let i = 0; i < 16; i++) {
      setPx(i, 0, 215, 245, 255, 235);
      setPx(i, 15, 215, 245, 255, 235);
      setPx(0, i, 215, 245, 255, 235);
      setPx(15, i, 215, 245, 255, 235);
    }
    setPx(3, 3, 255, 255, 255, 230);
    setPx(4, 4, 255, 255, 255, 230);
    setPx(3, 5, 255, 255, 255, 200);
    setPx(11, 10, 255, 255, 255, 210);
    setPx(12, 11, 255, 255, 255, 210);
  });

  // wool
  alloc('wool_white', ({ fillNoise }) => fillNoise(0xf2f4f7, 9));
  alloc('wool_pink', ({ fillNoise }) => fillNoise(0xf48cb9, 11));

  // 5 tier concretes + 5 label accent tiles
  const tiers = [
    ['perfect', 0xc43bd8, 0x8e219e],
    ['gorgeous', 0x3b5bdb, 0x243da8],
    ['pretty', 0xf2c318, 0xc2980a],
    ['okay', 0xd9342b, 0xa11e17],
    ['tryhard', 0x3fae3a, 0x297d25],
  ];
  for (const [key, hex, darkHex] of tiers) {
    alloc(`concrete_${key}`, ({ fillNoise }) => fillNoise(hex, 4));
    alloc(`label_${key}`, ({ rect }) => {
      rect(0, 0, 16, 16, darkHex, 255, 4);
      rect(2, 2, 12, 12, hex, 255, 4);
    });
  }

  // quartz & smooth_stone
  alloc('quartz', ({ rect, setPx }) => {
    rect(0, 0, 16, 16, 0xf1ece3, 255, 5);
    for (let i = 0; i < 16; i++) {
      setPx(i, 0, 252, 250, 246);
      setPx(0, i, 252, 250, 246);
      setPx(i, 15, 216, 209, 198);
      setPx(15, i, 216, 209, 198);
    }
  });
  alloc('smooth_stone', ({ rect, setPx }) => {
    rect(0, 0, 16, 16, 0xa8a8a8, 255, 6);
    for (let i = 0; i < 16; i++) {
      setPx(i, 0, 122, 122, 122);
      setPx(0, i, 122, 122, 122);
      setPx(i, 15, 122, 122, 122);
      setPx(15, i, 122, 122, 122);
    }
  });

  // emerald_block & gold_block
  alloc('emerald_block', ({ rect }) => {
    rect(0, 0, 16, 16, 0x1cb853, 255, 6);
    rect(1, 1, 14, 14, 0x36e672);
    rect(3, 3, 10, 10, 0x19a349);
    rect(5, 5, 6, 6, 0x5eff93);
    rect(7, 7, 2, 2, 0xbaffd1);
  });
  alloc('gold_block', ({ rect, setPx }) => {
    rect(0, 0, 16, 16, 0xf7cf25, 255, 8);
    rect(2, 2, 12, 12, 0xffe34d, 255, 6);
    for (let i = 0; i < 16; i++) {
      setPx(i, 0, 255, 248, 166);
      setPx(0, i, 255, 248, 166);
      setPx(i, 15, 199, 146, 14);
      setPx(15, i, 199, 146, 14);
    }
  });

  // prismarine & honey_block & obsidian
  alloc('prismarine', ({ fillNoise, setPx }) => {
    fillNoise(0x5ba699, 16);
    for (let i = 0; i < 16; i++) {
      setPx(i, (i * 3) % 16, 52, 118, 108);
      setPx((i * 5 + 3) % 16, i, 120, 198, 184);
    }
  });
  alloc('honey_block', ({ rect }) => {
    rect(0, 0, 16, 16, 0xfbb93b, 215, 5);
    rect(2, 2, 12, 12, 0xe88e12, 242, 6);
    rect(3, 3, 4, 3, 0xffda75, 245);
  });
  alloc('obsidian', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x181026, 7);
    for (let i = 0; i < 26; i++) {
      setPx((rnd() * 16) | 0, (rnd() * 16) | 0, 58, 34, 92);
    }
  });

  // lava (animated slot!)
  const lavaSlot = alloc('lava', ({ rect }) => rect(0, 0, 16, 16, 0xf55d14));
  const lavaImg = g.createImageData(16, 16);
  function drawLavaFrame(phase) {
    const d = lavaImg.data;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = Math.sin(x * 0.55 + phase) + Math.cos(y * 0.55 - phase * 0.8) + Math.sin((x + y) * 0.4 + phase * 1.3);
        let r = 232, gr = 78, b = 14;
        if (v > 1.2) { r = 255; gr = 208; b = 48; }
        else if (v > 0.25) { r = 250; gr = 128; b = 20; }
        else if (v < -1.1) { r = 178; gr = 42; b = 8; }
        const i = (y * 16 + x) * 4;
        d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    const tx = (lavaSlot % COLS) * TILE;
    const ty = ((lavaSlot / COLS) | 0) * TILE;
    g.putImageData(lavaImg, tx, ty);
  }
  drawLavaFrame(0);

  // cobweb & iron_bars
  alloc('cobweb', ({ setPx }) => {
    for (let i = 0; i < 16; i++) {
      setPx(i, i, 240, 244, 248, 255);
      setPx(15 - i, i, 240, 244, 248, 255);
      if (i >= 2 && i <= 13) {
        setPx(7, i, 232, 236, 242, 255);
        setPx(i, 7, 232, 236, 242, 255);
      }
    }
    for (const r of [3, 6]) {
      for (let a = -r; a <= r; a++) {
        setPx(8 + a, 8 - r, 236, 240, 245, 255);
        setPx(8 + a, 8 + r, 236, 240, 245, 255);
        setPx(8 - r, 8 + a, 236, 240, 245, 255);
        setPx(8 + r, 8 + a, 236, 240, 245, 255);
      }
    }
  });

  alloc('iron_bars', ({ rect }) => {
    for (const bx of [2, 7, 12]) {
      rect(bx, 0, 2, 16, 0x9ea3a6);
      rect(bx, 0, 1, 16, 0xc5cbcf);
    }
    rect(0, 3, 16, 2, 0x8e9396);
    rect(0, 11, 16, 2, 0x8e9396);
  });

  // End & Nether blocks — MC-faithful pale creamy yellow (#dedb9c) organic porous End Stone noise
  alloc('end_stone', ({ setPx, rnd }) => {
    // Seamless 16x16 organic cellular noise around #dedb9c (222, 219, 156) — zero grid seams!
    const pits = [
      [2, 2, 2.1], [9, 3, 2.4], [14, 2, 1.8],
      [5, 7, 2.3], [12, 8, 2.2], [1, 10, 1.9],
      [7, 13, 2.4], [13, 14, 2.0], [3, 14, 1.7],
    ];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let minD = 99;
        for (const [px, py, pr] of pits) {
          for (const ox of [-16, 0, 16]) {
            for (const oy of [-16, 0, 16]) {
              const d = Math.hypot(x - (px + ox), y - (py + oy)) / pr;
              if (d < minD) minD = d;
            }
          }
        }
        const jitter = (rnd() - 0.5) * 12;
        let r = 224, gr = 221, b = 158; // #e0dd9e / #dedb9c
        if (minD < 0.62) {
          r = 196; gr = 192; b = 132; // soft porous pit
        } else if (minD > 0.98) {
          r = 237; gr = 234; b = 174; // pale ridge highlight
        }
        setPx(x, y, r + jitter, gr + jitter, b + jitter * 0.8);
      }
    }
  });
  alloc('end_portal_frame_top', ({ rect }) => {
    rect(0, 0, 16, 16, 0xd8dca0, 255, 8);
    rect(1, 1, 14, 14, 0x3b7866, 255, 8);
    rect(5, 5, 6, 6, 0x162d26);
    rect(6, 6, 4, 4, 0x62f5b5); // Eye of Ender!
    rect(7, 7, 2, 2, 0x102820);
  });
  alloc('end_portal_frame_side', ({ rect }) => {
    rect(0, 6, 16, 10, 0xd8dca0, 255, 8);
    rect(0, 0, 16, 7, 0x3b7866, 255, 8);
    rect(6, 0, 4, 3, 0x62f5b5);
  });

  alloc('netherrack', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0x6f2828, 18);
    for (let i = 0; i < 28; i++) {
      setPx((rnd() * 16) | 0, (rnd() * 16) | 0, 142, 54, 50);
    }
  });
  alloc('nether_brick', ({ fillNoise, setPx }) => {
    fillNoise(0x361920, 7);
    for (let y = 3; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) setPx(x, y, 28, 10, 14);
    }
    for (let y = 0; y < 16; y++) {
      const off = ((y >> 2) % 2) * 4;
      setPx((off + 3) % 16, y, 28, 10, 14);
      setPx((off + 11) % 16, y, 28, 10, 14);
    }
  });
  alloc('soul_sand', ({ fillNoise, rect }) => {
    fillNoise(0x544033, 12);
    // Spooky-cute sunken pixel faces
    rect(2, 3, 2, 2, 0x33241b);
    rect(6, 3, 2, 2, 0x33241b);
    rect(3, 6, 4, 2, 0x33241b);
    rect(10, 9, 2, 2, 0x33241b);
    rect(13, 9, 2, 2, 0x33241b);
    rect(11, 12, 3, 2, 0x33241b);
  });
  alloc('glowstone', ({ fillNoise, setPx, rnd }) => {
    fillNoise(0xc78d2c, 18);
    for (let i = 0; i < 42; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      if (rnd() > 0.4) setPx(x, y, 255, 240, 145);
      else setPx(x, y, 245, 198, 72);
    }
  });
  alloc('torch', ({ rect }) => {
    rect(7, 6, 2, 10, 0x8c6230);
    rect(7, 3, 2, 3, 0xffa629);
    rect(7, 2, 2, 2, 0xfff394);
  });

  // beehive, chest, bookshelf, planks, terracotta_orange, dragon_egg, cake
  const paintPlanks = ({ fillNoise, setPx }) => {
    fillNoise(0xb0894f, 10);
    for (const y of [3, 7, 11, 15]) {
      for (let x = 0; x < 16; x++) setPx(x, y, 132, 98, 52);
    }
    for (let y = 0; y < 16; y++) {
      const jx = (((y >> 2) * 7) + 5) % 16;
      setPx(jx, y, 132, 98, 52);
    }
  };
  alloc('planks', paintPlanks);

  alloc('beehive_side', ({ fillNoise, rect }) => {
    fillNoise(0xc99c4f, 9);
    for (const y of [3, 7, 11, 15]) rect(0, y, 16, 1, 0x9c7230);
  });
  alloc('beehive_front', ({ fillNoise, rect }) => {
    fillNoise(0xc99c4f, 9);
    for (const y of [3, 7, 11, 15]) rect(0, y, 16, 1, 0x9c7230);
    rect(5, 6, 6, 3, 0x3b240c);
    rect(6, 9, 4, 2, 0xf7b728); // dripping golden honey!
  });

  alloc('chest_side', ({ rect }) => {
    rect(0, 0, 16, 16, 0xb37b2e, 255, 8);
    rect(0, 5, 16, 2, 0x33261a);
    rect(0, 0, 16, 1, 0x6e4715);
    rect(0, 15, 16, 1, 0x6e4715);
  });
  alloc('chest_front', ({ rect }) => {
    rect(0, 0, 16, 16, 0xb37b2e, 255, 8);
    rect(0, 5, 16, 2, 0x33261a);
    rect(7, 4, 2, 4, 0xd9e0e6); // silver latch
  });
  alloc('chest_top', ({ rect }) => {
    rect(0, 0, 16, 16, 0x9e6a24, 255, 8);
    rect(2, 2, 12, 12, 0xb88035, 255, 6);
  });

  alloc('bookshelf_side', ({ rect, rnd }) => {
    rect(0, 0, 16, 16, 0xb0894f, 255, 6);
    rect(1, 2, 14, 5, 0x382616);
    rect(1, 9, 14, 5, 0x382616);
    const cols = [0xc9382e, 0x2e6bc9, 0x3aa646, 0xdba828, 0x8e3ec9, 0x2aa8a8];
    for (const sy of [2, 9]) {
      let x = 1;
      while (x < 14) {
        const w = 2;
        const c = cols[(rnd() * cols.length) | 0];
        rect(x, sy + (rnd() > 0.6 ? 1 : 0), w, 5 - (rnd() > 0.6 ? 1 : 0), c);
        x += w;
      }
    }
  });

  alloc('terracotta_orange', ({ fillNoise }) => fillNoise(0xc86428, 8));
  alloc('dragon_egg', ({ fillNoise, rect }) => {
    fillNoise(0x160a24, 6);
    rect(3, 4, 2, 2, 0xb833ff);
    rect(10, 6, 3, 2, 0xd46bff);
    rect(6, 11, 2, 2, 0x9d28eb);
    rect(11, 12, 2, 2, 0xb833ff);
  });
  alloc('cake_top', ({ rect }) => {
    rect(0, 0, 16, 16, 0xfaf5f5, 255, 4);
    rect(3, 3, 2, 2, 0xe02828);
    rect(10, 4, 2, 2, 0xe02828);
    rect(7, 8, 2, 2, 0xe02828);
    rect(4, 11, 2, 2, 0xe02828);
    rect(11, 11, 2, 2, 0xe02828);
  });
  alloc('cake_side', ({ rect }) => {
    rect(0, 8, 16, 8, 0xc9853b, 255, 8);
    rect(0, 0, 16, 8, 0xfaf5f5, 255, 4);
    rect(3, 8, 2, 2, 0xfaf5f5);
    rect(10, 8, 3, 2, 0xfaf5f5);
  });

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;

  const s = (name) => tileIndex.get(name) ?? 0;
  const all6 = (n) => {
    const idx = s(n);
    return [idx, idx, idx, idx, idx, idx];
  };
  const topBotSide = (top, bot, side) => [s(side), s(side), s(top), s(bot), s(side), s(side)];
  // Face order: 0:+X (east), 1:-X (west), 2:+Y (top), 3:-Y (bottom), 4:+Z (south), 5:-Z (north)
  const frontBlock = (top, bot, side, southFront) => [s(side), s(side), s(top), s(bot), s(southFront), s(side)];

  const faceMap = {
    [B.GRASS]: topBotSide('grass_top', 'dirt', 'grass_side'),
    [B.DIRT]: all6('dirt'),
    [B.STONE]: all6('stone'),
    [B.COBBLE]: all6('cobble'),
    [B.STONE_BRICKS]: all6('stone_bricks'),
    [B.SAND]: all6('sand'),
    [B.SNOW]: all6('snow'),
    [B.ICE]: all6('ice'),
    [B.WATER]: all6('water'),
    [B.SWAMP_WATER]: all6('swamp_water'),
    [B.OAK_LOG]: topBotSide('oak_log_top', 'oak_log_top', 'oak_log_side'),
    [B.OAK_LEAVES]: all6('oak_leaves'),
    [B.SPRUCE_LOG]: topBotSide('spruce_log_top', 'spruce_log_top', 'spruce_log_side'),
    [B.SPRUCE_LEAVES]: all6('spruce_leaves'),
    [B.JUNGLE_LOG]: topBotSide('jungle_log_top', 'jungle_log_top', 'jungle_log_side'),
    [B.JUNGLE_LEAVES]: all6('jungle_leaves'),
    [B.VINES]: all6('vines'),
    [B.LILY_PAD]: all6('lily_pad'),
    [B.POPPY]: all6('poppy'),
    [B.DANDELION]: all6('dandelion'),
    [B.CORNFLOWER]: all6('cornflower'),
    [B.ALLIUM]: all6('allium'),
    [B.PINK_TULIP]: all6('pink_tulip'),
    [B.WHITE_TULIP]: all6('white_tulip'),
    [B.IRON_ORE]: all6('iron_ore'),
    [B.IRON_BLOCK]: all6('iron_block'),
    [B.PUMPKIN]: topBotSide('pumpkin_top', 'pumpkin_top', 'pumpkin_side'),
    [B.CARVED_PUMPKIN]: frontBlock('pumpkin_top', 'pumpkin_top', 'pumpkin_side', 'carved_pumpkin_front'),
    [B.HAY]: topBotSide('hay_top', 'hay_top', 'hay_side'),
    [B.FARMLAND]: topBotSide('farmland_top', 'dirt', 'dirt'),
    [B.WHEAT]: all6('wheat'),
    [B.GLASS]: all6('glass'),
    [B.WOOL_WHITE]: all6('wool_white'),
    [B.WOOL_PINK]: all6('wool_pink'),
    [B.CONCRETE_PERFECT]: all6('concrete_perfect'),
    [B.CONCRETE_GORGEOUS]: all6('concrete_gorgeous'),
    [B.CONCRETE_PRETTY]: all6('concrete_pretty'),
    [B.CONCRETE_OKAY]: all6('concrete_okay'),
    [B.CONCRETE_TRYHARD]: all6('concrete_tryhard'),
    [B.LABEL_PERFECT]: all6('label_perfect'),
    [B.LABEL_GORGEOUS]: all6('label_gorgeous'),
    [B.LABEL_PRETTY]: all6('label_pretty'),
    [B.LABEL_OKAY]: all6('label_okay'),
    [B.LABEL_TRYHARD]: all6('label_tryhard'),
    [B.QUARTZ]: all6('quartz'),
    [B.SMOOTH_STONE]: all6('smooth_stone'),
    [B.EMERALD_BLOCK]: all6('emerald_block'),
    [B.GOLD_BLOCK]: all6('gold_block'),
    [B.PRISMARINE]: all6('prismarine'),
    [B.HONEY_BLOCK]: all6('honey_block'),
    [B.OBSIDIAN]: all6('obsidian'),
    [B.LAVA]: all6('lava'),
    [B.COBWEB]: all6('cobweb'),
    [B.IRON_BARS]: all6('iron_bars'),
    [B.END_STONE]: all6('end_stone'),
    [B.END_PORTAL_FRAME]: topBotSide('end_portal_frame_top', 'end_stone', 'end_portal_frame_side'),
    [B.NETHERRACK]: all6('netherrack'),
    [B.NETHER_BRICK]: all6('nether_brick'),
    [B.SOUL_SAND]: all6('soul_sand'),
    [B.GLOWSTONE]: all6('glowstone'),
    [B.TORCH]: all6('torch'),
    [B.BEEHIVE]: frontBlock('planks', 'planks', 'beehive_side', 'beehive_front'),
    [B.CHEST]: frontBlock('chest_top', 'chest_top', 'chest_side', 'chest_front'),
    [B.BOOKSHELF]: topBotSide('planks', 'planks', 'bookshelf_side'),
    [B.PLANKS]: all6('planks'),
    [B.TERRACOTTA_ORANGE]: all6('terracotta_orange'),
    [B.DRAGON_EGG]: all6('dragon_egg'),
    [B.CAKE]: topBotSide('cake_top', 'cake_side', 'cake_side'),
    [B.BLEACHER_LOW]: all6('planks'),
    [B.BLEACHER_HIGH]: all6('planks'),
  };

  const INSET_U = 0.08 / (COLS * TILE);
  const INSET_V = 0.08 / (ROWS * TILE);

  function tileUV(slot) {
    const col = slot % COLS;
    const row = (slot / COLS) | 0;
    const u0 = col / COLS + INSET_U;
    const u1 = (col + 1) / COLS - INSET_U;
    // Canvas y=0 is top -> Three.js v=1 is top
    const v1 = 1 - row / ROWS - INSET_V;
    const v0 = 1 - (row + 1) / ROWS + INSET_V;
    return [u0, v0, u1, v1];
  }

  // Precompute fast lookup table: blockId * 24 + face * 4 -> [u0, v0, u1, v1]
  const uvTable = new Float32Array(72 * 6 * 4);
  for (let id = 1; id < 72; id++) {
    const faces = faceMap[id];
    if (!faces) continue;
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = tileUV(faces[f]);
      const base = (id * 6 + f) * 4;
      uvTable[base] = u0;
      uvTable[base + 1] = v0;
      uvTable[base + 2] = u1;
      uvTable[base + 3] = v1;
    }
  }

  let lastLavaStep = -1;
  function update(simTime) {
    const step = Math.floor(simTime * 8);
    if (step !== lastLavaStep) {
      lastLavaStep = step;
      drawLavaFrame(step * 0.42);
      atlas.needsUpdate = true;
    }
  }

  return {
    atlas,
    canvas,
    uvTable,
    update,
  };
}
