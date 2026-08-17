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
} from './core.js'

export interface AnnounceContextValue {
  announce: (message: string, options?: AnnounceOptions) => void
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
}: AnnounceQueueProviderProps) {
  const assertiveRef = useRef<HTMLDivElement>(null)
  const politeRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<AnnounceQueue | null>(null)

  const configRef = useRef<AnnounceQueueConfig>({ cooldown, dedupe, clearAfter })
  configRef.current = { cooldown, dedupe, clearAfter }

  // Lazy so announce() before mount still queues; recreated after unmount
  // (StrictMode double-invokes effects and destroy() is terminal).
  const getQueue = (): AnnounceQueue => {
    queueRef.current ??= createAnnounceQueue(configRef.current)
    return queueRef.current
  }

  const [value] = useState<AnnounceContextValue>(() => ({
    announce: (message, options) => getQueue().announce(message, options),
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
