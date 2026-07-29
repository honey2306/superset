# V1/V2 Desktop Fusion Plan

> **Superseded for active implementation by**
> [`20260726-v1-shell-v2-base-fusion.md`](./20260726-v1-shell-v2-base-fusion.md).
> This document remains the completed M0–M5 terminal-runtime record; its
> former M6/M7 deletion path must not be executed independently of the
> pane-parity and cutover gates in the canonical plan.

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` updated as implementation
proceeds.

Reference: This plan follows `AGENTS.md` and the existing plan style in
`apps/desktop/plans/20260109-2313-terminal-runtime-abstraction-rewrite.md`.

## Purpose / Big Picture

We want to keep the v1 workspace experience, remove the v2 workspace product
surface, and migrate the v2 pieces that materially improve reliability and
agent workflow.

The target product shape is:

1. Users stay in the v1 workspace UI.
2. Terminal agent workflows remain terminal-based CLI workflows.
3. The terminal backend becomes v2-grade: byte-safe, reconnectable, daemon
   owned, and able to survive UI remounts.
4. Agent state, port discovery, run scripts, and link handling are preserved
   where they improve v1.
5. v2 routes, pane model, and duplicated workspace UI are deleted after v1
   reaches feature parity for the kept capabilities.

This is a fusion, not a wholesale v1-to-v2 migration.

## Plain-Language Decision

Keep v1 as the user-facing workspace. Move the best v2 infrastructure under
it. Then delete v2 UI.

Do not keep two workspace products alive indefinitely. The temporary bridge is
acceptable during migration, but the end state should have one workspace UI and
one terminal/runtime backend.

## Current Architecture

### V1 terminal today

Renderer:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalStream.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/v1-terminal-cache.ts`

Main / IPC:

- `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`
- `apps/desktop/src/main/lib/workspace-runtime/local.ts`
- `apps/desktop/src/main/lib/terminal/daemon/daemon-manager.ts`
- `apps/desktop/src/main/lib/terminal-host/client.ts`
- `apps/desktop/src/main/terminal-host/session.ts`
- `apps/desktop/src/main/terminal-host/pty-subprocess.ts`

Important current problem:

- v1 terminal output is string-oriented at multiple layers.
- `apps/desktop/src/main/terminal-host/session.ts` explicitly notes that chunk
  boundary UTF-8 mangling is possible.
- This matches the observed v1 mojibake issue.

### V2 terminal today

Backend:

- `packages/host-service/src/terminal/terminal.ts`
- `packages/host-service/src/trpc/router/terminal/terminal.ts`
- `packages/pty-daemon/src/Pty/Pty.ts`
- `packages/pty-daemon/src/Server/Server.ts`

Renderer:

- `apps/desktop/src/renderer/lib/terminal/terminal-runtime-registry.ts`
- `apps/desktop/src/renderer/lib/terminal/terminal-ws-transport.ts`
- `apps/desktop/src/renderer/lib/terminal/terminal-parking.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2TerminalLauncher/useV2TerminalLauncher.ts`

Important advantage:

- PTY output is byte-oriented end-to-end.
- `packages/pty-daemon/src/Pty/Pty.ts` uses `node-pty` with `encoding: null`.
- `packages/host-service/src/terminal/terminal.ts` sends output as binary
  WebSocket frames.
- `terminal-ws-transport.ts` writes `Uint8Array` directly into xterm.

## Keep / Migrate

### Must keep

1. **PTY daemon byte pipeline**
   - Keep `packages/pty-daemon`.
   - Keep binary WebSocket output into xterm.
   - Keep byte-fidelity tests.
   - This is the clean fix for v1 mojibake.

2. **Host-service terminal API**
   - Keep `packages/host-service/src/terminal/terminal.ts`.
   - Keep `packages/host-service/src/trpc/router/terminal/terminal.ts`.
   - Adapt it so v1 workspace panes can create/adopt sessions without needing
     the v2 workspace UI.

3. **Renderer terminal runtime registry**
   - Keep `terminal-runtime-registry.ts`, `terminal-ws-transport.ts`, and
     terminal parking.
   - Mount those runtimes inside v1 terminal panes.
   - Keep v1 tab/pane UX; replace the transport and lifecycle core.

4. **Terminal agent bindings**
   - Keep `packages/host-service/src/terminal-agents/types.ts`.
   - Keep `packages/host-service/src/terminal-agents/store.ts`.
   - Keep host-service agent launch plumbing that binds CLI agent processes to
     terminal sessions.

5. **Port discovery / localhost preview**
   - Keep v2/host-service port detection where it gives better server discovery
     and reconnect behavior.
   - Surface it through v1 sidebar components instead of v2 sidebar components.

6. **Run/setup/teardown scripts**
   - Keep the v2 script model if it is already the richer implementation.
   - Wire v1 run controls to the shared host-service terminal/session launch
     path.

7. **Click/link policy**
   - Keep centralized click policy and terminal link behavior.
   - Use it from v1 terminal, v1 changes sidebar, and any preserved dashboard
     surfaces.

### Keep only if needed

1. **Host-service git/filesystem routes**
   - Keep as a runtime boundary if the terminal migration already depends on
     host-service workspace identity.
   - Otherwise leave v1's existing git/files behavior alone until there is a
     concrete reason to migrate.

2. **Agent session orchestrator**
   - Keep if we need one coordinator for Superset chat agents and terminal CLI
     agents.
   - Defer if the first milestone only launches terminal agents.

3. **Background terminals UI**
   - Keep the capability.
   - Redesign or port only the small v1-compatible controls: session dropdown,
     connection indicator, kill/attach actions.

### Delete / do not preserve

1. v2 workspace route and page composition.
2. v2 pane registry as a product model.
3. v2 dashboard/sidebar UI duplication when equivalent v1 surfaces exist.
4. Multi-host/cloud workspace UI unless a future product decision requires it.
5. ACP/native agent message UI for this migration. The chosen workflow remains
   terminal CLI agents.

## Target Architecture

The desired layering:

```text
v1 Workspace UI
  -> v1 tab/pane store
  -> v1 TerminalPane adapter
  -> shared terminal runtime registry
  -> host-service terminal API
  -> pty-daemon
  -> node-pty encoding:null
```

Identity rule:

- `paneId` remains the v1 UI identity.
- `terminalId` becomes the backend session identity.
- Add a persistent mapping from `paneId` to `terminalId`.
- Do not assume `paneId === terminalId` after this migration.

## Non-Goals

1. Do not redesign the v1 workspace UI.
2. Do not migrate users to v2 workspaces as a prerequisite.
3. Do not build a native non-terminal agent transcript UI.
4. Do not implement remote/cloud terminals in this migration.
5. Do not remove v1 terminal features until the replacement behavior has been
   verified in v1.

## Milestones

### Milestone 0: Baseline audit and safety tests

Goal: lock down current behavior before changing the terminal path.

Tasks:

1. Document v1 terminal actions that must remain supported:
   - create terminal
   - create terminal with initial command
   - run terminal agent
   - write input
   - resize
   - clear
   - search
   - close/kill
   - tab switch detach/reattach
   - app reload/cold restore, if currently supported
2. Add or identify smoke tests for v1 terminal creation and close behavior.
3. Add a small mojibake reproduction test if practical:
   - split UTF-8 characters across output chunks
   - verify xterm receives bytes safely after the migration
4. Record current v1 terminal settings and preset behaviors.

Validation:

- `bun run typecheck`
- focused terminal tests
- manual v1 terminal smoke test

Exit criteria:

- We know which v1 behaviors are in scope.
- We have at least one repeatable way to detect regressions.

### Milestone 1: Introduce a v1 terminal backend adapter

Goal: let v1 terminal panes talk to host-service terminal sessions without
absorbing v2 workspace UI.

Tasks:

1. Add a v1-specific adapter near the current v1 terminal code, for example:
   - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/host-service-terminal-adapter.ts`
2. The adapter owns:
   - create/adopt session
   - connect WebSocket transport
   - write
   - resize
   - kill
   - reconnect
3. Keep the React component surface close to today's v1 props:
   - `paneId`
   - `tabId`
   - `workspaceId`
4. Add backend identity mapping:
   - store `terminalId` in pane metadata or a stable side table keyed by
     `{ workspaceId, paneId }`
   - persist enough data to reattach after renderer remount
5. Keep legacy electron tRPC terminal calls behind a feature flag or fallback
   during the first PR.

Validation:

- Create a v1 terminal using host-service backend.
- Type commands and see output.
- Resize pane and verify backend receives cols/rows.
- Close pane and verify the host-service session is killed or detached
  according to v1 semantics.

Exit criteria:

- One v1 terminal can run through the v2-grade backend without mounting v2 UI.

### Milestone 2: Make v1 terminal output byte-safe

Goal: remove the real v1 mojibake class by using the byte pipeline.

Tasks:

1. Route v1 terminal output through `terminal-ws-transport.ts`.
2. Ensure renderer writes `Uint8Array` into xterm instead of decoded strings.
3. Keep paste/input as bytes or clearly define UTF-8 encoding at the edge.
4. Port or reuse v2 byte-fidelity tests:
   - non-UTF-8 bytes do not throw
   - split multibyte UTF-8 sequences do not render replacement characters
   - split emoji survives replay/reattach
5. Remove any new code path that does `.toString("utf8")` on arbitrary PTY
   chunks.

Validation:

- Run byte-fidelity tests.
- Manual terminal smoke:
  - Chinese output
  - emoji output
  - large output stream
  - agent CLI output

Exit criteria:

- v1 terminal no longer depends on string-decoded PTY output.

### Milestone 3: Preserve v1 terminal UX on the new runtime

Goal: users should feel like v1 stayed the same, except more reliable.

Tasks:

1. Keep v1 tab layout, split behavior, and pane context menu.
2. Rewire these actions to the new backend:
   - kill session
   - clear
   - search
   - copy/paste
   - scroll-to-bottom
   - open link
   - file link click
3. Port v2 connection indicator only if it adds useful state without clutter.
4. Keep terminal settings:
   - presets
   - background terminal preference
   - link behavior
5. Verify tab switch, split resize, and pane close do not recreate or orphan
   sessions unexpectedly.

Validation:

- Manual v1 parity checklist.
- Renderer console has no terminal lifecycle errors.
- No leaked WebSocket subscriptions after closing panes.

Exit criteria:

- Daily v1 terminal usage is covered on the new backend.

### Milestone 4: Terminal agents on the fused backend

Goal: CLI agents still launch in terminals, with better status tracking.

Tasks:

1. Reuse host-service agent command construction:
   - `packages/host-service/src/trpc/router/agents/agents.ts`
   - `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`
2. Bind launched terminal sessions to agent metadata:
   - agent kind
   - terminal/session id
   - workspace id
   - lifecycle status
3. Surface bindings in v1:
   - workspace sidebar agent chip
   - terminal pane title/status where useful
   - close confirmation if an agent is active
4. Keep terminal agent behavior terminal-native:
   - do not parse agent messages into a separate chat UI
   - do not require ACP for this migration
5. Verify all supported CLI agents still launch with the expected env and
   wrapper scripts.

Validation:

- Launch Codex/Claude/OpenCode/Kimi/etc. where locally configured.
- Confirm status moves through running/idle/permission/ended where hooks exist.
- Close/reopen terminal pane and verify status remains accurate.

Exit criteria:

- v1 can run terminal agents through the host-service terminal path.

### Milestone 5: Port useful v2 workspace affordances into v1

Goal: migrate only the v2 features that improve the v1 daily workflow.

Tasks:

1. Port or rewire port discovery into v1 sidebar:
   - show detected localhost servers
   - open browser preview
   - group ports by workspace/session if available
2. Port run/setup/teardown script execution:
   - launch scripts in host-service terminal sessions
   - preserve logs
   - expose clear running/failed/succeeded states
3. Reuse centralized click policy:
   - terminal links
   - file links
   - folder links
   - localhost links
4. Keep v1 settings screens as the entry point.
   - Remove v2-labeled duplicates once v1 supports the same capability.

Validation:

- Run a dev server from v1 and verify detected port appears.
- Open port from sidebar.
- Run setup and teardown scripts.
- Verify click policy matches settings.

Exit criteria:

- The useful non-terminal v2 workflow pieces are available in v1.

### Milestone 6: Remove v2 workspace entry points

Goal: stop exposing v2 as a parallel product surface.

Tasks:

1. Remove or hide v2 workspace navigation entries.
2. Remove v2 workspace creation/open actions from command palette and menus.
3. Replace v2-only settings links with v1/fused settings links.
4. Keep compatibility redirects if existing persisted links point to v2 routes.
5. Add telemetry or logging around redirects for one release if helpful.

Validation:

- New workspace opens in v1.
- Existing deep links either redirect or fail with a clear migration path.
- Command palette no longer offers duplicate v1/v2 workspace actions.

Exit criteria:

- Users cannot accidentally enter v2 workspace UI during normal navigation.

### Milestone 7: Delete v2 UI code

Goal: remove dead UI after the fused v1 path is stable.

Tasks:

1. Delete v2 workspace route components under:
   - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/`
2. Delete v2-specific pane registry code that is no longer imported.
3. Delete v2-specific settings pages/components that have v1 replacements.
4. Keep shared libraries that v1 now imports:
   - terminal runtime registry
   - terminal WebSocket transport
   - terminal parking
   - click policy
5. Use `rg` to remove dead exports, route links, and feature flags.

Validation:

- `bun run lint:fix`
- `bun run lint`
- `bun run typecheck`
- targeted desktop tests
- manual app navigation smoke

Exit criteria:

- No v2 workspace UI remains reachable or imported.
- Shared infrastructure remains under neutral paths.

## Suggested PR Breakdown

### PR 1: v1 terminal host-service adapter

Files likely touched:

- v1 terminal component/hooks/cache
- renderer terminal runtime registry integration
- host-service terminal router, if v1 needs small additive fields
- pane metadata types for `terminalId`

Deliverable:

- One v1 terminal pane can run on host-service/pty-daemon behind a feature flag.

### PR 2: byte-safe v1 terminal default

Deliverable:

- v1 terminal uses byte-safe backend by default.
- mojibake regression tests pass.
- legacy terminal path remains available only as emergency fallback, or is
  removed if confidence is high.

### PR 3: terminal agents and status

Deliverable:

- terminal CLI agents launch through fused backend.
- v1 sidebar/status surfaces read host-service terminal-agent bindings.

### PR 4: ports, run scripts, click policy

Deliverable:

- useful v2 affordances are visible in v1.
- v2-labeled settings/actions are either merged or removed.

### PR 5: remove v2 entry points

Deliverable:

- users stay in v1.
- v2 routes redirect or are hidden.

### PR 6: delete v2 UI

Deliverable:

- v2 workspace UI code is removed.
- shared infrastructure remains.

## Validation Matrix

Run these before removing v2:

1. Plain terminal:
   - create
   - input/output
   - resize
   - split panes
   - close pane
   - app reload
2. Byte fidelity:
   - Chinese output
   - emoji output
   - split multibyte output
   - long output replay
3. Agent terminal:
   - launch agent
   - interrupt/stop
   - permission prompt visibility
   - status chip accuracy
   - close confirmation
4. Ports:
   - run dev server
   - detect port
   - open preview
   - stop process and clear stale port
5. Scripts:
   - setup
   - run
   - teardown
   - failure state
6. Navigation:
   - command palette
   - sidebar workspace open
   - task-linked workspace open
   - settings links
   - persisted/deep links

## Risks and Mitigations

### Risk: v1 pane identity conflicts with v2 terminal identity

Mitigation:

- Introduce explicit `paneId -> terminalId` mapping early.
- Keep mapping updates close to pane creation/adoption.
- Never assume equality in new code.

### Risk: migration creates a third architecture

Mitigation:

- Treat the adapter as temporary.
- Move shared terminal code to neutral renderer/lib and host-service packages.
- Delete old and v2-only paths after parity.

### Risk: host-service workspace model drags in v2 complexity

Mitigation:

- Host-service APIs should accept the minimal v1 workspace context needed for
  terminal/session launch.
- Do not require v2 workspace route or pane registry to create a terminal.

### Risk: terminal agents depend on CLI-specific hooks

Mitigation:

- Keep the terminal-agent contract intentionally generic:
  `terminalId`, `workspaceId`, `agent`, `status`, timestamps, and last known
  activity.
- Let wrappers provide best-effort lifecycle hooks, but do not block terminal
  functionality on rich lifecycle data.

### Risk: deleting v2 too early hides missing feature parity

Mitigation:

- Hide entry points first.
- Leave compatibility redirects for one release.
- Delete code only after v1 validation matrix passes.

## Progress

- [x] (2026-07-24) Captured migration direction: v1 UI stays, v2 terminal
  backend and selected workflow capabilities are migrated.
- [x] (2026-07-25) Milestone 0: Baseline audit and safety tests.
  - Documented v1 terminal actions: create / createWithCommand (via
    `createOrAttach` `command` field) / write / resize / clear /
    clearScrollback / search (renderer-side xterm SearchAddon) / signal /
    kill / detach / restart / coldRestore / tabSwitch (via v1-terminal-cache
    parking) / paste / scrollToBottom / link click / cwd+title tracking /
    auto-reconnect with exponential backoff.
  - Added `apps/desktop/src/main/terminal-host/session-byte-fidelity.test.ts`:
    - characterization test locking the current mojibake bug (split
      multibyte UTF-8 across chunks corrupts via per-chunk
      `toString("utf8")` at `session.ts:379-383`).
    - happy-path baseline (complete multibyte string in one chunk).
    - non-UTF-8 byte handling gap (no round-trip today).
    - v1 behavior audit tests (create/ready, command spawn payload, exit
      broadcast).
  - Recorded v1 settings/presets: `shellReadyState` gating (OSC 133),
    `SHELLS_WITH_READY_MARKER`, `scrollbackLines` /
    `DEFAULT_TERMINAL_SCROLLBACK`, env via `buildSafeEnv`, shell args via
    `getShellArgs`/`getCommandShellArgs`, cold-restore snapshot replay,
    emulator backlog backpressure watermarks
    (`EMULATOR_WRITE_QUEUE_HIGH_WATERMARK_BYTES = 1_000_000`,
    `EMULATOR_WRITE_QUEUE_LOW_WATERMARK_BYTES = 250_000`),
    `ATTACH_FLUSH_TIMEOUT_MS = 500`, `SHELL_READY_TIMEOUT_MS = 15_000`.
- [x] (2026-07-26) Milestone 1: v1 terminal backend adapter.
  - Added `host-service-terminal-adapter.ts`: creates/adopts host-service
    terminal sessions, maintains stable paneId→terminalId identity across
    adapter remounts, deduplicates concurrent creates, and constructs WebSocket
    URLs with token/workspace/theme params.
  - Added `useHostServiceTerminal` hook: feature-flag-gated adapter factory.
  - Added `FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL` to shared constants.
  - (2026-07-26) Replaced placeholder write/resize/detach methods with shared
    runtime operations; added host-service readiness waiting and concurrent
    create/close race handling.
  - (2026-07-26) Added backend-aware terminal cleanup routing. Hidden tab
    unmounts park the runtime without killing the PTY; explicit pane/tab close
    uses host-service kill and discards renderer state. A live legacy runtime
    is retired if a feature-flag refresh moves the pane to host-service.
  - (2026-07-26) Added v1→host workspace identity resolution. The adapter
    prefers an exact UUID and otherwise maps the v1 workspace to the
    host-owned workspace row by normalized worktree path.
  - Manual feature-flagged v1 smoke passed: session create/attach, input,
    resize, workspace switch/remount, and explicit pane-close disposal all ran
    through host-service without mounting v2 UI.
- [x] (2026-07-26) Milestone 2: byte-safe v1 terminal output.
  - Added `HostServiceTerminalPane`: uses `terminalRuntimeRegistry` +
    `terminal-ws-transport`, receives `Uint8Array` binary frames from
    host-service WebSocket, xterm handles UTF-8 boundaries internally.
  - Modified `TabPane.tsx`: feature-flag-gated switch between legacy
    `Terminal` and `HostServiceTerminalPane`.
  - (2026-07-26) Restored v1 clear/scroll/copy/paste callbacks, terminal
    hotkeys/search, scroll-to-bottom UI, focus, title updates, initial cwd, and
    workspace-run initial command plumbing on the host-service pane.
  - (2026-07-26) Moved `useTerminalAppearance` to the neutral renderer terminal
    library so v1 does not depend on v2 workspace UI code.
  - Automated validation: 25 focused tests pass, including adapter
    input/resize/detach, remount identity, create/kill race, cleanup routing,
    v1/host workspace identity mapping, and legacy mojibake characterization;
    full typecheck passes (35/35 tasks) and lint passes (5,355 files).
  - The user ran the required local migration/seed. The correct local desktop
    instance and its full dependency stack were then restarted for manual
    validation (`localhost:3005`, local-dev app identity; isolated DB stack on
    3014/3015; active local host-service on 48679).
  - Manual byte-path smoke passed in the mounted v1 pane: raw UTF-8 bytes
    rendered `中文:🙂`, a 200-line stream completed, window resize propagated
    PTY dimensions from `47 122` to `47 149`, workspace switch/back preserved
    the same session and scrollback, and pane close changed the durable
    terminal row from `active` to `disposed`.
  - Agent CLI launch/status validation remains Milestone 4 work; it is not
    counted as part of the completed byte-pipeline exit criterion.
- [x] (2026-07-26) Milestone 3: v1 terminal UX parity on the new runtime.
  - Added host-runtime data/exit subscriptions, durable exit information,
    connection/exit overlays, restart, server-backed clear, streamed cwd
    tracking, and persistent close cleanup registration.
  - Preserved v1 search, copy/paste, scroll-to-bottom, split/tab/workspace
    remount, workspace-run, pane title/status callbacks, and close
    confirmation/semantics. Terminal URL and file links now use the centralized
    click policy and host `statPath` lookup.
  - Fixed two lifecycle defects found by the real UI smoke: cold replay could
    leave bracketed-paste mode enabled, and a session created through a
    different host-service router instance could neither replay nor accept
    input after remount. Replay now begins with a terminal-mode reset;
    `DaemonClient` retains a bounded 64 KiB local replay window and router
    write/process checks have ownership-validated daemon fallbacks.
  - Real v1 UI evidence covered UTF-8 output, large output, PTY resize
    (`48x147` to `46x178`), search/clear/paste, exit/restart, workspace
    switch/back, cold restore, and pane close/reopen. Session rows and
    WebSocket/runtime cleanup agreed with the visible lifecycle.
- [x] (2026-07-26) Milestone 4: terminal agents and status.
  - Replaced the launcher spike with the formal host-service `agents.run`
    path. Shared launch requests now carry a typed `hostAgent`; the host route
    accepts the caller's v1 pane terminal id and launches the wrapper in that
    existing terminal.
  - Formal launch immediately records an `Attached` terminal-agent binding and
    broadcasts lifecycle state; existing CLI hooks refine working,
    permission, review, and stopped states when available. The v1 terminal
    reads host-owned bindings and exposes the terminal-native status without
    adding ACP/native transcript UI.
  - Real v1 UI launch ran the locally installed Codex TUI in the selected pane.
    The durable host row recorded the same terminal id, host workspace id,
    `codex`, and `Attached`. Missing/unconfigured agent behavior remains a
    typed, testable host-route failure rather than silently falling back to an
    unrelated command.
- [x] (2026-07-26) Milestone 5: ports, scripts, and centralized click policy.
  - v1 port data now merges host-service discovery through normalized
    workspace identity and host event invalidation. Sidebar open/kill actions
    use the centralized port-open policy.
  - Workspace run, setup, and teardown launch host-owned terminal sessions in
    the v1 tab surface. Script jobs use an `exec bash -lc` wrapper so terminal
    exit status is the script status and visible success/failure overlays are
    reliable.
  - Real v1 UI validation ran setup and teardown to exit 0, launched a Python
    server on port 41873, observed the discovered port in the v1 sidebar,
    invoked its open action, then stopped the terminal and observed the server
    become unreachable. The localhost endpoint independently returned HTTP
    200 while active. macOS handed the open action to the configured external
    browser; browser-window rendering was not used as proof of server health.
  - Final validation: 77 focused tests passed; 6 real DaemonClient PTY tests
    passed under the repository's Node runner; 20 real SQLite + PTY adoption
    tests passed under Electron's matching native-module ABI; full monorepo
    typecheck passed 35/35; desktop typecheck, lint (5,358 files), and
    `git diff --check` passed.
- [ ] Milestone 6: remove v2 workspace entry points.
- [ ] Milestone 7: delete v2 UI.

## Surprises & Discoveries

- v1 mojibake is a real architecture issue, not just a rendering glitch. The
  v1 terminal-host code documents possible UTF-8 boundary mangling
  (`session.ts:379-383`): every `PtySubprocessIpcType.Data` chunk is decoded
  with `Buffer.from(...).toString("utf8")` independently, with no
  per-session `StringDecoder`, so a multibyte character split across two
  PTY chunks becomes replacement chars. Confirmed by
  `session-byte-fidelity.test.ts`.
- v2 already has byte-fidelity tests that should be reused or mirrored for the
  fused v1 path. `packages/pty-daemon/test/byte-fidelity.test.ts` is the
  runtime canary; `no-encoding-hops.test.ts` is the source-level guard.
- v1 and v2 already share the `terminal-parking` container and the
  `@superset/shared/shell-ready-scanner` — the fusion can reuse these
  without introducing a third architecture.
- v1 `paneId === terminalId` today (the tRPC router keys everything on
  `paneId`). Milestone 1 must introduce an explicit `paneId -> terminalId`
  mapping before the backend identity diverges.
- The manual fused-pane smoke reached the correct local desktop app but not the
  v1 workspace until the user ran migration/seed for the isolated local DB.
  After that, the complete v1 UI path was testable.
- v1 and host-service workspace UUIDs are independent even when they represent
  the same checkout. Passing the v1 UUID directly caused
  `terminal.createSession` to fail with `Workspace not found`. Resolving the
  host-owned row by worktree path keeps the v1 product identity intact while
  using host-service as the runtime owner.
- Host-service router instances do not necessarily share their in-memory
  session maps. A renderer remount could subscribe through a second
  `DaemonClient`, where the daemon correctly rejected a second replay, while
  write and process checks failed before reaching the daemon. A bounded local
  replay cache plus ownership-validated daemon fallbacks preserves the
  single-daemon-session model across router instances.
- Replayed xterm bytes can include DEC mode state. Cold restore reproduced a
  case where bracketed-paste mode remained set even though the original shell
  was no longer in that mode; prefixing replay with `ESC[?2004l` makes paste
  deterministic without decoding or rewriting user output.
- A PTY script launched as `bash -lc <command>` may return to an interactive
  parent shell, leaving a lifecycle terminal apparently running after the
  script finishes. Using `exec bash -lc <command>` makes the PTY lifecycle and
  script exit code identical.
- The local Codex installation had an unrelated malformed global hooks config,
  so hook-driven status refinement could not be assumed at launch time.
  Recording `Attached` in the formal host route gives every supported CLI a
  durable baseline binding; hooks remain best-effort refinements.
- React Query publishes observer-added cache events synchronously. Mounting the
  v1 host binding query during `HostServiceTerminalPane` render therefore
  exposed an existing dock-badge subscriber that called React state
  synchronously and triggered a React 19 cross-render warning. Deferring the
  badge refresh to a microtask keeps the same cache semantics without a render
  side effect.

## Decision Log

- Decision: Keep v1 as the user-facing workspace.
  Rationale: The desired product direction is to preserve the simpler v1
  experience and remove v2 as a competing workspace surface.
  Date/Author: 2026-07-24 / Codex

- Decision: Migrate the v2 terminal backend instead of deeply repairing the old
  v1 terminal-host string path.
  Rationale: A small `StringDecoder` fix can reduce mojibake, but the clean
  solution is byte-safe PTY output end-to-end, which v2 already implements.
  Date/Author: 2026-07-24 / Codex

- Decision: Continue using terminal CLI agents.
  Rationale: The user does not want to build a native agent transcript UI for
  this migration.
  Date/Author: 2026-07-24 / Codex

- Decision: Seed terminal-agent binding in `agents.run`, before relying on CLI
  hooks.
  Rationale: Launch ownership is known synchronously, while hook availability
  is CLI- and user-config-dependent. A durable `Attached` event gives v1 a
  truthful baseline and lets hooks add richer states later.
  Date/Author: 2026-07-26 / Codex

- Decision: Reuse host-service capabilities only through v1 surfaces for
  Milestones 3–5.
  Rationale: Ports, scripts, link policy, runtime, and agent bindings improve
  reliability; importing the v2 pane registry or workspace product UI would
  violate the fusion boundary.
  Date/Author: 2026-07-26 / Codex

## Outcomes & Retrospective

Milestones 0–5 are implemented behind the `v1-host-service-terminal` feature
flag. The v1 workspace now owns the visible tab/pane lifecycle while
host-service and pty-daemon own byte-safe PTYs, reconnect/replay, agent
bindings, port discovery, and lifecycle scripts. The real UI validation used
the isolated `fusion-m3-m5` Electron instance at the v1 route, not another
running Superset checkout.

The main reliability gains were architectural rather than cosmetic: PTY output
stays binary, pane close is backend-aware, remounts reuse host sessions, agent
launch is a formal host operation, and script/port state derives from the same
runtime. v2 UI remains present and unchanged because Milestones 6 and 7 are
explicitly out of scope. The remaining release risk is feature-flag rollout
and broader cross-machine CLI/browser-default coverage, not a known missing
M3–M5 product path.

One unrelated pre-existing integration discrepancy remains outside this diff:
`DaemonSupervisor.node-test.ts` expects automatic daemon update to defer while
live sessions exist, while `DaemonSupervisor.ts` explicitly documents and
implements non-destructive fd-handoff for live sessions. The combined suite
therefore reports 17/18 even though every DaemonClient test passes. This plan
does not silently reinterpret that baseline mismatch as an M3–M5 failure or
change daemon update policy as part of terminal fusion.

On 2026-07-28 this terminal layer was joined to the feature-flagged
v1-shell/`@superset/panes` base. The panes host now supplies its persisted
backend terminal id and an explicit state/lifecycle bridge, while the mosaic
host retains its existing tabs-store behavior. This preserves all M0–M5 paths
without making the neutral terminal component depend directly on the panes
package; details and follow-on milestones live in
`plans/20260726-v1-shell-v2-base-fusion.md`.
