// From gaps detected in the plan's walls (pixels) to doors and windows in the model (metres).

import type { GapKind } from '../ai/jevOpenings'
import { editOpening, openingAt, type Opening } from '../model/openings'
import type { Wall } from '../model/walls'
import type { DetectedGap, DetectedWall } from './detectWalls'
import { pixelDistance } from './geometry'

/** A gap found in a suggested wall, in the model's metres, and what it has been identified as. */
export interface GapSuggestion {
  wallId: string
  /** Metres from the wall's start to the middle of the gap. */
  position: number
  /** Width of the gap in metres. */
  width: number
  /** What the gap is; null until it has been identified. */
  kind: GapKind | null
  /** Confidence in `kind`, 0 to 1; 0 while kind is null. */
  confidence: number
}

/** Narrower than this, in metres, a gap is a break in the drawing (a dimension line crossing the wall, say), not an opening. */
export const MIN_OPENING = 0.4

/** The gaps wide enough to be a door or a window. */
export function openingGaps(gaps: DetectedGap[], metresPerPx: number): DetectedGap[] {
  return gaps.filter((gap) => (gap.end - gap.start) * metresPerPx >= MIN_OPENING)
}

/** Gaps in metres, attached to the model walls made from the same detection. `walls[i]` is the model wall for detected wall i. */
export function gapSuggestions(gaps: DetectedGap[], walls: Wall[], metresPerPx: number): GapSuggestion[] {
  return gaps.map((g) => ({
    wallId: walls[g.wall].id,
    position: ((g.start + g.end) / 2) * metresPerPx,
    width: (g.end - g.start) * metresPerPx,
    kind: null,
    confidence: 0,
  }))
}

/** The crop is this many times the gap's width: a door's swing arc reaches one door-width from the wall. */
const CROP_WIDTHS = 2.5
/** The crop is at least this many metres across, so a narrow gap still shows its surroundings. */
const MIN_CROP = 2.4

/** The square of the image to show a model so it can tell what a gap is: centred on the gap, in image pixels. */
export function cropSquare(gap: DetectedGap, wall: DetectedWall, metresPerPx: number): { x: number; y: number; size: number } {
  const t = (gap.start + gap.end) / 2 / pixelDistance(wall.start, wall.end)
  const size = Math.max(CROP_WIDTHS * (gap.end - gap.start), MIN_CROP / metresPerPx)
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t - size / 2,
    y: wall.start.y + (wall.end.y - wall.start.y) * t - size / 2,
    size,
  }
}

/** Below this confidence an identification is not acted on. */
export const MIN_CONFIDENCE = 0.8

/** Doors and windows for the identified gaps, ready to add with the walls. */
export function openingsFromGaps(suggestions: GapSuggestion[], walls: Wall[]): Opening[] {
  const openings: Opening[] = []
  for (const s of suggestions) {
    if (s.kind === null || s.kind === 'none' || s.confidence < MIN_CONFIDENCE) continue
    const wall = walls.find((w) => w.id === s.wallId)
    if (!wall) continue
    // A doorway with no leaf drawn is a door: the model has no separate type for it.
    const standard = openingAt(wall, openings, s.kind === 'window' ? 'window' : 'door', s.position)
    if (!standard) continue
    // The position again, as fitting the standard width may have moved it.
    openings.push(editOpening(standard, { width: s.width, position: s.position }, wall, openings) ?? standard)
  }
  return openings
}
