// Where the sun is, for a shadow study. Pure functions.
//
// Time is local solar time: 12 is solar noon, when the sun is highest. Clock time differs
// from it with longitude, time zone and daylight saving, by up to an hour or so.

export interface SunPosition {
  /** Degrees above the horizon; negative at night. */
  altitude: number
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth: number
}

/** The settings of a sun study. */
export interface SunSettings {
  /** Off: the scene keeps its fixed default light. */
  enabled: boolean
  /** Degrees, north positive. */
  latitude: number
  /** Day of the year, 1 to 365. */
  day: number
  /** Solar time in hours, 0 to 24. */
  hour: number
  /** Where north points on the plan: degrees clockwise from "up" in Top view. */
  north: number
}

export const DEFAULT_SUN: SunSettings = { enabled: false, latitude: 40, day: 172, hour: 14, north: 0 }

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** The sun's position for a latitude (degrees, north positive), day of the year (1-365) and solar hour (0-24). */
export function sunPosition(latitude: number, dayOfYear: number, solarHour: number): SunPosition {
  // Declination: the latitude the sun is overhead at, swinging +-23.44 degrees through the year.
  const declination = rad(23.44) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  const hourAngle = rad(15 * (solarHour - 12))
  const lat = rad(latitude)
  const sinAltitude = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  const azimuth =
    Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) + Math.PI
  return { altitude: deg(Math.asin(Math.max(-1, Math.min(1, sinAltitude)))), azimuth: ((deg(azimuth) % 360) + 360) % 360 }
}

/**
 * Unit vector pointing from the scene towards the sun. `north` is where north points on the
 * plan, in degrees clockwise from "up" in Top view (the -z direction): 0 when north is up,
 * 90 when north points right.
 */
export function sunDirection(sun: SunPosition, north: number): { x: number; y: number; z: number } {
  const bearing = rad(sun.azimuth + north) // measured clockwise from the plan's "up"
  const flat = Math.cos(rad(sun.altitude))
  return { x: Math.sin(bearing) * flat, y: Math.sin(rad(sun.altitude)), z: -Math.cos(bearing) * flat }
}

/** How strong daylight is, 0 to 1: full with the sun 10 degrees up or more, fading to nothing at the horizon. */
export function daylight(altitude: number): number {
  return Math.max(0, Math.min(1, altitude / 10))
}

const MONTHS: [string, number][] = [
  ['Jan', 31], ['Feb', 28], ['Mar', 31], ['Apr', 30], ['May', 31], ['Jun', 30],
  ['Jul', 31], ['Aug', 31], ['Sep', 30], ['Oct', 31], ['Nov', 30], ['Dec', 31],
]

/** A day of a 365-day year as "21 Jun". */
export function dayLabel(dayOfYear: number): string {
  let day = Math.min(365, Math.max(1, Math.round(dayOfYear)))
  for (const [name, length] of MONTHS) {
    if (day <= length) return `${day} ${name}`
    day -= length
  }
  return '31 Dec'
}

/** A solar hour as "06:15". */
export function timeLabel(hour: number): string {
  const minutes = Math.round(hour * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** The nearest of the eight compass points to a bearing. */
export function compassPoint(azimuth: number): string {
  return POINTS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8]
}
