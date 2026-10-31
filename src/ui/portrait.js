// Offscreen 192x192 portrait renderer per docs/DESIGN.md §3.7 (owner: pageant-ui).
// Renders live 3D voxel actor via WebGLRenderTarget when available (0 extra WebGL contexts),
// falls back cleanly to Look-Bible chibi pixel portrait, and encodes JPEG strictly <= 12 KB.

import { getContestantMeta } from '../data/roster.js';
import { drawContestantChibi2D } from './ui_kit.js';
import { setPortraitDataURL, MAX_PORTRAIT_BYTES } from './progress.js';

const SIZE = 192;
let cachedRig = null;

function getOrCreateRig(THREE) {
  if (cachedRig && cachedRig.THREE === THREE) return cachedRig;
  const scene = new THREE.Scene();
  const amb = new THREE.AmbientLight(0xffffff, 1.15);
  const dir = new THREE.DirectionalLight(0xfff6e5, 0.95);
  dir.position.set(2.2, 3.8, 3.8);
  scene.add(amb, dir);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
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
    const meta = getContestantMeta(contestantId);
    const heads = meta?.heads || 1;
    const accList = Array.isArray(accessories) ? accessories.filter(Boolean) : [];
    for (let i = 0; i < accList.length; i++) {
      actor?.setAccessory?.(accList[i], heads > 1 ? i % heads : 0);
    }
    actor?.setAnim?.('pose');
    actor?.update?.(0.05);

    group.position.set(0, 0, 0);
    group.rotation.set(0, 0.14, 0);
    rig.scene.add(group);
    rig.scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(group);
    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    if (sizeVec.y < 0.05 || !Number.isFinite(sizeVec.y)) {
      rig.scene.remove(group);
      return false;
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const focusY = box.min.y + sizeVec.y * 0.64;
    const dist = Math.max(2.35, sizeVec.y * 1.28);
    rig.camera.position.set(center.x + 0.18, focusY + 0.1, center.z + dist);
    rig.camera.lookAt(center.x, focusY, center.z);
    rig.camera.updateProjectionMatrix();

    const prevTarget = renderer.getRenderTarget();
    const prevClearAlpha = renderer.getClearAlpha();
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevAutoClear = renderer.autoClear;

    renderer.setRenderTarget(rig.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.clear(true, true, false);
    renderer.render(rig.scene, rig.camera);
    renderer.readRenderTargetPixels(rig.rt, 0, 0, SIZE, SIZE, rig.pixelBuf);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    rig.scene.remove(group);

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
    if (rig && group) rig.scene.remove(group);
    ctx?.chars?.actors?.delete?.(actor);
    return false;
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

  // 2. Encode JPEG dataURL <= 12 KB over pastel voxel studio backdrop
  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = SIZE;
  jpegCanvas.height = SIZE;
  const jg = jpegCanvas.getContext('2d');
  jg.imageSmoothingEnabled = false;

  const meta = getContestantMeta(id);
  const bgGrad = jg.createLinearGradient(0, 0, 0, SIZE);
  bgGrad.addColorStop(0, '#dff4ff');
  bgGrad.addColorStop(0.74, '#f8f5ec');
  bgGrad.addColorStop(0.75, '#95d5b2');
  bgGrad.addColorStop(1, '#74c69d');
  jg.fillStyle = bgGrad;
  jg.fillRect(0, 0, SIZE, SIZE);

  jg.fillStyle = meta?.colors?.secondary || '#ffd43b';
  jg.fillRect(0, 0, SIZE, 8);
  jg.drawImage(canvas, 0, 0);

  let quality = 0.78;
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
    dataURL = compact.toDataURL('image/jpeg', 0.65);
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
