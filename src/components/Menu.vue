<script setup lang="ts">
defineProps<{
  onSingleplayer: () => void;
  onMultiplayer: () => void;
}>();
</script>

<template>
  <div class="menu-overlay">
    <div class="menu-card">
      <h1 class="menu-title">Start game</h1>
      <p class="menu-subtitle">Choose a game mode</p>
      <div class="menu-buttons">
        <button
          type="button"
          class="menu-btn menu-btn-single"
          @click="onSingleplayer"
        >
          Singleplayer
        </button>
        <button
          type="button"
          class="menu-btn menu-btn-multi"
          @click="onMultiplayer"
        >
          Multiplayer
        </button>
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
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.menu-card {
  background: rgba(20, 25, 40, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2.5rem 3rem;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.menu-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.menu-subtitle {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2rem;
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 220px;
}

.menu-btn {
  padding: 1rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.menu-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.menu-btn:active {
  transform: translateY(0);
}

.menu-btn-single {
  background: linear-gradient(180deg, #4a7c59 0%, #3d6b4a 100%);
  color: #fff;
}

.menu-btn-single:hover {
  background: linear-gradient(180deg, #5a8f69 0%, #4a7c59 100%);
}

.menu-btn-multi {
  background: linear-gradient(180deg, #4a6fa5 0%, #3a5a85 100%);
  color: #fff;
}

.menu-btn-multi:hover {
  background: linear-gradient(180deg, #5a7fb5 0%, #4a6fa5 100%);
}
</style>
