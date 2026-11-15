// Finding walls in a floor-plan image by plain image processing.
// Scope: solid dark strokes that run horizontally or vertically, as in a clean
// black-and-white plan. Diagonal, hollow (double-line) and hatched walls are not found.

import type { Px } from './geometry'

export interface Raster {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, row by row. */
  data: Uint8ClampedArray | Uint8Array
}

export interface DetectedWall {
  start: Px
  end: Px
  /** Stroke thickness in pixels. */
  thickness: number
}

export interface DetectedGap {
  /** Index into `walls` of the wall this gap was bridged in. */
  wall: number
  /** Where the gap starts and ends, in pixels along the wall's centre-line measured from the wall's `start`. start < end. */
  start: number
  end: number
}

export interface DetectOptions {
  /** Strokes thinner than this many pixels are annotation, not walls. */
  minThickness: number
  /** Strokes shorter than this many pixels are ignored (letters, symbols, door leaves). Must exceed the thickest wall. */
  minLength: number
  /** Collinear pieces of wall separated by a gap of up to this many pixels are joined into one wall: doors and windows are drawn as gaps. */
  maxGap: number
}

/** Brightest channel a pixel may have, over a white page, and still be ink. Coloured annotation has one bright channel. */
const INK_MAX = 127

/** How far (px) a wall's end may fall outside a perpendicular wall and still be joined to it. */
const SNAP_TOLERANCE = 3

/** A wall must be at least this many times longer than it is thick; anything squarer is a filled shape. */
const MIN_ASPECT = 2

/**
 * A straight stroke in one orientation: `a` runs along it, `c` across it.
 * Both ranges are half-open pixel ranges, so their ends are pixel edges.
 */
interface Band {
  a0: number
  a1: number
  c0: number
  c1: number
}

/** A band joined from collinear pieces, with the gaps [from, to) between the ink of neighbouring pieces, in order. */
interface Wall extends Band {
  gaps: [from: number, to: number][]
}

const centre = (b: Band) => (b.c0 + b.c1) / 2
const thickness = (b: Band) => b.c1 - b.c0
const length = (b: Band) => b.a1 - b.a0

/** 1 where the pixel, composited over white, is dark in every channel. */
function inkMask({ width, height, data }: Raster): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const darkness = 255 - Math.max(data[p], data[p + 1], data[p + 2])
    if (darkness * data[p + 3] >= (255 - INK_MAX) * 255) mask[i] = 1
  }
  return mask
}

/** The same mask with rows and columns swapped, so that column work can reuse row code. */
function transpose(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[x * height + y] = mask[y * width + x]
  }
  return out
}

/** Calls `visit(y, x0, x1)` for every run of set pixels [x0, x1) in a row that is at least `min` long. */
function forEachRun(
  mask: Uint8Array,
  width: number,
  height: number,
  min: number,
  visit: (y: number, x0: number, x1: number) => void,
): void {
  for (let y = 0; y < height; y++) {
    const row = y * width
    let x = 0
    while (x < width) {
      if (!mask[row + x]) {
        x++
        continue
      }
      const x0 = x
      while (x < width && mask[row + x]) x++
      if (x - x0 >= min) visit(y, x0, x)
    }
  }
}

/** The pixels that lie in a row run of at least `min` pixels. */
function inLongRuns(mask: Uint8Array, width: number, height: number, min: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  forEachRun(mask, width, height, min, (y, x0, x1) => out.fill(1, y * width + x0, y * width + x1))
  return out
}

/**
 * Horizontal bands: long row runs, stacked from one row to the next while they are the same stroke:
 * a run extends a band only if the two overlap by more than half of the longer one's length.
 * So ragged or stepped ends stay in one band, while a short stub or column attached to the side of
 * a wall starts a band of its own instead of thickening the wall.
 * Only long runs count, so a perpendicular stroke (whose rows are as short as it is thick)
 * contributes nothing, and where strokes cross the long run simply passes through.
 */
function findBands(mask: Uint8Array, width: number, height: number, minLength: number): Band[] {
  const bands: Band[] = []
  let open: Band[] = []
  let next: Band[] = []
  let row = 0
  forEachRun(mask, width, height, minLength, (y, x0, x1) => {
    if (y !== row) {
      // Bands not continued on the row just finished are complete; so is every band if rows were skipped.
      bands.push(...open)
      if (y === row + 1) {
        open = next
      } else {
        bands.push(...next)
        open = []
      }
      next = []
      row = y
    }
    const i = open.findIndex(
      (b) => 2 * (Math.min(b.a1, x1) - Math.max(b.a0, x0)) > Math.max(length(b), x1 - x0),
    )
    if (i < 0) {
      next.push({ a0: x0, a1: x1, c0: y, c1: y + 1 })
      return
    }
    const band = open.splice(i, 1)[0]
    band.a0 = Math.min(band.a0, x0)
    band.a1 = Math.max(band.a1, x1)
    band.c1 = y + 1
    next.push(band)
  })
  return bands.concat(open, next)
}

/** Joins collinear bands whose gap is at most `maxGap`. The longer piece decides the centre-line and thickness. */
function bridgeGaps(bands: Band[], maxGap: number): Wall[] {
  const merged: Wall[] = []
  for (const b of [...bands].sort((p, q) => p.a0 - q.a0)) {
    const m = merged.find(
      (m) => Math.abs(centre(m) - centre(b)) <= Math.min(thickness(m), thickness(b)) / 2 && b.a0 - m.a1 <= maxGap,
    )
    if (!m) {
      merged.push({ ...b, gaps: [] })
      continue
    }
    if (b.a0 > m.a1) m.gaps.push([m.a1, b.a0])
    if (length(b) > length(m)) {
      m.c0 = b.c0
      m.c1 = b.c1
    }
    m.a1 = Math.max(m.a1, b.a1)
  }
  return merged
}

/**
 * Where an end of a band lies on a perpendicular band, the end moves onto that band's centre-line,
 * so that corners share a point and the stem of a T ends on the bar: rooms close only then.
 */
function snapEnds(bands: Wall[], crossing: Band[]): Wall[] {
  const snap = (a: number, c: number) => {
    const hit = crossing.find(
      (o) =>
        a >= o.c0 - SNAP_TOLERANCE && a <= o.c1 + SNAP_TOLERANCE && c >= o.a0 - SNAP_TOLERANCE && c <= o.a1 + SNAP_TOLERANCE,
    )
    return hit ? centre(hit) : a
  }
  return bands.map((b) => ({ ...b, a0: snap(b.a0, centre(b)), a1: snap(b.a1, centre(b)) }))
}

/**
 * The solid horizontal and vertical walls drawn in the image: horizontal walls first, top to bottom
 * then left to right; then vertical walls, left to right then top to bottom. `start` is the left or top end.
 */
export function detectWalls(image: Raster, options: DetectOptions): DetectedWall[] {
  return detectPlan(image, options).walls
}

/** The walls that `detectWalls` finds, and every gap that was bridged to join collinear pieces: by wall, then along it. */
export function detectPlan(image: Raster, options: DetectOptions): { walls: DetectedWall[]; gaps: DetectedGap[] } {
  const { width, height } = image
  const { minThickness, minLength, maxGap } = options

  // Thin strokes (dimension lines, text, window lines) go first: only ink that is at least
  // minThickness both ways survives, so they can neither form walls nor extend one.
  const ink = inkMask(image)
  const wide = inLongRuns(ink, width, height, minThickness)
  const tall = transpose(inLongRuns(transpose(ink, width, height), height, width, minThickness), height, width)
  const solid = wide.map((v, i) => v & tall[i])

  const walls = (mask: Uint8Array, w: number, h: number) =>
    bridgeGaps(
      findBands(mask, w, h, minLength).filter(
        (b) => thickness(b) >= minThickness && length(b) >= MIN_ASPECT * thickness(b),
      ),
      maxGap,
    )
  const horizontal = walls(solid, width, height)
  const vertical = walls(transpose(solid, width, height), height, width)

  // Snapping can pull both ends of a short wall together: what is then shorter than minLength is dropped.
  const inOrder = (bands: Wall[]) =>
    bands.filter((b) => length(b) >= minLength).sort((p, q) => centre(p) - centre(q) || p.a0 - q.a0)
  const across = inOrder(snapEnds(horizontal, vertical))
  const down = inOrder(snapEnds(vertical, horizontal))
  return {
    walls: [
      ...across.map((b) => ({
        start: { x: b.a0, y: centre(b) },
        end: { x: b.a1, y: centre(b) },
        thickness: thickness(b),
      })),
      ...down.map((b) => ({
        start: { x: centre(b), y: b.a0 },
        end: { x: centre(b), y: b.a1 },
        thickness: thickness(b),
      })),
    ],
    // Gap offsets are taken from the snapped start, which is the wall's `start`.
    gaps: [...across, ...down].flatMap((b, wall) =>
      b.gaps.map(([from, to]) => ({ wall, start: from - b.a0, end: to - b.a0 })),
    ),
  }
}
