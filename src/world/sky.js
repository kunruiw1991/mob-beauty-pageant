import * as THREE from '../../vendor/three.module.min.js';

const PALETTES = {
  hub: {
    bg: 0x78b7ff,
    zenith: [0x4c94f6, 0x87c6ff, 0xd8f0ff],
    fogColor: 0x9fd2ff,
    fogNear: 58,
    fogFar: 145,
    hemiSky: 0xe6f5ff,
    hemiGround: 0x7aa35b,
    hemiInt: 0.92,
    dirColor: 0xfff8e6,
    dirInt: 1.02,
    dirPos: [68, 58, 92],
    clouds: true,
    stars: false,
  },
  end: {
    bg: 0x10061e,
    zenith: [0x070210, 0x18092c, 0x2c1148],
    fogColor: 0x1a0b2e,
    fogNear: 42,
    fogFar: 105,
    hemiSky: 0xaa82e0,
    hemiGround: 0x3b2c4a,
    hemiInt: 0.86,
    dirColor: 0xebd9ff,
    dirInt: 0.95,
    dirPos: [168, 56, 72],
    clouds: false,
    stars: true,
  },
  nether: {
    bg: 0x45100e,
    zenith: [0x2a0706, 0x5c1512, 0x8f2618],
    fogColor: 0x571612,
    fogNear: 32,
    fogFar: 92,
    hemiSky: 0xff9f6e,
    hemiGround: 0x4f1a18,
    hemiInt: 0.9,
    dirColor: 0xffc078,
    dirInt: 1.0,
    dirPos: [200, 54, 72],
    clouds: false,
    stars: false,
  },
};

function makeSkyTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  grad.addColorStop(0.0, hex(stops[0]));
  grad.addColorStop(0.55, hex(stops[1]));
  grad.addColorStop(1.0, hex(stops[2]));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function makeStarSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, '#070210');
  grad.addColorStop(0.55, '#16082b');
  grad.addColorStop(1.0, '#291046');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  // Deterministic crisp pixel stars for End void
  let s = 0x51a7e1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 320; i++) {
    const x = Math.floor(rnd() * 254) + 1;
    const y = Math.floor(rnd() * 96) + 8;
    g.fillStyle = rnd() > 0.4 ? '#f0d9ff' : '#a874ff';
    g.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.generateMipmaps = false;
  return tex;
}

export function createSky(ctx) {
  const group = new THREE.Group();
  group.name = 'worldSky';

  const skyTex = {
    hub: makeSkyTexture(PALETTES.hub.zenith),
    end: makeStarSkyTexture(),
    nether: makeSkyTexture(PALETTES.nether.zenith),
  };

  // Sky dome (1 draw call, SphereGeometry radius 145 never clips camera.far!)
  const domeGeo = new THREE.SphereGeometry(145, 20, 14);
  const domeMat = new THREE.MeshBasicMaterial({
    map: skyTex.hub,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // Drifting blocky clouds (1 InstancedMesh draw call)
  const CLOUD_COUNT = 22;
  const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    fog: false,
    toneMapped: false,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COUNT);
  clouds.frustumCulled = false;
  clouds.name = 'blockyClouds';

  const cloudDefs = [];
  let seed = 0x2468ace1;
  const nextR = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < CLOUD_COUNT; i++) {
    cloudDefs.push({
      x0: -40 + nextR() * 180,
      y: 31 + Math.floor(nextR() * 5) * 1.2,
      z: -35 + nextR() * 165,
      sx: 7 + Math.floor(nextR() * 11),
      sy: 1.4,
      sz: 4 + Math.floor(nextR() * 7),
      speed: 0.65 + nextR() * 0.45,
    });
  }
  const dummy = new THREE.Object3D();
  function updateClouds(simTime) {
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const c = cloudDefs[i];
      const span = 190;
      const x = ((c.x0 + simTime * c.speed + 50) % span + span) % span - 50;
      dummy.position.set(x, c.y, c.z);
      dummy.scale.set(c.sx, c.sy, c.sz);
      dummy.updateMatrix();
      clouds.setMatrixAt(i, dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }
  updateClouds(0);
  group.add(clouds);

  // World lights: reuse ctx.lights (from core/scene.js) when present to avoid double-lighting!
  const externalLights = ctx?.lights;
  const ambient = externalLights?.ambient || null;
  const hemi = externalLights?.hemi || new THREE.HemisphereLight(PALETTES.hub.hemiSky, PALETTES.hub.hemiGround, PALETTES.hub.hemiInt);
  const sun = externalLights?.sun || new THREE.DirectionalLight(PALETTES.hub.dirColor, PALETTES.hub.dirInt);
  if (!externalLights) {
    sun.position.set(...PALETTES.hub.dirPos);
    group.add(hemi);
    group.add(sun);
    group.add(sun.target);
  }

  if (ctx?.scene) {
    ctx.scene.add(group);
  }

  let currentArea = 'hub';
  let elapsed = 0;

  function setArea(area) {
    const p = PALETTES[area] || PALETTES.hub;
    currentArea = area in PALETTES ? area : 'hub';
    domeMat.map = skyTex[currentArea];
    domeMat.needsUpdate = true;

    const centerX = currentArea === 'end' ? 152 : currentArea === 'nether' ? 216 : 48;
    const centerZ = currentArea === 'hub' ? 48 : 40;
    dome.position.set(centerX, 20, centerZ);

    clouds.visible = p.clouds;
    if (ambient) {
      ambient.intensity = currentArea === 'hub' ? 0.55 : currentArea === 'end' ? 0.48 : 0.46;
      ambient.color.setHex(currentArea === 'nether' ? 0xffcfc2 : currentArea === 'end' ? 0xe5d4ff : 0xffffff);
    }
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = externalLights ? p.hemiInt * 0.62 : p.hemiInt;
    sun.color.setHex(p.dirColor);
    sun.intensity = externalLights ? p.dirInt * 0.85 : p.dirInt;
    sun.position.set(p.dirPos[0], p.dirPos[1], p.dirPos[2]);
    if (sun.target) {
      sun.target.position.set(centerX, 8, centerZ);
    }

    if (ctx?.scene) {
      ctx.scene.background = new THREE.Color(p.bg);
      if (ctx.scene.fog && ctx.scene.fog.isFogExp2) {
        ctx.scene.fog.color.setHex(p.fogColor);
        ctx.scene.fog.density = currentArea === 'hub' ? 0.0052 : currentArea === 'end' ? 0.011 : 0.014;
      } else if (ctx.scene.fog && ctx.scene.fog.isFog) {
        ctx.scene.fog.color.setHex(p.fogColor);
        ctx.scene.fog.near = p.fogNear;
        ctx.scene.fog.far = p.fogFar;
      } else {
        ctx.scene.fog = new THREE.Fog(p.fogColor, p.fogNear, p.fogFar);
      }
    }
  }

  setArea('hub');

  function update(dt) {
    elapsed = typeof ctx?.time === 'number' ? ctx.time : elapsed + dt;
    if (currentArea === 'hub') {
      updateClouds(elapsed);
    }
  }

  return {
    group,
    hemi,
    sun,
    setArea,
    update,
  };
}
