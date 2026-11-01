// Binding roster data per docs/DESIGN.md §4 (owner: core).
import {
  TIER_LABELS,
  ACCESSORY_NAMES,
  CONTESTANT_NAMES,
  CONTESTANT_MOBS,
} from './strings.js';

export const TIERS = Object.freeze([
  Object.freeze({ id: 'perfect', label: TIER_LABELS.perfect, name: TIER_LABELS.perfect, icon: '👑', color: '#c43bd8', order: 0 }),
  Object.freeze({ id: 'gorgeous', label: TIER_LABELS.gorgeous, name: TIER_LABELS.gorgeous, icon: '💎', color: '#3b5bdb', order: 1 }),
  Object.freeze({ id: 'pretty', label: TIER_LABELS.pretty, name: TIER_LABELS.pretty, icon: '🌸', color: '#f2c318', order: 2 }),
  Object.freeze({ id: 'okay', label: TIER_LABELS.okay, name: TIER_LABELS.okay, icon: '🙂', color: '#d9342b', order: 3 }),
  Object.freeze({ id: 'tryhard', label: TIER_LABELS.tryhard, name: TIER_LABELS.tryhard, icon: '💪', color: '#3fae3a', order: 4 }),
]);

export const ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'crown', name: ACCESSORY_NAMES.crown, label: ACCESSORY_NAMES.crown, icon: '👑', slot: 'head', color: '#ffd43b' }),
  Object.freeze({ id: 'flowerCrown', name: ACCESSORY_NAMES.flowerCrown, label: ACCESSORY_NAMES.flowerCrown, icon: '🌸', slot: 'head', color: '#ff85c0' }),
  Object.freeze({ id: 'bow', name: ACCESSORY_NAMES.bow, label: ACCESSORY_NAMES.bow, icon: '🎀', slot: 'head', color: '#ff4d6d' }),
  Object.freeze({ id: 'strawHat', name: ACCESSORY_NAMES.strawHat, label: ACCESSORY_NAMES.strawHat, icon: '👒', slot: 'head', color: '#e9c46a' }),
  Object.freeze({ id: 'topHat', name: ACCESSORY_NAMES.topHat, label: ACCESSORY_NAMES.topHat, icon: '🎩', slot: 'head', color: '#2b2d42' }),
  Object.freeze({ id: 'sunglasses', name: ACCESSORY_NAMES.sunglasses, label: ACCESSORY_NAMES.sunglasses, icon: '😎', slot: 'face', color: '#1d1e2c' }),
  Object.freeze({ id: 'partyHat', name: ACCESSORY_NAMES.partyHat, label: ACCESSORY_NAMES.partyHat, icon: '🎉', slot: 'head', color: '#4cc9f0' }),
  Object.freeze({ id: 'pumpkinHat', name: ACCESSORY_NAMES.pumpkinHat, label: ACCESSORY_NAMES.pumpkinHat, icon: '🎃', slot: 'head', color: '#f77f00' }),
  Object.freeze({ id: 'slimeHat', name: ACCESSORY_NAMES.slimeHat, label: ACCESSORY_NAMES.slimeHat, icon: '🟢', slot: 'head', color: '#70e000' }),
  Object.freeze({ id: 'beanie', name: ACCESSORY_NAMES.beanie, label: ACCESSORY_NAMES.beanie, icon: '🧶', slot: 'head', color: '#ef476f' }),
  Object.freeze({ id: 'headphones', name: ACCESSORY_NAMES.headphones, label: ACCESSORY_NAMES.headphones, icon: '🎧', slot: 'head', color: '#4361ee' }),
  Object.freeze({ id: 'halo', name: ACCESSORY_NAMES.halo, label: ACCESSORY_NAMES.halo, icon: '✨', slot: 'head', color: '#ffe66d' }),
  Object.freeze({ id: 'scarf', name: ACCESSORY_NAMES.scarf, label: ACCESSORY_NAMES.scarf, icon: '🧣', slot: 'neck', color: '#e63946' }),
  Object.freeze({ id: 'beret', name: ACCESSORY_NAMES.beret, label: ACCESSORY_NAMES.beret, icon: '🎨', slot: 'head', color: '#9b5de5' }),
  Object.freeze({ id: 'starClip', name: ACCESSORY_NAMES.starClip, label: ACCESSORY_NAMES.starClip, icon: '⭐', slot: 'head', color: '#ffd166' }),
  Object.freeze({ id: 'chefHat', name: ACCESSORY_NAMES.chefHat, label: ACCESSORY_NAMES.chefHat, icon: '🎂', slot: 'head', color: '#ffffff' }),
]);

export const ACCESSORY_IDS = Object.freeze(ACCESSORIES.map((a) => a.id));

const freezeEntry = (entry) =>
  Object.freeze({
    ...entry,
    accessories: Object.freeze([...entry.accessories]),
    colors: Object.freeze({ ...entry.colors }),
    gags: Object.freeze([...entry.gags]),
  });

export const ROSTER = Object.freeze([
  freezeEntry({
    id: 'sheep',
    name: CONTESTANT_NAMES.sheep,
    mob: CONTESTANT_MOBS.sheep,
    order: 1,
    hidden: false,
    accessories: ['flowerCrown', 'bow', 'strawHat'],
    colors: { primary: '#fff8eb', secondary: '#ff9ebb' },
    gags: ['sheep_eats_bouquet'],
    area: 'hub',
    poi: 'meadow',
    heads: 1,
  }),
  freezeEntry({
    id: 'slime',
    name: CONTESTANT_NAMES.slime,
    mob: CONTESTANT_MOBS.slime,
    order: 2,
    hidden: false,
    accessories: ['slimeHat', 'crown', 'sunglasses'],
    colors: { primary: '#6ce048', secondary: '#34a832' },
    gags: ['kai_bounced', 'slime_pet'],
    area: 'hub',
    poi: 'swamp',
    heads: 1,
  }),
  freezeEntry({
    id: 'cat',
    name: CONTESTANT_NAMES.cat,
    mob: CONTESTANT_MOBS.cat,
    order: 3,
    hidden: false,
    accessories: ['bow', 'beanie', 'headphones'],
    colors: { primary: '#f4a261', secondary: '#fff3e0' },
    gags: ['cat_gift_kai_hat'],
    area: 'hub',
    poi: 'jungle',
    heads: 1,
  }),
  freezeEntry({
    id: 'golem',
    name: CONTESTANT_NAMES.golem,
    mob: CONTESTANT_MOBS.golem,
    order: 4,
    hidden: false,
    accessories: ['flowerCrown', 'topHat', 'sunglasses'],
    colors: { primary: '#dcdcdc', secondary: '#5fa85b' },
    gags: ['fake_iron', 'kai_hogs_pumpkins', 'snow_head_pop'],
    area: 'hub',
    poi: 'cave',
    heads: 1,
  }),
  freezeEntry({
    id: 'snow',
    name: CONTESTANT_NAMES.snow,
    mob: CONTESTANT_MOBS.snow,
    order: 5,
    hidden: false,
    accessories: ['beanie', 'scarf', 'pumpkinHat'],
    colors: { primary: '#f0f7ff', secondary: '#f77f00' },
    gags: ['kai_snowman'],
    area: 'hub',
    poi: 'snowArena',
    heads: 1,
  }),
  freezeEntry({
    id: 'creeper',
    name: CONTESTANT_NAMES.creeper,
    mob: CONTESTANT_MOBS.creeper,
    order: 6,
    hidden: false,
    accessories: ['partyHat', 'bow', 'sunglasses'],
    colors: { primary: '#52b74a', secondary: '#245520' },
    gags: ['creeper_confetti'],
    area: 'hub',
    poi: 'clearing',
    heads: 1,
  }),
  freezeEntry({
    id: 'bee',
    name: CONTESTANT_NAMES.bee,
    mob: CONTESTANT_MOBS.bee,
    order: 7,
    hidden: false,
    accessories: ['flowerCrown', 'crown', 'headphones'],
    colors: { primary: '#ffd43b', secondary: '#3b2f2f' },
    gags: ['kai_honey'],
    area: 'hub',
    poi: 'hive',
    heads: 1,
  }),
  freezeEntry({
    id: 'ender',
    name: CONTESTANT_NAMES.ender,
    mob: CONTESTANT_MOBS.ender,
    order: 8,
    hidden: false,
    accessories: ['halo', 'beret', 'sunglasses'],
    colors: { primary: '#1b1429', secondary: '#d946ef' },
    gags: ['kai_steal', 'kai_cake_face'],
    area: 'end',
    poi: 'endPortal',
    heads: 1,
  }),
  freezeEntry({
    id: 'wither',
    name: CONTESTANT_NAMES.wither,
    mob: CONTESTANT_MOBS.wither,
    order: 9,
    hidden: false,
    accessories: ['crown', 'partyHat', 'topHat'],
    colors: { primary: '#2d2a32', secondary: '#60a5fa' },
    gags: ['skeleton_bald', 'wither_three_hats'],
    area: 'nether',
    poi: 'netherPortal',
    heads: 3,
  }),
  freezeEntry({
    id: 'villager',
    name: CONTESTANT_NAMES.villager,
    mob: CONTESTANT_MOBS.villager,
    order: 10,
    hidden: false,
    accessories: ['strawHat', 'crown', 'beret'],
    colors: { primary: '#2ec47c', secondary: '#8d5b3c' },
    gags: ['kai_faint', 'emerald_eyes'],
    area: 'hub',
    poi: 'stall',
    heads: 1,
  }),
  freezeEntry({
    id: 'dragon',
    name: CONTESTANT_NAMES.dragon,
    mob: CONTESTANT_MOBS.dragon,
    order: 11,
    hidden: true,
    accessories: ['crown', 'partyHat', 'halo'],
    colors: { primary: '#231934', secondary: '#a855f7' },
    gags: ['egg_hop'],
    area: 'end',
    poi: 'dragonEgg',
    heads: 1,
  }),
  freezeEntry({
    id: 'pinksheep',
    name: CONTESTANT_NAMES.pinksheep,
    mob: CONTESTANT_MOBS.pinksheep,
    order: 12,
    hidden: true,
    accessories: ['bow', 'flowerCrown', 'starClip'],
    colors: { primary: '#ff8fab', secondary: '#ffe5ec' },
    gags: ['pink_dye'],
    area: 'hub',
    poi: 'pinkTulip',
    heads: 1,
  }),
]);

export const FINALE_RIVAL = freezeEntry({
  id: 'kai',
  name: CONTESTANT_NAMES.kai,
  mob: CONTESTANT_MOBS.kai,
  order: 13,
  hidden: false,
  finale: true,
  accessories: ['pumpkinHat', 'chefHat', 'crown'],
  colors: { primary: '#22b8cf', secondary: '#2b2d42' },
  gags: [],
  area: 'hub',
  poi: 'runway',
  heads: 1,
});

export const ROSTER_BY_ID = Object.freeze(
  Object.fromEntries([...ROSTER, FINALE_RIVAL].map((entry) => [entry.id, entry]))
);

export const TIERS_BY_ID = Object.freeze(
  Object.fromEntries(TIERS.map((tier) => [tier.id, tier]))
);

export const ACCESSORIES_BY_ID = Object.freeze(
  Object.fromEntries(ACCESSORIES.map((acc) => [acc.id, acc]))
);

export function getContestantMeta(id) {
  return ROSTER_BY_ID[id] || null;
}
