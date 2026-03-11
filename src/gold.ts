/**
 * Player gold (money) for NPC trading. Wallet-style: a single non-negative integer, persisted in save.
 */

let playerGold = 0

let onGoldChange: (() => void) | null = null

/** Registers or clears the callback invoked whenever gold changes. */
export function setOnGoldChange(cb: (() => void) | null): void {
  onGoldChange = cb
}

function notify(): void {
  onGoldChange?.()
}

/** Returns current gold amount (non-negative integer). */
export function getGold(): number {
  return playerGold
}

/**
 * Sets gold to the given amount (e.g. on load). Clamps to non-negative integer.
 */
export function setGold(amount: number): void {
  const value = Math.max(0, Math.floor(amount))
  if (value !== playerGold) {
    playerGold = value
    notify()
  }
}

/**
 * Adds gold. Use for selling items or rewards.
 */
export function addGold(amount: number): void {
  if (amount <= 0) return
  playerGold = Math.max(0, playerGold + Math.floor(amount))
  notify()
}

/**
 * Spends gold if the player has enough.
 * @returns true if the amount was deducted, false if insufficient gold
 */
export function spendGold(amount: number): boolean {
  const value = Math.floor(amount)
  if (value <= 0 || value > playerGold) return false
  playerGold -= value
  notify()
  return true
}
