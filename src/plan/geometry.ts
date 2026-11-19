// Mapping between plan-image pixels and world metres.
// The plan lies flat on the ground (y = 0), centred on the origin.
// Image x maps to world +x; image y (downwards) maps to world +z.

export type Px = { x: number; y: number }

export interface PlanFrame {
  widthPx: number
  heightPx: number
  metresPerPx: number
}

export function pixelDistance(a: Px, b: Px): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Scale that makes the pixel distance between a and b equal `metres`. */
export function metresPerPixel(a: Px, b: Px, metres: number): number {
  const px = pixelDistance(a, b)
  if (px === 0) throw new Error('Calibration points must be different')
  if (!(metres > 0)) throw new Error('Calibration distance must be positive')
  return metres / px
}

export function pixelToWorld(p: Px, f: PlanFrame): { x: number; z: number } {
  return {
    x: (p.x - f.widthPx / 2) * f.metresPerPx,
    z: (p.y - f.heightPx / 2) * f.metresPerPx,
  }
}

export function worldToPixel(w: { x: number; z: number }, f: PlanFrame): Px {
  return {
    x: w.x / f.metresPerPx + f.widthPx / 2,
    y: w.z / f.metresPerPx + f.heightPx / 2,
  }
}

/**
 * `to` moved onto the nearest line through `from` at a multiple of 45 degrees: the point on that
 * line closest to `to`. For measuring along a wall, which is drawn straight even if the hand is not.
 */
export function lockAngle(from: Px, to: Px): Px {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const along = dx * Math.cos(angle) + dy * Math.sin(angle)
  return { x: from.x + along * Math.cos(angle), y: from.y + along * Math.sin(angle) }
}

