# Architecture Constraints (Voxely)

This document lists **hard constraints** for safe development. If a change breaks any item here, it must be redesigned before merging.

## Terrain purity boundary
- Everything under `src/terrain/**` is **pure**:
  - no `THREE`, no DOM APIs, no network I/O
  - no time-based behavior
  - no global mutable state

## Determinism
- Same seed + same generator version ⇒ same terrain, biomes, features, and structures.
- No `Math.random()` in terrain; all randomness must be seeded and **coordinate-stable**.

## Worker contract boundary (chunk payload)
- `ChunkDataPayload` is a strict contract between:
  - producer: `src/terrain/index.ts` (via `src/terrain-core.ts`)
  - transport: `src/chunk.worker.ts` / `src/chunk-worker-handler.ts`
  - consumer: `src/game/chunks/chunk-apply.ts`
  - tests: `src/chunk-payload-contract.test.ts`
- If payload shape changes, update all sides in the same change and keep contract tests green.

## Runtime vs generation
- Entity spawning, atmosphere/weather, and rendering concerns must stay **out of** `src/terrain/**`.
- World edits (place/break) are **overrides** on generated terrain and must not re-roll biomes.

## Performance budgets (guiding constraints)
- Prefer coarse sampling + interpolation over per-voxel heavy math in hot loops.
- Avoid large per-chunk allocations in frequently executed stages (profile if unsure).

