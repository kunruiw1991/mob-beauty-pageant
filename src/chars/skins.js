import * as THREE from '../../vendor/three.module.min.js';

const skinCache = new Map();
const skinCanvasCache = new Map();

export function createCanvas(w = 64, h = 64) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return { width: w, height: h, getContext: () => null };
}

export function canvasToTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Deterministic integer hash for pixel noise (pure integer arithmetic)
export function hash2i(x, y, seed = 1) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0);
}

export function shadeHex(hex, delta) {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const num = parseInt(c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + delta));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + delta));
  const b = Math.max(0, Math.min(255, (num & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

export function fillNoiseRect(g, x0, y0, w, h, palette, seed = 1) {
  if (!g) return;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = hash2i(x0 + dx, y0 + dy, seed) % palette.length;
      g.fillStyle = palette[idx];
      g.fillRect(x0 + dx, y0 + dy, 1, 1);
    }
  }
}

export function paintUnfoldedBox(g, u0, v0, pw, ph, pd, baseHex, seed = 7) {
  if (!g) return;
  const topCol = shadeHex(baseHex, 14);
  const botCol = shadeHex(baseHex, -26);
  const sideCol = shadeHex(baseHex, -10);
  const backCol = shadeHex(baseHex, -6);
  const frontPal = [baseHex, shadeHex(baseHex, 5), shadeHex(baseHex, -5)];
  const sidePal = [sideCol, shadeHex(baseHex, -15), baseHex];

  // +y top
  fillNoiseRect(g, u0 + pd, v0, pw, pd, [topCol, baseHex], seed + 1);
  // -y bottom
  g.fillStyle = botCol;
  g.fillRect(u0 + pd + pw, v0, pw, pd);
  // -x right side
  fillNoiseRect(g, u0, v0 + pd, pd, ph, sidePal, seed + 2);
  // +z front
  fillNoiseRect(g, u0 + pd, v0 + pd, pw, ph, frontPal, seed + 3);
  // +x left side
  fillNoiseRect(g, u0 + pd + pw, v0 + pd, pd, ph, sidePal, seed + 4);
  // -z back
  fillNoiseRect(g, u0 + pd + pw + pd, v0 + pd, pw, ph, [backCol, sideCol, baseHex], seed + 5);
}

export function getOrCreateSkinMaterial(key, drawFn, opts = {}) {
  const cacheKey = `${key}:${opts.transparent ? 't' : 'o'}:${opts.opacity ?? 1}`;
  if (skinCache.has(cacheKey)) return skinCache.get(cacheKey);
  const w = opts.width || 64;
  const h = opts.height || 64;
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    drawFn(g, w, h);
  }
  skinCanvasCache.set(key, canvas);
  const map = canvasToTexture(canvas);
  const mat = new THREE.MeshLambertMaterial({
    map,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    alphaTest: opts.alphaTest ?? 0,
    depthWrite: opts.depthWrite ?? !opts.transparent,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  skinCache.set(cacheKey, mat);
  return mat;
}

export function getSkinCanvas(key) {
  return skinCanvasCache.get(key) || null;
}

const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();

export function buildBoxUV(
  w, h, d, u0, v0, texW = 64, texH = 64,
  ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0,
  pxOverride = null
) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) {
    _euler.set(rx, ry, rz, 'XYZ');
    _mat4.makeRotationFromEuler(_euler);
    geo.applyMatrix4(_mat4);
  }
  if (ox || oy || oz) geo.translate(ox, oy, oz);

  const pw = pxOverride?.pw ?? Math.max(1, Math.round(w * 8));
  const ph = pxOverride?.ph ?? Math.max(1, Math.round(h * 8));
  const pd = pxOverride?.pd ?? Math.max(1, Math.round(d * 8));

  // BoxGeometry face order: +x (left side of char), -x (right side of char), +y (top), -y (bottom), +z (front), -z (back)
  const faces = [
    [u0 + pd + pw, v0 + pd, pd, ph],       // +x
    [u0, v0 + pd, pd, ph],                 // -x
    [u0 + pd, v0, pw, pd],                 // +y (top)
    [u0 + pd + pw, v0, pw, pd],            // -y (bottom)
    [u0 + pd, v0 + pd, pw, ph],            // +z (front)
    [u0 + pd + pw + pd, v0 + pd, pw, ph],  // -z (back)
  ];
  const uv = geo.attributes.uv;
  const eps = 0.045;
  for (let f = 0; f < 6; f++) {
    const [fx, fy, fw, fh] = faces[f];
    const x1 = (fx + eps) / texW;
    const x2 = (fx + fw - eps) / texW;
    const yTop = 1 - (fy + eps) / texH;
    const yBot = 1 - (fy + fh - eps) / texH;
    const base = f * 4;
    uv.setXY(base + 0, x1, yTop);
    uv.setXY(base + 1, x2, yTop);
    uv.setXY(base + 2, x1, yBot);
    uv.setXY(base + 3, x2, yBot);
  }
  uv.needsUpdate = true;
  return geo;
}

export function buildSwatchBox(
  w, h, d, sx, sy, sw = 8, sh = 8,
  ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0,
  texW = 64, texH = 64
) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) {
    _euler.set(rx, ry, rz, 'XYZ');
    _mat4.makeRotationFromEuler(_euler);
    geo.applyMatrix4(_mat4);
  }
  if (ox || oy || oz) geo.translate(ox, oy, oz);

  const uv = geo.attributes.uv;
  const eps = 0.06;
  const x1 = (sx + eps) / texW;
  const x2 = (sx + sw - eps) / texW;
  const yTop = 1 - (sy + eps) / texH;
  const yBot = 1 - (sy + sh - eps) / texH;
  for (let f = 0; f < 6; f++) {
    const base = f * 4;
    uv.setXY(base + 0, x1, yTop);
    uv.setXY(base + 1, x2, yTop);
    uv.setXY(base + 2, x1, yBot);
    uv.setXY(base + 3, x2, yBot);
  }
  uv.needsUpdate = true;
  return geo;
}

export function mergeGeometries(geos) {
  if (!geos || geos.length === 0) return new THREE.BoxGeometry(0.01, 0.01, 0.01);
  if (geos.length === 1) return geos[0];
  let totalVerts = 0;
  let totalIdx = 0;
  const hasColor = !!geos[0].attributes.color;
  for (const g of geos) {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = geos[0].attributes.uv ? new Float32Array(totalVerts * 2) : null;
  const col = hasColor ? new Float32Array(totalVerts * 3) : null;
  const idx = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vOff * 3);
    norm.set(g.attributes.normal.array, vOff * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, vOff * 2);
    if (col && g.attributes.color) col.set(g.attributes.color.array, vOff * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[iOff + i] = gi[i] + vOff;
      iOff += gi.length;
    } else {
      const cnt = g.attributes.position.count;
      for (let i = 0; i < cnt; i++) idx[iOff + i] = vOff + i;
      iOff += cnt;
    }
    vOff += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const g of geos) g.dispose();
  return out;
}
