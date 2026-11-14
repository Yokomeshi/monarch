import { describe, expect, it } from 'vitest'
import { BODY_RADIUS, EYE_HEIGHT, moveVector, startPosition, walkTo } from './walk'
import { openingAt } from './openings'
import { detectRooms } from './rooms'
import { createWall, wallsFromChain } from './walls'

const p = (x: number, z: number) => ({ x, z })
const T = 0.2
const props = { height: 2.7, thickness: T }
const wall = createWall(p(0, 0), p(4, 0), props) // runs along x
// The closest a person can stand to the wall's centreline.
const REACH = T / 2 + BODY_RADIUS

function expectAt(got: { x: number; z: number }, x: number, z: number) {
  expect(got.x).toBeCloseTo(x, 9)
  expect(got.z).toBeCloseTo(z, 9)
}

describe('walking', () => {
  it('uses a 1.6 m eye height and a 0.25 m body radius', () => {
    expect(EYE_HEIGHT).toBe(1.6)
    expect(BODY_RADIUS).toBe(0.25)
  })

  it('moves freely in open space', () => {
    expectAt(walkTo(p(2, 3), p(2.5, 2.2), [wall], []), 2.5, 2.2)
    expectAt(walkTo(p(0, 0), p(1, 1), [], []), 1, 1)
  })

  it('stops at a wall, a body radius clear of its face', () => {
    expectAt(walkTo(p(2, 1), p(2, 0.2), [wall], []), 2, REACH)
  })

  it('slides along a wall when walked into at an angle', () => {
    expectAt(walkTo(p(2, REACH), p(2.5, 0.2), [wall], []), 2.5, REACH)
  })

  it('cannot jump through a wall in one long step', () => {
    expectAt(walkTo(p(2, 0.5), p(2, -0.5), [wall], []), 2, REACH)
    expectAt(walkTo(p(2, -0.5), p(2, 0.5), [wall], []), 2, -REACH)
  })

  it('walks through a doorway', () => {
    const door = openingAt(wall, [], 'door', 2)! // spans x = 1.55 .. 2.45
    expectAt(walkTo(p(2, 0.5), p(2, 0.1), [wall], [door]), 2, 0.1)
    expectAt(walkTo(p(2, 0.1), p(2, -0.4), [wall], [door]), 2, -0.4)
  })

  it('is stopped by the wall beside a doorway, and by a window', () => {
    const door = openingAt(wall, [], 'door', 2)!
    expectAt(walkTo(p(3.2, 0.5), p(3.2, 0.1), [wall], [door]), 3.2, REACH)
    const window = openingAt(wall, [], 'window', 2)!
    expectAt(walkTo(p(2, 0.5), p(2, 0.1), [wall], [window]), 2, REACH)
  })

  it('walks round the end of a wall', () => {
    expectAt(walkTo(p(5, 0.5), p(5, -0.5), [wall], []), 5, -0.5)
  })

  it('is kept out of both walls in a corner', () => {
    const side = createWall(p(0, 0), p(0, 4), props)
    const got = walkTo(p(1, 1), p(0.1, 0.1), [wall, side], [])
    expectAt(got, REACH, REACH)
  })
})

describe('moveVector', () => {
  it('forward is -z when facing the way the camera starts, and turns with the view', () => {
    expectAt(moveVector(0, 1, 0), 0, -1)
    expectAt(moveVector(Math.PI / 2, 1, 0), -1, 0) // turned 90 degrees left
    expectAt(moveVector(0, 0, 1), 1, 0) // strafe right
    expectAt(moveVector(Math.PI, -1, 0), 0, -1) // backwards while facing +z
  })

  it('moving diagonally is no faster than moving straight', () => {
    const v = moveVector(0.3, 1, 1)
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1, 9)
    expectAt(moveVector(0.3, 0, 0), 0, 0)
  })
})

describe('startPosition', () => {
  it('is the middle of the largest room', () => {
    const rect = (x0: number, z0: number, x1: number, z1: number) =>
      wallsFromChain([p(x0, z0), p(x1, z0), p(x1, z1), p(x0, z1), p(x0, z0)], props)
    const rooms = detectRooms([...rect(0, 0, 3, 3), ...rect(10, 0, 16, 4)])
    expectAt(startPosition(rooms), 13, 2)
  })

  it('is the origin when there are no rooms', () => {
    expect(startPosition([])).toEqual(p(0, 0))
  })
})
