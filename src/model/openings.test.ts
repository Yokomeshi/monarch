import { describe, expect, it } from 'vitest'
import { editOpening, fitOpening, openingAt, scaleOpenings, swingArc, type Opening } from './openings'
import { createWall } from './walls'

const p = (x: number, z: number) => ({ x, z })
const wall = (length: number, height = 2.7) => createWall(p(0, 0), p(length, 0), { height, thickness: 0.2 })

describe('openingAt', () => {
  it('places a standard door centred where the wall was clicked', () => {
    const w = wall(4)
    expect(openingAt(w, [], 'door', 1.3)).toMatchObject({
      wallId: w.id, type: 'door', position: 1.3, width: 0.9, height: 2.1, sill: 0, hinge: 'start', swing: 'left',
    })
  })

  it('gives a window a sill', () => {
    expect(openingAt(wall(4), [], 'window', 2)).toMatchObject({ type: 'window', width: 1.2, height: 1.2, sill: 0.9 })
  })

  it('moves a click near the end of the wall inwards, so the opening fits', () => {
    expect(openingAt(wall(4), [], 'door', 0.2)!.position).toBeCloseTo(0.55, 9)
    expect(openingAt(wall(4), [], 'door', 3.99)!.position).toBeCloseTo(3.45, 9)
  })

  it('refuses a spot that would overlap another opening on the same wall', () => {
    const w = wall(6)
    const door = openingAt(w, [], 'door', 2)! // occupies 1.55 .. 2.45
    expect(openingAt(w, [door], 'window', 2.9)).toBeNull() // would start at 2.3
    expect(openingAt(w, [door], 'window', 3.05)).not.toBeNull() // starts exactly at 2.45
    expect(openingAt(wall(6), [door], 'window', 2.9)).not.toBeNull() // a different wall
  })

  it('returns null when the wall is too short or too low', () => {
    expect(openingAt(wall(0.8), [], 'door', 0.4)).toBeNull()
    expect(openingAt(wall(4, 0.8), [], 'window', 2)).toBeNull() // sill is above the wall
  })

  it('shortens a door for a low wall', () => {
    expect(openingAt(wall(4, 1.5), [], 'door', 2)).toMatchObject({ height: 1.5, sill: 0 })
  })
})

describe('editOpening', () => {
  const w = wall(6)
  const door = openingAt(w, [], 'door', 2)!
  const window = openingAt(w, [door], 'window', 4)! // occupies 3.4 .. 4.6

  it('applies a change that fits', () => {
    expect(editOpening(door, { width: 1.2 }, w, [door, window])).toMatchObject({ width: 1.2, position: 2 })
  })

  it('keeps the opening inside the wall', () => {
    expect(editOpening(door, { position: -5 }, w, [door, window])!.position).toBeCloseTo(0.55, 9)
    expect(editOpening(door, { height: 9 }, w, [door, window])!.height).toBe(2.7)
  })

  it('refuses a change that would run into a neighbour', () => {
    expect(editOpening(door, { position: 3.2 }, w, [door, window])).toBeNull()
    expect(editOpening(door, { width: 3 }, w, [door, window])).toBeNull()
    expect(editOpening(door, { position: 2.95 }, w, [door, window])).not.toBeNull() // ends exactly at 3.4
  })
})

describe('swingArc', () => {
  const door = openingAt(wall(4), [], 'door', 2)! // hinge at the start side, opening to the left

  it('sweeps a quarter circle from the closed leaf to the open leaf, around the hinge', () => {
    const arc = swingArc(door, 8)
    expect(arc).toHaveLength(9)
    // Local coordinates: x along the wall from the opening's centre, z towards the wall's left.
    expect(arc[0].x).toBeCloseTo(0.45, 9) // closed: the leaf's free edge is at the far jamb
    expect(arc[0].z).toBeCloseTo(0, 9)
    expect(arc[8].x).toBeCloseTo(-0.45, 9) // open: straight out from the hinge
    expect(arc[8].z).toBeCloseTo(0.9, 9)
    for (const q of arc) expect(Math.hypot(q.x + 0.45, q.z)).toBeCloseTo(0.9, 9)
  })

  it('mirrors with the hinge and with the swing side', () => {
    const end = swingArc({ ...door, hinge: 'end' }, 8)
    expect(end[0].x).toBeCloseTo(-0.45, 9)
    expect(end[8].x).toBeCloseTo(0.45, 9)
    const right = swingArc({ ...door, swing: 'right' }, 8)
    expect(right[8].z).toBeCloseTo(-0.9, 9)
  })
})

describe('fitOpening', () => {
  const base: Opening = {
    id: 'o', wallId: 'w', type: 'window', position: 2, width: 1.2, height: 1.2, sill: 0.9, hinge: 'start', swing: 'left',
  }

  it('leaves an opening that fits alone', () => {
    expect(fitOpening(base, 4, 2.7)).toEqual(base)
  })

  it('keeps it inside the wall ends, 0.1 m clear', () => {
    expect(fitOpening({ ...base, position: 0.2 }, 4, 2.7).position).toBeCloseTo(0.7, 9)
    expect(fitOpening({ ...base, position: 9 }, 4, 2.7).position).toBeCloseTo(3.3, 9)
  })

  it('narrows it for a wall that became too short', () => {
    const fitted = fitOpening(base, 1, 2.7)
    expect(fitted.width).toBeCloseTo(0.8, 9)
    expect(fitted.position).toBeCloseTo(0.5, 9)
  })

  it('keeps the top at or below the top of the wall', () => {
    const fitted = fitOpening(base, 4, 1.5)
    expect(fitted.sill + fitted.height).toBeLessThanOrEqual(1.5)
    expect(fitted.sill).toBe(0.9)
    expect(fitted.height).toBeCloseTo(0.6, 9)
  })
})

describe('scaleOpenings', () => {
  it('scales position and width with the plan, but not heights', () => {
    const o: Opening = {
      id: 'o', wallId: 'w', type: 'door', position: 2, width: 0.9, height: 2.1, sill: 0, hinge: 'start', swing: 'left',
    }
    expect(scaleOpenings([o], 2)).toEqual([{ ...o, position: 4, width: 1.8 }])
  })
})
