import * as THREE from '../../vendor/three.module.min.js';
import { createCanvas, canvasToTexture, buildBoxUV, buildSwatchBox, fillNoiseRect, shadeHex } from './skins.js';

let cachedCrowdMat = null;
const cachedCrowdGeos = new Map();

function px(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

function paintMobSubAtlas(g, ox, oy, spec) {
  // Base fill for sub-cell (64x64)
  px(g, ox, oy, 64, 64, spec.bodyHex);

  // Unfolded 8x8x8 head at (ox+0, oy+0), front face at (ox+8, oy+8, 8x8)
  const hTop = shadeHex(spec.headHex, 12);
  const hSide = shadeHex(spec.headHex, -10);
  const hBot = shadeHex(spec.headHex, -22);
  px(g, ox + 8, oy + 0, 8, 8, hTop);
  px(g, ox + 16, oy + 0, 8, 8, hBot);
  px(g, ox + 0, oy + 8, 8, 8, hSide);
  px(g, ox + 8, oy + 8, 8, 8, spec.headHex);
  px(g, ox + 16, oy + 8, 8, 8, hSide);
  px(g, ox + 24, oy + 8, 8, 8, hSide);

  // Unfolded 6x7x4 body at (ox+0, oy+16), front at (ox+4, oy+20, 6x7)
  px(g, ox + 4, oy + 16, 6, 4, shadeHex(spec.bodyHex, 12));
  px(g, ox + 0, oy + 20, 20, 7, shadeHex(spec.bodyHex, -8));
  px(g, ox + 4, oy + 20, 6, 7, spec.bodyHex);

  // Unfolded 3x6x3 arms/wings at (ox+20, oy+16)
  px(g, ox + 20, oy + 16, 12, 9, spec.armHex || spec.bodyHex);
  px(g, ox + 23, oy + 19, 3, 6, shadeHex(spec.armHex || spec.bodyHex, 8));

  // Unfolded 3x5x3 legs/hooves at (ox+0, oy+30)
  px(g, ox + 0, oy + 30, 12, 8, spec.legHex || spec.bodyHex);
  if (spec.hoofHex) {
    px(g, ox + 0, oy + 36, 12, 2, spec.hoofHex);
  }

  // Unfolded 6x4x4 extra 3D snout / beak / nose / wool puff at (ox+32, oy+16..24), front at (ox+36, oy+20, 6x4)
  const sBase = spec.snoutHex || spec.headHex;
  px(g, ox + 32, oy + 16, 24, 10, shadeHex(sBase, -8));
  px(g, ox + 36, oy + 16, 6, 4, shadeHex(sBase, 10)); // +y top of snout
  px(g, ox + 36, oy + 20, 6, 4, sBase);               // +z front of snout

  spec.paint(g, ox, oy);
}

const MOB_CELLS = [
  // 0: Pig 🐷 — pink, wide-set MC eyes, 3D snout w/ nostrils
  {
    id: 'pig',
    headHex: '#f59bb2',
    bodyHex: '#f28da8',
    armHex: '#f28da8',
    legHex: '#eb7c9a',
    hoofHex: '#c24d6d',
    snoutHex: '#ffb5c8',
    scale: 0.94,
    headScale: [0.96, 0.92, 0.96],
    bodyScale: [1.06, 0.90, 1.12],
    armScale: [0.85, 0.72, 0.85],
    legScale: [0.95, 0.85, 0.95],
    snout: { dy: -0.09, dz: 0.39, sx: 0.34, sy: 0.21, sz: 0.16 },
    paint(g, ox, oy) {
      fillNoiseRect(g, ox + 8, oy + 8, 8, 8, ['#f59bb2', '#f8a8bd', '#ee8aa4'], 101);
      // Wide-set MC pig eyes + rosy cheeks
      px(g, ox + 8, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 14, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 8, oy + 11, 1, 1, '#1e1b24');
      px(g, ox + 15, oy + 11, 1, 1, '#1e1b24');
      px(g, ox + 9, oy + 13, 1, 1, '#ff6b9d');
      px(g, ox + 14, oy + 13, 1, 1, '#ff6b9d');
      // Nostrils ONLY on front face of snout (ox+36..42, oy+20..24)
      px(g, ox + 37, oy + 21, 1, 2, '#b84262');
      px(g, ox + 40, oy + 21, 1, 2, '#b84262');
    },
  },
  // 1: Chicken 🐔 — white feathers, red wattle, yellow legs, flapping wings, 3D yellow beak
  {
    id: 'chicken',
    headHex: '#ffffff',
    bodyHex: '#f8f9fa',
    armHex: '#ffffff',
    legHex: '#fab005',
    hoofHex: '#e67700',
    snoutHex: '#fcc419',
    scale: 0.84,
    headScale: [0.82, 0.94, 0.82],
    bodyScale: [0.88, 0.84, 1.02],
    armScale: [0.46, 0.78, 1.42], // flat wide wings!
    legScale: [0.76, 0.88, 0.76],
    snout: { dy: -0.03, dz: 0.34, sx: 0.28, sy: 0.14, sz: 0.22 },
    paint(g, ox, oy) {
      px(g, ox + 9, oy + 10, 1, 2, '#18181b');
      px(g, ox + 14, oy + 10, 1, 2, '#18181b');
      // Red wattle under beak + red comb hint on top
      px(g, ox + 11, oy + 13, 2, 2, '#e03131');
      px(g, ox + 11, oy + 2, 2, 4, '#e03131');
    },
  },
  // 2: Cow 🐄 — brown & white milk spots, dark horns, 3D tan muzzle
  {
    id: 'cow',
    headHex: '#5c3d2e',
    bodyHex: '#5c3d2e',
    armHex: '#5c3d2e',
    legHex: '#4a3022',
    hoofHex: '#261a14',
    snoutHex: '#e6ccb2',
    scale: 1.04,
    headScale: [0.98, 0.98, 0.96],
    bodyScale: [1.08, 1.02, 1.08],
    armScale: [0.92, 0.92, 0.92],
    legScale: [0.98, 0.98, 0.98],
    snout: { dy: -0.13, dz: 0.38, sx: 0.42, sy: 0.20, sz: 0.15 },
    paint(g, ox, oy) {
      // White milk patches on head & torso + dark horn tips
      px(g, ox + 10, oy + 8, 3, 3, '#f8f9fa');
      px(g, ox + 8, oy + 8, 1, 2, '#adb5bd');
      px(g, ox + 15, oy + 8, 1, 2, '#adb5bd');
      px(g, ox + 8, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 14, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 8, oy + 11, 1, 1, '#18181b');
      px(g, ox + 15, oy + 11, 1, 1, '#18181b');
      px(g, ox + 4, oy + 20, 3, 3, '#f8f9fa');
      px(g, ox + 7, oy + 23, 3, 3, '#f8f9fa');
      px(g, ox + 37, oy + 21, 1, 2, '#3d281d');
      px(g, ox + 40, oy + 21, 1, 2, '#3d281d');
    },
  },
  // 3: Sheep 🐑 — fluffy cream wool + tan sheep face + 3D wool crown puff
  {
    id: 'sheep',
    headHex: '#fbf8f0',
    bodyHex: '#fbf8f0',
    armHex: '#f5efe0',
    legHex: '#d8bfa9',
    hoofHex: '#5c4033',
    snoutHex: '#ffffff',
    scale: 0.98,
    headScale: [0.98, 0.96, 0.98],
    bodyScale: [1.14, 1.02, 1.16],
    armScale: [0.94, 0.86, 0.94],
    legScale: [0.92, 0.92, 0.92],
    snout: { dy: 0.34, dz: -0.02, sx: 0.80, sy: 0.22, sz: 0.80 },
    paint(g, ox, oy) {
      fillNoiseRect(g, ox + 0, oy + 16, 20, 11, ['#ffffff', '#fbf8f0', '#ede5d2'], 131);
      fillNoiseRect(g, ox + 32, oy + 16, 20, 8, ['#ffffff', '#fbf8f0', '#ede5d2'], 132);
      // Cute tan face inside wool border
      px(g, ox + 9, oy + 10, 6, 5, '#e6c5ad');
      px(g, ox + 9, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 13, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 9, oy + 11, 1, 1, '#261c16');
      px(g, ox + 14, oy + 11, 1, 1, '#261c16');
      px(g, ox + 11, oy + 13, 2, 1, '#ff8fab');
    },
  },
  // 4: Orange Tabby Cat 🐱 — bright ginger stripes, green eyes, 3D cream muzzle
  {
    id: 'cat_tabby',
    headHex: '#f49342',
    bodyHex: '#f49342',
    armHex: '#f49342',
    legHex: '#e67e22',
    hoofHex: '#fff3e0',
    snoutHex: '#fff3e0',
    scale: 0.86,
    headScale: [0.94, 0.90, 0.92],
    bodyScale: [0.88, 0.92, 0.92],
    armScale: [0.82, 0.86, 0.82],
    legScale: [0.86, 0.88, 0.86],
    snout: { dy: -0.10, dz: 0.36, sx: 0.28, sy: 0.16, sz: 0.14 },
    paint(g, ox, oy) {
      px(g, ox + 8, oy + 8, 2, 2, '#d96b1f');
      px(g, ox + 14, oy + 8, 2, 2, '#d96b1f');
      px(g, ox + 9, oy + 11, 2, 2, '#2fb344');
      px(g, ox + 13, oy + 11, 2, 2, '#2fb344');
      px(g, ox + 9, oy + 11, 1, 1, '#a9e34b');
      px(g, ox + 14, oy + 11, 1, 1, '#a9e34b');
      px(g, ox + 5, oy + 20, 4, 6, '#fff3e0');
      px(g, ox + 4, oy + 20, 6, 1, '#e03131'); // red collar
      px(g, ox + 38, oy + 20, 2, 2, '#ff7597'); // pink cat nose on front of muzzle
    },
  },
  // 5: Tuxedo Cat 🐈‍⬛ — sleek charcoal & white bib, amber-green eyes, 3D white muzzle
  {
    id: 'cat_tux',
    headHex: '#25262b',
    bodyHex: '#25262b',
    armHex: '#25262b',
    legHex: '#1a1b1e',
    hoofHex: '#ffffff',
    snoutHex: '#ffffff',
    scale: 0.86,
    headScale: [0.94, 0.90, 0.92],
    bodyScale: [0.88, 0.92, 0.92],
    armScale: [0.82, 0.86, 0.82],
    legScale: [0.86, 0.88, 0.86],
    snout: { dy: -0.10, dz: 0.36, sx: 0.28, sy: 0.16, sz: 0.14 },
    paint(g, ox, oy) {
      px(g, ox + 9, oy + 11, 2, 2, '#ffd43b');
      px(g, ox + 13, oy + 11, 2, 2, '#ffd43b');
      px(g, ox + 10, oy + 11, 1, 2, '#18181b');
      px(g, ox + 13, oy + 11, 1, 2, '#18181b');
      px(g, ox + 10, oy + 13, 4, 3, '#ffffff');
      px(g, ox + 5, oy + 21, 4, 5, '#ffffff');
      px(g, ox + 38, oy + 20, 2, 2, '#ff85a2');
    },
  },
  // 6: Villager 🧑‍🌾 — tan bald head, unibrow, green eyes, brown emerald robe, 3D big nose!
  {
    id: 'villager',
    headHex: '#d49a78',
    bodyHex: '#6c462f',
    armHex: '#7d5238',
    legHex: '#4f3322',
    hoofHex: '#332015',
    snoutHex: '#bc8160',
    scale: 1.02,
    headScale: [0.96, 1.10, 0.96],
    bodyScale: [1.02, 1.06, 1.02],
    armScale: [0.96, 0.96, 0.96],
    legScale: [0.96, 0.98, 0.96],
    snout: { dy: -0.10, dz: 0.39, sx: 0.19, sy: 0.30, sz: 0.17 },
    paint(g, ox, oy) {
      px(g, ox + 9, oy + 10, 6, 1, '#4a2f1d'); // iconic unibrow
      px(g, ox + 9, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 13, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 10, oy + 11, 1, 1, '#2f9e44');
      px(g, ox + 13, oy + 11, 1, 1, '#2f9e44');
      // Emerald robe trim & buckle
      px(g, ox + 5, oy + 20, 4, 7, '#5c3c28');
      px(g, ox + 6, oy + 22, 2, 2, '#40c057');
    },
  },
  // 7: Creeper 💥 — mottled green MC Creeper, iconic black pixel face, NO arms!
  {
    id: 'creeper',
    headHex: '#52b74a',
    bodyHex: '#4cb044',
    armHex: '#4cb044',
    legHex: '#3b9436',
    hoofHex: '#1f2920',
    snoutHex: '#52b74a',
    scale: 1.02,
    headScale: [0.98, 0.98, 0.98],
    bodyScale: [0.84, 1.12, 0.86],
    armScale: [0.001, 0.001, 0.001], // armless Creeper!
    legScale: [1.04, 0.86, 1.16],
    snout: null,
    paint(g, ox, oy) {
      const camo = ['#52b74a', '#69db7c', '#3da838', '#8ce99a', '#2f9e44'];
      fillNoiseRect(g, ox + 0, oy + 0, 32, 16, camo, 171);
      fillNoiseRect(g, ox + 0, oy + 16, 20, 11, camo, 172);
      // Iconic Creeper face on (ox+8, oy+8)
      px(g, ox + 9, oy + 10, 2, 2, '#111812');
      px(g, ox + 13, oy + 10, 2, 2, '#111812');
      px(g, ox + 11, oy + 12, 2, 2, '#111812');
      px(g, ox + 10, oy + 13, 1, 2, '#111812');
      px(g, ox + 13, oy + 13, 1, 2, '#111812');
    },
  },
  // 8: Iron Golem 🤖🌿 — towering silver iron body, red eyes, green vines, 3D iron nose!
  {
    id: 'golem',
    headHex: '#dee2e6',
    bodyHex: '#dee2e6',
    armHex: '#ced4da',
    legHex: '#adb5bd',
    hoofHex: '#868e96',
    snoutHex: '#adb5bd',
    scale: 1.22,
    headScale: [0.88, 1.04, 0.88],
    bodyScale: [1.28, 1.14, 1.16],
    armScale: [1.02, 1.28, 1.02],
    legScale: [1.04, 1.06, 1.04],
    snout: { dy: -0.10, dz: 0.36, sx: 0.16, sy: 0.28, sz: 0.15 },
    paint(g, ox, oy) {
      px(g, ox + 9, oy + 11, 2, 1, '#e03131');
      px(g, ox + 13, oy + 11, 2, 1, '#e03131');
      px(g, ox + 9, oy + 10, 6, 1, '#868e96');
      // Green vines + yellow flower pixels across chest & left arm
      px(g, ox + 4, oy + 20, 2, 3, '#40c057');
      px(g, ox + 5, oy + 22, 2, 3, '#2f9e44');
      px(g, ox + 5, oy + 21, 1, 1, '#ffd43b');
      px(g, ox + 23, oy + 20, 1, 4, '#40c057');
    },
  },
  // 9: Mooshroom 🍄🐄 — bright crimson mushroom cow w/ white spots & pink muzzle!
  {
    id: 'mooshroom',
    headHex: '#d9342b',
    bodyHex: '#c92a2a',
    armHex: '#c92a2a',
    legHex: '#a61e1e',
    hoofHex: '#2b1c17',
    snoutHex: '#f8d7da',
    scale: 1.04,
    headScale: [0.98, 0.98, 0.96],
    bodyScale: [1.08, 1.02, 1.08],
    armScale: [0.92, 0.92, 0.92],
    legScale: [0.98, 0.98, 0.98],
    snout: { dy: -0.13, dz: 0.38, sx: 0.42, sy: 0.20, sz: 0.15 },
    paint(g, ox, oy) {
      px(g, ox + 9, oy + 8, 2, 2, '#ffffff');
      px(g, ox + 13, oy + 9, 2, 2, '#ffffff');
      px(g, ox + 8, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 14, oy + 11, 2, 1, '#ffffff');
      px(g, ox + 8, oy + 11, 1, 1, '#18181b');
      px(g, ox + 15, oy + 11, 1, 1, '#18181b');
      px(g, ox + 4, oy + 21, 2, 2, '#ffffff');
      px(g, ox + 7, oy + 23, 2, 2, '#ffffff');
      px(g, ox + 37, oy + 21, 1, 2, '#802323');
      px(g, ox + 40, oy + 21, 1, 2, '#802323');
    },
  },
];

// Curated front-row (compact cute mobs) & back-row (tall/chunky mobs) rosters so every species shines!
const FRONT_ROSTER = [0, 1, 4, 3, 0, 1, 5, 1, 0, 3, 4, 1]; // pigs, chickens, tabby/tux cats, sheep
const BACK_ROSTER = [2, 6, 7, 8, 9, 6, 2, 3, 6, 8, 2, 7];  // cows, villagers, creepers, iron golems, mooshroom, sheep

function getCrowdMaterial() {
  if (cachedCrowdMat) return cachedCrowdMat;
  const canvas = createCanvas(256, 256);
  const g = canvas.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < MOB_CELLS.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      paintMobSubAtlas(g, col * 64, row * 64, MOB_CELLS[i]);
    }
  }
  const map = canvasToTexture(canvas);
  const mat = new THREE.MeshLambertMaterial({ map });
  mat.customProgramCacheKey = () => 'crowd_mc_mob_atlas_v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * 0.25 + aTile;\n#endif');
  };
  cachedCrowdMat = mat;
  return mat;
}

function getCrowdGeometries(seatSpecs) {
  const sig = seatSpecs.map((s) => s.cellIdx).join(',');
  let geos = cachedCrowdGeos.get(sig);
  if (geos) return geos;

  const n = seatSpecs.length;
  const tileData = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const cIdx = seatSpecs[i].cellIdx;
    const col = cIdx % 4;
    const row = Math.floor(cIdx / 4);
    tileData[i * 2] = col * 0.25;
    tileData[i * 2 + 1] = 0.75 - row * 0.25;
  }
  const tileAttr = new THREE.InstancedBufferAttribute(tileData, 2);

  const headGeo = buildBoxUV(0.72, 0.72, 0.72, 0, 0, 64, 64, 0, 0.36, 0, 0, 0, 0, { pw: 8, ph: 8, pd: 8 });
  const extraGeo = buildBoxUV(1, 1, 1, 32, 16, 64, 64, 0, 0, 0, 0, 0, 0, { pw: 6, ph: 4, pd: 4 });
  const bodyGeo = buildBoxUV(0.58, 0.60, 0.40, 0, 16, 64, 64, 0, 0, 0, 0, 0, 0, { pw: 6, ph: 7, pd: 4 });
  const armGeo = buildBoxUV(0.22, 0.54, 0.22, 20, 16, 64, 64, 0, -0.22, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 });
  const legGeo = buildBoxUV(0.50, 0.40, 0.30, 0, 30, 64, 64, 0, 0, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 });

  for (const g of [headGeo, extraGeo, bodyGeo, armGeo, legGeo]) {
    g.setAttribute('aTile', tileAttr);
  }

  geos = { headGeo, extraGeo, bodyGeo, armGeo, legGeo };
  cachedCrowdGeos.set(sig, geos);
  return geos;
}

/**
 * Instanced Minecraft Mob Bleacher Crowd (§3.4, §10, #149 C1):
 * - Pigs, Chickens, Cows, Mooshroom, Sheep, Cats, Villagers, Creepers, and Iron Golems!
 * - Strictly 6 draw calls total (`head, snout/beak/nose, body, armL, armR, legs` <= 6 budget).
 * - Species-specific comedy reactions: pigs hop high, chickens flap wings wildly, creepers puff-swell, cats wave paws, golems salute!
 */
export function createCrowd(scene, seats = [], ctx = null) {
  const count = Math.max(1, seats.length || 24);
  const actualSeats = seats.length
    ? seats.map((s) => ({ ...s }))
    : Array.from({ length: count }, (_, i) => ({
        x: i < 12 ? 43.6 - (i % 2) * 1.2 : 52.4 + (i % 2) * 1.2,
        y: 8.6 + (i % 2) * 0.8,
        z: 50 + Math.floor((i % 12) / 2) * 1.6,
        yaw: i < 12 ? Math.PI / 2 : -Math.PI / 2,
      }));

  let minSeatY = Infinity;
  for (const s of actualSeats) {
    if (s.y != null && s.y < minSeatY) minSeatY = s.y;
  }
  let frontCounter = 0;
  let backCounter = 0;
  const seatSpecs = actualSeats.map((s, i) => {
    const isBack = Number.isFinite(minSeatY)
      ? (s.y ?? minSeatY) > minSeatY + 0.35
      : i % 2 === 1;
    const cellIdx = isBack
      ? BACK_ROSTER[backCounter++ % BACK_ROSTER.length]
      : FRONT_ROSTER[frontCounter++ % FRONT_ROSTER.length];
    return { seat: s, cellIdx, mob: MOB_CELLS[cellIdx] };
  });

  const mat = getCrowdMaterial();
  const { headGeo, extraGeo, bodyGeo, armGeo, legGeo } = getCrowdGeometries(seatSpecs);

  const n = actualSeats.length;
  const headMesh = new THREE.InstancedMesh(headGeo, mat, n);
  const extraMesh = new THREE.InstancedMesh(extraGeo, mat, n);
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, mat, n);
  const armLMesh = new THREE.InstancedMesh(armGeo, mat, n);
  const armRMesh = new THREE.InstancedMesh(armGeo, mat, n);
  const legMesh = new THREE.InstancedMesh(legGeo, mat, n);

  const meshes = [headMesh, extraMesh, bodyMesh, armLMesh, armRMesh, legMesh]; // 6 draw calls total (<= 6)!
  const group = new THREE.Group();
  group.name = 'bleacher_crowd';

  const tint = new THREE.Color();
  const subtleWoolTints = [0xffffff, 0xfff8f0, 0xffeef2, 0xf3f9ff];
  for (const m of meshes) {
    m.frustumCulled = false;
    group.add(m);
  }
  for (let i = 0; i < n; i++) {
    const mobId = seatSpecs[i].mob.id;
    tint.setHex(mobId === 'sheep' ? subtleWoolTints[i % subtleWoolTints.length] : 0xffffff);
    for (const m of meshes) m.setColorAt(i, tint);
  }
  for (const m of meshes) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  if (scene) scene.add(group);

  let mode = 'idle';
  let modeTimer = 0;
  let time = 0;
  const dummy = new THREE.Object3D();

  function update(dt) {
    if (ctx?.state?.area && ctx.state.area !== 'hub') {
      group.visible = false;
      return;
    }
    group.visible = true;

    time += dt;
    if (modeTimer > 0) {
      modeTimer -= dt;
      if (modeTimer <= 0) mode = 'idle';
    }

    const excited = mode === 'cheer' || mode === 'jump';

    for (let i = 0; i < n; i++) {
      const { seat: s, mob } = seatSpecs[i];
      const ph = i * 0.89;
      const yaw = s.yaw ?? (s.x < 48 ? Math.PI / 2 : -Math.PI / 2);
      const sc = mob.scale;

      let seatY = s.y;
      if (seatY == null) {
        const surf = ctx?.world?.surfaceY?.(Math.floor(s.x), Math.floor(s.z));
        seatY = Number.isFinite(surf) && surf >= 8 ? surf : 8.6;
      }

      // Species-specific comedy hops & puffs!
      let jump = 0;
      let swell = 1;
      if (mob.id === 'pig') {
        if (excited) jump = Math.abs(Math.sin(time * 10.5 + ph)) * 0.56;
        else if (mode === 'clap') jump = Math.abs(Math.sin(time * 8 + ph)) * 0.22;
        else jump = Math.max(0, Math.sin(time * 2.6 + ph) - 0.82) * 0.45; // occasional idle pig oink-hop!
      } else if (mob.id === 'chicken') {
        if (excited) jump = 0.12 + Math.abs(Math.sin(time * 13 + ph)) * 0.42; // flutter-hover!
        else if (mode === 'clap') jump = Math.abs(Math.sin(time * 10 + ph)) * 0.16;
      } else if (mob.id === 'creeper') {
        if (excited) {
          jump = Math.abs(Math.sin(time * 9 + ph)) * 0.30;
          swell = 1 + Math.abs(Math.sin(time * 12 + ph)) * 0.16; // funny Creeper fuse-puff!
        } else if (mode === 'gasp') {
          swell = 1.18;
        }
      } else if (mob.id === 'sheep') {
        if (excited) jump = Math.abs(Math.sin(time * 9.2 + ph)) * 0.38;
      } else {
        if (mode === 'jump') jump = Math.abs(Math.sin(time * 9.5 + ph)) * 0.36;
        else if (mode === 'cheer') jump = Math.abs(Math.sin(time * 7.8 + ph)) * 0.20;
        else if (mode === 'gasp') jump = Math.max(0, Math.sin(time * 6)) * 0.16;
      }

      const baseY = seatY + jump;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const sideX = Math.cos(yaw);
      const sideZ = -Math.sin(yaw);

      const legH = 0.40 * sc * mob.legScale[1];
      const bodyH = 0.60 * sc * mob.bodyScale[1] * swell;

      // 1. Legs
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sc * mob.legScale[0], sc * mob.legScale[1], sc * mob.legScale[2]);
      dummy.position.set(s.x, baseY + legH * 0.5, s.z);
      dummy.updateMatrix();
      legMesh.setMatrixAt(i, dummy.matrix);

      // 2. Body
      dummy.scale.set(sc * mob.bodyScale[0] * swell, sc * mob.bodyScale[1] * swell, sc * mob.bodyScale[2] * swell);
      dummy.position.set(s.x, baseY + legH + bodyH * 0.5, s.z);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);

      // 3. Head
      const headBaseY = baseY + legH + bodyH;
      let headPitch = mode === 'aww' ? 0.25 : mode === 'gasp' ? -0.22 : 0;
      if (mob.id === 'villager' && (excited || mode === 'clap')) {
        headPitch = Math.sin(time * 14 + ph) * 0.22; // enthusiastic "Hrrm!" nods
      } else if (mob.id === 'chicken') {
        headPitch += Math.sin(time * (excited ? 20 : 4.5) + ph) * 0.14; // chicken peck bob
      } else if (mob.id === 'pig' && jump > 0.05) {
        headPitch = -0.18; // happy snout-up oink!
      }
      const headYaw = yaw + Math.sin(time * 2.4 + ph) * (mode === 'aww' ? 0.22 : 0.11);

      dummy.rotation.set(headPitch, headYaw, 0);
      dummy.scale.set(sc * mob.headScale[0] * swell, sc * mob.headScale[1] * swell, sc * mob.headScale[2] * swell);
      dummy.position.set(s.x, headBaseY, s.z);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);

      // 4. Extra 3D snout / beak / villager nose / sheep wool crown (follows head rotation!)
      if (mob.snout) {
        const headCenterY = headBaseY + 0.36 * sc * mob.headScale[1] * swell;
        const dy = mob.snout.dy * sc * swell;
        const dz = mob.snout.dz * sc * swell;
        // Rotate local (0, dy, dz) by headPitch around local X, then headYaw around Y
        const cosP = Math.cos(headPitch);
        const sinP = Math.sin(headPitch);
        const ry = dy * cosP - dz * sinP;
        const rz = dy * sinP + dz * cosP;
        const wx = s.x + Math.sin(headYaw) * rz;
        const wy = headCenterY + ry;
        const wz = s.z + Math.cos(headYaw) * rz;
        dummy.position.set(wx, wy, wz);
        dummy.rotation.set(headPitch, headYaw, 0);
        dummy.scale.set(mob.snout.sx * sc * swell, mob.snout.sy * sc * swell, mob.snout.sz * sc * swell);
      } else {
        dummy.position.set(s.x, baseY, s.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.0001, 0.0001, 0.0001);
      }
      dummy.updateMatrix();
      extraMesh.setMatrixAt(i, dummy.matrix);

      // 5. Arms / Chicken Wings!
      const shoulderHalf = (0.29 * mob.bodyScale[0] + 0.11 * mob.armScale[0]) * sc * swell;
      const shoulderY = baseY + legH + bodyH * 0.92;

      let armPitchL = -0.14 + Math.sin(time * 2.2 + ph) * 0.08;
      let armPitchR = -0.14 - Math.sin(time * 2.2 + ph) * 0.08;
      let armRollL = 0.08;
      let armRollR = -0.08;

      if (mob.id === 'chicken') {
        // Chickens flap wings horizontally on sides!
        const flap = excited || mode === 'clap'
          ? 0.55 + Math.abs(Math.sin(time * 28 + ph)) * 1.10
          : 0.12 + Math.abs(Math.sin(time * 3.5 + ph)) * 0.12;
        armPitchL = 0;
        armPitchR = 0;
        armRollL = flap;
        armRollR = -flap;
      } else if (mob.id === 'cat_tabby' || mob.id === 'cat_tux') {
        if (excited || mode === 'clap') {
          // Lucky-cat alternating beckoning paw wave!
          armPitchL = -2.35 + Math.sin(time * 16 + ph) * 0.45;
          armPitchR = -2.35 - Math.sin(time * 16 + ph) * 0.45;
          armRollL = 0.15;
          armRollR = -0.15;
        }
      } else if (excited) {
        armPitchL = -2.75 + Math.sin(time * 13 + ph) * 0.32;
        armPitchR = -2.75 - Math.sin(time * 13 + ph) * 0.32;
        armRollL = 0.24;
        armRollR = -0.24;
      } else if (mode === 'clap') {
        const clap = Math.sin(time * 18 + ph) * 0.28;
        armPitchL = -1.5;
        armPitchR = -1.5;
        armRollL = -0.25 + clap;
        armRollR = 0.25 - clap;
      } else if (mode === 'gasp') {
        armPitchL = -2.0;
        armPitchR = -2.0;
        armRollL = -0.20;
        armRollR = 0.20;
      }

      dummy.scale.set(sc * mob.armScale[0], sc * mob.armScale[1], sc * mob.armScale[2]);
      dummy.position.set(s.x + sideX * shoulderHalf + fwdX * 0.01, shoulderY, s.z + sideZ * shoulderHalf + fwdZ * 0.01);
      dummy.rotation.set(armPitchL, yaw, armRollL);
      dummy.updateMatrix();
      armLMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(s.x - sideX * shoulderHalf + fwdX * 0.01, shoulderY, s.z - sideZ * shoulderHalf + fwdZ * 0.01);
      dummy.rotation.set(armPitchR, yaw, armRollR);
      dummy.updateMatrix();
      armRMesh.setMatrixAt(i, dummy.matrix);
    }

    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return {
    group,
    drawCalls: meshes.length,
    species: seatSpecs.map((s) => s.mob.id),
    react(kind) {
      mode = kind || 'cheer';
      modeTimer = 2.8;
    },
    update,
  };
}
