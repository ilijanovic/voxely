/**
 * Resource pack selection for Minecraft-style texture packs.
 * Persisted in localStorage; URL param ?resource_pack= overrides for sharing.
 */

const STORAGE_KEY = 'voxely_resource_pack'

export interface PackOption {
  path: string
  name: string
}

/** The built-in default pack (no override; uses /assets/minecraft/textures/block). */
export const DEFAULT_PACK: PackOption = { path: '', name: 'Default' }

/** Fallback list when no index.json is available. */
const FALLBACK_PACK_OPTIONS: PackOption[] = [DEFAULT_PACK]

let cachedPackList: PackOption[] | null = null

/**
 * Returns the list of available resource packs. Tries /packs/index.json first,
 * then falls back to FALLBACK_PACK_OPTIONS.
 */
export async function getAvailablePacks(): Promise<PackOption[]> {
  if (cachedPackList) return cachedPackList
  try {
    const candidates = ['/packs/index.json']
    for (const url of candidates) {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = (await res.json()) as { packs?: PackOption[] }
      const list = data.packs
      if (Array.isArray(list) && list.length > 0) {
        cachedPackList = list
        return cachedPackList
      }
    }
  } catch {
    // ignore
  }
  cachedPackList = FALLBACK_PACK_OPTIONS
  return cachedPackList
}

/**
 * Currently selected pack path (empty = built-in assets). Prefers URL param over localStorage.
 */
export function getSelectedResourcePack(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('resource_pack')
  if (fromUrl !== null) return fromUrl.startsWith('/') ? fromUrl : `/${fromUrl}`
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Set selected resource pack and persist. Use empty string for default.
 * Caller should reload the page to apply (e.g. window.location.reload()).
 */
export function setSelectedResourcePack(path: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, path)
  } catch {
    // ignore
  }
}
