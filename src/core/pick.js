// Entity & voxel picking with strict Entity > Block priority per docs/DESIGN.md §3.9, brief #117 (owner: core).
import * as THREE from '../../vendor/three.module.min.js';

export function createPicker(ctx) {
  const entities = new Map();
  let autoIdSeq = 1;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmpVec = new THREE.Vector3();
  const tmpViewPos = new THREE.Vector3();
  const tmpClosest = new THREE.Vector3();
  const tmpWorldPos = new THREE.Vector3();

  // Supports both register(entry) and register(object3d, meta) (used by quests/kit.js)
  function register(entryOrObj, meta = null) {
    if (!entryOrObj) return () => {};
    let entry;
    let key;

    if (entryOrObj.isObject3D || meta !== null) {
      const obj = entryOrObj;
      const info = meta || obj.userData?.pick || {};
      key = info.id || info.targetId || obj.uuid || `pick_${autoIdSeq++}`;
      entry = {
        id: key,
        targetId: info.targetId || info.id || key,
        entityId: info.entityId || info.id || null,
        kind: info.kind || 'entity',
        label: info.label || key,
        radius: info.hitRadius ?? info.radius ?? 1.05,
        priority: info.priority ?? 15,
        object: obj,
        group: obj,
        area: info.area || null,
        onTap: info.onTap || null,
      };
    } else {
      key = entryOrObj.id || entryOrObj.targetId || `pick_${autoIdSeq++}`;
      entry = { ...entryOrObj, id: key };
    }

    entities.set(key, entry);
    return () => {
      entities.delete(key);
    };
  }

  function unregister(idOrObj) {
    if (!idOrObj) return;
    if (typeof idOrObj === 'string') {
      entities.delete(idOrObj);
      return;
    }
    for (const [k, v] of entities.entries()) {
      if (v === idOrObj || v.object === idOrObj || v.group === idOrObj) {
        entities.delete(k);
      }
    }
  }

  function clear() {
    entities.clear();
  }

  function getCanvasMetrics() {
    const canvas = ctx.renderer?.domElement;
    if (!canvas) {
      return { left: 0, top: 0, width: window.innerWidth || 1280, height: window.innerHeight || 800 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width || window.innerWidth || 1280,
      height: rect.height || window.innerHeight || 800,
    };
  }

  function worldToScreen(pos) {
    const { left, top, width, height } = getCanvasMetrics();
    const wx = pos?.x ?? 0;
    const wy = (pos?.y ?? 8) + 0.6;
    const wz = pos?.z ?? 0;

    ctx.camera.updateMatrixWorld();
    ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert();

    tmpViewPos.set(wx, wy, wz).applyMatrix4(ctx.camera.matrixWorldInverse);
    const inFront = tmpViewPos.z < -0.15;

    tmpVec.set(wx, wy, wz).project(ctx.camera);
    const rawSx = left + (tmpVec.x * 0.5 + 0.5) * width;
    const rawSy = top + (-tmpVec.y * 0.5 + 0.5) * height;

    const edgePad = 8;
    const onScreen =
      inFront &&
      tmpVec.z >= -1 &&
      tmpVec.z <= 1 &&
      rawSx >= left + edgePad &&
      rawSx <= left + width - edgePad &&
      rawSy >= top + edgePad &&
      rawSy <= top + height - edgePad;

    // Project (target - player) onto camera right / forward on the XZ ground plane (#149 N1)
    const pPos = ctx.player?.pos || ctx.state?.player || { x: 48, y: 8, z: 66 };
    const dx = wx - (pPos.x ?? 48);
    const dz = wz - (pPos.z ?? 66);

    const e = ctx.camera.matrixWorld.elements;
    let rx = e[0];
    let rz = e[2];
    const rLen = Math.hypot(rx, rz);
    if (rLen > 1e-6) {
      rx /= rLen;
      rz /= rLen;
    } else {
      rx = 1;
      rz = 0;
    }

    let fx = -e[8];
    let fz = -e[10];
    const fLen = Math.hypot(fx, fz);
    if (fLen > 1e-6) {
      fx /= fLen;
      fz /= fLen;
    } else {
      fx = 0;
      fz = -1;
    }

    let dirX = dx * rx + dz * rz;
    let dirY = -(dx * fx + dz * fz);
    const dirLen = Math.hypot(dirX, dirY);
    if (dirLen < 1e-5) {
      dirX = 0;
      dirY = wy > (pPos.y ?? 8) + 1 ? -1 : 1;
    } else {
      dirX /= dirLen;
      dirY /= dirLen;
    }
    const angle = Math.round(Math.atan2(dirY, dirX) * 1000) / 1000;

    if (onScreen) {
      return {
        sx: Math.round(rawSx * 10) / 10,
        sy: Math.round(rawSy * 10) / 10,
        onScreen: true,
        visible: true,
        angle,
      };
    }

    // Clamp off-screen / behind-camera ray from viewport center to safe HUD edge box
    const cx = left + width * 0.5;
    const cy = top + height * 0.5;
    const minX = left + Math.min(54, width * 0.14);
    const maxX = left + width - Math.min(54, width * 0.14);
    const minY = top + Math.min(122, height * 0.31);
    const maxY = top + height - Math.min(54, height * 0.14);

    let tx = Infinity;
    if (dirX > 1e-5) tx = (maxX - cx) / dirX;
    else if (dirX < -1e-5) tx = (minX - cx) / dirX;

    let ty = Infinity;
    if (dirY > 1e-5) ty = (maxY - cy) / dirY;
    else if (dirY < -1e-5) ty = (minY - cy) / dirY;

    const tEdge = Math.max(0, Math.min(tx, ty));
    let clampedSx = Math.min(maxX, Math.max(minX, cx + dirX * tEdge));
    let clampedSy = Math.min(maxY, Math.max(minY, cy + dirY * tEdge));

    // Avoid bottom-right context action button zone (right 120px, bottom 120px)
    if (clampedSx > left + width - 148 && clampedSy > top + height - 148) {
      clampedSx = Math.min(clampedSx, left + width - 152);
    }

    return {
      sx: Math.round(clampedSx * 10) / 10,
      sy: Math.round(clampedSy * 10) / 10,
      onScreen: false,
      visible: false,
      angle,
    };
  }

  function isObjectVisibleInHierarchy(obj) {
    let cur = obj;
    while (cur) {
      if (cur.visible === false) return false;
      cur = cur.parent;
    }
    return true;
  }

  function gatherEntityCandidates() {
    const list = [];
    const curArea = ctx.state?.area || 'hub';

    // 1. Active quest targets & available beacon targets (highest touch priority)
    const questTargets = ctx.quests?.targets ? ctx.quests.targets() : [];
    for (const qt of questTargets) {
      if (!qt || !qt.pos) continue;
      if (qt.area && qt.area !== curArea) continue;
      list.push({
        id: qt.id,
        targetId: qt.id,
        entityId: qt.entityId || qt.id,
        kind: qt.kind || 'entity',
        label: qt.label || qt.id,
        pos: qt.pos,
        radius: qt.radius ?? 1.15,
        priority: qt.priority ?? 20,
        questTarget: qt,
      });
    }

    // 2. Registered world entities / breakables / collectibles / NPCs
    for (const ent of entities.values()) {
      if (ent.active === false) continue;
      if (ent.area && ent.area !== curArea) continue;
      const obj = ent.object || ent.group;
      if (obj) {
        if (!obj.parent || !isObjectVisibleInHierarchy(obj)) continue;
      }
      let p = null;
      if (typeof ent.getPos === 'function') {
        p = ent.getPos();
      } else if (ent.pos) {
        p = ent.pos;
      } else if (obj) {
        obj.getWorldPosition(tmpWorldPos);
        p = { x: tmpWorldPos.x, y: tmpWorldPos.y, z: tmpWorldPos.z };
      }
      if (!p) continue;
      list.push({
        id: ent.id,
        targetId: ent.targetId || ent.id,
        entityId: ent.entityId || ent.id,
        kind: ent.kind || 'entity',
        label: ent.label || ent.id,
        pos: { x: p.x, y: p.y, z: p.z },
        radius: ent.radius || ent.hitRadius || 1.05,
        priority: ent.priority ?? 12,
        object: obj || null,
        entity: ent,
      });
    }

    return list;
  }

  function pickScreen(clientX, clientY) {
    const { left, top, width, height } = getCanvasMetrics();
    const relX = clientX - left;
    const relY = clientY - top;
    ndc.x = (relX / Math.max(1, width)) * 2 - 1;
    ndc.y = -(relY / Math.max(1, height)) * 2 + 1;

    ctx.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, ctx.camera);
    const ray = raycaster.ray;

    // Priority 1: Entities & Quest Targets (Entity > Block priority)
    const candidates = gatherEntityCandidates();
    let bestEntity = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      const cx = cand.pos.x;
      const cy = (cand.pos.y ?? 8) + 0.6;
      const cz = cand.pos.z;

      const dotRay =
        (cx - ray.origin.x) * ray.direction.x +
        (cy - ray.origin.y) * ray.direction.y +
        (cz - ray.origin.z) * ray.direction.z;
      if (dotRay <= 0.05) continue;

      tmpVec.set(cx, cy, cz);
      const camDist = ray.origin.distanceTo(tmpVec);
      if (camDist > 95) continue;

      ray.closestPointToPoint(tmpVec, tmpClosest);
      const rayDist = tmpClosest.distanceTo(tmpVec);

      tmpVec.set(cx, (cand.pos.y ?? 8) + 0.15, cz);
      ray.closestPointToPoint(tmpVec, tmpClosest);
      const baseRayDist = tmpClosest.distanceTo(tmpVec);
      const minRayDist = Math.min(rayDist, baseRayDist);

      const scr = worldToScreen(cand.pos);
      const screenDist = scr.onScreen ? Math.hypot(clientX - scr.sx, clientY - scr.sy) : Infinity;

      const hitByRay = minRayDist <= cand.radius;
      const hitByScreen = scr.onScreen && screenDist <= 42 && camDist < 55;

      if (hitByRay || hitByScreen) {
        const score = camDist - cand.priority * 0.4 + minRayDist * 2.0;
        if (score < bestScore) {
          bestScore = score;
          bestEntity = {
            type: 'entity',
            kind: cand.kind,
            id: cand.id,
            targetId: cand.targetId,
            entityId: cand.entityId,
            label: cand.label,
            pos: {
              x: cand.pos.x,
              y: cand.pos.y ?? 8,
              z: cand.pos.z,
            },
            target: cand.questTarget || null,
            object: cand.object || null,
            entity: cand.entity || null,
          };
        }
      }
    }

    if (bestEntity) {
      return bestEntity;
    }

    const rayInfo = {
      origin: { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      dir: { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
    };

    // Priority 2: Voxel world DDA raycast
    if (ctx.world?.raycast) {
      const vHit = ctx.world.raycast(ray.origin, ray.direction, 110);
      if (vHit && vHit.pos) {
        return {
          type: 'block',
          kind: 'block',
          pos: { x: vHit.pos.x, y: vHit.pos.y, z: vHit.pos.z },
          point: vHit.point || null,
          normal: vHit.normal || { x: 0, y: 1, z: 0 },
          blockId: vHit.blockId,
          ray: rayInfo,
        };
      }
    }

    // Priority 3: Intersect ray with horizontal plane y = player.y (#149 N2)
    const pPos = ctx.player?.pos || ctx.state?.player || { x: 48, y: 8, z: 66 };
    const planeY = Number.isFinite(pPos.y) ? pPos.y : 8;
    if (ray.direction.y < -0.015) {
      const t = (planeY - ray.origin.y) / ray.direction.y;
      if (t > 0 && t < 180) {
        const gx = ray.origin.x + ray.direction.x * t;
        const gz = ray.origin.z + ray.direction.z * t;
        const sy = ctx.world?.surfaceY ? ctx.world.surfaceY(Math.floor(gx), Math.floor(gz)) : planeY;
        const hasIslandGround = sy > 0;
        return {
          type: hasIslandGround ? 'ground' : 'ocean',
          kind: hasIslandGround ? 'ground' : 'ocean',
          pos: { x: gx, y: hasIslandGround ? sy : planeY, z: gz },
          surfaceY: sy,
          ray: rayInfo,
        };
      }
    }

    // Priority 4: Sky / horizon — project forward on plane y = player.y along ray XZ direction (#149 N2)
    const horizLen = Math.hypot(ray.direction.x, ray.direction.z);
    const stepX = horizLen > 1e-5 ? ray.direction.x / horizLen : 0;
    const stepZ = horizLen > 1e-5 ? ray.direction.z / horizLen : -1;
    const skyX = (pPos.x ?? 48) + stepX * 24;
    const skyZ = (pPos.z ?? 66) + stepZ * 24;
    const skySy = ctx.world?.surfaceY ? ctx.world.surfaceY(Math.floor(skyX), Math.floor(skyZ)) : 0;
    return {
      type: 'sky',
      kind: 'sky',
      pos: { x: skyX, y: planeY, z: skyZ },
      surfaceY: skySy,
      ray: rayInfo,
    };
  }

  return {
    register,
    add: register,
    unregister,
    remove: unregister,
    clear,
    pickScreen,
    worldToScreen,
    entities,
  };
}

export default createPicker;
