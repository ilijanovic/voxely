# Forest Biome — Technical Documentation

This document describes how the **Forest** biome is designed and implemented in Voxely’s terrain system. It is written for **LLMs and engine developers** and serves as the authoritative reference when changing forest terrain, features, or biome selection.

Design intent is inspired by [Minecraft’s Forest biome](https://minecraft.fandom.com/wiki/Forest); implementation details refer to the current Voxely codebase.

Related docs:
- `docs/TERRAIN_SPEC.md` — pipeline and design targets
- `docs/BIOME_TRANSITIONS.md` — how biome boundaries work
- `docs/PLAINS_BIOME.md` — canonical plains reference

---

## 1. Design intent (Minecraft reference)

- **Identity:** Temperate, seasonal forest with **dense trees** (oak and birch in MC; in Voxely, a single “forest” tree shape). One of the most common overworld biomes.
- **Surface:** Grass block with a **dark, vibrant green** tint; dirt subsurface.
- **Vegetation:** Dense trees, tall grass, flowers (poppy, dandelion, lily of the valley, rose bush, peony, lilac in MC; Voxely uses a subset). Ferns can appear in forest.
- **Gameplay:** Good for wood and early survival; low visibility due to tree density; wolves spawn in MC forest; lava lakes and lightning can cause local fires.
- **Variants (MC):** Forest and Flower Forest (fewer trees, many flowers). Voxely has a separate **windswept_forest** (height-resolved) but no flower_forest variant yet.

When tuning Forest in Voxely, aim for **recognizable dense woodland** with a clear silhouette (canopy, limited sightlines) and smooth transitions into plains, meadow, and hills.

---

## 2. Where Forest lives in the pipeline

World generation is a **multi-stage pipeline**:

| Stage | Role for Forest |
|-------|------------------|
| **1 — Heightmap + biome map** | Base biome chosen by climate/multi-noise; resolved biome stays `forest` unless height pushes to highland variants. |
| **2 — Carving** | Caves/caverns/tunnels; same as other biomes (no forest-specific carving). |
| **3 — Stratigraphy** | Surface/subsurface blocks from `forestDefinition.blocks` (grass, dirt, shore/underwater sand). |
| **4 — Features** | Trees (forest shape + density rules), flowers, tall grass, ferns. |
| **5 — Structures** | Forest can be eligible for structure origins (e.g. villages) per `structures/origins.ts`. Structure eligibility is computed there; actual template placement runs outside the worker pipeline (e.g. in chunk apply or a separate pass). The worker only runs stages 1–4. |

Forest is **not** a special-case terrain type; it is a **biome configuration** that plugs into this generic pipeline (same as in `docs/TERRAIN_SPEC.md` and `docs/PLAINS_BIOME.md`).

---

## 3. Biome selection: when does “forest” get chosen?

### 3.1 Base land biome selection

Base biomes (including `forest`) are selected in two ways (see `src/terrain/biomes/registry.ts` and `src/terrain/index.ts`):

- **Climate (2D):** `getLandBiomeByClimate(temp, humidity)` — nearest match in temperature/humidity space using `BiomeDefinition.climate`.
- **Multi-noise (6D):** `getBiomeByMultiNoise(point)` — nearest match in 6D space (continentalness, erosion, temperature, humidity, weirdness, y) using `BiomeDefinition.multiNoise` when that path is used.

Forest is in `BASE_LAND_BIOMES` and has both `climate` and `multiNoise` defined.

### 3.2 Forest definition (single source of truth)

**File:** `src/terrain/biomes/forest.ts`

- **Climate bounds** (used for 2D climate selection):
  - `tempMin: 0.3`, `tempMax: 0.55` — temperate.
  - `humidityMin: 0.5`, `humidityMax: 0.8` — moderately humid to humid.
- **Multi-noise center** (used for 6D selection when enabled):
  - `continentalness: 0.72`, `erosion: -0.05`, `temperature: -0.15`, `humidity: 0.3`, `weirdness: 0.0`, `y: 0.3`.
  - Weights: `temperature: 2`, `humidity: 2`, `continentalness: 1.3`, `erosion: 1.2` (others default 1).

So Forest is chosen in **temperate, humid-inland** regions. Neighbours in climate space tend to be plains, meadow, savanna, or jungle depending on temperature/humidity.

### 3.3 Resolved biome (height can override base)

After base biome is chosen, **height** can change the biome (e.g. highlands). Logic is in `getResolvedBiomeFromHeight` in `src/terrain/index.ts`:

- If base is **not** mountain/snow:
  - Cold + high → frozen_peaks / snowy_slopes / grove.
  - Cold-upland + high + humid → **windswept_forest** (else windswept_hills).
  - Otherwise → **base unchanged** (so `forest` stays `forest` at normal elevations).
- If base is mountain/snow, highland variant logic applies (meadow, grove, windswept_forest, windswept_hills, peak variants).

So **forest** remains forest everywhere except where cold/high turns it into grove or where upland+humid turns it into **windswept_forest**. No “forest hills” variant in code; windswept_forest is the wooded upland.

**What to consider:** Changing `forestDefinition.climate` or `multiNoise` changes **where** forest appears. Keep it in the temperate–humid band so it doesn’t overlap desert (hot/dry) or snow (cold).

---

## 4. Terrain shape (height and density)

Terrain **shape** is shared: a 3D density / height model driven by blended biome terrain params and global noise. Forest contributes via `forestTerrain` in `src/terrain/biomes/forest.ts`.

### 4.1 Forest terrain params

- **baseOffset:** 3  
- **detailAmp:** 4.5  
- **detailFreq:** 0.026  
- **flatness:** 0.7  
- **mountainAllowed:** true  

So forest has **gentle relief** (high flatness, moderate detail). Height is computed in `getHeightForBase()` by blending primary/secondary biome terrain and adding macro + detail + mountain + ridge terms. Forest does not define caves; carving is global.

**What to consider:** Raising `detailAmp` or lowering `flatness` makes forest hillier; lowering `detailAmp` or raising `flatness` makes it flatter. Keep transitions to neighbouring biomes smooth (blending is done via `getLandBiomeBlendByClimate` and height blending).

---

## 5. Surface rules (blocks at and below surface)

**File:** `src/terrain/biomes/forest.ts` — `forestDefinition.blocks` and `forestLayers`.

- **Surface:** `grass`
- **Subsurface:** `dirt`
- **Subsurface depth:** 3
- **Shore:** `sand`
- **Underwater:** `sand`

Stratigraphy (Stage 3) applies these per column from the biome map. So inland forest columns get grass on top, then 3 layers of dirt, then stone/deepslate; at shores/water, sand is used.

**What to consider:** Do not remove grass/dirt or change depth without checking feature placement (trees, flowers, tall grass, ferns all expect grass/dirt). See `shouldPlaceTree` and flower/ground feature blocks.

### 5.1 Complete block set (what can appear in Forest)

All block types that can appear in a forest column or from features:

| Role | Block types | Notes |
|------|-------------|--------|
| **Surface** | `grass` | Inland; top block |
| **Subsurface** | `dirt` | 3 layers below grass |
| **Shore / underwater** | `sand` | At water edge and sea floor |
| **Underground** | `stone`, `bedrock` | Below subsurface; bedrock at world bottom |
| **Trees** | `wood`, `leaves` | From tree feature (Stage 4) |
| **Decor** | `poppy`, `dandelion`, `tulip_red`, `tall_grass`, `fern` | From flower, ground, ferns features |

Snow layers and grass variants (`grass_snow`, `grass_savanna`) are not used in forest; they belong to other biomes. If you add new blocks (e.g. lily of the valley), register them in `src/block-registry.ts` and `src/terrain/block-ids.ts` before using them in features.

**Critical:** For any block type to actually appear in the world, it must be listed in **`src/terrain/block-ids.ts`** (`TERRAIN_BLOCK_TYPES`) and have a **`BlockDefinition`** in **`src/block-registry.ts`**. If a feature uses `typeToId('dandelion')` (or `fern`, `tall_grass`, etc.) and that type is not in `TERRAIN_BLOCK_TYPES`, the pipeline stores `AIR_ID` (0), so nothing is rendered. See §13 (Beauty audit) for current gaps.

---

## 6. Features (trees, flowers, ground, ferns)

### 6.1 Trees

Tree placement and shape are central to making forest feel like a **forest**.

**Placement (Stage 4):** `src/terrain/index.ts` (and mirror in `src/game-terrain.ts` for runtime):

- **Eligibility:** `forest` is allowed to place trees (with grass/dirt surface, above water, flat enough, not in excluded biomes).
- **Forest-specific logic:**
  - **Forest density noise:** `getForestDensity(wx, wz)` = 2D noise at scale `FOREST_DENSITY_SCALE` (0.028), seed offset 777.
  - **Tree placement noise:** `getTreePlacement(wx, wz)` at `TREE_PLACEMENT_SCALE` (0.12).
  - For biome `forest`: tree is placed only if:
    - `getForestDensityCached(...) > FOREST_DENSITY_THRESHOLD` (0.0) and
    - `getTreePlacementCached(...) > TREE_PLACEMENT_FOREST_THRESHOLD` (-0.1).
  - **Local max:** Tree is placed only if the column is a local maximum of tree placement noise (3×3), so trees don’t cluster on every block.

So in forest, **density noise** gates “foresty” areas (currently threshold 0.0, so all forest biome is eligible from density) and **placement noise** with a low threshold (-0.1) makes trees **common**. Compare: plains uses a high threshold (0.93) so trees are rare.

**Shape:** For `forest` and `windswept_forest`, `getTreeShapeConfig()` returns **TREE_SHAPE_FOREST**:

- Trunk height: 5–10 (vs default 4–8).
- Leaf radius: 2–4 (vs 1–3).
- Leaf height: 4–7 (vs 3–6).
- Leaf density: 0.62–0.96 (vs 0.58–0.92).
- **Giant chance:** 0.06 (vs 0.03); giant trunk/leaf bonuses slightly larger.

So forest trees are **taller, broader, and denser**, with more “giant” trees. This produces the characteristic dense canopy.

**What to consider:**

- **Tree density:** Lower `TREE_PLACEMENT_FOREST_THRESHOLD` → more trees; raise it → sparser forest. Do not go below about -0.5 or trees may overcrowd.
- **Forest density:** If you add a “sparse forest” variant, use a higher `FOREST_DENSITY_THRESHOLD` so only part of the biome passes the density gate.
- **Determinism:** All randomness is seeded and coordinate-based (no `Math.random()` in terrain). Changing seed or constants will change tree positions; keep constants in one place (e.g. `terrain/index.ts` and `game-terrain.ts` in sync).
- **Performance:** Tree placement and leaf placement are per-chunk; very low placement thresholds can increase tree count and cost.

### 6.2 Flowers

**File:** `src/terrain/features/flowers.ts`

Forest uses:

- `poppy`: noise 0.15–0.4  
- `dandelion`: 0.4–0.62  
- `tulip_red`: 0.62–0.75  

One flower type per column by threshold band. Surface must be in `SURFACE_BLOCKS_FOR_FLOWERS` (e.g. grass, dirt).

**What to consider:** To add lily of the valley, rose bush, etc., add blocks to `block-registry.ts` and `terrain/block-ids.ts`, then add entries to `BIOME_FLOWERS.forest` with disjoint threshold ranges.

### 6.3 Tall grass (ground feature)

**File:** `src/terrain/features/ground.ts`

- **forest:** `tall_grass` with noise 0.25–0.8 (so most of the range is grass).

**What to consider:** Forest should stay “grassy” under trees; avoid narrowing the range too much or floor will look bare.

### 6.4 Ferns

**File:** `src/terrain/features/ferns.ts`

Forest is in the list of biomes where ferns can generate (`forest: true`). Placement uses noise and surface type (grass/dirt, etc.).

---

## 7. Structures

**File:** `src/terrain/structures/origins.ts`

Forest is among the biomes that can host structure origins (e.g. for villages). Any change to structure eligibility should keep forest in the list if villages in woodland are desired.

---

## 8. Animals (mob spawning)

Spawn rules are **not** in `src/terrain/`; they live in the runtime entity system. Per-biome spawn lists are in `src/entities/spawn.ts` (`ANIMAL_DEFS`).

**Forest spawns (Voxely):**

| Animal | Spawns in forest? | Notes |
|--------|--------------------|--------|
| **Sheep** | Yes | `spawnBiomes`: plains, forest, jungle, meadow |
| **Pig**   | Yes | Same set |
| **Wolf**  | Yes | `spawnBiomes`: forest, jungle, mountain, snow, grove — **signature forest mob** (like Minecraft) |

Chicken and cow are not in `ANIMAL_DEFS` in the current codebase; only sheep, pig, and wolf exist. Spawn is deterministic per chunk (seeded RNG); `maxPerChunk` is 1 per kind. Adding new animals or changing spawn biomes requires editing `ANIMAL_DEFS` and ensuring mesh/entity types exist.

---

## 9. Depth and vertical extent

- **World height:** `WORLD_HEIGHT = 128` (Y 0 … 128), from `src/constants.ts`. Same for all biomes.
- **Water level:** `WATER_LEVEL = 64`. Columns below this can be water-filled; forest surface is typically above 64.
- **Subsurface depth:** 3 blocks of dirt below grass (see §5).
- **Caves:** Carving (Stage 2) is **global** — no forest-specific cave density or depth. Caves appear at any Y where the carve noise removes solid.
- **Bedrock:** Bottom of world (Y 0 or per-engine convention); same everywhere.

So “depth” for forest is: 3 layers of dirt, then stone down to bedrock; vertical extent is full world height with no forest-only limits.

---

## 10. Weather and atmosphere

- **Weather (rain / snow):** In Voxely, precipitation is **global** (day/night cycle and a single “is snowing” flag). It is not yet driven per-biome. In `src/atmosphere.ts`, `isSnowing` is passed in from the game (e.g. cold biome at player position). So forest does **not** have its own weather; it shares overworld weather. If you add per-biome weather later, forest would typically be “rain allowed, no snow” (temperate).
- **Grass and foliage tint:** Grass and leaves use **colormaps** sampled by **blended temperature and humidity** at the block position (`getBlendedBiomeTempHumidity`, `sampleFoliageColormap` in `src/block-materials.ts`). Forest’s climate (temperate, humid) yields a **darker, richer green** than plains — no separate “forest” colormap; the look comes from the climate band.
- **Sky / fog / water color:** No per-biome override in the current code; forest uses the same overworld sky and fog as other temperate biomes. Water color is standard overworld.
- **Ambient sound:** Not implemented per-biome in the doc’s scope; if added, forest would typically use “woodland” ambience.

**What to consider:** If you implement per-biome weather (e.g. no snow in forest, rain only), add a table or config that maps biome → precipitation type and reference it here.

---

## 11. Constants quick reference (Voxely)

| Constant | Value | Location | Purpose |
|----------|--------|----------|---------|
| `FOREST_DENSITY_SCALE` | 0.028 | `terrain/index.ts`, `game-terrain.ts` | Scale for forest density 2D noise |
| `FOREST_DENSITY_THRESHOLD` | 0.0 | same | Min density to allow trees in forest/jungle/windswept_forest |
| `TREE_PLACEMENT_FOREST_THRESHOLD` | -0.1 | same | Min placement noise for tree in forest (low = many trees) |
| `TREE_PLACEMENT_SCALE` | 0.12 | same | Scale for tree placement 2D noise |
| `TREE_SHAPE_FOREST` | (see §6.1) | same | Trunk/leaf size and giant chance for forest/windswept_forest |

---

## 12. Checklist when editing Forest

- **Biome definition:** `src/terrain/biomes/forest.ts` — terrain params, layers, climate, multiNoise.
- **Registry:** `src/terrain/biomes/registry.ts` — `forest` in `BIOME_REGISTRY` and `BASE_LAND_BIOMES`.
- **Type:** `Biome` in `src/types.ts` includes `'forest'`.
- **Tests:** `src/terrain/biomes/registry.test.ts` and `src/terrain/pipeline.test.ts` list `forest` where required.
- **Tree logic:** `src/terrain/index.ts` (and `src/game-terrain.ts` if used at runtime) — density/placement thresholds and `TREE_SHAPE_FOREST`.
- **Features:** `src/terrain/features/flowers.ts`, `ground.ts`, `ferns.ts` — forest entries.
- **Structures:** `src/terrain/structures/origins.ts` — forest eligibility.
- **Animals:** `src/entities/spawn.ts` — `ANIMAL_DEFS` spawnBiomes for sheep, pig, wolf.
- **Blocks:** New decor blocks → `block-registry.ts`, `terrain/block-ids.ts`.
- **Depth/constants:** `WORLD_HEIGHT`, `WATER_LEVEL` in `src/constants.ts` (global).
- **Determinism:** No `Math.random()` in terrain; all noise seeded and coordinate-stable.
- **Transitions:** Forest borders plains, meadow, savanna, jungle; keep climate/multi-noise and height resolution consistent so boundaries are feathered (see `docs/BIOME_TRANSITIONS.md`).

---

## 13. Forest biome: beauty audit and gaps (senior dev review)

This section answers: **Is the forest biome complete and beautiful? What is missing?**

### 13.1 What is already in place and working

- **Terrain shape:** Gentle relief (flatness 0.7, detailAmp 4.5), baseOffset 3, mountainAllowed. Blending at borders.
- **Surface:** Grass + 3 dirt, sand at shore/underwater. Correct and consistent.
- **Trees:** Dense placement (low threshold -0.1), TREE_SHAPE_FOREST (tall, broad canopy, 6% giant). Trees are the main visual identity of forest and are working.
- **Biome selection:** Temperate, humid climate band; height resolution to windswept_forest. Selection is coherent.
- **Animals:** Sheep, pig, wolf spawn in forest (wolf is signature). Implemented in `src/entities/spawn.ts`.
- **Grass/foliage tint:** Derived from temperature/humidity colormap; forest's climate yields a darker green. No forest-specific override needed.
- **Structures:** Forest eligible for villages etc. in `structures/origins.ts`.
- **Pipeline order:** Trees → ferns → flowers → ground. Correct (trees first, then floor decor).

### 13.2 Critical gap: decor blocks not in terrain pipeline

**Flowers, ferns, and tall grass do not appear in the world** when chunk generation uses the worker pipeline.

Reason: the feature code calls `typeToId('poppy')`, `typeToId('dandelion')`, `typeToId('tulip_red')`, `typeToId('fern')`, `typeToId('tall_grass')`, etc. These block types are **not** in **`src/terrain/block-ids.ts`** (`TERRAIN_BLOCK_TYPES`). For unknown types, `typeToId` returns `AIR_ID` (0), so the voxel buffer stores 0 and nothing is rendered. The same block types are also **not** defined in **`src/block-registry.ts`** for the terrain/decoration set.

So in the current worker path:

- Forest (and plains, meadow, etc.) have **no visible flowers, ferns, or tall grass**.
- The floor under and between trees is **bare grass/dirt** only.

To make forest (and other biomes) look as designed:

1. Add to **`TERRAIN_BLOCK_TYPES`** in `src/terrain/block-ids.ts`: at least `dandelion`, `poppy`, `tulip_red`, `oxeye_daisy`, `blue_orchid`, `fern`, `tall_grass`, `grass_path`, `hay_block` (order fixed for deterministic IDs).
2. Add **BlockDefinition** entries in **`src/block-registry.ts`** for each (with correct textures and `solid: false` where appropriate, e.g. tall_grass, fern).
3. Ensure textures exist under the project's block texture path (e.g. `public/assets/minecraft/textures/block/` or resource pack).
4. Re-run contract tests: `block-registry.test.ts` (every `ID_TO_TYPE` entry must have a BlockDefinition).

Until this is done, the forest biome will look **incomplete**: trees and grass blocks only, no undergrowth or flowers.

### 13.3 Optional improvements for a "beautiful" forest

- **Flower variety:** Minecraft forest has lily of the valley, rose bush, peony, lilac. Adding **oxeye_daisy** or **lily_of_valley** (and their blocks + textures) to the forest flower list in `flowers.ts` would add colour and variety without changing balance much.
- **Flower Forest variant:** A separate biome (e.g. `flower_forest`) with fewer trees and more flower density would add variety; requires a new biome id, climate/multi-noise, and feature tuning.
- **Bee nests on trees:** Not implemented; would require a tree-feature variant that occasionally places a "bee_nest" block on the trunk (and a corresponding block type + behaviour).
- **Visual polish:** Once decor blocks render, consider slightly increasing fern probability in forest (e.g. lower `FERN_PLACE_THRESHOLD` for forest only) so forest feels lusher than plains.

### 13.4 Summary: have we added everything?

| Area | Status | Notes |
|------|--------|------|
| Terrain params & surface | Done | Grass/dirt/sand as specified |
| Trees (shape + density) | Done | Dense, tall, giant chance |
| Flowers (config) | Config only | **Blocks missing** → not visible |
| Tall grass (config) | Config only | **Blocks missing** → not visible |
| Ferns (config) | Config only | **Blocks missing** → not visible |
| Animals | Done | Sheep, pig, wolf |
| Depth / world height | Done | Global constants |
| Weather / atmosphere | Done | Global; tint from climate |
| Structures | Done | Forest eligible |
| Colormap (grass/foliage) | Done | Climate-driven |
| **Decor blocks in pipeline** | **Missing** | Add to block-ids + block-registry + textures |

So: **gameplay and terrain design are in place; the main missing piece for a beautiful forest is making decor block types part of the terrain pipeline (block-ids + block-registry + textures)** so that flowers, ferns, and tall grass actually render.

---

## 14. Minimal “forest biome” spec (for re-use elsewhere)

If you re-implement a forest-like biome elsewhere:

- **Selection:** Temperate temperature (e.g. 0.3–0.55), moderate–high humidity (e.g. 0.5–0.8). Optionally 6D multi-noise for inland, smooth erosion.
- **Terrain:** Slightly raised base, gentle relief (high flatness, moderate detail amplitude).
- **Surface:** Grass top, 2–4 dirt, then stone. Sand at shore/underwater.
- **Trees:** Dense placement (low placement threshold), with a dedicated “forest” tree shape (taller trunk, larger/denser canopy, optional “giant” variant). Optionally gate by a second “forest density” noise so not every column is equally dense.
- **Decor:** Tall grass, flowers (poppy, dandelion, tulip, etc.), ferns. Optional: bee nests on trees (not in Voxely yet).
- **Structures:** Allow villages or similar in forest if desired.
- **Spawns/ambience:** Wolves (MC); grass/foliage tint dark green (from temp/humidity colormap). Keep spawn and tint logic outside pure terrain if you respect a purity boundary. Weather: typically rain allowed, no snow (if per-biome weather exists).

---

## 15. References

- Minecraft Wiki: [Forest](https://minecraft.fandom.com/wiki/Forest)
- Voxely: `docs/TERRAIN_SPEC.md`, `docs/BIOME_TRANSITIONS.md`, `docs/PLAINS_BIOME.md`, `docs/DESERT_BIOME_TECHNICAL.md`
- Code: `src/terrain/biomes/forest.ts`, `src/terrain/index.ts`, `src/terrain/features/*.ts`, `src/terrain/biomes/registry.ts`
