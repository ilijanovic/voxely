/**
 * Voxel AABB collision: resolve player (or any AABB) against solid blocks.
 * Exports resolveVoxelCollisions, player AABB constants, and debug types.
 *
 * Block convention (must match rendering and worker geometry): a block at integer (bx, by, bz)
 * occupies the world AABB [bx..bx+1], [by..by+1], [bz..bz+1] (corner-based, not center-based).
 */
import { STEP_BLOCK_HEIGHT, STEP_HEIGHT } from './constants'
import {
  isSolidBlock as isSolidBlockRuntime,
  isSolidBlockLoadedOnly,
  getBlockHeightAt,
} from './chunk-runtime'
import { isSolidBlock as isBlockTypeSolid } from './block-registry'

/** Player AABB: half extent in XZ, full height in Y. */
export const PLAYER_HALF = 0.3
export const PLAYER_HEIGHT = 1.8
/** Unscaled height of the player mesh (head top y); scale.y makes total height match PLAYER_HEIGHT. */
export const PLAYER_MESH_VISUAL_HEIGHT = 1.075

/** Solid only when chunk is loaded; used for X/Z pass to avoid pushing into unloaded chunks. */
function isSolidBlockLoadedOnlyForCollision(bx: number, by: number, bz: number): boolean {
  return isSolidBlockLoadedOnly(bx, by, bz, isBlockTypeSolid)
}

/** Solid if block type is solid; unloaded chunks count as solid to prevent falling through. */
function isSolidBlock(bx: number, by: number, bz: number): boolean {
  return isSolidBlockRuntime(bx, by, bz, isBlockTypeSolid)
}

const _aabbBlockBuffer: Array<{ bx: number; by: number; bz: number }> = []
for (let i = 0; i < 512; i++) _aabbBlockBuffer.push({ bx: 0, by: 0, bz: 0 })
let _aabbBlockCount = 0

/**
 * Fill _aabbBlockBuffer with solid block coordinates overlapping the given AABB; returns count.
 * Blocks are corner-based: block at (bx, by, bz) has bounds [bx..bx+1], [by..by+1], [bz..bz+1].
 * AABB: center (px, py, pz), halfX/halfZ in XZ, height in Y (bottom py, top py+height).
 * treatUnloadedAsSolid: true = Y-pass (prevent falling through unloaded floor), false = X/Z-pass (no invisible wall).
 */
function fillBlocksInAABB(
  px: number,
  py: number,
  pz: number,
  halfX: number,
  halfZ: number,
  height: number,
  treatUnloadedAsSolid: boolean = true,
): number {
  const solid = treatUnloadedAsSolid ? isSolidBlock : isSolidBlockLoadedOnlyForCollision
  _aabbBlockCount = 0
  const minBx = Math.floor(px - halfX)
  const maxBx = Math.floor(px + halfX)
  const minBy = Math.floor(py)
  const maxBy = Math.floor(py + height)
  const minBz = Math.floor(pz - halfZ)
  const maxBz = Math.floor(pz + halfZ)
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let by = minBy; by <= maxBy; by++) {
      for (let bz = minBz; bz <= maxBz; bz++) {
        if (solid(bx, by, bz)) {
          const slot = _aabbBlockBuffer[_aabbBlockCount]
          slot.bx = bx
          slot.by = by
          slot.bz = bz
          _aabbBlockCount++
        }
      }
    }
  }
  return _aabbBlockCount
}

/** Result of voxel AABB collision resolution. grounded is true only when we hit the top face of a block while moving downward. */
export interface CollisionResult {
  hitX: boolean
  hitZ: boolean
  hitYUp: boolean
  hitYDown: boolean
  grounded: boolean
}

/** Pass this to resolveVoxelCollisions to record every position correction (for debugging jitter). */
export interface CollisionDebug {
  snaps: Array<{
    axis: 'x' | 'z' | 'y'
    reason: string
    from: number
    to: number
  }>
}

/** Set to true to log collision snaps and large position deltas in the game loop (player only). Enable in console: window.__DEBUG_COLLISION = true */
export let DEBUG_COLLISION = false
declare global {
  interface Window {
    __DEBUG_COLLISION?: boolean
  }
}
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__DEBUG_COLLISION', {
    get: () => DEBUG_COLLISION,
    set: (v: boolean) => {
      DEBUG_COLLISION = v
      console.log('[collision] DEBUG_COLLISION =', v)
    },
    configurable: true,
  })
}

/**
 * Resolve voxel AABB collisions: apply velocity per axis (X → Z → Y), push out of solid blocks, zero velocity on hit.
 * Mutates position and velocity in place. Returns collision flags; grounded is true only when landing on a block (Y down).
 * halfX, halfZ, height define the AABB (center at position, full height in Y).
 * If debug is provided, every position correction is recorded in debug.snaps (for debugging movement jitter).
 * When allowStepUp is true, a block within STEP_HEIGHT above feet can be climbed onto (e.g. exit water onto shore); default false so normal walking does not auto-step full blocks.
 */
export function resolveVoxelCollisions(
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  dt: number,
  halfX: number,
  halfZ: number,
  height: number,
  debug?: CollisionDebug,
  allowStepUp: boolean = false,
): CollisionResult {
  const blockMin = (b: number) => b
  const blockMax = (b: number) => b + 1
  const FLOOR_TOLERANCE = 0.05
  /** When moving down faster than this, treat as landing and allow any overlapping floor (avoid breaking landing). */
  const FALLING_VELOCITY_THRESHOLD = -0.1
  const result: CollisionResult = {
    hitX: false,
    hitZ: false,
    hitYUp: false,
    hitYDown: false,
    grounded: false,
  }

  // --- X --- only resolve true side (wall) collisions; floor is handled by Y pass only. Use loaded-only solid so we don't hit an invisible wall at chunk boundaries.
  position.x += velocity.x * dt
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(position.x, position.y, position.z, halfX, halfZ, height, false)
    let resolved = false
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i]
      const blockMinZ = blockMin(bz)
      const blockMaxZ = blockMax(bz)
      const zOvlp =
        Math.min(position.z + halfZ, blockMaxZ) - Math.max(position.z - halfZ, blockMinZ)
      if (zOvlp <= 1e-4) continue
      const blockMinX = blockMin(bx)
      const blockMaxX = blockMax(bx)
      const blockH = getBlockHeightAt(bx, by, bz)
      const blockMaxY = by + (blockH > 0 ? blockH : 1)
      if (blockH <= STEP_BLOCK_HEIGHT) continue
      const isFloorBlock = blockMaxY <= position.y + FLOOR_TOLERANCE
      const playerFullyAbove = position.y >= blockMaxY - FLOOR_TOLERANCE
      if (isFloorBlock && playerFullyAbove) continue
      const playerMinX = position.x - halfX
      const playerMaxX = position.x + halfX
      const overlapMinX = Math.max(playerMinX, blockMinX)
      const overlapMaxX = Math.min(playerMaxX, blockMaxX)
      if (overlapMaxX - overlapMinX <= 0) continue

      // Step-up: only when allowed (e.g. in water exiting onto shore); on land we don't auto-step full blocks
      const canStepUpX =
        allowStepUp &&
        blockMaxY > position.y &&
        blockMaxY <= position.y + STEP_HEIGHT
      if (canStepUpX) {
        const stepY = blockMaxY
        fillBlocksInAABB(position.x, stepY, position.z, halfX, halfZ, height, false)
        let wallBlocked = false
        for (let j = 0; j < _aabbBlockCount; j++) {
          const b = _aabbBlockBuffer[j]
          const bMinX = blockMin(b.bx)
          const bMaxX = blockMax(b.bx)
          const bMinZ = blockMin(b.bz)
          const bMaxZ = blockMax(b.bz)
          const xO = Math.min(position.x + halfX, bMaxX) - Math.max(position.x - halfX, bMinX)
          const zO = Math.min(position.z + halfZ, bMaxZ) - Math.max(position.z - halfZ, bMinZ)
          if (xO <= 1e-4 || zO <= 1e-4) continue
          const bH = getBlockHeightAt(b.bx, b.by, b.bz)
          const bMaxY = b.by + (bH > 0 ? bH : 1)
          if (bH <= STEP_BLOCK_HEIGHT) continue
          const floorAtStep = bMaxY <= stepY + FLOOR_TOLERANCE
          const aboveAtStep = stepY >= bMaxY - FLOOR_TOLERANCE
          if (floorAtStep && aboveAtStep) continue
          wallBlocked = true
          break
        }
        if (!wallBlocked) {
          position.y = stepY
          velocity.y = 0
          result.grounded = true
          resolved = true
          break
        }
      }

      const fromX = position.x
      if (velocity.x > 0) position.x = blockMinX - halfX
      else if (velocity.x < 0) position.x = blockMaxX + halfX
      else position.x = position.x < bx + 0.5 ? blockMinX - halfX : blockMaxX + halfX
      debug?.snaps.push({
        axis: 'x',
        reason: 'wall',
        from: fromX,
        to: position.x,
      })
      velocity.x = 0
      result.hitX = true
      resolved = true
      break
    }
    if (!resolved) break
  }

  // --- Z ---
  position.z += velocity.z * dt
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(position.x, position.y, position.z, halfX, halfZ, height, false)
    let resolved = false
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i]
      const blockMinX = blockMin(bx)
      const blockMaxX = blockMax(bx)
      const xOvlp =
        Math.min(position.x + halfX, blockMaxX) - Math.max(position.x - halfX, blockMinX)
      if (xOvlp <= 1e-4) continue
      const blockMinZ = blockMin(bz)
      const blockMaxZ = blockMax(bz)
      const blockH = getBlockHeightAt(bx, by, bz)
      const blockMaxY = by + (blockH > 0 ? blockH : 1)
      if (blockH <= STEP_BLOCK_HEIGHT) continue
      const isFloorBlock = blockMaxY <= position.y + FLOOR_TOLERANCE
      const playerFullyAbove = position.y >= blockMaxY - FLOOR_TOLERANCE
      if (isFloorBlock && playerFullyAbove) continue
      const playerMinZ = position.z - halfZ
      const playerMaxZ = position.z + halfZ
      const overlapMinZ = Math.max(playerMinZ, blockMinZ)
      const overlapMaxZ = Math.min(playerMaxZ, blockMaxZ)
      if (overlapMaxZ - overlapMinZ <= 0) continue

      // Step-up: only when allowed (e.g. in water exiting onto shore); on land we don't auto-step full blocks
      const canStepUpZ =
        allowStepUp &&
        blockMaxY > position.y &&
        blockMaxY <= position.y + STEP_HEIGHT
      if (canStepUpZ) {
        const stepY = blockMaxY
        fillBlocksInAABB(position.x, stepY, position.z, halfX, halfZ, height, false)
        let wallBlocked = false
        for (let j = 0; j < _aabbBlockCount; j++) {
          const b = _aabbBlockBuffer[j]
          const bMinX = blockMin(b.bx)
          const bMaxX = blockMax(b.bx)
          const bMinZ = blockMin(b.bz)
          const bMaxZ = blockMax(b.bz)
          const xO = Math.min(position.x + halfX, bMaxX) - Math.max(position.x - halfX, bMinX)
          const zO = Math.min(position.z + halfZ, bMaxZ) - Math.max(position.z - halfZ, bMinZ)
          if (xO <= 1e-4 || zO <= 1e-4) continue
          const bH = getBlockHeightAt(b.bx, b.by, b.bz)
          const bMaxY = b.by + (bH > 0 ? bH : 1)
          if (bH <= STEP_BLOCK_HEIGHT) continue
          const floorAtStep = bMaxY <= stepY + FLOOR_TOLERANCE
          const aboveAtStep = stepY >= bMaxY - FLOOR_TOLERANCE
          if (floorAtStep && aboveAtStep) continue
          wallBlocked = true
          break
        }
        if (!wallBlocked) {
          position.y = stepY
          velocity.y = 0
          result.grounded = true
          resolved = true
          break
        }
      }

      const fromZ = position.z
      if (velocity.z > 0) position.z = blockMinZ - halfZ
      else if (velocity.z < 0) position.z = blockMaxZ + halfZ
      else position.z = position.z < bz + 0.5 ? blockMinZ - halfZ : blockMaxZ + halfZ
      debug?.snaps.push({
        axis: 'z',
        reason: 'wall',
        from: fromZ,
        to: position.z,
      })
      velocity.z = 0
      result.hitZ = true
      resolved = true
      break
    }
    if (!resolved) break
  }

  // --- Y --- grounded only when we land on the top face of a block.
  position.y += velocity.y * dt
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(position.x, position.y, position.z, halfX, halfZ, height)
    let bestBlock: { blockMinY: number; blockMaxY: number } | null = null
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i]
      const blockMinX = blockMin(bx)
      const blockMaxX = blockMax(bx)
      const blockMinZ = blockMin(bz)
      const blockMaxZ = blockMax(bz)
      const xOvlp =
        Math.min(position.x + halfX, blockMaxX) - Math.max(position.x - halfX, blockMinX)
      const zOvlp =
        Math.min(position.z + halfZ, blockMaxZ) - Math.max(position.z - halfZ, blockMinZ)
      if (xOvlp <= 0.001 || zOvlp <= 0.001) continue
      const blockMinY = blockMin(by)
      const blockH = getBlockHeightAt(bx, by, bz)
      const blockMaxY = by + (blockH > 0 ? blockH : 1)
      const playerMinY = position.y
      const playerMaxY = position.y + height
      const overlapMinY = Math.max(playerMinY, blockMinY)
      const overlapMaxY = Math.min(playerMaxY, blockMaxY)
      if (overlapMaxY - overlapMinY <= 0) continue
      if (velocity.y > 0) {
        if (!bestBlock || blockMinY < bestBlock.blockMinY) bestBlock = { blockMinY, blockMaxY }
      } else {
        const isFalling = velocity.y < FALLING_VELOCITY_THRESHOLD
        const underFeet = blockMaxY <= position.y + FLOOR_TOLERANCE
        if (isFalling || underFeet) {
          if (!bestBlock || blockMaxY > bestBlock.blockMaxY) bestBlock = { blockMinY, blockMaxY }
        }
      }
    }
    if (!bestBlock) break
    const { blockMinY, blockMaxY } = bestBlock
    const fromY = position.y
    if (velocity.y > 0) {
      position.y = blockMinY - height
      debug?.snaps.push({
        axis: 'y',
        reason: 'ceiling',
        from: fromY,
        to: position.y,
      })
      velocity.y = 0
      result.hitYUp = true
    } else {
      const feetBeforeResolve = position.y
      const isFloor = feetBeforeResolve >= blockMaxY - FLOOR_TOLERANCE
      position.y = blockMaxY
      debug?.snaps.push({
        axis: 'y',
        reason: 'floor',
        from: fromY,
        to: position.y,
      })
      velocity.y = 0
      result.hitYDown = true
      if (isFloor) result.grounded = true
    }
  }
  return result
}
