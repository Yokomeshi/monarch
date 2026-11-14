import { describe, expect, it } from 'vitest'
import { polygonArea, wallFootprints, type Footprint } from './wallGeometry'
import { createWall, wallsFromChain, type Vec2 } from './walls'

const p = (x: number, z: number) => ({ x, z })
const t = 0.2
const props = { height: 2.7, thickness: t }

function expectPoint(a: Vec2, b: Vec2) {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.z).toBeCloseTo(b.z, 9)
}

const totalArea = (fps: Map<string, Footprint>) =>
  [...fps.values()].reduce((s, f) => s + polygonArea(f), 0)

describe('wallFootprints', () => {
  it('a lone wall is a rectangle with square ends', () => {
    const w = createWall(p(0, 0), p(4, 0), props)
    const [sl, el, er, sr] = wallFootprints([w]).get(w.id)!
    expectPoint(sl, p(0, 0.1))
    expectPoint(el, p(4, 0.1))
    expectPoint(er, p(4, -0.1))
    expectPoint(sr, p(0, -0.1))
  })

  it('an L-corner is mitred: both walls share the inner and outer corner points', () => {
    const [a, b] = wallsFromChain([p(0, 0), p(4, 0), p(4, 3)], props)
    const fps = wallFootprints([a, b])
    const [, aEndLeft, aEndRight] = fps.get(a.id)!
    const [bStartLeft, , , bStartRight] = fps.get(b.id)!
    // Turning from +x to +z: the +z side of A is the inside of the corner.
    expectPoint(aEndLeft, p(3.9, 0.1))
    expectPoint(aEndRight, p(4.1, -0.1))
    // B runs towards +z, so its left is the x = 3.9 (inner) face.
    expectPoint(bStartLeft, aEndLeft)
    expectPoint(bStartRight, aEndRight)
  })

  it('a closed rectangular room has no gaps or overlaps at its corners', () => {
    const W = 6
    const D = 4
    const walls = wallsFromChain([p(0, 0), p(W, 0), p(W, D), p(0, D), p(0, 0)], props)
    expect(totalArea(wallFootprints(walls))).toBeCloseTo(2 * (W + D) * t, 9)
  })

  it('works for a closed room drawn in either direction', () => {
    const walls = wallsFromChain([p(0, 0), p(0, 4), p(6, 4), p(6, 0), p(0, 0)], props)
    expect(totalArea(wallFootprints(walls))).toBeCloseTo(2 * (6 + 4) * t, 9)
  })

  it('mitres walls of different thickness', () => {
    const a = createWall(p(0, 0), p(4, 0), { height: 2.7, thickness: 0.2 })
    const b = createWall(p(4, 0), p(4, 3), { height: 2.7, thickness: 0.4 })
    const [, aEndLeft, aEndRight] = wallFootprints([a, b]).get(a.id)!
    expectPoint(aEndLeft, p(3.8, 0.1))
    expectPoint(aEndRight, p(4.2, -0.1))
  })

  it('collinear walls meet flush with square ends', () => {
    const [a, b] = wallsFromChain([p(0, 0), p(2, 0), p(5, 0)], props)
    const fps = wallFootprints([a, b])
    const [, aEndLeft, aEndRight] = fps.get(a.id)!
    const [bStartLeft, , , bStartRight] = fps.get(b.id)!
    expectPoint(aEndLeft, bStartLeft)
    expectPoint(aEndRight, bStartRight)
    expect(totalArea(fps)).toBeCloseTo(5 * t, 9)
  })

  it('falls back to square ends at very sharp angles instead of a long spike', () => {
    const [a, b] = wallsFromChain([p(0, 0), p(4, 0), p(0, 0.1)], props)
    const [, aEndLeft, aEndRight] = wallFootprints([a, b]).get(a.id)!
    expectPoint(aEndLeft, p(4, 0.1))
    expectPoint(aEndRight, p(4, -0.1))
  })

  it('uses square ends where three or more walls meet', () => {
    const walls = [
      createWall(p(0, 0), p(-3, 0), props),
      createWall(p(0, 0), p(3, 0), props),
      createWall(p(0, 0), p(0, 3), props),
    ]
    const [sl, , , sr] = wallFootprints(walls).get(walls[2].id)!
    expectPoint(sl, p(-0.1, 0))
    expectPoint(sr, p(0.1, 0))
  })

  describe('T-junctions: a wall ending partway along another', () => {
    const host = () => createWall(p(0, 0), p(4, 0), props)

    it('trims a perpendicular wall to the face of the wall it meets', () => {
      const h = host()
      const stem = createWall(p(2, 3), p(2, 0), props)
      const [, endLeft, endRight] = wallFootprints([h, stem]).get(stem.id)!
      for (const c of [endLeft, endRight]) expect(c.z).toBeCloseTo(0.1, 9)
      expect(Math.abs(endLeft.x - endRight.x)).toBeCloseTo(t, 9)
    })

    it('works from either side and whichever end touches', () => {
      const h = host()
      const below = createWall(p(1, 0), p(1, -2), props) // starts on the host
      const [startLeft, , , startRight] = wallFootprints([h, below]).get(below.id)!
      for (const c of [startLeft, startRight]) expect(c.z).toBeCloseTo(-0.1, 9)
    })

    it('leaves the host wall whole, with no overlap between the two', () => {
      const h = host()
      const stem = createWall(p(2, 3), p(2, 0), props)
      const fps = wallFootprints([h, stem])
      expect(polygonArea(fps.get(h.id)!)).toBeCloseTo(4 * t, 9)
      expect(polygonArea(fps.get(stem.id)!)).toBeCloseTo((3 - t / 2) * t, 9)
    })

    it('cuts an angled wall along the face, so both corners lie on it', () => {
      const h = host()
      const angled = createWall(p(4, 2), p(2, 0), props) // meets at 45 degrees
      const [, endLeft, endRight] = wallFootprints([h, angled]).get(angled.id)!
      for (const c of [endLeft, endRight]) expect(c.z).toBeCloseTo(0.1, 9)
      expect(Math.abs(endLeft.x - endRight.x)).toBeCloseTo(t * Math.SQRT2, 9)
    })

    it('uses the thickness of the wall it meets', () => {
      const thick = createWall(p(0, 0), p(4, 0), { height: 2.7, thickness: 0.5 })
      const stem = createWall(p(2, 3), p(2, 0), props)
      const [, endLeft] = wallFootprints([thick, stem]).get(stem.id)!
      expect(endLeft.z).toBeCloseTo(0.25, 9)
    })

    it('does not treat a shared endpoint as a T-junction', () => {
      const h = host()
      const corner = createWall(p(4, 0), p(4, 3), props)
      const [startLeft] = wallFootprints([h, corner]).get(corner.id)!
      expectPoint(startLeft, p(3.9, 0.1)) // still a mitred L-corner
    })
  })
})
