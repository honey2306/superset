# ListHeader pattern

Column headers over a dense row list — but only when the columns need explanation.

## Anatomy

- Row height 24px, `--fg-faint`, `--fs-10`, uppercase, `--ls-eyebrow`, `--fw-medium`
- Padding matches list rows (`var(--s-3) var(--s-5)`)
- Bottom hairline `1px solid var(--line)`
- Sortable columns get a small chevron (`Icon name="chevron"` size 9, rotated per direction)
- Numeric column labels right-aligned, mono if it makes their column read cleaner

## When to use

- Tables (`Table` primitive already includes this) — you don't need to compose manually
- Non-`Table` lists where columns aren't self-evident (a settings key-value list, an audit log grid)

## When NOT to use

- Sidebar workspace rows — no headers, the rows are self-descriptive
- Popover search results — no headers, one column with icon + name
- Any list under 5 rows — the ceremony is wasted; use inline column meaning instead
