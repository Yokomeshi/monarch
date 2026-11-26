// Turning a photo of an object into a 3D model with fal, through the app's own /fal route
// (worker/fal.ts), which holds the key and fixes the model. Each run is billed to that key's account.

/** The service's answer was a refusal. 401 means the hosted app wants its access password. */
export class FalError extends Error {
  constructor(
    public status: number,
    reason?: string,
  ) {
    super(`fal request failed (${status})${reason ? `: ${reason}` : ''}`)
  }
}

/** Longest side of the photo that is sent. The model needs no more, and a phone photo would be slow to send. */
const PHOTO_SIDE = 1024
const POLL_MS = 3000
/** A model usually takes a minute or two. After this long something is wrong. */
const GIVE_UP_MS = 10 * 60 * 1000

/** The photo as a JPEG data: URL, shrunk to at most `side` px a side (1024 by default). */
export async function photoDataUrl(file: Blob, side = PHOTO_SIDE): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** What went wrong, from the route's `{ "error": "..." }` or fal's `{ "detail": ... }`. */
function reason(body: unknown): string | undefined {
  const { error, detail } = (body ?? {}) as { error?: unknown; detail?: unknown }
  const text = error ?? (Array.isArray(detail) ? detail[0]?.msg : detail)
  return typeof text === 'string' ? text.replace(/\.$/, '') : undefined
}

async function call(path: string, password: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(path, { ...init, headers: { ...init.headers, ...(password && { 'X-App-Password': password }) } })
  const body = await response.json().catch(() => undefined) // not JSON, as from a static host's 404 page
  if (!response.ok) throw new FalError(response.status, reason(body))
  return body ?? {}
}

/**
 * A 3D model (GLB) of what the photo shows. The job is queued once and never sent again,
 * since every submission is billed. Takes a minute or two.
 */
export async function modelFromPhoto(photo: string, password: string, wait = POLL_MS): Promise<Blob> {
  const job = await call('fal', password, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: photo }),
  })
  const read = (url: unknown) => call(`fal?url=${encodeURIComponent(String(url))}`, password)
  const started = Date.now()
  while ((await read(job.status_url)).status !== 'COMPLETED') {
    if (Date.now() - started > GIVE_UP_MS) throw new Error('fal took too long to make the model')
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  const mesh = (await read(job.response_url)).model_mesh as { url?: string } | undefined
  if (!mesh?.url) throw new Error("fal's reply had no model in it")
  // The file is on fal's public file host, which a browser may read directly.
  const file = await fetch(mesh.url)
  if (!file.ok) throw new Error(`Couldn't download the model (${file.status})`)
  return file.blob()
}
