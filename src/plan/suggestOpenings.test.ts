import { describe, expect, it } from 'vitest'
import { MIN_CONFIDENCE, cropSquare, gapMark, gapSuggestions, openingGaps, openingsFromGaps, type GapSuggestion } from './suggestOpenings'
import { createWall } from '../model/walls'

describe('openingGaps', () => {
  it('keeps gaps wide enough for an opening and drops breaks in the drawing', () => {
    // At 1 cm per pixel: a 3 px break where a dimension line crosses the wall, a 39 cm gap, and a 40 cm gap.
    const gaps = [{ wall: 0, start: 100, end: 103 }, { wall: 0, start: 200, end: 239 }, { wall: 1, start: 50, end: 90 }]
    expect(openingGaps(gaps, 0.01)).toEqual([gaps[2]])
  })
})

describe('gapSuggestions', () => {
  // Two walls at 1 cm per pixel; detected wall i became walls[i].
  const walls = [createWall({ x: 0, z: 0 }, { x: 5, z: 0 }), createWall({ x: 5, z: 0 }, { x: 5, z: 4 })]

  it('puts each gap on its model wall, in metres, not yet identified', () => {
    const [a, b, c] = gapSuggestions(
      [
        { wall: 1, start: 100, end: 190 },
        { wall: 0, start: 50, end: 170 },
        { wall: 1, start: 250, end: 330 },
      ],
      walls,
      0.01,
    )
    expect(a.wallId).toBe(walls[1].id)
    expect(a.position).toBeCloseTo(1.45, 9)
    expect(a.width).toBeCloseTo(0.9, 9)
    expect(a.kind).toBeNull()
    expect(a.confidence).toBe(0)
    expect(b.wallId).toBe(walls[0].id)
    expect(b.position).toBeCloseTo(1.1, 9)
    expect(b.width).toBeCloseTo(1.2, 9)
    expect(c.wallId).toBe(walls[1].id)
    expect(c.position).toBeCloseTo(2.9, 9)
  })

  it('finds nothing where there are no gaps', () => {
    expect(gapSuggestions([], walls, 0.01)).toEqual([])
  })
})

describe('gapMark', () => {
  const gap = { wall: 0, start: 200, end: 320 }

  it('boxes the gap along a horizontal wall, reaching half the gap width to each side', () => {
    const wall = { start: { x: 100, y: 500 }, end: { x: 900, y: 500 }, thickness: 12 }
    expect(gapMark(gap, wall)).toEqual({ x: 300, y: 440, width: 120, height: 120 })
  })

  it('boxes the gap along a vertical wall', () => {
    const wall = { start: { x: 400, y: 100 }, end: { x: 400, y: 700 }, thickness: 20 }
    expect(gapMark(gap, wall)).toEqual({ x: 340, y: 300, width: 120, height: 120 })
  })

  it('stays clear of the faces of a wall thicker than the gap is wide', () => {
    const wall = { start: { x: 400, y: 100 }, end: { x: 400, y: 700 }, thickness: 200 }
    expect(gapMark(gap, wall)).toEqual({ x: 250, y: 300, width: 300, height: 120 })
  })
})

describe('cropSquare', () => {
  it('is centred on the gap in a horizontal wall, 2.5 times as wide as a wide gap', () => {
    // A 1.2 m gap, 200 px to 320 px along a wall that starts at x = 100: centre (360, 50), side 3 m.
    const wall = { start: { x: 100, y: 50 }, end: { x: 900, y: 50 }, thickness: 12 }
    const square = cropSquare({ wall: 0, start: 200, end: 320 }, wall, 0.01)
    expect(square.size).toBeCloseTo(300, 9)
    expect(square.x).toBeCloseTo(210, 9)
    expect(square.y).toBeCloseTo(-100, 9)
  })

  it('is at least 2.4 m across, however narrow the gap', () => {
    // A 0.8 m gap would give 2 m; the square is 2.4 m, which is 120 px at 2 cm per pixel.
    const wall = { start: { x: 100, y: 300 }, end: { x: 500, y: 300 }, thickness: 8 }
    const square = cropSquare({ wall: 0, start: 100, end: 140 }, wall, 0.02)
    expect(square.size).toBeCloseTo(120, 9)
    expect(square.x).toBeCloseTo(160, 9)
    expect(square.y).toBeCloseTo(240, 9)
  })

  it('follows a vertical wall, whichever way it runs', () => {
    const gap = { wall: 0, start: 100, end: 190 }
    const down = cropSquare(gap, { start: { x: 400, y: 100 }, end: { x: 400, y: 700 }, thickness: 12 }, 0.01)
    expect(down.size).toBeCloseTo(240, 9)
    expect(down.x).toBeCloseTo(280, 9)
    expect(down.y).toBeCloseTo(125, 9) // centre at y = 100 + 145
    const up = cropSquare(gap, { start: { x: 400, y: 700 }, end: { x: 400, y: 100 }, thickness: 12 }, 0.01)
    expect(up.x).toBeCloseTo(280, 9)
    expect(up.y).toBeCloseTo(435, 9) // centre at y = 700 - 145
  })
})

describe('openingsFromGaps', () => {
  const wall = createWall({ x: 0, z: 0 }, { x: 6, z: 0 })
  const gap = (over: Partial<GapSuggestion> = {}): GapSuggestion => ({
    wallId: wall.id,
    position: 2,
    width: 0.8,
    kind: 'door',
    confidence: 0.95,
    ...over,
  })

  it('makes a door where a door was identified, as wide as the gap', () => {
    const [door, ...rest] = openingsFromGaps([gap()], [wall])
    expect(rest).toEqual([])
    expect(door).toMatchObject({ wallId: wall.id, type: 'door', position: 2, width: 0.8, height: 2.1, sill: 0 })
  })

  it('makes a door for a doorway with no leaf drawn', () => {
    expect(openingsFromGaps([gap({ kind: 'opening' })], [wall])).toMatchObject([{ type: 'door', width: 0.8 }])
  })

  it('makes a window with the standard height and sill', () => {
    const [w] = openingsFromGaps([gap({ kind: 'window', width: 1.5 })], [wall])
    expect(w).toMatchObject({ type: 'window', position: 2, width: 1.5, height: 1.2, sill: 0.9 })
  })

  it('makes nothing of a gap that is no opening or is not yet identified', () => {
    expect(openingsFromGaps([gap({ kind: 'none' }), gap({ kind: null, confidence: 0 })], [wall])).toEqual([])
  })

  it('acts only on confident identifications', () => {
    expect(MIN_CONFIDENCE).toBe(0.5)
    expect(openingsFromGaps([gap({ confidence: 0.49 })], [wall])).toEqual([])
    expect(openingsFromGaps([gap({ confidence: 0.5 })], [wall])).toHaveLength(1)
  })

  it('puts two openings on one wall', () => {
    const openings = openingsFromGaps([gap({ position: 1.5 }), gap({ kind: 'window', position: 4, width: 1.4 })], [wall])
    expect(openings).toMatchObject([
      { type: 'door', position: 1.5, width: 0.8 },
      { type: 'window', position: 4, width: 1.4 },
    ])
    expect(openings[0].id).not.toBe(openings[1].id)
  })

  it('keeps a narrow gap near the end of a wall where it was found', () => {
    // A standard 0.9 m door would be pushed along to 0.55 m; the 0.7 m gap fits at 0.5 m.
    const [door] = openingsFromGaps([gap({ position: 0.5, width: 0.7 })], [wall])
    expect(door.position).toBeCloseTo(0.5, 9)
    expect(door.width).toBe(0.7)
  })

  it('skips a gap that cannot fit', () => {
    const short = createWall({ x: 0, z: 0 }, { x: 0, z: 1 }) // too short for a standard door
    expect(openingsFromGaps([gap({ wallId: short.id, position: 0.5 })], [short])).toEqual([])
    // The second lands on the first.
    expect(openingsFromGaps([gap(), gap({ kind: 'window', position: 2.2 })], [wall])).toMatchObject([{ type: 'door' }])
  })

  it('skips a gap whose wall is not there', () => {
    expect(openingsFromGaps([gap({ wallId: 'gone' }), gap()], [wall])).toHaveLength(1)
  })
})
