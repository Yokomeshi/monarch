import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES, estimate, formatMoney, parseRates, rateForDisplay, rateFromDisplay, type CostRates } from './cost'
import type { Takeoff } from './takeoff'

const ZERO: Takeoff = {
  wallLength: 0,
  wallArea: 0,
  floorArea: 0,
  ceilingArea: 0,
  rooms: 0,
  doors: 0,
  windows: 0,
  furniture: 0,
  lights: 0,
}

const RATES: CostRates = { wall: 10, floor: 20, ceiling: 5, door: 100, window: 200, light: 50 }

describe('DEFAULT_RATES', () => {
  it('are valid rates', () => {
    expect(parseRates(DEFAULT_RATES)).toEqual(DEFAULT_RATES)
  })
})

describe('estimate', () => {
  const takeoff: Takeoff = {
    ...ZERO,
    wallLength: 99,
    wallArea: 30,
    floorArea: 12.5,
    ceilingArea: 12.5,
    rooms: 1,
    doors: 2,
    windows: 3,
    furniture: 7,
    lights: 4,
  }

  it('multiplies each quantity by its rate', () => {
    const { lines, total } = estimate(takeoff, RATES)
    expect(lines).toEqual([
      { key: 'wall', label: 'Walls', quantity: 30, unit: 'area', rate: 10, cost: 300 },
      { key: 'floor', label: 'Floors', quantity: 12.5, unit: 'area', rate: 20, cost: 250 },
      { key: 'ceiling', label: 'Ceilings', quantity: 12.5, unit: 'area', rate: 5, cost: 62.5 },
      { key: 'door', label: 'Doors', quantity: 2, unit: 'each', rate: 100, cost: 200 },
      { key: 'window', label: 'Windows', quantity: 3, unit: 'each', rate: 200, cost: 600 },
      { key: 'light', label: 'Lights', quantity: 4, unit: 'each', rate: 50, cost: 200 },
    ])
    expect(total).toBe(1612.5)
  })

  it('does not cost furniture, rooms or wall length', () => {
    const more = { ...takeoff, furniture: 100, rooms: 9, wallLength: 1000 }
    expect(estimate(more, RATES).total).toBe(1612.5)
  })

  it('costs an empty model at zero', () => {
    const { lines, total } = estimate(ZERO, DEFAULT_RATES)
    expect(lines).toHaveLength(6)
    expect(lines.every((l) => l.cost === 0)).toBe(true)
    expect(total).toBe(0)
  })
})

describe('formatMoney', () => {
  it('rounds to whole units', () => {
    expect(formatMoney(12345.6)).toBe('12,346')
    expect(formatMoney(0.4)).toBe('0')
    expect(formatMoney(999.5)).toBe('1,000')
  })

  it('separates thousands', () => {
    expect(formatMoney(0)).toBe('0')
    expect(formatMoney(999)).toBe('999')
    expect(formatMoney(1000)).toBe('1,000')
    expect(formatMoney(123456)).toBe('123,456')
    expect(formatMoney(1234567)).toBe('1,234,567')
  })

  it('handles negative amounts', () => {
    expect(formatMoney(-1234.4)).toBe('-1,234')
    expect(formatMoney(-0.2)).toBe('0')
  })
})

describe('rateForDisplay and rateFromDisplay', () => {
  it('leave metric rates alone', () => {
    expect(rateForDisplay(80, 'area', 'metric')).toBe(80)
    expect(rateFromDisplay(80, 'area', 'metric')).toBe(80)
    expect(rateForDisplay(400, 'each', 'metric')).toBe(400)
    expect(rateFromDisplay(400, 'each', 'metric')).toBe(400)
  })

  it('show area rates per square foot in imperial', () => {
    // 1 sq ft = 0.09290304 m², so 100 per m² is about 9.29 per sq ft.
    expect(rateForDisplay(100, 'area', 'imperial')).toBeCloseTo(9.290304, 6)
    expect(rateFromDisplay(10, 'area', 'imperial')).toBeCloseTo(107.639104, 6)
  })

  it('leave each-rates alone in imperial', () => {
    expect(rateForDisplay(400, 'each', 'imperial')).toBe(400)
    expect(rateFromDisplay(400, 'each', 'imperial')).toBe(400)
  })

  it('round trip in both units', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (const unit of ['area', 'each'] as const) {
        expect(rateFromDisplay(rateForDisplay(123.45, unit, units), unit, units)).toBeCloseTo(123.45, 9)
      }
    }
  })
})

describe('parseRates', () => {
  it('accepts six finite non-negative numbers', () => {
    expect(parseRates(RATES)).toEqual(RATES)
    expect(parseRates({ ...RATES, wall: 0 })).toEqual({ ...RATES, wall: 0 })
  })

  it('returns a fresh object with only the six fields', () => {
    const input = { ...RATES, furniture: 5 }
    const parsed = parseRates(input)
    expect(parsed).toEqual(RATES)
    expect(parsed).not.toBe(input)
  })

  it('rejects a missing field', () => {
    expect(parseRates({ wall: 10, floor: 20, ceiling: 5, door: 100, window: 200 })).toBeNull()
    expect(parseRates({})).toBeNull()
  })

  it('rejects negative and non-finite rates', () => {
    expect(parseRates({ ...RATES, door: -1 })).toBeNull()
    expect(parseRates({ ...RATES, door: NaN })).toBeNull()
    expect(parseRates({ ...RATES, door: Infinity })).toBeNull()
  })

  it('rejects non-numeric rates', () => {
    expect(parseRates({ ...RATES, floor: '20' })).toBeNull()
    expect(parseRates({ ...RATES, floor: null })).toBeNull()
  })

  it('rejects input that is not an object', () => {
    for (const v of [null, undefined, 42, 'rates', [], [1, 2, 3, 4, 5, 6]]) expect(parseRates(v)).toBeNull()
  })
})
