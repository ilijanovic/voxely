# Block System (LLM-First)

This document explains how Voxely’s block system works.

- **Section A — CURRENT (IMPLEMENTED)** is **source-of-truth** for what the code does today.
- **Section B — TARGET (MINECRAFT-LIKE SPEC)** is a **design spec** for what we want, even if it is **not implemented yet**.

If you are an AI assistant: **Do not treat Section B as implemented behavior.**

---

## A) CURRENT behavior (IMPLEMENTED)

### A1. Coordinate system & block cells

- **Scale**: 1 block = 1 world unit.
- **Grid**: blocks live on an integer grid \((x,y,z)\).
- **Cell occupancy convention**: a block at integer cell \((bx,by,bz)\) occupies the world range \([bx..bx+1]\), \([by..by+1]\), \([bz..bz+1]\). This convention is shared by rendering and collision/world queries.
  - Implementation anchor: `getBlockAt()` + comment in `src/chunk-runtime.ts`.

### A2. Chunk shape & addressing (runtime and terrain)

- **Chunk footprint**: \(16 \times 16\) columns (`CHUNK_SIZE = 16`).
- **World height**: \(Y \in [0, WORLD_HEIGHT)\) (currently `WORLD_HEIGHT = 128`).
- **Flat indexing**: voxel buffers and local keys use the same layout:

  \[
  key = lx + ly \cdot CHUNK\_SIZE + lz \cdot CHUNK\_SIZE \cdot WORLD\_HEIGHT
  \]

  - Runtime helper: `localKey(lx,ly,lz)` in `src/chunk-runtime.ts`
  - Terrain helper: `localKey(lx,ly,lz)` in `src/terrain/block-ids.ts`

### A3. World state layering: generated chunks + player edits

At runtime the “authoritative” world state is a **composition** of:

- **Generated chunk data** (loaded chunks)
- **Player block modifications** (overrides on top of generated terrain)

The lookup order is:

1. **Bounds**: if `by` is outside `[0..WORLD_HEIGHT)`, treat as air.
2. **Overrides first**: `blockModifications` map (keyed by block position string from `blockKeyString(bx, by, bz)`).
3. **Generated data**: if the containing chunk is loaded, return the block from its `voxelMap`.
4. **Unloaded**: if the chunk is not loaded, return `null` (unknown/unavailable to the caller).

Implementation anchor: `getBlockAt(bx,by,bz)` in `src/chunk-runtime.ts`.

### A4. Block identity, properties, and terrain IDs

For block type categories and behavior (solid, plant, crop, fluid), see [BLOCK_TYPES.md](BLOCK_TYPES.md).

Voxely uses two related representations:

#### A4.1 Block definitions (game-facing)

- Central registry: `src/block-registry.ts`
- A block definition includes:
  - `id` (string id, e.g. `"stone"`)
  - `displayName`
  - `textures` (single texture or per-face textures)
  - flags such as `solid`, `transparent`, `unbreakable`

#### A4.2 Terrain voxel buffer IDs (pipeline-facing)

Terrain generation uses a **flat `Uint8Array` voxel buffer**, where each byte is a block type id:

- Mapping: `src/terrain/block-ids.ts` (`typeToId()`, `idToType()`)
- `AIR_ID = 0` means air.
- `CARVED_ID = 255` is a sentinel used by cave carving to mark “leave as air” during later stages.
- Block heights: snow layers use fractional heights via `getBlockHeightById()` (used for rendering/geometry decisions).

### A5. Chunk payload → meshes (rendering and visibility)

The runtime mesh you see is generated from a **chunk payload contract** and applied on the main thread:

- **Producer** (pure): `src/terrain/**` (via `src/terrain-core.ts`)
- **Worker transport**: `src/chunk.worker.ts` + `src/chunk-worker-handler.ts`
- **Consumer** (main thread): `src/game/chunks/chunk-apply.ts`

Two rendering paths exist, depending on what the payload includes:

#### A5.1 Worker geometry layers (face culling in the worker)

The worker can produce `geometryLayers`, which are **non-indexed** face batches grouped by face index (matching Three.js BoxGeometry face material ordering: right/left/top/bottom/front/back).

- Visibility rule (implemented): faces between two non-empty voxels are not emitted (“hidden face rule” / occlusion culling at the voxel-face level).
- Implementation anchor: `buildWorkerGeometryFromVoxelBuffer()` in `src/terrain/worker-geometry.ts`.
- Application anchor: `addGeometryLayerMesh()` in `src/game/chunks/chunk-apply.ts`.

#### A5.2 Instancing per visible block type (positions-only layers)

The payload can also include `visibleBlockKeysByType`, which is decoded into world positions and rendered as `THREE.InstancedMesh` layers per block type.

- Implementation anchors:
  - `buildPositionsByTypeFromVisibleKeys()` in `src/game/chunks/chunk-apply.ts`
  - `addInstancedLayer()` in `src/game/chunks/chunk-apply.ts`

#### A5.3 Chunk streaming bounds what exists in the scene

Chunks are planned/loaded/unloaded around the player; only loaded chunks can be meshed and rendered.

- Entry points: `src/game/chunks/chunk-manager.ts`, `src/game/chunks/chunk-planning.ts`
- Frustum visibility helpers exist in: `src/game/render/frustum-visibility.ts`

### A6. Lighting (CURRENT)

Voxely currently does **not** implement Minecraft-style voxel light propagation (0–15 light levels + flood-fill updates) as part of the block system.

- **Torches** are implemented as explicit meshes with a `THREE.PointLight` (gameplay-level light), not as per-voxel baked light.
  - Reference: torch section in `docs/GAMEPLAY_LLM.md`

---

## B) TARGET behavior (MINECRAFT-LIKE SPEC; not necessarily implemented)

This section captures Minecraft-like concepts that can make an LLM more effective when reasoning about voxel engines. Treat it as **design guidance**, not current Voxely behavior.

### B1. Chunk sections & sparse memory

- Split a chunk vertically into **sections** (e.g. \(16\times16\times16\)).
- If a section is all-air, mark it empty and skip memory + rendering work.

**Implementation hook (Voxely)**: would change the `ChunkDataPayload` contract and runtime `ChunkData` storage. The conversion points today are `buildVoxelMapFromBuffer()` and chunk apply logic in `src/game/chunks/chunk-apply.ts`.

### B2. Palettes & bit-packing

- Use a per-section palette of unique block states.
- Store palette indices in a bit-packed array to reduce memory.

**Implementation hook (Voxely)**: terrain currently emits a flat `Uint8Array`. A palette system would replace or wrap that buffer and would require updates across the worker boundary (`src/chunk-worker-handler.ts`), payload contract tests (`src/chunk-payload-contract.test.ts`), and consumers (`src/game/chunks/chunk-apply.ts`).

### B3. Rendering optimizations (beyond hidden-face culling)

- **Frustum culling**: render only what’s in the camera view.
- **Occlusion**: don’t draw interior faces (already present in Voxely’s worker geometry path).
- **Meshing**: merge faces into larger quads (“greedy meshing”) to reduce vertex count.

**Implementation hook (Voxely)**: see `docs/examples/greedy-mesh-chunk.ts` for a reference mesher that could replace/complement per-block instancing and/or current per-voxel face emission.

### B4. Voxel lighting (0–15 levels, flood fill updates)

- Maintain skylight and block-light levels per cell.
- Recompute on block changes via flood-fill (light removal + re-propagation).

**Implementation hook (Voxely)**: could live as a **pure** module (like `src/terrain/**`) that produces per-vertex colors or a light texture, then feeds into materials in `src/block-materials.ts` and mesh building in `src/game/chunks/chunk-apply.ts`.

### B5. Block entities (tile entities)

- Some blocks carry extra state (inventories, timers, text).
- Stored separately from the main voxel array for performance and flexibility.

**Implementation hook (Voxely)**: would extend save/load (`src/save.ts`) and likely introduce a chunk-local registry keyed by integer block keys (similar to `blockModifications`), plus network sync if multiplayer wants to replicate them.

### B6. Tick model

- Run simulation at fixed tick rate (e.g. 20 TPS).
- Use random ticks for sparse updates to avoid scanning all blocks.

**Implementation hook (Voxely)**: gameplay “ticks” would integrate into `src/game.ts` loop structure and/or a dedicated scheduler module, keeping terrain generation (`src/terrain/**`) deterministic and side-effect-free.
