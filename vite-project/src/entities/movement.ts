import { getAllEntities } from "./registry";

const GRAVITY = -18;
const TERMINAL_VELOCITY = -28;

export type ResolveVoxelCollisionsFn = (
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
  halfX: number,
  halfZ: number,
  height: number
) => void;

/**
 * Apply gravity and voxel AABB collision to all entities.
 * resolveFn must be the game's resolveVoxelCollisions (injected to avoid circular deps).
 */
export function updateMovement(
  dt: number,
  resolveFn: ResolveVoxelCollisionsFn
): void {
  const entities = getAllEntities();
  for (const e of entities) {
    if (e.state === "dead") continue;
    e.velocity.y += GRAVITY * dt;
    if (e.velocity.y < TERMINAL_VELOCITY) e.velocity.y = TERMINAL_VELOCITY;
    resolveFn(
      e.position,
      e.velocity,
      dt,
      e.aabb.halfX,
      e.aabb.halfZ,
      e.aabb.height
    );
  }
}
