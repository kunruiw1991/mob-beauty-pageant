// Quest Manager per docs/DESIGN.md §3.5, §6, §11 (owner: quests-a).
// Handles quest activation (zone entry + beacon contestant tap), 3D beacon pointer,
// walk-to-interact range (2.5b), objective/action UI plumbing, gag recording, and completion -> core flow.

import { ROSTER_BY_ID } from '../data/roster.js';
import {
  poi,
  surfaceY,
  playerPos,
  isPlayerMoving,
  setPlayerSneak,
  movePlayerTo,
  teleportPlayerTo,
  distXZ,
  dist3,
  simTime,
  playSfx,
  registerPick,
  createBeaconVisual,
} from './kit.js';

export function buildQuestManager(ctx, mainQuests = [], hiddenQuests = [], createHiddenCtrl = null) {
  const allQuests = [...mainQuests, ...hiddenQuests];
  const questById = new Map(allQuests.map((q) => [q.id, q]));

  let activeQuest = null;
  let activeStartedSec = 0;
  let activeStep = 0;
  let pendingTap = null;

  let lastObjSig = '';
  let lastActSig = '';

  const beacon = createBeaconVisual(ctx);
  const hiddenCtrl = typeof createHiddenCtrl === 'function' ? createHiddenCtrl(ctx) : null;

  // Optional beacon preview actors in hub when a quest is 'available' before activation
  const previewActors = new Map();
  const previewUnpicks = new Map();
  let currentPreviewId = null;

  // #155 G2: 1.0 s quest-start camera intro (0.5s '?' cape-flip on plaza podium + 0.5s contestant intro)
  let introTimer = 0;
  let introStage = 'none'; // 'cape' | 'contestant' | 'none'
  let introContestantPos = null;

  function clearIntroFocus() {
    if (introTimer > 0 || introStage !== 'none') {
      introTimer = 0;
      introStage = 'none';
      introContestantPos = null;
      if (!ctx?.state?.gagCam?.active) {
        ctx?.cam?.clearFocus?.();
      }
    }
  }

  function ensureState() {
    if (!ctx?.state) return;
    if (!ctx.state.quests) ctx.state.quests = {};
    for (let i = 0; i < mainQuests.length; i++) {
      const q = mainQuests[i];
      if (!ctx.state.quests[q.id]) {
        ctx.state.quests[q.id] = {
          status: i === 0 ? 'available' : 'locked',
          ms: 0,
          gags: [],
        };
      } else if (!Array.isArray(ctx.state.quests[q.id].gags)) {
        ctx.state.quests[q.id].gags = [];
      }
    }
    for (const hq of hiddenQuests) {
      if (!ctx.state.quests[hq.id]) {
        ctx.state.quests[hq.id] = { status: 'available', ms: 0, gags: [] };
      } else if (!Array.isArray(ctx.state.quests[hq.id].gags)) {
        ctx.state.quests[hq.id].gags = [];
      }
    }
  }

  // Record every emitted gag into state.quests[questId].gags (covers both quests-a & quests-b)
  ctx?.events?.on?.('gag', (payload) => {
    const qid = payload?.questId || activeQuest?.id;
    const gid = payload?.gagId;
    if (!qid || !gid || !ctx?.state) return;
    ensureState();
    const rec = ctx.state.quests?.[qid];
    if (rec && Array.isArray(rec.gags) && !rec.gags.includes(gid)) {
      rec.gags.push(gid);
    }
  });

  ctx?.events?.on?.('questStep', (payload) => {
    if (payload?.id === activeQuest?.id && typeof payload.step === 'number') {
      activeStep = payload.step;
    }
  });

  function next() {
    ensureState();
    for (const q of mainQuests) {
      const st = ctx?.state?.quests?.[q.id]?.status;
      if (st !== 'done') return q.id;
    }
    return null;
  }

  function getBeaconStartPos(q) {
    if (!q) return null;
    // §6.1 Tutorial: first beacon (sheep) is 6 blocks south of spawn (48, 66) -> (48, y, 72)
    if (q.id === 'sheep') {
      const y = surfaceY(ctx, 48, 72, 8);
      return { x: 48, y, z: 72 };
    }
    // SW Jungle trailhead >= 12b from 喵喵's first jungle log perch (#143, #172 Q1)
    if (q.id === 'cat') {
      return { x: 28.5, y: surfaceY(ctx, 28, 66, 8), z: 66.5 };
    }
    // East cobblestone approach road leading to the cave hill
    if (q.id === 'golem') {
      return { x: 56.5, y: 8, z: 48.5 };
    }
    // NE edge of clearing so approaching 嘶嘶 triggers her 2 shy backoff hops (#143)
    if (q.id === 'creeper') {
      return { x: 35.5, y: 8, z: 52.5 };
    }
    const curArea = ctx?.state?.area || 'hub';
    if (curArea === 'hub' && q.area === 'end') {
      return poi(ctx, 'endPortal', { x: 20, y: 8, z: 18 });
    }
    if (curArea === 'hub' && q.area === 'nether') {
      return poi(ctx, 'netherPortal', { x: 12, y: 8, z: 30 });
    }
    return poi(ctx, q.poi);
  }

  function hidePreviewActor() {
    if (currentPreviewId && previewActors.has(currentPreviewId)) {
      const actor = previewActors.get(currentPreviewId);
      actor?.setVisible?.(false);
      previewUnpicks.get(currentPreviewId)?.();
      previewUnpicks.delete(currentPreviewId);
    }
    currentPreviewId = null;
  }

  function syncPreviewActor(q, pos) {
    if (!q || !pos || ctx?.state?.scene !== 'world') {
      hidePreviewActor();
      return;
    }
    // Only show contestant preview in hub for hub-based quests (portals already stand in NW shrine)
    const curArea = ctx?.state?.area || 'hub';
    if (q.area !== curArea) {
      hidePreviewActor();
      return;
    }
    if (currentPreviewId !== q.id) {
      hidePreviewActor();
      let actor = previewActors.get(q.id) || null;
      if (!actor && typeof ctx?.chars?.create === 'function') {
        actor = ctx.chars.create(q.contestantId, { id: `beacon_${q.id}` });
        if (actor?.group && ctx?.scene && !actor.group.parent) {
          ctx.scene.add(actor.group);
        }
        if (actor) previewActors.set(q.id, actor);
      }
      if (actor) {
        actor.setVisible?.(true);
        actor.setAnim?.('wave');
        if (actor.group) {
          actor.group.position.set(pos.x, pos.y, pos.z);
          const unp = registerPick(ctx, actor.group, {
            id: `beacon_${q.id}`,
            targetId: `beacon_${q.id}`,
            entityId: q.contestantId,
            kind: 'entity',
            label: ROSTER_BY_ID[q.contestantId]?.name || q.id,
            hitRadius: 1.2,
          });
          previewUnpicks.set(q.id, unp);
        }
      }
      currentPreviewId = q.id;
    } else {
      const actor = previewActors.get(q.id);
      if (actor?.group) {
        actor.group.position.set(pos.x, pos.y, pos.z);
        actor.lookAt?.(playerPos(ctx));
      }
    }
  }

  function syncUI(obj, act) {
    const objSig = obj ? `${obj.icon}:${obj.have}:${obj.need}` : 'null';
    if (objSig !== lastObjSig) {
      lastObjSig = objSig;
      ctx?.ui?.setObjective?.(obj || null);
    }
    const actSig = act?.icon ? `${act.icon}` : 'null';
    if (actSig !== lastActSig) {
      lastActSig = actSig;
      ctx?.ui?.setAction?.(act || null, act ? () => onAction() : null);
    }
  }

  function computeSafePointer(q) {
    if (!q) return null;
    const rawPtr = q.pointer?.(ctx);
    if (rawPtr && Number.isFinite(rawPtr.x) && Number.isFinite(rawPtr.z)) {
      return { x: rawPtr.x, y: rawPtr.y ?? 9, z: rawPtr.z };
    }
    const ts = q.targets?.(ctx);
    if (Array.isArray(ts) && ts.length > 0 && ts[0]?.pos) {
      return { x: ts[0].pos.x, y: (ts[0].pos.y ?? 8) + 1, z: ts[0].pos.z };
    }
    const fallback = getBeaconStartPos(q) || { x: 48, y: 9, z: 48 };
    return { x: fallback.x, y: (fallback.y ?? 8) + 1, z: fallback.z };
  }

  function syncActiveState() {
    if (!ctx?.state) return;
    if (!activeQuest) {
      ctx.state.quest = null;
      syncUI(null, null);
      return;
    }
    const obj = activeQuest.objective?.(ctx) || { icon: '⭐', have: 0, need: 1 };
    const act = activeQuest.action?.(ctx) || null;
    const ptr = computeSafePointer(activeQuest);

    ctx.state.quest = {
      id: activeQuest.id,
      step: activeStep,
      progress: obj.have ?? 0,
      need: obj.need ?? 1,
      startedMs: Math.round(activeStartedSec * 1000),
      pointer: ptr,
    };
    syncUI(obj, act);
  }

  function activate(id) {
    ensureState();
    const q = questById.get(id);
    if (!q) return false;
    if (activeQuest && activeQuest.id === id) {
      syncActiveState();
      return true;
    }
    if (activeQuest) {
      try {
        activeQuest.cleanup?.(ctx);
      } catch (_) {}
      if (ctx?.state?.quests?.[activeQuest.id]?.status === 'active') {
        ctx.state.quests[activeQuest.id].status = 'available';
      }
      activeQuest = null;
    }

    pendingTap = null;
    clearIntroFocus();
    setPlayerSneak(ctx, false);
    hidePreviewActor();

    activeQuest = q;
    activeStartedSec = simTime(ctx);
    activeStep = 0;

    if (ctx?.state) {
      if (ctx.state.quests[id]) {
        ctx.state.quests[id].status = 'active';
      }
      if (ctx.state.contestants?.[q.contestantId]) {
        ctx.state.contestants[q.contestantId].met = true;
      }
      if (ctx.state.firstMetMs === null || ctx.state.firstMetMs === undefined) {
        ctx.state.firstMetMs = Math.max(1, Math.round(simTime(ctx) * 1000));
      }
    }

    ctx?.chars?.capes?.reveal?.(q.contestantId);
    q.start?.(ctx);
    syncActiveState();

    // #155 G2: 1.0 s camera intro on '?' cape flip + contestant
    const rawIntro = q.introPos?.(ctx) || computeSafePointer(q) || getBeaconStartPos(q);
    introContestantPos = rawIntro
      ? { x: rawIntro.x, y: rawIntro.y ?? 9.1, z: rawIntro.z }
      : null;
    const curArea = ctx?.state?.area || 'hub';
    const capeSlot =
      curArea === 'hub' ? ctx?.chars?.capes?.entries?.get?.(q.contestantId)?.slot : null;
    if (!ctx?.state?.gagCam?.active && ctx?.cam?.focus) {
      if (capeSlot?.position) {
        introTimer = 1.0;
        introStage = 'cape';
        ctx.cam.focus(
          {
            x: capeSlot.position.x,
            y: (capeSlot.position.y ?? 8) + 1.35,
            z: capeSlot.position.z,
          },
          { distance: 5.2, height: 2.1, instant: true }
        );
      } else if (introContestantPos) {
        introTimer = 1.0;
        introStage = 'contestant';
        ctx.cam.focus(introContestantPos, { distance: 6.0, height: 2.6, instant: true });
      }
    }

    ctx?.events?.emit?.('questStart', { id: q.id, contestantId: q.contestantId });
    playSfx(ctx, 'pickup', { pos: playerPos(ctx), pitch: 1.15 });
    return true;
  }

  function complete(id) {
    ensureState();
    const qid = id || activeQuest?.id;
    const q = questById.get(qid);
    if (!q) return false;

    const wasActive = activeQuest?.id === q.id;
    const alreadyDone = ctx?.state?.quests?.[q.id]?.status === 'done';
    if (!wasActive && alreadyDone) return false;

    const elapsedMs = Math.max(1, Math.round((simTime(ctx) - activeStartedSec) * 1000));
    const finishPos = computeSafePointer(q) || playerPos(ctx);

    clearIntroFocus();
    if (wasActive) {
      try {
        q.cleanup?.(ctx);
      } catch (_) {}
      activeQuest = null;
    }
    pendingTap = null;
    setPlayerSneak(ctx, false);

    if (ctx?.state) {
      if (ctx.state.quests[q.id]) {
        ctx.state.quests[q.id].status = 'done';
        ctx.state.quests[q.id].ms = elapsedMs;
      }
      if (ctx.state.contestants?.[q.contestantId]) {
        ctx.state.contestants[q.contestantId].met = true;
        if (q.hidden) ctx.state.contestants[q.contestantId].found = true;
      }
      // Unlock next main quest
      const nextMainId = next();
      if (nextMainId && ctx.state.quests[nextMainId]?.status === 'locked') {
        ctx.state.quests[nextMainId].status = 'available';
      }
      ctx.state.quest = null;
    }

    syncUI(null, null);
    beacon.update(0, null, ctx);

    // §9 & §11 F13: >= 60 particles + >= 1 sfx within 0.5 s on questComplete
    ctx?.fx?.confetti?.(finishPos, 48);
    ctx?.fx?.hearts?.(finishPos, 18);
    ctx?.fx?.sparkles?.(finishPos, 16, { toPlayer: true });
    playSfx(ctx, 'fanfare', { pos: finishPos });

    if (q.hidden) {
      ctx?.events?.emit?.('hiddenFound', { id: q.contestantId });
    }
    ctx?.events?.emit?.('questComplete', {
      id: q.id,
      contestantId: q.contestantId,
      hidden: Boolean(q.hidden),
      ms: elapsedMs,
    });
    return true;
  }

  function targets() {
    ensureState();
    if (activeQuest) {
      const list = activeQuest.targets?.(ctx);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((t, idx) => ({
          id: t.id || `${activeQuest.id}_t${idx}`,
          pos: { x: t.pos?.x ?? 48, y: t.pos?.y ?? 8, z: t.pos?.z ?? 48 },
          kind: t.kind || 'entity',
          label: t.label || activeQuest.id,
          range: t.range,
          ranged: Boolean(t.ranged),
        }));
      }
      // Guarantee targets() is NEVER empty while active (§3.5, §11)
      const ptr = computeSafePointer(activeQuest);
      return [
        {
          id: `${activeQuest.id}_wait`,
          pos: ptr,
          kind: 'entity',
          label: ROSTER_BY_ID[activeQuest.contestantId]?.name || activeQuest.id,
          range: 3.0,
        },
      ];
    }

    // Between quests in world: expose next available quest's beacon contestant so F1 autoplay works
    const nextId = next();
    if (nextId) {
      const nq = questById.get(nextId);
      const bPos = getBeaconStartPos(nq);
      if (bPos) {
        return [
          {
            id: `beacon_${nextId}`,
            pos: { x: bPos.x, y: bPos.y + 0.8, z: bPos.z },
            kind: 'entity',
            label: ROSTER_BY_ID[nq.contestantId]?.name || nextId,
            range: 3.5,
          },
        ];
      }
    }
    return [];
  }

  function normalizeHit(rawHit) {
    if (!rawHit) return null;
    const pickMeta = rawHit.object?.userData?.pick || rawHit.entity?.userData?.pick || null;
    const pos = rawHit.pos ||
      rawHit.point ||
      rawHit.position ||
      rawHit.object?.position || { x: playerPos(ctx).x, y: playerPos(ctx).y, z: playerPos(ctx).z };
    const hit = {
      ...rawHit,
      kind: rawHit.kind || pickMeta?.kind || 'entity',
      targetId: rawHit.targetId || pickMeta?.targetId || rawHit.object?.userData?.targetId || rawHit.id || null,
      entityId: rawHit.entityId || pickMeta?.entityId || rawHit.actor?.id || rawHit.object?.userData?.entityId || null,
      pos: { x: pos.x ?? 0, y: pos.y ?? 8, z: pos.z ?? 0 },
    };

    // Match against current targets() by id, entityId, or proximity
    const curTargets = targets();
    let matched = null;
    if (hit.targetId) {
      matched = curTargets.find((t) => t.id === hit.targetId) || null;
    }
    if (!matched && hit.entityId) {
      matched = curTargets.find((t) => t.id === hit.entityId || t.id.endsWith(`_${hit.entityId}`)) || null;
    }
    if (!matched && hit.pos) {
      let bestD = 1.85;
      for (const t of curTargets) {
        const d = dist3(hit.pos, t.pos);
        if (d <= bestD) {
          bestD = d;
          matched = t;
        }
      }
    }
    if (matched) {
      hit.targetId = matched.id;
      hit.target = matched;
    }
    return hit;
  }

  function dispatchImmediateTap(hit) {
    // Check beacon activation tap when between quests
    if (!activeQuest && hit.targetId?.startsWith('beacon_')) {
      const qid = hit.targetId.slice('beacon_'.length);
      if (activate(qid)) {
        ctx?.events?.emit?.('feedback', { kind: 'interact', pos: hit.pos });
        return true;
      }
    }

    // Check passive hidden triggers in world when not in that hidden quest
    if (hiddenCtrl && hiddenCtrl.onTap(hit, ctx)) {
      ctx?.events?.emit?.('feedback', { kind: 'interact', pos: hit.pos });
      return true;
    }

    if (activeQuest) {
      const handled = Boolean(activeQuest.onTap?.(hit, ctx));
      if (activeQuest) syncActiveState();
      if (handled) {
        ctx?.events?.emit?.('feedback', { kind: 'interact', pos: hit.pos });
        return true;
      }
    }
    return false;
  }

  function onTap(rawHit) {
    if (!rawHit) return false;
    if (rawHit._questHandled) return true;
    ensureState();

    const hit = normalizeHit(rawHit);
    if (!hit) return false;

    // Only intercept world taps that correspond to a quest/beacon/hidden target or are already within range
    const matched = hit.target;
    const pPos = playerPos(ctx);
    const isRanged = Boolean(matched?.ranged) || hit.targetId === 'snow_kai';
    const range = isRanged ? (matched?.range ?? 25.0) : Math.min(2.5, matched?.range ?? 2.5);
    const dXZ = distXZ(pPos, hit.pos);

    if (matched) {
      rawHit._questHandled = true;
      if (isRanged || dXZ <= range) {
        pendingTap = null;
        return dispatchImmediateTap(hit);
      }
      // If already walking smoothly toward this exact stationary target, don't reset path/waypoints!
      if (
        pendingTap &&
        pendingTap.hit?.targetId === matched.id &&
        distXZ(pendingTap.goalPos, matched.pos) < 0.85 &&
        isPlayerMoving(ctx)
      ) {
        pendingTap.hit = hit;
        pendingTap.range = range;
        ctx?.events?.emit?.('feedback', { kind: 'walk', pos: matched.pos });
        return true;
      }
      // Walk to within 2.5b range, then interact (§6, #143 rule 1)
      pendingTap = {
        questId: activeQuest?.id || null,
        hit,
        goalPos: { ...matched.pos },
        range,
        lastDist: dXZ,
        stuckSec: 0,
        retried: false,
      };
      movePlayerTo(ctx, matched.pos);
      ctx?.events?.emit?.('feedback', { kind: 'walk', pos: matched.pos });
      return true;
    }

    // Even without a pre-matched target, allow activeQuest/hiddenCtrl a chance strictly within 2.5b melee range
    if (dXZ <= 2.5) {
      const ok = dispatchImmediateTap(hit);
      if (ok) rawHit._questHandled = true;
      return ok;
    }
    return false;
  }

  function tapTarget(targetId) {
    ensureState();
    const list = targets();
    if (list.length === 0) return false;
    const chosen = (targetId && list.find((t) => t.id === targetId)) || list[0];
    if (!chosen) return false;
    return onTap({
      kind: chosen.kind || 'entity',
      id: chosen.id,
      targetId: chosen.id,
      pos: { ...chosen.pos },
      target: chosen,
      fromAgent: true,
    });
  }

  function onAction() {
    if (!activeQuest) return false;
    activeQuest.onAction?.(ctx);
    if (activeQuest) syncActiveState();
    return true;
  }

  function teleport(questId) {
    ensureState();
    const q = questById.get(questId);
    if (!q) return false;
    const destArea = q.area || 'hub';
    let spawnPos;
    if (questId === 'dragon') {
      spawnPos = { x: 150.5, y: 8, z: 30.5 };
    } else if (questId === 'golem') {
      spawnPos = { x: 56.5, y: 8, z: 48.5 };
    } else if (questId === 'cat') {
      spawnPos = { x: 28.5, y: surfaceY(ctx, 28, 66, 8), z: 66.5 };
    } else if (questId === 'creeper') {
      spawnPos = { x: 35.5, y: 8, z: 52.5 };
    } else {
      const basePoi = poi(ctx, q.poi);
      // Offset slightly south (+z) so player stands right in front of the quest start
      spawnPos = {
        x: basePoi.x,
        y: surfaceY(ctx, basePoi.x, basePoi.z + 2, basePoi.y ?? 8),
        z: basePoi.z + 2,
      };
    }
    teleportPlayerTo(ctx, spawnPos, destArea);
    return activate(questId);
  }

  function reset() {
    if (activeQuest) {
      try {
        activeQuest.cleanup?.(ctx);
      } catch (_) {}
      activeQuest = null;
    }
    pendingTap = null;
    clearIntroFocus();
    setPlayerSneak(ctx, false);
    hidePreviewActor();
    lastObjSig = '';
    lastActSig = '';
    beacon.update(0, null, ctx);
    ensureState();
  }

  function update(dt) {
    ensureState();
    // Detect external state reset (e.g. resetStateInPlace on new game)
    if (activeQuest && ctx?.state && ctx.state.quests?.[activeQuest.id]?.status !== 'active') {
      try {
        activeQuest.cleanup?.(ctx);
      } catch (_) {}
      activeQuest = null;
      pendingTap = null;
      lastObjSig = '';
      lastActSig = '';
    }

    const inWorld = !ctx?.state?.scene || ctx.state.scene === 'world';
    if (!inWorld) {
      beacon.update(dt, null, ctx);
      hidePreviewActor();
      return;
    }

    // Update passive hidden controller (sparkle hints after quest 5 + world tulip/egg)
    hiddenCtrl?.update?.(dt, ctx);

    // Built-in fallback movement only if core's player module has no path walker yet
    if (pendingTap && !ctx?.player?.walkTo && !ctx?.player?.moveTo && ctx?.state?.player) {
      const goal = pendingTap.hit.pos;
      const sp = ctx.state.player;
      const dx = goal.x - sp.x;
      const dz = goal.z - sp.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, 4.5 * dt);
        sp.x += (dx / d) * step;
        sp.z += (dz / d) * step;
        sp.y = surfaceY(ctx, sp.x, sp.z, sp.y ?? 8);
        sp.moving = d - step > 0.1;
      } else {
        sp.moving = false;
      }
    }

    // Process queued walk-then-interact tap (strict <= 2.5b melee range, zero far instant-dispatch, #143/#145)
    if (pendingTap) {
      if ((pendingTap.questId || null) !== (activeQuest?.id || null)) {
        pendingTap = null;
      } else {
        const liveTargets = targets();
        const live = liveTargets.find((t) => t.id === pendingTap.hit.targetId);
        if (live) {
          // Re-path smoothly when moving target drifts > 0.85b from pathed goalPos
          if (distXZ(live.pos, pendingTap.goalPos) > 0.85) {
            pendingTap.goalPos = { ...live.pos };
            pendingTap.hit.pos = { ...live.pos };
            pendingTap.stuckSec = 0;
            movePlayerTo(ctx, live.pos);
          } else {
            pendingTap.hit.pos = { ...live.pos };
          }
        }
        const pPos = playerPos(ctx);
        const d = distXZ(pPos, pendingTap.hit.pos);
        if (d <= pendingTap.range) {
          const h = pendingTap.hit;
          pendingTap = null;
          dispatchImmediateTap(h);
        } else {
          if (Math.abs(d - pendingTap.lastDist) < 0.015 && !isPlayerMoving(ctx)) {
            pendingTap.stuckSec += dt;
          } else {
            pendingTap.stuckSec = 0;
          }
          pendingTap.lastDist = d;
          if (pendingTap.stuckSec >= 0.45) {
            if (!pendingTap.retried) {
              pendingTap.retried = true;
              pendingTap.stuckSec = 0;
              movePlayerTo(ctx, pendingTap.hit.pos);
            } else {
              pendingTap = null;
            }
          }
        }
      }
    }

    // Auto-activate next available quest when player walks into its start zone
    if (!activeQuest) {
      const nextId = next();
      if (nextId) {
        const nq = questById.get(nextId);
        const startPos = getBeaconStartPos(nq);
        syncPreviewActor(nq, startPos);
        beacon.update(dt, startPos, ctx);
        const pPos = playerPos(ctx);
        // Zone entry radius 5.5 blocks (for sheep at (48,72) vs spawn (48,66) = 6.0 blocks, walking 0.6b forward triggers!)
        if (startPos && (nq.area === (ctx?.state?.area || 'hub') || nq.id === 'ender' || nq.id === 'wither')) {
          if (distXZ(pPos, startPos) <= 5.5) {
            activate(nextId);
          }
        }
      } else {
        hidePreviewActor();
        beacon.update(dt, null, ctx);
      }
    }

    if (activeQuest) {
      hidePreviewActor();
      if (introTimer > 0) {
        introTimer = Math.max(0, introTimer - dt);
        if (introStage === 'cape' && introTimer <= 0.5 && introContestantPos) {
          introStage = 'contestant';
          const liveIntro = activeQuest.introPos?.(ctx) || introContestantPos;
          if (!ctx?.state?.gagCam?.active) {
            ctx?.cam?.focus?.(
              { x: liveIntro.x, y: liveIntro.y ?? 9.1, z: liveIntro.z },
              { distance: 6.0, height: 2.6, instant: true }
            );
          }
        }
        if (introTimer <= 0) {
          clearIntroFocus();
        }
      }
      activeQuest.update?.(dt, ctx);
      if (activeQuest) {
        syncActiveState();
        beacon.update(dt, ctx?.state?.quest?.pointer || computeSafePointer(activeQuest), ctx);
      }
    }
  }

  return {
    activate,
    active: () => activeQuest,
    activeId: () => activeQuest?.id || null,
    complete,
    next,
    update,
    onTap,
    onAction,
    pressAction: onAction,
    targets,
    listTargets: targets,
    tapTarget,
    pointer: () => (activeQuest ? computeSafePointer(activeQuest) : null),
    objective: () => (activeQuest ? activeQuest.objective?.(ctx) || null : null),
    action: () => (activeQuest ? activeQuest.action?.(ctx) || null : null),
    teleport,
    reset,
  };
}

export default buildQuestManager;
