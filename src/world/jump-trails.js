import { B } from './blocks.js';
import * as THREE from '../../vendor/three.module.min.js';

// Each two-block-square landing has an approachable first step and a distinct silhouette.
export const trails = [
  { name: 'Honey Steps', block: B.HONEY_BLOCK, color: 0xffbe22, pads: [[51,65,9],[54,65,10],[57,65,11]] },
  { name: 'Frost Switchback', block: B.ICE, color: 0x7edfff, pads: [[37,26,9],[40,24,10],[43,26,9]] },
  { name: 'Marsh Skips', block: B.PRISMARINE, color: 0x6bffad, pads: [[64,69,9],[66,72,9],[69,73,10]] },
];

// 12 sparkling Treetop Crowns perched across Plaza, Meadow, Swamp, Snow & Giant Jungle canopies!
export const TREE_CROWNS = [
  { id: 'plaza_oak', name: 'Plaza Oak', x: 62.5, z: 66.5, color: 0xffd43b },
  { id: 'west_oak', name: 'West Oak', x: 36.5, z: 65.5, color: 0xffa8e2 },
  { id: 'beehive_oak', name: 'Beehive Oak', x: 40.5, z: 80.5, color: 0xffbe22 },
  { id: 'meadow_oak', name: 'Meadow Oak', x: 57.5, z: 78.5, color: 0x70e000 },
  { id: 'swamp_west', name: 'Swamp West', x: 65.5, z: 76.5, color: 0x6bffad },
  { id: 'swamp_north', name: 'Swamp North', x: 77.5, z: 62.5, color: 0x38d9f5 },
  { id: 'frost_pine', name: 'Frost Pine', x: 57.5, z: 22.5, color: 0x7edfff },
  { id: 'snow_peak', name: 'Snow Peak', x: 58.5, z: 12.5, color: 0xe0f2fe },
  { id: 'jungle_king', name: 'Jungle King', x: 27.5, z: 72.5, color: 0xffd43b },
  { id: 'canopy_spire', name: 'Canopy Spire', x: 29.5, z: 75.5, color: 0xc084fc },
  { id: 'vine_tower', name: 'Vine Tower', x: 16.5, z: 76.5, color: 0x4ade80 },
  { id: 'jungle_gate', name: 'Jungle Gate', x: 33.5, z: 63.5, color: 0xfb923c },
];

// 4 bouncy Slime Trampoline Pads placed right beside hero trees for effortless sky-high tree launches!
export const BOUNCE_PADS = [
  { id: 'pad_plaza', name: 'Plaza Bounce', x: 56.5, z: 68.5, targetX: 62.5, targetZ: 66.5 },
  { id: 'pad_west', name: 'West Bounce', x: 39.5, z: 66.5, targetX: 36.5, targetZ: 65.5 },
  { id: 'pad_jungle', name: 'Jungle Launcher', x: 26.5, z: 74.5, targetX: 27.5, targetZ: 72.5 },
  { id: 'pad_snow', name: 'Frost Bounce', x: 54.5, z: 22.5, targetX: 57.5, targetZ: 22.5 },
];

export function padAt(x, z) {
  for (const trail of trails) {
    const index = trail.pads.findIndex(([px,pz]) => x >= px && x < px+2 && z >= pz && z < pz+2);
    if (index >= 0) return { trail, index, key: trail.name + index, pad: trail.pads[index] };
  }
  return null;
}

export function treeCrownAt(x, z, y) {
  if (y < 10) return null;
  for (const c of TREE_CROWNS) {
    if (Math.hypot(x - c.x, z - c.z) <= 3.1) return c;
  }
  return null;
}

export function bouncePadAt(x, z, y) {
  if (Math.abs((y ?? 8) - 8) > 1.2) return null;
  for (const b of BOUNCE_PADS) {
    if (Math.hypot(x - b.x, z - b.z) <= 1.25) return b;
  }
  return null;
}

export function createTrailGems(scene, world = null) {
  const group = new THREE.Group();
  const geometry = new THREE.OctahedronGeometry(0.36);
  const gems = [];
  for (const trail of trails) {
    const material = new THREE.MeshBasicMaterial({ color: trail.color });
    for (const [index, [x,z,y]] of trail.pads.entries()) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x+1, y+1, z+1);
      mesh.scale.y = 1.45;
      group.add(mesh);
      gems.push({ mesh, y, key: trail.name + index });
    }
  }

  // Pooled 1-draw-call golden Treetop Crowns floating above canopy tops
  const crownGeo = new THREE.OctahedronGeometry(0.52, 0);
  const crownMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, TREE_CROWNS.length);
  crownMesh.frustumCulled = false;
  const crownTopYs = TREE_CROWNS.map((c) => {
    const ty = world?.treeTopY?.(c.x, c.z) || 14;
    return ty >= 10 ? ty : 14;
  });
  const tmpColor = new THREE.Color();
  for (let i = 0; i < TREE_CROWNS.length; i++) {
    tmpColor.setHex(TREE_CROWNS[i].color);
    crownMesh.setColorAt(i, tmpColor);
  }
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  group.add(crownMesh);

  // Pooled 1-draw-call glowing green Slime Trampoline Bounce Pads
  const padGeo = new THREE.BoxGeometry(1.72, 0.24, 1.72);
  const padMat = new THREE.MeshBasicMaterial({ color: 0x5ce643, toneMapped: false });
  const padMesh = new THREE.InstancedMesh(padGeo, padMat, BOUNCE_PADS.length);
  padMesh.frustumCulled = false;
  const rimGeo = new THREE.BoxGeometry(1.12, 0.28, 1.12);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xeaff7a, toneMapped: false });
  const rimMesh = new THREE.InstancedMesh(rimGeo, rimMat, BOUNCE_PADS.length);
  rimMesh.frustumCulled = false;
  group.add(padMesh);
  group.add(rimMesh);

  const dummy = new THREE.Object3D();
  scene.add(group);
  let crownYsResolved = false;

  return (state, time) => {
    group.visible = state.scene === 'world' && state.area === 'hub';
    if (!group.visible) return;
    if (!crownYsResolved && world?.treeTopY) {
      let resolved = 0;
      for (let i = 0; i < TREE_CROWNS.length; i++) {
        const ty = world.treeTopY(TREE_CROWNS[i].x, TREE_CROWNS[i].z);
        if (ty >= 10) {
          crownTopYs[i] = ty;
          resolved += 1;
        }
      }
      if (resolved === TREE_CROWNS.length) {
        crownYsResolved = true;
      }
    }

    for (const { mesh, y, key } of gems) {
      mesh.visible = !state.trailGems.includes(key);
      mesh.position.y = y + 1 + 0.15 * Math.sin(time * 3 + y);
      mesh.rotation.y = time * 2;
    }

    const ownedCrowns = state.treeCrowns || [];
    for (let i = 0; i < TREE_CROWNS.length; i++) {
      const c = TREE_CROWNS[i];
      if (ownedCrowns.includes(c.id)) {
        dummy.position.set(0, -30, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        const cy = crownTopYs[i] + 1.05 + 0.22 * Math.sin(time * 3.2 + i * 0.9);
        dummy.position.set(c.x, cy, c.z);
        dummy.rotation.set(time * 0.6, time * 2.4 + i, 0);
        dummy.scale.set(1.0, 1.35, 1.0);
      }
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);
    }
    crownMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < BOUNCE_PADS.length; i++) {
      const b = BOUNCE_PADS[i];
      const pulse = 1.0 + 0.08 * Math.sin(time * 4.5 + i);
      const sy = world?.surfaceY?.(Math.floor(b.x), Math.floor(b.z)) || 8;
      dummy.position.set(b.x, sy + 0.12, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(pulse, 1 + 0.18 * Math.sin(time * 4.5 + i), pulse);
      dummy.updateMatrix();
      padMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(b.x, sy + 0.15, b.z);
      dummy.scale.set(pulse * 0.92, 1, pulse * 0.92);
      dummy.updateMatrix();
      rimMesh.setMatrixAt(i, dummy.matrix);
    }
    padMesh.instanceMatrix.needsUpdate = true;
    rimMesh.instanceMatrix.needsUpdate = true;
  };
}
