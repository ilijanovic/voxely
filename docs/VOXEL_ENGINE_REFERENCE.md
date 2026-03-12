# Voxel Engine Reference — Compact

This is a compact pointer doc to keep the repo context small.

## Primary external reference
- “Let’s Make a Voxel Engine” (tutorial series): `https://sites.google.com/site/letsmakeavoxelengine/home`

## Voxely-specific starting points
- Systems overview: `docs/SYSTEMS_OVERVIEW.md`
- Code navigation: `docs/PROJECT_MAP.md`
- Runtime architecture: `docs/ARCHITECTURE.md`
- Terrain invariants/spec: `docs/TERRAIN_SPEC.md`
- Worker contract boundary: `src/terrain-core.ts` ↔ `src/chunk-worker-handler.ts` ↔ `src/chunk.worker.ts` ↔ `src/game/chunks/chunk-apply.ts`

