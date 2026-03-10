/**
 * Block textures, materials, colormaps, and shared geometries.
 * Game holds grass/foliage colormap data and passes it into setGrassInstanceColors / setFoliageInstanceColors.
 */
import * as THREE from "three";
import type { BlockType, Biome, BlockPos } from "./types";
import { BLOCK_SIZE, DEFAULT_BLOCK_TEXTURE_PATH, getBlockTexturePath } from "./constants";

const textureLoader = new THREE.TextureLoader();
const DEBUG_GRASS_TINT =
  typeof window !== "undefined" &&
  (window.location.search.includes("debug_grass=1") ||
    (window as unknown as { __DEBUG_GRASS_TINT?: boolean }).__DEBUG_GRASS_TINT);
let _debugGrassInstanceLogged = false;

let fallbackTexture: THREE.Texture | null = null;

export function setPixelFilter(tex: THREE.Texture): void {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Albedo textures should be sampled in sRGB for physically-correct lighting.
  tex.colorSpace = THREE.SRGBColorSpace;
}

function getFallbackTexture(): THREE.Texture {
  if (fallbackTexture) return fallbackTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, 1, 1);
  fallbackTexture = new THREE.CanvasTexture(canvas);
  setPixelFilter(fallbackTexture);
  return fallbackTexture;
}

function resolveTextureBase(): string {
  const path = getBlockTexturePath();
  if (typeof window === "undefined" || path.startsWith("http")) return path;
  return window.location.origin + path;
}

function resolveDefaultTextureBase(): string {
  if (typeof window === "undefined") return DEFAULT_BLOCK_TEXTURE_PATH;
  return window.location.origin + DEFAULT_BLOCK_TEXTURE_PATH;
}

function normalizeTextureName(textureName: string): string {
  const trimmed = textureName.trim().replace(/^\/+/, "");
  return trimmed.endsWith(".png") ? trimmed.slice(0, -4) : trimmed;
}

function getTextureUrls(textureName: string): { primaryUrl: string; fallbackUrl: string } {
  const normalized = normalizeTextureName(textureName);
  const base = resolveTextureBase();
  const defaultBase = resolveDefaultTextureBase();
  return {
    primaryUrl: `${base}/${normalized}.png`,
    fallbackUrl: `${defaultBase}/${normalized}.png`,
  };
}

export function loadTextureSafe(textureName: string): Promise<THREE.Texture> {
  const { primaryUrl, fallbackUrl } = getTextureUrls(textureName);
  return textureLoader
    .loadAsync(primaryUrl)
    .catch(() => textureLoader.loadAsync(fallbackUrl))
    .catch(() => getFallbackTexture());
}

export function loadTextureOptional(textureName: string): Promise<THREE.Texture | null> {
  const { primaryUrl, fallbackUrl } = getTextureUrls(textureName);
  return textureLoader
    .loadAsync(primaryUrl)
    .catch(() => textureLoader.loadAsync(fallbackUrl))
    .then((tex) => {
      setPixelFilter(tex);
      return tex;
    })
    .catch(() => null);
}

interface CreatePBRMaterialOptions {
  transparent?: boolean;
  alphaTest?: number;
  color?: number;
  vertexColors?: boolean;
  enableNormalMap?: boolean;
  enableSpecularMap?: boolean;
}

/**
 * Creates a Standard Material from base texture with optional normal (_n) and smoothness/spec (_s) maps.
 */
export async function createPBRMaterial(
  textureName: string,
  options: CreatePBRMaterialOptions = {}
): Promise<THREE.MeshStandardMaterial> {
  const normalized = normalizeTextureName(textureName);
  const map = await loadTextureSafe(normalized);
  setPixelFilter(map);

  const [normalMap, specularMap] = await Promise.all([
    options.enableNormalMap === false ? Promise.resolve(null) : loadTextureOptional(`${normalized}_n`),
    options.enableSpecularMap === false ? Promise.resolve(null) : loadTextureOptional(`${normalized}_s`),
  ]);

  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 1,
    metalness: 0,
    transparent: options.transparent === true,
    alphaTest: options.alphaTest,
    color: options.color,
    vertexColors: options.vertexColors === true,
  });

  if (normalMap) {
    normalMap.colorSpace = THREE.NoColorSpace;
    material.normalMap = normalMap;
    material.normalScale.set(1, 1);
  }

  if (specularMap) {
    specularMap.colorSpace = THREE.NoColorSpace;
    // Minecraft PBR "_s" maps are usually smoothness-like; using it as roughness map keeps compatibility.
    material.roughnessMap = specularMap;
    material.roughness = 1;
    material.metalness = 0;
  }

  return material;
}

function getGrassColormapUrl(): string {
  const base = resolveTextureBase().replace(/\/block\/?$/, "");
  return `${base}/colormap/grass.png`;
}

function getGrassColormapFallbackUrl(): string {
  const base = DEFAULT_BLOCK_TEXTURE_PATH.replace(/\/block\/?$/, "");
  return (typeof window !== "undefined" ? window.location.origin : "") + base + "/colormap/grass.png";
}

export async function loadGrassColormapImageData(): Promise<ImageData | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const loadImg = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
  const primaryUrl = getGrassColormapUrl();
  const fallbackUrl = getGrassColormapFallbackUrl();
  const img = (await loadImg(primaryUrl)) ?? (await loadImg(fallbackUrl));
  if (!img) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (data.width < 32 || data.height < 32) return null;
  const sample = (tx: number, ty: number) => {
    const i = (Math.min(ty, data.height - 1) * data.width + Math.min(tx, data.width - 1)) * 4;
    return (data.data[i] + data.data[i + 1] + data.data[i + 2]) / (3 * 255);
  };
  // Reject only obviously empty/corrupt images; 0.02 allows valid dark colormaps (e.g. dark green corners).
  const avg =
    (sample(0, 0) + sample(data.width - 1, 0) + sample(0, data.height - 1) +
      sample(data.width >> 1, data.height >> 1)) /
    4;
  if (avg < 0.02) return null;
  return data;
}

function getFoliageColormapUrl(): string {
  const base = resolveTextureBase().replace(/\/block\/?$/, "");
  return `${base}/colormap/foliage.png`;
}

function getFoliageColormapFallbackUrl(): string {
  const base = DEFAULT_BLOCK_TEXTURE_PATH.replace(/\/block\/?$/, "");
  return (typeof window !== "undefined" ? window.location.origin : "") + base + "/colormap/foliage.png";
}

export async function loadFoliageColormapImageData(): Promise<ImageData | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const loadImg = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
  const primaryUrl = getFoliageColormapUrl();
  const fallbackUrl = getFoliageColormapFallbackUrl();
  const img = (await loadImg(primaryUrl)) ?? (await loadImg(fallbackUrl));
  if (!img) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (data.width < 32 || data.height < 32) return null;
  const sample = (tx: number, ty: number) => {
    const i = (Math.min(ty, data.height - 1) * data.width + Math.min(tx, data.width - 1)) * 4;
    return (data.data[i] + data.data[i + 1] + data.data[i + 2]) / (3 * 255);
  };
  // Reject only obviously empty/corrupt images; 0.02 allows valid dark colormaps.
  const avg =
    (sample(0, 0) + sample(data.width - 1, 0) + sample(0, data.height - 1) +
      sample(data.width >> 1, data.height >> 1)) /
    4;
  if (avg < 0.02) return null;
  return data;
}

const BIOME_GRASS_TEMP_HUMIDITY: Record<Biome, { temp: number; humidity: number }> = {
  plains: { temp: 0.5, humidity: 0.5 },
  ocean: { temp: 0.5, humidity: 1 },
  desert: { temp: 1, humidity: 0 },
  savanna: { temp: 0.9, humidity: 0.2 },
  forest: { temp: 0.4, humidity: 0.7 },
  jungle: { temp: 0.95, humidity: 0.9 },
  mountain: { temp: 0.3, humidity: 0.4 },
  snow: { temp: 0, humidity: 0.5 },
  meadow: { temp: 0.5, humidity: 0.6 },
  grove: { temp: 0.2, humidity: 0.6 },
  snowy_slopes: { temp: 0.1, humidity: 0.4 },
  stony_peaks: { temp: 0.4, humidity: 0.3 },
  frozen_peaks: { temp: 0, humidity: 0.2 },
  jagged_peaks: { temp: 0.2, humidity: 0.3 },
  cherry_grove: { temp: 0.5, humidity: 0.6 },
  windswept_hills: { temp: 0.3, humidity: 0.5 },
  windswept_gravelly_hills: { temp: 0.3, humidity: 0.4 },
  windswept_forest: { temp: 0.2, humidity: 0.3 },
};

const _grassColor = new THREE.Color();
const GRASS_COLOR_MIN_LUMINANCE = 0.15;
const DEFAULT_GRASS_GREEN = 0x79c05a;

export function sampleGrassColormap(
  data: ImageData,
  temp: number,
  humidity: number
): THREE.Color {
  const w = data.width;
  const h = data.height;
  const clampedTemp = Math.max(0, Math.min(1, temp));
  const clampedHumidity = Math.max(0, Math.min(1, humidity));
  // Vanilla-like biome sampling: humidity is modulated by temperature, then both axes are inverted.
  // This keeps lookups in the valid colormap area and avoids dark/invalid pixels.
  const adjustedHumidity = Math.max(0, Math.min(1, clampedHumidity * clampedTemp));
  const tx = Math.floor((1 - clampedTemp) * (w - 1));
  const ty = Math.floor((1 - adjustedHumidity) * (h - 1));
  const i = (ty * w + tx) * 4;
  const r = data.data[i] / 255;
  const g = data.data[i + 1] / 255;
  const b = data.data[i + 2] / 255;
  const a = data.data[i + 3] / 255;
  if (a < 0.05) {
    _grassColor.setHex(DEFAULT_GRASS_GREEN);
    return _grassColor;
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance < GRASS_COLOR_MIN_LUMINANCE) {
    _grassColor.setHex(DEFAULT_GRASS_GREEN);
  } else {
    // Colormap pixels are sRGB; convert to linear before feeding PBR material color.
    _grassColor.setRGB(r, g, b).convertSRGBToLinear();
  }
  return _grassColor;
}

/** Ensure InstancedMesh has an instanceColor buffer (white default). Required so the shader uses per-instance tint; otherwise grass can render black. */
function ensureInstanceColorBuffer(mesh: THREE.InstancedMesh, count: number): void {
  if (mesh.instanceColor !== null) return;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    array[i * 3] = 1;
    array[i * 3 + 1] = 1;
    array[i * 3 + 2] = 1;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(array, 3);
}

export function setGrassInstanceColors(
  mesh: THREE.InstancedMesh,
  positions: BlockPos[],
  getResolvedBiome: (x: number, z: number) => Biome,
  grassColormapData: ImageData | null
): void {
  if (!grassColormapData) {
    if (DEBUG_GRASS_TINT) {
      console.warn("[grass tint] setGrassInstanceColors skipped: no grass colormap data");
    }
    return;
  }
  // Ensure buffer exists even when positions.length === 0 so vertexColors: true material doesn't render black.
  const count = positions.length > 0 ? positions.length : Math.max(mesh.count, 1);
  ensureInstanceColorBuffer(mesh, count);
  if (positions.length === 0) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return;
  }
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const biome = getResolvedBiome(pos.x, pos.z);
    const { temp, humidity } = BIOME_GRASS_TEMP_HUMIDITY[biome];
    const color = sampleGrassColormap(grassColormapData, temp, humidity);
    const r = color.r,
      g = color.g,
      b = color.b;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < GRASS_COLOR_MIN_LUMINANCE) {
      _grassColor.setHex(DEFAULT_GRASS_GREEN);
      mesh.setColorAt(i, _grassColor);
    } else {
      mesh.setColorAt(i, color);
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (DEBUG_GRASS_TINT && !_debugGrassInstanceLogged && positions.length > 0) {
    const first = new THREE.Color();
    mesh.getColorAt(0, first);
    const p = positions[0];
    const biome = getResolvedBiome(p.x, p.z);
    console.log("[grass tint] first instance color", {
      biome,
      position: p,
      color: {
        r: Number(first.r.toFixed(4)),
        g: Number(first.g.toFixed(4)),
        b: Number(first.b.toFixed(4)),
        hex: "#" + first.getHexString(),
      },
      hasInstanceColorBuffer: mesh.instanceColor !== null,
      instanceCount: mesh.count,
    });
    _debugGrassInstanceLogged = true;
  }
}

export const FOLIAGE_BLOCK_TYPES: BlockType[] = [
  "leaves",
  "oak_leaves",
  "birch_leaves",
  "spruce_leaves",
];

const _foliageColor = new THREE.Color();
const FOLIAGE_COLOR_MIN_LUMINANCE = 0.15;
const DEFAULT_FOLIAGE_GREEN = 0x59ae30;

export function sampleFoliageColormap(
  data: ImageData,
  temp: number,
  humidity: number
): THREE.Color {
  const w = data.width;
  const h = data.height;
  const clampedTemp = Math.max(0, Math.min(1, temp));
  const clampedHumidity = Math.max(0, Math.min(1, humidity));
  const adjustedHumidity = Math.max(0, Math.min(1, clampedHumidity * clampedTemp));
  const tx = Math.floor((1 - clampedTemp) * (w - 1));
  const ty = Math.floor((1 - adjustedHumidity) * (h - 1));
  const i = (ty * w + tx) * 4;
  const r = data.data[i] / 255;
  const g = data.data[i + 1] / 255;
  const b = data.data[i + 2] / 255;
  const a = data.data[i + 3] / 255;
  if (a < 0.05) {
    _foliageColor.setHex(DEFAULT_FOLIAGE_GREEN);
    return _foliageColor;
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance < FOLIAGE_COLOR_MIN_LUMINANCE) {
    _foliageColor.setHex(DEFAULT_FOLIAGE_GREEN);
  } else {
    _foliageColor.setRGB(r, g, b).convertSRGBToLinear();
  }
  return _foliageColor;
}

export function setFoliageInstanceColors(
  mesh: THREE.InstancedMesh,
  positions: BlockPos[],
  getResolvedBiome: (x: number, z: number) => Biome,
  foliageColormapData: ImageData | null
): void {
  if (!foliageColormapData) return;
  const count = positions.length > 0 ? positions.length : Math.max(mesh.count, 1);
  ensureInstanceColorBuffer(mesh, count);
  if (positions.length === 0) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return;
  }
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const biome = getResolvedBiome(pos.x, pos.z);
    const { temp, humidity } = BIOME_GRASS_TEMP_HUMIDITY[biome];
    const color = sampleFoliageColormap(foliageColormapData, temp, humidity);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// Project convention: block at (x,y,z) occupies [x..x+1] in world space (corner-based). Matches worker geometry and collision.
export const sharedBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
sharedBlockGeometry.translate(0.5 * BLOCK_SIZE, 0.5 * BLOCK_SIZE, 0.5 * BLOCK_SIZE);

/**
 * Cross geometry for tall grass (two vertical quads at 90° like Minecraft grass/flowers).
 * Y from 0 to BLOCK_SIZE; centered in XZ. Placed at (block.x+0.5, block.y+1, block.z+0.5).
 */
export const sharedTallGrassGeometry = (() => {
  const h = BLOCK_SIZE;
  const d = BLOCK_SIZE / 2;
  const positions = new Float32Array([
    -d, 0, 0, d, 0, 0, d, h, 0, -d, h, 0, // quad 1 (X-Y, Z=0)
    0, 0, -d, 0, 0, d, 0, h, d, 0, h, -d, // quad 2 (Z-Y, X=0)
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
})();

export const sharedWaterPlaneGeometry = new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE);
sharedWaterPlaneGeometry.rotateX(-Math.PI / 2);

export const blockMaterialCache = new Map<
  string,
  THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]
>();

export function getMaterialForBlockType(
  blockType: BlockType
): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
  const m = blockMaterialCache.get(blockType);
  if (!m) throw new Error(`Missing material for block: ${blockType}`);
  return m;
}
