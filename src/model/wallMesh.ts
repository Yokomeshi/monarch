// Triangle data for an extruded wall. Pure: no three.js objects.

import type { Footprint } from './wallGeometry'

export interface PrismData {
  /** xyz per vertex, three vertices per triangle. */
  positions: number[]
  /** uv per vertex, in metres, so a texture can be given a real-world size. */
  uvs: number[]
}

/** The footprint extruded from y = 0 to y = height, wound so every face points outwards. */
export function prismData(footprint: Footprint, height: number): PrismData {
  // Order the corners so the top face's normal points up.
  let q = footprint.map((p) => [p.x, p.z] as const)
  const shoelace = q.reduce((s, [x, z], i) => {
    const [nx, nz] = q[(i + 1) % q.length]
    return s + x * nz - nx * z
  }, 0)
  if (shoelace > 0) q = [...q].reverse()

  const positions: number[] = []
  const uvs: number[] = []
  const vert = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z)
    uvs.push(u, v)
  }

  // Top and bottom: uv follows the ground plane.
  const cap = (y: number, order: number[]) => order.forEach((i) => vert(q[i][0], y, q[i][1], q[i][0], q[i][1]))
  cap(height, [0, 1, 2, 0, 2, 3])
  cap(0, [0, 2, 1, 0, 3, 2])

  // Sides: u runs along the face, v runs up the wall.
  for (let i = 0; i < 4; i++) {
    const [ax, az] = q[i]
    const [bx, bz] = q[(i + 1) % 4]
    const len = Math.hypot(bx - ax, bz - az)
    vert(ax, 0, az, 0, 0)
    vert(bx, 0, bz, len, 0)
    vert(bx, height, bz, len, height)
    vert(ax, 0, az, 0, 0)
    vert(bx, height, bz, len, height)
    vert(ax, height, az, 0, height)
  }
  return { positions, uvs }
}
