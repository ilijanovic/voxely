# Voxely (Alpha) – Open Source Voxel Game Architecture

Voxely is an **alpha-stage open source voxel game** (Three.js + TypeScript). This document describes the **current runtime architecture**: how the main loop is structured, how chunks are planned/generated/applied, how the world is queried for collisions and interactions, and how the worker-based terrain pipeline is wired.

If you are looking for “where to find X in the codebase”, start with `docs/PROJECT_MAP.md`.

---

## Project status (Alpha)

**What “alpha” means here:**

- The game is **playable** and the core loop works (movement, chunk streaming, terrain generation, block interactions).
- The codebase is **actively evolving**; APIs and data contracts may change as systems are extracted/refined.
- Performance, content density, and multiplayer/world-sync are **work in progress**.

**What is considered stable enough to build on:**

- Deterministic terrain generation in a worker (pure `src/terrain/**` + `src/terrain-core.ts`)
- Runtime world queries and block overrides (`src/chunk-runtime.ts`)
- Chunk streaming + apply pipeline (`src/game/chunks/**`)

**Known alpha limitations (non-exhaustive):**

- Rendering uses instancing per block type; further batching/meshing is future work.
- Multiplayer currently synchronizes player transforms + chat, not world edits.
- Save/load persists player state and edits, but save format may change (`SAVE_VERSION`).

---

## High-level Overview

Voxely is a voxel sandbox built on **Three.js + TypeScript**. At runtime it consists of:

- **Main thread orchestration** (`src/game.ts`): init order, render loop, input + controls, player physics/collision, block interactions, saving, and integrating subsystems.
- **Chunk runtime state** (`src/chunk-runtime.ts`): loaded chunk data + block modifications (player edits) + helpers for block lookup.
- **Terrain + biomes (pure)** (`src/terrain/**`, `src/terrain-core.ts`): deterministic sampling and **pipeline-based** chunk generation (no Three.js, no DOM).
- **Chunk worker** (`src/chunk.worker.ts`): generates chunk payloads off the main thread.
- **Chunk apply / mesh building** (`src/game/chunks/chunk-apply.ts`): converts chunk payloads into Three.js meshes and registers chunk data for queries.
- **Subsystems**: materials/colormaps, atmosphere/day-night, entities, multiplayer, UI/hotbar, saving.

---

## Startup and Main Loop

### Initialization

`src/game.ts` is the entry point and orchestrates initialization in roughly this order:

- **Materials + colormaps**: `src/game/init/materials.ts` creates block materials (incl. water) and loads grass/foliage colormaps (used for per-instance tinting).
- **Scene + renderer**: `src/game/init/scene.ts` creates `scene`, `camera`, `renderer`, fog, and a `torchContainer`.
- **Chunk worker client**: `src/game/chunks/chunk-worker-client.ts` starts `src/chunk.worker.ts` and sends `{ type: "init", seed }`.
- **World API**: `src/world-api.ts` is set so other modules can query blocks/biome/surface.
- **Controls + input**: Pointer lock controls and key bindings in `src/game.ts`.
- **(Optional) Multiplayer**: `src/multiplayer.ts` connects via Socket.IO and spawns remote player meshes.

### Frame update order (conceptual)

Each frame, `src/game.ts` performs a loop that can be summarized as:

1. **Chunk planning / streaming**: decide which chunks to load/unload based on player position (and optionally look direction).
2. **Apply incoming worker payloads**: build meshes + register chunk data.
3. **Player movement and collisions**: integrate input, resolve voxel collisions via world queries.
4. **World interactions**: block break/place, drops, torches.
5. **Entities update**: movement / AI / animation for spawned entities.
6. **Atmosphere + lighting**: update sun direction, fog, and shadow configuration.
7. **Render**: draw scene.

The exact call structure is in `src/game.ts`, but this ordering is the mental model for how systems interact.

---

## World Data Model and Queries

### Loaded chunks vs player modifications

The world you see is the combination of:

- **Generated chunk voxel maps** (loaded chunks)
- **Player-made edits** stored as overrides

The authoritative runtime state lives in `src/chunk-runtime.ts`:

- `chunks: Map<number, ChunkData>`: loaded chunk data indexed by `chunkKeyNumeric(cx, cz)`.
- `blockModifications: Map<number, BlockType | "air">`: overrides indexed by `blockKeyNumeric(bx, by, bz)`.
- `getBlockAt(bx, by, bz)`: returns `"air"`/a block type when loaded, `null` if the chunk is not loaded.

This setup is critical because **collisions, mining, and placement** need fast queries that reflect player edits, even though chunk generation is deterministic.

### World API (cross-module contract)

`src/world-api.ts` exposes a small interface (`WorldApi`) which is set at init time:

- `getBlockAt(bx, by, bz)`
- `getSurfaceY(x, z)` / `getColumnSurfaceY(x, z)`
- `getBiome(x, z)`

Modules outside `src/game.ts` use this to avoid tight coupling and to keep `src/terrain/**` pure.

---

## Chunk Streaming (Main Thread)

### Planning: what to load/unload

Chunk streaming is coordinated by `src/game/chunks/chunk-manager.ts`:

- Reads current render distance from graphics settings
- Uses a planner (`planChunksAroundPlayer`) to compute:
  - `toLoad`: chunks inside render distance not yet loaded/pending
  - `toUnload`: chunks outside render distance
- Tracks `pendingChunkKeys` to avoid duplicate in-flight requests

### Worker vs sync fallback

`updateChunks()` supports two modes:

- **Worker mode**: post `{ type: "generate", chunkX, chunkZ, blockMods }` to the worker.
- **Sync mode**: call a synchronous generator (fallback) when worker is unavailable.

In both cases, unloading removes chunk scene graph objects and deletes runtime entries.

### Spawn side effects when chunk becomes visible

After chunks are added, `updateChunks()` triggers chunk-level entity spawning (`spawnEntitiesForChunk`) for newly loaded chunks.

---

## Worker Terrain Generation (Pure Pipeline)

### Worker contract

The worker lives at `src/chunk.worker.ts` and speaks a minimal message protocol:

- Main → worker: `{ type: "init", seed }`
- Main → worker: `{ type: "generate", chunkX, chunkZ, blockMods }`
- Worker → main: `ChunkDataPayload`

`ChunkDataPayload` currently contains:

- `chunkX`, `chunkZ`
- `heightmap: number[][]`
- `voxelMapEntries: Array<[localKey, BlockType]>` (sparse: only non-air, non-carved)

### Terrain core: createChunkGenerator

All heavy generation is in `src/terrain-core.ts` (pure, worker-safe). The generator:

- Creates seeded **2D/3D simplex noises** (climate, detail, erosion, weirdness, mountains, caves, etc.)
- Selects biomes via `src/terrain/biomes/**`:
  - climate bounds (`getLandBiomeByClimate`, blending)
  - optional 6D “multi-noise” selection (`getBiomeByMultiNoise`) for variants
- Computes:
  - **continentalness** and a coastal blend band (ocean ↔ land)
  - **height** (macro + detail + mountain + ridge – erosion)
  - **resolved biome** that can depend on height (e.g. slopes/peaks variants)
  - **surface block** with dithered transitions near biome boundaries (no hard “ruler lines”)

### Pipeline stages

Chunk generation is implemented as a **multi-stage pipeline** (`src/terrain/pipeline*` and `src/terrain/stages/**`):

- **Stage 1**: heightmap + biome map (climate + height rules)
- **Stage 2**: 3D carving (caves) using 3D noise and a threshold
- **Stage 3**: stratigraphy / layering (surface + subsurface + stone, plus water fill below `WATER_LEVEL`)
- **Stage 4**: structures/features (currently includes trees via a feature module)

This staged approach keeps terrain logic composable and makes it easier to add features without mixing concerns.

---

## Applying Chunk Payloads (Main Thread Mesh Build)

`src/game/chunks/chunk-apply.ts` turns `ChunkDataPayload` into:

- A `THREE.Group` containing:
  - **InstancedMeshes** per block type (after visibility filtering)
  - Optional **tall grass** instancing (cross geometry), placed deterministically
  - A chunk-local **water surface mesh** (built from the heightmap)
- A `ChunkData` runtime object stored in `chunks`:
  - `voxelMap: Map<localKey, BlockType>` for fast queries
  - `heightmap` + metadata (`cx`, `cz`, group reference, etc.)

### Visibility filtering (cheap culling)

Before instancing, the block positions are filtered by `filterVisibleBlocks()` so fully internal blocks are not rendered. This is a performance win without changing the instancing approach.

### Biome-dependent tinting

Grass and foliage use per-instance colors derived from colormap textures:

- Grass: `setGrassInstanceColors()`
- Leaves/foliage: `setFoliageInstanceColors()`

This keeps the geometry instanced while still allowing biome coloration.

---

## Rendering, Atmosphere, and Lighting

- **Renderer and camera**: `src/game/init/scene.ts`
  - Fog is set on the scene.
  - Shadows can be enabled/disabled from graphics settings.
- **Materials**: `src/game/init/materials.ts` builds block materials and caches them.
  - Water is a transparent `MeshStandardMaterial` with polygon offset to reduce z-fighting.
- **Atmosphere**: `src/atmosphere.ts` handles day-time tracking and sun direction, and `src/game.ts` applies it to lights/sky.

---

## Interactions and Simulation

### Player movement and collisions

Voxel collisions are resolved in `src/game-collision.ts` via `resolveVoxelCollisions()`, which queries world blocks using the runtime world API / `getBlockAt`.

### Mining, placement, drops, torches

World interactions are split into modules under `src/game/world-interactions/**`:

- Mining/breaking blocks updates `blockModifications` and invalidates column caches as needed.
- Placement consumes hotbar inventory and also writes modifications.
- Drops and pickups are simulated as entities/items that update each frame.
- Torches are tracked as placed objects and can affect shadows.

### Entities

Entity spawning is chunk-driven (`src/entities/spawn.ts`). Per-frame logic is split into:

- `src/entities/movement.ts`
- `src/entities/ai.ts`
- `src/entities/animation.ts`

---

## Saving / Persistence

Saving is handled in `src/save.ts` and coordinated by `src/game.ts`.

Saved state includes (at minimum):

- player transform + look angles
- world seed + save version
- removed blocks and placed blocks (serialized from `blockModifications`)
- placed torches
- day time

On load, block modifications are restored and relevant nearby chunks are generated so the player does not spawn into an empty world.

---

## Multiplayer (Optional)

Multiplayer is implemented in `src/multiplayer.ts` using Socket.IO:

- Connects to a server (`SERVER_URL`)
- Sends local player movement at a rate limit (threshold + max send rate)
- Receives remote states and interpolates them for smooth motion
- Spawns remote player meshes in the local scene (requires `createPlayerMesh` callback)
- Exposes subscriptions for connection status and chat events

The multiplayer layer is currently **state replication for player transforms** + chat; it does not (yet) synchronize world edits.

---

## Extension Points (Practical Notes)

- **Add/modify terrain**: keep `src/terrain/**` pure (no Three.js, no DOM). Prefer adding new pipeline stages or features rather than mixing generation logic into apply/render code.
- **Chunk payload changes**: treat the payload as a contract between:
  - `src/terrain-core.ts` (payload producer)
  - `src/chunk.worker.ts` (transport)
  - `src/game/chunks/chunk-apply.ts` (payload consumer)
- **Biome changes**: update biome registry (`src/terrain/biomes/registry.ts`) and keep definitions cohesive (terrain params, blocks, climate/multi-noise selection).

---

## Roadmap (Ideas, Not Current Implementation)

The engine still uses instancing per block type and a per-chunk water surface. Future performance and visual improvements that fit this architecture well:

- **Greedy meshing** (reduce triangle count + draw calls further)
- **More feature stages** (rivers, lakes, additional structures) as pipeline stages/features
- **Chunk LOD** for far terrain
- **More stable shadows / advanced lighting** (only if needed after meshing wins)
