import * as THREE from 'three'
import type { AnimalKind } from './types'

const BLOCK = 1

/** Pig body/head color (Minecraft-style pink). */
const PIG_PINK = 0xf8b4b4
/** Pig snout/legs/ears (slightly darker). */
const PIG_SNOUT = 0xe8a090
/** Pig eyes (dark). */
const PIG_EYE = 0x1a1a1a

/** Sheep wool (off-white). */
const SHEEP_WOOL = 0xf5f5f5
/** Sheep face (dark gray-brown, Minecraft-like). */
const SHEEP_FACE = 0x3a3230
/** Sheep muzzle (light cream). */
const SHEEP_MUZZLE = 0xdccab6
/** Sheep hooves (dark brown). */
const SHEEP_HOOF = 0x5f4d41
/** Sheep eyes (dark). */
const SHEEP_EYE = 0x1a1a1a

/** Shared geometries per part (reused across all animals). */
const boxBody = new THREE.BoxGeometry(0.6 * BLOCK, 0.5 * BLOCK, 0.4 * BLOCK)
const boxHead = new THREE.BoxGeometry(0.35 * BLOCK, 0.35 * BLOCK, 0.35 * BLOCK)
const boxLeg = new THREE.BoxGeometry(0.15 * BLOCK, 0.25 * BLOCK, 0.15 * BLOCK)
const boxEar = new THREE.BoxGeometry(0.12 * BLOCK, 0.08 * BLOCK, 0.06 * BLOCK)
/** Pig snout: slightly larger and longer for a more recognizable silhouette. */
const boxPigSnout = new THREE.BoxGeometry(0.22 * BLOCK, 0.18 * BLOCK, 0.4 * BLOCK)
/** Pig eyes: small dark patches on the front of the head. */
const boxPigEye = new THREE.BoxGeometry(0.06 * BLOCK, 0.05 * BLOCK, 0.02 * BLOCK)
/** Wolf snout: slimmer and shorter than pig snout for a canine muzzle. */
const boxWolfSnout = new THREE.BoxGeometry(0.14 * BLOCK, 0.12 * BLOCK, 0.28 * BLOCK)
/** Sheep body core and wool shell (Minecraft-like layered silhouette). */
const boxSheepBodyCore = new THREE.BoxGeometry(0.74 * BLOCK, 0.5 * BLOCK, 0.46 * BLOCK)
const boxSheepBodyWool = new THREE.BoxGeometry(0.84 * BLOCK, 0.62 * BLOCK, 0.56 * BLOCK)
/** Sheep head core and wool shell. */
const boxSheepHeadCore = new THREE.BoxGeometry(0.34 * BLOCK, 0.28 * BLOCK, 0.4 * BLOCK)
const boxSheepHeadWool = new THREE.BoxGeometry(0.42 * BLOCK, 0.34 * BLOCK, 0.48 * BLOCK)
/** Sheep muzzle and details. */
const boxSheepMuzzle = new THREE.BoxGeometry(0.24 * BLOCK, 0.18 * BLOCK, 0.16 * BLOCK)
const boxSheepEye = new THREE.BoxGeometry(0.04 * BLOCK, 0.04 * BLOCK, 0.02 * BLOCK)
const boxSheepEar = new THREE.BoxGeometry(0.08 * BLOCK, 0.1 * BLOCK, 0.04 * BLOCK)
/** Sheep leg core and wool cuff. */
const boxSheepLegCore = new THREE.BoxGeometry(0.16 * BLOCK, 0.5 * BLOCK, 0.16 * BLOCK)
const boxSheepLegWool = new THREE.BoxGeometry(0.2 * BLOCK, 0.18 * BLOCK, 0.2 * BLOCK)

// ─── Shared materials (lazy-init, reused across all instances) ───────────────
const _refSheepBody = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepHead = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepMuzzle = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refSheepEye = { current: null as THREE.MeshStandardMaterial | null }
const _refPigBody = { current: null as THREE.MeshStandardMaterial | null }
const _refPigHead = { current: null as THREE.MeshStandardMaterial | null }
const _refPigSnout = { current: null as THREE.MeshStandardMaterial | null }
const _refPigLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refPigEar = { current: null as THREE.MeshStandardMaterial | null }
const _refPigEye = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfBody = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfHead = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfSnout = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfEar = { current: null as THREE.MeshStandardMaterial | null }
const _refWolfEye = { current: null as THREE.MeshStandardMaterial | null }
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

interface SheepMeshUserData {
  sheepHeadPivot?: THREE.Group
  sheepHeadBaseY?: number
  sheepHeadBaseZ?: number
}

interface SheepLegMaterials {
  hoof: THREE.MeshStandardMaterial
  wool: THREE.MeshStandardMaterial
}

/**
 * Creates one sheep leg pivot (hoof + wool cuff) and marks it with legIndex for walk animation.
 */
function createSheepLeg(
  x: number,
  z: number,
  legIndex: number,
  materials: SheepLegMaterials,
): THREE.Group {
  const legPivot = new THREE.Group()
  legPivot.position.set(x, 0.25, z)
  legPivot.userData.legIndex = legIndex

  const hoof = new THREE.Mesh(boxSheepLegCore, materials.hoof)
  hoof.castShadow = true
  hoof.receiveShadow = true

  const cuff = new THREE.Mesh(boxSheepLegWool, materials.wool)
  cuff.position.y = 0.14
  cuff.castShadow = true
  cuff.receiveShadow = true

  legPivot.add(hoof)
  legPivot.add(cuff)
  return legPivot
}

/** Sheep: layered wool shell, dark face, and pivoted head for Minecraft-like grazing motion. */
function createSheepMesh(): THREE.Group {
  const group = new THREE.Group()
  const matWool = getMat(_refSheepBody, SHEEP_WOOL)
  const matFace = getMat(_refSheepHead, SHEEP_FACE)
  const matMuzzle = getMat(_refSheepMuzzle, SHEEP_MUZZLE)
  const matHoof = getMat(_refSheepLeg, SHEEP_HOOF)
  const matEye = getMat(_refSheepEye, SHEEP_EYE)

  const bodyCore = new THREE.Mesh(boxSheepBodyCore, matFace)
  bodyCore.position.y = 0.78
  bodyCore.castShadow = true
  bodyCore.receiveShadow = true

  const bodyWool = new THREE.Mesh(boxSheepBodyWool, matWool)
  bodyWool.position.y = 0.8
  bodyWool.castShadow = true
  bodyWool.receiveShadow = true

  const headPivot = new THREE.Group()
  headPivot.position.set(0, 0.78, 0.48)

  const headCore = new THREE.Mesh(boxSheepHeadCore, matFace)
  headCore.position.z = 0.04
  headCore.castShadow = true
  headCore.receiveShadow = true

  const headWool = new THREE.Mesh(boxSheepHeadWool, matWool)
  headWool.position.z = 0.02
  headWool.castShadow = true
  headWool.receiveShadow = true

  const muzzle = new THREE.Mesh(boxSheepMuzzle, matMuzzle)
  muzzle.position.set(0, -0.04, 0.24)
  muzzle.castShadow = true
  muzzle.receiveShadow = true

  const eyeL = new THREE.Mesh(boxSheepEye, matEye)
  eyeL.position.set(-0.11, 0.05, 0.15)
  eyeL.castShadow = true
  eyeL.receiveShadow = true

  const eyeR = new THREE.Mesh(boxSheepEye, matEye)
  eyeR.position.set(0.11, 0.05, 0.15)
  eyeR.castShadow = true
  eyeR.receiveShadow = true

  const earL = new THREE.Mesh(boxSheepEar, matFace)
  earL.position.set(-0.18, 0.1, 0.08)
  earL.rotation.z = 0.2
  earL.castShadow = true
  earL.receiveShadow = true

  const earR = new THREE.Mesh(boxSheepEar, matFace)
  earR.position.set(0.18, 0.1, 0.08)
  earR.rotation.z = -0.2
  earR.castShadow = true
  earR.receiveShadow = true

  headPivot.add(headWool)
  headPivot.add(headCore)
  headPivot.add(muzzle)
  headPivot.add(eyeL)
  headPivot.add(eyeR)
  headPivot.add(earL)
  headPivot.add(earR)

  const legMaterials = { hoof: matHoof, wool: matWool }
  const leg1 = createSheepLeg(-0.23, 0.2, 0, legMaterials)
  const leg2 = createSheepLeg(0.23, 0.2, 1, legMaterials)
  const leg3 = createSheepLeg(-0.23, -0.2, 2, legMaterials)
  const leg4 = createSheepLeg(0.23, -0.2, 3, legMaterials)

  group.add(bodyWool)
  group.add(bodyCore)
  group.add(headPivot)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)

  const userData = group.userData as SheepMeshUserData
  userData.sheepHeadPivot = headPivot
  userData.sheepHeadBaseY = headPivot.position.y
  userData.sheepHeadBaseZ = headPivot.position.z

  group.scale.set(1.07, 1.18, 1.07)
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

/** Wolf: grey body, darker legs and head, snout, pointed ears, and eyes. */
function createWolfMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refWolfBody, 0x6b6b6b)
  const matHead = getMat(_refWolfHead, 0x4a4a4a)
  const matLeg = getMat(_refWolfLeg, 0x3a3a3a)
  const matSnout = getMat(_refWolfSnout, 0x5a5a5a)
  const matEar = getMat(_refWolfEar, 0x4a4a4a)
  const matEye = getMat(_refWolfEye, PIG_EYE)

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

  const snout = new THREE.Mesh(boxWolfSnout, matSnout)
  snout.position.set(0, 0.48, 0.52)
  snout.castShadow = true
  snout.receiveShadow = true

  const eyeL = new THREE.Mesh(boxPigEye, matEye)
  eyeL.position.set(-0.1, 0.52, 0.47)
  eyeL.castShadow = true
  eyeL.receiveShadow = true
  const eyeR = new THREE.Mesh(boxPigEye, matEye)
  eyeR.position.set(0.1, 0.52, 0.47)
  eyeR.castShadow = true
  eyeR.receiveShadow = true

  const earL = new THREE.Mesh(boxEar, matEar)
  earL.position.set(-0.2, 0.68, 0.28)
  earL.rotation.x = -Math.PI / 3
  earL.rotation.z = 0.15
  earL.castShadow = true
  earL.receiveShadow = true
  const earR = new THREE.Mesh(boxEar, matEar)
  earR.position.set(0.2, 0.68, 0.28)
  earR.rotation.x = -Math.PI / 3
  earR.rotation.z = -0.15
  earR.castShadow = true
  earR.receiveShadow = true

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
  group.add(snout)
  group.add(eyeL)
  group.add(eyeR)
  group.add(earL)
  group.add(earR)
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

  const hasHat = variant !== undefined && variant < VILLAGER_HAT_CHANCE

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

const _refZombieBody = { current: null as THREE.MeshStandardMaterial | null }
const _refZombieHead = { current: null as THREE.MeshStandardMaterial | null }
const _refZombieLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refCowBody = { current: null as THREE.MeshStandardMaterial | null }
const _refCowHead = { current: null as THREE.MeshStandardMaterial | null }
const _refCowLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refChickenBody = { current: null as THREE.MeshStandardMaterial | null }
const _refChickenHead = { current: null as THREE.MeshStandardMaterial | null }
const _refChickenLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refHorseBody = { current: null as THREE.MeshStandardMaterial | null }
const _refHorseHead = { current: null as THREE.MeshStandardMaterial | null }
const _refHorseLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refDonkeyBody = { current: null as THREE.MeshStandardMaterial | null }
const _refDonkeyHead = { current: null as THREE.MeshStandardMaterial | null }
const _refDonkeyLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refDonkeyEar = { current: null as THREE.MeshStandardMaterial | null }
const _refRabbitBody = { current: null as THREE.MeshStandardMaterial | null }
const _refRabbitHead = { current: null as THREE.MeshStandardMaterial | null }
const _refRabbitLeg = { current: null as THREE.MeshStandardMaterial | null }
const _refRabbitEar = { current: null as THREE.MeshStandardMaterial | null }

/** Zombie: simple humanoid (green skin, upright). Used for hostile mob spawn at night. */
const ZOMBIE_GREEN = 0x3d5c34
const ZOMBIE_DARK = 0x2d4428

function createZombieMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refZombieBody, ZOMBIE_GREEN)
  const matHead = getMat(_refZombieHead, ZOMBIE_DARK)
  const matLeg = getMat(_refZombieLeg, ZOMBIE_DARK)
  const boxZombieBody = new THREE.BoxGeometry(0.45 * BLOCK, 0.7 * BLOCK, 0.25 * BLOCK)
  const boxZombieHead = new THREE.BoxGeometry(0.4 * BLOCK, 0.4 * BLOCK, 0.4 * BLOCK)
  const boxZombieLeg = new THREE.BoxGeometry(0.2 * BLOCK, 0.5 * BLOCK, 0.15 * BLOCK)
  const head = new THREE.Mesh(boxZombieHead, matHead)
  head.position.set(0, 1.15, 0)
  head.castShadow = true
  head.receiveShadow = true
  const torso = new THREE.Mesh(boxZombieBody, matBody)
  torso.position.set(0, 0.6, 0)
  torso.castShadow = true
  torso.receiveShadow = true
  const legL = new THREE.Mesh(boxZombieLeg, matLeg)
  legL.position.set(-0.12, 0.25, 0)
  legL.castShadow = true
  legL.receiveShadow = true
  const legR = new THREE.Mesh(boxZombieLeg, matLeg)
  legR.position.set(0.12, 0.25, 0)
  legR.castShadow = true
  legR.receiveShadow = true
  group.add(head)
  group.add(torso)
  group.add(legL)
  group.add(legR)
  return group
}

<<<<<<< HEAD
const _refSkeletonBody = { current: null as THREE.MeshStandardMaterial | null }
const _refSkeletonHead = { current: null as THREE.MeshStandardMaterial | null }
const _refSkeletonLeg = { current: null as THREE.MeshStandardMaterial | null }
const SKELETON_BONE = 0xc2b896
const SKELETON_DARK = 0xa09070

/** Skeleton: bone-colored humanoid (hostile). */
function createSkeletonMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refSkeletonBody, SKELETON_BONE)
  const matHead = getMat(_refSkeletonHead, SKELETON_DARK)
  const matLeg = getMat(_refSkeletonLeg, SKELETON_DARK)
  const boxBody = new THREE.BoxGeometry(0.4 * BLOCK, 0.7 * BLOCK, 0.25 * BLOCK)
  const boxHead = new THREE.BoxGeometry(0.4 * BLOCK, 0.4 * BLOCK, 0.4 * BLOCK)
  const boxLeg = new THREE.BoxGeometry(0.18 * BLOCK, 0.55 * BLOCK, 0.14 * BLOCK)
  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 1.15, 0)
  head.castShadow = true
  head.receiveShadow = true
  const torso = new THREE.Mesh(boxBody, matBody)
  torso.position.set(0, 0.6, 0)
  torso.castShadow = true
  torso.receiveShadow = true
  const legL = new THREE.Mesh(boxLeg, matLeg)
  legL.position.set(-0.1, 0.22, 0)
  legL.castShadow = true
  legL.receiveShadow = true
  const legR = new THREE.Mesh(boxLeg, matLeg)
  legR.position.set(0.1, 0.22, 0)
  legR.castShadow = true
  legR.receiveShadow = true
  group.add(head)
  group.add(torso)
  group.add(legL)
  group.add(legR)
  return group
}

const _refCreeperBody = { current: null as THREE.MeshStandardMaterial | null }
const _refCreeperHead = { current: null as THREE.MeshStandardMaterial | null }
const _refCreeperLeg = { current: null as THREE.MeshStandardMaterial | null }
const CREEPER_GREEN = 0x3d7c3d
const CREEPER_DARK = 0x2d5c2d

/** Creeper: blocky green body, small head, four legs (hostile). */
function createCreeperMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refCreeperBody, CREEPER_GREEN)
  const matHead = getMat(_refCreeperHead, CREEPER_DARK)
  const matLeg = getMat(_refCreeperLeg, CREEPER_DARK)
  const boxBody = new THREE.BoxGeometry(0.5 * BLOCK, 0.7 * BLOCK, 0.3 * BLOCK)
  const boxHead = new THREE.BoxGeometry(0.35 * BLOCK, 0.35 * BLOCK, 0.35 * BLOCK)
  const boxLeg = new THREE.BoxGeometry(0.15 * BLOCK, 0.4 * BLOCK, 0.15 * BLOCK)
  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 1.0, 0)
  head.castShadow = true
  head.receiveShadow = true
  const torso = new THREE.Mesh(boxBody, matBody)
  torso.position.set(0, 0.55, 0)
  torso.castShadow = true
  torso.receiveShadow = true
  const legFL = new THREE.Mesh(boxLeg, matLeg)
  legFL.position.set(-0.15, 0.2, 0.12)
  legFL.castShadow = true
  legFL.receiveShadow = true
  const legFR = new THREE.Mesh(boxLeg, matLeg)
  legFR.position.set(0.15, 0.2, 0.12)
  legFR.castShadow = true
  legFR.receiveShadow = true
  const legBL = new THREE.Mesh(boxLeg, matLeg)
  legBL.position.set(-0.15, 0.2, -0.12)
  legBL.castShadow = true
  legBL.receiveShadow = true
  const legBR = new THREE.Mesh(boxLeg, matLeg)
  legBR.position.set(0.15, 0.2, -0.12)
  legBR.castShadow = true
  legBR.receiveShadow = true
  group.add(head)
  group.add(torso)
  group.add(legFL)
  group.add(legFR)
  group.add(legBL)
  group.add(legBR)
=======
/** Cow: blocky cattle (white/dark patches), four legs. Minecraft-style spawn in plains/forest/savanna/jungle/meadow. */
function createCowMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refCowBody, 0xe8e4d8)
  const matHead = getMat(_refCowHead, 0x4a4a4a)
  const matLeg = getMat(_refCowLeg, 0x3a3a3a)
  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.32
  body.scale.set(1.15, 1.05, 1.2)
  body.castShadow = true
  body.receiveShadow = true
  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.5, 0.35)
  head.scale.setScalar(1.05)
  head.castShadow = true
  head.receiveShadow = true
  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.22, 0.14, 0.18)
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.22, 0.14, 0.18)
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.22, 0.14, -0.18)
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.22, 0.14, -0.18)
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true
  group.add(body)
  group.add(head)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(1.2, 1.15, 1.2)
  return group
}

/** Chicken: small body, head, beak. Four small legs for walk cycle. */
function createChickenMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refChickenBody, 0xf5f5f5)
  const matHead = getMat(_refChickenHead, 0xffcc66)
  const matLeg = getMat(_refChickenLeg, 0xcc6633)
  const boxSmall = new THREE.BoxGeometry(0.25 * BLOCK, 0.2 * BLOCK, 0.25 * BLOCK)
  const body = new THREE.Mesh(boxSmall, matBody)
  body.position.y = 0.18
  body.scale.set(1.2, 1, 1.2)
  body.castShadow = true
  body.receiveShadow = true
  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.38, 0.18)
  head.scale.set(0.5, 0.5, 0.5)
  head.castShadow = true
  head.receiveShadow = true
  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.08, 0.06, 0.06)
  leg1.scale.set(0.6, 0.8, 0.6)
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.08, 0.06, 0.06)
  leg2.scale.set(0.6, 0.8, 0.6)
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.08, 0.06, -0.06)
  leg3.scale.set(0.6, 0.8, 0.6)
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.08, 0.06, -0.06)
  leg4.scale.set(0.6, 0.8, 0.6)
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true
  group.add(body)
  group.add(head)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(0.85, 0.9, 0.85)
  return group
}

/** Horse: taller body, elongated head, four legs. Minecraft-style spawn in plains/savanna. */
function createHorseMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refHorseBody, 0x8b6914)
  const matHead = getMat(_refHorseHead, 0x6b4a0a)
  const matLeg = getMat(_refHorseLeg, 0x2a2a2a)
  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.5
  body.scale.set(1.1, 1.2, 1.3)
  body.castShadow = true
  body.receiveShadow = true
  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.72, 0.38)
  head.scale.set(0.9, 1.1, 1.2)
  head.castShadow = true
  head.receiveShadow = true
  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.2, 0.2, 0.2)
  leg1.scale.y = 1.4
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true
  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.2, 0.2, 0.2)
  leg2.scale.y = 1.4
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true
  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.2, 0.2, -0.2)
  leg3.scale.y = 1.4
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true
  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.2, 0.2, -0.2)
  leg4.scale.y = 1.4
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true
  group.add(body)
  group.add(head)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(1.15, 1.25, 1.15)
  return group
}

/** Donkey: horse-like but smaller, with longer ears and gray coat. */
function createDonkeyMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refDonkeyBody, 0x8b8680)
  const matHead = getMat(_refDonkeyHead, 0x6f6b66)
  const matLeg = getMat(_refDonkeyLeg, 0x2f2f2f)
  const matEar = getMat(_refDonkeyEar, 0x8b8680)

  const body = new THREE.Mesh(boxBody, matBody)
  body.position.y = 0.48
  body.scale.set(1.05, 1.15, 1.25)
  body.castShadow = true
  body.receiveShadow = true

  const head = new THREE.Mesh(boxHead, matHead)
  head.position.set(0, 0.69, 0.37)
  head.scale.set(0.88, 1.05, 1.15)
  head.castShadow = true
  head.receiveShadow = true

  const earL = new THREE.Mesh(boxEar, matEar)
  earL.position.set(-0.12, 0.88, 0.34)
  earL.scale.set(0.7, 2.6, 0.9)
  earL.castShadow = true
  earL.receiveShadow = true

  const earR = new THREE.Mesh(boxEar, matEar)
  earR.position.set(0.12, 0.88, 0.34)
  earR.scale.set(0.7, 2.6, 0.9)
  earR.castShadow = true
  earR.receiveShadow = true

  const leg1 = new THREE.Mesh(boxLeg, matLeg)
  leg1.position.set(-0.19, 0.19, 0.19)
  leg1.scale.y = 1.35
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true

  const leg2 = new THREE.Mesh(boxLeg, matLeg)
  leg2.position.set(0.19, 0.19, 0.19)
  leg2.scale.y = 1.35
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true

  const leg3 = new THREE.Mesh(boxLeg, matLeg)
  leg3.position.set(-0.19, 0.19, -0.19)
  leg3.scale.y = 1.35
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true

  const leg4 = new THREE.Mesh(boxLeg, matLeg)
  leg4.position.set(0.19, 0.19, -0.19)
  leg4.scale.y = 1.35
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true

  group.add(body)
  group.add(head)
  group.add(earL)
  group.add(earR)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(1.1, 1.2, 1.1)
  return group
}

/** Rabbit: compact body with short legs and tall ears. */
function createRabbitMesh(): THREE.Group {
  const group = new THREE.Group()
  const matBody = getMat(_refRabbitBody, 0xd9d4cb)
  const matHead = getMat(_refRabbitHead, 0xb8b2a8)
  const matLeg = getMat(_refRabbitLeg, 0x9e998f)
  const matEar = getMat(_refRabbitEar, 0xd9d4cb)

  const boxRabbitBody = new THREE.BoxGeometry(0.28 * BLOCK, 0.2 * BLOCK, 0.34 * BLOCK)
  const boxRabbitHead = new THREE.BoxGeometry(0.18 * BLOCK, 0.18 * BLOCK, 0.2 * BLOCK)
  const boxRabbitEar = new THREE.BoxGeometry(0.05 * BLOCK, 0.18 * BLOCK, 0.04 * BLOCK)
  const boxRabbitLeg = new THREE.BoxGeometry(0.08 * BLOCK, 0.1 * BLOCK, 0.08 * BLOCK)

  const body = new THREE.Mesh(boxRabbitBody, matBody)
  body.position.y = 0.12
  body.castShadow = true
  body.receiveShadow = true

  const head = new THREE.Mesh(boxRabbitHead, matHead)
  head.position.set(0, 0.2, 0.14)
  head.castShadow = true
  head.receiveShadow = true

  const earL = new THREE.Mesh(boxRabbitEar, matEar)
  earL.position.set(-0.05, 0.31, 0.14)
  earL.castShadow = true
  earL.receiveShadow = true

  const earR = new THREE.Mesh(boxRabbitEar, matEar)
  earR.position.set(0.05, 0.31, 0.14)
  earR.castShadow = true
  earR.receiveShadow = true

  const leg1 = new THREE.Mesh(boxRabbitLeg, matLeg)
  leg1.position.set(-0.09, 0.06, 0.1)
  ;(leg1 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 0
  leg1.castShadow = true
  leg1.receiveShadow = true

  const leg2 = new THREE.Mesh(boxRabbitLeg, matLeg)
  leg2.position.set(0.09, 0.06, 0.1)
  ;(leg2 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 1
  leg2.castShadow = true
  leg2.receiveShadow = true

  const leg3 = new THREE.Mesh(boxRabbitLeg, matLeg)
  leg3.position.set(-0.09, 0.06, -0.1)
  ;(leg3 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 2
  leg3.castShadow = true
  leg3.receiveShadow = true

  const leg4 = new THREE.Mesh(boxRabbitLeg, matLeg)
  leg4.position.set(0.09, 0.06, -0.1)
  ;(leg4 as THREE.Mesh & { userData: { legIndex?: number } }).userData.legIndex = 3
  leg4.castShadow = true
  leg4.receiveShadow = true

  group.add(body)
  group.add(head)
  group.add(earL)
  group.add(earR)
  group.add(leg1)
  group.add(leg2)
  group.add(leg3)
  group.add(leg4)
  group.scale.set(0.9, 0.9, 0.9)
>>>>>>> dev
  return group
}

/** Registry of mesh factories per animal kind. Add a new entry when adding a new AnimalKind. */
export const ANIMAL_MESH_FACTORY: Record<AnimalKind, () => THREE.Group> = {
  sheep: createSheepMesh,
  pig: createPigMesh,
  cow: createCowMesh,
  chicken: createChickenMesh,
  horse: createHorseMesh,
  donkey: createDonkeyMesh,
  rabbit: createRabbitMesh,
  wolf: createWolfMesh,
  villager: createVillagerMesh,
  zombie: createZombieMesh,
  skeleton: createSkeletonMesh,
  creeper: createCreeperMesh,
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
