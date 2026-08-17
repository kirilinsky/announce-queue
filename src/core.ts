export type Priority = 'assertive' | 'polite'

export interface AnnounceOptions {
  /** Live region to use. Default: 'polite'. */
  priority?: Priority
  /** ms between announcements inside one priority. Default: 150. */
  cooldown?: number
  /** Skip if an identical message is still pending in the same priority. Default: true. */
  dedupe?: boolean
  /** ms after insertion before the node is removed. Default: 1000. */
  clearAfter?: number
}

export interface AnnounceQueueConfig {
  cooldown?: number
  dedupe?: boolean
  clearAfter?: number
}

export interface AnnounceQueue {
  announce(message: string, options?: AnnounceOptions): void
  attach(assertiveEl: HTMLElement, politeEl: HTMLElement): void
  destroy(): void
}

const DEFAULTS = {
  cooldown: 150,
  dedupe: true,
  clearAfter: 1000,
} satisfies Required<AnnounceQueueConfig>

interface QueueItem {
  message: string
  cooldown: number
  clearAfter: number
}

export function createAnnounceQueue(config: AnnounceQueueConfig = {}): AnnounceQueue {
  const defaults = { ...DEFAULTS, ...stripUndefined(config) }

  const queues: Record<Priority, QueueItem[]> = { assertive: [], polite: [] }
  const lastInsertAt: Record<Priority, number> = {
    assertive: Number.NEGATIVE_INFINITY,
    polite: Number.NEGATIVE_INFINITY,
  }
  const containers: Record<Priority, HTMLElement | null> = { assertive: null, polite: null }
  const clearTimers = new Set<ReturnType<typeof setTimeout>>()

  let tickTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function announce(message: string, options: AnnounceOptions = {}): void {
    if (destroyed) return

    const priority = options.priority ?? 'polite'
    const cooldown = options.cooldown ?? defaults.cooldown
    const dedupe = options.dedupe ?? defaults.dedupe
    const clearAfter = options.clearAfter ?? defaults.clearAfter

    // Dedupe against the pending queue only — history is not considered.
    if (dedupe && queues[priority].some((item) => item.message === message)) return

    queues[priority].push({ message, cooldown, clearAfter })
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
    for (const timer of clearTimers) clearTimeout(timer)
    clearTimers.clear()
    queues.assertive.length = 0
    queues.polite.length = 0
    containers.assertive = null
    containers.polite = null
  }

  /** Assertive wins every tick; a single timer chain drives both queues. */
  function nextPriority(): Priority | null {
    if (queues.assertive.length > 0) return 'assertive'
    if (queues.polite.length > 0) return 'polite'
    return null
  }

  function schedule(): void {
    if (destroyed || tickTimer !== null) return
    if (!containers.assertive || !containers.polite) return

    const priority = nextPriority()
    if (priority === null) return

    const item = queues[priority][0]!
    const wait = Math.max(0, lastInsertAt[priority] + item.cooldown - now())

    tickTimer = setTimeout(tick, wait)
  }

  function tick(): void {
    tickTimer = null
    if (destroyed) return

    const priority = nextPriority()
    if (priority === null) return

    const item = queues[priority][0]!
    // An assertive message may have jumped ahead of a polite one mid-wait, so
    // re-check the cooldown for whichever queue actually won this tick.
    const wait = lastInsertAt[priority] + item.cooldown - now()
    if (wait > 0) {
      tickTimer = setTimeout(tick, wait)
      return
    }

    queues[priority].shift()
    insert(priority, item)
    lastInsertAt[priority] = now()
    schedule()
  }

  function insert(priority: Priority, item: QueueItem): void {
    const container = containers[priority]
    if (!container) return

    // Always a fresh node — mutating textContent is skipped by VoiceOver.
    const node = container.ownerDocument.createElement('div')
    node.textContent = item.message
    container.appendChild(node)

    const timer = setTimeout(() => {
      clearTimers.delete(timer)
      node.remove()
    }, item.clearAfter)
    clearTimers.add(timer)
  }

  return { announce, attach, destroy }
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
