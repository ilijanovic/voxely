/**
 * Example: Web Worker for chunk generation (data only, no Three.js).
 *
 * Build:
 * - A shared module that only uses pure terrain/tree logic (getHeight, getBiome, noise, generateChunkData).
 * - Worker: import that module; on message { type: 'generate', chunkX, chunkZ }, call generateChunkData and postMessage result.
 * - Main: create Worker from this file (or a bundle); postMessage({ type: 'generate', chunkX, chunkZ }); onmessage → build meshes and add to scene.
 *
 * Vite: use new Worker(new URL('./chunk-worker.ts', import.meta.url), { type: 'module' }) and ensure terrain logic is in a file the worker can import.
 */

export interface ChunkBlock {
  x: number
  y: number
  z: number
  type: string
}

export interface ChunkWaterCell {
  x: number
  z: number
}

export interface ChunkDataMessage {
  type: 'chunk'
  chunkX: number
  chunkZ: number
  blocks: ChunkBlock[]
  waterCells: ChunkWaterCell[]
}

export interface GenerateRequestMessage {
  type: 'generate'
  chunkX: number
  chunkZ: number
}

/**
 * Placeholder: replace with your actual deterministic terrain + tree logic.
 * Must not use Three.js or DOM; only pure functions and data.
 */
function generateChunkData(chunkX: number, chunkZ: number): Omit<ChunkDataMessage, 'type'> {
  const CHUNK_SIZE = 16
  const worldX = chunkX * CHUNK_SIZE
  const worldZ = chunkZ * CHUNK_SIZE
  const blocks: ChunkBlock[] = []
  const waterCells: ChunkWaterCell[] = []

  // Example: flat terrain + one grass layer (replace with getHeight, getBiome, getBlockTypeAt)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = worldX + lx
      const wz = worldZ + lz
      const topY = 4 // getHeight(wx, wz)
      for (let y = 0; y <= topY; y++) {
        const type = y === topY ? 'grass' : 'dirt'
        blocks.push({ x: wx, y, z: wz, type })
      }
      if (topY < 5) waterCells.push({ x: wx + 0.5, z: wz + 0.5 })
    }
  }

  return { chunkX, chunkZ, blocks, waterCells }
}

// Worker global scope
declare const self: Worker

self.onmessage = (e: MessageEvent<GenerateRequestMessage>) => {
  if (e.data.type !== 'generate') return
  const { chunkX, chunkZ } = e.data
  const data = generateChunkData(chunkX, chunkZ)
  const message: ChunkDataMessage = { type: 'chunk', ...data }
  self.postMessage(message)
}
