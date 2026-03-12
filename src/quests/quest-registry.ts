/**
 * Hardcoded quest definitions. Used by quest state and UI.
 */
import type { PlayerClass } from '../player/faction'
import type { Quest, QuestReward } from './types'
import { getSheepRingDirection, SHEEP_ZONE_RADIUS } from '../creature-zones'

/** Quest levels for the starter chain and second NPC (WoW-style level band). */
const QUEST_LEVEL_STARTER = 1
const QUEST_LEVEL_SECOND = 5

/** Zone ids for quest log grouping. */
const ZONE_FIRST_SPAWN = 'first_spawn_village'
const ZONE_SECOND_NPC = 'second_npc'

export const QUESTS: Quest[] = [
  {
    id: 'first_spawn_wool',
    level: QUEST_LEVEL_STARTER,
    category: 'main',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Wool for the Village',
    description:
      'The village needs wool to repair clothes and blankets before winter. Sheep graze about 200 blocks from the village—head in the direction shown below and they drop wool when slain. Gather three pieces of white wool and bring them back here so we can put them to use. You will be paid for your trouble.',
    locationHint: () => `Sheep · ${SHEEP_ZONE_RADIUS}m ${getSheepRingDirection()}`,
    objectives: [
      { type: 'collect', item: 'white_wool', count: 3, label: 'Wool' },
    ],
    reward: { gold: 10, xp: 15 },
  },
  {
    id: 'first_spawn_pork',
    level: QUEST_LEVEL_STARTER,
    category: 'main',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Pig Meat for the Larder',
    description:
      'Our stores are running low and we need meat to feed the village. Pigs can be found in the plains and forests; when killed they drop raw porkchop. Collect five raw porkchops and bring them back. In return you will receive silver, and a proper weapon if you are a warrior.',
    locationHint: 'Pigs · plains and forests',
    objectives: [
      { type: 'collect', item: 'raw_porkchop', count: 5, label: 'Raw porkchop' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool'],
    reward: { gold: 30 },
    rewardByClass: {
      warrior: { gold: 30, items: [{ type: 'wood_sword', count: 1 }] },
    },
  },
  {
    id: 'first_spawn_wolves',
    level: QUEST_LEVEL_STARTER,
    category: 'main',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'The Wolves at the Edge of the Forest',
    description:
      'Wolves have been prowling near the village and several livestock have been lost. We need someone to thin their numbers before they grow bolder. Hunt three wolves in the forest or nearby and report back. As thanks, you will receive a stone sword—sturdy and sharp enough to see you through the wilds.',
    locationHint: 'Wolves · forest or near village',
    objectives: [
      { type: 'kill', targetKind: 'wolf', count: 3, label: 'Wolves' },
    ],
    prerequisiteQuestIds: ['first_spawn_pork'],
    reward: { items: [{ type: 'stone_sword', count: 1 }] },
  },
  {
    id: 'sheep_slayer',
    level: QUEST_LEVEL_STARTER,
    category: 'side',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Sheep Slayer',
    description:
      'The plains are overrun with sheep and the herds are trampling crops and blocking paths. They graze about 200 blocks from the village—head in the direction shown below. Slay three sheep and the village will reward you with experience. Watch out—they will flee when you approach.',
    locationHint: () => `Sheep · ${SHEEP_ZONE_RADIUS}m ${getSheepRingDirection()}`,
    objectives: [
      { type: 'kill', targetKind: 'sheep', count: 3, label: 'Sheep' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool'],
    reward: { xp: 25 },
  },
  {
    id: 'wool_gatherer',
    level: QUEST_LEVEL_STARTER,
    category: 'side',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Wool Gatherer',
    description:
      'We are always in need of wool for weaving and repairs. Sheep graze about 200 blocks from the village—head in the direction shown below; they drop wool when slain. Gather five pieces of white wool and bring them back to the village. Your efforts will be rewarded with experience.',
    locationHint: () => `Sheep · ${SHEEP_ZONE_RADIUS}m ${getSheepRingDirection()}`,
    objectives: [
      { type: 'collect', item: 'white_wool', count: 5, label: 'Wool' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool'],
    reward: { xp: 40 },
  },
  {
    id: 'hunt_pigs',
    level: QUEST_LEVEL_STARTER,
    category: 'side',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Hunt Pigs',
    description:
      'The village needs more meat for the larder. Pigs roam the plains and forests; when killed they drop raw porkchop. Hunt two pigs and bring back the meat. Raw porkchops will do—we will prepare them here.',
    locationHint: 'Pigs · plains and forests',
    objectives: [
      { type: 'kill', targetKind: 'pig', count: 2, label: 'Pigs' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool'],
    reward: { xp: 20 },
  },
  {
    id: 'wolf_pelts',
    level: QUEST_LEVEL_STARTER,
    category: 'side',
    zoneId: ZONE_FIRST_SPAWN,
    title: 'Wolf Pelts',
    description:
      'Wolves have been spotted in the forest and we need to keep their numbers in check. Hunt two wolves and return when the deed is done. The pelts and meat are yours; the village will pay you in experience for the service.',
    locationHint: 'Wolves · forest',
    objectives: [
      { type: 'kill', targetKind: 'wolf', count: 2, label: 'Wolves' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool'],
    reward: { xp: 35 },
  },
  {
    id: 'second_npc_planks',
    level: QUEST_LEVEL_SECOND,
    category: 'main',
    zoneId: ZONE_SECOND_NPC,
    title: 'Wood for Repairs',
    description:
      'I have some work for you, but first I need to see you are reliable. Bring me five oak planks—you can craft them from wood at a crafting table, or find them in village buildings. Once you have them, return here.',
    locationHint: 'Oak planks · craft from wood or find in villages',
    objectives: [
      { type: 'collect', item: 'oak_planks', count: 5, label: 'Oak planks' },
    ],
    prerequisiteQuestIds: ['first_spawn_wool', 'first_spawn_pork', 'first_spawn_wolves'],
    reward: { gold: 15, xp: 20 },
  },
  {
    id: 'second_npc_stones',
    level: QUEST_LEVEL_SECOND,
    category: 'main',
    zoneId: ZONE_SECOND_NPC,
    title: 'Stone for the Mason',
    description:
      'Good work with the planks. Next I need stone—five pieces. Mine it from the ground with a pickaxe, or gather cobblestone from ruins. Bring me five stone and I will reward you.',
    locationHint: 'Stone · mine underground or find in structures',
    objectives: [
      { type: 'collect', item: 'stone', count: 5, label: 'Stone' },
    ],
    prerequisiteQuestIds: ['second_npc_planks'],
    reward: { gold: 20, xp: 25 },
  },
  {
    id: 'second_npc_sticks',
    level: QUEST_LEVEL_SECOND,
    category: 'main',
    zoneId: ZONE_SECOND_NPC,
    title: 'Sticks for the Carpenter',
    description:
      'You have proven yourself. One last favour: I need ten sticks for tool handles and repairs. Craft them from oak planks at a crafting table—two planks make four sticks. Bring me ten and you may choose a stone pickaxe or a stone axe as thanks.',
    locationHint: 'Sticks · craft from oak planks at a crafting table',
    objectives: [
      { type: 'collect', item: 'stick', count: 10, label: 'Sticks' },
    ],
    prerequisiteQuestIds: ['second_npc_stones'],
    reward: { gold: 25, xp: 30 },
    rewardChoices: [
      { gold: 25, xp: 30, items: [{ type: 'stone_pickaxe', count: 1 }] },
      { gold: 25, xp: 30, items: [{ type: 'stone_axe', count: 1 }] },
    ],
  },
]

/** Returns a quest by id, or undefined. */
export function getQuestById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id)
}

/**
 * Returns the effective reward for a quest for the given player class.
 * Uses rewardByClass when present for that class, otherwise reward.
 */
export function getQuestRewardForClass(quest: Quest, playerClass: PlayerClass | null): QuestReward {
  if (playerClass && quest.rewardByClass?.[playerClass]) return quest.rewardByClass[playerClass]
  return quest.reward
}

/** Returns all quest ids (for available-quest list). */
export function getAllQuestIds(): string[] {
  return QUESTS.map((q) => q.id)
}

/**
 * Human-readable display name for a zone id (for quest log grouping).
 */
export function getZoneDisplayName(zoneId: string): string {
  return zoneId
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * WoW-style difficulty color for a quest relative to player level.
 * @param questLevel - Quest level (undefined treated as 1).
 * @param playerLevel - Current player level.
 * @returns Tailwind text color class: gray (trivial), green (easy), yellow (normal), orange (hard), red (very hard).
 */
export function getQuestDifficultyColorClass(
  questLevel: number | undefined,
  playerLevel: number,
): string {
  const q = questLevel ?? 1
  const diff = q - playerLevel
  if (diff <= -5) return 'text-stone-400'
  if (diff <= -2) return 'text-green-400'
  if (diff <= 1) return 'text-yellow-400'
  if (diff <= 4) return 'text-orange-400'
  return 'text-red-400'
}
