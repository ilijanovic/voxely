/**
 * Stratigraphy with optional aquifer filling for carved cave pockets.
 * Keeps the existing terrain layering behavior while allowing a vanilla-like
 * water fill pass in underground cavities.
 */
import type { BlockType } from '../../types'
import { CHUNK_SIZE, WATER_LEVEL, WORLD_HEIGHT, WORLD_MIN_Y } from '../../constants'
import { localKey, typeToId, CARVED_ID } from '../block-ids'
import { BIOME_REGISTRY } from '../biomes'
import type { ChunkContext, PipelineStage } from '../pipeline-types'

/**
 * Returns true when a column top should use shore material.
 */
function isShore(topY: number): boolean {
  return topY >= WATER_LEVEL - 1 && topY <= WATER_LEVEL + 1
}

export interface FidelityStage3Deps {
  /** Optional: return surface block for column (lx, lz), e.g. grass_snow at snow boundaries. */
  getSurfaceBlock?: (ctx: ChunkContext, lx: number, lz: number) => BlockType
  /**
   * Optional: return subsurface block for (lx, lz, ly). When non-null, overrides def.blocks.subsurface.
   */
  getSubsurfaceBlock?: (ctx: ChunkContext, lx: number, lz: number, ly: number) => BlockType | null
  /**
   * Optional aquifer hook for carved cells.
   * Called only for CARVED_ID cells below column top. Return null to keep air.
   */
  getAquiferBlock?: (
    ctx: ChunkContext,
    lx: number,
    lz: number,
    ly: number,
    worldY: number,
  ) => BlockType | null
}

/**
 * Creates the fidelity stratigraphy stage.
 */
export function createFidelityStage3(deps?: FidelityStage3Deps): PipelineStage {
  const getSurfaceBlock = deps?.getSurfaceBlock
  const getSubsurfaceBlock = deps?.getSubsurfaceBlock
  const getAquiferBlock = deps?.getAquiferBlock

  return function stage3Stratigraphy(ctx: ChunkContext): void {
    const { heightmap, biomeMap, voxelMap } = ctx
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const topY = heightmap[lx][lz]
        const biome = biomeMap[lx][lz]
        const def = BIOME_REGISTRY[biome]
        const blocks = def.blocks
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          const worldY = WORLD_MIN_Y + ly
          if (worldY > topY) break
          const lk = localKey(lx, ly, lz)
          if (voxelMap[lk] === CARVED_ID) {
            const aquifer = getAquiferBlock?.(ctx, lx, lz, ly, worldY)
            if (aquifer != null) voxelMap[lk] = typeToId(aquifer)
            continue
          }
          if (voxelMap[lk] !== 0) continue
          let block: string
          if (ly === 0) {
            block = 'bedrock'
          } else if (worldY === topY) {
            if (topY < WATER_LEVEL) block = blocks.underwater
            else if (getSurfaceBlock) block = getSurfaceBlock(ctx, lx, lz)
            else if (isShore(topY)) block = blocks.shore
            else block = blocks.surface
          } else if (worldY >= topY - blocks.subsurfaceDepth) {
            const override = getSubsurfaceBlock?.(ctx, lx, lz, ly)
            block = override ?? blocks.subsurface
          } else {
            block = 'stone'
          }
          voxelMap[lk] = typeToId(block as BlockType)
        }
      }
    }
  }
}
