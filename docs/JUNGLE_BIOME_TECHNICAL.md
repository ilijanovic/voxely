# Jungle Biome — Technical Documentation

This document describes how the **Jungle** biome is designed and implemented in Voxely's terrain system. It is written for **LLMs and engine developers** and serves as the authoritative reference when changing jungle terrain, features, or biome selection.

Design intent is inspired by [Minecraft's Jungle biome](https://minecraft.fandom.com/wiki/Jungle); implementation details refer to the current Voxely codebase.

Related docs:
- `docs/TERRAIN_SPEC.md` — pipeline and design targets
- `docs/BIOME_TRANSITIONS.md` — how biome boundaries work
- `docs/FOREST_BIOME_TECHNICAL.md` — forest biome reference (similar woodland)
- `docs/PLAINS_BIOME.md` — canonical plains reference

---

## 1. Design intent (Minecraft reference)

- **Identity:** Dense, tall, humid tropical forest. One of the **rare** overworld biomes (see `docs/TERRAIN_SPEC.md` §5.7: "rare biomes (Jungle, Badlands/Mesa, Ice Spikes)").
- **Surface:** Grass block with a **saturated green** tint (high temp/humidity); dirt subsurface.
- **Vegetation:** Very dense trees (wider height and canopy ranges than forest), tall grass, ferns, flowers (poppy, blue orchid, oxeye daisy). Undergrowth is dense (woodland tall-grass chance at runtime).
- **Gameplay:** Exploration reward; sheep, pig, and wolf can spawn; good for wood variety (jungle_log/jungle_planks exist in registry; generated trees currently use generic `wood`/`leaves`).
- **Variants (MC):** Jungle Edge, Bamboo Jungle, etc. **Voxely has no Jungle Edge or other jungle sub-biomes**; no jungle-specific structures (e.g. Jungle Temple) are implemented.

When tuning Jungle in Voxely, aim for **recognizable dense tropical woodland** with taller, more variable trees and smooth transitions into forest, savanna, or plains in climate space.

---

## 2. Where Jungle lives in the pipeline

World generation is a **multi-stage pipeline**:

| Stage | Role for Jungle |
|-------|------------------|
| **1 — Heightmap + biome map** | Base biome chosen by climate/multi-noise; resolved biome stays `jungle` (no height-based variant). |
| **2 — Carving** | Caves/caverns/tunnels; same as other biomes (no jungle-specific carving). |
| **3 — Stratigraphy** | Surface/subsurface blocks from `jungleDefinition.blocks` (grass, dirt, shore/underwater sand). |
| **4 — Features** | Trees (jungle shape + density rules), flowers, tall grass, ferns, ground (tall_grass, hay_block). |
| **5 — Structures** | No jungle-specific structure origins (e.g. Jungle Temple) in the codebase; structure eligibility is per `structures/origins.ts`. |

Jungle is **not** a special-case terrain type; it is a **biome configuration** that plugs into the generic pipeline (same as in `docs/TERRAIN_SPEC.md`).

---

## 3. Biome selection: when does "jungle" get chosen?

### 3.1 Base land biome selection

Base biomes (including `jungle`) are selected in two ways (see `src/terrain/biomes/registry.ts` and `src/terrain/index.ts`):

- **Climate (2D):** `getLandBiomeByClimate(temp, humidity)` — nearest match in temperature/humidity space using `BiomeDefinition.climate`.
- **Multi-noise (6D):** `getBiomeByMultiNoise(point)` — nearest match in 6D space (continentalness, erosion, temperature, humidity, weirdness, y) using `BiomeDefinition.multiNoise` when that path is used.

Jungle is in `BASE_LAND_BIOMES` and has both `climate` and `multiNoise` defined.

### 3.2 Jungle definition (single source of truth)

**File:** `src/terrain/biomes/jungle.ts`

- **Climate bounds** (used for 2D climate selection):
  - `tempMin: 0.5`, `tempMax: 0.75` — warm.
  - `humidityMin: 0.7`, `humidityMax: 1` — humid to very humid.
- **Multi-noise center** (used for 6D selection when enabled):
  - `continentalness: 0.72`, `erosion: -0.12`, `temperature: 0.25`, `humidity: 0.7`, `weirdness: 0.05`, `y: 0.3`.
  - Weights: `temperature: 2`, `humidity: 2.5`, `continentalness: 1.2`, `erosion: 1.2` (others default 1).

So Jungle is chosen in **warm, very humid inland** regions. Neighbours in climate space tend to be forest, savanna, or plains depending on temperature/humidity.

### 3.3 Resolved biome (height can override base)

After base biome is chosen, **height** can change the biome (e.g. highlands). Logic is in `getResolvedBiomeFromHeight` in `src/terrain/index.ts`:

- For base **jungle**, there is **no height-based variant** in the current code. Jungle remains `jungle` at all elevations (unlike mountain/snow, which resolve to peak/slope variants).

**What to consider:** Changing `jungleDefinition.climate` or `multiNoise` changes **where** jungle appears. Keep it in the warm–humid band so it doesn't overlap desert (hot/dry) or snow (cold). Jungle is intended to be rarer than forest/plains (weighted rarity in TERRAIN_SPEC).

---

## 4. Terrain shape (height and density)

Terrain **shape** is shared: a 3D density / height model driven by blended biome terrain params and global noise. Jungle contributes via `jungleTerrain` in `src/terrain/biomes/jungle.ts`.

### 4.1 Jungle terrain params

- **baseOffset:** 3  
- **detailAmp:** 9  
- **detailFreq:** 0.03  
- **flatness:** 0.5  
- **mountainAllowed:** true  

Jungle has **more relief** than forest (detailAmp 9 vs forest's 4.5; flatness 0.5 vs 0.7). Height is computed in `getHeightForBase()` by blending primary/secondary biome terrain and adding macro + detail + mountain + ridge terms. Jungle does not define caves; carving is global.

**What to consider:** Raising `detailAmp` or lowering `flatness` makes jungle hillier; lowering `detailAmp` or raising `flatness` makes it flatter. Keep transitions to neighbouring biomes smooth (blending via `getLandBiomeBlendByClimate` and height blending).

---

## 5. Surface rules (blocks at and below surface)

**File:** `src/terrain/biomes/jungle.ts` — `jungleDefinition.blocks` and `jungleLayers`.

- **Surface:** `grass`
- **Subsurface:** `dirt`
- **Subsurface depth:** 4
- **Shore:** `sand`
- **Underwater:** `sand`

Stratigraphy (Stage 3) applies these per column from the biome map. Inland jungle columns get grass on top, then **4 layers** of dirt, then stone; at shores/water, sand is used.

**Snow at altitude:** Jungle is in the **"warm/low" set** that does **not** get `grass_snow` at high elevation. In `src/terrain/index.ts` (surface block resolution), when `topY >= WATER_LEVEL + 20`, grass_snow is applied only when `!BIOMES_WITHOUT_GRASS_SNOW.has(biome)`. The worker thus uses the single source of truth `BIOMES_WITHOUT_GRASS_SNOW` from `src/terrain/tree-constants.ts`, which includes `'jungle'`. So jungle stays grass even high up. See also `docs/SURFACE_GENERATION.md` §7.

**What to consider:** Do not remove grass/dirt or change depth without checking feature placement (trees, flowers, tall grass, ferns expect grass/dirt). See `shouldPlaceTree` and flower/ground feature blocks.

### 5.1 Complete block set (what can appear in Jungle)

| Role | Block types | Notes |
|------|-------------|--------|
| **Surface** | `grass` | Inland; top block |
| **Subsurface** | `dirt` | 4 layers below grass |
| **Shore / underwater** | `sand` | At water edge and sea floor |
| **Underground** | `stone`, `bedrock` | Below subsurface |
| **Trees** | `wood`, `leaves` | From tree feature (Stage 4); generic wood/leaves (jungle_log in registry is for crafting/player use) |
| **Decor** | `poppy`, `blue_orchid`, `oxeye_daisy`, `tall_grass`, `hay_block`, `fern` | From flower, ground, ferns features |

Snow layers and grass variants (`grass_snow`, `grass_savanna`) are not used in jungle; jungle is excluded from high-altitude grass_snow. For any new block type to appear, it must be in `src/terrain/block-ids.ts` and `src/block-registry.ts`.

---

## 6. Features (trees, flowers, ground, ferns)

### 6.1 Trees

Tree placement and shape are central to making jungle feel **dense and tall**.

**Placement (Stage 4):** `src/terrain/index.ts` (and mirror in `src/game-terrain.ts` for runtime):

- **Eligibility:** `jungle` is allowed to place trees (grass/dirt surface, above water, flat enough, not in excluded biomes).
- **Jungle-specific logic** (`src/terrain/tree-constants.ts`, `TREE_PLACEMENT_CONFIG.jungle`):
  - **Forest density noise:** Same as forest — `getForestDensity(wx, wz)` at `FOREST_DENSITY_SCALE` (0.028). Tree allowed only if `getForestDensityCached(...) > FOREST_DENSITY_THRESHOLD` (0.0).
  - **Tree placement noise:** `getTreePlacement(wx, wz)` at `TREE_PLACEMENT_SCALE` (0.12).
  - For biome `jungle`: tree is placed only if:
    - Forest density passes and
    - `getTreePlacementCached(...) > TREE_PLACEMENT_JUNGLE_THRESHOLD` (**-0.88**).
  - **Local max:** Tree is placed only if the column is a local maximum of tree placement noise (3×3).

So in jungle, the **placement threshold (-0.88)** is **lower** than forest (-0.1), meaning **more trees** pass the check — jungle is denser than forest.

**Shape:** For `jungle`, `getTreeShapeConfig()` returns **TREE_SHAPE_JUNGLE** (`src/terrain/tree-constants.ts`):

- **Trunk height:** 4–20 (vs forest 4–13) — much wider range, including very tall trees.
- **Leaf radius:** 2–8 (vs forest 2–5).
- **Leaf height:** 4–15 (vs forest 3–9).
- **Leaf density:** 0.6–0.99 (vs forest 0.48–0.98).
- **Giant chance:** **0.18** (vs forest 0.06); giant trunk bonus up to 10, leaf radius bonus 3, leaf height bonus 5, density bonus 0.05.

So jungle trees are **highly variable** (short and bushy to very tall) with **more giants**. Comment in code: "Jungle trees use wider ranges so height, canopy size and density vary more."

**Shape noise offset:** So jungle trees use a **different slice of shape noise** than forest (avoid correlation), `JUNGLE_TREE_SHAPE_OFFSET_X = 500` and `JUNGLE_TREE_SHAPE_OFFSET_Z = -300` are applied in `getTreeBlocks()` in `src/terrain/index.ts` when `biome === 'jungle'` (`shapeOx`, `shapeOz`). The same offset is used for `shouldPlaceLeafAtCorner` so leaf corners are evaluated with the shifted coordinates.

**Leaf placement:** For both `forest` and `jungle`, leaf placement uses a **spherical** constraint: `dx*dx + (y - canopyCenterY)^2 + dz*dz <= maxLeafDistSq` (in `src/terrain/index.ts` and `src/game-terrain.ts`), so leaves stay inside a ball and corners can be culled.

**What to consider:**

- **Tree density:** Lower `TREE_PLACEMENT_JUNGLE_THRESHOLD` → even more trees; raise it → sparser jungle.
- **Determinism:** All randomness is seeded and coordinate-based. Jungle shape uses the offset (500, -300) so changing that changes tree shapes without affecting forest.
- **Performance:** More trees and larger canopies can increase cost; giant chance 0.18 is higher than forest.

### 6.2 Flowers

**File:** `src/terrain/features/flowers.ts`

Jungle uses:

- `poppy`: noise 0.2–0.55  
- `blue_orchid`: 0.55–0.75  
- `oxeye_daisy`: 0.75–0.88  

One flower type per column by threshold band. Surface must be in `SURFACE_BLOCKS_FOR_FLOWERS` (e.g. grass, dirt).

### 6.3 Tall grass and ground

**File:** `src/terrain/features/ground.ts`

- **jungle:** `tall_grass` with noise 0.08–0.92, then `hay_block` 0.92–0.98.

So jungle has a wide band of tall_grass and a small band of hay_block.

**Runtime procedural tall grass:** In `src/game/chunks/chunk-apply.ts`, `getTallGrassPositions()` uses a higher spawn chance for **woodland** biomes (`forest` and `jungle`): `TALL_GRASS_SPAWN_CHANCE_WOODLAND = 0.12` (vs default `TALL_GRASS_SPAWN_CHANCE = 0.05`). The same logic appears in `src/game/chunks/chunk-generate-sync.ts`. So jungle (and forest) get **denser undergrowth** when procedural tall grass is used.

### 6.4 Ferns

**File:** `src/terrain/features/ferns.ts`

Jungle is in the list of biomes where ferns can generate (`jungle: true`). Placement uses **FERN_PLACE_THRESHOLD_JUNGLE (0.68)**, lower than forest (0.75), so jungle has **denser** fern undergrowth.

---

## 7. Structures

There are **no jungle-specific structures** (e.g. Jungle Temple) in the current codebase. Structure eligibility is defined in `src/terrain/structures/origins.ts`; any change to allow jungle-only structures would be done there.

---

## 8. Animals (mob spawning)

Spawn rules live in the runtime entity system. Per-biome spawn lists are in `src/entities/spawn.ts` (`ANIMAL_DEFS`).

**Jungle spawns (Voxely):**

| Animal | Spawns in jungle? | Notes |
|--------|--------------------|--------|
| **Sheep** | Yes | `spawnBiomes`: plains, forest, jungle, meadow |
| **Pig**   | Yes | Same set |
| **Wolf**  | Yes | `spawnBiomes`: forest, jungle, mountain, snow, grove |

Spawn is deterministic per chunk (seeded RNG). Jungle is also in `SPAWNABLE_BIOMES` in `src/game-terrain.ts` (spawn point selection). `getSpawnMaxHeightForGrass()` treats jungle like forest/plains/savanna: max height for grass spawn is `SURFACE_STONE_HEIGHT - 1`.

---

## 9. Grass and foliage tint

**File:** `src/block-materials.ts`

`BIOME_GRASS_TEMP_HUMIDITY.jungle`: **temp: 0.95**, **humidity: 0.9**. Grass and foliage use colormaps sampled by blended temperature and humidity, so jungle gets a **saturated, vivid green** (warm and very humid). No separate "jungle" colormap; the look comes from this climate band.

---

## 10. Depth and vertical extent

- **World height:** `WORLD_HEIGHT = 128` (Y 0 … 128), from `src/constants.ts`. Same for all biomes.
- **Water level:** `WATER_LEVEL = 64`. Jungle surface is typically above 64.
- **Subsurface depth:** **4** blocks of dirt below grass (see §5).
- **Caves:** Carving (Stage 2) is global — no jungle-specific cave density.
- **Snow at altitude:** Jungle does **not** get grass_snow at high elevation (see §5).

---

## 11. Constants quick reference (Voxely)

| Constant | Value | Location | Purpose |
|----------|--------|----------|---------|
| `TREE_PLACEMENT_JUNGLE_THRESHOLD` | -0.88 | `src/terrain/tree-constants.ts` | Min placement noise for tree in jungle (lower = more trees than forest) |
| `FOREST_DENSITY_THRESHOLD` | 0.0 | same / terrain/index.ts | Min density to allow trees in forest/jungle/windswept_forest |
| `JUNGLE_TREE_SHAPE_OFFSET_X` | 500 | `src/terrain/tree-constants.ts` | X offset for jungle tree shape noise |
| `JUNGLE_TREE_SHAPE_OFFSET_Z` | -300 | same | Z offset for jungle tree shape noise |
| `TREE_SHAPE_JUNGLE` | (see §6.1) | same | Trunk/leaf/giant config for jungle |
| `TALL_GRASS_SPAWN_CHANCE_WOODLAND` | 0.12 | `src/game/chunks/chunk-apply.ts` | Procedural tall grass chance in forest/jungle |
| `BIOME_VALUE.jungle` | 4 | `src/terrain/biomes/index.ts` | Numeric value for sampling (e.g. macro terrain) |

---

## 12. Checklist when editing Jungle

- **Biome definition:** `src/terrain/biomes/jungle.ts` — terrain params, layers, climate, multiNoise.
- **Registry:** `src/terrain/biomes/registry.ts` — `jungle` in `BIOME_REGISTRY` and `BASE_LAND_BIOMES`.
- **Type:** `Biome` in `src/types.ts` includes `'jungle'`.
- **Tests:** `src/terrain/biomes/registry.test.ts`, `src/terrain/tree-constants.test.ts`, `src/terrain-sampling.test.ts`, `src/terrain/pipeline.test.ts` — jungle appears where base biomes or tree shapes are listed.
- **Tree logic:** `src/terrain/index.ts` (and `src/game-terrain.ts` if used at runtime) — placement threshold, forest density, `TREE_SHAPE_JUNGLE`, `JUNGLE_TREE_SHAPE_OFFSET_*`.
- **Features:** `src/terrain/features/flowers.ts`, `ground.ts`, `ferns.ts` — jungle entries.
- **Surface / snow:** `src/terrain/index.ts` (surface block resolution), `src/terrain/tree-constants.ts` (`BIOMES_WITHOUT_GRASS_SNOW`).
- **Procedural tall grass:** `src/game/chunks/chunk-apply.ts`, `src/game/chunks/chunk-generate-sync.ts` — woodland (forest/jungle) chance.
- **Animals:** `src/entities/spawn.ts` — `ANIMAL_DEFS` spawnBiomes for sheep, pig, wolf.
- **Spawn world:** `src/game-terrain.ts` — `SPAWNABLE_BIOMES`, `getSpawnMaxHeightForGrass`.
- **Blocks:** `jungle_planks`, `jungle_log` in `src/block-registry.ts` (crafting/player); generated trees use generic `wood`/`leaves` in `src/terrain/features/trees.ts`.
- **Desert decor:** Jungle is **excluded** from desert-style decor (e.g. dead bush) in `src/terrain/index.ts` (the condition that applies desert decor explicitly excludes jungle, cherry_grove, windswept_forest, meadow, plains, etc.).
- **Transitions:** Jungle borders forest, savanna, plains in climate space; keep climate/multi-noise consistent (see `docs/BIOME_TRANSITIONS.md`).

---

## 13. References

- Minecraft Wiki: [Jungle](https://minecraft.fandom.com/wiki/Jungle)
- Voxely: `docs/TERRAIN_SPEC.md`, `docs/BIOME_TRANSITIONS.md`, `docs/SURFACE_GENERATION.md`, `docs/FOREST_BIOME_TECHNICAL.md`, `docs/PLAINS_BIOME.md`, `docs/SYSTEMS_OVERVIEW.md`, `docs/PROJECT_MAP.md`
- Code: `src/terrain/biomes/jungle.ts`, `src/terrain/index.ts`, `src/terrain/tree-constants.ts`, `src/terrain/features/*.ts`, `src/terrain/biomes/registry.ts`, `src/terrain/biomes/index.ts`, `src/game-terrain.ts`, `src/game/chunks/chunk-apply.ts`, `src/block-materials.ts`, `src/entities/spawn.ts`
