import { describe, expect, it } from 'vitest'
import { ceilingHeightAt, createLight, kelvinToHex, lightIntensity, pointInPolygon, scaleLights } from './lights'
import { detectRooms } from './rooms'
import { wallsFromChain, WALL_DEFAULTS } from './walls'

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

describe('kelvinToHex', () => {
  it('is white at about 6600 K', () => {
    expect(kelvinToHex(6600)).toBe('#ffffff')
  })

  it('matches the published values for a warm white bulb', () => {
    expect(kelvinToHex(2700)).toBe('#ffa757')
  })

  it('is candle orange at 1900 K, with no blue', () => {
    const [r, g, b] = channels(kelvinToHex(1900))
    expect(r).toBe(255)
    expect(g).toBeGreaterThan(100)
    expect(g).toBeLessThan(160)
    expect(b).toBe(0)
  })

  it('turns blue above daylight', () => {
    const [r, g, b] = channels(kelvinToHex(10000))
    expect(b).toBe(255)
    expect(r).toBeLessThan(g)
    expect(g).toBeLessThan(b)
  })

  it('grows steadily cooler across the slider range', () => {
    let previous = -1
    for (let k = 2000; k <= 6500; k += 100) {
      const [r, , b] = channels(kelvinToHex(k))
      expect(r).toBe(255)
      expect(b).toBeGreaterThan(previous)
      previous = b
    }
  })
})

describe('lights', () => {
  it('start as an 800 lm warm white bulb', () => {
    expect(createLight({ x: 1, z: 2 })).toMatchObject({ position: { x: 1, z: 2 }, lumens: 800, kelvin: 3000 })
  })

  it('give light in proportion to their lumens', () => {
    expect(lightIntensity(1600)).toBeCloseTo(2 * lightIntensity(800), 9)
  })

  it('move with the plan when it is rescaled', () => {
    const [scaled] = scaleLights([createLight({ x: 1, z: -2 })], 2)
    expect(scaled.position).toEqual({ x: 2, z: -4 })
    expect(scaled.lumens).toBe(800)
  })
})

describe('pointInPolygon', () => {
  // An L: a 4 x 4 square with its top-right 2 x 2 quarter cut out.
  const L = [
    { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 0, z: 4 },
  ]

  it.each([
    [1, 1, true],
    [3, 3, true],
    [3, 1, false], // in the cut-out
    [5, 3, false],
    [-1, 1, false],
  ])('(%d, %d) inside: %s', (x, z, inside) => {
    expect(pointInPolygon({ x, z }, L)).toBe(inside)
  })
})

describe('ceilingHeightAt', () => {
  const corners = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }, { x: 0, z: 0 }]
  const walls = wallsFromChain(corners, { ...WALL_DEFAULTS, height: 2.4 })
  walls[0] = { ...walls[0], height: 2.2 }
  const rooms = detectRooms(walls)

  it('is the lowest wall of the room around the point', () => {
    expect(ceilingHeightAt({ x: 2, z: 1.5 }, rooms, walls, 2.7)).toBe(2.2)
  })

  it('is the fallback outside every room', () => {
    expect(ceilingHeightAt({ x: 10, z: 10 }, rooms, walls, 2.7)).toBe(2.7)
  })
})
