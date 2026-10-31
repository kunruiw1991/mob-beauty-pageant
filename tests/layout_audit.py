#!/usr/bin/env python3
"""Gate F12 multi-viewport layout & UI audit for Mob Beauty Pageant (owner: qa-sims).

Audits 1280x800, 1024x768, 844x390, and 390x844 across `title`, `world`, `booth`, and `board`:
- 0 horizontal or vertical scrollbars
- 0 overlapping interactive controls / HUD widgets
- Every visible interactive control >= 68x68 CSS px
- <= 5 visible interactive controls in play (`world` scene)
- 0 clipped or off-viewport text elements
- <= 12 CJK characters in any single visible HUD string
- Saves JPEG verification shots strictly under /tmp/bv1xyn/shots/qa/
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qa_helpers import (  # noqa: E402
    QA_SHOTS_DIR,
    QA_TMP_DIR,
    REPO_ROOT,
    VIEWPORTS,
    QASession,
    ensure_qa_dirs,
)

AUDIT_SCENE_DOM_JS = r"""
((sceneName) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docEl = document.documentElement;
  const body = document.body;

  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute('hidden')) return false;
    let cur = el;
    while (cur && cur !== docEl) {
      if (cur.hasAttribute && cur.hasAttribute('hidden')) return false;
      const cs = window.getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') <= 0.05) {
        return false;
      }
      cur = cur.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const describeEl = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? `("${txt}")` : ''}`;
  };

  const roundRect = (r) => ({
    left: Math.round(r.left * 10) / 10,
    top: Math.round(r.top * 10) / 10,
    right: Math.round(r.right * 10) / 10,
    bottom: Math.round(r.bottom * 10) / 10,
    width: Math.round(r.width * 10) / 10,
    height: Math.round(r.height * 10) / 10,
  });

  // 1. Scrollbars / document overflow.
  const scrollbars = {
    innerWidth: vw,
    innerHeight: vh,
    docScrollWidth: docEl.scrollWidth,
    docScrollHeight: docEl.scrollHeight,
    bodyScrollWidth: body ? body.scrollWidth : vw,
    bodyScrollHeight: body ? body.scrollHeight : vh,
  };
  const hasScrollbar = (
    scrollbars.docScrollWidth > vw + 1 ||
    scrollbars.docScrollHeight > vh + 1 ||
    scrollbars.bodyScrollWidth > vw + 1 ||
    scrollbars.bodyScrollHeight > vh + 1
  );

  // 2. Visible interactive controls (deduplicating nested children inside buttons).
  const selector = 'button, [role="button"], a[href], input, select, textarea, [data-draggable="true"], [draggable="true"]';
  const rawInteractive = Array.from(body.querySelectorAll(selector)).filter((el) => {
    if (!isVisible(el)) return false;
    const cs = window.getComputedStyle(el);
    return cs.pointerEvents !== 'none';
  });
  const topInteractive = rawInteractive.filter(
    (el) => !rawInteractive.some((other) => other !== el && other.contains(el))
  );

  const controls = topInteractive.map((el) => ({
    el,
    desc: describeEl(el),
    rect: roundRect(el.getBoundingClientRect()),
  }));

  const undersizedControls = controls
    .filter((c) => c.rect.width < 67.5 || c.rect.height < 67.5)
    .map((c) => ({ desc: c.desc, width: c.rect.width, height: c.rect.height }));

  const offscreenControls = controls
    .filter((c) => (
      c.rect.left < -1.5 || c.rect.top < -1.5 ||
      c.rect.right > vw + 1.5 || c.rect.bottom > vh + 1.5
    ))
    .map((c) => ({ desc: c.desc, rect: c.rect }));

  // 3. Collect distinct UI boxes (interactive controls + visible HUD info widgets) for overlap check.
  const isWrapperOrOverlay = (el) => {
    if (el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return 'skip';
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const large = r.width >= vw * 0.78 && r.height >= vh * 0.78;
    if (large) return 'recurse';
    if (cs.pointerEvents === 'none') {
      // Purely decorative / animated overlay (ghost-hand, flash, iris, vignette) without HUD text.
      const cls = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
      if (/ghost|flash|iris|fx|spark|confetti|splat|vignette|backdrop|bg/.test(cls)) {
        return 'skip';
      }
      if (r.width >= vw * 0.45 && r.height >= vh * 0.45) {
        return 'recurse';
      }
    }
    return 'box';
  };

  const uiBoxes = [];
  const seen = new Set();
  const walkBoxes = (container) => {
    if (!container) return;
    for (const child of Array.from(container.children)) {
      if (!isVisible(child)) continue;
      const kind = isWrapperOrOverlay(child);
      if (kind === 'skip') continue;
      if (kind === 'recurse') {
        walkBoxes(child);
      } else if (!seen.has(child)) {
        seen.add(child);
        uiBoxes.push({ el: child, desc: describeEl(child), rect: roundRect(child.getBoundingClientRect()) });
      }
    }
  };
  walkBoxes(body);
  for (const c of controls) {
    if (!seen.has(c.el)) {
      seen.add(c.el);
      uiBoxes.push(c);
    }
  }

  const overlaps = [];
  for (let i = 0; i < uiBoxes.length; i++) {
    for (let j = i + 1; j < uiBoxes.length; j++) {
      const a = uiBoxes[i];
      const b = uiBoxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const oy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (ox > 3 && oy > 3) {
        overlaps.push({
          a: a.desc,
          b: b.desc,
          ox: Math.round(ox * 10) / 10,
          oy: Math.round(oy * 10) / 10,
        });
      }
    }
  }

  // 4. Clipped text & >12 CJK HUD string check.
  const clippedText = [];
  const longCjkStrings = [];
  const cjkRe = /[\u4e00-\u9fff]/g;
  const allEls = Array.from(body.querySelectorAll('*')).filter(isVisible);
  for (const el of allEls) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS') continue;
    let directText = '';
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) directText += n.textContent || '';
    }
    directText = directText.trim();
    if (!directText) continue;

    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const outViewport = (r.left < -2 || r.top < -2 || r.right > vw + 2 || r.bottom > vh + 2);
    const clipX = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && (el.scrollWidth > el.clientWidth + 3);
    const clipY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && (el.scrollHeight > el.clientHeight + 3);
    if (outViewport || clipX || clipY) {
      clippedText.push({
        desc: describeEl(el),
        outViewport,
        clipX,
        clipY,
        rect: roundRect(r),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      });
    }

    if (sceneName === 'world') {
      const cjkCount = (directText.match(cjkRe) || []).length;
      if (cjkCount > 12) {
        longCjkStrings.push({ desc: describeEl(el), text: directText, cjkCount });
      }
    }
  }

  const isPlayScene = (sceneName === 'world');
  const maxControlsOk = !isPlayScene || (controls.length >= 1 && controls.length <= 5);

  return {
    scene: sceneName,
    viewport: `${vw}x${vh}`,
    hasScrollbar,
    scrollbars,
    controlCount: controls.length,
    maxControlsOk,
    controls: controls.map((c) => ({ desc: c.desc, rect: c.rect })),
    undersizedControls,
    offscreenControls,
    overlaps,
    clippedText,
    longCjkStrings,
    passed: (
      !hasScrollbar &&
      maxControlsOk &&
      undersizedControls.length === 0 &&
      offscreenControls.length === 0 &&
      overlaps.length === 0 &&
      clippedText.length === 0 &&
      longCjkStrings.length === 0
    ),
  };
})
"""


def audit_viewport_on_session(
    sess: QASession,
    width: int,
    height: int,
    mobile: bool,
    save_shots: bool = True,
) -> dict[str, Any]:
  """Runs Gate F12 layout checks at (width, height) across title, world, booth, and board."""
  vp_tag = f'{width}x{height}'
  dims = sess.set_viewport(width, height, mobile=mobile)
  scenes: list[dict[str, Any]] = []
  shots: list[str] = []

  # 1. Title screen (fresh reload so #title is visible by default).
  if not sess.goto('index.html', timeout=25.0):
    raise RuntimeError(f'Failed to navigate to index.html at {vp_tag}')
  sess.set_viewport(width, height, mobile=mobile)
  sess.wait_raf(3)
  title_audit = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("title")')
  scenes.append(title_audit)
  if save_shots:
    shots.append(sess.screenshot(f'layout_{vp_tag}_title.jpg'))

  # 2. Active World HUD (`scene === 'world'`).
  sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await P.startGame({ seed: 1 });
        await P.teleport('sheep');
        P.stepFrames(30);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return P.getState();
      })()"""
  )
  world_audit = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("world")')
  scenes.append(world_audit)
  if save_shots:
    shots.append(sess.screenshot(f'layout_{vp_tag}_world.jpg'))

  # 3. Booth / Runway (`scene === 'booth'`).
  sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await P.completeQuest('sheep');
        for (let k = 0; k < 4; k++) await Promise.resolve();
        P.stepFrames(160);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return P.getState();
      })()"""
  )
  booth_audit = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("booth")')
  scenes.append(booth_audit)
  if save_shots:
    shots.append(sess.screenshot(f'layout_{vp_tag}_booth.jpg'))

  # 4. Tier Board (`scene === 'board'`).
  sess.eval_json(
      """(async () => {
        const P = window.__PAGEANT__;
        await P.boothChoose('flowerCrown');
        await P.boothSnap();
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(45);
        for (let k = 0; k < 4; k++) await Promise.resolve();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return P.getState();
      })()"""
  )
  board_audit = sess.eval_json(f'({AUDIT_SCENE_DOM_JS})("board")')
  scenes.append(board_audit)
  if save_shots:
    shots.append(sess.screenshot(f'layout_{vp_tag}_board.jpg'))

  issues: list[str] = []
  if dims['innerWidth'] != width or dims['innerHeight'] != height:
    issues.append(f'viewport mismatch got {dims}')
  for sc in scenes:
    sname = sc['scene']
    if sc['hasScrollbar']:
      issues.append(f'{sname}: scrollbar {sc["scrollbars"]}')
    if not sc['maxControlsOk']:
      issues.append(f'{sname}: play controlCount={sc["controlCount"]} (expected 1..5)')
    if sc['undersizedControls']:
      issues.append(f'{sname}: undersized (<68px) {sc["undersizedControls"]}')
    if sc['offscreenControls']:
      issues.append(f'{sname}: offscreen controls {sc["offscreenControls"]}')
    if sc['overlaps']:
      issues.append(f'{sname}: overlaps {sc["overlaps"]}')
    if sc['clippedText']:
      issues.append(f'{sname}: clippedText {sc["clippedText"]}')
    if sc['longCjkStrings']:
      issues.append(f'{sname}: HUD string >12 CJK chars {sc["longCjkStrings"]}')

  return {
      'viewport': vp_tag,
      'width': width,
      'height': height,
      'mobile': mobile,
      'passed': len(issues) == 0,
      'issues': issues,
      'scenes': scenes,
      'screenshots': shots,
  }


def run_layout_audit(
    viewports: list[tuple[int, int, bool]] | None = None,
    save_shots: bool = True,
) -> dict[str, Any]:
  ensure_qa_dirs()
  if not os.path.exists(os.path.join(REPO_ROOT, 'index.html')):
    raise RuntimeError('index.html not yet created by @core')

  vps = viewports or VIEWPORTS
  results: list[dict[str, Any]] = []
  with QASession(width=1280, height=800, mobile=False) as sess:
    sess.clear_diagnostics()
    for w, h, mob in vps:
      results.append(audit_viewport_on_session(sess, w, h, mob, save_shots=save_shots))
    sess.assert_clean('layout_audit')

  all_passed = all(r['passed'] for r in results)
  out = {
      'gate': 'F12',
      'passed': all_passed,
      'viewports': results,
      'shots_dir': QA_SHOTS_DIR,
  }
  out_path = os.path.join(QA_TMP_DIR, 'layout_audit.json')
  with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
  return out


def format_layout_markdown(report: dict[str, Any]) -> str:
  lines = [
      '| Viewport | Scrollbars | Play Controls | Targets >= 68px | Overlaps | Clipped Text | Result |',
      '|---|---|---|---|---|---|---|',
  ]
  for vp in report['viewports']:
    scs = vp['scenes']
    has_sb = any(s['hasScrollbar'] for s in scs)
    world_sc = next((s for s in scs if s['scene'] == 'world'), None)
    play_ctrls = str(world_sc['controlCount']) if world_sc else '?'
    under = sum(len(s['undersizedControls']) for s in scs)
    ov = sum(len(s['overlaps']) for s in scs)
    clip = sum(len(s['clippedText']) for s in scs)
    st = 'PASS' if vp['passed'] else 'FAIL'
    lines.append(
        f"| {vp['viewport']} | {'YES' if has_sb else '0'} | {play_ctrls} | "
        f"{'OK' if under == 0 else f'{under} fail'} | {ov} | {clip} | **{st}** |"
    )
  return '\n'.join(lines)


def main() -> int:
  ap = argparse.ArgumentParser(description='Run Gate F12 multi-viewport layout audit')
  ap.add_argument('--viewport', type=str, default='', help='Optional single WxH, e.g. 844x390')
  ap.add_argument('--no-shots', action='store_true', help='Skip saving JPEG screenshots')
  args = ap.parse_args()

  vps = VIEWPORTS
  if args.viewport:
    parts = args.viewport.lower().split('x')
    w, h = int(parts[0]), int(parts[1])
    vps = [(w, h, (w, h) != (1280, 800))]

  report = run_layout_audit(viewports=vps, save_shots=not args.no_shots)
  print(format_layout_markdown(report))
  for vp in report['viewports']:
    if not vp['passed']:
      for issue in vp['issues']:
        print(f"  [ISSUE {vp['viewport']}] {issue}")
  print(f"F12_LAYOUT_{'PASS' if report['passed'] else 'FAIL'} shots={QA_SHOTS_DIR}")
  return 0 if report['passed'] else 1


if __name__ == '__main__':
  sys.exit(main())
