import { fillNoiseRect } from './skins.js';
import { MOB_NAMES } from '../data/strings.js';

function px(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/**
 * 10 MC-faithful cute blocky mob specs (§3.4):
 * slimeMob, snowGolemMob, villagerMob, witherSkeleton, endermanMob,
 * sheepMob, chicken, catMob, beeMob, crowdMob
 */
export const MOB_SPECS = {
  slimeMob: {
    name: MOB_NAMES.slime,
    mobRigType: 'slime',
    headS: 0.56,
    bodyW: 0.01,
    bodyH: 0.01,
    bodyD: 0.01,
    legH: 0.02,
    limbW: 0.01,
    hairColor: '#2f9e44',
    bodyColor: '#2f9e44',
    sleeveColor: '#2f9e44',
    pantsColor: '#2f9e44',
    shoeColor: '#2f9e44',
    skinColor: '#37b24d',
    swatches: ['#69db7c', '#2f9e44', '#b2f2bb', '#40c057', '#2b8a3e', '#1b4332'],
    face: { skin: '#37b24d', bangs: 'none', eye: '#143d14', blush: '#ff85a2', mouth: 'open', tallEyes: false },
    hasSlimeOuterCube: true,
    shadowRadius: 0.48,
  },

  snowGolemMob: {
    name: MOB_NAMES.snowGolem,
    headS: 0.68,
    bodyW: 0.72,
    bodyH: 0.66,
    bodyD: 0.72,
    legH: 0.62,
    limbW: 0.12,
    hairColor: '#f8f9fa',
    bodyColor: '#ffffff',
    sleeveColor: '#6d4c3d',
    pantsColor: '#f1f5f9',
    shoeColor: '#e2e8f0',
    skinColor: '#ffffff',
    swatches: ['#ffffff', '#212529', '#f76707', '#6d4c3d', '#f1f5f9', '#e2e8f0'],
    face: {
      skin: '#ffffff', bangs: 'none', eye: '#212529', blush: '#ff85a2',
      noseDot: '#f76707', mouth: 'smile', tallEyes: false,
    },
    paintSkin(g) {
      // Coal buttons down middle snowball
      px(g, 6, 21, 2, 1, '#212529');
      px(g, 6, 23, 2, 1, '#212529');
      px(g, 6, 25, 2, 1, '#212529');
    },
    extraParts({ bodyBoxes, buildSwatchBox }) {
      // Bottom larger snowball block merged below torso so legs hide inside bottom snowball!
      bodyBoxes.push(buildSwatchBox(0.86, 0.64, 0.86, 32, 16, 8, 8, 0, -0.62, 0));
    },
    hasHelmet: 'pumpkin',
  },

  villagerMob: {
    name: MOB_NAMES.villager,
    headS: 0.86,
    bodyW: 0.74,
    bodyH: 0.88,
    bodyD: 0.48,
    legH: 0.52,
    limbW: 0.26,
    hairColor: '#d49a78',
    bodyColor: '#8d5b3c',
    sleeveColor: '#7a4d31',
    pantsColor: '#5c3c24',
    shoeColor: '#3d2717',
    skinColor: '#d49a78',
    swatches: ['#8d5b3c', '#2f9e44', '#b57b5b', '#5c3c24', '#7a4d31', '#3d2717'],
    face: { skin: '#d49a78', hair: '#5c3c24', bangs: 'none', eye: '#2f9e44', blush: '#f08c8c', mouth: 'shy', tallEyes: false },
    paintSkin(g) {
      // Villager unibrow + emerald trim
      px(g, 9, 10, 6, 1, '#4a2f1b');
      px(g, 4, 20, 6, 7, '#8d5b3c');
      px(g, 6, 21, 2, 2, '#2f9e44');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Iconic big hanging villager nose + folded monoblock sleeves + long brown robe!
      headBoxes.push(buildSwatchBox(0.22, 0.34, 0.20, 48, 16, 8, 8, 0, 0.24, 0.50));
      bodyBoxes.push(buildSwatchBox(0.76, 0.24, 0.26, 32, 24, 8, 8, 0, 0.05, 0.30));
      bodyBoxes.push(buildSwatchBox(0.76, 0.34, 0.50, 32, 16, 8, 8, 0, -0.44, 0));
    },
  },

  witherSkeleton: {
    name: MOB_NAMES.witherSkeleton,
    headS: 0.82,
    bodyW: 0.62,
    bodyH: 0.88,
    bodyD: 0.32,
    legH: 0.82,
    limbW: 0.18,
    hairColor: '#36333b',
    bodyColor: '#26242b',
    sleeveColor: '#26242b',
    pantsColor: '#222026',
    shoeColor: '#18161c',
    skinColor: '#38343d',
    swatches: ['#26242b', '#494552', '#ff85a2', '#ced4da', '#18161c', '#38343d'],
    face: { skin: '#38343d', bangs: 'none', eye: '#e9ecef', blush: '#ff6b9d', mouth: 'open', tallEyes: false },
    paintSkin(g) {
      // Cute shiny bald charcoal head blushing underneath the removable skull helmet!
      px(g, 8, 8, 8, 2, '#4d4854');
      px(g, 10, 8, 2, 1, '#868e96'); // shiny bald highlight!
      // Skeleton ribs on torso
      px(g, 4, 20, 6, 7, '#18161c');
      px(g, 6, 20, 2, 7, '#3b3742');
      px(g, 4, 21, 6, 1, '#494552');
      px(g, 4, 23, 6, 1, '#494552');
      px(g, 4, 25, 6, 1, '#494552');
    },
    hasHelmet: 'skull',
  },

  endermanMob: {
    name: MOB_NAMES.enderman,
    headS: 0.78,
    bodyW: 0.56,
    bodyH: 0.84,
    bodyD: 0.32,
    legH: 1.05,
    limbW: 0.16,
    hairColor: '#14101c',
    bodyColor: '#14101c',
    sleeveColor: '#14101c',
    pantsColor: '#110d18',
    shoeColor: '#14101c',
    skinColor: '#14101c',
    swatches: ['#14101c', '#e879f9', '#d946ef', '#f8d0ff', '#1d1729', '#0d0a12'],
    face: { skin: '#14101c', bangs: 'none', eye: '#d946ef', blush: '#6b21a8', mouth: 'shy', tallEyes: false },
    paintSkin(g) {
      // Iconic horizontal glowing purple Enderman eyes on front head (8,8)
      px(g, 8, 8, 8, 8, '#14101c');
      px(g, 8, 12, 3, 1, '#f8d0ff');
      px(g, 13, 12, 3, 1, '#f8d0ff');
      px(g, 9, 12, 1, 1, '#d946ef');
      px(g, 14, 12, 1, 1, '#d946ef');
    },
  },

  sheepMob: {
    name: MOB_NAMES.sheep,
    mobRigType: 'quadruped',
    quadDims: { bodyW: 0.82, bodyH: 0.64, bodyD: 1.08, legH: 0.44, legW: 0.22, headS: 0.60, headZ: 0.56, headY: 0.76 },
    hairColor: '#ffffff',
    bodyColor: '#fffcf5',
    sleeveColor: '#e6c5ad',
    pantsColor: '#e6c5ad',
    shoeColor: '#5c4033',
    skinColor: '#e6c5ad',
    swatches: ['#ffffff', '#ff8fab', '#e6c5ad', '#5c4033', '#f3ead8', '#fff8eb'],
    face: { skin: '#e6c5ad', hair: '#ffffff', bangs: 'hood', eye: '#212529', blush: '#ff9ebb', mouth: 'smile', tallEyes: false },
    paintSkin(g) {
      fillNoiseRect(g, 0, 16, 20, 12, ['#ffffff', '#fff9ee', '#f2e8d5'], 201);
      fillNoiseRect(g, 32, 16, 8, 8, ['#ffffff', '#fff8eb', '#efe4cf'], 202);
    },
    extraParts({ headBoxes, buildSwatchBox }) {
      // Fluffy wool cap on top/back of sheep head + ears
      headBoxes.push(buildSwatchBox(0.68, 0.20, 0.66, 32, 16, 8, 8, 0, 0.56, -0.04));
      headBoxes.push(buildSwatchBox(0.18, 0.12, 0.16, 48, 16, 8, 8, -0.36, 0.42, 0));
      headBoxes.push(buildSwatchBox(0.18, 0.12, 0.16, 48, 16, 8, 8, 0.36, 0.42, 0));
    },
  },

  chicken: {
    name: MOB_NAMES.chicken,
    mobRigType: 'chicken',
    headS: 0.40,
    bodyW: 0.48,
    bodyH: 0.44,
    bodyD: 0.62,
    legH: 0.30,
    limbW: 0.10,
    hairColor: '#ffffff',
    bodyColor: '#ffffff',
    sleeveColor: '#f8f9fa',
    pantsColor: '#f59f00',
    shoeColor: '#f59f00',
    skinColor: '#ffffff',
    swatches: ['#ffffff', '#f59f00', '#e03131', '#f1f3f5', '#fcc419', '#c92a2a'],
    face: { skin: '#ffffff', bangs: 'none', eye: '#18181b', blush: '#ffa8a8', tallEyes: false },
    extraParts({ headBoxes, buildSwatchBox }) {
      // Yellow 3D chicken beak + red wattle under beak!
      headBoxes.push(buildSwatchBox(0.26, 0.12, 0.18, 40, 16, 8, 8, 0, 0.16, 0.26));
      headBoxes.push(buildSwatchBox(0.14, 0.14, 0.12, 48, 16, 8, 8, 0, 0.05, 0.22));
    },
    shadowRadius: 0.34,
  },

  catMob: {
    name: MOB_NAMES.cat,
    mobRigType: 'quadruped',
    quadDims: { bodyW: 0.42, bodyH: 0.36, bodyD: 0.86, legH: 0.30, legW: 0.15, headS: 0.46, headZ: 0.46, headY: 0.50 },
    hairColor: '#2b2d38',
    bodyColor: '#2b2d38',
    sleeveColor: '#ffffff',
    pantsColor: '#2b2d38',
    shoeColor: '#ffffff',
    skinColor: '#2b2d38',
    swatches: ['#2b2d38', '#ff85a2', '#2fb344', '#ffffff', '#1e2028', '#f8f9fa'],
    face: {
      skin: '#2b2d38', bangs: 'none', eye: '#40c057', blush: '#ff85a2',
      noseDot: '#ff85a2', mouth: 'cat', tallEyes: false,
    },
    paintSkin(g) {
      // Cute tuxedo white muzzle on catMob face
      px(g, 10, 13, 4, 3, '#ffffff');
      px(g, 11, 13, 2, 1, '#ff85a2');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Pointy cat ears + angled tail!
      headBoxes.push(buildSwatchBox(0.14, 0.14, 0.12, 32, 16, 8, 8, -0.15, 0.50, 0.04));
      headBoxes.push(buildSwatchBox(0.14, 0.14, 0.12, 32, 16, 8, 8, 0.15, 0.50, 0.04));
      bodyBoxes.push(buildSwatchBox(0.10, 0.44, 0.10, 32, 16, 8, 8, 0, 0.16, -0.52, -0.75, 0, 0));
    },
    shadowRadius: 0.38,
  },

  beeMob: {
    name: MOB_NAMES.bee,
    mobRigType: 'bee',
    baseLift: 0.52,
    headS: 0.01,
    bodyW: 0.62,
    bodyH: 0.58,
    bodyD: 0.80,
    legH: 0.12,
    limbW: 0.12,
    hairColor: '#ffd43b',
    bodyColor: '#ffd43b',
    sleeveColor: '#e7f5ff',
    pantsColor: '#3b2814',
    shoeColor: '#3b2814',
    skinColor: '#ffd43b',
    swatches: ['#ffd43b', '#3b2814', '#ffffff', '#e7f5ff', '#fcc419', '#18181b'],
    face: { skin: '#ffd43b', bangs: 'none', eye: '#18181b', blush: '#ff85a2', tallEyes: false },
    paintSkin(g) {
      // Bee stripes along sides/top + cute big bee eyes on front of body (4,20,6,7)!
      for (let x = 0; x < 20; x++) {
        px(g, x, 16, 1, 12, x % 3 === 2 ? '#3b2814' : '#ffd43b');
      }
      px(g, 4, 20, 6, 7, '#ffd43b');
      px(g, 4, 21, 2, 3, '#18181b');
      px(g, 8, 21, 2, 3, '#18181b');
      px(g, 4, 21, 1, 1, '#74c0fc');
      px(g, 8, 21, 1, 1, '#74c0fc');
      px(g, 4, 25, 1, 1, '#ff85a2');
      px(g, 9, 25, 1, 1, '#ff85a2');
      // White wing texture on arm region (20..32, 16..25)
      px(g, 20, 16, 12, 9, '#f1f9ff');
    },
    extraParts({ bodyBoxes, buildSwatchBox }) {
      // 2 cute forward antennae on front of bee box!
      bodyBoxes.push(buildSwatchBox(0.07, 0.18, 0.22, 40, 16, 8, 8, -0.16, 0.28, 0.44, 0.3, 0, 0));
      bodyBoxes.push(buildSwatchBox(0.07, 0.18, 0.22, 40, 16, 8, 8, 0.16, 0.28, 0.44, 0.3, 0, 0));
    },
    shadowRadius: 0.38,
  },

  crowdMob: {
    name: MOB_NAMES.crowd,
    hairColor: '#495057',
    bodyColor: '#4dabf7',
    sleeveColor: '#74c0fc',
    pantsColor: '#364fc7',
    shoeColor: '#f8f9fa',
    skinColor: '#ffe0c4',
    swatches: ['#4dabf7', '#ffd43b', '#ffffff', '#364fc7', '#74c0fc', '#1864ab'],
    face: { skin: '#ffe0c4', hair: '#495057', bangs: 'parted', eye: '#18181b', blush: '#ff85a2', mouth: 'open' },
  },
};
