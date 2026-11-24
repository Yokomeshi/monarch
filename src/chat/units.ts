// Lengths as people write them ("195 cm", "9 ft 2.2 in", 9'2", "41.3 inch") to metres and back.
// The model calls this through the convert_length tool instead of doing the arithmetic itself.

const METRES: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, inch: 0.0254, inches: 0.0254, '"': 0.0254, ft: 0.3048, foot: 0.3048, feet: 0.3048, "'": 0.3048 }
// Longer names first, so "mm" is not read as "m" and "inches" not as "in".
const PART = /(\d+(?:\.\d+)?)\s*(mm|cm|inches|inch|in|feet|foot|ft|m|"|')(?![a-z])/gi

/** Metres for text such as "9 ft 2.2 in", or undefined when any of it is not a length. */
export function parseLength(text: string): number | undefined {
  const parts = [...text.matchAll(PART)]
  // Whatever is left once the lengths are taken out may only be separators.
  if (parts.length === 0 || text.replace(PART, '').replace(/[\s,]|and/gi, '') !== '') return undefined
  return parts.reduce((sum, [, n, unit]) => sum + Number(n) * METRES[unit.toLowerCase()], 0)
}

/** "6 ft 4.8 in": inches to one decimal, carrying into the feet when they round up to 12. */
export function formatFeetInches(metres: number): string {
  const tenths = Math.round((metres / 0.0254) * 10)
  const feet = Math.floor(tenths / 120)
  const inches = (tenths - feet * 120) / 10
  return feet === 0 ? `${inches} in` : `${feet} ft ${inches} in`
}

/** One line for the model: the length in metres and in feet and inches, or why it could not be read. */
export function describeLength(text: string): string {
  const metres = parseLength(text)
  if (metres === undefined) return `${text} = could not read this as a length`
  return `${text} = ${Number(metres.toFixed(4))} m = ${formatFeetInches(metres)}`
}
