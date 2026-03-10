import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { BlockType, ChunkData, BlockPos } from "./types";
export type { BlockType };
import {
  CHUNK_SIZE,
  WATER_LEVEL,
  WATER_BLOCK_HEIGHT,
  SPAWN_X,
  SPAWN_Z,
} from "./constants";
import {
  getSelectedBlockType,
  setHotbarIndex,
  updateHotbarSelection,
  setOnHotbarChange,
  getSelectedHotbarIndex,
  notifyHotbarChange,
  getSelectedSlotCount,
  consumeOneFromSelectedSlot,
} from "./game-hotbar";
import {
  resolveVoxelCollisions,
  PLAYER_HALF,
  PLAYER_HEIGHT,
  DEBUG_COLLISION,
  type CollisionDebug,
} from "./game-collision";
import {
  WORLD_SEED,
  getHeight,
  getResolvedBiome,
  getSurfaceY,
  getColumnSurfaceY,
  findSpawnInBiome,
  SPAWN_BIOME,
  SPAWNABLE_BIOMES,
} from "./game-terrain";
export type { Biome } from "./game-terrain";
export { getSelectedBlockType } from "./game-hotbar";
export {
  resolveVoxelCollisions,
  type CollisionResult,
  type CollisionDebug,
} from "./game-collision";
import {
  getShadowsEnabled,
  getFovNormal,
  getFovSprint,
  getPointerSpeed,
  getPointerSpeedSprint,
  getShadowMapSize,
  getRenderDistance,
} from "./graphics-settings";
import { syncTerrainFogFromSceneFog } from "./terrain-fog";
import { getKeyBinding, type KeyAction } from "./key-settings";
import { initMultiplayer, updateMultiplayer } from "./multiplayer";
import { setWorldApi } from "./world-api";
import {
  spawnEntitiesForChunk,
} from "./entities/spawn";
import { updateMovement } from "./entities/movement";
import { updateAI } from "./entities/ai";
import { updateAnimation } from "./entities/animation";
import {
  isSolidBlock as isBlockTypeSolid,
  isUnbreakableBlock,
} from "./block-registry";
import {
  SAVE_VERSION,
  saveToStorage,
  loadFromStorage,
  VALID_BLOCK_TYPES,
  type SaveData,
} from "./save";
import { initMaterialsAndColormaps as initMaterialsAndColormapsSystem } from "./game/init/materials";
import { initSceneAndRenderer as initSceneAndRendererSystem } from "./game/init/scene";
import { initLightsAndSky as initLightsAndSkySystem } from "./game/init/lights-sky";
import {
  createTerrainDebugOverlay as createTerrainDebugOverlaySystem,
  createTerrainDebugState,
  toggleTerrainDebug,
  updateTerrainDebugOverlay as updateTerrainDebugOverlaySystem,
  type TerrainDebugState,
} from "./game/debug/terrain-debug";
import {
  getDayTime,
  setDayTime,
  getSunDirection,
  updateAtmosphere,
  SUN_DISTANCE,
  type AtmosphereContext,
} from "./atmosphere";
import {
  chunks,
  blockModifications,
  columnHeightCache,
  chunkKey,
  chunkKeyNumeric,
  blockKeyNumeric,
  blockKeyFromNumeric,
  blockKeyString,
  invalidateColumnHeight,
  getBlockAt,
  getBlockModsForChunk,
} from "./chunk-runtime";
import { isPendingSpawnReady } from "./game/player/pending-spawn";
import { RaycastMeshCache } from "./game/chunks/raycast-cache";
import {
  initChunkWorkerClient,
  type ChunkWorkerClient,
} from "./game/chunks/chunk-worker-client";
import { applyChunkPayload as applyChunkPayloadToScene } from "./game/chunks/chunk-apply";
import { updateChunks as updateChunksFromModule } from "./game/chunks/chunk-manager";
import {
  generateChunk as generateChunkSync,
  breakBlock as breakBlockSync,
  unloadChunk as unloadChunkSync,
  getBlockWorldPosition as getBlockWorldPositionSync,
  placeTorch as placeTorchSync,
  getRaycastMeshes as getRaycastMeshesSync,
  type ChunkSyncContext,
} from "./game/chunks/chunk-generate-sync";
import {
  updateDropsAndPickup as updateDropsAndPickupSystem,
  type Drop,
} from "./game/world-interactions/drops";
import {
  createTorchGroup,
  applyTorchShadowSettingsToPlacedTorches,
  type PlacedTorch,
} from "./game/world-interactions/torches";
import {
  createPlayerMeshOnly,
  createPOVShadowBody,
} from "./game/player/player-mesh";
export { createPlayerMeshOnly } from "./game/player/player-mesh";
import { updateChunkFrustumVisibility } from "./game/render/frustum-visibility";

/**
 * game.ts – Main game orchestration
 *
 * Responsibilities: init/orchestration, chunk worker + mesh building, player + controls,
 * input state, block break/place, drops, torches, resolveVoxelCollisions, render loop.
 *
 * Init order: initMaterialsAndColormaps → initSceneAndRenderer → initLightsAndSky
 * → initChunkWorker → initPlayerAndWorldApi → initControlsAndInput → animate().
 *
 * Animate order each frame: updateFPSAndSpawn → updateDayCycleAndAtmosphere
 * → updateChunkVisibility → updateMovementAndCollision → updateCameraAndViewMode
 * → updateDropsAndPickup → updateBlockBreakAndPlace → updateShadowAndRender.
 *
 * Extracted modules: save, block-materials, atmosphere, chunk-runtime,
 * game-hotbar, game-collision, game-terrain.
 */

/** Cached grass colormap pixel data; set once at init. */
let grassColormapData: ImageData | null = null;

/** Cached foliage colormap pixel data; set once at init. */
let foliageColormapData: ImageData | null = null;

/** Material for tall grass on top of grass blocks (cross sprite). Set in init if texture loads. */
let tallGrassMaterial: THREE.MeshStandardMaterial | null = null;

// ================= BIOMES / TERRAIN / TREES (see game-terrain.ts) =================



// ================= AUTOSAVE (localStorage) =================

const AUTOSAVE_INTERVAL_MS = 10000;

/** Pending camera orientation from load; applied once after PointerLockControls is created. */
let loadedRotationY: number | null = null;
let loadedLookPitch: number | null = null;

function getPlayerState(): SaveData["player"] {
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    rotationY: lastLookYaw,
    lookPitch: lastLookPitch,
  };
}

function saveGame(): void {
  if (!scene || !player) return;
  const removedBlocks: Array<{ x: number; y: number; z: number }> = [];
  const placedBlocks: Array<{
    x: number;
    y: number;
    z: number;
    type: BlockType;
  }> = [];
  for (const [strKey, value] of blockModifications) {
    const parts = strKey.split(",");
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (value === "air") removedBlocks.push({ x, y, z });
    else placedBlocks.push({ x, y, z, type: value });
  }
  const state: SaveData = {
    saveVersion: SAVE_VERSION,
    worldSeed: WORLD_SEED,
    player: getPlayerState(),
    removedBlocks,
    placedBlocks,
    placedTorches: placedTorches.map((t) => ({ x: t.x, y: t.y, z: t.z })),
    dayTime: getDayTime() % 1,
  };
  saveToStorage(state);
}

function loadGame(): boolean {
  const data = loadFromStorage();
  if (!data) return false;
  if (data.worldSeed !== WORLD_SEED) return false;

  for (const { x, y, z } of data.removedBlocks ?? []) {
    blockModifications.set(blockKeyString(x, y, z), "air");
    invalidateColumnHeight(x, z);
  }
  for (const b of data.placedBlocks ?? []) {
    if (VALID_BLOCK_TYPES.has(b.type)) {
      blockModifications.set(
        blockKeyString(b.x, b.y, b.z),
        b.type as BlockType
      );
      invalidateColumnHeight(b.x, b.z);
    }
  }

  if (typeof torchContainer !== "undefined") {
    while (placedTorches.length) placedTorches.pop();
    while (torchContainer.children.length)
      torchContainer.remove(torchContainer.children[0]);
    for (const t of data.placedTorches ?? []) {
      const group = createTorchGroup(t.x, t.y, t.z);
      torchContainer.add(group);
      placedTorches.push({ x: t.x, y: t.y, z: t.z, group });
    }
  }

  // Alle Chunks im Fußabdruck der gespeicherten Position laden (wie beim Spawn).
  if (typeof scene !== "undefined") {
    const px = data.player.x;
    const pz = data.player.z;
    const footHalf = PLAYER_HALF + 0.5;
    const minCx = Math.floor((px - footHalf) / CHUNK_SIZE);
    const maxCx = Math.floor((px + footHalf) / CHUNK_SIZE);
    const minCz = Math.floor((pz - footHalf) / CHUNK_SIZE);
    const maxCz = Math.floor((pz + footHalf) / CHUNK_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz);
      }
    }
  }
  const loadY = getSurfaceY(data.player.x, data.player.z);
  player.position.set(data.player.x, loadY, data.player.z);
  pendingSpawn = null;
  player.visible = true;
  lastLookYaw = data.player.rotationY;
  lastLookPitch = data.player.lookPitch;
  loadedRotationY = data.player.rotationY;
  loadedLookPitch = data.player.lookPitch;
  if (data.dayTime != null) setDayTime(data.dayTime);
  return true;
}

/** Worker pool client for async chunk generation (avoids main-thread stutter). */
let chunkWorker: ChunkWorkerClient | null = null;
/** Chunk key numbers we've requested from the worker but not yet received. */
const pendingChunkKeys = new Set<number>();
/** Wenn gesetzt: Spawn-Position erst setzen, wenn alle benötigten Chunks geladen sind (Worker-Lieferung abwarten). */
let pendingSpawn: {
  spawnX: number;
  spawnZ: number;
  chunkKeys: Set<number>;
} | null = null;

// ================= VOXEL COLLISION (see game-collision.ts) =================

// Raycaster für Block-Abbau (Halten auf Block = "abbauen")
const raycaster = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const BREAK_DISTANCE = 5; // maximale Reichweite zum Abbauen (in Blöcken)
const BREAK_TIME = 1.0; // Sekunden Halten bis Block abbricht

/** Aktuelles Ziel beim Halten: gleicher Block = Fortschritt, anderer Block = Reset (Weltkoordinaten, nicht Instanz-Index). */
let breakTarget: {
  chunkKeyNum: number;
  blockType: BlockType;
  x: number;
  y: number;
  z: number;
} | null = null;
let breakProgress = 0;
let isMouseDown = false;
/** Einmal pro Rechtsklick: Platzieren (Fackel oder Block) auslösen. */
let rightMouseJustPressed = false;
/** F key pressed for place (works without pointer lock). */
let fKeyJustPressed = false;

/** Schwebende Drop-Items nach Block-Abbau (werden aufgesammelt beim Durchlaufen). */
const drops: Drop[] = [];
const PICKUP_RADIUS = 1.4;
const DROP_BOB_SPEED = 3;
const DROP_BOB_HEIGHT = 0.08;

/** Platziere Fackeln: Weltposition (Mitte der Fackel) + Group (Mesh + PointLight). */
const placedTorches: PlacedTorch[] = [];
const PLACE_DISTANCE = 5;

const _direction = new THREE.Vector3();
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _lastCameraMatrixWorld = new THREE.Matrix4();
/** Letzte an die GPU gesendete FOV (nur bei Änderung updateProjectionMatrix aufrufen). */
let _lastUploadedFov = -1;
let _frustumDirty = true;
const _chunkBox = new THREE.Box3();
const _chunkBoxMin = new THREE.Vector3();
const _chunkBoxMax = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
/** Zielpunkt für Third-Person: Kamera blickt auf Spieler-Mitte, damit der Char im Bildzentrum bleibt. */
const _thirdPersonLookTarget = new THREE.Vector3();
/** OPT-4: scratch for camera offset (avoids new Vector3 per frame). */
const _cameraOffset = new THREE.Vector3();

// OPT-2: reusable AABB block buffer (avoids array/object allocs in resolveVoxelCollisions)
// OPT-3: cache block meshes for raycasting; invalidated on chunk load/unload
const raycastMeshCache = new RaycastMeshCache();

// ================= CHUNK SYNC CONTEXT =================

function getChunkSyncCtx(): ChunkSyncContext {
  return {
    grassColormapData,
    foliageColormapData,
    tallGrassMaterial,
    raycastMeshCache,
    frustumDirty: _frustumDirty,
    scene,
    drops,
    torchContainer,
    placedTorches,
  };
}

function syncFrustumDirty(ctx: ChunkSyncContext): void {
  _frustumDirty = ctx.frustumDirty;
}

function generateChunk(
  _scene: THREE.Scene,
  chunkX: number,
  chunkZ: number
): ChunkData {
  const ctx = getChunkSyncCtx();
  const result = generateChunkSync(ctx, chunkX, chunkZ);
  syncFrustumDirty(ctx);
  return result;
}

function breakBlock(
  chunkKeyNum: number,
  blockType: BlockType,
  worldX: number,
  worldY: number,
  worldZ: number
): void {
  const ctx = getChunkSyncCtx();
  breakBlockSync(ctx, chunkKeyNum, blockType, worldX, worldY, worldZ);
  syncFrustumDirty(ctx);
}

function unloadChunk(scene: THREE.Scene, keyNum: number): void {
  const result = unloadChunkSync(scene, keyNum, raycastMeshCache);
  if (result.frustumDirty) _frustumDirty = true;
}

function placeTorch(worldX: number, worldY: number, worldZ: number): boolean {
  return placeTorchSync(getChunkSyncCtx(), worldX, worldY, worldZ);
}

function applyPendingSpawnIfReady(): void {
  if (!pendingSpawn || !player) return;
  if (!isPendingSpawnReady(pendingSpawn, (keyNum) => chunks.has(keyNum)))
    return;
  const y = getSurfaceY(pendingSpawn.spawnX, pendingSpawn.spawnZ);
  player.position.set(pendingSpawn.spawnX, y, pendingSpawn.spawnZ);
  velocityY = 0;
  velocityX = 0;
  velocityZ = 0;
  playerGrounded = true;
  player.visible = true;
  pendingSpawn = null;
}

function getBlockWorldPosition(
  chunkKeyNum: number,
  blockType: BlockType,
  instanceId: number
): BlockPos | null {
  return getBlockWorldPositionSync(chunkKeyNum, blockType, instanceId);
}

function getRaycastMeshes(): Array<THREE.InstancedMesh | THREE.Mesh> {
  return getRaycastMeshesSync(raycastMeshCache);
}

/** Player chunk coords from last update – only run chunk logic when these change */
let lastPlayerChunkX: number | null = null;
let lastPlayerChunkZ: number | null = null;

// ================= PLAYER =================

function createPlayer(scene: THREE.Scene) {
  const player = createPlayerMeshOnly();
  const head = player.children[0] as THREE.Mesh;
  const body = player.children[1] as THREE.Mesh;
  const leg1 = player.children[2] as THREE.Mesh;
  const leg2 = player.children[3] as THREE.Mesh;
  const arm1 = player.children[4] as THREE.Mesh;
  const arm2 = player.children[5] as THREE.Mesh;

  let spawnX: number;
  let spawnZ: number;
  const first = findSpawnInBiome(SPAWN_BIOME);
  spawnX = first.x;
  spawnZ = first.z;
  // Fallback: if only (0,0) found and center is not the chosen biome, try another spawnable biome
  if (spawnX === 0 && spawnZ === 0 && getResolvedBiome(0, 0) !== SPAWN_BIOME) {
    const fallbackBiome = SPAWNABLE_BIOMES.find((b) => b !== SPAWN_BIOME);
    if (fallbackBiome) {
      const fallback = findSpawnInBiome(fallbackBiome);
      if (fallback.x !== 0 || fallback.z !== 0) {
        spawnX = fallback.x;
        spawnZ = fallback.z;
      }
    }
  }
  // Ultimate fallback: use fixed spawn coordinates from config if still at origin
  if (spawnX === 0 && spawnZ === 0) {
    spawnX = SPAWN_X;
    spawnZ = SPAWN_Z;
  }
  columnHeightCache.clear();
  const footHalf = PLAYER_HALF + 0.5;
  const minCx = Math.floor((spawnX - footHalf) / CHUNK_SIZE);
  const maxCx = Math.floor((spawnX + footHalf) / CHUNK_SIZE);
  const minCz = Math.floor((spawnZ - footHalf) / CHUNK_SIZE);
  const maxCz = Math.floor((spawnZ + footHalf) / CHUNK_SIZE);
  const spawnChunkKeys = new Set<number>();
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      spawnChunkKeys.add(chunkKeyNumeric(cx, cz));
    }
  }

  if (chunkWorker) {
    // Chunks vom Worker-Pool anfordern; Position erst setzen, wenn alle da sind (applyPendingSpawnIfReady).
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const keyNum = chunkKeyNumeric(cx, cz);
        if (chunks.has(keyNum)) continue;
        if (pendingChunkKeys.has(keyNum)) continue;
        pendingChunkKeys.add(keyNum);
        chunkWorker.requestChunk({
          chunkX: cx,
          chunkZ: cz,
          blockMods: getBlockModsForChunk(cx, cz),
        });
      }
    }
    pendingSpawn = { spawnX, spawnZ, chunkKeys: spawnChunkKeys };
    const tempY = getHeight(spawnX, spawnZ) + 0.5;
    player.position.set(spawnX, tempY, spawnZ);
    player.visible = false;
  } else {
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        if (!chunks.has(chunkKeyNumeric(cx, cz))) generateChunk(scene, cx, cz);
      }
    }
    const spawnY = getSurfaceY(spawnX, spawnZ);
    player.position.set(spawnX, spawnY, spawnZ);
  }

  scene.add(player);

  return { player, head, body, leg1, leg2, arm1, arm2 };
}

// ================= POV HAND =================

function createPOVHands(camera: THREE.PerspectiveCamera) {
  const hands = new THREE.Group();
  hands.renderOrder = 999;
  const matSkin = new THREE.MeshStandardMaterial({
    color: 0xffdbac,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1.0,
  });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), matSkin);
  arm.renderOrder = 999;
  arm.position.set(0.45, -0.45, -0.65);
  arm.rotation.set(
    THREE.MathUtils.degToRad(-25),
    THREE.MathUtils.degToRad(-15),
    THREE.MathUtils.degToRad(-10)
  );
  hands.add(arm);
  camera.add(hands);
  return hands;
}

// ================= SCENE (created in init after textures load) =================

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
/** Container für alle platzierten Fackeln (Mesh + Licht). */
let torchContainer: THREE.Group;
let sunLight: THREE.DirectionalLight;
let sunMesh: THREE.Mesh;
let moonMesh: THREE.Mesh;
let stars: THREE.Points;
let sky: THREE.Mesh;
let clouds: THREE.Group;
let cloudMaterial: THREE.MeshBasicMaterial;
let player: THREE.Group;

/** Shadow frustum radius around player (better texel density, less flicker). */
const SHADOW_RADIUS = 60;

let ambientLight: THREE.AmbientLight;
let hemiLight: THREE.HemisphereLight;
let head: THREE.Mesh;
let body: THREE.Mesh;
let leg1: THREE.Mesh;
let leg2: THREE.Mesh;
let arm1: THREE.Mesh;
let arm2: THREE.Mesh;
let povHands: THREE.Group;
/** Nur in POV sichtbar als Schatten auf dem Boden; Mesh selbst unsichtbar (colorWrite=false). */
let povShadowBody: THREE.Group;
let controls: PointerLockControls;

const moveState = { forward: false, back: false, left: false, right: false };
let lastWPressTime = 0;
/** Aktuelle Blickrichtung (für Multiplayer: andere Spieler sehen, wohin du schaust). */
let lastLookYaw = 0;
let lastLookPitch = 0;
let sprintKeyHeld = false;
let sneakKeyHeld = false;
let doubleTapSprint = false;
/** Computed each frame: forward && !sneak && (sprint key held || double-tap W). */
let isSprinting = false;
const DOUBLE_TAP_WINDOW_MS = 400;

const FOV_LERP_SPEED = 6; // wie schnell FOV zum Ziel lerpt

// POV-Hand-Animation: Zustand wird auf Ziel gelerpt, kein Drift (Ziel = 0 oder Wackel-Offset)
let povHandAnimX = 0;
let povHandAnimY = 0;
let povHandAnimZ = 0;
const POV_HAND_LERP = 0.22; // wie schnell Richtung Ziel (0 = neutral, 1 = sofort)

// Camera head bobbing (first-person): phase + smoothed offsets to avoid jitter.
let cameraBobPhase = 0;
let cameraBobX = 0;
let cameraBobY = 0;
let cameraBobStrength = 0;

// Mining: Arm schwingt beim Halten auf Block (Abbauen)
let miningSwingPhase = 0;
const POV_ARM_BASE_ROTATION_X = THREE.MathUtils.degToRad(-25);
const POV_ARM_BASE_ROTATION_Y = THREE.MathUtils.degToRad(-15);
const POV_ARM_BASE_ROTATION_Z = THREE.MathUtils.degToRad(-10);

// Third-Person: Körper-Yaw (Bewegungsrichtung), Kopf relativ dazu
let bodyYaw = 0;
const HEAD_PITCH_MAX = THREE.MathUtils.degToRad(65); // vertikale Kopfbegrenzung

/** Ob Multiplayer aktiv ist (nur dann verbinden wir mit dem Server). */
let multiplayerEnabled = false;

/** Wird von der Vue-App mit dem Canvas-Container aufgerufen (nach Mount). */
export async function initGame(
  container?: HTMLElement,
  options?: {
    multiplayer?: boolean;
    onHotbarChange?: (blocks: BlockType[], counts: number[]) => void;
  }
): Promise<void> {
  multiplayerEnabled = options?.multiplayer === true;
  setOnHotbarChange(options?.onHotbarChange ?? null);
  await init(container);
}

async function init(container?: HTMLElement): Promise<void> {
  await initMaterialsAndColormaps();
  initSceneAndRenderer(container);
  initLightsAndSky();
  initChunkWorker();
  initPlayerAndWorldApi();
  initControlsAndInput();
}

async function initMaterialsAndColormaps(): Promise<void> {
  const res = await initMaterialsAndColormapsSystem();
  grassColormapData = res.grassColormapData;
  foliageColormapData = res.foliageColormapData;
  tallGrassMaterial = res.tallGrassMaterial;
}

function initSceneAndRenderer(container?: HTMLElement): void {
  const res = initSceneAndRendererSystem(container);
  scene = res.scene;
  torchContainer = res.torchContainer;
  camera = res.camera;
  renderer = res.renderer;
  fpsEl = res.fpsEl;
  createTerrainDebugOverlaySystem(terrainDebug);
}

function initLightsAndSky(): void {
  const result = initLightsAndSkySystem(scene, SHADOW_RADIUS);
  sunLight = result.sunLight;
  sunMesh = result.sunMesh;
  moonMesh = result.moonMesh;
  sky = result.sky;
  clouds = result.clouds;
  cloudMaterial = result.cloudMaterial;
  stars = result.stars;
  ambientLight = result.ambientLight;
  hemiLight = result.hemiLight;
}

function initChunkWorker(): void {
  const client = initChunkWorkerClient({
    seed: WORLD_SEED,
    // Cap worker pool size (default is 4; this makes it easy to wire into settings later).
    maxWorkers: 8,
    onPayload: (payload) =>
      applyChunkPayloadToScene(
        scene,
        payload,
        {
          chunks,
          pendingChunkKeys,
          grassColormapData,
          foliageColormapData,
          tallGrassMaterial,
          getResolvedBiome,
          onChunkAdded: (data) => {
            spawnEntitiesForChunk(
              scene,
              chunkKey(data.cx, data.cz),
              data.cx,
              data.cz
            );
          },
          onChunkChanged: () => {
            raycastMeshCache.markDirty();
            _frustumDirty = true;
            applyPendingSpawnIfReady();
          },
        },
        WORLD_SEED
      ),
    onError: (message, error) => {
      console.error(
        "[terrain] chunk worker failed, falling back to main thread generation",
        message,
        error
      );
      chunkWorker = null;
    },
  });
  chunkWorker = client ?? null;
}

function initPlayerAndWorldApi(): void {
  const created = createPlayer(scene);
  player = created.player;
  head = created.head;
  body = created.body;
  leg1 = created.leg1;
  leg2 = created.leg2;
  arm1 = created.arm1;
  arm2 = created.arm2;

  setWorldApi({
    getBlockAt,
    getSurfaceY,
    getColumnSurfaceY,
    getBiome: getResolvedBiome,
  });

  loadGame();

  updateChunksFromModule({
    scene,
    player,
    chunkWorker,
    pendingChunkKeys,
    generateChunkSync: generateChunk,
    unloadChunk,
  });
  lastPlayerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
  lastPlayerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);

  if (multiplayerEnabled) {
    initMultiplayer(
      scene,
      () => ({
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotationY: lastLookYaw,
        lookPitch: lastLookPitch,
      }),
      { createPlayerMesh: createPlayerMeshOnly }
    );
  }
}

function initControlsAndInput(): void {
  povHands = createPOVHands(camera);

  povShadowBody = createPOVShadowBody();
  scene.add(povShadowBody);

  controls = new PointerLockControls(camera, renderer.domElement);
  if (loadedRotationY !== null && loadedLookPitch !== null) {
    camera.rotation.order = "YXZ";
    camera.rotation.y = loadedRotationY;
    camera.rotation.x = loadedLookPitch;
    camera.rotation.z = 0;
    loadedRotationY = null;
    loadedLookPitch = null;
  }
  renderer.domElement.addEventListener("click", () => {
    renderer.domElement.requestPointerLock();
  });
  document.addEventListener("mousedown", (e) => {
    if (e.button === 0) isMouseDown = true;
    if (e.button === 2) {
      e.preventDefault();
      rightMouseJustPressed = true;
    }
  });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("mouseup", () => {
    isMouseDown = false;
    breakTarget = null;
    breakProgress = 0;
    const crackEl = document.getElementById("block-crack");
    if (crackEl) crackEl.style.visibility = "hidden";
  });
  document.addEventListener("wheel", (e) => e.preventDefault(), {
    passive: false,
  });
  document.addEventListener("keydown", (e) => {
    const scrollKeys = [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ];
    if (
      !(
        document.activeElement &&
        (document.activeElement as HTMLElement).closest?.(
          "input, textarea, [contenteditable]"
        )
      )
    ) {
      if (scrollKeys.includes(e.code)) e.preventDefault();
    }
  });

  // Hotbar: Auswahl beim Start anzeigen + UI einmal mit aktuellem Stand füttern
  updateHotbarSelection();
  notifyHotbarChange();

  // Mausrad: Hotbar-Slot wechseln (wie in Minecraft)
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY > 0) setHotbarIndex(getSelectedHotbarIndex() + 1);
      else if (e.deltaY < 0) setHotbarIndex(getSelectedHotbarIndex() - 1);
    },
    { passive: true }
  );

  setInterval(saveGame, AUTOSAVE_INTERVAL_MS);
  window.addEventListener("beforeunload", () => saveGame());

  animate();
}

// ================= MOVEMENT CONSTANTS =================

// Movement in world units per second (frame-rate independent, Minecraft Java values)
const moveSpeed = 4.317;
const sprintSpeed = 5.612;
const sneakSpeed = 1.295; // 30% of walking (Minecraft Java)
const airControl = 2.5;
const horizontalMaxSpeed = 4.4;
const horizontalMaxSpeedSprint = 5.8;
const horizontalMaxSpeedSneak = 1.4;
const groundFriction = 0.15; // velocity multiplier per second when on ground and not moving

// ================= PHYSICS (all per-second for frame-rate independence) =================

let velocityY = 0;
let velocityX = 0;
let velocityZ = 0;
/** Set each frame from resolveVoxelCollisions result; used for jump (Space) and next-frame friction/air control. */
let playerGrounded = false;
/** When DEBUG_COLLISION is true: skip this many frames before logging again (avoids console flood). */
let debugCollisionLogCooldown = 0;
/** Gesetzt bei Space keydown; wird zu Beginn des nächsten Frames ausgewertet, damit der Sprung sofort in der Physik ankommt. */
let jumpRequested = false;

const gravity = -18;
const jumpForce = 6.71; // ~1.2522 block jump height (Minecraft Java)
const terminalVelocity = -78.4;

const clock = new THREE.Clock();

/** Camera height in first-person (Minecraft: eyes at ~1.62). */
const eyeHeight = 1.62;
const cameraDistance = 6;
const cameraHeight = 2.5;

let viewMode: "first" | "third" = "first";

// ================= INPUT =================

/** Wenn der Fokus in einem Eingabefeld liegt (z. B. Chat), keine Spiel-Shortcuts ausführen. */
function isTypingFocus(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

document.addEventListener("keydown", (e) => {
  if (isTypingFocus()) return;
  const code = e.code;

  if (code === "KeyP" && !e.repeat) {
    e.preventDefault();
    toggleTerrainDebug(terrainDebug);
    return;
  }

  // Hotbar 1–9
  for (let i = 0; i < 9; i++) {
    if (getKeyBinding(`hotbar${i + 1}` as KeyAction) === code) {
      setHotbarIndex(i);
      return;
    }
  }

  // Place block / torch (alternative to right-click, e.g. for Mac trackpad)
  if (code === getKeyBinding("place") && !e.repeat) {
    rightMouseJustPressed = true;
    fKeyJustPressed = true;
    return;
  }

  if (code === getKeyBinding("forward")) {
    moveState.forward = true;
    if (!e.repeat) {
      const now = performance.now();
      if (lastWPressTime > 0 && now - lastWPressTime < DOUBLE_TAP_WINDOW_MS) {
        doubleTapSprint = true;
      }
      lastWPressTime = now;
    }
    return;
  }
  if (code === getKeyBinding("sprint")) {
    sprintKeyHeld = true;
    return;
  }
  if (code === getKeyBinding("sneak")) {
    sneakKeyHeld = true;
    return;
  }
  if (code === getKeyBinding("back")) {
    moveState.back = true;
    return;
  }
  if (code === getKeyBinding("left")) {
    moveState.left = true;
    return;
  }
  if (code === getKeyBinding("right")) {
    moveState.right = true;
    return;
  }
  if (code === getKeyBinding("jump")) {
    if (!e.repeat) {
      jumpRequested = true;
      if (playerGrounded) velocityY = jumpForce;
    }
    e.preventDefault();
    return;
  }
  if (code === getKeyBinding("toggleView")) {
    viewMode = viewMode === "first" ? "third" : "first";
  }
});

document.addEventListener("keyup", (e) => {
  if (isTypingFocus()) return;
  const code = e.code;
  if (code === getKeyBinding("forward")) {
    moveState.forward = false;
    doubleTapSprint = false;
    return;
  }
  if (code === getKeyBinding("sprint")) sprintKeyHeld = false;
  if (code === getKeyBinding("back")) moveState.back = false;
  if (code === getKeyBinding("left")) moveState.left = false;
  if (code === getKeyBinding("right")) moveState.right = false;
  if (code === getKeyBinding("jump")) jumpRequested = false;
});

// ================= SHADOW CAMERA (pro Frame, nach Bewegung) =================

/**
 * Richtet die DirectionalLight-Shadow-Camera auf die aktuelle Spielerposition aus.
 * Muss NACH der Bewegungslogik, direkt vor renderer.render(), aufgerufen werden.
 * So bleibt der Schatten-Frustum um den Spieler zentriert und Schatten werden nicht geclippt.
 *
 * Wichtig für Spieler-Schatten:
 * - Target in Spieler-Mitte (y + Körperhöhe/2), damit die Ortho-View den Avatar gut erfasst.
 * - Light und Target sofort mit updateMatrixWorld() aktualisieren, damit die Shadow-Pass
 *   die richtigen Positionen nutzt (wird sonst evtl. erst im nächsten Frame übernommen).
 */
function updateShadowCameraForPlayer(
  light: THREE.DirectionalLight,
  playerPosition: THREE.Vector3,
  sunDirection: THREE.Vector3,
  sunDistance: number
) {
  light.position
    .copy(playerPosition)
    .addScaledVector(sunDirection, sunDistance);
  // Shadow-Target in Körpermitte, damit Spieler-Silhouette zentriert im Shadow-Map steht
  light.target.position.set(
    playerPosition.x,
    playerPosition.y + PLAYER_HEIGHT * 0.5,
    playerPosition.z
  );
  // Sofortige Matrix-Aktualisierung, damit die Shadow-Pass in diesem Frame die richtigen Positionen nutzt
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
}

// ================= GAME LOOP =================

// FPS-Anzeige (gleitender Durchschnitt) – Element wird in init() gesetzt, sobald DOM (Vue) bereit ist
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsEl: HTMLElement | null = null;
const terrainDebug: TerrainDebugState = createTerrainDebugState();

function updateFPSAndSpawn(time: number): void {
  applyPendingSpawnIfReady();
  updateTerrainDebugOverlaySystem(terrainDebug, time, player);
  fpsFrameCount++;
  const fpsElapsed = time * 1000 - fpsLastTime;
  if (fpsElapsed >= 500) {
    const fps = Math.round((fpsFrameCount * 1000) / fpsElapsed);
    if (fpsEl) fpsEl.textContent = `${fps} FPS`;
    fpsFrameCount = 0;
    fpsLastTime = time * 1000;
  }
}

function updateDayCycleAndAtmosphere(dt: number): void {
  const ctx: AtmosphereContext = {
    playerPosition: player.position,
    viewMode,
    eyeHeight,
    cameraHeight,
    waterLevel: WATER_LEVEL,
    waterBlockHeight: WATER_BLOCK_HEIGHT,
    scene,
    renderer,
    sunLight,
    sunMesh,
    moonMesh,
    sky,
    stars,
    clouds,
    cloudMaterial,
    ambientLight,
    hemiLight,
  };
  updateAtmosphere(dt, ctx);

  // Tune fog range to render distance so far LOD fades into the sky cleanly.
  if (scene.fog && "far" in scene.fog) {
    // If underwater, atmosphere sets a short fog range; keep that.
    if (scene.fog.far > 50) {
      const rd = getRenderDistance();
      const farStart = Math.max(2, rd - 2);
      scene.fog.near = Math.max(10, farStart * CHUNK_SIZE * 0.8);
      scene.fog.far = Math.max(scene.fog.near + 10, rd * CHUNK_SIZE * 1.15);
    }
  }
  syncTerrainFogFromSceneFog(scene);
}

function updateChunkVisibility(): void {
  const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
  const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);
  _direction.set(0, 0, 0);
  controls.getDirection(_direction);
  _direction.y = 0;
  if (_direction.lengthSq() > 0) _direction.normalize();
  if (lastPlayerChunkX !== playerChunkX || lastPlayerChunkZ !== playerChunkZ) {
    updateChunksFromModule({
      scene,
      player,
      lookDirection: { x: _direction.x, z: _direction.z },
      chunkWorker,
      pendingChunkKeys,
      generateChunkSync: generateChunk,
      unloadChunk,
    });
    lastPlayerChunkX = playerChunkX;
    lastPlayerChunkZ = playerChunkZ;
  }
  _right.crossVectors(_direction, camera.up).normalize();
}

function updateMovementAndCollision(dt: number, time: number): void {
  isSprinting =
    moveState.forward && !sneakKeyHeld && (sprintKeyHeld || doubleTapSprint);
  const speed = sneakKeyHeld
    ? sneakSpeed
    : isSprinting
    ? sprintSpeed
    : moveSpeed;
  const backSpeed = sneakKeyHeld ? sneakSpeed : moveSpeed;
  const maxSpeed = sneakKeyHeld
    ? horizontalMaxSpeedSneak
    : isSprinting
    ? horizontalMaxSpeedSprint
    : horizontalMaxSpeed;

  // POV-FOV: beim Sprint etwas zoomen (größeres FOV = schnellerer Eindruck)
  const targetFov =
    isSprinting && moveState.forward ? getFovSprint() : getFovNormal();
  camera.fov += (targetFov - camera.fov) * Math.min(1, FOV_LERP_SPEED * dt);
  // Projektion nur bei spürbarer FOV-Änderung neu hochladen (spart GPU-Arbeit im Ruhezustand)
  if (Math.abs(camera.fov - _lastUploadedFov) > 0.05) {
    camera.updateProjectionMatrix();
    _lastUploadedFov = camera.fov;
  }

  // Maus-Sensitivität beim Sprint etwas höher
  const targetPointerSpeed =
    isSprinting && moveState.forward
      ? getPointerSpeedSprint()
      : getPointerSpeed();
  controls.pointerSpeed +=
    (targetPointerSpeed - controls.pointerSpeed) *
    Math.min(1, FOV_LERP_SPEED * dt);

  // Freeze physics while waiting for authoritative spawn chunks from the worker
  if (pendingSpawn) {
    velocityX = 0;
    velocityY = 0;
    velocityZ = 0;
    playerGrounded = true;
  }

  // Desired horizontal velocity in units per second
  let wishX = 0;
  let wishZ = 0;
  if (!pendingSpawn && moveState.forward) {
    wishX += _direction.x * speed;
    wishZ += _direction.z * speed;
  }
  if (!pendingSpawn && moveState.back) {
    wishX -= _direction.x * backSpeed;
    wishZ -= _direction.z * backSpeed;
  }
  if (!pendingSpawn && moveState.right) {
    wishX += _right.x * speed;
    wishZ += _right.z * speed;
  }
  if (!pendingSpawn && moveState.left) {
    wishX -= _right.x * speed;
    wishZ -= _right.z * speed;
  }

  // Jump-Buffer: Sprung zu Beginn des Frames anwenden (reagiert sofort, kein 1-Frame-Lag)
  if (jumpRequested && playerGrounded) {
    velocityY = jumpForce;
    jumpRequested = false;
  }

  const onGround = playerGrounded;

  if (onGround) {
    velocityX = wishX;
    velocityZ = wishZ;
    if (wishX === 0 && wishZ === 0) {
      velocityX *= Math.pow(groundFriction, dt);
      velocityZ *= Math.pow(groundFriction, dt);
    }
  } else {
    velocityX += wishX * airControl * dt;
    velocityZ += wishZ * airControl * dt;
    const len = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
    if (len > maxSpeed) {
      const s = maxSpeed / len;
      velocityX *= s;
      velocityZ *= s;
    }
  }

  // Apply gravity only when not grounded to avoid Y sink→push every frame (micro-jitter on ground)
  if (!playerGrounded) {
    velocityY += gravity * dt;
    if (velocityY < terminalVelocity) velocityY = terminalVelocity;
  }

  const vel = { x: velocityX, y: velocityY, z: velocityZ };
  const prevPos = DEBUG_COLLISION
    ? { x: player.position.x, y: player.position.y, z: player.position.z }
    : null;
  const collisionDebug: CollisionDebug | undefined = DEBUG_COLLISION
    ? { snaps: [] }
    : undefined;
  const collisionResult = resolveVoxelCollisions(
    player.position,
    vel,
    dt,
    PLAYER_HALF,
    PLAYER_HALF,
    PLAYER_HEIGHT,
    collisionDebug
  );
  velocityX = vel.x;
  velocityY = vel.y;
  velocityZ = vel.z;
  playerGrounded = collisionResult.grounded;

  if (DEBUG_COLLISION && prevPos && collisionDebug) {
    const dx = player.position.x - prevPos.x;
    const dy = player.position.y - prevPos.y;
    const dz = player.position.z - prevPos.z;
    const largeDelta =
      Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02 || Math.abs(dz) > 0.02;
    if (
      debugCollisionLogCooldown <= 0 &&
      (collisionDebug.snaps.length > 0 || largeDelta)
    ) {
      console.log("[collision]", {
        delta: { x: dx.toFixed(4), y: dy.toFixed(4), z: dz.toFixed(4) },
        vel: { x: vel.x.toFixed(3), y: vel.y.toFixed(3), z: vel.z.toFixed(3) },
        grounded: collisionResult.grounded,
        snaps: collisionDebug.snaps.map(
          (s: {
            axis: "x" | "z" | "y";
            reason: string;
            from: number;
            to: number;
          }) => `${s.axis}:${s.reason} ${s.from.toFixed(3)}→${s.to.toFixed(3)}`
        ),
      });
      debugCollisionLogCooldown = 20;
    }
    if (debugCollisionLogCooldown > 0) debugCollisionLogCooldown--;
  }

  updateAI(
    { x: player.position.x, y: player.position.y, z: player.position.z },
    dt
  );
  updateMovement(dt, (pos, v, d, hx, hz, height) => {
    resolveVoxelCollisions(pos, v, d, hx, hz, height);
  });
  updateAnimation(time);
}

function updateCameraAndViewMode(time: number, dt: number): void {
  controls.getDirection(_lookDir);

  // Blickrichtung: Yaw (horizontal) und Pitch (vertikal), Pitch begrenzt
  const lookYaw = Math.atan2(_lookDir.x, -_lookDir.z);
  const lookPitchRaw = -Math.asin(THREE.MathUtils.clamp(_lookDir.y, -1, 1));
  const lookPitch = THREE.MathUtils.clamp(
    lookPitchRaw,
    -HEAD_PITCH_MAX,
    HEAD_PITCH_MAX
  );
  lastLookYaw = lookYaw;
  lastLookPitch = lookPitch;

  if (viewMode === "first") {
    head.visible = false;
    body.visible = false;
    leg1.visible = false;
    leg2.visible = false;
    arm1.visible = false;
    arm2.visible = false;

    povHands.visible = true;

    // POV-Schattenkörper: Position = Spieler, Kopf-Rotation = Blickrichtung, nur als Schatten sichtbar
    povShadowBody.visible = true;
    povShadowBody.position.copy(player.position);
    (povShadowBody.children[0] as THREE.Mesh).rotation.copy(head.rotation);

    // First-Person: Kopf = Blickrichtung (kein Körper-Rotation)
    head.rotation.y = lookYaw;
    head.rotation.x = lookPitch;

    // POV-Hände: Lauf-Wackeln oder Mining-Schwung (Halten auf Block)
    const isMining = breakTarget !== null;
    const povArm = povHands.children[0] as THREE.Mesh;
    if (isMining) {
      miningSwingPhase += dt;
      // Arm schwingt vor und zurück wie beim Abbauen
      const swing = Math.sin(miningSwingPhase * 14) * 0.52;
      povArm.rotation.x = POV_ARM_BASE_ROTATION_X + swing;
      povArm.rotation.y = POV_ARM_BASE_ROTATION_Y;
      povArm.rotation.z = POV_ARM_BASE_ROTATION_Z;
      // Leichtes Zurückziehen der Hand beim Schwingen
      const pullZ = 0.02 + Math.max(0, Math.sin(miningSwingPhase * 14)) * 0.04;
      povHands.position.set(0, 0, pullZ);
      povHands.rotation.z = 0;
    } else {
      miningSwingPhase = 0;
      povArm.rotation.x = POV_ARM_BASE_ROTATION_X;
      povArm.rotation.y = POV_ARM_BASE_ROTATION_Y;
      povArm.rotation.z = POV_ARM_BASE_ROTATION_Z;
      const isMoving =
        moveState.forward ||
        moveState.back ||
        moveState.left ||
        moveState.right;
      const wiggleSpeed = 14;
      const wiggleAmount = 0.028;
      const targetX = 0;
      const targetY = isMoving
        ? Math.sin(time * wiggleSpeed * 0.5) * -0.008
        : 0;
      const targetZ = isMoving
        ? Math.sin(time * wiggleSpeed) * wiggleAmount
        : 0;
      povHandAnimX += (targetX - povHandAnimX) * POV_HAND_LERP;
      povHandAnimY += (targetY - povHandAnimY) * POV_HAND_LERP;
      povHandAnimZ += (targetZ - povHandAnimZ) * POV_HAND_LERP;
      povHands.position.set(povHandAnimX, povHandAnimY, povHandAnimZ);
      povHands.rotation.z = 0;
    }

    // Camera head bobbing (Minecraft-like): based on actual horizontal speed and grounded state.
    const horizSpeed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
    const denom = sneakKeyHeld
      ? horizontalMaxSpeedSneak
      : isSprinting
      ? horizontalMaxSpeedSprint
      : horizontalMaxSpeed;
    const speedFactor =
      denom > 1e-6 ? THREE.MathUtils.clamp(horizSpeed / denom, 0, 1) : 0;
    const airFactor = playerGrounded ? 1 : 0.12;
    const targetStrength = speedFactor > 0.02 ? speedFactor * airFactor : 0;
    const strengthLerp = 1 - Math.exp(-14 * dt);
    cameraBobStrength += (targetStrength - cameraBobStrength) * strengthLerp;

    const sprintMul = isSprinting ? 1.15 : 1;
    const sneakMul = sneakKeyHeld ? 0.85 : 1;
    const bobSpeed = (4 + 7 * cameraBobStrength) * sprintMul * sneakMul;
    cameraBobPhase += dt * bobSpeed;

    const ampY = 0.095 * sprintMul;
    const ampX = 0.155 * sprintMul;
    const targetBobY = Math.sin(cameraBobPhase * 2) * ampY * cameraBobStrength;
    const targetBobX = Math.cos(cameraBobPhase) * ampX * cameraBobStrength;
    const bobLerp = 1 - Math.exp(-18 * dt);
    cameraBobX += (targetBobX - cameraBobX) * bobLerp;
    cameraBobY += (targetBobY - cameraBobY) * bobLerp;

    _cameraOffset.set(cameraBobX, eyeHeight + cameraBobY, 0);
    camera.position.copy(player.position).add(_cameraOffset);
  } else {
    head.visible = true;
    body.visible = true;
    leg1.visible = true;
    leg2.visible = true;
    arm1.visible = true;
    arm2.visible = true;

    povHands.visible = false;

    povShadowBody.visible = false;

    // Third-Person: Körper in Bewegungsrichtung, Kopf relativ zum Körper
    const isMovingThird =
      moveState.forward || moveState.back || moveState.left || moveState.right;
    const velLenSq = velocityX * velocityX + velocityZ * velocityZ;
    if (isMovingThird && velLenSq > 1e-6) {
      bodyYaw = Math.atan2(velocityX, velocityZ);
    } else {
      bodyYaw = lookYaw; // stehen: Körper folgt Blick
    }
    player.rotation.y = bodyYaw;
    const headYawRel = lookYaw - bodyYaw;
    head.rotation.y =
      THREE.MathUtils.euclideanModulo(headYawRel + Math.PI, Math.PI * 2) -
      Math.PI;
    head.rotation.x = lookPitch;

    // Arm-/Bein-Schwung beim Laufen (gegenphasig wie Gehen)
    const isMoving =
      moveState.forward || moveState.back || moveState.left || moveState.right;
    const armSwingAmount = 0.35;
    const armSwingSpeed = 14;
    const legSwingAmount = 0.5;
    const legSwingSpeed = 14;
    if (isMoving) {
      arm1.rotation.z = Math.sin(time * armSwingSpeed) * armSwingAmount;
      arm2.rotation.z = -Math.sin(time * armSwingSpeed) * armSwingAmount;
      leg1.rotation.x = Math.sin(time * legSwingSpeed) * legSwingAmount;
      leg2.rotation.x = -Math.sin(time * legSwingSpeed) * legSwingAmount;
    } else {
      arm1.rotation.z *= 0.85;
      arm2.rotation.z *= 0.85;
      leg1.rotation.x *= 0.8;
      leg2.rotation.x *= 0.8;
    }

    _lookDir.y = 0;
    _lookDir.normalize();
    _cameraOffset.set(0, cameraHeight, 0);
    camera.position
      .copy(player.position)
      .add(_cameraOffset)
      .addScaledVector(_lookDir, -cameraDistance);
    // Kamera immer auf Spieler-Mitte richten → Char bleibt beim Umschauen im Zentrum (Fadenkreuz)
    _thirdPersonLookTarget.set(
      player.position.x,
      player.position.y + PLAYER_HEIGHT * 0.5,
      player.position.z
    );
    camera.lookAt(_thirdPersonLookTarget);
  }
}

function updateDropsAndPickup(time: number): void {
  updateDropsAndPickupSystem({
    scene,
    drops,
    playerX: player.position.x,
    playerY: player.position.y + PLAYER_HEIGHT * 0.5,
    playerZ: player.position.z,
    time,
    config: {
      pickupRadius: PICKUP_RADIUS,
      bobSpeed: DROP_BOB_SPEED,
      bobHeight: DROP_BOB_HEIGHT,
    },
  });
}

function updateBlockBreakAndPlace(dt: number): void {
  // Platzieren (Rechtsklick oder F): Fackel oder Block (F works without pointer lock)
  const placeRequested =
    (rightMouseJustPressed &&
      document.pointerLockElement === renderer.domElement) ||
    fKeyJustPressed;
  if (placeRequested && camera) {
    rightMouseJustPressed = false;
    fKeyJustPressed = false;
    rayOrigin.copy(camera.position);
    camera.getWorldDirection(rayDirection);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = PLACE_DISTANCE;
    const blockMeshesPlace = getRaycastMeshes();
    const placeHits = raycaster.intersectObjects(blockMeshesPlace);
    const placeHit = placeHits[0];
    if (
      placeHit &&
      placeHit.face
    ) {
      _direction
        .copy(placeHit.face.normal)
        .transformDirection(placeHit.object.matrixWorld);
      const placeX = placeHit.point.x + _direction.x * 0.5;
      const placeY = placeHit.point.y + _direction.y * 0.5;
      const placeZ = placeHit.point.z + _direction.z * 0.5;
      const distSq =
        (placeX - camera.position.x) ** 2 +
        (placeY - camera.position.y) ** 2 +
        (placeZ - camera.position.z) ** 2;
      if (distSq <= PLACE_DISTANCE * PLACE_DISTANCE) {
        const sel = getSelectedBlockType();
        const count = getSelectedSlotCount();
        if (sel === "torch" && count > 0) {
          const torchInPlayer =
            placeX >= player.position.x - PLAYER_HALF &&
            placeX <= player.position.x + PLAYER_HALF &&
            placeY >= player.position.y &&
            placeY <= player.position.y + PLAYER_HEIGHT &&
            placeZ >= player.position.z - PLAYER_HALF &&
            placeZ <= player.position.z + PLAYER_HALF;
          if (!torchInPlayer && placeTorch(placeX, placeY, placeZ)) {
            consumeOneFromSelectedSlot();
          }
        } else if (sel !== "torch" && count > 0 && isBlockTypeSolid(sel)) {
          const adjX = Math.floor(placeHit.point.x + _direction.x * 0.01);
          const adjY = Math.floor(placeHit.point.y + _direction.y * 0.01);
          const adjZ = Math.floor(placeHit.point.z + _direction.z * 0.01);
          const px = player.position.x;
          const py = player.position.y;
          const pz = player.position.z;
          const blockOverlapsPlayer =
            Math.min(adjX + 0.5, px + PLAYER_HALF) >
              Math.max(adjX - 0.5, px - PLAYER_HALF) &&
            Math.min(adjY + 0.5, py + PLAYER_HEIGHT) >
              Math.max(adjY - 0.5, py) &&
            Math.min(adjZ + 0.5, pz + PLAYER_HALF) >
              Math.max(adjZ - 0.5, pz - PLAYER_HALF);
          const at = getBlockAt(adjX, adjY, adjZ);
          const keyStr = blockKeyString(adjX, adjY, adjZ);
          if (
            !blockOverlapsPlayer &&
            (at === null || at === "air") &&
            !blockModifications.has(keyStr)
          ) {
            blockModifications.set(keyStr, sel);
            invalidateColumnHeight(adjX, adjZ);
            const ckx = Math.floor(adjX / CHUNK_SIZE);
            const ckz = Math.floor(adjZ / CHUNK_SIZE);
            chunks.delete(chunkKeyNumeric(ckx, ckz));
            raycastMeshCache.markDirty();
            _frustumDirty = true;
            consumeOneFromSelectedSlot();
          }
        }
      }
    }
  }

  // Block-Abbau: Halten auf Block (Raycast von Kamera-Mitte, nur bei Pointer Lock)
  if (
    document.pointerLockElement === renderer.domElement &&
    isMouseDown &&
    camera
  ) {
    rayOrigin.copy(camera.position);
    camera.getWorldDirection(rayDirection);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = BREAK_DISTANCE;

    const blockMeshes = getRaycastMeshes();
    const hits = raycaster.intersectObjects(blockMeshes);
    const hit = hits[0];
    if (
      hit &&
      hit.face
    ) {
      _direction.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);

      // Instanced path: resolve exact instance block position.
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        const ud = hit.object.userData as {
          chunkKeyNum: number;
          blockType: BlockType;
        };
        const chunkKeyNum = ud.chunkKeyNum;
        const blockType = ud.blockType;
        const instanceId = hit.instanceId;
        const pos = getBlockWorldPosition(chunkKeyNum, blockType, instanceId);
        if (!pos) {
          breakTarget = null;
          breakProgress = 0;
          const crackEl = document.getElementById("block-crack");
          if (crackEl) crackEl.style.visibility = "hidden";
        } else if (
          breakTarget &&
          breakTarget.chunkKeyNum === chunkKeyNum &&
          breakTarget.blockType === blockType &&
          breakTarget.x === pos.x &&
          breakTarget.y === pos.y &&
          breakTarget.z === pos.z
        ) {
          breakProgress += dt;
          if (breakProgress >= BREAK_TIME) {
            breakBlock(chunkKeyNum, blockType, pos.x, pos.y, pos.z);
            breakTarget = null;
            breakProgress = 0;
            const crackEl = document.getElementById("block-crack");
            if (crackEl) crackEl.style.visibility = "hidden";
          }
        } else {
          if (!isUnbreakableBlock(blockType)) {
            breakTarget = {
              chunkKeyNum,
              blockType,
              x: pos.x,
              y: pos.y,
              z: pos.z,
            };
            breakProgress = dt;
          } else {
            breakTarget = null;
            breakProgress = 0;
          }
        }
      } else {
        // Mesh path (worker geometry): derive the hit block coordinate from point and face normal.
        const bx = Math.floor(hit.point.x - _direction.x * 0.01);
        const by = Math.floor(hit.point.y - _direction.y * 0.01);
        const bz = Math.floor(hit.point.z - _direction.z * 0.01);
        const at = getBlockAt(bx, by, bz);
        if (at === null || at === "air") {
          breakTarget = null;
          breakProgress = 0;
        } else if (isUnbreakableBlock(at)) {
          breakTarget = null;
          breakProgress = 0;
        } else {
          const chunkKeyNum = chunkKeyNumeric(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE));
          if (
            breakTarget &&
            breakTarget.chunkKeyNum === chunkKeyNum &&
            breakTarget.blockType === at &&
            breakTarget.x === bx &&
            breakTarget.y === by &&
            breakTarget.z === bz
          ) {
            breakProgress += dt;
            if (breakProgress >= BREAK_TIME) {
              breakBlock(chunkKeyNum, at, bx, by, bz);
              breakTarget = null;
              breakProgress = 0;
            }
          } else {
            breakTarget = {
              chunkKeyNum,
              blockType: at,
              x: bx,
              y: by,
              z: bz,
            };
            breakProgress = dt;
          }
        }
      }
    } else {
      breakTarget = null;
      breakProgress = 0;
    }
  } else if (!isMouseDown) {
    breakTarget = null;
    breakProgress = 0;
  }

  // Block-Riss-Overlay (Minecraft-Style): 10 Stufen, je mehr Fortschritt desto stärker die Risse
  const crackEl = document.getElementById("block-crack");
  if (crackEl) {
    const visible = breakTarget !== null;
    crackEl.style.visibility = visible ? "visible" : "hidden";
    if (visible) {
      const progress = Math.min(1, breakProgress / BREAK_TIME);
      const stage = Math.min(9, Math.floor(progress * 10));
      crackEl.style.backgroundPosition = `0 ${-stage * 10}%`;
      crackEl.setAttribute("data-stage", String(stage));
    }
  }
}

function updateShadowAndRender(dt: number): void {
  updateShadowCameraForPlayer(
    sunLight,
    player.position,
    getSunDirection(),
    SUN_DISTANCE
  );

  if (!camera.matrixWorld.equals(_lastCameraMatrixWorld)) {
    _lastCameraMatrixWorld.copy(camera.matrixWorld);
    _frustumDirty = true;
  }
  if (_frustumDirty) {
    _frustumDirty = false;
    updateChunkFrustumVisibility({
      camera,
      chunks,
      frustum: _frustum,
      projScreenMatrix: _projScreenMatrix,
      chunkBox: _chunkBox,
      chunkBoxMin: _chunkBoxMin,
      chunkBoxMax: _chunkBoxMax,
    });
  }

  if (multiplayerEnabled) updateMultiplayer(dt);
  renderer.render(scene, camera);
}

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = performance.now() * 0.001;
  updateFPSAndSpawn(time);
  updateDayCycleAndAtmosphere(dt);
  updateChunkVisibility();
  updateMovementAndCollision(dt, time);
  updateCameraAndViewMode(time, dt);
  updateDropsAndPickup(time);
  updateBlockBreakAndPlace(dt);
  updateShadowAndRender(dt);
}

// ================= RESIZE =================

window.addEventListener("resize", () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ================= GRAFIK-OPTIONEN (zur Laufzeit) =================

/** Wird vom Optionen-Menü aufgerufen, wenn Grafik-Einstellungen geändert wurden. */
export function applyGraphicsSettings(): void {
  if (!renderer || !sunLight) return;
  renderer.shadowMap.enabled = getShadowsEnabled();
  const size = getShadowMapSize();
  if (
    sunLight.shadow.mapSize.width !== size ||
    sunLight.shadow.mapSize.height !== size
  ) {
    sunLight.shadow.mapSize.width = size;
    sunLight.shadow.mapSize.height = size;
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      (sunLight.shadow as { map: THREE.RenderTarget | null }).map = null;
    }
  }
  sunLight.shadow.camera.left = -SHADOW_RADIUS;
  sunLight.shadow.camera.right = SHADOW_RADIUS;
  sunLight.shadow.camera.top = SHADOW_RADIUS;
  sunLight.shadow.camera.bottom = -SHADOW_RADIUS;
  sunLight.shadow.camera.updateProjectionMatrix();

  applyTorchShadowSettingsToPlacedTorches(placedTorches);
}
