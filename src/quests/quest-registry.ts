/**
 * Hardcoded quest definitions. Used by quest state and UI.
 */
import type { Quest } from './types'

export const QUESTS: Quest[] = [
  {
    id: 'sheep_slayer',
    title: 'Sheep Slayer',
    description: 'The plains are overrun with sheep. Thin the herd by slaying three of them.',
    objectives: [
      { type: 'kill', targetKind: 'sheep', count: 3, label: 'Sheep' },
    ],
    reward: { xp: 25 },
  },
  {
    id: 'wool_gatherer',
    title: 'Wool Gatherer',
    description: 'Collect wool from sheep to supply the village. Bring back 5 wool.',
    objectives: [
      { type: 'collect', item: 'white_wool', count: 5, label: 'Wool' },
    ],
    reward: { xp: 40 },
  },
  {
    id: 'hunt_pigs',
    title: 'Hunt Pigs',
    description: 'Hunt two pigs for meat. Raw porkchops will do.',
    objectives: [
      { type: 'kill', targetKind: 'pig', count: 2, label: 'Pigs' },
    ],
    reward: { xp: 20 },
  },
  {
    id: 'wolf_pelts',
    title: 'Wolf Pelts',
    description: 'Wolves have been seen in the forest. Kill two wolves.',
    objectives: [
      { type: 'kill', targetKind: 'wolf', count: 2, label: 'Wolves' },
    ],
    reward: { xp: 35 },
  },
]

/** Returns a quest by id, or undefined. */
export function getQuestById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id)
}

/** Returns all quest ids (for available-quest list). */
export function getAllQuestIds(): string[] {
  return QUESTS.map((q) => q.id)
}
