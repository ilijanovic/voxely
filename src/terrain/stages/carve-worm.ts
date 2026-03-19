/**
 * Optional worm carver (Minecraft-style random-walk caves). Part of the carvers pipeline stage (stage 6).
 * Fewer, wider tunnels than spaghetti; deterministic and chunk-stable.
 * Parameters: start rate (per grid cell), step count, radius (constant or curve).
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

/** Radius curve: constant or linear taper (endRadius = startRadius * taperEnd). */
export type WormRadiusCurve = 'constant' | { taperEnd: number }

export interface Stage2WormDeps {
  seed: number
  /** Probability per grid cell that a worm starts (0..1). Deterministic from seed+cell. */
  startRate: number
  /** Grid cell size in X/Z (one candidate origin per cell). */
  cellSize: number
  /** Number of random-walk steps per worm. */
  steps: number
  /** Radius in blocks (constant) or [start, end] for linear taper. */
  radius: number
  /** If set, radius tapers from radius at start to radius * taperEnd at end. */
  radiusCurve?: WormRadiusCurve
  /** Max Y for worm paths. */
  maxY: number
  /** Min blocks below surface before carving. Default 0. */
  minDepthBelowSurface?: number
  /** Optional surface height query for edge capping. */
  getHeightAt?: (x: number, z: number) => number
}

const WORM_SEED_OFFSET = 60000

/**
 * Deterministic 0..1 value for cell (gx, gz) to decide if worm starts (compare to startRate).
 */
function getWormStartRoll(seed: number, gx: number, gz: number): number {
  const rng = makeSeededRandom(seed + WORM_SEED_OFFSET + gx * 7907 + gz * 7927)
  return rng()
}

/**
 * Generate deterministic worm path for cell (gx, gz). Only called when start roll < startRate.
 */
function getWormPath(
  seed: number,
  gx: number,
  gz: number,
  cellSize: number,
  steps: number,
  maxY: number,
): WormPoint[] {
  const rng = makeSeededRandom(seed + WORM_SEED_OFFSET + gx * 7907 + gz * 7927)
  const x0 = gx * cellSize + rng() * cellSize
  const z0 = gz * cellSize + rng() * cellSize
  const yRange = maxY - (WORLD_MIN_Y + 20)
  const rawY0 = yRange > 0 ? WORLD_MIN_Y + 10 + rng() * yRange : WORLD_MIN_Y + 10
  const y0 = Math.max(WORLD_MIN_Y + 1, Math.min(maxY, Math.floor(rawY0)))
  const path: WormPoint[] = [{ x: x0, y: y0, z: z0 }]
  let x = x0,
    y = y0,
    z = z0
  for (let i = 0; i < steps; i++) {
    const dx = (rng() - 0.5) * 6
    const dy = (rng() - 0.5) * 3
    const dz = (rng() - 0.5) * 6
    const len = 0.8 + rng() * 1.2
    x += dx * len
    y += dy * len
    z += dz * len
    y = Math.max(WORLD_MIN_Y + 1, Math.min(maxY, y))
    path.push({ x, y, z })
  }
  return path
}

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

/** Get radius at segment index (0 = start, path.length-1 = end). */
function getRadiusAtStep(
  radius: number,
  radiusCurve: Stage2WormDeps['radiusCurve'],
  stepIndex: number,
  totalSegments: number,
): number {
  if (!radiusCurve || radiusCurve === 'constant') return radius
  const t = totalSegments > 0 ? stepIndex / totalSegments : 0
  const taper = 1 + t * (radiusCurve.taperEnd - 1)
  return radius * Math.max(0.1, taper)
}

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

/**
 * Creates the worm carver stage. Optional: pass in deps to enable, omit to skip.
 */
export function createStage2Worm(deps: Stage2WormDeps): PipelineStage {
  const {
    seed,
    startRate,
    cellSize,
    steps,
    radius,
    radiusCurve = 'constant',
    maxY,
    minDepthBelowSurface = 0,
    getHeightAt,
  } = deps

  return function stage2Worm(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, voxelMap } = ctx
    const gxMin = Math.floor((worldX - 60) / cellSize)
    const gxMax = Math.ceil((worldX + CHUNK_SIZE + 60) / cellSize)
    const gzMin = Math.floor((worldZ - 60) / cellSize)
    const gzMax = Math.ceil((worldZ + CHUNK_SIZE + 60) / cellSize)

    const worms: WormPoint[][] = []
    for (let gx = gxMin; gx < gxMax; gx++) {
      for (let gz = gzMin; gz < gzMax; gz++) {
        if (getWormStartRoll(seed, gx, gz) >= startRate) continue
        const path = getWormPath(seed, gx, gz, cellSize, steps, maxY)
        const maxRadius =
          radiusCurve === 'constant' ? radius : Math.max(radius, radius * (radiusCurve.taperEnd ?? 1))
        if (wormIntersectsChunk(path, worldX, worldZ, maxRadius)) worms.push(path)
      }
    }

    for (const path of worms) {
      const totalSegments = path.length - 1
      for (let s = 0; s < totalSegments; s++) {
        const a = path[s],
          b = path[s + 1]
        const dx = b.x - a.x,
          dy = b.y - a.y,
          dz = b.z - a.z
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const numSteps = Math.max(1, Math.ceil(len / 1.2))
        const segRadius = getRadiusAtStep(radius, radiusCurve, s, totalSegments)
        for (let i = 0; i <= numSteps; i++) {
          const t = i / numSteps
          const cx = a.x + t * dx
          const cy = a.y + t * dy
          const cz = a.z + t * dz
          carveSphereAt(
            cx,
            cy,
            cz,
            segRadius,
            worldX,
            worldZ,
            heightmap,
            voxelMap,
            minDepthBelowSurface,
            getHeightAt,
          )
        }
      }
    }
  }
}
