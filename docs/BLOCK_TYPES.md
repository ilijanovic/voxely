# Block Types – Categories and Behavior

This document explains **what types of blocks exist** in Voxely and how they differ in collision, model, placement, and interaction. Implementation is driven by block-registry flags and fixed lists; for coordinates, chunks, and payload details see [BLOCK_SYSTEM.md](./BLOCK_SYSTEM.md).

---

## 1. Introduction

Not all blocks behave the same. Solid blocks (e.g. stone, dirt) fill the cell and block movement; plants and crops are typically non-solid and use cross-style geometry; fluids spread and use special rendering. This taxonomy describes the **block type categories** and how Voxely implements or targets them. For rendering details (cross quads, materials) see [VEGETATION_RENDERING.md](./VEGETATION_RENDERING.md); for water flow see [WATER_FLOW_TECHNICAL.md](./WATER_FLOW_TECHNICAL.md).

---

## 2. Block Type Categories

### Solid blocks

Examples: stone, dirt, grass, planks, sandstone, cactus.

- **Model:** Full 1×1×1 cube.
- **Collision:** Solid; players and mobs cannot pass through. Used for collision via `isSolidBlock()` (chunk-runtime + block-registry).
- **Placement:** No special rules; can be placed on any surface.
- **In Voxely:** Defined in `src/block-registry.ts` with `solid: true` (default). Collision in `src/game-collision.ts` uses `isSolidBlock` from the registry; water flow uses the same notion of “solid” to block spread.

### Plant / decoration blocks

Examples: dandelion, poppy, tulip_red, oxeye_daisy, blue_orchid, fern; optionally tall_grass, dead_bush.

- **Model:** Cross geometry (two intersecting quads) for a billboard look, not a full cube.
- **Collision:** Non-solid; players can walk through. Raycast still hits them for selection and breaking.
- **Placement:** In terrain generation they are placed by features on suitable ground (grass, dirt). No per-block placement validation at place time in the current implementation.
- **Breaking:** Instant (hand or shears); no tool required.
- **In Voxely:** `solid: false`, `transparent: true` in the block registry. Cross geometry is used for a fixed set of types in `src/game/chunks/chunk-apply.ts` (`CROSS_GEOMETRY_BLOCK_TYPES`: dandelion, poppy, tulip_red, oxeye_daisy, blue_orchid, fern). See [VEGETATION_RENDERING.md](./VEGETATION_RENDERING.md).

### Crop blocks

Examples: wheat_1 … wheat_8 (growth stages).

- **Model:** Typically cross or stage-specific geometry; multiple block types represent growth stages.
- **Collision:** Non-solid (or minimal hitbox in other games).
- **Placement:** Usually require farmland or dirt. In Voxely, wheat stages exist as block types in the terrain pipeline and registry; placement rules are not fully enforced.
- **Growth:** Minecraft-style crops advance via “random ticks” (light, hydration). **In Voxely:** Growth stages are encoded as separate block types (wheat_1…wheat_8); there is **no** random-tick growth or bone-meal acceleration yet—this is a possible future behavior.

### Fluid blocks

Examples: water_source, water_flowing_1 … water_flowing_7.

- **Model:** Special rendering (surface, transparency); flow level encoded in block type.
- **Collision:** Non-solid; movement may trigger swimming logic separately.
- **Behavior:** Spread and level updates via dedicated flow logic. Source blocks can be created when two adjacent sources border a cell with solid below (2-source rule).
- **In Voxely:** See [WATER_FLOW_TECHNICAL.md](./WATER_FLOW_TECHNICAL.md) and `src/game/fluid/water-flow.ts`. All water types use `solid: false`; `isSolid` in water-flow determines what blocks flow.

### Optional (Minecraft-style / future)

- **Two-high plants:** Breaking the bottom block removes the top block; breaking the top leaves the bottom. Not implemented in Voxely.
- **Block offset:** Plants offset randomly in x/z within the block for a less grid-aligned look. Voxely has a deterministic pseudo-random per position for some cross geometry; full Minecraft-style offset is optional.

---

## 3. Comparison Table

| Feature        | Solid (e.g. stone) | Plant (flower/fern) | Crop (wheat)   | Fluid (water)   |
|----------------|--------------------|---------------------|----------------|-----------------|
| **Collision**  | Solid              | Non-solid           | Non-solid      | Non-solid       |
| **Model**      | Full cube          | Cross (2 quads)     | Cross/stages   | Special         |
| **Ground**     | Any                | Grass/dirt (features)| Farmland/dirt  | Any             |
| **Breaking**   | Tool or instant    | Instant             | Instant        | N/A             |
| **Water/Piston** | Stays            | Destroyed           | Destroyed      | Flows           |
| **Offset**     | Grid-aligned       | Optional random     | Optional       | Grid-aligned    |

**In Voxely:** Solid vs non-solid is determined by `BlockDefinition.solid` and `isSolidBlock()` in `src/block-registry.ts` and `src/chunk-runtime.ts`. Cross models are used for the types in `CROSS_GEOMETRY_BLOCK_TYPES`. Water flow uses the same solid check to decide what blocks flow. Breaking and water/piston behavior are not fully specialized per category yet.

---

## 4. Where to Find It in the Code

| Concern            | Location |
|--------------------|----------|
| **Definitions & flags** | [src/block-registry.ts](../src/block-registry.ts) – `BlockDefinition`: `solid`, `transparent`, `unbreakable` |
| **Terrain IDs & list**  | [src/terrain/block-ids.ts](../src/terrain/block-ids.ts) – `TERRAIN_BLOCK_TYPES` (wheat_1…8, flowers, water_*); `typeToId` / `idToType` |
| **Cross geometry**      | [src/game/chunks/chunk-apply.ts](../src/game/chunks/chunk-apply.ts) – `CROSS_GEOMETRY_BLOCK_TYPES`; [src/block-materials.ts](../src/block-materials.ts) – `sharedTallGrassGeometry` |
| **Collision**           | [src/game-collision.ts](../src/game-collision.ts) – uses `isSolidBlock` from chunk-runtime / block-registry |
| **Water flow**          | [src/game/fluid/water-flow.ts](../src/game/fluid/water-flow.ts) – `isSolid` for “blocks flow” |

---

## 5. See Also

- [BLOCK_SYSTEM.md](./BLOCK_SYSTEM.md) – Coordinates, chunks, world state, payload, rendering paths.
- [VEGETATION_RENDERING.md](./VEGETATION_RENDERING.md) – Cross quads, materials, non-solid collision for vegetation.
- [WATER_FLOW_TECHNICAL.md](./WATER_FLOW_TECHNICAL.md) – Fluid representation, spread, and source creation.
