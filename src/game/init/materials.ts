import * as THREE from 'three'
import {
  getAllBlockIds,
  getBlockAllTextureNames,
  getBlockBaseSixTextureNames,
  getBlockDefinition,
  getBlockFaceTextureVariants,
} from '../../block-registry'
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
import { setGrassTopVariantMaterialKeys } from '../chunks/grass-material-variants'

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

  if (DEBUG_GRASS_TINT) {
    const grassDef = getBlockDefinition('grass')
    console.log('[materials init] debug version: faces-textures-v1')
    console.log('[materials init] grass BlockDefinition snapshot:', {
      id: grassDef?.id,
      textures: grassDef?.textures,
      skipSpecularMap: grassDef?.skipSpecularMap,
      skipNormalMap: grassDef?.skipNormalMap,
    })
  }

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
        }
        blockMaterialCache.set(blockId, waterMaterial)
        return
      }
      const skipNormalMapForTerrain = def.skipNormalMap === true
      const skipSpecularMapForGrass = def.skipSpecularMap === true

      const grassMaterialOpts: { color?: number; vertexColors?: boolean } = skipSpecularMapForGrass
        ? { color: 0xffffff, vertexColors: true }
        : {}
      if (DEBUG_GRASS_TINT && def.skipSpecularMap === true) {
        console.log('[grass tint] material opts', {
          blockId,
          grassMaterialOpts,
          skipNormalMapForTerrain,
          textureNames: getBlockAllTextureNames(blockId),
        })
      }

      const leafMaterialOpts: { color?: number; vertexColors?: boolean } = {}
      const baseTextureNames =
        def.itemTexture ? [def.itemTexture] : def.textures.type === 'single' ? [def.textures.texture] : null
      const baseSix = def.textures.type === 'single' || def.itemTexture ? null : getBlockBaseSixTextureNames(blockId)

      if (baseTextureNames) {
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
          mat = await createPBRMaterial(baseTextureNames[0], {
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
        const names = baseSix ?? []
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

  // Build grass-top variant materials (as defined on grass.top).
  // We create separate cache keys so chunk rendering can split grass blocks into multiple instanced meshes.
  const grassFaceVariants = getBlockFaceTextureVariants('grass')
  const declaredGrassTopVariants = grassFaceVariants?.top ?? []
  const grassTopVariantTextureNames: string[] = []
  for (const name of declaredGrassTopVariants) {
    // Only include variants that exist in the selected pack (or fallback pack).
    // loadTextureOptional returns null when it cannot resolve the texture.
    // We don't keep the texture instance; createPBRMaterial will load it again, but it will be cached by the browser.
    // eslint-disable-next-line no-await-in-loop
    const maybe = await loadTextureOptional(name)
    if (!maybe) continue
    maybe.dispose()
    grassTopVariantTextureNames.push(name)
  }

  const baseGrass = blockMaterialCache.get('grass')
  if (Array.isArray(baseGrass) && grassTopVariantTextureNames.length > 1) {
    const keys: string[] = []
    for (const topName of grassTopVariantTextureNames) {
      const key = `grass@top:${topName}`
      keys.push(key)
      // eslint-disable-next-line no-await-in-loop
      const topMat = await createPBRMaterial(topName, { enableNormalMap: false, enableSpecularMap: false })
      patchMaterialWithTerrainFog(topMat)
      const mats = [
        baseGrass[0],
        baseGrass[1],
        topMat,
        baseGrass[3],
        baseGrass[4],
        baseGrass[5],
      ] as THREE.MeshStandardMaterial[]
      patchMaterialWithTerrainFog(mats)
      blockMaterialCache.set(key, mats)
    }
    setGrassTopVariantMaterialKeys(keys)
  } else {
    setGrassTopVariantMaterialKeys([])
  }

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
  }

  return { grassColormapData, foliageColormapData, tallGrassMaterial }
}
