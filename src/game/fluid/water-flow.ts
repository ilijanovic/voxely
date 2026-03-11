/**
 * Minecraft-style water flow: spread logic (fall first, then horizontal) and source creation.
 * Pure functions; no THREE/DOM. Used by the game loop to produce block changes each tick.
 */
import type { BlockType } from '../../types'
import { WATER_MAX_LEVEL } from '../../constants'

/** Block types that represent water (source or flowing). */
const WATER_SOURCE_TYPE = 'water_source'
const WATER_FLOWING_PREFIX = 'water_flowing_'

/**
 * Returns true if the block type is water (source or any flowing level).
 */
export function isWaterBlock(type: BlockType | 'air'): boolean {
  if (type === 'air') return false
  return type === WATER_SOURCE_TYPE || type.startsWith(WATER_FLOWING_PREFIX)
}

/**
 * Returns water level: 0 for source, 1–7 for flowing_1..7, or -1 if not water.
 */
export function getWaterLevel(type: BlockType | 'air'): number {
  if (type === 'air' || type === undefined) return -1
  if (type === WATER_SOURCE_TYPE) return 0
  if (type.startsWith(WATER_FLOWING_PREFIX)) {
    const k = parseInt(type.slice(WATER_FLOWING_PREFIX.length), 10)
    if (k >= 1 && k <= 7) return k
  }
  return -1
}

/**
 * Returns the block type for a given water level (0 = source, 1–7 = water_flowing_k).
 */
export function waterLevelToBlockType(level: number): BlockType {
  if (level <= 0) return WATER_SOURCE_TYPE as BlockType
  return (`water_flowing_${Math.min(level, WATER_MAX_LEVEL)}` as const) as BlockType
}

export interface WaterSpreadOptions {
  /** Resolve block at world position; null = unloaded chunk. */
  getBlockAt: (bx: number, by: number, bz: number) => BlockType | 'air' | null
  /** True if the block type is solid (blocks flow). */
  isSolid: (t: BlockType | 'air') => boolean
  /** World positions of blocks that currently contain water (to process this tick). */
  waterPositions: Array<{ bx: number; by: number; bz: number }>
  /** Optional cap on how many changes to return per tick (performance). */
  maxChangesPerTick?: number
}

export interface WaterSpreadChange {
  bx: number
  by: number
  bz: number
  value: BlockType
}

/**
 * Computes which blocks should become or update to water this tick.
 * Rules: (1) Flow down into air first; (2) flow horizontally into air or higher-level water; (3) create source when 2 sources adjacent + solid below.
 * Returns a list of changes; same cell appears at most once (lowest level wins).
 */
export function computeWaterSpread(options: WaterSpreadOptions): WaterSpreadChange[] {
  const { getBlockAt, isSolid, waterPositions, maxChangesPerTick } = options
  const changes = new Map<string, { level: number; value: BlockType }>()

  for (const { bx, by, bz } of waterPositions) {
    const type = getBlockAt(bx, by, bz)
    if (type === null || !isWaterBlock(type)) continue
    const level = getWaterLevel(type)
    if (level < 0) continue

    const below = getBlockAt(bx, by - 1, bz)
    const belowSolid = below !== null && below !== 'air' && isSolid(below)

    if (below === 'air') {
      const newLevel = Math.min(level + 1, WATER_MAX_LEVEL)
      const newType = waterLevelToBlockType(newLevel)
      const key = `${bx},${by - 1},${bz}`
      const existing = changes.get(key)
      if (!existing || existing.level > newLevel) changes.set(key, { level: newLevel, value: newType })
    }

    if (below !== 'air' && belowSolid) {
      const newLevel = level + 1
      if (newLevel <= WATER_MAX_LEVEL) {
        const newType = waterLevelToBlockType(newLevel)
        for (const [dx, dz] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const nx = bx + dx
          const nz = bz + dz
          const neighbor = getBlockAt(nx, by, nz)
          if (neighbor === null) continue
          const key = `${nx},${by},${nz}`
          const cur = changes.get(key)
          const currentLevel = cur ? cur.level : neighbor === 'air' ? 999 : getWaterLevel(neighbor)
          const shouldSet = neighbor === 'air' || (currentLevel >= 0 && currentLevel > newLevel)
          if (shouldSet && (!cur || cur.level > newLevel)) {
            changes.set(key, { level: newLevel, value: newType })
          }
        }
      }
    }

    if (maxChangesPerTick !== undefined && changes.size >= maxChangesPerTick) break
  }

  // Source creation: upgrade water_flowing_1 to water_source when 2+ horizontal neighbours are water_source and block below is solid
  for (const [key, entry] of changes) {
    if (entry.value !== 'water_flowing_1') continue
    const [bx, by, bz] = key.split(',').map(Number)
    let sourceCount = 0
    for (const [dx, dz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const t = getBlockAt(bx + dx, by, bz + dz)
      if (t === 'water_source') sourceCount++
      else if (t !== null && t !== 'air' && isWaterBlock(t) && getWaterLevel(t) === 0) sourceCount++
      else {
        const changeKey = `${bx + dx},${by},${bz + dz}`
        const ch = changes.get(changeKey)
        if (ch?.value === 'water_source') sourceCount++
      }
    }
    const below = getBlockAt(bx, by - 1, bz)
    const solidBelow = below !== null && below !== 'air' && isSolid(below)
    if (sourceCount >= 2 && solidBelow) entry.value = 'water_source' as BlockType
  }

  const out: WaterSpreadChange[] = []
  const limit = maxChangesPerTick ?? changes.size
  for (const [key, entry] of changes) {
    if (out.length >= limit) break
    const [bx, by, bz] = key.split(',').map(Number)
    out.push({ bx, by, bz, value: entry.value })
  }
  return out
}
