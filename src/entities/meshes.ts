import * as THREE from 'three'
import type { AnimalKind } from './types'

const BLOCK = 1

/** Pig body/head color (Minecraft-style pink). */
const PIG_PINK = 0xf8b4b4
/** Pig snout/legs/ears (slightly darker). */
const PIG_SNOUT = 0xe8a090
/** Pig eyes (dark). */
const PIG_EYE = 0x1a1a1a

/** Shared geometries per part (reused across all animals). */
const boxBody = new THREE.BoxGeometry(0.6 * BLOCK, 0.5 * BLOCK, 0.4 * BLOCK)
const boxHead = new THREE.BoxGeometry(0.35 * BLOCK, 0.35 * BLOCK, 0.35 * BLOCK)
const boxLeg = new THREE.BoxGeometry(0.15 * BLOCK, 0.25 * BLOCK, 0.15 * BLOCK)
const boxEar = new THREE.BoxGeometry(0.12 * BLOCK, 0.08 * BLOCK, 0.06 * BLOCK)
/** Pig snout: slightly larger and longer for a more recognizable silhouette. */
const boxPigSnout = new THREE.BoxGeometry(0.22 * BLOCK, 0.18 * BLOCK, 0.4 * BLOCK)
/** Pig eyes: small dark patches on the front of the head. */
const boxPigEye = new THREE.BoxGeometry(0.06 * BLOCK, 0.05 * BLOCK, 0.02 * BLOCK)

// ─── Shared materials (lazy-init, reused across all instances) ───────────────
const _refSheepBody = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepHead = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refPigBody = { current: null as THREE.MeshStandardMaterial | null }
const _refPigHead = { current: null as THREE.MeshStandardMaterial | null }
const _refPigSnout = { current: null as THREE.MeshStandardMaterial | null }
const _refPigLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refPigEar = { current: null as THREE.MeshStandardMaterial | null }
const _refPigEye = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfBody = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfHead = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerHead = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerBody = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerEye = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerNose = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerMouth = { current: null as THREE.MeshStandardMaterial | null }
const _refVillagerHat = { current: null as THREE.MeshStandardMaterial | null }

/** Villager: humanoid proportions (head, robe body, two legs). */
const boxVillagerTorso = new THREE.BoxGeometry(0.5 * BLOCK, 0.55 * BLOCK, 0.28 * BLOCK)
const boxVillagerLeg = new THREE.BoxGeometry(0.18 * BLOCK, 0.5 * BLOCK, 0.14 * BLOCK)
/** Small boxes for villager face: eyes, nose, mouth. */
const boxVillagerEye = new THREE.BoxGeometry(0.06 * BLOCK, 0.05 * BLOCK, 0.02 * BLOCK)
const boxVillagerNose = new THREE.BoxGeometry(0.05 * BLOCK, 0.05 * BLOCK, 0.04 * BLOCK)
const boxVillagerMouth = new THREE.BoxGeometry(0.1 * BLOCK, 0.02 * BLOCK, 0.02 * BLOCK)
/** Hat: brim + top (flat cap style). */
const boxVillagerHatBrim = new THREE.BoxGeometry(0.4 * BLOCK, 0.04 * BLOCK, 0.4 * BLOCK)
const boxVillagerHatTop = new THREE.BoxGeometry(0.28 * BLOCK, 0.12 * BLOCK, 0.28 * BLOCK)

function getMat(
  ref: { current: THREE.MeshStandardMaterial | null },
  color: number,
  params?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
  if (!ref.current) ref.current = new THREE.MeshStandardMaterial({ color, roughness: 1, ...params })
  return ref.current
}

/** Sheep: white body, pink head, short legs. */
function createSheepMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refSheepBody, 0xf5f5f5)
  const matHead = getMat(_refSheepHead, 0xffccbb)
  const matLeg = getMat(_refSheepLeg, 0x2a2a2a)

  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.25
  body.castShadow = true
  body.receiveShadow = true

  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.45, 0.28)
  head.castShadow = true
  head.receiveShadow = true

  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.2, 0.125, 0.15)
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.2, 0.125, 0.15)
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.2, 0.125, -0.15)
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.2, 0.125, -0.15)
  leg4.castShadow = true
  leg4.receiveShadow = true

  group.add(body)
  group.add(head)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  return group
}

/** Pig: chunkier body (~0.9 block), prominent snout, floppy ears. Scale matches Minecraft-style AABB. */
function createPigMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refPigBody, PIG_PINK)
  const matHead = getMat(_refPigHead, PIG_PINK)
  const matSnout = getMat(_refPigSnout, PIG_SNOUT)
  const matLeg = getMat(_refPigLeg, PIG_SNOUT)
  const matEar = getMat(_refPigEar, PIG_SNOUT)
  const matEye = getMat(_refPigEye, PIG_EYE)

  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.26
  body.scale.set(1, 0.95, 1.05)
  body.castShadow = true
  body.receiveShadow = true

  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.48, 0.3)
  head.scale.setScalar(1.08)
  head.castShadow = true
  head.receiveShadow = true

  const snout = new THREE.Mesh(boxPigSnout, matSnout)
  snout.position.set(0, 0.44, 0.52)
  snout.castShadow = true
  snout.receiveShadow = true

  const eyeL = new THREE.Mesh(boxPigEye, matEye)
  eyeL.position.set(-0.1, 0.48, 0.47)
  eyeL.castShadow = true
  eyeL.receiveShadow = true
  const eyeR = new THREE.Mesh(boxPigEye, matEye)
  eyeR.position.set(0.1, 0.48, 0.47)
  eyeR.castShadow = true
  eyeR.receiveShadow = true

  const earL = new THREE.Mesh(boxEar, matEar)
  earL.position.set(-0.22, 0.62, 0.26)
  earL.rotation.z = Math.PI / 5
  earL.rotation.x = -0.1
  earL.castShadow = true
  earL.receiveShadow = true
  const earR = new THREE.Mesh(boxEar, matEar)
  earR.position.set(0.22, 0.62, 0.26)
  earR.rotation.z = -Math.PI / 5
  earR.rotation.x = -0.1
  earR.castShadow = true
  earR.receiveShadow = true

  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.2, 0.125, 0.15)
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.2, 0.125, 0.15)
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.2, 0.125, -0.15)
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.2, 0.125, -0.15)
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true

  group.add(body)
  group.add(head)
  group.add(snout)
  group.add(eyeL)
  group.add(eyeR)
  group.add(earL)
  group.add(earR)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(1.5, 1.29, 1.5)
  return group
}

/** Wolf: grey body, darker legs and head, slightly larger. */
function createWolfMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refWolfBody, 0x6b6b6b)
  const matHead = getMat(_refWolfHead, 0x4a4a4a)
  const matLeg = getMat(_refWolfLeg, 0x3a3a3a)

  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.28
  body.scale.setScalar(1.1)
  body.castShadow = true
  body.receiveShadow = true

  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.5, 0.32)
  head.scale.setScalar(1.05)
  head.castShadow = true
  head.receiveShadow = true

  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.22, 0.14, 0.18)
  leg1.scale.y = 1.2
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.22, 0.14, 0.18)
  leg2.scale.y = 1.2
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.22, 0.14, -0.18)
  leg3.scale.y = 1.2
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.22, 0.14, -0.18)
  leg4.scale.y = 1.2
  leg4.castShadow = true
  leg4.receiveShadow = true

  group.add(body)
  group.add(head)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  return group
}

/** Chance (0–1) that a villager has a hat when variant is drawn from [0,1). */
const VILLAGER_HAT_CHANCE = 0.4

/**
 * Villager: blocky humanoid with head (skin), face (eyes, nose, mouth), robe body, legs, and optional hat.
 * @param variant - Optional value in [0,1); when < VILLAGER_HAT_CHANCE the villager has a hat. Omit for default (no hat).
 */
function createVillagerMesh(variant?: number): THREE.Group {
  const group = new THREE.Group()
  const skin = 0xebc9a8
  const robe = 0x6b4423
  const matHead = getMat(_refVillagerHead, skin)
  const matBody = getMat(_refVillagerBody, robe)
  const matLeg = getMat(_refVillagerLeg, 0x5a3820)
  const matEye = getMat(_refVillagerEye, 0x1a1a1a)
  const matNose = getMat(_refVillagerNose, 0xd4a574)
  const matMouth = getMat(_refVillagerMouth, 0x2a2020)
  const matHat = getMat(_refVillagerHat, 0x3d2817)

  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 1.225, 0)
  head.castShadow = true
  head.receiveShadow = true

  const eyeL = new THREE.Mesh(boxVillagerEye, matEye)
  eyeL.position.set(-0.08, 1.25, 0.19)
  eyeL.castShadow = true
  eyeL.receiveShadow = true
  const eyeR = new THREE.Mesh(boxVillagerEye, matEye)
  eyeR.position.set(0.08, 1.25, 0.19)
  eyeR.castShadow = true
  eyeR.receiveShadow = true

  const nose = new THREE.Mesh(boxVillagerNose, matNose)
  nose.position.set(0, 1.22, 0.2)
  nose.castShadow = true
  nose.receiveShadow = true

  const mouth = new THREE.Mesh(boxVillagerMouth, matMouth)
  mouth.position.set(0, 1.18, 0.19)
  mouth.castShadow = true
  mouth.receiveShadow = true

  const hasHat =
    variant !== undefined && variant < VILLAGER_HAT_CHANCE

  const torso = new THREE.Mesh(boxVillagerTorso, matBody)
  torso.position.y = 0.825
  torso.castShadow = true
  torso.receiveShadow = true

  const legL = new THREE.Mesh(boxVillagerLeg, matLeg)
  legL.position.set(-0.12, 0.25, 0)
  legL.castShadow = true
  legL.receiveShadow = true
  const legR = new THREE.Mesh(boxVillagerLeg, matLeg)
  legR.position.set(0.12, 0.25, 0)
  legR.castShadow = true
  legR.receiveShadow = true

  group.add(head)
  group.add(eyeL)
  group.add(eyeR)
  group.add(nose)
  group.add(mouth)
  if (hasHat) {
    const brim = new THREE.Mesh(boxVillagerHatBrim, matHat)
    brim.position.set(0, 1.42, 0)
    brim.castShadow = true
    brim.receiveShadow = true
    const top = new THREE.Mesh(boxVillagerHatTop, matHat)
    top.position.set(0, 1.51, 0)
    top.castShadow = true
    top.receiveShadow = true
    group.add(brim)
    group.add(top)
  }
  group.add(torso)
  group.add(legL)
  group.add(legR)
  group.scale.set(1, 1.2, 1)
  return group
}

/** Registry of mesh factories per animal kind. Add a new entry when adding a new AnimalKind. */
export const ANIMAL_MESH_FACTORY: Record<AnimalKind, () => THREE.Group> = {
  sheep: createSheepMesh,
  pig: createPigMesh,
  wolf: createWolfMesh,
  villager: createVillagerMesh,
}

/**
 * Create a blocky animal mesh for the given kind. Uses BoxGeometry only.
 * Caller adds to scene and updates position/rotation each frame.
 * @param variant - Optional [0,1) value for per-instance variation (e.g. villager hat chance). Used only for villager.
 */
export function createAnimalMesh(kind: AnimalKind, variant?: number): THREE.Group {
  if (kind === 'villager') return createVillagerMesh(variant)
  return ANIMAL_MESH_FACTORY[kind]()
}
