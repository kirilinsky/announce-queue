export type Priority = 'assertive' | 'polite'

/** Assertive is always considered first. */
const PRIORITIES: readonly Priority[] = ['assertive', 'polite']

export interface AnnounceOptions {
  /** Live region to use. Default: 'polite'. */
  priority?: Priority
  /** ms of silence after a node is removed, before the next one of this priority. Default: 150. */
  cooldown?: number
  /** Skip if an identical message is still pending in the same priority. Default: true. */
  dedupe?: boolean
  /**
   * ms the node stays in the DOM; the next message of this priority waits for it.
   * 'auto' (the default) derives it from the length of the message.
   */
  clearAfter?: number | 'auto'
}

/** Lifecycle of a single announcement, for devtools and demos. */
export interface AnnounceEvent {
  /**
   * 'enqueue' → accepted, 'skip' → dropped by dedupe, 'drop' → dropped while
   * pending (queue full or cleared), 'insert' → node appended, 'clear' → node removed.
   */
  type: 'enqueue' | 'skip' | 'drop' | 'insert' | 'clear'
  /** Stable per announcement, so events can be correlated. */
  id: number
  message: string
  priority: Priority
  /** Resolved options for this announcement. */
  cooldown: number
  clearAfter: number
  /** Only on 'clear': the node was removed early — by an alert or by clear(). */
  interrupted?: boolean
}

export interface AnnounceQueueConfig {
  cooldown?: number
  dedupe?: boolean
  clearAfter?: number | 'auto'
  /** Pending messages kept per priority. Older ones are dropped first. Default: 3. */
  maxQueue?: number
  /** Optional observer of the queue lifecycle. Never called after destroy(). */
  onEvent?: (event: AnnounceEvent) => void
}

export interface AnnounceQueue {
  announce(message: string, options?: AnnounceOptions): void
  /** Drops everything pending and removes any live node. One priority, or both. */
  clear(priority?: Priority): void
  attach(assertiveEl: HTMLElement, politeEl: HTMLElement): void
  destroy(): void
}

const DEFAULTS = {
  cooldown: 150,
  dedupe: true,
  clearAfter: 'auto',
  maxQueue: 3,
} satisfies Required<Omit<AnnounceQueueConfig, 'onEvent'>>

/** Rough screen-reader pace, clamped so short text is not clipped and long text does not stall the queue. */
const AUTO_MIN = 1000
const AUTO_MAX = 6000

export function estimateReadingTime(message: string): number {
  const text = message.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  const ms = 400 + Math.max(words * 320, text.length * 45)
  return Math.min(AUTO_MAX, Math.max(AUTO_MIN, Math.round(ms)))
}

interface QueueItem {
  id: number
  message: string
  cooldown: number
  clearAfter: number
}

interface LiveNode {
  item: QueueItem
  node: HTMLElement
  timer: ReturnType<typeof setTimeout>
}

export function createAnnounceQueue(config: AnnounceQueueConfig = {}): AnnounceQueue {
  const defaults = { ...DEFAULTS, ...stripUndefined(config) }

  const queues: Record<Priority, QueueItem[]> = { assertive: [], polite: [] }
  const live: Record<Priority, Set<LiveNode>> = { assertive: new Set(), polite: new Set() }
  /** Timestamp from which this priority may insert its next node. */
  const freeAt: Record<Priority, number> = {
    assertive: Number.NEGATIVE_INFINITY,
    polite: Number.NEGATIVE_INFINITY,
  }
  const containers: Record<Priority, HTMLElement | null> = { assertive: null, polite: null }

  let tickTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let nextId = 1

  function emit(
    type: AnnounceEvent['type'],
    priority: Priority,
    item: QueueItem,
    interrupted?: boolean,
  ): void {
    if (destroyed) return
    defaults.onEvent?.({
      type,
      id: item.id,
      message: item.message,
      priority,
      cooldown: item.cooldown,
      clearAfter: item.clearAfter,
      ...(interrupted ? { interrupted } : {}),
    })
  }

  function announce(message: string, options: AnnounceOptions = {}): void {
    if (destroyed) return

    const priority = options.priority ?? 'polite'
    const dedupe = options.dedupe ?? defaults.dedupe
    const clearAfter = options.clearAfter ?? defaults.clearAfter
    const item: QueueItem = {
      id: nextId++,
      message,
      cooldown: options.cooldown ?? defaults.cooldown,
      clearAfter: clearAfter === 'auto' ? estimateReadingTime(message) : clearAfter,
    }

    // Dedupe against the pending queue only — history is not considered.
    if (dedupe && queues[priority].some((pending) => pending.message === message)) {
      emit('skip', priority, item)
      return
    }

    queues[priority].push(item)
    emit('enqueue', priority, item)

    // A late announcement is worse than none, so overflow drops the stalest.
    while (queues[priority].length > Math.max(1, defaults.maxQueue)) {
      const dropped = queues[priority].shift()!
      emit('drop', priority, dropped)
    }

    schedule()
  }

  function clear(priority?: Priority): void {
    if (destroyed) return

    for (const lane of priority ? [priority] : PRIORITIES) {
      for (const item of queues[lane].splice(0)) emit('drop', lane, item)
      for (const entry of [...live[lane]]) remove(lane, entry, true)
      freeAt[lane] = now() + defaults.cooldown
    }

    if (tickTimer !== null) {
      clearTimeout(tickTimer)
      tickTimer = null
    }
    schedule()
  }

  function attach(assertiveEl: HTMLElement, politeEl: HTMLElement): void {
    if (destroyed) return
    containers.assertive = assertiveEl
    containers.polite = politeEl
    schedule()
  }

  function destroy(): void {
    destroyed = true
    if (tickTimer !== null) {
      clearTimeout(tickTimer)
      tickTimer = null
    }
    for (const priority of PRIORITIES) {
      for (const entry of live[priority]) clearTimeout(entry.timer)
      live[priority].clear()
      queues[priority].length = 0
      containers[priority] = null
    }
  }

  function schedule(): void {
    if (destroyed || tickTimer !== null) return
    if (!containers.assertive || !containers.polite) return

    let at = Number.POSITIVE_INFINITY
    for (const priority of PRIORITIES) {
      if (queues[priority].length > 0) at = Math.min(at, freeAt[priority])
    }
    if (at === Number.POSITIVE_INFINITY) return

    tickTimer = setTimeout(tick, Math.max(0, at - now()))
  }

  /** One insertion per tick: assertive wins whenever its own lane is free. */
  function tick(): void {
    tickTimer = null
    if (destroyed) return

    const at = now()
    for (const priority of PRIORITIES) {
      const item = queues[priority][0]
      if (item && freeAt[priority] <= at) {
        queues[priority].shift()
        insert(priority, item, at)
        break
      }
    }

    schedule()
  }

  function insert(priority: Priority, item: QueueItem, at: number): void {
    const container = containers[priority]
    if (!container) return

    // Always a fresh node — mutating textContent is skipped by VoiceOver.
    const node = container.ownerDocument.createElement('div')
    node.textContent = item.message
    container.appendChild(node)

    // The lane stays busy for the node's whole lifetime, then cools down, so
    // one message per priority is audible at a time.
    freeAt[priority] = at + item.clearAfter + item.cooldown

    const entry: LiveNode = {
      item,
      node,
      timer: setTimeout(() => remove(priority, entry, false), item.clearAfter),
    }
    live[priority].add(entry)
    emit('insert', priority, item)

    // An alert cuts off whatever polite text is on screen and holds the polite
    // lane until it is gone — screen readers interrupt the same way.
    if (priority === 'assertive') {
      for (const politeEntry of [...live.polite]) remove('polite', politeEntry, true)
      freeAt.polite = Math.max(freeAt.polite, freeAt.assertive)
    }
  }

  function remove(priority: Priority, entry: LiveNode, interrupted: boolean): void {
    if (!live[priority].delete(entry)) return
    clearTimeout(entry.timer)
    entry.node.remove()
    emit('clear', priority, entry.item, interrupted)
  }

  return { announce, clear, attach, destroy }
}

function now(): number {
  return Date.now()
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key]
  }
  return out
}
