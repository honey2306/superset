# Host application and client boundaries

Host business operations live under `src/application/`. The agent launch,
project management, workspace creation/materialization and workspace cleanup
operations are independent of tRPC. Routers validate input and apply transport
authentication, then call those operations. Automation dispatch and provisioning
call the same agent/workspace operations directly. `HostOperationError` carries
an application failure code and optional structured cause; the common tRPC
middleware translates it without discarding cleanup/setup details.

Existing Git, terminal and task runtime modules continue to own their locks,
processes and persistence. This change does not move all Host features into a
single application object or introduce a second database.

## Execution runs

`@superset/host-contract/runs` defines `ExecutionRun` and a reference containing
both `kind` and `id`. `application/runs/RunService` reads each authoritative owner
and exposes `runs.list`, `runs.get`, `runs.cancel` and `runs.pause`. Listing is
workspace scoped, bounded, and ordered across all included sources. Every read
reconstructs state; there is no process-local Run cache to invalidate on restart.

| Owner | Completion policy | Recovery | Stop authority |
| --- | --- | --- | --- |
| Task | Verification / explicit acceptance and configured delivery | Existing Task runner reconciliation | Task runner owns pause/cancel and resource release |
| Automation | Durable dispatch acknowledgement | Existing dispatch record | No authority over later turns in the launched conversation |
| Discussion | Coordinator rounds and final positions | Active records become failed if the ACP daemon restarts | Coordinator cancels its participants |

Automation `dispatched` is a separate terminal status and result variant. It
never means that the agent's work was accepted. Terminal runs are safe to cancel
again: the service returns the existing record without touching a reused
session. Unsupported actions produce `PRECONDITION_FAILED`. Existing task and
discussion endpoints remain compatible; Desktop stop actions use the shared Run
endpoint. Discussion history can now be retrieved by id after coordinator
restart, including terminal records outside the recent listing window. When a retained older
daemon does not support lookup by id, the service reads its existing durable record
without restarting a process that may own a pending interaction.

## Conversation ingress

`@superset/session-protocol` owns versioned `ConversationEvent` and
`PermissionInteraction` types. Host ingress records semantic events after
artifact bounding and retains the original ACP update alongside them. The fold
uses semantic event kinds for messages, tools, plans and session metadata.
Provider-specific stream merging, terminal metadata and parent relationships are
recognized in `session-protocol/src/compat/`; Desktop and phone use the same
permission/plan interpretation. Tool display normalization also lives in this
compatibility adapter because partial legacy tool updates still need merging.

Historical journals without semantic events pass through the same adapter at
read time. Unsupported semantic versions fall back to the retained ACP payload.
No journal migration is required. A historical artifact rewrite drops its stale
derived event so replay uses the newly bounded raw payload. ACP content blocks,
tool fields and commands are still supported protocol types; introducing these
events does not rename the existing ACP API or remove raw diagnostics.

## Portable contracts and clients

Clients import `@superset/host-contract`, never Host implementation source. The
package owns catalog/provisioning/event/settings/error/Run contracts. Its
`router.generated.ts` is a structural wire snapshot of the actual tRPC router,
with no imports of Host runtime or database types. Generate it after changing a
public procedure:

```sh
bun run --cwd packages/host-service generate:contract
bun run --cwd packages/host-service check:contract
```

The generator fails on Host type errors and non-wire function types. Host
`typecheck` also checks snapshot drift. The portable package typechecks with
browser libraries and no ambient Node types. The old four-package `dist-types`
build workaround is removed. Dependency direction tests prevent application
code from importing routers and portable clients from importing Host source.

`@superset/host-client` owns superjson tRPC links, live credential callbacks,
session command mappings and WebSocket URL construction. Desktop, phone Web,
CLI and workspace-client consume it. Platform concerns remain at the edges:
phone durable outbox/relay fetch, CLI manifest/token lookup, Desktop connection
caching, and React Query policy. The existing session controller continues to
own cursor reconciliation and reconnect behavior.

## Verification

The change is covered by application and cleanup tests, Run cancellation and
restart fixtures, old/new semantic replay comparisons, adapter subprocess and
WebSocket regression tests, and single/batch-stream SDK HTTP compatibility tests.
All fixtures use temporary databases and repositories. They do not verify live
provider credentials or replace a user-driven Desktop/phone UI check.
