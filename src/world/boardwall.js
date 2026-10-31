import * as THREE from '../../vendor/three.module.min.js';

// Matches §4 TIERS top->bottom:
const WALL_ROWS = [
  { id: 'perfect', label: '完美', sub: 'PERFECT', icon: '👑', color: '#c43bd8', dark: '#8d229e' },
  { id: 'gorgeous', label: '超漂亮', sub: 'GORGEOUS', icon: '💎', color: '#3b5bdb', dark: '#243da8' },
  { id: 'pretty', label: '漂亮', sub: 'PRETTY', icon: '🌸', color: '#f2c318', dark: '#bd920b' },
  { id: 'okay', label: '一般', sub: 'CUTE', icon: '🙂', color: '#d9342b', dark: '#9e1e17' },
  { id: 'tryhard', label: '再努力', sub: 'GO!', icon: '💪', color: '#3fae3a', dark: '#287d24' },
];

export function createBoardWall(ctx) {
  // Wall spans bx = 41..55 (15 blocks wide, x in [41, 56]), by = 8..17 (10 blocks high, y in [8, 18]), bz = 38 (south face at z = 39)
  const W = 960; // 64 px per block * 15 blocks
  const H = 640; // 64 px per block * 10 blocks
  const ROW_H = H / 5; // 128 px per row (2 blocks high)
  const LABEL_W = 128; // 2 blocks wide on the left (bx = 41..42), matching video 0:20!

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;

  const geo = new THREE.PlaneGeometry(15, 10);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
    toneMapped: false,
    fog: false,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'tierBoardWallPlane';
  mesh.position.set(48.5, 13.0, 39.025);

  if (ctx?.scene) {
    ctx.scene.add(mesh);
  }

  // Map id -> { tier, imgOrCanvas }
  const entries = new Map();
  let highlightedTier = null;

  function redraw() {
    g.clearRect(0, 0, W, H);

    for (let r = 0; r < WALL_ROWS.length; r++) {
      const row = WALL_ROWS[r];
      const y0 = r * ROW_H;

      // Pixel label badge on left 2 blocks (video 0:20 style)
      g.fillStyle = row.dark;
      g.fillRect(4, y0 + 4, LABEL_W - 8, ROW_H - 8);
      g.fillStyle = row.color;
      g.fillRect(8, y0 + 8, LABEL_W - 16, ROW_H - 16);

      // Inner pixel frame
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(12, y0 + 12, LABEL_W - 24, ROW_H - 24);

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 28px monospace, sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(row.icon, LABEL_W / 2, y0 + 42);

      g.font = 'bold 24px "Noto Sans SC", "PingFang SC", sans-serif';
      g.fillStyle = '#141414';
      g.fillText(row.label, LABEL_W / 2 + 2, y0 + 84);
      g.fillStyle = '#ffffff';
      g.fillText(row.label, LABEL_W / 2, y0 + 82);

      // Highlight glow frame if active
      if (highlightedTier === row.id) {
        g.strokeStyle = '#fff59d';
        g.lineWidth = 8;
        g.strokeRect(4, y0 + 4, W - 8, ROW_H - 8);
        g.fillStyle = 'rgba(255, 250, 170, 0.18)';
        g.fillRect(LABEL_W, y0 + 6, W - LABEL_W - 6, ROW_H - 12);
      }

      // Draw polaroid portraits placed in this tier
      const rowItems = [];
      for (const [id, item] of entries.entries()) {
        if (item.tier === row.id && item.drawable) {
          rowItems.push({ id, ...item });
        }
      }

      if (rowItems.length > 0) {
        const availW = W - LABEL_W - 20;
        const maxCard = 106;
        const gap = 8;
        const step = Math.min(maxCard + gap, Math.floor(availW / rowItems.length));
        const cardSize = Math.max(48, Math.min(maxCard, step - 6));
        const cy = y0 + Math.floor((ROW_H - cardSize) / 2);

        for (let i = 0; i < rowItems.length; i++) {
          const cx = LABEL_W + 12 + i * step;
          // Drop shadow
          g.fillStyle = 'rgba(0,0,0,0.38)';
          g.fillRect(cx + 4, cy + 4, cardSize, cardSize);
          // White polaroid border
          g.fillStyle = '#fcfbf7';
          g.fillRect(cx, cy, cardSize, cardSize);
          // Inner photo background
          const pad = Math.max(4, Math.floor(cardSize * 0.08));
          const bottomPad = Math.max(8, Math.floor(cardSize * 0.16));
          const imgW = cardSize - pad * 2;
          const imgH = cardSize - pad - bottomPad;
          g.fillStyle = '#cfe8ff';
          g.fillRect(cx + pad, cy + pad, imgW, imgH);
          try {
            g.drawImage(rowItems[i].drawable, cx + pad, cy + pad, imgW, imgH);
          } catch (_) {
            // Ignore unloaded image
          }
        }
      }
    }

    tex.needsUpdate = true;
  }

  redraw();

  function setPortrait(id, source, tier) {
    if (!id) return;
    if (!tier) {
      entries.delete(id);
      redraw();
      return;
    }
    if (!source) {
      // Create a simple placeholder card if portrait source is omitted
      const ph = document.createElement('canvas');
      ph.width = 64;
      ph.height = 64;
      const pg = ph.getContext('2d');
      pg.fillStyle = '#ffe082';
      pg.fillRect(0, 0, 64, 64);
      pg.fillStyle = '#333';
      pg.font = 'bold 18px sans-serif';
      pg.textAlign = 'center';
      pg.textBaseline = 'middle';
      pg.fillText(String(id).slice(0, 4), 32, 32);
      entries.set(id, { tier, drawable: ph });
      redraw();
      return;
    }
    if (typeof source === 'string') {
      const img = new Image();
      img.onload = () => {
        const cur = entries.get(id);
        if (cur && cur.imgRef === img) {
          cur.drawable = img;
          redraw();
        }
      };
      entries.set(id, { tier, drawable: null, imgRef: img });
      img.src = source;
      return;
    }
    // HTMLCanvasElement / ImageBitmap / OffscreenCanvas
    const drawable = source.canvas || source;
    entries.set(id, { tier, drawable });
    redraw();
  }

  function highlight(tier) {
    if (highlightedTier === (tier || null)) return;
    highlightedTier = tier || null;
    redraw();
  }

  function clear() {
    entries.clear();
    highlightedTier = null;
    redraw();
  }

  function setArea(area) {
    mesh.visible = area === 'hub';
  }

  return {
    mesh,
    canvas,
    setPortrait,
    highlight,
    clear,
    setArea,
  };
}
