<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getMapState, type MapState } from '../game'
import { chunkKeyNumeric } from '../chunk-runtime'
import { ALL_BIOMES } from '../terrain-core'
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  FULL_MAP_RADIUS_CHUNKS,
  FULL_MAP_ZOOM_MIN,
  FULL_MAP_ZOOM_MAX,
  MAP_COLOR_WATER,
  MAP_COLOR_LOW,
  MAP_COLOR_MID,
  MAP_COLOR_HIGH,
  MAP_COLOR_FOG,
  MAP_COLOR_UNDISCOVERED,
  MAP_BIOME_COLORS,
} from '../constants'
import type {
  FullMapTilePayload,
  FullMapWorkerDoneMessage,
  FullMapWorkerFrameMessage,
  FullMapWorkerMessage,
} from './full-map-worker-protocol'

const props = defineProps<{
  /** When true, overlay is shown and canvas is updated. */
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null
let mapWorker: Worker | null = null
let usingOffscreenWorker = false
let offscreenInitAttempted = false
let workerFramePending = false
let workerFrameStartedAtMs = 0

/** If no worker ack arrives before this timeout, allow submitting a new frame anyway. */
const WORKER_FRAME_TIMEOUT_MS = 250

/** View center in world coordinates (X). */
const viewCenterX = ref(0)
/** View center in world coordinates (Z). */
const viewCenterZ = ref(0)
/** Zoom factor (1 = base scale; >1 zoom in, <1 zoom out). */
const zoomLevel = ref(1)
/** Whether the user is currently dragging the map. */
const isDragging = ref(false)
/** Whether the user dragged this pointer session (used to avoid closing overlay on release). */
const hasDragged = ref(false)
/** Pan gesture: start pointer position in canvas pixel space. */
let panStartPx = { x: 0, y: 0 }
/** Pan gesture: view center at drag start. */
let panStartView = { x: 0, z: 0 }

/**
 * Picks a fallback terrain color from surface height when biome is unknown.
 */
function colorForHeight(surfaceY: number): string {
  if (surfaceY <= WATER_LEVEL) return MAP_COLOR_WATER
  if (surfaceY < 72) return MAP_COLOR_LOW
  if (surfaceY < 96) return MAP_COLOR_MID
  return MAP_COLOR_HIGH
}

/**
 * Picks map color for a column: water by height, then biome (snow, forest, desert, etc.), else height fallback.
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

/** World AABB of discovered chunks; null if none. */
interface DiscoveredBounds {
  minWorldX: number
  maxWorldX: number
  minWorldZ: number
  maxWorldZ: number
}

/**
 * Computes the world-axis-aligned bounding box of all discovered chunks.
 */
function getDiscoveredBounds(discoveredChunkKeys: number[]): DiscoveredBounds | null {
  if (discoveredChunkKeys.length === 0) return null
  let minCx = Infinity
  let maxCx = -Infinity
  let minCz = Infinity
  let maxCz = -Infinity
  for (const keyNum of discoveredChunkKeys) {
    const cx = (keyNum >> 16) | 0
    const cz = (keyNum << 16) >> 16
    minCx = Math.min(minCx, cx)
    maxCx = Math.max(maxCx, cx)
    minCz = Math.min(minCz, cz)
    maxCz = Math.max(maxCz, cz)
  }
  return {
    minWorldX: minCx * CHUNK_SIZE,
    maxWorldX: (maxCx + 1) * CHUNK_SIZE,
    minWorldZ: minCz * CHUNK_SIZE,
    maxWorldZ: (maxCz + 1) * CHUNK_SIZE,
  }
}

/**
 * Clamps view center so the visible area stays within discovered bounds (or player point if none).
 */
function clampViewCenter(
  viewX: number,
  viewZ: number,
  bounds: DiscoveredBounds | null,
  playerX: number,
  playerZ: number,
  visibleHalfW: number,
  visibleHalfH: number,
): { x: number; z: number } {
  if (!bounds) {
    return { x: playerX, z: playerZ }
  }
  const discoveredW = bounds.maxWorldX - bounds.minWorldX
  const discoveredH = bounds.maxWorldZ - bounds.minWorldZ
  const minCenterX =
    discoveredW <= visibleHalfW * 2
      ? (bounds.minWorldX + bounds.maxWorldX) / 2
      : bounds.minWorldX + visibleHalfW
  const maxCenterX =
    discoveredW <= visibleHalfW * 2
      ? (bounds.minWorldX + bounds.maxWorldX) / 2
      : bounds.maxWorldX - visibleHalfW
  const minCenterZ =
    discoveredH <= visibleHalfH * 2
      ? (bounds.minWorldZ + bounds.maxWorldZ) / 2
      : bounds.minWorldZ + visibleHalfH
  const maxCenterZ =
    discoveredH <= visibleHalfH * 2
      ? (bounds.minWorldZ + bounds.maxWorldZ) / 2
      : bounds.maxWorldZ - visibleHalfH
  return {
    x: Math.min(maxCenterX, Math.max(minCenterX, viewX)),
    z: Math.min(maxCenterZ, Math.max(minCenterZ, viewZ)),
  }
}

/** Resets view to player center and default zoom. */
function centerOnPlayer(): void {
  const state = getMapState()
  viewCenterX.value = state.playerX
  viewCenterZ.value = state.playerZ
  zoomLevel.value = 1
}

/**
 * Returns true when OffscreenCanvas worker rendering can be used for this canvas.
 */
function canUseOffscreenWorker(canvas: HTMLCanvasElement): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof canvas.transferControlToOffscreen === 'function'
  )
}

/**
 * Tries to initialize a dedicated OffscreenCanvas worker renderer for the map.
 */
function tryInitOffscreenWorker(): void {
  const canvas = canvasRef.value
  if (!canvas || offscreenInitAttempted || usingOffscreenWorker) return
  offscreenInitAttempted = true
  if (!canUseOffscreenWorker(canvas)) return

  try {
    const worker = new Worker(new URL('./full-map.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<FullMapWorkerDoneMessage>) => {
      if (e.data?.type === 'frame-done') {
        workerFramePending = false
      }
    }
    worker.onerror = (event) => {
      workerFramePending = false
      console.warn('[full-map] offscreen worker error; map updates may stall.', event.message)
    }
    const offscreen = canvas.transferControlToOffscreen()
    const initMessage: FullMapWorkerMessage = {
      type: 'init',
      canvas: offscreen,
      width: canvas.width,
      height: canvas.height,
    }
    worker.postMessage(initMessage, [offscreen])
    mapWorker = worker
    usingOffscreenWorker = true
  } catch (error) {
    console.warn('[full-map] OffscreenCanvas worker unavailable, using main-thread canvas.', error)
  }
}

/**
 * Disposes the map worker when this component is unmounted.
 */
function disposeMapWorker(): void {
  if (!mapWorker) return
  try {
    const disposeMessage: FullMapWorkerMessage = { type: 'dispose' }
    mapWorker.postMessage(disposeMessage)
  } catch {
    // Ignore worker shutdown errors.
  }
  mapWorker.terminate()
  mapWorker = null
  usingOffscreenWorker = false
  workerFramePending = false
}

/**
 * Applies view-center clamping based on current map state and zoom.
 */
function clampViewCenterForState(state: MapState, canvas: HTMLCanvasElement): void {
  const radiusBlocks = FULL_MAP_RADIUS_CHUNKS * CHUNK_SIZE
  const size = Math.min(512, Math.floor(Math.min(canvas.width, canvas.height)))
  const baseScale = size / (2 * radiusBlocks)
  const scale = baseScale * zoomLevel.value
  const visibleHalfW = canvas.width / 2 / scale
  const visibleHalfH = canvas.height / 2 / scale
  const bounds = getDiscoveredBounds(state.discoveredChunkKeys)
  const clamped = clampViewCenter(
    viewCenterX.value,
    viewCenterZ.value,
    bounds,
    state.playerX,
    state.playerZ,
    visibleHalfW,
    visibleHalfH,
  )
  viewCenterX.value = clamped.x
  viewCenterZ.value = clamped.z
}

/**
 * Builds worker tile payloads from map state.
 */
function toWorkerTiles(state: MapState): FullMapTilePayload[] {
  return state.chunkTiles.map((tile) => ({
    keyNum: chunkKeyNumeric(tile.cx, tile.cz),
    heightmapBuffer: tile.heightmapBuffer,
    biomeMapBuffer: tile.biomeMapBuffer,
  }))
}

/** Draws one frame through the OffscreenCanvas worker path. */
function drawWithWorker(): void {
  const canvas = canvasRef.value
  const worker = mapWorker
  if (!canvas || !worker || !props.open) return

  const now = performance.now()
  if (workerFramePending && now - workerFrameStartedAtMs < WORKER_FRAME_TIMEOUT_MS) return
  workerFramePending = true
  workerFrameStartedAtMs = now

  const state = getMapState()
  clampViewCenterForState(state, canvas)
  const frameMessage: FullMapWorkerFrameMessage = {
    type: 'frame',
    playerX: state.playerX,
    playerZ: state.playerZ,
    playerRotationY: state.playerRotationY,
    viewCenterX: viewCenterX.value,
    viewCenterZ: viewCenterZ.value,
    zoomLevel: zoomLevel.value,
    discoveredChunkKeys: state.discoveredChunkKeys,
    tiles: toWorkerTiles(state),
  }
  worker.postMessage(frameMessage)
}

/** Draws one frame on the main thread (fallback when OffscreenCanvas is unavailable). */
function drawOnMainThread(): void {
  const canvas = canvasRef.value
  if (!canvas || !props.open) return

  const state = getMapState()
  clampViewCenterForState(state, canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const radiusChunks = FULL_MAP_RADIUS_CHUNKS
  const radiusBlocks = radiusChunks * CHUNK_SIZE
  const playerX = state.playerX
  const playerZ = state.playerZ
  const size = Math.min(512, Math.floor(Math.min(canvas.width, canvas.height)))
  const baseScale = size / (2 * radiusBlocks)
  const scale = baseScale * zoomLevel.value

  const centerX = canvas.width / 2
  const centerZ = canvas.height / 2

  const worldToCanvas = (wx: number, wz: number) => {
    const dx = (wx - viewCenterX.value) * scale
    const dz = (wz - viewCenterZ.value) * scale
    return { x: centerX + dx, z: centerZ + dz }
  }

  ctx.fillStyle = MAP_COLOR_UNDISCOVERED
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const discoveredSet = new Set(state.discoveredChunkKeys)
  const tileByKey = new Map(state.chunkTiles.map((t) => [chunkKeyNumeric(t.cx, t.cz), t] as const))

  const blockToPx = Math.max(1, scale)

  for (const keyNum of discoveredSet) {
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
          )
            continue
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
      const chunkPx = Math.max(4, CHUNK_SIZE * blockToPx)
      ctx.fillStyle = MAP_COLOR_FOG
      ctx.fillRect(
        Math.floor(px - chunkPx / 2),
        Math.floor(pz - chunkPx / 2),
        Math.ceil(chunkPx),
        Math.ceil(chunkPx),
      )
    }
  }

  const { x: playerPx, z: playerPz } = worldToCanvas(playerX, playerZ)
  ctx.save()
  ctx.translate(playerPx, playerPz)
  ctx.rotate(state.playerRotationY)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(0, -12)
  ctx.lineTo(8, 12)
  ctx.lineTo(0, 6)
  ctx.lineTo(-8, 12)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

/** Draw loop tick: chooses worker or fallback renderer, then schedules the next frame while open. */
function tick() {
  if (!usingOffscreenWorker) tryInitOffscreenWorker()
  if (usingOffscreenWorker) drawWithWorker()
  else drawOnMainThread()
  if (props.open) rafId = requestAnimationFrame(tick)
}

onMounted(() => {
  if (props.open && rafId === null) rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  disposeMapWorker()
  unbindPanListeners()
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      centerOnPlayer()
      hasDragged.value = false
      if (rafId === null) rafId = requestAnimationFrame(tick)
    } else {
      isDragging.value = false
      unbindPanListeners()
      workerFramePending = false
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      // The canvas is unmounted while the overlay is closed (`v-if="open"`).
      // Any OffscreenCanvas/worker binding created for the previous canvas
      // becomes invalid, so dispose and allow re-init on the next open.
      disposeMapWorker()
      offscreenInitAttempted = false
    }
  },
)

/**
 * Returns scale used in last draw so pan deltas can be converted to world space.
 */
function getScaleForPan(): number {
  const canvas = canvasRef.value
  if (!canvas) return 1
  const size = Math.min(512, Math.floor(Math.min(canvas.width, canvas.height)))
  const radiusBlocks = FULL_MAP_RADIUS_CHUNKS * CHUNK_SIZE
  const baseScale = size / (2 * radiusBlocks)
  return baseScale * zoomLevel.value
}

/**
 * Converts client coordinates to canvas pixel coordinates.
 */
function clientToCanvasPx(clientX: number, clientY: number): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

/** Handles wheel zoom on the map canvas. */
function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const delta = -Math.sign(e.deltaY) * 0.15
  zoomLevel.value = Math.max(
    FULL_MAP_ZOOM_MIN,
    Math.min(FULL_MAP_ZOOM_MAX, zoomLevel.value * (1 + delta)),
  )
}

/** Starts pan on pointer down. */
function onPointerDown(e: MouseEvent | TouchEvent): void {
  const isTouch = 'touches' in e
  const clientX = isTouch ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX
  const clientY = isTouch ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY
  panStartPx = clientToCanvasPx(clientX, clientY)
  panStartView = { x: viewCenterX.value, z: viewCenterZ.value }
  isDragging.value = true
  hasDragged.value = false
  bindPanListeners()
}

/** Updates pan on pointer move. */
function onPointerMove(e: MouseEvent | TouchEvent): void {
  if (!isDragging.value) return
  if ('touches' in e && e.cancelable) e.preventDefault()
  const isTouch = 'touches' in e
  const te = e as TouchEvent
  const now =
    isTouch && te.touches.length === 0
      ? panStartPx
      : clientToCanvasPx(
          isTouch ? te.touches[0].clientX : (e as MouseEvent).clientX,
          isTouch ? te.touches[0].clientY : (e as MouseEvent).clientY,
        )
  const deltaPxX = now.x - panStartPx.x
  const deltaPxZ = now.y - panStartPx.y
  if (Math.abs(deltaPxX) > 2 || Math.abs(deltaPxZ) > 2) hasDragged.value = true
  const scale = getScaleForPan()
  viewCenterX.value = panStartView.x - deltaPxX / scale
  viewCenterZ.value = panStartView.z - deltaPxZ / scale
}

/** Ends pan on pointer up. */
function onPointerUp(): void {
  if (!isDragging.value) return
  isDragging.value = false
  unbindPanListeners()
}

/** Binds global move/up listeners so drag continues when pointer leaves canvas. */
function bindPanListeners(): void {
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('touchmove', onPointerMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
  window.addEventListener('touchcancel', onPointerUp)
}

/** Unbinds global pan listeners. */
function unbindPanListeners(): void {
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
  window.removeEventListener('touchcancel', onPointerUp)
}
</script>
<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fullmap-overlay fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Map"
      @click.self="!hasDragged && emit('close')"
    >
      <div
        class="fullmap-panel rounded-[var(--ui-radius-lg)] border-4 overflow-hidden flex flex-col"
        style="
          border-color: var(--ui-border);
          background: rgba(40, 38, 35, 0.98);
          box-shadow: var(--ui-shadow-panel);
          max-width: 90vw;
          max-height: 90vh;
        "
      >
        <div
          class="flex items-center justify-between px-3 py-2 border-b-2"
          style="border-color: var(--ui-border)"
        >
          <span class="text-sm font-semibold text-[var(--ui-text)]">Map</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded px-2 py-1 text-xs font-medium text-[var(--ui-text)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-accent)]"
              @click="centerOnPlayer"
            >
              Center on player
            </button>
            <button
              type="button"
              class="rounded px-2 py-1 text-xs font-medium text-[var(--ui-text)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-accent)]"
              @click="emit('close')"
            >
              Close (M)
            </button>
          </div>
        </div>
        <canvas
          ref="canvasRef"
          width="512"
          height="512"
          class="block w-full h-full"
          :class="{ 'cursor-grabbing': isDragging, 'cursor-grab': !isDragging }"
          style="
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            min-width: 320px;
            min-height: 320px;
          "
          @wheel.prevent="onWheel"
          @mousedown="onPointerDown"
          @touchstart.prevent="onPointerDown"
        />
      </div>
    </div>
  </Transition>
</template>
