// The app's side of the viewport iframe (see harness.ts): sends it the agent's code and asks for pictures.

import { viewportDocument } from './harness'

/** What the agent's tools act on. */
export interface Viewport {
  /** Draws the scene that `code` builds. Answers 'ok', or the error the code threw. */
  render(code: string): Promise<string>
  /** The viewport as it looks now: a JPEG as a data: URL. */
  screenshot(): Promise<string>
}

const TIMEOUT_MS = 10_000

export function createViewport(): { iframe: HTMLIFrameElement; viewport: Viewport } {
  const iframe = document.createElement('iframe')
  // Scripts only: without allow-same-origin the page cannot reach this app, its storage or the password.
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.title = '3D viewport'
  iframe.srcdoc = viewportDocument()

  const waiting = new Map<number, (message: Record<string, unknown>) => void>()
  let ready: () => void
  const loaded = new Promise<void>((resolve) => (ready = resolve))
  let next = 0

  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return
    const message = event.data ?? {}
    if (message.type === 'ready') ready()
    else waiting.get(message.id)?.(message)
  })

  async function ask(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    await loaded
    const id = next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error('The viewport did not answer. Its code may be stuck in a loop.'))
      }, TIMEOUT_MS)
      waiting.set(id, (message) => {
        clearTimeout(timer)
        waiting.delete(id)
        resolve(message)
      })
      iframe.contentWindow!.postMessage({ ...request, id }, '*')
    })
  }

  return {
    iframe,
    viewport: {
      async render(code) {
        const answer = await ask({ type: 'render', code })
        return typeof answer.error === 'string' ? `Error: ${answer.error}` : 'ok'
      },
      async screenshot() {
        return String((await ask({ type: 'screenshot' })).dataUrl)
      },
    },
  }
}
