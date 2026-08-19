import { render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnounceQueueProvider, useAnnounce } from '../src/react.js'

function Trigger({ message, assertive }: { message: string; assertive?: boolean }) {
  const { announce, clear } = useAnnounce()
  return (
    <>
      <button onClick={() => announce(message, assertive ? { priority: 'assertive' } : undefined)}>
        announce
      </button>
      <button onClick={() => clear()}>clear</button>
    </>
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('AnnounceQueueProvider', () => {
  it('renders both live regions visually hidden', () => {
    render(
      <AnnounceQueueProvider>
        <span>app</span>
      </AnnounceQueueProvider>,
    )

    const alert = screen.getByRole('alert')
    const status = screen.getByRole('status')
    expect(alert).toHaveProperty('ariaLive', 'assertive')
    expect(status).toHaveProperty('ariaLive', 'polite')
    expect(alert.style.position).toBe('absolute')
    expect(alert.style.clipPath).toBe('inset(50%)')
  })

  it('announces through the hook into the matching region', () => {
    render(
      <AnnounceQueueProvider>
        <Trigger message="saved" />
      </AnnounceQueueProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'announce' }).click()
      vi.advanceTimersByTime(150)
    })

    expect(screen.getByRole('status').textContent).toBe('saved')
    expect(screen.getByRole('alert').textContent).toBe('')
  })

  it('routes assertive announcements to the alert region', () => {
    render(
      <AnnounceQueueProvider>
        <Trigger message="error" assertive />
      </AnnounceQueueProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'announce' }).click()
      vi.advanceTimersByTime(150)
    })

    expect(screen.getByRole('alert').textContent).toBe('error')
  })

  it('forwards provider config to the engine', () => {
    render(
      <AnnounceQueueProvider clearAfter={200}>
        <Trigger message="temp" />
      </AnnounceQueueProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'announce' }).click()
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByRole('status').textContent).toBe('temp')

    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('forwards engine events to the onEvent prop', () => {
    const onEvent = vi.fn()
    render(
      <AnnounceQueueProvider onEvent={onEvent} clearAfter={200}>
        <Trigger message="watched" />
      </AnnounceQueueProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'announce' }).click()
      vi.advanceTimersByTime(200)
    })

    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(['enqueue', 'insert', 'clear'])
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({ message: 'watched', priority: 'polite' })
  })

  it('clears timers on unmount', () => {
    const { unmount } = render(
      <AnnounceQueueProvider>
        <Trigger message="late" />
      </AnnounceQueueProvider>,
    )

    act(() => void screen.getByRole('button', { name: 'announce' }).click())
    unmount()

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clear() from the hook empties the region', () => {
    render(
      <AnnounceQueueProvider>
        <Trigger message="stale" />
      </AnnounceQueueProvider>,
    )

    act(() => {
      screen.getByRole('button', { name: 'announce' }).click()
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByRole('status').textContent).toBe('stale')

    act(() => void screen.getByRole('button', { name: 'clear' }).click())
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('throws a clear error when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="nope" />)).toThrow(
      /useAnnounce\(\) must be used inside <AnnounceQueueProvider>/,
    )
    spy.mockRestore()
  })
})
