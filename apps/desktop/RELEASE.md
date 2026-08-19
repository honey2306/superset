# Desktop App Release Process

## Quick Start

From the monorepo root, use the unified entry point:

```bash
bun run release           # interactive: pick Desktop or CLI hotfix
bun run release desktop 2.0.6  # default solo-maintainer release, no PR
```

The release toolchain is TypeScript under `scripts/release/` (run by Bun). For the
full runbook — all flows, release-branch usage, and cleanup — see
[`scripts/release/README.md`](../../scripts/release/README.md). This file covers
desktop-specific details (build output, signing, auto-update, troubleshooting).

The flow will:
1. Show current version and prompt for new version (patch/minor/major/custom)
2. Set desktop, `host-service`, and `cli` all to the new version (unified) and refresh `bun.lock`
3. Create and push a `desktop-v<version>` tag
4. Monitor the GitHub Actions build
5. Create a published GitHub Release, which becomes the latest auto-update
   source when its build succeeds.

> Desktop, `host-service`, and `cli` share one version, enforced by CI
> (`bun run check:versions`). `pty-daemon` stays on its own `0.x` track. See
> [`plans/20260709-unified-version-bumping.md`](../../plans/20260709-unified-version-bumping.md).

### Options

```bash
# Default solo-maintainer flow: clean, current main; no PRs
bun run release desktop 2.0.6

# Reviewed flow: release an exact main commit through a version-bump PR
bun run release desktop 2.0.6 <main-commit-sha>

# Also squash-merge the version bump PR after release
bun run release desktop 2.0.6 <main-commit-sha> --merge

# Non-interactive (e.g. an agent): pass a version; use --republish to
# recreate an existing tag instead of being prompted.
bun run release desktop 0.0.50 --republish
```

### Requirements

- GitHub CLI (`gh`) installed and authenticated
- Clean git working directory

## Interim CLI releases

To ship a CLI-side fix **between** desktop releases, use the CLI flow (from the
monorepo root):

```bash
bun run release cli            # bumps cli + host-service to <desktop>-N (e.g. 1.14.0-1)
bun run release cli --daemon   # ...and patch-bumps pty-daemon (0.2.5 -> 0.2.6) to ship a daemon fix
```

The `-N` suffix is a prerelease **below** the desktop version, so the CLI never
ships above desktop. It tags `cli-v<version>` to trigger `release-cli.yml`.
`pty-daemon` is only bumped with `--daemon`, and stays on its own `0.x` track —
never the `-N` version (a prerelease daemon would sort below desktop's bundled
one and churn on the shared org socket).

## Manual Release

If you prefer not to use the script:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

This creates a published release after the GitHub Actions build succeeds.

## Auto-update

The app checks for updates at launch and every x hours. GitHub Actions embeds
the current `github.repository` in the packaged app, so a build from
`honey2306/superset` checks releases from `honey2306/superset` (there is no
runtime repository selector). A published release must include:

- **macOS manifest**: `latest-mac.yml`
- **macOS updater installer**: the generated `*.zip` and its `*.blockmap` when generated
- **macOS manual installer**: the generated `*.dmg`

The workflow uploads these generated files unchanged, so the filenames in
`latest-mac.yml` continue to resolve correctly.

Builds released before this repository binding was added still point at the
source repository. Install the first fixed release manually from its DMG once;
subsequent releases can then update automatically from `honey2306/superset`.

## Code Signing

macOS builds use the app's local updater. It verifies the ZIP's SHA-512 from
`latest-mac.yml`, validates the extracted
bundle identity/version, then uses a detached local installer with backup and
rollback. It removes the quarantine attribute only from the newly installed
app bundle so macOS can relaunch that downloaded update; it does not change the
system quarantine policy. The app must be installed in a writable location.
If it is not, the update fails safely and the DMG can be installed manually.

Configure these secrets only when distributing signed/notarized builds:

macOS code signing uses these repository secrets:

- `MAC_CERTIFICATE` / `MAC_CERTIFICATE_PASSWORD`
- `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID`

## Local Testing

```bash
cd apps/desktop
bun run clean:dev
bun run compile:app
bun run package
```

Output: `apps/desktop/release/`

Linux output should include:

- `*.AppImage`
- `*-linux.yml` (auto-update manifest)

## Troubleshooting

- **Linux auto-update not working**: Verify `release/*-linux.yml` is uploaded to the GitHub release
- **Build icon warnings/failures**: Add icons under `src/resources/build/icons/` (`icon.icns`, `icon.ico`, optional Linux `.png`)
- **Native module errors**: Ensure `node-pty` is in externals in both `electron.vite.config.ts` and `electron-builder.ts`
