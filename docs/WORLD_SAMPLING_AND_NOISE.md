# World Sampling and Noise – Configuration and Implementation

This document describes how **world sampling** and **noise** are configured and used during world generation, and how **worker** (chunk generator) and **main thread** (terrain sampling) stay in sync.

Related: [TERRAIN_SPEC.md](./TERRAIN_SPEC.md), [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md), [WORLD_TERRAIN_BIOME_VS_MINECRAFT.md](./WORLD_TERRAIN_BIOME_VS_MINECRAFT.md).

---

## 1. Configuration (single source of truth)

### 1.1 Terrain and climate constants

All shared terrain/climate constants live in **[src/terrain/constants.ts](../src/terrain/constants.ts)**. Both the chunk generator (worker) and main-thread terrain sampling import from here so values cannot drift.

| Constant | Purpose |
|----------|---------|
| `CLIMATE_PARAM_SCALE` | Horizontal scale for temperature, humidity, continentalness (e.g. 0.0012). |
| `CLIMATE_WARP_SCALE`, `CLIMATE_WARP_AMP` | Domain warp for climate (Minecraft-style; reduces grid-aligned biome edges). |
| `OCEAN_CONTINENTALNESS_THRESHOLD`, `COAST_BLEND_BAND` | Ocean vs land and coast blend. |
| `EROSION_SCALE`, `EROSION_AMPLITUDE`, `EROSION_JAGGEDNESS_START`, `EROSION_DETAIL_BOOST_MAX` | Erosion noise and terrain jaggedness. |
| `MOUNTAIN_*`, `WEIRDNESS_*` | Mountain mask/height and weirdness ridge. |
| `HEIGHT_DETAIL_OCTAVES`, `HEIGHT_DETAIL_LACUNARITY`, `HEIGHT_DETAIL_PERSISTENCE`, `HEIGHT_DETAIL_FBM_NORMALIZE` | fBm policy for terrain detail (multi-octave noise). |
| `FLAT_NOISE_SCALE` | Flatness noise frequency. |
| `HIGHLAND_MEADOW_MAX`, `HIGHLAND_GROVE_MAX`, `HIGHLAND_SNOWY_SLOPES_MAX`, `HIGHLAND_VARIANT_SCALE` | Height bands for highland/peak sub-biomes. |
| `SPAWN_ORIGIN_FOREST_*` | Bias toward forest at world origin. |
| `FEATURE_PLACEMENT_NOISE_SCALE` | Default scale for feature placement noise (e.g. 0.05). |
| `NOISE_COORD_WRAP` | Optional coord wrap for very large worlds (Far Lands); not yet applied in pipeline. |

### 1.2 Global constants

**[src/constants.ts](../src/constants.ts)** defines:

- `WATER_LEVEL`, `WORLD_HEIGHT` – used for height clamping and water.
- `MIN_CAVE_DEPTH_BELOW_SURFACE` – minimum solid blocks between cave ceiling and surface (e.g. 5).

### 1.3 Carver and cave tuning

**[src/terrain/constants.ts](../src/terrain/constants.ts)** defines Minecraft-aligned carver constants:

- **3D noise caves:** `CAVE_THRESHOLD = 0.56` (carve where `caveNoise3D(wx, wy, wz) > threshold`). Noise is sampled at **raw world coordinates** (1 block = 1 unit).
- **Cheese caves:** `CHEESE_SCALE_XZ = 0.03`, `CHEESE_SCALE_Y = 0.02`, `CHEESE_THRESHOLD = 0.27`; noise is sampled at `(wx * scaleXZ, wy * scaleY, wz * scaleXZ)` (vanilla xz/y scale ratio). Optional `caveDensityFactor(y)` for sloped_cheese (more caves at mid depth).

Spaghetti and worm parameters (radius, cellSize, steps, maxY, etc.) are set where the pipeline is wired in [src/terrain/index.ts](../src/terrain/index.ts).

---

## 2. Noise setup and seeds

### 2.1 Deterministic RNG

**[src/terrain/utils.ts](../src/terrain/utils.ts)** exports `makeSeededRandom(seed)`, which returns a function that yields a deterministic sequence in `[0, 1)`. Implementation is a simple LCG. Same seed ⇒ same sequence; used for all simplex-noise constructors and for spaghetti/worm carver randomness.

### 2.2 Seed offsets (worker and main thread)

Worker ([src/terrain/index.ts](../src/terrain/index.ts)) and main-thread sampling ([src/terrain-sampling.ts](../src/terrain-sampling.ts)) use **identical seed offsets** for shared noise so that height and biome match:

| Purpose | Seed offset | Used in |
|--------|-------------|--------|
| Temperature | 500 | Climate sampler |
| Humidity | 600 | Climate sampler |
| Continentalness | 123 | Climate sampler |
| Climate warp | 31337 | Climate sampler |
| Terrain detail (fBm) | 456 | Height |
| Mountain mask | 789 | Height |
| Mountain height | 101 | Height |
| Highland variant | 1717 | Biome resolution |
| Erosion | 202 | Climate + height |
| Flatness | 303 | Height |
| Weirdness | 909 | Climate + height |
| Height transition | 4242 | Biome height bands |

Both sides create 2D simplex noise with `createNoise2D(makeSeededRandom(seed + offset))` (worker uses `simplex-noise` directly; terrain-sampling uses a small `createNoise(seed)` wrapper that does the same).

### 2.3 Worker-only noise

These exist only in the worker (no main-thread equivalent):

- Forest density: 777  
- Tree placement: 888  
- Tree shape: 999  
- 3D cave: 400  
- 3D cheese: 401  
- Feature placement: `getFeatureNoise(seedOffset)` – each feature uses a distinct `seedOffset`; internally `createNoise2D(makeSeededRandom(seed + seedOffset))`, returns `(x,z) => (noise(x,z)+1)*0.5`.

### 2.4 Climate sampler

**[src/terrain/climate-sampler.ts](../src/terrain/climate-sampler.ts)** takes six 2D noise functions (temperature, humidity, continentalness, climate warp, erosion, weirdness) and exposes:

- `getTemperature01`, `getHumidity01`, `getContinentalness01` (range [0,1]).
- `getTemperatureSigned`, `getHumiditySigned`, `getErosionSigned`, `getWeirdnessSigned` (range [-1,1]).

Temperature and humidity are sampled at a **warped** position (`getClimateWarpedPos`) so biome boundaries are not block-aligned. Continentalness is **not** warped so coast shapes stay stable.

---

## 3. Height and biome implementation

### 3.1 Height formula (parity between worker and main thread)

Both worker and main thread use the same logical steps:

1. **Biome blend** at (x,z): continentalness (smoothed) + spawn-origin bias → ocean/land blend; land from multi-noise or 2D climate (same `USE_MULTI_NOISE_BASE_SELECTION` and thresholds).
2. **Terrain params** from blend: `baseOffset`, `detailAmp`, `detailFreq`, `flatness`, `mountainAllowed` interpolated by blend weight `t`.
3. **Macro term:** `getMacroTerrain(x,z)` – continentalness bands (e.g. c &lt; 0.3 → -18, … 0.75–0.95 → 14–22). Same in both.
4. **Detail (fBm):** Multi-octave detail noise with `HEIGHT_DETAIL_*` constants, flatness noise, erosion-based jaggedness boost.
5. **Mountain:** Mask and height noise, only where `mountainAllowed`; mountain/snow biome height boost.
6. **Weirdness ridge:** `ridge² * WEIRDNESS_RIDGE_AMP`.
7. **Erosion:** Subtract `getErosion(x,z)` (smoothstepped erosion amplitude).
8. **Smoothing:** Raw height is computed at (x,z); then a **3×3 kernel** (center 0.25, cardinals 0.125, corners 0.0625) is applied. Worker uses this for `getHeightUncached`; main thread uses `getSmoothedHeight`. Final height is clamped to `[0, WORLD_HEIGHT]` and floored.

Main-thread API: `createTerrainSampling(seed)` → `getSmoothedHeight(x,z)`, `getResolvedBiome(x, z, getHeight)`. The game uses a **column height cache** and passes `getHeight` into `getResolvedBiome` so the main thread does not recompute height for every query.

### 3.2 Biome resolution from height

After a **base** biome (e.g. ocean, plains, mountain) is chosen from climate/blend, **height** is used to resolve sub-biomes (e.g. mountain → meadow, grove, snowy_slopes, frozen_peaks, jagged_peaks, stony_peaks). Logic lives in `getResolvedBiomeFromHeight` (worker) and is mirrored in terrain-sampling’s `getResolvedBiome`. Both use `getHeightTransitionOffset` (noise at `HEIGHT_TRANSITION_SCALE`) to soften height cutoffs.

### 3.3 Parity test

**[src/terrain-sampling.test.ts](../src/terrain-sampling.test.ts)** contains a test that compares pipeline `getHeight(x,z)` with `createTerrainSampling(seed).getSmoothedHeight(x,z)` (clamped to integer) for the same seed and a grid of points. This guards worker/main-thread height parity.

---

## 4. Carvers

- **carve-3d:** Uses `caveNoise3D(wx, wy, wz)` at **unscaled** world coordinates; carve where value &gt; `carveThreshold`. Edge capping uses `getHeightAt` at chunk boundaries.
- **carve-cheese:** Uses `cheeseNoise3D(wx*scale, wy*scale, wz*scale)`; carve where value &gt; effective threshold (threshold divided by optional `caveDensityFactor(y)`).
- **carve-spaghetti:** Deterministic random-walk paths per grid cell; RNG from `makeSeededRandom(seed + gx*7901 + gz*7919)` (spaghetti) or similar.
- **carve-worm:** Optional; RNG from `makeSeededRandom(seed + WORM_SEED_OFFSET + gx*7907 + gz*7927)` for start roll and path. When enabled in the pipeline, worm carvers run after spaghetti.

---

## 5. Feature placement noise

Features (trees, flowers, ferns, desert decor, shore vegetation, etc.) receive `getFeatureNoise` in the pipeline context. Each feature uses a **distinct seed offset** (e.g. `FLOWER_PLACE_NOISE_SEED`, `CACTUS_NOISE_SEED`). Sampling uses **FEATURE_PLACEMENT_NOISE_SCALE** (0.05) so placement is deterministic and patchy. See [src/terrain/features/](../src/terrain/features/) for per-feature usage.

---

## 6. Consistency notes

- **CAVE_THRESHOLD, CHEESE_***: Single source of truth in [src/terrain/constants.ts](../src/terrain/constants.ts); imported by the worker and by [src/game-terrain.ts](../src/game-terrain.ts) (debug “spawn above cave”).
- **makeSeededRandom:** Single implementation in [src/terrain/utils.ts](../src/terrain/utils.ts); game-terrain imports it so seeds stay consistent.
- **NOISE_COORD_WRAP / wrapNoiseCoord:** Intended for very large coordinates to avoid floating-point drift. Not yet used in the generation pipeline; only relevant when supporting very large worlds.

---

## 7. Summary

- **Configuration:** Terrain/climate in `terrain/constants.ts`; world/water/cave depth in `constants.ts`; carver thresholds and scales inline in `terrain/index.ts`.
- **Noise:** Same seed offsets and formulas in worker and main thread for height and biome; simplex-noise + makeSeededRandom throughout.
- **Height/biome:** Same blend, macro, fBm, mountain, ridge, erosion, and smoothing on both sides; parity test in terrain-sampling.test.ts.
- **Carvers:** 3D noise (unscaled and scaled for cheese), spaghetti, and optional worm; all deterministic from world seed and coordinates.
