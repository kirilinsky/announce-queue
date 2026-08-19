# announce-queue

Queued screen-reader announcements for React. One provider renders the two live regions, one hook sends messages through them.

Announcements are played one at a time. A message holds its region for as long as it takes to read — derived from its own length by default — the node is then removed, and only after a short cooldown does the next message of that priority go in, so polite updates never pile up on top of each other. An assertive message never waits behind the polite queue: it goes in immediately, cuts off the polite node that is currently live, and holds the polite lane until the alert itself is gone.

Because playback is serial, a burst of events would otherwise queue up announcements that are stale by the time they are read. Only the freshest `maxQueue` messages per priority are kept, and `clear()` drops the rest whenever the context changes.

Every announcement is inserted as a **new** DOM node (never a `textContent` mutation on an existing one), which is what VoiceOver and Safari need in order to read the update reliably. Removing the node afterwards keeps a screen reader from re-reading stale text when the region regains focus.

## Install

```sh
npm install announce-queue
```

`react >= 18` is a peer dependency.

## Usage

Mount the provider once, at the root of the app:

```tsx
import { AnnounceQueueProvider } from 'announce-queue'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <AnnounceQueueProvider>{children}</AnnounceQueueProvider>
}
```

Then announce from anywhere below it:

```tsx
import { useAnnounce } from 'announce-queue'

function SaveButton() {
  const { announce } = useAnnounce()

  return (
    <button
      onClick={async () => {
        try {
          await save()
          announce('Changes saved')
        } catch {
          announce('Could not save changes', { priority: 'assertive' })
        }
      }}
    >
      Save
    </button>
  )
}
```

Calling `useAnnounce()` outside the provider throws.

## API

### `<AnnounceQueueProvider>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `cooldown` | `number` | `150` | ms of silence after a node is removed, before the next one of that priority |
| `dedupe` | `boolean` | `true` | drop a message identical to one still pending in the same priority |
| `clearAfter` | `number \| 'auto'` | `'auto'` | ms the node stays in the DOM; the next message of that priority waits for it. `'auto'` derives it from the message length (1000–6000ms) |
| `maxQueue` | `number` | `3` | pending messages kept per priority; older ones are dropped first |
| `onEvent` | `(event: AnnounceEvent) => void` | — | observes the lifecycle of each announcement: `enqueue`, `skip` (dropped by dedupe), `drop` (queue full or cleared), `insert`, `clear` |

It renders a visually hidden `role="alert"` / `aria-live="assertive"` region and a `role="status"` / `aria-live="polite"` one, and tears the engine's timers down on unmount. Nothing touches the DOM before the mount effect, so it is safe to render on the server.

### `useAnnounce()`

Returns `{ announce(message, options?), clear(priority?) }`. Options override the provider defaults per call:

```ts
announce('Upload failed', {
  priority: 'assertive', // 'assertive' | 'polite' (default 'polite')
  clearAfter: 2000, // or 'auto' (default)
  dedupe: false,
  cooldown: 300,
})
```

`clear()` drops everything pending and empties the regions — the queue should not keep talking about a screen the user has left:

```tsx
const { clear } = useAnnounce()
const pathname = usePathname()

useEffect(() => clear, [pathname, clear]) // wipe on route change
```

Pass a priority (`clear('polite')`) to leave the other region alone.

## Behaviour

- Two FIFO queues, one per priority, drained by a single timer chain.
- Each priority is serial: `clearAfter + cooldown` passes between one insertion and the next.
- `clearAfter: 'auto'` estimates reading time from the text (exported as `estimateReadingTime` if you want the same number elsewhere).
- Overflow past `maxQueue` drops the **oldest** pending message — the stale one — and reports it as a `drop` event.
- Assertive is taken first whenever its own lane is free. Inserting an alert removes any live polite node right away (its `clear` event carries `interrupted: true`) and blocks the polite lane until the alert is removed.
- Dedupe applies to the **pending** queue only. Two identical calls before the first is inserted produce one node; the same text announced again later produces a second node.
- Messages announced before mount are buffered and flushed once the provider attaches its regions.

## Demo

```sh
npm install
npm run demo
```

`demo/` is a Vite page wired straight to `src/`, not to a build. Type a message, pick a priority, and watch the announcement move through the queue: dashed card while it waits for the region, solid card the moment the engine appends the node, a draining bar for its `clearAfter` lifetime, dimmed once removed. Each column mirrors one live region — expand *live DOM* to read the container markup as it actually is. The scenario buttons cover the interesting cases: a burst played one message at a time, three identical messages where dedupe drops two, an alert that cuts a live polite message off mid-flight, a flood where `maxQueue` throws away the stale ones, and `clear()` wiping both regions.

## Not in v1

A focus + announce combo hook and a ready-made Next.js route-change announcer are deliberately left for a later release.

## License

MIT
