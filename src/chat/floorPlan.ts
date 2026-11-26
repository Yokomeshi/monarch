// Reading a floor plan image into walls in metres, for the read_floor_plan tool. The finding of
// walls and gaps is the editor's own (src/plan); this adds the scale and the text for the model.

import { detectPlan, type DetectedGap, type DetectedWall, type Raster } from '../plan/detectWalls'
import { detectOptions } from '../plan/suggestWalls'
import { openingGaps } from '../plan/suggestOpenings'
import { formatFeetInches } from './units'

/** A real length on the plan: the whole plan's width (across the image) or depth (down it), outer face to outer face. */
export interface Calibration {
  axis: 'width' | 'depth'
  metres: number
}

/** A gap in a wall wide enough for a door or window. Metres along the wall from its start. */
export interface PlanOpening {
  id: string
  position: number
  width: number
}

/** A wall in metres. x runs right across the image, z runs down it, and (0, 0) is the middle of the plan. */
export interface PlanWall {
  id: number
  start: [number, number]
  end: [number, number]
  thickness: number
  openings: PlanOpening[]
}

export interface PlanReading {
  /** What was found, in image pixels, for drawing over the plan. */
  walls: DetectedWall[]
  /** The gaps wide enough to be openings, by wall, in image pixels. */
  openings: DetectedGap[]
  /** The walls' outer size in pixels. */
  extentPx: { width: number; depth: number }
  /** Everything below needs the scale from a calibration. */
  metresPerPx?: number
  size?: { width: number; depth: number }
  plan?: PlanWall[]
}

/** Before the scale is known the plan is taken to be 20 m across, as the editor does. */
const PROVISIONAL_SPAN_M = 20

/** The outer edges of all the walls, in pixels. Walls here run straight across or straight down. */
function extentOf(walls: DetectedWall[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const { start, end, thickness } of walls) {
    const half = thickness / 2
    const across = start.y === end.y
    x0 = Math.min(x0, Math.min(start.x, end.x) - (across ? 0 : half))
    x1 = Math.max(x1, Math.max(start.x, end.x) + (across ? 0 : half))
    y0 = Math.min(y0, Math.min(start.y, end.y) - (across ? half : 0))
    y1 = Math.max(y1, Math.max(start.y, end.y) + (across ? half : 0))
  }
  return { x0, x1, y0, y1 }
}

const mm = (metres: number) => Math.round(metres * 1000) / 1000

/** The walls in the plan, and with a calibration, in metres. */
export function readPlan(raster: Raster, calibration?: Calibration): PlanReading {
  const span = Math.max(raster.width, raster.height)
  const first = detectPlan(raster, detectOptions(PROVISIONAL_SPAN_M / span))
  if (first.walls.length === 0) return { walls: [], openings: [], extentPx: { width: 0, depth: 0 } }

  // What counts as a wall depends on the scale (nothing under half a metre, doors up to 2.5 m wide),
  // so once a scale is known the walls are found again with it, and it is worked out again from them.
  let found = first
  let extent = extentOf(first.walls)
  let metresPerPx: number | undefined
  if (calibration) {
    const along = (e: typeof extent) => (calibration.axis === 'width' ? e.x1 - e.x0 : e.y1 - e.y0)
    metresPerPx = calibration.metres / along(extent)
    found = detectPlan(raster, detectOptions(metresPerPx))
    if (found.walls.length > 0) {
      extent = extentOf(found.walls)
      metresPerPx = calibration.metres / along(extent)
    }
  }
  const extentPx = { width: extent.x1 - extent.x0, depth: extent.y1 - extent.y0 }
  const reading: PlanReading = { walls: found.walls, openings: [], extentPx }
  if (metresPerPx === undefined) return reading

  const k = metresPerPx
  const [cx, cy] = [(extent.x0 + extent.x1) / 2, (extent.y0 + extent.y1) / 2]
  const at = (p: { x: number; y: number }): [number, number] => [mm((p.x - cx) * k), mm((p.y - cy) * k)]
  reading.openings = openingGaps(found.gaps, k)
  reading.metresPerPx = k
  reading.size = { width: mm(extentPx.width * k), depth: mm(extentPx.depth * k) }
  reading.plan = found.walls.map((w, i) => {
    const mine = reading.openings.filter((g) => g.wall === i)
    return {
      id: i + 1,
      start: at(w.start),
      end: at(w.end),
      thickness: mm(w.thickness * k),
      openings: mine.map((g, j) => ({ id: `${i + 1}.${j + 1}`, position: mm(((g.start + g.end) / 2) * k), width: mm((g.end - g.start) * k) })),
    }
  })
  return reading
}

const both = (m: number) => `${Number(m.toFixed(2))} m (${formatFeetInches(m)})`

/** What the model is told about the reading. */
export function describePlan(reading: PlanReading): string {
  const { walls, extentPx, plan, size } = reading
  if (walls.length === 0) {
    return 'No walls were found. This reader finds solid dark straight lines on a clean plan. It misses hollow (double-line), hatched and diagonal walls. Tell the user, and ask for the room sizes to build by hand instead.'
  }
  if (!plan || !size) {
    return [
      `Found ${walls.length} walls, spanning ${Math.round(extentPx.width)} x ${Math.round(extentPx.depth)} pixels (${Math.round(extentPx.width)} across, ${Math.round(extentPx.depth)} down).`,
      'The plan has no scale yet, so there are no sizes. Look for a dimension label or scale bar on the plan. If there is none, ask the user for one real length: the whole plan\'s outer width (across) or depth (down).',
      'Then call read_floor_plan again with overall_width_m or overall_depth_m.',
    ].join('\n')
  }
  const openings = plan.reduce((n, w) => n + w.openings.length, 0)
  return [
    `Found ${walls.length} walls and ${openings} openings. Overall, outer face to outer face: ${both(size.width)} wide (x) by ${both(size.depth)} deep (z).`,
    'The picture shows each wall numbered in orange and each opening numbered in blue (wall.opening). Check it against the plan. In metres, x runs across the plan, z down it, and (0, 0) is its middle.',
    'Pass this list to walls(). Decide for each opening whether it is a door or a window and add kind: "door" or "window".',
    JSON.stringify(plan),
  ].join('\n')
}
