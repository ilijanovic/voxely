# Plan: Level 60, Areas, fixed villages/NPCs, Quests, and Loot (updated)

This document extends the WoW/Minecraft-style plan with: **no automatic objective markers**, **mob drop rates** (wool, meat, etc.), **NPC placement** (fixed or random-in-radius), and the principle that **quest chains and “where to go next” are defined by you via NPC dialogue** (like WoW).

---

## Design principles (from your clarifications)

1. **Player does not know locations**  
   The player does not get automatic markers for:
   - Quest NPCs  
   - Mobs to kill  
   - Items to collect  

   Discovery is by **exploration** and **NPC dialogue**: e.g. “Find the hermit north of the lake”, “Wolves in the eastern forest drop pelts”.

2. **Where the next quest is = your part**  
   You define quests and chains. The engine supports:
   - Placing X NPCs at given (or random) coordinates in a given distance  
   - Dialogue text that **you write** to describe where the next NPC or objective is  
   - No engine-generated waypoints or minimap markers

3. **Overview of NPC placement**  
   - There will be **X NPCs** in the world.  
   - They are placed at **given coordinates** or **random (but deterministic) coordinates** within a **given distance** (e.g. radius from a point or within an area).  
   - Sooner or later, **some NPCs’ dialogue describes where to find the next NPC** (WoW-style chain).  
   - So: the system provides placement (fixed or random-in-region) and dialogue/quest data; **you** author the text that points to the next NPC or objective.

4. **Mob drops (wool, meat, etc.)**  
   - Mobs should have **drop rates**: e.g. sheep drop wool at 70%, pigs drop meat (1–3), etc.  
   - Same items can be used for **quest collect objectives** (e.g. “Collect 5 wool” = kill sheep, which drop wool at X% rate).  
   - No need for special “quest-only” mobs or nodes; normal mobs + drop tables + quest objectives.

---

## Additions to the original plan

### 1. No automatic objective markers

- **No minimap/compass markers** for quest NPCs, kill targets, or collectibles.  
- **Quest UI** can show objectives as text only (e.g. “Collect 5 Wool (2/5)”) without world markers.  
- **Finding objectives** is done by:
  - Exploring the world  
  - Reading **NPC dialogue** you author (e.g. “Wolves that drop pelts roam the eastern woods”)  
  - Following **quest text** that describes regions or directions in prose  

So the implementation stays **marker-free**; discovery is narrative and exploration-driven.

---

### 2. Mob drop system (drop rates)

- **Drop table per mob kind** (and optionally per level/area later):  
  - Each entry: **item** (block type or item id, e.g. `white_wool`, `raw_porkchop`), **chance** (0–1), **minCount**, **maxCount**.  
  - On entity death (in `game.ts` where `hit.entity.health <= 0`), **roll each entry** of the table for that mob kind and spawn that many drops using the existing **spawnDrop** pipeline (same as block breaks).  

- **Central config**: e.g. `src/loot-tables.ts` or per-entity in `entities/spawn.ts` / `entities/types.ts`:  
  - `DROP_TABLES: Record<AnimalKind, DropEntry[]>`  
  - `DropEntry = { item: BlockType | ItemId, chance: number, minCount: number, maxCount: number }`  

- **Existing behaviour**: Pig already drops `raw_porkchop` (1–3) in `game.ts`; replace that with one entry in the drop table for `pig`. Add tables for sheep (e.g. wool), wolf (e.g. leather/quest item), etc.  

- **Quest “collect” objectives**: Use the same items. Quest “Collect 5 Wool” checks inventory (or a kill/drop counter); wool comes only from killing sheep (via drop table). No separate “quest wool” or special spawns.

**Files to touch**:  
- New: `src/loot-tables.ts` (or under `src/entities/`) for drop table definitions.  
- `src/game.ts`: on entity death, call a small `rollLoot(kind, position)` that uses the table and calls `spawnDropItem` for each rolled drop.  
- Ensure all dropped items exist in block registry (wool, meat, etc.) and can be picked up and stacked in inventory.

---

### 3. NPC placement: fixed vs random in distance

- **Fixed coordinates**: You define exact (x, y, z) for some NPCs (already in the original plan).  

- **Random within distance**: For “X NPCs in a given distance”:  
  - Define e.g. **center (cx, cz)** and **radius R** (or an area id that maps to a region).  
  - **Count N**: place exactly N NPCs in that region.  
  - Positions are **deterministic** from world seed (and maybe area id): e.g. seeded RNG over a grid or Poisson disk so the same seed always gives the same NPC positions.  
  - So you don’t hand-pick every coordinate; you say “5 NPCs in radius 200 around (1000, 1000)” and the engine places them in a deterministic way.  

- **Mix**: Some NPCs at fixed XYZ, others “N in region” — both supported.  
- **Dialogue**: Regardless of placement, **you** write the dialogue that tells the player where the next NPC or objective is (no automatic “next quest” marker).

---

### 4. Quest design is your responsibility

- **You** define:  
  - Which NPC gives which quest(s)  
  - Quest objectives (kill N of mob type X, collect N of item Y, talk to NPC Z, reach area W)  
  - **Dialogue text** that describes where to find the next NPC or where to find mobs/items  

- **Engine** provides:  
  - Placement of X NPCs (fixed or random-in-distance)  
  - Quest accept/turn-in and objective tracking (kill count, item count)  
  - Drop tables so that “collect wool” is satisfied by killing sheep  
  - No automatic “where is the next quest” — only what you put in dialogue and quest text  

So: “Where the next quest is” is entirely defined by your quest and dialogue content, WoW-style.

---

## Summary table

| Topic | Implementation |
|-------|----------------|
| **Player discovery** | No markers; exploration + NPC dialogue (author-written) |
| **Mob drops** | Drop table per mob kind: item, chance, min/max count; roll on death, use existing spawnDrop |
| **Quest objectives** | Same items from drops; “collect N” = inventory/count; “kill N” = kill counter |
| **NPC placement** | Fixed (x,y,z) and/or “N NPCs in radius/area” (deterministic from seed) |
| **Where next quest is** | Your dialogue/quest text; no engine waypoints |

---

## Suggested implementation order (with loot)

1. Experience + Level (max 60), Save, HUD (unchanged from original plan).  
2. World areas (level bands, getAreaAt) (unchanged).  
3. **Mob drop system**: loot tables + roll on entity death; replace hardcoded pig drop.  
4. Mob level from area; XP from kills (can use same death hook as drops).  
5. Fixed villages + terrain adaptation (unchanged).  
6. Fixed NPCs + optional “N NPCs in region”; spawn at placement.  
7. Quest system: types, registry, dialogue UI, objectives (kill/collect/talk), no markers.  
8. You author quests and dialogue that describe where to find next NPCs and objectives.

This keeps the original plan intact and adds: **no markers**, **drop rates**, **flexible NPC placement**, and **your ownership of “where the next quest is”** via dialogue and quest design.
