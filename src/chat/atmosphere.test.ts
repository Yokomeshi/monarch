import { describe, expect, it } from 'vitest'
import { skyFor } from './atmosphere'

const red = (c: number) => (c >> 16) & 255
const blue = (c: number) => c & 255
const brightness = (c: number) => red(c) + ((c >> 8) & 255) + blue(c)

describe('skyFor', () => {
  it('puts the sun 60 degrees up in the south at noon, white and strong, under a blue sky', () => {
    const s = skyFor(12, 'clear')
    expect(s.elevation).toBeCloseTo(60)
    expect(s.lightDirection[2]).toBeGreaterThan(0) // toward the south
    expect(s.lightIntensity).toBeCloseTo(2.2)
    expect(blue(s.background)).toBeGreaterThan(red(s.background))
    expect(s.shadows).toBe(true)
  })

  it('rises in the east and sets in the west, orange and low', () => {
    const dawn = skyFor(6, 'clear')
    const dusk = skyFor(18, 'clear')
    expect(dawn.lightDirection[0]).toBeGreaterThan(0.9)
    expect(dusk.lightDirection[0]).toBeLessThan(-0.9)
    expect(red(dawn.lightColor)).toBeGreaterThan(blue(dawn.lightColor) + 80)
    const evening = skyFor(17.5, 'clear')
    expect(evening.elevation).toBeGreaterThan(0)
    expect(evening.elevation).toBeLessThan(15)
    expect(red(evening.lightColor)).toBeGreaterThan(blue(evening.lightColor))
  })

  it('is dark at night, lit only by a dim blue moon shining down', () => {
    const s = skyFor(0, 'clear')
    expect(s.elevation).toBeLessThan(0)
    expect(s.lightDirection[1]).toBeGreaterThan(0) // shines downward
    expect(s.lightIntensity).toBeLessThan(0.5)
    expect(blue(s.lightColor)).toBeGreaterThan(red(s.lightColor))
    expect(brightness(s.background)).toBeLessThan(brightness(skyFor(12, 'clear').background) / 4)
    expect(s.skyLight).toBeLessThan(0.3)
    expect(s.shadows).toBe(false)
  })

  it('wraps around the clock', () => {
    expect(skyFor(25, 'clear')).toEqual(skyFor(1, 'clear'))
    expect(skyFor(-6, 'clear')).toEqual(skyFor(18, 'clear'))
  })

  it('always gives a unit direction', () => {
    for (let h = 0; h < 24; h += 0.5) expect(Math.hypot(...skyFor(h, 'clear').lightDirection)).toBeCloseTo(1)
  })

  it('weakens the sun and greys the sky when overcast, and adds fog when foggy', () => {
    const clear = skyFor(12, 'clear')
    const overcast = skyFor(12, 'overcast')
    const fog = skyFor(12, 'fog')
    expect(overcast.lightIntensity).toBeCloseTo(clear.lightIntensity * 0.2)
    expect(fog.lightIntensity).toBeLessThan(overcast.lightIntensity)
    expect(overcast.shadows).toBe(true) // 0.44 is still enough for a soft shadow
    expect(fog.shadows).toBe(false)
    expect(Math.abs(red(overcast.background) - blue(overcast.background))).toBeLessThan(20) // grey
    expect([clear.fog, overcast.fog, fog.fog]).toEqual([false, false, true])
  })

  it('is a self-contained function, since the viewport page gets only its source text', () => {
    const copy = new Function(`return (${skyFor.toString()})`)()
    expect(copy(15, 'overcast')).toEqual(skyFor(15, 'overcast'))
  })
})
