// Deterministic seeded mulberry32 PRNG per docs/DESIGN.md §1, §11 F11 (owner: core).

export function hashSeed(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const u = input >>> 0;
    return u === 0 ? 0x6d2b79f5 : u;
  }
  const str = String(input ?? 'pageant');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const u = h >>> 0;
  return u === 0 ? 0x6d2b79f5 : u;
}

export function normalizeSeedNumber(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input >>> 0;
  }
  if (typeof input === 'string' && input.trim() !== '') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed >>> 0;
    return hashSeed(input);
  }
  return 12345;
}

export function createRng(seed = 12345) {
  let baseSeed = normalizeSeedNumber(seed);
  let state = baseSeed === 0 ? 0x6d2b79f5 : baseSeed;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rng() {
    return next();
  }

  rng.next = next;
  rng.random = next;
  rng.float = (min = 0, max = 1) => min + next() * (max - min);
  rng.range = rng.float;
  rng.int = (min, max) => {
    if (max === undefined) {
      const hi = Math.max(1, Math.floor(min));
      return Math.floor(next() * hi);
    }
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  rng.chance = (p = 0.5) => next() < p;
  rng.pick = (arr) => {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(next() * arr.length)];
  };
  rng.shuffle = (arr) => {
    if (!Array.isArray(arr)) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  };
  rng.reset = (newSeed = baseSeed) => {
    baseSeed = normalizeSeedNumber(newSeed);
    state = baseSeed === 0 ? 0x6d2b79f5 : baseSeed;
    return rng;
  };
  rng.fork = (salt = 1) => createRng((baseSeed ^ hashSeed(salt)) >>> 0);
  rng.getSeed = () => baseSeed;
  rng.getState = () => state >>> 0;
  rng.setState = (s) => {
    state = (s >>> 0) || 0x6d2b79f5;
  };
  Object.defineProperty(rng, 'seed', {
    get: () => baseSeed,
    enumerable: true,
  });

  return rng;
}

export default createRng;
