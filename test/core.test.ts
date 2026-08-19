import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnnounceQueue, type AnnounceQueue } from '../src/core.js'

let queue: AnnounceQueue
let assertiveEl: HTMLElement
let politeEl: HTMLElement

const texts = (el: HTMLElement) => Array.from(el.children).map((c) => c.textContent)

beforeEach(() => {
  vi.useFakeTimers()
  assertiveEl = document.createElement('div')
  politeEl = document.createElement('div')
  document.body.append(assertiveEl, politeEl)
  // Fixed lifetime keeps the timing assertions readable; 'auto' is covered on its own.
  queue = createAnnounceQueue({ clearAfter: 1000 })
  queue.attach(assertiveEl, politeEl)
})

afterEach(() => {
  queue.destroy()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('createAnnounceQueue', () => {
  it('inserts a polite message as a new node quickly', () => {
    queue.announce('hello')
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['hello'])
    expect(texts(assertiveEl)).toEqual([])
  })

  it('holds one node per priority: the next waits for clearAfter plus cooldown', () => {
    queue.announce('a')
    queue.announce('b')

    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['a'])

    vi.advanceTimersByTime(1000) // 'a' removed, cooldown still running
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(149)
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(1)
    expect(texts(politeEl)).toEqual(['b'])
  })

  it('lets assertive go first and keeps polite silent while the alert is up', () => {
    queue.announce('polite one')
    queue.announce('polite two')
    queue.announce('urgent', { priority: 'assertive' })

    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['urgent'])
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(1000) // alert removed
    expect(texts(assertiveEl)).toEqual([])
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(150) // polite lane free again
    expect(texts(politeEl)).toEqual(['polite one'])

    vi.advanceTimersByTime(1150)
    expect(texts(politeEl)).toEqual(['polite two'])
  })

  it('interrupts a live polite node when an assertive message arrives', () => {
    queue.announce('slow update', { clearAfter: 5000 })
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['slow update'])

    queue.announce('connection lost', { priority: 'assertive' })
    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['connection lost'])
    expect(texts(politeEl)).toEqual([]) // cut off, not left underneath the alert
  })

  it('dedupes identical messages still pending in the same priority', () => {
    queue.announce('same')
    queue.announce('same')

    vi.advanceTimersByTime(999) // still inside clearAfter, so nothing was removed
    expect(texts(politeEl)).toEqual(['same'])
  })

  it('does not dedupe against history once the message was inserted', () => {
    queue.announce('same')
    vi.advanceTimersByTime(1000) // inserted, then cleared by clearAfter

    queue.announce('same')
    vi.advanceTimersByTime(150) // cooldown after the previous node
    expect(texts(politeEl)).toEqual(['same'])
  })

  it('dedupes per priority, not globally', () => {
    queue.announce('dup')
    queue.announce('dup', { priority: 'assertive' })

    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['dup'])

    vi.advanceTimersByTime(1150)
    expect(texts(politeEl)).toEqual(['dup'])
  })

  it('honours dedupe: false', () => {
    queue.announce('twice', { dedupe: false })
    queue.announce('twice', { dedupe: false })

    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['twice'])

    vi.advanceTimersByTime(1150)
    expect(texts(politeEl)).toEqual(['twice'])
  })

  it('always creates a fresh node instead of mutating an existing one', () => {
    queue.announce('first', { clearAfter: 10_000 })
    vi.advanceTimersByTime(0)
    const firstNode = politeEl.firstElementChild!

    queue.announce('second', { clearAfter: 10_000 })
    vi.advanceTimersByTime(10_150)

    expect(politeEl.children).toHaveLength(1)
    expect(firstNode.textContent).toBe('first') // never rewritten in place
    expect(politeEl.firstElementChild).not.toBe(firstNode)
    expect(politeEl.firstElementChild!.textContent).toBe('second')
  })

  it('removes each node after clearAfter', () => {
    queue.announce('bye', { clearAfter: 500 })
    vi.advanceTimersByTime(0)
    expect(politeEl.children).toHaveLength(1)

    vi.advanceTimersByTime(499)
    expect(politeEl.children).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(politeEl.children).toHaveLength(0)
  })

  it('applies config defaults and lets options override them', () => {
    const custom = createAnnounceQueue({ cooldown: 50, clearAfter: 100 })
    custom.attach(assertiveEl, politeEl)

    custom.announce('one')
    custom.announce('two')
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['one'])

    vi.advanceTimersByTime(150) // 100 lifetime + 50 cooldown
    expect(texts(politeEl)).toEqual(['two'])

    vi.advanceTimersByTime(150)
    custom.announce('long', { clearAfter: 400 })
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['long'])
    vi.advanceTimersByTime(399)
    expect(texts(politeEl)).toEqual(['long'])
    vi.advanceTimersByTime(1)
    expect(texts(politeEl)).toEqual([])

    custom.destroy()
  })

  it('buffers messages announced before attach', () => {
    const detached = createAnnounceQueue({ clearAfter: 1000 })
    detached.announce('early')
    vi.advanceTimersByTime(1000)
    expect(texts(politeEl)).toEqual([])

    detached.attach(assertiveEl, politeEl)
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['early'])

    detached.destroy()
  })

  it("derives the node lifetime from the message when clearAfter is 'auto'", () => {
    const auto = createAnnounceQueue()
    auto.attach(assertiveEl, politeEl)

    auto.announce('Saved')
    vi.advanceTimersByTime(0)
    vi.advanceTimersByTime(999)
    expect(texts(politeEl)).toEqual(['Saved']) // short text still gets the 1000ms floor
    vi.advanceTimersByTime(1)
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(150)
    auto.announce('12 rows imported from the CSV file, 2 skipped')
    vi.advanceTimersByTime(1200)
    expect(politeEl.children).toHaveLength(1) // longer text is held longer

    auto.destroy()
  })

  it('drops the stalest pending messages once maxQueue is exceeded', () => {
    const dropped: string[] = []
    const capped = createAnnounceQueue({
      clearAfter: 1000,
      maxQueue: 2,
      onEvent: (event) => {
        if (event.type === 'drop') dropped.push(event.message)
      },
    })
    capped.attach(assertiveEl, politeEl)

    for (const message of ['one', 'two', 'three', 'four']) capped.announce(message)
    expect(dropped).toEqual(['one', 'two']) // only the two freshest survive

    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['three'])
    vi.advanceTimersByTime(1150)
    expect(texts(politeEl)).toEqual(['four'])

    capped.destroy()
  })

  it('clear() drops pending work and removes the live node', () => {
    queue.announce('first')
    queue.announce('second')
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['first'])

    queue.clear()
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(5000)
    expect(texts(politeEl)).toEqual([]) // 'second' never speaks
  })

  it('clear(priority) leaves the other priority alone', () => {
    queue.announce('status')
    queue.announce('alert', { priority: 'assertive' })
    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['alert'])

    queue.clear('polite')
    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['alert'])
    vi.advanceTimersByTime(5000)
    expect(texts(politeEl)).toEqual([])
  })

  it('accepts new announcements after clear()', () => {
    queue.announce('old news')
    vi.advanceTimersByTime(0)
    queue.clear()

    queue.announce('fresh')
    vi.advanceTimersByTime(150) // cooldown after the cleared node
    expect(texts(politeEl)).toEqual(['fresh'])
  })

  it('reports the lifecycle through onEvent', () => {
    const events: string[] = []
    const observed = createAnnounceQueue({
      clearAfter: 1000,
      onEvent: (event) => events.push(`${event.type}:${event.priority}:${event.message}:${event.id}`),
    })
    observed.attach(assertiveEl, politeEl)

    observed.announce('ping', { clearAfter: 300 })
    observed.announce('ping', { clearAfter: 300 }) // deduped while pending
    vi.advanceTimersByTime(0)
    expect(events).toEqual(['enqueue:polite:ping:1', 'skip:polite:ping:2', 'insert:polite:ping:1'])

    vi.advanceTimersByTime(300)
    expect(events[events.length - 1]).toBe('clear:polite:ping:1')

    observed.destroy()
  })

  it('flags an interrupted clear event', () => {
    const events: { type: string; interrupted?: boolean }[] = []
    const observed = createAnnounceQueue({ clearAfter: 1000, onEvent: (event) => events.push(event) })
    observed.attach(assertiveEl, politeEl)

    observed.announce('status', { clearAfter: 5000 })
    vi.advanceTimersByTime(0)
    observed.announce('alert', { priority: 'assertive' })
    vi.advanceTimersByTime(0)

    expect(events.find((event) => event.type === 'clear')).toMatchObject({ interrupted: true })

    observed.destroy()
  })

  it('stops emitting events after destroy()', () => {
    const onEvent = vi.fn()
    const observed = createAnnounceQueue({ clearAfter: 1000, onEvent })
    observed.attach(assertiveEl, politeEl)
    observed.destroy()

    observed.announce('silent')
    vi.advanceTimersByTime(1000)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('destroy() drops pending work and stops timers', () => {
    queue.announce('kept', { clearAfter: 500 })
    vi.advanceTimersByTime(0)
    queue.announce('dropped')

    queue.destroy()
    vi.advanceTimersByTime(5000)

    expect(texts(politeEl)).toEqual(['kept']) // clear timer cancelled too
    queue.announce('after destroy')
    vi.advanceTimersByTime(1000)
    expect(texts(politeEl)).toEqual(['kept'])
  })
})
