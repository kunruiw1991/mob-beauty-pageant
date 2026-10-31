// Fireworks launcher & spherical chrysanthemum shell bursts per docs/DESIGN.md §3.8, §8.3, §9 (owner: fx-audio).
import * as THREE from '../../vendor/three.module.min.js';

const SHELL_PALETTES = Object.freeze([
  [0xff4da6, 0xffe066, 0xffffff], // magenta-gold-white
  [0x38d9ff, 0xa855f7, 0xe0f2fe], // cyan-violet-ice
  [0xff922b, 0xffec99, 0xff4d6d], // sunburst-coral
  [0x51cf66, 0xffe066, 0x66d9e8], // emerald-gold-aqua
  [0xc43bd8, 0xf2c318, 0xff85c0], // pageant crown palette
]);

const _col = new THREE.Color();
const _proj = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export function createFireworks(ctx, cubePool, spritePool, rand) {
  function clampApexIntoFrustum(x, apexY, z, minY) {
    const cam = ctx?.camera;
    if (!cam || typeof cam.updateMatrixWorld !== 'function') return apexY;
    cam.updateMatrixWorld();
    _proj.set(x, apexY, z).project(cam);
    if (_proj.z > 1 || _proj.y <= 0.74) return apexY;
    // Binary search downward to keep burst cleanly inside upper-third of viewport (ndcY <= 0.65)
    let lo = minY;
    let hi = apexY;
    for (let it = 0; it < 7; it++) {
      const mid = 0.5 * (lo + hi);
      _proj.set(x, mid, z).project(cam);
      if (_proj.y > 0.65) hi = mid;
      else lo = mid;
    }
    return Math.max(minY, lo);
  }

  function spawn(pos, n = 3) {
    if (typeof pos === 'number') {
      n = pos;
      pos = null;
    }
    const rawN = Math.max(1, Math.floor(Number(n) || 3));
    const rockets = rawN <= 12 ? rawN : Math.min(8, Math.max(2, Math.round(rawN / 28)));
    const sparksPerShell = rawN <= 12 ? 42 : Math.max(24, Math.min(54, Math.ceil(rawN / rockets)));

    const hasExplicitPos = Boolean(pos && typeof pos === 'object');
    let camAnchor = null;
    if (!hasExplicitPos && ctx?.camera) {
      const cam = ctx.camera;
      cam.getWorldDirection(_fwd);
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, -0.2, -1).normalize();
      _right.crossVectors(_fwd, _worldUp);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      else _right.normalize();
      _up.crossVectors(_right, _fwd).normalize();
      camAnchor = {
        cx: cam.position.x + _fwd.x * 13.5 + _up.x * 2.1,
        cy: cam.position.y + _fwd.y * 13.5 + _up.y * 2.1,
        cz: cam.position.z + _fwd.z * 13.5 + _up.z * 2.1,
      };
    }

    let totalParticles = 0;

    for (let r = 0; r < rockets; r++) {
      const lane = rockets === 1 ? 0 : (r / (rockets - 1) - 0.5) * 2; // -1 .. +1
      let lx = 48;
      let ly = 8.4;
      let lz = 42;
      let apexY = 18.0;

      if (hasExplicitPos) {
        const px = Number(pos.x ?? pos[0] ?? 48);
        const py = Number(pos.y ?? pos[1] ?? 8.5);
        const pz = Number(pos.z ?? pos[2] ?? 42);
        const spreadX = rockets > 1 ? lane * Math.min(8.5, 3.4 + rockets * 1.3) + (rand() - 0.5) * 1.2 : (rand() - 0.5) * 0.8;
        lx = px + spreadX;
        lz = pz + (rand() - 0.5) * 1.8;
        const surfY = typeof ctx?.world?.surfaceY === 'function'
          ? ctx.world.surfaceY(Math.floor(lx), Math.floor(lz))
          : 8;
        const groundY = Number.isFinite(surfY) ? surfY : 8;
        if (py >= groundY + 3.0) {
          // Caller supplied target sky burst altitude (e.g. y=13..14 in main.js)
          ly = groundY + 0.4;
          apexY = clampApexIntoFrustum(lx, py + (rand() - 0.5) * 0.8, lz, groundY + 2.2);
        } else {
          ly = py + 0.4;
          const rawApex = py + 9.5 + (r % 2) * 2.0 + rand() * 1.8;
          apexY = clampApexIntoFrustum(lx, rawApex, lz, py + 3.2);
        }
      } else if (camAnchor) {
        const spread = lane * Math.min(6.5, 2.8 + rockets * 1.1) + (rand() - 0.5) * 1.0;
        lx = camAnchor.cx + _right.x * spread;
        lz = camAnchor.cz + _right.z * spread + (rand() - 0.5) * 1.5;
        const surfY = typeof ctx?.world?.surfaceY === 'function'
          ? ctx.world.surfaceY(Math.floor(lx), Math.floor(lz))
          : 8;
        const groundY = Number.isFinite(surfY) ? surfY : 8;
        ly = groundY + 0.4;
        apexY = Math.max(groundY + 2.6, camAnchor.cy + (r % 2) * 0.9 + (rand() - 0.5) * 0.8);
      }

      const burstHeight = Math.max(2.0, apexY - ly);
      const ascentTime = 0.22 + r * 0.09 + rand() * 0.06;
      const vyRocket = burstHeight / ascentTime + 0.5 * 4.0 * ascentTime;

      const palette = SHELL_PALETTES[(r + Math.floor(rand() * SHELL_PALETTES.length)) % SHELL_PALETTES.length];

      // Ascending glowing rocket core
      cubePool.spawn({
        x: lx,
        y: ly,
        z: lz,
        vx: (rand() - 0.5) * 0.4,
        vy: vyRocket,
        vz: (rand() - 0.5) * 0.4,
        sx: 0.2,
        sy: 0.36,
        sz: 0.2,
        rx: 0,
        ry: 0,
        rz: 0,
        vrx: 0,
        vry: 14,
        vrz: 0,
        cr: 1.0,
        cg: 0.97,
        cb: 0.8,
        life: ascentTime,
        gravity: 4.0,
        drag: 0.08,
        groundY: -999,
      });
      totalParticles += 1;

      // Golden rocket ascent trail sparks
      for (let t = 0; t < 6; t++) {
        const frac = t / 6;
        const td = frac * ascentTime * 0.88;
        const ty = ly + burstHeight * frac * 0.88;
        cubePool.spawn({
          x: lx + (rand() - 0.5) * 0.22,
          y: ty,
          z: lz + (rand() - 0.5) * 0.22,
          vx: (rand() - 0.5) * 1.2,
          vy: -1.6 - rand() * 1.3,
          vz: (rand() - 0.5) * 1.2,
          sx: 0.12,
          sy: 0.12,
          sz: 0.12,
          cr: 1.0,
          cg: 0.85,
          cb: 0.4,
          delay: td,
          life: 0.28 + rand() * 0.14,
          gravity: 5.0,
          drag: 2.2,
          groundY: -999,
        });
        totalParticles += 1;
      }

      // Spherical MC-style chrysanthemum burst at apex
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < sparksPerShell; i++) {
        const yUnit = 1 - (i / Math.max(1, sparksPerShell - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
        const theta = goldenAngle * i + rand() * 0.2;
        const layerSpeed = i % 4 === 0 ? 5.8 + rand() * 1.6 : 9.8 + rand() * 2.8;
        const vx = Math.cos(theta) * rad * layerSpeed;
        const vy = yUnit * layerSpeed + 0.85;
        const vz = Math.sin(theta) * rad * layerSpeed;
        _col.setHex(palette[i % palette.length]);

        const sz = 0.17 + rand() * 0.08;
        cubePool.spawn({
          x: lx,
          y: apexY,
          z: lz,
          vx,
          vy,
          vz,
          sx: sz,
          sy: sz,
          sz: sz,
          rx: rand() * 6.28,
          ry: rand() * 6.28,
          rz: rand() * 6.28,
          vrx: (rand() - 0.5) * 11,
          vry: (rand() - 0.5) * 11,
          vrz: (rand() - 0.5) * 11,
          cr: _col.r,
          cg: _col.g,
          cb: _col.b,
          delay: ascentTime,
          life: 1.05 + rand() * 0.45,
          gravity: 3.4,
          drag: 2.4,
          groundY: -999,
        });
        totalParticles += 1;
      }

      // Twinkling pixel-star sparkles expanding with the firework shell
      if (spritePool) {
        const starCount = 10;
        for (let k = 0; k < starCount; k++) {
          const ang = (k / starCount) * Math.PI * 2 + rand() * 0.35;
          const elev = (rand() - 0.35) * 1.1;
          const spd = 6.8 + rand() * 4.0;
          _col.setHex(palette[k % palette.length]);
          spritePool.spawn({
            x: lx,
            y: apexY,
            z: lz,
            vx: Math.cos(ang) * spd,
            vy: elev * spd + 0.7,
            vz: Math.sin(ang) * spd,
            scale: 0.66 + rand() * 0.25,
            tile: 1,
            cr: _col.r,
            cg: _col.g,
            cb: _col.b,
            delay: ascentTime,
            life: 0.85 + rand() * 0.35,
            gravity: 2.0,
            drag: 2.5,
          });
          totalParticles += 1;
        }
      }
    }

    return { rockets, particles: totalParticles };
  }

  return { spawn };
}
