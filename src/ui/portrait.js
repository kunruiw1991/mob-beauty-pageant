// Offscreen 192x192 portrait renderer per docs/DESIGN.md §3.7 & #149 P1 (owner: pageant-ui).
// - Front-facing head + shoulders + hat crop (0° yaw, neutral gaze)
// - Bright flat studio lighting (AmbientLight >= 1.0 + front key light)
// - SRGBColorSpace WebGLRenderTarget + toneMapped:false materials in the portrait pass
// - Contestant's primary color (meta.colors.primary) as polaroid background + crisp pixel sticker rim
// - Cached 3D actors per contestantId (0 GPU geometry/texture drift across cycles)
// - Encodes JPEG strictly <= 12 KB

import { getContestantMeta } from '../data/roster.js';
import { drawContestantChibi2D } from './ui_kit.js';
import { setPortraitDataURL, MAX_PORTRAIT_BYTES } from './progress.js';

const SIZE = 192;
let cachedRig = null;
let silhouetteCanvas = null;

function parseHexLuma(hex) {
  const s = String(hex || '#fff8eb').replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return 220;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getOrCreateRig(THREE) {
  if (cachedRig && cachedRig.THREE === THREE) return cachedRig;
  const scene = new THREE.Scene();
  // Bright flat studio lighting (#149 P1: Three r170 physically-based Lambert divides by Math.PI,
  // so 2.35 ambient + 0.90 front key = 3.25 / pi ~= 1.03 linear irradiance -> crisp true albedo!)
  const amb = new THREE.AmbientLight(0xffffff, 2.35);
  const key = new THREE.DirectionalLight(0xffffff, 0.90);
  key.position.set(0.25, 1.1, 4.8);
  scene.add(amb, key);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
  });
  if (rt.texture && THREE.SRGBColorSpace) {
    rt.texture.colorSpace = THREE.SRGBColorSpace;
  }
  const pixelBuf = new Uint8Array(SIZE * SIZE * 4);
  cachedRig = { THREE, scene, camera, rt, pixelBuf, actors: new Map() };
  return cachedRig;
}

function tryRender3DPortrait(ctx, contestantId, accessories, outCanvas) {
  const THREE = ctx?.THREE;
  const renderer = ctx?.renderer;
  const createActor = ctx?.chars?.create;
  if (!THREE || !renderer || typeof createActor !== 'function') return false;

  let actor = null;
  let group = null;
  let rig = null;
  const savedMats = [];
  let shadowPart = null;
  let prevShadowVis = true;
  let poofPart = null;
  let prevPoofVis = false;

  try {
    rig = getOrCreateRig(THREE);
    actor = rig.actors.get(contestantId) || null;
    if (!actor) {
      actor = createActor(contestantId, { portrait: true });
      ctx?.chars?.actors?.delete?.(actor);
      if (actor) rig.actors.set(contestantId, actor);
    } else {
      ctx?.chars?.actors?.delete?.(actor);
    }
    group = actor?.group || actor;
    if (!group || !group.isObject3D) return false;

    actor?.clearAccessories?.();
    actor?.setFinaleJunk?.(false);
    const meta = getContestantMeta(contestantId);
    const heads = meta?.heads || 1;
    const accList = Array.isArray(accessories) ? accessories.filter(Boolean) : [];
    for (let i = 0; i < accList.length; i++) {
      actor?.setAccessory?.(accList[i], heads > 1 ? i % heads : 0);
    }

    // Front-facing neutral idle pose (0° yaw, expressive shoulders, zero side twist)
    actor?.setAnim?.('idle');
    if (actor) actor.animTime = 0;
    actor?.update?.(0);
    if (actor?.rig) {
      actor.rig.position.set(0, 0, 0);
      actor.rig.rotation.set(0, 0, 0);
      actor.rig.scale.set(1, 1, 1);
    }
    if (actor?.parts?.head) actor.parts.head.rotation.set(0, 0, 0);
    if (actor?.parts?.body) actor.parts.body.rotation.set(0, 0, 0);
    if (actor?.parts?.armL) actor.parts.armL.rotation.set(0, 0, 0.12);
    if (actor?.parts?.armR) actor.parts.armR.rotation.set(0, 0, -0.12);

    // Hide ground shadow & poof ring during portrait framing & render
    shadowPart = actor?.parts?.shadow || null;
    if (shadowPart) {
      prevShadowVis = shadowPart.visible;
      shadowPart.visible = false;
    }
    poofPart = actor?.parts?.poofRing || null;
    if (poofPart) {
      prevPoofVis = poofPart.visible;
      poofPart.visible = false;
    }

    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    rig.scene.add(group);
    rig.scene.updateMatrixWorld(true);

    // Compute bounding box strictly over VISIBLE meshes (ignores hidden finaleJunk / emote / shadow)
    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const walkVisible = (node) => {
      if (!node || !node.visible) return;
      if (node.isMesh && node.geometry) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        if (node.geometry.boundingBox) {
          meshBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
          box.union(meshBox);
        }
      }
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) walkVisible(node.children[i]);
      }
    };
    walkVisible(group);
    if (box.isEmpty()) box.setFromObject(group);

    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    if (sizeVec.y < 0.05 || !Number.isFinite(sizeVec.y)) {
      rig.scene.remove(group);
      return false;
    }

    // Tight front-facing head + shoulders + hat crop (#149 P1)
    const center = new THREE.Vector3();
    box.getCenter(center);
    const topY = box.max.y + 0.08;
    const headBaseY = actor?.parts?.head?.position?.y ?? (box.min.y + sizeVec.y * 0.56);
    const botY = Math.max(box.min.y, headBaseY - 0.52);
    const cropSpan = Math.max(topY - botY, Math.min(sizeVec.x * 1.06, 2.15));
    const focusY = topY - cropSpan * 0.50;
    const halfTan = Math.tan((26 * Math.PI) / 360);
    const camZ = center.z + 0.58 + (cropSpan * 0.54) / halfTan;

    rig.camera.position.set(center.x, focusY, camZ);
    rig.camera.lookAt(center.x, focusY, center.z);
    rig.camera.updateProjectionMatrix();

    // Enforce toneMapped:false on all actor & accessory materials during portrait pass (#149 P1)
    const seenMats = new Set();
    group.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && !seenMats.has(m)) {
          seenMats.add(m);
          savedMats.push({ mat: m, toneMapped: m.toneMapped });
          m.toneMapped = false;
        }
      }
    });

    const prevTarget = renderer.getRenderTarget();
    const prevClearAlpha = renderer.getClearAlpha();
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevAutoClear = renderer.autoClear;
    const prevToneMapping = renderer.toneMapping;

    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(rig.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.clear(true, true, false);
      renderer.render(rig.scene, rig.camera);
      renderer.readRenderTargetPixels(rig.rt, 0, 0, SIZE, SIZE, rig.pixelBuf);
    } finally {
      renderer.toneMapping = prevToneMapping;
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClearColor, prevClearAlpha);
      renderer.autoClear = prevAutoClear;
      for (const item of savedMats) {
        item.mat.toneMapped = item.toneMapped;
      }
      if (shadowPart) shadowPart.visible = prevShadowVis;
      if (poofPart) poofPart.visible = prevPoofVis;
      rig.scene.remove(group);
    }

    let visiblePixels = 0;
    for (let i = 3; i < rig.pixelBuf.length; i += 16) {
      if (rig.pixelBuf[i] > 16) visiblePixels += 1;
    }
    if (visiblePixels < 40) return false;

    const g = outCanvas.getContext('2d');
    const imgData = g.createImageData(SIZE, SIZE);
    const dst = imgData.data;
    const rowBytes = SIZE * 4;
    for (let y = 0; y < SIZE; y++) {
      const srcOffset = (SIZE - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      dst.set(rig.pixelBuf.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
    g.putImageData(imgData, 0, 0);
    return true;
  } catch (_) {
    for (const item of savedMats) {
      item.mat.toneMapped = item.toneMapped;
    }
    if (shadowPart) shadowPart.visible = prevShadowVis;
    if (poofPart) poofPart.visible = prevPoofVis;
    if (rig && group) rig.scene.remove(group);
    ctx?.chars?.actors?.delete?.(actor);
    return false;
  }
}

function stampStickerOutline(jg, fgCanvas, outlineColor) {
  if (!silhouetteCanvas) {
    silhouetteCanvas = document.createElement('canvas');
    silhouetteCanvas.width = SIZE;
    silhouetteCanvas.height = SIZE;
  }
  const sg = silhouetteCanvas.getContext('2d');
  sg.imageSmoothingEnabled = false;
  sg.globalCompositeOperation = 'source-over';
  sg.clearRect(0, 0, SIZE, SIZE);
  sg.drawImage(fgCanvas, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = outlineColor;
  sg.fillRect(0, 0, SIZE, SIZE);
  sg.globalCompositeOperation = 'source-over';

  const offsets = [
    [-3, 0], [3, 0], [0, -3], [0, 3],
    [-2, -2], [2, -2], [-2, 2], [2, 2],
  ];
  for (const [dx, dy] of offsets) {
    jg.drawImage(silhouetteCanvas, dx, dy);
  }
}

export function renderPortrait(ctx, contestantId, accessories = []) {
  const actualCtx = typeof ctx === 'string' ? null : ctx;
  const id = typeof ctx === 'string' ? ctx : (contestantId || 'sheep');
  const accs = Array.isArray(typeof ctx === 'string' ? contestantId : accessories)
    ? (typeof ctx === 'string' ? contestantId : accessories)
    : [];

  // 1. Offscreen 192x192 transparent canvas (§3.7)
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  const rendered3D = tryRender3DPortrait(actualCtx, id, accs, canvas);
  if (!rendered3D) {
    drawContestantChibi2D(g, id, accs, SIZE, false);
  }

  // 2. Encode JPEG dataURL <= 12 KB over contestant's primary color (#149 P1)
  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = SIZE;
  jpegCanvas.height = SIZE;
  const jg = jpegCanvas.getContext('2d');
  jg.imageSmoothingEnabled = false;

  const meta = getContestantMeta(id);
  const primaryHex = meta?.colors?.primary || '#fff8eb';
  const secondaryHex = meta?.colors?.secondary || '#ffd43b';
  const luma = parseHexLuma(primaryHex);

  // Solid primary color backdrop + subtle center studio sheen
  jg.fillStyle = primaryHex;
  jg.fillRect(0, 0, SIZE, SIZE);

  const glow = jg.createRadialGradient(SIZE * 0.5, SIZE * 0.46, 12, SIZE * 0.5, SIZE * 0.5, SIZE * 0.68);
  if (luma < 75) {
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
  } else {
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.30)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  }
  jg.fillStyle = glow;
  jg.fillRect(0, 0, SIZE, SIZE);

  // Top accent bar in contestant's secondary color
  jg.fillStyle = secondaryHex;
  jg.fillRect(0, 0, SIZE, 6);

  // Crisp pixel sticker outline so white/dark mobs pop cleanly off their own primary color
  stampStickerOutline(jg, canvas, luma < 75 ? '#ffffff' : '#1b1c24');
  jg.drawImage(canvas, 0, 0);

  let quality = 0.80;
  let dataURL = jpegCanvas.toDataURL('image/jpeg', quality);
  while (dataURL.length > MAX_PORTRAIT_BYTES && quality > 0.24) {
    quality -= 0.1;
    dataURL = jpegCanvas.toDataURL('image/jpeg', quality);
  }
  if (dataURL.length > MAX_PORTRAIT_BYTES) {
    const compact = document.createElement('canvas');
    compact.width = 128;
    compact.height = 128;
    const cg = compact.getContext('2d');
    cg.imageSmoothingEnabled = false;
    cg.drawImage(jpegCanvas, 0, 0, 128, 128);
    dataURL = compact.toDataURL('image/jpeg', 0.68);
  }

  setPortraitDataURL(id, dataURL);
  if (actualCtx?.state) {
    if (actualCtx.state._portraits && typeof actualCtx.state._portraits === 'object') {
      actualCtx.state._portraits[id] = dataURL;
    }
    if (actualCtx.state.contestants?.[id]) {
      actualCtx.state.contestants[id].portrait = true;
    }
  }
  return { canvas, dataURL, accessories: [...accs] };
}

export default renderPortrait;
