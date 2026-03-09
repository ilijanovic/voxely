# Voxel Engine Architecture & Improvement Roadmap

This document analyzes the current Minecraft-style voxel engine and provides recommendations, algorithms, and code patterns for scaling to large worlds.

---

## Current State Summary

- **Terrain:** Multi-layer simplex noise, biome blending, 16×16 chunks, integer heightmap.
- **Rendering:** One `InstancedMesh` per block type per chunk (grass, dirt, stone, sand, snow, wood, leaves) + one water `Mesh` per chunk.
- **Chunks:** Synchronous `generateChunk()` on main thread; load/unload when player changes chunk.
- **Trees:** Two-noise placement (forest density + tree placement), deterministic, margin for border trees.
- **Lighting:** Single directional sun shadow, camera centered each frame, orthographic shadow map.

---

## 1. Terrain Generation Improvements

### 1.1 Smoother Biome Transitions

**Current:** Hard thresholds (e.g. `v < 0.6` → desert). Blending exists for height but not for decoration density.

**Improvements:**

- Use **smoothstep** or **Hermite** on `getBiomeValue()` so transition bands are wider and blend decoration (trees, grass density) by interpolating between biome parameters.
- **Domain warping:** Warp the biome noise input with another noise so boundaries are organic, not axis-aligned.

```ts
// Smooth biome blend factor in [0,1] for secondary biome
function getBiomeBlendSmooth(x: number, z: number): number {
  const v = getBiomeValue(x, z);
  const edge = 0.15; // transition width
  return THREE.MathUtils.smoothstep(0, edge, v) * THREE.MathUtils.smoothstep(1, 1 - edge, v);
}
```

### 1.2 Rivers and Lakes

- **Rivers:** Use a **curved river mask** from low-frequency 3D or 2D noise (e.g. `riverNoise(x,z) < 0.2` → carve or lower terrain). Combine with a simple flow direction (e.g. gradient of a “flow potential” noise) so rivers follow valleys.
- **Lakes:** Low spots in terrain where `getHeight(x,z) < WATER_LEVEL` and a **lake mask** noise (low frequency) is above a threshold. Fill to a fixed level; use same water mesh as now.

```ts
// River mask: carve terrain where noise is low and slope allows flow
function getRiverCarve(x: number, z: number): number {
  const n = riverNoise2D(x * 0.002, z * 0.002);
  return n < 0.2 ? (0.2 - n) * 3 : 0; // carve depth
}
// Subtract from raw height before clamping.
```

### 1.3 Cave Systems (3D Noise)

- Use **3D simplex noise** (e.g. `simplex-noise` 3D) to define “empty” where `caveNoise3D(x, y, z) > threshold`. Carve out blocks in the chunk’s 3D volume.
- **Blob caves:** Threshold around 0.5–0.6; scale ~0.05–0.1 for cave size. Multiply by a **depth factor** (e.g. more caves at mid Y) to avoid caves at surface/bedrock.
- **Performance:** Only evaluate 3D noise for blocks in the chunk; cache or compute in a worker (see §4).

```ts
// Pseudocode: block (x,y,z) is air if carved
function isCarved(x: number, y: number, z: number): boolean {
  const n = caveNoise3D(x * 0.06, y * 0.06, z * 0.06);
  const depthFactor = 1 - Math.abs(y - 32) / 40; // more caves mid-level
  return n * depthFactor > 0.55;
}
// In chunk gen: if isCarved(wx, y, wz) skip adding block (leave air).
```

### 1.4 Large Features (Cliffs, Plateaus, Valleys)

- **Cliffs:** Use a **terrain gradient** (difference of height at (x±1, z) and (x, z±1)). Where gradient is large, blend in a “cliff” material or keep current steep logic.
- **Plateaus:** Add a **plateau mask** (low-freq noise) that flattens local height variation where mask is high.
- **Valleys:** Already partially covered by erosion noise; add a **valley floor** term that pulls height down along valley curves (from same flow potential used for rivers).

---

## 2. Vegetation and World Detail

### 2.1 Multiple Tree Types per Biome

- **Per-biome tree “type” from noise:** e.g. `treeType = floor(treeTypeNoise(wx, wz) * 3) % 3` → oak, birch, pine. Each type has its own trunk height range, leaf radius, and wood/leaf texture (or UV offset).
- **`generateTree(wx, baseY, wz, biome)`** already receives biome; add a second parameter or internal `treeVariant(wx, wz)` and branch on variant to call different shape generators (same trunk/leaves structure, different constants).

### 2.2 Grass and Plant Decoration

- **Short grass / flowers:** For each grass block at surface, use a **decoration noise**; if above threshold, add a small quad or cross-quad (two tris) above the block. Use one **merged BufferGeometry per chunk** for all grass quads (single draw call), with texture atlas or single grass texture.
- **Deterministic:** `decoNoise(wx, wz) > 0.7` → place; use (wx, wz) to pick variant (flower color, grass height) so same seed = same placement.

### 2.3 Forest Clustering and Clearings

- Already improved with **forest density noise** (low frequency). Tune `FOREST_DENSITY_SCALE` and threshold to get larger clearings and denser clusters. Optionally add a **canopy openness** term that reduces understory decoration where density is high.

### 2.4 Rare Structures (Rocks, Fallen Logs)

- **Rocks:** At grass positions, if `rockNoise(wx, wz) > 0.92`, place a 1×1×1 or 2×1×1 “rock” block (stone or new material). Same InstancedMesh approach as current blocks.
- **Fallen logs:** Same as trees but with a **rotation** (axis along X or Z) and 2–4 wood blocks in a line. Use deterministic noise for position and axis; add to wood InstancedMesh with a transform (position + rotation).

---

## 3. Rendering Performance

### 3.1 Greedy Meshing (Culling + Quad Merging)

- **Face culling:** Only emit a face when the neighbor in that direction is **air** (or water, if you don’t want to see inner faces). This removes most inner chunk faces and greatly reduces vertex count.
- **Greedy meshing (meshing, “culling”):** On each axis-aligned slice (e.g. all faces pointing +X), merge adjacent same-material quads into larger rectangles. Then emit one quad per rectangle. Same for -X, ±Y, ±Z. Result: far fewer quads per chunk, same look.

**Algorithm (2D slice for one face direction):**

1. Build a 2D grid of “emit face here” (e.g. 16×16 for one layer of +X faces).
2. For each (y, z), if block at (x+1, y, z) is air and block (x, y, z) is solid, mark (y, z) = 1.
3. Greedy merge: in rows, extend right while same material; then merge rows with same (left, right) and same material.
4. Emit one quad per merged rectangle (four vertices + normal + material index).

**Performance:** Typically 5–15× fewer triangles than full cubes; 1–3 draw calls per chunk if you batch by material or use texture atlas.

### 3.2 Mesh Merging per Chunk

- **Option A:** One merged `BufferGeometry` per chunk (all solid blocks): greedy-mesh all visible faces, write into one vertex buffer, use **texture atlas** so one draw call per chunk (or a few for transparent vs opaque).
- **Option B:** Keep InstancedMesh but **reduce block types** by atlasing: e.g. one texture with grass/dirt/stone tiles; one material; still one instance per block but smaller state.

**Recommendation:** Implement greedy meshing first (face culling + quad merge); then merge into one geometry per chunk with an atlas. That gives the biggest win.

### 3.3 Reducing Draw Calls

- **Today:** ~7 InstancedMeshes (block types) × N chunks = 7N draw calls.
- **After greedy + merge:** 1–2 meshes per chunk (opaque + optional transparent) → about 1–2N draw calls, and fewer triangles.
- **Batching:** If you keep InstancedMesh, batch by **texture** (one InstancedMesh per atlas page) rather than per block type.

### 3.4 Face Culling Only (Quick Win)

Without full greedy meshing, you can still **cull hidden faces**: when building block lists, only add a block if at least one neighbor is air/water. Then you still use one instance per block but with a **per-face visibility** flag. That requires custom geometry (6 faces, each optional) or 6 InstancedMeshes per block type (one per face direction). Simpler approach: **don’t add blocks that are fully surrounded** (all 6 neighbors solid). That removes interior blocks from the list; rendering stays the same but with fewer instances.

```ts
// In chunk gen: only add block if not fully occluded
function isOccluded(wx: number, y: number, wz: number, type: BlockType): boolean {
  for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    const n = getBlockAt(wx+dx, y+dy, wz+dz); // need block query
    if (n === 'air' || n === 'water') return false;
  }
  return true;
}
// Only push to grassPos/dirtPos/... if !isOccluded(...).
```

### 3.5 GPU and Engine Tips

- **Frustum culling:** Keep `frustumCulled = true` on chunk groups.
- **Keep geometries shared:** One `BufferGeometry` per greedy-mesh chunk (or shared quad geometry with transforms).
- **Avoid per-frame matrix writes:** Only update instance matrices when chunk data changes.
- **Texture atlas:** One 256×256 or 512×512 with 16×16 tiles for each block type; one material; UVs from tile index.

---

## 4. Chunk System Improvements

### 4.1 Background Chunk Generation (Web Workers)

- **Main thread:** Only does rendering and game loop; sends “need chunk (cx, cz)” to a **ChunkWorker**.
- **Worker:** Runs `generateChunkData(cx, cz)` (terrain + trees + water list, no Three.js). Returns **serializable chunk data**: block list (x,y,z,type), water quad list, etc.
- **Main thread:** When message received, builds Three.js meshes from chunk data and adds to scene. No heavy noise or loops on main thread.

**Worker message contract:**

```ts
// Main → Worker
{ type: 'generate', chunkX: number, chunkZ: number }

// Worker → Main
{
  type: 'chunk',
  chunkX: number, chunkZ: number,
  blocks: Array<{ x: number, y: number, z: number, type: string }>,
  waterCells: Array<{ x: number, z: number }>  // or full mesh data for greedy
}
```

**Challenge:** `simplex-noise` and `getHeight`/`getBiome` must run in the worker. Move terrain + biome + tree logic into a shared module that the worker can import (e.g. `terrain-worker.ts`). Worker has no DOM/Three; only pure data.

### 4.2 Priority Loading

- **Priority queue:** Sort requested chunks by **distance to player** (L1 or L2). Worker pulls “generate” requests from the queue; main thread posts “need chunk” in order of distance (nearest first).
- **Limit concurrent:** Process 1–2 chunks per frame when idle; when player is moving fast, temporarily allow more.

### 4.3 Preventing Frame Drops

- **Don’t generate on main thread:** All heavy work in worker.
- **Mesh build on main:** Creating `BufferGeometry` and `InstancedMesh` from chunk data is relatively fast; do it in small steps (e.g. one chunk per frame) if needed.
- **Pooling:** Reuse chunk group/geometry when unloading (dispose only geometry, keep group; refill with new chunk data) to reduce GC spikes.

### 4.4 Chunk LOD (Optional)

- **Level 0:** Full 16×16×H mesh (current).
- **Level 1:** Half resolution (8×8×H) with averaged height and simplified mesh; swap when chunk is far enough.
- **Level 2:** Single quad or low-poly terrain for very far chunks.
- Use **distance from camera** to select LOD; crossfade or hard switch. Reduces triangle count for distant terrain.

---

## 5. Lighting Improvements

### 5.1 Stable Shadows for Large Worlds

- Already improved by **centering shadow camera on player** each frame after movement. Keep that.
- **Shadow map resolution:** 2048 is good; for very large view distances consider 4096 or cascaded (see below).
- **Stabilize projection:** Snap shadow camera position to world units (e.g. multiple of 1 or 2) so the shadow map doesn’t shimmer when the player moves slightly.

```ts
// Snap orthographic camera to reduce shadow swimming
const shadowCam = light.shadow.camera;
const units = 2;
const ox = Math.floor(player.position.x / units) * units;
const oz = Math.floor(player.position.z / units) * units;
light.target.position.set(ox, player.position.y, oz);
light.position.set(ox + sunDir.x * dist, ..., oz + sunDir.z * dist);
```

### 5.2 Cascaded Shadow Maps (CSM)

- Split view frustum into 2–4 cascades (near, mid, far). Each cascade has its own orthographic shadow camera and shadow map (or one texture atlas with viewports).
- **Benefits:** Near cascade high detail; far cascade covers large area without huge map size. Three.js doesn’t ship CSM; use an example (e.g. `three/examples/jsm/csm/`) or implement manually (multiple `DirectionalLightShadow` or custom shadow pass).

### 5.3 Ambient

- **Hemisphere + ambient** already in use. Optionally add **SSAO** (screen-space ambient occlusion) for more depth; cost is one fullscreen pass.
- **Vertex-based AO:** When building greedy mesh, for each vertex average “occluded” for the 4 adjacent blocks (1 = open, 0 = blocked); pass as attribute and darken in shader. Gives a soft voxel AO look without SSAO.

---

## 6. Water System

### 6.1 Animated Surface

- **Vertex animation:** In the water vertex shader, offset Y (or XZ) by a small sine wave based on `position.x/z` and `time`. Use uniform `uTime`.
- **Normal:** Compute normal from the same wave so lighting reacts. Keeps one mesh per chunk; no extra draw calls.

```glsl
// Vertex: slight wave
float wave = sin(position.x * 0.5 + uTime) * 0.03 + sin(position.z * 0.5 + uTime * 1.2) * 0.03;
vec3 pos = position + vec3(0.0, wave, 0.0);
```

### 6.2 Flowing Water

- For a **block-based** flow (Minecraft style), you’d need a simulation (water blocks spreading). Heavier; often deferred. For now, static water level + animation is enough.

### 6.3 Shoreline Blending

- **Foam / shallow:** At water mesh edges, use a **distance to shore** (sample height, compare to water level) and blend to a lighter or foam color in the fragment shader.
- **Soft edge:** Extend water quads by a few pixels and alpha blend at the border (depth and alpha).

### 6.4 Reflections / Refraction

- **Planar reflection:** Render scene reflected to a texture (mirror plane at water height), then sample in water shader. Cost: one extra render pass and camera flip.
- **Refraction:** Copy scene color from a slightly offset screen position (refraction UV) in the water fragment shader. Cheaper than full reflection.

---

## 7. Physics Improvements

### 7.1 Step-Up

- When horizontal movement is blocked (collision in front), try moving the player **up by 1 block** and then forward; if that succeeds, accept the step. Prevents getting stuck on 1-block steps.

```ts
if (collisionInFront && !collisionAtFeetPlusOne) {
  player.position.y += BLOCK_SIZE;
  if (!collisionWhenMovingForward()) {
    applyHorizontalMove();
    return;
  }
  player.position.y -= BLOCK_SIZE;
}
```

### 7.2 Swimming

- **Detect underwater:** `player.position.y + eyeHeight < waterSurfaceY` (already used for fog).
- **When underwater:** Reduce gravity or set terminal velocity; apply horizontal “swim” force when moving; optionally tilt camera or slow movement.
- **Surface:** When leaving water, snap player to water surface if within a small margin.

### 7.3 Edge Collision

- Use **AABB vs block grid**: for each candidate block, test AABB–AABB. For smoother edges, use **rounded** or **expanded** AABB for the player so small overlaps don’t catch. Alternatively, **swept** collision (move, then resolve) to avoid tunneling and sticky edges.

---

## 8. Engine Architecture

### 8.1 Recommended Separation

| Layer | Responsibility | Depends on |
|-------|----------------|------------|
| **World / Terrain** | Pure functions: `getHeight`, `getBiome`, `getBlockAt`, noise. No Three.js. | Nothing (or shared types) |
| **Chunk Data** | `generateChunkData(cx, cz)` → serializable block list + water + trees. Runs in worker or main. | World |
| **Chunk Mesh Builder** | `buildChunkMeshes(data)` → Three.js Group (meshes). | Chunk Data, Three.js |
| **Chunk Manager** | Queue (cx, cz), priority, request to worker; receive data; call mesh builder; add/remove from scene; pool. | Chunk Data, Mesh Builder |
| **Rendering** | Scene, camera, lights, shadow, render loop. | Chunk Manager (scene graph) |
| **Player / Physics** | Input, velocity, collision vs world (query World for blocks), step-up, swimming. | World, Rendering (camera) |
| **Simulation** | Optional: water flow, entities. | World, Chunk Manager |

### 8.2 Data Flow

```
Player position → Chunk Manager (which chunks to load/unload, priority)
                       ↓
Worker: generateChunkData(cx, cz) → serialized chunk
                       ↓
Main: buildChunkMeshes(data) → add to scene
                       ↓
Render loop: scene, shadows, camera
```

### 8.3 Algorithms Commonly Used in Voxel Engines

- **Terrain:** Layered noise, domain warp, erosion (simplified), river/valley masks.
- **Caves:** 3D noise carve; sometimes “worm” algorithms for connected caves.
- **Placement:** Deterministic RNG or noise from (x, y, z) for trees, decoration, structures.
- **Rendering:** Greedy meshing (meshing), face culling, texture atlasing, instancing or merged buffers.
- **Chunks:** Spiral or distance-based load order; worker-based generation; LOD by distance.
- **Collision:** AABB vs voxel grid; sweep or discrete; step-up and swimming as special cases.

### 8.4 Performance for Large Worlds

- **Never block main thread:** Generate in worker; mesh build in small steps if needed.
- **Limit visible chunks:** Frustum + max render distance; unload aggressively.
- **Minimize draw calls and triangles:** Greedy meshing + one mesh per chunk (or few) + atlas.
- **Reuse:** Pool chunk containers and geometries; avoid per-frame allocations in hot paths.
- **Cache:** If terrain is immutable, cache chunk data (IndexedDB or memory) so revisiting chunks is cheap.

---

## Next Steps (Suggested Order)

1. **Face culling / greedy meshing** – Largest visual and performance win; no change to game logic.
2. **Move chunk generation to Web Worker** – Prevents frame drops; requires splitting terrain code.
3. **Smoother biomes + more vegetation** – Better feel with relatively small code changes.
4. **Rivers and caves** – 3D noise and carve logic; then lighting/water refinements.
5. **Physics (step-up, swimming)** – Improves feel with localized changes.
6. **Lighting (CSM, AO)** and **water (animation, reflection)** – Polish after core scale is in place.
