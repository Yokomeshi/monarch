import { describe, expect, it } from 'vitest'
import { detectRooms } from './rooms'
import { createWall, wallsFromChain, type Vec2 } from './walls'

const p = (x: number, z: number) => ({ x, z })
const t = 0.2
const props = { height: 2.7, thickness: t }
const chain = (points: Vec2[]) => wallsFromChain(points, props)
const rect = (x0: number, z0: number, x1: number, z1: number) =>
  chain([p(x0, z0), p(x1, z0), p(x1, z1), p(x0, z1), p(x0, z0)])
const areas = (walls: ReturnType<typeof chain>) => detectRooms(walls).map((r) => r.area).sort((a, b) => a - b)

describe('detectRooms', () => {
  it('finds one room in a closed rectangle, measured to the inside faces', () => {
    const rooms = detectRooms(rect(0, 0, 6, 4))
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(5.8 * 3.8, 9)
    expect(rooms[0].outline).toHaveLength(4)
  })

  it('gives the same result whichever way the room was drawn', () => {
    const walls = chain([p(0, 0), p(0, 4), p(6, 4), p(6, 0), p(0, 0)])
    expect(areas(walls)[0]).toBeCloseTo(5.8 * 3.8, 9)
  })

  it('finds no room in an open chain', () => {
    expect(detectRooms(chain([p(0, 0), p(6, 0), p(6, 4), p(0, 4)]))).toEqual([])
    expect(detectRooms([])).toEqual([])
  })

  it('splits a room at a partition that meets the walls partway along (T-junctions)', () => {
    const walls = [...rect(0, 0, 6, 4), createWall(p(2, 0), p(2, 4), props)]
    const [small, large] = areas(walls)
    expect(small).toBeCloseTo(1.8 * 3.8, 9)
    expect(large).toBeCloseTo(3.8 * 3.8, 9)
  })

  it('splits a room at a wall that crosses right through it', () => {
    const walls = [...rect(0, 0, 6, 4), createWall(p(2, -1), p(2, 5), props)]
    const [small, large] = areas(walls)
    expect(small).toBeCloseTo(1.8 * 3.8, 9)
    expect(large).toBeCloseTo(3.8 * 3.8, 9)
  })

  it('ignores a dead-end stub wall: it does not split the room', () => {
    const walls = [...rect(0, 0, 6, 4), createWall(p(3, 0), p(3, 2), props)]
    const rooms = detectRooms(walls)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(5.8 * 3.8, 9)
  })

  it('finds separate rooms', () => {
    const walls = [...rect(0, 0, 3, 3), ...rect(10, 0, 14, 3)]
    const [a, b] = areas(walls)
    expect(a).toBeCloseTo(2.8 * 2.8, 9)
    expect(b).toBeCloseTo(3.8 * 2.8, 9)
  })

  it('measures an L-shaped room', () => {
    const walls = chain([p(0, 0), p(6, 0), p(6, 2), p(3, 2), p(3, 4), p(0, 4), p(0, 0)])
    const rooms = detectRooms(walls)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].area).toBeCloseTo(5.8 * 1.8 + 2.8 * 2.0, 9)
  })

  it("uses each wall's own thickness", () => {
    const walls = rect(0, 0, 6, 4)
    walls[0] = { ...walls[0], thickness: 0.4 } // the z = 0 wall
    expect(areas(walls)[0]).toBeCloseTo(5.8 * (4 - 0.2 - 0.1), 9)
  })

  it('lists the walls around each room and gives rooms stable ids', () => {
    const walls = [...rect(0, 0, 6, 4), createWall(p(2, 0), p(2, 4), props)]
    const first = detectRooms(walls)
    const again = detectRooms([...walls].reverse())
    expect(again.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort())
    const small = first.find((r) => r.area < 10)!
    // The partition, the left wall, and the top and bottom walls it meets.
    expect(new Set(small.wallIds)).toEqual(new Set([walls[4].id, walls[3].id, walls[0].id, walls[2].id]))
  })

  it('orders rooms top-to-bottom, then left-to-right, as seen in Top view', () => {
    const walls = [...rect(10, 0, 13, 3), ...rect(0, 0, 3, 3), ...rect(0, 10, 3, 13)]
    expect(detectRooms(walls).map((r) => [Math.floor(r.centre.x), Math.floor(r.centre.z)])).toEqual([
      [1, 1],
      [11, 1],
      [1, 11],
    ])
  })
})
