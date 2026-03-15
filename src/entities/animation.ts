import * as THREE from 'three'
import type { AnimalKind } from './types'
import { getAllEntities, getEntityMesh } from './registry'

const BOB_FREQ = 8
const BOB_AMPLITUDE = 0.02
const BOB_AMPLITUDE_WALK = 0.04
const MOVING_BOB_MULTIPLIER_SHEEP = 0.9

interface QuadrupedGait {
  legFrequency: number
  swingAngle: number
}

const DEFAULT_QUADRUPED_GAIT: QuadrupedGait = {
  legFrequency: 12,
  swingAngle: 0.35,
}

const QUADRUPED_GAIT_BY_KIND: Partial<Record<AnimalKind, QuadrupedGait>> = {
  sheep: { legFrequency: 10, swingAngle: 0.28 },
  cow: { legFrequency: 10, swingAngle: 0.3 },
  horse: { legFrequency: 11, swingAngle: 0.36 },
  donkey: { legFrequency: 11, swingAngle: 0.34 },
  rabbit: { legFrequency: 16, swingAngle: 0.42 },
  chicken: { legFrequency: 14, swingAngle: 0.24 },
}

const SHEEP_HEAD_GRAZE_FREQ = 1.9
const SHEEP_HEAD_GRAZE_PITCH = 0.75
const SHEEP_HEAD_IDLE_PITCH = -0.1
const SHEEP_HEAD_MOVE_PITCH = -0.18
const SHEEP_HEAD_GRAZE_DROP_Y = 0.12
const SHEEP_HEAD_GRAZE_PUSH_Z = 0.06

interface SheepMeshUserData {
  sheepHeadPivot?: THREE.Group
  sheepHeadBaseY?: number
  sheepHeadBaseZ?: number
}

/**
 * Deterministic hash for entity id based animation phase offsets.
 */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) >>> 0
  return h
}

/**
 * Returns quadruped gait tuning for the given animal kind.
 */
function getQuadrupedGait(kind: AnimalKind): QuadrupedGait {
  return QUADRUPED_GAIT_BY_KIND[kind] ?? DEFAULT_QUADRUPED_GAIT
}

/**
 * Applies a simple walk cycle to quadruped legs (alternating front-left/back-right with front-right/back-left).
 * Any object in the mesh tree with userData.legIndex is treated as a leg pivot.
 */
function updateQuadrupedLegs(
  mesh: THREE.Group,
  moving: boolean,
  time: number,
  gait: QuadrupedGait,
): void {
  const angle = moving ? Math.sin(time * gait.legFrequency) * gait.swingAngle : 0
  mesh.traverse((obj) => {
    const legIndexRaw = (obj.userData as { legIndex?: number }).legIndex
    if (legIndexRaw == null) return
    const legIndex = Number(legIndexRaw)
    const sign = legIndex === 0 || legIndex === 2 ? 1 : -1
    obj.rotation.x = angle * sign
  })
}

/**
 * Updates sheep head pose with a grazing-style dip while idle.
 */
function updateSheepHeadPose(
  mesh: THREE.Group,
  moving: boolean,
  time: number,
  entityId: string,
): void {
  const data = mesh.userData as SheepMeshUserData
  const headPivot = data.sheepHeadPivot
  if (!(headPivot instanceof THREE.Group)) return

  const baseY = data.sheepHeadBaseY ?? headPivot.position.y
  const baseZ = data.sheepHeadBaseZ ?? headPivot.position.z
  if (typeof data.sheepHeadBaseY !== 'number') data.sheepHeadBaseY = baseY
  if (typeof data.sheepHeadBaseZ !== 'number') data.sheepHeadBaseZ = baseZ

  if (moving) {
    headPivot.rotation.x = SHEEP_HEAD_MOVE_PITCH
    headPivot.position.y = baseY
    headPivot.position.z = baseZ
    return
  }

  const phase = ((hashId(entityId) % 1024) / 1024) * Math.PI * 2
  const wave = Math.max(0, Math.sin(time * SHEEP_HEAD_GRAZE_FREQ + phase))
  const graze = wave * wave
  headPivot.rotation.x = SHEEP_HEAD_IDLE_PITCH - graze * SHEEP_HEAD_GRAZE_PITCH
  headPivot.position.y = baseY - graze * SHEEP_HEAD_GRAZE_DROP_Y
  headPivot.position.z = baseZ + graze * SHEEP_HEAD_GRAZE_PUSH_Z
}

/**
 * Syncs entity meshes to entity position and rotation, then applies simple walk/bob animation.
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
    const bobMultiplier = e.kind === 'sheep' ? MOVING_BOB_MULTIPLIER_SHEEP : 1
    const amp = (moving ? BOB_AMPLITUDE_WALK : BOB_AMPLITUDE) * bobMultiplier
    mesh.position.y += Math.sin(time * BOB_FREQ) * amp
    if (
      e.kind === 'pig' ||
      e.kind === 'sheep' ||
      e.kind === 'cow' ||
      e.kind === 'chicken' ||
      e.kind === 'horse' ||
      e.kind === 'donkey' ||
      e.kind === 'rabbit'
    ) {
      updateQuadrupedLegs(mesh, moving, time, getQuadrupedGait(e.kind))
    }
    if (e.kind === 'sheep') {
      updateSheepHeadPose(mesh, moving, time, e.id)
    }
  }
}
