// Ground tap rings, interact pulses & blocked-tap wobbles per docs/DESIGN.md §3.8, §9 (owner: fx-audio).
// Single InstancedMesh (1 draw call), frustumCulled = false.
import * as THREE from '../../vendor/three.module.min.js';

const MAX_RINGS = 64;
const _col = new THREE.Color();

export function createRings(ctx) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tex = null;
  if (canvas) {
    // 2 tiles horizontally: [0] crisp pixel ring, [1] blocked pixel cross-frame
    canvas.width = 128;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 128, 64);

    // Tile 0 (0..64): crisp pixel ring
    const ps = 4;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r >= 5.2 && r <= 7.3) {
          g.fillStyle = r <= 6.4 ? '#ffffff' : 'rgba(255,255,255,0.75)';
          g.fillRect(x * ps, y * ps, ps, ps);
        }
      }
    }

    // Tile 1 (64..128): blocked square + X marker
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        const border = x === 2 || x === 13 || y === 2 || y === 13;
        const diag = Math.abs(x - y) <= 1 || Math.abs(x + y - 15) <= 1;
        if (border || (diag && x >= 4 && x <= 11 && y >= 4 && y <= 11)) {
          g.fillStyle = '#ffffff';
          g.fillRect(64 + x * ps, y * ps, ps, ps);
        }
      }
    }

    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
  }

  const geom = new THREE.PlaneGeometry(1, 1);
  geom.rotateX(-Math.PI / 2);
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, 1 - uv.getY(i));
  }

  const tileData = new Float32Array(MAX_RINGS * 2); // uOffset (0 or 0.5), alpha
  const tileAttr = new THREE.InstancedBufferAttribute(tileData, 2);
  tileAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('aRingTile', tileAttr);

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
        '#include <common>\nattribute vec2 aRingTile;\nvarying float vRingAlpha;'
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv.x = vMapUv.x * 0.5 + aRingTile.x;
        #endif
        vRingAlpha = aRingTile.y;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vRingAlpha;'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.a *= vRingAlpha;`
      );
  };

  const mesh = new THREE.InstancedMesh(geom, mat, MAX_RINGS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.count = 0;
  mesh.visible = false;
  if (ctx?.scene) ctx.scene.add(mesh);

  const bx = new Float32Array(MAX_RINGS);
  const by = new Float32Array(MAX_RINGS);
  const bz = new Float32Array(MAX_RINGS);
  const cr = new Float32Array(MAX_RINGS);
  const cg = new Float32Array(MAX_RINGS);
  const cb = new Float32Array(MAX_RINGS);
  const age = new Float32Array(MAX_RINGS);
  const life = new Float32Array(MAX_RINGS);
  const s0 = new Float32Array(MAX_RINGS);
  const s1 = new Float32Array(MAX_RINGS);
  const kind = new Uint8Array(MAX_RINGS); // 0 = expand ring, 1 = blocked wobble
  let active = 0;

  function copySlot(d, s) {
    bx[d] = bx[s]; by[d] = by[s]; bz[d] = bz[s];
    cr[d] = cr[s]; cg[d] = cg[s]; cb[d] = cb[s];
    age[d] = age[s]; life[d] = life[s];
    s0[d] = s0[s]; s1[d] = s1[s]; kind[d] = kind[s];
  }

  function resolveGroundPos(pos) {
    let x = 48, y = 8, z = 48;
    if (pos && typeof pos === 'object') {
      x = Number(pos.x ?? pos[0] ?? 48);
      z = Number(pos.z ?? pos[2] ?? 48);
      if (pos.y !== undefined || pos[1] !== undefined) {
        y = Number(pos.y ?? pos[1]);
      } else if (typeof ctx?.world?.surfaceY === 'function') {
        y = ctx.world.surfaceY(Math.floor(x), Math.floor(z));
      }
    } else if (ctx?.player) {
      x = ctx.player.x ?? 48;
      y = ctx.player.y ?? 8;
      z = ctx.player.z ?? 48;
    }
    return { x, y: y + 0.04, z };
  }

  function addEntry(o) {
    let i = active;
    if (i >= MAX_RINGS) i = 0;
    else active++;
    bx[i] = o.x; by[i] = o.y; bz[i] = o.z;
    cr[i] = o.cr; cg[i] = o.cg; cb[i] = o.cb;
    age[i] = 0;
    life[i] = o.life;
    s0[i] = o.s0;
    s1[i] = o.s1;
    kind[i] = o.kind;
  }

  function ring(pos, color = 0xffffff, opts = {}) {
    const p = resolveGroundPos(pos);
    _col.set(color ?? 0xffffff);
    addEntry({
      x: p.x,
      y: p.y,
      z: p.z,
      cr: _col.r,
      cg: _col.g,
      cb: _col.b,
      life: opts.life ?? 0.38,
      s0: opts.s0 ?? 0.25,
      s1: opts.s1 ?? 1.25,
      kind: 0,
    });
  }

  function wobble(pos) {
    const p = resolveGroundPos(pos);
    addEntry({
      x: p.x,
      y: p.y + 0.02,
      z: p.z,
      cr: 1.0,
      cg: 0.32,
      cb: 0.28,
      life: 0.42,
      s0: 0.85,
      s1: 0.95,
      kind: 1,
    });
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
      age[i] += dt;
      if (age[i] >= life[i]) {
        active--;
        if (i < active) copySlot(i, active);
        continue;
      }

      const t = age[i] / life[i];
      const mOff = i * 16;
      const cOff = i * 3;
      let x = bx[i];
      let z = bz[i];
      let s = 1;
      let yaw = 0;
      let alpha = 1 - t * t;

      if (kind[i] === 1) {
        // Damped horizontal wobble + twist for blocked tap
        const wob = Math.sin(age[i] * 46.0) * (1 - t);
        x += wob * 0.16;
        yaw = wob * 0.35;
        s = s0[i] + Math.sin(t * Math.PI) * 0.14;
      } else {
        // Ease-out expanding tap ring
        const ease = 1 - (1 - t) * (1 - t);
        s = s0[i] + (s1[i] - s0[i]) * ease;
      }

      const cy = Math.cos(yaw) * s;
      const sy = Math.sin(yaw) * s;
      matArr[mOff] = cy;       matArr[mOff + 1] = 0;    matArr[mOff + 2] = -sy;   matArr[mOff + 3] = 0;
      matArr[mOff + 4] = 0;    matArr[mOff + 5] = s;    matArr[mOff + 6] = 0;     matArr[mOff + 7] = 0;
      matArr[mOff + 8] = sy;   matArr[mOff + 9] = 0;    matArr[mOff + 10] = cy;   matArr[mOff + 11] = 0;
      matArr[mOff + 12] = x;   matArr[mOff + 13] = by[i]; matArr[mOff + 14] = z;  matArr[mOff + 15] = 1;

      colArr[cOff] = cr[i];
      colArr[cOff + 1] = cg[i];
      colArr[cOff + 2] = cb[i];

      tileData[i * 2] = kind[i] === 1 ? 0.5 : 0.0;
      tileData[i * 2 + 1] = alpha;
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

  return { mesh, ring, wobble, update, clear, liveCount: () => active };
}
