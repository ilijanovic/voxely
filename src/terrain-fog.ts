import * as THREE from 'three'

/** Softer than quadratic (2): same distance gets less fog so terrain and trees fade more evenly. */
const FOG_CURVE_EXPONENT = 1.4

export const terrainFogState = {
  color: new THREE.Color(0x87ceeb),
  start: 80,
  end: 280,
}

/** Fragment shader snippet: our terrain fog uniforms (to inject if standard include replace misses). */
const TERRAIN_FOG_UNIFORMS_SNIPPET = `
uniform vec3 uTerrainFogColor;
uniform float uTerrainFogStart;
uniform float uTerrainFogEnd;
`

/** Fragment shader snippet: our terrain fog application (replaces default fog or appends as fallback). */
const TERRAIN_FOG_APPLY_SNIPPET = `
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

    let frag = shader.fragmentShader
    frag = frag.replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>${TERRAIN_FOG_UNIFORMS_SNIPPET}`,
    )
    frag = frag.replace('#include <fog_fragment>', TERRAIN_FOG_APPLY_SNIPPET)

    // If the standard fog includes were missing (e.g. different shader path), inject uniforms so
    // at least our uniform refs exist; fog application still requires the fog_fragment replace.
    if (!frag.includes('uTerrainFogColor')) {
      frag = `uniform vec3 uTerrainFogColor;\nuniform float uTerrainFogStart;\nuniform float uTerrainFogEnd;\n${frag}`
    }
    shader.fragmentShader = frag
  }
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
