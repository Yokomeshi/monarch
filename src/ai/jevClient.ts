import { IMAGE_HEADER } from './jevOpenings'

/**
 * Send a request to Jev through the app's own server (see vite.config.ts), which holds the key.
 * Throws if there is no such route, as on a static host, or the service refuses.
 */
export async function askJev(body: unknown): Promise<unknown> {
  const response = await fetch('jev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...IMAGE_HEADER },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Jev request failed (${response.status})`)
  return response.json()
}
