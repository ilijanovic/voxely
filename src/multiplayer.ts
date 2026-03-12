/**
 * Multiplayer client facade: networking transport abstraction, local state sync (position/rotation),
 * remote player interpolation, chat and connection status callbacks.
 */
import * as THREE from '@/three'
import {
  type ChatMessage,
  type ConnectionStatus,
  type MultiplayerTransport,
  type PlayerState,
} from './multiplayer/types'
import { SocketMultiplayerTransport } from './multiplayer/transports/socket'
import { SupabaseMultiplayerTransport } from './multiplayer/transports/supabase'

/** Minimum position change (world units) before sending a move update; reduces traffic. */
const POSITION_THRESHOLD = 0.01
/** Minimum rotation change (radians) before sending a move update. */
const ROTATION_THRESHOLD = 0.01
/** Maximum move updates sent per second; rate-limits network traffic. */
const MAX_SEND_RATE = 20
/** Interpolation factor for remote position/rotation: display lerps toward target with 1 - exp(-LERP_FACTOR * dt). */
const LERP_FACTOR = 12

type GetPlayerState = () => PlayerState

interface RemotePlayer {
  group: THREE.Group
  targetPosition: THREE.Vector3
  targetRotationY: number
  targetLookPitch: number
  displayPosition: THREE.Vector3
  displayRotationY: number
  displayLookPitch: number
}

let transport: MultiplayerTransport | null = null
let scene: THREE.Scene | null = null
let getPlayerState: GetPlayerState | null = null
let createPlayerMesh: (() => THREE.Group) | null = null
let myId: string | null = null
let ready = false

const remotePlayers = new Map<string, RemotePlayer>()
let lastSentX = 0
let lastSentY = 0
let lastSentZ = 0
let lastSentRotationY = 0
let lastSentLookPitch = 0
let lastSendTime = 0
let hasSentOnce = false

const chatCallbacks = new Set<(msg: ChatMessage) => void>()
const connectionCallbacks = new Set<(status: ConnectionStatus) => void>()

/** Notifies all chat subscribers (join, leave, chat, system messages). */
function notifyChat(msg: ChatMessage): void {
  chatCallbacks.forEach((cb) => cb(msg))
}

/** Notifies all connection subscribers with current connected state and player count. */
function notifyConnection(): void {
  const status: ConnectionStatus = {
    connected: transport?.isConnected() ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  }
  connectionCallbacks.forEach((cb) => cb(status))
}

/**
 * Spawns a remote player mesh in the scene and adds it to remotePlayers with target/display state for interpolation.
 * Mesh forward is +Z; network yaw is forward -Z, so we set group.rotation.y = rotationY - Math.PI. Head stores only pitch; head.rotation.y = 0.
 */
function spawnRemotePlayer(
  id: string,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  lookPitch = 0,
): void {
  if (!scene || !createPlayerMesh) return
  const group = createPlayerMesh()
  group.position.set(x, y, z)
  group.rotation.y = rotationY - Math.PI // mesh forward +Z, network yaw forward -Z
  const head = group.children[0] as THREE.Object3D
  head.rotation.x = lookPitch
  head.rotation.y = 0
  scene.add(group)
  remotePlayers.set(id, {
    group,
    targetPosition: new THREE.Vector3(x, y, z),
    targetRotationY: rotationY,
    targetLookPitch: lookPitch,
    displayPosition: new THREE.Vector3(x, y, z),
    displayRotationY: rotationY,
    displayLookPitch: lookPitch,
  })
}

/**
 * Removes a remote player from the scene and disposes geometries and materials to avoid leaks.
 */
function removeRemotePlayer(id: string): void {
  const remote = remotePlayers.get(id)
  if (!remote) return
  if (scene) scene.remove(remote.group)
  remote.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
      else obj.material?.dispose()
    }
  })
  remotePlayers.delete(id)
}

/**
 * Updates the target position and rotation for a remote player; interpolation in updateMultiplayer will move display toward these values.
 */
function applyTargetToRemote(
  id: string,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  lookPitch?: number,
): void {
  const remote = remotePlayers.get(id)
  if (!remote) return
  remote.targetPosition.set(x, y, z)
  remote.targetRotationY = rotationY
  if (typeof lookPitch === 'number') remote.targetLookPitch = lookPitch
}

/**
 * Shortest-path linear interpolation between two angles (radians), handling wrap-around so rotation always takes the smaller arc.
 */
function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * t
}

/**
 * Initialize multiplayer: connect to server, send join, and set up init/playerMove/playerLeave.
 * Call once after the local player exists. getPlayerState() should return current position and rotationY.
 * createPlayerMesh must be provided (e.g. createPlayerMeshOnly from game.ts) to spawn remote player meshes.
 */
export function initMultiplayer(
  sceneRef: THREE.Scene,
  getPlayerStateFn: GetPlayerState,
  options?: {
    username?: string
    createPlayerMesh: () => THREE.Group
    transport?: 'socket' | 'supabase'
  },
): void {
  scene = sceneRef
  getPlayerState = getPlayerStateFn
  createPlayerMesh = options?.createPlayerMesh ?? null
  const username = options?.username ?? 'Player'
  const transportKind = options?.transport ?? 'socket'

  if (transportKind === 'supabase') transport = new SupabaseMultiplayerTransport()
  else transport = new SocketMultiplayerTransport()

  if (!createPlayerMesh)
    console.warn('multiplayer: createPlayerMesh not provided, remote players will not be visible.')

  if (!transport) return

  transport.connect({
    username,
    callbacks: {
      onConnectChange: () => {
        notifyConnection()
      },
      onInit: (payload) => {
        myId = payload.yourId
        const state = getPlayerState!()
        lastSentX = state.x
        lastSentY = state.y
        lastSentZ = state.z
        lastSentRotationY = state.rotationY
        lastSentLookPitch = state.lookPitch ?? 0
        hasSentOnce = true
        ready = true
        notifyChat({ type: 'system', text: 'You joined the game.', time: Date.now() })
        notifyConnection()

        for (const p of payload.players) {
          if (p.id === myId) continue
          spawnRemotePlayer(
            p.id,
            p.position.x,
            p.position.y,
            p.position.z,
            p.rotation.y,
            p.rotation.pitch ?? 0,
          )
        }
      },
      onPlayerMove: (payload) => {
        if (payload.id === myId) return
        let remote = remotePlayers.get(payload.id)
        if (!remote) {
          spawnRemotePlayer(
            payload.id,
            payload.x,
            payload.y,
            payload.z,
            payload.rotationY,
            payload.lookPitch ?? 0,
          )
          remote = remotePlayers.get(payload.id)!
        }
        applyTargetToRemote(
          payload.id,
          payload.x,
          payload.y,
          payload.z,
          payload.rotationY,
          payload.lookPitch,
        )
      },
      onPlayerJoined: (payload) => {
        notifyConnection()
        notifyChat({ type: 'join', id: payload.id, username: payload.username, time: Date.now() })
      },
      onPlayerLeave: (payload) => {
        removeRemotePlayer(payload.id)
        notifyConnection()
        notifyChat({
          type: 'leave',
          id: payload.id,
          username: payload.username ?? 'Player',
          time: Date.now(),
        })
      },
      onChat: (payload) => {
        notifyChat({
          type: 'chat',
          id: payload.id,
          username: payload.username,
          text: payload.text,
          time: Date.now(),
        })
      },
      onState: (state) => {
        if (!myId) return
        for (const s of state) {
          if (s.id === myId) continue
          if (!remotePlayers.has(s.id))
            spawnRemotePlayer(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch ?? 0)
          else applyTargetToRemote(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch)
        }
      },
    },
  })
}

/** Subscribe to chat messages (join, leave, chat). Returns unsubscribe function. */
export function subscribeChat(callback: (msg: ChatMessage) => void): () => void {
  chatCallbacks.add(callback)
  return () => chatCallbacks.delete(callback)
}

/** Send a chat message. No-op if not connected. */
export function sendChat(text: string): void {
  if (!transport?.isConnected()) return
  transport.sendChat(text)
}

/** Get current connection status. */
export function getConnectionStatus(): ConnectionStatus {
  return {
    connected: transport?.isConnected() ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  }
}

/** Subscribe to connection status changes. Returns unsubscribe function. */
export function subscribeConnection(callback: (status: ConnectionStatus) => void): () => void {
  connectionCallbacks.add(callback)
  callback(getConnectionStatus())
  return () => connectionCallbacks.delete(callback)
}

/**
 * Call every frame from the game loop. Sends move when threshold exceeded (and rate-limited);
 * interpolates remote players toward their targets.
 */
export function updateMultiplayer(dt: number): void {
  if (!transport?.isConnected() || !getPlayerState || !ready) return

  const state = getPlayerState()
  const now = performance.now() / 1000
  const minInterval = 1 / MAX_SEND_RATE
  const canSend = !hasSentOnce || now - lastSendTime >= minInterval
  const dx = Math.abs(state.x - lastSentX)
  const dy = Math.abs(state.y - lastSentY)
  const dz = Math.abs(state.z - lastSentZ)
  const dr = Math.abs(state.rotationY - lastSentRotationY)
  const pitch = state.lookPitch ?? 0
  const dp = Math.abs(pitch - lastSentLookPitch)
  const shouldSend =
    canSend &&
    (dx > POSITION_THRESHOLD ||
      dy > POSITION_THRESHOLD ||
      dz > POSITION_THRESHOLD ||
      dr > ROTATION_THRESHOLD ||
      dp > ROTATION_THRESHOLD)

  if (shouldSend) {
    transport.sendMove({ ...state, lookPitch: pitch })
    lastSentX = state.x
    lastSentY = state.y
    lastSentZ = state.z
    lastSentRotationY = state.rotationY
    lastSentLookPitch = pitch
    lastSendTime = now
  }

  const t = 1 - Math.exp(-LERP_FACTOR * dt)
  const headPitchLerp = 1 - Math.exp(-5 * dt)
  for (const [, remote] of remotePlayers) {
    remote.displayPosition.lerp(remote.targetPosition, t)
    remote.displayRotationY = lerpAngle(remote.displayRotationY, remote.targetRotationY, t)
    remote.displayLookPitch += (remote.targetLookPitch - remote.displayLookPitch) * t
    remote.group.position.copy(remote.displayPosition)
    remote.group.rotation.y = remote.displayRotationY - Math.PI // mesh forward +Z, network yaw forward -Z
    const head = remote.group.children[0] as THREE.Object3D
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, remote.displayLookPitch, headPitchLerp)
    head.rotation.y = 0
  }
}
