/**
 * Biome registry: aggregates terrain params and layer config from per-biome files.
 * To add a new biome: add it to Biome in types.ts, create biomes/<name>.ts, then register in registry.ts.
 */
import type { Biome } from "../../types";
import type { TerrainParams, LayerConfig } from "./types";
import { BIOME_REGISTRY } from "./registry";

export { BIOME_REGISTRY, getBiomeByClimate, getLandBiomeByClimate, getBiomeByMultiNoise } from "./registry";

/** Derived from BIOME_REGISTRY for backward compatibility. */
export const BIOME_TERRAIN: Record<Biome, TerrainParams> = Object.fromEntries(
  (Object.entries(BIOME_REGISTRY) as [Biome, (typeof BIOME_REGISTRY)[Biome]][])
    .map(([b, def]) => [b, def.terrainParams])
) as Record<Biome, TerrainParams>;

/** Derived from BIOME_REGISTRY for backward compatibility (surface, subsurface, subsurfaceDepth). */
export const BIOME_LAYERS: Record<Biome, LayerConfig> = Object.fromEntries(
  (Object.entries(BIOME_REGISTRY) as [Biome, (typeof BIOME_REGISTRY)[Biome]][])
    .map(([b, def]) => [
      b,
      {
        surface: def.blocks.surface,
        subsurface: def.blocks.subsurface,
        subsurfaceDepth: def.blocks.subsurfaceDepth,
      },
    ])
) as Record<Biome, LayerConfig>;
