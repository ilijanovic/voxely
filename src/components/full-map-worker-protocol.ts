/** Height/biome tile payload sent to the full-map worker for one chunk. */
export interface FullMapTilePayload {
  keyNum: number
  heightmapBuffer: Float32Array
  biomeMapBuffer?: Uint8Array
}

/** Initializes the full-map worker with an OffscreenCanvas target. */
export interface FullMapWorkerInitMessage {
  type: 'init'
  canvas: OffscreenCanvas
  width: number
  height: number
}

/** Requests one map frame render in the worker. */
export interface FullMapWorkerFrameMessage {
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

/** Stops worker-side rendering and clears references. */
export interface FullMapWorkerDisposeMessage {
  type: 'dispose'
}

/** Message union sent from the main thread to the full-map worker. */
export type FullMapWorkerMessage =
  | FullMapWorkerInitMessage
  | FullMapWorkerFrameMessage
  | FullMapWorkerDisposeMessage

/** Acknowledges that one worker frame finished rendering. */
export interface FullMapWorkerDoneMessage {
  type: 'frame-done'
}

