import { describe, expect, it } from 'vitest'
import { slabData } from './roomMesh'

const p = (x: number, z: number) => ({ x, z })
// An L-shaped outline, counter-clockwise as rooms.ts produces it. Area 5.8 x 1.8 + 2.8 x 2 = 16.04.
const L = [p(0.1, 0.1), p(5.9, 0.1), p(5.9, 1.9), p(2.9, 1.9), p(2.9, 3.9), p(0.1, 3.9)]

function triangles(positions: number[]) {
  const out = []
  for (let i = 0; i < positions.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((o) => positions.slice(i + o, i + o + 3))
    const e1 = b.map((v, k) => v - a[k])
    const e2 = c.map((v, k) => v - a[k])
    const normalY = e1[2] * e2[0] - e1[0] * e2[2]
    out.push({ a, b, c, normalY, area: Math.abs(normalY) / 2 })
  }
  return out
}

describe('slabData', () => {
  it('covers exactly the outline, including a concave corner', () => {
    const tris = triangles(slabData(L, 0, 'up').positions)
    expect(tris.reduce((s, t) => s + t.area, 0)).toBeCloseTo(16.04, 9)
  })

  it('a floor faces up and sits at the given height', () => {
    const { positions } = slabData(L, 0.01, 'up')
    for (const t of triangles(positions)) expect(t.normalY).toBeGreaterThan(0)
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBe(0.01)
  })

  it('a ceiling faces down', () => {
    const { positions } = slabData(L, 2.7, 'down')
    for (const t of triangles(positions)) expect(t.normalY).toBeLessThan(0)
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBe(2.7)
  })

  it('has uvs in metres, so a texture keeps its real size', () => {
    const { positions, uvs } = slabData(L, 0, 'up')
    expect(uvs).toHaveLength((positions.length / 3) * 2)
    for (let v = 0; v < positions.length / 3; v++) {
      expect(uvs[v * 2]).toBe(positions[v * 3])
      expect(uvs[v * 2 + 1]).toBe(positions[v * 3 + 2])
    }
  })
})
