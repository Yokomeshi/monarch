import { useEffect, useMemo, useRef, useState } from 'react'
import { photoDataUrl } from '../ai/falClient'
import { AgentError, createToolContext, sendMessage, type Block, type Message } from './agentLoop'
import { createViewport } from './viewport'

/** Same key as the main app, so one password entry covers both. */
const PASSWORD_KEY = 'monarch.accessPassword'
const readPassword = () => {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? ''
  } catch {
    return '' // no storage (private window, or blocked by the browser)
  }
}
const savePassword = (password: string) => {
  try {
    localStorage.setItem(PASSWORD_KEY, password)
  } catch {
    // Not remembered; asked for again next time.
  }
}

const TOOL_LABELS: Record<string, string> = { render_viewport: 'Drawing the viewport', screenshot_viewport: 'Checking the result', convert_length: 'Converting sizes', model_from_photo: 'Making a 3D model from your photo (1 to 2 minutes)' }

/** What the chat shows for a message: what was said, and a line for each tool the model used. */
type Line = { kind: 'user' | 'assistant' | 'tool'; text: string }
function lines(message: Message): Line[] {
  if (typeof message.content === 'string') return [{ kind: message.role, text: message.content }]
  return message.content.flatMap((b: Block): Line[] => {
    if (b.type === 'text' && b.text.trim()) return [{ kind: message.role, text: b.text }]
    if (b.type === 'tool_use') return [{ kind: 'tool', text: TOOL_LABELS[b.name] ?? 'Working' }]
    return []
  })
}

export function Chat() {
  const { iframe, viewport } = useMemo(createViewport, [])
  const stage = useRef<HTMLDivElement>(null)
  const ctx = useMemo(() => createToolContext(viewport), [viewport])
  const [attached, setAttached] = useState<string[]>([]) // photos waiting to go with the next message
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const parent = stage.current
    parent?.appendChild(iframe)
    return () => void iframe.remove()
  }, [iframe])

  async function send() {
    const message = text.trim()
    if (!message || busy) return
    // Each photo is numbered, so the model can refer to it when it calls model_from_photo.
    const first = ctx.photos.length
    const content: Block[] = [
      ...attached.flatMap((url, i): Block[] => [
        { type: 'text', text: `Photo ${first + i + 1}:` },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] ?? '' } },
      ]),
      { type: 'text', text: message },
    ]
    setText('')
    setAttached([])
    setError('')
    setBusy(true)
    ctx.password = readPassword()
    ctx.photos.push(...attached)
    for (let attempt = 0; ; attempt++) {
      try {
        const { messages: done, stoppedEarly } = await sendMessage(messages, attached.length ? content : message, ctx, setMessages)
        setMessages(done)
        if (stoppedEarly) setError('Stopped after too many steps. Send another message to continue.')
        break
      } catch (err) {
        if (err instanceof AgentError && err.status === 401 && attempt === 0) {
          const entered = window.prompt('Enter the access password')
          if (entered) {
            ctx.password = entered
            savePassword(entered)
            continue
          }
        }
        setMessages(messages) // back to before this message
        ctx.photos.length = first
        setAttached(attached)
        setText(message)
        setError(err instanceof Error ? err.message : String(err))
        break
      }
    }
    setBusy(false)
  }

  return (
    <div className="chat-app">
      <section className="chat-pane">
        <div className="chat-log">
          {messages.length === 0 && <p className="chat-hint">Describe a room, a layout or a change. Try: a 4 x 5 m living room with a sofa along the long wall.</p>}
          {messages.flatMap(lines).map((l, i) => (
            <p key={i} className={`chat-line ${l.kind}`}>{l.text}</p>
          ))}
          {busy && <p className="chat-line tool">Working…</p>}
          {error && <p className="chat-error" role="alert">{error}</p>}
        </div>
        {attached.length > 0 && (
          <div className="chat-photos">
            {attached.map((url, i) => (
              <button type="button" key={i} title="Remove this photo" onClick={() => setAttached(attached.filter((_, j) => j !== i))}>
                <img src={url} alt={`Attached photo ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Message Monarch"
            rows={2}
            aria-label="Message"
          />
          <label className="chat-attach" title="Attach a photo">
            Photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) setAttached([...attached, await photoDataUrl(file)])
              }}
            />
          </label>
          <button type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      </section>
      <div className="chat-stage" ref={stage} />
    </div>
  )
}
