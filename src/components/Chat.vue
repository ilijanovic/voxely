<script setup lang="ts">
/**
 * Chat panel: T/Enter to open, Escape to close. Subscribes to multiplayer chat (join/leave/chat/system); lines starting with / run debug commands.
 */
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { subscribeChat, sendChat, type ChatMessage } from '../multiplayer'
import { runCommand } from '../debug-commands'

const open = ref(false)
const messages = ref<ChatMessage[]>([])
const input = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const maxMessages = 100

const unsubscribe = ref<(() => void) | null>(null)

const emit = defineEmits<{ open: []; close: [] }>()

/** T/Enter opens chat and exits pointer lock; Escape closes. Capture-phase so it runs before game input. */
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'KeyT' || e.key === 'Enter') {
    if (!open.value) {
      e.preventDefault()
      e.stopPropagation()
      open.value = true
      document.exitPointerLock()
    }
  }
  if (e.code === 'Escape' && open.value) {
    e.preventDefault()
    e.stopPropagation()
    open.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) emit('open')
  else emit('close')
  if (isOpen) {
    nextTick(() => inputEl.value?.focus())
  }
})

onMounted(() => {
  unsubscribe.value = subscribeChat((msg) => {
    messages.value.push(msg)
    if (messages.value.length > maxMessages) messages.value.shift()
  })
  document.addEventListener('keydown', onKeyDown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown, true)
  unsubscribe.value?.()
})

/** Opens chat panel and releases pointer lock so user can type. */
function openChat() {
  open.value = true
  document.exitPointerLock()
}

/** Closes chat panel. */
function closeChat() {
  open.value = false
}

/** Sends input as chat (or runs /command if line starts with /). Clears input after send. */
function submit() {
  const t = input.value.trim()
  if (!t) return
  if (t.startsWith('/')) {
    const result = runCommand(t)
    if (result.handled) {
      if (result.message) {
        messages.value.push({ type: 'system', text: result.message, time: Date.now() })
      }
      input.value = ''
      return
    }
  }
  sendChat(t)
  input.value = ''
}

/** Renders a chat message as a single line (join/leave/chat/system). */
function formatMessage(msg: ChatMessage): string {
  switch (msg.type) {
    case 'join':
      return `${msg.username} joined.`
    case 'leave':
      return `${msg.username} left the game.`
    case 'chat':
      return `${msg.username}: ${msg.text}`
    case 'system':
      return msg.text
    default:
      return ''
  }
}

/** Returns Tailwind class for message color by type (join/leave green, system gray, chat white). */
function messageClass(msg: ChatMessage): string {
  switch (msg.type) {
    case 'join':
    case 'leave':
      return 'text-green-400/90'
    case 'system':
      return 'text-gray-400'
    case 'chat':
    default:
      return 'text-white'
  }
}
</script>

<template>
  <!-- Positioned to the right of the Health/XP/Hunger panel (w-48 + left-3) so they do not overlap -->
  <div class="fixed left-52 bottom-20 z-20 flex flex-col gap-1">
    <!-- Toggle button -->
    <button
      v-if="!open"
      type="button"
      class="rounded-[var(--ui-radius-md)] border-2 px-3 py-2 text-sm font-medium shadow focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-2 focus:ring-offset-transparent"
      style="border-color: var(--ui-border); background: var(--ui-bg); color: var(--ui-text)"
      aria-label="Open chat"
      title="Chat (T or Enter)"
      @click="openChat"
    >
      Chat
    </button>

    <!-- Chat panel -->
    <div
      v-else
      class="flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-[var(--ui-radius-lg)] border-2 shadow-lg"
      style="border-color: var(--ui-border); background: rgba(0, 0, 0, 0.85)"
    >
      <div class="flex items-center justify-between border-b border-[#3a3a3a] px-3 py-2">
        <span class="font-semibold text-[var(--ui-text)]">Chat</span>
        <button
          type="button"
          class="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]"
          aria-label="Close chat"
          @click="closeChat"
        >
          ✕
        </button>
      </div>
      <div
        class="flex max-h-48 min-h-32 flex-1 flex-col overflow-y-auto p-2 text-sm"
        style="font-family: var(--ui-font)"
      >
        <div v-for="(msg, i) in messages" :key="i" :class="['wrap-break-word', messageClass(msg)]">
          {{ formatMessage(msg) }}
        </div>
        <div v-if="messages.length === 0" class="text-gray-500">
          No messages. Type something or wait for someone to join.
        </div>
      </div>
      <form class="border-t border-[#3a3a3a] p-2" @submit.prevent="submit">
        <input
          ref="inputEl"
          v-model="input"
          type="text"
          class="w-full rounded-[var(--ui-radius-sm)] border px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]"
          style="border-color: var(--ui-border); background: #1a1a1a"
          placeholder="Enter message… (Enter to send)"
          maxlength="500"
          autocomplete="off"
        />
      </form>
    </div>
  </div>
</template>
