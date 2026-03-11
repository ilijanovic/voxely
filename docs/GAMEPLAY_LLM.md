# Voxely Gameplay Mechanics (LLM-Friendly)

This document is written for **AI assistants / LLMs** and humans who need an accurate, fast-to-scan description of how Voxely works.

- **Section A — Current behavior (IMPLEMENTED)** is **source-of-truth** for what the code does today.
- **Section B — Target behavior (MINECRAFT-LIKE SPEC)** is a **design spec** for what we want, even if it is **not implemented yet**.

If you are an AI assistant: **Do not treat Section B as implemented behavior.** Use it only as intended future rules.

---

## A) Current behavior (IMPLEMENTED)

### A1. World scale, chunks, and coordinates

- **Units**: 1 block = 1 world unit (Minecraft-like scale).
- **Chunk size**: 16×16 columns (`CHUNK_SIZE = 16`).
- **World height**: \(Y \in [0, 128)\) (`WORLD_HEIGHT = 128`).
- **Sea level / water level**: `WATER_LEVEL = 64`.
- **Water surface plane height**: `WATER_LEVEL + WATER_BLOCK_HEIGHT + WATER_PLANE_Y_OFFSET`, with `WATER_BLOCK_HEIGHT = 0.9`.
- **Determinism**: world terrain is generated from a seed (persisted); same seed → same world on reload.

### A2. Player interaction model (mining & placing)

#### Mining (block breaking)

- **Input**: mining is **hold left mouse** while pointer lock is active.
- **Raycast**: from the camera position/direction with **max distance 5** (`BREAK_DISTANCE = 5`).
- **Hold-to-break time**: **Per-block** (see block registry `breakTimeSeconds`). Flowers/ferns break instantly (0 s); dirt, sand, grass ~0.5 s; stone, wood ~1.5 s; bricks ~2 s. Default 1.0 s when not set.
- **Target stability**: mining progress only continues if the raycast keeps hitting the **same world block position** (not instance index).
- **Unbreakable blocks**: blocks marked `unbreakable` (e.g. bedrock) cannot be broken.
- **Visual feedback**: a “block crack” overlay has **10 stages** (0–9) based on progress.

#### Placement (blocks and torches)

- **Input**: right-click (requires pointer lock) or press **F** (works without pointer lock).
- **Raycast**: from the camera with **max distance 5** (`PLACE_DISTANCE = 5`).
- **Placement location**: uses the hit face normal to select the **adjacent** block cell.
- **Consumes inventory**: placing consumes **1 item** from the selected hotbar slot on success.

##### Solid block placement rules

- Only places if:
  - selected item is **not** `torch`
  - selected item count > 0
  - selected block type is **solid**
  - target cell is **air** (or outside currently loaded world data)
  - target cell does **not** overlap the player AABB (prevents placing inside yourself)
  - there is no existing block modification entry for that target key (no double-place race)
- Placement is stored as a **block modification** and triggers chunk visibility/meshing refresh.

##### Torch placement rules

- Torches are a **special case** (not a solid voxel).
- Prevents placing a torch **inside the player AABB**.
- Prevents duplicates: you cannot place two torches at the same numeric block key.
- Torch is represented as a `THREE.Group` containing:
  - a stick mesh, a flame mesh
  - a point light (`PointLight(0xffaa44, intensity=5, distance=40)`)
- Torch shadow casting depends on graphics settings (global shadows + torch shadows).

### A3. Drops and pickup

- When a block is broken, a **floating drop item** is spawned:
  - **Position**: centered in the block (`x+0.5, z+0.5`) and placed above the nearest solid ground below the broken block.
  - **Mesh**: small cube (`0.35 × 0.35 × 0.35`) using a material derived from the block’s top face (special cases: torch uses wood top; bedrock uses bedrock).
- Drop animation:
  - vertical “bob” (sin wave) with `bobSpeed = 3`, `bobHeight = 0.08`
  - rotates around Y over time
- **Pickup**:
  - player collects a drop if distance to player (3D) is < `pickupRadius = 1.4`
  - collection adds **one block** to inventory/hotbar stacking
  - drop mesh is removed from scene and disposed

### A4. Inventory and hotbar (what is real vs UI-only)

#### Hotbar (real logic)

- There is a **9-slot hotbar**.
- Each slot tracks a **block type** and a **count**.
- **Stacking**: counts stack up to **64** (`MAX_STACK_SIZE = 64`).
- **Starting hotbar**: includes basic blocks and starts with **5 torches** in the last slot.
- Picking up drops calls `addBlockToInventory(blockType)`:
  - first tries to stack into an existing slot of the same type (if count < 64)
  - otherwise uses the first empty slot (count <= 0) if available

#### Inventory UI (mostly cosmetic for now)

- The inventory screen shows:
  - armor slots, off-hand slot, and **a 2×2 crafting grid + result slot**
  - a 3×9 inventory grid
  - a hotbar view
- **Important**: crafting grid and the larger inventory grid currently behave as UI placeholders (no recipe logic is implemented in the gameplay loop).

### A5. Blocks (definitions and properties)

- Block definitions are centralized in `src/block-registry.ts`:
  - `id`, `displayName`, `textures` (single or 6-face), and optional flags:
    - `solid` (default true)
    - `transparent` (default false)
    - `unbreakable` (default false)
- “Placeable” includes solid blocks plus `torch` (special case).

### A6. Terrain and biomes (high-level)

- Terrain generation is a **pure pipeline** under `src/terrain/` (no Three.js, no DOM).
- Biomes are defined as a union type (see `Biome` in `src/types.ts`) and registered in `src/terrain/biomes/registry.ts`.
- Land biome selection uses **climate (temperature, humidity)** nearest-center selection, plus an optional **blend** (primary/secondary + weight).
- Ocean is selected by terrain sampling logic (continentalness), not by climate bounds.
- Terrain design intent, Minecraft-adapted mechanics (octaves/carvers/template pools), and change safety checklists live in `docs/TERRAIN_SPEC.md`.

**Biome list (current union):**

`plains`, `ocean`, `desert`, `savanna`, `forest`, `jungle`, `mountain`, `snow`, `meadow`, `grove`, `snowy_slopes`, `stony_peaks`, `frozen_peaks`, `jagged_peaks`, `cherry_grove`, `windswept_hills`, `windswept_gravelly_hills`, `windswept_forest`.

### A7. Trees

- Trees are generated as a terrain **feature stage** (deterministic noise-based placement).
- Trees place `wood` and `leaves` blocks into the voxel map (within chunk bounds).
- Leaves are only placed if above the current heightmap top at that column (prevents burying leaves).

### A8. Animals / entities (current)

- There is an entity system (`src/entities/`) with **animal kinds**:
  - `sheep`, `pig`, `wolf`
- Spawn behavior:
  - deterministic per chunk and animal kind (seeded from chunk key + kind)
  - each kind has a `maxPerChunk` (currently 1)
  - each kind has `spawnBiomes` (e.g. sheep/pig in plains/forest/jungle/meadow; wolf includes forest/jungle/mountain/snow/grove)
- Entities spawn when a chunk is loaded and despawn when the chunk is unloaded.

### A9. Multiplayer (mechanics note)

- Multiplayer exists (Socket.io). Core world interactions (mining/placing) are currently described here as local mechanics; networking consistency rules are out of scope for this doc.

---

## B) Target behavior (MINECRAFT-LIKE SPEC — NOT YET IMPLEMENTED)

This section is an **explicit design target**. Treat it as requirements for future implementation.

### B1. Crafting and recipes

- Implement a recipe system with:
  - 2×2 crafting (inventory) and 3×3 crafting table
  - shapeless and shaped recipes
  - recipe book (optional)
- Inventory should be authoritative:
  - moving items between inventory/hotbar
  - crafting consumes inputs and produces outputs
  - stack sizes follow Minecraft rules (default 64, some 16/1 where applicable)

**Integration hooks (suggested):**

- Data: `src/recipes/` (JSON or TS) + runtime registry.
- UI wiring: `src/components/Inventory.vue` should read/write a real inventory state.
- Gameplay loop: crafting should be independent of render loop; only inventory state changes.

### B2. Tools, hardness, mining speed

- Add tool items (hand, wood/stone/iron/diamond/netherite tiers) affecting:
  - break time per block (“hardness”)
  - correct-tool requirement for drops (e.g. stone requires pickaxe)
- Mining should support:
  - per-block break time, not a single global `BREAK_TIME`
  - block damage persistence while targeting the same block

### B3. Survival stats and damage (health/hunger/oxygen)

- Make the UI hearts/hunger bars reflect real stats.
- Add damage sources: fall damage, drowning, fire (future), mob attacks.
- Add regeneration rules (food-based), hunger drain, and sprinting costs.

### B4. Farming, animals, and drops

- Animals should have:
  - drops on death (meat/wool, etc.)
  - breeding and growth
  - simple pathing / behavior (follow, flee, wander)
- Add blocks for farming (farmland, crops) and growth ticks.

### B5. Day/night and hostile mobs

- Add a day/night cycle that affects spawning and lighting.
- Implement hostile mobs (zombie/skeleton/creeper equivalents) with:
  - spawn rules (light level, time, biome/structure constraints)
  - AI states (wander/chase/attack)

### B6. Lighting rules (Minecraft-like)

- Add discrete light propagation:
  - sky light vs block light
  - light level per block (0–15)
  - torches emit light affecting mob spawns and visuals

---

## Appendix: Fast “rules recap” (Current behavior)

- **Break distance**: 5 blocks.
- **Place distance**: 5 blocks.
- **Hold-to-break**: Per-block (block registry `breakTimeSeconds`; flowers instant, dirt/stone etc. vary).
- **Pickup radius**: 1.4 blocks.
- **Stack size**: 64.
- **Torch**: special object (mesh + point light), cannot be duplicated at same block key.
