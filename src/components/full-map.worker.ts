import {
  CHUNK_SIZE,
  FULL_MAP_RADIUS_CHUNKS,
  MAP_COLOR_UNDISCOVERED,
  MAP_COLOR_FOG,
} from '../constants'
import type {
  FullMapWorkerMessage,
  FullMapWorkerDoneMessage,
  FullMapWorkerFrameMessage,
} from './full-map-worker-protocol'

let _canvas: OffscreenCanvas | null = null
let _ctx: OffscreenCanvasRenderingContext2D | null = null
let _width = 0
let _height = 0

/**
 * Initializes OffscreenCanvas and 2D context.
 *
 * @param canvas - OffscreenCanvas transferred from main thread
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 */
function initCanvas(canvas: OffscreenCanvas, width: number, height: number): void {
  _canvas = canvas
  _width = width
  _height = height
  _canvas.width = width
  _canvas.height = height
  _ctx = canvas.getContext('2d')
}

/**
 * Draws a lightweight map frame on the worker.
 * This intentionally draws per-chunk rectangles (not per-block) to keep worker cost low.
 *
 * @param msg - Frame message
 */
function drawFrame(msg: FullMapWorkerFrameMessage): void {
  const ctx = _ctx
  if (!ctx) return

  ctx.clearRect(0, 0, _width, _height)
  ctx.fillStyle = MAP_COLOR_UNDISCOVERED
  ctx.fillRect(0, 0, _width, _height)

  const radiusBlocks = FULL_MAP_RADIUS_CHUNKS * CHUNK_SIZE
  const size = Math.min(512, Math.floor(Math.min(_width, _height)))
  const baseScale = size / (2 * radiusBlocks)
  const scale = baseScale * msg.zoomLevel

  const centerX = _width / 2
  const centerZ = _height / 2

  const discovered = new Set<number>(msg.discoveredChunkKeys)
  const tilesByKey = new Map<number, (typeof msg.tiles)[number]>(msg.tiles.map((t) => [t.keyNum, t] as const))

  // Draw a fog-tinted rectangle per discovered chunk tile. This is a fast, stable fallback.
  ctx.fillStyle = MAP_COLOR_FOG
  for (const keyNum of discovered) {
    const signedCx = (keyNum >> 16) | 0
    const signedCz = (keyNum << 16) >> 16
    const worldMinX = signedCx * CHUNK_SIZE
    const worldMinZ = signedCz * CHUNK_SIZE

    // Basic culling: if chunk AABB is fully outside canvas, skip.
    const dx = (worldMinX - msg.viewCenterX) * scale
    const dz = (worldMinZ - msg.viewCenterZ) * scale
    const px = centerX + dx
    const pz = centerZ + dz
    const chunkPx = CHUNK_SIZE * scale
    if (px + chunkPx < 0 || pz + chunkPx < 0 || px > _width || pz > _height) continue

    // If we have tile data, make it slightly brighter to distinguish "loaded" tiles.
    const tile = tilesByKey.get(keyNum)
    ctx.globalAlpha = tile?.heightmapBuffer ? 1 : 0.7
    ctx.fillRect(px, pz, chunkPx, chunkPx)
  }
  ctx.globalAlpha = 1
}

/**
 * Posts a "frame done" acknowledgement.
 */
function postDone(): void {
  const done: FullMapWorkerDoneMessage = { type: 'frame-done' }
  // Some TS setups don't include `webworker` lib types; avoid referencing DedicatedWorkerGlobalScope.
  ;(self as unknown as { postMessage: (msg: FullMapWorkerDoneMessage) => void }).postMessage(done)
}

self.onmessage = (e: MessageEvent<FullMapWorkerMessage>) => {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'init') {
    initCanvas(msg.canvas, msg.width, msg.height)
    return
  }
  if (msg.type === 'dispose') {
    _ctx = null
    _canvas = null
    _width = 0
    _height = 0
    return
  }
  if (msg.type === 'frame') {
    drawFrame(msg)
    postDone()
  }
}

