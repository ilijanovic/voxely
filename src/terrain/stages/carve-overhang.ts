/**
 * Overhang carver: density-like near-surface cavities on steep terrain.
 * This stage runs after cave carvers and before surface/stratigraphy.
 */
import type { Biome } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import { clamp } from '../utils'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2OverhangDeps {
  /** 3D noise used for density-style carve decisions. */
  overhangNoise3D(x: number, y: number, z: number): number
  /** Horizontal scale for overhang noise sampling. */
  scaleXZ: number
  /** Vertical scale for overhang noise sampling. */
  scaleY: number
  /** Base carve threshold (higher => fewer cavities). */
  threshold: number
  /** Minimum slope needed to enable overhang carving for a column. */
  minSlope: number
  /** Start carving at least this many blocks below the surface. */
  minDepthBelowSurface: number
  /** Stop carving deeper than this many blocks below the surface. */
  maxDepthBelowSurface: number
  /** Optional surface query for edge-aware slope and carve ceiling capping. */
  getHeightAt?: (x: number, z: number) => number
}

/** Biomes where cliff overhang carving is allowed. */
const OVERHANG_BIOMES = new Set<Biome>([
  'mountain',
  'snow',
  'snowy_slopes',
  'stony_peaks',
  'frozen_peaks',
  'jagged_peaks',
  'windswept_hills',
  'windswept_gravelly_hills',
  'windswept_forest',
  'stony_shore',
  'badlands',
])

/**
 * Clamps a sampled surface height to world bounds.
 *
 * @param y - Surface height candidate
 * @returns Clamped integer world Y
 */
function clampSurfaceY(y: number): number {
  return Math.floor(Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y, y)))
}

/**
 * Returns the edge-capped carve ceiling for a column, using neighbor heights when available.
 *
 * @param options - World/local coordinates and source topY
 * @returns Capped topY used for safe near-surface carving
 */
function getEdgeCappedTopY(options: {
  worldX: number
  worldZ: number
  lx: number
  lz: number
  topY: number
  getHeightAt?: (x: number, z: number) => number
}): number {
  const { worldX, worldZ, lx, lz, topY, getHeightAt } = options
  if (!getHeightAt) return topY

  let capped = topY
  const wx = worldX + lx
  const wz = worldZ + lz
  if (lx === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx - 1, wz)))
  if (lx === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx + 1, wz)))
  if (lz === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz - 1)))
  if (lz === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz + 1)))
  return capped
}

/**
 * Returns a local cardinal slope estimate for a column.
 *
 * @param options - Column coordinates and heightmap context
 * @returns Max cardinal |deltaY| around the center column
 */
function getCardinalSlope(options: {
  worldX: number
  worldZ: number
  lx: number
  lz: number
  heightmap: number[][]
  getHeightAt?: (x: number, z: number) => number
}): number {
  const { worldX, worldZ, lx, lz, heightmap, getHeightAt } = options
  const centerY = heightmap[lx][lz]
  const wx = worldX + lx
  const wz = worldZ + lz
  const sampleHeight = (nx: number, nz: number, fallback: number): number => {
    if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) return heightmap[nx][nz]
    if (!getHeightAt) return fallback
    return clampSurfaceY(getHeightAt(wx + (nx - lx), wz + (nz - lz)))
  }
  const north = sampleHeight(lx, lz - 1, centerY)
  const south = sampleHeight(lx, lz + 1, centerY)
  const west = sampleHeight(lx - 1, lz, centerY)
  const east = sampleHeight(lx + 1, lz, centerY)
  return Math.max(
    Math.abs(north - centerY),
    Math.abs(south - centerY),
    Math.abs(west - centerY),
    Math.abs(east - centerY),
  )
}

/**
 * Returns whether a biome supports overhang carving.
 *
 * @param biome - Column biome from biomeMap
 * @returns True when overhang carving may run for that biome
 */
function isOverhangBiome(biome: Biome | undefined): boolean {
  if (biome === undefined) return false
  return OVERHANG_BIOMES.has(biome)
}

/**
 * Creates the overhang carver stage.
 *
 * @param deps - Overhang noise and tuning parameters
 * @returns Pipeline stage function
 */
export function createStage2Overhang(deps: Stage2OverhangDeps): PipelineStage {
  const {
    overhangNoise3D,
    scaleXZ,
    scaleY,
    threshold,
    minSlope,
    minDepthBelowSurface,
    maxDepthBelowSurface,
    getHeightAt,
  } = deps

  return function stage2Overhang(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    const minDepth = Math.max(1, minDepthBelowSurface)
    const maxDepth = Math.max(minDepth + 1, maxDepthBelowSurface)

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const biome = ctx.biomeMap[lx][lz]
        if (!isOverhangBiome(biome)) continue

        const baseTopY = heightmap[lx][lz]
        if (baseTopY <= WATER_LEVEL + 3) continue

        const slope = getCardinalSlope({
          worldX,
          worldZ,
          lx,
          lz,
          heightmap,
          getHeightAt,
        })
        if (slope < minSlope) continue

        const topY = getEdgeCappedTopY({
          worldX,
          worldZ,
          lx,
          lz,
          topY: heightmap[lx][lz],
          getHeightAt,
        })
        const startY = Math.max(WORLD_MIN_Y + 1, topY - maxDepth)
        const endY = Math.min(topY - minDepth, WORLD_MAX_Y)
        if (startY > endY) continue

        const wx = worldX + lx
        const wz = worldZ + lz
        const slopeT = clamp((slope - minSlope) / 6, 0, 1)
        for (let worldY = startY; worldY <= endY; worldY++) {
          const ly = worldY - WORLD_MIN_Y
          if (ly <= 0 || ly >= WORLD_HEIGHT) continue

          const depthT = (worldY - startY) / Math.max(1, endY - startY)
          // Bias toward mid-depth cavity carving and avoid very shallow "face pitting".
          const midDepthBias = 1 - Math.min(1, Math.abs(depthT - 0.55) / 0.55)
          const shallowPenalty = (1 - depthT) * 0.015
          const thresholdAdjust = -slopeT * 0.05 - midDepthBias * 0.015 + shallowPenalty
          const effectiveThreshold = threshold + thresholdAdjust
          const n = overhangNoise3D(wx * scaleXZ, worldY * scaleY, wz * scaleXZ)
          if (n > effectiveThreshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
