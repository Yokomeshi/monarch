import { describe, expect, it } from 'vitest'
import type { Raster } from '../plan/detectWalls'
import { describePlan, readPlan } from './floorPlan'

/** A white page with black rectangles [x, y, width, height] painted on it. */
function plan(width: number, height: number, ink: [number, number, number, number][]): Raster {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [x0, y0, w, h] of ink) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([20, 20, 20, 255], (y * width + x) * 4)
  }
  return { width, height, data }
}

// 1200 x 900 px at 100 px per metre: a 10 m x 7 m shell of 16 px (0.16 m) walls, outer edge to outer edge
// 100..1100 across and 100..800 down, with a 0.9 m door gap in the bottom wall (x 520..610).
const SHELL: [number, number, number, number][] = [
  [100, 100, 1000, 16], // top
  [100, 784, 420, 16], // bottom, left of the door
  [610, 784, 490, 16], // bottom, right of the door
  [100, 100, 16, 700], // left
  [1084, 100, 16, 700], // right
]
const shell = () => plan(1200, 900, SHELL)

describe('readPlan', () => {
  it('finds the walls and measures the plan in pixels before it has a scale', () => {
    const r = readPlan(shell())
    expect(r.walls).toHaveLength(4)
    expect(r.extentPx.width).toBeCloseTo(1000, -1)
    expect(r.extentPx.depth).toBeCloseTo(700, -1)
    expect(r.plan).toBeUndefined()
    expect(r.metresPerPx).toBeUndefined()
  })

  it('gives walls in metres about the middle of the plan once a real width is given', () => {
    const r = readPlan(shell(), { axis: 'width', metres: 10 })
    expect(r.size!.width).toBeCloseTo(10, 1)
    expect(r.size!.depth).toBeCloseTo(7, 1)
    expect(r.plan).toHaveLength(4)
    const top = r.plan!.find((w) => w.start[1] === w.end[1] && w.start[1] < 0)!
    expect(top.start[1]).toBeCloseTo(-3.42, 1) // (108 - 450) px at 1 cm a pixel
    expect(top.start[0]).toBeCloseTo(-4.92, 1)
    expect(top.end[0]).toBeCloseTo(4.92, 1)
    expect(top.thickness).toBeCloseTo(0.16, 2)
  })

  it('reaches the same plan from the depth as from the width', () => {
    const a = readPlan(shell(), { axis: 'width', metres: 10 })
    const b = readPlan(shell(), { axis: 'depth', metres: 7 })
    expect(b.size!.width).toBeCloseTo(a.size!.width, 1)
    expect(b.metresPerPx).toBeCloseTo(a.metresPerPx!, 4)
  })

  it('finds the door gap as an opening in the right wall at the right place and width', () => {
    const r = readPlan(shell(), { axis: 'width', metres: 10 })
    const bottom = r.plan!.find((w) => w.openings.length > 0)!
    expect(bottom.start[1]).toBeGreaterThan(0)
    expect(bottom.openings).toHaveLength(1)
    expect(bottom.openings[0].width).toBeCloseTo(0.9, 1)
    // Wall starts at the left corner centre (-4.92 m); the gap's middle is at x 565 px, 4.57 m along.
    expect(bottom.openings[0].position).toBeCloseTo(4.57, 1)
    expect(bottom.openings[0].id).toBe(`${bottom.id}.1`)
    expect(r.openings).toHaveLength(1)
  })

  it('leaves out gaps too narrow to be openings, such as a break in the drawing', () => {
    const narrow = plan(1200, 900, [[100, 100, 1000, 16], [100, 784, 480, 16], [610, 784, 490, 16], [100, 100, 16, 700], [1084, 100, 16, 700]]) // a 0.3 m break
    const r = readPlan(narrow, { axis: 'width', metres: 10 })
    expect(r.plan!.every((w) => w.openings.length === 0)).toBe(true)
  })

  it('finds nothing on a blank page', () => {
    const r = readPlan(plan(400, 300, []), { axis: 'width', metres: 5 })
    expect(r.walls).toEqual([])
    expect(r.plan).toBeUndefined()
  })
})

describe('describePlan', () => {
  it('asks for a real length when there is no scale, and says what was found', () => {
    const text = describePlan(readPlan(shell()))
    expect(text).toContain('Found 4 walls')
    expect(text).toContain('no scale')
    expect(text).toContain('overall_width_m or overall_depth_m')
    expect(text).not.toContain('"start"')
  })

  it('gives the overall size and the list to pass to walls() once it has a scale', () => {
    const text = describePlan(readPlan(shell(), { axis: 'width', metres: 10 }))
    expect(text).toContain('Found 4 walls and 1 openings')
    expect(text).toContain('10 m (32 ft 9.7 in) wide (x) by 7 m (22 ft 11.6 in) deep (z)')
    const json = JSON.parse(text.split('\n').at(-1)!)
    expect(json).toHaveLength(4)
    expect(json[0]).toMatchObject({ id: 1, start: expect.any(Array), thickness: expect.any(Number) })
  })

  it('says what this reader cannot do when it finds no walls', () => {
    expect(describePlan(readPlan(plan(400, 300, [])))).toContain('hollow')
  })
})
