/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Connect, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { agentRequest } from './worker/agent.ts'
import { falRequest } from './worker/fal.ts'

/**
 * Runs one of the hosted app's routes (/fal or /agent, from worker/) on the dev and preview servers,
 * with the key from .env.local. There is no password here: the server is on your own machine.
 */
function keyedRoute(path: string, key: string, run: (request: Request, key: string) => Promise<Response>, missing: string): Plugin {
  const handle: Connect.NextHandleFunction = async (incoming, res, next) => {
    // The project has no Node type definitions, so the parts of the request used here are spelled out.
    const req = incoming as unknown as { url?: string; method?: string } & AsyncIterable<Uint8Array>
    if (!req.url?.startsWith(path)) return next()
    const chunks: Uint8Array[] = []
    for await (const chunk of req) chunks.push(chunk)
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: { 'Content-Length': String(chunks.reduce((n, c) => n + c.length, 0)) },
      ...(req.method === 'POST' && { body: new Blob(chunks as BlobPart[]) }),
    })
    const response = key ? await run(request, key) : new Response(JSON.stringify({ error: missing }), { status: 500 })
    res.statusCode = response.status
    res.setHeader('Content-Type', 'application/json')
    res.end(await response.text())
  }
  return {
    name: `route-${path.slice(1)}`,
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  }
}

export default defineConfig(({ mode }) => {
  // TypeSafe's Jev API refuses calls made from a browser, so the dev and preview servers
  // forward them, adding the key from TYPESAFE_API_KEY (in .env.local, which is not committed).
  // The key never reaches the browser. A static host such as GitHub Pages has no such route.
  const env = loadEnv(mode, '.', '')
  const key = env.TYPESAFE_API_KEY ?? ''
  const jev: Record<string, ProxyOptions> = {
    '/jev': {
      target: 'https://api.typesafe.ai',
      changeOrigin: true,
      rewrite: () => '/v1/systemone',
      headers: { Authorization: `Bearer ${key}` },
    },
  }
  return {
    // Relative asset paths, so the build works from any folder (e.g. GitHub Pages).
    base: './',
    plugins: [
      react(),
      keyedRoute('/fal', env.FAL_KEY ?? '', falRequest, 'The server is not configured for fal.'),
      keyedRoute('/agent', env.ANTHROPIC_API_KEY ?? '', agentRequest, 'The server is not configured for Claude.'),
    ],
    // Two pages: the original editor, and the chat.
    build: { rollupOptions: { input: { main: 'index.html', chat: 'chat.html' } } },
    server: { proxy: jev },
    preview: { proxy: jev },
    // Unit tests only; the browser tests in e2e/ run with Playwright.
    test: { include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
  }
})
