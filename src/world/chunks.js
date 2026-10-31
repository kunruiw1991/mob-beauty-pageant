import * as THREE from '../../vendor/three.module.min.js';
import { B, BLOCK_PROPS } from './blocks.js';

export const WX = 256;
export const WY = 40;
export const WZ = 96;
export const CHUNK_SIZE = 16;
export const CX = WX / CHUNK_SIZE; // 16
export const CZ = WZ / CHUNK_SIZE; // 6

const AO_CURVE = [0.50, 0.68, 0.84, 1.0];
const FACE_SHADE = [0.76, 0.76, 1.0, 0.55, 0.88, 0.84];

// 6 faces: [nx, ny, nz, 4 corners [dx, dy, dz], tangent U [ux,uy,uz], tangent V [vx,vy,vz]]
const FACES = [
  // 0: +X
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: [0, 0, -1], v: [0, 1, 0] },
  // 1: -X
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: [0, 0, 1], v: [0, 1, 0] },
  // 2: +Y
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: [1, 0, 0], v: [0, 0, -1] },
  // 3: -Y
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: [1, 0, 0], v: [0, 0, 1] },
  // 4: +Z
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: [1, 0, 0], v: [0, 1, 0] },
  // 5: -Z
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: [-1, 0, 0], v: [0, 1, 0] },
];

export function chunkArea(cx, cz) {
  if (cx < 6) return 'hub';
  if (cx >= 8 && cx < 11 && cz >= 1 && cz < 4) return 'end';
  if (cx >= 12 && cx < 15 && cz >= 1 && cz < 4) return 'nether';
  return null;
}

const MAX_QUADS = 12288;
const SCRATCH_SOLID = {
  pos: new Float32Array(MAX_QUADS * 12),
  norm: new Float32Array(MAX_QUADS * 12),
  uv: new Float32Array(MAX_QUADS * 8),
  col: new Float32Array(MAX_QUADS * 12),
  idx: new Uint32Array(MAX_QUADS * 6),
};
const SCRATCH_TRANS = {
  pos: new Float32Array(4096 * 12),
  norm: new Float32Array(4096 * 12),
  uv: new Float32Array(4096 * 8),
  col: new Float32Array(4096 * 12),
  idx: new Uint32Array(4096 * 6),
};

class GeomBuilder {
  constructor(scratch) {
    this.s = scratch;
    this.vCount = 0;
    this.iCount = 0;
  }

  reset() {
    this.vCount = 0;
    this.iCount = 0;
  }

  pushQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, u0, v0, u1, v1, c0, c1, c2, c3, flip = false) {
    const base = this.vCount;
    const pOff = base * 3;
    const uvOff = base * 2;
    const iOff = this.iCount;
    const { pos, norm, uv, col, idx } = this.s;

    pos[pOff] = x0; pos[pOff + 1] = y0; pos[pOff + 2] = z0;
    pos[pOff + 3] = x1; pos[pOff + 4] = y1; pos[pOff + 5] = z1;
    pos[pOff + 6] = x2; pos[pOff + 7] = y2; pos[pOff + 8] = z2;
    pos[pOff + 9] = x3; pos[pOff + 10] = y3; pos[pOff + 11] = z3;

    norm[pOff] = nx; norm[pOff + 1] = ny; norm[pOff + 2] = nz;
    norm[pOff + 3] = nx; norm[pOff + 4] = ny; norm[pOff + 5] = nz;
    norm[pOff + 6] = nx; norm[pOff + 7] = ny; norm[pOff + 8] = nz;
    norm[pOff + 9] = nx; norm[pOff + 10] = ny; norm[pOff + 11] = nz;

    uv[uvOff] = u0; uv[uvOff + 1] = v0;
    uv[uvOff + 2] = u1; uv[uvOff + 3] = v0;
    uv[uvOff + 4] = u1; uv[uvOff + 5] = v1;
    uv[uvOff + 6] = u0; uv[uvOff + 7] = v1;

    col[pOff] = c0; col[pOff + 1] = c0; col[pOff + 2] = c0;
    col[pOff + 3] = c1; col[pOff + 4] = c1; col[pOff + 5] = c1;
    col[pOff + 6] = c2; col[pOff + 7] = c2; col[pOff + 8] = c2;
    col[pOff + 9] = c3; col[pOff + 10] = c3; col[pOff + 11] = c3;

    if (flip) {
      idx[iOff] = base + 1; idx[iOff + 1] = base + 2; idx[iOff + 2] = base + 3;
      idx[iOff + 3] = base + 1; idx[iOff + 4] = base + 3; idx[iOff + 5] = base;
    } else {
      idx[iOff] = base; idx[iOff + 1] = base + 1; idx[iOff + 2] = base + 2;
      idx[iOff + 3] = base; idx[iOff + 4] = base + 2; idx[iOff + 5] = base + 3;
    }
    this.vCount = base + 4;
    this.iCount = iOff + 6;
  }

  pushTwoSidedQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, u0, v0, u1, v1, shade) {
    this.pushQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, u0, v0, u1, v1, shade, shade, shade, shade, false);
    this.pushQuad(x1, y1, z1, x0, y0, z0, x3, y3, z3, x2, y2, z2, -nx, -ny, -nz, u1, v0, u0, v1, shade, shade, shade, shade, false);
  }

  toSnapshot() {
    if (this.vCount === 0) return { vCount: 0, iCount: 0, pos: null, norm: null, uv: null, col: null, idx: null };
    return {
      vCount: this.vCount,
      iCount: this.iCount,
      pos: this.s.pos.slice(0, this.vCount * 3),
      norm: this.s.norm.slice(0, this.vCount * 3),
      uv: this.s.uv.slice(0, this.vCount * 2),
      col: this.s.col.slice(0, this.vCount * 3),
      idx: this.s.idx.slice(0, this.iCount),
    };
  }

  toGeometry() {
    if (this.vCount === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.s.pos.slice(0, this.vCount * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.s.norm.slice(0, this.vCount * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.s.uv.slice(0, this.vCount * 2), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(this.s.col.slice(0, this.vCount * 3), 3));
    const idxSlice = this.vCount > 65535
      ? this.s.idx.slice(0, this.iCount)
      : new Uint16Array(this.s.idx.subarray(0, this.iCount));
    geo.setIndex(new THREE.BufferAttribute(idxSlice, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

const solidBuilder = new GeomBuilder(SCRATCH_SOLID);
const transBuilder = new GeomBuilder(SCRATCH_TRANS);

export function createChunkManager(ctx, voxels, textures) {
  const { atlas, uvTable } = textures;

  const groups = {
    hub: new THREE.Group(),
    end: new THREE.Group(),
    nether: new THREE.Group(),
  };
  groups.hub.name = 'chunksHub';
  groups.end.name = 'chunksEnd';
  groups.nether.name = 'chunksNether';
  groups.end.visible = false;
  groups.nether.visible = false;

  if (ctx?.scene) {
    ctx.scene.add(groups.hub, groups.end, groups.nether);
  }

  const cutawayUniforms = {
    uCutA: { value: new THREE.Vector3(0, -1000, 0) },
    uCutB: { value: new THREE.Vector3(0, -1000, 0) },
    uCutR: { value: 0.0 },
    uCutMinY: { value: -9999.0 },
    managed: false,
  };

  function attachCutawayShader(mat, cacheKey) {
    mat.userData.cutawayUniforms = cutawayUniforms;
    mat.userData.uniforms = cutawayUniforms;
    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCutA = cutawayUniforms.uCutA;
      shader.uniforms.uCutB = cutawayUniforms.uCutB;
      shader.uniforms.uCutR = cutawayUniforms.uCutR;
      shader.uniforms.uCutMinY = cutawayUniforms.uCutMinY;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vCutWorldPos;'
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvCutWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying vec3 vCutWorldPos;',
            'uniform vec3 uCutA;',
            'uniform vec3 uCutB;',
            'uniform float uCutR;',
            'uniform float uCutMinY;',
          ].join('\n')
        )
        .replace(
          '#include <clipping_planes_fragment>',
          [
            '#include <clipping_planes_fragment>',
            'if ( uCutR > 0.001 ) {',
            '  float cutFloorY = uCutMinY > -9000.0 ? uCutMinY : ( uCutB.y - 0.65 );',
            '  if ( vCutWorldPos.y > cutFloorY ) {',
            '    vec3 cutAB = uCutB - uCutA;',
            '    float cutLen2 = dot( cutAB, cutAB );',
            '    if ( cutLen2 > 0.0001 ) {',
            '      float cutT = clamp( dot( vCutWorldPos - uCutA, cutAB ) / cutLen2, 0.0, 1.0 );',
            '      vec3 cutClosest = uCutA + cutAB * cutT;',
            '      vec3 cutD = vCutWorldPos - cutClosest;',
            '      if ( dot( cutD, cutD ) < uCutR * uCutR ) {',
            '        discard;',
            '      }',
            '    }',
            '  }',
            '}',
          ].join('\n')
        );
    };
  }

  const solidMat = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: 0.5,
  });
  attachCutawayShader(solidMat, 'voxel-solid-cutaway-v1');

  const transMat = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  attachCutawayShader(transMat, 'voxel-trans-cutaway-v1');

  const chunks = new Array(CX * CZ).fill(null);
  const transMeshes = { hub: null, end: null, nether: null };

  const idxOf = (x, y, z) => ((x * WZ + z) * WY + y);

  function getVoxel(x, y, z) {
    if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return 0;
    return voxels[(x * WZ + z) * WY + y];
  }

  function isAoOccluder(x, y, z) {
    if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return 0;
    const id = voxels[(x * WZ + z) * WY + y];
    if (id === 0) return 0;
    const p = BLOCK_PROPS[id];
    return p && p.solid && !p.transparent ? 1 : 0;
  }

  function buildBox(builder, x0, y0, z0, x1, y1, z1, id, shadeBoost = 1.0) {
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const n = face.n;
      const cr = face.c;
      const uvBase = (id * 6 + f) * 4;
      const s = Math.min(1.15, FACE_SHADE[f] * shadeBoost);
      builder.pushQuad(
        cr[0][0] ? x1 : x0, cr[0][1] ? y1 : y0, cr[0][2] ? z1 : z0,
        cr[1][0] ? x1 : x0, cr[1][1] ? y1 : y0, cr[1][2] ? z1 : z0,
        cr[2][0] ? x1 : x0, cr[2][1] ? y1 : y0, cr[2][2] ? z1 : z0,
        cr[3][0] ? x1 : x0, cr[3][1] ? y1 : y0, cr[3][2] ? z1 : z0,
        n[0], n[1], n[2],
        uvTable[uvBase], uvTable[uvBase + 1], uvTable[uvBase + 2], uvTable[uvBase + 3],
        s, s, s, s, false
      );
    }
  }

  function buildChunkData(cx, cz) {
    const area = chunkArea(cx, cz);
    if (!area) return null;

    solidBuilder.reset();
    transBuilder.reset();
    const solidB = solidBuilder;
    const transB = transBuilder;

    const xStart = cx * CHUNK_SIZE;
    const zStart = cz * CHUNK_SIZE;
    const xEnd = xStart + CHUNK_SIZE;
    const zEnd = zStart + CHUNK_SIZE;

    for (let x = xStart; x < xEnd; x++) {
      for (let z = zStart; z < zEnd; z++) {
        const colBase = (x * WZ + z) * WY;
        for (let y = 0; y < WY; y++) {
          const id = voxels[colBase + y];
          if (id === 0) continue;
          const prop = BLOCK_PROPS[id];
          if (!prop || prop.pass === 'none') continue;

          const shape = prop.shape;
          if (shape === 'cross') {
            const uvBase = (id * 6) * 4;
            const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
            const shade = prop.emissive ? 1.15 : 0.94;
            const pad = id === B.TORCH ? 0.15 : 0.08;
            const yTop = id === B.TORCH ? y + 0.85 : y + 0.95;
            solidB.pushTwoSidedQuad(
              x + pad, y, z + pad,
              x + 1 - pad, y, z + 1 - pad,
              x + 1 - pad, yTop, z + 1 - pad,
              x + pad, yTop, z + pad,
              0.707, 0.2, -0.707, u0, v0, u1, v1, shade
            );
            solidB.pushTwoSidedQuad(
              x + pad, y, z + 1 - pad,
              x + 1 - pad, y, z + pad,
              x + 1 - pad, yTop, z + pad,
              x + pad, yTop, z + 1 - pad,
              0.707, 0.2, 0.707, u0, v0, u1, v1, shade
            );
            continue;
          }

          if (shape === 'bars') {
            const uvBase = (id * 6) * 4;
            const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
            // Orthogonal crossed iron bar panes in center of voxel
            solidB.pushTwoSidedQuad(
              x, y, z + 0.5, x + 1, y, z + 0.5, x + 1, y + 1, z + 0.5, x, y + 1, z + 0.5,
              0, 0, 1, u0, v0, u1, v1, 0.9
            );
            solidB.pushTwoSidedQuad(
              x + 0.5, y, z, x + 0.5, y, z + 1, x + 0.5, y + 1, z + 1, x + 0.5, y + 1, z,
              1, 0, 0, u0, v0, u1, v1, 0.84
            );
            continue;
          }

          if (shape === 'flat') {
            // Lily pad floating slightly above water top
            const uvBase = (id * 6 + 2) * 4;
            const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
            const py = y + 0.03;
            solidB.pushTwoSidedQuad(
              x + 0.05, py, z + 0.95, x + 0.95, py, z + 0.95, x + 0.95, py, z + 0.05, x + 0.05, py, z + 0.05,
              0, 1, 0, u0, v0, u1, v1, 0.95
            );
            continue;
          }

          if (shape === 'vine') {
            const uvBase = (id * 6) * 4;
            const u0 = uvTable[uvBase], v0 = uvTable[uvBase + 1], u1 = uvTable[uvBase + 2], v1 = uvTable[uvBase + 3];
            let placed = false;
            if (isAoOccluder(x, y, z - 1)) {
              solidB.pushTwoSidedQuad(x, y, z + 0.06, x + 1, y, z + 0.06, x + 1, y + 1, z + 0.06, x, y + 1, z + 0.06, 0, 0, 1, u0, v0, u1, v1, 0.88);
              placed = true;
            }
            if (isAoOccluder(x, y, z + 1)) {
              solidB.pushTwoSidedQuad(x + 1, y, z + 0.94, x, y, z + 0.94, x, y + 1, z + 0.94, x + 1, y + 1, z + 0.94, 0, 0, -1, u0, v0, u1, v1, 0.88);
              placed = true;
            }
            if (isAoOccluder(x - 1, y, z)) {
              solidB.pushTwoSidedQuad(x + 0.06, y, z + 1, x + 0.06, y, z, x + 0.06, y + 1, z, x + 0.06, y + 1, z + 1, 1, 0, 0, u0, v0, u1, v1, 0.82);
              placed = true;
            }
            if (isAoOccluder(x + 1, y, z)) {
              solidB.pushTwoSidedQuad(x + 0.94, y, z, x + 0.94, y, z + 1, x + 0.94, y + 1, z + 1, x + 0.94, y + 1, z, -1, 0, 0, u0, v0, u1, v1, 0.82);
              placed = true;
            }
            if (!placed) {
              solidB.pushTwoSidedQuad(x + 0.1, y, z + 0.5, x + 0.9, y, z + 0.5, x + 0.9, y + 1, z + 0.5, x + 0.1, y + 1, z + 0.5, 0, 0, 1, u0, v0, u1, v1, 0.88);
            }
            continue;
          }

          if (shape === 'egg') {
            buildBox(solidB, x + 0.25, y, z + 0.25, x + 0.75, y + 0.15, z + 0.75, id);
            buildBox(solidB, x + 0.15, y + 0.15, z + 0.15, x + 0.85, y + 0.65, z + 0.85, id);
            buildBox(solidB, x + 0.25, y + 0.65, z + 0.25, x + 0.75, y + 0.92, z + 0.75, id);
            continue;
          }

          if (shape === 'cake') {
            buildBox(solidB, x + 0.12, y, z + 0.12, x + 0.88, y + 0.52, z + 0.88, id);
            continue;
          }

          // Standard 1x1x1 cube (opaque, cutout leaves, or transparent pass)
          const isTrans = prop.pass === 'trans';
          const targetB = isTrans ? transB : solidB;
          const topH = prop.topY;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const [nx, ny, nz] = face.n;
            const nid = getVoxel(x + nx, y + ny, z + nz);

            // Hidden-face culling
            if (nid !== 0) {
              const np = BLOCK_PROPS[nid];
              if (np) {
                // Keep y=7 floor cap under trees/walls/props so terrain cutaway (y > player.y + 0.6) never reveals void/ocean below ground
                const keepGroundCap = f === 2 && y === 7 && nid !== id && nid !== B.STONE && nid !== B.DIRT;
                if (!keepGroundCap && !np.transparent && np.shape === 'cube' && np.topY === 1.0) continue;
                if (isTrans && nid === id) continue; // Cull internal water/ice/glass seams
              }
            }

            const uvBase = (id * 6 + f) * 4;
            const u0 = uvTable[uvBase];
            const v0 = uvTable[uvBase + 1];
            const u1 = uvTable[uvBase + 2];
            const v1 = uvTable[uvBase + 3];

            const baseShade = prop.emissive ? 1.12 : FACE_SHADE[f];
            const [ux, uy, uz] = face.u;
            const [vx, vy, vz] = face.v;

            // Compute baked vertex AO for 4 corners
            let c0 = baseShade, c1 = baseShade, c2 = baseShade, c3 = baseShade;
            let ao0 = 3, ao1 = 3, ao2 = 3, ao3 = 3;

            if (!prop.emissive && !isTrans) {
              const fx = x + nx;
              const fy = y + ny;
              const fz = z + nz;

              const calcCornerAo = (su, sv) => {
                const s1 = isAoOccluder(fx + su * ux, fy + su * uy, fz + su * uz);
                const s2 = isAoOccluder(fx + sv * vx, fy + sv * vy, fz + sv * vz);
                if (s1 && s2) return 0;
                const cr = isAoOccluder(fx + su * ux + sv * vx, fy + su * uy + sv * vy, fz + su * uz + sv * vz);
                return 3 - (s1 + s2 + cr);
              };

              // Corners correspond to: 0:(-u,-v), 1:(+u,-v), 2:(+u,+v), 3:(-u,+v)
              ao0 = calcCornerAo(-1, -1);
              ao1 = calcCornerAo(1, -1);
              ao2 = calcCornerAo(1, 1);
              ao3 = calcCornerAo(-1, 1);

              c0 = baseShade * AO_CURVE[ao0];
              c1 = baseShade * AO_CURVE[ao1];
              c2 = baseShade * AO_CURVE[ao2];
              c3 = baseShade * AO_CURVE[ao3];
            }

            const cr = face.c;
            const yScale = (cy) => (cy ? y + topH : y);
            const flip = ao0 + ao2 < ao1 + ao3;

            targetB.pushQuad(
              x + cr[0][0], yScale(cr[0][1]), z + cr[0][2],
              x + cr[1][0], yScale(cr[1][1]), z + cr[1][2],
              x + cr[2][0], yScale(cr[2][1]), z + cr[2][2],
              x + cr[3][0], yScale(cr[3][1]), z + cr[3][2],
              nx, ny, nz,
              u0, v0, u1, v1,
              c0, c1, c2, c3,
              flip
            );
          }
        }
      }
    }

    return {
      area,
      solidGeo: solidB.toGeometry(),
      transSnap: transB.toSnapshot(),
    };
  }

  function rebuildAreaTransMesh(area) {
    const grp = groups[area];
    if (!grp) return;
    const prev = transMeshes[area];
    if (prev) {
      grp.remove(prev);
      prev.geometry.dispose();
      transMeshes[area] = null;
    }

    let totalVerts = 0;
    let totalIdx = 0;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!ch || ch.area !== area || ch.transSnap.vCount === 0) continue;
      totalVerts += ch.transSnap.vCount;
      totalIdx += ch.transSnap.iCount;
    }
    if (totalVerts === 0) return;

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);
    const col = new Float32Array(totalVerts * 3);
    const idx = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

    let vOff = 0;
    let iOff = 0;
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!ch || ch.area !== area || ch.transSnap.vCount === 0) continue;
      const tb = ch.transSnap;
      pos.set(tb.pos, vOff * 3);
      norm.set(tb.norm, vOff * 3);
      uv.set(tb.uv, vOff * 2);
      col.set(tb.col, vOff * 3);
      for (let k = 0; k < tb.iCount; k++) {
        idx[iOff + k] = tb.idx[k] + vOff;
      }
      vOff += tb.vCount;
      iOff += tb.iCount;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, transMat);
    mesh.name = `${area}TransPass`;
    mesh.renderOrder = 2;
    grp.add(mesh);
    transMeshes[area] = mesh;
  }

  function rebuildChunk(cx, cz, updateTrans = true) {
    if (cx < 0 || cx >= CX || cz < 0 || cz >= CZ) return;
    const area = chunkArea(cx, cz);
    if (!area) return;

    const slot = cx * CZ + cz;
    const old = chunks[slot];
    const prevHadTrans = old ? old.transSnap.vCount > 0 : false;
    if (old && old.mesh) {
      groups[area].remove(old.mesh);
      old.mesh.geometry.dispose();
    }

    const built = buildChunkData(cx, cz);
    let mesh = null;
    if (built && built.solidGeo) {
      mesh = new THREE.Mesh(built.solidGeo, solidMat);
      mesh.name = `chunk_${cx}_${cz}`;
      groups[area].add(mesh);
    }

    chunks[slot] = {
      cx,
      cz,
      area,
      mesh,
      transSnap: built ? built.transSnap : { vCount: 0, iCount: 0, pos: null, norm: null, uv: null, col: null, idx: null },
    };

    const nowHasTrans = chunks[slot].transSnap.vCount > 0;
    if (updateTrans && (prevHadTrans || nowHasTrans)) {
      rebuildAreaTransMesh(area);
    }
  }

  function* buildAllChunksGenerator() {
    // Hub (36 slots), End (9 slots), Nether (9 slots) = 54 slots total
    for (let cx = 0; cx < CX; cx++) {
      for (let cz = 0; cz < CZ; cz++) {
        if (!chunkArea(cx, cz)) continue;
        rebuildChunk(cx, cz, false);
        yield;
      }
    }
    rebuildAreaTransMesh('hub');
    yield;
    rebuildAreaTransMesh('end');
    rebuildAreaTransMesh('nether');
    yield;
  }

  function buildAllSync() {
    for (const _ of buildAllChunksGenerator()) {
      // run synchronously if needed
    }
  }

  function onVoxelChanged(x, y, z, prevId, newId) {
    const cx = (x / CHUNK_SIZE) | 0;
    const cz = (z / CHUNK_SIZE) | 0;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const transChanged =
      (BLOCK_PROPS[prevId]?.pass === 'trans') ||
      (BLOCK_PROPS[newId]?.pass === 'trans');

    rebuildChunk(cx, cz, transChanged);

    // If border voxel changed, refresh neighbor chunk so culled faces & vertex AO stay seamless
    if (lx === 0) rebuildChunk(cx - 1, cz, false);
    else if (lx === CHUNK_SIZE - 1) rebuildChunk(cx + 1, cz, false);
    if (lz === 0) rebuildChunk(cx, cz - 1, false);
    else if (lz === CHUNK_SIZE - 1) rebuildChunk(cx, cz + 1, false);
  }

  function setArea(area) {
    groups.hub.visible = area === 'hub';
    groups.end.visible = area === 'end';
    groups.nether.visible = area === 'nether';
  }

  return {
    groups,
    solidMat,
    transMat,
    cutawayUniforms,
    idxOf,
    rebuildChunk,
    buildAllChunksGenerator,
    buildAllSync,
    onVoxelChanged,
    setArea,
  };
}
