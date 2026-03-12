<script setup lang="ts">
/**
 * Quest Log: active quests with progress, available to accept, and turn-in for completed.
 */
import { ref, computed, watch } from 'vue'
import type { PlayerClass } from '../player/faction'
import type { Quest, QuestObjective, ActiveQuest, QuestCategory } from '../quests/types'
import {
  getQuestById,
  getQuestRewardForClass,
  getQuestDifficultyColorClass,
  getZoneDisplayName,
} from '../quests/quest-registry'
import { getBlockLabel, getBlockIcon, getItemStats } from '../hotbar-icons'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  activeQuests: ActiveQuest[]
  availableQuestIds: string[]
  completedQuestIds: string[]
  onAccept: (questId: string) => boolean
  /** Turn in quest; for quests with rewardChoices, pass the chosen index. */
  onTurnIn: (questId: string, rewardChoiceIndex?: number) => boolean
  /** Abandon active quest; progress is lost and quest becomes available again at the giver. */
  onAbort?: (questId: string) => boolean
  /** Quest ids currently tracked on the HUD. */
  trackedQuestIds?: string[]
  /** Toggle whether this quest is tracked on the HUD (only for active quests). */
  onToggleTrack?: (questId: string) => void
  /** When set, preselect this quest when the log opens (e.g. from quest NPC interaction). */
  initialSelectedQuestId?: string | null
  /** True when the log was opened by interacting with a quest giver; only then can the player turn in. */
  atQuestGiver?: boolean
  /** Player class for class-specific reward display (and turn-in uses same in game). */
  playerClass?: PlayerClass | null
  /** Player level for quest difficulty color (gray/green/yellow/orange/red). */
  playerLevel?: number
}>()

/** Selected quest id for detail (active or available). */
const selectedId = ref<string | null>(props.initialSelectedQuestId ?? null)

/** When initialSelectedQuestId changes and is set, preselect that quest. */
watch(
  () => props.initialSelectedQuestId,
  (id) => {
    if (id != null) selectedId.value = id
  },
)

const selectedQuest = computed((): Quest | null => {
  const id = selectedId.value
  return id ? getQuestById(id) ?? null : null
})

const selectedProgress = computed((): number[] | null => {
  const id = selectedId.value
  if (!id) return null
  const a = props.activeQuests.find((q) => q.questId === id)
  return a ? a.progress : null
})

const isSelectedComplete = computed((): boolean => {
  const q = selectedQuest.value
  const p = selectedProgress.value
  if (!q || !p || p.length !== q.objectives.length) return false
  return q.objectives.every((obj, i) => {
    const need = obj.type === 'kill' || obj.type === 'collect' ? obj.count : 1
    return p[i] >= need
  })
})

/** True if the given active quest has all objectives complete (ready to return to quest giver). */
function isQuestReadyToTurnIn(questId: string): boolean {
  const q = getQuestById(questId)
  const a = props.activeQuests.find((x) => x.questId === questId)
  if (!q || !a || a.progress.length !== q.objectives.length) return false
  return q.objectives.every((obj, i) => {
    const need = obj.type === 'kill' || obj.type === 'collect' ? obj.count : 1
    return a.progress[i] >= need
  })
}

/** Effective reward for the selected quest for current player class. */
const selectedReward = computed(() => {
  const q = selectedQuest.value
  return q ? getQuestRewardForClass(q, props.playerClass ?? null) : null
})

function objectiveLabel(obj: QuestObjective, progress: number): string {
  if (obj.type === 'kill' || obj.type === 'collect') {
    return `${obj.label}: ${progress}/${obj.count}`
  }
  return `${obj.label}: ${progress >= 1 ? 'Done' : '—'}`
}

function accept(questId: string) {
  if (props.onAccept(questId)) selectedId.value = questId
}

function turnIn(questId: string, rewardChoiceIndex?: number) {
  if (props.onTurnIn(questId, rewardChoiceIndex)) {
    selectedId.value = null
  }
}

/**
 * Abandons the selected active quest. Caller refreshes list; selection is cleared on success.
 */
function abort(questId: string) {
  if (props.onAbort?.(questId)) {
    selectedId.value = null
  }
}

/** Resolves locationHint (string or function) for display. */
function getLocationHint(quest: Quest | undefined): string | undefined {
  const h = quest?.locationHint
  if (h == null) return undefined
  return typeof h === 'function' ? h() : h
}

/** Whether the given quest id is currently tracked on the HUD. */
function isTracked(questId: string): boolean {
  return (props.trackedQuestIds ?? []).includes(questId)
}

/** Difficulty color class for a quest title based on player level. */
function questTitleColorClass(quest: Quest | undefined): string {
  if (!quest) return 'text-amber-200'
  return getQuestDifficultyColorClass(quest.level, props.playerLevel ?? 1)
}

/** Short label for quest category (Main, Side, Daily, Repeatable). */
function categoryLabel(category: QuestCategory | undefined): string {
  if (!category) return ''
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/** Groups active quests by zone for the quest list. */
const activeQuestsByZone = computed(() => {
  const zones = new Map<string, { zoneId: string; zoneName: string; quests: typeof props.activeQuests }>()
  const otherKey = '__other'
  for (const a of props.activeQuests) {
    const quest = getQuestById(a.questId)
    const zid = quest?.zoneId ?? otherKey
    if (!zones.has(zid)) {
      zones.set(zid, {
        zoneId: zid,
        zoneName: zid === otherKey ? 'Other' : getZoneDisplayName(zid),
        quests: [],
      })
    }
    zones.get(zid)!.quests.push(a)
  }
  return Array.from(zones.values()).sort((x, y) => x.zoneName.localeCompare(y.zoneName))
})

/** Groups available quest ids by zone for the quest list. */
const availableQuestIdsByZone = computed(() => {
  const zones = new Map<string, { zoneId: string; zoneName: string; questIds: string[] }>()
  const otherKey = '__other'
  for (const id of props.availableQuestIds) {
    const quest = getQuestById(id)
    const zid = quest?.zoneId ?? otherKey
    if (!zones.has(zid)) {
      zones.set(zid, {
        zoneId: zid,
        zoneName: zid === otherKey ? 'Other' : getZoneDisplayName(zid),
        questIds: [],
      })
    }
    zones.get(zid)!.questIds.push(id)
  }
  return Array.from(zones.values()).sort((x, y) => x.zoneName.localeCompare(y.zoneName))
})

/** Tooltip lines for a reward item: name + count, then stat lines (e.g. Damage: 2). */
function getRewardItemTooltipLines(type: string, count: number): string[] {
  const label = getBlockLabel(type)
  const countLine = count > 1 ? `${label} × ${count}` : label
  const stats = getItemStats(type)
  return stats.length > 0 ? [countLine, ...stats] : [countLine]
}
</script>

<template>
  <div
    class="quest-log fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
    @click.self="emit('close')"
  >
    <div
      class="quest-log-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border-2 border-amber-800/80 bg-stone-900 text-stone-100 shadow-xl"
      role="dialog"
      aria-label="Quest log"
    >
      <div class="flex items-center justify-between border-b border-stone-600 px-4 py-2">
        <h2 class="text-lg font-bold">Quest Log</h2>
        <button
          type="button"
          class="rounded px-2 py-1 text-sm hover:bg-stone-700"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="flex flex-1 min-h-0">
        <!-- List -->
        <div class="w-48 shrink-0 overflow-y-auto border-r border-stone-600 p-2">
          <div v-if="activeQuests.length > 0" class="mb-2">
            <div class="text-xs font-semibold uppercase text-amber-400">Active</div>
            <template v-for="zone in activeQuestsByZone" :key="zone.zoneId">
              <div class="mt-1.5 text-[11px] font-medium uppercase text-stone-500">
                {{ zone.zoneName }}
              </div>
              <button
                v-for="a in zone.quests"
                :key="a.questId"
                type="button"
                class="mt-1 flex w-full items-start gap-1.5 rounded px-2 py-1.5 text-left hover:bg-stone-700"
                :class="{ 'bg-stone-700': selectedId === a.questId }"
                @click="selectedId = a.questId"
              >
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm"
                    :class="questTitleColorClass(getQuestById(a.questId))"
                  >
                    {{ getQuestById(a.questId)?.title ?? a.questId }}
                    <template v-if="getQuestById(a.questId)?.level != null"> ({{ getQuestById(a.questId)!.level }})</template>
                  </span>
                  <span
                    v-if="getLocationHint(getQuestById(a.questId))"
                    class="block truncate text-[11px] text-stone-500"
                  >
                    {{ getLocationHint(getQuestById(a.questId)) }}
                  </span>
                </span>
                <span
                  v-if="isQuestReadyToTurnIn(a.questId)"
                  class="shrink-0 text-base leading-none text-yellow-400"
                  title="Ready to return to quest giver"
                  aria-label="Ready to return to quest giver"
                >
                  ?
                </span>
              </button>
            </template>
          </div>
          <div v-if="availableQuestIds.length > 0">
            <div class="text-xs font-semibold uppercase text-amber-400">Available</div>
            <template v-for="zone in availableQuestIdsByZone" :key="zone.zoneId">
              <div class="mt-1.5 text-[11px] font-medium uppercase text-stone-500">
                {{ zone.zoneName }}
              </div>
              <button
                v-for="id in zone.questIds"
                :key="id"
                type="button"
                class="mt-1 block w-full rounded px-2 py-1.5 text-left hover:bg-stone-700"
                :class="{ 'bg-stone-700': selectedId === id }"
                @click="selectedId = id"
              >
                <span
                  class="block truncate text-sm"
                  :class="questTitleColorClass(getQuestById(id))"
                >
                  {{ getQuestById(id)?.title ?? id }}
                  <template v-if="getQuestById(id)?.level != null"> ({{ getQuestById(id)!.level }})</template>
                </span>
                <span
                  v-if="getLocationHint(getQuestById(id))"
                  class="block truncate text-[11px] text-stone-500"
                >
                  {{ getLocationHint(getQuestById(id)) }}
                </span>
              </button>
            </template>
          </div>
          <div v-if="completedQuestIds.length > 0" class="mt-2">
            <div class="text-xs font-semibold uppercase text-stone-500">Completed</div>
            <div
              v-for="id in completedQuestIds"
              :key="id"
              class="mt-1 truncate px-2 py-1 text-sm text-stone-500"
            >
              {{ getQuestById(id)?.title ?? id }}
            </div>
          </div>
        </div>
        <!-- Detail -->
        <div class="flex-1 overflow-y-auto p-4">
          <template v-if="selectedQuest">
            <h3 class="text-base font-bold" :class="questTitleColorClass(selectedQuest)">
              {{ selectedQuest.title }}
              <template v-if="selectedQuest.level != null"> — Level {{ selectedQuest.level }}</template>
            </h3>
            <p v-if="selectedQuest.category" class="mt-0.5 text-xs uppercase tracking-wide text-stone-500">
              {{ categoryLabel(selectedQuest.category) }} Quest
            </p>
            <p class="mt-2 text-sm text-stone-300">{{ selectedQuest.description }}</p>
            <div class="mt-3">
              <div class="text-xs font-semibold uppercase text-stone-500">Objectives</div>
              <ul class="mt-1 space-y-1">
                <li
                  v-for="(obj, i) in selectedQuest.objectives"
                  :key="i"
                  class="text-sm"
                >
                  {{ objectiveLabel(obj, selectedProgress?.[i] ?? 0) }}
                </li>
              </ul>
            </div>
            <div class="mt-4 flex gap-2">
              <template v-if="availableQuestIds.includes(selectedQuest.id)">
                <button
                  type="button"
                  class="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium hover:bg-amber-500"
                  @click="accept(selectedQuest.id)"
                >
                  Accept
                </button>
              </template>
              <template v-else-if="selectedQuest && activeQuests.some((a) => a.questId === selectedQuest?.id) && isSelectedComplete">
                <template v-if="atQuestGiver">
                  <template v-if="selectedQuest.rewardChoices && selectedQuest.rewardChoices.length > 0">
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="(choice, idx) in selectedQuest.rewardChoices"
                        :key="idx"
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded bg-green-700 px-3 py-1.5 text-sm font-medium hover:bg-green-600"
                        @click="selectedQuest ? turnIn(selectedQuest.id, idx) : undefined"
                      >
                        <img
                          v-if="choice.items && choice.items.length > 0"
                          :src="getBlockIcon(choice.items[0].type)"
                          :alt="getBlockLabel(choice.items[0].type)"
                          class="h-4 w-4 rounded object-contain"
                        />
                        <span>{{ choice.items?.[0] ? getBlockLabel(choice.items[0].type) : `Option ${idx + 1}` }}</span>
                      </button>
                    </div>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="rounded bg-green-700 px-3 py-1.5 text-sm font-medium hover:bg-green-600"
                    @click="selectedQuest ? turnIn(selectedQuest.id) : undefined"
                  >
                    Turn in
                  </button>
                </template>
                <p v-else class="text-sm text-amber-200/90">
                  Return to the quest giver to turn in.
                </p>
              </template>
              <template v-if="selectedQuest && activeQuests.some((a) => a.questId === selectedQuest?.id) && onToggleTrack">
                <button
                  type="button"
                  class="rounded border border-stone-500 bg-stone-700 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-600"
                  :title="isTracked(selectedQuest.id) ? 'Remove from tracker' : 'Show on HUD tracker'"
                  @click="selectedQuest ? onToggleTrack(selectedQuest.id) : undefined"
                >
                  {{ isTracked(selectedQuest.id) ? 'Untrack' : 'Track' }}
                </button>
              </template>
              <template v-if="selectedQuest && activeQuests.some((a) => a.questId === selectedQuest?.id) && onAbort">
                <button
                  type="button"
                  class="rounded border border-stone-500 bg-stone-700 px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-600"
                  @click="selectedQuest ? abort(selectedQuest.id) : undefined"
                >
                  Abort
                </button>
              </template>
            </div>
            <div
              v-if="selectedReward && (selectedReward.xp || selectedReward.gold || (selectedReward.items?.length ?? 0) > 0 || (selectedQuest?.rewardChoices?.length ?? 0) > 0)"
              class="mt-2 text-xs text-stone-500"
            >
              Reward:
              <template v-if="selectedReward.xp">{{ selectedReward.xp }} XP</template>
              <template v-if="selectedReward.xp && (selectedReward.gold || (selectedReward.items?.length ?? 0) > 0 || (selectedQuest?.rewardChoices?.length ?? 0) > 0)">, </template>
              <template v-if="selectedReward.gold">{{ selectedReward.gold }} silver</template>
              <template v-if="(selectedQuest?.rewardChoices?.length ?? 0) > 0">
                <template v-if="selectedReward.xp || selectedReward.gold">, </template>
                <span class="inline-flex flex-wrap items-center gap-1 align-middle">
                  one of
                  <span
                    v-for="(choice, cIdx) in selectedQuest.rewardChoices"
                    :key="cIdx"
                    class="inline-flex items-center gap-0.5"
                  >
                    <template v-if="choice.items && choice.items.length > 0">
                      <img
                        :src="getBlockIcon(choice.items[0].type)"
                        :alt="getBlockLabel(choice.items[0].type)"
                        class="h-5 w-5 rounded object-contain"
                      />
                      <span>{{ getBlockLabel(choice.items[0].type) }}</span>
                    </template>
                    <span v-if="cIdx < (selectedQuest.rewardChoices?.length ?? 0) - 1" class="mx-0.5">or</span>
                  </span>
                </span>
              </template>
              <template v-else-if="(selectedReward.items?.length ?? 0) > 0">
                <template v-if="selectedReward.xp || selectedReward.gold">, </template>
                <span class="inline-flex flex-wrap items-center gap-1 align-middle">
                  <span
                    v-for="(it, i) in selectedReward.items"
                    :key="it.type + String(i)"
                    class="group relative inline-flex"
                  >
                    <img
                      :src="getBlockIcon(it.type)"
                      :alt="getBlockLabel(it.type)"
                      class="h-6 w-6 shrink-0 rounded border border-stone-600 object-contain bg-stone-800"
                    />
                    <div
                      class="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded border border-stone-600 bg-stone-800 px-2 py-1.5 text-left text-xs text-stone-200 shadow-lg opacity-0 transition-opacity duration-150 pointer-events-none group-hover:opacity-100"
                    >
                      <div
                        v-for="(line, lineIdx) in getRewardItemTooltipLines(it.type, it.count)"
                        :key="lineIdx"
                      >
                        {{ line }}
                      </div>
                    </div>
                  </span>
                </span>
              </template>
            </div>
          </template>
          <p v-else class="text-sm text-stone-500">Select a quest.</p>
        </div>
      </div>
    </div>
  </div>
</template>
