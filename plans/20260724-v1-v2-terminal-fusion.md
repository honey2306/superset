# V1/V2 Desktop Fusion Plan

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
- [ ] Milestone 0: Baseline audit and safety tests.
- [ ] Milestone 1: v1 terminal backend adapter.
- [ ] Milestone 2: byte-safe v1 terminal output.
- [ ] Milestone 3: v1 terminal UX parity on new runtime.
- [ ] Milestone 4: terminal agents and status.
- [ ] Milestone 5: ports, run scripts, click policy.
- [ ] Milestone 6: remove v2 workspace entry points.
- [ ] Milestone 7: delete v2 UI.

## Surprises & Discoveries

- v1 mojibake is a real architecture issue, not just a rendering glitch. The
  v1 terminal-host code documents possible UTF-8 boundary mangling.
- v2 already has byte-fidelity tests that should be reused or mirrored for the
  fused v1 path.

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

## Outcomes & Retrospective

To be filled after implementation.
