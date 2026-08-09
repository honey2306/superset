# AppShell — full desktop layout

The outermost frame of the desktop app.

## Row 1 — Window chrome (34px)

- 34px tall, `-webkit-app-region: drag`
- Traffic lights left (12px × 3, gap 8px, padding-left 12px)
- Tab strip in the middle (`-webkit-app-region: no-drag`), tabs 24px tall
- Right slot for status pill / user (small)

## Row 2 — Main content area (`1fr`)

- Grid: `[left-rail] [sidebar] [main] [right-panel]`
- `left-rail`: 44px (icon-only nav) — optional, most surfaces don't have it
- `sidebar`: 260–320px, resizable, min 220px, max 480px
- `main`: `1fr`
- `right-panel`: 0–420px, hidden by default, snap-open on right rail click
- All splits use a 1px hairline divider (`--line`), no bespoke drag handle

## Row 3 — Status bar (24px, optional)

- 24px, single-row, mono
- Only when needed (progress, host status)
- Never taller than 24; if you need more, put it in the right panel

## z-index ladder

- Chrome: `--z-rail`
- Sidebar / rail: `--z-rail`
- Popovers: `--z-overlay`
- Dialogs / sheets: `--z-modal`
- Toasts: `--z-toast`

## When to use

- Any full-app view (Main workspace, Todos, Automations)
- Not for onboarding / paywall / boot — those are their own single-purpose full-screens
