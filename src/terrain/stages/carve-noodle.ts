/**
 * Noodle caves: thin, meandering tunnels formed by intersecting 3D noise bands.
 * Part of the carvers pipeline stage (stage 6).
 */
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface Stage2NoodleDeps {
  /** Primary noodle noise channel (roughly [-1, 1]). */
  noodleNoiseA3D(x: number, y: number, z: number): number
  /** Secondary noodle noise channel (roughly [-1, 1]). */
  noodleNoiseB3D(x: number, y: number, z: number): number
  /** Uniform scale for world coords before sampling. */
  scale: number
  /** Carve where |A| < threshold and B is also near 0 (forms tubes). */
  threshold: number
  /** Minimum blocks between cave ceiling and surface (avoids caves directly under grass). Default 0. */
  minDepthBelowSurface?: number
  /** Optional world-space surface height query used to cap carving at chunk edges. */
  getHeightAt?: (x: number, z: number) => number
}

/**
 * Caps the per-column carve topY at chunk edges using the neighbor column surface height.
 * This reduces visible seams where adjacent chunks would carve to different ceilings.
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
 * Creates the noodle carver stage.
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
        const topY = getEdgeCappedTopY({ worldX, worldZ, lx, lz, topY: heightmap[lx][lz], getHeightAt })
        const carveCeilingWorldY = Math.max(WORLD_MIN_Y + 1, topY - minDepthBelowSurface)
        const wx = worldX + lx
        const wz = worldZ + lz
        for (let ly = 1; ly < WORLD_HEIGHT; ly++) {
          const worldY = WORLD_MIN_Y + ly
          if (worldY >= carveCeilingWorldY) break

          const a = noodleNoiseA3D(wx * scale, worldY * scale, wz * scale)
          if (Math.abs(a) >= threshold) continue
          const b = noodleNoiseB3D((wx + 31.7) * scale, (worldY - 11.3) * scale, (wz + 97.1) * scale)
          if (Math.abs(b) >= threshold) continue

          voxelMap[localKey(lx, ly, lz)] = CARVED_ID
        }
      }
    }
  }
}

