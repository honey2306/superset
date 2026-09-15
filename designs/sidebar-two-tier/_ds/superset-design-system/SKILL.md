---
name: superset-design
description: Use this skill to generate well-branded interfaces and assets for Superset (Electron / Next.js / Neon monorepo, dark-forward Dracula palette), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, and a full UI kit of components + a Desktop App Shell starting point.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Binding rules (do not violate)
- **Dracula only.** Do not introduce a new theme. The system is authored around one dark palette derived from `--dracula-*` in `tokens/colors.css`.
- **Pink stays a tint.** `--accent` is `#ff79c6`, but the *only* full-fill use is the pink text on primary buttons — every other pink surface is `--accent-tint` (14%) or `--accent-line` (55%). Do not paint large pink areas.
- **Mono everywhere numbers or code appear.** Branch names, file paths, ahead/behind counts, kbd chords, timestamps.
- **No emoji, no CDN icon set.** Use `Icon` from the bundle. If a needed glyph is missing, add it to `components/core/Icon/Icon.jsx`.
- **No hover-only inline actions on rows.** Move destructive / secondary operations into `ContextMenu` on right-click. This is the whole reason v3 exists.
