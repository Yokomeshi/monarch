import { describe, expect, it } from 'vitest'
import { detectPlan, detectWalls, type Raster } from './detectWalls'

type Rgb = [number, number, number]
const BLACK: Rgb = [0, 0, 0]
const RED: Rgb = [220, 40, 40]

/** A white image. */
function blank(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }
}

/** Fills the pixels x0 <= x < x1, y0 <= y < y1. */
function fill(image: Raster, x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb = BLACK, alpha = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) image.data.set([r, g, b, alpha], (y * image.width + x) * 4)
  }
}

const options = { minThickness: 5, minLength: 40, maxGap: 60 }

describe('detectWalls', () => {
  it('finds the six walls of the fixture layout, joined at their junctions', () => {
    const plan = blank(1000, 800)
    fill(plan, 34, 34, 966, 46) // outer walls, 12 px thick, centre-lines at 40 and 960 / 760
    fill(plan, 34, 754, 966, 766)
    fill(plan, 34, 34, 46, 766)
    fill(plan, 954, 34, 966, 766)
    fill(plan, 40, 296, 600, 304) // inner walls, 8 px thick, meeting at (600, 300)
    fill(plan, 596, 300, 604, 760)
    fill(plan, 250, 399, 750, 402, RED) // dimension line, drawn over the inner wall
    fill(plan, 249, 380, 252, 420, RED)
    fill(plan, 100, 500, 500, 503) // thin black lines
    fill(plan, 800, 100, 803, 700)

    expect(detectWalls(plan, options)).toEqual([
      { start: { x: 40, y: 40 }, end: { x: 960, y: 40 }, thickness: 12 },
      { start: { x: 40, y: 300 }, end: { x: 600, y: 300 }, thickness: 8 }, // T on the left wall, L at (600, 300)
      { start: { x: 40, y: 760 }, end: { x: 960, y: 760 }, thickness: 12 },
      { start: { x: 40, y: 40 }, end: { x: 40, y: 760 }, thickness: 12 },
      { start: { x: 600, y: 300 }, end: { x: 600, y: 760 }, thickness: 8 }, // T on the bottom wall
      { start: { x: 960, y: 40 }, end: { x: 960, y: 760 }, thickness: 12 },
    ])
  })

  it('reports the centre-line and the pixel-edge ends of a free-standing wall', () => {
    const image = blank(300, 100)
    fill(image, 20, 34, 220, 46) // rows 34..45
    expect(detectWalls(image, options)).toEqual([{ start: { x: 20, y: 40 }, end: { x: 220, y: 40 }, thickness: 12 }])
  })

  it('bridges a door gap up to maxGap, in either direction', () => {
    const image = blank(400, 400)
    fill(image, 20, 20, 150, 30)
    fill(image, 210, 20, 380, 30) // 60 px gap
    fill(image, 20, 100, 30, 200)
    fill(image, 20, 250, 30, 380) // 50 px gap
    expect(detectWalls(image, options)).toEqual([
      { start: { x: 20, y: 25 }, end: { x: 380, y: 25 }, thickness: 10 },
      { start: { x: 25, y: 100 }, end: { x: 25, y: 380 }, thickness: 10 },
    ])
  })

  it('leaves a gap wider than maxGap as two walls', () => {
    const image = blank(400, 100)
    fill(image, 20, 20, 150, 30)
    fill(image, 211, 20, 380, 30) // 61 px gap
    expect(detectWalls(image, options)).toEqual([
      { start: { x: 20, y: 25 }, end: { x: 150, y: 25 }, thickness: 10 },
      { start: { x: 211, y: 25 }, end: { x: 380, y: 25 }, thickness: 10 },
    ])
  })

  it('does not join parallel walls that are not collinear', () => {
    const image = blank(400, 100)
    fill(image, 20, 20, 150, 30)
    fill(image, 170, 40, 380, 50)
    expect(detectWalls(image, options)).toHaveLength(2)
  })

  it('ignores thick blobs shorter than minLength, and filled squares', () => {
    const image = blank(300, 300)
    fill(image, 20, 20, 50, 40) // 30 x 20
    fill(image, 100, 100, 160, 160) // 60 x 60: long enough, but no longer than it is thick
    expect(detectWalls(image, options)).toEqual([])
  })

  it('ignores lines thinner than minThickness', () => {
    const image = blank(300, 300)
    fill(image, 20, 50, 280, 54) // 4 px
    fill(image, 150, 20, 154, 280)
    expect(detectWalls(image, options)).toEqual([])
  })

  it('does not let a thin line extend the wall it runs out of', () => {
    const image = blank(400, 100)
    fill(image, 20, 20, 150, 30)
    fill(image, 150, 24, 380, 26)
    expect(detectWalls(image, options)).toEqual([{ start: { x: 20, y: 25 }, end: { x: 150, y: 25 }, thickness: 10 }])
  })

  it('ignores coloured and transparent strokes but detects dark grey', () => {
    const image = blank(300, 300)
    fill(image, 20, 20, 280, 30, [255, 0, 0])
    fill(image, 20, 60, 280, 70, [0, 0, 255])
    fill(image, 20, 100, 280, 110, [90, 90, 90])
    fill(image, 20, 140, 280, 150, [200, 200, 200])
    fill(image, 20, 180, 280, 190, BLACK, 0)
    expect(detectWalls(image, options)).toEqual([{ start: { x: 20, y: 105 }, end: { x: 280, y: 105 }, thickness: 10 }])
  })

  it('finds nothing in an empty image', () => {
    expect(detectWalls(blank(200, 200), options)).toEqual([])
  })

  it('lists horizontal walls by y then x, then vertical walls by x then y', () => {
    const image = blank(500, 500)
    fill(image, 300, 200, 310, 300) // vertical, x = 305
    fill(image, 100, 350, 110, 450) // vertical, x = 105, lower
    fill(image, 100, 100, 110, 200) // vertical, x = 105, upper
    fill(image, 350, 20, 480, 30) // horizontal, y = 25, right (too far to bridge)
    fill(image, 150, 400, 250, 410) // horizontal, y = 405
    fill(image, 150, 20, 250, 30) // horizontal, y = 25, left
    expect(detectWalls(image, options).map((w) => [w.start.x, w.start.y])).toEqual([
      [150, 25],
      [350, 25],
      [150, 405],
      [105, 100],
      [105, 350],
      [305, 200],
    ])
  })

  it('measures a horizontal wall alone, not the stubs and the wall hanging from it', () => {
    const image = blank(700, 400)
    fill(image, 50, 100, 650, 120) // the wall: rows 100..119, centre-line y = 110
    fill(image, 150, 120, 195, 150) // column stubs below it, 45 x 30
    fill(image, 400, 120, 445, 150)
    fill(image, 300, 120, 310, 300) // perpendicular wall meeting it
    expect(detectWalls(image, options)).toEqual([
      { start: { x: 50, y: 110 }, end: { x: 650, y: 110 }, thickness: 20 },
      { start: { x: 305, y: 110 }, end: { x: 305, y: 300 }, thickness: 10 },
    ])
  })

  it('measures a vertical wall alone, not the stubs and the wall hanging from it', () => {
    const image = blank(400, 700)
    fill(image, 100, 50, 120, 650) // the wall: columns 100..119, centre-line x = 110
    fill(image, 120, 150, 150, 195) // column stubs beside it, 30 x 45
    fill(image, 120, 400, 150, 445)
    fill(image, 120, 300, 300, 310) // perpendicular wall meeting it
    expect(detectWalls(image, options)).toEqual([
      { start: { x: 110, y: 305 }, end: { x: 300, y: 305 }, thickness: 10 },
      { start: { x: 110, y: 50 }, end: { x: 110, y: 650 }, thickness: 20 },
    ])
  })

  it('keeps a wall with ragged ends as one wall of its full thickness', () => {
    const image = blank(400, 100)
    fill(image, 22, 20, 320, 25)
    fill(image, 20, 25, 317, 30)
    fill(image, 23, 30, 319, 36)
    expect(detectWalls(image, options)).toEqual([{ start: { x: 20, y: 28 }, end: { x: 320, y: 28 }, thickness: 16 }])
  })

  it('handles a 2000 x 2000 image quickly', () => {
    const image = blank(2000, 2000)
    for (let i = 100; i < 2000; i += 200) {
      fill(image, 50, i, 1950, i + 10)
      fill(image, i, 50, i + 10, 1950)
    }
    const started = performance.now()
    expect(detectWalls(image, options)).toHaveLength(20)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

describe('detectPlan', () => {
  it('reports the door gap bridged in a horizontal wall', () => {
    const image = blank(400, 200)
    fill(image, 20, 100, 380, 110) // wall 0, no gap
    fill(image, 20, 20, 150, 30)
    fill(image, 200, 20, 380, 30) // 50 px gap, 130 px from the start
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toEqual(detectWalls(image, options))
    expect(walls).toHaveLength(2)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].wall).toBe(0)
    expect(Math.abs(gaps[0].start - 130)).toBeLessThanOrEqual(1)
    expect(Math.abs(gaps[0].end - 180)).toBeLessThanOrEqual(1)
  })

  it('reports both gaps of a wall merged from three pieces, in order', () => {
    const image = blank(500, 100)
    fill(image, 20, 20, 120, 30)
    fill(image, 160, 20, 300, 30) // 40 px gap
    fill(image, 350, 20, 480, 30) // 50 px gap
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toEqual([{ start: { x: 20, y: 25 }, end: { x: 480, y: 25 }, thickness: 10 }])
    expect(gaps).toEqual([
      { wall: 0, start: 100, end: 140 },
      { wall: 0, start: 280, end: 330 },
    ])
  })

  it('measures a gap in a vertical wall downwards from its top end', () => {
    const image = blank(400, 400)
    fill(image, 100, 20, 300, 30) // horizontal wall 0
    fill(image, 20, 100, 30, 200)
    fill(image, 20, 250, 30, 380) // 50 px gap
    const { walls, gaps } = detectPlan(image, options)
    expect(walls[1]).toEqual({ start: { x: 25, y: 100 }, end: { x: 25, y: 380 }, thickness: 10 })
    expect(gaps).toEqual([{ wall: 1, start: 100, end: 150 }])
  })

  it('measures gap offsets from a start snapped onto a perpendicular wall', () => {
    const image = blank(400, 300)
    fill(image, 20, 20, 32, 280) // vertical wall, centre-line x = 26
    fill(image, 32, 100, 150, 110) // ink starts at 32, start snaps to 26
    fill(image, 200, 100, 380, 110) // gap 150..200
    const { walls, gaps } = detectPlan(image, options)
    expect(walls[0].start).toEqual({ x: 26, y: 105 })
    expect(gaps).toEqual([{ wall: 0, start: 124, end: 174 }])
  })

  it('does not report a gap wider than maxGap', () => {
    const image = blank(400, 100)
    fill(image, 20, 20, 150, 30)
    fill(image, 211, 20, 380, 30) // 61 px gap
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toHaveLength(2)
    expect(gaps).toEqual([])
  })

  it('returns no gaps for a plan without any', () => {
    const image = blank(300, 300)
    fill(image, 20, 20, 280, 30)
    fill(image, 20, 20, 30, 280)
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toHaveLength(2)
    expect(gaps).toEqual([])
  })

  it('joins collinear pieces whose centre-lines differ by a few pixels into one wall with one centre-line', () => {
    const image = blank(400, 100)
    fill(image, 20, 20, 200, 40) // centre-line y = 30, the longer piece
    fill(image, 250, 24, 380, 44) // centre-line y = 34, beyond a 50 px gap
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toEqual([{ start: { x: 20, y: 30 }, end: { x: 380, y: 30 }, thickness: 20 }])
    expect(gaps).toEqual([{ wall: 0, start: 180, end: 230 }])
  })

  it('ends both thick walls of an L corner on the same point', () => {
    const image = blank(400, 400)
    fill(image, 20, 20, 300, 42) // centre-line y = 31
    fill(image, 20, 20, 40, 300) // centre-line x = 30
    const { walls } = detectPlan(image, options)
    expect(walls).toEqual([
      { start: { x: 30, y: 31 }, end: { x: 300, y: 31 }, thickness: 22 },
      { start: { x: 30, y: 31 }, end: { x: 30, y: 300 }, thickness: 20 },
    ])
  })

  it('keeps a short thick piece beyond a gap at either end of a wall, but not an isolated one', () => {
    const image = blank(400, 500)
    fill(image, 100, 20, 120, 300) // vertical wall, 20 px thick
    fill(image, 100, 350, 120, 375) // its last piece beyond a 50 px window: 25 px, shorter than minLength
    fill(image, 20, 440, 45, 460) // the first piece of a horizontal wall, 25 px long
    fill(image, 95, 440, 280, 460)
    fill(image, 300, 100, 320, 125) // the same blob, in line with no wall
    fill(image, 341, 438, 366, 462) // in line with the horizontal wall, but 61 px beyond its end
    fill(image, 200, 20, 380, 30) // a thin wall
    fill(image, 150, 20, 175, 30) // a short piece in line with it, too thin to tell from a letter
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toEqual([
      { start: { x: 200, y: 25 }, end: { x: 380, y: 25 }, thickness: 10 },
      { start: { x: 20, y: 450 }, end: { x: 280, y: 450 }, thickness: 20 },
      { start: { x: 110, y: 20 }, end: { x: 110, y: 375 }, thickness: 20 },
    ])
    expect(gaps).toEqual([
      { wall: 1, start: 25, end: 75 },
      { wall: 2, start: 280, end: 330 },
    ])
  })

  it('drops a wall that snapping leaves shorter than minLength, keeping gap indices valid', () => {
    const image = blank(500, 300)
    fill(image, 100, 20, 138, 280) // vertical wall, 38 px thick, centre-line x = 119
    fill(image, 97, 50, 141, 60) // 44 px nub across it: both ends snap to x = 119
    fill(image, 200, 200, 300, 210)
    fill(image, 350, 200, 480, 210) // 50 px gap
    const { walls, gaps } = detectPlan(image, options)
    expect(walls).toEqual([
      { start: { x: 200, y: 205 }, end: { x: 480, y: 205 }, thickness: 10 },
      { start: { x: 119, y: 20 }, end: { x: 119, y: 280 }, thickness: 38 },
    ])
    expect(gaps).toEqual([{ wall: 0, start: 100, end: 150 }])
  })
})
