## Plains Biome – Technical Design (Minecraft‑style Reference)

This document describes how a **Plains** biome is conceptually designed and implemented in a Minecraft‑style world generator (inspired by Java Edition 1.18+). It is written for **LLMs and engine developers** working on Voxely’s terrain system.

Use this as the **authoritative reference** when changing Plains‑like terrain, features, or biome selection.

---

### 1. Worldgen pipeline overview

World generation is a multi‑stage pipeline:

- **Density and terrain shape**
  - Multiple **density functions** (noise fields) combine into a 3D density value \(d(x,y,z)\).
  - The sign of \(d\) determines **solid** vs **air/water**.
  - This implicitly defines the **terrain surface height** per column \((x,z)\).

- **Biome assignment (climate → biome)**
  - A separate climate sampler computes:
    - Temperature
    - Humidity (moisture)
    - Continentalness (ocean vs inland)
    - Erosion (rough vs smooth)
    - Weirdness / peaks‑and‑valleys pattern
  - Each column \((x,z)\) is mapped to a biome via a nearest‑match in this **climate space**.
  - **Plains** is selected in a specific region of this space (temperate, moderately humid, smooth inland terrain).

- **Surfaces, features, structures, mobs**
  - **Surface rules** select top/surface blocks (grass, dirt, sand, etc.).
  - **Configured features** place vegetation and decorations (trees, grass, flowers, etc.).
  - **Structures** (e.g. villages, pillager outposts) are placed with their own structure sets.
  - **Mob spawning** uses the resolved biome and per‑biome spawn tables.

Plains is **not** a special‑cased terrain type – it is a biome configuration that plugs into this generic pipeline.

---

### 2. Climate space and Plains selection

The climate sampler provides five conceptual axes:

- **Continentalness** – distance from ocean (very negative = deep ocean, high = far inland).
- **Erosion** – terrain roughness (low = jagged/rough, high = smooth/gentle).
- **Weirdness / peaks‑and‑valleys** – whether the shape leans toward valleys, plateaus, peaks, or special forms.
- **Temperature** – cold → temperate → warm.
- **Humidity** – dry → humid.

A **biome catalog** defines regions in this 5D space.

**Plains selection (conceptual):**

- Temperature ≈ **temperate** (neither cold nor hot).
- Humidity ≈ **moderate**.
- Continentalness ≈ **inland**, but not extreme interior.
- Erosion is **high enough** to favor **smooth, low‑relief** terrain.
- Weirdness in the “normal hills/valleys” band.

**Sunflower Plains** is treated as a **variant** of Plains:

- Same climate region and terrain profile.
- Variant selected by additional noise/variant rules inside existing Plains regions.

LLM rule: when you implement or tune Plains selection, keep it in the **temperate, moderately humid, smooth inland** climate band and do not push it into extremes that should belong to other biomes (desert, mountains, oceans, etc.).

---

### 3. Plains terrain profile (height and density)

The terrain engine uses a 3D **density field** \(d(x,y,z)\):

- \(d > 0\) ⇒ solid (stone, dirt, etc.).
- \(d ≤ 0\) ⇒ air or water (depending on height).

Plains terrain is characterized by:

- **Low amplitude** height variation – small elevation differences.
- **Large wavelength** – broad, gentle hills rather than sharp peaks.
- **Base height** slightly above sea level.

Conceptual height model:

```text
baseHeight      = seaLevel + 4..6
heightVariation = smooth 2D noise (large scale, small amplitude)
surfaceY        = baseHeight + heightVariation
```

The actual density functions should be configured so that:

- Around `surfaceY`, density crosses zero (solid ↔ air boundary).
- Below `surfaceY`, density is positive (filled terrain).
- Above `surfaceY`, density is non‑positive (air / water).

**Biome blending:** at borders between Plains and neighbors (e.g. Forest, Savanna), blend heights and density parameters rather than switching abruptly. Use smooth interpolation to avoid “ruler line” biome edges.

---

### 4. Surface rules in Plains

Surface rules decide which blocks appear at and just below the surface.

**Canonical Plains surface:**

- At the first solid block below air and clearly above sea level:
  - **Top block:** grass block.
  - **Subsurface:** 2–3 blocks of dirt.
  - **Below:** generic underground blocks (stone, deepslate, etc.).

Conceptual rule:

```text
if biome == PLAINS
  and y >= seaLevel + 1
  and local slope is not too steep:
    top_block   = GRASS_BLOCK
    under_block = DIRT (2–3 layers)
else:
    fall back to global / neighbor rules
```

**Shorelines and rivers:**

- Even if the biome is Plains, near water and around sea level:
  - Surface rules may switch to sand or gravel (beaches, lake shores).
- Conditions typically check:
  - Height relative to sea level.
  - Water presence / proximity.
  - Slope.

LLM rule: when modifying Plains surface rules, preserve the **grass‑over‑dirt** profile for normal inland terrain and use beaches only where water or coasts make sense.

---

### 5. Vegetation and features

After surfaces, feature pipelines add vegetation and small‑scale details.

#### 5.1 Trees

- Tree type: **oak trees only**.
  - About **1/3 large oaks**, **2/3 regular oaks**.
- Tree density:
  - Only a small fraction of Plains chunks have trees (on the order of a few percent) → Plains feels mostly open.
- Implement via configured features:
  - Tree features that:
    - Require grass/dirt surface.
    - Check light/space constraints.
    - Optionally attach bee nests.

Design target: Plains should have **occasional solitary oaks or small groups**, never a dense forest canopy.

#### 5.2 Bees and bee nests

- Some oak trees in Plains can have a **bee nest** attached.
- Implement as a tree feature variant that:
  - After a successful tree placement, chooses a suitable trunk block and, with small probability, places a bee nest there.
- Biome spawn rules should allow **bees** in Plains.

#### 5.3 Grass and flowers

Plains acts as a default **grassy meadow** biome.

- **Grass:**
  - High counts of grass and tall grass features per chunk.
  - Distribution uses spread/noise so that some patches are dense and others sparse.
- **Flowers:**
  - Mixed flower placement:
    - Tulip patches.
    - Scattered oxeye daisies, cornflowers, dandelions, poppies, azure bluets.
  - Only certain biomes (including Plains and related variants) produce tulips.

#### 5.4 Sunflower Plains variant

`Sunflower Plains` is a visual/vegetation variant of Plains:

- Same terrain and climate as Plains.
- Adds a dense **sunflower patch** feature:
  - Many sunflowers in clusters.
  - It is the **only biome** where sunflowers naturally generate.
- Mob spawning and base terrain typically mirror Plains; structure availability can differ by edition.

LLM rule: treat Sunflower Plains as **“Plains plus lots of sunflowers”**, not as a fundamentally different terrain shape.

---

### 6. Structures in Plains

Structures are configured separately but filtered by biome.

#### 6.1 Villages

- Plains hosts **plains‑style villages**:
  - Buildings made primarily from oak planks and logs.
  - Flat terrain bias for placement.
- Structure configuration specifies:
  - Average spacing and minimum separation between villages.
  - Template pools for houses, streets, wells, etc.
  - Biome filters that include Plains (but generally exclude Sunflower Plains in modern Java).

Design rule: Plains is a **primary “village biome”**. Do not remove or overly restrict villages here unless you have a deliberate replacement.

#### 6.2 Pillager outposts

- Plains can host **pillager outposts**:
  - Configured with their own spacing/separation.
  - Use biome filters that include Plains (and possibly some related biomes).

LLM rule: if you adjust large‑scale structure distribution, keep Plains eligible for both **villages** and **outposts** unless the design explicitly says otherwise.

---

### 7. Mob spawning in Plains

Mob spawning is defined per biome and per spawn category.

Key ideas for Plains:

- **Creature (passive) category:**
  - Common farm animals:
    - Sheep, chickens, pigs, cows.
  - Signature Plains mobs:
    - **Horses** (groups of 2–6).
    - **Donkeys** (rarer, smaller groups).
  - Entries include weights and group sizes.

- **Monster category:**
  - Standard overworld set:
    - Zombies, skeletons, creepers, spiders, endermen, witches, zombie villagers.
    - Slimes only in slime chunks.

- **Ambient / water categories:**
  - Bats in caves, glow squids in appropriate underground water, etc.

Spawner logic:

- Chooses a spawn entry from the biome’s list using weights.
- Validates:
  - Ground block type (e.g. grass for many Plains animals).
  - Light level.
  - Height and dimension constraints.

LLM rule: when tuning Plains spawns, **keep horses and common farm animals strongly associated with Plains**, and avoid turning Plains into a hostile‑heavy biome.

---

### 8. Visual and atmospheric properties

Plains contributes to world look and ambience:

- **Grass and foliage colors:**
  - Derived from temperature/humidity via colormaps.
  - Plains colors are **bright, temperate green** – not as saturated as jungle, not as pale as cold biomes.
- **Water color and fog:**
  - Typically use standard overworld water colors.
- **Sky and fog color:**
  - Normal blue daytime sky with standard fog for temperate climate.
- **Ambient sound:**
  - Outdoor ambience appropriate for quiet grasslands (implementation‑dependent).

Design goal: Plains should read as a **calm, friendly baseline biome** with simple, readable colors and silhouettes.

---

### 9. Design goals and LLM guidance

When you change Plains‑related code or parameters, keep these goals in mind:

- **Build‑friendly terrain**
  - Mostly flat or gently rolling.
  - Easy traversal, no excessive cliffs, good for villages and player builds.

- **Baseline overworld biome**
  - Represents “normal temperate grassland”.
  - Provides contrast to extremes (desert, jungle, mountains, snowy regions).

- **Gameplay richness**
  - Reliable access to food (animals), leather, wool.
  - Horses and donkeys for fast travel.
  - Villages for early shelter and trading.

- **Visual clarity**
  - Open sightlines with sparse trees.
  - Color variation from flowers and grass density, not from chaotic terrain.

LLM rule: if you need an example biome template for new terrain work, **start from Plains** as a canonical reference, then specialize for other climates and shapes.

