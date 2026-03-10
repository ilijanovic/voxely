# Voxel Engine Docs

- **[PROJECT_MAP.md](./PROJECT_MAP.md)** – Where to find things in the codebase (entry points, game loop, terrain, blocks, entities, UI, assets, server, tests).
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** – Architecture overview, improvement roadmap, and algorithms for terrain, rendering, chunks, lighting, water, physics, and engine structure.

## Examples

- **`docs/examples/greedy-mesh-chunk.ts`** – Face culling and quad emission for one chunk; builds a single `BufferGeometry` from a 3D block array. Use this to replace or complement per-block InstancedMesh with a merged mesh per chunk.
- **`docs/examples/chunk-worker.example.ts`** – Minimal Web Worker that receives `{ type: 'generate', chunkX, chunkZ }` and posts back serialized chunk data (blocks + water cells). The main codebase uses `src/terrain-core.ts` and `src/terrain/worker-geometry.ts` with the full `ChunkDataPayload` (buffer, heightmapBuffer, optional geometryLayers/visibleBlockKeysByType); this example is a minimal reference for integration patterns.

These examples are reference implementations; integrate and adapt them into your main codebase (e.g. `src/`) as needed.
