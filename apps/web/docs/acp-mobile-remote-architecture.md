# ACP-only mobile remote

This document describes the first phone vertical slice. It intentionally
does not define a remote PTY or terminal-byte protocol.

## Current slice

```text
phone ACP UI
  ├─ tRPC commands/reads + ACP stream
  └─ AutoMate relay fallback (HTTP mailbox pull/push/ack)
       ↕
Mac Host ACP session manager (authoritative state + journal)
       ↕
local ACP adapter (Claude/Codex/Pi/...)
```

The Host owns session state, journal history, adapter lifecycle, permissions,
and command idempotency. The phone and relay only transport commands and
updates. `prompt`, `enqueuePrompt`, and `sendNow` carry a phone-generated
`commandId`; the phone stores an outbox entry by host/session before sending,
keeps it on transport failure, and removes it only after admission is
confirmed. A recreated client drains one session scope at a time.

## Recovery semantics

### Durable queued commands

`prompt`, `enqueuePrompt`, and `sendNow` are journaled as Host-owned `remote_command`
frames. In the production SQLite persistence path, the command reservation and
initial `queued` frame are committed in one transaction before the admission
acknowledgement; a journal failure therefore cannot leave a permanently
reserved command with no recoverable payload.
the drain path writes `started`, then journals each user message chunk with the
same `commandId`, and finally writes `finished` after the ACP request is
admitted. Queue removal, clear, and `sendNow` supersession write terminal
`finished` outcomes, so an old command cannot reappear after restart.

On Host startup/resurrection, the complete durable journal is replayed. A
`queued` command is restored in FIFO order, while a `started` command is
restored only when no matching command-tagged user update exists. That closes
the reservation→Host-admission crash window without normally re-sending an
already-visible prompt. Restored immediate commands run before the ordered
queue once the runtime is registered. Legacy queue entries without a
`commandId` remain process-local and are intentionally not recovered.

The command-tagged user update is the durable Host admission marker, not a
provider acknowledgement: ACP does not accept Superset's `commandId`. A
process kill in the tiny interval between writing that marker and the adapter
receiving the request is therefore inherently ambiguous. Phase 1 favors not
duplicating a potentially dispatched agent turn; end-to-end exactly-once Agent
execution is not claimed without upstream ACP idempotency support.

- `sessionVersion` is represented by the Host journal `epoch`; `eventId` is the
  journal envelope `seq`. A cursor is valid only for the matching epoch.
- A stream duplicate (`seq <= lastSeq`) is ignored.
- A stream gap is terminal for that subscription: it emits
  `onReset("sequence_gap")` once and does not reconnect with the stale cursor.
  The client then fetches `get` plus the newest history snapshot and creates a
  new subscription from the snapshot cursor.
- A `reset` frame, epoch mismatch, host restart, and phone hidden→visible
  transition use the same snapshot-first resync path.
- The relay pull pump pauses while the browser is hidden and starts again on a
  visible transition. Direct same-origin transport is unchanged.
- Pairing redemption now accepts a phone-generated `redeemNonce`. The phone
  persists `code → redeemNonce` before its first request, retries the same
  nonce behind a bounded 15 s timeout (up to three attempts), and clears the
  record only after a successful response. The nonce record never contains a
  bearer or AutoMate task token.
- For a nonce-bearing request, the Host derives the raw 32-byte token and UUID
  session ID from `code + nonce` with domain-separated SHA-256. The database
  still stores only the token hash. A same-nonce retry returns the same active,
  unrevoked session even when its first response was lost; a different nonce
  receives the normal invalid/expired response and cannot delete the winner.
- Pairing persistence, concurrent redemption, and timeout retry are covered by
  isolated tests in this repository. AutoMate delivery and long-tail behavior
  are not thereby verified. The WebApp build now calls same-origin
  `/api/task/16740/run` with `{type: "api", relay: input}`; task `16740` calls
  task `16739` through `am.runTask` server-side and unwraps only its `result`,
  discarding AutoMate invocation logs/session metadata. The generated browser
  task is checked for the absence of the task URL, task header, and legacy Vite
  credential configuration. Isolated AutoMate task `17246` verified the real
  cross-task wrapper shape. Production WebApp `16740` was then deployed and a
  cache-busted browser check verified the new bundle and a real proxy `pull`
  returning `{ok:true, empty:true}`. Pairing and resume URLs carry `v=acp3` so
  existing phones do not reuse the pre-proxy bundle from their document cache.

## Facts, assumptions, and open platform checks

Verified in this repository and isolated tests:

- AutoMate is the only phone public relay; this client uses the existing
  push/pull/ack fallback and does not assume a WebSocket Drain endpoint.
- `get` is a current session snapshot and `getMessages`/`getTranscript` are
  journal/history reads. The Host journal is gapless within an epoch until
  retention/compaction removes bodies.
- Relay idle pull is intentionally 500 ms in the existing fallback. The phone
  surface does not call terminal or terminal-agent procedures.
- The Host command table has `(sessionId, commandId)` uniqueness. Prompt,
  enqueue, and send-now retries are admitted at most once while the command
  reservation is present; enqueue queue IDs are stable command IDs.
- The durable payload/replay guarantee covers `prompt`, `enqueuePrompt`, and
  `sendNow`. A direct prompt interrupted before its command-tagged user frame
  is recovered through the same immediate-command slot as `sendNow`.
- Nonce-bearing pairing idempotency, revoked/expired session rejection, and
  loser cleanup are verified with the local Host SQLite fixture. This does not
  verify the behavior of the production AutoMate task.

Assumptions used for this slice:

- One active phone control surface per Host is sufficient for phase 1.
- Durable queued prompt payloads and their lifecycle now live in the existing
  `acp_session_journal`; no schema or migration change is needed. The
  journal remains the authoritative recovery source, while the command table
  continues to provide uniqueness/idempotency. Legacy commands without a
  `commandId` remain intentionally process-local.
- Incremental updates may be coalesced by the UI at roughly 250–500 ms; state,
  permission, completion, and error transitions remain immediate.

Not yet verified against AutoMate platform behavior:

- The credential-free task-16740 proxy contract is implemented locally and
  covered by browser-client/build-output tests. Isolated task `17246` verified
  that `am.runTask(16739, input)` succeeds without exposing a 16739 token and
  returns `{status, error, result, session, logs}`; the generated server branch
  therefore returns only `result` and maps invocation failures to a generic
  error. Production WebApp `16740` is deployed; a real desktop-generated
  pairing code is still required for the final phone-to-Mac conversation
  smoke test. Production task `16739` was not modified.

- A single `exchange` operation that combines push/pull/ack. Phase 2 should
  negotiate that capability with an isolated/test task before changing any
  production task. Target budget is about 2 phone QPS + 2 Host QPS (about 4
  QPS total), with hidden tabs stopped or heavily downshifted.
- Relay long-tail behavior under the target task and whether mailbox ack state
  can outlive message bodies. The client therefore uses optimistic admission,
  retries, and snapshot recovery rather than waiting for a missing sequence.

## Phases and targets

1. **Slice (this change):** ACP chat, prompt/queue/send-now, permissions,
   cancel, gap→snapshot recovery, foreground recovery, persistent outbox,
   idempotent pairing redemption with bounded retry, ACP-only phone navigation,
   and relay visibility policy.
2. **Transport consolidation:** negotiate an isolated task capability for one
   `exchange`; target phone/Host polling near 2 QPS each, coalesce deltas, and
   send control-plane transitions immediately.
3. **Pairing and operations:** explicit host online state; session snapshot
   schema/versioning; recovery metrics; and operational pairing diagnostics.
   The local idempotent redemption slice is complete, but production release
   still requires the isolated AutoMate credential-path experiment described
   above.

Experience targets (platform tails are handled with optimistic UI and retry):

- existing session visible in 1–2 s;
- prompt admission at Host in 0.3–1 s;
- update visible on phone in 0.5–1 s;
- foreground recovery in 1–2 s;
- Host restart online in 2–5 s.

The rollback path is to disable the new phone route/client wiring and retain
the existing direct transport and AutoMate relay fallback. No production
AutoMate task, production database, or terminal Host capability is changed by
this document.
