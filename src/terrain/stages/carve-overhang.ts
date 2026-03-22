/**
 * Overhang carving: density-like 3D noise near the surface to create cliff cavities.
 * This stage is optional and tuned via an overhang profile in terrain/index.ts.
 */
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2OverhangDeps {
  /** 3D noise sampled in roughly [-1,1]. */
  overhangNoise3D(x: number, y: number, z: number): number
  /** Horizontal scale for noise sampling. */
  scaleXZ: number
  /** Vertical scale for noise sampling. */
  scaleY: number
  /** Carve where noise > threshold. */
  threshold: number
  /** Only carve when local slope exceeds this (blocks). */
  minSlope: number
  /** Min depth below surface to start carving (blocks). */
  minDepthBelowSurface: number
  /** Max depth below surface to stop carving (blocks). */
  maxDepthBelowSurface: number
  /** Optional world-space surface height query used to cap carving at chunk edges. */
  getHeightAt?: (x: number, z: number) => number
}

/**
 * Caps the per-column carve topY at chunk edges using neighbor column surface height.
 *
 * @param options - Column and world context
 * @returns Capped surface height
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

  const clampSurfaceY = (y: number): number =>
    Math.floor(Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y, y)))

  if (lx === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx - 1, wz)))
  if (lx === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx + 1, wz)))
  if (lz === 0) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz - 1)))
  if (lz === CHUNK_SIZE - 1) capped = Math.min(capped, clampSurfaceY(getHeightAt(wx, wz + 1)))

  return capped
}

/**
 * Creates the overhang carving stage.
 *
 * @param deps - Overhang settings
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
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const topY = getEdgeCappedTopY({ worldX, worldZ, lx, lz, topY: heightmap[lx][lz], getHeightAt })
        const wx = worldX + lx
        const wz = worldZ + lz

        // Approximate local slope by sampling neighbor surface heights. This is only used for gating.
        const n = getHeightAt ? getHeightAt(wx, wz - 1) : topY
        const s = getHeightAt ? getHeightAt(wx, wz + 1) : topY
        const e = getHeightAt ? getHeightAt(wx + 1, wz) : topY
        const w = getHeightAt ? getHeightAt(wx - 1, wz) : topY
        const slope = Math.max(Math.abs(n - topY), Math.abs(s - topY), Math.abs(e - topY), Math.abs(w - topY))
        if (slope < minSlope) continue

        const startY = Math.max(WORLD_MIN_Y + 1, topY - maxDepthBelowSurface)
        const endY = Math.max(WORLD_MIN_Y + 1, topY - minDepthBelowSurface)

        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          const worldY = WORLD_MIN_Y + ly
          if (worldY < startY) continue
          if (worldY >= endY) break

          if (overhangNoise3D(wx * scaleXZ, worldY * scaleY, wz * scaleXZ) > threshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}

