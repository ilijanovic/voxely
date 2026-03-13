import * as THREE from 'three'
import { noise2D } from './game/noise-improved'

/** Softer than quadratic (2): same distance gets less fog so terrain and trees fade more evenly. */
const FOG_CURVE_EXPONENT = 1.4

/** When true, fog density is slightly modulated by ImprovedNoise (Perlin) based on camera position. */
const USE_FOG_DENSITY_NOISE = true

/** World-space scale for fog noise sampling; smaller = larger patches. */
const FOG_NOISE_SCALE = 0.02

/** Amplitude of fog modulation: noise in [0, 1] scales fog factor by (1 - AMPLITUDE) to (1 + AMPLITUDE). */
const FOG_NOISE_AMPLITUDE = 0.1

/** Single uniform ref so all patched materials share the same value; updated each frame when USE_FOG_DENSITY_NOISE. */
const fogNoiseUniformRef = { value: 0.5 }

export const terrainFogState = {
  color: new THREE.Color(0x87ceeb),
  start: 80,
  end: 280,
  /** Ref used by patched materials for fog noise modulation; update from game loop via updateTerrainFogNoise(). */
  get fogNoiseModulationRef() {
    return fogNoiseUniformRef
  },
}

/** Fragment shader snippet: our terrain fog uniforms (to inject if standard include replace misses). */
const TERRAIN_FOG_UNIFORMS_SNIPPET =
  USE_FOG_DENSITY_NOISE
    ? `
uniform vec3 uTerrainFogColor;
uniform float uTerrainFogStart;
uniform float uTerrainFogEnd;
uniform float uFogNoiseModulation;
`
    : `
uniform vec3 uTerrainFogColor;
uniform float uTerrainFogStart;
uniform float uTerrainFogEnd;
`

/** Fragment shader snippet: our terrain fog application (replaces default fog or appends as fallback). */
const TERRAIN_FOG_APPLY_SNIPPET =
  USE_FOG_DENSITY_NOISE
    ? `
  #ifdef USE_FOG
  float terrainFogFactor = smoothstep(uTerrainFogStart, uTerrainFogEnd, vFogDepth);
  terrainFogFactor = pow(terrainFogFactor, ${FOG_CURVE_EXPONENT});
  float noiseMod = ${1 - FOG_NOISE_AMPLITUDE} + uFogNoiseModulation * ${2 * FOG_NOISE_AMPLITUDE};
  terrainFogFactor = clamp(terrainFogFactor * noiseMod, 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTerrainFogColor, terrainFogFactor);
  #endif
`
    : `
  #ifdef USE_FOG
  float terrainFogFactor = smoothstep(uTerrainFogStart, uTerrainFogEnd, vFogDepth);
  terrainFogFactor = pow(terrainFogFactor, ${FOG_CURVE_EXPONENT});
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTerrainFogColor, terrainFogFactor);
  #endif
`

function patchOneMaterial(mat: THREE.Material): void {
  const m = mat as THREE.Material & { __terrainFogPatched?: boolean }
  if (m.__terrainFogPatched) return
  m.__terrainFogPatched = true

  // Ensure Three.js includes fog code-path (enables USE_FOG and vFogDepth).
  ;(m as THREE.Material & { fog?: boolean }).fog = true

  const prev = (m as THREE.ShaderMaterial & { onBeforeCompile?: THREE.Material['onBeforeCompile'] })
    .onBeforeCompile

  m.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer)
    shader.uniforms.uTerrainFogColor = { value: terrainFogState.color }
    shader.uniforms.uTerrainFogStart = { value: terrainFogState.start }
    shader.uniforms.uTerrainFogEnd = { value: terrainFogState.end }
    if (USE_FOG_DENSITY_NOISE) {
      shader.uniforms.uFogNoiseModulation = terrainFogState.fogNoiseModulationRef
    }

    let frag = shader.fragmentShader
    frag = frag.replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>${TERRAIN_FOG_UNIFORMS_SNIPPET}`,
    )
    frag = frag.replace('#include <fog_fragment>', TERRAIN_FOG_APPLY_SNIPPET)

    // If the standard fog includes were missing (e.g. different shader path), inject uniforms so
    // at least our uniform refs exist; fog application still requires the fog_fragment replace.
    if (!frag.includes('uTerrainFogColor')) {
      frag = `uniform vec3 uTerrainFogColor;\nuniform float uTerrainFogStart;\nuniform float uTerrainFogEnd;\n${USE_FOG_DENSITY_NOISE ? 'uniform float uFogNoiseModulation;\n' : ''}${frag}`
    }
    shader.fragmentShader = frag
  }
}

/**
 * Updates fog noise modulation from camera position (ImprovedNoise). Call each frame from the game loop when USE_FOG_DENSITY_NOISE is true.
 */
export function updateTerrainFogNoise(camera: THREE.Camera): void {
  if (!USE_FOG_DENSITY_NOISE) return
  const x = camera.position.x * FOG_NOISE_SCALE
  const z = camera.position.z * FOG_NOISE_SCALE
  const n = noise2D(x, z)
  fogNoiseUniformRef.value = n * 0.5 + 0.5
}

export function patchMaterialWithTerrainFog(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) patchOneMaterial(m)
  } else {
    patchOneMaterial(material)
  }
}

export function syncTerrainFogFromSceneFog(scene: THREE.Scene): void {
  const fog = scene.fog
  if (!fog || !('near' in fog) || !('far' in fog)) return
  terrainFogState.color.copy((fog as THREE.Fog).color)
  terrainFogState.start = (fog as THREE.Fog).near
  terrainFogState.end = (fog as THREE.Fog).far
}
