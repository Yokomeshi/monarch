import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentError, sendMessage, type Block, type Message } from './agentLoop'
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

const TOOL_LABELS: Record<string, string> = { render_viewport: 'Drawing the viewport', screenshot_viewport: 'Checking the result', convert_length: 'Converting sizes' }

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
    setText('')
    setError('')
    setBusy(true)
    let password = readPassword()
    for (let attempt = 0; ; attempt++) {
      try {
        const { messages: done, stoppedEarly } = await sendMessage(messages, message, viewport, password, setMessages)
        setMessages(done)
        if (stoppedEarly) setError('Stopped after too many steps. Send another message to continue.')
        break
      } catch (err) {
        if (err instanceof AgentError && err.status === 401 && attempt === 0) {
          const entered = window.prompt('Enter the access password')
          if (entered) {
            password = entered
            savePassword(entered)
            continue
          }
        }
        setMessages(messages) // back to before this message
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
          <button type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      </section>
      <div className="chat-stage" ref={stage} />
    </div>
  )
}
