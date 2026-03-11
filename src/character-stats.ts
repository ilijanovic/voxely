/**
 * Character stats (WoW-style): Strength, Intellect, Agility, Stamina, Spirit.
 * Base stats live on the character; equipment can add bonuses later (e.g. +5 Agility).
 */

/** Stat ids used for lookups and serialization. */
export const STAT_STRENGTH = 'strength'
export const STAT_INTELLECT = 'intellect'
export const STAT_AGILITY = 'agility'
export const STAT_STAMINA = 'stamina'
export const STAT_SPIRIT = 'spirit'

/** All stat ids in display order. */
export const ALL_STAT_IDS = [
  STAT_STRENGTH,
  STAT_INTELLECT,
  STAT_AGILITY,
  STAT_STAMINA,
  STAT_SPIRIT,
] as const

export type StatId = (typeof ALL_STAT_IDS)[number]

/** Map of stat id to value (base or bonus). Values are non-negative integers. */
export type CharacterStats = Record<StatId, number>

/** Default base stats for a new character. Can be tuned per class/race later. */
export const DEFAULT_CHARACTER_STATS: CharacterStats = {
  [STAT_STRENGTH]: 10,
  [STAT_INTELLECT]: 10,
  [STAT_AGILITY]: 10,
  [STAT_STAMINA]: 10,
  [STAT_SPIRIT]: 10,
}

/**
 * Returns a copy of default character stats. Use when initialising a new character.
 */
export function getDefaultCharacterStats(): CharacterStats {
  return { ...DEFAULT_CHARACTER_STATS }
}

/**
 * Returns effective value for one stat: base + bonus. Bonus can come from equipment later.
 * @param base - Base stats (character/level)
 * @param bonus - Bonus from equipment (e.g. +5 agility). Omit or pass zeros for none.
 * @param statId - Which stat to read
 * @returns base[statId] + (bonus[statId] ?? 0), never negative
 */
export function getEffectiveStat(
  base: CharacterStats,
  bonus: Partial<CharacterStats> | undefined,
  statId: StatId,
): number {
  const b = base[statId] ?? 0
  const add = bonus?.[statId] ?? 0
  return Math.max(0, b + add)
}

/**
 * Validates and normalises a stats object from save/network. Unknown keys are dropped; missing keys get 0.
 * @returns A full CharacterStats object safe for use
 */
export function normaliseCharacterStats(raw: unknown): CharacterStats {
  const result = getDefaultCharacterStats()
  if (!raw || typeof raw !== 'object') return result
  const obj = raw as Record<string, unknown>
  for (const id of ALL_STAT_IDS) {
    const v = obj[id]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      result[id] = Math.floor(v)
    }
  }
  return result
}

/**
 * Serialisable form of character stats (e.g. for SaveData). Same shape as CharacterStats.
 */
export function serialiseCharacterStats(stats: CharacterStats): Record<StatId, number> {
  return { ...stats }
}
