#!/usr/bin/env python3
"""English localization CJK zero-findings audit for Mob Beauty Pageant v1.1.

Exposes:
- install_canvas_text_hook(sess): registers a CDP Page.addScriptToEvaluateOnNewDocument
  script patching CanvasRenderingContext2D.prototype.fillText/strokeText to record
  drawn text into window.__CANVAS_TEXTS__.
- audit_no_cjk(sess) -> dict: scans document.body.innerText, document.title,
  aria-label/title attributes, and window.__CANVAS_TEXTS__ for /[\\u4e00-\\u9fff]/,
  returning per-source counts and offending samples.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qa_helpers import MAIN_QUESTS, QA_TMP_DIR, QASession, ensure_qa_dirs  # noqa: E402

CANVAS_TEXT_HOOK_JS = r"""
(() => {
  if (!Array.isArray(window.__CANVAS_TEXTS__)) {
    window.__CANVAS_TEXTS__ = [];
  }
  const patchProto = (proto) => {
    if (!proto || proto.__l10nCanvasHooked) return;
    Object.defineProperty(proto, '__l10nCanvasHooked', {
      value: true,
      configurable: true,
      enumerable: false,
      writable: false,
    });
    for (const method of ['fillText', 'strokeText']) {
      const orig = proto[method];
      if (typeof orig !== 'function') continue;
      proto[method] = function patchedCanvasText(text, ...rest) {
        try {
          if (text !== undefined && text !== null) {
            const s = String(text);
            if (s.length > 0 && Array.isArray(window.__CANVAS_TEXTS__) && window.__CANVAS_TEXTS__.length < 50000) {
              window.__CANVAS_TEXTS__.push(s);
            }
          }
        } catch (_err) {
          // Never disrupt canvas rendering.
        }
        return orig.call(this, text, ...rest);
      };
    }
  };
  if (typeof CanvasRenderingContext2D !== 'undefined') {
    patchProto(CanvasRenderingContext2D.prototype);
  }
  if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
    patchProto(OffscreenCanvasRenderingContext2D.prototype);
  }
})();
"""

AUDIT_NO_CJK_JS = r"""
(() => {
  const cjkRe = /[\u4e00-\u9fff]/;

  const innerHits = [];
  const rawBody = (document.body && typeof document.body.innerText === 'string')
    ? document.body.innerText
    : '';
  for (const line of rawBody.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && cjkRe.test(trimmed)) {
      innerHits.push(trimmed.slice(0, 120));
    }
  }

  const docTitle = String(document.title || '');
  const titleHits = cjkRe.test(docTitle) ? [docTitle] : [];

  const attrHits = [];
  const els = document.querySelectorAll('[aria-label], [title]');
  for (const el of Array.from(els)) {
    const tag = (el.tagName || '').toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    for (const attrName of ['aria-label', 'title']) {
      const val = el.getAttribute(attrName);
      if (val && cjkRe.test(val)) {
        attrHits.push({
          el: `${tag}${id}`,
          attr: attrName,
          value: val.slice(0, 120),
        });
      }
    }
  }

  const canvasTexts = Array.isArray(window.__CANVAS_TEXTS__) ? window.__CANVAS_TEXTS__ : [];
  const canvasHits = [];
  for (const entry of canvasTexts) {
    const s = String(entry ?? '');
    if (s && cjkRe.test(s)) {
      canvasHits.push(s.slice(0, 120));
    }
  }
  const uniqueCanvasHits = Array.from(new Set(canvasHits));

  const counts = {
    innerText: innerHits.length,
    title: titleHits.length,
    attrs: attrHits.length,
    canvas: canvasHits.length,
  };
  const total = counts.innerText + counts.title + counts.attrs + counts.canvas;
  counts.total = total;

  const offending = [
    ...titleHits.map((t) => `title:${t}`),
    ...innerHits.slice(0, 10).map((t) => `innerText:${t}`),
    ...attrHits.slice(0, 10).map((a) => `attr:${a.el}[${a.attr}]=${a.value}`),
    ...uniqueCanvasHits.slice(0, 10).map((t) => `canvas:${t}`),
  ];

  return {
    passed: total === 0,
    ok: total === 0,
    total,
    counts,
    samples: {
      innerText: innerHits.slice(0, 20),
      title: titleHits.slice(0, 5),
      attrs: attrHits.slice(0, 20),
      canvas: uniqueCanvasHits.slice(0, 20),
    },
    offending,
    canvasRecorded: canvasTexts.length,
  };
})()
"""


def _unwrap_browser(sess: Any) -> Any:
  """Returns the underlying CDP Browser whether passed QASession or Browser."""
  b = getattr(sess, 'b', None)
  return b if b is not None else sess


def install_canvas_text_hook(sess: Any) -> dict[str, Any]:
  """Installs a persistent CDP new-document hook recording canvas fillText/strokeText."""
  browser = _unwrap_browser(sess)
  res = browser.cmd('Page.addScriptToEvaluateOnNewDocument', source=CANVAS_TEXT_HOOK_JS)
  try:
    browser.eval(CANVAS_TEXT_HOOK_JS)
  except Exception:
    pass
  return res if isinstance(res, dict) else {}


def audit_no_cjk(sess: Any) -> dict[str, Any]:
  """Scans innerText, document.title, aria-label/title attrs, and __CANVAS_TEXTS__ for CJK."""
  if hasattr(sess, 'eval_json'):
    res = sess.eval_json(AUDIT_NO_CJK_JS)
  else:
    raw = _unwrap_browser(sess).eval(f'JSON.stringify({AUDIT_NO_CJK_JS})')
    res = json.loads(raw) if raw else {}
  return res


def run_full_flow_audit() -> dict[str, Any]:
  """Walks title -> world -> booth -> board -> finale -> final and audits CJK at every stop."""
  ensure_qa_dirs()
  per_scene: dict[str, Any] = {}
  with QASession(width=1280, height=800, mobile=False) as sess:
    install_canvas_text_hook(sess)
    if not sess.goto('index.html', timeout=25.0):
      raise RuntimeError('Failed to load index.html for l10n_audit')
    sess.wait_raf(3)
    per_scene['title'] = audit_no_cjk(sess)

    # World scene
    sess.eval_json(
        """(async () => {
          const P = window.__PAGEANT__;
          await P.startGame({ seed: 7 });
          await P.teleport('sheep');
          P.stepFrames(30);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return P.getState().scene;
        })()"""
    )
    per_scene['world'] = audit_no_cjk(sess)

    # Booth scene
    sess.eval_json(
        """(async () => {
          const P = window.__PAGEANT__;
          await P.completeQuest('sheep');
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(160);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return P.getState().scene;
        })()"""
    )
    per_scene['booth'] = audit_no_cjk(sess)

    # Board scene
    sess.eval_json(
        """(async () => {
          const P = window.__PAGEANT__;
          await P.boothChoose('flowerCrown');
          await P.boothSnap();
          for (let k = 0; k < 8; k++) await Promise.resolve();
          P.stepFrames(45);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return P.getState().scene;
        })()"""
    )
    per_scene['board'] = audit_no_cjk(sess)

    # Complete remaining quests -> finale (Kai bubble) -> final leaderboard + share PNG render
    qids = [q['id'] for q in MAIN_QUESTS]
    sess.eval_json(
        f"""(async () => {{
          const P = window.__PAGEANT__;
          await P.boardDrop('sheep', 'perfect');
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(90);
          await P.continue();
          for (let k = 0; k < 8; k++) await Promise.resolve();
          for (let nx = 0; nx < 10; nx++) {{
            P.stepFrames(15);
            for (let k = 0; k < 4; k++) await Promise.resolve();
            if (P.getState().scene === 'world') break;
          }}
          const rest = {json.dumps(qids[1:])};
          for (let i = 0; i < rest.length; i++) {{
            const qid = rest[i];
            await P.teleport(qid);
            P.stepFrames(12);
            await P.completeQuest(qid);
            for (let k = 0; k < 6; k++) await Promise.resolve();
            P.stepFrames(90);
            await P.boothChoose('crown');
            await P.boothSnap();
            for (let b = 0; b < 8; b++) {{
              P.stepFrames(12);
              for (let k = 0; k < 4; k++) await Promise.resolve();
              if (P.getState().scene === 'board') break;
            }}
            await P.boardDrop(qid, 'gorgeous');
            for (let k = 0; k < 6; k++) await Promise.resolve();
            P.stepFrames(90);
            await P.continue();
            for (let k = 0; k < 8; k++) await Promise.resolve();
            for (let nx = 0; nx < 10; nx++) {{
              P.stepFrames(15);
              for (let k = 0; k < 4; k++) await Promise.resolve();
              const sc = P.getState().scene;
              if (sc === 'world' || sc === 'finale' || sc === 'board') break;
            }}
          }}
          for (let g = 0; g < 24; g++) {{
            P.stepFrames(15);
            for (let k = 0; k < 6; k++) await Promise.resolve();
            if (P.getState().scene === 'board') {{
              await P.boardDrop('kai', 'tryhard');
              for (let k = 0; k < 6; k++) await Promise.resolve();
              break;
            }}
          }}
          P.stepFrames(180);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          await P.continue();
          for (let k = 0; k < 8; k++) await Promise.resolve();
          for (let g = 0; g < 24; g++) {{
            P.stepFrames(15);
            for (let k = 0; k < 6; k++) await Promise.resolve();
            if (P.getState().scene === 'final') break;
          }}
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return P.getState().scene;
        }})()"""
    )
    per_scene['final'] = audit_no_cjk(sess)
    sess.assert_clean('l10n_audit')

  overall_total = sum(sc['total'] for sc in per_scene.values())
  out = {
      'passed': overall_total == 0,
      'total': overall_total,
      'scenes': per_scene,
  }
  out_path = os.path.join(QA_TMP_DIR, 'l10n_audit.json')
  with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
  return out


def main() -> int:
  rep = run_full_flow_audit()
  print(json.dumps(rep, ensure_ascii=False, indent=2))
  return 0 if rep['passed'] else 1


if __name__ == '__main__':
  sys.exit(main())
