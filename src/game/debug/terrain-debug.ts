import * as THREE from 'three'
import type { BlockType } from '../../types'
import type { Biome } from '../../game-terrain'
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  SPAWN_X,
  SPAWN_Z,
  WORLD_MIN_Y,
} from '../../constants'
import { chunks, chunkKeyNumeric, localKey, getBlockAt } from '../../chunk-runtime'
import { isSolidBlock as isBlockTypeSolid } from '../../block-registry'
import {
  getSurfaceBlockAt,
  getTerrainColumnDebugSnapshot,
  MOUNTAIN_STONE_SURFACE_HEIGHT,
  SURFACE_STONE_HEIGHT,
  WORLD_SEED,
  type TerrainColumnDebugSnapshot,
} from '../../game-terrain'
import { BIOME_LAYERS } from '../../terrain/biomes'
import { getAreaAt } from '../../world-areas'

const OVERLAY_LEFT_PX = 8
const OVERLAY_TOP_PX = 48
const OVERLAY_PADDING_Y_PX = 6
const OVERLAY_PADDING_X_PX = 8
const OVERLAY_RADIUS_PX = 6
const OVERLAY_FONT_SIZE_PX = 12
const OVERLAY_Z_INDEX = 1000
const DEBUG_UPDATE_INTERVAL_SECONDS = 0.2
const NEIGHBORHOOD_RADIUS = 2

/**
 * Logs detailed block/chunk/mesh debug info for one world block position.
 */
export function logBlockAt(bx: number, by: number, bz: number, label: string): void {
  const blockType = getBlockAt(bx, by, bz)
  const cx = Math.floor(bx / CHUNK_SIZE)
  const cz = Math.floor(bz / CHUNK_SIZE)
  const keyNum = chunkKeyNumeric(cx, cz)
  const data = chunks.get(keyNum)

  const lx = bx - cx * CHUNK_SIZE
  const lz = bz - cz * CHUNK_SIZE
  const localKeyVal = localKey(lx, by - WORLD_MIN_Y, lz)

  const info: Record<string, unknown> = {
    worldPos: { bx, by, bz },
    blockType: blockType ?? '(null/air/unloaded)',
    chunk: { cx, cz, keyNum },
    chunkLoaded: !!data,
  }

  if (data) {
    const inVoxelMap = data.voxelMap.has(localKeyVal)
    const voxelMapType = data.voxelMap.get(localKeyVal)
    info.inVoxelMap = inVoxelMap
    info.voxelMapTypeAtPos = voxelMapType ?? null
    const positionsForType = data.blockPositionsByType.get(blockType as BlockType)
    info.visiblePositionsCount = positionsForType?.length ?? null
    const posInInstanceList =
      positionsForType?.some((p) => p.x === bx && p.y === by && p.z === bz) ?? false
    info.positionInInstanceList = posInInstanceList

    const meshesForType: { type: string; count?: number; vertexCount?: number }[] = []
    for (const child of data.group.children) {
      if (!(child instanceof THREE.Mesh)) continue
      const ud = child.userData as { blockType?: BlockType }
      if (ud?.blockType !== blockType) continue
      if (child instanceof THREE.InstancedMesh) {
        meshesForType.push({ type: 'instanced', count: child.count })
      } else {
        const geo = child.geometry
        const vc = geo?.attributes?.position?.count ?? 0
        meshesForType.push({ type: 'geometry', vertexCount: vc })
      }
    }
    info.meshesForThisBlockType = meshesForType
    info.hasAnyMesh = meshesForType.length > 0
  }

  console.log(`[block-debug] ${label}:`, info)
  if (label.includes('Cell at end of ray') || label.includes('Cell in front')) {
    const inVm = info.inVoxelMap as boolean | undefined
    const air = info.blockType === 'air' || info.blockType == null
    const noMesh = (info.hasAnyMesh as boolean | undefined) === false
    if (inVm === false && air) {
      console.log(
        '[block-debug] Interpretation: cell is air in data (no voxel). Either never generated or cleared (e.g. by mining).',
      )
    } else if (inVm === true && noMesh) {
      console.log(
        '[block-debug] Interpretation: block exists in voxelMap but has no mesh. Likely refresh/merge bug in chunk-apply or refreshChunkVisibleMeshes.',
      )
    }
  }
}

/**
 * Logs the block directly under the player feet.
 */
export function logBlockUnderPlayer(player: THREE.Group): void {
  if (!player) {
    console.warn('[block-debug] No player')
    return
  }
  const bx = Math.floor(player.position.x)
  const by = Math.floor(player.position.y - 0.01)
  const bz = Math.floor(player.position.z)
  logBlockAt(bx, by, bz, 'Block under player')
}

/**
 * Ray-marches from camera and logs first solid block plus the air cell before it.
 */
export function logBlockAtCrosshair(camera: THREE.PerspectiveCamera, breakDistance: number): void {
  if (!camera) {
    console.warn('[block-debug] No camera')
    return
  }
  const rayOrigin = new THREE.Vector3()
  const rayDirection = new THREE.Vector3()
  rayOrigin.copy(camera.position)
  camera.getWorldDirection(rayDirection)
  const step = 0.2
  const maxT = breakDistance
  let lastAir: { bx: number; by: number; bz: number } | null = null
  for (let t = 0.5; t <= maxT; t += step) {
    const x = rayOrigin.x + rayDirection.x * t
    const y = rayOrigin.y + rayDirection.y * t
    const z = rayOrigin.z + rayDirection.z * t
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const at = getBlockAt(bx, by, bz)
    if (at === null || at === 'air') {
      lastAir = { bx, by, bz }
      continue
    }
    if (isBlockTypeSolid(at as BlockType)) {
      logBlockAt(bx, by, bz, 'Block at crosshair (first solid)')
      if (lastAir) {
        console.log('[block-debug] Hole/cell in front of that block (air along ray):', lastAir)
        logBlockAt(lastAir.bx, lastAir.by, lastAir.bz, 'Cell in front (expected air/hole)')
      }
      return
    }
  }
  console.log('[block-debug] No solid block in range. Last air cell along ray:', lastAir)
  if (lastAir) logBlockAt(lastAir.bx, lastAir.by, lastAir.bz, 'Cell at end of ray')
}

/**
 * Returns a short reason code for the final surface choice at this column.
 */
export function getSurfaceDecisionReason(biome: Biome, topY: number, surface: BlockType): string {
  if (surface === 'sand' && topY <= WATER_LEVEL + 2) return 'snow_near_water_to_sand'
  if (
    (biome === 'mountain' ||
      biome === 'windswept_hills' ||
      biome === 'windswept_forest' ||
      biome === 'meadow') &&
    topY >= MOUNTAIN_STONE_SURFACE_HEIGHT
  )
    return 'mountain_height_to_stone'
  if (
    topY >= SURFACE_STONE_HEIGHT &&
    biome !== 'frozen_peaks' &&
    biome !== 'jagged_peaks' &&
    biome !== 'jungle'
  )
    return 'global_height_to_stone'
  if (surface === 'grass_snow') return 'snow_surface_to_grass_snow'
  return 'default_biome_surface'
}

/** One sampled neighborhood cell relative to the inspected center column. */
export interface TerrainNeighborhoodCell {
  dx: number
  dz: number
  height: number
  biome: Biome
}

/** Data model used to build on-screen and clipboard terrain reports. */
export interface TerrainDebugReportData {
  fps: number | null
  inWater: boolean | null
  aimedBlockLine: string
  zoneLine: string
  distFromSpawn: number
  playerPosition: { x: number; y: number; z: number }
  source: 'player' | 'locked'
  column: { wx: number; wz: number }
  snapshot: TerrainColumnDebugSnapshot
  layerSurface: BlockType
  finalSurface: BlockType
  loadedSurface: BlockType | null
  reason: string
  neighborhood: TerrainNeighborhoodCell[]
  detailed: boolean
}

/** Runtime state for the terrain debug overlay and report tools. */
export interface TerrainDebugState {
  el: HTMLElement | null
  enabled: boolean
  detailed: boolean
  lockedColumn: { wx: number; wz: number } | null
  nextUpdateAt: number
  lastReportText: string
}

/**
 * Creates terrain debug runtime state.
 */
export function createTerrainDebugState(): TerrainDebugState {
  return {
    el: null,
    enabled: false,
    detailed: false,
    lockedColumn: null,
    nextUpdateAt: 0,
    lastReportText: '',
  }
}

/**
 * Creates and mounts the debug overlay element.
 */
export function createTerrainDebugOverlay(state: TerrainDebugState): void {
  const el = document.createElement('div')
  el.id = 'terrain-debug'
  el.style.position = 'fixed'
  el.style.left = `${OVERLAY_LEFT_PX}px`
  el.style.top = `${OVERLAY_TOP_PX}px`
  el.style.padding = `${OVERLAY_PADDING_Y_PX}px ${OVERLAY_PADDING_X_PX}px`
  el.style.background = 'rgba(0,0,0,0.62)'
  el.style.color = '#e7f6ff'
  el.style.fontFamily = 'monospace'
  el.style.fontSize = `${OVERLAY_FONT_SIZE_PX}px`
  el.style.lineHeight = '1.25'
  el.style.zIndex = String(OVERLAY_Z_INDEX)
  el.style.borderRadius = `${OVERLAY_RADIUS_PX}px`
  el.style.whiteSpace = 'pre'
  el.style.pointerEvents = 'none'
  el.style.display = 'none'
  document.body.appendChild(el)
  state.el = el
}

/** Optional extra values passed from the game loop (for example FPS). */
export interface TerrainDebugExtra {
  fps?: number | null
  inWater?: boolean | null
  aimedBlock?: { x: number; y: number; z: number } | null
  aimedBlockType?: BlockType | null
}

/**
 * Toggles terrain debug overlay visibility.
 */
export function toggleTerrainDebug(state: TerrainDebugState): void {
  state.enabled = !state.enabled
  if (state.el) {
    state.el.style.display = state.enabled ? 'block' : 'none'
    if (!state.enabled) state.el.textContent = ''
  }
}

/**
 * Toggles detailed terrain debug mode.
 */
export function toggleTerrainDebugDetails(state: TerrainDebugState): void {
  state.detailed = !state.detailed
  state.nextUpdateAt = 0
  console.log(`[terrain-debug] detailed mode: ${state.detailed ? 'on' : 'off'}`)
}

/**
 * Locks debug sampling to the current player column; toggles back to follow mode.
 */
export function toggleTerrainDebugColumnLock(
  state: TerrainDebugState,
  player: THREE.Group | null | undefined,
): void {
  if (state.lockedColumn) {
    state.lockedColumn = null
    state.nextUpdateAt = 0
    console.log('[terrain-debug] unlocked (following player)')
    return
  }
  if (!player) {
    console.warn('[terrain-debug] Cannot lock column: player not ready')
    return
  }
  state.lockedColumn = {
    wx: Math.floor(player.position.x),
    wz: Math.floor(player.position.z),
  }
  state.nextUpdateAt = 0
  console.log(`[terrain-debug] locked to column ${state.lockedColumn.wx}, ${state.lockedColumn.wz}`)
}

/**
 * Copies the most recent terrain debug report to clipboard; falls back to console on failure.
 */
export async function copyTerrainDebugReport(state: TerrainDebugState): Promise<void> {
  if (!state.lastReportText) {
    console.warn('[terrain-debug] No report ready yet. Enable terrain debug first (P).')
    return
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(state.lastReportText)
      console.log('[terrain-debug] Copied terrain report to clipboard')
      return
    }
    throw new Error('Clipboard API unavailable')
  } catch (error) {
    console.warn('[terrain-debug] Copy failed. Printing report in console instead.', error)
    console.log(state.lastReportText)
  }
}

/**
 * Converts a biome id into a short 3-char uppercase label for compact grid display.
 */
function biomeShortLabel(biome: Biome): string {
  const compact = biome
    .split('_')
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase()
  return compact.slice(0, 3).padEnd(3, '_')
}

/**
 * Samples a square neighborhood around the center column for height/biome quick inspection.
 */
function sampleNeighborhood(centerX: number, centerZ: number): TerrainNeighborhoodCell[] {
  const cells: TerrainNeighborhoodCell[] = []
  for (let dz = -NEIGHBORHOOD_RADIUS; dz <= NEIGHBORHOOD_RADIUS; dz++) {
    for (let dx = -NEIGHBORHOOD_RADIUS; dx <= NEIGHBORHOOD_RADIUS; dx++) {
      const snapshot = getTerrainColumnDebugSnapshot(centerX + dx, centerZ + dz)
      cells.push({
        dx,
        dz,
        height: snapshot.heightUsed,
        biome: snapshot.resolvedBiome,
      })
    }
  }
  return cells
}

/**
 * Builds printable lines for the sampled neighborhood table.
 */
function buildNeighborhoodLines(cells: TerrainNeighborhoodCell[]): string[] {
  const byOffset = new Map<string, TerrainNeighborhoodCell>()
  for (const cell of cells) byOffset.set(`${cell.dx},${cell.dz}`, cell)
  const lines: string[] = ['nearby(5x5): cell=BIOME:height']
  for (let dz = -NEIGHBORHOOD_RADIUS; dz <= NEIGHBORHOOD_RADIUS; dz++) {
    const rowParts: string[] = []
    for (let dx = -NEIGHBORHOOD_RADIUS; dx <= NEIGHBORHOOD_RADIUS; dx++) {
      const cell = byOffset.get(`${dx},${dz}`)
      if (!cell) continue
      const value = `${biomeShortLabel(cell.biome)}:${String(cell.height).padStart(3, ' ')}`
      rowParts.push(dx === 0 && dz === 0 ? `[${value}]` : ` ${value} `)
    }
    const dzLabel = dz >= 0 ? `+${dz}` : `${dz}`
    lines.push(`dz ${dzLabel.padStart(2, ' ')} | ${rowParts.join(' ')}`)
  }
  return lines
}

/**
 * Formats one signed numeric value with fixed decimals.
 */
function fixed3(value: number): string {
  return value.toFixed(3)
}

/**
 * Builds a full terrain debug report string for overlay and clipboard use.
 */
export function buildTerrainDebugReport(data: TerrainDebugReportData): string {
  const snapshot = data.snapshot
  const fpsStr = data.fps == null ? '--' : String(data.fps)
  const inWaterStr =
    data.inWater == null ? '--' : data.inWater ? 'yes' : 'no'
  const blend = `${snapshot.biomeBlend.primary} -> ${snapshot.biomeBlend.secondary} (t=${fixed3(snapshot.biomeBlend.t)})`
  const lines: string[] = [
    'Terrain Debug',
    'keys: P toggle | Shift+P details | Shift+L lock | Shift+C copy',
    `mode: ${data.detailed ? 'detailed' : 'basic'} | source: ${data.source}`,
    `FPS: ${fpsStr}`,
    `in water: ${inWaterStr}`,
    `seed: ${WORLD_SEED}`,
    data.zoneLine,
    `dist from spawn: ${data.distFromSpawn.toFixed(0)} blocks`,
    `player xyz: ${data.playerPosition.x.toFixed(1)} ${data.playerPosition.y.toFixed(1)} ${data.playerPosition.z.toFixed(1)}`,
    data.aimedBlockLine,
    `column: ${data.column.wx}, ${data.column.wz}`,
    `biome(base->resolved): ${snapshot.baseBiome} -> ${snapshot.resolvedBiome}`,
    `biome blend: ${blend}`,
    `height used(int): ${snapshot.heightUsed}`,
    `height raw/smoothed: ${snapshot.rawHeight.toFixed(2)} / ${snapshot.smoothedHeight.toFixed(2)}`,
    `height terms: macro ${snapshot.macroTerm.toFixed(2)} | local ${snapshot.localTerm.toFixed(2)} | mountain ${snapshot.mountainTerm.toFixed(2)} | erosion ${snapshot.erosionTerm.toFixed(2)}`,
    `climate: temp ${fixed3(snapshot.temperature)} | humidity ${fixed3(snapshot.humidity)} | continentalness ${fixed3(snapshot.continentalness)}`,
    `surface layer/final/loaded: ${data.layerSurface} / ${data.finalSurface} / ${data.loadedSurface ?? 'unloaded'}`,
    `surface reason: ${data.reason}`,
  ]
  if (data.detailed) {
    lines.push(...buildNeighborhoodLines(data.neighborhood))
  }
  return lines.join('\n')
}

/**
 * Updates the terrain debug overlay with terrain report data and caches the latest report.
 */
export function updateTerrainDebugOverlay(
  state: TerrainDebugState,
  time: number,
  player: THREE.Group,
  extra?: TerrainDebugExtra,
): void {
  if (!state.enabled || !state.el || !player) return
  if (time < state.nextUpdateAt) return
  state.nextUpdateAt = time + DEBUG_UPDATE_INTERVAL_SECONDS

  const sampledColumn = state.lockedColumn ?? {
    wx: Math.floor(player.position.x),
    wz: Math.floor(player.position.z),
  }
  const source: 'player' | 'locked' = state.lockedColumn ? 'locked' : 'player'
  const area = getAreaAt(sampledColumn.wx, sampledColumn.wz)
  const dx = sampledColumn.wx - SPAWN_X
  const dz = sampledColumn.wz - SPAWN_Z
  const distFromSpawn = Math.sqrt(dx * dx + dz * dz)
  const snapshot = getTerrainColumnDebugSnapshot(sampledColumn.wx, sampledColumn.wz)
  const layerSurface = BIOME_LAYERS[snapshot.resolvedBiome].surface
  const finalSurface = getSurfaceBlockAt(
    sampledColumn.wx,
    sampledColumn.wz,
    snapshot.resolvedBiome,
    snapshot.heightUsed,
  )
  const loadedSurface = getBlockAt(sampledColumn.wx, snapshot.heightUsed, sampledColumn.wz)
  const reason = getSurfaceDecisionReason(snapshot.resolvedBiome, snapshot.heightUsed, finalSurface)
  const neighborhood = state.detailed
    ? sampleNeighborhood(sampledColumn.wx, sampledColumn.wz)
    : []

  const aimedBlockLine = extra?.aimedBlock
    ? `aimed block: ${extra.aimedBlock.x} ${extra.aimedBlock.y} ${extra.aimedBlock.z} | type: ${extra.aimedBlockType ?? '--'}`
    : 'aimed block: --'

  const zoneLine = area
    ? `zone: ${area.id} (Lv ${area.levelMin}-${area.levelMax})`
    : 'zone: --'

  const overlayData: TerrainDebugReportData = {
    fps: extra?.fps ?? null,
    inWater: extra?.inWater ?? null,
    aimedBlockLine,
    zoneLine,
    distFromSpawn,
    playerPosition: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
    },
    source,
    column: sampledColumn,
    snapshot,
    layerSurface,
    finalSurface,
    loadedSurface,
    reason,
    neighborhood,
    detailed: state.detailed,
  }
  state.lastReportText = buildTerrainDebugReport(overlayData)
  state.el.textContent = buildTerrainDebugReport(overlayData)
}
