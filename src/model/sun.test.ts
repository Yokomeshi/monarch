import { describe, expect, it } from 'vitest'
import { compassPoint, dayLabel, daylight, sunDirection, sunPosition, timeLabel } from './sun'

// Day numbers: 80 = 21 Mar (equinox), 172 = 21 Jun, 355 = 21 Dec.
const LONDON = 51.5

describe('sunPosition', () => {
  it('at solar noon the sun is as high as latitude and season allow', () => {
    expect(sunPosition(LONDON, 172, 12).altitude).toBeCloseTo(90 - LONDON + 23.44, 0)
    expect(sunPosition(LONDON, 355, 12).altitude).toBeCloseTo(90 - LONDON - 23.44, 0)
    expect(sunPosition(0, 80, 12).altitude).toBeGreaterThan(89)
  })

  it('rises due east at 6 and sets due west at 18 on the equinox', () => {
    const rise = sunPosition(LONDON, 80, 6)
    const set = sunPosition(LONDON, 80, 18)
    expect(Math.abs(rise.altitude)).toBeLessThan(1)
    expect(Math.abs(set.altitude)).toBeLessThan(1)
    expect(rise.azimuth).toBeCloseTo(90, 0)
    expect(set.azimuth).toBeCloseTo(270, 0)
  })

  it('is due south at noon in the northern hemisphere, due north in the southern', () => {
    expect(sunPosition(LONDON, 172, 12).azimuth).toBeCloseTo(180, 6)
    expect(sunPosition(-33.9, 172, 12).azimuth % 360).toBeCloseTo(0, 6)
  })

  it('is in the east in the morning and the west in the afternoon', () => {
    const morning = sunPosition(LONDON, 172, 9).azimuth
    const afternoon = sunPosition(LONDON, 172, 15).azimuth
    expect(morning).toBeGreaterThan(60)
    expect(morning).toBeLessThan(180)
    expect(afternoon).toBeGreaterThan(180)
    expect(afternoon).toBeLessThan(300)
    expect(morning + afternoon).toBeCloseTo(360, 6) // symmetric about noon
  })

  it('is below the horizon at night, and never sets in the arctic summer', () => {
    expect(sunPosition(LONDON, 172, 0).altitude).toBeLessThan(0)
    expect(sunPosition(LONDON, 355, 18).altitude).toBeLessThan(0)
    expect(sunPosition(75, 172, 0).altitude).toBeGreaterThan(0)
  })
})

describe('sunDirection', () => {
  const close = (v: { x: number; y: number; z: number }, x: number, y: number, z: number) => {
    expect(v.x).toBeCloseTo(x, 9)
    expect(v.y).toBeCloseTo(y, 9)
    expect(v.z).toBeCloseTo(z, 9)
  }
  const s = Math.SQRT1_2

  it('with north up in Top view: south is +z, east is +x, up is +y', () => {
    close(sunDirection({ altitude: 45, azimuth: 180 }, 0), 0, s, s)
    close(sunDirection({ altitude: 45, azimuth: 90 }, 0), s, s, 0)
    close(sunDirection({ altitude: 90, azimuth: 0 }, 0), 0, 1, 0)
    close(sunDirection({ altitude: 0, azimuth: 0 }, 0), 0, 0, -1)
  })

  it('turns with the plan when north is not up', () => {
    // North points to the right of the plan (90 degrees clockwise): a southern sun is on the left.
    close(sunDirection({ altitude: 0, azimuth: 180 }, 90), -1, 0, 0)
  })
})

describe('daylight', () => {
  it('is full with the sun well up, fades near the horizon, and is zero below it', () => {
    expect(daylight(60)).toBe(1)
    expect(daylight(10)).toBe(1)
    expect(daylight(5)).toBeCloseTo(0.5, 9)
    expect(daylight(0)).toBe(0)
    expect(daylight(-20)).toBe(0)
  })
})

describe('labels', () => {
  it('names a day of the year', () => {
    expect(dayLabel(1)).toBe('1 Jan')
    expect(dayLabel(80)).toBe('21 Mar')
    expect(dayLabel(172)).toBe('21 Jun')
    expect(dayLabel(355)).toBe('21 Dec')
    expect(dayLabel(365)).toBe('31 Dec')
  })

  it('writes solar time as hours and minutes', () => {
    expect(timeLabel(12)).toBe('12:00')
    expect(timeLabel(6.25)).toBe('06:15')
    expect(timeLabel(23.75)).toBe('23:45')
  })

  it('names a bearing by its nearest compass point', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(92)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(225)).toBe('SW')
    expect(compassPoint(350)).toBe('N')
  })
})
