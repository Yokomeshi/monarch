import { describe, expect, it } from 'vitest'
import { metresPerPixel, pixelDistance, pixelToWorld, worldToPixel } from './geometry'

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
