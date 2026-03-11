/**
 * Player experience and level (max 60). WoW-inspired progression.
 */
import { MAX_LEVEL } from './constants'
import type { WorldArea } from './world-areas'

/** Base multiplier for XP per level (tune to change overall speed). */
const XP_BASE = 80
/** Exponent for level scaling (>1 = later levels need much more XP). */
const XP_EXPONENT = 1.52

/**
 * Per-level XP offset for fine-tuning. Index 0 = 1→2, index 1 = 2→3, … index 58 = 59→60.
 * Final XP = max(1, formula(L) + offset). Negative = easier, positive = harder.
 */
const XP_OFFSET_PER_LEVEL: number[] = [
  // 1→2 … 10→11
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // 11→12 … 20→21
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // 21→22 … 30→31
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // 31→32 … 40→41
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // 41→42 … 50→51
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // 51→52 … 59→60
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]

/**
 * XP required to go from level L to L+1. Formula + optional offset; result at least 1.
 */
const XP_FOR_LEVEL: number[] = (() => {
  const table: number[] = []
  for (let l = 1; l < MAX_LEVEL; l++) {
    const fromFormula = Math.floor(XP_BASE * Math.pow(l, XP_EXPONENT))
    const offset = XP_OFFSET_PER_LEVEL[l - 1] ?? 0
    table.push(Math.max(1, fromFormula + offset))
  }
  return table
})()

/**
 * XP granted per mob kill by world area (one orb per kill). Index 0 = area_1 (levels 1–10), index 5 = area_6 (50–60).
 * Tuned so early zones need ~7–10 kills per level, late zones scale up.
 */
const XP_DROP_PER_AREA = [8, 18, 35, 60, 95, 140]

/**
 * Returns the XP amount for one collectible orb when a mob dies in the given area.
 */
export function getXpDropForArea(area: WorldArea): number {
  const areaIndex = parseInt(area.id.replace(/^area_/, ''), 10) - 1
  return XP_DROP_PER_AREA[Math.max(0, Math.min(areaIndex, XP_DROP_PER_AREA.length - 1))] ?? XP_DROP_PER_AREA[0]
}

/**
 * Returns the total XP required to reach the given level (from level 1).
 * Level 1 = 0 XP, level 2 = XP_FOR_LEVEL[0], etc.
 */
export function getXpRequiredForLevel(level: number): number {
  if (level <= 1) return 0
  if (level > MAX_LEVEL) level = MAX_LEVEL
  let total = 0
  for (let i = 0; i < level - 1 && i < XP_FOR_LEVEL.length; i++) {
    total += XP_FOR_LEVEL[i]
  }
  return total
}

/**
 * Returns the XP required to go from (level - 1) to level.
 */
export function getXpForNextLevel(level: number): number {
  if (level < 1 || level >= MAX_LEVEL) return 0
  return XP_FOR_LEVEL[level - 1] ?? 0
}

/**
 * Adds experience and returns new level and experience (capped at max level).
 * Experience overflow into the next level is applied until max level.
 */
export function addExperience(
  currentLevel: number,
  currentExperience: number,
  amount: number,
): { level: number; experience: number } {
  let level = Math.max(1, Math.min(MAX_LEVEL, currentLevel))
  let experience = Math.max(0, currentExperience)
  experience += amount

  while (level < MAX_LEVEL) {
    const needed = getXpForNextLevel(level)
    if (needed <= 0) break
    if (experience < needed) return { level, experience }
    experience -= needed
    level += 1
  }

  if (level >= MAX_LEVEL) experience = Math.min(experience, getXpForNextLevel(MAX_LEVEL - 1) - 1)
  return { level, experience }
}

/**
 * Returns progress to next level: 0..1 (1 = ready to level up).
 */
export function getLevelProgress(level: number, experience: number): number {
  if (level >= MAX_LEVEL) return 1
  const needed = getXpForNextLevel(level)
  if (needed <= 0) return 1
  return Math.min(1, experience / needed)
}
