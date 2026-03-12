/**
 * Noodle caves: thin, winding tunnels via intersection of two ridged 3D noises. Part of the carvers pipeline stage (stage 6).
 * Vanilla-style: carve where both ridged values exceed threshold (intersection of hollow regions).
 */
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2NoodleDeps {
  noodleNoiseA3D(x: number, y: number, z: number): number
  noodleNoiseB3D(x: number, y: number, z: number): number
  /** Scale for noise sampling (higher = thinner, more frequent noodles). */
  scale: number
  /** Carve where both ridged values (1 - |noise|) exceed this threshold. */
  threshold: number
  /** Minimum blocks between cave ceiling and surface. Default 0. */
  minDepthBelowSurface?: number
  /** Optional surface height query for edge capping. */
  getHeightAt?: (x: number, z: number) => number
}

/**
 * Caps the per-column carve topY at chunk edges using the neighbor column surface height.
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
 * Creates the noodle carver stage. Carves where both ridged noises exceed threshold.
 */
export function createStage2Noodle(deps: Stage2NoodleDeps): PipelineStage {
  const {
    noodleNoiseA3D,
    noodleNoiseB3D,
    scale,
    threshold,
    minDepthBelowSurface = 0,
    getHeightAt,
  } = deps

  return function stage2Noodle(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const topY = getEdgeCappedTopY({
          worldX,
          worldZ,
          lx,
          lz,
          topY: heightmap[lx][lz],
          getHeightAt,
        })
        const carveCeilingWorldY = Math.max(WORLD_MIN_Y + 1, topY - minDepthBelowSurface)
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          const worldY = WORLD_MIN_Y + ly
          if (worldY >= carveCeilingWorldY) break
          const wx = worldX + lx
          const wz = worldZ + lz
          const nx = wx * scale
          const ny = worldY * scale
          const nz = wz * scale
          const ridgeA = 1 - Math.abs(noodleNoiseA3D(nx, ny, nz))
          const ridgeB = 1 - Math.abs(noodleNoiseB3D(nx, ny, nz))
          if (ridgeA > threshold && ridgeB > threshold) {
            voxelMap[localKey(lx, ly, lz)] = CARVED_ID
          }
        }
      }
    }
  }
}
