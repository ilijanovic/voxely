# Voxel Engine Docs

**Start here:** [SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md) for how systems fit together; then [PROJECT_MAP.md](./PROJECT_MAP.md) for code navigation.

- **[SYSTEMS_OVERVIEW.md](./SYSTEMS_OVERVIEW.md)** – How world generation, biomes, blocks, mobs, and atmosphere/weather fit together (meta overview). For code navigation use PROJECT_MAP; for runtime architecture use ARCHITECTURE.
- **[PROJECT_MAP.md](./PROJECT_MAP.md)** – Where to find things in the codebase (entry points, game loop, terrain, blocks, entities, UI, assets, server, tests).
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** – Architecture overview, improvement roadmap, and algorithms for terrain, rendering, chunks, lighting, water, physics, and engine structure.
- **[BLOCK_SYSTEM.md](./BLOCK_SYSTEM.md)** – LLM-first explanation of how blocks are represented, queried, and rendered (CURRENT vs TARGET).
- **[TERRAIN_SPEC.md](./TERRAIN_SPEC.md)** – LLM-first terrain/biome spec: design intent (how it should work and look), Minecraft-adapted mechanics, and change safety checklists.
- **[BIOME_TRANSITIONS.md](./BIOME_TRANSITIONS.md)** – Minecraft-style explanation of biome boundaries and transitions (climate space, density terrain, surface rules, features, color blending).
- **[GAMEPLAY_LLM.md](./GAMEPLAY_LLM.md)** – Gameplay reference for LLMs (mechanics, controls, world rules).
- **[RESOURCE_PACKS.md](./RESOURCE_PACKS.md)** – Resource pack compatibility and paths.
- **[LLM_WORKFLOW.md](./LLM_WORKFLOW.md)** – LLM workflow and usage notes.
- **[DESERT_BIOME_TECHNICAL.md](./DESERT_BIOME_TECHNICAL.md)** – Technical breakdown of desert biome (Minecraft-style pipeline).

## Examples

- **`docs/examples/greedy-mesh-chunk.ts`** – Face culling and quad emission for one chunk; builds a single `BufferGeometry` from a 3D block array. Use this to replace or complement per-block InstancedMesh with a merged mesh per chunk.
- **`docs/examples/chunk-worker.example.ts`** – Minimal Web Worker that receives `{ type: 'generate', chunkX, chunkZ }` and posts back serialized chunk data (blocks + water cells). The main codebase uses `src/terrain-core.ts` and `src/terrain/worker-geometry.ts` with the full `ChunkDataPayload` (buffer, heightmapBuffer, optional geometryLayers/visibleBlockKeysByType); this example is a minimal reference for integration patterns.

These examples are reference implementations; integrate and adapt them into your main codebase (e.g. `src/`) as needed.
