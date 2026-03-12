import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import type { BlockType, ChunkData, BlockPos } from './types'
export type { BlockType }
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  WATER_BLOCK_HEIGHT,
  WATER_SPREAD_INTERVAL_SEC,
  SPAWN_X,
  SPAWN_Z,
  SPAWN_ABOVE_CAVE_DEBUG,
  WORLD_HEIGHT,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
  BLOCK_OUTLINE_COLOR,
  BLOCK_OUTLINE_SCALE,
  ENTITY_ATTACK_DISTANCE,
  HURT_FLASH_DURATION_SECONDS,
  KNOCKBACK_HORIZONTAL_SPEED,
  KNOCKBACK_VERTICAL_SPEED,
  DAMAGE_PER_SLASH,
  WEAPON_BASE_DAMAGE,
  MAX_LEVEL,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_HUNGER,
  shouldFillBrokenBlockWithWater,
  FOG_NEAR_CHUNK_FACTOR,
  FOG_FAR_CHUNK_FACTOR,
  MAP_DISCOVER_RADIUS_CHUNKS,
  TOTAL_PERSISTENT_SLOTS,
  MAX_STACK_SIZE,
  AUTOSAVE_INTERVAL_MS,
} from './constants'
import {
  getSelectedBlockType,
  setHotbarIndex,
  updateHotbarSelection,
  setOnHotbarChange,
  getSelectedHotbarIndex,
  notifyHotbarChange,
  getSelectedSlotCount,
  consumeOneFromSelectedSlot,
} from './game-hotbar'
import {
  resolveVoxelCollisions,
  PLAYER_HALF,
  PLAYER_HEIGHT,
  DEBUG_COLLISION,
  type CollisionDebug,
} from './game-collision'
import {
  WORLD_SEED,
  getHeight,
  getResolvedBiome,
  getSurfaceY,
  getColumnSurfaceY,
  findSpawnInBiome,
  findSpawnAboveCave,
  SPAWN_BIOME,
  SPAWNABLE_BIOMES,
} from './game-terrain'
export type { Biome } from './game-terrain'
export { getSelectedBlockType } from './game-hotbar'
export { resolveVoxelCollisions, type CollisionResult, type CollisionDebug } from './game-collision'
import {
  getShadowsEnabled,
  getFovNormal,
  getFovSprint,
  getPointerSpeed,
  getPointerSpeedSprint,
  getShadowMapSize,
  getShadowMapType,
  getRenderDistance,
  getToneMappingEnabled,
  getToneMappingExposure,
  getBloomEnabled,
  getBloomStrength,
  getBloomRadius,
  getBloomThreshold,
} from './graphics-settings'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { syncTerrainFogFromSceneFog } from './terrain-fog'
import { getKeyBinding, type KeyAction } from './key-settings'
import { initMultiplayer, updateMultiplayer, addSystemMessage } from './multiplayer'
import { setWorldApi } from './world-api'
import { spawnEntitiesForChunk } from './entities/spawn'
import { updateMovement } from './entities/movement'
import { updateAI, FLEE_DURATION_AFTER_HIT } from './entities/ai'
import { updateAnimation } from './entities/animation'
import { updateHurtFlash } from './entities/hurt-flash.ts'
import { removeEntity, getAllEntities } from './entities/registry'
import { raycastEntities } from './entities/entity-hit'
import { updateAllQuestNpcIcons } from './entities/quest-npc-icon'
import {
  isSolidBlock as isBlockTypeSolid,
  isPlaceableBlock,
  isReplaceableByPlacement,
  isStairsBlock,
  getPlacedStairsId,
  type StairFacing,
  type StairsHalf,
  getBlockCollisionBoxesLocal,
  isUnbreakableBlock,
  getBlockBreakTimeWithTool,
  getBlockDefinition,
  getBlockTextureNames,
  getBlockHeight,
  getItemTextureName,
  isWeapon,
  getWeaponType,
  isFenceBlock,
} from './block-registry'
import { loadTextureSafe, loadItemTextureSafe, setPixelFilter } from './block-materials'
import {
  getPersistentSlots,
  setPersistentSlots,
  initDefaultInventory,
  ensureSwordInHotbar,
  addItem,
  getTotalCountForBlockType,
} from './inventory'
import {
  SAVE_VERSION,
  saveToStorage,
  loadFromStorage,
  VALID_BLOCK_TYPES,
  type SaveData,
} from './save'
import {
  writeHeightmap,
  getCachedHeightmap,
  getCachedBiomeMap,
  preloadHeightmaps,
  clearDiscoveredHeightmapCache,
} from './discovered-heightmaps'
import type { Faction, PlayerClass } from './player/faction'
import { DEFAULT_FACTION, DEFAULT_CLASS } from './player/faction'
import {
  getEquipped,
  getEquipmentForSave,
  setEquipmentFromSave,
} from './equipment'
export { getEquipped, getEquipmentForSave } from './equipment'
import { getFirstSkillForClass } from './player/skills'
import { addExperience as addExperienceFn, getXpDropForArea } from './experience'
import { getAreaAt } from './world-areas'
import { addGold, getGold, setGold } from './gold'
import {
  getDefaultCharacterStats,
  getEffectiveStat,
  normaliseCharacterStats,
  type CharacterStats,
  type StatId,
} from './character-stats'
export type { CharacterStats, StatId } from './character-stats'
export { ALL_STAT_IDS } from './character-stats'
import { rollLoot } from './loot-tables'
import {
  getQuestStateForSave,
  setQuestStateFromSave,
  notifyKill as notifyQuestKill,
  notifyTalk as notifyQuestTalk,
  turnInQuest,
  refreshCollectObjectives,
} from './quests/quest-state'
import { initMaterialsAndColormaps as initMaterialsAndColormapsSystem } from './game/init/materials'
import { initSceneAndRenderer as initSceneAndRendererSystem } from './game/init/scene'
import { initLightsAndSky as initLightsAndSkySystem } from './game/init/lights-sky'
import {
  createTerrainDebugOverlay as createTerrainDebugOverlaySystem,
  createTerrainDebugState,
  toggleTerrainDebug,
  updateTerrainDebugOverlay as updateTerrainDebugOverlaySystem,
  type TerrainDebugState,
} from './game/debug/terrain-debug'
import {
  getDayTime,
  setDayTime,
  getSunDirection,
  updateAtmosphere,
  SUN_DISTANCE,
  type AtmosphereContext,
} from './atmosphere'
import { createSnowEffect, type SnowEffect } from './snow-effect'
import { registerCommand } from './debug-commands'
import {
  chunks,
  blockModifications,
  columnHeightCache,
  chunkKey,
  chunkKeyNumeric,
  blockKeyNumeric,
  localKey,
  decodeLocalKey,
  blockKeyString,
  invalidateColumnHeight,
  getBlockAt,
  getBlockModsForChunk,
} from './chunk-runtime'
import { isWaterBlock, getWaterLevel, computeWaterSpread } from './game/fluid/water-flow'
import { isOccludingBlock as isBlockTypeOccluding } from './block-registry'
import { isPendingSpawnReady } from './game/player/pending-spawn'
import { RaycastMeshCache } from './game/chunks/raycast-cache'
import { initChunkWorkerClient, type ChunkWorkerClient } from './game/chunks/chunk-worker-client'
import { createPoiRegistryForSpawn, getActivePois, setActivePois } from './world-pois'
import { applyChunkPayload as applyChunkPayloadToScene } from './game/chunks/chunk-apply'
import { updateChunks as updateChunksFromModule } from './game/chunks/chunk-manager'
import {
  generateChunk as generateChunkSync,
  breakBlock as breakBlockSync,
  unloadChunk as unloadChunkSync,
  getBlockWorldPosition as getBlockWorldPositionSync,
  placeTorch as placeTorchSync,
  getRaycastMeshes as getRaycastMeshesSync,
  refreshChunkVisibleMeshes,
  tryUpdateSnowAccumulation,
  type ChunkSyncContext,
} from './game/chunks/chunk-generate-sync'
import {
  updateDropsAndPickup as updateDropsAndPickupSystem,
  spawnDrop as spawnDropItem,
  spawnXpDrop as spawnXpDropItem,
  DEFAULT_MAGNET_RADIUS,
  DEFAULT_MAGNET_SPEED,
  type Drop,
} from './game/world-interactions/drops'
import {
  createTorchGroup,
  applyTorchShadowSettingsToPlacedTorches,
  removeTorchAt,
  type PlacedTorch,
  quantizeAxisNormal,
  removeTorchesInChunk,
} from './game/world-interactions/torches'
import {
  canSupportTorch,
} from './game/world-interactions/torches'

/**
 * Returns true if the given block type is a torch (floor) or wall torch variant.
 */
function isTorchLikeBlockType(t: BlockType): boolean {
  return t === 'torch' || /^wall_torch_(north|east|south|west)$/.test(t)
}

/**
 * Gets the attachment normal for a torch-like block type.
 * @throws when called with a non-torch block type.
 */
function getTorchNormalFromTorchLikeBlockType(t: BlockType): { x: number; y: number; z: number } {
  if (t === 'torch') return { x: 0, y: 1, z: 0 }
  if (t === 'wall_torch_east') return { x: 1, y: 0, z: 0 }
  if (t === 'wall_torch_west') return { x: -1, y: 0, z: 0 }
  if (t === 'wall_torch_south') return { x: 0, y: 0, z: 1 }
  if (t === 'wall_torch_north') return { x: 0, y: 0, z: -1 }
  throw new Error(`Expected torch-like block type, got: ${t}`)
}
import { createPlayerMeshOnly, createPOVShadowBody } from './game/player/player-mesh'
export { createPlayerMeshOnly } from './game/player/player-mesh'

/** Returns current player level (1..MAX_LEVEL) for UI. */
export function getPlayerLevel(): number {
  return playerLevel
}

/** Returns current player faction (Covenant / Legion) for UI. */
export function getPlayerFaction(): Faction {
  return playerFaction
}

/** Returns current player class (e.g. warrior) for UI. */
export function getPlayerClass(): PlayerClass {
  return playerClass
}

/** Sets player faction (e.g. for character creation). Takes effect immediately and on next save. */
export function setPlayerFaction(faction: Faction): void {
  playerFaction = faction
}

/** Sets player class (e.g. for character creation). Takes effect immediately and on next save. */
export function setPlayerClass(cls: PlayerClass): void {
  playerClass = cls
}

/** Returns remaining cooldown in seconds for a skill (0 when ready). Used for UI skill bar. */
export function getSkillCooldownRemaining(skillId: string): number {
  return skillCooldowns[skillId] ?? 0
}

/** Returns current XP toward next level for UI. */
export function getPlayerExperience(): number {
  return playerExperience
}

/**
 * Turns in a completed quest and applies rewards (XP and items to inventory).
 * Call from Quest Log when player clicks "Turn in". For quests with rewardChoices, pass the chosen index.
 * @returns true if quest was turned in, false otherwise
 */
export function claimQuestReward(questId: string, rewardChoiceIndex?: number): boolean {
  const result = turnInQuest(questId, getPlayerClass(), rewardChoiceIndex)
  if (!result) return false
  if (result.xp > 0) {
    const next = addExperienceFn(playerLevel, playerExperience, result.xp)
    playerLevel = next.level
    playerExperience = next.experience
  }
  if (result.gold > 0) addGold(result.gold)
  for (const { type, count } of result.items) {
    addItem(type as BlockType, count)
  }
  return true
}

/**
 * Refreshes collect objectives from current inventory. Call when inventory changes (e.g. after pickup).
 */
export function refreshQuestCollectObjectives(): void {
  refreshCollectObjectives((item) => getTotalCountForBlockType(item))
}

/** Returns current player position for UI (e.g. location hints). Safe before init (returns 0,0,0). */
export function getPlayerPosition(): { x: number; y: number; z: number } {
  if (typeof player === 'undefined') return { x: 0, y: 0, z: 0 }
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
  }
}

/** Returns player look yaw in radians (0 = North / -Z, π/2 = East / +X). For compass UI. */
export function getPlayerYaw(): number {
  if (typeof lastLookYaw === 'undefined') return 0
  return lastLookYaw
}

/** Returns current player health (0..PLAYER_MAX_HEALTH) for UI. */
export function getPlayerHealth(): number {
  return playerHealth
}

/** Returns maximum player health for UI. */
export function getPlayerMaxHealth(): number {
  return PLAYER_MAX_HEALTH
}

/** Returns current player hunger (0..PLAYER_MAX_HUNGER) for UI. */
export function getPlayerHunger(): number {
  return playerHunger
}

/** Returns maximum player hunger for UI. */
export function getPlayerMaxHunger(): number {
  return PLAYER_MAX_HUNGER
}

/**
 * Sets player health, clamped to 0..PLAYER_MAX_HEALTH. For future damage/healing.
 */
export function setPlayerHealth(value: number): void {
  playerHealth = Math.max(0, Math.min(PLAYER_MAX_HEALTH, Math.round(value)))
}

/**
 * Sets player hunger, clamped to 0..PLAYER_MAX_HUNGER. For future food/hunger decay.
 */
export function setPlayerHunger(value: number): void {
  playerHunger = Math.max(0, Math.min(PLAYER_MAX_HUNGER, Math.round(value)))
}

/** Returns base character stats (WoW-style). Equipment bonuses not included; use getPlayerStat for effective value. */
export function getPlayerBaseStats(): CharacterStats {
  return { ...playerBaseStats }
}

/**
 * Returns effective value for a character stat (base + equipment bonus). For now only base is used; later armor can add e.g. +5 agility.
 */
export function getPlayerStat(statId: StatId): number {
  return getEffectiveStat(playerBaseStats, undefined, statId)
}

/** State snapshot for minimap and full map UI: player position/rotation and discovered chunk tiles with heightmaps. */
export interface MapState {
  playerX: number
  playerZ: number
  playerRotationY: number
  discoveredChunkKeys: number[]
  chunkTiles: Array<{
    cx: number
    cz: number
    heightmapBuffer: Float32Array
    biomeMapBuffer?: Uint8Array
  }>
}

/**
 * Returns current map state for minimap and full map overlay.
 * @returns Player X/Z, yaw, discovered chunk keys, and heightmap tiles for loaded discovered chunks. Safe to call before game init (returns default with empty data).
 */
export function getMapState(): MapState {
  if (typeof player === 'undefined') {
    return {
      playerX: 0,
      playerZ: 0,
      playerRotationY: 0,
      discoveredChunkKeys: [],
      chunkTiles: [],
    }
  }
  const chunkTiles: MapState['chunkTiles'] = []
  for (const keyNum of discoveredChunkKeys) {
    const data = chunks.get(keyNum)
    const heightmapBuffer = data?.heightmapBuffer ?? getCachedHeightmap(keyNum)
    if (!heightmapBuffer) continue
    const biomeMapBuffer = data?.biomeMapBuffer ?? getCachedBiomeMap(keyNum)
    const cx = data ? data.cx : (keyNum >> 16) | 0
    const cz = data ? data.cz : (keyNum << 16) >> 16
    chunkTiles.push({ cx, cz, heightmapBuffer, biomeMapBuffer })
  }
  return {
    playerX: player.position.x,
    playerZ: player.position.z,
    playerRotationY: lastLookYaw,
    discoveredChunkKeys: Array.from(discoveredChunkKeys),
    chunkTiles,
  }
}

import { updateChunkFrustumVisibility } from './game/render/frustum-visibility'

/**
 * game.ts – Main game orchestration
 *
 * Responsibilities: init/orchestration, chunk worker + mesh building, player + controls,
 * input state, block break/place, drops, torches, resolveVoxelCollisions, render loop.
 *
 * Init order: initMaterialsAndColormaps → initSceneAndRenderer → initLightsAndSky
 * → initChunkWorker → initPlayerAndWorldApi → initControlsAndInput → animate().
 *
 * Animate order each frame: updateFPSAndSpawn → updateDayCycleAndAtmosphere
 * → updateChunkVisibility → updateMovementAndCollision → updateCameraAndViewMode
 * → updateDropsAndPickup → updateBlockBreakAndPlace → updateShadowAndRender.
 *
 * Extracted modules: save, block-materials, atmosphere, chunk-runtime,
 * game-hotbar, game-collision, game-terrain.
 */

/** Cached grass colormap pixel data; set once at init. */
let grassColormapData: ImageData | null = null

/** Cached foliage colormap pixel data; set once at init. */
let foliageColormapData: ImageData | null = null

/** Material for tall grass on top of grass blocks (cross sprite). Set in init if texture loads. */
let tallGrassMaterial: THREE.MeshStandardMaterial | null = null

// ================= BIOMES / TERRAIN / TREES (see game-terrain.ts) =================

// ================= AUTOSAVE (localStorage) =================

/** Pending camera orientation from load; applied once after PointerLockControls is created. */
let loadedRotationY: number | null = null
let loadedLookPitch: number | null = null

/** Player level (1..MAX_LEVEL). Persisted in save. */
let playerLevel = 1
/** Current XP toward next level. Persisted in save. */
let playerExperience = 0
/** Player health (0..PLAYER_MAX_HEALTH). Persisted in save. */
let playerHealth = PLAYER_MAX_HEALTH
/** Player hunger/food level (0..PLAYER_MAX_HUNGER). Persisted in save. */
let playerHunger = PLAYER_MAX_HUNGER
/** Base character stats (WoW-style). Persisted in save. Equipment bonuses applied later via getPlayerStat. */
let playerBaseStats: CharacterStats = getDefaultCharacterStats()
/** Player faction (Covenant / Legion). Persisted in save. */
let playerFaction: Faction = DEFAULT_FACTION
/** Player class (e.g. warrior). Persisted in save. */
let playerClass: PlayerClass = DEFAULT_CLASS

/**
 * Builds the player slice of SaveData from current position, look angles, and level/XP.
 * Used by saveGame and by multiplayer state sync.
 * @returns Player position (x,y,z), rotationY (yaw), lookPitch, level, experience
 */
function getPlayerState(): SaveData['player'] {
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    rotationY: lastLookYaw,
    lookPitch: lastLookPitch,
    level: playerLevel,
    experience: playerExperience,
    gold: getGold(),
    health: playerHealth,
    hunger: playerHunger,
    stats: { ...playerBaseStats },
    faction: playerFaction,
    class: playerClass,
    equipment: getEquipmentForSave(),
  }
}

/**
 * Serializes current world and player state to localStorage (block mods, torches, day time, snow override).
 * No-op if scene or player not yet initialized.
 */
function saveGame(): void {
  if (!scene || !player) return
  const removedBlocks: Array<{ x: number; y: number; z: number }> = []
  const placedBlocks: Array<{
    x: number
    y: number
    z: number
    type: BlockType
  }> = []
  for (const [strKey, value] of blockModifications) {
    const parts = strKey.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    const z = Number(parts[2])
    if (value === 'air') removedBlocks.push({ x, y, z })
    else placedBlocks.push({ x, y, z, type: value })
  }
  const questState = getQuestStateForSave()
  const state: SaveData = {
    saveVersion: SAVE_VERSION,
    worldSeed: WORLD_SEED,
    player: getPlayerState(),
    removedBlocks,
    placedBlocks,
    placedTorches: placedTorches.map((t) => ({
      x: t.bx,
      y: t.by,
      z: t.bz,
      ...(t.nx !== undefined && t.ny !== undefined && t.nz !== undefined
        ? { nx: t.nx, ny: t.ny, nz: t.nz }
        : {}),
    })),
    dayTime: getDayTime() % 1,
    snowForced: snowEffect?.getForced?.() ?? undefined,
    inventory: getPersistentSlots(),
    activeQuests: questState.activeQuests,
    completedQuestIds: questState.completedQuestIds,
    trackedQuestIds: questState.trackedQuestIds,
    discoveredChunkKeys: Array.from(discoveredChunkKeys),
  }
  saveToStorage(state)
}

/**
 * Loads save from localStorage and applies it: block mods, torches, player position/rotation, day time, snow.
 * Only applies if world seed matches; preloads chunks around saved player position before placing player.
 * @returns true if a valid save was loaded and applied, false otherwise
 */
function loadGame(): boolean {
  const data = loadFromStorage()
  if (!data) {
    setGold(0)
    playerHealth = PLAYER_MAX_HEALTH
    playerHunger = PLAYER_MAX_HUNGER
    playerBaseStats = getDefaultCharacterStats()
    playerFaction = DEFAULT_FACTION
    playerClass = DEFAULT_CLASS
    setEquipmentFromSave(undefined, VALID_BLOCK_TYPES)
    initDefaultInventory()
    discoveredChunkKeys.clear()
    clearDiscoveredHeightmapCache()
    return false
  }
  if (data.worldSeed !== WORLD_SEED) return false

  const {
    x: playerX,
    y: playerY,
    z: playerZ,
    rotationY,
    lookPitch,
  } = data.player

  if (
    !Number.isFinite(playerX) ||
    !Number.isFinite(playerY) ||
    !Number.isFinite(playerZ) ||
    !Number.isFinite(rotationY) ||
    !Number.isFinite(lookPitch)
  ) {
    return false
  }

  for (const { x, y, z } of data.removedBlocks ?? []) {
    blockModifications.set(blockKeyString(x, y, z), 'air')
    invalidateColumnHeight(x, z)
  }
  for (const b of data.placedBlocks ?? []) {
    if (VALID_BLOCK_TYPES.has(b.type)) {
      blockModifications.set(blockKeyString(b.x, b.y, b.z), b.type as BlockType)
      invalidateColumnHeight(b.x, b.z)
    }
  }

  if (typeof torchContainer !== 'undefined') {
    while (placedTorches.length) placedTorches.pop()
    while (torchContainer.children.length) torchContainer.remove(torchContainer.children[0])
    for (const t of data.placedTorches ?? []) {
      const faceNormal =
        t.nx !== undefined && t.ny !== undefined && t.nz !== undefined
          ? { x: t.nx, y: t.ny, z: t.nz }
          : undefined
      const bx = Math.round(t.x)
      const by = Math.round(t.y)
      const bz = Math.round(t.z)
      const group = createTorchGroup(bx, by, bz, faceNormal)
      torchContainer.add(group)
      placedTorches.push({
        bx,
        by,
        bz,
        ...(faceNormal && { nx: faceNormal.x, ny: faceNormal.y, nz: faceNormal.z }),
        group,
        chunkKeyNum: chunkKeyNumeric(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE)),
      })
    }
  }

  // Preload chunks in the footprint around the saved player position (same logic as initial spawn).
  if (typeof scene !== 'undefined') {
    const px = playerX
    const pz = playerZ
    const footHalf = PLAYER_HALF + 0.5
    const minCx = Math.floor((px - footHalf) / CHUNK_SIZE)
    const maxCx = Math.floor((px + footHalf) / CHUNK_SIZE)
    const minCz = Math.floor((pz - footHalf) / CHUNK_SIZE)
    const maxCz = Math.floor((pz + footHalf) / CHUNK_SIZE)
    if (chunkWorker) {
      const loadChunkKeys = new Set<number>()
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const keyNum = chunkKeyNumeric(cx, cz)
          loadChunkKeys.add(keyNum)
          if (chunks.has(keyNum)) continue
          if (pendingChunkKeys.has(keyNum)) continue
          pendingChunkKeys.add(keyNum)
          chunkWorker.requestChunk({
            chunkX: cx,
            chunkZ: cz,
            blockMods: getBlockModsForChunk(cx, cz),
          })
        }
      }
      pendingLoad = { loadX: px, loadY: data.player.y, loadZ: pz, chunkKeys: loadChunkKeys }
      const tempY = getHeight(px, pz) + 0.5
      player.position.set(px, tempY, pz)
      player.visible = false
    } else {
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz)
        }
      }
      player.position.set(playerX, playerY, playerZ)
      player.visible = true
    }
  }
  pendingSpawn = null
  if (!pendingLoad) {
    player.visible = true
  }
  lastLookYaw = rotationY
  lastLookPitch = lookPitch
  loadedRotationY = rotationY
  loadedLookPitch = lookPitch
  playerLevel = Math.max(1, Math.min(MAX_LEVEL, data.player.level ?? 1))
  playerExperience = Math.max(0, data.player.experience ?? 0)
  setGold(Math.max(0, data.player.gold ?? 0))
  discoveredChunkKeys.clear()
  for (const k of data.discoveredChunkKeys ?? []) discoveredChunkKeys.add(k)
  clearDiscoveredHeightmapCache()
  preloadHeightmaps(WORLD_SEED, Array.from(discoveredChunkKeys), 200)
  playerHealth = Math.max(
    0,
    Math.min(PLAYER_MAX_HEALTH, data.player.health ?? PLAYER_MAX_HEALTH),
  )
  playerHunger = Math.max(
    0,
    Math.min(PLAYER_MAX_HUNGER, data.player.hunger ?? PLAYER_MAX_HUNGER),
  )
  playerBaseStats = normaliseCharacterStats(data.player.stats)
  playerFaction = data.player.faction === 'legion' ? 'legion' : DEFAULT_FACTION
  playerClass = data.player.class === 'warrior' ? 'warrior' : DEFAULT_CLASS
  setEquipmentFromSave(data.player.equipment, VALID_BLOCK_TYPES)
  if (data.dayTime != null) setDayTime(data.dayTime)
  if (data.snowForced !== undefined) {
    if (snowEffect) snowEffect.setForced?.(data.snowForced)
    else pendingSnowForced = data.snowForced
  }
  const savedSlots = data.inventory?.slice(0, TOTAL_PERSISTENT_SLOTS) ?? []
  const filledCount = savedSlots.filter((s) => s && s.type && s.count > 0).length
  if (savedSlots.length > 0 && filledCount > 1) {
    const valid = savedSlots.map((s) =>
      s && s.type && VALID_BLOCK_TYPES.has(s.type)
        ? { type: s.type, count: Math.min(s.count, MAX_STACK_SIZE) }
        : { type: null as BlockType | null, count: 0 },
    )
    setPersistentSlots(valid)
    ensureSwordInHotbar()
  } else {
    initDefaultInventory()
  }
  setQuestStateFromSave({
    activeQuests: data.activeQuests,
    completedQuestIds: data.completedQuestIds,
    trackedQuestIds: data.trackedQuestIds,
  })
  // If we deferred with pendingLoad, apply as soon as all chunks are present (e.g. already loaded).
  if (pendingLoad) applyPendingLoadIfReady()
  return true
}

/** Worker pool client for async chunk generation (avoids main-thread stutter). */
let chunkWorker: ChunkWorkerClient | null = null
/** Chunk key numbers we've requested from the worker but not yet received. */
const pendingChunkKeys = new Set<number>()
/** Wenn gesetzt: Spawn-Position erst setzen, wenn alle benötigten Chunks geladen sind (Worker-Lieferung abwarten). */
let pendingSpawn: {
  spawnX: number
  spawnZ: number
  chunkKeys: Set<number>
} | null = null
/** When set: player position and visibility are applied once all chunks around the saved position are loaded (worker path in loadGame). */
let pendingLoad: {
  loadX: number
  loadY: number
  loadZ: number
  chunkKeys: Set<number>
} | null = null

// ================= VOXEL COLLISION (see game-collision.ts) =================

// Raycaster für Block-Abbau (Halten auf Block = "abbauen")
const raycaster = new THREE.Raycaster()
const rayOrigin = new THREE.Vector3()
const rayDirection = new THREE.Vector3()
const BREAK_DISTANCE = 5 // maximale Reichweite zum Abbauen (in Blöcken)

/** Aktuelles Ziel beim Halten: gleicher Block = Fortschritt, anderer Block = Reset (Weltkoordinaten, nicht Instanz-Index). */
let breakTarget: {
  chunkKeyNum: number
  blockType: BlockType
  x: number
  y: number
  z: number
  /** World-space face normal (unit) for the block face being mined; used to position the 3D crack overlay. */
  faceNormal: THREE.Vector3
} | null = null
let breakProgress = 0

/** Block under the crosshair (world coords); updated every frame when pointer lock is active. Used for the block outline. */
export let aimedBlock: { x: number; y: number; z: number } | null = null

/** DOM element for the block-crack overlay; set from App.vue after mount so it is found regardless of timing. */
let blockCrackElement: HTMLElement | null = null

/**
 * Sets the block-crack overlay element. Call from the app after the game HUD is mounted (e.g. after nextTick following mode selection).
 * @param el - The element with id "block-crack", or null to clear.
 */
export function setBlockCrackElement(el: HTMLElement | null): void {
  blockCrackElement = el
}
let isMouseDown = false
/** Einmal pro Rechtsklick: Platzieren (Fackel oder Block) auslösen. */
let rightMouseJustPressed = false
/** F key pressed for place (works without pointer lock). */
let fKeyJustPressed = false

/** Schwebende Drop-Items nach Block-Abbau (werden aufgesammelt beim Durchlaufen). */
const drops: Drop[] = []
const PICKUP_RADIUS = 1.4
const DROP_BOB_SPEED = 3
const DROP_BOB_HEIGHT = 0.08
const MAGNET_RADIUS = DEFAULT_MAGNET_RADIUS
const MAGNET_SPEED = DEFAULT_MAGNET_SPEED

/** Platziere Fackeln: Weltposition (Mitte der Fackel) + Group (Mesh + PointLight). */
const placedTorches: PlacedTorch[] = []
const PLACE_DISTANCE = 5

/** When true, console.warn explains why F/right-click place failed. Enable via sessionStorage: setItem('debugPlace','1'). */
function isPlaceDebug(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('debugPlace') === '1'
  } catch {
    return false
  }
}

/** Throttle for "Can't place block here" system message (max once per this many ms). */
const PLACE_REJECT_MESSAGE_THROTTLE_MS = 2000
let lastPlaceRejectMessageTime = 0

/** Block tick interval (e.g. crop growth) in seconds. */
const BLOCK_TICK_INTERVAL = 5
const WHEAT_GROWTH_PROBABILITY = 0.2
let lastBlockTickTime = 0
let lastWaterSpreadTime = 0

const _direction = new THREE.Vector3()
const _projScreenMatrix = new THREE.Matrix4()
const _frustum = new THREE.Frustum()
const _lastCameraMatrixWorld = new THREE.Matrix4()
/** Letzte an die GPU gesendete FOV (nur bei Änderung updateProjectionMatrix aufrufen). */
let _lastUploadedFov = -1
let _frustumDirty = true
const _chunkBox = new THREE.Box3()
const _chunkBoxMin = new THREE.Vector3()
const _chunkBoxMax = new THREE.Vector3()
const _right = new THREE.Vector3()
const _lookDir = new THREE.Vector3()
/** Zielpunkt für Third-Person: Kamera blickt auf Spieler-Mitte, damit der Char im Bildzentrum bleibt. */
const _thirdPersonLookTarget = new THREE.Vector3()
/** OPT-4: scratch for camera offset (avoids new Vector3 per frame). */
const _cameraOffset = new THREE.Vector3()

// OPT-2: reusable AABB block buffer (avoids array/object allocs in resolveVoxelCollisions)
// OPT-3: cache block meshes for raycasting; invalidated on chunk load/unload
const raycastMeshCache = new RaycastMeshCache()

// ================= CHUNK SYNC CONTEXT =================

/**
 * Builds the shared context passed to sync chunk helpers (materials, caches, scene, drops, torches).
 * Used by generateChunk, breakBlock, placeTorch, and refreshChunkVisibleMeshes.
 */
function getChunkSyncCtx(): ChunkSyncContext {
  return {
    grassColormapData,
    foliageColormapData,
    tallGrassMaterial,
    raycastMeshCache,
    frustumDirty: _frustumDirty,
    scene,
    drops,
    torchContainer,
    placedTorches,
  }
}

/**
 * Copies frustum dirty flag back from sync context so main loop knows when to recompute chunk visibility.
 */
function syncFrustumDirty(ctx: ChunkSyncContext): void {
  _frustumDirty = ctx.frustumDirty
}

/**
 * Applies a single block change to loaded chunk data: updates voxel map, invalidates height cache,
 * refreshes visible meshes for the chunk and affected neighbors. Optionally requests worker to re-generate chunk.
 * @param params - World block coords (bx,by,bz), new block type or 'air', and optional requestWorkerChunk flag
 */
function applyBlockChangeToLoadedChunk(params: {
  bx: number
  by: number
  bz: number
  next: BlockType | 'air'
  /** When true, also request updated chunk payload from worker (if enabled). */
  requestWorkerChunk?: boolean
  /** Internal: skip torch neighbor validation to avoid recursive updates. */
  skipTorchValidation?: boolean
}): void {
  const { bx, by, bz, next } = params
  blockLightCacheVersion++
  invalidateColumnHeight(bx, bz)

  const cx = Math.floor(bx / CHUNK_SIZE)
  const cz = Math.floor(bz / CHUNK_SIZE)
  const keyNum = chunkKeyNumeric(cx, cz)
  const data = chunks.get(keyNum)
  if (data) {
    const lx = bx - data.cx * CHUNK_SIZE
    const lz = bz - data.cz * CHUNK_SIZE
    const k = localKey(lx, by, lz)
    if (next === 'air') data.voxelMap.delete(k)
    else data.voxelMap.set(k, next)

    const affected = new Set<BlockType>()
    if (next !== 'air') affected.add(next)
    const neighbors: Array<[number, number, number]> = [
      [bx + 1, by, bz],
      [bx - 1, by, bz],
      [bx, by + 1, bz],
      [bx, by - 1, bz],
      [bx, by, bz + 1],
      [bx, by, bz - 1],
    ]
    for (const [nx, ny, nz] of neighbors) {
      const t = getBlockAt(nx, ny, nz)
      if (t !== null && t !== 'air') affected.add(t as BlockType)
    }

    const ctx = getChunkSyncCtx()
    refreshChunkVisibleMeshes(ctx, data, affected.size > 0 ? affected : undefined)
    // When a fence or its neighbor changes at a chunk boundary, refresh the adjacent chunk so fence connections update.
    const fenceOrNeighborFence =
      isFenceBlock(next as BlockType) ||
      (getBlockAt(bx, by, bz - 1) !== null && isFenceBlock(getBlockAt(bx, by, bz - 1)!)) ||
      (getBlockAt(bx, by, bz + 1) !== null && isFenceBlock(getBlockAt(bx, by, bz + 1)!)) ||
      (getBlockAt(bx + 1, by, bz) !== null && isFenceBlock(getBlockAt(bx + 1, by, bz)!)) ||
      (getBlockAt(bx - 1, by, bz) !== null && isFenceBlock(getBlockAt(bx - 1, by, bz)!))
    if (fenceOrNeighborFence) {
      const atBoundaryX = lx === 0 || lx === CHUNK_SIZE - 1
      const atBoundaryZ = lz === 0 || lz === CHUNK_SIZE - 1
      if (atBoundaryX || atBoundaryZ) {
        const neighborChunks: Array<{ cx: number; cz: number }> = []
        if (lx === 0) neighborChunks.push({ cx: cx - 1, cz })
        if (lx === CHUNK_SIZE - 1) neighborChunks.push({ cx: cx + 1, cz })
        if (lz === 0) neighborChunks.push({ cx, cz: cz - 1 })
        if (lz === CHUNK_SIZE - 1) neighborChunks.push({ cx, cz: cz + 1 })
        for (const { cx: ncx, cz: ncz } of neighborChunks) {
          const neighborKey = chunkKeyNumeric(ncx, ncz)
          const neighborData = chunks.get(neighborKey)
          if (neighborData) {
            refreshChunkVisibleMeshes(ctx, neighborData, undefined)
          }
        }
      }
    }
    syncFrustumDirty(ctx)
  } else {
    raycastMeshCache.markDirty()
    _frustumDirty = true
  }

  /**
   * Validates torches adjacent to this changed block. If their support face is no longer sturdy,
   * they pop off (torch block removed + item drop), Vanilla-style.
   */
  function validateAdjacentTorches(changedX: number, changedY: number, changedZ: number): void {
    const neighborCoords: Array<[number, number, number]> = [
      [changedX + 1, changedY, changedZ],
      [changedX - 1, changedY, changedZ],
      [changedX, changedY + 1, changedZ],
      [changedX, changedY - 1, changedZ],
      [changedX, changedY, changedZ + 1],
      [changedX, changedY, changedZ - 1],
    ]

    for (const [tx, ty, tz] of neighborCoords) {
      const torchType = getBlockAt(tx, ty, tz)
      if (torchType === null || torchType === 'air') continue
      if (!isTorchLikeBlockType(torchType as BlockType)) continue
      const { x: nx, y: ny, z: nz } = getTorchNormalFromTorchLikeBlockType(torchType as BlockType)

      // No ceiling torches in Vanilla.
      if (ny < 0) {
        // Remove invalid legacy ceiling attachment.
      } else {
        const sx = tx - nx
        const sy = ty - ny
        const sz = tz - nz
        const support = getBlockAt(sx, sy, sz)
        if (canSupportTorch(support, { x: nx, y: ny, z: nz })) continue
      }

      // Pop off: remove torch mesh + torch block, drop item.
      const ctx = getChunkSyncCtx()
      removeTorchAt({ bx: tx, by: ty, bz: tz, torchContainer: ctx.torchContainer, placedTorches: ctx.placedTorches })
      blockModifications.set(blockKeyString(tx, ty, tz), 'air')
      applyBlockChangeToLoadedChunk({
        bx: tx,
        by: ty,
        bz: tz,
        next: 'air',
        requestWorkerChunk: true,
        skipTorchValidation: true,
      })
      spawnDropItem({
        scene,
        drops,
        worldX: tx + 0.5 + (Math.random() - 0.5) * 0.3,
        worldZ: tz + 0.5 + (Math.random() - 0.5) * 0.3,
        startY: ty + 0.8,
        restY: ty + 0.2,
        blockType: 'torch',
        time: performance.now() / 1000,
      })
    }
  }

  if (params.skipTorchValidation !== true) {
    validateAdjacentTorches(bx, by, bz)
  }

  if ((params.requestWorkerChunk ?? true) && chunkWorker) {
    pendingChunkKeys.add(keyNum)
    chunkWorker.requestChunk({
      chunkX: cx,
      chunkZ: cz,
      blockMods: getBlockModsForChunk(cx, cz),
    })
  }
}

/**
 * Generates chunk data and meshes for the given chunk (sync path). Uses getChunkSyncCtx and syncs frustum dirty flag.
 * @param _scene - Scene (used by sync generator; not retained)
 * @param chunkX - Chunk X index
 * @param chunkZ - Chunk Z index
 * @returns ChunkData for the generated chunk
 */
function generateChunk(_scene: THREE.Scene, chunkX: number, chunkZ: number): ChunkData {
  const ctx = getChunkSyncCtx()
  const result = generateChunkSync(ctx, chunkX, chunkZ)
  syncFrustumDirty(ctx)
  return result
}

/**
 * Breaks a block at the given world position: updates chunk voxel data, drops, meshes; optionally requests worker chunk.
 */
function breakBlock(
  chunkKeyNum: number,
  blockType: BlockType,
  worldX: number,
  worldY: number,
  worldZ: number,
  time: number,
): void {
  const ctx = getChunkSyncCtx()
  const useWorker = !!chunkWorker
  const doorDrop =
    blockType === 'door_closed' || blockType === 'door_open' ? 'door_closed' : undefined
  breakBlockSync(ctx, chunkKeyNum, blockType, worldX, worldY, worldZ, {
    skipRefresh: useWorker,
    time,
    dropType: doorDrop,
  })
  // Only fill with water when this column is under ocean/lake (surface below water level), not when digging on land.
  const surfaceUnderwater = getHeight(worldX, worldZ) < WATER_LEVEL
  if (shouldFillBrokenBlockWithWater(worldY) && surfaceUnderwater) {
    blockModifications.set(blockKeyString(worldX, worldY, worldZ), 'water_source')
    applyBlockChangeToLoadedChunk({
      bx: worldX,
      by: worldY,
      bz: worldZ,
      next: 'water_source',
    })
  }
  runWaterSpreadFromNeighbors(worldX, worldY, worldZ)
  if (useWorker && chunkWorker) {
    const cx = chunkKeyNum >> 16
    const cz = (chunkKeyNum << 16) >> 16
    chunkWorker.requestChunk({
      chunkX: cx,
      chunkZ: cz,
      blockMods: getBlockModsForChunk(cx, cz),
    })
  }
  syncFrustumDirty(ctx)
}

/**
 * Unloads a chunk from the scene and runtime: removes meshes, clears chunk data, invalidates raycast cache.
 */
function unloadChunk(scene: THREE.Scene, keyNum: number): void {
  const result = unloadChunkSync(scene, keyNum, raycastMeshCache)
  removeTorchesInChunk({ chunkKeyNum: keyNum, torchContainer, placedTorches })
  if (result.frustumDirty) _frustumDirty = true
}

/**
 * Places a torch at the given cell center with the given face normal (e.g. from raycast hit).
 * @returns true if placement succeeded
 */
function placeTorch(
  worldX: number,
  worldY: number,
  worldZ: number,
  faceNormal?: { x: number; y: number; z: number },
): boolean {
  const bx = Math.floor(worldX)
  const by = Math.floor(worldY)
  const bz = Math.floor(worldZ)
  const preferredNormal = faceNormal ? quantizeAxisNormal(faceNormal) : undefined

  const at = getBlockAt(bx, by, bz)
  if (at !== null && at !== 'air' && !isReplaceableByPlacement(at)) return false

  // Vanilla-style: place floor torch on top face; wall torch on side faces.
  if (!preferredNormal || preferredNormal.y < 0) return false
  const isFloor = preferredNormal.y === 1
  const torchBlockType: BlockType =
    isFloor
      ? 'torch'
      : preferredNormal.x === 1
        ? 'wall_torch_east'
        : preferredNormal.x === -1
          ? 'wall_torch_west'
          : preferredNormal.z === 1
            ? 'wall_torch_south'
            : 'wall_torch_north'

  // Support must be sturdy (simplified: solid block).
  const supportX = bx - preferredNormal.x
  const supportY = by - preferredNormal.y
  const supportZ = bz - preferredNormal.z
  const support = getBlockAt(supportX, supportY, supportZ)
  if (!canSupportTorch(support, preferredNormal)) return false

  blockModifications.set(blockKeyString(bx, by, bz), torchBlockType)
  applyBlockChangeToLoadedChunk({ bx, by, bz, next: torchBlockType })

  // Also place the custom mesh/light immediately (chunk refresh will keep it in sync).
  return placeTorchSync(getChunkSyncCtx(), bx, by, bz, preferredNormal)
}

/**
 * If spawn was deferred until worker chunks arrived, checks that all required chunks are loaded and then sets player position and clears pendingSpawn.
 */
function applyPendingSpawnIfReady(): void {
  if (!pendingSpawn || !player) return
  if (!isPendingSpawnReady(pendingSpawn, (keyNum) => chunks.has(keyNum))) return
  const y = getSurfaceY(pendingSpawn.spawnX, pendingSpawn.spawnZ)
  player.position.set(pendingSpawn.spawnX, y, pendingSpawn.spawnZ)
  velocityY = 0
  velocityX = 0
  velocityZ = 0
  playerGrounded = true
  player.visible = true
  pendingSpawn = null
}

/**
 * If load was deferred until worker chunks arrived (loadGame with worker), checks that all required chunks are loaded and then sets final player position and visibility.
 */
function applyPendingLoadIfReady(): void {
  if (!pendingLoad || !player) return
  for (const keyNum of pendingLoad.chunkKeys) {
    if (!chunks.has(keyNum)) return
  }
  player.position.set(pendingLoad.loadX, pendingLoad.loadY, pendingLoad.loadZ)
  velocityY = 0
  velocityX = 0
  velocityZ = 0
  playerGrounded = true
  player.visible = true
  pendingLoad = null
}

/**
 * Resolves an instanced block (chunkKeyNum, blockType, instanceId) to world coordinates for raycast/mining.
 */
function getBlockWorldPosition(
  chunkKeyNum: number,
  blockType: BlockType,
  instanceId: number,
): BlockPos | null {
  return getBlockWorldPositionSync(chunkKeyNum, blockType, instanceId)
}

/**
 * Returns all meshes used for block raycasting (mining/placement). Invalidated when chunks load/unload.
 */
function getRaycastMeshes(): Array<THREE.InstancedMesh | THREE.Mesh> {
  return getRaycastMeshesSync(raycastMeshCache)
}

/** Player chunk coords from last update – only run chunk logic when these change */
let lastPlayerChunkX: number | null = null
let lastPlayerChunkZ: number | null = null

/** Chunk keys (chunkKeyNumeric) the player has entered; used for map discovery and persisted in save. */
let discoveredChunkKeys = new Set<number>()

/** Cache for block-light queries used by spawn checks (key: blockKeyNumeric). Invalidated on block changes. */
const blockLightCache = new Map<number, { version: number; value: number }>()
/** Incremented on any block change to invalidate blockLightCache. */
let blockLightCacheVersion = 1

// ================= PLAYER =================

/**
 * Creates the player mesh, finds spawn (biome-based with fallbacks), preloads spawn footprint chunks (worker or sync), adds player to scene.
 * When using chunk worker, spawn position is applied later via applyPendingSpawnIfReady once chunks are loaded.
 */
/**
 * Resolves the initial spawn (x, z) for a new session. Uses biome-based search with fallbacks.
 * This is computed before POIs are set up so the spawn search is not affected by POI biome overrides.
 */
function resolveInitialSpawnXZ(): { x: number; z: number } {
  // Ensure POI overrides do not influence the spawn search.
  setActivePois([])

  if (SPAWN_ABOVE_CAVE_DEBUG) return findSpawnAboveCave()

  const first = findSpawnInBiome(SPAWN_BIOME)
  let spawnX = first.x
  let spawnZ = first.z

  // Fallback: if only (0,0) found, try every other spawnable biome so we get forest/savanna/plains etc.
  if (spawnX === 0 && spawnZ === 0) {
    for (const fallbackBiome of SPAWNABLE_BIOMES) {
      if (fallbackBiome === SPAWN_BIOME) continue
      const fallback = findSpawnInBiome(fallbackBiome)
      if (fallback.x !== 0 || fallback.z !== 0) {
        spawnX = fallback.x
        spawnZ = fallback.z
        break
      }
    }
  }

  // Ultimate fallback: use fixed spawn coordinates from config if still at origin.
  if (spawnX === 0 && spawnZ === 0) {
    spawnX = SPAWN_X
    spawnZ = SPAWN_Z
  }

  return { x: spawnX, z: spawnZ }
}

function createPlayer(scene: THREE.Scene, resolvedSpawn: { x: number; z: number }) {
  const player = createPlayerMeshOnly()
  const head = player.children[0] as THREE.Mesh
  const body = player.children[1] as THREE.Mesh
  const leg1 = player.children[2] as THREE.Mesh
  const leg2 = player.children[3] as THREE.Mesh
  const arm1 = player.children[4] as THREE.Mesh
  const arm2 = player.children[5] as THREE.Mesh

  const spawnX = resolvedSpawn.x
  const spawnZ = resolvedSpawn.z
  columnHeightCache.clear()
  const footHalf = PLAYER_HALF + 0.5
  const minCx = Math.floor((spawnX - footHalf) / CHUNK_SIZE)
  const maxCx = Math.floor((spawnX + footHalf) / CHUNK_SIZE)
  const minCz = Math.floor((spawnZ - footHalf) / CHUNK_SIZE)
  const maxCz = Math.floor((spawnZ + footHalf) / CHUNK_SIZE)
  const spawnChunkKeys = new Set<number>()
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      spawnChunkKeys.add(chunkKeyNumeric(cx, cz))
    }
  }

  if (chunkWorker) {
    // Chunks vom Worker-Pool anfordern; Position erst setzen, wenn alle da sind (applyPendingSpawnIfReady).
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const keyNum = chunkKeyNumeric(cx, cz)
        if (chunks.has(keyNum)) continue
        if (pendingChunkKeys.has(keyNum)) continue
        pendingChunkKeys.add(keyNum)
        chunkWorker.requestChunk({
          chunkX: cx,
          chunkZ: cz,
          blockMods: getBlockModsForChunk(cx, cz),
        })
      }
    }
    pendingSpawn = { spawnX, spawnZ, chunkKeys: spawnChunkKeys }
    const tempY = getHeight(spawnX, spawnZ) + 0.5
    player.position.set(spawnX, tempY, spawnZ)
    player.visible = false
  } else {
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz)
      }
    }
    const spawnY = getSurfaceY(spawnX, spawnZ)
    player.position.set(spawnX, spawnY, spawnZ)
  }

  scene.add(player)

  return { player, head, body, leg1, leg2, arm1, arm2 }
}

// ================= POV HAND =================
// Camera looks along -Z; arm is lower-right. Held weapon pivot is at hilt (geom.translate) so swing rotates at hand.
// Weapons use depthTest: true and HELD_WEAPON_OFFSET_Z so the sword stays in front of the arm.

/** POV arm dimensions (slim so it reads as an arm, not a block). */
const POV_ARM_WIDTH = 0.06
const POV_ARM_HEIGHT = 0.4
const POV_ARM_DEPTH = 0.05
/** POV arm position in camera space (right, down, forward). */
const POV_ARM_POS_X = 0.42
const POV_ARM_POS_Y = -0.42
const POV_ARM_POS_Z = -0.5
/** Offset from arm origin to held-item container (hand at end of arm). */
const POV_HAND_OFFSET_X = 0
const POV_HAND_OFFSET_Y = 0.2
const POV_HAND_OFFSET_Z = 0
/** Scale of held block in first-person (small block in hand). */
const HELD_BLOCK_SCALE = 0.2
/** Size of held item in first-person (e.g. sword); 1:1 aspect to avoid stretching square item textures. */
const HELD_ITEM_SIZE = 0.32
/** Held weapon: Z offset so sword sits in front of arm (no clipping with depthTest). */
const HELD_WEAPON_OFFSET_Z = 0.08
/** Held sword: pivot at bottom center (hilt). Y = face camera, X = slight tilt, Z = slight lean so blade reads vertical on screen. */
const HELD_SWORD_TILT_Y_RAD = Math.PI
const HELD_SWORD_TILT_Z_RAD = -0.35
const HELD_SWORD_TILT_X_DEG = 8
/** Cache of held-item meshes by block type (block or item id). */
const heldItemMeshCache = new Map<string, THREE.Mesh>()
/** Container for the currently held item (child of POV arm). Set in createPOVHands. */
let povHeldItemContainer: THREE.Group

/**
 * Creates or returns a cached mesh for the given block/item type to show in the first-person hand.
 */
function getOrCreateHeldItemMesh(blockType: BlockType): THREE.Mesh {
  let mesh = heldItemMeshCache.get(blockType)
  if (mesh) return mesh

  const itemTex = getItemTextureName(blockType)
  if (itemTex) {
    // Weapon/tool: single quad; origin at bottom center (hilt) so swing pivots at hand.
    const geom = new THREE.PlaneGeometry(HELD_ITEM_SIZE, HELD_ITEM_SIZE)
    geom.translate(0, HELD_ITEM_SIZE / 2, 0)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    })
    mesh = new THREE.Mesh(geom, mat)
    mesh.renderOrder = 10000
    loadItemTextureSafe(itemTex).then((tex) => {
      setPixelFilter(tex)
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      mat.map = tex
      mat.needsUpdate = true
    })
    mesh.rotation.set(
      THREE.MathUtils.degToRad(HELD_SWORD_TILT_X_DEG),
      HELD_SWORD_TILT_Y_RAD,
      HELD_SWORD_TILT_Z_RAD,
    )
    mesh.position.set(0, 0, HELD_WEAPON_OFFSET_Z)
  } else {
    // Block: small cube with block texture. Use transparent: true so it is sorted with transparents
    // and drawn after water/flowers (high renderOrder), avoiding world geometry in front of the held block.
    const names = getBlockTextureNames(blockType)
    const texName = names[0] ?? 'stone'
    const geom = new THREE.BoxGeometry(HELD_BLOCK_SCALE, HELD_BLOCK_SCALE, HELD_BLOCK_SCALE)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 1,
    })
    mesh = new THREE.Mesh(geom, mat)
    /** Above world transparents (water, flowers) so the held block always draws in front. */
    mesh.renderOrder = 10000
    loadTextureSafe(texName).then((tex) => {
      setPixelFilter(tex)
      tex.colorSpace = THREE.SRGBColorSpace
      mat.map = tex
      mat.needsUpdate = true
    })
    mesh.rotation.y = THREE.MathUtils.degToRad(45)
    mesh.rotation.x = THREE.MathUtils.degToRad(-20)
    mesh.position.set(0.06, 0, 0.12)
  }

  heldItemMeshCache.set(blockType, mesh)
  return mesh
}

/**
 * Updates the POV held-item container to show the effective weapon (main hand then hotbar) or hotbar item.
 */
function updatePOVHeldItem(): void {
  const mainHand = getEquipped('mainHand').type
  const blockType = mainHand ?? getSelectedBlockType()
  const count = mainHand ? 1 : getSelectedSlotCount()
  if (!blockType || count <= 0) {
    povHeldItemContainer.clear()
    return
  }
  const def = getBlockDefinition(blockType)
  if (!def) {
    povHeldItemContainer.clear()
    return
  }
  const mesh = getOrCreateHeldItemMesh(blockType)
  if (povHeldItemContainer.children[0] !== mesh) {
    povHeldItemContainer.clear()
    povHeldItemContainer.add(mesh)
  }
}

/**
 * Creates the first-person arm/hand group attached to the camera (skin material, fixed offset). Used for mining swing, movement bob, and held item.
 */
function createPOVHands(camera: THREE.PerspectiveCamera) {
  const hands = new THREE.Group()
  hands.renderOrder = 999
  const matSkin = new THREE.MeshStandardMaterial({
    color: 0xffdbac,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    opacity: 1.0,
  })
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(POV_ARM_WIDTH, POV_ARM_HEIGHT, POV_ARM_DEPTH),
    matSkin,
  )
  arm.renderOrder = 999
  arm.position.set(POV_ARM_POS_X, POV_ARM_POS_Y, POV_ARM_POS_Z)
  arm.rotation.set(
    THREE.MathUtils.degToRad(-25),
    THREE.MathUtils.degToRad(-15),
    THREE.MathUtils.degToRad(-10),
  )
  povHeldItemContainer = new THREE.Group()
  povHeldItemContainer.position.set(POV_HAND_OFFSET_X, POV_HAND_OFFSET_Y, POV_HAND_OFFSET_Z)
  arm.add(povHeldItemContainer)
  hands.add(arm)
  camera.add(hands)
  return hands
}

// ================= SCENE (created in init after textures load) =================

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let effectComposer: EffectComposer | null = null
let bloomPass: UnrealBloomPass | null = null
/** Container für alle platzierten Fackeln (Mesh + Licht). */
let torchContainer: THREE.Group
/** 3D crack overlay on the block face being mined; created in initSceneAndRenderer, shown when breakTarget is set. */
let blockCrackOverlayMesh: THREE.Mesh | null = null
/** Wireframe outline around the block under the crosshair; created in initSceneAndRenderer, shown when aimedBlock is set. */
let blockOutlineMesh: THREE.LineSegments | null = null
let sunLight: THREE.DirectionalLight
let sunMesh: THREE.Mesh
let moonMesh: THREE.Mesh
let stars: THREE.Points
let sky: THREE.Mesh
let clouds: THREE.Group
let cloudMaterial: THREE.MeshBasicMaterial
let snowEffect: SnowEffect
/** Applied to snowEffect when it is created (set by loadGame when run before initLightsAndSky). */
let pendingSnowForced: boolean | null | undefined
let player: THREE.Group

/** Shadow frustum radius around player (better texel density, less flicker). */
const SHADOW_RADIUS = 60

/**
 * Smooth Hermite interpolation between 0 and 1. Used for bloom daylight transitions to avoid harsh edges.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Returns 0–1 factor for how much the sun is above the horizon; used to scale bloom by time of day.
 */
function getBloomDaylight01(): number {
  const dayTime = getDayTime()
  const sunAngle = dayTime * Math.PI * 2
  const sunHeight = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.3).normalize().y

  // Soft transition around the horizon to avoid a bloom spike during sunrise/sunset.
  return smoothstep(-0.25, 0.25, sunHeight)
}

/**
 * Scale for bloom strength by time of day (1 at night, ~0.04 at noon) to avoid overpowering bloom in daylight.
 */
function getBloomDayScale(): number {
  const daylight01 = getBloomDaylight01()
  return 1 - 0.96 * daylight01
}

/**
 * Bloom threshold is raised during day so only the brightest pixels bloom; at night uses settings value.
 */
function getBloomThresholdForTimeOfDay(): number {
  const daylight01 = getBloomDaylight01()
  const base = getBloomThreshold()
  return Math.max(base, base + (1 - base) * daylight01 * 0.85)
}

let ambientLight: THREE.AmbientLight
let hemiLight: THREE.HemisphereLight
let head: THREE.Mesh
let body: THREE.Mesh
let leg1: THREE.Mesh
let leg2: THREE.Mesh
let arm1: THREE.Mesh
let arm2: THREE.Mesh
let povHands: THREE.Group
/** Nur in POV sichtbar als Schatten auf dem Boden; Mesh selbst unsichtbar (colorWrite=false). */
let povShadowBody: THREE.Group
let controls: PointerLockControls

const moveState = { forward: false, back: false, left: false, right: false }
let lastWPressTime = 0
/** Aktuelle Blickrichtung (für Multiplayer: andere Spieler sehen, wohin du schaust). */
let lastLookYaw = 0
let lastLookPitch = 0
let sprintKeyHeld = false
let sneakKeyHeld = false
let doubleTapSprint = false
/** Computed each frame: forward && !sneak && (sprint key held || double-tap W). */
let isSprinting = false
const DOUBLE_TAP_WINDOW_MS = 400

const FOV_LERP_SPEED = 6 // wie schnell FOV zum Ziel lerpt

// POV-Hand-Animation: Zustand wird auf Ziel gelerpt, kein Drift (Ziel = 0 oder Wackel-Offset)
let povHandAnimX = 0
let povHandAnimY = 0
let povHandAnimZ = 0
const POV_HAND_LERP = 0.22 // wie schnell Richtung Ziel (0 = neutral, 1 = sofort)
const POV_ARM_LERP = 0.22 // how fast arm rotation follows target (smooth return from mining/slash)

// Camera head bobbing (first-person): phase + smoothed offsets to avoid jitter.
let cameraBobPhase = 0
let cameraBobX = 0
let cameraBobY = 0
let cameraBobStrength = 0

// Mining: Arm schwingt beim Halten auf Block (Abbauen)
let miningSwingPhase = 0
const POV_ARM_BASE_ROTATION_X = THREE.MathUtils.degToRad(-25)
const POV_ARM_BASE_ROTATION_Y = THREE.MathUtils.degToRad(-15)
const POV_ARM_BASE_ROTATION_Z = THREE.MathUtils.degToRad(-10)
/** Current POV arm rotation (lerped toward target for smooth return from mining/slash). */
let povArmRotX = POV_ARM_BASE_ROTATION_X
let povArmRotY = POV_ARM_BASE_ROTATION_Y
let povArmRotZ = POV_ARM_BASE_ROTATION_Z

/** Sword slash: idle -> slashing (direction chosen at random per slash) -> cooldown -> idle. */
type AttackState = 'idle' | 'slashing' | 'cooldown'
let attackState: AttackState = 'idle'
let slashPhase = 0
/** True after we've run entity hit detection for the current slash (one hit check per slash). */
let slashHitCheckedThisCycle = false
/** Weapon used for the current slash (for damage calculation when hit is applied). */
let currentSlashWeapon: BlockType | null = null
/** When true, next melee hit applies the class skill damage multiplier (e.g. Warrior Strike). */
let nextSlashEnhanced = false
/** Remaining cooldown in seconds per skill id. */
const skillCooldowns: Record<string, number> = {}

/** Returns the effective weapon: main hand first, then hotbar selection. Used for attack and damage. */
function getEffectiveWeapon(): BlockType | null {
  const mainHand = getEquipped('mainHand').type
  if (mainHand && isWeapon(mainHand)) return mainHand
  const hotbar = getSelectedBlockType()
  return hotbar && isWeapon(hotbar) ? hotbar : null
}

/** Returns base slash damage for the given weapon type (or default if unknown). */
function getSlashDamage(weaponType: string | undefined): number {
  if (!weaponType) return DAMAGE_PER_SLASH
  return WEAPON_BASE_DAMAGE[weaponType] ?? DAMAGE_PER_SLASH
}

/** Duration of the slash motion (forward + return) in seconds. */
const SLASH_DURATION = 0.4
/** Cooldown after slash before next attack can start. */
const SLASH_COOLDOWN_DURATION = 0.15
/** Total attack cycle duration. */
const SLASH_TOTAL_DURATION = SLASH_DURATION + SLASH_COOLDOWN_DURATION
/** Max rotation (radians) of POV hands for slash (horizontal arc). */
const SLASH_HAND_ROTATION_Y = 0.65
/** Max rotation (radians) for vertical/diagonal slash component. */
const SLASH_HAND_ROTATION_X = 0.65

/** Axis factors (1, -1, or 0) for slash direction variants. Y = horizontal, X = vertical, Z = roll. */
interface SlashVariant {
  y: number
  x: number
  z: number
}

/** Slash direction variants: horizontal, vertical, and diagonal. One is chosen at random per slash. */
const SLASH_VARIANTS: SlashVariant[] = [
  { y: 1, x: 0, z: 0 },   // left to right
  { y: -1, x: 0, z: 0 },  // right to left
  { y: 0, x: 1, z: 0 },   // top to bottom
  { y: 0, x: -1, z: 0 },  // bottom to top
  { y: 1, x: 1, z: 0 },   // diagonal: top-left to bottom-right
  { y: -1, x: 1, z: 0 },  // diagonal: top-right to bottom-left
  { y: 1, x: -1, z: 0 },  // diagonal: bottom-left to top-right
  { y: -1, x: -1, z: 0 }, // diagonal: bottom-right to top-left
]

let currentSlashVariant: SlashVariant = SLASH_VARIANTS[0]

/** Returns slash arc: 0 at start/end, smooth wind-up then slash then return (no snap from/to idle). */
function getSlashArc(phase: number, duration: number): number {
  if (phase >= duration) return 0
  const p = phase / duration
  if (p < 0.25) return -4 * p                    // 0 → -1 wind-up
  if (p < 0.5) return 8 * p - 3                   // -1 → 1 main slash
  return 2 - 2 * p                                // 1 → 0 return to rest
}

const HEAD_PITCH_MAX = THREE.MathUtils.degToRad(65) // vertikale Kopfbegrenzung

/** Ob Multiplayer aktiv ist (nur dann verbinden wir mit dem Server). */
let multiplayerEnabled = false

/** Callback when the player uses (right-clicks) a crafting table block; used to open the crafting UI. */
let onCraftingTableUse: (() => void) | null = null

/** Callback when the player right-clicks or uses (F) a quest NPC; receives the quest giver data (offered ids and optional prerequisites). */
let onQuestNpcInteract: ((questGiver: {
  offeredQuestIds: string[]
  prerequisiteQuestIds?: string[]
}) => void) | null = null

/**
 * Entry point called by the Vue app with the canvas container (after mount). Initializes materials, scene, chunks, player, controls, then starts animate loop.
 * @param container - Optional DOM element for the WebGL canvas
 * @param options - multiplayer flag and optional callbacks for UI sync and crafting table use
 */
export async function initGame(
  container?: HTMLElement,
  options?: {
    multiplayer?: boolean
    onHotbarChange?: (blocks: BlockType[], counts: number[]) => void
    onCraftingTableUse?: () => void
    onQuestNpcInteract?: (questGiver: {
      offeredQuestIds: string[]
      prerequisiteQuestIds?: string[]
    }) => void
  },
): Promise<void> {
  multiplayerEnabled = options?.multiplayer === true
  setOnHotbarChange(options?.onHotbarChange ?? null)
  onCraftingTableUse = options?.onCraftingTableUse ?? null
  onQuestNpcInteract = options?.onQuestNpcInteract ?? null
  await init(container)
}

/**
 * Runs full init sequence: materials, scene/renderer, lights/sky, post-processing, chunk worker, player/world API, controls, debug commands.
 */
async function init(container?: HTMLElement): Promise<void> {
  await initMaterialsAndColormaps()
  initSceneAndRenderer(container)
  initLightsAndSky()
  initPostProcessing()
  // Resolve spawn first so the "first spawn village" POI is placed around the actual spawn, not (0,0).
  const resolvedSpawn = resolveInitialSpawnXZ()
  setActivePois(createPoiRegistryForSpawn(resolvedSpawn))
  initChunkWorker()
  initPlayerAndWorldApi(resolvedSpawn)
  initControlsAndInput()
  registerDebugCommands()
}

/**
 * Registers debug console commands: /snow (start|end|auto), /rain (stub), /time (day|night).
 */
function registerDebugCommands(): void {
  registerCommand('snow', (args) => {
    const sub = (args[0] ?? '').toLowerCase()
    if (sub === 'start') {
      snowEffect.setForced?.(true)
      return 'Snow: on'
    }
    if (sub === 'end') {
      snowEffect.setForced?.(false)
      return 'Snow: off'
    }
    if (sub === 'auto' || sub === '') {
      snowEffect.setForced?.(null)
      return 'Snow: auto (biome)'
    }
    return 'Usage: /snow start | end | auto'
  })

  registerCommand('rain', (args) => {
    void args
    return 'Rain is not implemented (snow only).'
  })

  registerCommand('time', (args) => {
    const sub = (args[0] ?? '').toLowerCase()
    if (sub === 'day') {
      setDayTime(0.25)
      return 'Time: day (noon)'
    }
    if (sub === 'night') {
      setDayTime(0.75)
      return 'Time: night (midnight)'
    }
    return 'Usage: /time day | night'
  })
}

/**
 * Loads block materials and grass/foliage colormaps; stores results in module-level variables for chunk generation.
 */
async function initMaterialsAndColormaps(): Promise<void> {
  const res = await initMaterialsAndColormapsSystem()
  grassColormapData = res.grassColormapData
  foliageColormapData = res.foliageColormapData
  tallGrassMaterial = res.tallGrassMaterial
}

/**
 * Creates scene, camera, renderer, torch container, FPS overlay; wires terrain debug overlay and block-crack 3D overlay.
 */
function initSceneAndRenderer(container?: HTMLElement): void {
  const res = initSceneAndRendererSystem(container)
  scene = res.scene
  torchContainer = res.torchContainer
  camera = res.camera
  renderer = res.renderer
  fpsEl = res.fpsEl
  createTerrainDebugOverlaySystem(terrainDebug)

  const crackGeom = new THREE.PlaneGeometry(1, 1)
  const crackMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  blockCrackOverlayMesh = new THREE.Mesh(crackGeom, crackMat)
  blockCrackOverlayMesh.visible = false
  blockCrackOverlayMesh.renderOrder = 1
  scene.add(blockCrackOverlayMesh)

  const outlineBox = new THREE.BoxGeometry(1, 1, 1)
  const outlineEdges = new THREE.EdgesGeometry(outlineBox)
  const outlineMat = new THREE.LineBasicMaterial({
    color: BLOCK_OUTLINE_COLOR,
    depthTest: true,
  })
  blockOutlineMesh = new THREE.LineSegments(outlineEdges, outlineMat)
  blockOutlineMesh.scale.setScalar(BLOCK_OUTLINE_SCALE)
  blockOutlineMesh.visible = false
  scene.add(blockOutlineMesh)
}

/**
 * Creates sun, moon, sky, clouds, stars, ambient/hemi lights, snow effect; applies pending snow override from loadGame if set.
 */
function initLightsAndSky(): void {
  const result = initLightsAndSkySystem(scene, SHADOW_RADIUS)
  sunLight = result.sunLight
  sunMesh = result.sunMesh
  moonMesh = result.moonMesh
  sky = result.sky
  clouds = result.clouds
  cloudMaterial = result.cloudMaterial
  stars = result.stars
  ambientLight = result.ambientLight
  hemiLight = result.hemiLight
  snowEffect = createSnowEffect(scene)
  if (pendingSnowForced !== undefined) {
    snowEffect.setForced?.(pendingSnowForced)
    pendingSnowForced = undefined
  }
}

/**
 * Sets up EffectComposer with RenderPass and UnrealBloomPass; bloom params read from graphics settings.
 */
function initPostProcessing(): void {
  if (!scene || !camera || !renderer) return
  const w = renderer.domElement.width
  const h = renderer.domElement.height
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    getBloomStrength(),
    getBloomRadius(),
    getBloomThreshold(),
  )
  composer.addPass(bloom)
  effectComposer = composer
  bloomPass = bloom
}

/**
 * Initializes chunk worker client; wires onPayload to applyChunkPayloadToScene and entity spawn, onError to fallback to main-thread generation.
 */
function initChunkWorker(): void {
  const client = initChunkWorkerClient({
    seed: WORLD_SEED,
    pois: getActivePois(),
    maxWorkers: Infinity,
    onPayload: (payload) =>
      applyChunkPayloadToScene(
        scene,
        payload,
        {
          chunks,
          pendingChunkKeys,
          grassColormapData,
          foliageColormapData,
          tallGrassMaterial,
          getResolvedBiome,
          torchContainer,
          placedTorches,
          onChunkAdded: (data) => {
            spawnEntitiesForChunk(scene, chunkKey(data.cx, data.cz), data.cx, data.cz)
            const keyNum = chunkKeyNumeric(data.cx, data.cz)
            if (discoveredChunkKeys.has(keyNum) && data.heightmapBuffer) {
              writeHeightmap(WORLD_SEED, keyNum, data.heightmapBuffer, data.biomeMapBuffer)
            }
          },
          onChunkChanged: () => {
            raycastMeshCache.markDirty()
            _frustumDirty = true
            applyPendingSpawnIfReady()
            applyPendingLoadIfReady()
          },
        },
        WORLD_SEED,
      ),
    onError: (message, error) => {
      console.error(
        '[terrain] chunk worker failed, falling back to main thread generation',
        message,
        error,
      )
      chunkWorker = null
    },
  })
  chunkWorker = client ?? null
}

/**
 * Creates player mesh and spawn logic, registers world API (getBlock, getBiome, getSurfaceY, etc.), creates POV hands and shadow body.
 */
function initPlayerAndWorldApi(resolvedSpawn: { x: number; z: number }): void {
  const created = createPlayer(scene, resolvedSpawn)
  player = created.player
  head = created.head
  body = created.body
  leg1 = created.leg1
  leg2 = created.leg2
  arm1 = created.arm1
  arm2 = created.arm2

  setWorldApi({
    getBlockAt,
    getSurfaceY,
    getColumnSurfaceY,
    getBiome: getResolvedBiome,
    getBlockLightAt: (x, y, z) => {
      const bx = Math.floor(x)
      const by = Math.floor(y)
      const bz = Math.floor(z)
      const cacheKey = blockKeyNumeric(bx, by, bz)
      const cached = blockLightCache.get(cacheKey)
      if (cached && cached.version === blockLightCacheVersion) return cached.value
      // Vanilla-like block light spread with basic occlusion:
      // - Torches emit 14
      // - Light falls off by 1 per step (6-neighborhood)
      // - Occluding blocks stop propagation (no "through walls")
      const startBlock = getBlockAt(bx, by, bz)
      if (startBlock === null) return 0
      if (startBlock !== 'air' && startBlock !== 'torch' && isBlockTypeOccluding(startBlock as BlockType))
        return 0

      const MAX_LIGHT = 14
      const visited = new Set<number>()
      const qx: number[] = [bx]
      const qy: number[] = [by]
      const qz: number[] = [bz]
      const qd: number[] = [0]
      visited.add(blockKeyNumeric(bx, by, bz))

      while (qx.length) {
        const x0 = qx.shift()!
        const y0 = qy.shift()!
        const z0 = qz.shift()!
        const d0 = qd.shift()!
        const levelHere = MAX_LIGHT - d0
        if (levelHere <= 0) continue

        const t = getBlockAt(x0, y0, z0)
        if (t === 'torch' || (t !== null && t !== 'air' && isTorchLikeBlockType(t as BlockType))) {
          // Light at the torch's own block is 14; at the start cell it is 14 - distance.
          blockLightCache.set(cacheKey, { version: blockLightCacheVersion, value: levelHere })
          return levelHere
        }

        // Do not propagate through occluding blocks (but allow propagation from within air/non-occluding).
        if (t !== null && t !== 'air' && isBlockTypeOccluding(t as BlockType)) continue

        const nd = d0 + 1
        if (nd > MAX_LIGHT) continue
        const neighbors: Array<[number, number, number]> = [
          [x0 + 1, y0, z0],
          [x0 - 1, y0, z0],
          [x0, y0 + 1, z0],
          [x0, y0 - 1, z0],
          [x0, y0, z0 + 1],
          [x0, y0, z0 - 1],
        ]
        for (const [nx, ny, nz] of neighbors) {
          if (ny < WORLD_MIN_Y || ny >= WORLD_MIN_Y + WORLD_HEIGHT) continue
          const key = blockKeyNumeric(nx, ny, nz)
          if (visited.has(key)) continue
          const bt = getBlockAt(nx, ny, nz)
          if (bt === null) continue
          // We enqueue occluding blocks too so we can detect if they are torches (they aren't),
          // but we will stop propagation from them above.
          visited.add(key)
          qx.push(nx)
          qy.push(ny)
          qz.push(nz)
          qd.push(nd)
        }
      }

      blockLightCache.set(cacheKey, { version: blockLightCacheVersion, value: 0 })
      return 0
    },
  })

  loadGame()

  updateChunksFromModule({
    scene,
    player,
    chunkWorker,
    pendingChunkKeys,
    generateChunkSync: generateChunk,
    unloadChunk,
  })
  lastPlayerChunkX = Math.floor(player.position.x / CHUNK_SIZE)
  lastPlayerChunkZ = Math.floor(player.position.z / CHUNK_SIZE)

  if (multiplayerEnabled) {
    initMultiplayer(
      scene,
      () => ({
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotationY: lastLookYaw,
        lookPitch: lastLookPitch,
      }),
      { createPlayerMesh: createPlayerMeshOnly },
    )
  }
}

/**
 * Sets up pointer lock, POV hands, shadow body, mouse/keyboard listeners, hotbar wheel, autosave interval and beforeunload save; starts animate loop.
 */
function initControlsAndInput(): void {
  povHands = createPOVHands(camera)

  povShadowBody = createPOVShadowBody()
  scene.add(povShadowBody)

  controls = new PointerLockControls(camera, renderer.domElement)
  if (loadedRotationY !== null && loadedLookPitch !== null) {
    camera.rotation.order = 'YXZ'
    camera.rotation.y = loadedRotationY
    camera.rotation.x = loadedLookPitch
    camera.rotation.z = 0
    loadedRotationY = null
    loadedLookPitch = null
  }
  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock()
  })
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isMouseDown = true
      const weapon = getEffectiveWeapon()
      if (weapon && attackState === 'idle') {
        currentSlashWeapon = weapon
        attackState = 'slashing'
        slashPhase = 0
        slashHitCheckedThisCycle = false
        currentSlashVariant = SLASH_VARIANTS[Math.floor(Math.random() * SLASH_VARIANTS.length)]
      }
    }
    if (e.button === 2) {
      e.preventDefault()
      rightMouseJustPressed = true
    }
  })
  document.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('mouseup', () => {
    isMouseDown = false
    breakTarget = null
    breakProgress = 0
    if (blockCrackElement) blockCrackElement.style.visibility = 'hidden'
  })
  document.addEventListener('wheel', (e) => e.preventDefault(), {
    passive: false,
  })
  document.addEventListener('keydown', (e) => {
    const scrollKeys = [
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
    ]
    if (
      !(
        document.activeElement &&
        (document.activeElement as HTMLElement).closest?.('input, textarea, [contenteditable]')
      )
    ) {
      if (scrollKeys.includes(e.code)) e.preventDefault()
    }
  })

  // Hotbar: show initial selection and notify UI once with current state
  updateHotbarSelection()
  notifyHotbarChange()

  // Mouse wheel: cycle hotbar slot (Minecraft-style)
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY > 0) setHotbarIndex(getSelectedHotbarIndex() + 1)
      else if (e.deltaY < 0) setHotbarIndex(getSelectedHotbarIndex() - 1)
    },
    { passive: true },
  )

  setInterval(saveGame, AUTOSAVE_INTERVAL_MS)
  window.addEventListener('beforeunload', () => saveGame())

  animate()
}

// ================= MOVEMENT CONSTANTS =================

// Movement in world units per second (frame-rate independent, Minecraft Java values)
const moveSpeed = 4.317
const sprintSpeed = 5.612
const sneakSpeed = 1.295 // 30% of walking (Minecraft Java)
const airControl = 2.5
const horizontalMaxSpeed = 4.4
const horizontalMaxSpeedSprint = 5.8
const horizontalMaxSpeedSneak = 1.4
const groundFriction = 0.15 // velocity multiplier per second when on ground and not moving

// Water (swimming/diving): world units per second, frame-rate independent
const waterSwimUpSpeed = 2.2
const waterSinkSpeed = 0.6
const waterSinkSpeedSneak = 2.2
const waterHorizontalSpeedFactor = 0.51 // ~Minecraft surface speed vs walk
/** Max vertical speed in water (clamp for smoother feel). */
const waterVerticalSpeedCap = 2.8

// ================= PHYSICS (all per-second for frame-rate independence) =================

let velocityY = 0
let velocityX = 0
let velocityZ = 0
/** Set each frame from resolveVoxelCollisions result; used for jump (Space) and next-frame friction/air control. */
let playerGrounded = false
/** When DEBUG_COLLISION is true: skip this many frames before logging again (avoids console flood). */
let debugCollisionLogCooldown = 0
/** Gesetzt bei Space keydown; wird zu Beginn des nächsten Frames ausgewertet, damit der Sprung sofort in der Physik ankommt. */
let jumpRequested = false

/** When true, log swim state about once per second (inWater, playerY, velocityY). Enable in console: window.__DEBUG_SWIM = true */
let DEBUG_SWIM = false
let lastSwimDebugTime = 0
declare global {
  interface Window {
    __DEBUG_SWIM?: boolean
  }
}
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__DEBUG_SWIM', {
    get: () => DEBUG_SWIM,
    set: (v: boolean) => {
      DEBUG_SWIM = v
      console.log('[swim] DEBUG_SWIM =', v)
    },
    configurable: true,
  })
}

const gravity = -18
const jumpForce = 6.71 // ~1.2522 block jump height (Minecraft Java)
const terminalVelocity = -78.4

const clock = new THREE.Clock()

/** Camera height in first-person (Minecraft: eyes at ~1.62). */
const eyeHeight = 1.62
const cameraDistance = 6
const cameraHeight = 2.5

let viewMode: 'first' | 'third' = 'first'

// ================= INPUT =================

/**
 * True when focus is in an input field (e.g. chat); used to avoid triggering game shortcuts.
 */
function isTypingFocus(): boolean {
  const el = document.activeElement
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return true
  if (el.isContentEditable) return true
  return false
}

document.addEventListener('keydown', (e) => {
  if (isTypingFocus()) return
  const code = e.code

  if (code === 'KeyP' && !e.repeat) {
    e.preventDefault()
    toggleTerrainDebug(terrainDebug)
    return
  }

  // Hotbar 1–9
  for (let i = 0; i < 9; i++) {
    if (getKeyBinding(`hotbar${i + 1}` as KeyAction) === code) {
      setHotbarIndex(i)
      return
    }
  }

  // Place block / torch (alternative to right-click, e.g. for Mac trackpad)
  if (code === getKeyBinding('place') && !e.repeat) {
    rightMouseJustPressed = true
    fKeyJustPressed = true
    return
  }

  // Skill 1 (e.g. Warrior Strike): next slash deals bonus damage; cooldown applied
  if (code === getKeyBinding('skill1') && !e.repeat) {
    const skill = getFirstSkillForClass(playerClass)
    if (skill && (skillCooldowns[skill.id] ?? 0) <= 0) {
      nextSlashEnhanced = true
      skillCooldowns[skill.id] = skill.cooldownSeconds
    }
    return
  }

  if (code === getKeyBinding('forward')) {
    moveState.forward = true
    if (!e.repeat) {
      const now = performance.now()
      if (lastWPressTime > 0 && now - lastWPressTime < DOUBLE_TAP_WINDOW_MS) {
        doubleTapSprint = true
      }
      lastWPressTime = now
    }
    return
  }
  if (code === getKeyBinding('sprint')) {
    sprintKeyHeld = true
    return
  }
  if (code === getKeyBinding('sneak')) {
    sneakKeyHeld = true
    return
  }
  if (code === getKeyBinding('back')) {
    moveState.back = true
    return
  }
  if (code === getKeyBinding('left')) {
    moveState.left = true
    return
  }
  if (code === getKeyBinding('right')) {
    moveState.right = true
    return
  }
  if (code === getKeyBinding('jump')) {
    if (!e.repeat) {
      jumpRequested = true
      if (playerGrounded && !isPlayerInWater()) velocityY = jumpForce
    }
    e.preventDefault()
    return
  }
  if (code === getKeyBinding('toggleView')) {
    viewMode = viewMode === 'first' ? 'third' : 'first'
  }
})

document.addEventListener('keyup', (e) => {
  if (isTypingFocus()) return
  const code = e.code
  if (code === getKeyBinding('forward')) {
    moveState.forward = false
    doubleTapSprint = false
    return
  }
  if (code === getKeyBinding('sprint')) sprintKeyHeld = false
  if (code === getKeyBinding('sneak')) sneakKeyHeld = false
  if (code === getKeyBinding('back')) moveState.back = false
  if (code === getKeyBinding('left')) moveState.left = false
  if (code === getKeyBinding('right')) moveState.right = false
  if (code === getKeyBinding('jump')) jumpRequested = false
})

// ================= SHADOW CAMERA (per frame, after movement) =================

/**
 * Aligns the directional light shadow camera to the current player position. Must be called after movement and before render so the shadow frustum stays centered and shadows are not clipped. Target is at player center (y + half height) for a good ortho view; light and target are updated with updateMatrixWorld so the shadow pass uses correct positions this frame.
 */
function updateShadowCameraForPlayer(
  light: THREE.DirectionalLight,
  playerPosition: THREE.Vector3,
  sunDirection: THREE.Vector3,
  sunDistance: number,
) {
  light.position.copy(playerPosition).addScaledVector(sunDirection, sunDistance)
  // Shadow-Target in Körpermitte, damit Spieler-Silhouette zentriert im Shadow-Map steht
  light.target.position.set(
    playerPosition.x,
    playerPosition.y + PLAYER_HEIGHT * 0.5,
    playerPosition.z,
  )
  // Sofortige Matrix-Aktualisierung, damit die Shadow-Pass in diesem Frame die richtigen Positionen nutzt
  light.updateMatrixWorld(true)
  light.target.updateMatrixWorld(true)
}

// ================= GAME LOOP =================

// FPS display (rolling average). fpsEl set in init(); lastFps passed to debug overlay.
let fpsFrameCount = 0
let fpsLastTime = performance.now()
let fpsEl: HTMLElement | null = null
/** Last computed FPS; updated every 500 ms, passed to terrain debug overlay when enabled. */
let lastFps: number | null = null
const terrainDebug: TerrainDebugState = createTerrainDebugState()

/**
 * Applies pending spawn or load when worker chunks are ready, updates terrain debug overlay (with FPS), and refreshes FPS display every 500 ms.
 */
function updateFPSAndSpawn(time: number): void {
  applyPendingSpawnIfReady()
  applyPendingLoadIfReady()
  updateTerrainDebugOverlaySystem(terrainDebug, time, player, { fps: lastFps })
  fpsFrameCount++
  const fpsElapsed = time * 1000 - fpsLastTime
  if (fpsElapsed >= 500) {
    const fps = Math.round((fpsFrameCount * 1000) / fpsElapsed)
    lastFps = fps
    if (fpsEl) fpsEl.textContent = `${fps} FPS`
    fpsFrameCount = 0
    fpsLastTime = time * 1000
  }
}

/**
 * Updates snow effect, atmosphere (sun/moon/sky/fog), terrain fog sync, and optional snow accumulation; tunes scene fog to render distance.
 */
function updateDayCycleAndAtmosphere(dt: number): void {
  const eyeY = player.position.y + (viewMode === 'first' ? eyeHeight : cameraHeight)
  const snowCtx = {
    playerPosition: player.position,
    waterSurfaceY: WATER_LEVEL + WATER_BLOCK_HEIGHT,
    eyeY,
    biome: getResolvedBiome(player.position.x, player.position.z),
  }
  snowEffect.update(dt, snowCtx)
  const isSnowing = snowEffect.isSnowing(snowCtx)

  const ctx: AtmosphereContext = {
    playerPosition: player.position,
    viewMode,
    eyeHeight,
    cameraHeight,
    waterLevel: WATER_LEVEL,
    waterBlockHeight: WATER_BLOCK_HEIGHT,
    scene,
    renderer,
    sunLight,
    sunMesh,
    moonMesh,
    sky,
    stars,
    clouds,
    cloudMaterial,
    isSnowing,
    ambientLight,
    hemiLight,
  }
  updateAtmosphere(dt, ctx)
  if (snowEffect.isSnowing(snowCtx)) {
    tryUpdateSnowAccumulation(
      getChunkSyncCtx(),
      dt,
      player.position.x,
      player.position.z,
      snowEffect.getForced?.() ?? null,
      snowCtx.waterSurfaceY,
    )
  }

  // Tune fog range to render distance so far LOD fades into the sky cleanly.
  // Fog starts later (FOG_NEAR_CHUNK_FACTOR) so distant terrain and trees are fogged consistently.
  if (scene.fog && 'far' in scene.fog) {
    // If underwater, atmosphere sets a short fog range; keep that.
    if (scene.fog.far > 50) {
      const rd = getRenderDistance()
      const farStart = Math.max(2, rd - 2)
      scene.fog.near = Math.max(10, farStart * CHUNK_SIZE * FOG_NEAR_CHUNK_FACTOR)
      scene.fog.far = Math.max(scene.fog.near + 10, rd * CHUNK_SIZE * FOG_FAR_CHUNK_FACTOR)
    }
  }
  syncTerrainFogFromSceneFog(scene)
}

/**
 * When player moves to a new chunk, triggers chunk manager to load/unload chunks and updates lastPlayerChunkX/Z; precomputes right vector for movement.
 */
function updateChunkVisibility(): void {
  const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE)
  const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE)
  _direction.set(0, 0, 0)
  controls.getDirection(_direction)
  _direction.y = 0
  if (_direction.lengthSq() > 0) _direction.normalize()
  if (lastPlayerChunkX !== playerChunkX || lastPlayerChunkZ !== playerChunkZ) {
    updateChunksFromModule({
      scene,
      player,
      lookDirection: { x: _direction.x, z: _direction.z },
      chunkWorker,
      pendingChunkKeys,
      generateChunkSync: generateChunk,
      unloadChunk,
    })
    lastPlayerChunkX = playerChunkX
    lastPlayerChunkZ = playerChunkZ
    const r = MAP_DISCOVER_RADIUS_CHUNKS
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = playerChunkX + dx
        const cz = playerChunkZ + dz
        const keyNum = chunkKeyNumeric(cx, cz)
        discoveredChunkKeys.add(keyNum)
        const chunkData = chunks.get(keyNum)
        if (chunkData?.heightmapBuffer) {
          writeHeightmap(
            WORLD_SEED,
            keyNum,
            chunkData.heightmapBuffer,
            chunkData.biomeMapBuffer,
          )
        }
      }
    }
  }
  _right.crossVectors(_direction, camera.up).normalize()
}

/** Vertical offset from feet: player is "in water" when (position.y + offset) is below water surface. Avoids triggering on shallow contact. */
const WATER_ENTRY_OFFSET = PLAYER_HEIGHT * 0.2

/**
 * True when the player is considered submerged in water. Requires both being below the global water surface and
 * actually occupying a water voxel (so caves below sea level are not treated as water).
 */
function isPlayerInWater(): boolean {
  const waterSurfaceY = WATER_LEVEL + WATER_BLOCK_HEIGHT
  if (player.position.y + WATER_ENTRY_OFFSET >= waterSurfaceY) return false

  const bx = Math.floor(player.position.x)
  const bz = Math.floor(player.position.z)
  const byFeet = Math.floor(player.position.y)
  const byHead = Math.floor(player.position.y + PLAYER_HEIGHT - 0.01)

  for (let by = byFeet; by <= byHead; by++) {
    const block = getBlockAt(bx, by, bz)
    if (block !== null && isWaterBlock(block)) return true
  }
  return false
}

/**
 * Applies movement (walk/sprint/sneak), FOV/pointer speed lerp, jump buffer, gravity, voxel collision; updates entity AI, movement, and animation.
 */
function updateMovementAndCollision(dt: number, time: number): void {
  const inWater = isPlayerInWater()
  isSprinting = moveState.forward && !sneakKeyHeld && (sprintKeyHeld || doubleTapSprint)
  let speed = sneakKeyHeld ? sneakSpeed : isSprinting ? sprintSpeed : moveSpeed
  let backSpeed = sneakKeyHeld ? sneakSpeed : moveSpeed
  let maxSpeed = sneakKeyHeld
    ? horizontalMaxSpeedSneak
    : isSprinting
      ? horizontalMaxSpeedSprint
      : horizontalMaxSpeed
  if (inWater) {
    speed *= waterHorizontalSpeedFactor
    backSpeed *= waterHorizontalSpeedFactor
    maxSpeed *= waterHorizontalSpeedFactor
  }

  // POV-FOV: beim Sprint etwas zoomen (größeres FOV = schnellerer Eindruck)
  const targetFov = isSprinting && moveState.forward ? getFovSprint() : getFovNormal()
  camera.fov += (targetFov - camera.fov) * Math.min(1, FOV_LERP_SPEED * dt)
  // Projektion nur bei spürbarer FOV-Änderung neu hochladen (spart GPU-Arbeit im Ruhezustand)
  if (Math.abs(camera.fov - _lastUploadedFov) > 0.05) {
    camera.updateProjectionMatrix()
    _lastUploadedFov = camera.fov
  }

  // Maus-Sensitivität beim Sprint etwas höher
  const targetPointerSpeed =
    isSprinting && moveState.forward ? getPointerSpeedSprint() : getPointerSpeed()
  controls.pointerSpeed +=
    (targetPointerSpeed - controls.pointerSpeed) * Math.min(1, FOV_LERP_SPEED * dt)

  // Freeze physics while waiting for authoritative spawn chunks from the worker
  if (pendingSpawn) {
    velocityX = 0
    velocityY = 0
    velocityZ = 0
    playerGrounded = true
  }

  // Desired horizontal velocity in units per second
  let wishX = 0
  let wishZ = 0
  if (!pendingSpawn && moveState.forward) {
    wishX += _direction.x * speed
    wishZ += _direction.z * speed
  }
  if (!pendingSpawn && moveState.back) {
    wishX -= _direction.x * backSpeed
    wishZ -= _direction.z * backSpeed
  }
  if (!pendingSpawn && moveState.right) {
    wishX += _right.x * speed
    wishZ += _right.z * speed
  }
  if (!pendingSpawn && moveState.left) {
    wishX -= _right.x * speed
    wishZ -= _right.z * speed
  }

  // Vertical: in water use Space to swim up (while held), Shift to sink faster, else slow sink; on land use normal jump
  if (inWater) {
    if (jumpRequested) {
      velocityY = waterSwimUpSpeed
      // Do not clear jumpRequested here: keyup clears it; while Space is held we want continuous swim-up
    } else if (sneakKeyHeld) {
      velocityY = -waterSinkSpeedSneak
    } else {
      velocityY = -waterSinkSpeed
    }
    velocityY = THREE.MathUtils.clamp(velocityY, -waterVerticalSpeedCap, waterVerticalSpeedCap)
    if (DEBUG_SWIM && inWater) {
      const now = performance.now()
      if (now - lastSwimDebugTime >= 1000) {
        lastSwimDebugTime = now
        const waterSurfaceY = WATER_LEVEL + WATER_BLOCK_HEIGHT
        console.log('[swim]', {
          inWater: true,
          playerY: player.position.y.toFixed(2),
          waterSurfaceY,
          jumpRequested,
          sneakKeyHeld,
          velocityY: velocityY.toFixed(2),
        })
      }
    }
  } else {
    if (jumpRequested && playerGrounded) {
      velocityY = jumpForce
      jumpRequested = false
    }
  }

  const onGround = playerGrounded

  if (onGround) {
    velocityX = wishX
    velocityZ = wishZ
    if (wishX === 0 && wishZ === 0) {
      velocityX *= Math.pow(groundFriction, dt)
      velocityZ *= Math.pow(groundFriction, dt)
    }
  } else {
    velocityX += wishX * airControl * dt
    velocityZ += wishZ * airControl * dt
    const len = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ)
    if (len > maxSpeed) {
      const s = maxSpeed / len
      velocityX *= s
      velocityZ *= s
    }
  }

  // Apply gravity only when not grounded and not in water (water has its own vertical behaviour)
  if (!playerGrounded && !inWater) {
    velocityY += gravity * dt
    if (velocityY < terminalVelocity) velocityY = terminalVelocity
  }

  const vel = { x: velocityX, y: velocityY, z: velocityZ }
  const prevPos = DEBUG_COLLISION
    ? { x: player.position.x, y: player.position.y, z: player.position.z }
    : null
  const collisionDebug: CollisionDebug | undefined = DEBUG_COLLISION ? { snaps: [] } : undefined
  const wasGroundedAtStartOfFrame = playerGrounded
  const collisionResult = resolveVoxelCollisions(
    player.position,
    vel,
    dt,
    PLAYER_HALF,
    PLAYER_HALF,
    PLAYER_HEIGHT,
    collisionDebug,
    inWater || playerGrounded,
    wasGroundedAtStartOfFrame,
  )
  velocityX = vel.x
  velocityY = vel.y
  velocityZ = vel.z
  playerGrounded = collisionResult.grounded

  if (DEBUG_COLLISION && prevPos && collisionDebug) {
    const dx = player.position.x - prevPos.x
    const dy = player.position.y - prevPos.y
    const dz = player.position.z - prevPos.z
    const largeDelta = Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02 || Math.abs(dz) > 0.02
    if (debugCollisionLogCooldown <= 0 && (collisionDebug.snaps.length > 0 || largeDelta)) {
      console.log('[collision]', {
        delta: { x: dx.toFixed(4), y: dy.toFixed(4), z: dz.toFixed(4) },
        vel: { x: vel.x.toFixed(3), y: vel.y.toFixed(3), z: vel.z.toFixed(3) },
        grounded: collisionResult.grounded,
        snaps: collisionDebug.snaps.map(
          (s: { axis: 'x' | 'z' | 'y'; reason: string; from: number; to: number }) =>
            `${s.axis}:${s.reason} ${s.from.toFixed(3)}→${s.to.toFixed(3)}`,
        ),
      })
      debugCollisionLogCooldown = 20
    }
    if (debugCollisionLogCooldown > 0) debugCollisionLogCooldown--
  }

  updateAI({ x: player.position.x, y: player.position.y, z: player.position.z }, dt, time)
  updateMovement(dt, (pos, v, d, hx, hz, height) => {
    resolveVoxelCollisions(pos, v, d, hx, hz, height)
  })
  updateAnimation(time)
  updateHurtFlash(time)
  updateAllQuestNpcIcons(getAllEntities)
}

/**
 * Updates look yaw/pitch, first/third person visibility and camera position (POV hands, head bob, third-person orbit), and limb swing animations.
 */
function updateCameraAndViewMode(time: number, dt: number): void {
  // Skill cooldowns: tick down every frame
  for (const id of Object.keys(skillCooldowns)) {
    skillCooldowns[id] = Math.max(0, skillCooldowns[id] - dt)
  }

  controls.getDirection(_lookDir)

  // Blickrichtung: Yaw (horizontal) und Pitch (vertikal), Pitch begrenzt
  const lookYaw = Math.atan2(_lookDir.x, -_lookDir.z)
  const lookPitchRaw = -Math.asin(THREE.MathUtils.clamp(_lookDir.y, -1, 1))
  const lookPitch = THREE.MathUtils.clamp(lookPitchRaw, -HEAD_PITCH_MAX, HEAD_PITCH_MAX)
  lastLookYaw = lookYaw
  lastLookPitch = lookPitch

  if (viewMode === 'first') {
    head.visible = false
    body.visible = false
    leg1.visible = false
    leg2.visible = false
    arm1.visible = false
    arm2.visible = false

    povHands.visible = true
    updatePOVHeldItem()

    // POV-Schattenkörper: Position = Spieler, Kopf-Rotation = Blickrichtung, nur als Schatten sichtbar
    povShadowBody.visible = true
    povShadowBody.position.copy(player.position)
    ;(povShadowBody.children[0] as THREE.Mesh).rotation.copy(head.rotation)

    // First-Person: Kopf = Blickrichtung (kein Körper-Rotation)
    head.rotation.y = lookYaw
    head.rotation.x = lookPitch

    // POV-Hände: Slash (Waffe), Mining-Schwung oder Lauf-Wackeln
    const isMining = breakTarget !== null
    const povArm = povHands.children[0] as THREE.Mesh
    if (attackState !== 'idle') {
      slashPhase += dt
      if (slashPhase >= SLASH_TOTAL_DURATION) {
        attackState = 'idle'
        slashHitCheckedThisCycle = false
      }
      // Entity hit: once per slash in the first frame after slash start
      if (
        attackState === 'slashing' &&
        slashPhase > 0 &&
        slashPhase <= dt * 1.5 &&
        !slashHitCheckedThisCycle
      ) {
        slashHitCheckedThisCycle = true
        rayOrigin.copy(camera.position)
        camera.getWorldDirection(rayDirection)
        const hit = raycastEntities(rayOrigin, rayDirection, ENTITY_ATTACK_DISTANCE)
        if (hit && !hit.entity.questGiver && hit.entity.disposition !== 'friendly') {
          if (hit.entity.disposition === 'neutral') {
            hit.entity.disposition = 'aggro'
          }
          const weaponType = getWeaponType(currentSlashWeapon ?? '')
          let damage = getSlashDamage(weaponType)
          if (nextSlashEnhanced) {
            damage *= 1.5
            nextSlashEnhanced = false
          }
          hit.entity.health -= damage
          hit.entity.fleeUntilTime = time + FLEE_DURATION_AFTER_HIT
          if (hit.entity.health > 0) {
            hit.entity.hurtUntilTime = time + HURT_FLASH_DURATION_SECONDS
            const dx = hit.entity.position.x - player.position.x
            const dz = hit.entity.position.z - player.position.z
            const len = Math.sqrt(dx * dx + dz * dz)
            if (len > 0) {
              hit.entity.velocity.x += (dx / len) * KNOCKBACK_HORIZONTAL_SPEED
              hit.entity.velocity.z += (dz / len) * KNOCKBACK_HORIZONTAL_SPEED
            }
            hit.entity.velocity.y += KNOCKBACK_VERTICAL_SPEED
          }
          if (hit.entity.health <= 0) {
            const deadKind = hit.entity.kind
            const pos = { ...hit.entity.position }
            hit.entity.state = 'dead'
            const mesh = removeEntity(hit.entity.id)
            if (mesh) {
              scene.remove(mesh)
              mesh.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                  obj.geometry?.dispose()
                  if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
                  else obj.material?.dispose()
                }
              })
            }
            const dropSize = 0.35
            let groundY = pos.y - 0.5
            for (let by = Math.floor(pos.y - 1); by >= WORLD_MIN_Y; by--) {
              const t = getBlockAt(pos.x, by, pos.z)
              if (t !== null && t !== 'air' && isBlockTypeSolid(t as BlockType)) {
                groundY = by + getBlockHeight(t as BlockType)
                break
              }
            }
            const restY = groundY + dropSize * 0.5
            const loot = rollLoot(deadKind)
            for (const { item, count } of loot) {
              for (let i = 0; i < count; i++) {
                const offsetX = (Math.random() - 0.5) * 0.4
                const offsetZ = (Math.random() - 0.5) * 0.4
                spawnDropItem({
                  scene,
                  drops,
                  worldX: pos.x + offsetX,
                  worldZ: pos.z + offsetZ,
                  startY: pos.y,
                  restY,
                  blockType: item as BlockType,
                  time,
                })
              }
            }
            if (deadKind !== 'villager') {
              const area = getAreaAt(pos.x, pos.z)
              if (area) {
                const xpAmount = getXpDropForArea(area)
                spawnXpDropItem({
                  scene,
                  drops,
                  worldX: pos.x,
                  worldZ: pos.z,
                  startY: pos.y,
                  restY,
                  amount: xpAmount,
                  time,
                })
              }
            }
            notifyQuestKill(deadKind)
          }
        }
      }
      const arc = getSlashArc(slashPhase, SLASH_DURATION)
      const v = currentSlashVariant
      povHands.rotation.y = arc * SLASH_HAND_ROTATION_Y * v.y
      povHands.rotation.x = arc * SLASH_HAND_ROTATION_X * v.x
      povHands.rotation.z = arc * SLASH_HAND_ROTATION_X * v.z
      const targetPosX = 0
      const targetPosY = 0
      const targetPosZ = 0
      const targetArmX = POV_ARM_BASE_ROTATION_X
      const targetArmY = POV_ARM_BASE_ROTATION_Y
      const targetArmZ = POV_ARM_BASE_ROTATION_Z
      povHandAnimX += (targetPosX - povHandAnimX) * POV_HAND_LERP
      povHandAnimY += (targetPosY - povHandAnimY) * POV_HAND_LERP
      povHandAnimZ += (targetPosZ - povHandAnimZ) * POV_HAND_LERP
      povArmRotX += (targetArmX - povArmRotX) * POV_ARM_LERP
      povArmRotY += (targetArmY - povArmRotY) * POV_ARM_LERP
      povArmRotZ += (targetArmZ - povArmRotZ) * POV_ARM_LERP
      povHands.position.set(povHandAnimX, povHandAnimY, povHandAnimZ)
      povArm.rotation.x = povArmRotX
      povArm.rotation.y = povArmRotY
      povArm.rotation.z = povArmRotZ
    } else if (isMining) {
      miningSwingPhase += dt
      const swing = Math.sin(miningSwingPhase * 14) * 0.52
      const pullZ = 0.02 + Math.max(0, Math.sin(miningSwingPhase * 14)) * 0.04
      const targetPosX = 0
      const targetPosY = 0
      const targetPosZ = pullZ
      const targetArmX = POV_ARM_BASE_ROTATION_X + swing
      const targetArmY = POV_ARM_BASE_ROTATION_Y
      const targetArmZ = POV_ARM_BASE_ROTATION_Z
      povHandAnimX += (targetPosX - povHandAnimX) * POV_HAND_LERP
      povHandAnimY += (targetPosY - povHandAnimY) * POV_HAND_LERP
      povHandAnimZ += (targetPosZ - povHandAnimZ) * POV_HAND_LERP
      povArmRotX += (targetArmX - povArmRotX) * POV_ARM_LERP
      povArmRotY += (targetArmY - povArmRotY) * POV_ARM_LERP
      povArmRotZ += (targetArmZ - povArmRotZ) * POV_ARM_LERP
      povHands.position.set(povHandAnimX, povHandAnimY, povHandAnimZ)
      povArm.rotation.x = povArmRotX
      povArm.rotation.y = povArmRotY
      povArm.rotation.z = povArmRotZ
      povHands.rotation.y = 0
      povHands.rotation.z = 0
    } else {
      miningSwingPhase = 0
      const isMoving = moveState.forward || moveState.back || moveState.left || moveState.right
      const wiggleSpeed = 14
      const wiggleAmount = 0.028
      const targetPosX = 0
      const targetPosY = isMoving ? Math.sin(time * wiggleSpeed * 0.5) * -0.008 : 0
      const targetPosZ = isMoving ? Math.sin(time * wiggleSpeed) * wiggleAmount : 0
      const targetArmX = POV_ARM_BASE_ROTATION_X
      const targetArmY = POV_ARM_BASE_ROTATION_Y
      const targetArmZ = POV_ARM_BASE_ROTATION_Z
      povHandAnimX += (targetPosX - povHandAnimX) * POV_HAND_LERP
      povHandAnimY += (targetPosY - povHandAnimY) * POV_HAND_LERP
      povHandAnimZ += (targetPosZ - povHandAnimZ) * POV_HAND_LERP
      povArmRotX += (targetArmX - povArmRotX) * POV_ARM_LERP
      povArmRotY += (targetArmY - povArmRotY) * POV_ARM_LERP
      povArmRotZ += (targetArmZ - povArmRotZ) * POV_ARM_LERP
      povHands.position.set(povHandAnimX, povHandAnimY, povHandAnimZ)
      povArm.rotation.x = povArmRotX
      povArm.rotation.y = povArmRotY
      povArm.rotation.z = povArmRotZ
      povHands.rotation.y = 0
      povHands.rotation.z = 0
    }

    // Camera head bobbing (Minecraft-like): based on actual horizontal speed and grounded state.
    const horizSpeed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ)
    const denom = sneakKeyHeld
      ? horizontalMaxSpeedSneak
      : isSprinting
        ? horizontalMaxSpeedSprint
        : horizontalMaxSpeed
    const speedFactor = denom > 1e-6 ? THREE.MathUtils.clamp(horizSpeed / denom, 0, 1) : 0
    const airFactor = playerGrounded ? 1 : 0.12
    const targetStrength = speedFactor > 0.02 ? speedFactor * airFactor : 0
    const strengthLerp = 1 - Math.exp(-14 * dt)
    cameraBobStrength += (targetStrength - cameraBobStrength) * strengthLerp

    const sprintMul = isSprinting ? 1.15 : 1
    const sneakMul = sneakKeyHeld ? 0.85 : 1
    const bobSpeed = (4 + 7 * cameraBobStrength) * sprintMul * sneakMul
    cameraBobPhase += dt * bobSpeed

    const ampY = 0.095 * sprintMul
    const ampX = 0.155 * sprintMul
    const targetBobY = Math.sin(cameraBobPhase * 2) * ampY * cameraBobStrength
    const targetBobX = Math.cos(cameraBobPhase) * ampX * cameraBobStrength
    const bobLerp = 1 - Math.exp(-18 * dt)
    cameraBobX += (targetBobX - cameraBobX) * bobLerp
    cameraBobY += (targetBobY - cameraBobY) * bobLerp

    _cameraOffset.set(cameraBobX, eyeHeight + cameraBobY, 0)
    camera.position.copy(player.position).add(_cameraOffset)
  } else {
    head.visible = true
    body.visible = true
    leg1.visible = true
    leg2.visible = true
    arm1.visible = true
    arm2.visible = true

    povHands.visible = false

    povShadowBody.visible = false

    // Third-Person: body/head face look direction. Look yaw 0 = -Z; mesh forward = +Z, so use meshYaw = lookYaw - PI.
    const isMovingThird = moveState.forward || moveState.back || moveState.left || moveState.right
    const velLenSq = velocityX * velocityX + velocityZ * velocityZ
    const bodyMeshYaw =
      isMovingThird && velLenSq > 1e-6
        ? Math.atan2(velocityX, velocityZ)
        : lookYaw - Math.PI
    player.rotation.y = bodyMeshYaw
    const headYawRel = (lookYaw - Math.PI) - bodyMeshYaw
    head.rotation.y = THREE.MathUtils.euclideanModulo(headYawRel + Math.PI, Math.PI * 2) - Math.PI
    head.rotation.x = lookPitch

    // Arm-/Bein-Schwung beim Laufen (gegenphasig wie Gehen)
    const isMoving = moveState.forward || moveState.back || moveState.left || moveState.right
    const armSwingAmount = 0.35
    const armSwingSpeed = 14
    const legSwingAmount = 0.5
    const legSwingSpeed = 14
    if (isMoving) {
      arm1.rotation.z = Math.sin(time * armSwingSpeed) * armSwingAmount
      arm2.rotation.z = -Math.sin(time * armSwingSpeed) * armSwingAmount
      leg1.rotation.x = Math.sin(time * legSwingSpeed) * legSwingAmount
      leg2.rotation.x = -Math.sin(time * legSwingSpeed) * legSwingAmount
    } else {
      arm1.rotation.z *= 0.85
      arm2.rotation.z *= 0.85
      leg1.rotation.x *= 0.8
      leg2.rotation.x *= 0.8
    }

    _lookDir.y = 0
    _lookDir.normalize()
    _cameraOffset.set(0, cameraHeight, 0)
    camera.position
      .copy(player.position)
      .add(_cameraOffset)
      .addScaledVector(_lookDir, -cameraDistance)
    // Kamera immer auf Spieler-Mitte richten → Char bleibt beim Umschauen im Zentrum (Fadenkreuz)
    _thirdPersonLookTarget.set(
      player.position.x,
      player.position.y + PLAYER_HEIGHT * 0.5,
      player.position.z,
    )
    camera.lookAt(_thirdPersonLookTarget)
  }
}

/**
 * Updates drop landing animation, bobbing, magnet pull, and pickup within PICKUP_RADIUS.
 */
function updateDropsAndPickup(time: number, dt: number): void {
  updateDropsAndPickupSystem({
    scene,
    drops,
    playerX: player.position.x,
    playerY: player.position.y + PLAYER_HEIGHT * 0.5,
    playerZ: player.position.z,
    time,
    dt,
    config: {
      pickupRadius: PICKUP_RADIUS,
      bobSpeed: DROP_BOB_SPEED,
      bobHeight: DROP_BOB_HEIGHT,
      magnetRadius: MAGNET_RADIUS,
      magnetSpeed: MAGNET_SPEED,
    },
    onXpPickup(amount) {
      const next = addExperienceFn(playerLevel, playerExperience, amount)
      playerLevel = next.level
      playerExperience = next.experience
    },
  })
}

/**
 * Runs periodic block updates (e.g. crop growth) at BLOCK_TICK_INTERVAL; currently drives wheat growth probability.
 */
function runBlockTick(time: number): void {
  if (time - lastBlockTickTime < BLOCK_TICK_INTERVAL) return
  lastBlockTickTime = time
  const changes: Array<{
    keyStr: string
    bx: number
    by: number
    bz: number
    next: BlockType
  }> = []
  for (const [keyStr, value] of blockModifications) {
    if (value === 'air') continue
    const match = /^wheat_([1-7])$/.exec(value)
    if (!match) continue
    if (Math.random() >= WHEAT_GROWTH_PROBABILITY) continue
    const stage = parseInt(match[1], 10)
    const parts = keyStr.split(',')
    const bx = Number(parts[0])
    const by = Number(parts[1])
    const bz = Number(parts[2])
    changes.push({
      keyStr,
      bx,
      by,
      bz,
      next: `wheat_${stage + 1}` as BlockType,
    })
  }
  for (const { keyStr, bx, next } of changes) {
    blockModifications.set(keyStr, next)
    const parts = keyStr.split(',')
    const by = Number(parts[1])
    const bz2 = Number(parts[2])
    applyBlockChangeToLoadedChunk({ bx, by, bz: bz2, next })
  }
}

/** Max water spread changes per tick to cap cost. */
const WATER_SPREAD_MAX_CHANGES_PER_TICK = 40

/**
 * Runs water flow every WATER_SPREAD_INTERVAL_SEC: collects water block positions from loaded chunks and blockMods,
 * computes spread (fall then horizontal), applies changes via blockModifications and refreshChunkVisibleMeshes.
 */
function runWaterFlowTick(time: number): void {
  if (time - lastWaterSpreadTime < WATER_SPREAD_INTERVAL_SEC) return
  lastWaterSpreadTime = time

  const waterPositions: Array<{ bx: number; by: number; bz: number }> = []
  const seen = new Set<string>()

  for (const [, data] of chunks) {
    const worldX = data.cx * CHUNK_SIZE
    const worldZ = data.cz * CHUNK_SIZE
    for (const [key, type] of data.voxelMap) {
      if (!isWaterBlock(type)) continue
      const { lx, ly, lz } = decodeLocalKey(key)
      const bx = worldX + lx
      const bz = worldZ + lz
      const k = `${bx},${ly},${bz}`
      if (seen.has(k)) continue
      const effective = getBlockAt(bx, ly, bz)
      if (effective === null || !isWaterBlock(effective)) continue
      seen.add(k)
      waterPositions.push({ bx, by: ly, bz })
    }
  }
  for (const [keyStr, value] of blockModifications) {
    if (!isWaterBlock(value)) continue
    const parts = keyStr.split(',')
    const bx = Number(parts[0])
    const by = Number(parts[1])
    const bz = Number(parts[2])
    const cx = Math.floor(bx / CHUNK_SIZE)
    const cz = Math.floor(bz / CHUNK_SIZE)
    if (!chunks.has(chunkKeyNumeric(cx, cz))) continue
    if (seen.has(keyStr)) continue
    seen.add(keyStr)
    waterPositions.push({ bx, by, bz })
  }

  // Process higher blocks first, then lower water level (source before flowing) for deterministic "fall first" behaviour.
  waterPositions.sort((a, b) => {
    if (a.by !== b.by) return b.by - a.by
    const levelA = getWaterLevel(getBlockAt(a.bx, a.by, a.bz) ?? 'air')
    const levelB = getWaterLevel(getBlockAt(b.bx, b.by, b.bz) ?? 'air')
    return levelA - levelB
  })

  const changes = computeWaterSpread({
    getBlockAt,
    isSolid: isBlockTypeSolid,
    waterPositions,
    maxChangesPerTick: WATER_SPREAD_MAX_CHANGES_PER_TICK,
  })

  for (const { bx, by, bz, value } of changes) {
    const keyStr = blockKeyString(bx, by, bz)
    blockModifications.set(keyStr, value)
    applyBlockChangeToLoadedChunk({ bx, by, bz, next: value })
  }
}

/** Neighbor offsets for 6 directions (for immediate water spread when a block is broken). */
const NEIGHBOR_OFFSETS: Array<[number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/**
 * Runs one water spread pass from the neighbors of (bx, by, bz).
 * Used when a block is broken so water immediately flows into the new air.
 */
function runWaterSpreadFromNeighbors(bx: number, by: number, bz: number): void {
  const waterPositions: Array<{ bx: number; by: number; bz: number }> = []
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    const nx = bx + dx
    const ny = by + dy
    const nz = bz + dz
    const t = getBlockAt(nx, ny, nz)
    if (t !== null && isWaterBlock(t)) waterPositions.push({ bx: nx, by: ny, bz: nz })
  }
  if (waterPositions.length === 0) return

  // Same order as periodic tick: higher Y first, then lower level first.
  waterPositions.sort((a, b) => {
    if (a.by !== b.by) return b.by - a.by
    const levelA = getWaterLevel(getBlockAt(a.bx, a.by, a.bz) ?? 'air')
    const levelB = getWaterLevel(getBlockAt(b.bx, b.by, b.bz) ?? 'air')
    return levelA - levelB
  })

  const changes = computeWaterSpread({
    getBlockAt,
    isSolid: isBlockTypeSolid,
    waterPositions,
    maxChangesPerTick: WATER_SPREAD_MAX_CHANGES_PER_TICK,
  })

  for (const { bx: cx, by: cy, bz: cz, value } of changes) {
    const keyStr = blockKeyString(cx, cy, cz)
    blockModifications.set(keyStr, value)
    applyBlockChangeToLoadedChunk({ bx: cx, by: cy, bz: cz, next: value })
  }
}

/**
 * Returns true if the 1×1×1 block cell at (adjX, adjY, adjZ) overlaps any living entity's AABB.
 */
function blockCellOverlapsAnyEntity(adjX: number, adjY: number, adjZ: number): boolean {
  for (const e of getAllEntities()) {
    if (e.state === 'dead') continue
    const overlapX =
      Math.min(adjX + 0.5, e.position.x + e.aabb.halfX) >
      Math.max(adjX - 0.5, e.position.x - e.aabb.halfX)
    const overlapY =
      Math.min(adjY + 0.5, e.position.y + e.aabb.height) > Math.max(adjY - 0.5, e.position.y)
    const overlapZ =
      Math.min(adjZ + 0.5, e.position.z + e.aabb.halfZ) >
      Math.max(adjZ - 0.5, e.position.z - e.aabb.halfZ)
    if (overlapX && overlapY && overlapZ) return true
  }
  return false
}

/**
 * Returns true if point (x, y, z) is inside any living entity's AABB (e.g. for torch placement).
 */
function pointInAnyEntityAABB(x: number, y: number, z: number): boolean {
  for (const e of getAllEntities()) {
    if (e.state === 'dead') continue
    if (
      x >= e.position.x - e.aabb.halfX &&
      x <= e.position.x + e.aabb.halfX &&
      y >= e.position.y &&
      y <= e.position.y + e.aabb.height &&
      z >= e.position.z - e.aabb.halfZ &&
      z <= e.position.z + e.aabb.halfZ
    )
      return true
  }
  return false
}

/**
 * Resolves a raycaster hit to block world coordinates and type. Handles instanced meshes, worker geometry, and snow-layer preference.
 * @param hit - First hit from raycaster.intersectObjects(getRaycastMeshes()).
 * @returns Block position and type, or null if not a solid block.
 */
function resolveRaycastHitToBlock(
  hit: THREE.Intersection,
): { x: number; y: number; z: number; blockType: BlockType; chunkKeyNum: number } | null {
  if (!hit.face) return null
  const faceNormal = new THREE.Vector3()
    .copy(hit.face.normal)
    .transformDirection(hit.object.matrixWorld)

  /** When aiming at the top of a block that has snow on it, prefer the snow layer. */
  function preferSnowLayerIfAimingAbove(
    bx: number,
    by: number,
    bz: number,
    hitPointY: number,
  ): { x: number; y: number; z: number; blockType: BlockType; chunkKeyNum: number } | null {
    if (hitPointY < by + 0.5) return null
    if (by >= WORLD_MAX_Y) return null
    const above = getBlockAt(bx, by + 1, bz)
    if (above === null || above === 'air') return null
    if (!/^snow_layer_[1-8]$/.test(above)) return null
    return {
      x: bx,
      y: by + 1,
      z: bz,
      blockType: above as BlockType,
      chunkKeyNum: chunkKeyNumeric(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE)),
    }
  }

  if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
    const ud = hit.object.userData as { chunkKeyNum: number; blockType: BlockType }
    let chunkKeyNum = ud.chunkKeyNum
    let blockType = ud.blockType
    let pos = getBlockWorldPosition(chunkKeyNum, blockType, hit.instanceId)
    const snowPrefer = pos
      ? preferSnowLayerIfAimingAbove(pos.x, pos.y, pos.z, hit.point.y)
      : null
    if (snowPrefer) {
      chunkKeyNum = snowPrefer.chunkKeyNum
      blockType = snowPrefer.blockType
      pos = { x: snowPrefer.x, y: snowPrefer.y, z: snowPrefer.z }
    }
    if (!pos) return null
    return { x: pos.x, y: pos.y, z: pos.z, blockType, chunkKeyNum }
  }

  let bx = Math.floor(hit.point.x - faceNormal.x * 0.01)
  let by = Math.floor(hit.point.y - faceNormal.y * 0.01)
  let bz = Math.floor(hit.point.z - faceNormal.z * 0.01)
  let at = getBlockAt(bx, by, bz)
  const snowPrefer =
    at !== null && at !== 'air' ? preferSnowLayerIfAimingAbove(bx, by, bz, hit.point.y) : null
  if (snowPrefer) {
    bx = snowPrefer.x
    by = snowPrefer.y
    bz = snowPrefer.z
    at = snowPrefer.blockType
  }
  if (at === null || at === 'air') return null
  const chunkKeyNum = chunkKeyNumeric(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE))
  return { x: bx, y: by, z: bz, blockType: at, chunkKeyNum }
}

/**
 * Handles block break (hold-to-mine with progress, raycast to block), block/torch place (right-click or F), and block-crack overlay updates.
 */
function updateBlockBreakAndPlace(dt: number, time: number): void {
  // Aimed block (for outline): one raycast per frame when pointer lock is active.
  let currentHit: THREE.Intersection | null = null
  let currentResolved: ReturnType<typeof resolveRaycastHitToBlock> = null
  if (document.pointerLockElement === renderer.domElement && camera) {
    rayOrigin.copy(camera.position)
    camera.getWorldDirection(rayDirection)
    raycaster.set(rayOrigin, rayDirection)
    raycaster.far = BREAK_DISTANCE
    const blockMeshesAimed = getRaycastMeshes()
    const hitsAimed = raycaster.intersectObjects(blockMeshesAimed)
    currentHit = hitsAimed[0]?.face ? hitsAimed[0] : null
    currentResolved = currentHit ? resolveRaycastHitToBlock(currentHit) : null
    aimedBlock = currentResolved ? { x: currentResolved.x, y: currentResolved.y, z: currentResolved.z } : null
  } else {
    aimedBlock = null
    currentHit = null
    currentResolved = null
  }

  // Place (right-click or F): torch or block; F works without pointer lock
  const placeRequested =
    (rightMouseJustPressed && document.pointerLockElement === renderer.domElement) ||
    fKeyJustPressed
  if (placeRequested && camera) {
    rayOrigin.copy(camera.position)
    camera.getWorldDirection(rayDirection)
    const entityHit = raycastEntities(rayOrigin, rayDirection, PLACE_DISTANCE)
    if (entityHit?.entity.questGiver && onQuestNpcInteract) {
      rightMouseJustPressed = false
      fKeyJustPressed = false
      const talkTargetId = entityHit.entity.questGiver.talkTargetId ?? entityHit.entity.id
      notifyQuestTalk(talkTargetId)
      onQuestNpcInteract(entityHit.entity.questGiver)
      return
    }
    rightMouseJustPressed = false
    fKeyJustPressed = false
    raycaster.set(rayOrigin, rayDirection)
    raycaster.far = PLACE_DISTANCE
    const blockMeshesPlace = getRaycastMeshes()
    const placeHits = raycaster.intersectObjects(blockMeshesPlace)
    const placeHit = placeHits[0]
    if (!placeHit || !placeHit.face) {
      if (isPlaceDebug()) {
        console.warn(
          'Place (F): no block hit — raycast missed (looking at sky, empty space, or chunk not loaded). Meshes:',
          blockMeshesPlace.length,
          '— No item was consumed on this keypress.'
        )
      }
    } else {
      _direction.copy(placeHit.face.normal).transformDirection(placeHit.object.matrixWorld)
      const placeX = placeHit.point.x + _direction.x * 0.5
      const placeY = placeHit.point.y + _direction.y * 0.5
      const placeZ = placeHit.point.z + _direction.z * 0.5
      const distSq =
        (placeX - camera.position.x) ** 2 +
        (placeY - camera.position.y) ** 2 +
        (placeZ - camera.position.z) ** 2
      if (distSq > PLACE_DISTANCE * PLACE_DISTANCE) {
        if (isPlaceDebug()) {
          console.warn(
            'Place (F): too far — distance',
            Math.sqrt(distSq).toFixed(2),
            '>',
            PLACE_DISTANCE
          )
        }
      } else {
        // Use: block we're looking at (the one that has the hit face)
        const useBx = Math.floor(placeHit.point.x - 0.01 * _direction.x)
        const useBy = Math.floor(placeHit.point.y - 0.01 * _direction.y)
        const useBz = Math.floor(placeHit.point.z - 0.01 * _direction.z)
        const useBlock = getBlockAt(useBx, useBy, useBz)
        if (useBlock === 'door_closed' || useBlock === 'door_open') {
          const next = useBlock === 'door_closed' ? 'door_open' : 'door_closed'
          const above = getBlockAt(useBx, useBy + 1, useBz)
          const below = getBlockAt(useBx, useBy - 1, useBz)
          const isDoor = (t: string | null) => t === 'door_closed' || t === 'door_open'
          const otherBy = isDoor(above) ? useBy + 1 : isDoor(below) ? useBy - 1 : null
          blockModifications.set(blockKeyString(useBx, useBy, useBz), next)
          applyBlockChangeToLoadedChunk({ bx: useBx, by: useBy, bz: useBz, next })
          if (otherBy !== null) {
            blockModifications.set(blockKeyString(useBx, otherBy, useBz), next)
            applyBlockChangeToLoadedChunk({ bx: useBx, by: otherBy, bz: useBz, next })
          }
        } else if (useBlock === 'crafting_table') {
          onCraftingTableUse?.()
        } else {
          const sel = getSelectedBlockType()
          const count = getSelectedSlotCount()
          if (sel === 'torch' && count > 0) {
            const torchInPlayer =
              placeX >= player.position.x - PLAYER_HALF &&
              placeX <= player.position.x + PLAYER_HALF &&
              placeY >= player.position.y &&
              placeY <= player.position.y + PLAYER_HEIGHT &&
              placeZ >= player.position.z - PLAYER_HALF &&
              placeZ <= player.position.z + PLAYER_HALF
            const torchInEntity = pointInAnyEntityAABB(placeX, placeY, placeZ)
            if (torchInPlayer) {
              if (isPlaceDebug()) console.warn('Place (F): torch would be inside player.')
            } else if (torchInEntity) {
              if (isPlaceDebug()) console.warn('Place (F): torch would be inside an entity.')
            } else if (
              !placeTorch(placeX, placeY, placeZ, {
                x: _direction.x,
                y: _direction.y,
                z: _direction.z,
              })
            ) {
              if (isPlaceDebug()) console.warn('Place (F): torch placement rejected (e.g. already a torch there).')
            } else {
              consumeOneFromSelectedSlot()
            }
          } else if (sel === 'torch') {
            if (isPlaceDebug() && count === 0) console.warn('Place (F): torch selected but slot empty.')
          } else if (count === 0 || !isPlaceableBlock(sel)) {
            if (isPlaceDebug()) {
              console.warn(
                'Place (F): cannot place — slot empty or not placeable. Selected:',
                sel,
                'count:',
                count
              )
            }
          } else if (sel !== 'torch' && count > 0 && isPlaceableBlock(sel)) {
            const adjX = Math.floor(placeHit.point.x + _direction.x * 0.01)
            const adjY = Math.floor(placeHit.point.y + _direction.y * 0.01)
            const adjZ = Math.floor(placeHit.point.z + _direction.z * 0.01)
            const px = player.position.x
            const py = player.position.y
            const pz = player.position.z
            const at = getBlockAt(adjX, adjY, adjZ)
            const keyStr = blockKeyString(adjX, adjY, adjZ)
            const blockOverlapsEntity = blockCellOverlapsAnyEntity(adjX, adjY, adjZ)

            /**
             * Quantizes a world direction vector (XZ) into one of the four cardinal facings.
             * @param dx - Direction x component
             * @param dz - Direction z component
             */
            function quantizeFacingFromDirectionXZ(dx: number, dz: number): StairFacing {
              if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'east' : 'west'
              return dz >= 0 ? 'south' : 'north'
            }

            const blockToPlace = (() => {
              if (sel === 'water') return 'water_source' as BlockType
              if (isStairsBlock(sel)) {
                const facing = quantizeFacingFromDirectionXZ(rayDirection.x, rayDirection.z)
                const half: StairsHalf = _direction.y < -0.5 ? 'top' : 'bottom'
                return getPlacedStairsId(sel, facing, half) as BlockType
              }
              return sel
            })()

            /**
             * Returns true if placing blockType at (bx,by,bz) would overlap the player's AABB.
             */
            function wouldPlacedBlockOverlapPlayer(
              blockType: BlockType,
              bx: number,
              by: number,
              bz: number,
            ): boolean {
              const playerMinX = px - PLAYER_HALF
              const playerMaxX = px + PLAYER_HALF
              const playerMinY = py
              const playerMaxY = py + PLAYER_HEIGHT
              const playerMinZ = pz - PLAYER_HALF
              const playerMaxZ = pz + PLAYER_HALF
              const boxes = getBlockCollisionBoxesLocal(blockType)
              if (boxes.length === 0) return false
              for (const b of boxes) {
                const minX = bx + b.minX
                const maxX = bx + b.maxX
                const minY = by + b.minY
                const maxY = by + b.maxY
                const minZ = bz + b.minZ
                const maxZ = bz + b.maxZ
                const xO = Math.min(playerMaxX, maxX) - Math.max(playerMinX, minX)
                const yO = Math.min(playerMaxY, maxY) - Math.max(playerMinY, minY)
                const zO = Math.min(playerMaxZ, maxZ) - Math.max(playerMinZ, minZ)
                if (xO > 0 && yO > 0 && zO > 0) return true
              }
              return false
            }

            /** Door placement: two blocks (adjY and adjY+1), one consume; skip single-block path. */
            if (blockToPlace === 'door_closed') {
              const atUpper = getBlockAt(adjX, adjY + 1, adjZ)
              const upperOk =
                atUpper === null || atUpper === 'air' || isReplaceableByPlacement(atUpper)
              const lowerOk = at === null || at === 'air' || isReplaceableByPlacement(at)
              const doorOverlapsPlayer =
                wouldPlacedBlockOverlapPlayer('door_closed', adjX, adjY, adjZ) ||
                wouldPlacedBlockOverlapPlayer('door_closed', adjX, adjY + 1, adjZ)
              const doorOverlapsEntity =
                blockCellOverlapsAnyEntity(adjX, adjY, adjZ) ||
                blockCellOverlapsAnyEntity(adjX, adjY + 1, adjZ)
              if (
                upperOk &&
                lowerOk &&
                !doorOverlapsPlayer &&
                !doorOverlapsEntity
              ) {
                const ctx = getChunkSyncCtx()
                removeTorchAt({
                  bx: adjX,
                  by: adjY,
                  bz: adjZ,
                  torchContainer: ctx.torchContainer,
                  placedTorches: ctx.placedTorches,
                })
                removeTorchAt({
                  bx: adjX,
                  by: adjY + 1,
                  bz: adjZ,
                  torchContainer: ctx.torchContainer,
                  placedTorches: ctx.placedTorches,
                })
                blockModifications.set(blockKeyString(adjX, adjY, adjZ), 'door_closed')
                blockModifications.set(blockKeyString(adjX, adjY + 1, adjZ), 'door_closed')
                applyBlockChangeToLoadedChunk({
                  bx: adjX,
                  by: adjY,
                  bz: adjZ,
                  next: 'door_closed',
                })
                applyBlockChangeToLoadedChunk({
                  bx: adjX,
                  by: adjY + 1,
                  bz: adjZ,
                  next: 'door_closed',
                })
                consumeOneFromSelectedSlot()
              } else if (isPlaceDebug()) {
                console.warn(
                  'Place (F): door placement rejected (upper cell occupied, overlap, or not replaceable).'
                )
              }
            } else {
            const blockOverlapsPlayer = wouldPlacedBlockOverlapPlayer(blockToPlace, adjX, adjY, adjZ)

            if (blockOverlapsPlayer) {
              if (isPlaceDebug()) console.warn('Place (F): block would overlap player.')
              const now = Date.now()
              if (now - lastPlaceRejectMessageTime >= PLACE_REJECT_MESSAGE_THROTTLE_MS) {
                lastPlaceRejectMessageTime = now
                addSystemMessage("Can't place block here")
              }
            } else if (blockOverlapsEntity) {
              if (isPlaceDebug()) console.warn('Place (F): block would overlap an entity.')
              const now = Date.now()
              if (now - lastPlaceRejectMessageTime >= PLACE_REJECT_MESSAGE_THROTTLE_MS) {
                lastPlaceRejectMessageTime = now
                addSystemMessage("Can't place block here")
              }
            } else if (at !== null && at !== 'air' && !isReplaceableByPlacement(at)) {
              if (isPlaceDebug()) console.warn('Place (F): target cell not empty. Block at', adjX, adjY, adjZ, ':', at)
              const now = Date.now()
              if (now - lastPlaceRejectMessageTime >= PLACE_REJECT_MESSAGE_THROTTLE_MS) {
                lastPlaceRejectMessageTime = now
                addSystemMessage("Can't place block here")
              }
            } else {
              const ctx = getChunkSyncCtx()
              removeTorchAt({
                bx: adjX,
                by: adjY,
                bz: adjZ,
                torchContainer: ctx.torchContainer,
                placedTorches: ctx.placedTorches,
              })
              blockModifications.set(keyStr, blockToPlace)
              applyBlockChangeToLoadedChunk({
                bx: adjX,
                by: adjY,
                bz: adjZ,
                next: blockToPlace,
              })
              consumeOneFromSelectedSlot()
            }
            }
          }
        }
      }
    }
  }

  // Block break: hold on block (uses same raycast as aimed block). Skip when holding a weapon (left-click triggers slash).
  if (document.pointerLockElement === renderer.domElement && isMouseDown && camera) {
    if (getEffectiveWeapon()) {
      breakTarget = null
      breakProgress = 0
      if (blockCrackElement) blockCrackElement.style.visibility = 'hidden'
    } else if (!currentHit || !currentResolved) {
      breakTarget = null
      breakProgress = 0
      if (blockCrackElement) blockCrackElement.style.visibility = 'hidden'
    } else {
      _direction.copy(currentHit.face!.normal).transformDirection(currentHit.object.matrixWorld)
      const { x, y, z, blockType, chunkKeyNum } = currentResolved
      const heldItem = getSelectedBlockType()
      if (isUnbreakableBlock(blockType)) {
        breakTarget = null
        breakProgress = 0
      } else if (
        breakTarget &&
        breakTarget.chunkKeyNum === chunkKeyNum &&
        breakTarget.blockType === blockType &&
        breakTarget.x === x &&
        breakTarget.y === y &&
        breakTarget.z === z
      ) {
        const required = getBlockBreakTimeWithTool(blockType, heldItem)
        breakProgress += dt
        if (breakProgress >= required) {
          breakBlock(chunkKeyNum, blockType, x, y, z, time)
          breakTarget = null
          breakProgress = 0
          if (blockCrackElement) blockCrackElement.style.visibility = 'hidden'
        }
      } else {
        breakTarget = {
          chunkKeyNum,
          blockType,
          x,
          y,
          z,
          faceNormal: _direction.clone(),
        }
        breakProgress = dt
        const required = getBlockBreakTimeWithTool(blockType, heldItem)
        if (required <= 0 || breakProgress >= required) {
          breakBlock(chunkKeyNum, blockType, x, y, z, time)
          breakTarget = null
          breakProgress = 0
          if (blockCrackElement) blockCrackElement.style.visibility = 'hidden'
        }
      }
    }
  } else if (!isMouseDown) {
    breakTarget = null
    breakProgress = 0
  }

  // Block-Riss-Overlay (Minecraft-Style): 10 Stufen, je mehr Fortschritt desto stärker die Risse (HUD + 3D auf Blockfläche)
  const visible = breakTarget !== null
  let stage = 0
  if (visible && breakTarget) {
    const heldItem = getSelectedBlockType()
    const breakTime = getBlockBreakTimeWithTool(breakTarget.blockType, heldItem)
    const progress = breakTime > 0 ? Math.min(1, breakProgress / breakTime) : 1
    const rawStage = Math.floor(progress * 10)
    stage = progress > 0 ? Math.min(9, Math.max(1, rawStage)) : 0
  }
  if (blockCrackElement) {
    blockCrackElement.style.visibility = visible ? 'visible' : 'hidden'
    if (visible) {
      blockCrackElement.style.backgroundPosition = `0 ${-stage * 10}%`
      blockCrackElement.setAttribute('data-stage', String(stage))
    }
  }
  if (blockCrackOverlayMesh) {
    blockCrackOverlayMesh.visible = visible
    if (visible && breakTarget) {
      const n = breakTarget.faceNormal
      const cx = breakTarget.x + 0.5
      const cy = breakTarget.y + 0.5
      const cz = breakTarget.z + 0.5
      const faceOffset = 0.501
      blockCrackOverlayMesh.position.set(
        cx + n.x * faceOffset,
        cy + n.y * faceOffset,
        cz + n.z * faceOffset,
      )
      blockCrackOverlayMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        n,
      )
      const mat = blockCrackOverlayMesh.material as THREE.MeshBasicMaterial
      if (mat.map) {
        mat.map.offset.set(0, 0.9 - stage * 0.1)
        mat.map.repeat.set(1, 0.1)
      }
    }
  }

  if (blockOutlineMesh) {
    blockOutlineMesh.visible = aimedBlock !== null
    if (aimedBlock) {
      blockOutlineMesh.position.set(
        aimedBlock.x + 0.5,
        aimedBlock.y + 0.5,
        aimedBlock.z + 0.5,
      )
    }
  }
}

/**
 * Updates shadow camera to player, recomputes chunk frustum visibility when camera or chunks changed, applies bloom params from time of day, then renders (with or without post-processing).
 */
function updateShadowAndRender(dt: number): void {
  updateShadowCameraForPlayer(sunLight, player.position, getSunDirection(), SUN_DISTANCE)

  if (!camera.matrixWorld.equals(_lastCameraMatrixWorld)) {
    _lastCameraMatrixWorld.copy(camera.matrixWorld)
    _frustumDirty = true
  }
  if (_frustumDirty) {
    _frustumDirty = false
    updateChunkFrustumVisibility({
      camera,
      chunks,
      frustum: _frustum,
      projScreenMatrix: _projScreenMatrix,
      chunkBox: _chunkBox,
      chunkBoxMin: _chunkBoxMin,
      chunkBoxMax: _chunkBoxMax,
    })
  }

  if (multiplayerEnabled) updateMultiplayer(dt)
  if (getBloomEnabled() && effectComposer && bloomPass) {
    bloomPass.strength = getBloomStrength() * getBloomDayScale()
    bloomPass.radius = getBloomRadius()
    bloomPass.threshold = getBloomThresholdForTimeOfDay()
    effectComposer.render()
  } else {
    renderer.render(scene, camera)
  }
}

/**
 * Main game loop: runs per-frame updates (FPS/spawn, day/atmosphere, chunks, movement/collision, camera, drops, block break/place, multiplayer, shadow/render) and schedules next frame.
 */
function animate(): void {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), 0.1)
  const time = performance.now() * 0.001
  updateFPSAndSpawn(time)
  updateDayCycleAndAtmosphere(dt)
  updateChunkVisibility()
  updateMovementAndCollision(dt, time)
  updateCameraAndViewMode(time, dt)
  updateDropsAndPickup(time, dt)
  runBlockTick(time)
  runWaterFlowTick(time)
  updateBlockBreakAndPlace(dt, time)
  updateShadowAndRender(dt)
}

// ================= RESIZE =================

window.addEventListener('resize', () => {
  if (!camera || !renderer) return
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  if (effectComposer) effectComposer.setSize(w, h)
  if (bloomPass) bloomPass.setSize(w, h)
})

// ================= GRAFIK-OPTIONEN (zur Laufzeit) =================

/**
 * Called by the options menu when graphics settings change. Applies tone mapping, exposure, shadows, FOV, render distance, bloom, and terrain fog to the current renderer and scene.
 */
export function applyGraphicsSettings(): void {
  if (!renderer || !sunLight) return
  renderer.toneMapping = getToneMappingEnabled() ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
  renderer.toneMappingExposure = getToneMappingEnabled() ? getToneMappingExposure() : 1
  renderer.shadowMap.enabled = getShadowsEnabled()
  renderer.shadowMap.type =
    getShadowMapType() === 'pcf_soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
  const size = getShadowMapSize()
  if (sunLight.shadow.mapSize.width !== size || sunLight.shadow.mapSize.height !== size) {
    sunLight.shadow.mapSize.width = size
    sunLight.shadow.mapSize.height = size
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose()
      ;(sunLight.shadow as { map: THREE.RenderTarget | null }).map = null
    }
  }
  sunLight.shadow.camera.left = -SHADOW_RADIUS
  sunLight.shadow.camera.right = SHADOW_RADIUS
  sunLight.shadow.camera.top = SHADOW_RADIUS
  sunLight.shadow.camera.bottom = -SHADOW_RADIUS
  sunLight.shadow.camera.updateProjectionMatrix()

  applyTorchShadowSettingsToPlacedTorches(placedTorches)
  if (bloomPass) {
    bloomPass.strength = getBloomStrength() * getBloomDayScale()
    bloomPass.radius = getBloomRadius()
    bloomPass.threshold = getBloomThresholdForTimeOfDay()
  }
}
