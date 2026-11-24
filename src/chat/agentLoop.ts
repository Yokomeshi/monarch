// One user message in, a finished reply out. The model is called through the app's own /agent route
// (worker/agent.ts), which holds the key. The tools it asks for act on the viewport, which is in this
// browser, so the loop runs here: ask the model, run its tools, send back what they returned, repeat.

import { describeLength } from './units'
import type { Viewport } from './viewport'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | Block[]; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }

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

async function runTool(name: string, input: Record<string, unknown>, viewport: Viewport): Promise<Pick<Block & { type: 'tool_result' }, 'content' | 'is_error'>> {
  try {
    if (name === 'render_viewport') {
      const result = await viewport.render(String(input.code ?? ''))
      return result === 'ok' ? { content: 'ok' } : { content: result, is_error: true }
    }
    if (name === 'screenshot_viewport') {
      const dataUrl = await viewport.screenshot()
      return { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' } }] }
    }
    if (name === 'convert_length') {
      const lengths = Array.isArray(input.lengths) ? input.lengths : []
      return { content: lengths.map((l) => describeLength(String(l))).join('\n') || 'No lengths were given.' }
    }
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
 * Adds `text` to the conversation and runs it until the model answers without asking for a tool.
 * `onProgress` is given the conversation after each step. Throws AgentError if the route fails,
 * leaving the caller's own copy of the conversation as it was.
 */
export async function sendMessage(
  history: Message[],
  text: string,
  viewport: Viewport,
  password: string,
  onProgress: (messages: Message[]) => void = () => {},
): Promise<TurnResult> {
  let messages: Message[] = [...history, { role: 'user', content: text }]
  onProgress(messages)
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await fetch('agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(password && { 'X-App-Password': password }) },
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
    for (const call of calls) results.push({ type: 'tool_result', tool_use_id: call.id, ...(await runTool(call.name, call.input, viewport)) })
    messages = [...messages, { role: 'user', content: results }]
    onProgress(messages)
  }
  return { messages, stoppedEarly: true }
}
