/**
 * Quest data types: objectives, rewards, and quest definition.
 */
import type { BlockType } from '../types'
import type { AnimalKind } from '../entities/types'

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
  /** Items granted (block type + count). */
  items?: Array<{ type: BlockType; count: number }>
}

export interface Quest {
  id: string
  title: string
  description: string
  objectives: QuestObjective[]
  reward: QuestReward
}

/** Progress for one objective (current count). */
export type QuestObjectiveProgress = number

/** Active quest state: quest id and progress per objective. */
export interface ActiveQuest {
  questId: string
  progress: QuestObjectiveProgress[]
}
