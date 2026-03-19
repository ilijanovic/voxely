/**
 * Biome registry: aggregates terrain params and layer config from per-biome files.
 * To add a new biome: add it to Biome in types.ts, create biomes/<name>.ts, then register in registry.ts.
 */
import type { Biome } from '../../types'
import type { TerrainParams, LayerConfig } from './types'
import { BIOME_REGISTRY } from './registry'

export {
  BIOME_REGISTRY,
  getBiomeByClimate,
  getLandBiomeByClimate,
  getLandBiomeByMultiNoise,
  getLandBiomeBlendByMultiNoise,
  getBiomeByMultiNoise,
  getPeakBiomeByMultiNoise,
} from './registry'
export { getLandBiomeBlendByClimate } from './registry'

/** Derived from BIOME_REGISTRY for backward compatibility. */
export const BIOME_TERRAIN: Record<Biome, TerrainParams> = Object.fromEntries(
  (Object.entries(BIOME_REGISTRY) as [Biome, (typeof BIOME_REGISTRY)[Biome]][]).map(([b, def]) => [
    b,
    def.terrainParams,
  ]),
) as Record<Biome, TerrainParams>

/** Derived from BIOME_REGISTRY for backward compatibility (surface, subsurface, subsurfaceDepth). */
export const BIOME_LAYERS: Record<Biome, LayerConfig> = Object.fromEntries(
  (Object.entries(BIOME_REGISTRY) as [Biome, (typeof BIOME_REGISTRY)[Biome]][]).map(([b, def]) => [
    b,
    {
      surface: def.blocks.surface,
      subsurface: def.blocks.subsurface,
      subsurfaceDepth: def.blocks.subsurfaceDepth,
    },
  ]),
) as Record<Biome, LayerConfig>

/** Numeric value per biome for sampling (e.g. macro terrain). Default 6 when not listed. */
const BIOME_VALUE_OVERRIDES: Partial<Record<Biome, number>> = {
  ocean: 0,
  desert: 0,
  plains: 1,
  savanna: 2,
  forest: 3,
  jungle: 4,
  mountain: 5,
}
const DEFAULT_BIOME_VALUE = 6
export const BIOME_VALUE: Record<Biome, number> = Object.fromEntries(
  (Object.keys(BIOME_REGISTRY) as Biome[]).map((b) => [b, BIOME_VALUE_OVERRIDES[b] ?? DEFAULT_BIOME_VALUE]),
) as Record<Biome, number>
