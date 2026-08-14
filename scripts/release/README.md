# Releasing

The release toolchain is `scripts/release/*.ts` (TypeScript, run by Bun — no
build step). The entry point is **`bun run release`**. Design/rationale lives in
[`plans/20260709-unified-version-bumping.md`](../../plans/20260709-unified-version-bumping.md).

## Model

- **desktop == host-service** at each desktop release. One unified plain version
  is enforced by `bun run check:versions`.
- **pty-daemon** is on its own `0.x` track and is bumped only with `--daemon`.
- The standalone CLI is not part of this distribution.
- The current release artifact is a macOS arm64 DMG. Intel macOS, Linux, canary,
  and auto-update artifacts are intentionally out of scope.

## Commands

| Command | When |
| --- | --- |
| `bun run release` | Interactive desktop release menu (TTY only). |
| `bun run release desktop [version]` | New desktop release. Moves desktop + host-service together. Draft by default. |
| `… --daemon` | Also patch-bump and ship pty-daemon. |
| `bun run release check` | Verify desktop and host-service versions match. |

`version` is `MAJOR.MINOR.PATCH`. For automation, always pass it explicitly.

## Cut from a release branch (not `main`)

Releases are cut on a dedicated release branch, not on `main` or a feature
branch.

### Release a specific commit

This provisions an ephemeral release branch from the commit, applies the version
bump, tags, pushes, and opens the bump PR; the current worktree is untouched:

```bash
bun run release desktop 1.17.1 <main-commit-sha>
```

### Release from an existing release branch

```bash
git switch -c release-1.17.1
bun run release desktop 1.17.1
```

Either path creates `desktop-v<version>`, triggering `release-desktop.yml`, and
opens `chore(desktop): bump version to <version>` into `main`. Merge the bump PR
so `main` records the released version.

## Draft → publish

Desktop releases are drafts by default. Review artifacts before publishing:

```bash
gh release edit desktop-v1.17.1 --draft=false
```

Or publish and merge the bump PR automatically:

```bash
bun run release desktop 1.17.1 <commit-sha> --publish --merge
```

A published, non-draft release becomes `/releases/latest`, which the desktop
auto-updater uses. Do not leave a release as a draft: installed apps cannot see
its update manifest or ZIP asset.

## Daemon guard

If the release reports that `pty-daemon/src` changed since its last version bump,
rerun with `--daemon` so existing installations receive the daemon update.

## Re-cut / cleanup

```bash
gh release delete desktop-v1.17.1 --yes --cleanup-tag
git tag -d desktop-v1.17.1
```

Then rerun the release or pass `--republish` to recreate the same version.

## Agent / non-interactive

All actions are available through flags. Pass a version explicitly; use
`--republish` only when intentionally replacing an existing tag.

## Prerequisites

- Run from the monorepo root.
- `gh` installed and authenticated (`gh auth status`).
