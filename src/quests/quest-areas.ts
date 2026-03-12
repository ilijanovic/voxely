/**
 * Quest area definitions for "reach" objectives. When the player enters an area (distance <= radius),
 * notifyReach(areaId) is called to advance reach objectives.
 */
import {
  FIRST_SPAWN_VILLAGE_ID,
  FIRST_SPAWN_VILLAGE_CENTER,
  VILLAGE_AREA_FLATTEN_RADIUS,
} from '../world-pois'

export interface QuestArea {
  areaId: string
  x: number
  z: number
  radius: number
}

/** Areas that can be used in reach objectives. */
export const QUEST_AREAS: QuestArea[] = [
  {
    areaId: FIRST_SPAWN_VILLAGE_ID,
    x: FIRST_SPAWN_VILLAGE_CENTER.x,
    z: FIRST_SPAWN_VILLAGE_CENTER.z,
    radius: VILLAGE_AREA_FLATTEN_RADIUS,
  },
]
