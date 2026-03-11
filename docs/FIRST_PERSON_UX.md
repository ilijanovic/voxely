# First-Person Character UX – Hand, Held Items, and Sword Attack

This document describes the intended user experience and technical anchors for the first-person character: visible hand(s), held items (blocks and weapons/tools), and sword slash attack animation.

---

## 1. Hand and camera

- In **first-person view**, the player sees a POV (point-of-view) arm/hand attached to the camera.
- The hand is only visible in first-person; in third-person it is hidden and the full body is shown.
- Position and offset of the hand are relative to the camera (fixed offset so the arm appears at the bottom-right of the view).
- **Code:** `createPOVHands(camera)` and visibility in `updateCameraAndViewMode()` in [src/game.ts](src/game.ts). The POV hand group is a child of the camera.

---

## 2. Held item

- **Source:** The currently selected hotbar slot determines what is shown in the hand ([getSelectedBlockType()](src/game-hotbar.ts) / extended hotbar with items).
- **Blocks:** Shown as a small 3D block (e.g. BoxGeometry with block texture) attached to the hand, or a flat item quad using the block texture. Textures come from the [block registry](src/block-registry.ts) and [getBlockTexturePath()](src/constants.ts).
- **Weapons and tools:** Shown as a dedicated model or sprite (e.g. sword = elongated mesh or textured quad) in the hand. Item textures can live under an item texture path (e.g. `items/wood_sword.png`).
- **Empty slot:** No held item is shown (hand only).
- Visibility of the held item follows the same first-person rule as the hand.

---

## 3. Item categories and left-click behavior

| Category   | Example      | In hand        | Left-click action                                      |
| ---------- | ------------ | -------------- | ------------------------------------------------------- |
| **Block**  | grass, dirt  | Small block    | Mine block (raycast → break progress); place on right-click. |
| **Tool**   | Pickaxe (future) | Tool model | Mine block (same as now; future: faster / different logic). |
| **Weapon** | Sword        | Sword model    | **Sword slash** (horizontal slice animation). No block mining with sword. |

**Design decision:** With a weapon (e.g. sword) selected, left-click always triggers the slash attack. Block mining is only performed when holding a block or tool (or “hand” / empty). So: sword in slot → slash only; block/tool in slot → mine when aiming at a block.

---

## 4. Sword slash animation

- **Trigger:** Left-click while a weapon (e.g. sword) is selected and not already slashing.
- **Motion:** A horizontal slice: **left → right**, then **back** (or one stroke left→right with a quick return). The arm and held item rotate together (e.g. around a vertical or combined axis).
- **Timing:** Forward phase ~0.35 s, return ~0.2 s (or single 0.4–0.5 s total). A short cooldown after the slash before the next one can be triggered.
- **State machine:** `idle` → (left-click with sword) → `slashing` → (animation done) → `cooldown` → `idle`.
- **Implementation:** Driven by a phase variable (e.g. `slashPhase` 0…1 or time in seconds), updated in `updateCameraAndViewMode()` with `dt`. Use an ease-in/out curve for the rotation so the slash feels responsive. Reuse the same pattern as the existing mining swing ([miningSwingPhase](src/game.ts) around lines 751, 1505–1513).

---

## 5. Code anchors

| Area            | Location                                                                 | Notes                                                                 |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| POV hand        | [game.ts](src/game.ts) `createPOVHands()` (ca. 622–647)                 | Single arm mesh; add held-item container as child of arm or hand group. |
| POV animation  | [game.ts](src/game.ts) `updateCameraAndViewMode()` (ca. 1471–1530)      | Mining swing and walk bob; add slash state and rotation here.         |
| Hotbar          | [game-hotbar.ts](src/game-hotbar.ts)                                    | `getSelectedBlockType()`, `getSelectedHotbarIndex()`; extend for sword/item. |
| Left-click      | [game.ts](src/game.ts) ~1766–1909                                       | Raycast and `breakTarget` for mining; branch: weapon → start slash; block/tool → mining. |
| Block textures  | [block-registry.ts](src/block-registry.ts), [constants.ts](src/constants.ts) | Block and (if needed) item texture paths for held-item meshes.        |

---

## 6. Optional: second hand

Currently only one arm is visible. A second hand (e.g. left hand with shield or empty) can be added later; for this spec, one hand holding the selected item is sufficient.

---

## 7. Summary diagram (slash vs mining)

```
Left-click
    │
    ├─ Selected slot = Weapon (e.g. sword)  → Start slash animation (no mining)
    │
    └─ Selected slot = Block or tool       → Raycast block → mining (breakTarget, mining swing)
```
