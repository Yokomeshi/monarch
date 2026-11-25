import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest, promptFor, renderRequest, MODEL } from './render'

const img = 'data:image/jpeg;base64,AAAA'
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://monarch.example/render', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })

afterEach(() => vi.unstubAllGlobals())

describe('renderRequest', () => {
  it('runs the fixed model with the layout rules, whatever the browser asks for', async () => {
    const upstream = vi.fn(async () => new Response('{"images":[{"url":"https://fal.media/x.jpg"}]}'))
    vi.stubGlobal('fetch', upstream)
    const response = await renderRequest(post({ prompt: 'oak floor', images: [img], model: 'other', num_images: 9, resolution: '4K' }), 'fal-key')
    expect(response.status).toBe(200)
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://fal.run/${MODEL}`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Key fal-key')
    const sent = JSON.parse(init.body as string)
    expect(sent).toMatchObject({ image_urls: [img], num_images: 1, output_format: 'jpeg' })
    expect(sent.resolution).toBeUndefined() // a larger size would cost more
    expect(sent.prompt).toContain('Do not add, remove or move any furniture')
    expect(sent.prompt).toContain('Style: oak floor')
  })

  it('mentions the second image only when there is one', () => {
    expect(promptFor('x', false)).not.toContain('second image')
    expect(promptFor('x', true)).toContain('The second image is a photo')
  })

  it('refuses a missing or oversized prompt, and anything but one or two images', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const bad = [
      'not json',
      { images: [img] },
      { prompt: '  ', images: [img] },
      { prompt: 'x'.repeat(1001), images: [img] },
      { prompt: 'x' },
      { prompt: 'x', images: [] },
      { prompt: 'x', images: [img, img, img] },
      { prompt: 'x', images: ['https://evil.example/a.png'] },
    ]
    for (const body of bad) expect((await renderRequest(post(body), 'k')).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses other methods and oversized bodies', async () => {
    expect((await renderRequest(new Request('https://monarch.example/render'), 'k')).status).toBe(405)
    expect((await renderRequest(post({ prompt: 'x', images: [img] }, { 'Content-Length': String(7 * 1024 * 1024) }), 'k')).status).toBe(413)
  })

  it('keeps the key out of network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('bad header fal-secret') }))
    const response = await renderRequest(post({ prompt: 'x', images: [img] }), 'fal-secret')
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('fal-secret')
  })
})

describe('onRequest', () => {
  const env = { FAL_KEY: 'fal-key', APP_PASSWORD: 'open sesame' }
  const ok = { prompt: 'x', images: [img] }

  it('wants the password, and works with it', async () => {
    const upstream = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', upstream)
    expect((await onRequest({ request: post(ok), env })).status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    expect((await onRequest({ request: post(ok, { 'X-App-Password': 'open sesame' }), env })).status).toBe(200)
  })

  it('is closed until both secrets are set', async () => {
    expect((await onRequest({ request: post(ok), env: { FAL_KEY: 'k' } })).status).toBe(500)
    expect((await onRequest({ request: post(ok), env: { APP_PASSWORD: 'p' } })).status).toBe(500)
  })
})
