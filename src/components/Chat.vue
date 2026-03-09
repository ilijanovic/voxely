<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { subscribeChat, sendChat, type ChatMessage } from "../multiplayer";

const open = ref(false);
const messages = ref<ChatMessage[]>([]);
const input = ref("");
const inputEl = ref<HTMLInputElement | null>(null);
const maxMessages = 100;

const unsubscribe = ref<(() => void) | null>(null);

const emit = defineEmits<{ open: []; close: [] }>();

function onKeyDown(e: KeyboardEvent) {
  if (e.code === "KeyT" || e.key === "Enter") {
    if (!open.value) {
      e.preventDefault();
      e.stopPropagation();
      open.value = true;
      document.exitPointerLock();
    }
  }
  if (e.code === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    open.value = false;
  }
}

watch(open, (isOpen) => {
  if (isOpen) emit("open");
  else emit("close");
  if (isOpen) {
    nextTick(() => inputEl.value?.focus());
  }
});

onMounted(() => {
  unsubscribe.value = subscribeChat((msg) => {
    messages.value.push(msg);
    if (messages.value.length > maxMessages) messages.value.shift();
  });
  document.addEventListener("keydown", onKeyDown, true);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeyDown, true);
  unsubscribe.value?.();
});

function openChat() {
  open.value = true;
  document.exitPointerLock();
}

function closeChat() {
  open.value = false;
}

function submit() {
  const t = input.value.trim();
  if (t) {
    sendChat(t);
    input.value = "";
  }
}

function formatMessage(msg: ChatMessage): string {
  switch (msg.type) {
    case "join":
      return `${msg.username} joined.`;
    case "leave":
      return `${msg.username} left the game.`;
    case "chat":
      return `${msg.username}: ${msg.text}`;
    case "system":
      return msg.text;
    default:
      return "";
  }
}

function messageClass(msg: ChatMessage): string {
  switch (msg.type) {
    case "join":
    case "leave":
      return "text-green-400/90";
    case "system":
      return "text-gray-400";
    case "chat":
    default:
      return "text-white";
  }
}
</script>

<template>
  <div class="fixed left-3 bottom-20 z-20 flex flex-col gap-1">
    <!-- Toggle button -->
    <button
      v-if="!open"
      type="button"
      class="rounded-md border-2 border-[#4a4a4a] bg-black/70 px-3 py-2 text-sm font-medium text-white shadow hover:bg-black/90 hover:border-[#5a5a5a] focus:outline-none focus:ring-2 focus:ring-white/50"
      aria-label="Open chat"
      title="Chat (T or Enter)"
      @click="openChat"
    >
      Chat
    </button>

    <!-- Chat panel -->
    <div
      v-else
      class="flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-lg border-2 border-[#4a4a4a] bg-black/85 shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-[#3a3a3a] px-3 py-2">
        <span class="font-semibold text-white">Chat</span>
        <button
          type="button"
          class="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Close chat"
          @click="closeChat"
        >
          ✕
        </button>
      </div>
      <div class="flex max-h-48 min-h-32 flex-1 flex-col overflow-y-auto p-2 font-sans text-sm">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['wrap-break-word', messageClass(msg)]"
        >
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
          class="w-full rounded border border-[#4a4a4a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#6a6a6a] focus:outline-none"
          placeholder="Enter message… (Enter to send)"
          maxlength="500"
          autocomplete="off"
        />
      </form>
    </div>
  </div>
</template>
