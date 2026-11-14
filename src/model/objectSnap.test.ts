import { describe, expect, it } from 'vitest'
import { snapToWalls } from './objectSnap'
import { createObject, duplicateObject } from './objects'
import { createWall } from './walls'

const p = (x: number, z: number) => ({ x, z })
const T = 0.2 // wall thickness
const wall = (a: ReturnType<typeof p>, b: ReturnType<typeof p>) => createWall(a, b, { height: 2.7, thickness: T })
// A sofa is 2 m wide and 0.9 m deep: flush against a wall its centre is 0.1 + 0.45 = 0.55 m from the centreline.
const sofaAt = (x: number, z: number, rotation = 0) => ({ ...createObject('sofa', p(x, z)), rotation })
const TOL = 0.25

function expectSnap(result: ReturnType<typeof snapToWalls>, x: number, z: number, rotation: number) {
  expect(result).not.toBeNull()
  expect(result!.position.x).toBeCloseTo(x, 9)
  expect(result!.position.z).toBeCloseTo(z, 9)
  expect(result!.rotation).toBeCloseTo(rotation, 9)
}

describe('snapToWalls', () => {
  const along = wall(p(0, 0), p(4, 0)) // runs along x

  it('puts a piece flush against a nearby wall, back to the wall', () => {
    expectSnap(snapToWalls(sofaAt(2, 0.7, 30), [along], TOL), 2, 0.55, 0)
  })

  it('works from the other side of the wall, turning the piece round', () => {
    expectSnap(snapToWalls(sofaAt(2, -0.7), [along], TOL), 2, -0.55, 180)
  })

  it('pushes out a piece that was dragged slightly into the wall', () => {
    expectSnap(snapToWalls(sofaAt(2, 0.4), [along], TOL), 2, 0.55, 0)
  })

  it('leaves a piece alone when it is too far away, or past the end of the wall', () => {
    expect(snapToWalls(sofaAt(2, 1.2), [along], TOL)).toBeNull()
    expect(snapToWalls(sofaAt(5, 0.6), [along], TOL)).toBeNull()
    expect(snapToWalls(sofaAt(2, 0.7), [], TOL)).toBeNull()
  })

  it('turns to suit a wall running the other way', () => {
    const up = wall(p(0, 0), p(0, 4)) // runs along z
    expectSnap(snapToWalls(sofaAt(0.7, 2), [up], TOL), 0.55, 2, 90)
    expectSnap(snapToWalls(sofaAt(-0.7, 2), [up], TOL), -0.55, 2, 270)
  })

  it('follows an angled wall', () => {
    const diagonal = wall(p(0, 0), p(4, 4))
    const s = Math.SQRT1_2
    // 0.6 m off the centreline at its midpoint, on the +x / -z side.
    const snapped = snapToWalls(sofaAt(2 + 0.6 * s, 2 - 0.6 * s), [diagonal], TOL)
    expectSnap(snapped, 2 + 0.55 * s, 2 - 0.55 * s, 135)
  })

  it('picks the nearest wall when two are in reach', () => {
    const other = wall(p(0, 1.3), p(4, 1.3)) // its near face is at z = 1.2
    // Back gap to `along` is 0.05; to `other` the piece would have to back up to z = 0.75, a gap of 0.15.
    expectSnap(snapToWalls(sofaAt(2, 0.6), [other, along], TOL), 2, 0.55, 0)
  })

  it('tucks into a corner: flush against the wall behind and the wall beside', () => {
    const side = wall(p(0, 0), p(0, 4))
    const wardrobe = { ...createObject('wardrobe', p(0.8, 0.5)) } // 1.2 m wide, 0.6 m deep
    // Back to `along`: z = 0.1 + 0.3. Side against `side`: x = 0.1 + 0.6.
    expectSnap(snapToWalls(wardrobe, [along, side], TOL), 0.7, 0.4, 0)
  })

  it('does not slide along the wall when the side wall is out of reach', () => {
    const side = wall(p(0, 0), p(0, 4))
    const wardrobe = { ...createObject('wardrobe', p(1.5, 0.5)) }
    expectSnap(snapToWalls(wardrobe, [along, side], TOL), 1.5, 0.4, 0)
  })
})

describe('duplicateObject', () => {
  it('copies a piece half a metre away, with its own id', () => {
    const sofa = { ...sofaAt(1, 2, 90), size: { width: 2.4, depth: 1, height: 0.8 } }
    const copy = duplicateObject(sofa)
    expect(copy).toEqual({ ...sofa, id: copy.id, position: p(1.5, 2.5) })
    expect(copy.id).not.toBe(sofa.id)
    expect(copy.material).not.toBe(sofa.material)
  })
})
