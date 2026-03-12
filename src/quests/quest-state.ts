/**
 * Runtime quest state: active quests, progress, accept/turn-in. Persisted in save.
 */
import type { BlockType } from '../types'
import type { PlayerClass } from '../player/faction'
import type { ActiveQuest, Quest, QuestObjective, QuestReward } from './types'
import { getQuestById, getAllQuestIds, getQuestRewardForClass } from './quest-registry'
import type { AnimalKind } from '../entities/types'

let activeQuests: ActiveQuest[] = []
let completedQuestIds: Set<string> = new Set()
let trackedQuestIds: string[] = []

/** Maximum number of active quests. */
export const MAX_ACTIVE_QUESTS = 10

/** Maximum number of quests that can be tracked on the HUD. */
export const MAX_TRACKED_QUESTS = 5

/**
 * Returns a copy of active quests with progress.
 */
export function getActiveQuests(): ActiveQuest[] {
  return activeQuests.map((a) => ({ questId: a.questId, progress: [...a.progress] }))
}

/**
 * Returns completed quest ids (already turned in).
 */
export function getCompletedQuestIds(): string[] {
  return Array.from(completedQuestIds)
}

/**
 * Returns quest ids that are active and have all objectives complete (ready to turn in).
 */
export function getQuestIdsReadyToTurnIn(): string[] {
  return activeQuests
    .filter((a) => {
      const quest = getQuestById(a.questId)
      return quest && isQuestComplete(quest, a.progress)
    })
    .map((a) => a.questId)
}

/**
 * Returns the list of quest ids currently tracked on the HUD (read-only copy).
 */
export function getTrackedQuestIds(): string[] {
  return [...trackedQuestIds]
}

/**
 * Sets the full list of tracked quest ids (e.g. from save). Clamps to MAX_TRACKED_QUESTS.
 * Only includes ids that are currently active.
 */
export function setTrackedQuestIds(questIds: string[]): void {
  const active = new Set(activeQuests.map((a) => a.questId))
  trackedQuestIds = questIds.filter((id) => active.has(id)).slice(0, MAX_TRACKED_QUESTS)
}

/**
 * Toggles tracking for a quest: adds if not tracked, removes if tracked.
 * Only active quests can be tracked. Returns true if the tracked list changed.
 */
export function toggleQuestTracked(questId: string): boolean {
  const active = new Set(activeQuests.map((a) => a.questId))
  if (!active.has(questId)) return false
  const idx = trackedQuestIds.indexOf(questId)
  if (idx >= 0) {
    trackedQuestIds.splice(idx, 1)
    return true
  }
  if (trackedQuestIds.length >= MAX_TRACKED_QUESTS) return false
  trackedQuestIds.push(questId)
  return true
}

/**
 * Returns whether a quest is currently tracked.
 */
export function isQuestTracked(questId: string): boolean {
  return trackedQuestIds.includes(questId)
}

/**
 * Returns quest ids that are not active and not completed (available to accept).
 * A quest is only available if all of its prerequisiteQuestIds are completed.
 */
export function getAvailableQuestIds(): string[] {
  const active = new Set(activeQuests.map((a) => a.questId))
  return getAllQuestIds().filter((id) => {
    if (active.has(id)) return false
    const quest = getQuestById(id)
    const isRepeatable = quest?.category === 'repeatable'
    if (completedQuestIds.has(id) && !isRepeatable) return false
    if (!quest?.prerequisiteQuestIds?.length) return true
    return quest.prerequisiteQuestIds.every((prereq) => completedQuestIds.has(prereq))
  })
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
  if (quest.prerequisiteQuestIds?.length) {
    const prereqsMet = quest.prerequisiteQuestIds.every((prereq) => completedQuestIds.has(prereq))
    if (!prereqsMet) return false
  }
  activeQuests.push({
    questId,
    progress: quest.objectives.map(() => 0),
  })
  return true
}

/**
 * Abandons an active quest. Removes it from active quests without granting rewards or marking it completed.
 * The quest becomes available again at its giver (e.g. exclamation mark).
 * @returns true if the quest was active and removed, false otherwise.
 */
export function abortQuest(questId: string): boolean {
  const idx = activeQuests.findIndex((a) => a.questId === questId)
  if (idx < 0) return false
  activeQuests.splice(idx, 1)
  const trackIdx = trackedQuestIds.indexOf(questId)
  if (trackIdx >= 0) trackedQuestIds.splice(trackIdx, 1)
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
 * Uses class-specific reward when playerClass is given and quest has rewardByClass.
 * When quest has rewardChoices, pass rewardChoiceIndex to grant that choice; otherwise the default reward is used.
 * Caller must apply XP (e.g. via experience.addExperience), gold, and items to inventory.
 * @returns Reward (xp, gold, items) if turned in, null if not complete or not found.
 */
export function turnInQuest(
  questId: string,
  playerClass: PlayerClass | null = null,
  rewardChoiceIndex?: number,
): QuestRewardResult | null {
  const idx = activeQuests.findIndex((a) => a.questId === questId)
  if (idx < 0) return null
  const quest = getQuestById(questId)
  if (!quest) return null
  const progress = activeQuests[idx].progress
  if (!isQuestComplete(quest, progress)) return null
  let reward: QuestReward
  if (
    quest.rewardChoices != null &&
    quest.rewardChoices.length > 0 &&
    rewardChoiceIndex != null &&
    rewardChoiceIndex >= 0 &&
    rewardChoiceIndex < quest.rewardChoices.length
  ) {
    reward = quest.rewardChoices[rewardChoiceIndex]
  } else {
    reward = getQuestRewardForClass(quest, playerClass)
  }
  activeQuests.splice(idx, 1)
  if (quest.category !== 'repeatable') {
    completedQuestIds.add(questId)
  }
  const trackIdx = trackedQuestIds.indexOf(questId)
  if (trackIdx >= 0) trackedQuestIds.splice(trackIdx, 1)
  return {
    xp: reward.xp ?? 0,
    gold: reward.gold ?? 0,
    items: reward.items ?? [],
  }
}

export interface QuestRewardResult {
  xp: number
  gold: number
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
 * Notifies that the player talked to an NPC (or reached a talk target).
 * Advances talk objectives whose targetId matches. Call when the player interacts with a quest NPC.
 * @param targetId - Id of the NPC or location (must match QuestObjectiveTalk.targetId).
 */
export function notifyTalk(targetId: string): void {
  for (const a of activeQuests) {
    const quest = getQuestById(a.questId)
    if (!quest) continue
    quest.objectives.forEach((obj, i) => {
      if (obj.type === 'talk' && obj.targetId === targetId) {
        a.progress[i] = Math.min(1, a.progress[i] + 1)
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
export function getQuestStateForSave(): {
  activeQuests: ActiveQuest[]
  completedQuestIds: string[]
  trackedQuestIds: string[]
} {
  return {
    activeQuests: activeQuests.map((a) => ({ questId: a.questId, progress: [...a.progress] })),
    completedQuestIds: Array.from(completedQuestIds),
    trackedQuestIds: [...trackedQuestIds],
  }
}

/**
 * Restores state from save.
 */
export function setQuestStateFromSave(state: {
  activeQuests?: ActiveQuest[]
  completedQuestIds?: string[]
  trackedQuestIds?: string[]
}): void {
  activeQuests = (state.activeQuests ?? []).map((a) => ({ questId: a.questId, progress: [...a.progress] }))
  completedQuestIds = new Set(state.completedQuestIds ?? [])
  if (state.trackedQuestIds != null) {
    setTrackedQuestIds(state.trackedQuestIds)
  } else {
    trackedQuestIds = []
  }
}
