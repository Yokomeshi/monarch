import { IMAGE_HEADER } from './jevOpenings'

/** The service's answer was a refusal. 401 means the hosted app wants its access password. */
export class JevError extends Error {
  /** `reason` is what the server said went wrong, if it said. */
  constructor(
    public status: number,
    reason?: string,
  ) {
    super(`Jev request failed (${status})${reason ? `: ${reason}` : ''}`)
  }
}

/** The explanation in an error reply: the hosted worker sends `{ "error": "..." }`, Jev `{ "error": { "message": "..." } }`. */
async function reason(response: Response): Promise<string | undefined> {
  try {
    const { error } = await response.json()
    const text = typeof error === 'string' ? error : error?.message
    return typeof text === 'string' ? text.replace(/\.$/, '') : undefined
  } catch {
    return undefined // not JSON, as from a static host's 404 page
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
  if (!response.ok) throw new JevError(response.status, await reason(response))
  return response.json()
}
