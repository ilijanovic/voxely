import * as THREE from '@/three'
import { PLAYER_HEIGHT, PLAYER_MESH_VISUAL_HEIGHT } from '../../game-collision'

/**
 * Creates only the player mesh group (head, body, legs, arms). Does not add to scene or set spawn.
 * Used for remote players in multiplayer; caller sets position/rotation and adds to scene.
 */
export function createPlayerMeshOnly(): THREE.Group {
  const player = new THREE.Group()

  const matSkin = new THREE.MeshStandardMaterial({ color: 0xffdbac })
  const matShirt = new THREE.MeshStandardMaterial({ color: 0x3366cc })
  const matPants = new THREE.MeshStandardMaterial({ color: 0x2244aa })

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), matSkin)
  head.position.y = 0.9
  head.castShadow = true
  head.receiveShadow = true

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), matShirt)
  body.position.y = 0.5
  body.castShadow = true
  body.receiveShadow = true

  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), matPants)
  leg1.position.set(-0.08, 0.2, 0)
  leg1.castShadow = true
  leg1.receiveShadow = true

  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), matPants)
  leg2.position.set(0.08, 0.2, 0)
  leg2.castShadow = true
  leg2.receiveShadow = true

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin)
  arm1.position.set(-0.22, 0.5, 0)
  arm1.castShadow = true
  arm1.receiveShadow = true

  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin)
  arm2.position.set(0.22, 0.5, 0)
  arm2.castShadow = true
  arm2.receiveShadow = true

  const matFace = new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
  const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02)
  const mouthGeom = new THREE.BoxGeometry(0.1, 0.04, 0.02)
  const leftEye = new THREE.Mesh(eyeGeom, matFace)
  leftEye.position.set(-0.1, 0.02, 0.18)
  const rightEye = new THREE.Mesh(eyeGeom, matFace)
  rightEye.position.set(0.1, 0.02, 0.18)
  const mouth = new THREE.Mesh(mouthGeom, matFace)
  mouth.position.set(0, -0.1, 0.18)
  head.add(leftEye)
  head.add(rightEye)
  head.add(mouth)

  player.add(head)
  player.add(body)
  player.add(leg1)
  player.add(leg2)
  player.add(arm1)
  player.add(arm2)

  player.scale.set(1, PLAYER_HEIGHT / PLAYER_MESH_VISUAL_HEIGHT, 1)
  return player
}

/**
 * Invisible body for POV shadows (casts shadow but does not write color/depth).
 */
export function createPOVShadowBody(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    depthWrite: false,
  })

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat)
  head.position.y = 0.9
  head.castShadow = true
  head.receiveShadow = false

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), mat)
  body.position.y = 0.5
  body.castShadow = true
  body.receiveShadow = false

  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), mat)
  leg1.position.set(-0.08, 0.2, 0)
  leg1.castShadow = true
  leg1.receiveShadow = false

  const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), mat)
  leg2.position.set(0.08, 0.2, 0)
  leg2.castShadow = true
  leg2.receiveShadow = false

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat)
  arm1.position.set(-0.22, 0.5, 0)
  arm1.castShadow = true
  arm1.receiveShadow = false

  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), mat)
  arm2.position.set(0.22, 0.5, 0)
  arm2.castShadow = true
  arm2.receiveShadow = false

  group.add(head)
  group.add(body)
  group.add(leg1)
  group.add(leg2)
  group.add(arm1)
  group.add(arm2)
  return group
}
