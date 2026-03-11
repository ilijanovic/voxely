# Surface Generation — How the Surface is Made

This document explains **how the terrain surface is generated** in Voxely: the **surface height** per column, the **surface block** at that height, and the pipeline and rules that produce them. It is the central reference for surface logic.

**Scope:** CURRENT implementation only. Do not assume any TARGET or design-from-TERRAIN_SPEC behaviour exists in code.

Related docs: [TERRAIN_SPEC.md](./TERRAIN_SPEC.md) (pipeline, invariants), [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md) (world gen flow), [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md) (climate and boundaries), [PROJECT_MAP.md](./PROJECT_MAP.md) (where to find code).

---

## 1. Definition and data model

- **Surface** for a column `(x, z)`:
  - **Surface Y:** `heightmap[lx][lz]` = the topmost solid terrain cell (integer in `[0, WORLD_HEIGHT]`). This is the *terrain* surface, not the water surface.
  - **Surface block:** the block at `y = surfaceY` (e.g. grass, sand, stone, snow).
- **Where it lives:** After chunk generation, `ChunkContext.heightmap` and `ChunkContext.biomeMap` hold per-column data; after Stage 3 the top non-air voxel in `voxelMap` at that column is the surface block. The payload exposes heightmap (and optional `heightmapBuffer`) and the voxel buffer; see [TERRAIN_SPEC.md §1.3](./TERRAIN_SPEC.md#13-contract-boundary-payload-stability) for the contract.

---

## 2. Pipeline overview (where surface comes from)

```mermaid
flowchart LR
  Stage1[Stage 1 heightmap-biome]
  Stage2[Stage 2 carve]
  Stage3[Stage 3 stratigraphy]
  Stage1 -->|heightmap biomeMap| Stage2
  Stage2 -->|unchanged surface Y| Stage3
  Stage3 -->|surface block at topY| Out[ChunkDataPayload]
```

- **Stage 1** ([`src/terrain/stages/heightmap-biome.ts`](src/terrain/stages/heightmap-biome.ts)): Fills **heightmap** and **biomeMap** per column. No blocks yet—only “where is the surface” and “which biome”.
- **Stage 2** (carve-3d, carve-cheese, carve-spaghetti): Carves **only below** surface Y. It does **not** change the surface height (caves do not move the terrain top).
- **Stage 3** ([`src/terrain/stages/stratigraphy.ts`](src/terrain/stages/stratigraphy.ts)): Fills blocks from y=0 up to topY. At **y = topY** it sets the surface block (underwater / shore / land via `getSurfaceBlock`).

So: **Surface height** comes from Stage 1; **surface block** from Stage 3 using `getSurfaceBlock`.

---

## 3. How surface height is determined (Stage 1)

For each world coordinate `(wx, wz)`:

1. **Base biome:** `getBaseBiomeAt(wx, wz)` — from continentalness (ocean vs land) and, when enabled, multi-noise or climate blend ([`src/terrain/index.ts`](src/terrain/index.ts): `getBiomeBlendAt`, `getBaseBiomeAt`).
2. **Raw height:** `getHeightForBase(base, wx, wz)` — combines:
   - Macro terrain (continentalness bands),
   - Detail noise (biome params: baseOffset, detailAmp, detailFreq, flatness),
   - Erosion,
   - Mountain term (mask + height noise, only where biome allows),
   - Weirdness ridge term,
   - and uses `BASE_HEIGHT` (64).
3. **Smoothed height:** A 3×3 kernel in `getHeightUncached` (center 0.25, cardinals 0.125, corners 0.0625), then `clamp(0, WORLD_HEIGHT)` and `Math.floor`.
4. **Resolved biome:** `getResolvedBiomeFromHeight(base, height, wx, wz)` — height can override the base biome (e.g. mountain → meadow / grove / snowy_slopes / peaks; cold highlands → frozen_peaks, etc.).

Stage 1 output: `heightmap[lx][lz] = surfaceY`, `biomeMap[lx][lz] = biome`. No blocks are written.

---

## 4. How the surface block is determined (Stage 3 and getSurfaceBlock)

### 4.1 Stratigraphy

In [`src/terrain/stages/stratigraphy.ts`](src/terrain/stages/stratigraphy.ts), for each column `(lx, lz)` with `topY = heightmap[lx][lz]`:

- From y=0 to topY it fills only where `voxelMap` is 0 or CARVED (carved cells get overwritten with real blocks).
- **y = 0:** bedrock.
- **y = topY:**
  - If **underwater** (`topY < WATER_LEVEL`): `blocks.underwater`.
  - If **shore** (`topY` in `[WATER_LEVEL - 1, WATER_LEVEL + 1]`): `blocks.shore`.
  - Otherwise: **`getSurfaceBlock(ctx, lx, lz)`** (see below).

So the “top” of the terrain is always at topY; stratigraphy fills upward to that cell. After Stage 2 there may be holes below topY; the block at topY is still the surface block.

### 4.2 getSurfaceBlock (order of checks)

Implemented in [`src/terrain/index.ts`](src/terrain/index.ts) (around lines 699–795). The following order is authoritative:

1. **Underwater:** `topY < WATER_LEVEL` → `def.blocks.underwater`.
2. **Shore band:** `WATER_LEVEL - 1 ≤ topY ≤ WATER_LEVEL + 1` → `def.blocks.shore`.
3. **Coast blend (ocean ↔ land):** If `getBiomeBlendAt` has primary=ocean and secondary≠ocean, dither between land’s surface and `sand` using `detailNoise2D` and blend `t`.
4. **Land biome boundary:** If primary≠secondary, both not ocean, and **both not desert** (Minecraft-style: no dithering when desert is involved—sharp sand/grass boundary), and the two surfaces differ and `0.1 < t < 0.9`, dither between the two surface types with `detailNoise2D`.
5. **Stone by height (mountains / highland):** If (mountain or windswept_hills or windswept_forest) and `topY >= MOUNTAIN_STONE_SURFACE_HEIGHT` (WATER_LEVEL + 16) → `stone`. If meadow and `topY >= MOUNTAIN_STONE_SURFACE_HEIGHT` → `stone`. If `topY >= SURFACE_STONE_HEIGHT` (WATER_LEVEL + 26) and biome is not frozen_peaks or jagged_peaks → `stone`.
6. **Frozen peaks:** Uses `getMaxSlopeDelta` (max of cardinal height differences). Steep/verySteep thresholds (6 and 9), high = `topY >= WATER_LEVEL + 30`. Then packed_ice / ice / snow by slope and noise.
7. **Snow at altitude:** If `topY >= WATER_LEVEL + 20` and biome is not in the “warm/low” set (desert, savanna, mountain, jungle, cherry_grove, windswept_forest, meadow, plains) → `grass_snow`.
8. **Biome default variants:** If surface is snow → `grass_snow`. If savanna and surface is grass → `grass_savanna`. If surface is grass and any 3×3 neighbor (via `getResolvedBiome`) is in `SNOW_BIOMES` → `grass_snow`.
9. **Default:** `def.blocks.surface`.

Relevant constants (see also §6): `WATER_LEVEL` (64), `MOUNTAIN_STONE_SURFACE_HEIGHT`, `SURFACE_STONE_HEIGHT`, `SNOW_BIOMES` = `['snow', 'snowy_slopes', 'frozen_peaks', 'jagged_peaks', 'grove']`.

---

## 5. Biome layer data

Each biome defines a **BiomeBlockSet** ([`src/terrain/biomes/types.ts`](src/terrain/biomes/types.ts)): `surface`, `subsurface`, `subsurfaceDepth`, `shore`, `underwater`. Stratigraphy uses `subsurface` for the layer directly below the surface block (depth `subsurfaceDepth`); below that it uses stone. Standard surfaces per biome include grass, sand, snow, stone, gravel, grass_savanna; see the biome files under `src/terrain/biomes/*.ts` and [TERRAIN_SPEC.md](TERRAIN_SPEC.md), [PLAINS_BIOME.md](PLAINS_BIOME.md) for a worked example.

---

## 6. Constants and dependencies

- **Constants:** `WATER_LEVEL`, `WORLD_HEIGHT`, `CHUNK_SIZE` ([`src/constants.ts`](src/constants.ts)); terrain-intern in [`src/terrain/index.ts`](src/terrain/index.ts): `MOUNTAIN_STONE_SURFACE_HEIGHT`, `SURFACE_STONE_HEIGHT`, `COAST_BLEND_BAND`, `SNOW_BIOMES`. The same height thresholds are used in [`src/game-terrain.ts`](src/game-terrain.ts) and [`src/terrain-sampling.ts`](src/terrain-sampling.ts) for runtime/sampling; they must stay in sync (see §8).
- **Stage 3** needs heightmap, biomeMap, BIOME_REGISTRY, and the optional `getSurfaceBlock`. `getSurfaceBlock` needs heightmap, biomeMap, `getHeightUncached` (for slope), `getBiomeBlendAt`, and `getResolvedBiome` (for grass_snow neighbor check).

---

## 7. Rules, considerations, and watch-outs

### 7.1 Determinism

**Same seed and same coordinates (x, z) ⇒ same surface Y and same surface block.** All values come from deterministic noise or hashing (seed + coordinates). No `Math.random()` in terrain.

### 7.2 Three places with surface logic (sync risk)

Surface block logic exists in **three** places and must be kept consistent:

- **Worker (authoritative):** [`src/terrain/index.ts`](src/terrain/index.ts) — `getSurfaceBlock` used by Stage 3.
- **Main-thread runtime:** [`src/game-terrain.ts`](src/game-terrain.ts) — `getSurfaceBlockAt` (e.g. spawn, block queries).
- **Pure sampling:** [`src/terrain-sampling.ts`](src/terrain-sampling.ts) — same formulas as worker; `getHeight` is injected.

If you change surface rules (e.g. add a new override or change a threshold), update **all three** places. Lists like `SNOW_BIOMES` must match everywhere (e.g. worker uses `SNOW_BIOMES` including `jagged_peaks`; any inline list in game-terrain or terrain-sampling must include the same set).

### 7.3 CURRENT only — no TARGET

This document describes **CURRENT** behaviour in the codebase. Do not describe or assume TERRAIN_SPEC “TARGET” or future design as if it were implemented.

### 7.4 Generated surface vs runtime “visible” surface

This doc describes **generated** surface (what Stage 3 writes into the chunk). At runtime, `getBlockAt` may return a **block override** (player-placed or removed). The top visible block can therefore be an override, not the generated surface block.

### 7.5 Surface Y vs water

**Surface Y** is the top **terrain** voxel (solid). Water is filled separately (e.g. in chunk-apply). If `topY < WATER_LEVEL`, the terrain surface is still at topY (e.g. sand/gravel); water sits above it. Do not confuse “surface” with “water surface”.

### 7.6 Constants in multiple files

`MOUNTAIN_STONE_SURFACE_HEIGHT`, `SURFACE_STONE_HEIGHT`, and the set of snow biomes appear in `terrain/index.ts`, `game-terrain.ts`, and `terrain-sampling.ts`. When changing these, update all copies so behaviour stays consistent across generation and runtime/sampling.

### 7.7 When changing surface logic

- Implement the change in **all three** locations (terrain/index.ts, game-terrain.ts, terrain-sampling.ts) or document clearly which place is the single source of truth.
- Update **this document** if the order of checks or the rules change.
- Run **tests:** `npm run test:run` (includes pipeline, chunk-payload contract, terrain-sampling). If payload or contracts change, run `npm run build` as well.
- Follow [.cursor/rules/terrain-biome-integrity.mdc](../.cursor/rules/terrain-biome-integrity.mdc) for terrain/biome edits (contract, tests, build).

### 7.8 Stratigraphy and carved cells

Stratigraphy only writes where `voxelMap` is 0 or CARVED. It fills from y=0 up to topY; the block at **y = topY** is always the surface block. So even if Stage 2 left holes below topY, the “surface” is still the single cell at topY, not “the top of a hole”.

---

## 8. See also

| Topic | Document |
|-------|----------|
| Pipeline, invariants, biome model | [TERRAIN_SPEC.md](./TERRAIN_SPEC.md) |
| World gen and systems | [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md) |
| Biome boundaries and climate | [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md) |
| Code locations | [PROJECT_MAP.md](./PROJECT_MAP.md) |
| One biome in depth | [PLAINS_BIOME.md](./PLAINS_BIOME.md) |
