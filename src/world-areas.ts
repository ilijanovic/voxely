/**
 * World areas by level band (1–10, 10–20, …). Areas are distance rings from spawn origin.
 */
import { SPAWN_X, SPAWN_Z, MAX_LEVEL } from './constants'

/** Level range for an area (inclusive min, inclusive max). */
export interface AreaLevelRange {
  levelMin: number
  levelMax: number
}

/** Area id and level band. */
export interface WorldArea {
  id: string
  levelMin: number
  levelMax: number
}

/**
 * Outer radius (blocks) per area. Area 1 = 0..R1, Area 2 = R1..R2, etc.
 * Very large world: edge of last ring ~6 h run from spawn at ~5 blocks/s (108k blocks).
 */
const AREA_RADII_BLOCKS = [12_000, 27_000, 45_000, 66_000, 87_000, 108_000]

/** Build area list: one per level band (1–10, 10–20, …, 50–60). */
const AREAS: WorldArea[] = (() => {
  const step = Math.floor(MAX_LEVEL / AREA_RADII_BLOCKS.length)
  return AREA_RADII_BLOCKS.map((_, i) => ({
    id: `area_${i + 1}`,
    levelMin: i * step + 1,
    levelMax: (i + 1) * step,
  }))
})()

/**
 * Returns the area at world position (x, z) based on distance from spawn origin.
 */
export function getAreaAt(worldX: number, worldZ: number): WorldArea | null {
  const dx = worldX - SPAWN_X
  const dz = worldZ - SPAWN_Z
  const distSq = dx * dx + dz * dz
  const dist = Math.sqrt(distSq)
  for (let i = 0; i < AREA_RADII_BLOCKS.length; i++) {
    if (dist <= AREA_RADII_BLOCKS[i]) return AREAS[i]
  }
  return AREAS[AREAS.length - 1]
}

/**
 * Returns the level range for an area.
 */
export function getAreaLevelRange(area: WorldArea): AreaLevelRange {
  return { levelMin: area.levelMin, levelMax: area.levelMax }
}

/**
 * Picks a random mob level in the area's range (inclusive).
 * Uses a simple seeded RNG so the same (wx, wz, kind) gives the same level (optional for determinism).
 * For now uses Math.random() for variety.
 */
export function getRandomMobLevelInArea(area: WorldArea): number {
  const range = area.levelMax - area.levelMin + 1
  return area.levelMin + Math.floor(Math.random() * range)
}
