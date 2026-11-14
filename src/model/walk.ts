// Walkthrough: where a person on foot can go. Walls are solid; doorways are not.

import { fitOpening, type Opening } from './openings'
import type { Room } from './rooms'
import { wallLength, type Vec2, type Wall } from './walls'

/** Camera height above the floor, in metres. */
export const EYE_HEIGHT = 1.6
/** How close the walker's centre can come to a wall face. */
export const BODY_RADIUS = 0.25

/**
 * Where a step from `from` towards `to` actually ends. The walker stops a body radius
 * short of any wall, slides along it, and cannot pass through it except at a door.
 */
export function walkTo(from: Vec2, to: Vec2, walls: Wall[], openings: Opening[]): Vec2 {
  let pos = { ...to }
  // Two passes, so a push out of one wall can't leave the walker inside another (corners).
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of walls) {
      const length = wallLength(wall)
      if (length === 0) continue
      const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
      const left = { x: -dir.z, z: dir.x }
      // Wall coordinates: distance along the centreline, and signed distance off it.
      const local = (q: Vec2) => {
        const x = q.x - wall.start.x
        const z = q.z - wall.start.z
        return { along: x * dir.x + z * dir.z, off: x * left.x + z * left.z }
      }
      const world = (along: number, off: number): Vec2 => ({
        x: wall.start.x + dir.x * along + left.x * off,
        z: wall.start.z + dir.z * along + left.z * off,
      })
      const doorway = (along: number) =>
        openings.some((o) => {
          if (o.wallId !== wall.id || o.type !== 'door') return false
          const d = fitOpening(o, length, wall.height)
          return along >= d.position - d.width / 2 && along <= d.position + d.width / 2
        })
      const reach = wall.thickness / 2 + BODY_RADIUS
      const a = local(from)
      let b = local(pos)
      const side = a.off < 0 ? -1 : 1

      // A long step that would cross the wall outright is held on the side it started from.
      if (a.off * b.off < 0) {
        const t = a.off / (a.off - b.off)
        const crossing = a.along + t * (b.along - a.along)
        if (crossing >= 0 && crossing <= length && !doorway(crossing)) {
          pos = world(b.along, side * reach)
          b = local(pos)
        }
      }

      // Too close to the wall: push straight out from the nearest point on it.
      const nearest = Math.min(length, Math.max(0, b.along))
      if (doorway(nearest)) continue
      const foot = world(nearest, 0)
      const d = Math.hypot(pos.x - foot.x, pos.z - foot.z)
      if (d >= reach) continue
      const n = d > 1e-9 ? { x: (pos.x - foot.x) / d, z: (pos.z - foot.z) / d } : { x: left.x * side, z: left.z * side }
      pos = { x: foot.x + n.x * reach, z: foot.z + n.z * reach }
    }
  }
  return pos
}

/**
 * Direction of travel on the ground for a view turned `yaw` radians (counter-clockwise from
 * above; 0 faces -z). `forward` and `strafe` are -1, 0 or 1. Unit length, or zero when still.
 */
export function moveVector(yaw: number, forward: number, strafe: number): Vec2 {
  const x = -Math.sin(yaw) * forward + Math.cos(yaw) * strafe
  const z = -Math.cos(yaw) * forward - Math.sin(yaw) * strafe
  const len = Math.hypot(x, z)
  return len === 0 ? { x: 0, z: 0 } : { x: x / len, z: z / len }
}

/** Where a walkthrough starts: the middle of the largest room, or the origin if there are none. */
export function startPosition(rooms: Room[]): Vec2 {
  if (rooms.length === 0) return { x: 0, z: 0 }
  return rooms.reduce((a, b) => (b.area > a.area ? b : a)).centre
}
