import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL, falRequest, onRequest } from './fal'

const env = { FAL_KEY: 'secret-key', APP_PASSWORD: 'open-sesame' }
const photo = 'data:image/jpeg;base64,AAAA'
const STATUS = 'https://queue.fal.run/tripo3d/h3.1/requests/abc/status'

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://monarch.example/fal', { method: 'POST', headers, body })
const get = (url: string, headers: Record<string, string> = {}) =>
  new Request(`https://monarch.example/fal?url=${encodeURIComponent(url)}`, { headers })

const upstream = vi.fn<typeof fetch>()

beforeEach(() => {
  upstream.mockReset()
  upstream.mockImplementation(async () => new Response('{"status":"IN_QUEUE"}', { status: 200 }))
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('falRequest', () => {
  it('queues the fixed model with the photo and the key', async () => {
    const response = await falRequest(post(JSON.stringify({ image: photo, model: 'something/expensive' })), 'secret-key')
    expect(response.status).toBe(200)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe(`https://queue.fal.run/${MODEL}`)
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Key secret-key')
    // Nothing the caller sent besides the photo is passed on.
    expect(JSON.parse(init?.body as string)).toEqual({ image_url: photo, auto_size: true, face_limit: 50_000 })
  })

  it.each([
    ['is not JSON', 'hello'],
    ['has no photo', '{}'],
    ['has a web address for a photo', '{"image":"https://example.com/a.jpg"}'],
  ])('answers 400 without calling fal when the body %s', async (_name, body) => {
    expect((await falRequest(post(body), 'k')).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers 413 to a body over the limit', async () => {
    const big = JSON.stringify({ image: photo + 'A'.repeat(2 * 1024 * 1024) })
    expect((await falRequest(post(big), 'k')).status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('reads a job on the queue with the key', async () => {
    const response = await falRequest(get(STATUS), 'secret-key')
    expect(await response.json()).toEqual({ status: 'IN_QUEUE' })
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe(STATUS)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Key secret-key')
  })

  it.each([
    'https://evil.example/tripo3d/h3.1/requests/abc/status',
    'https://queue.fal.run.evil.example/tripo3d/requests/abc',
    'https://queue.fal.run/fal-ai/other-model/requests/abc/status',
    'https://queue.fal.run/tripo3d/h3.1/image-to-3d',
    '',
  ])('does not send the key to %s', async (url) => {
    expect((await falRequest(get(url), 'k')).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("says so when fal refuses the server's key, rather than asking for the password", async () => {
    upstream.mockImplementation(async () => new Response('{"detail":"no"}', { status: 401 }))
    const response = await falRequest(get(STATUS), 'k')
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/key/)
  })

  it("passes on fal's own refusals, such as an empty balance", async () => {
    upstream.mockImplementation(async () => new Response('{"detail":"Exhausted balance"}', { status: 403 }))
    const response = await falRequest(get(STATUS), 'k')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'Exhausted balance' })
  })

  it('answers 502 when fal cannot be reached', async () => {
    upstream.mockRejectedValue(new Error('offline'))
    expect((await falRequest(get(STATUS), 'k')).status).toBe(502)
  })
})

describe('onRequest', () => {
  it.each([
    ['the key is missing', { APP_PASSWORD: 'open-sesame' }],
    ['the password is missing', { FAL_KEY: 'secret-key' }],
    ['the password is empty', { FAL_KEY: 'secret-key', APP_PASSWORD: '' }],
  ])('answers 500 without calling fal when %s', async (_name, partial) => {
    const response = await onRequest({ request: get(STATUS, { 'X-App-Password': '' }), env: partial })
    expect(response.status).toBe(500)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers 401 without calling fal when the password is wrong or missing', async () => {
    expect((await onRequest({ request: get(STATUS, { 'X-App-Password': 'guess' }), env })).status).toBe(401)
    expect((await onRequest({ request: post(JSON.stringify({ image: photo })), env })).status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('lets a caller with the password through, without passing the password on', async () => {
    const response = await onRequest({ request: get(STATUS, { 'X-App-Password': 'open-sesame' }), env })
    expect(response.status).toBe(200)
    expect(JSON.stringify(upstream.mock.calls[0][1])).not.toContain('open-sesame')
  })
})
