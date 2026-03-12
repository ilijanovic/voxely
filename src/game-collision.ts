/**
 * Voxel AABB collision: resolve player (or any AABB) against solid blocks.
 * Exports resolveVoxelCollisions, player AABB constants, and debug types.
 *
 * Block convention (must match rendering and worker geometry): a block at integer (bx, by, bz)
 * occupies the world AABB [bx..bx+1], [by..by+1], [bz..bz+1] (corner-based, not center-based).
 */
import { STEP_BLOCK_HEIGHT, STEP_UP_MAX_CLIMB } from './constants'
import {
  isSolidBlock as isSolidBlockRuntime,
  isSolidBlockLoadedOnly,
  getBlockCollisionBoxesAt,
} from './chunk-runtime'
import { isSolidBlock as isBlockTypeSolid } from './block-registry'

/** Collision height (world units) of fence-like blocks; used to block horizontal movement when player is in the air (cannot jump over). */
export const FENCE_COLLISION_HEIGHT = 1.5

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
 * When allowStepUp is true, a block within STEP_UP_MAX_CLIMB above feet can be climbed onto (e.g. stairs, slabs; full blocks are not step-up-able). Default false so normal walking does not auto-step.
 * _wasGroundedAtStartOfFrame: when false, fence-height blocks (1.5) always block horizontal movement so the player cannot jump over them (Minecraft behavior).
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
  _wasGroundedAtStartOfFrame: boolean = true,
): CollisionResult {
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

  /**
   * Iterates world-space collision boxes for the block cell (bx, by, bz).
   * For most blocks this is a single box; stairs return multiple.
   */
  function forEachCollisionBoxAt(
    bx: number,
    by: number,
    bz: number,
    fn: (box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }) => void,
  ): void {
    const boxes = getBlockCollisionBoxesAt(bx, by, bz)
    for (const b of boxes) fn(b)
  }

  // --- X --- only resolve true side (wall) collisions; floor is handled by Y pass only. Use loaded-only solid so we don't hit an invisible wall at chunk boundaries.
  position.x += velocity.x * dt
  for (let iter = 0; iter < 4; iter++) {
    fillBlocksInAABB(position.x, position.y, position.z, halfX, halfZ, height, false)
    let resolved = false
    for (let i = 0; i < _aabbBlockCount; i++) {
      const { bx, by, bz } = _aabbBlockBuffer[i]
      let resolvedThisCell = false
      forEachCollisionBoxAt(bx, by, bz, (box) => {
        if (resolvedThisCell) return
        const zOvlp =
          Math.min(position.z + halfZ, box.maxZ) - Math.max(position.z - halfZ, box.minZ)
        if (zOvlp <= 1e-4) return
        const effectiveHeightAboveBlockBase = box.maxY - by
        if (effectiveHeightAboveBlockBase <= STEP_BLOCK_HEIGHT) return
        const playerMinX = position.x - halfX
        const playerMaxX = position.x + halfX
        const overlapMinX = Math.max(playerMinX, box.minX)
        const overlapMaxX = Math.min(playerMaxX, box.maxX)
        const hasXOverlap = overlapMaxX - overlapMinX > 0

        // Fence-height blocks: when player is in the air, always block horizontal movement (cannot jump over, Minecraft behavior).
        if (
          effectiveHeightAboveBlockBase >= FENCE_COLLISION_HEIGHT &&
          !_wasGroundedAtStartOfFrame &&
          hasXOverlap
        ) {
          const fromX = position.x
          if (velocity.x > 0) position.x = box.minX - halfX
          else if (velocity.x < 0) position.x = box.maxX + halfX
          else position.x = position.x < bx + 0.5 ? box.minX - halfX : box.maxX + halfX
          debug?.snaps.push({
            axis: 'x',
            reason: 'wall',
            from: fromX,
            to: position.x,
          })
          velocity.x = 0
          result.hitX = true
          resolved = true
          resolvedThisCell = true
          return
        }

        const isFloorBox = box.maxY <= position.y + FLOOR_TOLERANCE
        const playerFullyAbove = position.y >= box.maxY - FLOOR_TOLERANCE
        if (isFloorBox && playerFullyAbove) return
        if (!hasXOverlap) return

        // Step-up: only when allowed, obstacle is low enough, and at most 1 unit tall (no stepping onto fences).
        const canStepUpX =
          allowStepUp &&
          effectiveHeightAboveBlockBase <= 1 &&
          box.maxY > position.y &&
          box.maxY <= position.y + STEP_UP_MAX_CLIMB
        if (canStepUpX) {
          const stepY = box.maxY
          fillBlocksInAABB(position.x, stepY, position.z, halfX, halfZ, height, false)
          let wallBlocked = false
          for (let j = 0; j < _aabbBlockCount; j++) {
            const b = _aabbBlockBuffer[j]
            let blockedByAnyBox = false
            forEachCollisionBoxAt(b.bx, b.by, b.bz, (bb) => {
              if (blockedByAnyBox) return
              const xO =
                Math.min(position.x + halfX, bb.maxX) - Math.max(position.x - halfX, bb.minX)
              const zO =
                Math.min(position.z + halfZ, bb.maxZ) - Math.max(position.z - halfZ, bb.minZ)
              if (xO <= 1e-4 || zO <= 1e-4) return
              const effH = bb.maxY - b.by
              if (effH <= STEP_BLOCK_HEIGHT) return
              const floorAtStep = bb.maxY <= stepY + FLOOR_TOLERANCE
              const aboveAtStep = stepY >= bb.maxY - FLOOR_TOLERANCE
              if (floorAtStep && aboveAtStep) return
              blockedByAnyBox = true
            })
            if (blockedByAnyBox) {
              wallBlocked = true
              break
            }
          }
          if (!wallBlocked) {
            position.y = stepY
            velocity.y = 0
            result.grounded = true
            resolved = true
            resolvedThisCell = true
            return
          }
        }

        const fromX = position.x
        if (velocity.x > 0) position.x = box.minX - halfX
        else if (velocity.x < 0) position.x = box.maxX + halfX
        else position.x = position.x < bx + 0.5 ? box.minX - halfX : box.maxX + halfX
        debug?.snaps.push({
          axis: 'x',
          reason: 'wall',
          from: fromX,
          to: position.x,
        })
        velocity.x = 0
        result.hitX = true
        resolved = true
        resolvedThisCell = true
      })
      if (resolved) break
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
      let resolvedThisCell = false
      forEachCollisionBoxAt(bx, by, bz, (box) => {
        if (resolvedThisCell) return
        const xOvlp =
          Math.min(position.x + halfX, box.maxX) - Math.max(position.x - halfX, box.minX)
        if (xOvlp <= 1e-4) return
        const effectiveHeightAboveBlockBase = box.maxY - by
        if (effectiveHeightAboveBlockBase <= STEP_BLOCK_HEIGHT) return
        const playerMinZ = position.z - halfZ
        const playerMaxZ = position.z + halfZ
        const overlapMinZ = Math.max(playerMinZ, box.minZ)
        const overlapMaxZ = Math.min(playerMaxZ, box.maxZ)
        const hasZOverlap = overlapMaxZ - overlapMinZ > 0

        // Fence-height blocks: when player is in the air, always block horizontal movement (cannot jump over, Minecraft behavior).
        if (
          effectiveHeightAboveBlockBase >= FENCE_COLLISION_HEIGHT &&
          !_wasGroundedAtStartOfFrame &&
          hasZOverlap
        ) {
          const fromZ = position.z
          if (velocity.z > 0) position.z = box.minZ - halfZ
          else if (velocity.z < 0) position.z = box.maxZ + halfZ
          else position.z = position.z < bz + 0.5 ? box.minZ - halfZ : box.maxZ + halfZ
          debug?.snaps.push({
            axis: 'z',
            reason: 'wall',
            from: fromZ,
            to: position.z,
          })
          velocity.z = 0
          result.hitZ = true
          resolved = true
          resolvedThisCell = true
          return
        }

        const isFloorBox = box.maxY <= position.y + FLOOR_TOLERANCE
        const playerFullyAbove = position.y >= box.maxY - FLOOR_TOLERANCE
        if (isFloorBox && playerFullyAbove) return
        if (!hasZOverlap) return

        // Step-up: only when allowed, obstacle is low enough, and at most 1 unit tall (no stepping onto fences).
        const canStepUpZ =
          allowStepUp &&
          effectiveHeightAboveBlockBase <= 1 &&
          box.maxY > position.y &&
          box.maxY <= position.y + STEP_UP_MAX_CLIMB
        if (canStepUpZ) {
          const stepY = box.maxY
          fillBlocksInAABB(position.x, stepY, position.z, halfX, halfZ, height, false)
          let wallBlocked = false
          for (let j = 0; j < _aabbBlockCount; j++) {
            const b = _aabbBlockBuffer[j]
            let blockedByAnyBox = false
            forEachCollisionBoxAt(b.bx, b.by, b.bz, (bb) => {
              if (blockedByAnyBox) return
              const xO =
                Math.min(position.x + halfX, bb.maxX) - Math.max(position.x - halfX, bb.minX)
              const zO =
                Math.min(position.z + halfZ, bb.maxZ) - Math.max(position.z - halfZ, bb.minZ)
              if (xO <= 1e-4 || zO <= 1e-4) return
              const effH = bb.maxY - b.by
              if (effH <= STEP_BLOCK_HEIGHT) return
              const floorAtStep = bb.maxY <= stepY + FLOOR_TOLERANCE
              const aboveAtStep = stepY >= bb.maxY - FLOOR_TOLERANCE
              if (floorAtStep && aboveAtStep) return
              blockedByAnyBox = true
            })
            if (blockedByAnyBox) {
              wallBlocked = true
              break
            }
          }
          if (!wallBlocked) {
            position.y = stepY
            velocity.y = 0
            result.grounded = true
            resolved = true
            resolvedThisCell = true
            return
          }
        }

        const fromZ = position.z
        if (velocity.z > 0) position.z = box.minZ - halfZ
        else if (velocity.z < 0) position.z = box.maxZ + halfZ
        else position.z = position.z < bz + 0.5 ? box.minZ - halfZ : box.maxZ + halfZ
        debug?.snaps.push({
          axis: 'z',
          reason: 'wall',
          from: fromZ,
          to: position.z,
        })
        velocity.z = 0
        result.hitZ = true
        resolved = true
        resolvedThisCell = true
      })
      if (resolved) break
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
      forEachCollisionBoxAt(bx, by, bz, (box) => {
        const xOvlp =
          Math.min(position.x + halfX, box.maxX) - Math.max(position.x - halfX, box.minX)
        const zOvlp =
          Math.min(position.z + halfZ, box.maxZ) - Math.max(position.z - halfZ, box.minZ)
        if (xOvlp <= 0.001 || zOvlp <= 0.001) return
        const playerMinY = position.y
        const playerMaxY = position.y + height
        const overlapMinY = Math.max(playerMinY, box.minY)
        const overlapMaxY = Math.min(playerMaxY, box.maxY)
        if (overlapMaxY - overlapMinY <= 0) return
        if (velocity.y > 0) {
          if (!bestBlock || box.minY < bestBlock.blockMinY) {
            bestBlock = { blockMinY: box.minY, blockMaxY: box.maxY }
          }
        } else {
          const isFalling = velocity.y < FALLING_VELOCITY_THRESHOLD
          const underFeet = box.maxY <= position.y + FLOOR_TOLERANCE
          if (isFalling || underFeet) {
            if (!bestBlock || box.maxY > bestBlock.blockMaxY) {
              bestBlock = { blockMinY: box.minY, blockMaxY: box.maxY }
            }
          }
        }
      })
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
