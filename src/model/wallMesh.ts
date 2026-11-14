// Triangle data for a wall with its door and window openings cut out. Pure: no three.js objects.

import type { Footprint } from './wallGeometry'
import { fitOpening, type Opening } from './openings'
import { wallLength, type Vec2, type Wall } from './walls'

export interface PrismData {
  /** xyz per vertex, three vertices per triangle. */
  positions: number[]
  /** uv per vertex, in metres, so a texture can be given a real-world size. */
  uvs: number[]
}

type Quad = [Vec2, Vec2, Vec2, Vec2]

/**
 * The wall as a set of boxes: full-height stretches between openings, plus the wall
 * below each sill and above each head. UVs follow the wall, so a texture runs
 * unbroken across the pieces.
 */
export function wallMeshData(wall: Wall, footprint: Footprint, openings: Opening[]): PrismData {
  const length = wallLength(wall)
  const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
  const left = { x: -dir.z, z: dir.x }
  const half = wall.thickness / 2
  // The two wall faces at a distance along the centreline.
  const across = (d: number): [Vec2, Vec2] => [
    { x: wall.start.x + dir.x * d + left.x * half, z: wall.start.z + dir.z * d + left.z * half },
    { x: wall.start.x + dir.x * d - left.x * half, z: wall.start.z + dir.z * d - left.z * half },
  ]

  // Fit each opening to the wall; where two overlap, the earlier one wins.
  const cut: Opening[] = []
  for (const o of openings) {
    const f = fitOpening(o, length, wall.height)
    if (f.width <= 0 || f.height <= 0) continue
    const overlaps = cut.some((c) => Math.abs(c.position - f.position) < (c.width + f.width) / 2 - 1e-9)
    if (!overlaps) cut.push(f)
  }
  cut.sort((a, b) => a.position - b.position)

  const data: PrismData = { positions: [], uvs: [] }
  const uv = (p: Vec2) => {
    const x = p.x - wall.start.x
    const z = p.z - wall.start.z
    return { along: x * dir.x + z * dir.z, across: x * left.x + z * left.z + half }
  }
  const [startLeft, endLeft, endRight, startRight] = footprint
  let [curLeft, curRight] = [startLeft, startRight]
  let curDist = 0
  for (const o of cut) {
    const a = o.position - o.width / 2
    const b = o.position + o.width / 2
    const [aLeft, aRight] = across(a)
    const [bLeft, bRight] = across(b)
    if (a - curDist > 1e-9) addBox(data, [curLeft, aLeft, aRight, curRight], 0, wall.height, dir, uv)
    if (o.sill > 1e-9) addBox(data, [aLeft, bLeft, bRight, aRight], 0, o.sill, dir, uv)
    if (wall.height - (o.sill + o.height) > 1e-9) {
      addBox(data, [aLeft, bLeft, bRight, aRight], o.sill + o.height, wall.height, dir, uv)
    }
    ;[curLeft, curRight] = [bLeft, bRight]
    curDist = b
  }
  addBox(data, [curLeft, endLeft, endRight, curRight], 0, wall.height, dir, uv)
  return data
}

/** A box from y0 to y1 over a four-cornered footprint, wound so every face points outwards. */
function addBox(
  data: PrismData,
  quad: Quad,
  y0: number,
  y1: number,
  dir: Vec2,
  uv: (p: Vec2) => { along: number; across: number },
) {
  // Order the corners so the top face's normal points up.
  let q = [...quad]
  const shoelace = q.reduce((s, a, i) => {
    const b = q[(i + 1) % 4]
    return s + a.x * b.z - b.x * a.z
  }, 0)
  if (shoelace > 0) q = q.reverse()

  const vert = (p: Vec2, y: number, u: number, v: number) => {
    data.positions.push(p.x, y, p.z)
    data.uvs.push(u, v)
  }
  // Top and bottom: uv follows the wall on the ground plane.
  const cap = (y: number, order: number[]) =>
    order.forEach((i) => {
      const t = uv(q[i])
      vert(q[i], y, t.along, t.across)
    })
  cap(y1, [0, 1, 2, 0, 2, 3])
  cap(y0, [0, 2, 1, 0, 3, 2])

  // Sides: u runs along the wall on its long faces and across it on its ends; v runs up.
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const lengthwise = Math.abs(((b.x - a.x) * dir.x + (b.z - a.z) * dir.z) / len) > 0.5
    const [ua, ub] = lengthwise ? [uv(a).along, uv(b).along] : [uv(a).across, uv(b).across]
    vert(a, y0, ua, y0)
    vert(b, y0, ub, y0)
    vert(b, y1, ub, y1)
    vert(a, y0, ua, y0)
    vert(b, y1, ub, y1)
    vert(a, y1, ua, y1)
  }
}
