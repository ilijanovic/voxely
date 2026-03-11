/**
 * Runtime quest state: active quests, progress, accept/turn-in. Persisted in save.
 */
import type { BlockType } from '../types'
import type { ActiveQuest, Quest, QuestObjective } from './types'
import { getQuestById, getAllQuestIds } from './quest-registry'
import type { AnimalKind } from '../entities/types'

let activeQuests: ActiveQuest[] = []
let completedQuestIds: Set<string> = new Set()

/** Maximum number of active quests. */
export const MAX_ACTIVE_QUESTS = 10

/**
 * Returns a copy of active quests with progress.
 */
export function getActiveQuests(): ActiveQuest[] {
  return activeQuests.map((a) => ({ questId: a.questId, progress: [...a.progress] }))
}

/**
 * Returns completed quest ids.
 */
export function getCompletedQuestIds(): string[] {
  return Array.from(completedQuestIds)
}

/**
 * Returns quest ids that are not active and not completed (available to accept).
 */
export function getAvailableQuestIds(): string[] {
  const active = new Set(activeQuests.map((a) => a.questId))
  return getAllQuestIds().filter((id) => !active.has(id) && !completedQuestIds.has(id))
}

/**
 * Accepts a quest by id. Adds it to active with zero progress.
 * No-op if already active, completed, or unknown.
 */
export function acceptQuest(questId: string): boolean {
  if (activeQuests.length >= MAX_ACTIVE_QUESTS) return false
  if (activeQuests.some((a) => a.questId === questId)) return false
  if (completedQuestIds.has(questId)) return false
  const quest = getQuestById(questId)
  if (!quest) return false
  activeQuests.push({
    questId,
    progress: quest.objectives.map(() => 0),
  })
  return true
}

/**
 * Returns true if all objectives are complete.
 */
function isQuestComplete(quest: Quest, progress: number[]): boolean {
  return quest.objectives.every((obj, i) => progress[i] >= getObjectiveCount(obj))
}

function getObjectiveCount(obj: QuestObjective): number {
  if (obj.type === 'kill' || obj.type === 'collect') return obj.count
  return 1
}

/**
 * Turns in a completed quest: grants rewards and moves to completed.
 * Caller must apply XP (e.g. via experience.addExperience) and items to inventory.
 * @returns Reward (xp, items) if turned in, null if not complete or not found.
 */
export function turnInQuest(questId: string): QuestRewardResult | null {
  const idx = activeQuests.findIndex((a) => a.questId === questId)
  if (idx < 0) return null
  const quest = getQuestById(questId)
  if (!quest) return null
  const progress = activeQuests[idx].progress
  if (!isQuestComplete(quest, progress)) return null
  activeQuests.splice(idx, 1)
  completedQuestIds.add(questId)
  return {
    xp: quest.reward.xp ?? 0,
    items: quest.reward.items ?? [],
  }
}

export interface QuestRewardResult {
  xp: number
  items: Array<{ type: BlockType; count: number }>
}

/**
 * Notifies that a mob was killed. Advances kill objectives.
 */
export function notifyKill(kind: AnimalKind): void {
  for (const a of activeQuests) {
    const quest = getQuestById(a.questId)
    if (!quest) continue
    quest.objectives.forEach((obj, i) => {
      if (obj.type === 'kill' && obj.targetKind === kind) {
        a.progress[i] = Math.min(obj.count, a.progress[i] + 1)
      }
    })
  }
}

/**
 * Refreshes collect objectives from current inventory counts.
 * Pass a function that returns total count for a given item (e.g. from inventory).
 */
export function refreshCollectObjectives(getCount: (item: BlockType) => number): void {
  for (const a of activeQuests) {
    const quest = getQuestById(a.questId)
    if (!quest) continue
    quest.objectives.forEach((obj, i) => {
      if (obj.type === 'collect') {
        a.progress[i] = Math.min(obj.count, getCount(obj.item))
      }
    })
  }
}

/**
 * Returns serializable state for save.
 */
export function getQuestStateForSave(): { activeQuests: ActiveQuest[]; completedQuestIds: string[] } {
  return {
    activeQuests: activeQuests.map((a) => ({ questId: a.questId, progress: [...a.progress] })),
    completedQuestIds: Array.from(completedQuestIds),
  }
}

/**
 * Restores state from save.
 */
export function setQuestStateFromSave(state: {
  activeQuests?: ActiveQuest[]
  completedQuestIds?: string[]
}): void {
  activeQuests = (state.activeQuests ?? []).map((a) => ({ questId: a.questId, progress: [...a.progress] }))
  completedQuestIds = new Set(state.completedQuestIds ?? [])
}
