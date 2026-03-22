import { clamp01 } from './height-shaping'

/**
 * Computes a stable band-noise value in [0,1] for badlands terracotta layers.
 * The function intentionally depends on world Y (layering) with slight X/Z warping so bands
 * aren't perfectly horizontal everywhere.
 *
 * @param wx - World-space X
 * @param wz - World-space Z
 * @param worldY - World-space Y
 * @param detailNoise2D - Detail noise function in roughly [-1,1]
 * @returns Band noise in [0,1]
 */
export function getBadlandsBandNoise(
  wx: number,
  wz: number,
  worldY: number,
  detailNoise2D: (x: number, z: number) => number,
): number {
  const WARP_SCALE = 0.02
  const warp = detailNoise2D(wx * WARP_SCALE, wz * WARP_SCALE) * 6
  const LAYER_FREQ = 0.22
  const y = (worldY + warp) * LAYER_FREQ
  const s = Math.sin(y) * 0.5 + 0.5
  const c = Math.cos(y * 0.61) * 0.5 + 0.5
  return clamp01(s * 0.7 + c * 0.3)
}

