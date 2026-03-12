/**
 * Minecraft-style creature spawn: per-biome probability and valid surface blocks.
 * Used by spawn.ts for natural (non-zone, non-village) animal spawning.
 */
import type { Biome } from '../types'

/** Default creature spawn probability for land biomes (Minecraft: 0.1). */
export const DEFAULT_CREATURE_SPAWN_PROBABILITY = 0.1

/**
 * Creature spawn probability per biome (Minecraft Java chunk generation).
 * Missing entries use DEFAULT_CREATURE_SPAWN_PROBABILITY. Use 0 for no passive spawns (ocean, etc.).
 */
export const CREATURE_SPAWN_PROBABILITY: Partial<Record<Biome, number>> = {
  ocean: 0,
  badlands: 0.03,
  snow: 0.07,
  snowy_slopes: 0.07,
  frozen_peaks: 0.07,
  jagged_peaks: 0.07,
}

/**
 * Block types that are valid spawn surfaces for passive creatures (grass-like; prevents spawn on stone/water).
 */
export const CREATURE_SPAWN_SURFACE_BLOCKS: ReadonlySet<string> = new Set([
  'grass',
  'grass_snow',
  'grass_savanna',
  'sand',
])

/** Max attempts to find a valid spawn position per pack member (Minecraft: 4). */
export const CREATURE_SPAWN_POSITION_ATTEMPTS = 4

/**
 * Hostile mob spawn: only when block light at spawn position is at or below this (0–15).
 * Torches and future sky light reduce spawns (Minecraft-style).
 */
export const HOSTILE_SPAWN_MAX_LIGHT = 7
