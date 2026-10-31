// Live mutable game state & JSON-safe deep clone per docs/DESIGN.md §3.10, §8.6 (owner: core).
import { ROSTER } from '../data/roster.js';
import { normalizeSeedNumber } from './rng.js';

export const MAIN_QUEST_IDS = Object.freeze(
  ROSTER.filter((r) => !r.hidden)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id)
);

export const HIDDEN_QUEST_IDS = Object.freeze(
  ROSTER.filter((r) => r.hidden)
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id)
);

export const ALL_QUEST_IDS = Object.freeze([...MAIN_QUEST_IDS, ...HIDDEN_QUEST_IDS]);

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

export function createInitialState(seed = 12345) {
  const cleanSeed = normalizeSeedNumber(seed);

  const quests = {};
  for (let i = 0; i < MAIN_QUEST_IDS.length; i++) {
    const id = MAIN_QUEST_IDS[i];
    quests[id] = {
      status: i === 0 ? 'available' : 'locked',
      ms: 0,
      gags: [],
    };
  }
  for (const id of HIDDEN_QUEST_IDS) {
    quests[id] = {
      status: 'available',
      ms: 0,
      gags: [],
    };
  }

  const contestants = {};
  for (const entry of ROSTER) {
    contestants[entry.id] = {
      met: false,
      hidden: Boolean(entry.hidden),
      found: false,
      accessories: [],
      tier: null,
      portrait: false,
    };
  }

  const state = {
    v: 1,
    seed: cleanSeed,
    frame: 0,
    timeMs: 0,
    scene: 'title',
    area: 'hub',
    player: {
      x: 48,
      y: 8,
      z: 66,
      moving: false,
      pathLen: 0,
      sneak: false,
    },
    quest: null,
    quests,
    contestants,
    rival: {
      state: 'offstage',
      x: 0,
      z: 0,
      appearances: [],
      stealDone: false,
      rescued: false,
    },
    feedback: {
      taps: 0,
      walk: 0,
      interact: 0,
      blocked: 0,
      collect: 0,
      dead: 0,
      lastMs: 0,
    },
    stats: {
      particles: 0,
      sounds: 0,
      shakes: 0,
      confetti: 0,
      fireworks: 0,
    },
    gagCam: {
      count: 0,
      lastGag: null,
      active: false,
    },
    stars: 0,
    board: {},
    elapsedMs: 0,
    firstMetMs: null,
  };

  Object.defineProperty(state, '_portraits', {
    value: {},
    enumerable: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(state, '_runFrames', {
    value: 0,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(state, '_finaleDone', {
    value: false,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return state;
}

export function resetStateInPlace(state, seed = 12345, { keepBoardHistory = false } = {}) {
  const prevBoard = keepBoardHistory ? { ...state.board } : {};
  const prevPortraits = keepBoardHistory ? { ...(state._portraits || {}) } : {};
  const fresh = createInitialState(seed);

  for (const key of Object.keys(state)) {
    delete state[key];
  }
  Object.assign(state, fresh);
  state._portraits = prevPortraits;
  state._runFrames = 0;
  state._finaleDone = false;

  if (keepBoardHistory) {
    state.board = prevBoard;
    for (const [id, tier] of Object.entries(prevBoard)) {
      if (state.contestants[id]) {
        state.contestants[id].tier = tier;
        state.contestants[id].portrait = Boolean(prevPortraits[id]);
      }
    }
  }
  recomputeStars(state);
  return state;
}

export function recomputeStars(state) {
  const allMainRanked = MAIN_QUEST_IDS.every((id) => Boolean(state.board?.[id]));
  const bothHiddenFound = HIDDEN_QUEST_IDS.every((id) => Boolean(state.contestants?.[id]?.found));
  const fastRun = allMainRanked && state.elapsedMs <= 20 * 60 * 1000;
  state.stars = (allMainRanked ? 1 : 0) + (bothHiddenFound ? 1 : 0) + (fastRun ? 1 : 0);
  return state.stars;
}

export function snapshotState(state) {
  const questsOut = {};
  for (const [id, q] of Object.entries(state.quests || {})) {
    questsOut[id] = {
      status: q?.status || 'locked',
      ms: Math.round(q?.ms || 0),
      gags: Array.isArray(q?.gags) ? [...q.gags] : [],
    };
  }

  const contestantsOut = {};
  for (const [id, c] of Object.entries(state.contestants || {})) {
    if (typeof c?.portrait === 'string' && c.portrait.length > 0 && state._portraits) {
      state._portraits[id] = c.portrait;
    }
    contestantsOut[id] = {
      met: Boolean(c?.met),
      hidden: Boolean(c?.hidden),
      found: Boolean(c?.found),
      accessories: Array.isArray(c?.accessories) ? [...c.accessories] : [],
      tier: c?.tier ?? null,
      portrait: Boolean(c?.portrait || state._portraits?.[id]),
    };
  }

  let questOut = null;
  if (state.quest && state.quest.id) {
    const ptr = state.quest.pointer;
    questOut = {
      id: state.quest.id,
      step: state.quest.step ?? 0,
      progress: state.quest.progress ?? 0,
      need: state.quest.need ?? 1,
      startedMs: Math.round(state.quest.startedMs || 0),
      pointer: ptr
        ? { x: round2(ptr.x), y: round2(ptr.y ?? 8), z: round2(ptr.z) }
        : null,
    };
  }

  return {
    v: 1,
    seed: state.seed >>> 0,
    frame: state.frame | 0,
    timeMs: Math.round(state.timeMs || 0),
    scene: state.scene || 'title',
    area: state.area || 'hub',
    player: {
      x: round2(state.player?.x ?? 48),
      y: round2(state.player?.y ?? 8),
      z: round2(state.player?.z ?? 66),
      moving: Boolean(state.player?.moving),
      pathLen: state.player?.pathLen | 0,
      sneak: Boolean(state.player?.sneak),
    },
    quest: questOut,
    quests: questsOut,
    contestants: contestantsOut,
    rival: {
      state: state.rival?.state || 'offstage',
      x: round2(state.rival?.x ?? 0),
      z: round2(state.rival?.z ?? 0),
      appearances: Array.isArray(state.rival?.appearances) ? [...state.rival.appearances] : [],
      stealDone: Boolean(state.rival?.stealDone),
      rescued: Boolean(state.rival?.rescued),
    },
    feedback: {
      taps: state.feedback?.taps | 0,
      walk: state.feedback?.walk | 0,
      interact: state.feedback?.interact | 0,
      blocked: state.feedback?.blocked | 0,
      collect: state.feedback?.collect | 0,
      dead: state.feedback?.dead | 0,
      lastMs: Math.round(state.feedback?.lastMs || 0),
    },
    stats: {
      particles: state.stats?.particles | 0,
      sounds: state.stats?.sounds | 0,
      shakes: state.stats?.shakes | 0,
      confetti: state.stats?.confetti | 0,
      fireworks: state.stats?.fireworks | 0,
    },
    gagCam: {
      count: state.gagCam?.count | 0,
      lastGag: state.gagCam?.lastGag ?? null,
      active: Boolean(state.gagCam?.active),
    },
    stars: state.stars | 0,
    board: { ...(state.board || {}) },
    elapsedMs: Math.round(state.elapsedMs || 0),
    firstMetMs: state.firstMetMs === null || state.firstMetMs === undefined ? null : Math.round(state.firstMetMs),
  };
}
