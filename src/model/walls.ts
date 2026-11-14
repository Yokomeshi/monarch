// Parametric wall model. Walls are data; meshes are always derived from it.
// Coordinates are world metres on the ground plane (x, z). Walls join where
// their endpoints coincide.

export type Vec2 = { x: number; z: number }

export interface Wall {
  id: string
  start: Vec2
  end: Vec2
  /** metres */
  height: number
  /** metres */
  thickness: number
}

export const WALL_DEFAULTS = { height: 2.7, thickness: 0.15 }

export function createWall(start: Vec2, end: Vec2, props = WALL_DEFAULTS): Wall {
  return { id: crypto.randomUUID(), start, end, ...props }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

export function wallLength(w: Wall): number {
  return distance(w.start, w.end)
}

/** Walls for a chain of corner points, skipping zero-length segments. */
export function wallsFromChain(points: Vec2[], props = WALL_DEFAULTS): Wall[] {
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
