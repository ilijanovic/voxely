## Plains Biome – Technical Design (Minecraft‑style Reference)

This document describes how a **Plains** biome is conceptually designed and implemented in a Minecraft‑style world generator (inspired by **Java Edition 1.18+**). It is written for **LLMs and engine developers** working on Voxely’s terrain system. Bedrock Edition may differ (e.g. villages in Sunflower Plains); where it matters, the doc notes Java vs Bedrock.

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

Plains is **not** a special‑cased terrain type – it is a biome configuration that plugs into this generic pipeline. For how Minecraft balances common vs rare biomes (Plains among the common ones), see **`docs/TERRAIN_SPEC.md` §5.7** (Biome balance and distribution).

#### 1.1 Composition — what plains are made up of

Plains are **flat grasslands** with two variants: **plains** and **sunflower plains**. They are common and expansive and often border forests and savannas.

- **Surface:** Grassy and mostly flat. Grass blocks are covered in grass or tall grass, over a dirt subsurface (grass‑over‑dirt).
- **Depth:** Subsurface is **3 blocks of dirt** below the grass block, then stone/deepslate (Voxely: `subsurfaceDepth: 3`). Cave depth is world‑global, not biome‑specific.
- **Extent (size):** Plains have **no fixed size**. Each column (x,z) is assigned a biome from climate/noise; plains appear where the multi‑noise selector picks Plains, so regions can span a few chunks to many. They are common and expansive.
- **Vegetation:** Sparse oak trees; mixed flowers including tulip patches; sunflowers only in the sunflower plains variant. See §5 for exact odds and exclusivity.
- **Structures and mobs:** Plains host villages (oak planks and logs) and pillager outposts. Signature fauna: horses, donkeys, and common farm animals (sheep, chickens, pigs, cows).

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

**Voxely multiNoise (CURRENT):** Plains selection uses a nearest-match in multi-noise space. In `src/terrain/biomes/plains.ts` the center is `continentalness 0.68`, `erosion 0.05`, `temperature 0.15`, `humidity -0.25`, `weirdness 0`, `y 0.25`, with weights `temperature 2`, `humidity 2`, `continentalness 1.5`, `erosion 1.2`. Climate bounds: `tempMin 0.45`, `tempMax 0.7`, `humidityMin 0.25`, `humidityMax 0.5`.

#### 2.1 Neighbor biomes and transitions

Plains typically borders other **temperate or grassland-adjacent** biomes: **Forest**, **Savanna**, **Meadow**, **Cherry Grove**, and **River**. It should rarely meet Desert or Snow directly; when climate noise places those nearby, use smooth blending or intermediate biomes so transitions are not jarring. Keep Plains in the temperate band so it sits between forest/savanna/meadow, not next to extreme climates.

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

#### 3.1 Voxely implementation (terrain parameters)

Plains use the following terrain and block parameters (see `src/terrain/biomes/plains.ts`):

| Parameter          | Value   | Meaning |
|--------------------|---------|---------|
| `baseOffset`       | 0       | Base height at sea level (BASE_HEIGHT 64 + 0). |
| `detailAmp`        | 1.3     | Amplitude of detail noise (blocks); low ⇒ flat. |
| `detailFreq`       | 0.015   | Detail noise frequency; wavelength ~1⁄0.015 ≈ 67 blocks. |
| `flatness`         | 0.97    | High ⇒ terrain stays flat (detail variation reduced). |
| `mountainAllowed`  | false   | No mountain peaks in plains. |
| `subsurfaceDepth`  | 3       | Dirt layers below surface (grass then 3× dirt then stone). |

Effective height variation is small: detail noise × effective amplitude (further reduced by flatness), so surface Y stays close to sea level with gentle rolling.

---

### 4. Surface rules in Plains

Surface rules decide which blocks appear at and just below the surface.

**Canonical Plains surface:**

- At the first solid block below air and clearly above sea level:
  - **Top block:** grass block.
  - **Subsurface:** 2–3 blocks of dirt (conceptual range); **Voxely uses 3 blocks** (`subsurfaceDepth: 3`).
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
- **Rivers** can run through plains; banks are typically grass/dirt or gravel. Village placement often favors areas near water. Keep river edges consistent with global river/water rules.
- Conditions typically check:
  - Height relative to sea level.
  - Water presence / proximity.
  - Slope.

**Required blocks (Voxely):** For Plains to render and feature correctly, the following must exist in the block registry and terrain block IDs: surface block (grass), dirt, sand (shore), and feature blocks—oak log, oak leaves, grass, tall_grass, and flowers used in plains (e.g. dandelion, poppy, tulip_red, oxeye_daisy). See `src/block-registry.ts` and `src/terrain/block-ids.ts`; if adding new Plains-only blocks, follow the same pattern as for Desert (cactus, dead_bush) in TERRAIN_SPEC §4.4.

LLM rule: when modifying Plains surface rules, preserve the **grass‑over‑dirt** profile for normal inland terrain and use beaches only where water or coasts make sense.

---

### 5. Vegetation and features

After surfaces, feature pipelines add vegetation and small‑scale details.

#### 5.1 Trees

- Tree type: **oak trees only**.
  - **1⁄3 large oak**, **2⁄3 normal oak** (Java 1.10+).
- Tree density:
  - Trees generate in **about 5% of Plains chunks** → Plains feels mostly open.
- Implement via configured features:
  - Tree features that:
    - Require grass/dirt surface.
    - Check light/space constraints.
    - Optionally attach bee nests (**1⁄20** of trees; see §5.2).

Design target: Plains should have **occasional solitary oaks or small groups**, never a dense forest canopy.

#### 5.2 Bees and bee nests

- **1⁄20** of oak trees in Plains can have a **bee nest** attached (rare).
- Implement as a tree feature variant that:
  - After a successful tree placement, chooses a suitable trunk block and, with that probability, places a bee nest there.
- Biome spawn rules should allow **bees** in Plains.

#### 5.3 Grass and flowers

Plains acts as a default **grassy meadow** biome.

- **Grass:**
  - High counts of grass and tall grass features per chunk.
  - Distribution uses spread/noise so that some patches are dense and others sparse.
- **Flowers:**
  - **Tulips** generate in patches. **Plains and flower forests are the only biomes** where tulips generate.
  - **Sporadically:** oxeye daisies, dandelions, poppies (and in full Minecraft: cornflowers, azure bluets). Voxely CURRENT: plains flower thresholds in `flowers.ts` use dandelion, poppy, tulip_red, oxeye_daisy.

#### 5.4 Sunflower Plains variant

`Sunflower Plains` is a visual/vegetation variant of Plains:

- Same terrain and climate as Plains.
- Adds a dense **sunflower patch** feature:
  - Many sunflowers in clusters. It is the **only biome** where sunflowers naturally generate.
  - Sunflowers face east (useful as a makeshift compass).
- **Borders:** Often bordered by plains or cherry groves; separated from flower forests by rivers.
- **Structures (edition‑dependent):** In **Java Edition**, villages and pillager outposts do **not** generate in sunflower plains. In **Bedrock Edition** they do. Voxely can follow either; document the chosen behaviour.
- Mob spawning and base terrain mirror Plains.

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
- **Flatness:** Village origins prefer flat terrain. In Voxely, `src/terrain/structures/origins.ts` uses a flatness check (e.g. max height deviation 2 blocks over a small radius) before placing village origins; only then is the biome checked (plains, meadow, forest, savanna, cherry_grove).

Design rule: Plains is a **primary “village biome”**. Do not remove or overly restrict villages here unless you have a deliberate replacement.

#### 6.2 Pillager outposts

- Plains can host **pillager outposts**:
  - Configured with their own spacing/separation.
  - Use biome filters that include Plains (and possibly some related biomes).

LLM rule: if you adjust large‑scale structure distribution, keep Plains eligible for both **villages** and **outposts** unless the design explicitly says otherwise.

#### 6.3 Gameplay and survival (reference)

From a gameplay perspective, plains are a calm but resource‑sparse baseline: wood is scarce (trees in ~5% of chunks), so villages can serve as early refuge and a source of planks/logs. Horses and donkeys enable fast travel. Dense grass can hinder building or combat in some situations.

---

### 7. Mob spawning in Plains

Mob spawning is defined per biome and per spawn category.

**Creature (passive) category — reference (Java‑style weights):**

| Mob     | Spawn weight | Group size |
|---------|---------------|------------|
| Sheep   | 12⁄46         | 4          |
| Chicken | 10⁄46         | 4          |
| Pig     | 10⁄46         | 4          |
| Cow     | 8⁄46          | 4          |
| Horse   | 5⁄46          | 2–6        |
| Donkey  | 1⁄46          | 1–3        |

- **Monster category:** Standard overworld set (zombies, skeletons, creepers, spiders, endermen, witches, zombie villagers). Slimes only in slime chunks.
- **Ambient / water categories:** Bats in caves; glow squids in appropriate underground water.

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

---

### 10. Code references (Voxely)

| Area | Path |
|------|------|
| Biome definition and terrain params | `src/terrain/biomes/plains.ts` |
| Registry and selection | `src/terrain/biomes/registry.ts`, `src/terrain/biomes/index.ts` |
| Flowers by biome | `src/terrain/features/flowers.ts` |
| Ground cover (grass, tall grass) | `src/terrain/features/ground.ts` |
| Ferns (plains eligible) | `src/terrain/features/ferns.ts` |
| Structure origins (villages, flatness) | `src/terrain/structures/origins.ts` |
| Block IDs and registry | `src/terrain/block-ids.ts`, `src/block-registry.ts` |

When changing Plains behaviour, start from the biome definition and registry; then follow feature and structure hooks. Run `src/terrain/pipeline.test.ts` and `src/terrain/biomes/registry.test.ts` after edits.

