// The chat's route to Claude: what worker/index.ts runs for /agent, and what the dev and preview
// servers run too (see vite.config.ts). The key must not be in a browser, so the browser comes here
// and this adds the key. The model, system prompt and tools are fixed here, so the route cannot be
// used to run anything else on the owner's account.
//
// POST /agent with { "messages": [...] } runs one turn of the conversation and answers with
// Anthropic's reply. The browser runs the tools Claude asks for (they act on its viewport) and
// posts again with the results.

import { json, sameText } from './jev.ts'

interface Env {
  ANTHROPIC_API_KEY?: string
  APP_PASSWORD?: string
}

const API_URL = 'https://api.anthropic.com/v1/messages'
export const MODEL = 'claude-sonnet-5-5'
const MAX_TOKENS = 8192
/** Screenshots are sent back as images, so a long chat is large. Beyond this the chat should start over. */
const MAX_BODY_BYTES = 8 * 1024 * 1024

export const SYSTEM = `You are Monarch, an interior and architecture design assistant. You work in a chat with a live 3D viewport beside it.

You draw the viewport yourself. Call render_viewport with JavaScript that builds the scene. Your code is the body of a function with these arguments: THREE (the three.js library), scene, camera, renderer, models (3D models made from photos, by name). Build meshes and add them to the scene. Orbit controls, a ground grid and basic lights already exist. Do not import anything and do not touch the page.

Rules for the scene:
- One unit is one metre. Real sizes matter: a door is about 2.0 m high, a sofa about 0.9 m deep.
- People give sizes in cm, inches, or feet and inches, and write them as L x D x H (length, depth, height). P means depth too. Call convert_length for every size that is not already in metres, and build with the metres it returns. Never do the conversion yourself.
- When you answer, give sizes in the units the user used.
- The user may attach photos, numbered Photo 1, Photo 2 and so on. To turn the object in a photo into a 3D model, call model_from_photo once for it. It takes a minute or two and costs money, so never call it again for the same photo. Then clone the model in your scene code with models.<name>.clone(). Check its real size in the result and scale it to the dimensions the user gave, if they gave any.
- Replace the whole scene each time. Each call to render_viewport starts from an empty scene.
- After you render, call screenshot_viewport and look at the result. If something is wrong, fix it and render again. Stop once it looks right.
- If render_viewport returns an error, fix the code and call it again.

Keep replies short. Say what you built and what you assumed.`

const TOOLS = [
  {
    name: 'render_viewport',
    description:
      'Replace the 3D viewport with a scene. `code` is the body of a function (THREE, scene, camera, renderer) that builds the scene. Returns "ok" or the error that was thrown.',
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'JavaScript, the body of function (THREE, scene, camera, renderer).' } },
      required: ['code'],
    },
  },
  {
    name: 'convert_length',
    description:
      'Exact conversion of lengths to metres and feet and inches. Each length is text such as "195 cm", "110.2 inch" or "9 ft 2.2 in". Returns one line per length.',
    input_schema: {
      type: 'object',
      properties: { lengths: { type: 'array', items: { type: 'string' }, description: 'One length per item, with its unit.' } },
      required: ['lengths'],
    },
  },
  {
    name: 'model_from_photo',
    description:
      'Makes a 3D model of the one object in an attached photo. Takes 1 to 2 minutes and costs about $0.30, so call it once per photo. Afterwards render_viewport code can use models.<name>.clone().',
    input_schema: {
      type: 'object',
      properties: {
        photo: { type: 'integer', description: 'Which photo: 1 is the first one attached.' },
        name: { type: 'string', description: 'Lowercase letters, digits and underscores, starting with a letter, such as "sofa".' },
      },
      required: ['photo', 'name'],
    },
  },
  {
    name: 'screenshot_viewport',
    description: 'Returns an image of the viewport as the user sees it now. Use it to check your work.',
    input_schema: { type: 'object', properties: {} },
  },
]

/** The messages must at least be a non-empty list that starts with the user, as the API requires. */
function messagesOf(text: string): unknown[] | undefined {
  try {
    const { messages } = JSON.parse(text)
    return Array.isArray(messages) && messages.length > 0 && messages[0]?.role === 'user' ? messages : undefined
  } catch {
    return undefined
  }
}

/** Answers /agent for a caller already allowed to use `key`. */
export async function agentRequest(request: Request, key: string): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const tooLarge = json(413, { error: 'The conversation is too long. Start a new one.' })
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return tooLarge
  const messages = messagesOf(text)
  if (!messages) return json(400, { error: 'No messages were sent.' })

  let upstream: Response
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, tools: TOOLS, messages }),
    })
  } catch (err) {
    // The runtime's own words say why, which "could not reach" alone does not. The key is kept out of them.
    const why = err instanceof Error ? err.message.split(key).join('[key]') : ''
    return json(502, { error: `Could not reach Claude${why ? ` (${why})` : ''}.` })
  }
  if (upstream.status === 401) return json(502, { error: "Claude did not accept the server's API key." })
  return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } })
}

/** Answers /agent on the hosted app, for people who know the shared password. */
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  // Without a password set, an empty header would match and the route would be open to anyone.
  if (!env.ANTHROPIC_API_KEY || !env.APP_PASSWORD) return json(500, { error: 'The server is not configured for Claude.' })
  if (!sameText(request.headers.get('X-App-Password') ?? '', env.APP_PASSWORD)) {
    return json(401, { error: 'Wrong or missing password.' })
  }
  const key = env.ANTHROPIC_API_KEY.trim()
  if (!/^[\x21-\x7e]+$/.test(key)) return json(500, { error: "The server's ANTHROPIC_API_KEY is not a whole key." })
  return agentRequest(request, key)
}
