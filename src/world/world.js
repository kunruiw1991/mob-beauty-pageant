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

  function setArea(area) {
    currentArea = area === 'end' || area === 'nether' ? area : 'hub';
    chunkMgr.setArea(currentArea);
    sky.setArea(currentArea);
    water.setArea(currentArea);
    portals.setArea(currentArea);
    boardWall.setArea(currentArea);
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
