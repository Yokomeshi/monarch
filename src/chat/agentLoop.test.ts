import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentError, sendMessage, withLatestScreenshotOnly, type Block, type Message } from './agentLoop'
import type { Viewport } from './viewport'

const reply = (content: Block[], stop_reason: string) => new Response(JSON.stringify({ content, stop_reason }))
const toolUse = (id: string, name: string, input = {}): Block => ({ type: 'tool_use', id, name, input })
const viewport = (over: Partial<Viewport> = {}): Viewport => ({
  render: vi.fn(async () => 'ok'),
  screenshot: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
  ...over,
})

afterEach(() => vi.unstubAllGlobals())

describe('sendMessage', () => {
  it('runs the tools the model asks for and sends their results back until it answers', async () => {
    const calls = [
      reply([toolUse('a', 'render_viewport', { code: 'scene.add(new THREE.Mesh())' })], 'tool_use'),
      reply([toolUse('b', 'screenshot_viewport')], 'tool_use'),
      reply([{ type: 'text', text: 'Here is your room.' }], 'end_turn'),
    ]
    const upstream = vi.fn(async () => calls.shift()!)
    vi.stubGlobal('fetch', upstream)
    const v = viewport()
    const { messages, stoppedEarly } = await sendMessage([], 'a 4 x 5 m room', v, '')
    expect(stoppedEarly).toBe(false)
    expect(v.render).toHaveBeenCalledWith('scene.add(new THREE.Mesh())')
    expect(v.screenshot).toHaveBeenCalledTimes(1)
    expect(upstream).toHaveBeenCalledTimes(3)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
    const shot = (messages[4].content as Block[])[0]
    expect(shot).toMatchObject({ type: 'tool_result', tool_use_id: 'b', content: [{ type: 'image', source: { data: 'AAAA' } }] })
  })

  it('returns a failing render to the model as an error it can fix', async () => {
    const calls = [reply([toolUse('a', 'render_viewport', { code: 'oops(' })], 'tool_use'), reply([{ type: 'text', text: 'fixed' }], 'end_turn')]
    vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    const { messages } = await sendMessage([], 'x', viewport({ render: async () => 'Error: SyntaxError' }), '')
    expect((messages[2].content as Block[])[0]).toMatchObject({ tool_use_id: 'a', content: 'Error: SyntaxError', is_error: true })
  })

  it('reports a viewport that does not answer, and a tool it does not know, to the model', async () => {
    const calls = [reply([toolUse('a', 'screenshot_viewport'), toolUse('b', 'launch_missiles')], 'tool_use'), reply([], 'end_turn')]
    vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    const { messages } = await sendMessage([], 'x', viewport({ screenshot: async () => { throw new Error('no answer') } }), '')
    expect(messages[2].content).toMatchObject([
      { tool_use_id: 'a', content: 'no answer', is_error: true },
      { tool_use_id: 'b', is_error: true },
    ])
  })

  it('converts lengths exactly for the model, and says which it could not read', async () => {
    const calls = [reply([toolUse('a', 'convert_length', { lengths: ['195 cm', 'big'] })], 'tool_use'), reply([], 'end_turn')]
    vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    const { messages } = await sendMessage([], 'x', viewport(), '')
    expect((messages[2].content as Block[])[0]).toMatchObject({
      tool_use_id: 'a',
      content: '195 cm = 1.95 m = 6 ft 4.8 in\nbig = could not read this as a length',
    })
  })

  it('stops a model that never stops calling tools', async () => {
    const upstream = vi.fn(async () => reply([toolUse('a', 'render_viewport', { code: '' })], 'tool_use'))
    vi.stubGlobal('fetch', upstream)
    expect((await sendMessage([], 'x', viewport(), '')).stoppedEarly).toBe(true)
    expect(upstream).toHaveBeenCalledTimes(8)
  })

  it('sends the password, and throws with the route\'s reason when refused', async () => {
    const upstream = vi.fn(async () => new Response('{"error":"Wrong or missing password."}', { status: 401 }))
    vi.stubGlobal('fetch', upstream)
    const error = await sendMessage([], 'x', viewport(), 'pw').catch((e) => e)
    expect(error).toBeInstanceOf(AgentError)
    expect(error).toMatchObject({ status: 401, message: 'Request failed (401): Wrong or missing password' })
    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['X-App-Password']).toBe('pw')
  })

  it('leaves the caller\'s history untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ type: 'text', text: 'hi' }], 'end_turn')))
    const history: Message[] = [{ role: 'user', content: 'before' }, { role: 'assistant', content: 'ok' }]
    await sendMessage(history, 'now', viewport(), '')
    expect(history).toHaveLength(2)
  })
})

describe('withLatestScreenshotOnly', () => {
  const shot = (id: string): Message => ({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: id } }] }],
  })

  it('keeps the newest screenshot and replaces the older ones', () => {
    const out = withLatestScreenshotOnly([shot('old'), { role: 'assistant', content: 'x' }, shot('new')])
    expect(JSON.stringify(out[0])).toContain('an earlier screenshot')
    expect(JSON.stringify(out[0])).not.toContain('"data"')
    expect(out[2]).toEqual(shot('new'))
  })
})
