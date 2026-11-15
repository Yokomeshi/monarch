// From walls detected in the plan image (pixels) to walls in the model (metres).

import { createWall, type Wall, type WallProps } from '../model/walls'
import type { DetectedWall, DetectOptions } from './detectWalls'
import { pixelToWorld, type PlanFrame } from './geometry'

/**
 * What counts as a wall on a plan at this scale. Stroke thickness is judged in pixels,
 * since it is the drawing's line weights that tell walls from annotation; lengths and
 * door gaps are real sizes.
 */
export function detectOptions(metresPerPx: number): DetectOptions {
  return {
    minThickness: 4,
    minLength: 0.5 / metresPerPx, // nothing shorter than half a metre is a wall worth tracing
    maxGap: 2.5 / metresPerPx, // doors and windows are drawn as gaps, and a window can be this wide; a wider gap is a real break
  }
}

/**
 * The walls that are not thick, judged against the thickest one: thinner than half of it.
 * On a plan with a heavy outer shell these are the partitions, and with them the stairs,
 * fixtures and other thin lines that detection takes for walls.
 */
export function thinWalls(walls: Wall[]): Wall[] {
  const thickest = Math.max(...walls.map((w) => w.thickness))
  return walls.filter((w) => w.thickness < thickest / 2)
}

/** Model walls for the detected ones: the drawing's position and thickness, and `props` for the rest. */
export function toWalls(detected: DetectedWall[], frame: PlanFrame, props: WallProps): Wall[] {
  return detected.map((d) =>
    createWall(pixelToWorld(d.start, frame), pixelToWorld(d.end, frame), {
      ...props,
      thickness: Math.round(d.thickness * frame.metresPerPx * 1000) / 1000, // to the millimetre
    }),
  )
}
