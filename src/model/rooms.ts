// Rooms are derived from the walls, never stored: a room is a closed loop of walls.

import type { Vec2, Wall } from './walls'

export interface Room {
  /** Stable while the same walls surround the room. */
  id: string
  /** The room's floor outline along the inside faces of its walls. */
  outline: Vec2[]
  /** The same loop along the centre-lines of its walls. */
  centreline: Vec2[]
  /** The walls around the room, in order. */
  wallIds: string[]
  /** Floor area in square metres, measured to the inside faces. */
  area: number
  /** Centroid of the outline. */
  centre: Vec2
}

const EPS = 1e-6

interface Edge {
  to: string
  wallId: string
  angle: number
}
interface Node {
  p: Vec2
  edges: Edge[]
}

/** Every room enclosed by the walls, ordered top-to-bottom then left-to-right as seen in Top view. */
export function detectRooms(walls: Wall[]): Room[] {
  const nodes = buildGraph(walls)
  pruneDeadEnds(nodes)
  const thickness = new Map(walls.map((w) => [w.id, w.thickness]))

  const rooms: Room[] = []
  const visited = new Set<string>()
  for (const [startKey, node] of nodes) {
    for (const first of node.edges) {
      if (visited.has(`${startKey}>${first.to}`)) continue
      // Walk the face to the left of this edge.
      const corners: Vec2[] = []
      const wallIds: string[] = []
      let from = startKey
      let edge = first
      while (!visited.has(`${from}>${edge.to}`)) {
        visited.add(`${from}>${edge.to}`)
        corners.push(nodes.get(from)!.p)
        wallIds.push(edge.wallId)
        const next = nextEdge(nodes.get(edge.to)!, from)
        from = edge.to
        edge = next
      }
      // Faces walked this way are counter-clockwise; the unbounded outside comes out clockwise.
      if (signedArea(corners) < EPS) continue
      const outline = dropCollinear(insetToFaces(corners, wallIds.map((id) => thickness.get(id)! / 2)))
      rooms.push({
        id: [...new Set(wallIds)].sort().join('|'),
        outline,
        centreline: corners,
        wallIds: [...new Set(wallIds)],
        area: Math.abs(signedArea(outline)),
        centre: centroid(outline),
      })
    }
  }
  const row = (r: Room) => Math.round(r.centre.z * 1000)
  return rooms.sort((a, b) => row(a) - row(b) || a.centre.x - b.centre.x)
}

/** Planar graph of the wall centrelines, split wherever walls touch or cross. */
function buildGraph(walls: Wall[]): Map<string, Node> {
  const nodes = new Map<string, Node>()
  const key = (p: Vec2) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`
  const node = (p: Vec2) => {
    const k = key(p)
    if (!nodes.has(k)) nodes.set(k, { p, edges: [] })
    return k
  }
  const link = (a: string, b: string, wallId: string) => {
    const pa = nodes.get(a)!.p
    const pb = nodes.get(b)!.p
    if (nodes.get(a)!.edges.some((e) => e.to === b)) return // overlapping walls: keep one edge
    nodes.get(a)!.edges.push({ to: b, wallId, angle: Math.atan2(pb.z - pa.z, pb.x - pa.x) })
    nodes.get(b)!.edges.push({ to: a, wallId, angle: Math.atan2(pa.z - pb.z, pa.x - pb.x) })
  }

  for (const w of walls) {
    const dx = w.end.x - w.start.x
    const dz = w.end.z - w.start.z
    const len2 = dx * dx + dz * dz
    if (len2 < EPS * EPS) continue
    // Positions (0..1) along this wall where another wall touches or crosses it.
    const cuts = [0, 1]
    for (const o of walls) {
      if (o === w) continue
      for (const q of [o.start, o.end]) {
        const s = ((q.x - w.start.x) * dx + (q.z - w.start.z) * dz) / len2
        if (s <= 0 || s >= 1) continue
        const off = Math.hypot(w.start.x + s * dx - q.x, w.start.z + s * dz - q.z)
        if (off < EPS) cuts.push(s)
      }
      const ex = o.end.x - o.start.x
      const ez = o.end.z - o.start.z
      const denom = dx * ez - dz * ex
      if (Math.abs(denom) < 1e-12) continue
      const qx = o.start.x - w.start.x
      const qz = o.start.z - w.start.z
      const s = (qx * ez - qz * ex) / denom
      const u = (qx * dz - qz * dx) / denom
      if (s > 0 && s < 1 && u > 0 && u < 1) cuts.push(s)
    }
    cuts.sort((a, b) => a - b)
    let prev = node(w.start)
    for (const s of cuts.slice(1)) {
      const k = node({ x: w.start.x + s * dx, z: w.start.z + s * dz })
      if (k !== prev) link(prev, k, w.id)
      prev = k
    }
  }
  for (const n of nodes.values()) n.edges.sort((a, b) => a.angle - b.angle)
  return nodes
}

/** Remove walls that lead nowhere, so a stub poking into a room doesn't confuse its outline. */
function pruneDeadEnds(nodes: Map<string, Node>) {
  const queue = [...nodes.keys()].filter((k) => nodes.get(k)!.edges.length <= 1)
  while (queue.length) {
    const k = queue.pop()!
    const n = nodes.get(k)
    if (!n || n.edges.length > 1) continue
    nodes.delete(k)
    for (const e of n.edges) {
      const other = nodes.get(e.to)!
      other.edges = other.edges.filter((x) => x.to !== k)
      if (other.edges.length <= 1) queue.push(e.to)
    }
  }
}

/** Arriving at `node` from `from`, the next edge clockwise from the way back: keeps the face on the left. */
function nextEdge(node: Node, from: string): Edge {
  const i = node.edges.findIndex((e) => e.to === from)
  return node.edges[(i - 1 + node.edges.length) % node.edges.length]
}

/** Move each edge of a counter-clockwise polygon inwards by its own distance. */
function insetToFaces(corners: Vec2[], inset: number[]): Vec2[] {
  const n = corners.length
  // Edge i runs from corner i to corner i + 1; its interior is on the left.
  const lines = corners.map((a, i) => {
    const b = corners[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const d = { x: (b.x - a.x) / len, z: (b.z - a.z) / len }
    return { d, p: { x: a.x - d.z * inset[i], z: a.z + d.x * inset[i] } }
  })
  return corners.map((_, i) => {
    const prev = lines[(i - 1 + n) % n]
    const cur = lines[i]
    const denom = prev.d.x * cur.d.z - prev.d.z * cur.d.x
    if (Math.abs(denom) < 1e-9) return cur.p // straight on: no corner to find
    const s = ((cur.p.x - prev.p.x) * cur.d.z - (cur.p.z - prev.p.z) * cur.d.x) / denom
    return { x: prev.p.x + prev.d.x * s, z: prev.p.z + prev.d.z * s }
  })
}

function dropCollinear(points: Vec2[]): Vec2[] {
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length]
    const b = points[(i + 1) % points.length]
    return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-9
  })
}

function signedArea(points: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.z - b.x * a.z
  }
  return sum / 2
}

function centroid(points: Vec2[]): Vec2 {
  let x = 0
  let z = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const cross = a.x * b.z - b.x * a.z
    x += (a.x + b.x) * cross
    z += (a.z + b.z) * cross
  }
  const area6 = 6 * signedArea(points)
  return { x: x / area6, z: z / area6 }
}
