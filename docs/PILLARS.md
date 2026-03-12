# Design Pillars (Voxely)

This document is the **source of truth** for product decisions. If a feature conflicts with a pillar, the feature changes (or is cut), not the pillar.

## Pillar 1 — Creative building with low friction
- Building must be fast, predictable, and forgiving.
- Player actions should have clear feedback and minimal hidden rules.

## Pillar 2 — Exploration that rewards curiosity
- The world should feel varied at multiple scales (macro regions + local detail).
- Rare sights and structures should exist, but not require extreme grind.

## Pillar 3 — Readable terrain silhouettes
- From a distance, terrain should communicate its biome/region.
- Prefer a few strong shapes over noisy micro-variation.

## Pillar 4 — Stability over novelty
- Determinism, save compatibility, and performance are worth more than extra variety.
- Changes should be incremental and protected by tests.

## What we do not optimize for (Non-goals)
- Photorealism.
- Hyper-realistic physics or survival simulation.
- Unbounded content scope (“just add more blocks/biomes endlessly”) without strong reuse and registries.

