import { fillNoiseRect, shadeHex } from './skins.js';
import { paintChibiFace } from './faces.js';

function px(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/**
 * 12 Chibi Block-Human Contestants per docs/DESIGN.md §4 Look Bible.
 * Every contestant has:
 * - Big 2x3 sparkling eyes + rosy blush + fully clothed cute outfit
 * - Distinct merged voxel silhouette (0 extra draw calls; only 啵啵 adds 1 translucent jelly outer cube)
 */
export const CONTESTANT_SPECS = {
  // 1. 花花 (羊): wool-cube hood + flowers + pink overall apron + wool puff tail
  sheep: {
    name: '花花',
    hatTopY: 1.10,
    hairColor: '#6d4c3d',
    bodyColor: '#ff9ebb',
    sleeveColor: '#fff9ee',
    pantsColor: '#fff9ee',
    shoeColor: '#e64980',
    skinColor: '#ffe2cc',
    swatches: ['#fff9ee', '#ff6b9d', '#ffd43b', '#74c0fc', '#ffc2d4', '#f3ead8'],
    face: { skin: '#ffe2cc', hair: '#6d4c3d', bangs: 'parted', eye: '#3b5bdb', blush: '#ff85a2', mouth: 'smile' },
    paintSkin(g) {
      // Fluffy wool noise on S0 & S5
      fillNoiseRect(g, 32, 16, 8, 8, ['#ffffff', '#fff8eb', '#f1e6d2'], 11);
      fillNoiseRect(g, 40, 24, 8, 8, ['#f8f0e0', '#efe3ce', '#ffffff'], 12);
      // Pink overall bib + white heart pocket on front body (4,20,6,7)
      px(g, 4, 20, 6, 2, '#fff9ee');
      px(g, 5, 21, 4, 5, '#ff85a8');
      px(g, 6, 23, 2, 2, '#ffffff');
      // Back straps
      px(g, 15, 20, 1, 4, '#ff85a8');
      px(g, 18, 20, 1, 4, '#ff85a8');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Fluffy wool-cube hood wrapping top, sides, and back of head (leaves front face open!)
      headBoxes.push(buildSwatchBox(1.14, 0.24, 1.12, 32, 16, 8, 8, 0, 0.98, -0.02));
      headBoxes.push(buildSwatchBox(1.16, 0.88, 0.34, 32, 16, 8, 8, 0, 0.52, -0.40));
      headBoxes.push(buildSwatchBox(0.18, 0.82, 0.96, 40, 24, 8, 8, -0.54, 0.50, -0.02));
      headBoxes.push(buildSwatchBox(0.18, 0.82, 0.96, 40, 24, 8, 8, 0.54, 0.50, -0.02));
      // Cute horizontal sheep ears sticking out sides
      headBoxes.push(buildSwatchBox(0.26, 0.16, 0.22, 32, 16, 8, 8, -0.68, 0.62, 0.08, 0, 0, 0.22));
      headBoxes.push(buildSwatchBox(0.26, 0.16, 0.22, 32, 16, 8, 8, 0.68, 0.62, 0.08, 0, 0, -0.22));
      // 3 colorful flowers nestled on wool hood!
      headBoxes.push(buildSwatchBox(0.20, 0.20, 0.12, 40, 16, 8, 8, -0.30, 1.10, 0.44)); // pink flower
      headBoxes.push(buildSwatchBox(0.18, 0.18, 0.12, 48, 16, 8, 8, 0.02, 1.13, 0.48));  // yellow dandelion
      headBoxes.push(buildSwatchBox(0.20, 0.20, 0.12, 56, 16, 8, 8, 0.32, 1.10, 0.44));  // blue cornflower
      // Cute pleated skirt hem + fluffy sheep tail puff
      bodyBoxes.push(buildSwatchBox(0.80, 0.22, 0.54, 32, 24, 8, 8, 0, -0.32, 0));
      bodyBoxes.push(buildSwatchBox(0.28, 0.28, 0.26, 32, 16, 8, 8, 0, -0.22, -0.32));
    },
  },

  // 2. 啵啵 (史莱姆): translucent green jelly head + twin buns with opaque cute face inside!
  slime: {
    name: '啵啵',
    headS: 0.78, // inner solid slime core so outer 1.06 jelly shell wraps cleanly around it!
    hairColor: '#2f9e44',
    bodyColor: '#51cf66',
    sleeveColor: '#69db7c',
    pantsColor: '#8ce99a',
    shoeColor: '#2b8a3e',
    skinColor: '#74e354',
    swatches: ['#69db7c', '#2f9e44', '#b2f2bb', '#40c057', '#37b24d', '#2b8a3e'],
    face: { skin: '#74e354', hair: '#37b24d', bangs: 'parted', eye: '#14532d', eyeLight: '#51cf66', blush: '#ff7597', mouth: 'open' },
    paintSkin(g) {
      // Cute slime core dress pattern on front body
      px(g, 4, 20, 6, 7, '#51cf66');
      px(g, 5, 21, 4, 3, '#2f9e44');
      px(g, 6, 22, 2, 1, '#b2f2bb');
      px(g, 4, 25, 6, 2, '#37b24d');
    },
    extraParts({ bodyBoxes, buildSwatchBox }) {
      bodyBoxes.push(buildSwatchBox(0.80, 0.22, 0.52, 32, 24, 8, 8, 0, -0.32, 0));
    },
    hasJellyShell: true,
  },

  // 3. 喵喵 (猫): pointy cat ears + striped upturned cat tail + collar bell
  cat: {
    name: '喵喵',
    hairColor: '#e76f51',
    bodyColor: '#f4a261',
    sleeveColor: '#f4a261',
    pantsColor: '#4a3525',
    shoeColor: '#fff3e0',
    skinColor: '#ffe3cc',
    swatches: ['#f4a261', '#ff85a2', '#ffd43b', '#fff3e0', '#4a3525', '#c85a32'],
    face: {
      skin: '#ffe3cc', hair: '#e76f51', bangs: 'parted',
      eye: '#2fb344', eyeLight: '#8ce99a', blush: '#ff85a2', noseDot: '#ff7597', mouth: 'cat',
    },
    paintSkin(g) {
      // Cream tuxedo belly + red collar + gold bell on front body (4,20,6,7)
      px(g, 4, 20, 6, 1, '#e03131');
      px(g, 5, 21, 4, 5, '#fff3e0');
      px(g, 6, 21, 2, 1, '#ffd43b');
      // Tabby stripes on back
      px(g, 14, 21, 6, 1, '#c85a32');
      px(g, 14, 23, 6, 1, '#c85a32');
      // Whisker dots on face cheeks
      px(g, 8, 12, 1, 1, '#b85d3b');
      px(g, 15, 12, 1, 1, '#b85d3b');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Pointy voxel cat ears + pink inner ear
      headBoxes.push(buildSwatchBox(0.28, 0.24, 0.20, 32, 16, 8, 8, -0.32, 1.08, 0.08));
      headBoxes.push(buildSwatchBox(0.16, 0.16, 0.16, 32, 16, 8, 8, -0.34, 1.24, 0.08));
      headBoxes.push(buildSwatchBox(0.14, 0.14, 0.06, 40, 16, 8, 8, -0.32, 1.07, 0.17));

      headBoxes.push(buildSwatchBox(0.28, 0.24, 0.20, 32, 16, 8, 8, 0.32, 1.08, 0.08));
      headBoxes.push(buildSwatchBox(0.16, 0.16, 0.16, 32, 16, 8, 8, 0.34, 1.24, 0.08));
      headBoxes.push(buildSwatchBox(0.14, 0.14, 0.06, 40, 16, 8, 8, 0.32, 1.07, 0.17));
      // Cheek fur tufts
      headBoxes.push(buildSwatchBox(0.14, 0.24, 0.24, 32, 16, 8, 8, -0.54, 0.32, 0.12));
      headBoxes.push(buildSwatchBox(0.14, 0.24, 0.24, 32, 16, 8, 8, 0.54, 0.32, 0.12));
      // Pleated skirt + long upturned cat tail with cream tip
      bodyBoxes.push(buildSwatchBox(0.78, 0.20, 0.50, 32, 24, 8, 8, 0, -0.32, 0));
      bodyBoxes.push(buildSwatchBox(0.14, 0.52, 0.14, 32, 16, 8, 8, 0, -0.10, -0.38, -0.68, 0, 0));
      bodyBoxes.push(buildSwatchBox(0.15, 0.22, 0.15, 56, 16, 8, 8, 0, 0.16, -0.56, -0.25, 0, 0));
    },
  },

  // 4. 铁铁 (铁傀儡): big iron shoulder pauldrons + green vines + blooms
  golem: {
    name: '铁铁',
    bodyW: 0.82,
    limbW: 0.33,
    hairColor: '#adb5bd',
    bodyColor: '#e2e6ea',
    sleeveColor: '#dee2e6',
    pantsColor: '#868e96',
    shoeColor: '#495057',
    skinColor: '#f1f3f5',
    swatches: ['#dee2e6', '#40c057', '#ffd43b', '#ced4da', '#868e96', '#2b8a3e'],
    face: { skin: '#f1f3f5', hair: '#adb5bd', bangs: 'parted', eye: '#d9342b', eyeLight: '#ff8787', blush: '#ffa8a8', mouth: 'smile' },
    paintSkin(g) {
      fillNoiseRect(g, 32, 16, 8, 8, ['#e9ecef', '#dee2e6', '#ced4da'], 41);
      fillNoiseRect(g, 40, 16, 8, 8, ['#40c057', '#2f9e44', '#69db7c'], 42);
      // Iron chest armor + green vine diagonal + tiny yellow blossom on front torso
      px(g, 4, 20, 6, 7, '#dee2e6');
      px(g, 4, 20, 2, 2, '#40c057');
      px(g, 5, 22, 2, 2, '#2f9e44');
      px(g, 7, 24, 2, 2, '#40c057');
      px(g, 5, 21, 1, 1, '#ffd43b');
      px(g, 4, 25, 6, 2, '#868e96');
      // Vines on sleeves (20..32, 19..24)
      px(g, 23, 20, 1, 4, '#40c057');
      px(g, 24, 22, 1, 2, '#2f9e44');
    },
    extraParts({ headBoxes, bodyBoxes, armLBoxes, armRBoxes, buildSwatchBox }) {
      // Cute small iron nose bump + vine hair sprig
      headBoxes.push(buildSwatchBox(0.14, 0.20, 0.10, 56, 16, 8, 8, 0, 0.34, 0.53));
      headBoxes.push(buildSwatchBox(0.24, 0.14, 0.22, 40, 16, 8, 8, -0.34, 1.02, 0.28));
      headBoxes.push(buildSwatchBox(0.12, 0.12, 0.10, 48, 16, 8, 8, -0.30, 1.08, 0.34));
      // Big chunky iron shoulder pauldrons + trailing 3D green vines!
      armLBoxes.push(buildSwatchBox(0.42, 0.26, 0.44, 32, 16, 8, 8, 0.04, -0.02, 0));
      armLBoxes.push(buildSwatchBox(0.12, 0.42, 0.46, 40, 16, 8, 8, 0.16, -0.18, 0));
      armRBoxes.push(buildSwatchBox(0.42, 0.26, 0.44, 32, 16, 8, 8, -0.04, -0.02, 0));
      armRBoxes.push(buildSwatchBox(0.12, 0.42, 0.46, 40, 16, 8, 8, -0.16, -0.18, 0));
      // Iron pleated battle-skirt
      bodyBoxes.push(buildSwatchBox(0.90, 0.20, 0.54, 32, 24, 8, 8, 0, -0.32, 0));
    },
  },

  // 5. 雪宝 (雪傀儡): puffy snowball coat body + coal buttons + bright pumpkin-orange pigtails
  snow: {
    name: '雪宝',
    hairColor: '#f76707',
    bodyColor: '#ffffff',
    sleeveColor: '#f8f9fa',
    pantsColor: '#d0ebff',
    shoeColor: '#339af0',
    skinColor: '#fff9f5',
    swatches: ['#ffffff', '#f76707', '#212529', '#74c0fc', '#f1f5f9', '#e8590c'],
    face: {
      skin: '#fff9f5', hair: '#f76707', bangs: 'parted',
      eye: '#1c7ed6', eyeLight: '#74c0fc', blush: '#ff8787', noseDot: '#f76707', mouth: 'smile',
    },
    paintSkin(g) {
      // Snow-white coat with 3 coal buttons down front torso
      px(g, 4, 20, 6, 7, '#ffffff');
      px(g, 6, 21, 2, 1, '#212529');
      px(g, 6, 23, 2, 1, '#212529');
      px(g, 6, 25, 2, 1, '#212529');
      // Blue winter mittens on hands
      px(g, 20, 23, 12, 2, '#4dabf7');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Twin pumpkin-orange pigtails framing head!
      headBoxes.push(buildSwatchBox(0.22, 0.58, 0.24, 40, 16, 8, 8, -0.58, 0.36, -0.04, 0, 0, 0.15));
      headBoxes.push(buildSwatchBox(0.22, 0.58, 0.24, 40, 16, 8, 8, 0.58, 0.36, -0.04, 0, 0, -0.15));
      // Rounded snowball puff coat tiers!
      bodyBoxes.push(buildSwatchBox(0.84, 0.38, 0.58, 32, 16, 8, 8, 0, -0.18, 0));
      bodyBoxes.push(buildSwatchBox(0.76, 0.28, 0.52, 32, 24, 8, 8, 0, 0.16, 0));
    },
  },

  // 6. 嘶嘶 (苦力怕): mottled green creeper-pattern hoodie + hood ears/brim
  creeper: {
    name: '嘶嘶',
    hatTopY: 1.05,
    hairColor: '#2b8a3e',
    bodyColor: '#52b74a',
    sleeveColor: '#52b74a',
    pantsColor: '#212529',
    shoeColor: '#37b24d',
    skinColor: '#ffe4cf',
    swatches: ['#52b74a', '#2b8a3e', '#8ce99a', '#18181b', '#2f9e44', '#1b4332'],
    face: {
      skin: '#ffe4cf', hair: '#52b74a', innerHair: '#2b5929', bangs: 'hood',
      eye: '#18181b', eyeLight: '#51cf66', blush: '#ff85a2', mouth: 'shy',
    },
    paintSkin(g) {
      // Mottled MC creeper camo on hood & hoodie body!
      const camo = ['#52b74a', '#69db7c', '#3da838', '#8ce99a', '#2f9e44'];
      fillNoiseRect(g, 8, 0, 8, 8, camo, 61);
      fillNoiseRect(g, 0, 8, 8, 8, camo, 62);
      fillNoiseRect(g, 16, 8, 16, 8, camo, 63);
      fillNoiseRect(g, 32, 16, 8, 8, camo, 64);
      fillNoiseRect(g, 0, 16, 20, 11, camo, 65);
      // Re-paint face cleanly on front of head
      paintChibiFace(g, 8, 8, {
        skin: '#ffe4cf', hair: '#52b74a', innerHair: '#2b5929', bangs: 'hood',
        eye: '#18181b', eyeLight: '#51cf66', blush: '#ff85a2', mouth: 'shy',
      });
      // Iconic black pixel creeper face graphic on hoodie chest (4,20,6,7) + white drawstrings!
      px(g, 5, 20, 1, 2, '#ffffff');
      px(g, 8, 20, 1, 2, '#ffffff');
      px(g, 5, 22, 1, 1, '#111812');
      px(g, 8, 22, 1, 1, '#111812');
      px(g, 6, 23, 2, 2, '#111812');
      px(g, 5, 24, 1, 2, '#111812');
      px(g, 8, 24, 1, 2, '#111812');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Cozy hoodie rim around head + cute creeper-block top crest + hoodie kangaroo pocket & skirt
      headBoxes.push(buildSwatchBox(1.10, 0.16, 1.08, 32, 16, 8, 8, 0, 0.96, -0.02));
      headBoxes.push(buildSwatchBox(1.10, 0.88, 0.26, 32, 16, 8, 8, 0, 0.50, -0.42));
      headBoxes.push(buildSwatchBox(0.12, 0.84, 0.92, 32, 16, 8, 8, -0.53, 0.48, -0.04));
      headBoxes.push(buildSwatchBox(0.12, 0.84, 0.92, 32, 16, 8, 8, 0.53, 0.48, -0.04));
      bodyBoxes.push(buildSwatchBox(0.52, 0.22, 0.08, 40, 16, 8, 8, 0, -0.18, 0.25));
      bodyBoxes.push(buildSwatchBox(0.78, 0.18, 0.52, 56, 16, 8, 8, 0, -0.34, 0));
    },
  },

  // 7. 嗡嗡 (蜜蜂): yellow/brown stripes + 2 cute antennae + 2 gauzy white wings
  bee: {
    name: '嗡嗡',
    hairColor: '#f59f00',
    bodyColor: '#ffd43b',
    sleeveColor: '#ffd43b',
    pantsColor: '#4a3218',
    shoeColor: '#f59f00',
    skinColor: '#ffe3c4',
    swatches: ['#ffd43b', '#4a3218', '#ffe066', '#e7f5ff', '#4a3218', '#fff9db'],
    face: { skin: '#ffe3c4', hair: '#f59f00', bangs: 'parted', eye: '#2b1d0e', eyeLight: '#74c0fc', blush: '#ff85a2', mouth: 'open' },
    paintSkin(g) {
      // Crisp horizontal yellow & espresso bee stripes around torso!
      for (let row = 0; row < 7; row++) {
        px(g, 0, 20 + row, 20, 1, row % 2 === 1 ? '#4a3218' : '#ffd43b');
      }
      // Striped sleeves
      px(g, 20, 20, 12, 1, '#4a3218');
      px(g, 20, 22, 12, 1, '#4a3218');
      // Gauzy wing pixel sheen on S3 (56,16)
      fillNoiseRect(g, 56, 16, 8, 8, ['#ffffff', '#e7f5ff', '#d0ebff'], 71);
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // 2 cute curved dark antennae with little golden tips!
      headBoxes.push(buildSwatchBox(0.08, 0.30, 0.08, 40, 16, 8, 8, -0.22, 1.12, 0.26, 0.38, 0, 0.12));
      headBoxes.push(buildSwatchBox(0.13, 0.13, 0.13, 32, 16, 8, 8, -0.25, 1.26, 0.34));
      headBoxes.push(buildSwatchBox(0.08, 0.30, 0.08, 40, 16, 8, 8, 0.22, 1.12, 0.26, 0.38, 0, -0.12));
      headBoxes.push(buildSwatchBox(0.13, 0.13, 0.13, 32, 16, 8, 8, 0.25, 1.26, 0.34));
      // Fluffy golden neck collar + 2 angled pixel bee wings on back + plump striped bee skirt!
      bodyBoxes.push(buildSwatchBox(0.76, 0.14, 0.50, 48, 16, 8, 8, 0, 0.36, 0));
      bodyBoxes.push(buildSwatchBox(0.62, 0.38, 0.06, 56, 16, 8, 8, 0.42, 0.18, -0.30, 0.12, -0.46, 0.18));
      bodyBoxes.push(buildSwatchBox(0.62, 0.38, 0.06, 56, 16, 8, 8, -0.42, 0.18, -0.30, 0.12, 0.46, -0.18));
      bodyBoxes.push(buildSwatchBox(0.80, 0.24, 0.56, 32, 24, 8, 8, 0, -0.30, -0.04));
    },
  },

  // 8. 小末 (末影人): tall/thin, long dark flowing hair, glowing pink-purple eyes + floating purple particles!
  ender: {
    name: '小末',
    legH: 0.74,
    bodyW: 0.62,
    limbW: 0.26,
    hairColor: '#191226',
    bodyColor: '#221833',
    sleeveColor: '#1b1329',
    pantsColor: '#140e1f',
    shoeColor: '#9c36b5',
    skinColor: '#efe5f7',
    swatches: ['#191226', '#d946ef', '#a855f7', '#f0abfc', '#2b1e40', '#120d1c'],
    face: {
      skin: '#efe5f7', hair: '#191226', bangs: 'long',
      eye: '#d946ef', eyeLight: '#f8d0ff', lash: '#3b0764', blush: '#f06595', mouth: 'shy',
    },
    paintSkin(g) {
      // Sleek midnight coat with glowing amethyst ribbon & trim on front torso
      px(g, 4, 20, 6, 7, '#221833');
      px(g, 6, 20, 2, 2, '#f06595');
      px(g, 6, 22, 2, 4, '#9c36b5');
      px(g, 4, 26, 6, 1, '#d946ef');
      // Bright purple particle swatch S3
      px(g, 56, 16, 8, 8, '#e879f9');
      px(g, 58, 18, 4, 4, '#ffffff');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Long flowing dark hair curtain down back + twin front side-locks framing face!
      headBoxes.push(buildSwatchBox(0.96, 0.85, 0.18, 32, 16, 8, 8, 0, -0.18, -0.44));
      headBoxes.push(buildSwatchBox(0.18, 0.72, 0.20, 32, 16, 8, 8, -0.44, -0.10, 0.36));
      headBoxes.push(buildSwatchBox(0.18, 0.72, 0.20, 32, 16, 8, 8, 0.44, -0.10, 0.36));
      // Coat tails + 4 floating glowing purple Ender particle cubes!
      bodyBoxes.push(buildSwatchBox(0.70, 0.26, 0.48, 32, 24, 8, 8, 0, -0.34, 0));
      bodyBoxes.push(buildSwatchBox(0.11, 0.11, 0.11, 56, 16, 8, 8, -0.62, 0.55, 0.24, 0.3, 0.4, 0));
      bodyBoxes.push(buildSwatchBox(0.09, 0.09, 0.09, 40, 16, 8, 8, 0.66, 0.28, -0.18, 0.2, -0.3, 0.2));
      bodyBoxes.push(buildSwatchBox(0.10, 0.10, 0.10, 56, 16, 8, 8, 0.56, 0.88, 0.28));
      bodyBoxes.push(buildSwatchBox(0.08, 0.08, 0.08, 40, 16, 8, 8, -0.54, -0.12, -0.26));
    },
  },

  // 9. 三三 (凋零): black Nether outfit + soul-blue rib trim + 2 small cute skull heads on shoulders!
  wither: {
    name: '三三',
    hairColor: '#26232c',
    bodyColor: '#211e28',
    sleeveColor: '#26232c',
    pantsColor: '#17151c',
    shoeColor: '#4dabf7',
    skinColor: '#e9e4f0',
    swatches: ['#2b2733', '#74c0fc', '#ced4da', '#18151e', '#26232c', '#3b3645'],
    face: {
      skin: '#e9e4f0', hair: '#26232c', bangs: 'parted',
      eye: '#339af0', eyeLight: '#a5d8ff', blush: '#ff85a2', mouth: 'smile',
    },
    paintSkin(g) {
      // Paint miniature cute Wither Skull at secondary unfolded box (u0=32, v0=0, pw=6, ph=6, pd=6 -> use 8x8x8!)
      fillNoiseRect(g, 32, 0, 32, 16, ['#2b2832', '#221f28', '#35313d'], 91);
      // Front of mini shoulder skulls at (40, 8, 8, 8)
      px(g, 40, 8, 8, 8, '#2d2a35');
      px(g, 41, 11, 2, 2, '#74c0fc');
      px(g, 45, 11, 2, 2, '#74c0fc');
      px(g, 41, 11, 1, 1, '#ffffff');
      px(g, 46, 11, 1, 1, '#ffffff');
      px(g, 40, 13, 2, 1, '#ff85a2');
      px(g, 46, 13, 2, 1, '#ff85a2');
      px(g, 43, 14, 2, 1, '#ced4da');

      // Soul-blue Wither rib trim on front bodice (4,20,6,7)
      px(g, 4, 20, 6, 7, '#1f1c26');
      px(g, 6, 20, 2, 6, '#74c0fc');
      px(g, 4, 21, 6, 1, '#a5d8ff');
      px(g, 5, 23, 4, 1, '#74c0fc');
      px(g, 5, 25, 4, 1, '#4dabf7');
    },
    extraParts({ bodyBoxes, buildBoxUV, buildSwatchBox }) {
      // Shoulder mantle rests + 2 cute small Wither Skull heads perched clearly outside main head!
      bodyBoxes.push(buildSwatchBox(0.28, 0.14, 0.34, 32, 16, 8, 8, 0.56, 0.34, 0.04));
      bodyBoxes.push(buildSwatchBox(0.28, 0.14, 0.34, 32, 16, 8, 8, -0.56, 0.34, 0.04));
      bodyBoxes.push(buildBoxUV(0.44, 0.44, 0.44, 32, 0, 64, 64, 0.74, 0.48, 0.10, 0, -0.16, 0, { pw: 8, ph: 8, pd: 8 }));
      bodyBoxes.push(buildBoxUV(0.44, 0.44, 0.44, 32, 0, 64, 64, -0.74, 0.48, 0.10, 0, 0.16, 0, { pw: 8, ph: 8, pd: 8 }));
      // Gothic pleated skirt + floating wither tail-spine accent
      bodyBoxes.push(buildSwatchBox(0.80, 0.22, 0.52, 32, 24, 8, 8, 0, -0.32, 0));
    },
  },

  // 10. 翠翠 (村民): straw hat + green merchant robe + emerald clasp + cute big villager nose!
  villager: {
    name: '翠翠',
    hairColor: '#6c4329',
    bodyColor: '#2f9e44',
    sleeveColor: '#37b24d',
    pantsColor: '#5c3c24',
    shoeColor: '#4a2f1b',
    skinColor: '#f5cba7',
    swatches: ['#f3d078', '#e03131', '#2f9e44', '#e8b490', '#2b8a3e', '#6c4329'],
    face: {
      skin: '#f5cba7', hair: '#6c4329', bangs: 'parted',
      eye: '#12b886', eyeLight: '#63e6be', blush: '#ff8787', mouth: 'smile',
    },
    paintSkin(g) {
      fillNoiseRect(g, 32, 16, 8, 8, ['#f3d078', '#e8be5a', '#fae094'], 101);
      // Green emerald-merchant robe + golden emerald brooch on front torso
      px(g, 4, 20, 6, 7, '#2f9e44');
      px(g, 5, 20, 4, 2, '#f3d078');
      px(g, 6, 21, 2, 2, '#20c997');
      px(g, 6, 21, 1, 1, '#ffffff');
      px(g, 5, 23, 4, 4, '#2b8a3e');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Cute 3D button-villager nose right between cheeks!
      headBoxes.push(buildSwatchBox(0.16, 0.22, 0.13, 56, 16, 8, 8, 0, 0.34, 0.54));
      // Twin warm brown braids framing shoulders
      headBoxes.push(buildSwatchBox(0.18, 0.56, 0.18, 40, 24, 8, 8, -0.52, 0.16, 0.16));
      headBoxes.push(buildSwatchBox(0.18, 0.56, 0.18, 40, 24, 8, 8, 0.52, 0.16, 0.16));
      // Long emerald merchant robe hem
      bodyBoxes.push(buildSwatchBox(0.78, 0.28, 0.52, 32, 24, 8, 8, 0, -0.34, 0));
    },
    hasDefaultStrawHat: true, // Shown in world; auto-hides if another hat is picked on slot 0 in Booth!
  },

  // 11. 龙宝宝 (末影龙, hidden): black-purple dragon wings + horns + spiky dragon tail!
  dragon: {
    name: '龙宝宝',
    hairColor: '#2d1b46',
    bodyColor: '#1f162b',
    sleeveColor: '#261b36',
    pantsColor: '#181122',
    shoeColor: '#9c36b5',
    skinColor: '#f3e8ff',
    swatches: ['#1f162b', '#ae3ec9', '#ced4da', '#e599f7', '#2d1b46', '#862e9c'],
    face: {
      skin: '#f3e8ff', hair: '#2d1b46', bangs: 'parted',
      eye: '#be4bdb', eyeLight: '#f3d9fa', blush: '#f06595', mouth: 'open',
    },
    paintSkin(g) {
      // Dragon scale bodice with glowing purple core plates
      px(g, 4, 20, 6, 7, '#1f162b');
      px(g, 5, 21, 4, 5, '#9c36b5');
      px(g, 6, 22, 2, 3, '#e599f7');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // 2 swept-back dragon horns + purple crown spines
      headBoxes.push(buildSwatchBox(0.15, 0.30, 0.16, 48, 16, 8, 8, -0.30, 1.10, -0.04, -0.32, 0, 0.22));
      headBoxes.push(buildSwatchBox(0.15, 0.30, 0.16, 48, 16, 8, 8, 0.30, 1.10, -0.04, -0.32, 0, -0.22));
      headBoxes.push(buildSwatchBox(0.12, 0.16, 0.16, 40, 16, 8, 8, 0, 1.06, -0.18));
      // Wide black-and-purple dragon wings on back!
      bodyBoxes.push(buildSwatchBox(0.76, 0.10, 0.10, 32, 16, 8, 8, 0.48, 0.28, -0.28, 0, -0.38, 0.26));
      bodyBoxes.push(buildSwatchBox(0.70, 0.46, 0.05, 40, 16, 8, 8, 0.50, 0.06, -0.30, 0, -0.38, 0.20));
      bodyBoxes.push(buildSwatchBox(0.76, 0.10, 0.10, 32, 16, 8, 8, -0.48, 0.28, -0.28, 0, 0.38, -0.26));
      bodyBoxes.push(buildSwatchBox(0.70, 0.46, 0.05, 40, 16, 8, 8, -0.50, 0.06, -0.30, 0, 0.38, -0.20));
      // Spiky dragon tail + skirt!
      bodyBoxes.push(buildSwatchBox(0.78, 0.20, 0.50, 32, 24, 8, 8, 0, -0.32, 0));
      bodyBoxes.push(buildSwatchBox(0.18, 0.18, 0.56, 32, 16, 8, 8, 0, -0.26, -0.44, -0.25, 0, 0));
      bodyBoxes.push(buildSwatchBox(0.08, 0.14, 0.36, 40, 16, 8, 8, 0, -0.16, -0.46, -0.25, 0, 0));
    },
  },

  // 12. 粉粉 (粉色羊, hidden): extra-fluffy cotton-candy pink wool hood + ribbon dress + puff tail!
  pinksheep: {
    name: '粉粉',
    hatTopY: 1.12,
    hairColor: '#ff6b9d',
    bodyColor: '#fff0f6',
    sleeveColor: '#ffdeeb',
    pantsColor: '#fff0f6',
    shoeColor: '#d6336c',
    skinColor: '#ffe3ec',
    swatches: ['#ff8fab', '#ffffff', '#ffd43b', '#ffc2d4', '#ffb3c6', '#fb6f92'],
    face: { skin: '#ffe3ec', hair: '#ff6b9d', bangs: 'parted', eye: '#c2255c', eyeLight: '#ff85a2', blush: '#ff4d8d', mouth: 'open' },
    paintSkin(g) {
      fillNoiseRect(g, 32, 16, 8, 8, ['#ff8fab', '#ffa6c1', '#ffb3c6', '#fb6f92'], 121);
      fillNoiseRect(g, 40, 24, 8, 8, ['#fb6f92', '#ff8fab', '#ffc2d4'], 122);
      // White lace apron with pink heart on front body
      px(g, 4, 20, 6, 7, '#ff8fab');
      px(g, 5, 21, 4, 5, '#ffffff');
      px(g, 6, 22, 2, 2, '#f06595');
    },
    extraParts({ headBoxes, bodyBoxes, buildSwatchBox }) {
      // Extra-fluffy pink cloud wool hood + twin ear puffs + top heart puff!
      headBoxes.push(buildSwatchBox(1.18, 0.26, 1.14, 32, 16, 8, 8, 0, 0.99, -0.02));
      headBoxes.push(buildSwatchBox(1.18, 0.90, 0.36, 32, 16, 8, 8, 0, 0.52, -0.40));
      headBoxes.push(buildSwatchBox(0.20, 0.84, 0.98, 40, 24, 8, 8, -0.55, 0.50, -0.02));
      headBoxes.push(buildSwatchBox(0.20, 0.84, 0.98, 40, 24, 8, 8, 0.55, 0.50, -0.02));
      headBoxes.push(buildSwatchBox(0.28, 0.24, 0.26, 56, 16, 8, 8, -0.68, 0.58, 0.08));
      headBoxes.push(buildSwatchBox(0.28, 0.24, 0.26, 56, 16, 8, 8, 0.68, 0.58, 0.08));
      headBoxes.push(buildSwatchBox(0.26, 0.18, 0.24, 40, 16, 8, 8, 0, 1.14, 0.36));
      // Fluffy pink skirt + puffball tail
      bodyBoxes.push(buildSwatchBox(0.84, 0.24, 0.56, 32, 24, 8, 8, 0, -0.32, 0));
      bodyBoxes.push(buildSwatchBox(0.30, 0.30, 0.28, 32, 16, 8, 8, 0, -0.20, -0.34));
    },
  },
};
