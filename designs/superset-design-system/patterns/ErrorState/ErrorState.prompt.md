# ErrorState pattern

An operation failed in a way the user needs to see and act on. Distinct from `Alert` (inline banner in a live surface) — this is a **whole-surface takeover** when there's nothing else useful to show.

## Anatomy

- Icon halo in danger tint (`--danger-tint` bg, `--danger` glyph)
- Title (`--fs-14 --fw-semibold`) — factual, no exclamation marks
- Body (`--fg-mute`, `--lh-body`) — one paragraph, includes the actionable next step
- Primary action (`Button variant="primary"`) — usually "Retry"
- Secondary action (`Button ghost`) — usually "Copy error" or "Report"
- Collapsible technical details under the fold (`<details>` with mono body)

## Copy rules

- Past tense, factual: **"Failed to fetch"**, not "Oops! Something went wrong 😔"
- Name the resource: **"Failed to fetch `origin/main`"** not "Failed to fetch"
- No apology, no emoji, no exclamation
- Always give the user a next action

## When to use

- Route-level failures (workspace load, project fetch)
- Panel-level failures where inline error is drowned out (empty diff panel after failed pull)

For transient errors within a live surface, use `Alert tone="danger"` instead — it doesn't take the surface.

## When NOT to use

- Field-level validation → `FormField` pattern
- One-shot action failures with a live surface still around → `Toast` (error tone)
- A message part inside chat → `msg-error` (see Chat UI kit)
