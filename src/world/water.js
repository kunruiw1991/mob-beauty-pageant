import * as THREE from '../../vendor/three.module.min.js';

function makeOceanTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#2563d6';
  g.fillRect(0, 0, 16, 16);
  const tones = ['#1e54bd', '#3274eb', '#4d8df7', '#2059c7'];
  let s = 0x99337711;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rnd() < 0.42) {
        g.fillStyle = tones[Math.floor(rnd() * tones.length)];
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  // Subtle horizontal wave highlights like classic MC water_still
  g.fillStyle = '#6da8ff';
  g.fillRect(2, 3, 5, 1);
  g.fillRect(9, 7, 5, 1);
  g.fillRect(4, 12, 6, 1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.generateMipmaps = false;
  return tex;
}

export function createWater(ctx) {
  const tex = makeOceanTexture();
  const geo = new THREE.PlaneGeometry(280, 280);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: true,
    opacity: 0.86,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hubOcean';
  // Sea level y = 6 -> top of water sits at y = 6.82 (below island ground y = 8)
  mesh.position.set(48, 6.82, 48);
  mesh.renderOrder = -1;

  if (ctx?.scene) {
    ctx.scene.add(mesh);
  }

  let t = 0;

  function setArea(area) {
    mesh.visible = area === 'hub';
  }

  function update(dt) {
    if (!mesh.visible) return;
    t = typeof ctx?.time === 'number' ? ctx.time : t + dt;
    tex.offset.x = (t * 0.08) % 1;
    tex.offset.y = Math.sin(t * 0.7) * 0.06;
    mesh.position.y = 6.82 + Math.sin(t * 1.6) * 0.04;
  }

  return {
    mesh,
    setArea,
    update,
  };
}
