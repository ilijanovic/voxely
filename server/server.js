const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
      callback(new Error('Not allowed by CORS'))
    },
  },
})

const PORT = 3000

/** @type {Map<string, { id: string, position: { x, y, z }, rotation: { y }, username: string }>} */
const players = new Map()

const DEFAULT_POSITION = { x: 0, y: 0, z: 0 }
const DEFAULT_ROTATION = { y: 0, pitch: 0 }
const WORLD_MIN_Y = -64
const WORLD_MAX_Y = 319
const POSITION_LIMIT = 30000000

/** @type {Map<string, string>} */
const worldBlocks = new Map()
/** @type {Map<string, Array<{ type: string|null, count: number }>>} */
const playerInventories = new Map()
const PERSISTENT_SLOT_COUNT = 36

/**
 * Creates deterministic world block key.
 *
 * @param {number} x - Block x
 * @param {number} y - Block y
 * @param {number} z - Block z
 * @returns {string} Serialized key
 */
function blockKey(x, y, z) {
  return `${x},${y},${z}`
}

/**
 * Returns whether numeric block coordinates are valid and bounded.
 *
 * @param {unknown} x - Candidate x
 * @param {unknown} y - Candidate y
 * @param {unknown} z - Candidate z
 * @returns {boolean} True for valid coordinates
 */
function isValidBlockPosition(x, y, z) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return false
  if (Math.abs(x) > POSITION_LIMIT || Math.abs(z) > POSITION_LIMIT) return false
  return y >= WORLD_MIN_Y && y <= WORLD_MAX_Y
}

/**
 * Sanitizes one persistent inventory snapshot from the client.
 *
 * @param {unknown} slots - Incoming slots payload
 * @returns {Array<{ type: string|null, count: number }>|null} Validated inventory or null
 */
function sanitizeInventorySnapshot(slots) {
  if (!Array.isArray(slots) || slots.length !== PERSISTENT_SLOT_COUNT) return null
  const result = []
  for (const slot of slots) {
    const rawType = typeof slot?.type === 'string' ? slot.type.trim() : null
    const rawCount = Number.isInteger(slot?.count) ? slot.count : 0
    const count = Math.max(0, Math.min(64, rawCount))
    result.push({
      type: rawType && count > 0 ? rawType : null,
      count: rawType && count > 0 ? count : 0,
    })
  }
  return result
}

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    const username = typeof payload?.username === 'string' ? payload.username : 'Player'
    const id = socket.id
    const player = {
      id,
      position: { ...DEFAULT_POSITION },
      rotation: { ...DEFAULT_ROTATION },
      username,
    }
    players.set(id, player)

    const playersList = Array.from(players.values()).map((p) => ({
      id: p.id,
      position: { ...p.position },
      rotation: { ...p.rotation },
      username: p.username,
    }))

    socket.emit('init', { yourId: id, players: playersList })
    socket.broadcast.emit('playerJoined', { id, username })
  })

  socket.on('chat', (payload) => {
    const p = players.get(socket.id)
    if (!p) return
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : ''
    if (!text) return
    io.emit('chat', { id: socket.id, username: p.username, text })
  })

  socket.on('move', (payload) => {
    const p = players.get(socket.id)
    if (!p) return
    const x = typeof payload.x === 'number' ? payload.x : p.position.x
    const y = typeof payload.y === 'number' ? payload.y : p.position.y
    const z = typeof payload.z === 'number' ? payload.z : p.position.z
    const rotationY = typeof payload.rotationY === 'number' ? payload.rotationY : p.rotation.y
    const lookPitch = typeof payload.lookPitch === 'number' ? payload.lookPitch : p.rotation.pitch
    p.position.x = x
    p.position.y = y
    p.position.z = z
    p.rotation.y = rotationY
    p.rotation.pitch = lookPitch

    socket.broadcast.emit('playerMove', {
      id: socket.id,
      x,
      y,
      z,
      rotationY,
      lookPitch,
    })
  })

  socket.on('blockPlace', (payload) => {
    const p = players.get(socket.id)
    if (!p) return
    const x = payload?.x
    const y = payload?.y
    const z = payload?.z
    const type = typeof payload?.type === 'string' ? payload.type.trim() : ''
    if (!isValidBlockPosition(x, y, z) || !type) return
    const consumeItem = payload?.consumeItem !== false
    if (consumeItem) {
      const slotIndex = Number.isInteger(payload?.slotIndex) ? payload.slotIndex : -1
      const slots = playerInventories.get(socket.id)
      if (!slots || slotIndex < 0 || slotIndex >= PERSISTENT_SLOT_COUNT) return
      const slot = slots[slotIndex]
      if (!slot || slot.type !== type || slot.count <= 0) return
      slot.count -= 1
      if (slot.count <= 0) {
        slot.count = 0
        slot.type = null
      }
      socket.emit('inventorySlotUpdate', {
        id: socket.id,
        slotIndex,
        type: slot.type,
        count: slot.count,
      })
    }
    worldBlocks.set(blockKey(x, y, z), type)
    io.emit('blockPlace', { id: socket.id, x, y, z, type })
  })

  socket.on('blockBreak', (payload) => {
    const p = players.get(socket.id)
    if (!p) return
    const x = payload?.x
    const y = payload?.y
    const z = payload?.z
    if (!isValidBlockPosition(x, y, z)) return
    const key = blockKey(x, y, z)
    const previousType = worldBlocks.get(key)
    worldBlocks.delete(key)
    io.emit('blockBreak', { id: socket.id, x, y, z })
    if (previousType) {
      // Reserved for future server-authoritative inventory reconciliation.
    }
  })

  socket.on('inventorySnapshot', (payload) => {
    const sanitized = sanitizeInventorySnapshot(payload?.slots)
    if (!sanitized) return
    playerInventories.set(socket.id, sanitized)
  })

  socket.on('disconnect', () => {
    const id = socket.id
    const p = players.get(id)
    if (p) {
      players.delete(id)
      playerInventories.delete(id)
      io.emit('playerLeave', { id, username: p.username })
    }
  })
})

// Optional: broadcast full state at 20/s for consistent tick rate
const TICK_MS = 50
setInterval(() => {
  if (players.size === 0) return
  const state = Array.from(players.values()).map((p) => ({
    id: p.id,
    x: p.position.x,
    y: p.position.y,
    z: p.position.z,
    rotationY: p.rotation.y,
    lookPitch: p.rotation.pitch ?? 0,
  }))
  io.emit('state', state)
}, TICK_MS)

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
