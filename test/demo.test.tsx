import { render, screen, act, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../demo/src/App.js'

const region = (name: 'polite region' | 'assertive region') =>
  screen.getByRole('region', { name })

const cards = (name: 'polite region' | 'assertive region') =>
  within(region(name))
    .getAllByRole('listitem')
    .map((item) => `${item.dataset.state}:${item.textContent}`)

// The live-DOM mirror updates from a MutationObserver microtask, so every
// interaction is flushed through an async act().
const renderDemo = () =>
  act(async () => {
    render(<App />)
    vi.advanceTimersByTime(0)
  })

const click = (name: string | RegExp) =>
  act(async () => {
    screen.getByRole('button', { name }).click()
    vi.advanceTimersByTime(0)
  })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('demo page', () => {
  it('announces, shows the live card and mirrors the real DOM', async () => {
    await renderDemo()
    await click('Announce')

    expect(screen.getByRole('status').textContent).toBe('Draft saved')
    expect(cards('polite region')[0]).toContain('live:')
    expect(cards('polite region')[0]).toContain('<div>Draft saved</div>')

    // The mirrored markup pane reads the container, not the demo's own model.
    expect(region('polite region').textContent).toContain('aria-live="polite"')
  })

  it('sends assertive announcements to the alert region', async () => {
    await renderDemo()
    await click('assertive')
    await click('Announce')

    expect(screen.getByRole('alert').textContent).toBe('Draft saved')
    expect(within(region('polite region')).getByText('no announcements yet')).toBeTruthy()
  })

  it('marks duplicates as skipped', async () => {
    await renderDemo()
    await click(/^Duplicate/)

    const states = cards('polite region').map((card) => card.split(':')[0])
    expect(states).toEqual(['live', 'skipped', 'skipped'])
  })

  it('marks the stalest messages as dropped when the queue floods', async () => {
    await renderDemo()
    await click(/^Flood/)

    const states = cards('polite region').map((card) => card.split(':')[0])
    // 8 sent in one burst: 3 survive in the queue, 1 of them goes live at once.
    expect(states.filter((state) => state === 'dropped')).toHaveLength(5)
    expect(states.filter((state) => state === 'live')).toHaveLength(1)
  })

  it('clear() empties both regions', async () => {
    await renderDemo()
    await click('Announce')
    expect(screen.getByRole('status').textContent).toBe('Draft saved')

    await click(/^clear\(\)/)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('alert').textContent).toBe('')
  })

  it('logs engine events', async () => {
    await renderDemo()
    await click('Announce')

    const log = screen.getByRole('region', { name: 'event log' })
    expect(log.textContent).toContain('enqueue')
    expect(log.textContent).toContain('insert')
  })
})
