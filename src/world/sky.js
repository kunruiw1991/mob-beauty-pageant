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
    bg: 0x0d041c,
    zenith: [0x06010f, 0x190733, 0x2c0f52],
    fogColor: 0x16062c,
    fogNear: 58,
    fogFar: 140,
    hemiSky: 0xfffdf0,
    hemiGround: 0xa6a176,
    hemiInt: 0.88,
    dirColor: 0xfffef4,
    dirInt: 0.96,
    dirPos: [164, 68, 66],
    clouds: false,
    stars: true,
  },
  nether: {
    bg: 0x4a110e,
    zenith: [0x240606, 0x5c1512, 0x9c2c1a],
    fogColor: 0x591712,
    fogNear: 38,
    fogFar: 106,
    hemiSky: 0xffb48a,
    hemiGround: 0x5c221d,
    hemiInt: 0.94,
    dirColor: 0xffd494,
    dirInt: 1.04,
    dirPos: [210, 58, 76],
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
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#070212');
  grad.addColorStop(0.38, '#190734');
  grad.addColorStop(0.68, '#2b0f52');
  grad.addColorStop(1.0, '#120426');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  let s = 0x51a7e1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 36; i++) {
    const nx = Math.floor(rnd() * 488);
    const ny = Math.floor(rnd() * 236) + 8;
    g.fillStyle = i % 2 === 0 ? 'rgba(147, 51, 234, 0.16)' : 'rgba(192, 132, 252, 0.12)';
    g.fillRect(nx, ny, 14 + Math.floor(rnd() * 28), 4 + Math.floor(rnd() * 10));
  }
  for (let i = 0; i < 950; i++) {
    const x = Math.floor(rnd() * 508) + 2;
    const y = Math.floor(rnd() * 246) + 5;
    const roll = rnd();
    g.fillStyle = roll > 0.55 ? '#faf5ff' : roll > 0.2 ? '#e879f9' : '#a855f7';
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

function makeNetherSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1f0505');
  grad.addColorStop(0.35, '#470f0d');
  grad.addColorStop(0.68, '#7a1f16');
  grad.addColorStop(0.88, '#a6341b');
  grad.addColorStop(1.0, '#591610');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  let s = 0x7f4a2c19;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Cavernous crimson ridges & distant warm lava horizon haze
  for (let i = 0; i < 48; i++) {
    const nx = Math.floor(rnd() * 488);
    const ny = Math.floor(rnd() * 210) + 12;
    g.fillStyle = ny > 140 ? 'rgba(255, 128, 48, 0.12)' : 'rgba(42, 8, 8, 0.22)';
    g.fillRect(nx, ny, 18 + Math.floor(rnd() * 36), 4 + Math.floor(rnd() * 10));
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rnd() * 508) + 2;
    const y = Math.floor(rnd() * 190) + 50;
    g.fillStyle = rnd() > 0.3 ? 'rgba(255, 176, 72, 0.45)' : 'rgba(56, 217, 245, 0.35)';
    g.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  return tex;
}

export function createSky(ctx) {
  const group = new THREE.Group();
  group.name = 'worldSky';

  const skyTex = {
    hub: makeSkyTexture(PALETTES.hub.zenith),
    end: makeStarSkyTexture(),
    nether: makeNetherSkyTexture(),
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
      ambient.intensity = currentArea === 'hub' ? 0.55 : currentArea === 'end' ? 0.84 : 0.56;
      ambient.color.setHex(currentArea === 'nether' ? 0xffdcd0 : currentArea === 'end' ? 0xfffef5 : 0xffffff);
    }
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = externalLights ? (currentArea === 'end' ? 0.68 : p.hemiInt * 0.62) : p.hemiInt;
    sun.color.setHex(p.dirColor);
    sun.intensity = externalLights ? (currentArea === 'end' ? 0.9 : p.dirInt * 0.85) : p.dirInt;
    sun.position.set(p.dirPos[0], p.dirPos[1], p.dirPos[2]);
    if (sun.target) {
      if (!sun.target.parent && ctx?.scene) {
        ctx.scene.add(sun.target);
      }
      sun.target.position.set(centerX, 8, centerZ);
      sun.target.updateMatrixWorld();
    }

    if (ctx?.scene) {
      ctx.scene.background = new THREE.Color(p.bg);
      if (ctx.scene.fog && ctx.scene.fog.isFogExp2) {
        ctx.scene.fog.color.setHex(p.fogColor);
        ctx.scene.fog.density = currentArea === 'hub' ? 0.0052 : currentArea === 'end' ? 0.0035 : 0.014;
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
