// Layout problems in the plan: furniture that runs into other furniture, into a wall,
// or into the space a door needs to open. Walls are judged in plan view only; pieces at
// different heights (a wall cabinet over a base cabinet, or over a door) do not clash.

import type { PlacedObject } from './objects'
import { fitOpening, swingArc, type Opening } from './openings'
import { wallFootprints } from './wallGeometry'
import { wallLength, type Vec2, type Wall } from './walls'

export type ClashKind = 'furniture-furniture' | 'furniture-wall' | 'door-swing'

export interface Clash {
  kind: ClashKind
  /** Ids of the two things involved: two furniture ids; or furniture id then wall id; or furniture id then opening (door) id. */
  ids: [string, string]
}

/** Shapes must overlap by more than this, in metres, to clash: touching (a piece flush against a wall) is fine. */
export const TOUCH_TOLERANCE = 0.01

/** Straight pieces used to approximate a door's swing arc. */
const ARC_SEGMENTS = 8

/** The piece's rectangle on the floor, turned as the scene turns it (rotation about the vertical axis). */
function objectFootprint(o: PlacedObject): Vec2[] {
  const a = (o.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const w = o.size.width / 2
  const d = o.size.depth / 2
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([x, z]) => ({ x: o.position.x + x * cos + z * sin, z: o.position.z - x * sin + z * cos }))
}

/** The area a door leaf sweeps from closed to open: the hinge, then the arc of its free edge. World coordinates. */
function swingSector(door: Opening, wall: Wall): Vec2[] {
  const length = wallLength(wall)
  const o = fitOpening(door, length, wall.height) // as drawn
  const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
  const hinge = { x: o.hinge === 'start' ? -o.width / 2 : o.width / 2, z: 0 }
  // Local x runs along the wall from the opening's centre, local z towards the wall's left.
  return [hinge, ...swingArc(o, ARC_SEGMENTS)].map((p) => ({
    x: wall.start.x + dir.x * (o.position + p.x) - dir.z * p.z,
    z: wall.start.z + dir.z * (o.position + p.x) + dir.x * p.z,
  }))
}

/** True if two convex polygons overlap by more than the tolerance (separating axis theorem). */
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]
      const q = polygon[(i + 1) % polygon.length]
      const length = Math.hypot(q.x - p.x, q.z - p.z)
      if (length < 1e-9) continue
      const axis = { x: -(q.z - p.z) / length, z: (q.x - p.x) / length }
      const [minA, maxA] = extent(a, axis)
      const [minB, maxB] = extent(b, axis)
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= TOUCH_TOLERANCE) return false
    }
  }
  return true
}

function extent(polygon: Vec2[], axis: Vec2): [number, number] {
  const along = polygon.map((p) => p.x * axis.x + p.z * axis.z)
  return [Math.min(...along), Math.max(...along)]
}

/**
 * Every clash in the plan: furniture-furniture first, then furniture-wall, then door-swing,
 * each in input order (by piece, then by the other piece, wall or door).
 */
export function findClashes(walls: Wall[], openings: Opening[], objects: PlacedObject[]): Clash[] {
  const pieces = objects.map((o) => {
    const bottom = o.elevation ?? 0
    return { id: o.id, shape: objectFootprint(o), bottom, top: bottom + o.size.height }
  })
  const footprints = wallFootprints(walls)
  const wallById = new Map(walls.map((w) => [w.id, w]))
  const swings = openings.flatMap((o) => {
    const wall = wallById.get(o.wallId)
    return o.type === 'door' && wall ? [{ id: o.id, shape: swingSector(o, wall), top: o.sill + o.height }] : []
  })

  const clashes: Clash[] = []
  pieces.forEach((a, i) => {
    for (const b of pieces.slice(i + 1)) {
      // One above the other, even touching, is not a clash.
      const apart = a.bottom >= b.top - TOUCH_TOLERANCE || b.bottom >= a.top - TOUCH_TOLERANCE
      if (!apart && overlaps(a.shape, b.shape)) clashes.push({ kind: 'furniture-furniture', ids: [a.id, b.id] })
    }
  })
  for (const piece of pieces) {
    for (const [wallId, footprint] of footprints) {
      if (overlaps(piece.shape, footprint)) clashes.push({ kind: 'furniture-wall', ids: [piece.id, wallId] })
    }
  }
  for (const piece of pieces) {
    for (const swing of swings) {
      // A piece mounted above the door's head is clear of its leaf.
      if (piece.bottom < swing.top && overlaps(piece.shape, swing.shape)) clashes.push({ kind: 'door-swing', ids: [piece.id, swing.id] })
    }
  }
  return clashes
}
