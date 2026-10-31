// Persistence module per docs/DESIGN.md §3.7, §11 F14 (owner: pageant-ui).
// Key: `pageant_progress`; JPEG portrait dataURLs strictly <= 12 KB each.

export const STORAGE_KEY = 'pageant_progress';
export const MAX_PORTRAIT_BYTES = 12 * 1024;

const memoryCache = {
  portraits: {},
  ghostHandShown: false,
};

function sanitizePortraits(portraits) {
  const out = {};
  if (!portraits || typeof portraits !== 'object') return out;
  for (const [id, url] of Object.entries(portraits)) {
    if (typeof url === 'string' && url.startsWith('data:image/') && url.length <= MAX_PORTRAIT_BYTES) {
      out[id] = url;
    }
  }
  return out;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.portraits && typeof parsed.portraits === 'object') {
      Object.assign(memoryCache.portraits, sanitizePortraits(parsed.portraits));
    }
    if (parsed.ghostHandShown) {
      memoryCache.ghostHandShown = true;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

export function saveProgress(data = {}) {
  try {
    const prev = loadProgress() || {};
    const mergedPortraits = sanitizePortraits({
      ...(prev.portraits || {}),
      ...memoryCache.portraits,
      ...(data.portraits || {}),
    });
    memoryCache.portraits = mergedPortraits;
    if (data.ghostHandShown !== undefined) {
      memoryCache.ghostHandShown = Boolean(data.ghostHandShown);
    }
    const payload = {
      v: 1,
      seed: data.seed ?? prev.seed ?? 1,
      area: data.area ?? prev.area ?? 'hub',
      elapsedMs: Number(data.elapsedMs ?? prev.elapsedMs ?? 0),
      stars: Number(data.stars ?? prev.stars ?? 0),
      board: { ...(prev.board || {}), ...(data.board || {}) },
      quests: { ...(prev.quests || {}), ...(data.quests || {}) },
      contestants: { ...(prev.contestants || {}), ...(data.contestants || {}) },
      rival: data.rival ?? prev.rival ?? null,
      portraits: mergedPortraits,
      ghostHandShown: memoryCache.ghostHandShown || Boolean(prev.ghostHandShown),
      savedAt: Date.now(),
    };
    if (data.replaceBoard && data.board) payload.board = { ...data.board };
    if (data.replaceQuests && data.quests) payload.quests = { ...data.quests };
    if (data.replaceContestants && data.contestants) payload.contestants = { ...data.contestants };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (_) {
    return false;
  }
}

export function saveFromState(state, extra = {}) {
  if (!state || typeof state !== 'object') return saveProgress(extra);
  const questsSnap = {};
  if (state.quests && typeof state.quests === 'object') {
    for (const [qid, q] of Object.entries(state.quests)) {
      if (q && typeof q === 'object') {
        questsSnap[qid] = {
          status: q.status || 'locked',
          ms: q.ms || 0,
          gags: Array.isArray(q.gags) ? [...q.gags] : [],
        };
      }
    }
  }
  const contestantsSnap = {};
  if (state.contestants && typeof state.contestants === 'object') {
    for (const [cid, c] of Object.entries(state.contestants)) {
      if (c && typeof c === 'object') {
        contestantsSnap[cid] = {
          met: Boolean(c.met),
          hidden: Boolean(c.hidden),
          found: Boolean(c.found),
          accessories: Array.isArray(c.accessories) ? [...c.accessories] : [],
          tier: c.tier || null,
          portrait: Boolean(c.portrait || memoryCache.portraits[cid]),
        };
      }
    }
  }
  return saveProgress({
    seed: state.seed,
    area: state.area,
    elapsedMs: state.elapsedMs ?? state.timeMs ?? 0,
    stars: state.stars ?? 0,
    board: state.board ? { ...state.board } : {},
    quests: questsSnap,
    contestants: contestantsSnap,
    rival: state.rival ? JSON.parse(JSON.stringify(state.rival)) : undefined,
    replaceBoard: true,
    replaceQuests: Object.keys(questsSnap).length > 0,
    replaceContestants: Object.keys(contestantsSnap).length > 0,
    ...extra,
  });
}

export function clearProgress(opts = {}) {
  try {
    if (!opts.keepPortraits) {
      memoryCache.portraits = {};
    }
    window.localStorage.removeItem(STORAGE_KEY);
    if (opts.keepPortraits && Object.keys(memoryCache.portraits).length > 0) {
      saveProgress({ portraits: memoryCache.portraits, ghostHandShown: memoryCache.ghostHandShown });
    }
    return true;
  } catch (_) {
    return false;
  }
}

export function setPortraitDataURL(contestantId, dataURL) {
  if (!contestantId || typeof dataURL !== 'string') return false;
  if (dataURL.length > MAX_PORTRAIT_BYTES) return false;
  memoryCache.portraits[contestantId] = dataURL;
  return true;
}

export function getPortraitDataURL(contestantId) {
  if (!contestantId) return null;
  if (memoryCache.portraits[contestantId]) return memoryCache.portraits[contestantId];
  const saved = loadProgress();
  return saved?.portraits?.[contestantId] || null;
}

export function hasSavedProgress() {
  const p = loadProgress();
  if (!p) return false;
  const rankedCount = p.board ? Object.keys(p.board).length : 0;
  const doneQuests = p.quests
    ? Object.values(p.quests).filter((q) => q && (q === 'done' || q.status === 'done')).length
    : 0;
  return rankedCount > 0 || doneQuests > 0;
}

export const progress = Object.freeze({
  key: STORAGE_KEY,
  load: loadProgress,
  save: saveProgress,
  saveFromState,
  clear: clearProgress,
  hasProgress: hasSavedProgress,
  getPortrait: getPortraitDataURL,
  setPortrait: setPortraitDataURL,
  wasGhostHandShown() {
    if (memoryCache.ghostHandShown) return true;
    const p = loadProgress();
    return Boolean(p?.ghostHandShown);
  },
  markGhostHandShown() {
    memoryCache.ghostHandShown = true;
    saveProgress({ ghostHandShown: true });
  },
});

export default progress;
