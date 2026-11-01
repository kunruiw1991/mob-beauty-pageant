#!/usr/bin/env python3
"""Shared QA helper utilities and binding spec constants for Mob Beauty Pageant (owner: qa-sims).

Wraps tests/cdp.py `Browser` with touch/mouse PointerEvent helpers, diagnostic checks,
and canonical roster/world/seam/gate metadata from docs/DESIGN.md.
All temporary outputs and JPEG screenshots live strictly under /tmp/bv1xyn/.
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

sys.dont_write_bytecode = True

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP_ROOT = os.environ.get('PAGEANT_TMP', '/tmp/bv1xyn')  # override with PAGEANT_TMP=/some/scratch/dir
QA_TMP_DIR = os.path.join(TMP_ROOT, 'qa')
QA_SHOTS_DIR = os.path.join(TMP_ROOT, 'shots', 'qa')
GATES_JSON_PATH = os.path.join(QA_TMP_DIR, 'gates.json')
GATES_MD_PATH = os.path.join(QA_TMP_DIR, 'gates.md')

# Canonical 10 main quests in §4 / §6 order.
MAIN_QUESTS: list[dict[str, Any]] = [
    {
        'id': 'sheep',
        'name': 'Blossom',
        'mob': 'Sheep',
        'order': 1,
        'area': 'hub',
        'poi': 'meadow',
        'gags': ['sheep_eats_bouquet'],
        'accessories': ['flowerCrown', 'bow', 'strawHat'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/q_sheep.js',
    },
    {
        'id': 'slime',
        'name': 'Bobo',
        'mob': 'Slime',
        'order': 2,
        'area': 'hub',
        'poi': 'swamp',
        'gags': ['kai_bounced', 'slime_pet'],
        'accessories': ['slimeHat', 'crown', 'sunglasses'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/q_slime.js',
    },
    {
        'id': 'cat',
        'name': 'Mimi',
        'mob': 'Cat',
        'order': 3,
        'area': 'hub',
        'poi': 'jungle',
        'gags': ['cat_gift_kai_hat'],
        'accessories': ['bow', 'beanie', 'headphones'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/q_cat.js',
    },
    {
        'id': 'golem',
        'name': 'Tinny',
        'mob': 'Iron Golem',
        'order': 4,
        'area': 'hub',
        'poi': 'cave',
        'gags': ['fake_iron', 'kai_hogs_pumpkins', 'snow_head_pop'],
        'accessories': ['flowerCrown', 'topHat', 'sunglasses'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/q_golem.js',
    },
    {
        'id': 'snow',
        'name': 'Snowy',
        'mob': 'Snow Golem',
        'order': 5,
        'area': 'hub',
        'poi': 'snowArena',
        'gags': ['kai_snowman'],
        'accessories': ['beanie', 'scarf', 'pumpkinHat'],
        'heads': 1,
        'owner': 'quests-b',
        'file': 'src/quests/q_snow.js',
    },
    {
        'id': 'creeper',
        'name': 'Hissy',
        'mob': 'Creeper',
        'order': 6,
        'area': 'hub',
        'poi': 'clearing',
        'gags': ['creeper_confetti'],
        'accessories': ['partyHat', 'bow', 'sunglasses'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/q_creeper.js',
    },
    {
        'id': 'bee',
        'name': 'Buzzy',
        'mob': 'Bee',
        'order': 7,
        'area': 'hub',
        'poi': 'hive',
        'gags': ['kai_honey'],
        'accessories': ['flowerCrown', 'crown', 'headphones'],
        'heads': 1,
        'owner': 'quests-b',
        'file': 'src/quests/q_bee.js',
    },
    {
        'id': 'ender',
        'name': 'Endie',
        'mob': 'Enderman',
        'order': 8,
        'area': 'hub',
        'poi': 'endPortal',
        'gags': ['kai_steal', 'kai_cake_face'],
        'accessories': ['halo', 'beret', 'sunglasses'],
        'heads': 1,
        'owner': 'quests-b',
        'file': 'src/quests/q_ender.js',
    },
    {
        'id': 'wither',
        'name': 'Trio',
        'mob': 'Wither',
        'order': 9,
        'area': 'nether',
        'poi': 'netherPortal',
        'gags': ['skeleton_bald', 'wither_three_hats'],
        'accessories': ['crown', 'partyHat', 'topHat'],
        'heads': 3,
        'owner': 'quests-b',
        'file': 'src/quests/q_wither.js',
    },
    {
        'id': 'villager',
        'name': 'Emma',
        'mob': 'Villager',
        'order': 10,
        'area': 'hub',
        'poi': 'stall',
        'gags': ['kai_faint', 'emerald_eyes'],
        'accessories': ['strawHat', 'crown', 'beret'],
        'heads': 1,
        'owner': 'quests-b',
        'file': 'src/quests/q_villager.js',
    },
]

HIDDEN_CONTESTANTS: list[dict[str, Any]] = [
    {
        'id': 'dragon',
        'name': 'Baby Dragon',
        'mob': 'Ender Dragon',
        'order': 11,
        'area': 'end',
        'poi': 'dragonEgg',
        'gags': ['egg_hop'],
        'accessories': ['crown', 'partyHat', 'halo'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/hidden.js',
    },
    {
        'id': 'pinksheep',
        'name': 'Pinky',
        'mob': 'Pink Sheep',
        'order': 12,
        'area': 'hub',
        'poi': 'pinkTulip',
        'gags': ['pink_dye'],
        'accessories': ['bow', 'flowerCrown', 'starClip'],
        'heads': 1,
        'owner': 'quests-a',
        'file': 'src/quests/hidden.js',
    },
]

QUEST_BY_ID: dict[str, dict[str, Any]] = {q['id']: q for q in MAIN_QUESTS}
ALL_CONTESTANTS: list[dict[str, Any]] = MAIN_QUESTS + HIDDEN_CONTESTANTS

# Binding content floors from director #143 (ideal agent, seconds from activation; ceiling <= 90s).
# #143 ideal-agent quest floors. v1.1: walking is 1.5x faster (user request), so every floor scales x0.8
# (measured ideal medians shrank 1-22 %; quest content unchanged). v1.0 values in the comments.
QUEST_IDEAL_FLOORS_S: dict[str, float] = {
    'sheep': 16.0,     # 20
    'slime': 20.0,     # 25
    'cat': 20.0,       # 25
    'golem': 40.0,     # 50
    'snow': 16.0,      # 20
    'creeper': 14.4,   # 18
    'bee': 20.0,       # 25
    'ender': 40.0,     # 50
    'wither': 36.0,    # 45
    'villager': 32.0,  # 40
}

TIERS: list[dict[str, Any]] = [
    {'id': 'perfect', 'label': 'PERFECT', 'icon': '👑', 'color': '#c43bd8', 'order': 0},
    {'id': 'gorgeous', 'label': 'GORGEOUS', 'icon': '💎', 'color': '#3b5bdb', 'order': 1},
    {'id': 'pretty', 'label': 'PRETTY', 'icon': '🌸', 'color': '#f2c318', 'order': 2},
    {'id': 'okay', 'label': 'OKAY', 'icon': '🙂', 'color': '#d9342b', 'order': 3},
    {'id': 'tryhard', 'label': 'KEEP TRYING', 'icon': '💪', 'color': '#3fae3a', 'order': 4},
]
TIER_IDS: list[str] = [t['id'] for t in TIERS]

ACCESSORY_IDS: list[str] = [
    'crown', 'flowerCrown', 'bow', 'strawHat', 'topHat', 'sunglasses',
    'partyHat', 'pumpkinHat', 'slimeHat', 'beanie', 'headphones', 'halo',
    'scarf', 'beret', 'starClip', 'chefHat',
]

# §5 required POI keys (32).
POI_KEYS: list[str] = [
    'spawn', 'plaza', 'board', 'runway', 'stage', 'meadow', 'hive', 'swamp',
    'cave', 'villageSquare', 'statue', 'pumpkins', 'ironAltar', 'bank', 'stall',
    'snow', 'snowArena', 'shrine', 'endPortal', 'netherPortal', 'kaiHouse',
    'prison', 'prisonCell', 'jungle', 'clearing', 'pinkTulip', 'endArrive',
    'endCage', 'dragonEgg', 'netherArrive', 'fortress', 'soulSand', 'witherAltar',
]

# §3.9 required window.__PAGEANT__ seam methods.
SEAM_METHODS: list[str] = [
    'startGame', 'teleport', 'completeQuest', 'rank', 'stepFrames', 'getState',
    'listTargets', 'tapTarget', 'tapScreen', 'pressAction', 'boothChoose',
    'boothSnap', 'boardDrop', 'continue', 'perf', 'setMuted',
]

# §9 procedural SFX names and music tracks.
REQUIRED_SFX_NAMES: list[str] = [
    'step_grass', 'step_stone', 'step_snow', 'tap', 'blocked', 'hit_stone',
    'hit_wood', 'hit_soft', 'break', 'pickup', 'xp', 'pop', 'boing', 'splash',
    'hiss', 'confetti', 'snow_throw', 'snow_hit', 'vwoop', 'rumble', 'thunder',
    'wither_spawn', 'golem_spawn', 'hrrm', 'meow', 'baa', 'buzz', 'kai_laugh',
    'kai_whine', 'shutter', 'cheer', 'aww', 'clap', 'fanfare', 'drumroll',
    'munch', 'sneeze', 'kaching', 'portal', 'snip',
    'note0', 'note1', 'note2', 'note3', 'note4', 'note5',
]

REQUIRED_MUSIC_TRACKS: list[str] = [
    'title', 'overworld', 'nether', 'end', 'runway', 'finale',
]

VIEWPORTS: list[tuple[int, int, bool]] = [
    (1280, 800, False),
    (1024, 768, True),
    (844, 390, True),
    (390, 844, True),
]


class XFail(Exception):
  """Raised when an E2E test hits a module stub not yet finished by another builder."""


def ensure_qa_dirs() -> None:
  os.makedirs(QA_TMP_DIR, exist_ok=True)
  os.makedirs(QA_SHOTS_DIR, exist_ok=True)


def is_module_stub(rel_path: str) -> bool:
  """Heuristic check whether a repo file is still missing or marked as a day-one stub."""
  full = os.path.join(REPO_ROOT, rel_path)
  if not os.path.exists(full):
    return True
  try:
    with open(full, 'r', encoding='utf-8') as f:
      txt = f.read()
  except OSError:
    return True
  raw_lines = txt.splitlines()
  header = '\n'.join(raw_lines[:5]).lower()
  if 'stub' in header:
    return True
  upper = txt.upper()
  if 'DAY-ONE STUB' in upper or 'TODO_STUB' in upper:
    return True
  code_lines = [ln for ln in raw_lines if ln.strip() and not ln.strip().startswith('//')]
  return len(code_lines) < 18


def owner_for_path(rel_path: str) -> str:
  if rel_path in ('index.html', 'src/main.js') or rel_path.startswith(('src/core/', 'src/data/')):
    return '@core'
  if rel_path.startswith('src/world/'):
    return '@voxel-world'
  if rel_path.startswith('src/chars/'):
    return '@characters'
  if rel_path.startswith('src/quests/'):
    bn = os.path.basename(rel_path)
    if bn in ('rival.js', 'finale.js', 'q_snow.js', 'q_bee.js', 'q_ender.js', 'q_wither.js', 'q_villager.js'):
      return '@quests-b'
    return '@quests-a'
  if rel_path.startswith(('src/ui/', 'styles/')):
    return '@pageant-ui'
  if rel_path.startswith('src/fx/'):
    return '@fx-audio'
  return '@core'


class QASession:
  """Context-managed wrapper over tests/cdp.py Browser with touch/mouse & diagnostic helpers."""

  def __init__(self, width: int = 1280, height: int = 800, mobile: bool = False):
    ensure_qa_dirs()
    self._browser = Browser(width=width, height=height, root=REPO_ROOT, mobile=mobile)
    self.b: Browser | None = None

  def __enter__(self) -> 'QASession':
    self.b = self._browser.__enter__()
    return self

  def __exit__(self, *exc: Any) -> None:
    self._browser.__exit__(*exc)

  def goto(
      self,
      path: str = 'index.html',
      wait_expr: str = 'window.__PAGEANT__ !== undefined',
      timeout: float = 25.0,
  ) -> bool:
    assert self.b is not None
    return self.b.goto(path, wait_expr=wait_expr, timeout=timeout)

  def reload(
      self,
      wait_expr: str = 'window.__PAGEANT__ !== undefined',
      timeout: float = 25.0,
  ) -> bool:
    assert self.b is not None
    self.b.cmd('Page.reload', ignoreCache=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
      try:
        if self.eval(f'!!({wait_expr})'):
          return True
      except RuntimeError:
        pass
      time.sleep(0.15)
    return False

  def eval(self, expr: str, await_promise: bool = True) -> Any:
    assert self.b is not None
    return self.b.eval(expr, await_promise=await_promise)

  def eval_json(self, expr: str) -> Any:
    assert self.b is not None
    raw = self.b.eval(
        f'(async () => JSON.stringify(await (\n{expr}\n)))()',
        await_promise=True,
    )
    return json.loads(raw) if raw is not None else None

  def clear_diagnostics(self) -> None:
    assert self.b is not None
    self.b.console.clear()
    self.b.exceptions.clear()
    self.b.requests.clear()
    try:
      self.b.eval('if (Array.isArray(window.__ERRORS__)) window.__ERRORS__.length = 0; true')
    except Exception:
      pass

  def collect_diagnostics(self) -> dict[str, list[Any]]:
    assert self.b is not None
    win_errs: list[str] = []
    try:
      raw = self.b.eval('JSON.stringify(window.__ERRORS__ || [])')
      if raw:
        win_errs = json.loads(raw)
    except Exception as exc:
      win_errs = [f'eval_window_errors_failed: {exc}']
    console_errs = [
        msg for typ, msg in self.b.console
        if typ in ('error', 'assert') and 'favicon.ico' not in msg
    ]
    http_errs = [
        f'{cmd} {path} -> {code}'
        for cmd, path, code in self.b.requests
        if str(code).startswith(('4', '5')) and not str(path).endswith('/favicon.ico')
    ]
    return {
        'window_errors': win_errs,
        'exceptions': [str(x) for x in self.b.exceptions],
        'console_errors': console_errs,
        'http_errors': http_errs,
    }

  def assert_clean(self, label: str = '') -> None:
    diag = self.collect_diagnostics()
    problems = (
        diag['window_errors']
        + diag['exceptions']
        + diag['console_errors']
        + diag['http_errors']
    )
    if problems:
      prefix = f'[{label}] ' if label else ''
      raise AssertionError(
          f'{prefix}unexpected runtime/console/HTTP errors: {json.dumps(diag, ensure_ascii=False)}'
      )

  def set_viewport(self, width: int, height: int, mobile: bool = False) -> dict[str, int]:
    assert self.b is not None
    self.b.width = width
    self.b.height = height
    self.b.mobile = mobile
    self.b.cmd(
        'Emulation.setDeviceMetricsOverride',
        width=width,
        height=height,
        deviceScaleFactor=1,
        mobile=mobile,
    )
    self.b.cmd(
        'Emulation.setTouchEmulationEnabled',
        enabled=bool(mobile),
        maxTouchPoints=5 if mobile else 1,
    )
    return self.eval_json(
        """(async () => {
          window.dispatchEvent(new Event('resize'));
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
        })()"""
    )

  def wait_raf(self, frames: int = 2) -> None:
    n = max(1, int(frames))
    self.eval(
        f"""(async () => {{
          for (let i = 0; i < {n}; i++) {{
            await new Promise(r => requestAnimationFrame(r));
          }}
          return true;
        }})()"""
    )

  def mouse_tap(self, x: float, y: float) -> None:
    assert self.b is not None
    xf, yf = float(x), float(y)
    self.b.cmd('Input.dispatchMouseEvent', type='mouseMoved', x=xf, y=yf, button='none', buttons=0)
    self.b.cmd('Input.dispatchMouseEvent', type='mousePressed', x=xf, y=yf, button='left', buttons=1, clickCount=1)
    self.b.cmd('Input.dispatchMouseEvent', type='mouseReleased', x=xf, y=yf, button='left', buttons=0, clickCount=1)

  def mouse_drag(
      self,
      x0: float,
      y0: float,
      x1: float,
      y1: float,
      steps: int = 16,
      hold_end_s: float = 0.03,
  ) -> None:
    assert self.b is not None
    self.b.cmd('Input.dispatchMouseEvent', type='mouseMoved', x=float(x0), y=float(y0), button='none', buttons=0)
    self.b.cmd('Input.dispatchMouseEvent', type='mousePressed', x=float(x0), y=float(y0), button='left', buttons=1, clickCount=1)
    for i in range(1, steps + 1):
      xi = x0 + (x1 - x0) * i / steps
      yi = y0 + (y1 - y0) * i / steps
      self.b.cmd('Input.dispatchMouseEvent', type='mouseMoved', x=float(xi), y=float(yi), button='left', buttons=1)
      if i % 4 == 0:
        time.sleep(0.006)
    if hold_end_s > 0:
      time.sleep(hold_end_s)
    self.b.cmd('Input.dispatchMouseEvent', type='mouseReleased', x=float(x1), y=float(y1), button='left', buttons=0, clickCount=1)

  def touch_tap(self, x: float, y: float) -> None:
    assert self.b is not None
    pt = [{'x': round(float(x), 1), 'y': round(float(y), 1), 'radiusX': 6, 'radiusY': 6, 'force': 1.0, 'id': 1}]
    self.b.cmd('Input.dispatchTouchEvent', type='touchStart', touchPoints=pt)
    time.sleep(0.015)
    self.b.cmd('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])

  def touch_drag(
      self,
      x0: float,
      y0: float,
      x1: float,
      y1: float,
      steps: int = 18,
      hold_end_s: float = 0.04,
  ) -> None:
    assert self.b is not None
    p0 = [{'x': round(float(x0), 1), 'y': round(float(y0), 1), 'radiusX': 6, 'radiusY': 6, 'force': 1.0, 'id': 1}]
    self.b.cmd('Input.dispatchTouchEvent', type='touchStart', touchPoints=p0)
    time.sleep(0.01)
    for i in range(1, steps + 1):
      xi = x0 + (x1 - x0) * i / steps
      yi = y0 + (y1 - y0) * i / steps
      pi = [{'x': round(float(xi), 1), 'y': round(float(yi), 1), 'radiusX': 6, 'radiusY': 6, 'force': 1.0, 'id': 1}]
      self.b.cmd('Input.dispatchTouchEvent', type='touchMove', touchPoints=pi)
      if i % 4 == 0:
        time.sleep(0.006)
    if hold_end_s > 0:
      time.sleep(hold_end_s)
    self.b.cmd('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])

  def screenshot(self, filename: str, quality: int = 85) -> str:
    """Saves a JPEG screenshot strictly under /tmp/bv1xyn/shots/qa/."""
    assert self.b is not None
    base, ext = os.path.splitext(filename)
    if ext.lower() not in ('.jpg', '.jpeg'):
      filename = f'{base}.jpg'
    path = filename if os.path.isabs(filename) else os.path.join(QA_SHOTS_DIR, filename)
    if not path.startswith(TMP_ROOT + '/'):
      raise ValueError(f'Screenshot path must stay under {TMP_ROOT}: {path}')
    return self.b.screenshot(path, fmt='jpeg', quality=quality)


LOCATE_BOARD_HANDLES_JS = r"""
((contestantId, tiersMeta) => {
  const docEl = document.documentElement;
  const isVis = (el) => {
    if (!el || !(el instanceof Element) || el.hasAttribute('hidden')) return false;
    let cur = el;
    while (cur && cur !== docEl) {
      if (cur.hasAttribute && cur.hasAttribute('hidden')) return false;
      const cs = window.getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') <= 0.05) return false;
      cur = cur.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };

  const rows = {};
  const rowEls = [];
  for (const t of tiersMeta) {
    let el = document.querySelector(
      `[data-tier="${t.id}"], [data-tier-id="${t.id}"], [data-row="${t.id}"], #tier-${t.id}, .tier-row-${t.id}`
    );
    if (!el || !isVis(el)) {
      const cands = Array.from(document.querySelectorAll('div, section, li, button')).filter(isVis);
      const labelMatches = cands.filter((node) => {
        const txt = (node.textContent || '').trim();
        return txt.includes(t.label);
      });
      // Pick the widest row-like ancestor/element that contains this tier label and NOT other tier labels.
      const otherLabels = tiersMeta.filter((o) => o.id !== t.id).map((o) => o.label);
      const exclusive = labelMatches.filter((node) => {
        const txt = (node.textContent || '');
        return !otherLabels.some((ol) => txt.includes(ol));
      });
      exclusive.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      el = exclusive[0] || null;
    }
    if (el && isVis(el)) {
      rowEls.push(el);
      // Prefer explicit drop/cards slot inside the row if present.
      const slot = el.querySelector('[data-tier-cards], .tier-row-cards, .tier-cards, .tier-drop, .row-cards');
      const targetEl = (slot && isVis(slot)) ? slot : el;
      const r = targetEl.getBoundingClientRect();
      const fullR = el.getBoundingClientRect();
      rows[t.id] = {
        x: Math.round((r.left + r.width * 0.55) * 10) / 10,
        y: Math.round((r.top + r.height * 0.50) * 10) / 10,
        width: Math.round(fullR.width * 10) / 10,
        height: Math.round(fullR.height * 10) / 10,
      };
    }
  }

  // Locate unranked polaroid card for contestantId.
  let cardEl = null;
  const directSel = [
    `[data-contestant="${contestantId}"]`,
    `[data-contestant-id="${contestantId}"]`,
    `[data-card="${contestantId}"]`,
    `[data-id="${contestantId}"]`,
  ].join(', ');
  const directCands = Array.from(document.querySelectorAll(directSel)).filter(isVis);
  cardEl = directCands.find((el) => !rowEls.some((re) => re.contains(el))) || directCands[0] || null;

  if (!cardEl) {
    const fallbackSel = '.polaroid, .tray-card, .board-card, [data-draggable="true"], [draggable="true"]';
    const fb = Array.from(document.querySelectorAll(fallbackSel)).filter(isVis);
    cardEl = fb.find((el) => !rowEls.some((re) => re.contains(el))) || fb[0] || null;
  }

  let card = null;
  if (cardEl && isVis(cardEl)) {
    const cr = cardEl.getBoundingClientRect();
    card = {
      x: Math.round((cr.left + cr.width * 0.50) * 10) / 10,
      y: Math.round((cr.top + cr.height * 0.50) * 10) / 10,
      width: Math.round(cr.width * 10) / 10,
      height: Math.round(cr.height * 10) / 10,
    };
  }

  return { card, rows, foundRowCount: Object.keys(rows).length };
})
"""


def open_board_for_contestant(
    sess: QASession,
    contestant_id: str = 'sheep',
    seed: int = 11,
) -> dict[str, Any]:
  """Resets a fresh run, force-completes contestant_id -> booth -> snap -> board in rank mode."""
  return sess.eval_json(
      f"""(async () => {{
        const P = window.__PAGEANT__;
        await P.startGame({{ seed: {int(seed)} }});
        await P.completeQuest({json.dumps(contestant_id)});
        for (let k = 0; k < 6; k++) await Promise.resolve();
        P.stepFrames(160);
        const accs = ['flowerCrown', 'crown', 'bow'];
        await P.boothChoose(accs[0]);
        await P.boothSnap();
        for (let k = 0; k < 8; k++) await Promise.resolve();
        let guard = 0;
        while (P.getState().scene !== 'board' && guard < 240) {{
          P.stepFrames(15);
          for (let k = 0; k < 4; k++) await Promise.resolve();
          guard += 15;
        }}
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return P.getState();
      }})()"""
  )


def verify_board_tier_mode(
    sess: QASession,
    width: int,
    height: int,
    mode: str,
    contestant_id: str = 'sheep',
) -> dict[str, Any]:
  """Tests ranking across all 5 tiers via 'touch', 'mouse', or 'taptap' at (width, height)."""
  mobile = (mode == 'touch') or (width, height) != (1280, 800)
  sess.set_viewport(width, height, mobile=mobile)
  per_tier: list[dict[str, Any]] = []

  for idx, tier in enumerate(TIERS):
    tid = tier['id']
    st0 = open_board_for_contestant(sess, contestant_id=contestant_id, seed=30 + idx)
    handles = sess.eval_json(
        f'({LOCATE_BOARD_HANDLES_JS})({json.dumps(contestant_id)}, {json.dumps(TIERS)})'
    )
    card = handles.get('card')
    row = (handles.get('rows') or {}).get(tid)
    if st0.get('scene') != 'board' or not card or not row:
      per_tier.append({
          'tier': tid,
          'ok': False,
          'reason': f"scene={st0.get('scene')} card={card} row={row}",
      })
      continue

    if mode == 'touch':
      sess.touch_drag(card['x'], card['y'], row['x'], row['y'], steps=18, hold_end_s=0.04)
    elif mode == 'mouse':
      sess.mouse_drag(card['x'], card['y'], row['x'], row['y'], steps=16, hold_end_s=0.03)
    elif mode == 'taptap':
      if mobile:
        sess.touch_tap(card['x'], card['y'])
      else:
        sess.mouse_tap(card['x'], card['y'])
      time.sleep(0.32)
      sess.wait_raf(2)
      # Re-locate row in case selecting the card shifted tray/row layout slightly.
      handles2 = sess.eval_json(
          f'({LOCATE_BOARD_HANDLES_JS})({json.dumps(contestant_id)}, {json.dumps(TIERS)})'
      )
      row2 = (handles2.get('rows') or {}).get(tid) or row
      if mobile:
        sess.touch_tap(row2['x'], row2['y'])
      else:
        sess.mouse_tap(row2['x'], row2['y'])
    else:
      raise ValueError(f'Unknown board interaction mode: {mode}')

    st_after = sess.eval_json(
        """(async () => {
          const P = window.__PAGEANT__;
          for (let k = 0; k < 6; k++) await Promise.resolve();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          P.stepFrames(30);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          return P.getState();
        })()"""
    )
    placed_tier = (st_after.get('board') or {}).get(contestant_id) or (
        ((st_after.get('contestants') or {}).get(contestant_id) or {}).get('tier')
    )
    ok = placed_tier == tid
    # Finish the board reaction + NEXT transition so no modal remains open.
    sess.eval_json(
        """(async () => {
          const P = window.__PAGEANT__;
          P.stepFrames(140);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          await P.continue();
          for (let k = 0; k < 6; k++) await Promise.resolve();
          P.stepFrames(100);
          for (let k = 0; k < 6; k++) await Promise.resolve();
          return P.getState().scene;
        })()"""
    )
    per_tier.append({
        'tier': tid,
        'placed': placed_tier,
        'ok': ok,
        'card': card,
        'row': row,
    })

  passed_count = sum(1 for r in per_tier if r['ok'])
  return {
      'viewport': f'{width}x{height}',
      'mode': mode,
      'passes': passed_count,
      'total': len(TIERS),
      'ok': passed_count == len(TIERS),
      'per_tier': per_tier,
  }

