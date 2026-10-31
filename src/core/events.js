// Event bus per docs/DESIGN.md §3.2 (owner: core).

export const EVENTS = Object.freeze({
  TAP: 'tap',
  FEEDBACK: 'feedback',
  BLOCK_HIT: 'blockHit',
  BLOCK_BREAK: 'blockBreak',
  BLOCK_PLACE: 'blockPlace',
  COLLECT: 'collect',
  QUEST_START: 'questStart',
  QUEST_STEP: 'questStep',
  QUEST_COMPLETE: 'questComplete',
  GAG: 'gag',
  RIVAL_STEAL: 'rivalSteal',
  RIVAL_RESCUED: 'rivalRescued',
  SPAWN_BIG: 'spawnBig',
  AREA_CHANGE: 'areaChange',
  SCENE_CHANGE: 'sceneChange',
  BOOTH_START: 'boothStart',
  ACCESSORY: 'accessory',
  PHOTO: 'photo',
  RANK: 'rank',
  HIDDEN_FOUND: 'hiddenFound',
  FINALE_START: 'finaleStart',
  GAME_COMPLETE: 'gameComplete',
  SFX: 'sfx',
});

let activeBus = null;

export function createEvents() {
  const listeners = new Map();

  function off(type, fn) {
    const set = listeners.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) listeners.delete(type);
  }

  function on(type, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(fn);
    return () => off(type, fn);
  }

  function once(type, fn) {
    if (typeof fn !== 'function') return () => {};
    const wrapper = (payload) => {
      off(type, wrapper);
      fn(payload);
    };
    return on(type, wrapper);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      fn(payload);
    }
  }

  function clear() {
    listeners.clear();
  }

  const bus = { on, once, off, emit, clear };
  activeBus = bus;
  return bus;
}

export const createEventBus = createEvents;

function ensureBus() {
  if (!activeBus) activeBus = createEvents();
  return activeBus;
}

export function on(type, fn) {
  return ensureBus().on(type, fn);
}

export function once(type, fn) {
  return ensureBus().once(type, fn);
}

export function off(type, fn) {
  return ensureBus().off(type, fn);
}

export function emit(type, payload) {
  return ensureBus().emit(type, payload);
}
