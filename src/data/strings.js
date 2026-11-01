// Centralized English UI, character, roster, and quest target strings for Mob Beauty Pageant v1.1.
// Zero-build ES2022 module; zero CJK characters in any literal.

export const GAME_TITLE = 'Mob Beauty Pageant';
export const SUB_BANNER = 'BLOCK WORLD';

export const UI = {
  boardAria: 'Leaderboard',
  pauseAria: 'Pause',
  beaconAria: 'Go to next contestant',
  resume: 'Resume',
  board: 'Leaderboard',
  restart: 'Restart',
  music: 'Music',
  sfx: 'Sounds',
  voice: 'Voice',
  playAria: 'Play',
  continueBtn: 'Continue',
  takePhotoAria: 'Take Photo',
  back: 'Back',
  done: 'Done',
  secretHintTitle: 'Secret Contestant Hint',
  gotIt: 'Got it!',
  finalTitle: '🏆 Final Leaderboard',
  share: 'Share',
  replay: 'Replay',
  continueHunt: 'Continue',
  toastSaved: '✅ Saved picture!',
  toastShared: '✅ Shared!',
  nextPill: 'NEXT',
};

export const TIER_LABELS = {
  perfect: 'PERFECT',
  gorgeous: 'GORGEOUS',
  pretty: 'PRETTY',
  okay: 'OKAY',
  tryhard: 'KEEP TRYING',
};

export const REACTION_CAPTIONS = {
  perfect: '👑 PERFECT! The crowd goes wild!',
  gorgeous: '💎 GORGEOUS! So sparkly!',
  pretty: '🌸 PRETTY! Super cute!',
  okay: '🙂 OKAY! Happy little dance!',
  tryhard: '💪 KEEP TRYING! You got this!',
};

export const ACCESSORY_NAMES = {
  crown: 'Crown',
  flowerCrown: 'Flower Crown',
  bow: 'Bow',
  strawHat: 'Straw Hat',
  topHat: 'Top Hat',
  sunglasses: 'Shades',
  partyHat: 'Party Hat',
  pumpkinHat: 'Pumpkin Hat',
  slimeHat: 'Slime Hat',
  beanie: 'Beanie',
  headphones: 'Headphones',
  halo: 'Halo',
  scarf: 'Scarf',
  beret: 'Beret',
  starClip: 'Star Clip',
  chefHat: 'Chef Hat',
};

export const CONTESTANT_NAMES = {
  sheep: 'Blossom',
  slime: 'Bobo',
  cat: 'Mimi',
  golem: 'Tinny',
  snow: 'Snowy',
  creeper: 'Hissy',
  bee: 'Buzzy',
  ender: 'Endie',
  wither: 'Trio',
  villager: 'Emma',
  dragon: 'Baby Dragon',
  pinksheep: 'Pinky',
  kai: 'Kai',
};

export const CONTESTANT_MOBS = {
  sheep: 'Sheep',
  slime: 'Slime',
  cat: 'Cat',
  golem: 'Iron Golem',
  snow: 'Snow Golem',
  creeper: 'Creeper',
  bee: 'Bee',
  ender: 'Enderman',
  wither: 'Wither',
  villager: 'Villager',
  dragon: 'Ender Dragon',
  pinksheep: 'Pink Sheep',
  kai: 'Rival',
};

export const NPC_NAMES = {
  player: 'Chen',
  kai: 'Kai',
  bela: 'Bella',
  mystery: 'Mr. Question',
};

export const MOB_NAMES = {
  slime: 'Slime',
  snowGolem: 'Snow Golem',
  villager: 'Villager',
  witherSkeleton: 'Wither Skeleton',
  enderman: 'Enderman',
  sheep: 'Sheep',
  chicken: 'Chicken',
  cat: 'Cat',
  bee: 'Bee',
  crowd: 'Crowd',
};

export const RIVAL_BUBBLE = 'Rank me too!';

export const MYSTERY_HINTS = {
  dragon: '🌀 End Portal ➡️ 🥚 Dragon Egg',
  pinksheep: '🌷 Pink Tulip ➡️ 🐑 White Sheep',
};

export const QUEST_LABELS = {
  kit: {
    block: 'Block',
    item: 'Item',
    flower: 'Flower',
    place: 'Place block',
  },
  sheep: {
    sparkleFlower: 'Sparkly Flower',
    flower: 'Flower',
    follow: 'Follow Blossom',
    giveBouquet: 'Give Blossom flowers',
  },
  slime: {
    bigSlime: 'Big Slime',
    smallSlime: 'Mini Slime',
    chaseSlime: 'Catch the slime',
  },
  cat: {
    hopped: 'Mimi hopped away!',
    feedFish: 'Feed fish to Mimi',
    freezeWait: 'Freeze! Wait...',
    sneakClose: 'Sneak up to Mimi',
  },
  golem: {
    pickupPumpkin: 'Pick up pumpkin',
    ironBase: 'Iron Base',
    ironBody: 'Iron Body',
    ironArmLeft: 'Left Iron Arm',
    ironArmRight: 'Right Iron Arm',
    pumpkinHead: 'Pumpkin Head',
    takePoppy: 'Take red poppy',
    ironOre: 'Iron Ore',
    statueIron: 'Statue Iron Block',
    bigPumpkin: 'Big Pumpkin',
    statueNoseFell: 'Statue nose fell!',
    pickPumpkin: 'Pick a pumpkin',
    kaiGrabbed: 'Kai grabbed them!',
    chaseSnowGolem: 'Chase Snow Golem',
    borrowPumpkin: 'Borrow pumpkin hat',
    shySnowGolem: 'Shy Snow Golem',
    tinnyRising: 'Tinny is waking up!',
  },
  snow: {
    packSnowball: 'Pack snowball',
    peltKai: 'Throw at Kai',
    swatSnowball: 'Swat snowball',
    snowmanKai: 'Snowman Kai',
    snowArena: 'Snowball Arena',
    waitKaiPeek: 'Wait for Kai',
  },
  creeper: {
    patHissy: 'Pat Hissy',
    followHissy: 'Follow Hissy',
    comfortHissy: 'Comfort Hissy',
    patOnFlash: 'Pat on white flash!',
    waitForFlash: 'Wait for flash',
  },
  bee: {
    redFlower: 'Red Flower',
    orangeFlower: 'Orange Flower',
    yellowFlower: 'Yellow Flower',
    greenFlower: 'Green Flower',
    blueFlower: 'Blue Flower',
    purpleFlower: 'Purple Flower',
    watchBuzzy: 'Watch Buzzy fly',
  },
  ender: {
    sealSW: 'SW Crystal Seal',
    sealNW: 'NW Crystal Seal',
    sealNE: 'NE Crystal Seal',
    sealSE: 'SE Crystal Seal',
    cellKey: 'Grab Gold Key',
    ironBars: 'Iron Bars',
    chasePortal: 'Chase into portal',
    chaseKai: 'Chase Kai',
    obsidianPad: 'Obsidian Stone',
    snipWeb: 'Snip cobweb',
    cellDoor: 'Cell Door',
    enterEndPortal: 'Enter End Portal',
    kaiSteals: 'Kai grabbed Endie!',
    lavaEdge: 'Go to lava moat',
    hopObsidian: 'Hop across stones',
  },
  wither: {
    sandBase: 'Soul Sand Base',
    sandLeft: 'Left Soul Sand',
    sandCenter: 'Center Soul Sand',
    sandRight: 'Right Soul Sand',
    skullLeft: 'Left Wither Skull',
    skullCenter: 'Center Wither Skull',
    skullRight: 'Right Wither Skull',
    digSoulSand: 'Dig Soul Sand',
    enterNetherPortal: 'Enter Nether Portal',
    popSkull: 'Pop Wither Skull',
  },
  villager: {
    harvestWheat: 'Harvest Wheat',
    btnPurple: 'Purple Button',
    btnBlue: 'Blue Button',
    btnYellow: 'Yellow Button',
    btnRed: 'Red Button',
    btnGreen: 'Green Button',
    btnOrange: 'Orange Button',
    pickupDiamond: 'Pick up Diamond',
    readCodeSign: 'Read Code Sign',
    stockStall: 'Stock Gem Stall',
    tradeVillager: 'Trade for Emerald',
    chaseMystery: 'Follow Mr. Question',
    waitMystery: 'Wait for Mr. Question',
  },
  hidden: {
    dragonEgg: 'Dragon Egg',
    goToEnd: 'Go to The End',
    mysteryEgg: 'Mystery Dragon Egg',
    pinkTulip: 'Pink Tulip',
    whiteSheep: 'White Sheep',
    giveTulip: 'Give tulip to sheep',
  },
};
