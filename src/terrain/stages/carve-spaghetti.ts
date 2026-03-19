/**
 * Spaghetti caves: long, thin, winding tunnels via deterministic worm paths. Part of the carvers pipeline stage (stage 6).
 * Carves only below surface and above bedrock (ly >= 1).
 */
import { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from '../../constants'
import { localKey, CARVED_ID } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { makeSeededRandom } from '../utils'

/** World-space point on a worm path. */
interface WormPoint {
  x: number
  y: number
  z: number
}

export interface Stage2SpaghettiDeps {
  seed: number
  /** Radius around worm path to carve (blocks). */
  radius: number
  /** One worm per this many blocks in X/Z (e.g. 32). */
  cellSize: number
  /** Worm path length in steps. */
  steps: number
  /** Max Y for worm paths (don't carve above this). */
  maxY: number
  /** Minimum blocks between cave ceiling and surface (avoids caves directly under grass). Default 0. */
  minDepthBelowSurface?: number
  /**
   * Optional world-space surface height query used to cap carving at chunk edges.
   * This helps avoid visible ceiling/floor steps where adjacent chunks have different surface heights.
   */
  getHeightAt?: (x: number, z: number) => number
}

/** Step along segment (blocks) so spheres of radius R overlap. */
const SEGMENT_STEP = 0.8

/** Generate deterministic worm path for cell (gx, gz). */
function getWormPath(
  seed: number,
  gx: number,
  gz: number,
  cellSize: number,
  steps: number,
  maxY: number,
): WormPoint[] {
  const rng = makeSeededRandom(seed + gx * 7901 + gz * 7919)
  const x0 = gx * cellSize + rng() * cellSize
  const z0 = gz * cellSize + rng() * cellSize
  const yRange = maxY - (WORLD_MIN_Y + 16)
  const rawY0 = yRange > 0 ? WORLD_MIN_Y + 8 + rng() * yRange : WORLD_MIN_Y + 8
  const y0 = Math.max(WORLD_MIN_Y + 1, Math.min(maxY, Math.floor(rawY0)))
  const path: WormPoint[] = [{ x: x0, y: y0, z: z0 }]
  let x = x0,
    y = y0,
    z = z0
  for (let i = 0; i < steps; i++) {
    const dx = (rng() - 0.5) * 4
    const dy = (rng() - 0.5) * 2
    const dz = (rng() - 0.5) * 4
    const len = 0.5 + rng() * 1.5
    x += dx * len
    y += dy * len
    z += dz * len
    y = Math.max(WORLD_MIN_Y + 1, Math.min(maxY, y))
    path.push({ x, y, z })
  }
  return path
}

/** Check if worm path AABB (expanded by carve radius) intersects chunk AABB. */
function wormIntersectsChunk(
  path: WormPoint[],
  worldX: number,
  worldZ: number,
  radius: number,
): boolean {
  let minX = path[0].x,
    maxX = path[0].x
  let minZ = path[0].z,
    maxZ = path[0].z
  for (let i = 1; i < path.length; i++) {
    const p = path[i]
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const r = Math.ceil(radius)
  return (
    minX - r < worldX + CHUNK_SIZE &&
    maxX + r >= worldX &&
    minZ - r < worldZ + CHUNK_SIZE &&
    maxZ + r >= worldZ
  )
}

/** Carve a sphere of radius R (in blocks) at world (cx, cy, cz) into the chunk. Only sets voxels below surface. */
function carveSphereAt(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  worldX: number,
  worldZ: number,
  heightmap: number[][],
  voxelMap: Uint8Array,
  minDepthBelowSurface: number,
  getHeightAt?: (x: number, z: number) => number,
): void {
  const r = Math.ceil(radius)
  const minVx = Math.floor(cx - r)
  const maxVx = Math.floor(cx + r)
  const minVy = Math.max(WORLD_MIN_Y + 1, Math.floor(cy - r))
  const maxVy = Math.min(WORLD_MAX_Y, Math.floor(cy + r))
  const minVz = Math.floor(cz - r)
  const maxVz = Math.floor(cz + r)
  const radiusSq = radius * radius

  /** Caps the per-column carve topY at chunk edges using the neighbor column surface height. */
  const getEdgeCappedTopY = (options: { lx: number; lz: number; topY: number }): number => {
    const { lx, lz, topY } = options
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

  for (let vx = minVx; vx <= maxVx; vx++) {
    const lx = vx - worldX
    if (lx < 0 || lx >= CHUNK_SIZE) continue
    for (let vz = minVz; vz <= maxVz; vz++) {
      const lz = vz - worldZ
      if (lz < 0 || lz >= CHUNK_SIZE) continue
      const topYCol = getEdgeCappedTopY({ lx, lz, topY: heightmap[lx][lz] })
      const carveCeilingWorldY = Math.max(WORLD_MIN_Y + 1, topYCol - minDepthBelowSurface)
      for (let vy = minVy; vy <= maxVy && vy < carveCeilingWorldY; vy++) {
        const ly = vy - WORLD_MIN_Y
        const dx = vx + 0.5 - cx,
          dy = vy + 0.5 - cy,
          dz = vz + 0.5 - cz
        if (dx * dx + dy * dy + dz * dz <= radiusSq) {
          voxelMap[localKey(lx, ly, lz)] = CARVED_ID
        }
      }
    }
  }
}

export function createStage2Spaghetti(deps: Stage2SpaghettiDeps): PipelineStage {
  const { seed, radius, cellSize, steps, maxY, minDepthBelowSurface = 0, getHeightAt } = deps

  return function stage2Spaghetti(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    const gxMin = Math.floor((worldX - 40) / cellSize)
    const gxMax = Math.ceil((worldX + CHUNK_SIZE + 40) / cellSize)
    const gzMin = Math.floor((worldZ - 40) / cellSize)
    const gzMax = Math.ceil((worldZ + CHUNK_SIZE + 40) / cellSize)

    const worms: WormPoint[][] = []
    for (let gx = gxMin; gx < gxMax; gx++) {
      for (let gz = gzMin; gz < gzMax; gz++) {
        const path = getWormPath(seed, gx, gz, cellSize, steps, maxY)
        if (wormIntersectsChunk(path, worldX, worldZ, radius)) worms.push(path)
      }
    }

    for (const path of worms) {
      for (let s = 0; s < path.length - 1; s++) {
        const a = path[s],
          b = path[s + 1]
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const numSteps = Math.max(1, Math.ceil(len / SEGMENT_STEP))
        for (let i = 0; i <= numSteps; i++) {
          const t = i / numSteps
          const cx = a.x + t * dx
          const cy = a.y + t * dy
          const cz = a.z + t * dz
          carveSphereAt(cx, cy, cz, radius, worldX, worldZ, heightmap, voxelMap, minDepthBelowSurface, getHeightAt)
        }
      }
    }
  }
}
