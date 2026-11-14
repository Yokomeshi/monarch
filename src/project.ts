// Project file format: one self-contained JSON document with images embedded as data URLs.

import { ROOM_DEFAULTS, type Material, type RoomMaterials } from './model/materials'
import type { Wall, WallProps } from './model/walls'
import type { Opening } from './model/openings'
import { DEFAULT_SUN, type SunSettings } from './model/sun'
import { LIBRARY, type ModelInfo, type ObjectKind, type PlacedObject, type Size3 } from './model/objects'
import type { Px } from './plan/geometry'
import type { Units } from './units'

// Version 2 added room floor and ceiling materials, version 3 openings, version 4
// door hinge and swing sides, version 5 furniture, version 6 imported 3D models, and
// version 7 the sun study. Older files still open.
export const PROJECT_VERSION = 7

export interface ProjectFile {
  app: 'monarch'
  version: number
  units: Units
  plan: {
    name: string
    widthPx: number
    heightPx: number
    metresPerPx: number
    calibrated: boolean
    calibrationLine: [Px, Px] | null
    /** data URL */
    image: string
  } | null
  walls: Wall[]
  openings: Opening[]
  objects: PlacedObject[]
  /** Imported 3D model files by id. `data` is the file as a data URL. */
  models: Record<string, ModelInfo & { data: string }>
  sun: SunSettings
  wallDefaults: WallProps
  rooms: RoomFinishes
  /** Photo textures by id. `image` is a data URL. */
  textures: Record<string, { name: string; image: string }>
}

/** Floor and ceiling materials: the defaults, and the rooms that differ from them, by room id. */
export interface RoomFinishes {
  defaults: RoomMaterials
  materials: Record<string, RoomMaterials>
}

/** Ids of the textures actually used, so unused uploads aren't saved. */
export function usedTextureIds(
  walls: Wall[],
  wallDefaults: WallProps,
  rooms: RoomFinishes,
  objects: PlacedObject[],
): string[] {
  const ids = [
    ...walls.map((w) => w.material.textureId),
    ...objects.map((o) => o.material.textureId),
    wallDefaults.material.textureId,
    ...[rooms.defaults, ...Object.values(rooms.materials)].flatMap((r) => [r.floor.textureId, r.ceiling.textureId]),
  ]
  return [...new Set(ids.filter((id): id is string => id !== null))]
}

/** Read and validate a project file. Throws an Error with a message fit to show the user. */
export function parseProject(text: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("This file isn't a Monarch project (it isn't valid JSON).")
  }
  if (!isObject(data) || data.app !== 'monarch') throw new Error("This file isn't a Monarch project.")
  if (typeof data.version !== 'number') throw new Error('This project file has no version number.')
  if (data.version > PROJECT_VERSION) {
    throw new Error(`This project was saved by a newer version of Monarch (format ${data.version}).`)
  }

  const units = data.units
  if (units !== 'metric' && units !== 'imperial') throw invalid('units')

  const textures: ProjectFile['textures'] = {}
  if (!isObject(data.textures)) throw invalid('textures')
  for (const [id, t] of Object.entries(data.textures)) {
    if (!isObject(t) || typeof t.name !== 'string' || !isImage(t.image)) throw invalid(`texture "${id}"`)
    textures[id] = { name: t.name, image: t.image }
  }

  if (!Array.isArray(data.walls)) throw invalid('walls')
  const walls = data.walls.map((w, i) => parseWall(w, `wall ${i + 1}`, textures))
  if (new Set(walls.map((w) => w.id)).size !== walls.length) throw invalid('walls (duplicate ids)')

  if (!isObject(data.wallDefaults)) throw invalid('wall defaults')
  const wallDefaults = parseWallProps(data.wallDefaults, 'wall defaults', textures)

  const rooms = parseRooms(data.rooms, textures)
  const models = parseModels(data.models)
  const openings = parseOpenings(data.openings, new Set(walls.map((w) => w.id)))
  return {
    app: 'monarch',
    version: data.version,
    units,
    plan: parsePlan(data.plan),
    walls,
    openings,
    objects: parseObjects(data.objects, textures, models),
    models,
    sun: parseSun(data.sun),
    wallDefaults,
    rooms,
    textures,
  }
}

function parseSun(v: unknown): SunSettings {
  if (v === undefined) return { ...DEFAULT_SUN } // version 6 or older
  const within = (n: unknown, min: number, max: number): n is number => isFiniteNumber(n) && n >= min && n <= max
  if (
    !isObject(v) ||
    typeof v.enabled !== 'boolean' ||
    !within(v.latitude, -90, 90) ||
    !within(v.day, 1, 365) ||
    !within(v.hour, 0, 24) ||
    !isFiniteNumber(v.north)
  ) {
    throw invalid('sun study')
  }
  return { enabled: v.enabled, latitude: v.latitude, day: v.day, hour: v.hour, north: v.north }
}

function parseSize(size: unknown, label: string): Size3 {
  if (!isObject(size) || !isPositive(size.width) || !isPositive(size.depth) || !isPositive(size.height)) {
    throw invalid(`${label} size`)
  }
  return { width: size.width, depth: size.depth, height: size.height }
}

function parseModels(m: unknown): ProjectFile['models'] {
  if (m === undefined) return {} // version 5 or older
  if (!isObject(m)) throw invalid('models')
  return Object.fromEntries(
    Object.entries(m).map(([id, v]) => {
      const label = `model "${id}"`
      if (!isObject(v) || typeof v.name !== 'string') throw invalid(label)
      if (v.format !== 'glb' && v.format !== 'gltf' && v.format !== 'obj') throw invalid(`${label} format`)
      if (typeof v.data !== 'string' || !v.data.startsWith('data:')) throw invalid(`${label} file`)
      return [id, { name: v.name, format: v.format, naturalSize: parseSize(v.naturalSize, label), data: v.data }]
    }),
  )
}

function parseObjects(
  list: unknown,
  textures: ProjectFile['textures'],
  models: ProjectFile['models'],
): PlacedObject[] {
  if (list === undefined) return [] // version 4 or older
  if (!Array.isArray(list)) throw invalid('furniture')
  const objects = list.map((o, i): PlacedObject => {
    const label = `furniture ${i + 1}`
    if (!isObject(o) || typeof o.id !== 'string' || !o.id) throw invalid(label)
    const isModel = o.kind === 'model'
    if (typeof o.kind !== 'string' || !(isModel || o.kind in LIBRARY)) throw invalid(`${label} kind`)
    if (isModel && (typeof o.modelId !== 'string' || !(o.modelId in models))) {
      throw invalid(`${label} (its model file is missing)`)
    }
    const { position, rotation } = o
    if (!isObject(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.z)) throw invalid(`${label} position`)
    if (!isFiniteNumber(rotation)) throw invalid(`${label} rotation`)
    return {
      id: o.id,
      kind: o.kind as ObjectKind | 'model',
      ...(isModel && { modelId: o.modelId as string }),
      position: { x: position.x, z: position.z },
      rotation,
      size: parseSize(o.size, label),
      material: parseMaterial(o.material, label, textures),
    }
  })
  if (new Set(objects.map((o) => o.id)).size !== objects.length) throw invalid('furniture (duplicate ids)')
  return objects
}

function parseOpenings(list: unknown, wallIds: Set<string>): Opening[] {
  if (list === undefined) return [] // version 1 or 2 file
  if (!Array.isArray(list)) throw invalid('openings')
  const openings = list.map((o, i): Opening => {
    const label = `opening ${i + 1}`
    if (!isObject(o) || typeof o.id !== 'string' || !o.id) throw invalid(label)
    if (typeof o.wallId !== 'string' || !wallIds.has(o.wallId)) throw invalid(`${label} (its wall is missing)`)
    if (o.type !== 'door' && o.type !== 'window') throw invalid(`${label} type`)
    if (!isPositive(o.width) || !isPositive(o.height)) throw invalid(`${label} size`)
    if (!isFiniteNumber(o.position) || !isFiniteNumber(o.sill) || o.sill < 0) throw invalid(label)
    // Version 3 files have no hinge or swing.
    const hinge = o.hinge ?? 'start'
    const swing = o.swing ?? 'left'
    if (hinge !== 'start' && hinge !== 'end') throw invalid(`${label} hinge`)
    if (swing !== 'left' && swing !== 'right') throw invalid(`${label} swing`)
    const { id, wallId, type, position, width, height, sill } = o
    return { id, wallId, type, position, width, height, sill, hinge, swing }
  })
  if (new Set(openings.map((o) => o.id)).size !== openings.length) throw invalid('openings (duplicate ids)')
  return openings
}

function parseRooms(r: unknown, textures: ProjectFile['textures']): RoomFinishes {
  if (r === undefined) return { defaults: ROOM_DEFAULTS, materials: {} } // version 1 file
  if (!isObject(r) || !isObject(r.materials)) throw invalid('rooms')
  const finishes = (v: unknown, label: string): RoomMaterials => {
    if (!isObject(v)) throw invalid(label)
    return {
      floor: parseMaterial(v.floor, `${label} floor`, textures),
      ceiling: parseMaterial(v.ceiling, `${label} ceiling`, textures),
    }
  }
  return {
    defaults: finishes(r.defaults, 'room defaults'),
    materials: Object.fromEntries(Object.entries(r.materials).map(([id, v]) => [id, finishes(v, 'room')])),
  }
}

function parsePlan(p: unknown): ProjectFile['plan'] {
  if (p === null || p === undefined) return null
  if (!isObject(p)) throw invalid('plan')
  const { name, widthPx, heightPx, metresPerPx, calibrated, calibrationLine, image } = p
  if (typeof name !== 'string' || typeof calibrated !== 'boolean' || !isImage(image)) throw invalid('plan')
  if (!isPositive(widthPx) || !isPositive(heightPx) || !isPositive(metresPerPx)) throw invalid('plan size')
  let line: [Px, Px] | null = null
  if (calibrationLine !== null && calibrationLine !== undefined) {
    if (!Array.isArray(calibrationLine) || calibrationLine.length !== 2) throw invalid('plan calibration')
    const [a, b] = calibrationLine.map((q) => {
      if (!isObject(q) || !isFiniteNumber(q.x) || !isFiniteNumber(q.y)) throw invalid('plan calibration')
      return { x: q.x, y: q.y }
    })
    line = [a, b]
  }
  return { name, widthPx, heightPx, metresPerPx, calibrated, calibrationLine: line, image }
}

function parseWall(w: unknown, label: string, textures: ProjectFile['textures']): Wall {
  if (!isObject(w) || typeof w.id !== 'string' || !w.id) throw invalid(label)
  const point = (q: unknown) => {
    if (!isObject(q) || !isFiniteNumber(q.x) || !isFiniteNumber(q.z)) throw invalid(label)
    return { x: q.x, z: q.z }
  }
  return { id: w.id, start: point(w.start), end: point(w.end), ...parseWallProps(w, label, textures) }
}

function parseWallProps(w: Record<string, unknown>, label: string, textures: ProjectFile['textures']): WallProps {
  if (!isPositive(w.height) || !isPositive(w.thickness)) throw invalid(label)
  return { height: w.height, thickness: w.thickness, material: parseMaterial(w.material, label, textures) }
}

function parseMaterial(m: unknown, label: string, textures: ProjectFile['textures']): Material {
  if (!isObject(m)) throw invalid(`${label} material`)
  const { color, roughness, metalness, textureId, tileSize } = m
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw invalid(`${label} color`)
  if (!isUnit(roughness) || !isUnit(metalness) || !isPositive(tileSize)) throw invalid(`${label} material`)
  if (textureId !== null && typeof textureId !== 'string') throw invalid(`${label} material`)
  // A texture missing from the file falls back to the plain colour rather than failing the load.
  const id = textureId !== null && textureId in textures ? textureId : null
  return { color, roughness, metalness, textureId: id, tileSize }
}

const invalid = (what: string) => new Error(`This project file is damaged: invalid ${what}.`)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0
const isUnit = (v: unknown): v is number => isFiniteNumber(v) && v >= 0 && v <= 1
const isImage = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/')
