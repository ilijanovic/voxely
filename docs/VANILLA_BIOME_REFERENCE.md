# Vanilla Reference (Minecraft Java 1.20.2)

**Vanilla is the single authoritative reference for worldgen in this project.** All parameters for biomes, terrain (global noise), and caves are documented here from Minecraft Java 1.20.2. We align only what is clearly comparable (e.g. climate scales); the rest is recorded for reference and optional tuning.

**Sources:**
- Biomes: `https://assets.mcasset.cloud/1.20.2/data/minecraft/worldgen/biome/<id>.json`
- Terrain / caves: `worldgen/noise_settings/overworld.json` and `worldgen/density_function/overworld/` (depth, erosion, continents, caves/*, sloped_cheese, etc.)

Vanilla biome JSONs do **not** define surface/subsurface blocks; those come from the chunk generator's surface rules. Our [BiomeDefinition](src/terrain/biomes/types.ts) keeps its own blocks; this doc records vanilla climate and features for reference.

---

## 1. Simple biomes (climate-based)

| Biome id           | Temperature | Downfall | Has precipitation | Spawners (creature summary)              | Step 9 features (vegetation)                                                                 | Source |
|--------------------|-------------|----------|-------------------|------------------------------------------|----------------------------------------------------------------------------------------------|--------|
| plains             | 0.8         | 0.4      | true              | sheep, pig, chicken, cow, horse, donkey  | glow_lichen, patch_tall_grass_2, trees_plains, flower_plains, patch_grass_plain, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin | 1.20.2 plains.json |
| forest             | 0.7         | 0.8      | true              | sheep, pig, chicken, cow, wolf           | glow_lichen, forest_flowers, trees_birch_and_oak, flower_default, patch_grass_forest, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin | 1.20.2 forest.json |
| desert             | 2.0         | 0.0      | false             | rabbit                                   | glow_lichen, flower_default, patch_grass_badlands, patch_dead_bush_2, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane_desert, patch_pumpkin, patch_cactus_desert | 1.20.2 desert.json |
| savanna            | 2.0         | 0.0      | false             | sheep, pig, chicken, cow, horse, donkey | glow_lichen, patch_tall_grass, trees_savanna, flower_warm, patch_grass_savanna, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin | 1.20.2 savanna.json |
| jungle             | 0.95        | 0.9      | true              | sheep, pig, chicken, cow, parrot, panda | glow_lichen, bamboo_light, trees_jungle, flower_warm, patch_grass_jungle, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin, vines, patch_melon | 1.20.2 jungle.json |
| windswept_hills *  | 0.2         | 0.3      | true              | sheep, pig, chicken, cow, llama         | glow_lichen, trees_windswept_hills, flower_default, patch_grass_badlands, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin | 1.20.2 windswept_hills.json |
| snowy_plains **    | 0.0         | 0.5      | true              | rabbit, polar_bear                      | glow_lichen, trees_snowy, flower_default, patch_grass_badlands, brown_mushroom_normal, red_mushroom_normal, patch_sugar_cane, patch_pumpkin | 1.20.2 snowy_plains.json |

\* Used as reference for our **mountain** base biome (vanilla has no single "mountain" biome; windswept_hills is a cold, dry, hilly land biome).  
\** Used as reference for our **snow** base biome (vanilla: snowy_plains).

**Note:** Vanilla desert and savanna use `temperature: 2.0` (can exceed 1.0). Our climate uses normalized [0, 1]; map as needed (e.g. 2.0 → high end of our temp range).

---

## 2. Effects (optional – for atmosphere)

| Biome      | fog_color | sky_color | water_color | water_fog_color |
|------------|-----------|-----------|-------------|-----------------|
| plains     | 12638463  | 7907327   | 4159204     | 329011          |
| forest     | 12638463  | 7972607   | 4159204     | 329011          |
| desert     | 12638463  | 7254527   | 4159204     | 329011          |
| savanna    | 12638463  | 7254527   | 4159204     | 329011          |
| jungle     | 12638463  | 7842047   | 4159204     | 329011          |
| windswept_hills | 12638463 | 8233727 | 4159204     | 329011          |
| snowy_plains    | 12638463 | 8364543 | 4159204     | 329011          |

Optional `music` and `mood_sound` are present in some biomes (e.g. plains: none; forest: music.overworld.forest; desert: music.overworld.desert).

---

## 3. Multi-noise (vanilla code)

Biome **placement** in vanilla uses multi-dimensional noise (temperature, humidity/vegetation, continentalness, erosion, weirdness, depth). The numeric **ParameterRange** arrays are defined in Java code ([VanillaBiomeParameters](https://maven.fabricmc.net/docs/yarn-1.20.1+build.5/net/minecraft/world/biome/source/util/VanillaBiomeParameters.html)), not in biome JSONs.

- **Temperature bands (T0–T4):** e.g. frozen (T0), cold (T1), temperate (T2), warm (T3), hot (T4).
- **Humidity bands (H0–H4):** dry to very humid.
- **Continentalness:** deep ocean, ocean, coast, near/mid/far inland, mushroom fields.
- **Erosion:** low (mountains) to high (flat).
- **Weirdness:** valleys vs peaks.

Our game uses [climate bounds](docs/BIOMES.md) and optional [multiNoise](src/terrain/biomes/types.ts) (6D center + weights) for selection; we can align centers to vanilla bands when desired.

---

## 4. Effective surface blocks (vanilla behaviour)

Vanilla surface material is determined by chunk generator surface rules, not by the biome JSON. For reference, typical effective blocks:

| Our biome | Typical vanilla surface | Subsurface |
|-----------|-------------------------|------------|
| plains    | grass                   | dirt       |
| forest    | grass                   | dirt       |
| desert    | sand                    | sandstone  |
| savanna   | grass                   | dirt       |
| jungle    | grass                   | dirt       |
| mountain  | grass / stone (height)  | dirt / stone |
| snow      | snow / grass_snow       | dirt       |

Our [BIOME_REGISTRY](src/terrain/biomes/registry.ts) and per-biome files define these explicitly.

---

## 5. Terrain / noise (global)

Vanilla uses **one global** terrain pipeline; there are **no per-biome** terrain or noise parameters in biome JSONs. The overworld noise_router and density functions produce a single height/density field; biomes are then chosen via multi-noise and painted with surface rules.

**Vanilla overworld noise_router (terrain-relevant):**

| Router entry    | Density function / noise           | xz_scale | y_scale | Notes |
|-----------------|------------------------------------|----------|---------|--------|
| continents      | minecraft:overworld/continents     | 0.25     | 0.0     | shifted_noise |
| erosion         | minecraft:overworld/erosion        | 0.25     | 0.0     | shifted_noise |
| depth           | minecraft:overworld/depth          | –        | –       | y_clamped_gradient(-64→320) + offset |
| temperature     | minecraft:temperature              | 0.25     | 0.0     | shifted_noise |
| vegetation      | minecraft:vegetation               | 0.25     | 0.0     | shifted_noise |

Source: `noise_settings/overworld.json` and `density_function/overworld/erosion.json`, `continents.json`, etc.

**Our game:** We use a shared climate scale ([CLIMATE_PARAM_SCALE](src/terrain-sampling.ts) = 0.0012) for temperature, humidity, continentalness, and erosion so all vary on a similar scale (aligned with vanilla’s shared xz_scale 0.25 for these dimensions). Terrain **height** is then built from macro + per-biome [TerrainParams](src/terrain/biomes/types.ts) (baseOffset, detailAmp, detailFreq, flatness, mountainAllowed). Those per-biome params have **no** vanilla equivalent; they are game-specific and only documented here for context.

---

## 6. Caves

**Vanilla:** Biome JSONs list **carvers** under `carvers.air` (e.g. `minecraft:cave`, `minecraft:cave_extra_underground`, `minecraft:canyon`). These are type names only; actual cave **parameters** live in the overworld noise_router and density functions.

- **Cave systems in final_density:** Built from `sloped_cheese`, `caves/entrances`, `caves/noodle`, `caves/spaghetti_2d`, `caves/spaghetti_roughness_function`, `caves/pillars`, and cheese-style 3D noise (e.g. `cave_cheese`: add 0.27, noise `xz_scale: 1.0`, `y_scale: 0.666...`, then clamp).
- **Source:** `noise_settings/overworld.json` (final_density) and `density_function/overworld/caves/*`, `overworld/sloped_cheese`, etc.

**Our game (three carve stages):**

| Stage    | Purpose           | Parameters | Where defined |
|----------|-------------------|------------|----------------|
| carve-3d | 3D noise caves    | carveThreshold: 0.56, minDepthBelowSurface: [MIN_CAVE_DEPTH_BELOW_SURFACE](src/constants.ts) (5) | [terrain/index.ts](src/terrain/index.ts), [carve-3d.ts](src/terrain/stages/carve-3d.ts) |
| cheese   | Large caverns     | scale: 0.03 (vanilla-inspired; vanilla xz_scale 1.0), threshold: 0.27 (vanilla constant), minDepthBelowSurface: 5 | [terrain/index.ts](src/terrain/index.ts), [carve-cheese.ts](src/terrain/stages/carve-cheese.ts) |
| spaghetti| Worm tunnels      | radius: 1.5, cellSize: 48, steps: 32, maxY: WATER_LEVEL+48, minDepthBelowSurface: 5 | [terrain/index.ts](src/terrain/index.ts), [carve-spaghetti.ts](src/terrain/stages/carve-spaghetti.ts) |

We align where comparable: climate scales are shared (section 5). For caves, we aligned cheese **threshold to 0.27** (vanilla cave_cheese additive constant) and **scale to 0.03** (vanilla uses xz_scale 1.0; we keep lower so caverns stay larger). 3D and spaghetti stages are unchanged. Machine-readable summary: [docs/vanilla_terrain_cave_reference.json](vanilla_terrain_cave_reference.json).
