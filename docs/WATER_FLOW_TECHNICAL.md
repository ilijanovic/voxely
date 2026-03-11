# Water Flow – Technical Deep Dive

This document describes how water flow is typically implemented in voxel games, with Minecraft as the main reference, and how Voxely implements Minecraft-style flowing water.

---

## 1. Why Water Is Different

In voxel engines, most blocks are static: they occupy a cell and do not change unless the player or the game logic modifies them. **Fluids** (water, lava) behave differently:

- **Flow**: They spread into adjacent empty cells according to rules (gravity, pressure, viscosity).
- **Source vs flowing**: A "source" block is full and can feed an arbitrary amount of flow; "flowing" blocks have a "level" that decreases with distance and limits how far the fluid can spread.
- **Block updates**: Flow is usually driven by **neighbor updates** (when a block is placed or removed next to the fluid) or by **scheduled ticks**, not by random ticks.

Implementing water therefore requires:

1. A way to represent water in the world (block types or a separate fluid state).
2. A **spread algorithm** that, given the current state, decides where water should move (down first, then horizontal).
3. A **tick or event loop** that runs the spread at a fixed rate or when blocks change.
4. **Rendering** that shows water at different heights (source = full block, flowing = lower fill) and optionally flow direction.

---

## 2. Minecraft Mechanics (Reference)

The following summarizes Minecraft Java Edition fluid behaviour; we use it as the design target for Voxely.

### 2.1 Level

- **Source block**: Level 0 ("full"). It is the origin of flow and does not decay.
- **Flowing block**: Level 1–7. Level 1 = one step from a source; level 7 = maximum distance (flow stops beyond 7).
- **Falling**: In Java Edition, a flowing block that has water (source or flowing) **above** it is given level 8 for rendering/fall behaviour; the actual spread logic still uses 1–7.

So: **level 0 = source**, **levels 1–7 = distance from source**, **level 8 = special "falling" display state**.

### 2.2 Spread Order and Rules

When a fluid block receives a block update (or is processed in a tick):

1. **Down first**: If the block **below** is air, it is replaced by a flowing fluid block with level 0 (i.e. "falling" from this block). That new block is then processed again, so water falls vertically as far as possible.
2. **Then horizontal**: If the block below is solid (or a block that does not let fluid through), the fluid spreads to the **four horizontal neighbours**. For each neighbour:
   - If it is **air**, it can become a flowing block with `level = min(neighbour levels) + 1`, capped at 7.
   - If it is already the same fluid with a **higher** level, it may be updated to a lower level (closer to source).
3. **No spread into solid**: Fluid never replaces solid blocks. It only fills air or (in some games) replaceable blocks.

So the **order of operations** is: (1) try to flow **down** into air; (2) then try to flow **horizontally** into air or higher-level fluid.

### 2.3 Speed

- **Water**: 1 block every **5 game ticks** (4 blocks per second).
- So the simulation does not update every frame; it updates on a fixed tick (e.g. every 5 ticks).

### 2.4 Source Block Creation ("Infinite Water")

In Java Edition, when:

- The block is **air** (or a waterloggable block),
- There are **at least two water source blocks** adjacent to it (on horizontal faces),
- There is a **solid block** (or block that blocks flow) **below** it,

then that block is turned into a **new water source block**. This is how a 2×2 pool creates an "infinite" water source in the middle.

### 2.5 Block Updates (Scheduled Ticks vs Global Tick)

- In Minecraft, flow is triggered by **post-placement updates** and **neighbour-changed updates**: when you place or remove a block next to water, that water block is **scheduled for a tick**. Only blocks in this pending set are processed each tick; the game does not iterate every fluid block every tick.
- This **scheduled-tick queue** gives deterministic propagation order and spreads load over time. Newly placed falling water is processed again immediately, so a column of air fills downward in one tick.
- **Voxely** uses a **global tick**: every N game ticks, all water block positions in loaded chunks (and block mods) are collected and passed once to the spread function. No per-block queue. Simpler, but vertical fall is at most one block per tick per column unless we add internal sub-passes or sort order.

### 2.6 Level 8 ("Falling") in Minecraft

- If bit 0x8 is set (level 8 or higher), the block is treated as **falling**: it spreads **only downward** and often renders as a full block. The lower bits are ignored for spread; this is mainly a rendering/behaviour flag.
- Voxely does not implement level 8; falling water is represented as level 1–7 and spreads down and horizontally in the same pass.

---

## 3. Alternative Approaches

### 3.1 Pressure-Based

Each cell has a "pressure" (or water amount). Each tick, pressure is exchanged with neighbours proportionally to the pressure difference. This yields smooth, realistic flow but is more complex and can cause water to "slosh" in ways that don’t match Minecraft.

### 3.2 Cellular Automata

Each cell has a discrete state (e.g. empty, water level 1–7). Transition rules define how state spreads (e.g. "if neighbour has water and I’m air, become water with level neighbour+1"). This is close to what Minecraft does and is easy to reason about.

### 3.3 Eulerian / GPU Simulation

Full fluid dynamics (Navier–Stokes, pressure projection, advection) on a 3D grid, often on the GPU. Gives very realistic flow but is overkill for a blocky Minecraft-like look and is expensive.

**Voxely** follows the **Minecraft / cellular-automata style**: discrete water blocks with level 0–7 and deterministic spread rules.

---

## 4. Design Decisions for Voxely

### 4.1 Water as Block Types

- We represent water in the **same block system** as everything else: **block types** in the voxel buffer and in `blockModifications`.
- **Eight block types**: `water_source`, `water_flowing_1`, …, `water_flowing_7`. So level is encoded in the type; no separate metadata map is required. This keeps save/load and the pipeline simple.
- **Solid**: All water block types are **non-solid** (players can walk through; collision can be handled separately for "swimming" if desired).

### 4.2 Static Ocean vs Flowing Water

- **Ocean/lakes**: The existing **heightmap-based water** is unchanged. Where the terrain surface is below `WATER_LEVEL`, we still render a **single horizontal water plane** per chunk (see `buildChunkWaterGeometry` in chunk-apply). No flow is simulated there; it is purely visual.
- **Flowing water** exists only where:
  1. The player **places** water (e.g. from a bucket) as `water_source`, or
  2. (Optional) Future structures (rivers, springs) place water sources.

So we do **not** fill caves below sea level with flowing water by default; only placed water flows.

### 4.3 Fluid Tick

- A dedicated module (e.g. `src/game/fluid/water-flow.ts`) implements the spread logic in **pure functions**: given `getBlockAt` and `isSolid`, it returns a list of **block changes** `{ bx, by, bz, value }`.
- The **game loop** calls this module every **WATER_SPREAD_TICKS** (e.g. 5) ticks, and applies the changes through the **existing** block-change path (`blockModifications` + chunk voxel update + mesh rebuild). So no duplicate "fluid state": water is just blocks.
- Only chunks **near the player** (or loaded chunks) are considered for flow, to limit cost.

### 4.4 Chunk Boundaries

- When computing spread, we use `getBlockAt(bx, by, bz)`. If the neighbour is in an **unloaded chunk**, `getBlockAt` returns `null`. We **do not** spread into null (we skip that neighbour). So water does not flow into unloaded chunks until they load; then the next tick can continue spread from the edge. This avoids loading chunks just for water.

### 4.5 Source Creation (Infinite Water)

- We implement the **2-source rule**: if a block is air, has at least two horizontal neighbours that are `water_source`, and has a solid block below, we convert it to `water_source`. This is a small extra check in the same tick pass.

---

## 5. Summary

| Aspect            | Choice for Voxely                                      |
|-------------------|--------------------------------------------------------|
| Representation    | Block types: `water_source`, `water_flowing_1`…`7`     |
| Ocean             | Unchanged; heightmap + one plane per chunk             |
| Flow trigger      | Periodic tick every N game ticks (e.g. 5)              |
| Spread order      | Down first (into air), then horizontal (level + 1, max 7) |
| Source creation   | Two adjacent sources + solid below → new source         |
| Rendering         | Instanced or per-block water quads with height by level |
| Save/Load         | Same as other blocks (blockModifications + chunk buffer) |

This yields Minecraft-like water flow with minimal new systems and clear, testable rules.

---

## 6. Voxely vs Minecraft (Quick Reference)

| Aspect            | Minecraft                          | Voxely                                      |
|-------------------|------------------------------------|---------------------------------------------|
| Level 0–7         | Yes                                | Yes                                         |
| Level 8 falling   | Yes (render + down-only spread)    | No                                          |
| Spread order      | Down first, then horizontal        | Same in one pass; order of positions matters |
| Tick interval     | 5 ticks                           | 5 ticks                                     |
| Update model      | Scheduled ticks per fluid block    | Global tick over all water positions        |
| 2-source rule     | Yes                                | Yes                                         |
| Chunk boundaries  | Only loaded chunks                 | Spread into null skipped                    |
| "In water"       | Per-block (voxel)                  | Height-based only (WATER_LEVEL + height)     |

---

## 7. Known Gaps and Refactor Options

- **Processing order:** Water positions are processed in iteration order (chunk/map). Sorting by **Y descending, then level ascending** makes "fall first" deterministic and can improve perceived behaviour.
- **Vertical fall speed:** One block per tick per column; Minecraft falls multiple blocks per tick via scheduled updates. Option: multiple sub-passes for down-spread only, or prioritising positions with air below.
- **Level 8 / falling:** Not implemented; optional for MC-accurate rendering or down-only spread.
- **Update queue:** Replacing "tick all water" with a scheduled fluid queue would align with Minecraft and can reduce cost when little water is moving.
- **"In water" and swimming:** Currently `isPlayerInWater()` uses only `WATER_LEVEL + WATER_BLOCK_HEIGHT`. Placed or flowing water above/below sea level does not trigger swimming, atmosphere, or step-up. A voxel-based check (AABB vs water blocks) would be needed for that.
- **Entities:** No drowning, pathfinding around water, or "in water" for mobs; they fall through water blocks (non-solid).
- **Water does not destroy blocks:** Spread only fills air or higher-level water; flowers, torches, etc. are not replaced. Minecraft can destroy some blocks when water flows in.
- **Save/load:** Water blocks are stored in `blockModifications` and serialised as `placedBlocks`; flow resumes on next tick after load.
