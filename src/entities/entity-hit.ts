/**
 * Entity hit detection: ray–AABB test for melee attacks.
 */
import * as THREE from 'three'
import { getAllEntities } from './registry'
import type { Entity } from './types'

const _box = new THREE.Box3()
const _hitPoint = new THREE.Vector3()

/**
 * Finds the closest living entity hit by the given ray within maxDistance.
 * Uses entity AABB in world space.
 * @returns The hit entity and distance, or null if none hit.
 */
export function raycastEntities(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): { entity: Entity; distance: number } | null {
  const ray = new THREE.Ray(origin, direction.clone().normalize())
  let closest: { entity: Entity; distance: number } | null = null

  for (const e of getAllEntities()) {
    if (e.state === 'dead') continue
    _box.min.set(
      e.position.x - e.aabb.halfX,
      e.position.y,
      e.position.z - e.aabb.halfZ,
    )
    _box.max.set(
      e.position.x + e.aabb.halfX,
      e.position.y + e.aabb.height,
      e.position.z + e.aabb.halfZ,
    )
    const hit = ray.intersectBox(_box, _hitPoint)
    if (hit === null) continue
    const dist = origin.distanceTo(hit)
    if (dist > maxDistance) continue
    if (closest === null || dist < closest.distance) {
      closest = { entity: e, distance: dist }
    }
  }
  return closest
}
