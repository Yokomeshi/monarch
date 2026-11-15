import { describe, expect, it } from 'vitest'
import { findClashes, TOUCH_TOLERANCE } from './clash'
import { createObject, type ObjectKind, type PlacedObject, type Size3 } from './objects'
import { snapToWalls } from './objectSnap'
import { openingAt, type Opening } from './openings'
import { createWall, wallsFromChain, WALL_DEFAULTS } from './walls'

/** A piece at (x, z), optionally resized (width, depth) and rotated. */
function piece(kind: ObjectKind, x: number, z: number, patch: Partial<Size3> = {}, rotation = 0): PlacedObject {
  const o = createObject(kind, { x, z })
  return { ...o, rotation, size: { ...o.size, ...patch } }
}

const box = (x: number, z: number, width: number, depth: number, rotation = 0) =>
  piece('table', x, z, { width, depth }, rotation)

const HALF = WALL_DEFAULTS.thickness / 2

describe('furniture against furniture', () => {
  it('reports two overlapping pieces once', () => {
    const a = box(0, 0, 1, 1)
    const b = box(0.8, 0.3, 1, 1)
    expect(findClashes([], [], [a, b])).toEqual([{ kind: 'furniture-furniture', ids: [a.id, b.id] }])
  })

  it('reports nothing for pieces apart', () => {
    expect(findClashes([], [], [box(0, 0, 1, 1), box(1.5, 0, 1, 1)])).toEqual([])
  })

  it('does not count pieces placed side by side, touching', () => {
    expect(findClashes([], [], [box(0, 0, 1, 1), box(1, 0, 1, 1)])).toEqual([])
    expect(findClashes([], [], [box(0, 0, 1, 1), box(1 - 2 * TOUCH_TOLERANCE, 0, 1, 1)])).toHaveLength(1)
  })

  it('finds an overlap that exists only because a piece is rotated', () => {
    const a = box(0, 0, 1.6, 0.9)
    // A 1 m square 10 cm clear of the table; turned 45 degrees its corner reaches into it.
    expect(findClashes([], [], [a, box(1.4, 0, 1, 1)])).toEqual([])
    expect(findClashes([], [], [a, box(1.4, 0, 1, 1, 45)])).toHaveLength(1)
  })

  it('clears a piece that overlaps only when unrotated', () => {
    const a = box(0, 0, 1, 1)
    // A long plank reaching 20 cm into the square; turned 45 degrees it passes the corner.
    expect(findClashes([], [], [a, box(1.3, 0, 2, 0.2)])).toHaveLength(1)
    expect(findClashes([], [], [a, box(1.3, 0, 2, 0.2, 45)])).toEqual([])
  })

  it('turns pieces counter-clockwise as seen from above, as the scene does', () => {
    // At 45 degrees the plank's width runs towards +x, -z.
    const plank = box(0, 0, 2, 0.2, 45)
    expect(findClashes([], [], [plank, box(0.6, -0.6, 0.2, 0.2)])).toHaveLength(1)
    expect(findClashes([], [], [plank, box(0.6, 0.6, 0.2, 0.2)])).toEqual([])
  })
})

describe('furniture against walls', () => {
  const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 })

  it('does not count a piece flush against the wall face', () => {
    const flush = piece('wardrobe', 2, HALF + 0.3)
    expect(findClashes([wall], [], [flush])).toEqual([])
  })

  it('does not count a piece where wall snapping puts it', () => {
    const o = piece('wardrobe', 2, 0.45)
    const snap = snapToWalls(o, [wall], 0.2)!
    expect(findClashes([wall], [], [{ ...o, ...snap }])).toEqual([])
  })

  it('reports a piece pushed 5 cm into the wall', () => {
    const pushed = piece('wardrobe', 2, HALF + 0.3 - 0.05)
    expect(findClashes([wall], [], [pushed])).toEqual([{ kind: 'furniture-wall', ids: [pushed.id, wall.id] }])
  })

  it('does not count a piece tucked into a mitred corner', () => {
    const walls = wallsFromChain([
      { x: 0, z: 4 },
      { x: 0, z: 0 },
      { x: 4, z: 0 },
    ])
    const tucked = box(HALF + 0.5, HALF + 0.5, 1, 1)
    expect(findClashes(walls, [], [tucked])).toEqual([])
    const pushed = box(HALF + 0.45, HALF + 0.5, 1, 1)
    expect(findClashes(walls, [], [pushed])).toEqual([{ kind: 'furniture-wall', ids: [pushed.id, walls[0].id] }])
  })
})

describe('furniture in a door swing', () => {
  // Along +x, so its left is +z. The standard door hangs from the start jamb and opens left.
  const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 })
  const door = openingAt(wall, [], 'door', 2)!

  it('reports a piece where the door opens', () => {
    const chair = piece('chair', 2, 0.5)
    expect(findClashes([wall], [door], [chair])).toEqual([{ kind: 'door-swing', ids: [chair.id, door.id] }])
  })

  it('reports nothing for a piece on the other side of the wall', () => {
    expect(findClashes([wall], [door], [piece('chair', 2, -0.5)])).toEqual([])
  })

  it('follows the door when it opens to the other side', () => {
    const right: Opening = { ...door, swing: 'right' }
    expect(findClashes([wall], [right], [piece('chair', 2, 0.5)])).toEqual([])
    expect(findClashes([wall], [right], [piece('chair', 2, -0.5)])).toHaveLength(1)
  })

  it('sweeps a quarter circle about the hinge, not the whole square', () => {
    // In the corner of the square far from the start jamb: outside that arc, inside the one about the end jamb.
    const small = box(2.38, 0.83, 0.1, 0.1)
    expect(findClashes([wall], [door], [small])).toEqual([])
    expect(findClashes([wall], [{ ...door, hinge: 'end' }], [small])).toHaveLength(1)
  })

  it('places the swing on the left of a wall running another way', () => {
    // Along +z, so its left is -x.
    const side = createWall({ x: 0, z: 0 }, { x: 0, z: 4 })
    const sideDoor = openingAt(side, [], 'door', 2)!
    expect(findClashes([side], [sideDoor], [piece('chair', -0.5, 2)])).toHaveLength(1)
    expect(findClashes([side], [sideDoor], [piece('chair', 0.5, 2)])).toEqual([])
  })

  it('never reports a window', () => {
    const window = openingAt(wall, [], 'window', 2)!
    expect(findClashes([wall], [window], [piece('chair', 2, 0.5), piece('chair', 2, -0.5)])).toEqual([])
  })
})

describe('order', () => {
  it('lists clashes by kind, then in input order', () => {
    const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 })
    const door = openingAt(wall, [], 'door', 2)!
    const a = piece('chair', 2, 0.5) // in the swing
    const b = piece('chair', 2, 0.2) // in the swing, into the wall and into a
    const c = piece('chair', 3.5, 0.2) // into the wall only
    expect(findClashes([wall], [door], [a, b, c])).toEqual([
      { kind: 'furniture-furniture', ids: [a.id, b.id] },
      { kind: 'furniture-wall', ids: [b.id, wall.id] },
      { kind: 'furniture-wall', ids: [c.id, wall.id] },
      { kind: 'door-swing', ids: [a.id, door.id] },
      { kind: 'door-swing', ids: [b.id, door.id] },
    ])
  })
})
