import { ALL_BIOMES } from '../terrain-core'
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  FULL_MAP_RADIUS_CHUNKS,
  MAP_COLOR_WATER,
  MAP_COLOR_LOW,
  MAP_COLOR_MID,
  MAP_COLOR_HIGH,
  MAP_COLOR_FOG,
  MAP_COLOR_UNDISCOVERED,
  MAP_BIOME_COLORS,
} from '../constants'
import type {
  FullMapWorkerDoneMessage,
  FullMapWorkerFrameMessage,
  FullMapWorkerMessage,
} from './full-map-worker-protocol'

/** Half-size of the player marker in pixels on the map. */
const PLAYER_MARKER_HALF_SIZE = 8
/** Height of the player marker arrow tip in pixels. */
const PLAYER_MARKER_TIP = 12
/** Width of the player marker outline in pixels. */
const PLAYER_MARKER_OUTLINE_WIDTH = 2
/** Minimum chunk placeholder size in pixels for undiscovered tiles with no heightmap. */
const MIN_CHUNK_PLACEHOLDER_PX = 4

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

/**
 * Returns terrain fallback color from height when no biome color can be resolved.
 */
function colorForHeight(surfaceY: number): string {
  if (surfaceY <= WATER_LEVEL) return MAP_COLOR_WATER
  if (surfaceY < 72) return MAP_COLOR_LOW
  if (surfaceY < 96) return MAP_COLOR_MID
  return MAP_COLOR_HIGH
}

/**
 * Returns map color for one terrain column using biome first, then height fallback.
 */
function colorForColumn(surfaceY: number, biomeIndex: number | undefined): string {
  if (surfaceY <= WATER_LEVEL) return MAP_COLOR_WATER
  if (biomeIndex !== undefined && biomeIndex >= 0 && biomeIndex < ALL_BIOMES.length) {
    const biomeName = ALL_BIOMES[biomeIndex]
    const color = MAP_BIOME_COLORS[biomeName]
    if (color) return color
  }
  return colorForHeight(surfaceY)
}

/**
 * Draws one full-map frame onto the worker-owned OffscreenCanvas.
 */
function drawFrame(message: FullMapWorkerFrameMessage): void {
  if (!canvas || !ctx) return
  const radiusBlocks = FULL_MAP_RADIUS_CHUNKS * CHUNK_SIZE
  const size = Math.min(512, Math.floor(Math.min(canvas.width, canvas.height)))
  const baseScale = size / (2 * radiusBlocks)
  const scale = baseScale * message.zoomLevel
  const centerX = canvas.width / 2
  const centerZ = canvas.height / 2
  const blockToPx = Math.max(1, scale)

  /**
   * Converts world coordinates to map canvas coordinates.
   */
  function worldToCanvas(wx: number, wz: number): { x: number; z: number } {
    const dx = (wx - message.viewCenterX) * scale
    const dz = (wz - message.viewCenterZ) * scale
    return { x: centerX + dx, z: centerZ + dz }
  }

  ctx.fillStyle = MAP_COLOR_UNDISCOVERED
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const tileByKey = new Map(message.tiles.map((tile) => [tile.keyNum, tile] as const))

  for (const keyNum of message.discoveredChunkKeys) {
    const signedCx = (keyNum >> 16) | 0
    const signedCz = (keyNum << 16) >> 16
    const tile = tileByKey.get(keyNum)
    const worldMinX = signedCx * CHUNK_SIZE
    const worldMinZ = signedCz * CHUNK_SIZE

    if (tile?.heightmapBuffer) {
      const biomeBuf = tile.biomeMapBuffer
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = worldMinX + lx + 0.5
          const wz = worldMinZ + lz + 0.5
          const { x: px, z: pz } = worldToCanvas(wx, wz)
          if (
            px < -blockToPx ||
            px > canvas.width + blockToPx ||
            pz < -blockToPx ||
            pz > canvas.height + blockToPx
          ) {
            continue
          }
          const i = lx + lz * CHUNK_SIZE
          const surfaceY = tile.heightmapBuffer[i]
          const biomeIndex = biomeBuf?.[i]
          ctx.fillStyle = colorForColumn(surfaceY, biomeIndex)
          const w = Math.ceil(blockToPx)
          ctx.fillRect(Math.floor(px - w / 2), Math.floor(pz - w / 2), w, w)
        }
      }
    } else {
      const { x: px, z: pz } = worldToCanvas(worldMinX + CHUNK_SIZE / 2, worldMinZ + CHUNK_SIZE / 2)
      const chunkPx = Math.max(MIN_CHUNK_PLACEHOLDER_PX, CHUNK_SIZE * blockToPx)
      ctx.fillStyle = MAP_COLOR_FOG
      ctx.fillRect(
        Math.floor(px - chunkPx / 2),
        Math.floor(pz - chunkPx / 2),
        Math.ceil(chunkPx),
        Math.ceil(chunkPx),
      )
    }
  }

  const { x: playerPx, z: playerPz } = worldToCanvas(message.playerX, message.playerZ)
  ctx.save()
  ctx.translate(playerPx, playerPz)
  ctx.rotate(message.playerRotationY)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(0, -PLAYER_MARKER_TIP)
  ctx.lineTo(PLAYER_MARKER_HALF_SIZE, PLAYER_MARKER_TIP)
  ctx.lineTo(0, PLAYER_MARKER_TIP / 2)
  ctx.lineTo(-PLAYER_MARKER_HALF_SIZE, PLAYER_MARKER_TIP)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = PLAYER_MARKER_OUTLINE_WIDTH
  ctx.stroke()
  ctx.restore()
}

/**
 * Handles messages sent by the main thread map component.
 */
function handleWorkerMessage(message: FullMapWorkerMessage): void {
  if (message.type === 'init') {
    canvas = message.canvas
    canvas.width = message.width
    canvas.height = message.height
    ctx = canvas.getContext('2d')
    return
  }
  if (message.type === 'frame') {
    drawFrame(message)
    const done: FullMapWorkerDoneMessage = { type: 'frame-done' }
    self.postMessage(done)
    return
  }
  if (message.type === 'dispose') {
    canvas = null
    ctx = null
  }
}

self.onmessage = (e: MessageEvent<FullMapWorkerMessage>) => {
  handleWorkerMessage(e.data)
}

