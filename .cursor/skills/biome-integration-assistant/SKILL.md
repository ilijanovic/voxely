---
name: biome-integration-assistant
description: Adds or updates terrain biomes consistently across type unions, biome files, registries, and tests in this project. Use when the user asks to add a new biome, tune biome terrain/layers, or modify biome registry wiring.
---

# Biome Integration Assistant

Use this workflow for biome work in the voxel game terrain pipeline.

## Quick Start

1. Normalize biome id to `snake_case` (example: `cherry_grove`).
2. Update `Biome` union in `src/types.ts`.
3. Create or edit `src/terrain/biomes/<biome_id>.ts`.
4. Register terrain and layers in `src/terrain/biomes/index.ts`.
5. Update `ALL_BIOMES` in `src/terrain/biomes/registry.test.ts`.
6. If generation thresholds are affected, review `src/terrain/index.ts` and consumer usage in `src/game.ts`.

## Required File Touch Points

- `src/types.ts`
- `src/terrain/biomes/<biome_id>.ts`
- `src/terrain/biomes/index.ts`
- `src/terrain/biomes/registry.test.ts`

Optional when behavior changes beyond static registry:

- `src/terrain/index.ts`
- `src/chunk.worker.ts`
- `src/game.ts`

## Guardrails

- Keep terrain modules pure and serializable in `src/terrain/**`.
- Keep biome files small: export only terrain params and layer config.
- Use named exports in TypeScript modules.
- Keep comments and user-visible text in English.

## Done Criteria

- Biome appears in `Biome` union and `ALL_BIOMES`.
- Biome exists in both `BIOME_TERRAIN` and `BIOME_LAYERS`.
- Tests pass with `npm run test:run`.
- Build succeeds with `npm run build` for contract-level changes.
