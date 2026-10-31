#!/usr/bin/env python3
"""Section 11 Fun Gates (F1–F14) simulation & verification runner for Mob Beauty Pageant (owner: qa-sims).

Implements both required policies strictly via `window.__PAGEANT__`:
- `ideal`: greedy nearest-target on `listTargets()` + context `pressAction()`
- `random-ish`: random target order, 0.3–1.2 s sim delays, 20 % wasted taps on random world points

Writes JSON report to `/tmp/bv1xyn/qa/gates.json` and markdown table to `/tmp/bv1xyn/qa/gates.md`.

Usage:
  python3 tests/sim_gates.py                    # full 20-seed §11 gate run (F1–F14)
  python3 tests/sim_gates.py --quick            # fast 4-seed subset for CI / iterative checks
  python3 tests/sim_gates.py --seeds 10         # override seed count
  python3 tests/sim_gates.py --gates F1,F2,F11  # run selected gates only
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from layout_audit import audit_viewport_on_session  # noqa: E402
from qa_helpers import (  # noqa: E402
    GATES_JSON_PATH,
    GATES_MD_PATH,
    MAIN_QUESTS,
    QA_TMP_DIR,
    QUEST_IDEAL_FLOORS_S,
    REPO_ROOT,
    TIERS,
    VIEWPORTS,
    QASession,
    ensure_qa_dirs,
    verify_board_tier_mode,
)

INSTALL_SIM_HARNESS_JS = r"""
(() => {
  const mulberry32 = (seed) => {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const hashStr = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  const flushMicro = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  const stepAsync = async (P, frames, chunk = 15) => {
    let rem = Math.max(0, Math.round(frames));
    while (rem > 0) {
      const n = Math.min(chunk, rem);
      P.stepFrames(n);
      rem -= n;
      await flushMicro();
    }
  };

  const dist2D = (a, b) => {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return 10;
    return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
  };

  const hasVisibleActionBtn = () => {
    const cands = document.querySelectorAll(
      '[data-action="context"], #hud-action-btn, .hud-action-btn, #hud-action, .hud-action, .action-btn, [data-hud="action"]'
    );
    for (const el of cands) {
      if (el.hasAttribute('hidden')) continue;
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05 && r.width > 4) {
        return true;
      }
    }
    return false;
  };

  const countCjkViolations = () => {
    const cjkRe = /[\u4e00-\u9fff]/g;
    const hudRoot = document.getElementById('hud') || document.body;
    const out = [];
    for (const el of hudRoot.querySelectorAll('*')) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS') continue;
      if (el.hasAttribute('hidden')) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') <= 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      // Only check world HUD / bubble strings when in world or finale.
      let direct = '';
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) direct += n.textContent || '';
      }
      direct = direct.trim();
      if (!direct) continue;
      const nCjk = (direct.match(cjkRe) || []).length;
      if (nCjk > 12) {
        out.push({ text: direct.slice(0, 30), cjkCount: nCjk });
      }
    }
    return out;
  };

  const stepAndSample = async (P, frames, questId, tracker) => {
    let rem = Math.max(1, Math.round(frames));
    while (rem > 0) {
      const chunk = Math.min(12, rem);
      P.stepFrames(chunk);
      rem -= chunk;
      await flushMicro();
      if (tracker) {
        const s = P.getState();
        const qStat = questId && s.quests && s.quests[questId] ? s.quests[questId].status : null;
        if (s.scene === 'world' && (qStat === 'active' || (s.quest && s.quest.id === questId))) {
          tracker.pointerSamples++;
          const ptr = s.quest && s.quest.pointer;
          if (!ptr || !Number.isFinite(ptr.x) || !Number.isFinite(ptr.z)) {
            tracker.pointerNulls++;
            if (!tracker.firstNullFrame) tracker.firstNullFrame = s.frame;
          }
        }
        if (questId === 'sheep' && tracker.firstMetMs === null) {
          if (s.firstMetMs > 0) {
            tracker.firstMetMs = s.firstMetMs;
          } else if (qStat === 'active' || (s.quest && s.quest.id === 'sheep' && (s.quest.progress > 0 || dist2D(s.player, ptr) <= 8))) {
            tracker.firstMetMs = s.timeMs;
          }
        }
        if (questId === 'ender' && !tracker.stealFired) {
          const gags = (s.quests && s.quests.ender && s.quests.ender.gags) || [];
          if ((s.rival && s.rival.stealDone) || gags.includes('kai_steal')) {
            tracker.stealFired = true;
            tracker.stealMs = s.timeMs;
          }
        }
        if (qStat === 'done' || s.scene === 'booth' || s.scene === 'board') {
          break;
        }
      }
    }
  };

  const walkUntilSettled = async (P, targetPos, questId, tracker, maxExtraFrames = 240, targetId = null, policy = 'ideal') => {
    let s = P.getState();
    const d = dist2D(s.player, targetPos);
    const estSpeed = questId === 'cat' ? 1.5 : 3.8;
    const budget = d > 6 ? Math.min(1200, Math.ceil((d / estSpeed) * 60) + 90) : maxExtraFrames;
    const startStep = s.quest ? s.quest.step : null;
    const startProg = s.quest ? s.quest.progress : null;
    let spent = 0;
    while (spent < budget) {
      s = P.getState();
      const qStat = questId && s.quests && s.quests[questId] ? s.quests[questId].status : null;
      if (qStat === 'done' || s.scene !== 'world') break;
      if (!s.player || !s.player.moving) break;
      if (s.quest && (s.quest.step !== startStep || s.quest.progress !== startProg)) break;
      if (policy === 'ideal') {
        const curTargets = P.listTargets() || [];
        const hasFreeze = curTargets.some(
          (t) => t && (t.kind === 'hold' || /hold_still|freeze|stop/i.test(String(t.id || '')))
        );
        if (hasFreeze) break;
        if (targetId && !curTargets.some((t) => t && t.id === targetId)) break;
      }
      await stepAndSample(P, 10, questId, tracker);
      spent += 10;
    }
  };

  const runQuestEpisode = async (questId, seed, policy, useTeleport, maxSimSec) => {
    const P = window.__PAGEANT__;
    const rng = mulberry32(((seed * 2654435761) >>> 0) ^ hashStr(`${questId}:${policy}`));
    await P.startGame({ seed });
    await flushMicro();
    if (useTeleport) {
      await P.teleport(questId);
      await flushMicro();
    }
    P.stepFrames(6);
    await flushMicro();

    const s0 = P.getState();
    const startMs = s0.timeMs || 0;
    const startFrame = s0.frame || 0;
    const maxFrames = Math.round(maxSimSec * 60);
    const tracker = {
      pointerSamples: 0,
      pointerNulls: 0,
      firstNullFrame: null,
      firstMetMs: (s0.firstMetMs && s0.firstMetMs > 0) ? s0.firstMetMs : null,
      stealFired: Boolean(s0.rival && s0.rival.stealDone),
      stealMs: (s0.rival && s0.rival.stealDone) ? startMs : null,
    };

    let done = false;
    let actionCooldown = 0;
    let guardIters = 0;

    while (guardIters < 2500) {
      guardIters++;
      const s = P.getState();
      const elapsedFrames = (s.frame || 0) - startFrame;
      const qInfo = (s.quests && s.quests[questId]) || {};
      if (qInfo.status === 'done' || s.scene === 'booth' || s.scene === 'board') {
        done = true;
        break;
      }
      if (elapsedFrames >= maxFrames) {
        break;
      }

      if (s.scene !== 'world') {
        await stepAndSample(P, 15, questId, tracker);
        continue;
      }

      // Context action helper (e.g. cake decoy in ender prison).
      if (actionCooldown > 0) actionCooldown--;
      if (actionCooldown === 0 && (hasVisibleActionBtn() || (s.quest && s.quest.action))) {
        if (policy === 'ideal' || rng() < 0.45) {
          await P.pressAction();
          await flushMicro();
          actionCooldown = 6;
          await stepAndSample(P, 12, questId, tracker);
        }
      }

      // Random-ish 20% wasted tap on random world screen coordinates.
      if (policy === 'random' && rng() < 0.20) {
        const rx = Math.round(80 + rng() * (window.innerWidth - 160));
        const ry = Math.round(110 + rng() * (window.innerHeight - 210));
        await P.tapScreen(rx, ry);
        await flushMicro();
        const delayFrames = 18 + Math.floor(rng() * 55); // 0.3s - 1.2s
        await stepAndSample(P, delayFrames, questId, tracker);
        continue;
      }

      const targets = P.listTargets() || [];
      const nonWait = targets.filter(
        (t) => t && t.id !== undefined && t.kind !== 'wait' && !String(t.id).endsWith('_wait')
      );
      if (nonWait.length === 0) {
        const waitT = targets.find((t) => t && String(t.id).endsWith('_wait'));
        if (waitT && dist2D(s.player, waitT.pos) > 3.5 && (!s.player || !s.player.moving)) {
          await P.tapTarget(waitT.id);
          await flushMicro();
          await walkUntilSettled(P, waitT.pos, questId, tracker, 180);
        } else {
          await stepAndSample(P, 15, questId, tracker);
        }
        continue;
      }
      const actionable = nonWait;

      let chosen = actionable[0];
      if (policy === 'ideal') {
        const sorted = [...actionable].sort(
          (a, b) => dist2D(s.player, a.pos) - dist2D(s.player, b.pos)
        );
        chosen = sorted[0];
      } else {
        chosen = actionable[Math.floor(rng() * actionable.length)];
      }

      await P.tapTarget(chosen.id);
      await flushMicro();
      await walkUntilSettled(P, chosen.pos, questId, tracker, policy === 'ideal' ? 300 : 220, chosen.id, policy);

      if (policy === 'ideal') {
        // #143 binding rule 1: ideal agent waits 0.45 s (27 frames @ 60 Hz) between taps (reaction).
        await stepAndSample(P, 27, questId, tracker);
      } else {
        const delayFrames = 18 + Math.floor(rng() * 55); // 0.3s - 1.2s
        await stepAndSample(P, delayFrames, questId, tracker);
      }
    }

    const sEnd = P.getState();
    const endQ = (sEnd.quests && sEnd.quests[questId]) || {};
    if (endQ.status === 'done' || sEnd.scene === 'booth' || sEnd.scene === 'board') {
      done = true;
    }
    if ((sEnd.rival && sEnd.rival.stealDone) || ((endQ.gags || []).includes('kai_steal'))) {
      tracker.stealFired = true;
      if (tracker.stealMs === null) tracker.stealMs = sEnd.timeMs;
    }

    const durationS = Math.round(((sEnd.timeMs - startMs) / 1000) * 100) / 100;
    const firstMetS = tracker.firstMetMs !== null
      ? Math.round(((tracker.firstMetMs - startMs) / 1000) * 100) / 100
      : (done ? durationS : null);
    const prisonRescueS = (done && tracker.stealMs !== null)
      ? Math.round(((sEnd.timeMs - tracker.stealMs) / 1000) * 100) / 100
      : null;

    return {
      seed,
      questId,
      policy,
      done,
      durationS,
      firstMetS,
      stealFired: tracker.stealFired,
      prisonRescueS,
      pointerSamples: tracker.pointerSamples,
      pointerNulls: tracker.pointerNulls,
      firstNullFrame: tracker.firstNullFrame,
      gags: endQ.gags || [],
      endFrame: sEnd.frame,
      failStep: done ? null : (sEnd.quest ? sEnd.quest.step : sEnd.scene),
      cjkViolations: countCjkViolations(),
    };
  };

  const handleBoothAndBoard = async (P, rng, policy, tierOrder) => {
    let guard = 0;
    while (guard < 40) {
      guard++;
      await flushMicro();
      const s = P.getState();
      if (s.scene === 'booth') {
        if (policy === 'random') {
          // Kid tries 1-2 accessories and admires runway walk (~7-11 s).
          const browseFrames = 420 + Math.floor(rng() * 240);
          P.stepFrames(Math.floor(browseFrames * 0.5));
          await flushMicro();
          const cId = Object.keys(s.contestants || {}).find(
            (k) => s.quests && s.quests[k] && s.quests[k].status === 'done' && !(s.board && s.board[k])
          ) || 'sheep';
          const metaAccs = (window.__ROSTER_ACCS__ && window.__ROSTER_ACCS__[cId]) || ['crown', 'flowerCrown', 'bow'];
          await P.boothChoose(metaAccs[Math.floor(rng() * metaAccs.length)]);
          P.stepFrames(Math.ceil(browseFrames * 0.5));
          await flushMicro();
        } else {
          P.stepFrames(30);
          await P.boothChoose('crown');
          await flushMicro();
        }
        await P.boothSnap();
        await flushMicro();
        await stepAsync(P, 45, 12);
        continue;
      }

      if (s.scene === 'board' || s.scene === 'finale') {
        if (s.scene === 'finale') {
          await stepAsync(P, 30, 15);
          continue;
        }
        const sNow = P.getState();
        if (sNow.scene !== 'board') continue;

        // Determine unranked contestant (or 'kai' in finale).
        let unranked = Object.keys(sNow.contestants || {}).find(
          (k) => sNow.contestants[k].met && !(sNow.board && sNow.board[k])
        );
        if (!unranked) {
          const doneUnranked = Object.keys(sNow.quests || {}).find(
            (k) => sNow.quests[k].status === 'done' && !(sNow.board && sNow.board[k])
          );
          unranked = doneUnranked || (sNow.scene === 'finale' ? 'kai' : 'kai');
        }

        if (policy === 'random') {
          await stepAsync(P, 300 + Math.floor(rng() * 240), 30); // ~5-9s board deliberation
        } else {
          await stepAsync(P, 15, 15);
        }

        const tier = tierOrder[Math.floor(rng() * tierOrder.length)];
        await P.boardDrop(unranked, tier);
        await flushMicro();
        await stepAsync(P, 155, 15); // 2.5s crowd/contestant reaction
        if (P.getState().scene === 'board') {
          await P.continue();
          await flushMicro();
        }
        await stepAsync(P, 98, 15); // 1.5s NEXT card transition
        continue;
      }

      break;
    }
  };

  const runFullSession = async (seed, policy, maxSimMin, mainQuestIds, tiersList) => {
    const P = window.__PAGEANT__;
    const rng = mulberry32(((seed * 2246822519) >>> 0) ^ hashStr(`session:${policy}`));
    await P.startGame({ seed });
    await flushMicro();
    P.stepFrames(12);
    await flushMicro();

    const s0 = P.getState();
    const startMs = s0.timeMs || 0;
    const maxMs = maxSimMin * 60 * 1000;
    const tracker = { pointerSamples: 0, pointerNulls: 0, firstNullFrame: null, firstMetMs: null, stealFired: false, stealMs: null };
    const cjkIssues = [];

    let loops = 0;
    let actionCooldown = 0;
    while (loops < 9000) {
      loops++;
      await flushMicro();
      const s = P.getState();
      if (s.scene === 'final') break;
      const rankedMain = mainQuestIds.filter((q) => s.board && s.board[q]).length;
      if (rankedMain === mainQuestIds.length && s.board && s.board.kai) break;
      if ((s.timeMs - startMs) >= maxMs) break;

      if (s.scene === 'booth' || s.scene === 'board' || s.scene === 'finale') {
        await handleBoothAndBoard(P, rng, policy, tiersList);
        continue;
      }

      if (s.scene !== 'world') {
        await stepAsync(P, 30, 15);
        continue;
      }

      if (loops % 25 === 0) {
        const viol = countCjkViolations();
        if (viol.length > 0 && cjkIssues.length < 5) cjkIssues.push(...viol);
      }

      const activeQ = s.quest ? s.quest.id : null;
      if (actionCooldown > 0) actionCooldown--;
      if (actionCooldown === 0 && (hasVisibleActionBtn() || (s.quest && s.quest.action))) {
        if (policy === 'ideal' || rng() < 0.45) {
          await P.pressAction();
          await flushMicro();
          actionCooldown = 6;
          await stepAndSample(P, 12, activeQ, tracker);
        }
      }

      if (policy === 'random' && rng() < 0.20) {
        const rx = Math.round(80 + rng() * (window.innerWidth - 160));
        const ry = Math.round(110 + rng() * (window.innerHeight - 210));
        await P.tapScreen(rx, ry);
        await flushMicro();
        // Let distracted kid walk briefly on wasted tap + 0.3-1.2s delay.
        const wanderFrames = 48 + Math.floor(rng() * 78);
        await stepAndSample(P, wanderFrames, activeQ, tracker);
        continue;
      }

      const targets = P.listTargets() || [];
      const nonWait = targets.filter(
        (t) => t && t.id !== undefined && t.kind !== 'wait' && !String(t.id).endsWith('_wait')
      );
      if (nonWait.length === 0) {
        const waitT = targets.find((t) => t && String(t.id).endsWith('_wait'));
        if (waitT && dist2D(s.player, waitT.pos) > 3.5 && (!s.player || !s.player.moving)) {
          await P.tapTarget(waitT.id);
          await flushMicro();
          await walkUntilSettled(P, waitT.pos, activeQ, tracker, 180);
        } else if (s.quest && s.quest.pointer) {
          await stepAndSample(P, 20, activeQ, tracker);
        } else {
          await stepAsync(P, 20, 10);
        }
        continue;
      }
      const actionable = nonWait;

      let chosen = actionable[0];
      if (policy === 'ideal') {
        const sorted = [...actionable].sort((a, b) => dist2D(s.player, a.pos) - dist2D(s.player, b.pos));
        chosen = sorted[0];
      } else {
        chosen = actionable[Math.floor(rng() * actionable.length)];
      }

      await P.tapTarget(chosen.id);
      await flushMicro();
      await walkUntilSettled(P, chosen.pos, activeQ, tracker, policy === 'ideal' ? 300 : 180, chosen.id, policy);
      if (policy === 'ideal') {
        // #143 binding rule 1: ideal agent waits 0.45 s (27 frames @ 60 Hz) between taps (reaction).
        await stepAndSample(P, 27, activeQ, tracker);
      } else {
        await stepAndSample(P, 18 + Math.floor(rng() * 55), activeQ, tracker);
      }
    }

    const fin = P.getState();
    const totalMs = (fin.elapsedMs && fin.elapsedMs > 0) ? fin.elapsedMs : (fin.timeMs - startMs);
    const rankedMain = mainQuestIds.filter((q) => fin.board && fin.board[q]).length;
    const gagsByQuest = {};
    for (const qid of mainQuestIds) {
      gagsByQuest[qid] = (fin.quests && fin.quests[qid] && fin.quests[qid].gags) || [];
    }
    return {
      seed,
      policy,
      completedAll: fin.scene === 'final' || (rankedMain === mainQuestIds.length && Boolean(fin.board && fin.board.kai)),
      rankedMain,
      kaiRanked: Boolean(fin.board && fin.board.kai),
      scene: fin.scene,
      minutes: Math.round((totalMs / 60000) * 100) / 100,
      timeMs: totalMs,
      gagsByQuest,
      rivalAppearances: (fin.rival && fin.rival.appearances) || [],
      pointerSamples: tracker.pointerSamples,
      pointerNulls: tracker.pointerNulls,
      firstNullFrame: tracker.firstNullFrame,
      cjkIssues,
    };
  };

  const runDeadTapsAudit = async (totalTaps, questIds) => {
    const P = window.__PAGEANT__;
    const rng = mulberry32(0x5eedf3);
    await P.startGame({ seed: 42 });
    await flushMicro();
    P.stepFrames(15);

    const contexts = [
      { kind: 'hub', setup: async () => { await P.teleport('sheep'); } },
      { kind: 'golem', setup: async () => { await P.teleport('golem'); } },
      { kind: 'snow', setup: async () => { await P.teleport('snow'); } },
      { kind: 'end', setup: async () => { await P.teleport('ender'); } },
      { kind: 'nether', setup: async () => { await P.teleport('wither'); } },
      { kind: 'villager', setup: async () => { await P.teleport('villager'); } },
    ];

    const tapsPerCtx = Math.ceil(totalTaps / contexts.length);
    let checked = 0;
    let hubChecked = 0;
    let hubBlocked = 0;
    let maxLatencyMs = 0;
    let missingIncrement = 0;
    let latencyViolations = 0;
    const sampleFailures = [];

    for (const ctxSpec of contexts) {
      if (checked >= totalTaps) break;
      await ctxSpec.setup();
      await flushMicro();
      P.stepFrames(18);
      const isHubCtx = ctxSpec.kind !== 'end' && ctxSpec.kind !== 'nether';
      for (let i = 0; i < tapsPerCtx && checked < totalTaps; i++) {
        const sPre = P.getState();
        if (sPre.scene !== 'world') {
          await P.startGame({ seed: 42 + checked });
          await ctxSpec.setup();
          await flushMicro();
          P.stepFrames(12);
        }
        const pre = P.getState();
        const preFb = pre.feedback || { taps: 0, walk: 0, interact: 0, blocked: 0, collect: 0, dead: 0 };
        const preSum = (preFb.walk || 0) + (preFb.interact || 0) + (preFb.blocked || 0) + (preFb.collect || 0);
        const tapMs = pre.timeMs || 0;

        // Avoid top-left/top-right HUD buttons so taps hit the world canvas.
        const x = Math.round(90 + rng() * (window.innerWidth - 180));
        const y = Math.round(115 + rng() * (window.innerHeight - 230));
        await P.tapScreen(x, y);
        await flushMicro();
        P.stepFrames(6); // 6 frames = 100 ms
        await flushMicro();

        const post = P.getState();
        const postFb = post.feedback || {};
        const postSum = (postFb.walk || 0) + (postFb.interact || 0) + (postFb.blocked || 0) + (postFb.collect || 0);
        const latency = Math.max(0, (postFb.lastMs || post.timeMs) - tapMs);
        if (latency > maxLatencyMs) maxLatencyMs = latency;
        if (isHubCtx) {
          hubChecked++;
          if ((postFb.blocked || 0) > (preFb.blocked || 0)) hubBlocked++;
        }

        if (postSum <= preSum || (postFb.dead || 0) > (preFb.dead || 0)) {
          missingIncrement++;
          if (sampleFailures.length < 5) {
            sampleFailures.push({ ctx: ctxSpec.kind, x, y, preFb, postFb });
          }
        }
        if (latency > 100.5) {
          latencyViolations++;
        }
        checked++;
      }
    }

    const finalFb = P.getState().feedback || {};
    const hubBlockedPct = hubChecked > 0 ? Math.round((hubBlocked / hubChecked) * 1000) / 10 : 0;
    return {
      checked,
      dead: finalFb.dead ?? -1,
      hubChecked,
      hubBlocked,
      hubBlockedPct,
      missingIncrement,
      latencyViolations,
      maxLatencyMs: Math.round(maxLatencyMs * 10) / 10,
      sampleFailures,
    };
  };

  const runDeterminismCheck = async (seeds) => {
    const P = window.__PAGEANT__;
    const findFirstDiff = (a, b, path = '$') => {
      if (a === b) return null;
      if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
        return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
      }
      const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
      for (const k of keys) {
        const d = findFirstDiff(a[k], b[k], `${path}.${k}`);
        if (d) return d;
      }
      return null;
    };

    const runScriptOnce = async (seed) => {
      await P.startGame({ seed });
      await flushMicro();
      let framesDone = 0;
      // Deterministic input script totaling exactly 3600 frames (60s).
      const checkpoints = [60, 240, 480, 720, 1020, 1320, 1680, 2040, 2400, 2820, 3240, 3600];
      for (let i = 0; i < checkpoints.length; i++) {
        const stepN = checkpoints[i] - framesDone;
        P.stepFrames(stepN);
        framesDone = checkpoints[i];
        await flushMicro();
        if (i < checkpoints.length - 1) {
          const s = P.getState();
          if (s.scene === 'world') {
            const tgs = P.listTargets() || [];
            if (tgs.length > 0 && tgs[i % tgs.length] && tgs[i % tgs.length].id !== undefined) {
              await P.tapTarget(tgs[i % tgs.length].id);
            } else {
              await P.tapScreen(400 + (i * 37) % 480, 300 + (i * 29) % 240);
            }
          } else if (s.scene === 'booth') {
            await P.boothChoose('flowerCrown');
            await P.boothSnap();
          } else if (s.scene === 'board') {
            const cid = Object.keys(s.quests || {}).find((k) => s.quests[k].status === 'done' && !(s.board && s.board[k])) || 'sheep';
            await P.boardDrop(cid, 'perfect');
            await P.continue();
          }
          await flushMicro();
        }
      }
      return P.getState();
    };

    const out = [];
    for (const seed of seeds) {
      const s1 = await runScriptOnce(seed);
      const s2 = await runScriptOnce(seed);
      const j1 = JSON.stringify(s1);
      const j2 = JSON.stringify(s2);
      const identical = (j1 === j2);
      out.push({
        seed,
        frame1: s1.frame,
        frame2: s2.frame,
        identical,
        diff: identical ? null : findFirstDiff(s1, s2),
      });
    }
    return out;
  };

  const runJuiceAudit = async (questIds) => {
    const P = window.__PAGEANT__;
    const perQuest = [];
    for (let i = 0; i < questIds.length; i++) {
      const qid = questIds[i];
      await P.startGame({ seed: 70 + i });
      await P.teleport(qid);
      await flushMicro();
      P.stepFrames(18);
      const pre = P.getState().stats || { particles: 0, sounds: 0 };
      await P.completeQuest(qid);
      await flushMicro();
      P.stepFrames(30); // 0.5 s window
      await flushMicro();
      const post = P.getState().stats || { particles: 0, sounds: 0 };
      const dPart = (post.particles || 0) - (pre.particles || 0);
      const dSfx = (post.sounds || 0) - (pre.sounds || 0);
      perQuest.push({
        id: qid,
        dParticles: dPart,
        dSounds: dSfx,
        ok: dPart >= 60 && dSfx >= 1,
      });
    }

    // Check 完美 ('perfect') tier drop -> confetti >= 150.
    await P.startGame({ seed: 99 });
    await P.completeQuest('sheep');
    await flushMicro();
    P.stepFrames(120);
    await P.boothChoose('flowerCrown');
    await P.boothSnap();
    await flushMicro();
    P.stepFrames(45);
    await flushMicro();
    const preBoard = P.getState().stats || { confetti: 0, fireworks: 0 };
    await P.boardDrop('sheep', 'perfect');
    await flushMicro();
    P.stepFrames(60);
    await flushMicro();
    const postBoard = P.getState().stats || { confetti: 0, fireworks: 0 };
    const dConfetti = (postBoard.confetti || 0) - (preBoard.confetti || 0);
    const dFireworks = (postBoard.fireworks || 0) - (preBoard.fireworks || 0);

    return {
      perQuest,
      perfectConfetti: dConfetti,
      perfectFireworks: dFireworks,
      perfectOk: dConfetti >= 150,
    };
  };

  const runPerfAudit = async () => {
    const P = window.__PAGEANT__;
    // 1. Measure headless SwiftShader baseline on an empty offscreen WebGL canvas over 25 rAFs.
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = 1280;
    baseCanvas.height = 800;
    baseCanvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(baseCanvas);
    const gl = baseCanvas.getContext('webgl2') || baseCanvas.getContext('webgl');
    const baseDts = [];
    let tPrev = performance.now();
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      if (gl) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      if (i >= 3) baseDts.push(now - tPrev);
      tPrev = now;
    }
    baseCanvas.remove();
    baseDts.sort((a, b) => a - b);
    const baselineP95 = baseDts.length ? baseDts[Math.min(baseDts.length - 1, Math.floor(baseDts.length * 0.95))] : 16.7;

    // 2. Warm up lazy per-kind skin cache once, then measure 3 steady-state quest cycles for leaks.
    const cycleQuests = ['sheep', 'slime', 'cat'];
    await P.startGame({ seed: 6 });
    await flushMicro();
    for (const qid of cycleQuests) {
      await P.teleport(qid);
      P.stepFrames(24);
      await P.completeQuest(qid);
      await flushMicro();
      P.stepFrames(75);
      await P.boothChoose('crown');
      await P.boothSnap();
      await flushMicro();
      P.stepFrames(45);
      await P.boardDrop(qid, 'perfect');
      await flushMicro();
      P.stepFrames(150);
      await P.continue();
      await flushMicro();
      P.stepFrames(96);
    }

    await P.startGame({ seed: 7 });
    await flushMicro();
    P.stepFrames(60);
    let memAfterCycle1 = null;
    let memAfterCycle3 = null;
    for (let c = 0; c < 3; c++) {
      for (const qid of cycleQuests) {
        await P.teleport(qid);
        P.stepFrames(30);
        await P.completeQuest(qid);
        await flushMicro();
        P.stepFrames(90);
        await P.boothChoose('crown');
        await P.boothSnap();
        await flushMicro();
        P.stepFrames(45);
        await P.boardDrop(qid, 'perfect');
        await flushMicro();
        P.stepFrames(150);
        await P.continue();
        await flushMicro();
        P.stepFrames(96);
      }
      const pf = P.perf() || {};
      if (c === 0) memAfterCycle1 = { geometries: pf.geometries || 0, textures: pf.textures || 0 };
      if (c === 2) memAfterCycle3 = { geometries: pf.geometries || 0, textures: pf.textures || 0 };
    }

    // Sample 40 live rAF frames in plaza/world.
    const liveDts = [];
    let lastT = performance.now();
    let maxCalls = 0;
    let maxTris = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      if (i >= 4) liveDts.push(now - lastT);
      lastT = now;
      const pf = P.perf() || {};
      if ((pf.calls || 0) > maxCalls) maxCalls = pf.calls;
      if ((pf.triangles || 0) > maxTris) maxTris = pf.triangles;
    }
    liveDts.sort((a, b) => a - b);
    const rafP95 = liveDts.length ? liveDts[Math.min(liveDts.length - 1, Math.floor(liveDts.length * 0.95))] : 999;
    const seamPerf = P.perf() || {};
    const p95Limit = baselineP95 > 12.0 ? Math.max(25.0, baselineP95 * 2.0) : 25.0;

    const g1 = Math.max(1, (memAfterCycle1 && memAfterCycle1.geometries) || 1);
    const t1 = Math.max(1, (memAfterCycle1 && memAfterCycle1.textures) || 1);
    const g3 = (memAfterCycle3 && memAfterCycle3.geometries) || 0;
    const t3 = (memAfterCycle3 && memAfterCycle3.textures) || 0;
    const geomDrift = (g3 - g1) / g1;
    const texDrift = (t3 - t1) / t1;

    return {
      baselineP95: Math.round(baselineP95 * 100) / 100,
      rafP95: Math.round(rafP95 * 100) / 100,
      seamP95: seamPerf.p95ms || null,
      p95Limit: Math.round(p95Limit * 100) / 100,
      maxCalls: Math.max(maxCalls, seamPerf.calls || 0),
      maxTriangles: Math.max(maxTris, seamPerf.triangles || 0),
      memAfterCycle1,
      memAfterCycle3,
      geomDriftPct: Math.round(geomDrift * 1000) / 10,
      texDriftPct: Math.round(texDrift * 1000) / 10,
    };
  };

  window.__QA_SIM__ = {
    runQuestEpisode,
    runFullSession,
    runDeadTapsAudit,
    runDeterminismCheck,
    runJuiceAudit,
    runPerfAudit,
  };
  return true;
})()
"""


def _median(vals: list[float]) -> float:
  if not vals:
    return 0.0
  return round(float(statistics.median(vals)), 2)


def measure_boot_gate(sess: QASession) -> dict[str, Any]:
  """Measures F8: #title visible <= 1.5s, world interactive <= 4s after ▶, 0 console errors."""
  assert sess.b is not None
  sess.clear_diagnostics()
  url = f'http://127.0.0.1:{sess.b.http_port}/index.html'
  t_nav = time.time()
  sess.b.cmd('Page.navigate', url=url)

  title_vis_s: float | None = None
  while time.time() - t_nav < 10.0:
    try:
      vis = sess.eval(
          """(() => {
            const t = document.getElementById('title');
            if (!t || t.hasAttribute('hidden')) return false;
            const cs = window.getComputedStyle(t);
            const r = t.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05 && r.height > 20;
          })()"""
      )
      if vis:
        title_vis_s = round(time.time() - t_nav, 3)
        break
    except RuntimeError:
      pass
    time.sleep(0.04)

  # Wait for window.__PAGEANT__ seam to attach before tapping Play ▶.
  seam_ready = False
  t_wait = time.time()
  while time.time() - t_wait < 12.0:
    try:
      if sess.eval('window.__PAGEANT__ !== undefined'):
        seam_ready = True
        break
    except RuntimeError:
      pass
    time.sleep(0.05)

  if not seam_ready:
    return {
        'passed': False,
        'titleVisibleS': title_vis_s,
        'worldInteractiveS': None,
        'reason': 'window.__PAGEANT__ never attached',
        'diagnostics': sess.collect_diagnostics(),
    }

  # Locate ▶ Play button on #title and tap it with a real mouse tap.
  btn = sess.eval_json(
      """(() => {
        const root = document.getElementById('title') || document.body;
        const cands = Array.from(root.querySelectorAll('button, [role="button"]')).filter((el) => {
          if (el.hasAttribute('hidden')) return false;
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width >= 40 && r.height >= 40;
        });
        const playBtn = cands.find((b) => /▶|开始|play|start/i.test((b.textContent || '') + ' ' + (b.id || '') + ' ' + (b.className || '')))
          || cands.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
        if (!playBtn) return null;
        const r = playBtn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      })()"""
  )

  t_play = time.time()
  if btn:
    sess.mouse_tap(btn['x'], btn['y'])
  else:
    sess.eval('window.__PAGEANT__.startGame({ seed: 1 })')

  world_interactive_s: float | None = None
  while time.time() - t_play < 8.0:
    try:
      ready = sess.eval(
          """(() => {
            const P = window.__PAGEANT__;
            if (!P) return false;
            const s = P.getState();
            return s && s.scene === 'world';
          })()"""
      )
      if ready:
        sess.eval(
            """(async () => {
              const P = window.__PAGEANT__;
              await P.tapScreen(640, 420);
              P.stepFrames(6);
              return true;
            })()"""
        )
        fb = sess.eval_json('window.__PAGEANT__.getState().feedback || {}')
        if (fb.get('taps', 0) >= 1) and (fb.get('dead', 0) == 0):
          world_interactive_s = round(time.time() - t_play, 3)
          break
    except RuntimeError:
      pass
    time.sleep(0.05)

  diag = sess.collect_diagnostics()
  zero_errs = not (
      diag['window_errors'] + diag['exceptions'] + diag['console_errors'] + diag['http_errors']
  )
  passed = (
      title_vis_s is not None
      and title_vis_s <= 1.5
      and btn is not None
      and world_interactive_s is not None
      and world_interactive_s <= 4.0
      and zero_errs
  )
  return {
      'passed': passed,
      'titleVisibleS': title_vis_s,
      'playButton': btn,
      'worldInteractiveS': world_interactive_s,
      'zeroErrors': zero_errs,
      'diagnostics': diag,
  }


def measure_persistence_gate(sess: QASession) -> dict[str, Any]:
  """Measures F14: reload mid-run restores board, portraits, stars, done quests from pageant_progress."""
  pre = sess.eval_json(
      """(async () => {
        localStorage.removeItem('pageant_progress');
        const P = window.__PAGEANT__;
        await P.startGame({ seed: 14 });
        const pairs = [
          ['sheep', 'perfect', 'flowerCrown'],
          ['slime', 'gorgeous', 'slimeHat'],
          ['cat', 'pretty', 'bow'],
        ];
        for (const [qid, tier, acc] of pairs) {
          await P.teleport(qid);
          P.stepFrames(15);
          await P.completeQuest(qid);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(90);
          await P.boothChoose(acc);
          await P.boothSnap();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(45);
          await P.boardDrop(qid, tier);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(150);
          await P.continue();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(90);
        }
        const s = P.getState();
        const raw = localStorage.getItem('pageant_progress');
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (_e) {}
        return {
          hasKey: Boolean(raw),
          rawBytes: raw ? raw.length : 0,
          parsed,
          board: s.board || {},
          stars: s.stars || 0,
          doneQuests: Object.keys(s.quests || {}).filter((k) => s.quests[k].status === 'done'),
          portraits: Object.fromEntries(
            ['sheep', 'slime', 'cat'].map((k) => [k, Boolean(s.contestants && s.contestants[k] && s.contestants[k].portrait)])
          ),
        };
      })()"""
  )

  if not sess.reload(timeout=25.0):
    return {'passed': False, 'reason': 'reload failed', 'pre': pre}

  post = sess.eval_json(
      """(async () => {
        // Click 继续 (resume) on #title if present, then inspect getState().
        const root = document.getElementById('title') || document.body;
        const resumeBtn = Array.from(root.querySelectorAll('button, [role="button"]')).find(
          (b) => !b.hasAttribute('hidden') && /继续|continue|resume/i.test((b.textContent || '') + ' ' + (b.id || '') + ' ' + (b.dataset.action || ''))
        );
        if (resumeBtn) {
          resumeBtn.click();
          for (let k = 0; k < 8; k++) await Promise.resolve();
        }
        const P = window.__PAGEANT__;
        P.stepFrames(15);
        const s = P.getState();
        const raw = localStorage.getItem('pageant_progress');
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (_e) {}
        let maxPortraitBytes = 0;
        if (parsed && parsed.portraits && typeof parsed.portraits === 'object') {
          for (const v of Object.values(parsed.portraits)) {
            if (typeof v === 'string' && v.length > maxPortraitBytes) maxPortraitBytes = v.length;
          }
        }
        return {
          hadResumeBtn: Boolean(resumeBtn),
          board: s.board || {},
          stars: s.stars || 0,
          doneQuests: Object.keys(s.quests || {}).filter((k) => s.quests[k].status === 'done'),
          portraits: Object.fromEntries(
            ['sheep', 'slime', 'cat'].map((k) => [k, Boolean(s.contestants && s.contestants[k] && s.contestants[k].portrait)])
          ),
          maxPortraitBytes,
        };
      })()"""
  )

  expected_board = {'sheep': 'perfect', 'slime': 'gorgeous', 'cat': 'pretty'}
  board_ok = all(post['board'].get(k) == v for k, v in expected_board.items())
  done_ok = all(q in post['doneQuests'] for q in ('sheep', 'slime', 'cat'))
  portraits_ok = all(post['portraits'].get(q) is True for q in ('sheep', 'slime', 'cat'))
  size_ok = post['maxPortraitBytes'] <= 16500  # ~12 KB binary JPEG -> ~16 KB base64 dataURL
  stars_ok = post['stars'] == pre['stars']
  passed = bool(pre['hasKey']) and board_ok and done_ok and portraits_ok and size_ok and stars_ok
  return {
      'passed': passed,
      'hasKey': pre['hasKey'],
      'boardOk': board_ok,
      'doneOk': done_ok,
      'portraitsOk': portraits_ok,
      'portraitSizeOk': size_ok,
      'maxPortraitDataUrlChars': post['maxPortraitBytes'],
      'starsOk': stars_ok,
      'pre': pre,
      'post': post,
  }


def run_sim_gates_on_session(
    sess: QASession,
    seeds_override: int = 0,
    quick: bool = False,
    quest_filter: list[str] | None = None,
    gate_filter: set[str] | None = None,
) -> dict[str, Any]:
  """Executes F1–F14 (or selected subset) on an active QASession and writes /tmp/bv1xyn/qa/gates.json."""
  ensure_qa_dirs()
  n_seeds = seeds_override if seeds_override > 0 else (4 if quick else 20)
  n_ideal = max(2, min(5, n_seeds)) if not seeds_override else n_seeds
  n_session_rand = 3 if quick else (seeds_override if seeds_override > 0 else 10)
  n_dead_taps = 120 if quick else 500

  main_ids = [q['id'] for q in MAIN_QUESTS]
  active_quests = [q for q in MAIN_QUESTS if not quest_filter or q['id'] in quest_filter]
  tier_ids = [t['id'] for t in TIERS]

  def want(gid: str) -> bool:
    return gate_filter is None or gid in gate_filter

  gates: list[dict[str, Any]] = []

  # --- F8 Boot (run first on clean load before installing sim harness) ---
  if want('F8'):
    f8 = measure_boot_gate(sess)
    f8_meas = (
        f"title={f8.get('titleVisibleS')}s, world={f8.get('worldInteractiveS')}s, "
        f"clean={f8.get('zeroErrors')}"
    )
    gates.append({
        'id': 'F8',
        'gate': 'F8 boot',
        'target': 'title <=1.5s, world <=4s after Play, 0 console errors',
        'measured': f8_meas,
        'passed': bool(f8['passed']),
        'details': f8,
    })
  else:
    sess.goto('index.html', timeout=25.0)

  sess.set_viewport(1280, 800, mobile=False)
  roster_accs = {q['id']: q['accessories'] for q in MAIN_QUESTS}
  sess.eval(f'window.__ROSTER_ACCS__ = {json.dumps(roster_accs)}; true')
  sess.eval(INSTALL_SIM_HARNESS_JS)

  # --- F1 First Contact (20 seeds from spawn, no teleport) ---
  if want('F1'):
    f1_runs = []
    for s_idx in range(1, n_seeds + 1):
      ep = sess.eval_json(
          f'window.__QA_SIM__.runQuestEpisode("sheep", {s_idx}, "ideal", false, 75)'
      )
      ep['f1Ok'] = (
          ep['done']
          and ep['firstMetS'] is not None
          and ep['firstMetS'] <= 20.0
          and ep['durationS'] <= 60.0
      )
      f1_runs.append(ep)
    ok_cnt = sum(1 for r in f1_runs if r['f1Ok'])
    rate = ok_cnt / max(1, len(f1_runs))
    med_met = _median([r['firstMetS'] for r in f1_runs if r['firstMetS'] is not None])
    med_done = _median([r['durationS'] for r in f1_runs if r['done']])
    f1_pass = rate >= 0.90 - 1e-9
    gates.append({
        'id': 'F1',
        'gate': 'F1 first contact',
        'target': 'meet sheep <=20s & finish <=60s from start in >=90% seeds',
        'measured': f'{ok_cnt}/{len(f1_runs)} ({rate * 100:.0f}%), med met={med_met}s, done={med_done}s',
        'passed': f1_pass,
        'details': {'runs': f1_runs},
    })

  # --- F2 Quests Completable + shared data for F9 (ender) & F10 (pointer) ---
  ender_rand_runs: list[dict[str, Any]] = []
  pointer_total_samples = 0
  pointer_total_nulls = 0
  cjk_all_violations: list[Any] = []

  if want('F2') or want('F9') or want('F10'):
    ideal_by_q: dict[str, list[dict[str, Any]]] = {}
    rand_by_q: dict[str, list[dict[str, Any]]] = {}
    quests_to_sim = active_quests if (want('F2') or want('F10')) else [q for q in MAIN_QUESTS if q['id'] == 'ender']

    for q in quests_to_sim:
      qid = q['id']
      ideal_runs = []
      if want('F2') or want('F10'):
        for s_idx in range(1, n_ideal + 1):
          ep = sess.eval_json(
              f'window.__QA_SIM__.runQuestEpisode({json.dumps(qid)}, {s_idx}, "ideal", true, 105)'
          )
          ideal_runs.append(ep)
          pointer_total_samples += ep.get('pointerSamples', 0)
          pointer_total_nulls += ep.get('pointerNulls', 0)
          cjk_all_violations.extend(ep.get('cjkViolations') or [])
      ideal_by_q[qid] = ideal_runs

      rand_runs = []
      if want('F2') or (want('F9') and qid == 'ender'):
        for s_idx in range(1, n_seeds + 1):
          ep = sess.eval_json(
              f'window.__QA_SIM__.runQuestEpisode({json.dumps(qid)}, {100 + s_idx}, "random", true, 130)'
          )
          rand_runs.append(ep)
          if qid == 'ender':
            ender_rand_runs.append(ep)
      rand_by_q[qid] = rand_runs

    if want('F2'):
      ideal_fails = []
      floor_fails = []
      per_q_summary = {}
      total_rand = 0
      ok_rand = 0
      for q in active_quests:
        qid = q['id']
        floor_s = float(QUEST_IDEAL_FLOORS_S.get(qid, 18.0))
        ir = ideal_by_q[qid]
        rr = rand_by_q[qid]
        i_durs = [x['durationS'] for x in ir]
        i_min = round(min(i_durs, default=0.0), 2)
        i_med = _median(i_durs)
        i_max = round(max(i_durs, default=999.0), 2)
        ceil_ok = bool(ir) and all(x['done'] and x['durationS'] <= 90.0 for x in ir)
        floor_ok = bool(ir) and (i_med >= floor_s)
        i_ok = ceil_ok and floor_ok
        if not ceil_ok:
          ideal_fails.append(f'{qid}:max={i_max}s')
        if not floor_ok:
          floor_fails.append(f'{qid}:med={i_med}s<{floor_s:.0f}s')

        r_durs = [x['durationS'] for x in rr]
        r_ok_n = sum(1 for x in rr if x['done'] and x['durationS'] <= 120.0)
        total_rand += len(rr)
        ok_rand += r_ok_n
        r_min = round(min(r_durs, default=0.0), 2)
        r_med = _median(r_durs)
        r_max = round(max(r_durs, default=999.0), 2)
        first_fail = next(
            ({'seed': x['seed'], 'frame': x['endFrame'], 'step': x['failStep'], 'dur': x['durationS']}
             for x in rr if not (x['done'] and x['durationS'] <= 120.0)),
            None,
        )
        per_q_summary[qid] = {
            'owner': q['owner'],
            'floor_s': floor_s,
            'ideal_min_s': i_min,
            'ideal_med_s': i_med,
            'ideal_max_s': i_max,
            'floor_ok': floor_ok,
            'ceil_ok': ceil_ok,
            'ideal_ok': i_ok,
            'random_passes': f'{r_ok_n}/{len(rr)}',
            'random_min_s': r_min,
            'random_med_s': r_med,
            'random_max_s': r_max,
            'first_fail': first_fail,
        }

      rand_rate = ok_rand / max(1, total_rand)
      f2_pass = (
          (not ideal_fails)
          and (not floor_fails)
          and (rand_rate >= 0.95 - 1e-9)
          and len(active_quests) == len(MAIN_QUESTS)
      )
      floors_ok_cnt = len(active_quests) - len(floor_fails)
      ceils_ok_cnt = len(active_quests) - len(ideal_fails)
      f2_meas = (
          f'rand <=120s: {ok_rand}/{total_rand} ({rand_rate * 100:.1f}%), '
          f'ideal <=90s: {ceils_ok_cnt}/{len(active_quests)}, '
          f'floors: {floors_ok_cnt}/{len(active_quests)}'
      )
      gates.append({
          'id': 'F2',
          'gate': 'F2 quests completable',
          'target': 'rand <=120s >=95%; ideal [floor..90s] (#143 floors)',
          'measured': f2_meas,
          'passed': f2_pass,
          'details': {
              'per_quest': per_q_summary,
              'ideal_fails': ideal_fails,
              'floor_fails': floor_fails,
          },
      })

  # --- F3 Zero Dead Taps ---
  if want('F3'):
    f3 = sess.eval_json(
        f'window.__QA_SIM__.runDeadTapsAudit({n_dead_taps}, {json.dumps(main_ids)})'
    )
    f3_pass = (
        f3['checked'] == n_dead_taps
        and f3['dead'] == 0
        and f3['missingIncrement'] == 0
        and f3['latencyViolations'] == 0
        and f3.get('hubBlockedPct', 0.0) < 5.0
    )
    f3_meas = (
        f"dead={f3['dead']}, missed={f3['missingIncrement']}/{f3['checked']}, "
        f"hubBlocked={f3.get('hubBlockedPct', 0)}%, maxLat={f3['maxLatencyMs']}ms"
    )
    gates.append({
        'id': 'F3',
        'gate': 'F3 zero dead taps',
        'target': f'{n_dead_taps} random world taps -> dead==0, hubBlocked <5%, feedback <=100ms',
        'measured': f3_meas,
        'passed': f3_pass,
        'details': f3,
    })

  # --- Full-session runs for F4 (gags + rival >=7), F7 (session length), F10 (pointer/CJK) ---
  ideal_session: dict[str, Any] | None = None
  if want('F4') or want('F7') or want('F10'):
    ideal_session = sess.eval_json(
        f'window.__QA_SIM__.runFullSession(1, "ideal", 18, {json.dumps(main_ids)}, {json.dumps(tier_ids)})'
    )
    pointer_total_samples += ideal_session.get('pointerSamples', 0)
    pointer_total_nulls += ideal_session.get('pointerNulls', 0)
    cjk_all_violations.extend(ideal_session.get('cjkIssues') or [])

  if want('F4'):
    assert ideal_session is not None
    gags_map = ideal_session.get('gagsByQuest') or {}
    with_gag = [q for q in main_ids if len(gags_map.get(q) or []) >= 1]
    distinct_rival = sorted(set(ideal_session.get('rivalAppearances') or []))
    f4_pass = (len(with_gag) == len(MAIN_QUESTS)) and (len(distinct_rival) >= 7)
    gates.append({
        'id': 'F4',
        'gate': 'F4 funny beat per quest',
        'target': 'every quest >=1 gag (10/10); rival in >=7 distinct quests',
        'measured': f'quests w/ gag={len(with_gag)}/10, rival quests={len(distinct_rival)}',
        'passed': f4_pass,
        'details': {
            'gagsByQuest': gags_map,
            'distinctRivalQuests': distinct_rival,
        },
    })

  # --- F5 Board Drag (390x844 touch, 844x390 touch, 1280x800 mouse, tap-tap 5/5) ---
  if want('F5'):
    r_t_port = verify_board_tier_mode(sess, 390, 844, 'touch')
    r_t_land = verify_board_tier_mode(sess, 844, 390, 'touch')
    r_mouse = verify_board_tier_mode(sess, 1280, 800, 'mouse')
    r_taptap = verify_board_tier_mode(sess, 1280, 800, 'taptap')
    sess.set_viewport(1280, 800, mobile=False)
    sess.eval(INSTALL_SIM_HARNESS_JS)
    f5_pass = r_t_port['ok'] and r_t_land['ok'] and r_mouse['ok'] and r_taptap['ok']
    f5_meas = (
        f"390x844={r_t_port['passes']}/5, 844x390={r_t_land['passes']}/5, "
        f"1280x800={r_mouse['passes']}/5, taptap={r_taptap['passes']}/5"
    )
    gates.append({
        'id': 'F5',
        'gate': 'F5 board drag',
        'target': 'touch 390x844 & 844x390 5/5, mouse 1280x800 5/5, tap-tap 5/5',
        'measured': f5_meas,
        'passed': f5_pass,
        'details': {
            'touch_390x844': r_t_port,
            'touch_844x390': r_t_land,
            'mouse_1280x800': r_mouse,
            'taptap_1280x800': r_taptap,
        },
    })

  # --- F6 Performance ---
  if want('F6'):
    f6 = sess.eval_json('window.__QA_SIM__.runPerfAudit()')
    f6_pass = (
        f6['rafP95'] <= f6['p95Limit']
        and f6['maxCalls'] <= 150
        and f6['maxTriangles'] <= 200000
        and abs(f6['geomDriftPct']) <= 5.0
        and abs(f6['texDriftPct']) <= 5.0
    )
    f6_meas = (
        f"p95={f6['rafP95']}ms (lim {f6['p95Limit']}ms), calls={f6['maxCalls']}, "
        f"tris={f6['maxTriangles']}, drift={f6['geomDriftPct']}%/{f6['texDriftPct']}%"
    )
    gates.append({
        'id': 'F6',
        'gate': 'F6 performance',
        'target': 'p95 <=25ms (or <=2x baseline), calls <=150, tris <=200k, <=5% mem drift',
        'measured': f6_meas,
        'passed': f6_pass,
        'details': f6,
    })

  # --- F7 Session Length ---
  if want('F7'):
    assert ideal_session is not None
    rand_sessions = []
    for s_idx in range(1, n_session_rand + 1):
      rs = sess.eval_json(
          f'window.__QA_SIM__.runFullSession({200 + s_idx}, "random", 30, {json.dumps(main_ids)}, {json.dumps(tier_ids)})'
      )
      rand_sessions.append(rs)
    ideal_min = ideal_session['minutes']
    rand_mins = [r['minutes'] for r in rand_sessions if r['completedAll']]
    med_rand_min = _median(rand_mins) if rand_mins else _median([r['minutes'] for r in rand_sessions])
    all_rand_done = sum(1 for r in rand_sessions if r['completedAll'])
    f7_pass = (
        ideal_session['completedAll']
        and ideal_min <= 14.0
        and len(rand_mins) >= math.ceil(0.8 * len(rand_sessions))
        and 15.0 <= med_rand_min <= 25.0
    )
    f7_meas = (
        f"ideal={ideal_min}m (done={ideal_session['completedAll']}), "
        f"rand med={med_rand_min}m ({all_rand_done}/{len(rand_sessions)} done)"
    )
    gates.append({
        'id': 'F7',
        'gate': 'F7 session length',
        'target': 'ideal full run <=14 min; random-ish median 15-25 min',
        'measured': f7_meas,
        'passed': f7_pass,
        'details': {'ideal': ideal_session, 'random': rand_sessions},
    })

  # --- F9 Rival Beat (Ender Steal + Lava-Ring Prison Rescue) ---
  if want('F9'):
    steal_cnt = sum(1 for r in ender_rand_runs if r['stealFired'])
    rescue_cnt = sum(
        1 for r in ender_rand_runs
        if r['done'] and r['prisonRescueS'] is not None and r['prisonRescueS'] <= 90.0
    )
    n_e = max(1, len(ender_rand_runs))
    steal_rate = steal_cnt / n_e
    rescue_rate = rescue_cnt / n_e
    med_rescue = _median([r['prisonRescueS'] for r in ender_rand_runs if r['prisonRescueS'] is not None])
    f9_pass = bool(ender_rand_runs) and steal_cnt == len(ender_rand_runs) and rescue_rate >= 0.90 - 1e-9
    f9_meas = (
        f'steal={steal_cnt}/{len(ender_rand_runs)} ({steal_rate * 100:.0f}%), '
        f'rescue <=90s={rescue_cnt}/{len(ender_rand_runs)} ({rescue_rate * 100:.0f}%, med {med_rescue}s)'
    )
    gates.append({
        'id': 'F9',
        'gate': 'F9 rival beat',
        'target': 'steal 100% seeds; prison rescue <=90s random-ish in >=90%',
        'measured': f9_meas,
        'passed': f9_pass,
        'details': {'runs': ender_rand_runs},
    })

  # --- F10 Show-Don't-Tell ---
  if want('F10'):
    ptr_rate = (
        (pointer_total_samples - pointer_total_nulls) / pointer_total_samples
        if pointer_total_samples > 0 else 0.0
    )
    f10_pass = (
        pointer_total_samples > 0
        and pointer_total_nulls == 0
        and len(cjk_all_violations) == 0
    )
    f10_meas = (
        f'pointer non-null={ptr_rate * 100:.1f}% ({pointer_total_samples - pointer_total_nulls}/{pointer_total_samples}), '
        f'>12 CJK strings={len(cjk_all_violations)}'
    )
    gates.append({
        'id': 'F10',
        'gate': "F10 show-don't-tell",
        'target': 'quest.pointer non-null 100% active frames; 0 HUD strings >12 CJK',
        'measured': f10_meas,
        'passed': f10_pass,
        'details': {
            'pointerSamples': pointer_total_samples,
            'pointerNulls': pointer_total_nulls,
            'cjkViolations': cjk_all_violations[:10],
        },
    })

  # --- F11 Determinism (3 seeds x 3600 frames) ---
  if want('F11'):
    det = sess.eval_json('window.__QA_SIM__.runDeterminismCheck([101, 202, 303])')
    det_ok_n = sum(1 for d in det if d['identical'] and d['frame1'] >= 3600)
    f11_pass = det_ok_n == 3
    first_diff = next((d['diff'] for d in det if d['diff']), None)
    f11_meas = f'{det_ok_n}/3 identical @ 3600f' + (f' (diff: {first_diff})' if first_diff else '')
    gates.append({
        'id': 'F11',
        'gate': 'F11 determinism',
        'target': 'same seed + input script -> identical getState() JSON @ 3600f (3/3)',
        'measured': f11_meas,
        'passed': f11_pass,
        'details': {'runs': det},
    })

  # --- F12 Multi-Viewport Layout ---
  if want('F12'):
    vp_results = []
    for w, h, mob in VIEWPORTS:
      vp_results.append(audit_viewport_on_session(sess, w, h, mob, save_shots=not quick))
    sess.set_viewport(1280, 800, mobile=False)
    sess.eval(INSTALL_SIM_HARNESS_JS)
    vp_ok_n = sum(1 for r in vp_results if r['passed'])
    f12_pass = vp_ok_n == len(VIEWPORTS)
    gates.append({
        'id': 'F12',
        'gate': 'F12 layout',
        'target': '4 viewports: 0 scrollbars, 0 overlaps, targets >=68px, <=5 play ctrls',
        'measured': f'{vp_ok_n}/{len(VIEWPORTS)} viewports pass',
        'passed': f12_pass,
        'details': {'viewports': vp_results},
    })

  # --- F13 Juice ---
  if want('F13'):
    sess.eval(INSTALL_SIM_HARNESS_JS)
    f13 = sess.eval_json(f'window.__QA_SIM__.runJuiceAudit({json.dumps(main_ids)})')
    q_ok_n = sum(1 for q in f13['perQuest'] if q['ok'])
    min_part = min((q['dParticles'] for q in f13['perQuest']), default=0)
    min_sfx = min((q['dSounds'] for q in f13['perQuest']), default=0)
    f13_pass = (q_ok_n == len(MAIN_QUESTS)) and bool(f13['perfectOk'])
    f13_meas = (
        f"quests={q_ok_n}/10 (min part={min_part}, sfx={min_sfx}), "
        f"perfect confetti={f13['perfectConfetti']}"
    )
    gates.append({
        'id': 'F13',
        'gate': 'F13 juice',
        'target': 'quest complete >=60 particles & >=1 sfx (0.5s); perfect >=150 confetti',
        'measured': f13_meas,
        'passed': f13_pass,
        'details': f13,
    })

  # --- F14 Persistence ---
  if want('F14'):
    f14 = measure_persistence_gate(sess)
    f14_meas = (
        f"key={f14.get('hasKey')}, board={f14.get('boardOk')}, "
        f"portraits={f14.get('portraitsOk')}, done={f14.get('doneOk')}, stars={f14.get('starsOk')}"
    )
    gates.append({
        'id': 'F14',
        'gate': 'F14 persistence',
        'target': 'reload mid-run -> board, portraits (<=12KB), stars, done quests restored',
        'measured': f14_meas,
        'passed': bool(f14['passed']),
        'details': f14,
    })

  # Sort gates F1..F14 in canonical §11 order.
  order_key = {f'F{i}': i for i in range(1, 15)}
  gates.sort(key=lambda g: order_key.get(g['id'], 99))

  diag = sess.collect_diagnostics()
  clean_diag = not (
      diag['window_errors'] + diag['exceptions'] + diag['console_errors'] + diag['http_errors']
  )
  report = {
      'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
      'quick': quick,
      'seeds': n_seeds,
      'all_passed': all(g['passed'] for g in gates) and clean_diag,
      'passed_count': sum(1 for g in gates if g['passed']),
      'total_gates': len(gates),
      'gates': gates,
      'diagnostics': diag,
  }

  os.makedirs(os.path.dirname(GATES_JSON_PATH), exist_ok=True)
  with open(GATES_JSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
  md = format_gates_markdown(report)
  with open(GATES_MD_PATH, 'w', encoding='utf-8') as f:
    f.write(md + '\n')
  return report


def format_gates_markdown(report: dict[str, Any]) -> str:
  lines = [
      '| Gate | Target | Measured | Result |',
      '|---|---|---|---|',
  ]
  for g in report['gates']:
    st = 'PASS' if g['passed'] else 'FAIL'
    lines.append(f"| {g['gate']} | {g['target']} | {g['measured']} | **{st}** |")

  f2_gate = next((g for g in report['gates'] if g['id'] == 'F2'), None)
  per_q = ((f2_gate or {}).get('details') or {}).get('per_quest') if f2_gate else None
  if per_q:
    lines.extend([
        '',
        '| Quest | Floor (s) | Ideal min / med / max (s) | Random-ish <=120s | Random-ish min / med / max (s) | Status |',
        '|---|---|---|---|---|---|',
    ])
    for qid, qd in per_q.items():
      q_ok = qd.get('ideal_ok') and str(qd.get('random_passes', '')).split('/')[0] == str(qd.get('random_passes', '')).split('/')[-1]
      lines.append(
          f"| `{qid}` | >= {qd.get('floor_s', 0):.0f} | "
          f"{qd.get('ideal_min_s', 0):.1f} / **{qd.get('ideal_med_s', 0):.1f}** / {qd.get('ideal_max_s', 0):.1f} | "
          f"{qd.get('random_passes')} | "
          f"{qd.get('random_min_s', 0):.1f} / **{qd.get('random_med_s', 0):.1f}** / {qd.get('random_max_s', 0):.1f} | "
          f"**{'PASS' if qd.get('ideal_ok') else 'TUNE'}** |"
      )
  return '\n'.join(lines)


def run_sim_gates(
    seeds_override: int = 0,
    quick: bool = False,
    quest_filter: list[str] | None = None,
    gate_filter: set[str] | None = None,
) -> dict[str, Any]:
  ensure_qa_dirs()
  if not os.path.exists(os.path.join(REPO_ROOT, 'index.html')):
    raise RuntimeError('index.html not yet created by @core')

  with QASession(width=1280, height=800, mobile=False) as sess:
    if not sess.goto('index.html', timeout=25.0):
      raise RuntimeError('Failed initial navigation to index.html for sim_gates')
    return run_sim_gates_on_session(
        sess,
        seeds_override=seeds_override,
        quick=quick,
        quest_filter=quest_filter,
        gate_filter=gate_filter,
    )


def main() -> int:
  ap = argparse.ArgumentParser(description='Run §11 Fun Gates (F1–F14) for Mob Beauty Pageant')
  ap.add_argument('--seeds', type=int, default=0, help='Override number of seeds per gate (default: 20)')
  ap.add_argument('--quick', action='store_true', help='Fast 4-seed subset for iterative checks')
  ap.add_argument('--quests', type=str, default='', help='Comma-separated quest IDs for F2 subset')
  ap.add_argument('--gates', type=str, default='', help='Comma-separated gate IDs, e.g. F1,F2,F11')
  args = ap.parse_args()

  q_filter = [x.strip() for x in args.quests.split(',') if x.strip()] if args.quests else None
  g_filter = {x.strip().upper() for x in args.gates.split(',') if x.strip()} if args.gates else None

  t0 = time.time()
  report = run_sim_gates(
      seeds_override=args.seeds,
      quick=args.quick,
      quest_filter=q_filter,
      gate_filter=g_filter,
  )
  dt = time.time() - t0
  print(format_gates_markdown(report))
  print(
      f"\nSIM_GATES {'PASS' if report['all_passed'] else 'FAIL'} "
      f"({report['passed_count']}/{report['total_gates']} gates, {dt:.1f}s) -> {GATES_JSON_PATH}"
  )
  return 0 if report['all_passed'] else 1


if __name__ == '__main__':
  sys.exit(main())
