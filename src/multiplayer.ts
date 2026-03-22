/**
 * Multiplayer client facade: networking transport abstraction, local state sync (position/rotation),
 * remote player interpolation, chat and connection status callbacks.
 */
import * as THREE from 'three'
import {
  type BlockBreakPayload,
  type BlockPlacePayload,
  type ChatMessage,
  type ConnectionStatus,
  type InventorySlotUpdatePayload,
  type InventorySyncPayload,
  type MultiplayerTransport,
  type PersistentInventorySlot,
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
let pendingInventorySnapshot: PersistentInventorySlot[] | null = null

const chatCallbacks = new Set<(msg: ChatMessage) => void>()
const connectionCallbacks = new Set<(status: ConnectionStatus) => void>()
const blockPlaceCallbacks = new Set<(payload: BlockPlacePayload) => void>()
const blockBreakCallbacks = new Set<(payload: BlockBreakPayload) => void>()
const inventorySyncCallbacks = new Set<(payload: InventorySyncPayload) => void>()
const inventorySlotUpdateCallbacks = new Set<(payload: InventorySlotUpdatePayload) => void>()

/**
 * Notifies all chat subscribers (join, leave, chat, system messages).
 *
 * @param msg - Chat payload
 */
function notifyChat(msg: ChatMessage): void {
  chatCallbacks.forEach((cb) => cb(msg))
}

/**
 * Notifies all connection subscribers with current connected state and player count.
 */
function notifyConnection(): void {
  const status: ConnectionStatus = {
    connected: transport?.isConnected() ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  }
  connectionCallbacks.forEach((cb) => cb(status))
}

/**
 * Spawns a remote player mesh in the scene and adds interpolation state.
 *
 * @param id - Remote player id
 * @param x - Position X
 * @param y - Position Y
 * @param z - Position Z
 * @param rotationY - Yaw
 * @param lookPitch - Optional head pitch
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
  group.rotation.y = rotationY - Math.PI
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
 * Removes one remote player mesh and disposes resources.
 *
 * @param id - Remote player id
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
 * Updates target interpolation state for one remote player.
 *
 * @param id - Remote player id
 * @param x - Position X
 * @param y - Position Y
 * @param z - Position Z
 * @param rotationY - Yaw
 * @param lookPitch - Optional head pitch
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
 * Shortest-path interpolation for angles in radians.
 *
 * @param from - Start angle
 * @param to - Target angle
 * @param t - Interpolation factor
 * @returns Interpolated angle
 */
function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * t
}

/**
 * Initializes multiplayer transport and subscriptions.
 *
 * @param sceneRef - Scene reference
 * @param getPlayerStateFn - Local player snapshot getter
 * @param options - Optional username, mesh factory, transport kind
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
  transport = transportKind === 'supabase' ? new SupabaseMultiplayerTransport() : new SocketMultiplayerTransport()

  if (!createPlayerMesh) {
    console.warn('multiplayer: createPlayerMesh not provided, remote players will not be visible.')
  }
  if (!transport) return

  transport.connect({
    username,
    callbacks: {
      onConnectChange: () => notifyConnection(),
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
        if (pendingInventorySnapshot) {
          transport?.sendInventorySnapshot(pendingInventorySnapshot)
        }
        for (const p of payload.players) {
          if (p.id !== myId) {
            spawnRemotePlayer(p.id, p.position.x, p.position.y, p.position.z, p.rotation.y, p.rotation.pitch ?? 0)
          }
        }
      },
      onPlayerMove: (payload) => {
        if (payload.id === myId) return
        if (!remotePlayers.has(payload.id)) {
          spawnRemotePlayer(payload.id, payload.x, payload.y, payload.z, payload.rotationY, payload.lookPitch ?? 0)
        }
        applyTargetToRemote(payload.id, payload.x, payload.y, payload.z, payload.rotationY, payload.lookPitch)
      },
      onPlayerJoined: (payload) => {
        notifyConnection()
        notifyChat({ type: 'join', id: payload.id, username: payload.username, time: Date.now() })
      },
      onPlayerLeave: (payload) => {
        removeRemotePlayer(payload.id)
        notifyConnection()
        notifyChat({ type: 'leave', id: payload.id, username: payload.username ?? 'Player', time: Date.now() })
      },
      onChat: (payload) => {
        notifyChat({ type: 'chat', id: payload.id, username: payload.username, text: payload.text, time: Date.now() })
      },
      onState: (state) => {
        if (!myId) return
        for (const s of state) {
          if (s.id === myId) continue
          if (!remotePlayers.has(s.id)) spawnRemotePlayer(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch ?? 0)
          else applyTargetToRemote(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch)
        }
      },
      onBlockPlace: (payload) => blockPlaceCallbacks.forEach((cb) => cb(payload)),
      onBlockBreak: (payload) => blockBreakCallbacks.forEach((cb) => cb(payload)),
      onInventorySync: (payload) => inventorySyncCallbacks.forEach((cb) => cb(payload)),
      onInventorySlotUpdate: (payload) => inventorySlotUpdateCallbacks.forEach((cb) => cb(payload)),
    },
  })
}

/** Adds a system message to the local chat log. */
export function addSystemMessage(text: string): void {
  notifyChat({ type: 'system', text, time: Date.now() })
}

/** Subscribe to chat messages (join, leave, chat). */
export function subscribeChat(callback: (msg: ChatMessage) => void): () => void {
  chatCallbacks.add(callback)
  return () => chatCallbacks.delete(callback)
}

/** Sends one chat message to backend. */
export function sendChat(text: string): void {
  if (!transport?.isConnected()) return
  transport.sendChat(text)
}

/** Sends a block placement intent/event. */
export function sendBlockPlace(
  x: number,
  y: number,
  z: number,
  type: string,
  options?: { slotIndex?: number; consumeItem?: boolean },
): void {
  if (!transport?.isConnected()) return
  transport.sendBlockPlace(x, y, z, type, options)
}

/** Sends a block break intent/event. */
export function sendBlockBreak(x: number, y: number, z: number): void {
  if (!transport?.isConnected()) return
  transport.sendBlockBreak(x, y, z)
}

/** Subscribe to authoritative block placement events. */
export function subscribeBlockPlace(callback: (payload: BlockPlacePayload) => void): () => void {
  blockPlaceCallbacks.add(callback)
  return () => blockPlaceCallbacks.delete(callback)
}

/** Subscribe to authoritative block break events. */
export function subscribeBlockBreak(callback: (payload: BlockBreakPayload) => void): () => void {
  blockBreakCallbacks.add(callback)
  return () => blockBreakCallbacks.delete(callback)
}

/** Subscribe to inventory reconciliation events. */
export function subscribeInventorySync(callback: (payload: InventorySyncPayload) => void): () => void {
  inventorySyncCallbacks.add(callback)
  return () => inventorySyncCallbacks.delete(callback)
}

/** Subscribe to authoritative inventory slot updates. */
export function subscribeInventorySlotUpdate(
  callback: (payload: InventorySlotUpdatePayload) => void,
): () => void {
  inventorySlotUpdateCallbacks.add(callback)
  return () => inventorySlotUpdateCallbacks.delete(callback)
}

/** Sends a full snapshot of persistent inventory slots to server authority. */
export function sendInventorySnapshot(slots: PersistentInventorySlot[]): void {
  pendingInventorySnapshot = slots.map((slot) => ({
    type: slot.type,
    count: slot.count,
  }))
  if (!transport?.isConnected()) return
  transport.sendInventorySnapshot(pendingInventorySnapshot)
}

/** Current multiplayer connection status. */
export function getConnectionStatus(): ConnectionStatus {
  return {
    connected: transport?.isConnected() ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  }
}

/** Subscribe to connection status changes. */
export function subscribeConnection(callback: (status: ConnectionStatus) => void): () => void {
  connectionCallbacks.add(callback)
  callback(getConnectionStatus())
  return () => connectionCallbacks.delete(callback)
}

/** Frame update: sends local moves and interpolates remote players. */
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
    remote.group.rotation.y = remote.displayRotationY - Math.PI
    const head = remote.group.children[0] as THREE.Object3D
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, remote.displayLookPitch, headPitchLerp)
    head.rotation.y = 0
  }
}
