import * as THREE from '@/three'
import { getAllEntities, getEntityMesh } from './registry'

const BOB_FREQ = 8
const BOB_AMPLITUDE = 0.02
const BOB_AMPLITUDE_WALK = 0.04
const WALK_LEG_FREQ = 12
const LEG_SWING_ANGLE = 0.35

/**
 * Applies a simple walk cycle to quadruped legs (alternating front-left/back-right with front-right/back-left).
 * Used for pig and sheep (meshes with userData.legIndex on legs).
 */
function updateQuadrupedLegs(mesh: THREE.Group, moving: boolean, time: number): void {
  const angle = moving ? Math.sin(time * WALK_LEG_FREQ) * LEG_SWING_ANGLE : 0
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex !== undefined) {
      const legIndex = (obj as THREE.Mesh & { userData: { legIndex: number } }).userData.legIndex
      const sign = legIndex === 0 || legIndex === 2 ? 1 : -1
      obj.rotation.x = angle * sign
    }
  })
}

/**
 * Sync entity meshes to entity position/rotation and apply simple bobbing.
 * Call after movement each frame. time is total elapsed seconds (e.g. from game loop).
 */
export function updateAnimation(time: number): void {
  const entities = getAllEntities()
  for (const e of entities) {
    const mesh = getEntityMesh(e.id)
    if (!mesh) continue
    mesh.position.set(e.position.x, e.position.y, e.position.z)
    mesh.rotation.y = e.rotationY
    const moving =
      e.state === 'wander' || e.state === 'walk' || e.state === 'flee' || e.state === 'chase'
    const amp = moving ? BOB_AMPLITUDE_WALK : BOB_AMPLITUDE
    mesh.position.y += Math.sin(time * BOB_FREQ) * amp
    if (e.kind === 'pig' || e.kind === 'sheep') updateQuadrupedLegs(mesh, moving, time)
  }
}
