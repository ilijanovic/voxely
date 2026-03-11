import type * as THREE from 'three'

/** State of a player used for network replication. */
export type PlayerState = {
  x: number
  y: number
  z: number
  rotationY: number
  lookPitch?: number
}

export type ChatMessage =
  | { type: 'join'; id: string; username: string; time: number }
  | { type: 'leave'; id: string; username: string; time: number }
  | { type: 'chat'; id: string; username: string; text: string; time: number }
  | { type: 'system'; text: string; time: number }

export type ConnectionStatus = {
  connected: boolean
  playerCount: number
}

export type InitPlayer = {
  id: string
  position: { x: number; y: number; z: number }
  rotation: { y: number; pitch?: number }
  username: string
}

export type InitPayload = {
  yourId: string
  players: InitPlayer[]
}

export type PlayerMovePayload = {
  id: string
  x: number
  y: number
  z: number
  rotationY: number
  lookPitch?: number
}

export type PlayerJoinedPayload = {
  id: string
  username: string
}

export type PlayerLeavePayload = {
  id: string
  username?: string
}

export type ChatPayload = {
  id: string
  username: string
  text: string
}

export type StateEntry = {
  id: string
  x: number
  y: number
  z: number
  rotationY: number
  lookPitch?: number
}

export type TransportCallbacks = {
  onConnectChange: (connected: boolean) => void
  onInit: (payload: InitPayload) => void
  onPlayerMove: (payload: PlayerMovePayload) => void
  onPlayerJoined: (payload: PlayerJoinedPayload) => void
  onPlayerLeave: (payload: PlayerLeavePayload) => void
  onChat: (payload: ChatPayload) => void
  onState: (state: StateEntry[]) => void
}

export type MultiplayerTransportConnectOptions = {
  username: string
  callbacks: TransportCallbacks
}

/** Factory for creating the mesh that represents a remote player. */
export type CreatePlayerMesh = () => THREE.Group

/** Multiplayer transport abstraction to decouple networking backend from game logic. */
export interface MultiplayerTransport {
  /** Connect to the backend and start listening for events. */
  connect(options: MultiplayerTransportConnectOptions): void

  /** Disconnect from the backend and clean up resources. */
  disconnect(): void

  /** Send latest local player state to the backend. */
  sendMove(state: PlayerState): void

  /** Send a chat message to the backend. */
  sendChat(text: string): void

  /** Whether the underlying connection is currently active. */
  isConnected(): boolean
}

