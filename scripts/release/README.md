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
| `bun run release desktop <version>` | **Default solo mode.** Updates a clean, current `main` directly and creates no PR. |
| `bun run release desktop <version> <main-sha> [--merge]` | Optional PR mode. Releases an exact commit and records the version through a bump PR. |
| `… --daemon` | Also patch-bump and ship pty-daemon. |
| `bun run release check` | Verify desktop and host-service versions match. |

`version` is `MAJOR.MINOR.PATCH`. For automation, always pass it explicitly.

## Choose a release mode

### Solo-maintainer mode (no PR)

Use this when direct pushes to `main` are intentional:

```bash
git switch main
git pull --ff-only
bun run release desktop 2.0.6
```

The script hard-blocks unless the worktree is clean and local `main` exactly
matches `origin/main`. It commits the desktop + host-service version bump,
pushes `main`, tags that commit, and publishes the release. This normally
creates two workflow runs: CI for the `main` push and the desktop release build
for the tag push. It creates no feature PR or version-bump PR. `--direct` is an
optional explicit alias for this default behavior and cannot be combined with a
commit SHA or `--merge`.

### Bump-PR mode

Keep this mode for repositories that want review or branch protection around
the version commit.

This provisions an ephemeral release branch from the commit, applies the version
bump, tags, pushes, and opens the bump PR; the current worktree is untouched:

```bash
bun run release desktop 1.17.1 <main-commit-sha>
```

You can also release from an existing release branch:

```bash
git switch -c release-1.17.1
bun run release desktop 1.17.1
```

Either PR-mode path creates `desktop-v<version>`, triggers
`release-desktop.yml`, and opens `chore(desktop): bump version to <version>`
into `main`. Merge the bump PR so `main` records the released version.

## Published releases

Desktop releases publish automatically after the build succeeds, becoming
`/releases/latest` for the desktop auto-updater. To also merge the bump PR:

```bash
bun run release desktop 1.17.1 <commit-sha> --merge
```

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
