// Sun, sky and weather for a time of day. The maths is here, as one self-contained function, so
// it can be tested. The viewport page has no imports, so harness.ts copies this function's source
// into it: it must not use anything defined outside itself.

export type Weather = 'clear' | 'overcast' | 'fog'

export interface Sky {
  /** Unit vector from the scene to the light: x east (+) to west (-), y up, z south. At night it is the moon's. */
  lightDirection: [number, number, number]
  lightColor: number
  lightIntensity: number
  /** Light that comes from the whole sky. */
  skyLight: number
  /** The colour of the sky behind the scene. */
  background: number
  fog: boolean
  /** The sun is up and strong enough to cast shadows. */
  shadows: boolean
  /** Degrees above the horizon. Negative at night. */
  elevation: number
}

/**
 * The look of `hour` on the 24-hour clock (6 is sunrise, 12 noon, 18 sunset) in the given weather.
 * The sun rises in the east (+x), passes the south (+z) and sets in the west (-x), 60 degrees up at noon.
 */
export function skyFor(hour: number, weather: Weather): Sky {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const smooth = (from: number, to: number, x: number) => {
    const t = clamp((x - from) / (to - from), 0, 1)
    return t * t * (3 - 2 * t)
  }
  const mix = (a: number, b: number, t: number) => {
    const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
    return (channel(16) << 16) | (channel(8) << 8) | channel(0)
  }

  const t = (((hour % 24) + 24) % 24 - 6) / 12 // 0 at sunrise, 1 at sunset, outside 0..1 at night
  const elevation = Math.sin(Math.PI * t) * 60
  const e = (elevation * Math.PI) / 180
  const az = Math.PI * t
  // Below the horizon the light is the moon's, put on the opposite side so it shines down.
  const raw = [Math.cos(az) * Math.cos(e), Math.abs(Math.sin(e)), 0.4 * Math.cos(e)]
  const length = Math.hypot(raw[0], raw[1], raw[2]) || 1
  const lightDirection = raw.map((n) => n / length) as [number, number, number]

  let lightColor = mix(0xff8c42, 0xfff1dc, smooth(0, 35, elevation)) // orange when low, white when high
  let lightIntensity = smooth(0, 15, elevation) * 2.2
  if (elevation < 0) {
    lightColor = 0x8fa6d8
    lightIntensity = 0.4 * smooth(-3, -12, elevation)
  }
  let skyLight = 0.15 + 0.95 * smooth(-8, 20, elevation)

  let background = mix(mix(0x0b1226, 0xe8956a, smooth(-10, -2, elevation)), 0xbcd8f2, smooth(2, 25, elevation))
  if (weather !== 'clear') {
    const gray = mix(0x0f1115, 0xaeb3b9, smooth(-8, 15, elevation))
    background = mix(background, gray, 0.8)
    lightIntensity *= weather === 'fog' ? 0.1 : 0.2
    skyLight = Math.min(1.3, skyLight * 1.15)
  }
  return { lightDirection, lightColor, lightIntensity, skyLight, background, fog: weather === 'fog', shadows: elevation > 0 && lightIntensity > 0.3, elevation }
}
