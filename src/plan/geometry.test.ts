import { describe, expect, it } from 'vitest'
import { lockAngle, metresPerPixel, pixelDistance, pixelToWorld, worldToPixel } from './geometry'

describe('calibration', () => {
  it('a 500 px span calibrated to 10 ft gives the right scale', () => {
    const mpp = metresPerPixel({ x: 250, y: 400 }, { x: 750, y: 400 }, 3.048)
    expect(mpp).toBeCloseTo(3.048 / 500, 12)
    // A 1000 x 800 px plan is then 20 ft x 16 ft.
    expect(1000 * mpp).toBeCloseTo(20 * 0.3048, 9)
    expect(800 * mpp).toBeCloseTo(16 * 0.3048, 9)
  })

  it('uses straight-line distance for diagonal points', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500)
  })

  it('rejects coincident points and non-positive distances', () => {
    expect(() => metresPerPixel({ x: 1, y: 1 }, { x: 1, y: 1 }, 3)).toThrow()
    expect(() => metresPerPixel({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow()
  })
})

describe('pixel <-> world', () => {
  const frame = { widthPx: 1000, heightPx: 800, metresPerPx: 0.01 }

  it('puts the image centre at the origin', () => {
    expect(pixelToWorld({ x: 500, y: 400 }, frame)).toEqual({ x: 0, z: 0 })
  })

  it('maps image corners to the plan edges', () => {
    expect(pixelToWorld({ x: 0, y: 0 }, frame)).toEqual({ x: -5, z: -4 })
    expect(pixelToWorld({ x: 1000, y: 800 }, frame)).toEqual({ x: 5, z: 4 })
  })

  it('round-trips', () => {
    const p = { x: 123.4, y: 567.8 }
    const back = worldToPixel(pixelToWorld(p, frame), frame)
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
  })
})

describe('lockAngle', () => {
  const from = { x: 100, y: 100 }

  it('puts a nearly horizontal or vertical line exactly on the axis, keeping the length along it', () => {
    expect(lockAngle(from, { x: 600, y: 112 })).toEqual({ x: 600, y: 100 })
    const up = lockAngle(from, { x: 93, y: -200 })
    expect(up.x).toBeCloseTo(100, 9)
    expect(up.y).toBeCloseTo(-200, 9)
  })

  it('locks to diagonals too', () => {
    const p = lockAngle(from, { x: 300, y: 320 })
    expect(p.x - from.x).toBeCloseTo(p.y - from.y, 9)
    expect(p.x).toBeCloseTo(310, 9) // the point on the diagonal nearest the pointer
  })

  it('leaves the point alone when it is where the line starts', () => {
    expect(lockAngle(from, from)).toEqual(from)
  })
})
