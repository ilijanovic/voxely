/**
 * Light-based terrain darkening: block/sky light (0–15) is passed per instance and
 * multiplies fragment color so caves are dark and surface is bright (Minecraft-like).
 */
import * as THREE from 'three'
import { TERRAIN_LIGHT_MIN } from './constants'
import type { BlockPos } from './types'

/** Light level 0–15; returns 0–1 for shader. */
const LIGHT_LEVEL_MAX = 15

/**
 * Patches a material so that when used with an InstancedMesh that has an
 * instanceLight attribute (0–1), the fragment color is darkened by that factor.
 * Call after patchMaterialWithTerrainFog. Safe for non-instanced use (no attribute = full bright).
 */
function patchOneMaterial(mat: THREE.Material): void {
  const m = mat as THREE.Material & { __terrainLightPatched?: boolean }
  if (m.__terrainLightPatched) return
  m.__terrainLightPatched = true

  const prev = (m as THREE.Material & { onBeforeCompile?: THREE.Material['onBeforeCompile'] })
    .onBeforeCompile

  m.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer)
    shader.uniforms.uTerrainLightMin = { value: TERRAIN_LIGHT_MIN }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vTerrainLight;
#ifdef USE_INSTANCING
  attribute float instanceLight;
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vTerrainLight = instanceLight;
#else
  vTerrainLight = 1.0;
#endif`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vTerrainLight;
uniform float uTerrainLightMin;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  float terrainLight = mix(uTerrainLightMin, 1.0, vTerrainLight);
  gl_FragColor.rgb *= terrainLight;`,
      )
  }
}

/**
 * Patches materials so terrain InstancedMeshes can darken by block/sky light.
 * Call for all block materials (same scope as patchMaterialWithTerrainFog).
 */
export function patchMaterialWithTerrainLight(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) patchOneMaterial(m)
  } else {
    patchOneMaterial(material)
  }
}

/** Returns light factor 0–1 from block light level 0–15. */
function lightLevelToFactor(level: number): number {
  const clamped = Math.max(0, Math.min(LIGHT_LEVEL_MAX, Math.round(level)))
  return clamped / LIGHT_LEVEL_MAX
}

/**
 * Sets per-instance light attribute on an InstancedMesh from block positions.
 * getLightAt(bx, by, bz) should return 0–15 (block + sky combined).
 * Call after creating the mesh and setting matrices.
 * Uses at most positions.length entries; any extra instances get full brightness (1).
 */
export function setInstanceLightLevels(
  mesh: THREE.InstancedMesh,
  positions: BlockPos[],
  getLightAt: (bx: number, by: number, bz: number) => number,
): void {
  const count = mesh.count
  if (count === 0) return
  const arr = new Float32Array(count)
  const safeCount = Math.min(count, positions.length)
  for (let i = 0; i < safeCount; i++) {
    const p = positions[i]
    const bx = Math.floor(p.x)
    const by = Math.floor(p.y)
    const bz = Math.floor(p.z)
    arr[i] = lightLevelToFactor(getLightAt(bx, by, bz))
  }
  for (let i = safeCount; i < count; i++) {
    arr[i] = 1
  }
  const attr = new THREE.InstancedBufferAttribute(arr, 1)
  mesh.geometry.setAttribute('instanceLight', attr)
  attr.needsUpdate = true
}
