/**
 * Quest data types: objectives, rewards, and quest definition.
 */
import type { BlockType } from '../types'
import type { AnimalKind } from '../entities/types'
import type { PlayerClass } from '../player/faction'

/** Objective type: kill mobs, collect items, or talk to NPC. */
export type QuestObjectiveType = 'kill' | 'collect' | 'talk'

export interface QuestObjectiveKill {
  type: 'kill'
  /** Mob kind to kill. */
  targetKind: AnimalKind
  /** Number required. */
  count: number
  /** Short label for UI (e.g. "Sheep"). */
  label: string
}

export interface QuestObjectiveCollect {
  type: 'collect'
  /** Item (block type) to collect. */
  item: BlockType
  /** Number required. */
  count: number
  /** Short label for UI (e.g. "Wool"). */
  label: string
}

export interface QuestObjectiveTalk {
  type: 'talk'
  /** NPC or location id for display. */
  targetId: string
  label: string
}

export type QuestObjective =
  | QuestObjectiveKill
  | QuestObjectiveCollect
  | QuestObjectiveTalk

export interface QuestReward {
  /** XP granted on turn-in. */
  xp?: number
  /** Gold (silver) granted on turn-in. */
  gold?: number
  /** Items granted on turn-in (e.g. blocks, weapons like wood_sword, tools, armor). */
  items?: Array<{ type: BlockType; count: number }>
}

export interface Quest {
  id: string
  title: string
  description: string
  /** Short "where to go" hint for the quest list (e.g. "Sheep · Head North-West, about 200m"). Can be a function for dynamic text (e.g. direction from world seed). */
  locationHint?: string | (() => string)
  objectives: QuestObjective[]
  /** Quest is only available when all of these quest ids are completed. */
  prerequisiteQuestIds?: string[]
  /** Default reward (used when no class-specific reward or class unknown). */
  reward: QuestReward
  /** Reward per player class; overrides reward when the player has that class. */
  rewardByClass?: Partial<Record<PlayerClass, QuestReward>>
  /** When set, the player must choose one of these rewards when turning in (e.g. stone pickaxe or stone axe). */
  rewardChoices?: QuestReward[]
}

/** Progress for one objective (current count). */
export type QuestObjectiveProgress = number

/** Active quest state: quest id and progress per objective. */
export interface ActiveQuest {
  questId: string
  progress: QuestObjectiveProgress[]
}
