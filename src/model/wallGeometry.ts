// Wall footprints on the ground plane, with mitred joins.
// Pure functions: the 3D mesh is an extrusion of these footprints.

import type { Vec2, Wall } from './walls'

/** Corners in order: start-left, end-left, end-right, start-right (left of start -> end). */
export type Footprint = [Vec2, Vec2, Vec2, Vec2]

// Fall back to a square end when a mitre point would stick out further than this
// many wall thicknesses from the joint (very sharp angles).
const MITRE_LIMIT = 4
const EPS = 1e-6

interface End {
  wall: Wall
  atStart: boolean
}

const key = (p: Vec2) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`

/** Footprints for all walls, keyed by wall id. */
export function wallFootprints(walls: Wall[]): Map<string, Footprint> {
  const nodes = new Map<string, End[]>()
  for (const wall of walls) {
    for (const atStart of [true, false]) {
      const k = key(atStart ? wall.start : wall.end)
      nodes.set(k, [...(nodes.get(k) ?? []), { wall, atStart }])
    }
  }

  const result = new Map<string, Footprint>()
  for (const wall of walls) {
    const s = endCorners(wall, true, nodes)
    const e = endCorners(wall, false, nodes)
    // At the end node the outward direction is reversed, so its left is the wall's right.
    result.set(wall.id, [s.left, e.right, e.left, s.right])
  }
  return result
}

/** Left/right corners at one end, relative to the direction pointing away from that end. */
function endCorners(wall: Wall, atStart: boolean, nodes: Map<string, End[]>): { left: Vec2; right: Vec2 } {
  const p = atStart ? wall.start : wall.end
  const out = outward(wall, atStart)
  const half = wall.thickness / 2
  const n = leftNormal(out)
  const square = { left: add(p, n, half), right: add(p, n, -half) }

  const others = (nodes.get(key(p)) ?? []).filter((e) => e.wall.id !== wall.id)
  if (others.length !== 1) return square

  const nb = others[0]
  const nbOut = outward(nb.wall, nb.atStart)
  const nbHalf = nb.wall.thickness / 2
  const nbN = leftNormal(nbOut)
  // This wall's left face meets the neighbour's right face, and vice versa.
  const left = intersect(add(p, n, half), out, add(p, nbN, -nbHalf), nbOut)
  const right = intersect(add(p, n, -half), out, add(p, nbN, nbHalf), nbOut)
  if (!left || !right) return square // collinear: the walls meet flush anyway

  const limit = MITRE_LIMIT * Math.max(wall.thickness, nb.wall.thickness)
  if (dist(left, p) > limit || dist(right, p) > limit) return square
  return { left, right }
}

function outward(wall: Wall, atStart: boolean): Vec2 {
  const [from, to] = atStart ? [wall.start, wall.end] : [wall.end, wall.start]
  const len = dist(from, to)
  return { x: (to.x - from.x) / len, z: (to.z - from.z) / len }
}

const leftNormal = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x })
const add = (p: Vec2, d: Vec2, s: number): Vec2 => ({ x: p.x + d.x * s, z: p.z + d.z * s })
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x

/** Intersection of lines p + s*d and q + u*e, or null if parallel. */
function intersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denom = cross(d, e)
  if (Math.abs(denom) < 1e-9) return null
  const s = cross({ x: q.x - p.x, z: q.z - p.z }, e) / denom
  return add(p, d, s)
}

/** Area of a simple polygon (shoelace). */
export function polygonArea(points: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.z - b.x * a.z
  }
  return Math.abs(sum) / 2
}
