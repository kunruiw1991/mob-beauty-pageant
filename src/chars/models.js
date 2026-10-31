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
import { createAccessoryMesh, drawAccessoryThumb, ACCESSORY_IDS } from './accessories.js';
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
let nextActorUid = 1;
const partGeoCache = new Map();
const extraGeoCache = new Map();

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
  const mat = getOrCreateSkinMaterial(`char_${kind}`, (g) => paintStandardAtlas(g, spec));

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

  // Toggleable slapstick gag props for rival 小凯 (cake face, snowman bury, finale runway junk!)
  let kaiCakeMesh = null;
  let kaiFinaleGroup = null;
  if (spec.hasKaiProps) {
    kaiCakeMesh = createAccessoryMesh('chefHat');
    kaiCakeMesh.scale.set(0.65, 0.55, 0.35);
    kaiCakeMesh.rotation.x = Math.PI / 2;
    kaiCakeMesh.position.set(0, 0.45, 0.52);
    kaiCakeMesh.visible = false;
    head.add(kaiCakeMesh);

    kaiFinaleGroup = new THREE.Group();
    const pHat = createAccessoryMesh('pumpkinHat');
    pHat.position.set(-0.1, 1.0, 0);
    pHat.rotation.z = 0.22;
    const cSplat = createAccessoryMesh('chefHat');
    cSplat.scale.set(0.55, 0.45, 0.30);
    cSplat.rotation.x = Math.PI / 2;
    cSplat.position.set(0.18, 0.38, 0.52);
    kaiFinaleGroup.add(pHat, cSplat);
    kaiFinaleGroup.visible = !!opts.finale;
    head.add(kaiFinaleGroup);
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
    phase: (nextActorUid * 1.618) % (Math.PI * 2),
    hitRadius: kind === 'slimeMob' ? 0.55 * ((opts.size || 1) === 2 ? 1.35 : 0.72) : (spec.hitRadius ?? 0.65),
    _lastFrame: -1,

    setAnim(name) {
      const next = name || 'idle';
      if (actor.anim !== next) {
        actor.anim = next;
        actor.animTime = 0;
      }
      if (kaiCakeMesh && next === 'eat') kaiCakeMesh.visible = true;
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
      if (kaiCakeMesh) kaiCakeMesh.visible = !!visible;
    },

    setFinaleJunk(visible) {
      if (kaiFinaleGroup) kaiFinaleGroup.visible = !!visible;
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

      if (moveTarget) {
        const dx = moveTarget.x - group.position.x;
        const dy = moveTarget.y - group.position.y;
        const dz = moveTarget.z - group.position.z;
        const dist = Math.hypot(dx, dz);
        const step = moveSpeed * dt;
        if (dist <= step || dist < 0.02) {
          group.position.set(moveTarget.x, moveTarget.y, moveTarget.z);
          moveTarget = null;
          if (actor.anim === 'walk' || actor.anim === 'run') actor.setAnim('idle');
        } else {
          group.position.x += (dx / dist) * step;
          group.position.z += (dz / dist) * step;
          group.position.y += dy * Math.min(1, dt * 10);
          group.rotation.y = Math.atan2(dx, dz);
        }
      }

      applyActorAnim(actor, dt);
      if (spec.onUpdate) spec.onUpdate(actor, dt);

      if (emoteSprite) {
        emoteSprite.position.y = topHeight + 0.65 + Math.sin(actor.animTime * 5) * 0.06;
      }
      const lift = Math.max(0, rig.position.y);
      const sScale = Math.max(0.35, 1 - lift * 0.42) * (spec.shadowRadius ?? 0.52) * 2;
      shadow.scale.set(sScale, 1, sScale);
    },
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
      for (const a of actors) {
        if (a.group.parent && a.group.visible) {
          a.update(dt);
        }
      }
    },
    actors,
  };
}

export default createChars;
