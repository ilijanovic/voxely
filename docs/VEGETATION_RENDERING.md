# Vegetation Rendering in Voxel Games

This document describes how vegetation blocks (flowers, grass, ferns, wheat) are typically implemented in voxel games and how Voxely applies these practices.

## Geometry: Cross-Quads (Billboards)

Vegetation is not rendered as full cubes. Instead, games use **cross-quad** (billboard) geometry:

- Two vertical planes intersecting at 90° at their centre.
- Minimal polygon count while keeping a volumetric look.
- Same approach as in Minecraft for grass, flowers, ferns, tall grass, wheat, etc.

In Voxely, shared cross geometry is defined in `src/block-materials.ts` (`sharedTallGrassGeometry`). Chunk rendering uses this for flowers, fern, and tall grass in both the worker path (`chunk-apply.ts`) and the sync path (`chunk-generate-sync.ts`).

## Material: Alpha Cutout

Vegetation textures have transparent regions (e.g. around petals and stems). Games use **alpha test** (cutout):

- Pixels with alpha below a threshold are **discarded** (not blended).
- Only the plant shape is visible; no semi-transparent pixels.
- Avoids sorting issues that come with full alpha blending.

In Three.js this is done with `transparent: true` and `alphaTest` (e.g. `0.1`). Without alpha cutout, transparent texels can render as black or as a solid quad, giving a “black box” look.

## Double-Sided Rendering

Both sides of each quad must be visible so the plant looks correct from any angle:

- In Three.js: `side: THREE.DoubleSide`.
- Without it, back faces are culled and can appear black or missing when viewed from the other side.

## Collision

Vegetation blocks are **non-solid**: the player walks through them. Raycasting still hits them so the player can select and break them. In Voxely this is done via `solid: false` in `src/block-registry.ts` and collision in `src/game-collision.ts` using `isSolidBlock` from the registry.

## Summary

| Aspect        | Approach              | In Voxely                                                                 |
|---------------|-----------------------|----------------------------------------------------------------------------|
| Geometry      | Cross quads (2 planes)| `sharedTallGrassGeometry` in `block-materials.ts`                         |
| Transparency  | Alpha cutout          | `transparent: true` + `alphaTest: 0.1` for vegetation block materials      |
| Sides         | Double-sided          | `side: THREE.DoubleSide` for cross-geometry materials in `materials.ts`   |
| Collision     | Non-solid             | `solid: false` in `block-registry.ts`                                     |

Block definitions for vegetation live in `src/block-registry.ts`; materials are created in `src/game/init/materials.ts`.
