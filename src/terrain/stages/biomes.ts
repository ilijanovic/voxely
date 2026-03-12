/**
 * Stage 5 (biomes): Biome per column. Fills context.biomeMap using ctx.heightmap and climate.
 */
import type { Biome } from '../../types'
import { CHUNK_SIZE } from '../../constants'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

export interface BiomesStageDeps {
  getBaseBiomeAt(x: number, z: number): Biome
  getResolvedBiomeFromHeight(base: Biome, height: number, x: number, z: number): Biome
  /** When provided, overrides procedural biome for (x,z) inside placed POIs. */
  getPoiBiomeOverride?(x: number, z: number): Biome | null
}

/**
 * Creates the biomes stage: fills biomeMap from heightmap (already set by noise stage) and climate.
 */
export function createStageBiomes(deps: BiomesStageDeps): PipelineStage {
  const { getBaseBiomeAt, getResolvedBiomeFromHeight, getPoiBiomeOverride } = deps

  return function stageBiomes(ctx: ChunkContext): void {
    const { worldX, worldZ, heightmap, biomeMap } = ctx
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = worldX + lx
        const wz = worldZ + lz
        const height = heightmap[lx][lz]
        const override = getPoiBiomeOverride?.(wx, wz)
        if (override !== undefined && override !== null) {
          biomeMap[lx][lz] = override
        } else {
          const base = getBaseBiomeAt(wx, wz)
          biomeMap[lx][lz] = getResolvedBiomeFromHeight(base, height, wx, wz)
        }
      }
    }
  }
}
