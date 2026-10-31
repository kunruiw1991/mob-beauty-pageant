// Quests entry point per docs/DESIGN.md §3.5, §6 (owner: quests-a).
// Imports all 10 main quest modules in §6 order plus hidden contestants.

import qSheep from './q_sheep.js';
import qSlime from './q_slime.js';
import qCat from './q_cat.js';
import qGolem from './q_golem.js';
import qSnow from './q_snow.js';
import qCreeper from './q_creeper.js';
import qBee from './q_bee.js';
import qEnder from './q_ender.js';
import qWither from './q_wither.js';
import qVillager from './q_villager.js';
import { HIDDEN_QUESTS, dragonQuest, pinksheepQuest, createHiddenController } from './hidden.js';
import { buildQuestManager } from './manager.js';

export const QUESTS = Object.freeze([
  qSheep,
  qSlime,
  qCat,
  qGolem,
  qSnow,
  qCreeper,
  qBee,
  qEnder,
  qWither,
  qVillager,
]);

export { HIDDEN_QUESTS, dragonQuest, pinksheepQuest };

export const ALL_QUESTS = Object.freeze([...QUESTS, ...HIDDEN_QUESTS]);

export function createQuestManager(ctx) {
  return buildQuestManager(ctx, QUESTS, HIDDEN_QUESTS, createHiddenController);
}

export default createQuestManager;
