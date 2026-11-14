import { describe, expect, it } from 'vitest'
import { prismData } from './wallMesh'
import { wallFootprints } from './wallGeometry'
import { createWall } from './walls'

const p = (x: number, z: number) => ({ x, z })

function build(reversed = false) {
  const [a, b] = reversed ? [p(4, 0), p(0, 0)] : [p(0, 0), p(4, 0)]
  const w = createWall(a, b, { height: 2.5, thickness: 0.2 })
  return prismData(wallFootprints([w]).get(w.id)!, w.height)
}

/** Normal of triangle t (unnormalised). */
function normal(pos: number[], t: number) {
  const v = (i: number) => pos.slice((t * 3 + i) * 3, (t * 3 + i) * 3 + 3)
  const [a, b, c] = [v(0), v(1), v(2)]
  const e1 = b.map((x, i) => x - a[i])
  const e2 = c.map((x, i) => x - a[i])
  return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
}

describe('prismData', () => {
  it('has 12 triangles with a uv per vertex', () => {
    const { positions, uvs } = build()
    expect(positions).toHaveLength(12 * 3 * 3)
    expect(uvs).toHaveLength(12 * 3 * 2)
  })

  it.each([false, true])('faces point outwards whichever way the wall was drawn (reversed: %s)', (reversed) => {
    const { positions } = build(reversed)
    const centre = [2, 1.25, 0]
    for (let t = 0; t < 12; t++) {
      const n = normal(positions, t)
      const first = positions.slice(t * 9, t * 9 + 3)
      const outward = first.map((x, i) => x - centre[i])
      expect(n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2]).toBeGreaterThan(0)
    }
  })

  it('side-face uvs are in metres: the long face spans length x height', () => {
    const { uvs } = build()
    const us = uvs.filter((_, i) => i % 2 === 0)
    const vs = uvs.filter((_, i) => i % 2 === 1)
    // Side faces start after the two caps (12 vertices).
    expect(Math.max(...us.slice(12))).toBeCloseTo(4, 9)
    expect(Math.max(...vs.slice(12))).toBeCloseTo(2.5, 9)
    expect(Math.min(...us.slice(12))).toBe(0)
  })
})
