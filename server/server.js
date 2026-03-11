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

  socket.on('disconnect', () => {
    const id = socket.id
    const p = players.get(id)
    if (p) {
      players.delete(id)
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
