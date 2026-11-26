// The browser side of reading a floor plan: the image's pixels in, and a picture of what was found out.

import { readRaster } from '../plan/readRaster'
import { describePlan, readPlan, type Calibration } from './floorPlan'

/** The picture sent back is shrunk to this many pixels on its longest side. */
const OVERLAY_SIDE = 1024

/** Reads the plan at `url` and draws what was found on it. `text` is for the model, `overlay` a JPEG data: URL. */
export async function readFloorPlan(url: string, calibration?: Calibration): Promise<{ text: string; overlay: string }> {
  const { raster } = await readRaster(url)
  const reading = readPlan(raster, calibration)

  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const label = (text: string, x: number, y: number, color: string) => {
    ctx.font = 'bold 22px sans-serif'
    const w = ctx.measureText(text).width + 10
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - w / 2, y - 14, w, 28)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.strokeRect(x - w / 2, y - 14, w, 28)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y + 1)
  }
  reading.walls.forEach(({ start, end, thickness }, i) => {
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.55)'
    ctx.lineWidth = thickness
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    label(String(i + 1), (start.x + end.x) / 2, (start.y + end.y) / 2, '#c25e00')
  })
  const counted = new Map<number, number>()
  for (const gap of reading.openings) {
    const wall = reading.walls[gap.wall]
    const across = wall.start.y === wall.end.y
    const [from, to] = [gap.start, gap.end]
    const [x, y, w, h] = across
      ? [wall.start.x + from, wall.start.y - wall.thickness / 2 - 4, to - from, wall.thickness + 8]
      : [wall.start.x - wall.thickness / 2 - 4, wall.start.y + from, wall.thickness + 8, to - from]
    ctx.strokeStyle = '#1f6feb'
    ctx.lineWidth = 3
    ctx.strokeRect(x, y, w, h)
    const n = (counted.get(gap.wall) ?? 0) + 1
    counted.set(gap.wall, n)
    label(`${gap.wall + 1}.${n}`, x + w / 2, across ? y - 22 : y + h / 2, '#1f6feb')
  }

  const shrink = Math.min(1, OVERLAY_SIDE / Math.max(canvas.width, canvas.height))
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * shrink)
  out.height = Math.round(canvas.height * shrink)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return { text: describePlan(reading), overlay: out.toDataURL('image/jpeg', 0.85) }
}
