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
  queue = createAnnounceQueue()
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

    vi.advanceTimersByTime(150)
    expect(texts(politeEl)).toEqual(['hello'])
    expect(texts(assertiveEl)).toEqual([])
  })

  it('drains assertive before queued polite messages', () => {
    queue.announce('polite one')
    queue.announce('polite two')
    queue.announce('urgent', { priority: 'assertive' })

    vi.advanceTimersByTime(0)
    expect(texts(assertiveEl)).toEqual(['urgent'])
    expect(texts(politeEl)).toEqual([])

    vi.advanceTimersByTime(150)
    expect(texts(politeEl)).toEqual(['polite one'])
  })

  it('spaces messages of one priority by cooldown', () => {
    queue.announce('a')
    queue.announce('b')

    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['a'])

    vi.advanceTimersByTime(149)
    expect(texts(politeEl)).toEqual(['a'])

    vi.advanceTimersByTime(1)
    expect(texts(politeEl)).toEqual(['a', 'b'])
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
    vi.advanceTimersByTime(150)
    expect(texts(politeEl)).toEqual(['same'])
  })

  it('dedupes per priority, not globally', () => {
    queue.announce('dup')
    queue.announce('dup', { priority: 'assertive' })

    vi.advanceTimersByTime(150)
    expect(texts(assertiveEl)).toEqual(['dup'])
    expect(texts(politeEl)).toEqual(['dup'])
  })

  it('honours dedupe: false', () => {
    queue.announce('twice', { dedupe: false })
    queue.announce('twice', { dedupe: false })

    vi.advanceTimersByTime(150)
    expect(texts(politeEl)).toEqual(['twice', 'twice'])
  })

  it('always creates a fresh node instead of mutating an existing one', () => {
    queue.announce('first', { clearAfter: 10_000 })
    vi.advanceTimersByTime(0)
    const firstNode = politeEl.firstElementChild!

    queue.announce('second', { clearAfter: 10_000 })
    vi.advanceTimersByTime(150)

    expect(politeEl.children).toHaveLength(2)
    expect(politeEl.firstElementChild).toBe(firstNode)
    expect(firstNode.textContent).toBe('first')
    expect(politeEl.lastElementChild).not.toBe(firstNode)
    expect(politeEl.lastElementChild!.textContent).toBe('second')
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
    vi.advanceTimersByTime(50)
    expect(texts(politeEl)).toEqual(['one', 'two'])

    vi.advanceTimersByTime(100)
    expect(politeEl.children).toHaveLength(0)

    // cooldown counts from the previous insertion (t=50), not from announce() (t=150)
    custom.announce('slow', { cooldown: 400 })
    vi.advanceTimersByTime(299)
    expect(politeEl.children).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(texts(politeEl)).toEqual(['slow'])

    custom.destroy()
  })

  it('buffers messages announced before attach', () => {
    const detached = createAnnounceQueue()
    detached.announce('early')
    vi.advanceTimersByTime(1000)
    expect(texts(politeEl)).toEqual([])

    detached.attach(assertiveEl, politeEl)
    vi.advanceTimersByTime(0)
    expect(texts(politeEl)).toEqual(['early'])

    detached.destroy()
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
