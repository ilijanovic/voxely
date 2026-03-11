import * as THREE from 'three'
import type { AnimalKind } from './types'

const BLOCK = 1

/** Pig body/head color (Minecraft-style pink). */
const PIG_PINK = 0xf8b4b4
/** Pig snout/legs/ears (slightly darker). */
const PIG_SNOUT = 0xe8a090

/** Shared geometries per part (reused across all animals). */
const boxBody = new THREE.BoxGeometry(0.6 * BLOCK, 0.5 * BLOCK, 0.4 * BLOCK)
const boxHead = new THREE.BoxGeometry(0.35 * BLOCK, 0.35 * BLOCK, 0.35 * BLOCK)
const boxLeg = new THREE.BoxGeometry(0.15 * BLOCK, 0.25 * BLOCK, 0.15 * BLOCK)
const boxEar = new THREE.BoxGeometry(0.12 * BLOCK, 0.08 * BLOCK, 0.06 * BLOCK)
/** Pig snout: slightly larger and longer for a more recognizable silhouette. */
const boxPigSnout = new THREE.BoxGeometry(0.22 * BLOCK, 0.18 * BLOCK, 0.4 * BLOCK)

// ─── Shared materials (lazy-init, reused across all instances) ───────────────
const _refSheepBody = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepHead = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refPigBody = { current: null as THREE.MeshStandardMaterial | null }
const _refPigHead = { current: null as THREE.MeshStandardMaterial | null }
const _refPigSnout = { current: null as THREE.MeshStandardMaterial | null }
const _refPigLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refPigEar = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfBody = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfHead = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfLeg = { current: null as THREE.MeshStandardMaterial | null }

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

/** Registry of mesh factories per animal kind. Add a new entry when adding a new AnimalKind. */
export const ANIMAL_MESH_FACTORY: Record<AnimalKind, () => THREE.Group> = {
  sheep: createSheepMesh,
  pig: createPigMesh,
  wolf: createWolfMesh,
}

/**
 * Create a blocky animal mesh for the given kind. Uses BoxGeometry only.
 * Caller adds to scene and updates position/rotation each frame.
 */
export function createAnimalMesh(kind: AnimalKind): THREE.Group {
  return ANIMAL_MESH_FACTORY[kind]()
}
