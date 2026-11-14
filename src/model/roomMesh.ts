// Triangle data for a room's floor or ceiling.

import { ShapeUtils, Vector2 } from 'three'
import type { PrismData } from './wallMesh'
import type { Vec2 } from './walls'

/** A flat slab filling `outline` at height `y`, facing up (a floor) or down (a ceiling). */
export function slabData(outline: Vec2[], y: number, facing: 'up' | 'down'): PrismData {
  const positions: number[] = []
  const uvs: number[] = []
  const contour = outline.map((p) => new Vector2(p.x, p.z))
  for (const tri of ShapeUtils.triangulateShape(contour, [])) {
    let [a, b, c] = tri.map((i) => outline[i])
    // Wind each triangle so its normal points the way the slab faces.
    const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
    if (normalY > 0 !== (facing === 'up')) [b, c] = [c, b]
    for (const p of [a, b, c]) {
      positions.push(p.x, y, p.z)
      uvs.push(p.x, p.z)
    }
  }
  return { positions, uvs }
}
