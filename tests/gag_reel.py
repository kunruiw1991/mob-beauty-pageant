#!/usr/bin/env python3
"""Gag Reel generator for Mob Beauty Pageant (#172 Q2, owner: qa-sims).

Captures one 1280x800 JPEG per gagId at Gag-Cam mid-point covering:
  - All 18 docs/DESIGN.md §4 gags across quests 1..10 + H1..H2
  - rivalSteal + rivalRescued (§3.2 / §6.8)
  - Both hidden reveals: dragon_reveal (H1 4th-tap hatch) & pinksheep_reveal (H2 Bela hug)
  - Plus 2 bonus beats completing the 6x4 sheet: wither_sneeze_balloon (§6.9) & finale_kai_strut (§7)

Tiles all 24 shots (4 per row, 480x300 px each = 1920x1800 px) into:
  /tmp/bv1xyn/qa/gag_reel.jpg
Individual 1280x800 JPEGs are saved in:
  /tmp/bv1xyn/shots/qa/gag_<beatId>.jpg
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
from typing import Any

sys.dont_write_bytecode = True

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa_helpers import (  # noqa: E402
    QA_SHOTS_DIR,
    QA_TMP_DIR,
    QASession,
    ensure_qa_dirs,
)

GAG_REEL_PATH = os.path.join(QA_TMP_DIR, 'gag_reel.jpg')
GAG_MANIFEST_PATH = os.path.join(QA_TMP_DIR, 'gag_reel.json')

# Canonical ordered beat list (4 per row, 480x300 each -> 1920x1800 composite).
ORDERED_BEATS: list[tuple[str, str, str]] = [
    # (beat_id, quest_tag, caption)
    ('sheep_eats_bouquet', 'sheep', '#01 sheep · sheep_eats_bouquet'),
    ('kai_bounced', 'slime', '#02 slime · kai_bounced'),
    ('slime_pet', 'slime', '#03 slime · slime_pet'),
    ('cat_gift_kai_hat', 'cat', '#04 cat · cat_gift_kai_hat'),
    ('fake_iron', 'golem', '#05 golem · fake_iron'),
    ('kai_hogs_pumpkins', 'golem', '#06 golem · kai_hogs_pumpkins'),
    ('snow_head_pop', 'golem', '#07 golem · snow_head_pop'),
    ('kai_snowman', 'snow', '#08 snow · kai_snowman'),
    ('creeper_confetti', 'creeper', '#09 creeper · creeper_confetti'),
    ('kai_honey', 'bee', '#10 bee · kai_honey'),
    ('kai_steal', 'ender', '#11 ender · kai_steal'),
    ('rivalSteal', 'ender', '#12 ender · rivalSteal'),
    ('kai_cake_face', 'ender', '#13 ender · kai_cake_face'),
    ('rivalRescued', 'ender', '#14 ender · rivalRescued'),
    ('skeleton_bald', 'wither', '#15 wither · skeleton_bald'),
    ('wither_three_hats', 'wither', '#16 wither · wither_three_hats'),
    ('emerald_eyes', 'villager', '#17 villager · emerald_eyes'),
    ('kai_faint', 'villager', '#18 villager · kai_faint'),
    ('egg_hop', 'dragon', '#19 H1 dragon · egg_hop'),
    ('dragon_reveal', 'dragon', '#20 H1 · dragon_reveal'),
    ('pink_dye', 'pinksheep', '#21 H2 pinksheep · pink_dye'),
    ('pinksheep_reveal', 'pinksheep', '#22 H2 · pinksheep_reveal'),
    ('wither_sneeze_balloon', 'wither', '#23 wither · sneeze_balloon'),
    ('finale_kai_strut', 'finale', '#24 finale · kai_strut'),
]


INSTALL_GAG_DRIVER_JS = r"""
(() => {
  if (window.__GAG_REEL__) return true;
  const ctx = window.__CTX__;
  const P = window.__PAGEANT__;

  // Pause wall-clock sim steps while keeping rAF onRender() live for crisp WebGL screenshots!
  ctx?.loop?.setPaused?.(true);

  const state = {
    events: [],
    cursor: 0,
    dragonEggHops: 0,
    skeletonBaldSeen: 0,
  };

  if (ctx?.events?.on) {
    ctx.events.on('gag', (payload) => {
      state.events.push({
        type: 'gag',
        gagId: String(payload?.gagId || ''),
        questId: String(payload?.questId || P.getState()?.quest?.id || ''),
        frame: P.getState()?.frame || 0,
      });
    });
    ctx.events.on('rivalSteal', (payload) => {
      state.events.push({
        type: 'rivalSteal',
        contestantId: String(payload?.contestantId || 'ender'),
        frame: P.getState()?.frame || 0,
      });
    });
    ctx.events.on('rivalRescued', (payload) => {
      state.events.push({
        type: 'rivalRescued',
        contestantId: String(payload?.contestantId || 'ender'),
        frame: P.getState()?.frame || 0,
      });
    });
  }

  function dist2D(a, b) {
    if (!a || !b) return 999;
    return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
  }

  function setCrouch(crouching) {
    const c = window.__CTX__;
    if (c && c.player) {
      if (typeof c.player.setCrouch === 'function') c.player.setCrouch(crouching);
      if ('crouching' in c.player) c.player.crouching = Boolean(crouching);
    }
    window.dispatchEvent(new KeyboardEvent(crouching ? 'keydown' : 'keyup', { code: 'ShiftLeft', bubbles: true }));
  }

  async function waitTwoRafs() {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function startQuestSession(qid, seed = 2026) {
    setCrouch(false);
    await P.startGame({ seed });
    ctx?.loop?.setPaused?.(true);
    state.events.length = 0;
    state.cursor = 0;
    state.dragonEggHops = 0;
    state.skeletonBaldSeen = 0;
    await P.teleport(qid);
    for (let k = 0; k < 6; k++) await Promise.resolve();
    // Step past initial quest-intro cut (if any) until gagCam is inactive or 15 frames settle
    for (let i = 0; i < 90; i++) {
      P.stepFrames(1);
      if (state.events.length > state.cursor) break;
    }
    return P.getState();
  }

  // Advances quest simulation 1 frame at a time with ideal agent taps until the next target beat fires,
  // then steps to exact Gag-Cam mid-point and freezes for screenshot capture!
  async function runUntilBeat(qid, maxFrames = 9000) {
    let cooldown = 0;
    let lastTargetId = null;
    let stuckTicks = 0;

    for (let step = 0; step < maxFrames; step++) {
      // Check newly emitted events first
      if (state.cursor < state.events.length) {
        const batch = state.events.slice(state.cursor);
        state.cursor = state.events.length;

        const gags = batch.filter((e) => e.type === 'gag');
        const hasSteal = batch.some((e) => e.type === 'rivalSteal');
        const hasRescued = batch.some((e) => e.type === 'rivalRescued');

        // 1. Villager synchronous double-gag: emerald_eyes (0.85s = 51f) -> kai_faint (0.95s = 57f)
        if (gags.length >= 2) {
          P.stepFrames(25); // 0.42s = exact mid-point of first queued cut (emerald_eyes)
          await waitTwoRafs();
          return {
            beatId: gags[0].gagId,
            followUp: { kind: 'queued_second_gag', beatId: gags[1].gagId, framesToMid: 55, framesToClear: 34 },
            gagCam: P.getState().gagCam,
          };
        }

        // 2. Ender steal: kai_steal Gag-Cam (1.4s = 84f) followed by rivalSteal snatch sprint
        if (hasSteal && gags.length === 1 && gags[0].gagId === 'kai_steal') {
          P.stepFrames(40); // 0.67s = exact mid-point of kai_steal Gag-Cam
          await waitTwoRafs();
          return {
            beatId: 'kai_steal',
            followUp: { kind: 'ender_steal_snatch', beatId: 'rivalSteal' },
            gagCam: P.getState().gagCam,
          };
        }

        // 3. Ender rescue: kai_cake_face Gag-Cam (1.4s = 84f) followed by rivalRescued celebration outside prison
        if (hasRescued && gags.length === 1 && gags[0].gagId === 'kai_cake_face') {
          P.stepFrames(40); // 0.67s = exact mid-point of kai_cake_face Gag-Cam
          await waitTwoRafs();
          return {
            beatId: 'kai_cake_face',
            followUp: { kind: 'ender_rescued_celebrate', beatId: 'rivalRescued' },
            gagCam: P.getState().gagCam,
          };
        }

        // 4. Hidden H1 dragon: egg_hop fires on taps 1..3 AND tap 4 (hatch reveal!)
        if (qid === 'dragon' && gags.length === 1 && gags[0].gagId === 'egg_hop') {
          state.dragonEggHops += 1;
          if (state.dragonEggHops === 1) {
            P.stepFrames(40); // mid-point of 1st hop on tall End pillar
            await waitTwoRafs();
            return {
              beatId: 'egg_hop',
              followUp: { kind: 'clear_only', framesToClear: 48 },
              gagCam: P.getState().gagCam,
            };
          }
          if (state.dragonEggHops >= 4) {
            P.stepFrames(40); // mid-point of 4th tap hatch Gag-Cam on baby 龙宝宝!
            await waitTwoRafs();
            return {
              beatId: 'dragon_reveal',
              followUp: { kind: 'clear_only', framesToClear: 48 },
              gagCam: P.getState().gagCam,
            };
          }
          // Hops 2 & 3: skip past Gag-Cam
          P.stepFrames(88);
          continue;
        }

        // 5. Hidden H2 pinksheep: pink_dye (0.43s mid-puff) + pinksheep_reveal (0.97s Bela hug inside Gag-Cam!)
        if (qid === 'pinksheep' && gags.length === 1 && gags[0].gagId === 'pink_dye') {
          P.stepFrames(26);
          await waitTwoRafs();
          return {
            beatId: 'pink_dye',
            followUp: { kind: 'pinksheep_bela_hug', beatId: 'pinksheep_reveal' },
            gagCam: P.getState().gagCam,
          };
        }

        // 6. Wither: skeleton_bald fires 3x (capture 1st); wither_three_hats has follow-up sneeze->balloon!
        if (qid === 'wither' && gags.length === 1) {
          const gid = gags[0].gagId;
          if (gid === 'skeleton_bald') {
            state.skeletonBaldSeen += 1;
            if (state.skeletonBaldSeen === 1) {
              P.stepFrames(38);
              await waitTwoRafs();
              return {
                beatId: 'skeleton_bald',
                followUp: { kind: 'clear_only', framesToClear: 50 },
                gagCam: P.getState().gagCam,
              };
            }
            P.stepFrames(88);
            continue;
          }
          if (gid === 'wither_three_hats') {
            P.stepFrames(40);
            await waitTwoRafs();
            return {
              beatId: 'wither_three_hats',
              followUp: { kind: 'wither_sneeze_balloon', beatId: 'wither_sneeze_balloon' },
              gagCam: P.getState().gagCam,
            };
          }
        }

        // 7. Standard single §4 gag: step 40 frames (0.67s = exact mid-point of 1.4s Gag-Cam!)
        if (gags.length === 1) {
          P.stepFrames(40);
          await waitTwoRafs();
          return {
            beatId: gags[0].gagId,
            followUp: { kind: 'clear_only', framesToClear: 48 },
            gagCam: P.getState().gagCam,
          };
        }
      }

      const st = P.getState();
      if (st.scene !== 'world') {
        setCrouch(false);
        return { done: true, scene: st.scene };
      }

      if (st.gagCam && st.gagCam.active) {
        P.stepFrames(1);
        continue;
      }

      if (cooldown > 0) {
        cooldown -= 1;
        P.stepFrames(1);
        continue;
      }

      const act = st.quest && st.quest.action;
      const targets = P.listTargets() || [];

      if (qid === 'cat') {
        const hasRedLight = targets.some((t) => t.id === 'cat_wait_red');
        const hasCat = targets.some((t) => t.id === 'cat_target');
        const isHoldAction = act && (act.id === 'hold_still' || act.icon === '🤫');
        if (hasRedLight || isHoldAction) {
          setCrouch(false);
          if (ctx?.player?.stop) ctx.player.stop();
          cooldown = 12;
          P.stepFrames(1);
          continue;
        }
        setCrouch(Boolean(hasCat));
      }

      if (act && !(qid === 'cat' && (act.id === 'crouch_sneak' || act.id === 'hold_still'))) {
        P.pressAction();
        cooldown = 18;
        P.stepFrames(1);
        continue;
      }

      if (targets.length > 0) {
        if (st.player && st.player.moving && stuckTicks < 60) {
          stuckTicks += 1;
          P.stepFrames(1);
          continue;
        }
        stuckTicks = 0;
        const ppos = st.player;
        const sorted = [...targets].sort((a, b) => dist2D(ppos, a.pos) - dist2D(ppos, b.pos));
        let pick = sorted[0];
        if (sorted.length > 1 && pick.id === lastTargetId && dist2D(ppos, pick.pos) > 3.0) {
          pick = sorted[1];
        }
        lastTargetId = pick.id;
        P.tapTarget(pick.id);
        cooldown = 20;
      }

      P.stepFrames(1);
    }

    setCrouch(false);
    return { timeout: true };
  }

  async function runFollowUp(followUp) {
    if (!followUp) return null;
    if (followUp.kind === 'clear_only') {
      P.stepFrames(followUp.framesToClear || 48);
      return null;
    }
    if (followUp.kind === 'queued_second_gag') {
      P.stepFrames(followUp.framesToMid || 55);
      await waitTwoRafs();
      return { beatId: followUp.beatId, clearAfter: followUp.framesToClear || 34 };
    }
    if (followUp.kind === 'ender_steal_snatch') {
      // Finish kai_steal Gag-Cam (46f) + step 95f (1.58s into steal_cutscene when 小凯 snatches 小末 & sprints!)
      P.stepFrames(46);
      P.stepFrames(95);
      const kp = ctx?.rival?.actor?.group?.position || { x: 155.0, y: 8, z: 48.0 };
      ctx?.cam?.focus?.(
        { x: kp.x, y: (kp.y ?? 8) + 1.0, z: kp.z },
        { distance: 7.2, height: 2.4, yaw: 0.45, instant: true, manualClearOnly: true }
      );
      P.stepFrames(2);
      await waitTwoRafs();
      return { beatId: followUp.beatId, clearAfter: 4, clearFocus: true };
    }
    if (followUp.kind === 'ender_rescued_celebrate') {
      // Finish kai_cake_face Gag-Cam (46f) + step 46f (0.77s -> 小末 & player outside prison w/ hearts!)
      P.stepFrames(46);
      P.stepFrames(46);
      ctx?.cam?.focus?.(
        { x: 26.0, y: 8.95, z: 66.5 },
        { distance: 6.8, height: 2.25, yaw: 0.35, instant: true, manualClearOnly: true }
      );
      P.stepFrames(2);
      await waitTwoRafs();
      return { beatId: followUp.beatId, clearAfter: 4, clearFocus: true };
    }
    if (followUp.kind === 'pinksheep_bela_hug') {
      // Still inside pink_dye's 1.4s Gag-Cam: step 34 frames (total 60f = 1.0s) so 贝拉 arrives hugging 粉粉!
      P.stepFrames(34);
      await waitTwoRafs();
      return { beatId: followUp.beatId, clearAfter: 30 };
    }
    if (followUp.kind === 'wither_sneeze_balloon') {
      // Finish wither_three_hats Gag-Cam (46f) + step 95f (1.58s into summonClock -> blue skull pops into pink balloon + hearts!)
      P.stepFrames(46);
      P.stepFrames(95);
      ctx?.cam?.focus?.(
        { x: 216.5, y: 9.35, z: 25.8 },
        { distance: 7.2, height: 2.35, yaw: 0.75, instant: true, manualClearOnly: true }
      );
      P.stepFrames(2);
      await waitTwoRafs();
      return { beatId: followUp.beatId, clearAfter: 4, clearFocus: true };
    }
    return null;
  }

  async function finishFollowUpCleanup(res) {
    if (!res) return;
    if (res.clearFocus) {
      ctx?.cam?.clearFocus?.();
    }
    if (res.clearAfter) {
      P.stepFrames(res.clearAfter);
    }
  }

  async function captureFinaleKaiStrut() {
    setCrouch(false);
    await P.startGame({ seed: 77 });
    ctx?.loop?.setPaused?.(true);
    const mainIds = ['sheep', 'slime', 'cat', 'golem', 'snow', 'creeper', 'bee', 'ender', 'wither', 'villager'];
    for (const qid of mainIds) {
      await P.completeQuest(qid);
      for (let w = 0; w < 20 && P.getState().scene !== 'booth'; w++) {
        P.stepFrames(12);
        for (let k = 0; k < 6; k++) await Promise.resolve();
      }
      await P.boothChoose('crown');
      await P.boothSnap();
      for (let w = 0; w < 20 && P.getState().scene !== 'board'; w++) {
        P.stepFrames(12);
        for (let k = 0; k < 6; k++) await Promise.resolve();
      }
      await P.boardDrop(qid, 'perfect');
      for (let w = 0; w < 20; w++) {
        P.stepFrames(12);
        for (let k = 0; k < 6; k++) await Promise.resolve();
      }
      await P.continue();
      for (let w = 0; w < 25; w++) {
        P.stepFrames(12);
        for (let k = 0; k < 6; k++) await Promise.resolve();
        if (P.getState().scene === 'world' || P.getState().scene === 'finale') break;
      }
    }
    // Now in scene === 'finale' (2.4s = 144f runway walk of 小凯 w/ 4-tier junk-hat stack!)
    // Step ~65 frames to mid-runway pose!
    P.stepFrames(65);
    for (let k = 0; k < 6; k++) await Promise.resolve();
    await waitTwoRafs();
    return { scene: P.getState().scene };
  }

  // Offscreen canvas stitcher (4 tiles per row, 480x300 px each -> 1920 px wide)
  let reelCanvas = null;
  let reelCtx = null;

  function initReelCanvas(cols, rows, tileW, tileH) {
    reelCanvas = document.createElement('canvas');
    reelCanvas.width = cols * tileW;
    reelCanvas.height = rows * tileH;
    reelCtx = reelCanvas.getContext('2d');
    reelCtx.fillStyle = '#14151c';
    reelCtx.fillRect(0, 0, reelCanvas.width, reelCanvas.height);
    return { w: reelCanvas.width, h: reelCanvas.height };
  }

  async function drawReelTile(col, row, tileW, tileH, dataUrl, caption) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });
    const x = col * tileW;
    const y = row * tileH;
    reelCtx.save();
    reelCtx.imageSmoothingEnabled = true;
    reelCtx.imageSmoothingQuality = 'high';
    reelCtx.drawImage(img, x, y, tileW, tileH);

    // Subtle crisp tile border
    reelCtx.strokeStyle = 'rgba(255,255,255,0.22)';
    reelCtx.lineWidth = 2;
    reelCtx.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);

    // Compact bottom-left caption pill (< 8% height so subject & gag bubble stay 100% clear)
    reelCtx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    const padX = 8;
    const textW = Math.ceil(reelCtx.measureText(caption).width);
    const pillW = Math.min(tileW - 12, textW + padX * 2);
    const pillH = 22;
    const px = x + 6;
    const py = y + tileH - pillH - 6;

    reelCtx.fillStyle = 'rgba(18, 19, 28, 0.80)';
    reelCtx.fillRect(px, py, pillW, pillH);
    reelCtx.strokeStyle = '#ffd43b';
    reelCtx.lineWidth = 1.5;
    reelCtx.strokeRect(px, py, pillW, pillH);

    reelCtx.fillStyle = '#fff9db';
    reelCtx.textBaseline = 'middle';
    reelCtx.fillText(caption, px + padX, py + pillH * 0.5 + 0.5);
    reelCtx.restore();
    return true;
  }

  function exportReelJpeg(quality = 0.90) {
    return reelCanvas.toDataURL('image/jpeg', quality);
  }

  window.__GAG_REEL__ = {
    startQuestSession,
    runUntilBeat,
    runFollowUp,
    finishFollowUpCleanup,
    captureFinaleKaiStrut,
    initReelCanvas,
    drawReelTile,
    exportReelJpeg,
  };
  return true;
})();
"""


QUEST_CAPTURE_PLAN: list[tuple[str, list[str]]] = [
    ('sheep', ['sheep_eats_bouquet']),
    ('slime', ['kai_bounced', 'slime_pet']),
    ('cat', ['cat_gift_kai_hat']),
    ('golem', ['fake_iron', 'kai_hogs_pumpkins', 'snow_head_pop']),
    ('snow', ['kai_snowman']),
    ('creeper', ['creeper_confetti']),
    ('bee', ['kai_honey']),
    ('ender', ['kai_steal', 'rivalSteal', 'kai_cake_face', 'rivalRescued']),
    ('wither', ['skeleton_bald', 'wither_three_hats', 'wither_sneeze_balloon']),
    ('villager', ['emerald_eyes', 'kai_faint']),
    ('dragon', ['egg_hop', 'dragon_reveal']),
    ('pinksheep', ['pink_dye', 'pinksheep_reveal']),
]


def main() -> int:
  t0 = time.time()
  ensure_qa_dirs()
  captured: dict[str, str] = {}

  with QASession(width=1280, height=800, mobile=False) as sess:
    sess.clear_diagnostics()
    if not sess.goto('index.html', timeout=30.0):
      raise RuntimeError('Failed to load index.html for gag_reel.py')

    sess.eval(INSTALL_GAG_DRIVER_JS)

    for idx, (qid, expected_beats) in enumerate(QUEST_CAPTURE_PLAN):
      sess.eval_json(f'window.__GAG_REEL__.startQuestSession({json.dumps(qid)}, {2026 + idx})')
      remaining = set(expected_beats)
      guard = 0
      while remaining and guard < 12:
        guard += 1
        hit = sess.eval_json(f'window.__GAG_REEL__.runUntilBeat({json.dumps(qid)}, 10000)')
        if not hit or hit.get('timeout') or hit.get('done'):
          raise RuntimeError(f'Quest {qid} ended before capturing {sorted(remaining)}: {hit}')

        beat_id = hit.get('beatId')
        if beat_id:
          shot_path = sess.screenshot(f'gag_{beat_id}.jpg', quality=90)
          captured[beat_id] = shot_path
          remaining.discard(beat_id)
          print(f'  [gag] {beat_id:24s} -> {shot_path}')

        follow_up = hit.get('followUp')
        if follow_up:
          fu_res = sess.eval_json(f'window.__GAG_REEL__.runFollowUp({json.dumps(follow_up)})')
          if fu_res and fu_res.get('beatId'):
            fu_beat = fu_res['beatId']
            shot_path = sess.screenshot(f'gag_{fu_beat}.jpg', quality=90)
            captured[fu_beat] = shot_path
            remaining.discard(fu_beat)
            print(f'  [gag] {fu_beat:24s} -> {shot_path}')
          sess.eval_json(f'window.__GAG_REEL__.finishFollowUpCleanup({json.dumps(fu_res)})')

    # Finale bonus tile (#24: 小凯 junk-hat runway strut)
    sess.eval_json('window.__GAG_REEL__.captureFinaleKaiStrut()')
    finale_shot = sess.screenshot('gag_finale_kai_strut.jpg', quality=90)
    captured['finale_kai_strut'] = finale_shot
    print(f'  [gag] {"finale_kai_strut":24s} -> {finale_shot}')

    missing = [b for b, _, _ in ORDERED_BEATS if b not in captured]
    if missing:
      raise RuntimeError(f'Missing gag shots: {missing}')

    # Stitch 4 per row, 480x300 px each (1920x1800 composite JPEG)
    cols = 4
    tile_w = 480
    tile_h = 300
    rows = (len(ORDERED_BEATS) + cols - 1) // cols
    dims = sess.eval_json(f'window.__GAG_REEL__.initReelCanvas({cols}, {rows}, {tile_w}, {tile_h})')

    for i, (beat_id, _qtag, caption) in enumerate(ORDERED_BEATS):
      col = i % cols
      row = i // cols
      with open(captured[beat_id], 'rb') as fp:
        b64 = base64.b64encode(fp.read()).decode('ascii')
      data_url = f'data:image/jpeg;base64,{b64}'
      sess.eval_json(
          f'window.__GAG_REEL__.drawReelTile({col}, {row}, {tile_w}, {tile_h},'
          f' {json.dumps(data_url)}, {json.dumps(caption)})'
      )

    reel_data_url = sess.eval('window.__GAG_REEL__.exportReelJpeg(0.90)')
    if not isinstance(reel_data_url, str) or not reel_data_url.startswith('data:image/jpeg;base64,'):
      raise RuntimeError('Failed to export gag_reel.jpg dataURL from canvas')

    raw_jpeg = base64.b64decode(reel_data_url.split(',', 1)[1])
    with open(GAG_REEL_PATH, 'wb') as fp:
      fp.write(raw_jpeg)

    sess.assert_clean('gag_reel')

  manifest: dict[str, Any] = {
      'composite': GAG_REEL_PATH,
      'width': dims['w'],
      'height': dims['h'],
      'cols': cols,
      'rows': rows,
      'tileWidth': tile_w,
      'tileHeight': tile_h,
      'count': len(ORDERED_BEATS),
      'elapsedSec': round(time.time() - t0, 2),
      'tiles': [
          {'index': i + 1, 'beatId': b, 'quest': q, 'caption': cap, 'shot': captured[b]}
          for i, (b, q, cap) in enumerate(ORDERED_BEATS)
      ],
  }
  with open(GAG_MANIFEST_PATH, 'w', encoding='utf-8') as fp:
    json.dump(manifest, fp, ensure_ascii=False, indent=2)

  print(
      f'GAG_REEL_OK tiles={len(ORDERED_BEATS)} size={dims["w"]}x{dims["h"]}'
      f' bytes={os.path.getsize(GAG_REEL_PATH)} out={GAG_REEL_PATH}'
      f' elapsed={manifest["elapsedSec"]}s'
  )
  return 0


if __name__ == '__main__':
  sys.exit(main())
