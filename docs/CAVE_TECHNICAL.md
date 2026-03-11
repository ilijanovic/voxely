# Cave Generation Technical Deep Dive

This document outlines the technical implementation of subterranean voids, focusing on the transition from geometric carvers to modern volumetric noise-based generation.

---

## 1. Introduction and Context

Caves are underground air, water, or lava-filled pockets within the terrain. They serve as primary hubs for ore generation and mob spawning. Modern generation utilizes two distinct technical approaches:

- **Carver Caves:** Legacy geometric-based subtraction.
- **Noise Caves:** Modern volumetric density-based generation.

---

## 2. Carver Caves (Geometric Model)

Carver caves use a geometric “worm” algorithm to subtract specific shapes from the world.

- **Structure:** Can consist of a **Main Room** (ellipsoidal void) with 1–4 **Trunks**, each having 0–2 **Branches**. Alternatively, they appear as I- or T-shaped tunnels without a central room. In Minecraft, there is a one-in-four probability of generating a cave with a main room; three-quarters are I- or T-shaped.
- **Geometry:**
  - **Trunks/Branches:** Typically length ~85–112 blocks. Thicker in the center and tapering towards the ends; thickness can vary unevenly (sometimes “bubbles” or interruptions). Ceiling tends to be rounded, floor flatter.
  - **Overworld (Minecraft):** Main room roughly 1–14 blocks high, 5–15 blocks diameter. Trunk horizontal thickness ~2–38 blocks, vertical ~1–36; branch horizontal ~2–7, vertical ~1–7.
- **Vertical Range (Overworld):** Operates between **Y -56 and 180**. Generation probability is higher around Y -56 to -47.

---

## 3. Noise Caves (Core Logic)

Noise caves utilize 3D noise fields (often Perlin or Simplex) to determine the “hollowness” of the terrain. The core mechanic involves generating a 3D noise map and applying mathematical thresholds.

### 3.1 The Noise Equation

The variation in cave types is achieved by sampling the noise density \(D(x, y, z)\):

- **Cheese Caves (Large Voids):** Generated where \(D(x, y, z) > \text{threshold}\). In a black-and-white noise map, white represents air and black represents stone. This results in large, porous caverns.
- **Spaghetti & Noodle Caves (Tunnels):** These use “edge-of-noise” logic. Instead of finding high-density areas, they target the boundary where the noise value is near zero: \(|D(x, y, z)| < \text{threshold}\).
  - **Spaghetti:** Low-frequency noise creates long, winding tunnels.
  - **Noodles:** High-frequency, “squigglier” noise creates thin (1–5 block) paths.
- **Noise Pillars:** Vertical strips of stone left behind within noise caves, acting as natural supports or stalactite-like formations. They can appear in any noise cave type.

### 3.2 Parameters

By adjusting **noise frequency**, **hollowness** (for cheese caves), and **thickness** (for spaghetti, noodle, and pillars), noise caves can vary widely. The 3D field is often “smudged” with Perlin (or similar) noise to get smooth, connected voids.

---

## 4. Aquifers

Aquifers are local fluid systems that allow for varied water levels within caves, independent of the global sea level.

- **Lava Transition:** Typically, air/water is replaced by lava at deep layers (Y -55 to -63). Below Y=0, aquifers may sometimes be lava; from Y -55 to -63 they are always lava.
- **Function:** They decouple the “building” of the cave from the “filling” of the cave. If two liquid bodies of different levels or types are too close, blocks may be generated between them to separate them.
- **Note:** Lava lakes generated underground are a separate feature and are not aquifers.

---

## 5. Voxely Implementation

In the Voxely engine, cave generation occurs during **Stage 2** of the terrain pipeline (see [TERRAIN_SPEC.md](TERRAIN_SPEC.md) and [PROJECT_MAP.md](PROJECT_MAP.md)). While inspired by Minecraft, Voxely prioritizes performance and deterministic pathing.

### 5.1 Carve Stages

| Module | Logic | Implementation Detail |
| :--- | :--- | :--- |
| [`src/terrain/stages/carve-3d.ts`](../src/terrain/stages/carve-3d.ts) | 3D noise threshold | Carves where `caveNoise3D(wx, wy, wz) > carveThreshold`; only below surface (`ly < topY`). |
| [`src/terrain/stages/carve-cheese.ts`](../src/terrain/stages/carve-cheese.ts) | Large-scale 3D noise | Samples `cheeseNoise3D(wx*scale, wy*scale, wz*scale)`; carves when above threshold (optionally divided by `caveDensityFactor(y)`). Limited to subterranean layers (`ly >= 1`, `ly < topY`) to protect the surface. |
| [`src/terrain/stages/carve-spaghetti.ts`](../src/terrain/stages/carve-spaghetti.ts) | Deterministic worm | Unlike Minecraft’s “edge-of-noise,” Voxely uses vector-walking worm paths and carves spheres along them. |

### 5.2 Deterministic Worm Math (`carve-spaghetti.ts`)

Instead of sampling a global noise field to find boundaries, Voxely uses a vector-walking approach:

1. **Cell grid:** The world is divided into cells of size `cellSize` (e.g. 32 blocks) in X/Z. One worm path is generated per cell.
2. **Origin:** A seed point \((x_0, z_0)\) is chosen inside the cell using seeded RNG; \(y_0\) is in range 8 to `maxY - 16`, clamped to valid Y.
3. **Path:** For each step \(i\), a direction offset \((\Delta x, \Delta y, \Delta z)\) is drawn from the RNG (e.g. \((\text{rng}()-0.5)\cdot 4\) for X/Z, \(\cdot 2\) for Y), scaled by a per-step length \(0.5\ldots 1.5\). The next point is \(\vec{p}_{i+1} = \vec{p}_i + \vec{\Delta} \cdot \text{len}\). Y is clamped to \([1, \text{maxY}]\). So \(\vec{v}_{i+1} \approx \vec{v}_i + \text{Noise}(i)\cdot \text{swing}\) in spirit, but implemented as explicit random offsets.
4. **Carving:** Between consecutive path points, the segment is walked with step `SEGMENT_STEP` (0.8 blocks) so spheres overlap. At each sample point, all voxels within a sphere of radius `radius` and **below the column surface** are set to carved (air). The sphere is evaluated in world space; only voxels inside the current chunk and below the heightmap are modified.
5. **Connectivity:** This guarantees tunnels are continuous along the path, which is harder to enforce with pure 3D noise without high resolution.

### 5.3 Key Differences from Minecraft

- **Spaghetti logic:** Voxely uses vector-based worms for tunnels rather than \(|D| < \text{threshold}\) boundary sampling.
- **Noodle caves:** Not implemented as a separate noise mode; thin tunnels can be approximated by using a small `radius` in `carve-spaghetti`.
- **Noise pillars:** Not implemented as a dedicated pass in Voxely.
- **Surface safety:** Voxely uses explicit height checks (carve only where `ly < heightmap[lx][lz]` or `ly >= 1`) rather than global density gradients to prevent surface sinkholes.

---

## 6. References

- [Minecraft Wiki – Cave](https://minecraft.wiki/w/Cave)
- [Henrik Kniberg’s noise cave technical breakdown](https://twitter.com/henrikkniberg/status/1364265702861987841) (cheese/spaghetti diagram)

---

## 7. See Also

- [TERRAIN_SPEC.md](TERRAIN_SPEC.md) – Pipeline stages and carve order.
- [PROJECT_MAP.md](PROJECT_MAP.md) – Terrain stages table and `terrain-core` contract.
- [WATER_FLOW_TECHNICAL.md](WATER_FLOW_TECHNICAL.md) – How cave-filling fluids (water/lava) behave at runtime.
