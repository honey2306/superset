# DoubleSidebar layout

Left rail (icons) + inner sidebar (list) + main content. The current app main view.

## Dimensions

- **Left rail**: 44px, `--surface-sunk` background
  - Icon buttons 32×32 with 6px inner padding
  - Active state: pink accent bar 2px on the right edge of the button
- **Inner sidebar**: 260–320px, `--surface` (slightly lighter than rail)
  - Header (60px) with nav buttons
  - Scroll body (fills)
  - Ports section (auto)
  - Footer (44px) with Add Repository + updates
- **Main**: `1fr`, `--page-bg`

## Split behavior

- Rail is non-resizable (fixed 44px)
- Inner sidebar resize handle only on the right edge
- When main width < 720px, inner sidebar collapses to icons only (44px)

## When to use

- Superset main workspace view (workspace list + chat)
- Any surface with a top-level nav + a searchable list

## When NOT to use

- Settings surface — use single wide sidebar (240px) + main; no rail
- Modal / dialog — never
- Route with only one column of content — use AppShell without the sidebar row
