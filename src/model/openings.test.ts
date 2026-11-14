import { describe, expect, it } from 'vitest'
import { fitOpening, placeOpening, scaleOpenings, type Opening } from './openings'
import { createWall } from './walls'

const p = (x: number, z: number) => ({ x, z })
const wall = (length: number, height = 2.7) => createWall(p(0, 0), p(length, 0), { height, thickness: 0.2 })

describe('placeOpening', () => {
  it('centres a standard door on an empty wall', () => {
    const w = wall(4)
    expect(placeOpening(w, [], 'door')).toMatchObject({
      wallId: w.id, type: 'door', position: 2, width: 0.9, height: 2.1, sill: 0,
    })
  })

  it('gives a window a sill', () => {
    expect(placeOpening(wall(4), [], 'window')).toMatchObject({ type: 'window', width: 1.2, height: 1.2, sill: 0.9 })
  })

  it('puts the next opening in the largest free stretch of the wall', () => {
    const w = wall(6)
    const door = { ...placeOpening(w, [], 'door')!, position: 1 } // occupies 0.55 .. 1.45
    const window = placeOpening(w, [door], 'window')!
    // Free stretches: 0.1 .. 0.55 and 1.45 .. 5.9. The window goes in the middle of the second.
    expect(window.position).toBeCloseTo((1.45 + 5.9) / 2, 9)
  })

  it('ignores openings on other walls', () => {
    const w = wall(4)
    const elsewhere = { ...placeOpening(wall(4), [], 'door')! }
    expect(placeOpening(w, [elsewhere], 'door')!.position).toBe(2)
  })

  it('returns null when nothing fits', () => {
    expect(placeOpening(wall(0.8), [], 'door')).toBeNull()
    const w = wall(2)
    const door = placeOpening(w, [], 'door')!
    expect(placeOpening(w, [door], 'window')).toBeNull()
  })

  it('shortens a door for a low wall', () => {
    expect(placeOpening(wall(4, 1.5), [], 'door')).toMatchObject({ height: 1.5, sill: 0 })
  })
})

describe('fitOpening', () => {
  const base: Opening = { id: 'o', wallId: 'w', type: 'window', position: 2, width: 1.2, height: 1.2, sill: 0.9 }

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
    const o: Opening = { id: 'o', wallId: 'w', type: 'door', position: 2, width: 0.9, height: 2.1, sill: 0 }
    expect(scaleOpenings([o], 2)).toEqual([{ ...o, position: 4, width: 1.8 }])
  })
})
