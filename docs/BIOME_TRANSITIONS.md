# Biome Transitions (Minecraft-style) — How the boundaries happen

This document explains **how biomes interact and transition** in Minecraft-like world generation, with an emphasis on the **technical mechanics** that create boundaries and the “natural” feel.

Scope: **modern Minecraft (1.18+ style)** concepts (multi-noise climate, density-based terrain, surface rules, features, color blending). The exact implementation differs by version, but the pipeline and the reasons transitions look the way they do are stable.

Related docs:
- `docs/TERRAIN_SPEC.md` (Voxely pipeline + design targets)
- `docs/DESERT_BIOME_TECHNICAL.md` (one biome as a worked example)

---

## 1) The core idea: continuous fields → discrete labels

Biome transitions are easiest to understand as a two-layer system:

- **Continuous inputs**: several deterministic noise-derived parameters that vary smoothly in space.
- **Discrete outputs**: a single **biome label** (e.g., `Plains` vs `Desert`) selected from those inputs.

So the *underlying “climate”* changes gradually, but the chosen biome can still flip at a boundary where a different biome becomes the best match.

---

## 2) Climate sampling: the multi-parameter vector

For a position (typically \((x,z)\), sometimes \((x,y,z)\) for cave biomes), the generator samples multiple signals and combines them into a **climate/control vector**. In modern Minecraft these conceptual axes are commonly:

- **temperature** (hot ↔ cold)
- **humidity** (dry ↔ wet)
- **continentalness** (deep ocean ↔ coast ↔ inland)
- **erosion** (smooth ↔ carved / rugged)
- **weirdness / peaks&valleys phase** (valleys ↔ ridges / mountain rhythm)
- plus auxiliary channels (offsets, depth, etc.)

These values are deterministic functions of seed and coordinates. Their **spatial scale** (frequency) is a major factor in how big biome regions feel.

---

## 3) Biome selection: matching in “climate space”

### 3.1 Climate space and nearest-match selection

Conceptually, each sampled location yields a point:

\[
p = (t, h, c, e, w, \ldots)
\]

Biome selection becomes a **lookup/matching** problem:

- Each biome is represented by one or more target “centers” / regions in this space.
- The generator picks the biome whose target is the **closest / best match** to \(p\).

This creates **Voronoi-like regions** in climate space:
- inside one region, `Desert` is the closest match
- across the boundary, `Plains` (or another warm biome) becomes closer

That is the mathematical reason biome boundaries exist even when inputs are smooth.

### 3.2 Why boundaries look organic (not grid-aligned)

A naive nearest-match on block coordinates can look “blocky”. Minecraft-style worldgen reduces that by adding *domain warping / jitter / Voronoi zoom*-style steps so that:

- boundaries are not aligned to the block grid
- edges become irregular (“inlets”, “tongues”, “patchy” boundaries)
- small-scale variation exists without random per-block noise

The important constraint is: **still deterministic** and seed-driven.

---

## 4) Terrain shape vs biome: why the ground doesn’t “snap” at boundaries

Modern Minecraft terrain is driven by a **3D density function** \(density(x,y,z)\):

- if \(density > 0\) ⇒ solid
- else ⇒ air (later filled with water/lava below fluid levels)

The density function is built from multiple signals, commonly including the same macro controls used for biome selection (continentalness, erosion, peaks/valleys). As a result:

- the **terrain shape** tends to change **continuously**
- a biome switch does **not** necessarily imply a sharp elevation change

In many cases, “this feels like a desert” comes more from **surface composition + sparse decor** than from height.

---

## 5) Surface rules: the most visible “hard” transition

After shape (solid vs air) is established, a **surface pass** rewrites the top layers using rules that depend on:

- biome (primary)
- sea level and height above/below it
- depth below surface (top block vs sub-surface layers)
- slope/exposure and small variation noise (optional)
- temperature-dependent logic (snow/ice behavior)

This is where the strongest visible boundary often appears:
- `grass` / `dirt` stacks transition to `sand` / `sandstone` stacks

To avoid “ruler lines”, surface rules are often combined with:
- **patch noise** (dithered/patchy bands)
- slope-aware materials (stone/gravel on cliffs)
- shoreline bands (ocean ↔ coast ↔ inland)

---

## 6) Features & structures: transition through probabilistic placement

After surface blocks, the generator places **features** (vegetation, small decorations, ore distributions, etc.) and **structures** (villages, temples) in ordered steps.

Typical properties:
- features are placed with deterministic randomness and per-biome rules
- placement uses filters (ground block, clearance, height ranges, water checks)
- structures use coarser region grids + validation (biome suitability, flatness, bounds)

At a biome boundary, this naturally produces a *mix zone*:
- feature density changes gradually across the boundary
- some features can “spill over” if their placement rules allow it
- rare structures remain distinct due to stronger validation

---

## 7) Rendering blending: “soft transitions” that are purely visual

Many perceived smooth transitions are **rendering**, not generation:

- grass/foliage color often uses biome-derived parameters and is **blended over a neighborhood**
- this can smooth color changes over several blocks even when biome IDs switch abruptly

The key point: **block type** transitions may still be sharp, but **tints** can be soft.

---

## 8) Cave biomes and 3D transitions

Since Caves & Cliffs, biome-like classification can exist in 3D:
- cave biomes are influenced by depth and 3D noise fields
- transitions can be horizontal and **vertical** (with patchy borders)

This is conceptually the same mechanism: continuous 3D fields → discrete labels → surface/feature rules.

---

## 9) Version and chunk-border blending (old ↔ new terrain)

Minecraft also implements **terrain blending** between old and newly generated chunks (when worldgen rules change across versions). This is separate from normal biome transitions:

- normal biome transitions: driven by seed + climate/density + rules
- version blending: driven by “old chunk exists here” constraints to prevent cliffs at chunk edges

---

## 10) Summary: where “transition smoothness” comes from

Biome transitions are a stack of effects:

- **Selection**: discrete biome boundaries from nearest-match in climate space
- **Geometry**: continuous terrain density functions (usually smooth)
- **Materials**: surface rules (often sharp but can be dithered/patchy)
- **Details**: features/structures (probabilistic mix zones)
- **Perception**: color/tint blending during rendering

If you’re re-implementing this in another engine, the most important design rule is:
**don’t rely on “biome = height”**. Use biome mostly for *surface + features + ambience*, and drive macro shape from shared continuous controls.

