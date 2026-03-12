/**
 * WoW-style creature spawn zones: area (X,Z + circle or ring), density, disposition, wander radius.
 * Zone spawn and biome spawn are mutually exclusive per (chunk, kind)—if a zone overlapping
 * the chunk spawns that kind, only zone(s) spawn it there.
 */
import type { AnimalKind } from './entities/types'
import type { MobDisposition } from './entities/types'
import { WORLD_SEED } from './game-terrain'

export interface CreatureSpawnZone {
  /** Unique id for debugging and future use (e.g. loot overrides). */
  id: string
  /** Center X (world blocks). */
  centerX: number
  /** Center Z (world blocks). */
  centerZ: number
  /** Radius in blocks (circle). Used for overlap when not a ring. */
  radius: number
  /** If set, zone is a ring at this distance from center; mobs spawn randomly on the ring. */
  ringRadius?: number
  /** Width of ring band in blocks (spawn band is ringRadius ± ringWidth/2). Default 0 = exact ring. */
  ringWidth?: number
  /** Creature kind(s) to spawn in this zone. Single kind for simplicity. */
  kind: AnimalKind
  /** Max creatures of this kind to spawn per chunk overlapping the zone (density). */
  maxPerChunk: number
  /** Disposition for mobs spawned in this zone. Falls back to AnimalDef if not set. */
  dispositionOverride?: MobDisposition
  /** Max horizontal distance (blocks) from spawn point the mob can move. Leash. */
  wanderRadius?: number
}

/** Radius of the sheep zone in blocks (internal). Quest text shows "200 blocks in [direction]" to the user. */
export const SHEEP_ZONE_RADIUS = 200

/** Biomes where sheep must not spawn (e.g. ocean). Spawn logic skips these. */
export const SHEEP_FORBIDDEN_BIOMES: ReadonlySet<string> = new Set(['ocean'])

/** Author-defined creature spawn zones. Used by spawn logic to place mobs in specific areas. */
export const CREATURE_SPAWN_ZONES: CreatureSpawnZone[] = [
  {
    id: 'sheep_near_village',
    centerX: 0,
    centerZ: 0,
    radius: SHEEP_ZONE_RADIUS,
    kind: 'sheep',
    maxPerChunk: 2,
    dispositionOverride: 'neutral',
    wanderRadius: 20,
  },
]

const CHUNK_SIZE = 16

/**
 * Returns whether a circle (centerX, centerZ, radius) overlaps the given chunk AABB.
 */
function circleOverlapsChunk(
  centerX: number,
  centerZ: number,
  radius: number,
  chunkX: number,
  chunkZ: number,
): boolean {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const minX = worldX
  const maxX = worldX + CHUNK_SIZE - 1
  const minZ = worldZ
  const maxZ = worldZ + CHUNK_SIZE - 1
  const closestX = Math.max(minX, Math.min(maxX, centerX))
  const closestZ = Math.max(minZ, Math.min(maxZ, centerZ))
  const dx = centerX - closestX
  const dz = centerZ - closestZ
  return dx * dx + dz * dz <= radius * radius
}

/**
 * Returns whether the chunk AABB intersects the ring band (distance from center in [R - w/2, R + w/2]).
 */
function ringOverlapsChunk(
  centerX: number,
  centerZ: number,
  ringRadius: number,
  ringWidth: number,
  chunkX: number,
  chunkZ: number,
): boolean {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const minX = worldX
  const maxX = worldX + CHUNK_SIZE - 1
  const minZ = worldZ
  const maxZ = worldZ + CHUNK_SIZE - 1
  const inner = ringRadius - ringWidth / 2
  const outer = ringRadius + ringWidth / 2
  let minDistSq = Infinity
  let maxDistSq = 0
  for (const cx of [minX, maxX]) {
    for (const cz of [minZ, maxZ]) {
      const dx = cx - centerX
      const dz = cz - centerZ
      const dSq = dx * dx + dz * dz
      minDistSq = Math.min(minDistSq, dSq)
      maxDistSq = Math.max(maxDistSq, dSq)
    }
  }
  const innerSq = inner * inner
  const outerSq = outer * outer
  return minDistSq <= outerSq && maxDistSq >= innerSq
}

/**
 * Returns creature zones that overlap the given chunk.
 */
export function getZonesOverlappingChunk(
  chunkX: number,
  chunkZ: number,
): CreatureSpawnZone[] {
  return CREATURE_SPAWN_ZONES.filter((z) => {
    if (z.ringRadius != null) {
      const w = z.ringWidth ?? 0
      return ringOverlapsChunk(z.centerX, z.centerZ, z.ringRadius, w, chunkX, chunkZ)
    }
    return circleOverlapsChunk(z.centerX, z.centerZ, z.radius, chunkX, chunkZ)
  })
}

/**
 * Returns the set of creature kinds that are spawned by zones overlapping this chunk.
 * Biome-based spawn should skip these kinds in this chunk (zone takes precedence).
 */
export function getKindsSpawnedByZonesInChunk(
  chunkX: number,
  chunkZ: number,
): Set<AnimalKind> {
  const zones = getZonesOverlappingChunk(chunkX, chunkZ)
  return new Set(zones.map((z) => z.kind))
}

/**
 * Returns a spawn position on the ring. Only valid when zone.ringRadius is set.
 * rng() is called for angle and optional radial jitter (deterministic per call).
 */
export function getSpawnPositionOnRing(
  zone: CreatureSpawnZone,
  rng: () => number,
): { x: number; z: number } {
  const angle = rng() * 2 * Math.PI
  const width = zone.ringWidth ?? 0
  const r = zone.ringRadius! + (width > 0 ? (rng() - 0.5) * width : 0)
  return {
    x: zone.centerX + r * Math.cos(angle),
    z: zone.centerZ + r * Math.sin(angle),
  }
}

/** Pre-defined location target for UI hints (e.g. "Go North East, 500m to sheep"). */
export interface LocationHintTarget {
  /** Display label (e.g. "Sheep"). */
  label: string
  /** World X (blocks). */
  x: number
  /** World Z (blocks). */
  z: number
}

/** Deterministic angle (radians, 0 = +Z) for "where to head" for the sheep ring. Derived from WORLD_SEED. */
export function getSheepRingHintAngle(): number {
  const h = (WORLD_SEED >>> 0) * 1103515245 + 12345
  return ((h >>> 0) / 0xffffffff) * 2 * Math.PI
}

/** Cardinal direction string for the sheep ring (e.g. "North West") for quest text. */
export function getSheepRingDirection(): string {
  const angle = getSheepRingHintAngle()
  const dirAngle = Math.atan2(Math.cos(angle), Math.sin(angle))
  return angleToCardinal(dirAngle)
}

/**
 * Converts angle in radians (from center: 0 = +Z, π/2 = +X) to a cardinal direction string.
 * Use for quest text (e.g. "go south west").
 */
export function angleToCardinal(angleRad: number): string {
  const angleDeg = (angleRad * 180) / Math.PI
  const index = ((Math.round(angleDeg / 45) % 8) + 8) % 8
  return CARDINAL_DIRECTIONS[index]
}

/** Sheep zone hint point at 200 blocks in the quest direction (for any code that needs a single target). */
export const SHEEP_LOCATION_HINT: LocationHintTarget = (() => {
  const angle = getSheepRingHintAngle()
  return {
    label: 'Sheep',
    x: Math.cos(angle) * SHEEP_ZONE_RADIUS,
    z: Math.sin(angle) * SHEEP_ZONE_RADIUS,
  }
})()

const CARDINAL_DIRECTIONS = [
  'North',
  'North East',
  'East',
  'South East',
  'South',
  'South West',
  'West',
  'North West',
] as const

/**
 * Computes compass direction and horizontal distance from (px, pz) to (tx, tz).
 * Distance is in blocks; display as e.g. "500m" (1 block = 1 m).
 * Use cardinal directions in player-facing text (e.g. "go south west"); avoid phrases like "go back where you came".
 */
export function getDirectionAndDistance(
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
): { direction: string; distanceBlocks: number } {
  const dx = targetX - playerX
  const dz = targetZ - playerZ
  const distanceBlocks = Math.sqrt(dx * dx + dz * dz)
  if (distanceBlocks < 1e-6) {
    return { direction: 'here', distanceBlocks: 0 }
  }
  const angleRad = Math.atan2(dx, dz)
  const angleDeg = (angleRad * 180) / Math.PI
  const index = Math.round(angleDeg / 45) % 8
  const direction = CARDINAL_DIRECTIONS[index >= 0 ? index : index + 8]
  return { direction, distanceBlocks: Math.round(distanceBlocks) }
}

/**
 * Returns direction and distance from player to the sheep spawn zone (for HUD hint).
 */
export function getSheepLocationHint(
  playerX: number,
  playerZ: number,
): { label: string; direction: string; distanceBlocks: number } {
  const { direction, distanceBlocks } = getDirectionAndDistance(
    playerX,
    playerZ,
    SHEEP_LOCATION_HINT.x,
    SHEEP_LOCATION_HINT.z,
  )
  return { label: SHEEP_LOCATION_HINT.label, direction, distanceBlocks }
}
