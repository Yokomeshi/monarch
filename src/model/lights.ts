// Ceiling lights: point sources mounted on the ceiling of the room they are in.

import type { Room } from './rooms'
import type { Vec2, Wall } from './walls'

export interface CeilingLight {
  id: string
  position: Vec2
  /** Light output. A familiar scale (a 60 W bulb is about 800 lm), not a photometric simulation. */
  lumens: number
  /** Colour temperature in kelvin: low is warm, high is cool. */
  kelvin: number
}

export const LIGHT_DEFAULTS = { lumens: 800, kelvin: 3000 }
export const LUMENS_RANGE = { min: 100, max: 3000, step: 50 }
export const KELVIN_RANGE = { min: 2000, max: 6500, step: 100 }

export function createLight(position: Vec2): CeilingLight {
  return { id: crypto.randomUUID(), position, ...LIGHT_DEFAULTS }
}

/** Move lights with the plan, e.g. after recalibration. */
export function scaleLights(lights: CeilingLight[], factor: number): CeilingLight[] {
  return lights.map((l) => ({ ...l, position: { x: l.position.x * factor, z: l.position.z * factor } }))
}

/**
 * The colour of a black body at this temperature, as #rrggbb.
 * Tanner Helland's curve fit, good to a few percent from 1000 K to 40000 K.
 */
export function kelvinToHex(kelvin: number): string {
  const t = kelvin / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const hex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * Point-light intensity for the scene. The scene's other lights are not in real units,
 * so this is scaled for 800 lm to light a room about as well as the default daylight.
 */
export const lightIntensity = (lumens: number) => lumens / 75

/** Whether the point is inside the polygon (even-odd rule). */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.z > p.z !== b.z > p.z && p.x < a.x + ((p.z - a.z) / (b.z - a.z)) * (b.x - a.x)) inside = !inside
  }
  return inside
}

/** The ceiling height over a point: the lowest wall of the room it is in, or `fallback` outside every room. */
export function ceilingHeightAt(p: Vec2, rooms: Room[], walls: Wall[], fallback: number): number {
  const room = rooms.find((r) => pointInPolygon(p, r.outline))
  if (!room) return fallback
  return Math.min(...walls.filter((w) => room.wallIds.includes(w.id)).map((w) => w.height))
}
