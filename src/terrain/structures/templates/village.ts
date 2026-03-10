/**
 * Village structure template: one small house (oak_planks walls, cobblestone floor).
 */
import type { BlockType } from "../../../types";

const WIDTH_X = 5;
const WIDTH_Z = 4;
const HEIGHT = 3;

export function getVillageBlocks(ox: number, oy: number, oz: number): Array<{ bx: number; by: number; bz: number; block: BlockType }> {
  const out: Array<{ bx: number; by: number; bz: number; block: BlockType }> = [];
  for (let dx = 0; dx < WIDTH_X; dx++) {
    for (let dz = 0; dz < WIDTH_Z; dz++) {
      for (let dy = 0; dy < HEIGHT; dy++) {
        const bx = ox + dx;
        const by = oy + dy;
        const bz = oz + dz;
        const isFloor = dy === 0;
        const isWall =
          dx === 0 || dx === WIDTH_X - 1 || dz === 0 || dz === WIDTH_Z - 1;
        const block: BlockType = isFloor ? "cobblestone" : isWall ? "oak_planks" : "air";
        if (block !== "air") out.push({ bx, by, bz, block });
      }
    }
  }
  return out;
}
