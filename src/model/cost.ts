// Rough construction cost: the quantity takeoff multiplied by unit rates the user can edit.
// Furniture is deliberately not costed.

import { SQ_METRES_PER_SQ_FOOT, type Units } from '../units'
import type { Takeoff } from './takeoff'

/** Unit rates in whole currency units. Area rates are stored per square metre, whatever the display units. */
export interface CostRates {
  /** Per square metre of wall area. */
  wall: number
  /** Per square metre of floor. */
  floor: number
  /** Per square metre of ceiling. */
  ceiling: number
  /** Each. */
  door: number
  /** Each. */
  window: number
  /** Each. */
  light: number
}

/** Round placeholders to start from, not market data: the user is expected to replace them. */
export const DEFAULT_RATES: CostRates = { wall: 50, floor: 80, ceiling: 40, door: 400, window: 600, light: 150 }

export type CostKey = keyof CostRates

export interface CostLine {
  key: CostKey
  label: string
  /** Square metres for an area line, a count otherwise. */
  quantity: number
  unit: 'area' | 'each'
  rate: number
  cost: number
}

/** One line per rate, in the order of `CostRates`, and their sum. */
export function estimate(takeoff: Takeoff, rates: CostRates): { lines: CostLine[]; total: number } {
  const line = (key: CostKey, label: string, quantity: number, unit: CostLine['unit']): CostLine => ({
    key,
    label,
    quantity,
    unit,
    rate: rates[key],
    cost: quantity * rates[key],
  })
  const lines = [
    line('wall', 'Walls', takeoff.wallArea, 'area'),
    line('floor', 'Floors', takeoff.floorArea, 'area'),
    line('ceiling', 'Ceilings', takeoff.ceilingArea, 'area'),
    line('door', 'Doors', takeoff.doors, 'each'),
    line('window', 'Windows', takeoff.windows, 'each'),
    line('light', 'Lights', takeoff.lights, 'each'),
  ]
  return { lines, total: lines.reduce((total, l) => total + l.cost, 0) }
}

/**
 * Whole currency units with thousands separators and no symbol, e.g. 12345.6 -> "12,346".
 * Built by hand rather than with toLocaleString so the result is the same on every machine.
 */
export function formatMoney(amount: number): string {
  // `|| 0` turns the -0 that small negatives round to into 0.
  return String(Math.round(amount) || 0).replace(/\B(?=(\d{3})+$)/g, ',')
}

/** The rate as shown and typed: area rates are per square foot in imperial units. */
export function rateForDisplay(rate: number, unit: 'area' | 'each', units: Units): number {
  return unit === 'area' && units === 'imperial' ? rate * SQ_METRES_PER_SQ_FOOT : rate
}

/** The stored rate for a typed value: the inverse of `rateForDisplay`. */
export function rateFromDisplay(value: number, unit: 'area' | 'each', units: Units): number {
  return unit === 'area' && units === 'imperial' ? value / SQ_METRES_PER_SQ_FOOT : value
}

/**
 * Rates read from a saved file, or null unless all six are finite numbers >= 0.
 * Returns a fresh object with only those six fields, so nothing else in the file leaks into the model.
 */
export function parseRates(v: unknown): CostRates | null {
  if (typeof v !== 'object' || v === null) return null
  const record = v as Record<string, unknown>
  const rates = { ...DEFAULT_RATES }
  for (const key of Object.keys(rates) as CostKey[]) {
    const value = record[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
    rates[key] = value
  }
  return rates
}
