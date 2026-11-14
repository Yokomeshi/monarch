// Furniture and other placed objects. An object is data: a kind from the library, a place,
// a rotation and a size. Its shape is derived from those, as blocks that resize sensibly.

import type { Material } from './materials'
import type { Vec2 } from './walls'

export interface Size3 {
  /** Left to right when facing the piece, in metres. */
  width: number
  /** Front to back. */
  depth: number
  height: number
}

export type ObjectKind = 'bed' | 'sofa' | 'table' | 'chair' | 'desk' | 'wardrobe' | 'bookshelf' | 'counter'

export interface PlacedObject {
  id: string
  /** A piece from the library, or 'model' for an imported 3D model file. */
  kind: ObjectKind | 'model'
  /** For kind 'model': which imported file to draw. */
  modelId?: string
  /** Centre of the piece on the floor, in world metres. */
  position: Vec2
  /** Degrees counter-clockwise as seen in Top view, 0 to 360. */
  rotation: number
  size: Size3
  material: Material
}

/**
 * One block of a piece. Local coordinates: x across the width, y up from the floor,
 * z across the depth with the back of the piece at -z. `position` is the block's centre.
 */
export interface Part {
  size: [number, number, number]
  position: [number, number, number]
  /** Soft or contrasting parts (mattress, cushions, worktop, doors), drawn in a lighter tone. */
  accent?: boolean
}

const part = (w: number, h: number, d: number, x: number, bottom: number, z: number, accent?: boolean): Part => ({
  size: [w, h, d],
  position: [x, bottom + h / 2, z],
  ...(accent && { accent }),
})

/** Four of the same block, one at each corner. */
const corners = (w: number, h: number, d: number, x: number, z: number): Part[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(w, h, d, sx * x, 0, sz * z)))

interface Definition {
  name: string
  size: Size3
  color: string
  roughness: number
  parts: (s: Size3) => Part[]
}

const WOOD = { color: '#a8773f', roughness: 0.6 }

// Fixed details (leg and panel thicknesses) are capped by a share of the piece's size,
// so every part stays inside the stated dimensions at any size.
export const LIBRARY: Record<ObjectKind, Definition> = {
  bed: {
    name: 'Bed',
    size: { width: 1.6, depth: 2, height: 0.9 },
    color: '#8a6a4a',
    roughness: 0.7,
    parts: ({ width: W, depth: D, height: H }) => {
      const head = Math.min(0.06, D * 0.1)
      const base = 0.35 * H
      const mattress = 0.25 * H
      const pillow = (D - head) * 0.2
      const pillowZ = -D / 2 + head + (D - head) * 0.03 + pillow / 2
      return [
        part(W, base, D, 0, 0, 0),
        part(W, H, head, 0, 0, -D / 2 + head / 2),
        part(W * 0.96, mattress, D - head, 0, base, head / 2, true),
        part(W * 0.4, 0.1 * H, pillow, -W * 0.24, base + mattress, pillowZ, true),
        part(W * 0.4, 0.1 * H, pillow, W * 0.24, base + mattress, pillowZ, true),
      ]
    },
  },
  sofa: {
    name: 'Sofa',
    size: { width: 2, depth: 0.9, height: 0.8 },
    color: '#7d8794',
    roughness: 1,
    parts: ({ width: W, depth: D, height: H }) => {
      const seat = 0.45 * H
      const back = 0.22 * D
      const arm = 0.12 * W
      return [
        part(W, seat, D, 0, 0, 0),
        part(W, H - seat, back, 0, seat, -D / 2 + back / 2),
        part(arm, 0.3 * H, D - back, -(W - arm) / 2, seat, back / 2),
        part(arm, 0.3 * H, D - back, (W - arm) / 2, seat, back / 2),
        part(W - 2 * arm, 0.08 * H, D - back, 0, seat, back / 2, true),
      ]
    },
  },
  table: {
    name: 'Table',
    size: { width: 1.6, depth: 0.9, height: 0.75 },
    ...WOOD,
    parts: ({ width: W, depth: D, height: H }) => {
      const top = Math.min(0.05, 0.2 * H)
      const leg = Math.min(0.07, W / 4, D / 4)
      return [part(W, top, D, 0, H - top, 0), ...corners(leg, H - top, leg, (W - leg) / 2, (D - leg) / 2)]
    },
  },
  chair: {
    name: 'Chair',
    size: { width: 0.45, depth: 0.5, height: 0.9 },
    ...WOOD,
    parts: ({ width: W, depth: D, height: H }) => {
      const leg = Math.min(0.04, W / 4, D / 4)
      const seatY = 0.45 * H
      const seat = 0.06 * H
      return [
        ...corners(leg, seatY, leg, (W - leg) / 2, (D - leg) / 2),
        part(W, seat, D, 0, seatY, 0),
        part(W, H - seatY - seat, leg, 0, seatY + seat, -D / 2 + leg / 2),
      ]
    },
  },
  desk: {
    name: 'Desk',
    size: { width: 1.4, depth: 0.7, height: 0.75 },
    ...WOOD,
    parts: ({ width: W, depth: D, height: H }) => {
      const top = Math.min(0.04, 0.2 * H)
      const panel = Math.min(0.04, W / 4)
      const modesty = Math.min(0.02, D / 4)
      return [
        part(W, top, D, 0, H - top, 0),
        part(panel, H - top, D, -(W - panel) / 2, 0, 0),
        part(panel, H - top, D, (W - panel) / 2, 0, 0),
        part(W - 2 * panel, 0.35 * H, modesty, 0, 0.4 * H, -D / 2 + modesty / 2),
      ]
    },
  },
  wardrobe: {
    name: 'Wardrobe',
    size: { width: 1.2, depth: 0.6, height: 2 },
    ...WOOD,
    parts: ({ width: W, depth: D, height: H }) => {
      const door = Math.min(0.02, D / 4)
      const gap = Math.min(0.01, W * 0.02)
      const doorW = (W - gap) / 2
      const doorZ = D / 2 - door / 2
      return [
        part(W, H, D - door, 0, 0, -door / 2),
        part(doorW, 0.96 * H, door, -(doorW + gap) / 2, 0.02 * H, doorZ, true),
        part(doorW, 0.96 * H, door, (doorW + gap) / 2, 0.02 * H, doorZ, true),
      ]
    },
  },
  bookshelf: {
    name: 'Bookshelf',
    size: { width: 0.9, depth: 0.3, height: 1.8 },
    ...WOOD,
    parts: ({ width: W, depth: D, height: H }) => {
      const panel = Math.min(0.02, W / 6, H / 10)
      const back = Math.min(0.01, D / 4)
      const inner = W - 2 * panel
      const shelves = [1, 2, 3, 4].map((k) => part(inner, panel, D - back, 0, panel + ((H - 2 * panel) * k) / 5, back / 2))
      return [
        part(panel, H, D, -(W - panel) / 2, 0, 0),
        part(panel, H, D, (W - panel) / 2, 0, 0),
        part(inner, panel, D, 0, 0, 0),
        part(inner, panel, D, 0, H - panel, 0),
        part(inner, H - 2 * panel, back, 0, panel, -D / 2 + back / 2),
        ...shelves,
      ]
    },
  },
  counter: {
    name: 'Counter',
    size: { width: 1.8, depth: 0.6, height: 0.9 },
    color: '#e8e4dc',
    roughness: 0.6,
    parts: ({ width: W, depth: D, height: H }) => {
      const top = Math.min(0.04, 0.2 * H)
      const overhang = Math.min(0.02, D / 4)
      return [part(W, H - top, D - overhang, 0, 0, -overhang / 2), part(W, top, D, 0, H - top, 0, true)]
    },
  },
}

export function createObject(kind: ObjectKind, position: Vec2): PlacedObject {
  const { size, color, roughness } = LIBRARY[kind]
  return {
    id: crypto.randomUUID(),
    kind,
    position,
    rotation: 0,
    size: { ...size },
    material: { color, roughness, metalness: 0, textureId: null, tileSize: 1 },
  }
}

/** The blocks that make up a library piece. An imported model has none: its file is drawn instead. */
export const objectParts = (o: Pick<PlacedObject, 'kind' | 'size'>): Part[] =>
  o.kind === 'model' ? [] : LIBRARY[o.kind].parts(o.size)

/** Each dimension of an object stays between these, in metres. */
export const SIZE_LIMITS = { min: 0.1, max: 10 }

/** The object with `patch` applied, its size kept within limits and its rotation within 0-360. */
export function resizeObject(o: PlacedObject, patch: Partial<PlacedObject>): PlacedObject {
  const next = { ...o, ...patch }
  const clamp = (v: number) => Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, v))
  return {
    ...next,
    size: { width: clamp(next.size.width), depth: clamp(next.size.depth), height: clamp(next.size.height) },
    rotation: ((next.rotation % 360) + 360) % 360,
  }
}

/** Move objects with the plan, e.g. after recalibration. Furniture keeps its real size. */
export function scaleObjects(objects: PlacedObject[], factor: number): PlacedObject[] {
  return objects.map((o) => ({ ...o, position: { x: o.position.x * factor, z: o.position.z * factor } }))
}

/** A copy of the piece, half a metre away so it doesn't hide the original. */
export function duplicateObject(o: PlacedObject): PlacedObject {
  return {
    ...o,
    id: crypto.randomUUID(),
    position: { x: o.position.x + 0.5, z: o.position.z + 0.5 },
    size: { ...o.size },
    material: { ...o.material },
  }
}

// ---- Imported 3D model files ----

export type ModelFormat = 'glb' | 'gltf' | 'obj'

/** An imported model file. `naturalSize` is its bounding box in the file's own units. */
export interface ModelInfo {
  name: string
  format: ModelFormat
  naturalSize: Size3
}

/** The format of a model file, from its extension, or null if it isn't one we read. */
export function modelFormat(filename: string): ModelFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase()
  return ext === 'glb' || ext === 'gltf' || ext === 'obj' ? ext : null
}

/**
 * The size to give a newly imported model. glTF files are in metres, so a plausible
 * size is kept. Anything absurd (say, modelled in millimetres) is scaled so its
 * longest side is 1 m, keeping its proportions.
 */
export function fitSize(natural: Size3): Size3 {
  const longest = Math.max(natural.width, natural.depth, natural.height)
  if (longest >= 0.05 && longest <= 20) return { ...natural }
  return { width: natural.width / longest, depth: natural.depth / longest, height: natural.height / longest }
}

/** Set one dimension and scale the other two by the same ratio. */
export function resizeProportional(size: Size3, dimension: keyof Size3, value: number): Size3 {
  const k = value / size[dimension]
  return { width: size.width * k, depth: size.depth * k, height: size.height * k, [dimension]: value }
}

export function createModelObject(modelId: string, size: Size3, position: Vec2): PlacedObject {
  return {
    id: crypto.randomUUID(),
    kind: 'model',
    modelId,
    position,
    rotation: 0,
    size: { ...size },
    // Used by .obj models, which carry no materials of their own.
    material: { color: '#c8c4bc', roughness: 0.8, metalness: 0, textureId: null, tileSize: 1 },
  }
}
