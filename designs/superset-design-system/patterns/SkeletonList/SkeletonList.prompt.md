# SkeletonList pattern

Loading state for a list-of-rows surface (workspace sidebar, files panel, PR list, commit history).

## Anatomy

- 3–5 rows of `Skeleton` primitives, never fewer than 3 (one row reads as "empty")
- Each row mirrors the real row shape:
  - 20px round `Skeleton` = avatar / status dot
  - `Skeleton` at 45% width = title
  - `Skeleton` at 72% width, 9px height = subtitle
  - `Skeleton` at 32×14 = trailing badge / count
- Vertical gap `var(--s-3)` matches real row density
- No text, no icons, no headers — the skeleton is the whole surface

## When to use

- First load of a list where you know the row count/shape
- Refetching after a filter change (keeps layout stable)

## When NOT to use

- **Never** wrap real text in a Skeleton — decide up-front: no data yet (Skeleton) *or* no data ever (Empty)
- Loading a single button or field → don't skeleton, disable the button and add `Spinner`
- List where you don't know if the result will be empty → wait for the fetch, then branch to `EmptyState` or the real list
