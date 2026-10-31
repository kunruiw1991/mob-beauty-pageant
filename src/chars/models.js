import * as THREE from '../../vendor/three.module.min.js';
import {
  buildBoxUV,
  buildSwatchBox,
  mergeGeometries,
  getOrCreateSkinMaterial,
  paintUnfoldedBox,
  createCanvas,
  canvasToTexture,
} from './skins.js';
import { paintChibiFace, drawMobIconCanvas, createEmoteSprite } from './faces.js';
import {
  createAccessoryMesh,
  createCustomVoxelMesh,
  drawAccessoryThumb,
  ACCESSORY_IDS,
} from './accessories.js';
import { applyActorAnim } from './anim.js';
import { CONTESTANT_SPECS } from './contestants.js';
import { NPC_SPECS } from './npcs.js';
import { MOB_SPECS } from './mobs.js';
import { createCrowd } from './crowd.js';
import { createCapes } from './capes.js';

let shadowMat = null;
let shadowGeo = null;
let jellyMat = null;
let poofGeo = null;
let poofMat = null;
let faintStarGeo = null;
let faintStarMat = null;
let faintRingGeo = null;
let faintRingMat = null;
let witherFlashMat = null;
let witherHaloGeo = null;
let witherHaloMat = null;
let nextActorUid = 1;
const partGeoCache = new Map();
const extraGeoCache = new Map();
const _tmpStarVec = new THREE.Vector3();
const _starEuler = new THREE.Euler();
const _starMat4 = new THREE.Matrix4();

export function getBlobShadowMesh(radius = 0.52) {
  if (!shadowMat) {
    const c = createCanvas(32, 32);
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
      grad.addColorStop(0, 'rgba(0,0,0,0.42)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
    }
    shadowMat = new THREE.MeshBasicMaterial({
      map: canvasToTexture(c),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.scale.set(radius * 2, 1, radius * 2);
  m.position.y = 0.025;
  return m;
}

function getJellyMaterial() {
  if (!jellyMat) {
    jellyMat = new THREE.MeshLambertMaterial({
      color: 0x6ce048,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
  }
  return jellyMat;
}

function createPoofRingMesh() {
  if (!poofGeo) {
    poofGeo = new THREE.TorusGeometry(0.42, 0.09, 6, 10);
    poofGeo.rotateX(Math.PI / 2);
    poofMat = new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.85, toneMapped: false });
  }
  const m = new THREE.Mesh(poofGeo, poofMat);
  m.visible = false;
  return m;
}

function makeColoredBox(w, h, d, hex, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) {
    _starEuler.set(0, 0, rz, 'XYZ');
    _starMat4.makeRotationFromEuler(_starEuler);
    g.applyMatrix4(_starMat4);
  }
  const c = new THREE.Color(hex);
  const cnt = g.attributes.position.count;
  const arr = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function createKaiFaintStarsGroup() {
  if (!faintStarGeo) {
    faintStarGeo = mergeGeometries([
      makeColoredBox(0.32, 0.32, 0.11, 0xffd43b, 0),
      makeColoredBox(0.32, 0.32, 0.11, 0xffe066, Math.PI * 0.25),
      makeColoredBox(0.16, 0.16, 0.15, 0xfff9db, 0),
    ]);
    faintStarMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    faintRingGeo = new THREE.TorusGeometry(0.68, 0.028, 6, 24);
    faintRingGeo.rotateX(Math.PI / 2);
    faintRingMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.80,
      toneMapped: false,
    });
  }
  const root = new THREE.Group();
  root.name = 'kaiFaintStars';
  root.visible = false;
  root.rotation.x = 0.24; // slight tilt toward camera so all 3 orbiting stars separate cleanly in 2D!
  const spinner = new THREE.Group();
  const ring = new THREE.Mesh(faintRingGeo, faintRingMat);
  spinner.add(ring);
  const starMeshes = [];
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3;
    const sm = new THREE.Mesh(faintStarGeo, faintStarMat);
    sm.position.set(Math.cos(ang) * 0.68, 0, Math.sin(ang) * 0.68);
    spinner.add(sm);
    starMeshes.push(sm);
  }
  root.add(spinner);
  root.userData.spinner = spinner;
  root.userData.starMeshes = starMeshes;
  return root;
}

function createWitherGlowHalo() {
  if (!witherHaloGeo) {
    const c = createCanvas(64, 64);
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 3, 32, 32, 27);
      grad.addColorStop(0, 'rgba(186,230,253,0.88)');
      grad.addColorStop(0.45, 'rgba(56,189,248,0.52)');
      grad.addColorStop(0.82, 'rgba(56,189,248,0.12)');
      grad.addColorStop(1, 'rgba(56,189,248,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    witherHaloMat = new THREE.MeshBasicMaterial({
      map: canvasToTexture(c),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    witherHaloGeo = new THREE.PlaneGeometry(2.55, 2.55);
  }
  const m = new THREE.Mesh(witherHaloGeo, witherHaloMat);
  m.position.set(0, 1.52, -0.34);
  m.visible = false;
  return m;
}

function paintStandardAtlas(g, spec) {
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = spec.bodyColor || '#68b5ff';
  g.fillRect(0, 0, 64, 64);

  // 1. Head box (u0=0, v0=0, pw=8, ph=8, pd=8)
  paintUnfoldedBox(g, 0, 0, 8, 8, 8, spec.hairColor || '#4a3228', 11);
  paintChibiFace(g, 8, 8, spec.face || {});

  // 2. Body box (u0=0, v0=16, pw=6, ph=7, pd=4)
  paintUnfoldedBox(g, 0, 16, 6, 7, 4, spec.bodyColor || '#68b5ff', 21);

  // 3. Arms box (u0=20, v0=16, pw=3, ph=6, pd=3)
  paintUnfoldedBox(g, 20, 16, 3, 6, 3, spec.sleeveColor || spec.bodyColor || '#68b5ff', 31);
  // Cute skin hands on bottom 2 rows of arm faces (y = 23..24)
  if (spec.skinColor && !spec.mobRigType) {
    g.fillStyle = spec.skinColor;
    g.fillRect(20, 23, 12, 2);
  }

  // 4. Legs box (u0=0, v0=30, pw=3, ph=5, pd=3)
  paintUnfoldedBox(g, 0, 30, 3, 5, 3, spec.pantsColor || '#334155', 41);
  if (spec.shoeColor) {
    g.fillStyle = spec.shoeColor;
    g.fillRect(0, 36, 12, 2);
    g.fillStyle = '#ffffff';
    g.fillRect(3, 37, 3, 1); // cute shoe toe highlight
  }

  // 5. Swatch tiles (S0..S5)
  const sw = spec.swatches || [];
  const coords = [
    [32, 16], [40, 16], [48, 16], [56, 16],
    [32, 24], [40, 24],
  ];
  for (let i = 0; i < coords.length; i++) {
    g.fillStyle = sw[i] || spec.bodyColor || '#ffffff';
    g.fillRect(coords[i][0], coords[i][1], 8, 8);
  }

  if (spec.paintSkin) spec.paintSkin(g);
}

export function buildChibiActor(kind, spec, opts = {}, ctx = null) {
  const baseMat = getOrCreateSkinMaterial(`char_${kind}`, (g) => paintStandardAtlas(g, spec));
  let mat = baseMat;
  if (kind === 'wither') {
    if (!witherFlashMat) {
      witherFlashMat = baseMat.clone();
      witherFlashMat.emissive = new THREE.Color(0x000000);
      witherFlashMat.emissiveMap = baseMat.map;
      witherFlashMat.emissiveIntensity = 0;
    }
    if (!opts.lineup) {
      mat = witherFlashMat;
    }
  }

  const group = new THREE.Group();
  group.name = `actor_${kind}`;
  const rig = new THREE.Group();
  group.add(rig);

  const isQuad = spec.mobRigType === 'quadruped';
  const qd = spec.quadDims;

  const legH = isQuad ? qd.legH : (spec.legH ?? 0.55);
  const bodyH = isQuad ? qd.bodyH : (spec.bodyH ?? 0.80);
  const bodyW = isQuad ? qd.bodyW : (spec.bodyW ?? 0.70);
  const bodyD = isQuad ? qd.bodyD : (spec.bodyD ?? 0.45);
  const headS = isQuad ? qd.headS : (spec.headS ?? 1.0);
  const limbW = isQuad ? qd.legW : (spec.limbW ?? 0.30);

  let cached = partGeoCache.get(kind);
  if (!cached) {
    const headBoxes = [buildBoxUV(headS, headS, headS, 0, 0, 64, 64, 0, headS * 0.5, 0, 0, 0, 0, { pw: 8, ph: 8, pd: 8 })];
    const bodyBoxes = [buildBoxUV(bodyW, bodyH, bodyD, 0, 16, 64, 64, 0, 0, 0, 0, 0, 0, { pw: 6, ph: 7, pd: 4 })];

    let armLBoxes, armRBoxes, legLBoxes, legRBoxes;
    if (spec.mobRigType === 'bee') {
      // Fluttering horizontal wings on top of bee body!
      armLBoxes = [buildBoxUV(0.52, 0.05, 0.34, 20, 16, 64, 64, 0.26, 0, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      armRBoxes = [buildBoxUV(0.52, 0.05, 0.34, 20, 16, 64, 64, -0.26, 0, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      legLBoxes = [buildBoxUV(0.10, 0.14, 0.42, 0, 30, 64, 64, 0, -0.07, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      legRBoxes = [buildBoxUV(0.10, 0.14, 0.42, 0, 30, 64, 64, 0, -0.07, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
    } else if (spec.mobRigType === 'chicken') {
      armLBoxes = [buildBoxUV(0.10, 0.32, 0.42, 20, 16, 64, 64, 0.05, -0.16, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      armRBoxes = [buildBoxUV(0.10, 0.32, 0.42, 20, 16, 64, 64, -0.05, -0.16, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      legLBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      legRBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
    } else if (isQuad) {
      armLBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      armRBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      legLBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      legRBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
    } else {
      armLBoxes = [buildBoxUV(limbW, bodyH * 0.92, limbW, 20, 16, 64, 64, 0, -bodyH * 0.40, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      armRBoxes = [buildBoxUV(limbW, bodyH * 0.92, limbW, 20, 16, 64, 64, 0, -bodyH * 0.40, 0, 0, 0, 0, { pw: 3, ph: 6, pd: 3 })];
      legLBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
      legRBoxes = [buildBoxUV(limbW, legH, limbW, 0, 30, 64, 64, 0, -legH * 0.5, 0, 0, 0, 0, { pw: 3, ph: 5, pd: 3 })];
    }

    if (spec.extraParts) {
      spec.extraParts({
        headBoxes,
        bodyBoxes,
        armLBoxes,
        armRBoxes,
        legLBoxes,
        legRBoxes,
        buildBoxUV,
        buildSwatchBox,
      });
    }

    cached = {
      head: mergeGeometries(headBoxes),
      body: mergeGeometries(bodyBoxes),
      armL: mergeGeometries(armLBoxes),
      armR: mergeGeometries(armRBoxes),
      legL: mergeGeometries(legLBoxes),
      legR: mergeGeometries(legRBoxes),
    };
    partGeoCache.set(kind, cached);
  }

  const head = new THREE.Mesh(cached.head, mat);
  const body = new THREE.Mesh(cached.body, mat);
  const armL = new THREE.Mesh(cached.armL, mat);
  const armR = new THREE.Mesh(cached.armR, mat);
  const legL = new THREE.Mesh(cached.legL, mat);
  const legR = new THREE.Mesh(cached.legR, mat);

  if (isQuad) {
    // 4-legged quadruped placement (armL/armR = front legs, legL/legR = back legs)
    armL.position.set(bodyW * 0.30, legH, bodyD * 0.32);
    armR.position.set(-bodyW * 0.30, legH, bodyD * 0.32);
    legL.position.set(bodyW * 0.30, legH, -bodyD * 0.32);
    legR.position.set(-bodyW * 0.30, legH, -bodyD * 0.32);
    body.position.set(0, legH + bodyH * 0.45, 0);
    head.position.set(0, qd.headY, qd.headZ);
  } else if (spec.mobRigType === 'bee') {
    body.position.set(0, bodyH * 0.5 + legH, 0);
    armL.position.set(0.14, legH + bodyH + 0.02, -0.04);
    armR.position.set(-0.14, legH + bodyH + 0.02, -0.04);
    legL.position.set(0.18, legH, 0);
    legR.position.set(-0.18, legH, 0);
    head.position.set(0, legH + bodyH * 0.5, bodyD * 0.5);
  } else if (spec.mobRigType === 'slime') {
    body.position.set(0, 0.05, 0);
    armL.position.set(0, 0.05, 0);
    armR.position.set(0, 0.05, 0);
    legL.position.set(0, 0.05, 0);
    legR.position.set(0, 0.05, 0);
    head.position.set(0, 0.14, 0);
  } else {
    legL.position.set(bodyW * 0.24, legH, 0);
    legR.position.set(-bodyW * 0.24, legH, 0);
    body.position.set(0, legH + bodyH * 0.5, 0);
    armL.position.set(bodyW * 0.5 + limbW * 0.5, legH + bodyH * 0.92, 0);
    armR.position.set(-(bodyW * 0.5 + limbW * 0.5), legH + bodyH * 0.92, 0);
    head.position.set(0, legH + bodyH, 0);
  }

  const parts = { head, body, armL, armR, legL, legR };
  for (const p of Object.values(parts)) {
    p.userData.restPos = p.position.clone();
    p.userData.restRot = p.rotation.clone();
    rig.add(p);
  }

  // Translucent outer jelly shell for 啵啵 (slime) and slimeMob!
  if (spec.hasJellyShell) {
    let jGeo = extraGeoCache.get('jellyShell');
    if (!jGeo) {
      const jBoxes = [
        new THREE.BoxGeometry(1.06, 1.06, 1.06),
        new THREE.BoxGeometry(0.32, 0.32, 0.32),
        new THREE.BoxGeometry(0.32, 0.32, 0.32),
      ];
      jBoxes[0].translate(0, 0.50, 0);
      jBoxes[1].translate(-0.52, 0.92, 0);
      jBoxes[2].translate(0.52, 0.92, 0);
      jGeo = mergeGeometries(jBoxes);
      extraGeoCache.set('jellyShell', jGeo);
    }
    const jellyMesh = new THREE.Mesh(jGeo, getJellyMaterial());
    jellyMesh.renderOrder = 5;
    head.add(jellyMesh);
    parts.jellyShell = jellyMesh;
  } else if (spec.hasSlimeOuterCube) {
    let outerGeo = extraGeoCache.get('slimeOuterCube');
    if (!outerGeo) {
      outerGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
      outerGeo.translate(0, 0.34, 0);
      extraGeoCache.set('slimeOuterCube', outerGeo);
    }
    const outerMesh = new THREE.Mesh(outerGeo, getJellyMaterial());
    outerMesh.renderOrder = 5;
    head.add(outerMesh);
    parts.jellyShell = outerMesh;
  }

  // Default straw hat on 翠翠 (villager) in world using her own skin material (0 extra material switches!);
  // auto-hidden when Booth equips a slot-0 hat!
  let defaultHatMesh = null;
  if (spec.hasDefaultStrawHat) {
    let hatGeo = extraGeoCache.get('defaultStrawHat');
    if (!hatGeo) {
      hatGeo = mergeGeometries([
        buildSwatchBox(1.40, 0.07, 1.40, 32, 16, 8, 8, 0, 0.035, 0),
        buildSwatchBox(0.88, 0.26, 0.88, 32, 16, 8, 8, 0, 0.19, 0),
        buildSwatchBox(0.91, 0.08, 0.91, 40, 16, 8, 8, 0, 0.11, 0),
      ]);
      extraGeoCache.set('defaultStrawHat', hatGeo);
    }
    defaultHatMesh = new THREE.Mesh(hatGeo, mat);
    defaultHatMesh.position.set(0, headS, 0);
    head.add(defaultHatMesh);
  }

  // Removable carved pumpkin / wither skull helmet for snowGolemMob & witherSkeleton!
  let helmetMesh = null;
  if (spec.hasHelmet) {
    const isPumpkin = spec.hasHelmet === 'pumpkin';
    const hMat = getOrCreateSkinMaterial(`helmet_${spec.hasHelmet}`, (g) => {
      g.fillStyle = isPumpkin ? '#e86810' : '#1b1920';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = isPumpkin ? '#f77f00' : '#26232d';
      g.fillRect(8, 8, 8, 8);
      g.fillStyle = isPumpkin ? '#2b1404' : '#09090c';
      g.fillRect(9, 10, 2, 2);
      g.fillRect(13, 10, 2, 2);
      g.fillRect(10, 13, 4, 2);
      if (isPumpkin) {
        g.fillStyle = '#37b24d';
        g.fillRect(11, 3, 2, 2);
      }
    });
    const hKey = `helmet_${spec.hasHelmet}`;
    let hGeo = extraGeoCache.get(hKey);
    if (!hGeo) {
      const hs = isPumpkin ? 0.94 : 0.90;
      hGeo = buildBoxUV(hs, hs, hs, 0, 0, 64, 64, 0, hs * 0.46, 0, 0, 0, 0, { pw: 8, ph: 8, pd: 8 });
      extraGeoCache.set(hKey, hGeo);
    }
    helmetMesh = new THREE.Mesh(hGeo, hMat);
    head.add(helmetMesh);
    parts.helmet = helmetMesh;
  }

  // Toggleable slapstick gag props for rival 小凯 (cake face, snowman bury, 4-tier wobbling finale junk-hat tower, faint stars!)
  let kaiCakeMesh = null;
  let kaiCakeExplicit = false;
  let kaiFinaleGroup = null;
  let kaiJunkTiers = null;
  let kaiFaintStars = null;
  if (spec.hasKaiProps) {
    kaiCakeMesh = createAccessoryMesh('chefHat');
    kaiCakeMesh.scale.set(0.65, 0.55, 0.35);
    kaiCakeMesh.rotation.x = Math.PI / 2;
    kaiCakeMesh.position.set(0, 0.45, 0.52);
    kaiCakeMesh.visible = false;
    head.add(kaiCakeMesh);

    kaiFinaleGroup = new THREE.Group();

    // Outer-cheek frosting smudge (far on side cheek so eyes + mischievous grin stay 100% clear!)
    const cheekDab = createCustomVoxelMesh('kaiCheekDab', (vox, b) => {
      b.push(vox(0.15, 0.14, 0.08, 0xfff8f0, -0.43, 0.27, 0.46));
      b.push(vox(0.10, 0.09, 0.09, 0xff8fab, -0.44, 0.29, 0.48));
    });
    kaiFinaleGroup.add(cheekDab);

    // Tier 1 (base on head): Crooked carved jack-o'-lantern facing camera (+Z)
    const tier1 = new THREE.Group();
    tier1.position.set(0, 0.94, 0);
    const pHat = createAccessoryMesh('pumpkinHat');
    pHat.scale.set(0.90, 0.84, 0.90);
    tier1.add(pHat);

    // Tier 2 (hinged on pumpkin top): Sloppy snow-fort clump + dripping golden honey + frosted cake slice
    const tier2 = new THREE.Group();
    tier2.position.set(0.03, 0.43, 0);
    const snowHoney = createCustomVoxelMesh('kaiJunkSnowHoney', (vox, b) => {
      // Fluffy snow cushion
      b.push(vox(0.66, 0.20, 0.66, 0xffffff, 0, 0.10, 0));
      b.push(vox(0.54, 0.07, 0.54, 0xe7f5ff, -0.03, 0.22, 0.02));
      // Dripping golden honey puddle oozing over front-right edge
      b.push(vox(0.72, 0.09, 0.68, 0xfcc419, 0.04, 0.03, 0.02));
      b.push(vox(0.14, 0.19, 0.12, 0xf59f00, 0.27, -0.06, 0.31));
      b.push(vox(0.12, 0.14, 0.12, 0xf59f00, -0.23, -0.04, 0.31));
      // Mini strawberry cake wedge stuck on left rim
      b.push(vox(0.22, 0.14, 0.20, 0xfff0f6, -0.21, 0.25, 0.15, 0, 0, 0.18));
      b.push(vox(0.09, 0.09, 0.09, 0xe03131, -0.23, 0.34, 0.17));
    });
    tier2.add(snowHoney);
    tier1.add(tier2);

    // Tier 3 (hinged on snow/honey): Jiggling green pet slime cube facing camera (+Z)
    const tier3 = new THREE.Group();
    tier3.position.set(-0.04, 0.24, 0);
    const sHat = createAccessoryMesh('slimeHat');
    sHat.scale.set(0.80, 0.74, 0.80);
    tier3.add(sHat);
    tier2.add(tier3);

    // Tier 4 (hinged at peak): Teetering striped party cone + white pom-pom!
    const tier4 = new THREE.Group();
    tier4.position.set(0.03, 0.35, 0);
    const coneHat = createAccessoryMesh('partyHat');
    coneHat.scale.set(0.74, 0.72, 0.74);
    tier4.add(coneHat);
    tier3.add(tier4);

    kaiFinaleGroup.add(tier1);
    kaiJunkTiers = [tier1, tier2, tier3, tier4];
    kaiFinaleGroup.visible = !!opts.finale;
    head.add(kaiFinaleGroup);

    kaiFaintStars = createKaiFaintStarsGroup();
    group.add(kaiFaintStars);
    parts.kaiFaintStars = kaiFaintStars;
  }

  const poofRing = createPoofRingMesh();
  group.add(poofRing);
  parts.poofRing = poofRing;

  // Head Anchors for accessories (slot 0 = center head; slots 1 & 2 = 三三's left/right shoulder skulls!)
  const headAnchors = [];
  const mainAnchor = new THREE.Group();
  mainAnchor.position.set(0, spec.hatTopY ?? (kind === 'slime' ? 1.04 : headS), 0);
  head.add(mainAnchor);
  headAnchors.push(mainAnchor);

  const faceAnchor = new THREE.Group();
  faceAnchor.position.set(0, headS, 0);
  head.add(faceAnchor);

  const neckAnchor = new THREE.Group();
  neckAnchor.position.set(0, bodyH * 0.5, 0);
  body.add(neckAnchor);

  let witherGlowHalo = null;
  let sneezeKeyLight = null;
  let sneezeFillLight = null;
  if (kind === 'wither') {
    const leftAnchor = new THREE.Group();
    leftAnchor.position.set(0.74, 0.70, 0.10);
    leftAnchor.scale.setScalar(0.50);
    body.add(leftAnchor);
    const rightAnchor = new THREE.Group();
    rightAnchor.position.set(-0.74, 0.70, 0.10);
    rightAnchor.scale.setScalar(0.50);
    body.add(rightAnchor);
    headAnchors.push(leftAnchor, rightAnchor);

    witherGlowHalo = createWitherGlowHalo();
    group.add(witherGlowHalo);
    parts.witherGlowHalo = witherGlowHalo;

    if (!opts.lineup) {
      sneezeKeyLight = new THREE.PointLight(0xe0f2fe, 0, 14.0, 0.85);
      sneezeKeyLight.position.set(0.20, 2.05, 2.15);
      group.add(sneezeKeyLight);
      sneezeFillLight = new THREE.PointLight(0xbae6fd, 0, 10.0, 1.0);
      sneezeFillLight.position.set(-1.10, 2.10, 1.45);
      group.add(sneezeFillLight);
    }
  }

  const shadow = getBlobShadowMesh(spec.shadowRadius ?? 0.52);
  group.add(shadow);
  parts.shadow = shadow;

  if (kind === 'slimeMob') {
    const s = (opts.size || 1) === 2 ? 1.35 : 0.72;
    group.scale.setScalar(s);
  }

  if (opts.pos) {
    group.position.set(opts.pos.x || 0, opts.pos.y || 0, opts.pos.z || 0);
  }

  const attachedAcc = [null, null, null];
  let emoteSprite = null;
  let moveTarget = null;
  let moveSpeed = 4.3;

  const topHeight = isQuad ? qd.headY + headS : spec.mobRigType === 'bee' ? 1.35 : legH + bodyH + Math.max(headS, kind === 'slime' ? 1.06 : headS);

  const actor = {
    id: opts.id || `${kind}_${nextActorUid++}`,
    kind,
    group,
    rig,
    parts,
    headAnchors,
    mobRigType: spec.mobRigType || null,
    baseLift: spec.baseLift || 0,
    anim: opts.anim || 'idle',
    animTime: 0,
    finaleActive: !!opts.finale,
    phase: (nextActorUid * 1.618) % (Math.PI * 2),
    hitRadius: kind === 'slimeMob' ? 0.55 * ((opts.size || 1) === 2 ? 1.35 : 0.72) : (spec.hitRadius ?? 0.65),
    _lastFrame: -1,
    _faintCutSynced: false,
    _faintInGagCam: false,
    _faintSpringAt: 0.96,
    _sneezeFlashOn: false,
    _sneezeFlashTimer: 0,
    _sneezeBurstTimer: 0,

    setAnim(name) {
      const next = name || 'idle';
      if (actor.anim !== next) {
        actor.anim = next;
        actor.animTime = 0;
        if (next === 'faint') {
          actor._faintCutSynced = false;
          actor._faintInGagCam = false;
          actor._faintSpringAt = 0.96;
        } else if (next === 'sneeze' && kind === 'wither') {
          actor._sneezeFlashTimer = Math.max(actor._sneezeFlashTimer, 3.4);
          actor._sneezeBurstTimer = 0.55;
        }
      }
      if (kaiCakeMesh && !kaiCakeExplicit) {
        kaiCakeMesh.visible = !actor.finaleActive && next === 'eat';
      }
    },

    setSneezeFlash(active = true) {
      const on = !!active;
      actor._sneezeFlashOn = on;
      if (on) {
        actor._sneezeFlashTimer = Math.max(actor._sneezeFlashTimer, 3.4);
        actor._sneezeBurstTimer = 0.55;
      } else {
        actor._sneezeFlashTimer = 0;
        actor._sneezeBurstTimer = 0;
      }
    },

    _syncKaiFaintStars() {
      if (!kaiFaintStars) return;
      const show = (actor.anim === 'faint' || actor.anim === 'dizzy') && !actor.finaleActive;
      kaiFaintStars.visible = show;
      if (!show) return;
      head.updateWorldMatrix(true, false);
      group.updateWorldMatrix(true, false);
      _tmpStarVec.set(0, headS * 0.5, 0);
      head.localToWorld(_tmpStarVec);
      group.worldToLocal(_tmpStarVec);
      kaiFaintStars.position.set(_tmpStarVec.x, Math.max(1.22, _tmpStarVec.y + 0.76), _tmpStarVec.z);
      const spinner = kaiFaintStars.userData.spinner;
      const starMeshes = kaiFaintStars.userData.starMeshes;
      const spinT = actor.animTime * 5.8 + 0.62;
      if (spinner) spinner.rotation.y = spinT;
      if (starMeshes) {
        for (let i = 0; i < starMeshes.length; i++) {
          starMeshes[i].position.y = Math.sin(spinT * 1.4 + i * 2.09) * 0.06;
          starMeshes[i].rotation.y = -spinT + i * 1.1;
          starMeshes[i].rotation.z = Math.sin(spinT * 2.0 + i) * 0.22;
        }
      }
      for (const hc of head.children) {
        if (hc !== kaiFinaleGroup && hc !== mainAnchor && hc !== faceAnchor && hc.isGroup && hc.position.y > 1.15) {
          hc.visible = false;
        }
      }
    },

    setAccessory(accId, slot = 0) {
      const idx = Math.max(0, Math.min(headAnchors.length - 1, slot | 0));
      const anchor = headAnchors[idx];
      if (!anchor) return;
      while (anchor.children.length) anchor.remove(anchor.children[0]);
      if (idx === 0) {
        while (faceAnchor.children.length) faceAnchor.remove(faceAnchor.children[0]);
        while (neckAnchor.children.length) neckAnchor.remove(neckAnchor.children[0]);
      }
      attachedAcc[idx] = accId || null;
      if (idx === 0 && defaultHatMesh) {
        defaultHatMesh.visible = !accId || accId === 'sunglasses' || accId === 'scarf';
      }
      if (accId) {
        const mesh = createAccessoryMesh(accId);
        if (mesh) {
          if (idx === 0 && accId === 'scarf') {
            neckAnchor.add(mesh);
          } else if (idx === 0 && (accId === 'sunglasses' || accId === 'starClip' || accId === 'headphones')) {
            faceAnchor.add(mesh);
          } else {
            anchor.add(mesh);
          }
        }
      }
    },

    clearAccessories() {
      for (let i = 0; i < headAnchors.length; i++) {
        while (headAnchors[i].children.length) headAnchors[i].remove(headAnchors[i].children[0]);
        attachedAcc[i] = null;
      }
      while (faceAnchor.children.length) faceAnchor.remove(faceAnchor.children[0]);
      while (neckAnchor.children.length) neckAnchor.remove(neckAnchor.children[0]);
      if (defaultHatMesh) defaultHatMesh.visible = true;
    },

    getAccessories() {
      return attachedAcc.filter(Boolean);
    },

    setHelmet(visible) {
      if (helmetMesh) helmetMesh.visible = !!visible;
    },

    popHead() {
      if (helmetMesh) helmetMesh.visible = false;
    },

    setCakeFace(visible) {
      kaiCakeExplicit = !!visible;
      if (kaiCakeMesh) kaiCakeMesh.visible = !!visible;
    },

    setFinaleJunk(visible) {
      const on = !!visible;
      actor.finaleActive = on;
      if (kaiFinaleGroup) kaiFinaleGroup.visible = on;
      if (on && kaiCakeMesh) {
        kaiCakeExplicit = false;
        kaiCakeMesh.visible = false;
      }
    },

    setDyedPink(pink = true) {
      if (kind === 'sheepMob' && pink) {
        const pinkMat = getOrCreateSkinMaterial('char_pinksheepMob', (g) => {
          paintStandardAtlas(g, {
            ...MOB_SPECS.sheepMob,
            hairColor: '#ff8fab',
            bodyColor: '#ff8fab',
            swatches: ['#ff8fab', '#ff6b9d', '#e6c5ad', '#5c4033', '#ffb3c6', '#ffc2d4'],
            paintSkin(gg) {
              gg.fillStyle = '#ff8fab';
              gg.fillRect(0, 16, 20, 12);
              gg.fillRect(32, 16, 8, 8);
            },
          });
        });
        for (const k of ['head', 'body', 'armL', 'armR', 'legL', 'legR']) {
          if (parts[k]) parts[k].material = pinkMat;
        }
      }
    },

    setEmote(icon) {
      if (emoteSprite) {
        group.remove(emoteSprite);
        emoteSprite = null;
      }
      if (icon) {
        emoteSprite = createEmoteSprite(icon);
        if (emoteSprite) {
          emoteSprite.position.set(0, topHeight + 0.65, 0);
          group.add(emoteSprite);
        }
      }
    },

    lookAt(pos) {
      if (!pos) return;
      const dx = (pos.x ?? 0) - group.position.x;
      const dz = (pos.z ?? 0) - group.position.z;
      if (dx * dx + dz * dz > 1e-6) {
        group.rotation.y = Math.atan2(dx, dz);
      }
    },

    moveTo(pos, speed = 4.3) {
      if (!pos) {
        moveTarget = null;
        return;
      }
      moveTarget = { x: pos.x ?? group.position.x, y: pos.y ?? group.position.y, z: pos.z ?? group.position.z };
      moveSpeed = speed > 0 ? speed : 4.3;
      actor.lookAt(moveTarget);
      if (actor.anim === 'idle') actor.setAnim(moveSpeed > 5 ? 'run' : 'walk');
    },

    stopMove() {
      moveTarget = null;
      if (actor.anim === 'walk' || actor.anim === 'run') actor.setAnim('idle');
    },

    setVisible(b) {
      group.visible = !!b;
    },

    update(dt) {
      if (ctx?.frame !== undefined && opts.dedupeFrame !== false) {
        if (actor._lastFrame === ctx.frame) return;
        actor._lastFrame = ctx.frame;
      }

      if (kind === 'kai' && !opts.finale) {
        const sc = ctx?.state?.scene;
        if (sc === 'finale') {
          actor.finaleActive = true;
          if (kaiFinaleGroup) kaiFinaleGroup.visible = true;
          if (kaiCakeMesh) {
            kaiCakeExplicit = false;
            kaiCakeMesh.visible = false;
          }
        } else if (sc === 'title' || sc === 'world') {
          if (actor.finaleActive) {
            actor.finaleActive = false;
            if (kaiFinaleGroup) kaiFinaleGroup.visible = false;
          }
        }
      }

      if (moveTarget) {
        const dx = moveTarget.x - group.position.x;
        const dy = moveTarget.y - group.position.y;
        const dz = moveTarget.z - group.position.z;
        const dist = Math.hypot(dx, dz);
        const step = moveSpeed * dt;
        if (dist <= step || dist < 0.02) {
          group.position.set(moveTarget.x, moveTarget.y, moveTarget.z);
          moveTarget = null;
          if (actor.anim === 'walk' || actor.anim === 'run') {
            actor.setAnim(kind === 'kai' && actor.finaleActive ? 'strut' : 'idle');
          }
        } else {
          group.position.x += (dx / dist) * step;
          group.position.z += (dz / dist) * step;
          group.position.y += dy * Math.min(1, dt * 10);
          group.rotation.y = Math.atan2(dx, dz);
        }
      }

      // Lock 小凯 facing directly toward the runway camera throughout finale (#155 C2)
      const kaiInFinale = kind === 'kai' && (actor.finaleActive || ctx?.state?.scene === 'finale');
      if (kaiInFinale) {
        const camPos = ctx?.camera?.position || ctx?.cam?.camera?.position;
        if (camPos) {
          const cdx = camPos.x - group.position.x;
          const cdz = camPos.z - group.position.z;
          group.rotation.y = cdx * cdx + cdz * cdz > 1e-4 ? Math.atan2(cdx, cdz) : 0;
        } else {
          group.rotation.y = 0;
        }
      }

      // Sync 小凯 faint timeline to the exact frame Gag-Cam cuts onto him (when queued behind emerald_eyes, #183 R1)
      let animDt = dt;
      if (kind === 'kai' && actor.anim === 'faint' && !actor.finaleActive) {
        const gagActive = !!ctx?.state?.gagCam?.active;
        if (!actor._faintCutSynced) {
          if (gagActive) {
            const ct = ctx?.cam?.target;
            const nearKai = ct ? Math.hypot(ct.x - group.position.x, ct.z - group.position.z) < 4.5 : true;
            if (!nearKai) {
              actor.animTime = 0;
              animDt = 0;
            } else {
              actor._faintCutSynced = true;
              actor._faintInGagCam = true;
              actor.animTime = 0;
              actor._faintSpringAt = 1.45;
              animDt = 0;
            }
          } else {
            actor._faintCutSynced = true;
            actor._faintInGagCam = false;
            actor._faintSpringAt = 0.96;
          }
        } else if (actor._faintInGagCam && !gagActive) {
          actor._faintInGagCam = false;
          actor._faintSpringAt = Math.min(actor._faintSpringAt, Math.max(0.45, actor.animTime));
        }
      }

      applyActorAnim(actor, animDt);

      if (kind === 'kai' && actor.anim === 'faint' && actor._faintCutSynced && actor.animTime >= actor._faintSpringAt + 0.25) {
        actor.animTime -= actor._faintSpringAt + 0.25;
        actor.anim = 'dizzy';
      }

      if (kaiFaintStars) {
        actor._syncKaiFaintStars();
      }

      // #183 R2: Emissive soul-cyan flash + front key/fill lighting + rim halo on 三三 (wither) in Nether summon!
      if (kind === 'wither' && !opts.lineup) {
        if (actor._sneezeFlashTimer > 0) actor._sneezeFlashTimer = Math.max(0, actor._sneezeFlashTimer - dt);
        if (actor._sneezeBurstTimer > 0) actor._sneezeBurstTimer = Math.max(0, actor._sneezeBurstTimer - dt);
        const inWorld = !ctx?.state?.scene || ctx.state.scene === 'world';
        const spawningGlow = inWorld && ctx?.state?.area === 'nether' && actor.anim === 'spawn';
        const flashActive = inWorld && (actor._sneezeFlashOn || actor._sneezeFlashTimer > 0 || actor.anim === 'sneeze');
        if (flashActive && witherFlashMat) {
          const burst = actor._sneezeBurstTimer > 0 ? (actor._sneezeBurstTimer / 0.55) : 0;
          const pulse = 0.38 + Math.sin(actor.animTime * 10.0) * 0.05 + burst * 0.36;
          witherFlashMat.emissive.setHex(0xbae6fd);
          witherFlashMat.emissiveIntensity = pulse;
          if (sneezeKeyLight) sneezeKeyLight.intensity = 4.5 + burst * 1.8;
          if (sneezeFillLight) sneezeFillLight.intensity = 2.6 + burst * 1.0;
          if (witherGlowHalo) {
            witherGlowHalo.visible = true;
            const hs = 1.0 + burst * 0.22 + Math.sin(actor.animTime * 8.0) * 0.04;
            witherGlowHalo.scale.set(hs, hs, 1);
          }
        } else if (spawningGlow && witherFlashMat) {
          witherFlashMat.emissive.setHex(0x93c5fd);
          witherFlashMat.emissiveIntensity = 0.35;
          if (sneezeKeyLight) sneezeKeyLight.intensity = 2.8;
          if (sneezeFillLight) sneezeFillLight.intensity = 1.6;
          if (witherGlowHalo) witherGlowHalo.visible = false;
        } else {
          if (witherFlashMat && actor.group.parent) {
            witherFlashMat.emissiveIntensity = 0;
          }
          if (sneezeKeyLight) sneezeKeyLight.intensity = 0;
          if (sneezeFillLight) sneezeFillLight.intensity = 0;
          if (witherGlowHalo) witherGlowHalo.visible = false;
        }
      }

      // Cascading 4-tier spring/pendulum wobble on 小凯's finale junk-hat tower (#155 C2)
      if (kaiFinaleGroup && kaiFinaleGroup.visible && kaiJunkTiers) {
        const wt = actor.animTime * 8.6 + 0.95;
        const [t1, t2, t3, t4] = kaiJunkTiers;
        t1.rotation.z = -0.10 + Math.sin(wt - 0.35) * 0.21;
        t1.rotation.x = Math.cos(wt * 0.85 - 0.20) * 0.10;
        t2.rotation.z = 0.09 + Math.sin(wt - 0.95) * 0.27;
        t2.rotation.x = Math.sin(wt * 1.10 - 0.65) * 0.14;
        t2.position.x = 0.03 + Math.sin(wt - 0.95) * 0.05;
        t3.rotation.z = -0.08 + Math.sin(wt - 1.55) * 0.33;
        t3.rotation.x = Math.cos(wt * 1.20 - 1.10) * 0.16;
        t3.position.y = 0.24 + Math.abs(Math.sin(wt * 1.6)) * 0.05;
        t4.rotation.z = 0.12 + Math.sin(wt - 2.15) * 0.38;
        t4.rotation.x = Math.sin(wt * 1.30 - 1.60) * 0.18;
      }

      if (spec.onUpdate) spec.onUpdate(actor, dt);

      if (emoteSprite) {
        if (kaiFaintStars && kaiFaintStars.visible) {
          emoteSprite.position.set(
            kaiFaintStars.position.x,
            kaiFaintStars.position.y + 0.62 + Math.sin(actor.animTime * 5) * 0.05,
            kaiFaintStars.position.z
          );
        } else {
          const extraH = kaiFinaleGroup && kaiFinaleGroup.visible ? 1.25 : 0;
          emoteSprite.position.set(0, topHeight + extraH + 0.65 + Math.sin(actor.animTime * 5) * 0.06, 0);
        }
      }
      const lift = Math.max(0, rig.position.y);
      const sScale = Math.max(0.35, 1 - lift * 0.42) * (spec.shadowRadius ?? 0.52) * 2;
      shadow.scale.set(sScale, 1, sScale);
    },
    _getEmoteSprite: () => emoteSprite,
  };

  return actor;
}

export function createChars(ctx = {}) {
  const actors = new Set();

  // Pre-warm cached skin materials & merged part geometries for contestants + NPCs so WebGL memory drift across quest cycles is strictly 0.0%!
  for (const [k, s] of Object.entries(CONTESTANT_SPECS)) {
    if (!partGeoCache.has(k)) buildChibiActor(k, s, {}, ctx);
  }
  for (const [k, s] of Object.entries(NPC_SPECS)) {
    if (!partGeoCache.has(k)) buildChibiActor(k, s, {}, ctx);
  }

  function create(kind, opts = {}) {
    const spec = MOB_SPECS[kind] || CONTESTANT_SPECS[kind] || NPC_SPECS[kind] || NPC_SPECS.player;
    const actor = buildChibiActor(kind, spec, opts, ctx);
    if (opts.scene) opts.scene.add(actor.group);
    actors.add(actor);
    return actor;
  }

  const capes = createCapes(ctx, (id, opts) => create(id, opts));

  if (ctx?.events?.on) {
    ctx.events.on('questStart', ({ id }) => {
      if (id) capes.reveal(id);
    });
    ctx.events.on('finaleStart', () => {
      for (const a of actors) {
        if (a.kind === 'kai') a.setFinaleJunk(true);
      }
    });
    ctx.events.on('gag', ({ gagId }) => {
      if (gagId === 'kai_cake_face') {
        for (const a of actors) {
          if (a.kind === 'kai') a.setCakeFace(true);
        }
      } else if (gagId === 'sneeze_balloon' || gagId === 'wither_sneeze_balloon') {
        for (const a of actors) {
          if (a.kind === 'wither' && a.group.parent && a.group.visible) {
            a.setSneezeFlash(true);
          }
        }
      }
    });
  }

  return {
    create,
    crowd: (scene, seats) => createCrowd(scene || ctx?.scene, seats, ctx),
    capes,
    drawMobIcon: drawMobIconCanvas,
    drawAccessoryThumb,
    createAccessoryMesh,
    update(dt) {
      capes.update(dt);
      const camPos = ctx?.camera?.position || ctx?.cam?.camera?.position;
      for (const a of actors) {
        if (a.group.parent && a.group.visible) {
          a.update(dt);
          // Runs after rival.update(dt): keep 小凯 facing camera & speech bubble cleanly above the 4-tier wobbling hat stack!
          if (a.kind === 'kai' && (a.finaleActive || ctx?.state?.scene === 'finale')) {
            if (camPos) {
              const cdx = camPos.x - a.group.position.x;
              const cdz = camPos.z - a.group.position.z;
              a.group.rotation.y = cdx * cdx + cdz * cdz > 1e-4 ? Math.atan2(cdx, cdz) : 0;
            } else {
              a.group.rotation.y = 0;
            }
            for (const ch of a.group.children) {
              if (ch === a.rig || ch === a.parts?.shadow || ch === a.parts?.poofRing || ch === a.parts?.kaiFaintStars) continue;
              if (ch.isSprite && ch.visible && ch !== a._getEmoteSprite?.()) {
                ch.position.y = 3.98 + Math.sin(a.animTime * 5.5) * 0.07;
              } else if (ch.isGroup && ch.visible) {
                for (const sub of ch.children) {
                  if (sub.isMesh && (sub.position.y > 2.1 || (sub.position.y > 1.65 && sub.position.z > 0.4))) {
                    sub.visible = false;
                  }
                }
              }
            }
          } else if (a.kind === 'kai' && (a.anim === 'faint' || a.anim === 'dizzy') && !a.finaleActive) {
            // Re-assert exact faint/twitch/spring-up/dizzy pose after rival.update(dt) (#183 R1)
            applyActorAnim(a, 0);
            a._syncKaiFaintStars?.();
          } else if (
            a.kind === 'wither' &&
            ctx?.state?.scene === 'world' &&
            (a._sneezeFlashOn || a._sneezeFlashTimer > 0 || a.anim === 'sneeze')
          ) {
            // Orient 三三's face & 3 heads directly toward active focus camera during sneeze_balloon (#183 R2)
            if (camPos && ctx?.cam?.mode === 'focus') {
              const cdx = camPos.x - a.group.position.x;
              const cdz = camPos.z - a.group.position.z;
              if (cdx * cdx + cdz * cdz > 1e-4) {
                a.group.rotation.y = Math.atan2(cdx, cdz);
              }
            }
            if (a.parts?.head && a.anim !== 'sneeze') {
              a.parts.head.rotation.x = -0.10;
            }
          }
        }
      }
    },
    actors,
  };
}

export default createChars;
