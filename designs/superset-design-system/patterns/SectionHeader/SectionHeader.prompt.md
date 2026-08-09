# SectionHeader pattern

The rule that opens a group of settings / a list section / a foundational block.

## Anatomy

- Title: `--fs-13 --fw-semibold --fg`, letter-spacing `--ls-title`
- Optional description underneath: `--fs-11 --fg-mute --lh-body`, max 60ch
- Optional action pinned right: pill button, ghost variant
- Bottom hairline `1px solid var(--line)` separating from content

## Density

- Padding `var(--s-4) var(--s-6)` for compact sections (settings panels)
- Padding `var(--s-5) var(--s-7)` for full-page sections
- **Never** put a background color on a section header — the hairline does the visual work

## When to use

- Settings panels group titles ("Appearance", "Keyboard", "Notifications")
- Sidebar section separators without an eyebrow style
- List sections that need a title without being an interactive Collapsible

## When NOT to use

- One-word list groups → use `Collapsible` or a smaller `eyebrow` label
- Modal title → use `DialogHeader` primitive
- Sidebar navigation groups → use `ProjectHeader` from WorkspaceSidebar
