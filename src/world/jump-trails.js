import { B } from './blocks.js';
import * as THREE from '../../vendor/three.module.min.js';

// Each two-block-square landing has an approachable first step and a distinct silhouette.
export const trails = [
  { name: 'Honey Steps', block: B.HONEY_BLOCK, color: 0xffbe22, pads: [[51,65,9],[54,65,10],[57,65,11]] },
  { name: 'Frost Switchback', block: B.ICE, color: 0x7edfff, pads: [[37,26,9],[40,24,10],[43,26,9]] },
  { name: 'Marsh Skips', block: B.PRISMARINE, color: 0x6bffad, pads: [[64,69,9],[66,72,9],[69,73,10]] },
];

export function padAt(x, z) {
  for (const trail of trails) {
    const index = trail.pads.findIndex(([px,pz]) => x >= px && x < px+2 && z >= pz && z < pz+2);
    if (index >= 0) return { trail, index, key: trail.name + index, pad: trail.pads[index] };
  }
  return null;
}

export function createTrailGems(scene) {
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
  scene.add(group);
  return (state, time) => {
    group.visible = state.scene === 'world' && state.area === 'hub';
    if (!group.visible) return;
    for (const { mesh, y, key } of gems) {
      mesh.visible = !state.trailGems.includes(key);
      mesh.position.y = y + 1 + 0.15 * Math.sin(time * 3 + y);
      mesh.rotation.y = time * 2;
    }
  };
}
