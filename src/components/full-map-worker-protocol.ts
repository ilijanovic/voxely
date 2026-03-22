export interface FullMapTilePayload {
  /** Signed chunk key encoded as int32 (same as chunkKeyNumeric). */
  keyNum: number
  /** Transferable heightmap buffer (row-major): [lx + lz * CHUNK_SIZE] = surfaceY. */
  heightmapBuffer?: Float32Array
  /** Transferable biome buffer (row-major): [lx + lz * CHUNK_SIZE] = index into ALL_BIOMES. */
  biomeMapBuffer?: Uint8Array
}

export type FullMapWorkerInitMessage = {
  type: 'init'
  canvas: OffscreenCanvas
  width: number
  height: number
}

export type FullMapWorkerFrameMessage = {
  type: 'frame'
  playerX: number
  playerZ: number
  playerRotationY: number
  viewCenterX: number
  viewCenterZ: number
  zoomLevel: number
  discoveredChunkKeys: number[]
  tiles: FullMapTilePayload[]
}

export type FullMapWorkerDisposeMessage = { type: 'dispose' }

export type FullMapWorkerMessage =
  | FullMapWorkerInitMessage
  | FullMapWorkerFrameMessage
  | FullMapWorkerDisposeMessage

export type FullMapWorkerDoneMessage = { type: 'frame-done' }

