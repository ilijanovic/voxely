# How Voxel Engines Are Made

A structured reference based on the tutorial series **["Let's Make a Voxel Engine"](https://sites.google.com/site/letsmakeavoxelengine/home)**. The series was written during the development of the voxel game *Vox* (IndieDB). This document is a condensed summary for developers who want to understand common voxel-engine concepts or map them to a codebase like Voxely.

---

## 1. Introduction

### Goals of a good voxel engine

A well-designed voxel engine aims for three properties:

- **Expansive** – The world scale should be large and not limited by arbitrary constraints.
- **Dynamic** – Any voxel in the world can be modified at any time.
- **Efficient** – The engine must render a large number of voxels at once without excessive draw calls or CPU/GPU cost.

Achieving these relies on a mix of data structures, rendering optimizations, and runtime management (chunk loading, culling, collision). The process is iterative: start with simple block rendering and add chunks, vertex buffers, management, and optimizations step by step.

### Prerequisites

The tutorials assume familiarity with 3D graphics and 3D math, and some experience with a 3D API (e.g. OpenGL or Direct3D). Rendering is described in terms of immediate mode vs. vertex buffers and single draw calls per chunk.

---

## 2. Fundamentals: Rendering and Data

### Basic block rendering (Article 01)

The first step is to render a single cube (e.g. using quads and immediate mode). Each face has a normal and four vertices. Block position can be applied via a world matrix translation.

To render many blocks, store them in a 3D array (e.g. `m_pBlocks[32][32][32]`) and **derive position from the array indices** instead of storing coordinates per block. That keeps storage small and makes save/load easier. When iterating over the array, translate by `(x, y, z)` (optionally scaled by a constant block render size) and draw the block at that position. Only blocks that are "on" (active) need to be drawn.

### Block data structure (Article 02)

A **block** is the base unit: a voxel represented as a 3D cube. Each block should store only what cannot be inferred:

- **Active flag** – Whether the block is on or off. Inactive blocks are not rendered and can be considered empty/air. Toggling this flag is what makes the world dynamic.
- **Block type** – e.g. Grass, Dirt, Stone, Water, Wood, Sand. This drives appearance (texture or colour) and later gameplay (e.g. behaviour, collision).

Minimizing per-block data is critical: with millions of voxels, any extra field multiplies storage and memory. Normals, texture coordinates, and colours can often be **procedurally derived** from position and block type rather than stored. The same idea applies to saving: store only what is necessary to reconstruct the world (active state and type), and regenerate the rest at load or runtime.

### Chunks (Article 03)

A **chunk** groups many blocks (e.g. 16×16×16) into one unit. Instead of one draw call per block, the engine issues **one draw call per chunk**, which greatly reduces rendering overhead. For a 256×256×256 block world, that might mean 4,096 chunk draws instead of millions of block draws.

The chunk class typically holds a 3D array of blocks and provides `Update` and `Render`. A **chunk manager** (a level above) holds a list of chunks and decides which to load, update, and render.

**Trade-off:** When any block in a chunk is modified, the chunk’s render data (e.g. mesh or vertex buffer) must be **rebuilt**. Larger chunks mean fewer draw calls but longer rebuilds; smaller chunks rebuild faster but increase the number of chunks and draw calls. Chunk boundaries also matter: modifying a block on the edge of a chunk may require rebuilding neighbouring chunks if they share visible faces.

### Display lists or vertex buffers (Article 04)

To achieve one render call per chunk, all visible geometry for that chunk’s blocks is assembled into a single **mesh** (vertex buffer). During chunk setup/load:

1. Create a mesh (vertex buffer) for the chunk.
2. Loop over all blocks in the chunk; for each **active** block, add the corresponding cube geometry (vertices, normals, colours or UVs) to the mesh.
3. Finalize the mesh and bind material/texture as needed.

Rendering the chunk is then a single call (e.g. `RenderMesh(meshID)` after translating to the chunk’s world position). Whenever a block in the chunk is turned on or off, the chunk’s mesh must be **rebuilt** so that the vertex buffer reflects the current set of active blocks.

Using vertex buffers (e.g. `glDrawElements` / `glDrawArrays`) instead of immediate mode keeps CPU–GPU traffic low and is essential for large worlds.

---

## 3. Chunk runtime

### Chunk management (Article 05)

Chunks are stored in **dynamic containers** (e.g. a list or vector), not a fixed 3D array, so chunks can be loaded and unloaded without expensive reshuffling. The chunk manager maintains several **sublists** representing chunk state:

- **Load list** – Chunks that need to be loaded (block data allocated and filled).
- **Setup list** – Chunks that are loaded but not yet set up (e.g. initial block configuration, mesh creation).
- **Rebuild list** – Chunks whose block data changed and whose mesh must be rebuilt.
- **Unload list** – Chunks to unload (free block data and mesh).
- **Visibility list** – Chunks that could potentially be seen by the camera (e.g. within a distance threshold).
- **Render list** – Chunks that passed culling (e.g. frustum, empty, fully surrounded) and are actually drawn.

Update order in the chunk manager typically looks like:

1. Async chunker (if used).
2. Load list (load a limited number of chunks per frame for async loading).
3. Setup list.
4. Rebuild list (again, limit rebuilds per frame to keep frame rate stable).
5. Update flags (e.g. empty chunk, surrounded).
6. Unload list.
7. Visibility list (which chunks are near the camera).
8. Render list only when camera position or view changed (frustum culling, etc.).

Rebuilding one chunk may require updating **neighbour chunks’ flags** too, since faces at chunk boundaries can change visibility.

### Chunk optimizations (Article 06)

- **Don’t render unseen faces** – When building the chunk mesh, for each active block check its six neighbours. If a neighbour is active, do **not** add the faces between them (they are occluded). This drastically reduces triangle count for solid terrain.
- **Don’t render empty chunks** – If a chunk has no active blocks (or no vertices/triangles after mesh build), mark it and skip it in the render list.
- **Don’t render completely surrounded chunks** – If every block in a chunk is surrounded by active blocks in neighbouring chunks, the chunk’s faces are never visible; it can be skipped (optional, with correct neighbour checks).
- **Face merging** – Neighbouring blocks of the same type (or colour) can share merged quads instead of separate triangles per block. This is more involved (algorithm to walk and merge faces) but can reduce vertex count further.

---

## 4. Representation and visibility

### Block type, textures and colours (Article 08)

**Block types** are essential for both look and gameplay: different types can use different textures or colours and behave differently (e.g. sand vs. dirt).

If using **textures**:

- Use a **texture atlas** – All block textures in one texture so the chunk (or scene) can be drawn with a **single texture bind**. Binding textures is expensive; per-block-type binds would hurt performance.
- **Compute UVs at runtime** from the block type (e.g. index into the atlas). Do not store UVs per voxel in save data.

Alternatively, use **colours or materials** only (no textures) for a stylized look and simpler pipeline.

### Frustum culling (Article 09)

A **frustum** is the camera’s view volume (e.g. six planes). Before rendering, test each chunk (or object) against the frustum:

- **Point test** – Is a point inside the frustum? (Useful for particles.)
- **Sphere test** – Is a sphere (center + radius) inside, outside, or intersecting?
- **Cube (AABB) test** – Is an axis-aligned box inside, outside, or intersecting? Most chunks are tested as a single box.

Chunks (or their bounding boxes) that are outside the frustum are not added to the render list. This reduces draw calls and GPU work when the camera looks at a small part of the world.

---

## 5. World and landscape

### Landscape creation (Article 07)

Chunk “setup” is the phase where block data is first filled (which blocks are active and their type). No need to store full meshes on disk; only the choice of which blocks are on/off and their type matters. Everything else (normals, UVs, etc.) can be derived.

Examples:

- **Solid cube** – Turn every block in the chunk on.
- **Sphere** – For each (x, y, z), turn the block on if the distance to the chunk center is below a radius.
- **Landscape** – For each (x, z) column, obtain a **height** value (from a heightmap texture or from **noise**). Then set all blocks from y = 0 up to that height as active (e.g. grass on top, or a single type for simplicity).

For **multi-chunk worlds**, terrain must be **seamless** across chunk boundaries. Heightmap textures per chunk are awkward because boundaries must align. **Procedural noise** (e.g. libnoise) keyed by world coordinates works well: the same (x, z) always gives the same height regardless of which chunk it falls in, so neighbouring chunks match at edges. The tutorial references libnoise and its seamless usage.

---

## 6. Collision and physics

### Collision detection (Article 10)

In a **dynamic** world, collision must always use the **current** world data; pre-baked or offline solutions are not applicable. Avoid iterating over every voxel. Instead:

- Transform the **object’s position** (e.g. player or entity) into **voxel coordinates** and query only the voxels that the object can touch (e.g. the cell it’s in and neighbours for a bounding box).
- If a voxel at that position is **active**, treat it as solid and resolve the collision (e.g. slide along walls, or push the player up when landing).

**Point vs. bounding box:** Small or numerous objects (particles) can be treated as points for speed. Larger objects (player, NPCs) should use a bounding box and proper box–voxel tests for accuracy.

**Missed collisions:** Fast-moving objects can pass through thin walls in a single frame. Mitigations: multiple collision checks along the path, or sub-stepping (smaller time steps) so the object never moves more than one voxel per step.

### Physics (Article 16)

A minimal physics loop can be very simple:

- **Integration:** `acceleration = force + gravity`, `velocity += acceleration * dt`, `position += velocity * dt`. Optionally similar for angular velocity and rotation.
- **Forces** – Reset accumulated force each frame; each frame add gravity and any external forces (e.g. from input or collisions). This keeps the model predictable and easy to reason about.
- **Collision response** – When an object is found intersecting the world, resolve it. Options: **rollback** the integration and apply a bounce/stop, **push** the object out of the voxel and then apply response, or **subdivide** the timestep and step until the exact collision time. The tutorial uses simple rollback + velocity reflection for particles.

Simplifications often used: no mass (all objects behave the same), Euler angles for rotation (with possible gimbal lock; quaternions are better for complex rotation). The goal is a stable, good-looking motion without a full physics middleware.

---

## 7. Extensions

### Voxel sprites (Article 13)

**Voxel sprites** are voxel-style objects that are **decoupled from world voxel scale**. They have their own internal voxel (block) data and can be rendered at different scales and rotations. That allows, for example, small flowers (fine detail) and large trees (world-scale blocks) in the same engine. The downside is that large voxel sprites do not benefit from chunk-based culling and are effectively small voxel worlds themselves.

- Each sprite can maintain its own block array and mesh.
- **Independent rotation** – Sprites are not aligned to world axes, which improves visual variety.
- **Instancing** – The same static mesh can be reused for many instances of the same sprite to reduce draw calls and memory.

### Water (Article 18)

Water is often implemented as a **separate subsystem** from standard block rendering. Design choices:

- **Look and behaviour** – Flow, pressure, viscosity, and appearance (e.g. different representation when flowing vs. still).
- **Theory** – Fluid simulation, cellular automata, and discrete mathematics are useful references (e.g. Wikipedia, or “Simple Fluid Simulation With Cellular Automata”). Other games (e.g. Terraria, Dwarf Fortress) document pressure and water behaviour and can inspire design.

Common topics: evaporation, overflow, combining water volumes, pressure, viscosity, and water sources/pumps. Implementing water well usually requires planning and iteration; the tutorial recommends reading and designing before coding.

### Scenery objects (Article 19)

**Scenery objects** are similar to voxel sprites but geared toward higher-detail static or animated detail in the world (e.g. props, vegetation models). They keep a voxel-like look but allow arbitrary scale and rotation. A **scenery manager** handles creation, update, and rendering of these objects separately from the main chunk list.

---

## 8. Reference: Concepts and Voxely

This section maps the tutorial concepts to where they appear in **Voxely** (this project). For full navigation, see [PROJECT_MAP.md](PROJECT_MAP.md).

| Concept | In Voxely |
|--------|-----------|
| Blocks, block types | [src/terrain/block-ids.ts](../src/terrain/block-ids.ts), [src/block-registry.ts](../src/block-registry.ts) |
| Chunks, chunk data | [src/chunk-runtime.ts](../src/chunk-runtime.ts), [src/game/chunks/](../src/game/chunks/) (chunk-manager, chunk-apply, chunk-planning) |
| Terrain / landscape generation | [src/terrain/](../src/terrain/) (pipeline, stages, biomes, features), [TERRAIN_SPEC.md](TERRAIN_SPEC.md) |
| Chunk payload, mesh building | [src/game/chunks/chunk-apply.ts](../src/game/chunks/chunk-apply.ts), [src/game/chunks/chunk-generate-sync.ts](../src/game/chunks/chunk-generate-sync.ts), worker geometry in [src/terrain/worker-geometry.ts](../src/terrain/worker-geometry.ts) |
| Collision | [src/game-collision.ts](../src/game-collision.ts) (AABB vs. voxels) |
| Frustum / visibility | [src/game/render/frustum-visibility.ts](../src/game/render/frustum-visibility.ts), visibility in [src/game/chunks/visible-blocks.ts](../src/game/chunks/visible-blocks.ts) |
| Block materials, textures | [src/block-materials.ts](../src/block-materials.ts), [src/game/init/materials.ts](../src/game/init/materials.ts) |
| Systems overview | [SYSTEMS_OVERVIEW.md](SYSTEMS_OVERVIEW.md), [ARCHITECTURE.md](ARCHITECTURE.md) |

---

## Data flow (high level)

```mermaid
flowchart LR
  BlockData[Block data active + type]
  Chunk[Chunk 16x16x16]
  ChunkMgr[Chunk manager]
  Visibility[Visibility list]
  RenderList[Render list]
  GPU[GPU draw]

  BlockData --> Chunk
  Chunk --> ChunkMgr
  ChunkMgr --> Visibility
  Visibility --> RenderList
  RenderList --> GPU
```

---

## Source

- **Original series:** [Let's Make a Voxel Engine](https://sites.google.com/site/letsmakeavoxelengine/home) (Google Sites). Articles 01–10, 13, 16, 18, 19 were used for this reference.
- This document is a **structured summary** for quick lookup and mapping to real codebases, not a literal copy of the tutorials.
