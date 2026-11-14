// All lengths are stored in metres. Units only affect display and input.

export type Units = 'metric' | 'imperial'

const METRES_PER_INCH = 0.0254
const METRES_PER_FOOT = 0.3048

export function formatLength(metres: number, units: Units): string {
  if (units === 'metric') return `${metres.toFixed(3)} m`

  // Round to the nearest 1/8", carrying into feet when it reaches 12".
  const sign = metres < 0 ? '-' : ''
  const eighths = Math.round((Math.abs(metres) / METRES_PER_INCH) * 8)
  const feet = Math.floor(eighths / 96)
  const remainder = eighths - feet * 96
  const wholeInches = Math.floor(remainder / 8)
  const fraction = reduceEighths(remainder % 8)
  const inches = fraction ? `${wholeInches} ${fraction}` : `${wholeInches}`
  return `${sign}${feet}' ${inches}"`
}

function reduceEighths(n: number): string {
  if (n === 0) return ''
  let num = n
  let den = 8
  while (num % 2 === 0) {
    num /= 2
    den /= 2
  }
  return `${num}/${den}`
}

const NUM = String.raw`(\d+(?:\.\d+)?)`

/**
 * Parse a typed length into metres, or null if it can't be read.
 * Metric: "3.2", "3.2 m", "320 cm", "3200 mm".
 * Imperial: "10", "10'", "10 ft", "10' 6\"", "10ft 6in", "126\"".
 */
export function parseLength(input: string, units: Units): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null

  if (units === 'metric') {
    const m = s.match(new RegExp(`^${NUM}\\s*(m|cm|mm)?$`))
    if (!m) return null
    const value = parseFloat(m[1])
    const factor = m[2] === 'cm' ? 0.01 : m[2] === 'mm' ? 0.001 : 1
    return value * factor
  }

  const feetAndInches = s.match(
    new RegExp(`^${NUM}\\s*(?:'|ft|feet)\\s*(?:${NUM}\\s*(?:"|in|inch|inches)?)?$`),
  )
  if (feetAndInches) {
    const inches = feetAndInches[2] ? parseFloat(feetAndInches[2]) : 0
    return parseFloat(feetAndInches[1]) * METRES_PER_FOOT + inches * METRES_PER_INCH
  }
  const inchesOnly = s.match(new RegExp(`^${NUM}\\s*(?:"|in|inch|inches)$`))
  if (inchesOnly) return parseFloat(inchesOnly[1]) * METRES_PER_INCH
  const bare = s.match(new RegExp(`^${NUM}$`))
  if (bare) return parseFloat(bare[1]) * METRES_PER_FOOT
  return null
}

const SQ_METRES_PER_SQ_FOOT = METRES_PER_FOOT * METRES_PER_FOOT

export function formatArea(squareMetres: number, units: Units): string {
  if (units === 'metric') return `${squareMetres.toFixed(2)} m²`
  return `${(squareMetres / SQ_METRES_PER_SQ_FOOT).toFixed(1)} sq ft`
}
