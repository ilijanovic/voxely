import { getAllEntities } from './registry'

const GRAVITY = -18
const TERMINAL_VELOCITY = -28

export type ResolveVoxelCollisionsFn = (
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
  halfX: number,
  halfZ: number,
  height: number,
) => void

/**
 * Clamp horizontal position to wander radius around spawn home (leash).
 * When entity has spawnHome and wanderRadius, keeps (x,z) inside the circle.
 */
function clampToWanderRadius(
  position: { x: number; y: number; z: number },
  spawnHome: { x: number; z: number },
  wanderRadius: number,
): void {
  const dx = position.x - spawnHome.x
  const dz = position.z - spawnHome.z
  const distSq = dx * dx + dz * dz
  const rSq = wanderRadius * wanderRadius
  if (distSq <= rSq) return
  const dist = Math.sqrt(distSq)
  const scale = wanderRadius / dist
  position.x = spawnHome.x + dx * scale
  position.z = spawnHome.z + dz * scale
}

/**
 * Apply gravity and voxel AABB collision to all entities.
 * resolveFn must be the game's resolveVoxelCollisions (injected to avoid circular deps).
 * Entities with spawnHome and wanderRadius are clamped to their leash after resolution.
 */
export function updateMovement(dt: number, resolveFn: ResolveVoxelCollisionsFn): void {
  const entities = getAllEntities()
  for (const e of entities) {
    if (e.state === 'dead') continue
    e.velocity.y += GRAVITY * dt
    if (e.velocity.y < TERMINAL_VELOCITY) e.velocity.y = TERMINAL_VELOCITY
    resolveFn(e.position, e.velocity, dt, e.aabb.halfX, e.aabb.halfZ, e.aabb.height)
    if (e.spawnHome != null && e.wanderRadius != null) {
      clampToWanderRadius(e.position, e.spawnHome, e.wanderRadius)
    }
  }
}
