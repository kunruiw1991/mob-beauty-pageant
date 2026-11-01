#!/usr/bin/env python3
"""v1.1 E2E checks (faster walking, English, voice-over) for Mob Beauty Pageant — wired into tests/run_e2e.py.

T37 movement: walk 6.5 b/s / long walk 7.8 / sneak 2.4 exposed in getState().config and measured in-sim, leg cadence
    scales with speed, the follow camera keeps the player centred (lag <= ~0.55 block) at both speeds.
T38 voice assets: every clip id the triggers reference exists in the manifest + on disk, decodes, <= 6 MB, English.
T39 voice playback: after a real (CDP) user gesture the welcome line plays with a big English subtitle and ducked
    BGM; the sheep quest sim plays more lines; state.stats.voice > 0; 0 console errors.
T40 voice toggle: pause-menu Voice toggle stops narration, persists in pageant_progress.voiceOff across reloads;
    pause card passes the layout audit; the in-play controls cap (<= 5) still holds.
T41 subtitle placement: at 1280x800, 1024x768, 844x390, 390x844 the subtitle never overlaps a button, draggable
    card, tray or the objective strip in world, booth and board.
T42 English only: no [\\u4e00-\\u9fff] in document.title, body innerText, aria-label/title attributes or any canvas
    fillText/strokeText call across title -> world -> booth -> board -> finale -> final screen.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

from qa_helpers import REPO_ROOT, QASession, VIEWPORTS

CJK_RE = re.compile(r'[\u4e00-\u9fff]')
MAX_VOICE_BYTES = 6 * 1024 * 1024


def _wait_until(sess: QASession, expr: str, timeout: float = 4.0, step: float = 0.1) -> Any:
  t0 = time.time()
  last = None
  while time.time() - t0 < timeout:
    last = sess.eval_json(expr)
    if last:
      return last
    time.sleep(step)
  return last


def _tap_title_play(sess: QASession) -> dict[str, Any]:
  """Real CDP pointer tap on the title ▶ button: a genuine user gesture (unlocks WebAudio) that starts the game."""
  r = sess.eval_json("""(() => {
    const b = document.getElementById('btn-title-play') || document.querySelector('#title button');
    if (!b) return null;
    const rc = b.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
  })()""")
  assert r, 'title play button not found'
  sess.mouse_tap(r['x'], r['y'])
  ok = _wait_until(sess, "window.__PAGEANT__.getState().scene === 'world'", timeout=6.0)
  assert ok, 'title ▶ tap did not start the game'
  return r


# ---------------------------------------------------------------------------------------------------------------
# T37 — movement speed, gait cadence, camera follow
# ---------------------------------------------------------------------------------------------------------------

MEASURE_WALK_JS = r"""
(async (destX, destZ, fromX, fromZ) => {
  const P = window.__PAGEANT__;
  const C = window.__CTX__;
  const pl = C.player;
  const y0 = C.world.surfaceY(Math.floor(fromX), Math.floor(fromZ));
  pl.setPosition(fromX, y0, fromZ);
  C.cam.clearFocus();
  C.cam.setMode('follow');
  C.cam.snap();
  P.stepFrames(30);
  if (C.cam.mode !== 'follow') return { ok: false, reason: `camera mode ${C.cam.mode}` };
  const settled = C.pick.worldToScreen({ x: pl.pos.x, y: pl.pos.y + 0.95, z: pl.pos.z });
  const dest = pl.walkTo({ x: destX, y: C.world.surfaceY(Math.floor(destX), Math.floor(destZ)), z: destZ }, { maxSearchR: 4 });
  if (!dest) return { ok: false, reason: 'no path' };
  let travelled = 0, frames = 0, prev = { x: pl.pos.x, z: pl.pos.z };
  const offs = [];
  let maxGait = 0, anims = new Set(), steady = [];
  for (let i = 0; i < 900 && pl.isMoving(); i++) {
    P.stepFrames(1);
    const d = Math.hypot(pl.pos.x - prev.x, pl.pos.z - prev.z);
    prev = { x: pl.pos.x, z: pl.pos.z };
    if (pl.isMoving()) { travelled += d; frames += 1; }
    maxGait = Math.max(maxGait, pl.actor.gaitRate || 0);
    anims.add(pl.actor.anim);
    if (frames > 45 && pl.isMoving() && C.cam.mode === 'follow') {
      const s = C.pick.worldToScreen({ x: pl.pos.x, y: pl.pos.y + 0.95, z: pl.pos.z });
      steady.push(Math.hypot(s.sx - settled.sx, s.sy - settled.sy));
    }
  }
  steady.sort((a, b) => a - b);
  const p90 = steady.length ? steady[Math.floor(steady.length * 0.9)] : 0;
  return {
    ok: true,
    frames,
    travelled: Math.round(travelled * 100) / 100,
    speed: frames ? Math.round((travelled / (frames / 60)) * 100) / 100 : 0,
    gaitRate: Math.round(maxGait * 1000) / 1000,
    anims: [...anims],
    camOffsetP90px: Math.round(p90 * 10) / 10,
    samples: steady.length,
    vh: window.innerHeight,
  };
})
"""


def t37_movement_speed_gait_and_camera_follow(sess: QASession) -> None:
  sess.set_viewport(1280, 800, mobile=False)
  assert sess.goto('index.html', timeout=25.0)
  cfg = sess.eval_json("""(async () => {
    const P = window.__PAGEANT__;
    await P.startGame({ seed: 7 });
    P.stepFrames(5);
    return P.getState().config;
  })()""")
  assert cfg and abs(cfg['walkSpeed'] - 6.5) < 1e-6, f'config.walkSpeed != 6.5: {cfg}'
  assert abs(cfg['longWalkSpeed'] - 7.8) < 1e-6 and abs(cfg['sneakSpeed'] - 2.4) < 1e-6, f'config: {cfg}'

  # Short walk (16 blocks, walk gait) east along z=62.5; long walk (36 blocks, run gait) north along x=60.5 — both
  # straight, flat (y=8) and outside the sheep beacon's auto-start zone (no camera intro cut mid-measurement).
  walk = sess.eval_json(f'({MEASURE_WALK_JS})(52.5, 62.5, 36.5, 62.5)')
  assert walk['ok'], f'walk measure failed: {walk}'
  assert 6.2 <= walk['speed'] <= 6.8, f'walk speed {walk["speed"]} b/s not ~6.5: {walk}'
  assert abs(walk['gaitRate'] - 6.5 / 4.3) < 0.02, f'walk leg cadence not scaled with speed: {walk}'
  run = sess.eval_json(f'({MEASURE_WALK_JS})(60.5, 30.5, 60.5, 66.5)')
  assert run['ok'], f'run measure failed: {run}'
  assert 7.3 <= run['speed'] <= 8.1, f'long-walk speed {run["speed"]} b/s not ~7.8: {run}'
  assert 'run' in run['anims'] and abs(run['gaitRate'] - 7.8 / 5.2) < 0.02, f'run cadence: {run}'
  # Camera never trails far behind: steady-state on-screen drift vs the settled framing <= 36 px (~0.55 block).
  for tag, r in (('walk', walk), ('run', run)):
    assert r['samples'] > 10, f'{tag}: too few steady samples {r}'
    assert r['camOffsetP90px'] <= 36, f'{tag}: follow camera lags {r["camOffsetP90px"]} px at {r["speed"]} b/s'
  sess.assert_clean('T37')
  print(f'    T37 walk={walk["speed"]} b/s gait×{walk["gaitRate"]} cam p90={walk["camOffsetP90px"]}px | '
        f'run={run["speed"]} b/s gait×{run["gaitRate"]} cam p90={run["camOffsetP90px"]}px')


# ---------------------------------------------------------------------------------------------------------------
# T38 — voice assets
# ---------------------------------------------------------------------------------------------------------------

def t38_voice_clips_referenced_present_decodable_and_in_budget(sess: QASession) -> None:
  assert sess.goto('index.html', timeout=25.0)
  meta = sess.eval_json("""(async () => {
    const v = await import('./src/fx/voice.js');
    const d = await import('./src/data/voice_lines.js');
    return {
      ref: v.REFERENCED_VOICE_IDS,
      lines: Object.fromEntries(Object.entries(d.VOICE_LINES).map(([k, l]) => [k, { file: l.file, text: l.text, dur: l.dur }])),
      base: d.VOICE_BASE,
    };
  })()""")
  lines = meta['lines']
  missing = sorted(set(meta['ref']) - set(lines))
  unused = sorted(set(lines) - set(meta['ref']))
  assert not missing, f'referenced voice ids missing from manifest: {missing}'
  assert not unused, f'manifest clips never triggered: {unused}'
  assert 60 <= len(lines) <= 90, f'clip count {len(lines)} outside 60..90'
  total = 0
  for lid, l in lines.items():
    path = os.path.join(REPO_ROOT, 'assets', 'voice', l['file'])
    assert os.path.exists(path), f'missing clip file for {lid}: {path}'
    total += os.path.getsize(path)
    assert not CJK_RE.search(l['text']) and len(l['text']) <= 90, f'bad subtitle text {lid}: {l["text"]}'
  assert total <= MAX_VOICE_BYTES, f'voice clips {total} B exceed 6 MB'
  ver = sess.eval_json('window.__CTX__.voice.verifyAll()')
  assert ver['ok'] == len(lines) and not ver['failed'], f'clips failed to fetch/decode: {ver}'
  sess.assert_clean('T38')
  print(f'    T38 clips={len(lines)} total={total / 1048576:.2f} MB decoded={ver["ok"]} audio={ver["totalSec"]} s')


# ---------------------------------------------------------------------------------------------------------------
# T39 — playback after a real gesture
# ---------------------------------------------------------------------------------------------------------------

VOICE_INFO = 'window.__PAGEANT__.voiceInfo()'


def t39_voice_plays_with_subtitle_and_duck_after_gesture(sess: QASession) -> None:
  from sim_gates import INSTALL_SIM_HARNESS_JS  # noqa: PLC0415

  sess.set_viewport(1280, 800, mobile=False)
  assert sess.goto('index.html', timeout=25.0)
  sess.clear_diagnostics()
  _tap_title_play(sess)
  live = _wait_until(sess, f'(() => {{ const v = {VOICE_INFO}; return v && v.played >= 1 && v.subtitle.visible ? v : null; }})()',
                     timeout=5.0)
  assert live, f'welcome line did not play after the ▶ gesture: {sess.eval_json(VOICE_INFO)}'
  assert live['unlocked'] and live['musicDucked'], f'audio not unlocked / BGM not ducked while speaking: {live}'
  assert live['lastId'] in ('narr_welcome', 'narr_welcome_back'), f'unexpected first line: {live}'
  sub = sess.eval_json("""(() => {
    const el = document.getElementById('voice-subtitle');
    const t = el && el.querySelector('.voice-subtitle-text');
    const cs = el ? getComputedStyle(el) : null;
    return el ? { text: el.textContent, fontPx: parseFloat(cs.fontSize), pe: cs.pointerEvents } : null;
  })()""")
  assert sub and sub['fontPx'] >= 20 and sub['pe'] == 'none', f'subtitle style: {sub}'
  assert not CJK_RE.search(sub['text']) and len(sub['text']) > 5, f'subtitle text: {sub}'
  shot = sess.screenshot('v11_voice_subtitle_world.jpg', quality=82)

  before = sess.eval_json(VOICE_INFO)['played']
  sess.eval(INSTALL_SIM_HARNESS_JS)
  ep = sess.eval_json('window.__QA_SIM__.runQuestEpisode("sheep", 3, "ideal", true, 105)')
  assert ep and ep.get('done'), f'sheep quest sim did not complete: {json.dumps(ep)[:300]}'
  after = _wait_until(
      sess, f'(() => {{ const v = {VOICE_INFO}; return v.played > {before} ? v : null; }})()', timeout=5.0)
  assert after, f'no voice line played during/after the sheep quest: {sess.eval_json(VOICE_INFO)}'
  st = sess.eval_json('window.__PAGEANT__.getState().stats')
  assert st.get('voice', 0) > 0, f'state.stats.voice not counting: {st}'
  time.sleep(0.4)
  sess.assert_clean('T39')
  print(f'    T39 played={after["played"]} requested={after["requested"]} failed={after["failed"]} '
        f'last={after["lastId"]} stats.voice={st["voice"]} shot={shot}')


# ---------------------------------------------------------------------------------------------------------------
# T40 — toggle + persistence + caps
# ---------------------------------------------------------------------------------------------------------------

def _click_el(sess: QASession, selector: str) -> None:
  r = sess.eval_json(f"""(() => {{
    const b = document.querySelector({json.dumps(selector)});
    if (!b || b.hidden) return null;
    const rc = b.getBoundingClientRect();
    return rc.width > 1 ? {{ x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }} : null;
  }})()""")
  assert r, f'{selector} not visible'
  sess.mouse_tap(r['x'], r['y'])
  time.sleep(0.35)  # bindTap debounce (280 ms)


def t40_voice_toggle_persists_and_controls_cap(sess: QASession) -> None:
  from layout_audit import AUDIT_SCENE_DOM_JS  # noqa: PLC0415

  sess.set_viewport(1280, 800, mobile=False)
  assert sess.goto('index.html', timeout=25.0)
  sess.eval("localStorage.removeItem('pageant_progress'); true")
  assert sess.goto('index.html', timeout=25.0)
  _tap_title_play(sess)
  time.sleep(0.3)
  world = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("world")')
  assert world['controlCount'] <= 5 and world['passed'], f'in-play HUD audit failed: {world}'

  _click_el(sess, '#hud-pause-btn')
  for w, h, mob in ((1280, 800, False), (844, 390, True), (390, 844, True)):
    sess.set_viewport(w, h, mobile=mob)
    pause = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("pause")')
    labels = [c['desc'] for c in pause['controls']]
    assert any('btn-pause-voice' in d for d in labels), f'Voice toggle missing from pause menu: {labels}'
    assert not pause['undersizedControls'] and not pause['overlaps'] and not pause['clippedText'], \
        f'pause menu layout at {w}x{h}: {pause}'
  sess.set_viewport(1280, 800, mobile=False)
  _click_el(sess, '#btn-pause-voice')
  off = sess.eval_json(f"""(() => ({{ v: {VOICE_INFO}, saved: JSON.parse(localStorage.getItem('pageant_progress') || '{{}}').voiceOff,
    label: document.getElementById('btn-pause-voice').textContent }}))()""")
  assert off['v']['enabled'] is False and off['saved'] is True, f'voice toggle off not applied/persisted: {off}'
  assert not off['v']['subtitle']['visible'], f'subtitle still visible after voice off: {off}'
  played0 = off['v']['played']
  sess.eval('window.__CTX__.voice.say("narr_next"); true')
  time.sleep(0.6)
  assert sess.eval_json(VOICE_INFO)['played'] == played0, 'a line played while voice was off'

  assert sess.reload(timeout=25.0)
  persisted = sess.eval_json(VOICE_INFO)
  assert persisted['enabled'] is False, f'voiceOff not restored after reload: {persisted}'
  _tap_title_play(sess)
  _click_el(sess, '#hud-pause-btn')
  _click_el(sess, '#btn-pause-voice')
  on = sess.eval_json(f"""(() => ({{ v: {VOICE_INFO}, saved: JSON.parse(localStorage.getItem('pageant_progress') || '{{}}').voiceOff }}))()""")
  assert on['v']['enabled'] is True and on['saved'] is False, f'voice toggle back on failed: {on}'
  _click_el(sess, '#btn-pause-resume')
  sess.assert_clean('T40')


# ---------------------------------------------------------------------------------------------------------------
# T41 — subtitle placement
# ---------------------------------------------------------------------------------------------------------------

SUBTITLE_OVERLAP_JS = r"""
(() => {
  const sub = document.getElementById('voice-subtitle');
  if (!sub || sub.hidden) return { visible: false };
  const vis = (el) => {
    if (!el || el.hidden) return false;
    let c = el;
    while (c && c !== document.documentElement) {
      if (c.hidden) return false;
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') <= 0.05) return false;
      c = c.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const s = sub.getBoundingClientRect();
  const hits = [];
  for (const el of document.querySelectorAll('button, [role="button"], [data-draggable="true"], #hud-objective, .booth-tray, .board-tray')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const ox = Math.min(r.right, s.right) - Math.max(r.left, s.left);
    const oy = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    if (ox > 2 && oy > 2) hits.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(' ')[0]}`);
  }
  return {
    visible: true, hits,
    inViewport: s.left >= 0 && s.top >= 0 && s.right <= innerWidth + 0.5 && s.bottom <= innerHeight + 0.5,
    rect: [Math.round(s.left), Math.round(s.top), Math.round(s.width), Math.round(s.height)],
    fontPx: parseFloat(getComputedStyle(sub).fontSize),
  };
})()
"""


def _show_line_and_check(sess: QASession, line_id: str, tag: str) -> dict[str, Any]:
  sess.eval(f'window.__CTX__.voice.say({json.dumps(line_id)}); true')
  # Wait until THIS line's subtitle is up (not the previous scene's line), then one placement tick (200 ms).
  shown = _wait_until(sess, f'''(async () => {{
    const d = await import('./src/data/voice_lines.js');
    const el = document.getElementById('voice-subtitle');
    return Boolean(el && !el.hidden && el.textContent === d.VOICE_LINES[{json.dumps(line_id)}].text);
  }})()''', timeout=4.0)
  assert shown, f'{tag}: subtitle for {line_id} never showed: {sess.eval_json(VOICE_INFO)}'
  time.sleep(0.25)
  res = _wait_until(sess, f'(() => {{ const r = {SUBTITLE_OVERLAP_JS}; return r.visible ? r : null; }})()', timeout=2.0)
  assert res, f'{tag}: subtitle for {line_id} never became visible: {sess.eval_json(VOICE_INFO)}'
  assert not res['hits'] and res['inViewport'] and res['fontPx'] >= 20, f'{tag}: subtitle placement {res}'
  return res


def t41_subtitle_never_covers_controls_4_viewports(sess: QASession) -> None:
  for w, h, mob in VIEWPORTS:
    tag = f'{w}x{h}'
    sess.set_viewport(w, h, mobile=mob)
    assert sess.goto('index.html', timeout=25.0)
    sess.set_viewport(w, h, mobile=mob)
    _tap_title_play(sess)
    sess.eval_json("""(async () => { const P = window.__PAGEANT__; await P.teleport('sheep'); P.stepFrames(30);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()""")
    _show_line_and_check(sess, 'narr_next', f'{tag} world')
    sess.eval_json("""(async () => { const P = window.__PAGEANT__; await P.completeQuest('sheep');
      for (let k = 0; k < 4; k++) await Promise.resolve(); P.stepFrames(160);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return P.getState().scene; })()""")
    _show_line_and_check(sess, 'narr_booth', f'{tag} booth')
    sess.eval_json("""(async () => { const P = window.__PAGEANT__; await P.boothChoose('flowerCrown'); await P.boothSnap();
      for (let k = 0; k < 6; k++) await Promise.resolve(); P.stepFrames(45);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return P.getState().scene; })()""")
    res = _show_line_and_check(sess, 'narr_board', f'{tag} board')
    if (w, h) == (844, 390):
      sess.screenshot('v11_voice_subtitle_board_844x390.jpg', quality=80)
    print(f'    T41 {tag}: board subtitle rect={res["rect"]}')
  sess.set_viewport(1280, 800, mobile=False)
  sess.assert_clean('T41')


# ---------------------------------------------------------------------------------------------------------------
# T42 — English only (DOM + canvas text draw calls)
# ---------------------------------------------------------------------------------------------------------------

CANVAS_HOOK_JS = r"""
(() => {
  if (window.__CANVAS_TEXTS__) return;
  window.__CANVAS_TEXTS__ = [];
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText']) {
    const orig = P[fn];
    P[fn] = function (text, ...rest) {
      try { if (window.__CANVAS_TEXTS__.length < 5000) window.__CANVAS_TEXTS__.push(String(text)); } catch (_) {}
      return orig.call(this, text, ...rest);
    };
  }
})();
"""

COLLECT_TEXT_JS = r"""
(() => {
  const re = /[\u4e00-\u9fff]/;
  const bad = [];
  if (re.test(document.title)) bad.push(`title: ${document.title}`);
  if (re.test(document.documentElement.lang || '') || !/^en/i.test(document.documentElement.lang || '')) bad.push(`lang=${document.documentElement.lang}`);
  const body = document.body.innerText || '';
  for (const line of body.split('\n')) if (re.test(line)) bad.push(`dom: ${line.slice(0, 60)}`);
  for (const el of document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && re.test(v)) bad.push(`${a}: ${v}`);
    }
  }
  const canv = (window.__CANVAS_TEXTS__ || []).filter((t) => re.test(t));
  for (const t of canv.slice(0, 10)) bad.push(`canvas: ${t}`);
  return { bad, canvasCalls: (window.__CANVAS_TEXTS__ || []).length, bodyChars: body.length };
})()
"""


def t42_english_only_dom_and_canvas_text(sess: QASession) -> None:
  assert sess.b is not None
  sess.b.cmd('Page.addScriptToEvaluateOnNewDocument', source=CANVAS_HOOK_JS)
  sess.set_viewport(1280, 800, mobile=False)
  assert sess.goto('index.html', timeout=25.0)
  findings: list[str] = []
  calls = 0

  def snap(stage: str) -> None:
    nonlocal calls
    r = sess.eval_json(COLLECT_TEXT_JS)
    calls = max(calls, r['canvasCalls'])
    findings.extend(f'{stage}: {b}' for b in r['bad'])

  sess.wait_raf(3)
  snap('title')
  _tap_title_play(sess)
  sess.eval_json("""(async () => { const P = window.__PAGEANT__; await P.teleport('sheep'); P.stepFrames(60);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()""")
  sess.eval('window.__CTX__.voice.say("sheep_intro"); true')
  time.sleep(0.5)
  snap('world')
  # Pause menu
  sess.eval_json("""(async () => { document.getElementById('hud-pause-btn').click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()""")
  snap('pause')
  sess.eval_json("""(async () => { document.getElementById('btn-pause-resume').click();
    await new Promise(r => setTimeout(r, 350)); return true; })()""")
  # Every main quest -> booth -> board (rank each into a different row) -> finale -> final screen
  sess.eval_json("""(async () => {
    const P = window.__PAGEANT__;
    const ids = ['sheep','slime','cat','golem','snow','creeper','bee','ender','wither','villager'];
    const tiers = ['perfect','gorgeous','pretty','okay','tryhard'];
    for (let i = 0; i < ids.length; i++) {
      await P.teleport(ids[i]); P.stepFrames(30);
      await P.completeQuest(ids[i]);
      for (let k = 0; k < 4; k++) await Promise.resolve();
      P.stepFrames(120);
      await P.boothChoose(null); await P.boothSnap();
      for (let k = 0; k < 6; k++) await Promise.resolve();
      P.stepFrames(40);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (i === 0) window.__BOARD_SNAPSHOT__ = document.body.innerText;
      await P.boardDrop(ids[i], tiers[i % 5]);
      for (let k = 0; k < 6; k++) await Promise.resolve();
      P.stepFrames(200);
      await P.continue();
      P.stepFrames(120);
    }
    return P.getState().scene;
  })()""")
  board_txt = sess.eval('window.__BOARD_SNAPSHOT__ || ""') or ''
  if CJK_RE.search(board_txt):
    findings.append('board: ' + ' | '.join(l for l in board_txt.split('\n') if CJK_RE.search(l))[:200])
  snap('after-10-quests')
  # Finale: rank Kai, then the final leaderboard
  sess.eval_json("""(async () => {
    const P = window.__PAGEANT__;
    for (let i = 0; i < 40 && P.getState().scene !== 'board'; i++) { P.stepFrames(30); await Promise.resolve(); }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return P.getState().scene;
  })()""")
  snap('finale-board')
  sess.eval_json("""(async () => {
    const P = window.__PAGEANT__;
    await P.boardDrop('kai', 'perfect');
    for (let i = 0; i < 40 && P.getState().scene !== 'final'; i++) { P.stepFrames(30); await Promise.resolve(); }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return P.getState().scene;
  })()""")
  snap('final')
  assert calls > 0, 'canvas text hook recorded nothing (hook not installed?)'
  assert not findings, f'Chinese characters still visible: {findings[:12]}'
  sess.assert_clean('T42')
  print(f'    T42 0 CJK across title/world/pause/booth/board/finale/final; canvas text calls inspected={calls}')


V11_TESTS = [
    ('T37_movement_speed_gait_and_camera_follow', t37_movement_speed_gait_and_camera_follow),
    ('T38_voice_clips_referenced_present_decodable_and_in_budget', t38_voice_clips_referenced_present_decodable_and_in_budget),
    ('T39_voice_plays_with_subtitle_and_duck_after_gesture', t39_voice_plays_with_subtitle_and_duck_after_gesture),
    ('T40_voice_toggle_persists_and_controls_cap', t40_voice_toggle_persists_and_controls_cap),
    ('T41_subtitle_never_covers_controls_4_viewports', t41_subtitle_never_covers_controls_4_viewports),
    ('T42_english_only_dom_and_canvas_text', t42_english_only_dom_and_canvas_text),
]
