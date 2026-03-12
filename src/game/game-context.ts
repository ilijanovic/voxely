import type * as THREE from '@/three'
import type { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import type { BlockType } from '../types'
import type { Drop } from './world-interactions/drops'
import type { PlacedTorch } from './world-interactions/torches'
import type { TerrainDebugState } from './debug/terrain-debug'
import type { RaycastMeshCache } from './chunks/raycast-cache'

/**
 * Shared mutable state that the tightly-coupled per-frame update functions
 * (updateMovementAndCollision, updateCameraAndViewMode, updateBlockBreakAndPlace)
 * read and write.
 *
 * Created once in game.ts after init; passed by reference so extracted modules
 * can mutate the same object without circular imports or module-level lets.
 *
 * This type is intentionally wide so future extractions can gradually consume it
 * without needing 15+ individual function parameters.
 */
export interface GameContext {
  // Core Three.js objects
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGPURenderer
  controls: PointerLockControls

  // Player hierarchy
  player: THREE.Group
  head: THREE.Mesh
  body: THREE.Mesh
  leg1: THREE.Mesh
  leg2: THREE.Mesh
  arm1: THREE.Mesh
  arm2: THREE.Mesh
  povHands: THREE.Group
  povShadowBody: THREE.Group

  // Atmosphere objects
  sunLight: THREE.DirectionalLight
  sunMesh: THREE.Mesh
  moonMesh: THREE.Mesh
  sky: THREE.Mesh
  clouds: THREE.Group
  cloudMaterial: THREE.MeshBasicMaterial
  stars: THREE.Points
  ambientLight: THREE.AmbientLight
  hemiLight: THREE.HemisphereLight

  // World interaction state
  torchContainer: THREE.Group
  placedTorches: PlacedTorch[]
  drops: Drop[]
  raycastMeshCache: RaycastMeshCache
  terrainDebug: TerrainDebugState

  // Movement / physics
  moveState: { forward: boolean; back: boolean; left: boolean; right: boolean }
  velocityX: number
  velocityY: number
  velocityZ: number
  playerGrounded: boolean
  jumpRequested: boolean
  isSprinting: boolean
  sprintKeyHeld: boolean
  sneakKeyHeld: boolean
  doubleTapSprint: boolean
  viewMode: 'first' | 'third'

  // Block break / place input
  isMouseDown: boolean
  rightMouseJustPressed: boolean
  fKeyJustPressed: boolean
  breakTarget: {
    chunkKeyNum: number
    blockType: BlockType
    x: number
    y: number
    z: number
  } | null
  breakProgress: number

  // Camera state
  lastLookYaw: number
  lastLookPitch: number

  // Rendering flags
  frustumDirty: boolean
  lastUploadedFov: number

  // Multiplayer
  multiplayerEnabled: boolean
}
