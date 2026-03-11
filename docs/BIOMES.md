# Biomes Overview

Central reference for all Voxely biomes: list, selection logic, scale/size, and spawn behaviour.

Related docs:

- [TERRAIN_SPEC.md §5.7](TERRAIN_SPEC.md#57-biome-balance-and-distribution) – biome balance and distribution goals
- [BIOME_TRANSITIONS.md](BIOME_TRANSITIONS.md) – how biome boundaries and transitions work
- [PROJECT_MAP.md](PROJECT_MAP.md) – where biome code lives (`terrain/biomes/`)
- [PLAINS_BIOME.md](PLAINS_BIOME.md), [FOREST_BIOME_TECHNICAL.md](FOREST_BIOME_TECHNICAL.md), [DESERT_BIOME_TECHNICAL.md](DESERT_BIOME_TECHNICAL.md) – per-biome technical deep dives

---

## 1) All 18 biomes

| Biome | Category | Selection |
|-------|----------|-----------|
| plains | Base land | Climate (nearest-match in temp/humidity) |
| desert | Base land | Climate |
| savanna | Base land | Climate |
| forest | Base land | Climate |
| jungle | Base land | Climate |
| mountain | Base land | Climate |
| snow | Base land | Climate |
| ocean | Water | Continentalness < 0.44 |
| meadow | Highland variant | Height + noise in mountain/snow regions |
| grove | Highland variant | Height + noise in mountain/snow or cold upland |
| snowy_slopes | Highland variant | Height band in mountain/snow |
| frozen_peaks | Highland variant | Height + multi-noise |
| jagged_peaks | Highland variant | Height + multi-noise |
| stony_peaks | Highland variant | Height + multi-noise |
| cherry_grove | Highland variant | Height + highland variant noise |
| windswept_hills | Highland variant | Height + humidity/variant noise |
| windswept_forest | Highland variant | Height + humidity/variant noise |
| windswept_gravelly_hills | Highland variant | Height + highland variant noise |

**Base land (7)** are chosen by nearest-match in 2D climate (temperature, humidity). **Ocean** is chosen when continentalness (noise at `CONTINENTAL_SCALE`) is below 0.44. **Highland variants** appear mainly when the base biome is mountain or snow above certain world Y thresholds (see section 5); some variants (grove, snowy_slopes, frozen_peaks, windswept_*) can also appear for other bases at cold temperature and high elevation.

---

## 2) Climate bounds (base land)

Used for nearest-match selection. Ranges are in normalized [0, 1] (or 0–1 for temp/humidity after noise mapping).

| Biome | Temperature | Humidity |
|-------|-------------|----------|
| desert | 0.65 – 1.0 | 0 – 0.35 |
| plains | 0.45 – 0.7 | 0.25 – 0.5 |
| savanna | 0.55 – 0.75 | 0.35 – 0.55 |
| forest | 0.3 – 0.55 | 0.5 – 0.8 |
| jungle | 0.5 – 0.75 | 0.7 – 1.0 |
| mountain | 0.25 – 0.5 | 0.2 – 0.55 |
| snow | 0 – 0.35 | 0.2 – 0.6 |

Ocean has climate bounds in code but is **not** selected by climate; it is selected by continentalness in terrain sampling (`getBiome` in `terrain-sampling.ts` and equivalent in `terrain/index.ts`).

---

## 3) Biome size and scale

There is **no per-biome size**. All land biomes share the same climate noise; effective “patch size” is determined by global scales.

| Constant | Value | Role |
|---------|--------|------|
| TEMP_SCALE | 0.001 | Temperature noise frequency (XZ). Smaller = larger patches. |
| HUMIDITY_SCALE | 0.0012 | Humidity noise frequency (XZ). |
| CONTINENTAL_SCALE | 0.0012 | Continentalness (ocean vs land). |
| CLIMATE_WARP_SCALE | 0.0014 | Domain warp for climate sampling. |
| CLIMATE_WARP_AMP | 42 | Warp amplitude (blocks). Makes boundaries non-grid-aligned. |

Rough effective scale: climate changes meaningfully over **hundreds to ~1000 blocks** (wavelength on the order of 1/scale). Relative frequency of each base land biome depends on Voronoi-like nearest-match in climate space, not on a separate “size” parameter.

Defined in: `src/terrain-sampling.ts` and `src/terrain/index.ts`.

---

## 4) Spawn probability (“spawn in X”)

### Player spawn

- **Spawnable biomes:** exactly 7: `desert`, `plains`, `savanna`, `forest`, `jungle`, `mountain`, `snow`.
- **Probability per biome:** **1/7** when considering a random world (each world seed picks one of these with equal chance).
- **Per world:** the game picks a single spawn biome per seed (e.g. `SPAWN_BIOME` in `game-terrain.ts`). The player then spawns inside that biome (spiral search from origin).

Source: `src/game-terrain.ts` – `SPAWNABLE_BIOMES`, `SPAWN_BIOME`, `findSpawnInBiome`.

### Entity (mob) spawn

Which animals can spawn in which biomes (from `ANIMAL_DEFS` in `src/entities/spawn.ts`). No per-biome weight – only allow/deny per kind.

| Animal | Spawn biomes |
|--------|----------------|
| Sheep | plains, forest, jungle, meadow |
| Pig | plains, forest, jungle, meadow |
| Wolf | forest, jungle, mountain, snow, grove |

Spawn is deterministic per chunk and kind (seeded RNG). The world API’s `getBiome` is `getResolvedBiome`, so only positions whose **resolved** biome (including highland variants) is in that kind’s `spawnBiomes` list are allowed.

---

## 5) Highland variant logic (when variants appear)

Highland variants appear **mainly** when the **base** biome (from climate) is **mountain** or **snow**; the height bands below apply in that case. Some variants also appear for other bases at cold temperature and high elevation (see end of section). All height thresholds assume `WATER_LEVEL = 64` ([src/constants.ts](src/constants.ts)).

- **Mountain/snow base, height &lt; HIGHLAND_MEADOW_MAX (74):**  
  Highland variant noise and humidity decide: windswept_forest / windswept_hills, windswept_gravelly_hills, cherry_grove, or meadow.

- **Mountain/snow base, 74 ≤ height &lt; HIGHLAND_GROVE_MAX (84):**  
  Highland variant noise &gt; 0.82 → windswept_forest, else grove.

- **Mountain/snow base, 84 ≤ height &lt; HIGHLAND_SNOWY_SLOPES_MAX (94):**  
  snowy_slopes.

- **Mountain/snow base, height ≥ 94:**  
  Peak biomes: multi-noise (6D) picks frozen_peaks, jagged_peaks, or stony_peaks.

For **non–mountain/snow** base biomes, cold temperature can still trigger a few highland variants at high elevation:

- If base ≠ mountain/snow and **temp ≤ COLD_HIGHLAND_TEMP_MAX (0.42)** and height high enough: grove (≥ 84), snowy_slopes (≥ 94), or frozen_peaks (≥ 100).
- If base ≠ mountain/snow and **temp ≤ COLD_UPLAND_TEMP_MAX (0.5)** and height ≥ HIGHLAND_MEADOW_MAX + 4 (78): windswept_forest or windswept_hills (by humidity ≥ WINDSWEPT_FOREST_HUMIDITY_MIN = 0.55).

Constants: `src/terrain-sampling.ts` (e.g. `HIGHLAND_MEADOW_MAX`, `HIGHLAND_GROVE_MAX`, `HIGHLAND_SNOWY_SLOPES_MAX`, `PEAK_Y_MIN`, `PEAK_Y_RANGE`) and `getResolvedBiome`.
