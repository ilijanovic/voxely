/**
 * Class-based skill definitions (WoW-style). Warrior skills first.
 */
import type { PlayerClass } from './faction'

/** Skill effect: how the skill modifies combat (e.g. next hit deals bonus damage). */
export type SkillEffectKind = 'enhanced_strike'

export interface SkillDefinition {
  id: string
  name: string
  playerClass: PlayerClass
  /** Cooldown in seconds before the skill can be used again. */
  cooldownSeconds: number
  /** Effect type (e.g. next melee hit gets bonus damage). */
  effect: SkillEffectKind
  /** Optional: damage multiplier for the next strike (e.g. 1.5 = 150% damage). */
  damageMultiplier?: number
}

/** All registered skills by id. */
const SKILLS_BY_ID = new Map<string, SkillDefinition>()

/** Skills per class (for UI and key bindings). */
const SKILLS_BY_CLASS = new Map<PlayerClass, SkillDefinition[]>()

function register(skill: SkillDefinition): void {
  if (SKILLS_BY_ID.has(skill.id)) {
    throw new Error(`Duplicate skill id: ${skill.id}`)
  }
  SKILLS_BY_ID.set(skill.id, skill)
  const list = SKILLS_BY_CLASS.get(skill.playerClass) ?? []
  list.push(skill)
  SKILLS_BY_CLASS.set(skill.playerClass, list)
}

// Warrior: one starter skill (enhanced strike with cooldown)
register({
  id: 'warrior_strike',
  name: 'Strike',
  playerClass: 'warrior',
  cooldownSeconds: 4,
  effect: 'enhanced_strike',
  damageMultiplier: 1.5,
})

/**
 * Returns the skill definition by id, or undefined.
 */
export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILLS_BY_ID.get(id)
}

/**
 * Returns all skills available to the given class (for skill bar / key bindings).
 */
export function getSkillsForClass(playerClass: PlayerClass): SkillDefinition[] {
  return SKILLS_BY_CLASS.get(playerClass) ?? []
}

/**
 * Returns the first skill for a class (e.g. for default key 1). Used when only one skill exists.
 */
export function getFirstSkillForClass(playerClass: PlayerClass): SkillDefinition | undefined {
  const list = SKILLS_BY_CLASS.get(playerClass)
  return list?.[0]
}
