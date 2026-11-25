import { describe, expect, it } from 'vitest'
import { describeLength, formatFeetInches, parseLength } from './units'

describe('parseLength', () => {
  it('reads metric and imperial lengths into metres', () => {
    expect(parseLength('195 cm')).toBeCloseTo(1.95)
    expect(parseLength('4.5m')).toBeCloseTo(4.5)
    expect(parseLength('900 mm')).toBeCloseTo(0.9)
    expect(parseLength('110.2 inch')).toBeCloseTo(2.79908)
    expect(parseLength('9 ft 2.2 in')).toBeCloseTo(2.79908)
    expect(parseLength(`9'2.2"`)).toBeCloseTo(2.79908)
    expect(parseLength('6 feet and 2 inches')).toBeCloseTo(1.8796)
  })

  it('refuses what is not wholly a length, rather than guessing', () => {
    for (const text of ['', 'tall', '12', '12 parsecs', '3 m of rope', 'L 195 cm']) expect(parseLength(text)).toBeUndefined()
  })
})

describe('formatFeetInches', () => {
  it('matches the conversions asked for in this project', () => {
    expect(formatFeetInches(94.5 * 0.0254)).toBe('7 ft 10.5 in')
    expect(formatFeetInches(41.3 * 0.0254)).toBe('3 ft 5.3 in')
    expect(formatFeetInches(27.2 * 0.0254)).toBe('2 ft 3.2 in')
    expect(formatFeetInches(1.95)).toBe('6 ft 4.8 in')
    expect(formatFeetInches(0.5)).toBe('1 ft 7.7 in')
    expect(formatFeetInches(0.41)).toBe('1 ft 4.1 in')
  })

  it('carries a rounded-up 12 inches into the feet, and leaves out zero feet', () => {
    expect(formatFeetInches(0.3047)).toBe('1 ft 0 in')
    expect(formatFeetInches(0.2)).toBe('7.9 in')
  })
})

describe('describeLength', () => {
  it('gives metres and feet and inches', () => {
    expect(describeLength('195 cm')).toBe('195 cm = 1.95 m = 6 ft 4.8 in')
  })
  it('says so when it cannot read the text', () => {
    expect(describeLength('big')).toBe('big = could not read this as a length')
  })
})
