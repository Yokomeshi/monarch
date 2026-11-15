import { IMAGE_HEADER } from './jevOpenings'

/** The service's answer was a refusal. 401 means the hosted app wants its access password. */
export class JevError extends Error {
  constructor(public status: number) {
    super(`Jev request failed (${status})`)
  }
}

/**
 * Send a request to Jev through the app's own server, which holds the key: the dev server
 * (see vite.config.ts) or the hosted worker (worker/jev.ts), which also asks for the
 * access password. Throws if there is no such route, as on a static host, or the service refuses.
 */
export async function askJev(body: unknown, password: string): Promise<unknown> {
  const response = await fetch('jev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...IMAGE_HEADER, ...(password && { 'X-App-Password': password }) },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new JevError(response.status)
  return response.json()
}
