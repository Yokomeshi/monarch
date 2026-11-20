import { describe, expect, it } from 'vitest'
import {
  MIN_CONFIDENCE,
  bridgeWalls,
  cropSquare,
  gapMark,
  gapSuggestions,
  markGap,
  openingGaps,
  openingsFromGaps,
  type GapSuggestion,
} from './suggestOpenings'
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
    const stub = createWall({ x: 0, z: 0 }, { x: 0, z: 0.15 }) // no room for any opening between its end clearances
    expect(openingsFromGaps([gap({ wallId: stub.id, position: 0.07 })], [stub])).toEqual([])
    // The second lands on the first.
    expect(openingsFromGaps([gap(), gap({ kind: 'window', position: 2.2 })], [wall])).toMatchObject([{ type: 'door' }])
  })

  it('skips a gap whose wall is not there', () => {
    expect(openingsFromGaps([gap({ wallId: 'gone' }), gap()], [wall])).toHaveLength(1)
  })
})

const CROP = { square: { x: 0, y: 0, size: 240 }, mark: { x: 80, y: 100, width: 90, height: 90 } }

describe('markGap', () => {
  const wall = createWall({ x: 0, z: 0 }, { x: 6, z: 0 })

  it('marks a door of the standard width where the wall was clicked', () => {
    const marked = markGap([wall], [], wall.id, { x: 2, z: 0 }, 'door')
    expect(marked?.gaps).toEqual([{ wallId: wall.id, position: 2, width: 0.9, kind: 'door', confidence: 1 }])
    expect(marked?.walls[0]).toBe(wall)
  })

  it('marks a window of the standard width at a click a little off the wall', () => {
    const marked = markGap([wall], [], wall.id, { x: 3, z: 0.2 }, 'window')
    expect(marked?.gaps).toEqual([{ wallId: wall.id, position: 3, width: 1.2, kind: 'window', confidence: 1 }])
  })

  it('slides a gap clicked too near an end of the wall along to fit', () => {
    expect(markGap([wall], [], wall.id, { x: 0.1, z: 0 }, 'door')?.gaps[0].position).toBeCloseTo(0.55, 9)
    expect(markGap([wall], [], wall.id, { x: 5.95, z: 0 }, 'door')?.gaps[0].position).toBeCloseTo(5.45, 9)
    expect(markGap([wall], [], wall.id, { x: 5.95, z: 0 }, 'door')?.gaps[0].width).toBe(0.9)
  })

  it('shrinks the gap to fit a short wall, down to the narrowest opening', () => {
    const short = createWall({ x: 0, z: 0 }, { x: 1, z: 0 })
    const [gap] = markGap([short], [], short.id, { x: 0.2, z: 0 }, 'window')!.gaps
    expect(gap.width).toBeCloseTo(0.8, 9)
    expect(gap.position).toBeCloseTo(0.5, 9)
    const shortest = createWall({ x: 0, z: 0 }, { x: 0.6, z: 0 })
    expect(markGap([shortest], [], shortest.id, { x: 0.3, z: 0 }, 'door')?.gaps[0].width).toBeCloseTo(0.4, 9)
    const tooShort = createWall({ x: 0, z: 0 }, { x: 0.5, z: 0 })
    expect(markGap([tooShort], [], tooShort.id, { x: 0.25, z: 0 }, 'door')).toBeNull()
  })

  it('does not overlap a gap already on the wall, but may touch it', () => {
    const other = createWall({ x: 0, z: 3 }, { x: 6, z: 3 })
    // The existing gap covers 1.55 m to 2.45 m.
    const existing: GapSuggestion = { wallId: wall.id, position: 2, width: 0.9, kind: null, confidence: 0 }
    expect(markGap([wall, other], [existing], wall.id, { x: 2.8, z: 0 }, 'door')).toBeNull()
    expect(markGap([wall, other], [existing], wall.id, { x: 2.9, z: 0 }, 'door')?.gaps).toHaveLength(2)
    expect(markGap([wall, other], [existing], wall.id, { x: 1.1, z: 0 }, 'door')?.gaps).toHaveLength(2)
    // A gap on another wall is not in the way.
    expect(markGap([wall, other], [existing], other.id, { x: 2, z: 3 }, 'door')?.gaps).toHaveLength(2)
  })

  it('marks nothing on a wall that is not there', () => {
    expect(markGap([wall], [], 'gone', { x: 2, z: 0 }, 'door')).toBeNull()
  })

  it('leaves the existing gaps as they are and adds the new one after them', () => {
    const existing: GapSuggestion = { wallId: wall.id, position: 1, width: 0.8, kind: 'door', confidence: 0.7, crop: CROP }
    const marked = markGap([wall], [existing], wall.id, { x: 4, z: 0 }, 'window')!
    expect(marked.gaps).toHaveLength(2)
    expect(marked.gaps[0]).toBe(existing)
    expect(marked.gaps[1]).not.toHaveProperty('crop')
  })

  it('measures along a vertical wall, and from the start of a wall drawn right to left', () => {
    const vertical = createWall({ x: 5, z: 0 }, { x: 5, z: 4 })
    expect(markGap([vertical], [], vertical.id, { x: 5.1, z: 1.5 }, 'door')?.gaps[0].position).toBeCloseTo(1.5, 9)
    const leftward = createWall({ x: 6, z: 0 }, { x: 0, z: 0 })
    expect(markGap([leftward], [], leftward.id, { x: 2, z: 0 }, 'door')?.gaps[0].position).toBeCloseTo(4, 9)
  })
})

describe('bridgeWalls', () => {
  // Two pieces of one wall, with a 0.9 m doorway from x = 3 to x = 3.9 between them.
  const a = createWall({ x: 0, z: 0 }, { x: 3, z: 0 }, { thickness: 0.3, height: 2.4 })
  const b = createWall({ x: 3.9, z: 0 }, { x: 5, z: 0 })
  const bReversed = createWall({ x: 5, z: 0 }, { x: 3.9, z: 0 })
  const click = { x: 3.4, z: 0 }

  it('joins two walls in line into one, with a gap where the space was', () => {
    const bridged = bridgeWalls([a, b], [], click, 'door')!
    expect(bridged.walls).toEqual([{ ...a, end: { x: 5, z: 0 } }])
    expect(bridged.gaps).toHaveLength(1)
    expect(bridged.gaps[0]).toEqual({
      wallId: a.id,
      position: expect.closeTo(3.45, 9),
      width: expect.closeTo(0.9, 9),
      kind: 'door',
      confidence: 1,
    })
  })

  it('does the same when the second wall runs the other way', () => {
    const bridged = bridgeWalls([a, bReversed], [], click, 'window')!
    expect(bridged.walls).toEqual([{ ...a, end: { x: 5, z: 0 } }])
    expect(bridged.gaps[0]).toMatchObject({ wallId: a.id, kind: 'window' })
    expect(bridged.gaps[0].position).toBeCloseTo(3.45, 9)
    expect(bridged.gaps[0].width).toBeCloseTo(0.9, 9)
  })

  it('keeps the longer wall when the shorter comes first, and shifts its gaps as its start moves', () => {
    const short = createWall({ x: 0, z: 0 }, { x: 1, z: 0 })
    const apart = createWall({ x: 0, z: 4 }, { x: 5, z: 4 })
    const long = createWall({ x: 1.9, z: 0 }, { x: 5, z: 0 }, { thickness: 0.3 })
    const onLong: GapSuggestion = { wallId: long.id, position: 1, width: 0.8, kind: 'window', confidence: 0.6, crop: CROP }
    const bridged = bridgeWalls([short, apart, long], [onLong], { x: 1.5, z: 0 }, 'door')!
    expect(bridged.walls).toEqual([apart, { ...long, start: { x: 0, z: 0 } }])
    expect(bridged.gaps).toHaveLength(2)
    expect(bridged.gaps[0]).toEqual({ ...onLong, position: expect.closeTo(2.9, 9) })
    expect(bridged.gaps[1].wallId).toBe(long.id)
    expect(bridged.gaps[1].position).toBeCloseTo(1.45, 9)
    expect(bridged.gaps[1].width).toBeCloseTo(0.9, 9)
  })

  it('moves the gaps of the removed wall to the kept wall, whichever way the removed wall ran', () => {
    const onA: GapSuggestion = { wallId: a.id, position: 1, width: 0.8, kind: 'door', confidence: 0.9 }
    // 0.3 m from the start of b: at x = 4.2.
    const onB: GapSuggestion = { wallId: b.id, position: 0.3, width: 0.5, kind: 'window', confidence: 0.6, crop: CROP }
    const bridged = bridgeWalls([a, b], [onA, onB], click, 'door')!
    expect(bridged.gaps).toHaveLength(3)
    expect(bridged.gaps[0]).toBe(onA)
    expect(bridged.gaps[1]).toEqual({ ...onB, wallId: a.id, position: expect.closeTo(4.2, 9) })

    // 0.3 m from the start of the reversed b: at x = 4.7.
    const onReversed = { ...onB, wallId: bReversed.id }
    const reversed = bridgeWalls([a, bReversed], [onReversed], click, 'door')!
    expect(reversed.gaps[0]).toEqual({ ...onReversed, wallId: a.id, position: expect.closeTo(4.7, 9) })
  })

  it('measures from the start of a kept wall drawn right to left', () => {
    const short = createWall({ x: 0, z: 0 }, { x: 1, z: 0 })
    const long = createWall({ x: 5, z: 0 }, { x: 1.9, z: 0 })
    const onLong: GapSuggestion = { wallId: long.id, position: 1, width: 0.8, kind: 'window', confidence: 0.6 }
    const onShort: GapSuggestion = { wallId: short.id, position: 0.3, width: 0.5, kind: 'door', confidence: 0.8 }
    const bridged = bridgeWalls([long, short], [onLong, onShort], { x: 1.5, z: 0 }, 'door')!
    expect(bridged.walls).toEqual([{ ...long, end: { x: 0, z: 0 } }])
    expect(bridged.gaps[0]).toBe(onLong)
    expect(bridged.gaps[1]).toEqual({ ...onShort, wallId: long.id, position: expect.closeTo(4.7, 9) })
    expect(bridged.gaps[2].position).toBeCloseTo(3.55, 9)
  })

  it('bridges vertical walls', () => {
    const upper = createWall({ x: 2, z: 0 }, { x: 2, z: 3 })
    const lower = createWall({ x: 2, z: 5 }, { x: 2, z: 4 })
    const bridged = bridgeWalls([upper, lower], [], { x: 2.1, z: 3.5 }, 'door')!
    expect(bridged.walls).toEqual([{ ...upper, end: { x: 2, z: 5 } }])
    expect(bridged.gaps[0].position).toBeCloseTo(3.5, 9)
    expect(bridged.gaps[0].width).toBeCloseTo(1, 9)
  })

  it('bridges walls whose centre-lines are a little apart, not ones far apart', () => {
    // Half the thicker wall's thickness is 0.15 m.
    const near = createWall({ x: 3.9, z: 0.1 }, { x: 5, z: 0.1 })
    expect(bridgeWalls([a, near], [], click, 'door')?.walls).toEqual([{ ...a, end: { x: 5, z: 0.1 } }])
    const far = createWall({ x: 3.9, z: 0.25 }, { x: 5, z: 0.25 })
    expect(bridgeWalls([a, far], [], click, 'door')).toBeNull()
  })

  it('does not bridge walls at right angles', () => {
    const across = createWall({ x: 3.9, z: -1 }, { x: 3.9, z: 1 })
    expect(bridgeWalls([a, across], [], click, 'door')).toBeNull()
  })

  it('needs the click to be in the space', () => {
    expect(bridgeWalls([a, b], [], { x: 2, z: 0 }, 'door')).toBeNull()
    expect(bridgeWalls([a, b], [], { x: 3, z: 0 }, 'door')).toBeNull()
    expect(bridgeWalls([a, b], [], { x: 4.5, z: 0 }, 'door')).toBeNull()
    // To the side: up to the thicker wall's thickness, 0.3 m.
    expect(bridgeWalls([a, b], [], { x: 3.4, z: 0.25 }, 'door')).not.toBeNull()
    expect(bridgeWalls([a, b], [], { x: 3.4, z: -0.4 }, 'door')).toBeNull()
  })

  it('reaches at least 0.3 m to each side of thin walls', () => {
    const thin = createWall({ x: 0, z: 0 }, { x: 3, z: 0 })
    expect(bridgeWalls([thin, b], [], { x: 3.4, z: 0.25 }, 'door')).not.toBeNull()
    expect(bridgeWalls([thin, b], [], { x: 3.4, z: 0.35 }, 'door')).toBeNull()
  })

  it('does not bridge a space too long or too short for an opening', () => {
    const distant = createWall({ x: 6.5, z: 0 }, { x: 8, z: 0 })
    expect(bridgeWalls([a, distant], [], { x: 4, z: 0 }, 'door')).toBeNull()
    const atLimit = createWall({ x: 6, z: 0 }, { x: 8, z: 0 })
    expect(bridgeWalls([a, atLimit], [], { x: 4, z: 0 }, 'door')).not.toBeNull()
    const close = createWall({ x: 3.3, z: 0 }, { x: 5, z: 0 })
    expect(bridgeWalls([a, close], [], { x: 3.15, z: 0 }, 'door')).toBeNull()
  })

  it('does not bridge walls that run side by side', () => {
    const beside = createWall({ x: 2, z: 0.1 }, { x: 5, z: 0.1 })
    expect(bridgeWalls([a, beside], [], click, 'door')).toBeNull()
  })

  it('takes the shorter space when the click is in two', () => {
    // From a to c is 1.2 m; from a to b, 0.9 m.
    const c = createWall({ x: 4.2, z: 0.1 }, { x: 6, z: 0.1 })
    const bridged = bridgeWalls([a, c, b], [], click, 'door')!
    expect(bridged.walls).toEqual([{ ...a, end: { x: 5, z: 0 } }, c])
    expect(bridged.gaps[0].width).toBeCloseTo(0.9, 9)
  })

  it('leaves the other walls and their gaps as they are', () => {
    const apart = createWall({ x: 0, z: 4 }, { x: 5, z: 4 })
    const onApart: GapSuggestion = { wallId: apart.id, position: 2, width: 0.9, kind: 'door', confidence: 0.8, crop: CROP }
    const bridged = bridgeWalls([apart, a, b], [onApart], click, 'door')!
    expect(bridged.walls).toHaveLength(2)
    expect(bridged.walls[0]).toBe(apart)
    expect(bridged.gaps[0]).toBe(onApart)
  })
})

describe('openingsFromGaps on awkward walls', () => {
  const gap = (wallId: string, position: number, width: number): GapSuggestion => ({ wallId, position, width, kind: 'door', confidence: 1 })

  it('makes a door on a wall too short for a standard one', () => {
    // 1 m of wall: a standard 0.9 m door with its clearances would need 1.1 m.
    const wall = createWall({ x: 0, z: 0 }, { x: 1, z: 0 })
    expect(openingsFromGaps([gap(wall.id, 0.5, 0.7)], [wall])).toMatchObject([{ type: 'door', position: 0.5, width: 0.7 }])
  })

  it('makes both of two narrow doors that standard-width ones would overlap', () => {
    const wall = createWall({ x: 0, z: 0 }, { x: 4, z: 0 })
    const doors = openingsFromGaps([gap(wall.id, 1.5, 0.6), gap(wall.id, 2.2, 0.6)], [wall])
    expect(doors.map((d) => d.position)).toEqual([1.5, 2.2])
  })
})

