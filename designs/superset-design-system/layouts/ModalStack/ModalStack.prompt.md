# ModalStack layout

Stacking rules for overlaid surfaces. When two overlays happen at the same time, this decides who covers whom.

## z-index ladder (from tokens/z-index.css)

```
Toast          --z-toast          (always on top — error toasts must not be occluded)
Tooltip        --z-tooltip
Modal          --z-modal          (Dialog / Sheet / AlertDialog content)
Modal scrim    --z-modal-scrim
Overlay        --z-overlay        (Popover / ContextMenu / DropdownMenu / HoverCard)
Sticky overlay --z-sticky-overlay (floating action, banner)
Dropdown       --z-dropdown       (menu trigger anchor row)
Rail           --z-rail           (sidebar, status bar)
Base           --z-base
```

## Scrim rules

- Only Dialog / Sheet / AlertDialog have a scrim. Popover / ContextMenu / DropdownMenu do NOT — they dismiss on outside-click without dimming the app.
- Scrim opacity: `--o-scrim` (0.42) in Dracula, `--o-scrim-light` (0.32) in Light.
- One scrim only. If a Dialog opens another Dialog, keep one scrim underneath both — never stack.

## Which overlay for which decision

| Decision size | Component | Anchoring |
|---|---|---|
| One-tap confirm at a row | `ConfirmCard` | anchored at trigger (like popover) |
| Destructive with no trigger to anchor | `AlertDialog` | centered modal |
| Multi-field form | `Dialog` | centered modal |
| Detail view that shouldn't yank focus | `Sheet` | side-anchored |
| Row / button context actions | `ContextMenu` (right-click) or `DropdownMenu` (click) | anchored |
| Rich hover info | `HoverCard` | 300ms delay |
| One-line factual label | `Tooltip` | immediate |
| Command menu | `Popover` | keyboard-first |

## Never do

- Two dialogs at once — sequence them
- Modal over toast — toast wins (never lose an error message under a modal)
- Popover that opens a Dialog while still visible — close the popover first
