// One user message in, a finished reply out. The model is called through the app's own /agent route
// (worker/agent.ts), which holds the key. The tools it asks for act on the viewport, which is in this
// browser, so the loop runs here: ask the model, run its tools, send back what they returned, repeat.

import { modelFromPhoto } from '../ai/falClient'
import { renderPhotoreal } from '../ai/renderClient'
import { describeLength, formatFeetInches } from './units'
import type { Measured, Viewport } from './viewport'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | Block[]; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export interface Message {
  role: 'user' | 'assistant'
  content: string | Block[]
}

/** The route refused or failed. 401 means the hosted app wants its access password. */
export class AgentError extends Error {
  constructor(
    public status: number,
    reason?: string,
  ) {
    super(`Request failed (${status})${reason ? `: ${reason}` : ''}`)
  }
}

/** A model that keeps calling tools is stopped after this many calls. */
const MAX_STEPS = 8

/**
 * The messages with every screenshot but the newest replaced by a note. Older pictures show a
 * scene that has since been replaced, and each one is sent again on every call.
 */
export function withLatestScreenshotOnly(messages: Message[]): Message[] {
  let newest = -1
  messages.forEach((m, i) => {
    if (Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result' && hasImage(b))) newest = i
  })
  return messages.map((m, i) =>
    i === newest || !Array.isArray(m.content)
      ? m
      : { ...m, content: m.content.map((b) => (b.type === 'tool_result' && hasImage(b) ? { ...b, content: '(an earlier screenshot)' } : b)) },
  )
}

const hasImage = (block: Block) => block.type === 'tool_result' && Array.isArray(block.content) && block.content.some((b) => b.type === 'image')

/** The measured objects as text for the model: each size in metres and in feet and inches. */
function describeScene(objects: Measured[]): string {
  if (objects.length === 0) return 'Nothing in the scene has a name. Set .name on each object you want measured, then render again.'
  const m = (n: number) => `${Number(n.toFixed(2))} m`
  const both = (n: number) => `${m(n)} (${formatFeetInches(n)})`
  return objects
    .map((o) => `${o.name}: ${both(o.size[0])} wide, ${both(o.size[1])} high, ${both(o.size[2])} deep. Spans x ${m(o.min[0])} to ${m(o.max[0])}, z ${m(o.min[2])} to ${m(o.max[2])}, y ${m(o.min[1])} to ${m(o.max[1])}.`)
    .join('\n')
}

/** Starts the text of a photoreal render's result, so the chat can tell it from a plain screenshot. */
export const RENDER_CAPTION = 'Photoreal render of the current scene.'
/** Each render is billed, so a model that is never satisfied is stopped after this many for one message. */
const MAX_RENDERS_PER_MESSAGE = 2

/** What the tools need beyond their own input. It outlives one message, so photos and models made from them stay known. */
export interface ToolContext {
  viewport: Viewport
  password: string
  /** Photos the user attached, as JPEG data: URLs. Photo 1 is the first. */
  photos: string[]
  /** What each photo's model was reported as, so a photo is never sent (and billed) twice. */
  made: Map<number, string>
  /** Photoreal renders made for the message being answered. */
  renders: number
}

export const createToolContext = (viewport: Viewport, password = ''): ToolContext => ({ viewport, password, photos: [], made: new Map(), renders: 0 })

/** Names the scene code uses to reach a model: models.<name>. */
const MODEL_NAME = /^[a-z][a-z0-9_]{0,30}$/

async function modelFromPhotoTool(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const number = Number(input.photo)
  const name = String(input.name ?? '')
  const photo = ctx.photos[number - 1]
  if (!photo) return `There is no photo ${input.photo}. ${ctx.photos.length} photo(s) have been attached.`
  if (!MODEL_NAME.test(name)) throw new Error('name must be lowercase letters, digits and underscores, starting with a letter.')
  const earlier = ctx.made.get(number)
  if (earlier) return `Photo ${number} already has a model. ${earlier}`
  const glb = await (await modelFromPhoto(photo, ctx.password)).arrayBuffer()
  const [x, y, z] = (await ctx.viewport.addModel(name, glb)).map((n) => Number(n.toFixed(2)))
  const report = `Model "${name}" is ready: ${x} m wide (x), ${z} m deep (z), ${y} m tall (y), standing on the floor at the origin. In render_viewport code use models.${name}.clone(); scale it only if that size is wrong.`
  ctx.made.set(number, report)
  return report
}

async function renderPhotorealTool(input: Record<string, unknown>, ctx: ToolContext): Promise<Block[] | string> {
  const style = String(input.style ?? '').trim()
  if (!style) throw new Error('style is required: say what the picture should look like.')
  const number = input.photo === undefined ? undefined : Number(input.photo)
  const photo = number === undefined ? undefined : ctx.photos[number - 1]
  if (number !== undefined && !photo) return `There is no photo ${input.photo}. ${ctx.photos.length} photo(s) have been attached.`
  if (ctx.renders >= MAX_RENDERS_PER_MESSAGE) return `Already made ${MAX_RENDERS_PER_MESSAGE} photoreal renders for this message. Each one costs money. Ask the user whether they want another.`
  ctx.renders++
  // A larger picture than the usual screenshot, since fal works from it.
  const scene = await ctx.viewport.screenshot(1024)
  const result = await renderPhotoreal(photo ? [scene, photo] : [scene], style, ctx.password)
  const media = /^data:(image\/[a-z]+);/.exec(result)?.[1] ?? 'image/jpeg'
  return [
    { type: 'text', text: RENDER_CAPTION },
    { type: 'image', source: { type: 'base64', media_type: media, data: result.split(',')[1] ?? '' } },
  ]
}

async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<Pick<Block & { type: 'tool_result' }, 'content' | 'is_error'>> {
  try {
    if (name === 'render_viewport') {
      const result = await ctx.viewport.render(String(input.code ?? ''))
      return result === 'ok' ? { content: 'ok' } : { content: result, is_error: true }
    }
    if (name === 'screenshot_viewport') {
      const dataUrl = await ctx.viewport.screenshot()
      return { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' } }] }
    }
    if (name === 'convert_length') {
      const lengths = Array.isArray(input.lengths) ? input.lengths : []
      return { content: lengths.map((l) => describeLength(String(l))).join('\n') || 'No lengths were given.' }
    }
    if (name === 'render_photoreal') return { content: await renderPhotorealTool(input, ctx) }
    if (name === 'measure_scene') return { content: describeScene(await ctx.viewport.measure()) }
    if (name === 'model_from_photo') return { content: await modelFromPhotoTool(input, ctx) }
    return { content: `Unknown tool: ${name}`, is_error: true }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), is_error: true }
  }
}

export interface TurnResult {
  /** The whole conversation so far, including this turn. */
  messages: Message[]
  /** The model was still calling tools when MAX_STEPS ran out. */
  stoppedEarly: boolean
}

/**
 * Adds the user's message (text, or text and photos) to the conversation and runs it until the model answers without asking for a tool.
 * `onProgress` is given the conversation after each step. Throws AgentError if the route fails,
 * leaving the caller's own copy of the conversation as it was.
 */
export async function sendMessage(
  history: Message[],
  content: string | Block[],
  ctx: ToolContext,
  onProgress: (messages: Message[]) => void = () => {},
): Promise<TurnResult> {
  ctx.renders = 0
  let messages: Message[] = [...history, { role: 'user', content }]
  onProgress(messages)
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await fetch('agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ctx.password && { 'X-App-Password': ctx.password }) },
      body: JSON.stringify({ messages: withLatestScreenshotOnly(messages) }),
    })
    const body = await response.json().catch(() => undefined) // not JSON, as from a static host's 404 page
    if (!response.ok) {
      const reason = body?.error ?? body?.error?.message
      throw new AgentError(response.status, typeof reason === 'string' ? reason.replace(/\.$/, '') : undefined)
    }
    const content: Block[] = body.content ?? []
    messages = [...messages, { role: 'assistant', content }]
    onProgress(messages)
    const calls = content.filter((b): b is Block & { type: 'tool_use' } => b.type === 'tool_use')
    if (body.stop_reason !== 'tool_use' || calls.length === 0) return { messages, stoppedEarly: false }

    const results: Block[] = []
    for (const call of calls) results.push({ type: 'tool_result', tool_use_id: call.id, ...(await runTool(call.name, call.input, ctx)) })
    messages = [...messages, { role: 'user', content: results }]
    onProgress(messages)
  }
  return { messages, stoppedEarly: true }
}
