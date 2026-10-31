// Billboard sprite pool for XP-orb sparkles, hearts & emoji popups per docs/DESIGN.md §3.8, §9 (owner: fx-audio).
// Single InstancedMesh (1 draw call), frustumCulled = false, zero per-effect texture/geometry allocation.
import * as THREE from '../../vendor/three.module.min.js';

const GRID = 8; // 8x8 = 64 tiles of 64x64 on a 512x512 canvas
const CELL = 64;
const ATLAS_SIZE = GRID * CELL;
const MAX_SPRITES = 512;

const PRESET_ICONS = [
  '__xp__',    // 0: MC XP orb
  '__star__',  // 1: 4-point pixel star sparkle
  '__heart__', // 2: plump pixel heart
  '__note__',  // 3: pixel musical note
  '😜', '💢', '❓', '❗', '🎂', '💎', '💚', '🌸',
  '👑', '📸', '⭐', '❄️', '🔥', '💤', '🎉', '🐟',
  '🎃', '🍯', '💀', '🩷', '✨', '👍', '💪', '🙂',
  '😂', '🥳', '🫧', '🌷', '🍎', '🎀', '🎩', '😎',
];

function drawPixelHeart(g, ox, oy) {
  const rows = [
    '..111...111..',
    '.12221.12221.',
    '1233221222221',
    '1232222222221',
    '1222222222221',
    '.12222222221.',
    '..122222221..',
    '...1222221...',
    '....12221....',
    '.....121.....',
    '......1......',
  ];
  const ps = 4;
  const sx = ox + Math.floor((CELL - rows[0].length * ps) / 2);
  const sy = oy + Math.floor((CELL - rows.length * ps) / 2);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      g.fillStyle = ch === '1' ? '#6a0d25' : ch === '3' ? '#ffffff' : '#ff3366';
      g.fillRect(sx + c * ps, sy + r * ps, ps, ps);
    }
  }
}

function drawXpOrb(g, ox, oy) {
  const cx = ox + CELL / 2;
  const cy = oy + CELL / 2;
  const ps = 4;
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d2 = x * x + y * y;
      if (d2 > 38) continue;
      if (d2 > 26) g.fillStyle = '#38b000';
      else if (d2 > 10) g.fillStyle = '#aacc00';
      else g.fillStyle = '#ffffb5';
      g.fillRect(cx + x * ps - 2, cy + y * ps - 2, ps, ps);
    }
  }
}

function drawPixelStar(g, ox, oy) {
  const cx = ox + CELL / 2;
  const cy = oy + CELL / 2;
  const ps = 4;
  for (let y = -7; y <= 7; y++) {
    for (let x = -7; x <= 7; x++) {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if ((ax === 0 && ay <= 6) || (ay === 0 && ax <= 6) || (ax + ay <= 4)) {
        g.fillStyle = ax + ay <= 2 ? '#ffffff' : '#fff3a1';
        g.fillRect(cx + x * ps - 2, cy + y * ps - 2, ps, ps);
      }
    }
  }
}

function drawPixelNote(g, ox, oy) {
  const sx = ox + 16;
  const sy = oy + 10;
  g.fillStyle = '#ffffff';
  g.fillRect(sx + 12, sy + 4, 20, 6);
  g.fillRect(sx + 12, sy + 4, 5, 28);
  g.fillRect(sx + 27, sy + 4, 5, 26);
  g.fillRect(sx + 4, sy + 26, 12, 10);
  g.fillRect(sx + 19, sy + 24, 12, 10);
}

export function createPopups(ctx, rand) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let g = null;
  let tex = null;
  const iconToTile = new Map();
  let nextDynamicSlot = PRESET_ICONS.length;

  function renderGlyphCell(slot, icon) {
    if (!g) return;
    const col = slot % GRID;
    const row = Math.floor(slot / GRID);
    const ox = col * CELL;
    const oy = row * CELL;
    g.clearRect(ox, oy, CELL, CELL);
    if (icon === '__xp__') drawXpOrb(g, ox, oy);
    else if (icon === '__star__') drawPixelStar(g, ox, oy);
    else if (icon === '__heart__') drawPixelHeart(g, ox, oy);
    else if (icon === '__note__') drawPixelNote(g, ox, oy);
    else {
      g.save();
      g.font = 'bold 40px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(20,20,30,0.65)';
      const label = String(icon).slice(0, 4);
      g.strokeText(label, ox + CELL / 2, oy + CELL / 2 + 2);
      g.fillStyle = '#ffffff';
      g.fillText(label, ox + CELL / 2, oy + CELL / 2 + 2);
      g.restore();
    }
  }

  if (canvas) {
    canvas.width = ATLAS_SIZE;
    canvas.height = ATLAS_SIZE;
    g = canvas.getContext('2d');
    for (let i = 0; i < PRESET_ICONS.length; i++) {
      iconToTile.set(PRESET_ICONS[i], i);
      renderGlyphCell(i, PRESET_ICONS[i]);
    }
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false; // direct top-left row indexing!
    tex.needsUpdate = true;
  }

  function resolveTile(icon) {
    if (typeof icon === 'number') return icon & 63;
    const key = String(icon || '✨');
    if (iconToTile.has(key)) return iconToTile.get(key);
    const slot = nextDynamicSlot;
    nextDynamicSlot = PRESET_ICONS.length + ((nextDynamicSlot - PRESET_ICONS.length + 1) % (64 - PRESET_ICONS.length));
    iconToTile.set(key, slot);
    renderGlyphCell(slot, key);
    if (tex) tex.needsUpdate = true;
    return slot;
  }

  const geom = new THREE.PlaneGeometry(1, 1);
  // Flip V on geometry UVs since flipY = false on canvas texture
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, 1 - uv.getY(i));
  }
  const tileData = new Float32Array(MAX_SPRITES * 3); // uOffset, vOffset, alpha
  const tileAttr = new THREE.InstancedBufferAttribute(tileData, 3);
  tileAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('aTile', tileAttr);

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.04,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aTile;\nvarying float vTileAlpha;'
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vMapUv / ${GRID.toFixed(1)} + aTile.xy;
        #endif
        vTileAlpha = aTile.z;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vTileAlpha;'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.a *= vTileAlpha;`
      );
  };

  const mesh = new THREE.InstancedMesh(geom, mat, MAX_SPRITES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.count = 0;
  mesh.visible = false;
  if (ctx?.scene) ctx.scene.add(mesh);

  // Compact SoA storage
  const px = new Float32Array(MAX_SPRITES);
  const py = new Float32Array(MAX_SPRITES);
  const pz = new Float32Array(MAX_SPRITES);
  const vx = new Float32Array(MAX_SPRITES);
  const vy = new Float32Array(MAX_SPRITES);
  const vz = new Float32Array(MAX_SPRITES);
  const sc = new Float32Array(MAX_SPRITES);
  const cr = new Float32Array(MAX_SPRITES);
  const cg = new Float32Array(MAX_SPRITES);
  const cb = new Float32Array(MAX_SPRITES);
  const age = new Float32Array(MAX_SPRITES);
  const life = new Float32Array(MAX_SPRITES);
  const delay = new Float32Array(MAX_SPRITES);
  const grav = new Float32Array(MAX_SPRITES);
  const drag = new Float32Array(MAX_SPRITES);
  const roll = new Float32Array(MAX_SPRITES);
  const tileIdx = new Uint8Array(MAX_SPRITES);
  const mode = new Uint8Array(MAX_SPRITES); // 0=normal, 1=toPlayer XP orb, 2=popup bounce, 3=heart float
  let active = 0;

  function copySlot(dst, src) {
    px[dst] = px[src]; py[dst] = py[src]; pz[dst] = pz[src];
    vx[dst] = vx[src]; vy[dst] = vy[src]; vz[dst] = vz[src];
    sc[dst] = sc[src];
    cr[dst] = cr[src]; cg[dst] = cg[src]; cb[dst] = cb[src];
    age[dst] = age[src]; life[dst] = life[src]; delay[dst] = delay[src];
    grav[dst] = grav[src]; drag[dst] = drag[src]; roll[dst] = roll[src];
    tileIdx[dst] = tileIdx[src]; mode[dst] = mode[src];
  }

  function spawn(o) {
    let i = active;
    if (i >= MAX_SPRITES) {
      i = Math.floor(rand() * MAX_SPRITES);
    } else {
      active++;
    }
    px[i] = o.x ?? 48;
    py[i] = o.y ?? 9;
    pz[i] = o.z ?? 48;
    vx[i] = o.vx ?? 0;
    vy[i] = o.vy ?? 1.5;
    vz[i] = o.vz ?? 0;
    sc[i] = o.scale ?? 0.5;
    cr[i] = o.cr ?? 1;
    cg[i] = o.cg ?? 1;
    cb[i] = o.cb ?? 1;
    age[i] = 0;
    life[i] = Math.max(0.08, o.life ?? 0.9);
    delay[i] = o.delay ?? 0;
    grav[i] = o.gravity ?? 0;
    drag[i] = o.drag ?? 1.2;
    roll[i] = o.roll ?? 0;
    tileIdx[i] = (o.tile ?? 0) & 63;
    mode[i] = o.mode ?? 0;
  }

  function normPos(pos, dy = 1.0) {
    if (pos && typeof pos === 'object') {
      return {
        x: Number(pos.x ?? pos[0] ?? 48),
        y: Number(pos.y ?? pos[1] ?? 8) + dy,
        z: Number(pos.z ?? pos[2] ?? 48),
      };
    }
    const p = ctx?.player;
    return { x: p?.x ?? 48, y: (p?.y ?? 8) + dy, z: p?.z ?? 48 };
  }

  function sparkles(pos, n = 10, opts = {}) {
    if (typeof n === 'object' && n !== null) {
      opts = n;
      n = opts.n ?? 10;
    }
    const count = Math.max(1, Math.min(120, Math.floor(Number(n) || 10)));
    const p = normPos(pos, 0.55);
    const toPlayer = Boolean(opts?.toPlayer);
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2;
      const spd = 1.4 + rand() * 3.0;
      const isGold = (i & 1) === 0;
      spawn({
        x: p.x + (rand() - 0.5) * 0.45,
        y: p.y + rand() * 0.45,
        z: p.z + (rand() - 0.5) * 0.45,
        vx: Math.cos(ang) * spd,
        vy: 2.0 + rand() * 2.8,
        vz: Math.sin(ang) * spd,
        scale: toPlayer ? 0.34 + rand() * 0.14 : 0.38 + rand() * 0.18,
        tile: toPlayer ? 0 : (i % 3 === 0 ? 0 : 1),
        cr: isGold ? 1.0 : 0.58,
        cg: 1.0,
        cb: isGold ? 0.42 : 0.32,
        life: toPlayer ? 0.65 + rand() * 0.35 : 0.75 + rand() * 0.45,
        gravity: toPlayer ? 0 : 2.2,
        drag: toPlayer ? 2.8 : 2.0,
        mode: toPlayer ? 1 : 0,
      });
    }
    return count;
  }

  function hearts(pos, n = 8) {
    const count = Math.max(1, Math.min(80, Math.floor(Number(n) || 8)));
    const p = normPos(pos, 1.1);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.5;
      const spd = 0.7 + rand() * 1.6;
      const pink = rand() > 0.45;
      spawn({
        x: p.x + Math.cos(ang) * 0.35,
        y: p.y + rand() * 0.5,
        z: p.z + Math.sin(ang) * 0.35,
        vx: Math.cos(ang) * spd,
        vy: 1.5 + rand() * 1.6,
        vz: Math.sin(ang) * spd,
        scale: 0.46 + rand() * 0.24,
        tile: 2,
        cr: 1.0,
        cg: pink ? 0.62 : 0.35,
        cb: pink ? 0.82 : 0.52,
        life: 1.05 + rand() * 0.45,
        gravity: -0.35,
        drag: 1.6,
        roll: rand() * 6.28,
        mode: 3,
      });
    }
    return count;
  }

  function popup(pos, icon = '✨') {
    const p = normPos(pos, 1.55);
    const tile = resolveTile(icon);
    spawn({
      x: p.x + (rand() - 0.5) * 0.2,
      y: p.y,
      z: p.z + (rand() - 0.5) * 0.2,
      vx: (rand() - 0.5) * 0.4,
      vy: 1.65,
      vz: (rand() - 0.5) * 0.4,
      scale: 0.82,
      tile,
      cr: 1,
      cg: 1,
      cb: 1,
      life: 1.15,
      gravity: 0.9,
      drag: 1.8,
      mode: 2,
    });
    return 1;
  }

  // Camera basis vectors extracted once per update for ultra-fast billboard matrices
  const _camRight = new THREE.Vector3(1, 0, 0);
  const _camUp = new THREE.Vector3(0, 1, 0);
  const _camFwd = new THREE.Vector3(0, 0, 1);

  function update(dt) {
    if (ctx?.scene && mesh.parent !== ctx.scene) {
      ctx.scene.add(mesh);
    }
    if (active === 0) {
      mesh.count = 0;
      mesh.visible = false;
      return;
    }

    if (ctx?.camera) {
      const te = ctx.camera.matrixWorld.elements;
      _camRight.set(te[0], te[1], te[2]).normalize();
      _camUp.set(te[4], te[5], te[6]).normalize();
      _camFwd.set(te[8], te[9], te[10]).normalize();
    }

    const pl = ctx?.player || ctx?.state?.player;
    const plX = pl?.x ?? 48;
    const plY = (pl?.y ?? 8) + 0.95;
    const plZ = pl?.z ?? 48;

    const matArr = mesh.instanceMatrix.array;
    const colArr = mesh.instanceColor.array;
    const rx0 = _camRight.x, rx1 = _camRight.y, rx2 = _camRight.z;
    const ux0 = _camUp.x, ux1 = _camUp.y, ux2 = _camUp.z;
    const fx0 = _camFwd.x, fx1 = _camFwd.y, fx2 = _camFwd.z;

    let i = 0;
    while (i < active) {
      if (delay[i] > 0) {
        delay[i] -= dt;
        const mOff = i * 16;
        matArr[mOff] = 0; matArr[mOff + 5] = 0; matArr[mOff + 10] = 0; matArr[mOff + 15] = 1;
        tileData[i * 3 + 2] = 0;
        i++;
        continue;
      }

      age[i] += dt;
      if (age[i] >= life[i]) {
        active--;
        if (i < active) copySlot(i, active);
        continue;
      }

      const t = age[i] / life[i];
      const m = mode[i];

      if (m === 1) {
        // XP-orb homing smoothly toward player after initial burst pop (0.14s)
        const dx = plX - px[i];
        const dy = plY - py[i];
        const dz = plZ - pz[i];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (age[i] > 0.14 && distSq < 0.18) {
          // Collected at player!
          active--;
          if (i < active) copySlot(i, active);
          continue;
        }
        const pull = age[i] < 0.12 ? 4.0 : 22.0 + t * 38.0;
        const invD = 1 / Math.max(0.25, Math.sqrt(distSq));
        vx[i] += dx * invD * pull * dt;
        vy[i] += dy * invD * pull * dt;
        vz[i] += dz * invD * pull * dt;
      }

      const damp = Math.max(0, 1 - drag[i] * dt);
      vx[i] *= damp;
      vz[i] *= damp;
      vy[i] = vy[i] * damp - grav[i] * dt;

      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      if (m === 3) {
        // Gentle lateral sway on floating hearts
        px[i] += Math.sin(age[i] * 7.5 + roll[i]) * 0.45 * dt;
      }

      let s = sc[i];
      let alpha = 1.0;
      if (m === 2) {
        // Elastic pop-in for emoji popups, hold, then fade
        const pop = t < 0.16 ? 0.35 + (t / 0.16) * 0.85 : t < 0.28 ? 1.2 - ((t - 0.16) / 0.12) * 0.2 : 1.0;
        s *= pop;
        alpha = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1.0;
      } else if (m === 1) {
        // Pulsing XP orb
        s *= 0.88 + 0.22 * Math.sin(age[i] * 22.0);
        alpha = t > 0.82 ? Math.max(0, 1 - (t - 0.82) / 0.18) : 1.0;
      } else {
        const grow = t < 0.12 ? t / 0.12 : 1.0;
        s *= grow * (1 - t * 0.25);
        alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1.0;
      }

      const mOff = i * 16;
      matArr[mOff] = rx0 * s;     matArr[mOff + 1] = rx1 * s;     matArr[mOff + 2] = rx2 * s;     matArr[mOff + 3] = 0;
      matArr[mOff + 4] = ux0 * s; matArr[mOff + 5] = ux1 * s;     matArr[mOff + 6] = ux2 * s;     matArr[mOff + 7] = 0;
      matArr[mOff + 8] = fx0 * s; matArr[mOff + 9] = fx1 * s;     matArr[mOff + 10] = fx2 * s;    matArr[mOff + 11] = 0;
      matArr[mOff + 12] = px[i];  matArr[mOff + 13] = py[i];      matArr[mOff + 14] = pz[i];      matArr[mOff + 15] = 1;

      const cOff = i * 3;
      if (m === 1) {
        // Classic MC green-gold XP shimmer
        const shimmer = 0.5 + 0.5 * Math.sin(age[i] * 18.0 + i);
        colArr[cOff] = 0.45 + 0.55 * shimmer;
        colArr[cOff + 1] = 1.0;
        colArr[cOff + 2] = 0.25 + 0.25 * shimmer;
      } else {
        colArr[cOff] = cr[i];
        colArr[cOff + 1] = cg[i];
        colArr[cOff + 2] = cb[i];
      }

      const ti = tileIdx[i];
      tileData[cOff] = (ti % GRID) / GRID;
      tileData[cOff + 1] = Math.floor(ti / GRID) / GRID;
      tileData[cOff + 2] = alpha;

      i++;
    }

    mesh.count = active;
    mesh.visible = active > 0;
    if (active > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      tileAttr.needsUpdate = true;
    }
  }

  function clear() {
    active = 0;
    mesh.count = 0;
    mesh.visible = false;
  }

  return {
    mesh,
    spawn,
    sparkles,
    hearts,
    popup,
    update,
    clear,
    liveCount: () => active,
  };
}
