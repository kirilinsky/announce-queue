import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  createAnnounceQueue,
  type AnnounceOptions,
  type AnnounceQueue,
  type AnnounceQueueConfig,
  type Priority,
} from './core.js'

export interface AnnounceContextValue {
  announce: (message: string, options?: AnnounceOptions) => void
  /** Drops pending announcements and removes any live node — e.g. on a route change. */
  clear: (priority?: Priority) => void
}

const AnnounceContext = createContext<AnnounceContextValue | null>(null)

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  clipPath: 'inset(50%)',
}

export interface AnnounceQueueProviderProps extends AnnounceQueueConfig {
  children: ReactNode
}

export function AnnounceQueueProvider({
  children,
  cooldown,
  dedupe,
  clearAfter,
  maxQueue,
  onEvent,
}: AnnounceQueueProviderProps) {
  const assertiveRef = useRef<HTMLDivElement>(null)
  const politeRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<AnnounceQueue | null>(null)

  const configRef = useRef<AnnounceQueueConfig>({ cooldown, dedupe, clearAfter, maxQueue })
  configRef.current = { cooldown, dedupe, clearAfter, maxQueue }

  // Read through a ref so a fresh callback identity does not need a new engine.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  // Lazy so announce() before mount still queues; recreated after unmount
  // (StrictMode double-invokes effects and destroy() is terminal).
  const getQueue = (): AnnounceQueue => {
    queueRef.current ??= createAnnounceQueue({
      ...configRef.current,
      onEvent: (event) => onEventRef.current?.(event),
    })
    return queueRef.current
  }

  const [value] = useState<AnnounceContextValue>(() => ({
    announce: (message, options) => getQueue().announce(message, options),
    clear: (priority) => getQueue().clear(priority),
  }))

  useEffect(() => {
    const queue = getQueue()
    queue.attach(assertiveRef.current!, politeRef.current!)
    return () => {
      queue.destroy()
      queueRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div ref={assertiveRef} role="alert" aria-live="assertive" aria-atomic="true" style={srOnly} />
      <div ref={politeRef} role="status" aria-live="polite" aria-atomic="true" style={srOnly} />
    </AnnounceContext.Provider>
  )
}

export function useAnnounce(): AnnounceContextValue {
  const value = useContext(AnnounceContext)
  if (value === null) {
    throw new Error('useAnnounce() must be used inside <AnnounceQueueProvider>')
  }
  return value
}
