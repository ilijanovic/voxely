# CTO Review: Biome, Terrain, Surface and Block Logic

This document is a **technical review** of whether the biome, terrain, surface, and block logic work together correctly and whether the implementation is sound. It aligns with [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md), [SURFACE_GENERATION.md](./SURFACE_GENERATION.md), and [TERRAIN_SPEC.md](./TERRAIN_SPEC.md).

**Status:** The issues in §2 were fixed in code; see “Fixed” notes below. Tests (pipeline, chunk contract, terrain-sampling) pass.

---

## Executive summary

- **Pipeline and data flow:** Correct. Stage 1 (heightmap + biome) → Stage 2 (carve) → Stage 3 (stratigraphy + surface block) is consistent; carving does not change surface Y; stratigraphy uses heightmap and biomeMap correctly.
- **Biome and block registry:** All biomes are registered; `BIOME_TERRAIN` and `BIOME_LAYERS` are derived correctly from `BIOME_REGISTRY`. Block types used in biome definitions and in `getSurfaceBlock` (including `ice`, `packed_ice`) are present in `TERRAIN_BLOCK_TYPES` and in the block registry for rendering.
- **Previously critical:** (1) `packed_ice` and `ice` were missing from `TERRAIN_BLOCK_TYPES` — **Fixed:** added at end of list in `terrain/block-ids.ts`. (2) Surface logic drift in `game-terrain.ts` (missing `jagged_peaks`, missing desert exclusion) and simplified `getBlockTypeAt` — **Fixed:** game-terrain aligned with worker; terrain-sampling documented as simplified and frozen_peaks/jagged_peaks exempted from stone-at-height.

---

## 1. What works well

### 1.1 Pipeline and invariants

- **Determinism:** Terrain uses only seeded, coordinate-stable noise; no `Math.random()` in `src/terrain/**`.
- **Stage order:** Heightmap and biome map are filled in Stage 1; Stage 2 carves only below surface Y (see carve-3d, carve-cheese, carve-spaghetti); Stage 3 fills from y=0 to topY and sets the surface block at topY. This matches the docs.
- **Contract:** `ChunkDataPayload` (heightmap, buffer) is produced by the worker and consumed by `chunk-apply.ts`; contract tests exist.

### 1.2 Biome and layer data

- **Biome union** in `src/types.ts` matches all entries in `BIOME_REGISTRY`; every biome has a full `BiomeDefinition` (blocks: surface, subsurface, subsurfaceDepth, shore, underwater; terrainParams).
- **Stratigraphy** reads `heightmap`, `biomeMap`, and `BIOME_REGISTRY` and uses `getSurfaceBlock(ctx, lx, lz)` when not underwater/shore. Subsurface depth and stone layer are applied consistently.

### 1.3 Block registry vs terrain block IDs

- All block types referenced in biome **definitions** (surface, subsurface, shore, underwater) are either in `TERRAIN_BLOCK_TYPES` in `src/terrain/block-ids.ts` or are overridden only in `getSurfaceBlock` (see §2.1). The block registry (`src/block-registry.ts`) contains the same types for rendering.

---

## 2. Bugs and inconsistencies (fixed)

### 2.1 Critical: `packed_ice` and `ice` not in terrain block IDs — **Fixed**

**Was:** `src/terrain/index.ts` (frozen_peaks branch) returns `'packed_ice'` and `'ice'` but they were not in `TERRAIN_BLOCK_TYPES`, so they mapped to `AIR_ID` and rendered as air.

**Fixed:** Added `'ice'` and `'packed_ice'` at the end of `TERRAIN_BLOCK_TYPES` in `src/terrain/block-ids.ts` so existing IDs stay stable. Block registry already had both for rendering.

---

### 2.2 Sync: `game-terrain.ts` snow-neighbor check missing `jagged_peaks` — **Fixed**

**Was:** Worker uses `SNOW_BIOMES` including `jagged_peaks`; `game-terrain.ts` did not, so grass next to jagged_peaks was inconsistent.

**Fixed:** Added `'jagged_peaks'` to the grass_snow neighbor condition in `getSurfaceBlockAt` in `src/game-terrain.ts`.

---

### 2.3 Sync: `game-terrain.ts` land biome dither does not exclude desert — **Fixed**

**Was:** Worker excludes desert from land-boundary dither (sharp sand/grass); `game-terrain.ts` did not.

**Fixed:** Added `blend.primary !== 'desert' && blend.secondary !== 'desert'` to the land biome boundary block in `getSurfaceBlockAt` in `src/game-terrain.ts`.

---

### 2.4 `terrain-sampling.ts` `getBlockTypeAt` is simplified — **Documented and partially fixed**

**Location:** `src/terrain-sampling.ts`, `getBlockTypeAt(biome, y, topY)`.

**Still simplified (by design):** No coast blend, no land boundary dither, no frozen_peaks packed_ice/ice logic, no grass_snow neighbor check. Documented in a JSDoc on `getBlockTypeAt`: “Simplified surface/column block type. Does not replicate full worker surface rules (coast blend, land boundary dither, frozen_peaks packed_ice/ice, grass_snow neighbor). For authoritative surface at a position, use chunk data or game-terrain getSurfaceBlockAt.”

**Fixed:** High frozen_peaks and jagged_peaks no longer sampled as stone: added `biome !== 'frozen_peaks' && biome !== 'jagged_peaks'` to the `SURFACE_STONE_HEIGHT` check so they get their biome surface (snow) instead of stone.

---

## 3. Recommendations

1. ~~Fix §2.1~~ **Done.** `ice` and `packed_ice` in `TERRAIN_BLOCK_TYPES`; tests pass.
2. ~~Fix §2.2 and §2.3~~ **Done.** `game-terrain.ts` aligned with worker (jagged_peaks, desert exclusion).
3. ~~Document or fix §2.4~~ **Done.** `getBlockTypeAt` documented as simplified; frozen_peaks/jagged_peaks exempted from stone-at-height.
4. **Optional (future):** Add or extend tests that assert surface block from chunk buffer matches `getSurfaceBlockAt` for the same seed/coords, and that every block type returned by `getSurfaceBlock` has a non-zero terrain block ID.

---

## 4. Doc vs code

- [SURFACE_GENERATION.md](./SURFACE_GENERATION.md) §4.2 correctly describes the worker’s order of checks, including “both not desert” and `SNOW_BIOMES` including `jagged_peaks`.
- §7.2 correctly states that surface logic exists in three places and must be kept in sync; game-terrain and terrain-sampling have been aligned or documented as above.
