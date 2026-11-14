// Project file format: one self-contained JSON document with images embedded as data URLs.

import { ROOM_DEFAULTS, type Material, type RoomMaterials } from './model/materials'
import type { Wall, WallProps } from './model/walls'
import type { Px } from './plan/geometry'
import type { Units } from './units'

// Version 2 added room floor and ceiling materials. Version 1 files still open.
export const PROJECT_VERSION = 2

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
export function usedTextureIds(walls: Wall[], wallDefaults: WallProps, rooms: RoomFinishes): string[] {
  const ids = [
    ...walls.map((w) => w.material.textureId),
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
  return { app: 'monarch', version: data.version, units, plan: parsePlan(data.plan), walls, wallDefaults, rooms, textures }
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
