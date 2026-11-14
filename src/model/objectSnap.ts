// Snapping furniture against walls while it is dragged.

import type { PlacedObject } from './objects'
import type { Vec2, Wall } from './walls'

export interface Snap {
  position: Vec2
  /** Degrees, as PlacedObject.rotation. */
  rotation: number
}

/** Where a point sits relative to a wall: how far along it, and how far off its centreline. */
function relativeTo(wall: Wall, point: Vec2) {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  const length = Math.hypot(dx, dz)
  if (length === 0) return null
  const dir = { x: dx / length, z: dz / length }
  const left = { x: -dir.z, z: dir.x }
  const px = point.x - wall.start.x
  const pz = point.z - wall.start.z
  const along = px * dir.x + pz * dir.z
  if (along < 0 || along > length) return null // beside the wall's span only
  const off = px * left.x + pz * left.z
  // Unit normal pointing from the wall towards the point.
  const side = off < 0 ? -1 : 1
  const normal = { x: left.x * side, z: left.z * side }
  return { dir, normal, distance: Math.abs(off), foot: { x: wall.start.x + dir.x * along, z: wall.start.z + dir.z * along } }
}

const away = (foot: Vec2, normal: Vec2, d: number): Vec2 => ({ x: foot.x + normal.x * d, z: foot.z + normal.z * d })

/**
 * If the piece's back is within `tolerance` metres of a wall face, the position and
 * rotation that put it flush against that wall, back to the wall. Near a corner it is
 * also tucked sideways against the adjoining wall. Null if no wall is in reach.
 */
export function snapToWalls(o: Pick<PlacedObject, 'position' | 'size'>, walls: Wall[], tolerance: number): Snap | null {
  let best: { gap: number; wall: Wall; rel: NonNullable<ReturnType<typeof relativeTo>>; flush: number } | null = null
  for (const wall of walls) {
    const rel = relativeTo(wall, o.position)
    if (!rel) continue
    const flush = wall.thickness / 2 + o.size.depth / 2
    const gap = Math.abs(rel.distance - flush)
    if (gap <= tolerance && (!best || gap < best.gap)) best = { gap, wall, rel, flush }
  }
  if (!best) return null

  const { normal, dir } = best.rel
  let position = away(best.rel.foot, normal, best.flush)
  // The piece's front (+z) faces away from the wall.
  const rotation = ((Math.atan2(normal.x, normal.z) * 180) / Math.PI + 360) % 360

  // Corner: slide along the wall until the piece's side meets a wall at right angles to it.
  for (const wall of walls) {
    if (wall === best.wall) continue
    const rel = relativeTo(wall, position)
    if (!rel || Math.abs(rel.dir.x * dir.x + rel.dir.z * dir.z) > 0.1) continue
    const flush = wall.thickness / 2 + o.size.width / 2
    if (Math.abs(rel.distance - flush) <= tolerance) {
      position = away(rel.foot, rel.normal, flush)
      break
    }
  }
  return { position, rotation }
}
