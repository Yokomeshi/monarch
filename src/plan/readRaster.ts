import type { Raster } from './detectWalls'
import type { Crop } from './suggestOpenings'

/** Detection does not need more detail than this, and a huge scan would be slow. */
const MAX_SIDE = 1600

/** The image's pixels, shrunk to at most 1600 px a side. `scale` is raster pixels per image pixel. */
export async function readRaster(url: string): Promise<{ raster: Raster; scale: number }> {
  const img = new Image()
  img.src = url
  await img.decode()
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')!
  // White behind transparent drawings, so empty paper is not read as ink.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { raster: { width: canvas.width, height: canvas.height, data }, scale }
}

/** Each corner mark runs this share of the frame's side, leaving the middle of every side open. */
const ARM = 0.4

/** Shown to a model at this size: big enough to read a door arc, small enough to send quickly. */
const CROP_SIDE = 512

/** A square of the image as a PNG with the mark drawn on it, base64-encoded without a data: prefix. */
export async function cropPng(url: string, { square, mark }: Crop): Promise<string> {
  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CROP_SIDE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // paper, where the square overhangs the image
  ctx.fillRect(0, 0, CROP_SIDE, CROP_SIDE)
  const k = CROP_SIDE / square.size
  ctx.drawImage(img, -square.x * k, -square.y * k, img.naturalWidth * k, img.naturalHeight * k)
  // Only the corners of the mark are drawn. A full outline crosses the wall at both ends of the
  // gap, and reads as something drawn across an open doorway.
  const [left, top, width, height] = [(mark.x - square.x) * k, (mark.y - square.y) * k, mark.width * k, mark.height * k]
  ctx.strokeStyle = '#ff0000'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (const [x, dx] of [[left, 1], [left + width, -1]]) {
    for (const [y, dy] of [[top, 1], [top + height, -1]]) {
      ctx.moveTo(x + dx * width * ARM, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + dy * height * ARM)
    }
  }
  ctx.stroke()
  return canvas.toDataURL('image/png').split(',')[1]
}
