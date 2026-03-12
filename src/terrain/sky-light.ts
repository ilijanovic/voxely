/**
 * Sky light propagation: computes light level 0–15 per block from the top down.
 * Opaque blocks block light; air and water let it through (Minecraft-style).
 * Pure logic, no THREE/DOM.
 */
import { CHUNK_SIZE, WORLD_HEIGHT } from '../constants'
import { idToType, localKey } from './block-ids'
import type { BlockType } from '../types'

const SKY_LIGHT_MAX = 15

/** Block types that do not block sky light (light passes through). */
const TRANSPARENT_FOR_SKY: Set<string> = new Set([
  'air',
  'water_source',
  'water_flowing_1',
  'water_flowing_2',
  'water_flowing_3',
  'water_flowing_4',
  'water_flowing_5',
  'water_flowing_6',
  'water_flowing_7',
])

/**
 * Returns true if the block type blocks sky light (opaque). Used for propagation.
 */
function isOpaqueForSkyLight(blockType: BlockType | string): boolean {
  return !TRANSPARENT_FOR_SKY.has(blockType)
}

/**
 * Fills a sky light buffer from the voxel buffer: top-down propagation per column.
 * Light starts at 15 at y = WORLD_HEIGHT - 1 and decreases by 1 per block downward;
 * opaque blocks reset to 0.
 *
 * @param voxelBuffer Flat buffer of block IDs (terrain localKey layout).
 * @returns New Uint8Array of sky light 0–15, same length as voxelBuffer.
 */
export function computeSkyLightBuffer(voxelBuffer: Uint8Array): Uint8Array {
  const out = new Uint8Array(voxelBuffer.length)
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let light = SKY_LIGHT_MAX
      for (let ly = WORLD_HEIGHT - 1; ly >= 0; ly--) {
        const lk = localKey(lx, ly, lz)
        const type = idToType(voxelBuffer[lk])
        if (isOpaqueForSkyLight(type)) {
          light = 0
        }
        out[lk] = light
        if (light > 0) light = Math.max(0, light - 1)
      }
    }
  }
  return out
}
