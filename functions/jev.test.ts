import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from './jev'

const env = { TYPESAFE_API_KEY: 'secret-key', APP_PASSWORD: 'open-sesame' }
const body = JSON.stringify({ model: 'jev', input: 'a gap in a wall' })
const LIMIT = 2 * 1024 * 1024

function request(headers: Record<string, string> = {}, text = body): Request {
  return new Request('https://monarch.example/jev', { method: 'POST', headers, body: text })
}

const upstream = vi.fn<typeof fetch>()

beforeEach(() => {
  upstream.mockReset()
  upstream.mockImplementation(async () => new Response('{"answer":"door"}', { status: 200 }))
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function expectError(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get('Content-Type')).toBe('application/json')
  expect(typeof (await response.json()).error).toBe('string')
}

describe('onRequestPost', () => {
  it.each([
    ['the key is missing', { APP_PASSWORD: 'open-sesame' }],
    ['the key is empty', { TYPESAFE_API_KEY: '', APP_PASSWORD: 'open-sesame' }],
    ['the password is missing', { TYPESAFE_API_KEY: 'secret-key' }],
    ['the password is empty', { TYPESAFE_API_KEY: 'secret-key', APP_PASSWORD: '' }],
  ])('answers 500 without calling Jev when %s', async (_name, partial) => {
    // An empty configured password must not be matched by an empty header.
    const response = await onRequestPost({ request: request({ 'X-App-Password': '' }), env: partial })
    await expectError(response, 500)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['wrong, of the same length', 'open-sesamf'],
    ['a prefix of the right one', 'open-sesam'],
    ['the right one with more after it', 'open-sesame!'],
  ])('answers 401 without calling Jev when the password is %s', async (_name, password) => {
    const headers = password === undefined ? undefined : { 'X-App-Password': password }
    await expectError(await onRequestPost({ request: request(headers), env }), 401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('forwards the body unchanged with the key and nothing else from the caller', async () => {
    await onRequestPost({
      request: request({
        'X-App-Password': 'open-sesame',
        'TypeSafe-Danger-Zone-Images': 'true',
        'Content-Type': 'text/plain',
        Cookie: 'session=1',
        Origin: 'https://monarch.example',
        'X-Other': 'x',
      }),
      env,
    })
    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init?.method).toBe('POST')
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(body)
    expect([...new Headers(init?.headers)].sort()).toEqual([
      ['authorization', 'Bearer secret-key'],
      ['content-type', 'application/json'],
      ['typesafe-danger-zone-images', 'true'],
    ])
  })

  it('leaves out the images header when the caller did not send it', async () => {
    await onRequestPost({ request: request({ 'X-App-Password': 'open-sesame' }), env })
    const sent = new Headers(upstream.mock.calls[0][1]?.headers)
    expect(sent.has('TypeSafe-Danger-Zone-Images')).toBe(false)
    expect(sent.has('X-App-Password')).toBe(false)
    expect(sent.has('Cookie')).toBe(false)
    expect(sent.has('Origin')).toBe(false)
  })

  it.each([
    [200, '{"answer":"door"}'],
    [400, '{"error":"bad request"}'],
  ])('returns the %i status and body from Jev, without its headers', async (status, text) => {
    upstream.mockImplementation(
      async () => new Response(text, { status, headers: { 'Content-Type': 'text/plain', 'X-Upstream': 'x' } }),
    )
    const response = await onRequestPost({ request: request({ 'X-App-Password': 'open-sesame' }), env })
    expect(response.status).toBe(status)
    expect(await response.text()).toBe(text)
    expect([...response.headers]).toEqual([['content-type', 'application/json']])
  })

  it('answers 413 without calling Jev when Content-Length is over 2 MB', async () => {
    const headers = { 'X-App-Password': 'open-sesame', 'Content-Length': String(LIMIT + 1) }
    await expectError(await onRequestPost({ request: request(headers), env }), 413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers 413 without calling Jev when the body itself is over 2 MB', async () => {
    const big = request({ 'X-App-Password': 'open-sesame' }, 'x'.repeat(LIMIT + 1))
    expect(big.headers.has('Content-Length')).toBe(false)
    await expectError(await onRequestPost({ request: big, env }), 413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('accepts a body of exactly 2 MB', async () => {
    const full = request({ 'X-App-Password': 'open-sesame' }, 'x'.repeat(LIMIT))
    expect((await onRequestPost({ request: full, env })).status).toBe(200)
  })

  it('answers 502 when Jev cannot be reached', async () => {
    upstream.mockRejectedValue(new TypeError('fetch failed'))
    const response = await onRequestPost({ request: request({ 'X-App-Password': 'open-sesame' }), env })
    await expectError(response, 502)
  })
})
