/**
 * Ore feature for Stage 8: replaces stone with coal, iron, gold, diamond ore.
 * Vanilla Minecraft 1.18–style: 3D density noise, triangular Y distribution, vein blobs.
 */
import type { Biome } from '../../types'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { localKey, typeToId, idToType } from '../block-ids'
import { BIOME_REGISTRY } from '../biomes'
import {
  ORE_CONFIGS,
  type OreConfig,
} from '../ore-constants'
import type { ChunkContext, FeatureFn } from '../pipeline-types'

/** 6 neighbor offsets (axis-aligned). Order fixed for deterministic BFS. */
const NEIGHBOR_DX = [1, -1, 0, 0, 0, 0]
const NEIGHBOR_DY = [0, 0, 1, -1, 0, 0]
const NEIGHBOR_DZ = [0, 0, 0, 0, 1, -1]

export interface OreFeatureDeps {
  /** 3D density noise in [0, 1]. Sampled at (x, y, z) world coords; caller applies scale. */
  oreDensityNoise3D: (x: number, y: number, z: number) => number
}

/**
 * Triangular weight for Y: 0 at minY and maxY, 1 at peakY. Vanilla 1.18 ore distribution.
 */
export function triangularWeight(y: number, minY: number, maxY: number, peakY: number): number {
  if (y < minY || y > maxY) return 0
  if (peakY <= minY || peakY >= maxY) return 1
  if (y <= peakY) return (y - minY) / (peakY - minY)
  return (maxY - y) / (maxY - peakY)
}

/**
 * Deterministic shuffle of indices [0..5] using a seed. Used for neighbor order in BFS.
 */
function shuffledNeighborIndices(seed: number): number[] {
  const indices = [0, 1, 2, 3, 4, 5]
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

/**
 * Expands a vein from (cx, cy, cz) replacing up to veinSize stone blocks with ore.
 * Only modifies blocks inside the chunk; BFS is limited to chunk bounds.
 */
function placeVein(
  ctx: ChunkContext,
  cfg: OreConfig,
  cx: number,
  cy: number,
  cz: number,
): void {
  const { worldX, worldZ, voxelMap } = ctx
  const oreId = typeToId(cfg.block)
  const seed =
    (worldX + cx) * 73856093 ^
    cy * 19349663 ^
    (worldZ + cz) * 83492791 ^
    (cfg.block.length * 1000)
  const order = shuffledNeighborIndices(seed >>> 0)
  const queue: [number, number, number][] = [[cx, cy, cz]]
  const visited = new Set<number>()
  visited.add(localKey(cx, cy, cz))
  let placed = 0
  while (queue.length > 0 && placed < cfg.veinSize) {
    const [lx, ly, lz] = queue.shift()!
    const lk = localKey(lx, ly, lz)
    if (idToType(voxelMap[lk]) !== 'stone') continue
    voxelMap[lk] = oreId
    placed++
    for (let i = 0; i < 6 && placed < cfg.veinSize; i++) {
      const d = order[i]
      const nx = lx + NEIGHBOR_DX[d]
      const ny = ly + NEIGHBOR_DY[d]
      const nz = lz + NEIGHBOR_DZ[d]
      if (nx < 0 || nx >= CHUNK_SIZE || ny < 1 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE)
        continue
      const nk = localKey(nx, ny, nz)
      if (visited.has(nk)) continue
      visited.add(nk)
      if (idToType(voxelMap[nk]) === 'stone') queue.push([nx, ny, nz])
    }
  }
}

/**
 * Resolves effective Y range and density threshold for an ore at a column (biome-specific overrides).
 */
function getEffectiveOreParams(
  cfg: OreConfig,
  biome: Biome,
): { minY: number; maxY: number; peakY: number; densityThreshold: number } {
  const yOverride = cfg.biomeYOverride?.[biome]
  const minY = yOverride?.minY ?? cfg.minY
  const maxY = yOverride?.maxY ?? cfg.maxY
  const peakY = yOverride?.peakY ?? cfg.peakY
  const mult = cfg.biomeThresholdMultiplier?.[biome]
  const densityThreshold = mult != null ? cfg.densityThreshold * mult : cfg.densityThreshold
  return { minY, maxY, peakY, densityThreshold }
}

/**
 * Creates the ore feature. Runs after surface; replaces stone with ores using 3D density and triangular Y.
 * Uses biome-specific modifiers (Vanilla 1.20: more gold in badlands, more iron/coal in mountains).
 */
export function createOreFeature(deps: OreFeatureDeps): FeatureFn {
  const { oreDensityNoise3D } = deps
  return function oreFeature(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap, voxelMap } = ctx

    for (const cfg of ORE_CONFIGS) {
      const veinCenters: [number, number, number][] = []
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const topY = heightmap[lx][lz]
          const biome = biomeMap[lx][lz]
          const subsurfaceDepth = BIOME_REGISTRY[biome].blocks.subsurfaceDepth
          const stoneTop = topY - subsurfaceDepth
          const { minY, maxY, peakY, densityThreshold } = getEffectiveOreParams(cfg, biome)
          for (let ly = Math.max(1, minY); ly < stoneTop && ly <= maxY && ly < WORLD_HEIGHT; ly++) {
            const lk = localKey(lx, ly, lz)
            if (idToType(voxelMap[lk]) !== 'stone') continue
            const wx = worldX + lx
            const wz = worldZ + lz
            const density = oreDensityNoise3D(
              wx * cfg.noiseScale,
              ly * cfg.noiseScale,
              wz * cfg.noiseScale,
            )
            const tri = triangularWeight(ly, minY, maxY, peakY)
            if (density * tri > densityThreshold) veinCenters.push([lx, ly, lz])
          }
        }
      }
      veinCenters.sort((a, b) => {
        const ka = localKey(a[0], a[1], a[2])
        const kb = localKey(b[0], b[1], b[2])
        return ka - kb
      })
      for (const [lx, ly, lz] of veinCenters) {
        const lk = localKey(lx, ly, lz)
        if (idToType(voxelMap[lk]) !== 'stone') continue
        placeVein(ctx, cfg, lx, ly, lz)
      }
    }
  }
}
