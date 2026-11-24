import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentError, createToolContext, sendMessage, withLatestScreenshotOnly, type Block, type Message } from './agentLoop'
import type { Viewport } from './viewport'

const reply = (content: Block[], stop_reason: string) => new Response(JSON.stringify({ content, stop_reason }))
const toolUse = (id: string, name: string, input = {}): Block => ({ type: 'tool_use', id, name, input })
const viewport = (over: Partial<Viewport> = {}): Viewport => ({
  render: vi.fn(async () => 'ok'),
  screenshot: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
  addModel: vi.fn(async () => [0.6, 0.85, 0.5] as [number, number, number]),
  ...over,
})

vi.mock('../ai/falClient', () => ({ modelFromPhoto: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])) }))
import { modelFromPhoto } from '../ai/falClient'

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
    const { messages, stoppedEarly } = await sendMessage([], 'a 4 x 5 m room', createToolContext(v, ''))
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
    const { messages } = await sendMessage([], 'x', createToolContext(viewport({ render: async () => 'Error: SyntaxError' }), ''))
    expect((messages[2].content as Block[])[0]).toMatchObject({ tool_use_id: 'a', content: 'Error: SyntaxError', is_error: true })
  })

  it('reports a viewport that does not answer, and a tool it does not know, to the model', async () => {
    const calls = [reply([toolUse('a', 'screenshot_viewport'), toolUse('b', 'launch_missiles')], 'tool_use'), reply([], 'end_turn')]
    vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    const { messages } = await sendMessage([], 'x', createToolContext(viewport({ screenshot: async () => { throw new Error('no answer') } }), ''))
    expect(messages[2].content).toMatchObject([
      { tool_use_id: 'a', content: 'no answer', is_error: true },
      { tool_use_id: 'b', is_error: true },
    ])
  })

  it('converts lengths exactly for the model, and says which it could not read', async () => {
    const calls = [reply([toolUse('a', 'convert_length', { lengths: ['195 cm', 'big'] })], 'tool_use'), reply([], 'end_turn')]
    vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    const { messages } = await sendMessage([], 'x', createToolContext(viewport(), ''))
    expect((messages[2].content as Block[])[0]).toMatchObject({
      tool_use_id: 'a',
      content: '195 cm = 1.95 m = 6 ft 4.8 in\nbig = could not read this as a length',
    })
  })

  describe('model_from_photo', () => {
    const ask = (...inputs: Record<string, unknown>[]) => {
      const calls = [...inputs.map((input, i) => reply([toolUse(`t${i}`, 'model_from_photo', input)], 'tool_use')), reply([], 'end_turn')]
      vi.stubGlobal('fetch', vi.fn(async () => calls.shift()!))
    }
    const resultOf = (messages: Message[], i: number) => (messages[i].content as Block[])[0] as Block & { type: 'tool_result' }

    it('sends the photo to fal, gives the model to the viewport, and tells the model its size', async () => {
      vi.mocked(modelFromPhoto).mockClear()
      ask({ photo: 1, name: 'sofa' })
      const v = viewport()
      const ctx = createToolContext(v, 'pw')
      ctx.photos.push('data:image/jpeg;base64,PHOTO')
      const { messages } = await sendMessage([], 'x', ctx)
      expect(modelFromPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,PHOTO', 'pw')
      expect(v.addModel).toHaveBeenCalledWith('sofa', expect.any(ArrayBuffer))
      expect(resultOf(messages, 2).content).toContain('0.6 m wide (x), 0.5 m deep (z), 0.85 m tall (y)')
      expect(resultOf(messages, 2).content).toContain('models.sofa.clone()')
    })

    it('never sends the same photo to fal twice, since every run is billed', async () => {
      vi.mocked(modelFromPhoto).mockClear()
      ask({ photo: 1, name: 'sofa' }, { photo: 1, name: 'couch' })
      const ctx = createToolContext(viewport())
      ctx.photos.push('data:image/jpeg;base64,PHOTO')
      const { messages } = await sendMessage([], 'x', ctx)
      expect(modelFromPhoto).toHaveBeenCalledTimes(1)
      expect(resultOf(messages, 4).content).toContain('already has a model')
    })

    it('refuses a photo that was never attached, or a name scene code cannot use, without calling fal', async () => {
      vi.mocked(modelFromPhoto).mockClear()
      ask({ photo: 2, name: 'sofa' }, { photo: 1, name: 'Big Sofa' })
      const ctx = createToolContext(viewport())
      ctx.photos.push('data:image/jpeg;base64,PHOTO')
      const { messages } = await sendMessage([], 'x', ctx)
      expect(resultOf(messages, 2)).toMatchObject({ content: expect.stringContaining('There is no photo 2') })
      expect(resultOf(messages, 4)).toMatchObject({ is_error: true, content: expect.stringContaining('lowercase') })
      expect(modelFromPhoto).not.toHaveBeenCalled()
    })

    it('tells the model when fal fails, and lets it try again', async () => {
      vi.mocked(modelFromPhoto).mockRejectedValueOnce(new Error('fal request failed (402)'))
      ask({ photo: 1, name: 'sofa' })
      const ctx = createToolContext(viewport())
      ctx.photos.push('data:image/jpeg;base64,PHOTO')
      const { messages } = await sendMessage([], 'x', ctx)
      expect(resultOf(messages, 2)).toMatchObject({ is_error: true, content: 'fal request failed (402)' })
      expect(ctx.made.size).toBe(0)
    })
  })

  it('stops a model that never stops calling tools', async () => {
    const upstream = vi.fn(async () => reply([toolUse('a', 'render_viewport', { code: '' })], 'tool_use'))
    vi.stubGlobal('fetch', upstream)
    expect((await sendMessage([], 'x', createToolContext(viewport(), ''))).stoppedEarly).toBe(true)
    expect(upstream).toHaveBeenCalledTimes(8)
  })

  it('sends the password, and throws with the route\'s reason when refused', async () => {
    const upstream = vi.fn(async () => new Response('{"error":"Wrong or missing password."}', { status: 401 }))
    vi.stubGlobal('fetch', upstream)
    const error = await sendMessage([], 'x', createToolContext(viewport(), 'pw')).catch((e) => e)
    expect(error).toBeInstanceOf(AgentError)
    expect(error).toMatchObject({ status: 401, message: 'Request failed (401): Wrong or missing password' })
    const init = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['X-App-Password']).toBe('pw')
  })

  it('leaves the caller\'s history untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([{ type: 'text', text: 'hi' }], 'end_turn')))
    const history: Message[] = [{ role: 'user', content: 'before' }, { role: 'assistant', content: 'ok' }]
    await sendMessage(history, 'now', createToolContext(viewport(), ''))
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
