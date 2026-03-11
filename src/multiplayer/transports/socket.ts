import { io, Socket } from 'socket.io-client'
import { MULTIPLAYER_SERVER_URL } from '../../constants'
import type {
  MultiplayerTransport,
  MultiplayerTransportConnectOptions,
  PlayerState,
} from '../types'

/** Socket.IO based multiplayer transport implementation. */
export class SocketMultiplayerTransport implements MultiplayerTransport {
  private socket: Socket | null = null

  /** @inheritdoc */
  connect(options: MultiplayerTransportConnectOptions): void {
    const { username, callbacks } = options

    this.socket = io(MULTIPLAYER_SERVER_URL)

    this.socket.on('connect', () => {
      this.socket!.emit('join', { username })
      callbacks.onConnectChange(true)
    })

    this.socket.on('disconnect', () => {
      callbacks.onConnectChange(false)
    })

    this.socket.on('init', (payload) => {
      callbacks.onInit(payload)
    })

    this.socket.on('playerMove', (payload) => {
      callbacks.onPlayerMove(payload)
    })

    this.socket.on('playerJoined', (payload) => {
      callbacks.onPlayerJoined(payload)
    })

    this.socket.on('playerLeave', (payload) => {
      callbacks.onPlayerLeave(payload)
    })

    this.socket.on('chat', (payload) => {
      callbacks.onChat(payload)
    })

    this.socket.on('state', (state) => {
      callbacks.onState(state)
    })
  }

  /** @inheritdoc */
  disconnect(): void {
    if (!this.socket) return
    this.socket.disconnect()
    this.socket = null
  }

  /** @inheritdoc */
  sendMove(state: PlayerState): void {
    if (!this.socket?.connected) return
    this.socket.emit('move', {
      x: state.x,
      y: state.y,
      z: state.z,
      rotationY: state.rotationY,
      lookPitch: state.lookPitch ?? 0,
    })
  }

  /** @inheritdoc */
  sendChat(text: string): void {
    if (!this.socket?.connected) return
    const trimmed = text.trim()
    if (!trimmed) return
    this.socket.emit('chat', { text: trimmed })
  }

  /** @inheritdoc */
  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

