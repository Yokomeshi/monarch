// From gaps detected in the plan's walls (pixels) to doors and windows in the model (metres).

import type { GapKind } from '../ai/jevOpenings'
import { EDGE_CLEARANCE, STANDARD, editOpening, type Opening } from '../model/openings'
import { wallLength, type Vec2, type Wall } from '../model/walls'
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
  /** Where the gap is on the plan image, for a model to look at. A gap marked by hand has none. */
  crop?: Crop
}

/** A part of the plan image, with one rectangle on it singled out. */
export interface Crop {
  /** The part of the image to show, in image pixels. It may overhang the image. */
  square: { x: number; y: number; size: number }
  /** A rectangle to frame with red corner marks, in image pixels: what the question is about. */
  mark: { x: number; y: number; width: number; height: number }
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


/**
 * The rectangle that marks a gap on the crop, in image pixels, so the model knows which stretch
 * of which wall is meant: a crop often shows several walls and openings.
 */
export function gapMark(gap: DetectedGap, wall: DetectedWall): { x: number; y: number; width: number; height: number } {
  const length = pixelDistance(wall.start, wall.end)
  const along = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length }
  const from = { x: wall.start.x + along.x * gap.start, y: wall.start.y + along.y * gap.start }
  const span = gap.end - gap.start
  // To each side of the wall: clear of a thick wall's faces, and half the gap's width, which takes in most of a door's swing.
  const reach = Math.max(wall.thickness * 0.75, span / 2)
  // Walls are horizontal or vertical, so the mark is an upright rectangle.
  const horizontal = Math.abs(along.x) > Math.abs(along.y)
  return horizontal
    ? { x: Math.min(from.x, from.x + along.x * span), y: from.y - reach, width: span, height: 2 * reach }
    : { x: from.x - reach, y: Math.min(from.y, from.y + along.y * span), width: 2 * reach, height: span }
}

/**
 * Below this confidence an identification is not acted on. On a real scanned plan Jev's right
 * answers came with confidence from about 0.45 to 0.8, so a stricter limit would discard most of them;
 * the user checks the result, and can change any gap with a click.
 */
export const MIN_CONFIDENCE = 0.5

/** Doors and windows for the identified gaps, ready to add with the walls. */
export function openingsFromGaps(suggestions: GapSuggestion[], walls: Wall[]): Opening[] {
  const openings: Opening[] = []
  for (const s of suggestions) {
    if (s.kind === null || s.kind === 'none' || s.confidence < MIN_CONFIDENCE) continue
    const wall = walls.find((w) => w.id === s.wallId)
    if (!wall) continue
    // A doorway with no leaf drawn is a door: the model has no separate type for it.
    const type = s.kind === 'window' ? 'window' : 'door'
    // Made at the gap's own width from the start. Going by way of a standard-width opening would
    // lose a gap on a wall too short for one, or next to another opening.
    const opening: Opening = {
      id: crypto.randomUUID(), wallId: wall.id, type, ...STANDARD[type], position: s.position, width: s.width, hinge: 'start', swing: 'left',
    }
    const fitted = editOpening(opening, {}, wall, openings)
    if (fitted) openings.push(fitted)
  }
  return openings
}

/** What both functions return: the suggestion with the change made. */
export interface MarkedSuggestion {
  walls: Wall[]
  gaps: GapSuggestion[]
}

/** Slack in comparing lengths in metres, so that rounding in the arithmetic does not decide a limit case. */
const EPSILON = 1e-9

/** Metres from the wall's start to `p`, along the wall, and from the wall's centre-line to `p`, across it. */
function alongAndAcross(wall: Wall, p: Vec2): { along: number; across: number } {
  const length = wallLength(wall)
  const ux = (wall.end.x - wall.start.x) / length
  const uz = (wall.end.z - wall.start.z) / length
  const dx = p.x - wall.start.x
  const dz = p.z - wall.start.z
  return { along: dx * ux + dz * uz, across: Math.abs(dx * uz - dz * ux) }
}

/**
 * Mark a door or window by hand on a suggested wall, where `at` (a point on or near the wall) is.
 * Null if there is no such wall, or no room for it there.
 */
export function markGap(walls: Wall[], gaps: GapSuggestion[], wallId: string, at: Vec2, kind: 'door' | 'window'): MarkedSuggestion | null {
  const wall = walls.find((w) => w.id === wallId)
  if (!wall) return null
  const length = wallLength(wall)
  // The standard width, or what a short wall has room for.
  const width = Math.min(STANDARD[kind].width, length - 2 * EDGE_CLEARANCE)
  if (width < MIN_OPENING - EPSILON) return null
  // Where the wall was clicked, or as near to it as the gap fits.
  const reach = EDGE_CLEARANCE + width / 2
  const position = Math.max(reach, Math.min(length - reach, alongAndAcross(wall, at).along))
  const overlaps = gaps.some((g) => g.wallId === wallId && Math.abs(g.position - position) < (g.width + width) / 2 - EPSILON)
  if (overlaps) return null
  return { walls, gaps: [...gaps, { wallId, position, width, kind, confidence: 1 }] }
}

/** Walls within this angle of each other, in degrees, are parallel. */
const PARALLEL_DEGREES = 3
/** The longest space between two walls, in metres, that is bridged as one opening. */
const MAX_BRIDGE = 3
/** A click this far to the side of thin walls, in metres, is still in the space between them. */
const MIN_BRIDGE_REACH = 0.3

/**
 * Join two suggested walls that line up, across the empty space `at` lies in, and mark that
 * space as a door or window: for a doorway where detection left a break between two pieces of wall.
 * Null if `at` is not in such a space.
 */
export function bridgeWalls(walls: Wall[], gaps: GapSuggestion[], at: Vec2, kind: 'door' | 'window'): MarkedSuggestion | null {
  // Everything is measured along the kept wall, from its start: it runs from 0 to its length.
  // The space is from `from` to `to`, and the joined wall starts at `start`.
  type Bridge = { kept: Wall; removed: Wall; joined: Wall; from: number; to: number; start: number }
  let best = null as Bridge | null
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      // The longer wall is kept.
      const [kept, removed] = wallLength(walls[j]) > wallLength(walls[i]) ? [walls[j], walls[i]] : [walls[i], walls[j]]
      const length = wallLength(kept)
      const removedLength = wallLength(removed)
      if (removedLength === 0) continue
      const s = alongAndAcross(kept, removed.start)
      const e = alongAndAcross(kept, removed.end)
      // The sine of the angle between the walls.
      if (Math.abs(s.across - e.across) / removedLength > Math.sin((PARALLEL_DEGREES * Math.PI) / 180)) continue
      const thickness = Math.max(kept.thickness, removed.thickness)
      const [near, far] = Math.abs(s.along - length / 2) < Math.abs(e.along - length / 2) ? [s, e] : [e, s]
      if (near.across > thickness / 2 + EPSILON) continue
      const farEnd = far === s ? removed.start : removed.end
      let candidate: Bridge
      if (near.along >= length && far.along > near.along) {
        candidate = { kept, removed, joined: { ...kept, end: farEnd }, from: length, to: near.along, start: 0 }
      } else if (near.along <= 0 && far.along < near.along) {
        candidate = { kept, removed, joined: { ...kept, start: farEnd }, from: near.along, to: 0, start: far.along }
      } else continue // The walls run side by side.
      const space = candidate.to - candidate.from
      if (space < MIN_OPENING - EPSILON || space > MAX_BRIDGE + EPSILON) continue
      const { along, across } = alongAndAcross(kept, at)
      if (along <= candidate.from || along >= candidate.to || across > Math.max(thickness, MIN_BRIDGE_REACH)) continue
      if (!best || space < best.to - best.from) best = candidate
    }
  }
  if (!best) return null
  const { kept, removed, joined, from, to, start } = best
  const removedStart = alongAndAcross(kept, removed.start).along
  const removedEnd = alongAndAcross(kept, removed.end).along
  const removedLength = wallLength(removed)
  const rehomed = gaps.map((g) => {
    if (g.wallId === kept.id) return start === 0 ? g : { ...g, position: g.position - start }
    if (g.wallId !== removed.id) return g
    const along = removedStart + ((removedEnd - removedStart) * g.position) / removedLength
    return { ...g, wallId: kept.id, position: along - start }
  })
  return {
    walls: walls.filter((w) => w !== removed).map((w) => (w === kept ? joined : w)),
    gaps: [...rehomed, { wallId: kept.id, position: (from + to) / 2 - start, width: to - from, kind, confidence: 1 }],
  }
}
