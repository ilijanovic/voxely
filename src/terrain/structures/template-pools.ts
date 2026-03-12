/**
 * Template pools for structures (Minecraft-style): weighted selection and depth/terminator policy.
 * Each structure type has a pool of template variants with weights; selection is deterministic from seed + origin.
 *
 * **Depth and terminators (jigsaw-style):**
 * - `MAX_STRUCTURE_DEPTH` controls how many "layers" of pieces can attach. Currently 1 = one piece per origin (no expansion).
 * - To support depth > 1: define terminator pieces that do not have attachment points, so growth stops cleanly.
 * - Origins are produced in `structures/origins.ts`; painting uses these pools in the features stage.
 *
 * **Adding a new structure pool:**
 * - Add a `ReadonlyArray<{ variant: T; weight: number }>` and a `pickXFromPool(seed, ox, oz): T` using the same hash pattern as below.
 * - Wire the picker in the stage that paints structures (e.g. stage5-structures / paint-structures).
 */
import type { VillageHouseSize } from './origins'

/**
 * Max depth for structure growth (jigsaw-style). Currently 1 = single piece per origin, no expansion.
 * Future: allow depth > 1 with terminator pieces that have no attachment points to stop growth.
 */
export const MAX_STRUCTURE_DEPTH = 1

/**
 * Village house template pool: weighted choice of small / medium / large.
 * Higher weight = more likely; reduces repetitive large houses.
 */
export const VILLAGE_HOUSE_POOL: ReadonlyArray<{ size: VillageHouseSize; weight: number }> = [
  { size: 'small', weight: 5 },
  { size: 'medium', weight: 3 },
  { size: 'large', weight: 1 },
]

const VILLAGE_POOL_TOTAL = VILLAGE_HOUSE_POOL.reduce((s, e) => s + e.weight, 0)

const UINT32_NORM = 0x100000000

/**
 * Deterministic 32-bit hash for (seed, ox, oz) for structure template selection.
 * Uses 32-bit integer math (Math.imul) to avoid floating precision drift.
 */
function hashSeededOrigin(seed: number, ox: number, oz: number, salt: number): number {
  const x = Math.floor(ox)
  const z = Math.floor(oz)
  let h = (seed + salt + Math.imul(x, 374761393) + Math.imul(z, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** Temple template variant; currently only 'default' (desert temple). Add more for varied temples. */
export type TempleVariant = 'default'

/**
 * Temple template pool: weighted choice of variant. Single variant for now; extend with more templates and weights later.
 */
export const TEMPLE_POOL: ReadonlyArray<{ variant: TempleVariant; weight: number }> = [
  { variant: 'default', weight: 1 },
]

const TEMPLE_POOL_TOTAL = TEMPLE_POOL.reduce((s, e) => s + e.weight, 0)

/**
 * Picks a village house size from the template pool by weighted selection (deterministic from seed + ox + oz).
 */
export function pickVillageHouseFromPool(
  seed: number,
  ox: number,
  oz: number,
): VillageHouseSize {
  const h = hashSeededOrigin(seed, ox, oz, 0)
  const t = ((h >>> 0) / UINT32_NORM) * VILLAGE_POOL_TOTAL
  let acc = 0
  for (const entry of VILLAGE_HOUSE_POOL) {
    acc += entry.weight
    if (t < acc) return entry.size
  }
  return VILLAGE_HOUSE_POOL[VILLAGE_HOUSE_POOL.length - 1].size
}

/**
 * Picks a temple variant from the template pool (deterministic from seed + ox + oz).
 * Use when painting temple structures to support multiple temple templates in the future.
 */
export function pickTempleVariantFromPool(
  seed: number,
  ox: number,
  oz: number,
): TempleVariant {
  const h = hashSeededOrigin(seed, ox, oz, 1000)
  const t = ((h >>> 0) / UINT32_NORM) * TEMPLE_POOL_TOTAL
  let acc = 0
  for (const entry of TEMPLE_POOL) {
    acc += entry.weight
    if (t < acc) return entry.variant
  }
  return TEMPLE_POOL[TEMPLE_POOL.length - 1].variant
}
