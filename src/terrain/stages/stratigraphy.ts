/**
 * Stage 3: Stratigraphy. Fill voxelMap from 0 to heightmap using BiomeRegistry blocks.
 * Only writes where voxelMap is empty (0); skips CARVED_ID (cave).
 * When getSurfaceBlock is provided, it overrides the surface block (e.g. grass_snow near snow biomes).
 */
import type { BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT } from '../../constants'
import { localKey, typeToId, CARVED_ID } from '../block-ids'
import { BIOME_REGISTRY } from '../biomes'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

function isShore(topY: number): boolean {
  return topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1
}

export interface Stage3Deps {
  /** Optional: return surface block for column (lx, lz), e.g. grass_snow at snow boundaries. */
  getSurfaceBlock?: (ctx: ChunkContext, lx: number, lz: number) => BlockType
}

export function createStage3(deps?: Stage3Deps): PipelineStage {
  const getSurfaceBlock = deps?.getSurfaceBlock

  return function stage3Stratigraphy(ctx: ChunkContext): void {
    const { heightmap, biomeMap, voxelMap } = ctx
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        const biome = biomeMap[lx][lz]
        const def = BIOME_REGISTRY[biome]
        const blocks = def.blocks
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          if (ly > topY) break
          const lk = localKey(lx, ly, lz)
          if (voxelMap[lk] === CARVED_ID) continue
          if (voxelMap[lk] !== 0) continue
          let block: string
          if (ly === 0) {
            block = 'bedrock'
          } else if (ly === topY) {
            if (topY < WATER_LEVEL) block = blocks.underwater
            else if (isShore(topY)) block = blocks.shore
            else block = getSurfaceBlock ? getSurfaceBlock(ctx, lx, lz) : blocks.surface
          } else if (ly >= topY - blocks.subsurfaceDepth) {
            block = blocks.subsurface
          } else {
            block = 'stone'
          }
          voxelMap[lk] = typeToId(block as BlockType)
        }
      }
    }
  }
}
