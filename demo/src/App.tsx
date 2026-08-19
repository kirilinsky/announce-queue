import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnounceQueueProvider, useAnnounce, type AnnounceEvent, type Priority } from 'announce-queue'

const PRIORITIES: Priority[] = ['polite', 'assertive']

interface Card {
  key: string
  id: number
  message: string
  priority: Priority
  clearAfter: number
  state: 'pending' | 'live' | 'cleared' | 'skipped' | 'dropped'
  at: number
  insertedAt?: number
  interrupted?: boolean
}

interface LogLine {
  key: string
  at: number
  type: AnnounceEvent['type']
  priority: Priority
  message: string
}

export function App() {
  const [cards, setCards] = useState<Card[]>([])
  const [log, setLog] = useState<LogLine[]>([])
  const [maxQueue, setMaxQueue] = useState(3)
  const startRef = useRef(Date.now())
  const genRef = useRef({ gen: 0, lastId: 0 })

  const onEvent = useCallback((event: AnnounceEvent) => {
    // Ids restart when the engine is recreated (StrictMode remount), so the
    // demo namespaces them to keep its own cards apart.
    if (event.type === 'enqueue' || event.type === 'skip') {
      if (event.id <= genRef.current.lastId) genRef.current.gen += 1
      genRef.current.lastId = event.id
    }
    const key = `${genRef.current.gen}:${event.id}`
    const at = Date.now() - startRef.current

    setLog((lines) => [...lines, { key: `${key}:${event.type}`, at, ...pick(event) }].slice(-60))

    setCards((prev) => {
      if (event.type === 'enqueue' || event.type === 'skip') {
        const card: Card = {
          key: event.type === 'skip' ? `${key}:skip` : key,
          id: event.id,
          message: event.message,
          priority: event.priority,
          clearAfter: event.clearAfter,
          state: event.type === 'skip' ? 'skipped' : 'pending',
          at,
        }
        return [...prev, card].slice(-40)
      }

      if (event.type === 'drop') {
        return prev.map((card) => (card.key === key ? { ...card, state: 'dropped' } : card))
      }

      const state: Card['state'] = event.type === 'insert' ? 'live' : 'cleared'
      return prev.map((card) =>
        card.key === key
          ? {
              ...card,
              state,
              insertedAt: event.type === 'insert' ? at : card.insertedAt,
              interrupted: event.interrupted ?? card.interrupted,
            }
          : card,
      )
    })
  }, [])

  const reset = () => {
    setCards([])
    setLog([])
    startRef.current = Date.now()
  }

  return (
    // Remounting on maxQueue keeps the demo honest: it is engine config, not a per-call option.
    <AnnounceQueueProvider key={maxQueue} maxQueue={maxQueue} onEvent={onEvent}>
      <Layout
        cards={cards}
        log={log}
        onReset={reset}
        maxQueue={maxQueue}
        onMaxQueueChange={setMaxQueue}
      />
    </AnnounceQueueProvider>
  )
}

function pick(event: AnnounceEvent) {
  return { type: event.type, priority: event.priority, message: event.message }
}

interface LayoutProps {
  cards: Card[]
  log: LogLine[]
  onReset: () => void
  maxQueue: number
  onMaxQueueChange: (value: number) => void
}

function Layout({ cards, log, onReset, maxQueue, onMaxQueueChange }: LayoutProps) {
  const { announce, clear } = useAnnounce()

  const [message, setMessage] = useState('Draft saved')
  const [priority, setPriority] = useState<Priority>('polite')
  const [cooldown, setCooldown] = useState(150)
  const [clearAfter, setClearAfter] = useState(1500)
  const [autoClearAfter, setAutoClearAfter] = useState(true)
  const [dedupe, setDedupe] = useState(true)

  const options = { cooldown, clearAfter: autoClearAfter ? ('auto' as const) : clearAfter, dedupe }
  const send = (text: string, p: Priority = priority) => announce(text, { ...options, priority: p })

  return (
    <div className="page">
      <header className="masthead">
        <h1>announce-queue</h1>
        <p>
          Every card below is a real node the engine appended to a visually hidden{' '}
          <code>aria-live</code> region. One message holds its region for <code>clearAfter</code>
          (by default derived from its own length),
          then the node is removed and the next one waits out <code>cooldown</code> — polite
          messages never talk over each other. An assertive message does not wait: it cuts off the
          live polite node and keeps the polite lane quiet until the alert is gone.
        </p>
      </header>

      <main className="grid">
        <section className="panel controls" aria-labelledby="controls-title">
          <h2 id="controls-title">Announce</h2>

          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              if (message.trim()) send(message.trim())
            }}
          >
            <label className="field">
              <span>Message</span>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Draft saved"
              />
            </label>

            <fieldset className="field">
              <legend>Priority</legend>
              <div className="segmented">
                {PRIORITIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="segment"
                    aria-pressed={priority === value}
                    data-priority={value}
                    onClick={() => setPriority(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="row">
              <label className="field">
                <span>cooldown, ms</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={cooldown}
                  onChange={(event) => setCooldown(Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>clearAfter, ms</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={clearAfter}
                  disabled={autoClearAfter}
                  onChange={(event) => setClearAfter(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={autoClearAfter}
                onChange={(event) => setAutoClearAfter(event.target.checked)}
              />
              <span>clearAfter: 'auto' — from message length</span>
            </label>

            <label className="field">
              <span>maxQueue, per priority</span>
              <input
                type="number"
                min={1}
                max={20}
                value={maxQueue}
                onChange={(event) => onMaxQueueChange(Number(event.target.value) || 1)}
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={dedupe}
                onChange={(event) => setDedupe(event.target.checked)}
              />
              <span>dedupe pending duplicates</span>
            </label>

            <button type="submit" className="primary">
              Announce
            </button>
          </form>

          <h3>Scenarios</h3>
          <div className="stack">
            <button
              type="button"
              onClick={() => {
                for (let i = 1; i <= 5; i += 1) send(`${message.trim() || 'Item'} ${i}`)
              }}
            >
              Burst — 5 messages, played one after another
            </button>
            <button
              type="button"
              onClick={() => {
                for (let i = 0; i < 3; i += 1) send(message.trim() || 'Item')
              }}
            >
              Duplicate — same text 3&times; (dedupe drops 2)
            </button>
            <button
              type="button"
              onClick={() => {
                send('Row one updated', 'polite')
                send('Row two updated', 'polite')
                // Fired mid-flight, so the live polite node is visibly cut off.
                window.setTimeout(() => send('Connection lost', 'assertive'), 700)
              }}
            >
              Interrupt — assertive cuts the polite queue in
            </button>
            <button
              type="button"
              onClick={() => {
                for (let i = 1; i <= 8; i += 1) send(`Row ${i} synced`)
              }}
            >
              Flood — 8 messages, maxQueue drops the stalest
            </button>
            <button type="button" onClick={() => clear()}>
              clear() — drop everything, empty both regions
            </button>
            <button type="button" onClick={onReset}>
              Reset view
            </button>
          </div>
        </section>

        {PRIORITIES.map((value) => (
          <Region key={value} priority={value} cards={cards.filter((c) => c.priority === value)} />
        ))}
      </main>

      <EventLog log={log} />
    </div>
  )
}

function Region({ priority, cards }: { priority: Priority; cards: Card[] }) {
  const markup = useLiveRegionMarkup(priority)
  const pending = cards.filter((card) => card.state === 'pending').length

  return (
    <section className="panel region" data-priority={priority} aria-label={`${priority} region`}>
      <header className="region-head">
        <h2>{priority}</h2>
        <span className="tag">{pending} pending</span>
      </header>

      <ol className="column">
        {cards.length === 0 && <li className="empty">no announcements yet</li>}
        {cards.map((card) => (
          <li key={card.key} className="card" data-state={card.state}>
            <div className="card-meta">
              <span>#{card.id}</span>
              <span>{stateLabel(card)}</span>
            </div>
            <code className="card-node">
              &lt;div&gt;{card.message}&lt;/div&gt;
            </code>
            {card.state === 'live' && (
              <div className="life">
                <span style={{ animationDuration: `${card.clearAfter}ms` }} />
              </div>
            )}
          </li>
        ))}
      </ol>

      <details className="dom">
        <summary>live DOM</summary>
        <pre>{markup}</pre>
      </details>
    </section>
  )
}

function stateLabel(card: Card): string {
  switch (card.state) {
    case 'pending':
      return `queued at ${card.at}ms — waiting for the region`
    case 'dropped':
      return 'dropped — queue full or cleared'
    case 'live':
      return `in DOM at ${card.insertedAt}ms`
    case 'cleared':
      return card.interrupted ? 'cut off by an alert' : `removed after ${card.clearAfter}ms`
    case 'skipped':
      return 'dropped — duplicate pending'
  }
}

/** Mirrors the real container markup, so the page shows the DOM, not a model of it. */
function useLiveRegionMarkup(priority: Priority): string {
  const [markup, setMarkup] = useState('')

  useEffect(() => {
    const container = document.querySelector<HTMLElement>(`[aria-live="${priority}"]`)
    if (!container) return

    const read = () => {
      const children = Array.from(container.children)
        .map((child) => `  <div>${child.textContent ?? ''}</div>`)
        .join('\n')
      const open = `<div role="${priority === 'assertive' ? 'alert' : 'status'}" aria-live="${priority}">`
      setMarkup(children ? `${open}\n${children}\n</div>` : `${open}</div>`)
    }

    read()
    const observer = new MutationObserver(read)
    observer.observe(container, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [priority])

  return markup
}

function EventLog({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [log])

  return (
    <section className="panel log" aria-label="event log">
      <h2>Engine events</h2>
      <div className="log-body" ref={ref}>
        {log.length === 0 && <p className="empty">onEvent output appears here</p>}
        {log.map((line) => (
          <p key={line.key} data-type={line.type}>
            <span className="log-time">{String(line.at).padStart(5, ' ')}ms</span>
            <span className="log-type">{line.type.padEnd(7, ' ')}</span>
            <span className="log-priority">{line.priority.padEnd(9, ' ')}</span>
            <span className="log-message">{line.message}</span>
          </p>
        ))}
      </div>
    </section>
  )
}
