import type { BlockPos } from '../../types'

let _grassTopVariantMaterialKeys: string[] = []

/**
 * Registers material-cache keys for grass top texture variants.
 * These keys must exist in `blockMaterialCache` and are used by chunk renderers to split grass instances
 * into multiple instanced layers (one per key).
 *
 * @param keys - Material keys in stable order
 */
export function setGrassTopVariantMaterialKeys(keys: string[]): void {
  _grassTopVariantMaterialKeys = keys
}

/**
 * Returns the registered material-cache keys for grass top texture variants.
 *
 * @returns Material keys (possibly empty)
 */
export function getGrassTopVariantMaterialKeys(): readonly string[] {
  return _grassTopVariantMaterialKeys
}

const HASH_PRIME_X = 73856093
const HASH_PRIME_Y = 19349663
const HASH_PRIME_Z = 83492791

/**
 * Deterministically maps a block position to a variant index.
 *
 * @param p - Block position
 * @param variantCount - Number of variants (must be > 0)
 * @returns Variant index in [0, variantCount)
 */
function getVariantIndexForPos(p: BlockPos, variantCount: number): number {
  // Use integer coords; world blocks are already integers.
  const x = p.x | 0
  const y = p.y | 0
  const z = p.z | 0
  const h = (Math.imul(x, HASH_PRIME_X) ^ Math.imul(y, HASH_PRIME_Y) ^ Math.imul(z, HASH_PRIME_Z)) >>> 0
  return h % variantCount
}

/**
 * Partitions positions into buckets by variant material key.
 *
 * @param positions - Block positions
 * @param materialKeys - Variant material keys (length > 0)
 * @returns Buckets keyed by material key
 */
export function partitionPositionsByVariantMaterialKey(
  positions: BlockPos[],
  materialKeys: readonly string[],
): Map<string, BlockPos[]> {
  const out = new Map<string, BlockPos[]>()
  const n = materialKeys.length
  if (n === 0) return out
  for (const p of positions) {
    const idx = getVariantIndexForPos(p, n)
    const key = materialKeys[idx]
    const arr = out.get(key) ?? []
    arr.push(p)
    out.set(key, arr)
  }
  return out
}

