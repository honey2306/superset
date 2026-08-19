# ACP Sessions

This is the current implementation reference for host-owned ACP sessions. The
active remaining work is tracked in
[`plans/acp-session-follow-ups.md`](../../../plans/acp-session-follow-ups.md).

## Current Topology

```text
desktop UI (PanesWorkspace → AcpSessionPane)
  -> renderer ACP session client
  -> Embedded Host acpSessions tRPC router + /acp-sessions/:id/stream
  -> AcpDaemonClient over an owner-only local Unix socket
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
    - agent-independent Tool Call Projection for every renderer
    - React hooks under ./react
```

Every desktop build enables the runtime via `SUPERSET_ACP_SESSIONS=1`. The
desktop renders the ACP session UI when `acpSessions.list` returns
`enabled: true`. The user-facing preset setting controls whether supported
agent presets launch through ACP; it does not enable or disable the runtime.

**Detach and close semantics**: renderer teardown, workspace switching, and a
temporary pane-view detach only release the UI subscription. They do not stop
the daemon-owned adapter or active interaction. The user-facing **Close agent
session** action is explicit and permanent: `Panes` calls `acpSessions.close`,
the Host removes the recoverable session rows, and the daemon tears down the
adapter. Closing a whole `Panes` tab applies the same close operation to its ACP
panes. A failed close leaves the pane visible so the user can retry.

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
tool payloads, permission payloads, or journal frames. Conversation content
remains in the selected agent's native session store; the adapter owns its
session-id mapping and load behavior. Explicit close removes the registry row
and associated recoverable Host metadata, but does not promise deletion of an
agent vendor's independent native transcript store.

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

The detached local ACP daemon owns the manager, adapter stdio, journal,
in-flight turn promises, and pending permission callbacks. Restarting
the host-service or Desktop disconnects only the transport client. The next
host adopts the existing daemon socket, and stream subscriptions resume from
their epoch/sequence cursor. Active turns and permission requests continue.

Every connection performs a `hello` handshake containing the daemon protocol,
exact bundle identity, PID, and active interaction count. An idle stale daemon is
replaced automatically. A daemon with a running turn, Permission, or AskUser
callback is retained until the interaction finishes so an update cannot destroy
its resolver. Unknown protocol operations fail explicitly. Normal host/Desktop
shutdown only disconnects; **Quit Completely** sends a forced daemon shutdown.
Unix sockets are owner-only (`0600`), while Windows uses a local
application-scoped named pipe.

### ACP Daemon Restart

If the ACP daemon itself exits, a new daemon reads all `acp_sessions` rows into
an `offline` map. `list`, `get`, and `getMessages` are passive durable reads:
they never spawn an adapter. A command or stream attach calls `ensureLive`,
which starts the correct adapter and invokes `session/load` with the persisted
native id and cwd.
Completed transcript content is recovered, but a turn or permission callback
that was live when the daemon died cannot be reconstructed. Open replayed tool
calls are terminalized.

If `session/load` reports the protocol-defined resource-not-found error, the
manager discards the entire failed adapter process and ACP connection before
spawning a fresh adapter and issuing `session/new`. It then rebinds the registry
row to that fresh native id while retaining Superset's durable transcript. It
must not issue `session/new` on the failed connection: adapters may have already
destroyed their underlying native input stream. Other load failures leave the
registry row offline and retryable; the stream route emits
`reset { reason: "session_load_failed" }` and tRPC calls surface the error.

### Adapter Exit

An adapter exit marks the runtime `dead`, resolves pending interactions as
cancelled, terminalizes open tool calls, and emits final state. Dead runtimes
remain readable in memory, with at most 20 retained per daemon process. Their
registry rows remain. A dead runtime is not restarted in the same daemon process;
after a daemon restart its registry row is offline and can be loaded again.

The dead runtime and registry row remain available until the user explicitly
closes the ACP session. Explicit close removes the durable row and prevents
later resurrection.

## Memory And History

Each active runtime holds:

- mutable session state;
- the adapter child and ACP connection;
- pending permission resolvers and open tool ids;
- subscribers;
- a ring journal capped at 5,000 envelopes.

The host does not hold a separate folded message list. Clients fold ACP frames
through `@superset/session-protocol`; that fold also creates the Tool Call
Projection with required `kind`, `status`, `title`, and `locations` fields.
Renderers consume those fields directly instead of interpreting adapter-specific
`rawInput` or `_meta`. The ring is bounded, so memory does not grow for the full
lifetime of an arbitrarily long session.

Oversized inline images in adapter `rawOutput` are content-addressed under the
organization's host data directory before an envelope enters the journal. The
journal keeps a session-scoped artifact reference (SHA-256, MIME type, byte
size, and file locator) instead of duplicating base64 data; closing the session
removes its artifact directory. History responses are additionally capped by
serialized byte size, and daemon subscription replay pauses on socket
backpressure and resumes from the last accepted sequence.

On the first daemon start after this storage format is introduced, legacy
`acp_session_journal` image payloads are compacted before the daemon accepts
connections. Each session is updated atomically; malformed frames are left as
they are. A successful full pass records an owner-only completion marker at
`acp-artifacts/historical-journal-compaction-v1.json`, so normal daemon starts
do not rescan the complete journal. Restoring an older host database into the
same data directory requires deleting that marker before starting the daemon,
which safely reruns the idempotent pass.

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

### Semantic transcript reads

The user-facing history surface is `acpSessions.getTranscript`, not the raw
`getMessages` envelope cursor. A transcript page contains complete turns (from
one `user_message_chunk` start through the envelope before the next user
message), an `index` of lightweight turn summaries, and `totalTurns`. The
initial page contains the newest turns; older pages use `t<turn-number>`
cursors. The rail can request an individual unloaded turn with `targetTurn`.
Raw `getMessages` remains available to protocol/debug tooling and for stream
catch-up compatibility, but Desktop does not expose its event page numbers.

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

- Host, shared sync code, Desktop, and the experimental phone client consume
  the same ACP and Superset types;
- production ACP code has no intentional `any`;
- official ACP extension fields such as `_meta`, `rawInput`, and `rawOutput`
  remain `unknown` by protocol design.

Runtime validation is incomplete:

| Boundary | Current validation |
| --- | --- |
| tRPC inputs | Zod validates ids, cursors, limits, modes, and scalar config values. ACP content blocks and permission outcomes use shallow `z.custom` checks. |
| Adapter requests and notifications | The official ACP SDK parses registered request/notification params. |
| Adapter responses | Trusted from the SDK connection; response payloads are not parsed again by Superset. |
| Direct Host HTTP outputs | The outer tRPC/SuperJSON envelope is checked shallowly, then asserted to the caller's generic output type. |
| WebSocket envelopes | JSON syntax plus `seq` and `frame.kind` are checked; nested frame payloads are not fully parsed. |
| SQLite registry rows | Typed by Drizzle at compile time; no Zod parse or SQL enum checks on read. |

The ACP SDK ships JSON Schema but does not export its generated Zod modules.
The follow-up work must provide canonical Superset validators for every authored
state/frame/page shape and a deliberate strategy for ACP payload validation.

## Host capability switch

The desktop coordinator starts every desktop host with
`SUPERSET_ACP_SESSIONS=1`. This is intentionally independent from build
channel and from the user-facing preset launch preference: ACP is a core
desktop runtime, while the preference only chooses ACP versus terminal when a
supported agent preset is opened.

- Standalone and test hosts may omit the capability. When off, the WebSocket
  route is not mounted.
- Every ACP tRPC procedure except `list` rejects with
  `PRECONDITION_FAILED`.
- `list` returns `{ items: [], nextCursor: null, enabled: false }`, which is the
  phone capability probe.

## Browser Use MCP

The ACP daemon discovers the local Browser Use CLI once at startup and passes
the same stdio MCP declaration to both `session/new` and `session/load`. This
keeps the browser tool surface consistent across fresh and resumed sessions.
Claude and MyFlicker consume the ACP declaration directly, and the bundled
Codex bridge translates it to app-server's per-thread `config.mcp_servers`
shape. The pinned Pi ACP bridge does not natively forward MCP declarations, so
Superset materializes an owner-only per-session config and loads a bundled Pi
extension that exposes the same stdio MCP tools directly. The temporary config
is removed after extension startup and never mutates user or project MCP files.

By default, Browser Use is enabled only when an executable `browser-use` is
already present on `PATH`; startup never downloads it implicitly. Set
`SUPERSET_BROWSER_USE_MCP=0` to disable it, `=1` to allow `uvx` as a fallback,
or `=uvx` to force `uvx browser-use@latest --cli-mcp`. Browser Use currently
exposes `browser_exec` and `browser_screenshot` through this MCP server and
connects to the user's local Chrome/CDP session unless configured otherwise.

Superset also injects a bundled, session-scoped MCP server for conversation
handoff and multi-agent coordination. Its contract and security boundaries are
documented in [superset-acp-tools.md](./superset-acp-tools.md).

## ACP CLI updates

The detached ACP daemon schedules the native self-updaters for the external
Claude Code (`claude update`), Codex (`codex update`), Pi (`pi update self`), and
MyFlicker (`mfcli update`) CLIs for 02:00 local time every day. One failed or
unavailable CLI does not prevent the others from updating. Claude Code and
MyFlicker use the same resolved executables as ACP session launches, so
version-manager and Homebrew/NVM paths remain consistent. When an external
Claude Code executable is unavailable, `claude-agent-acp` falls back to the
Claude binary bundled with its SDK. The timer is unreferenced and is disposed
with the daemon; if the computer sleeps through 02:00, Node runs the overdue
timer after wake. Existing sessions
keep running their already-loaded version, while new sessions use the update.

Bundled bridges (`claude-agent-acp`, `pi-acp`, and the Codex adapter) remain
pinned build artifacts and are updated through a Superset Desktop release
rather than mutating packaged application files at runtime. The nightly task
updates the external agent CLI behind a bridge, not the packaged bridge itself.

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
manager and phone stack still support truly simultaneous pending requests;
that manager behavior is pinned by the deterministic backup lane below.

### Deterministic lane: belt and suspenders

The always-run deterministic tests provide cheap breadth and precise failure
injection, but they do not prove real Claude or real-adapter compatibility. They
cover the journal, fold, reconnect client, generic host transport, router
mapping, fake-adapter ACP flow, WebSocket fan-out, permissions, elicitations,
concurrent permission requests, cancellation, adapter crash, eviction resets,
and registry-based manager resurrection. `acp-daemon.e2e.test.ts` additionally
runs the bundled daemon with the production `better-sqlite3` driver and fake ACP
adapter, disconnects and replaces the Host connection while Permission and
AskUser are pending, then proves both requests remain actionable on the same
daemon PID.
It also pins shutdown draining and rejection of unsupported protocol operations.

`acp-sessions-persistence.e2e.test.ts` uses the real Host database migrations,
a direct local WebSocket route, and a fake adapter to prove offline listing,
`session/load` resurrection, idempotent create after restart, and explicit
load-failure behavior without any hosted transport.

### Delegation handoffs

The host stores each `delegate` tool invocation in `delegation_runs`, separate
from the ACP transcript. A row retains the self-contained handoff, parent and
child session/workspace ids, selected runtime identity, and its
`creating` → `running` → `completed`/`failed` lifecycle. On daemon startup,
active rows are reconciled against the restored child session; subsequent child
state changes finish the row after a restart. Delegation is gated by the Host
setting, but its child always inherits the initiating ACP tab's harness and
concrete selected model; saved global executor agent/model columns are legacy
data and are not read at runtime. This table is defined in the Host Drizzle
schema. Generate its migration with:

```bash
bun run --cwd packages/host-service generate
```

Do not hand-author files under `packages/host-service/drizzle/`.

Still required before treating the boundary as production-hardened:

- a separate host OS process kill/respawn while the ACP daemon and an in-flight
  turn remain alive, followed by cursor-based stream reattachment;
- stale cursors across journal incarnations;
- prompt/permission/cancel/config races;
- slow-subscriber and retention limits;
- a secure automated runner for the authenticated real-Claude lane, if CI can
  provide isolated credentials and explicit usage accounting;
- paired-phone flows for restart, background/reconnect, pagination, and failures.

## Source Map

- Runtime and daemon protocol: `packages/host-service/src/runtime/acp-sessions/`
- Detached daemon entry: `packages/host-service/src/runtime/acp-sessions/daemon-entry.ts`
- Router: `packages/host-service/src/trpc/router/acp-sessions/`
- Host DB table: `packages/host-service/src/db/schema.ts`
- Shared contracts/sync/hooks: `packages/session-protocol/`
- All remaining work: `plans/acp-session-follow-ups.md`
