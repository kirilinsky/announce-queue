# announce-queue

Queued screen-reader announcements for React. One provider renders the two live regions, one hook sends messages through them.

Every announcement is inserted as a **new** DOM node (never a `textContent` mutation on an existing one), which is what VoiceOver and Safari need in order to read the update reliably. Nodes are removed again after a short delay so a screen reader does not re-read stale text when the region regains focus.

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
| `cooldown` | `number` | `150` | ms between announcements within one priority |
| `dedupe` | `boolean` | `true` | drop a message identical to one still pending in the same priority |
| `clearAfter` | `number` | `1000` | ms after insertion before the node is removed |

It renders a visually hidden `role="alert"` / `aria-live="assertive"` region and a `role="status"` / `aria-live="polite"` one, and tears the engine's timers down on unmount. Nothing touches the DOM before the mount effect, so it is safe to render on the server.

### `useAnnounce()`

Returns `{ announce(message, options?) }`. Options override the provider defaults per call:

```ts
announce('Upload failed', {
  priority: 'assertive', // 'assertive' | 'polite' (default 'polite')
  cooldown: 300,
  dedupe: false,
  clearAfter: 2000,
})
```

## Behaviour

- Two independent FIFO queues, one per priority, drained by a single timer chain.
- Assertive messages are always taken before polite ones; the cooldown of each priority is tracked separately.
- Dedupe applies to the **pending** queue only. Two identical calls before the first is inserted produce one node; the same text announced again later produces a second node.
- Messages announced before mount are buffered and flushed once the provider attaches its regions.

## Not in v1

Focus + announce combo hook, a Next.js route-change announcer, and a `maxQueue` cap are deliberately left for a later release.

## License

MIT
