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

/**
 * A standard door or window in the middle of the wall's largest free stretch,
 * or null if no stretch is wide enough.
 */
export function placeOpening(wall: Wall, openings: Opening[], type: OpeningType): Opening | null {
  const length = wallLength(wall)
  const size = STANDARD[type]
  const height = Math.min(size.height, wall.height - size.sill)
  if (height <= 0) return null

  const taken = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => fitOpening(o, length, wall.height))
    .sort((a, b) => a.position - b.position)
  let best: [number, number] | null = null
  let from = EDGE_CLEARANCE
  for (const edge of [...taken.map((o) => [o.position - o.width / 2, o.position + o.width / 2]), [length - EDGE_CLEARANCE, 0]]) {
    const gap = edge[0] - from
    if (gap >= size.width - 1e-9 && (!best || gap > best[1] - best[0] + 1e-9)) best = [from, edge[0]]
    from = edge[1]
  }
  if (!best) return null
  return { id: crypto.randomUUID(), wallId: wall.id, type, position: (best[0] + best[1]) / 2, ...size, height }
}

/** Scale openings along their walls, e.g. after recalibration. Heights are not part of the plan's scale. */
export function scaleOpenings(openings: Opening[], factor: number): Opening[] {
  return openings.map((o) => ({ ...o, position: o.position * factor, width: o.width * factor }))
}
