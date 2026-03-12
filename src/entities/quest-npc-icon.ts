/**
 * Quest NPC icon: canvas-drawn symbol above quest giver's head (! or ? in yellow/gray).
 */
import * as THREE from '@/three'
import type { Entity } from './types'
import {
  getAvailableQuestIds,
  getActiveQuests,
  getQuestIdsReadyToTurnIn,
  getCompletedQuestIds,
} from '../quests/quest-state'
import {
  QUEST_ICON_COLOR_AVAILABLE,
  QUEST_ICON_COLOR_IN_PROGRESS,
  QUEST_ICON_COLOR_TURN_IN,
} from '../constants'

/** Vertical offset above entity AABB for the icon (world units). */
const QUEST_ICON_Y_OFFSET = 0.15

/** Canvas size in pixels for the quest symbol texture. */
const QUEST_ICON_CANVAS_SIZE = 32

/** Sprite scale in world units (size above NPC head). */
const QUEST_ICON_SPRITE_SCALE = 0.68

export type QuestNpcIconState = 'available' | 'in_progress' | 'turn_in'

/**
 * Returns the icon state for an entity that has questGiver, or null if not a quest giver.
 * Yellow ? only when a quest is ready to turn in; after turn-in with nothing else ready, returns null (default).
 */
export function getQuestNpcIconState(
  entity: { questGiver?: Entity['questGiver'] },
): QuestNpcIconState | null {
  const offered = entity.questGiver?.offeredQuestIds
  if (!offered || offered.length === 0) return null

  const prereqs = entity.questGiver?.prerequisiteQuestIds
  if (prereqs != null && prereqs.length > 0) {
    const completed = new Set(getCompletedQuestIds())
    if (!prereqs.every((id) => completed.has(id))) return null
  }

  const readyToTurnIn = new Set(getQuestIdsReadyToTurnIn())
  const available = new Set(getAvailableQuestIds())
  const activeQuestIds = new Set(getActiveQuests().map((a) => a.questId))

  const hasTurnIn = offered.some((id) => readyToTurnIn.has(id))
  if (hasTurnIn) return 'turn_in'

  const hasAvailable = offered.some((id) => available.has(id))
  if (hasAvailable) return 'available'

  const hasActive = offered.some((id) => activeQuestIds.has(id))
  if (hasActive) return 'in_progress'

  return null
}

/**
 * Draws the quest symbol (! or ?) and color onto the canvas and marks texture for update.
 */
function drawQuestIcon(
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  state: QuestNpcIconState,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio ?? 1))
  const size = QUEST_ICON_CANVAS_SIZE
  canvas.width = size * dpr
  canvas.height = size * dpr
  ctx.scale(dpr, dpr)

  const symbol = state === 'turn_in' ? '?' : '!'
  const color =
    state === 'turn_in'
      ? QUEST_ICON_COLOR_TURN_IN
      : state === 'in_progress'
        ? QUEST_ICON_COLOR_IN_PROGRESS
        : QUEST_ICON_COLOR_AVAILABLE
  ctx.fillStyle = color

  ctx.font = `bold ${size * 0.7}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(symbol, size / 2, size / 2)

  texture.needsUpdate = true
}

/**
 * Creates a sprite with canvas texture for the quest icon, positioned above the entity's head.
 * Caller must add the returned sprite to the entity's mesh group and call updateQuestNpcIcon when quest state changes.
 * Accepts entity-like shape (id not required, e.g. before addEntity).
 */
export function createQuestNpcIcon(entity: Pick<Entity, 'aabb' | 'questGiver'>): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = QUEST_ICON_CANVAS_SIZE
  canvas.height = QUEST_ICON_CANVAS_SIZE

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  })

  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(QUEST_ICON_SPRITE_SCALE)
  sprite.position.y = entity.aabb.height + QUEST_ICON_Y_OFFSET

  const state = getQuestNpcIconState(entity)
  sprite.visible = !!state
  if (state) drawQuestIcon(canvas, texture, state)

  return sprite
}

/**
 * Updates the quest icon sprite to match current quest state (redraws canvas).
 * When state is null (no quest ready to turn in, no available, no in progress), hides the sprite.
 */
export function updateQuestNpcIcon(sprite: THREE.Sprite, entity: Entity): void {
  const state = getQuestNpcIconState(entity)
  if (!state) {
    sprite.visible = false
    return
  }
  sprite.visible = true
  const mat = sprite.material as THREE.SpriteMaterial
  const texture = mat.map
  if (!texture || !(texture instanceof THREE.CanvasTexture)) return

  const canvas = texture.image as HTMLCanvasElement
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return

  drawQuestIcon(canvas, texture, state)
}

const spriteByEntityId = new Map<string, THREE.Sprite>()

/**
 * Registers a quest NPC sprite for an entity so it can be updated when quest state changes.
 */
export function registerQuestNpcSprite(entityId: string, sprite: THREE.Sprite): void {
  spriteByEntityId.set(entityId, sprite)
}

/**
 * Unregisters and disposes the quest NPC sprite for an entity (e.g. on despawn).
 */
export function unregisterAndDisposeQuestNpcSprite(entityId: string): void {
  const sprite = spriteByEntityId.get(entityId)
  if (!sprite) return
  spriteByEntityId.delete(entityId)
  const mat = sprite.material as THREE.SpriteMaterial
  if (mat.map) mat.map.dispose()
  mat.dispose()
}

/**
 * Updates all registered quest NPC icons to match current quest state.
 */
export function updateAllQuestNpcIcons(getAllEntities: () => Entity[]): void {
  for (const entity of getAllEntities()) {
    if (!entity.questGiver) continue
    const sprite = spriteByEntityId.get(entity.id)
    if (!sprite) continue
    updateQuestNpcIcon(sprite, entity)
  }
}
