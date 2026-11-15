// The hosted app's route to TypeSafe's Jev API: what worker/index.ts runs for a POST to /jev.
// Jev refuses calls made from a browser and the key must not be in one, so the browser posts here
// and this adds the key. A shared password keeps strangers from spending the owner's credits.
// In local development the /jev proxy in vite.config.ts does this job instead.

interface Env {
  TYPESAFE_API_KEY?: string
  APP_PASSWORD?: string
}

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
/** Header that lets Jev accept images; the app sends it, so it is the one header passed on. */
const IMAGE_HEADER = 'TypeSafe-Danger-Zone-Images'
/** A request carries one 512 px PNG crop as base64, far below this. Anything larger is not from the app. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/**
 * Whether two strings are equal, taking the same time wherever they first differ,
 * so that response times do not let a caller guess the password one character at a time.
 */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let difference = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) difference |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return difference === 0
}

/** Answers a POST to /jev. */
export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const key = env.TYPESAFE_API_KEY
  const password = env.APP_PASSWORD
  // Without a password set, an empty header would match and the route would be open to anyone.
  if (!key || !password) return json(500, { error: 'The server is not configured for Jev.' })

  if (!sameText(request.headers.get('X-App-Password') ?? '', password)) {
    return json(401, { error: 'Wrong or missing password.' })
  }

  const tooLarge = json(413, { error: 'The request is too large.' })
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge
  // Content-Length can lie or be absent, so count what actually arrived.
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) return tooLarge

  // Built from scratch: the password, cookies and Origin must not reach TypeSafe.
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const images = request.headers.get(IMAGE_HEADER)
  if (images !== null) headers[IMAGE_HEADER] = images

  let upstream: Response
  try {
    upstream = await fetch(JEV_URL, { method: 'POST', headers, body })
  } catch {
    return json(502, { error: 'Could not reach Jev.' })
  }
  // Jev's headers are left behind too; the app needs only the status and the JSON.
  return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } })
}
