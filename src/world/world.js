import * as THREE from '../../vendor/three.module.min.js';
import { B, BLOCK_PROPS, getBlockProps, blockColor } from './blocks.js';
import { createTextures } from './textures.js';
import { WX, WY, WZ, CHUNK_SIZE, createChunkManager } from './chunks.js';
import { buildWorldLayout } from './layout.js';
import { createNav } from './nav.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createPortals } from './portals.js';
import { createBoardWall } from './boardwall.js';

export { B, BLOCK_PROPS, getBlockProps, blockColor };

export function createWorld(ctx = {}) {
  const voxels = new Uint8Array(WX * WY * WZ);
  const initialVoxels = new Uint8Array(WX * WY * WZ);
  const surfaceCache = new Uint8Array(WX * WZ);

  const { poi, landmarks } = buildWorldLayout(voxels);
  initialVoxels.set(voxels);

  function recomputeColumnSurface(bx, bz) {
    const colBase = (bx * WZ + bz) * WY;
    let sy = 0;
    for (let y = WY - 1; y >= 0; y--) {
      const id = voxels[colBase + y];
      if (id !== 0 && BLOCK_PROPS[id]?.solid) {
        sy = y + 1;
        break;
      }
    }
    surfaceCache[bx * WZ + bz] = sy;
  }

  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      recomputeColumnSurface(x, z);
    }
  }

  const textures = createTextures();
  const chunkMgr = createChunkManager(ctx, voxels, textures);
  const sky = createSky(ctx);
  const water = createWater(ctx);
  const portals = createPortals(ctx, poi);
  const boardWall = createBoardWall(ctx);

  let meshesBuilt = false;
  let buildGenStarted = false;
  let currentArea = 'hub';
  const modifiedChunks = new Set();

  function getBlock(x, y, z) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx < 0 || bx >= WX || by < 0 || by >= WY || bz < 0 || bz >= WZ) return 0;
    return voxels[(bx * WZ + bz) * WY + by];
  }

  function surfaceY(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (bx < 0 || bx >= WX || bz < 0 || bz >= WZ) return 0;
    return surfaceCache[bx * WZ + bz];
  }

  function isWalkable(x, y, z) {
    if (z === undefined) {
      // Safe 2-arg fallback (x, z)
      const sy = surfaceY(x, y);
      return sy > 0 && isWalkable(x, sy, y);
    }
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx < 0 || bx >= WX || by < 1 || by >= WY - 1 || bz < 0 || bz >= WZ) return false;
    const colBase = (bx * WZ + bz) * WY;
    const belowId = voxels[colBase + by - 1];
    if (belowId === 0) return false;
    const belowProp = BLOCK_PROPS[belowId];
    if (!belowProp || !belowProp.walkable) return false;

    const feetId = voxels[colBase + by];
    if (feetId !== 0) {
      const fp = BLOCK_PROPS[feetId];
      if (fp && (fp.solid || fp.blocksWalk)) return false;
    }
    const headId = voxels[colBase + by + 1];
    if (headId !== 0) {
      const hp = BLOCK_PROPS[headId];
      if (hp && (hp.solid || hp.blocksWalk)) return false;
    }
    return true;
  }

  function setBlock(x, y, z, id) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (bx < 0 || bx >= WX || by < 0 || by >= WY || bz < 0 || bz >= WZ) return false;
    const vIdx = (bx * WZ + bz) * WY + by;
    const prev = voxels[vIdx];
    const next = id | 0;
    if (prev === next) return false;

    voxels[vIdx] = next;
    recomputeColumnSurface(bx, bz);

    const cx = (bx / CHUNK_SIZE) | 0;
    const cz = (bz / CHUNK_SIZE) | 0;
    modifiedChunks.add(cx * 16 + cz);

    if (meshesBuilt) {
      chunkMgr.onVoxelChanged(bx, by, bz, prev, next);
    }
    return true;
  }

  // Fast 3D Amanatides & Woo Voxel DDA Raycast
  function raycast(origin, dir, maxDist = 64) {
    if (!origin || !dir) return null;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-8) return null;
    const dx = dir.x / len;
    const dy = dir.y / len;
    const dz = dir.z / len;

    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : 1e30;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : 1e30;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : 1e30;

    let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : 1e30;
    let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : 1e30;
    let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : 1e30;

    let t = 0;
    let nx = 0, ny = 1, nz = 0;

    for (let i = 0; i < 256 && t <= maxDist; i++) {
      if (x >= 0 && x < WX && y >= 0 && y < WY && z >= 0 && z < WZ) {
        const id = voxels[(x * WZ + z) * WY + y];
        if (id !== 0 && BLOCK_PROPS[id]?.pickable) {
          return {
            pos: { x, y, z },
            normal: { x: nx, y: ny, z: nz },
            blockId: id,
            distance: t,
            point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
          };
        }
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          t = tMaxX;
          tMaxX += tDeltaX;
          nx = -stepX; ny = 0; nz = 0;
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          t = tMaxY;
          tMaxY += tDeltaY;
          nx = 0; ny = -stepY; nz = 0;
        } else {
          z += stepZ;
          t = tMaxZ;
          tMaxZ += tDeltaZ;
          nx = 0; ny = 0; nz = -stepZ;
        }
      }
    }
    return null;
  }

  const nav = createNav({ isWalkable, surfaceY });

  // End ambient life (#155 W1): 56 floating purple particles (1 InstancedMesh) + 4 wandering endermanMob actors
  const endAmbientGroup = new THREE.Group();
  endAmbientGroup.name = 'endAmbient';
  endAmbientGroup.visible = false;
  if (ctx?.scene) {
    ctx.scene.add(endAmbientGroup);
  }

  const END_MOTE_COUNT = 56;
  const endMoteGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const endMoteMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
    fog: false,
  });
  const endMotes = new THREE.InstancedMesh(endMoteGeo, endMoteMat, END_MOTE_COUNT);
  endMotes.frustumCulled = false;
  endMotes.name = 'endPurpleParticles';
  const endMoteSpecs = [];
  const motePalette = [
    new THREE.Color(0xe879f9),
    new THREE.Color(0xc084fc),
    new THREE.Color(0xa855f7),
    new THREE.Color(0xf5d0fe),
  ];
  let moteSeed = 0x9e3779b9;
  const nextMoteRnd = () => {
    moteSeed = (moteSeed * 1664525 + 1013904223) >>> 0;
    return moteSeed / 4294967296;
  };
  for (let i = 0; i < END_MOTE_COUNT; i++) {
    const ang = nextMoteRnd() * Math.PI * 2;
    const rad = 2.0 + Math.sqrt(nextMoteRnd()) * 15.5;
    endMoteSpecs.push({
      x: 152 + Math.cos(ang) * rad,
      yBase: 8.4 + nextMoteRnd() * 5.2,
      z: 41 + Math.sin(ang) * rad,
      phase: nextMoteRnd() * Math.PI * 2,
      speed: 0.7 + nextMoteRnd() * 0.9,
      scale: 0.75 + nextMoteRnd() * 0.85,
    });
    endMotes.setColorAt(i, motePalette[i % motePalette.length]);
  }
  if (endMotes.instanceColor) endMotes.instanceColor.needsUpdate = true;
  endAmbientGroup.add(endMotes);
  const moteDummy = new THREE.Object3D();

  const END_WANDER_ROUTES = [
    { cx: 148.6, cz: 48.0, rx: 3.1, rz: 2.3, speed: 0.62, phase: 0.0 },
    { cx: 155.8, cz: 45.6, rx: 2.7, rz: 2.9, speed: 0.54, phase: 1.7 },
    { cx: 148.2, cz: 33.8, rx: 2.6, rz: 1.9, speed: 0.66, phase: 3.2 },
    { cx: 156.2, cz: 32.8, rx: 2.4, rz: 2.2, speed: 0.58, phase: 4.8 },
  ];
  let endermenSpawned = false;
  const endermen = [];

  function ensureEndermen() {
    if (endermenSpawned || typeof ctx?.chars?.create !== 'function') return;
    endermenSpawned = true;
    for (let i = 0; i < END_WANDER_ROUTES.length; i++) {
      const r = END_WANDER_ROUTES[i];
      const actor = ctx.chars.create('endermanMob', { id: `end_wander_${i}` });
      if (!actor?.group) continue;
      actor.group.position.set(r.cx + r.rx, 8, r.cz);
      endAmbientGroup.add(actor.group);
      endermen.push({ actor, route: r, lastX: r.cx + r.rx, lastZ: r.cz });
    }
  }

  function updateEndAmbient(simTime, dt) {
    ensureEndermen();
    if (currentArea !== 'end') return;

    for (let i = 0; i < END_MOTE_COUNT; i++) {
      const m = endMoteSpecs[i];
      const t = simTime * m.speed + m.phase;
      const rise = ((t * 0.55) % 3.6);
      moteDummy.position.set(
        m.x + Math.sin(t * 0.9) * 0.45,
        m.yBase + rise,
        m.z + Math.cos(t * 0.85) * 0.45
      );
      moteDummy.rotation.set(t * 0.8, t * 1.1, 0);
      const pulse = m.scale * (0.75 + 0.3 * Math.sin(t * 2.4));
      moteDummy.scale.setScalar(pulse);
      moteDummy.updateMatrix();
      endMotes.setMatrixAt(i, moteDummy.matrix);
    }
    endMotes.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < endermen.length; i++) {
      const e = endermen[i];
      const r = e.route;
      // Walk 3.6s then pause/look-around 1.2s deterministically
      const cyclePeriod = 4.8;
      const rawT = simTime + r.phase * 1.5;
      const cyc = Math.floor(rawT / cyclePeriod);
      const rem = rawT - cyc * cyclePeriod;
      const walkProgress = cyc * 3.6 + Math.min(3.6, rem);
      const ang = walkProgress * r.speed * 0.45 + r.phase;
      let nx = r.cx + Math.cos(ang) * r.rx;
      let nz = r.cz + Math.sin(ang * 2.0) * r.rz * 0.65;
      if (!isWalkable(Math.floor(nx), 8, Math.floor(nz))) {
        nx = r.cx;
        nz = r.cz;
      }
      const walking = rem < 3.6;

      e.actor.group.position.set(nx, 8, nz);
      if (walking) {
        const dx = nx - e.lastX;
        const dz = nz - e.lastZ;
        if (dx * dx + dz * dz > 1e-6) {
          e.actor.group.rotation.y = Math.atan2(dx, dz);
        }
        e.actor.setAnim?.('walk');
      } else {
        e.actor.group.rotation.y += Math.sin(simTime * 3.0 + i) * 0.025;
        e.actor.setAnim?.('idle');
      }
      e.lastX = nx;
      e.lastZ = nz;
      e.actor.update?.(dt);
    }
  }

  function setArea(area) {
    currentArea = area === 'end' || area === 'nether' ? area : 'hub';
    chunkMgr.setArea(currentArea);
    sky.setArea(currentArea);
    water.setArea(currentArea);
    portals.setArea(currentArea);
    boardWall.setArea(currentArea);
    endAmbientGroup.visible = currentArea === 'end';
    if (currentArea === 'end') {
      updateEndAmbient(localSimTime, 0);
    }
  }

  function* buildSteps() {
    buildGenStarted = true;
    for (const _ of chunkMgr.buildAllChunksGenerator()) {
      yield;
    }
    meshesBuilt = true;
    setArea(currentArea);
  }

  function ensureBuilt() {
    if (!meshesBuilt) {
      chunkMgr.buildAllSync();
      meshesBuilt = true;
      setArea(currentArea);
    }
  }

  function reset() {
    voxels.set(initialVoxels);
    for (let x = 0; x < WX; x++) {
      for (let z = 0; z < WZ; z++) {
        recomputeColumnSurface(x, z);
      }
    }
    if (meshesBuilt) {
      for (const code of modifiedChunks) {
        const cx = (code / 16) | 0;
        const cz = code % 16;
        chunkMgr.rebuildChunk(cx, cz, true);
      }
    }
    modifiedChunks.clear();
    boardWall.clear();
    setArea('hub');
  }

  const cutawayUniforms = chunkMgr.cutawayUniforms;

  function setCutaway(camPos, headPos, radius = 2.2, minY) {
    cutawayUniforms.managed = true;
    if (!camPos || !headPos || !(radius > 0)) {
      cutawayUniforms.uCutR.value = 0.0;
      return;
    }
    cutawayUniforms.uCutA.value.set(camPos.x, camPos.y, camPos.z);
    cutawayUniforms.uCutB.value.set(headPos.x, headPos.y, headPos.z);
    cutawayUniforms.uCutR.value = radius;
    cutawayUniforms.uCutMinY.value = typeof minY === 'number' ? minY : -9999.0;
  }

  let localSimTime = 0;
  function update(dt = 1 / 60) {
    if (!buildGenStarted && !meshesBuilt) {
      ensureBuilt();
    }
    if (!cutawayUniforms.managed && ctx?.camera && ctx?.state) {
      const active = ctx.state.scene === 'world' && ctx.cam?.mode !== 'focus' && ctx.state.player;
      if (active) {
        const p = ctx.state.player;
        const py = p.y ?? 8;
        cutawayUniforms.uCutA.value.copy(ctx.camera.position);
        cutawayUniforms.uCutB.value.set(p.x ?? 48, py + 1.25, p.z ?? 66);
        cutawayUniforms.uCutR.value = 2.2;
        cutawayUniforms.uCutMinY.value = py + 0.6;
      } else {
        cutawayUniforms.uCutR.value = 0.0;
      }
    }
    localSimTime = typeof ctx?.time === 'number' ? ctx.time : localSimTime + dt;
    sky.update(dt);
    water.update(dt);
    portals.update(dt);
    textures.update(localSimTime);
    updateEndAmbient(localSimTime, dt);
  }

  return {
    B,
    poi,
    landmarks,
    portals,
    boardWall,
    atlas: textures.atlas,
    materials: { solid: chunkMgr.solidMat, trans: chunkMgr.transMat },
    cutawayUniforms,
    uniforms: cutawayUniforms,
    setCutaway,
    blockColor,
    getBlockProps,
    getBlock,
    setBlock,
    raycast,
    surfaceY,
    isWalkable,
    findPath: nav.findPath,
    nearestWalkable: nav.nearestWalkable,
    setArea,
    update,
    buildSteps,
    ensureBuilt,
    reset,
  };
}

export default createWorld;
