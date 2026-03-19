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
  value: BlockType | 'air'
}

/**
 * Computes which blocks should become or update to water this tick.
 * Rules: (1) flow from sources (down first, then horizontal), (2) create source with 2-source rule, (3) remove unsupported flowing water.
 * Returns a list of changes; same cell appears at most once.
 */
export function computeWaterSpread(options: WaterSpreadOptions): WaterSpreadChange[] {
  const { getBlockAt, isSolid, waterPositions, maxChangesPerTick } = options
  const horizontalOffsets: Array<[number, number]> = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]
  const localOffsets: Array<[number, number, number]> = [
    [0, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  const snapshotCache = new Map<string, BlockType | 'air' | null>()
  const candidateKeys = new Set<string>()

  const keyOf = (bx: number, by: number, bz: number): string => `${bx},${by},${bz}`

  const readSnapshot = (bx: number, by: number, bz: number): BlockType | 'air' | null => {
    const key = keyOf(bx, by, bz)
    const cached = snapshotCache.get(key)
    if (cached !== undefined) return cached
    const value = getBlockAt(bx, by, bz)
    snapshotCache.set(key, value)
    return value
  }

  for (const { bx, by, bz } of waterPositions) {
    const type = readSnapshot(bx, by, bz)
    if (type === null || !isWaterBlock(type)) continue
    for (const [dx, dy, dz] of localOffsets) {
      const nx = bx + dx
      const ny = by + dy
      const nz = bz + dz
      if (readSnapshot(nx, ny, nz) === null) continue
      candidateKeys.add(keyOf(nx, ny, nz))
    }
  }

  if (candidateKeys.size === 0) return []

  const sourceKeys = new Set<string>()
  for (const key of candidateKeys) {
    const [bx, by, bz] = key.split(',').map(Number)
    if (readSnapshot(bx, by, bz) === 'water_source') sourceKeys.add(key)
  }

  // Infinite water source rule: 2+ adjacent sources + solid below.
  for (const key of candidateKeys) {
    const [bx, by, bz] = key.split(',').map(Number)
    const cur = readSnapshot(bx, by, bz)
    if (cur === null) continue
    if (cur !== 'air' && !isWaterBlock(cur)) continue
    const below = readSnapshot(bx, by - 1, bz)
    const solidBelow = below !== null && below !== 'air' && !isWaterBlock(below) && isSolid(below)
    if (!solidBelow) continue
    let sourceCount = 0
    for (const [dx, dz] of horizontalOffsets) {
      if (sourceKeys.has(keyOf(bx + dx, by, bz + dz))) sourceCount++
    }
    if (sourceCount >= 2) sourceKeys.add(key)
  }

  const desiredLevels = new Map<string, number>()
  const queue: Array<{ bx: number; by: number; bz: number; level: number }> = []
  let queueIndex = 0
  const enqueueIfBetter = (bx: number, by: number, bz: number, level: number): void => {
    const key = keyOf(bx, by, bz)
    if (!candidateKeys.has(key)) return
    const cur = readSnapshot(bx, by, bz)
    if (cur === null) return
    if (cur !== 'air' && !isWaterBlock(cur)) return
    const prev = desiredLevels.get(key)
    if (prev !== undefined && prev <= level) return
    desiredLevels.set(key, level)
    queue.push({ bx, by, bz, level })
  }

  for (const key of sourceKeys) {
    const [bx, by, bz] = key.split(',').map(Number)
    enqueueIfBetter(bx, by, bz, 0)
  }

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++]!
    const { bx, by, bz, level } = current

    // Falling water resets to flowing_1 regardless of parent level.
    enqueueIfBetter(bx, by - 1, bz, 1)

    const below = readSnapshot(bx, by - 1, bz)
    const belowSolid = below !== null && below !== 'air' && !isWaterBlock(below) && isSolid(below)
    if (!belowSolid || level >= WATER_MAX_LEVEL) continue

    const horizontalLevel = level + 1
    for (const [dx, dz] of horizontalOffsets) {
      enqueueIfBetter(bx + dx, by, bz + dz, horizontalLevel)
    }
  }

  const writeChanges: Array<WaterSpreadChange & { level: number }> = []
  const removeChanges: WaterSpreadChange[] = []

  for (const key of candidateKeys) {
    const [bx, by, bz] = key.split(',').map(Number)
    const cur = readSnapshot(bx, by, bz)
    if (cur === null) continue
    if (cur !== 'air' && !isWaterBlock(cur)) continue

    const desired = desiredLevels.get(key)
    if (desired === undefined) {
      if (cur !== 'air' && cur !== 'water_source') removeChanges.push({ bx, by, bz, value: 'air' })
      continue
    }

    const next = waterLevelToBlockType(desired)
    if (cur !== next) writeChanges.push({ bx, by, bz, value: next, level: desired })
  }

  writeChanges.sort((a, b) => {
    if (a.by !== b.by) return b.by - a.by
    if (a.level !== b.level) return a.level - b.level
    if (a.bx !== b.bx) return a.bx - b.bx
    return a.bz - b.bz
  })
  removeChanges.sort((a, b) => {
    if (a.by !== b.by) return a.by - b.by
    if (a.bx !== b.bx) return a.bx - b.bx
    return a.bz - b.bz
  })

  const out = [...writeChanges.map(({ bx, by, bz, value }) => ({ bx, by, bz, value })), ...removeChanges]
  const limit = maxChangesPerTick ?? out.length
  return out.slice(0, limit)
}
