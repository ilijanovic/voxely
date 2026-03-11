# Systems Overview – How Everything Fits Together

This document is the **meta overview** for Voxely: how world generation, biomes, biome transitions, blocks, entities (mobs), and atmosphere/weather connect. For “where to find code” use [PROJECT_MAP.md](./PROJECT_MAP.md); for runtime architecture use [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Summary

- **Seed** drives all deterministic world generation (terrain, biomes, features, structures).
- **Climate** (temperature, humidity, continentalness, erosion, etc.) is sampled from noise and selects **biomes** per column; height can refine the biome (e.g. snowy_slopes on mountains).
- **Biomes** drive terrain shape (height, layers), **surface blocks** (grass, sand, snow), **features** (trees, flowers, ore), and **entity spawn** (each animal kind has a list of allowed biomes).
- **Blocks** come from the terrain pipeline (stratigraphy + surface rules by biome) plus **player edits** stored as overrides in the chunk runtime.
- **Entities (mobs)** spawn when a chunk is loaded; spawn positions use the world API’s `getBiome(x,z)` so only biomes in that kind’s `spawnBiomes` get animals.
- **Atmosphere** is day/night (sun/moon, sky, fog). **“Weather”** is currently only a **snow effect**: falling particles in cold biomes (snow, grove, snowy_slopes, frozen_peaks, jagged_peaks). There is no generic rain or global weather system.

---

## How the systems connect

```mermaid
flowchart TB
  Seed[Seed]
  Climate[Climate noise]
  Biomes[Biomes]
  Heightmap[Heightmap and shape]
  Carving[Carving caves]
  Stratigraphy[Stratigraphy and layers]
  Surface[Surface rules by biome]
  Features[Features trees ore etc]
  Structures[Structures villages temples]
  Payload[ChunkDataPayload]
  Blocks[Blocks in world]
  Mods[Player block modifications]
  WorldApi[World API getBlock getBiome getSurfaceY]
  Entities[Entity spawn]
  Atmosphere[Atmosphere day night fog]
  SnowEffect[Snow effect in cold biomes]

  Seed --> Climate
  Seed --> Heightmap
  Climate --> Biomes
  Heightmap --> Biomes
  Biomes --> Surface
  Biomes --> Features
  Heightmap --> Carving
  Carving --> Stratigraphy
  Stratigraphy --> Surface
  Surface --> Payload
  Features --> Payload
  Structures --> Payload
  Payload --> Blocks
  Mods --> Blocks
  Blocks --> WorldApi
  Biomes --> WorldApi
  WorldApi --> Entities
  Biomes --> Entities
  WorldApi --> SnowEffect
  Atmosphere --> SnowEffect
```

---

## World generation flow

World generation is a **multi-stage pipeline** (pure logic in `src/terrain/`, no THREE/DOM):

1. **Stage 1 – Heightmap + biome map**: Climate noise and height determine which biome each column belongs to; height can override to variants (e.g. snowy_slopes, frozen_peaks).
2. **Stage 2 – Carving**: 3D noise carves caves (base, cheese, spaghetti).
3. **Stage 3 – Stratigraphy**: Layers (stone, dirt, etc.) and surface material; water fill below water level.
4. **Stage 4/5 – Features and structures**: Trees, flowers, ore, ground cover, desert decor, shore vegetation; template structures (villages, temples).

The pipeline produces a **ChunkDataPayload** (voxel buffer, heightmap, optional geometry). The main thread applies payloads into meshes and stores chunk data for block lookups. Player block changes are **overrides** on top of generated terrain.

See [TERRAIN_SPEC.md](./TERRAIN_SPEC.md) for pipeline details and invariants; [ARCHITECTURE.md](./ARCHITECTURE.md) for worker contract and chunk apply.

---

## Biomes and transitions

Biomes are chosen from **climate parameters** (temperature, humidity, continentalness, erosion, weirdness) sampled deterministically from seed and coordinates. Selection is a nearest-match in “climate space”, so boundaries appear where a different biome becomes the best match even though the underlying noise is smooth. Height can further refine the biome (e.g. high elevation in a mountain base → snowy_slopes or peaks). Surface block type (grass/sand/snow) and colors use the resolved biome, with dithered transitions near boundaries to avoid hard lines.

The **Plains** biome is our canonical example for this system: temperate, moderately humid, smooth inland terrain; gentle height profile; grass‑over‑dirt surface; sparse oaks; plains villages; and strong association with farm animals and horses. Use it as the main reference when designing or tuning similar biomes.

See [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md) for the Minecraft-style explanation; [TERRAIN_SPEC.md](./TERRAIN_SPEC.md) for the biome data model and pipeline; [DESERT_BIOME_TECHNICAL.md](./DESERT_BIOME_TECHNICAL.md) for one biome as a worked example; and [PLAINS_BIOME.md](./PLAINS_BIOME.md) for a full plains biome breakdown.

---

## Blocks

Blocks are defined by the **terrain pipeline** (block IDs in the voxel buffer and heightmap) and by **block modifications** (player place/break) stored in the chunk runtime. The **block registry** maps block types to names, textures, and flags (solid, unbreakable). Surface blocks (grass, sand, snow) come from the biome’s layer config. Grass and foliage use colormap-based tinting for biome colors. At runtime, `getBlockAt` returns the overlay if present, otherwise the generated block; unloaded chunks return null.

See [BLOCK_SYSTEM.md](./BLOCK_SYSTEM.md) for how blocks are represented and rendered; [PROJECT_MAP.md](./PROJECT_MAP.md) for chunk runtime and block registry locations.

---

## Entities (mobs)

Entities spawn when a **chunk is loaded**. For each animal kind (e.g. sheep, pig, wolf), the spawn logic uses a **seeded RNG** per chunk and kind, then for each candidate position calls the world API’s **`getBiome(x,z)`**. Only positions whose biome is in that kind’s **`spawnBiomes`** get an entity (e.g. sheep: plains, forest, jungle, meadow; wolf: forest, jungle, mountain, snow, grove). So biomes directly control where mobs appear. Despawn happens when the chunk is unloaded.

Hostile mobs and spawn rules (e.g. light level) are not implemented yet; they are design targets in [GAMEPLAY_LLM.md](./GAMEPLAY_LLM.md). Code: [src/entities/spawn.ts](../src/entities/spawn.ts) (`ANIMAL_DEFS`, `spawnEntitiesForChunk`).

---

## Atmosphere and “weather”

- **Atmosphere** (`src/atmosphere.ts`): Day/night cycle, sun and moon position, sky color, fog. Updated per frame from the main loop; affects lighting and terrain fog.
- **Weather**: There is no generic weather system (no rain, no global “storm” state). The only weather-like effect is **snow**: falling particles visible only in **cold biomes** (snow, grove, snowy_slopes, frozen_peaks, jagged_peaks) and when above the water surface. The snow effect uses the world API’s biome at the player position. See [src/snow-effect.ts](../src/snow-effect.ts) (`COLD_BIOMES`, `SnowEffectContext`).

---

## Where to read more

| Topic | Document |
|-------|----------|
| How world gen, biomes, blocks, mobs, weather connect | This doc (SYSTEMS_OVERVIEW.md) |
| Where to find code (entry points, terrain, entities, UI) | [PROJECT_MAP.md](./PROJECT_MAP.md) |
| Runtime architecture (main loop, chunks, worker, apply) | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Terrain pipeline, biome model, invariants | [TERRAIN_SPEC.md](./TERRAIN_SPEC.md) |
| Biome boundaries and transitions (climate space) | [BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md) |
| Block representation and rendering | [BLOCK_SYSTEM.md](./BLOCK_SYSTEM.md) |
| Player mechanics, mining, placing, targets (mobs, day/night) | [GAMEPLAY_LLM.md](./GAMEPLAY_LLM.md) |
| One biome in depth (desert) | [DESERT_BIOME_TECHNICAL.md](./DESERT_BIOME_TECHNICAL.md) |
