# Terrain & Biome Specification (LLM-First)

This document is written for **AI assistants (LLMs)** and humans working on Voxely’s terrain system.

- **CURRENT (implemented)** describes what the code does today.
- **TARGET (design)** describes what we want, even if it is not implemented yet.

If you are an AI assistant: **do not assume TARGET behavior exists in code**. Use TARGET only as guidance for future changes.

---

## 1) Non‑negotiable invariants

### 1.1 Determinism

- **Same seed ⇒ same world** (terrain, biomes, features, structures) for the same version of the generator.
- All worldgen randomness must be **seeded** and **coordinate-stable** (no `Math.random()` in terrain).
- World edits (placed/removed blocks) are **overrides** on top of generated terrain and must not “re-roll” biomes.

### 1.2 Purity boundary

- Everything under **`src/terrain/**` must remain **pure**:
  - no `THREE`, no DOM APIs, no network, no side effects
  - deterministic computation only
- Worker boundary:
  - chunk generation runs in a worker via **`src/terrain-core.ts`** and must stay worker-safe.

### 1.3 Contract boundary (payload stability)

Treat chunk payload shape as a strict contract between:

- producer: `src/terrain/index.ts` (via `src/terrain-core.ts`)
- transport: `src/chunk.worker.ts`
- consumer: `src/game/chunks/chunk-apply.ts`
- tests: `src/chunk-payload-contract.test.ts`

If you change `ChunkDataPayload`, update **all** sides and the contract tests in the same change.

---

## 2) Mental model: the Voxely terrain pipeline

### 2.1 CURRENT stage order (implemented)

Terrain generation is a **12-stage pipeline** (Minecraft-aligned, pure logic) under `src/terrain/`.

- **1 empty** – No-op (`src/terrain/stages/noop.ts`).
- **2 structures_starts** – Compute structure origins for this chunk; store in `ctx.structureOrigins` (`src/terrain/stages/structures-starts.ts`).
- **3 structures_references** – No-op, reserved (`src/terrain/stages/noop.ts`).
- **4 noise** – Heightmap only (`src/terrain/stages/noise.ts`).
- **5 biomes** – Biome map from heightmap and climate (`src/terrain/stages/biomes.ts`).
- **6 carvers** – Runs carve-3d, carve-cheese, carve-spaghetti in order (`src/terrain/stages/carvers.ts`; see `carve-3d.ts`, `carve-cheese.ts`, `carve-spaghetti.ts`).
- **7 surface** – Stratigraphy / layering (`src/terrain/stages/surface.ts` → `stratigraphy.ts`).
- **8 features** – Feature list (trees, ore, flowers, etc.) then paint template structures from `ctx.structureOrigins` (`src/terrain/stages/features.ts`, `paint-structures.ts`; features in `src/terrain/features/**`, templates in `src/terrain/structures/**`).
- **9 initialize_light**, **10 light**, **11 spawn**, **12 full** – No-ops (`src/terrain/stages/noop.ts`).

### 2.2 TARGET: strict responsibilities per stage (design rule)

Each stage should have a single responsibility:

- **Biome placement**: decide “which biome is here” (based on climate/noise/height rules).
- **Shape**: decide “what is solid vs air” (height/density).
- **Carving**: remove solid into air (caves/canyons).
- **Surface rules**: replace top layers by biome (sand/grass/snow) and water fill.
- **Decorators/features**: trees, plants, small decorations, ore (if/when added as features).
- **Structures**: villages/temples/etc with deterministic template placement.
- **Finalization**: runtime spawns/lighting are **not** part of terrain purity.

---

## 3) Biomes: data model and how to structure a biome

### 3.1 CURRENT: where biome data lives

- Registry + selection: `src/terrain/biomes/registry.ts`
- Aggregates (derived): `src/terrain/biomes/index.ts` (`BIOME_REGISTRY`, `BIOME_TERRAIN`, `BIOME_LAYERS`)
- Types: `src/terrain/biomes/types.ts`, biome union in `src/types.ts`
- Per-biome definitions: `src/terrain/biomes/*.ts`

### 3.2 TARGET: the biome file template (design)

Each biome definition should be a **single source of truth** for:

- **Terrain params** (macro shape constraints)
- **Block rules** (surface/subsurface/shore/underwater)
- **Climate bounds** (temperature/humidity ranges, used for selection)
- **Multi-noise center + weights** (if used)
- **Feature hooks** (which feature functions run for this biome, and their desired density)
- **Look targets** (silhouette, transitions, palette intent)

Avoid scattering biome-specific logic into unrelated pipeline stages.

### 3.3 Biome map vs block overrides (Minecraft-inspired, adapted)

Minecraft’s key property: **biome is a separate layer** and does not change if the player replaces blocks.

**TARGET rule for Voxely**:

- Keep a deterministic **biome map** per column `(x,z)` produced by Stage 1.
- Use biome map for:
  - surface rules / features
  - biome tinting (grass/foliage color maps)
  - future spawn rules
- Player block modifications must not rewrite the biome map.

---

## 4) Look targets: what the world should look like

These are design constraints that guide parameter tuning.

### 4.1 Silhouette readability

- From a distance, the player should recognize:
  - flat plains vs dunes vs forest canopy vs mountain chain
- Prefer **few strong shapes** over noisy micro-variation.

### 4.2 Transitions (no “ruler lines”)

- Biome transitions should be **feathered**:
  - dithered surface blocks near boundaries
  - gradual vegetation density changes
- Coasts should use a **blend band** (ocean ↔ land), not a hard edge.

For a deeper Minecraft-style explanation of why transitions look natural (continuous climate fields → discrete biome labels → surface rules → features → color blending), see **`docs/BIOME_TRANSITIONS.md`**.

### 4.3 Vertical composition

- Define a clear story for:
  - surface thickness (e.g. sand depth)
  - subsurface depth and when stone is exposed
  - snowline behavior in cold/high areas (now/future)

### 4.4 Desert (specific)

**TARGET desert look**:

- Dunes: mostly smooth, occasional sharper ridges.
- Sparse decor: dead bushes common-ish, cactus rare-ish.
- No grass/foliage tint involvement (sand dominates).

**Blocker rule**:

Desert is not “complete” unless its required primitives exist in code:

- **Required terrain block IDs**: `cactus`, `dead_bush`
- **Required textures** (already present in `public/assets/minecraft/...`):
  - `cactus_side`, `cactus_top`, `cactus_bottom`
  - `deadbush` (note: Minecraft texture name is `deadbush`, not `dead_bush`)

**CURRENT (resolved)**:

- `src/terrain/features/desert-decor.ts` places `cactus`/`dead_bush`.
- `src/block-registry.ts` defines both blocks (with textures); `src/terrain/block-ids.ts` includes them in `TERRAIN_BLOCK_TYPES`. Desert decor is fully wired.

---

## 5) Minecraft deep mechanics (adapted to Voxely)

This section captures high-level generation ideas from Minecraft and translates them into actionable design rules for Voxely.

### 5.1 Noise octaves (fBm) and “detail layers”

**Problem**: single noise is too smooth; terrain needs multi-scale structure.

**TARGET rule**:

- Use layered noise (fBm-style):
  - octave \(i\) has higher frequency and lower amplitude than octave \(i-1\)
  - macro octaves define continents/mountains; micro octaves add surface detail
- Keep octave configuration explicit:
  - number of octaves
  - base frequency, lacunarity (freq multiplier), persistence (amp multiplier)

**LLM guidance**:

- Do not “sprinkle” random detail per block. Always express detail as:
  - deterministic noise, or
  - deterministic hashed sampling (coordinate-stable), or
  - a feature stage with explicit density rules.

### 5.2 Carvers vs noise caves

Minecraft has two conceptual cave systems:

- **Carvers (“worms”)**: random walks that remove blocks along a path (caves/canyons).
- **Noise caves**: density/noise thresholds producing large pockets (“cheese”) and thin tunnels (“spaghetti”).

**CURRENT**:

- Voxely already has noise-style carving stages:
  - `carve-3d.ts`, `carve-cheese.ts`, `carve-spaghetti.ts`

**TARGET**:

- If adding “worm” carvers:
  - implement as a separate stage with strict parameters (start rate, step count, radius curve)
  - keep deterministic seeding per chunk and stable cross-chunk continuation rules

### 5.3 Template pools / “jigsaw” logic for structures

Minecraft’s jigsaw system is essentially:

- templates grouped into pools
- weighted selection
- maximum depth
- terminators to cleanly stop growth

**TARGET rule for Voxely**:

- Treat structures as **template pools** even if the implementation is simpler:
  - use weights to avoid repetitive villages
  - enforce max depth / size
  - define terminator pieces
- Keep structure placement deterministic and chunk-stable:
  - origins in `src/terrain/structures/origins.ts`
  - templates in `src/terrain/structures/templates/**`

### 5.4 Interpolation grids (performance optimization)

Minecraft avoids computing a full 3D density per voxel by sampling a coarse grid and interpolating.

**TARGET rule**:

- If Voxely introduces expensive 3D density fields:
  - sample density on a coarse grid (e.g. 4×4×8) and interpolate
  - profile/measure first; do not add per-voxel heavy math without a grid strategy

### 5.5 Finalization pass (spawns are not terrain)

Minecraft’s “world is finished” after a finalization pass: mobs/entities spawn with biome/structure constraints.

**TARGET rule for Voxely**:

- Keep entity spawning out of `src/terrain/**`.
- Define spawn rules by biome in a runtime system (e.g. `src/entities/**`) using the world API:
  - “biome allows X”
  - “structure overrides in region”

### 5.6 Numeric stability (“Far Lands” lesson)

Old Minecraft had floating precision issues far from origin.

**TARGET rule**:

- Prefer integer-based hashing for discrete decisions (feature placement).
- Keep noise inputs stable; if large world coordinates are used:
  - consider coordinate normalization/wrapping for noise
  - avoid accumulating floating error over long chains

### 5.7 Biome balance and distribution

Minecraft’s balance relies on **climate-based clustering** and **weighted rarity**, not uniform distribution. All biomes exist in an infinite world, but they are clustered by climate; common biomes appear frequently, rare ones require significant exploration.

- **Climate-based generation**: Biomes are grouped into temperature categories (snowy, cold, medium, dry/warm). Similar biomes generally spawn near each other, preventing abrupt transitions (e.g. desert immediately next to snowy tundra).
- **Weighted rarity**: Biomes are not equally weighted. Common biomes (Plains, Forests, Oceans) dominate the landscape; rare biomes (Jungle, Badlands/Mesa, Ice Spikes) are rarer and encourage exploration.
- **Fallback system**: If all biomes for a given climate are removed (e.g. via mods or data packs), the game fills that space with biomes from other climate categories—prioritizing worldgen stability over strict climate consistency.
- **Sub-biome structure**: Many biomes are variants of a “base” biome and only appear within it (e.g. Wooded Badlands only within a larger Badlands region).

**TARGET rule for Voxely**:

- Treat climate clustering and weighted rarity as design goals: common biomes should appear often, rare biomes should require travel; avoid uniform or random biome distribution.
- Fallback behaviour and sub-biome constraints are optional for future extension; document any fallback or variant rules if implemented.

**Common issues and player perspectives** (design context, not implementation requirements):

- **Repetitiveness**: Temperature-based clustering can produce large, homogeneous regions (especially in dimension-style worlds like the Nether), which some players find repetitive.
- **Size and exploration**: Larger biome sizes can make specific resources (e.g. bamboo, terracotta) harder to find and reduce local biodiversity.
- **Ocean abundance**: Oceans often occupy a large share of the surface and can feel like “barren” barriers, despite offering resources.

In short, the balance relies on a **temperature-clustered** model: large, cohesive regions of similar climate, with long travel needed to reach different environments.

---

## 6) Plains biome (canonical example)

The **Plains** biome is our canonical example for Minecraft‑style, noise‑driven terrain design. Use it as the primary reference when implementing or tuning Plains‑like biomes.

- **Climate & selection**
  - Temperate, moderately humid, smooth inland terrain (high erosion, normal weirdness).
  - Selected via climate space (temperature, humidity, continentalness, erosion, weirdness).
- **Shape**
  - Base height slightly above water level.
  - Low‑amplitude, large‑wavelength height variation (gentle hills, mostly flat).
- **Surface rules**
  - Inland: grass block top, 2–3 layers of dirt, then stone.
  - Shores: sand or gravel near water/sea level where appropriate.
- **Features**
  - Sparse oak trees (mix of normal and large oaks).
  - Abundant grass and flowers; sunflower variant adds dense sunflower patches.
  - Eligible for plains‑style villages and pillager outposts.
- **Mobs**
  - Common farm animals (sheep, pigs, cows, chickens).
  - Signature Plains mobs: horses and donkeys.

For a full breakdown of climate, density, surface rules, features, structures, spawns, and design targets, see **`docs/PLAINS_BIOME.md`**.

---

## 7) Change safety checklists (LLM-first)

### 7.1 Editing a biome (tuning)

When you tune an existing biome (e.g. desert):

- Change the biome definition in `src/terrain/biomes/<biome>.ts`
- If decor/features depend on blocks:
  - verify blocks exist in `src/block-registry.ts`
  - verify terrain IDs exist in `src/terrain/block-ids.ts`
  - verify textures exist under `public/assets/minecraft/textures/block/`
- Run tests:
  - `src/terrain/pipeline.test.ts`
  - `src/chunk-payload-contract.test.ts` (if payload touched)

### 7.2 Adding a new terrain block used by worldgen

If a block can appear in generated terrain:

- Add it to `src/block-registry.ts` (renderable definition + textures)
- Add it to `src/terrain/block-ids.ts` (`TERRAIN_BLOCK_TYPES` order matters)
- Ensure it is safe for visibility/meshing and world queries

### 7.3 Changing carving rules

- Keep carving stages pure and deterministic.
- Avoid “holes everywhere”: verify global cave density and ensure survivable surface.
- Prefer adding parameters and tests over ad-hoc thresholds.

### 7.4 Changing structure logic

- Any change to structure placement should keep:
  - determinism
  - low repetition (weights)
  - termination rules
  - biome suitability checks

---

## 8) Pipeline summary (CURRENT vs TARGET)

### CURRENT (implemented in Voxely)

1. Noise sampling + climate → biome map (Stage 1)
2. Heightmap → terrain solid/air baseline (Stage 1)
3. Carving (3D/cheese/spaghetti) (Stage 2)
4. Stratigraphy (surface/subsurface/stone + water fill) (Stage 3)
5. Features + template structures (Stage 4/5)

### TARGET (design direction)

1. Multi-scale noise (explicit octave policy) for macro/micro structure
2. Optional worm-carvers for specific cave types
3. Explicit surface rules (biome-driven, feathered transitions)
4. Decorators with consistent ordering and density targets
5. Structure template pools with weights + max depth + terminators
6. Runtime finalization systems (spawns/lighting) kept out of terrain purity
