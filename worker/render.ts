// The app's route to fal's image-edit model, which turns a screenshot of the 3D scene into a
// photoreal picture: what worker/index.ts runs for /render, and what the dev and preview servers
// run too (see vite.config.ts). The key must not be in a browser, so the browser comes here and this
// adds the key. The model, its settings and the rules about keeping the layout are fixed here, so
// the route cannot be used to run anything else on the owner's account.
//
// POST /render with { "prompt": "oak floor, evening light", "images": ["data:image/...", ...] }.
// The first image is the 3D screenshot. An optional second is a photo for materials and style.
// Answers with fal's { images: [{ url }] }. Each call is billed to the key's account.

import { relay } from './fal.ts'
import { json, sameText } from './jev.ts'

interface Env {
  FAL_KEY?: string
  APP_PASSWORD?: string
}

/** Nano Banana 2 edit: $0.08 an image at the default 1K size. Swapping the model is a change to this line. */
export const MODEL = 'fal-ai/nano-banana-2/edit'
/** Two images of about 1024 px as JPEGs, well below this. */
const MAX_BODY_BYTES = 6 * 1024 * 1024
const MAX_PROMPT_CHARS = 1000

/** The model drifts if left alone, so the layout rules come first and the user's style after them. */
export function promptFor(style: string, hasReference: boolean): string {
  return [
    'Turn the first image, a 3D visualization of a room, into a photorealistic interior photograph.',
    'Keep the room layout, the camera angle, and the position, proportions and size of every object exactly as in the first image. Do not add, remove or move any furniture.',
    hasReference ? 'The second image is a photo to take materials, colours and style from. Do not copy its layout.' : '',
    `Style: ${style}`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Answers /render for a caller already allowed to use `key`. */
export async function renderRequest(request: Request, key: string): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const tooLarge = json(413, { error: 'The images are too large.' })
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return tooLarge
  let body: { prompt?: unknown; images?: unknown } = {}
  try {
    body = JSON.parse(text)
  } catch {
    // handled below
  }
  const { prompt, images } = body
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) return json(400, { error: 'No style was given, or it is too long.' })
  if (!Array.isArray(images) || images.length < 1 || images.length > 2 || !images.every((i) => typeof i === 'string' && i.startsWith('data:image/'))) {
    return json(400, { error: 'Send one or two images.' })
  }
  const input = {
    prompt: promptFor(prompt.trim(), images.length > 1),
    image_urls: images,
    num_images: 1,
    aspect_ratio: 'auto',
    output_format: 'jpeg',
  }
  return relay(
    fetch(`https://fal.run/${MODEL}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
    key,
  )
}

/** Answers /render on the hosted app, for people who know the shared password. */
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  // Without a password set, an empty header would match and the route would be open to anyone.
  if (!env.FAL_KEY || !env.APP_PASSWORD) return json(500, { error: 'The server is not configured for fal.' })
  if (!sameText(request.headers.get('X-App-Password') ?? '', env.APP_PASSWORD)) return json(401, { error: 'Wrong or missing password.' })
  const key = env.FAL_KEY.trim()
  if (!/^[\x21-\x7e]+$/.test(key)) return json(500, { error: "The server's FAL_KEY is not a whole key. Create a new key at fal and paste all of it." })
  return renderRequest(request, key)
}
