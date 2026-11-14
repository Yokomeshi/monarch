import { describe, expect, it } from 'vitest'
import { CUT_HEIGHT, cutOpenings, cutWall } from './cutaway'
import { openingAt } from './openings'
import { wallMeshData } from './wallMesh'
import { wallFootprints } from './wallGeometry'
import { createWall } from './walls'

const p = (x: number, z: number) => ({ x, z })
const T = 0.2
const wall = (height = 2.7) => createWall(p(0, 0), p(4, 0), { height, thickness: T })

/** Volume enclosed by the triangles. */
function volume(pos: number[]) {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9)
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

describe('cutaway', () => {
  it('cuts walls at 1.2 m', () => {
    expect(CUT_HEIGHT).toBe(1.2)
  })

  it('shows a tall wall cut down, keeping everything else about it', () => {
    const w = wall()
    expect(cutWall(w, 1.2)).toEqual({ ...w, height: 1.2 })
  })

  it('leaves a wall that is already below the cut exactly as it is', () => {
    const low = wall(0.9)
    expect(cutWall(low, 1.2)).toBe(low)
  })

  it('keeps doors and ordinary windows, and drops openings that start above the cut', () => {
    const w = wall()
    const door = openingAt(w, [], 'door', 1)!
    const window = openingAt(w, [door], 'window', 3)! // sill at 0.9 m
    const high = { ...window, id: 'high', sill: 1.5, height: 0.6 }
    expect(cutOpenings([door, window, high], 1.2)).toEqual([door, window])
  })

  it('a cut wall with a door is the wall up to the cut, less the doorway up to the cut', () => {
    const w = wall()
    const door = openingAt(w, [], 'door', 2)! // 0.9 m wide, 2.1 m high: taller than the cut
    const shown = cutWall(w, 1.2)
    const mesh = wallMeshData(shown, wallFootprints([shown]).get(shown.id)!, cutOpenings([door], 1.2))
    expect(volume(mesh.positions)).toBeCloseTo(T * (4 * 1.2 - 0.9 * 1.2), 9)
  })

  it('a cut wall keeps the part of a window below the cut', () => {
    const w = wall()
    const window = openingAt(w, [], 'window', 2)! // 1.2 m wide, sill 0.9 m: 0.3 m of it is below the cut
    const shown = cutWall(w, 1.2)
    const mesh = wallMeshData(shown, wallFootprints([shown]).get(shown.id)!, cutOpenings([window], 1.2))
    expect(volume(mesh.positions)).toBeCloseTo(T * (4 * 1.2 - 1.2 * 0.3), 9)
  })
})
