# TabbedWorkspace layout

Main-area layout for a workspace: tab bar on top, content below, optional right panel.

## Dimensions

- **Tab bar**: 34px, hairline bottom `1px solid var(--line)`
  - Each tab 24–28px tall, pill-radius, mono label
  - Tab gap 4px, tab-hover reveals `--hover` bg
  - Active tab: `--fg` label + 2px pink underline flush to hairline
- **Toolbar** (optional, 32px): sits between tab bar and content when the pane has global actions
- **Content**: `1fr`, `--page-bg`
  - Padding varies by pane type: 0 for terminals/editors, `--s-4` for lists, `--s-6` for prose
- **Right panel**: 320–420px, opens with `data-panel-open` attribute
  - Sliding transition `var(--dur-slow) var(--ease-standard)`
  - Left hairline separates from content

## Panes

- Editor pane: 0 padding, monospace, its own scrollbar
- Terminal pane: 0 padding, monospace, `--dracula-bg` bg
- Chat pane: 780px inner max-width, centered, `var(--s-8)` v-padding
- Diff / Changes pane: `var(--s-4)` padding, hairline row separators

## When to use

- Workspace main area with multiple concurrent panes
- Any surface where user can add/close/reorder view slots

## When NOT to use

- Settings — no tabs; use SectionHeader stacking
- Onboarding — linear flow, not tabbed
