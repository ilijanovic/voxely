/**
 * Hurt flash: when an entity is hit, its mesh briefly tints red (Minecraft-style).
 * Uses per-entity material clones so shared materials are not changed globally.
 */
import * as THREE from '@/three'
import { getAllEntities, getEntityMesh } from './registry'
import {
  HURT_FLASH_DURATION_SECONDS,
  HURT_FLASH_RED,
} from '../constants'

/** userData keys on a mesh when it is in "hurt" state (using a cloned material). */
const UD_ORIGINAL_MATERIAL = 'hurtOriginalMaterial'
const UD_ORIGINAL_COLOR = 'hurtOriginalColor'

const _red = new THREE.Color()
const _original = new THREE.Color()

/**
 * Updates hurt-flash state for all entities: applies or fades red tint and restores materials when done.
 * Call once per frame after updateAnimation.
 * @param time - Current game time in seconds.
 */
export function updateHurtFlash(time: number): void {
  _red.setHex(HURT_FLASH_RED)

  for (const e of getAllEntities()) {
    if (e.hurtUntilTime == null) continue

    const group = getEntityMesh(e.id)
    if (!group) {
      e.hurtUntilTime = undefined
      continue
    }

    const remaining = e.hurtUntilTime - time
    const intensity = remaining / HURT_FLASH_DURATION_SECONDS

    if (intensity > 0) {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const mesh = obj as THREE.Mesh
        const mat = mesh.material
        const single = mat && !Array.isArray(mat) ? (mat as THREE.MeshStandardMaterial) : null
        if (!single || typeof single.color === 'undefined') return

        const ud = mesh.userData as Record<string, unknown>

        if (ud[UD_ORIGINAL_MATERIAL] != null) {
          _original.setHex(ud[UD_ORIGINAL_COLOR] as number)
          single.color.lerpColors(_original, _red, intensity)
          return
        }

        const originalMaterial = single
        const originalColor = originalMaterial.color.getHex()
        const clone = originalMaterial.clone() as THREE.MeshStandardMaterial
        mesh.material = clone
        clone.color.setHex(HURT_FLASH_RED)
        ud[UD_ORIGINAL_MATERIAL] = originalMaterial
        ud[UD_ORIGINAL_COLOR] = originalColor
      })
    } else {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const mesh = obj as THREE.Mesh
        const ud = mesh.userData as Record<string, unknown>
        const original = ud[UD_ORIGINAL_MATERIAL] as THREE.Material | undefined
        if (original == null) return

        const current = mesh.material as THREE.Material
        mesh.material = original
        if (current && current !== original) current.dispose()
        delete ud[UD_ORIGINAL_MATERIAL]
        delete ud[UD_ORIGINAL_COLOR]
      })
      e.hurtUntilTime = undefined
    }
  }
}
