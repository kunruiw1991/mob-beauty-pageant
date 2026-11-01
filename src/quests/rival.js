// Rival 小凯 slapstick comedy controller per docs/DESIGN.md §3.6, §7, §8.5 (owner: quests-b).
// Zero-build ES2022, deterministic simulation clock and seeded RNG only.

import * as THREE from '../../vendor/three.module.min.js';
import { RIVAL_BUBBLE } from '../data/strings.js';
import {
  createTimers,
  surfaceY,
  playerPos,
  playSfx,
  sharedBoxGeo,
  sharedCylinderGeo,
  sharedLambertMat,
  sharedBasicMat,
  attachToScene,
  detachFromScene,
} from './kit.js';

const CONE_SEGMENTS = 20;
let cachedBubbleMat = null;
let cachedConeGeoKey = '';
let cachedConeFillGeo = null;
let cachedConeEdgeGeo = null;

function getConeGeometries(coneDeg = 56, range = 4.6) {
  const halfRad = THREE.MathUtils.degToRad(Math.max(15, Math.min(150, coneDeg)) * 0.5);
  const r = Math.max(1.5, range);
  const key = `${halfRad.toFixed(3)}:${r.toFixed(2)}`;
  if (cachedConeGeoKey === key && cachedConeFillGeo && cachedConeEdgeGeo) {
    return { fillGeo: cachedConeFillGeo, edgeGeo: cachedConeEdgeGeo };
  }
  if (cachedConeFillGeo) cachedConeFillGeo.dispose();
  if (cachedConeEdgeGeo) cachedConeEdgeGeo.dispose();

  // Wedge in XZ plane facing +Z (matching actor.lookAt atan2(dx, dz))
  const positions = [];
  for (let i = 0; i < CONE_SEGMENTS; i++) {
    const a0 = -halfRad + (2 * halfRad * i) / CONE_SEGMENTS;
    const a1 = -halfRad + (2 * halfRad * (i + 1)) / CONE_SEGMENTS;
    positions.push(
      0, 0, 0,
      Math.sin(a0) * r, 0, Math.cos(a0) * r,
      Math.sin(a1) * r, 0, Math.cos(a1) * r
    );
  }
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  fillGeo.computeVertexNormals();

  // Leading arc rim strip for crisp readability on dark obsidian
  const rimPos = [];
  const innerR = Math.max(0.2, r - 0.18);
  for (let i = 0; i < CONE_SEGMENTS; i++) {
    const a0 = -halfRad + (2 * halfRad * i) / CONE_SEGMENTS;
    const a1 = -halfRad + (2 * halfRad * (i + 1)) / CONE_SEGMENTS;
    const x0i = Math.sin(a0) * innerR, z0i = Math.cos(a0) * innerR;
    const x0o = Math.sin(a0) * r, z0o = Math.cos(a0) * r;
    const x1i = Math.sin(a1) * innerR, z1i = Math.cos(a1) * innerR;
    const x1o = Math.sin(a1) * r, z1o = Math.cos(a1) * r;
    rimPos.push(x0i, 0.01, z0i, x0o, 0.01, z0o, x1o, 0.01, z1o);
    rimPos.push(x0i, 0.01, z0i, x1o, 0.01, z1o, x1i, 0.01, z1i);
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));

  cachedConeGeoKey = key;
  cachedConeFillGeo = fillGeo;
  cachedConeEdgeGeo = edgeGeo;
  return { fillGeo, edgeGeo };
}

function getSpeechBubbleSprite(text = RIVAL_BUBBLE) {
  if (!cachedBubbleMat && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const g = canvas.getContext('2d');
    if (g) {
      g.clearRect(0, 0, 256, 96);
      // Pixel speech bubble card
      g.fillStyle = '#1d1e2c';
      g.fillRect(8, 8, 240, 64);
      g.fillStyle = '#fffdf7';
      g.fillRect(14, 14, 228, 52);
      // Bubble tail
      g.fillStyle = '#1d1e2c';
      g.fillRect(116, 72, 24, 16);
      g.fillStyle = '#fffdf7';
      g.fillRect(120, 66, 16, 16);
      // Bold kid-friendly English bubble text fitting cleanly inside 228px inner card
      const label = String(text || RIVAL_BUBBLE).slice(0, 20);
      g.fillStyle = '#d9342b';
      g.font = '900 24px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 128, 41, 214);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    cachedBubbleMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
  }
  if (!cachedBubbleMat) return null;
  const sp = new THREE.Sprite(cachedBubbleMat);
  sp.scale.set(2.3, 0.86, 1);
  sp.renderOrder = 25;
  return sp;
}

function buildFallbackKaiActor() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const body = new THREE.Mesh(sharedBoxGeo(0.7, 0.8, 0.45), sharedLambertMat(0x22b8cf));
  body.position.set(0, 0.95, 0);
  const head = new THREE.Mesh(sharedBoxGeo(1.0, 1.0, 1.0), sharedLambertMat(0xffd6b0));
  head.position.set(0, 1.85, 0);
  const hair = new THREE.Mesh(sharedBoxGeo(1.04, 0.35, 1.04), sharedLambertMat(0x2b2d42));
  hair.position.set(0, 0.36, 0);
  head.add(hair);
  rig.add(body, head);
  let anim = 'idle';
  let t = 0;
  return {
    id: 'kai',
    kind: 'kai',
    group,
    rig,
    parts: { head, body },
    setAnim(a) {
      anim = a || 'idle';
    },
    setEmote() {},
    setAccessory() {},
    clearAccessories() {},
    lookAt(p) {
      if (!p) return;
      const dx = (p.x ?? 0) - group.position.x;
      const dz = (p.z ?? 0) - group.position.z;
      if (dx * dx + dz * dz > 1e-6) group.rotation.y = Math.atan2(dx, dz);
    },
    moveTo(p) {
      if (p) group.position.set(p.x ?? 0, p.y ?? 8, p.z ?? 0);
    },
    setVisible(v) {
      group.visible = !!v;
    },
    update(dt) {
      t += dt;
      rig.position.y = anim === 'hop' ? Math.abs(Math.sin(t * 9)) * 0.35 : 0;
    },
  };
}

export function createRival(ctx) {
  let currentMode = 'offstage';
  let actor = null;
  let heading = 0;
  let modeTime = 0;
  let popInTimer = 0;

  const pos = new THREE.Vector3(0, -100, 0);
  const timers = createTimers();

  // Arc jump state (for slime bounce, decoy pounce, portal dive)
  let arcState = null;

  // Patrol & vision cone state
  let patrolPts = [];
  let patrolIdx = 0;
  let patrolSpeed = 2.65;
  let patrolPause = 0;
  let coneDeg = 56;
  let coneRange = 4.6;
  let eatTimer = 0;
  let eatCrumbAccum = 0;
  let resumePatrolAfterEat = false;
  const faintBasePos = { x: 83.6, y: 8, z: 30.5 };

  // Pooled scene groups & slapstick props (created once, reused forever)
  const fxRoot = new THREE.Group();
  fxRoot.name = 'rivalPropsRoot';
  fxRoot.visible = false;

  const coneGroup = new THREE.Group();
  coneGroup.visible = false;
  const initialCone = getConeGeometries(coneDeg, coneRange);
  const coneFillMesh = new THREE.Mesh(
    initialCone.fillGeo,
    sharedBasicMat(0xffe033, { opacity: 0.34, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  const coneEdgeMesh = new THREE.Mesh(
    initialCone.edgeGeo,
    sharedBasicMat(0xffaa00, { opacity: 0.78, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  coneGroup.add(coneFillMesh, coneEdgeMesh);
  fxRoot.add(coneGroup);

  // Decoy cake visual on the ground when 小凯 is eating
  const decoyCakeGroup = new THREE.Group();
  decoyCakeGroup.visible = false;
  const cakeBase = new THREE.Mesh(sharedBoxGeo(0.72, 0.34, 0.72), sharedLambertMat(0xf7e6c4));
  cakeBase.position.y = 0.17;
  const cakeIcing = new THREE.Mesh(sharedBoxGeo(0.76, 0.14, 0.76), sharedLambertMat(0xffffff));
  cakeIcing.position.y = 0.36;
  const cakeCherry = new THREE.Mesh(sharedBoxGeo(0.18, 0.18, 0.18), sharedLambertMat(0xe63946));
  cakeCherry.position.y = 0.48;
  decoyCakeGroup.add(cakeBase, cakeIcing, cakeCherry);
  fxRoot.add(decoyCakeGroup);

  // Actor-attached slapstick props (attached once actor exists)
  let propsAttached = false;
  const snowmanGroup = new THREE.Group();
  snowmanGroup.visible = false;
  {
    const bottomBall = new THREE.Mesh(sharedBoxGeo(1.28, 0.82, 1.28), sharedLambertMat(0xf4f9ff));
    bottomBall.position.y = 0.42;
    const midBall = new THREE.Mesh(sharedBoxGeo(1.06, 0.72, 1.06), sharedLambertMat(0xffffff));
    midBall.position.y = 1.12;
    const btn1 = new THREE.Mesh(sharedBoxGeo(0.12, 0.12, 0.08), sharedLambertMat(0x2b2d42));
    btn1.position.set(0, 1.22, 0.55);
    const btn2 = new THREE.Mesh(sharedBoxGeo(0.12, 0.12, 0.08), sharedLambertMat(0x2b2d42));
    btn2.position.set(0, 0.96, 0.55);
    const stickL = new THREE.Mesh(sharedBoxGeo(0.55, 0.09, 0.09), sharedLambertMat(0x6b4423));
    stickL.position.set(0.72, 1.18, 0);
    stickL.rotation.z = 0.35;
    const stickR = new THREE.Mesh(sharedBoxGeo(0.55, 0.09, 0.09), sharedLambertMat(0x6b4423));
    stickR.position.set(-0.72, 1.18, 0);
    stickR.rotation.z = -0.35;
    const carrot = new THREE.Mesh(sharedBoxGeo(0.16, 0.16, 0.42), sharedLambertMat(0xf77f00));
    carrot.position.set(0, 1.78, 0.62);
    snowmanGroup.add(bottomBall, midBall, btn1, btn2, stickL, stickR, carrot);
  }

  const honeyGroup = new THREE.Group();
  honeyGroup.visible = false;
  {
    const puddle = new THREE.Mesh(
      sharedBoxGeo(1.35, 0.18, 1.35),
      sharedLambertMat(0xf5a623, { opacity: 0.88, transparent: true })
    );
    puddle.position.y = 0.09;
    const blobL = new THREE.Mesh(sharedBoxGeo(0.42, 0.34, 0.42), sharedLambertMat(0xffb703));
    blobL.position.set(0.22, 0.22, 0.1);
    const blobR = new THREE.Mesh(sharedBoxGeo(0.42, 0.34, 0.42), sharedLambertMat(0xffb703));
    blobR.position.set(-0.22, 0.22, -0.06);
    honeyGroup.add(puddle, blobL, blobR);
  }

  const hogPumpkinsGroup = new THREE.Group();
  hogPumpkinsGroup.visible = false;
  {
    const p1 = new THREE.Mesh(sharedBoxGeo(0.56, 0.52, 0.56), sharedLambertMat(0xe87a1e));
    p1.position.set(0, 0.95, 0.52);
    const p2 = new THREE.Mesh(sharedBoxGeo(0.48, 0.46, 0.48), sharedLambertMat(0xf77f00));
    p2.position.set(0.08, 1.42, 0.50);
    hogPumpkinsGroup.add(p1, p2);
  }

  const cakeFaceGroup = new THREE.Group();
  cakeFaceGroup.visible = false;
  {
    const splat = new THREE.Mesh(sharedBoxGeo(0.86, 0.72, 0.22), sharedLambertMat(0xfff8f0));
    splat.position.set(0, 0.48, 0.54);
    const pink = new THREE.Mesh(sharedBoxGeo(0.62, 0.44, 0.25), sharedLambertMat(0xff8fab));
    pink.position.set(0, 0.48, 0.56);
    const cherry = new THREE.Mesh(sharedBoxGeo(0.2, 0.2, 0.2), sharedLambertMat(0xd9342b));
    cherry.position.set(0.05, 0.55, 0.68);
    cakeFaceGroup.add(splat, pink, cherry);
  }

  const starsGroup = new THREE.Group();
  starsGroup.visible = false;
  {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const star = new THREE.Mesh(sharedBoxGeo(0.2, 0.2, 0.2), sharedBasicMat(0xffd43b));
      star.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      starsGroup.add(star);
    }
    starsGroup.position.set(0, 1.25, 0);
  }

  const finaleJunkGroup = new THREE.Group();
  finaleJunkGroup.visible = false;
  let speechBubble = null;
  {
    // Body-level slapstick souvenirs (shoulder snow + foot honey); head hat stack is on actor.setFinaleJunk(true) (#161)
    const snowClump = new THREE.Mesh(sharedBoxGeo(0.42, 0.32, 0.42), sharedLambertMat(0xffffff));
    snowClump.position.set(0.48, 1.42, 0.05);
    const footHoney = new THREE.Mesh(sharedBoxGeo(0.46, 0.24, 0.52), sharedLambertMat(0xf5a623));
    footHoney.position.set(-0.2, 0.12, 0.08);
    finaleJunkGroup.add(snowClump, footHoney);
  }

  function syncState(extra = {}) {
    if (!ctx?.state) return;
    if (!ctx.state.rival) {
      ctx.state.rival = {
        state: currentMode,
        x: 0,
        z: 0,
        appearances: [],
        stealDone: false,
        rescued: false,
      };
    }
    ctx.state.rival.state = currentMode;
    ctx.state.rival.x = currentMode === 'offstage' ? 0 : Math.round(pos.x * 100) / 100;
    ctx.state.rival.z = currentMode === 'offstage' ? 0 : Math.round(pos.z * 100) / 100;
    Object.assign(ctx.state.rival, extra);
  }

  function recordAppearance(questId) {
    const qid = questId || ctx?.state?.quest?.id;
    if (!qid || !ctx?.state) return;
    syncState();
    if (!Array.isArray(ctx.state.rival.appearances)) {
      ctx.state.rival.appearances = [];
    }
    if (!ctx.state.rival.appearances.includes(qid)) {
      ctx.state.rival.appearances.push(qid);
    }
  }

  function ensureActor() {
    if (ctx?.scene && fxRoot.parent !== ctx.scene) {
      attachToScene(ctx, fxRoot);
    }
    if (!actor) {
      actor = ctx?.chars?.create ? ctx.chars.create('kai', { id: 'kai' }) : buildFallbackKaiActor();
      if (actor?.group && ctx?.scene && actor.group.parent !== ctx.scene) {
        ctx.scene.add(actor.group);
      }
      actor?.setVisible?.(false);
    } else if (actor?.group && ctx?.scene && actor.group.parent !== ctx.scene) {
      ctx.scene.add(actor.group);
    }

    if (actor && !propsAttached) {
      propsAttached = true;
      actor.group.add(snowmanGroup, honeyGroup, hogPumpkinsGroup, finaleJunkGroup);
      const headNode = actor.parts?.head || actor.group;
      headNode.add(cakeFaceGroup, starsGroup);
      speechBubble = getSpeechBubbleSprite(RIVAL_BUBBLE);
      if (speechBubble) {
        speechBubble.position.set(0, 3.65, 0);
        speechBubble.visible = false;
        actor.group.add(speechBubble);
      }
    }
    return actor;
  }

  function clearSlapstickProps() {
    snowmanGroup.visible = false;
    honeyGroup.visible = false;
    hogPumpkinsGroup.visible = false;
    cakeFaceGroup.visible = false;
    starsGroup.visible = false;
    finaleJunkGroup.visible = false;
    coneGroup.visible = false;
    decoyCakeGroup.visible = false;
    actor?.setFinaleJunk?.(false);
    actor?.setCakeFace?.(false);
    if (speechBubble) speechBubble.visible = false;
    if (actor?.rig) {
      actor.rig.rotation.set(0, 0, 0);
      actor.rig.position.set(0, 0, 0);
      actor.rig.scale.set(1, 1, 1);
    }
    if (actor?.group) {
      actor.group.scale.set(1, 1, 1);
    }
  }

  function setWorldPos(targetPos) {
    if (!targetPos) return;
    const tx = targetPos.x ?? pos.x;
    const tz = targetPos.z ?? pos.z;
    const ty = targetPos.y ?? surfaceY(ctx, tx, tz, 8);
    pos.set(tx, ty, tz);
    if (actor?.group) {
      actor.group.position.set(tx, ty, tz);
    }
  }

  function waitSim(seconds) {
    if (seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      timers.after(seconds, resolve);
    });
  }

  const rival = {
    timers,
    waitSim,

    get actor() {
      return ensureActor();
    },

    get state() {
      return currentMode;
    },

    set state(next) {
      currentMode = next || 'offstage';
      modeTime = 0;
      syncState();
    },

    get pos() {
      return pos;
    },

    get heading() {
      return heading;
    },

    recordAppearance,

    appear(targetPos, mode = 'cameo', questId = null) {
      ensureActor();
      arcState = null;
      resumePatrolAfterEat = false;
      clearSlapstickProps();
      currentMode = mode || 'cameo';
      modeTime = 0;
      popInTimer = mode === 'fainted' ? 0 : 0.24;
      fxRoot.visible = true;
      if (targetPos) {
        setWorldPos(targetPos);
      }
      actor?.stopMove?.();
      actor?.setVisible?.(true);
      actor?.setEmote?.(null);
      actor?.setAnim?.(mode === 'patrol' ? 'walk' : 'idle');
      recordAppearance(questId);
      syncState();
      return rival;
    },

    leave() {
      arcState = null;
      resumePatrolAfterEat = false;
      timers.clear();
      clearSlapstickProps();
      fxRoot.visible = false;
      currentMode = 'offstage';
      modeTime = 0;
      actor?.stopMove?.();
      actor?.setEmote?.(null);
      actor?.setVisible?.(false);
      pos.set(0, -100, 0);
      syncState();
    },

    taunt(questId = null) {
      ensureActor();
      if (questId) recordAppearance(questId);
      actor?.setEmote?.('😜');
      actor?.setAnim?.('wave');
      playSfx(ctx, 'kai_laugh', { pos });
      ctx?.fx?.popup?.({ x: pos.x, y: pos.y + 2.4, z: pos.z }, '😜');
    },

    snatch(target, questId = null) {
      const p = target?.pos || target?.position || target;
      rival.appear(p, 'hog', questId);
      hogPumpkinsGroup.visible = questId === 'golem';
      playSfx(ctx, 'boing', { pos });
      rival.taunt(questId);
    },

    // --- Quest-specific Slapstick Helpers (for quests-a & quests-b) ---

    bounceIntoWater(fromPos, waterPos, questId = 'slime') {
      const start = fromPos || { x: pos.x, y: pos.y, z: pos.z };
      const end = waterPos || { x: start.x + 2, y: (start.y ?? 8) - 0.5, z: start.z + 2 };
      rival.appear(start, 'cameo', questId);
      actor?.setEmote?.('💢');
      actor?.setAnim?.('hop');
      playSfx(ctx, 'boing', { pos: start });
      arcState = {
        from: { x: start.x, y: start.y ?? 8, z: start.z },
        to: { x: end.x, y: end.y ?? 7.4, z: end.z },
        duration: 0.65,
        elapsed: 0,
        peak: 2.8,
        spin: true,
        onDone: () => {
          playSfx(ctx, 'splash', { pos: end });
          ctx?.fx?.burst?.({ x: end.x, y: (end.y ?? 7.4) + 0.4, z: end.z }, 0x3b82f6, 16);
          actor?.setAnim?.('stuck');
          actor?.setEmote?.('💦');
        },
      };
    },

    loseHatCameo(atPos, questId = 'cat') {
      rival.appear(atPos, 'cameo', questId);
      actor?.clearAccessories?.();
      actor?.setEmote?.('💢');
      actor?.setAnim?.('cry');
      playSfx(ctx, 'kai_whine', { pos });
    },

    hogPumpkins(atPos, questId = 'golem') {
      rival.appear(atPos, 'hog', questId);
      hogPumpkinsGroup.visible = true;
      rival.taunt(questId);
    },

    lockInCellWithCake(cellPos, questId = 'ender') {
      rival.appear(cellPos, 'stuck', questId);
      cakeFaceGroup.visible = true;
      actor?.setAnim?.('cry');
      actor?.setEmote?.('🎂');
      playSfx(ctx, 'boing', { pos: cellPos });
      playSfx(ctx, 'kai_whine', { pos: cellPos });
      syncState();
    },

    dressForFinale(atPos) {
      rival.appear(atPos, 'finale', 'finale');
      finaleJunkGroup.visible = true;
      finaleJunkGroup.rotation.set(0, 0, 0);
      finaleJunkGroup.position.set(0, 0, 0);
      actor?.setFinaleJunk?.(true);
      if (speechBubble) {
        speechBubble.position.set(0, 3.65, 0);
        speechBubble.visible = true;
      }
      if (actor?.group) actor.group.rotation.y = 0; // Face south (+Z) toward runway camera
      actor?.setAnim?.('strut');
      actor?.setEmote?.(null);
      syncState();
    },

    setSpeechBubbleVisible(visible) {
      if (speechBubble) speechBubble.visible = !!visible;
    },

    // --- Prison Vision-Cone Patrol & Decoy Cake ---

    patrol(points = [], deg = 56, range = 4.5, opts = {}) {
      ensureActor();
      clearSlapstickProps();
      currentMode = 'patrol';
      modeTime = 0;
      patrolPts = points.length > 0
        ? points.map((p) => ({ x: p.x, y: p.y ?? surfaceY(ctx, p.x, p.z, 8), z: p.z }))
        : [{ x: pos.x, y: pos.y, z: pos.z }];
      patrolIdx = patrolPts.length > 1 ? 1 : 0;
      patrolSpeed = opts.speed ?? 2.65;
      patrolPause = 0;
      coneDeg = deg;
      coneRange = range;

      const { fillGeo, edgeGeo } = getConeGeometries(coneDeg, coneRange);
      coneFillMesh.geometry = fillGeo;
      coneEdgeMesh.geometry = edgeGeo;

      setWorldPos(patrolPts[0]);
      if (patrolPts.length > 1) {
        heading = Math.atan2(patrolPts[1].x - patrolPts[0].x, patrolPts[1].z - patrolPts[0].z);
      }
      if (actor?.group) actor.group.rotation.y = heading;
      fxRoot.visible = true;
      coneGroup.visible = true;
      coneGroup.position.set(pos.x, pos.y + 0.08, pos.z);
      coneGroup.rotation.y = heading;

      actor?.setVisible?.(true);
      actor?.setEmote?.(null);
      actor?.setAnim?.('walk');
      if (opts.questId) recordAppearance(opts.questId);
      syncState();
    },

    setPatrolParams({ speed, coneDeg: nextDeg, range: nextRange } = {}) {
      if (typeof speed === 'number') patrolSpeed = speed;
      if (typeof nextDeg === 'number') coneDeg = nextDeg;
      if (typeof nextRange === 'number') coneRange = nextRange;
      const { fillGeo, edgeGeo } = getConeGeometries(coneDeg, coneRange);
      coneFillMesh.geometry = fillGeo;
      coneEdgeMesh.geometry = edgeGeo;
    },

    seesPlayer() {
      if (currentMode !== 'patrol' || !coneGroup.visible) return false;
      const pl = playerPos(ctx);
      const dx = pl.x - pos.x;
      const dz = pl.z - pos.z;
      const dy = Math.abs((pl.y ?? pos.y) - pos.y);
      if (dy > 2.6) return false;
      const dist = Math.hypot(dx, dz);
      if (dist > coneRange || dist < 0.05) return dist < 0.75;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const cosAngle = (dx * fx + dz * fz) / dist;
      const threshold = Math.cos(THREE.MathUtils.degToRad(coneDeg * 0.5));
      return cosAngle >= threshold;
    },

    eatDecoy(cakePos, durationSec = 5.0) {
      ensureActor();
      const wasPatrolling = currentMode === 'patrol' || currentMode === 'eating';
      resumePatrolAfterEat = wasPatrolling && patrolPts.length > 0;
      currentMode = 'eating';
      modeTime = 0;
      eatTimer = Math.max(0.5, durationSec);
      eatCrumbAccum = 0;
      coneGroup.visible = false;

      const target = cakePos
        ? { x: cakePos.x, y: cakePos.y ?? surfaceY(ctx, cakePos.x, cakePos.z, pos.y), z: cakePos.z }
        : { x: pos.x, y: pos.y, z: pos.z };

      fxRoot.visible = true;
      decoyCakeGroup.visible = true;
      decoyCakeGroup.position.set(target.x, target.y, target.z);
      decoyCakeGroup.scale.set(1, 1, 1);

      const standPos = { x: target.x, y: target.y, z: target.z - 0.55 };
      setWorldPos(standPos);
      heading = 0;
      actor?.lookAt?.(target);
      actor?.setVisible?.(true);
      actor?.setAnim?.('eat');
      actor?.setEmote?.('🎂');
      playSfx(ctx, 'boing', { pos: target });
      playSfx(ctx, 'munch', { pos: target });
      syncState();
    },

    stick(atPos, questId = 'bee') {
      if (atPos) rival.appear(atPos, 'stuck', questId);
      else {
        clearSlapstickProps();
        currentMode = 'stuck';
        modeTime = 0;
        recordAppearance(questId);
      }
      honeyGroup.visible = true;
      actor?.setAnim?.('stuck');
      actor?.setEmote?.('💢');
      playSfx(ctx, 'boing', { pos });
      playSfx(ctx, 'kai_whine', { pos });
      syncState();
    },

    bury(atPos, questId = 'snow') {
      if (atPos) rival.appear(atPos, 'buried', questId);
      else {
        clearSlapstickProps();
        currentMode = 'buried';
        modeTime = 0;
        recordAppearance(questId);
      }
      snowmanGroup.visible = true;
      actor?.setAnim?.('stuck');
      actor?.setEmote?.('❄️');
      playSfx(ctx, 'snow_hit', { pos });
      playSfx(ctx, 'kai_whine', { pos });
      syncState();
    },

    faint(atPos, questId = 'villager') {
      if (atPos) rival.appear(atPos, 'fainted', questId);
      else {
        clearSlapstickProps();
        currentMode = 'fainted';
        modeTime = 0;
        recordAppearance(questId);
      }
      faintBasePos.x = pos.x;
      faintBasePos.y = pos.y;
      faintBasePos.z = pos.z;
      // Only show fallback head-attached stars if buildFallbackKaiActor is in use;
      // real kai actor renders 3 horizontal orbiting stars on actor.group (#183 R1 / #184).
      starsGroup.visible = !actor?.parts?.legL;
      actor?.setAnim?.('faint');
      actor?.setEmote?.('💫');
      playSfx(ctx, 'boing', { pos });
      playSfx(ctx, 'kai_whine', { pos });
      syncState();
    },

    arcTo(toPos, duration = 0.55, peak = 2.0, onDone = null) {
      ensureActor();
      arcState = {
        from: { x: pos.x, y: pos.y, z: pos.z },
        to: { x: toPos.x, y: toPos.y ?? surfaceY(ctx, toPos.x, toPos.z, pos.y), z: toPos.z },
        duration: Math.max(0.08, duration),
        elapsed: 0,
        peak,
        spin: false,
        onDone,
      };
    },

    update(dt) {
      timers.update(dt);
      if (currentMode === 'offstage') return;
      ensureActor();
      modeTime += dt;

      if (popInTimer > 0) {
        popInTimer = Math.max(0, popInTimer - dt);
        const u = 1 - popInTimer / 0.24;
        const s = u < 0.6 ? 0.4 + (u / 0.6) * 0.78 : 1.18 - ((u - 0.6) / 0.4) * 0.18;
        actor.group.scale.set(s, 2 - s * 0.95 > 0.5 ? 2 - s * 0.95 : 1, s);
        if (popInTimer === 0) actor.group.scale.set(1, 1, 1);
      }

      if (arcState) {
        arcState.elapsed += dt;
        const u = Math.min(1, arcState.elapsed / arcState.duration);
        const nx = arcState.from.x + (arcState.to.x - arcState.from.x) * u;
        const nz = arcState.from.z + (arcState.to.z - arcState.from.z) * u;
        const baseY = arcState.from.y + (arcState.to.y - arcState.from.y) * u;
        const ny = baseY + Math.sin(u * Math.PI) * arcState.peak;
        pos.set(nx, ny, nz);
        actor.group.position.copy(pos);
        if (arcState.spin && actor.rig) {
          actor.rig.rotation.x = u * Math.PI * 4;
          actor.rig.rotation.y = u * Math.PI * 2;
        } else {
          actor.lookAt?.(arcState.to);
        }
        actor.update?.(dt);
        if (u >= 1) {
          const done = arcState.onDone;
          arcState = null;
          if (actor.rig) actor.rig.rotation.set(0, 0, 0);
          done?.();
        }
        syncState();
        return;
      }

      if (currentMode === 'patrol' && patrolPts.length > 0) {
        if (patrolPause > 0) {
          patrolPause = Math.max(0, patrolPause - dt);
          actor.setAnim?.('idle');
        } else if (patrolPts.length > 1) {
          const goal = patrolPts[patrolIdx];
          const dx = goal.x - pos.x;
          const dz = goal.z - pos.z;
          const d = Math.hypot(dx, dz);
          const step = patrolSpeed * dt;
          if (d <= Math.max(0.05, step)) {
            pos.set(goal.x, goal.y, goal.z);
            patrolIdx = (patrolIdx + 1) % patrolPts.length;
            patrolPause = 0.12;
          } else {
            pos.x += (dx / d) * step;
            pos.z += (dz / d) * step;
            pos.y = goal.y;
            const targetHeading = Math.atan2(dx, dz);
            // Smooth angular turn so vision cone sweeps readably
            let diff = targetHeading - heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            heading += diff * Math.min(1, dt * 8.5);
          }
          actor.group.position.copy(pos);
          actor.group.rotation.y = heading;
          actor.setAnim?.('walk');
        }
        coneGroup.visible = true;
        coneGroup.position.set(pos.x, pos.y + 0.08, pos.z);
        coneGroup.rotation.y = heading;
        coneFillMesh.material.opacity = 0.28 + 0.08 * Math.sin(modeTime * 6.0);
        actor.update?.(dt);
        syncState();
        return;
      }

      if (currentMode === 'eating') {
        eatTimer = Math.max(0, eatTimer - dt);
        eatCrumbAccum += dt;
        const shrink = Math.max(0.2, eatTimer / 5.0);
        decoyCakeGroup.scale.set(shrink, shrink, shrink);
        if (eatCrumbAccum >= 0.65) {
          eatCrumbAccum = 0;
          playSfx(ctx, 'munch', { pos });
          ctx?.fx?.burst?.({ x: decoyCakeGroup.position.x, y: decoyCakeGroup.position.y + 0.35, z: decoyCakeGroup.position.z }, 0xfff3e0, 5);
        }
        actor.update?.(dt);
        if (actor.parts?.head) {
          actor.parts.head.rotation.x = 0.35 + Math.sin(modeTime * 16) * 0.28;
        }
        if (eatTimer <= 0) {
          decoyCakeGroup.visible = false;
          if (actor.parts?.head) actor.parts.head.rotation.x = 0;
          if (resumePatrolAfterEat && patrolPts.length > 0) {
            currentMode = 'patrol';
            coneGroup.visible = true;
            actor.setEmote?.(null);
            actor.setAnim?.('walk');
          } else {
            currentMode = 'cameo';
            actor.setAnim?.('idle');
          }
        }
        syncState();
        return;
      }

      // Exaggerated slapstick secondary motion per state
      actor.update?.(dt);
      if (actor.group) pos.copy(actor.group.position);

      if (currentMode === 'stuck' && actor.rig) {
        actor.rig.rotation.z = Math.sin(modeTime * 18) * 0.22;
        actor.rig.scale.set(1 + Math.sin(modeTime * 18) * 0.08, 1 - Math.sin(modeTime * 18) * 0.08, 1);
      } else if (currentMode === 'buried' && actor.rig) {
        snowmanGroup.rotation.z = Math.sin(modeTime * 24) * 0.06;
        actor.rig.position.x = Math.sin(modeTime * 28) * 0.04;
      } else if (currentMode === 'fainted') {
        if (starsGroup.visible) {
          starsGroup.rotation.y = modeTime * 4.8;
          if (actor.rig) {
            const flop = Math.min(1, modeTime * 5.0);
            actor.rig.rotation.x = -flop * (Math.PI * 0.46);
            actor.rig.position.y = flop * 0.22;
          }
        } else if (actor.anim === 'dizzy' && actor.group) {
          // Staggering dizzy-walk loop after springing up (#183 R1)
          const wobAngle = modeTime * 4.2;
          pos.set(
            faintBasePos.x + Math.sin(wobAngle) * 0.34,
            faintBasePos.y,
            faintBasePos.z + Math.sin(wobAngle * 2.0) * 0.24
          );
          actor.group.position.copy(pos);
        }
      } else if (currentMode === 'hog' && actor.rig) {
        actor.rig.position.y = Math.abs(Math.sin(modeTime * 8.5)) * 0.22;
      } else if (currentMode === 'finale') {
        if (actor.group) actor.group.rotation.y = 0; // Always face south (+Z) toward runway camera (#155 C2)
        finaleJunkGroup.rotation.z = Math.sin(modeTime * 11.5) * 0.12;
        finaleJunkGroup.position.y = Math.abs(Math.sin(modeTime * 9.0)) * 0.05;
        if (speechBubble?.visible) {
          speechBubble.position.y = 3.65 + Math.sin(modeTime * 5.5) * 0.08;
        }
      }

      syncState();
    },

    destroy() {
      rival.leave();
      detachFromScene(fxRoot);
      if (actor?.group) detachFromScene(actor.group);
    },
  };

  syncState();
  return rival;
}

export default createRival;
