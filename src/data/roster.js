// Binding roster data per docs/DESIGN.md §4 (owner: core).

export const TIERS = Object.freeze([
  Object.freeze({ id: 'perfect', label: '完美', name: '完美', icon: '👑', color: '#c43bd8', order: 0 }),
  Object.freeze({ id: 'gorgeous', label: '超漂亮', name: '超漂亮', icon: '💎', color: '#3b5bdb', order: 1 }),
  Object.freeze({ id: 'pretty', label: '漂亮', name: '漂亮', icon: '🌸', color: '#f2c318', order: 2 }),
  Object.freeze({ id: 'okay', label: '一般', name: '一般', icon: '🙂', color: '#d9342b', order: 3 }),
  Object.freeze({ id: 'tryhard', label: '再努力', name: '再努力', icon: '💪', color: '#3fae3a', order: 4 }),
]);

export const ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'crown', name: '皇冠', label: '皇冠', icon: '👑', slot: 'head', color: '#ffd43b' }),
  Object.freeze({ id: 'flowerCrown', name: '花环', label: '花环', icon: '🌸', slot: 'head', color: '#ff85c0' }),
  Object.freeze({ id: 'bow', name: '蝴蝶结', label: '蝴蝶结', icon: '🎀', slot: 'head', color: '#ff4d6d' }),
  Object.freeze({ id: 'strawHat', name: '草帽', label: '草帽', icon: '👒', slot: 'head', color: '#e9c46a' }),
  Object.freeze({ id: 'topHat', name: '礼帽', label: '礼帽', icon: '🎩', slot: 'head', color: '#2b2d42' }),
  Object.freeze({ id: 'sunglasses', name: '墨镜', label: '墨镜', icon: '😎', slot: 'face', color: '#1d1e2c' }),
  Object.freeze({ id: 'partyHat', name: '派对帽', label: '派对帽', icon: '🎉', slot: 'head', color: '#4cc9f0' }),
  Object.freeze({ id: 'pumpkinHat', name: '南瓜帽', label: '南瓜帽', icon: '🎃', slot: 'head', color: '#f77f00' }),
  Object.freeze({ id: 'slimeHat', name: '史莱姆帽', label: '史莱姆帽', icon: '🟢', slot: 'head', color: '#70e000' }),
  Object.freeze({ id: 'beanie', name: '毛线帽', label: '毛线帽', icon: '🧶', slot: 'head', color: '#ef476f' }),
  Object.freeze({ id: 'headphones', name: '耳机', label: '耳机', icon: '🎧', slot: 'head', color: '#4361ee' }),
  Object.freeze({ id: 'halo', name: '光环', label: '光环', icon: '✨', slot: 'head', color: '#ffe66d' }),
  Object.freeze({ id: 'scarf', name: '围巾', label: '围巾', icon: '🧣', slot: 'neck', color: '#e63946' }),
  Object.freeze({ id: 'beret', name: '贝雷帽', label: '贝雷帽', icon: '🎨', slot: 'head', color: '#9b5de5' }),
  Object.freeze({ id: 'starClip', name: '星星夹', label: '星星夹', icon: '⭐', slot: 'head', color: '#ffd166' }),
  Object.freeze({ id: 'chefHat', name: '厨师帽', label: '厨师帽', icon: '🎂', slot: 'head', color: '#ffffff' }),
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
    name: '花花',
    mob: '羊',
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
    name: '啵啵',
    mob: '史莱姆',
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
    name: '喵喵',
    mob: '猫',
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
    name: '铁铁',
    mob: '铁傀儡',
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
    name: '雪宝',
    mob: '雪傀儡',
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
    name: '嘶嘶',
    mob: '苦力怕',
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
    name: '嗡嗡',
    mob: '蜜蜂',
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
    name: '小末',
    mob: '末影人',
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
    name: '三三',
    mob: '凋零',
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
    name: '翠翠',
    mob: '村民',
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
    name: '龙宝宝',
    mob: '末影龙',
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
    name: '粉粉',
    mob: '粉色羊',
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
  name: '小凯',
  mob: '对手',
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
