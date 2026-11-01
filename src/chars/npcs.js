import { fillNoiseRect } from './skins.js';
import { NPC_NAMES } from '../data/strings.js';

function px(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/**
 * 4 NPCs per docs/DESIGN.md §4 Look Bible & video reference:
 * - player (阿辰): green creeper hoodie hood-up, brown hair bang, black pants
 * - kai (小凯): cyan tee, dark spiky hair, mischievous grin (+ toggleable finale/cake/snow props)
 * - bela (贝拉): orange fox hoodie with fox ears, white belly patch, fox tail
 * - mystery (问号先生): crisp white suit with '?' on chest, black head with '?'
 */
export const NPC_SPECS = {
  player: {
    name: NPC_NAMES.player,
    hairColor: '#57e32c',
    bodyColor: '#57e32c',
    sleeveColor: '#57e32c',
    pantsColor: '#18181b',
    shoeColor: '#f8f9fa',
    skinColor: '#ffe0c4',
    swatches: ['#57e32c', '#18181b', '#38b000', '#4a321f', '#2d9300', '#111116'],
    face: {
      skin: '#ffe0c4', hair: '#57e32c', innerHair: '#4a321f', bangs: 'hood',
      eye: '#18181b', blush: '#ff8e9e', mouth: 'smile', tallEyes: false,
    },
    paintSkin(g) {
      // Bright lime hoodie + dark 'C' / creeper motif on chest + black/lime striped sleeves (exact video 00:50!)
      px(g, 4, 20, 6, 7, '#57e32c');
      px(g, 5, 20, 4, 1, '#38b000');
      px(g, 5, 21, 3, 1, '#18181b');
      px(g, 5, 22, 1, 3, '#18181b');
      px(g, 5, 25, 3, 1, '#18181b');
      // Creeper face on back of hoodie!
      px(g, 15, 21, 1, 2, '#18181b');
      px(g, 18, 21, 1, 2, '#18181b');
      px(g, 16, 23, 2, 2, '#18181b');
      // Black stripes on sleeves (video 00:05 first-person arm!)
      px(g, 20, 20, 12, 1, '#18181b');
      px(g, 20, 22, 12, 1, '#18181b');
    },
    extraParts({ headBoxes, buildSwatchBox }) {
      // Hood-up rim around head + brown hair bang tuft peeking under hood
      headBoxes.push(buildSwatchBox(1.08, 0.14, 1.06, 32, 16, 8, 8, 0, 0.96, -0.02));
      headBoxes.push(buildSwatchBox(1.08, 0.86, 0.24, 32, 16, 8, 8, 0, 0.50, -0.42));
      headBoxes.push(buildSwatchBox(0.56, 0.14, 0.12, 56, 16, 8, 8, 0, 0.84, 0.48));
    },
  },

  kai: {
    name: NPC_NAMES.kai,
    hairColor: '#261c1a',
    bodyColor: '#15aabf',
    sleeveColor: '#22b8cf',
    pantsColor: '#2b3445',
    shoeColor: '#e03131',
    skinColor: '#ffdcc2',
    swatches: ['#261c1a', '#ffd43b', '#15aabf', '#ffffff', '#2b3445', '#e03131'],
    face: {
      skin: '#ffdcc2', hair: '#261c1a', bangs: 'spiky',
      eye: '#18181b', blush: '#ff8e9e', mouth: 'grin', tallEyes: false,
    },
    paintSkin(g) {
      // Cyan tee with cool yellow lightning/star graphic on chest!
      px(g, 4, 20, 6, 7, '#15aabf');
      px(g, 6, 21, 2, 2, '#ffd43b');
      px(g, 5, 23, 2, 2, '#ffe066');
      // Short sleeves showing skin forearms
      px(g, 20, 22, 12, 3, '#ffdcc2');
    },
    extraParts({ headBoxes, buildSwatchBox }) {
      // Cocky spiky hair forelock + crown cowlick!
      headBoxes.push(buildSwatchBox(0.32, 0.18, 0.18, 32, 16, 8, 8, 0.14, 1.02, 0.42, 0.2, 0, -0.22));
      headBoxes.push(buildSwatchBox(0.24, 0.22, 0.24, 32, 16, 8, 8, -0.16, 1.06, -0.10, -0.2, 0, 0.25));
    },
    hasKaiProps: true, // Supports cakeFace, buriedSnow, and finaleJunk!
  },

  bela: {
    name: NPC_NAMES.bela,
    hairColor: '#f76707',
    bodyColor: '#f76707',
    sleeveColor: '#ff922b',
    pantsColor: '#ffffff',
    shoeColor: '#d9480f',
    skinColor: '#ffe3cc',
    swatches: ['#f76707', '#ffffff', '#40c057', '#ffd43b', '#ff922b', '#c94008'],
    face: {
      skin: '#ffe3cc', hair: '#d9480f', bangs: 'parted',
      eye: '#2f9e44', eyeLight: '#8ce99a', blush: '#ff85a2', mouth: 'smile',
    },
    paintSkin(g) {
      // Orange fox hoodie with crisp white belly patch (video 02:10!)
      px(g, 4, 20, 6, 7, '#f76707');
      px(g, 5, 21, 4, 5, '#ffffff');
      // Orange/white striped socks on legs
      px(g, 0, 34, 12, 1, '#f76707');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Cute orange & white fox ears on hood + little leafy flower crown accent + fluffy fox tail!
      headBoxes.push(buildSwatchBox(0.26, 0.26, 0.18, 32, 16, 8, 8, -0.32, 1.08, 0.10));
      headBoxes.push(buildSwatchBox(0.14, 0.16, 0.08, 40, 16, 8, 8, -0.32, 1.08, 0.18));
      headBoxes.push(buildSwatchBox(0.26, 0.26, 0.18, 32, 16, 8, 8, 0.32, 1.08, 0.10));
      headBoxes.push(buildSwatchBox(0.14, 0.16, 0.08, 40, 16, 8, 8, 0.32, 1.08, 0.18));
      headBoxes.push(buildSwatchBox(1.04, 0.10, 1.04, 48, 16, 8, 8, 0, 0.90, 0));
      // Fluffy orange & white fox tail
      bodyBoxes.push(buildSwatchBox(0.24, 0.42, 0.24, 32, 16, 8, 8, 0, -0.18, -0.36, -0.65, 0, 0));
      bodyBoxes.push(buildSwatchBox(0.22, 0.20, 0.22, 40, 16, 8, 8, 0, 0.02, -0.54, -0.65, 0, 0));
    },
  },

  mystery: {
    name: NPC_NAMES.mystery,
    hairColor: '#111116',
    bodyColor: '#f8f9fa',
    sleeveColor: '#f8f9fa',
    pantsColor: '#f1f3f5',
    shoeColor: '#111116',
    skinColor: '#111116',
    swatches: ['#111116', '#ffffff', '#dee2e6', '#74c0fc', '#f8f9fa', '#212529'],
    face: { questionFace: true },
    paintSkin(g) {
      fillNoiseRect(g, 0, 0, 32, 16, ['#111116', '#181820'], 161);
      // Re-apply question mark face on front of black head (8,8)
      px(g, 8, 8, 8, 8, '#111116');
      px(g, 10, 9, 4, 1, '#ffffff');
      px(g, 13, 10, 1, 2, '#ffffff');
      px(g, 11, 11, 2, 1, '#ffffff');
      px(g, 11, 12, 1, 1, '#ffffff');
      px(g, 11, 14, 1, 1, '#ffffff');
      // Crisp white suit jacket with bold black '?' on front torso (video 09:10!)
      px(g, 4, 20, 6, 7, '#f8f9fa');
      px(g, 4, 20, 1, 7, '#e9ecef');
      px(g, 9, 20, 1, 7, '#e9ecef');
      px(g, 6, 21, 2, 1, '#111116');
      px(g, 7, 22, 1, 2, '#111116');
      px(g, 6, 23, 2, 1, '#111116');
      px(g, 6, 25, 1, 1, '#111116');
    },
  },
};
