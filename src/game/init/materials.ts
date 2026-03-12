import * as THREE from '@/three'
import { getAllBlockIds, getBlockDefinition, getBlockTextureNames } from '../../block-registry'
import {
  blockMaterialCache,
  createPBRMaterial,
  loadFoliageColormapImageData,
  loadGrassColormapImageData,
  loadItemTextureSafe,
  loadTextureOptional,
  sampleGrassColormap,
  setPixelFilter,
} from '../../block-materials'
import { patchMaterialWithTerrainFog } from '../../terrain-fog'
import { patchMaterialWithTerrainLight } from '../../terrain-light'

export type MaterialsInitResult = {
  grassColormapData: ImageData | null
  foliageColormapData: ImageData | null
  tallGrassMaterial: THREE.MeshStandardMaterial | null
}

export async function initMaterialsAndColormaps(): Promise<MaterialsInitResult> {
  const DEBUG_GRASS_TINT =
    typeof window !== 'undefined' &&
    (window.location.search.includes('debug_grass=1') ||
      (window as unknown as { __DEBUG_GRASS_TINT?: boolean }).__DEBUG_GRASS_TINT)

  let _debugGrassMaterialLogged = false
  const grassColormapData = await loadGrassColormapImageData()
  const foliageColormapData = await loadFoliageColormapImageData()

  if (DEBUG_GRASS_TINT) {
    if (!grassColormapData) {
      console.warn(
        '[grass tint] Grass colormap failed to load – using fallback solid green. Check colormap/grass.png.',
      )
    } else {
      const c = sampleGrassColormap(grassColormapData, 0.5, 0.5)
      console.log('[grass tint] Colormap loaded, sample (0.5,0.5):', '#' + c.getHexString())
    }
  }

  let waterMaterial: THREE.MeshStandardMaterial | null = null
  await Promise.all(
    getAllBlockIds().map(async (blockId) => {
      const def = getBlockDefinition(blockId)!
      if (def.fluid === 'water') {
        if (!waterMaterial) {
          waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x3366aa,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetUnits: 1,
            polygonOffsetFactor: 1,
          })
          patchMaterialWithTerrainFog(waterMaterial)
          patchMaterialWithTerrainLight(waterMaterial)
        }
        blockMaterialCache.set(blockId, waterMaterial)
        return
      }
      const names = getBlockTextureNames(blockId)
      const skipNormalMapForTerrain = def.skipNormalMap === true
      const skipSpecularMapForGrass = def.skipSpecularMap === true

      const grassMaterialOpts: { color?: number; vertexColors?: boolean } = {}
      if (DEBUG_GRASS_TINT && def.skipSpecularMap === true) {
        console.log('[grass tint] material opts', {
          blockId,
          grassMaterialOpts,
          skipNormalMapForTerrain,
          textureNames: names,
        })
      }

      const leafMaterialOpts: { color?: number; vertexColors?: boolean } = {}
      if (names.length === 1) {
        let mat: THREE.MeshStandardMaterial
        if (def.itemTexture) {
          const tex = await loadItemTextureSafe(def.itemTexture)
          mat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 1,
            metalness: 0,
            transparent: def.transparent === true,
            alphaTest: def.transparent ? 0.1 : undefined,
            ...grassMaterialOpts,
            ...leafMaterialOpts,
          })
        } else {
          mat = await createPBRMaterial(names[0], {
            transparent: def.transparent === true,
            alphaTest: def.transparent ? 0.1 : undefined,
            enableNormalMap: !skipNormalMapForTerrain,
            enableSpecularMap: !skipSpecularMapForGrass,
            ...grassMaterialOpts,
            ...leafMaterialOpts,
          })
        }
        if (def.crossGeometry === true) mat.side = THREE.DoubleSide
        patchMaterialWithTerrainFog(mat)
        patchMaterialWithTerrainLight(mat)
        blockMaterialCache.set(blockId, mat)
        if (DEBUG_GRASS_TINT && def.skipSpecularMap === true && !_debugGrassMaterialLogged) {
          console.log('[grass tint] single material maps', {
            blockId,
            vertexColors: mat.vertexColors,
            hasNormalMap: !!mat.normalMap,
            hasRoughnessMap: !!mat.roughnessMap,
            color: '#' + mat.color.getHexString(),
          })
          _debugGrassMaterialLogged = true
        }
      } else {
        const mats = (await Promise.all(
          names.map((name) =>
            createPBRMaterial(name, {
              transparent: def.transparent === true,
              alphaTest: def.transparent ? 0.1 : undefined,
              enableNormalMap: !skipNormalMapForTerrain,
              enableSpecularMap: !skipSpecularMapForGrass,
              ...grassMaterialOpts,
              ...leafMaterialOpts,
            }),
          ),
        )) as THREE.MeshStandardMaterial[]
        patchMaterialWithTerrainFog(mats)
        patchMaterialWithTerrainLight(mats)
        blockMaterialCache.set(blockId, mats)
        if (DEBUG_GRASS_TINT && def.skipSpecularMap === true && !_debugGrassMaterialLogged) {
          console.log(
            '[grass tint] six-face material maps',
            mats.map((m, i) => ({
              face: i,
              vertexColors: m.vertexColors,
              hasNormalMap: !!m.normalMap,
              hasRoughnessMap: !!m.roughnessMap,
              color: '#' + m.color.getHexString(),
            })),
          )
          _debugGrassMaterialLogged = true
        }
      }
    }),
  )

  let tallGrassMaterial: THREE.MeshStandardMaterial | null = null
  const tallGrassTex = await loadTextureOptional('tall_grass')
  if (tallGrassTex) {
    setPixelFilter(tallGrassTex)
    tallGrassMaterial = new THREE.MeshStandardMaterial({
      map: tallGrassTex,
      roughness: 1,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      color: 0xffffff,
      vertexColors: true,
    })
    patchMaterialWithTerrainFog(tallGrassMaterial)
    patchMaterialWithTerrainLight(tallGrassMaterial)
  }

  return { grassColormapData, foliageColormapData, tallGrassMaterial }
}
