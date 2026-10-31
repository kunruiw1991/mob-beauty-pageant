// Instanced 3D particle pools, screen overlays & automatic juice coordinator per docs/DESIGN.md §3.8, §9 (owner: fx-audio).
// Strict draw-call budget: <= 3 InstancedMeshes total (cubePool + spritePool + ringPool), frustumCulled = false,
// zero per-effect geometry/material/texture allocations, deterministic mulberry32 PRNG only.
import * as THREE from '../../vendor/three.module.min.js';
import { createShake } from './shake.js';
import { createConfetti } from './confetti.js';
import { createFireworks } from './fireworks.js';
import { createPopups } from './popups.js';
import { createRings } from './rings.js';

const MAX_CUBES = 1024;
const _tmpCol = new THREE.Color();

// Fallback palette if world.blockColor is not yet initialized
const FALLBACK_BLOCK_COLORS = Object.freeze([
  0x6abe30, 0x8b5a2b, 0x8d949e, 0xd9a066, 0xf4f8ff, 0x51cf66, 0xffd43b, 0xe8590c,
]);

function makeMulberry32(seed) {
  let a = (seed >>> 0) || 0x12345678;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createShadedCubeGeometry() {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  // Subtle voxel face shading (+X, -X, +Y, -Y, +Z, -Z) so unlit MeshBasicMaterial cubes
  // look crisp 3D Minecraft blocks AND pop brightly in any biome (Hub/End/Nether)!
  const faceShades = [0.86, 0.82, 1.0, 0.62, 0.92, 0.76];
  const n = geom.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let face = 0; face < 6; face++) {
    const shade = faceShades[face];
    for (let v = 0; v < 4; v++) {
      const idx = (face * 4 + v) * 3;
      if (idx + 2 < colors.length) {
        colors[idx] = shade;
        colors[idx + 1] = shade;
        colors[idx + 2] = shade;
      }
    }
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

function createCubePool(ctx, rand) {
  const geom = createShadedCubeGeometry();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    toneMapped: false,
  });

  const mesh = new THREE.InstancedMesh(geom, mat, MAX_CUBES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CUBES * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.count = 0;
  mesh.visible = false;
  if (ctx?.scene) ctx.scene.add(mesh);

  // Compact Struct-of-Arrays (SoA) for ultra-fast update(dt) (<= 0.3 ms @ 600 live particles)
  const px = new Float32Array(MAX_CUBES);
  const py = new Float32Array(MAX_CUBES);
  const pz = new Float32Array(MAX_CUBES);
  const vx = new Float32Array(MAX_CUBES);
  const vy = new Float32Array(MAX_CUBES);
  const vz = new Float32Array(MAX_CUBES);
  const rx = new Float32Array(MAX_CUBES);
  const ry = new Float32Array(MAX_CUBES);
  const rz = new Float32Array(MAX_CUBES);
  const vrx = new Float32Array(MAX_CUBES);
  const vry = new Float32Array(MAX_CUBES);
  const vrz = new Float32Array(MAX_CUBES);
  const sx = new Float32Array(MAX_CUBES);
  const sy = new Float32Array(MAX_CUBES);
  const sz = new Float32Array(MAX_CUBES);
  const cr = new Float32Array(MAX_CUBES);
  const cg = new Float32Array(MAX_CUBES);
  const cb = new Float32Array(MAX_CUBES);
  const age = new Float32Array(MAX_CUBES);
  const life = new Float32Array(MAX_CUBES);
  const delay = new Float32Array(MAX_CUBES);
  const grav = new Float32Array(MAX_CUBES);
  const drag = new Float32Array(MAX_CUBES);
  const flutter = new Float32Array(MAX_CUBES);
  const bounce = new Float32Array(MAX_CUBES);
  const groundY = new Float32Array(MAX_CUBES);
  let active = 0;

  function copySlot(d, s) {
    px[d] = px[s]; py[d] = py[s]; pz[d] = pz[s];
    vx[d] = vx[s]; vy[d] = vy[s]; vz[d] = vz[s];
    rx[d] = rx[s]; ry[d] = ry[s]; rz[d] = rz[s];
    vrx[d] = vrx[s]; vry[d] = vry[s]; vrz[d] = vrz[s];
    sx[d] = sx[s]; sy[d] = sy[s]; sz[d] = sz[s];
    cr[d] = cr[s]; cg[d] = cg[s]; cb[d] = cb[s];
    age[d] = age[s]; life[d] = life[s]; delay[d] = delay[s];
    grav[d] = grav[s]; drag[d] = drag[s]; flutter[d] = flutter[s];
    bounce[d] = bounce[s]; groundY[d] = groundY[s];
  }

  function spawn(o) {
    let i = active;
    if (i >= MAX_CUBES) {
      i = Math.floor(rand() * MAX_CUBES);
    } else {
      active++;
    }
    px[i] = o.x ?? 48;
    py[i] = o.y ?? 9;
    pz[i] = o.z ?? 48;
    vx[i] = o.vx ?? 0;
    vy[i] = o.vy ?? 0;
    vz[i] = o.vz ?? 0;
    rx[i] = o.rx ?? 0;
    ry[i] = o.ry ?? 0;
    rz[i] = o.rz ?? 0;
    vrx[i] = o.vrx ?? 0;
    vry[i] = o.vry ?? 0;
    vrz[i] = o.vrz ?? 0;
    sx[i] = o.sx ?? 0.18;
    sy[i] = o.sy ?? 0.18;
    sz[i] = o.sz ?? 0.18;
    cr[i] = o.cr ?? 1;
    cg[i] = o.cg ?? 1;
    cb[i] = o.cb ?? 1;
    age[i] = 0;
    life[i] = Math.max(0.06, o.life ?? 0.8);
    delay[i] = o.delay ?? 0;
    grav[i] = o.gravity ?? 14.0;
    drag[i] = o.drag ?? 0.8;
    flutter[i] = o.flutter ?? 0;
    bounce[i] = o.bounce ?? 0.35;
    groundY[i] = o.groundY ?? -999;
  }

  function update(dt) {
    if (ctx?.scene && mesh.parent !== ctx.scene) {
      ctx.scene.add(mesh);
    }
    if (active === 0) {
      mesh.count = 0;
      mesh.visible = false;
      return;
    }

    const matArr = mesh.instanceMatrix.array;
    const colArr = mesh.instanceColor.array;

    let i = 0;
    while (i < active) {
      if (delay[i] > 0) {
        delay[i] -= dt;
        const mOff = i * 16;
        matArr[mOff] = 0; matArr[mOff + 5] = 0; matArr[mOff + 10] = 0; matArr[mOff + 15] = 1;
        i++;
        continue;
      }

      age[i] += dt;
      if (age[i] >= life[i]) {
        active--;
        if (i < active) copySlot(i, active);
        continue;
      }

      const damp = Math.max(0, 1 - drag[i] * dt);
      vx[i] *= damp;
      vz[i] *= damp;
      vy[i] = vy[i] * damp - grav[i] * dt;

      if (flutter[i] > 0) {
        const ph = age[i] * 7.2 + rx[i];
        vx[i] += Math.sin(ph) * flutter[i] * dt;
        vz[i] += Math.cos(ph * 0.87) * flutter[i] * dt;
      }

      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      if (py[i] < groundY[i]) {
        py[i] = groundY[i];
        if (vy[i] < 0) {
          vy[i] = -vy[i] * bounce[i];
          vx[i] *= 0.72;
          vz[i] *= 0.72;
          vrx[i] *= 0.6;
          vrz[i] *= 0.6;
        }
      }

      rx[i] += vrx[i] * dt;
      ry[i] += vry[i] * dt;
      rz[i] += vrz[i] * dt;

      const t = age[i] / life[i];
      const shrinkMul = t > 0.7 ? Math.max(0.02, 1 - (t - 0.7) / 0.3) : 1.0;
      const csx = sx[i] * shrinkMul;
      const csy = sy[i] * shrinkMul;
      const csz = sz[i] * shrinkMul;

      // Direct inline XYZ Euler -> 3x3 scaled rotation matrix (zero Object3D allocations!)
      const ax = rx[i], ay = ry[i], az = rz[i];
      const cx = Math.cos(ax), snx = Math.sin(ax);
      const cy = Math.cos(ay), sny = Math.sin(ay);
      const cz = Math.cos(az), snz = Math.sin(az);

      const mOff = i * 16;
      matArr[mOff] = cy * cz * csx;
      matArr[mOff + 1] = (snx * sny * cz + cx * snz) * csx;
      matArr[mOff + 2] = (-cx * sny * cz + snx * snz) * csx;
      matArr[mOff + 3] = 0;

      matArr[mOff + 4] = -cy * snz * csy;
      matArr[mOff + 5] = (-snx * sny * snz + cx * cz) * csy;
      matArr[mOff + 6] = (cx * sny * snz + snx * cz) * csy;
      matArr[mOff + 7] = 0;

      matArr[mOff + 8] = sny * csz;
      matArr[mOff + 9] = -snx * cy * csz;
      matArr[mOff + 10] = cx * cy * csz;
      matArr[mOff + 11] = 0;

      matArr[mOff + 12] = px[i];
      matArr[mOff + 13] = py[i];
      matArr[mOff + 14] = pz[i];
      matArr[mOff + 15] = 1;

      const cOff = i * 3;
      colArr[cOff] = cr[i];
      colArr[cOff + 1] = cg[i];
      colArr[cOff + 2] = cb[i];

      i++;
    }

    mesh.count = active;
    mesh.visible = active > 0;
    if (active > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function clear() {
    active = 0;
    mesh.count = 0;
    mesh.visible = false;
  }

  return { mesh, spawn, update, clear, liveCount: () => active };
}

function createScreenOverlays() {
  if (typeof document === 'undefined') {
    return { flash() {}, splat() {}, update() {}, clear() {} };
  }
  let root = document.getElementById('fx-screen-overlay');
  if (!root) {
    root = document.createElement('div');
    root.id = 'fx-screen-overlay';
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText =
      'position:fixed;left:0;top:0;right:0;bottom:0;inset:0;pointer-events:none;z-index:900;overflow:hidden;';

    const flashEl = document.createElement('div');
    flashEl.id = 'fx-flash-el';
    flashEl.style.cssText =
      'position:absolute;left:0;top:0;right:0;bottom:0;inset:0;opacity:0;pointer-events:none;will-change:opacity;';

    const splatEl = document.createElement('canvas');
    splatEl.id = 'fx-splat-el';
    splatEl.width = 256;
    splatEl.height = 256;
    splatEl.style.cssText =
      'position:absolute;left:50%;top:50%;width:min(62vmin,360px);height:min(62vmin,360px);' +
      'transform:translate(-50%,-50%) scale(0.5);opacity:0;pointer-events:none;image-rendering:pixelated;';

    // Pre-paint cute blocky snowball splat once at boot (0 per-effect allocation!)
    const sg = splatEl.getContext('2d');
    if (sg) {
      const blobs = [
        [128, 128, 56], [88, 102, 34], [170, 96, 32], [176, 152, 36],
        [92, 162, 34], [128, 68, 24], [62, 134, 22], [196, 124, 20],
        [136, 192, 24], [70, 74, 14], [192, 72, 14], [68, 190, 14],
      ];
      const ps = 8;
      for (let y = 0; y < 256; y += ps) {
        for (let x = 0; x < 256; x += ps) {
          let hit = 0;
          for (let b = 0; b < blobs.length; b++) {
            const dx = x + 4 - blobs[b][0];
            const dy = y + 4 - blobs[b][1];
            const r = blobs[b][2];
            if (dx * dx + dy * dy <= r * r) {
              hit = dx * dx + dy * dy <= (r * 0.72) * (r * 0.72) ? 2 : 1;
              break;
            }
          }
          if (hit > 0) {
            sg.fillStyle = hit === 2 ? '#f8fcff' : '#cfe8ff';
            sg.fillRect(x, y, ps, ps);
          }
        }
      }
    }

    root.appendChild(flashEl);
    root.appendChild(splatEl);
    document.body.appendChild(root);
  }

  const flashEl = root.querySelector('#fx-flash-el');
  const splatEl = root.querySelector('#fx-splat-el');
  let flashAge = 0;
  let flashDur = 0;
  let splatAge = 0;
  let splatDur = 0;

  function flash(color = '#ffffff', seconds = 0.25) {
    flashDur = Math.max(0.05, Number(seconds) || 0.25);
    flashAge = 0;
    if (flashEl) {
      flashEl.style.background = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : String(color || '#ffffff');
      flashEl.style.opacity = '0.85';
    }
  }

  function splat() {
    splatDur = 0.95;
    splatAge = 0;
    if (splatEl) {
      splatEl.style.opacity = '0.92';
      splatEl.style.transform = 'translate(-50%,-50%) scale(1.0)';
    }
  }

  function update(dt) {
    if (flashDur > 0) {
      flashAge += dt;
      if (flashAge >= flashDur) {
        flashDur = 0;
        if (flashEl) flashEl.style.opacity = '0';
      } else if (flashEl) {
        flashEl.style.opacity = ((1 - flashAge / flashDur) * 0.85).toFixed(3);
      }
    }
    if (splatDur > 0) {
      splatAge += dt;
      if (splatAge >= splatDur) {
        splatDur = 0;
        if (splatEl) splatEl.style.opacity = '0';
      } else if (splatEl) {
        const t = splatAge / splatDur;
        const slideY = t > 0.35 ? (t - 0.35) * 42 : 0;
        const sc = t < 0.08 ? 0.65 + (t / 0.08) * 0.4 : 1.05;
        const op = t < 0.5 ? 0.92 : (1 - (t - 0.5) / 0.5) * 0.92;
        splatEl.style.opacity = op.toFixed(3);
        splatEl.style.transform = `translate(-50%, calc(-50% + ${slideY.toFixed(1)}px)) scale(${sc.toFixed(2)})`;
      }
    }
  }

  function clear() {
    flashDur = 0;
    splatDur = 0;
    if (flashEl) flashEl.style.opacity = '0';
    if (splatEl) splatEl.style.opacity = '0';
  }

  return { flash, splat, update, clear };
}

export function createFx(ctx) {
  let trackedSeed = ctx?.state?.seed ?? 12345;
  let rand = makeMulberry32((trackedSeed ^ 0x9e3779b9) >>> 0);
  let lastSimFrame = -1;

  function reseed(seedVal) {
    trackedSeed = seedVal ?? 12345;
    rand = makeMulberry32((trackedSeed ^ 0x9e3779b9) >>> 0);
  }

  function syncSeed() {
    const s = ctx?.state?.seed;
    if (s !== undefined && s !== trackedSeed) {
      reseed(s);
    }
  }

  const randProxy = () => {
    syncSeed();
    return rand();
  };

  function ensureStats() {
    const s = ctx?.state;
    if (!s) return null;
    if (!s.stats) {
      s.stats = { particles: 0, sounds: 0, shakes: 0, confetti: 0, fireworks: 0 };
    }
    return s.stats;
  }

  function addParticleCount(n) {
    const stats = ensureStats();
    if (stats) stats.particles = (stats.particles || 0) + n;
  }

  const cubePool = createCubePool(ctx, randProxy);
  const spritePool = createPopups(ctx, randProxy);
  const ringPool = createRings(ctx);
  const shaker = createShake(ctx);
  const confettiEmitter = createConfetti(ctx, cubePool, randProxy);
  const fireworksEmitter = createFireworks(ctx, cubePool, spritePool, randProxy);
  const overlays = createScreenOverlays();

  function resolveColor(blockIdOrColor) {
    if (blockIdOrColor instanceof THREE.Color) {
      return _tmpCol.copy(blockIdOrColor);
    }
    if (
      typeof blockIdOrColor === 'number' &&
      Number.isInteger(blockIdOrColor) &&
      blockIdOrColor >= 0 &&
      blockIdOrColor <= 128
    ) {
      const wc = ctx?.world?.blockColor?.(blockIdOrColor);
      if (wc) {
        if (wc instanceof THREE.Color) return _tmpCol.copy(wc);
        return _tmpCol.set(wc);
      }
      return _tmpCol.setHex(FALLBACK_BLOCK_COLORS[blockIdOrColor % FALLBACK_BLOCK_COLORS.length]);
    }
    if (blockIdOrColor !== undefined && blockIdOrColor !== null) {
      return _tmpCol.set(blockIdOrColor);
    }
    return _tmpCol.setHex(0x6abe30);
  }

  function resolvePos(pos, dy = 0.5) {
    if (pos && typeof pos === 'object') {
      return {
        x: Number(pos.x ?? pos[0] ?? 48),
        y: Number(pos.y ?? pos[1] ?? 8) + dy,
        z: Number(pos.z ?? pos[2] ?? 48),
      };
    }
    const p = ctx?.player || ctx?.state?.player;
    return { x: p?.x ?? 48, y: (p?.y ?? 8) + dy, z: p?.z ?? 48 };
  }

  function burst(pos, blockIdOrColor, n = 12) {
    const count = Math.max(1, Math.min(200, Math.floor(Number(n) || 12)));
    const p = resolvePos(pos, 0.45);
    const col = resolveColor(blockIdOrColor);
    const gy = typeof ctx?.world?.surfaceY === 'function'
      ? ctx.world.surfaceY(Math.floor(p.x), Math.floor(p.z)) + 0.08
      : p.y - 0.4;

    for (let i = 0; i < count; i++) {
      const ang = randProxy() * Math.PI * 2;
      const spd = 1.4 + randProxy() * 4.2;
      const size = 0.13 + randProxy() * 0.11;
      const shadeJit = 0.88 + randProxy() * 0.24;
      cubePool.spawn({
        x: p.x + (randProxy() - 0.5) * 0.65,
        y: p.y + (randProxy() - 0.5) * 0.55,
        z: p.z + (randProxy() - 0.5) * 0.65,
        vx: Math.cos(ang) * spd,
        vy: 2.4 + randProxy() * 4.4,
        vz: Math.sin(ang) * spd,
        sx: size,
        sy: size,
        sz: size,
        rx: randProxy() * 6.28,
        ry: randProxy() * 6.28,
        rz: randProxy() * 6.28,
        vrx: (randProxy() - 0.5) * 14,
        vry: (randProxy() - 0.5) * 14,
        vrz: (randProxy() - 0.5) * 14,
        cr: Math.min(1, col.r * shadeJit),
        cg: Math.min(1, col.g * shadeJit),
        cb: Math.min(1, col.b * shadeJit),
        life: 0.55 + randProxy() * 0.45,
        gravity: 16.5,
        drag: 0.9,
        bounce: 0.36,
        groundY: Number.isFinite(gy) ? gy : -999,
      });
    }
    addParticleCount(count);
    return count;
  }

  // Per-frame spawn tracking so direct calls (e.g. main.js triggerTierReactions)
  // + event emissions ('rank') in the same frame never double-spawn.
  const frameTally = { frame: -999, confetti: 0, fireworks: 0, sparkles: 0, hearts: 0 };
  function syncFrameTally() {
    const f = ctx?.frame ?? ctx?.state?.frame ?? -1;
    if (f !== frameTally.frame) {
      frameTally.frame = f;
      frameTally.confetti = 0;
      frameTally.fireworks = 0;
      frameTally.sparkles = 0;
      frameTally.hearts = 0;
    }
    return frameTally;
  }

  function sparkles(pos, n = 10, opts = {}) {
    const count = spritePool.sparkles(pos, n, opts);
    syncFrameTally().sparkles += count;
    addParticleCount(count);
    return count;
  }

  function confetti(posOrScreen = 'screen', n = 80) {
    const count = confettiEmitter.spawn(posOrScreen, n);
    syncFrameTally().confetti += count;
    const stats = ensureStats();
    if (stats) {
      stats.confetti = (stats.confetti || 0) + count;
      stats.particles = (stats.particles || 0) + count;
    }
    return count;
  }

  function fireworks(pos, n = 3) {
    const res = fireworksEmitter.spawn(pos, n);
    syncFrameTally().fireworks += res.rockets;
    const stats = ensureStats();
    if (stats) {
      stats.fireworks = (stats.fireworks || 0) + res.rockets;
      stats.particles = (stats.particles || 0) + res.particles;
    }
    return res.rockets;
  }

  function hearts(pos, n = 8) {
    const count = spritePool.hearts(pos, n);
    syncFrameTally().hearts += count;
    addParticleCount(count);
    return count;
  }

  function ring(pos, color = 0xffffff, opts = {}) {
    ringPool.ring(pos, color, opts);
    addParticleCount(1);
  }

  function wobble(pos) {
    ringPool.wobble(pos);
    addParticleCount(1);
  }

  function popup(pos, icon = '✨') {
    spritePool.popup(pos, icon);
    addParticleCount(1);
  }

  function shake(intensity = 0.5, seconds = 0.4) {
    shaker.trigger(intensity, seconds);
  }

  function flash(color = '#ffffff', seconds = 0.25) {
    overlays.flash(color, seconds);
  }

  function splat() {
    overlays.splat();
    ctx?.audio?.play?.('snow_hit');
  }

  // Footstep dust tracker (deterministic on player displacement)
  let lastFootX = NaN;
  let lastFootZ = NaN;
  let stepDistAcc = 0;

  function updateFootsteps() {
    if (ctx?.state?.scene && ctx.state.scene !== 'world') return;
    const pl = ctx?.player || ctx?.state?.player;
    if (!pl || !Number.isFinite(pl.x) || !Number.isFinite(pl.z)) return;
    if (!Number.isFinite(lastFootX)) {
      lastFootX = pl.x;
      lastFootZ = pl.z;
      return;
    }
    const dx = pl.x - lastFootX;
    const dz = pl.z - lastFootZ;
    lastFootX = pl.x;
    lastFootZ = pl.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1e-6 || d2 > 9) return; // Ignore teleports (> 3 blocks/step)
    stepDistAcc += Math.sqrt(d2);
    if (stepDistAcc >= 1.45) {
      stepDistAcc -= 1.45;
      const py = pl.y ?? 8;
      // 2 soft footstep dust puffs
      for (let k = 0; k < 2; k++) {
        cubePool.spawn({
          x: pl.x + (randProxy() - 0.5) * 0.35,
          y: py + 0.08,
          z: pl.z + (randProxy() - 0.5) * 0.35,
          vx: (randProxy() - 0.5) * 0.8,
          vy: 0.6 + randProxy() * 0.6,
          vz: (randProxy() - 0.5) * 0.8,
          sx: 0.11,
          sy: 0.08,
          sz: 0.11,
          cr: 0.9,
          cg: 0.92,
          cb: 0.88,
          life: 0.28,
          gravity: 1.5,
          drag: 3.0,
          bounce: 0,
          groundY: -999,
        });
      }
      addParticleCount(2);
      const area = ctx?.state?.area || 'hub';
      let stepSfx = 'step_grass';
      if (area !== 'hub') stepSfx = 'step_stone';
      else if (pl.z < 24 && pl.x >= 34 && pl.x <= 62) stepSfx = 'step_snow';
      else if (Math.abs(pl.x - 48) <= 9 && Math.abs(pl.z - 48) <= 9) stepSfx = 'step_stone';
      ctx?.audio?.play?.(stepSfx, { vol: 0.22, pitch: 0.92 + randProxy() * 0.16 });
    }
  }

  function update(dt = 1 / 60) {
    const curFrame = ctx?.frame ?? ctx?.state?.frame;
    if (typeof curFrame === 'number') {
      if (curFrame < lastSimFrame) {
        clear();
      }
      lastSimFrame = curFrame;
    }
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 1 / 60));
    updateFootsteps();
    cubePool.update(safeDt);
    spritePool.update(safeDt);
    ringPool.update(safeDt);
    shaker.update(safeDt, true);
    overlays.update(safeDt);
  }

  function clear() {
    reseed(ctx?.state?.seed ?? 12345);
    cubePool.clear();
    spritePool.clear();
    ringPool.clear();
    shaker.reset();
    overlays.clear();
    lastFootX = NaN;
    lastFootZ = NaN;
    stepDistAcc = 0;
    frameTally.frame = -999;
    frameTally.confetti = 0;
    frameTally.fireworks = 0;
    frameTally.sparkles = 0;
    frameTally.hearts = 0;
    lastSimFrame = -1;
  }

  // Automatic §3.2 event bus juice wiring

  const ev = ctx?.events;
  if (ev && typeof ev.on === 'function') {
    ev.on('feedback', (p) => {
      const k = p?.kind;
      const pos = p?.pos;
      if (k === 'walk') {
        ring(pos, 0xffffff);
        ctx?.audio?.play?.('tap', { vol: 0.45, pitch: 1.05, pos });
      } else if (k === 'interact') {
        ring(pos, 0xffdd33, { s0: 0.3, s1: 1.4, life: 0.42 });
        sparkles(pos, 6);
        ctx?.audio?.play?.('tap', { vol: 0.65, pitch: 1.25, pos });
      } else if (k === 'blocked') {
        wobble(pos);
        ctx?.audio?.play?.('blocked', { pos });
      } else if (k === 'collect') {
        ring(pos, 0x7cff3a);
        sparkles(pos, 10, { toPlayer: true });
        ctx?.audio?.play?.('pickup', { pos });
      }
    });

    ev.on('blockHit', (p) => {
      burst(p?.pos, p?.blockId, 5);
      ctx?.audio?.play?.('hit_stone', { pos: p?.pos, pitch: 0.92 + (p?.stage || 0) * 0.1 });
    });

    ev.on('blockBreak', (p) => {
      burst(p?.pos, p?.blockId, 14);
      ctx?.audio?.play?.('break', { pos: p?.pos });
    });

    ev.on('blockPlace', (p) => {
      burst(p?.pos, p?.blockId, 6);
      ring(p?.pos, 0xffffff, { s0: 0.45, s1: 1.1, life: 0.24 });
      ctx?.audio?.play?.('hit_wood', { pos: p?.pos, pitch: 1.12 });
    });

    ev.on('collect', (p) => {
      sparkles(p?.pos, 12, { toPlayer: true });
      ctx?.audio?.play?.('xp', { pos: p?.pos });
    });

    ev.on('questStart', () => {
      ctx?.audio?.play?.('pop', { pitch: 1.12 });
    });

    ev.on('questStep', () => {
      sparkles(null, 8);
      ctx?.audio?.play?.('xp', { vol: 0.55 });
    });

    ev.on('questComplete', (p) => {
      // Gate F13: >= 60 particles + >= 1 sfx within 0.5 s of questComplete!
      const pos = p?.pos || ctx?.player;
      confetti(pos, 48);
      sparkles(pos, 18, { toPlayer: true });
      hearts(pos, 12);
      ctx?.audio?.play?.('fanfare');
      ctx?.audio?.play?.('cheer', { vol: 0.55 });
    });

    ev.on('gag', (p) => {
      const g = p?.gagId;
      const pos = p?.pos;
      switch (g) {
        case 'sheep_eats_bouquet':
          ctx?.audio?.play?.('munch', { pos });
          ctx?.audio?.play?.('sneeze', { pos });
          burst(pos, 0xff9ebb, 16);
          popup(pos, '🌸');
          break;
        case 'kai_bounced':
          ctx?.audio?.play?.('boing', { pos });
          ctx?.audio?.play?.('splash', { pos });
          burst(pos, 0x38d9ff, 18);
          popup(pos, '🫧');
          break;
        case 'slime_pet':
          ctx?.audio?.play?.('boing', { pos, pitch: 1.3 });
          hearts(pos, 8);
          break;
        case 'cat_gift_kai_hat':
          ctx?.audio?.play?.('meow', { pos });
          sparkles(pos, 10);
          break;
        case 'fake_iron':
          ctx?.audio?.play?.('blocked', { pos });
          burst(pos, 0x8b5a2b, 14);
          popup(pos, '💢');
          break;
        case 'kai_hogs_pumpkins':
          ctx?.audio?.play?.('kai_laugh', { pos });
          popup(pos, '😜');
          break;
        case 'snow_head_pop':
          ctx?.audio?.play?.('boing', { pos });
          burst(pos, 0xf77f00, 12);
          popup(pos, '🎃');
          break;
        case 'kai_snowman':
          ctx?.audio?.play?.('snow_hit', { pos });
          ctx?.audio?.play?.('kai_whine', { pos });
          burst(pos, 0xf4f8ff, 20);
          popup(pos, '❄️');
          break;
        case 'creeper_confetti':
          confetti(pos, 90);
          hearts(pos, 14);
          ctx?.audio?.play?.('confetti', { pos });
          break;
        case 'kai_honey':
          ctx?.audio?.play?.('wiggle', { pos });
          ctx?.audio?.play?.('kai_whine', { pos });
          popup(pos, '🍯');
          break;
        case 'kai_steal':
          ctx?.audio?.play?.('vwoop', { pos });
          ctx?.audio?.play?.('kai_laugh', { pos });
          burst(pos, 0xd946ef, 18);
          break;
        case 'kai_cake_face':
          ctx?.audio?.play?.('munch', { pos });
          ctx?.audio?.play?.('boing', { pos });
          popup(pos, '🎂');
          break;
        case 'skeleton_bald':
          ctx?.audio?.play?.('pop', { pos });
          ctx?.audio?.play?.('boing', { pos, pitch: 1.2 });
          popup(pos, '💀');
          break;
        case 'wither_three_hats':
          ctx?.audio?.play?.('pop', { pos });
          sparkles(pos, 12);
          break;
        case 'kai_faint':
          ctx?.audio?.play?.('faint', { pos });
          shake(0.35, 0.3);
          popup(pos, '❓');
          break;
        case 'emerald_eyes':
          ctx?.audio?.play?.('kaching', { pos });
          sparkles(pos, 16);
          popup(pos, '💎');
          break;
        case 'egg_hop':
          ctx?.audio?.play?.('vwoop', { pos, pitch: 1.25 });
          burst(pos, 0xa855f7, 14);
          break;
        case 'pink_dye':
          ctx?.audio?.play?.('pop', { pos });
          ctx?.audio?.play?.('baa', { pos, pitch: 1.15 });
          burst(pos, 0xff8fab, 24);
          hearts(pos, 10);
          break;
        default:
          ctx?.audio?.play?.('pop', { pos });
          sparkles(pos, 8);
          break;
      }
    });

    ev.on('rivalSteal', () => {
      flash('#a855f7', 0.22);
      ctx?.audio?.play?.('vwoop');
      ctx?.audio?.play?.('kai_laugh');
    });

    ev.on('rivalRescued', () => {
      hearts(null, 14);
      sparkles(null, 16);
      ctx?.audio?.play?.('fanfare');
    });

    ev.on('spawnBig', (p) => {
      const pos = p?.pos;
      const k = p?.kind;
      shake(0.6, 0.5);
      ctx?.audio?.play?.('rumble', { pos });
      ctx?.audio?.play?.(k === 'wither' ? 'wither_spawn' : 'golem_spawn', { pos });
      burst(pos, k === 'wither' ? 0x2d2a32 : 0xdcdcdc, 26);
      sparkles(pos, 16);
    });

    ev.on('boothStart', () => {
      hearts(null, 10);
      sparkles(null, 14);
      ctx?.audio?.play?.('cheer', { vol: 0.65 });
    });

    ev.on('accessory', (p) => {
      sparkles(null, 8);
      ctx?.audio?.play?.('pop', { pitch: 1.12 + (p?.slot || 0) * 0.12 });
    });

    ev.on('photo', () => {
      flash('#ffffff', 0.28);
      sparkles(null, 14);
      ctx?.audio?.play?.('shutter');
    });

    ev.on('rank', (p) => {
      const tier = p?.tier;
      const ft = syncFrameTally();
      const alreadyTriggeredByCaller = ft.confetti > 0 || ft.fireworks > 0 || ft.sparkles > 0 || ft.hearts > 0;
      if (tier === 'perfect') {
        // Gate F13 & §8.3: 完美 -> fanfare, confetti >= 150, 3 fireworks
        if (ft.confetti < 165) confetti('screen', 165 - ft.confetti);
        if (ft.fireworks < 3) fireworks(null, 3 - ft.fireworks);
        if (!alreadyTriggeredByCaller) ctx?.audio?.play?.('fanfare');
        ctx?.audio?.play?.('cheer', { vol: 0.65 });
        ctx?.audio?.play?.('confetti');
      } else if (tier === 'gorgeous') {
        if (ft.confetti < 60) confetti('screen', 60 - ft.confetti);
        if (ft.sparkles < 20) sparkles(null, 20 - ft.sparkles);
        if (ft.fireworks < 2) fireworks(null, 2 - ft.fireworks);
        if (!alreadyTriggeredByCaller) ctx?.audio?.play?.('cheer');
        ctx?.audio?.play?.('clap');
      } else if (tier === 'pretty') {
        if (ft.hearts < 16) hearts(null, 16 - ft.hearts);
        if (ft.sparkles < 12) sparkles(null, 12);
        if (!alreadyTriggeredByCaller) ctx?.audio?.play?.('clap');
      } else if (tier === 'okay') {
        popup(null, '🙂');
        if (!alreadyTriggeredByCaller) ctx?.audio?.play?.('aww');
      } else if (tier === 'tryhard') {
        popup(null, '💪');
        if (ft.sparkles < 12) sparkles(null, 12 - ft.sparkles);
        if (!alreadyTriggeredByCaller) ctx?.audio?.play?.('cheer', { pitch: 0.95 });
        ctx?.audio?.play?.('clap');
      }
    });

    ev.on('hiddenFound', (p) => {
      const pos = p?.pos || ctx?.player;
      confetti(pos, 60);
      sparkles(pos, 20, { toPlayer: true });
      hearts(pos, 12);
      ctx?.audio?.play?.('fanfare');
    });

    ev.on('finaleStart', () => {
      confetti('screen', 60);
      ctx?.audio?.play?.('drumroll');
    });

    ev.on('gameComplete', () => {
      confetti('screen', 165);
      fireworks(null, 4);
      ctx?.audio?.play?.('fanfare');
      ctx?.audio?.play?.('cheer');
    });
  }

  return {
    burst,
    sparkles,
    confetti,
    fireworks,
    hearts,
    ring,
    wobble,
    popup,
    shake,
    flash,
    splat,
    update,
    clear,
    shakeOffset: shaker.offset,
    getShakeOffset: () => ({ x: shaker.offset.x, y: shaker.offset.y, z: shaker.offset.z }),
    applyShake: shaker.apply,
    liveCount: () => cubePool.liveCount() + spritePool.liveCount() + ringPool.liveCount(),
    pools: { cubePool, spritePool, ringPool },
  };
}
