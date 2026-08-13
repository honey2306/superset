# ACP Session Follow-ups

Status: **active**. Current behavior is documented in
`packages/host-service/docs/acp-sessions.md`. This plan only tracks work that
remains valid for the embedded, local-first Host architecture.

## Decisions

1. The in-memory journal is a bounded delivery/catch-up buffer, not long-term
   history.
2. Older history pages come from Host-owned disk storage. Message content is not
   uploaded to a cloud service.
3. Desktop clients use the direct embedded-Host transport. Phone clients use the
   same Host contract over a paired LAN/Tailscale session.
4. Replace the mixed `@superset/session-protocol` package with
   `@superset/host-service-sync` and `@superset/host-service-react`; do not add a
   third protocol package.
5. Runtime data crossing a process, network, persistence, or untyped JSON
   boundary must be parsed rather than asserted.
6. Authenticated real-adapter tests are primary acceptance evidence for the
   model boundary. Deterministic fake-adapter tests remain the always-run
   failure-injection lane.

## P0: Disk-backed history and bounded catch-up

- [ ] Define a Host-owned `SessionHistoryStore` with append,
  replace-from-native-replay, and newest-first page operations.
- [ ] Document retention, permissions, deletion, and corruption recovery before
  storing message/tool payloads in SQLite or another Host-owned file.
- [ ] During `session/load`, write replay into a temporary generation and swap it
  atomically only after success.
- [ ] Keep only a measured event/byte window in `SessionJournal`.
- [ ] Make `getMessages` page the history store, never the journal.
- [ ] Add a journal incarnation id to state, stream cursors, and history cursors.
- [ ] Bound replay staging and the client's live overlay.

Acceptance: a transcript larger than every memory cap can page to its first
message after Host restart; failed replay does not expose partial history; stale
cursors reset by incarnation; no message content leaves the Host.

## P1: Strict runtime contracts

- [ ] Put canonical Zod schemas for Superset-authored state, frame, envelope,
  cursor, and page shapes in `@superset/host-service-sync`.
- [ ] Replace shallow `z.custom` schemas with explicit supported ACP unions.
- [ ] Parse all named Host client outputs and complete WebSocket envelopes.
- [ ] Enforce expected `sessionId`, safe sequences/timestamps, and known
  discriminants before folding.
- [ ] Parse adapter responses and persisted registry rows.
- [ ] Add malformed input/output/frame/row tests for every trust boundary.

Acceptance: no child-process, HTTP/WebSocket, JSON, or SQLite payload reaches
business logic through an unchecked assertion.

## P2: Real Host process E2E

Completed coverage starts the real `createApp` Host on an ephemeral direct port,
drives named operations through `@superset/host-client`, uses a temporary
on-disk registry, and proves permissions, questions, cancellation, cursor
reconnect, resurrection, replay, and load-error propagation.

Remaining:

- [ ] Move restart into a separate OS Host process and prove kill/respawn.
- [ ] Run a Node lane with production `better-sqlite3`, not only `bun:sqlite`.
- [ ] Add a direct paired-phone authentication case over a non-loopback test
  address; no Relay or remote-host directory is involved.
- [ ] Keep tests package-boundary-safe: assertions must use public Host/client
  contracts rather than manager internals.

## P3: Package split and client state

Target ownership:

```text
@superset/host-client
  direct HTTP/WebSocket transport, auth retry, named Host clients

@superset/host-service-sync
  wire types, validators, cursors, pure reducer, reconnect/dedup/reset,
  framework-free per-session store

@superset/host-service-react
  React hooks/selectors and lifecycle/GC bindings
```

- [ ] Split non-React and React code from `@superset/session-protocol`.
- [ ] Provide one vanilla store per open session so multiple consumers share one
  socket and converge.
- [ ] Keep sockets, promises, and callbacks out of serializable state.
- [ ] Retain loaded history pages plus a bounded live overlay.
- [ ] Keep Desktop pane layout and phone navigation outside the shared store.
- [ ] Delete `@superset/session-protocol` after migration without indefinite
  compatibility re-exports.

## P4: Registry lifecycle

- [ ] Add explicit delete/forget semantics and history-store cleanup.
- [ ] Remove or quarantine rows whose Workspace no longer exists.
- [ ] Define retention for abandoned, load-failed, and dead sessions.
- [ ] Validate cwd/Workspace ownership on every resurrection.
- [ ] Add another harness only through an adapter registry with explicit
  resume/history capabilities.

## Required edge cases

- Host exits while idle, streaming, awaiting permission, and persisting.
- Duplicate, missing, out-of-order, malformed, wrong-session, and unknown
  frames.
- Journal eviction, slow subscriber, reconnect, and stale-incarnation cursors.
- Prompt/permission/cancel/config races from two direct clients.
- Workspace deletion or movement before resurrection.
- Pairing expiration, phone-session revocation, and reconnect over LAN/Tailscale.
- Auth tokens absent from logs, errors, persisted rows, and snapshots.
- History retention/deletion proving removed content is absent.
