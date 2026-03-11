/**
 * Single source of truth for surface height thresholds used by worker, main-thread runtime, and sampling.
 * Import from here in terrain/index.ts, game-terrain.ts, and terrain-sampling.ts so values stay in sync.
 */
import { WATER_LEVEL } from '../constants'

/** Above this Y, mountain-like biomes use stone surface (windswept_*, meadow). */
export const MOUNTAIN_STONE_SURFACE_HEIGHT = WATER_LEVEL + 16

/** Above this Y, all non-peak biomes use stone surface unless exempt (e.g. frozen_peaks, jagged_peaks, jungle). */
export const SURFACE_STONE_HEIGHT = WATER_LEVEL + 26
