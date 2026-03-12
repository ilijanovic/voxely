/**
 * Cheese caves: large, blobby caverns via 3D noise at a larger scale. Part of the carvers pipeline stage (stage 6).
 * Carves only below surface and above bedrock (ly >= 1).
 */
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2CheeseDeps {
  cheeseNoise3D(x: number, y: number, z: number): number
  /** Horizontal scale for noise sampling (x, z). Vanilla xz_scale 1.0; we use ~0.03. */
  scaleXZ: number
  /** Vertical scale for noise sampling (y). Vanilla y_scale 2/3 of xz; smaller = taller blobs. */
  scaleY: number
  /** Carve where noise > threshold. */
  threshold: number
  /** Minimum blocks between cave ceiling and surface (avoids caves directly under grass). Default 0. */
  minDepthBelowSurface?: number
  /** Optional: depth-dependent density (0..1). Higher = more caves at this Y. Default: always 1. */
  caveDensityFactor?: (y: number) => number
  /**
   * Optional world-space surface height query used to cap carving at chunk edges.
   * This helps avoid visible ceiling/floor steps where adjacent chunks have different surface heights.
   */
  getHeightAt?: (x: number, z: number) => number
}

/**
 * Caps the per-column carve topY at chunk edges using the neighbor column surface height.
 * This reduces visible “seams” where one chunk carves higher than its neighbor.
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

  /** Clamp a float surface height to valid world Y in [WORLD_MIN_Y..WORLD_MAX_Y]. */
  const clampSurfaceY = (y: number): number =>
    Math.floor(Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y, y)))

  if (lx === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx - 1, wz)))
  if (lx === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx + 1, wz)))
  if (lz === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz - 1)))
  if (lz === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz + 1)))

  return capped
}

export function createStage2Cheese(deps: Stage2CheeseDeps): PipelineStage {
  const { cheeseNoise3D, scaleXZ, scaleY, threshold, minDepthBelowSurface = 0, caveDensityFactor, getHeightAt } = deps
  const densityAt = caveDensityFactor ?? (() => 1)

  return function stage2Cheese(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const topY = getEdgeCappedTopY({ worldX, worldZ, lx, lz, topY: heightmap[lx][lz], getHeightAt })
        const carveCeilingWorldY = Math.max(WORLD_MIN_Y + 1, topY - minDepthBelowSurface)
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          const worldY = WORLD_MIN_Y + ly
          if (worldY >= carveCeilingWorldY) break
          const wx = worldX + lx
          const wz = worldZ + lz
          const effectiveThreshold = threshold / Math.max(0.01, densityAt(worldY))
          if (cheeseNoise3D(wx * scaleXZ, worldY * scaleY, wz * scaleXZ) > effectiveThreshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
