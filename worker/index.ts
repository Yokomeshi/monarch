// The hosted app as a Cloudflare Worker (see wrangler.jsonc): the built site is served as
// static assets, and this script answers the two addresses that need a server, /jev and /fal.

import { onRequest as onFalRequest } from './fal'
import { onRequestPost } from './jev'

interface Env {
  TYPESAFE_API_KEY?: string
  FAL_KEY?: string
  APP_PASSWORD?: string
  /** The built site in dist/, bound by wrangler.jsonc. */
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  // Cloudflare serves a request that matches a file in dist/ by itself; anything else comes here.
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/fal') return onFalRequest({ request, env })
    if (pathname !== '/jev') return env.ASSETS.fetch(request)
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } })
    return onRequestPost({ request, env })
  },
}
