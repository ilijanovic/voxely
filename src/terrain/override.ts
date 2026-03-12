/**
 * Default pipeline override hook. Edit this file to inject custom logic before/after each stage.
 * Used when createChunkGenerator is called without options.override (e.g. in the chunk worker).
 *
 * Examples (uncomment or adapt in the function below):
 *
 * 1) Flatten heightmap after noise (e.g. test flat world):
 *    if (stageName === 'noise' && phase === 'after') {
 *      const flatY = 64
 *      for (let lx = 0; lx < 16; lx++)
 *        for (let lz = 0; lz < 16; lz++) ctx.heightmap[lx][lz] = flatY
 *    }
 *
 * 2) Force a biome in the centre of the chunk (after biomes stage):
 *    if (stageName === 'biomes' && phase === 'after') {
 *      ctx.biomeMap[8][8] = 'plains'
 *    }
 *
 * 3) Place a block after features (import localKey, typeToId from './block-ids'):
 *    if (stageName === 'features' && phase === 'after') {
 *      const ly = 10  // local Y (0 = world WORLD_MIN_Y)
 *      ctx.voxelMap[localKey(8, ly, 8)] = typeToId('stone')
 *    }
 *
 * Stage names: empty, structures_starts, structures_references, noise, biomes, carvers,
 * surface, features, initialize_light, light, spawn, full.
 */
import { CHUNK_SIZE } from '../constants'
import type { PipelineOverrideHook } from './pipeline-types'
// import { localKey, typeToId } from './block-ids'  // for example 3

/** World Y of the surface in super-flat mode. Change to tune flat height. */
const SUPER_FLAT_SURFACE_Y = 64

/** No-op by default; set SUPER_FLAT to true for a flat world. */
const SUPER_FLAT = false

/** No-op by default; mutate ctx in place to affect the pipeline. */
export const override: PipelineOverrideHook = (ctx, phase, _stageIndex, stageName) => {
  if (!SUPER_FLAT) return
  if (stageName === 'noise' && phase === 'after') {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        ctx.heightmap[lx][lz] = SUPER_FLAT_SURFACE_Y
      }
    }
  }
}
