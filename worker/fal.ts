// The app's route to fal's image-to-3D model: what worker/index.ts runs for /fal, and what the
// dev and preview servers run too (see vite.config.ts). The key must not be in a browser, so the
// browser comes here and this adds the key. The model is fixed here, so the route cannot be used
// to run anything else on the owner's account.
//
// POST /fal with { "image": "data:image/..." } queues one model, and answers with fal's
// { status_url, response_url, ... }. GET /fal?url=<one of those> reads the job's status or result.

import { json, sameText } from './jev.ts'

interface Env {
  FAL_KEY?: string
  APP_PASSWORD?: string
}

const QUEUE = 'https://queue.fal.run'
/** Tripo H3.1: one photo in, one textured GLB out. Each run is billed to the key's account. */
export const MODEL = 'tripo3d/h3.1/image-to-3d'
/**
 * Triangles in the model. Left to itself the model returned 1.4 million of them in a 44 MB file,
 * which is slow to draw and is saved inside the project file. This is plenty for a piece of furniture.
 */
const FACE_LIMIT = 50_000
/** The app sends a photo shrunk to 1024 px as a JPEG, well below this. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

/** fal's reply with only its status and JSON; a refusal of the server's key is told apart from a wrong password. */
export async function relay(upstream: Promise<Response>, key: string): Promise<Response> {
  let response: Response
  try {
    response = await upstream
  } catch (err) {
    // The runtime's own words say why, which "could not reach" alone does not. The key is kept out of them.
    const why = err instanceof Error ? err.message.split(key).join('[key]') : ''
    return json(502, { error: `Could not reach fal${why ? ` (${why})` : ''}.` })
  }
  if (response.status === 401) return json(502, { error: "fal did not accept the server's API key." })
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } })
}

/** Answers /fal for a caller already allowed to use `key`. */
export async function falRequest(request: Request, key: string): Promise<Response> {
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }

  if (request.method === 'GET') {
    // Only this model's jobs on fal's queue: the key must not be sent anywhere else.
    const url = new URL(request.url).searchParams.get('url') ?? ''
    if (!url.startsWith(`${QUEUE}/${MODEL.split('/')[0]}/`) || !url.includes('/requests/')) return json(400, { error: 'Not a fal request address.' })
    return relay(fetch(url, { headers }), key)
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const tooLarge = json(413, { error: 'The photo is too large.' })
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return tooLarge
  let image: unknown
  try {
    image = JSON.parse(text).image
  } catch {
    // handled below
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return json(400, { error: 'No photo was sent.' })
  // auto_size asks for real-world metres, so furniture arrives at about its true size.
  const input = { image_url: image, auto_size: true, face_limit: FACE_LIMIT }
  return relay(fetch(`${QUEUE}/${MODEL}`, { method: 'POST', headers, body: JSON.stringify(input) }), key)
}

/** Answers /fal on the hosted app, for people who know the shared password. */
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  // Without a password set, an empty header would match and the route would be open to anyone.
  if (!env.FAL_KEY || !env.APP_PASSWORD) return json(500, { error: 'The server is not configured for fal.' })
  if (!sameText(request.headers.get('X-App-Password') ?? '', env.APP_PASSWORD)) {
    return json(401, { error: 'Wrong or missing password.' })
  }
  // A key copied from a list that shows it shortened ("abc…xyz") or masked has characters that cannot
  // go in a header at all. The request would fail before it was sent, looking like fal being unreachable.
  const key = env.FAL_KEY.trim()
  if (!/^[\x21-\x7e]+$/.test(key)) {
    return json(500, { error: "The server's FAL_KEY is not a whole key. Create a new key at fal and paste all of it." })
  }
  return falRequest(request, key)
}
