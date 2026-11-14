// Doors and windows: openings cut into a wall. Like walls, they are data; the hole is derived.

import { wallLength, type Wall } from './walls'

export type OpeningType = 'door' | 'window'

export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  /** Distance along the wall's centreline from its start to the opening's centre, in metres. */
  position: number
  width: number
  height: number
  /** Height of the opening's bottom edge above the floor. 0 for a door. */
  sill: number
  /** Doors only: which jamb the leaf hangs from, the one nearer the wall's start or its end. */
  hinge: 'start' | 'end'
  /** Doors only: which side of the wall the leaf opens to, seen looking from the wall's start to its end. */
  swing: 'left' | 'right'
}

/** Openings stay this far from each end of the wall. */
export const EDGE_CLEARANCE = 0.1

const STANDARD: Record<OpeningType, Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
}

/** The opening adjusted to fit a wall of this length and height. Unchanged if it already fits. */
export function fitOpening(o: Opening, length: number, height: number): Opening {
  const width = Math.min(o.width, length - 2 * EDGE_CLEARANCE)
  const min = EDGE_CLEARANCE + width / 2
  const position = Math.min(Math.max(o.position, min), length - min)
  const sill = Math.min(o.sill, Math.max(0, height - EDGE_CLEARANCE))
  return { ...o, width, position, sill, height: Math.min(o.height, height - sill) }
}

const overlap = (a: Opening, b: Opening) => Math.abs(a.position - b.position) < (a.width + b.width) / 2 - 1e-9

/**
 * A standard door or window centred as near as it fits to `position` along the wall,
 * or null if the wall is too small or the spot is taken by another opening.
 */
export function openingAt(wall: Wall, openings: Opening[], type: OpeningType, position: number): Opening | null {
  const length = wallLength(wall)
  const size = STANDARD[type]
  const height = Math.min(size.height, wall.height - size.sill)
  if (height <= 0 || length < size.width + 2 * EDGE_CLEARANCE) return null
  const opening = fitOpening(
    { id: crypto.randomUUID(), wallId: wall.id, type, position, ...size, height, hinge: 'start', swing: 'left' },
    length,
    wall.height,
  )
  const taken = openings.filter((o) => o.wallId === wall.id).map((o) => fitOpening(o, length, wall.height))
  return taken.some((o) => overlap(o, opening)) ? null : opening
}

/**
 * The opening with `patch` applied and fitted to its wall, or null if that would
 * run into another opening on the wall.
 */
export function editOpening(o: Opening, patch: Partial<Opening>, wall: Wall, openings: Opening[]): Opening | null {
  const length = wallLength(wall)
  const edited = fitOpening({ ...o, ...patch }, length, wall.height)
  if (edited.width <= 0 || edited.height <= 0) return null
  const others = openings
    .filter((x) => x.wallId === wall.id && x.id !== o.id)
    .map((x) => fitOpening(x, length, wall.height))
  return others.some((x) => overlap(x, edited)) ? null : edited
}

/**
 * The path of a door leaf's free edge from closed to open at 90 degrees, as `segments + 1`
 * points. Local coordinates: x along the wall from the opening's centre, z towards the wall's left.
 */
export function swingArc(o: Opening, segments: number): { x: number; z: number }[] {
  const hingeX = o.hinge === 'start' ? -o.width / 2 : o.width / 2
  const towardsOtherJamb = -Math.sign(hingeX)
  const side = o.swing === 'left' ? 1 : -1
  return Array.from({ length: segments + 1 }, (_, k) => {
    const a = (Math.PI / 2) * (k / segments)
    return { x: hingeX + towardsOtherJamb * o.width * Math.cos(a), z: side * o.width * Math.sin(a) }
  })
}

/** Scale openings along their walls, e.g. after recalibration. Heights are not part of the plan's scale. */
export function scaleOpenings(openings: Opening[], factor: number): Opening[] {
  return openings.map((o) => ({ ...o, position: o.position * factor, width: o.width * factor }))
}
