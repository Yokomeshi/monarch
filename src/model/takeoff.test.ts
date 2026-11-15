import { describe, expect, it } from 'vitest'
import { takeoff } from './takeoff'
import { createLight } from './lights'
import { createObject } from './objects'
import { openingAt } from './openings'
import { detectRooms } from './rooms'
import { wallsFromChain, WALL_DEFAULTS } from './walls'

const p = (x: number, z: number) => ({ x, z })

describe('takeoff', () => {
  // A closed 6 m x 4 m room, walls 2.5 m high and 0.2 m thick.
  const walls = wallsFromChain([p(0, 0), p(6, 0), p(6, 4), p(0, 4), p(0, 0)], { ...WALL_DEFAULTS, height: 2.5, thickness: 0.2 })
  const rooms = detectRooms(walls)

  it('is all zeros for an empty model', () => {
    expect(takeoff([], [], [], [], [])).toEqual({
      wallLength: 0, wallArea: 0, floorArea: 0, ceilingArea: 0, rooms: 0, doors: 0, windows: 0, furniture: 0, lights: 0,
    })
  })

  it('measures walls along their centre-lines and floors to the inside faces', () => {
    const t = takeoff(walls, [], rooms, [], [])
    expect(t.wallLength).toBeCloseTo(20, 9)
    expect(t.wallArea).toBeCloseTo(50, 9) // 20 m x 2.5 m
    expect(t.floorArea).toBeCloseTo(5.8 * 3.8, 9)
    expect(t.ceilingArea).toBe(t.floorArea)
    expect(t.rooms).toBe(1)
  })

  it('takes doors and windows out of the wall area, and counts them', () => {
    const door = openingAt(walls[0], [], 'door', 3)! // 0.9 m x 2.1 m
    const window = openingAt(walls[1], [], 'window', 2)! // 1.2 m x 1.2 m
    const t = takeoff(walls, [door, window], rooms, [], [])
    expect(t.wallArea).toBeCloseTo(50 - 0.9 * 2.1 - 1.2 * 1.2, 9)
    expect(t.doors).toBe(1)
    expect(t.windows).toBe(1)
  })

  it('counts furniture and lights', () => {
    const t = takeoff(walls, [], rooms, [createObject('bed', p(1, 1)), createObject('sofa', p(3, 3))], [createLight(p(3, 2))])
    expect(t.furniture).toBe(2)
    expect(t.lights).toBe(1)
  })
})
