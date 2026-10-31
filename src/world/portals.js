import * as THREE from '../../vendor/three.module.min.js';

function makeSwirlTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (kind === 'end') {
    g.fillStyle = '#070312';
    g.fillRect(0, 0, 32, 32);
    const cols = ['#163b4a', '#29a39b', '#7efce8', '#9b5de5', '#e5c3ff'];
    let s = 0x13579bdf;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 95; i++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1);
    }
  } else {
    g.fillStyle = '#6c1cd9';
    g.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        const dx = x - 15;
        const dy = y - 15;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx) + r * 0.32;
        const v = Math.sin(a * 3);
        g.fillStyle = v > 0.35 ? '#d98aff' : v < -0.35 ? '#480ca8' : '#8a2be2';
        g.fillRect(x, y, 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  return tex;
}

export function createPortals(ctx, poi) {
  const group = new THREE.Group();
  group.name = 'worldPortals';

  const endTex = makeSwirlTexture('end');
  const netherTex = makeSwirlTexture('nether');

  const endMat = new THREE.MeshBasicMaterial({
    map: endTex,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const netherMat = new THREE.MeshBasicMaterial({
    map: netherTex,
    transparent: true,
    opacity: 0.84,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });

  // Hub End Portal horizontal starry pool (3x3 inside 5x5 frame around (20.5, 8, 18.5))
  const hubEndPool = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), endMat);
  hubEndPool.rotation.x = -Math.PI / 2;
  hubEndPool.position.set(poi.endPortal.x, poi.endPortal.y + 0.04, poi.endPortal.z);

  // Hub Nether Portal vertical purple curtain (2x4 inside obsidian frame at (12.5, 8..12, 30.5))
  const hubNetherCurtain = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), netherMat);
  hubNetherCurtain.position.set(poi.netherPortal.x, poi.netherPortal.y + 2.0, poi.netherPortal.z);

  // End Exit Portal pool (3x3 at (152.5, 8, 58.5))
  const endExitPos = poi.endExit || { x: 152.5, y: 8, z: 58.5 };
  const endExitPool = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), endMat);
  endExitPool.rotation.x = -Math.PI / 2;
  endExitPool.position.set(endExitPos.x, endExitPos.y + 0.04, endExitPos.z);

  // Nether Exit Portal vertical curtain (2x4 at (216.5, 8..12, 58.5))
  const netherExitPos = poi.netherExit || { x: 216.5, y: 8, z: 58.5 };
  const netherExitCurtain = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), netherMat);
  netherExitCurtain.position.set(netherExitPos.x, netherExitPos.y + 2.0, netherExitPos.z);

  group.add(hubEndPool, hubNetherCurtain, endExitPool, netherExitCurtain);
  if (ctx?.scene) {
    ctx.scene.add(group);
  }

  const portalList = [
    { id: 'hubToEnd', fromArea: 'hub', toArea: 'end', pos: poi.endPortal, dest: poi.endArrive, radius: 1.65 },
    { id: 'hubToNether', fromArea: 'hub', toArea: 'nether', pos: poi.netherPortal, dest: poi.netherArrive, radius: 1.55 },
    { id: 'endToHub', fromArea: 'end', toArea: 'hub', pos: endExitPos, dest: { x: poi.endPortal.x, y: poi.endPortal.y, z: poi.endPortal.z + 2.5 }, radius: 1.65 },
    { id: 'netherToHub', fromArea: 'nether', toArea: 'hub', pos: netherExitPos, dest: { x: poi.netherPortal.x, y: poi.netherPortal.y, z: poi.netherPortal.z + 2.5 }, radius: 1.55 },
  ];

  function setArea(area) {
    hubEndPool.visible = area === 'hub';
    hubNetherCurtain.visible = area === 'hub';
    endExitPool.visible = area === 'end';
    netherExitCurtain.visible = area === 'nether';
  }

  setArea('hub');

  let t = 0;
  function update(dt) {
    t = typeof ctx?.time === 'number' ? ctx.time : t + dt;
    endTex.offset.x = (t * 0.07) % 1;
    endTex.offset.y = (t * 0.05) % 1;
    netherTex.offset.y = (t * 0.35) % 1;
    netherTex.offset.x = Math.sin(t * 2.2) * 0.08;
  }

  function checkWalkIn(area, pos) {
    if (!pos) return null;
    for (const p of portalList) {
      if (p.fromArea !== area) continue;
      const dx = pos.x - p.pos.x;
      const dz = pos.z - p.pos.z;
      if (dx * dx + dz * dz <= p.radius * p.radius && Math.abs((pos.y ?? p.pos.y) - p.pos.y) <= 2.2) {
        return p;
      }
    }
    return null;
  }

  return {
    group,
    list: portalList,
    setArea,
    update,
    checkWalkIn,
  };
}
