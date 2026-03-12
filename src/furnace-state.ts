/**
 * Furnace state: input, fuel, output slots and smelting progress.
 * Used by the Furnace overlay.
 */
import type { BlockType } from './types'
import { getSmeltingRecipe, getFuelBurnTime } from './smelting'
import { MAX_STACK_SIZE } from './constants'

export interface FurnaceSlot {
  type: BlockType | null
  count: number
}

const inputSlot: FurnaceSlot = { type: null, count: 0 }
const fuelSlot: FurnaceSlot = { type: null, count: 0 }
const outputSlot: FurnaceSlot = { type: null, count: 0 }

let burnTimeRemaining = 0
let cookProgress = 0

let onChange: (() => void) | null = null

export function setOnFurnaceChange(cb: (() => void) | null): void {
  onChange = cb
}

function notify(): void {
  onChange?.()
}

export function getFurnaceInput(): FurnaceSlot {
  return { type: inputSlot.type, count: inputSlot.count }
}

export function getFurnaceFuel(): FurnaceSlot {
  return { type: fuelSlot.type, count: fuelSlot.count }
}

export function getFurnaceOutput(): FurnaceSlot {
  return { type: outputSlot.type, count: outputSlot.count }
}

export function setFurnaceInput(type: BlockType | null, count: number): void {
  inputSlot.type = type
  inputSlot.count = Math.max(0, Math.min(MAX_STACK_SIZE, Math.floor(count)))
  if (inputSlot.count === 0) inputSlot.type = null
  notify()
}

export function setFurnaceFuel(type: BlockType | null, count: number): void {
  fuelSlot.type = type
  fuelSlot.count = Math.max(0, Math.min(MAX_STACK_SIZE, Math.floor(count)))
  if (fuelSlot.count === 0) fuelSlot.type = null
  notify()
}

export function setFurnaceOutput(type: BlockType | null, count: number): void {
  outputSlot.type = type
  outputSlot.count = Math.max(0, Math.min(MAX_STACK_SIZE, Math.floor(count)))
  if (outputSlot.count === 0) outputSlot.type = null
  notify()
}

/** Returns current burn time remaining in seconds. */
export function getFurnaceBurnTimeRemaining(): number {
  return burnTimeRemaining
}

/** Returns current cook progress in seconds (0 until recipe completes). */
export function getFurnaceCookProgress(): number {
  return cookProgress
}

/**
 * Ticks furnace logic; call every frame with dt when furnace is open or every few seconds when chunk is loaded.
 * Burns fuel, advances cooking, produces output.
 */
export function tickFurnace(dt: number): void {
  const recipe = getSmeltingRecipe(inputSlot.type)
  const canSmelt =
    recipe &&
    inputSlot.count > 0 &&
    (outputSlot.type === null || (outputSlot.type === recipe.output && outputSlot.count + recipe.outputCount <= MAX_STACK_SIZE))

  if (burnTimeRemaining <= 0 && fuelSlot.count > 0 && fuelSlot.type) {
    const burn = getFuelBurnTime(fuelSlot.type)
    if (burn > 0) {
      fuelSlot.count--
      if (fuelSlot.count === 0) fuelSlot.type = null
      burnTimeRemaining = burn
      notify()
    }
  }

  if (burnTimeRemaining > 0 && canSmelt && recipe) {
    burnTimeRemaining = Math.max(0, burnTimeRemaining - dt)
    cookProgress += dt
    if (cookProgress >= recipe.cookTimeSeconds) {
      cookProgress = 0
      inputSlot.count--
      if (inputSlot.count === 0) inputSlot.type = null
      if (outputSlot.type === recipe.output) outputSlot.count += recipe.outputCount
      else {
        outputSlot.type = recipe.output
        outputSlot.count = recipe.outputCount
      }
      notify()
    }
    notify()
  } else {
    cookProgress = 0
  }
}
