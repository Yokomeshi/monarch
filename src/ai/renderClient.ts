// Turning a screenshot of the 3D scene into a photoreal picture with fal, through the app's own
// /render route (worker/render.ts), which holds the key and fixes the model. Each call is billed
// to that key's account.

import { FalError } from './falClient'

/** The finished picture as a data: URL. `images` is the 3D screenshot, then optionally a style photo. */
export async function renderPhotoreal(images: string[], prompt: string, password: string): Promise<string> {
  const response = await fetch('render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(password && { 'X-App-Password': password }) },
    body: JSON.stringify({ prompt, images }),
  })
  const body = await response.json().catch(() => undefined) // not JSON, as from a static host's 404 page
  if (!response.ok) {
    const reason = body?.error ?? (Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail)
    throw new FalError(response.status, typeof reason === 'string' ? reason.replace(/\.$/, '') : undefined)
  }
  const url = body?.images?.[0]?.url
  if (typeof url !== 'string') throw new Error("fal's reply had no picture in it")
  // The file is on fal's public file host, which a browser may read directly.
  const file = await fetch(url)
  if (!file.ok) throw new Error(`Couldn't download the picture (${file.status})`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${file.headers.get('Content-Type') || 'image/jpeg'};base64,${btoa(binary)}`
}
