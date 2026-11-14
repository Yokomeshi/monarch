// Cutaway view: walls are drawn cut off at a fixed height so the rooms can be seen into.
// Display only: the walls' real heights are untouched.

import type { Opening } from './openings'
import type { Wall } from './walls'

/** Height of the cut, in metres: above furniture such as tables, below eye level. */
export const CUT_HEIGHT = 1.2

/** The wall as drawn in cutaway view. A wall already below the cut is returned unchanged. */
export function cutWall(wall: Wall, cut: number): Wall {
  return wall.height > cut ? { ...wall, height: cut } : wall
}

/**
 * The openings to draw in a wall cut at `cut`: those that start below it.
 * Drawing fits each one to the cut wall, which trims its top.
 */
export function cutOpenings(openings: Opening[], cut: number): Opening[] {
  return openings.filter((o) => o.sill < cut)
}
