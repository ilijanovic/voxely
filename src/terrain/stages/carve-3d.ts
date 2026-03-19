/**
 * 3D noise carving: sets voxels to "carved" (air) where cave noise exceeds threshold. Part of the carvers pipeline stage (stage 6).
 */
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2Deps {
  caveNoise3D(x: number, y: number, z: number): number
  /** Carve where noise > threshold (e.g. 0.4 for worm-like caves). */
  carveThreshold: number
  /** Minimum blocks between cave ceiling and surface (avoids caves directly under grass). Default 0. */
  minDepthBelowSurface?: number
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

export function createStage2(deps: Stage2Deps): PipelineStage {
  const { caveNoise3D, carveThreshold, minDepthBelowSurface = 0, getHeightAt } = deps

  return function stage2Carve3D(ctx: ChunkContext): void {
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
          if (caveNoise3D(wx, worldY, wz) > carveThreshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
