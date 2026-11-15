import type { Raster } from './detectWalls'

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

/** Shown to a model at this size: big enough to read a door arc, small enough to send quickly. */
const CROP_SIDE = 512

/** A square of the image as a PNG, base64-encoded without a data: prefix. `square` is in image pixels and may overhang the image. */
export async function cropPng(url: string, square: { x: number; y: number; size: number }): Promise<string> {
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
  return canvas.toDataURL('image/png').split(',')[1]
}
