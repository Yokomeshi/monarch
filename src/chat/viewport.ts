// The app's side of the viewport iframe (see harness.ts): sends it the agent's code and asks for pictures.

import { viewportDocument } from './harness'

/** A named object in the scene: its size, and its lowest and highest corner, all in metres as [x, y, z]. */
export interface Measured {
  name: string
  size: [number, number, number]
  min: [number, number, number]
  max: [number, number, number]
}

/** What the agent's tools act on. */
export interface Viewport {
  /** Draws the scene that `code` builds. Answers 'ok', or the error the code threw. */
  render(code: string): Promise<string>
  /** The viewport as it looks now: a JPEG as a data: URL. */
  screenshot(): Promise<string>
  /** Every named object in the scene, measured. */
  measure(): Promise<Measured[]>
  /** Keeps a GLB model under `name` for scene code to clone. Answers with its size in metres: [x, y, z]. */
  addModel(name: string, glb: ArrayBuffer): Promise<[number, number, number]>
}

const TIMEOUT_MS = 10_000
/** Reading a model's file takes longer than drawing a scene. */
const MODEL_TIMEOUT_MS = 30_000

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

  async function ask(request: Record<string, unknown>, timeout = TIMEOUT_MS): Promise<Record<string, unknown>> {
    await loaded
    const id = next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error('The viewport did not answer. Its code may be stuck in a loop.'))
      }, timeout)
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
      async measure() {
        return (await ask({ type: 'measure' })).objects as Measured[]
      },
      async addModel(name, glb) {
        const answer = await ask({ type: 'loadModel', name, glb }, MODEL_TIMEOUT_MS)
        if (typeof answer.error === 'string') throw new Error(`The model could not be read: ${answer.error}`)
        return answer.size as [number, number, number]
      },
    },
  }
}
