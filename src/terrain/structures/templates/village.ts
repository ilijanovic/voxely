/**
 * Village structure templates: small, medium, and large houses with floor, walls,
 * roof, door, and windows. Origin (ox, oy, oz) is the center of the floor.
 * Dimensions are chosen deterministically from (ox, oz) within min/max per size.
 */
import type { BlockType } from '../../../types'
import type { VillageHouseSize } from '../origins'
import { pickVillageHouseFromPool } from '../template-pools'

export type { VillageHouseSize }

/** Min and max height for village houses in blocks (floor + walls + roof). Chosen deterministically per house. */
const HOUSE_HEIGHT_MIN = 5
const HOUSE_HEIGHT_MAX = 6

/** Door opening height in blocks. Every house has at least one 1×2 entry (1 wide × this height). */
const DOOR_HEIGHT = 2

/** Min/max width (X) and length (Z) per house size. */
const HOUSE_SIZE_RANGES: Record<
  VillageHouseSize,
  { minWidthX: number; maxWidthX: number; minWidthZ: number; maxWidthZ: number }
> = {
  small: { minWidthX: 6, maxWidthX: 9, minWidthZ: 6, maxWidthZ: 8 },
  medium: { minWidthX: 9, maxWidthX: 12, minWidthZ: 8, maxWidthZ: 11 },
  large: { minWidthX: 11, maxWidthX: 15, minWidthZ: 10, maxWidthZ: 13 },
}

/**
 * Deterministic hash from (ox, oz) for deriving dimensions and door/window layout.
 * Same house position always yields the same result.
 */
function hashOrigin(ox: number, oz: number): number {
  let h = Math.floor(ox) * 374761393 + Math.floor(oz) * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h ^= h >> 16
  return h >>> 0
}

/**
 * Maps a 32-bit unsigned hash to an integer in [minInclusive, maxInclusive].
 */
function hashToRange(hash: number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1
  return minInclusive + ((hash >>> 0) % span)
}

/**
 * Returns deterministic house dimensions for the given origin and size.
 * Width and length are chosen within the configured min/max for that size.
 */
export function getHouseDimensions(
  ox: number,
  oz: number,
  houseSize: VillageHouseSize,
): { widthX: number; widthZ: number; height: number } {
  const ranges = HOUSE_SIZE_RANGES[houseSize]
  const h = hashOrigin(ox, oz)
  const widthX = hashToRange(h, ranges.minWidthX, ranges.maxWidthX)
  const widthZ = hashToRange((h * 1274126177) >>> 0, ranges.minWidthZ, ranges.maxWidthZ)
  const height = hashToRange((h * 668265263) >>> 0, HOUSE_HEIGHT_MIN, HOUSE_HEIGHT_MAX)
  return { widthX, widthZ, height }
}

/** Walkway path width in blocks (axis-perpendicular to segment direction). */
const WALKWAY_WIDTH_BLOCKS = 2

/** Door position plus floor Y and house footprint for walkway placement (path goes around house). */
export interface VillageDoorPosition {
  doorX: number
  doorZ: number
  oy: number
  /** House footprint so the path can be chosen to go around, not through, the house. */
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Returns whether the first segment of an L-path (door -> centerX, doorZ) goes outward from the
 * door and does not enter the house interior.
 */
function firstSegmentAlongXGoesOut(
  doorX: number,
  doorZ: number,
  centerX: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  if (doorZ === minZ || doorZ === maxZ) return true
  if (doorX === minX) return centerX <= minX
  if (doorX === maxX) return centerX >= maxX
  return true
}

/**
 * Returns whether the first segment of an L-path (door -> doorX, centerZ) goes outward from the
 * door and does not enter the house interior.
 */
function firstSegmentAlongZGoesOut(
  doorX: number,
  doorZ: number,
  centerZ: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  if (doorX === minX || doorX === maxX) return true
  if (doorZ === minZ) return centerZ <= minZ
  if (doorZ === maxZ) return centerZ >= maxZ
  return true
}

/** Extra margin (blocks) around the house so gravel does not touch walls or sit under them. */
const WALKWAY_HOUSE_MARGIN = 1

/** Fraction of walkway blocks that are grass_path (rest gravel); 1 in 4 = 25%. */
const WALKWAY_GRASS_PATH_ONE_IN = 4

/**
 * Returns the (x, z) of the single block immediately in front of the door (outside the house).
 * Used so the path can connect to the door without placing gravel along the side walls.
 */
function doorFrontBlock(
  doorX: number,
  doorZ: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): { x: number; z: number } {
  if (doorZ === minZ) return { x: doorX, z: minZ - 1 }
  if (doorZ === maxZ) return { x: doorX, z: maxZ + 1 }
  if (doorX === minX) return { x: minX - 1, z: doorZ }
  return { x: maxX + 1, z: doorZ }
}

/**
 * Returns true if (x, z) is inside the house footprint or within margin of the walls,
 * so gravel is not placed under or against the house. The door cell and the one block
 * in front of the door are allowed so the path can meet the threshold.
 */
function isInsideHouseOrMargin(
  x: number,
  z: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  doorX: number,
  doorZ: number,
): boolean {
  const lowX = minX - WALKWAY_HOUSE_MARGIN
  const highX = maxX + WALKWAY_HOUSE_MARGIN
  const lowZ = minZ - WALKWAY_HOUSE_MARGIN
  const highZ = maxZ + WALKWAY_HOUSE_MARGIN
  if (x < lowX || x > highX || z < lowZ || z > highZ) return false
  if (x === doorX && z === doorZ) return false
  const front = doorFrontBlock(doorX, doorZ, minX, maxX, minZ, maxZ)
  if (x === front.x && z === front.z) return false
  return true
}

/**
 * Yields integer grid points along an axis-aligned segment (either dx or dz is zero).
 */
function rasterAxisAlignedSegment(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  if (x0 !== x1 && z0 !== z1) return out
  const dx = Math.sign(x1 - x0)
  const dz = Math.sign(z1 - z0)
  let x = x0
  let z = z0
  while (x !== x1 || z !== z1) {
    out.push({ x, z })
    if (x !== x1) x += dx
    else z += dz
  }
  out.push({ x, z })
  return out
}

/**
 * Returns block entries for L-shaped village walkways (axis-aligned, no diagonals) connecting
 * doors to a center. Path goes around each house (first segment outward from the door).
 * Path is 2 blocks wide; blocks are gravel with a deterministic mix of grass_path (~25%).
 * Only returns blocks inside the given chunk bounds.
 */
export function getVillageWalkwayBlocks(
  doors: VillageDoorPosition[],
  centerX: number,
  centerZ: number,
  worldX: number,
  worldZ: number,
  chunkSize: number,
): Array<{ bx: number; by: number; bz: number; block: BlockType }> {
  const out: Array<{ bx: number; by: number; bz: number; block: BlockType }> = []
  const maxX = worldX + chunkSize - 1
  const maxZ = worldZ + chunkSize - 1
  const cx = Math.round(centerX)
  const cz = Math.round(centerZ)

  for (const door of doors) {
    const { doorX, doorZ, oy, minX, maxX: dMaxX, minZ, maxZ: dMaxZ } = door
    const useXFirst = firstSegmentAlongXGoesOut(doorX, doorZ, cx, minX, dMaxX, minZ, dMaxZ)
    const useZFirst = firstSegmentAlongZGoesOut(doorX, doorZ, cz, minX, dMaxX, minZ, dMaxZ)

    const segments: Array<{ x0: number; z0: number; x1: number; z1: number }> = useXFirst
      ? [
          { x0: doorX, z0: doorZ, x1: cx, z1: doorZ },
          { x0: cx, z0: doorZ, x1: cx, z1: cz },
        ]
      : useZFirst
        ? [
            { x0: doorX, z0: doorZ, x1: doorX, z1: cz },
            { x0: doorX, z0: cz, x1: cx, z1: cz },
          ]
        : [
            { x0: doorX, z0: doorZ, x1: cx, z1: doorZ },
            { x0: cx, z0: doorZ, x1: cx, z1: cz },
          ]

    const seen = new Set<string>()
    for (const seg of segments) {
      const points = rasterAxisAlignedSegment(seg.x0, seg.z0, seg.x1, seg.z1)
      const alongX = seg.x0 !== seg.x1
      for (const { x, z } of points) {
        for (let w = 0; w < WALKWAY_WIDTH_BLOCKS; w++) {
          const bx = alongX ? x : x + w
          const bz = alongX ? z + w : z
          if (isInsideHouseOrMargin(bx, bz, minX, dMaxX, minZ, dMaxZ, doorX, doorZ)) continue
          const key = `${bx},${bz}`
          if (seen.has(key)) continue
          seen.add(key)
          if (bx < worldX || bx > maxX || bz < worldZ || bz > maxZ) continue
          const pathBlock =
            hashOrigin(bx, bz) % WALKWAY_GRASS_PATH_ONE_IN === 0 ? 'grass_path' : 'gravel'
          out.push({ bx, by: oy, bz, block: pathBlock })
        }
      }
    }
  }
  return out
}

/**
 * Returns the (bx, bz) position of the 1×2 door opening for a house at the given origin and size.
 * Used by tests and callers that need to know the door location (e.g. for pathfinding).
 */
export function getDoorPosition(
  ox: number,
  oz: number,
  houseSize: VillageHouseSize,
): { doorX: number; doorZ: number } {
  const { widthX, widthZ } = getHouseDimensions(ox, oz, houseSize)
  const halfX = Math.floor((widthX - 1) / 2)
  const halfZ = Math.floor((widthZ - 1) / 2)
  const minX = ox - halfX
  const minZ = oz - halfZ
  const maxX = minX + widthX - 1
  const maxZ = minZ + widthZ - 1
  const h = hashOrigin(ox, oz)
  const lengthIsZ = widthZ >= widthX
  const doorOnSecondWall = ((h >> 16) & 1) === 1
  if (lengthIsZ) {
    return { doorX: minX + halfX, doorZ: doorOnSecondWall ? maxZ : minZ }
  }
  return { doorX: doorOnSecondWall ? maxX : minX, doorZ: minZ + halfZ }
}

/**
 * Deterministic village house size from world seed and origin (template pool with weights).
 * Small houses more common, large rarer (Minecraft-style).
 */
export function getVillageHouseSizeFromSeed(
  seed: number,
  ox: number,
  oz: number,
): VillageHouseSize {
  return pickVillageHouseFromPool(seed, ox, oz)
}

/** Height (blocks) at which windows are placed (second block above floor). */
const WINDOW_HEIGHT_OFFSET = 2

/** Wall length threshold: 1 window below this, 2 windows at or above. */
const WINDOW_COUNT_THRESHOLD = 6

/** Minimum wall-index gap between two windows on the same wall (1 block between = 2). */
const MIN_WINDOW_INDEX_GAP = 2

/** Floor material options: wood planks (usual) or stone. All must be in TERRAIN_BLOCK_TYPES. */
const FLOOR_PLANK_OPTIONS: BlockType[] = [
  'oak_planks',
  'spruce_planks',
  'birch_planks',
  'jungle_planks',
  'acacia_planks',
  'dark_oak_planks',
]
const FLOOR_STONE_OPTION: BlockType = 'stone'

/** Wall material options: wood planks, stone, or bricks. All must be in TERRAIN_BLOCK_TYPES. */
const WALL_MATERIAL_OPTIONS: BlockType[] = ['oak_planks', 'stone', 'bricks']

/** Probability (0–1) that floor is a plank type; otherwise stone. */
const FLOOR_PLANK_CHANCE = 0.85

/**
 * Deterministic house materials from origin hash. Same (ox, oz) always yields same materials.
 * Exported for tests.
 */
export function getHouseMaterials(ox: number, oz: number): {
  floorMaterial: BlockType
  wallMaterial: BlockType
  useWoodCorners: boolean
  cornerWood: BlockType
} {
  const h = hashOrigin(ox, oz)
  const floorIsPlank = (h >>> 0) / 0xffffffff < FLOOR_PLANK_CHANCE
  const floorMaterial = floorIsPlank
    ? FLOOR_PLANK_OPTIONS[((h >> 4) >>> 0) % FLOOR_PLANK_OPTIONS.length]
    : FLOOR_STONE_OPTION
  const wallMaterial = WALL_MATERIAL_OPTIONS[((h >> 8) >>> 0) % WALL_MATERIAL_OPTIONS.length]
  const useWoodCorners = ((h >> 12) & 1) === 1
  const cornerWood = FLOOR_PLANK_OPTIONS[((h >> 16) >>> 0) % FLOOR_PLANK_OPTIONS.length]
  return { floorMaterial, wallMaterial, useWoodCorners, cornerWood }
}

/**
 * Returns block entries for a village house of the given size. Origin (ox, oy, oz) is the
 * center of the floor. Dimensions are derived deterministically from (ox, oz).
 * Floor is usually wood planks (deterministic choice per house), walls are one of wood planks,
 * stone, or bricks. The four corners of the house may optionally be wood (deterministic).
 * Includes hay_block roof, at least one 1×2 door opening (air, 1 wide × 2 tall) on one of the two
 * length walls so the player can walk through, and window gaps at height 2.
 */
export function getVillageBlocks(
  ox: number,
  oy: number,
  oz: number,
  houseSize: VillageHouseSize,
): Array<{ bx: number; by: number; bz: number; block: BlockType }> {
  const { widthX, widthZ, height } = getHouseDimensions(ox, oz, houseSize)
  const halfX = Math.floor((widthX - 1) / 2)
  const halfZ = Math.floor((widthZ - 1) / 2)
  const minX = ox - halfX
  const minZ = oz - halfZ
  const maxX = minX + widthX - 1
  const maxZ = minZ + widthZ - 1
  const h = hashOrigin(ox, oz)
  const lengthIsZ = widthZ >= widthX
  const doorOnSecondWall = ((h >> 16) & 1) === 1

  let doorX: number
  let doorZ: number
  if (lengthIsZ) {
    doorX = minX + halfX
    doorZ = doorOnSecondWall ? maxZ : minZ
  } else {
    doorX = doorOnSecondWall ? maxX : minX
    doorZ = minZ + halfZ
  }

  const windowY = oy + WINDOW_HEIGHT_OFFSET
  const { floorMaterial, wallMaterial, useWoodCorners, cornerWood } = getHouseMaterials(ox, oz)
  const isCorner = (bx: number, bz: number) =>
    (bx === minX || bx === maxX) && (bz === minZ || bz === maxZ)

  const windowPositions = new Set<string>()

  /**
   * Returns wall indices (1..L-2, excluding door) to use as window positions;
   * 1 window if wall length < threshold, 2 otherwise. Two windows on the same wall
   * are always at least MIN_WINDOW_INDEX_GAP apart (1 block in between).
   */
  function getWindowIndicesAlongWall(
    wallLength: number,
    doorIndexOnWall: number | null,
  ): number[] {
    const nonCorner = []
    for (let i = 1; i < wallLength - 1; i++) {
      if (i === doorIndexOnWall) continue
      nonCorner.push(i)
    }
    if (nonCorner.length === 0) return []
    const wantTwo = wallLength >= WINDOW_COUNT_THRESHOLD
    if (!wantTwo || nonCorner.length < 2) {
      return [nonCorner[Math.floor(nonCorner.length / 2)]]
    }
    const left = nonCorner[0]
    const right = nonCorner[nonCorner.length - 1]
    if (right - left < MIN_WINDOW_INDEX_GAP) {
      return [nonCorner[Math.floor(nonCorner.length / 2)]]
    }
    return [left, right]
  }

  if (lengthIsZ) {
    const doorIdxX = doorX - minX
    for (const i of getWindowIndicesAlongWall(
      widthX,
      doorZ === minZ ? doorIdxX : null,
    )) {
      windowPositions.add(`${minX + i},${minZ}`)
    }
    for (const i of getWindowIndicesAlongWall(
      widthX,
      doorZ === maxZ ? doorIdxX : null,
    )) {
      windowPositions.add(`${minX + i},${maxZ}`)
    }
    for (const j of getWindowIndicesAlongWall(widthZ, null)) {
      windowPositions.add(`${minX},${minZ + j}`)
      windowPositions.add(`${maxX},${minZ + j}`)
    }
  } else {
    const doorIdxZ = doorZ - minZ
    for (const j of getWindowIndicesAlongWall(
      widthZ,
      doorX === minX ? doorIdxZ : null,
    )) {
      windowPositions.add(`${minX},${minZ + j}`)
    }
    for (const j of getWindowIndicesAlongWall(
      widthZ,
      doorX === maxX ? doorIdxZ : null,
    )) {
      windowPositions.add(`${maxX},${minZ + j}`)
    }
    for (const i of getWindowIndicesAlongWall(widthX, null)) {
      windowPositions.add(`${minX + i},${minZ}`)
      windowPositions.add(`${minX + i},${maxZ}`)
    }
  }

  const out: Array<{ bx: number; by: number; bz: number; block: BlockType }> = []

  /**
   * Returns the roof block for this house. Uses hay_block for more rustic/farm houses and
   * planks/stone bricks for more built-up variants, derived deterministically from the origin.
   */
  function pickRoofBlock(): BlockType {
    const roofHash = (h >> 20) >>> 0
    const rustic = (roofHash & 1) === 1
    if (rustic) return 'hay_block'
    if (wallMaterial === 'bricks') return 'stone_bricks'
    if (wallMaterial === 'stone') return 'stone'
    // Default: simple plank roof for wooden houses.
    return 'oak_planks'
  }

  const roofBlock = pickRoofBlock()

  for (let dx = 0; dx < widthX; dx++) {
    for (let dz = 0; dz < widthZ; dz++) {
      for (let dy = 0; dy < height; dy++) {
        const bx = minX + dx
        const by = oy + dy
        const bz = minZ + dz
        const isFloor = dy === 0
        const isRoof = dy === height - 1
        const isWall =
          dx === 0 || dx === widthX - 1 || dz === 0 || dz === widthZ - 1

        if (isFloor) {
          out.push({ bx, by, bz, block: floorMaterial })
          continue
        }
        if (isRoof) {
          out.push({ bx, by, bz, block: roofBlock })
          continue
        }

        if (!isWall) continue

        const doorYOffset = by - oy
        const isDoor =
          bx === doorX &&
          bz === doorZ &&
          doorYOffset >= 1 &&
          doorYOffset < 1 + DOOR_HEIGHT
        const isWindow = by === windowY && windowPositions.has(`${bx},${bz}`)

        if (isDoor) {
          /* 1×2 opening: no block placed so terrain stays air and player can walk through. */
          continue
        }
        if (!isWindow) {
          const wallIsBrickOrStone = wallMaterial === 'bricks' || wallMaterial === 'stone'
          const isFoundationRow = doorYOffset === 1

          let wallBlock: BlockType

          if (isFoundationRow && !isCorner(bx, bz)) {
            // Stone foundation ring under walls to give houses a more grounded look.
            wallBlock = 'stone'
          } else if (!wallIsBrickOrStone && useWoodCorners && isCorner(bx, bz)) {
            wallBlock = cornerWood
          } else {
            wallBlock = wallMaterial
          }

          out.push({ bx, by, bz, block: wallBlock })
        }
      }
    }
  }

  return out
}
