# FormField pattern

One field in a form. Label + control + optional hint + optional error, all vertically stacked with `gap: var(--s-2)`.

## Anatomy

```
Label (with * if required)
Input  |  Textarea  |  SegmentedControl  |  Radio group
Hint text          — muted, --fs-11
Error text         — danger, --fs-11 (replaces hint when invalid)
```

- Label uses `Label` primitive; required marker `*` in `--danger`, weight semibold
- Control fills row width unless it's a `SegmentedControl` (natural width, left-aligned)
- **Hint and error occupy the same slot** — never both visible at the same time
- On error: control gets `border-danger` + `focus-visible:ring` in `danger-tint` (via `aria-invalid`)
- Error copy is factual and specific: **"Branch already exists"**, not "Invalid input"

## Layout

- Fields in a form use `gap: var(--s-6)` between fields
- 2-column layout only when both fields fit ≥ 200px each; otherwise stack

## When to use

- Every input in a Dialog or Settings panel
- Fields in `NewWorkspaceModal`, `Settings/appearance`, etc.

## When NOT to use

- Inline chat composer (no label, no error — different pattern)
- Command palette input (no label — its own pattern)
- Single-field prompt in a Popover (label often redundant)
