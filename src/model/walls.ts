// Parametric wall model. Walls are data; meshes are always derived from it.
// Coordinates are world metres on the ground plane (x, z). Walls join where
// their endpoints coincide.

import { DEFAULT_MATERIAL, type Material } from './materials'

export type Vec2 = { x: number; z: number }

export interface Wall {
  id: string
  start: Vec2
  end: Vec2
  /** metres */
  height: number
  /** metres */
  thickness: number
  material: Material
}

export type WallProps = Pick<Wall, 'height' | 'thickness' | 'material'>

export const WALL_DEFAULTS: WallProps = { height: 2.7, thickness: 0.15, material: DEFAULT_MATERIAL }

export function createWall(start: Vec2, end: Vec2, props: Partial<WallProps> = {}): Wall {
  return { id: crypto.randomUUID(), start, end, ...WALL_DEFAULTS, ...props }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

export function wallLength(w: Wall): number {
  return distance(w.start, w.end)
}

/** Walls for a chain of corner points, skipping zero-length segments. */
export function wallsFromChain(points: Vec2[], props: Partial<WallProps> = {}): Wall[] {
  const walls: Wall[] = []
  for (let i = 1; i < points.length; i++) {
    if (distance(points[i - 1], points[i]) > 1e-9) walls.push(createWall(points[i - 1], points[i], props))
  }
  return walls
}

/** The nearest candidate within `tolerance` metres, or null. */
export function snapToPoint(p: Vec2, candidates: Vec2[], tolerance: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = tolerance
  for (const c of candidates) {
    const d = distance(p, c)
    if (d <= bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}

/** The point on segment a-b closest to p. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
  return { x: a.x + t * dx, z: a.z + t * dz }
}

/**
 * The point on a wall's centre-line nearest to `p`, if `p` is on the wall or within `tolerance`
 * of one of its faces. Measuring from the faces matters for thick walls: a click anywhere on
 * a 40 cm wall should join it, however far the view is zoomed in.
 */
export function snapToWall(p: Vec2, walls: Wall[], tolerance: number): Vec2 | null {
  let best: Vec2 | null = null
  let bestDist = Infinity
  for (const w of walls) {
    const c = closestPointOnSegment(p, w.start, w.end)
    const d = distance(p, c)
    if (d <= w.thickness / 2 + tolerance && d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}

/**
 * Where the line from `from` through `to` meets a wall centreline within `tolerance`
 * of `to`, or null. Used with an angle lock: the wall ends on the other wall without
 * leaving the locked direction.
 */
export function snapAlongRay(from: Vec2, to: Vec2, walls: Wall[], tolerance: number): Vec2 | null {
  const dx = to.x - from.x
  const dz = to.z - from.z
  let best: Vec2 | null = null
  let bestDist = Infinity
  for (const w of walls) {
    const ex = w.end.x - w.start.x
    const ez = w.end.z - w.start.z
    const denom = dx * ez - dz * ex
    if (Math.abs(denom) < 1e-12) continue // parallel
    const qx = w.start.x - from.x
    const qz = w.start.z - from.z
    const s = (qx * ez - qz * ex) / denom // along the ray
    const u = (qx * dz - qz * dx) / denom // along the wall
    if (!(s > 0 && u >= 0 && u <= 1)) continue
    const hit = { x: from.x + s * dx, z: from.z + s * dz }
    // As in snapToWall, the tolerance is measured from the wall's face, not its centre-line.
    const d = distance(to, hit)
    if (d <= w.thickness / 2 + tolerance && d < bestDist) {
      best = hit
      bestDist = d
    }
  }
  return best
}

/** Constrain the segment from -> to onto the nearest multiple of `stepDeg`, keeping its length. */
export function constrainAngle(from: Vec2, to: Vec2, stepDeg = 45): Vec2 {
  const len = distance(from, to)
  if (len === 0) return to
  const step = (stepDeg * Math.PI) / 180
  const angle = Math.round(Math.atan2(to.z - from.z, to.x - from.x) / step) * step
  return { x: from.x + Math.cos(angle) * len, z: from.z + Math.sin(angle) * len }
}

/** Every wall endpoint, for snapping. */
export function endpoints(walls: Wall[]): Vec2[] {
  return walls.flatMap((w) => [w.start, w.end])
}

/** Scale wall positions about the origin (the plan's centre), e.g. after recalibration. */
export function scaleWalls(walls: Wall[], factor: number): Wall[] {
  const s = (p: Vec2) => ({ x: p.x * factor, z: p.z * factor })
  return walls.map((w) => ({ ...w, start: s(w.start), end: s(w.end) }))
}
