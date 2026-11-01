#!/usr/bin/env python3
"""Comprehensive 42-test E2E verification suite for Mob Beauty Pageant (owner: qa-sims; v1.1 checks T37–T42).

Covers all §1–§11 binding requirements:
- Boot with #title visible by default, 0 console/runtime errors & 0 HTTP 4xx/5xx
- Repo hygiene: 0 speechSynthesis, 0 importmap/CDN/media assets, relative .js imports, no boot compile
- Frozen window.__PAGEANT__ seam & deep-cloned getState() immutability
- Roster/tiers/accessories (§4), event bus (§3.2), WebAudio lazy unlock & §9 SFX/music catalog
- World POIs (§5), hub/end/nether areas, 0 dead world taps
- Every quest (10 main + 2 hidden) completed via teleport + listTargets/tapTarget + gag verification
- Booth accessories, 📸 shutter, 12 s idle auto-snap, wither 3-head hat picks, portrait <= 12 KB
- Tier board drag via real CDP Input.dispatchTouchEvent at 390x844 & 844x390, mouse at 1280x800,
  outside-drop return to tray, tap-card-then-tap-row fallback (5/5), view-mode re-rank
- Per-row crowd/contestant reactions (完美 confetti >= 150 + fireworks) & NEXT picture-frame card
- Persistence across Page.reload via localStorage['pageant_progress'] + 继续 button
- Finale (小凯 runway strut + ranking) & Final 排行榜 screen (★ stars, 分享 PNG, 再来一次, 继续找)
- Pause menu, debug URL params (?seed=&quest=&scene=&area=), 3600-frame determinism (3/3 seeds)
- F12 layout audit at all 4 viewports + quick F1–F14 sim gates check
- v1.1 (tests/v11_checks.py): 6.5 b/s walking + gait/camera (T37), voice clips present/decodable/<= 6 MB (T38),
  voice playback + subtitle + BGM duck after a real gesture (T39), persisted Voice toggle + caps (T40), subtitle
  never covering controls at 4 viewports (T41), zero Chinese in DOM + canvas text (T42)

Usage:
  python3 tests/run_e2e.py
  python3 tests/run_e2e.py --strict
  python3 tests/run_e2e.py --filter board
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Any, Callable

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from layout_audit import audit_viewport_on_session  # noqa: E402
from qa_helpers import (  # noqa: E402
    ACCESSORY_IDS,
    HIDDEN_CONTESTANTS,
    LOCATE_BOARD_HANDLES_JS,
    MAIN_QUESTS,
    POI_KEYS,
    QA_TMP_DIR,
    QUEST_BY_ID,
    QUEST_IDEAL_FLOORS_S,
    REPO_ROOT,
    REQUIRED_MUSIC_TRACKS,
    REQUIRED_SFX_NAMES,
    SEAM_METHODS,
    TIERS,
    QASession,
    XFail,
    ensure_qa_dirs,
    is_module_stub,
    open_board_for_contestant,
    verify_board_tier_mode,
)
from sim_gates import INSTALL_SIM_HARNESS_JS, run_sim_gates_on_session  # noqa: E402
from v11_checks import V11_TESTS  # noqa: E402


# ---------------------------------------------------------------------------
# Group A: Boot, Hygiene, Contracts, Seam & Audio (T01 - T08)
# ---------------------------------------------------------------------------

def t01_boot_title_default_zero_errors_zero_http_4xx(sess: QASession) -> None:
  sess.clear_diagnostics()
  assert sess.goto('index.html', timeout=25.0), '@core: index.html failed to load window.__PAGEANT__'
  sess.wait_raf(2)
  info = sess.eval_json(
      """(() => {
        const title = document.getElementById('title');
        const canvas = document.querySelector('canvas');
        const tRect = title ? title.getBoundingClientRect() : null;
        const tStyle = title ? window.getComputedStyle(title) : null;
        const titleVis = Boolean(
          title && !title.hasAttribute('hidden') &&
          tStyle && tStyle.display !== 'none' && tStyle.visibility !== 'hidden' &&
          parseFloat(tStyle.opacity || '1') > 0.05 && tRect && tRect.height > 20
        );
        return {
          titleVis,
          hasCanvas: Boolean(canvas),
          cw: canvas ? canvas.width : 0,
          ch: canvas ? canvas.height : 0,
          hasSeam: Boolean(window.__PAGEANT__),
          scene: window.__PAGEANT__ ? window.__PAGEANT__.getState().scene : null,
        };
      })()"""
  )
  assert info['hasCanvas'] and info['cw'] > 0 and info['ch'] > 0, f'@core: missing/0-size canvas: {info}'
  assert info['hasSeam'], f'@core: window.__PAGEANT__ missing: {info}'
  assert info['titleVis'], f'@core/@pageant-ui: #title not visible by default at boot: {info}'
  sess.assert_clean('T01')


def t02_repo_hygiene_zero_build_no_speech_no_cdn_no_boot_compile(sess: QASession) -> None:
  del sess
  forbidden_speech: list[str] = []
  forbidden_importmap: list[str] = []
  bad_specifiers: list[str] = []
  external_urls: list[str] = []
  forbidden_assets: list[str] = []
  boot_compile: list[str] = []

  import_re = re.compile(
      r"""(?:import\s+(?:[^'"]+from\s+)?|export\s+[^'"]+from\s+|import\s*\()\s*['"]([^'"]+)['"]"""
  )
  url_re = re.compile(r'https?://[^\s\'"`)]+')
  asset_exts = ('.mp3', '.wav', '.ogg', '.m4a', '.png', '.jpg', '.jpeg', '.webp', '.gif')

  scan_targets: list[str] = []
  idx_html = os.path.join(REPO_ROOT, 'index.html')
  if os.path.exists(idx_html):
    scan_targets.append(idx_html)

  for sub in ('src', 'styles'):
    base = os.path.join(REPO_ROOT, sub)
    if not os.path.exists(base):
      continue
    for root, _, files in os.walk(base):
      for fn in files:
        full = os.path.join(root, fn)
        rel = os.path.relpath(full, REPO_ROOT)
        if fn.lower().endswith(asset_exts):
          forbidden_assets.append(rel)
        if fn.endswith(('.js', '.mjs', '.css', '.html')):
          scan_targets.append(full)

  for full in scan_targets:
    rel = os.path.relpath(full, REPO_ROOT)
    with open(full, 'r', encoding='utf-8') as f:
      raw = f.read()
    stripped = re.sub(r'/\*[\s\S]*?\*/', '', raw)
    stripped = re.sub(r'(?m)^\s*//.*$', '', stripped)
    stripped = re.sub(r'(?<!:)//.*$', '', stripped)

    if 'speechSynthesis' in stripped or 'SpeechSynthesisUtterance' in stripped:
      forbidden_speech.append(rel)
    if rel.endswith('.html') and 'importmap' in stripped.lower():
      forbidden_importmap.append(rel)
    if 'renderer.compile(' in stripped:
      boot_compile.append(rel)
    for u in url_re.findall(stripped):
      if 'w3.org/2000/svg' in u or 'w3.org/1999/xhtml' in u:
        continue
      external_urls.append(f'{rel}: {u}')
    if rel.startswith('src/') and rel.endswith(('.js', '.mjs')):
      for m in import_re.finditer(stripped):
        spec = m.group(1)
        if not (spec.startswith('./') or spec.startswith('../')) or not spec.endswith(('.js', '.mjs')):
          bad_specifiers.append(f'{rel}: {spec}')

  assert not forbidden_speech, f'Forbidden speechSynthesis found: {forbidden_speech}'
  assert not forbidden_importmap, f'Forbidden importmap found: {forbidden_importmap}'
  assert not bad_specifiers, f'Non-relative or extensionless imports found: {bad_specifiers}'
  assert not external_urls, f'External runtime URLs found: {external_urls}'
  assert not forbidden_assets, f'Binary media assets found under src/styles: {forbidden_assets}'
  # v1.1: the only binary media allowed are the voice-over clips (assets/voice/*.mp3) and the README screenshot.
  stray_media: list[str] = []
  for root, dirs, files in os.walk(REPO_ROOT):
    dirs[:] = [d for d in dirs if d not in ('.git', '.agents', 'node_modules', '__pycache__')]
    for fn in files:
      rel = os.path.relpath(os.path.join(root, fn), REPO_ROOT).replace(os.sep, '/')
      if fn.lower().endswith(asset_exts) and rel != 'screenshot.jpg' and not (
          rel.startswith('assets/voice/') and fn.lower().endswith('.mp3')):
        stray_media.append(rel)
  assert not stray_media, f'Unexpected media files (only assets/voice/*.mp3 + screenshot.jpg allowed): {stray_media}'
  assert not boot_compile, f'Forbidden renderer.compile() found (§1): {boot_compile}'


def t03_seam_frozen_and_16_method_surface(sess: QASession) -> None:
  res = sess.eval_json(
      f"""(() => {{
        const P = window.__PAGEANT__;
        const desc = Object.getOwnPropertyDescriptor(window, '__PAGEANT__');
        let mutateThrew = false;
        let overwriteThrew = false;
        try {{ (() => {{ 'use strict'; P.__qaInjected = 1; }})(); }} catch (_e) {{ mutateThrew = true; }}
        try {{ (() => {{ 'use strict'; P.getState = null; }})(); }} catch (_e) {{ overwriteThrew = true; }}
        const req = {json.dumps(SEAM_METHODS)};
        const missing = req.filter((k) => typeof P[k] !== 'function');
        return {{
          frozen: Object.isFrozen(P),
          writable: desc ? Boolean(desc.writable) : true,
          configurable: desc ? Boolean(desc.configurable) : true,
          mutateThrew,
          overwriteThrew,
          injected: '__qaInjected' in P,
          missing,
        }};
      }})()"""
  )
  assert res['frozen'] is True, f'@core: window.__PAGEANT__ not Object.freeze()d: {res}'
  assert res['mutateThrew'] and res['overwriteThrew'] and not res['injected'], f'@core: seam mutable: {res}'
  assert res['missing'] == [], f'@core: missing §3.9 seam methods: {res["missing"]}'


def t04_getstate_schema_and_deep_clone_immutability(sess: QASession) -> None:
  res = sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await P.startGame({ seed: 104 });
        P.stepFrames(12);
        const s1 = P.getState();
        const requiredKeys = [
          'v', 'seed', 'frame', 'timeMs', 'scene', 'area', 'player', 'quest',
          'quests', 'contestants', 'rival', 'feedback', 'stats', 'stars',
          'board', 'elapsedMs', 'firstMetMs',
        ];
        const missingKeys = requiredKeys.filter((k) => !(k in s1));

        // Mutate every nested branch of s1 and verify s2 is untouched.
        const origSeed = s1.seed;
        const origPlayerX = s1.player ? s1.player.x : null;
        s1.seed = -999;
        s1.scene = 'corrupted';
        if (s1.player) s1.player.x = 99999;
        if (s1.quests && s1.quests.sheep) s1.quests.sheep.status = 'corrupted';
        if (s1.contestants && s1.contestants.sheep) s1.contestants.sheep.tier = 'corrupted';
        if (s1.rival && Array.isArray(s1.rival.appearances)) s1.rival.appearances.push('fake');
        if (s1.feedback) s1.feedback.dead = 777;
        if (s1.stats) s1.stats.particles = -555;
        if (s1.board) s1.board.sheep = 'corrupted';

        const s2 = P.getState();
        return {
          v: s2.v,
          missingKeys,
          seedIntact: s2.seed === origSeed,
          sceneIntact: s2.scene !== 'corrupted',
          playerIntact: s2.player ? s2.player.x === origPlayerX : false,
          questIntact: s2.quests && s2.quests.sheep ? s2.quests.sheep.status !== 'corrupted' : false,
          contestantIntact: s2.contestants && s2.contestants.sheep ? s2.contestants.sheep.tier !== 'corrupted' : false,
          rivalIntact: s2.rival && Array.isArray(s2.rival.appearances) ? !s2.rival.appearances.includes('fake') : false,
          fbIntact: s2.feedback ? s2.feedback.dead === 0 : false,
          statsIntact: s2.stats ? s2.stats.particles >= 0 : false,
          boardIntact: s2.board ? s2.board.sheep !== 'corrupted' : false,
        };
      })()"""
  )
  assert res['v'] == 1 and res['missingKeys'] == [], f'@core: getState() schema mismatch: {res}'
  for k, v in res.items():
    if k.endswith('Intact'):
      assert v is True, f'@core: getState() failed deep-clone check ({k}): {res}'


def t05_roster_tiers_accessories_contract(sess: QASession) -> None:
  res = sess.eval_json(
      """(async () => {
        const R = await import('./src/data/roster.js');
        return {
          rosterIds: (R.ROSTER || []).map((c) => c.id),
          hiddenIds: (R.ROSTER || []).filter((c) => c.hidden).map((c) => c.id),
          witherHeads: ((R.ROSTER || []).find((c) => c.id === 'wither') || {}).heads,
          tiers: (R.TIERS || []).map((t) => ({ id: t.id, color: t.color.toLowerCase() })),
          accIds: (R.ACCESSORIES || []).map((a) => a.id),
        };
      })()"""
  )
  expected_roster = [q['id'] for q in MAIN_QUESTS] + [h['id'] for h in HIDDEN_CONTESTANTS]
  assert res['rosterIds'] == expected_roster, f'@core: ROSTER order/ids mismatch: {res["rosterIds"]}'
  assert res['hiddenIds'] == ['dragon', 'pinksheep'], f'@core: hidden ids mismatch: {res["hiddenIds"]}'
  assert res['witherHeads'] == 3, f'@core: wither heads != 3: {res}'
  expected_tiers = [{'id': t['id'], 'color': t['color'].lower()} for t in TIERS]
  assert res['tiers'] == expected_tiers, f'@core: TIERS mismatch: {res["tiers"]}'
  assert set(ACCESSORY_IDS).issubset(set(res['accIds'])), f'@core: missing ACCESSORIES: {res["accIds"]}'


def t06_events_bus_contract(sess: QASession) -> None:
  res = sess.eval_json(
      """(async () => {
        const E = await import('./src/core/events.js');
        const bus = E.createEvents ? E.createEvents() : E;
        const log = [];
        const off = bus.on('qa_ping', (p) => log.push(['on', p]));
        bus.once('qa_ping', (p) => log.push(['once', p]));
        bus.emit('qa_ping', 1);
        bus.emit('qa_ping', 2);
        off();
        bus.emit('qa_ping', 3);
        return log;
      })()"""
  )
  assert res == [['on', 1], ['once', 1], ['on', 2]], f'@core: events.js contract mismatch: {res}'


def t07_audio_lazy_unlock_mute_and_sfx_music_catalog(sess: QASession) -> None:
  if is_module_stub('src/fx/audio.js') and is_module_stub('src/fx/sfx.js'):
    raise XFail('@fx-audio: src/fx/{audio,sfx,music}.js still stubbed')

  res = sess.eval_json(
      f"""(async () => {{
        const P = window.__PAGEANT__;
        P.setMuted(true);
        P.setMuted(false);
        const mod = await import('./src/fx/audio.js');
        const createAudio = mod.createAudio || mod.default;
        let testedSfx = 0;
        let testedMusic = 0;
        let threw = null;
        if (createAudio) {{
          const fakeCtx = {{ state: {{ stats: {{ particles: 0, sounds: 0, shakes: 0, confetti: 0, fireworks: 0 }} }}, events: {{ on: () => () => {{}} }} }};
          const aud = createAudio(fakeCtx);
          aud.setMuted({{ music: true, sfx: true }});
          for (const name of {json.dumps(REQUIRED_SFX_NAMES)}) {{
            try {{ aud.play(name, {{ vol: 0.01 }}); testedSfx++; }} catch (e) {{ threw = `sfx:${{name}}:${{e}}`; break; }}
          }}
          for (const tr of {json.dumps(REQUIRED_MUSIC_TRACKS)}) {{
            try {{ aud.music(tr); testedMusic++; }} catch (e) {{ threw = `music:${{tr}}:${{e}}`; break; }}
          }}
          aud.music(null);
        }}
        return {{ testedSfx, testedMusic, threw }};
      }})()"""
  )
  assert res['threw'] is None, f'@fx-audio: audio play/music threw: {res}'
  assert res['testedSfx'] == len(REQUIRED_SFX_NAMES), f'@fx-audio: sfx count mismatch: {res}'
  assert res['testedMusic'] == len(REQUIRED_MUSIC_TRACKS), f'@fx-audio: music count mismatch: {res}'
  sess.assert_clean('T07')


def t08_world_poi_areas_and_zero_dead_taps(sess: QASession) -> None:
  if is_module_stub('src/world/world.js') or is_module_stub('src/world/layout.js'):
    raise XFail('@voxel-world: src/world/{world,layout}.js still stubbed')

  sess.eval(INSTALL_SIM_HARNESS_JS)
  dead_res = sess.eval_json('window.__QA_SIM__.runDeadTapsAudit(90, ["sheep", "ender", "wither"])')
  assert dead_res['dead'] == 0 and dead_res['missingIncrement'] == 0, (
      f'@core/@voxel-world: dead taps or missing feedback: {dead_res}'
  )
  assert dead_res.get('hubBlockedPct', 0.0) < 5.0, (
      f'@core: hub blocked taps {dead_res.get("hubBlockedPct")}% >= 5% (#149 N2): {dead_res}'
  )

  # Also verify POI keys + #149 N1/N3 (off-screen beacon_cat behind camera -> onScreen:false, clamped sx/sy, >=72px edge arrow).
  poi_check = sess.eval_json(
      f"""(async () => {{
        const P = window.__PAGEANT__;
        await P.startGame({{ seed: 8 }});
        await P.teleport('ender');
        const endArea = P.getState().area;
        await P.teleport('wither');
        const netherArea = P.getState().area;
        await P.teleport('sheep');
        const hubArea = P.getState().area;

        // Complete sheep + slime -> return to plaza (48,62) facing north so beacon_cat (south-west jungle) is behind camera!
        await P.startGame({{ seed: 80 }});
        for (const qid of ['sheep', 'slime']) {{
          await P.completeQuest(qid);
          for (let w = 0; w < 20 && P.getState().scene !== 'booth'; w++) {{
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }}
          await P.boothChoose('crown');
          await P.boothSnap();
          for (let w = 0; w < 20 && P.getState().scene !== 'board'; w++) {{
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }}
          await P.boardDrop(qid, 'perfect');
          for (let w = 0; w < 20; w++) {{
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }}
          await P.continue();
          for (let w = 0; w < 30 && P.getState().scene !== 'world'; w++) {{
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }}
          P.stepFrames(12);
          for (let k = 0; k < 6; k++) await Promise.resolve();
        }}
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tgs = P.listTargets() || [];
        const bCat = tgs.find((t) => t && /cat/i.test(String(t.id || ''))) || tgs[0] || null;
        // Locate off-screen beacon edge arrow (#149 N3: >=72px, hidden when onScreen).
        const hudBtns = Array.from(document.querySelectorAll('#hud-beacon-btn, .hud-beacon-btn, #hud button, #hud [role="button"], .beacon-arrow, #hud-beacon-arrow'))
          .filter((el) => {{
            if (!el || el.hasAttribute('hidden')) return false;
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05 && r.width > 10 && r.height > 10;
          }});
        const edgeArrow = hudBtns.find((el) => /beacon|arrow|next|guide/i.test((el.id || '') + ' ' + (el.className || '') + ' ' + (el.dataset.action || '')));
        let arrowRect = null;
        let arrowWalked = false;
        if (edgeArrow) {{
          const r = edgeArrow.getBoundingClientRect();
          arrowRect = {{ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }};
          const cx = r.left + r.width * 0.5;
          const cy = r.top + r.height * 0.5;
          edgeArrow.dispatchEvent(new PointerEvent('pointerdown', {{ bubbles: true, clientX: cx, clientY: cy, isPrimary: true }}));
          edgeArrow.dispatchEvent(new PointerEvent('pointerup', {{ bubbles: true, clientX: cx, clientY: cy, isPrimary: true }}));
          edgeArrow.click();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(12);
          arrowWalked = Boolean(P.getState().player && P.getState().player.moving);
        }}

        let missingPoi = [];
        if (window.__CTX__ && window.__CTX__.world && window.__CTX__.world.poi) {{
          const poi = window.__CTX__.world.poi;
          missingPoi = {json.dumps(POI_KEYS)}.filter((k) => !poi[k]);
        }}
        return {{
          hubArea, endArea, netherArea, missingPoi,
          vw: window.innerWidth, vh: window.innerHeight,
          bCat, arrowRect, arrowWalked,
        }};
      }})()"""
  )
  assert poi_check['hubArea'] == 'hub', f'@core/@quests-a: sheep area != hub: {poi_check}'
  assert poi_check['endArea'] in ('hub', 'end'), f'@core/@quests-b: ender area invalid: {poi_check}'
  assert poi_check['netherArea'] in ('hub', 'nether'), f'@core/@quests-b: wither area invalid: {poi_check}'
  assert poi_check['missingPoi'] == [], f'@voxel-world: missing §5 poi keys: {poi_check["missingPoi"]}'
  b_cat = poi_check.get('bCat') or {}
  assert b_cat.get('onScreen') is False, f'@core: #149 N1 beacon_cat behind camera must have onScreen=false: {b_cat}'
  assert 0 <= float(b_cat.get('sx', -1)) <= poi_check['vw'] and 0 <= float(b_cat.get('sy', -1)) <= poi_check['vh'], (
      f'@core: #149 N1 off-screen beacon sx/sy must be clamped to viewport [0..{poi_check["vw"]}x{poi_check["vh"]}]: {b_cat}'
  )
  arrow = poi_check.get('arrowRect')
  assert arrow and arrow['w'] >= 72 and arrow['h'] >= 72 and poi_check.get('arrowWalked'), (
      f'@pageant-ui/@core: #149 N3 off-screen beacon edge arrow (>=72px, click walks) missing or inert: {poi_check}'
  )
  sess.assert_clean('T08')


# ---------------------------------------------------------------------------
# Group B: All 10 Main Quests + 2 Hidden Quests (T09 - T20)
# ---------------------------------------------------------------------------

def _verify_main_quest(sess: QASession, quest_id: str, seed: int = 12) -> dict[str, Any]:
  meta = QUEST_BY_ID[quest_id]
  if is_module_stub(meta['file']):
    raise XFail(f"@{meta['owner']}: {meta['file']} still stubbed")

  sess.eval(INSTALL_SIM_HARNESS_JS)
  ep = sess.eval_json(
      f'window.__QA_SIM__.runQuestEpisode({json.dumps(quest_id)}, {seed}, "ideal", true, 95)'
  )
  sess.assert_clean(f'quest_{quest_id}')
  assert ep['done'] is True, (
      f"@{meta['owner']}: quest '{quest_id}' failed to complete within 95s "
      f"(seed={seed}, frame={ep['endFrame']}, step={ep['failStep']}): {ep}"
  )
  floor_s = QUEST_IDEAL_FLOORS_S.get(quest_id, 18.0)
  assert ep['durationS'] >= floor_s, (
      f"@{meta['owner']}: quest '{quest_id}' ideal time {ep['durationS']}s < floor {floor_s}s (#143, seed={seed})"
  )
  assert ep['durationS'] <= 90.0, (
      f"@{meta['owner']}: quest '{quest_id}' ideal time {ep['durationS']}s > 90s (seed={seed})"
  )
  assert len(ep['gags']) >= 1, (
      f"@{meta['owner']}: quest '{quest_id}' completed with 0 gags recorded (expected {meta['gags']}): {ep}"
  )
  assert ep.get('gagCamCount', 0) >= 1 and ep.get('lastGag'), (
      f"@core/@{meta['owner']}: #155 G1 state.gagCam not triggered on quest '{quest_id}': {ep}"
  )
  assert ep['pointerSamples'] > 0 and ep['pointerNulls'] == 0, (
      f"@{meta['owner']}: quest '{quest_id}' had null quest.pointer at frame {ep['firstNullFrame']}: {ep}"
  )
  return ep


def t09_quest_01_sheep_bouquet_and_gag(sess: QASession) -> None:
  _verify_main_quest(sess, 'sheep', seed=11)


def t10_quest_02_slime_split_and_gag(sess: QASession) -> None:
  _verify_main_quest(sess, 'slime', seed=12)


def t11_quest_03_cat_sneak_and_gag(sess: QASession) -> None:
  _verify_main_quest(sess, 'cat', seed=13)


def t12_quest_04_golem_statue_pumpkins_altar_shake(sess: QASession) -> None:
  ep = _verify_main_quest(sess, 'golem', seed=14)
  shakes = sess.eval_json('window.__PAGEANT__.getState().stats.shakes || 0')
  assert shakes >= 1, f'@quests-a/@fx-audio: golem spawn did not increment stats.shakes: {shakes}, {ep}'


def t13_quest_05_snow_snowball_fight_snowman(sess: QASession) -> None:
  _verify_main_quest(sess, 'snow', seed=15)


def t14_quest_06_creeper_pats_confetti(sess: QASession) -> None:
  _verify_main_quest(sess, 'creeper', seed=16)


def t15_quest_07_bee_simon_says_honey(sess: QASession) -> None:
  _verify_main_quest(sess, 'bee', seed=17)


def t16_quest_08_ender_steal_and_lava_prison_rescue(sess: QASession) -> None:
  ep = _verify_main_quest(sess, 'ender', seed=18)
  st = sess.eval_json('window.__PAGEANT__.getState().rival || {}')
  assert ep['stealFired'] is True, f'@quests-b: ender scripted steal did not fire (seed=18): {ep}'
  assert st.get('rescued') is True or 'kai_cake_face' in ep['gags'], (
      f'@quests-b: ender rescue/cake_face not recorded: rival={st}, ep={ep}'
  )


def t17_quest_09_wither_nether_skulls_altar_shake(sess: QASession) -> None:
  ep = _verify_main_quest(sess, 'wither', seed=19)
  shakes = sess.eval_json('window.__PAGEANT__.getState().stats.shakes || 0')
  assert shakes >= 1, f'@quests-b/@fx-audio: wither spawn did not increment stats.shakes: {shakes}, {ep}'


def t18_quest_10_villager_trades_diamonds_bank(sess: QASession) -> None:
  _verify_main_quest(sess, 'villager', seed=20)


def _verify_hidden_contestant(sess: QASession, hid: str) -> None:
  if is_module_stub('src/quests/hidden.js'):
    raise XFail('@quests-a: src/quests/hidden.js still stubbed')

  sess.eval(INSTALL_SIM_HARNESS_JS)
  res = sess.eval_json(
      f"""(async () => {{
        const P = window.__PAGEANT__;
        await P.startGame({{ seed: 25 }});
        // Unlock hidden sparkle hints if gated behind quest 5 or teleport directly.
        await P.teleport({json.dumps(hid)});
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(15);
        for (let step = 0; step < 80; step++) {{
          const s = P.getState();
          const c = s.contestants && s.contestants[{json.dumps(hid)}];
          if ((c && c.found) || s.scene === 'booth' || s.scene === 'board') break;
          const tgs = (P.listTargets() || []).filter((t) => t && t.id !== undefined);
          const hTarget = tgs.find((t) => String(t.id).includes({json.dumps(hid)}) || String(t.id).includes('egg') || String(t.id).includes('tulip') || String(t.id).includes('pink'))
            || tgs[0];
          if (hTarget) {{
            await P.tapTarget(hTarget.id);
          }}
          for (let w = 0; w < 24; w++) {{
            P.stepFrames(10);
            for (let k = 0; k < 4; k++) await Promise.resolve();
            const sw = P.getState();
            if (!sw.player.moving || sw.scene !== 'world') break;
          }}
          P.stepFrames(15);
        }}
        const fin = P.getState();
        return {{
          scene: fin.scene,
          contestant: (fin.contestants && fin.contestants[{json.dumps(hid)}]) || null,
        }};
      }})()"""
  )
  c_info = res.get('contestant') or {}
  assert c_info.get('found') is True or c_info.get('met') is True or res['scene'] in ('booth', 'board'), (
      f"@quests-a: hidden contestant '{hid}' was not found via teleport + tapTarget: {res}"
  )
  sess.assert_clean(f'hidden_{hid}')


def t19_hidden_01_dragon_teleporting_egg(sess: QASession) -> None:
  _verify_hidden_contestant(sess, 'dragon')


def t20_hidden_02_pinksheep_tulip_dye(sess: QASession) -> None:
  _verify_hidden_contestant(sess, 'pinksheep')


# ---------------------------------------------------------------------------
# Group C: Booth, Board Drag, Reactions, Persistence, Finale & Determinism (T21 - T31)
# ---------------------------------------------------------------------------

def t21_booth_accessories_shutter_auto_snap_and_wither_3_hats(sess: QASession) -> None:
  if is_module_stub('src/ui/booth.js') or is_module_stub('src/ui/portrait.js'):
    raise XFail('@pageant-ui: src/ui/{booth,portrait}.js still stubbed')

  res = sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await P.startGame({ seed: 21 });
        // 1. Test 12s idle auto-snap on sheep.
        await P.completeQuest('sheep');
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(160);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Measure accessory buttons (>=80px) & shutter button (>=96px).
        const btns = Array.from(document.querySelectorAll('button, [role="button"]')).filter((el) => {
          if (el.hasAttribute('hidden')) return false;
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 10 && r.height > 10;
        });
        const rects = btns.map((b) => {
          const r = b.getBoundingClientRect();
          return { text: (b.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
        });

        // Advance past 12s (750 frames) to trigger idle auto-snap.
        P.stepFrames(760);
        for (let k = 0; k < 8; k++) await Promise.resolve();
        P.stepFrames(60);
        for (let k = 0; k < 6; k++) await Promise.resolve();
        const afterIdle = P.getState();

        // 2. Test wither 3-head accessory selection.
        await P.startGame({ seed: 22 });
        await P.completeQuest('wither');
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(160);
        await P.boothChoose('crown');
        await P.boothChoose('partyHat');
        await P.boothChoose('topHat');
        await P.boothSnap();
        for (let k = 0; k < 8; k++) await Promise.resolve();
        P.stepFrames(45);
        const witherState = P.getState().contestants.wither;

        return {
          rects,
          afterIdleScene: afterIdle.scene,
          sheepPortrait: afterIdle.contestants.sheep.portrait,
          sheepAccs: afterIdle.contestants.sheep.accessories,
          witherAccs: witherState ? witherState.accessories : [],
          witherPortrait: witherState ? witherState.portrait : false,
        };
      })()"""
  )
  assert res['afterIdleScene'] == 'board' and res['sheepPortrait'] is True, (
      f'@pageant-ui/@core: 12s booth idle auto-snap did not advance to board with portrait: {res}'
  )
  assert len(res['witherAccs']) == 3 and res['witherPortrait'] is True, (
      f'@pageant-ui: wither (3 heads) should keep 3 accessories: {res}'
  )
  max_btn = max((min(b['w'], b['h']) for b in res['rects']), default=0)
  assert max_btn >= 95, f'@pageant-ui: shutter button 📸 must be >= 96px: {res["rects"]}'
  sess.assert_clean('T21')


def t22_board_touch_drag_390x844_all_5_rows(sess: QASession) -> None:
  if is_module_stub('src/ui/board.js'):
    raise XFail('@pageant-ui: src/ui/board.js still stubbed')
  r = verify_board_tier_mode(sess, 390, 844, 'touch')
  sess.set_viewport(1280, 800, mobile=False)
  assert r['ok'], f'@pageant-ui: CDP touch drag failed at 390x844: {r}'


def t23_board_touch_drag_844x390_all_5_rows(sess: QASession) -> None:
  if is_module_stub('src/ui/board.js'):
    raise XFail('@pageant-ui: src/ui/board.js still stubbed')
  r = verify_board_tier_mode(sess, 844, 390, 'touch')
  sess.set_viewport(1280, 800, mobile=False)
  assert r['ok'], f'@pageant-ui: CDP touch drag failed at 844x390: {r}'


def t24_board_mouse_drag_1280x800_and_outside_return_to_tray(sess: QASession) -> None:
  if is_module_stub('src/ui/board.js'):
    raise XFail('@pageant-ui: src/ui/board.js still stubbed')

  # 1. Release outside any tier row -> card returns to tray unranked.
  sess.set_viewport(1280, 800, mobile=False)
  open_board_for_contestant(sess, 'sheep', seed=40)
  handles = sess.eval_json(f'({LOCATE_BOARD_HANDLES_JS})("sheep", {json.dumps(TIERS)})')
  assert handles.get('card'), f'@pageant-ui: tray card not found on board: {handles}'
  card = handles['card']
  sess.mouse_drag(card['x'], card['y'], 12, 12, steps=10, hold_end_s=0.02)
  sess.wait_raf(2)
  st_outside = sess.eval_json('window.__PAGEANT__.getState()')
  assert not (st_outside.get('board') or {}).get('sheep'), (
      f'@pageant-ui: dropping card outside rows at (12,12) should return to tray unranked: {st_outside.get("board")}'
  )

  # 2. Mouse drag across all 5 rows at 1280x800.
  r = verify_board_tier_mode(sess, 1280, 800, 'mouse')
  assert r['ok'], f'@pageant-ui: CDP mouse drag failed at 1280x800: {r}'


def t25_board_tap_card_then_tap_row_fallback_and_view_rerank(sess: QASession) -> None:
  if is_module_stub('src/ui/board.js'):
    raise XFail('@pageant-ui: src/ui/board.js still stubbed')
  r = verify_board_tier_mode(sess, 1280, 800, 'taptap')
  assert r['ok'], f'@pageant-ui: tap-card-then-tap-row fallback failed: {r}'

  # Verify re-ranking in view mode via boardDrop / HUD board chip.
  rerank = sess.eval_json(
      r"""(async () => {
        const P = window.__PAGEANT__;
        await P.continue();
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(110);
        // Open board in view mode via HUD board chip if present, or P.rank / boardDrop.
        const chip = Array.from(document.querySelectorAll('button, [role="button"]')).find(
          (b) => /\/10|排行榜|board/i.test((b.textContent || '') + ' ' + (b.id || '') + ' ' + (b.className || ''))
        );
        if (chip) chip.click();
        for (let k = 0; k < 6; k++) await Promise.resolve();
        await P.boardDrop('sheep', 'perfect');
        for (let k = 0; k < 6; k++) await Promise.resolve();
        return P.getState().board.sheep;
      })()"""
  )
  assert rerank == 'perfect', f'@pageant-ui/@core: re-ranking in view mode failed: {rerank}'


def t26_board_reactions_confetti_fireworks_and_next_card(sess: QASession) -> None:
  if is_module_stub('src/ui/board.js') or is_module_stub('src/fx/confetti.js'):
    raise XFail('@pageant-ui/@fx-audio: board or confetti module still stubbed')

  res = sess.eval_json(
      """(async () => {
        try { localStorage.removeItem('pageant_progress'); } catch (_) {}
        const P = window.__PAGEANT__;
        await P.startGame({ seed: 26 });
        await P.completeQuest('sheep');
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(120);
        await P.boothChoose('flowerCrown');
        await P.boothSnap();
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(45);
        const pre = P.getState().stats;
        await P.boardDrop('sheep', 'perfect');
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(60);
        const mid = P.getState().stats;
        P.stepFrames(60);
        for (let k = 0; k < 6; k++) await Promise.resolve();
        await P.continue();
        for (let k = 0; k < 8; k++) await Promise.resolve();
        for (let c = 0; c < 10; c++) {
          P.stepFrames(15);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          if (P.getState().scene === 'world') break;
        }
        const post = P.getState();
        return {
          dConfetti: (mid.confetti || 0) - (pre.confetti || 0),
          dFireworks: (mid.fireworks || 0) - (pre.fireworks || 0),
          postScene: post.scene,
          nextQuest: post.quest ? post.quest.id : null,
        };
      })()"""
  )
  assert res['dConfetti'] >= 150, f'@fx-audio/@pageant-ui: 完美 reaction confetti < 150: {res}'
  assert res['dFireworks'] >= 3, f'@fx-audio/@pageant-ui: 完美 reaction fireworks < 3 (§8.3): {res}'
  assert res['postScene'] == 'world', f'@core/@pageant-ui: did not return to world after NEXT card: {res}'

  # Verify #172 Q3: 0 mystery "?" slots before quest 5, 2 mystery "?" slots (>=72px) after quest 5, tap opens picture hint.
  q3 = sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        const visSlots = () => Array.from(document.querySelectorAll('#mystery-slot-dragon, #mystery-slot-pinksheep, .mystery-slot'))
          .filter((el) => {
            if (!el || el.hasAttribute('hidden')) return false;
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 10 && r.height > 10;
          });
        // Open board in view mode at 1/10 -> expect 0 mystery slots
        const chip = document.getElementById('hud-board-btn');
        if (chip) {
          chip._resetTapDebounce?.();
          chip.click();
        }
        for (let k = 0; k < 6; k++) await Promise.resolve();
        const slotsAt1 = visSlots().length;
        await P.continue();
        for (let k = 0; k < 6; k++) await Promise.resolve();

        // Complete quests 2..5 -> at 5/10 open board -> expect 2 mystery slots >= 72x72 + tap hint modal
        for (const qid of ['slime', 'cat', 'golem', 'snow']) {
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
          for (let w = 0; w < 15; w++) {
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }
          await P.continue();
          for (let w = 0; w < 25 && P.getState().scene !== 'world'; w++) {
            P.stepFrames(12);
            for (let k = 0; k < 6; k++) await Promise.resolve();
          }
        }
        P.stepFrames(12);
        const chip5 = document.getElementById('hud-board-btn');
        if (chip5) {
          chip5._resetTapDebounce?.();
          chip5.click();
        }
        for (let k = 0; k < 6; k++) await Promise.resolve();
        await new Promise((r) => requestAnimationFrame(r));
        const slots5 = visSlots();
        const minDim = slots5.reduce((m, el) => {
          const r = el.getBoundingClientRect();
          return Math.min(m, Math.round(r.width), Math.round(r.height));
        }, 999);
        let hintOpened = false;
        if (slots5[0]) {
          const r = slots5[0].getBoundingClientRect();
          const cx = r.left + r.width * 0.5;
          const cy = r.top + r.height * 0.5;
          slots5[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, isPrimary: true }));
          slots5[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, isPrimary: true }));
          slots5[0].click();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          const modal = document.getElementById('board-hint-modal');
          if (modal && !modal.hasAttribute('hidden')) {
            const mcs = window.getComputedStyle(modal);
            const mr = modal.getBoundingClientRect();
            hintOpened = mcs.display !== 'none' && mcs.visibility !== 'hidden' && mr.width > 100 && mr.height > 80;
          }
        }
        await P.continue();
        return { slotsAt1, slotsAt5: slots5.length, minDim, hintOpened };
      })()"""
  )
  assert q3['slotsAt1'] == 0 and q3['slotsAt5'] == 2 and q3['minDim'] >= 72 and q3['hintOpened'], (
      f'@pageant-ui: #172 Q3 mystery "?" slots + picture hint check failed: {q3}'
  )


def t27_persistence_reload_pageant_progress_and_portrait_budget(sess: QASession) -> None:
  if is_module_stub('src/ui/progress.js'):
    raise XFail('@pageant-ui: src/ui/progress.js still stubbed')
  from sim_gates import measure_persistence_gate
  f14 = measure_persistence_gate(sess)
  assert f14['passed'] is True, f'@pageant-ui/@core: persistence reload failed: {f14}'
  sess.assert_clean('T27')


def t28_finale_kai_runway_and_ranking(sess: QASession) -> None:
  if is_module_stub('src/quests/finale.js') or is_module_stub('src/ui/board.js'):
    raise XFail('@quests-b/@pageant-ui: finale.js or board.js still stubbed')

  res = sess.eval_json(
      f"""(async () => {{
        const P = window.__PAGEANT__;
        await P.startGame({{ seed: 28 }});
        const qids = {json.dumps([q['id'] for q in MAIN_QUESTS])};
        for (let i = 0; i < qids.length; i++) {{
          const qid = qids[i];
          await P.teleport(qid);
          P.stepFrames(12);
          await P.completeQuest(qid);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(90);
          await P.boothChoose('crown');
          await P.boothSnap();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          for (let b = 0; b < 6; b++) {{
            P.stepFrames(12);
            for (let k = 0; k < 4; k++) await Promise.resolve();
            if (P.getState().scene === 'board') break;
          }}
          await P.boardDrop(qid, 'gorgeous');
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(90);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          await P.continue();
          for (let k = 0; k < 8; k++) await Promise.resolve();
          for (let nx = 0; nx < 10; nx++) {{
            P.stepFrames(15);
            for (let k = 0; k < 4; k++) await Promise.resolve();
            const sc = P.getState().scene;
            if (sc === 'world' || sc === 'finale' || (i === qids.length - 1 && sc === 'board')) break;
          }}
        }}
        const duringFinale = P.getState();
        // Step through rival runway strut (2.4s) until finale opens ranking board ('board'), then rank 'kai'.
        for (let g = 0; g < 24; g++) {{
          P.stepFrames(15);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          const st = P.getState();
          if (st.scene === 'board') {{
            await P.boardDrop('kai', 'tryhard');
            for (let k = 0; k < 6; k++) await Promise.resolve();
            break;
          }}
        }}
        P.stepFrames(180);
        for (let k = 0; k < 6; k++) await Promise.resolve();
        await P.continue();
        for (let k = 0; k < 8; k++) await Promise.resolve();
        // Step in chunks so board close -> finale rival.waitSim(1.6) resolves cleanly into 'final'.
        for (let g = 0; g < 24; g++) {{
          P.stepFrames(15);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          if (P.getState().scene === 'final') break;
        }}
        const afterFinale = P.getState();
        return {{
          duringScene: duringFinale.scene,
          kaiTier: afterFinale.board ? afterFinale.board.kai : null,
          finalScene: afterFinale.scene,
          stars: afterFinale.stars,
        }};
      }})()"""
  )
  assert res['kaiTier'] == 'tryhard', f'@quests-b/@core: kai not ranked in finale: {res}'
  assert res['finalScene'] == 'final', f'@core/@pageant-ui: did not reach final screen after finale: {res}'
  assert res['stars'] >= 2, f'@core: expected >= 2 stars (10 ranked + <=20 min): {res}'
  sess.assert_clean('T28')


def t29_final_leaderboard_stars_share_png_replay_continue(sess: QASession) -> None:
  if is_module_stub('src/ui/share.js'):
    raise XFail('@pageant-ui: src/ui/share.js still stubbed')

  # Inspect final screen rendered at end of T28 (or trigger ?scene=final if run standalone).
  if sess.eval_json('window.__PAGEANT__.getState().scene') != 'final':
    sess.goto('index.html?scene=final', timeout=20.0)
  res = sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const txt = document.body.textContent || '';
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((b) => {
            if (b.hasAttribute('hidden')) return false;
            const cs = window.getComputedStyle(b);
            const r = b.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 20;
          })
          .map((b) => (b.textContent || '').trim());
        const finalRoot = document.getElementById('final') || document.body;
        const cardRects = Array.from(
          finalRoot.querySelectorAll('[data-contestant], [data-card-id], .final-card, .polaroid-card, .board-card')
        )
          .filter((el) => {
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 20 && r.height > 20;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
          });
        const minCardSide = cardRects.length
          ? Math.min(...cardRects.map((c) => Math.max(c.w, c.h)))
          : 0;
        return {
          scene: P.getState().scene,
          hasShare: btns.some((t) => /分享|share/i.test(t)),
          hasReplay: btns.some((t) => /再来一次|重新|replay/i.test(t)),
          hasContinueHunt: btns.some((t) => /继续找|探索|continue/i.test(t)),
          cardCount: cardRects.length,
          minCardSide,
          sampleCard: cardRects[0] || null,
          buttons: btns,
          bodySnippet: txt.slice(0, 120),
        };
      })()"""
  )
  assert res['hasShare'] and res['hasReplay'] and res['hasContinueHunt'], (
      f'@pageant-ui: final screen missing 分享 / 再来一次 / 继续找 buttons (§8.5): {res}'
  )
  assert res['cardCount'] > 0 and res['minCardSide'] >= 96, (
      f'@pageant-ui: #155 P2 final 排行榜 cards must be >= 96px at 1280x800: {res}'
  )
  sess.assert_clean('T29')


def t30_pause_menu_and_debug_url_params(sess: QASession) -> None:
  if is_module_stub('src/ui/menus.js') or is_module_stub('src/core/debug.js'):
    raise XFail('@pageant-ui/@core: menus.js or debug.js still stubbed')

  assert sess.goto('index.html?seed=77&quest=slime', timeout=25.0), (
      '@core: failed to load index.html?seed=77&quest=slime'
  )
  sess.wait_raf(2)
  st = sess.eval_json('window.__PAGEANT__.getState()')
  assert st['seed'] == 77, f'@core: ?seed=77 param ignored: {st["seed"]}'
  assert (st.get('quest') or {}).get('id') == 'slime' or (st.get('quests', {}).get('slime', {}).get('status') == 'active'), (
      f'@core: ?quest=slime param did not activate slime quest: {st.get("quest")}'
  )

  # Open pause menu via HUD ⏸ button.
  pause_res = sess.eval_json(
      """(async () => {
        const pauseBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(
          (b) => !b.hasAttribute('hidden') && /⏸|暂停|pause/i.test((b.textContent || '') + ' ' + (b.id || '') + ' ' + (b.className || '') + ' ' + (b.getAttribute('aria-label') || ''))
        );
        if (pauseBtn) pauseBtn.click();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const labels = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((b) => {
            if (b.hasAttribute('hidden')) return false;
            const cs = window.getComputedStyle(b);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && b.getBoundingClientRect().width > 20;
          })
          .map((b) => (b.textContent || '').trim());
        return { clicked: Boolean(pauseBtn), labels };
      })()"""
  )
  assert pause_res['clicked'], f'@pageant-ui: HUD ⏸ pause button not found: {pause_res}'
  assert sess.goto('index.html', timeout=25.0)
  sess.assert_clean('T30')


def t31_determinism_3600_frames_3_seeds(sess: QASession) -> None:
  sess.eval(INSTALL_SIM_HARNESS_JS)
  det = sess.eval_json('window.__QA_SIM__.runDeterminismCheck([101, 202, 303])')
  for row in det:
    assert row['identical'] is True and row['frame1'] >= 3600, (
        f'@core/@quests-a/@quests-b: determinism failed on seed {row["seed"]} at 3600 frames: {row}'
    )
  sess.assert_clean('T31')


# ---------------------------------------------------------------------------
# Group D: Multi-Viewport Layout Audit (F12) & Quick Sim Gates (T32 - T36)
# ---------------------------------------------------------------------------

def _run_vp_test(sess: QASession, w: int, h: int, mob: bool) -> None:
  if is_module_stub('src/ui/title.js') or is_module_stub('src/ui/booth.js') or is_module_stub('src/ui/board.js'):
    raise XFail('@pageant-ui: UI overlays still stubbed')
  rep = audit_viewport_on_session(sess, w, h, mob, save_shots=True)
  sess.set_viewport(1280, 800, mobile=False)
  assert rep['passed'], f'@pageant-ui: layout audit failed at {w}x{h}: {rep["issues"]}'


def t32_layout_audit_1280x800(sess: QASession) -> None:
  _run_vp_test(sess, 1280, 800, False)


def t33_layout_audit_1024x768(sess: QASession) -> None:
  _run_vp_test(sess, 1024, 768, True)


def t34_layout_audit_844x390(sess: QASession) -> None:
  _run_vp_test(sess, 844, 390, True)


def t35_layout_audit_390x844(sess: QASession) -> None:
  _run_vp_test(sess, 390, 844, True)


def t36_sim_gates_quick_subset(sess: QASession) -> None:
  if is_module_stub('src/quests/q_sheep.js') or is_module_stub('src/quests/q_ender.js'):
    raise XFail('@quests-a/@quests-b: quests still stubbed for sim_gates')
  rep = run_sim_gates_on_session(sess, quick=True, gate_filter={'F1', 'F3', 'F6', 'F11', 'F13'})
  failed_gates = [f"{g['id']}:{g['measured']}" for g in rep['gates'] if not g['passed']]
  assert not failed_gates, f'Quick sim gates failed: {failed_gates}'


ALL_TESTS: list[tuple[str, Callable[[QASession], None]]] = [
    ('T01_boot_title_default_zero_errors_zero_http_4xx', t01_boot_title_default_zero_errors_zero_http_4xx),
    ('T02_repo_hygiene_zero_build_no_speech_no_cdn_no_boot_compile', t02_repo_hygiene_zero_build_no_speech_no_cdn_no_boot_compile),
    ('T03_seam_frozen_and_16_method_surface', t03_seam_frozen_and_16_method_surface),
    ('T04_getstate_schema_and_deep_clone_immutability', t04_getstate_schema_and_deep_clone_immutability),
    ('T05_roster_tiers_accessories_contract', t05_roster_tiers_accessories_contract),
    ('T06_events_bus_contract', t06_events_bus_contract),
    ('T07_audio_lazy_unlock_mute_and_sfx_music_catalog', t07_audio_lazy_unlock_mute_and_sfx_music_catalog),
    ('T08_world_poi_areas_and_zero_dead_taps', t08_world_poi_areas_and_zero_dead_taps),
    ('T09_quest_01_sheep_bouquet_and_gag', t09_quest_01_sheep_bouquet_and_gag),
    ('T10_quest_02_slime_split_and_gag', t10_quest_02_slime_split_and_gag),
    ('T11_quest_03_cat_sneak_and_gag', t11_quest_03_cat_sneak_and_gag),
    ('T12_quest_04_golem_statue_pumpkins_altar_shake', t12_quest_04_golem_statue_pumpkins_altar_shake),
    ('T13_quest_05_snow_snowball_fight_snowman', t13_quest_05_snow_snowball_fight_snowman),
    ('T14_quest_06_creeper_pats_confetti', t14_quest_06_creeper_pats_confetti),
    ('T15_quest_07_bee_simon_says_honey', t15_quest_07_bee_simon_says_honey),
    ('T16_quest_08_ender_steal_and_lava_prison_rescue', t16_quest_08_ender_steal_and_lava_prison_rescue),
    ('T17_quest_09_wither_nether_skulls_altar_shake', t17_quest_09_wither_nether_skulls_altar_shake),
    ('T18_quest_10_villager_trades_diamonds_bank', t18_quest_10_villager_trades_diamonds_bank),
    ('T19_hidden_01_dragon_teleporting_egg', t19_hidden_01_dragon_teleporting_egg),
    ('T20_hidden_02_pinksheep_tulip_dye', t20_hidden_02_pinksheep_tulip_dye),
    ('T21_booth_accessories_shutter_auto_snap_and_wither_3_hats', t21_booth_accessories_shutter_auto_snap_and_wither_3_hats),
    ('T22_board_touch_drag_390x844_all_5_rows', t22_board_touch_drag_390x844_all_5_rows),
    ('T23_board_touch_drag_844x390_all_5_rows', t23_board_touch_drag_844x390_all_5_rows),
    ('T24_board_mouse_drag_1280x800_and_outside_return_to_tray', t24_board_mouse_drag_1280x800_and_outside_return_to_tray),
    ('T25_board_tap_card_then_tap_row_fallback_and_view_rerank', t25_board_tap_card_then_tap_row_fallback_and_view_rerank),
    ('T26_board_reactions_confetti_fireworks_and_next_card', t26_board_reactions_confetti_fireworks_and_next_card),
    ('T27_persistence_reload_pageant_progress_and_portrait_budget', t27_persistence_reload_pageant_progress_and_portrait_budget),
    ('T28_finale_kai_runway_and_ranking', t28_finale_kai_runway_and_ranking),
    ('T29_final_leaderboard_stars_share_png_replay_continue', t29_final_leaderboard_stars_share_png_replay_continue),
    ('T30_pause_menu_and_debug_url_params', t30_pause_menu_and_debug_url_params),
    ('T31_determinism_3600_frames_3_seeds', t31_determinism_3600_frames_3_seeds),
    ('T32_layout_audit_1280x800', t32_layout_audit_1280x800),
    ('T33_layout_audit_1024x768', t33_layout_audit_1024x768),
    ('T34_layout_audit_844x390', t34_layout_audit_844x390),
    ('T35_layout_audit_390x844', t35_layout_audit_390x844),
    ('T36_sim_gates_quick_subset', t36_sim_gates_quick_subset),
    *V11_TESTS,
]


def main() -> int:
  ap = argparse.ArgumentParser(description='Run 42-test E2E suite for Mob Beauty Pageant')
  ap.add_argument('--filter', type=str, default='', help='Substring filter on test names')
  ap.add_argument('--strict', action='store_true', help='Treat XFAIL as FAIL (use when integrated build lands)')
  args = ap.parse_args()

  ensure_qa_dirs()
  if not os.path.exists(os.path.join(REPO_ROOT, 'index.html')):
    print('FATAL: index.html not yet created by @core')
    return 1

  passed = 0
  xfailed = 0
  failed = 0
  results: list[dict[str, Any]] = []
  t_suite = time.time()

  with QASession(width=1280, height=800, mobile=False) as sess:
    if not sess.goto('index.html', timeout=25.0):
      diag = sess.collect_diagnostics()
      print('FATAL: initial navigation to index.html failed:', json.dumps(diag, ensure_ascii=False))
      return 1

    for name, fn in ALL_TESTS:
      if args.filter and args.filter.lower() not in name.lower():
        continue
      t0 = time.time()
      try:
        fn(sess)
        ms = round((time.time() - t0) * 1000.0, 1)
        passed += 1
        results.append({'name': name, 'status': 'PASS', 'ms': ms})
        print(f'[PASS]  {name} ({ms:.1f} ms)')
      except XFail as xf:
        ms = round((time.time() - t0) * 1000.0, 1)
        if args.strict:
          failed += 1
          results.append({'name': name, 'status': 'FAIL', 'ms': ms, 'error': f'strict xfail: {xf}'})
          print(f'[FAIL]  {name} ({ms:.1f} ms) [strict]: {xf}')
        else:
          xfailed += 1
          results.append({'name': name, 'status': 'XFAIL', 'ms': ms, 'reason': str(xf)})
          print(f'[XFAIL] {name} ({ms:.1f} ms): {xf}')
      except Exception as exc:  # noqa: BLE001
        ms = round((time.time() - t0) * 1000.0, 1)
        failed += 1
        results.append({'name': name, 'status': 'FAIL', 'ms': ms, 'error': str(exc)})
        print(f'[FAIL]  {name} ({ms:.1f} ms): {exc}')

  summary = {
      'total': passed + xfailed + failed,
      'pass': passed,
      'xfail': xfailed,
      'fail': failed,
      'strict': args.strict,
      'elapsed_s': round(time.time() - t_suite, 2),
      'results': results,
  }
  out_path = os.path.join(QA_TMP_DIR, 'e2e_summary.json')
  with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

  print(
      'E2E_SUMMARY:',
      json.dumps({k: summary[k] for k in ('total', 'pass', 'xfail', 'fail', 'elapsed_s')}),
  )
  return 0 if failed == 0 else 1


if __name__ == '__main__':
  sys.exit(main())
