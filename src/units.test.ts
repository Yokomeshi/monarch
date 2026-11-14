import { describe, expect, it } from 'vitest'
import { formatLength, parseLength } from './units'

describe('formatLength', () => {
  it('formats metric to the millimetre', () => {
    expect(formatLength(6.096, 'metric')).toBe('6.096 m')
  })

  it('formats imperial as feet and inches', () => {
    expect(formatLength(3.048, 'imperial')).toBe(`10' 0"`)
    expect(formatLength(3.2004, 'imperial')).toBe(`10' 6"`)
  })

  it('rounds to the nearest eighth and reduces the fraction', () => {
    expect(formatLength(0.0254 * 3.5, 'imperial')).toBe(`0' 3 1/2"`)
    expect(formatLength(0.0254 * 3.125, 'imperial')).toBe(`0' 3 1/8"`)
  })

  it('carries 12 inches into the next foot', () => {
    expect(formatLength(0.3048 * 2 - 0.0001, 'imperial')).toBe(`2' 0"`)
  })
})

describe('parseLength', () => {
  const ft = 0.3048
  const inch = 0.0254

  it.each([
    ['10', 10 * ft],
    [`10'`, 10 * ft],
    ['10 ft', 10 * ft],
    [`10' 6"`, 10 * ft + 6 * inch],
    ['10ft 6in', 10 * ft + 6 * inch],
    [`10' 6`, 10 * ft + 6 * inch],
    [`126"`, 126 * inch],
  ])('imperial %s', (input, metres) => {
    expect(parseLength(input, 'imperial')).toBeCloseTo(metres, 9)
  })

  it.each([
    ['3.2', 3.2],
    ['3.2 m', 3.2],
    ['320 cm', 3.2],
    ['3200mm', 3.2],
  ])('metric %s', (input, metres) => {
    expect(parseLength(input, 'metric')).toBeCloseTo(metres, 9)
  })

  it.each(['', 'abc', `10' 6" x`, '-3'])('rejects %j', (input) => {
    expect(parseLength(input, 'imperial')).toBeNull()
    expect(parseLength(input, 'metric')).toBeNull()
  })

  it('round-trips through formatLength', () => {
    const m = parseLength(formatLength(4.2672, 'imperial'), 'imperial')!
    expect(m).toBeCloseTo(4.2672, 3)
  })
})
