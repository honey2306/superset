# KeyboardHintBar pattern

A subtle footer strip inside popovers / dialogs / command palettes that documents the local keyboard shortcuts.

## Anatomy

- Sits at the bottom of the container, above any action bar
- Top hairline `1px solid var(--line)`
- Padding `var(--s-3) var(--s-6)`
- `--fs-10 --fg-faint`, `--font-mono` for the keys
- Uses `Kbd` primitives for each key, separated by " · " (mono bullet)
- Actions listed left-aligned; primary/close hint right-aligned

## Layout example

```
⌘K search  ·  ↑↓ navigate  ·  ↵ open  ·  ⇥ next               esc close
```

## When to use

- Popover with keyboard-first interaction (branch picker, command palette)
- Command palette (mandatory)
- Any menu the user can drive without touching the mouse

## When NOT to use

- Simple dropdown/menu — the shortcuts are usually next to items already (Kbd inline in row)
- Tooltip — the shortcut IS the content, no need for a hint bar
- Dialog where all interactions are mouse-driven
