import * as THREE from "three";

export const terrainFogState = {
  color: new THREE.Color(0x87ceeb),
  start: 80,
  end: 280,
};

function patchOneMaterial(mat: THREE.Material): void {
  const m = mat as THREE.Material & { __terrainFogPatched?: boolean };
  if (m.__terrainFogPatched) return;
  m.__terrainFogPatched = true;

  // Ensure Three.js includes fog code-path.
  (m as THREE.Material & { fog?: boolean }).fog = true;

  const prev = (m as THREE.ShaderMaterial & { onBeforeCompile?: THREE.Material["onBeforeCompile"] })
    .onBeforeCompile;

  m.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.uTerrainFogColor = { value: terrainFogState.color };
    shader.uniforms.uTerrainFogStart = { value: terrainFogState.start };
    shader.uniforms.uTerrainFogEnd = { value: terrainFogState.end };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <fog_pars_fragment>",
        `#include <fog_pars_fragment>
uniform vec3 uTerrainFogColor;
uniform float uTerrainFogStart;
uniform float uTerrainFogEnd;`
      )
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
  float terrainFogFactor = smoothstep(uTerrainFogStart, uTerrainFogEnd, vFogDepth);
  terrainFogFactor *= terrainFogFactor;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uTerrainFogColor, terrainFogFactor);
#endif`
      );
  };
}

export function patchMaterialWithTerrainFog(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) patchOneMaterial(m);
  } else {
    patchOneMaterial(material);
  }
}

export function syncTerrainFogFromSceneFog(scene: THREE.Scene): void {
  const fog = scene.fog;
  if (!fog || !("near" in fog) || !("far" in fog)) return;
  terrainFogState.color.copy((fog as THREE.Fog).color);
  terrainFogState.start = (fog as THREE.Fog).near;
  terrainFogState.end = (fog as THREE.Fog).far;
}

