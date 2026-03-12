/**
 * Pre-defined points of interest (villages, NPCs, mob areas) at fixed (x, z) coordinates
 * with optional area-theme (biome override) so the surrounding terrain looks as authored
 * without knowing procedural height in advance.
 *
 * Fixed village structures are always placed on top of the terrain surface: the structure
 * floor Y is set from getHeight(x, z). Village surface is always solid: when the center
 * would be underwater (e.g. ocean), the terrain raises the platform to at least WATER_LEVEL
 * and uses dirt in the flatten area, then transitions to the surrounding biome. When
 * placementCondition is set, the POI is skipped if the condition fails (e.g. avoidBiomes
 * or minSurfaceY at checkAt).
 */
import type { Biome } from './types'
import type { AnimalKind } from './entities/types'
import type { StructureOrigin, VillageHouseSize } from './terrain/structures/origins'
import { CHUNK_SIZE } from './constants'

/** Default radius (blocks) for POI biome override when not specified. */
export const POI_DEFAULT_BIOME_RADIUS = 48

/** Default radius (blocks) for POI terrain flatten when flatten is true. */
export const POI_DEFAULT_FLATTEN_RADIUS = 40

/** Default width (blocks) of the blend zone at the flatten area edge. */
export const POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS = 16

/** Flatten radius (blocks) for a village area (covers all houses and surroundings). */
export const VILLAGE_AREA_FLATTEN_RADIUS = 50

/** Transition width (blocks) at the village area flatten edge for a smooth blend. */
export const VILLAGE_AREA_FLATTEN_TRANSITION_BLOCKS = 24

/**
 * Single village house position within a village area. Used when PlacedVillage has houses.
 */
export interface VillageHousePosition {
  x: number
  z: number
  houseSize?: VillageHouseSize
}

/**
 * Placement condition: POI is only placed when (1) biome at checkAt is not in avoidBiomes,
 * and (2) when minSurfaceY is set, surface height at checkAt is at least minSurfaceY (so not underwater).
 */
export interface PlacementCondition {
  /** Do not place if the biome at checkAt is in this list (e.g. 'ocean'). */
  avoidBiomes: Biome[]
  /** World (x, z) to sample for the biome and surface check (e.g. village center). */
  checkAt: { x: number; z: number }
  /** Do not place if getHeight(checkAt) < minSurfaceY (e.g. WATER_LEVEL to avoid underwater). */
  minSurfaceY?: number
}

/**
 * Village: either an area (center + radius) containing multiple houses, or a single house.
 * When `houses` is set, (x, z) is the village center and radius/flatten apply to the whole area;
 * structure origins are one per entry in houses. When `houses` is omitted, (x, z) is a single
 * village house (backward compatible).
 * Structure floor Y is always getHeight(x, z) so buildings sit on the terrain surface.
 */
export interface PlacedVillage {
  type: 'village'
  /** Village center (x, z). When houses is set, this is the area center; otherwise the single house position. */
  x: number
  z: number
  /** Radius for biome override; area within this uses areaTheme. Default POI_DEFAULT_BIOME_RADIUS. */
  radius?: number
  /** Biome for the area around the village; 'inherit' = use procedural biome. */
  areaTheme?: Biome | 'inherit'
  /** Structure template; future use (e.g. 'snow' village). */
  template?: 'default' | 'snow'
  /** When true, do not spawn auto villagers for this origin; use PlacedNpc for villagers. */
  noAutoVillagers?: boolean
  /** Optional id for quest/dialogue reference (e.g. 'first_spawn_village'). */
  id?: string
  /** If set, village is only placed when biome at checkAt is not in avoidBiomes. */
  placementCondition?: PlacementCondition
  /** House size for single-house POI. Ignored when houses is set. If unset, stage5 derives from seed. */
  houseSize?: VillageHouseSize
  /**
   * When set, this POI is a village area: (x,z) is center, radius/flatten apply to the whole area,
   * and structure origins are generated from each entry (one village house per entry).
   */
  houses?: VillageHousePosition[]
  /**
   * When true or an object, terrain around the village is flattened to center height with a smooth
   * transition to surroundings. false or omitted = no flattening. For village areas, use one flatten for the whole area.
   */
  flatten?: false | true | { radius?: number; transitionBlocks?: number }
}

/** NPC (e.g. villager) at exact (x, z) or N NPCs in radius. */
export interface PlacedNpc {
  type: 'npc'
  x: number
  z: number
  /** When set, place this many NPCs deterministically in radius; otherwise single NPC at (x,z). */
  radius?: number
  count?: number
  /** If set, NPCs are only placed when biome at checkAt is not in avoidBiomes. */
  placementCondition?: PlacementCondition
  /** When set, the first spawned NPC from this POI offers these quest ids (quest giver). */
  questOfferIds?: string[]
  /** When set, this NPC only offers quests when all of these quest ids are completed. */
  prerequisiteQuestIds?: string[]
  /** Id for talk objectives; when player interacts with this NPC, notifyTalk(talkTargetId) is called. */
  talkTargetId?: string
}

/** Mob spawn area: kinds spawn within radius (deterministic per chunk). */
export interface PlacedMobArea {
  type: 'mob_area'
  x: number
  z: number
  radius: number
  kinds: AnimalKind[]
  /** Max mobs of these kinds to spawn per chunk overlapping this POI. Default 2. */
  maxPerChunk?: number
}

export type WorldPoi = PlacedVillage | PlacedNpc | PlacedMobArea

/**
 * Center (x, z) of the first spawn village. Matches spawn (0, 0) so the village is placed
 * where the player spawns and the ocean check uses the same point—village appears when
 * spawn is on land, and is skipped when spawn is ocean.
 */
export const FIRST_SPAWN_VILLAGE_CENTER = { x: 0, z: 0 } as const

/** Id for the first spawn village (quests, dialogue). */
export const FIRST_SPAWN_VILLAGE_ID = 'first_spawn_village'

/** Horizontal spacing (blocks) between house centers in the first spawn village. */
export const FIRST_SPAWN_VILLAGE_HOUSE_SPACING_X = 12
/** Vertical spacing (blocks) between house rows in the first spawn village. */
export const FIRST_SPAWN_VILLAGE_HOUSE_SPACING_Z = 12

/**
 * Builds a 5-house layout (3 in first row, 2 in second) from center and spacing.
 * Houses are placed so all overlap chunk (1,1) when center is near spawn.
 */
export function getFirstSpawnVillageHousePositions(center: { x: number; z: number }): Array<{ x: number; z: number }> {
  const sx = FIRST_SPAWN_VILLAGE_HOUSE_SPACING_X
  const sz = FIRST_SPAWN_VILLAGE_HOUSE_SPACING_Z
  return [
    { x: center.x - sx, z: center.z - sz },
    { x: center.x, z: center.z - sz },
    { x: center.x + sx, z: center.z - sz },
    { x: center.x, z: center.z + sz },
    { x: center.x + sx, z: center.z + sz },
  ]
}

/**
 * Builds the fixed POI registry for a given spawn center.
 * The first-spawn village and its quest NPCs are placed relative to this center.
 * @param center - World (x, z) spawn center used for the first-spawn POIs.
 */
export function createPoiRegistryForSpawn(center: { x: number; z: number }): WorldPoi[] {
  return [
    // First spawn village (quest line): one village area with 5 houses; single flatten for whole area to avoid sharp edges.
    // areaTheme ensures a land biome in the village so flowers, grass, and trees can spawn.
    {
      type: 'village',
      x: center.x,
      z: center.z,
      radius: VILLAGE_AREA_FLATTEN_RADIUS,
      areaTheme: 'forest',
      noAutoVillagers: true,
      id: FIRST_SPAWN_VILLAGE_ID,
      flatten: {
        radius: VILLAGE_AREA_FLATTEN_RADIUS,
        transitionBlocks: VILLAGE_AREA_FLATTEN_TRANSITION_BLOCKS,
      },
      houses: ((): VillageHousePosition[] => {
        const houseSizes: VillageHouseSize[] = ['large', 'small', 'medium', 'small', 'medium']
        return getFirstSpawnVillageHousePositions(center).map((pos, i) => ({
          x: pos.x,
          z: pos.z,
          houseSize: houseSizes[i],
        }))
      })(),
    },
    {
      type: 'npc',
      x: center.x,
      z: center.z,
      radius: 16,
      count: 7,
      questOfferIds: [
        'first_spawn_wool',
        'first_spawn_pork',
        'first_spawn_wolves',
        'discover_village',
        'speak_to_elder',
      ],
      talkTargetId: 'elder_npc',
    },
    {
      type: 'npc',
      x: center.x + FIRST_SPAWN_VILLAGE_HOUSE_SPACING_X,
      z: center.z + FIRST_SPAWN_VILLAGE_HOUSE_SPACING_Z,
      radius: 8,
      count: 1,
      questOfferIds: [
        'second_npc_planks',
        'second_npc_stones',
        'second_npc_sticks',
        'sheep_slayer',
        'wool_gatherer',
        'hunt_pigs',
        'wolf_pelts',
        'thin_the_undead',
        'skeleton_bones',
        'creeper_control',
        'coal_from_the_dead',
        'meat_and_wool',
        'hunters_trial',
        'stone_and_sticks',
        'ore_for_the_smith',
        'lumber_for_village',
      ],
      prerequisiteQuestIds: ['first_spawn_wool', 'first_spawn_pork', 'first_spawn_wolves'],
    },
  ]
}

let activePois: WorldPoi[] = createPoiRegistryForSpawn(FIRST_SPAWN_VILLAGE_CENTER)

/**
 * Returns the active POI registry used by both main thread and worker initialization.
 * Keep this stable for the lifetime of a world/seed.
 */
export function getActivePois(): WorldPoi[] {
  return activePois
}

/**
 * Sets the active POI registry (e.g. after resolving actual spawn position).
 * @param pois - The POIs to use as the global registry for this session.
 */
export function setActivePois(pois: WorldPoi[]): void {
  activePois = pois
}

/**
 * Returns the biome override for (x, z) if that point lies inside a POI with areaTheme.
 * When multiple POIs overlap, the one with smallest distance to center wins.
 * Pure function: same pois + (x,z) => same result (for worker/main consistency).
 */
export function getPoiBiomeOverride(pois: WorldPoi[], x: number, z: number): Biome | null {
  let best: { biome: Biome; distSq: number } | null = null
  for (const poi of pois) {
    const theme = poi.type === 'village' ? poi.areaTheme : undefined
    if (theme === undefined || theme === 'inherit') continue
    const cx = poi.x
    const cz = poi.z
    const r = poi.type === 'village' ? (poi.radius ?? POI_DEFAULT_BIOME_RADIUS) : 0
    const distSq = (x - cx) ** 2 + (z - cz) ** 2
    if (r * r >= distSq && (best === null || distSq < best.distSq)) {
      best = { biome: theme as Biome, distSq }
    }
  }
  return best?.biome ?? null
}

/** Result of getPoiFlattenAt: flatten applies at (x, z) with these params. */
export interface PoiFlattenAt {
  centerX: number
  centerZ: number
  radius: number
  transitionBlocks: number
}

/**
 * Returns flatten parameters for (x, z) if that point lies inside a POI with flatten enabled.
 * When multiple POIs overlap, the one with smallest distance to center wins.
 * Pure function: same pois + (x,z) => same result (for worker/main consistency).
 */
export function getPoiFlattenAt(
  pois: WorldPoi[],
  x: number,
  z: number,
): PoiFlattenAt | null {
  let best: { centerX: number; centerZ: number; radius: number; transitionBlocks: number; distSq: number } | null =
    null
  for (const poi of pois) {
    if (poi.type !== 'village') continue
    const flatten = poi.flatten
    if (flatten === false || flatten === undefined) continue
    const cx = poi.x
    const cz = poi.z
    const radius =
      typeof flatten === 'object' && flatten.radius !== undefined
        ? flatten.radius
        : POI_DEFAULT_FLATTEN_RADIUS
    const transitionBlocks =
      typeof flatten === 'object' && flatten.transitionBlocks !== undefined
        ? flatten.transitionBlocks
        : POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS
    const distSq = (x - cx) ** 2 + (z - cz) ** 2
    if (radius * radius >= distSq && (best === null || distSq < best.distSq)) {
      best = { centerX: cx, centerZ: cz, radius, transitionBlocks, distSq }
    }
  }
  if (best === null) return null
  return {
    centerX: best.centerX,
    centerZ: best.centerZ,
    radius: best.radius,
    transitionBlocks: best.transitionBlocks,
  }
}

/**
 * Returns fixed village structure origins that overlap the given chunk.
 * When a village has houses, one origin per house (if that house position overlaps the chunk).
 * Each origin's oy is set from getHeight(x, z) so the structure floor sits on top of the
 * terrain surface. When getResolvedBiome is provided and the POI has placementCondition,
 * the whole village is skipped if the condition fails (e.g. biome at checkAt in avoidBiomes).
 */
export function getFixedVillageOriginsInChunk(
  pois: WorldPoi[],
  chunkX: number,
  chunkZ: number,
  getHeight: (x: number, z: number) => number,
  getResolvedBiome?: (x: number, z: number) => Biome,
): StructureOrigin[] {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const minX = worldX - 32
  const maxX = worldX + CHUNK_SIZE + 31
  const minZ = worldZ - 32
  const maxZ = worldZ + CHUNK_SIZE + 31
  const out: StructureOrigin[] = []
  for (const poi of pois) {
    if (poi.type !== 'village') continue
    const { noAutoVillagers, placementCondition } = poi
    if (placementCondition != null) {
      const { checkAt, avoidBiomes, minSurfaceY } = placementCondition
      if (getResolvedBiome != null && avoidBiomes.includes(getResolvedBiome(checkAt.x, checkAt.z)))
        continue
      if (minSurfaceY != null && Math.floor(getHeight(checkAt.x, checkAt.z)) < minSurfaceY) continue
    }
    if (poi.houses != null && poi.houses.length > 0) {
      for (const house of poi.houses) {
        if (house.x < minX || house.x > maxX || house.z < minZ || house.z > maxZ) continue
        const oy = Math.floor(getHeight(house.x, house.z))
        out.push({
          ox: house.x,
          oz: house.z,
          oy,
          type: 'village',
          noAutoVillagers,
          houseSize: house.houseSize,
        })
      }
    } else {
      const { x, z, houseSize } = poi
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue
      const oy = Math.floor(getHeight(x, z))
      out.push({ ox: x, oz: z, oy, type: 'village', noAutoVillagers, houseSize })
    }
  }
  return out
}

/** Single fixed spawn: kind at (x, z); Y is resolved by caller via getSurfaceY. */
export interface FixedSpawn {
  kind: AnimalKind
  x: number
  z: number
  /** When set, this NPC is a quest giver offering these quest ids (only first spawn per POI gets it). */
  questOfferIds?: string[]
  /** When set, this quest giver only offers quests when all of these quest ids are completed. */
  prerequisiteQuestIds?: string[]
  /** Id for talk objectives; when player interacts with this NPC, notifyTalk(talkTargetId) is called. */
  talkTargetId?: string
}

/** Deterministic RNG from string seed. */
function makeSeededRng(seed: string): () => number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i)
  let state = (h >>> 0) % 0x7fffffff || 1
  return () => {
    state = Math.imul(state, 1103515245) + 12345
    return ((state >>> 0) % 0x7fffffff) / 0x7fffffff
  }
}

/**
 * Returns fixed NPC and mob spawns that belong to the given chunk.
 * Caller must resolve Y with getColumnSurfaceY(x, z) and create entities.
 * When placementCondition is set, spawns are skipped if avoidBiomes match or (when getHeight provided) surface at checkAt is below minSurfaceY.
 * When worldSeed is provided, NPC positions for radius+count POIs are generated with a global seed so that exactly one NPC per POI gets questOfferIds (the globally first, i=0).
 */
export function getFixedSpawnsInChunk(
  pois: WorldPoi[],
  chunkKey: string,
  chunkX: number,
  chunkZ: number,
  getResolvedBiome?: (x: number, z: number) => Biome,
  getHeight?: (x: number, z: number) => number,
  worldSeed?: number,
): FixedSpawn[] {
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const minX = worldX
  const maxX = worldX + CHUNK_SIZE - 1
  const minZ = worldZ
  const maxZ = worldZ + CHUNK_SIZE - 1
  const out: FixedSpawn[] = []

  for (const poi of pois) {
    if (poi.type === 'npc') {
      if (poi.placementCondition != null) {
        const { checkAt, avoidBiomes, minSurfaceY } = poi.placementCondition
        if (
          getResolvedBiome != null &&
          avoidBiomes.includes(getResolvedBiome(checkAt.x, checkAt.z))
        )
          continue
        if (
          minSurfaceY != null &&
          getHeight != null &&
          Math.floor(getHeight(checkAt.x, checkAt.z)) < minSurfaceY
        )
          continue
      }
      if (poi.radius != null && poi.count != null && poi.count > 0) {
        const npcSeed =
          worldSeed != null
            ? `npc-${worldSeed}-${poi.x}-${poi.z}`
            : `${chunkKey}-npc-${poi.x}-${poi.z}`
        const rng = makeSeededRng(npcSeed)
        for (let i = 0; i < poi.count; i++) {
          const dx = (rng() * 2 - 1) * poi.radius
          const dz = (rng() * 2 - 1) * poi.radius
          const x = Math.floor(poi.x + dx)
          const z = Math.floor(poi.z + dz)
          if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
            const questOfferIds =
              i === 0 && poi.questOfferIds != null && poi.questOfferIds.length > 0
                ? poi.questOfferIds
                : undefined
            const prerequisiteQuestIds =
              questOfferIds != null && poi.prerequisiteQuestIds != null && poi.prerequisiteQuestIds.length > 0
                ? poi.prerequisiteQuestIds
                : undefined
            const talkTargetId = i === 0 ? poi.talkTargetId : undefined
            out.push({
              kind: 'villager',
              x,
              z,
              ...(questOfferIds != null ? { questOfferIds } : {}),
              ...(prerequisiteQuestIds != null ? { prerequisiteQuestIds } : {}),
              ...(talkTargetId != null ? { talkTargetId } : {}),
            })
          }
        }
      } else {
        const x = Math.floor(poi.x)
        const z = Math.floor(poi.z)
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
          const questOfferIds =
            poi.questOfferIds != null && poi.questOfferIds.length > 0 ? poi.questOfferIds : undefined
          const prerequisiteQuestIds =
            poi.prerequisiteQuestIds != null && poi.prerequisiteQuestIds.length > 0
              ? poi.prerequisiteQuestIds
              : undefined
          const talkTargetId = poi.talkTargetId
          out.push({
            kind: 'villager',
            x,
            z,
            ...(questOfferIds != null ? { questOfferIds } : {}),
            ...(prerequisiteQuestIds != null ? { prerequisiteQuestIds } : {}),
            ...(talkTargetId != null ? { talkTargetId } : {}),
          })
        }
      }
      continue
    }

    if (poi.type === 'mob_area') {
      const maxPerChunk = poi.maxPerChunk ?? 2
      const rng = makeSeededRng(`${chunkKey}-mob-${poi.x}-${poi.z}`)
      const count = Math.floor(rng() * (maxPerChunk + 1))
      for (let i = 0; i < count && poi.kinds.length > 0; i++) {
        const dx = (rng() * 2 - 1) * poi.radius
        const dz = (rng() * 2 - 1) * poi.radius
        const x = Math.floor(poi.x + dx)
        const z = Math.floor(poi.z + dz)
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
          const kind = poi.kinds[Math.floor(rng() * poi.kinds.length)]
          out.push({ kind, x, z })
        }
      }
    }
  }

  return out
}
