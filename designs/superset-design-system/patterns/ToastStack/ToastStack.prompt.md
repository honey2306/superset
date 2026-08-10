# ToastStack pattern

Where toasts live, how they stack, when they leave.

## Position

- Bottom-right of the viewport, `bottom: var(--s-8)` `right: var(--s-8)`
- Never bottom-center (that's iOS haptic-alert territory) or top (obscures window controls)
- z-index `var(--z-toast)` — above modal, above tooltip trigger

## Stack

- Max 3 visible at once — older toasts dismiss automatically when a 4th arrives
- Vertical gap `var(--s-3)` between toasts
- New toast slides in from the bottom (`translateY(8px)` → `0`), duration `var(--dur-slow)`

## Timing

- Success / info toast: auto-dismiss at 4s
- Warning: auto-dismiss at 6s
- Error toast: **no auto-dismiss** — user must close explicitly
- Hover pauses the timer, resume on leave

## Copy

- Past tense: **"已推送 3 commits"** not "正在推送 3 commits" (that's a Spinner in the trigger)
- No apology, no emoji
- Include the resource: "已切换到 feat/kro-suite" not "已切换"

## When to use

- Result of a user-triggered async action (push, pull, fetch, create workspace)
- Non-blocking background events (auto-fetch complete, update downloaded)

## When NOT to use

- Blocking errors that need a decision → `AlertDialog`
- Field validation → `FormField` error slot
- Persistent conditions the user should see indefinitely → `Alert`
