import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const assets = { fetch: vi.fn(async () => new Response('the site')) }
const env = { TYPESAFE_API_KEY: 'key', APP_PASSWORD: 'open sesame', ASSETS: assets }

afterEach(() => {
  vi.unstubAllGlobals()
  assets.fetch.mockClear()
})

describe('the hosted worker', () => {
  it('sends /fal to the fal route, which asks for the password', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(new Request('https://monarch.example/fal?url=x'), { ...env, FAL_KEY: 'key' })
    expect(response.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    expect(assets.fetch).not.toHaveBeenCalled()
  })

  it('forwards a POST to /jev to Jev when the password is right', async () => {
    const upstream = vi.fn(async () => new Response('{"answers":{}}'))
    vi.stubGlobal('fetch', upstream)
    const request = new Request('https://monarch.example/jev', {
      method: 'POST',
      headers: { 'X-App-Password': 'open sesame' },
      body: '{}',
    })
    const response = await worker.fetch(request, env)
    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(assets.fetch).not.toHaveBeenCalled()
  })

  it('refuses a POST to /jev without the password', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(new Request('https://monarch.example/jev', { method: 'POST', body: '{}' }), env)
    expect(response.status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers other methods on /jev with 405', async () => {
    const response = await worker.fetch(new Request('https://monarch.example/jev'), env)
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    expect(assets.fetch).not.toHaveBeenCalled()
  })

  it('leaves every other address to the built site', async () => {
    const response = await worker.fetch(new Request('https://monarch.example/somewhere'), env)
    expect(await response.text()).toBe('the site')
    expect(assets.fetch).toHaveBeenCalledTimes(1)
  })
})
