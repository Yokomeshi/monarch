import { describe, expect, it } from 'vitest'
import { detectOptions, toWalls } from './suggestWalls'
import { WALL_DEFAULTS } from '../model/walls'

describe('detectOptions', () => {
  it('keeps the thickness limit in pixels and turns real sizes into pixels', () => {
    expect(detectOptions(0.01)).toEqual({ minThickness: 4, minLength: 50, maxGap: 120 })
    expect(detectOptions(0.02).minLength).toBe(25)
  })
})

describe('toWalls', () => {
  // A 1000 x 800 px plan at 1 cm per pixel is 10 m x 8 m, centred on the origin.
  const frame = { widthPx: 1000, heightPx: 800, metresPerPx: 0.01 }

  it('places walls in metres, with the thickness drawn on the plan', () => {
    const [wall] = toWalls([{ start: { x: 40, y: 40 }, end: { x: 960, y: 40 }, thickness: 12 }], frame, { ...WALL_DEFAULTS, height: 3 })
    expect(wall.start.x).toBeCloseTo(-4.6, 9)
    expect(wall.start.z).toBeCloseTo(-3.6, 9)
    expect(wall.end.x).toBeCloseTo(4.6, 9)
    expect(wall.end.z).toBeCloseTo(-3.6, 9)
    expect(wall.thickness).toBe(0.12)
    expect(wall.height).toBe(3)
    expect(wall.material).toEqual(WALL_DEFAULTS.material)
  })

  it('gives every wall its own id', () => {
    const d = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thickness: 10 }
    const [a, b] = toWalls([d, d], frame, WALL_DEFAULTS)
    expect(a.id).not.toBe(b.id)
  })
})
