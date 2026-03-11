/**
 * Stage 5: Paint structure templates (village, temple) into the chunk.
 * Runs after Stage 4 features so structures can override terrain.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants'
import { localKey, typeToId } from '../block-ids'
import type { ChunkContext, PipelineStage } from '../pipeline-types'
import { getStructureOriginsInChunk } from '../structures/origins'
import { getVillageBlocks } from '../structures/templates/village'
import { getTempleBlocks } from '../structures/templates/temple'

const VILLAGE_HOUSE_WIDTH_X = 5
const VILLAGE_HOUSE_WIDTH_Z = 4
const TEMPLE_SIZE = 6

export interface Stage5StructuresDeps {
  seed: number
  getHeight: (x: number, z: number) => number
  getResolvedBiome: (x: number, z: number) => import('../../types').Biome
}

export function createStage5Structures(deps: Stage5StructuresDeps): PipelineStage {
  const { seed, getHeight, getResolvedBiome } = deps

  return function stage5Structures(ctx: ChunkContext): void {
    const { chunkX, chunkZ, worldX, worldZ, voxelMap } = ctx
    const origins = getStructureOriginsInChunk(seed, chunkX, chunkZ, getHeight, getResolvedBiome)

    for (const origin of origins) {
      const blocks =
        origin.type === 'village'
          ? getVillageBlocks(
              origin.ox - Math.floor(VILLAGE_HOUSE_WIDTH_X / 2),
              origin.oy,
              origin.oz - Math.floor(VILLAGE_HOUSE_WIDTH_Z / 2),
            )
          : getTempleBlocks(
              origin.ox - Math.floor(TEMPLE_SIZE / 2),
              origin.oy,
              origin.oz - Math.floor(TEMPLE_SIZE / 2),
            )

      for (const { bx, by, bz, block } of blocks) {
        if (by < 0 || by >= WORLD_HEIGHT) continue
        if (bx < worldX || bx >= worldX + CHUNK_SIZE) continue
        if (bz < worldZ || bz >= worldZ + CHUNK_SIZE) continue
        const lx = bx - worldX
        const lz = bz - worldZ
        voxelMap[localKey(lx, by, lz)] = typeToId(block)
      }
    }
  }
}
