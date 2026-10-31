// Shared quest helpers per docs/DESIGN.md §3.5 (owner: quests-a, shared with quests-b).
// Zero-build ES2022, deterministic sim time/rng only (no Math.random, Date.now, setTimeout).

import * as THREE from '../../vendor/three.module.min.js';

// Fallback POI table matching docs/DESIGN.md §5 in case world is stubbed or still building.
export const DEFAULT_POI = Object.freeze({
  spawn: { x: 48.5, y: 8, z: 66.5 },
  plaza: { x: 48.5, y: 8, z: 48.5 },
  board: { x: 48.5, y: 8, z: 40.5 },
  runway: { x: 48.5, y: 8, z: 54.5 },
  stage: { x: 48.5, y: 8, z: 58.5 },
  meadow: { x: 48.5, y: 8, z: 72.5 },
  hive: { x: 40.5, y: 8, z: 80.5 },
  swamp: { x: 69.5, y: 8, z: 68.5 },
  cave: { x: 79.5, y: 8, z: 46.5 },
  villageSquare: { x: 72.5, y: 8, z: 26.5 },
  statue: { x: 70.5, y: 8, z: 32.5 },
  pumpkins: { x: 78.5, y: 8, z: 20.5 },
  ironAltar: { x: 66.5, y: 8, z: 27.5 },
  bank: { x: 82.5, y: 8, z: 27.5 },
  stall: { x: 74.5, y: 8, z: 24.5 },
  snow: { x: 48.5, y: 8, z: 22.5 },
  snowArena: { x: 48.5, y: 8, z: 14.5 },
  shrine: { x: 18.5, y: 8, z: 22.5 },
  endPortal: { x: 20.5, y: 9, z: 18.5 },
  netherPortal: { x: 12.5, y: 9, z: 30.5 },
  kaiHouse: { x: 16.5, y: 8, z: 45.5 },
  prison: { x: 17.5, y: 8, z: 58.5 },
  prisonCell: { x: 17.5, y: 8, z: 65.5 },
  jungle: { x: 24.5, y: 8, z: 76.5 },
  clearing: { x: 26.5, y: 8, z: 58.5 },
  pinkTulip: { x: 33.5, y: 8, z: 72.5 },
  endArrive: { x: 137.5, y: 8, z: 40.5 },
  endCage: { x: 154.5, y: 8, z: 40.5 },
  dragonEgg: { x: 153.5, y: 17, z: 26.5 },
  netherArrive: { x: 201.5, y: 8, z: 40.5 },
  fortress: { x: 214.5, y: 9, z: 38.5 },
  soulSand: { x: 220.5, y: 8, z: 46.5 },
  witherAltar: { x: 228.5, y: 8, z: 40.5 },
});

// ---------------------------------------------------------------------------
// Deterministic RNG & Sim Time
// ---------------------------------------------------------------------------

let fallbackSeed = 0x12345678;

export function rng(ctx) {
  const r = ctx?.rng;
  if (typeof r === 'function') return r();
  if (r && typeof r.next === 'function') return r.next();
  if (r && typeof r.float === 'function') return r.float();
  if (r && typeof r.random === 'function') return r.random();
  // Pure mulberry32 fallback if ctx.rng is missing in an isolated unit test
  fallbackSeed = (fallbackSeed + 0x6d2b79f5) | 0;
  let t = Math.imul(fallbackSeed ^ (fallbackSeed >>> 15), 1 | fallbackSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngRange(ctx, min, max) {
  return min + (max - min) * rng(ctx);
}

export function rngInt(ctx, min, max) {
  if (max <= min) return min;
  return min + Math.floor(rng(ctx) * (max - min + 1));
}

export function rngPick(ctx, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rng(ctx) * arr.length) % arr.length];
}

export function simTime(ctx) {
  if (typeof ctx?.time === 'number') return ctx.time;
  if (typeof ctx?.state?.timeMs === 'number') return ctx.state.timeMs / 1000;
  return 0;
}

export function createTimers() {
  const tasks = [];
  let nextId = 1;

  function after(delaySec, fn) {
    const id = nextId++;
    tasks.push({ id, remaining: Math.max(0, delaySec), interval: 0, fn });
    return () => cancel(id);
  }

  function every(intervalSec, fn) {
    const id = nextId++;
    const step = Math.max(1 / 60, intervalSec);
    tasks.push({ id, remaining: step, interval: step, fn });
    return () => cancel(id);
  }

  function cancel(id) {
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx >= 0) tasks.splice(idx, 1);
  }

  function update(dt) {
    if (tasks.length === 0 || dt <= 0) return;
    const snapshot = [...tasks];
    for (const t of snapshot) {
      if (!tasks.includes(t)) continue;
      t.remaining -= dt;
      if (t.remaining <= 1e-6) {
        if (t.interval > 0) {
          t.remaining += t.interval;
          if (t.remaining <= 0) t.remaining = t.interval;
        } else {
          cancel(t.id);
        }
        t.fn();
      }
    }
  }

  function clear() {
    tasks.length = 0;
  }

  return { after, every, cancel, update, clear, count: () => tasks.length };
}

// ---------------------------------------------------------------------------
// World, Coordinates, Player & Event Helpers
// ---------------------------------------------------------------------------

export function surfaceY(ctx, x, z, fallback = 8) {
  const fn = ctx?.world?.surfaceY;
  if (typeof fn === 'function') {
    const y = fn.call(ctx.world, Math.floor(x), Math.floor(z));
    if (typeof y === 'number' && Number.isFinite(y) && y > 0) return y;
  }
  return fallback;
}

export function poi(ctx, key, fallback = null) {
  const raw = ctx?.world?.poi?.[key] || fallback || DEFAULT_POI[key] || { x: 48, y: 8, z: 48 };
  const x = raw.x ?? 48;
  const z = raw.z ?? 48;
  const baseY = raw.y ?? surfaceY(ctx, x, z, 8);
  return { x, y: baseY, z };
}

export function distXZ(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

export function dist3(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

export function playerPos(ctx) {
  const p =
    ctx?.player?.pos ||
    ctx?.player?.position ||
    ctx?.player?.actor?.group?.position ||
    ctx?.player?.group?.position ||
    ctx?.state?.player;
  if (p && typeof p.x === 'number') {
    return { x: p.x, y: p.y ?? 8, z: p.z };
  }
  return { x: 48, y: 8, z: 66 };
}

export function isPlayerMoving(ctx) {
  if (typeof ctx?.player?.moving === 'boolean') return ctx.player.moving;
  if (typeof ctx?.player?.isMoving === 'function') return !!ctx.player.isMoving();
  if (typeof ctx?.state?.player?.moving === 'boolean') return ctx.state.player.moving;
  return false;
}

export function setPlayerSneak(ctx, sneak) {
  const flag = Boolean(sneak);
  if (ctx?.state?.player) {
    ctx.state.player.sneak = flag;
  }
  if (typeof ctx?.player?.setSneak === 'function') {
    ctx.player.setSneak(flag);
  }
}

export function movePlayerTo(ctx, targetPos) {
  if (!targetPos) return false;
  const inHub = (ctx?.state?.area || 'hub') === 'hub' && (targetPos.x ?? 48) < 96;
  const prefY = inHub && (targetPos.y ?? 8) <= 11.8 ? 8 : Math.round(targetPos.y ?? surfaceY(ctx, targetPos.x, targetPos.z, 8));
  let goal = null;

  // Prefer standing at prefY (+/-1) right next to tall structures (statues, roofs, caves, altars)
  // so nearestWalkable never snaps onto a 6-block-high statue ear or rooftop!
  if (typeof ctx?.world?.isWalkable === 'function') {
    const bx0 = Math.floor(targetPos.x);
    const bz0 = Math.floor(targetPos.z);
    for (let r = 0; r <= 4 && !goal; r++) {
      let bestD2 = Infinity;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const bx = bx0 + dx;
          const bz = bz0 + dz;
          for (const dy of [0, 1, -1]) {
            const ty = prefY + dy;
            if (ty >= 1 && ctx.world.isWalkable(bx, ty, bz)) {
              const cx = bx + 0.5;
              const cz = bz + 0.5;
              const d2 = (cx - targetPos.x) ** 2 + (cz - targetPos.z) ** 2 + dy * dy * 0.5;
              if (d2 < bestD2) {
                bestD2 = d2;
                goal = { x: cx, y: ty, z: cz };
              }
              break;
            }
          }
        }
      }
    }
  }

  if (!goal) {
    goal = { x: targetPos.x, y: prefY, z: targetPos.z };
    if (typeof ctx?.world?.nearestWalkable === 'function') {
      const nw = ctx.world.nearestWalkable(goal, 5);
      if (nw && typeof nw.x === 'number') goal = nw;
    }
  }

  const pl = ctx?.player;
  if (pl) {
    if (typeof pl.walkTo === 'function') {
      pl.walkTo(goal, { maxSearchR: 5 });
      return true;
    }
    if (typeof pl.moveTo === 'function') {
      pl.moveTo(goal);
      return true;
    }
    if (typeof pl.goTo === 'function') {
      pl.goTo(goal);
      return true;
    }
    if (typeof pl.setDestination === 'function') {
      pl.setDestination(goal);
      return true;
    }
  }
  return false;
}

export function teleportPlayerTo(ctx, targetPos, area = null) {
  if (area && ctx?.state?.area !== area) {
    if (typeof ctx?.areas?.setArea === 'function') {
      ctx.areas.setArea(area, targetPos || undefined, { silent: true });
    } else {
      ctx?.world?.setArea?.(area);
      if (ctx?.state) ctx.state.area = area;
    }
  }
  let dst = targetPos
    ? {
        x: targetPos.x,
        y: targetPos.y ?? surfaceY(ctx, targetPos.x, targetPos.z, 8),
        z: targetPos.z,
      }
    : null;
  if (dst && typeof ctx?.world?.nearestWalkable === 'function' && typeof ctx?.world?.isWalkable === 'function') {
    const bx = Math.floor(dst.x);
    const by = Math.round(dst.y);
    const bz = Math.floor(dst.z);
    if (!ctx.world.isWalkable(bx, by, bz)) {
      const nw = ctx.world.nearestWalkable({ x: bx, y: by, z: bz }, 5);
      if (nw && typeof nw.x === 'number') dst = { x: nw.x + 0.5, y: nw.y ?? dst.y, z: nw.z + 0.5 };
    }
  }
  if (!dst) return;
  const pl = ctx?.player;
  if (pl) {
    if (typeof pl.setPosition === 'function') pl.setPosition(dst.x, dst.y, dst.z);
    else if (typeof pl.teleport === 'function') pl.teleport(dst);
    else if (typeof pl.setPos === 'function') pl.setPos(dst);
    else {
      if (pl.pos && typeof pl.pos.set === 'function') pl.pos.set(dst.x, dst.y, dst.z);
      else if (pl.pos) Object.assign(pl.pos, dst);
      if (pl.actor?.group) pl.actor.group.position.set(dst.x, dst.y, dst.z);
      if (pl.group) pl.group.position.set(dst.x, dst.y, dst.z);
    }
  }
  if (ctx?.state?.player) {
    ctx.state.player.x = Math.round(dst.x * 100) / 100;
    ctx.state.player.y = Math.round(dst.y * 100) / 100;
    ctx.state.player.z = Math.round(dst.z * 100) / 100;
    ctx.state.player.moving = false;
    ctx.state.player.pathLen = 0;
  }
}

export function emitGag(ctx, questId, gagId, pos = null) {
  if (!questId || !gagId) return;
  if (ctx?.state?.quests?.[questId]) {
    const gags = ctx.state.quests[questId].gags;
    if (Array.isArray(gags) && !gags.includes(gagId)) {
      gags.push(gagId);
    }
  }
  const p = pos || playerPos(ctx);
  ctx?.events?.emit?.('gag', {
    questId,
    gagId,
    pos: { x: p.x ?? 0, y: p.y ?? 8, z: p.z ?? 0 },
  });
}

export function playSfx(ctx, name, opts = {}) {
  if (!name) return;
  ctx?.events?.emit?.('sfx', { name, ...opts });
  ctx?.audio?.play?.(name, opts);
}

// ---------------------------------------------------------------------------
// Pick Registration & Shared Cached Three.js Resources (0 memory leak!)
// ---------------------------------------------------------------------------

const geoCache = new Map();
const matCache = new Map();
const crackMatCache = new Map();
const actorPool = new Map();

export function acquireActor(ctx, poolKey, kind, opts = {}) {
  if (!ctx?.chars?.create) return null;
  let actor = poolKey ? actorPool.get(poolKey) : null;
  if (!actor) {
    actor = ctx.chars.create(kind, opts);
    if (poolKey && actor) actorPool.set(poolKey, actor);
  }
  if (!actor) return null;
  actor.stopMove?.();
  actor.setEmote?.(null);
  actor.setHelmet?.(Boolean(opts.helmet));
  if (actor.group) {
    actor.group.scale.set(1, 1, 1);
    actor.group.rotation.set(0, 0, 0);
    if (opts.pos) {
      actor.group.position.set(opts.pos.x ?? 0, opts.pos.y ?? 8, opts.pos.z ?? 0);
    }
    attachToScene(ctx, actor.group);
  }
  actor.setVisible?.(true);
  actor.setAnim?.(opts.anim || 'idle');
  return actor;
}

export function sharedBoxGeo(sx = 1, sy = 1, sz = 1) {
  const k = `box:${sx.toFixed(3)}:${sy.toFixed(3)}:${sz.toFixed(3)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(sx, sy, sz));
  return geoCache.get(k);
}

export function sharedCylinderGeo(rt = 0.5, rb = 0.5, h = 1, seg = 8) {
  const k = `cyl:${rt.toFixed(3)}:${rb.toFixed(3)}:${h.toFixed(3)}:${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(k);
}

export function sharedPlaneGeo(w = 1, h = 1) {
  const k = `plane:${w.toFixed(3)}:${h.toFixed(3)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(w, h));
  return geoCache.get(k);
}

export function sharedLambertMat(colorHex, opts = {}) {
  const opacity = opts.opacity ?? 1;
  const transparent = opts.transparent ?? opacity < 1;
  const k = `lam:${colorHex}:${transparent ? 1 : 0}:${opacity.toFixed(2)}`;
  if (!matCache.has(k)) {
    matCache.set(
      k,
      new THREE.MeshLambertMaterial({
        color: colorHex,
        transparent,
        opacity,
      })
    );
  }
  return matCache.get(k);
}

export function sharedBasicMat(colorHex, opts = {}) {
  const opacity = opts.opacity ?? 1;
  const transparent = opts.transparent ?? opacity < 1;
  const wireframe = !!opts.wireframe;
  const depthWrite = opts.depthWrite ?? !transparent;
  const side = opts.side ?? THREE.FrontSide;
  const k = `bas:${colorHex}:${transparent ? 1 : 0}:${opacity.toFixed(2)}:${wireframe ? 1 : 0}:${depthWrite ? 1 : 0}:${side}`;
  if (!matCache.has(k)) {
    matCache.set(
      k,
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent,
        opacity,
        wireframe,
        depthWrite,
        side,
      })
    );
  }
  return matCache.get(k);
}

function makeCrackTexture(stage) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, 16, 16);
  g.fillStyle = 'rgba(20, 16, 16, 0.78)';
  const strokes = [
    [[7, 2], [8, 4], [7, 6], [8, 8], [6, 9], [9, 10]],
    [[4, 3], [5, 5], [6, 6], [10, 5], [11, 7], [8, 11], [7, 13], [5, 11]],
    [[2, 4], [3, 6], [12, 3], [13, 6], [3, 12], [11, 12], [12, 14], [9, 8], [6, 7]],
  ];
  for (let s = 0; s < Math.min(stage, strokes.length); s++) {
    for (const [px, py] of strokes[s]) {
      g.fillRect(px, py, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function sharedCrackMat(stage = 1) {
  const s = Math.max(1, Math.min(3, Math.floor(stage)));
  if (!crackMatCache.has(s)) {
    const map = makeCrackTexture(s);
    crackMatCache.set(
      s,
      new THREE.MeshBasicMaterial({
        map: map || null,
        color: map ? 0xffffff : 0x1a1a1a,
        transparent: true,
        opacity: map ? 0.9 : 0.25 * s,
        depthWrite: false,
      })
    );
  }
  return crackMatCache.get(s);
}

export function attachToScene(ctx, obj) {
  if (obj && ctx?.scene && obj.parent !== ctx.scene) {
    ctx.scene.add(obj);
  }
  return obj;
}

export function detachFromScene(obj) {
  if (obj && obj.parent) {
    obj.parent.remove(obj);
  }
}

export function registerPick(ctx, object3d, meta = {}) {
  if (!object3d) return () => {};
  const id = meta.id || meta.targetId || `pick_${object3d.uuid}`;
  const info = {
    id,
    kind: meta.kind || 'entity',
    targetId: meta.targetId || id,
    entityId: meta.entityId || id,
    label: meta.label || id,
    hitRadius: meta.hitRadius ?? 0.95,
    radius: meta.hitRadius ?? 0.95,
    priority: meta.priority ?? 15,
    area: meta.area || ctx?.state?.area || 'hub',
    group: object3d,
    getPos: () => object3d.position,
  };
  object3d.userData.pick = info;
  object3d.userData.targetId = info.targetId;
  object3d.userData.entityId = info.entityId;

  let off = null;
  const pick = ctx?.pick;
  if (pick) {
    if (typeof pick.register === 'function') {
      const res = pick.register(info);
      if (typeof res === 'function') off = res;
    } else if (typeof pick.add === 'function') {
      pick.add(info);
    }
  }
  return () => {
    if (typeof off === 'function') off();
    else if (pick && typeof pick.unregister === 'function') pick.unregister(id);
    else if (pick && typeof pick.remove === 'function') pick.remove(id);
  };
}

// ---------------------------------------------------------------------------
// 1. Breakable N-Tap Block (crack stages + particles + wobble)
// ---------------------------------------------------------------------------

export function createBreakable(ctx, opts = {}) {
  const id = opts.id || 'breakable';
  const pos = { x: opts.pos?.x ?? 0, y: opts.pos?.y ?? 8, z: opts.pos?.z ?? 0 };
  const taps = Math.max(1, opts.taps ?? 3);
  const size = opts.size ?? 1.0;
  const sy = opts.height ?? size;
  const color = opts.color ?? 0xb87333;
  const blockId = opts.blockId ?? 1;
  const label = opts.label || '方块';

  const group = new THREE.Group();
  group.position.set(pos.x, pos.y + sy * 0.5, pos.z);

  const coreMesh = new THREE.Mesh(
    sharedBoxGeo(size, sy, size),
    opts.overlayOnly ? sharedBasicMat(color, { opacity: 0.01, transparent: true }) : sharedLambertMat(color)
  );
  group.add(coreMesh);

  let accentMesh = null;
  if (opts.speckColor && !opts.overlayOnly) {
    accentMesh = new THREE.Mesh(
      sharedBoxGeo(size * 1.02, sy * 0.36, size * 1.02),
      sharedLambertMat(opts.speckColor)
    );
    group.add(accentMesh);
  }

  const crackMesh = new THREE.Mesh(
    sharedBoxGeo(size * 1.03, sy * 1.03, size * 1.03),
    sharedCrackMat(1)
  );
  crackMesh.visible = false;
  group.add(crackMesh);

  attachToScene(ctx, group);
  const unpick = registerPick(ctx, group, {
    id,
    targetId: id,
    kind: 'block',
    label,
    hitRadius: Math.max(0.85, size * 0.8),
  });

  let hits = 0;
  let broken = false;
  let wobble = 0;

  function tap(tapCtx = ctx) {
    if (broken) return false;
    hits += 1;
    wobble = 0.22;
    const hitPos = { x: pos.x, y: pos.y + sy * 0.5, z: pos.z };

    if (hits < taps) {
      const stage = Math.min(3, Math.ceil((hits / Math.max(1, taps - 1)) * 3));
      crackMesh.material = sharedCrackMat(stage);
      crackMesh.visible = true;
      tapCtx?.events?.emit?.('blockHit', { pos: hitPos, blockId, stage });
      playSfx(tapCtx, opts.sfxHit || 'hit_stone', { pos: hitPos, pitch: 0.92 + hits * 0.1 });
      tapCtx?.fx?.burst?.(hitPos, opts.fxColor ?? blockId ?? color, 4);
      opts.onHit?.(hits, taps, api);
      return true;
    }

    broken = true;
    group.visible = false;
    unpick();
    if (opts.clearWorldBlock) {
      tapCtx?.world?.setBlock?.(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), opts.replaceBlockId ?? 0);
    }
    tapCtx?.events?.emit?.('blockBreak', { pos: hitPos, blockId });
    playSfx(tapCtx, opts.sfxBreak || 'break', { pos: hitPos });
    tapCtx?.fx?.burst?.(hitPos, opts.fxColor ?? blockId ?? color, 14);
    opts.onBreak?.(api);
    return true;
  }

  function update(dt) {
    if (broken) return;
    if (wobble > 0) {
      wobble = Math.max(0, wobble - dt);
      const s = 1 + Math.sin(wobble * 42) * 0.12;
      group.scale.set(s, 2 - s, s);
    } else {
      group.scale.set(1, 1, 1);
    }
  }

  function matchesHit(hit) {
    if (broken || !hit) return false;
    if (hit.targetId === id || hit.id === id) return true;
    if (hit.pos && dist3(hit.pos, { x: pos.x, y: pos.y + sy * 0.5, z: pos.z }) <= (opts.hitRadius ?? 1.45)) {
      return true;
    }
    return false;
  }

  function target() {
    if (broken) return null;
    return {
      id,
      pos: { x: pos.x, y: pos.y + sy * 0.5, z: pos.z },
      kind: 'block',
      label,
      range: opts.range ?? 2.5,
    };
  }

  function destroy() {
    broken = true;
    unpick();
    detachFromScene(group);
  }

  const api = {
    id,
    pos,
    group,
    get hits() {
      return hits;
    },
    get taps() {
      return taps;
    },
    get broken() {
      return broken;
    },
    tap,
    update,
    matchesHit,
    target,
    destroy,
  };
  return api;
}

// ---------------------------------------------------------------------------
// 2. Collectible Item (bob + spin + sparkle + auto-pickup + optional TTL)
// ---------------------------------------------------------------------------

export function createCollectible(ctx, opts = {}) {
  const id = opts.id || 'collectible';
  const pos = { x: opts.pos?.x ?? 0, y: opts.pos?.y ?? 8, z: opts.pos?.z ?? 0 };
  const size = opts.size ?? 0.38;
  const color = opts.color ?? 0xff6b9d;
  const stemColor = opts.stemColor ?? null;
  let isSparkly = opts.sparkle !== false;
  let curAutoPickup = opts.autoPickupRadius ?? 1.65;
  const ttl = opts.ttl ?? 0;
  const sparkleTtl = opts.sparkleTtl ?? 0;
  const item = opts.item || 'item';
  let curLabel = opts.label || '物品';

  const group = new THREE.Group();
  group.position.set(pos.x, pos.y + 0.45, pos.z);

  let petalsMesh = null;
  if (stemColor !== null) {
    // Cute voxel flower silhouette (green stem + bright blossom head)
    const stem = new THREE.Mesh(sharedBoxGeo(0.12, 0.36, 0.12), sharedLambertMat(stemColor));
    stem.position.y = -0.14;
    group.add(stem);
    petalsMesh = new THREE.Mesh(sharedBoxGeo(size, size * 0.65, size), sharedLambertMat(color));
    petalsMesh.position.y = 0.1;
    group.add(petalsMesh);
    const center = new THREE.Mesh(
      sharedBoxGeo(size * 0.45, size * 0.72, size * 0.45),
      sharedBasicMat(opts.accentColor ?? 0xfff3b0)
    );
    center.position.y = 0.12;
    group.add(center);
  } else {
    const gem = new THREE.Mesh(sharedBoxGeo(size, size, size), sharedLambertMat(color));
    group.add(gem);
  }

  let haloMesh = null;
  if (isSparkly) {
    haloMesh = new THREE.Mesh(
      sharedBoxGeo(size * 1.45, 0.06, size * 1.45),
      sharedBasicMat(opts.sparkleColor ?? 0xffe066, { opacity: 0.65, transparent: true })
    );
    haloMesh.position.y = -0.24;
    group.add(haloMesh);
  }

  attachToScene(ctx, group);
  const unpick = registerPick(ctx, group, {
    id,
    targetId: id,
    kind: 'entity',
    label: curLabel,
    hitRadius: 1.0,
  });

  let age = opts.phaseOffset ?? 0;
  let life = 0;
  let collected = false;
  let expired = false;

  function stopSparkle() {
    if (!isSparkly) return;
    isSparkly = false;
    curAutoPickup = 0;
    curLabel = opts.fadedLabel || '小花';
    if (haloMesh) haloMesh.visible = false;
    group.visible = true;
    if (petalsMesh) petalsMesh.scale.set(0.7, 0.7, 0.7);
    opts.onStopSparkle?.(api);
  }

  function collect(collectCtx = ctx) {
    if (collected || expired) return false;
    collected = true;
    group.visible = false;
    unpick();
    const cPos = { x: pos.x, y: pos.y + 0.5, z: pos.z };
    collectCtx?.events?.emit?.('collect', { item, count: 1, pos: cPos });
    collectCtx?.events?.emit?.('feedback', { kind: 'collect', pos: cPos });
    playSfx(collectCtx, opts.sfx || 'xp', { pos: cPos, pitch: opts.pitch ?? 1.0 });
    collectCtx?.fx?.sparkles?.(cPos, 8, { toPlayer: true });
    opts.onCollect?.(api);
    return true;
  }

  function update(dt, updateCtx = ctx) {
    if (collected || expired) return;
    age += dt;
    life += dt;
    if (isSparkly && sparkleTtl > 0 && life >= sparkleTtl) {
      stopSparkle();
    }
    if (ttl > 0 && life >= ttl) {
      expired = true;
      group.visible = false;
      unpick();
      opts.onExpire?.(api);
      return;
    }
    const bobAmp = isSparkly ? (opts.bobAmp ?? 0.12) : 0.03;
    const bob = Math.sin(age * 3.8) * bobAmp;
    group.position.set(pos.x, pos.y + 0.45 + bob, pos.z);
    group.rotation.y = isSparkly ? age * 2.1 : age * 0.5;
    if (haloMesh && haloMesh.visible) {
      const s = 0.88 + 0.22 * Math.sin(age * 6.2);
      haloMesh.scale.set(s, 1, s);
    }
    if (isSparkly && sparkleTtl > 0 && sparkleTtl - life < 1.5) {
      if (haloMesh) haloMesh.visible = Math.floor((sparkleTtl - life) * 10) % 2 === 0;
    } else if (ttl > 0 && ttl - life < 1.5) {
      group.visible = Math.floor((ttl - life) * 10) % 2 === 0;
    }
    if (curAutoPickup > 0) {
      const pPos = playerPos(updateCtx);
      if (distXZ(pPos, pos) <= curAutoPickup) {
        collect(updateCtx);
      }
    }
  }

  function matchesHit(hit) {
    if (collected || expired || !hit) return false;
    if (hit.targetId === id || hit.id === id) return true;
    if (hit.pos && distXZ(hit.pos, pos) <= (opts.hitRadius ?? 1.4)) return true;
    return false;
  }

  function target() {
    if (collected || expired) return null;
    return {
      id,
      pos: { x: pos.x, y: pos.y + 0.4, z: pos.z },
      kind: 'entity',
      label: curLabel,
      range: opts.range ?? 2.5,
    };
  }

  function destroy() {
    collected = true;
    unpick();
    detachFromScene(group);
  }

  const api = {
    id,
    pos,
    group,
    get sparkle() {
      return isSparkly;
    },
    get collected() {
      return collected;
    },
    get expired() {
      return expired;
    },
    stopSparkle,
    tap: collect,
    collect,
    update,
    matchesHit,
    target,
    destroy,
  };
  return api;
}

// ---------------------------------------------------------------------------
// 3. Ghost Slot Placement (glowing outline -> solid voxel block on tap)
// ---------------------------------------------------------------------------

export function createGhostSlot(ctx, opts = {}) {
  const id = opts.id || 'slot';
  const pos = { x: opts.pos?.x ?? 0, y: opts.pos?.y ?? 8, z: opts.pos?.z ?? 0 };
  const size = opts.size ?? 0.96;
  const ghostColor = opts.ghostColor ?? 0x74c0fc;
  const placedColor = opts.placedColor ?? 0xdcdcdc;
  const blockId = opts.blockId ?? 1;
  const label = opts.label || '放置';

  const group = new THREE.Group();
  group.position.set(pos.x, pos.y + size * 0.5, pos.z);

  const ghostFill = new THREE.Mesh(
    sharedBoxGeo(size * 0.92, size * 0.92, size * 0.92),
    sharedBasicMat(ghostColor, { opacity: 0.35, transparent: true })
  );
  const ghostWire = new THREE.Mesh(
    sharedBoxGeo(size, size, size),
    sharedBasicMat(0xffffff, { wireframe: true, opacity: 0.85, transparent: true })
  );
  const solidMesh = new THREE.Mesh(
    sharedBoxGeo(size, size, size),
    sharedLambertMat(placedColor)
  );
  solidMesh.visible = false;

  group.add(ghostFill, ghostWire, solidMesh);
  attachToScene(ctx, group);

  const unpick = registerPick(ctx, group, {
    id,
    targetId: id,
    kind: 'block',
    label,
    hitRadius: 1.0,
  });

  let placed = false;
  let pulse = 0;
  let popTimer = 0;

  function place(placeCtx = ctx) {
    if (placed) return false;
    placed = true;
    popTimer = 0.24;
    ghostFill.visible = false;
    ghostWire.visible = false;
    solidMesh.visible = true;
    unpick();

    const pPos = { x: pos.x, y: pos.y + size * 0.5, z: pos.z };
    if (opts.setWorldBlock && opts.worldBlockId != null) {
      placeCtx?.world?.setBlock?.(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), opts.worldBlockId);
    }
    placeCtx?.events?.emit?.('blockPlace', { pos: pPos, blockId });
    playSfx(placeCtx, opts.sfxPlace || 'hit_stone', { pos: pPos, pitch: 1.15 });
    placeCtx?.fx?.sparkles?.(pPos, 6, { toPlayer: false });
    opts.onPlace?.(api);
    return true;
  }

  function update(dt) {
    pulse += dt;
    if (!placed) {
      const s = 0.94 + Math.sin(pulse * 5.0) * 0.06;
      group.scale.set(s, s, s);
    } else if (popTimer > 0) {
      popTimer = Math.max(0, popTimer - dt);
      const s = 1 + Math.sin((popTimer / 0.24) * Math.PI) * 0.22;
      group.scale.set(s, s, s);
    } else {
      group.scale.set(1, 1, 1);
    }
  }

  function matchesHit(hit) {
    if (placed || !hit) return false;
    if (hit.targetId === id || hit.id === id) return true;
    if (hit.pos && dist3(hit.pos, { x: pos.x, y: pos.y + size * 0.5, z: pos.z }) <= (opts.hitRadius ?? 1.45)) {
      return true;
    }
    return false;
  }

  function target() {
    if (placed) return null;
    return {
      id,
      pos: { x: pos.x, y: pos.y + size * 0.5, z: pos.z },
      kind: 'block',
      label,
      range: opts.range ?? 2.5,
    };
  }

  function destroy() {
    unpick();
    detachFromScene(group);
  }

  const api = {
    id,
    pos,
    group,
    get placed() {
      return placed;
    },
    tap: place,
    place,
    update,
    matchesHit,
    target,
    destroy,
  };
  return api;
}

// ---------------------------------------------------------------------------
// 4. Deterministic Waypoint Patrol
// ---------------------------------------------------------------------------

export function createPatrol(waypoints = [], opts = {}) {
  const pts = waypoints.length > 0 ? waypoints.map((p) => ({ x: p.x, y: p.y ?? 8, z: p.z })) : [{ x: 48, y: 8, z: 48 }];
  const speed = opts.speed ?? 2.2;
  const pauseSec = opts.pauseSec ?? 0.35;
  const pingPong = !!opts.pingPong;

  const pos = { x: pts[0].x, y: pts[0].y, z: pts[0].z };
  let idx = pts.length > 1 ? 1 : 0;
  let dir = 1;
  let wait = 0;
  let heading = 0;
  let moving = false;

  function reset() {
    pos.x = pts[0].x;
    pos.y = pts[0].y;
    pos.z = pts[0].z;
    idx = pts.length > 1 ? 1 : 0;
    dir = 1;
    wait = 0;
    moving = false;
  }

  function advanceIndex() {
    if (pts.length <= 1) return;
    if (pingPong) {
      if (idx + dir >= pts.length || idx + dir < 0) dir = -dir;
      idx += dir;
    } else {
      idx = (idx + 1) % pts.length;
    }
  }

  function step(dt, actor = null) {
    if (pts.length <= 1) {
      moving = false;
      if (actor?.group) actor.group.position.set(pos.x, pos.y, pos.z);
      return pos;
    }
    if (wait > 0) {
      wait = Math.max(0, wait - dt);
      moving = false;
      actor?.setAnim?.('idle');
      if (actor?.group) actor.group.position.set(pos.x, pos.y, pos.z);
      return pos;
    }

    const goal = pts[idx];
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dy = (goal.y ?? pos.y) - pos.y;
    const d = Math.hypot(dx, dz);
    const stepLen = speed * dt;

    if (d <= Math.max(0.05, stepLen)) {
      pos.x = goal.x;
      pos.y = goal.y ?? pos.y;
      pos.z = goal.z;
      wait = pauseSec;
      moving = false;
      advanceIndex();
    } else {
      pos.x += (dx / d) * stepLen;
      pos.z += (dz / d) * stepLen;
      pos.y += dy * Math.min(1, stepLen / Math.max(0.1, d));
      heading = Math.atan2(dx, dz);
      moving = true;
    }

    if (actor) {
      if (actor.group) actor.group.position.set(pos.x, pos.y, pos.z);
      actor.lookAt?.(goal);
      actor.setAnim?.(moving ? 'walk' : 'idle');
      actor.update?.(dt);
    }
    return pos;
  }

  return {
    pos,
    get index() {
      return idx;
    },
    get heading() {
      return heading;
    },
    get moving() {
      return moving;
    },
    reset,
    step,
  };
}

// ---------------------------------------------------------------------------
// 5. Beacon Visual (light pillar + bouncing arrow at pointer())
// ---------------------------------------------------------------------------

export function createBeaconVisual(ctx) {
  const group = new THREE.Group();
  group.visible = false;

  const pillar = new THREE.Mesh(
    sharedCylinderGeo(0.28, 0.42, 9.0, 8),
    sharedBasicMat(0xffe066, { opacity: 0.26, transparent: true })
  );
  pillar.position.y = 4.5;

  const ring = new THREE.Mesh(
    sharedCylinderGeo(0.85, 0.85, 0.08, 12),
    sharedBasicMat(0xffd43b, { opacity: 0.55, transparent: true })
  );
  ring.position.y = 0.08;

  const arrowGroup = new THREE.Group();
  const arrowShaft = new THREE.Mesh(sharedBoxGeo(0.24, 0.55, 0.24), sharedBasicMat(0xffe066));
  arrowShaft.position.y = 0.35;
  const arrowTip = new THREE.Mesh(sharedCylinderGeo(0.45, 0.04, 0.48, 4), sharedBasicMat(0xff922b));
  arrowTip.position.y = -0.05;
  arrowGroup.add(arrowShaft, arrowTip);
  arrowGroup.position.y = 2.4;

  group.add(pillar, ring, arrowGroup);
  attachToScene(ctx, group);

  let t = 0;

  function update(dt, targetPos, showCtx = ctx) {
    if (showCtx?.scene && group.parent !== showCtx.scene) {
      showCtx.scene.add(group);
    }
    if (!targetPos || showCtx?.state?.scene !== 'world') {
      group.visible = false;
      return;
    }
    t += dt;
    group.visible = true;
    const baseY = targetPos.y ?? 8;
    group.position.set(targetPos.x, baseY, targetPos.z);
    arrowGroup.position.y = 2.25 + Math.sin(t * 4.2) * 0.32;
    arrowGroup.rotation.y = t * 1.8;
    const rs = 0.85 + Math.sin(t * 3.5) * 0.18;
    ring.scale.set(rs, 1, rs);
  }

  function destroy() {
    detachFromScene(group);
  }

  return { group, update, destroy };
}
