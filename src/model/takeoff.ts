// Quantity takeoff: how much of everything the model contains. Derived, never stored.

import type { CeilingLight } from './lights'
import type { PlacedObject } from './objects'
import type { Opening } from './openings'
import type { Room } from './rooms'
import { wallLength, type Wall } from './walls'

export interface Takeoff {
  /** Total wall length along the centre-lines, in metres. */
  wallLength: number
  /** Wall area in square metres: length times height, less doors and windows. One face of each wall. */
  wallArea: number
  /** Floor area of the closed rooms in square metres, measured to the inside faces of the walls. */
  floorArea: number
  /** Ceiling area in square metres. Ceilings are flat, so this equals the floor area. */
  ceilingArea: number
  rooms: number
  doors: number
  windows: number
  furniture: number
  lights: number
}

export function takeoff(walls: Wall[], openings: Opening[], rooms: Room[], objects: PlacedObject[], lights: CeilingLight[]): Takeoff {
  const sum = (values: number[]) => values.reduce((total, v) => total + v, 0)
  const openingArea = sum(openings.map((o) => o.width * o.height))
  const floorArea = sum(rooms.map((r) => r.area))
  const doors = openings.filter((o) => o.type === 'door').length
  return {
    wallLength: sum(walls.map(wallLength)),
    wallArea: sum(walls.map((w) => wallLength(w) * w.height)) - openingArea,
    floorArea,
    ceilingArea: floorArea,
    rooms: rooms.length,
    doors,
    windows: openings.length - doors,
    furniture: objects.length,
    lights: lights.length,
  }
}
