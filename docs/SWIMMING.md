# Swimming and Diving

This document describes the swimming and diving mechanics in Voxely and their reference behaviour in Minecraft.

## Minecraft reference (Java Edition)

- **Space (Jump):** Rise / swim upward in water.
- **Shift (Sneak):** Sink faster.
- **No key held:** Player slowly sinks.

Horizontal movement speed is reduced in water (e.g. ~2.2 blocks/s at surface, lower when submerged). Sprint-swimming (double-tap forward) is a separate feature and is not implemented here.

Source: [Minecraft Wiki – Swimming](https://minecraft.wiki/w/Swimming).

## Definition of "in water" in Voxely

The player is considered **in water** when their position is below the water surface:

- Water surface height: `WATER_LEVEL + WATER_BLOCK_HEIGHT` (world units).
- There are no water voxel blocks in terrain; water is rendered as a plane per chunk. The same height-based rule is used for atmosphere (fog, lighting) and swimming, so behaviour is consistent.

A small vertical offset (e.g. a fraction of player height) can be used so that shallow contact (e.g. feet only) does not immediately trigger swim physics.

## Controls

| Input   | Effect in water      |
|---------|----------------------|
| Space   | Swim up (rise)       |
| Shift   | Sink faster          |
| Neither | Slow sink (default)  |

## Movement

- **Horizontal:** Movement speed in water is reduced by a constant factor (`waterHorizontalSpeedFactor`) so the player is slower than on land.
- **Vertical:** Swim-up speed, default sink speed, and sneak sink speed are defined as named constants (per-second, frame-rate independent). Optional: cap vertical velocity in water for a more controlled feel.

## Implementation notes

- Vertical speeds (swim up, sink, sink with sneak) are expressed in world units per second and applied in the movement update so behaviour is frame-rate independent.
- Jump (Space) in water is used only for buoyancy; the normal jump force is applied only when not in water and when grounded.
