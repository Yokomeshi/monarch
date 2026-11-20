import { afterEach, describe, expect, it, vi } from 'vitest'
import { FalError, modelFromPhoto } from './falClient'

const STATUS = 'https://queue.fal.run/tripo3d/h3.1/requests/abc/status'
const RESULT = 'https://queue.fal.run/tripo3d/h3.1/requests/abc'
const MESH = 'https://v3b.fal.media/files/model.glb'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** A stand-in for the app's server and fal's file host. `statuses` are given out one per status check. */
function serve(statuses: string[], result: unknown = { model_mesh: { url: MESH } }) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url === 'fal') return json({ request_id: 'abc', status_url: STATUS, response_url: RESULT })
    if (url === `fal?url=${encodeURIComponent(STATUS)}`) return json({ status: statuses.shift() })
    if (url === `fal?url=${encodeURIComponent(RESULT)}`) return json(result)
    if (url === MESH) return new Response('glb bytes')
    return new Response('Not found', { status: 404 })
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('modelFromPhoto', () => {
  it('queues the photo once, waits until the job is done, and downloads the model', async () => {
    const calls = serve(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'])
    const glb = await modelFromPhoto('data:image/jpeg;base64,AAAA', 'open sesame', 0)
    expect(await glb.text()).toBe('glb bytes')
    const posts = calls.filter((c) => c.init?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0].init!.body as string)).toEqual({ image: 'data:image/jpeg;base64,AAAA' })
    expect(calls.filter((c) => c.url.includes(encodeURIComponent(STATUS)))).toHaveLength(3)
    // The password goes to the app's own server and not to fal's file host.
    expect((posts[0].init!.headers as Record<string, string>)['X-App-Password']).toBe('open sesame')
    expect(calls.find((c) => c.url === MESH)!.init).toBeUndefined()
  })

  it('reports a wrong password as a 401', async () => {
    vi.stubGlobal('fetch', async () => json({ error: 'Wrong or missing password.' }, 401))
    const error = await modelFromPhoto('data:image/jpeg;base64,AAAA', '', 0).catch((e) => e)
    expect(error).toBeInstanceOf(FalError)
    expect(error.status).toBe(401)
    expect(error.message).toBe('fal request failed (401): Wrong or missing password')
  })

  it("gives fal's own reason when the job is refused", async () => {
    vi.stubGlobal('fetch', async () => json({ detail: 'User is locked. Reason: Exhausted balance.' }, 403))
    await expect(modelFromPhoto('data:image/jpeg;base64,AAAA', '', 0)).rejects.toThrow('Exhausted balance')
  })

  it('reports a static host, which has no such route', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Not found</html>', { status: 404 }))
    await expect(modelFromPhoto('data:image/jpeg;base64,AAAA', '', 0)).rejects.toThrow('fal request failed (404)')
  })

  it('fails when the finished job has no model', async () => {
    serve(['COMPLETED'], { model_urls: {} })
    await expect(modelFromPhoto('data:image/jpeg;base64,AAAA', '', 0)).rejects.toThrow('no model')
  })
})
