import { describe, expect, it } from 'vitest'
import {
  constrainAngle,
  createWall,
  endpoints,
  scaleWalls,
  snapToPoint,
  wallLength,
  wallsFromChain,
  WALL_DEFAULTS,
} from './walls'

const p = (x: number, z: number) => ({ x, z })

describe('walls', () => {
  it('creates a wall with default height and thickness', () => {
    const w = createWall(p(0, 0), p(3, 4))
    expect(w.height).toBe(WALL_DEFAULTS.height)
    expect(w.thickness).toBe(WALL_DEFAULTS.thickness)
    expect(wallLength(w)).toBe(5)
  })

  it('builds one wall per segment of a chain, sharing corner points', () => {
    const walls = wallsFromChain([p(0, 0), p(4, 0), p(4, 3), p(0, 0)])
    expect(walls).toHaveLength(3)
    expect(walls[0].end).toEqual(walls[1].start)
    expect(walls[2].end).toEqual(walls[0].start)
    expect(new Set(walls.map((w) => w.id)).size).toBe(3)
  })

  it('skips zero-length segments (e.g. a double click)', () => {
    expect(wallsFromChain([p(0, 0), p(2, 0), p(2, 0)])).toHaveLength(1)
    expect(wallsFromChain([p(1, 1)])).toHaveLength(0)
  })

  it('lists endpoints for snapping', () => {
    const walls = wallsFromChain([p(0, 0), p(1, 0)])
    expect(endpoints(walls)).toEqual([p(0, 0), p(1, 0)])
  })
})

describe('snapToPoint', () => {
  const candidates = [p(0, 0), p(5, 0), p(5.05, 0)]

  it('returns the nearest candidate within tolerance', () => {
    expect(snapToPoint(p(5.04, 0.01), candidates, 0.1)).toEqual(p(5.05, 0))
  })

  it('returns null when nothing is close enough', () => {
    expect(snapToPoint(p(2, 2), candidates, 0.1)).toBeNull()
  })
})

describe('constrainAngle', () => {
  it('locks a near-horizontal segment to horizontal, keeping its length', () => {
    const r = constrainAngle(p(0, 0), p(3, 0.2))
    expect(r.z).toBeCloseTo(0, 9)
    expect(r.x).toBeCloseTo(Math.hypot(3, 0.2), 9)
  })

  it('locks to 45 degrees', () => {
    const r = constrainAngle(p(1, 1), p(3, 3.3))
    expect(r.x - 1).toBeCloseTo(r.z - 1, 9)
  })

  it('locks to vertical', () => {
    const r = constrainAngle(p(0, 0), p(-0.1, -4))
    expect(r.x).toBeCloseTo(0, 9)
    expect(r.z).toBeLessThan(0)
  })
})

describe('scaleWalls', () => {
  it('scales positions about the origin and keeps height and thickness', () => {
    const [w] = scaleWalls(wallsFromChain([p(-2, 1), p(2, 1)]), 0.5)
    expect(w.start).toEqual(p(-1, 0.5))
    expect(w.end).toEqual(p(1, 0.5))
    expect(w.height).toBe(WALL_DEFAULTS.height)
    expect(w.thickness).toBe(WALL_DEFAULTS.thickness)
  })
})
