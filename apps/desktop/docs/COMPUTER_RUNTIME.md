# Superset Computer Runtime

## Status

This document describes the long-term Computer Use architecture used by the
desktop application.

The product capability is **Superset Computer Runtime**. Cua Driver and the
macOS native supplement are implementation providers. Agent prompts, tasks,
session state, and UI must not depend on a provider name or provider-specific
tool namespace.

The old external Peekaboo application/CLI runtime is retired. Superset does not
launch or require `Peekaboo.app`.

## Architecture

```text
Superset Agent / Task Runtime
              |
              v
      computer_* MCP contract
              |
              v
    ComputerUseCoordinator
      |               |
      |               +-- turn-scoped desktop lease
      |               +-- same-lease action serialization
      |               +-- cancellation / idle release
      |               +-- generation
      v
 Electron-owned ComputerRuntime
      |
      +-- Cua Driver Embedded
      |     - common desktop observation/input/window primitives
      |     - macOS / Windows / Linux provider contract
      |
      +-- Superset high-level runtime
            |
            +-- composition over Cua
            |     window/app/paste/dialog/action
            |
            +-- macOS native supplement
                  Space / Dock / missing native window actions
```

Web automation remains a separate capability:

```text
Agent -> Agent Browser -> WebContentsView / CDP
```

Do not route ordinary website tasks through desktop Computer Use.

## Runtime ownership

Cua is created inside the Electron main process. The detached Host Service,
ACP daemon, and per-session MCP subprocesses never instantiate Cua directly.

Electron main exposes an authenticated private bridge:

- `SUPERSET_COMPUTER_RUNTIME_BRIDGE_SOCKET`
- `SUPERSET_COMPUTER_RUNTIME_BRIDGE_TOKEN`

The token is stored under the current `SUPERSET_HOME_DIR`; Unix sockets and
token files are restricted to the local user.

This ownership is deliberate. On macOS, Accessibility and Screen Recording
must be attributed to Superset, not to an unrelated helper application or a
detached CLI.

## Stable Agent contract

The Agent-facing contract uses only `computer_*` names.

The common low-level surface currently includes observation, verification,
input, clipboard, app/window discovery, menu, cursor, and screen tools.

Superset also owns these high-level tools:

- `computer_window`
- `computer_app`
- `computer_paste`
- `computer_dialog`
- `computer_action`
- `computer_space` on macOS when the native supplement is available
- `computer_dock` on macOS when the native supplement is available

Internal provider names such as `superset_*`, Cua browser tools, Cua session
management, and provider configuration tools are not exposed to the Agent.

### Cross-platform rule

The high-level contract is capability-driven, not provider-driven.

Without the macOS supplement, Window/App/Paste/Dialog/Action remain available
where their requested action can be fulfilled by Cua. Platform-specific
mutations fail explicitly instead of silently falling back to shell automation.

Space and Dock are macOS-specific capabilities and are advertised only when
the native supplement is present.

## Cua Driver

The current embedded dependency is `@trycua/cua-driver@0.28.2`.

Cua is the primary common provider because it gives Superset a single embedded
desktop contract across macOS, Windows, and Linux. Its JavaScript package is
ESM-only, while the Electron main output is CJS, so the Cua JS/UniFFI glue is
bundled into the main process and the platform native artifacts remain
external materialized resources.

Do not expose Cua's tool catalog directly to the model. The catalog is used as
a provider capability source and is mapped into the Superset contract.

## macOS native supplement

Package: `@superset/macos-computer-provider`

This is a Node-API module loaded into Electron main. It is not a helper daemon
or a second application, so it shares the Superset process identity and TCC
permission boundary.

It fills gaps that Cua 0.28.2 does not expose through its public tool surface:

- Space inventory, switching, and exact-window Space movement
- exact-window close/minimize/restore/maximize
- application graceful terminate/hide/unhide
- Dock inventory, launch, context menu, and auto-hide state
- in-process clipboard snapshot/restore for atomic temporary paste

Cua remains the preferred state/readback source. For example, a native
window/Space mutation is pinned against Cua's exact `pid/window_id` inventory
before dispatch and verified from a fresh Cua inventory afterward.

### SkyLight private API risk

macOS Space management uses private SkyLight/CoreGraphics Services symbols,
including the same family of APIs used by established macOS window automation
tools:

- `CGSCopySpaces`
- `CGSCopySpacesForWindows`
- `CGSGetActiveSpace`
- `CGSManagedDisplaySetCurrentSpace`
- `CGSAddWindowsToSpaces`
- `CGSRemoveWindowsFromSpaces`

These APIs are unsupported by Apple and may change on a future macOS release.

Rules for this provider:

1. Resolve private symbols dynamically.
2. Treat missing symbols as capability unavailable.
3. Never infer success from dispatch alone.
4. Re-read state before reporting a confirmed mutation.
5. Keep the private API inside the supplement package; it must never leak into
   the Agent contract.
6. If a future Cua release provides equivalent supported capability, prefer
   Cua and remove the duplicate supplement path.

## Desktop concurrency

The physical desktop is a single shared resource even though Superset can run
many Agent sessions.

`ComputerUseCoordinator` therefore provides:

- one turn-scoped desktop lease across all sessions
- FIFO waiting between different sessions
- strict serialization of actions inside the current lease as well
- cancellation while waiting or queued
- a monotonically changing generation when ownership changes
- turn-end release after already-submitted actions drain
- idle release as a fallback

This prevents both of these races:

```text
Agent A: observe Finder
Agent B: focus VS Code
Agent A: type into what it thinks is Finder
```

and:

```text
same Agent:
tool call 1: click
tool call 2: type
(two calls accidentally dispatch concurrently)
```

A future UI may expose the lease owner as "Agent X is controlling this Mac",
but the runtime safety model must not depend on that UI.

## Observation and verification

Action delivery and action effect are different facts.

Prefer this loop:

```text
observe -> decide -> act against exact identity -> verify -> observe again
```

Preserve Cua snapshot IDs and opaque element tokens exactly. Stale identities
must fail closed.

The Superset bridge returns the current coordinator generation in MCP metadata.
Generation is a host ownership marker; provider snapshot tokens remain the
fine-grained element/window observation identity.

## Permissions

On macOS, Superset owns:

- Accessibility
- Screen Recording / Screen & System Audio Recording

A previous permission grant to Peekaboo does not transfer to Superset.

The MCP tool `computer_permissions` reports the current host permission
state. Permission prompting is explicit; Agent code must not bypass a missing
permission with AppleScript, shell mouse tools, another automation app, or an
external Peekaboo process.

Changing Screen Recording permission may require relaunching Superset.

## Packaging

The desktop build must materialize and validate:

- Cua platform package
- Cua native dylib/N-API runtime
- UBJS platform runtime
- `macos_computer_provider.node` on macOS

`copy:native-modules.ts` force-refreshes the Superset workspace native
provider on every run. This is required because Bun workspace symlinks become
real directories during materialization; without refresh, incremental native
source edits can otherwise leave electron-builder packaging a stale binary.

`validate:native-runtime.ts` treats missing Computer Runtime native binaries
as a build failure.

## Verification baseline

Before merging changes to Computer Runtime, run at least:

```bash
bun run --cwd apps/desktop test \
  src/main/lib/computer-use/computer-use-coordinator.test.ts \
  src/main/lib/computer-use/superset-computer-runtime.test.ts

bun run --cwd packages/host-service test \
  src/runtime/acp-sessions/computer-use-local-mcp.test.ts \
  src/runtime/acp-sessions/computer-use-mcp.test.ts

bun --filter @superset/host-service typecheck
bun --filter @superset/desktop typecheck

bun run --cwd apps/desktop copy:native-modules
bun run --cwd apps/desktop compile:app
bun run --cwd apps/desktop validate:native-runtime
```

A macOS real-runtime smoke should additionally prove:

- Electron main reports `Superset Computer Runtime ready`
- the real MCP can enumerate apps and windows
- `computer_space { action: "list" }` works
- `computer_dock { action: "status" }` works
- public tools contain no `superset_*` names
- Cua browser tools do not enter desktop MCP
- the new Superset process tree contains no Peekaboo child process

Do not use a visible mutation as a release smoke test unless the test is
explicitly designed to restore the user's prior desktop state.
