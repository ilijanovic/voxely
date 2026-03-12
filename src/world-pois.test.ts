/**
 * Tests for world-pois: getPoiFlattenAt, getFixedVillageOriginsInChunk, default constants, and flatten config.
 */
import { describe, it, expect } from 'vitest'
import {
  getPoiFlattenAt,
  getFixedVillageOriginsInChunk,
  getFixedSpawnsInChunk,
  getFirstSpawnVillageHousePositions,
  FIRST_SPAWN_VILLAGE_CENTER,
  POI_DEFAULT_FLATTEN_RADIUS,
  POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS,
  VILLAGE_AREA_FLATTEN_RADIUS,
  VILLAGE_AREA_FLATTEN_TRANSITION_BLOCKS,
  POI_REGISTRY,
  type WorldPoi,
} from './world-pois'

describe('getPoiFlattenAt', () => {
  it('returns null when pois is empty', () => {
    expect(getPoiFlattenAt([], 0, 0)).toBeNull()
  })

  it('returns null for village with flatten false', () => {
    const pois: WorldPoi[] = [
      { type: 'village', x: 0, z: 0, flatten: false },
    ]
    expect(getPoiFlattenAt(pois, 0, 0)).toBeNull()
  })

  it('returns null for village with no flatten option', () => {
    const pois: WorldPoi[] = [{ type: 'village', x: 0, z: 0 }]
    expect(getPoiFlattenAt(pois, 0, 0)).toBeNull()
  })

  it('returns default radius and transitionBlocks for village with flatten true', () => {
    const pois: WorldPoi[] = [{ type: 'village', x: 10, z: 20, flatten: true }]
    const result = getPoiFlattenAt(pois, 10, 20)
    expect(result).not.toBeNull()
    expect(result).toEqual({
      centerX: 10,
      centerZ: 20,
      radius: POI_DEFAULT_FLATTEN_RADIUS,
      transitionBlocks: POI_DEFAULT_FLATTEN_TRANSITION_BLOCKS,
    })
  })

  it('returns custom radius and transitionBlocks for flatten object', () => {
    const pois: WorldPoi[] = [
      {
        type: 'village',
        x: 0,
        z: 0,
        flatten: { radius: 30, transitionBlocks: 10 },
      },
    ]
    const result = getPoiFlattenAt(pois, 0, 0)
    expect(result).not.toBeNull()
    expect(result).toEqual({
      centerX: 0,
      centerZ: 0,
      radius: 30,
      transitionBlocks: 10,
    })
  })

  it('returns null when point is outside POI flatten radius', () => {
    const pois: WorldPoi[] = [
      { type: 'village', x: 0, z: 0, flatten: { radius: 20 } },
    ]
    expect(getPoiFlattenAt(pois, 0, 0)).not.toBeNull()
    expect(getPoiFlattenAt(pois, 21, 0)).toBeNull()
    expect(getPoiFlattenAt(pois, 0, 21)).toBeNull()
  })

  it('when two POIs overlap, the one closer to (x,z) wins', () => {
    const pois: WorldPoi[] = [
      { type: 'village', x: 0, z: 0, flatten: true },
      { type: 'village', x: 50, z: 50, flatten: { radius: 60 } },
    ]
    // (5, 5) is closer to (0,0): distSq 50; to (50,50): distSq 4050
    const result = getPoiFlattenAt(pois, 5, 5)
    expect(result).not.toBeNull()
    expect(result!.centerX).toBe(0)
    expect(result!.centerZ).toBe(0)
    // (40, 40) is closer to (50,50): distSq 200; to (0,0): distSq 3200
    const result2 = getPoiFlattenAt(pois, 40, 40)
    expect(result2).not.toBeNull()
    expect(result2!.centerX).toBe(50)
    expect(result2!.centerZ).toBe(50)
  })

  it('ignores non-village POIs', () => {
    const pois: WorldPoi[] = [
      { type: 'npc', x: 0, z: 0 },
      { type: 'mob_area', x: 0, z: 0, radius: 32, kinds: [] },
    ]
    expect(getPoiFlattenAt(pois, 0, 0)).toBeNull()
  })

  it('returns one flatten circle at village center for village with houses', () => {
    const pois: WorldPoi[] = [
      {
        type: 'village',
        x: FIRST_SPAWN_VILLAGE_CENTER.x,
        z: FIRST_SPAWN_VILLAGE_CENTER.z,
        flatten: {
          radius: VILLAGE_AREA_FLATTEN_RADIUS,
          transitionBlocks: VILLAGE_AREA_FLATTEN_TRANSITION_BLOCKS,
        },
        houses: getFirstSpawnVillageHousePositions(FIRST_SPAWN_VILLAGE_CENTER).map((pos) => ({
          x: pos.x,
          z: pos.z,
        })),
      },
    ]
    const result = getPoiFlattenAt(pois, 0, 0)
    expect(result).not.toBeNull()
    expect(result).toEqual({
      centerX: FIRST_SPAWN_VILLAGE_CENTER.x,
      centerZ: FIRST_SPAWN_VILLAGE_CENTER.z,
      radius: VILLAGE_AREA_FLATTEN_RADIUS,
      transitionBlocks: VILLAGE_AREA_FLATTEN_TRANSITION_BLOCKS,
    })
    expect(getPoiFlattenAt(pois, 10, 10)).not.toBeNull()
    expect(getPoiFlattenAt(pois, 10, 10)!.centerX).toBe(FIRST_SPAWN_VILLAGE_CENTER.x)
  })
})

describe('getFixedVillageOriginsInChunk', () => {
  const mockGetHeight = (x: number, z: number) => 64 + (x + z) % 3

  it('returns one origin per house when village has houses', () => {
    const housePositions = getFirstSpawnVillageHousePositions(FIRST_SPAWN_VILLAGE_CENTER)
    const pois: WorldPoi[] = [
      {
        type: 'village',
        x: FIRST_SPAWN_VILLAGE_CENTER.x,
        z: FIRST_SPAWN_VILLAGE_CENTER.z,
        noAutoVillagers: true,
        houses: housePositions.map((pos, i) => ({
          x: pos.x,
          z: pos.z,
          houseSize: (['large', 'small', 'medium', 'small', 'medium'] as const)[i],
        })),
      },
    ]
    const origins = getFixedVillageOriginsInChunk(pois, 1, 1, mockGetHeight)
    expect(origins).toHaveLength(5)
    expect(origins.every((o) => o.type === 'village')).toBe(true)
    expect(origins.every((o) => o.noAutoVillagers === true)).toBe(true)
    const oxOz = origins.map((o) => ({ x: o.ox, z: o.oz }))
    for (const pos of housePositions) {
      expect(oxOz).toContainEqual({ x: pos.x, z: pos.z })
    }
    const sizes = origins.map((o) => o.houseSize)
    expect(sizes).toEqual(['large', 'small', 'medium', 'small', 'medium'])
  })

  it('returns single origin for village without houses', () => {
    const pois: WorldPoi[] = [
      { type: 'village', x: 20, z: 20, houseSize: 'medium' },
    ]
    const origins = getFixedVillageOriginsInChunk(pois, 1, 1, mockGetHeight)
    expect(origins).toHaveLength(1)
    expect(origins[0]).toMatchObject({ ox: 20, oz: 20, type: 'village', houseSize: 'medium' })
  })

  it('first spawn POI registry yields 5 village origins for overlapping chunk', () => {
    const origins = getFixedVillageOriginsInChunk(
      POI_REGISTRY,
      1,
      1,
      mockGetHeight,
    )
    const villageOrigins = origins.filter((o) => o.type === 'village')
    expect(villageOrigins).toHaveLength(5)
    const housePositions = getFirstSpawnVillageHousePositions(FIRST_SPAWN_VILLAGE_CENTER)
    const oxOz = villageOrigins.map((o) => ({ x: o.ox, z: o.oz }))
    for (const pos of housePositions) {
      expect(oxOz).toContainEqual({ x: pos.x, z: pos.z })
    }
  })
})

describe('getFixedSpawnsInChunk', () => {
  const WORLD_SEED_FOR_TEST = 42

  /**
   * With worldSeed, NPC positions are global: only the single spawn at index 0 for each POI gets questOfferIds.
   * Collect spawns from all chunks that overlap the first-spawn village NPC POIs and assert exactly one quest giver per POI.
   */
  it('with worldSeed yields exactly one quest giver per NPC POI across overlapping chunks', () => {
    const npcPois = POI_REGISTRY.filter((p): p is WorldPoi & { type: 'npc' } => p.type === 'npc')
    const questOfferIdsByPoi = npcPois
      .filter((p) => p.questOfferIds != null && p.questOfferIds.length > 0)
      .map((p) => p.questOfferIds!.slice(0))

    const questGiverSpawnKeys = new Set<string>()
    const minChunk = -2
    const maxChunk = 2
    for (let cx = minChunk; cx <= maxChunk; cx++) {
      for (let cz = minChunk; cz <= maxChunk; cz++) {
        const chunkKey = `${cx},${cz}`
        const spawns = getFixedSpawnsInChunk(
          POI_REGISTRY,
          chunkKey,
          cx,
          cz,
          undefined,
          undefined,
          WORLD_SEED_FOR_TEST,
        )
        for (const s of spawns) {
          if (s.questOfferIds != null && s.questOfferIds.length > 0) {
            questGiverSpawnKeys.add(`${s.x},${s.z}`)
          }
        }
      }
    }

    expect(questGiverSpawnKeys.size).toBe(questOfferIdsByPoi.length)
  })
})
