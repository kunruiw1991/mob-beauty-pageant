#!/usr/bin/env python3
"""Fast headless smoke check for Mob Beauty Pageant (owner: qa-sims).

Usage:
  python3 tests/smoke.py                  # boot + seam + all 10 quests teleport/targets smoke
  python3 tests/smoke.py --shot           # also saves /tmp/bv1xyn/shots/qa/smoke_<id>.jpg
  python3 tests/smoke.py --quest sheep    # run a single quest smoke

Exits 0 only if page & seam load cleanly, all checked quests activate without exceptions,
and zero console/runtime/HTTP 4xx-5xx errors occur.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qa_helpers import (  # noqa: E402
    MAIN_QUESTS,
    REPO_ROOT,
    SEAM_METHODS,
    QASession,
    ensure_qa_dirs,
)

SMOKE_BATCH_JS = r"""
(async (questIds, requiredMethods) => {
  const P = window.__PAGEANT__;
  if (!P) return { ok: false, reason: 'window.__PAGEANT__ undefined' };
  const missingMethods = requiredMethods.filter((k) => typeof P[k] !== 'function');
  const frozen = Object.isFrozen(P);

  await P.startGame({ seed: 7 });
  P.stepFrames(60);
  const sBoot = P.getState();

  const questsOut = [];
  for (const qid of questIds) {
    await P.teleport(qid);
    P.stepFrames(30);
    const targets = P.listTargets() || [];
    const sBefore = P.getState();
    const hasPointer = Boolean(sBefore.quest && sBefore.quest.pointer);
    if (targets.length > 0 && targets[0] && targets[0].id !== undefined) {
      await P.tapTarget(targets[0].id);
      P.stepFrames(60);
    } else {
      P.stepFrames(30);
    }
    const sAfter = P.getState();
    const qInfo = (sAfter.quests && sAfter.quests[qid]) || {};
    questsOut.push({
      id: qid,
      area: sAfter.area,
      scene: sAfter.scene,
      status: qInfo.status || (sAfter.quest && sAfter.quest.id === qid ? 'active' : 'unknown'),
      targets: targets.length,
      pointer: hasPointer,
      deadTaps: sAfter.feedback ? sAfter.feedback.dead : -1,
    });
  }
  return {
    ok: missingMethods.length === 0 && frozen,
    frozen,
    missingMethods,
    bootScene: sBoot ? sBoot.scene : null,
    quests: questsOut,
  };
})
"""


def main() -> int:
  ap = argparse.ArgumentParser(description='Fast headless smoke test for Mob Beauty Pageant')
  ap.add_argument('--shot', action='store_true', help='Save JPEG shots to /tmp/bv1xyn/shots/qa/')
  ap.add_argument('--quest', type=str, default='', help='Optional single quest id to test')
  args = ap.parse_args()

  ensure_qa_dirs()
  index_path = os.path.join(REPO_ROOT, 'index.html')
  if not os.path.exists(index_path):
    print('SMOKE_FAIL index.html not yet created by @core')
    return 1

  quest_ids = [args.quest] if args.quest else [q['id'] for q in MAIN_QUESTS]

  with QASession(width=1280, height=800, mobile=False) as sess:
    sess.clear_diagnostics()
    if not sess.goto('index.html', timeout=25.0):
      diag = sess.collect_diagnostics()
      print('SMOKE_FAIL page or window.__PAGEANT__ did not load:', json.dumps(diag, ensure_ascii=False))
      return 1

    if args.shot:
      sess.wait_raf(2)
      print('  shot:', sess.screenshot('smoke_title.jpg'))

    try:
      res = sess.eval_json(
          f'({SMOKE_BATCH_JS})({json.dumps(quest_ids)}, {json.dumps(SEAM_METHODS)})'
      )
    except Exception as exc:  # noqa: BLE001
      diag = sess.collect_diagnostics()
      print('SMOKE_FAIL runtime error during batch:', exc, json.dumps(diag, ensure_ascii=False))
      return 1

    if args.shot:
      for qid in quest_ids:
        try:
          sess.eval(
              f"""(async () => {{
                const P = window.__PAGEANT__;
                await P.startGame({{ seed: 7 }});
                await P.teleport({json.dumps(qid)});
                P.stepFrames(45);
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                return 1;
              }})()"""
          )
          print('  shot:', sess.screenshot(f'smoke_{qid}.jpg'))
        except Exception as exc:  # noqa: BLE001
          print(f'  shot_warn ({qid}): {exc}')

    diag = sess.collect_diagnostics()
    problems = (
        diag['window_errors']
        + diag['exceptions']
        + diag['console_errors']
        + diag['http_errors']
    )

    for q in res.get('quests', []):
      print(
          f"  {q['id']:<9} area={q['area']:<6} status={q['status']:<9} "
          f"targets={q['targets']:<2} pointer={q['pointer']} deadTaps={q['deadTaps']}"
      )

    dead_any = any(q.get('deadTaps', 0) != 0 for q in res.get('quests', []))
    ok = (
        bool(res.get('ok'))
        and not problems
        and not dead_any
    )
    status = 'SMOKE_OK' if ok else 'SMOKE_FAIL'
    print(
        f"{status} quests={len(res.get('quests', []))} frozen={res.get('frozen')} "
        f"missing_seam={res.get('missingMethods')} errors={json.dumps(problems[:5], ensure_ascii=False)}"
    )
    return 0 if ok else 1


if __name__ == '__main__':
  sys.exit(main())
