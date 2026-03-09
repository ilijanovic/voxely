import { io, Socket } from "socket.io-client";
import * as THREE from "three";

const SERVER_URL = "http://localhost:3000";
const POSITION_THRESHOLD = 0.01;
const ROTATION_THRESHOLD = 0.01;
const MAX_SEND_RATE = 20; // per second
const LERP_FACTOR = 12; // for interpolation: 1 - exp(-LERP_FACTOR * dt)

export type PlayerState = { x: number; y: number; z: number; rotationY: number; lookPitch?: number };

export type ChatMessage =
  | { type: "join"; id: string; username: string; time: number }
  | { type: "leave"; id: string; username: string; time: number }
  | { type: "chat"; id: string; username: string; text: string; time: number }
  | { type: "system"; text: string; time: number };

const chatCallbacks = new Set<(msg: ChatMessage) => void>();
function notifyChat(msg: ChatMessage): void {
  chatCallbacks.forEach((cb) => cb(msg));
}

export type ConnectionStatus = { connected: boolean; playerCount: number };
const connectionCallbacks = new Set<(status: ConnectionStatus) => void>();
function notifyConnection(): void {
  const status: ConnectionStatus = {
    connected: socket?.connected ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  };
  connectionCallbacks.forEach((cb) => cb(status));
}

type GetPlayerState = () => PlayerState;
type CreatePlayerMesh = () => THREE.Group;

interface RemotePlayer {
  group: THREE.Group;
  targetPosition: THREE.Vector3;
  targetRotationY: number;
  targetLookPitch: number;
  displayPosition: THREE.Vector3;
  displayRotationY: number;
  displayLookPitch: number;
}

let socket: Socket | null = null;
let scene: THREE.Scene | null = null;
let getPlayerState: GetPlayerState | null = null;
let createPlayerMesh: CreatePlayerMesh | null = null;
let myId: string | null = null;
let ready = false;

const remotePlayers = new Map<string, RemotePlayer>();
let lastSentX = 0;
let lastSentY = 0;
let lastSentZ = 0;
let lastSentRotationY = 0;
let lastSentLookPitch = 0;
let lastSendTime = 0;
let hasSentOnce = false;

/** Remote: body = rotationY (look yaw), head only pitch; head.rotation.y = 0 to avoid double rotation. */
function spawnRemotePlayer(id: string, x: number, y: number, z: number, rotationY: number, lookPitch = 0): void {
  if (!scene || !createPlayerMesh) return;
  const group = createPlayerMesh();
  group.position.set(x, y, z);
  group.rotation.y = rotationY - Math.PI; // mesh forward +Z, network yaw forward -Z
  const head = group.children[0] as THREE.Object3D;
  head.rotation.x = lookPitch;
  head.rotation.y = 0;
  scene.add(group);
  remotePlayers.set(id, {
    group,
    targetPosition: new THREE.Vector3(x, y, z),
    targetRotationY: rotationY,
    targetLookPitch: lookPitch,
    displayPosition: new THREE.Vector3(x, y, z),
    displayRotationY: rotationY,
    displayLookPitch: lookPitch,
  });
}

function removeRemotePlayer(id: string): void {
  const remote = remotePlayers.get(id);
  if (!remote) return;
  if (scene) scene.remove(remote.group);
  remote.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    }
  });
  remotePlayers.delete(id);
}

function applyTargetToRemote(id: string, x: number, y: number, z: number, rotationY: number, lookPitch?: number): void {
  const remote = remotePlayers.get(id);
  if (!remote) return;
  remote.targetPosition.set(x, y, z);
  remote.targetRotationY = rotationY;
  if (typeof lookPitch === "number") remote.targetLookPitch = lookPitch;
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * t;
}

/**
 * Initialize multiplayer: connect to server, send join, and set up init/playerMove/playerLeave.
 * Call once after the local player exists. getPlayerState() should return current position and rotationY.
 * createPlayerMesh must be provided (e.g. createPlayerMeshOnly from game.ts) to spawn remote player meshes.
 */
export function initMultiplayer(
  sceneRef: THREE.Scene,
  getPlayerStateFn: GetPlayerState,
  options?: { username?: string; createPlayerMesh: CreatePlayerMesh }
): void {
  scene = sceneRef;
  getPlayerState = getPlayerStateFn;
  createPlayerMesh = options?.createPlayerMesh ?? null;
  const username = options?.username ?? "Player";
  if (!createPlayerMesh) console.warn("multiplayer: createPlayerMesh not provided, remote players will not be visible.");

  socket = io(SERVER_URL);

  socket.on("connect", () => {
    socket!.emit("join", { username });
    notifyConnection();
  });

  socket.on("disconnect", () => {
    notifyConnection();
  });

  type InitPlayer = { id: string; position: { x: number; y: number; z: number }; rotation: { y: number; pitch?: number }; username: string };
  socket.on("init", (payload: { yourId: string; players: InitPlayer[] }) => {
    myId = payload.yourId;
    const state = getPlayerState!();
    lastSentX = state.x;
    lastSentY = state.y;
    lastSentZ = state.z;
    lastSentRotationY = state.rotationY;
    lastSentLookPitch = state.lookPitch ?? 0;
    hasSentOnce = true;
    ready = true;
    notifyChat({ type: "system", text: "You joined the game.", time: Date.now() });
    notifyConnection();

    for (const p of payload.players) {
      if (p.id === myId) continue;
      spawnRemotePlayer(
        p.id,
        p.position.x,
        p.position.y,
        p.position.z,
        p.rotation.y,
        p.rotation.pitch ?? 0
      );
    }
  });

  socket.on("playerMove", (payload: { id: string; x: number; y: number; z: number; rotationY: number; lookPitch?: number }) => {
    if (payload.id === myId) return;
    let remote = remotePlayers.get(payload.id);
    if (!remote) {
      spawnRemotePlayer(payload.id, payload.x, payload.y, payload.z, payload.rotationY, payload.lookPitch ?? 0);
      remote = remotePlayers.get(payload.id)!;
    }
    applyTargetToRemote(payload.id, payload.x, payload.y, payload.z, payload.rotationY, payload.lookPitch);
  });

  socket.on("playerJoined", (payload: { id: string; username: string }) => {
    notifyConnection();
    notifyChat({ type: "join", id: payload.id, username: payload.username, time: Date.now() });
  });

  socket.on("playerLeave", (payload: { id: string; username?: string }) => {
    removeRemotePlayer(payload.id);
    notifyConnection();
    notifyChat({ type: "leave", id: payload.id, username: payload.username ?? "Player", time: Date.now() });
  });

  socket.on("chat", (payload: { id: string; username: string; text: string }) => {
    notifyChat({ type: "chat", id: payload.id, username: payload.username, text: payload.text, time: Date.now() });
  });

  socket.on("state", (state: Array<{ id: string; x: number; y: number; z: number; rotationY: number; lookPitch?: number }>) => {
    if (!myId) return;
    for (const s of state) {
      if (s.id === myId) continue;
      if (!remotePlayers.has(s.id)) spawnRemotePlayer(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch ?? 0);
      else applyTargetToRemote(s.id, s.x, s.y, s.z, s.rotationY, s.lookPitch);
    }
  });
}

/** Subscribe to chat messages (join, leave, chat). Returns unsubscribe function. */
export function subscribeChat(callback: (msg: ChatMessage) => void): () => void {
  chatCallbacks.add(callback);
  return () => chatCallbacks.delete(callback);
}

/** Send a chat message. No-op if not connected. */
export function sendChat(text: string): void {
  if (socket?.connected && text.trim()) socket.emit("chat", { text: text.trim() });
}

/** Get current connection status. */
export function getConnectionStatus(): ConnectionStatus {
  return {
    connected: socket?.connected ?? false,
    playerCount: myId ? remotePlayers.size + 1 : 0,
  };
}

/** Subscribe to connection status changes. Returns unsubscribe function. */
export function subscribeConnection(callback: (status: ConnectionStatus) => void): () => void {
  connectionCallbacks.add(callback);
  callback(getConnectionStatus());
  return () => connectionCallbacks.delete(callback);
}

/**
 * Call every frame from the game loop. Sends move when threshold exceeded (and rate-limited);
 * interpolates remote players toward their targets.
 */
export function updateMultiplayer(dt: number): void {
  if (!socket?.connected || !getPlayerState || !ready) return;

  const state = getPlayerState();
  const now = performance.now() / 1000;
  const minInterval = 1 / MAX_SEND_RATE;
  const canSend = !hasSentOnce || now - lastSendTime >= minInterval;
  const dx = Math.abs(state.x - lastSentX);
  const dy = Math.abs(state.y - lastSentY);
  const dz = Math.abs(state.z - lastSentZ);
  const dr = Math.abs(state.rotationY - lastSentRotationY);
  const pitch = state.lookPitch ?? 0;
  const dp = Math.abs(pitch - lastSentLookPitch);
  const shouldSend = canSend && (dx > POSITION_THRESHOLD || dy > POSITION_THRESHOLD || dz > POSITION_THRESHOLD || dr > ROTATION_THRESHOLD || dp > ROTATION_THRESHOLD);

  if (shouldSend) {
    socket.emit("move", {
      x: state.x,
      y: state.y,
      z: state.z,
      rotationY: state.rotationY,
      lookPitch: pitch,
    });
    lastSentX = state.x;
    lastSentY = state.y;
    lastSentZ = state.z;
    lastSentRotationY = state.rotationY;
    lastSentLookPitch = pitch;
    lastSendTime = now;
  }

  const t = 1 - Math.exp(-LERP_FACTOR * dt);
  const headPitchLerp = 1 - Math.exp(-5 * dt);
  for (const [, remote] of remotePlayers) {
    remote.displayPosition.lerp(remote.targetPosition, t);
    remote.displayRotationY = lerpAngle(remote.displayRotationY, remote.targetRotationY, t);
    remote.displayLookPitch += (remote.targetLookPitch - remote.displayLookPitch) * t;
    remote.group.position.copy(remote.displayPosition);
    remote.group.rotation.y = remote.displayRotationY - Math.PI; // mesh forward +Z, network yaw forward -Z
    const head = remote.group.children[0] as THREE.Object3D;
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, remote.displayLookPitch, headPitchLerp);
    head.rotation.y = 0;
  }
}
