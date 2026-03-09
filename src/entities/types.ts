/** Biome for spawn logic – aligned with world types. */
export type Biome = "plains" | "desert" | "forest" | "jungle" | "mountain" | "snow";

/** Animal kinds: sheep, pig, wolf (staged). */
export type AnimalKind = "sheep" | "pig" | "wolf";

/** AABB for collision: half extents in XZ and full height in Y. */
export interface EntityAABB {
  halfX: number;
  halfZ: number;
  height: number;
}

/** AI states – used differently per animal kind. */
export type EntityState =
  | "idle"
  | "wander"
  | "walk"
  | "flee"
  | "chase"
  | "dead";

/** Entity data – no THREE references so it stays serializable for future multiplayer. */
export interface Entity {
  id: string;
  kind: AnimalKind;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  rotationY: number;
  aabb: EntityAABB;
  state: EntityState;
  stateTime: number;
}

/** Per-kind config: speeds, spawn biomes, cap per chunk. */
export interface AnimalDef {
  kind: AnimalKind;
  aabb: EntityAABB;
  walkSpeed: number;
  runSpeed: number;
  spawnBiomes: Biome[];
  maxPerChunk: number;
}
