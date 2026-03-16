<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ImportConflictStrategy, WorldSlotMeta } from '../save'
import type { Biome } from '../types'

type WorldSortMode = 'pinned_recent' | 'name_asc' | 'playtime_desc' | 'created_newest'

const SORT_MODE_STORAGE_KEY = 'voxely-launcher-world-sort'

const props = defineProps<{
  worlds: WorldSlotMeta[]
  worldLastBiomeById: Record<string, Biome | null>
  selectedWorldId: string | null
  onSelectWorld: (worldId: string) => void
  onCreateWorld: (name: string, seed?: number) => void
  onRenameWorld: (worldId: string, name: string) => void
  onDeleteWorld: (worldId: string) => void
  onSetWorldPinned: (worldId: string, pinned: boolean) => void
  onDuplicateWorld: (worldId: string) => void
  onExportWorld: (worldId: string) => void
  onImportWorld: (json: string, strategy?: ImportConflictStrategy) => boolean
  onContinue: () => void
  onSingleplayer: () => void
  onMultiplayer: () => void
}>()

const createModalOpen = ref(false)
const createNameInput = ref('')
const createSeedInput = ref('')
const importInputRef = ref<HTMLInputElement | null>(null)
const importConflictModalOpen = ref(false)
const pendingImportJsonRef = ref<string | null>(null)
const pendingImportNameRef = ref('')
const sortModeRef = ref<WorldSortMode>(loadSortModePreference())
const searchQueryRef = ref('')

watch(sortModeRef, (mode) => {
  try {
    localStorage.setItem(SORT_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore unavailable storage
  }
})

/** Selected world metadata for the right-side action panel. */
const selectedWorld = computed(() => {
  if (!props.selectedWorldId) return props.worlds[0] ?? null
  return props.worlds.find((world) => world.id === props.selectedWorldId) ?? props.worlds[0] ?? null
})

/** Launcher world list sorted by pin flag and active sort mode. */
const sortedWorlds = computed(() => {
  const worlds = [...props.worlds]
  worlds.sort((a, b) => compareWorlds(a, b, sortModeRef.value))
  return worlds
})

/** Launcher world list filtered by search query after sorting. */
const filteredWorlds = computed(() => {
  const query = searchQueryRef.value.trim().toLowerCase()
  if (!query) return sortedWorlds.value
  return sortedWorlds.value.filter((world) => getWorldSearchableText(world).includes(query))
})

/**
 * Loads saved sort preference and falls back to pinned recent ordering.
 *
 * @returns Valid sort mode
 */
function loadSortModePreference(): WorldSortMode {
  try {
    const raw = localStorage.getItem(SORT_MODE_STORAGE_KEY)
    if (
      raw === 'pinned_recent' ||
      raw === 'name_asc' ||
      raw === 'playtime_desc' ||
      raw === 'created_newest'
    ) {
      return raw
    }
    return 'pinned_recent'
  } catch {
    return 'pinned_recent'
  }
}

/**
 * Compares two worlds for the selected sort mode while keeping pinned worlds first.
 *
 * @param a - First world
 * @param b - Second world
 * @param sortMode - Active sort mode
 * @returns Negative when a should render before b
 */
function compareWorlds(a: WorldSlotMeta, b: WorldSlotMeta, sortMode: WorldSortMode): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  if (sortMode === 'name_asc') return a.name.localeCompare(b.name)
  if (sortMode === 'playtime_desc') {
    const playtimeDiff = b.playtimeMs - a.playtimeMs
    if (playtimeDiff !== 0) return playtimeDiff
  }
  if (sortMode === 'created_newest') {
    const createdDiff = b.createdAt - a.createdAt
    if (createdDiff !== 0) return createdDiff
  }
  const updatedDiff = b.updatedAt - a.updatedAt
  if (updatedDiff !== 0) return updatedDiff
  return a.name.localeCompare(b.name)
}

/**
 * Builds the searchable text blob for one world row.
 *
 * @param world - World metadata
 * @returns Lowercased searchable text
 */
function getWorldSearchableText(world: WorldSlotMeta): string {
  const biome = props.worldLastBiomeById[world.id]
  const biomeLabel = biome ? formatBiomeLabel(biome) : 'no snapshot'
  return `${world.name} ${world.seed} ${biomeLabel}`.toLowerCase()
}

/**
 * Formats a timestamp as a short locale date/time label.
 *
 * @param epochMs - Unix timestamp in milliseconds
 * @returns User-friendly date label
 */
function formatWorldTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return 'Unknown'
  return new Date(epochMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formats cumulative world playtime as h/m display text.
 *
 * @param playtimeMs - Total played milliseconds
 * @returns Compact readable playtime label
 */
function formatPlaytime(playtimeMs: number): string {
  const safe = Number.isFinite(playtimeMs) && playtimeMs > 0 ? Math.floor(playtimeMs) : 0
  const totalMinutes = Math.floor(safe / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Formats a biome id into a user-facing label.
 *
 * @param biome - Biome id
 * @returns Title-cased biome label
 */
function formatBiomeLabel(biome: Biome): string {
  return biome
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

/**
 * Picks the chip style class for a biome family.
 *
 * @param biome - Optional biome id
 * @returns CSS class name for biome chip
 */
function getBiomeClassName(biome: Biome | null): string {
  if (!biome) return 'biome-chip-unknown'
  if (biome.includes('snow') || biome.includes('frozen') || biome.includes('grove'))
    return 'biome-chip-snow'
  if (biome.includes('ocean') || biome.includes('beach') || biome.includes('river'))
    return 'biome-chip-ocean'
  if (biome.includes('mountain') || biome.includes('peak') || biome.includes('windswept'))
    return 'biome-chip-mountain'
  if (biome.includes('savanna') || biome.includes('desert') || biome.includes('badlands'))
    return 'biome-chip-savanna'
  if (biome.includes('forest') || biome.includes('jungle') || biome.includes('cherry'))
    return 'biome-chip-forest'
  return 'biome-chip-plains'
}

/**
 * Returns a display label and chip class for the last saved biome snapshot.
 *
 * @param world - World metadata
 * @returns Label + class tuple for biome chip
 */
function getWorldBiomeChip(world: WorldSlotMeta): { label: string; className: string } {
  const biome = props.worldLastBiomeById[world.id]
  if (!biome) return { label: 'No Snapshot', className: 'biome-chip-unknown' }
  return {
    label: formatBiomeLabel(biome),
    className: getBiomeClassName(biome),
  }
}

/**
 * Produces a deterministic thumbnail gradient for a world card.
 *
 * @param seed - World seed
 * @returns Inline style object for the world thumbnail
 */
function getWorldThumbnailStyle(seed: number): Record<string, string> {
  const safeSeed = Math.floor(seed) >>> 0
  const hueA = safeSeed % 360
  const hueB = (hueA + 42 + ((safeSeed >>> 4) % 80)) % 360
  return {
    background: `linear-gradient(155deg, hsl(${hueA} 42% 33%) 0%, hsl(${hueB} 46% 22%) 100%)`,
  }
}

/**
 * Returns the quick-continue button label based on the selected world's last mode.
 *
 * @returns Continue button label
 */
function getContinueLabel(): string {
  const mode = selectedWorld.value?.lastMode
  if (mode === 'multiplayer') return 'Quick Continue (Multiplayer)'
  if (mode === 'singleplayer') return 'Quick Continue (Singleplayer)'
  return 'Quick Continue'
}

/** Opens the create-world modal and prefills a readable default name. */
function openCreateModal(): void {
  createNameInput.value = `World ${props.worlds.length + 1}`
  createSeedInput.value = ''
  createModalOpen.value = true
}

/** Closes the create-world modal without changes. */
function closeCreateModal(): void {
  createModalOpen.value = false
}

/** Parses optional seed input from create-world form. */
function parseCreateSeed(): number | undefined {
  const raw = createSeedInput.value.trim()
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? Math.floor(parsed) >>> 0 : undefined
}

/** Submits the create-world form to parent callbacks. */
function submitCreateWorld(): void {
  const name = createNameInput.value.trim()
  const seed = parseCreateSeed()
  if (createSeedInput.value.trim() && seed == null) {
    window.alert('Seed must be a whole number.')
    return
  }
  props.onCreateWorld(name, seed)
  createModalOpen.value = false
}

/**
 * Requests a new world name and forwards it to parent callbacks.
 *
 * @param world - World to rename
 */
function requestRename(world: WorldSlotMeta): void {
  const nextName = window.prompt('Rename world', world.name)
  if (nextName == null) return
  props.onRenameWorld(world.id, nextName)
}

/**
 * Confirms deletion for a world and forwards it to parent callbacks.
 *
 * @param world - World to delete
 */
function requestDelete(world: WorldSlotMeta): void {
  const accepted = window.confirm(`Delete "${world.name}"? This removes its save data.`)
  if (!accepted) return
  props.onDeleteWorld(world.id)
}

/**
 * Toggles pinned state for a world.
 *
 * @param world - Target world
 */
function togglePinned(world: WorldSlotMeta): void {
  props.onSetWorldPinned(world.id, !world.isPinned)
}

/**
 * Duplicates a world via parent callbacks.
 *
 * @param world - Source world
 */
function requestDuplicate(world: WorldSlotMeta): void {
  props.onDuplicateWorld(world.id)
}

/**
 * Exports a world via parent callbacks.
 *
 * @param world - Source world
 */
function requestExport(world: WorldSlotMeta): void {
  props.onExportWorld(world.id)
}

/** Opens file picker for world import. */
function openImportPicker(): void {
  importInputRef.value?.click()
}

/**
 * Normalizes a world name for conflict matching.
 *
 * @param name - Display name
 * @returns Lowercased compact key
 */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Extracts world name from an import payload when available.
 *
 * @param json - Candidate world export JSON
 * @returns Import world name or null
 */
function getImportedWorldName(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const payload = parsed as { format?: string; world?: { name?: string } }
    if (payload.format !== 'voxely-world') return null
    if (!payload.world || typeof payload.world.name !== 'string') return null
    const name = payload.world.name.replace(/\s+/g, ' ').trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

/**
 * Closes the import conflict modal and clears pending import payload.
 */
function closeImportConflictModal(): void {
  importConflictModalOpen.value = false
  pendingImportJsonRef.value = null
  pendingImportNameRef.value = ''
}

/**
 * Imports the pending payload with one selected conflict strategy.
 *
 * @param strategy - Conflict resolution behavior
 */
function resolveImportConflict(strategy: ImportConflictStrategy): void {
  const pendingJson = pendingImportJsonRef.value
  if (!pendingJson) return
  const ok = props.onImportWorld(pendingJson, strategy)
  closeImportConflictModal()
  if (!ok) window.alert('Invalid world file.')
}

/** Handles selected import file and forwards its JSON content. */
async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const importedName = getImportedWorldName(text)
    const hasConflict =
      importedName != null &&
      props.worlds.some((world) => normalizeName(world.name) === normalizeName(importedName))
    if (hasConflict && importedName != null) {
      pendingImportJsonRef.value = text
      pendingImportNameRef.value = importedName
      importConflictModalOpen.value = true
      return
    }
    const ok = props.onImportWorld(text, 'rename')
    if (!ok) window.alert('Invalid world file.')
  } catch {
    window.alert('Failed to read import file.')
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="menu-overlay">
    <div class="menu-glow menu-glow-a"></div>
    <div class="menu-glow menu-glow-b"></div>

    <div class="menu-shell">
      <header class="menu-header">
        <h1 class="menu-title">Voxely</h1>
        <p class="menu-subtitle">Pick a world and jump back in.</p>
      </header>

      <div class="menu-grid">
        <section class="worlds-card">
          <div class="worlds-header">
            <h2 class="worlds-title">Worlds</h2>
            <input
              v-model="searchQueryRef"
              type="search"
              class="world-search-input"
              placeholder="Search worlds, seed, biome..."
              aria-label="Search worlds"
            />
            <select
              v-model="sortModeRef"
              class="sort-worlds-select"
              aria-label="Sort worlds"
              title="Sort worlds"
            >
              <option value="pinned_recent">Pinned + Recent</option>
              <option value="playtime_desc">Pinned + Playtime</option>
              <option value="name_asc">Pinned + Name</option>
              <option value="created_newest">Pinned + Newest</option>
            </select>
            <div class="worlds-header-actions">
              <button type="button" class="new-world-btn" @click="openCreateModal">+ New</button>
              <button
                type="button"
                class="new-world-btn import-world-btn"
                @click="openImportPicker"
              >
                Import
              </button>
            </div>
            <input
              ref="importInputRef"
              type="file"
              accept=".json,application/json"
              class="import-input-hidden"
              @change="onImportFile"
            />
          </div>

          <div class="world-list">
            <div
              v-for="world in filteredWorlds"
              :key="world.id"
              class="world-row-wrap"
              :class="{ selected: selectedWorld?.id === world.id }"
            >
              <button type="button" class="world-row" @click="onSelectWorld(world.id)">
                <div class="world-row-top">
                  <div class="world-title-group">
                    <span class="world-thumb" :style="getWorldThumbnailStyle(world.seed)"></span>
                    <span class="world-name">{{ world.name }}</span>
                  </div>
                  <button
                    type="button"
                    class="world-pin-btn"
                    :class="{ active: world.isPinned }"
                    :title="world.isPinned ? 'Unpin world' : 'Pin world'"
                    @click.stop="togglePinned(world)"
                  >
                    {{ world.isPinned ? 'Pinned' : 'Pin' }}
                  </button>
                </div>
                <div class="world-chip-row">
                  <span
                    class="biome-chip"
                    :class="getWorldBiomeChip(world).className"
                    :title="`Last saved biome snapshot: ${getWorldBiomeChip(world).label}`"
                  >
                    {{ getWorldBiomeChip(world).label }}
                  </span>
                  <span
                    class="biome-chip biome-chip-secondary"
                    :title="world.hasSave ? 'Has save data' : 'Fresh world'"
                  >
                    {{ world.isPinned ? 'Pinned' : 'Unpinned' }}
                  </span>
                  <span class="seed-chip" :title="`Seed ${world.seed}`">Seed {{ world.seed }}</span>
                </div>
                <span class="world-meta">
                  {{
                    world.hasSave
                      ? `Last played ${formatWorldTime(world.updatedAt)}`
                      : 'Fresh world'
                  }}
                </span>
                <span class="world-meta world-meta-secondary">
                  Playtime {{ formatPlaytime(world.playtimeMs) }}
                </span>
              </button>
              <div class="world-actions">
                <button
                  type="button"
                  class="world-action-btn"
                  title="Duplicate world"
                  @click.stop="requestDuplicate(world)"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  class="world-action-btn"
                  title="Export world"
                  @click.stop="requestExport(world)"
                >
                  Export
                </button>
                <button
                  type="button"
                  class="world-action-btn"
                  title="Rename world"
                  @click.stop="requestRename(world)"
                >
                  Rename
                </button>
                <button
                  type="button"
                  class="world-action-btn world-action-btn-danger"
                  title="Delete world"
                  @click.stop="requestDelete(world)"
                >
                  Delete
                </button>
              </div>
            </div>
            <div v-if="filteredWorlds.length === 0" class="worlds-empty-state">
              No worlds match "{{ searchQueryRef }}".
            </div>
          </div>
        </section>

        <section class="play-card">
          <h2 class="play-world-name">{{ selectedWorld?.name ?? 'No world selected' }}</h2>
          <p class="play-world-subtitle">
            {{
              selectedWorld?.hasSave
                ? 'Continue your adventure where you left off.'
                : 'Start a brand new journey.'
            }}
          </p>

          <div class="menu-buttons">
            <button type="button" class="menu-btn menu-btn-continue" @click="onContinue">
              {{ getContinueLabel() }}
            </button>
            <button type="button" class="menu-btn menu-btn-single" @click="onSingleplayer">
              Continue Singleplayer
            </button>
            <button type="button" class="menu-btn menu-btn-multi" @click="onMultiplayer">
              Enter Multiplayer
            </button>
          </div>
        </section>
      </div>
    </div>

    <div
      v-if="createModalOpen"
      class="create-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create world"
      @click.self="closeCreateModal"
    >
      <div class="create-modal-card">
        <h3 class="create-modal-title">Create New World</h3>
        <label class="create-field">
          <span>Name</span>
          <input
            v-model="createNameInput"
            type="text"
            maxlength="40"
            placeholder="World name"
            class="create-input"
          />
        </label>
        <label class="create-field">
          <span>Seed (optional)</span>
          <input
            v-model="createSeedInput"
            type="text"
            inputmode="numeric"
            placeholder="Random if empty"
            class="create-input"
          />
        </label>
        <div class="create-actions">
          <button type="button" class="create-btn create-btn-cancel" @click="closeCreateModal">
            Cancel
          </button>
          <button type="button" class="create-btn create-btn-submit" @click="submitCreateWorld">
            Create World
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="importConflictModalOpen"
      class="create-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Resolve import conflict"
      @click.self="closeImportConflictModal"
    >
      <div class="create-modal-card">
        <h3 class="create-modal-title">World Already Exists</h3>
        <p class="import-conflict-copy">
          A world named "{{ pendingImportNameRef }}" already exists. Choose how to import this file.
        </p>
        <div class="import-conflict-actions">
          <button
            type="button"
            class="create-btn create-btn-submit"
            @click="resolveImportConflict('merge')"
          >
            Merge Save
          </button>
          <button
            type="button"
            class="create-btn import-replace-btn"
            @click="resolveImportConflict('replace')"
          >
            Replace World
          </button>
          <button
            type="button"
            class="create-btn import-rename-btn"
            @click="resolveImportConflict('rename')"
          >
            Keep Both
          </button>
          <button
            type="button"
            class="create-btn create-btn-cancel"
            @click="closeImportConflictModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  overflow: hidden;
  background:
    radial-gradient(circle at 14% 18%, rgba(80, 151, 119, 0.28), transparent 42%),
    radial-gradient(circle at 82% 8%, rgba(84, 128, 191, 0.3), transparent 40%),
    linear-gradient(165deg, #070c16 0%, #0b1a2c 45%, #101e35 100%);
}

.menu-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(70px);
  opacity: 0.45;
  pointer-events: none;
}

.menu-glow-a {
  width: 260px;
  height: 260px;
  left: -40px;
  top: 10%;
  background: rgba(95, 173, 129, 0.55);
}

.menu-glow-b {
  width: 280px;
  height: 280px;
  right: -70px;
  bottom: -10px;
  background: rgba(96, 139, 199, 0.55);
}

.menu-shell {
  position: relative;
  width: min(980px, 96vw);
  border-radius: 18px;
  border: 1px solid rgba(196, 217, 245, 0.24);
  background: linear-gradient(180deg, rgba(8, 15, 26, 0.94) 0%, rgba(9, 18, 33, 0.94) 100%);
  box-shadow:
    0 30px 70px rgba(0, 0, 0, 0.58),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  padding: 1.1rem;
  backdrop-filter: blur(8px);
}

.menu-header {
  padding: 0.6rem 0.8rem 1rem;
}

.menu-title {
  margin: 0;
  font-size: clamp(1.6rem, 2vw, 2rem);
  letter-spacing: 0.02em;
  color: var(--ui-text);
  font-family: var(--ui-font);
}

.menu-subtitle {
  margin: 0.25rem 0 0;
  color: var(--ui-text-muted);
  font-family: var(--ui-font);
}

.menu-grid {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 0.9rem;
}

.worlds-card,
.play-card {
  border-radius: 14px;
  border: 1px solid rgba(189, 209, 237, 0.2);
  background: rgba(12, 21, 37, 0.76);
  padding: 0.9rem;
}

.worlds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.7rem;
}

.worlds-header-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.world-search-input {
  min-width: 200px;
  border: 1px solid rgba(158, 194, 235, 0.32);
  border-radius: 8px;
  background: rgba(14, 25, 41, 0.9);
  color: rgba(228, 239, 255, 0.92);
  font-size: 0.78rem;
  padding: 0.38rem 0.55rem;
  font-family: var(--ui-font);
}

.world-search-input::placeholder {
  color: rgba(175, 198, 226, 0.62);
}

.world-search-input:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.sort-worlds-select {
  border: 1px solid rgba(158, 194, 235, 0.35);
  border-radius: 8px;
  background: rgba(17, 29, 46, 0.86);
  color: rgba(224, 238, 255, 0.9);
  font-size: 0.76rem;
  padding: 0.36rem 0.5rem;
  font-family: var(--ui-font);
}

.sort-worlds-select:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.worlds-title {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(220, 236, 255, 0.86);
  font-family: var(--ui-font);
}

.new-world-btn {
  border: 1px solid rgba(137, 179, 225, 0.38);
  background: rgba(47, 88, 133, 0.48);
  color: var(--ui-text);
  border-radius: 9px;
  padding: 0.4rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  font-family: var(--ui-font);
}

.new-world-btn:hover {
  transform: translateY(-1px);
  background: rgba(58, 101, 149, 0.62);
  border-color: rgba(170, 211, 255, 0.55);
}

.new-world-btn:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.import-world-btn {
  background: rgba(53, 102, 82, 0.48);
  border-color: rgba(139, 206, 173, 0.38);
}

.import-input-hidden {
  display: none;
}

.world-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 0.15rem;
}

.world-row {
  flex: 1;
  width: 100%;
  text-align: left;
  border: none;
  border-radius: 9px;
  background: transparent;
  padding: 0.58rem 0.66rem;
  color: var(--ui-text);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
  transition: background 0.14s ease;
  font-family: var(--ui-font);
}

.world-row:hover {
  background: rgba(43, 67, 98, 0.3);
}

.world-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
}

.world-title-group {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  min-width: 0;
}

.world-thumb {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(193, 221, 252, 0.35);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}

.world-pin-btn {
  border: 1px solid rgba(173, 202, 236, 0.35);
  border-radius: 999px;
  background: rgba(27, 44, 68, 0.82);
  color: rgba(214, 231, 252, 0.84);
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 0.12rem 0.46rem;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease;
}

.world-pin-btn.active {
  background: rgba(90, 136, 78, 0.88);
  border-color: rgba(175, 224, 162, 0.58);
  color: rgba(236, 248, 230, 0.95);
}

.world-chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.biome-chip,
.seed-chip {
  border-radius: 999px;
  font-size: 0.63rem;
  font-weight: 700;
  padding: 0.12rem 0.45rem;
  letter-spacing: 0.01em;
}

.biome-chip {
  border: 1px solid rgba(190, 214, 243, 0.34);
  color: rgba(230, 241, 255, 0.9);
}

.biome-chip-plains {
  background: rgba(98, 152, 89, 0.78);
}

.biome-chip-forest {
  background: rgba(48, 112, 75, 0.82);
}

.biome-chip-savanna {
  background: rgba(160, 128, 65, 0.82);
}

.biome-chip-snow {
  background: rgba(129, 163, 194, 0.8);
}

.biome-chip-mountain {
  background: rgba(96, 112, 129, 0.82);
}

.biome-chip-ocean {
  background: rgba(63, 114, 174, 0.82);
}

.biome-chip-secondary {
  background: rgba(70, 95, 131, 0.7);
}

.biome-chip-unknown {
  background: rgba(88, 102, 124, 0.78);
}

.seed-chip {
  background: rgba(42, 59, 84, 0.82);
  border: 1px solid rgba(164, 195, 233, 0.32);
  color: rgba(217, 232, 249, 0.86);
}

.worlds-empty-state {
  border: 1px dashed rgba(155, 184, 218, 0.35);
  border-radius: 10px;
  background: rgba(18, 31, 49, 0.64);
  color: rgba(198, 220, 245, 0.82);
  font-size: 0.8rem;
  padding: 0.7rem 0.75rem;
  font-family: var(--ui-font);
}

.world-row-wrap {
  border: 1px solid rgba(193, 214, 240, 0.2);
  border-radius: 11px;
  background: rgba(16, 28, 45, 0.76);
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem;
  transition:
    border-color 0.14s ease,
    background 0.14s ease,
    transform 0.14s ease;
}

.world-row-wrap:hover {
  transform: translateY(-1px);
  border-color: rgba(176, 211, 250, 0.5);
  background: rgba(22, 37, 58, 0.86);
}

.world-row-wrap.selected {
  border-color: rgba(112, 194, 143, 0.65);
  background: rgba(26, 49, 53, 0.8);
  box-shadow: inset 0 0 0 1px rgba(112, 194, 143, 0.32);
}

.world-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-right: 0.25rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 150px;
}

.world-action-btn {
  border: 1px solid rgba(183, 210, 240, 0.28);
  border-radius: 8px;
  background: rgba(26, 43, 65, 0.78);
  color: rgba(230, 240, 252, 0.84);
  font-size: 0.68rem;
  padding: 0.26rem 0.38rem;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background 0.14s ease;
  font-family: var(--ui-font);
}

.world-action-btn:hover {
  border-color: rgba(188, 219, 254, 0.48);
  background: rgba(38, 61, 90, 0.86);
}

.world-action-btn-danger {
  border-color: rgba(214, 139, 139, 0.32);
  color: rgba(255, 201, 201, 0.88);
}

.world-action-btn-danger:hover {
  border-color: rgba(240, 157, 157, 0.55);
  background: rgba(93, 38, 38, 0.82);
}

.world-row:focus-visible,
.world-action-btn:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.world-name {
  font-size: 0.95rem;
  font-weight: 700;
}

.world-meta {
  color: rgba(220, 232, 249, 0.74);
  font-size: 0.77rem;
}

.world-meta-secondary {
  color: rgba(190, 220, 196, 0.78);
}

.play-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 320px;
}

.play-world-name {
  margin: 0;
  color: #eaf4ff;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  font-family: var(--ui-font);
}

.play-world-subtitle {
  margin: 0.35rem 0 1rem;
  color: rgba(216, 231, 250, 0.76);
  font-family: var(--ui-font);
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.menu-btn {
  padding: 0.82rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition:
    transform 0.14s ease,
    box-shadow 0.14s ease,
    border-color 0.14s ease;
  font-family: var(--ui-font);
}

.menu-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--ui-shadow-button);
}

.menu-btn:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.menu-btn-single {
  border-color: rgba(135, 208, 162, 0.44);
  background: linear-gradient(180deg, rgba(87, 146, 114, 0.98) 0%, rgba(57, 106, 78, 0.98) 100%);
  color: var(--ui-text);
}

.menu-btn-continue {
  border-color: rgba(186, 210, 240, 0.42);
  background: linear-gradient(180deg, rgba(75, 112, 158, 0.9) 0%, rgba(55, 83, 120, 0.95) 100%);
  color: var(--ui-text);
}

.menu-btn-multi {
  border-color: rgba(147, 184, 228, 0.4);
  background: linear-gradient(180deg, rgba(79, 126, 186, 0.98) 0%, rgba(58, 91, 139, 0.98) 100%);
  color: var(--ui-text);
}

.create-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 8, 14, 0.62);
  backdrop-filter: blur(4px);
  padding: 1rem;
}

.create-modal-card {
  width: min(430px, 96vw);
  border-radius: 14px;
  border: 1px solid rgba(180, 207, 241, 0.28);
  background: linear-gradient(180deg, rgba(10, 18, 30, 0.96) 0%, rgba(8, 14, 24, 0.96) 100%);
  box-shadow: 0 24px 52px rgba(0, 0, 0, 0.55);
  padding: 0.95rem;
}

.create-modal-title {
  margin: 0 0 0.8rem;
  font-size: 1.1rem;
  color: var(--ui-text);
  font-family: var(--ui-font);
}

.create-field {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  margin-bottom: 0.62rem;
  color: rgba(220, 232, 249, 0.9);
  font-size: 0.82rem;
  font-family: var(--ui-font);
}

.create-input {
  border: 1px solid rgba(180, 207, 241, 0.3);
  border-radius: 9px;
  background: rgba(12, 23, 39, 0.82);
  color: var(--ui-text);
  font-size: 0.88rem;
  padding: 0.5rem 0.62rem;
  font-family: var(--ui-font);
}

.create-input:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  margin-top: 0.3rem;
}

.create-btn {
  border: 1px solid rgba(183, 210, 240, 0.28);
  border-radius: 9px;
  padding: 0.46rem 0.72rem;
  color: var(--ui-text);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--ui-font);
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    background 0.14s ease;
}

.create-btn:hover {
  transform: translateY(-1px);
}

.create-btn-cancel {
  background: rgba(39, 52, 74, 0.88);
}

.create-btn-submit {
  background: linear-gradient(180deg, rgba(83, 146, 112, 0.94) 0%, rgba(58, 107, 80, 0.94) 100%);
  border-color: rgba(148, 224, 184, 0.4);
}

.import-conflict-copy {
  margin: 0 0 0.8rem;
  color: rgba(211, 227, 247, 0.85);
  font-size: 0.84rem;
  font-family: var(--ui-font);
}

.import-conflict-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.42rem;
}

.import-replace-btn {
  background: linear-gradient(180deg, rgba(160, 90, 90, 0.94) 0%, rgba(123, 62, 62, 0.94) 100%);
  border-color: rgba(244, 178, 178, 0.35);
}

.import-rename-btn {
  background: linear-gradient(180deg, rgba(72, 106, 149, 0.94) 0%, rgba(54, 82, 116, 0.94) 100%);
  border-color: rgba(163, 201, 241, 0.36);
}

@media (max-width: 860px) {
  .menu-shell {
    padding: 0.85rem;
  }

  .menu-grid {
    grid-template-columns: 1fr;
  }

  .world-list {
    max-height: 230px;
  }

  .play-card {
    min-height: 0;
  }

  .world-actions {
    max-width: 120px;
  }

  .world-search-input {
    min-width: 100%;
  }
}
</style>
