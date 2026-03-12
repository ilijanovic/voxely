import * as THREE from '@/three'
import type { BlockType } from '../../types'
import type { Biome } from '../../game-terrain'
import { CHUNK_SIZE, WATER_LEVEL, SPAWN_X, SPAWN_Z } from '../../constants'
import { chunks, chunkKeyNumeric, localKey, getBlockAt } from '../../chunk-runtime'
import { isSolidBlock as isBlockTypeSolid } from '../../block-registry'
import {
  getResolvedBiome,
  getHeight,
  getSurfaceBlockAt,
  getTemperature,
  getHumidity,
  getContinentalness,
  getErosion,
  SURFACE_STONE_HEIGHT,
  MOUNTAIN_STONE_SURFACE_HEIGHT,
} from '../../game-terrain'
import { BIOME_LAYERS } from '../../terrain/biomes'
import { getAreaAt } from '../../world-areas'

export function logBlockAt(bx: number, by: number, bz: number, label: string): void {
  const blockType = getBlockAt(bx, by, bz)
  const cx = Math.floor(bx / CHUNK_SIZE)
  const cz = Math.floor(bz / CHUNK_SIZE)
  const keyNum = chunkKeyNumeric(cx, cz)
  const data = chunks.get(keyNum)

  const lx = bx - cx * CHUNK_SIZE
  const lz = bz - cz * CHUNK_SIZE
  const localKeyVal = localKey(lx, by, lz)

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
        '[block-debug] Interpretation: block exists in voxelMap but has no mesh – likely refresh/merge bug in chunk-apply or refreshChunkVisibleMeshes.',
      )
    }
  }
}

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

export interface TerrainDebugState {
  el: HTMLElement | null
  enabled: boolean
  nextUpdateAt: number
}

export function createTerrainDebugState(): TerrainDebugState {
  return { el: null, enabled: false, nextUpdateAt: 0 }
}

export function createTerrainDebugOverlay(state: TerrainDebugState): void {
  const el = document.createElement('div')
  el.id = 'terrain-debug'
  el.style.position = 'fixed'
  el.style.left = '8px'
  el.style.top = '48px'
  el.style.padding = '6px 8px'
  el.style.background = 'rgba(0,0,0,0.62)'
  el.style.color = '#e7f6ff'
  el.style.fontFamily = 'monospace'
  el.style.fontSize = '12px'
  el.style.lineHeight = '1.25'
  el.style.zIndex = '1000'
  el.style.borderRadius = '6px'
  el.style.whiteSpace = 'pre'
  el.style.pointerEvents = 'none'
  el.style.display = 'none'
  document.body.appendChild(el)
  state.el = el
}

/** Optional extra values passed from the game loop (e.g. FPS). */
export interface TerrainDebugExtra {
  fps?: number | null
}

/**
 * Updates the terrain debug overlay with position, biome, climate, and optional FPS.
 */
export function updateTerrainDebugOverlay(
  state: TerrainDebugState,
  time: number,
  player: THREE.Group,
  extra?: TerrainDebugExtra,
): void {
  if (!state.enabled || !state.el || !player) return
  if (time < state.nextUpdateAt) return
  state.nextUpdateAt = time + 0.2

  const wx = Math.floor(player.position.x)
  const wz = Math.floor(player.position.z)
  const area = getAreaAt(player.position.x, player.position.z)
  const dx = player.position.x - SPAWN_X
  const dz = player.position.z - SPAWN_Z
  const distFromSpawn = Math.sqrt(dx * dx + dz * dz)
  const biome = getResolvedBiome(wx, wz)
  const topY = getHeight(wx, wz)
  const layerSurface = BIOME_LAYERS[biome].surface
  const finalSurface = getSurfaceBlockAt(wx, wz, biome, topY)
  const loadedSurface = getBlockAt(wx, topY, wz)
  const reason = getSurfaceDecisionReason(biome, topY, finalSurface)

  const temp = getTemperature(wx, wz)
  const humidity = getHumidity(wx, wz)
  const continentalness = getContinentalness(wx, wz)
  const erosion = getErosion(wx, wz)
  const fpsStr = extra?.fps != null ? String(extra.fps) : '--'
  const fpsLine = `\nFPS: ${fpsStr}`

  const zoneLine = area
    ? `\nzone: ${area.id} (Lv ${area.levelMin}–${area.levelMax})`
    : '\nzone: --'
  const spawnLine = `\ndist from spawn: ${distFromSpawn.toFixed(0)} blocks`

  state.el.textContent =
    `P Terrain Debug` +
    fpsLine +
    zoneLine +
    spawnLine +
    `\nxyz: ${player.position.x.toFixed(1)} ${player.position.y.toFixed(
      1,
    )} ${player.position.z.toFixed(1)}` +
    `\ncolumn: ${wx}, ${wz}` +
    `\nbiome: ${biome}` +
    `\ntopY: ${topY}` +
    `\ntemp: ${temp.toFixed(3)}  humidity: ${humidity.toFixed(3)}` +
    `\ncontinentalness: ${continentalness.toFixed(3)}  erosion: ${erosion.toFixed(3)}` +
    `\nlayer.surface: ${layerSurface}` +
    `\nfinalSurface: ${finalSurface}` +
    `\nloaded@top: ${loadedSurface ?? 'unloaded'}` +
    `\nreason: ${reason}`
}

export function toggleTerrainDebug(state: TerrainDebugState): void {
  state.enabled = !state.enabled
  if (state.el) {
    state.el.style.display = state.enabled ? 'block' : 'none'
    if (!state.enabled) state.el.textContent = ''
  }
}
