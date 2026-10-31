// Confetti emitter per docs/DESIGN.md §3.8, §8.3, §9 (owner: fx-audio).
import * as THREE from '../../vendor/three.module.min.js';

export const CONFETTI_COLORS = Object.freeze([
  0xc43bd8, // perfect purple
  0x3b5bdb, // gorgeous royal blue
  0xf2c318, // pretty gold
  0xd9342b, // vivid red
  0x3fae3a, // emerald green
  0xff66b2, // bubblegum pink
  0x38d9ff, // cyan pop
  0xff922b, // tangerine
]);

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

export function createConfetti(ctx, cubePool, rand) {
  function spawn(posOrScreen = 'screen', n = 80) {
    if (typeof posOrScreen === 'number') {
      n = posOrScreen;
      posOrScreen = 'screen';
    }
    const count = Math.max(1, Math.min(400, Math.floor(Number(n) || 80)));
    const isScreen = !posOrScreen || posOrScreen === 'screen';

    let cx = 48;
    let cy = 11;
    let cz = 54;

    if (isScreen && ctx?.camera) {
      const cam = ctx.camera;
      cam.getWorldDirection(_fwd);
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, -0.3, -1).normalize();
      _right.crossVectors(_fwd, _worldUp);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      else _right.normalize();
      _up.crossVectors(_right, _fwd).normalize();

      const dist = 9.5;
      const baseX = cam.position.x + _fwd.x * dist;
      const baseY = cam.position.y + _fwd.y * dist;
      const baseZ = cam.position.z + _fwd.z * dist;

      for (let i = 0; i < count; i++) {
        const u = (rand() - 0.5) * 13.0;
        const v = 2.2 + rand() * 4.8;
        const d = (rand() - 0.5) * 4.5;
        const px = baseX + _right.x * u + _up.x * v + _fwd.x * d;
        const py = baseY + _right.y * u + _up.y * v + _fwd.y * d;
        const pz = baseZ + _right.z * u + _up.z * v + _fwd.z * d;
        _col.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
        cubePool.spawn({
          x: px,
          y: py,
          z: pz,
          vx: (rand() - 0.5) * 4.5,
          vy: -1.2 - rand() * 2.6,
          vz: (rand() - 0.5) * 4.5,
          sx: 0.19 + rand() * 0.09,
          sy: 0.028,
          sz: 0.11 + rand() * 0.06,
          rx: rand() * 6.28,
          ry: rand() * 6.28,
          rz: rand() * 6.28,
          vrx: (rand() - 0.5) * 14,
          vry: (rand() - 0.5) * 12,
          vrz: (rand() - 0.5) * 14,
          cr: _col.r,
          cg: _col.g,
          cb: _col.b,
          life: 2.0 + rand() * 1.3,
          gravity: 3.4,
          drag: 1.9,
          flutter: 3.2 + rand() * 2.5,
          bounce: 0.15,
          groundY: -999,
        });
      }
    } else {
      if (posOrScreen && typeof posOrScreen === 'object') {
        cx = Number(posOrScreen.x ?? posOrScreen[0] ?? 48);
        cy = Number(posOrScreen.y ?? posOrScreen[1] ?? 9);
        cz = Number(posOrScreen.z ?? posOrScreen[2] ?? 48);
      } else if (ctx?.player) {
        cx = ctx.player.x ?? 48;
        cy = (ctx.player.y ?? 8) + 1.5;
        cz = ctx.player.z ?? 48;
      }
      const gy = typeof ctx?.world?.surfaceY === 'function' ? ctx.world.surfaceY(Math.floor(cx), Math.floor(cz)) : cy - 1.2;
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const spd = 2.0 + rand() * 6.2;
        _col.setHex(CONFETTI_COLORS[(i + Math.floor(rand() * 3)) % CONFETTI_COLORS.length]);
        cubePool.spawn({
          x: cx + (rand() - 0.5) * 0.8,
          y: cy + 0.4 + rand() * 0.8,
          z: cz + (rand() - 0.5) * 0.8,
          vx: Math.cos(ang) * spd,
          vy: 4.8 + rand() * 5.8,
          vz: Math.sin(ang) * spd,
          sx: 0.18 + rand() * 0.08,
          sy: 0.028,
          sz: 0.11 + rand() * 0.05,
          rx: rand() * 6.28,
          ry: rand() * 6.28,
          rz: rand() * 6.28,
          vrx: (rand() - 0.5) * 15,
          vry: (rand() - 0.5) * 12,
          vrz: (rand() - 0.5) * 15,
          cr: _col.r,
          cg: _col.g,
          cb: _col.b,
          life: 1.9 + rand() * 1.2,
          gravity: 6.2,
          drag: 1.8,
          flutter: 3.0 + rand() * 2.4,
          bounce: 0.25,
          groundY: Number.isFinite(gy) ? gy + 0.04 : -999,
        });
      }
    }

    return count;
  }

  return { spawn };
}
