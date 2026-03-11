<script setup lang="ts">
/**
 * Quest Log: active quests with progress, available to accept, and turn-in for completed.
 */
import { ref, computed, watch } from 'vue'
import type { Quest, QuestObjective, ActiveQuest } from '../quests/types'
import { getQuestById } from '../quests/quest-registry'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  activeQuests: ActiveQuest[]
  availableQuestIds: string[]
  completedQuestIds: string[]
  onAccept: (questId: string) => boolean
  onTurnIn: (questId: string) => boolean
}>()

/** Selected quest id for detail (active or available). */
const selectedId = ref<string | null>(null)

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

function objectiveLabel(obj: QuestObjective, progress: number): string {
  if (obj.type === 'kill' || obj.type === 'collect') {
    return `${obj.label}: ${progress}/${obj.count}`
  }
  return `${obj.label}: ${progress >= 1 ? 'Done' : '—'}`
}

function accept(questId: string) {
  if (props.onAccept(questId)) selectedId.value = questId
}

function turnIn(questId: string) {
  if (props.onTurnIn(questId)) {
    selectedId.value = null
    emit('close')
  }
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
            <button
              v-for="a in activeQuests"
              :key="a.questId"
              type="button"
              class="mt-1 block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-stone-700"
              :class="{ 'bg-stone-700': selectedId === a.questId }"
              @click="selectedId = a.questId"
            >
              {{ getQuestById(a.questId)?.title ?? a.questId }}
            </button>
          </div>
          <div v-if="availableQuestIds.length > 0">
            <div class="text-xs font-semibold uppercase text-amber-400">Available</div>
            <button
              v-for="id in availableQuestIds"
              :key="id"
              type="button"
              class="mt-1 block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-stone-700"
              :class="{ 'bg-stone-700': selectedId === id }"
              @click="selectedId = id"
            >
              {{ getQuestById(id)?.title ?? id }}
            </button>
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
            <h3 class="text-base font-bold text-amber-200">{{ selectedQuest.title }}</h3>
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
              <template v-else-if="activeQuests.some((a) => a.questId === selectedQuest.id) && isSelectedComplete">
                <button
                  type="button"
                  class="rounded bg-green-700 px-3 py-1.5 text-sm font-medium hover:bg-green-600"
                  @click="turnIn(selectedQuest.id)"
                >
                  Turn in
                </button>
              </template>
            </div>
            <div v-if="selectedQuest.reward.xp" class="mt-2 text-xs text-stone-500">
              Reward: {{ selectedQuest.reward.xp }} XP
            </div>
          </template>
          <p v-else class="text-sm text-stone-500">Select a quest.</p>
        </div>
      </div>
    </div>
  </div>
</template>
