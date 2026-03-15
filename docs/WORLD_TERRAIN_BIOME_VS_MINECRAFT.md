# World / Terrain / Biome Logic: Voxely vs. Minecraft

This document compares Voxely’s world, terrain, and biome logic with **Minecraft (1.18+)**. The architecture is intentionally Minecraft-aligned (multi-noise climate, staged pipeline, surface rules). Main differences: 2D heightmap instead of 3D density, no cave biomes.

Related: [TERRAIN_SPEC.md](./TERRAIN_SPEC.md), [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md), [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md).

---

## 1. Pipeline order (stages)

| Minecraft (1.18+)     | Voxely                                                       |
| ---------------------- | ------------------------------------------------------------ |
| Biomes (multi-noise)   | **structures_starts** → **noise** (heightmap) → **biomes**   |
| Terrain (density)      | (Height in noise stage from biome blend)                     |
| Carvers                | **carvers** (3D, cheese, spaghetti)                          |
| Surface                | **surface** (stratigraphy + surface rules)                   |
| Features               | **features** (trees, ore, decor) + structures                |

Voxely uses a **12-stage pipeline** with the same logical steps (noise/shape → biomes → carving → surface → features). The exact order differs: Voxely computes the **heightmap** first from the **biome blend** (climate), then assigns **biome per column** from height + climate. That is consistent with “climate drives shape and biome.”

---

## 2. Climate and biome selection

**Aligned with Minecraft:**

- **Climate parameters:** Temperature, humidity, continentalness, erosion, weirdness — all from deterministic, seed-based noise ([src/terrain/climate-sampler.ts](../src/terrain/climate-sampler.ts)).
- **Domain warping:** Position is warped for temp/humidity sampling so biome boundaries are not grid-aligned (see [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md)).
- **Biome selection:** Nearest-match in climate space (Voronoi-like):
  - 2D: `getLandBiomeByClimate(temp, humidity)` with **rarity weights** (plains/forest more common, jungle/badlands rarer) — [src/terrain/biomes/registry.ts](../src/terrain/biomes/registry.ts).
  - 6D: Optional `getLandBiomeByMultiNoise(continentalness, erosion, temperature, humidity, weirdness, y)` for peaks/variants.
- **Ocean:** Via **continentalness** threshold + **coast blend band** (smooth land/ocean transition) — [src/terrain/index.ts](../src/terrain/index.ts) `getBiomeBlendAt`.
- **Height resolution:** From a “base” biome (e.g. mountain, snow), **height** selects sub-biomes: meadow, grove, snowy_slopes, frozen_peaks, jagged_peaks, stony_peaks, windswept_hills/forest/gravelly — `getResolvedBiomeFromHeight` in [src/terrain/index.ts](../src/terrain/index.ts). Cold high elevations (not only mountain/snow) can become grove/snowy_slopes/frozen_peaks (temperature + height).

This matches Minecraft 1.18 style: climate clustering, weighted rarity, height for mountain/peak variants.

---

## 3. Terrain shape

| Minecraft 1.18+                                      | Voxely                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **3D density function** density(x,y,z); solid if > 0 | **2D heightmap** per column (x,z) → y                                                  |
| Overhangs / underhangs possible                      | No true overhangs from base terrain                                                    |
| Shape can depend on biome                            | Height from **biome blend** (BIOME_TERRAIN: baseOffset, detailAmp, flatness, mountainAllowed) |

Voxely builds **height** from:

- Base + macro term
- **fBm** (multiple octaves, lacunarity/persistence) for detail
- Mountain mask + mountain height noise (only where `mountainAllowed`)
- Weirdness ridge term, erosion

Conceptually this is close to Minecraft (multi-scale noise, same controls); geometrically it is reduced to a 2D heightmap — no 3D density, so no overhangs from terrain.

---

## 4. Surface rules

**Very similar to Minecraft:**

- **Stratigraphy** per column: bedrock → stone → subsurface (depth per biome) → **surface** (biome-dependent). Water level and **shore** band are handled — [src/terrain/stages/stratigraphy.ts](../src/terrain/stages/stratigraphy.ts).
- **Surface block resolution** is centralized in [src/terrain/surface-resolver.ts](../src/terrain/surface-resolver.ts) (`resolveSurfaceBlock`). Worker and main-thread `game-terrain.getSurfaceBlockAt` use it so logic stays in sync. Order: underwater → shore → coast blend (dither) → land boundary dither → surface rules.
- **Surface rules** in [src/terrain/surface-rules.ts](../src/terrain/surface-rules.ts):
  - Stone above certain height (mountain/windswept/meadow vs global, with biome exemptions).
  - frozen_peaks: packed_ice/ice by height/slope/noise, else snow.
  - jagged_peaks / snowy_slopes: stone on steep slope.
  - Snow at altitude → grass_snow; savanna → grass_savanna; snow neighbor → grass_snow.
  - **Badlands banding:** noise-based bands (red_sand, sandstone, orange/yellow/red/white terracotta). Subsurface: top 2 layers below surface use the same band noise ([stratigraphy](../src/terrain/stages/stratigraphy.ts) with `getSubsurfaceBlock`).

Biome block sets (surface, subsurface, shore, underwater) come from [BIOME_REGISTRY](../src/terrain/biomes/registry.ts) and per-biome files — analogous to Minecraft surface rules.

---

## 5. Carvers (caves)

| Minecraft                          | Voxely                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Noise caves (“cheese”, “spaghetti”) | **carve-3d**, **carve-cheese**, **carve-spaghetti** — [src/terrain/stages/carvers.ts](../src/terrain/stages/carvers.ts) |
| Worm carvers (canyons/caves)       | **carve-worm** — [src/terrain/stages/carve-worm.ts](../src/terrain/stages/carve-worm.ts); wired in pipeline when `worm` deps provided |

Carving is deterministic and uses height/neighbors (e.g. `getHeightAt`) for consistent surfaces. No cave biomes (no 3D biome in depth).

---

## 6. Features and structures

- **Features:** Trees, ferns, flowers, ground cover, desert decor, shore vegetation, mushrooms, bamboo, etc. — per biome via [src/terrain/features/feature-registry.ts](../src/terrain/features/feature-registry.ts) and density rules.
- **Structures:** Villages/temples via **structure origins** ([src/terrain/structures/origins.ts](../src/terrain/structures/origins.ts)), using `getHeight` and `getResolvedBiome`; POI flatten and biome override for villages.

Same idea as Minecraft: features/structures by biome and height, deterministic.

---

## 7. Gaps and differences

- **3D density:** Terrain is a 2D heightmap; no overhangs from base shape.
- **Cave biomes:** No 3D biome assignment at depth (no Deep Dark etc.).
- **Biome map independent of blocks:** As in Minecraft — player block edits do not change the stored biome map (only overrides for POI).
- **Sub-biome / parentBiome:** Present in types ([src/terrain/biomes/types.ts](../src/terrain/biomes/types.ts)); not yet used in selection.
- **Continentalness and weirdness:** Aligned with vanilla: continentalness in **[-1.2, 1]** (see [climate-sampler.ts](../src/terrain/climate-sampler.ts), `getContinentalnessSigned`); ocean/land use `OCEAN_CONTINENTALNESS_THRESHOLD` (current value: `-0.32`). Weirdness in **[-2, 2]** via `WEIRDNESS_VANILLA_RANGE_SCALE` in [terrain/constants.ts](../src/terrain/constants.ts).

---

## Summary

World/terrain/biome logic is **the same kind as Minecraft**: seed-based, climate multi-noise, nearest-match with rarity, continentalness for ocean, height for mountain/peak variants, per-biome surface rules, stratigraphy, noise carvers (3D, cheese, spaghetti) and worm carver, features/structures by biome. **Main differences:** 2D heightmap instead of 3D density, no cave biomes. For a high-level “Minecraft-like” overview, see [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md), [TERRAIN_SPEC.md](./TERRAIN_SPEC.md), and [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md); this doc records the concrete code locations and deviations.
