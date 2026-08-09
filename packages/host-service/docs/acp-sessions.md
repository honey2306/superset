# ACP Sessions

This is the current implementation reference for host-owned ACP sessions. The
active remaining work is tracked in
[`plans/acp-session-follow-ups.md`](../../../plans/acp-session-follow-ups.md).

## Current Topology

```text
desktop UI (V1PanesWorkspace → AcpSessionPane)
  -> DesktopAcpSessionClient (renderer/lib/acp-session-client)
  -> host-service acpSessions tRPC router + /acp-sessions/:id/stream
  -> AcpDaemonClient over a per-org owner-only Unix socket
  -> detached acp-daemon (survives host-service/Desktop restarts)
  -> AcpSessionManager
  -> one selected adapter child per active session
       Claude Code -> claude-agent-acp
       Codex       -> bundled codex app-server bridge
       Pi          -> bundled pi-acp bridge
       MyFlicker   -> mfcli acp
  -> each agent's native on-disk session store

shared client code today
  @superset/session-protocol
    - ACP type re-exports
    - Superset state and envelope types
    - tRPC input schemas and API interfaces
    - timeline fold and WebSocket sync client
    - React hooks under ./react
```

The desktop app enables the harness on canary and dev builds via
`SUPERSET_ACP_SESSIONS=1` (see `apps/desktop/src/main/lib/build-channel.ts`).
Stable builds never do. There is no user-facing setting. The desktop renders
the ACP session UI when `acpSessions.list` returns `enabled: true`.

**Close semantics**: closing an ACP pane in the desktop only detaches the UI
(unregisters the pane from the layout). It does NOT delete or suspend the
underlying session, runtime, or native transcript. The adapter process continues to be managed by the detached ACP daemon until
the process exits or the daemon is explicitly stopped.

**Known lifecycle gap**: there is currently no suspend/forget/delete operation
for ACP sessions. `pane close ≠ session delete`. A bounded suspend/forget
design must be documented and implemented before the stable channel is enabled.

## Session Identity And Persistence

The public Superset session id is different from the adapter's native ACP
session id. The host database stores the binding in `acp_sessions`:

```text
session_id (primary key)
workspace_id
acp_session_id
harness
cwd
title
last_stop_reason
created_at
updated_at
```

The row is registry metadata only. Host SQLite does not store message bodies,
tool payloads, permission payloads, or journal frames. Conversation content remains in the selected agent's native session store; the
adapter owns its session-id mapping and load behavior.

Every state emission best-effort upserts the registry row. A registry write
failure is logged and does not stop a live turn, so restart recovery is not
guaranteed if the write failed.

## Lifecycle

### Create

1. The client mints the public session id and calls `acpSessions.create`.
2. The ACP daemon resolves the workspace id to its current worktree path.
3. `AcpSessionManager` spawns the selected session adapter, runs `initialize`,
   then `session/new`.
4. The host forces a newly created session out of the adapter's default
   `bypassPermissions` mode.
5. The initial state frame enters the in-memory journal and the registry row is
   written.

Create is idempotent for the same public session and workspace. Reusing a
session id with a different workspace is a conflict.

### Host Or Desktop Restart

The detached per-organization ACP daemon owns the manager, adapter stdio,
journal, in-flight turn promises, and pending permission callbacks. Restarting
the host-service or Desktop disconnects only the transport client. The next
host adopts the existing daemon socket, and stream subscriptions resume from
their epoch/sequence cursor. Active turns and permission requests continue.

Every connection performs a `hello` handshake containing the daemon protocol,
exact bundle identity, PID, and active interaction count. An idle stale daemon is
replaced automatically. A daemon with a running turn, Permission, or AskUser
callback is retained until the interaction finishes so an update cannot destroy
its resolver. Unknown protocol operations fail explicitly. Normal host/Desktop
shutdown only disconnects; **Quit Completely** sends a forced daemon shutdown.
Unix sockets are owner-only (`0600`), while Windows uses an organization-scoped
named pipe.

### ACP Daemon Restart

If the ACP daemon itself exits, a new daemon reads all `acp_sessions` rows into
an `offline` map. `list` and `get` expose them without spawning a process; a
command, `getMessages`, or stream attach calls `ensureLive`, which starts the
correct adapter and invokes `session/load` with the persisted native id and cwd.
Completed transcript content is recovered, but a turn or permission callback
that was live when the daemon died cannot be reconstructed. Open replayed tool
calls are terminalized.

`session/load` failure leaves the registry row offline and retryable. The stream
route emits `reset { reason: "session_load_failed" }`; tRPC calls surface the
load error. Clients must not silently create a replacement session.

### Adapter Exit

An adapter exit marks the runtime `dead`, resolves pending interactions as
cancelled, terminalizes open tool calls, and emits final state. Dead runtimes
remain readable in memory, with at most 20 retained per daemon process. Their
registry rows remain. A dead runtime is not restarted in the same daemon process;
after a daemon restart its registry row is offline and can be loaded again.

There is no session delete or registry garbage collection path yet.

## Memory And History

Each active runtime holds:

- mutable session state;
- the adapter child and ACP connection;
- pending permission resolvers and open tool ids;
- subscribers;
- a ring journal capped at 5,000 envelopes.

The host does not hold a separate folded message list. The ring is bounded, so
memory does not grow for the full lifetime of an arbitrarily long session.
However, the current design still gives the ring two jobs:

1. recent WebSocket catch-up with `?since=<seq>`;
2. `getMessages` history pagination.

That second job is the remaining design problem. ACP `session/load` replays the
entire native transcript but exposes no paginated history API. The ring retains
only its newest 5,000 frames, so history older than the retained window cannot
be fetched. Shrinking the ring now would reduce available history rather than
move older pages to disk.

The target design is explicit in the follow-up plan: `getMessages` pages a
disk-backed history source, while the in-memory ring keeps only a small recent
catch-up window. The React layer should retain only pages the user has loaded
plus a bounded live-event buffer.

## Stream Contract

Every envelope has a per-runtime numeric sequence:

```ts
interface SessionUpdateEnvelope {
  seq: number;
  sessionId: string;
  ts: number;
  frame: SessionUpdateFrame;
}
```

Within one runtime incarnation, sequences are gapless. A subscriber resumes
from `since`; the server replays `(since, latest]`, then attaches the live
listener synchronously. Duplicate sequences are ignored by the client. A gap
causes reconnect. An evicted cursor causes `journal_evicted` reset and a full
state/history resync.

An ACP daemon restart creates a fresh numeric sequence space. The protocol does not
yet carry a journal incarnation id, so a pre-restart cursor whose number
overlaps the rebuilt journal is not always distinguishable from a current
cursor. Epoch-aware cursors are required before restart recovery can claim a
complete stale-cursor guarantee.

## Type And Validation Status

The answer to "is every boundary strictly typed and Zod-validated?" is no.

Compile-time typing is mostly strict:

- host, shared sync code, and mobile consume the same ACP and Superset types;
- production ACP code has no intentional `any`;
- official ACP extension fields such as `_meta`, `rawInput`, and `rawOutput`
  remain `unknown` by protocol design.

Runtime validation is incomplete:

| Boundary | Current validation |
| --- | --- |
| tRPC inputs | Zod validates ids, cursors, limits, modes, and scalar config values. ACP content blocks and permission outcomes use shallow `z.custom` checks. |
| Adapter requests and notifications | The official ACP SDK parses registered request/notification params. |
| Adapter responses | Trusted from the SDK connection; response payloads are not parsed again by Superset. |
| Relay HTTP outputs | The outer tRPC/SuperJSON envelope is checked shallowly, then asserted to the caller's generic output type. |
| WebSocket envelopes | JSON syntax plus `seq` and `frame.kind` are checked; nested frame payloads are not fully parsed. |
| SQLite registry rows | Typed by Drizzle at compile time; no Zod parse or SQL enum checks on read. |

The ACP SDK ships JSON Schema but does not export its generated Zod modules.
The follow-up work must provide canonical Superset validators for every authored
state/frame/page shape and a deliberate strategy for ACP payload validation.

## Feature Gate

The feature is internal-channel only. The desktop coordinator starts the host
with `SUPERSET_ACP_SESSIONS=1` on canary and dev builds
(`isInternalBuild()` in `apps/desktop/src/main/lib/build-channel.ts`); stable
builds never set it and there is no user-facing setting.

- When off, the WebSocket route is not mounted.
- Every ACP tRPC procedure except `list` rejects with
  `PRECONDITION_FAILED`.
- `list` returns `{ items: [], nextCursor: null, enabled: false }`, which is the
  mobile capability probe.

## Test Coverage

### Authenticated real-Claude lane: primary evidence

The `ACP_E2E=1` suites are the primary acceptance evidence for the ACP/model
boundary. Nothing at that boundary is mocked: they use the machine's logged-in
Claude account, a real Sonnet model, the pinned `claude-agent-acp` executable,
real ACP JSON-RPC over stdio, `AcpSessionManager`, and the real WebSocket
route/client. They are skipped in ordinary CI only because CI does not have a
Claude login and the runs spend real tokens; the skip does not make them
optional after relevant local changes.

Run both suites on an authenticated Mac whenever changing the ACP runtime,
adapter or SDK version, Workflow handling, permissions, questions,
cancellation, streaming, reconnect, sequencing, or resurrection:

```bash
cd packages/host-service
ACP_E2E=1 ACP_E2E_MODEL=sonnet ACP_E2E_EFFORT=low \
  bun test \
    test/integration/acp-sessions.integration.test.ts \
    test/integration/acp-sessions-stream.integration.test.ts
```

The manager suite proves real initialize/create/prompt/fold behavior, a saved
multi-agent Workflow, `AskUserQuestion`, real tool permissions, cancellation,
duplicate permission resolution, parallel tool use, and adapter death. The
Workflow test does not stop at the asynchronous launch acknowledgement: it
waits for the persisted Workflow run to reach `completed`, then asserts five
real Sonnet agents, non-zero token and tool usage, two parallel audits, and the
final structured verdict.

The stream suite puts the same real adapter/model behind the real WebSocket
route and sync client. It proves identical gapless delivery to concurrent
subscribers, mid-turn disconnect/cursor reconnect without gaps or duplicates,
and eviction reset followed by a clean reattach.

With `claude-agent-acp` 0.56.0, Claude emits two parallel tool uses together but
the adapter exposes their permission callbacks to Superset one at a time. The
manager and mobile stack still support truly simultaneous pending requests;
that manager behavior is pinned by the deterministic backup lane below.

### Deterministic lane: belt and suspenders

The always-run deterministic tests provide cheap breadth and precise failure
injection, but they do not prove real Claude or real-adapter compatibility. They
cover the journal, fold, reconnect client, generic host transport, router
mapping, fake-adapter ACP flow, WebSocket fan-out, permissions, elicitations,
concurrent permission requests, cancellation, adapter crash, eviction resets,
and registry-based manager resurrection. `acp-daemon.e2e.test.ts` additionally
runs the bundled daemon with the production `better-sqlite3` driver and fake ACP
adapter, disconnects and replaces the host client while Permission and AskUser
are pending, then proves both requests remain actionable on the same daemon PID.
It also pins shutdown draining and rejection of unsupported protocol operations.

`acp-host-client.e2e.test.ts` also starts the real `createApp` HTTP/tRPC host
behind a local relay-shaped prefix and drives it only through
`@superset/host-client` plus the real WebSocket sync client. It closes the host,
server, adapter children, and an on-disk SQLite registry. Before restart it
answers an `AskUserQuestion` form, cancels an in-flight tool, handles two
simultaneous permissions, and catches up a disconnected stream. It then reopens
the DB, proves offline listing and `session/load` resurrection, and deletes a
native transcript to pin both the tRPC error and `session_load_failed` stream
reset.

The mobile presentation helper has a colocated test that pins the corresponding
load-failure UX: the offline session cannot compose, the empty state says
`Session could not be resumed`, and the explanatory copy identifies the missing
native transcript. A full-device Maestro scenario is still required.

Still required before treating the boundary as production-hardened:

- a separate host OS process kill/respawn while the ACP daemon and an in-flight
  turn remain alive, followed by cursor-based stream reattachment;
- stale cursors across journal incarnations;
- prompt/permission/cancel/config races;
- slow-subscriber and retention limits;
- a secure automated runner for the authenticated real-Claude lane, if CI can
  provide isolated credentials and explicit usage accounting;
- iOS Maestro flows for restart, background/reconnect, pagination, and failures.

## Source Map

- Runtime and daemon protocol: `packages/host-service/src/runtime/acp-sessions/`
- Detached daemon entry: `packages/host-service/src/runtime/acp-sessions/daemon-entry.ts`
- Router: `packages/host-service/src/trpc/router/acp-sessions/`
- Host DB table: `packages/host-service/src/db/schema.ts`
- Shared contracts/sync/hooks: `packages/session-protocol/`
- Shared relay transport: `packages/host-client/`
- Mobile binding: `apps/mobile/lib/host/client.ts`
- Mobile UI: `apps/mobile/screens/(authenticated)/workspace/[id]/chat/acp/`
- Mobile resume-failure presentation test:
  `apps/mobile/screens/(authenticated)/workspace/[id]/chat/acp/[sessionId]/components/SessionThread/utils/getSessionThreadPresentation/`
- Focused integration plan: `plans/host-integration-test.md`
- All remaining work: `plans/acp-session-follow-ups.md`
