import { describe, expect, it } from 'vitest'
import { wallMeshData } from './wallMesh'
import { wallFootprints } from './wallGeometry'
import { createWall } from './walls'
import type { Opening } from './openings'

const p = (x: number, z: number) => ({ x, z })
const T = 0.2
const H = 2.5

function build(openings: Partial<Opening>[] = [], reversed = false) {
  const [a, b] = reversed ? [p(4, 0), p(0, 0)] : [p(0, 0), p(4, 0)]
  const w = createWall(a, b, { height: H, thickness: T })
  const full = openings.map((o, i) => ({ id: `o${i}`, wallId: w.id, type: 'door' as const, position: 2, width: 0.9, height: 2.1, sill: 0, hinge: 'start' as const, swing: 'left' as const, ...o }))
  return wallMeshData(w, wallFootprints([w]).get(w.id)!, full)
}

/** Volume enclosed by the triangles; positive when they face outwards. */
function volume(pos: number[]) {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9)
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

describe('wallMeshData', () => {
  it('a plain wall is one box: 12 triangles with a uv per vertex', () => {
    const { positions, uvs } = build()
    expect(positions).toHaveLength(12 * 3 * 3)
    expect(uvs).toHaveLength(12 * 3 * 2)
  })

  it.each([false, true])('faces point outwards whichever way the wall was drawn (reversed: %s)', (reversed) => {
    expect(volume(build([], reversed).positions)).toBeCloseTo(4 * T * H, 9)
  })

  it('a door removes exactly its own volume from the wall', () => {
    expect(volume(build([{}]).positions)).toBeCloseTo(T * (4 * H - 0.9 * 2.1), 9)
  })

  it('a window leaves wall below its sill and above its head', () => {
    const window = { type: 'window' as const, width: 1.2, height: 1.2, sill: 0.9 }
    expect(volume(build([window]).positions)).toBeCloseTo(T * (4 * H - 1.2 * 1.2), 9)
  })

  it('handles several openings, in any order, and one that reaches the top of the wall', () => {
    const openings = [
      { position: 3.2, width: 0.8, height: 1, sill: 1.5 }, // reaches 2.5: no wall above it
      { position: 0.8, width: 0.9, height: 2.1, sill: 0 },
    ]
    expect(volume(build(openings).positions)).toBeCloseTo(T * (4 * H - 0.8 * 1 - 0.9 * 2.1), 9)
  })

  it('draws only the first of two overlapping openings', () => {
    const openings = [{ position: 2 }, { position: 2.3 }]
    expect(volume(build(openings).positions)).toBeCloseTo(T * (4 * H - 0.9 * 2.1), 9)
  })

  it('fits an oversized opening to the wall rather than breaking it', () => {
    // 9 m wide and 9 m tall on a 4 m x 2.5 m wall: clamped to 3.8 m x 2.5 m.
    expect(volume(build([{ width: 9, height: 9 }]).positions)).toBeCloseTo(T * (4 * H - 3.8 * H), 9)
  })

  it('uvs are in metres and run continuously along the wall, across openings', () => {
    const { positions, uvs } = build([{}])
    for (let v = 0; v < positions.length / 3; v++) {
      const [x, y, z] = positions.slice(v * 3, v * 3 + 3)
      const [u, vv] = uvs.slice(v * 2, v * 2 + 2)
      expect(u).toBeGreaterThanOrEqual(-1e-9)
      expect(u).toBeLessThanOrEqual(4 + 1e-9)
      // Triangles on the long faces (z = +-0.1) and caps: u follows the wall. Check the long faces.
      const tri = Math.floor(v / 3) * 9
      const onLongFace = [2, 5, 8].every((k) => Math.abs(Math.abs(positions[tri + k]) - T / 2) < 1e-9) &&
        new Set([2, 5, 8].map((k) => Math.sign(positions[tri + k]))).size === 1 &&
        new Set([1, 4, 7].map((k) => positions[tri + k])).size > 1
      if (onLongFace) {
        expect(u).toBeCloseTo(x, 9)
        expect(vv).toBeCloseTo(y, 9)
      }
      void z
    }
  })
})
