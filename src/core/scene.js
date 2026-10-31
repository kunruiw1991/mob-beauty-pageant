// Renderer, Three.js scene, lighting, and 3D quest pointer beacon per docs/DESIGN.md §1, §6 (owner: core).
import * as THREE from '../../vendor/three.module.min.js';

export function createSceneSetup(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  // Never call renderer.compile(scene, camera) at boot (§1 iPad WebKit GPU watchdog).

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x74bdff);
  scene.fog = new THREE.FogExp2(0x8fd0ff, 0.0085);

  // Clean MC daylight rig (no shadow maps)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  const hemiLight = new THREE.HemisphereLight(0xbbe4ff, 0x5c7a3b, 0.45);
  const sunLight = new THREE.DirectionalLight(0xfff6e0, 0.85);
  sunLight.position.set(36, 64, 42);
  scene.add(ambientLight, hemiLight, sunLight);

  // 3D Quest Beacon (light pillar + bouncing arrow) for pointer() (§6, F10)
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'quest-beacon';
  beaconGroup.visible = false;

  const beamGeo = new THREE.CylinderGeometry(0.28, 0.42, 14, 8, 1, true);
  beamGeo.translate(0, 7, 0);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe066,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.frustumCulled = false;

  const arrowGroup = new THREE.Group();
  const shaftGeo = new THREE.BoxGeometry(0.28, 0.65, 0.28);
  shaftGeo.translate(0, 0.55, 0);
  const headGeo = new THREE.ConeGeometry(0.52, 0.62, 4);
  headGeo.rotateX(Math.PI);
  headGeo.rotateY(Math.PI * 0.25);
  headGeo.translate(0, 0.05, 0);
  const arrowMat = new THREE.MeshBasicMaterial({
    color: 0xffd43b,
    toneMapped: false,
    fog: false,
  });
  const shaftMesh = new THREE.Mesh(shaftGeo, arrowMat);
  const headMesh = new THREE.Mesh(headGeo, arrowMat);
  shaftMesh.frustumCulled = false;
  headMesh.frustumCulled = false;
  arrowGroup.add(shaftMesh, headMesh);

  const ringGeo = new THREE.RingGeometry(0.55, 0.82, 16);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff3bf,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const baseRing = new THREE.Mesh(ringGeo, ringMat);
  baseRing.position.y = 0.06;
  baseRing.frustumCulled = false;

  beaconGroup.add(beamMesh, arrowGroup, baseRing);
  scene.add(beaconGroup);

  function updateBeacon(simTime, pointerPos, visible = true) {
    if (!visible || !pointerPos || !Number.isFinite(pointerPos.x) || !Number.isFinite(pointerPos.z)) {
      beaconGroup.visible = false;
      return;
    }
    beaconGroup.visible = true;
    const py = Number.isFinite(pointerPos.y) ? pointerPos.y : 8;
    beaconGroup.position.set(pointerPos.x, py, pointerPos.z);

    const bob = Math.sin(simTime * 4.2) * 0.35;
    arrowGroup.position.y = 2.6 + bob;
    arrowGroup.rotation.y = simTime * 2.2;

    const pulse = 0.85 + Math.sin(simTime * 5.0) * 0.18;
    baseRing.scale.setScalar(pulse);
    beamMat.opacity = 0.26 + Math.sin(simTime * 3.6) * 0.09;
  }

  function resize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 800;
    renderer.setSize(w, h, false);
  }

  return {
    renderer,
    scene,
    lights: { ambient: ambientLight, hemi: hemiLight, sun: sunLight },
    beaconGroup,
    updateBeacon,
    resize,
  };
}

export default createSceneSetup;
