import { afterEach, describe, expect, it, vi } from 'vitest'
import { FalError } from './falClient'
import { renderPhotoreal } from './renderClient'

afterEach(() => vi.unstubAllGlobals())

describe('renderPhotoreal', () => {
  it('posts the images and style with the password, then downloads the picture as a data URL', async () => {
    const upstream = vi.fn(async (url: string) =>
      url === 'render' ? new Response('{"images":[{"url":"https://fal.media/out.jpg"}]}') : new Response(new Blob(['pixels'], { type: 'image/jpeg' })),
    )
    vi.stubGlobal('fetch', upstream)
    const result = await renderPhotoreal(['data:image/jpeg;base64,AAAA'], 'oak floor', 'pw')
    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true)
    const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'oak floor', images: ['data:image/jpeg;base64,AAAA'] })
    expect((init.headers as Record<string, string>)['X-App-Password']).toBe('pw')
    expect(upstream).toHaveBeenCalledWith('https://fal.media/out.jpg')
  })

  it("throws with the route's reason when refused", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Wrong or missing password."}', { status: 401 })))
    const error = await renderPhotoreal(['x'], 'y', '').catch((e) => e)
    expect(error).toBeInstanceOf(FalError)
    expect(error).toMatchObject({ status: 401, message: 'fal request failed (401): Wrong or missing password' })
  })

  it('says so when fal returns no picture', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"images":[]}')))
    await expect(renderPhotoreal(['x'], 'y', '')).rejects.toThrow('no picture')
  })
})
